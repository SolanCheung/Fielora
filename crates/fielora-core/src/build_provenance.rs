use fielora_contracts::BuildProvenanceView;
use serde_json::{Value, json};

pub const AGENT_BEHAVIOR_PROFILE_VERSION: &str = "CHINA_CODING_BEHAVIOR_V1";
pub const FAST_EDIT_IMPLEMENTATION_VERSION: &str = "FAST_EDIT_BOUNDED_V1";
pub const CONTEXT_COMPILER_VERSION: &str = "LEXICAL_REPOSITORY_INDEX_V1";

pub fn current() -> BuildProvenanceView {
    BuildProvenanceView {
        git_head: env!("FIELORA_BUILD_GIT_HEAD").into(),
        git_dirty: env!("FIELORA_BUILD_GIT_DIRTY") == "true",
        build_timestamp: env!("FIELORA_BUILD_TIMESTAMP").into(),
        source_fingerprint: env!("FIELORA_SOURCE_FINGERPRINT").into(),
        agent_core_fingerprint: env!("FIELORA_AGENT_CORE_FINGERPRINT").into(),
        agent_behavior_profile_version: AGENT_BEHAVIOR_PROFILE_VERSION.into(),
        fast_edit_implementation_version: FAST_EDIT_IMPLEMENTATION_VERSION.into(),
        context_compiler_version: CONTEXT_COMPILER_VERSION.into(),
        desktop_renderer_version: env!("FIELORA_DESKTOP_RENDERER_FINGERPRINT").into(),
    }
}

pub fn event_payload() -> Value {
    let value = current();
    json!({
        "git_head":value.git_head,
        "git_dirty":value.git_dirty,
        "build_timestamp":value.build_timestamp,
        "source_fingerprint":value.source_fingerprint,
        "agent_core_fingerprint":value.agent_core_fingerprint,
        "agent_behavior_profile_version":value.agent_behavior_profile_version,
        "fast_edit_implementation_version":value.fast_edit_implementation_version,
        "context_compiler_version":value.context_compiler_version,
        "desktop_renderer_version":value.desktop_renderer_version,
    })
}
