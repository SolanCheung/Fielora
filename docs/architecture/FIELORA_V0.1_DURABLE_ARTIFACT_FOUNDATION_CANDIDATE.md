# Fielora V0.1 Durable Artifact Foundation Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `DURABLE ARTIFACT CORE FIRST SLICE IMPLEMENTED / TARGETED VALIDATED`

**Scope:** Current Reality audit, domain boundary, identity, persistence,
revision, recovery, and the smallest implementation candidate for durable
Document and Presentation Artifacts.

This candidate does not modify Frozen architecture documents, the canonical
Agent architecture, the Rapid Desktop route, FIPC, or UI. Its authorized Core
First Slice is implemented as additive schema 8 and production Tool/domain
behavior. Schema 9 subsequently repaired Artifact type storage extensibility
without changing the typed domain. The legacy request-scoped `artifact.export`
remains supported beside the new durable mode.

## Decision summary

```text
Artifact
  = Fielora-owned durable structured work product
  = renderer-neutral semantic source + stable identity + immutable revisions

Exported DOCX / PPTX / future representation
  = a rendered snapshot of one Artifact revision
  != the Artifact source of truth
```

The proposed domain is owned by existing Fielora Core and persisted by the
existing StorageWorker. Agent access remains ordinary Tools behind the existing
PolicyEngine, Approval, ToolExecutor, durable ToolCall receipt, and Verification
boundary. There is no Artifact Agent, Artifact Runtime, second Library, second
permission engine, second receipt hierarchy, or second verification engine.

The smallest viable persistence is bounded, validated semantic JSON in the
existing DataRoot SQLite database. Binary assets, imports, UI, Diagram,
Spreadsheet, and bidirectional Office reconciliation are deferred.

The previously recorded migration 0002 baseline defect was repaired in the
separate preceding Storage changeset. Migration 0008 and the Durable Artifact
Core First Slice now pass targeted Storage, Agent, Core, contract, and renderer
evidence. Diagram, Spreadsheet, Assets, Import, Library integration, archive,
list/history UI, and all Artifact UI remain unimplemented.

## IMPLEMENTED_FIRST_SLICE_REALITY

| Item | Implemented reality |
|---|---|
| Identity / ownership | UUIDv7-backed `ArtifactId` and `ArtifactRevisionId`; every Artifact query is scoped by the current `ProfileId`; optional Project association reuses `FieldId` |
| Semantic contract | Closed `ArtifactContentV1::{Document, Presentation}` using the existing strict renderer-neutral DTOs and validators; schema version 1; canonical typed JSON <= 256 KiB |
| Persistence | `0008_durable_artifacts.sql` introduced `artifacts` plus immutable `artifact_revisions`; `0009_artifact_type_extensibility.sql` changed only the persisted type CHECK; current database schema 9; Profile schema remains 1 |
| Revision / conflict | Revision 1 on create; append-only N+1 update; opaque revision identity plus diagnostic sequence; required `expected_revision_id`; stale updates fail closed |
| Atomicity | Artifact envelope + R1 and revision insert + current-pointer CAS commit in one existing `StorageWorker` transaction; immutable update/delete triggers |
| Idempotency / recovery | Unique `created_by_tool_call_id` and `mutation_request_sha256`; exact replay returns the committed mutation; mismatched replay fails closed; existing resume reconciler reconstructs a compact ToolCall receipt after commit-before-receipt restart |
| Tools / policy | `artifact.create` and `artifact.update` are existing `WORKSPACE_WRITE`; `artifact.read` is `OBSERVE`; all use catalog -> Policy/Approval -> `ToolExecutor` -> durable ToolCall receipt |
| Read authority | Current or exact historical revision only; typed content is marked `UNTRUSTED_ARTIFACT_CONTENT`; no catalog/history is admitted by default |
| Verification | Existing `VerificationReceiptView` gained one nullable typed `ARTIFACT_REVISION` subject containing ArtifactId, RevisionId, and semantic digest; old evidence remains but does not validate a new current revision |
| Freshness | Existing workspace revision computation now includes durable Artifact revision mutation facts; no fake Project file path and no parallel freshness engine |
| Export | Existing `artifact.export` now has strict mutually exclusive inline and saved-revision modes; saved export pins one read revision and reuses the existing atomic/no-overwrite DOCX/PPTX renderer |
| Explicitly absent | UI, FIPC Artifact consumer, Diagram, Spreadsheet, Assets, Import, Library integration, archive/delete/list/history, sync journal, cloud sync, external-edit reconciliation |

## TARGETED_IMPLEMENTATION_EVIDENCE

The implemented Slice was validated on 2026-08-27 from the authorized clean
baseline `ca2f0ed575501c3b830bd4f490c035eb5c676eea`. The final changeset contains
no model request, credential read, network request, package installation, or
new dependency.

```text
DOCS_LANE: PASS
CORE_LANE: PASS
CROSS_LANE: PASS
CONTRACT_GENERATION_CHECK: PASS
RUST_WORKSPACE_UNIT: PASS
  fielora-agent: 96 passed
  fielora-storage: 19 passed
CORE_INTEGRATION: 12 passed
DESKTOP_TYPESCRIPT_UNIT: 176 passed
RUST_CLIPPY_DENY_WARNINGS: PASS
RELEASE_CORE_BUILD: PASS
```

The first Cross run exposed only stale schema-version assertions in existing
Core/Desktop tests (`7` after the additive migration made production schema
`8`). Those assertions and the Phase 04 generated test-evidence field were
aligned to schema 8; the complete Cross lane then passed. No Browser E2E,
packaged smoke, full premerge, or UI Gate was run because this Slice adds no UI
or FIPC consumer and its authorization explicitly requires targeted validation.

## ARTIFACT_TYPE_STORAGE_EXTENSIBILITY_REALITY

Schema 9 separates storage extensibility from semantic authority:

```text
SQLite artifact_type
  = non-empty ASCII uppercase token
  = [A-Z][A-Z0-9_]*
  = at most 32 bytes

Production Artifact domain
  = closed typed ArtifactType
  = DOCUMENT | PRESENTATION in the current product

Unknown canonical persisted type
  -> ARTIFACT_TYPE_UNSUPPORTED
  -> no panic, fallback, deletion, arbitrary JSON, or type coercion
```

Migration `0009_artifact_type_extensibility` is a forward table rebuild; it
does not modify migration 0008 or `artifact_revisions`. Targeted schema-8
fixtures prove preservation of Document/Presentation Artifact IDs, revision
IDs, current pointers, content schema version 1, canonical content, semantic
digests, Profile/Project/Conversation provenance, Verification subjects,
indexes, and foreign keys. An injected failure after table replacement proves
the transaction restores the original table/data and does not record schema 9.

This policy means a future typed Artifact variant does not require a
type-specific database migration. It does not allow the Model, Tool schema, or
stored token to invent semantic types.

The following `CURRENT_ARTIFACT_REALITY` tables are retained as the historical
pre-implementation audit that justified this Slice. The table above is the
current production reality.

## CURRENT_ARTIFACT_REALITY

### Artifact-specific reality

| Reality item | Status | Current module / file | Current semantic owner | Gap |
|---|---|---|---|---|
| Artifact semantic model | `PARTIAL` | Private `ArtifactDefinition`, `DocumentArtifact`, and `PresentationArtifact` in `crates/fielora-agent/src/artifact.rs` | Built-in Tool adapter | Renderer-neutral DTOs and bounds exist, but they are request-scoped and not a durable domain contract |
| Artifact stable identity | `PARTIAL` | `artifact.export` generates UUIDv7 `artifact_id` in its result/receipt | Tool execution correlation | The ID is not persisted, resolvable, or independent across later calls; it cannot identify a durable Artifact |
| Artifact type | `PARTIAL` | Private `ArtifactType::{Document, Presentation}` | Artifact export adapter | No durable extensible envelope or persisted type contract |
| Artifact ownership | `ABSENT` | No Artifact table/aggregate | None | No user/profile owner or lifecycle authority exists |
| Artifact persistence | `ABSENT` | Schema 7 has no Artifact table | `fielora-storage` owns durable application state | Semantic content survives only as ToolCall arguments/audit, not as an editable Artifact source |
| Artifact source content | `PARTIAL` | Validated in-memory semantic definition and its SHA-256 in `artifact.rs` | Artifact export adapter during one call | No post-call authoritative semantic source; ToolCall history must not be treated as an Artifact repository |
| Artifact revisions | `PARTIAL` | Export receipt reports fixed `artifact_revision=1` | Request-scoped export result | No immutable revision rows, parent relation, creator facts, or content-schema evolution |
| Artifact current revision | `ABSENT` | No current pointer | None | No durable current revision or atomic pointer update |
| Artifact read | `ABSENT` | `file.extract` reads exported files only | File Intelligence | Extracted normalized text is not `artifact.read` and cannot reconstruct the semantic source |
| Artifact update | `ABSENT` | No update Tool or repository | None | No durable mutation, new revision, or optimistic conflict guard |
| Artifact delete/archive | `ABSENT` | No lifecycle field or command | None | No archive/soft-delete semantics; hard delete would be unsafe to invent |
| Artifact assets | `PARTIAL` | Library content-addressed blobs and renderer attachment DTOs exist separately | Library and Desktop attachment ingress | No Artifact-owned `ArtifactAssetRef`, reference lifecycle, or authoring-safe asset admission |
| Artifact relationships | `PARTIAL` | `ResourceRef`, Field relations, and ToolCall-to-Run links exist | Core/Reality and Harness continuity | No Artifact endpoint/reference variant; no Artifact graph should be invented in the First Slice |
| Artifact -> Project | `PARTIAL` | `artifact.export` writes a contained Project-relative path; AgentRun has `field_id` | Project filesystem and Harness | No optional durable Artifact association; Project path is not Artifact identity |
| Artifact -> Conversation | `PARTIAL` | Export ToolCall is reachable through AgentRun -> Conversation | Harness audit lineage | Only indirect historical provenance exists; Conversation must not own Artifact lifetime |
| Artifact -> AgentRun | `PARTIAL` | Durable ToolCall/receipt belongs to AgentRun | Harness execution ledger | No durable revision provenance; AgentRun restart cannot recover semantic Artifact state |
| Artifact -> Library | `ABSENT` | No relationship or automatic copy | Library is separate retained-content domain | Artifact must not silently become a LibraryObject |
| Artifact -> Project file | `PARTIAL` | Export receipt records output path/digest; contained atomic create exists | Project filesystem Tool backend | No durable link from Artifact revision to a rendered snapshot; existing path remains ordinary file state |
| Artifact -> exported file | `PARTIAL` | `ARTIFACT_EXPORTED` receipt records type, revision, renderer, path, size, and digest | Existing ToolCall receipt | Correlation is request-scoped; there is no durable Artifact revision to bind |
| Artifact provenance | `PARTIAL` | AgentRun/ToolCall, execution source, semantic digest, renderer ID/version | Harness ledger + renderer adapter | No bounded per-revision creator/origin facts; full prompts/results must not be copied into Artifact metadata |
| Artifact verification state | `PARTIAL` | Structural reopen and semantic-presence self-check; existing VerificationReceipt is Run/ToolCall-scoped | Harness Verification & Evidence | Current contract has no explicit ArtifactId + revision subject; export success creates no Verification PASS |
| Artifact mutation conflict | `PARTIAL` | Project aggregates use `expected_revision`; file writes use SHA-256 guards; export rejects existing path | Core repositories and Tool backends | No Artifact current-revision compare-and-swap or stable conflict code |
| Artifact restart recovery | `ABSENT` | AgentRun/Events/ToolCalls recover; semantic Artifact does not | Harness continuity | Receipt recovery cannot recreate editable source; no idempotent committed-mutation lookup exists |
| Artifact renderer | `EXISTS / BOUNDED` | `crates/fielora-agent/src/artifact.rs`, exact `office_oxide 0.1.8` | Stateless built-in renderer adapter | DOCX/PPTX only; structural/semantic checks do not prove factual or visual quality |
| Artifact import | `ABSENT` | `file.extract` supports bounded DOCX/PPTX understanding | File Intelligence | No lossless Office-to-Artifact conversion, and none is promised |
| Artifact external-edit reconciliation | `ABSENT` | Project file hash and file-extract paths exist independently | Project filesystem | PowerPoint/Word edits do not create Artifact revisions; no bidirectional sync exists |
| Artifact UI | `ABSENT` | Workspace dock previews text/Markdown/images; Library has its own screen | Desktop presentation | No Artifact list/detail/editor/revision surface or Artifact FIPC contracts |

### Reusable surrounding reality

| Existing fact | Status | Reusable meaning | Limitation for Durable Artifact |
|---|---|---|---|
| Typed opaque IDs | `EXISTS` | `typed_id!` String wrappers plus backend-generated UUIDv7 | Add `ArtifactId`/`ArtifactRevisionId` through the same mechanism; do not introduce another UUID framework |
| SQLite durability | `EXISTS` | DataRoot `fielora.db`, foreign keys ON, WAL, synchronous FULL, 5-second busy timeout | Requires a new additive migration and schema validation updates |
| Transaction pattern | `EXISTS` | `StorageWorker` serializes access; repository mutations use `rusqlite::Transaction` and compare-and-swap rows | Artifact create/update must make revision insert and current-pointer change one transaction |
| Project file mutation | `EXISTS` | Canonical containment, sensitive-path denial, SHA guards, create/no-overwrite, same-directory atomic write | Applies to exports only, not Artifact persistence |
| Library | `EXISTS` | Profile-owned metadata, stable LibraryObjectId, SHA-256 LibraryRoot blob, tombstone lifecycle | Library is retained external/user-saved content, not an editable semantic source or revision store |
| Library blob lifecycle | `PARTIAL` | Content-addressed import, integrity check, root migration, optional portable inclusion | Tombstoning metadata does not implement Artifact asset references or reference-counted garbage collection |
| Profile/portable identity | `EXISTS` | Stable ProfileId; closed SQLite snapshot retains durable DB state | Portable manifest currently has no `ARTIFACTS` section and needs additive compatibility work if Artifacts ship |
| Project identity | `EXISTS` | Current Project identity is `FieldId`; local root is a device binding | Do not create a second ProjectId or make the root path an Artifact owner |
| Conversation/Agent durability | `EXISTS` | Conversation, AgentRun, immutable Event, ToolCall, Approval, Context Snapshot, Verification Receipt | These are provenance/execution, not Artifact storage ownership |
| Workspace verification freshness | `PARTIAL` | Successful verification Process receipts bind to a computed Project workspace revision | Current computation assumes file paths and cannot represent a SQLite Artifact revision mutation |
| FIPC/UI | `ABSENT` for Artifact | No current Artifact contract or surface exists | No UI or FIPC is necessary to prove Core durability |

## ARTIFACT_DEFINITION

```text
Artifact
  = Fielora-owned durable structured work product
  = stable ArtifactId + typed semantic content + immutable revisions
```

An Artifact is not:

- a Project file or path;
- a LibraryObject or Library blob;
- DOCX, PPTX, PDF, OOXML, or renderer state;
- a ToolCall receipt, Conversation message, AgentRun, or Verification result.

Examples of the domain are Document and Presentation now, and potentially
Diagram and Spreadsheet later. A rendered file is one representation of one
revision. It carries no authority back into the Artifact unless a future,
separately designed import/reconciliation operation explicitly creates a new
revision.

## DOMAIN_OWNERSHIP

Select ownership option C: a Durable Artifact is app/user-owned through the
existing stable Profile identity. Project and Conversation are associations,
not the only lifecycle owner.

```text
Profile (durable owner)
  -> Artifact
       -> optional current Project association
       -> optional creation Conversation provenance
       -> optional creating AgentRun provenance
       -> immutable ArtifactRevisions
```

Responsibility remains split across existing layers:

- Core Artifact domain owns semantic identity, validation, revision rules,
  conflicts, and lifecycle semantics.
- `fielora-storage` owns transactions and recovery in the existing database.
- Tools expose bounded Agent operations.
- renderer adapters create external representations.
- Harness owns Policy, Approval, ToolCall lifecycle, receipts, and Verification.
- Library remains a separate retained-content/blob domain.

There is no Artifact process, scheduler, agent loop, permission authority, or
verification authority.

## IDENTITY

Add `ArtifactId` and `ArtifactRevisionId` using the existing `typed_id!`
contract pattern. Values are backend-generated UUIDv7 strings, opaque to the
Model and user-facing UI.

`ArtifactId` is independent of:

- title, filename, Project path, or LibraryObjectId;
- revision sequence or revision ID;
- Conversation, AgentRun, ToolCall, renderer, or exported format.

`ArtifactRevisionId` identifies one immutable semantic revision. The monotonic
sequence is useful for display and optimistic concurrency but is not the
Artifact identity. The current export-only `artifact_id` remains an ephemeral
receipt correlation and must never be joined to the future durable table unless
the Artifact was explicitly persisted.

## TYPE_MODEL

The durable envelope is typed, versioned, and extensible without accepting
arbitrary unvalidated JSON:

```text
ArtifactEnvelope
  id
  artifact_type = DOCUMENT | PRESENTATION
  title?
  lifecycle
  current_revision_id
  associations / bounded provenance

ArtifactRevision
  id
  artifact_id
  sequence
  parent_revision_id?
  content_schema_version
  typed semantic content
  content_sha256
```

V0.1 admits only:

- `DOCUMENT` with the existing heading, paragraph, bullet-list, and table
  semantic blocks;
- `PRESENTATION` with the existing slide layout intent, title, regions,
  paragraph, and bullet-list semantics.

Future `DIAGRAM` and `SPREADSHEET` values require their own typed semantic
schema, validator, bounds, and migration/contract review. They are not generic
JSON escape hatches and are not part of the First Slice.

## SEMANTIC_SOURCE_OF_TRUTH

The authoritative content is a renderer-neutral, strictly validated semantic
payload. The current private DTOs are suitable input evidence because they do
not contain `office_oxide`, OOXML, ZIP, geometry package, or filesystem types.
They need promotion/extraction into a shared Artifact domain contract before
persistence; renderer planning remains private to the adapter.

```text
typed semantic payload
  -> validate and canonicalize
  -> content_schema_version + canonical bytes + SHA-256
  -> immutable ArtifactRevision
  -> renderer adapter
  -> DOCX / PPTX / future output
```

`content_schema_version`, renderer version, application version, Artifact
revision sequence, and database schema version are distinct. The content
digest covers Artifact type, content schema version, and canonical typed
semantic content. It excludes IDs, timestamps, paths, renderer version, and
ToolCall identity.

Canonicalization must be defined by the typed serializer and tested. Raw input
JSON property order or SQLite text bytes cannot be the digest authority.

## PERSISTENCE_DECISION

| Option | Transactionality / crash safety | Size / deduplication | Backup / portability | Boundary cost | Decision |
|---|---|---|---|---|---|
| A. Bounded semantic JSON in SQLite | Revision insert, current pointer, provenance, and journal can commit atomically under existing WAL/FULL settings | Good for current 256 KiB ceiling; no cross-file dedup, which is acceptable for the First Slice | Included in the existing closed DB snapshot and DataRoot migration | One additive migration; no second filesystem | **SELECT** |
| B. Metadata SQLite + semantic blob file | Requires a new cross-resource commit/recovery protocol | Better for very large content/dedup | Requires new portable allowlist and orphan cleanup | Unjustified while content is bounded | Reject for First Slice |
| C. Reuse Library blob store | SQLite metadata and LibraryRoot bytes cannot commit atomically | Content addressed, but Library lifecycle is retained-content/tombstone, not revisions | Optional Library blob export complicates Artifact durability | Conflates domains and ownership | Reject for semantic source |
| D. Dedicated ArtifactRoot | Requires another root, migration, backup, validation, and cleanup system | Flexible but premature | Would expand StorageManager and portable format | Creates a second structured store | Reject |

```text
ARTIFACT_SEMANTIC_STORAGE: DATA_ROOT_SQLITE
ARTIFACT_BINARY_ASSET_STORAGE: NOT_SELECTED
STORAGE_CHANGE_REQUIRED: YES
```

The First Slice stores bounded canonical semantic JSON directly in SQLite.
This matches current local-first repository/transaction conventions and keeps
the structured source inside the authoritative DataRoot. It does not use
Project files as a hidden database and does not create `.project/.fielora` or
a dedicated ArtifactRoot.

## LIBRARY_RELATIONSHIP

```text
ARTIFACT_IS_LIBRARY_ITEM: NO
ARTIFACT_EXPORT_CAN_BE_LIBRARY_ITEM: OPTIONAL
ARTIFACT_ASSETS_REUSE_LIBRARY_BLOBS: DEFER
```

Artifact and Library remain separate aggregates:

- Artifact is continuously editable, revisioned Fielora work.
- Library stores external or explicitly saved files/web content and immutable
  blob representations.
- Creating or exporting an Artifact does not automatically create a
  LibraryObject.
- A user may later explicitly save an exported DOCX/PPTX as an ordinary
  Library file; that LibraryObject is a representation, not the Artifact.
- Importing a Library DOCX/PPTX does not automatically create an Artifact.

Future assets should preferentially reuse the existing content-addressed blob
primitive rather than inventing a second blob root, but direct reuse is
deferred until reference ownership, portability, garbage collection, MIME
admission, and Library tombstone interaction are specified. A LibraryObject is
not required merely to hold an internal Artifact asset.

## PROJECT_RELATIONSHIP

An Artifact is not required to belong to a Project. It has an optional Project
association using the current Project compatibility identity (`FieldId`), not
a new Project ID and not a filesystem path.

For Agent Tools in a Project-scoped Run:

- create may produce an unassociated Artifact or associate only the current
  Run's Project;
- it may not select another Project by guessing an ID;
- update/read authorization is profile-scoped and context admission remains
  explicit;
- export to a Project path uses the current contained Project filesystem path,
  hash/no-overwrite, and atomic-write rules.

Archiving a Project does not delete its Artifacts. A missing/rebound Project
path does not invalidate Artifact identity or semantic revisions; it only
affects where a future export may be written.

## CONVERSATION_RELATIONSHIP

`created_from_conversation_id` is optional bounded provenance. Conversation is
not the owner. Archiving or later deleting a Conversation must not cascade to
Artifact or revision deletion. A Conversation may reference an Artifact, and
`artifact.read` may admit a selected revision into a later Run, but Conversation
message JSON is never the Artifact source of truth.

## REVISION_MODEL

Select immutable revisions.

```text
Artifact A
  current_revision_id = R2

R1: sequence 1, parent none, immutable content/digest
R2: sequence 2, parent R1, immutable content/digest
```

Create validates semantic input, persists Artifact plus revision 1, and sets
the current pointer in one transaction. Update validates the expected current
revision, writes one new immutable row, and advances the pointer in one
transaction. Old rows never change.

A revision means only that semantic content was durably mutated. It does not
mean Verification PASS, user acceptance, Approval, export success, business
correctness, or semantic authority.

New revision R2 never inherits Verification evidence from R1. Evidence remains
valid only for the exact revision subject to which it was bound. This is the
Artifact form of the existing stale-verification invalidation invariant.

## CONFLICT_MODEL

`artifact.update` requires `expected_revision_id`. An optional
`expected_content_sha256` may strengthen client-side TOCTOU detection, but the
revision ID is the mandatory compare-and-swap authority.

```text
read current R3
Agent A update expected R3 -> commit R4
Agent B update expected R3 -> ARTIFACT_REVISION_CONFLICT
```

The update transaction:

1. loads the active Artifact and current revision;
2. compares the expected revision;
3. validates and canonicalizes the complete proposed next semantic content;
4. inserts the new revision with parent=current;
5. updates the Artifact pointer only where current still equals expected;
6. appends any existing sync-journal fact in the same transaction;
7. commits, or rolls back everything.

There is no last-write-wins fallback. V0.1 should use complete next-revision
replacement rather than inventing a structured patch language before a real
editor flow requires one.

## ASSET_MODEL

Assets are not implemented in the First Slice. The semantic schema reserves a
future typed `ArtifactAssetRef`; it must never embed unbounded base64 or treat
an external URL as fetch authority.

A future admitted reference needs at least a content digest, media type, byte
length, and type-specific facts such as image dimensions. Candidate backends:

- content-addressed Fielora blob: preferred direction after lifecycle review;
- Project file snapshot: explicit Project identity/path plus expected digest,
  never a live unguarded path;
- Artifact revision reference: explicit ArtifactId + revision ID, without
  copying a large embedded Artifact;
- external URI: source metadata only until an independently authorized NETWORK
  Tool admits and materializes bytes.

Future `ArtifactRef` can support Document/Presentation composition. No Artifact
graph or recursive render semantics are part of V0.1.

## TOOL_MODEL

Durable Artifact operations are ordinary Tools:

| Tool | Effect | Candidate semantics |
|---|---|---|
| `artifact.create` | `WORKSPACE_WRITE` (closest current mutation class) | Validate/canonicalize, persist stable Artifact plus revision 1; no forced export |
| `artifact.read` | `OBSERVE` | Return identity/type/title/revision/digest and bounded semantic content only when explicitly requested |
| `artifact.update` | `WORKSPACE_WRITE` | Require expected revision, commit one immutable next revision or fail conflict |
| `artifact.export` | existing `WORKSPACE_WRITE` | Preserve legacy inline request; add a mutually exclusive saved-Artifact input that resolves one explicit revision and calls the existing renderer |

The current effect taxonomy and freshness code use `WORKSPACE_WRITE` as both a
permission risk and a Project-filesystem mutation signal. Artifact database
mutation is not a Project path mutation. First implementation should retain the
existing enum for authorization but extend the existing Harness mutation
subject/freshness handling so Artifact revisions are not sent through an empty
file-path fingerprint. Do not add a Permission enum in this Candidate.

`artifact.read` is lazy. Catalog/context initially exposes only the Tool
definition and any explicitly selected Artifact metadata. It must not inject
all Artifacts or revision history into every Context. A read response is
bounded to the current Tool observation limit and pages semantic units when the
full 256 KiB payload would exceed it.

All Artifact content admitted to a Model is data, not instruction authority.

## POLICY_BOUNDARY

```text
artifact.create / read / update / export
  -> existing Tool definition/catalog/selection
  -> existing PolicyEngine and permission preset
  -> existing Approval routing
  -> existing ToolExecutor
  -> Artifact repository or renderer adapter
  -> existing durable ToolCall receipt
  -> existing Verification & Evidence boundary
```

Artifact metadata, content, renderer output, Library metadata, Skills, or
external files cannot self-grant permission. Full Control does not disable
semantic bounds, profile scope, conflict checks, containment, no-overwrite,
digest checks, receipts, or verification freshness.

## RECEIPT_BOUNDARY

Continue using `agent_tool_calls.receipt_json`. Do not create an ArtifactReceipt
table or class hierarchy.

Mutation receipts may contain only compact non-secret facts:

- operation kind;
- durable `artifact_id`;
- old/new revision ID and sequence where applicable;
- content schema version and content digest;
- Artifact type;
- bounded execution source/provenance already authored by Core.

Read receipts contain identity/revision/digest and byte/unit counts, not the
full semantic content. Export receipts additionally retain renderer ID/version,
selected revision, output Project-relative path, bytes, output digest, and
structural self-check facts.

The legacy inline export receipt needs an additive scope discriminator before
durable IDs ship, for example `artifact_persistence=REQUEST_SCOPED`; saved
Artifact exports report `DURABLE` and an explicit revision ID. Existing receipts
are historical facts and are not rewritten.

## VERIFICATION_BOUNDARY

Reuse the existing VerificationReceipt and Harness evaluator. Do not add an
Artifact verification engine or `artifact.verified` boolean.

Current reality is insufficient to bind evidence unambiguously: the receipt
has Run/ToolCall/check/outcome/summary plus `artifact_sha256`, while current
freshness is a Project file fingerprint stored on a Process receipt. It has no
explicit durable ArtifactId + ArtifactRevisionId subject. `artifact_sha256`
currently may represent command stdout and cannot be silently redefined.

Minimum additive delta:

```text
VerificationReceipt
  existing fields
  verification_subject_kind? = ARTIFACT_REVISION
  verification_subject_id? = ArtifactId
  verification_subject_revision_id? = ArtifactRevisionId
  verification_subject_sha256? = semantic content digest
```

Existing rows remain valid with no subject. Artifact evidence is fresh only if
all subject facts match the selected immutable revision. Creating R5 does not
delete or mutate R4 evidence, but R4 evidence cannot verify R5.

Structural reopen/semantic-presence evidence proves only rendering/package
facts. It does not prove factual correctness, visual quality, user acceptance,
or Goal completion. Export success alone still creates no Verification PASS.

## RENDERER_BOUNDARY

Renderer adapters remain stateless and format-specific:

```text
Artifact revision semantic model
  -> DOCX renderer 0.1 / PPTX renderer 0.2
  -> bounded bytes
  -> structural self-check
  -> contained atomic external file
```

The Artifact domain does not know `office_oxide` types, ZIP parts, OOXML, slide
geometry implementation, fonts, or package paths. Renderer version is export
provenance, not semantic schema version. Renderer failure leaves the persisted
Artifact and revision intact; it cannot roll back an earlier create/update.

## EXPORT_MODEL

Create and export are independent:

```text
artifact.create -> durable Artifact revision 1
artifact.export -> render an already-selected immutable revision to a Project file
```

The current inline `artifact.export { type, content, output_path }` remains
supported. A future additive mutually exclusive form is:

```text
artifact.export { artifact_id, revision_id?, output_path }
```

Omitted `revision_id` selects the current revision once, before rendering; the
receipt records the exact selected revision so a concurrent later update does
not change export meaning. The two input forms cannot be mixed. The first saved
form continues to support only DOCX for Document and PPTX for Presentation;
future PDF/HTML formats need a separate renderer decision.

Export writes only through current Project path admission and atomic file
mutation. It does not automatically add Library metadata or an `artifact_exports`
table. ToolCall receipt history is sufficient for the First Slice export fact.

## IMPORT_BOUNDARY

```text
IMPORT: DEFERRED
```

`file.extract` remains normalized read/extract. DOCX/PPTX import cannot promise
lossless recovery of Fielora semantic blocks, layout intent, revision history,
or assets. No Office file automatically becomes an Artifact.

## EXTERNAL_EDIT_BOUNDARY

An exported file is a snapshot. Editing it in Word or PowerPoint changes the
ordinary Project/Library/external file only:

```text
external file mutation != Artifact mutation != new Artifact revision
```

There is no watcher, reverse synchronization, or conflict merge. Any future
re-import/reconciliation is a separately authorized architecture and must
create an explicit new revision rather than silently rewrite history.

## RECOVERY_MODEL

Durability is provided by the existing SQLite/StorageWorker boundary, not by
AgentRun memory:

- Core restart reloads stable Artifact identity, current pointer, and immutable
  revisions from DataRoot;
- a transaction failure leaves neither a partial revision nor a moved pointer;
- committed Artifact state survives AgentRun failure, cancellation, archive,
  or restart;
- export failure does not corrupt Artifact state;
- archive/soft delete is the preferred future lifecycle; hard delete is not in
  the First Slice.

There is one required recovery delta. A Tool mutation can commit to SQLite and
crash before its ToolCall receipt is persisted. The First Slice must bind each
Artifact mutation to the already-created ToolCallId as an internal idempotency/
reconciliation key. On recovery, the existing Tool reconciler can look up that
binding and reconstruct the compact applied fact; the same ToolCall must not
create a second Artifact or revision. This is an extension of existing Tool
reconciliation, not a new revision runtime. The private binding is not Model
input or Artifact ownership.

## SCHEMA_CHANGE_IMPACT

```text
CURRENT_SCHEMA_VERSION: 9
IMPLEMENTED_MIGRATIONS: 0008_durable_artifacts + 0009_artifact_type_extensibility
PROFILE_SCHEMA_VERSION: 1 (UNCHANGED)
STORAGE_CHANGE: IMPLEMENTED / TARGETED VALIDATED
```

Candidate tables, adjusted to current SQLite/typed-ID conventions:

```text
artifacts
  id                         TEXT PK                    -- ArtifactId / UUIDv7
  profile_id                 TEXT NOT NULL FK profiles  -- durable owner
  artifact_type              TEXT NOT NULL              -- bounded canonical token
  title                      TEXT?
  current_revision_id        TEXT NOT NULL               -- deferred composite FK
  project_field_id           TEXT? FK fields SET NULL
  created_from_conversation_id TEXT? FK conversations SET NULL
  created_by_agent_run_id    TEXT? FK agent_runs SET NULL
  updated_by_device          TEXT NOT NULL FK devices RESTRICT
  created_at                 INTEGER NOT NULL
  updated_at                 INTEGER NOT NULL

artifact_revisions
  id                         TEXT PK                    -- ArtifactRevisionId
  artifact_id                TEXT NOT NULL FK artifacts RESTRICT
  sequence                   INTEGER NOT NULL >= 1
  parent_revision_id         TEXT? FK artifact_revisions RESTRICT
  mutation_kind              TEXT NOT NULL              -- CREATE | UPDATE
  content_schema_version     INTEGER NOT NULL = 1
  content_json               TEXT NOT NULL, valid/bounded JSON
  semantic_sha256            TEXT NOT NULL, lowercase 64-hex
  mutation_request_sha256    TEXT NOT NULL, lowercase 64-hex
  created_from_conversation_id TEXT? FK conversations SET NULL
  created_by_agent_run_id    TEXT? FK agent_runs SET NULL
  created_by_tool_call_id    TEXT NOT NULL UNIQUE FK agent_tool_calls RESTRICT
  created_at                 INTEGER NOT NULL
```

Required indexes/invariants:

- `UNIQUE(artifact_id, sequence)`;
- one durable unique mutation/idempotency binding on
  `created_by_tool_call_id`;
- profile/updated ordering;
- optional Project association/updated ordering;
- revision lookup by Artifact/sequence;
- current pointer references a revision of the same Artifact;
- parent is null only for sequence 1; otherwise it is the immediately preceding
  revision of the same Artifact;
- type/content schema pair is admitted by the typed domain validator.

Migration 0008 established the tables and deferred composite foreign key from
`(current_revision_id, artifact_id)` to the same Artifact's revision. Targeted
migration and transaction-failure tests prove no committed Artifact can be left
without its selected revision. Migration 0009 preserves that relation and all
existing indexes while replacing only the closed type enumeration with a
1..32-byte `[A-Z][A-Z0-9_]*` token constraint. The Rust `ArtifactType` and
`ArtifactContentV1` remain closed and authoritative.

The same migration may add nullable Artifact subject columns to the existing
`agent_verification_receipts`; it must not create another evidence table. There
is no `artifact_exports` table in the Candidate.

Artifact create/update does not append `sync_change_journal` in this Slice.
Journal participation is deferred until Artifact sync semantics are explicitly
designed; this avoids implying cloud/sync behavior that does not exist.

Because Artifact rows live in SQLite, DataRoot migration and closed portable
snapshots naturally include them. The portable manifest allowlist/reporting
already retain the Artifact rows without a Profile serialized-payload change.
Library blobs remain separate because the First Slice has no Artifact assets.

## STORAGE_BASELINE_INTERACTION

```text
PRECEDING_STORAGE_REPAIR: PASS
MIGRATION_0002_ROLLBACK_REGRESSION: PASS
FRESH_DATABASE_TO_SCHEMA_9: PASS
SCHEMA_7_TO_SCHEMA_8_TO_SCHEMA_9: PASS
SCHEMA_8_TO_SCHEMA_9_DATA_PRESERVATION: PASS
MIGRATION_0008_FAILURE_ROLLBACK: PASS
MIGRATION_0009_FAILURE_ROLLBACK: PASS
UNKNOWN_CANONICAL_TYPE_FAIL_CLOSED: PASS
```

The baseline repair remains in its separate preceding commit. This Slice does
not modify migrations 0001-0007.

## SECURITY_BLOCKERS

No current renderer security failure required a new runtime. The previously
identified First Slice blockers were resolved within existing boundaries:

1. Storage migration baseline and migration 0008 evidence are green.
2. Artifact mutation must have ToolCall-bound idempotency/reconciliation so a
   commit-before-receipt crash cannot duplicate state.
3. Verification needs an additive explicit Artifact revision subject; digest
   naming must not reuse current `artifact_sha256` ambiguously.
4. Harness mutation freshness must recognize Artifact revision subjects instead
   of treating SQLite mutation as an empty Project-file fingerprint.
5. Reads/updates must enforce current profile scope, explicit context admission,
   bounded payloads, and `UNTRUSTED_ARTIFACT_CONTENT` instruction authority.
6. Artifact semantic JSON rejects unknown fields, unsupported types,
   NUL/unbounded content, and renderer-specific state before persistence.

None authorizes a new Permission, Verification, Receipt, Agent, or filesystem.

## CHANGE_IMPACT

| Area | Impact | Reason |
|---|---|---|
| This Candidate document | `LOW` | Non-frozen factual alignment for the authorized implementation |
| Artifact semantic envelope | `MEDIUM` | Promotes current private DTO semantics into a durable typed contract |
| Artifact persistence | `HIGH` | New profile-owned aggregate in authoritative DataRoot |
| Immutable revision model | `HIGH` | Permanent identity/history/conflict/recovery semantics |
| DB migration 0008 | `HIGH` | New tables, FKs, indexes, schema validation, portable/profile compatibility |
| Artifact create/update Tools | `HIGH` | Durable side effects, idempotency, recovery, Policy, receipts, and freshness |
| Verification subject delta | `HIGH` | Additive existing-receipt binding and stale-evidence evaluation |
| Renderer integration | `MEDIUM` | Reuses validated semantic models and current stateless adapters |
| Library relationship | `LOW` in First Slice | Explicit separation; no Library write or blob asset integration |
| Artifact UI | `HIGH / DEFERRED` | No editor/list/detail/revision surface in the First Slice |
| Diagram | `DEFERRED` | No schema/renderer/Tool/UI |
| Spreadsheet | `DEFERRED` | No schema/renderer/Tool/UI |
| Import/external reconciliation | `DEFERRED` | No lossless round-trip claim |

## FIRST_SLICE_RECOMMENDATION

| Option | Assessment | Decision |
|---|---|---|
| A. Durable envelope + Document only | Smallest type scope, but leaves the shared envelope and existing Presentation path insufficiently exercised | Not selected |
| B. Durable envelope + Document + Presentation | Reuses both real semantic models/renderers and proves type-neutral identity/revision/storage without UI | **SELECTED / IMPLEMENTED / TARGETED VALIDATED** |
| C. Full CRUD + UI | Mixes architecture, FIPC, editor, rendering, and product design | Reject |
| D. Durable schema + generic fixture only | Proves storage but not the real semantic or renderer boundaries | Reject |

Implemented Core First Slice after the separate Storage repair:

```text
DURABLE ARTIFACT CORE
  + Profile-owned ArtifactId
  + Document and Presentation existing semantic models
  + bounded SQLite semantic JSON
  + immutable revisions and current pointer
  + artifact.create / artifact.read / artifact.update
  + expected_revision_id conflict protection
  + ToolCall-bound idempotency/recovery
  + saved-revision path into existing artifact.export
  + existing Policy / Approval / ToolExecutor / receipt / Verification
  + 0 UI / 0 FIPC consumer
  + 0 assets / 0 Library auto-save
  + 0 Diagram / 0 Spreadsheet
  + 0 import / 0 external reconciliation
```

First-slice candidate bounds reuse current production facts:

| Bound | Candidate value |
|---|---:|
| Canonical serialized semantic payload | 256 KiB |
| Total semantic text | 128 KiB UTF-8 |
| One text item | 16 KiB UTF-8 |
| Document blocks | 256 |
| Lists / total list items | 64 / 1,024 |
| Tables / rows / columns / cells | 16 / 64 / 16 / 4,096 |
| Presentation slides | 32 |
| Regions per slide / blocks per region | 3 / 16 |
| Text per slide | 16 KiB |
| Assets | 0 |
| Model-facing read observation | one typed revision only; hard 320 KiB serialized observation ceiling |
| Title metadata | candidate 512 Unicode scalar values |

These values remain Candidate, not Frozen. Validation rejects excess rather
than truncating persisted semantic content.

Archive is the preferred lifecycle direction, but no archive/delete Tool is
required to prove the First Slice. Hard delete is explicitly absent.

## TARGETED_TEST_PLAN

### Persistence and identity

- create Document and Presentation, restart Core/StorageWorker, read identical
  ArtifactId/current revision/content schema/digest;
- prove title/path/export filename/renderer changes do not change ArtifactId;
- prove profile ownership and optional current-Project association;
- prove Conversation/AgentRun archive/restart does not delete the Artifact;
- prove portable closed snapshot includes and restores Artifact rows/identity.

### Revision and conflict

- create -> revision 1 with no parent;
- update expected R1 -> immutable R2 with parent R1 and current pointer R2;
- read R1 unchanged after R2;
- stale R1 concurrent update -> `ARTIFACT_REVISION_CONFLICT`, no partial row;
- injected failure between insert/pointer/journal -> complete rollback;
- unsupported content schema and invalid parent/current invariants fail closed.

### Bounds and semantics

- valid existing Document and Presentation fixtures round-trip through storage;
- each current renderer bound is accepted at limit and rejected over limit;
- invalid typed payload, unknown field, NUL, malformed JSON, type/schema
  mismatch, oversized revision, table/slide overflow reject before mutation;
- canonical digest is stable across JSON property order and independent of IDs,
  timestamps, Project relation, and renderer version;
- `artifact.read` returns one bounded selected revision without silently
  truncating content or admitting revision history; semantic paging remains
  deferred.

### Tool, Policy, receipt, and recovery

- create/update reach existing catalog -> PolicyEngine -> Approval ->
  ToolExecutor -> durable ToolCall -> existing receipt path;
- denied/unapproved mutation performs zero Artifact writes;
- OBSERVE read does not mutate or grant authority;
- receipt contains IDs/revisions/digests but no full content, prompt, secret,
  credential, or large Tool result;
- crash after Artifact commit but before final ToolCall receipt reconciles by
  ToolCallId and does not duplicate Artifact/revision;
- same operation with different content fails closed;
- restart recovery never blindly replays an unresolved durable mutation.

### Export and files

- persisted Document -> existing DOCX renderer and persisted Presentation ->
  existing PPTX renderer;
- exact revision selection is recorded even if current revision later changes;
- legacy inline `artifact.export` remains unchanged and passing;
- export failure/cancel/invalid path/existing target leaves Artifact revision
  unchanged and no partial final file;
- contained path, sensitive-path denial, no-overwrite, output digest, structural
  reopen, semantic-presence, and `file.extract` regression remain green;
- exported file edits do not mutate Artifact or create a revision;
- no LibraryObject is created implicitly.

### Verification

- structural export success creates no semantic Verification PASS;
- evidence explicitly bound to R1 is fresh for R1 only;
- creation of R2 does not delete R1 evidence but makes it inapplicable to R2;
- Project workspace verification and Artifact revision verification coexist in
  the same existing engine without cross-validating each other;
- visual quality and factual correctness remain unverified unless a matching
  separate check exists.

### Migration and regression

- preceding separate Storage baseline repair Gate remains green: legacy 0002
  incompatible-data rollback, fresh/upgrade schema, checksum, and portable snapshot;
- migration 0008 fresh database, schema-7 upgrade, rollback on incompatible
  data, current-pointer/FK/index/check validation, and schema version;
- Project/Conversation/AgentRun/Events/ToolCalls/Approvals/Context/Verification;
- Library metadata/blob/tombstone/root migration/portable modes;
- existing file tools, `file.extract`, one-shot Artifact export, Web, MCP,
  Skills, Provider-neutral Tool routing, and bounded subagent tests;
- targeted Clippy/release/contracts/docs/diff checks appropriate to the future
  implementation Change Impact; no UI Gate until a UI is authorized.

## OPEN_QUESTIONS

1. **Resolved for First Slice:** the existing `VerificationReceiptView` has one
   nullable typed `VerificationSubject::ArtifactRevision`; migration 0008 uses
   nullable subject columns in the existing receipt table. No evidence engine or
   receipt hierarchy was added.
2. **Terminology debt retained:** `AgentToolEffect::WORKSPACE_WRITE` currently
   covers both Project-file and durable Fielora work-product mutation. The First
   Slice adds no effect/permission enum; a later generic name requires separate
   compatibility review.
3. **Resolved and extended:** database schema is 9; Profile schema remains 1
   because Artifacts are SQLite state, not a new Profile serialized payload.
   SQLite admits bounded future type tokens while the application domain stays
   closed typed and rejects unknown tokens with `ARTIFACT_TYPE_UNSUPPORTED`.
4. **Resolved for First Slice:** sync journal participation is deferred until
   Artifact sync semantics are authorized. No sync claim or network behavior is
   implied by local persistence.
5. When assets are authorized, can the LibraryRoot content-addressed blob code
   be promoted into a shared Fielora blob primitive without making every asset
   a LibraryObject, and what reference-count/tombstone/portable rules apply?
6. **Resolved for First Slice:** saved-revision export extends `artifact.export`
   with strict `oneOf` inline-vs-saved modes. Legacy inline requests remain
   valid; the saved mode pins the selected revision before rendering.
7. Should semantically identical `artifact.update` return the current revision
   as idempotent no-op or reject `ARTIFACT_NO_CHANGE`? It must never append
   meaningless revisions silently.
8. What user-visible title normalization is appropriate before a UI exists?
   The Candidate proposes a bounded optional title and no filename coupling.
9. When archive is implemented, may archived Artifacts be read/exported but not
   updated, and what explicit restore semantics are required? Hard delete and
   retention remain deferred.

## NEXT_DECISION

`A. READY_FOR_DIAGRAM_ARTIFACT`
