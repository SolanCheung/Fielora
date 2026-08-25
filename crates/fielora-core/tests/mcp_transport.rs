#![cfg(feature = "mcp-fixture")]

use fielora_agent::mcp::{MCP_PROTOCOL_VERSION, McpStdioProviderConfig, McpStdioToolProvider};
use fielora_agent::{
    AgentError, CommandCancellation, PolicyEngine, RoutedToolExecutor, ToolExecutor, ToolProvider,
    ToolProviderAvailability, ToolProviderError, ToolRuntime, ToolSourceKind,
    coding_tool_catalog_with_providers,
};
use fielora_contracts::{AgentPermission, AgentPolicyDecision, AgentToolEffect};
use serde_json::json;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use uuid::Uuid;

fn fixture_executable() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_fielora-mcp-fixture"))
        .canonicalize()
        .unwrap()
}

fn provider(mode: &str, extra: &[&Path]) -> Arc<McpStdioToolProvider> {
    let mut arguments = vec![OsString::from(mode)];
    arguments.extend(extra.iter().map(|path| path.as_os_str().to_owned()));
    Arc::new(
        McpStdioToolProvider::new(McpStdioProviderConfig {
            config_key: format!("fixture-{mode}"),
            executable: fixture_executable(),
            arguments,
            working_directory: std::env::current_dir().unwrap(),
        })
        .unwrap(),
    )
}

fn temp_root(label: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("fielora-mcp-{label}-{}", Uuid::now_v7()));
    std::fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn real_stdio_provider_enters_existing_catalog_policy_and_executor() {
    let root = temp_root("pipeline");
    let workspace = root.join("workspace");
    let artifacts = root.join("artifacts");
    std::fs::create_dir_all(&workspace).unwrap();
    std::fs::create_dir_all(&artifacts).unwrap();
    let same_provider = provider("normal", &[]);
    let changed_provider = provider("require-empty-env", &[]);
    let provider = provider("normal", &[]);
    let identity = provider.identity();
    assert_eq!(same_provider.identity(), identity);
    assert_ne!(changed_provider.identity(), identity);
    drop(changed_provider);
    let duplicate_providers: Vec<Arc<dyn ToolProvider>> =
        vec![same_provider.clone(), provider.clone()];
    assert!(coding_tool_catalog_with_providers(&duplicate_providers).is_err());
    drop(duplicate_providers);
    drop(same_provider);
    let providers: Vec<Arc<dyn ToolProvider>> = vec![provider.clone()];
    let catalog = coding_tool_catalog_with_providers(&providers).unwrap();
    let external = catalog
        .iter()
        .find(|spec| spec.source.provider_id == identity.id)
        .unwrap();
    assert_eq!(external.effect, AgentToolEffect::Observe);
    assert_eq!(external.source.source_kind, ToolSourceKind::Mcp);
    assert_eq!(
        external.source.protocol_version.as_deref(),
        Some(MCP_PROTOCOL_VERSION)
    );
    assert_eq!(external.source.transport.as_deref(), Some("STDIO"));
    assert_eq!(
        PolicyEngine.decide(
            AgentPermission::ReadOnly,
            external,
            &json!({"value":"alpha"})
        ),
        AgentPolicyDecision::Allow
    );
    let external_name = external.definition.name.clone();
    let discovery_pid = provider.process_id().unwrap();

    let runtime = ToolRuntime::new(&workspace, &artifacts).unwrap();
    let executor = RoutedToolExecutor::new(runtime, catalog, &providers).unwrap();
    let execution = executor
        .execute(
            &external_name,
            &json!({"value":"alpha"}),
            false,
            &CommandCancellation::default(),
        )
        .unwrap();
    assert_eq!(execution.observation, r#"{"echo":"alpha"}"#);
    assert_eq!(execution.receipt["kind"], "MCP_TOOL_EXECUTION");
    assert_eq!(execution.receipt["success"], true);
    assert_eq!(provider.process_id(), Some(discovery_pid));
    let pid = provider.process_id().unwrap();
    drop(executor);
    drop(providers);
    drop(provider);
    let deadline = Instant::now() + Duration::from_secs(2);
    while process_exists(pid) && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
    assert!(
        !process_exists(pid),
        "provider process {pid} leaked after drop"
    );
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn exact_discover_lifecycle_rejects_wrong_version_without_initialize_fallback() {
    assert!(
        provider("require-empty-env", &[])
            .discover_tools(32)
            .is_ok()
    );
    let wrong_version_provider = provider("wrong-version", &[]);
    assert_eq!(
        wrong_version_provider.discover_tools(32),
        Err(ToolProviderError::ProtocolInvalid)
    );
    assert_eq!(
        wrong_version_provider.availability(),
        ToolProviderAvailability::Unavailable
    );
    assert!(wrong_version_provider.can_attempt_recovery());
    let hanging_provider = provider("hang-discover", &[]);
    assert_eq!(
        hanging_provider.discover_tools(32),
        Err(ToolProviderError::ProtocolInvalid)
    );
    assert_eq!(
        hanging_provider.availability(),
        ToolProviderAvailability::Unavailable
    );
}

#[test]
fn discovery_admission_rejects_untrusted_bounds_and_semantics() {
    for mode in [
        "invalid-schema-root",
        "deep-schema",
        "oversized-schema",
        "unsupported-schema",
        "duplicate-tools",
        "too-many-tools",
        "too-many-pages",
        "aggregate-overflow",
    ] {
        let provider = provider(mode, &[]);
        assert_eq!(
            provider.discover_tools(32),
            Err(ToolProviderError::InvalidDefinition),
            "mode {mode}"
        );
    }
    for mode in [
        "malformed-list",
        "invalid-utf8-list",
        "oversized-list-frame",
        "crash-list",
    ] {
        let provider = provider(mode, &[]);
        assert!(provider.discover_tools(32).is_err(), "mode {mode}");
        assert_eq!(
            provider.availability(),
            ToolProviderAvailability::Unavailable
        );
    }
}

#[test]
fn server_exit_before_call_fails_closed_and_marks_provider_unavailable() {
    let provider = provider("exit-after-list", &[]);
    let native = provider.discover_tools(32).unwrap()[0]
        .provider_tool_name
        .clone();
    thread::sleep(Duration::from_millis(50));
    assert!(matches!(
        provider.execute(
            &native,
            &json!({"value":"alpha"}),
            &CommandCancellation::default()
        ),
        Err(ToolProviderError::Unavailable | ToolProviderError::ProtocolInvalid)
    ));
    assert_eq!(
        provider.availability(),
        ToolProviderAvailability::Unavailable
    );
}

#[test]
fn mrtr_is_fail_closed_without_follow_up_rounds() {
    let provider = provider("mrtr", &[]);
    let native = provider.discover_tools(32).unwrap()[0]
        .provider_tool_name
        .clone();
    assert_eq!(
        provider.execute(
            &native,
            &json!({"value":"alpha"}),
            &CommandCancellation::default()
        ),
        Err(ToolProviderError::InteractionUnsupported)
    );
    assert_eq!(provider.availability(), ToolProviderAvailability::Available);
}

#[test]
fn invalid_arguments_fail_before_any_protocol_call_write() {
    let provider = provider("crash-call", &[]);
    let native = provider.discover_tools(32).unwrap()[0]
        .provider_tool_name
        .clone();
    assert_eq!(
        provider.execute(
            &native,
            &json!({"value":42}),
            &CommandCancellation::default()
        ),
        Err(ToolProviderError::InvalidArguments)
    );
    assert_eq!(provider.availability(), ToolProviderAvailability::Available);
    assert_eq!(
        provider.execute(
            &native,
            &json!({"value":"would-reach-fixture"}),
            &CommandCancellation::default()
        ),
        Err(ToolProviderError::OutcomeUnknown)
    );
}

#[test]
fn known_protocol_and_tool_errors_do_not_become_unknown_outcomes() {
    for mode in ["rpc-error-call", "tool-error"] {
        let provider = provider(mode, &[]);
        let native = provider.discover_tools(32).unwrap()[0]
            .provider_tool_name
            .clone();
        assert_eq!(
            provider.execute(
                &native,
                &json!({"value":"alpha"}),
                &CommandCancellation::default()
            ),
            Err(ToolProviderError::Failed),
            "mode {mode}"
        );
        assert_eq!(provider.availability(), ToolProviderAvailability::Available);
    }
}

#[test]
fn graceful_protocol_cancellation_keeps_provider_healthy() {
    let provider = provider("slow-once", &[]);
    let native = provider.discover_tools(32).unwrap()[0]
        .provider_tool_name
        .clone();
    let cancellation = CommandCancellation::default();
    let execute_provider = provider.clone();
    let execute_cancellation = cancellation.clone();
    let execute_native = native.clone();
    let running = thread::spawn(move || {
        execute_provider.execute(
            &execute_native,
            &json!({"value":"cancelled"}),
            &execute_cancellation,
        )
    });
    thread::sleep(Duration::from_millis(100));
    cancellation.cancel();
    assert_eq!(running.join().unwrap(), Err(ToolProviderError::Cancelled));
    assert_eq!(provider.availability(), ToolProviderAvailability::Available);
    let later = provider
        .execute(
            &native,
            &json!({"value":"later"}),
            &CommandCancellation::default(),
        )
        .unwrap();
    assert_eq!(later.observation, r#"{"echo":"later"}"#);
}

#[test]
fn written_request_failures_are_unknown_and_never_replayed_in_place() {
    for mode in [
        "crash-call",
        "invalid-id",
        "invalid-json-call",
        "invalid-utf8-call",
        "oversized-call-frame",
        "server-request-call",
        "slow",
    ] {
        let provider = provider(mode, &[]);
        let native = provider.discover_tools(32).unwrap()[0]
            .provider_tool_name
            .clone();
        let pid = provider.process_id().unwrap();
        assert_eq!(
            provider.execute(
                &native,
                &json!({"value":"alpha"}),
                &CommandCancellation::default()
            ),
            Err(ToolProviderError::OutcomeUnknown),
            "mode {mode}"
        );
        assert_eq!(
            provider.availability(),
            ToolProviderAvailability::Unavailable
        );
        assert!(provider.can_attempt_recovery());
        let deadline = Instant::now() + Duration::from_secs(2);
        while process_exists(pid) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }
        assert!(!process_exists(pid), "mode {mode} leaked process {pid}");
    }
}

#[test]
fn later_independent_operation_gets_at_most_one_lazy_restart() {
    let provider = provider("crash-call", &[]);
    let first = provider.discover_tools(32).unwrap();
    let native = first[0].provider_tool_name.clone();
    assert_eq!(
        provider.execute(
            &native,
            &json!({"value":"first"}),
            &CommandCancellation::default()
        ),
        Err(ToolProviderError::OutcomeUnknown)
    );
    assert!(provider.can_attempt_recovery());
    assert!(provider.discover_tools(32).is_ok());
    assert!(!provider.can_attempt_recovery());
    assert_eq!(
        provider.execute(
            &native,
            &json!({"value":"second"}),
            &CommandCancellation::default()
        ),
        Err(ToolProviderError::OutcomeUnknown)
    );
    assert_eq!(
        provider.availability(),
        ToolProviderAvailability::Unavailable
    );
    assert!(!provider.can_attempt_recovery());
    assert_eq!(
        provider.discover_tools(32),
        Err(ToolProviderError::Unavailable)
    );
}

#[test]
fn ignored_cancellation_escalates_and_windows_job_kills_descendant() {
    let root = temp_root("job-tree");
    let descendant_pid = root.join("descendant.pid");
    let provider = provider("descendant-ignore-cancel", &[&descendant_pid]);
    let native = provider.discover_tools(32).unwrap()[0]
        .provider_tool_name
        .clone();
    let cancellation = CommandCancellation::default();
    let execute_provider = provider.clone();
    let execute_cancellation = cancellation.clone();
    let running = thread::spawn(move || {
        execute_provider.execute(&native, &json!({"value":"cancel"}), &execute_cancellation)
    });
    let deadline = Instant::now() + Duration::from_secs(2);
    while !descendant_pid.exists() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
    assert!(descendant_pid.exists());
    let pid = std::fs::read_to_string(&descendant_pid)
        .unwrap()
        .parse::<u32>()
        .unwrap();
    cancellation.cancel();
    assert_eq!(running.join().unwrap(), Err(ToolProviderError::Cancelled));
    assert_eq!(
        provider.availability(),
        ToolProviderAvailability::Unavailable
    );
    drop(provider);
    let deadline = Instant::now() + Duration::from_secs(2);
    while process_exists(pid) && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
    assert!(!process_exists(pid), "descendant process {pid} leaked");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn routed_executor_preserves_unknown_error_for_core_durability_mapping() {
    let root = temp_root("unknown-route");
    let workspace = root.join("workspace");
    let artifacts = root.join("artifacts");
    std::fs::create_dir_all(&workspace).unwrap();
    std::fs::create_dir_all(&artifacts).unwrap();
    let provider = provider("crash-call", &[]);
    let providers: Vec<Arc<dyn ToolProvider>> = vec![provider.clone()];
    let catalog = coding_tool_catalog_with_providers(&providers).unwrap();
    let name = catalog
        .iter()
        .find(|tool| tool.source.source_kind == ToolSourceKind::Mcp)
        .unwrap()
        .definition
        .name
        .clone();
    let runtime = ToolRuntime::new(&workspace, &artifacts).unwrap();
    let executor = RoutedToolExecutor::new(runtime, catalog, &providers).unwrap();
    assert_eq!(
        executor.execute(
            &name,
            &json!({"value":"alpha"}),
            false,
            &CommandCancellation::default()
        ),
        Err(AgentError::ToolProviderOutcomeUnknown)
    );
    drop(executor);
    drop(providers);
    drop(provider);
    std::fs::remove_dir_all(root).unwrap();
}

#[cfg(windows)]
fn process_exists(pid: u32) -> bool {
    let filter = format!("PID eq {pid}");
    let output = Command::new("tasklist")
        .args(["/FI", &filter, "/FO", "CSV", "/NH"])
        .output()
        .expect("tasklist");
    String::from_utf8_lossy(&output.stdout).contains(&pid.to_string())
}

#[cfg(not(windows))]
fn process_exists(pid: u32) -> bool {
    PathBuf::from(format!("/proc/{pid}")).exists()
}
