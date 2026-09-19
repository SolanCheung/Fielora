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

The frozen implementation keeps the schema-12 Human Model in the existing Fielora
SQLite authority and `fielora-storage::idr`; the pure deterministic Resolver and
trusted production builders live beside Harness composition in `fielora-core`; and
bounded Context Admission and `ContextCompiler` remain in `fielora-agent`. The existing
`AgentCoordinator` composes these owners into AgentRun startup, ephemeral invalidation,
fail-soft behavior, existing Context Snapshot evidence, and the primary Model request.
There is no FIPC/UI, independent IDR service/Runtime, `HumanProfileId`, Memory index,
second Coordinator, second ContextCompiler, or second Model/classifier stream.

`FIELORA_IDR_V2_FINAL_ARCHITECTURE_CLOSEOUT.md` closes all remaining V2
architecture questions. Production integration is coordinated by Harness composition;
`NormalizedResolutionContextBuilderV1` assembles only trusted structured state;
free-form current constraints and acquisition proposals reuse the primary Model stream
without a second classifier call; unresolved inputs omit personalization and the generic
Agent continues. V2 Individualized Direction is the bounded, non-authoritative semantic
projection admitted into Context, not a separate Model, durable object, service, or
Runtime stage.

Detailed semantic, lifecycle, projection, privacy, and Eval design is tracked
in `FIELORA_IDR_V2_DESIGN_CANDIDATE.md`. Its status is
`DRAFT / CANDIDATE / NOT FROZEN`; that design document did not itself authorize
Contract freeze, Resolver Runtime, Context integration, or UI implementation. The
later Resolver execution instruction separately authorized the implemented Candidate
described below.

The minimum semantic Contract Review is tracked in
`FIELORA_IDR_V2_CONTRACT_CANDIDATE.md`. Storage, Resolver, Context Admission,
production Agent Context integration, explicit acquisition, bounded Observation and
Disposition Candidate creation, activation/correction/forget, Agent Profile projection,
restart/recovery, and controlled OFF/ON Eval are implemented and targeted validated.
The Final Architecture Closeout records the evidence-backed V2 Freeze; later changes do
not require another architecture review while they preserve these authority boundaries.

---

# 5. Supporting and cross-cutting concepts

## 5.1 Agent Profile

Agent Profile is a thin, Fielora-owned, versioned, bundled product definition.
It answers `Who am I?` and is neither a top-level Harness domain nor a Runtime.

The V2 minimum projection is `FieloraAgentProfileV1`: `name=Fielora`,
`product=Fielora`, `role=local AI workspace agent`, a bounded purpose, stable semantic
boundaries, and `profile_version`. It enters Ingress & Context as stable self-definition.
Provider/Model identity remains separate and cannot alter this profile.

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
Browse surface and the bounded Agent browser tools described in section 22.

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
- `GENERAL_AGENT_LOOP_V3` (continuous execution; supersedes V2 for new General runs).

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
| IDR | frozen schema-12 Human Model storage in `fielora-storage`; pure deterministic Resolver, trusted builders, production composition, acquisition, and Eval in `fielora-core`; bounded Context Admission in `fielora-agent`; existing Coordinator/ContextCompiler/Context Snapshot only, with no second Runtime or Model stream |
| Entry Intent Resolver | historical Phase 04 bounded product-flow routing semantics; no independent IDR runtime |
| Agent Profile | bundled/versioned/code-owned `FieloraAgentProfileV1` projected through existing Ingress & Context; no distinct Profile Runtime by design |
| Memory Domain | cross-cutting ownership across Continuity, Orchestration, IDR, and Reality; no independent Memory Runtime |
| Agent coding Tool interface | `ToolExecutor` |
| Agent coding Tool implementation | Rust `ToolRuntime`: Filesystem/Process/Git and bounded capability inspection |
| Browser Tool backend | Electron `BrowserRuntime`; bounded browser/open/inspect/interaction and acceptance tools through the existing Harness (section 22) |
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

IDR V2 is frozen and targeted validated across schema-12 Human Model storage,
deterministic Resolver, trusted Context/Reality/source builders, bounded Context
Admission, production AgentRun/ContextCompiler integration, bundled Agent Profile,
event-driven acquisition, deterministic mutation, explicit activation,
correction/forget, restart/recovery, and controlled OFF/ON Eval. Its remaining product
work is ordinary post-V2 enhancement rather than a missing runtime foundation.

The implementation adds no Memory index, `HumanProfileId`, IDR service, parallel
Runtime, second Coordinator/ContextCompiler, second Model stream, Model authority,
FIPC, or UI. Automatic Disposition activation, cloud sync, multi-profile/device merge,
vector memory, dynamic registry/marketplace, IDR dashboard, and enterprise identity
remain explicitly deferred and do not block the V2 Freeze.

## Supporting concepts

- broader cross-cutting Memory retrieval/admission semantics without a Memory Runtime.

## Tools

- true PTY;
- Full visual Browser Agent / arbitrary iframe and new-window workflows (bounded DOM tools are implemented in section 22);
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

Further IDR, Agent Profile, and richer Memory retrieval changes enter only alongside
explicit product behavior and a separate reviewed Change Impact; architecture symmetry
alone is not implementation pressure. The frozen IDR V2 baseline is not a mandate to
add new product surfaces.

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

## 18. General Agent continuity slice — 2026-09-09 (historical first candidate)

The existing `CODING_V0.1` profile now uses `GENERAL_AGENT_LOOP_V2`.
This is an extension of the current Coordinator/StorageWorker, not another
runtime, state store, permission system, or verification authority.

- **Orchestration:** compare successful tool evidence at turn boundaries. A
  different read range or changed file hash counts as new evidence; repeated
  identical reads do not. Three consecutive turns without new successful
  evidence request replanning; six pause with `AGENT_NO_PROGRESS`. Eight-turn
  stage reviews and a five-turn remaining-budget reminder direct attention to
  hypotheses, discriminating observations, edits, recovery and verification.
  These are bounded engineering heuristics, not semantic proof of convergence.
- **Execution:** preserve the initial 1–64 step allowance, default 24. General
  exhaustion is `PAUSED / AGENT_BUDGET_EXHAUSTED`. Explicit user Resume adds up
  to 24 steps only after exhaustion, atomically with the RunResumed event.
  Cumulative per-run ceiling is 4096; no model or automatic loop grants budget.
  Focused/FAST_EDIT retain their separate bounded strategy budgets.
- **Continuity:** `GENERAL_WORK_STATE_V1` checkpoints contain bounded recent
  receipt facts, remaining verification and separately labelled unverified
  model assessment. Restart recompiles workspace context and supplies that
  checkpoint as historical data. The original Run, receipts and event sequence
  continue. Unknown effects retain existing fail-closed reconciliation.
  General observations are refreshed rather than served indefinitely from an
  argument-only cache. Full semantic plans, automatic context compaction and
  durable background execution remain future work.
- **Verification & Evidence:** provider-neutral action completion rejects prose
  without action receipts, and implementation requests without workspace
  mutation remain unresolved. Mutations still require verification of the
  current revision. An unsuccessful or unknown operation cannot establish
  completion. This conservative slice does not yet certify General no-change
  conclusions or prove that an arbitrary passing test covers the user goal.
- **Persistence:** migration 0016 widens the cumulative `agent_runs.max_steps`
  constraint while preserving identity, child references and historical rows.
  Start request limits and permission semantics do not change. Old binaries
  require a pre-upgrade database backup; historical migrations stay immutable.

Change impact and validation scope:
`docs/engineering/AGENT_CONTINUITY_CHANGE_IMPACT_V0.1.md`.

## 19. Continuous execution correction — 2026-09-09

User review rejected the default 24-step pause as the long-task experience.
`GENERAL_AGENT_LOOP_V3` supersedes the scheduling rules in section 18:

- Desktop normal, queued and retry requests select the default resource policy
  with `max_steps: null`. Storage uses the existing 4096 cumulative circuit
  breaker. Explicit 1–64 step API requests still retain their exact limit; old
  runs are not silently granted more steps. Fast/Focused strategy limits stay.
- Checkpoints and stage reviews do not stop or require user continuation.
  General resource windows use recorded model/tool execution time (60 minutes),
  input tokens (2,000,000) and output tokens (65,536). Missing token usage uses
  byte-based estimates; this is not billing-grade cost accounting. The ledger
  restores consumption after automatic restart/approval. Every trusted explicit user resume
  renews that bounded window regardless of the previous pause reason; automatic recovery never renews it. Checks occur before the next
  model turn, so a bounded in-flight turn may cross the limit.
- Distinct failed tool observations are information, never successful action or
  goal proof. Repeated unchanged observations prompt a different strategy at
  three/eight rounds; twelve repeated rounds pause with `AGENT_REPEATED_ACTIONS`.
  Empty model turns are not counted as repeated tools. These signals detect
  repeated actions, not semantic convergence or all kinds of wasted effort.
- Oversized textual transcripts are reduced automatically at 128 KiB. Retain
  the original context, a receipt-backed checkpoint with separately labelled
  model assessment, and recent complete call/result exchanges. Initial images
  stay pinned. An indivisible large prefix/exchange can exceed the target; this
  is bounded history reduction, not model-window-aware semantic compaction.
- Existing fresh-revision verification, recovery of unknown side effects,
  permission/approval policy and authoritative Run/event ownership remain.
  No new migration beyond the existing candidate 0016 is introduced.

Validation targets the actual desktop Composer, a 27-step default run with an
editing failure at step 24 followed by verified repair, explicit small limits,
replanning escape, resource pause/restart/resume, and complete compacted tool
exchanges. Fixture evidence does not establish real model task quality.


## 20. Model failure recovery and progress projection (2026-09-10)

General runs use one bounded automatic model retry. Protocol/context rejection
reduces older complete tool exchanges to a 40 KiB target after 48 KiB, with a
receipt-backed working checkpoint and separately unverified model assessment.
Original task/context and the newest indivisible exchange remain pinned; the
reduction is best effort, not a guaranteed model-window fit. Verification tools
remain available. HTTP rejection status is distinguished from malformed response
protocol and recorded as a numeric status without bodies or credentials.

After exhausted recoverable model errors, pause at the model boundary, persist
work and resume the same Run. Accepted tool receipts are retained; incomplete
model output does not authorize execution. A historical FAILED Run remains
terminal. Its explicit linked retry carries bounded prior observations and changed
paths from known completed effects in the same Project/Conversation/task scope.
Current file hashes and current-attempt verification are required; inherited
receipts and model findings are not completion authority. Unknown/in-flight
prior effects are excluded, never blindly replayed. Legacy lineage traversal is
bounded to eight linked attempts; no second state or permission system is added.

Conversation presentation projects these existing events into one current
narrative and latest operation group. Replaced progress remains expandable;
approval/pause actions stay outside the fold. Earlier attempts of the current
user turn are collapsed before the latest attempt. Optional unconfigured MCP is
normal absence; configured connection and parsing failures remain visible.

Validation must cover process restart, no duplicated writes, legacy carryover,
a changed-back file rejecting old verification, intact tool call/result pairs,
current-progress folding and the latest attempt appearing last. Local fixtures
do not prove real-model semantic convergence or diagnose historical provider
rejections whose HTTP details were not recorded.

## 21. Target identity and verified existing state (2026-09-10)

General context pins the bound Project root independently of reference paths or
package names. Bounded same-Project, exact-task historical attempts contribute
status and known changed paths only; they neither retarget tools nor establish
completion authority. A failed run may have left real partial changes.

Work Scope action detection includes change requests such as 改成/改为/补齐;
English markers match words rather than substrings in names like fixture/prefix.
This is a deterministic ingress guard, not a complete semantic intent parser.
A recognized workspace-change goal cannot finish from reading plus narrative.
If current code already meets the goal, no artificial edit is needed: require a
successful current-run check bound to the inspected file fingerprint. A changed
file during checking invalidates the receipt. Existing mutation-generation and
fresh-verification rules remain; no new schema or permission authority is added.

Completion records distinguish VERIFIED_EXISTING_STATE, VERIFIED_CHANGES and
ANSWER. An inspected-file fingerprint only covers observed paths. Command success
and freshness do not independently prove that a model chose sufficient business
acceptance tests. Reference comparison and complete requirement coverage still
need relevant evidence; local fixtures do not establish real-provider quality.

Presentation projects adjacent inspection events as one expandable group while
retaining chronological notes/receipts. Streaming-to-durable handoff keeps the
same narrative/operations order. Raw records and copied responses remain intact.


## 22. Rendered browser checks in the existing Harness (2026-09-10)

The desktop Core exposes `browser`, `browser_plan`, `browser_verify`, and `browser_server` as built-in tools. Existing Policy/Approval/ToolCall execution authorizes every call; Main-only `host.browser.execute` / `host.browser.complete` carry nonce-bound requests and responses over parent FIPC. No generic renderer IPC or remote page bridge is added. BrowserRuntime retains page ownership and security. Browser pages have no preload, Node or Fielora bridge. The fixed isolated-world DOM adapter accepts bounded observed refs and data, never model-written JavaScript or arbitrary selectors. HTTP(S) URLs only, no URL credentials, password/file input automation, hidden fields, stale snapshots or foreign active pages. Native click outcomes that cannot be established are UNKNOWN, not safe-to-replay failures.

The current Tools slice opens a run-owned page in the right workspace; supports inspect, reload, click, fill, select, scroll and screenshot. The snapshot is a bounded rendered DOM observation, not hidden reasoning or a source of permission. Existing screenshot evidence stores run/tool provenance. Main serializes page operations and cancels queued work on deadline/Core restart. Browser DOM APIs do not grant filesystem or verification authority to a website.

Harness Verification records explicit per-case requirements and measured text/value/visibility/enabled/readonly/order assertions. Existing ToolCall receipts persist the acceptance plan; existing VerificationReceipt persists outcomes. UI work identified from task language or affected UI paths requires these browser checks, and any use of the browser plan/check protocol requires all declared cases. A fresh build cannot replace missing cases. Latest failure, replacement plan, wrong target URL or changed workspace revision invalidates acceptance. Model-authored checklists still need requirement coverage review: passing six stated checks is not proof of every possible behavior, visual equivalence, backend correctness or production readiness.

Validation is an isolated local dialog whose deliberately wrong Chinese labels are detected, patched through normal guarded workspace tooling, reloaded and checked along with default values, first/second partial receipts and overpayment rejection. No real finance writes or external model requests. Authenticated production flows, arbitrary iframes/shadow roots, new-window workflows and exhaustive visual testing are outside this bounded proof. The browser_server tool reuses WorkspaceRuntime terminal processes, passing trusted Project root/field from Core separately from model arguments. Structured Node/npm/pnpm/yarn arguments are quoted literally for the existing PowerShell backend; there is one server per run and at most four active agent servers. Start/status/stop return bounded lifecycle facts and output, never verification success. Owned process trees stop on explicit stop/Core restart/app exit. No new service Runtime or persistent process schema is introduced.

## 23. Original inputs and useful observations (2026-09-10)

The existing Context/Continuity domains own original run images. Start writes a verified content-addressed blob and RUN_INPUT_ATTACHMENTS_V1 checkpoint before execution; events contain only descriptor metadata. Core restart reloads verified bytes. Resume accepts optional original attachments for legacy runs; an existing nonempty input set must match exactly. This extends the existing request without changing schema, permissions, verification authority or creating another state store. The UI restores legacy inputs from the run's original persisted user message.

General speculative repository context is bounded to four files / 16 KiB. Transcript reduction starts around 64 KiB of textual content and aims at 40 KiB; pinned inputs and the last complete tool exchange may exceed that target. Images are retained, not repeatedly converted into textual base64 for token estimates. Reduction carries bounded early/recent observation excerpts marked partial, original goal and complete recent tool exchanges. It is deterministic context reduction, not a guarantee of semantic understanding. Cumulative provider usage remains separate from active context size and still controls the resource pause.

Search returns snippets surrounding actual literal matches even in minified UTF-8 lines. Multiple empty searches trigger strategy feedback; failure does not automatically mean no information, and feedback does not grant completion. For visible UI defects the model must preserve exact reported controls, trace translation/filter/rendered bindings, and use the existing browser verification path. A changed fallback literal with an unchanged translation ID is not evidence of corrected labels.

Provider adapters omit empty optional tool fields. Rejection bodies are read only within 32 KiB / two seconds to produce fixed context/image/message categories; raw provider text is neither retained nor displayed. Unknown rejection stays unknown and an identical compacted retry is skipped. This improves diagnosis without claiming the historical vendor rejection cause.


## 24. Goal-driven shared execution lifecycle (2026-09-11)

Task classification is an initial strategy hint, not a separate completion or permission authority. Focused Edit uses the shared loop, bounded context reduction, work facts, resource accounting and current verification. Its former 16-step local failure path is removed. The optimized Fast Edit protocol may escalate through STRATEGY_ESCALATED in the same existing Run. Retain transcript and receipts; do not rerun recorded mutations. Both paths retain user cancellation and cumulative resource boundaries.

GENERAL_WORK_STATE_V1 projects the original objective, operational status, current verification, declared browser acceptance cases and remaining obligations. UNDERSTANDING / DIAGNOSING / VERIFYING / REPAIRING / READY_TO_FINALIZE / RECOVERY_REQUIRED are derived checkpoint data, not a second durable state machine. Model assessments are explicitly unverified. No-tool turns with unmet obligations receive feedback and continue. Repeated unchanged finish attempts with no new tool actions pause; successful new work resets that detector. Unknown side effects require reconciliation. Normal checkpoints never end a task.

Completion requires applicable action and current-version verification. The latest failure of an attempted check cannot be hidden behind an earlier pass or another passing command. A changed workspace invalidates old success. Desktop tasks identified as UI work require declared browser cases even if the model omits browser calls. Assertions validate only the declared coverage: plan generation is not proof that all human requirements were understood. Preserve exact screenshot defect-to-expected-value mappings; never substitute an invented nearby change.

A new turn explicitly referencing earlier images restores the newest available gallery in the same Conversation using existing input blobs. The renderer bridges legacy message attachments. Missing referenced input pauses before model invocation; do not silently guess or cross conversation boundaries. No new schema, provider binding, permission domain or verification authority is introduced.

共享工具目录还移除了旧的中国模型固定白名单/16 工具裁剪；Qwen 等行为配置可以提供提示和协议兼容，不能因此失去浏览器、已激活工具或核验能力。启动与暂停竞态也被修正：排队阶段暂停沿用同一运行控制信号，不会被随后启动覆盖。
Historical-image recovery applies to new sends, retries and resume. Resolve legacy galleries relative to the originating user message, excluding later messages even in the same conversation; Core blob fallback respects that origin too. Only an AGENT_REFERENCED_IMAGES_UNAVAILABLE pause at step zero, before any model invocation or tool call, may fill a modern run's missing input manifest. Ordinary text-only runs cannot acquire new images through resume, and persisted inputs cannot be replaced. UI gallery visibility is not evidence of model input delivery.


## 25. Advisory work plans and source recovery — amended 2026-09-11

The provider-neutral work_plan tool retains intended paths, preserved behavior, expected criteria and the next action in the existing ToolCall/Checkpoint ledger. It is optional. A model-generated plan is a revisable hypothesis, never user intent, a write allowlist, permission or verification. This supersedes the earlier mandatory-plan and plan-amendment gates, including interpretation of already persisted plans.

Evidence references are optional. Resolve them against successful read_file receipts; normalize numbered display lines when checking multiline source quotes. Refresh a still-matching quote after a file hash changes; do not silently rebind changed line-only evidence. Invalid/stale citations are excluded from confirmed facts and returned as bounded evidence issues without rejecting the entire plan. Code provenance cannot establish that the model's diagnosis or inferred requirement is correct.

Direct writes retain existing Policy, approvals and expected-SHA checks. Shared translation changes retain the bounded static outside-consumer check; local bindings or dedicated keys remain preferred. The model's file list is not a process sandbox. Dynamic references and whole-program impact are not proven.

Reconstruct current plan and resume reconciliation after context reduction, once per model request. On continuation compare carried changes against the original task/images before filling dependencies of model-added fields. Invalid historical plan errors must not trigger the same planning loop. Plans do not count as execution progress or completion. Current command/browser verification remains required; removing planning friction does not weaken acceptance checks. No new schema, runtime, provider coupling or increased budget. Deterministic fixtures cannot prove real-model semantic fidelity.


## 26. Browser document reality and server readiness — 2026-09-11

Keep main-frame load failure separately from transient shell loading state. Failed or uncommitted navigation cannot yield a successful DOM snapshot or verification. Return bounded network codes plus requested/committed addresses. A loaded document reports content state and visible password-control presence; never the password value. Empty content is not evidence of authentication.

browser_server start/status may probe an explicit loopback URL's TCP socket, with a bounded timeout and no application request. Resolve localhost only to fixed loopback addresses. Reject external hosts, credentials and non-HTTP(S) schemes before starting a process. A running process, listening socket, loaded document and accepted UI result remain distinct; none implies the next. Existing project/policy checks and run-owned server cleanup remain authoritative.

Recovery derives from actual page/server receipts, including legacy generation-zero empty success. It directs inspection of the script's imported server configuration and real output before retrying; arbitrary CLI flags cannot establish a port. Keep this obligation bounded across compaction, preserve the original requirements, and do not infer login or completion from source code. No new Runtime/Schema/Permission or semantic verification authority.


## 27. Explicit continuation allowance and recovered operational context — 2026-09-11

A trusted user continuation always records resource_budget_reset and the prior pause reason atomically with RunResumed. Renew only the current time/token allowance; preserve historical usage, cumulative step position and unmet goal/verification obligations. The prior pause code cannot determine whether a deliberate continuation gets a usable allowance. Automatic recovery, approval routing, retries and checkpoints do not grant resources. No schema change.

Derive bounded historical browser start commands and latest process/page observations from existing tool receipts. Preserve success/error/readiness fields through context reduction. Loss of an ephemeral process handle is NOT_MANAGED, not proof the service stopped; status with an explicit validated loopback URL may inspect an existing listener without owning or stopping it. Do not automatically replay historical commands, or infer a server address from arbitrary command flags. A later successfully loaded page clears obsolete recovery instructions.

Resume reconciliation has a stable marker so only one copy enters each model request. Historical model work-plan criteria are excluded from goal acceptance and stripped from legacy checkpoint context; the dedicated current plan remains an explicitly unverified hypothesis. Browser check declarations are labeled model proposals, not original user requirements. Preserve original task/images and historical tool evidence. This fixes misleading restoration and duplicated input, not general model semantic reliability.


## 28. Live observation and explicit browser login handoff — 2026-09-12

Terminal emission limits bound UI event history, not observation freshness. Continue draining process pipes and updating a bounded latest tail after the emission cap. Historical build output cannot prove current page state.

Read-only browser observations allow bounded SPA settling, update navigation identity and mark observation timeout explicitly. Do not replay click/fill/verify to wait for hydration. Retain document/content/password-presence facts across existing checkpoint compaction; password values remain excluded. Loaded pages direct subsequent work toward fresh page checks instead of stale build-log speculation.

The existing browser capability exposes request_login(snapshot_id). The Host checks current page identity and snapshot and observes a visible password control before returning user_action_required=LOGIN. Only a newly executed successful Host handoff pauses the existing Run with AGENT_BROWSER_LOGIN_REQUIRED at a durable receipt boundary. The model decides whether authentication blocks the requested target; a password form alone does not pause login-screen development. No credentials are requested in chat or filled by this action, and no verification is granted. On trusted explicit resume, retain the same task and require a new browser observation; an old handoff receipt must not immediately pause again. Preserve existing unknown-outcome, stop, permission, resource and verification semantics. No schema or parallel state machine.


## 29. Browser input delivery and observation recovery — 2026-09-12

Input dispatch is distinct from risk classification and result verification. Fixed DOM preflight returns bounded structured errors before crossing Electron's isolated-world boundary. NOT_DISPATCHED means the requested input did not occur; DISPATCHING means delivery is uncertain; DISPATCHED means native input or input/change events were delivered, not that a server transaction succeeded. A later observation failure requires a fresh read, never automatic input replay. Preserve trusted Host diagnostics in UNKNOWN tool receipts instead of replacing them with a generic token. Transport loss remains uncertain. Model-visible browser failure receipts are errors, not successful checks.

Browser observations expose bounded HTTP(S) anchor hrefs without URL credentials, plus viewport and hit-test facts. Do not click through overlays or execute arbitrary page/model scripts. Model may reveal navigation or open an observed href when navigation is intended. Existing navigation policy, password restrictions and page identity checks remain authoritative.

Only explicitly read-only built-in browser observations qualify for safe retry on unknown recovery. Mutating NETWORK calls remain unreplayable without reconciliation. For an unresolved historical browser input, user Continue keeps the Run paused with an accurate review reason rather than changing unresolved work to terminal failure. No automatic verification, enlarged budget, schema or parallel state machine. Full OS computer use is not implied by these built-in browser tools.

A loaded/visible/focused HTTP document can still lack a compositor surface ready for input. Before a native click, perform a bounded frame read and discard its pixels, then revalidate page identity and DOM hit testing. This read grants no verification and persists no screenshot. Send only fixed Chromium mouse move/down/up commands with acknowledgements; do not expose arbitrary CDP or detach another caller's debugger. A first-click regression must run before any screenshot verification, which otherwise masks this readiness defect.


## 30. Search usability and distinct observations — 2026-09-12

The existing search_text tool supports explicit bounded Rust regex, literal punctuation, and disclosed regex fallback only for regex-shaped queries with zero literal hits. Compile/memory/nesting, file size, scan bytes, result count, project and sensitive-file boundaries remain enforced. Receipts report match mode, skipped-file counts and actual match coordinates. Detailed coordinates persist in the tool ledger, not duplicated in model metadata when snippets already show locations. Regex errors are not evidence of absent code.

WorkProgress tracks matched coordinates per file revision, preserving the older receipt fallback. Smaller result limits and overlapping reads do not create new evidence. Replan context is a single refreshed message with repeated source/query facts and missing current observation; it neither asserts a diagnosis nor requires a model plan. Successful duplicate read/search exchanges are coalesced only after both actual executions finish, keeping the latest complete pair and leaving the durable ledger intact. Never coalesce mutations, errors, mixed batches, original user input or attachments. Compaction deduplicates retained observations by source/result identity and excludes the old model diagnosis when tool evidence signals a repetition loop; ordinary working notes remain explicitly unverified. No schema, permission or completion authority changes. Real provider semantic convergence requires separate validation.


## 31. Observed screenshots and actionable tool feedback — 2026-09-13

A durable screenshot reference is not a model image. Project only the latest matching owned browser capture into the existing provider-neutral multimodal message path. Verify Run, Conversation, ToolCall, page/navigation identity, immutable blob hash and byte limit through existing Storage/Evidence. Label it as observed application output, never a new user requirement. Keep original attachments in stable order through resume/compaction; an old model hypothesis cannot redefine the expected state. A newer page/navigation supersedes old observed pixels. This use under the authorized browser task does not change Library export/sync policy or capture unrelated tabs.

Fixed DOM observation includes bounded visible same-origin iframe text; cross-origin restrictions remain. Top-document element refs do not grant frame coordinate input. Icon titles are observable labels. Rendered compiler-error snippets are diagnostic observations, not authority and not an unconditional verification failure for tasks that intentionally test error states.

Normalize a misplaced root expected_sha256 only for one patch with a valid hash and no conflicting nested value, before existing policy/admission/write checks. Never invent hashes, distribute across files, broaden scope, or weaken conflict checks. Record normalization in ToolProposed; retain actionable error recovery in failed receipts and compacted context. No new schema, runtime state or completion authority. Deterministic end-to-end feedback tests do not establish real model semantic acceptance.


## 32. Rendered observation convergence — 2026-09-13

Browser refs cover visible named controls and observed click/tab targets, including empty CSS-icon elements. Exposing a ref cannot grant input permission or bypass signature, freshness, viewport, hit-test or native-input checks.

Harness progress compares browser content and element state independently of ephemeral snapshot/page/capture IDs and repeated inspect/reload actions. Actual changed screenshot content remains evidence even without a DOM change. This is evidence novelty, not semantic proof of user-goal completion.

A healthy page receipt does not itself require another inspection. Recovery guidance is reserved for concrete load, login, input or rendered-error conditions. Transcript reduction retains bounded actual rendered text from the receipt, including trailing dialogs, as historical untrusted observations. Duplicate successful read-only browser exchanges may be coalesced; input, error and changed observations remain. Existing goal verification, budget, permission and persistence ownership remain unchanged. See AGENT_OBSERVATION_CONVERGENCE_CHANGE_IMPACT_V0.1.md and the delivery evidence.


## 33. Verification follows the requested result — 2026-09-13

UI relevance is context, not a mandatory browser acceptance contract. Generic task words, UI file extensions, original screenshots, a model's optional browser plan or previous browser use cannot create that requirement. Current-revision targeted code checks may establish local field/translation/binding changes. Actual layout/interaction and explicit user browser verification still need rendered evidence; source checks never establish visual equivalence. Known current failed browser assertions and failed command checks cannot be hidden by an unrelated green command. Historical heuristic RunStarted/receipt flags remain history and cannot lock resumed work into the old strategy. No new schema or parallel authority system.

Model reasoning owns the diagnosis and appropriate check; Harness keeps original requirements, code facts, truthful result scope and progress separate from a tool merely executing. Diagnostic recovery must direct a stalled label task to actual translation/filter lookup and bindings, not unconditionally start a website. A current source check is evidence for its stated assertion, not general proof that every aspect of the user's task is solved.

The existing BrowserRuntime supports a bounded ephemeral page CSS viewport (640–2560 by 480–1600), desktop emulation and a fitted dock preview. No website CSS injection or alternate session. Apply viewport emulation only when its configuration changes; convert native input using the applied preview scale. Keep DOM coordinates and dispatch coordinates distinct in receipts. Native hit testing precedes scroll, clips candidate regions only to find additional valid points, and never force-clicks through an overlay. Ordinary scroll settling is bounded. A known non-dispatched failure returns current refs and blocker facts; unknown input is not replayed. These capabilities operate within existing page identity, policy and evidence ownership.

See AGENT_VERIFICATION_STRATEGY_CHANGE_IMPACT_V0.1.md, AGENT_BROWSER_OCCLUSION_CHANGE_IMPACT_V0.1.md and artifacts/agent-verification-strategy/DELIVERY.md. Deterministic desktop tests establish these mechanisms, not real-model task completion speed or the original business change.


## 34. Precise source observations — 2026-09-13

Search enumerates every bounded occurrence, including alternatives/repeated matches on one minified line. Caps and skipped scans remain explicit; a prefix cannot establish absence. Existing read_file supports JSON Pointer selection with exact values/missing keys and bounded UTF-8 byte windows. Raw output defaults to 16 KiB before a long line is appended; continuation identifies the next whole-file byte boundary. All modes share project/sensitive-path controls, whole-file SHA-256 and existing guarded edits. Output redaction must preserve original whitespace/CRLF and JSON string spaces outside redacted content; do not normalize the evidence supplied for exact-text edits. Missing keys, JSON null and truncated values are distinct; changing an unrelated shared translation still requires its established impact checks.

Harness identity for reads includes the consumed bytes or JSON pointers/output fingerprint, not only the line number. Complete older exchanges can coalesce only when their observations are equivalent; partial excerpts retain provenance and cannot prove completion. Repeated template guesses should be checked against actual translation/filter semantics. This improves evidence delivery without claiming that a particular model will choose the correct diagnosis.

Resize may store viewport intent in the existing ephemeral Run/page binding before its first open, without creating a tab. That configuration receipt has no page/document/snapshot and is ineligible for verification; open creates the Run's page and applies the stored viewport. Defer native emulation until Chromium has a committed document and has stopped loading. It does not adopt another Run's page, rewrite site CSS or establish a second browser runtime.

See docs/engineering/AGENT_PRECISE_SOURCE_OBSERVATION_CHANGE_IMPACT_V0.1.md and artifacts/agent-precise-source-observation/DELIVERY.md for production diagnosis, isolated engineering validation and real-model limits.


## 35. Native input does not require PNG capture — 2026-09-14

A readable, current DOM and an actionable target can exist while Chromium reports `Current display surface not available for capture`. Do not make screenshot availability a prerequisite for browser input. Retain active Run/page ownership, navigation identity, fresh observed refs, two native hit preflights and acknowledged Chromium mouse events. Never force an obscured target, replay unknown input, or claim the requested result merely from dispatch. Post-input inspection and required rendered/image assertions remain separate. Screenshot capture retains its bounded observation retries and evidence identity checks. The packaged multi-page regression must exercise actual native event counters and rendered modal fields, rather than relaxing those assertions.

The Windows host disables Chromium's CalculateNativeWinOcclusion heuristic before startup, preserving other disabled-feature flags. A controlled native-runtime reproduction showed a visible, focused host with hidden documents and unavailable display surfaces; changing only this heuristic restored document visibility, PNGs and trusted clicks. Explicit tab/view/window hiding and default background throttling remain. Covered active windows may paint more often; power usage is not benchmarked. DOM hit testing for page overlays remains enforced: OS window occlusion and in-page target occlusion are separate concerns. This is a host compatibility fix, not additional model or webpage authority.


## 36. Explicit reference project reads — 2026-09-14

Reuse the existing Tools executor and Harness governance. The RunCreated event's user_message_id binds read scope to that persisted user message. Appended attachments, earlier messages, tool arguments, plans and model-authored delegate tasks do not grant paths. Named source directories may read dependencies inside the nearest existing Git/package boundary (bounded ancestor discovery); an exact file stays exact. Without a project boundary, use only the named directory. Canonical containment, protected paths, bounded output and read-only effects remain. Relative paths always identify the target; absolute reference reads carry explicit source identity. Writes, processes and Git behavior are not expanded by these read grants.

Keep authorization roots separate from comparison coverage anchors. For requested source comparisons, actual nonempty reads must cover each named anchor before finalization; a dependency elsewhere in the same reference project, failed search, or target-project read cannot satisfy that prerequisite. Reference access is necessary evidence, not proof that an implementation matches business intent. Existing current-version checks and actual user requirements still determine verification. Binary/image references and output destinations are not automatically source-read obligations.

RUNNING/NOT_LISTENING must remain a concrete server observation across source reads and context reduction. It does not establish compilation progress. Recover the actual address/process issue or use sufficient targeted source verification when browser access is optional. Keep existing resource budgets and the single Agent lifecycle. Validation and limitations: artifacts/agent-reference-read/DELIVERY.md.

## 37. Model usage product projection — 2026-09-15

Settings usage is a read-only projection of the existing owner-scoped AgentRun and immutable AgentEvent ledger, queried through the existing trusted FIPC. Attribute each receipt to the Run's fixed provider/model, never the current Composer selection. Group by receipt date in UTC, preserve all recorded attempts across pause/resume, and paginate task rows independently of totals. Include bounded read-only child Runs, whose new MODEL_COMPLETED events retain the returned usage. No schema, budget, permission, verification or execution changes.

Reported zero and missing/partial usage are distinct. Failed/retried/interrupted streams and historical child calls may have incomplete accounting; output text length is not a provider token count. The UI refreshes on durable events and while open, shows active Runs separately from the next Composer model, and never invents in-flight consumption. Local per-provider/model rates are optional presentation preferences; estimated input/output costs are recalculated at current rates, retain separate currencies, and are not provider billing truth. Connection probes are outside Agent-task usage.


## 38. Current request context and historical execution retrieval — 2026-09-17

Harness compiles a current-request projection over the existing Conversation/Run/Event/ToolCall ledger. Every general-loop invocation, including strategy handoff and resume, receives the Run's original request and source user-message ID after context compaction. Preserve completed conversation messages strictly before that source message (last 12, with omissions disclosed); resumed tasks never absorb later unrelated messages. Historical requests, assistant claims and plans are context, not automatically renewed instructions. Applicable user constraints remain relevant. An answer to a failure/status question may complete its own Run without completing or resuming the previous implementation.

Provide an eight-entry prior-run index scoped to the same Project/Conversation and original message boundary. The built-in Observe tool `read_run_history` pages the index or an indexed Run's bounded tool outcomes, failed/unknown status, error codes, affected paths and selected receipt fields. It follows existing Policy, ToolCall and receipt persistence, not a parallel data channel. No raw command arguments/output, credentials or reasoning; reuse output redaction. Historical receipts never grant file access or establish current verification. No new FIPC or migration. Rebuild context from storage after restart; retain original attachments through the existing path.

System/messages/tool-schema hashes and role/size/source manifests describe the selected per-call inputs without storing full prompt bodies. TURN_COMPLETION_EVALUATED records the exact gate reason and current-run facts; completion_scope=CURRENT_REQUEST and historical_goals_updated=false distinguish answer completion from old work. Hash manifests support attribution, not full prompt replay. Existing action hints remain heuristics: specifically exclude outcome “改成功” from the “改成” edit hint. This is not a universal natural-language intent classifier; actual current writes still require fresh verification. Model autonomy, existing scope/approval and guarded writes remain unchanged.

Deterministic regressions cover the original Chinese question, explicit repair, bounded history, foreign/future exclusion, storage restart and no false promotion of historical verification. Real-model semantic understanding and the original finance task remain separately unverified. Change impact: docs/engineering/AGENT_TURN_CONTEXT_CHANGE_IMPACT_V0.1.md.

## 39. Receipt-backed local access answers — 2026-09-18

Work Scope & Goal recognizes a bounded standalone local access-confirmation flow
from the original persisted user message. This is a positive product-flow
constraint, not a general intent classifier or the inverse of action keywords.
Mixed implementation requests and unrecognized language retain the existing
flow. The Model still owns general semantic understanding; no classifier Agent,
mandatory plan, migration, or second authority is introduced.

Governance limits this flow to native file observations, filters model-visible
tools and rechecks normal, approved/resumed and observation dispatch. An old
ALLOW or FULL_CONTROL cannot bypass the current-request restriction. Orchestration
finishes from current successful read/list receipts matched to every named
source, even when the model continues proposing tools. Failed or unrelated reads
never establish access. Four unsuccessful tool attempts/turns yield an explicit
inconclusive answer; they do not claim the source is permanently inaccessible.
Legacy writes/unknown effects pause for review instead of claiming no changes.
Answers do not complete older implementation goals or establish verification.
Evidence and language-coverage limitations remain explicit in the delivery.

## 40. Recent conversation images without lexical gates — 2026-09-18

For a new run without explicit attachments, Core examines the latest 12 eligible runs within the same Project/Conversation and originating user-message boundary. Restore the newest gallery by its originating user-message order through the existing verified blob path regardless of current phrasing; retry execution time must not promote an old gallery above a newer upload. New attachments take precedence. Retry exclusion happens before the lookback count; later images and other conversations cannot consume or enter that scope. No repository-wide image search, new FIPC, migration, capability grant or second state store.

REFERENCED_INPUTS_RESTORED retains immediate and original source Run and user-message identities, including chained follow-ups. Historical context labels identify the earlier request as data, not renewed implementation instructions. Read annotations in conjunction with the current request; a visible crossed-out column is not automatically a missing feature. This is context delivery and model guidance, not semantic proof of annotation understanding. Existing legacy renderer recovery remains compatible.

The newest corrupt/missing input stops recovery instead of substituting an older gallery. The paused run may retry only that same source's verified bytes, preserving its identity. Per-call image manifests record IDs/MIME/data-URL digests without pixels or base64. Original inputs remain pinned through existing context reduction and resume. All existing adapter formats and image byte/count limits remain; provider image support still depends on the selected model. Deterministic transport validation and real-model understanding must be reported separately.

## 41. Model interpretation can correct lexical completion hints — 2026-09-18

The optional native Observe tool `record_request_intent` records the current Model's answer_only/action/workspace_change interpretation with an exact quote from the current request. Harness binds its receipt to the current Run and request digest. Restore only matching successful receipts from that Run; history is not eligible. Reproject the retained interpretation after compaction on each model call and after restart; continuation guidance must not demand implementation checks for an explanatory question. This refines the existing completion hints and work-state projection without a classifier model, mandatory plan, second state store, FIPC or migration. When no interpretation exists, retain conservative lexical fallback and provide an explicit correction route in unfinished-response guidance. This supersedes treating §38 action hints as uncorrectable obligations.

An interpretation is not semantic truth, user permission, action evidence or verification. Even answer_only cannot clear actual attempted effects (including failed, denied and unknown outcomes), workspace writes, unread references or browser acceptance checks. Actual writes retain revision-bound verification. Existing Policy, access-answer restrictions, pause/cancel and historical-goal separation remain. Record both lexical hints and selected interpretation/requirements in TURN_COMPLETION_EVALUATED for diagnosis.

Current explicit user corrections outrank earlier assistant interpretations. Distinguish visible UI state, annotations and requested differences; a checked box cannot reverse a user's statement that a crossed-out column should be removed/hidden. This guidance is not deterministic vision verification. Test semantic selections as fixture inputs and report real-provider understanding independently. Change impact: docs/engineering/AGENT_REQUEST_INTENT_CHANGE_IMPACT_V0.1.md.

## 42. Truthful capabilities and explicit clarification — 2026-09-18

capability_status projects web availability from the current admitted ToolProvider catalog, including Run-scoped activated MCP providers. Registration is not proof of credential/network success or permission. Native command execution rejects registered Tool IDs used as executable names; missing executable, OS access refusal and other spawn failures have distinct recoverable errors. No automatic tool-to-shell/network rerouting.

Native Observe request_user_input stores one bounded question in the existing ToolCall ledger and displays it as a durable Conversation assistant message. Stop the batch before later proposed effects and pause the same Run with AGENT_USER_INPUT_REQUIRED, without RunCompleted or success evidence. Resume accepts an optional explicit user_message_id referring to a completed, nonempty, bounded USER message in the same Conversation after the pending question. Reject unrelated/stale/assistant/reused answers. Persist accepted question/answer linkage in existing CheckpointCreated events; reproject up to eight accepted answers after context reduction/restart. Do not implicitly consume future history; only explicitly accepted user paths may contribute to existing read-only reference extraction. Preserve original attachments, unknown-effect handling and revision-bound verification. Old resume calls remain compatible but cannot skip a pending question. No migration or second runtime.

Clarification is model-selected; these deterministic mechanisms do not prove the real model asks correctly or knows Archify's source. UI state derives execution from actual Run status rather than nonterminal ownership. Changes and limitations are tracked in AE-016 and AGENT_CAPABILITY_CLARIFICATION_CHANGE_IMPACT_V0.1.md.
