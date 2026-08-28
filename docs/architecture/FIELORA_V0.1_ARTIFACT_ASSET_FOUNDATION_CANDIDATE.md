# Fielora V0.1 Artifact Asset Foundation Candidate

**Status:** `DRAFT / CANDIDATE / NOT FROZEN`

**Implementation:** `PNG + DURABLE SOURCE ASSET FIRST SLICE IMPLEMENTED / TARGETED VALIDATED`

**Date:** 2026-08-28

**Audited baseline:** `phase/complete-agent-v0.1@a01a8fcf8b3894b56ce3c5b8005088bbe3d220f6`

**Database schema:** `10`

This remains a non-Frozen architecture Candidate. The separately authorized
first implementation slice is now represented below as repository reality;
it does not authorize Presentation images, Diagram raster/composition, UI,
delete/GC, remote images, or further product activation. Repository facts and
the current `Model + Harness + Tools` architecture remain authoritative.

## FIRST_SLICE_IMPLEMENTATION_REALITY

This section supersedes pre-implementation status statements retained later in
the Candidate as audit history.

```text
External/Project PNG
  -> artifact.asset.import (existing ToolCall / PolicyEngine / Approval)
  -> project-relative bounded regular-file read
  -> Fielora strict PNG scanner + png 0.18.1 strict full decode
  -> exact immutable bytes in LibraryRoot/blobs/objects/<prefix>/<sha256>
  -> schema-10 profile-owned assets metadata (no LibraryObject)
  -> ArtifactAssetRefV1 / Document INLINE_IMAGE
  -> mutation-time exact Asset admission
  -> saved exact Document revision render snapshot
  -> office_oxide DOCX inline PNG writer
  -> independent final package/media/digest/extent reopen
  -> existing bounded ToolCall receipt; no Verification PASS
```

Implemented facts:

- exact dependency `png = "=0.18.1"`, `default-features = false`; lockfile adds
  only `png 0.18.1` and `fdeflate 0.3.7` as new packages;
- encoded input is capped at 8 MiB before decoder allocation; scanner caps 128
  chunks, exact PNG signature/IHDR/contiguous IDAT/final IEND/EOF, verifies CRC,
  and rejects APNG, Adam7, palette/indexed/16-bit, textual/ICC/EXIF, private and
  unknown chunks;
- decoder explicitly verifies CRC and Adler, performs one complete static
  decode, and is bounded to 4,096 x 4,096, 16,777,216 pixels and 64 MiB decoded
  output; decoded pixels are immediately discarded;
- original encoded bytes are the content digest authority; no re-encode,
  decoded cache, SQLite BLOB, Artifact base64, Project copy, or second blob
  root exists;
- `AssetId` is opaque logical identity and differs from SHA-256 byte identity;
  same ToolCall/request replays one Asset, while a new ToolCall may create a new
  Asset sharing the same content blob;
- migration `0010_durable_source_assets.sql` adds only immutable source Asset
  metadata plus index/update-delete denial triggers; migrations 0001-0009 are
  unchanged;
- `ArtifactAssetRefV1` pins AssetId, exact digest, `image/png`, and byte length;
  `INLINE_IMAGE` stores only that ref, `DOCUMENT_WIDTH_BOUNDED`, and optional
  bounded alt text;
- create/update resolves current-Profile Asset metadata before parent revision
  commit; missing and cross-Profile IDs use the same not-found class;
- export rechecks blob length/SHA-256 plus Fielora static PNG structure and
  dimensions. Creation remains the full-decode boundary;
- DOCX media validation reopens final bytes, resolves internal image
  relationships, content type, drawing references, bounded extents, and exact
  embedded content digests. Duplicate media parts for repeated refs are allowed;
- receipts contain bounded Asset identity/digest/media/size/dimensions and a
  canonical sorted Asset-set digest, never source path, bytes, decoded pixels,
  EXIF, credentials, prompt, or model context;
- successful admission/embedding is structural execution evidence only and
  creates no semantic Verification PASS.

First-slice exclusions remain: JPEG/SVG/WebP/GIF, Presentation image blocks,
Diagram raster/composition, UI, Asset read-bytes Tool, delete/GC, remote images,
Marketplace/runtime work, and any new permission/receipt/Verification system.

## FIRST_SLICE_TARGETED_EVIDENCE

Validated on 2026-08-28 against the implementation baseline above:

- `cargo test -p fielora-agent --lib`: `123 passed`;
- `cargo test -p fielora-storage --lib`: `24 passed`, including fresh schema
  10, exact schema 9 -> 10 upgrade, failure rollback, old Artifact data
  preservation, immutable/profile-scoped Asset restart and idempotency;
- `cargo test -p fielora-core`: `29 passed`, including real Policy/Approval/
  ToolCall/receipt ingress, no Verification PASS, same-ToolCall replay, shared
  blob dedupe, commit-before-receipt UNKNOWN reconciliation to the same durable
  Asset, and pre-commit rejection of mismatched Asset refs;
- production Document fixture covers two Assets, one Asset referenced twice,
  text/table coexistence, R1 -> Asset A, R2 -> Asset B, R1 re-export -> Asset A,
  exact final DOCX media reopen, and corrupt/missing blob no-output failure;
- `pnpm verify:dev:core`, `pnpm verify:dev:cross`, and
  `pnpm verify:dev:docs`: `PASS`; Cross includes 176 TypeScript tests and 12
  real Core integration tests with schema version 10;
- generated TypeScript contracts, `contracts:verify-current`, context manifest
  audit, affected all-target Clippy with `-D warnings`, Rust format, release Core
  build, and `git diff --check`: `PASS` at closeout;
- migrations 0001-0009 have zero diff. New dependency packages are exactly
  `png 0.18.1` and `fdeflate 0.3.7`; no default/optional PNG features are on;
- deterministic validation made zero Model, network, credential, or MCP
  requests. Full premerge, Browser/Desktop visual E2E, packaged, and portable
  were intentionally not run for this backend-only targeted Slice.

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
| Office dependency image writer API | `SUPPORTED WRITER FOUNDATION` | test-owned PNG probes prove exact `office_oxide 0.1.8` DOCX IR image and PPTX positioned-image output |
| Fielora Office media reopen | `TEST-ONLY EXISTS / PRODUCTION ABSENT` | bounded independent test validation proves media part, relationship, content type, geometry, count, and exact embedded-byte digest; the production validator remains unchanged |
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
| PNG | DOCX/PPTX dependency APIs and test-only media reopen are proven | No Rust production decoder/dimension admission or production media validator | First future source format after gates |
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
| Width | 4,096 pixels |
| Height | 4,096 pixels |
| Total decoded pixels | 16,777,216 |
| Decoded output buffer | 64 MiB |
| Total chunks | 128 |
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

### PNG admission security model

```text
PNG_ADMISSION_SECURITY_MODEL: REVIEWED CANDIDATE / NOT IMPLEMENTED
FIRST_SOURCE_FORMAT: PNG ONLY
MEDIA_TYPE_AUTHORITY: BYTES -> image/png
ENCODED_BYTES_MAX: 8 MiB BEFORE DECODER
WIDTH_MAX: 4096
HEIGHT_MAX: 4096
PIXELS_MAX: 16,777,216
DECODED_OUTPUT_MAX: 64 MiB
CHUNK_COUNT_MAX: 128
INTERLACE: REJECT_FIRST_SLICE
APNG: REJECT
PERSISTED_PAYLOAD: ORIGINAL EXACT ADMITTED PNG BYTES
```

Admission is a Fielora-owned sequence, not `read_info() == Ok`:

1. bound the encoded input before invoking a decoder;
2. perform a small structural scan with checked arithmetic;
3. admit only the closed static chunk/color/depth profile below;
4. reject metadata and animation before either can be decompressed or parsed;
5. configure explicit decoder allocation and checksum policy;
6. inspect header facts, recheck all bounds, and checked-compute the output
   buffer before allocation;
7. fully decode one static frame into a zeroed validation-only buffer, finish
   the stream, and drop decoded pixels;
8. retain the original exact bytes and derive SHA-256 from those bytes, never
   from a re-encode.

The structural scanner owns the following closed container policy:

- require the PNG signature; alphabetic chunk type bytes; a valid uppercase
  reserved bit; checked length arithmetic; no truncated chunk; and no more than
  128 chunks;
- require one 13-byte `IHDR` first, one or more contiguous `IDAT` chunks, and
  one zero-byte `IEND` last;
- optionally allow at most one each of `sRGB` (1 byte), `gAMA` (4 bytes), and
  `pHYs` (9 bytes), only before `IDAT`; these facts are not exposed as Asset
  metadata;
- reject `PLTE` and `tRNS` in the first slice, all unknown/private ancillary
  chunks, all unknown critical chunks, duplicate/order violations, and any
  bytes after `IEND`;
- reject `acTL`, `fcTL`, or `fdAT` as animation, and reject `tEXt`, `zTXt`,
  `iTXt`, `iCCP`, or `eXIf` as unsupported metadata before decoder admission.

The first color/depth profile allows only 8-bit `Grayscale`, `RGB`,
`GrayscaleAlpha`, and `RGBA`. It rejects indexed color and 1/2/4/16-bit input.
This deliberately defers palette-optimized, grayscale transparency, and
high-bit-depth/scientific PNGs in exchange for a small testable surface.

All width, height, pixel, row, and output-size calculations must use checked
integer arithmetic. Width and height are independently bounded before checked
`width * height`; the decoder-reported output size is then independently
required to be at most 64 MiB. The decoder allocation limit is additional and
does not replace any Fielora-owned bound.

The admission result is a controlled internal value with only the exact
original bytes or an equivalent controlled handle, `content_sha256`,
`byte_length`, `width`, `height`, and fixed `media_type=image/png`. Decoded
pixels, source filesystem paths, EXIF, text, ICC, and arbitrary metadata do not
enter the Artifact semantic model, receipt, or Model context.

Future provider-neutral stable errors are:

- `PNG_INVALID`
- `PNG_UNSUPPORTED`
- `PNG_TOO_LARGE`
- `PNG_DIMENSIONS_EXCEEDED`
- `PNG_ANIMATED_UNSUPPORTED`
- `PNG_INTERLACED_UNSUPPORTED`
- `PNG_METADATA_UNSUPPORTED`
- `PNG_TRAILING_DATA`
- `PNG_DECODE_FAILED`

They must not include raw decoder payloads, source bytes, or unbounded metadata.

## DOCX_IMAGE_REALITY

```text
DOCX_PNG_WRITER_REALITY: SUPPORTED
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
- no production media reopen assertion or external PNG admission.

The test-owned Office PNG Reality Gate proves deterministic decompressed OPC
parts, exact embedded PNG bytes, internal-only relationships, `image/png`,
bounded inline extent, text semantic reopen, and one/two-image package
integrity. Repeated identical inputs create distinct sequential media parts;
the dependency does not deduplicate them. Missing image data is silently
omitted by the dependency, so a future Fielora adapter must reject it before
calling the writer.

Inline-only DOCX intent is sufficient for a first Document source-Asset
consumer. Floating, anchor, wrap, crop, and arbitrary geometry remain deferred.

## PPTX_IMAGE_REALITY

```text
PPTX_PNG_WRITER_REALITY: SUPPORTED
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
- current production structural validation ignores media, relationships,
  content type, geometry, count, embedded digest, and external media
  relationships.

The test-owned Office PNG Reality Gate proves one bounded positioned PNG,
exact decompressed OPC parts, exact embedded bytes, internal-only relationship,
`image/png`, picture-to-relationship binding, title semantic reopen, and stable
structural facts. Whole-PPTX ZIP byte identity is not promised: `office_oxide`
stores part relationship builders in a `HashMap`, so semantically identical
packages may order relationship ZIP entries differently. This does not alter
any decompressed part or parsed media/placement fact.

PPTX image placement must remain parent-layout-owned. A future typed block may
select a bounded layout slot and `CONTAIN`/`FILL` intent; it must not expose raw
EMU coordinates or XML to model content.

## OFFICE_PNG_MEDIA_REALITY_GATE_EVIDENCE

```text
OFFICE_MEDIA_STRUCTURAL_REALITY: PASS
DOCX_PNG_WRITER_REALITY: SUPPORTED
PPTX_PNG_WRITER_REALITY: SUPPORTED
EXTERNAL_PNG_SECURITY_ADMISSION: NOT IMPLEMENTED
ASSET_FOUNDATION: NOT IMPLEMENTED
PRODUCTION_API_DELTA: 0
NEW_DEPENDENCIES: 0
```

The fixed test-owned fixture is a nonblank 32 x 24 RGBA PNG with no EXIF,
external data, or animation. It is 133 bytes and has SHA-256
`168d44cf7d4439c70e924e5bd4c0a49e8be9afeff76732f28a265ea7da318c10`.

DOCX evidence:

- `word/media/image1.png`; two-instance behavior is separate
  `image1.png`/`image2.png` parts with separate valid relationships;
- exact `image/png` content type and exact source-byte digest;
- inline extent `1219200 x 914400` EMU;
- `word/document.xml` drawing binds the expected internal relationship;
- bounded ZIP/XML inspection plus independent `Document::from_reader` reopen
  preserves the surrounding heading/paragraph text.

PPTX evidence:

- `ppt/media/image1.png`, exact `image/png` and source-byte digest;
- slide picture binds the expected internal relationship;
- position `1000000,1500000` and extent `3200000 x 2400000` EMU;
- bounded ZIP/XML inspection plus independent `Document::from_reader` reopen
  preserves the slide title;
- repeated writes have identical decompressed part names and bytes; final ZIP
  entry order and whole-package byte identity remain outside this dependency
  guarantee.

The test-only relationship validator canonicalizes OPC targets and rejects
`TargetMode=External`, HTTP(S), `file:`, UNC, absolute/drive paths, and package
root escape. Existing Artifact export tests continue to own no-overwrite,
atomic failure, and no-partial-final behavior. These probes do not admit an
external PNG, create product image blocks, or change receipt/Verification
semantics.

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

## PNG_DECODER_DEPENDENCY_DECISION

```text
RECOMMENDED_PNG_DECODER: png
EXACT_VERSION: =0.18.1
FEATURES_SELECTED: default-features = false; no optional features
LICENSE: MIT OR Apache-2.0
MSRV: 1.73
CURRENT_FIELORA_RUST: 1.97.1
DEPENDENCY_DECISION: EXACT PIN ADDED / TARGETED VALIDATED
```

Exact candidate comparison on 2026-08-28:

| Candidate | Exact audited release | Relevant reality | Decision |
|---|---:|---|---|
| [`png`](https://docs.rs/crate/png/0.18.1) | `0.18.1` | PNG-only; crate forbids unsafe code; configurable internal limits, text/iCCP handling, CRC and Adler behavior; [fuzz targets](https://github.com/image-rs/image-png/tree/master/fuzz) and active image-rs maintenance | **Selected and exact-pinned for the authorized first Slice** |
| [`image`](https://docs.rs/crate/image/0.25.10) | `0.25.10` with defaults off plus PNG | umbrella image model/processing API; MSRV 1.88; adds non-PNG abstractions and dependencies; current [`DynamicImage::from_decoder` allocation-limit issue](https://github.com/image-rs/image/issues/3081) shows its `Limits` cannot be the sole admission boundary | Reject for minimum parser surface |
| [`zune-png`](https://docs.rs/crate/zune-png/0.5.2) | `0.5.2` | PNG-only and bounded axis options, but defaults include SSE, platform-specific SIMD uses `unsafe`, APNG is supported, and current header parsing stores/decompresses text and iCCP data | Reject for the first bounded-correctness slice |

The recommendation is conditional on Fielora owning the structural, resource,
metadata, static-image, trailing-byte, and output contracts. Safe Rust is not a
claim that malformed input cannot exhaust CPU or memory.

The exact `png 0.18.1` decoder configuration for the future implementation is:

- `png::DecodeOptions::set_ignore_checksums(false)`;
- `set_skip_ancillary_crc_failures(false)` so a permitted ancillary chunk with
  a bad CRC fails rather than being skipped;
- `set_ignore_text_chunk(true)` and `set_ignore_iccp_chunk(true)` as defense in
  depth after the raw scanner has already rejected those chunks;
- `png::Decoder::new_with_options`, then `set_limits(png::Limits { bytes: 64 MiB })`;
- `png::Transformations::IDENTITY`;
- `read_info`, independent bounds/output-size checks, exactly one complete
  `next_frame`, and `finish`.

The raw scanner still owns exact EOF after `IEND`, because decoder completion is
not the polyglot/trailing-data contract. The `png::Limits` byte budget is best
effort and excludes the caller-owned output allocation, so it is never the sole
resource control.

Current upstream risks reviewed for `0.18.1` and avoided by this closed profile:

- image-png issue [`#696`](https://github.com/image-rs/image-png/issues/696): text decompression may have no pixel-limit-equivalent
  cap; reject all textual chunks before decoder parsing;
- issue [`#699`](https://github.com/image-rs/image-png/issues/699): interlaced APNG subframe handling; reject both APNG and
  interlacing;
- issue [`#700`](https://github.com/image-rs/image-png/issues/700): chunk-ordering inconsistencies involving palette/transparency
  and color chunks; enforce Fielora ordering and reject `PLTE`/`tRNS`;
- issue [`#685`](https://github.com/image-rs/image-png/issues/685): a reported palette path panic; indexed/palette input is outside
  the first profile;
- issue [`#701`](https://github.com/image-rs/image-png/issues/701): a reported swallowed iCCP limit error; reject `iCCP` before the
  decoder and do not expose profiles.

An isolated, uncommitted exact-version probe built under Rust 1.97.1 and passed
5/5 deterministic tests. It proved repeated byte-identical valid RGBA admission;
strict IHDR/IDAT/permitted-ancillary CRC and zlib Adler rejection; pre-decode
rejection of APNG, text/iCCP/eXIf, private chunks, trailing payload, interlace,
indexed color, 16-bit color, zero/oversized dimensions; and fail-closed
truncation/malformed deflate behavior. The probe is evidence only and is not
production code.

## DEPENDENCY_IMPACT

```text
THIS_DOCS_ONLY_CANDIDATE_NEW_DEPENDENCIES: 0
TRANSIENT_CONTROLLED_SVG_NEW_DEPENDENCIES: 0
SAFE_EXTERNAL_PNG_ADMISSION_DEPENDENCY: REVIEWED / NOT PRESENT / NOT AUTHORIZED
RECOMMENDED_FUTURE_DIRECT_DEPENDENCY: png = "=0.18.1"
RECOMMENDED_OPTIONAL_FEATURES: NONE
SVG_TO_PNG_DEPENDENCY: NOT PRESENT / REVIEW REQUIRED
```

The isolated exact resolver produced this runtime tree:

| Crate | Exact version | Relation | License | MSRV |
|---|---:|---|---|---:|
| `png` | `0.18.1` | future direct | MIT OR Apache-2.0 | 1.73 |
| `bitflags` | `2.13.1` | direct dependency of `png`; already locked | MIT OR Apache-2.0 | 1.56 |
| `crc32fast` | `1.5.1` | direct dependency of `png`; already locked | MIT OR Apache-2.0 | 1.63 |
| `fdeflate` | `0.3.7` | direct dependency of `png`; **new to lockfile** | MIT OR Apache-2.0 | 1.67 |
| `flate2` | `1.1.9` | direct dependency of `png`; already locked | MIT OR Apache-2.0 | 1.67 |
| `miniz_oxide` | `0.8.9` | direct dependency of `png`; already locked | MIT OR Zlib OR Apache-2.0 | not declared |
| `cfg-if` | `1.0.4` | via `crc32fast`; already locked | MIT OR Apache-2.0 | 1.32 |
| `adler2` | `2.0.1` | via `miniz_oxide`; already locked | 0BSD OR MIT OR Apache-2.0 | not declared |
| `simd-adler32` | `0.3.10` | via `fdeflate`/`miniz_oxide`; already locked | MIT | not declared |

Only `png 0.18.1` and `fdeflate 0.3.7` would be new package entries; the
remaining exact versions already exist in the workspace lockfile. No duplicate
version split was introduced by the isolated resolver. The licenses are
compatible with the repository's current permissive runtime dependency set.

Repository-wide `cargo audit`/`cargo deny` tooling and binaries are absent, so
none was installed for this review. A read-only [OSV API](https://google.github.io/osv.dev/api/)
exact-version query for all nine packages above returned no matching advisories
on 2026-08-28. The upstream repository also showed no published GitHub Security
advisory for this crate at review time. This is a point-in-time advisory result,
not a guarantee that malformed input is safe.

Other families remain unapproved:

| Candidate | Use | License status for Fielora | Security impact | Alternative |
|---|---|---|---|---|
| pinned PNG-specific Rust decoder | PNG structure/decode/dimensions | `png 0.18.1` exact review passed; not installed | untrusted compressed-data parser in Core | reviewed Windows WIC adapter or no source raster |
| pinned general Rust image decoder | future PNG/JPEG | `image 0.25.10` license compatible but rejected here | larger codec/metadata attack surface | PNG-only dependency |
| pinned `resvg`/`usvg` family | controlled SVG -> raster | exact-version license not audited | new parser/rasterizer and font/resource policy | native SVG writer, repository-owned vector backend, or defer |
| Windows Imaging Component | OS decode/metadata | platform API; integration/legal review still required | Windows-only native boundary and codec variability | pinned Rust decoder |

No dependency is installed or added by this review. The recommendation is input
to a separately authorized implementation slice. Manual ad-hoc decoding is not
accepted as a shortcut around the reviewed decoder and Fielora scanner split.

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

Two implementation boundaries still prevent an immediate media consumer:

1. The Rust-side raster admission/decode primitive is now dependency- and
   contract-reviewed but remains unimplemented. Current UI magic checks and
   renderer dimensions still cannot be reused as durable authority.
2. DOCX/PPTX writer and bounded test reopen capability are proven, but no
   production Document/PPTX image semantic block, resolver, renderer adapter,
   or media reopen validator exists. A dependency writer returning `Ok` remains
   insufficient.

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
| This PNG dependency review | `LOW` | docs and isolated evidence only; no manifest, lockfile, product code, contract, or schema change |
| Future raster admission | `HIGH` | untrusted compressed content, dimensions/pixel bounds, checksums, privacy metadata, and parser dependency |
| Office media embedding | `HIGH` | package relationships/content types/geometry and exact reopen |
| Diagram derived composition | `MEDIUM / HIGH` | exact dependency snapshot plus renderer commitment; conversion remains high |
| SVG conversion/rasterization | `HIGH` | new parser/rasterizer/dependency and deterministic font/resource policy |
| UI | `DEFERRED` | no UI in this foundation or first backend Gate |
| This docs-only Candidate | `LOW` | no code, contract, schema, dependency, Frozen doc, or runtime change |

## FIRST_SLICE_RECOMMENDATION

Current options:

| Option | Value | Dependency / storage | Security / writer reality | Decision |
|---|---|---|---|---|
| A. admission + durable PNG/JPEG, no consumer | Low; unvalidated abstraction | migration + blob + decoder | writer foundation proven but no product consumer | Reject |
| B. Presentation -> durable PNG | High visual value | migration/blob/decoder | PPTX writer/reopen proven; product block and admission absent | Defer |
| C. Document -> durable PNG | Smallest real source-Asset consumer | migration/blob/PNG decoder | inline writer/reopen proven; admission and product block absent | **Preferred after gates** |
| D. Diagram -> Presentation transient | High composition value; no migration | needs safe SVG bridge | native SVG absent; rasterizer unreviewed | Blocked |
| E. Diagram -> Document transient | Medium value; no migration | same bridge | native SVG absent; rasterizer unreviewed | Blocked |
| F. metadata/storage only | Low; no consumer | migration/blob | creates empty abstraction | Reject |

```text
RECOMMENDED_FIRST_ASSET_SLICE: READY FOR SEPARATE AUTHORIZATION / NOT AUTHORIZED HERE
OFFICE_PNG_WRITER_REOPEN_PRECURSOR: PASS
SAFE_PNG_ADMISSION_DEPENDENCY_REVIEW: PASS
RECOMMENDED_PNG_DEPENDENCY: png = "=0.18.1"; no optional features
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

With the DOCX Gate and PNG dependency/security review complete, Option C is the
smallest real Asset slice: one Profile-owned immutable PNG, one typed inline
Document block, saved-revision DOCX export, no UI, no JPEG, no Diagram, no
floating layout, no new Tool family unless the actual admission workflow proves
one necessary. That implementation still requires explicit authorization,
dependency addition in its own changeset, a forward migration review, and the
full admission/security fixture suite below.

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

### Implemented source PNG admission evidence

- valid small RGB, RGBA, transparent, grayscale, and grayscale-alpha PNGs;
- invalid signature, wrong extension/magic mismatch, truncated IHDR/IDAT,
  duplicate critical chunk, missing/multiple IEND, malformed deflate;
- bad IHDR/IDAT/permitted-ancillary CRC and bad Adler;
- zero dimensions, oversized width/height, checked pixel overflow, small
  encoded/large declared dimensions, and oversized decoded output;
- APNG, text chunks, compressed text bomb, iCCP, eXIf, private/unknown chunks,
  interlace, indexed/palette, unsupported bit depth, trailing bytes, and PNG +
  ZIP polyglot rejected before the relevant unsafe/unbounded path;
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

1. How must portable profile include/restore semantics change so required Asset
   blobs cannot be omitted while their metadata and parent references are
   imported?
2. What bounded Presentation slot/fit semantics should precede any PPTX image
   block without exposing raw EMU geometry?
3. Is a future approved native Office SVG path sufficient to unblock transient
   Diagram composition, or must controlled SVG still pass an additional Office
   package-specific validator?
4. How long must old pinned renderer versions remain available for historical
   re-export, and what user-visible error applies when they are retired?
5. What dependency-aware retention projection is needed before Asset archive
    or GC, given immutable historical Artifact revisions?

## NEXT_DECISION

`A. ARTIFACT_ASSET_FOUNDATION_SUFFICIENT`
