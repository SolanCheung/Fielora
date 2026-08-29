# Fielora IDR V2 Resolver Candidate

> Status: `IMPLEMENTATION REVIEW PASS / IMPLEMENTATION-READY CANDIDATE / NOT FROZEN`
>
> Date: `2026-08-28`
>
> Runtime implementation: `NONE`
>
> Schema change: `NO`
>
> Model in Resolver: `NO`

## 1. Purpose and boundary

This Candidate defines the deterministic semantic Resolver for the IDR V2 Human
Model. It does not implement the Resolver, connect IDR to the current Agent context,
change `ContextCompiler`, or authorize learning, extraction, automatic activation,
UI, FIPC, FTS, Vector, Embedding, Provider, Tool, Permission, Reality, Verification,
or Agent behavior changes.

The canonical placement is:

```text
Harness
├─ IDR
│  ├─ Human Model Storage                  implemented Candidate
│  ├─ Resolver                             this design Candidate
│  ├─ Individualized Direction            future, not implemented
│  └─ Learning / Proposal                  future, not implemented
│
└─ Ingress & Context
   ├─ IDR Context Admission                separate design review
   └─ ContextCompiler / context assembly   existing, unchanged
```

The Resolver answers only:

> Under supplied Reality, Scope, lifecycle, authority, and versioned rules, which
> Human Model semantics remain effective, conflict, are superseded, are invalid,
> or may be offered to a later Context Admission step?

It does not answer:

- whether an item is allowed into a particular Model invocation;
- how many Model-context bytes or tokens it receives;
- what the Model should plan or do;
- whether a Tool may execute;
- whether Reality is true beyond the supplied authoritative projection;
- whether work is verified or complete;
- whether a Candidate should be activated;
- what new Human Model items should be learned;
- what the final user-facing answer or decision should be.

The Resolver is a deterministic component inside existing `Harness.IDR`, not a
second Runtime, retrieval system, memory database, or Model invocation.

## 2. Relationship to the existing IDR V2 Contract

This design preserves the existing Contract Candidate's lifecycle, scope,
precedence, boundedness, reason-code, authority, and ephemeral-resolution rules.
The initial design proposed, and the Implementation Review now accepts, one important
separation:

- the Resolver returns a provider/model-neutral `ResolvedHumanModelViewV1`;
- it does **not** generate `IndividualizedDirection`;
- a future Direction stage may consume `resolution_ref` and the resolved view;
- IDR Context Admission may consume the resolved view and, only after a separate
  future contract, a bounded Direction produced by that later stage.

The current Contract Candidate places an inline `direction` in
`DispositionResolutionResult`. The Implementation Review freezes the split in
`FIELORA_IDR_V2_RESOLVER_IMPLEMENTATION_CONTRACT_CANDIDATE.md`: deterministic
Human Model resolution returns `ResolvedHumanModelViewV1`; future Direction is a
separate stage. No durable schema change follows from that split.

## 3. Resolver profile and structured input

### 3.1 Candidate input contract

```text
ResolveHumanModelInputV1
  contract_version
  resolver_profile_version
  human_model_revision
  human_model_items[]
  current_scope
    project_ref?
    domain?
    task_type?
    interaction_kind?
  current_reality_snapshot
  current_instruction_constraints
  source_availability
  bounds
```

The input is a structured, Fielora-owned projection. The Resolver must not parse a
raw user prompt, transcript, repository body, webpage, file body, or Provider
response to manufacture missing selectors, constraints, or Reality.

`source_availability` explicitly records which structured inputs are authoritative,
unavailable, or only partially supplied. Missing data is not silently equivalent to
global scope, no conflict, or live Reality.

### 3.2 Current availability audit

| Input | Current repository availability | Resolver V1 treatment |
|---|---|---|
| Human Model aggregate revision and consistent item snapshot | Available through `fielora-storage::idr` | Direct structured input |
| Contract/profile version | Can be a fixed implementation constant after freeze | Required and included in `resolution_ref` |
| Project identity | Available as existing Field/Project identity, including `AgentRunView.field_id` | Exact project selector match is possible |
| Project revision | Available on current Project view | May validate a Project Reality revision dependency when explicitly supplied |
| Conversation and Run identity | Available | Diagnostic/binding only; neither grants semantic authority |
| Current task text | Available as a raw string | Not parsed by Resolver; cannot substitute for normalized constraints |
| Current task type | Private `FAST_EDIT / FOCUSED_EDIT / GENERAL` orchestration classification exists | `PARTIAL`; V1 mapping is frozen but not exposed to an IDR caller |
| Domain selector | Current Harness profile is `CODING_V0.1` | `PARTIAL`; V1 maps it to `CODING`, but no IDR caller exists |
| Interaction kind | No stable IDR interaction contract | `UNAVAILABLE`; do not assume every invocation is `CHAT` |
| Current instruction constraints | No stable structured projection; current user text exists only as raw task/message | `UNAVAILABLE` for deterministic conflict checks |
| Active Artifact identity/revision | Available only when `ActiveArtifactContext` is supplied | Exact current-artifact dependency may be validated |
| General non-Project Reality snapshot | No provider-neutral live projection for Decision, Verification, FieldObject, or other refs | `UNAVAILABLE` |
| Dimension/value registry | No runtime registry exists | Fixed code-owned V1 registry is now frozen in the Implementation Contract Candidate |
| Evaluation time/freshness policy | Item timestamps exist; no accepted decay/freshness semantics exist | Not used for precedence or aging |

Consequences:

1. Project selector matching can be exact today when a Project identity is supplied.
2. A populated selector whose corresponding current input is unavailable is excluded
   with `SCOPE_INPUT_UNAVAILABLE`; it is not treated as a broader match.
3. Current-instruction conflict protection requires a future structured projection.
   Until it exists, admission of any semantic dimension that could contradict the
   current instruction must fail closed with `CURRENT_CONSTRAINTS_UNAVAILABLE`.
4. A non-Project Reality dependency without a supplied authoritative current
   projection is `REALITY_UNRESOLVED`, never guessed as live or stale.
5. Existing orchestration task classification may be reused only after it becomes a
   documented, versioned IDR input; the Resolver must not depend on a private helper.

### 3.3 Candidate reason-code additions

The following original fail-closed additions are retained. The complete reviewed V1
taxonomy is frozen in the Implementation Contract Candidate Section 19:

| Code | Meaning |
|---|---|
| `SCOPE_INPUT_UNAVAILABLE` | An item has a populated selector but the matching current selector was not supplied |
| `CURRENT_CONSTRAINTS_UNAVAILABLE` | Safe comparison against the current instruction cannot be performed |
| `REALITY_UNRESOLVED` | The relevant Reality authority or current projection was not supplied |
| `LOWER_PRECEDENCE` | A valid item is suppressed by a higher-authority or more-specific valid item |

Existing reason codes, including `SOURCE_CONFLICT`, `SCOPE_MISMATCH`,
`STALE_REALITY_REF`, `SUPERSEDED_ITEM`, `REVOKED_ITEM`, and projection-limit reasons,
remain applicable. `CURRENT_CONSTRAINTS_UNAVAILABLE` is represented by an unresolved
constraint state plus this stable suppression reason; Context Admission always omits
that item.

## 4. Resolution stages

For a fixed input and profile version the Resolver uses the exact 15-stage sequence in
`FIELORA_IDR_V2_RESOLVER_IMPLEMENTATION_CONTRACT_CANDIDATE.md` Section 17:
envelope/snapshot/context validation → registry projection → lineage → lifecycle →
Scope → source/Reality/current constraints → semantic grouping → kind-specific
authority/specificity → conflicts → stable output/reference. That reviewed ordering
supersedes the earlier high-level sequence and ensures lineage is resolved before
semantic grouping while current constraints remain a structured input.

There is no Model call, embedding lookup, fuzzy ranking, probabilistic threshold,
wall-clock-dependent decay, or silent last-write-wins at any stage.

## 5. Lifecycle eligibility

| Lifecycle | Resolver may read | May contribute effective semantic value | May appear in conflict/diagnostic output | Default Context eligibility |
|---|---:|---:|---:|---:|
| `CANDIDATE` | Yes | No | Yes | No |
| `ACTIVE` | Yes | Yes, subject to scope/Reality/conflict rules | Yes | Candidate for later admission only |
| `WEAKENED` | Yes | No | Yes | No |
| `CONFLICTED` | Yes | No | Yes | No |
| `SUPERSEDED` | Yes | No | Yes, as lineage only | No |
| `REVOKED` | Yes | No | Yes, as audit/erasure fact only | No |

Hard rules:

- `CANDIDATE` never becomes usable merely because its confidence is high, it matches
  scope, or no competing item exists.
- An inferred `DISPOSITION` remains `CANDIDATE` until an explicit lifecycle
  transition activates it under the accepted Contract. Resolver cannot activate it.
- `WEAKENED` is not a fallback tier. If it is the only item, the result is empty.
- `CONFLICTED` contributes structured conflict metadata, never one of its competing
  values as hidden guidance.
- terminal items never re-enter current semantics.
- Resolver output does not mutate lifecycle.

## 6. Exact scope matching and precedence

### 6.1 Selector composition

An item's populated selectors are conjunctive:

```text
matches(item, current_scope) =
  every populated item selector has an available current selector
  AND every populated item selector exactly equals that current selector
```

An item with no selectors is `GLOBAL`. A selector mismatch is immediately excluded
as `SCOPE_MISMATCH`. An unavailable current selector is excluded as
`SCOPE_INPUT_UNAVAILABLE`. There is no fuzzy relevance, partial-match fallback, or
implicit default value.

### 6.2 Project isolation

A Project-scoped item may affect only the exact same Fielora-owned Project identity.
It never crosses Project boundaries, even when directory names, paths, repository
hashes, task text, or Provider identity appear similar. Project paths do not replace
Project identity.

### 6.3 Specificity

Among already matching items at the same semantic authority and kind tier, use the
Contract Candidate's lexicographic specificity key, descending:

1. `project_ref` is populated;
2. total populated selector count;
3. `task_type` is populated;
4. `interaction_kind` is populated;
5. `domain` is populated.

This ordering is deterministic. It does not allow an inferred item to outrank an
explicit item merely by being more narrowly scoped. Authority/kind rules are applied
before scope specificity.

### 6.4 Broad versus narrow semantics

- If matching broad and narrow items express the same normalized value, the narrower
  item is selected and the broad item is suppressed as `LOWER_PRECEDENCE`.
- If they contradict and have equal semantic authority/kind tier, the narrower item
  wins for that current scope; the broad item remains valid elsewhere and is reported
  as suppressed for this resolution.
- If authority differs, the higher-authority item wins before scope. A narrow inferred
  Disposition cannot override an explicit Preference or confirmed Goal.
- Equal-authority, equal-specificity contradictory items remain a structured conflict;
  item ID or timestamp must not silently choose a winner.

## 7. Kind-specific semantics

The five kinds are not generic memory chunks and do not share one ranking rule.

### 7.1 `FACT`

- Represents durable human context, not Fielora Project/Work Reality.
- May enter `effective_human_context` only when `ACTIVE`, scope-matched, and all
  dependencies are `VALID`.
- Current authoritative Reality always overrides a durable Fact.
- Conflicting Facts require explicit correction/supersession or supplied Reality to
  resolve. Recency alone is not authority.
- A Fact never becomes an instruction, Permission, Verification, or final decision.

### 7.2 `PREFERENCE`

- An active explicit Preference is eligible as a soft behavioral candidate.
- It is subordinate to current instruction, current Reality, Work Scope/Goal,
  Governance, and Verification requirements.
- A Preference change should use correction/supersession lineage. Two contradictory
  active Preferences with the same semantic key and no lineage form a conflict.
- It may outrank an inferred Disposition on the same behavioral dimension.

### 7.3 `OBSERVATION`

- Is bounded evidence about an interaction or pattern, never direct guidance.
- Never enters `effective_human_context` or `relevant_dispositions` as a behavioral
  value.
- May be referenced as bounded support for an already eligible item.
- Contradictory observations do not elect a behavior. They preserve evidence conflict
  unless a later explicit proposal/activation path resolves it.
- Observation count, age, or repetition never automatically creates personality.

### 7.4 `DISPOSITION`

- Only `ACTIVE` Dispositions may be considered; inferred Candidate Dispositions are
  excluded regardless of confidence.
- Contributes a soft `relevant_dispositions` candidate, never a Fact or authority.
- Explicit Preference or confirmed Goal on the same dimension outranks an inferred
  Disposition.
- Confidence is used only as defined in section 10.
- Resolver cannot activate, weaken, revoke, or learn a Disposition.

### 7.5 `LONG_TERM_GOAL`

- An active confirmed Goal may contribute durable human context and a soft
  prioritization candidate.
- The current task and explicit current goal always outrank it.
- Replacement should use correction/supersession lineage. A newer timestamp alone
  does not replace an older Goal.
- Independent non-contradictory Goals may coexist within bounds. Contradictory Goals
  with the same registered Goal key and no lineage form a structured conflict.
- A Goal never establishes Project completion, Verification, Permission, or Reality.

## 8. Semantic keys and conflicts

The Implementation Review freezes a closed/versioned normalization Contract for each
payload kind. Storage's typed payload remains the durable envelope; the fixed registry
is code-owned application Contract state, not a database table.

Candidate grouping keys are:

| Kind | Conflict/equivalence key |
|---|---|
| `FACT` | normalized fact subject/key |
| `PREFERENCE` | normalized preference dimension |
| `OBSERVATION` | unique Observation item identity; never a winner pool |
| `DISPOSITION` | normalized disposition dimension |
| `LONG_TERM_GOAL` | registered Goal key only |

The Resolver returns a structured conflict set. It does not silently collapse
contradictions.

### 8.1 Explicit versus inferred

- An explicit Preference or confirmed Goal outranks an inferred Disposition on the
  same dimension.
- If the values agree, the inferred item is redundant and suppressed as
  `LOWER_PRECEDENCE`.
- If the values contradict, the explicit item is effective, while the inferred item
  is excluded and the authority-resolved conflict remains explainable.
- Inference confidence never reverses this rule.

### 8.2 Newer versus older

Creation or update timestamp is not a general winner rule. Newer wins only when an
accepted correction/supersession relation explicitly establishes replacement. With
no lineage or external authority, equal-authority contradictions remain conflicts.

### 8.3 Active versus weakened

An `ACTIVE` item may be eligible. A `WEAKENED` item is excluded. It cannot override,
support, or fill in for an Active value in current semantics.

### 8.4 Unresolved conflict behavior

When contradictory items remain equal after authority, lifecycle, scope, Reality,
lineage, and permitted confidence rules:

- all competing values are excluded from effective semantic output;
- a conflict record contains item refs, kind/key, scopes, reason codes, and resolution
  state `UNRESOLVED`;
- Context Admission receives neutral conflict metadata, not one competing value;
- no item ID, storage order, timestamp, or Provider order selects a winner.

## 9. Supersession and lineage

For a valid chain:

```text
A ← B ← C
```

where each arrow is an accepted correction/supersession relation:

- `C` is the current leaf only if it is `ACTIVE`, scope-matched, Reality-valid, and
  otherwise eligible;
- `A` and `B` are terminal predecessors and never contribute current semantic values;
- predecessor refs may appear only in bounded lineage/explainability metadata;
- terminal items may be read for audit and resolution diagnostics, but are never
  current context candidates;
- a missing, cyclic, multiply-current, or structurally invalid chain fails closed.

If the current leaf is revoked, conflicted, weakened, stale, or unresolved, the
Resolver does not revive its predecessor. Replacement lineage is not a fallback
stack.

## 10. Disposition confidence

`LOW / MEDIUM / HIGH` remains exclusive to `DISPOSITION`.

- Confidence does not affect lifecycle eligibility.
- Confidence does not activate a Candidate.
- Confidence does not override explicit Preference, confirmed Goal, current user
  instruction, current Reality, or scope specificity.
- It may select the representative among otherwise equal-scope, equal-authority,
  inferred, Active Dispositions only when their normalized semantic value is equal.
- Different values remain a structured conflict regardless of confidence.
- Confidence may be exposed to Context Admission as bounded metadata, but admission
  cannot use it to bypass any rule above.

Confidence must not be added to Fact, Preference, Observation, or Goal without a new
Contract review.

## 11. Reality validity

Reality dependency evaluation is tri-state:

```text
VALID       authoritative current projection supplied and dependency satisfied
STALE       authoritative current projection supplied and dependency mismatched
UNRESOLVED  authority or current projection not supplied
```

### 11.1 Project Reality

- Project ownership validation already exists in storage and prevents unknown
  Project identity from being written.
- `MUST_EXIST` and exact revision dependency can be evaluated when current Project
  identity/revision are supplied.
- `FINGERPRINT_MATCH` cannot be evaluated unless a canonical Project fingerprint is
  supplied; current identity/revision alone is insufficient.
- A confirmed mismatch yields `STALE_REALITY_REF`. Missing current data yields
  `REALITY_UNRESOLVED`.

### 11.2 Non-Project Reality

Storage currently validates only bounded tagged-reference structure. The Resolver
must not claim general live validation for Decision, Verification, FieldObject, or
other Fielora-owned Reality refs until their authoritative current projections are
defined.

An exact active Artifact identity/revision may be validated only when the caller
supplies the current `ActiveArtifactContext` as an authoritative projection. Other
non-Project refs remain unresolved.

`STALE_REALITY_REF` is used only for a definitive mismatch against supplied
authority. Unknown is `REALITY_UNRESOLVED`; it is neither live nor stale. Both stale
and unresolved dependencies exclude the semantic item from effective output.

## 12. Freshness and time

The current Contract and schema contain timestamps but do not define semantic decay,
observation half-life, preference aging, or long-term-goal expiry. Resolver V1
therefore applies no wall-clock freshness algorithm.

- timestamps are retained for audit and explicit lineage;
- timestamp alone never establishes preference change or goal replacement;
- observations do not decay into, or accumulate into, Dispositions;
- long-term Goals do not expire merely due to age;
- `evaluation_time` is omitted from Resolver V1 input and `resolution_ref` unless a
  later version introduces an explicit deterministic freshness profile.

Any future time rule requires a versioned Contract/profile, a declared clock input,
deterministic boundary semantics, privacy review, and regression evidence.

## 13. Provider/model-neutral output

### 13.1 `ResolvedHumanModelViewV1`

The shape below is the original high-level projection. The exact field-level DTO,
canonical encoding, bounds, and ordering in the Implementation Contract Candidate
Section 18 are normative for Resolver V1 and use one `effective_items[]` collection.

```text
ResolvedHumanModelViewV1
  contract_version
  resolver_profile_version
  resolution_ref
  source_human_model_revision
  input_binding
    project_ref?
    project_revision?
    task_type?
    domain?
    interaction_kind?
    current_constraints_digest?
    reality_snapshot_ref?
    reality_snapshot_revision?
  effective_human_context[]
  relevant_dispositions[]
  conflicts[]
  excluded_items[]
  reality_diagnostics[]
  bound_result
```

`effective_human_context` may contain only eligible Fact and Long-Term Goal semantic
items. `relevant_dispositions` may contain only eligible Preference, active
Disposition, and bounded Goal prioritization candidates. Observation is support only.

Each returned entry is bounded and includes only:

- item ref/ID;
- kind and payload contract version;
- normalized semantic key and bounded normalized value;
- matched scope;
- lifecycle;
- evidence basis and, only for Disposition, confidence;
- bounded provenance refs and Reality refs;
- resolution reason codes;
- bounded lineage/support refs.

It must never copy transcript text, source body, webpage/file body, Provider response,
credentials, Authorization material, or reasoning.

### 13.2 Conflict and exclusion records

Conflict entries include a normalized key, competing item refs, authority/scope facts,
resolution state (`RESOLVED_BY_AUTHORITY`, `RESOLVED_BY_SCOPE`, or `UNRESOLVED`), and
reason codes. They do not contain private source bodies.

Excluded entries include item ref, lifecycle, and one or more stable exclusion reason
codes. This makes omission auditable without making terminal or sensitive values
Model-visible.

### 13.3 Bounds

Resolver uses the structural input/reference/lineage/diagnostic bounds frozen in the
Implementation Contract. It does not own the 8-entry/4-KiB Model-context budget.
`IDRContextAdmissionV1` separately limits the model-facing contribution to 8 total
entries, 3 provenance refs per admitted item, and 4 KiB UTF-8. Resolver diagnostics
never enter Model context as a whole.

## 14. Deterministic ordering and reference

Canonical ordering uses, in order:

1. external authority/override status;
2. kind/semantic authority tier;
3. scope specificity descending;
4. Disposition confidence only where section 10 permits it;
5. canonical semantic key;
6. item ID as a final stable ordering key, never as a semantic winner.

`resolution_ref` is a digest of canonical serialization of:

- Contract version;
- Resolver profile version;
- Human Model aggregate revision;
- structured scope values and source-availability states;
- current Project/Artifact/Reality refs and revisions or digests;
- current-instruction constraint digest, when available;
- bounds/profile identifiers;
- the canonical resolved result.

It excludes source bodies, paths, transcript, Provider identity, response bodies, and
credentials. If a future freshness profile uses time, the exact evaluation instant
becomes an explicit hashed input. With the same inputs and profile, the resolved view
and `resolution_ref` must be byte-identical after canonical serialization.

## 15. Resolution persistence

`RESOLUTION_PERSISTENCE` remains `NONE`.

The Resolver output is ephemeral derived state. No `idr_resolutions`, direction
snapshot, cache, embedding, Vector, or FTS table is justified. When a bounded subset
is later admitted into an Agent invocation, only its why-used manifest and projection
digest may be recorded in the existing Agent Context Snapshot under a separately
reviewed integration contract. That snapshot is run evidence, not a new Human Model
authority or reusable resolution cache.

## 16. Privacy and governance separation

| Layer | Owns | Must not own |
|---|---|---|
| Storage admission | durable type/version/bounds, prohibited-secret classes, provenance/ref shape, lifecycle transition and revision CAS | semantic winner selection, Model-context inclusion |
| Resolver | lifecycle/scope/Reality eligibility, lineage, semantic conflicts, deterministic effective view | learning, activation, Tool/Permission, Reality mutation, Context budget, Model call |
| Context admission | whether/how a resolved semantic item enters one bounded Model context and why | lifecycle mutation, conflict invention, durable learning, Reality truth |

All three layers reject credentials, API keys, Authorization, passwords, private keys,
source transcript copies, webpage/file bodies, Provider reasoning, and hidden
chain-of-thought. A provenance ref is not permission to inline its source body.

## 17. Implementation Review disposition

The previously open Resolver input/algorithm questions are closed for V1 by
`FIELORA_IDR_V2_RESOLVER_IMPLEMENTATION_CONTRACT_CANDIDATE.md`:

- a fixed code-owned semantic registry and exact SemanticKey families;
- fixed domain/task/interaction selector vocabulary and tri-state availability;
- provider-neutral current constraints, source availability, and Reality projection;
- Project/Artifact fingerprint preimages;
- a formal Scope tuple and kind-specific comparator;
- explicit lineage/missing-predecessor behavior;
- hard-error versus item-suppression reason codes;
- canonical byte encoding, result ordering, structural bounds, and test vectors;
- `ResolvedHumanModelViewV1` as an ephemeral derived view;
- no Direction generation, Model, randomness, persistence, schema, or Agent integration.

The current Agent path still lacks builders for normalized current constraints,
interaction/applicability, generic non-Project Reality, and shared Context budget.
Those are integration prerequisites, not unresolved Resolver semantics. Resolver V1
can be implemented against explicit DTO inputs when separately authorized; Context
Admission/Agent integration remains unauthorized.

## 18. Candidate conclusion

```text
IDR_V2_RESOLVER_DESIGN: IMPLEMENTATION_REVIEW_PASS
IMPLEMENTATION_READY: YES
IMPLEMENTATION_AUTHORIZED: NO
ARCHITECTURE_PLACEMENT: Harness.IDR.Resolver
RESOLVER_AUTHORITY: deterministic semantic eligibility/conflict/suppression only
CONTEXT_RETRIEVAL: NOT_THE_RESOLVER
MODEL_IN_RESOLVER: NO
INDIVIDUALIZED_DIRECTION: FUTURE_SEPARATE_STAGE
RESOLUTION_PERSISTENCE: NONE
SCHEMA_CHANGE: NO
RUNTIME_IMPLEMENTATION: NONE
AGENT_BEHAVIOR_CHANGED: NO
STORAGE_CONTRACT_GAPS: NONE
NEXT: USER_REVIEW_THEN_SEPARATE_RESOLVER_IMPLEMENTATION_AUTHORIZATION
```
