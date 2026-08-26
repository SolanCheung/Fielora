# Fielora V0.1 MCP Connection UI Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `FIRST SLICE IMPLEMENTED / TARGETED EVIDENCE PASS / HUMAN REVIEW PENDING`

**Baseline:** `5d9b0764ec655de791704fe5add5b631b176e154`

**Track:** subordinate to `RAPID_DESKTOP_EXECUTION_V0.1.md`, the existing
Desktop Foundation, and the canonical `Model + Harness + Tools` Agent
architecture

**Overall Change Impact:** `MEDIUM`

This Candidate defines and records the smallest honest Desktop presentation
for the implemented user-configured Local MCP Connection foundation. The First
Slice was implemented under explicit user authorization. It does not amend the
Frozen/Baseline architecture, change MCP process lifetime, or add durable
connection state. It remains a Candidate rather than a Frozen specification.

## 1. Current UI reality

### 1.1 Existing product surfaces

- Primary navigation is implemented by `PrimaryNav.tsx`. It currently exposes
  New chat, Now, Library, Projects, and Settings. It has no Extensions or MCP
  entry. Browse is a workspace utility rather than a primary navigation item.
- Settings is a shared `WorkspaceSurface` with a resizable navigation column.
  `SettingsScreen.tsx` now contains a dedicated MCP category backed by the
  passive `McpSettings.tsx` projection. Browser settings remains a
  context-opened category and is not a normal Settings navigation item.
- Provider settings already use a compact configured-service list, bounded
  inline diagnostics, explicit credential presence, and a connection probe.
  Model Provider configuration is not an appropriate semantic owner for MCP:
  MCP contributes Tools, not Models.
- Project and Conversation are the current primary work surface.
  `ProjectWorkspace.tsx` reads durable AgentRun, Event, ToolCall, and Approval
  projections. `AgentTurn.tsx` renders work activity, Approval, progress, and
  technical detail inline with the Conversation.
- The right workspace surface is `RightWorkspaceDock`. It currently owns Files,
  Review, Browser, and Terminal resources. It is not a general Context or
  AgentRun inspector, and MCP management should not turn it into one.
- Errors currently use contextual patterns rather than a global diagnostic
  service: inline Settings errors/status, the Project toast, startup recovery,
  and detailed Storage rows.
- The UI system is the current Quiet Workbench design language: semantic
  `--fl-*` tokens, `Button`, `IconButton`, `ToolbarAction`, `SelectMenu`,
  `TextActionDialog`, `WorkspaceSurface`, and `ResizableDivider`.

### 1.2 Current MCP backend facts

- `McpConnectionSnapshot` passively reads bounded
  `<PlatformPaths.config_dir>/mcp.json`. It does not inspect an executable,
  start a process, discover Tools, read credentials, or scan a Project.
- `mcp.list_connections` is an existing built-in `OBSERVE` Tool. It reports a
  run snapshot's config status, valid connection IDs, per-entry diagnostics,
  transport, and whether a connection is active for that Run. It is not an
  app-level UI query and cannot be called by the trusted Renderer.
- `mcp.activate_connection` is an existing built-in `PROCESS` Tool. Core adds
  the private run snapshot digest, then uses the existing ToolCall,
  `PolicyEngine`, Approval, execution, receipt, and Verification boundary.
- Successful activation stores an in-memory provider only in
  `AgentCoordinator.run_mcp_states`. Its activation receipt contains provider
  ID, STDIO, MCP protocol version, executable digest, and discovered Tool
  count. Run terminal/cancel removes the state and drops the provider.
- Current `AgentToolCallView` and Agent events can show a completed or failed
  activation after it happened. They do not form a complete current MCP
  runtime projection and cannot continuously prove process liveness.
- `McpStdioToolProvider` has last-observed `Available`/`Unavailable` health and
  bounded one-restart behavior. There is no heartbeat or durable Connected
  state. A process that exits can remain last-observed available until an MCP
  operation detects the failure.
- Every Tool contributed by a user-configured MCP provider has the existing
  Fielora effect `DESTRUCTIVE`. MCP annotations are currently discarded and
  cannot lower this effect.

### 1.3 Current reality table

| Item | Reality | Current module/file | Existing semantic owner | Gap |
|---|---|---|---|---|
| MCP page/surface | `EXISTS` | `apps/desktop/src/renderer/SettingsScreen.tsx`, `McpSettings.tsx` | Desktop Product UI | Passive configuration and bounded diagnostics only; editing remains deferred. |
| Extension navigation | `ABSENT` | `apps/desktop/src/renderer/PrimaryNav.tsx`, `SettingsScreen.tsx` | Product information architecture | No Extensions group; adding empty Skills/Plugins surfaces would be premature. |
| Settings navigation | `EXISTS` | `SettingsScreen.tsx`, `WorkspaceSurface.tsx` | Settings Product UI | MCP is a Settings category; no primary Extensions navigation was added. |
| connection list DTO | `EXISTS` | `McpConnectionCatalogView`, `query.agent.mcp_connections` | Harness/Tools projection | Fresh passive app view exists; it intentionally has no edit/watch behavior. |
| active-run MCP state | `EXISTS` | `McpConnectionRuntimeView`, `AgentCoordinator.run_mcp_states`, activation ToolCall receipt | `Harness.Execution` | Bounded current-Run state and last-observed availability exist; continuous liveness/heartbeat remains deferred. |
| tool inspector DTO | `ABSENT` | `ToolProvider`, `ProviderToolDefinition`, `ToolSpec` | Tools catalog | Tool definitions are internal; activation retains only the count for UI-relevant facts. MCP annotations are not retained. |
| activation command | `EXISTS` | `command.agent.activate_mcp_connection`; built-in `mcp.activate_connection`; `propose_tool_call` | `Harness.Governance` + `Harness.Execution` | Human ingress is restricted to one built-in Tool and executes at the existing safe boundary. |
| config refresh | `EXISTS` | `McpSettings.tsx`; `McpConnectionSnapshot::load` | passive config admission | Refresh re-reads only the app view; existing Run snapshots intentionally do not refresh. |
| file reveal/open | `PARTIAL` | Electron Main scoped workspace/library/storage handlers | Desktop Platform integration | Safe scoped handlers exist, but no MCP config target exists and there is no acceptable generic arbitrary-path opener. |
| approval integration | `EXISTS` | `PolicyEngine`, `AgentCoordinator`, `ProjectWorkspace.tsx`, `AgentTurn.tsx` | `Harness.Governance` and Conversation UI | Manual activation reuses ordinary PROCESS Approval; MCP-specific copy does not create a second dialog. |
| diagnostic component | `EXISTS` | `McpSettings.tsx`, `AgentTurn.tsx` | Product UI | Bounded config/activation codes are shown inline; raw stdout/stderr and logs remain excluded. |

## 2. Information architecture

### 2.1 First Slice placement

Use two existing semantic locations:

```text
Settings
└── MCP                    app-level passive configuration facts

Current Conversation
└── Current AgentRun details
    └── MCP for this run   run-level activation and runtime facts
```

`Settings -> MCP` is preferred over a new primary-navigation item. MCP must be
a distinct Settings category rather than a child of Models & Services because
the internal owner is a Tool Provider/backend, not a Model Provider.

The current AgentRun block should use progressive disclosure inside the
existing `AgentTurn` execution detail. It must not create a permanent right
sidebar, a new right-dock Tool, or a fourth visible Surface.

### 2.2 Future Extensions grouping

The following remains a valid future information architecture only after more
than one contribution type has real user-facing behavior:

```text
Extensions
├── Skills
├── MCP
└── Plugins
```

The First Slice must not create empty Skills, Plugins, Explore, Store, or
Marketplace pages and must not add Extensions to primary navigation.

## 3. Connection state model

The UI uses orthogonal state axes. It must never collapse them into
`Connected: true`.

### 3.1 App configuration state

| State | Meaning | Source |
|---|---|---|
| `NO_CONFIG_FILE` | The Fielora user `mcp.json` does not exist. | `CONFIG_NOT_FOUND` from a fresh passive snapshot. |
| `CONFIGURED` | This connection definition passed the current bounded Local STDIO subset. | Valid `McpConnectionDefinition` in the passive snapshot. |
| `CONFIG_ERROR` | The whole file or this entry is malformed/invalid. | `CONFIG_MALFORMED`, `EXECUTABLE_INVALID`, or other parser diagnostics. |
| `UNSUPPORTED` | The definition requests a currently unsupported semantic. | `CONFIG_UNSUPPORTED`, `CONNECTION_UNSUPPORTED`, or `UNAVAILABLE_CREDENTIAL_UNSUPPORTED`. |

`CONFIGURED` does not mean the executable exists or has been admitted. Current
passive parsing deliberately does not inspect it.

### 3.2 Current AgentRun activation state

| State | Meaning | Source |
|---|---|---|
| `NOT_ACTIVE` | The Run snapshot contains the connection but no provider was admitted. | No activation in current `RunMcpState`. |
| `ACTIVATION_PENDING_APPROVAL` | A normal activation ToolCall is waiting for the current Policy/Approval decision. | Existing ToolCall/Approval projection. |
| `ACTIVE_IN_CURRENT_RUN` | Activation succeeded and the provider remains registered to this non-terminal Run. | Current `RunMcpState` plus activation facts. |
| `ACTIVATION_DENIED` | The user denied the activation ToolCall. No process is started. | Existing denied ToolCall/Approval. |
| `ACTIVATION_FAILED` | Executable admission, process start, protocol, discovery, catalog, or config TOCTOU failed. | Existing failed ToolCall and stable error code. |
| `PROCESS_UNAVAILABLE` | The provider is still associated with the Run but its last observed availability is unavailable. | `ToolProviderAvailability::Unavailable` after a detected failure. |
| `CURRENT_RUN_ENDED` | The former owning Run became terminal/cancelled and the provider was dropped. | AgentRun transition; shown only as a transition explanation, not durable connection state. |

The normal app-level projection after Run end is again:

```text
Configured · Not active
```

`ACTIVE_IN_CURRENT_RUN` is not a continuous heartbeat assertion. The UI may
show `Last observed: available` in diagnostics, but must not show `Alive` or
`Connected` without a real health observation.

### 3.3 Tool state

Tool state is also orthogonal:

- `DISCOVERED`: admitted by bounded MCP discovery for this Run;
- `AVAILABLE_TO_RUN`: the owning Run is non-terminal, the provider is admitted,
  and it is not last-observed unavailable;
- `APPROVAL_REQUIRED`: the existing `PolicyEngine` returns `ASK` for this Run's
  permission and the concrete Tool call.

These are not one enum. A Tool can be discovered, available, classified
`DESTRUCTIVE`, and approval-required at the same time. With the current
`FULL_CONTROL` preset, `PolicyEngine` may return `ALLOW`; the UI must still
display the Fielora effect `DESTRUCTIVE` and must not relabel it Safe.

## 4. App scope versus Run scope

### App-level MCP management

Displays only fresh passive facts:

- user-configured connection IDs;
- config validity and diagnostic codes;
- source `Fielora user config`;
- Local STDIO transport;
- current supported protocol requirement;
- credential/remote support unavailable;
- optionally disclosed executable path for a valid definition.

Opening or refreshing this page starts zero processes and performs zero MCP
requests.

### Current AgentRun MCP state

Displays only facts bound to the selected current Run:

- activation state;
- provider ID after successful admission;
- protocol and transport after activation;
- discovered Tool count;
- last-observed provider availability;
- Fielora risk admission;
- activation ToolCall/Approval/failure facts;
- recent MCP ToolCall facts already owned by the Run ledger.

It does not persist or imply a global active state. A different Conversation or
AgentRun has a different MCP runtime view.

## 5. First UI Slice options and decision

| Option | Value | Required delta | Decision |
|---|---|---|---|
| `A. PASSIVE_UI_ONLY` | Honest config visibility and diagnostics; no usable activation action. | App-level read model only. | Safe fallback, but leaves the implemented activation path model-only. |
| `B. PASSIVE_UI_PLUS_RUN_SCOPED_ACTIVATION` | Honest config visibility plus clear user value in the current Run. | App read model, Run read model, and one narrow Harness activation command that reuses ToolCall/Policy/Approval/execution. | **Recommended.** |
| `C. PERSISTENT_CONNECTION_UI_REQUIRES_ARCHITECTURE_CHANGE` | Global Connect/Disconnect and cross-Run provider lifetime. | New lifecycle, durable semantics, shutdown/recovery UX, and broader governance. | `ARCHITECTURE_CHANGE_REQUIRED`; not authorized. |

Recommended First Slice:

```text
B. PASSIVE_UI_PLUS_RUN_SCOPED_ACTIVATION
```

This recommendation is conditional on proving that the human activation
command enters the existing Harness ToolCall path and has one execution owner.
If implementation cannot satisfy that invariant without changing process
lifecycle, the Slice must fall back to Option A rather than spawn directly.

## 6. Connection list UI

Use one compact Settings list, not large cards:

```text
MCP
Local STDIO only · Source: Fielora user config

local-postgres
Configured · Not active
Transport: stdio
Protocol: MCP 2026-07-28 required
Executable admission: not checked until activation
Tools: available after activation
Fielora policy: unknown Tools -> Destructive
[Details]
```

Expanded details may show the valid command path to the human because the
trusted UI is not Model Context or a receipt. The first Slice should show no
raw arguments, environment, headers, token fields, or raw JSON.

An app-level Settings row must not contain a green global Connected indicator.
If a selected current Run is relevant, the page may link to that Run's MCP
detail but must not merge the two state axes.

## 7. Activation UX

The actionable control belongs to the current AgentRun detail:

```text
MCP for this run
local-postgres · Configured · Not active
[Activate for current run]
```

The action path must be:

```text
trusted Renderer request
  -> narrow AgentCoordinator command for existing Run
  -> existing mcp.activate_connection ToolSpec
  -> existing ToolCall proposal
  -> existing PolicyEngine
  -> existing Approval routing when decision = ASK
  -> existing activation executor
  -> existing durable receipt/events
  -> existing Verification boundary
```

The Renderer sends only `run_id` and `connection_id`. It must not send command,
argv, effect, provider ID, executable path, or `_config_digest`. Core binds the
private config digest from the Run snapshot.

The command must not interrupt an in-flight external Tool. It must use the
existing Harness safe-boundary/single-owner execution rule. A queued request is
represented by the ordinary durable ToolCall lifecycle; there is no hidden
AgentRun and no direct Electron/Rust process spawn from the UI path. If the Run
becomes terminal before execution, the activation ToolCall is cancelled and no
process starts.

Implemented rule: Core first creates the ordinary durable activation proposal
through `propose_tool_call`. A running loop receives the existing pause request
and reaches `Paused` only at `CONTEXT_COMPILED`, `MODEL_TURN_COMPLETED`,
`STEP_BOUNDARY`, or `TOOL_RECEIPT_PERSISTED`. The same `run_loop` is then
resumed with that proposed ToolCall and calls the existing `execute_tool` with
`approved_once = false`. `ASK` therefore creates the existing Approval; Allow
once resumes the same path with `approved_once = true`. The Renderer/Main path
never receives an executable or process handle.

There is no active Run:

```text
Start an Agent run to activate this MCP Server.
```

The button is disabled. The UI must not create a hidden Run.

Existing permission semantics remain authoritative. `PROCESS` normally reaches
Approval for Request approval/Review changes; `FULL_CONTROL` may allow it under
the current PolicyEngine. The UI must not introduce a separate mandatory or
remembered permission rule.

MCP-specific Approval copy is required:

```text
Start local MCP Server “local-postgres” for this Run
This starts the configured local process and discovers bounded Tools.
[Deny] [Allow for this Run]
```

After activation, an arbitrary user MCP Tool may produce a second Approval.
The First Slice intentionally accepts this double-approval behavior and adds no
Always allow, Trust server, or remembered permission control.

## 8. Tool inspector

The First Slice should display discovered Tool count and the conservative
Fielora policy, but defer the expanded per-Tool inspector until a bounded
`McpToolView` exists. Re-running MCP discovery whenever the UI opens is not an
acceptable substitute.

Current minimum after activation:

```text
Active for this run
23 Tools discovered
Fielora policy: unknown Tools -> Destructive
```

Future bounded inspector rows may show:

```text
search
Fielora effect: DESTRUCTIVE
Current policy decision: ASK
Server hint: readOnlyHint=true (untrusted metadata)
```

Current MCP annotations are not retained by the adapter. The First Slice must
not invent or display them. If they are retained later, server hints and the
Fielora effect must be separate fields and separate labels; server metadata can
never populate the Fielora policy field.

## 9. Config UX

- Page open and `Refresh config` perform a fresh passive
  `McpConnectionSnapshot::load` for the app-level view.
- Refresh starts no process, restarts no provider, and performs no MCP request.
- Refresh does not mutate an existing Run snapshot. Config added or changed
  after Run start applies to a new Run; current activation continues to use its
  bound snapshot and fails closed on TOCTOU.
- No file watcher is included.
- No Add/Edit/Delete form is included.
- No credential, env, header, token, URL, remote, package, or installer control
  is included.
- No Project MCP config is scanned or displayed. Source is always Fielora user
  config.
- `View mcp.json` and `Open config location` are deferred. The Desktop has
  narrow workspace/library/storage open primitives, but no existing MCP config
  target and no safe generic arbitrary-path opener. The First Slice must not
  add shell execution merely for this button.

## 10. Diagnostics and failure presentation

Bounded diagnostics may contain only:

- connection ID;
- config state and stable diagnostic code;
- transport;
- protocol requirement/negotiated version;
- provider ID after activation;
- discovered Tool count;
- last activation ToolCall state/error code;
- executable admission state: not checked, admitted for this Run, or the
  bounded activation failure;
- last-observed provider availability.

Stable presentation mapping:

| Existing fact/code | UI state/copy |
|---|---|
| `CONFIG_NOT_FOUND` | `NO_CONFIG_FILE` — no user MCP config found. |
| `CONFIG_MALFORMED` | `CONFIG_ERROR` — `mcp.json` could not be parsed within the supported format. |
| `CONFIG_UNSUPPORTED`, `CONNECTION_UNSUPPORTED` | `UNSUPPORTED` — this definition is outside the current Local STDIO subset. |
| `UNAVAILABLE_CREDENTIAL_UNSUPPORTED` | `UNSUPPORTED` — credential/remote MCP support is not enabled. |
| `EXECUTABLE_INVALID` | `CONFIG_ERROR` — command must be an admitted absolute executable path. |
| Approval deny / denied ToolCall | `ACTIVATION_DENIED` — no process was started. |
| `MCP_CONNECTION_CONFIG_CHANGED` | `ACTIVATION_FAILED` — config changed after this Run snapshot; start a new Run. |
| `EXECUTABLE_NOT_FOUND` | `ACTIVATION_FAILED` — configured executable was not found at activation. |
| `PROCESS_START_FAILED` | `ACTIVATION_FAILED` — local MCP process could not start. |
| `MCP_DISCOVERY_FAILED`, `MCP_DISCOVERY_TIMEOUT`, `MCP_CATALOG_INVALID` | `ACTIVATION_FAILED` with the precise bounded reason. |
| last-observed provider unavailable / provider execution failure | `PROCESS_UNAVAILABLE` — the current Run can no longer use the provider. |
| Run terminal/cancel | `CURRENT_RUN_ENDED`, then app-level `Configured · Not active`. |

Do not use a generic Disconnected label. The First Slice has no full log viewer
and must not show raw environment, config, stdout/stderr, unbounded MCP
responses, secrets, executable argv, or receipt JSON.

## 11. Security display

Every connection detail must preserve these visible separations:

```text
Configured != Active for this Run
Active for this Run != Globally connected
Last observed available != continuously alive
Process running != trusted
Tool discovered != Tool permitted
Server hint != Fielora security verdict
Tool success != Verification PASS
```

Executable path is allowed only in the trusted human UI read model. It remains
excluded from Model Context, Agent events intended as Model input, durable Tool
receipts, and diagnostic logs. No credential-bearing field enters the view.

## 12. Minimum contract delta candidate

### 12.1 App-level passive read model

Add a typed UI projection backed by the existing passive parser, not by the raw
backend/config DTO:

```text
McpConnectionCatalogView
  source: USER_APP_CONFIG
  config_state: NO_CONFIG_FILE | READY | CONFIG_ERROR
  connections: McpConnectionView[]
  diagnostics: McpDiagnosticView[]

McpConnectionView
  connection_id
  configuration_state: CONFIGURED | CONFIG_ERROR | UNSUPPORTED
  source: USER_APP_CONFIG
  transport: STDIO
  protocol_requirement: 2026-07-28
  command_path?: trusted-human-display-only
  command_argument_count?: number
  credential_support: UNSUPPORTED
  remote_support: UNSUPPORTED
  diagnostics: bounded stable codes[]
```

Candidate query:

```text
query.mcp.connections
```

It performs one fresh passive load per request. It does not create an AgentRun,
ToolCall, process, or durable record.

### 12.2 Current Run read model

```text
McpConnectionRuntimeView
  run_id
  run_status
  connection_id
  activation_state
  activation_available
  activation_unavailable_reason?
  provider_id?
  transport?
  protocol_version?
  discovered_tool_count?
  provider_availability: UNKNOWN | AVAILABLE_LAST_OBSERVED | UNAVAILABLE
  last_activation_tool_call_id?
  last_error_code?
```

Candidate query:

```text
query.agent.mcp_runtime
```

This is an ephemeral projection from current `RunMcpState` plus existing
ToolCall/AgentRun facts. It creates no database table or durable active flag.

### 12.3 Narrow activation command

```text
ActivateMcpConnectionRequest
  run_id
  connection_id

command.agent.activate_mcp_connection
  -> existing AgentToolCallView / Approval and AgentChanged projections
```

This is not a generic invoke-any-Tool bridge. Core selects the exact built-in
`mcp.activate_connection` ToolSpec and internally binds the Run snapshot
digest. It must reuse `propose_tool_call`, `PolicyEngine`, Approval, the current
Tool executor, receipts, and Verification boundary.

### 12.4 Deferred Tool inspector contract

`McpToolView` is deferred from the First Slice. If added later, it must be a
bounded projection and must separate:

- capability/provider Tool identity;
- description;
- Fielora-authored effect;
- current Policy decision;
- optional server annotations explicitly marked untrusted.

No raw `McpConnectionDefinition`, provider object, command arguments, arbitrary
input schema, or live process handle crosses FIPC.

## 13. Targeted implementation evidence

`tests/e2e/mcp-connection-ui-e2e.mjs` passed against an isolated
`LOCALAPPDATA`, the production Desktop bridge, the production Core sidecar,
and the existing real local MCP fixture. Evidence covered:

1. missing, malformed, and valid config presentation;
2. Settings open/refresh process count `0`;
3. current Run `NOT_ACTIVE` presentation;
4. durable `PROCESS / ASK` activation ToolCall and existing Approval before
   process start;
5. Allow once -> exactly one fixture process, `ACTIVE_IN_CURRENT_RUN`, and one
   runtime-derived discovered Tool;
6. activation receipt through the existing ToolCall path, with no executable
   path/argv in the durable projection and no Verification PASS;
7. cancel -> fixture process exit and UI `NOT_ACTIVE`;
8. deny -> process count `0`;
9. missing executable activation failure -> process count `0` and bounded
   error code.

The focused Rust probe
`ui_requested_mcp_activation_uses_existing_tool_policy_approval_and_run_cleanup`
independently proved the same Policy/Approval/receipt/lifetime boundary.
Existing deterministic MCP tests continue to own discovery failure, config
TOCTOU, catalog validation, and transport-negative coverage. No full Desktop,
packaged, or portable suite was run because no packaged resource or sidecar
resolution boundary changed.

## 14. Packaged impact

`LOW / NO DEFAULT PACKAGED SMOKE` for the recommended contract:

- The Renderer consumes typed FIPC only.
- Config root remains resolved by Rust `PlatformPaths`; production remains
  `%LOCALAPPDATA%\Fielora\config\mcp.json`.
- No packaged resource, dependency, installer, or executable discovery rule is
  added.

Add a targeted packaged MCP UI smoke only if implementation adds a Main-process
config-location action, depends on a development-only root override, or reveals
a dev/packaged sidecar path difference. Option C would require a separate
packaged lifecycle Gate.

## 15. Change impact

| Area | Impact | Reason |
|---|---|---|
| navigation | `LOW` | Add one Settings category; no primary navigation change. |
| read model | `MEDIUM` | New bounded app/run projections cross Core -> Main -> trusted Renderer. |
| activation command | `MEDIUM` | New narrow human ingress into an existing ToolCall path; must prove one execution owner and no direct spawn. |
| approval integration | `MEDIUM` | Existing semantics reused; MCP-specific copy and manual ingress require targeted regression. |
| run lifecycle | `MEDIUM` | Existing run-scoped provider lifetime is unchanged, but the UI must accurately follow terminal/cancel/failure transitions. |
| tool inspector | `LOW / DEFERRED` | First Slice shows count/policy only; detailed DTO is not included. |
| config refresh | `LOW` | Fresh passive read only; no watcher or active Run mutation. |
| packaged path | `LOW` | Core-owned PlatformPaths and existing sidecar boundary remain unchanged. |

Overall First Slice: `MEDIUM`.

Any persistent Connect/Disconnect, cross-Run provider, durable active flag,
credential/env support, project config import, remote MCP, background health
daemon, or automatic activation is `HIGH / ARCHITECTURE_CHANGE_REQUIRED` and
requires separate authorization.

## 16. Open questions

1. Human review should confirm that `AgentTurn` execution detail is sufficiently
   discoverable without creating a new right-dock category.
2. Per-Tool server annotations are currently not retained. Retaining bounded
   untrusted hints for transparency is a later Tools metadata delta, not a
   prerequisite for the First Slice.
3. A continuous `Alive` indicator would require a defined health probe and
   freshness semantics. Until then, use activation state plus last-observed
   availability only.
4. Opening/revealing `mcp.json` remains deferred until a narrow config-location
   Desktop primitive is deliberately authorized.

## 17. Explicit non-scope

- no implementation beyond the authorized First Slice;
- no Model call or MCP process;
- no primary Extensions navigation;
- no persistent Connection Runtime;
- no Marketplace, installer, package manager, or plugin runtime;
- no Skill or Plugin page;
- no form-based MCP editor;
- no credential UI, remote MCP, env, headers, token, or OAuth;
- no logs viewer or raw stdout/stderr;
- no schema or migration;
- no new permission, receipt, verification, or Agent runtime;
- no modification to Frozen/Baseline architecture documents.
