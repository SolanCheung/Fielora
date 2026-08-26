# Fielora V0.1 Artifact Runtime Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `FIRST ONE-SHOT ARTIFACT EXPORT SLICE: IMPLEMENTED / VALIDATED`

**Presentation quality:** `RENDERER QUALITY FOUNDATION: IMPLEMENTED / TARGETED VALIDATED; HUMAN VISUAL GATE PENDING`

**Scope:** Artifact baseline alignment and the smallest backend-only first-slice
candidate for `Document` and `Presentation`.

The implementation recorded here does not modify the Frozen Core Contracts,
the canonical Agent architecture, the Rapid Desktop route, schema 7, or UI.

## Decision summary

Fielora should treat an Artifact as a **typed semantic work object**, not as a
format-specific Agent and not as an exported Office file:

```text
Model
  -> Harness context / orchestration / Policy / execution / verification
  -> existing Tool path
  -> Artifact validation + canonicalization service
  -> format renderer adapter
  -> bounded derived deliverable in the Project
```

The Artifact service is a pure domain/service boundary behind Tools. It owns no
model loop, AgentRun, permission, approval, durable receipt, or verification
authority. It is not a fourth top-level runtime.

The implemented first slice uses one request-scoped `artifact.export` Tool. It
accepts one bounded semantic definition, constructs and validates the Artifact
in memory, and creates one new DOCX or PPTX. It does not expose CRUD, persist a
structured Artifact aggregate, render a preview, or overwrite an existing file.

## 1. CURRENT_REALITY

The two existing flows are deliberately different:

```text
Existing Project file -> file.extract -> normalized understanding

Intent / admitted context -> semantic Artifact -> renderer -> exported file
```

`file.extract` is File Intelligence. It does not reconstruct an editable
Artifact, and normalized extraction cannot promise lossless Office round-trip.

| Reality item | Status | Current module / file | Existing semantic owner | Gap |
|---|---|---|---|---|
| Artifact semantic object | `PARTIAL` | Private Fielora-owned DTOs in `fielora-agent/src/artifact.rs`; no service/table | Tools-side Artifact adapter | Request-scoped Document/Presentation exists; durable source/edit lifecycle remains absent |
| Artifact persistence | `ABSENT` | Schema 7 has Project/Conversation/AgentRun/Library, but no Artifact aggregate | `fielora-storage` owns durable state | ToolCall arguments are durable audit history, not an editable Artifact repository |
| Artifact references | `PARTIAL` | UUIDv7 IDs and `ResourceRef` in `fielora-contracts`; ToolCall links to AgentRun | Core identity and Harness continuity | `ResourceRef` has no Artifact/Conversation-turn/file-digest/URL form |
| Project output ownership | `PARTIAL` | `ProjectView.field_id` plus `PROJECT_ROOT` DeviceBinding; `artifact.export` writes an explicit contained Project-relative path | Project/Field compatibility layer and filesystem Tool backend | Exported file ownership exists; Artifact registry/source ownership remains absent |
| Atomic file mutation | `EXISTS` | Rust `atomic_write`, `resolve_for_write`, sensitive-path denial; Artifact passes bounded binary bytes internally | Existing filesystem Tool/backend | Binary create-only export now reuses the primitive; overwrite/update remains deferred |
| Version/conflict primitive | `PARTIAL` | Aggregate `revision`/`expected_revision`; file SHA guards; create rejects existing paths | Core contracts and filesystem Tool | No Artifact revision; first slice can use revision 1 and create-only conflict control |
| DOCX writer | `EXISTS / BOUNDED` | Exact `office_oxide 0.1.8`; independent probe and production `artifact.export` adapter | Artifact renderer adapter | Structural/semantic roundtrip is validated; Office visual compatibility is not claimed |
| PPTX writer | `EXISTS / BOUNDED` | Exact `office_oxide 0.1.8`; fixed TITLE/TITLE_AND_BODY/TWO_COLUMN adapter with renderer-private typography, geometry, spacing, and bounded fit | Artifact renderer adapter | Structural/semantic roundtrip and deterministic layout bounds are validated; post-quality-slice human visual usability remains pending |
| Preview/render primitive | `PARTIAL` | Right workspace dock previews UTF-8/Markdown and bounded images; PDF is explicitly unsupported | Desktop workspace presentation | No DOCX/PPTX render, page/slide preview, or Artifact surface |
| Image/asset references | `PARTIAL` | `WorkspaceAttachmentView.content_ref` for bounded images; profile-scoped `LibraryObject.blob_ref/content_hash` | Desktop attachment runtime and Library | Attachment refs are UI/localStorage-oriented and Library refs are not Project Artifact assets; neither is a Tool-safe Artifact asset contract |
| Artifact Verification | `PARTIAL` | `artifact.export` structural reopen/semantic-presence self-check plus existing ToolCall receipts, workspace revision, and `file.extract` | Harness Verification & Evidence | Tool self-check exists; factual correctness and visual quality remain unimplemented verification |
| Tool/Policy/receipt path | `EXISTS` | `artifact.export` uses `coding_tool_catalog`, `PolicyEngine`, `ToolExecutor`, `ToolRuntime`, `AgentCoordinator`, schema 6 ToolCalls | Harness + Tools | No parallel execution/receipt path exists or is needed |
| Storage schema | `EXISTS` | `fielora-storage`, additive schema 7 | StorageWorker | No first-slice migration is justified |

The current image attachment DTO is not a general File/Asset reference: it
contains a data URL for model ingress, supports only bounded images, and stores
message image metadata in renderer localStorage. `LibraryObject` is durable
profile content, not an authoring source or Project output owner. The first
slice therefore does not force either abstraction into Artifact semantics.

## 2. ARCHITECTURE_BOUNDARY

```text
Fielora Agent = Model + Harness + Tools

Model
  -> Harness.Ingress & Context / Orchestration
  -> Harness.Governance: existing PolicyEngine + Approval
  -> Harness.Execution: existing AgentRun + ToolCall lifecycle
  -> existing ToolExecutor
  -> built-in artifact.export Tool backend
  -> Artifact service (validate, canonicalize, digest)
  -> DOCX/PPTX renderer adapter
  -> existing contained atomic Project file mutation
  -> existing ToolCall receipt
  -> Harness Verification & Evidence
```

The Artifact service may be a focused Rust module behind the current built-in
Tool backend. It does not require a process, queue, scheduler, database, model,
Agent profile, or new top-level crate in the first slice.

Forbidden interpretations:

- Artifact Agent, Document Agent, or Presentation Agent;
- Artifact Agent Runtime or a fourth `Model + Harness + Tools + Runtime` layer;
- DOCX/PPTX state as the domain source;
- a new permission enum, receipt hierarchy, or verification engine;
- a Skill-owned renderer. Skills may later teach authoring practice, but they
  cannot implement or authorize the renderer.

## 3. PERSISTENCE_DECISION

| Option | Assessment | Decision |
|---|---|---|
| A — Run/request-scoped in memory | Proves semantic validation and render/export without identity lifecycle or migration. Structured editing does not survive the call. | **SELECT, narrowed to one request-scoped export call** |
| B — Project-file-backed structured source | Could be Git-visible and resumable, but format, ownership, compatibility, accidental edits, and cleanup are unsettled. | `DEFER`; do not invent `.fieloraartifact` |
| C — Durable Storage Artifact/revisions/references | Best long-term edit/resume semantics, but requires aggregate ownership, migration, cleanup, sync, and conflict review. | `DEFER`; separate High Change Impact authorization |

```text
FIRST_SLICE_PERSISTENCE_DECISION: A
ARTIFACT_STRUCTURED_STORAGE: NONE
SCHEMA_MIGRATION: NONE
```

First-slice identity is deliberately narrow:

- `artifact_id`: trusted backend-generated UUIDv7, valid only as correlation in
  the completed Tool observation/receipt;
- `artifact_type`: `DOCUMENT | PRESENTATION`;
- `revision`: fixed `1`, an in-memory semantic revision, not a Storage revision;
- scope: inherited from the existing Project/Conversation/AgentRun/ToolCall;
- owner: no independent Artifact owner; the exported file belongs to the
  explicitly selected Project-relative path.

The bounded semantic input remains in existing durable ToolCall arguments
because that is how current execution is audited. That historical record is
not declared the editable Artifact Source of Truth and does not create an
Artifact lifecycle. The first-slice definition limit must remain far below the
existing 1 MiB ToolCall JSON limit.

## 4. ARTIFACT_MODEL

### 4.1 Source of truth and round-trip

During the first-slice call, the validated `ArtifactDefinition` is the source
used by the renderer. The generated `.docx` or `.pptx` is a derived deliverable.
After the call, no editable semantic source is promised.

Long term, “delete slide 4” must create a new `PresentationArtifact` revision
and re-export it. It must not reopen an earlier PPTX and silently claim a
lossless semantic round-trip. If only the exported PPTX remains after this
ephemeral slice, structured editing is unavailable; `file.extract` may recover
bounded text for understanding, but not the original Artifact or layout.

### 4.2 Logical common envelope

```text
ArtifactDefinition
  schema_version = 1
  artifact_type  = DOCUMENT | PRESENTATION
  content        = DocumentContent | PresentationContent
```

The trusted service adds `artifact_id` and `revision=1`. `schema_version`,
semantic revision, and renderer version are separate concepts.

Canonical `artifact_definition_sha256` covers schema version, type, normalized
semantic content, and renderer-relevant options. It excludes generated IDs,
timestamps, Project path, and ToolCall identity. Assets are absent in the first
slice; future asset digests must be included.

### 4.3 Document V1

```text
DocumentContent
  title?
  blocks[]

DocumentBlock V1
  Heading(level 1..3, text)
  Paragraph(text)
  BulletList(items[])
  Table(rows[][])
```

No inline marks are required to prove the first fixture. Heading/list/table
semantics let the renderer apply its built-in style without exposing OOXML.
Bold, italic, code, link, numbered list, divider, image, footnote, comment,
tracked changes, columns, floating layout, mail merge, macro, and OLE are
deferred until a real workflow requires them.

### 4.4 Presentation V1

```text
PresentationContent
  title?
  slides[]

PresentationSlide V1
  layout_intent = TITLE | TITLE_AND_BODY | TWO_COLUMN
  title?
  regions[]

SlideRegion V1
  slot = BODY | LEFT | RIGHT
  blocks[] = Paragraph | BulletList
```

The validator constrains which slots are legal for each layout. The renderer,
not the Model, converts layout intent into fixed geometry. Internal slide IDs
may be generated for receipt/debug correlation, but are not durable identities
in this slice and do not affect the semantic digest.

There is one versioned built-in minimal light theme. No user template, master
slide import, arbitrary x/y/w/h, notes, image, table, shape, chart, animation,
or visual editor is exposed. The three-slide fixture is:

1. `TITLE`;
2. `TITLE_AND_BODY` with paragraph/bullets;
3. `TWO_COLUMN` with semantic left/right content.

### 4.5 First-slice resource bounds

| Bound | Candidate value |
|---|---:|
| Serialized Artifact definition | 256 KiB |
| Total semantic text, either type | 128 KiB UTF-8 |
| Document blocks | 256 |
| Lists / total list items | 64 / 1,024 |
| Tables / rows per table / columns | 16 / 64 / 16 |
| Total Document table cells | 4,096 |
| Presentation slides | 32 |
| Regions per slide / blocks per region | 3 / 16 |
| Text per slide | 16 KiB |
| Assets | 0 |
| Generated output | 16 MiB |
| Cooperative total deadline | 10 seconds |

Every string, list item, table cell, row, region, and aggregate also receives a
small local bound. Validation rejects excess; it does not silently discard
semantic content.

Source references are deferred. Current `ResourceRef` cannot faithfully encode
Conversation turns, Web URLs, or Project file digests, and adding a partial
knowledge graph is not needed to prove export. Artifact content never gains
Verification Authority merely because it was placed in an Office file.

## 5. TOOL_SURFACE

```text
FIRST_TOOL_SURFACE: artifact.export only
EFFECT: WORKSPACE_WRITE
```

Implemented request:

```json
{
  "type": "document",
  "content": { "title": "...", "blocks": [] },
  "output_path": "artifacts/report.docx"
}
```

`output_path` is admitted as a Project-relative path and is included by the
existing workspace revision/fingerprint calculation. Extension and Artifact
type must match exactly.

The Tool performs one transaction-shaped operation:

```text
validate and normalize definition
  -> assign ephemeral Artifact identity/revision
  -> calculate semantic digest
  -> render bounded bytes in memory
  -> validate package/signature and reopen structurally
  -> create a same-directory temporary file
  -> fail if final path exists
  -> fsync + atomic create/rename
  -> reopen and confirm size/output digest
  -> return compact observation + existing ToolCall receipt
```

Candidate compact observation/receipt facts:

- `artifact_id`, `artifact_type`, `artifact_revision=1`;
- block/slide count and a short summary;
- `artifact_definition_sha256`;
- `renderer_id`, `renderer_version`, output format;
- project-relative `path`, `output_sha256`, and output bytes;
- structural self-check result;
- the existing Core-authored execution-source envelope.

The receipt does not duplicate full Artifact content. It has no
`verification_eligible=true` flag. Full semantic content remains only in the
already-bounded ToolCall arguments and renderer memory.

Separate `artifact.create`, `artifact.read`, `artifact.update`, and
`artifact.render` are not justified in the first slice. A cross-call in-memory
handle store would add scoping, eviction, restart, cancellation, and recovery
semantics without user value. Update mutation shape, `expected_revision`, and
whole-replacement versus structured patch remain deferred with persistence.

## 6. DOCX_RENDERER_DECISION

```text
DOCX_RENDERER_DECISION:
REUSE exact office_oxide 0.1.8 DocxWriter FOR THE BOUNDED FIRST SLICE
NEW DEPENDENCY: NONE
```

The currently pinned writer has direct APIs for paragraph, heading, list, and
table plus `Write + Seek` output, which covers Document V1. It is pure
in-process Rust, MIT OR Apache-2.0, MSRV 1.88, and already in the locked graph
with default features disabled.

The dedicated writer probe and production tests now prove bounded package
creation, ZIP/OOXML parts, `office_oxide` reopen, deterministic semantic
output, failure propagation, and `file.extract` roundtrip. They do not prove
Windows Office visual compatibility; maintainer claims are not Fielora evidence.

`docx-rs 0.4.22` is the best independent fallback candidate: a focused MIT
writer with a longer adoption history, but it would add a second Office writer
and its MSRV is not declared in registry metadata. Do not add it while the
already-pinned writer can satisfy the bounded slice.

Hand-written complete WordprocessingML, arbitrary templates, Python, Node,
LibreOffice, and Word COM automation are rejected for this slice.

## 7. PPTX_RENDERER_DECISION

```text
PPTX_RENDERER_DECISION:
REUSE exact office_oxide 0.1.8 PptxWriter FOR THE BOUNDED FIRST SLICE
PRODUCTION-GRADE GENERAL PPTX WRITER: NOT PROVEN
NEW DEPENDENCY: NONE
```

The pinned writer can create slides, titles, rich/body text, bullet lists, text
boxes, images, a minimal master/layout package, and `Write + Seek` output. For
V1, Fielora needs only title/body and fixed two-column geometry. It does not
need a PPTX table API or expose coordinates to the Model.

The writer is still a young 0.1.x implementation. Its single built-in layout,
Office/LibreOffice fidelity, visual quality, deterministic package order, and
failure behavior are not currently product-qualified. The candidate is valid
only behind the same pre-implementation writer probe as DOCX. Failure of that
probe is a STOP condition for Presentation implementation, not permission to
introduce COM, LibreOffice, Python, Node, or a half-written OOXML generator.

### 7.1 Presentation visual reality and quality foundation

```text
PRESENTATION VISUAL REALITY — FIRST VERSION: FAIL_MAJOR
PRESENTATION RENDERER QUALITY SLICE: IMPLEMENTED / TARGETED VALIDATED
POST-SLICE HUMAN VISUAL GATE: PENDING_HUMAN_REVIEW
```

The first real PowerPoint visual review found readable structure but major
layout defects: body text was too small, the canvas was underused, title/body/
bullet hierarchy was weak, two-column regions were mechanically placed, and
the cover was concentrated at the upper-left. That result remains the factual
baseline and is not overwritten by structural evidence.

The quality slice keeps the three existing semantic layouts and adds only a
renderer-private plan:

- one 16:9 `SlideMetrics` source for cover, title, body, equal columns, and a
  stable column gap;
- cover/title/body/column-heading/bullet typography roles with restrained
  primary, secondary, and accent text colors;
- Arial Latin runs and Microsoft YaHei CJK runs without bundled or embedded
  font assets;
- conservative deterministic CJK/Latin line estimation and explicit line
  placement because the pinned writer's free text boxes do not wrap;
- `LOW / NORMAL / HIGH` content density with bounded 20/18/16/15 pt body
  choices; ordinary body and bullets never fall below 15 pt;
- deterministic `PRESENTATION_CONTENT_OVERFLOW` before file creation when a
  title, body, bullet list, or one column cannot fit at the minimum size.

Renderer-plan tests prove stable computation, slide bounds, title/body
separation, equal non-overlapping columns, typography floors, long-title fit,
normal stress fit, and overflow rejection. The production `artifact.export`
probe generated the unchanged eight-slide reality content through the existing
`WORKSPACE_WRITE` path in 64 ms: 14,344 bytes, PPTX renderer version
`0.2.0+office_oxide.0.1.8`, structural reopen `STRUCTURAL_VALID`, semantic
roundtrip `SEMANTIC_CONTENT_PRESENT`, and `file.extract` section count 8.
No Verification event was created.

The installed Microsoft PowerPoint process did not provide a reliable automated
visual observation: a fresh open of the retained pre-slice deck eventually
reported `[Repaired]`, while a fresh open of the post-slice deck remained at a
generic `PowerPoint` window title without exposing the deck title. This local
result conflicts with the prior human `PPTX_OPENABILITY: PASS` baseline and
does not isolate a post-slice regression. Therefore this candidate records no
new openability or visual PASS; the real checklist remains a human gate.

## 8. DEPENDENCY_RESEARCH

Read-only snapshot: 2026-08-26. Version/activity/download numbers are ecosystem
signals, not acceptance evidence.

| Candidate | Registry/repository facts | Assessment |
|---|---|---|
| [`office_oxide 0.1.8`](https://crates.io/crates/office_oxide/0.1.8) / [source](https://github.com/yfedoseev/office_oxide) | Already exact-pinned; MIT OR Apache-2.0; MSRV 1.88; published 2026-07-22; pure in-process; current graph uses `quick-xml 0.41` and `zip 8.6` | **Recommended conditionally** for both bounded exporters; zero dependency delta, but very young and must be independently qualified |
| [`docx-rs 0.4.22`](https://crates.io/crates/docx-rs/0.4.22) / [source](https://github.com/bokuweb/docx-rs) | Focused DOCX writer; MIT; MSRV not declared; 0.4 line and materially broader adoption than new Office crates | DOCX fallback only; adding it now duplicates the pinned writer |
| [`pptx 0.1.0`](https://crates.io/crates/pptx/0.1.0) / [source](https://github.com/hidemi-ito/rust-pptx) | MIT; MSRV 1.85; published 2026-02-25; depends on older `quick-xml 0.39` and `zip 7` | Reject for first slice: young, duplicate dependency generations, no advantage over the pinned minimal writer proven in this repo |
| [`ppt-rs 0.2.25`](https://crates.io/crates/ppt-rs/0.2.25) / [source](https://github.com/yingkitw/ppt-rs) | Apache-2.0; active 0.2 line; MSRV undeclared; default feature includes PDF support and optional CLI/MCP/web stacks | Defer: broader surface/dependency policy than required; assess with defaults disabled only if pinned writer probe fails |
| [`ooxmlsdk 0.13.0`](https://crates.io/crates/ooxmlsdk/0.13.0) / [source](https://github.com/KaiserY/ooxmlsdk) | MIT OR Apache-2.0; MSRV 1.88; typed OOXML package/schema SDK for DOCX/XLSX/PPTX | Defer: useful low-level package/validation option, not a semantic layout renderer; high integration surface for this proof |
| Internal OOXML/package writer | Fielora already has ZIP/XML admission primitives, not a complete authoring implementation | Reject: package validity is not a justification to rebuild Word/PowerPoint |
| PptxGenJS/Python/LibreOffice/PowerPoint COM | External runtime/process/application integration | Reject for first slice by architecture and deployment constraints |

Security notes:

- RustSec's `quick-xml` namespace-allocation advisory is patched at `>=0.41.0`;
  the current exact graph uses 0.41.0.
- RustSec's `zip` extraction advisory is patched at `>=2.3.0` (and is specific
  to extraction APIs); the current exact graph uses 8.6.0 and Artifact export
  does not extract to arbitrary paths.
- This research did not install or run `cargo-audit`. Before implementation,
  re-run advisory/license review against the then-current exact lockfile and
  inspect the writer paths, not only parser paths.

Official research references: [office_oxide Rust guide](https://github.com/yfedoseev/office_oxide/blob/main/docs/getting-started-rust.md), [RustSec quick-xml advisory](https://rustsec.org/advisories/RUSTSEC-2026-0195.html), and [RustSec zip advisory](https://rustsec.org/advisories/RUSTSEC-2025-0168.html).

## 9. OUTPUT_OWNERSHIP

The only first-slice output target is an explicit Project-relative `path`, for
example `artifacts/report.docx`. It is resolved under the existing canonical
Project root and inherits current traversal, symlink/junction, sensitive-path,
and containment enforcement.

```text
OUTPUT_OVERWRITE: REJECT EXISTING PATH
EXPECTED_HASH: NOT REQUIRED FOR CREATE-ONLY FIRST SLICE
ATOMICITY: BOUNDED BYTES -> VALIDATE -> SAME-DIRECTORY TEMP -> FSYNC -> RENAME
```

No output is silently copied into Library, Conversation attachments, an
Artifact database, or an application-global folder. No absolute path, URL,
external process, user template, or network destination is accepted.

On validation, write, cancellation, or rename failure, the final path must not
contain a partial package and the same-directory temp file must be removed.
Cancellation remains cooperative at bounded validation/render/package/write
boundaries; the dependency offers no safe hard preemption inside a synchronous
writer call. Resource bounds prevent an unbounded background renderer claim.

For future overwrite/edit, use the existing hash/revision conflict pattern.
Do not silently replace an export based only on matching Artifact title.

## 10. POLICY_BOUNDARY

`artifact.export` is one `WORKSPACE_WRITE` Tool because its externally visible
effect is Project file creation. The internal in-memory semantic construction
does not require a new `ARTIFACT_WRITE` permission.

```text
artifact.export
  -> existing ToolSpec/catalog
  -> existing PolicyEngine and permission preset
  -> existing Approval routing
  -> existing ToolExecutor
  -> contained binary create
  -> existing durable ToolCall receipt
```

Full Control does not disable containment, output bounds, sensitive-path
denial, no-overwrite, package validation, receipts, or fresh verification.
Renderer/library metadata cannot grant permission. A Skill cannot expose or
authorize the Tool.

## 11. VERIFICATION_BOUNDARY

The exporter may report a Tool self-check only after all of these succeed:

- bounded bytes were generated;
- expected DOCX/PPTX ZIP signature and required package parts exist;
- the bytes reopen structurally through the admitted parser path;
- the final contained file exists with the expected size and digest.

This supports the ToolCall's execution fact. It does not create a Verification
Receipt PASS by itself.

```text
DOCX/PPTX structurally exported != factual content correct
PPTX structurally valid          != visually acceptable
Artifact file saved              != requirement or Goal complete
```

The round-trip sanity test may call existing `file.extract` and compare
required semantic text/counts. That is parser-backed structural evidence, not
lossless reconstruction and not visual verification. Presentation visual
quality after the renderer change remains `PENDING_HUMAN_REVIEW`;
layout-plan tests and structural extraction cannot substitute for a
screenshot/vision/human check at the existing Harness Verification boundary.

Model-, user-, Web-, and extracted-file-derived content keeps its original
trust limits. Exporting it cannot upgrade it to verified truth. The first slice
does not add per-block provenance or a knowledge graph.

## 12. CONTRACT_DELTA_CANDIDATE

No Frozen document is changed. The smallest additive logical contract is:

```text
ArtifactType = DOCUMENT | PRESENTATION
ArtifactDefinitionInput
DocumentContent / DocumentBlock
PresentationContent / PresentationSlide / SlideRegion / LayoutIntent
ArtifactExportRequest { type, content, output_path }
ArtifactExportResult { compact identity, counts, digests, renderer, path, size, structural_check }
```

These may initially be private typed Rust DTOs behind the built-in Tool because
there is no UI/FIPC consumer. Promote them into `fielora-contracts` only when a
real cross-process surface needs them. Do not modify the Frozen
`CORE_CONTRACTS_V0.1.md` merely for directory symmetry.

Reuse without semantic duplication:

- `ModelToolDefinition`, `ToolSpec`, `ToolExecutor`, and `ToolExecution`;
- `AgentToolEffect::WorkspaceWrite`, PolicyEngine, Approval, AgentRun/ToolCall;
- existing execution-source receipt envelope and Verification boundary;
- UUIDv7, SHA-256, project-relative path, containment, atomic mutation, and
  workspace mutation revision primitives.

Do not reuse as if synonymous:

- `LibraryObject` is retained content, not an editable Artifact;
- `AgentInputAttachment`/`WorkspaceAttachmentView` is ingress, not an asset
  ownership contract;
- `Evidence.artifact_ref` in the Frozen semantic document means a reference to
  evidence material, not this authoring domain;
- exported DOCX/PPTX is a derived file, not the semantic object.

```text
STORAGE_DELTA: NONE
MIGRATION: NONE
NEW RESOURCE_REF VARIANT: NONE
NEW PERMISSION / RECEIPT / VERIFICATION TYPES: NONE
```

## 13. CHANGE_IMPACT

| Area | First-slice impact | Reason |
|---|---|---|
| Artifact semantic DTO | `MEDIUM` | New validated authoring vocabulary, but request-scoped and two types only |
| Tool surface | `MEDIUM` | One new built-in Tool through the existing catalog/executor |
| Renderer dependency | `MEDIUM-HIGH` | No dependency addition, but existing writer paths need production qualification |
| Filesystem output | `HIGH` | New binary Project mutation must preserve containment, no-overwrite, atomicity, cleanup, recovery, and receipts |
| Persistence | `NONE` | No structured Artifact store |
| Migration | `NONE` | Schema 7 unchanged |
| Assets | `NONE` | Images/templates/fonts are not accepted |
| Preview/render | `NONE` | Export only; no preview representation or UI |
| Visual verification | `NONE / DEFERRED` | Structural validation explicitly cannot claim visual quality |
| Presentation renderer behavior | `MEDIUM` | Renderer-private geometry, typography, line estimation, bounded fit, and one deterministic overflow code changed; no semantic DTO, schema, permission, or dependency changed |

Overall first-slice Change Impact is `HIGH` because it creates binary Project
files using a young renderer, even though the architecture and storage deltas
are small. Durable Artifact persistence would be a separate `HIGH` change with
mandatory migration/identity/lifecycle review.

## 14. FIRST_SLICE_RECOMMENDATION

| Candidate | Verdict |
|---|---|
| A — Document only, in-memory, create + export | Small, but does not prove the abstraction is format-neutral |
| B — Document + Presentation, in-memory, create + export | Proves two types, but two Tool calls require a new ephemeral handle lifecycle |
| C — Durable two-type CRUD/revisions/export | Reject for first slice; persistence dominates the proof |
| Other — two types, request-scoped one-shot export | **Implemented**; proves shared semantics and two adapters without a handle store |

```text
IMPLEMENTED_FIRST_SLICE: OTHER

Document + Presentation
  -> shared request-scoped ArtifactDefinition
  -> one artifact.export Tool
  -> DOCX / PPTX

Artifact persistence = NONE
Artifact edit = NONE
Artifact read = NONE
Preview/render = NONE
UI = NONE
PDF export = DEFER
Spreadsheet/Diagram/Image/Audio/Video authoring = DEFER
```

The exact pinned DOCX/PPTX writer probe passed before production Tool changes.
No fallback dependency, external process, or Document-only scope reduction was
used.

## 15. TEST_PLAN

### Semantic

- accept valid Document and Presentation V1 fixtures;
- reject wrong tagged variants, mismatched type/extension, illegal layout
  slots, empty required content, unknown fields, and every aggregate bound;
- prove canonical artifact digest stability independent of generated IDs/path;
- prove no inline mark, image, arbitrary coordinates, template, PDF, or
  Spreadsheet input is accepted.

### Export and mutation

- DOCX: title, heading, paragraph, bullet list, and table;
- PPTX: three slides using `TITLE`, `TITLE_AND_BODY`, and `TWO_COLUMN`;
- generate in memory, validate before final creation, then reopen/hash final;
- existing output rejects with no overwrite; traversal/symlink/sensitive paths
  reject; temporary files are absent after success/failure/cancel;
- output and definition limits fail closed;
- cancellation before final rename leaves no final file;
- interrupted no-final-receipt export is not blindly replayed; existing
  workspace reconciliation remains fail-closed/manual unless a deterministic
  Artifact-specific comparison is separately proven.

### Round-trip sanity

- `artifact.export -> file.extract` for each format;
- DOCX required title/heading/paragraph/list/table text exists;
- PPTX slide count, titles, body, and left/right text exist;
- explicitly assert this is normalized sanity, not fidelity round-trip;
- independent ZIP/OPC signature/required-part checks reduce same-library
  common-mode risk.

### Policy, receipts, and verification

- `artifact.export -> WORKSPACE_WRITE -> existing PolicyEngine/Approval`;
- approval denial produces no renderer write and no final file;
- completed ToolCall contains compact Artifact/renderer/output digests plus
  Core-authored execution source, but no duplicated content;
- `output_path` participates in the existing workspace mutation fingerprint;
- export success creates no Verification PASS and cannot complete a mutated Run
  without fresh existing verification.

### Targeted regression

- Artifact semantic/export unit and Core pipeline integration tests;
- existing `file.extract` suite;
- relevant Agent catalog/Policy/recovery tests;
- Web, MCP, Skill, and built-in Coding Tool targeted regressions;
- contracts/docs checks and `git diff --check`.

This backend-only implementation requires the targeted Artifact/Agent/Core,
file.extract, Web, MCP, Skill, Coding, Clippy, release, contracts, docs, and
diff gates. Desktop E2E, packaged/portable smoke, full premerge, UI, and real
network probes remain out of scope.

## 16. OPEN_QUESTIONS

1. After the one-shot proof, does a real edit/resume workflow justify
   Project-file-backed structured source or durable Storage revisions?
2. If durable, is Project the owner with Conversation/AgentRun references, or
   does Artifact become an independent Project-scoped aggregate? Current
   Field/Project compatibility is not decided here.
3. What narrow reference contract can later cover Conversation turn, Project
   file digest, Library object, URL, and Requirement without a knowledge graph?
4. What becomes the canonical admitted Project asset reference for images,
   including MIME, digest, containment, dimensions, and size?
5. Does the exact pinned PPTX writer pass independent package validation and a
   real Windows PowerPoint human-open/visual smoke without repair prompts?
6. Is byte-identical output required? Current target is semantic stability plus
   recorded actual output digest; ZIP part order/metadata determinism must be
   measured before promising byte determinism.
7. When update is authorized, should V1 submit a complete next revision or use
   a small structured patch language with `expected_revision`?
8. How should future Artifact source retention interact with current ToolCall
   argument retention and sensitive generated content?
9. Visual verification, arbitrary templates, PDF export, and round-trip import
   each require separate Change Impact and authorization.

The core answer is therefore:

> Fielora establishes one small, typed Artifact domain behind the existing
> Tool pipeline. The Model supplies bounded semantic intent; the Harness keeps
> authority, execution, receipts, and verification; type-specific adapters
> produce derived files. The first proof is request-scoped and export-only, so
> it demonstrates Document/Presentation extensibility without rebuilding Word
> or PowerPoint and without committing to a premature persistence model.
