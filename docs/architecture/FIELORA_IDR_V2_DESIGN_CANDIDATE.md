# Fielora IDR V2 Design Candidate

## 1. Status

```text
DOCUMENT: FIELORA_IDR_V2_DESIGN_CANDIDATE.md
STATUS: DRAFT / CANDIDATE / NOT FROZEN
IMPLEMENTATION: NOT AUTHORIZED
SCHEMA: NOT DESIGNED / NOT AUTHORIZED
MIGRATION: NONE
RUNTIME: NOT IMPLEMENTED
UI: OUT OF SCOPE
DATE: 2026-08-28
```

This document is a semantic and evaluation candidate for:

```text
IDR
= Individualized Disposition Runtime
```

It does not freeze a Contract, Rust type, database schema, migration, Context
integration, or UI. The canonical top-level Agent architecture remains defined
by `FIELORA_V0.1_AGENT_ARCHITECTURE_SPEC.md`.

The detailed Contract Review output is tracked in
`FIELORA_IDR_V2_CONTRACT_CANDIDATE.md`. It remains
`DRAFT / CANDIDATE / NOT FROZEN` and authorizes no Schema, Migration, Runtime,
Context integration, FIPC, or UI implementation.

---

## 2. Purpose

IDR maintains a durable, correctable, scoped, and provenance-bearing Human
Model for the local installation's primary human. For each Agent task it
resolves only the human-specific tendencies relevant to the current Work Scope
and produces a bounded `Individualized Direction`.

```text
IDR asks:
What kind of person am I serving?

IDR does not ask:
What is objectively true?
What is the final plan?
Which Tool should execute?
What is permitted?
Has the task been verified?
```

The intended value is not to make Fielora more assertive. It is to help the
same general Model and Harness understand and act in ways that better fit this
specific human without weakening current instruction, Work Scope, Governance,
Reality, or Verification.

---

## 3. Non-goals

IDR is not a:

```text
User database
CRM profile
Advertising profile
Recommendation engine
General Memory Store
Vector database
Agent planner
Second LLM
Second Agent Runtime
Permission Engine
Policy Engine
Verification Engine
Identity Authority
Reality authority
Tool Runtime
```

IDR never receives Permission, Approval, Execution, Verification, Reality
mutation, or final decision authority.

Permanent invariants:

```text
Preference ≠ Permission
Observation ≠ Preference
Inference ≠ Fact
Memory ≠ Reality
Disposition ≠ Decision
```

This Candidate does not introduce Adaptation, a Memory Runtime, an Agent
Profile Runtime, a parallel persistence system, or Aegis Identity/Will/
Cognitive Runtime.

---

## 4. Architecture placement

IDR is exactly one existing Harness domain:

```text
Fielora Agent
├── Model
├── Harness
│   ├── Ingress & Context
│   ├── Work Scope & Goal
│   ├── Continuity
│   ├── Orchestration
│   ├── Governance
│   ├── Execution
│   ├── Verification & Evidence
│   └── IDR
│       Individualized Disposition Runtime
└── Tools
```

It does not become a fourth Agent part or a Runtime beside the Harness.

### 4.1 Responsibility boundaries

| Question | Owner |
|---|---|
| What does the current human request mean? | Model |
| Which bounded product entry flow receives the request? | Entry Intent Resolver |
| What are we working on and within which boundaries? | Work Scope & Goal |
| What durable history is retrievable? | Memory domain owners / Continuity |
| What does relevant history suggest about this human? | IDR |
| What context may the Model see? | Ingress & Context |
| What may the Agent do? | Governance |
| What proves completion? | Verification & Evidence |

Current open-ended intent understanding and referent resolution remain Model
responsibilities. Historical `ASK / CAPTURE / PROMOTE / CONTINUE` routing is
the `Entry Intent Resolver`, not IDR.

### 4.2 Local primary human

The V2 design assumes:

```text
Local Fielora Installation
        │
        └── Primary Human
```

A minimal future `HumanProfileId` may identify the local Human Model data
aggregate. It is only a data reference:

```text
HumanProfileId
≠ authentication identity
≠ security principal
≠ permission authority
```

Tenant, Organization, enterprise subject directories, multi-user RBAC,
delegated human identity, multi-profile coordination, cross-user Human Model
merge, cloud sync, and cross-device merge are out of scope.

---

## 5. Human Model ontology

### 5.1 Final Candidate ontology

The minimal top-level semantic kinds are:

```text
HumanModel
├── FACT
├── PREFERENCE
├── OBSERVATION
├── DISPOSITION
└── LONG_TERM_GOAL
```

| Kind | Strict meaning | Example | May directly inform Direction? |
|---|---|---|---|
| `FACT` | A descriptive claim explicitly made or approved by the human about themselves or their durable circumstances. It records the statement, not objective truth. | “I mainly use Windows.” | Only as relevant context; it cannot override current Reality. |
| `PREFERENCE` | An explicit human statement or setting describing a desired default, avoidance, style, or trade-off. | “For code changes, only modify the requested surface.” | Yes, as a scoped soft signal. |
| `OBSERVATION` | A bounded record that an action, correction, choice, or outcome occurred. It is evidence, not a preference. | The human rejected unrelated refactoring in several runs. | No. It can support a Disposition. |
| `DISPOSITION` | A derived, defeasible tendency supported by observations or other admitted evidence. It never becomes an explicit fact or preference. | The human may favor bounded changes in repository work. | Yes, when active, relevant, and sufficiently supported. |
| `LONG_TERM_GOAL` | A durable desired human outcome explicitly stated or confirmed, distinct from the current Agent Run Goal. | “I want Fielora to remain provider-neutral.” | Yes, only as direction where relevant; never as current Work Scope. |

### 5.2 Why the other proposed concepts are not top-level kinds

- `Behavioral Pattern` is an evidence-backed Disposition, not a sixth record
  kind.
- `Working Style`, `Communication Style`, `Decision Style`, and
  `Risk Disposition` are Disposition/Preference dimensions.
- `Feedback` is an Observation or correction/revocation evidence event. It is
  not a parallel durable truth type.
- Explicit Fact and Explicit Preference stay separate because descriptive and
  normative claims have different conflict and application rules.

Candidate dimensions remain deliberately small and extensible:

```text
WORKFLOW
CHANGE_SCOPE
VERIFICATION
COMMUNICATION
DECISION
RISK
PLANNING
ARCHITECTURE
```

The dimension vocabulary is not frozen. Unknown or future dimensions must
remain typed and bounded rather than falling back to arbitrary JSON/prose.

### 5.3 Conceptual item shape

This is a semantic candidate, not a Rust or database schema:

```text
HumanModelItem
├── stable item reference
├── HumanProfile reference
├── semantic kind
├── normalized subject / dimension / stance
├── bounded human-readable summary
├── provenance set
├── scope selector
├── evidence basis
├── confidence, where applicable
├── lifecycle
├── conflict / supersession relations
└── creation and revision times
```

No item may change semantic kind in place. An Observation cannot silently
become a Preference; a Disposition cannot become a Fact. Promotion creates a
new typed item linked to its evidence.

### 5.4 Required semantic separation

```text
Explicit Fact:
The human explicitly says, “I mainly use Windows.”

Explicit Preference:
The human explicitly says, “Only change the requested code surface.”

Observation:
The human repeatedly rejects unrelated refactoring.

Inferred Disposition:
The human may prefer bounded change in repository work.
```

The Observation can support the Disposition. It cannot silently become the
Explicit Preference. Model-generated inference can create only a Disposition
Candidate; it cannot create a user Fact.

---

## 6. Provenance model

Every durable item must answer `Where did this come from?` without copying an
unbounded transcript into IDR.

### 6.1 Provenance origin

```text
EXPLICIT_USER_STATEMENT
EXPLICIT_USER_SETTING
OBSERVED_USER_ACTION
OBSERVED_CORRECTION
CONVERSATION_EVIDENCE
AGENT_OUTCOME
IMPORTED_USER_APPROVED_DATA
SYSTEM_INFERENCE
```

`CONVERSATION_EVIDENCE` describes the source channel. It does not grant the
Provider or assistant prose authority. The origin must still distinguish a
human statement from model-generated text.

### 6.2 Minimal provenance reference

```text
ProvenanceRef
├── origin
├── Fielora-owned source reference
├── source time
├── optional bounded human excerpt
├── optional source digest
└── admission / correction relation
```

- Prefer Conversation/Message, Setting revision, AgentRun/Event, Approval, or
  other existing Fielora-owned references.
- Store a bounded excerpt only when needed for human inspection. Prefer a
  digest plus source reference over transcript duplication.
- Never copy a whole Conversation, model response, Tool output, or project file
  into IDR merely to establish provenance.
- Provider-generated prose alone cannot become an authoritative human Fact,
  Preference, or Goal.
- A `SYSTEM_INFERENCE` must reference the admitted evidence items from which it
  was derived. “The model said so” is not sufficient provenance.

Provenance records origin; it does not imply truth, permission, or current
applicability.

---

## 7. Scope model

A disposition is never global merely because no better scope was inferred.

### 7.1 Candidate scope selector

Use one bounded selector with optional matching axes rather than unrelated
scope hierarchies:

```text
DispositionScope
├── GLOBAL                         # no selector axes
├── domain?                        # e.g. coding, writing
├── project_ref?                   # Fielora-owned Project identity
├── task_type?                     # e.g. repository_change
└── interaction_kind?              # e.g. final_response, approval_explanation
```

Examples:

```text
global communication preference
→ GLOBAL
  dimension = COMMUNICATION

final-response-specific communication preference
→ interaction_kind = final_response
  dimension = COMMUNICATION

coding-specific change preference
→ domain = coding
  task_type = repository_change

project-specific architecture preference
→ project_ref = Fielora
  domain = coding
  dimension = ARCHITECTURE
```

`Project` scope uses Fielora-owned identity, never a local path. `Task type`
describes a stable semantic category, not arbitrary free text.

### 7.2 Matching and specificity

1. Every populated selector axis must match the current Work Scope/Context.
2. A non-matching item is excluded, not weakened into a global fallback.
3. More matched selector axes are more specific.
4. Exact Project match wins a specificity tie, then Task Type, Interaction,
   and Domain.
5. Explicit Preference outranks inferred Disposition only after both have
   matched scope; an irrelevant explicit Preference is still excluded.
6. If two orthogonal selectors cannot be safely ordered, resolution emits a
   conflict/ambiguity and omits the direction rather than guessing.

This ordering is a Candidate and must be tested before Contract freeze.

---

## 8. Confidence model

### 8.1 Separate evidence basis from confidence

`EXPLICIT` is not a probability. V2 therefore does not use the single mixed
scale `EXPLICIT / HIGH / MEDIUM / LOW`.

```text
EvidenceBasis
├── EXPLICIT
├── OBSERVED
└── INFERRED

InferenceConfidence
├── HIGH
├── MEDIUM
└── LOW
```

- Facts, Preferences, and Goals with direct human origin have
  `EvidenceBasis=EXPLICIT`; their explicitness says who asserted them, not that
  the claim is objectively true or globally applicable.
- Observations have `EvidenceBasis=OBSERVED`; uncertainty about interpretation
  belongs to a derived Disposition, not the event record.
- Dispositions have `EvidenceBasis=INFERRED` and an ordinal confidence.
- Float probabilities are rejected for V2 because evidence is heterogeneous
  and no calibrated statistical model exists. A number would create false
  precision.

### 8.2 Confidence semantics

| Level | Meaning | Normal resolution behavior |
|---|---|---|
| `HIGH` | Repeated, consistent, relevant evidence with no material unresolved contradiction. | Eligible when lifecycle is Active and scope matches. |
| `MEDIUM` | More than isolated evidence, but meaningful uncertainty remains. | Eligible only as tentative direction; never for high-impact personalization. |
| `LOW` | Single, weak, old, or ambiguous evidence. | Candidate only; excluded from ordinary Direction. |

The ordering is evidence weight, not absolute truth:

```text
explicit human statement
>
repeated consistent observations
>
single observation
>
model inference without supporting evidence
```

Only admitted human correction/confirmation or a deterministic aggregation of
additional qualifying evidence may raise confidence. Model rhetoric, repeated
restatement of the same source, or Agent success cannot raise it. Contradiction,
age, scope drift, failed outcomes, and correction may lower it. The exact
aggregation/decay rules remain open and cannot be invented in implementation.

---

## 9. Lifecycle

All six proposed states are retained because they distinguish materially
different user-control and history cases:

| State | Meaning | Eligible for resolution? |
|---|---|---|
| `CANDIDATE` | Proposed item awaiting sufficient evidence or confirmation. | No |
| `ACTIVE` | Admitted and currently applicable if scope matches. | Yes |
| `WEAKENED` | Previously Active but now insufficiently supported, stale, or scope-drifted without direct contradiction. | No by default |
| `CONFLICTED` | Materially incompatible active evidence/items remain unresolved. | No |
| `SUPERSEDED` | A newer correction, preference, goal, or refined scope explicitly replaces it. | No |
| `REVOKED` | The human denied, removed, or disabled the item. | No |

`WEAKENED` is not confidence duplicated as lifecycle. It records that an item
which once participated in resolution no longer may do so without review.

### 9.1 Typical transitions

```text
CANDIDATE → ACTIVE
ACTIVE → WEAKENED
ACTIVE / WEAKENED → CONFLICTED
ACTIVE / WEAKENED / CONFLICTED → SUPERSEDED
ANY NON-REVOKED → REVOKED
```

- New evidence never turns a Disposition into an Explicit Preference.
- User correction creates a new item/evidence relation and supersedes or
  revokes the old item; it does not rewrite history in place.
- Different preferences may both remain Active when their scopes do not
  overlap.
- Old behavior may become Weakened due to age or repeated non-conforming
  behavior without pretending it never occurred.

---

## 10. Update pipeline

```text
Interaction / Outcome
        ↓
Observation Candidate
        ↓
Sensitive-data admission
        ↓
Source classification
        ↓
Type classification
        ↓
Scope resolution
        ↓
Conflict check
        ↓
Evidence / confidence update
        ↓
Lifecycle decision
        ↓
Durable Human Model
```

This pipeline must never be implemented as `every turn → LLM summary → durable
Memory write`.

### 10.1 Deterministic operations

- accept an explicit `remember` command after sensitive-data admission;
- record a user Setting as an explicit Preference with its exact Setting ref;
- record an explicit correction/removal/reset request;
- bind known Project/Conversation/AgentRun/Setting source references;
- apply exact lifecycle/supersession relations requested by the human;
- reject denied sensitive categories and exact duplicates;
- exclude non-matching scope and non-Active lifecycle states at resolution.

### 10.2 Model-assisted operations

- propose whether free-form language contains a Fact, Preference, Goal, or only
  a current instruction;
- propose a normalized dimension/stance and bounded summary;
- propose Scope when it cannot be derived from current Work Scope;
- detect semantic conflict candidates;
- derive a Disposition Candidate from multiple admitted Observations;
- explain why a Candidate was proposed.

Model assistance produces a proposal, never authoritative admission.

### 10.3 User confirmation required

- ambiguous `remember` intent or ambiguous long-term applicability;
- importing personal data;
- resolving a material conflict the system cannot order safely;
- activating a sensitive or high-impact Fact/Goal/Preference;
- treating a one-off instruction as durable;
- any change that would otherwise imply the human explicitly said something
  they did not say.

Repeated non-sensitive observations may support an inferred Disposition, but
automatic activation thresholds and eligible dimensions are not frozen.

---

## 11. Conflict, correction, and revocation

### 11.1 User-control semantics

| Operation | Contract-level meaning |
|---|---|
| `remember explicitly` | Admit a bounded user-approved Fact, Preference, or Goal if allowed by sensitive-data policy. |
| `correct` | Add correction evidence and a replacement item; mark affected item Superseded or Revoked. |
| `remove` | Stop using the selected item and mark it Revoked while retaining auditable minimal history. |
| `forget` | Erase the selected Human Model content and unnecessary provenance; retain only the minimum non-sensitive erasure marker needed to honor the request, subject to future Contract review. |
| `reset` | Apply remove/forget semantics to a bounded scope or the local Human Model; never alter Project Reality, Conversation, AgentRun, or Agent Profile. |
| `inspect` | Return typed item, scope, evidence basis, confidence, lifecycle, and bounded provenance; never expose secrets or unnecessary source bodies. |

Example:

```text
Human:
“You remembered it incorrectly. I do not mind refactoring.”

Result:
OBSERVED_CORRECTION evidence
+ new scoped Preference or explicit negation
+ old bounded-change item → SUPERSEDED / REVOKED
```

The correction outranks the previous inference. It does not delete the old
record and pretend the system never held it, unless the human explicitly asks
to forget and privacy semantics require erasure.

### 11.2 Conflict resolution

1. Remove non-overlapping scopes from the conflict set; they may coexist.
2. Apply explicit supersession/revocation relations.
3. Prefer matching explicit Preference over inferred Disposition.
4. Prefer more specific matching Scope over less specific Scope.
5. Use correction recency only when evidence refers to the same semantic claim
   and scope; newer is not automatically better across different contexts.
6. If a material tie remains, mark `CONFLICTED`, omit Direction, and surface a
   typed need-for-clarification signal to the Harness. IDR does not ask the
   human directly or invent a merged preference.

---

## 12. Disposition resolution

Disposition Resolution is IDR's core runtime function.

### 12.1 Inputs

```text
Current Task
Current Work Scope
Current Context references
Current Reality revision/reference
Human Model snapshot
Resolution budget
```

### 12.2 Output

```text
RelevantDispositionSet
├── resolution reference
├── HumanProfile reference
├── Work Scope reference/digest
├── relevant explicit Preferences
├── relevant Active Dispositions
├── relevant Long-term Goals
├── bounded supporting item/provenance references
├── omitted/conflicted counts and reason codes
└── source Human Model revision
```

Facts may enter a separate bounded Human Model context projection when relevant;
they do not become Dispositions. Observations are supporting evidence and do
not enter Model context by default.

### 12.3 Resolution algorithm

1. Select only `ACTIVE` items from the current Human Model revision.
2. Exclude denied/sensitive, superseded, revoked, conflicted, weakened, and
   candidate items.
3. Match all Scope selector axes against the current Work Scope/Context.
4. Reject items contradicted by current Reality or invalidated source facts.
5. Group remaining Preferences/Dispositions/Goals by semantic dimension.
6. Apply explicitness, Scope specificity, correction, and confidence rules.
7. Omit unresolved conflicts and return stable reason codes.
8. Rank by exact relevance and likely task materiality, not general salience.
9. Apply hard item/reference/byte budgets.
10. Produce the structured Direction projection; Ingress & Context retains
    final admission.

### 12.4 Candidate bounds

Provisional non-frozen defaults for Eval:

```text
maximum Direction items: 8
maximum support references per item: 3
maximum serialized IDR projection: 4 KiB UTF-8
```

When a bound is exceeded, lower-ranked items are omitted with counts/reason
codes. IDR must not summarize an unbounded Human Model into opaque prose.

Resolution must be deterministic for the same Human Model revision, Work Scope,
Context facts, and configuration. Model assistance belongs to item proposal or
normalization, not nondeterministic last-second permission-like resolution.

---

## 13. Individualized Direction

`Individualized Direction` is a structured, soft personalization projection:

```text
IndividualizedDirection
├── projection reference
├── resolution / Human Model revision references
├── Work Scope reference/digest
├── items[]
│   ├── dimension
│   ├── guidance kind      # PREFER / AVOID / PRIORITIZE / DEPRIORITIZE / ASK_WHEN
│   ├── bounded normalized target/value
│   ├── signal strength    # STRONG / NORMAL / TENTATIVE; never authority
│   ├── basis              # EXPLICIT_PREFERENCE / INFERRED_DISPOSITION / GOAL
│   ├── matched scope summary
│   ├── supporting item references
│   └── reason code
├── omitted/conflicted counts
└── generated time
```

This is a conceptual contract candidate, not a Rust definition. The normalized
target vocabulary and exact serialization are open.

Example:

```text
Relevant Disposition Set
- CHANGE_SCOPE = bounded_change (explicit preference, coding/repository_change)
- COMMUNICATION = concise (active disposition, global/final_response)
- VERIFICATION = targeted_first (active disposition, coding)

Individualized Direction
- PREFER minimal_change_surface [STRONG]
- AVOID unsolicited_refactor [STRONG]
- PRIORITIZE affected_area_verification_first [NORMAL]
- PREFER concise_final_explanation [NORMAL]
```

Direction is not a Decision, Plan, Command, ToolCall, Permission, Policy, or
completion claim. A Model may reasonably depart from it when current evidence,
instruction, or task needs justify doing so; the departure can be evaluated but
is not automatically a violation.

---

## 14. Precedence and authority boundaries

No single scalar priority can safely mix factual truth and action authority.
V2 uses two orthogonal precedence lanes.

### 14.1 Factual precedence

```text
Current Reality
>
verified/current durable facts
>
historical Memory
>
Human Model inference
```

An IDR Fact records what the human stated. It does not override current Project,
file, Artifact, Goal, or Verification state.

### 14.2 Action and personalization precedence

```text
Hard system / safety / Governance constraints
>
Explicit current user instruction admitted by the Harness
>
Current Work Scope & Goal / mandatory Verification requirements
>
Relevant matching explicit durable Preference / confirmed Goal
>
Relevant Active inferred Disposition
>
Harness/Profile default behavior
```

If a current instruction changes Work Scope, the existing Work Scope/Governance
owners reconcile that change. IDR does not redefine scope or grant authority.

`Individualized Direction` occupies only the lower personalization layers. It
cannot override current instruction, Work Scope, Policy, Permission, Approval,
Safety, Reality, or Verification.

---

## 15. Memory boundary

Memory remains a cross-cutting Domain, not a ninth Harness part.

```text
Memory asks:
What happened and what remains retrievable?

IDR asks:
What does relevant history suggest about this person?
```

Example:

```text
Memory / Continuity:
The human rejected unrelated refactoring in five Runs.

IDR:
coding.repository_change may have a bounded-change Disposition Candidate.
```

IDR stores only the structured Human Model projection and bounded provenance
references it needs. It does not duplicate full Conversations, Agent ledgers,
Tool output, files, or a general vector index. Memory Retrieval may find source
history; IDR decides whether that history supports a typed human-specific item.

---

## 16. Reality boundary

Reality always outranks Memory and IDR.

```text
IDR / Memory:
The human previously used Vue in this Project.

Current Reality:
The Project has migrated to React.

Agent context:
Use React as current fact.
```

IDR cannot overwrite current Project facts, file state, Artifact state, current
Goal, Work Scope, Verification state, or Reality identity. Provider, Model,
Conversation, AgentRun, HumanProfile, and IDR item identity cannot become
Reality identity owners.

---

## 17. Agent Profile boundary

```text
Agent Profile:
Who am I?

IDR:
What kind of human am I serving?
```

`Fielora is a local AI workspace agent` belongs to the versioned Fielora-owned
Agent Profile. It is not a Human Model item, Memory, user preference, or learned
Disposition. Agent Profile and IDR may both be projected through Ingress &
Context, but neither owns the other.

---

## 18. Context integration

The integration target reuses the existing Harness boundary:

```text
Current Request
+ Work Scope
+ Relevant Project Context
+ Memory Retrieval Projection
+ IDR Relevant Disposition
+ Individualized Direction
+ Agent Profile
        ↓
Ingress & Context
        ↓
Model
```

```text
IDR produces a bounded projection.
Ingress & Context owns final admission.
```

IDR cannot append directly to a system prompt, invoke a Provider, bypass context
budgeting/redaction, or force the Model to receive an item. ContextCompiler is
not redesigned by this Candidate. A later Contract must define projection
versioning, trust labels, budget accounting, redaction, and snapshot linkage
before integration is authorized.

---

## 19. Governance boundary

```text
IDR → personalization hint
Governance → authoritative ALLOW / ASK / DENY
```

Example:

```text
IDR:
The human tends to prefer autonomous execution.

Forbidden conclusion:
Permission = FULL_CONTROL
```

IDR does not manage permission presets, approval routing, credentials, network
access, Tool exposure, resource containment, budgets, destructive actions, or
Semantic Authority. Governance does not treat confidence, explicit Preference,
or Direction strength as authorization evidence.

---

## 20. Privacy, local-first, and sensitive admission

### 20.1 Local-first

Future Human Model persistence defaults to local Fielora-owned storage. IDR V2
has no cloud dependency. User inspectability, correction, remove/forget/reset,
bounded retention, and export policy must be defined before implementation.

Out of scope:

```text
cloud sync
cross-device merge
multi-user profile sync
provider-hosted Human Model
```

### 20.2 Data minimization

- Store typed claims and bounded provenance refs, not raw transcript copies.
- Do not store a fact merely because it might someday personalize behavior.
- Do not retain secrets or secret-derived digests.
- Do not use IDR for advertising, engagement optimization, or unrelated
  recommendation profiling.
- Provider prompt/response retention is separate from local IDR persistence.

### 20.3 Sensitive-data admission boundary

Candidate classes:

| Admission | Examples | Behavior |
|---|---|---|
| `DENY` | credentials, passwords, API tokens, private keys, session secrets, authentication material | Never admit, excerpt, hash, infer, or use as provenance content. |
| `EXPLICIT_CONFIRMATION_REQUIRED` | high-risk health, financial, legal, precise-location, intimate, or similarly sensitive personal data | No automatic observation/inference; require explicit remember intent, clear purpose/scope, and future reviewed retention semantics. |
| `BOUNDED_ALLOW` | working style, communication preference, coding trade-offs, product goals | Admit only when relevant, scoped, inspectable, and minimally represented. |

Irrelevant sensitive information is denied even if technically available.
This Candidate defines principles only; it does not authorize a classifier or
claim that deterministic detection is solved.

---

## 21. Failure modes

| Failure mode | Detection | Fail-safe behavior | Recovery |
|---|---|---|---|
| Wrong preference inference | Correction, repeated contrary behavior, Eval mismatch | Omit Low/Candidate item; never recast as explicit | Weaken/revoke/supersede and preserve correction evidence |
| Stale preference | Age, Reality change, repeated non-conforming evidence | Exclude Weakened item | Reconfirm or replace with new scoped item |
| Scope leakage | Projection item has unmatched selector or cross-project source | Drop item and record scope-mismatch reason | Correct Scope; add regression Eval |
| Conflicting preferences | Same dimension, overlapping Scope, incompatible stance | Mark Conflicted and omit | Apply correction/specificity or request clarification through Harness |
| Over-personalization | Direction emitted without relevant evidence or changes unrelated behavior | Fall back to Harness/Profile default | Revoke item, tighten scope/bounds, add negative Eval |
| Under-personalization | Active relevant explicit Preference omitted | Preserve task behavior; report omission telemetry locally | Repair ranking/budget logic and replay Eval |
| Too much IDR context | Count/byte budget exceeded | Deterministically omit lower-ranked items | Inspect ranking and adjust reviewed bounds |
| User correction ignored | Superseded/revoked item appears in projection | Reject projection as invalid | Rebuild from latest Human Model revision; regression test |
| IDR overrides explicit instruction | Output conflicts with current instruction | Ignore Direction | Mark authority-boundary defect; replay with invariant Gate |
| IDR overrides Reality | Human Model claim conflicts with current Reality | Use Reality and omit claim | Weaken/invalidate source-dependent item |
| IDR overrides Governance | Direction changes allow/ask/deny or Tool access | Reject action path; fail closed | Security defect review; no preference-based retry |
| Hallucinated user fact | Fact lacks explicit/approved human provenance | Reject item | Reclassify as Disposition Candidate or delete invalid item |
| Cross-project preference leakage | Project-scoped item appears under another ProjectRef | Drop item | Correct selector/index and add cross-project isolation Eval |

Wrong or unavailable IDR data must degrade to ordinary non-personalized Harness
behavior, never to broader authority or blocked essential safety behavior.

---

## 22. Eval strategy

### 22.1 Controlled A/B design

```text
Same Model
Same Harness
Same Task
Same Tools
Same permission / seed / fixture

A: IDR disabled
B: IDR enabled
```

The comparison must preserve task authority, available context other than IDR,
and verification requirements. IDR cannot receive an easier task or broader
Tool access.

### 22.2 Required scenario families

#### Explicit Preference Eval

The human has explicitly stated a scoped preference. Scenarios should cover
bounded repository changes, concise versus detailed final communication,
targeted-first verification, and a Project-specific architecture preference.
Measure stable adherence without reducing task success.

#### Inferred Disposition Eval

Only behavior evidence exists. Include repeated consistent evidence, a single
ambiguous Observation, non-matching scopes, and a negative control with no
relevant history. The enabled arm must remain tentative and avoid inventing an
explicit preference or over-personalizing the negative control.

#### Preference Change Eval

Start with an Active old Preference/Disposition, then introduce explicit human
correction or a new scoped Preference. Verify lifecycle transition, exclusion
of the old item, application of the new item, and preservation of auditable
history without scope leakage.

### 22.3 Metrics

```text
user preference adherence
task success / verification success
unrelated files, hunks, or behavior changes
explicit instruction violations
clarification burden
correction application latency
over-personalization rate
wrong-memory / hallucinated-fact rate
scope leakage rate
conflict omission correctness
IDR projection token overhead
resolution latency overhead
Model latency overhead
```

Authority-boundary violations, secret admission, Reality override, Governance
override, and use of revoked/superseded items are hard-zero safety metrics.

### 22.4 Evaluation evidence

- Record exact Human Model revision, Work Scope, IDR projection, Model/Profile,
  Tool catalog, permission mode, task result, and Verification receipt.
- Do not store private raw Conversations merely for Eval.
- Separate direction adherence from task success: a personalized failure is
  still a failure.
- Include blind human review where style/adherence cannot be scored
  deterministically.
- Report negative effects and overhead; do not declare value from storage or
  projection tests alone.

Acceptance thresholds, scenario corpus, eligible dimensions, and maximum
overhead remain open. The Contract cannot freeze until they are reviewed.

---

## 23. Open questions

1. Is `HumanProfileId` necessary for the local single-human aggregate, or is a
   fixed local profile reference sufficient?
2. Which Disposition dimensions and normalized values are required for the
   first product proof without creating an arbitrary taxonomy?
3. Which non-sensitive inferred dimensions may become Active automatically,
   and which always require confirmation?
4. What evidence diversity/count and age rules produce High/Medium/Low without
   hidden pseudo-probability?
5. Should Observation retention use time decay, bounded sampling, aggregation,
   or explicit user-controlled retention?
6. How does free-form language distinguish a current instruction from durable
   `remember` intent without reintroducing IDR as intent parser?
7. Are the Scope selector axes and tie-break order sufficient for writing,
   research, design, and non-coding work?
8. Are 8 Direction items, 3 support refs per item, and 4 KiB projection the
   right Eval bounds?
9. Which sensitive categories are categorically denied versus allowed only by
   explicit confirmation?
10. How should `forget` balance erasure with a minimal marker that prevents the
    same evidence being re-learned?
11. What A/B non-inferiority and overhead thresholds are required before any
    product integration?
12. How are Model-assisted item proposals evaluated for provider neutrality?

None of these may be silently answered by implementation defaults.

---

## 24. Implementation preconditions

No Contract or Schema work may start until the user reviews and accepts:

```text
Human Model ontology
Scope model
Confidence semantics
Lifecycle
Direction contract
Memory boundary
Privacy and user-control semantics
Eval plan
```

The 2026-08-28 `IDR V2 CONTRACT REVIEW` execution instruction satisfied this
sequencing prerequisite for drafting the Contract Candidate only. It did not
freeze the Design or Contract and did not authorize Schema or implementation.

Only after that review may work proceed in this order:

```text
IDR V2 CONTRACT
→ Schema Candidate
→ Persistence
→ Resolver
→ Context integration
→ Eval
```

Every stage requires its own authorization and must reuse existing Harness,
Governance, Continuity, Ingress & Context, Verification, Reality, and
persistence boundaries. This Candidate does not authorize any stage above.
