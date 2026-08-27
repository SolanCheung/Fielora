# Fielora V0.1 Artifact Composition Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `NOT AUTHORIZED`

**Date:** 2026-08-27

**Audited baseline:** `phase/complete-agent-v0.1@70eba951952488e6d9c480fa7e25157887dde5e5`

**Database schema:** `9`

This document is a repository-reality alignment and a First Slice candidate.
It does not implement Artifact composition, change a Frozen/Baseline document,
add a Tool, add UI, add a dependency, or change persistence.

## CURRENT_COMPOSITION_REALITY

### Durable Artifact Core

| Concern | Reality | Current owner / evidence | Composition gap |
|---|---|---|---|
| Stable identity | `EXISTS` | `ArtifactId` and `ArtifactRevisionId` in `crates/fielora-contracts/src/lib.rs` | No typed Artifact-to-Artifact reference |
| Profile ownership | `EXISTS` | `ArtifactView.profile_id`; `StorageHandle` resolves Artifacts under its current `ProfileId` | Reference admission and recursive resolution do not exist |
| Optional Project association | `EXISTS` | `ArtifactView.project_field_id`; create may associate with the current run Project | Association is provenance, not reference or filesystem authority |
| Immutable revisions | `EXISTS` | schema-9 `artifact_revisions`; update/delete triggers reject revision mutation/deletion | No dependency graph is derived from revision content |
| Current pointer and historical read | `EXISTS` | `artifacts.current_revision_id`; `read_artifact(artifact_id, revision_id?)` | No composed read; exact child revisions are not resolved |
| Optimistic concurrency | `EXISTS` | `artifact.update` requires `expected_revision_id`; storage compares current pointer | No child lock is needed for immutable pinned children |
| Semantic canonicalization and digest | `EXISTS` | closed `ArtifactContentV1`; canonical JSON; SHA-256 integrity check on read | No reference identity/digest commitment exists |
| ToolCall idempotency | `EXISTS` | one mutation revision per ToolCall; mutation request digest and replay recovery | A future reference participates automatically only if it is in canonical parent content |
| Restart recovery | `EXISTS` | durable ToolCall plus `artifact_mutation_by_tool_call` reconciliation | No separate composition recovery is needed or present |
| Verification subject | `EXISTS` | `VerificationSubject::ArtifactRevision { artifact_id, revision_id, semantic_sha256 }` | No verification inheritance or dependency provenance |
| Mutation freshness | `EXISTS` | exact revision subject and current mutation tracking | Child head movement has no defined composition semantics today |
| Artifact delete/archive | `ABSENT` | Artifact revisions are physically immutable and have no delete/archive operation | Future deletion/GC must preserve referenced historical revisions |
| Artifact catalog/history listing | `ABSENT` | Current public Tool surface is create/read/update/export; storage reads by identity | First Slice must use bounded point reads, not assume a dependency index |

### Current typed content and renderers

| Type | Current semantic authority | Current renderer/export reality | Composition-relevant fact |
|---|---|---|---|
| `DOCUMENT` | title plus ordered `HEADING`, `PARAGRAPH`, `BULLET_LIST`, `TABLE` blocks | `DocxWriter`; `.docx`; structural package reopen plus expected-text check | Table supports at most 64 rows, 16 columns, 4,096 aggregate cells and 16 tables; this is a usable target for a transient Spreadsheet range |
| `PRESENTATION` | slides with `TITLE`, `TITLE_AND_BODY`, or `TWO_COLUMN`; paragraph/bullet blocks only | `PptxWriter`; `.pptx`; deterministic bounded text layout and structural reopen | Production semantic and renderer adapter have no image block or image call |
| `DIAGRAM` | bounded typed graph, groups, and layout intent | repository-owned static SVG renderer; exact saved revision to `.svg`; independent allowlist reopen | It produces controlled SVG, not a PNG/EMF asset accepted by an Office parent renderer |
| `SPREADSHEET` | stable sheets, one-based sparse cells, `STRING/DECIMAL/BOOLEAN` literals and closed intent | `XlsxWriter`; exact saved revision to `.xlsx`; independent literal reopen | Formula/calculation/date/merge/chart/import are absent; literal range materialization is unambiguous |

Additional renderer facts:

- the current Document production path calls `DocxWriter::add_table` with
  strings; the first row receives the writer's existing header treatment;
- the current Presentation production path calls `add_rich_text_box` only;
- the exact `office_oxide 0.1.8` dependency exposes PPTX image packaging for
  PNG/JPEG/GIF/TIFF/BMP/EMF/WMF, but does not expose SVG as an `ImageFormat`;
- the Fielora Presentation schema, image admission, relationship validation,
  and semantic reopen do not currently cover an embedded image;
- neither Document nor Presentation has a Fielora-owned asset reference;
- renderer output bytes are derived files. They are not Artifact semantic
  source of truth.

### Storage, Tool, Library, and Desktop reality

| Concern | Reality | Current fact |
|---|---|---|
| Generic revision persistence | `EXISTS` | schema 9 stores closed typed canonical JSON in `artifact_revisions.content_json`, bounded to 256 KiB; there are no type-specific Artifact tables |
| Exact saved export | `EXISTS` | existing `artifact.export` reads one current or explicit historical revision before renderer dispatch |
| Export receipt | `EXISTS` | existing ToolCall receipt records parent Artifact/revision/digest, renderer, format, output path/bytes/digest, and structural result |
| Composition receipt | `ABSENT / NOT NEEDED` | Composition facts can extend the existing bounded ToolCall receipt |
| Generic `ResourceRef` | `EXISTS / NOT SUITABLE` | current enum identifies Field/State/Reference/Relation/Capture/ProviderConfig; it has no revision or digest and should not be overloaded |
| Artifact reference | `ABSENT` | no `ArtifactRefV1`, expected type, child digest, or parent-specific embed intent |
| Composition resolver | `ABSENT` | no recursive exact-revision resolver or resolved render snapshot |
| Dependency graph / cycle check | `ABSENT` | no Artifact revision dependency edges are currently admitted or traversed |
| Library blob | `EXISTS / SEPARATE` | Library metadata plus content-addressed `LibraryRoot` blobs and tombstone lifecycle | 
| Artifact asset model | `ABSENT` | no `ArtifactAssetRef`, asset lifecycle, media package admission, or renderer asset bridge |
| Spreadsheet/Artifact UI | `ABSENT` | generated TypeScript DTOs exist, but there is no Artifact editor, grid, preview, embed UI, or Composition FIPC |

The Library blob store is not an Artifact dependency store. A LibraryObject has
Library lifecycle, metadata, optional blob identity, and product UI ownership.
An `ArtifactRefV1` identifies immutable semantic content and must not create a
Library item or resolve through a blob.

```text
CURRENT_ARTIFACT_TYPES: DOCUMENT + PRESENTATION + DIAGRAM + SPREADSHEET
CURRENT_ARTIFACT_COMPOSITION: ABSENT
CURRENT_ARTIFACT_REF: ABSENT
CURRENT_COMPOSITION_RESOLVER: ABSENT
CURRENT_SCHEMA: 9
CURRENT_TYPE_SPECIFIC_ARTIFACT_TABLES: 0
```

## COMPOSITION_DEFINITION

Artifact Composition means that one exact Artifact revision semantically
references one or more exact revisions of other Artifacts.

```text
Parent Artifact revision
  -> typed parent-specific embed intent
  -> ArtifactRefV1
  -> exact immutable child Artifact revision
```

It is not copying a file, pasting a PNG, embedding base64, following a current
pointer, storing duplicated child semantic JSON, or reading a child export as
source.

```text
REFERENCE != COPY
COMPOSITION != ASSET STORAGE
COMPOSITION != A NEW RUNTIME
```

Architecturally, composition remains inside the existing Artifact Tool path:

```text
Model
  -> Harness / existing artifact.export ToolCall
  -> PolicyEngine / Approval
  -> existing ToolExecutor boundary
  -> Artifact render preparation
       -> bounded CompositionResolver
       -> existing renderer adapter
  -> existing durable ToolCall receipt
  -> existing Verification / Evidence boundary
```

`CompositionResolver` is an Artifact-domain render-preparation component. It
is not an Agent, Harness Profile, Tool Provider, Runtime, permission engine,
receipt hierarchy, or verification engine.

## ARTIFACT_REF_MODEL

The minimum generic reference candidate is:

```text
ArtifactRefV1 {
  artifact_id: ArtifactId,
  revision_id: ArtifactRevisionId,
  expected_type: ArtifactType,
  semantic_sha256: LowerHexSha256
}
```

All four fields are durable and mandatory.

- `artifact_id + revision_id` selects one exact revision and prevents a
  revision ID from being accepted under the wrong Artifact identity;
- `expected_type` records the parent's typed dependency expectation and avoids
  duck-typing child JSON;
- `semantic_sha256` is an integrity commitment. Resolve must compare it with
  the stored exact revision digest and fail closed on mismatch;
- `profile_id` is deliberately absent. The current trusted Profile scope is
  supplied by the Artifact repository, never by model arguments;
- Project/Field identity, path, renderer output, `LATEST`, `CURRENT`,
  `FOLLOW_HEAD`, network URI, blob bytes, and child content are absent.

`ArtifactRefV1` owns only dependency identity. Display and selection semantics
remain in a parent-specific typed value. For the recommended First Slice:

```text
DocumentBlock::SpreadsheetRange {
  source: SpreadsheetRangeEmbedV1
}

SpreadsheetRangeEmbedV1 {
  artifact_ref: ArtifactRefV1,       // expected_type = SPREADSHEET
  sheet_id: SpreadsheetSheetId,
  start_row: u32,                    // inclusive, one-based
  start_column: u16,                 // inclusive, one-based
  end_row: u32,                      // inclusive, one-based
  end_column: u16                    // inclusive, one-based
}
```

There is no generic layout field in `ArtifactRefV1`. A future Diagram embed,
slide placement, chart intent, or asset sizing needs its own parent-specific
contract.

## PINNED_REVISION_SEMANTICS

First Slice reference policy is only `PINNED`.

```text
Document D/R7 -> Spreadsheet S/R2

Spreadsheet update -> S/R3

Document D/R7 still -> S/R2
```

A child update never mutates, invalidates, or makes the immutable parent stale.
To consume `S/R3`, a caller must construct and commit a new parent revision:

```text
artifact.update(D, expected_revision = D/R7)
  -> Document D/R8 -> Spreadsheet S/R3
```

Consequences:

- parent semantic digest includes all `ArtifactRefV1` fields, including the
  child digest, but does not include duplicated resolved child content;
- child current-pointer changes do not change an old parent digest, render,
  provenance, freshness, or Verification subject;
- no child current-pointer lock, multi-Artifact transaction, or distributed
  lock is required;
- refresh is a future explicit parent update, never a background rewrite;
- `LATEST`, `CURRENT`, `FOLLOW_HEAD`, and automatic refresh are rejected for
  the First Slice.

The current mutation request digest already includes the canonical parent
semantic digest. Once the reference is part of typed canonical content,
ToolCall idempotency therefore commits to the exact reference without a second
idempotency system.

## PROFILE_BOUNDARY

Every reference resolves through:

```text
current trusted ProfileId
  + ArtifactId
  + ArtifactRevisionId
```

The existing repository query joins the revision to an Artifact under the
current Profile. Missing identity and cross-Profile identity both return the
same `NOT_FOUND` class. Resolution must not reveal that an Artifact or revision
exists in another Profile.

The model cannot submit a Profile ID in an Artifact reference. A child type or
digest mismatch is visible only after the exact child has resolved inside the
current Profile.

## PROJECT_BOUNDARY

Artifact reference authority is Profile-scoped, not Project-scoped. Current
Artifact reads are already scoped by Profile and identity; they do not require
the Artifact's optional `project_field_id` to equal the active Project.

The Candidate therefore permits an exact same-Profile reference even when the
parent and child carry different or absent Project associations. This does not
grant either Artifact access to another Project filesystem:

```text
Artifact semantic reference != Project filesystem capability
```

The resolver reads `artifact_revisions.content_json` only. It cannot open a
child export path, Project file, Library blob, or arbitrary local path. Saved
export still writes only through the current contained Project Tool backend.

Whether the product should later expose cross-Project Artifact selection is an
open product question; it must not change the repository security boundary.

## DEPENDENCY_GRAPH

Graph nodes are exact Artifact revisions, not Artifact IDs:

```text
Node = (ArtifactId, ArtifactRevisionId)
Edge = parent exact revision -> referenced child exact revision
```

A direct dependency is one typed reference present in a revision's semantic
content. A transitive dependency is any exact revision reached by recursively
following direct references. Duplicate references to the same exact child may
have different presentation locations, but count once in the unique resolved
revision set and remain distinct in parent block order.

Artifact ID alone is not a graph node. For example:

```text
A/R1 -> B/R1
B/R2 -> A/R1
```

is not a cycle because `B/R1` and `B/R2` are different immutable nodes.

No relational dependency table is required for the First Slice. Bounded typed
content can be parsed and followed using exact point reads. A future catalog,
reverse-reference query, archive, hard-delete, or GC feature may justify a
separate derived index, but such an index would be a projection, not semantic
authority.

## CYCLE_MODEL

Artifact composition cycles fail closed as `ARTIFACT_COMPOSITION_CYCLE`.
Cycle detection uses an active traversal stack keyed by exact revision node; a
global visited set only deduplicates already resolved nodes. Reaching the same
active node is a cycle. Reaching a previously completed node is shared
dependency reuse.

Current immutable/generated-ID mechanics make a newly admitted cycle
unconstructable in the normal path: a new revision receives its ID only when
it is persisted, references must point to already existing revisions, and old
revisions cannot later gain an edge to the new node. Resolver cycle detection
is still mandatory as defense against storage corruption, future import/
restore changes, or later reference types.

A same-Artifact historical reference such as `A/R3 -> A/R1` is permitted if
the exact revision graph is acyclic. Rejecting all equal Artifact IDs would be
stricter than the pinned revision semantics require. A direct reference to the
new not-yet-created revision is impossible and invalid.

Depth exhaustion is not a substitute for cycle detection. Cycle and bound
errors remain distinct.

## BOUNDS

Candidate bounds are chosen from the current 256 KiB revision ceiling and
Document/Spreadsheet renderer limits:

| Bound | Candidate maximum | Enforcement meaning |
|---|---:|---|
| Direct references per parent revision | 16 | Count typed reference occurrences before persistence |
| Unique transitive child revisions | 32 | Count exact revision nodes, excluding the parent |
| Composition depth | 4 | Parent depth is 0; the first child is depth 1 |
| Total resolved child canonical JSON | 1 MiB | Sum each unique child revision once |
| One Spreadsheet range rows | 64 | Inclusive coordinates |
| One Spreadsheet range columns | 16 | Inclusive coordinates |
| One Spreadsheet range coordinate slots | 1,024 | Includes sparse missing positions materialized as empty cells |
| Materialized Document tables | 16 | Existing Document limit across inline and composed tables |
| Materialized Document table cells | 4,096 | Existing aggregate Document limit |
| Materialized Document blocks | 256 | Existing Document limit after replacement |
| Materialized Document text | 128 KiB | Existing Document aggregate text limit |
| Output bytes / render deadline | 16 MiB / 10 seconds | Existing DOCX/PPTX export guards |

The resolved materialized Document must pass the complete existing Document
validator after expansion. Passing composition-specific limits does not bypass
per-text, table shape, output, cancellation, path, or atomic-write guards.

Bounds are implementation contracts, not hints from the model. Limit failure
is deterministic `ARTIFACT_COMPOSITION_LIMIT_EXCEEDED`; it does not truncate,
drop a reference, or switch to a newer child.

## REFERENCE_ADMISSION

The Candidate selects mutation-time validation, followed by render-time
integrity revalidation.

```text
artifact.create / artifact.update
  -> parse and canonicalize typed parent content
  -> extract ArtifactRefV1 values
  -> exact same-Profile child reads
  -> validate Artifact identity + revision identity
  -> validate expected type + semantic digest
  -> validate parent-specific range
  -> validate direct/transitive bounds and exact-revision cycle model
  -> persist the immutable parent revision through existing storage
```

This prevents committing a parent that is already known to contain an invalid
reference. The current `DurableArtifactToolExecutor` owns both canonicalization
and a trusted `StorageHandle`, so it can invoke an Artifact-domain admission
component without adding a Tool or Runtime. The storage repository remains the
owner of Profile-scoped exact reads and the final parent transaction.

Admission error candidates:

| Condition | Fail-closed error |
|---|---|
| child or exact revision missing, including wrong Profile | `ARTIFACT_REFERENCE_NOT_FOUND` |
| child type differs from `expected_type` or parent embed requirement | `ARTIFACT_REFERENCE_TYPE_MISMATCH` |
| stored semantic digest differs from the durable reference | `ARTIFACT_REFERENCE_INTEGRITY_FAILED` |
| sheet/range invalid | `ARTIFACT_REFERENCE_RANGE_INVALID` |
| dependency cycle | `ARTIFACT_COMPOSITION_CYCLE` |
| depth/fanout/bytes/render expansion exceeded | `ARTIFACT_COMPOSITION_LIMIT_EXCEEDED` |

No parent/child transaction is needed. Child revisions are immutable and no
Artifact hard-delete exists. Parent persistence modifies only the parent. A
future delete/archive/GC feature must preserve this assumption or add its own
dependency-aware admission before deletion.

## COMPOSITION_RESOLVER

The minimum resolver is a pure, bounded Artifact-domain service over exact
revision reads:

```text
CompositionResolver.resolve(parent exact revision)
  -> traverse typed refs with stack + visited sets
  -> read exact same-Profile revisions
  -> recheck identity/type/digest/bounds
  -> freeze an in-memory ResolvedCompositionSnapshot
  -> materialize parent-specific transient renderer input
```

It may read only exact durable Artifact revisions. It must not:

- invoke a model, network, MCP, credential store, Browser, arbitrary file, or
  child export;
- mutate parent, child, current pointer, metadata, Project, or Library;
- grant permission, route Approval, mark Verification PASS, or complete a Run;
- persist resolved child content or become a long-lived Runtime.

The resolver should be reused by mutation admission and export validation, but
only export produces a materialized renderer view. Admission can validate the
graph without creating Office data.

## SNAPSHOT_SEMANTICS

One export first pins the selected parent revision, then resolves the complete
bounded exact dependency graph before rendering. The in-memory snapshot is a
map from exact revision node to:

- Artifact type;
- semantic digest;
- canonical typed content needed for this render;
- direct edge facts.

Rendering starts only after the graph is complete and valid. It never performs
a late current-revision read. Immutable pinned children make the snapshot
stable without locks; a child acquiring a newer current revision cannot alter
the snapshot.

The snapshot is request-scoped memory, not a database entity, Artifact, Tool,
Runtime, receipt type, or cache contract.

## CONTENT_AUTHORITY

Parent and child semantic content remain `UNTRUSTED_ARTIFACT_CONTENT`.
Composition does not turn child strings into instructions, facts, prompt
authority, or Verification authority.

For a Spreadsheet range, child literals become renderer data only:

| Child literal | Transient Document cell |
|---|---|
| `STRING` | exact string |
| canonical `DECIMAL` | exact canonical decimal token |
| `BOOLEAN` | stable uppercase `TRUE` or `FALSE` |
| sparse missing coordinate | empty string |

Formula and calculation authority remain absent. Spreadsheet format and cell
presentation intent are not copied into Document V1 because the current
Document Table has string cells only. The first materialized row receives the
existing DOCX writer's deterministic table-header treatment; no implicit
Spreadsheet row outside the selected range is added.

The existing Office writers XML-encode text. Composition must still run the
existing validators and structural reopen; child text never becomes raw OOXML,
HTML, SVG, code, or a relationship target.

## MODEL_READ_BOUNDARY

`artifact.read(parent)` continues to return the parent revision's typed
semantic content, including bounded reference metadata, as
`UNTRUSTED_ARTIFACT_CONTENT`. It does not recursively inline child content.

A model that needs child details must use the existing explicit:

```text
artifact.read(child_artifact_id, child_revision_id)
```

No `artifact.read_composed` or `artifact.resolve_composition` Tool is proposed.
This preserves progressive disclosure and prevents one parent read from
expanding up to the whole dependency graph in Context.

## EXPORT_RESOLUTION

The saved-revision branch of the existing `artifact.export` becomes:

```text
1. resolve current or requested exact parent revision once
2. validate parent semantic digest
3. resolve the complete pinned dependency snapshot
4. materialize bounded parent-specific renderer input
5. run the existing renderer
6. independently reopen and structurally validate final bytes
7. record the existing ToolCall receipt with bounded dependency facts
```

Any missing child, wrong type, digest mismatch, cycle, or bound failure aborts
before output write. There is no placeholder, omission, fallback to current,
or partial composition. Parent and children remain unchanged.

The recommended First Slice extends only saved Document export. Legacy inline
Document/PPTX export, standalone saved Document, Presentation, Diagram, and
Spreadsheet export remain behavior-compatible.

## RECEIPT_PROVENANCE

Do not add `CompositionReceipt`. Extend the existing export ToolCall receipt
with bounded facts:

```text
composition_dependency_count
composition_dependency_set_sha256
composition_dependencies[] {
  artifact_id,
  revision_id,
  artifact_type,
  semantic_sha256
}
```

Because the graph is capped at 32 unique child revisions, the complete sorted
dependency list fits within the existing 64 KiB Tool result/receipt guard. The
set digest is computed from a canonical ordering by Artifact ID then revision
ID and includes type and semantic digest. Parent block order remains semantic
content and is not reordered.

The receipt must not contain child semantic content, rendered table cells,
credentials, Profile IDs from model input, or a new verification claim.
Mutation receipts may record direct dependency count and set digest for audit,
but exact references already remain durably visible in parent semantic content.

## VERIFICATION_BOUNDARY

Existing exact-revision Verification semantics remain unchanged:

- child Verification PASS does not make the parent PASS;
- parent Verification PASS does not make any child PASS;
- successful composition resolution, DOCX render, or structural reopen does
  not prove factual or business correctness;
- a Verification Receipt remains bound to one exact Artifact revision;
- child head movement does not stale a parent that still pins the old child;
- parent revision update creates the normal new Verification subject and
  freshness boundary.

Dependency snapshot facts are provenance/evidence, not inherited semantic
authority. No cross-Artifact Verification engine is proposed.

## DOCUMENT_SPREADSHEET_OPTION

### Proposed First Slice

```text
Document exact revision
  -> SpreadsheetRangeEmbedV1
  -> exact pinned Spreadsheet revision
  -> stable sheet_id + inclusive range
  -> transient rectangular Vec<Vec<String>>
  -> existing DocumentBlock::Table renderer path
  -> existing DOCX structural reopen
```

Range admission requires:

- `expected_type = SPREADSHEET`;
- exact same-Profile child revision and digest match;
- existing stable `sheet_id`, not mutable display name;
- `start <= end` for both axes;
- coordinates within current Spreadsheet maxima;
- 64-row, 16-column, 1,024-slot per-range limit;
- sparse missing cells become empty cells;
- all composed and inline Document tables jointly pass existing Document
  tables/cells/text/block limits.

This path needs no XLSX roundtrip, Formula engine, image, SVG, asset store,
external relationship, dependency, schema migration, Tool, or UI. The
Spreadsheet semantic revision remains the only child content authority.

### Reality fixture

```text
Spreadsheet S/R1: quarterly sales literals
Document D/R1: title + paragraph + range ref to S/R1 + conclusion
export D/R1 -> DOCX contains S/R1 values

Spreadsheet update -> S/R2
export D/R1 -> still contains S/R1 values

Document update -> D/R2 references S/R2
export D/R2 -> contains S/R2 values
historical export D/R1 -> still contains S/R1 values
```

Independent reopen must prove the expected table dimensions and values,
preserved parent text, absence of S/R2-only values from D/R1, and absence of
unexpected values. Merely opening the DOCX is insufficient.

## PRESENTATION_DIAGRAM_OPTION

The dependency writer has a real PPTX `add_image` path and media relationship
packaging for admitted PNG/JPEG/GIF/TIFF/BMP/EMF/WMF bytes. That is not enough
to select this option now:

- Fielora `PresentationBlock` supports only paragraph and bullet list;
- the production Presentation adapter never calls `add_image`;
- Diagram output is controlled SVG, while the writer's `ImageFormat` has no
  SVG variant;
- there is no trusted SVG-to-raster/EMF conversion path;
- there is no Fielora image asset admission, dimensions contract, media
  package security validation, or semantic image reopen;
- embedding the child `.svg` export file would incorrectly make a Project file
  the source and introduce unnecessary renderer roundtrip.

`Presentation -> Diagram` remains a strong future slice after a separate
asset/conversion Change Impact. It must resolve exact Diagram semantic content,
render ephemeral SVG, convert or package it through an admitted deterministic
path, and keep the SVG out of parent durable content.

`Document -> Diagram` has the same missing SVG/image bridge. The dependency's
DOCX writer exposes an IR image method, but the Fielora Document semantic and
production adapter do not own a safe asset path.

## FIRST SLICE OPTION COMPARISON

| Option | Existing renderer support | New dependency | Asset requirement | Security surface | Semantic clarity | Product value / testability | Core reuse | Decision |
|---|---|---:|---:|---|---|---|---|---|
| A. Document -> Spreadsheet range | Direct existing string Table path | 0 | 0 | Same typed text/XML path | High; literal rectangular range | High; exact historical DOCX fixture | Maximum | **RECOMMEND** |
| B. Presentation -> Diagram | Writer can package non-SVG images; production adapter cannot consume Diagram SVG | 0 possible, but no safe converter exists | Yes | New image/conversion/package validation | High once asset contract exists | High, but not currently closed | Medium | Defer |
| C. Document -> Diagram | Dependency writer has IR image support; production adapter has none | 0 possible, but no safe converter exists | Yes | Same missing bridge as B | High once asset contract exists | Medium | Medium | Defer |
| D. Generic ArtifactRef only | No renderer reality | 0 | 0 | Low | Identity only; no product composition proof | Low; proves parsing rather than composed output | High | Reject as First Slice |

Implementing all options together is rejected.

## ASSET_BOUNDARY

`ArtifactRefV1` is a durable semantic dependency. A future
`ArtifactAssetRef` would identify bounded media bytes and require content type,
byte length, digest, dimensions, lifecycle, package admission, portability,
and cleanup semantics. They are not the same contract.

The recommended Document/Spreadsheet slice does not need an asset model. It
must not introduce base64, raw SVG, external URI fetch, temporary export-file
authority, or Library blob coupling.

## LIBRARY_BOUNDARY

Composition does not create, update, tombstone, open, reveal, migrate, or
export a LibraryObject. It does not use `blob_ref` to resolve an Artifact.

```text
Parent references child Artifact != save child to Library
```

If a future shared content-addressed blob primitive is extracted from Library
infrastructure, that requires separate lifecycle and portability review. It
must not make every Artifact dependency a Library item.

## SCHEMA_VERSION_DECISION

```text
DATABASE_SCHEMA_VERSION: REMAINS 9
NEW_MIGRATION: 0
ARTIFACT_CONTENT_SCHEMA_VERSION: REMAINS 1 FOR THE CANDIDATE FIRST SLICE
```

The proposed `SpreadsheetRange` is an additive tagged `DocumentBlock` variant.
Existing Document payloads are byte/semantic compatible and continue to
deserialize and render unchanged. This follows the repository's current V1
practice for additive typed Artifact variants while keeping unknown future
values fail closed.

This decision does not claim that an older Fielora binary can read a new block
kind it never knew. The repository has no current cross-version Artifact
reader dispatch beyond `content_schema_version == 1`; old binaries already
fail closed on unsupported typed content. If backward opening by older binaries
becomes a product guarantee, a V2 dispatch and the SQLite `= 1` constraint need
a separate migration/versioning design before implementation.

No generic top-level dependency list or relational dependency table is added.
The reference stays inside typed parent semantic content because block order
and display location are semantic.

## DEPENDENCY_IMPACT

```text
FIRST_SLICE_NEW_DEPENDENCIES: 0
NEW_RUNTIME: 0
NEW_TOOL_FAMILY: 0
NEW_PERMISSION_ENGINE: 0
NEW_RECEIPT_HIERARCHY: 0
NEW_VERIFICATION_ENGINE: 0
NEW_ASSET_SYSTEM: 0
NEW_UI_OR_FIPC: 0
```

Future implementation would add only repository-owned typed contracts,
Artifact-domain admission/resolution logic, and saved Document export
materialization. It would continue using current serde/serde_json/SHA-256,
SQLite, DOCX writer, Tool pipeline, and structural reopen dependencies.

## SCHEMA_MIGRATION_IMPACT

The current 256 KiB `artifact_revisions.content_json` is sufficient for bounded
references. Exact child revisions remain in their existing rows. No join table,
foreign key, reverse index, blob, or type-specific table is required.

```text
DB_SCHEMA_CHANGE_REQUIRED: NO
SCHEMA_REMAINS: 9
NEW_MIGRATION: 0
MIGRATION_0008_MODIFIED: NO
MIGRATION_0009_MODIFIED: NO
```

Future reverse-dependency queries, archive, hard-delete, and GC are not solved
by scanning during ordinary product listing. They require a later derived-index
or lifecycle decision, but do not block bounded forward resolution in the
First Slice.

## SECURITY_BLOCKERS

For the recommended Document/Spreadsheet slice, no architecture security
blocker was found if all admission, profile, digest, graph, range, materialized
Document, path, and output bounds above are enforced.

Mandatory zero-capability facts for resolution:

```text
MODEL_REQUESTS: 0
NETWORK_REQUESTS: 0
CREDENTIAL_READS: 0
MCP_ACTIVATIONS: 0
ARBITRARY_FILESYSTEM_READS: 0
CHILD_OR_PARENT_MUTATIONS_DURING_EXPORT: 0
```

Presentation/Diagram and Document/Diagram remain blocked as First Slice choices
by the absent SVG-to-admitted-image/asset security boundary. The existence of a
dependency writer image API is not production admission proof.

## CHANGE_IMPACT

`HIGH` for a future implementation, despite zero migration and dependency:

- it extends durable Document semantic content;
- create/update gains storage-aware exact-reference admission;
- export traverses a bounded cross-Artifact dependency graph;
- Profile non-disclosure, digest integrity, cycle/bounds, immutable historical
  rendering, receipt provenance, and Verification separation become security
  and durability invariants;
- an error could make historical parent export nondeterministic or expose a
  cross-Profile existence fact.

This Candidate itself is docs-only and changes none of those behaviors.

## FIRST_SLICE_RECOMMENDATION

```text
RECOMMENDED_FIRST_COMPOSITION_SLICE:
DOCUMENT -> PINNED SPREADSHEET RANGE -> EXISTING DOCX TABLE RENDERER
```

Recommended implementation boundary, not executed in this task:

1. add `ArtifactRefV1` and `SpreadsheetRangeEmbedV1` to shared typed contracts;
2. add one tagged `DocumentBlock::SpreadsheetRange` variant;
3. canonicalize the reference as part of parent content and digest;
4. validate exact same-Profile child revision, expected type, digest, range,
   graph, and bounds before parent commit;
5. extend only saved Document `artifact.export` to build one request-scoped
   resolved snapshot and transient `DocumentBlock::Table` values;
6. run the complete existing Document validator and DOCX writer/reopen path;
7. extend the existing ToolCall receipt with the bounded dependency snapshot;
8. retain all standalone and legacy Artifact paths unchanged.

No UI, generic composition Tool, refresh operation, current-reference policy,
asset system, Library integration, Formula engine, or Diagram composition is
part of that Slice.

## TARGETED_TEST_PLAN

### Contract and canonicalization

- exact `ArtifactRefV1` field admission and unknown-field rejection;
- expected type and lower-hex SHA-256 validation;
- equivalent JSON property order produces the same parent semantic digest;
- changing artifact ID, revision ID, expected type, digest, sheet, or range
  changes the parent digest;
- parent block order remains semantic and is not sorted;
- legacy Document payloads and generated TypeScript contracts remain valid.

### Reference admission and graph

- valid exact same-Profile pinned reference;
- missing Artifact and missing revision;
- cross-Profile identity is indistinguishable from missing;
- wrong Artifact identity/revision pair;
- wrong expected type and Spreadsheet-range-to-non-Spreadsheet rejection;
- semantic digest mismatch fails closed;
- direct reference, duplicate reference, shared transitive dependency;
- exact-revision cycle fixture fails even though current mutation path cannot
  normally construct one;
- depth, direct fanout, unique transitive count, and resolved-byte overflow;
- historical same-Artifact reference is accepted only when acyclic.

### Range and materialization

- stable `sheet_id` lookup independent of display name;
- missing sheet, zero/out-of-bounds/reversed range;
- 64x16/1,024-slot edge and overflow;
- sparse missing cells become empty strings;
- mixed STRING/canonical DECIMAL/BOOLEAN values;
- CJK, XML special characters, multiline strings, and formula-like strings
  remain literal data;
- per-range and aggregate table/block/cell/text bounds;
- no Spreadsheet formatting, formula, calculation, merge, chart, or hidden
  external content is executed or inferred.

### Artifact Core reuse

- parent create/update uses existing Policy/Approval/ToolCall path;
- expected parent revision conflict remains unchanged;
- same ToolCall replay returns the same parent revision;
- restart recovery finds the committed parent revision;
- child reference creation does not mutate child metadata/current pointer;
- child update does not mutate or stale old parent;
- explicit parent update creates one new revision;
- exact historical parent and child reads survive restart.

### Export reality

- D/R1 -> S/R1 exports exact S/R1 table values;
- S/R2 creation followed by D/R1 export still uses S/R1;
- D/R2 -> S/R2 exports S/R2;
- historical D/R1 and D/R2 exports remain exact and deterministic in semantic
  content and output facts;
- missing/type/digest/cycle/bounds failure writes no output;
- final DOCX reopen proves parent text, table rows/cells, expected values, and
  absence of newer/unexpected values;
- receipt contains complete bounded dependency list/count/set digest and no
  child semantic payload.

### Security and regression

- resolver performs zero model/network/credential/MCP/arbitrary-file actions;
- all child content remains `UNTRUSTED_ARTIFACT_CONTENT`;
- standalone Document export is unchanged;
- Presentation, Diagram, Spreadsheet, legacy inline export, saved exact export,
  Artifact read/update/CAS/idempotency/recovery/Verification/freshness pass;
- schema remains 9; migration registry and 0008/0009 remain unchanged;
- no UI/FIPC/Library/asset behavior appears.

## OPEN_QUESTIONS

1. Should product UI eventually permit selecting a same-Profile child that is
   associated with another Project, or expose only current-Project/non-Project
   Artifacts while preserving the same repository authority?
2. Before implementation, should the repository explicitly document that
   additive V1 tagged variants are not forward-readable by older binaries, or
   establish a broader Artifact content-version dispatch policy?
3. Should mutation receipts include the complete direct reference list, or is
   the durable parent content plus direct count/set digest sufficient while
   export receipts carry the complete resolved graph?
4. When Artifact archive/delete/GC is designed, should a derived reverse-edge
   index be introduced, and how will it be rebuilt and validated from semantic
   revision authority?
5. Does a future Document table model need explicit header-row presentation,
   rather than inheriting the current DOCX writer's first-row treatment?
6. What admitted deterministic image representation should bridge Diagram SVG
   to DOCX/PPTX after an asset Change Impact: validated raster, EMF, native SVG
   support, or another renderer-owned form?
7. A future bounded composed-read option may be useful, but what explicit
   Context budget and dependency projection would justify a new read mode?

## NEXT_DECISION

`A. READY_FOR_ARTIFACT_COMPOSITION_FIRST_SLICE`

