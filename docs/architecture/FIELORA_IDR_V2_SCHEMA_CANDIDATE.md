# Fielora IDR V2 Schema Candidate

## 1. Status

```text
DOCUMENT: FIELORA_IDR_V2_SCHEMA_CANDIDATE.md
STATUS: DRAFT / CANDIDATE / NOT FROZEN
ARCHITECTURE_PLACEMENT: Harness.IDR
SCHEMA DESIGN: CANDIDATE ONLY
MIGRATION: NOT AUTHORIZED / NOT CREATED
IMPLEMENTATION: NOT AUTHORIZED
RUNTIME: NOT IMPLEMENTED
RESOLVER: NOT IMPLEMENTED
CONTEXT / FIPC / UI / EVAL: OUT OF SCOPE
DATE: 2026-08-28
```

This document maps the accepted IDR V2 semantic Contract to a minimum local
SQLite persistence candidate. Names and shapes below are physical-design
candidates, not frozen SQL, Rust, serialization, repository, or migration
contracts.

---

## 2. Scope

This Candidate answers:

> What is the minimum local persistence shape that keeps IDR V2 typed,
> queryable, auditable, erasable, and revision-safe without creating a second
> Reality, Memory, Profile, or Runtime?

In scope:

```text
table-set decisions
common HumanModelItem envelope
closed kind-specific payload persistence
scope/provenance/Reality reference relations
lifecycle and supersession auditability
aggregate revision and optimistic concurrency
erasure/tombstone semantics
minimum query indexes
migration and transaction candidates
storage constraint/error mapping
future schema tests
```

Out of scope:

```text
IDR Runtime or Resolver
Model-assisted extraction or automatic learning
ContextCompiler / AgentCoordinator integration
FIPC / UI / A-B Eval
Memory Runtime
Vector DB / embedding / FTS
multi-user / Tenant / Principal / HumanProfileId
actual migration or source code
```

---

## 3. Source Contracts

The only IDR semantic inputs are:

```text
FIELORA_IDR_V2_DESIGN_CANDIDATE.md
FIELORA_IDR_V2_CONTRACT_CANDIDATE.md
```

The Schema preserves these accepted invariants:

```text
HumanModelKind:
FACT | PREFERENCE | OBSERVATION | DISPOSITION | LONG_TERM_GOAL

EvidenceBasis:
EXPLICIT | OBSERVED | INFERRED

InferenceConfidence:
LOW | MEDIUM | HIGH

Lifecycle:
CANDIDATE | ACTIVE | WEAKENED | CONFLICTED | SUPERSEDED | REVOKED

HumanProfileId:
REMOVED

semantic subject:
one LOCAL_PRIMARY_HUMAN per V2 database instance
```

IDR remains `Harness.IDR`. Memory owns no IDR table; Reality remains external
authority referenced by stable Fielora-owned identifiers only.

---

## 4. Storage Principles

1. Semantic Contract validation precedes persistence.
2. Reuse the existing Fielora local SQLite authority and DataRoot.
3. Store no `HumanProfileId`, subject string, Tenant, or Principal on each row.
4. Keep normalized query fields relational and kind-specific meaning closed.
5. Limited JSON is allowed only as a versioned, closed, bounded typed payload.
6. Never use an untyped metadata bag or universal `payload_json = everything`.
7. Reference Conversation, Event, Project, Artifact, and Reality; do not copy
   their bodies or authority state.
8. Preserve lifecycle, confidence, and correction history until an authorized
   erasure deliberately removes it.
9. Never overwrite kind, semantic payload, Scope, or correction history in
   place.
10. Keep resolution algorithms/profile versions outside the database schema.
11. Treat timestamps as audit metadata; aggregate revision provides ordering
   and concurrency authority.
12. Fail closed on unknown kind, payload version, lifecycle, source type, or
   invalid cross-field combination.

---

## 5. Table Set Decision

### 5.1 Keep

| Candidate table | Decision | Minimum responsibility |
|---|---|---|
| `idr_human_model_state` | `KEEP` | Singleton aggregate revision and storage contract marker; not a profile table. |
| `idr_human_model_items` | `KEEP` | Current authoritative typed HumanModelItem rows. |
| `idr_item_history` | `KEEP` | Append-oriented lifecycle/confidence/mutation audit needed for revision reconstruction. |
| `idr_provenance_refs` | `KEEP` | Shared bounded provider-neutral source references. |
| `idr_item_provenance` | `KEEP` | Many-to-many item/support relation. |
| `idr_item_reality_refs` | `KEEP` | Typed reference-only Reality dependencies. |
| `idr_erasure_tombstones` | `KEEP` | Minimal non-semantic receipt after semantic item deletion. |

`idr_human_model_state` is required because an empty model must still have
revision `0`, and compare-and-increment must be atomic without deriving a
revision from item rows.

`idr_item_history` is not a duplicate item snapshot table. It records bounded
state transitions and mutation facts; immutable semantic content remains on
the item row until erasure.

`idr_erasure_tombstones` keeps normal item rows strictly typed. It avoids a
weak union row where every semantic column becomes nullable merely to express
erasure.

`HumanModelItemId` is unique across both current items and tombstones and is
never reused. SQLite cannot express cross-table uniqueness directly, so the
future repository must check both identity sets inside the aggregate write
transaction before admitting a new item.

### 5.2 Remove from V2

| Candidate table | Decision | Reason |
|---|---|---|
| `idr_update_proposals` | `REMOVE` | Admitted pending work is already a CANDIDATE item; a second proposal lifecycle would duplicate state. |
| `idr_resolutions` | `REMOVE` | Resolution is deterministic and ephemeral by default. |
| `idr_direction_snapshots` | `REMOVE` | Model-facing projection belongs to an admitted Context Snapshot when used. |
| `idr_forget_requests` | `REMOVE` | Item history plus minimal erasure tombstones cover durable IDR effects without storing request content. |
| `idr_observations` | `REMOVE` | OBSERVATION is a HumanModelItem kind, not a parallel store. |
| `idr_run_contexts` | `REMOVE` | Existing `agent_context_snapshots` remains the run-context owner. |

### 5.3 Defer

```text
idr_dimension_registry
durable proposal/review queue
resolution cache/history
import batch tracking
retention/compaction jobs
```

No deferred capability justifies an empty V2 table.

---

## 6. Human Model Item Storage

`idr_human_model_items` carries the common current envelope. Candidate
semantic/storage groups are:

```text
identity
  item_id

semantic versioning
  contract_version
  payload_schema_version

closed semantics
  kind
  typed_payload
  dimension?
  normalized_value?

current state
  lifecycle
  evidence_basis
  inference_confidence?

flat scope
  scope_domain?
  scope_project_ref?
  scope_task_type?
  scope_interaction_kind?

lineage
  supersedes_item_id?

aggregate revision/audit
  created_human_model_revision
  updated_human_model_revision
  created_at
  updated_at
```

Common semantic columns are identity, contract/payload version, kind,
dimension/value where applicable, lifecycle, evidence basis, confidence,
Scope, and supersession. Timestamps, canonical byte representation, row layout,
and index order are storage metadata.

Reality dependencies and provenance are relations, not embedded lists.
`reality_dependency_state` is not stored on the item because staleness is
evaluated against current external Reality. A display summary is not required
for persistence and is deferred rather than copied as free prose.

The item table contains only non-erased items. Authorized erasure removes the
semantic row and creates a separate minimal tombstone.

---

## 7. Typed Payload Decision

### 7.1 Option review

| Option | Decision | Assessment |
|---|---|---|
| A — single arbitrary JSON payload | `REJECT` | Cannot preserve closed kind semantics or safe query/erasure review. |
| B — common envelope + typed JSON payload | `ADOPT FOR V2` | Minimum table count while retaining a closed schema/version per kind. |
| C — five subtype tables | `DEFER / NOT NEEDED` | Strong relational typing but excessive joins, migrations, and sparse subtype machinery for current bounded payloads. |

### 7.2 Option B invariants

The payload cell is not arbitrary JSON. Every write and read must validate:

```text
item kind
+ payload_schema_version
+ exactly one closed kind-specific root shape
+ allowed keys only
+ typed scalar/collection rules
+ per-field and serialized byte bounds
+ canonical serialization
```

Candidate payload families:

| Kind | Closed payload meaning |
|---|---|
| `FACT` | `FactValue`: subject key, typed assertion/value, optional bounded qualifier. |
| `PREFERENCE` | `PreferenceValue`: registered dimension/value relation and bounded trade-off semantics. |
| `OBSERVATION` | `ObservationValue`: admitted event/choice/correction/outcome classification, never raw event body. |
| `DISPOSITION` | `DispositionValue`: registered dimension and inferred normalized tendency. |
| `LONG_TERM_GOAL` | `LongTermGoalValue`: goal key and bounded desired durable outcome. |

SQLite enforces valid JSON, object root, non-empty payload, and accepted maximum
serialized size. The future repository performs closed per-kind validation and
canonical re-open on read. The Candidate default maximum is `16 KiB UTF-8` per
typed payload; the exact bound must be accepted before migration freeze.

Unknown keys, unknown payload versions, nested metadata bags, raw Model output,
and arbitrary extensions fail closed.

---

## 8. Dimension Representation

Exact dimension vocabulary remains deferred by the Contract. Storage therefore
uses:

```text
dimension: optional registered canonical token
normalized_value: optional registered/canonical bounded value
payload_schema_version: closed interpretation version
```

`PREFERENCE` and `DISPOSITION` require both dimension and normalized value.
`OBSERVATION` may name a dimension only when the admitted observation is
classified for that dimension. Fact and Goal use their typed subject/goal keys
and do not fabricate a style dimension.

Candidate dimension tokens use a bounded namespace form such as
`fielora.communication.style`; values use a kind/dimension-specific validator.
Pattern acceptance alone is insufficient: the contract/payload profile must
register the namespace and value shape.

There is no arbitrary key/value metadata bag and no fixed columns for coding,
risk, communication, or future dimensions. The registry remains a versioned
application/Contract resource until a real need proves a database table.

---

## 9. Scope Storage

### 9.1 Decision

Adopt fixed nullable columns:

```text
scope_domain
scope_project_ref
scope_task_type
scope_interaction_kind

all NULL = GLOBAL
```

This is simpler, indexable, and inspectable. Scope JSON and a selector relation
table are rejected for V2 because the Contract has exactly four optional axes.

Every populated token/reference is bounded and validated. An all-null Scope is
the only Global representation; no separate `GLOBAL` string or priority value
is stored.

### 9.2 Project reference

The current repository's Fielora-owned Project compatibility identity is
`fields.id`. `scope_project_ref` stores that stable opaque Project reference;
IDR creates no `idr_project` table and copies no title, root path, metadata, or
lifecycle.

A direct SQLite foreign key to `fields(id)` is deliberately not proposed:

- cascade would silently delete Human Model audit history;
- set-null would incorrectly broaden Project Scope to Global;
- restrict would let personalization block Project deletion;
- a missing Project is a meaningful `STALE_REALITY_REF` condition.

Admission validates the reference against Fielora Reality. Resolution receives
current Reality status and excludes a missing/stale Project. This is deliberate
reference integrity, not fabricated database referential integrity.

### 9.3 Precedence ownership

No specificity rank or priority is stored. Matching and tie-breaking belong to
`resolution_profile_version` and deterministic Runtime rules, not Schema.

---

## 10. Provenance Storage

### 10.1 Shared reference row

`idr_provenance_refs` is retained as a shared normalized row:

```text
provenance_ref_id
contract_version
source_type
source_ref_kind
source_ref_id
observed_at
bounded_support?
source_digest?
admission_relation?
source_status_at_admission
created_at
```

Source types follow the Contract exactly:

```text
EXPLICIT_USER_STATEMENT
EXPLICIT_USER_SETTING
USER_ACTION
USER_CORRECTION
AGENT_OUTCOME
USER_APPROVED_IMPORT
SYSTEM_INFERENCE
```

`CONVERSATION_REF` is not a source type; Conversation/Message is a tagged
`source_ref_kind`. Provider-specific names such as Qwen/GPT/Claude never enter
the source-type vocabulary.

Candidate defaults bound support to `2 KiB UTF-8`; a digest is optional,
lowercase SHA-256 only, and forbidden when derived from secret bytes.

### 10.2 Many-to-many relation

`idr_item_provenance` uses item and provenance reference as its composite
identity and records the revision at which support was admitted. It supports:

```text
one item ← multiple provenance refs
one provenance ref → multiple HumanModelItems
```

Rows are reused only when the exact admitted ProvenanceRef identity matches.
Storage must not deduplicate by fuzzy text, Model prose, or support-body hash.

At least one provenance relation is a commit invariant. SQLite cannot express
"at least one child row at transaction end" with a simple foreign key, so the
future repository must validate this before commit and verify it before the
aggregate revision advances. Complex triggers are not proposed.

### 10.3 Erasure interaction

Erasing one item deletes its join rows. Unreferenced provenance rows are then
deleted; shared rows remain only for still-valid items. A request to erase
shared support cannot report full removal while another admitted item still
requires it; the operation must either remove/redact all affected IDR items in
the authorized scope or return a typed incomplete result.

---

## 11. Reality Dependency Storage

`idr_item_reality_refs` stores reference-only dependencies:

```text
item_id
reality_kind
reality_ref
dependency_relation
expected_revision?
expected_fingerprint?
admitted_human_model_revision
created_at
```

Candidate dependency relations are closed:

```text
MUST_EXIST
REVISION_MATCH
FINGERPRINT_MATCH
```

Cross-field validation requires the corresponding expected value only for the
matching relation. Fingerprints are of non-secret authoritative Reality state,
never copied bodies or credential-derived bytes.

Reality references are polymorphic and intentionally have no fake foreign key.
The relation never stores current file content, Project metadata, Artifact
body, Goal state, Verification body, or a cached truth claim. Resolution uses
the current Fielora-owned Reality projection to classify stale, missing, or
conflicting dependencies.

---

## 12. Lifecycle Storage

The current row stores exactly one checked lifecycle token:

```text
CANDIDATE
ACTIVE
WEAKENED
CONFLICTED
SUPERSEDED
REVOKED
```

SQLite vocabulary constraints reject arbitrary strings. The full legal
transition matrix remains Contract/application logic because a large trigger
program would duplicate semantic ownership and be difficult to version.

A narrow terminal-state database guard is a migration candidate:

```text
SUPERSEDED or REVOKED
→ lifecycle cannot change on that row
```

All other transitions require expected aggregate revision, current lifecycle,
Contract transition validation, a history entry, and an atomic transaction.
Direct repository updates that bypass this path are forbidden.

`idr_item_history` records bounded transition facts:

```text
item_id
human_model_revision
mutation_kind
previous_lifecycle?
resulting_lifecycle
previous_confidence?
resulting_confidence?
reason_code
mutation_ref
created_at
```

It stores no payload snapshot or raw evidence. Privacy erasure may delete an
item's semantic history before inserting a minimal tombstone; therefore the
history table is append-oriented during ordinary operation, not legally
immutable against an authorized erasure transaction.

---

## 13. Supersession / Correction

Adopt one nullable `supersedes_item_id` on the replacement item.

```text
A ← B ← C
```

This expresses the Contract's one replacement supersedes one previous item
without a DAG or general relation table. A uniqueness constraint on non-null
`supersedes_item_id` prevents two direct replacements from silently forking the
same lineage.

No direct foreign key is proposed because an erased predecessor may survive
only as `idr_erasure_tombstones`. The transaction validator requires the target
to exist as an item or tombstone, rejects self-reference/cycles, and validates
the target state.

Correction is one aggregate mutation:

```text
validate expected revision N
insert admitted replacement at N+1
persist its provenance/Reality refs
transition old item to SUPERSEDED or REVOKED at N+1
append both history facts
advance aggregate revision to N+1
commit
```

Any failure rolls back both sides. The system must never expose replacement
Active while the old item remains Active.

---

## 14. Human Model Revision

V2 uses one global local aggregate revision, not independent per-item version
counters.

`idr_human_model_state` has exactly one row:

```text
singleton_key = 1
current_human_model_revision
storage_contract_version
updated_at
```

Initial revision is `0`. Every committed durable mutation advances it exactly
once, even when one transaction affects multiple items. Item rows store the
aggregate revision at creation and last update; history/relation rows store the
aggregate revision that admitted their fact.

This supports:

```text
read snapshot at revision N
attempt mutation against expected N
commit all effects as N+1
or fail without partial state
```

There is no separate per-item revision authority. Item created/updated revision
columns are positions in the aggregate sequence, not competing counters.

Snapshot reconstruction uses immutable item semantics plus history/relation
revision facts. Authorized erasure intentionally makes prior semantic snapshot
reconstruction unavailable for the erased item.

---

## 15. Concurrency

Local single-human semantics do not imply single-threaded access. Agent runs,
human correction, activation, import, and background proposal admission may
race.

The future repository must perform a compare-and-increment inside one SQLite
write transaction:

```text
update singleton revision from N to N+1 only if current = expected N
affected row count != 1
→ REVISION_CONFLICT
```

No stale mutation is silently rebased. The caller must read a fresh snapshot,
revalidate admission/conflict/scope, and issue a new explicit attempt.

SQLite write serialization is an implementation aid, not the semantic
concurrency contract. Expected revision remains mandatory.

---

## 16. Update Proposal Persistence Decision

Decision:

```text
HumanModelUpdateProposal persistence: EPHEMERAL
idr_update_proposals table: REMOVE
```

Model/inference output is validated in memory. If deterministic admission
accepts durable pending activation, it commits a typed HumanModelItem with
`lifecycle = CANDIDATE`. User review/activation addresses that item directly.

This avoids two overlapping states:

```text
durable proposal pending
+ durable item candidate
```

Rejected proposals and raw Model text are not retained by IDR. If an existing
AgentRun Event legitimately records that a proposal step occurred, that event
remains under AgentRun ownership and is only referenced by bounded provenance.

---

## 17. Observation Storage

OBSERVATION uses `idr_human_model_items`; no `idr_observations` table exists.

An Observation row is an admitted, bounded, structured human-specific
classification. It is not the raw Conversation message, Agent event, UI event,
Tool receipt, file, or webpage. Those remain with their existing owners and are
referenced through provenance.

Required combination:

```text
kind = OBSERVATION
evidence_basis = OBSERVED
inference_confidence = NULL
```

An Active Observation remains evidence only and cannot be queried as an Active
Preference/Direction source.

---

## 18. Disposition Candidate Storage

Inferred pending and activated Dispositions share one item row:

```text
kind = DISPOSITION
evidence_basis = INFERRED
inference_confidence = LOW | MEDIUM | HIGH
lifecycle = CANDIDATE before explicit activation
lifecycle = ACTIVE after explicit activation
```

There is no candidate table, active table, or automatic-learning store.
Activation changes lifecycle and appends history at a new aggregate revision;
item identity, kind, basis, payload, and Scope do not change.

---

## 19. Confidence Constraints

Schema and repository validation enforce:

```text
kind = DISPOSITION
→ inference_confidence is required and one of LOW / MEDIUM / HIGH

kind != DISPOSITION
→ inference_confidence is NULL
```

No `UNKNOWN`, `NOT_APPLICABLE`, float probability, provider score, or
model-specific confidence is stored.

Confidence update is a committed aggregate mutation with previous/resulting
values in `idr_item_history`. It cannot change EvidenceBasis or turn a
Disposition into a Preference/Fact.

---

## 20. Evidence Basis Compatibility

The V2 storage compatibility matrix is:

| HumanModelKind | Allowed EvidenceBasis | Confidence |
|---|---|---|
| `FACT` | `EXPLICIT` or `OBSERVED` | `NULL` |
| `PREFERENCE` | `EXPLICIT` only | `NULL` |
| `OBSERVATION` | `OBSERVED` only | `NULL` |
| `DISPOSITION` | `INFERRED` only | required ordinal value |
| `LONG_TERM_GOAL` | `EXPLICIT` only | `NULL` |

`FACT + OBSERVED` is permitted only for a deterministic independently
supported fact-eligible Fielora source accepted by the future source registry.
Model/Provider inference is never such a source.

This matrix is enforced both by cross-field database checks and closed
repository validation. Unknown future combinations require a Contract and
payload-version change; they cannot be introduced as arbitrary rows.

---

## 21. Forget / Erasure Storage Semantics

### 21.1 Disable use

`DISABLE_USE` atomically transitions the item to REVOKED, appends history, and
advances the aggregate revision. Typed payload, bounded provenance, Reality
references, and audit history remain inspectable. Resolution excludes it
immediately.

### 21.2 Erase if allowed

`ERASE_IF_ALLOWED` uses one transaction to:

1. validate request/expected revision and erasure authority;
2. ensure the item is excluded from use;
3. delete item-provenance and item-Reality relations;
4. delete semantic lifecycle/history rows for the item;
5. delete the typed item row and its payload/dimension/scope;
6. garbage-collect unreferenced bounded provenance rows;
7. insert a minimal tombstone;
8. advance aggregate revision once and commit.

The tombstone contains only:

```text
item_id
erased marker/mode
erased_at
erased_human_model_revision
contract_version
```

It contains no kind, dimension, normalized value, payload, scope, evidence,
confidence, provenance excerpt/digest, Reality ref, or free-form reason.

### 21.3 Reset profile

`RESET_PROFILE` means all current IDR items in this V2 database instance. It
does not introduce a profile table or HumanProfileId. One aggregate transaction
erases all erasable IDR semantic rows, writes minimal per-item tombstones, sets
the model to empty, and advances the revision once.

### 21.4 Authority and audit trade-off

IDR erasure intentionally sacrifices semantic audit reconstruction for erased
items. The minimal tombstone proves only that an opaque item ID was erased; it
does not retain the erased meaning.

No operation claims deletion of Conversation, AgentRun/Event, Reality, files,
Provider data, logs, backups, or sources owned by other retention authorities.
Partial/incomplete erasure must fail or report accurately; it must never claim
global legal/compliance guarantees.

---

## 22. Resolution Persistence Decision

Decision:

```text
Human Model: durable
DispositionResolutionInput/Result: ephemeral by default
IndividualizedDirection: ephemeral by default
IDRProjection: persisted only when admitted into an existing Context Snapshot
```

No `idr_resolutions` or `idr_direction_snapshots` table is proposed. Resolution
can be recomputed from the referenced Human Model revision, Work Scope/current
constraints, Reality projection, contract version, and resolution profile
version.

The current V2 defaults remain resolution-profile values:

```text
maximum 8 Direction items
maximum 3 support refs per RelevantDisposition
maximum 4 KiB serialized IDRProjection
```

They are not database columns or table cardinality constraints. Storage must
not create `direction_1` through `direction_8`, fixed slots, or per-limit schema
versions.

Debug logs must not become an accidental resolution history or leak Human
Model payloads.

---

## 23. Context Snapshot Relation

The repository already owns `agent_context_snapshots` with Run/step identity,
content digest, bounded manifest, and creation time. If future integration must
prove which IDR signals a Run received, it should extend the versioned Context
manifest/projection contract with:

```text
resolution_ref
source_human_model_revision
resolution_profile_version
IDR projection trust class
bounded admitted projection digest/content component
```

The existing Context Snapshot remains owner. No `idr_run_contexts` table,
ContextCompiler change, or snapshot migration is authorized here. Whether the
projection bytes or only a digest/reference are retained is deferred to the
Context integration review and retention policy.

---

## 24. Indexing

### 24.1 Required

| Query path | Candidate index |
|---|---|
| Item lookup | Primary key on `item_id`. |
| Active scope resolution | Composite starting with lifecycle, then Project/domain/task/interaction and dimension. |
| Candidate Disposition review | Partial index for `kind = DISPOSITION AND lifecycle = CANDIDATE`, ordered by updated time/item ID. |
| Reverse provenance lookup | `provenance_ref_id, item_id` on the join table; item-first direction is its composite identity. |
| Reverse Reality lookup | `reality_kind, reality_ref, item_id`; item-first relation identity supports item loading. |
| Supersession chain | Unique non-null `supersedes_item_id`. |
| Item revision history | Composite identity/index on `item_id, human_model_revision`. |

### 24.2 Optional after query evidence

```text
history by global human_model_revision
items ordered by updated_at for inspection UI
global-only Active dimension lookup
erasure tombstones by erased_at
```

### 24.3 Defer

Separate indexes on `kind`, `evidence_basis`, every Scope column, and
`updated_at` are deferred. The current query paths do not justify them in
addition to the composite/partial indexes. `EXPLAIN QUERY PLAN` evidence is
required before index freeze.

---

## 25. FTS / Vector Decision

```text
FTS: NO
VECTOR INDEX: NO
EMBEDDING: NO
SEMANTIC RETRIEVAL DB: NO
```

V2 resolution is based on closed kind, registered dimension/value, lifecycle,
scope, evidence, provenance, and Reality validity. It does not require fuzzy
semantic retrieval.

Any future vocabulary expansion or retrieval need requires a separate Change
Impact and Contract/Eval review; it cannot silently add transcript embeddings.

---

## 26. Sensitive / Forbidden Data

The following must never enter IDR SQLite columns, JSON payloads, provenance,
history, tombstones, or indexes:

```text
credentials
API keys or access/refresh tokens
Authorization headers
passwords, session secrets, private keys
raw secret bytes or secret-derived digests
full raw transcript duplication
full Model/Provider response
Provider hidden reasoning
unbounded Model output
full file contents
full webpage payloads
cookies or session/auth state
```

Allowed provenance is limited to bounded non-secret support, a Fielora-owned
tagged reference, admitted time/type/status, and an optional safe digest.

Sensitive admission happens before persistence. SQLite constraints can enforce
shape/bounds but cannot classify every secret; the future deterministic
admission boundary remains mandatory. On uncertainty, persist nothing.

---

## 27. SQLite Placement

IDR must use the existing Fielora local SQLite database under the current
DataRoot and existing storage worker/authority.

```text
new idr.db: NO
new memory.db: NO
new profile.db: NO
new storage owner: NO
```

The repository currently reports schema version `11` and tracks immutable
migration name/checksum/time in `schema_migrations`. A future IDR migration must
use that registry and transaction discipline.

The existing `profiles` table is a product/storage profile identity, not the
removed IDR `HumanProfileId`. IDR V2 rows do not repeat `profile_id`; a V2
database instance has exactly one IDR human subject. Multi-profile behavior
would require a later Contract and migration.

---

## 28. Migration Candidate

Candidate only; no migration file is created.

```text
current repository schema version: 11
candidate introducing version: 12
candidate logical name: IDR V2 Human Model storage
shape: additive tables/indexes/constraints + singleton revision row
initial human_model_revision: 0
initial HumanModelItem count: 0
```

Forward migration would atomically add the accepted table set, indexes,
constraints, and singleton aggregate state, then register version/name/checksum
through the existing migration system.

It must not scan Conversation, Event, Project, Library, Provider, or historical
data; infer preferences; create Dispositions; or seed any Human Model item.

Existing user upgrade yields an empty Human Model. Any future import/backfill
is a separate explicit user-approved operation with normal admission and
provenance.

Rollback expectations:

- failure before commit rolls back every table/index/state/registry change;
- successful production migration has no automatic destructive down migration;
- release rollback must use an explicitly compatible binary or verified backup;
- migration tests must prove the pre-version database remains byte/semantically
  intact after forced failure.

---

## 29. Initial State

```text
local IDR subject count: implicit singleton
human_model_revision: 0
HumanModelItems: 0
provenance refs: 0
Reality refs: 0
history events: 0
erasure tombstones: 0
```

No default language, minimal-delta preference, coding style, risk tolerance,
goal, observation, or inferred disposition is seeded.

Existing Conversation/Memory-like history remains untouched and unavailable to
IDR until a future user-approved import/admission path exists.

---

## 30. Versioning

Four version concepts remain distinct:

| Version | Owner and storage role |
|---|---|
| `schema_version` | Existing Fielora migration registry; physical layout compatibility. |
| `contract_version` | Per item/provenance/tombstone semantic validation rules. |
| `payload_schema_version` | Per-kind closed typed payload interpretation. |
| `human_model_revision` | Singleton aggregate mutation order/concurrency token. |
| `resolution_profile_version` | Runtime matching/precedence/bounds; not an item/schema column. |

`resolution_profile_version` appears only in a resolution/context snapshot when
that future integration is authorized. It does not become a database schema
version.

Unknown contract/payload versions fail closed without mutation. A physical
migration cannot reinterpret an existing kind, basis, Scope, or payload without
an explicit Contract-version transition plan.

---

## 31. Transactions

The minimum durable mutation transaction is:

```text
begin write transaction
validate expected aggregate revision
validate item/payload/scope/admission/transition
insert or update current item
persist provenance relations
persist Reality dependency relations
apply supersession/correction if any
append bounded history facts
verify every non-erased item has provenance
compare-and-increment aggregate revision once
commit
```

Any failure rolls back all item, relation, history, tombstone, and revision
effects.

Forget/erasure and reset use the same aggregate transaction boundary. Shared
provenance garbage collection occurs before commit and cannot remove a row
still referenced by another item.

No Provider call, file read, Reality fetch, or user prompt occurs inside the
SQLite transaction.

---

## 32. Integrity Constraints

### 32.1 Database-enforced candidates

```text
PRIMARY KEY:
  item/provenance/tombstone identity

FOREIGN KEY:
  item history → current item
  item provenance → current item and provenance ref
  item Reality relation → current item

UNIQUE:
  singleton state key
  item/provenance relation pair
  item/Reality dependency identity
  non-null supersedes_item_id

NOT NULL:
  all non-conditional semantic envelope/state fields

CHECK:
  closed kind/lifecycle/evidence/confidence/source/relation vocabulary
  confidence nullability by kind
  EvidenceBasis compatibility by kind
  typed payload valid/object/bounded
  all token/ref/time/revision bounds
  created revision/time <= updated revision/time
  no self-supersession
```

Internal exact relations use real foreign keys. Polymorphic source refs,
Project refs, Reality refs, and supersession-to-possible-tombstone deliberately
do not fake a foreign key.

### 32.2 Repository/application invariants

```text
closed per-kind payload validation and canonical re-open
registered dimension/value validation
sensitive admission / no-secret gate
at least one provenance relation before commit
full legal lifecycle transition matrix
terminal state immutability
supersession target existence and cycle rejection
current Reality/Project reference admission
expected revision compare-and-increment
reference-aware erasure and provenance garbage collection
HumanModelItemId non-reuse across current rows and tombstones
```

DB constraints and repository validation are both required; neither is allowed
to self-grant semantic authority.

---

## 33. Storage Error Mapping

| Storage/constraint condition | Contract-facing result |
|---|---|
| Duplicate item ID | `INVALID_ITEM`; no mutation. |
| Invalid kind/payload pair or corrupt stored typed payload | `INVALID_KIND_PAYLOAD` / `INVALID_ITEM`; fail closed. |
| Invalid lifecycle token/transition or terminal reactivation | `INVALID_TRANSITION`. |
| Invalid kind/confidence or EvidenceBasis combination | `INVALID_ITEM`. |
| Stale singleton revision compare | `REVISION_CONFLICT`. |
| Missing required provenance relation | `INVALID_ITEM`. |
| Missing/cyclic superseded target | `INVALID_ITEM`. |
| Invalid/malformed Project scope reference | `INVALID_SCOPE`. |
| Unsupported contract/payload version | `UNSUPPORTED_CONTRACT_VERSION`. |
| Missing current Reality dependency at resolution | `STALE_REALITY_REF`. |
| Secret rejected before write | `SENSITIVE_DENIED`. |

Raw SQLite codes/messages never become Provider/model-facing canonical errors.

A physical I/O/transaction failure or incomplete erasure is not equivalent to
an invalid semantic item. It must roll back and return a provider-neutral outer
storage-operation failure without fabricating `COMMITTED` or successful
erasure. The exact existing Core error-envelope mapping must be reviewed before
implementation; if no suitable code exists, a Contract amendment is required.

---

## 34. Schema Test Matrix

Future migration/storage tests must cover at least:

| Case | Expected storage result |
|---|---|
| Insert explicit Preference | Typed row + provenance + revision 1 atomically. |
| Insert Observation | OBSERVED/NULL-confidence row; raw event not copied. |
| Insert inferred Disposition Candidate | INFERRED plus required ordinal confidence. |
| Confidence on non-Disposition | Constraint/validation rejection; no revision change. |
| Candidate to Active | Legal history row and one revision advance. |
| Active to Revoked | Legal terminal transition and resolution exclusion. |
| Revoked to Active | Rejected as `INVALID_TRANSITION`. |
| Supersede | Old/new/history/provenance commit at one aggregate revision. |
| Correction | New typed item; old semantic payload is not overwritten. |
| Forced correction failure | Neither replacement nor old-state transition persists. |
| Stale expected revision | `REVISION_CONFLICT`; no partial write. |
| Project Scope round trip | Exact stable ref preserved; no Project metadata copy. |
| Multiple provenance refs | All joins preserved and queryable. |
| Shared provenance ref | One source supports multiple items; reverse lookup works. |
| Missing provenance | Commit rejected before revision advance. |
| Reality dependency | Typed ref/revision or fingerprint round trips without body. |
| Disable use | Revoked item/history retained. |
| Erase if allowed | Semantic row/relations/history removed; minimal tombstone remains. |
| Shared provenance erasure | Still-referenced provenance retained; no false full-erasure report. |
| Reset profile | All IDR semantic items removed in one revision; no profile row added. |
| No transcript duplication | Conversation body absent from IDR tables. |
| Secret-like candidate | Admission rejects before any SQLite write. |
| Provider swap | Rows, IDs, revisions, and payloads unchanged. |
| Migration from schema 11 | Schema 12 candidate objects plus empty model/revision 0. |
| Forced migration failure | Pre-version data/registry remain intact; no partial IDR tables. |
| Reopen/idempotency | Migration checksum/version validated without duplicate state. |
| Unknown payload version | Read fails closed; no reinterpretation. |
| Transaction rollback | No orphan item, relation, history, tombstone, or revision gap. |

Tests must additionally scan IDR tables for forbidden secret/transcript/provider
reasoning content and prove foreign-key integrity for internal relations.

---

## 35. Deferred Questions

```text
exact registered dimension/value vocabulary
final typed payload field schemas and 16 KiB candidate bound
final provenance support byte bound and safe digest policy
exact Reality kind/relation registry
whether a narrow terminal-state trigger is retained at freeze
retention/compaction for weakened/conflicted/old observations
outer Core code for physical storage/erasure failure
Context Snapshot projection bytes versus digest/reference retention
user-approved historical import/batch semantics
multi-profile migration, only if real product behavior appears
query-plan evidence for optional indexes
encryption-at-rest policy within existing DataRoot authority
```

These are not permission for implementation defaults. Schema freeze must either
resolve them or explicitly prove they do not affect the first migration.

---

## 36. Implementation Preconditions

No migration, Rust type, storage repository, Resolver, Context integration,
FIPC, UI, or Eval implementation may begin until the user explicitly accepts:

```text
table set
Option B typed payload and closed validation boundary
dimension/value representation
fixed nullable Scope columns and Project ref behavior
shared provenance row + many-to-many relation
reference-only Reality dependency relation
lifecycle/history and terminal enforcement split
one-link supersession chain
singleton aggregate revision and concurrency protocol
ephemeral update proposal/resolution decisions
erasure/tombstone semantics
required/deferred index set
schema-12 empty-model migration strategy
transaction and integrity boundaries
storage error-envelope precondition
```

The next separately authorized task would be:

```text
IDR V2 STORAGE / MIGRATION IMPLEMENTATION REVIEW
```

This Candidate creates no migration file, table, index, trigger, Rust/Serde
type, repository code, FIPC, UI, Resolver, Context change, dependency, or
product behavior.
