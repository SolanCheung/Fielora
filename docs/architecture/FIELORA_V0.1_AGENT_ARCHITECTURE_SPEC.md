# Fielora V0.1 Agent Architecture Specification

**Document:** `FIELORA_V0.1_AGENT_ARCHITECTURE_SPEC.md`

**Version:** V0.1

**Status:** `CANONICAL ARCHITECTURE BASELINE`

**Scope:** Fielora Agent System

**Adopted:** 2026-08-24

**Framework terminology updated:** 2026-08-28

> All future Agent capabilities MUST extend this architecture. They MUST NOT
> create parallel Agent cores, Harnesses, runtimes, state systems, permission
> systems, evidence systems, or Provider-specific execution branches.

---

# 1. Purpose

Fielora is a Project-first local Agentic Workspace consisting today of an
Electron Desktop Host, a trusted React renderer, a Rust Core sidecar, SQLite
durable storage, Windows Credential Manager, isolated Browser infrastructure,
local workspace capabilities, and Provider-neutral model access.

This specification does not redesign that application. It establishes one
stable architecture for the Agent so Coding, Research, Browser, documents,
data, creative work, long-running tasks, Aegis, IDR, AG-UI, DXE integration,
MCP, and additional model Providers can evolve on the same foundation.

The canonical top-level Agent architecture is:

```text
Fielora Agent
├── Model
├── Harness
└── Tools
```

No fourth top-level Agent layer may be introduced without deliberately revising
this specification.

---

# 2. Architecture principles

## 2.1 Agent = Model + Harness + Tools

### Model

The Model provides intelligence: understanding, reasoning, generation,
judgment, candidate planning, and candidate action selection.

### Harness

The Harness controls how intelligence is used to complete real work. It owns
bounded context, work scope and goals, continuity, orchestration, governance,
execution control, persistence semantics, recovery, verification, evidence,
and individualized disposition semantics.

### Tools

Tools provide concrete external capabilities such as filesystem, process, Git,
browser, search, APIs, MCP, local applications, and document manipulation.

## 2.2 Product and infrastructure are not extra Agent layers

```text
Human / Environment
        ↓
Fielora Product
Project / Conversation / Workspace / Browser / UI / Field / Inbox
        ↓ FIPC
Fielora Agent
Model ↔ Harness ↔ Tools
        ↓
OS / Files / Processes / Git / Web / Apps / APIs
```

React, Electron, FIPC, SQLite, Windows Credential Manager, Tokio, and
WebContentsView are implementation infrastructure. Project/Field Reality and
DXE are product concepts. None is a fourth Agent layer.

---

# 3. Model

## 3.1 Responsibility

The Model layer is the source of model intelligence and remains Provider-neutral
from the Harness perspective.

Its semantic responsibilities are:

```text
Model
├── Language Understanding
├── Current Intent Understanding
├── Referent Resolution
├── Reasoning
├── Planning
├── Knowledge
├── Coding
├── Search Strategy
├── Evidence Interpretation
└── Tool-call Proposal
```

The permanent ownership split is:

```text
Current Human Understanding
→ Model

Persistent human-specific understanding
→ Harness.IDR
```

```text
Model
├── Provider-neutral requests, messages and turns
├── Provider interface
├── Provider adapters
│   ├── OpenAI Responses
│   ├── Anthropic Messages
│   └── OpenAI-compatible Chat Completions
├── Model behavior profiles
└── Normalized stream/events
    ├── STARTED
    ├── OUTPUT_TEXT_DELTA
    ├── USAGE
    ├── COMPLETED
    ├── CANCELLED
    └── FAILED
```

Current implementation:

- `crates/fielora-model`: `ModelClient`, `ProviderEndpoint`,
  `AgentModelRequest`, `AgentModelTurn`, adapter serialization, stream
  accumulation, capability metadata, error mapping, cancellation, and bounded
  model behavior hints.
- `crates/fielora-contracts`: Provider-neutral invocation DTOs, normalized
  events, tool definitions, and stable Provider kinds.

## 3.2 Provider neutrality

Fielora MUST NOT create GPT Agent Core, Claude Agent Core, Qwen Agent Core,
DeepSeek Agent Core, or equivalent Provider-specific Agents.

```text
              Harness
                 │
          Model interface
                 │
    ┌────────────┼────────────┐
    │            │            │
 OpenAI      Anthropic    Compatible
```

Provider-specific differences may exist only in adapters, capability facts, or
bounded behavior profiles. They cannot create independent permissions,
AgentRun state, tools, verification, persistence, or completion authority.

`CodingBehaviorProfile` and `china-coding-v1` are Model-facing behavior
hints. They do not grant tools, permission, execution authority, Semantic
Authority, or verification authority.

The Model may be GPT, Claude, Qwen, Gemini, DeepSeek, or another compatible
model. Provider and Model identity never own Fielora Agent identity, Project or
Reality identity, permission, or verification authority.

---

# 4. Harness

The Harness is the control system of the Fielora Agent. Its eight functional
domains are logical ownership boundaries; they do not require one crate,
service, or database table per domain.

```text
Harness
├── 1. Ingress & Context
├── 2. Work Scope & Goal
├── 3. Continuity
├── 4. Orchestration
├── 5. Governance
├── 6. Execution
├── 7. Verification & Evidence
└── 8. IDR
        Individualized Disposition Runtime
```

`Adaptation` is not a top-level Harness domain. It has no independent state,
authority, or lifecycle in the current architecture. Context-based adjustment
belongs to Ingress & Context; restart/history to Continuity; retry and failure
adjustment to Orchestration; outcome correction to Verification & Evidence;
model-specific behavior to Model/Harness Profiles; and human personalization
to IDR. Do not create an Adaptation Runtime.

## 4.1 Ingress & Context

Question: what should the Model know now?

Ingress & Context decides what the current model invocation may see and compiles
a bounded model context. Inputs may include:

```text
User Request
Agent Profile
Project / Conversation Context
Relevant Files
Attachments
Skills
Tool Observations
Web Evidence
Memory Retrieval Projection
IDR Projection
Individualized Direction
```

Responsibilities include:

- user, Conversation, file/attachment, system, time, and external inputs;
- ingress validation, normalization, trust classification, and admission;
- project indexing, relevant-file retrieval, bounded selection, stable and
  dynamic context, hashing, and future compression;
- relevance ranking, budgeting, redaction, context compilation, and context
  snapshot creation.

Current implementation:

- `ContextCompiler` and repository index in `crates/fielora-agent`;
- input and attachment admission in `AgentCoordinator`;
- `AgentContextSnapshotView` and snapshot persistence in
  `fielora-contracts` / `fielora-storage`.

Agent Profile, Memory, and IDR are context sources. Ingress & Context does not
own the Human Model, Memory authority, Project Reality, permission, or
execution. Orchestration or the Model may request retrieval, but the Harness
retains final context admission.

## 4.2 Work Scope & Goal

Question: what are we working on now?

This domain owns the current Agent task/run boundary, including:

```text
ProjectRef
ConversationRef
AgentRunRef
Current Task
Current Goal
Working Scope
Mandate
Selected Resources
Mutation Boundary
Execution Boundary
Explicit Exclusions
```

It may also evolve Goal definition, provenance, hierarchy, status, revision,
priority, and commitment when Stable Long Tasks require those semantics.

`Workspace` and `Work Scope` are different:

```text
Workspace
→ long-lived product/work container
→ answers: where am I working?
→ Projects / Conversations / Library / Settings / other durable product state

Work Scope
→ current Agent task/run boundary
→ answers: what exact range are we handling this time?
→ Project / Task / allowed and excluded surfaces / verification scope
```

One Workspace or Project may host several concurrent Work Scopes. Workspace
must not replace Work Scope.

Current implementation:

- stable Project/Field, Conversation, and AgentRun references; Message and
  Provider identities remain product/configuration facts and do not own Work
  Scope or Reality;
- an `AgentRun.task` description and durable Run status;
- completion evaluation in the Harness, separate from model self-report.

Remaining gap: Fielora has no complete long-lived Goal/Task model. Stable Long
Tasks may extend this domain only when product behavior requires it. This
specification does not authorize empty Goal/Task, WorkScope, or identity tables
or services.

## 4.3 Continuity

Question: where did this ongoing work leave off?

Responsibilities include Agent/Task/Execution state, persistence, AgentRun,
Agent Events, ToolCalls, Approvals, Context Snapshots, Verification Receipts,
Conversation binding and history, checkpoint, resume, recovery, replay, and
reconciliation after pause, Approval, crash, or restart.

Current implementation:

- `agent_runs`, `agent_events`, `agent_context_snapshots`,
  `agent_tool_calls`, `agent_approvals`, and
  `agent_verification_receipts` in schema 6;
- `StorageWorker` and the corresponding methods in `fielora-storage`;
- Conversation messages;
- startup reconciliation of incomplete tools to `UNKNOWN` and active Runs to
  `PAUSED`;
- cooperative safe-boundary pause, durable resume/cancel, pending Approval
  restoration, and terminal-state non-reexecution;
- effect-aware `UNKNOWN` reconciliation: retry-safe reads, contained file/hash
  inspection, fresh verification after interrupted checks, and fail-closed
  Git/network/destructive handling;
- verification receipts bound to the current workspace mutation revision, plus
  receipt-backed duplicate side-effect suppression;
- in-memory transcript/context caches for an active process.

The immutable Agent Event ledger is durable history, not a claim that the whole
product uses Event Sourcing:

```text
Durable events ≠ durable execution
```

Stable long-running execution must build on this ledger and projection model
rather than replace it.

Continuity holds work history; it does not own the long-term Human Model,
general memory learning, or current Project Reality.

## 4.4 Orchestration

Question: what happens next?

Responsibilities include the Agent loop, task decomposition, planning and
replanning, model invocation/routing, tool selection/orchestration, retry
strategy, phase transition, task mode, step budget, completion attempt,
recovery routing, bounded sub-agent orchestration, and Harness strategies.

A typical Run may flow as:

```text
Understand
→ Inspect
→ Act
→ Observe
→ Verify
→ Review
→ Complete
```

Current implementation:

- `AgentCoordinator` and the general Agent loop in
  `crates/fielora-core/src/agent_runtime.rs`;
- task classification and phase-aware tool exposure;
- bounded model calls, evidence supplementation, ChangeSet correction, and
  patch-conflict recovery;
- the bounded read-only child AgentRun;
- the current `CODING_V0.1` Harness Profile.

`FAST_EDIT_ADAPTIVE_V1` is a strategy of `CODING_V0.1`. It is not a Model
adapter, independent Agent, independent Core, or top-level architecture.

Orchestration may decide what information is needed next, whether to invoke the
Model again, which candidate Tools to expose, and when to retry. It does not own
permission, Approval authority, the Human Model, or verification truth.

## 4.5 Governance

Question: what may the Agent do?

Responsibilities include:

- `PolicyEngine`;
- Goal, capability, resource, mandate, and execution authority;
- permission presets;
- Approval Routing;
- Semantic Authority;
- risk and budget;
- Work Scope and Mandate enforcement;
- credential ordering and execution invariants;
- project-root containment, symlink escape protection, sensitive paths, SHA
  write protection, command risk, and Git safety;
- revision, fences, and idempotency.

Current implementation:

- `PolicyEngine` in `fielora-agent`;
- permission and effect contracts in `fielora-contracts`;
- approval lifecycle and replay nonce in `AgentCoordinator` /
  `fielora-storage`;
- invariant enforcement in the concrete Tool executor;
- completion and verification gates in `AgentCoordinator`.

Permission, Approval Routing, and Semantic Authority are independent.
Provider/model output and tool availability cannot self-grant any of them.

```text
Model proposes
    ↓
Governance
ALLOW / ASK / DENY
```

Preference, IDR, Skill, Provider, and Tool metadata are not permission
authority. Even a well-supported user preference for automatic action cannot
expand the current Mandate or Approval boundary.

`FULL_CONTROL` may change Approval Routing for an otherwise permitted action.
It does not disable containment, symlink protection, sensitive-path denial,
SHA guards, force/destructive restrictions, receipt requirements, or fresh
verification.

## 4.6 Execution

Question: how is an approved action carried out?

Responsibilities include:

- AgentRun and ToolCall lifecycle;
- prepared, started, waiting, succeeded, failed, cancelled, and unknown states;
- tool dispatch;
- scheduling, queueing, concurrency, cancellation, timeout, pause/resume,
  recovery, and reconciliation.

This is the architectural home of Agent Runtime:

```text
Agent Runtime ∈ Harness.Execution
```

Current implementation:

- lifecycle, launch, cancel, resume, approval continuation, dispatch, and
  recovery in `AgentCoordinator`;
- Tokio and cancellation tokens as infrastructure;
- durable ToolCall/Run projection transitions in `fielora-storage`;
- process-tree cancellation enforcement in the concrete Tool executor.

`BrowserRuntime`, `WorkspaceRuntime`, and the historical Rust
`ToolRuntime` are Tool or product capability backends. They are not Agent
Runtime and are not a fourth layer.

The single execution chain is:

```text
Model ToolCall
↓
Harness Validation
↓
Governance
↓
Approval if required
↓
Execution
↓
Tool / selected backend
↓
Typed Result
```

File, Process, Git, Browser, Web, MCP, API, CLI, Native, and Plugin-contributed
Tools must all enter through this chain. Provider, MCP, and Plugin integration
must not create a second Agent execution path.

## 4.7 Verification & Evidence

Question: what proves the work is actually done?

Responsibilities include completion criteria; test/build/typecheck/lint/diff
and behavioral validation; Tool Receipts; Verification Receipts; action
evidence; context/file hashes; revision; audit; reconciliation; and replay
evidence.

Current implementation:

- typed receipts returned by the concrete executor;
- receipt and lifecycle recording by `AgentCoordinator` /
  `fielora-storage`;
- recognized verification-command classification;
- durable Verification Receipts;
- mutation tracking and verification invalidation;
- FAST_EDIT ChangeSet, diff, and verification invariants;
- completion calculation independent of model text.

The permanent ordering is:

```text
Mutation
   ↓
Fresh verification
   ↓
Verified result
```

A successful generic process is not verification. Old verification cannot
prove a newer mutation. A restored Run may rebuild verification state only from
a successful receipt explicitly marked `verification_eligible` at execution.

The permanent rule is:

```text
Tool Success ≠ Task Success

Verification PASS
↓
Relevant state mutates
↓
Verification STALE
↓
must verify again
```

Provider, Search, MCP, Git, or generic Tool success cannot independently create
a Verification PASS.

## 4.8 IDR — Individualized Disposition Runtime

Question: what kind of person am I serving?

IDR is the Harness domain for a long-lived, correctable Human Model of the
installation's primary human. Its conceptual structure is:

```text
IDR
├── Human Model
│   ├── Explicit Facts
│   ├── Explicit Preferences
│   ├── Behavioral Observations
│   ├── Inferred Dispositions
│   ├── Long-term Goals
│   ├── Working Style
│   ├── Communication Style
│   ├── Decision Style
│   ├── Risk Disposition
│   └── Feedback
├── Provenance
├── Scope
├── Confidence
├── Lifecycle
├── Disposition Resolution
└── Individualized Direction
```

Fact, Observation, Preference, and Inference are distinct. An inference must
never impersonate an explicit human fact. A disposition has at least conceptual
scope, confidence, provenance, and lifecycle.

IDR's core runtime output is `Individualized Direction`:

```text
Disposition
= what this person generally tends to prefer

Direction
= how the Agent should adapt in this current situation

Decision
= the final concrete choice made by the Model / Agent
```

For example, dispositions such as `change_scope=minimal_delta`,
`testing=targeted_first`, `communication=concise`, and
`architecture=preserve_existing` may yield direction to prefer a bounded
change, avoid unrelated refactoring, verify the affected surface first, and
communicate concisely. IDR does not issue an authoritative concrete Tool
execution decision.

IDR does **not** own general reasoning, open-ended current-language
interpretation, task planning, Tool selection authority, Permission, Approval,
Execution, Verification, Reality, or final decision authority. It cannot become
a second Agent or a second LLM.

Current implementation has the schema-12 storage-only Human Model Candidate in
the existing Fielora SQLite authority and `fielora-storage::idr`; it has no
Resolver, Direction/Learning stage, Context integration, FIPC/UI, or independent
IDR service/Runtime module. Storage implementation does not authorize those
missing behaviors, `HumanProfileId`, a Memory index, or an empty physical module.

Detailed semantic, lifecycle, projection, privacy, and Eval design is tracked
in `FIELORA_IDR_V2_DESIGN_CANDIDATE.md`. Its status is
`DRAFT / CANDIDATE / NOT FROZEN`; it does not authorize Contract freeze,
Resolver Runtime, Context integration, or UI implementation.

The minimum semantic Contract Review is tracked in
`FIELORA_IDR_V2_CONTRACT_CANDIDATE.md`. The storage mapping is an implemented
Candidate; Resolver input/output and Context Admission are implementation-ready
Candidates in their dedicated review documents, but remain unimplemented and
unauthorized.

---

# 5. Supporting and cross-cutting concepts

## 5.1 Agent Profile

Agent Profile is a thin, Fielora-owned, versioned, bundled product definition.
It answers `Who am I?` and is neither a top-level Harness domain nor a Runtime.

```text
AgentProfile
├── name
├── product
├── role
├── purpose
├── stable capability semantics
├── semantic boundaries
└── profile version
```

For the product-level identity, `name = Fielora`, `product = Fielora`, and
`role = local AI workspace agent`. When a human asks `Who are you?`, product
semantics answer first that this is the AI Agent in Fielora. Provider/Model is
reported when the human asks which Model is currently in use.

```text
Fielora Agent Identity
≠ underlying Model Identity

Agent Profile
↓
Ingress & Context
↓
System Context
↓
Model
```

`I am Fielora` is a versioned product fact. It is not learned Memory and must
not live in IDR, vector memory, Conversation memory, or a preference store. The
current product does not implement a distinct Agent Profile Runtime; this
specification does not authorize one.

## 5.2 Memory Domain

Memory is a cross-cutting domain, not a ninth Harness part and not an
independent `Memory Brain` or Runtime. Its meanings are distributed by owner:

| Memory meaning | Semantic owner |
|---|---|
| Working Memory — current Run work state | Orchestration + Continuity |
| Episodic Memory — Conversation, AgentRun, Events, ToolCalls, Approvals, Verification, Snapshots | primarily Continuity |
| Human-specific long-term Memory — preferences, patterns, goals, feedback | IDR |
| Current Project/Artifact/Decision/Reality facts | Reality / Product state, **not Memory** |

The priority rule is:

```text
Current Reality
>
verified/current durable facts
>
historical memory
>
learned/inferred memory
```

Memory Retrieval is primarily consumed through Ingress & Context:

```text
Current Request
↓
retrieve relevant history
↓
Memory Projection
↓
Ingress & Context
↓
Model
```

The Model or Orchestration may request retrieval; the Harness still performs
admission, ranking, budgeting, and redaction before material reaches the Model.

## 5.3 Entry Intent Resolver — superseded IDR terminology

The bounded Phase 04 capability formerly called `Bounded IDR` or simply `IDR`
for `ASK / CAPTURE / PROMOTE / CONTINUE` routing is now named:

```text
Entry Intent Resolver
```

It answers only which current product flow a user input enters. Current intent
understanding and referent resolution remain Model responsibilities, while
bounded product-flow constraints and context admission remain Harness
responsibilities. Entry Intent Resolver and Individualized Disposition Runtime
are different capabilities.

Historical Candidate, Freeze, Contract, Timeline, and Evidence documents keep
the terminology used at the time. Their old `Bounded IDR` / intent-routing
meaning is `HISTORICAL / SUPERSEDED TERMINOLOGY`; it must not be read as the
current IDR domain and must not be rewritten to imply the new IDR existed then.

## 5.4 Local primary human assumption

The current and foreseeable primary path is:

```text
Local Fielora Installation
        │
        └── Primary Human
```

Do not add Tenant Identity, Organization Identity, an enterprise principal
directory, multi-user subject runtime, Aegis-style full Identity Authority, or
identity-delegation Runtime. IDR V2 uses the database-local primary-human singleton
and no `HumanProfileId`. Multi-user, remote execution, enterprise accounts, or
cross-device profiles require a separate Change Impact and later Contract version.

## 5.5 Aegis

Aegis MUST NOT become a second Core, Harness, Runtime, state system, permission
system, evidence system, identity system, or persistence system.

Future Aegis work may strengthen Work Scope & Goal, Continuity, Governance,
Execution, and Verification & Evidence. Its Identity, Delegation, Will, Goal,
Permission, and multi-entity work contributes only the authority-separation
principles currently needed:

```text
Identity ≠ Permission
Preference ≠ Permission
Delegation ≠ Identity transfer
Tool success ≠ Verification
Model proposal ≠ Authority
```

Trusted ingress, authority, risk, budget, Approval, revision, fence,
idempotency, recovery, reconciliation, receipts, audit, and replay must reuse
Fielora-owned AgentRun, event, policy, execution, and evidence boundaries.
Fielora does not currently copy a complete Aegis Identity Runtime.

## 5.6 AG-UI

If adopted, AG-UI is an interaction protocol adapter:

```text
Fielora UI ↔ AG-UI adapter ↔ Harness
```

It may cross Ingress & Context, Continuity, Governance, Execution, and
Verification & Evidence. Its state is a projection. Rust Core and Fielora-owned
durable storage remain authoritative.

## 5.7 DXE

DXE belongs to the Product/Workspace layer. It may consume Goal, state,
activity, and capability projections from the Harness to compose fixed working
surfaces. It does not become the Agent orchestrator, policy engine, or durable
source of truth.

---

# 6. Tools

## 6.1 Responsibility

Tools provide concrete action capabilities:

```text
Tools
├── Filesystem
│   ├── list / read / search / stat
│   ├── create / write / replace / patch
│   └── move / delete / restore
├── Process
├── Git
├── Browser
├── Search
├── Web
├── MCP / API / CLI / Database
├── Native / Local applications
├── Plugin-contributed Tools
└── Artifact capabilities
```

Tools do not decide why an action occurs, own permission policy, or determine
task completion. They execute an authorized typed capability and return typed
results/receipts.

## 6.2 Current Tool execution boundary

The current split is:

```text
Harness
└── AgentCoordinator
    ├── tool selection and dispatch
    ├── PolicyEngine integration
    ├── Approval lifecycle
    ├── ToolCall lifecycle
    ├── receipt persistence
    └── verification/completion interpretation
              │
              ▼ ToolExecutor
Tools
└── ToolRuntime (historical name)
    ├── typed argument parsing
    ├── filesystem execution
    ├── process execution
    ├── typed Git execution
    ├── containment and integrity invariants
    └── typed receipt/observation creation
```

`ToolExecutor` in `crates/fielora-agent` is the actual interface boundary.
`ToolRuntime` is retained to avoid an unnecessary rewrite. It does not persist
ToolCall lifecycle, decide permission, route Approval, or mark a Run complete.

`delegate_readonly` is intercepted by `AgentCoordinator`; it is Harness
sub-agent orchestration exposed through the model tool protocol, not an
external-world Tool backend.

## 6.3 Desktop Tool backends

```text
Browser capability → BrowserRuntime → isolated WebContentsView

Filesystem / Process / Local App product capability
    → WorkspaceRuntime + narrow Electron Main handlers
    → OS / filesystem / child process / installed applications
```

`BrowserRuntime` is the Browser Tool backend. Today it is used by the product
Browse surface; no Browser Agent tool catalog is implemented in this change.

`WorkspaceRuntime` and its narrow Electron Main handlers are the Desktop
backend for user-initiated filesystem, process, and local-app capabilities.
The current autonomous Coding Agent executes project tools inside the Rust
sidecar through `ToolExecutor`; it does not bypass the Harness by calling the
Renderer or trusting UI state.

These backend runtimes are not the Agent Runtime.

---

# 7. Harness Profiles

Fielora does not create an independent Agent Core for each task category.

```text
                 Harness Core
                      │
                Coding Profile
                      │
       FAST_EDIT / Focused Edit / General loop
```

All profiles must reuse AgentRun, state, governance, execution lifecycle,
persistence, evidence, Model interface, and Tool interface.

## 7.1 Current Coding Harness Profile

`CODING_V0.1` is the only current Harness Profile. It configures:

- repository and bounded task context;
- inspect/change/verify orchestration;
- file, process, and Git governance;
- project Tool execution;
- test/build/typecheck/lint/diff/hash verification.

Current strategies:

- `FAST_EDIT_ADAPTIVE_V1`;
- `FOCUSED_EDIT_V1`;
- `GENERAL_AGENT_LOOP_V1`.

The selected Profile and strategy are recorded as durable `RUN_STARTED`
facts. Provider behavior profiles remain separate facts.

## 7.2 Future Profiles

Research, Browser, Document, Data, Creative, and other profiles may be added
only with corresponding real product functionality. This baseline does not
authorize empty profile services, directories, tables, or placeholder
implementations.

One AgentRun may use multiple profiles in the future without changing its
identity. Profiles are execution configurations, not separate Agents unless
explicit delegation creates a child AgentRun.

---

# 8. Product object model and source of truth

Current product ownership remains:

```text
Workspace
├── Projects
│   ├── Local folder
│   ├── Conversation *
│   │   ├── User / Assistant messages
│   │   └── AgentRun *
│   │       ├── Context snapshots
│   │       ├── Durable events
│   │       ├── Tool calls
│   │       ├── Approvals
│   │       └── Verification receipts
│   ├── Files / Changes / Review
│   ├── Terminal
│   └── Provider / Model selection
├── Conversations
├── Library
├── Settings
└── other durable product state
```

Project currently retains Field identity compatibility. This baseline does not
require its removal.

Future Goal/Task identity may be introduced only when Stable Long Tasks require
it; do not add unused tables or abstractions now.

Field/Reality describes what Fielora believes about the user's work. Agent
architecture describes how the Agent performs work. Reality may provide
authoritative context to the Harness; it does not replace Harness state.

Reality identity remains Fielora-owned:

```text
Field / Project / Artifact Reality identity
is Fielora-owned

Provider / Model / Conversation / AgentRun
cannot become Reality identity owner
```

Reality Identity is distinct from human identity, Agent Profile, and the IDR
Human Model. Renaming `Identity & Goal` to `Work Scope & Goal` does not remove
or weaken any existing Reality Identity principle.

For durable Agent state:

```text
Rust Core / SQLite
        ↓ projection
FIPC / future AG-UI adapter
        ↓
Renderer
```

The Renderer cannot invent successful execution or verification.

---

# 9. Mandatory dependency rules

1. Model MUST NOT call Tools directly: `Model → Harness → Tools`.
2. Tools MUST NOT call Models.
3. Tools return typed facts; they do not independently change Harness semantic
   state, memory, progress, evidence, or completion.
4. Provider adapters MUST NOT implement independent permission semantics.
5. UI MUST NOT bypass Harness Governance for Agent actions.
6. Harness Profiles MUST reuse Harness Core.
7. Aegis MUST extend Harness domains rather than create parallel systems.
8. IDR provides Individualized Direction and does not plan, authorize, execute,
   verify, or own Reality.
9. DXE consumes work state and does not orchestrate the Agent.
10. AG-UI is an adapter and not a source of truth.
11. Backend runtime naming does not create a new Agent layer.
12. Tool availability, model output, execution success, and Semantic Authority
    remain distinct.
13. Memory is cross-cutting and must not become an independent Agent layer or
    ninth Harness domain.
14. Agent Profile is a bundled product definition and must not become Memory or
    a Runtime.
15. Workspace and Work Scope remain distinct.

---

# 10. Current repository mapping

| Architecture | Current implementation and exact ownership |
|---|---|
| Product UI | React renderer; starts, steers, stops, approves, and renders projections |
| Desktop Host | Electron Main; FIPC supervision, trusted Desktop integration, Browser and Workspace backends |
| Model | `fielora-model` plus Provider-neutral DTOs in `fielora-contracts` |
| Harness composition | `fielora-core/src/agent_runtime.rs` |
| Ingress & Context | input admission in `AgentCoordinator`; `ContextCompiler` in `fielora-agent`; snapshots in storage |
| Work Scope & Goal | Project/Conversation/AgentRun refs and Run task in contracts/storage; complete Goal/WorkScope model deferred |
| Continuity | AgentRun/Event/ToolCall/Approval/Context/Verification persistence in `fielora-storage`; reconciliation in storage + coordinator |
| Orchestration | `AgentCoordinator`, model loop, Coding Profile/strategies, bounded retry and read-only child AgentRun |
| Governance | `PolicyEngine`, permission/effect contracts, Approval routing/nonce, executor invariants, completion authority |
| Execution | coordinator lifecycle/dispatch/cancel/resume; Tokio infrastructure; ToolCall projection; process cancellation |
| Verification & Evidence | Tool/Verification receipts, mutation invalidation, diff/test gates, completion evaluation |
| IDR | schema-12 Human Model storage Candidate implemented in existing `fielora-storage`; Resolver/Direction/Learning/Context integration not implemented |
| Entry Intent Resolver | historical Phase 04 bounded product-flow routing semantics; no independent IDR runtime |
| Agent Profile | bundled/versioned product definition required by architecture; distinct runtime not implemented |
| Memory Domain | cross-cutting ownership across Continuity, Orchestration, IDR, and Reality; no independent Memory Runtime |
| Agent coding Tool interface | `ToolExecutor` |
| Agent coding Tool implementation | Rust `ToolRuntime`: Filesystem/Process/Git and bounded capability inspection |
| Browser Tool backend | Electron `BrowserRuntime`; Agent Browser profile/tools not implemented |
| Desktop Workspace Tool backend | Electron `WorkspaceRuntime` plus narrow Main handlers; not the autonomous Agent source of truth |
| Durable infrastructure | SQLite held by `StorageWorker` |
| Secrets infrastructure | Windows Credential Manager |
| Core process supervision | Electron `CoreProcessSupervisor`; product infrastructure, not Harness orchestration |

The crate name `fielora-agent` is historical and intentionally mixed at the
physical package level: it contains reusable Harness primitives and the current
Tools executor. The `ToolExecutor` interface and ownership rules above are the
boundary; a broad crate/directory rewrite is not required.

The frozen historical `CORE_CONTRACTS_V0.1.md` term
`CodingAgentProvider` describes an adapter to a coding-agent harness/session,
not a Model Provider and not authorization for a parallel Fielora Agent Core.
Any future reuse of that contract must enter through the canonical Harness and
reuse its Governance, Continuity, Execution, and Evidence.

---

# 11. Current gaps

## Work Scope & Goal

- explicit long-lived Goal/Task model;
- provenance, hierarchy, authority, revision, and commitment.
- first-class Work Scope representation beyond current Project/Conversation/
  AgentRun/task references.

## Continuity

- mature checkpoint selection and durable background scheduling;
- richer user-assisted reconciliation for ambiguous/high-risk external effects;
- multi-attempt history beyond the current explicit, classified retry facts.

## Execution

- preemptive suspension inside arbitrary third-party operations (current pause
  is cooperative at safe receipt/model/context boundaries);
- durable queueing/scheduling;
- timeout/budget policy beyond existing bounded model/process execution.

## IDR

- deterministic Resolver Runtime over the implemented typed Human Model snapshot;
- separate bounded Context Admission and future Individualized Direction;
- future governed proposal/learning behavior and user inspection/correction surface.

IDR V2 storage exists, but Resolver/Context/Direction/Learning/UI remain unimplemented.
The reviewed Resolver Contract does not authorize code, a new schema, a Memory index,
`HumanProfileId`, an IDR service, or a parallel Runtime.

## Supporting concepts

- versioned bundled Agent Profile projection;
- cross-cutting Memory retrieval/admission semantics without a Memory Runtime.

## Tools

- true PTY;
- Browser Agent tools;
- Search/MCP production adapters;
- Office/PDF/Archive/Image and richer app integration.

These gaps do not justify new Agent cores or empty placeholders.

---

# 12. Incremental alignment strategy

## Phase A — current alignment

- adopt this specification;
- map current modules to Model/Harness/Tools and Harness domains;
- make the Coding Profile and Tool execution interface explicit;
- preserve behavior and invariants;
- remove contradictory terminology from active documents.

## Phase B — evidence-driven cleanup

Only when a real implementation pressure exists, continue separating Model
adapters, Harness orchestration/governance/execution, Tool executors/backends,
and persistence infrastructure. Do not refactor for directory symmetry.

## Phase C — Harness strengthening

Strengthen in this order as product work demands it:

```text
Execution lifecycle
→ Continuity
→ Work Scope & Goal
→ Governance / Aegis semantics
→ Evidence / Reconciliation
```

IDR, Agent Profile, and richer Memory retrieval enter only alongside explicit
product behavior and a separate reviewed Change Impact; architecture symmetry
alone is not implementation pressure.

## Phase D — new Profiles

Add a Profile only alongside its first real product workflow.

---

# 13. Architecture invariants

1. Agent = Model + Harness + Tools.
2. Harness is Provider-neutral.
3. Tools provide capabilities; they are not autonomous decision makers.
4. Model output is not authority.
5. Tool availability is not permission.
6. Permission is not Approval Routing and is not Semantic Authority.
7. Full access does not disable invariant safety.
8. State and evidence belong to Fielora, not a model Provider.
9. Durable events do not imply whole-product Event Sourcing.
10. UI state is not authoritative Agent state.
11. Project-root containment and symlink escape protection remain active.
12. Sensitive-path and SHA write guards remain active.
13. Every executed Tool call returns a typed result/receipt or an explicit
    failure/unknown state.
14. Verification must follow mutations.
15. Old verification cannot prove newer mutations.
16. A successful generic process is not verification.
17. A started Tool without a final receipt becomes `UNKNOWN`; it is neither
    assumed successful nor replayed without effect-aware reconciliation.
18. A Run with a workspace mutation cannot complete unless a successful,
    verification-eligible receipt matches the current workspace revision.
19. Aegis strengthens Harness; it does not create another Core.
20. IDR models human-specific dispositions and produces Individualized
    Direction; it does not decide, authorize, execute, verify, or own Reality.
21. DXE composes Product work surfaces; it does not replace Harness.
22. AG-UI is an interaction adapter, not durable truth.
23. New task categories use Harness Profiles.
24. Future capabilities extend this architecture instead of bypassing it.
25. Adaptation is not a top-level Harness domain or Runtime.
26. Memory is cross-cutting and current Reality outranks all Memory.
27. Agent Profile is a Fielora-owned product fact, not Model identity or Memory.
28. Workspace is a long-lived product container; Work Scope is a current
    task/run boundary.
29. Provider, Model, Conversation, and AgentRun cannot own Reality identity.
30. Preference is not Permission, and Delegation is not Identity transfer.

---

# 14. Rule for every future Agent feature

Every proposal must answer:

1. Is it Model, Harness, or Tool?
2. If Harness, which of the eight domains owns it?
3. Is it Harness Core behavior or Profile behavior?
4. Does an existing component already own the responsibility?
5. Does it accidentally create a second state system, permission system,
   Runtime, Agent loop, Provider-specific Agent Core, evidence system, or
   persistence system?

If the last answer is yes, revise the design before implementation.

---

# 15. Semantic responsibility lock

```text
Agent Profile
→ Who am I?

IDR
→ What kind of person am I serving?

Work Scope & Goal
→ What are we working on now?

Ingress & Context
→ What should the Model know now?

Continuity
→ Where did this ongoing work leave off?

Orchestration
→ What happens next?

Governance
→ What may the Agent do?

Execution
→ How is the approved action carried out?

Verification & Evidence
→ What proves the work is actually done?

Memory Domain
→ What past information remains retrievable and how is it used?

Reality
→ What does Fielora currently recognize as the authoritative work state?
```

---

# 16. Canonical framework diagram

```text
FIELORA

└── Fielora Agent
    │
    ├── Model
    │   └── General intelligence /
    │       semantic understanding /
    │       reasoning / planning
    │
    ├── Harness
    │   │
    │   ├── Ingress & Context
    │   │     ├── Agent Profile projection
    │   │     ├── Work context
    │   │     ├── Project / repository context
    │   │     ├── Skill / evidence context
    │   │     ├── Memory retrieval projection
    │   │     └── IDR projection
    │   │
    │   ├── Work Scope & Goal
    │   ├── Continuity
    │   ├── Orchestration
    │   ├── Governance
    │   ├── Execution
    │   ├── Verification & Evidence
    │   │
    │   └── IDR
    │       Individualized Disposition Runtime
    │       ├── Human Model
    │       ├── Observation
    │       ├── Preference
    │       ├── Disposition
    │       ├── Goal / Style / Feedback
    │       ├── Scope
    │       ├── Confidence
    │       ├── Provenance
    │       ├── Lifecycle
    │       ├── Disposition Resolution
    │       └── Individualized Direction
    │
    └── Tools
        ├── Built-in
        ├── Web
        ├── MCP
        ├── API
        ├── CLI
        ├── Native
        └── Plugin-contributed Tools

Supporting / cross-cutting:
Agent Profile → Fielora-owned stable self definition
Memory Domain → cross-cutting historical / retrieval semantics
```

---

# 17. Summary

> **Model provides intelligence.
> Harness governs and orchestrates intelligence.
> Tools provide real capabilities.**

Fielora's Product layer preserves Project, Conversation, Workspace, Field
Reality, and human interaction above that Agent. All subsequent V0.1 Agent work
must extend this baseline.
