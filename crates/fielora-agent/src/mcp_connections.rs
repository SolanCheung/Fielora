//! Passive, bounded parsing for user-owned local MCP connection definitions.
//!
//! Loading this file never resolves an executable, starts a process, performs
//! MCP discovery, reads credentials, or inspects a Project directory.

use serde::Deserialize;
use serde::de::{Deserializer, MapAccess, Visitor};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fmt;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

pub const USER_MCP_CONFIG_FILENAME: &str = "mcp.json";
pub const MAX_USER_MCP_CONFIG_BYTES: usize = 256 * 1024;
pub const MAX_USER_MCP_CONNECTIONS: usize = 8;
const MAX_CONNECTION_ID_BYTES: usize = 64;
const MAX_ARGUMENTS: usize = 32;
const MAX_ARGUMENT_BYTES: usize = 4096;
const MAX_TOTAL_ARGUMENT_BYTES: usize = 64 * 1024;

#[derive(Clone, PartialEq, Eq)]
pub struct McpConnectionDefinition {
    connection_id: String,
    executable: PathBuf,
    arguments: Vec<String>,
}

impl fmt::Debug for McpConnectionDefinition {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("McpConnectionDefinition")
            .field("connection_id", &self.connection_id)
            .field("executable", &"<redacted>")
            .field("argument_count", &self.arguments.len())
            .finish()
    }
}

impl McpConnectionDefinition {
    pub fn connection_id(&self) -> &str {
        &self.connection_id
    }

    pub fn executable(&self) -> &Path {
        &self.executable
    }

    pub fn arguments(&self) -> &[String] {
        &self.arguments
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpConnectionDiagnostic {
    pub connection_id: Option<String>,
    pub code: &'static str,
}

#[derive(Clone)]
pub struct McpConnectionSnapshot {
    config_path: PathBuf,
    digest: Option<String>,
    status: &'static str,
    connections: Vec<McpConnectionDefinition>,
    diagnostics: Vec<McpConnectionDiagnostic>,
}

impl fmt::Debug for McpConnectionSnapshot {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("McpConnectionSnapshot")
            .field("config_path", &"<redacted>")
            .field("digest", &self.digest)
            .field("status", &self.status)
            .field("connection_count", &self.connections.len())
            .field("diagnostics", &self.diagnostics)
            .finish()
    }
}

impl McpConnectionSnapshot {
    pub fn load(config_path: impl Into<PathBuf>) -> Self {
        let config_path = config_path.into();
        let bytes = match read_bounded_config(&config_path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Self::terminal(config_path, "CONFIG_NOT_FOUND", None);
            }
            Err(_) => return Self::terminal(config_path, "CONFIG_MALFORMED", None),
        };
        let digest = digest_hex(&bytes);
        let root = match serde_json::from_slice::<RawRoot>(&bytes) {
            Ok(root) => root,
            Err(_) => return Self::terminal(config_path, "CONFIG_MALFORMED", Some(digest)),
        };
        if root.servers.0.len() > MAX_USER_MCP_CONNECTIONS {
            return Self::terminal(config_path, "CONFIG_MALFORMED", Some(digest));
        }
        let mut seen = HashSet::new();
        if root
            .servers
            .0
            .iter()
            .any(|(connection_id, _)| !seen.insert(connection_id.clone()))
        {
            return Self::terminal(config_path, "CONFIG_MALFORMED", Some(digest));
        }

        let mut connections = Vec::new();
        let mut diagnostics = Vec::new();
        for (connection_id, value) in root.servers.0 {
            match parse_connection(&connection_id, value) {
                Ok(connection) => connections.push(connection),
                Err(code) => diagnostics.push(McpConnectionDiagnostic {
                    connection_id: bounded_diagnostic_id(&connection_id),
                    code,
                }),
            }
        }
        connections.sort_by(|left, right| left.connection_id.cmp(&right.connection_id));
        diagnostics.sort_by(|left, right| left.connection_id.cmp(&right.connection_id));
        Self {
            config_path,
            digest: Some(digest),
            status: "CONFIGURED",
            connections,
            diagnostics,
        }
    }

    fn terminal(config_path: PathBuf, status: &'static str, digest: Option<String>) -> Self {
        Self {
            config_path,
            digest,
            status,
            connections: Vec::new(),
            diagnostics: vec![McpConnectionDiagnostic {
                connection_id: None,
                code: status,
            }],
        }
    }

    pub fn status(&self) -> &'static str {
        self.status
    }

    pub fn digest(&self) -> Option<&str> {
        self.digest.as_deref()
    }

    pub fn connections(&self) -> &[McpConnectionDefinition] {
        &self.connections
    }

    pub fn diagnostics(&self) -> &[McpConnectionDiagnostic] {
        &self.diagnostics
    }

    pub fn connection(&self, connection_id: &str) -> Option<&McpConnectionDefinition> {
        self.connections
            .iter()
            .find(|connection| connection.connection_id == connection_id)
    }

    /// Re-read only the bounded bytes and compare their digest immediately
    /// before activation. The bytes are never returned or persisted.
    pub fn current_bytes_match(&self) -> bool {
        let Some(expected) = self.digest.as_deref() else {
            return false;
        };
        let Ok(bytes) = read_bounded_config(&self.config_path) else {
            return false;
        };
        digest_hex(&bytes) == expected
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRoot {
    #[serde(rename = "mcpServers")]
    servers: ServerEntries,
}

struct ServerEntries(Vec<(String, Value)>);

impl<'de> Deserialize<'de> for ServerEntries {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct ServerEntriesVisitor;

        impl<'de> Visitor<'de> for ServerEntriesVisitor {
            type Value = ServerEntries;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("an MCP server object")
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                let mut entries = Vec::new();
                while let Some((connection_id, value)) = map.next_entry::<String, Value>()? {
                    entries.push((connection_id, value));
                }
                Ok(ServerEntries(entries))
            }
        }

        deserializer.deserialize_map(ServerEntriesVisitor)
    }
}

fn parse_connection(
    connection_id: &str,
    value: Value,
) -> Result<McpConnectionDefinition, &'static str> {
    if !valid_connection_id(connection_id) {
        return Err("CONNECTION_UNSUPPORTED");
    }
    let object = value.as_object().ok_or("CONNECTION_UNSUPPORTED")?;
    if object.keys().any(|key| {
        matches!(
            key.to_ascii_lowercase().as_str(),
            "env" | "headers" | "oauth" | "token" | "apikey" | "api_key" | "api-key" | "secret"
        )
    }) {
        return Err("UNAVAILABLE_CREDENTIAL_UNSUPPORTED");
    }
    if object
        .keys()
        .any(|key| !matches!(key.as_str(), "command" | "args"))
    {
        return Err("CONFIG_UNSUPPORTED");
    }
    let command = object
        .get("command")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or("CONNECTION_UNSUPPORTED")?;
    let executable = PathBuf::from(command);
    if !executable.is_absolute() {
        return Err("EXECUTABLE_INVALID");
    }
    let executable_stem = executable
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let executable_extension = executable
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(
        executable_stem.as_str(),
        "cmd" | "powershell" | "pwsh" | "bash" | "sh" | "wsl"
    ) || matches!(executable_extension.as_str(), "bat" | "cmd" | "ps1")
    {
        return Err("EXECUTABLE_INVALID");
    }
    let arguments = match object.get("args") {
        None => Vec::new(),
        Some(Value::Array(values)) if values.len() <= MAX_ARGUMENTS => values
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .filter(|argument| argument.len() <= MAX_ARGUMENT_BYTES)
                    .map(str::to_owned)
                    .ok_or("CONNECTION_UNSUPPORTED")
            })
            .collect::<Result<Vec<_>, _>>()?,
        Some(_) => return Err("CONNECTION_UNSUPPORTED"),
    };
    if arguments.iter().map(String::len).sum::<usize>() > MAX_TOTAL_ARGUMENT_BYTES {
        return Err("CONNECTION_UNSUPPORTED");
    }
    if arguments
        .iter()
        .any(|argument| argument_looks_secret_bearing(argument))
    {
        return Err("UNAVAILABLE_CREDENTIAL_UNSUPPORTED");
    }
    Ok(McpConnectionDefinition {
        connection_id: connection_id.to_owned(),
        executable,
        arguments,
    })
}

fn valid_connection_id(value: &str) -> bool {
    (1..=MAX_CONNECTION_ID_BYTES).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn bounded_diagnostic_id(value: &str) -> Option<String> {
    if value.len() <= MAX_CONNECTION_ID_BYTES && value.is_ascii() {
        Some(value.to_owned())
    } else {
        None
    }
}

fn argument_looks_secret_bearing(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "--token",
        "--api-key",
        "--apikey",
        "--secret",
        "--header",
        "authorization:",
        "bearer ",
        "token=",
        "api_key=",
        "apikey=",
        "api-key=",
        "secret=",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn read_bounded_config(path: &Path) -> std::io::Result<Vec<u8>> {
    let file = fs::File::open(path)?;
    let mut bytes = Vec::with_capacity(MAX_USER_MCP_CONFIG_BYTES.min(16 * 1024));
    file.take((MAX_USER_MCP_CONFIG_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_USER_MCP_CONFIG_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "MCP config exceeds bound",
        ));
    }
    Ok(bytes)
}

fn digest_hex(bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(bytes);
    format!("{:x}", digest.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use uuid::Uuid;

    fn temp_file() -> PathBuf {
        std::env::temp_dir().join(format!("fielora-user-mcp-{}.json", Uuid::now_v7()))
    }

    fn write_config(contents: &[u8]) -> PathBuf {
        let path = temp_file();
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(contents).unwrap();
        path
    }

    fn absolute_fixture_path() -> String {
        if cfg!(windows) {
            r#"C:\Program Files\MCP\server.exe"#.into()
        } else {
            "/opt/mcp/server".into()
        }
    }

    #[test]
    fn valid_config_is_bounded_metadata_only_and_digest_is_exact() {
        let command = absolute_fixture_path();
        let bytes = serde_json::to_vec(&serde_json::json!({
            "mcpServers":{"local-example":{"command":command,"args":["--example"]}}
        }))
        .unwrap();
        let path = write_config(&bytes);
        let snapshot = McpConnectionSnapshot::load(&path);
        assert_eq!(snapshot.status(), "CONFIGURED");
        assert_eq!(snapshot.connections().len(), 1);
        assert_eq!(snapshot.digest(), Some(digest_hex(&bytes).as_str()));
        assert!(snapshot.current_bytes_match());
        fs::write(&path, b"{}").unwrap();
        assert!(!snapshot.current_bytes_match());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn missing_malformed_oversized_and_too_many_fail_closed() {
        let missing = temp_file();
        assert_eq!(
            McpConnectionSnapshot::load(missing).status(),
            "CONFIG_NOT_FOUND"
        );
        for bytes in [
            b"{".to_vec(),
            vec![b' '; MAX_USER_MCP_CONFIG_BYTES + 1],
            serde_json::to_vec(&serde_json::json!({
                "mcpServers":(0..9).map(|index| (format!("server-{index}"), serde_json::json!({"command":absolute_fixture_path()}))).collect::<serde_json::Map<_,_>>()
            })).unwrap(),
        ] {
            let path = write_config(&bytes);
            assert_eq!(McpConnectionSnapshot::load(&path).status(), "CONFIG_MALFORMED");
            fs::remove_file(path).unwrap();
        }
    }

    #[test]
    fn connection_failures_do_not_hide_valid_siblings() {
        let command = absolute_fixture_path();
        let bytes = format!(
            r#"{{"mcpServers":{{"valid":{{"command":{command:?}}},"bad id":{{"command":{command:?}}},"relative":{{"command":"npx"}},"credential":{{"command":{command:?},"env":{{}}}},"remote":{{"command":{command:?},"url":"https://example.com"}},"unknown":{{"command":{command:?},"future":true}}}}}}"#
        );
        let path = write_config(bytes.as_bytes());
        let snapshot = McpConnectionSnapshot::load(&path);
        assert_eq!(snapshot.connections().len(), 1);
        assert_eq!(snapshot.diagnostics().len(), 5);
        assert!(
            snapshot
                .diagnostics()
                .iter()
                .any(|diagnostic| diagnostic.code == "EXECUTABLE_INVALID")
        );
        assert!(
            snapshot
                .diagnostics()
                .iter()
                .any(|diagnostic| diagnostic.code == "UNAVAILABLE_CREDENTIAL_UNSUPPORTED")
        );
        assert!(
            snapshot
                .diagnostics()
                .iter()
                .any(|diagnostic| diagnostic.code == "CONFIG_UNSUPPORTED")
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn duplicate_connection_id_is_not_collapsed_by_json_parser() {
        let command = absolute_fixture_path();
        let encoded = serde_json::to_string(&command).unwrap();
        let bytes = "{\"mcpServers\":{\"duplicate\":{\"command\":".to_owned()
            + &encoded
            + "},\"duplicate\":{\"command\":"
            + &encoded
            + "}}}";
        let path = write_config(bytes.as_bytes());
        let snapshot = McpConnectionSnapshot::load(&path);
        assert_eq!(snapshot.status(), "CONFIG_MALFORMED");
        assert!(snapshot.connections().is_empty());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn argument_bounds_and_secret_like_arguments_are_rejected() {
        let command = absolute_fixture_path();
        let cases = [
            serde_json::json!({"mcpServers":{"x":{"command":command,"args":vec!["x"; 33]}}}),
            serde_json::json!({"mcpServers":{"x":{"command":command,"args":["x".repeat(4097)]}}}),
            serde_json::json!({"mcpServers":{"x":{"command":command,"args":["--token=secret"]}}}),
        ];
        for value in cases {
            let path = write_config(&serde_json::to_vec(&value).unwrap());
            let snapshot = McpConnectionSnapshot::load(&path);
            assert!(snapshot.connections().is_empty());
            assert_eq!(snapshot.diagnostics().len(), 1);
            fs::remove_file(path).unwrap();
        }
    }

    #[test]
    fn command_interpreters_are_not_accepted_as_local_servers() {
        let commands = if cfg!(windows) {
            vec![
                r#"C:\Windows\System32\cmd.exe"#,
                r#"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"#,
                r#"C:\servers\launch.cmd"#,
            ]
        } else {
            vec!["/bin/sh", "/usr/bin/bash", "/opt/server/launch.ps1"]
        };
        for command in commands {
            let path = write_config(
                &serde_json::to_vec(&serde_json::json!({
                    "mcpServers":{"x":{"command":command,"args":[]}}
                }))
                .unwrap(),
            );
            let snapshot = McpConnectionSnapshot::load(&path);
            assert!(snapshot.connections().is_empty());
            assert_eq!(snapshot.diagnostics()[0].code, "EXECUTABLE_INVALID");
            fs::remove_file(path).unwrap();
        }
    }
}
