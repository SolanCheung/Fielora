use fielora_contracts::{
    CoreHealthState, CreateFieldRequest, DomainEventDTO, FieldReferenceRequest, FieldSummary,
    FieldView, HealthDTO, HelloResponse, ProtocolVersion, SaveSurfaceSnapshotRequest,
    SurfaceResumeView, SurfaceSnapshotView, TraceId, UpdateFocusRequest,
};
use fielora_field::{DomainError, Field, FieldService, SurfaceService, SurfaceSnapshot};
use fielora_platform::{DeviceIdentity, PlatformPaths};
use fielora_storage::{StorageWorker, schema_version};
use serde::Deserialize;
use serde_json::{Value, json};
use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;
use tracing::{error, info, warn};
use tracing_subscriber::fmt::MakeWriter;
use uuid::Uuid;

const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;
const PROTOCOL: ProtocolVersion = ProtocolVersion { major: 1, minor: 0 };
const CAPABILITIES: [&str; 6] = [
    "field.create",
    "field.list",
    "field.get",
    "field.update_focus",
    "surface.save_snapshot",
    "surface.latest_snapshot",
];

#[derive(Debug, Error)]
enum CoreError {
    #[error("platform initialization failed: {0}")]
    Platform(String),
    #[error("storage initialization failed: {0}")]
    Storage(String),
    #[error("FIPC output failed: {0}")]
    Output(#[from] io::Error),
}

#[derive(Clone)]
struct BoundedLogWriter {
    file: Arc<Mutex<std::fs::File>>,
}

impl Write for BoundedLogWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.file.lock().unwrap().write_all(buffer)?;
        io::stderr().lock().write_all(buffer)?;
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.lock().unwrap().flush()?;
        io::stderr().lock().flush()
    }
}

impl<'a> MakeWriter<'a> for BoundedLogWriter {
    type Writer = BoundedLogWriter;

    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

struct Runtime {
    field: FieldService<fielora_storage::StorageHandle>,
    surface: SurfaceService<fielora_storage::StorageHandle>,
    health: HealthDTO,
    hello_completed: bool,
}

#[derive(Debug, Deserialize)]
struct RequestMeta {
    protocol: String,
    trace_id: String,
    #[serde(default)]
    deadline_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RequestEnvelope {
    jsonrpc: String,
    id: Value,
    method: String,
    #[serde(default)]
    params: Value,
    #[serde(rename = "_meta")]
    meta: RequestMeta,
}

enum Dispatch {
    Continue(Vec<Value>),
    Shutdown(Vec<Value>),
}

fn main() {
    if let Err(error) = run() {
        eprintln!("fielora-core fatal: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), CoreError> {
    let development = std::env::args().any(|argument| argument == "--development");
    let paths = PlatformPaths::resolve(development)
        .map_err(|error| CoreError::Platform(error.to_string()))?;
    configure_logging(&paths.core_log)?;
    info!(version = env!("CARGO_PKG_VERSION"), "core startup");
    let device = DeviceIdentity::load_or_create(&paths.device_identity)
        .map_err(|error| CoreError::Platform(error.to_string()))?;
    let storage = StorageWorker::start(&paths.database, device, now_ms())
        .map_err(|error| CoreError::Storage(error.to_string()))?;
    let handle = storage.handle();
    let mut runtime = Runtime {
        field: FieldService::new(handle.clone(), handle.local_user.clone()),
        surface: SurfaceService::new(handle.clone(), handle.device_id.clone()),
        health: HealthDTO {
            state: CoreHealthState::Ready,
            core_version: env!("CARGO_PKG_VERSION").into(),
            protocol: PROTOCOL,
            schema_version: schema_version(),
            pid: std::process::id(),
            db_path: paths.database.to_string_lossy().into_owned(),
        },
        hello_completed: false,
    };

    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    let mut parser = FrameParser::default();
    let mut buffer = [0_u8; 16 * 1024];
    'read: loop {
        let count = input.read(&mut buffer)?;
        if count == 0 {
            info!("parent pipe EOF; shutting down");
            break;
        }
        for frame in parser.push(&buffer[..count]) {
            match frame {
                ParsedFrame::Frame(bytes) => {
                    let dispatch = handle_frame(&mut runtime, &bytes);
                    match dispatch {
                        Dispatch::Continue(messages) => write_messages(&mut output, messages)?,
                        Dispatch::Shutdown(messages) => {
                            write_messages(&mut output, messages)?;
                            break 'read;
                        }
                    }
                }
                ParsedFrame::Oversized => {
                    write_messages(
                        &mut output,
                        vec![error_response(
                            Value::Null,
                            -32600,
                            "Frame exceeds 4 MiB",
                            "protocol_error",
                            Uuid::now_v7().to_string(),
                            false,
                            json!({}),
                        )],
                    )?;
                }
            }
        }
    }
    runtime.health.state = CoreHealthState::ShuttingDown;
    storage.shutdown();
    info!("core shutdown complete");
    Ok(())
}

fn configure_logging(path: &Path) -> Result<(), CoreError> {
    const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;
    if path
        .metadata()
        .is_ok_and(|metadata| metadata.len() > MAX_LOG_BYTES)
    {
        let previous = path.with_extension("log.previous");
        let _ = fs::remove_file(&previous);
        fs::rename(path, previous)?;
    }
    let file = OpenOptions::new().create(true).append(true).open(path)?;
    let writer = BoundedLogWriter {
        file: Arc::new(Mutex::new(file)),
    };
    tracing_subscriber::fmt()
        .with_ansi(false)
        .with_writer(writer)
        .try_init()
        .map_err(|error| CoreError::Platform(error.to_string()))?;
    Ok(())
}

fn write_messages(output: &mut impl Write, messages: Vec<Value>) -> io::Result<()> {
    for message in messages {
        serde_json::to_writer(&mut *output, &message)?;
        output.write_all(b"\n")?;
    }
    output.flush()
}

fn handle_frame(runtime: &mut Runtime, bytes: &[u8]) -> Dispatch {
    let value = match std::str::from_utf8(bytes)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
    {
        Some(value) => value,
        None => {
            return Dispatch::Continue(vec![error_response(
                Value::Null,
                -32700,
                "Invalid UTF-8 or JSON",
                "protocol_error",
                Uuid::now_v7().to_string(),
                false,
                json!({}),
            )]);
        }
    };
    let id = value.get("id").cloned().unwrap_or(Value::Null);
    let request = match serde_json::from_value::<RequestEnvelope>(value) {
        Ok(request) if request.jsonrpc == "2.0" && !request.id.is_null() => request,
        _ => {
            return Dispatch::Continue(vec![error_response(
                id,
                -32600,
                "Invalid JSON-RPC request",
                "protocol_error",
                Uuid::now_v7().to_string(),
                false,
                json!({}),
            )]);
        }
    };
    let trace_id = request.meta.trace_id.clone();
    let protocol = request
        .meta
        .protocol
        .split_once('.')
        .and_then(|(major, minor)| Some((major.parse::<u16>().ok()?, minor.parse::<u16>().ok()?)));
    if protocol.is_none_or(|(major, _minor)| major != PROTOCOL.major) {
        return Dispatch::Continue(vec![error_response(
            request.id,
            -32600,
            "Protocol major mismatch",
            "protocol_error",
            trace_id,
            false,
            json!({"supported":"1.0"}),
        )]);
    }
    if request.meta.deadline_ms == Some(0) {
        return Dispatch::Continue(vec![error_response(
            request.id,
            -32003,
            "Request deadline elapsed",
            "timeout",
            trace_id,
            true,
            json!({}),
        )]);
    }
    if !runtime.hello_completed && request.method != "system.hello" {
        return Dispatch::Continue(vec![error_response(
            request.id,
            -32600,
            "system.hello must be the first request",
            "protocol_error",
            trace_id,
            false,
            json!({}),
        )]);
    }

    let id = request.id.clone();
    let result = dispatch_request(runtime, &request, TraceId::new(trace_id.clone()));
    match result {
        Ok((result, event)) => {
            let mut messages = vec![success_response(id, result)];
            if let Some(event) = event {
                messages.push(json!({
                    "jsonrpc":"2.0",
                    "method":"event.field.changed",
                    "params": event
                }));
            }
            if request.method == "system.shutdown" {
                Dispatch::Shutdown(messages)
            } else {
                Dispatch::Continue(messages)
            }
        }
        Err(error) => Dispatch::Continue(vec![domain_error_response(id, error, trace_id)]),
    }
}

fn dispatch_request(
    runtime: &mut Runtime,
    request: &RequestEnvelope,
    trace_id: TraceId,
) -> Result<(Value, Option<DomainEventDTO>), DomainError> {
    match request.method.as_str() {
        "system.hello" => {
            runtime.hello_completed = true;
            serialize(HelloResponse {
                core_version: env!("CARGO_PKG_VERSION").into(),
                protocol: PROTOCOL,
                schema_version: schema_version(),
                capabilities: CAPABILITIES.iter().map(|value| (*value).into()).collect(),
            })
        }
        "system.health" => serialize(runtime.health.clone()),
        "system.shutdown" | "system.cancel" => Ok((Value::Null, None)),
        "command.field.create" => {
            let params: CreateFieldRequest = parse_params(&request.params)?;
            let (field, event) =
                runtime
                    .field
                    .create(params.title, params.goal, trace_id, now_ms())?;
            Ok((
                serde_json::to_value(field_view(field)).unwrap(),
                Some(event),
            ))
        }
        "query.field.list" => {
            let fields = runtime
                .field
                .list()?
                .into_iter()
                .map(field_summary)
                .collect::<Vec<_>>();
            serialize(fields)
        }
        "query.field.get" => {
            let params: FieldReferenceRequest = parse_params(&request.params)?;
            serialize(field_view(runtime.field.get(&params.field_id)?))
        }
        "command.field.update_focus" => {
            let params: UpdateFocusRequest = parse_params(&request.params)?;
            let (field, event) = runtime.field.update_focus(
                params.field_id,
                params.expected_revision,
                params.focus,
                trace_id,
                now_ms(),
            )?;
            Ok((
                serde_json::to_value(field_view(field)).unwrap(),
                Some(event),
            ))
        }
        "command.surface.save_snapshot" => {
            let params: SaveSurfaceSnapshotRequest = parse_params(&request.params)?;
            serialize(snapshot_view(runtime.surface.save(
                params.field_id,
                params.layout,
                params.open_objects,
                now_ms(),
            )?))
        }
        "query.surface.latest_snapshot" => {
            let params: FieldReferenceRequest = parse_params(&request.params)?;
            let field = field_view(runtime.field.get(&params.field_id)?);
            let snapshot = runtime.surface.latest(&params.field_id)?.map(snapshot_view);
            serialize(SurfaceResumeView { field, snapshot })
        }
        method => {
            warn!(method, "unknown FIPC method");
            Err(DomainError::Validation(format!("unknown_method:{method}")))
        }
    }
}

fn parse_params<T: for<'de> Deserialize<'de>>(value: &Value) -> Result<T, DomainError> {
    serde_json::from_value(value.clone())
        .map_err(|error| DomainError::Validation(error.to_string()))
}

fn serialize(value: impl serde::Serialize) -> Result<(Value, Option<DomainEventDTO>), DomainError> {
    serde_json::to_value(value)
        .map(|value| (value, None))
        .map_err(|error| DomainError::Validation(error.to_string()))
}

fn field_summary(field: Field) -> FieldSummary {
    FieldSummary {
        id: field.id,
        title: field.title,
        goal: field.goal,
        current_mode: field.current_mode,
        current_focus: field.current_focus,
        revision: field.revision,
        updated_at: field.updated_at,
    }
}

fn field_view(field: Field) -> FieldView {
    FieldView {
        id: field.id,
        owner_principal_id: field.owner_principal_id,
        title: field.title,
        goal: field.goal,
        lifecycle_status: field.lifecycle_status,
        current_mode: field.current_mode,
        current_focus: field.current_focus,
        revision: field.revision,
        created_at: field.created_at,
        updated_at: field.updated_at,
    }
}

fn snapshot_view(snapshot: SurfaceSnapshot) -> SurfaceSnapshotView {
    SurfaceSnapshotView {
        id: snapshot.id,
        field_id: snapshot.field_id,
        device_id: snapshot.device_id,
        observed_field_revision: snapshot.observed_field_revision,
        layout: snapshot.layout,
        open_objects: snapshot.open_objects,
        created_at: snapshot.created_at,
    }
}

fn success_response(id: Value, result: Value) -> Value {
    json!({"jsonrpc":"2.0", "id":id, "result":result})
}

fn domain_error_response(id: Value, error: DomainError, trace_id: String) -> Value {
    match error {
        DomainError::Validation(message) if message.starts_with("unknown_method:") => {
            error_response(
                id,
                -32601,
                "Unknown method",
                "protocol_error",
                trace_id,
                false,
                json!({}),
            )
        }
        DomainError::Validation(message) => error_response(
            id,
            -32602,
            &message,
            "validation_failed",
            trace_id,
            false,
            json!({}),
        ),
        DomainError::NotFound => error_response(
            id,
            -32001,
            "Resource not found",
            "not_found",
            trace_id,
            false,
            json!({}),
        ),
        DomainError::Conflict => error_response(
            id,
            -32002,
            "Revision conflict",
            "conflict",
            trace_id,
            false,
            json!({}),
        ),
        DomainError::Storage(message) => {
            error!("storage request failed");
            error_response(
                id,
                -32005,
                "Storage operation failed",
                "storage_error",
                trace_id,
                false,
                json!({"category":message.split(':').next().unwrap_or("storage")}),
            )
        }
    }
}

fn error_response(
    id: Value,
    rpc_code: i32,
    message: &str,
    business_code: &str,
    trace_id: String,
    retryable: bool,
    details: Value,
) -> Value {
    json!({
        "jsonrpc":"2.0",
        "id":id,
        "error":{
            "code":rpc_code,
            "message":message,
            "data":{
                "code":business_code,
                "trace_id":trace_id,
                "retryable":retryable,
                "details":details
            }
        }
    })
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[derive(Default)]
struct FrameParser {
    buffer: Vec<u8>,
    discarding: bool,
}

enum ParsedFrame {
    Frame(Vec<u8>),
    Oversized,
}

impl FrameParser {
    fn push(&mut self, bytes: &[u8]) -> Vec<ParsedFrame> {
        let mut frames = Vec::new();
        for byte in bytes {
            if self.discarding {
                if *byte == b'\n' {
                    self.discarding = false;
                    frames.push(ParsedFrame::Oversized);
                }
                continue;
            }
            if *byte == b'\n' {
                frames.push(ParsedFrame::Frame(std::mem::take(&mut self.buffer)));
            } else if self.buffer.len() == MAX_FRAME_BYTES {
                self.buffer.clear();
                self.discarding = true;
            } else {
                self.buffer.push(*byte);
            }
        }
        frames
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parser_handles_incremental_frames() {
        let mut parser = FrameParser::default();
        assert!(parser.push(b"{\"a\":").is_empty());
        let frames = parser.push(b"1}\n{\"b\":2}\n");
        assert_eq!(frames.len(), 2);
        match &frames[0] {
            ParsedFrame::Frame(frame) => assert_eq!(frame, b"{\"a\":1}"),
            ParsedFrame::Oversized => panic!("unexpected oversized frame"),
        }
    }

    #[test]
    fn parser_discards_oversized_until_newline_and_recovers() {
        let mut parser = FrameParser::default();
        let mut input = vec![b'x'; MAX_FRAME_BYTES + 1];
        input.extend_from_slice(b"\n{}\n");
        let frames = parser.push(&input);
        assert_eq!(frames.len(), 2);
        assert!(matches!(frames[0], ParsedFrame::Oversized));
        assert!(matches!(&frames[1], ParsedFrame::Frame(frame) if frame == b"{}"));
    }

    #[test]
    fn protocol_accepts_newer_minor_but_rejects_wrong_major() {
        let newer_minor = "1.9".split_once('.').and_then(|(major, minor)| {
            Some((major.parse::<u16>().ok()?, minor.parse::<u16>().ok()?))
        });
        let wrong_major = "2.0".split_once('.').and_then(|(major, minor)| {
            Some((major.parse::<u16>().ok()?, minor.parse::<u16>().ok()?))
        });
        assert!(newer_minor.is_some_and(|(major, _)| major == PROTOCOL.major));
        assert!(wrong_major.is_none_or(|(major, _)| major != PROTOCOL.major));
    }
}
