use fielora_contracts::{
    ContextSensitivity, ModelCapabilityProfile, ModelInvocationEvent, ModelInvocationEventKind,
    ModelInvocationRequest, ModelToolDefinition, ModelUsage, ProviderKind, ToolProposal,
};
use futures_util::StreamExt;
use reqwest::{Client, StatusCode, Url, redirect::Policy};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use thiserror::Error;
use tokio::net::lookup_host;
use tokio_util::sync::CancellationToken;

const MAX_EVENT_BYTES: usize = 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const MAX_CONTEXT_CHIPS: usize = 8;
const MAX_CONTEXT_CHIP_SCALARS: usize = 4_000;
const MAX_CONTEXT_CHIP_BYTES: usize = 16 * 1024;
const MAX_CONTEXT_SCALARS: usize = 12_000;
const MAX_CONTEXT_BYTES: usize = 48 * 1024;
const MAX_USER_INPUT_SCALARS: usize = 8_000;
const MAX_USER_INPUT_BYTES: usize = 32 * 1024;
const MAX_TOOL_ARGUMENT_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone)]
pub struct ProviderEndpoint {
    pub kind: ProviderKind,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AgentModelToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AgentModelMessage {
    User(String),
    Assistant {
        text: String,
        tool_calls: Vec<AgentModelToolCall>,
    },
    ToolResult {
        call_id: String,
        name: String,
        content: String,
        is_error: bool,
    },
}

#[derive(Debug, Clone)]
pub struct AgentModelRequest {
    pub model_id: String,
    pub system: String,
    pub messages: Vec<AgentModelMessage>,
    pub tools: Vec<ModelToolDefinition>,
    pub max_output_tokens: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AgentModelTurn {
    pub text: String,
    pub tool_calls: Vec<AgentModelToolCall>,
    pub usage: Option<ModelUsage>,
}

pub fn provider_capabilities(kind: ProviderKind) -> ModelCapabilityProfile {
    match kind {
        ProviderKind::Openai => ModelCapabilityProfile {
            streaming: true,
            native_tools: true,
            parallel_tools: true,
            strict_schema: true,
            usage: true,
            cancellation: true,
        },
        ProviderKind::Anthropic => ModelCapabilityProfile {
            streaming: true,
            native_tools: true,
            parallel_tools: true,
            strict_schema: false,
            usage: true,
            cancellation: true,
        },
        ProviderKind::OpenaiCompatible => ModelCapabilityProfile {
            streaming: true,
            native_tools: true,
            parallel_tools: false,
            strict_schema: false,
            usage: true,
            cancellation: true,
        },
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ModelError {
    #[error("CREDENTIAL_REJECTED")]
    CredentialRejected,
    #[error("MODEL_NOT_AVAILABLE")]
    ModelNotAvailable,
    #[error("PROVIDER_RATE_LIMITED")]
    ProviderRateLimited,
    #[error("PROVIDER_UNAVAILABLE")]
    ProviderUnavailable,
    #[error("PROVIDER_PROTOCOL_ERROR")]
    ProviderProtocolError,
    #[error("PROVIDER_RESPONSE_TOO_LARGE")]
    ProviderResponseTooLarge,
    #[error("CONTEXT_TOO_LARGE")]
    ContextTooLarge,
    #[error("CONTEXT_BLOCKED")]
    ContextBlocked,
    #[error("CUSTOM_ENDPOINT_REJECTED")]
    CustomEndpointRejected,
    #[error("INVOCATION_CANCELLED")]
    InvocationCancelled,
}

impl ModelError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::CredentialRejected => "CREDENTIAL_REJECTED",
            Self::ModelNotAvailable => "MODEL_NOT_AVAILABLE",
            Self::ProviderRateLimited => "PROVIDER_RATE_LIMITED",
            Self::ProviderUnavailable => "PROVIDER_UNAVAILABLE",
            Self::ProviderProtocolError => "PROVIDER_PROTOCOL_ERROR",
            Self::ProviderResponseTooLarge => "PROVIDER_RESPONSE_TOO_LARGE",
            Self::ContextTooLarge => "CONTEXT_TOO_LARGE",
            Self::ContextBlocked => "CONTEXT_BLOCKED",
            Self::CustomEndpointRejected => "CUSTOM_ENDPOINT_REJECTED",
            Self::InvocationCancelled => "INVOCATION_CANCELLED",
        }
    }
}

#[derive(Default)]
struct SseDecoder {
    buffer: Vec<u8>,
    total: usize,
}

impl SseDecoder {
    fn push(&mut self, bytes: &[u8]) -> Result<Vec<String>, ModelError> {
        self.total = self.total.saturating_add(bytes.len());
        if self.total > MAX_RESPONSE_BYTES {
            return Err(ModelError::ProviderResponseTooLarge);
        }
        self.buffer.extend_from_slice(bytes);
        let mut events = Vec::new();
        while let Some((index, delimiter)) = next_sse_delimiter(&self.buffer) {
            let raw = self.buffer.drain(..index + delimiter).collect::<Vec<_>>();
            let text = std::str::from_utf8(&raw).map_err(|_| ModelError::ProviderProtocolError)?;
            let data = text
                .lines()
                .filter_map(|line| line.strip_prefix("data:"))
                .map(str::trim_start)
                .collect::<Vec<_>>()
                .join("\n");
            if !data.is_empty() {
                events.push(data);
            }
        }
        if self.buffer.len() > MAX_EVENT_BYTES {
            return Err(ModelError::ProviderResponseTooLarge);
        }
        Ok(events)
    }
}

pub struct ModelClient {
    client: Client,
}

impl ModelClient {
    pub fn new() -> Result<Self, ModelError> {
        let client = Client::builder()
            .redirect(Policy::none())
            .no_proxy()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(90))
            .build()
            .map_err(|_| ModelError::ProviderUnavailable)?;
        Ok(Self { client })
    }

    pub async fn invoke<F>(
        &self,
        endpoint: ProviderEndpoint,
        request: ModelInvocationRequest,
        secret: &[u8],
        cancellation: CancellationToken,
        mut emit: F,
    ) -> Result<(), ModelError>
    where
        F: FnMut(ModelInvocationEvent) + Send,
    {
        validate_request(&request)?;
        emit(event(&request, ModelInvocationEventKind::Started));
        let (url, pinned) = endpoint_url(&endpoint).await?;
        let client = if let Some((host, addresses)) = pinned {
            Client::builder()
                .redirect(Policy::none())
                .no_proxy()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(90))
                .resolve_to_addrs(&host, &addresses)
                .build()
                .map_err(|_| ModelError::ProviderUnavailable)?
        } else {
            self.client.clone()
        };
        let response = match endpoint.kind {
            ProviderKind::Openai | ProviderKind::OpenaiCompatible => {
                let body = provider_body(endpoint.kind, &request);
                client
                    .post(url)
                    .bearer_auth(String::from_utf8_lossy(secret))
                    .json(&body)
                    .send()
            }
            ProviderKind::Anthropic => {
                let body = provider_body(endpoint.kind, &request);
                client
                    .post(url)
                    .header("x-api-key", String::from_utf8_lossy(secret).as_ref())
                    .header("anthropic-version", "2023-06-01")
                    .json(&body)
                    .send()
            }
        };
        let response = tokio::select! {
            _ = cancellation.cancelled() => return Err(ModelError::InvocationCancelled),
            value = response => value.map_err(|_| ModelError::ProviderUnavailable)?,
        };
        map_status(response.status())?;
        let mut stream = response.bytes_stream();
        let mut decoder = SseDecoder::default();
        let mut saw_provider_terminal = false;
        while let Some(chunk) = tokio::select! {
            _ = cancellation.cancelled() => return Err(ModelError::InvocationCancelled),
            value = stream.next() => value,
        } {
            let chunk = chunk.map_err(|_| ModelError::ProviderUnavailable)?;
            for data in decoder.push(&chunk)? {
                if data == "[DONE]" {
                    if endpoint.kind == ProviderKind::OpenaiCompatible {
                        saw_provider_terminal = true;
                    }
                    continue;
                }
                let value: Value =
                    serde_json::from_str(&data).map_err(|_| ModelError::ProviderProtocolError)?;
                if provider_failure(endpoint.kind, &value) {
                    return Err(ModelError::ProviderProtocolError);
                }
                saw_provider_terminal |= provider_terminal(endpoint.kind, &value);
                for normalized in normalize_provider_event(endpoint.kind, &value) {
                    emit(with_id(&request, normalized));
                }
            }
        }
        if saw_provider_terminal {
            Ok(())
        } else {
            Err(ModelError::ProviderProtocolError)
        }
    }

    pub async fn invoke_agent_turn<F>(
        &self,
        endpoint: ProviderEndpoint,
        request: AgentModelRequest,
        secret: &[u8],
        cancellation: CancellationToken,
        mut emit_text: F,
    ) -> Result<AgentModelTurn, ModelError>
    where
        F: FnMut(&str) + Send,
    {
        validate_agent_request(&request)?;
        let (url, pinned) = endpoint_url(&endpoint).await?;
        let client = if let Some((host, addresses)) = pinned {
            Client::builder()
                .redirect(Policy::none())
                .no_proxy()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(120))
                .resolve_to_addrs(&host, &addresses)
                .build()
                .map_err(|_| ModelError::ProviderUnavailable)?
        } else {
            self.client.clone()
        };
        let body = agent_provider_body(endpoint.kind, &request);
        let response = match endpoint.kind {
            ProviderKind::Openai | ProviderKind::OpenaiCompatible => client
                .post(url)
                .bearer_auth(String::from_utf8_lossy(secret))
                .json(&body)
                .send(),
            ProviderKind::Anthropic => client
                .post(url)
                .header("x-api-key", String::from_utf8_lossy(secret).as_ref())
                .header("anthropic-version", "2023-06-01")
                .json(&body)
                .send(),
        };
        let response = tokio::select! {
            _ = cancellation.cancelled() => return Err(ModelError::InvocationCancelled),
            value = response => value.map_err(|_| ModelError::ProviderUnavailable)?,
        };
        map_status(response.status())?;
        let mut stream = response.bytes_stream();
        let mut decoder = SseDecoder::default();
        let mut accumulator = AgentStreamAccumulator::new(endpoint.kind);
        while let Some(chunk) = tokio::select! {
            _ = cancellation.cancelled() => return Err(ModelError::InvocationCancelled),
            value = stream.next() => value,
        } {
            let chunk = chunk.map_err(|_| ModelError::ProviderUnavailable)?;
            for data in decoder.push(&chunk)? {
                if data == "[DONE]" {
                    if endpoint.kind == ProviderKind::OpenaiCompatible {
                        accumulator.terminal = true;
                    }
                    continue;
                }
                let value: Value =
                    serde_json::from_str(&data).map_err(|_| ModelError::ProviderProtocolError)?;
                if provider_failure(endpoint.kind, &value) {
                    return Err(ModelError::ProviderProtocolError);
                }
                for delta in accumulator.push(&value)? {
                    emit_text(&delta);
                }
            }
        }
        accumulator.finish()
    }
}

fn validate_agent_request(request: &AgentModelRequest) -> Result<(), ModelError> {
    if request.model_id.is_empty()
        || request.model_id.len() > 256
        || request.system.len() > 64 * 1024
        || request.messages.is_empty()
        || request.messages.len() > 128
        || request.tools.len() > 64
        || !(1..=16_384).contains(&request.max_output_tokens)
    {
        return Err(ModelError::ContextTooLarge);
    }
    let message_bytes = request
        .messages
        .iter()
        .map(|message| match message {
            AgentModelMessage::User(text) => text.len(),
            AgentModelMessage::Assistant { text, tool_calls } => {
                text.len()
                    + tool_calls
                        .iter()
                        .map(|call| {
                            call.id.len() + call.name.len() + call.arguments.to_string().len()
                        })
                        .sum::<usize>()
            }
            AgentModelMessage::ToolResult {
                call_id,
                name,
                content,
                ..
            } => call_id.len() + name.len() + content.len(),
        })
        .sum::<usize>();
    let tool_bytes = request
        .tools
        .iter()
        .map(|tool| tool.name.len() + tool.description.len() + tool.input_schema.to_string().len())
        .sum::<usize>();
    if message_bytes > 1024 * 1024 || tool_bytes > 256 * 1024 {
        return Err(ModelError::ContextTooLarge);
    }
    if request.tools.iter().any(|tool| {
        tool.name.is_empty()
            || tool.name.len() > 128
            || tool.description.len() > 4096
            || !tool.input_schema.is_object()
    }) {
        return Err(ModelError::ProviderProtocolError);
    }
    Ok(())
}

fn agent_provider_body(kind: ProviderKind, request: &AgentModelRequest) -> Value {
    match kind {
        ProviderKind::Openai => {
            let mut input = Vec::new();
            for message in &request.messages {
                match message {
                    AgentModelMessage::User(text) => {
                        input.push(json!({"role":"user","content":text}));
                    }
                    AgentModelMessage::Assistant { text, tool_calls } => {
                        if !text.is_empty() {
                            input.push(json!({"role":"assistant","content":text}));
                        }
                        input.extend(tool_calls.iter().map(|call| {
                            json!({
                                "type":"function_call",
                                "call_id":call.id,
                                "name":call.name,
                                "arguments":call.arguments.to_string()
                            })
                        }));
                    }
                    AgentModelMessage::ToolResult {
                        call_id, content, ..
                    } => input.push(json!({
                        "type":"function_call_output",
                        "call_id":call_id,
                        "output":content
                    })),
                }
            }
            let tools = request
                .tools
                .iter()
                .map(|tool| {
                    json!({
                        "type":"function",
                        "name":tool.name,
                        "description":tool.description,
                        "parameters":tool.input_schema,
                        "strict":false
                    })
                })
                .collect::<Vec<_>>();
            json!({
                "model":request.model_id,
                "instructions":request.system,
                "input":input,
                "tools":tools,
                "parallel_tool_calls":false,
                "max_output_tokens":request.max_output_tokens,
                "stream":true,
                "store":false
            })
        }
        ProviderKind::Anthropic => {
            let messages = request.messages.iter().map(|message| match message {
                AgentModelMessage::User(text) => json!({"role":"user","content":text}),
                AgentModelMessage::Assistant { text, tool_calls } => {
                    let mut content = Vec::new();
                    if !text.is_empty() {
                        content.push(json!({"type":"text","text":text}));
                    }
                    content.extend(tool_calls.iter().map(|call| json!({
                        "type":"tool_use","id":call.id,"name":call.name,"input":call.arguments
                    })));
                    json!({"role":"assistant","content":content})
                }
                AgentModelMessage::ToolResult { call_id, content, is_error, .. } => json!({
                    "role":"user","content":[{"type":"tool_result","tool_use_id":call_id,"content":content,"is_error":is_error}]
                }),
            }).collect::<Vec<_>>();
            let tools = request.tools.iter().map(|tool| json!({
                "name":tool.name,"description":tool.description,"input_schema":tool.input_schema
            })).collect::<Vec<_>>();
            json!({
                "model":request.model_id,
                "system":request.system,
                "messages":messages,
                "tools":tools,
                "max_tokens":request.max_output_tokens,
                "stream":true
            })
        }
        ProviderKind::OpenaiCompatible => {
            let mut messages = vec![json!({"role":"system","content":request.system})];
            messages.extend(request.messages.iter().map(|message| match message {
                AgentModelMessage::User(text) => json!({"role":"user","content":text}),
                AgentModelMessage::Assistant { text, tool_calls } => json!({
                    "role":"assistant",
                    "content":if text.is_empty(){Value::Null}else{Value::String(text.clone())},
                    "tool_calls":tool_calls.iter().map(|call|json!({"id":call.id,"type":"function","function":{"name":call.name,"arguments":call.arguments.to_string()}})).collect::<Vec<_>>()
                }),
                AgentModelMessage::ToolResult { call_id, name, content, .. } => json!({
                    "role":"tool","tool_call_id":call_id,"name":name,"content":content
                }),
            }));
            let tools = request.tools.iter().map(|tool|json!({
                "type":"function","function":{"name":tool.name,"description":tool.description,"parameters":tool.input_schema}
            })).collect::<Vec<_>>();
            json!({
                "model":request.model_id,
                "messages":messages,
                "tools":tools,
                "tool_choice":"auto",
                "parallel_tool_calls":false,
                "max_tokens":request.max_output_tokens,
                "stream":true,
                "stream_options":{"include_usage":true}
            })
        }
    }
}

#[derive(Default)]
struct PendingAgentToolCall {
    id: String,
    name: String,
    arguments: String,
    complete_arguments: Option<Value>,
}

struct AgentStreamAccumulator {
    kind: ProviderKind,
    text: String,
    calls: BTreeMap<u64, PendingAgentToolCall>,
    usage: Option<ModelUsage>,
    terminal: bool,
}

impl AgentStreamAccumulator {
    fn new(kind: ProviderKind) -> Self {
        Self {
            kind,
            text: String::new(),
            calls: BTreeMap::new(),
            usage: None,
            terminal: false,
        }
    }

    fn push(&mut self, value: &Value) -> Result<Vec<String>, ModelError> {
        let mut deltas = Vec::new();
        match self.kind {
            ProviderKind::Openai => match value.get("type").and_then(Value::as_str).unwrap_or("") {
                "response.output_text.delta" => {
                    if let Some(delta) = value.get("delta").and_then(Value::as_str) {
                        self.push_text(delta, &mut deltas)?;
                    }
                }
                "response.output_item.added" => {
                    if value.pointer("/item/type").and_then(Value::as_str) == Some("function_call")
                    {
                        let index = value
                            .get("output_index")
                            .and_then(Value::as_u64)
                            .ok_or(ModelError::ProviderProtocolError)?;
                        let call = self.calls.entry(index).or_default();
                        merge_string(&mut call.id, value.pointer("/item/call_id"))?;
                        merge_string(&mut call.name, value.pointer("/item/name"))?;
                        if let Some(arguments) =
                            value.pointer("/item/arguments").and_then(Value::as_str)
                        {
                            call.arguments.push_str(arguments);
                        }
                    }
                }
                "response.function_call_arguments.delta" => {
                    let index = value
                        .get("output_index")
                        .and_then(Value::as_u64)
                        .ok_or(ModelError::ProviderProtocolError)?;
                    let call = self.calls.entry(index).or_default();
                    merge_string(&mut call.id, value.get("call_id"))?;
                    if let Some(delta) = value.get("delta").and_then(Value::as_str) {
                        append_tool_arguments(&mut call.arguments, delta)?;
                    }
                }
                "response.output_item.done" => {
                    if value.pointer("/item/type").and_then(Value::as_str) == Some("function_call")
                    {
                        let index = value
                            .get("output_index")
                            .and_then(Value::as_u64)
                            .ok_or(ModelError::ProviderProtocolError)?;
                        let call = self.calls.entry(index).or_default();
                        merge_string(&mut call.id, value.pointer("/item/call_id"))?;
                        merge_string(&mut call.name, value.pointer("/item/name"))?;
                        if let Some(arguments) =
                            value.pointer("/item/arguments").and_then(Value::as_str)
                        {
                            call.arguments.clear();
                            append_tool_arguments(&mut call.arguments, arguments)?;
                        }
                    }
                }
                "response.completed" => {
                    self.terminal = true;
                    if let Some(usage) = value.pointer("/response/usage") {
                        self.usage = Some(model_usage(usage, "input_tokens", "output_tokens"));
                    }
                }
                _ => {}
            },
            ProviderKind::Anthropic => {
                match value.get("type").and_then(Value::as_str).unwrap_or("") {
                    "content_block_start" => {
                        if value.pointer("/content_block/type").and_then(Value::as_str)
                            == Some("tool_use")
                        {
                            let index = value
                                .get("index")
                                .and_then(Value::as_u64)
                                .ok_or(ModelError::ProviderProtocolError)?;
                            let call = self.calls.entry(index).or_default();
                            merge_string(&mut call.id, value.pointer("/content_block/id"))?;
                            merge_string(&mut call.name, value.pointer("/content_block/name"))?;
                            if let Some(input) = value.pointer("/content_block/input")
                                && input != &json!({})
                            {
                                call.complete_arguments = Some(input.clone());
                            }
                        }
                    }
                    "content_block_delta" => {
                        let delta_type = value.pointer("/delta/type").and_then(Value::as_str);
                        if delta_type == Some("text_delta") {
                            if let Some(delta) =
                                value.pointer("/delta/text").and_then(Value::as_str)
                            {
                                self.push_text(delta, &mut deltas)?;
                            }
                        } else if delta_type == Some("input_json_delta") {
                            let index = value
                                .get("index")
                                .and_then(Value::as_u64)
                                .ok_or(ModelError::ProviderProtocolError)?;
                            let delta = value
                                .pointer("/delta/partial_json")
                                .and_then(Value::as_str)
                                .ok_or(ModelError::ProviderProtocolError)?;
                            append_tool_arguments(
                                &mut self.calls.entry(index).or_default().arguments,
                                delta,
                            )?;
                        }
                    }
                    "message_start" => {
                        if let Some(usage) = value.pointer("/message/usage") {
                            self.usage = Some(model_usage(usage, "input_tokens", "output_tokens"));
                        }
                    }
                    "message_delta" => {
                        if let Some(usage) = value.get("usage") {
                            let delta = model_usage(usage, "input_tokens", "output_tokens");
                            let current = self.usage.get_or_insert(ModelUsage {
                                input_tokens: None,
                                output_tokens: None,
                            });
                            current.input_tokens = delta.input_tokens.or(current.input_tokens);
                            current.output_tokens = delta.output_tokens.or(current.output_tokens);
                        }
                    }
                    "message_stop" => self.terminal = true,
                    _ => {}
                }
            }
            ProviderKind::OpenaiCompatible => {
                if let Some(delta) = value
                    .pointer("/choices/0/delta/content")
                    .and_then(Value::as_str)
                {
                    self.push_text(delta, &mut deltas)?;
                }
                if let Some(calls) = value
                    .pointer("/choices/0/delta/tool_calls")
                    .and_then(Value::as_array)
                {
                    for item in calls {
                        let index = item
                            .get("index")
                            .and_then(Value::as_u64)
                            .ok_or(ModelError::ProviderProtocolError)?;
                        let call = self.calls.entry(index).or_default();
                        merge_string(&mut call.id, item.get("id"))?;
                        merge_string(&mut call.name, item.pointer("/function/name"))?;
                        if let Some(delta) =
                            item.pointer("/function/arguments").and_then(Value::as_str)
                        {
                            append_tool_arguments(&mut call.arguments, delta)?;
                        }
                    }
                }
                if let Some(usage) = value.get("usage")
                    && !usage.is_null()
                {
                    self.usage = Some(model_usage(usage, "prompt_tokens", "completion_tokens"));
                }
                if value
                    .pointer("/choices/0/finish_reason")
                    .and_then(Value::as_str)
                    .is_some()
                {
                    self.terminal = true;
                }
            }
        }
        Ok(deltas)
    }

    fn push_text(&mut self, delta: &str, emitted: &mut Vec<String>) -> Result<(), ModelError> {
        if self.text.len().saturating_add(delta.len()) > MAX_RESPONSE_BYTES {
            return Err(ModelError::ProviderResponseTooLarge);
        }
        self.text.push_str(delta);
        emitted.push(delta.to_owned());
        Ok(())
    }

    fn finish(self) -> Result<AgentModelTurn, ModelError> {
        if !self.terminal {
            return Err(ModelError::ProviderProtocolError);
        }
        let tool_calls = self
            .calls
            .into_values()
            .map(|call| {
                if call.id.is_empty() || call.name.is_empty() {
                    return Err(ModelError::ProviderProtocolError);
                }
                let arguments = if let Some(value) = call.complete_arguments {
                    value
                } else if call.arguments.trim().is_empty() {
                    json!({})
                } else {
                    serde_json::from_str(&call.arguments)
                        .map_err(|_| ModelError::ProviderProtocolError)?
                };
                if !arguments.is_object() {
                    return Err(ModelError::ProviderProtocolError);
                }
                Ok(AgentModelToolCall {
                    id: call.id,
                    name: call.name,
                    arguments: bounded_arguments(&arguments),
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(AgentModelTurn {
            text: self.text,
            tool_calls,
            usage: self.usage,
        })
    }
}

fn merge_string(target: &mut String, value: Option<&Value>) -> Result<(), ModelError> {
    if let Some(value) = value {
        let value = value.as_str().ok_or(ModelError::ProviderProtocolError)?;
        if !value.is_empty() {
            if target.is_empty() {
                *target = value.chars().take(256).collect();
            } else if target != value {
                return Err(ModelError::ProviderProtocolError);
            }
        }
    }
    Ok(())
}

fn append_tool_arguments(target: &mut String, delta: &str) -> Result<(), ModelError> {
    if target.len().saturating_add(delta.len()) > MAX_TOOL_ARGUMENT_BYTES {
        return Err(ModelError::ProviderResponseTooLarge);
    }
    target.push_str(delta);
    Ok(())
}

fn model_usage(value: &Value, input: &str, output: &str) -> ModelUsage {
    ModelUsage {
        input_tokens: value
            .get(input)
            .and_then(Value::as_u64)
            .and_then(|value| value.try_into().ok()),
        output_tokens: value
            .get(output)
            .and_then(Value::as_u64)
            .and_then(|value| value.try_into().ok()),
    }
}

fn event(request: &ModelInvocationRequest, kind: ModelInvocationEventKind) -> ModelInvocationEvent {
    ModelInvocationEvent {
        event: "event.model.invocation".into(),
        invocation_id: request.invocation_id.clone(),
        kind,
        text_delta: None,
        tool_proposal: None,
        usage: None,
        error_code: None,
    }
}

fn with_id(
    request: &ModelInvocationRequest,
    mut event: ModelInvocationEvent,
) -> ModelInvocationEvent {
    event.invocation_id = request.invocation_id.clone();
    event
}

fn validate_request(request: &ModelInvocationRequest) -> Result<(), ModelError> {
    if request
        .context_package
        .iter()
        .any(|chip| chip.sensitivity == ContextSensitivity::Blocked)
    {
        return Err(ModelError::ContextBlocked);
    }
    if request.context_package.len() > MAX_CONTEXT_CHIPS
        || request.user_input.chars().count() > MAX_USER_INPUT_SCALARS
        || request.user_input.len() > MAX_USER_INPUT_BYTES
        || request.context_package.iter().any(|chip| {
            chip.content.chars().count() > MAX_CONTEXT_CHIP_SCALARS
                || chip.content.len() > MAX_CONTEXT_CHIP_BYTES
        })
    {
        return Err(ModelError::ContextTooLarge);
    }
    let context_bytes = request
        .context_package
        .iter()
        .map(|chip| chip.content.len())
        .sum::<usize>();
    let context_scalars = request
        .context_package
        .iter()
        .map(|chip| chip.content.chars().count())
        .sum::<usize>();
    if context_bytes > MAX_CONTEXT_BYTES || context_scalars > MAX_CONTEXT_SCALARS {
        return Err(ModelError::ContextTooLarge);
    }
    Ok(())
}

fn render_input(request: &ModelInvocationRequest) -> String {
    let mut input = String::new();
    for chip in &request.context_package {
        input.push_str("[Context: ");
        input.push_str(&chip.display_label);
        input.push_str("]\n");
        input.push_str(&chip.content);
        input.push_str("\n\n");
    }
    input.push_str(&request.user_input);
    input
}

fn provider_body(kind: ProviderKind, request: &ModelInvocationRequest) -> Value {
    match kind {
        ProviderKind::Openai => {
            json!({"model":request.model_id,"input":render_input(request),"stream":true,"store":false})
        }
        ProviderKind::Anthropic => {
            json!({"model":request.model_id,"max_tokens":1024,"stream":true,"messages":[{"role":"user","content":render_input(request)}]})
        }
        ProviderKind::OpenaiCompatible => {
            json!({"model":request.model_id,"messages":[{"role":"user","content":render_input(request)}],"stream":true,"stream_options":{"include_usage":true}})
        }
    }
}

async fn endpoint_url(
    endpoint: &ProviderEndpoint,
) -> Result<(Url, Option<(String, Vec<SocketAddr>)>), ModelError> {
    match endpoint.kind {
        ProviderKind::Openai => Url::parse("https://api.openai.com/v1/responses")
            .map(|url| (url, None))
            .map_err(|_| ModelError::ProviderProtocolError),
        ProviderKind::Anthropic => Url::parse("https://api.anthropic.com/v1/messages")
            .map(|url| (url, None))
            .map_err(|_| ModelError::ProviderProtocolError),
        ProviderKind::OpenaiCompatible => {
            let mut url = Url::parse(
                endpoint
                    .base_url
                    .as_deref()
                    .ok_or(ModelError::CustomEndpointRejected)?,
            )
            .map_err(|_| ModelError::CustomEndpointRejected)?;
            if url.scheme() != "https"
                || !url.username().is_empty()
                || url.password().is_some()
                || url.fragment().is_some()
            {
                return Err(ModelError::CustomEndpointRejected);
            }
            let host = url
                .host_str()
                .ok_or(ModelError::CustomEndpointRejected)?
                .to_owned();
            let port = url
                .port_or_known_default()
                .ok_or(ModelError::CustomEndpointRejected)?;
            if host.parse::<IpAddr>().is_ok()
                || !host.contains('.')
                || host.to_ascii_lowercase().ends_with(".local")
            {
                return Err(ModelError::CustomEndpointRejected);
            }
            let addresses = lookup_host((host.as_str(), port))
                .await
                .map_err(|_| ModelError::CustomEndpointRejected)?
                .collect::<Vec<_>>();
            if addresses.is_empty() || addresses.iter().any(|addr| !is_public_ip(addr.ip())) {
                return Err(ModelError::CustomEndpointRejected);
            }
            let path = url.path().trim_end_matches('/');
            url.set_path(&format!("{path}/chat/completions"));
            Ok((url, Some((host, addresses))))
        }
    }
}

fn next_sse_delimiter(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer
        .windows(2)
        .position(|window| window == b"\n\n")
        .map(|index| (index, 2));
    let crlf = buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| (index, 4));
    match (lf, crlf) {
        (Some(a), Some(b)) => Some(if a.0 <= b.0 { a } else { b }),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

fn provider_failure(kind: ProviderKind, value: &Value) -> bool {
    match kind {
        ProviderKind::Openai => matches!(
            value.get("type").and_then(Value::as_str),
            Some("response.failed" | "error")
        ),
        ProviderKind::Anthropic => value.get("type").and_then(Value::as_str) == Some("error"),
        ProviderKind::OpenaiCompatible => value.get("error").is_some(),
    }
}

fn provider_terminal(kind: ProviderKind, value: &Value) -> bool {
    match kind {
        ProviderKind::Openai => {
            value.get("type").and_then(Value::as_str) == Some("response.completed")
        }
        ProviderKind::Anthropic => {
            value.get("type").and_then(Value::as_str) == Some("message_stop")
        }
        ProviderKind::OpenaiCompatible => false,
    }
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || octets[0] == 0
                || octets[0] >= 224
                || (octets[0] == 100 && (64..=127).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 0 && octets[2] <= 2)
                || (octets[0] == 198 && (octets[1] == 18 || octets[1] == 19))
                || (octets[0] == 198 && octets[1] == 51 && octets[2] == 100)
                || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113))
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(v4));
            }
            let segments = v6.segments();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || v6.is_multicast()
                || (segments[0] == 0x2001
                    && matches!(segments[1], 0x0000 | 0x0002 | 0x000d | 0x0db8))
                || segments[0] == 0x2002)
        }
    }
}

fn map_status(status: StatusCode) -> Result<(), ModelError> {
    match status.as_u16() {
        200..=299 => Ok(()),
        401 | 403 => Err(ModelError::CredentialRejected),
        404 => Err(ModelError::ModelNotAvailable),
        408 | 429 => Err(ModelError::ProviderRateLimited),
        500..=599 => Err(ModelError::ProviderUnavailable),
        _ => Err(ModelError::ProviderProtocolError),
    }
}

fn blank(kind: ModelInvocationEventKind) -> ModelInvocationEvent {
    ModelInvocationEvent {
        event: "event.model.invocation".into(),
        invocation_id: fielora_contracts::ModelInvocationId::new(""),
        kind,
        text_delta: None,
        tool_proposal: None,
        usage: None,
        error_code: None,
    }
}

pub fn normalize_provider_event(kind: ProviderKind, value: &Value) -> Vec<ModelInvocationEvent> {
    let mut events = Vec::new();
    match kind {
        ProviderKind::Openai => match value.get("type").and_then(Value::as_str).unwrap_or("") {
            "response.output_text.delta" => {
                let mut event = blank(ModelInvocationEventKind::OutputTextDelta);
                event.text_delta = value
                    .get("delta")
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                if event.text_delta.is_some() {
                    events.push(event);
                }
            }
            "response.completed" => {
                if let Some(usage) = value.pointer("/response/usage") {
                    events.push(usage_event(usage, "input_tokens", "output_tokens"));
                }
            }
            "response.output_item.done"
                if value.pointer("/item/type").and_then(Value::as_str) == Some("function_call") =>
            {
                let mut event = blank(ModelInvocationEventKind::ToolProposal);
                let arguments = value
                    .pointer("/item/arguments")
                    .and_then(Value::as_str)
                    .and_then(|raw| serde_json::from_str(raw).ok())
                    .unwrap_or(Value::Null);
                event.tool_proposal = Some(ToolProposal {
                    name: value
                        .pointer("/item/name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .chars()
                        .take(128)
                        .collect(),
                    arguments: bounded_arguments(&arguments),
                    provider_opaque_id: value
                        .pointer("/item/call_id")
                        .and_then(Value::as_str)
                        .map(|v| v.chars().take(256).collect()),
                });
                events.push(event);
            }
            _ => {}
        },
        ProviderKind::Anthropic => match value.get("type").and_then(Value::as_str).unwrap_or("") {
            "content_block_delta" => {
                if value.pointer("/delta/type").and_then(Value::as_str) == Some("text_delta") {
                    let mut event = blank(ModelInvocationEventKind::OutputTextDelta);
                    event.text_delta = value
                        .pointer("/delta/text")
                        .and_then(Value::as_str)
                        .map(str::to_owned);
                    if event.text_delta.is_some() {
                        events.push(event);
                    }
                }
            }
            "message_start" => {
                if let Some(usage) = value.pointer("/message/usage") {
                    events.push(usage_event(usage, "input_tokens", "output_tokens"));
                }
            }
            "message_delta" => {
                if let Some(usage) = value.get("usage") {
                    events.push(usage_event(usage, "input_tokens", "output_tokens"));
                }
            }
            "content_block_start"
                if value.pointer("/content_block/type").and_then(Value::as_str)
                    == Some("tool_use") =>
            {
                let mut event = blank(ModelInvocationEventKind::ToolProposal);
                event.tool_proposal = Some(ToolProposal {
                    name: value
                        .pointer("/content_block/name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .chars()
                        .take(128)
                        .collect(),
                    arguments: bounded_arguments(
                        value
                            .pointer("/content_block/input")
                            .unwrap_or(&Value::Null),
                    ),
                    provider_opaque_id: value
                        .pointer("/content_block/id")
                        .and_then(Value::as_str)
                        .map(|v| v.chars().take(256).collect()),
                });
                events.push(event);
            }
            _ => {}
        },
        ProviderKind::OpenaiCompatible => {
            if let Some(delta) = value
                .pointer("/choices/0/delta/content")
                .and_then(Value::as_str)
            {
                let mut event = blank(ModelInvocationEventKind::OutputTextDelta);
                event.text_delta = Some(delta.to_owned());
                events.push(event);
            }
            if let Some(usage) = value.get("usage") {
                events.push(usage_event(usage, "prompt_tokens", "completion_tokens"));
            }
            if let Some(calls) = value
                .pointer("/choices/0/delta/tool_calls")
                .and_then(Value::as_array)
            {
                for call in calls {
                    let mut event = blank(ModelInvocationEventKind::ToolProposal);
                    let arguments = call
                        .pointer("/function/arguments")
                        .and_then(Value::as_str)
                        .and_then(|raw| serde_json::from_str(raw).ok())
                        .unwrap_or(Value::Null);
                    event.tool_proposal = Some(ToolProposal {
                        name: call
                            .pointer("/function/name")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .chars()
                            .take(128)
                            .collect(),
                        arguments: bounded_arguments(&arguments),
                        provider_opaque_id: call
                            .get("id")
                            .and_then(Value::as_str)
                            .map(|v| v.chars().take(256).collect()),
                    });
                    events.push(event);
                }
            }
        }
    }
    events
}

fn bounded_arguments(value: &Value) -> Value {
    serde_json::to_vec(value)
        .ok()
        .filter(|bytes| bytes.len() <= MAX_TOOL_ARGUMENT_BYTES)
        .map(|_| value.clone())
        .unwrap_or_else(|| json!({}))
}

fn usage_event(value: &Value, input: &str, output: &str) -> ModelInvocationEvent {
    let mut event = blank(ModelInvocationEventKind::Usage);
    event.usage = Some(ModelUsage {
        input_tokens: value.get(input).and_then(Value::as_u64),
        output_tokens: value.get(output).and_then(Value::as_u64),
    });
    event
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn different_wire_protocols_normalize_to_same_delta_and_usage() {
        let openai = normalize_provider_event(
            ProviderKind::Openai,
            &json!({"type":"response.output_text.delta","delta":"ok"}),
        );
        let anthropic = normalize_provider_event(
            ProviderKind::Anthropic,
            &json!({"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}),
        );
        let compatible = normalize_provider_event(
            ProviderKind::OpenaiCompatible,
            &json!({"choices":[{"delta":{"content":"ok"}}]}),
        );
        assert_eq!(openai[0].kind, ModelInvocationEventKind::OutputTextDelta);
        assert_eq!(anthropic[0].text_delta.as_deref(), Some("ok"));
        assert_eq!(compatible[0].text_delta.as_deref(), Some("ok"));

        let openai_usage = normalize_provider_event(
            ProviderKind::Openai,
            &json!({"type":"response.completed","response":{"usage":{"input_tokens":2,"output_tokens":3}}}),
        );
        let anthropic_usage = normalize_provider_event(
            ProviderKind::Anthropic,
            &json!({"type":"message_delta","usage":{"input_tokens":2,"output_tokens":3}}),
        );
        let compatible_usage = normalize_provider_event(
            ProviderKind::OpenaiCompatible,
            &json!({"usage":{"prompt_tokens":2,"completion_tokens":3}}),
        );
        for usage in [openai_usage, anthropic_usage, compatible_usage] {
            assert_eq!(usage[0].kind, ModelInvocationEventKind::Usage);
            assert_eq!(usage[0].usage.as_ref().unwrap().input_tokens, Some(2));
            assert_eq!(usage[0].usage.as_ref().unwrap().output_tokens, Some(3));
        }
    }

    #[test]
    fn bounded_sse_decoder_reassembles_split_events_and_rejects_oversize() {
        let mut decoder = SseDecoder::default();
        assert!(decoder.push(b"data: {\"a\"").unwrap().is_empty());
        assert_eq!(decoder.push(b":1}\n\n").unwrap(), vec!["{\"a\":1}"]);
        let mut utf8 = SseDecoder::default();
        assert!(utf8.push(b"data: \xf0\x9f").unwrap().is_empty());
        assert_eq!(utf8.push(b"\x98\x80\n\n").unwrap(), vec!["😀"]);
        let mut malformed = SseDecoder::default();
        assert_eq!(
            malformed.push(b"data: \xff\n\n"),
            Err(ModelError::ProviderProtocolError)
        );
        assert_eq!(
            decoder.push(&vec![b'x'; MAX_EVENT_BYTES + 1]),
            Err(ModelError::ProviderResponseTooLarge)
        );
    }

    #[test]
    fn private_addresses_are_never_valid_custom_targets() {
        assert!(!is_public_ip("127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("10.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("100.64.0.1".parse().unwrap()));
        assert!(!is_public_ip("192.0.2.1".parse().unwrap()));
        assert!(!is_public_ip("198.51.100.1".parse().unwrap()));
        assert!(!is_public_ip("203.0.113.1".parse().unwrap()));
        assert!(!is_public_ip("::1".parse().unwrap()));
        assert!(!is_public_ip("2001:db8::1".parse().unwrap()));
        assert!(is_public_ip("1.1.1.1".parse().unwrap()));
    }

    #[tokio::test]
    async fn custom_endpoint_rejects_ip_literals_and_non_dns_hosts_before_network() {
        for base_url in [
            "https://1.1.1.1/v1",
            "https://[2606:4700:4700::1111]/v1",
            "https://localhost/v1",
            "https://host.local/v1",
        ] {
            assert_eq!(
                endpoint_url(&ProviderEndpoint {
                    kind: ProviderKind::OpenaiCompatible,
                    base_url: Some(base_url.into()),
                })
                .await,
                Err(ModelError::CustomEndpointRejected)
            );
        }
    }

    #[test]
    fn provider_terminal_and_tool_proposals_are_normalized_without_execution() {
        assert!(provider_terminal(
            ProviderKind::Openai,
            &json!({"type":"response.completed"})
        ));
        assert!(provider_terminal(
            ProviderKind::Anthropic,
            &json!({"type":"message_stop"})
        ));
        assert!(!provider_terminal(
            ProviderKind::OpenaiCompatible,
            &json!({"choices":[]})
        ));
        let anthropic = normalize_provider_event(
            ProviderKind::Anthropic,
            &json!({"type":"content_block_start","content_block":{"type":"tool_use","id":"tool-1","name":"lookup","input":{"q":"x"}}}),
        );
        let openai = normalize_provider_event(
            ProviderKind::Openai,
            &json!({"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-0","name":"lookup","arguments":"{\"q\":\"x\"}"}}),
        );
        let compatible = normalize_provider_event(
            ProviderKind::OpenaiCompatible,
            &json!({"choices":[{"delta":{"tool_calls":[{"id":"tool-2","function":{"name":"lookup","arguments":"{\"q\":\"x\"}"}}]}}]}),
        );
        for proposal in [openai, anthropic, compatible] {
            assert_eq!(proposal.len(), 1);
            assert_eq!(proposal[0].kind, ModelInvocationEventKind::ToolProposal);
            assert_eq!(proposal[0].tool_proposal.as_ref().unwrap().name, "lookup");
            assert_eq!(
                proposal[0].tool_proposal.as_ref().unwrap().arguments,
                json!({"q":"x"})
            );
        }
    }

    #[test]
    fn openai_responses_always_disables_store_and_anthropic_does_not_invent_it() {
        let request = ModelInvocationRequest {
            invocation_id: fielora_contracts::ModelInvocationId::new("inv"),
            context_package_id: fielora_contracts::ContextPackageId::new("ctx"),
            provider_config_id: fielora_contracts::ProviderConfigId::new("provider"),
            model_id: "model".into(),
            intent: fielora_contracts::ModelIntent::Ask,
            user_input: "hello".into(),
            context_package: vec![],
            response_mode: fielora_contracts::ResponseMode::Text,
        };
        assert_eq!(
            provider_body(ProviderKind::Openai, &request).get("store"),
            Some(&Value::Bool(false))
        );
        assert!(
            provider_body(ProviderKind::Anthropic, &request)
                .get("store")
                .is_none()
        );
        assert_eq!(
            provider_body(ProviderKind::OpenaiCompatible, &request)
                .pointer("/stream_options/include_usage"),
            Some(&Value::Bool(true))
        );
    }

    #[test]
    fn representative_http_and_stream_failures_have_stable_error_mapping() {
        assert_eq!(
            map_status(StatusCode::UNAUTHORIZED),
            Err(ModelError::CredentialRejected)
        );
        assert_eq!(
            map_status(StatusCode::NOT_FOUND),
            Err(ModelError::ModelNotAvailable)
        );
        assert_eq!(
            map_status(StatusCode::TOO_MANY_REQUESTS),
            Err(ModelError::ProviderRateLimited)
        );
        assert_eq!(
            map_status(StatusCode::BAD_GATEWAY),
            Err(ModelError::ProviderUnavailable)
        );
        assert_eq!(
            map_status(StatusCode::BAD_REQUEST),
            Err(ModelError::ProviderProtocolError)
        );
        assert!(provider_failure(
            ProviderKind::Openai,
            &json!({"type":"response.failed"})
        ));
        assert!(provider_failure(
            ProviderKind::Anthropic,
            &json!({"type":"error"})
        ));
        assert!(provider_failure(
            ProviderKind::OpenaiCompatible,
            &json!({"error":{"message":"redacted"}})
        ));
    }

    #[test]
    fn fragmented_native_tool_calls_converge_to_the_same_agent_turn() {
        let mut openai = AgentStreamAccumulator::new(ProviderKind::Openai);
        openai.push(&json!({"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","call_id":"call-1","name":"read_file","arguments":""}})).unwrap();
        openai.push(&json!({"type":"response.function_call_arguments.delta","output_index":0,"delta":"{\"path\":\"src/"})).unwrap();
        openai.push(&json!({"type":"response.function_call_arguments.delta","output_index":0,"delta":"lib.rs\"}"})).unwrap();
        openai.push(&json!({"type":"response.completed","response":{"usage":{"input_tokens":4,"output_tokens":2}}})).unwrap();

        let mut anthropic = AgentStreamAccumulator::new(ProviderKind::Anthropic);
        anthropic.push(&json!({"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"read_file","input":{}}})).unwrap();
        anthropic.push(&json!({"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"path\":\"src/"}})).unwrap();
        anthropic.push(&json!({"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"lib.rs\"}"}})).unwrap();
        anthropic.push(&json!({"type":"message_stop"})).unwrap();

        let mut compatible = AgentStreamAccumulator::new(ProviderKind::OpenaiCompatible);
        compatible.push(&json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_file","arguments":"{\"path\":\"src/"}}]},"finish_reason":null}]})).unwrap();
        compatible.push(&json!({"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"lib.rs\"}"}}]},"finish_reason":"tool_calls"}]})).unwrap();

        for turn in [
            openai.finish().unwrap(),
            anthropic.finish().unwrap(),
            compatible.finish().unwrap(),
        ] {
            assert_eq!(turn.tool_calls.len(), 1);
            assert_eq!(turn.tool_calls[0].id, "call-1");
            assert_eq!(turn.tool_calls[0].name, "read_file");
            assert_eq!(turn.tool_calls[0].arguments, json!({"path":"src/lib.rs"}));
        }
    }

    #[test]
    fn agent_provider_bodies_preserve_tools_results_and_retention_boundary() {
        let request = AgentModelRequest {
            model_id: "model".into(),
            system: "Work carefully".into(),
            messages: vec![
                AgentModelMessage::User("Inspect".into()),
                AgentModelMessage::Assistant {
                    text: String::new(),
                    tool_calls: vec![AgentModelToolCall {
                        id: "call-1".into(),
                        name: "read_file".into(),
                        arguments: json!({"path":"src/lib.rs"}),
                    }],
                },
                AgentModelMessage::ToolResult {
                    call_id: "call-1".into(),
                    name: "read_file".into(),
                    content: "contents".into(),
                    is_error: false,
                },
            ],
            tools: vec![ModelToolDefinition {
                name: "read_file".into(),
                description: "Read a project file".into(),
                input_schema: json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false}),
            }],
            max_output_tokens: 1024,
        };
        let openai = agent_provider_body(ProviderKind::Openai, &request);
        assert_eq!(openai.get("store"), Some(&Value::Bool(false)));
        assert_eq!(
            openai.pointer("/input/2/type"),
            Some(&json!("function_call_output"))
        );
        assert_eq!(openai.pointer("/tools/0/name"), Some(&json!("read_file")));
        let anthropic = agent_provider_body(ProviderKind::Anthropic, &request);
        assert_eq!(
            anthropic.pointer("/messages/2/content/0/type"),
            Some(&json!("tool_result"))
        );
        assert!(anthropic.get("store").is_none());
        let compatible = agent_provider_body(ProviderKind::OpenaiCompatible, &request);
        assert_eq!(compatible.pointer("/messages/3/role"), Some(&json!("tool")));
        assert_eq!(
            compatible.pointer("/tools/0/type"),
            Some(&json!("function"))
        );
    }

    #[test]
    fn incomplete_tool_json_never_becomes_a_tool_intent() {
        let mut accumulator = AgentStreamAccumulator::new(ProviderKind::OpenaiCompatible);
        accumulator.push(&json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call","function":{"name":"read_file","arguments":"{\"path\":"}}]},"finish_reason":"tool_calls"}]})).unwrap();
        assert_eq!(accumulator.finish(), Err(ModelError::ProviderProtocolError));
    }
}
