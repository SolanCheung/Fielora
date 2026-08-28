# Fielora V0.1 Artifact Asset Foundation Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `NOT AUTHORIZED`

**Date:** 2026-08-28

**Audited baseline:** `phase/complete-agent-v0.1@3945e6ba652c66061b58f32e5761728a9ba816c9`

**Database schema:** `9`

This document is a docs-only architecture candidate. It does not authorize an
Asset table, migration, Tool, image decoder, Office image adapter, Diagram
composition, UI, dependency, cache, or product activation. Repository facts
and the current `Model + Harness + Tools` architecture remain authoritative.

## CURRENT_ASSET_REALITY

### Durable Artifact and composition

| Concern | Reality | Current owner / evidence | Asset gap |
|---|---|---|---|
| Structured Artifact identity and revisions | `EXISTS` | `ArtifactId`, `ArtifactRevisionId`, `ArtifactContentV1`, schema-9 `artifacts` / `artifact_revisions` | No binary Asset identity or metadata |
| Exact structured dependency | `EXISTS` | `ArtifactRefV1` in `fielora-contracts` | Correctly identifies an exact structured revision, not bytes |
| Composition resolver | `EXISTS` | Artifact-domain admission/resolution in `fielora-agent/src/artifact.rs` | Reads exact Artifact revisions only; it is not a blob/path resolver |
| Existing real composition | `EXISTS` | saved Document -> pinned Spreadsheet range -> transient Table -> DOCX | Text/table composition does not prove media admission |
| Artifact canonicalization and digest | `EXISTS` | closed typed canonical JSON plus SHA-256 | Binary bytes cannot be inserted into semantic JSON as base64 or paths |
| Revision conflict/idempotency/recovery | `EXISTS` | current Artifact Core and generic ToolCall lifecycle | Must be reused; no Asset-specific revision/runtime system |
| Verification subject | `EXISTS` | exact `ArtifactRevision` subject | No Asset Verification subject or inheritance is justified |
| Export receipt | `EXISTS` | existing `artifact.export` ToolCall receipt | Can later receive bounded media provenance; no `AssetReceipt` |
| Durable binary Asset | `ABSENT` | no contract, table, resolver, lifecycle, or admission path | Requires a separately approved durability/security delta |

### Current render and image capability

| Area | Reality | Repository fact |
|---|---|---|
| Diagram semantic authority | `EXISTS` | closed typed graph in `DiagramArtifactV1`; raw SVG is not stored |
| Diagram SVG | `EXISTS / DERIVED` | `fielora.diagram.svg@0.1.0`, `FIELORA_BOUNDED_LAYERED_V1`, `LIGHT_NEUTRAL_V1`; deterministic bytes and independent static allowlist reopen |
| Document image semantic block | `ABSENT` | `DocumentBlock` has text, list, table, and Spreadsheet range only |
| Presentation image semantic block | `ABSENT` | `PresentationBlock` has paragraph and bullet list only |
| Fielora DOCX image adapter | `ABSENT` | production adapter calls headings, paragraphs, lists, and tables only |
| Fielora PPTX image adapter | `ABSENT` | production adapter calls `add_rich_text_box` only |
| Office dependency image writer API | `PARTIAL FOUNDATION` | exact `office_oxide 0.1.8` exposes DOCX IR image and PPTX positioned image APIs |
| Fielora Office media reopen | `ABSENT` | current validator checks required package/text/slide facts, not media part, image relationship, content type, geometry, count, or embedded-byte digest |
| File Intelligence image extraction | `ABSENT` | `file.extract` admits PDF/DOCX/PPTX/XLSX and extracts bounded text; it does not expose an Asset/image admission contract |
| Spreadsheet chart/image path | `ABSENT / DEFERRED` | current literal-only Spreadsheet rejects chart/drawing/media semantics |

### Storage and platform primitives

| Concern | Reality | Current owner / limitation |
|---|---|---|
| Profile-owned metadata store | `EXISTS` | SQLite in `DataRoot` |
| Content-addressed durable blob primitive | `EXISTS / LIBRARY-OWNED` | `LibraryRoot/blobs/objects/<prefix>/<sha256>` and `StorageManager.importFile` |
| Library product identity | `EXISTS / NOT AN ASSET` | `LibraryObjectId`, Library metadata, tombstone, sync journal, Library UI |
| Cache root | `EXISTS` | independent `CacheRoot`; clearable and non-authoritative |
| Root isolation | `EXISTS` | `DataRoot`, `LibraryRoot`, and `CacheRoot` are required to be independent |
| Portable blob handling | `EXISTS / LIBRARY-COUPLED` | portable export includes all `LibraryRoot` blobs only when `include_library` is selected |
| Project image preview | `EXISTS / UI ONLY` | extension plus shallow magic checks; bytes remain mutable Project files |
| Conversation image attachments | `EXISTS / NOT REUSABLE` | PNG/JPEG/WebP, 1 MiB, content-named files under Electron user data; dimensions originate from renderer decode and metadata is localStorage-backed |
| Browser favicon decode | `EXISTS / EPHEMERAL` | Electron `nativeImage` decodes, bounds, resizes, and re-encodes an untrusted favicon for UI only |
| Rust image decoder / metadata parser | `ABSENT` | no pinned PNG/JPEG decoder, image dimension parser, rasterizer, or encoder dependency |
| Rust atomic Artifact export | `EXISTS` | contained `atomic_write` and final output hash/reopen |

The existing Library import classifies media by filename extension, copies any
non-empty regular file, and validates only content hash/blob binding at the
storage contract. It is a content-addressed storage primitive, not raster
admission. Existing attachment and preview paths likewise do not prove the
Profile-owned, historical, decoder-bounded, Rust-side Asset boundary required
by Artifact export.

```text
CURRENT_DURABLE_BINARY_ASSET: ABSENT
CURRENT_CONTROLLED_DERIVED_SVG: EXISTS
CURRENT_SOURCE_RASTER_ADMISSION: ABSENT
CURRENT_DOCX_IMAGE_PRODUCT_PATH: ABSENT
CURRENT_PPTX_IMAGE_PRODUCT_PATH: ABSENT
CURRENT_SCHEMA: 9
```

## ASSET_FOUNDATION_DEFINITION

Artifact Asset Foundation is a future bounded resource facility used by the
existing Artifact render-preparation and Tool pipeline. It may own immutable
media identity, admission, integrity, Profile ownership, controlled resolution,
provenance, retention, and renderer consumption.

It is not a second Artifact Runtime, Library, filesystem, Agent, Tool family,
permission engine, receipt hierarchy, or Verification engine.

```text
Model
  -> Harness / existing artifact ToolCall
  -> PolicyEngine / Approval
  -> existing ToolExecutor
  -> Artifact render preparation
       -> exact Artifact resolver
       -> future bounded Asset resolver OR transient derived renderer
       -> existing renderer adapter
  -> existing durable ToolCall receipt
  -> existing Verification / Evidence boundary
```

The future Asset resolver is a request-scoped domain service. It must not call
a model, network, MCP, credential store, Browser, arbitrary path, or new Agent
Runtime.

## ARTIFACT_REF_VS_ASSET_REF

`ArtifactRefV1` remains the identity of one exact structured semantic Artifact
revision:

```text
ArtifactRefV1
  = ArtifactId + RevisionId + expected ArtifactType + semantic SHA-256
```

A future `ArtifactAssetRefV1` would identify one immutable admitted binary
resource:

```text
ArtifactAssetRefV1
  = opaque AssetId + content SHA-256 + admitted media type + byte length
```

They are not interchangeable:

- Diagram remains an Artifact whose typed graph is semantic authority;
- Diagram SVG is a derived representation, not the Diagram identity;
- a user logo PNG may become a source Asset after explicit admission, but is
  not a structured Artifact;
- a Presentation may reference an exact Diagram revision semantically and
  independently consume its transient renderer output;
- neither contract contains an absolute path, Project path, Library path,
  temporary path, base64 bytes, raw XML, or current/latest pointer.

## ASSET_TAXONOMY

| Kind | Authority and identity | Durability | First Slice decision |
|---|---|---|---|
| Source Asset | User/Tool-admitted immutable media with logical Asset ID and content digest | Durable when supported | Deferred pending admission/storage approval |
| Derived render resource | Exact source Artifact revision plus renderer/profile/format commitment | Request-scoped; optionally cacheable | Preferred model for Diagram composition |
| Export file | Final DOCX/PPTX/SVG/XLSX written to a Project path | User-visible output, not an Asset | Keep existing semantics |

The Candidate does not introduce a generic durable `DerivedAsset` entity. A
derived renderer resource is a resolved export input and bounded provenance
fact. A cache entry, if added later, is only an optimization.

## SOURCE_ASSET_MODEL

A future source Asset must be a Profile-owned immutable logical resource whose
metadata lives in durable Fielora state and whose bytes resolve through a
controlled content-addressed store.

Minimum candidate metadata:

```text
AssetRecordV1 {
  asset_id: AssetId,                 // opaque logical identity
  profile_id: trusted repository scope,
  content_sha256: LowerHexSha256,
  media_type: admitted closed value,
  byte_length: bounded integer,
  pixel_width: bounded integer,
  pixel_height: bounded integer,
  source_kind: bounded closed value,
  original_filename: optional bounded display provenance,
  created_by_tool_call_id: optional,
  created_by_agent_run_id: optional,
  created_at: timestamp
}
```

`AssetId` is not the digest. Re-importing identical bytes may create distinct
logical Assets with different bounded provenance while sharing one physical
content blob. EXIF, GPS, camera identity, comments, full source path, prompt,
chain-of-thought, credentials, and raw metadata are not semantic authority.

External source admission must be one fail-closed operation:

```text
bounded contained read
  -> byte-format admission
  -> safe metadata/dimension/decode validation
  -> digest
  -> verified content-addressed atomic persistence
  -> durable metadata commit
```

The repository does not currently provide this complete path.

## DERIVED_ASSET_MODEL

For Diagram composition, the minimum model is a transient derived renderer
resource, not a durable binary Asset:

```text
DerivedRenderKeyV1 {
  source_artifact_id,
  source_revision_id,
  source_semantic_sha256,
  renderer_id,
  renderer_version,
  render_profile,
  output_format
}

DerivedRenderResource {
  key,
  bounded bytes,
  output_sha256,
  media_type,
  dimensions/viewBox,
  structural_validation
}
```

The current Diagram renderer already supplies all source, renderer, theme,
layout, bounded-byte, digest, and structural facts needed to form this resource.
The bytes remain non-authoritative and regenerable. A cache miss must trigger
bounded regeneration, not Artifact corruption.

```text
DERIVED_RENDER_CACHE: OPTIONAL / REGENERABLE
DERIVED_RENDER_CACHE_ROOT: CacheRoot
DERIVED_RENDER_CACHE_IS_AUTHORITY: NO
```

## DURABLE_ASSET_NECESSITY

Three options were evaluated for Diagram -> Document/Presentation:

| Option | Benefit | Cost / risk | Decision |
|---|---|---|---|
| A. transient render | No schema/blob/lifecycle; exact revision can regenerate | Needs an Office-consumable controlled format | **Architecture preference** |
| B. durable binary Asset | Stable reusable source bytes | Adds metadata, migration, storage, portability, admission, retention, and GC before they are needed | Reject for first Diagram composition |
| C. derived cache | Avoid repeated render | Cache lifecycle/key validation; cannot be authority | Optional later |

```text
DURABLE_ASSET_REQUIRED_FOR_FIRST_COMPOSITION: NO
DURABLE_BINARY_ASSET_REQUIRED: NO
```

This is an architecture necessity decision, not an implementation readiness
claim. The preferred transient path is currently blocked because neither
Office writer accepts SVG through the Fielora production path and no reviewed
SVG-to-raster/vector bridge exists.

A future user-owned PNG/JPEG feature does require a durable source Asset. That
is a separate reason to add durability and must not be used to force Diagram
renderer output into the source-Asset lifecycle.

## IDENTITY_MODEL

Source identity:

```text
logical identity = AssetId
byte integrity = content_sha256 + byte_length + admitted media metadata
physical deduplication = content_sha256 blob key
```

Derived identity:

```text
source exact Artifact revision/digest
+ renderer id/version
+ render profile/theme
+ output format
= deterministic derived key
```

Export identity remains separate:

```text
parent semantic digest != source asset SHA
parent semantic digest != derived output SHA
parent export SHA != any of the above
```

## IMMUTABILITY

Source Asset bytes are immutable. Editing/replacing an image creates a new
logical Asset and content binding; it never replaces bytes behind an existing
Asset ID. Every historical parent revision therefore continues to resolve the
exact old Asset.

Derived bytes are immutable for one derived key but disposable. A renderer
version/profile change creates a different key and output; it never overwrites
the meaning of an existing key.

No Asset delete, overwrite, mutable filename reference, or current-pointer
policy belongs in the First Slice.

## PROFILE_BOUNDARY

Any future durable Asset is Profile-owned. Resolution uses the trusted current
Profile plus Asset ID; Profile ID is not supplied by the model or parent
content. Missing and cross-Profile identities return the same not-found class.

Asset availability grants no Project filesystem, network, permission,
Approval, or Semantic Authority. A renderer receives admitted bounded bytes,
not a storage path.

## PROJECT_BOUNDARY

A Project image file is a mutable filesystem object, not an Asset. It may become
an Asset only through explicit contained admission. Parent semantic content
must never use `images/logo.png`, an absolute path, or a Project export path as
durable media authority.

Same-Profile Asset reuse may eventually cross Project associations, matching
current Artifact repository authority. Product discoverability is a later UI
decision and must not weaken Profile non-disclosure or Project path containment.

## LIBRARY_RELATIONSHIP

`LibraryObject` and future `AssetRecord` have different semantic owners:

- Library is a user-facing knowledge/media collection with title, source,
  lifecycle, sync journal, tombstone, and Library UI;
- Asset is an immutable resource dependency of durable work objects;
- saving an Asset to Library may later create an explicit relation, but cannot
  silently change either identity or lifecycle.

```text
ARTIFACT_ASSET_IS_LIBRARY_ITEM: NO
ARTIFACT_ASSET_BYTES_REUSE_LIBRARY_BLOB: DEFER FOR FIRST SLICE
```

If durable source Assets are authorized later, the preferred physical design
is to extract/reuse the existing content-addressed `LibraryRoot/blobs/objects`
primitive without creating a `LibraryObject`. This is not ready to freeze:

- current APIs and labels call it a Library blob store;
- import performs no raster admission;
- portable export includes those blobs only under the Library include option;
- Asset metadata copied with the database must not be restored without its
  required source bytes;
- retention cannot be driven only by Library tombstones or current parent
  references.

These portability/lifecycle facts must be resolved before a durable Asset
implementation. They do not justify a second blob store.

## ROOT_STORAGE_DECISION

| State | Root | Authority |
|---|---|---|
| Future durable Asset metadata | `DataRoot` SQLite | Profile-owned semantic metadata |
| Future admitted source bytes | `DEFER`; preferred shared content-addressed primitive physically under `LibraryRoot` after lifecycle/portable review | Immutable byte authority, not Library identity |
| Derived Diagram render | request memory; optional `CacheRoot` entry | Regenerable, never authority |
| Final export | contained user-selected Project-relative output | Export file, not Asset semantic source |

DataRoot, LibraryRoot, CacheRoot, and Project output remain independent. No
`ArtifactAssetRoot`, Project `.fielora/blob`, or second SHA-256 store is proposed.

## BLOB_STORAGE_DECISION

```text
DURABLE_BINARY_ASSET_REQUIRED: NO FOR FIRST DIAGRAM COMPOSITION
SOURCE_ASSET_STORAGE: DEFER
DERIVED_ASSET_STORAGE: TRANSIENT; OPTIONAL CACHE_ROOT LATER
ASSET_IS_LIBRARY_ITEM: NO
```

Future direction, not frozen: share the existing content-addressed durable blob
primitive while keeping Asset metadata/lifecycle independent from
`LibraryObject`. A new durable source slice must first make portability,
migration, retention, and profile restoration coherent.

## FORMAT_POLICY

| Format | Writer compatibility | Admission/security reality | Candidate disposition |
|---|---|---|---|
| PNG | DOCX/PPTX dependency APIs can package it | No Rust production decoder/dimension admission; no Fielora media reopen | First future source format after gates |
| JPEG | Dependency APIs can package it | More metadata/parsing/privacy surface; no decoder | Defer behind PNG |
| SVG | Current Diagram emits controlled SVG; Office image enum has no SVG | External SVG is active-content capable | Controlled derived SVG only; external SVG rejected/deferred |
| WebP | Existing UI attachment/preview paths understand it | Office writer `ImageFormat` does not include WebP | Defer |
| EMF/WMF | Office dependency enum can package it | Complex Windows vector/parser security and no repository-owned renderer | Defer |
| GIF/TIFF/BMP | Dependency enum can package them | Animation/decoder/metadata/size surface; no product need | Defer |

```text
FIRST_BINARY_ASSET_FORMATS: PNG ONLY, IF A FUTURE DURABLE SOURCE SLICE IS AUTHORIZED
FIRST_DERIVED_FORMAT: CONTROLLED SVG IN MEMORY ONLY
EXTERNAL_SVG: REJECT / DEFER
JPEG_WEBP_GIF_TIFF_BMP_EMF_WMF: DEFER
```

## SVG_SECURITY_BOUNDARY

The existing Diagram SVG is safe only because repository-owned code generates
a closed static vocabulary and independently reopens it with bounds on root,
namespace, elements, attributes, geometry, counts, text, and URLs. It contains
no script, style, foreignObject, image, use, animation, href, event handler, or
external resource.

```text
CONTROLLED_DERIVED_SVG: ADMITTED ONLY AFTER CURRENT DIAGRAM VALIDATOR PASS
UNTRUSTED_EXTERNAL_SVG: NOT AN ASSET FORMAT IN THE FIRST SLICE
```

No MIME label, extension, Library classification, or XML parse alone may turn
external SVG into trusted renderer input. A future sanitizer is a separate
high-impact security project.

## RASTER_SECURITY_BOUNDARY

The minimum future PNG admission policy is:

- one bounded regular file from an explicitly contained source;
- validated PNG signature and unambiguous format from bytes;
- bounded encoded bytes, dimensions, pixel count, metadata/chunk count, and
  decode work;
- complete decode or equivalently strong decoder validation, including
  truncated/corrupt stream rejection;
- reject animation, embedded executable/external references, ambiguous or
  polyglot payloads, trailing foreign payload, and impossible dimensions;
- ignore nonessential textual/privacy metadata; EXIF/GPS never becomes
  semantic authority;
- digest the exact admitted bytes and atomically persist them before metadata
  commit;
- re-resolve by logical identity and recheck byte length/digest at export.

Candidate implementation bounds to review:

| Bound | Candidate maximum |
|---|---:|
| One source PNG encoded bytes | 8 MiB |
| Width or height | 8,192 pixels |
| Total decoded pixels | 40,000,000 |
| Asset references per parent revision | 16 |
| Total resolved source bytes per export | 32 MiB |
| Derived controlled SVG bytes | existing 2 MiB |
| Parent Office output | existing 16 MiB |
| Export deadline | existing 10 seconds, subject to measured writer probe |

These are Candidate bounds, not implemented contracts.

Existing Electron paths are insufficient as this boundary: attachment magic
checks do not independently decode in the Rust Core, renderer-provided
dimensions are not durable authority, Workspace preview trusts extension plus
shallow magic, and Browser `nativeImage` is an ephemeral UI-specific decoder.

## DOCX_IMAGE_REALITY

```text
DOCX_IMAGE_SUPPORT: PARTIAL
```

Dependency-level facts in exact `office_oxide 0.1.8`:

- `DocxWriter::add_ir_image` accepts raw bytes plus declared
  `ImageFormat`, inline/floating positioning, display EMUs, alt text, and
  decorative intent;
- it creates `word/media/imageN.*`, image relationships, content types, and
  DrawingML using the declared format;
- PNG/JPEG/GIF are recognized by parts of the reader conversion; floating
  conversion is narrower;
- the API silently skips a missing data value and defaults an absent format to
  PNG;
- the writer does not establish that supplied bytes match the declared format
  or decode safely.

Fielora production gaps:

- no Document image block or Asset reference;
- no production call to `add_ir_image`;
- no admitted bytes/dimensions/alt-text contract;
- no deterministic real-image writer probe in Fielora tests;
- no reopen assertion for media part, internal relationship, content type,
  placement, count, exact embedded digest, multiple images, or no external
  relationships.

Inline-only DOCX intent is sufficient for a first Document source-Asset
consumer. Floating, anchor, wrap, crop, and arbitrary geometry remain deferred.

## PPTX_IMAGE_REALITY

```text
PPTX_IMAGE_SUPPORT: PARTIAL
```

Dependency-level facts in exact `office_oxide 0.1.8`:

- `SlideData::add_image` accepts raw bytes, PNG/JPEG/GIF/TIFF/BMP/EMF/WMF
  format, absolute EMU position, and size;
- the writer creates media parts, per-slide internal relationships, content
  types, picture shapes, and sequential media identities;
- multiple images are represented by repeated body items;
- the reader resolves image relationship bytes and carries display geometry;
- no `ImageFormat::Svg` or WebP exists;
- format fallback/extension handling is not a security-grade source admission
  mechanism, and the writer does not decode bytes.

Fielora production gaps:

- no Presentation image block, fit/fill intent, or Asset reference;
- production rendering only emits text boxes;
- no safe conversion from controlled Diagram SVG;
- no Fielora deterministic multi-image writer/reopen probe;
- current structural validation ignores media, relationships, content type,
  geometry, count, embedded digest, and external media relationships.

PPTX image placement must remain parent-layout-owned. A future typed block may
select a bounded layout slot and `CONTAIN`/`FILL` intent; it must not expose raw
EMU coordinates or XML to model content.

## DIAGRAM_DOCUMENT_OPTION

| Path | Reality | Decision |
|---|---|---|
| Controlled SVG -> native DOCX SVG | dependency image enum has no SVG | Blocked |
| Controlled SVG -> PNG -> inline DOCX | no reviewed rasterizer/decoder/encoder | Blocked pending dependency/security review |
| Diagram -> EMF/WMF -> DOCX | no repository-owned renderer; complex format/security | Defer |
| Diagram -> native Word drawing | requires a second Office shape renderer and new validation | Defer |
| Diagram -> durable Asset -> DOCX | adds unnecessary durability; still lacks conversion | Reject for first composition |

```text
DIAGRAM_DOCUMENT_PATH_DECISION: TRANSIENT DERIVED RESOURCE IS THE RIGHT MODEL, BUT NO SAFE OFFICE-CONSUMABLE REPRESENTATION EXISTS TODAY
```

## DIAGRAM_PRESENTATION_OPTION

| Path | Reality | Decision |
|---|---|---|
| Controlled SVG -> native PPTX SVG | no SVG writer format | Blocked |
| Controlled SVG -> PNG -> PPTX | requires a reviewed deterministic rasterizer | Blocked |
| Diagram -> EMF/WMF -> PPTX | writer can package declared bytes, but no safe Fielora renderer/validator | Defer |
| Diagram -> native Presentation shapes | duplicates Diagram rendering/layout in a second backend | Defer |
| Admitted PNG -> PPTX | proves source Asset, not Diagram composition | Future separate option |

```text
DIAGRAM_PRESENTATION_PATH_DECISION: DEFER; DO NOT FORCE SVG-TO-PNG OR A SECOND SHAPE RENDERER
```

## ASSET_REF_MODEL

If durable source Assets are later authorized, the minimal generic reference
candidate is:

```text
ArtifactAssetRefV1 {
  asset_id: AssetId,
  content_sha256: LowerHexSha256,
  media_type: AssetMediaType,      // first candidate: IMAGE_PNG only
  byte_length: BoundedAssetBytes
}
```

Resolution compares all fields with immutable Profile-owned metadata, then
loads bounded bytes from controlled storage and rechecks length, digest, format,
and admitted dimensions. The parent cannot submit Profile ID or a path.

A generic durable `DerivedAssetRef` is not proposed. A future parent-specific
Diagram embed contains an `ArtifactRefV1` plus renderer commitment and layout
intent; render preparation creates the transient resource.

## PARENT_SEMANTIC_MODEL

Identity and placement remain separate typed concepts. Candidate future forms:

```text
DocumentBlock::Image {
  asset_ref: ArtifactAssetRefV1,
  alt_text: bounded optional text,
  size: DOCUMENT_WIDTH_BOUNDED,
  placement: INLINE
}

PresentationBlock::Image {
  asset_ref: ArtifactAssetRefV1,
  fit: CONTAIN | FILL,
  alignment: CENTER | START | END
}

PresentationBlock::Diagram {
  artifact_ref: ArtifactRefV1,
  renderer_id: "fielora.diagram.svg",
  renderer_version: "0.1.0",
  render_profile: "LIGHT_NEUTRAL_V1",
  fit: CONTAIN
}
```

These are Candidate sketches, not contracts. They contain no base64, path,
CSS, pixel coordinates, arbitrary XML, Office relationship, raw SVG, or mutable
current/latest reference. Existing Document/Presentation layout conventions
remain owners of placement.

## RENDER_SNAPSHOT

One parent export must freeze before rendering:

- exact parent Artifact revision and semantic digest;
- complete bounded structured `ArtifactRefV1` dependency snapshot;
- each exact durable source Asset ID, content digest, media type, bytes,
  dimensions, and provenance needed by the render;
- each derived Diagram source revision/digest and pinned renderer
  id/version/profile/format;
- sorted dependency/media facts used for the existing receipt.

Resolution completes before the Office writer starts. Rendering never follows
a child current pointer, mutable Project path, changing Library object, network
URL, or cache entry. Cache miss regenerates from the frozen exact source.

## REPRODUCIBILITY_MODEL

For future Diagram composition, the Candidate selects parent-pinned renderer
profile/version rather than silently using whatever renderer is current:

```text
DERIVED_RENDERER_VERSION_POLICY: PARENT EMBED PINS SUPPORTED RENDERER ID/VERSION/PROFILE
```

An unsupported historical renderer commitment fails closed. An explicit parent
revision update is required to adopt a new renderer profile/version.

Reproducibility levels remain distinct:

- semantic: exact parent content, Artifact refs, Asset refs, and source digests;
- structural render: same supported renderer/version/profile produces the same
  derived structure and Office media relationship facts;
- byte: controlled Diagram SVG currently promises deterministic bytes; source
  Asset bytes are exact; final Office ZIP byte identity is not promised unless
  a specific renderer contract and probe deliberately establish it.

Every final export records its own output digest even when byte identity is not
the semantic contract.

## PROVENANCE

The existing export receipt may later record bounded facts:

- parent Artifact/revision/semantic digest;
- structured dependency identities/digests;
- source Asset ID, content digest, media type, byte length, dimensions, and
  bounded source kind;
- derived source Artifact/revision/digest, renderer id/version/profile, format,
  derived output digest, and viewBox/dimensions;
- expected/actual media count, parent renderer, output digest, and structural
  reopen result.

It must not contain bytes, base64, full semantic child content, full EXIF,
arbitrary source path, temporary path, credential, prompt, or chain-of-thought.

## RECEIPT_BOUNDARY

All source admission, derived rendering, and Office embedding facts remain in
the existing ToolCall result/receipt for the existing operation. Do not add
`AssetReceipt`, `DerivedReceipt`, or a second evidence ledger.

An admission/import operation, if later exposed, must still traverse the
existing Tool catalog, PolicyEngine/Approval, ToolExecutor, durable ToolCall,
and evidence path. The Candidate does not decide that a new Model-facing Asset
Tool is necessary; a first human/import flow or internal renderer resource may
avoid one.

## VERIFICATION_BOUNDARY

```text
successful image admission != image meaning verified
successful Diagram render != Diagram semantics verified
successful Office embedding != parent semantic Verification PASS
```

No Verification inheritance exists between Asset, Diagram, and parent. The
current exact parent Artifact revision remains the Verification subject.
Structural media reopen is execution evidence only. Existing mutation
freshness and completion rules remain unchanged.

## RETENTION_GC_FUTURE

No Asset delete or GC belongs in the First Slice. Future retention must inspect
all retained historical Artifact revisions, not only current parent heads or
current-reference counts. A Library tombstone must not delete bytes still
required by an Asset, and an Asset lifecycle must not depend on Library UI
visibility.

Identical source bytes may be physically deduplicated while retaining multiple
logical Asset records. Physical deletion is allowed only after all retained
Library and Asset owners, portable/recovery commitments, and in-flight exports
are proven absent. Derived CacheRoot entries may be evicted at any time.

## DEPENDENCY_IMPACT

```text
THIS_DOCS_ONLY_CANDIDATE_NEW_DEPENDENCIES: 0
TRANSIENT_CONTROLLED_SVG_NEW_DEPENDENCIES: 0
SAFE_EXTERNAL_PNG_ADMISSION_DEPENDENCY: NOT PRESENT / REVIEW REQUIRED
SVG_TO_PNG_DEPENDENCY: NOT PRESENT / REVIEW REQUIRED
```

Candidate families for a later separate dependency review:

| Candidate | Use | License status for Fielora | Security impact | Alternative |
|---|---|---|---|---|
| pinned PNG-specific Rust decoder | PNG structure/decode/dimensions | exact-version license not audited in this Candidate | untrusted compressed-data parser in Core | reviewed Windows WIC adapter or no source raster |
| pinned general Rust image decoder | future PNG/JPEG | exact-version license not audited | larger codec/metadata attack surface | PNG-only dependency |
| pinned `resvg`/`usvg` family | controlled SVG -> raster | exact-version license not audited | new parser/rasterizer and font/resource policy | native SVG writer, repository-owned vector backend, or defer |
| Windows Imaging Component | OS decode/metadata | platform API; integration/legal review still required | Windows-only native boundary and codec variability | pinned Rust decoder |

No candidate is approved, installed, or added. Manual ad-hoc decoding is not
accepted as a shortcut to avoid dependency review.

## SCHEMA_MIGRATION_IMPACT

```text
DB_SCHEMA_CHANGE_REQUIRED: NO FOR TRANSIENT DIAGRAM-DERIVED COMPOSITION
SCHEMA_REMAINS: 9
MIGRATION_FOR_TRANSIENT_PATH: 0
FUTURE_DURABLE_SOURCE_ASSET_DB_SCHEMA_CHANGE_REQUIRED: YES
```

A durable source Asset needs Profile-owned metadata and lifecycle in a forward
migration. It must not be hidden inside Artifact JSON or overloaded onto
`library_objects`. No migration design or schema version is authorized here.

## SECURITY_BLOCKERS

Two blockers prevent an immediate media consumer implementation:

1. Fielora has no safe Rust-side raster admission/decode primitive. Current UI
   magic checks and renderer dimensions cannot be reused as durable authority.
2. Fielora DOCX/PPTX production validation does not independently prove media
   part, internal relationship, content type, placement, count, source-byte
   digest, or no external relationship. A writer returning `Ok` is not enough.

Diagram -> Office additionally has no native SVG writer path and no reviewed
SVG-to-PNG/EMF/native-shape backend. The Candidate therefore does not authorize
any Asset or Diagram composition implementation.

Mandatory future zero-capability facts:

```text
MODEL_REQUESTS: 0 DURING RESOLUTION/RENDER
NETWORK_REQUESTS: 0
CREDENTIAL_READS: 0
MCP_ACTIVATIONS: 0
ARBITRARY_FILESYSTEM_READS: 0
RAW_OFFICE_XML_FROM MODEL/ASSET: 0
EXTERNAL_OFFICE_RELATIONSHIPS: 0
```

## CHANGE_IMPACT

| Change | Impact | Reason |
|---|---|---|
| Asset semantic reference | `MEDIUM` | additive typed parent dependency and canonical digest |
| Durable Asset metadata | `HIGH` | Profile ownership, migration, portability, retention, historical references |
| Binary storage | `HIGH` | shared blob lifecycle, atomicity, restore, dedupe, GC |
| Raster admission | `HIGH` | untrusted compressed content, dimensions/pixel bounds, privacy metadata |
| Office media embedding | `HIGH` | package relationships/content types/geometry and exact reopen |
| Diagram derived composition | `MEDIUM / HIGH` | exact dependency snapshot plus renderer commitment; conversion remains high |
| SVG conversion/rasterization | `HIGH` | new parser/rasterizer/dependency and deterministic font/resource policy |
| UI | `DEFERRED` | no UI in this foundation or first backend Gate |
| This docs-only Candidate | `LOW` | no code, contract, schema, dependency, Frozen doc, or runtime change |

## FIRST_SLICE_RECOMMENDATION

Current options:

| Option | Value | Dependency / storage | Security / writer reality | Decision |
|---|---|---|---|---|
| A. admission + durable PNG/JPEG, no consumer | Low; unvalidated abstraction | migration + blob + decoder | no renderer proof | Reject |
| B. Presentation -> durable PNG | High visual value | migration/blob/decoder | Fielora PPTX media path and reopen absent | Defer |
| C. Document -> durable PNG | Smallest real source-Asset consumer | migration/blob/PNG decoder | inline layout is bounded, but admission and reopen absent | **Preferred after gates** |
| D. Diagram -> Presentation transient | High composition value; no migration | needs safe SVG bridge | native SVG absent; rasterizer unreviewed | Blocked |
| E. Diagram -> Document transient | Medium value; no migration | same bridge | native SVG absent; rasterizer unreviewed | Blocked |
| F. metadata/storage only | Low; no consumer | migration/blob | creates empty abstraction | Reject |

```text
RECOMMENDED_FIRST_ASSET_SLICE: NOT READY FOR IMPLEMENTATION
REQUIRED_PRECURSOR: DETERMINISTIC OFFICE PNG WRITER/REOPEN PROBE + SAFE PNG ADMISSION DEPENDENCY DECISION
CONDITIONAL_FIRST_REAL_CONSUMER: DOCUMENT -> PINNED DURABLE PNG ASSET -> INLINE DOCX
CONDITIONAL_SLICE_PROVES: DURABLE BINARY ASSET
DIAGRAM_DERIVED_MODEL: TRANSIENT, SEPARATE, AND STILL BLOCKED ON REPRESENTATION BRIDGE
```

The precursor is an evidence Gate, not a product feature: use a known valid PNG
fixture to prove exact dependency writer behavior for DOCX and PPTX separately,
including multiple media, relationship/content type, bounded geometry,
embedded-byte digest, independent reopen, malformed-byte rejection at the
Fielora boundary, and deterministic structural facts. It does not authorize
production code in this task.

If the DOCX Gate and a reviewed PNG admission primitive pass, Option C is the
smallest real Asset slice: one Profile-owned immutable PNG, one typed inline
Document block, saved-revision DOCX export, no UI, no JPEG, no Diagram, no
floating layout, no new Tool family unless the actual admission workflow proves
one necessary.

## TARGETED_TEST_PLAN

### Writer capability Gate before implementation authorization

- one real valid PNG through DOCX IR image and PPTX image APIs;
- multiple PNGs with deterministic media naming/count and internal-only rels;
- exact content type, media part path, source-byte digest, position/size, and
  independent IR/package reopen;
- no missing-data silent skip accepted by the Fielora adapter;
- declared-format/magic mismatch and truncated bytes fail before writer;
- no external relationship, raw XML, path input, network, or temporary-path
  provenance;
- same semantic input yields the same structural facts; record byte identity as
  observed evidence only unless deliberately contracted.

### Future source PNG admission, if authorized

- valid PNG; wrong extension; magic/type mismatch; truncated/corrupt stream;
- oversized encoded bytes, axis, pixels, metadata/chunks, and trailing payload;
- animated/ambiguous/polyglot input rejected;
- digest, dimensions, atomic blob persistence, metadata transaction, restart,
  duplicate bytes with separate Asset IDs, and shared physical blob;
- Profile isolation/non-disclosure, Project containment, TOCTOU, and no path in
  semantic content/receipt;
- portable export/restore with required Asset bytes independent of the Library
  UI include choice, plus failure on missing/mismatched blob;
- all retained historical parent revisions continue resolving old Assets.

### Future Diagram-derived composition, if a bridge is approved

- exact and historical Diagram revisions; no latest/current reads;
- pinned renderer id/version/profile and controlled SVG allowlist pass;
- CJK, cycles, groups, disconnected graph, and layout bounds;
- child new revision does not alter old parent export;
- conversion output digest, dimensions, no file/network/font fetch, and cache
  miss regeneration;
- historical parent render either uses the pinned supported renderer or fails
  closed; it never silently upgrades.

### Parent Office and regression

- media relationship, content type, dimensions/placement, count, embedded
  digest, internal-only rels, atomic write, final-file reopen, and output hash;
- exact historical export and existing revision/conflict/idempotency/recovery;
- existing parent Verification subject and no inherited PASS;
- standalone Document, Presentation, Diagram, Spreadsheet, Document ->
  Spreadsheet composition, DOCX/PPTX/SVG/XLSX export, Profile isolation, and
  schema compatibility;
- Model/network/credential/MCP/arbitrary-file actions remain zero during
  resolution and rendering.

## OPEN_QUESTIONS

1. Which exact PNG admission primitive can meet decode, dimensions, metadata,
   polyglot, deterministic behavior, Windows packaging, maintenance, and license
   requirements without broadening the codec surface?
2. Can a targeted real-image probe establish reliable DOCX and PPTX media
   reopen with `office_oxide 0.1.8`, or does either writer need a second backend
   slice?
3. How should the existing `LibraryRoot` blob primitive be renamed/extracted so
   Asset bytes can share storage without becoming Library objects?
4. How must portable profile include/restore semantics change so required Asset
   blobs cannot be omitted while their metadata and parent references are
   imported?
5. Should identical source bytes imported twice always create separate logical
   Asset IDs, or may an explicit product action choose an existing Asset while
   preserving provenance?
6. Is `DOCUMENT_WIDTH_BOUNDED` one closed size intent enough for the first
   inline DOCX image, and what exact alt-text requirement should apply?
7. What bounded Presentation slot/fit semantics should precede any PPTX image
   block without exposing raw EMU geometry?
8. Is a future approved native Office SVG path sufficient to unblock transient
   Diagram composition, or must controlled SVG still pass an additional Office
   package-specific validator?
9. How long must old pinned renderer versions remain available for historical
   re-export, and what user-visible error applies when they are retired?
10. What dependency-aware retention projection is needed before Asset archive
    or GC, given immutable historical Artifact revisions?

## NEXT_DECISION

`D. OFFICE_IMAGE_RENDERER_BLOCKER_FOUND`
