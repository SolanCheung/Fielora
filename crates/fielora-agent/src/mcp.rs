//! Bounded MCP 2026-07-28 read-only stdio adapter.
//!
//! MCP contributes tool definitions and execution through the existing
//! `ToolProvider` seam. It does not own policy, approval, Agent lifecycle,
//! durable ToolCall records, receipts, or verification.

use crate::{
    CommandCancellation, ProviderToolDefinition, ToolExecution, ToolProvider,
    ToolProviderAvailability, ToolProviderError, ToolProviderIdentity, ToolSourceKind,
};
use fielora_contracts::ModelToolDefinition;
use fielora_platform::{ManagedChild, ManagedChildConfig, ManagedChildStdio};
use futures_util::{SinkExt, StreamExt};
use rmcp::model::{
    CallToolRequest, CallToolRequestParams, CallToolResponse, ClientRequest, JsonObject,
    JsonRpcMessage, ListToolsRequest, PaginatedRequestParams, ProtocolVersion, ServerResult,
};
use rmcp::service::{
    PeerRequestOptions, RunningService, RxJsonRpcMessage, ServiceError, TxJsonRpcMessage,
};
use rmcp::transport::Transport;
use rmcp::transport::async_rw::{JsonRpcMessageCodec, JsonRpcMessageCodecError};
use rmcp::{ClientLifecycleMode, RoleClient, serve_client_with_lifecycle};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio::process::{ChildStdin, ChildStdout};
use tokio::runtime::{Builder, Runtime};
use tokio::task::JoinHandle;
use tokio_util::codec::{FramedRead, FramedWrite};

pub const MCP_PROTOCOL_VERSION: &str = "2026-07-28";
pub const MCP_TRANSPORT: &str = "STDIO";

const MAX_STDOUT_FRAME_BYTES: usize = 256 * 1024;
const MAX_DISCOVERY_BYTES: usize = 512 * 1024;
const MAX_TOOLS: usize = 32;
const MAX_DISCOVERY_PAGES: usize = 4;
const MAX_SCHEMA_BYTES: usize = 64 * 1024;
const MAX_SCHEMA_DEPTH: usize = 16;
const MAX_ARGUMENT_BYTES: usize = 64 * 1024;
const MAX_NATIVE_TOOL_NAME_BYTES: usize = 80;
const MAX_DESCRIPTION_BYTES: usize = 4 * 1024;
const MAX_OBSERVATION_BYTES: usize = 64 * 1024;
const MAX_STDERR_OBSERVED_BYTES: usize = 64 * 1024;
const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(3);
const PAGE_TIMEOUT: Duration = Duration::from_secs(2);
const CALL_TIMEOUT: Duration = Duration::from_secs(3);
const CANCELLATION_GRACE: Duration = Duration::from_millis(500);
const SHUTDOWN_GRACE: Duration = Duration::from_millis(500);
const TERMINATION_GRACE: Duration = Duration::from_millis(500);
const POLL_INTERVAL: Duration = Duration::from_millis(10);

#[derive(Debug, Clone)]
pub struct McpStdioProviderConfig {
    pub config_key: String,
    pub executable: PathBuf,
    pub arguments: Vec<OsString>,
    pub working_directory: PathBuf,
}

pub struct McpStdioToolProvider {
    identity: ToolProviderIdentity,
    commands: mpsc::SyncSender<WorkerCommand>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    health: Arc<AtomicU8>,
    recoverable: Arc<AtomicBool>,
}

impl std::fmt::Debug for McpStdioToolProvider {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("McpStdioToolProvider")
            .field("identity", &self.identity)
            .field("availability", &self.availability())
            .finish_non_exhaustive()
    }
}

impl McpStdioToolProvider {
    pub fn new(config: McpStdioProviderConfig) -> Result<Self, ToolProviderError> {
        let (config, identity) = validate_config_and_identity(config)?;
        let (commands, receiver) = mpsc::sync_channel(1);
        let health = Arc::new(AtomicU8::new(Health::Available as u8));
        let recoverable = Arc::new(AtomicBool::new(false));
        let worker_health = health.clone();
        let worker_recoverable = recoverable.clone();
        let worker = thread::Builder::new()
            .name("fielora-mcp-provider".into())
            .spawn(move || {
                run_worker(config, receiver, worker_health, worker_recoverable);
            })
            .map_err(|_| ToolProviderError::Unavailable)?;
        Ok(Self {
            identity,
            commands,
            worker: Mutex::new(Some(worker)),
            health,
            recoverable,
        })
    }

    pub fn process_id(&self) -> Option<u32> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.commands.send(WorkerCommand::ProcessId(reply)).ok()?;
        receive.recv().ok().flatten()
    }
}

impl ToolProvider for McpStdioToolProvider {
    fn identity(&self) -> ToolProviderIdentity {
        self.identity.clone()
    }

    fn availability(&self) -> ToolProviderAvailability {
        if self.health.load(Ordering::Acquire) == Health::Available as u8 {
            ToolProviderAvailability::Available
        } else {
            ToolProviderAvailability::Unavailable
        }
    }

    fn can_attempt_recovery(&self) -> bool {
        self.recoverable.load(Ordering::Acquire)
    }

    fn source_kind(&self) -> ToolSourceKind {
        ToolSourceKind::Mcp
    }

    fn protocol_version(&self) -> Option<&'static str> {
        Some(MCP_PROTOCOL_VERSION)
    }

    fn transport(&self) -> Option<&'static str> {
        Some(MCP_TRANSPORT)
    }

    fn discover_tools(
        &self,
        limit: usize,
    ) -> Result<Vec<ProviderToolDefinition>, ToolProviderError> {
        if limit == 0 || limit > MAX_TOOLS {
            return Err(ToolProviderError::InvalidDefinition);
        }
        let (reply, receive) = mpsc::sync_channel(1);
        self.commands
            .send(WorkerCommand::Discover { limit, reply })
            .map_err(|_| ToolProviderError::Unavailable)?;
        receive
            .recv()
            .unwrap_or(Err(ToolProviderError::Unavailable))
    }

    fn execute(
        &self,
        provider_tool_name: &str,
        arguments: &Value,
        cancellation: &CommandCancellation,
    ) -> Result<ToolExecution, ToolProviderError> {
        if cancellation.is_cancelled() {
            return Err(ToolProviderError::Cancelled);
        }
        let (reply, receive) = mpsc::sync_channel(1);
        self.commands
            .send(WorkerCommand::Execute {
                native_name: provider_tool_name.to_owned(),
                arguments: arguments.clone(),
                cancellation: cancellation.clone(),
                reply,
            })
            .map_err(|_| ToolProviderError::Unavailable)?;
        receive
            .recv()
            .unwrap_or(Err(ToolProviderError::Unavailable))
    }
}

impl Drop for McpStdioToolProvider {
    fn drop(&mut self) {
        let _ = self.commands.send(WorkerCommand::Shutdown);
        if let Some(worker) = self.worker.lock().ok().and_then(|mut worker| worker.take()) {
            let _ = worker.join();
        }
    }
}

enum WorkerCommand {
    Discover {
        limit: usize,
        reply: mpsc::SyncSender<Result<Vec<ProviderToolDefinition>, ToolProviderError>>,
    },
    Execute {
        native_name: String,
        arguments: Value,
        cancellation: CommandCancellation,
        reply: mpsc::SyncSender<Result<ToolExecution, ToolProviderError>>,
    },
    ProcessId(mpsc::SyncSender<Option<u32>>),
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
enum Health {
    Available = 1,
    Unavailable = 2,
}

struct WorkerState {
    config: McpStdioProviderConfig,
    identity: ToolProviderIdentity,
    runtime: Runtime,
    session: Option<McpSession>,
    admitted_schemas: HashMap<String, Value>,
    started_once: bool,
    restart_used: bool,
    health: Arc<AtomicU8>,
    recoverable: Arc<AtomicBool>,
}

fn run_worker(
    config: McpStdioProviderConfig,
    receiver: mpsc::Receiver<WorkerCommand>,
    health: Arc<AtomicU8>,
    recoverable: Arc<AtomicBool>,
) {
    let runtime = match Builder::new_current_thread().enable_all().build() {
        Ok(runtime) => runtime,
        Err(_) => {
            health.store(Health::Unavailable as u8, Ordering::Release);
            return;
        }
    };
    let identity = validate_config_and_identity(config.clone())
        .map(|(_, identity)| identity)
        .expect("validated MCP config changed before worker start");
    let mut state = WorkerState {
        config,
        identity,
        runtime,
        session: None,
        admitted_schemas: HashMap::new(),
        started_once: false,
        restart_used: false,
        health,
        recoverable,
    };
    while let Ok(command) = receiver.recv() {
        match command {
            WorkerCommand::Discover { limit, reply } => {
                let result = discover(&mut state, limit);
                let _ = reply.send(result);
            }
            WorkerCommand::Execute {
                native_name,
                arguments,
                cancellation,
                reply,
            } => {
                let result = execute(&mut state, &native_name, &arguments, &cancellation);
                let _ = reply.send(result);
            }
            WorkerCommand::ProcessId(reply) => {
                let id = state
                    .session
                    .as_mut()
                    .and_then(|session| session.process.id());
                let _ = reply.send(id);
            }
            WorkerCommand::Shutdown => break,
        }
    }
    retire_session(&mut state);
    state.runtime.shutdown_timeout(TERMINATION_GRACE);
}

fn ensure_session(state: &mut WorkerState) -> Result<(), ToolProviderError> {
    if state.session.is_some() {
        return Ok(());
    }
    if state.started_once {
        if state.restart_used {
            state
                .health
                .store(Health::Unavailable as u8, Ordering::Release);
            state.recoverable.store(false, Ordering::Release);
            return Err(ToolProviderError::Unavailable);
        }
        state.restart_used = true;
    }
    state.started_once = true;
    state.recoverable.store(false, Ordering::Release);
    match McpSession::start(&state.runtime, &state.config) {
        Ok(session) => {
            state.session = Some(session);
            state
                .health
                .store(Health::Available as u8, Ordering::Release);
            Ok(())
        }
        Err(error) => {
            state
                .health
                .store(Health::Unavailable as u8, Ordering::Release);
            state
                .recoverable
                .store(!state.restart_used, Ordering::Release);
            Err(error)
        }
    }
}

fn mark_fatal(state: &mut WorkerState) {
    retire_session(state);
    state
        .health
        .store(Health::Unavailable as u8, Ordering::Release);
    state
        .recoverable
        .store(!state.restart_used, Ordering::Release);
}

fn retire_session(state: &mut WorkerState) {
    if let Some(session) = state.session.take() {
        session.shutdown(&state.runtime);
    }
}

struct McpSession {
    service: RunningService<RoleClient, ()>,
    process: ManagedChild,
    transport_state: Arc<TransportState>,
    stderr_task: JoinHandle<usize>,
}

impl McpSession {
    fn start(
        runtime: &Runtime,
        config: &McpStdioProviderConfig,
    ) -> Result<Self, ToolProviderError> {
        let process_config = ManagedChildConfig {
            executable: config.executable.clone(),
            arguments: config.arguments.clone(),
            working_directory: config.working_directory.clone(),
            environment: Vec::new(),
        };
        let (process, stdin, stdout, stderr_task) = runtime.block_on(async move {
            let (process, stdio) =
                ManagedChild::spawn(process_config).map_err(|_| ToolProviderError::Unavailable)?;
            let ManagedChildStdio {
                stdin,
                stdout,
                mut stderr,
            } = stdio;
            let stderr_task = tokio::spawn(async move {
                let mut observed = 0usize;
                let mut buffer = [0u8; 4096];
                loop {
                    match stderr.read(&mut buffer).await {
                        Ok(0) | Err(_) => break,
                        Ok(read) => {
                            observed = observed.saturating_add(read).min(MAX_STDERR_OBSERVED_BYTES);
                        }
                    }
                }
                observed
            });
            Ok::<_, ToolProviderError>((process, stdin, stdout, stderr_task))
        })?;
        let (transport, transport_state) = BoundedStdioTransport::new(stdin, stdout);
        let service = match runtime.block_on(async {
            tokio::time::timeout(
                DISCOVERY_TIMEOUT,
                serve_client_with_lifecycle(
                    (),
                    transport,
                    ClientLifecycleMode::Discover {
                        preferred_versions: vec![ProtocolVersion::V_2026_07_28],
                    },
                ),
            )
            .await
        }) {
            Ok(Ok(service)) => service,
            _ => {
                let mut process = process;
                let _ = runtime.block_on(process.shutdown(SHUTDOWN_GRACE, TERMINATION_GRACE));
                return Err(ToolProviderError::ProtocolInvalid);
            }
        };
        let exact_version = service
            .peer_info()
            .is_some_and(|info| info.protocol_version == ProtocolVersion::V_2026_07_28);
        if !exact_version {
            let mut service = service;
            let mut process = process;
            let _ = runtime.block_on(service.close_with_timeout(SHUTDOWN_GRACE));
            let _ = runtime.block_on(process.shutdown(SHUTDOWN_GRACE, TERMINATION_GRACE));
            return Err(ToolProviderError::ProtocolInvalid);
        }
        Ok(Self {
            service,
            process,
            transport_state,
            stderr_task,
        })
    }

    fn shutdown(mut self, runtime: &Runtime) {
        let _ = runtime.block_on(self.service.close_with_timeout(SHUTDOWN_GRACE));
        let _ = runtime.block_on(self.process.shutdown(SHUTDOWN_GRACE, TERMINATION_GRACE));
        if runtime
            .block_on(async {
                tokio::time::timeout(TERMINATION_GRACE, &mut self.stderr_task).await
            })
            .is_err()
        {
            self.stderr_task.abort();
        }
    }
}

fn discover(
    state: &mut WorkerState,
    limit: usize,
) -> Result<Vec<ProviderToolDefinition>, ToolProviderError> {
    ensure_session(state)?;
    let session = state
        .session
        .as_mut()
        .ok_or(ToolProviderError::Unavailable)?;
    session.transport_state.clear_failure();
    let result = state.runtime.block_on(async {
        let mut tools = Vec::new();
        let mut cursor = None;
        let mut seen_cursors = HashSet::new();
        let mut aggregate_bytes = 0usize;
        for _ in 0..MAX_DISCOVERY_PAGES {
            let params = Some(PaginatedRequestParams::default().with_cursor(cursor.clone()));
            let page = tokio::time::timeout(PAGE_TIMEOUT, session.service.list_tools(params))
                .await
                .map_err(|_| ToolProviderError::Timeout)?
                .map_err(|_| ToolProviderError::ProtocolInvalid)?;
            aggregate_bytes = aggregate_bytes
                .checked_add(
                    serde_json::to_vec(&page.tools)
                        .map_err(|_| ToolProviderError::ProtocolInvalid)?
                        .len(),
                )
                .ok_or(ToolProviderError::InvalidDefinition)?;
            if aggregate_bytes > MAX_DISCOVERY_BYTES
                || tools.len().saturating_add(page.tools.len()) > limit
            {
                return Err(ToolProviderError::InvalidDefinition);
            }
            tools.extend(page.tools);
            cursor = page.next_cursor;
            match &cursor {
                None => return Ok(tools),
                Some(next) if seen_cursors.insert(next.clone()) => {}
                Some(_) => return Err(ToolProviderError::InvalidDefinition),
            }
        }
        Err(ToolProviderError::InvalidDefinition)
    });
    let tools = match result {
        Ok(tools) => tools,
        Err(error) => {
            if session.transport_state.failure().is_some() || session.service.is_closed() {
                mark_fatal(state);
            }
            return Err(error);
        }
    };
    let mut admitted = Vec::with_capacity(tools.len());
    let mut native_names = HashSet::new();
    let mut native_schemas = HashMap::new();
    for tool in tools {
        let native_name = tool.name.into_owned();
        if !valid_native_name(&native_name) || !native_names.insert(native_name.clone()) {
            return Err(ToolProviderError::InvalidDefinition);
        }
        let schema = Value::Object((*tool.input_schema).clone());
        let schema_bytes =
            serde_json::to_vec(&schema).map_err(|_| ToolProviderError::InvalidDefinition)?;
        if schema.get("type").and_then(Value::as_str) != Some("object")
            || schema_bytes.len() > MAX_SCHEMA_BYTES
            || json_depth(&schema) > MAX_SCHEMA_DEPTH
            || !schema_shape_is_valid(&schema)
        {
            return Err(ToolProviderError::InvalidDefinition);
        }
        let description = tool
            .description
            .map(|description| description.into_owned())
            .unwrap_or_else(|| "External read-only MCP tool.".into());
        if description.len() > MAX_DESCRIPTION_BYTES {
            return Err(ToolProviderError::InvalidDefinition);
        }
        let capability_id = format!("{}.{}", state.identity.id, native_name);
        let version_digest = digest_hex(&[
            state.identity.version.as_bytes(),
            native_name.as_bytes(),
            &schema_bytes,
        ]);
        let capability_version = format!("mcp-{}.{}", MCP_PROTOCOL_VERSION, &version_digest[..16]);
        admitted.push(ProviderToolDefinition {
            capability_id: capability_id.clone(),
            capability_version,
            provider_tool_name: native_name.clone(),
            effect: fielora_contracts::AgentToolEffect::Observe,
            definition: ModelToolDefinition {
                name: capability_id,
                description,
                input_schema: schema.clone(),
            },
        });
        native_schemas.insert(native_name, schema);
    }
    state.admitted_schemas = native_schemas;
    Ok(admitted)
}

fn execute(
    state: &mut WorkerState,
    native_name: &str,
    arguments: &Value,
    cancellation: &CommandCancellation,
) -> Result<ToolExecution, ToolProviderError> {
    let arguments = arguments
        .as_object()
        .cloned()
        .ok_or(ToolProviderError::InvalidArguments)?;
    let argument_value = Value::Object(arguments.clone());
    if serde_json::to_vec(&argument_value)
        .map_err(|_| ToolProviderError::InvalidArguments)?
        .len()
        > MAX_ARGUMENT_BYTES
        || json_depth(&argument_value) > MAX_SCHEMA_DEPTH
    {
        return Err(ToolProviderError::InvalidArguments);
    }
    let schema = state
        .admitted_schemas
        .get(native_name)
        .ok_or(ToolProviderError::InvalidDefinition)?;
    if !value_matches_schema(&argument_value, schema) {
        return Err(ToolProviderError::InvalidArguments);
    }
    ensure_session(state)?;
    let session = state
        .session
        .as_mut()
        .ok_or(ToolProviderError::Unavailable)?;
    session.transport_state.prepare_call();
    let call = state.runtime.block_on(execute_call(
        &session.service,
        &session.transport_state,
        native_name,
        arguments,
        cancellation,
    ));
    match call {
        CallDisposition::Complete(execution) => Ok(execution),
        CallDisposition::Known(error) => Err(error),
        CallDisposition::Fatal(error) => {
            mark_fatal(state);
            Err(error)
        }
    }
}

enum CallDisposition {
    Complete(ToolExecution),
    Known(ToolProviderError),
    Fatal(ToolProviderError),
}

async fn execute_call(
    service: &RunningService<RoleClient, ()>,
    transport_state: &Arc<TransportState>,
    native_name: &str,
    arguments: JsonObject,
    cancellation: &CommandCancellation,
) -> CallDisposition {
    let params = CallToolRequestParams::new(native_name.to_owned()).with_arguments(arguments);
    let request = ClientRequest::CallToolRequest(CallToolRequest::new(params));
    let mut handle = match service
        .peer()
        .send_cancellable_request(request, PeerRequestOptions::no_options())
        .await
    {
        Ok(handle) => handle,
        Err(_) => return CallDisposition::Fatal(ToolProviderError::Unavailable),
    };
    let started = Instant::now();
    loop {
        match handle.rx.try_recv() {
            Ok(Ok(result)) => return map_call_result(result),
            Ok(Err(ServiceError::McpError(_))) => {
                return CallDisposition::Known(ToolProviderError::Failed);
            }
            Ok(Err(_)) | Err(tokio::sync::oneshot::error::TryRecvError::Closed) => {
                return if transport_state.call_written.load(Ordering::Acquire) {
                    CallDisposition::Fatal(ToolProviderError::OutcomeUnknown)
                } else {
                    CallDisposition::Fatal(ToolProviderError::ProtocolInvalid)
                };
            }
            Err(tokio::sync::oneshot::error::TryRecvError::Empty) => {}
        }
        if cancellation.is_cancelled() {
            let written = transport_state.call_written.load(Ordering::Acquire);
            let _ = handle
                .cancel(Some("Fielora tool call cancelled".into()))
                .await;
            if !written {
                return CallDisposition::Fatal(ToolProviderError::Cancelled);
            }
            let healthy = health_probe(service).await;
            return if healthy {
                CallDisposition::Known(ToolProviderError::Cancelled)
            } else {
                CallDisposition::Fatal(ToolProviderError::Cancelled)
            };
        }
        if started.elapsed() >= CALL_TIMEOUT {
            let written = transport_state.call_written.load(Ordering::Acquire);
            let _ = handle
                .cancel(Some("Fielora tool call timeout".into()))
                .await;
            return if written {
                CallDisposition::Fatal(ToolProviderError::OutcomeUnknown)
            } else {
                CallDisposition::Fatal(ToolProviderError::Timeout)
            };
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

fn schema_shape_is_valid(schema: &Value) -> bool {
    let Some(schema) = schema.as_object() else {
        return false;
    };
    if schema.keys().any(|key| {
        !matches!(
            key.as_str(),
            "type"
                | "properties"
                | "required"
                | "additionalProperties"
                | "items"
                | "enum"
                | "const"
                | "description"
                | "title"
        )
    }) {
        return false;
    }
    if let Some(schema_type) = schema.get("type") {
        let valid = match schema_type {
            Value::String(schema_type) => valid_schema_type(schema_type),
            Value::Array(schema_types) => {
                !schema_types.is_empty()
                    && schema_types
                        .iter()
                        .all(|schema_type| schema_type.as_str().is_some_and(valid_schema_type))
            }
            _ => false,
        };
        if !valid {
            return false;
        }
    }
    if let Some(required) = schema.get("required") {
        let Some(required) = required.as_array() else {
            return false;
        };
        if required.iter().any(|name| !name.is_string()) {
            return false;
        }
    }
    if let Some(properties) = schema.get("properties") {
        let Some(properties) = properties.as_object() else {
            return false;
        };
        if properties
            .values()
            .any(|child| !schema_shape_is_valid(child))
        {
            return false;
        }
    }
    if let Some(items) = schema.get("items")
        && !schema_shape_is_valid(items)
    {
        return false;
    }
    if schema
        .get("additionalProperties")
        .is_some_and(|value| !value.is_boolean())
        || schema.get("enum").is_some_and(|value| !value.is_array())
        || ["description", "title"]
            .iter()
            .any(|key| schema.get(*key).is_some_and(|value| !value.is_string()))
    {
        return false;
    }
    true
}

fn valid_schema_type(schema_type: &str) -> bool {
    matches!(
        schema_type,
        "null" | "boolean" | "object" | "array" | "number" | "integer" | "string"
    )
}

fn value_matches_schema(value: &Value, schema: &Value) -> bool {
    let Some(schema) = schema.as_object() else {
        return false;
    };
    if let Some(allowed) = schema.get("enum").and_then(Value::as_array)
        && !allowed.contains(value)
    {
        return false;
    }
    if let Some(constant) = schema.get("const")
        && constant != value
    {
        return false;
    }
    if let Some(schema_type) = schema.get("type") {
        let type_matches = match schema_type {
            Value::String(schema_type) => value_matches_type(value, schema_type),
            Value::Array(schema_types) => schema_types.iter().any(|schema_type| {
                schema_type
                    .as_str()
                    .is_some_and(|schema_type| value_matches_type(value, schema_type))
            }),
            _ => false,
        };
        if !type_matches {
            return false;
        }
    }
    if let Some(object) = value.as_object() {
        let properties = schema.get("properties").and_then(Value::as_object);
        if let Some(required) = schema.get("required").and_then(Value::as_array)
            && required
                .iter()
                .any(|name| name.as_str().is_none_or(|name| !object.contains_key(name)))
        {
            return false;
        }
        if schema.get("additionalProperties") == Some(&Value::Bool(false))
            && object
                .keys()
                .any(|name| properties.is_none_or(|properties| !properties.contains_key(name)))
        {
            return false;
        }
        if let Some(properties) = properties
            && properties.iter().any(|(name, child_schema)| {
                object
                    .get(name)
                    .is_some_and(|child| !value_matches_schema(child, child_schema))
            })
        {
            return false;
        }
    }
    if let Some(array) = value.as_array()
        && let Some(items) = schema.get("items")
        && array.iter().any(|item| !value_matches_schema(item, items))
    {
        return false;
    }
    true
}

fn value_matches_type(value: &Value, schema_type: &str) -> bool {
    match schema_type {
        "null" => value.is_null(),
        "boolean" => value.is_boolean(),
        "object" => value.is_object(),
        "array" => value.is_array(),
        "number" => value.is_number(),
        "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
        "string" => value.is_string(),
        _ => false,
    }
}

fn map_call_result(result: ServerResult) -> CallDisposition {
    let response = match result {
        ServerResult::CallToolResult(result) => CallToolResponse::Complete(result),
        ServerResult::InputRequiredResult(result) => CallToolResponse::InputRequired(result),
        ServerResult::CreateTaskResult(result) => CallToolResponse::Task(result),
        _ => return CallDisposition::Fatal(ToolProviderError::OutcomeUnknown),
    };
    match response {
        CallToolResponse::Complete(result) => {
            if result.is_error == Some(true) {
                return CallDisposition::Known(ToolProviderError::Failed);
            }
            let observation_value = result.structured_content.unwrap_or_else(|| {
                let text = result
                    .content
                    .iter()
                    .filter_map(|content| content.as_text().map(|text| text.text.clone()))
                    .collect::<Vec<_>>()
                    .join("\n");
                Value::String(text)
            });
            let observation = match serde_json::to_string(&observation_value) {
                Ok(observation) if observation.len() <= MAX_OBSERVATION_BYTES => observation,
                _ => return CallDisposition::Known(ToolProviderError::ProtocolInvalid),
            };
            CallDisposition::Complete(ToolExecution {
                receipt: json!({
                    "kind":"MCP_TOOL_EXECUTION",
                    "success":true,
                    "protocol_version":MCP_PROTOCOL_VERSION,
                    "transport":MCP_TRANSPORT,
                }),
                observation,
            })
        }
        CallToolResponse::InputRequired(_) | CallToolResponse::Task(_) => {
            CallDisposition::Known(ToolProviderError::InteractionUnsupported)
        }
        _ => CallDisposition::Known(ToolProviderError::InteractionUnsupported),
    }
}

async fn health_probe(service: &RunningService<RoleClient, ()>) -> bool {
    let request = ClientRequest::ListToolsRequest(ListToolsRequest {
        method: Default::default(),
        params: None,
        extensions: Default::default(),
    });
    let handle = match service
        .peer()
        .send_cancellable_request(
            request,
            PeerRequestOptions::with_timeout(CANCELLATION_GRACE),
        )
        .await
    {
        Ok(handle) => handle,
        Err(_) => return false,
    };
    matches!(
        handle.await_response().await,
        Ok(ServerResult::ListToolsResult(_))
    )
}

fn validate_config_and_identity(
    config: McpStdioProviderConfig,
) -> Result<(McpStdioProviderConfig, ToolProviderIdentity), ToolProviderError> {
    if config.config_key.is_empty() || config.config_key.len() > 128 || config.arguments.len() > 128
    {
        return Err(ToolProviderError::InvalidDefinition);
    }
    let executable = config
        .executable
        .canonicalize()
        .map_err(|_| ToolProviderError::Unavailable)?;
    let working_directory = config
        .working_directory
        .canonicalize()
        .map_err(|_| ToolProviderError::Unavailable)?;
    if !executable.is_file() || !working_directory.is_dir() {
        return Err(ToolProviderError::Unavailable);
    }
    let executable_bytes = fs::read(&executable).map_err(|_| ToolProviderError::Unavailable)?;
    let executable_fingerprint = digest_hex(&[&executable_bytes]);
    let canonical_config = json!({
        "config_key":config.config_key,
        "executable":executable.to_string_lossy(),
        "arguments":config.arguments.iter().map(|value| value.to_string_lossy()).collect::<Vec<_>>(),
        "working_directory":working_directory.to_string_lossy(),
        "protocol":MCP_PROTOCOL_VERSION,
        "transport":MCP_TRANSPORT,
        "executable_sha256":executable_fingerprint,
    });
    let config_bytes =
        serde_json::to_vec(&canonical_config).map_err(|_| ToolProviderError::InvalidDefinition)?;
    let identity_digest = digest_hex(&[&config_bytes]);
    let normalized_key = normalize_key(
        canonical_config
            .get("config_key")
            .and_then(Value::as_str)
            .ok_or(ToolProviderError::InvalidDefinition)?,
    );
    let identity = ToolProviderIdentity {
        id: format!("mcp.local.{}.{}", normalized_key, &identity_digest[..12]),
        version: format!("mcp-{}.{}", MCP_PROTOCOL_VERSION, &identity_digest[..16]),
    };
    Ok((
        McpStdioProviderConfig {
            config_key: canonical_config["config_key"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
            executable,
            arguments: config.arguments,
            working_directory,
        },
        identity,
    ))
}

fn normalize_key(value: &str) -> String {
    let normalized = value
        .bytes()
        .map(|byte| {
            let byte = byte.to_ascii_lowercase();
            if byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-') {
                byte as char
            } else {
                '-'
            }
        })
        .take(24)
        .collect::<String>()
        .trim_matches('-')
        .to_owned();
    if normalized.is_empty() {
        "provider".into()
    } else {
        normalized
    }
}

fn valid_native_name(value: &str) -> bool {
    (1..=MAX_NATIVE_TOOL_NAME_BYTES).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn json_depth(value: &Value) -> usize {
    match value {
        Value::Array(values) => 1 + values.iter().map(json_depth).max().unwrap_or(0),
        Value::Object(values) => 1 + values.values().map(json_depth).max().unwrap_or(0),
        _ => 1,
    }
}

fn digest_hex(parts: &[&[u8]]) -> String {
    let mut digest = Sha256::new();
    for part in parts {
        digest.update(part);
    }
    format!("{:x}", digest.finalize())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TransportFailure {
    EndOfStream,
    OversizedFrame,
    InvalidJson,
    Io,
}

struct TransportState {
    call_written: AtomicBool,
    failure: Mutex<Option<TransportFailure>>,
}

impl TransportState {
    fn prepare_call(&self) {
        self.call_written.store(false, Ordering::Release);
        self.clear_failure();
    }

    fn clear_failure(&self) {
        if let Ok(mut failure) = self.failure.lock() {
            *failure = None;
        }
    }

    fn record_failure(&self, failure: TransportFailure) {
        if let Ok(mut current) = self.failure.lock() {
            *current = Some(failure);
        }
    }

    fn failure(&self) -> Option<TransportFailure> {
        self.failure.lock().ok().and_then(|failure| *failure)
    }
}

type ClientTx = TxJsonRpcMessage<RoleClient>;
type ClientRx = RxJsonRpcMessage<RoleClient>;
type Writer = FramedWrite<ChildStdin, JsonRpcMessageCodec<ClientTx>>;
type Reader = FramedRead<ChildStdout, JsonRpcMessageCodec<ClientRx>>;

struct BoundedStdioTransport {
    writer: Arc<tokio::sync::Mutex<Writer>>,
    reader: Reader,
    state: Arc<TransportState>,
}

impl BoundedStdioTransport {
    fn new(stdin: ChildStdin, stdout: ChildStdout) -> (Self, Arc<TransportState>) {
        let state = Arc::new(TransportState {
            call_written: AtomicBool::new(false),
            failure: Mutex::new(None),
        });
        (
            Self {
                writer: Arc::new(tokio::sync::Mutex::new(FramedWrite::new(
                    stdin,
                    JsonRpcMessageCodec::new_with_max_length(MAX_STDOUT_FRAME_BYTES),
                ))),
                reader: FramedRead::new(
                    stdout,
                    JsonRpcMessageCodec::new_with_max_length(MAX_STDOUT_FRAME_BYTES),
                ),
                state: state.clone(),
            },
            state,
        )
    }
}

impl Transport<RoleClient> for BoundedStdioTransport {
    type Error = JsonRpcMessageCodecError;

    fn send(
        &mut self,
        item: ClientTx,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + 'static {
        let writer = self.writer.clone();
        let state = self.state.clone();
        let is_call = matches!(
            &item,
            JsonRpcMessage::Request(request)
                if matches!(&request.request, ClientRequest::CallToolRequest(_))
        );
        async move {
            writer.lock().await.send(item).await?;
            if is_call {
                state.call_written.store(true, Ordering::Release);
            }
            Ok(())
        }
    }

    async fn receive(&mut self) -> Option<ClientRx> {
        match self.reader.next().await {
            Some(Ok(message)) => Some(message),
            Some(Err(JsonRpcMessageCodecError::MaxLineLengthExceeded)) => {
                self.state.record_failure(TransportFailure::OversizedFrame);
                None
            }
            Some(Err(JsonRpcMessageCodecError::Serde(_))) => {
                self.state.record_failure(TransportFailure::InvalidJson);
                None
            }
            Some(Err(JsonRpcMessageCodecError::Io(_))) => {
                self.state.record_failure(TransportFailure::Io);
                None
            }
            Some(Err(_)) => {
                self.state.record_failure(TransportFailure::Io);
                None
            }
            None => {
                self.state.record_failure(TransportFailure::EndOfStream);
                None
            }
        }
    }

    fn close(&mut self) -> impl Future<Output = Result<(), Self::Error>> + Send {
        let writer = self.writer.clone();
        async move { writer.lock().await.close().await }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_depth_is_bounded_structurally() {
        assert_eq!(json_depth(&json!({"type":"object"})), 2);
        let mut deep = Value::Null;
        for _ in 0..17 {
            deep = json!({"nested":deep});
        }
        assert!(json_depth(&deep) > MAX_SCHEMA_DEPTH);
    }

    #[test]
    fn provider_key_normalization_is_stable_and_bounded() {
        assert_eq!(normalize_key("Local Fixture"), "local-fixture");
        assert!(normalize_key(&"a".repeat(200)).len() <= 24);
    }
}
