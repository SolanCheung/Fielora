use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

const VERSION: &str = "2026-07-28";

fn main() {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let mode = arguments.first().map(String::as_str).unwrap_or("normal");
    if matches!(mode, "unknown-readonly-hint" | "record-pid-crash-list") {
        let pid_path = PathBuf::from(arguments.get(1).expect("server pid path"));
        std::fs::write(pid_path, std::process::id().to_string()).expect("write server pid");
    }
    if mode == "child-sleeper" {
        let pid_path = PathBuf::from(arguments.get(1).expect("child pid path"));
        std::fs::write(pid_path, std::process::id().to_string()).expect("write child pid");
        loop {
            thread::sleep(Duration::from_secs(1));
        }
    }

    let descendant_pid_path = arguments.get(1).map(PathBuf::from);
    let input = std::io::stdin();
    let mut reader = BufReader::new(input.lock());
    let output = std::io::stdout();
    let mut writer = output.lock();
    let mut pending_call: Option<Value> = None;
    let mut slow_once_consumed = false;
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let request: Value = match serde_json::from_str(line.trim_end()) {
            Ok(request) => request,
            Err(_) => continue,
        };
        let method = request.get("method").and_then(Value::as_str).unwrap_or("");
        if method == "initialize" || method == "notifications/initialized" {
            std::process::exit(91);
        }
        match method {
            "server/discover" => {
                if mode == "crash-discover" {
                    std::process::exit(92);
                }
                if mode == "hang-discover" {
                    continue;
                }
                if mode == "require-empty-env" && std::env::vars_os().next().is_some() {
                    std::process::exit(95);
                }
                if !has_exact_meta(&request) {
                    write_error(
                        &mut writer,
                        request.get("id"),
                        -32602,
                        "missing exact metadata",
                    );
                    continue;
                }
                let versions = if mode == "wrong-version" {
                    json!(["2025-11-25"])
                } else {
                    json!([VERSION])
                };
                write_result(
                    &mut writer,
                    request.get("id"),
                    json!({
                        "resultType":"complete",
                        "supportedVersions":versions,
                        "capabilities":{"tools":{}},
                        "ttlMs":0,
                        "cacheScope":"private"
                    }),
                );
            }
            "tools/list" => {
                if !has_exact_meta(&request) {
                    write_error(
                        &mut writer,
                        request.get("id"),
                        -32602,
                        "missing exact metadata",
                    );
                    continue;
                }
                if matches!(mode, "ignore-cancel" | "descendant-ignore-cancel")
                    && pending_call.is_some()
                {
                    continue;
                }
                if matches!(mode, "crash-list" | "record-pid-crash-list") {
                    std::process::exit(93);
                }
                if mode == "malformed-list" {
                    writeln!(writer, "{{not-json").expect("write malformed response");
                    writer.flush().expect("flush malformed response");
                    continue;
                }
                if mode == "invalid-utf8-list" {
                    writer
                        .write_all(&[0xff, b'\n'])
                        .expect("write invalid UTF-8 discovery response");
                    writer
                        .flush()
                        .expect("flush invalid UTF-8 discovery response");
                    continue;
                }
                let page_index = request
                    .pointer("/params/cursor")
                    .and_then(Value::as_str)
                    .and_then(|cursor| cursor.strip_prefix("page-"))
                    .and_then(|page| page.parse::<usize>().ok())
                    .unwrap_or(0);
                let schema = match mode {
                    "invalid-schema-root" => json!({"type":"string"}),
                    "deep-schema" => deep_schema(),
                    "oversized-schema" => json!({
                        "type":"object",
                        "description":"x".repeat(70 * 1024)
                    }),
                    "aggregate-overflow" => json!({
                        "type":"object",
                        "description":"x".repeat(55 * 1024),
                        "properties":{}
                    }),
                    "unsupported-schema" => json!({
                        "type":"object",
                        "$ref":"https://fixture.invalid/schema"
                    }),
                    _ => json!({
                        "type":"object",
                        "properties":{"value":{"type":"string"}},
                        "required":["value"],
                        "additionalProperties":false
                    }),
                };
                let count = match mode {
                    "too-many-tools" => 33,
                    "duplicate-tools" => 2,
                    "aggregate-overflow" => 3,
                    _ => 1,
                };
                let tools = (0..count)
                    .map(|index| {
                        let name = if mode == "unknown-readonly-hint" {
                            "arbitrary_unknown_tool".to_owned()
                        } else if mode == "duplicate-tools" || (index == 0 && page_index == 0) {
                            "observe_echo".to_owned()
                        } else {
                            format!("observe_echo_{}", page_index * count + index)
                        };
                        json!({
                            "name":name,
                            "description":"Return a deterministic read-only echo.",
                            "inputSchema":schema,
                            "annotations":{"readOnlyHint":true,"destructiveHint":false}
                        })
                    })
                    .collect::<Vec<_>>();
                if mode == "oversized-list-frame" {
                    let oversized = json!({
                        "jsonrpc":"2.0",
                        "id":request.get("id"),
                        "result":{
                            "resultType":"complete",
                            "tools":tools,
                            "ttlMs":0,
                            "cacheScope":"private",
                            "padding":"x".repeat(300 * 1024)
                        }
                    });
                    writeln!(writer, "{oversized}").expect("write oversized frame");
                    writer.flush().expect("flush oversized frame");
                    continue;
                }
                write_result(
                    &mut writer,
                    request.get("id"),
                    json!({
                        "resultType":"complete",
                        "tools":tools,
                        "nextCursor":if matches!(mode, "too-many-pages" | "aggregate-overflow") {
                            Some(format!("page-{}", page_index + 1))
                        } else {
                            None
                        },
                        "ttlMs":0,
                        "cacheScope":"private"
                    }),
                );
                if mode == "exit-after-list" {
                    std::process::exit(96);
                }
            }
            "tools/call" => {
                if !has_exact_meta(&request) {
                    write_error(
                        &mut writer,
                        request.get("id"),
                        -32602,
                        "missing exact metadata",
                    );
                    continue;
                }
                match mode {
                    "crash-call" => std::process::exit(94),
                    "invalid-json-call" => {
                        writeln!(writer, "{{not-json").expect("write malformed call response");
                        writer.flush().expect("flush malformed call response");
                    }
                    "invalid-utf8-call" => {
                        writer
                            .write_all(&[0xff, b'\n'])
                            .expect("write invalid UTF-8 response");
                        writer.flush().expect("flush invalid UTF-8 response");
                    }
                    "oversized-call-frame" => {
                        writeln!(writer, "{}", "x".repeat(300 * 1024))
                            .expect("write oversized call response");
                        writer.flush().expect("flush oversized call response");
                    }
                    "invalid-id" => {
                        write_result(
                            &mut writer,
                            Some(&json!(999_999)),
                            json!({
                                "resultType":"complete",
                                "content":[],
                                "structuredContent":{"echo":"wrong-id"},
                                "isError":false
                            }),
                        );
                    }
                    "server-request-call" => {
                        writeln!(
                            writer,
                            "{}",
                            json!({
                                "jsonrpc":"2.0",
                                "id":"fixture-server-request",
                                "method":"sampling/createMessage",
                                "params":{}
                            })
                        )
                        .expect("write unsupported server request");
                        writer.flush().expect("flush unsupported server request");
                    }
                    "rpc-error-call" => {
                        write_error(
                            &mut writer,
                            request.get("id"),
                            -32603,
                            "deterministic fixture application error",
                        );
                    }
                    "mrtr" => {
                        write_result(
                            &mut writer,
                            request.get("id"),
                            json!({"resultType":"input_required","requestState":"fixture-state"}),
                        );
                    }
                    "tool-error" => {
                        write_result(
                            &mut writer,
                            request.get("id"),
                            json!({
                                "resultType":"complete",
                                "content":[{"type":"text","text":"fixture failure"}],
                                "isError":true
                            }),
                        );
                    }
                    "slow" | "ignore-cancel" => {
                        pending_call = request.get("id").cloned();
                    }
                    "slow-once" if !slow_once_consumed => {
                        slow_once_consumed = true;
                        pending_call = request.get("id").cloned();
                    }
                    "descendant-ignore-cancel" => {
                        let pid_path = descendant_pid_path.as_ref().expect("descendant pid path");
                        let executable = std::env::current_exe().expect("fixture executable");
                        #[allow(
                            clippy::zombie_processes,
                            reason = "the test intentionally kills the parent Job Object and asserts that this descendant is reaped"
                        )]
                        let _child = Command::new(executable)
                            .arg("child-sleeper")
                            .arg(pid_path)
                            .stdin(Stdio::null())
                            .stdout(Stdio::null())
                            .stderr(Stdio::null())
                            .spawn()
                            .expect("spawn descendant");
                        pending_call = request.get("id").cloned();
                    }
                    _ => {
                        let value = request
                            .pointer("/params/arguments/value")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        write_result(
                            &mut writer,
                            request.get("id"),
                            json!({
                                "resultType":"complete",
                                "content":[{"type":"text","text":json!({"echo":value}).to_string()}],
                                "structuredContent":{"echo":value},
                                "isError":false
                            }),
                        );
                    }
                }
            }
            "notifications/cancelled" => {
                let cancelled = request.pointer("/params/requestId");
                if matches!(mode, "slow" | "slow-once") && cancelled == pending_call.as_ref() {
                    pending_call = None;
                }
            }
            _ => {
                if request.get("id").is_some() {
                    write_error(&mut writer, request.get("id"), -32601, "method not found");
                }
            }
        }
    }
}

fn has_exact_meta(request: &Value) -> bool {
    request
        .pointer("/params/_meta/io.modelcontextprotocol~1protocolVersion")
        .and_then(Value::as_str)
        == Some(VERSION)
        && request
            .pointer("/params/_meta/io.modelcontextprotocol~1clientCapabilities")
            .is_some()
}

fn deep_schema() -> Value {
    let mut schema = json!({"type":"string"});
    for _ in 0..17 {
        schema = json!({"type":"object","properties":{"nested":schema}});
    }
    schema
}

fn write_result(writer: &mut impl Write, id: Option<&Value>, result: Value) {
    writeln!(
        writer,
        "{}",
        json!({"jsonrpc":"2.0","id":id.cloned().unwrap_or(Value::Null),"result":result})
    )
    .expect("write response");
    writer.flush().expect("flush response");
}

fn write_error(writer: &mut impl Write, id: Option<&Value>, code: i64, message: &str) {
    writeln!(
        writer,
        "{}",
        json!({
            "jsonrpc":"2.0",
            "id":id.cloned().unwrap_or(Value::Null),
            "error":{"code":code,"message":message}
        })
    )
    .expect("write error");
    writer.flush().expect("flush error");
}
