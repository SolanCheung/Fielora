# Fielora V0.1 Agent Architecture Specification

**Document:** `FIELORA_V0.1_AGENT_ARCHITECTURE_SPEC.md`

**Version:** V0.1

**Status:** `CANONICAL ARCHITECTURE BASELINE`

**Scope:** Fielora Agent System

**Adopted:** 2026-08-24

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
context, goals, continuity, orchestration, governance, execution control,
persistence semantics, recovery, verification, evidence, and adaptation.

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

---

# 4. Harness

The Harness is the control system of the Fielora Agent. Its eight functional
domains are logical ownership boundaries; they do not require one crate,
service, or database table per domain.

```text
Harness
├── 1. Ingress & Context
├── 2. Identity & Goal
├── 3. Continuity
├── 4. Orchestration
├── 5. Governance
├── 6. Execution
├── 7. Verification & Evidence
└── 8. Adaptation
```

## 4.1 Ingress & Context

Question: what happened, and what does the Agent need to know now?

Responsibilities include:

- user, Conversation, file/attachment, system, time, and external inputs;
- ingress validation, normalization, trust classification, and admission;
- project indexing, relevant-file retrieval, bounded selection, stable and
  dynamic context, hashing, and future compression;
- bounded Intent + Referent Resolution.

Current implementation:

- `ContextCompiler` and repository index in `crates/fielora-agent`;
- input and attachment admission in `AgentCoordinator`;
- `AgentContextSnapshotView` and snapshot persistence in
  `fielora-contracts` / `fielora-storage`.

IDR belongs here. It may resolve Intent, Referent, ExpectedChange, Confidence,
and Ambiguity. It MUST NOT become a planner, executor, verification engine, UI
generator, or second Agent Core.

## 4.2 Identity & Goal

Question: who is acting, what are they trying to achieve, and where did that
goal come from?

Responsibilities include user, Project, Conversation, and AgentRun identity;
Goal definition/provenance/hierarchy/status/revision; Task, priority,
commitment, and Goal Authority.

Current implementation:

- stable Project/Field, Conversation, message, Provider, and AgentRun identities;
- an `AgentRun.task` description and durable Run status;
- completion evaluation in the Harness, separate from model self-report.

Remaining gap: Fielora has no complete long-lived Goal/Task model. Stable Long
Tasks may extend this domain only when product behavior requires it. This
specification does not authorize empty Goal/Task tables or services.

## 4.3 Continuity

Question: what happened before, what is true now, and how can work continue
after interruption?

Responsibilities include Agent/Task/Execution state, persistence, AgentRun,
Agent Events, Context Snapshots, Conversation history, working/episodic/semantic
memory, checkpoint, resume, recovery, replay, and long-task continuity.

Current implementation:

- `agent_runs`, `agent_events`, `agent_context_snapshots`,
  `agent_tool_calls`, `agent_approvals`, and
  `agent_verification_receipts` in schema 6;
- `StorageWorker` and the corresponding methods in `fielora-storage`;
- Conversation messages;
- startup reconciliation of incomplete tools to `UNKNOWN` and active Runs to
  `PAUSED`;
- in-memory transcript/context caches for an active process.

The immutable Agent Event ledger is durable history, not a claim that the whole
product uses Event Sourcing:

```text
Durable events ≠ durable execution
```

Stable long-running execution must build on this ledger and projection model
rather than replace it.

## 4.4 Orchestration

Question: how should intelligence and capabilities be organized to complete the
task?

Responsibilities include the Agent loop, task decomposition, planning and
replanning, model invocation/routing, tool selection/orchestration, retry
strategy, bounded sub-agent orchestration, and Harness strategies.

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

## 4.5 Governance

Question: what may the Agent do, under whose authority, and within which limits?

Responsibilities include:

- `PolicyEngine`;
- identity, Goal, capability, resource, and execution authority;
- permission presets;
- Approval Routing;
- Semantic Authority;
- risk and budget;
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

`FULL_CONTROL` may change Approval Routing for an otherwise permitted action.
It does not disable containment, symlink protection, sensitive-path denial,
SHA guards, force/destructive restrictions, receipt requirements, or fresh
verification.

## 4.6 Execution

Question: once an action is authorized, how is it executed reliably?

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

## 4.7 Verification & Evidence

Question: did the requested change actually happen, and what proves it?

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

## 4.8 Adaptation

Question: what should be retained so the system performs better in the future?

Potential responsibilities include governed memory consolidation, preference
adaptation, project-pattern learning, strategy adaptation, skill acquisition,
workflow extraction, and capability learning.

Current implementation has no autonomous Adaptation runtime or durable
Adaptation model. Fixed repository indexing, bounded model behavior profiles,
and Coding strategies are configuration/implementation, not claims of learned
adaptation.

Future Adaptation cannot rewrite its own governance, permissions, safety
boundaries, verification requirements, or this architecture without explicit
authority and review.

---

# 5. Aegis, IDR, AG-UI, and DXE placement

## 5.1 Aegis

Aegis MUST NOT become a second Core, Harness, Runtime, state system, permission
system, evidence system, or persistence system.

Future Aegis work strengthens these existing Harness domains:

- Identity & Goal;
- Continuity;
- Governance;
- Execution;
- Verification & Evidence;
- Adaptation.

Trusted ingress, authority, risk, budget, Approval, revision, fence,
idempotency, recovery, reconciliation, receipts, audit, and replay must reuse
Fielora-owned AgentRun, event, policy, execution, and evidence boundaries.

## 5.2 IDR

IDR is bounded Intent + Referent Resolution in Harness.Ingress & Context. It
does not plan, execute, verify, or own durable Agent state.

## 5.3 AG-UI

If adopted, AG-UI is an interaction protocol adapter:

```text
Fielora UI ↔ AG-UI adapter ↔ Harness
```

It may cross Ingress & Context, Continuity, Governance, Execution, and
Verification & Evidence. Its state is a projection. Rust Core and Fielora-owned
durable storage remain authoritative.

## 5.4 DXE

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
├── APIs / MCP / Database
├── Local applications
└── Future artifact capabilities
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
Project
├── Local folder
├── Conversation *
│   ├── User / Assistant messages
│   └── AgentRun *
│       ├── Context snapshots
│       ├── Durable events
│       ├── Tool calls
│       ├── Approvals
│       └── Verification receipts
├── Files / Changes / Review
├── Terminal
└── Provider / Model selection
```

Project currently retains Field identity compatibility. This baseline does not
require its removal.

Future Goal/Task identity may be introduced only when Stable Long Tasks require
it; do not add unused tables or abstractions now.

Field/Reality describes what Fielora believes about the user's work. Agent
architecture describes how the Agent performs work. Reality may provide
authoritative context to the Harness; it does not replace Harness state.

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
8. IDR resolves intent/referents and does not execute.
9. DXE consumes work state and does not orchestrate the Agent.
10. AG-UI is an adapter and not a source of truth.
11. Backend runtime naming does not create a new Agent layer.
12. Tool availability, model output, execution success, and Semantic Authority
    remain distinct.

---

# 10. Current repository mapping

| Architecture | Current implementation and exact ownership |
|---|---|
| Product UI | React renderer; starts, steers, stops, approves, and renders projections |
| Desktop Host | Electron Main; FIPC supervision, trusted Desktop integration, Browser and Workspace backends |
| Model | `fielora-model` plus Provider-neutral DTOs in `fielora-contracts` |
| Harness composition | `fielora-core/src/agent_runtime.rs` |
| Ingress & Context | input admission in `AgentCoordinator`; `ContextCompiler` in `fielora-agent`; snapshots in storage |
| Identity & Goal | Project/Conversation/AgentRun IDs and Run task in contracts/storage; complete Goal model deferred |
| Continuity | AgentRun/Event/ToolCall/Approval/Context/Verification persistence in `fielora-storage`; reconciliation in storage + coordinator |
| Orchestration | `AgentCoordinator`, model loop, Coding Profile/strategies, bounded retry and read-only child AgentRun |
| Governance | `PolicyEngine`, permission/effect contracts, Approval routing/nonce, executor invariants, completion authority |
| Execution | coordinator lifecycle/dispatch/cancel/resume; Tokio infrastructure; ToolCall projection; process cancellation |
| Verification & Evidence | Tool/Verification receipts, mutation invalidation, diff/test gates, completion evaluation |
| Adaptation | not implemented as a runtime or durable model |
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

## Identity & Goal

- explicit long-lived Goal/Task model;
- provenance, hierarchy, authority, revision, and commitment.

## Continuity

- mature checkpoints and durable scheduling;
- stable long-task resume/replay semantics;
- complete crash reconciliation.

## Execution

- mature pause/resume and preemption;
- durable queueing/scheduling;
- long-running task control.

## Adaptation

- governed memory consolidation;
- preference/strategy adaptation;
- workflow extraction.

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
→ Identity & Goal
→ Governance / Aegis semantics
→ Evidence / Reconciliation
```

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
17. Aegis strengthens Harness; it does not create another Core.
18. IDR resolves intent; it does not execute.
19. DXE composes Product work surfaces; it does not replace Harness.
20. AG-UI is an interaction adapter, not durable truth.
21. New task categories use Harness Profiles.
22. Future capabilities extend this architecture instead of bypassing it.

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

# 15. Summary

> **Model provides intelligence.
> Harness governs and orchestrates intelligence.
> Tools provide real capabilities.**

Fielora's Product layer preserves Project, Conversation, Workspace, Field
Reality, and human interaction above that Agent. All subsequent V0.1 Agent work
must extend this baseline.
