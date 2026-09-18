//! Deterministic provider substitute: asserts actual request contents at the wire boundary.
use fielora_contracts::ModelUsage;
use fielora_model::{
    AgentModelMessage, AgentModelRequest, AgentModelToolCall, AgentModelTurn, ModelError,
};
use serde_json::{Value, json};

pub fn turn(
    task: &str,
    request: &AgentModelRequest,
    step: u32,
) -> Result<AgentModelTurn, ModelError> {
    let Some(AgentModelMessage::User(context)) = request.messages.last() else {
        return Err(ModelError::ProviderProtocolError);
    };
    let data: Value = serde_json::from_str(
        context
            .strip_prefix(crate::agent_turn_context::MARKER)
            .ok_or(ModelError::ProviderProtocolError)?
            .lines()
            .next()
            .unwrap_or(""),
    )
    .map_err(|_| ModelError::ProviderProtocolError)?;
    if crate::agent_request_scope::access_question(task) {
        if step != 1
            || data["current_request_constraint"].is_null()
            || request.tools.iter().any(|t| {
                !matches!(
                    t.name.as_str(),
                    "read_file" | "list_files" | "stat_path" | "search_text"
                )
            })
        {
            return Err(ModelError::ProviderProtocolError);
        }
        let paths = crate::agent_request_scope::requested_paths(task, std::path::Path::new("."));
        let source = paths.first().ok_or(ModelError::ProviderProtocolError)?;
        return Ok(AgentModelTurn {
            text: "现在可以看到了，让我继续修改以前的任务。".into(),
            tool_calls: vec![
                ("replace_text", json!({"path":"settings.js","expected_sha256":"0".repeat(64),"old_text":"wrong","new_text":"BAD"})),
                ("run_command", json!({"program":"node","argv":["-e","require('fs').writeFileSync('escaped.txt','BAD')"]})),
                ("git_stage", json!({"paths":["settings.js"]})),
                ("read_file", json!({"path":source.join("view.js").to_string_lossy()})),
                ("write_file", json!({"path":"escaped.txt","content":"BAD"})),
            ].into_iter().enumerate().map(|(i,(name,arguments))| AgentModelToolCall {id:format!("adversarial-{i}"),name:name.into(),arguments}).collect(),
            usage:Some(ModelUsage {input_tokens:Some(100),output_tokens:Some(30)}),
        });
    }
    if data["current_request"] != task
        || !request
            .tools
            .iter()
            .any(|t| t.name == crate::agent_turn_context::TOOL)
    {
        return Err(ModelError::ProviderProtocolError);
    }
    let previous = request
        .messages
        .iter()
        .rev()
        .find_map(|m| match m {
            AgentModelMessage::ToolResult { content, .. } => content
                .strip_prefix("Receipt (trusted execution metadata): ")
                .and_then(|s| s.lines().next())
                .and_then(|s| serde_json::from_str::<Value>(s).ok())
                .map(|receipt| json!({"receipt":receipt})),
            _ => None,
        })
        .unwrap_or(Value::Null);
    if let Some(turn) = request_intent_turn(task, request, step, context, &previous)? {
        return Ok(turn);
    }
    let mut text = "正在检查当前请求的执行证据。".to_owned();
    let tool = if task == "为什么这次没有改成功" {
        if step == 1 {
            let id = data["historical_execution_index"]["runs"][0]["run_id"]
                .as_str()
                .ok_or(ModelError::ProviderProtocolError)?;
            Some(("read_run_history", json!({"run_id":id})))
        } else {
            if previous["receipt"]["kind"] != "RUN_HISTORY_READ"
                || previous["receipt"]["history"]["failed_tools"]
                    .as_u64()
                    .unwrap_or(0)
                    == 0
                || previous["receipt"]["history"]["completed_workspace_writes"] != 0
            {
                return Err(ModelError::ProviderProtocolError);
            }
            text = "上次替换失败：待替换文本没有匹配，未完成文件修改。此回答只说明原因，旧修复任务仍未完成。".into();
            None
        }
    } else {
        match step {
            1 => Some(("read_file", json!({"path":"settings.js"}))),
            2 => {
                let sha = previous["receipt"]["sha256"]
                    .as_str()
                    .ok_or(ModelError::ProviderProtocolError)?;
                Some((
                    "replace_text",
                    json!({"path":"settings.js","expected_sha256":sha,"old_text":if task=="修复失败样例" {"absent sentinel"} else {"wrong"},"new_text":"right"}),
                ))
            }
            3 if task != "修复失败样例" => Some((
                "run_command",
                json!({"program":"node","argv":["verify.cjs"]}),
            )),
            _ => {
                text = "当前请求已处理。".into();
                None
            }
        }
    };
    Ok(AgentModelTurn {
        text,
        tool_calls: tool
            .into_iter()
            .map(|(name, arguments)| AgentModelToolCall {
                id: format!("turn-context-{step}"),
                name: name.into(),
                arguments,
            })
            .collect(),
        usage: Some(ModelUsage {
            input_tokens: Some(100),
            output_tokens: Some(30),
        }),
    })
}

// Semantic choices here are deterministic test inputs, NOT a vision/intent model.
fn request_intent_turn(
    task: &str,
    request: &AgentModelRequest,
    step: u32,
    context: &str,
    previous: &Value,
) -> Result<Option<AgentModelTurn>, ModelError> {
    let question = task.starts_with("对啊 为什么")
        || task.starts_with("为什么之前删除")
        || task.starts_with("Explain why")
        || task.starts_with("你说修改好了");
    let mixed = task == "解释原因并删除错误配置";
    let unverified = task == "FIELORA_INTENT_UNVERIFIED 修改后只解释";
    if !question && !mixed && !unverified {
        return Ok(None);
    }
    if !request
        .tools
        .iter()
        .any(|t| t.name == crate::agent_request_intent::TOOL)
        || !context.contains(crate::agent_request_intent::GUIDANCE)
        || !context.contains(
            "Current explicit user corrections override earlier assistant interpretations",
        )
    {
        return Err(ModelError::ProviderProtocolError);
    }
    if question && step >= 3 {
        let data: Value = serde_json::from_str(
            context
                .strip_prefix(crate::agent_turn_context::MARKER)
                .unwrap()
                .lines()
                .next()
                .unwrap(),
        )
        .map_err(|_| ModelError::ProviderProtocolError)?;
        if data["current_request_interpretation"] != "answer_only"
            || data["interpretation_is_permission_or_verification"] != false
        {
            return Err(ModelError::ProviderProtocolError);
        }
    }
    let mut text = "本轮是在追问检查为何偏离要求；用户已说明红线表示移除或隐藏，不能按复选框把它改解为保留。此前检查目标偏离了该要求。此回答不代表报表已经修复。".to_owned();
    let tool = if unverified {
        match step {
            1 => Some(("read_file", json!({"path":"settings.js"}))),
            2 => Some((
                "replace_text",
                json!({"path":"settings.js","expected_sha256":previous["receipt"]["sha256"],"old_text":"wrong","new_text":"right"}),
            )),
            3 => Some((
                crate::agent_request_intent::TOOL,
                json!({"intent":"answer_only","request_quote":task}),
            )),
            _ => None,
        }
    } else if step == 2 {
        Some((
            crate::agent_request_intent::TOOL,
            json!({"intent":if mixed {"workspace_change"}else{"answer_only"},"request_quote":task}),
        ))
    } else {
        None
    };
    if mixed || unverified {
        text = "处理完成。".into();
    }
    Ok(Some(AgentModelTurn {
        text,
        tool_calls: tool
            .into_iter()
            .map(|(name, arguments)| AgentModelToolCall {
                id: format!("intent-{step}"),
                name: name.into(),
                arguments,
            })
            .collect(),
        usage: Some(ModelUsage {
            input_tokens: Some(100),
            output_tokens: Some(30),
        }),
    }))
}
