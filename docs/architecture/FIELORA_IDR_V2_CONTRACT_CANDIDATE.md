# Fielora IDR V2 Contract Candidate

## 1. Status

```text
DOCUMENT: FIELORA_IDR_V2_CONTRACT_CANDIDATE.md
STATUS: DRAFT / CANDIDATE / NOT FROZEN
IMPLEMENTATION: NOT AUTHORIZED
SCHEMA: NOT AUTHORIZED
MIGRATION: NONE
RUNTIME: NOT IMPLEMENTED
FIPC: NOT DESIGNED
UI: OUT OF SCOPE
DATE: 2026-08-28
```

This document refines the accepted semantic design in
`FIELORA_IDR_V2_DESIGN_CANDIDATE.md` into a minimum versionable Contract
Candidate. Shapes below are conceptual semantic contracts, not Rust structs,
Serde models, tables, indexes, or wire-format commitments.

The physical mapping review is tracked in
`FIELORA_IDR_V2_SCHEMA_CANDIDATE.md`. It remains
`DRAFT / CANDIDATE / NOT FROZEN`; no Migration, Runtime, or implementation is
authorized.

---

## 2. Purpose

The Contract answers:

> What are the minimum stable contracts required to implement IDR V2 without
> ambiguity while preserving the existing Fielora Agent authority boundaries?

It defines types, identities, references, lifecycle transitions, inputs,
outputs, boundedness, versioning, deterministic ownership, and failure
semantics for `Harness.IDR`.

It does not define persistence layout, extraction prompts, automatic learning,
ContextCompiler behavior, UI, or Eval implementation.

---

## 3. Contract principles

1. `Agent = Model + Harness + Tools`; IDR remains `Harness.IDR`.
2. One unified `HumanModelItem` carries five closed semantic kinds.
3. Fact, Preference, Observation, Disposition, and Long-term Goal do not mutate
   into one another in place.
4. Every durable item has admitted provenance and bounded scope.
5. Model-assisted extraction creates proposals only.
6. Admission, lifecycle, scope matching, precedence, bounds, and authority are
   deterministic Harness-owned decisions.
7. Current instruction, Work Scope, Governance, Reality, and Verification
   always outrank personalization.
8. IDR degrades to ordinary non-personalized behavior on missing, invalid,
   conflicted, or over-budget data.
9. Contracts are Provider-neutral and Fielora-owned.
10. Boundedness is a Contract invariant; concrete bound values belong to a
    versioned resolution profile.
11. No raw episodic history, secret, credential, or Provider prose becomes
    canonical Human Model content by default.
12. Contract versioning cannot silently reinterpret an existing item.

Permanent separation:

```text
Preference ≠ Permission
Observation ≠ Preference
Inference ≠ Fact
Memory ≠ Reality
Disposition ≠ Decision
Proposal ≠ committed state
CLARIFY_WHEN ≠ Governance.ASK
```

---

## 4. Authority boundary

IDR contracts carry personalization facts and signals only. They never carry
or mutate:

```text
permission mode
Approval Routing
Tool effect
Tool availability
network access
credential access
execution mandate
Safety policy
Verification requirement/result
Reality mutation/identity
final decision authority
```

Model output may propose a Human Model update. Only deterministic IDR
admission/lifecycle logic operating on validated inputs and the expected Human
Model revision can commit a transition.

`IndividualizedDirection` is non-authoritative even when it is supported by an
explicit Preference. No EvidenceBasis, confidence, scope specificity, or
Direction kind can be interpreted as permission.

---

## 5. Contract surface

### 5.1 Required-set review

| Candidate | Decision | Contract role / reason |
|---|---|---|
| `HumanModelItem` | `KEEP` | Unified durable semantic item. |
| `HumanModelItemId` | `KEEP` | Stable Fielora-owned opaque item identity. |
| `HumanProfileId` | `REMOVE` for V2 | Local primary human is a singleton; an opaque profile ID would create unused multi-profile abstraction. |
| `ProvenanceRef` | `KEEP` | Explains admitted origin without transcript duplication. |
| `DispositionScope` | `KEEP` | Bounded selector required for non-leaking resolution. |
| `EvidenceBasis` | `KEEP` | Separates human-controlled, observed, and inferred basis from confidence. |
| `InferenceConfidence` | `KEEP` | Ordinal confidence for `DISPOSITION` only. |
| `HumanModelLifecycle` | `KEEP` | Controls eligibility and preserves correction history. |
| `HumanModelUpdateProposal` | `KEEP` | Non-authoritative update request from Model/inference/deterministic detectors. |
| `HumanModelCorrection` | `KEEP` | Explicit human-authoritative correction has different semantics from a proposal. |
| `HumanModelForgetRequest` | `KEEP` | Unified disable/erasure/reset request. |
| `RelevantDisposition` | `KEEP` | Bounded resolver projection; prevents exposure of full items. |
| `IndividualizedDirection` | `KEEP` | Core structured personalization output. |
| `IndividualizedDirectionItem` | `KEEP` | Closed structured guidance item. |
| `DispositionResolutionInput` | `KEEP` | Versioned deterministic input snapshot. |
| `DispositionResolutionResult` | `KEEP` | Explainable included/excluded result plus Direction. |
| `IDRProjection` | `KEEP` | Context-facing bounded envelope controlled by Ingress & Context. |

### 5.2 Additional minimum contracts

| Candidate | Decision | Contract role / reason |
|---|---|---|
| `HumanModelAdmissionDecision` | `KEEP` | Sensitive-data gate required before any durable transition. |
| `HumanModelUpdateResult` | `KEEP` | Reports committed/no-op/rejected/requires-explicit outcome and revision. |
| `HumanModelKind` | `MERGE` | Closed discriminant within `HumanModelItem`; not an independent aggregate. |
| `RelevantDispositionSet` | `MERGE` | Becomes `DispositionResolutionResult.included[]`. |
| `HumanContextProjectionItem` | `MERGE` | Inline bounded Fact/Goal projection within `IDRProjection`. |
| `HumanModelDeleteRequest` | `REMOVE` | Semantics are covered by `HumanModelForgetRequest.mode`. |
| `resolution_revision` | `REMOVE` | Replaced by meaningful input revisions, profile version, and deterministic `resolution_ref`. |
| `DirectionSignalStrength` | `REMOVE` | Basis/confidence/source precedence already express tentativeness; a strength field risks being mistaken for authority. |
| exact dimension/value vocabulary | `DEFER` | Requires first Contract/Eval profile; arbitrary prose/JSON remains forbidden. |

### 5.3 Identity set

```text
HumanModelItemId
HumanModelRevision
ResolutionRef
ProvenanceRef
existing Project / Conversation / Message / AgentRun / Event / Setting refs
```

An ID is never derived from content, local path, Provider, model, Conversation
session, or source-system identity.

---

## 6. HumanModelItem

### 6.1 Conceptual shape

```text
HumanModelItem
├── contract_version
├── item_id: HumanModelItemId
├── kind: FACT | PREFERENCE | OBSERVATION | DISPOSITION | LONG_TERM_GOAL
├── semantic_payload              # closed shape selected by kind
├── scope: DispositionScope
├── evidence_basis: EvidenceBasis
├── inference_confidence?         # required only for DISPOSITION
├── provenance_refs[]             # non-empty, bounded
├── lifecycle: HumanModelLifecycle
├── supersedes_item_refs[]        # bounded; empty unless replacement relation
├── reality_dependency_refs[]     # bounded and optional
├── created_human_model_revision
├── last_updated_human_model_revision
├── created_at
├── last_updated_at
└── display_summary?              # bounded, inspectable, non-authoritative
```

This is not a persistence field list. Contract-semantic fields are those
needed to validate kind, source authority, scope, lifecycle, deterministic
resolution, supersession, Reality invalidation, inspection, and snapshot
replay. Table keys, columns, indexes, serialization layout, event storage,
cache layout, encryption, tombstones, and transaction shape are future
persistence decisions.

### 6.2 Semantic payload

One item uses a closed discriminated payload, not five unrelated runtime
classes:

| Kind | Minimum normalized meaning |
|---|---|
| `FACT` | human-related subject key + bounded typed assertion/value |
| `PREFERENCE` | dimension + normalized preferred/avoided value or trade-off |
| `OBSERVATION` | bounded event/choice/correction/outcome classification |
| `DISPOSITION` | dimension + inferred tendency/value |
| `LONG_TERM_GOAL` | bounded goal key + desired durable outcome |

Free prose may be retained only as a bounded display summary. Resolver and
precedence operate on validated normalized semantics, never on display prose.

### 6.3 Identity and immutability

- `HumanModelItemId` is stable and Fielora-owned.
- Semantic kind never changes in place.
- Content or Scope correction creates a new item linked by supersession.
- Evidence/confidence/lifecycle changes advance `HumanModelRevision` and retain
  transition history; they do not change item identity.
- Provider/model swap cannot change item identity or Human Model revision.
- An item has no HumanProfile subject field in V2 because all items belong to
  the local primary human singleton.

---

## 7. HumanProfile identity decision

### 7.1 Decision

```text
HumanProfileId: REMOVE FROM V2 CONTRACT
```

V2 has exactly one semantic subject: `LOCAL_PRIMARY_HUMAN`. This is a Contract
invariant, not a serializable security identity or public ID type.

### 7.2 Rationale

- No current multi-profile behavior requires an opaque identifier.
- Adding it now would imply unsupported tenant/principal/profile switching.
- Stable item identity and a singleton aggregate are sufficient for local
  ownership, snapshots, corrections, and Eval.
- Cross-device/profile merge is explicitly out of scope.

If real multi-profile behavior appears, a later Contract version and Change
Impact may add an opaque ID. Such an ID would still not be authentication,
principal, permission, or Reality identity.

---

## 8. Human Model kinds

### 8.1 `FACT`

A descriptive human-related assertion from either:

1. an explicit human-controlled source; or
2. a deterministic, independently supported, fact-eligible Fielora source that
   has passed Human Model admission.

`SYSTEM_INFERENCE` and Provider prose cannot create a Fact. Independently
supported Fact sources are not open-ended Model conclusions; the eligible
source registry is deferred and defaults to none beyond explicit/approved
sources.

A Fact records an admitted human-related assertion, not objective Project
truth. Current Reality always wins.

### 8.2 `PREFERENCE`

An explicit durable human request for a default, mode, style, behavior, or
trade-off. It requires explicit human-controlled provenance.

A current-turn instruction is part of current Context/Work Scope and does not
become a durable Preference unless the human explicitly requests durable
retention or confirms a proposed durable item.

### 8.3 `OBSERVATION`

A bounded recorded human action, correction, choice, interaction event, or
outcome with observed provenance. It is evidence only. It cannot directly
produce Direction and cannot silently become a Preference.

### 8.4 `DISPOSITION`

A derived tendency inferred from admissible evidence. It is always:

```text
INFERRED
scoped
correctable
non-authoritative
```

High confidence does not make it a Fact or explicit Preference.

### 8.5 `LONG_TERM_GOAL`

A durable human goal explicitly stated or explicitly confirmed. A current
Task/Run Goal cannot be automatically promoted. In V2 Conservative activation,
model-inferred Goals remain proposals and cannot become Active without human
confirmation.

### 8.6 Dimension boundary

Working Style, Behavioral Pattern, Communication, Decision, Risk, Workflow,
Change Scope, Verification, Planning, and Architecture remain dimensions or
normalized values. They do not create new top-level Human Model kinds.

---

## 9. ProvenanceRef

### 9.1 Source types

```text
EXPLICIT_USER_STATEMENT
EXPLICIT_USER_SETTING
USER_ACTION
USER_CORRECTION
AGENT_OUTCOME
USER_APPROVED_IMPORT
SYSTEM_INFERENCE
```

`CONVERSATION_REF` is removed as a source type because it is a locator, not an
authority origin. Conversation/Message/Event/Setting/etc. belong in the tagged
`source_ref`.

### 9.2 Conceptual shape

```text
ProvenanceRef
├── source_type
├── source_ref                   # Fielora-owned tagged reference
├── observed_at
├── bounded_support?             # minimal human evidence, not transcript
├── source_digest?               # never secret-derived
├── admission_relation?          # confirmation/correction/import relation
└── source_status_at_admission
```

Requirements:

- Every HumanModelItem has at least one provenance ref.
- A `SYSTEM_INFERENCE` references admitted support items/sources; model prose
  is not sufficient support.
- Full Conversations, Tool output, model responses, and files are not copied.
- Provider/model identity is provenance metadata at most and never Human Model
  authority.
- Source digest supports integrity only; it does not prove truth.

### 9.3 Source unavailable semantics

- Source unavailability is reported by resolution, not hidden.
- An explicit admitted Preference/Fact/Goal may remain Active using its bounded
  admission evidence when the external source later becomes unavailable,
  unless that source was revocable current state such as a removed Setting.
- An unavailable Observation cannot support a new Disposition.
- An inferred Disposition whose required supporting sources are unavailable is
  excluded with `SOURCE_MISSING` and becomes eligible for a deterministic
  `WEAKEN` proposal.
- Missing sources never trigger transcript reconstruction or a Provider call.

---

## 10. EvidenceBasis

```text
EvidenceBasis
├── EXPLICIT
├── OBSERVED
└── INFERRED
```

`EXPLICIT` means a human-authored or human-controlled durable assertion,
setting, correction, confirmation, or approved import. It is intentionally
broader than only literal speech, but every explicit source must carry an
auditable user-control relation.

`OBSERVED` means a deterministically recorded action/event/outcome or a future
fact-eligible source; it does not mean the human expressed a preference.

`INFERRED` means semantic derivation from admitted evidence. It is required for
`DISPOSITION` and forbidden from independently establishing Fact, Preference,
or Long-term Goal.

EvidenceBasis is orthogonal to lifecycle and confidence:

```text
EXPLICIT + CONFLICTED is valid.
INFERRED + HIGH is valid and still non-explicit.
```

---

## 11. InferenceConfidence

```text
InferenceConfidence
├── LOW
├── MEDIUM
└── HIGH
```

| Level | Contract meaning |
|---|---|
| `LOW` | Weak, single-source, ambiguous, old, or insufficiently repeated evidence. |
| `MEDIUM` | Repeated or contextually consistent evidence with meaningful remaining uncertainty. |
| `HIGH` | Strong repeated independent, scope-stable, materially non-conflicting evidence under a reviewed rule profile. |

Rules:

- Confidence is valid only for `DISPOSITION`.
- Confidence is absent, not `UNKNOWN`/`NOT_APPLICABLE`, for other kinds.
- `LOW` Disposition remains Candidate.
- V2 Conservative activation keeps all inferred Dispositions Candidate until
  explicit activation confirmation, regardless of confidence.
- `HIGH` inferred confidence never becomes an explicit Preference or Fact.
- Repetition of the same source or Model restatement cannot raise confidence.
- Float probability is not part of the Contract.

`UNKNOWN` and `NOT_APPLICABLE` are therefore removed; conditional field
presence and item validation are sufficient.

---

## 12. DispositionScope

### 12.1 Shape

```text
DispositionScope
├── domain?
├── project_ref?
├── task_type?
└── interaction_kind?

GLOBAL = all selectors absent
```

All selectors are bounded validated tokens or Fielora-owned references. Scope
is not a tree/DSL and never uses a local path as Project identity.

### 12.2 Matching

```text
every populated selector matches structured current input
→ MATCH

any populated selector does not match
→ EXCLUDE / SCOPE_MISMATCH
```

There is no partial fallback from a scoped item to Global.

### 12.3 Specificity key

For two matching items in the same semantic dimension, calculate this
lexicographic key:

```text
1. project_ref present       # exact Project context wins first
2. number of populated selectors
3. task_type present
4. interaction_kind present
5. domain present
```

Higher key is more specific. This yields predictably:

```text
PROJECT + TASK_TYPE > PROJECT
PROJECT > DOMAIN + TASK_TYPE
DOMAIN + TASK_TYPE > DOMAIN
DOMAIN > GLOBAL
```

Scope specificity is applied only after lifecycle/supersession validation and
does not let an inferred item outrank a matching explicit Preference merely by
adding arbitrary selectors. Proposed Scope must be validated against provenance
to prevent synthetic over-specificity.

An unresolved equal-specificity conflict is excluded, not merged by prose.

---

## 13. Lifecycle

```text
HumanModelLifecycle
├── CANDIDATE
├── ACTIVE
├── WEAKENED
├── CONFLICTED
├── SUPERSEDED
└── REVOKED
```

### 13.1 Allowed transition table

| From | To | Minimum trigger | Recoverable state? | User-correctable? |
|---|---|---|---|---|
| `CANDIDATE` | `ACTIVE` | Activation rules satisfied at expected revision | Yes | Yes |
| `CANDIDATE` | `REVOKED` | Human rejection/remove or admission denial | Terminal target | New item only |
| `ACTIVE` | `WEAKENED` | Support loss, staleness, or qualifying contrary evidence | Yes | Yes |
| `ACTIVE` | `CONFLICTED` | Material overlapping contradiction | Yes | Yes |
| `ACTIVE` | `SUPERSEDED` | Explicit replacement/correction | Terminal target | New item only |
| `ACTIVE` | `REVOKED` | Explicit disable/remove/denial | Terminal target | New item only |
| `WEAKENED` | `ACTIVE` | New qualifying evidence or explicit reconfirmation | Yes | Yes |
| `WEAKENED` | `SUPERSEDED` | Explicit replacement/correction | Terminal target | New item only |
| `WEAKENED` | `REVOKED` | Explicit disable/remove/denial | Terminal target | New item only |
| `CONFLICTED` | `ACTIVE` | Deterministic conflict resolution or explicit correction | Yes | Yes |
| `CONFLICTED` | `SUPERSEDED` | Replacement resolves conflict | Terminal target | New item only |
| `CONFLICTED` | `REVOKED` | Explicit disable/remove/denial | Terminal target | New item only |

All other lifecycle changes are `INVALID_TRANSITION`.

### 13.2 Terminal semantics

- `SUPERSEDED` and `REVOKED` are terminal for that item.
- A Revoked item never reactivates. Later evidence creates a new item with a
  new `HumanModelItemId`.
- A Superseded item's content/history may remain inspectable subject to forget/
  erasure semantics, but it never participates in resolution.
- Correction of a terminal item creates a new item; it does not mutate the
  terminal state.
- Strengthening an Active item may update evidence/confidence at a new Human
  Model revision without a lifecycle change.

---

## 14. Activation rules

All activation requires valid kind payload, non-empty admitted provenance,
resolved Scope, sensitive-data admission, conflict check, expected Human Model
revision, and a legal lifecycle transition.

### 14.1 Kind rules

| Kind | Initial lifecycle | May become Active when |
|---|---|---|
| `FACT` | `CANDIDATE` unless exact explicit admission is part of the same deterministic command | Explicit human-controlled source or approved fact-eligible deterministic source passes admission. |
| `PREFERENCE` | `CANDIDATE` unless exact explicit durable intent is part of the same deterministic command | Human explicitly requests/approves durability; current-turn instruction alone is insufficient. |
| `OBSERVATION` | `ACTIVE` after deterministic source/admission validation | The recorded event occurred and is bounded; Active means valid evidence, not personalization authority. |
| `DISPOSITION` | `CANDIDATE` | Human explicitly approves using the inference as a soft personalization source. |
| `LONG_TERM_GOAL` | `CANDIDATE` unless explicit durable confirmation is part of the same command | Human explicitly states/confirms long-term durability; current Task is insufficient. |

If the human confirms that an inferred Disposition is actually an explicit
Preference, create a new `PREFERENCE` and supersede/revoke the Disposition. If
the human only approves using the inference, the item may become Active but
remains `DISPOSITION + INFERRED`.

### 14.2 Automatic activation policy review

| Option | Decision | Reason |
|---|---|---|
| A — Conservative | `ADOPT FOR V2` | Explicit items may activate; Observations remain evidence; inferred Dispositions require human activation confirmation. Minimal and testable without hidden thresholds. |
| B — Bounded Automatic | `DEFER` | Potentially valuable, but requires accepted eligible dimensions, evidence independence/count/age rules, sensitive classification, and Eval thresholds. |
| C — Fully Adaptive | `REJECT` | Continuous Model inference/activation would create opaque durable mutation and over-personalization risk. |

V2 therefore performs no automatic activation of inferred Dispositions.

---

## 15. Update proposal

### 15.1 Shape

```text
HumanModelUpdateProposal
├── contract_version
├── proposal_ref
├── operation
│   ├── ADD_CANDIDATE
│   ├── STRENGTHEN
│   ├── WEAKEN
│   ├── MARK_CONFLICT
│   ├── SUPERSEDE
│   └── REVOKE
├── target_item_refs[]
├── proposed_item?                # required for ADD_CANDIDATE/replacement
├── proposed_provenance_refs[]
├── proposed_reason_code
├── proposer_class                # MODEL_ASSISTED / RULE_DERIVED
├── expected_human_model_revision
└── proposal_time
```

`CORRECT` is removed from the proposal operation enum. Explicit correction has
its own `HumanModelCorrection` Contract and authority semantics.

### 15.2 Proposal semantics

- A proposal is not a HumanModelItem, transition, or committed revision.
- Model/inference may only propose.
- Proposer class is provenance/diagnostic metadata, not authority identity.
- Deterministic admission revalidates payload, provenance, sensitive class,
  scope, conflicts, expected revision, and transition.
- A stale expected revision returns `REVISION_CONFLICT`; it is never silently
  rebased.

### 15.3 Update result

```text
HumanModelUpdateResult
├── outcome: COMMITTED | NO_OP | REJECTED | REQUIRES_EXPLICIT
├── previous_human_model_revision
├── resulting_human_model_revision?
├── affected_item_refs[]
└── reason_codes[]
```

Only `COMMITTED` changes durable Human Model state.

---

## 16. Correction

```text
HumanModelCorrection
├── contract_version
├── correction_ref
├── correction_kind
│   ├── CORRECT_CONTENT
│   ├── CORRECT_SCOPE
│   ├── CORRECT_KIND
│   ├── SUPERSEDE_ITEM
│   └── REVOKE_INFERENCE
├── target_item_refs[]
├── replacement_semantics?
├── explicit_user_correction_provenance
├── expected_human_model_revision
└── requested_at
```

Rules:

1. Correction must have explicit human-controlled provenance.
2. Content, Scope, or Kind correction never overwrites the old item.
3. A replacement creates a new item, normally Active after full admission; old
   item becomes Superseded.
4. `REVOKE_INFERENCE` may revoke without replacement.
5. Explicit user correction outranks inferred Disposition and may resolve a
   Conflicted item.
6. Correction cannot change external Conversation, Reality, Governance, or
   Verification state.
7. Revision mismatch fails with `REVISION_CONFLICT`.

---

## 17. Forget / erasure

One Contract is sufficient:

```text
HumanModelForgetRequest
├── contract_version
├── request_ref
├── mode
│   ├── DISABLE_USE
│   ├── ERASE_IF_ALLOWED
│   └── RESET_PROFILE
├── target_item_refs[]            # empty only for RESET_PROFILE
├── expected_human_model_revision
├── explicit_user_request_provenance
└── requested_at
```

### 17.1 Mode semantics

| Mode | Immediate effect inside IDR | Retained inside IDR |
|---|---|---|
| `DISABLE_USE` | Target items become Revoked and disappear from all future resolution/projection. | Bounded item/provenance and lifecycle history remain inspectable. |
| `ERASE_IF_ALLOWED` | Target items are immediately excluded; erasable IDR-owned payload, excerpt, digest, and derived indexes are removed. | Only a minimal non-semantic erasure receipt may remain: request/time/result and opaque affected refs where policy permits. |
| `RESET_PROFILE` | All local-primary-human items are immediately excluded and all erasable IDR-owned Human Model content is removed. | Minimal reset/erasure receipt only; Agent Profile and non-IDR state remain. |

`RESET_PROFILE` names the semantic local Human Model aggregate; it does not
reintroduce `HumanProfileId`.

### 17.2 Authority limits

Forget/erasure does not delete Conversation messages, AgentRun/Event history,
Reality, files, Provider data, logs owned by other retention contracts, or
backups outside IDR authority. The result must report
`EXTERNAL_HISTORY_NOT_AFFECTED`; it cannot claim global deletion.

Derived Dispositions supported only by erased/disabled evidence are immediately
excluded and deterministically proposed for weakening/revocation.

---

## 18. Resolution input

```text
DispositionResolutionInput
├── contract_version
├── resolution_profile_version
├── human_model_revision / snapshot_ref
├── current_task_ref / normalized task type
├── work_scope_ref / structured scope projection
├── current_project_ref?
├── interaction_kind?
├── current_instruction_constraints_ref/digest?
├── reality_projection_ref / revision
├── source_availability_snapshot_ref?
├── evaluation_time               # explicit if time rules are enabled
└── bound_profile_ref
```

Inputs are structured, validated, and Fielora-owned. IDR does not parse raw
current instructions, read the filesystem, fetch missing Memory, invoke a
Provider, or infer Permission during resolution.

The `current_instruction_constraints` projection contains only already-admitted
current constraints needed to prevent contradictory Direction; Work Scope &
Goal and Ingress & Context remain owners.

---

## 19. Resolution output

```text
DispositionResolutionResult
├── contract_version
├── resolution_ref
├── resolution_profile_version
├── source_human_model_revision
├── included[]: RelevantDisposition
├── excluded[]
│   ├── source_item_ref
│   └── reason_codes[]
├── direction: IndividualizedDirection
├── projection_bound_result
│   ├── included_count
│   ├── omitted_count
│   └── serialized_size
└── diagnostics_digest
```

`RelevantDispositionSet` is merged into `included[]`; a second collection
Contract is unnecessary.

Resolution failure degrades to an empty included set and empty Direction when
safe. Invalid contract version, invalid structured input, or impossible bound
validation returns a typed Contract error and no projection.

---

## 20. RelevantDisposition

```text
RelevantDisposition
├── source_item_ref
├── source_kind                  # PREFERENCE / DISPOSITION / LONG_TERM_GOAL
├── dimension
├── normalized_value
├── matched_scope
├── evidence_basis
├── inference_confidence?        # present only for DISPOSITION
├── support_provenance_refs[]    # bounded
└── inclusion_reason_code
```

Only Active, scope-matched, Reality-valid items may appear. Fact is projected
separately when needed; Observation is supporting evidence only.

The projection excludes full HumanModelItem payload, display summary, complete
provenance, lifecycle history, and raw source content.

---

## 21. IndividualizedDirection

```text
IndividualizedDirection
├── contract_version
├── resolution_ref
├── source_human_model_revision
├── work_scope_ref/digest
├── items[]: IndividualizedDirectionItem
├── omitted_count
└── conflict_count
```

```text
IndividualizedDirectionItem
├── kind: DirectionKind
├── dimension
├── normalized_value
├── matched_scope_summary
├── source_item_refs[]            # RelevantDisposition/HumanModelItem refs
└── reason_code
```

No canonical free prose is allowed in either Contract. Ingress & Context may
compile a validated projection into bounded natural language for a Model, but
that presentation is not the semantic Contract.

`DirectionSignalStrength` is removed. Explicitness and inference confidence
remain explainable through the referenced RelevantDisposition without creating
an authority-like strength scalar.

### 21.1 IDRProjection

```text
IDRProjection
├── contract_version
├── resolution_ref
├── source_human_model_revision
├── resolution_profile_version
├── trust_class = PERSONALIZATION_SIGNAL_NON_AUTHORITATIVE
├── relevant_human_context[]
│   ├── source_item_ref           # FACT or LONG_TERM_GOAL only
│   ├── kind
│   ├── bounded normalized value
│   ├── matched scope
│   └── reason code
├── individualized_direction
├── omitted/conflicted summary
└── serialized_size
```

IDR produces this projection. Ingress & Context owns final admission,
redaction, budgeting, snapshot linkage, and Model-facing compilation.

### 21.2 Direction bounds

Boundedness is a semantic Contract invariant. Concrete limits belong to the
versioned resolution/bound profile rather than the permanent type definition.
The V2 Candidate default profile is:

```text
max 8 IndividualizedDirectionItem entries
max 3 support provenance refs per RelevantDisposition
max 4 KiB serialized IDRProjection
```

These values are reviewable profile defaults, not frozen schema constants.
Resolution deterministically omits lower-precedence items and reports
`PROJECTION_LIMIT`; it never truncates a normalized token or emits invalid
structured content. An unknown/invalid bound profile fails closed.

---

## 22. Direction kind naming

```text
DirectionKind
├── PREFER
├── AVOID
├── PRIORITIZE
├── DEPRIORITIZE
└── CLARIFY_WHEN
```

Decision:

```text
ASK_WHEN → CLARIFY_WHEN
```

`CLARIFY_WHEN` means a soft preference to seek human clarification under the
normalized ambiguity condition. It does not open Approval, route Governance,
change `ALLOW / ASK / DENY`, pause execution by authority, or require a Tool.
The Model/Orchestration decides whether and how to clarify within current
instruction and Work Scope.

---

## 23. Precedence

### 23.1 External authority precedence

```text
Hard system / Safety / Governance constraints
>
explicit current user instruction admitted by the Harness
>
current Work Scope & Goal / mandatory Verification requirements
>
matching explicit durable Preference / confirmed Long-term Goal
>
matching Active inferred Disposition
>
Harness/Profile default
```

Current instruction always wins over durable Preference. Example:

```text
Durable Preference:
minimal delta

Current admitted instruction:
“This time, refactor the whole module.”

Result:
the durable minimal-delta item is excluded for this resolution with
CURRENT_INSTRUCTION_OVERRIDE
```

IDR does not itself redefine Work Scope when instructions conflict; existing
Harness owners reconcile scope first.

### 23.2 Internal personalization selection

After lifecycle, supersession, scope matching, current instruction, and Reality
validation:

1. Explicit correction relations win.
2. `PREFERENCE` outranks `LONG_TERM_GOAL`, which outranks `DISPOSITION` for the
   same behavior dimension.
3. More specific matching Scope wins using the Section 12 key.
4. Confidence orders two inferred Dispositions only after identical scope.
5. Recency is used only by explicit correction/supersession, never as a general
   “newer is true” rule.
6. An unresolved tie becomes exclusion with `SOURCE_CONFLICT`.

---

## 24. Determinism boundary

```text
Natural-language semantic extraction
→ may be Model-assisted

Candidate generation / normalization
→ may be Model-assisted

Update proposal
→ may be Model-assisted, never committed state

Sensitive admission decision
→ rule-governed; explicit human confirmation is structured input

Lifecycle admission / transition
→ deterministic

Scope matching / specificity
→ deterministic

Precedence / conflict exclusion
→ deterministic

Reality invalidation
→ deterministic over supplied Reality projection

Projection bounds / omission
→ deterministic

Authority
→ deterministic Harness-owned
```

Determinism guarantee:

```text
same validated DispositionResolutionInput
+ same HumanModelRevision
+ same resolution_profile_version
+ same Contract version
→ same semantic DispositionResolutionResult
```

If time/decay rules exist later, `evaluation_time` is part of validated input.
The guarantee does not claim that natural-language proposal generation is
deterministic.

---

## 25. Reality invalidation

HumanModelItem may carry bounded `reality_dependency_refs` when its validity
depends on current Project/Artifact/Decision/other Reality state.

Resolution consumes a Fielora-owned Reality projection/reference only:

```text
dependency ref matches current Reality
→ continue resolution

dependency ref stale/conflicted/missing
→ exclude / STALE_REALITY_REF
```

Example:

```text
old project-specific support:
Project uses Vue

current Reality:
Project uses React

result:
dependent item excluded from current resolution
```

IDR does not read files, inspect the Project directly, mutate Reality, or mark a
Project fact true. A stale dependency may generate a deterministic WEAKEN
proposal, but immediate exclusion does not wait for mutation.

---

## 26. Memory reference boundary

IDR may reference existing:

```text
Conversation / Message evidence
AgentRun / Event evidence
Setting revisions
user-approved imported historical sources
```

IDR does not own raw episodic history, duplicate transcripts, or create a
Memory Contract/Runtime.

### 26.1 Unavailable source

| Source/item case | Fail-safe resolution behavior |
|---|---|
| Explicit admitted item with sufficient bounded admission evidence | May remain Active; emit unavailable-source diagnostic. |
| Item derived from a removed/revocable Setting | Exclude and propose Weaken/Supersede. |
| Observation source unavailable | Do not use it to support new inference. |
| Inferred Disposition loses required supports | Exclude with `SOURCE_MISSING`; propose Weaken. |
| Source integrity conflicts with retained digest | Exclude with `SOURCE_CONFLICT`; do not refetch through Provider. |

Source unavailability never causes IDR to reconstruct a transcript, broaden
scope, call a Model, or assume the evidence was true.

Agent Profile remains outside this Contract: Agent Profile is Fielora-owned
self-definition and bundled behavior; IDR models human-specific disposition.
This Candidate defines no Agent Profile type, schema, mutation, or projection.

---

## 27. Governance boundary

`IndividualizedDirection` cannot change:

```text
permission mode
Approval Routing
network access
credential access
Tool exposure/effect
resource containment
Safety policy
execution budget/mandate
Verification requirement/result
Semantic Authority
```

Even `PRIORITIZE autonomous_execution` is only a soft behavior preference. It
cannot select `FULL_CONTROL`, suppress Approval, enable network, expose a Tool,
or weaken Verification.

`CLARIFY_WHEN` never creates Governance `ASK` or Approval.

---

## 28. Sensitive admission

`HumanModelAdmissionDecision` is retained in the IDR Contract because no Human
Model update can be safe without a typed pre-commit admission result. Classifier
or UI implementation remains deferred.

```text
HumanModelAdmissionDecision
├── contract_version
├── outcome: ALLOW | REQUIRE_EXPLICIT | DENY
├── reason_codes[]
├── admitted_scope?
├── redaction_requirements[]
└── explicit_confirmation_ref?
```

Minimum semantics:

```text
ordinary bounded work preferences → ALLOW
high-risk personal data → REQUIRE_EXPLICIT
credentials / secrets → DENY
```

| Data class | Outcome |
|---|---|
| ordinary bounded work/style Preference or non-sensitive Goal | `ALLOW` after ordinary validation |
| high-risk health/financial/legal/location/intimate or similar personal data | `REQUIRE_EXPLICIT` |
| credential, password, token, private key, session/auth secret, secret-derived digest | `DENY` |

Rules:

- Model classification cannot upgrade `DENY` or satisfy explicit confirmation.
- `REQUIRE_EXPLICIT` confirmation is item/scope/purpose-specific and cannot be
  reused as blanket consent.
- `ALLOW` means eligible for IDR admission only; it grants no Agent Permission.
- Irrelevant sensitive data is denied even if the human could theoretically
  confirm it.

---

## 29. Versioning / revision

### 29.1 Kept version concepts

```text
contract_version
human_model_revision
resolution_profile_version
resolution_ref
```

- `contract_version` identifies semantic serialization/validation rules.
- `human_model_revision` is a monotonically advancing local aggregate revision
  for committed item/transition changes and optimistic concurrency.
- `resolution_profile_version` identifies deterministic matching, precedence,
  eligible source, and concrete bound configuration.
- `resolution_ref` is a Fielora-owned deterministic reference/fingerprint over
  the validated structured input identities/revisions and versions; it is not
  a mutable revision counter.

`resolution_revision` is removed as meaningless duplication.

### 29.2 Deterministic replay

```text
same validated input snapshot
+ same human_model_revision
+ same reality/work-scope/current-constraint refs
+ same resolution_profile_version
+ same contract_version
→ same semantic result and resolution_ref
```

Wall-clock time does not silently affect results; a normalized
`evaluation_time` must be explicit input if later rules use age.

Unsupported versions fail closed. Contract migration cannot reinterpret a
stored item's kind/evidence authority without an explicit reviewed transition.

---

## 30. Error / reason codes

Natural-language messages are presentation only. Contract behavior uses closed
Provider/model-neutral codes.

### 30.1 Contract/update errors

```text
INVALID_ITEM
INVALID_KIND_PAYLOAD
INVALID_SCOPE
SOURCE_NOT_AUTHORITATIVE
SENSITIVE_DENIED
EXPLICIT_CONFIRMATION_REQUIRED
INVALID_TRANSITION
REVISION_CONFLICT
UNSUPPORTED_CONTRACT_VERSION
INVALID_BOUND_PROFILE
```

### 30.2 Resolution exclusion/reason codes

```text
SOURCE_MISSING
SOURCE_CONFLICT
SCOPE_MISMATCH
LIFECYCLE_EXCLUDED
CONFLICTED_ITEM
SUPERSEDED_ITEM
REVOKED_ITEM
STALE_REALITY_REF
CURRENT_INSTRUCTION_OVERRIDE
PROJECTION_LIMIT
NOT_DIRECTION_ELIGIBLE
EXTERNAL_HISTORY_NOT_AFFECTED
```

An exclusion is not automatically a failed resolution. Bounded omissions and
invalid items are reported with refs/counts; the safe result may be an empty
Direction. Invalid versions/revisions/transitions fail the requested Contract
operation without mutation.

---

## 31. Contract test matrix

Future Contract tests must cover at least:

| Case | Expected Contract result |
|---|---|
| Explicit durable Preference with valid scope/admission | New Preference becomes Active; revision advances once. |
| Current-turn instruction without remember/confirmation | No durable Preference commit. |
| Observation admission | Active Observation; never Direction-eligible as Preference. |
| Model inference proposed as Fact | `SOURCE_NOT_AUTHORITATIVE`; no Fact commit. |
| Inferred Disposition with High confidence | Remains Candidate until explicit activation confirmation. |
| Current instruction contradicts durable Preference | Preference excluded with `CURRENT_INSTRUCTION_OVERRIDE`. |
| Project-scoped item in another Project | Excluded with `SCOPE_MISMATCH`. |
| Matching Global Preference | Included unless a higher authority/specific item overrides it. |
| Overlapping conflicting Active items | Both omitted with conflict reason; no prose merge. |
| Revoked item | Excluded and never reactivated. |
| Superseded item | Excluded; replacement lineage remains inspectable. |
| Reality-invalid dependency | Excluded with `STALE_REALITY_REF`; no filesystem access. |
| Direction suggests autonomous execution | Governance/permission output unchanged. |
| Direction exceeds profile bounds | Deterministic omission with `PROJECTION_LIMIT`; size/count remain valid. |
| `CLARIFY_WHEN` item | No Approval and no Governance `ASK`. |
| User content/scope/kind correction | Old item terminal; replacement Active after admission; revision-safe. |
| `DISABLE_USE` forget | Item Revoked and immediately absent from resolution. |
| `ERASE_IF_ALLOWED` | IDR-owned payload removed; external Conversation remains and is reported unaffected. |
| Missing provenance on item | `INVALID_ITEM`; no commit. |
| Inference support source unavailable | Item excluded/Weaken proposal; no Provider fetch. |
| Credential/secret candidate | `SENSITIVE_DENIED`; no excerpt or digest retained. |
| High-risk personal candidate without confirmation | `EXPLICIT_CONFIRMATION_REQUIRED`; no commit. |
| Provider/model swap | Item IDs, HumanModelRevision, and resolution semantics unchanged. |
| Same validated resolution input/profile versions | Byte-equivalent semantic result and same ResolutionRef. |
| Stale update expected revision | `REVISION_CONFLICT`; no partial transition. |
| Illegal lifecycle transition | `INVALID_TRANSITION`; no mutation. |
| Revoked item receives new supporting evidence | Old item stays Revoked; new item ID required. |

Tests must also prove Authority-boundary hard-zero invariants: IDR cannot alter
Permission, Approval Routing, Tool effect/access, network/credential access,
Reality, or Verification.

---

## 32. Eval hooks

The Contract exposes enough bounded explainability for the future same-Model/
same-Harness A/B Eval without exposing raw Human Model history:

```text
resolution_ref
contract_version
resolution_profile_version
source_human_model_revision
source_item_refs
support_provenance_refs
matched_scope
evidence_basis
inference_confidence where applicable
inclusion/exclusion reason codes
Direction kind/dimension/value
omitted/conflicted counts
projection serialized size
```

Eval can therefore answer:

```text
Why was this Direction included?
Which HumanModelItem supported it?
Which Scope matched?
What evidence/confidence applied?
What was excluded and why?
What was the token/byte overhead?
```

These hooks do not authorize Eval runtime, telemetry upload, raw transcript
retention, or Provider calls.

---

## 33. Deferred questions

Resolved in this Contract Review:

```text
HumanProfileId: removed for V2
automatic inferred activation: Conservative / confirmation required
scope tie-breaking: deterministic specificity key
projection bounds: invariant + versioned default values
ASK_WHEN: renamed CLARIFY_WHEN
forget/erasure: one request with three modes
source unavailable: typed fail-safe behavior
revision/versioning: Contract + HumanModel + profile + ResolutionRef
```

Still deferred:

```text
exact dimension/value vocabulary and registry
exact evidence independence/count/age/decay algorithm
automatic durable remember-intent detection implementation
fact-eligible independently supported source registry
sensitive-data classifier and detailed category policy
Eval corpus, thresholds, non-inferiority, and overhead limits
provider-neutral extraction prompt/model quality
physical storage/event/tombstone/encryption layout
Context/FIPC/UI contracts
bounded automatic activation in a future Contract version
```

Implementation must not invent defaults for deferred semantics.

---

## 34. Schema preconditions

This Candidate remains `NOT FROZEN`. Schema Candidate work is prohibited until
the user reviews and accepts at least:

```text
Contract surface KEEP/MERGE/REMOVE decisions
HumanProfileId removal
HumanModelItem semantic shape and kind validation matrix
Provenance and source-unavailable semantics
EvidenceBasis / confidence field rules
Scope matching and specificity key
Lifecycle transition table and terminal semantics
Conservative activation policy
Update/correction/forget contracts
Resolution input/result/RelevantDisposition/IDRProjection
CLARIFY_WHEN naming
Precedence and Reality invalidation
Sensitive admission outcomes
Version/revision model
Error/reason codes
Contract test matrix and Eval hooks
```

The 2026-08-28 `IDR V2 SCHEMA CANDIDATE` execution instruction satisfied this
sequencing prerequisite for drafting the Schema Candidate only. It did not
freeze the Contract or Schema and did not authorize Migration or implementation.

Only after explicit Contract Review acceptance may a separate task begin:

```text
IDR V2 SCHEMA CANDIDATE
```

That task must still not imply Runtime implementation authorization. This
Contract Candidate creates no table, migration, Rust type, Serde model, FIPC,
Context integration, UI, dependency, or product behavior.
