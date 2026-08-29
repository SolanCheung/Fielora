# Rich Result Inline Image Foundation — Change Impact V0.1

Status: AUTHORIZED / IMPLEMENTATION INPUT
Date: 2026-08-29

## Proposed change

Extend the existing provider-neutral `ResultReference` sidecar with one `IMAGE`
target backed only by an active durable Library image. A completed Assistant
Markdown result may place that image at an exact controlled marker. The existing
Markdown renderer and image Lightbox remain the presentation mechanisms.

Conversation attachments, Browser/E2E screenshots, Verification screenshots,
remote images, Evidence references, and Durable Artifacts remain outside this
slice because none currently provides the required durable typed identity and
viewer contract.

## Affected contracts and modules

- Add `IMAGE` metadata to `ResultReferenceTarget` and Library-object provenance.
  The sidecar stores `LibraryObjectId`, expected SHA-256, and validated raster
  MIME; Markdown never stores an absolute path or LibraryRoot-relative blob path.
- Reuse the existing `conversation_messages.references_json` column. There is no
  schema version change, migration, blob copy, or second attachment table.
- Add a bounded trusted Desktop preview query that resolves the current
  `LibraryObject`, current LibraryRoot, and content-addressed blob at read time.
- Extend `MarkdownMessage` with one exact block marker and adapt the existing
  image Lightbox input. File, code-range, and Web reference behavior is unchanged.

## Persistent data and compatibility

- Historical messages continue to decode as before. New binaries can decode the
  additive `IMAGE` variant; malformed or unknown sidecars keep the existing
  fail-soft empty-reference behavior.
- Message creation accepts an image reference only for a completed Assistant
  message and only when its active Library object, media kind, MIME, blob binding,
  and expected content hash agree.
- LibraryRoot migration keeps both LibraryObject identity and `blob_ref` stable;
  preview resolution always uses the current root. A tombstone or unavailable
  blob degrades only the image block, not the surrounding Markdown result.

## Security and invariants

- The preview boundary admits only bounded PNG, JPEG, and WebP bytes whose magic,
  stored MIME, size, blob binding, and SHA-256 all agree. SVG and HTML are not
  enabled. Symlinks, traversal, paths outside LibraryRoot, arbitrary `file://`,
  and automatic remote fetch are rejected.
- Plain Markdown cannot activate an image. Rendering requires both an exact
  `fielora-reference:resultref_*` marker and the matching durable `IMAGE` sidecar.
- The change does not alter the Agent loop, Narrative/Activity presentation,
  approvals, verification authority, Artifact identity, Browser policy, or the
  existing File/Code/Web target semantics.

## Hero flows, verification, and rollback signals

- Deterministic completed Agent result: paragraph, inline Library image marker,
  paragraph, then existing File/Code/Web references; verify placement, Lightbox,
  reload, Core restart, and LibraryRoot migration.
- Negative gates cover missing sidecar, forged object identity, absolute/file URL,
  wrong MIME, missing blob, hash mismatch, tombstone, unsupported SVG, traversal,
  and root escape. Markdown structure and existing typed references remain intact.
- Stop on any trusted image without a sidecar, path/root leakage into Markdown,
  remote image fetch, new screenshot capture service, attachment persistence
  refactor, second viewer, or schema migration.

## Bounded status

- `LIBRARY_IMAGE = IMPLEMENTED / VALIDATED`
- `ATTACHMENT_INLINE_RESULT = PARTIAL / DEFERRED`
- `SCREENSHOT_RESULT = DEFERRED`
- `EVIDENCE_REFERENCE = DEFERRED`
- `DURABLE_ARTIFACT = DEFERRED`
- `REMOTE_IMAGE = DEFERRED`
- `RICH_RESULT_AST = DEFERRED`
- `DXE = DEFERRED`
