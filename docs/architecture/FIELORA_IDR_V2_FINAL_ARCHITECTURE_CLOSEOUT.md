# Fielora IDR V2 Final Architecture Closeout

## 1. Status

```text
DOCUMENT: FIELORA_IDR_V2_FINAL_ARCHITECTURE_CLOSEOUT.md
STATUS: FINAL ARCHITECTURE CANDIDATE
IMPLEMENTATION ROADMAP: APPROVED FOR REVIEW
FREEZE: NOT YET FROZEN
BLOCKING_ARCHITECTURE_OPEN_QUESTIONS: 0
RUNTIME CHANGE IN THIS CHANGESET: NONE
SCHEMA CHANGE IN THIS CHANGESET: NONE
DATE: 2026-08-29
```

This document closes the remaining IDR V2 architecture decisions. It does not
reopen the canonical Agent formula or replace the detailed contracts already in:

- `FIELORA_IDR_V2_DESIGN_CANDIDATE.md`;
- `FIELORA_IDR_V2_CONTRACT_CANDIDATE.md`;
- `FIELORA_IDR_V2_SCHEMA_CANDIDATE.md`;
- `FIELORA_IDR_V2_RESOLVER_CANDIDATE.md`;
- `FIELORA_IDR_V2_RESOLVER_IMPLEMENTATION_CONTRACT_CANDIDATE.md`;
- `FIELORA_IDR_V2_CONTEXT_INTEGRATION_REVIEW.md`.

Those documents retain their historical review state. Where their remaining
questions or next-review markers differ from this document, this closeout is the
final V2 architecture Candidate. Later work proceeds as implementation, testing,
evaluation, and evidence-backed correction rather than another architecture phase.

---

## 2. Fixed architecture

```text
Agent = Model + Harness + Tools

Harness
├── Ingress & Context
├── Work Scope & Goal
├── Continuity
├── Orchestration
├── Governance
├── Execution
├── Verification & Evidence
└── IDR
    Individualized Disposition Runtime
```

`Harness.Adaptation` remains removed. Memory remains a cross-cutting Domain.
Agent Profile remains a Fielora-owned product definition, not a Runtime. Reality
identity remains Fielora-owned. The historical Bounded IDR remains Entry Intent
Resolver and does not become part of the Human Model pipeline.

IDR improves personalization. It does not own open-ended reasoning, planning,
Tool choice, Permission, Approval, Execution, Verification, Reality, Agent
identity, or the final decision.

For V2, `Individualized Direction` is the bounded structured personalization
semantics carried by the resolved view and admitted `PERSONALIZATION_CONTEXT`.
It is not a separate Model call, durable object, service, or Runtime stage.

---

## 3. Final pipeline

```text
Current input
    ├──> current semantic understanding in the primary Model stream
    │         ├──> CurrentConstraintProjectionV1
    │         └──> bounded HumanModelUpdateProposal
    └──> trusted structured Run / Work Scope state

bounded acquisition event or proposal
    -> deterministic Human Model admission
    -> durable Human Model mutation
    -> HumanModelSnapshot
    -> Harness.IDR.HumanModelResolverV1
    -> ResolvedHumanModelViewV1                 ephemeral
    -> Harness.Ingress & Context.IDRContextAdmissionV1
    -> PERSONALIZATION_CONTEXT                 bounded, non-authoritative
    -> existing Context compilation
    -> primary Model stream
    -> Agent reasoning / action
    -> outcome or user feedback
    -> bounded acquisition event
```

There is one semantic reasoning stream. A Model may emit several structured
projections from its normal turn, but IDR never creates a second classifier call,
intent Model, reasoning Agent, or parallel Runtime.

---

## 4. Ownership

| Concern | Final owner |
|---|---|
| Integration coordination and per-Run ephemeral cache | `AgentCoordinator` / Harness composition |
| Human Model semantic resolution | `Harness.IDR.Resolver` in `fielora-core` |
| Final personalization admission and context position | `Harness.Ingress & Context` in `fielora-agent` |
| Durable Human Model and consistent snapshot assembly | `fielora-storage` |
| Project, Artifact, Goal/Task, and Verification truth | existing Fielora Reality and authoritative runtime state |
| Current free-form semantic understanding | current primary Model stream |
| Human Model mutation admission and lifecycle | deterministic Harness.IDR admission |
| Stable Agent self definition | bundled `FieloraAgentProfileV1` |

Storage is not IDR semantic authority. The Model has proposal authority only.
IDR mutation authority does not imply Permission, Reality, Execution, or
Verification authority.

---

## 5. Production Context integration

### 5.1 `NormalizedResolutionContextBuilderV1`

`NormalizedResolutionContextBuilderV1` is a pure Harness composition builder,
not a Runtime. It assembles `NormalizedResolutionContextV1` from trusted,
structured state already available to the current AgentRun:

- Project identity and revision from Fielora Project/Reality state;
- domain, task type, and interaction kind from Work Scope and existing task
  classification;
- current constraints from `CurrentConstraintProjectionV1` plus mandatory
  Fielora-owned Work Scope and runtime facts;
- Reality projection from authoritative Fielora state;
- source availability from Fielora-owned storage/source status.

It may normalize, validate, sort, fingerprint, and mark an input unavailable. It
must not reinterpret the Human Model, parse arbitrary web content, inspect the
filesystem or Git directly, ask a Model for Reality, or infer missing Project state.

### 5.2 `CurrentConstraintProjectionV1`

`CurrentConstraintProjectionV1` is the upstream structured projection that
feeds the already implemented `NormalizedCurrentConstraintsV1`. Its minimum
semantic shape is:

```text
CurrentConstraintProjectionV1
├── contract_version
├── projection_ref
├── request_source_ref
├── covered_semantic_keys[]
├── entries[]
│   ├── authority
│   ├── semantic_key
│   ├── operation: REQUIRE_VALUE | FORBID_VALUE | SUPPRESS_DURABLE_KEY
│   ├── canonical_value?
│   └── source_digest
└── projection_digest
```

Only registered keys and canonical values are accepted. The projection is
request-scoped and ephemeral. It is not a durable Preference and cannot itself
mutate the Human Model.

Open-ended language remains the primary Model stream's responsibility. The
Harness first uses deterministic structured state, explicit settings, and typed
user controls. If free-form semantics are not yet available, affected keys are
`UNAVAILABLE`; the Harness must not claim they are compatible.

The primary Model may emit `CurrentConstraintProjectionV1` alongside its normal
plan/tool intent/output. That projection is available for later Context
compilations in the same Run. It does not trigger another Model call and does not
rewind or replay the first turn.

This bootstrap rule is final for V1:

```text
trusted pre-Model projection available
-> resolve before the first Model request

free-form constraint not yet projected
-> mark affected coverage unavailable
-> omit affected IDR contribution
-> first generic Model turn continues
-> reuse the primary turn's structured projection on later turns
```

Current request semantics and durable Preference acquisition remain separate.
For example, “this time the whole module may be refactored” is a current
constraint only. “By default, only change the requested scope from now on” may
produce both a current constraint and a separate durable Preference proposal.
Ambiguity means no durable proposal is committed.

### 5.3 Authoritative Reality projection

Reality inputs are projections of existing authoritative state:

- Project identity and revision from the Project/Field authority;
- Artifact identity and current revision from the Artifact authority;
- Goal/Task state where a current authoritative contract exists;
- Verification state from current Verification/Evidence authority.

IDR does not read files or Git, reinterpret receipts, own identities, or ask a
Model for Reality truth. A missing production builder or unavailable authority
is represented as `UNAVAILABLE`, `MISSING`, or `UNRESOLVED` under the existing
contracts. It is never guessed.

### 5.4 Run timing and invalidation

At AgentRun start, Harness composition builds the available structured Work
Scope and resolution inputs. It resolves after initial task normalization and
before the first final Context compilation whenever sufficient trusted inputs
exist. Otherwise the bootstrap rule above produces a partial or empty
contribution without blocking the generic Agent.

The resolved view and admitted contribution are ephemeral per-Run data. They are
reused until one of these semantic inputs changes:

- `human_model_revision`;
- current explicit constraint projection or its digest;
- authoritative Project/Reality revision or projection digest;
- Work Scope;
- domain, task type, or interaction kind;
- source availability projection;
- Resolver, registry, profile, or Admission version;
- IDR participation changes between enabled and disabled.

ToolCalls alone do not cause full re-resolution. A Tool outcome only invalidates
IDR when it changes an authoritative semantic input above. A failed re-resolution
must discard the old view; stale personalization is never reused.

---

## 6. Failure and degradation

The V2 production policy is `FAIL-SOFT`.

Normal absence or partial availability—no Human Model, an empty model, no
matching item, unresolved Reality, empty IDR budget, or unavailable source—yields
no or partial personalization. The generic Agent continues.

Integrity failures—unsupported Resolver/registry/profile version, invalid
snapshot, corrupt lineage, revision mismatch, or invalid canonical digest—also
disable IDR contribution for the current Run. Harness composition records a
bounded stable diagnostic in existing Context Snapshot metadata and, when
needed, the existing context-compiled event projection. It stores no raw
payload, source body, secret, or SQLite error.

Integrity failure must not invent a fallback Preference, silently retain stale
personalization, mutate the Human Model, or block the generic Agent. V1 defines
no workflow that requires individualized state, so it never escalates an IDR
failure into a task blocker.

---

## 7. Context position and evidence

The semantic precedence is:

```text
System / Safety / Governance
    > Current user request
    > Current authoritative work context and Reality
    > PERSONALIZATION_CONTEXT (non-authoritative)
    > historical / advisory context
```

The existing ContextCompiler owns the exact wire representation. It must label
the IDR block as non-authoritative personalization and must not present it as a
system rule, current user statement, or Reality fact.

Every production use extends the existing `agent_context_snapshots.manifest`
with bounded metadata containing:

- resolution reference and resolution-context fingerprint;
- Human Model revision;
- Resolver, registry, and resolution-profile versions;
- admitted IDR projection digest;
- `WhyUsedManifestV1`;
- IDR participation state and bounded failure/omission diagnostics.

No `idr_run_contexts`, `idr_context_history`, `idr_resolution_history`, or second
durable Run ledger is permitted.

---

## 8. Human Model acquisition and mutation

### 8.1 Final acquisition pipeline

```text
Current interaction / outcome
    -> bounded AcquisitionObservation
    -> semantic extraction/classification in the primary Model stream,
       or an exact deterministic mapping for typed settings/commands
    -> HumanModelUpdateProposal
    -> deterministic Human Model admission
    -> atomic mutation at expected human_model_revision
```

Acquisition is event-driven, bounded, purpose-limited, and IDR-relevant. It must
not scan every Conversation, summarize everything, or permanently remember every
turn. Conversation, Message, AgentRun, and Event identifiers are source refs,
not authority by themselves.

V1 source classes are closed to:

```text
EXPLICIT_USER_STATEMENT
EXPLICIT_USER_SETTING
USER_CORRECTION
USER_ACTION
AGENT_OUTCOME
SYSTEM_INFERENCE
USER_APPROVED_IMPORT
```

### 8.2 Durable intent

The primary Model may propose that free-form language expresses a durable Fact,
Preference, or Goal. Keyword matching may help retrieval but never authorizes a
write. Explicit durable meaning such as “from now on”, “remember”, “I generally
prefer”, or “by default” must still become a typed proposal and pass deterministic
admission.

```text
Model -> PROPOSES
Harness.IDR admission -> ALLOW / REJECT / REQUIRE_EXPLICIT
Storage transaction -> COMMITTED only after all checks pass
```

A current-only instruction enters Work Scope/current constraints and is not
automatically durable. If durable intent or scope is ambiguous, no durable write
occurs and the current task continues.

### 8.3 Observations and Dispositions

User correction, explicit rejection, repeated bounded user action, and an Agent
outcome plus user response may create an admitted `OBSERVATION`. Active
Observation means valid evidence only; it is never an effective Preference or
personalization entry.

Model-assisted or deterministic aggregation may propose an inferred
`DISPOSITION`, but it must enter as `CANDIDATE`. Observation count, repeated
behavior, High confidence, or Model confidence cannot auto-activate it.

V2 activation is exclusively:

```text
inferred DISPOSITION / CANDIDATE
    -> ACTIVATE_DISPOSITION(item_id) with explicit user confirmation
    -> deterministic revision/lifecycle admission
    -> ACTIVE
```

Conversational confirmation and any future UI must call this same controlled
mutation path. Bounded automatic activation is deferred beyond V2.

### 8.4 Admission, correction, and forget

Human Model admission always validates:

1. Contract and payload version;
2. closed kind and semantic registry;
3. normalized scope;
4. provenance and source class;
5. evidence basis and confidence compatibility;
6. sensitive-data policy;
7. expected Human Model revision;
8. conflicts, duplicates, and supersession;
9. lifecycle rule;
10. atomic transaction result.

The Model cannot bypass these checks or write storage directly.

Explicit correction outranks inference and uses the existing atomic correction,
supersession, revoke, or replacement transaction. Scope correction creates a new
replacement rather than mutating historical meaning in place.

Forget semantics remain exactly:

```text
DISABLE_USE
ERASE_IF_ALLOWED
RESET_PROFILE
```

Forgetting IDR does not delete Conversations, Reality, or the Agent execution
ledger. Erasure retains only the already defined bounded tombstone semantics and
does not claim forensic or legal secure deletion.

---

## 9. Privacy and sensitive admission

The final V1 policy is:

| Class | Decision |
|---|---|
| Ordinary bounded work Preference or non-sensitive Goal | `ALLOW` after ordinary validation |
| High-risk health, financial, legal, precise-location, intimate, or similar personal data | `REQUIRE_EXPLICIT` with item/scope/purpose-specific confirmation |
| Credential, password, token, private key, session/auth material, or secret-derived value | `DENY` |

IDR must never persist a secret, secret hash, prefix, last four characters,
derived credential fingerprint, raw transcript, raw file body, raw web body, or
provider authorization material. Model classification cannot downgrade `DENY`
or satisfy explicit confirmation.

The Human Model remains local in the existing Fielora SQLite database. Cloud
sync, provider-hosted memory, multi-profile identity, multi-user, and
multi-device merge are deferred.

---

## 10. Agent Profile and identity

`FieloraAgentProfileV1` is the minimum bundled, versioned, code-owned self
definition:

```text
FieloraAgentProfileV1
├── profile_version
├── name = "Fielora"
├── product = "Fielora"
├── role = "local AI workspace agent"
├── purpose = "help the user complete project work through the Fielora Harness"
└── stable_semantic_boundaries[]
    ├── Agent identity is distinct from Model/Provider identity
    ├── current user instruction and Reality outrank personalization
    ├── Model output cannot self-grant Permission or authority
    └── execution success is distinct from Verification
```

Ingress & Context projects a bounded stable self description, not the complete
product documentation. Provider swap, Model change, Conversation history, and
Human Model preferences cannot alter Agent Profile.

For “Who are you?”, the stable answer begins from Agent Profile: “I am the AI
Agent in Fielora.” Provider/Model identity is returned only when separately
asked or operationally relevant.

```text
Agent Identity != Model Identity
```

---

## 11. Memory, Reality, and Generic Agent boundary

Memory remains a cross-cutting Domain with this final ownership map:

| Meaning | Owner |
|---|---|
| Working execution state | Orchestration / Continuity |
| Episodic history | Continuity |
| Historical retrieval | Ingress & Context |
| Human-specific durable model | IDR |
| Current Project truth | Reality |
| Agent self identity | Agent Profile |

There is no Memory Runtime, Universal Memory Store, or Agent Memory Authority.

The truth precedence is:

```text
Current authoritative Reality
    > durable historical Memory
    > IDR inference
```

IDR and Memory cannot override current file state, Project/Artifact revision,
Goal/Task state, or Verification state.

A Fielora Agent with no IDR data or with IDR disabled is valid:

```text
Model + Harness + Tools = supported Generic Fielora Agent
```

### 11.1 IDR participation

```text
IDR_DISABLED
IDR_ENABLED
```

This is an ephemeral Run/product participation projection, not Human Model
lifecycle. Missing, invalid, or unsupported participation input defaults to
`IDR_DISABLED`. Disabled means Resolver/Admission contribution is omitted and
the generic Agent continues. It does not erase or mutate the Human Model;
forget/reset remains a separate explicit operation.

---

## 12. Final evaluation architecture

The controlled A/B invariant is:

```text
same Model
same Harness
same Tools
same Work Scope
same Task
same Reality

A = IDR_DISABLED
B = IDR_ENABLED
```

Required suites are:

1. Explicit Preference — admitted explicit preference affects only eligible behavior;
2. Current Override — current explicit instruction defeats conflicting durable preference;
3. Scope Isolation — Coding preference does not leak into unrelated scope;
4. Inferred Disposition Candidate — Candidate does not affect behavior;
5. Activated Disposition — explicit activation is required before effect;
6. Preference Correction — superseded/revoked old item stops affecting new Runs;
7. Reality Conflict — current Reality defeats IDR;
8. IDR Failure — generic Agent continues without stale fallback;
9. Provider Swap — provider-neutral resolved/admitted semantics remain equivalent;
10. Erasure — erased semantic payload cannot affect a later Run.

Required metrics are:

```text
preference adherence
task success
unrelated changes
instruction violation
clarification burden
wrong-memory rate
scope leakage
over-personalization
under-personalization
user correction rate
IDR token overhead
IDR latency overhead
```

Hard-zero metrics are:

```text
Permission escalation
Governance bypass
Reality override
Verification bypass
Secret leak
Cross-scope hard violation
Candidate Disposition influencing behavior
```

Eval evidence must bind Model/Provider identity, Harness/Profile versions, task
fixture, Reality/input digests, IDR participation, Human Model revision,
resolution/admission refs, outcome, and metric results without storing secret or
chain-of-thought content.

---

## 13. Freeze gate

IDR V2 may become `FROZEN` only when all of the following pass:

- implemented storage and migration compatibility;
- deterministic Resolver;
- production Context integration and fail-soft behavior;
- explicit acquisition and bounded Observation/Disposition candidate pipeline;
- activation, correction, disable, erasure, and reset semantics;
- minimal Agent Profile projection;
- restart/recovery where durable Human Model state is involved;
- controlled A/B suites and required metrics;
- every hard-zero invariant;
- no blocker privacy finding;
- provider-neutral semantic evidence.

Freeze does not require automatic Disposition activation, cloud sync,
multi-user, multi-device merge, vector memory, marketplace registry, dynamic
semantic registry, IDR dashboard, or enterprise identity.

---

## 14. Final implementation sequence

Physical dependencies require the builders to precede production wiring. The
single implementation sequence is:

1. Implement `CurrentConstraintProjectionV1`, authoritative Reality/source builders,
   `NormalizedResolutionContextBuilderV1`, and IDR participation input;
2. Integrate Resolver and Admission into AgentCoordinator/Context compilation with
   ephemeral reuse, invalidation, fail-soft diagnostics, and Context Snapshot evidence;
3. Implement bounded `FieloraAgentProfileV1` projection;
4. Implement explicit Preference/Fact/Goal proposal and deterministic admission;
5. Implement bounded Observation acquisition;
6. Implement inferred Disposition Candidate proposal path without activation;
7. Implement explicit activation, correction, disable, erasure, and reset paths;
8. Add restart, revision-conflict, mutation atomicity, and persistence integration tests;
9. Add the `IDR_DISABLED` / `IDR_ENABLED` controlled A/B harness;
10. Run the required Eval suites and collect provider-neutral evidence;
11. Fix only evidence-backed defects without expanding V2 architecture;
12. Perform the Freeze decision against Section 13.

New registered dimensions/values/Goal keys, bounded provenance sources,
diagnostic codes, Context budget tuning, and Eval fixtures are ordinary reviewed
changesets while they preserve these authority boundaries. They do not create a
new architecture phase.

---

## 15. Closeout

```text
IDR_V2_FINAL_ARCHITECTURE_CLOSEOUT: PASS
BLOCKING_ARCHITECTURE_OPEN_QUESTIONS: 0
CONTEXT_PRODUCTION_INTEGRATION: ARCHITECTURE_CLOSED / NOT_IMPLEMENTED
ACQUISITION_PIPELINE: ARCHITECTURE_CLOSED / NOT_IMPLEMENTED
AGENT_PROFILE: ARCHITECTURE_CLOSED / NOT_IMPLEMENTED
FAILURE_POLICY: FAIL-SOFT
AUTOMATIC_ACTIVATION: DEFERRED_POST_V2
GENERIC_AGENT_WITHOUT_IDR: SUPPORTED
FREEZE: NOT_YET
NEXT: IDR_V2_IMPLEMENTATION_EXECUTION
NO_FURTHER_ARCHITECTURE_REVIEW_REQUIRED: YES
```
