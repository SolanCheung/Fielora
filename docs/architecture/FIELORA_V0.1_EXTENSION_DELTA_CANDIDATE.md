# Fielora V0.1 Extension Architecture Delta Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `EXTERNAL TOOL PROVIDER PIPELINE PROBE: IMPLEMENTED / VALIDATED`

**Track:** subordinate to `RAPID_DESKTOP_EXECUTION_V0.1.md`

**Change type:** architecture analysis, minimal contract delta, and validated
pipeline probe

This document narrows the earlier Open Extension Architecture draft to the
smallest delta supported by the current repository. The user separately
authorized the External Tool Provider Pipeline Probe; this Candidate records
its factual result. It does not amend any Frozen or Baseline specification,
create an implementation phase, authorize a database migration, or authorize
further Extension product work.

The source of truth remains:

- `FIELORA_V0.1_AGENT_ARCHITECTURE_SPEC.md`;
- `CORE_CONTRACTS_V0.1.md`;
- `RAPID_DESKTOP_EXECUTION_V0.1.md`;
- the current `ToolSpec`, `ModelToolDefinition`, `ToolExecutor`, `ToolRuntime`,
  `PolicyEngine`, `ContextCompiler`, `AgentCoordinator`, Agent ledger, Tool
  receipts, Verification receipts, built-in Skill loading, and bounded child
  AgentRun implementation.

The validated probe answers the two implementation questions:

1. User flow: an external Tool Provider contributes one tool which an existing
   AgentRun can discover, select, authorize, execute, record, and interpret.
2. Real verification: a bounded integration fixture proves the contributed
   tool traverses the existing Agent Tool pipeline without a Provider-specific
   Agent branch or a parallel policy, receipt, runtime, or verification system.

---

# 1. CURRENT_EXTENSION_REALITY

Status meanings:

- `EXISTS`: the required semantic path is implemented and used now, even if it
  is intentionally narrow.
- `PARTIAL`: a real implementation seam or bounded behavior exists, but it does
  not yet satisfy open Extension requirements.
- `ABSENT`: no product/runtime implementation was found; a historical or
  semantic document mention does not count as implementation.

| Area | Status | Current module / file | Existing semantic owner | Gap |
|---|---|---|---|---|
| Tool catalog / Tool definition | `EXISTS` | `crates/fielora-agent/src/lib.rs`: `ToolSpec`, `ToolExecutionSource`, `coding_tool_catalog_with_providers`; `crates/fielora-contracts/src/lib.rs`: `ModelToolDefinition` | Tools owns executable definitions; Harness receives model-facing projections | Built-ins and bounded registered providers now share one available catalog with stable source/provider/version metadata. Large-catalog indexing and deferred exposure remain absent. |
| Tool discovery / selection | `PARTIAL` | `ToolProvider::discover_tools`; `coding_tool_catalog_with_providers`; `visible_tool_definitions`; task classification and phase gates | Harness.Orchestration owns which tools an AgentRun sees; Tools owns available definitions and backend resolution | Bounded provider discovery and normal selection exist. Production enable/disable, lazy provider activation, health diagnostics, and large-catalog indexing remain absent. |
| `ToolExecutor` | `EXISTS` | `ToolExecutor`; `RoutedToolExecutor` | Harness-to-Tools interface boundary | The existing boundary now routes an admitted Tool to the built-in backend or one registered provider. Production provider lifecycle/config remains later work. |
| Provider-neutral Tool execution | `EXISTS` | `RoutedToolExecutor`; `AgentCoordinator::execute_tool`; direct deterministic provider fixture | Harness.Execution owns lifecycle; Tools owns concrete execution | The probe proves provider-neutral dispatch without a second execution lifecycle. Arbitrary external backend activation is not implemented. |
| `PolicyEngine` integration | `EXISTS` | `crates/fielora-agent/src/lib.rs`: `PolicyEngine`; `crates/fielora-core/src/agent_runtime.rs`: policy decision before durable ToolCall execution | Harness.Governance | Current decision inputs are permission preset, `ToolSpec.effect`, and arguments. External source trust, provider identity, and richer frozen risk facts are not admitted yet. |
| Permission / Approval | `EXISTS` | `AgentPermission`, `AgentPolicyDecision`, `ApprovalView`; `AgentCoordinator::resolve_approval`; `agent_approvals` | Harness.Governance | Current three presets and Allow/Ask/Deny routing are real. No separate Extension permission model exists or is needed. Higher-risk external integrations may later require a reviewed extension of existing policy inputs. |
| Durable ToolCall record / receipt | `EXISTS` | `AgentToolCallView`; schema 6 `agent_tool_calls`; existing create/update APIs; Fielora-authored `execution_source` envelope | Harness.Execution + Harness.Continuity; typed execution facts originate in Tools | Completed and terminal outcomes reuse existing receipt/event JSON and preserve source provenance across reopen. No new receipt hierarchy or migration was added. |
| Verification Receipt | `EXISTS` | `VerificationReceiptView`; schema 6 `agent_verification_receipts`; `record_agent_verification`; current mutation-revision checks | Harness.Verification & Evidence | Verification is currently Coding/process focused. External execution success must not be promoted to Verification PASS without an existing or future Fielora-owned verifier. |
| Skill discovery | `PARTIAL` | `BUILTIN_SKILLS`; `list_skills` tool | Harness.Ingress & Context + Harness.Orchestration | Only a static built-in list is discoverable. There is no source scan, metadata index, compatibility ingestion, trust classification, or project/community discovery. |
| Skill lazy loading | `EXISTS` | `load_skill` loads one selected built-in Skill; its instructions are absent from the initial prompt | Harness.Ingress & Context + Harness.Orchestration | Lazy behavior is real but content is compiled into Rust tuples. The receipt lacks source/content digest/dependency metadata and there is no bounded file-backed loader. |
| Project/local Skill support | `ABSENT` | No runtime reference to `SKILL.md` outside documentation | Harness.Ingress & Context | No project-local root, local/community source admission, compatibility parser, precedence rule, or content budget exists. |
| Bounded subagent | `EXISTS` | `delegate_readonly`; `AgentCoordinator::run_readonly_subagent`; child AgentRun and observe-only catalog | Harness.Orchestration + Harness.Continuity + Harness.Governance | Current scope is deliberately read-only, six steps, separate durable Run. Extension work must reuse this isolation and must not grant a child the parent catalog automatically. |
| MCP support | `ABSENT` | No MCP client, transport, discovery, adapter, config, or execution code was found | Future Tools provider/backend | Frozen docs reserve MCP semantics, but no current MCP product/runtime implementation exists. |
| External Tool Provider abstraction | `EXISTS` | `ToolProvider`, `ToolProviderIdentity`, `ProviderToolDefinition`, bounded catalog admission, `RoutedToolExecutor` | Tools provider/backend; Harness controls admission and use | The deterministic read-only probe is implemented and validated. Production configuration, trust, installer, credentials, sandboxing, and arbitrary provider activation remain absent. |
| Plugin / Extension manifest | `ABSENT` | No Fielora Extension manifest contract or parser exists | Future Product extension packaging + Tools/Skill contribution metadata | Electron Forge's build-time plugins are unrelated. Manifest schema, compatibility, contributions, and declared requirements remain undefined. |
| Plugin host | `ABSENT` | No third-party contribution loader or host exists | Future Product contribution host and Tools backends, not Agent Runtime | No loading, lifecycle, isolation, RPC, contribution admission, or diagnostics exists. |
| Credential handling for non-model integrations | `PARTIAL` | `fielora-platform::CredentialStore`, `SecretBytes`, `WindowsCredentialStore` | Platform infrastructure, mediated by Harness.Governance and the selected Tool backend | The secure storage primitive is generic, but current credential identity, configuration, lifecycle, UI, and injection flow are model-provider specific. There is no non-model integration credential contract. |
| Extension sandbox | `ABSENT` | No restricted third-party worker/process/wasm host exists | Future infrastructure beneath Product/Tools boundaries | Sandbox, resource limits, filesystem/network mediation, signing, and containment require a separate high-impact review. |
| Extension UI | `ABSENT` | No Extensions/Skills/MCP/Plugins product surface exists | Product/Workspace layer | Model Provider settings and Electron Forge configuration are not Extension UI. This candidate does not authorize a new navigation item or any UI. |

Additional current fact: `CORE_CONTRACTS_V0.1.md` defines the semantic
`CapabilityDescriptor → PolicyDecision → CapabilityResult` chain. Current
schema 7 and Rust contracts do not physically implement the historical
`capabilities`, `capability_executions`, `verification_results`, or
`verification_checks` tables. The active Agent ledger instead uses
`agent_tool_calls.receipt_json` and `agent_verification_receipts`. The old
Phase migration map must not be treated as current implementation order under
Rapid Desktop.

---

# 2. REUSE / EXTEND / NEW

| Decision | Existing element | Candidate treatment |
|---|---|---|
| `REUSE` | `Model + Harness + Tools` | Remains the only top-level Agent architecture. Extension is a subordinate contribution path, not a fourth Agent layer. |
| `REUSE` | `AgentCoordinator` | Continues to own Tool selection/exposure, ToolCall lifecycle, policy/approval integration, dispatch control, receipt persistence, recovery, and completion interpretation. No Extension-specific Agent loop. |
| `REUSE` | `ContextCompiler` and current lazy Skill behavior | File-backed Skills later enter existing context admission, budgets, hashing, and snapshots. Do not replace the current loader to gain directory symmetry. |
| `REUSE` | `PolicyEngine`, permission presets, Approval ledger | Every contributed executable Tool maps into the existing effect/policy path. A Skill, MCP Server, Plugin, or Provider cannot grant permission or change Approval Routing. |
| `REUSE` | `ToolExecutor` and `ToolExecution` | All executable provider adapters remain behind this Harness-to-Tools boundary and return typed facts. |
| `REUSE` | `AgentToolCallView`, `agent_tool_calls`, durable events | Existing ToolCall identity, statuses, timestamps, arguments, errors, and receipt storage remain the execution record. |
| `REUSE` | `VerificationReceiptView` and current completion authority | External success is only a Tool fact. Verification remains Fielora-owned and separate. |
| `REUSE` | bounded child AgentRun | Any future delegated use receives an independently admitted, least-privilege Tool subset and budget. |
| `REUSE` | semantic `CapabilityDescriptor` | Use it as the canonical meaning of a discoverable executable capability. Do not invent a competing `CapabilityDefinition`. |
| `EXTEND` | current `ToolSpec` / model-facing projection | Carry a stable semantic id, version, trusted source/provider reference, effect, and existing `ModelToolDefinition`; expose only the selected projection to the Model. Exact Rust type names remain implementation-level. |
| `EXTEND` | Tool selection | Add provider discovery admission, availability/enable checks, bounded candidate selection, and lazy model exposure. Do not require classes named `CapabilityRegistry` or `CapabilityResolver`. |
| `EXTEND` | Tool execution routing | Allow the existing `ToolExecutor` path to dispatch an admitted, resolved Tool to the built-in backend or one external provider adapter without changing Harness lifecycle. |
| `EXTEND` | existing receipt JSON/event facts | Add a small Fielora-authored source/provenance envelope to completed, failed, cancelled, or unknown external Tool outcomes. Do not add a second receipt hierarchy. |
| `EXTEND` | built-in Skill index/load | Add compatible file-backed discovery, metadata indexing, content digest, source/trust, bounded dependency declarations, and Project/local/community sources. |
| `EXTEND` | generic `CredentialStore` primitive, later | Add non-model credential identity and temporary backend injection only after a separate security Change Impact. Credential bytes never enter Model context, Tool definitions, logs, or receipts. |
| `NEW` | minimal Tool Provider adapter contract | A Tools-side discovery/execution adapter is required because no external provider abstraction exists. It is not Agent Runtime and cannot own policy, Approval, Run state, receipts, Verification, or Semantic Authority. |
| `NEW` | MCP adapter, later | Map MCP discovery and calls into the Tool Provider contract. Transport/config/diagnostics remain later slices. |
| `NEW` | Plugin contribution/package boundary, later | A Plugin may package contributions, but it does not introduce an execution path. Executable contributions must use the same Tool Provider/`ToolExecutor` path. |

Explicitly not new:

- no Capability Runtime;
- no Extension Agent Runtime;
- no Extension permission engine;
- no Extension Approval service;
- no `ExecutionReceipt` hierarchy;
- no Extension Verification engine;
- no Extension AgentRun, state store, event ledger, or Semantic Authority;
- no duplicate Project/Field/Conversation/Goal model.

---

# 3. EXTENSION_ARCHITECTURE_DELTA_CANDIDATE

## 3.1 Ownership

```text
Fielora Product / Workspace
Project / Conversation / existing identity and scope
        │
        ▼
Fielora Agent
├── Model                         unchanged
├── Harness
│   ├── Ingress & Context         Skill discovery/admission/lazy content
│   ├── Orchestration             candidate Tool selection and exposure
│   ├── Governance                existing PolicyEngine / Approval
│   ├── Execution                 existing AgentCoordinator / ToolCall lifecycle
│   └── Verification & Evidence   existing receipts and completion authority
└── Tools
    ├── admitted Tool definitions / current catalog projection
    ├── existing ToolExecutor boundary
    ├── built-in ToolRuntime
    └── provider/backend adapters
        ├── MCP       later
        ├── API       later
        ├── CLI       later
        ├── Native    later
        └── Plugin-contributed provider reference   later
```

The mechanics of discovering and resolving provider implementations live on
the Tools side. The decision about which admitted Tools a particular AgentRun,
Harness Profile, phase, or child Agent may see belongs to
Harness.Orchestration. Policy admission and Approval remain
Harness.Governance.

## 3.2 One execution path

```text
Provider discovery result (untrusted source data)
  → Fielora adapter validation and semantic Tool description
  → current available-tool catalog snapshot
  → Harness candidate selection / deferred model exposure
  → Model proposes a namespaced semantic Tool
  → Harness resolves one admitted provider/backend
  → existing PolicyEngine decision
  → existing durable AgentToolCall
  → existing Approval flow when ASK
  → existing ToolExecutor boundary
  → selected provider/backend adapter
  → typed ToolExecution facts
  → existing durable ToolCall receipt + Tool event
  → existing Fielora Verification / Evidence interpretation
  → existing Harness completion authority
```

Provider discovery metadata is not policy. The Fielora-owned adapter must
validate schema bounds, assign or verify the authoritative current
`AgentToolEffect`, and reject collisions or unsupported definitions before a
Tool can enter the available catalog snapshot.

Large catalogs are handled as behavior, not as mandatory class names:

1. discover bounded metadata without loading every provider payload;
2. admit enabled, healthy, scope-relevant definitions;
3. select a small candidate set from task, Profile, current phase, explicit
   user instruction, Skill dependencies, and available providers;
4. project only that set into `ModelToolDefinition`;
5. lazily load additional definitions only through Harness-controlled
   discovery;
6. resolve one provider at dispatch time and retain its trusted source in the
   durable outcome.

## 3.3 Capability naming decision

The Frozen `CapabilityDescriptor` already means a Provider-neutral executable
digital capability and includes stable identity, source, version, input/output
schema, risk, availability, health, metadata, and provenance. That semantic is
sufficient for Extension discovery and must be extended rather than replaced.

The current implementation has three narrower representations:

```text
CapabilityDescriptor    semantic CAN DO description in Frozen Core Contracts
ToolSpec                current executable Coding spec: model definition + effect
ModelToolDefinition     minimal definition exposed to a Model
AgentToolCallView        durable invocation, policy, status, arguments and receipt
```

These are projections at different stages, not four competing capability
models. The Candidate does not require runtime classes named
`CapabilityRegistry` or `CapabilityResolver`. It requires only bounded catalog
discovery, admission, candidate selection, provider resolution, and lazy model
exposure.

`CapabilityExecution` in the Frozen semantic contract and the active
`AgentToolCallView` ledger overlap in DID semantics but are not currently the
same physical model. This Candidate does not merge them, create the historical
tables, or rename the current ledger. Whether the semantic contract later gets
a separate non-Agent product projection remains an open question.

## 3.4 Skill Delta

Current `list_skills` / `load_skill` lazy behavior remains the base. The minimum
future delta is:

- discover built-in, local/community, and Project-local Skill candidates from
  explicitly admitted roots;
- ingest a bounded compatible `SKILL.md` shape without inventing a closed Skill
  language;
- retain index metadata: stable id/name, summary, version, source, trust,
  scope reference, instructions reference, content digest, and keywords;
- declare required and optional semantic Tool dependencies;
- load full instructions and only selected referenced resources after
  Harness.Orchestration chooses the Skill;
- pass loaded content through existing context admission, size limits, trust
  classification, hashing, and Context Snapshot facts;
- record source/version/content digest in the existing `load_skill` Tool
  receipt or Context event.

Hard boundaries:

- a Skill cannot grant permission;
- a Skill cannot change Policy or Approval Routing;
- a Skill dependency is not an installation or activation grant;
- Skill instructions and assets are untrusted context;
- a Skill is not an Agent and cannot unconditionally spawn a child AgentRun;
- loading a Skill does not automatically expose every referenced Tool.

The exact mapping of Project versus legacy Field scope is intentionally not
decided here.

## 3.5 MCP Delta

MCP is a later Tool Provider adapter, not an Agent or Harness:

```text
MCP client/discovery
  → MCP adapter validation
  → semantic CapabilityDescriptor / current ToolSpec projection
  → admitted Tool catalog snapshot
  → existing Harness selection
  → existing PolicyEngine / Approval
  → existing ToolExecutor path
  → MCP backend call
  → existing ToolCall receipt
  → existing Verification / Evidence interpretation
```

MCP never owns Permission, Approval, AgentRun, durable Harness state,
Verification, Evidence authority, completion, or Semantic Authority. Server
names, annotations, schemas, and risk claims are untrusted provider metadata
until validated by Fielora.

Later candidates may cover tool-level enable/disable, local/remote transport,
bounded config import, health, restart, logs, latency, schema inspection, and
diagnostics. This Candidate does not authorize a transport dependency, config
storage, UI, installer, credential flow, or real MCP connection.

## 3.6 Plugin Delta

A Plugin is a package/contribution mechanism outside the top-level Agent
architecture. It is not a Tool protocol and not a new Agent Runtime.

A future Plugin may declare contributions for:

- Tools;
- Skills;
- Commands;
- Context providers;
- Surfaces;
- file or artifact handlers.

Plugin-contributed executable capabilities must resolve to an admitted Tool
Provider/backend and traverse the existing Tool path. Plugin instructions or
metadata cannot execute directly, receive credentials, call Electron Main,
write Core state, or self-grant authority.

This Candidate defines no final manifest schema. A later minimal manifest may
contain identity, version, Fielora compatibility, declared contributions, and
declared requirements. Installation, sandbox, signing, credential mediation,
updates, permission diff, and package integrity each require a separate major
Change Impact before implementation.

Marketplace, publisher economy, reviews, payment, discovery ranking, package
manager, unrestricted UI injection, and full Plugin Runtime are out of scope.

## 3.7 Product and route boundary

Extension remains subordinate to Rapid Desktop. It does not insert a Phase,
change V0.1 rules, alter the current navigation, or redefine Project, Field,
Conversation, Task, Goal, Profile, or AgentRun identity.

Extension scope must reuse current identity, Context, permission, and Run
boundaries. Any conflict between Frozen Field-centric contracts and the current
Project/Conversation-first product language is recorded as an open architecture
question, not silently resolved by this Candidate.

---

# 4. CONTRACT_DELTA_CANDIDATE

This section is additive design only. Type names are illustrative unless they
already exist.

## 4.1 Reuse the Frozen semantic descriptor

Keep `CapabilityDescriptor` as the semantic description. For execution, extend
the current `ToolSpec` projection with the minimum trusted routing facts:

```text
semantic capability id
capability version
source kind
provider id
provider-native tool name
existing ModelToolDefinition
existing AgentToolEffect
```

The model-facing `ModelToolDefinition` does not need provider identity. It
should expose a stable, namespaced semantic Tool name, description, and bounded
input schema. Provider selection stays outside Model context unless explicit
user control requires a bounded label.

## 4.2 Minimal Tool Provider contract

A future Tools-side adapter needs only these behaviors for the first proof:

```text
describe provider identity and health
discover bounded Tool descriptions
execute one already-resolved Tool with typed arguments and cancellation
return ToolExecution facts or a classified failure
```

The adapter does not decide policy, create ToolCalls, persist receipts, resolve
Approval, invoke Models, mark verification, or complete Runs. An aggregate or
routing implementation may remain behind the existing `ToolExecutor` trait;
this does not create a new Runtime layer.

## 4.3 Trusted source metadata in the existing receipt

Do not add `ExecutionReceipt`. Add a small Fielora-authored envelope to the
existing Tool receipt/event facts:

```json
{
  "execution_source": {
    "capability_id": "example.lookup",
    "capability_version": "1",
    "source_kind": "EXTERNAL",
    "provider_id": "fixture.external",
    "provider_tool_name": "lookup"
  }
}
```

Rules:

- routing metadata is written by trusted Fielora code, not copied as authority
  from provider output;
- `run_id`, `tool_call_id`, lifecycle timestamps, status, arguments, and error
  code remain in the existing ToolCall/event ledger and are not duplicated;
- Provider request ids may be included only when bounded and non-secret;
- Authorization headers, credential bytes, raw config, environment secrets,
  and unbounded provider bodies are forbidden;
- completed, failed, cancelled, and unknown outcomes must retain enough trusted
  source metadata to identify the selected provider;
- provider `SUCCESS` maps only to Tool execution facts and cannot create a
  `VerificationReceiptView` by itself.

The current JSON receipt column and durable Agent events can carry this first
delta without a schema migration. If later queries require provider/source
facts on every proposed ToolCall before a terminal receipt, an additive typed
field or persistence migration must be proposed separately rather than hidden
inside this Candidate.

## 4.4 Policy and risk mapping

No new permission enum or policy engine is proposed. Each admitted external
Tool must map to the current authoritative `AgentToolEffect` used by
`PolicyEngine`:

```text
OBSERVE | WORKSPACE_WRITE | PROCESS | NETWORK | DESTRUCTIVE
```

Frozen `CapabilityDescriptor.risk_classes` remain richer semantic facts; they
do not replace the active effect or grant permission. For the first slice,
only a Fielora-authored `OBSERVE` mapping is allowed. Credential, payment,
public publish, external mutation, or privilege semantics require a separate
Governance Change Impact before use.

## 4.5 Skill metadata delta

The future file-backed Skill index minimally needs:

```text
stable id / name
summary / version
source / trust
scope reference
instructions reference
content digest
required semantic Tool ids
optional semantic Tool ids
```

This index is discovery metadata, not a permission grant. Full content remains
lazy and bounded. This Candidate does not decide persistence, global/user
identity, source precedence, or final `SKILL.md` compatibility rules.

## 4.6 Plugin contribution boundary

A future manifest contribution points to Skill metadata, a Tool Provider
adapter, a command, a context provider, a declared Surface, or a handler. A
manifest declaration cannot itself become an executable ToolCall. Executable
contributions require successful admission into the same Tool definition and
execution path.

---

# 5. CHANGE_IMPACT

| Candidate change | Level | Reason / required review |
|---|---|---|
| This docs-only Candidate | `LOW` | No Frozen/Baseline edit, code, dependency, schema, credential, permission, UI, or execution change. |
| First read-only provider pipeline probe | `MEDIUM` | Touches Tool definition/routing and trusted receipt facts, but can avoid schema, network, credentials, process launch, UI, and product state mutation. Requires contract/unit/Core integration tests. |
| Additive receipt source envelope in existing JSON/events | `MEDIUM` | Changes execution evidence semantics and redaction requirements without changing tables. Must test completed/failed/cancelled/unknown outcomes and zero secret leakage. |
| Local/community/Project Skill discovery | `MEDIUM` | Admits untrusted instructions/files into Model context. Requires root containment, size/budget, trust/source, digest, precedence, symlink, and prompt-injection handling. |
| Persist provider/source columns or a durable catalog | `HIGH` | Schema/migration and compatibility change; requires a separate Change Impact and migration/rollback tests. |
| Local MCP transport | `HIGH` | Adds third-party process lifecycle, command/config admission, cancellation, output bounds, and supply-chain exposure. |
| Remote MCP transport | `HIGH` | Adds network, authentication, endpoint policy, remote trust, timeout, and credential boundaries. |
| Non-model integration credentials | `HIGH` | Adds secret identity, storage lifecycle, temporary injection, redaction, revocation, and scope semantics. |
| Plugin install/host/sandbox/signing/update | `HIGH` | Executes or admits third-party packages and affects filesystem, process, network, trusted UI, and supply-chain boundaries. |
| Extension UI or navigation | `MEDIUM` or `HIGH` | Product-scope and Human Experience change; not authorized here. Trusted configuration or permission UI raises the impact. |
| Marketplace/publisher/payment economy | `OUT OF SCOPE` | Not required to prove the Extension execution path. |

---

# 6. OPEN_QUESTIONS

1. Should the Frozen semantic `CapabilityDescriptor` remain only a normalized
   in-memory description for the first slices, or does a later non-Agent
   product workflow provide evidence for durable capability records?
2. What is the stable semantic Tool identity when multiple Providers implement
   the same capability, and at what point is the selected Provider fixed for a
   ToolCall?
3. Is the first production external backend hosted in Rust Core, a supervised
   child process through a Platform Adapter, or another restricted host? This
   Candidate only requires that it remain behind Tools and existing Harness
   execution control.
4. Should every failed/cancelled/unknown ToolCall persist a bounded failure
   receipt body, or are immutable Tool events plus the terminal error code the
   canonical source until a typed source field is justified?
5. Are current `AgentToolEffect` + three permission presets sufficient for the
   first real MCP Tool? Only `OBSERVE` is considered sufficient for the first
   pipeline proof.
6. Which compatible `SKILL.md` subset is accepted, how are conflicting sources
   ordered, and which roots qualify as local/community/Project sources?
7. How should current Project-first scope map to Frozen Field references,
   Conversation, and future Goal without creating duplicate identity or grant
   models?
8. What minimum provider identity/configuration must survive restart before a
   real MCP slice, and can that be achieved without a new durable catalog?
9. Which Plugin contributions can remain declarative, and which require a
   sandboxed code host? No answer is needed for the first Tool Provider proof.
10. Which external outcomes have a Fielora-owned verifier? Provider success can
    never answer this question on its own.

---

# 7. FIRST_SLICE_RESULT

The separately authorized first implementation Slice is complete:

## External Tool Provider Pipeline Probe

The implementation adds one deterministic, test-only, read-only Tool Provider adapter outside the
existing `ToolRuntime`. It contributes exactly one namespaced `OBSERVE` Tool,
requires no network, credential, filesystem mutation, process launch, UI,
installer, MCP dependency, or Plugin package.

The proof demonstrates:

1. the adapter contributes one bounded semantic Tool description;
2. the Tool is admitted into the current available catalog without a new Agent
   Profile or Provider-specific `AgentCoordinator` branch;
3. Harness selection exposes it only for the matching fixture task and does not
   send the entire catalog to the Model;
4. current `PolicyEngine` is invoked and the `ALLOW` decision is stored;
5. an existing durable `AgentToolCall` is created before dispatch and follows
   current status transitions;
6. execution crosses the existing `ToolExecutor` boundary;
7. the existing receipt contains Fielora-authored source/provider/version
   metadata and a bounded result digest;
8. provider failure is mapped to the existing failed ToolCall/error path with
   no false success;
9. Tool success does not independently create Verification PASS or grant Run
   completion authority;
10. no secret, raw environment, Authorization header, or unbounded provider
    payload is persisted or returned to Model context;
11. existing built-in Coding tools still execute through their current path;
12. no schema migration, UI, dependency, MCP transport, Plugin Runtime, or
    Frozen/Baseline document modification is included.

Validated evidence boundary:

- focused `fielora-agent` tests for Tool description/admission and executor
  routing;
- focused `fielora-core` tests for selection, policy, ToolCall lifecycle,
  receipt source metadata, failure, and no false Verification;
- focused `fielora-storage` compatibility test proving the existing receipt
  JSON/event path remains readable across restart;
- Core integration fixture with zero external requests;
- contract generation/static validation;
- no Desktop E2E or full premerge unless the eventual implementation expands
  into packaging, process, network, credential, schema, or UI boundaries.

Closeout validation on an Extension-only patch applied to a clean worktree at
`1f35ca82d6f2dab108d5642e1013fac3b212330e` produced:

- `cargo test -p fielora-agent -- --test-threads=1`: PASS, 19 tests;
- `cargo test -p fielora-core external_provider_uses_policy_toolcall_receipt_and_verification_boundaries -- --test-threads=1`:
  PASS, 1 focused test, including the built-in `read_file` regression;
- `cargo test -p fielora-storage existing_tool_receipt_and_events_preserve_execution_source_across_reopen -- --test-threads=1`:
  PASS, 1 focused reopen test;
- targeted Clippy with `-D warnings`, `cargo fmt --all -- --check`,
  `pnpm contracts:check`, the Docs development lane, and
  `git diff --cached --check`: PASS.

The focused Core proof confirms explicit provider registration rather than
global exposure, proposal/execution provenance agreement, the existing policy
and durable ToolCall paths, terminal source provenance, a bounded result
digest, no Verification PASS from provider success, and the unchanged built-in
execution route.

The probe answers only whether an external provider can enter the existing
Tool pipeline. It does not establish MCP compatibility, Plugin Runtime,
Extension installation, Skill community compatibility, production security,
or Extension product acceptance.
