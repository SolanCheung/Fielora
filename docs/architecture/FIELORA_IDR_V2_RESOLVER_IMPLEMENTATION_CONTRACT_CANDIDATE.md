# Fielora IDR V2 Resolver Implementation Contract Candidate

> Status: `IMPLEMENTATION REVIEW PASS / IMPLEMENTATION-READY CANDIDATE / NOT FROZEN`
>
> Date: `2026-08-28`
>
> Implementation authorization: `NO`
>
> Runtime implementation: `NONE`
>
> Schema change: `NO`

## 1. Contract purpose

This document freezes the inputs, semantic identity, fixed V1 registry,
deterministic algorithm, output, and fail-closed behavior needed to implement the
first IDR V2 Resolver without another design decision inside the coding task.

It is a reviewed Candidate, not implementation authorization. It does not implement
the Resolver, Context Admission, ContextCompiler integration, Direction, learning,
Model extraction, automatic activation, FIPC/UI, persistence, Vector/FTS/Embedding,
Provider, Tool, Permission, Reality, Verification, or Agent-loop behavior.

Normative ownership remains:

```text
Harness.IDR.Resolver
→ deterministic effective Human Model semantics

Harness.Ingress & Context.IDR Context Admission
→ per-invocation Model-context exposure and budget

Individualized Direction / Learning
→ future, separate, not implemented
```

The Resolver returns an ephemeral `ResolvedHumanModelViewV1`. It does not generate
`IndividualizedDirection`. This separation supersedes the bundled Resolver/Direction
shape in the earlier conceptual `DispositionResolutionResult` for the first Resolver
implementation Candidate.

## 2. Fixed V1 identifiers and structural bounds

```text
resolver_contract_version: 1
resolver_version: IDR_RESOLVER_V1
semantic_registry_version: IDR_SEMANTIC_REGISTRY_V1
resolution_context_version: 1
reality_projection_version: 1
current_constraints_version: 1

max snapshot items: 4096
max provenance refs accepted per item: 64
max Reality dependencies accepted per item: 16
max present lineage depth: 64
max item refs in one conflict record: 16
max detailed suppression records: 256
max detailed conflict records: 128
max provenance refs emitted per effective item: 3
max Reality refs emitted per effective item: 16
```

These are Resolver structural-safety bounds, not Model-context budget. Exceeding a
whole-snapshot structural bound is a hard Resolver failure. Exceeding a per-item
bound suppresses that item. Detailed diagnostic overflow is summarized by count and
digest; it never changes which items are semantically effective.

Context Admission owns its separate 8-entry / 4 KiB Model-facing profile.

## 3. Storage compatibility review

The implementation can use the current committed storage API without schema change:

```text
storage baseline:
bd7a1398cfaccfd66d9b0709f5c37d53366e4a63

read API:
StorageHandle::read_human_model_snapshot()

input DTO:
HumanModelSnapshot
  human_model_revision
  items[]: HumanModelItemRecord
```

Each record already provides:

- stable item ID and item/payload Contract versions;
- closed typed payload for all five kinds;
- lifecycle, EvidenceBasis, Disposition-only confidence;
- four-axis Scope;
- explicit one-predecessor `supersedes_item_id`;
- aggregate creation/update revision and audit timestamps;
- complete bounded provenance reference records;
- reference-only Reality dependencies.

The following implementation needs are application Contract resources, not durable
state and therefore require no new table:

- fixed semantic registry;
- normalized current resolution context;
- current constraints projection;
- authoritative Reality validation projection;
- current source-availability projection;
- deterministic Resolver version/comparator;
- ephemeral output and diagnostics.

Storage accepts bounded syntactically valid future keys/values. Resolver V1 validates
them against its fixed registry and suppresses unknown semantics. This is a safe
compatibility seam, not a reason to mutate stored rows or add a registry table.

An erased predecessor may be absent from `HumanModelSnapshot`, and tombstones are not
exposed by the read API. The algorithm in section 12 deliberately treats an absent
predecessor as incomplete explainability, not as authority needed by the independently
admitted successor. No tombstone read API is required for semantic correctness.

```text
STORAGE_CONTRACT_GAPS: NONE
SCHEMA_CHANGE: NO
MIGRATION: NONE
```

## 4. Resolver input contract

```text
ResolveHumanModelInputV1
  resolver_contract_version: 1
  resolver_version: IDR_RESOLVER_V1
  semantic_registry_version: IDR_SEMANTIC_REGISTRY_V1
  expected_human_model_revision: u64
  snapshot: HumanModelSnapshot
  resolution_context: NormalizedResolutionContextV1
  reality_projection: RealityValidationProjectionV1
  source_availability: SourceAvailabilityProjectionV1
```

Hard input invariants:

1. `snapshot.human_model_revision == expected_human_model_revision`.
2. Every item contract/payload version is supported by storage Contract V1.
3. Item IDs are unique in the snapshot.
4. The context, Reality, source-availability, and constraint projections have known
   versions, stable identities/digests, unique keys, and canonical ordering.
5. The Resolver receives no raw task, transcript, source body, Project path, file/
   webpage body, Provider response, credential, or Model reasoning.
6. No implicit wall clock participates in V1. Item timestamps are audit metadata only.

## 5. Semantic identity contract

### 5.1 `SemanticKeyV1`

```text
SemanticKeyV1
  HUMAN_FACT:<registered subject key>
  BEHAVIOR_DIMENSION:<registered dimension>
  OBSERVATION_ITEM:<HumanModelItemId>
  LONG_TERM_GOAL:<registered goal key>
```

Kind mapping is exact:

| Kind | Semantic key | Directly comparable with |
|---|---|---|
| `FACT` | `HUMAN_FACT(subject_key)` | Fact with the same registered subject only |
| `PREFERENCE` | `BEHAVIOR_DIMENSION(dimension)` | Preference and Disposition with the same registered dimension |
| `OBSERVATION` | `OBSERVATION_ITEM(item_id)` | Only the same item identity; never a winner pool |
| `DISPOSITION` | `BEHAVIOR_DIMENSION(dimension)` | Disposition and Preference with the same registered dimension |
| `LONG_TERM_GOAL` | `LONG_TERM_GOAL(goal_key)` | Goal with the same registered goal key only |

Consequences:

- Fact, Behavior, Observation, and Goal key families never compare across families.
- `PREFERENCE(theme=dark)` cannot compete with
  `LONG_TERM_GOAL(become_architect)`.
- A Goal is not compared with a Disposition in V1 because the current Goal payload
  has no registered goal-to-behavior/value mapping. The earlier conceptual
  `PREFERENCE > LONG_TERM_GOAL > DISPOSITION` line is narrowed: Preference outranks
  Disposition on a shared Behavior key; Goals resolve only against the same Goal key.
- Observation never becomes Fact, Preference, Disposition, Goal, or direct guidance.
- Unknown keys are suppressed; no fuzzy equivalence or Model judgment is allowed.

### 5.2 Canonical semantic equality

Two items are equal only when all of the following match byte-for-byte after fixed V1
enum/token serialization:

```text
SemanticKeyV1
kind-specific relation/polarity
CanonicalSemanticValueV1
```

Display summary, provenance support text, timestamp, Provider, and item ID never define
semantic equality. Different canonical values are not automatically contradictory;
the kind-specific rules in section 11 decide compatibility.

## 6. Fixed semantic registry V1

### 6.1 Ownership and extension

`IDR_SEMANTIC_REGISTRY_V1` is a bundled, code-owned Harness.IDR Contract resource.
It is not SQLite state, a user/plugin/Marketplace extension point, a Provider
vocabulary, or dynamically Model-generated data.

Unknown key or unknown value behavior is always suppression:

```text
unknown key   → INVALID_SEMANTIC_KEY
unknown value → UNSUPPORTED_SEMANTIC_VALUE
```

Adding or reinterpreting a key/value requires a reviewed registry-version change.
Existing V1 values cannot silently change meaning. A later registry may add values
while retaining exact V1 meanings; removing/reinterpreting requires a new Resolver
profile and compatibility tests.

### 6.2 Behavior dimensions and values

All Behavior dimensions use single preferred-value semantics. The fixed V1 set is:

| Dimension | Allowed normalized values |
|---|---|
| `fielora.workflow.mode` | `sequential`, `parallel_when_independent`, `review_before_action` |
| `fielora.change_scope.mode` | `minimal_delta`, `bounded_change`, `broad_change_when_explicit` |
| `fielora.verification.order` | `targeted_first`, `full_gate_first`, `risk_proportional` |
| `fielora.communication.detail` | `concise`, `balanced`, `detailed` |
| `fielora.decision.presentation` | `recommend_one`, `present_options`, `ask_before_choice` |
| `fielora.risk.posture` | `conservative`, `balanced`, `expansive_within_mandate` |
| `fielora.planning.mode` | `plan_first`, `act_when_clear`, `milestone_updates` |
| `fielora.architecture.posture` | `preserve_existing`, `simplify_when_scoped`, `review_before_structural_change` |

`PREFERENCE` supports `PREFER` and `AVOID` in Resolver V1. Stored `TRADEOFF` is
suppressed as `UNSUPPORTED_SEMANTIC_VALUE` because the current one-value payload does
not encode two sides or a deterministic trade-off comparator. `DISPOSITION` uses one
allowed value and has implicit positive tendency semantics.

These values are soft personalization only. Values containing `ask`, `risk`,
`expansive`, or `broad` cannot modify Governance, Permission, Work Scope, Tool access,
Verification, or current instruction.

### 6.3 Fact subjects

| Fact subject | Allowed value type/value |
|---|---|
| `fielora.human.primary_platform` | `TOKEN`: `windows`, `macos`, `linux` |
| `fielora.human.communication_language` | `TOKEN`: `zh_cn`, `en`, `bilingual` |
| `fielora.human.accessibility_high_contrast_required` | `BOOLEAN`: `true` or `false` |

Other Fact subjects and `TEXT`/`DECIMAL` Fact values are storage-compatible future
data but are not Resolver V1 semantics; they are suppressed rather than interpreted.

### 6.4 Observation classifications

| Observation kind | Related dimension | Allowed normalized value |
|---|---|---|
| `fielora.observation.user_choice` | Required | One value registered for that dimension |
| `fielora.observation.user_correction` | Optional | `corrected` |
| `fielora.observation.user_acceptance` | Optional | `accepted` |
| `fielora.observation.user_rejection` | Optional | `rejected` |
| `fielora.observation.agent_outcome` | Optional | `succeeded`, `failed` |

Observations remain separate evidence items even when classification/value match.
Resolver never deduplicates observations into personality and never uses their count,
age, or value to activate a Disposition.

### 6.5 Long-term Goal keys

| Goal key | Allowed desired-outcome token |
|---|---|
| `fielora.goal.product.provider_neutrality` | `maintain_provider_neutrality` |
| `fielora.goal.product.architecture_stability` | `preserve_existing_architecture` |
| `fielora.goal.learning.capability_growth` | `develop_durable_capability` |

The current payload field is a bounded string, but Resolver V1 accepts only the exact
registered token. Unknown/open prose remains durable storage data only and is
suppressed until a later registry explicitly defines deterministic semantics.

### 6.6 Scope-selector registry

```text
domain:
  CODING

task_type:
  FAST_EDIT
  FOCUSED_EDIT
  GENERAL

interaction_kind:
  TASK_EXECUTION
  FINAL_RESPONSE
  APPROVAL_EXPLANATION
```

Project selectors remain opaque Fielora-owned Project IDs. Unknown domain/task/
interaction tokens are suppressed as `UNSUPPORTED_SCOPE_VALUE`, not treated as a
mismatch or Global item.

Current repository mapping is explicit:

| Existing fact | Normalized V1 selector |
|---|---|
| Harness profile `CODING_V0.1` | domain `CODING` |
| private task class `FAST_EDIT` | task type `FAST_EDIT` |
| private task class `FOCUSED_EDIT` | task type `FOCUSED_EDIT` |
| private task class `GENERAL` | task type `GENERAL` |

Those facts exist but are not currently exposed to an IDR caller. Interaction kind and
current-constraint projection are not currently available. Resolver implementation
may accept the DTO; Agent integration remains separately unauthorized.

## 7. Normalized resolution context

### 7.1 Selector state

Every axis uses a tri-state wrapper:

```text
SelectorStateV1<T>
  KNOWN(value)
  KNOWN_ABSENT
  UNAVAILABLE
```

`KNOWN_ABSENT` means the caller authoritatively knows the invocation has no value on
that axis. `UNAVAILABLE` means it cannot know. The states are not interchangeable.

### 7.2 `NormalizedResolutionContextV1`

```text
NormalizedResolutionContextV1
  contract_version: 1
  context_ref: opaque Fielora-owned ref
  project: SelectorStateV1<ProjectId>
  domain: SelectorStateV1<DomainV1>
  task_type: SelectorStateV1<TaskTypeV1>
  interaction_kind: SelectorStateV1<InteractionKindV1>
  current_constraints: NormalizedCurrentConstraintsV1
  context_fingerprint: sha256
```

The current system can supply exact Project identity for an AgentRun. Project revision
belongs to the Reality projection, not the Scope selector. Domain/task type have
existing internal facts but no current public IDR input. Interaction remains absent.
Raw task text is not a legal field.

`context_fingerprint` is computed by section 17 canonical encoding over all selector
states plus the current-constraint digest. A supplied non-matching fingerprint is a
hard `INVALID_RESOLUTION_CONTEXT` failure.

### 7.3 Timestamp/freshness

V1 has no evaluation-time field. Timestamps do not rank, expire, decay, or revive
items. Preference change and Goal replacement require explicit lineage. Observation
aging and evidence-decay remain future versioned seams.

## 8. Formal Scope algorithm

For each populated item selector:

```text
current = KNOWN(equal value)  → axis MATCH
current = KNOWN(other value)  → SCOPE_MISMATCH
current = KNOWN_ABSENT        → SCOPE_MISMATCH
current = UNAVAILABLE         → SCOPE_INPUT_UNAVAILABLE
```

All populated axes must match. An item with all four axes absent is Global. Scope
mismatch or unavailable input suppresses the item; there is no partial/broader
fallback. Project identity comparison is exact and never path/title based.

For two already-matching items with the same `SemanticKeyV1` and the same authority
class, specificity is the descending lexicographic tuple:

```text
(
  project_present ? 1 : 0,
  populated_selector_count,
  task_type_present ? 1 : 0,
  interaction_kind_present ? 1 : 0,
  domain_present ? 1 : 0
)
```

The maximum tuple owns that semantic key within that authority class for this
context. Broader items at lower tuples are suppressed as `LOWER_PRECEDENCE`. Scope is
never compared across unrelated SemanticKey families and never lets an inferred
Disposition outrank an explicit Preference.

## 9. Evidence and authority model

EvidenceBasis is not a global total order. Resolver first establishes semantic
comparability, then applies kind-specific rules:

| Kind/lane | Valid basis | Authority behavior |
|---|---|---|
| Fact | `EXPLICIT` or `OBSERVED` | Neither basis wins a conflicting fact by itself; current Reality or explicit lineage is required |
| Preference | `EXPLICIT` only | Explicit behavioral authority over a same-key inferred Disposition |
| Observation | `OBSERVED` only | Evidence-only; never an effective winner |
| Disposition | `INFERRED` only | Soft candidate below same-key explicit Preference |
| Long-term Goal | `EXPLICIT` only | Resolves only against same Goal key; does not enter the Behavior comparator in V1 |

There is no global `FACT > PREFERENCE > OBSERVATION > ...` ordering. Different
semantic families coexist and are never forced into one winner pool.

EvidenceBasis also cannot self-prove provenance authority. Before an item enters a
semantic group, Resolver V1 requires:

| Item | Minimum provenance authority check |
|---|---|
| `FACT + EXPLICIT` | At least one human-controlled source: explicit statement/setting, user correction, or user-approved import, with matching explicit/confirmation/correction/import relation |
| `FACT + OBSERVED` | Suppressed in Resolver V1 because no deterministic fact-eligible observed-source registry is frozen |
| `PREFERENCE` | Same human-controlled source requirement as explicit Fact |
| `OBSERVATION` | At least one user action/correction or Agent outcome source consistent with observed basis |
| `DISPOSITION` | At least one `SYSTEM_INFERENCE` provenance plus at least one `INFERENCE_SUPPORT` relation to an admitted support ref |
| `LONG_TERM_GOAL` | Same human-controlled source requirement as explicit Fact |

Failure is item-level `SOURCE_NOT_AUTHORITATIVE`; it does not rewrite storage. A
Provider/model identity, assistant prose, or EvidenceBasis token alone never satisfies
the check.

External precedence is evaluated separately:

```text
CURRENT EXPLICIT USER INPUT
>
CURRENT AUTHORITATIVE REALITY
>
CURRENT TASK / PROJECT CONSTRAINTS
>
DURABLE HUMAN MODEL
```

This ordering governs applicability, not durable mutation. Factual Reality mismatch
still invalidates a Reality-dependent Human Model item; a current statement does not
silently mutate Reality or the Human Model.

## 10. Lifecycle policy

Only `ACTIVE` may become an effective candidate.

| Lifecycle | Effective | Allowed bounded output |
|---|---:|---|
| `CANDIDATE` | No | suppression record only |
| `ACTIVE` | Yes, after all other checks | effective/conflict/suppression record |
| `WEAKENED` | No | suppression record only; no fallback |
| `CONFLICTED` | No | conflict/diagnostic metadata only; no value |
| `SUPERSEDED` | No | lineage/explainability ref only |
| `REVOKED` | No | audit/suppression ref only |

Disposition Candidate never activates inside Resolver. `REVOKED` and `SUPERSEDED`
never return to effective state, even if a successor is missing, stale, or excluded.

## 11. Kind-specific resolution rules

### 11.1 Fact

For the same Fact key after lifecycle/scope/Reality/constraint checks:

- equal canonical value: select one representative; prefer narrower scope, then
  `EXPLICIT` representation over `OBSERVED`, then item ID; suppress identical values
  as `SEMANTIC_DUPLICATE`;
- different value with an authoritative current Reality constraint: suppress the
  durable value as `CURRENT_REALITY_OVERRIDE`;
- different values connected by valid supersession: only the current Active successor
  is eligible;
- otherwise: select no Fact and emit `STRUCTURED_CONFLICT`.

Timestamp never selects a Fact.

### 11.2 Preference

Resolver V1 first retains only the maximum scope-specificity tier for the key.

- equal relation/value: choose item-ID representative; suppress duplicates;
- `PREFER(v)` plus `AVOID(v)`: structured conflict;
- two `PREFER` entries with different values: structured conflict because V1
  dimensions are single preferred value;
- two `AVOID` entries with different values: `PRESERVE_BOTH`;
- `PREFER(v)` plus `AVOID(w)` where `v != w`: `PRESERVE_BOTH`;
- `TRADEOFF`: unsupported semantic value suppression;
- changes are authoritative only through explicit correction/supersession, not time.

### 11.3 Observation

Observation is never in `effective_items`. Each item retains unique Observation
identity and may appear only as a bounded support ref/diagnostic. Contradictory
observations are preserved as separate evidence; Resolver neither collapses them nor
creates a Disposition. Learning/activation is absent.

### 11.4 Disposition

Only explicitly activated, `ACTIVE + INFERRED` Dispositions are candidates.

- equal canonical value and exact scope: higher confidence may choose the duplicate
  representative; item ID breaks only an equal-value representation tie;
- different values at the same maximum specificity: structured conflict regardless
  of confidence;
- a same-key explicit Preference resolves incompatibility in favor of the Preference;
  the Disposition is suppressed as `LOWER_PRECEDENCE` and the authority-resolved
  conflict remains explainable;
- a compatible Preference/Disposition pair may coexist.

Confidence never selects between conflicting semantic values.

### 11.5 Long-term Goal

- same Goal key and equal registered outcome: select one representative and suppress
  duplicates;
- same Goal key with different registered outcomes: structured conflict unless valid
  explicit supersession already removed the predecessor;
- different Goal keys: `PRESERVE_BOTH` within structural bounds;
- Goal does not compete with Preference/Disposition in Resolver V1;
- current Task Goal/current explicit constraint may suppress applicability but does
  not mutate the durable Goal.

## 12. Supersession and lineage algorithm

Resolver builds a read-only map of present items and successor claims before semantic
grouping:

1. duplicate item IDs, self-reference, a present cycle, two present successors for one
   predecessor, or a present target with an impossible nonterminal state is hard
   `INVALID_LINEAGE` / no resolved view;
2. a present predecessor is terminal and never effective;
3. an Active successor is independently admitted semantic state and may be effective
   under its own payload/provenance/scope/Reality checks;
4. a missing predecessor stops backward traversal and adds
   `LINEAGE_PREDECESSOR_UNAVAILABLE`; it does not revive an ancestor or invalidate the
   self-contained successor;
5. erased predecessor and externally missing predecessor are intentionally
   indistinguishable to Resolver because neither grants current authority;
6. if the current head is Candidate/Weakened/Conflicted/Revoked/stale/unresolved, no
   predecessor is used as fallback;
7. lineage may cross kind because an explicit correction can replace kind; semantic
   grouping uses only the current eligible item after lineage elimination;
8. bounded present predecessor refs are emitted for explainability only.

Created/updated time never infers a lineage edge or current head.

## 13. Confidence policy

Confidence exists only for Disposition.

```text
eligibility: NO
automatic activation: NO
conflicting-value winner: NO
equal-value duplicate representative ordering: YES
Context Admission V1 ranking: NO
explainability metadata: YES
```

No other kind receives confidence. There is no generic memory score, probability,
salience score, or truth score.

## 14. Reality validation contract

### 14.1 Projection shape

```text
RealityValidationProjectionV1
  contract_version: 1
  projection_ref
  authority_revision_or_digest
  entries[]: RealityStateEntryV1
  projection_digest

RealityStateEntryV1
  reality_kind: PROJECT | ARTIFACT | DECISION | VERIFICATION | FIELD_OBJECT
  reality_ref
  availability: AVAILABLE | MISSING | UNRESOLVED
  current_revision: u64?
  current_state_ref: opaque Fielora-owned ref?
  current_fingerprint: sha256?
  authority_ref
```

Entries are unique by `(reality_kind, reality_ref)`. Conflicting duplicates or a
digest mismatch are hard `INVALID_REALITY_PROJECTION` failures.

### 14.2 Dependency evaluation

| Dependency | Available matching input | Definite mismatch/missing | No comparable authority/input |
|---|---|---|---|
| `MUST_EXIST` | `VALID` | `STALE_REALITY_REF` | `REALITY_UNRESOLVED` |
| `REVISION_MATCH` | equal `current_revision` → `VALID` | unequal revision/missing → `STALE_REALITY_REF` | revision absent/authority absent → `REALITY_UNRESOLVED` |
| `FINGERPRINT_MATCH` | equal fingerprint → `VALID` | unequal fingerprint/missing → `STALE_REALITY_REF` | fingerprint absent/authority absent → `REALITY_UNRESOLVED` |

All dependencies must be `VALID`. Any stale dependency suppresses the item as stale;
otherwise any unresolved dependency suppresses it as unresolved. Unresolved is never
treated as valid.

### 14.3 Current available Reality

- Project `MUST_EXIST`/`REVISION_MATCH` can use exact `ProjectView.field_id` and
  `ProjectView.revision`.
- Project V1 fingerprint is computed from exact Project identity and revision only;
  it contains no title/path/body.
- Active Artifact `MUST_EXIST`/fingerprint can use `ActiveArtifactContext.artifact_id`
  and `current_revision_id`. The Artifact opaque revision ID is encoded as
  `current_state_ref`; no fake numeric revision is created.
- Decision, Verification, FieldObject, and non-active Artifact live projections are
  currently unavailable unless their authoritative owner explicitly supplies an
  entry in a future integration.

No generic Reality resolver, filesystem read, or Model inference occurs here.

## 15. Source availability projection

```text
SourceAvailabilityProjectionV1
  contract_version: 1
  projection_ref
  entries[]
    provenance_ref_id
    state: AVAILABLE | MISSING | UNRESOLVED
  projection_digest
```

Rules:

- explicit Fact/Preference/Goal with non-revocable admitted evidence may remain
  eligible without a live source lookup;
- provenance admitted as `REVOCABLE` requires an `AVAILABLE` current entry;
- an inferred Disposition requires all provenance refs used as inference support to
  be `AVAILABLE`; missing yields `SOURCE_MISSING`, unavailable authority yields
  `SOURCE_UNRESOLVED`;
- a Disposition with no `INFERENCE_SUPPORT` relation or no `SYSTEM_INFERENCE`
  provenance is suppressed as `SOURCE_NOT_AUTHORITATIVE` before availability ranking;
- Observation source status cannot create effective semantics;
- Resolver never reconstructs or fetches the source body.

The current repository has no generic source-availability projection builder. That is
an integration seam, not a Resolver/Storage schema gap.

## 16. Normalized current constraints

### 16.1 Shape

```text
NormalizedCurrentConstraintsV1
  contract_version: 1
  constraint_set_ref
  coverage
    covered_semantic_keys[]
  entries[]: CurrentSemanticConstraintV1
  constraints_digest

CurrentSemanticConstraintV1
  authority: CURRENT_EXPLICIT_USER | CURRENT_REALITY | CURRENT_TASK_PROJECT
  semantic_key: SemanticKeyV1
  operation: REQUIRE_VALUE | FORBID_VALUE | SUPPRESS_DURABLE_KEY
  canonical_value?
  source_ref
  source_digest
```

`REQUIRE_VALUE` and `FORBID_VALUE` require a registered canonical value.
`SUPPRESS_DURABLE_KEY` forbids every durable value for that key this invocation.
Constraint source bodies are forbidden.

### 16.2 Responsibility split

Work Scope & Goal / Ingress & Context own construction and admission of this already-
normalized projection. Resolver does not parse current natural language.

For every effective candidate Resolver emits:

```text
current_constraint_state:
  COMPATIBLE
  OVERRIDDEN
  UNRESOLVED
```

- a matching higher-current constraint produces `OVERRIDDEN` and a stable reason;
- a covered key with no contradictory entry is `COMPATIBLE`;
- a key outside `covered_semantic_keys` is `UNRESOLVED`;
- contradictory equal-authority current constraints make the input hard-invalid;
- different authority levels use the exact order in section 9.

Resolver may retain an internally effective Human Model item with constraint state
`UNRESOLVED` because this state describes missing current applicability, not durable
semantic invalidity. Context Admission V1 must exclude both `OVERRIDDEN` and
`UNRESOLVED`; only `COMPATIBLE` may reach the Model. This division guarantees current
instruction precedence without letting Resolver own prompt construction.

Current code has raw task text but no `NormalizedCurrentConstraintsV1` builder. No IDR
context may be admitted until that structured input exists; raw-task parsing inside
Resolver is forbidden.

## 17. Deterministic resolution pipeline

The exact V1 sequence is:

1. **Envelope/version validation** — validate Resolver/registry/projection versions,
   top-level required fields, digests, and whole-snapshot structural bounds.
2. **Snapshot integrity** — compare expected/current Human Model revision; validate
   unique item IDs and storage Contract compatibility.
3. **Context normalization validation** — validate selector tri-states, fixed selector
   vocabulary, current constraints, source availability, Reality entries, and all
   supplied fingerprints.
4. **Semantic registry projection** — derive `SemanticKeyV1` and canonical value per
   item; suppress unknown/unsupported item semantics without rewriting storage.
5. **Lineage validation/elimination** — validate present graph, exclude terminal
   predecessors, preserve bounded lineage, and diagnose missing predecessors.
6. **Lifecycle eligibility** — retain only Active as effective candidates.
7. **Exact Scope evaluation** — apply all populated selectors with AND semantics;
   suppress mismatch, unavailable, or unsupported selector values.
8. **Provenance authority and source availability** — enforce the section 9 minimum
   source matrix, then apply section 15 without source fetch.
9. **Reality validation** — classify every dependency and suppress stale/unresolved.
10. **Current-constraint evaluation** — attach COMPATIBLE/OVERRIDDEN/UNRESOLVED and
    suppress overridden values from current effective output.
11. **Semantic grouping** — group only comparable items by `SemanticKeyV1`; never
    cross key families.
12. **Authority/specificity/kind rules** — apply section 8 specificity, section 9
    authority, and section 11 kind matrices. Explicit lineage already won at step 5.
13. **Conflict emission** — unresolved contradictions select no value and emit a
    structured conflict; authority/scope-resolved conflicts remain explainable.
14. **Stable ordering/bounded diagnostics** — order outputs and summarize diagnostic
    overflow without changing semantic selection.
15. **Canonical result/reference** — serialize the semantic result canonically and
    calculate `resolution_ref`.

No step uses Model, randomness, current wall time, storage order, fuzzy similarity,
created/updated recency, Provider identity, or source body.

## 18. Resolved output contract

```text
ResolvedHumanModelViewV1
  resolver_contract_version: 1
  resolver_version: IDR_RESOLVER_V1
  semantic_registry_version: IDR_SEMANTIC_REGISTRY_V1
  source_human_model_revision: u64
  resolution_context
    context_ref
    context_fingerprint
    reality_projection_ref
    reality_projection_digest
    source_availability_ref
    source_availability_digest
    current_constraints_ref
    current_constraints_digest
  resolution_ref
  effective_items[]: ResolvedHumanModelItemV1
  conflicts[]: HumanModelConflictV1
  suppressed[]: HumanModelSuppressionV1
  diagnostics_summary
  canonical_result_digest
```

### 18.1 Effective item

```text
ResolvedHumanModelItemV1
  item_id
  kind: FACT | PREFERENCE | DISPOSITION | LONG_TERM_GOAL
  semantic_key: SemanticKeyV1
  canonical_value: CanonicalSemanticValueV1
  matched_scope
  scope_specificity
  evidence_basis
  inference_confidence?          # Disposition only
  provenance_ref_ids[]           # sorted, max 3
  omitted_provenance_ref_count
  reality_validation[]           # sorted, reference/state only
  current_constraint_state
  resolution_reason_codes[]
  lineage_predecessor_refs[]
  lineage_incomplete
```

Observation is never an effective item. Values are fixed registry tokens/typed Fact
values, not free source bodies.

### 18.2 Conflict

```text
HumanModelConflictV1
  semantic_key
  conflict_kind
    FACT_VALUE_CONFLICT
    PREFERENCE_CONFLICT
    DISPOSITION_CONFLICT
    GOAL_CONFLICT
    RESOLVED_BY_EXPLICIT_AUTHORITY
    RESOLVED_BY_SCOPE
  state: RESOLVED | UNRESOLVED
  member_item_refs[]              # sorted, max 16
  selected_item_refs[]            # empty when unresolved
  suppressed_item_refs[]
  reason_codes[]
```

No source/value body is copied into conflict records. An unresolved conflict omits all
competing effective values.

### 18.3 Suppression

```text
HumanModelSuppressionV1
  item_id
  kind
  semantic_key?
  reason_codes[]
  selected_by_item_refs[]
```

Detailed records are deterministically sorted and capped at 256. Overflow records are
represented by count and SHA-256 digest of their canonical omitted tuples. This cap
does not allow a suppressed item to become effective.

### 18.4 Forbidden output

Resolved view never contains:

- transcript/message/source support body;
- display summary or full typed source prose;
- webpage/file/repository body;
- Provider response/reasoning;
- credentials, API keys, Authorization, passwords, private keys, cookies/session;
- local Project path;
- chain-of-thought or hidden reasoning.

The view is `EPHEMERAL DERIVED VIEW`, not durable truth or a mutation command.

## 19. Hard errors and item suppression reasons

### 19.1 Hard Resolver failures

Hard failures produce no `ResolvedHumanModelViewV1`:

```text
UNSUPPORTED_CONTRACT_VERSION
UNSUPPORTED_RESOLVER_VERSION
UNSUPPORTED_SEMANTIC_REGISTRY_VERSION
HUMAN_MODEL_REVISION_MISMATCH
INVALID_HUMAN_MODEL_SNAPSHOT
INVALID_RESOLUTION_CONTEXT
INVALID_REALITY_PROJECTION
INVALID_SOURCE_AVAILABILITY_PROJECTION
INVALID_LINEAGE
RESOLVER_INPUT_LIMIT
```

These identify invalid authoritative input/envelope state, not one unusable item.
Natural-language messages and raw storage/SQLite errors are not Contract output.

### 19.2 Item suppression / conflict reasons

Item-level reasons allow a safe partial or empty resolved view:

```text
INVALID_SEMANTIC_KEY
UNSUPPORTED_SEMANTIC_VALUE
UNSUPPORTED_SCOPE_VALUE
LIFECYCLE_EXCLUDED
CONFLICTED_ITEM
SUPERSEDED_ITEM
REVOKED_ITEM
SCOPE_MISMATCH
SCOPE_INPUT_UNAVAILABLE
SOURCE_MISSING
SOURCE_UNRESOLVED
SOURCE_CONFLICT
SOURCE_NOT_AUTHORITATIVE
STALE_REALITY_REF
REALITY_UNRESOLVED
CURRENT_INSTRUCTION_OVERRIDE
CURRENT_REALITY_OVERRIDE
CURRENT_TASK_PROJECT_OVERRIDE
CURRENT_CONSTRAINTS_UNAVAILABLE
LINEAGE_PREDECESSOR_UNAVAILABLE
SEMANTIC_DUPLICATE
SEMANTIC_CONFLICT
LOWER_PRECEDENCE
NOT_EFFECTIVE_KIND
RESOLVER_ITEM_LIMIT
DIAGNOSTIC_LIMIT
```

Codes are stable, versioned, Provider-neutral tokens. They expose no raw payload,
SQLite message, source body, or secret.

Mapping clarifications:

- Candidate/Weakened use `LIFECYCLE_EXCLUDED`.
- Conflicted/Superseded/Revoked use their existing specific codes.
- `STALE_REALITY_REF` is retained from the existing Contract rather than introducing
  a duplicate `REALITY_STALE` token.
- `SEMANTIC_CONFLICT` is semantic contradiction; `SOURCE_CONFLICT` is provenance/
  source-integrity conflict.
- suppression is not an exception; an empty effective view is valid.

## 20. Canonicalization and determinism

### 20.1 Canonical scalar encoding

Hashes use SHA-256 lowercase hex over a domain-separated, length-prefixed byte stream:

```text
domain ASCII bytes + NUL
for each field in Contract order:
  field tag ASCII bytes + NUL
  presence byte: 0 or 1
  if present:
    unsigned byte length as u32 big-endian
    exact UTF-8/token bytes
```

Unsigned integers are encoded as fixed-width big-endian bytes under their field tag.
Booleans use one byte `0`/`1`. Lists are sorted by the Contract ordering, prefixed by
u32 count, then encode each element. No locale, JSON map order, platform path, clock,
or Provider serializer participates.

Domain strings:

```text
FIELORA_IDR_RESOLUTION_CONTEXT_V1
FIELORA_IDR_REALITY_FINGERPRINT_V1
FIELORA_IDR_REALITY_PROJECTION_V1
FIELORA_IDR_SOURCE_AVAILABILITY_V1
FIELORA_IDR_CURRENT_CONSTRAINTS_V1
FIELORA_IDR_RESOLVED_VIEW_V1
FIELORA_IDR_RESOLUTION_REF_V1
```

### 20.2 Reality fingerprints

Project fingerprint fields:

```text
kind = PROJECT
reality_ref = exact FieldId
current_revision = ProjectView.revision
current_state_ref = absent
```

Artifact fingerprint fields:

```text
kind = ARTIFACT
reality_ref = exact ArtifactId
current_revision = absent
current_state_ref = exact current ArtifactRevisionId
```

No title, root path, content, display state, selected slide/sheet, or Provider data is
hashed. `viewed_revision_id` is interaction state and not authoritative current
Artifact Reality.

### 20.3 Stable output order

Effective items sort by:

1. SemanticKey family order: Fact, Behavior, Goal;
2. canonical SemanticKey token;
3. kind order within Behavior only: Preference, Disposition;
4. scope-specificity tuple descending;
5. canonical relation/value;
6. item ID.

Conflicts sort by SemanticKey then conflict kind then member-ref tuple. Suppressions
sort by item ID then reason-code tuple. Ordering keys do not become semantic winner
rules unless section 11 explicitly says so.

### 20.4 `resolution_ref`

`resolution_ref` is SHA-256 over:

```text
resolver_contract_version
resolver_version
semantic_registry_version
source_human_model_revision
resolution context fingerprint
Reality projection digest
source availability digest
current constraints digest
canonical resolved semantic result digest
```

Same validated inputs and versions produce byte-equivalent semantic output and the
same reference. Randomness and Model participation are zero.

## 21. Privacy and governance

Storage Admission decides what may be durable. Resolver decides current deterministic
semantic applicability. Context Admission decides per-invocation exposure. None may
self-grant another layer's authority.

Sensitive classification remains upstream Storage Admission responsibility. Resolver
does not implement an NLP secret classifier, reconstruct source content, retrieve
missing evidence, call a Provider, alter lifecycle, or write storage.

Preference/Disposition/Goal never change Permission, Approval Routing, Tool access,
network/credential access, execution mandate, Safety, Reality, Verification, or final
decision authority.

## 22. Minimum implementation test contract

The next authorized Resolver implementation must prove at least:

1. supported/unsupported version and revision mismatch hard failures;
2. all fixed registry keys/values plus unknown key/value suppression;
3. SemanticKey family isolation and exact no-fuzzy comparison;
4. tri-state selector matching and Project A/B isolation;
5. exact specificity tuple and authority-before-scope behavior;
6. all lifecycle states and no terminal/predecessor fallback;
7. present lineage, missing predecessor, cycle/fork/self-reference behavior;
8. every per-kind compatibility/conflict matrix in section 11;
9. confidence only for equal-value Disposition representation;
10. Reality VALID/STALE/UNRESOLVED for all three dependency relations;
11. Project/Artifact fingerprint known vectors;
12. current constraint coverage/override/unresolved semantics;
13. source availability and no source fetch;
14. stable output order, canonical digests, and known `resolution_ref` vectors;
15. diagnostic bounds without semantic-selection changes;
16. empty view degradation;
17. resolved output zero transcript/source/file/web/Provider/secret/reasoning bytes;
18. hard-zero effects on Storage, Permission, Tool, Reality, Verification, and Agent
    behavior.

Tests are Resolver unit/contract tests only unless a later task separately authorizes
Context or Agent integration.

## 23. Review conclusion

```text
RESOLVER_IMPLEMENTATION_REVIEW: PASS
IMPLEMENTATION_READY: YES
IMPLEMENTATION_AUTHORIZED: NO
ARCHITECTURE_PLACEMENT: Harness.IDR.Resolver
RESOLVED_VIEW: EPHEMERAL_DERIVED_VIEW_V1
SEMANTIC_REGISTRY: FIXED_CODE_OWNED_V1
MODEL_IN_RESOLVER: NO
RANDOMNESS: NONE
RESOLUTION_PERSISTENCE: NONE
STORAGE_CONTRACT_GAPS: NONE
SCHEMA_CHANGE: NO
MIGRATION: NONE
RUNTIME_IMPLEMENTATION: NONE
AGENT_BEHAVIOR_CHANGED: NO
NEXT: USER_REVIEW_THEN_SEPARATE_RESOLVER_IMPLEMENTATION_AUTHORIZATION
```
