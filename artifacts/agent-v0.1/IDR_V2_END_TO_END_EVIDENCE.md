# IDR V2 End-to-End Implementation Evidence

```text
DATE: 2026-08-29
BASE_COMMIT: 2eb6ec99b7f43b268b7865c768d3b2fdfb50ad75
IMPLEMENTATION_COMMITS: 6d17b62, 23b6d88, 958510c
ARCHITECTURE: CLOSED / UNCHANGED
IDR_V2_STATUS: FROZEN
FREEZE_BLOCKERS: NONE
```

## Implemented production chain

The implementation reuses the existing `AgentCoordinator`, `ContextCompiler`, AgentRun,
Model request, storage worker, Policy/Approval, Tool, Verification, and Context Snapshot
owners. It does not create a second Agent, Runtime, Coordinator, Context compiler, Model
call, permission system, Reality source, or durable resolved-view history.

```text
typed primary semantic projection / trusted current state
  -> CurrentConstraintProjectionV1
  -> normalized Work Scope + Project/Artifact Reality + source availability
  -> storage-owned HumanModelSnapshot
  -> HumanModelResolverV1
  -> ephemeral ResolvedHumanModelViewV1
  -> IDRContextAdmissionV1
  -> bounded PERSONALIZATION_CONTEXT
  -> existing ContextCompiler and Model request
```

Missing natural-language projection, unsupported Reality kinds, absent sources, empty
Human Model, empty budget, or irrelevant items produce no/partial contribution and the
Generic Agent continues. Integrity failures discard the attempt's contribution, record a
bounded diagnostic, and never reuse stale personalization.

The production snapshot records participation/effective participation, Human Model
revision, Resolver and resolution-profile versions, resolution ref, invalidation
fingerprint, projection digest, WhyUsed manifest, diagnostic, Human Model read latency,
builder latency, Resolver latency, Admission latency, and extra context bytes in the
existing `agent_context_snapshots` ledger.

## Acquisition and lifecycle

- Explicit Fact, Preference, and Long-term Goal proposals use deterministic registry,
  scope, provenance, sensitive-admission, payload, and expected-revision validation.
- Observation acquisition is bounded evidence and is never active personalization.
- Inferred Disposition requires existing Observation support and is created only as
  `CANDIDATE`.
- Explicit activation requires user confirmation, a legal transition, and the expected
  Human Model revision. Automatic activation is absent.
- Correction/supersession, disable, erase, and reset are atomic and revision checked.
- Secret, credential, and secret-derived material is denied; no secret digest, prefix,
  last-four value, or credential fingerprint is generated.
- Erasure evidence is application-level semantic erasure, not a forensic disk-wipe or
  legal secure-deletion claim.

## Required evaluation suites

| Suite | Result | Evidence focus |
|---|---:|---|
| Explicit Preference OFF/ON | PASS | ON adherence 1 vs OFF 0; task success 1 vs 1 |
| Current Override | PASS | explicit current requirement suppresses incompatible durable preference |
| Scope Isolation | PASS | unrelated task receives no scoped contribution |
| Inferred Disposition Candidate | PASS | Candidate is behaviorally equivalent to OFF |
| Activated Disposition | PASS | contribution appears only after explicit activation |
| Preference Correction | PASS | superseded value does not influence the next resolution |
| Reality Conflict | PASS | authoritative current Reality suppresses stale signal |
| IDR Failure | PASS | bad snapshot/registry/revision/Reality fail soft without stale reuse |
| Provider Swap | PASS | provider-neutral semantic projection and Agent Profile remain stable |
| Erasure | PASS | erased content is absent from later projection and WhyUsed evidence |

Required suites: `10/10 PASS`.

Representative deterministic fixture metrics from the final targeted run:

```text
extra_context_bytes: 180
rough_token_estimate: approximately 45 (bytes / 4; not a tokenizer claim)
human_model_read_micros: 0 (snapshot preloaded by the Eval fixture)
builder_micros: 420
resolver_micros: 983
admission_micros: 553
total_idr_preparation_micros: 1956
preference_adherence_off/on: 0/1
task_success_off/on: 1/1
wrong_memory_off/on: 0/0
scope_leakage_off/on: 0/0
over_personalization_off/on: 0/0
```

The microsecond numbers are one local deterministic-fixture observation and may vary by
host/load. They are not live-Provider latency claims. The production path measures the
actual bounded SQLite Human Model snapshot read separately and records it as
`human_model_read_latency_micros` in Context Snapshot evidence; the Eval fixture supplies
an already loaded immutable snapshot, so its read value is correctly zero.

Hard-zero results across the 10 required suites:

```text
Permission escalation: 0/10
Governance bypass: 0/10
Reality override: 0/10
Verification bypass: 0/10
Secret leak: 0/10
Cross-scope hard violation: 0/10
Candidate Disposition influence: 0/10
```

## Verification transcript

```text
cargo test -p fielora-contracts -p fielora-storage -p fielora-agent
  fielora-agent: 132 PASS
  office-writer probe: 8 PASS
  fielora-contracts: 6 PASS
  fielora-storage: 36 PASS

cargo test -p fielora-core --bin fielora-core
  69 PASS / 0 FAIL

cargo test -p fielora-core --bin fielora-core \
  idr_eval::tests::eval_metrics_are_bounded_and_hard_zero_reportable -- --nocapture
  1 PASS / 0 FAIL

cargo clippy -p fielora-contracts -p fielora-storage -p fielora-agent \
  -p fielora-core --all-targets -- -D warnings
  PASS

cargo clippy -p fielora-core --all-targets -- -D warnings
  PASS after final read-overhead evidence change
```

The repository's known `ts-rs` `deny_unknown_fields` parse notices and Windows linker
stdout notice remained non-failing warnings and did not change this result.

Final document/context validation is recorded by the closeout commit and consists of
`cargo fmt --all -- --check`, `pnpm verify:dev:docs`, `pnpm audit:context`, and
`git diff --check`.

## Boundaries and freeze decision

```text
LIVE_MODEL_REQUESTS: 0
SECOND_MODEL_OR_CLASSIFIER_CALL: 0
SCHEMA_OR_MIGRATION_CHANGE: 0
DEPENDENCY_CHANGE: 0
FIPC_OR_UI_CHANGE: 0
RESOLVED_VIEW_PERSISTENCE: 0
GENERIC_AGENT_WITHOUT_IDR: PASS
PROVIDER_NEUTRALITY: PASS (deterministic fixtures/contracts)
PRIVACY: PASS
HARD_ZERO_INVARIANTS: PASS
FULL_PREMERGE: NOT_RUN (targeted Rust/docs/context boundary only)
IDR_V2_FREEZE_GATE: PASS
IDR_V2_STATUS: FROZEN
```

Post-V2 and non-blocking: automatic activation, cloud sync, multi-user/profile,
multi-device merge, vector memory, dynamic registry/marketplace, IDR dashboard, and
enterprise identity.
