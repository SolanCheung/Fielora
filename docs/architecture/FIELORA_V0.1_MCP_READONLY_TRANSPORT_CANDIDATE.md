# Fielora V0.1 MCP Read-only Transport Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `FIRST REAL MCP READ-ONLY TRANSPORT SLICE: IMPLEMENTED / VALIDATED / PASS`

**Track:** subordinate to `RAPID_DESKTOP_EXECUTION_V0.1.md` and the existing
Extension Delta Candidate

**Change type:** architecture audit, bounded implementation evidence, dependency
decision, and bounded Change Impact

**Audit date:** 2026-08-25

This Candidate answers one question:

> How can one real MCP Server safely enter the existing `ToolProvider` seam?

This Candidate did not authorize implementation by itself. The user separately
authorized the fixture-only Slice on 2026-08-25; section 19 records its factual
result. That authorization does not extend to configuration import, credential
work, UI, installer, migration, Marketplace, arbitrary community servers,
remote MCP, or Plugin Runtime. This document does not amend any Frozen or
Baseline document and does not change the status of
`FIELORA_V0.1_EXTENSION_DELTA_CANDIDATE.md`.

Repository facts, rather than the pre-probe snapshot in that earlier Candidate,
are authoritative for this audit. The deterministic External Tool Provider
Pipeline Probe has established this path:

```text
External Tool Provider
  -> existing Tool catalog / selection
  -> ModelToolDefinition
  -> AgentToolCall
  -> existing PolicyEngine / Approval
  -> existing ToolExecutor
  -> provider backend
  -> existing durable ToolCall receipt / event
  -> existing Verification boundary
```

MCP may add only the following Tools-side front end:

```text
MCP Server
  -> transport
  -> MCP protocol client
  -> MCP adapter
  -> existing ToolProvider
  -> existing pipeline above
```

`Model + Harness + Tools` remains the only top-level Agent architecture. MCP is
not an Agent, Harness, permission authority, durable execution lifecycle,
receipt system, Verification system, or semantic authority.

Primary repository source of truth for this Candidate:

- `docs/architecture/FIELORA_V0.1_AGENT_ARCHITECTURE_SPEC.md`;
- `docs/architecture/CORE_CONTRACTS_V0.1.md`;
- `docs/architecture/FIELORA_V0.1_EXTENSION_DELTA_CANDIDATE.md`;
- `crates/fielora-agent/src/lib.rs`;
- `crates/fielora-core/src/agent_runtime.rs`;
- `crates/fielora-contracts/src/lib.rs`;
- `crates/fielora-storage/src/lib.rs`;
- `crates/fielora-platform/src/lib.rs`;
- `crates/fielora-core/src/main.rs`;
- `apps/desktop/src/fipc.ts` and `apps/desktop/src/supervisor.ts`;
- current Cargo manifests and `Cargo.lock`.

Protocol/dependency research uses the current MCP `2026-07-28` release, the
[official transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports),
the [official MCP release note](https://blog.modelcontextprotocol.io/posts/2026-07-28/),
the [official Rust SDK](https://github.com/modelcontextprotocol/rust-sdk), and
the SDK's
[v3.1.4 dependency manifest](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.1.4/crates/rmcp/Cargo.toml)
and
[conformance roadmap](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.1.4/ROADMAP.md).

---

# 1. CURRENT_MCP_READINESS

This section preserves the pre-implementation readiness audit used to scope the
authorized Slice. Section 19 is the current post-implementation reality and
supersedes this snapshot where the two differ.

Status meanings:

- `EXISTS`: the needed semantic primitive is implemented now and can remain its
  current owner, although an adapter may still call it.
- `PARTIAL`: a relevant implementation exists, but it is private, coupled to a
  different protocol, one-shot, or missing an MCP safety property.
- `ABSENT`: no current implementation satisfies the function.

| Readiness item | Status | Current module / file | Existing semantic owner | Gap for real MCP |
|---|---|---|---|---|
| Generic child-process launch | `PARTIAL` | `crates/fielora-agent/src/lib.rs`: private `ToolRuntime::run_command_internal`; `apps/desktop/src/supervisor.ts`: Core-only `spawn` | Tools for command execution; Platform should own reusable OS process mechanics | Rust launch is synchronous, one-shot, project-command-specific, and private. Electron supervision is tied to the Core sidecar and inherits a different trust/config model. Neither is a reusable MCP child primitive. |
| stdin/stdout pipe support | `PARTIAL` | Rust command executor pipes stdout/stderr but sets stdin to `Stdio::null()`; Electron FIPC pipes all three streams | Platform mechanics below a Tools backend | MCP stdio requires a writable child stdin plus continuously read stdout. No current Rust primitive exposes the required duplex handles. |
| Async line/message I/O | `PARTIAL` | `apps/desktop/src/fipc.ts`; `crates/fielora-core/src/main.rs`; Tokio exists in the workspace | FIPC belongs to Core/Desktop transport; future MCP codec belongs to Tools | FIPC proves NDJSON mechanics but is a different protocol and process relationship. The Rust Tool path uses blocking readers and has no async MCP stream. |
| Process cancellation | `PARTIAL` | `CommandCancellation`; `ToolRuntime::run_command_internal`; `ExecutionCancellation` in Core | Harness propagates cancellation; Tools/Platform enforce it | Current cancellation terminates a one-shot command. It does not correlate an MCP request, send `notifications/cancelled`, or retire a provider session safely. |
| Process timeout | `PARTIAL` | `run_command_internal` clamps 1,000-900,000 ms; FIPC requests have deadlines | Harness supplies call bounds; Tools enforces provider request bounds | No separate startup, discovery, request, cancellation-grace, or shutdown timeout exists for a provider-lived process. |
| Windows process-tree termination | `EXISTS` | `crates/fielora-agent/src/lib.rs`: private `ProcessJob` with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and `TerminateJobObject` | Platform-specific process containment | The behavior and regression are real on Windows, but the primitive is private to the one-shot Tool executor and must be exposed through a narrow Platform API before MCP can rely on it. |
| Crash detection | `PARTIAL` | `run_command_internal::try_wait`; `CoreProcessSupervisor` exit handling | Tools for provider failure; Platform for exit observation | Current code detects its own one-shot/Core process exits. No MCP provider worker maps EOF/exit while a request is in flight to existing ToolCall outcome semantics. |
| Restart primitives | `PARTIAL` | `apps/desktop/src/supervisor.ts` has bounded Core restart/backoff | Core sidecar supervision only | The restart policy is not generic and must not be reused as an MCP runtime. No Tools-side rule prevents replay of an uncertain MCP call. |
| Bounded stdout/stderr collection | `PARTIAL` | `MAX_COMMAND_OUTPUT_BYTES = 1 MiB`; `read_bounded`; FIPC frame bounds | Tools owns result bounds; Platform may supply bounded stream capture | The current bound applies after a one-shot process closes. MCP needs a per-message stdout bound and a continuous bounded/redacted stderr ring; it must never accumulate a provider lifetime of output. |
| JSON | `EXISTS` | workspace `serde_json`; typed serde contracts throughout Rust | Shared serialization primitive | No new JSON package is needed. MCP-specific depth, size, and shape admission is still required. |
| JSON-RPC 2.0 | `PARTIAL` | FIPC client/server envelopes in `fipc.ts` and `fielora-core/src/main.rs` | Existing FIPC transport only | Envelope mechanics exist, but FIPC method negotiation, frame sizes, errors, and lifecycle are not MCP. Copying FIPC types across domains would couple two protocols. |
| Request/response correlation | `PARTIAL` | `FipcClient.pending`; Core FIPC request IDs | Existing FIPC transport only | No Rust MCP client correlates request IDs across a provider stdio stream or rejects duplicate, unknown, or mismatched response IDs. |
| Notification handling | `PARTIAL` | FIPC notification dispatch; Agent event transport | Existing FIPC and Harness event paths | There is no MCP notification classifier. The first Slice needs only outgoing cancellation and must reject/ignore other messages according to a pinned protocol policy. |
| MCP protocol-version negotiation | `ABSENT` | No MCP code or dependency in the repository | Future Tools-side MCP client | Current MCP `2026-07-28` removed `initialize/initialized`. The first Slice must pin that version, probe with `server/discover`, and reject fallback rather than silently speaking an older era. |
| `ToolProvider` discovery compatibility | `EXISTS` | `ToolProvider::discover_tools`; `ProviderToolDefinition`; `coding_tool_catalog_with_providers` | Tools provides definitions; Harness controls exposure/selection | The seam already accepts bounded provider definitions and forces external tools to `OBSERVE`. An MCP adapter must translate/admit untrusted `tools/list` output; the seam itself need not be replaced. |
| Provider health representation | `PARTIAL` | `ToolProviderAvailability::{Available, Unavailable}` | Tools | The binary contract is sufficient for selection, but it has no dormant/starting/crashed reason, timestamp, or diagnostics. First Slice may keep detailed state ephemeral inside the adapter and expose only the existing binary state. |
| Provider identity | `EXISTS` | `ToolProviderIdentity { id, version }`; duplicate provider IDs fail closed | Tools | A stable Fielora-authored MCP provider-instance identity and config fingerprint rule are missing. Server-reported identity cannot fill this role. |
| Provider cancellation | `EXISTS` | `ToolProvider::execute` receives `CommandCancellation`; `RoutedToolExecutor` checks cancellation | Harness cancellation -> Tools provider | The propagation seam is established. The MCP adapter still needs to map it to a correlated protocol cancellation and guaranteed process cleanup. |
| Provider classified errors | `PARTIAL` | `ToolProviderError::{Unavailable, InvalidDefinition, InvalidArguments, Failed, Cancelled}` and existing `AgentError` mappings | Tools reports facts; Harness records terminal status | Broad categories work for the deterministic seam, but cannot distinguish response-before/after-write uncertainty, protocol invalidity, timeout, oversized response, or child exit. `UNKNOWN` cannot currently be returned by a provider execution. |
| Config loading primitives | `PARTIAL` | `PlatformPaths::config_dir`; model/provider settings and theme config have domain-specific loaders | Platform locates config; each domain admits its config | There is no generic extension/MCP config parser, schema, import, precedence, or enable/disable contract. Reusing model-provider config would create a semantic conflict. |
| Path containment | `PARTIAL` | `normalize_relative`, `resolve_existing`, `resolve_for_write`, sensitive-path denial in `fielora-agent` | Current project Tool backend | Project Tool paths are strongly contained, but an MCP executable/cwd config is not a model Tool argument and has no admitted path rule. Existing helpers are private to another backend. |
| Command admission | `PARTIAL` | `run_command_internal` validates program/argv/cwd and denies generic Git mutation/dangerous commands without authorization | Current command Tool backend | MCP server activation must not use model-selected `run_command`, shell parsing, PATH search, `npx`, or package-manager downloads. There is no trusted exact-executable MCP admission path. |
| Environment handling | `PARTIAL` | Rust `sanitized_command` uses `env_clear` plus a reviewed OS allowlist; Electron Core supervisor uses its full `environment()` | Tools/Platform process boundary | The safer Rust behavior is private and still includes more user/machine variables than the fixture needs. The Electron inherited environment is explicitly unsuitable for MCP. |
| Secret redaction | `PARTIAL` | `redact_output` and secret-pattern checks in `fielora-agent` | Tools diagnostics/evidence boundary | Current redaction is line-oriented and one-shot. MCP needs bounded/redacted continuous stderr, and raw stdout protocol frames must never be logged as diagnostics. |
| Non-model `CredentialStore` readiness | `PARTIAL` | `fielora-platform::{CredentialStore, SecretBytes, WindowsCredentialStore}` | Platform credential mechanics; Governance controls use | Secure bytes and zeroization are generic, but integration identity, authorization, config references, injection, rotation, and UI are model-provider-specific or absent. It is deliberately unused by the first Slice. |
| Remote HTTP/network primitives | `PARTIAL` | `fielora-model` has Tokio/Reqwest, rustls, timeouts, and model endpoint policy | Model backend only; future MCP network policy belongs to Tools/Platform | No MCP URL admission, redirect/SSRF/DNS policy, authentication, credential binding, reconnect, or remote trust boundary exists. Model endpoint semantics must not be reused by name alone. |
| Dependency policy | `PARTIAL` | locked `Cargo.lock`, pinned workspace dependencies/toolchains, `DEVELOPMENT_WORKFLOW_V0.1.md` Change Impact discipline | Repository engineering governance | There is no repository-wide license/advisory/transitive-footprint admission template for a new protocol SDK. A future authorized dependency change must record feature set, license, MSRV, tree, advisories, and rollback. |
| Existing MCP crate/package dependency | `ABSENT` | no `rmcp`, MCP, or Rust JSON-RPC crate in current manifests/lockfile | Future Tools adapter | Adding any MCP SDK is a new dependency and lockfile change. This Candidate does neither. |

## 1.1 Readiness conclusion

The `ToolProvider` seam is sufficient. The missing work is entirely before that
seam: a bounded protocol client, an MCP admission adapter, and a reusable
duplex managed-child primitive. Local stdio therefore requires a real
high-impact process boundary, but not a second Agent Runtime or a large rewrite
of Agent orchestration.

The current synchronous `ToolProvider`/`ToolExecutor` interface does not require
an async contract migration for the first Slice. A provider-scoped Tools worker
may own the async SDK client and communicate with the synchronous seam through
one bounded, single-flight channel. That worker is ephemeral backend mechanics:
it owns no AgentRun, Policy, receipt, or Verification state.

---

# 2. FIRST_TRANSPORT_DECISION

## 2.1 Option A - local stdio

| Concern | Candidate boundary |
|---|---|
| Process ownership | MCP adapter owns semantic activation; a Platform managed-child primitive owns OS handles and Windows Job Object cleanup. |
| Executable admission | Exact absolute path to the repo-built fixture only. No shell, PATH resolution, `cmd`, `npx`, download, package manager, or model-controlled command. |
| cwd / args | Fixed test-owned isolated directory and fixed argv. No arbitrary production config. |
| Environment | `env_clear`; minimal explicit Windows/process variables and isolated temp paths only. No secrets and no full inherited environment. |
| Framing | UTF-8 JSON-RPC, one JSON message per newline, no embedded newline, with a hard pre-allocation frame limit. |
| stderr | Separate bounded/redacted diagnostic ring. It is never protocol input and never becomes an unbounded receipt. |
| Cancellation | Correlate the in-flight request; send best-effort MCP cancellation; then terminate the managed process tree so cancellation cannot leave fixture work running. |
| Process death | EOF/exit is classified relative to whether the request was fully written. No transparent replay of an uncertain call. |
| Restart | Never replay the in-flight ToolCall. At most one lazy restart is allowed for a later independent operation in the first Slice. |
| Supply chain | Still `HIGH`: a local server is native code with the user's OS authority. The first Slice is limited to a repo-built deterministic fixture and proves no safety claim for arbitrary local servers. |

## 2.2 Option B - remote MCP transport

Remote MCP avoids a local child but introduces additional semantic boundaries
which do not currently exist:

- network permission and endpoint enablement;
- URL/scheme/host/port admission, redirects, DNS rebinding, private-address and
  SSRF rules;
- TLS and certificate behavior;
- authentication discovery and credential injection;
- issuer/resource binding, secret redaction, and token lifecycle;
- connect/request/stream/reconnect timeouts;
- remote server trust and availability diagnostics;
- uncertain network delivery and reconnect/replay behavior.

The existing model `reqwest` client does not make those MCP policies exist.
Remote transport would require Credential and network Change Impacts before a
single real call and is therefore larger than local fixture stdio.

```text
FIRST_TRANSPORT: LOCAL_STDIO
```

This decision is only for the first real protocol proof. It does not authorize
arbitrary local MCP configuration and does not imply that local stdio is lower
risk than remote MCP in the general product.

---

# 3. MCP_CLIENT_OWNERSHIP

```text
Tools
└─ MCP adapter / backend
   ├─ MCP protocol client
   ├─ discovery and definition translation
   ├─ provider-scoped ephemeral worker
   └─ Platform managed-child handle
```

Recommended initial module ownership:

- `fielora-agent`, which currently contains `ToolProvider`,
  `RoutedToolExecutor`, and concrete Tool backends, owns the MCP adapter and
  protocol-client integration. The crate name does not move MCP into Harness;
  the semantic types and comments already establish these as Tools-side code.
- `fielora-platform` owns only reusable OS mechanics: exact executable launch,
  piped handles, wait/exit, bounded termination, and Windows Job Object tree
  cleanup. It knows nothing about MCP, tools, Agents, Policy, or receipts.
- `fielora-core::AgentCoordinator` continues only to hold admitted
  `Arc<dyn ToolProvider>`, build the existing catalog, select tools, invoke
  `PolicyEngine`, create/update the existing ToolCall, and interpret the
  existing Tool result.

Flow ownership:

1. Existing catalog construction calls `ToolProvider::discover_tools`.
2. The MCP adapter lazily starts its provider process, performs the pinned
   protocol probe, calls `tools/list`, and admits the untrusted definitions.
3. It returns ordinary `ProviderToolDefinition` values. Existing
   `coding_tool_catalog_with_providers` remains the authoritative final catalog
   admission and forces `OBSERVE`.
4. A selected tool follows the existing Policy/ToolCall path.
5. `RoutedToolExecutor` calls `ToolProvider::execute` with the exact native tool
   name and existing `CommandCancellation`.
6. The adapter sends `tools/call`, maps the bounded result to the existing
   `ToolExecution`, and maps protocol/process failures to the existing
   ToolCall terminal path.

No MCP-specific branch is permitted in model invocation, prompt strategy,
Agent loop, Approval, storage, completion, or Verification.

---

# 4. DEPENDENCY_DECISION

## 4.1 Current official Rust SDK assessment

As of the audit date, the official SDK is `rmcp 3.1.4`:

- official Model Context Protocol repository;
- Apache-2.0 license;
- Rust 2024, MSRV 1.88; Fielora pins Rust 1.97.1;
- Tokio 1, serde/serde_json, thiserror, tracing, futures, tokio-util, indexmap,
  chrono, and feature-specific dependencies;
- client and transports are feature-gated;
- current roadmap reports 100% date-versioned client/server conformance for
  both `2025-11-25` and `2026-07-28`;
- active releases and maintenance policy;
- stdio, async read/write, and remote transports exist;
- protocol types include discovery, tools, cancellation, schema, and current
  protocol versions.

At the time of the design audit the repository had no MCP dependency. The
separately authorized first Slice completed the manifest/lockfile change and
dependency-tree/advisory review recorded in section 19.

## 4.2 SDK versus minimal internal client

| Criterion | Official SDK | Minimal internal client |
|---|---|---|
| Protocol coverage | Current lifecycle, correlation, cancellation, tool/schema types, and version rules already covered | First Slice can be small, but Fielora would own every wire/version edge immediately |
| Maintenance | Active upstream and conformance suite | Permanent local protocol maintenance burden |
| License | Apache-2.0, compatible for review | No external license, but internal maintenance cost |
| Dependency surface | Non-trivial but strongly feature-gated | No MCP crate; still needs Tokio process/I/O features and local protocol code |
| Async compatibility | Tokio 1 is compatible with current workspace pin | Must design and test all async behavior locally |
| stdio | SDK provides it | Must implement framing/process coupling |
| Remote later | Available behind separate features | Would require a second client implementation later |
| Cancellation/correlation | Implemented by the protocol service | Must be implemented and kept spec-compatible |
| Schema representation | Current MCP models included | Must duplicate/adapt schema types |
| Supply-chain | Adds reviewed upstream code and transitive dependencies | Smaller external tree but larger security-critical local code |

The SDK's stock child-process transport is **not** accepted as Fielora's
process boundary for this Slice. Its defaults do not establish Fielora's exact
command admission, minimal environment, Windows Job Object invariant, stderr
policy, or hard message-size limit. Fielora must supply a custom bounded SDK
transport over the Platform-managed child.

Implemented feature selection:

```text
rmcp
  default-features = false
  version = =3.1.4
  features = [client, transport-async-rw]
```

Do not enable SDK default server/macros/base64 features or child-process,
HTTP, auth, OAuth, schema generation, or remote transport features unless a
later implementation proves each is necessary. The deterministic server
fixture should be an independent test process with a spec-fixed wire script,
not a production server SDK dependency.

```text
RECOMMEND: SDK
```

The recommendation means **SDK protocol service/models behind a Fielora-owned
bounded transport**, not SDK ownership of command, environment, process tree,
Policy, receipt, or Verification.

---

# 5. PROTOCOL_BOUNDARY

The current MCP `2026-07-28` release removed the legacy
`initialize/initialized` handshake. Every request carries protocol/client
metadata; `server/discover` is the current discovery probe. Therefore the
first Slice must not implement the attachment's provisional four-message
legacy list literally.

```text
PINNED_PROTOCOL_VERSION: 2026-07-28
LEGACY_FALLBACK: DISABLED

server/discover
  -> verify exact supported version and tools capability
tools/list
  -> bounded pagination and admission
tools/call
  -> one ordinary, non-task OBSERVE call
notifications/cancelled
  -> outgoing only when the in-flight stdio request is cancelled
```

Required mechanics:

- JSON-RPC `2.0` validation;
- unique bounded request IDs and exact response correlation;
- UTF-8 newline-delimited stdio frames;
- hard frame and cumulative discovery/result bounds;
- explicit protocol error versus `tools/call` application error;
- startup/discovery/call/cancellation/shutdown timeouts;
- EOF/process-exit classification;
- cancellation with no successful result accepted afterward.

First Slice exclusions:

- `initialize`, `notifications/initialized`, and fallback to any 2025-era
  protocol;
- resources, prompts, sampling, roots, elicitation, logging, completions, and
  resource subscriptions;
- Tasks or any `execution.taskSupport != forbidden` behavior;
- server-to-client requests and Multi Round-Trip Requests;
- `subscriptions/listen`, list-changed subscriptions, progress/logging UI, and
  unsolicited notifications not required by the flow;
- remote HTTP, legacy HTTP+SSE, auth, OAuth, credentials, and network;
- content types other than bounded text and bounded JSON needed by the one
  fixture tool.

If the server advertises only a different protocol version, requires a
non-supported extension, requires task execution, or sends a server-to-client
request, the adapter fails closed. Compatibility expansion is a later
Candidate, not an automatic fallback.

---

# 6. DISCOVERY_ADMISSION

`tools/list` is `UNTRUSTED PROVIDER METADATA`. The server can describe a tool;
it cannot create a Fielora semantic identity, effect, trust level, permission,
or Verification authority.

Existing admission already provides:

- at most 16 external providers;
- at most 32 tools per provider;
- provider/capability/native-name bounds and character checks;
- provider version length bound;
- description at most 4,096 bytes;
- input schema at most 64 KiB and top-level `type: object`;
- provider ID and semantic tool-name collision rejection;
- forced Fielora `AgentToolEffect::Observe`;
- provider receipt and observation bounds of 64 KiB each.

MCP-specific admission Delta required before returning
`ProviderToolDefinition`:

| Input | First-Slice rule |
|---|---|
| stdout frame | Maximum 256 KiB before allocation growth; over-limit terminates the provider as protocol invalid. |
| discovery total | Maximum 512 KiB over at most 4 pages and 32 admitted tools. |
| cursor | UTF-8, at most 1 KiB; repeated cursor or a fifth page fails closed. |
| JSON depth | Maximum general nesting depth 32. |
| schema depth | Maximum 16, maximum 128 properties, and bounded arrays/enums/strings. |
| schema subset | First Slice accepts object/properties/required/additionalProperties and primitive string/number/integer/boolean/array constraints needed by the fixture. |
| unsupported schema | Reject external `$ref`, `$dynamicRef`, recursive references, remote dereference, `oneOf`/`anyOf`/`allOf`/`not`, conditionals, unevaluated/dependent/pattern properties, or other constructs not deliberately admitted. |
| duplicate native name | Reject the provider discovery result. Tool names are case-sensitive before Fielora ID mapping. |
| malformed UTF-8/JSON | Provider discovery fails; no definition reaches the catalog. |
| title/icons/annotations/instructions | Ignore for semantic admission in the first Slice; never expose them as trust or effect. |
| effect/safety/read-only hints | Ignore. Fielora assigns `OBSERVE` regardless of server annotation. |
| output/task schema | Task-required tools are rejected. Output schema and unsupported content types are not admitted for the fixture. |
| call arguments | Must be a JSON object, at most 64 KiB, and validate against the admitted first-Slice schema subset before `tools/call`. |
| call result | Accept only bounded fixture text/JSON; map to the existing 64 KiB observation/receipt bounds. Never preserve arbitrary unbounded server metadata. |

Any one invalid tool invalidates that provider's discovery result in the first
Slice. Partial admission would make catalog identity depend on list ordering
and is deferred.

---

# 7. IDENTITY_DECISION

The first Slice distinguishes four identities:

| Identity | Authority | First-Slice rule |
|---|---|---|
| Semantic capability ID | Fielora | `provider_id + normalized native tool segment`, within the existing lowercase capability grammar |
| Provider ID | Fielora | Stable provider-instance ID derived from explicit fixture config identity plus a non-secret config/executable fingerprint |
| Provider-native tool name | MCP Server, then admitted verbatim | Exact case-sensitive `tools/list.name`; retained only for routing/provenance |
| Provider instance/config identity | Fielora test config | Canonical digest of transport, exact executable digest/path identity, fixed argv, cwd identity, non-secret environment key set, and adapter contract version |

Example only:

```text
config key:                fixture-readonly
provider id:               mcp.local.fixture-readonly.8c14e72a3f09
provider-native tool name: observe_echo
semantic capability id:    mcp.local.fixture-readonly.8c14e72a3f09.observe_echo
```

Native-name normalization preserves `[a-z0-9._-]`. If lowercasing or
normalization changes the name, a short digest suffix is mandatory. Any
post-normalization collision fails closed; it is never resolved by list order.

Two servers exposing `search` have different Fielora provider IDs and therefore
different semantic capability IDs. A restart with the same admitted config and
fixture executable digest retains the same provider ID. A material config or
executable change produces a new provider ID in the first Slice. This favors
accurate provenance over a premature global stable Marketplace identity.

MCP server-reported implementation name/version is untrusted diagnostic
metadata. It cannot replace the Fielora provider ID, change routing, or change
the receipt source.

`capability_version` is a deterministic digest version of:

```text
adapter contract version
+ pinned protocol version
+ exact provider-native tool name
+ admitted canonical input schema
```

It does not use a server's self-reported version as authority.

---

# 8. PROCESS_LIFECYCLE

## 8.1 Ownership

| Question | Decision |
|---|---|
| Who starts the process? | The Tools-side MCP adapter, lazily on first `discover_tools`, through a Platform managed-child primitive. |
| Who owns the handle? | The provider-scoped MCP worker owns the Platform handle for the provider object's lifetime. |
| Who kills it? | The worker requests normal stdin close; Platform performs bounded wait and Windows process-tree termination/reap. Drop is a final fail-safe, not the normal path. |
| When does it start? | First admitted discovery only; constructing `AgentCoordinator` does not launch it. |
| When does it stop? | Provider drop/Core shutdown, fatal protocol error, cancellation requiring hard stop, or unrecoverable child exit. |
| Can it restart? | At most once, lazily, for a later independent operation. Never replay the ToolCall that observed an uncertain exit/timeout. |
| Fielora exit? | Close stdin, bounded wait, terminate the Job Object tree, wait/reap, then exit. No orphan is acceptable. |
| Agent cancellation? | Send a correlated best-effort cancellation, stop accepting a result, terminate the provider process tree within a short bound, and record the existing ToolCall as `CANCELLED`. |

## 8.2 Per-call versus provider-lived

| Model | Benefits | Costs |
|---|---|---|
| Per-call process | Simple state isolation; every call starts clean | Repeats process startup/discovery, greatly increases latency, creates more supply-chain execution events, and makes discovery/execution definition drift likely |
| Provider-lived process | One discovery identity for multiple calls; lower latency; natural stdio connection ownership | Requires explicit cleanup, crash state, single-flight serialization, and bounded restart |

```text
FIRST_SLICE_PROCESS_MODEL: PROVIDER_LIVED / SINGLE_FLIGHT
```

The provider object caches the admitted definitions for its process generation.
The first Slice permits only one in-flight MCP request per provider even though
the SDK can correlate more. This reduces cancellation and crash ambiguity.

There is no MCP-specific durable process state. Process generation, restart
count, and last crash reason are ephemeral diagnostics. Existing AgentRun and
ToolCall state remain the only durable execution lifecycle.

---

# 9. CONFIG_BOUNDARY

```text
FIRST_SLICE_CONFIG_SOURCE: TEST_FIXTURE_CONFIG
```

The integration test constructs one typed config in memory. It points to one
repo-built deterministic fixture executable and one test-owned cwd. It is not
read from user profile, Project files, environment variables, Extension
manifests, or the database.

Rejected for the first Slice:

- user-wide MCP config import;
- production hard-coded provider;
- UI-created config;
- installer/package-manager activation;
- migration or persisted enable/disable state;
- model-controlled command/cwd/args;
- reuse of model-provider configuration records.

Future config will need at least the following concepts, but this Candidate
does not Freeze their manifest, persistence, or UI:

```text
config key / provider alias
transport
exact command or executable reference
argv
cwd policy
explicit environment references
enabled
trust/source metadata
non-secret config fingerprint
```

The executable config is infrastructure activation, not a ToolCall. Arbitrary
local activation will need a separate supply-chain/install/trust Change Impact;
ordinary per-tool execution still goes through existing Policy.

---

# 10. SECRET_BOUNDARY

```text
FIRST_SLICE_CREDENTIALS: NONE
FIRST_SLICE_NETWORK: NONE
FULL_ENVIRONMENT_INHERITANCE: FORBIDDEN
```

The future Platform launch must begin with `env_clear`. For the deterministic
fixture it should add only reviewed Windows essentials, isolated `TEMP`/`TMP`,
and fixed non-secret behavior flags such as `NO_COLOR` and
`GIT_TERMINAL_PROMPT=0`. It should use an exact executable path and therefore
should not require user PATH/PATHEXT, USERPROFILE, provider tokens, auth
headers, API keys, or arbitrary environment values.

Fixture scenarios should be selected by fixed argv, not secret-like environment
variables. Raw environment, command config, protocol frames, and stderr are not
stored in receipts. Bounded stderr is redacted before diagnostics; protocol
stdout is parsed, not logged.

`CredentialStore` integration is deferred to an independent `HIGH`-impact
Slice. The existence of `WindowsCredentialStore` does not authorize secret
injection into a child process.

---

# 11. RECEIPT_AND_PROVENANCE_DELTA

The existing ToolCall and `execution_source` receipt envelope remain the only
execution record. Real MCP needs the following additive source mapping:

```json
{
  "execution_source": {
    "capability_id": "mcp.local.fixture-readonly.8c14e72a3f09.observe_echo",
    "capability_version": "mcp-2026-07-28.4f13b75ac1e82d9a",
    "source_kind": "MCP",
    "provider_id": "mcp.local.fixture-readonly.8c14e72a3f09",
    "provider_tool_name": "observe_echo",
    "transport": "STDIO",
    "protocol_version": "2026-07-28"
  }
}
```

Minimal contract Delta:

1. add `MCP` to internal `ToolSourceKind`;
2. add trusted optional `transport` and `protocol_version` fields to
   `ToolExecutionSource`/its receipt envelope;
3. preserve the same source envelope for completed, failed, cancelled, and
   unknown terminal receipts;
4. add a provider-error disposition that can return the existing ToolCall
   `UNKNOWN` status when request delivery/result is uncertain.

`transport` and `protocol_version` are necessary because they prove that the
first Slice crossed a real MCP transport and pinned protocol rather than the
direct fixture `ToolProvider`. Both are observed/chosen by Fielora.

Server implementation/name/version is not necessary for authoritative
provenance in the first Slice and remains bounded ephemeral diagnostics. Do not
store command secrets, environment, raw config, authorization, unbounded MCP
content, arbitrary `_meta`, server instructions, or self-reported safety hints.

No schema migration is required: the source envelope remains bounded JSON in
the existing receipt/event storage.

---

# 12. FAILURE_MAPPING

Discovery failures occur before a model-visible tool can be selected and
therefore do not invent a ToolCall. They mark the provider unavailable or its
definitions invalid through the existing catalog path. Failures after an
existing admitted tool is selected use the current ToolCall lifecycle.

The current provider error enum needs one minimal source-neutral extension:

```text
Provider failure disposition
  FAILED
  CANCELLED
  UNKNOWN_OUTCOME

+ bounded provider failure code
```

This can extend `ToolProviderError`; it must not create an MCP durable status
model. Provider messages remain bounded/redacted. The stable code, not raw
stderr or an SDK error string, enters `error_code`/terminal receipt.

| Failure | Point | Existing ToolCall mapping | Bounded code |
|---|---|---|---|
| Process failed to start | discovery: no ToolCall; execution restart before request write: ToolCall exists | provider unavailable / `FAILED` | `AGENT_TOOL_PROVIDER_UNAVAILABLE` |
| `server/discover` timeout | discovery | no ToolCall; provider unavailable | `AGENT_TOOL_PROVIDER_DISCOVERY_TIMEOUT` |
| Invalid `server/discover` response | discovery | no ToolCall; provider definition invalid | `AGENT_TOOL_PROVIDER_PROTOCOL_INVALID` |
| Legacy/invalid initialize response | not a valid first-Slice message | no ToolCall; protocol invalid; test also proves Fielora never sends `initialize` | `AGENT_TOOL_PROVIDER_PROTOCOL_INVALID` |
| `tools/list` malformed | discovery | no ToolCall; provider definition invalid | `AGENT_TOOL_PROVIDER_DEFINITION_INVALID` |
| `tools/list` oversized/deep/excess pages | discovery | no ToolCall; provider definition invalid and process retired | `AGENT_TOOL_PROVIDER_DEFINITION_INVALID` |
| Tool not found/stale native name with matching response | execution | `FAILED` | `AGENT_TOOL_PROVIDER_FAILED` |
| `tools/call` JSON-RPC protocol error with matching ID | execution | `FAILED` | `AGENT_TOOL_PROVIDER_FAILED` |
| `tools/call` application result `isError=true` | execution | `FAILED` | `AGENT_TOOL_PROVIDER_FAILED` |
| Arguments fail admitted schema before write | execution | `FAILED` | `AGENT_TOOL_ARGUMENTS_INVALID` |
| Timeout before request is fully written | execution | `FAILED` | `AGENT_TOOL_PROVIDER_TIMEOUT` |
| Timeout after request is fully written and before valid result | execution | `UNKNOWN` | `AGENT_TOOL_PROVIDER_OUTCOME_UNKNOWN` |
| Server exits/EOF before request write | execution | `FAILED` | `AGENT_TOOL_PROVIDER_UNAVAILABLE` |
| Server exits/EOF during call after write | execution | `UNKNOWN` | `AGENT_TOOL_PROVIDER_OUTCOME_UNKNOWN` |
| Agent cancellation | execution | `CANCELLED`; result ignored; process tree terminated | `AGENT_CANCELLED` |
| Invalid/duplicate/unknown response ID during call | execution | `UNKNOWN` after request write; retire process | `AGENT_TOOL_PROVIDER_OUTCOME_UNKNOWN` |
| Invalid JSON/UTF-8 during call | execution | `UNKNOWN` after request write; retire process | `AGENT_TOOL_PROVIDER_OUTCOME_UNKNOWN` |
| Oversized call response | execution | `UNKNOWN` after request write; retire process | `AGENT_TOOL_PROVIDER_OUTCOME_UNKNOWN` |

`UNKNOWN` is conservative even for the first `OBSERVE` tool: Fielora does not
claim a valid result that it did not receive. Existing continuity rules may
later decide a fresh observe call is retry-safe; the adapter never transparently
replays the uncertain request itself.

---

# 13. VERIFICATION_BOUNDARY

```text
MCP tools/call protocol success
  = provider call completed with an admitted bounded result

MCP tools/call protocol success
  != Verification PASS
  != Goal completion
  != AgentRun completion authority
  != Reality/Semantic Authority
```

The MCP adapter returns `ToolExecution`; it has no API to create a
`VerificationReceiptView`. Existing Harness.Verification remains the only
owner of verification admission, evidence freshness, workspace revision, and
completion interpretation.

The first Slice must automatically prove:

- no MCP-specific verification record/type/table is created;
- successful fixture `tools/call` creates only the existing ToolCall terminal
  receipt/event;
- no Verification PASS appears solely because the MCP result says success;
- the server's annotations, result, or `_meta` cannot set `verification_eligible`,
  complete a Goal, or bypass current completion authority.

---

# 14. FIRST_REAL_MCP_SLICE

```text
one repo-built deterministic local MCP fixture server
+ local stdio
+ MCP 2026-07-28 server/discover / tools/list / tools/call
+ one OBSERVE tool
+ official Rust SDK protocol client behind a Fielora bounded transport
+ existing ToolProvider / RoutedToolExecutor / Policy / ToolCall / receipt path
+ zero credentials
+ zero network
+ zero mutation
+ zero UI
+ zero installer
+ zero migration
```

Implemented fixture tool:

```text
provider-native name: observe_echo
input:  { "value": string }
output: { "echo": "<value>" }
effect: Fielora-authoritative OBSERVE
```

The server is a separate process and speaks real newline-delimited MCP. It is
not a direct `ToolProvider` implementation. It should implement only the pinned
wire transcript independently from the production adapter, with argv-selected
deterministic failure modes for tests.

Required proof chain:

```text
fixture MCP process
  -> Platform-managed stdio / Windows Job Object
  -> bounded MCP SDK client transport
  -> MCP adapter
  -> existing ToolProvider
  -> existing catalog / model definition / selection
  -> existing PolicyEngine
  -> existing AgentToolCall
  -> existing RoutedToolExecutor
  -> existing receipt/event with MCP provenance
  -> existing Verification boundary unchanged
```

This Slice proves only `Real Protocol Provider -> Existing Extension Seam`.
It does not prove arbitrary local-server trust, ecosystem compatibility,
sandboxing, installer safety, user config, remote MCP, credentials, or product
readiness.

Implementation started only after separate authorization and the pre-change
HIGH-impact review of the exact process primitive and dependency diff.

---

# 15. TARGETED_TEST_PLAN

## 15.1 MCP protocol

- pinned `2026-07-28` `server/discover` succeeds;
- no `initialize` or `notifications/initialized` is emitted;
- exact request metadata/version and unique IDs are present;
- `tools/list` single page maps correctly; bounded pagination stops at limits;
- `tools/call` returns the deterministic result;
- JSON-RPC application error and `isError=true` remain failures;
- malformed UTF-8/JSON, unknown/duplicate/wrong ID, oversized frame, timeout,
  cancellation, and process exit take the specified terminal path;
- unsupported version, legacy-only server, task-required tool, and
  server-to-client request fail closed.

## 15.2 Tools/admission

- MCP discovery produces an ordinary `ProviderToolDefinition` and `ToolSpec`;
- count/name/description/schema/frame/depth/page bounds are enforced;
- duplicate provider/native/semantic IDs and normalization collisions fail
  closed;
- same admitted config/restart yields stable provider/capability identity;
- material fixture config/executable digest change yields a different provider
  ID;
- Fielora effect is always `OBSERVE`, regardless of MCP annotations;
- invalid call arguments fail before a protocol write;
- result/receipt/observation remain within current 64 KiB bounds.

## 15.3 Core/existing pipeline

- the candidate MCP tool appears in normal model-facing selection without an
  MCP-specific Agent branch;
- existing `PolicyEngine` is invoked with the admitted `ToolSpec`;
- the existing AgentToolCall is created, transitions, and persists;
- execution crosses the existing `RoutedToolExecutor`;
- completed/failed/cancelled/unknown receipts all contain the trusted MCP
  source envelope;
- protocol success does not create Verification PASS or self-complete the Run;
- server metadata cannot change Policy, Approval, effect, or completion.

## 15.4 Process cleanup

- normal provider shutdown closes/reaps the fixture;
- cancellation sends the correlated cancellation and terminates/reaps the
  entire Windows child tree;
- crash/EOF reaps handles and never replays the uncertain call;
- one later independent call may exercise the single lazy restart bound;
- dropping provider/Core/test terminates all descendants;
- test completion verifies no fixture PID or descendant remains.

## 15.5 Regression

- existing deterministic direct `ToolProvider` fixture still passes;
- at least one existing built-in Tool still traverses the same executor;
- current Agent catalog, Policy, approval, receipt, recovery, and Verification
  unit/integration suites remain green;
- storage reopen still preserves the source envelope in existing receipt/event
  JSON;
- no schema, migration, generated DTO, UI, Desktop, or packaged assertion is
  changed merely to make the protocol test pass.

The authorized implementation ran only targeted Rust/Core/contract checks and
affected-crate tests appropriate to its actual code changes. Section 19 records
the evidence; no full premerge, Desktop E2E, or packaged smoke was substituted
for this protocol proof.

---

# 16. CHANGE_IMPACT

| Area | Impact | Reason / first-Slice disposition |
|---|---|---|
| MCP protocol client | `MEDIUM` | SDK-based and tightly pinned, but it adds a new wire/version boundary and failure taxonomy. |
| New SDK dependency | `MEDIUM` | Official `rmcp =3.1.4`, Apache-2.0, exact-pinned and feature-gated; manifest/lock/transitive/advisory review is recorded in section 19. |
| Local stdio child process | `HIGH` | Executes a native process with OS authority and introduces command/supply-chain/pipe boundaries. Fixture-only in first Slice. |
| Process lifecycle / Windows tree cleanup | `HIGH` | Cancellation, crash, exit, restart, shutdown, and orphan prevention are security/reliability boundaries. |
| Test-only typed config | `MEDIUM` | In-memory fixed fixture config avoids persistence/UI, but exact command/cwd identity is security-sensitive. |
| Future user/local config/import | `HIGH` | Would enable arbitrary native code and needs trust/install/enable policy. Deferred. |
| Environment | `HIGH` | Full inheritance can leak secrets; first Slice requires explicit minimal environment and negative tests. |
| Credentials | `HIGH` | Not needed and forbidden in first Slice; requires independent design later. |
| Remote transport | `HIGH` | Network, endpoint, TLS, auth, SSRF, redirect, reconnect, trust, and delivery uncertainty. Deferred. |
| Persistence/migration | `LOW` for first Slice | Existing bounded JSON receipt is reused; config is test-only and no migration is allowed. Future durable config is separately `HIGH`. |
| Receipt contract | `MEDIUM` | Additive internal source fields/enum only; no table or receipt hierarchy. Requires contract regression when implemented. |
| Provider error disposition | `MEDIUM` | Adds an internal route to existing `UNKNOWN`; no new durable lifecycle. Requires recovery regression. |
| UI | `LOW` / none | No UI, diagnostics surface, installer, or management page in first Slice. Future UI not assessed here. |

```text
OVERALL_FIRST_REAL_MCP_SLICE_IMPACT: HIGH
```

The high rating comes from local native process activation and lifecycle, not
from Agent architecture. No current fact requires a second Agent Runtime,
permission engine, receipt hierarchy, Verification engine, schema migration,
credential design, product UI, or Frozen spec modification for the fixture
Slice.

---

# 17. OPEN_QUESTIONS

1. Before an authorized implementation, should the exact `rmcp` version be
   pinned with `=` for the probe, and what repository command will record its
   full feature-resolved dependency tree and advisory state?
2. Should the first Platform managed-child API be introduced alongside the
   private one-shot `ProcessJob`, or should that small OS primitive be extracted
   for both callers in the same authorized change? This must avoid an unrelated
   command-runtime refactor.
3. What exact canonical JSON and executable-content digest rule should define
   a future user-configured provider instance across upgrades? The fixture rule
   is intentionally stricter and not a Marketplace identity.
4. What sandbox, signing, package provenance, user activation, and filesystem/
   network containment are required before any arbitrary local MCP server can
   be presented as an `OBSERVE` provider? `OBSERVE` is a Tool semantic, not an
   OS sandbox claim.
5. When, if ever, should Fielora support 2025-era `initialize/initialized`
   fallback? The first Slice pins `2026-07-28` and rejects fallback.
6. Which additional JSON Schema 2020-12 constructs should be admitted after the
   probe, and what validation-time budget applies? External references must
   remain non-dereferenced.
7. Should production discovery cache honor MCP TTL/cache-scope and list-change
   subscriptions, or continue explicit bounded refresh? Neither is needed for
   the first Slice.
8. What product/config scope will later enable or disable a provider and its
   individual tools? This Candidate does not reopen Project/Conversation/Goal
   product hierarchy.
9. Remote MCP, credentials, installer/config import, diagnostics UI, and real
   third-party interoperability each require separate Change Impact and user
   authorization.

---

# 18. AUTHORIZATION_AND_STOP_LINE

The separately authorized fixture-only implementation stops at the first Slice.

```text
MCP_FIRST_REAL_READONLY_STDIO_SLICE: IMPLEMENTED / TARGETED PASS
GENERAL_MCP_PRODUCT_IMPLEMENTATION: NOT_AUTHORIZED
ARBITRARY_LOCAL_SERVER_ACTIVATION: NOT_AUTHORIZED
REMOTE_MCP: NOT_AUTHORIZED
CONFIG_OR_CREDENTIAL_WORK: NOT_AUTHORIZED
UI_INSTALLER_MIGRATION: NOT_AUTHORIZED
```

No later Slice may begin from this document alone.

---

# 19. IMPLEMENTATION_EVIDENCE_2026_08_25

## 19.1 Current implemented reality

The first Slice implements exactly one repository-built, deterministic local
stdio MCP fixture and one production-shaped Tools adapter. It adds no product
configuration or automatic provider activation.

```text
fixture MCP process
  -> fielora-platform ManagedChild / Windows Job Object
  -> Fielora-bounded rmcp async-read/write transport
  -> rmcp 2026-07-28 Discover lifecycle
  -> McpStdioToolProvider
  -> existing ToolProvider catalog
  -> existing PolicyEngine / RoutedToolExecutor
  -> existing durable ToolCall receipt/event
  -> existing Verification boundary
```

Implemented modules:

- `crates/fielora-platform/src/lib.rs`: generic `ManagedChild`, duplex stdio,
  bounded graceful shutdown, termination, reap, and Windows process-tree
  ownership. It contains no MCP or Tool semantics.
- `crates/fielora-agent/src/mcp.rs`: provider-lived, single-flight MCP adapter,
  exact lifecycle, admission, stable Fielora identity, call mapping,
  cancellation, health, and one-later-operation restart bound.
- `crates/fielora-core/tests/fixtures/mcp_fixture.rs`: independent wire-level
  fixture server; it does not implement `ToolProvider` and fails if legacy
  `initialize/initialized` is attempted.
- `crates/fielora-core/tests/mcp_transport.rs`: real-process protocol,
  admission, cancellation, cleanup, and failure tests.
- `crates/fielora-core/src/agent_runtime.rs`: provider-neutral `UNKNOWN`
  durability path and a feature-gated full AgentCoordinator protocol proof;
  no MCP-specific execution branch was added to `AgentCoordinator`.

## 19.2 Dependency audit

| Item | Audited result |
|---|---|
| Exact SDK | `rmcp =3.1.4` |
| Features | `client`, `transport-async-rw` |
| Defaults | disabled |
| Explicitly absent | `transport-child-process`, `process-wrap`, server, macros, HTTP, auth, OAuth, remote transports |
| License | Apache-2.0 |
| SDK MSRV | Rust 1.88 |
| Repository toolchain | `rustc/cargo 1.97.1`; compatible |
| Direct manifest delta | `rmcp`; existing workspace Tokio gains `process`/`io-util`; `fielora-agent` directly uses existing `futures-util`, `tokio`, `tokio-util`, and `fielora-platform` |
| Notable resolved SDK subtree | `chrono 0.4.45`, `futures 0.3.34`, `indexmap 2.14.0`, `serde 1.0.229`, `serde_json 1.0.151`, `thiserror 2.0.20`, `tokio 1.53.1`, `tokio-stream 0.1.19`, `tokio-util 0.7.19`, `tracing 0.1.44` |
| New lock entries | 19 packages: `android_system_properties`, `autocfg`, `chrono`, `equivalent`, `errno`, `futures`, `futures-executor`, `iana-time-zone`, `iana-time-zone-haiku`, `indexmap`, `num-traits`, `rmcp`, `signal-hook-registry`, `tokio-stream`, `windows-core`, `windows-implement`, `windows-interface`, `windows-result`, `windows-strings` |
| Duplicate review | no new same-name multi-version split is attributable to those 19 additions; existing workspace `syn 2/3` and older/newer Windows dependency families remain pre-existing |
| Advisory review | exact-package OSV query on 2026-08-25 returned no matches for the 19 additions; `cargo-audit` and `cargo-deny` were not installed, so no RustSec command result is claimed |

The official SDK's stock async-read/write receiver has an upstream open
unbounded-frame concern. This Slice does not instantiate that receiver: it uses
the SDK's official JSON-RPC codec/types/service behind a Fielora-owned
256-KiB-before-allocation codec boundary. SDK request correlation and protocol
types remain authoritative; Fielora owns process, bounds, admission, and
terminal policy.

## 19.3 Protocol and process evidence

- Exact `ClientLifecycleMode::Discover` with only `V_2026_07_28`; wrong-version
  servers fail, and the fixture exits on any legacy handshake.
- Only `server/discover`, bounded `tools/list`, one-round `tools/call`, and
  correlated cancellation are accepted. Input-required/task continuations are
  classified as unsupported without an automatic follow-up round.
- The transport enforces 256-KiB frames before allocation; discovery is capped
  at 512 KiB, 32 tools, four pages, 64-KiB schema/tool, and depth 16.
- Invalid call arguments are rejected against the admitted schema before any
  protocol write. Provider annotations cannot change the Fielora-authored
  `OBSERVE` effect or routing identity.
- Child environment is cleared, stderr is drained separately with only a
  bounded byte count retained, and neither stream is persisted wholesale.
- Normal drop closes transport, waits, then escalates only if required.
  Cancellation first sends `notifications/cancelled` and probes health; a
  healthy provider is reused, while an unresponsive server is terminated and
  reaped with its Windows descendant tree.

## 19.4 Existing-pipeline and terminal evidence

- The real fixture definition becomes an ordinary `ModelToolDefinition`, is
  selected by the existing fixture model path, and executes through
  `RoutedToolExecutor`; no `McpToolExecutor`, MCP Agent, Policy, receipt,
  Verification, state machine, or Agent runtime exists.
- Completed ToolCalls retain the existing durable type and record bounded
  authoritative source fields: capability ID/version, `source_kind=MCP`,
  provider ID/native name, `protocol_version=2026-07-28`, and
  `transport=STDIO`.
- Known JSON-RPC/application and `isError=true` results become existing
  `FAILED`; graceful cancellation becomes existing `CANCELLED`; a fully
  written request followed by timeout, crash, wrong ID, malformed UTF-8/JSON,
  oversized response, or unsupported server request becomes existing
  `UNKNOWN` and is never replayed in place.
- A later independent operation may consume one lazy restart. It never reuses
  that restart to replay the uncertain call.
- A real crash-after-write test persists the existing `UNKNOWN` ToolCall and
  `ToolUnknown` event with MCP provenance while its AgentRun remains `RUNNING`;
  it creates neither `VerificationRecorded` nor `RunCompleted`.
- MCP protocol success creates no Verification receipt. The separate full
  Agent success test reaches Run completion only after the model's subsequent
  ordinary final response; the MCP result itself has no completion or semantic
  authority.

## 19.5 Targeted validation

All commands below passed on Windows 11 x64 with Rust 1.97.1. The contract
command used the repository-pinned Node 24.18.1 and pnpm 11.21.0.

| Validation | Result |
|---|---|
| `cargo test -p fielora-core --features mcp-fixture --test mcp_transport -- --test-threads=1` | PASS: 12 real-process tests |
| `cargo test -p fielora-platform -p fielora-agent -p fielora-core --features mcp-fixture -- --test-threads=1` | PASS: Agent 21, Core 22, MCP transport 12, Platform 2; doc tests 0 failures |
| `cargo clippy -p fielora-platform -p fielora-agent -p fielora-core --features mcp-fixture --all-targets -- -D warnings` | PASS |
| `cargo fmt --all -- --check` | PASS |
| `pnpm contracts:check` | PASS; generated contracts unchanged |
| `cargo build --release -p fielora-core` | PASS; release Core link verified |
| `git diff --check` | PASS |
| post-test `fielora-mcp-fixture` process query | PASS: 0 processes |

The existing `ts-rs` `deny_unknown_fields` parse notices and MSVC linker stdout
notice remained non-failing baseline warnings. No Desktop E2E, packaged smoke,
full premerge, network probe, or unrelated Storage migration suite was run.

## 19.6 Scope stop

There is still no UI, installer, Marketplace, package manager, persistent MCP
config, schema/migration, credential injection, network transport, arbitrary
local/community provider activation, extension sandbox, or Plugin Runtime.
The Candidate remains `DRAFT / CANDIDATE / NOT FROZEN`.
