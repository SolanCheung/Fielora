# Fielora V0.1 User Local MCP Connection Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `USER-CONFIGURED LOCAL MCP CONNECTION FOUNDATION: IMPLEMENTED / TARGETED VALIDATION`

**Track:** subordinate to `RAPID_DESKTOP_EXECUTION_V0.1.md` and the existing
`Model + Harness + Tools` Agent architecture

**Change Impact:** `HIGH`

This Candidate records the minimum production boundary by which a technical
user may declare an already-installed local stdio MCP server. It does not amend
the Frozen Agent Architecture or Core Contracts.

## 1. Architecture path

```text
PlatformPaths.config_dir/mcp.json
  -> passive McpConnectionSnapshot
  -> mcp.list_connections (OBSERVE)
  -> mcp.activate_connection (PROCESS)
  -> existing PolicyEngine / Approval
  -> executable admission + existing McpStdioToolProvider
  -> existing ManagedChild / env_clear / Job Object
  -> existing provider-neutral Tool catalog
  -> existing RoutedToolExecutor
  -> existing durable ToolCall receipt / Verification boundary
```

There is no Connection Runtime, second MCP Runtime, new process manager,
permission system, receipt hierarchy, or verification system.

## 2. Config source and subset

The only source is `<PlatformPaths.config_dir>/mcp.json`. On the normal Windows
production profile this resolves below `%LOCALAPPDATA%\Fielora\config`.
Development continues to follow the existing `PlatformPaths` root selection.

Accepted external shape:

```json
{
  "mcpServers": {
    "local-example": {
      "command": "C:\\absolute\\path\\server.exe",
      "args": ["--example"]
    }
  }
}
```

Only `command` and optional `args` are accepted. `env`, `headers`, `url`,
remote/HTTP/OAuth/token/secret/package/install fields, and unknown fields are
fail-closed diagnostics. Command must be an absolute executable path; PATH
lookup, command-interpreter files, and shell strings are not admitted.

Bounds are 256 KiB config bytes, eight connections, 1–64 ASCII-safe connection
identifier bytes, 32 arguments, 4096 bytes per argument, and 64 KiB total
argument bytes. Duplicate connection identifiers invalidate the whole snapshot;
an invalid individual definition does not hide valid siblings.

## 3. No-auto-run and Project RCE invariant

Config loading reads exact bounded bytes, calculates a SHA-256 digest, and
parses metadata only. It does not canonicalize or hash an executable, inspect
credentials, spawn a process, perform MCP discovery, or connect to a network.

Project-controlled `.mcp.json`, `mcp.json`, and `.fielora/mcp.json` are not
scanned or imported. Opening a cloned Project cannot activate an executable.

## 4. Activation and TOCTOU

`mcp.activate_connection` is an existing `PROCESS` ToolCall. Policy and any
required Approval complete before executable filesystem admission. Activation
then checks current config bytes against the AgentRun snapshot digest, admits
the absolute regular file, hashes it, constructs the existing MCP provider,
starts its existing `ManagedChild`, and performs bounded MCP discovery. Config
change fails with `MCP_CONNECTION_CONFIG_CHANGED`.

Provider identity binds the connection identifier, canonical executable, argv,
protocol, transport, executable SHA-256, and source config digest. A
server-reported name/version is not routing authority. On Windows the provider
retains a read-only executable handle that denies write/delete sharing, so the
path cannot be replaced after hashing and before/during `CreateProcess`.

## 5. Dynamic catalog and conservative risk

The general Harness rebuilds the same provider-neutral catalog at each model
turn boundary. Before activation the connection contributes no MCP tool. A
successfully admitted run-scoped provider becomes visible on the next turn; no
MCP-specific Agent loop exists.

Fielora-authored MCP admission policy is generic. Existing known fixture/local
providers may explicitly use `OBSERVE`. Every tool contributed by a
user-configured provider uses existing `AgentToolEffect::DESTRUCTIVE`, including
when native MCP annotations claim `readOnlyHint=true` or
`destructiveHint=false`. Provider names, descriptions, and annotations cannot
lower risk, grant permission, or bypass Approval.

## 6. Lifecycle, credentials, and provenance

Activation is AgentRun-scoped. Terminal completion, cancellation, failed
discovery, provider failure, and Core process exit drop the provider and reuse
the existing MCP/ManagedChild shutdown and Windows Job Object cleanup. No
durable active flag, daemon, or hot reload exists.

The first Slice does not read CredentialStore or inherit the parent environment.
Configured `env`, token, headers, and remote authentication are unsupported.
Raw config bytes, executable paths, argv, and environment are excluded from
Model Context, receipts, and durable Agent events.

Activation receipt provenance is bounded to connection ID, config digest,
provider ID, STDIO, protocol version, executable digest, and discovered-tool
count. Downstream calls retain the existing MCP execution-source envelope.

## 7. Verification boundary

```text
activation success != Verification PASS
discovery success != server trust
MCP tool success != factual correctness
MCP tool success != semantic authority
```

Conservative `DESTRUCTIVE` classification is governance risk, not evidence that
the Project workspace changed. User MCP success therefore cannot mint a
VerificationReceipt or a workspace-mutation fact.

## 8. Evidence and limitations

Deterministic production-path tests cover passive listing, Process Approval,
double approval for an unknown tool, next-turn dynamic exposure, annotations
that cannot downgrade risk, real stdio discovery/call, durable ToolCall receipts,
TOCTOU, Project-config exclusion, missing executable, failed-discovery cleanup,
terminal cleanup, no raw config/path/argv persistence, and no VerificationReceipt.
Existing MCP transport cancellation, UNKNOWN, crash, empty-environment, and
descendant cleanup regression remains authoritative.

Not implemented: UI, config mutation, hot reload, auto-activation, per-tool
enablement/effect editing, remembered trust, project import, remote transport,
credentials, installer/package resolution, Marketplace, or community-server
supply-chain acceptance.
