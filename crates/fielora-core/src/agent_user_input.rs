//! Explicit clarification over existing Run/ToolCall/Conversation persistence.
use fielora_agent::{AgentError, ToolExecution, ToolExecutionSource, ToolSourceKind, ToolSpec};
use fielora_contracts::*;
use fielora_field::DomainError;
use fielora_storage::StorageHandle;
use serde::Deserialize;
use serde_json::{Value, json};

pub const TOOL: &str = "request_user_input";
pub const REQUIRED: &str = "AGENT_USER_INPUT_REQUIRED";
pub const GUIDANCE: &str = "When a required source, preference or fact is missing and cannot be established using the actual tools, call request_user_input with one concise, self-contained question. This visibly pauses the SAME unfinished task; do not pretend an installation succeeded or keep guessing repository URLs. Do not ask for secrets. Tool IDs are not OS commands. A source must come from the user or an actual observation, never an invented project namespace. A registered tool is not proof of authentication or successful execution.";

pub fn catalog() -> ToolSpec {
    ToolSpec {
        definition: ModelToolDefinition {
            name: TOOL.into(),
            description: GUIDANCE.into(),
            input_schema: json!({"type":"object","properties":{"question":{"type":"string","minLength":1,"maxLength":2000}},"required":["question"],"additionalProperties":false}),
        },
        effect: AgentToolEffect::Observe,
        source: ToolExecutionSource {
            capability_id: TOOL.into(),
            capability_version: "0.1.0".into(),
            source_kind: ToolSourceKind::Builtin,
            provider_id: "fielora.builtin".into(),
            provider_tool_name: TOOL.into(),
            protocol_version: None,
            transport: Some("HARNESS".into()),
        },
    }
}

pub fn record(run: &AgentRunView, arguments: &Value) -> Result<ToolExecution, AgentError> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Args {
        question: String,
    }
    let args: Args =
        serde_json::from_value(arguments.clone()).map_err(|_| AgentError::ToolArgumentsInvalid)?;
    let question =
        fielora_agent::redact_output(&fielora_model::sanitize_agent_text(&args.question));
    if question.trim().is_empty() || question.chars().count() > 2000 {
        return Err(AgentError::ToolArgumentsInvalid);
    }
    Ok(ToolExecution { receipt:json!({"kind":"USER_INPUT_REQUEST","run_id":run.id,"question":question.trim(),"verification_eligible":false,"task_complete":false}), observation:"The Harness will display this question and pause this unfinished Run. Wait for the user's explicitly submitted answer. Do not execute additional actions, infer an answer from elapsed time, or claim completion.".into() })
}

pub fn receipts(storage: &StorageHandle, run: &AgentRunView) -> Result<Vec<Value>, DomainError> {
    let mut cursor = None;
    let mut answers = Vec::new();
    loop {
        let events = storage.list_agent_events(ListAgentEventsRequest {
            run_id: run.id.clone(),
            after_sequence: cursor,
            limit: Some(500),
        })?;
        for event in &events {
            if event.kind == AgentEventKind::CheckpointCreated
                && event.payload["kind"] == "USER_INPUT_RECEIVED"
            {
                answers.push(event.payload.clone());
            }
        }
        if events.len() < 500 {
            return Ok(answers);
        }
        cursor = events.last().map(|e| e.sequence);
    }
}

pub fn pending(
    storage: &StorageHandle,
    run: &AgentRunView,
) -> Result<Option<AgentToolCallView>, DomainError> {
    let answers = receipts(storage, run)?;
    Ok(storage
        .list_agent_tool_calls(run.id.clone())?
        .into_iter()
        .rev()
        .find(|t| {
            t.name == TOOL
                && t.status == AgentToolStatus::Completed
                && t.receipt
                    .as_ref()
                    .is_some_and(|r| r["kind"] == "USER_INPUT_REQUEST" && r["run_id"] == run.id.0)
                && !answers.iter().any(|a| a["question_tool_call_id"] == t.id.0)
        }))
}

pub fn accept(
    storage: &StorageHandle,
    run: &AgentRunView,
    id: &MessageId,
) -> Result<Value, DomainError> {
    let existing = receipts(storage, run)?;
    let question = pending(storage, run)?;
    if question.is_none() {
        // Retry after an acknowledgement persisted but before resume completed.
        if run.error_code.as_deref() == Some(REQUIRED)
            && let Some(receipt) = existing.last().filter(|r| r["user_message_id"] == id.0)
        {
            return Ok(receipt.clone());
        }
        return Err(DomainError::Validation(
            "AGENT_USER_INPUT_NOT_REQUESTED".into(),
        ));
    }
    let question = question.unwrap();
    let answer = storage
        .list_conversation_messages(run.conversation_id.clone())?
        .into_iter()
        .find(|m| {
            m.id == *id
                && m.role == ConversationMessageRole::User
                && m.status == ConversationMessageStatus::Completed
                && m.created_at >= question.updated_at
                && !m.content.trim().is_empty()
                && m.content.chars().count() <= 32000
                && !existing.iter().any(|r| r["user_message_id"] == m.id.0)
        })
        .ok_or_else(|| DomainError::Validation("AGENT_USER_INPUT_INVALID".into()))?;
    Ok(
        json!({"kind":"USER_INPUT_RECEIVED","question_tool_call_id":question.id,"user_message_id":answer.id,"source":"EXPLICIT_USER_RESUME","task_complete":false,"verification_eligible":false}),
    )
}

pub fn context(storage: &StorageHandle, run: &AgentRunView) -> Result<Value, DomainError> {
    let accepted = receipts(storage, run)?;
    let messages = storage.list_conversation_messages(run.conversation_id.clone())?;
    let tools = storage.list_agent_tool_calls(run.id.clone())?;
    let pairs=accepted.iter().rev().take(8).rev().filter_map(|r| {
        let message=messages.iter().find(|m|r["user_message_id"]==m.id.0 && m.role==ConversationMessageRole::User && m.status==ConversationMessageStatus::Completed)?;
        let question=tools.iter().find(|t|r["question_tool_call_id"]==t.id.0 && t.name==TOOL)?.receipt.as_ref()?;
        Some(json!({"source_user_message_id":message.id,"question_tool_call_id":r["question_tool_call_id"],"question":question["question"],"answer":message.content}))
    }).collect::<Vec<_>>();
    Ok(
        json!({"accepted_answers":pairs,"older_answers_omitted":accepted.len().saturating_sub(8),"authority":"EXPLICIT_USER_CLARIFICATION_NOT_VERIFICATION"}),
    )
}
