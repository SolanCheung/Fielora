# Fielora IDR V2 Context Integration Review

> Status: `DRAFT / CANDIDATE / DESIGN ONLY / NOT FROZEN`
>
> Date: `2026-08-28`
>
> Context integration: `NOT IMPLEMENTED`
>
> `ContextCompiler` behavior change: `NONE`
>
> Agent behavior change: `NO`

## 1. Review result

IDR V2 can integrate with the existing Agent Framework without a second Runtime, but
it is not safe to implement that integration yet. The correct boundary is:

```text
Human Model Snapshot
        +
structured Scope / Reality / current constraints
        ↓
Harness.IDR.Resolver
        ↓
ResolvedHumanModelViewV1                 ephemeral
        ↓
Harness.Ingress & Context.IDR Admission
        ↓
IDRProjectionV1                         bounded, non-authoritative
        ↓
existing Agent context assembly
        ↓
Model Context
```

A future Individualized Direction stage, if accepted, sits after resolution and
before admission as a separate optional input. It is not part of this review and is
not implemented.

The Resolver determines semantic eligibility, conflicts, and suppression. Context
Admission independently determines whether, how, and how much of the resolved view
may enter one Model invocation. `ContextCompiler` remains the existing repository
excerpt compiler; it is not renamed into, or overloaded as, the IDR Resolver.

## 2. Current context path audit

The current `fielora-agent::ContextCompiler` compiles repository file excerpts under
task-class-specific file/byte bounds. It returns selected files, digests, size/index
metrics, and deterministic rendered repository context. It has no generic
multi-source admission interface and no IDR input.

The current AgentCoordinator context path:

1. loads a bounded recent Conversation history;
2. creates a current user task message;
3. optionally appends the active work-surface identity context;
4. appends `ContextCompiler` repository excerpts;
5. records an Agent Context Snapshot containing Project root hash, selected files,
   estimated tokens, content hash, skills, and active work-surface manifest data.

The current path already provides useful stable bindings:

- Human Model revision and consistent snapshot from storage;
- Project identity and revision;
- Run and Conversation identity;
- raw current task text;
- optional active Artifact identity/revision/mode;
- existing context snapshot identity and manifest envelope.

It does not yet provide:

- normalized current-instruction constraints;
- stable IDR domain, task-type, or interaction selectors;
- generic non-Project Reality source/revision snapshots;
- a shared deterministic budget allocator spanning Conversation, Project excerpts,
  active Artifact context, skills, and IDR;
- a frozen IDR why-used manifest contract;
- a frozen semantic-key/value registry for conflict and relevance comparison.

Consequently, this review authorizes no code integration. A JSON manifest field could
technically hold future IDR evidence without a database migration, but that does not
remove the need to freeze its contract, bounds, privacy, retention, and replay
semantics first.

## 3. Authority separation

### 3.1 Resolver authority

The Resolver may decide only:

- lifecycle eligibility;
- exact scope match/mismatch/unavailability;
- supplied Reality validity/staleness/unresolved state;
- correction/supersession lineage;
- kind-specific semantic equivalence or conflict;
- deterministic suppression and effective-item ordering;
- an ephemeral resolved view and `resolution_ref`.

It may not decide Model-context admission or render arbitrary prompt text.

### 3.2 Context Admission authority

IDR Context Admission may decide only, for one invocation:

- whether an eligible resolved item is relevant to the supplied current constraints;
- whether that kind and trust class may be shown to the Model;
- how many entries/bytes/tokens fit the frozen IDR sub-budget;
- deterministic order and bounded rendering;
- which provenance refs and reason codes are recorded in why-used evidence;
- whether to degrade to an empty projection.

It may not mutate Human Model lifecycle, choose a conflict winner that Resolver did
not choose, establish Reality, grant Permission, change Work Scope, declare
Verification, activate a Candidate, learn a new item, or call a Model.

### 3.3 Required precedence

The integration must enforce:

```text
Safety / Governance / Permission
        >
Current explicit user instruction and current task constraints
        >
Current Work Scope / Goal / Verification requirement
        >
Current authoritative Reality
        >
Durable explicit Preference / confirmed Long-Term Goal
        >
Active inferred Disposition
        >
Profile default
```

In the abbreviated data-precedence form requested for IDR:

```text
CURRENT USER INPUT > CURRENT REALITY > DURABLE HUMAN MODEL
```

Durable Human Model content is always a bounded, non-authoritative personalization
signal. It cannot negate an explicit current statement, turn stale context into live
Reality, or alter the result of Governance/Verification.

## 4. Candidate Context Admission input/output

### 4.1 Input

```text
AdmitResolvedHumanModelInputV1
  admission_profile_version
  resolved_view
  current_instruction_constraints
  current_work_scope_constraints
  current_reality_binding
  remaining_context_budget
  invocation_binding
    run_ref
    conversation_ref
    project_ref
    context_snapshot_ref
```

Every input is structured and versioned. The admission layer must not infer missing
constraints from raw transcript or ask a Model to rank relevance.

### 4.2 Output

```text
IDRContextAdmissionResultV1
  admission_profile_version
  resolution_ref
  source_human_model_revision
  projection?
  admitted[]
  omitted[]
  conflicts_summary
  budget_result
  projection_digest
  why_used_manifest
```

`projection` may be absent or empty. Empty admission is a normal fail-safe result,
not an Agent error and not permission to retry with looser rules.

## 5. Admission eligibility by kind and state

| Source semantic | Model-facing default | Conditions |
|---|---:|---|
| Active, valid `FACT` | Allowed as bounded human context | Exact relevance; no current input/Reality conflict |
| Active, valid `PREFERENCE` | Allowed as soft preference | Explicitly labeled non-authoritative; no current conflict |
| `OBSERVATION` value | Never | May contribute refs to internal why-used evidence only |
| Active, valid `DISPOSITION` | Allowed as soft tendency | Explicitly active; current instruction and explicit Preference/Goal take precedence |
| Active, valid `LONG_TERM_GOAL` | Allowed as bounded durable goal context | Relevant to current task; cannot redefine current goal or completion |
| `CANDIDATE` | Never | No automatic activation |
| `WEAKENED` | Never | No fallback |
| `CONFLICTED` | No competing values | Neutral conflict summary only, if useful and bounded |
| `SUPERSEDED` | Never | Lineage may be retained only in internal why-used evidence |
| `REVOKED` | Never | Audit only; never resurrected |
| Stale Reality dependency | Never | Omit as `STALE_REALITY_REF` |
| Unresolved Reality dependency | Never | Omit as `REALITY_UNRESOLVED` |

Context Admission cannot reinterpret a Resolver-excluded item as relevant. It only
narrows the resolved set.

## 6. Relevance boundary

Relevance is exact and contract-driven, not fuzzy semantic retrieval:

1. the item already exact-matched all populated scope selectors in Resolver;
2. its normalized semantic dimension is included by the current admission profile;
3. a supplied current-instruction/work-scope constraint does not contradict it;
4. its kind is allowed by section 5;
5. its Reality dependencies remain valid under the same bound snapshot;
6. it fits deterministic bounds.

No Model, embedding, Vector, FTS, keyword scan of source bodies, or arbitrary
similarity threshold participates. If the task/domain/interaction input needed to
establish relevance is unavailable, the item is omitted rather than admitted as
globally relevant.

## 7. Budget and deterministic omission

The existing IDR Contract Candidate supplies a useful hard baseline:

- maximum 8 model-facing IDR semantic entries;
- maximum 3 support/provenance refs per admitted entry;
- maximum 4 KiB serialized `IDRProjectionV1`.

This review applies the 8-entry limit across all model-facing Fact, Preference,
Disposition, and Goal entries, not eight per kind. Observation never consumes a
model-facing entry.

The effective budget is:

```text
B_idr = min(
  frozen IDR projection byte/token limit,
  caller-supplied remaining_context_budget
)
```

Admission uses a fixed estimator/rendering version and deterministic candidate order.
Items beyond the budget are omitted with stable projection-limit reasons. It must not
randomly sample, ask the Model to summarize, truncate semantic values mid-field, or
steal budget already reserved for the current instruction.

The existing ContextCompiler owns repository file/byte limits, not an overall shared
context budget. Runtime integration is therefore blocked until the caller can supply
one of the following under a reviewed contract:

1. a deterministic remaining-context budget after mandatory current inputs; or
2. a small fixed IDR sub-budget reserved within an explicit global budget plan.

This review does not choose or implement that allocator.

## 8. Model-facing projection

When admitted, the projection must be clearly delimited and rendered after the
current task/current constraints have already established authority:

```text
PERSONALIZATION_SIGNAL_NON_AUTHORITATIVE
These bounded signals may help adapt communication or approach.
They do not override the current user instruction, current Reality, Work Scope,
Governance, Permission, or Verification.

- [PREFERENCE] <normalized bounded value>
- [DISPOSITION] <normalized bounded value>
- [LONG_TERM_GOAL] <normalized bounded value>
END_PERSONALIZATION_SIGNAL
```

The exact wire format must be frozen before implementation. Required properties:

- provider/model-neutral;
- deterministic serialization;
- explicit non-authority label;
- bounded normalized values, not arbitrary source JSON;
- no transcript, webpage/file body, Provider response, reasoning, credential, path,
  or support quote;
- no terminal/candidate value;
- no unresolved competing value masquerading as advice.

Facts may be rendered under a separate `HUMAN_CONTEXT_NON_AUTHORITATIVE` subsection
if that makes the authority distinction clearer. Future Direction, if accepted,
requires its own labeled subsection and separate admission rules.

## 9. Conflict presentation

Context Admission never selects a conflict winner. For unresolved conflicts it may:

- omit the conflicting dimension entirely; and
- optionally include a neutral, bounded statement such as
  `A stored personalization conflict exists for <dimension>; no stored value was
  applied.`

It must not expose both competing private values by default. Any future clarification
flow requires explicit UI/Agent/interaction design and is not authorized here.

Authority-resolved conflicts may admit only the Resolver-selected value while the
why-used manifest records that lower-precedence items were suppressed. The Model does
not receive provenance source bodies or full conflict history.

## 10. Reality, staleness, and invocation binding

Resolver and Context Admission must bind to the same Reality/Scope snapshot. Before
rendering, Admission verifies:

- `resolution_ref` and Human Model revision match the resolved view;
- Project identity/revision binding has not changed;
- active Artifact identity/revision binding, when used, has not changed;
- supplied Reality snapshot ref/revision or digest matches;
- current-constraint digest matches;
- admission profile version and bounds are known.

A mismatch does not trigger best-effort reuse. Admission returns an empty projection
or asks the caller to obtain a new resolved view. Stale and unresolved items are
always omitted.

No IDR Fact is allowed to override authoritative current Project/Artifact/Decision/
Verification state. Fielora-owned Reality remains outside IDR authority.

## 11. Why-used and explainability

Every admitted semantic item must be explainable without private chain-of-thought.
The future bounded why-used manifest records:

- `item_id` / stable item ref;
- kind;
- matched scope selectors;
- lifecycle (`ACTIVE` only for admitted values);
- evidence basis and Disposition confidence when applicable;
- bounded provenance refs, not source bodies;
- Reality refs and validation outcome;
- admission and resolution reason codes;
- Resolver Contract/profile version;
- source Human Model revision;
- `resolution_ref`;
- Context Admission profile/rendering version;
- invocation Project/Artifact/Reality revision bindings;
- projection entry count, bytes/token estimate, digest, and omitted count;
- structured conflict count/state.

The existing Agent Context Snapshot manifest is the correct future run-evidence
owner because it already records context provenance. Adding a versioned `idr` entry
to that manifest requires a Contract/retention/privacy review but does not, by itself,
justify an IDR resolution table or cache.

The manifest must never record transcript copies, source support bodies, webpage/file
bodies, prompt/response bodies, Provider reasoning, credentials, API keys,
Authorization, passwords, private keys, or hidden chain-of-thought.

## 12. Storage, Resolver, and Admission governance

### 12.1 Storage admission

Owns durable write boundaries:

- closed kind/payload/version and byte bounds;
- prohibited sensitive-data classes;
- valid evidence basis/confidence matrix;
- scope and reference structure;
- lifecycle transition and revision CAS;
- provenance and Reality reference shape;
- erasure/disable/reset behavior.

It does not decide semantic winners or Model visibility.

### 12.2 Resolver

Owns deterministic derived semantics:

- current lifecycle/scope/Reality eligibility;
- lineage;
- kind-specific precedence;
- structured conflicts and exclusions;
- `ResolvedHumanModelViewV1`.

It does not write storage, activate candidates, or retrieve source bodies.

### 12.3 Context admission

Owns per-invocation exposure:

- current relevance/precedence checks;
- kind/trust allowlist;
- projection bounds and rendering;
- why-used evidence;
- fail-safe empty projection.

It cannot repair bad storage, invent Resolver decisions, or weaken Governance.

## 13. Failure modes and design defenses

| Failure mode | Design-level defense |
|---|---|
| Old preference overrides explicit new user statement | Current structured instruction constraints are evaluated before durable Human Model; conflicting stored value is suppressed. If constraints are unavailable, fail closed rather than parse raw text or admit the dimension. |
| Inferred Disposition is treated as Fact | Closed kind-specific output channels; Disposition can only enter a labeled soft personalization section, never `FACT`/Reality; inferred Candidate remains excluded until explicit activation. |
| Global item leaks into incompatible scoped context | Exact conjunctive selectors plus semantic-key conflict resolution; matching narrower item suppresses a broad item only for that scope; unavailable selector input excludes instead of falling back global. |
| Project A item affects Project B | Exact Fielora-owned Project identity match; Project path/name similarity is ignored; mismatch is immediate exclusion. |
| Revoked item reappears | `REVOKED` is terminal, audit-only, Context-ineligible; no predecessor fallback and no resolution cache. |
| Superseded predecessor reappears | Only the current eligible chain leaf may contribute; predecessors are lineage-only; invalid current leaf never revives an ancestor. |
| Stale Reality ref is treated as live Fact | Tri-state Reality validation; only supplied authoritative projection can yield VALID/STALE; missing authority is UNRESOLVED; both stale and unresolved are excluded. |
| Candidate enters context automatically | Lifecycle matrix excludes all Candidates regardless of confidence, scope match, or absence of alternatives; Resolver cannot activate. |
| Conflicting Facts are silently collapsed | No timestamp last-write-wins; equal-authority contradictions produce structured conflict and all competing values are excluded. |
| Weak Observation becomes permanent personality | Observation is support-only and never model-facing guidance; count/age cannot activate or create a Disposition. |
| Human Model floods context budget | Fixed maximum 8 entries, 3 support refs, 4 KiB projection plus caller remaining-budget cap and deterministic omissions; no per-kind multiplication. |
| Resolver output changes nondeterministically | Model-free algorithm, canonical structured inputs, fixed profile/version, canonical ordering/serialization, and content-derived `resolution_ref`; no implicit clock. |
| Model receives IDR source body | Projection allowlists normalized bounded semantic values only; provenance remains ref-only in why-used evidence; source body, transcript, webpage/file body, and Provider response are forbidden. |

Additional defensive cases:

| Failure mode | Design-level defense |
|---|---|
| Higher-confidence inferred item overrides explicit preference | Authority/kind is applied before confidence; confidence only ranks otherwise equal inferred active Dispositions. |
| Context changes after resolution | Admission revalidates Project/Artifact/Reality/current-constraint bindings and rejects stale `resolution_ref`. |
| Unknown task/domain/interaction is treated as a match | `source_availability` is explicit; populated unavailable selector yields `SCOPE_INPUT_UNAVAILABLE`. |
| Resolver conflict is hidden by admission | Admission cannot select a new winner; it records conflict state and omits competing values. |
| Model output is learned back automatically | No learning/extraction path exists in this design; future Model output may only propose through a separately governed Candidate flow. |

## 14. Error and degradation behavior

| Condition | Admission behavior |
|---|---|
| Unknown Contract/profile/rendering version | Empty projection; stable fail-closed error/diagnostic |
| Human Model revision mismatch | Reject view and request fresh deterministic resolution |
| Missing current constraints for a potentially conflicting dimension | Omit dimension as `CURRENT_CONSTRAINTS_UNAVAILABLE` |
| Missing Reality authority | Omit dependent item as `REALITY_UNRESOLVED` |
| Budget is zero or too small for a complete item | Empty projection or omit item; never partial-field truncation |
| Why-used manifest cannot be bounded/serialized | Empty projection; do not send an untraceable signal |
| One item is malformed | Resolver should have rejected input; Admission rejects the full untrusted view rather than repairing it |
| IDR subsystem unavailable | Continue Agent invocation without IDR; current task and existing repository context remain unchanged |

IDR failure must not prevent a valid ordinary Agent run unless a future explicit
product policy says otherwise. Degradation removes personalization; it never removes
Governance or current Reality.

## 15. Privacy and security rules

The integration continues to prohibit:

- credentials, API keys, Authorization headers, passwords, and private keys;
- prompt/transcript copies as durable Human Model or why-used evidence;
- webpage/file/repository source bodies in IDR projection or provenance;
- Provider response bodies or Provider-specific reasoning;
- private chain-of-thought;
- arbitrary path disclosure;
- automatic source retrieval from a provenance ref;
- Model-authored activation or lifecycle mutation;
- implicit cross-Project sharing.

The Model sees only the bounded semantic projection required for the current
invocation. Internal excluded/conflict diagnostics are not automatically Model-facing.

## 16. Required contract changes before implementation

Before an implementation review can authorize code, the following must be accepted:

1. split deterministic `ResolvedHumanModelViewV1` from future
   `IndividualizedDirection`;
2. freeze Resolver and Admission input/output versions and canonical serialization;
3. freeze `SCOPE_INPUT_UNAVAILABLE`, `CURRENT_CONSTRAINTS_UNAVAILABLE`,
   `REALITY_UNRESOLVED`, and `LOWER_PRECEDENCE` semantics;
4. freeze semantic key/value normalization per Human Model kind;
5. define normalized current-instruction/current-work-scope constraint projection;
6. define stable domain/task-type/interaction selectors or explicitly leave them
   unsupported for the first implementation;
7. define provider-neutral Project/non-Project Reality snapshot bindings;
8. choose deterministic global/remaining context budget ownership;
9. freeze `IDRProjectionV1` rendering and why-used manifest bounds;
10. define context snapshot retention/redaction for IDR refs/digests;
11. specify exact tests proving precedence, Project isolation, lifecycle exclusion,
    conflict preservation, stale/unresolved handling, budget bounds, determinism, and
    zero forbidden body/secret leakage.

No item on this list requires a new database table. If later evidence shows an
unavoidable schema impact, it requires a new Change Impact review rather than being
smuggled into context work.

## 17. Review conclusion

```text
IDR_V2_CONTEXT_INTEGRATION_REVIEW: PASS_DESIGN_ONLY
ARCHITECTURE_PLACEMENT: Harness.Ingress & Context.IDR Admission
RESOLVER_AND_ADMISSION: SEPARATE
CONTEXTCOMPILER_BEHAVIOR: UNCHANGED
CURRENT_INPUT_PRECEDENCE: CURRENT_USER_INPUT > CURRENT_REALITY > HUMAN_MODEL
CONTEXT_BUDGET: BOUNDED_CONTRACT_REQUIRED_BEFORE_RUNTIME
WHY_USED: EXISTING_CONTEXT_SNAPSHOT_FUTURE_VERSIONED_ENTRY
RESOLUTION_PERSISTENCE: NONE
MODEL_EXTRACTION_OR_LEARNING: NONE
RUNTIME_IMPLEMENTATION: NONE
SCHEMA_CHANGE: NO
AGENT_BEHAVIOR_CHANGED: NO
NEXT: IDR_V2_RESOLVER_IMPLEMENTATION_REVIEW_NOT_IMPLEMENTED
```
