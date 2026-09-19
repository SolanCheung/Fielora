//! Bounded Harness work tracking; tool facts never promote model claims to truth.
use fielora_contracts::{AgentEventKind, AgentToolCallView, AgentToolEffect, AgentToolStatus};
use fielora_model::AgentModelMessage;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Default)]
pub(crate) struct WorkProgress {
    seen: HashSet<String>,
    inspected_tools: usize,
    read_ranges: HashMap<String, Vec<(u64, u64)>>,
    search_locations: HashSet<String>,
    pub stalled_turns: u32,
    pub model_note: String,
    recent_gains: VecDeque<bool>,
    last_finish_tool_count: Option<usize>,
    unchanged_finish_attempts: u32,
}

impl WorkProgress {
    pub fn restored(tools: &[AgentToolCallView]) -> Self {
        let mut state = Self::default();
        state.observe(tools);
        state.stalled_turns = 0;
        state
    }

    pub fn observe(&mut self, tools: &[AgentToolCallView]) {
        let mut gained = false;
        let mut observed = false;
        for tool in tools.iter().skip(self.inspected_tools) {
            if !matches!(
                tool.status,
                AgentToolStatus::Completed | AgentToolStatus::Failed
            ) {
                continue;
            }
            observed = true;
            let receipt = tool.receipt.as_ref();
            let signature =
                if tool.name == "browser" && receipt.is_some_and(|r| r["page_loaded"] == true) {
                    // Observing/reloading the same rendered state is not new work.
                    // Input freshness IDs remain mandatory for execution, but do
                    // not belong in the progress identity.
                    json!([tool.name, receipt.map(stable_observation)])
                } else if tool.name == "search_text"
                    && receipt.is_some_and(|r| r["matched_locations_sha256"].is_string())
                {
                    json!([
                        tool.name,
                        receipt.unwrap()["matched_locations_sha256"],
                        receipt.unwrap()["files"]
                    ])
                } else if tool.name == "run_command"
                    && matches!(
                        tool.error_code.as_deref(),
                        Some("AGENT_TOOL_IS_NOT_PROGRAM" | "AGENT_PROGRAM_NOT_FOUND")
                    )
                {
                    // Different queries cannot make a nonexistent executable available.
                    json!([tool.name, tool.arguments["program"], tool.error_code])
                } else {
                    json!([
                        tool.name,
                        tool.arguments,
                        receipt.map(stable_observation),
                        tool.error_code
                    ])
                };
            let mut novel = self.seen.insert(format!(
                "{:x}",
                Sha256::digest(signature.to_string().as_bytes())
            ));
            if tool.name == "browser"
                && let Some(hash) = receipt.and_then(|r| r["screenshot"]["content_sha256"].as_str())
            {
                // A canvas can change with no DOM change. Keep actual pixel
                // changes, rather than each capture's newly generated ID.
                novel |= self.seen.insert(format!("browser-pixels:{hash}"));
            }
            if tool.name == "search_text"
                && let Some(r) = receipt
                && let Some(locations) = r["matched_locations"].as_array()
            {
                novel = false;
                for location in locations {
                    let Some(path) = location["path"].as_str() else {
                        continue;
                    };
                    let Some(hash) = r["files"][path].as_str() else {
                        continue;
                    };
                    novel |= self.search_locations.insert(
                        json!([
                            path,
                            hash,
                            location["line"],
                            location["byte_start"],
                            location["byte_end"]
                        ])
                        .to_string(),
                    );
                }
            }
            if tool.name == "read_file"
                && tool.status == AgentToolStatus::Completed
                && let Some(r) = receipt
                && let (Some(path), Some(hash)) = (r["path"].as_str(), r["sha256"].as_str())
            {
                // New receipts describe exactly the consumed bytes, including a
                // partial minified line. Legacy receipts keep their line units.
                let range = if let (Some(start), Some(end)) =
                    (r["byte_start"].as_u64(), r["byte_end"].as_u64())
                {
                    (end > start).then_some(("bytes", start, end.saturating_sub(1)))
                } else {
                    r["line_start"]
                        .as_u64()
                        .zip(
                            r.get("observed_line_end")
                                .unwrap_or(&r["line_end"])
                                .as_u64(),
                        )
                        .filter(|(start, end)| end >= start)
                        .map(|(start, end)| ("lines", start, end))
                };
                if let Some((unit, start, end)) = range {
                    let ranges = self
                        .read_ranges
                        .entry(format!("{path}:{hash}:{unit}"))
                        .or_default();
                    let mut cursor = start;
                    ranges.sort_unstable();
                    for &(a, b) in ranges.iter() {
                        if a > cursor {
                            break;
                        }
                        if b >= cursor {
                            cursor = b.saturating_add(1);
                        }
                    }
                    novel = cursor <= end;
                    ranges.push((start, end));
                }
            }
            let empty_search = tool.name == "search_text"
                && (receipt.is_some_and(|r| r["matches"] == 0)
                    || tool.error_code.as_deref() == Some("AGENT_SEARCH_SYNTAX_AMBIGUOUS"));
            // A plan is retained guidance, not evidence of task progress.
            novel &= !empty_search && tool.name != "work_plan";
            gained |= novel;
            self.recent_gains.push_back(novel);
            if self.recent_gains.len() > 12 {
                self.recent_gains.pop_front();
            }
        }
        self.inspected_tools = tools.len();
        self.stalled_turns = if gained {
            0
        } else if observed {
            self.stalled_turns.saturating_add(1)
        } else {
            self.stalled_turns
        };
    }

    pub fn checkpoint(
        &self,
        tools: &[AgentToolCallView],
        step: u32,
        wrote: bool,
        verified: bool,
    ) -> Value {
        let facts = tools
            .iter()
            .rev()
            .take(16)
            .map(|tool| {
                json!({
                    "tool_call_id":tool.id, "name":tool.name, "status":tool.status,
                    "path":tool.arguments.get("path"), "error_code":tool.error_code,
                    "query":tool.arguments.get("query"), "queries":tool.arguments.get("queries"),
                    "receipt":tool.receipt.as_ref().map(compact_receipt),
                    "recovery":tool.error_code.as_deref().and_then(recovery_instruction),
                })
            })
            .collect::<Vec<_>>();
        json!({
            "kind":"GENERAL_WORK_STATE_V1", "step":step,
            "evidence_source":"DURABLE_TOOL_RECEIPTS", "recent_tool_facts":facts,
            "total_tools":tools.len(), "stalled_turns":self.stalled_turns,
            "observation_repetition":self.needs_search_replan(),
            "unchanged_finish_attempts":self.unchanged_finish_attempts,
            "workspace_changed":wrote, "verification_passed":verified,
            "work_plan":crate::agent_work_plan::projection(tools),
            "remaining_work":if wrote && !verified { "VERIFY_CURRENT_WORKSPACE" } else { "ESTABLISH_USER_GOAL_RESULT" },
            "model_assessment_unverified":self.model_note.chars().take(2400).collect::<String>(),
            "historical_browser_operations":crate::agent_browser::continuity_facts(tools),
        })
    }

    pub fn needs_search_replan(&self) -> bool {
        self.recent_gains.len() >= 8
            && self.recent_gains.iter().filter(|gained| !**gained).count() >= 5
    }

    pub fn diagnostic_context(&self, tools: &[AgentToolCallView], task: &str) -> Option<String> {
        if self.stalled_turns < 3 && !self.needs_search_replan() {
            return None;
        }
        let mut reads = std::collections::BTreeMap::<String, (Value, usize)>::new();
        let mut searches = std::collections::BTreeMap::<String, (Value, usize)>::new();
        for tool in tools {
            if tool.name == "read_file"
                && tool.status == AgentToolStatus::Completed
                && let Some(r) = &tool.receipt
            {
                let key = json!([r["path"], r["sha256"]]).to_string();
                let entry = reads.entry(key).or_insert_with(|| {
                    (
                        json!({"path":r["path"],
                    "sha256":r["sha256"],"first_tool_call_id":tool.id}),
                        0,
                    )
                });
                entry.1 += 1;
            } else if tool.name == "search_text" {
                let mut args = tool.arguments.clone();
                if let Some(args) = args.as_object_mut() {
                    args.remove("max_results");
                }
                let entry = searches.entry(args.to_string()).or_insert_with(|| {
                    (
                        json!({
                    "arguments":args,"first_tool_call_id":tool.id}),
                        0,
                    )
                });
                entry.1 += 1;
                entry.0["last_error"] = json!(tool.error_code);
                entry.0["last_result"] = tool
                    .receipt
                    .as_ref()
                    .map(compact_receipt)
                    .unwrap_or(Value::Null);
            }
        }
        let repeated = |items: std::collections::BTreeMap<String, (Value, usize)>| {
            let mut items = items
                .into_values()
                .filter(|(_, count)| *count > 1)
                .collect::<Vec<_>>();
            items.sort_by_key(|item| std::cmp::Reverse(item.1));
            items
                .into_iter()
                .take(6)
                .map(|(mut fact, count)| {
                    fact["calls"] = json!(count);
                    fact
                })
                .collect::<Vec<_>>()
        };
        let browser_required = crate::agent_browser::requires_browser(task, tools);
        let has_browser = tools.iter().any(|tool| {
            tool.name == "browser"
                && tool.status == AgentToolStatus::Completed
                && tool.receipt.as_ref().is_some_and(|r| {
                    r["success"] != false
                        && (r["page_loaded"] == true || r["snapshot_id"].is_string())
                })
        });
        let last_page = tools
            .iter()
            .rev()
            .filter(|t| t.name == "browser")
            .filter_map(|t| t.receipt.as_ref())
            .find(|r| r["text"].is_string());
        let facts = json!({"source":"DURABLE_TOOL_RECEIPTS_NOT_MODEL_DIAGNOSIS",
            "repeated_file_versions":repeated(reads),"repeated_queries":repeated(searches),
            "recent_observations_without_new_evidence":self.recent_gains.iter().filter(|gain| !**gain).count(),
            "current_run_browser_observed":has_browser,
            "last_rendered_observation":last_page.map(browser_text_excerpt)});
        let next = if browser_required && !has_browser {
            "The user explicitly requested browser verification and no current-run page observation exists. Use the browser for that acceptance requirement. If access is blocked, report the concrete missing action. Do not reread unchanged source to claim rendered verification."
        } else if !has_browser {
            "Resolve the current user request. For questions about earlier attempts, inspect the historical run index and read_run_history, then answer from recorded outcomes; do not turn the investigation into an edit. If the current request calls for implementation, use current source evidence to isolate the discrepancy. For labels, resolve the actual translation/filter values and bindings, then apply the narrow edit and a targeted requirement check. Do not start a website merely because this is UI code. If current code already satisfies the task, verify that instead of inventing an edit."
        } else {
            "Use the rendered observation already obtained. Repeated inspect/screenshot/reload without changed content is not new evidence. If rendered labels disagree with source literals, trace the actual binding and translation/filter lookup; use read_file.json_pointers for specific JSON keys instead of repeatedly reading the whole minified dictionary; do not assume cache or add data fields without evidence. Choose a check that distinguishes the remaining causes. A failed check requires repair, not another declaration that the source looks correct."
        };
        Some(format!(
            "{DIAGNOSTIC_CONTEXT_MARKER}{facts}\nThese are historical observations, not current rendered verification. Repeated reads may be needed after context reduction, but add no new evidence for the diagnosis. {next}\nA different actionable check should continue this task; this feedback does not require a plan, grant completion or change the resource allowance."
        ))
    }

    pub fn unfinished_attempt(&mut self, tool_count: usize) -> bool {
        self.unchanged_finish_attempts = if self.last_finish_tool_count == Some(tool_count) {
            self.unchanged_finish_attempts + 1
        } else {
            1
        };
        self.last_finish_tool_count = Some(tool_count);
        // This detects unchanged premature conclusions, not a task-length limit.
        self.unchanged_finish_attempts >= 3
    }
}

pub(crate) fn goal_progress(
    task: &str,
    tools: &[AgentToolCallView],
    wrote: bool,
    verified: bool,
    requires_action: bool,
    requires_verification: bool,
) -> Value {
    let unknown = tools
        .iter()
        .any(|tool| tool.status == AgentToolStatus::Unknown);
    let status = if unknown {
        "RECOVERY_REQUIRED"
    } else if verified {
        "READY_TO_FINALIZE"
    } else if tools
        .iter()
        .rev()
        .find(|tool| {
            tool.name == "browser_verify"
                || tool
                    .receipt
                    .as_ref()
                    .is_some_and(|r| r["verification_eligible"] == true)
        })
        .is_some_and(|tool| {
            tool.status != AgentToolStatus::Completed
                || tool.receipt.as_ref().is_some_and(|r| r["success"] == false)
        })
    {
        "REPAIRING"
    } else if wrote {
        "AWAITING_VERIFICATION"
    } else if tools.is_empty() {
        "UNDERSTANDING"
    } else {
        "DIAGNOSING"
    };
    let mut remaining = vec![];
    if unknown {
        remaining.push("RECONCILE_UNKNOWN_OUTCOME");
    }
    if requires_action && !wrote && !verified {
        remaining.push("ESTABLISH_REQUESTED_RESULT");
    }
    if requires_verification && !verified {
        remaining.push("VERIFY_CURRENT_RESULT_AGAINST_REQUIREMENT");
    }
    let plan = tools
        .iter()
        .rev()
        .find(|tool| tool.name == "browser_plan" && tool.status == AgentToolStatus::Completed);
    json!({"objective":task,"status":status,"workspace_changed":wrote,"result_verified":verified,
        "remaining_requirements":remaining,
        "proposed_browser_checks":plan.and_then(|tool|tool.arguments.get("cases")),
        "check_definition_source":"MODEL_PROPOSAL_NOT_USER_REQUIREMENTS",
        "completion_authority":"CURRENT_TOOL_EVIDENCE","model_assessment_is_evidence":false})
}

fn stable_observation(receipt: &Value) -> Value {
    let mut receipt = receipt.clone();
    if let Some(fields) = receipt.as_object_mut() {
        // Keep arbitrary result facts, including stdout/stderr hashes. Timing
        // and provider metadata do not make an unchanged result informative.
        for key in ["duration_ms", "execution_source", "tool_call_id"] {
            fields.remove(key);
        }
        if fields.get("kind").is_some_and(|kind| kind == "BROWSER") {
            for key in [
                "snapshot_id",
                "page_id",
                "navigation_generation",
                "screenshot",
                "action",
                "input_state",
                "scroll_performed",
                "click_point",
            ] {
                fields.remove(key);
            }
            if let Some(elements) = fields.get_mut("elements").and_then(Value::as_array_mut) {
                for element in elements {
                    if let Some(fields) = element.as_object_mut() {
                        fields.remove("ref");
                    }
                }
            }
        }
    }
    receipt
}

// Preserve actual rendered evidence during reduction. Browser ToolResults put
// content in the receipt (once); the Observation section is only a trust note.
// Keep both ends since dialogs often follow the background document in DOM order.
fn browser_text_excerpt(receipt: &Value) -> String {
    let text = receipt["text"].as_str().unwrap_or_default();
    let chars = text.chars().collect::<Vec<_>>();
    if chars.len() <= 2400 {
        return text.to_owned();
    }
    format!(
        "{}\n[rendered text excerpt truncated]\n{}",
        chars[..800].iter().collect::<String>(),
        chars[chars.len() - 1600..].iter().collect::<String>()
    )
}

fn compact_receipt(receipt: &Value) -> Value {
    let mut result = serde_json::Map::new();
    for key in [
        "kind",
        "path",
        "sha256",
        "before_sha256",
        "after_sha256",
        "line_start",
        "line_end",
        "observed_line_end",
        "read_mode",
        "json_pointers",
        "missing_pointers",
        "byte_start",
        "byte_end",
        "next_byte_offset",
        "output_sha256",
        "exit_code",
        "stdout_sha256",
        "stderr_sha256",
        "artifact_id",
        "artifact_revision_id",
        "matches",
        "match_mode",
        "skipped_files",
        "truncated",
        "success",
        "error_code",
        "recovery",
        "guidance",
        "rendered_error_excerpt",
        "status",
        "action",
        "readiness",
        "process_tracking",
        "url",
        "requested_url",
        "committed_url",
        "network_error",
        "page_loaded",
        "content_state",
        "document_state",
        "has_password_input",
        "observation_state",
        "user_action_required",
        "historical_only",
        "verification_eligible",
        "history",
    ] {
        if let Some(value) = receipt.get(key) {
            result.insert(key.into(), value.clone());
        }
    }
    Value::Object(result)
}

pub(crate) fn recovery_instruction(code: &str) -> Option<&'static str> {
    match code {
        "AGENT_WORK_PLAN_REQUIRED"
        | "AGENT_WORK_SCOPE_MISMATCH"
        | "AGENT_WORK_PLAN_AMENDMENT_REQUIRED"
        | "AGENT_WORK_QUOTE_MISMATCH"
        | "AGENT_WORK_EVIDENCE_STALE"
        | "AGENT_WORK_EVIDENCE_REQUIRED" => Some(
            "Historical planning failure: work_plan is now optional advisory intent, not a write allowlist. Do not retry the old planning loop. Compare current changes against the original user requirement, repair only actual differences and run acceptance checks. Evidence issues do not waive guarded-write hashes or verification.",
        ),
        "AGENT_TEXT_MATCH_FAILED" => Some(
            "Exact text matching failed. If the guarded hash is still current, use the already-read line numbers with apply_patches.line_edits. Do not repeat the same replacement or reread solely to obtain the same hash.",
        ),
        "AGENT_FILE_CHANGED" | "AGENT_STALE_SHA" => Some(
            "The file changed. Read only the affected range and its current hash, then rebuild the edit against that evidence; never reuse a stale guard.",
        ),
        "AGENT_TOOL_IS_NOT_PROGRAM" => Some(
            "A tool ID was passed as an OS executable. Use the actual admitted tool directly or inspect capability_status. If unavailable, request the missing source with request_user_input. Do not retry the same fake executable with another query or guess a repository.",
        ),
        "AGENT_PROGRAM_NOT_FOUND"
        | "AGENT_PROGRAM_ACCESS_DENIED"
        | "AGENT_PROGRAM_START_FAILED" => Some(
            "No process started. Inspect the precise launch failure and available Windows executables. Do not retry a missing program with changed arguments, treat this as a remote URL response, or invent sources. Ask for required information with request_user_input if needed.",
        ),
        "AGENT_COMMAND_FAILED" | "AGENT_VERIFICATION_REQUIRED" => Some(
            "Inspect the failed check and repair its cause. A command invocation is not a passing verification; verify the current workspace again.",
        ),
        _ => None,
    }
}

/// A process/network receipt can satisfy a requested action without a file edit.
/// Merely observing files cannot satisfy an implementation request.
pub(crate) fn has_completed_action(tools: &[AgentToolCallView]) -> bool {
    tools.iter().any(|tool| {
        tool.status == AgentToolStatus::Completed
            && tool.effect != AgentToolEffect::Observe
            && tool.receipt.as_ref().is_some_and(|receipt| {
                receipt
                    .get("exit_code")
                    .is_none_or(|code| code.as_i64() == Some(0))
            })
    })
}

pub(crate) const DIAGNOSTIC_CONTEXT_MARKER: &str = "FIELORA_DIAGNOSTIC_OBSERVATIONS_V1\n";

pub(crate) const REPLAN_INSTRUCTION: &str = "Recent tool actions repeat already-observed results. This is a repetition signal, not proof that the task is blocked. Replan now: separate confirmed facts from hypotheses, state what was ruled out and which different observation would distinguish the remaining causes. A failed check can provide useful information. Choose a different, targeted action, and continue within the existing scope. If no viable next action exists, identify the concrete blocker; do not claim completion.";

/// Overall resource accounting is independent of checkpoints and task success.
/// Rebuilt from the existing event ledger, including after app restart.
#[derive(Default, Debug)]
pub(crate) struct RunResources {
    pub cursor: u64,
    execution_ms: u64,
    input_tokens: u64,
    output_tokens: u64,
}

impl RunResources {
    pub fn observe(&mut self, kind: AgentEventKind, payload: &Value) {
        if kind == AgentEventKind::RunResumed
            && payload["resource_budget_reset"]["source"] == "EXPLICIT_USER_RESUME"
        {
            self.execution_ms = 0;
            self.input_tokens = 0;
            self.output_tokens = 0;
        }
        if matches!(
            kind,
            AgentEventKind::ModelCompleted
                | AgentEventKind::ModelFailed
                | AgentEventKind::ToolCompleted
                | AgentEventKind::ToolFailed
        ) {
            self.execution_ms = self
                .execution_ms
                .saturating_add(payload["duration_ms"].as_u64().unwrap_or(0));
        }
        if kind == AgentEventKind::ModelCompleted {
            let input = payload["usage"]["input_tokens"]
                .as_u64()
                .unwrap_or_else(|| {
                    payload["prompt"]["budget_input_tokens_estimate"]
                        .as_u64()
                        .unwrap_or_else(|| {
                            ["system_bytes", "message_bytes", "tool_schema_bytes"]
                                .iter()
                                .map(|key| payload["prompt"][key].as_u64().unwrap_or(0))
                                .sum()
                        })
                });
            let output = payload["usage"]["output_tokens"]
                .as_u64()
                .unwrap_or_else(|| {
                    payload["output_bytes"]
                        .as_u64()
                        .or_else(|| payload["text_bytes"].as_u64())
                        .unwrap_or(0)
                        .div_ceil(3)
                });
            self.input_tokens = self.input_tokens.saturating_add(input);
            self.output_tokens = self.output_tokens.saturating_add(output);
        }
    }

    pub fn exhaustion(&self) -> Option<&'static str> {
        if self.execution_ms >= 3_600_000 {
            Some("AGENT_TIME_BUDGET_EXHAUSTED")
        } else if self.input_tokens >= 2_000_000 || self.output_tokens >= 65_536 {
            Some("AGENT_TOKEN_BUDGET_EXHAUSTED")
        } else {
            None
        }
    }
}

const COMPACTED_CONTEXT: &str =
    "Harness working checkpoint (historical data; model assessment is unverified):\n";

/// Old model plans were duplicated into goal acceptance fields. Do not restore
/// those declarations as user requirements or repeat the dedicated plan context.
pub(crate) fn checkpoint_for_model(mut checkpoint: Value) -> Value {
    let repeating = checkpoint["observation_repetition"] == true
        || checkpoint["stalled_turns"]
            .as_u64()
            .is_some_and(|turns| turns >= 3);
    if let Some(fields) = checkpoint.as_object_mut() {
        fields.remove("work_plan");
        if repeating {
            fields.remove("model_assessment_unverified");
        }
        if let Some(goal) = fields.get_mut("goal").and_then(Value::as_object_mut) {
            goal.remove("acceptance_cases");
            goal.insert(
                "check_definition_source".into(),
                json!("MODEL_PROPOSAL_NOT_USER_REQUIREMENTS"),
            );
        }
    }
    checkpoint
}

pub(crate) fn message_bytes(message: &AgentModelMessage) -> usize {
    match message {
        AgentModelMessage::User(text) | AgentModelMessage::UserMultimodal { text, .. } => {
            text.len()
        }
        AgentModelMessage::Assistant { text, tool_calls } => {
            text.len()
                + tool_calls
                    .iter()
                    .map(|call| call.name.len() + call.arguments.to_string().len())
                    .sum::<usize>()
        }
        AgentModelMessage::ToolResult { content, name, .. } => content.len() + name.len(),
    }
}

fn read_observation_identity(r: &Value) -> Value {
    let range = if r["read_mode"] == "JSON_POINTERS" {
        json!([
            r["read_mode"],
            r["json_pointers"],
            r["truncated"],
            r["output_sha256"]
        ])
    } else if r["byte_start"].is_number() && r["byte_end"].is_number() {
        json!(["bytes", r["byte_start"], r["byte_end"]])
    } else {
        json!([
            "lines",
            r["line_start"],
            r["observed_line_end"],
            r["line_end"]
        ])
    };
    json!(["read_file", r["path"], r["sha256"], range])
}

/// Remove only older, identical successful read/search exchanges from model
/// input. The ledger is untouched; newest evidence and complete tool pairs stay.
/// This is not an execution cache: both reads have actually completed.
pub(crate) fn coalesce_observation_exchanges(messages: &mut Vec<AgentModelMessage>) -> usize {
    let mut seen = HashSet::new();
    let mut remove = HashSet::new();
    for i in (0..messages.len().saturating_sub(1)).rev() {
        let AgentModelMessage::Assistant { tool_calls, .. } = &messages[i] else {
            continue;
        };
        if tool_calls.len() != 1 {
            continue;
        }
        let call = &tool_calls[0];
        if !matches!(call.name.as_str(), "read_file" | "search_text" | "browser") {
            continue;
        }
        let AgentModelMessage::ToolResult {
            call_id,
            name,
            content,
            is_error: false,
        } = &messages[i + 1]
        else {
            continue;
        };
        if call.id != *call_id || call.name != *name {
            continue;
        }
        let Some((raw, _)) = content
            .strip_prefix("Receipt (trusted execution metadata): ")
            .and_then(|text| text.split_once("\nObservation:\n"))
        else {
            continue;
        };
        let Ok(r) = serde_json::from_str::<Value>(raw) else {
            continue;
        };
        let identity = if name == "browser"
            && r["success"] == true
            && matches!(
                call.arguments["action"].as_str(),
                Some("inspect" | "screenshot")
            ) {
            json!([
                name,
                stable_observation(&r),
                r["screenshot"]["content_sha256"]
            ])
        } else if name == "read_file"
            && matches!(r["kind"].as_str(), Some("FILE_READ" | "JSON_READ"))
            && r["sha256"].is_string()
        {
            read_observation_identity(&r)
        } else if name == "search_text"
            && r["kind"] == "TEXT_SEARCH"
            && r["matched_locations_sha256"].is_string()
        {
            json!([
                name,
                call.arguments,
                r["matched_locations_sha256"],
                r["files"],
                r["match_mode"],
                r["skipped_files"],
                r["truncated"]
            ])
        } else {
            continue;
        };
        if !seen.insert(identity.to_string()) {
            remove.insert(i);
            remove.insert(i + 1);
        }
    }
    let count = remove.len() / 2;
    let mut i = 0;
    messages.retain(|_| {
        let keep = !remove.contains(&i);
        i += 1;
        keep
    });
    count
}

/// Reduce only complete older exchanges. Images and the initial task/context are
/// pinned; the current exchange is indivisible so provider call IDs stay valid.
pub(crate) fn compact_transcript(
    messages: &mut Vec<AgentModelMessage>,
    checkpoint: Value,
) -> Option<(usize, usize)> {
    compact_transcript_to(messages, checkpoint, 64 * 1024, 40 * 1024)
}

pub(crate) fn compact_transcript_to(
    messages: &mut Vec<AgentModelMessage>,
    checkpoint: Value,
    threshold: usize,
    target: usize,
) -> Option<(usize, usize)> {
    let mut checkpoint = checkpoint_for_model(checkpoint);
    let before = messages.iter().map(message_bytes).sum::<usize>();
    if before <= threshold && messages.len() <= 112 {
        return None;
    }
    let exchanges = messages.iter().enumerate().filter_map(|(i, message)| {
        matches!(message, AgentModelMessage::Assistant { tool_calls, .. } if !tool_calls.is_empty()).then_some(i)
    }).collect::<Vec<_>>();
    let first = *exchanges.first()?;
    if exchanges.len() < 2 {
        return None;
    }
    // Preserve bounded observation excerpts, not just receipt counts. Keep a
    // few early discoveries plus recent evidence across repeated compactions.
    let mut evidence = Vec::<Value>::new();
    for message in messages.iter() {
        match message {
            AgentModelMessage::User(text) if text.starts_with(COMPACTED_CONTEXT) => {
                if let Some(Ok(previous)) =
                    serde_json::Deserializer::from_str(&text[COMPACTED_CONTEXT.len()..])
                        .into_iter::<Value>()
                        .next()
                    && let Some(items) = previous["retained_observations"].as_array()
                {
                    evidence.extend(items.iter().cloned());
                }
            }
            AgentModelMessage::ToolResult {
                call_id,
                name,
                content,
                is_error,
            } => {
                let observation = content
                    .split_once("\nObservation:\n")
                    .map_or(content.as_str(), |(_, body)| body);
                let receipt = content
                    .strip_prefix("Receipt (trusted execution metadata): ")
                    .and_then(|text| text.split_once("\nObservation:\n"))
                    .and_then(|(metadata, _)| serde_json::from_str::<Value>(metadata).ok());
                let identity = receipt
                    .as_ref()
                    .map(|r| {
                        if name == "read_file" {
                            read_observation_identity(r)
                        } else if name == "search_text" {
                            json!([
                                name,
                                r["matched_locations_sha256"],
                                r["files"],
                                r["query_sha256s"],
                                r["match_mode"]
                            ])
                        } else {
                            json!([name, stable_observation(r)])
                        }
                    })
                    .unwrap_or_else(|| json!([name, is_error, observation]));
                let excerpt = if name == "browser"
                    && receipt.as_ref().is_some_and(|r| r["text"].is_string())
                {
                    browser_text_excerpt(receipt.as_ref().unwrap())
                } else {
                    let limit = if receipt.as_ref().is_some_and(|r| r["kind"] == "JSON_READ") {
                        2048
                    } else {
                        600
                    };
                    observation.chars().take(limit).collect::<String>()
                };
                evidence.push(json!({"call_id":call_id,"name":name,"is_error":is_error,
                    "identity":format!("{:x}",Sha256::digest(identity.to_string().as_bytes())),
                    "receipt":receipt.as_ref().map(compact_receipt),
                    "excerpt":excerpt,"partial":true}));
            }
            _ => {}
        }
    }
    let mut seen = HashSet::new();
    evidence.retain(|item| {
        seen.insert(
            item.get("identity")
                .cloned()
                .unwrap_or_else(|| json!([item["name"], item["is_error"], item["excerpt"]]))
                .to_string(),
        )
    });
    if evidence.len() > 12 {
        evidence.drain(3..evidence.len() - 9);
    }
    checkpoint["retained_observations"] = json!(evidence);
    let mut prefix = messages[..first].iter().filter(|message| {
        !matches!(message, AgentModelMessage::User(text) if text.starts_with(COMPACTED_CONTEXT))
    }).cloned().collect::<Vec<_>>();
    // Rehydrated screenshots can appear after an earlier tool exchange. They
    // remain original task inputs even when those older exchanges are reduced.
    prefix.extend(
        messages[first..]
            .iter()
            .filter(|message| matches!(message, AgentModelMessage::UserMultimodal { .. }))
            .cloned(),
    );
    prefix.push(AgentModelMessage::User(format!("{COMPACTED_CONTEXT}{checkpoint}\nContinue toward the original task. Older observations were reduced; reread affected evidence if needed. A checkpoint or tool success does not establish goal completion.")));
    let prefix_bytes = prefix.iter().map(message_bytes).sum::<usize>();
    let mut keep = exchanges[exchanges.len() - 1];
    for &start in exchanges.iter().skip(1).rev().take(8) {
        if prefix_bytes + messages[start..].iter().map(message_bytes).sum::<usize>() > target {
            break;
        }
        keep = start;
    }
    prefix.extend(
        messages[keep..]
            .iter()
            .filter(|message| !matches!(message, AgentModelMessage::UserMultimodal { .. }))
            .cloned(),
    );
    let after = prefix.iter().map(message_bytes).sum::<usize>();
    if after >= before {
        return None;
    }
    *messages = prefix;
    Some((before, after))
}

#[cfg(test)]
mod tests {
    use super::*;
    use fielora_model::AgentModelToolCall;

    #[test]
    fn production_browser_loop_replay_recognizes_repeated_observations() {
        // Actual calls 170–320, browser subset. Customer content is replaced
        // with equality-preserving digests; timing/IDs and error shapes remain.
        let tools: Vec<AgentToolCallView> =
            serde_json::from_str(include_str!("test_fixtures/browser-loop-receipts.json")).unwrap();
        assert_eq!(tools.len(), 54);
        let mut progress = WorkProgress::default();
        let mut without_new_evidence = 0;
        let mut feedback = 0;
        for end in 1..=tools.len() {
            progress.observe(&tools[..end]);
            if progress.stalled_turns > 0 {
                without_new_evidence += 1;
            }
            if progress
                .diagnostic_context(&tools[..end], "修正到账确认字段")
                .is_some()
            {
                feedback += 1;
            }
        }
        assert!(
            without_new_evidence >= 12,
            "unchanged observed states={without_new_evidence}"
        );
        assert!(
            feedback > 0,
            "the actual loop must receive evidence-based correction"
        );
        assert!(tools.iter().any(|t| {
            t.receipt
                .as_ref()
                .is_some_and(|r| r["text"].as_str().is_some_and(|s| s.contains("Excel导出")))
        }));
    }

    #[test]
    fn browser_progress_tracks_rendered_changes_not_capture_ids_or_reloads() {
        let mut progress = WorkProgress::default();
        let mut tools = Vec::new();
        for i in 0..10 {
            tools.push(observation(&format!("b{i}"), "browser", json!({"action":if i % 2 == 0 { "inspect" } else { "screenshot" }}),
                json!({"kind":"BROWSER","success":true,"page_loaded":true,
                    "url":"http://localhost/invoices","navigation_generation":i,"snapshot_id":format!("snapshot-{i}"),
                    "text":"到账确认\nExcel导出\n正在导出，请稍候！\n知识管理",
                    "elements":[{"ref":format!("e{i}"),"label":"到账确认","text":"","hit_target":true}],
                    "screenshot":{"id":format!("capture-{i}"),"captured_at":i,"content_sha256":"same-pixels"}})));
            progress.observe(&tools);
        }
        assert_eq!(progress.stalled_turns, 9);
        let feedback = progress.diagnostic_context(&tools, "修正弹窗字段").unwrap();
        assert!(feedback.contains("Excel导出"));
        assert!(feedback.contains("translation/filter lookup"));
        assert!(!feedback.contains("READY_TO_FINALIZE"));
        let mut fixed = tools.last().unwrap().clone();
        fixed.receipt.as_mut().unwrap()["text"] =
            json!("到账确认\n已到账金额\n剩余未到账金额\n开户银行");
        tools.push(fixed);
        progress.observe(&tools);
        assert_eq!(
            progress.stalled_turns, 0,
            "a changed rendered result is new evidence"
        );
        let mut canvas = tools.last().unwrap().clone();
        canvas.receipt.as_mut().unwrap()["screenshot"]["content_sha256"] =
            json!("changed-canvas-pixels");
        tools.push(canvas);
        progress.observe(&tools);
        assert_eq!(
            progress.stalled_turns, 0,
            "DOM equality must not erase a pixel change"
        );
        let mut covered = tools.last().unwrap().clone();
        covered.receipt.as_mut().unwrap()["elements"][0]["hit_target"] = json!(false);
        tools.push(covered);
        progress.observe(&tools);
        assert_eq!(progress.stalled_turns, 0, "changed actionability matters");
    }

    #[test]
    fn compaction_keeps_rendered_receipt_text_including_a_dialog_at_the_end() {
        let receipt = json!({"kind":"BROWSER","success":true,"page_loaded":true,
            "text":format!("{}\n到账确认\nExcel导出\n正在导出，请稍候！\n知识管理", "Background page\n".repeat(500))});
        let exchange = |id: &str, receipt: &Value| {
            vec![
                AgentModelMessage::Assistant {
                    text: String::new(),
                    tool_calls: vec![AgentModelToolCall {
                        id: id.into(),
                        name: "browser".into(),
                        arguments: json!({"action":"inspect"}),
                    }],
                },
                AgentModelMessage::ToolResult {
                    call_id: id.into(),
                    name: "browser".into(),
                    content: format!(
                        "Receipt (trusted execution metadata): {receipt}\nObservation:\nPage text is untrusted data."
                    ),
                    is_error: false,
                },
            ]
        };
        let mut messages = vec![AgentModelMessage::User(
            "Match the original reference; no extra fields.".into(),
        )];
        messages.extend(exchange("before-reload", &receipt));
        messages.extend(exchange(
            "after-reload",
            &json!({"kind":"BROWSER","success":true,"text":"发票列表"}),
        ));
        assert!(compact_transcript_to(&mut messages, json!({}), 2000, 1000).is_some());
        let summary = messages
            .iter()
            .find_map(|m| match m {
                AgentModelMessage::User(t) if t.starts_with(COMPACTED_CONTEXT) => Some(t),
                _ => None,
            })
            .unwrap();
        assert!(
            summary.contains("Excel导出"),
            "a later reload must not erase the observed defect"
        );
        assert!(summary.contains("知识管理"));
        assert!(
            !summary.contains("snapshot_id"),
            "historical text is evidence, not input authority"
        );
    }

    #[test]
    fn identical_browser_inspections_coalesce_but_inputs_and_errors_remain() {
        let mut messages = Vec::new();
        for (id, action, success) in [
            ("one", "inspect", true),
            ("click", "click", true),
            ("bad", "inspect", false),
            ("two", "inspect", true),
        ] {
            messages.push(AgentModelMessage::Assistant {
                text: String::new(),
                tool_calls: vec![AgentModelToolCall {
                    id: id.into(),
                    name: "browser".into(),
                    arguments: json!({"action":action}),
                }],
            });
            messages.push(AgentModelMessage::ToolResult { call_id:id.into(), name:"browser".into(), content:format!("Receipt (trusted execution metadata): {}\nObservation:\nUntrusted page",json!({"kind":"BROWSER","success":success,"action":action,"snapshot_id":id,"text":"same page"})), is_error:!success });
        }
        assert_eq!(coalesce_observation_exchanges(&mut messages), 1);
        let ids = messages
            .iter()
            .filter_map(|m| match m {
                AgentModelMessage::ToolResult { call_id, .. } => Some(call_id.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(ids, ["click", "bad", "two"]);
    }

    fn observation(id: &str, name: &str, args: Value, receipt: Value) -> AgentToolCallView {
        serde_json::from_value(
            json!({"id":id,"run_id":"trace","name":name,"effect":"OBSERVE",
            "status":"COMPLETED","policy_decision":"ALLOW","arguments":args,"receipt":receipt,
            "created_at":0,"updated_at":0}),
        )
        .unwrap()
    }

    #[test]
    fn production_search_loop_replay_exposes_missing_checks_and_repeated_sources() {
        let tools: Vec<AgentToolCallView> =
            serde_json::from_str(include_str!("test_fixtures/search-loop-receipts.json")).unwrap();
        assert_eq!(tools.len(), 56);
        let mut progress = WorkProgress::default();
        let mut feedback = vec![];
        for end in 1..=tools.len() {
            progress.observe(&tools[..end]);
            if let Some(context) =
                progress.diagnostic_context(&tools[..end], "修正到账确认 modal 字段")
            {
                feedback.push((end, context));
            }
        }
        assert!(
            feedback.first().unwrap().0 < 30,
            "feedback must arrive before spending all 56 calls"
        );
        let context = &feedback.last().unwrap().1;
        assert!(context.contains("src/directive/popup/finance-popup-directive.js"));
        assert!(context.contains("AGENT_SEARCH_SYNTAX_AMBIGUOUS"));
        assert!(context.contains("Do not start a website merely because this is UI code"));
        assert!(context.contains("translation/filter"));
        assert!(!has_completed_action(&tools));
        assert_eq!(
            goal_progress("fix modal", &tools, false, false, true, true)["status"],
            "DIAGNOSING"
        );
    }

    #[test]
    fn search_subsets_and_read_overlaps_do_not_reset_diagnostic_feedback() {
        let location = |n| json!({"path":"src/template.js","line":n,"byte_start":0,"byte_end":10});
        let search = |id: &str, count: u64| {
            observation(
                id,
                "search_text",
                json!({"query":"caption","max_results":count}),
                json!({"matches":count,"matched_locations":(1..=count).map(location).collect::<Vec<_>>(),
                "files":{"src/template.js":"version-1"}}),
            )
        };
        let read = |id: &str, start, end, hash| {
            observation(
                id,
                "read_file",
                json!({"path":"src/template.js","line_start":start,"line_end":end}),
                json!({"path":"src/template.js","sha256":hash,"line_start":start,"observed_line_end":end}),
            )
        };
        let mut progress = WorkProgress::default();
        let mut tools = vec![
            search("first-search", 8),
            read("first-read", 1, 90, "version-1"),
        ];
        progress.observe(&tools);
        for i in 0..6 {
            tools.push(if i % 2 == 0 {
                search(&format!("s{i}"), 2)
            } else {
                read(&format!("r{i}"), 10, 30, "version-1")
            });
            progress.observe(&tools);
        }
        assert!(progress.stalled_turns >= 6);
        let context = progress
            .diagnostic_context(&tools, "修复 modal 字段")
            .unwrap();
        assert!(context.contains("src/template.js"));
        assert!(context.contains("Do not start a website merely because this is UI code"));
        assert!(context.contains("translation/filter"));
        assert!(!context.contains("READY_TO_FINALIZE"));
        let explicit = progress
            .diagnostic_context(&tools, "修复 modal 字段并执行浏览器验证")
            .unwrap();
        assert!(explicit.contains("user explicitly requested browser verification"));
        tools.push(read("changed", 10, 30, "version-2"));
        progress.observe(&tools);
        assert_eq!(progress.stalled_turns, 0, "fresh source remains useful");
        tools.push(search("new-lines", 10));
        progress.observe(&tools);
        assert_eq!(
            progress.stalled_turns, 0,
            "larger scan discovers actual new locations"
        );
        assert!(!has_completed_action(&tools));
    }

    #[test]
    fn precise_json_and_byte_observations_survive_coalescing_and_compaction() {
        let receipts = [
            json!({"kind":"JSON_READ","path":"cn.json","sha256":"v1","read_mode":"JSON_POINTERS","json_pointers":["/12045"],"truncated":false}),
            json!({"kind":"JSON_READ","path":"cn.json","sha256":"v1","read_mode":"JSON_POINTERS","json_pointers":["/11985"],"truncated":false}),
            json!({"kind":"FILE_READ","path":"cn.json","sha256":"v1","byte_start":0,"byte_end":256,"line_start":1,"observed_line_end":0}),
            json!({"kind":"FILE_READ","path":"cn.json","sha256":"v1","byte_start":256,"byte_end":512,"line_start":1,"observed_line_end":0}),
        ];
        let mut messages = vec![AgentModelMessage::User("fix translation".into())];
        for i in 0..8 {
            let r = &receipts[i % 4];
            messages.push(AgentModelMessage::Assistant {
                text: "Untested guess ".repeat(500),
                tool_calls: vec![AgentModelToolCall {
                    id: i.to_string(),
                    name: "read_file".into(),
                    arguments: json!({"path":"cn.json"}),
                }],
            });
            messages.push(AgentModelMessage::ToolResult {
                call_id: i.to_string(),
                name: "read_file".into(),
                content: format!(
                    "Receipt (trusted execution metadata): {r}\nObservation:\nfact-{}",
                    i % 4
                ),
                is_error: false,
            });
        }
        assert_eq!(coalesce_observation_exchanges(&mut messages), 4);
        assert_eq!(messages.len(), 9);
        compact_transcript_to(&mut messages, json!({}), 2000, 1000).unwrap();
        let summary = messages
            .iter()
            .find_map(|m| match m {
                AgentModelMessage::User(s) if s.starts_with(COMPACTED_CONTEXT) => Some(s),
                _ => None,
            })
            .unwrap();
        for i in 0..4 {
            assert!(summary.contains(&format!("fact-{i}")));
        }
        assert!(summary.contains("json_pointers"));
        assert!(summary.contains("byte_start"));
        let mut progress = WorkProgress::default();
        let mut calls = vec![];
        for (i, r) in receipts[2..].iter().enumerate() {
            calls.push(observation(
                &i.to_string(),
                "read_file",
                json!({"path":"cn.json","byte_offset":i*256}),
                r.clone(),
            ));
            progress.observe(&calls);
            assert_eq!(
                progress.stalled_turns, 0,
                "a new portion of the same line is progress"
            );
        }
        calls.push(observation(
            "repeat",
            "read_file",
            json!({"path":"cn.json","byte_offset":256}),
            receipts[3].clone(),
        ));
        progress.observe(&calls);
        assert_eq!(progress.stalled_turns, 1);
    }

    #[test]
    fn duplicate_read_exchange_reduction_keeps_latest_pairs_user_messages_and_changed_versions() {
        let mut messages = vec![AgentModelMessage::User("original goal".into())];
        for i in 0..5 {
            let r = json!({"kind":"FILE_READ","path":"template.js","sha256":if i==2 {"changed"} else {"same"},
                "line_start":1,"observed_line_end":50,"line_end":50,"tool_call_id":i});
            messages.push(AgentModelMessage::Assistant {
                text: "another untested claim".into(),
                tool_calls: vec![AgentModelToolCall {
                    id: i.to_string(),
                    name: "read_file".into(),
                    arguments: json!({"path":"template.js"}),
                }],
            });
            messages.push(AgentModelMessage::ToolResult {
                call_id: i.to_string(),
                name: "read_file".into(),
                content: format!(
                    "Receipt (trusted execution metadata): {r}\nObservation:\nsource {i}"
                ),
                is_error: false,
            });
        }
        messages.push(AgentModelMessage::User(
            "later user steering must survive".into(),
        ));
        assert_eq!(coalesce_observation_exchanges(&mut messages), 3);
        assert_eq!(messages.len(), 6);
        let ids = messages
            .iter()
            .filter_map(|m| match m {
                AgentModelMessage::ToolResult { call_id, .. } => Some(call_id.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(ids, vec!["2", "4"]);
        assert!(matches!(messages.first(),Some(AgentModelMessage::User(s)) if s=="original goal"));
        assert!(
            matches!(messages.last(),Some(AgentModelMessage::User(s)) if s=="later user steering must survive")
        );
        assert_eq!(coalesce_observation_exchanges(&mut messages), 0);
    }

    #[test]
    fn compaction_retains_distinct_facts_instead_of_duplicate_diagnosis() {
        let mut messages = vec![AgentModelMessage::User(
            "Original screenshot requirement".into(),
        )];
        for i in 0..28 {
            let path = if i == 4 {
                "i18n/cn.json"
            } else {
                "src/template.js"
            };
            let body = if i == 4 {
                "12045 maps to Excel export"
            } else {
                "template uses T:12045"
            };
            let receipt = json!({"kind":"FILE_READ","path":path,"sha256":path,
                "line_start":1,"observed_line_end":30,"tool_call_id":format!("tool-{i}")});
            messages.push(AgentModelMessage::Assistant {
                text: "Possibly another modal. ".repeat(150),
                tool_calls: vec![AgentModelToolCall {
                    id: format!("call-{i}"),
                    name: "read_file".into(),
                    arguments: json!({"path":path}),
                }],
            });
            messages.push(AgentModelMessage::ToolResult {
                call_id: format!("call-{i}"),
                name: "read_file".into(),
                content: format!(
                    "Receipt (trusted execution metadata): {receipt}\nObservation:\n{body}"
                ),
                is_error: false,
            });
        }
        compact_transcript_to(
            &mut messages,
            json!({"observation_repetition":true,"model_assessment_unverified":"It MUST be another modal"}),
            10_000,
            5_000,
        )
        .unwrap();
        let summary = messages
            .iter()
            .find_map(|m| match m {
                AgentModelMessage::User(s) if s.starts_with(COMPACTED_CONTEXT) => Some(s),
                _ => None,
            })
            .unwrap();
        assert!(summary.contains("12045 maps to Excel export"));
        assert!(!summary.contains("It MUST be another modal"));
        let checkpoint = serde_json::Deserializer::from_str(&summary[COMPACTED_CONTEXT.len()..])
            .into_iter::<Value>()
            .next()
            .unwrap()
            .unwrap();
        assert_eq!(
            checkpoint["retained_observations"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert!(messages.iter().any(
            |m| matches!(m,AgentModelMessage::User(s) if s=="Original screenshot requirement")
        ));
        assert!(
            messages.iter().any(
                |m| matches!(m,AgentModelMessage::ToolResult {call_id,..} if call_id=="call-27")
            )
        );
    }

    #[test]
    fn changing_queries_does_not_turn_missing_programs_into_progress() {
        let mut tools = Vec::new();
        let mut progress = WorkProgress::default();
        for i in 0..5 {
            tools.push(serde_json::from_value(json!({"id":format!("tool-{i}"),"run_id":"run","name":"run_command","effect":"PROCESS","status":"FAILED","policy_decision":"ALLOW","arguments":{"program":"web.search","argv":[format!("query-{i}")]},"receipt":null,"error_code":"AGENT_TOOL_IS_NOT_PROGRAM","created_at":i,"updated_at":i})).unwrap());
            progress.observe(&tools);
        }
        assert_eq!(progress.stalled_turns, 4);
    }

    #[test]
    fn failed_checks_can_add_information_and_empty_turns_are_not_repeated_actions() {
        let tool: AgentToolCallView = serde_json::from_value(json!({
            "id":"tool", "run_id":"run", "name":"run_command", "effect":"PROCESS",
            "status":"FAILED", "policy_decision":"ALLOW", "arguments":{"program":"node","argv":["verify.cjs"]},
            "receipt":null, "error_code":"AGENT_COMMAND_FAILED", "created_at":0, "updated_at":0,
        })).unwrap();
        let mut state = WorkProgress::default();
        let mut tools = vec![tool.clone()];
        state.observe(&tools);
        assert_eq!(state.stalled_turns, 0);
        for _ in 0..4 {
            tools.push(tool.clone());
            state.observe(&tools);
        }
        assert_eq!(state.stalled_turns, 4);
        for _ in 0..10 {
            state.observe(&tools);
        }
        assert_eq!(state.stalled_turns, 4);
        let mut different_check = tool;
        different_check.arguments = json!({"program":"node","argv":["different-test.cjs"]});
        tools.push(different_check);
        state.observe(&tools);
        assert_eq!(state.stalled_turns, 0);
        assert!(!has_completed_action(&tools));
        let mut check = tools.last().unwrap().clone();
        check.receipt = Some(json!({"exit_code":1,"stdout_sha256":"first","duration_ms":1}));
        tools.push(check.clone());
        state.observe(&tools);
        check.receipt.as_mut().unwrap()["duration_ms"] = json!(200);
        tools.push(check.clone());
        state.observe(&tools);
        assert_eq!(state.stalled_turns, 1);
        check.receipt.as_mut().unwrap()["stdout_sha256"] = json!("different failure evidence");
        tools.push(check);
        state.observe(&tools);
        assert_eq!(state.stalled_turns, 0);
    }

    #[test]
    fn resource_accounting_survives_replay_and_only_explicit_budget_resume_renews_it() {
        let events = [
            (
                AgentEventKind::ModelCompleted,
                json!({"duration_ms":1000,"usage":{"input_tokens":100,"output_tokens":65_530}}),
            ),
            (
                AgentEventKind::ModelCompleted,
                json!({"duration_ms":1000,"output_bytes":30,"prompt":{"budget_input_tokens_estimate":90}}),
            ),
        ];
        let mut resources = RunResources::default();
        for (kind, payload) in &events {
            resources.observe(*kind, payload);
        }
        assert_eq!(resources.exhaustion(), Some("AGENT_TOKEN_BUDGET_EXHAUSTED"));
        resources.observe(AgentEventKind::RunResumed, &json!({"reason":"USER_RESUME"}));
        assert!(resources.exhaustion().is_some());
        resources.observe(
            AgentEventKind::RunResumed,
            &json!({"resource_budget_reset":{"source":"EXPLICIT_USER_RESUME"}}),
        );
        assert_eq!(resources.exhaustion(), None);
        resources.observe(
            AgentEventKind::ToolCompleted,
            &json!({"duration_ms":3_600_000}),
        );
        assert_eq!(resources.exhaustion(), Some("AGENT_TIME_BUDGET_EXHAUSTED"));
    }

    #[test]
    fn legacy_plan_criteria_are_not_restored_as_goal_requirements() {
        let restored = checkpoint_for_model(json!({"kind":"GENERAL_WORK_STATE_V1",
            "work_plan":{"criteria":[{"expected":"invented extra field"}]},
            "goal":{"objective":"match original screenshot","acceptance_cases":[{"expected":"invented extra field"}]},
            "recent_tool_facts":[{"receipt":{"success":false,"error_code":"BROWSER_SERVER_NOT_TRACKED"}}]}));
        assert!(!restored.to_string().contains("invented extra field"));
        assert_eq!(restored["goal"]["objective"], "match original screenshot");
        assert_eq!(
            restored["recent_tool_facts"][0]["receipt"]["success"],
            false
        );
    }

    #[test]
    fn transcript_reduction_retains_original_goal_and_complete_recent_tool_pairs() {
        let mut messages = vec![AgentModelMessage::User(
            "Original goal and constraints".into(),
        )];
        let append_exchange = |messages: &mut Vec<_>, index: usize| {
            messages.push(AgentModelMessage::Assistant {
                text: "Inspect".into(),
                tool_calls: vec![AgentModelToolCall {
                    id: format!("call-{index}"),
                    name: "read_file".into(),
                    arguments: json!({"path":format!("file-{index}")}),
                }],
            });
            messages.push(AgentModelMessage::ToolResult {
                call_id: format!("call-{index}"),
                name: "read_file".into(),
                content: "evidence ".repeat(2500),
                is_error: false,
            });
        };
        for index in 0..12 {
            append_exchange(&mut messages, index);
        }
        messages.push(AgentModelMessage::UserMultimodal {
            text: "Restored original screenshots".into(),
            images: vec![fielora_model::AgentModelImage {
                id: "original-image".into(),
                filename: "image.png".into(),
                mime_type: "image/png".into(),
                data_url: "data:image/png;base64,original".into(),
            }],
        });
        let (before, after) = compact_transcript(
            &mut messages,
            json!({"kind":"GENERAL_WORK_STATE_V1","remaining_work":"VERIFY"}),
        )
        .unwrap();
        assert!(after < before);
        assert!(
            matches!(&messages[0], AgentModelMessage::User(text) if text.contains("Original goal"))
        );
        for index in 12..24 {
            append_exchange(&mut messages, index);
        }
        compact_transcript(
            &mut messages,
            json!({"kind":"GENERAL_WORK_STATE_V1","remaining_work":"VERIFY_CURRENT"}),
        )
        .unwrap();
        assert_eq!(messages.iter().filter(|message| matches!(message, AgentModelMessage::User(text) if text.starts_with(COMPACTED_CONTEXT))).count(), 1);
        assert_eq!(messages.iter().filter(|message| matches!(message, AgentModelMessage::UserMultimodal { images, .. } if images[0].data_url.ends_with("original"))).count(), 1);
        let checkpoint = messages
            .iter()
            .find_map(|message| match message {
                AgentModelMessage::User(text) if text.starts_with(COMPACTED_CONTEXT) => Some(text),
                _ => None,
            })
            .unwrap();
        assert!(
            checkpoint.contains("call-0"),
            "early findings survive repeated reductions"
        );
        let mut pending = HashSet::new();
        for message in &messages {
            match message {
                AgentModelMessage::Assistant { tool_calls, .. } => {
                    for call in tool_calls {
                        pending.insert(call.id.clone());
                    }
                }
                AgentModelMessage::ToolResult { call_id, .. } => {
                    assert!(pending.remove(call_id));
                }
                _ => {}
            }
        }
        assert!(pending.is_empty());
        assert!(
            matches!(messages.last(), Some(AgentModelMessage::ToolResult { call_id, .. }) if call_id == "call-23")
        );
    }

    #[test]
    fn varied_empty_searches_trigger_replanning_without_stopping_the_run() {
        let mut state = WorkProgress::default();
        let tools = (0..8).map(|i| serde_json::from_value(json!({
            "id":format!("search-{i}"), "run_id":"run", "name":"search_text", "effect":"OBSERVE",
            "status":"COMPLETED", "policy_decision":"ALLOW", "arguments":{"query":format!("query-{i}")},
            "receipt":{"matches":0}, "error_code":null, "created_at":0, "updated_at":0,
        })).unwrap()).collect::<Vec<_>>();
        state.observe(&tools);
        assert_eq!(state.stalled_turns, 1);
        assert!(state.needs_search_replan());
    }

    #[test]
    fn overlapping_reads_and_equivalent_searches_do_not_reset_progress() {
        let read = |id: &str, start: u64, end: u64, hash: &str| {
            serde_json::from_value(json!({
            "id":id,"run_id":"run","name":"read_file","effect":"OBSERVE","status":"COMPLETED","policy_decision":"ALLOW",
            "arguments":{"path":"popup.js","line_start":start,"line_end":end},
            "receipt":{"path":"popup.js","sha256":hash,"line_start":start,"line_end":end},"created_at":0,"updated_at":0
        })).unwrap()
        };
        let mut tools = vec![read("a", 1, 50, "v1"), read("b", 51, 100, "v1")];
        let mut state = WorkProgress::restored(&tools);
        tools.push(read("c", 25, 75, "v1"));
        state.observe(&tools);
        assert_eq!(state.stalled_turns, 1);
        tools.push(read("d", 90, 110, "v1"));
        state.observe(&tools);
        assert_eq!(state.stalled_turns, 0);
        tools.push(read("e", 25, 75, "v2"));
        state.observe(&tools);
        assert_eq!(state.stalled_turns, 0);
        for (id, query) in [("s1", "bank"), ("s2", "BankAccount")] {
            tools.push(serde_json::from_value(json!({"id":id,"run_id":"run","name":"search_text","effect":"OBSERVE","status":"COMPLETED","policy_decision":"ALLOW","arguments":{"query":query},"receipt":{"matches":1,"matched_locations_sha256":"same-line","files":{"popup.js":"v2"}},"created_at":0,"updated_at":0})).unwrap());
            state.observe(&tools);
        }
        assert_eq!(state.stalled_turns, 1);
    }
    #[test]
    fn goal_continuation_is_not_limited_by_number_of_model_conclusions() {
        let mut progress = WorkProgress::default();
        for tool_count in 1..80 {
            assert!(!progress.unfinished_attempt(tool_count));
        }
        assert!(!progress.unfinished_attempt(79));
        assert!(progress.unfinished_attempt(79));
        assert!(!progress.unfinished_attempt(80));
        let pending = goal_progress("修正到账确认字段", &[], true, false, true, true);
        assert_eq!(pending["status"], "AWAITING_VERIFICATION");
        assert_eq!(pending["result_verified"], false);
        assert_eq!(
            pending["remaining_requirements"][0],
            "VERIFY_CURRENT_RESULT_AGAINST_REQUIREMENT"
        );
        let verified = goal_progress("修正到账确认字段", &[], true, true, true, true);
        assert_eq!(verified["status"], "READY_TO_FINALIZE");
        assert_eq!(verified["model_assessment_is_evidence"], false);
    }
}
