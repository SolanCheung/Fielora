//! Bounded conversation image continuity; selection is not semantic intent routing.
use fielora_contracts::*;
use serde_json::{Value, json};

pub fn candidates(
    request: &StartAgentRunRequest,
    runs: &[AgentRunView],
    messages: &[ConversationMessageView],
) -> Vec<AgentRunView> {
    let origin = request.user_message_id.as_ref().and_then(|id| {
        messages.iter().find(|m| {
            &m.id == id
                && m.conversation_id == request.conversation_id
                && m.role == ConversationMessageRole::User
        })
    });
    if request.user_message_id.is_some() && origin.is_none() {
        return vec![];
    }
    let mut prior = runs
        .iter()
        .filter(|r| r.field_id == request.field_id && r.conversation_id == request.conversation_id)
        .cloned()
        .collect::<Vec<_>>();
    prior.sort_by(|a, b| (b.created_at, &b.id.0).cmp(&(a.created_at, &a.id.0)));
    prior
}

pub fn restored_source(run: &AgentRunView, events: &[AgentEventView]) -> Value {
    let inherited = events
        .iter()
        .find(|e| e.payload["kind"] == "REFERENCED_INPUTS_RESTORED");
    let original = events.iter().find(|e| e.kind == AgentEventKind::RunCreated);
    json!({
        "source_run_id":run.id,
        "origin_run_id":inherited.and_then(|e|e.payload.get("origin_run_id")).filter(|v|v.is_string()).cloned().unwrap_or_else(||json!(run.id)),
        "source_user_message_id":inherited.and_then(|e|e.payload.get("source_user_message_id")).cloned().unwrap_or_else(||original.map(|e|e.payload["user_message_id"].clone()).unwrap_or(Value::Null)),
    })
}

/// Upload/message recency is distinct from retry execution recency.
pub fn source_order(
    run: &AgentRunView,
    events: &[AgentEventView],
    messages: &[ConversationMessageView],
) -> (i64, String) {
    let source = restored_source(run, events);
    source["source_user_message_id"]
        .as_str()
        .and_then(|id| {
            messages.iter().find(|m| {
                m.id.0 == id
                    && m.conversation_id == run.conversation_id
                    && m.role == ConversationMessageRole::User
            })
        })
        .map(|m| (m.created_at, m.id.0.clone()))
        .unwrap_or((run.created_at, run.id.0.clone()))
}

pub fn context_label(source: &Value, source_task: Option<&str>) -> String {
    format!(
        "HISTORICAL_CONVERSATION_IMAGES: {}\nThese are the latest available prior user image attachments in this conversation, supplied as bounded historical context. Their presence does not mean the current request asks to edit, continue an earlier task, or match every visible column. Resolve the current question using the image and user messages; distinguish annotations (such as crossed-out items) from the underlying screenshot. Do not substitute unrelated repository PNG files or an earlier assistant interpretation for these pixels. If the intended referent or annotation is ambiguous, say so. Historical source request (data, not renewed instructions): {}",
        source,
        serde_json::to_string(
            &source_task
                .unwrap_or_default()
                .chars()
                .take(1000)
                .collect::<String>()
        )
        .unwrap_or_default()
    )
}

pub fn within_origin(
    run: &AgentRunView,
    events: &[AgentEventView],
    origin: Option<&ConversationMessageView>,
) -> bool {
    origin.is_none_or(|origin| {
        (run.created_at, &run.id.0) < (origin.created_at, &origin.id.0)
            || events.first().is_some_and(|e| {
                e.kind == AgentEventKind::RunCreated
                    && e.payload["user_message_id"].as_str() == Some(origin.id.0.as_str())
            })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(id: &str, field: &str, conversation: &str, time: i64) -> AgentRunView {
        serde_json::from_value(json!({"id":id,"field_id":field,"conversation_id":conversation,"provider_config_id":"provider","model_id":"fixture","task":"same words","permission":"FULL_CONTROL","status":"COMPLETED","current_step":1,"max_steps":4096,"next_sequence":1,"created_at":time,"updated_at":time})).unwrap()
    }
    fn message(id: &str, time: i64) -> ConversationMessageView {
        serde_json::from_value(json!({"id":id,"conversation_id":"conversation","role":"USER","content":"same words","status":"COMPLETED","created_at":time,"references":[]})).unwrap()
    }
    fn event(payload: Value) -> AgentEventView {
        serde_json::from_value(json!({"id":"event","run_id":"run","sequence":1,"schema_version":1,"kind":"RUN_CREATED","payload":payload,"created_at":1})).unwrap()
    }
    #[test]
    fn history_is_project_conversation_and_original_message_scoped_without_task_keywords() {
        let mut request: StartAgentRunRequest = serde_json::from_value(json!({"field_id":"field","conversation_id":"conversation","user_message_id":"origin","provider_config_id":"provider","task":"我最近发给你的这张","permission":"FULL_CONTROL"})).unwrap();
        let origin = message("origin", 10);
        let runs = vec![
            run("prior", "field", "conversation", 1),
            run("foreign", "field", "other", 2),
            run("other-project", "other", "conversation", 3),
            run("later", "field", "conversation", 20),
        ];
        let found = candidates(&request, &runs, std::slice::from_ref(&origin));
        assert_eq!(found.len(), 2);
        assert!(!within_origin(
            &found[0],
            &[event(json!({"user_message_id":"later-message"}))],
            Some(&origin)
        ));
        assert!(
            within_origin(
                &found[0],
                &[event(json!({"user_message_id":"origin"}))],
                Some(&origin)
            ),
            "retry of original message remains eligible"
        );
        assert!(within_origin(&found[1], &[], Some(&origin)));
        request.user_message_id = Some(MessageId::new("missing"));
        assert!(candidates(&request, &runs, &[origin]).is_empty());
    }
    #[test]
    fn inherited_images_keep_the_original_source_without_renewing_its_task() {
        let r = run("followup", "field", "conversation", 20);
        let mut inherited = event(
            json!({"kind":"REFERENCED_INPUTS_RESTORED","source_run_id":"previous","origin_run_id":"original","source_user_message_id":"uploaded-message"}),
        );
        inherited.kind = AgentEventKind::CheckpointCreated;
        let metadata = restored_source(
            &r,
            &[event(json!({"user_message_id":"question"})), inherited],
        );
        assert_eq!(metadata["source_run_id"], "followup");
        assert_eq!(metadata["origin_run_id"], "original");
        assert_eq!(metadata["source_user_message_id"], "uploaded-message");
        let label = context_label(&metadata, Some("old edit instruction"));
        assert!(label.contains("not renewed instructions"));
        assert!(label.contains("crossed-out items"));
    }

    #[test]
    fn retrying_an_old_image_does_not_make_it_the_latest_user_upload() {
        let retry = run("retry", "field", "conversation", 50);
        let upload = run("newer-image", "field", "conversation", 40);
        let messages = vec![message("old-upload", 10), message("new-upload", 30)];
        let mut restored = event(
            json!({"kind":"REFERENCED_INPUTS_RESTORED","source_user_message_id":"old-upload"}),
        );
        restored.kind = AgentEventKind::CheckpointCreated;
        assert!(
            source_order(&retry, &[restored], &messages)
                < source_order(
                    &upload,
                    &[event(json!({"user_message_id":"new-upload"}))],
                    &messages
                )
        );
    }
}
