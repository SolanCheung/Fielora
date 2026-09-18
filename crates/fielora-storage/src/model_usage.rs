//! Read-only product projection of the existing Harness ledger. No billing ledger.
use super::*;
use std::collections::BTreeMap;

fn add(target: &mut TaskTokenUsage, value: &TaskTokenUsage) {
    target.input_tokens = target.input_tokens.saturating_add(value.input_tokens);
    target.output_tokens = target.output_tokens.saturating_add(value.output_tokens);
    target.reported_calls += value.reported_calls;
    target.unreported_calls += value.unreported_calls;
}

impl StorageHandle {
    pub fn model_usage_report(
        &self,
        request: ModelUsageReportRequest,
    ) -> Result<ModelUsageReport, DomainError> {
        if !(1..=100).contains(&request.limit)
            || request.offset > 1_000_000
            || request
                .since
                .is_some_and(|v| !(0..=8_640_000_000_000_000).contains(&v))
        {
            return Err(DomainError::Validation("MODEL_USAGE_QUERY_INVALID".into()));
        }
        let owner = self.local_user.clone();
        request_task(&self.sender, move |connection| {
            report(connection, &owner.0, request)
        })
    }
}

fn report(
    connection: &Connection,
    owner: &str,
    request: ModelUsageReportRequest,
) -> Result<ModelUsageReport, DomainError> {
    let mut tasks = BTreeMap::<String, ModelUsageTask>::new();
    let mut daily = BTreeMap::<String, TaskTokenUsage>::new();
    let mut models = BTreeMap::<(String, String), TaskTokenUsage>::new();
    let mut usage = TaskTokenUsage::default();
    // Dates describe the actual receipt time (UTC), not when the task began.
    // JSON numeric validation prevents malformed legacy data from becoming usage.
    let mut statement = connection.prepare(
        "SELECT r.id,r.conversation_id,substr(r.task,1,180),r.provider_config_id,r.model_id,r.status,r.created_at,
         strftime('%Y-%m-%d',e.created_at/1000,'unixepoch'),
         SUM(CASE WHEN json_type(e.payload_json,'$.usage.input_tokens')='integer' AND json_extract(e.payload_json,'$.usage.input_tokens')>=0 THEN json_extract(e.payload_json,'$.usage.input_tokens') ELSE 0 END),
         SUM(CASE WHEN json_type(e.payload_json,'$.usage.output_tokens')='integer' AND json_extract(e.payload_json,'$.usage.output_tokens')>=0 THEN json_extract(e.payload_json,'$.usage.output_tokens') ELSE 0 END),
         SUM(CASE WHEN e.id IS NOT NULL AND json_type(e.payload_json,'$.usage.input_tokens')='integer' AND json_extract(e.payload_json,'$.usage.input_tokens')>=0 AND json_type(e.payload_json,'$.usage.output_tokens')='integer' AND json_extract(e.payload_json,'$.usage.output_tokens')>=0 THEN 1 ELSE 0 END),
         COUNT(e.id)
         FROM agent_runs r JOIN fields f ON f.id=r.field_id
         LEFT JOIN agent_events e ON e.run_id=r.id AND (e.kind IN ('MODEL_COMPLETED','MODEL_FAILED') OR (e.kind='CHECKPOINT_CREATED' AND json_extract(e.payload_json,'$.kind')='MODEL_RETRY')) AND (?2 IS NULL OR e.created_at>=?2)
         WHERE f.owner_principal_id=?1 AND r.task NOT LIKE '[HUMAN_COMMAND %' AND (e.id IS NOT NULL OR ?2 IS NULL OR r.created_at>=?2)
         GROUP BY r.id,strftime('%Y-%m-%d',e.created_at/1000,'unixepoch')"
    ).map_err(storage_domain)?;
    let rows = statement
        .query_map(params![owner, request.since], |row| {
            let reported = row.get::<_, i64>(10)? as u64;
            Ok((
                ModelUsageTask {
                    run_id: AgentRunId::new(row.get::<_, String>(0)?),
                    conversation_id: ConversationId::new(row.get::<_, String>(1)?),
                    title: row.get(2)?,
                    provider_config_id: ProviderConfigId::new(row.get::<_, String>(3)?),
                    model_id: row.get(4)?,
                    status: parse_wire(row.get::<_, String>(5)?)?,
                    created_at: row.get(6)?,
                    usage: TaskTokenUsage {
                        input_tokens: row.get::<_, i64>(8)? as u64,
                        output_tokens: row.get::<_, i64>(9)? as u64,
                        reported_calls: reported,
                        unreported_calls: (row.get::<_, i64>(11)? as u64).saturating_sub(reported),
                    },
                },
                row.get::<_, Option<String>>(7)?,
            ))
        })
        .map_err(storage_domain)?;
    for row in rows {
        let (task, date) = row.map_err(storage_domain)?;
        add(&mut usage, &task.usage);
        add(
            models
                .entry((task.provider_config_id.0.clone(), task.model_id.clone()))
                .or_default(),
            &task.usage,
        );
        if let Some(date) = date {
            add(daily.entry(date).or_default(), &task.usage);
        }
        if let Some(existing) = tasks.get_mut(&task.run_id.0) {
            add(&mut existing.usage, &task.usage);
        } else {
            tasks.insert(task.run_id.0.clone(), task);
        }
    }
    let mut tasks = tasks.into_values().collect::<Vec<_>>();
    tasks.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.run_id.0.cmp(&a.run_id.0))
    });
    // Active execution is independent of the selected history range.
    let mut active_query = connection.prepare("SELECT r.id,r.conversation_id,substr(r.task,1,180),r.provider_config_id,r.model_id,r.status,r.created_at FROM agent_runs r JOIN fields f ON f.id=r.field_id WHERE f.owner_principal_id=?1 AND r.task NOT LIKE '[HUMAN_COMMAND %' AND r.status IN ('QUEUED','RUNNING','WAITING_APPROVAL') ORDER BY r.created_at DESC LIMIT 100").map_err(storage_domain)?;
    let active = active_query
        .query_map([owner], |row| {
            Ok(ModelUsageTask {
                run_id: AgentRunId::new(row.get::<_, String>(0)?),
                conversation_id: ConversationId::new(row.get::<_, String>(1)?),
                title: row.get(2)?,
                provider_config_id: ProviderConfigId::new(row.get::<_, String>(3)?),
                model_id: row.get(4)?,
                status: parse_wire(row.get::<_, String>(5)?)?,
                created_at: row.get(6)?,
                usage: TaskTokenUsage::default(),
            })
        })
        .map_err(storage_domain)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_domain)?;
    Ok(ModelUsageReport {
        total_tasks: tasks.len().min(u32::MAX as usize) as u32,
        tasks: tasks
            .into_iter()
            .skip(request.offset as usize)
            .take(request.limit as usize)
            .collect(),
        active,
        usage,
        models: models
            .into_iter()
            .map(|((provider, model_id), usage)| ModelUsageGroup {
                provider_config_id: ProviderConfigId::new(provider),
                model_id,
                usage,
            })
            .collect(),
        daily: daily
            .into_iter()
            .map(|(date, usage)| ModelUsageDay { date, usage })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_projection_preserves_model_owner_date_and_missing_receipts() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE fields(id TEXT,owner_principal_id TEXT); CREATE TABLE agent_runs(id TEXT,field_id TEXT,conversation_id TEXT,task TEXT,provider_config_id TEXT,model_id TEXT,status TEXT,created_at INTEGER); CREATE TABLE agent_events(id TEXT,run_id TEXT,kind TEXT,payload_json TEXT,created_at INTEGER); INSERT INTO fields VALUES('ours','owner'),('theirs','other'); INSERT INTO agent_runs VALUES('a','ours','conversation','First task','provider-a','same','PAUSED',1000),('b','ours','conversation','Second task','provider-b','same','RUNNING',2000),('c','theirs','secret','Private task','provider-a','same','RUNNING',3000),('d','ours','conversation','No receipt','provider-a','same','QUEUED',4000);").unwrap();
        db.execute("INSERT INTO agent_runs VALUES('manual','ours','conversation','[HUMAN_COMMAND terminal]','provider-a','same','RUNNING',4000)",[]).unwrap();
        for (id, run, kind, value, at) in [
            (
                "1",
                "a",
                "MODEL_COMPLETED",
                serde_json::json!({"step":1,"usage":{"input_tokens":100,"output_tokens":20}}),
                1000,
            ),
            // A resumed step is another actual receipt, not a replacement or double count.
            (
                "2",
                "a",
                "MODEL_COMPLETED",
                serde_json::json!({"step":1,"usage":{"input_tokens":30,"output_tokens":10}}),
                86_401_000,
            ),
            (
                "3",
                "a",
                "MODEL_COMPLETED",
                serde_json::json!({"usage":null}),
                86_402_000,
            ),
            (
                "4",
                "b",
                "MODEL_COMPLETED",
                serde_json::json!({"usage":{"input_tokens":0,"output_tokens":0}}),
                2000,
            ),
            (
                "5",
                "b",
                "MODEL_COMPLETED",
                serde_json::json!({"usage":{"input_tokens":-20,"output_tokens":"50"}}),
                3000,
            ),
            (
                "6",
                "c",
                "MODEL_COMPLETED",
                serde_json::json!({"usage":{"input_tokens":9000,"output_tokens":9000}}),
                3000,
            ),
            (
                "7",
                "a",
                "CHECKPOINT_CREATED",
                serde_json::json!({"kind":"MODEL_RETRY"}),
                4000,
            ),
            ("8", "a", "MODEL_FAILED", serde_json::json!({}), 5000),
            (
                "9",
                "a",
                "STEP_STARTED",
                serde_json::json!({"usage":{"input_tokens":9999,"output_tokens":9999}}),
                5000,
            ),
        ] {
            db.execute(
                "INSERT INTO agent_events VALUES(?1,?2,?3,?4,?5)",
                params![id, run, kind, value.to_string(), at],
            )
            .unwrap();
        }
        let read = |since, offset, limit| {
            report(
                &db,
                "owner",
                ModelUsageReportRequest {
                    since,
                    offset,
                    limit,
                },
            )
            .unwrap()
        };
        let all = read(None, 0, 20);
        assert_eq!(all.total_tasks, 3);
        assert_eq!(
            all.usage,
            TaskTokenUsage {
                input_tokens: 130,
                output_tokens: 30,
                reported_calls: 3,
                unreported_calls: 4
            }
        );
        assert_eq!(all.models.len(), 2);
        assert_eq!(all.models[1].usage.reported_calls, 1); // Real zero remains a reported call.
        assert_eq!(all.daily.len(), 2);
        assert_eq!(all.active.len(), 2);
        assert!(
            !serde_json::to_string(&all)
                .unwrap()
                .contains("Private task")
        );
        let next = read(None, 1, 1);
        assert_eq!(next.tasks[0].run_id.0, "b");
        assert_eq!(next.usage, all.usage); // Pagination never limits totals/charts.
        assert_eq!(read(None, 99, 20).tasks.len(), 0);
        let later = read(Some(86_400_000), 0, 20);
        assert_eq!(later.total_tasks, 1);
        assert_eq!(later.usage.input_tokens, 30);
        assert_eq!(later.active.len(), 2); // Active model isn't hidden by date filtering.
        assert_eq!(read(None, 0, 20), all); // Re-reading immutable events cannot accumulate twice.
    }
}
