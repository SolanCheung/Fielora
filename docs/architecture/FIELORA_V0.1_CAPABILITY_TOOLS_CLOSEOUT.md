# Fielora V0.1 Capability / Tools Closeout

**Status:** `IMPLEMENTED / TARGETED VALIDATED`

**Date:** 2026-08-28

**Baseline:** `phase/complete-agent-v0.1@eeda8aa52e2cd8f3b59e163b5d7f52a8b2dc49e8`

**Database schema:** `11`

This document records the bounded V0.1 capability closeout. It does not modify
the Frozen architecture or create a new Runtime, permission vocabulary, receipt
hierarchy, verification engine, UI surface, or extension framework. All new
executable capabilities remain ordinary Tools in the canonical
`Model + Harness + Tools` architecture.

## Implemented reality

| Capability | Current production fact |
|---|---|
| Presentation PNG Asset | Closed `PresentationBlock::IMAGE` accepts only an exact durable `ArtifactAssetRefV1` and `CONTAIN` intent. Create/update reuse the generic Artifact Asset resolver. Saved export pins the exact Presentation revision and immutable Asset blob snapshot, writes PNG media through the existing PPTX writer, and independently reopens the final package/media graph. |
| `artifact.list` | `OBSERVE`; Profile-scoped keyset order by `(updated_at DESC, ArtifactId DESC)`; default 20, maximum 100; metadata only; archived Artifacts hidden unless explicitly requested. |
| `artifact.history` | `OBSERVE`; exact Profile-owned Artifact; descending bounded revision metadata, default 20 and maximum 100; semantic content remains available only through `artifact.read(artifact_id, revision_id)`. |
| `artifact.set_archive_state` | `WORKSPACE_WRITE`; one typed archive/restore Tool through existing Policy/Approval/ToolCall/receipt/recovery. Archive is reversible visibility metadata, not deletion. Identity, revisions, explicit reads/exports, and exact composition references remain valid. |
| Asset metadata | Existing Profile-scoped internal `read_asset`/resolver remains the semantic owner. No Model-facing Asset list/history/binary/blob-path Tool was added. |
| Capability status | Reports current Artifact management, durable Presentation PNG, `web.search`/`web.fetch`, and the explicit `web.download` limitation without claiming unsupported behavior. |

Migration `0011_artifact_archive_state` adds only `archived_at` and the minimal
ToolCall idempotency/recovery facts to the existing `artifacts` envelope, plus a
Profile/archive/update index. It adds no table and does not alter Artifact
revision content, identity, current pointer, composition, Verification subject,
or content schema version.

## Presentation media boundary

```text
saved Presentation revision
  -> generic exact Asset resolver (same Profile / exact ref facts)
  -> controlled content blob length + SHA-256 + static PNG revalidation
  -> immutable render snapshot
  -> existing office_oxide PPTX writer
  -> shared bounded Office package admission
  -> internal slide relationship + p:pic + image/png + placement + SHA reopen
  -> existing durable ToolCall receipt / no Verification PASS
```

The semantic contract does not accept paths, URLs, base64, raw bytes, SVG,
LibraryObject references, EMU coordinates, arbitrary geometry, or OOXML. `FILL`
is not exposed because the current writer does not provide a crop semantic that
can be independently validated without stretching.

## Web download audit

`web.download` is **deferred as `WEB_DOWNLOAD_DEFERRED_POLICY_MODEL`**. The
production Tool contract has one `AgentToolEffect` per invocation. A download
to the Project necessarily combines `NETWORK` authority with
`WORKSPACE_WRITE`; labeling it as either one would bypass the other governance
boundary. This changeset does not add a composite effect, permission enum,
combined approval protocol, or a Tool that writes under a Network-only grant.

Existing `web.search` and `web.fetch` remain available and retain public-IP DNS
validation, address pinning, redirect re-admission, bounded response handling,
untrusted-content authority, existing receipts, and no Verification PASS.
`file.extract` and `artifact.asset.import` remain separate local Project-file
consumers. There is no hidden shell/browser workaround.

## Production Tool catalog audit

The built-in catalog contains 34 bounded Tools after this changeset. The Web
provider contributes the existing two stable Network Tools; user-configured MCP
Tools appear only after explicit run-scoped activation. Provider admission
remains capped at 16 providers and 32 Tools per provider. Core continues to
filter Model-visible Tools by task class, permission, execution phase, and
verification state; Skills remain metadata-first/lazy and MCP activation remains
run-scoped. The current catalog size does not justify vector search, embeddings,
or another registry/index Runtime.

Domain audit result:

| Domain | V0.1 reality |
|---|---|
| Project/File | Bounded list/read/stat/search, guarded create/update/move/delete/restore, PDF/DOCX/PPTX/XLSX extraction are sufficient for current flows. |
| Git/Coding | Read, exact/batched guarded edits, typed stage/unstage/branch/commit/push, command/test and Verification closure are present. |
| Web | Search/fetch are present; download is the known composite-policy gap. |
| MCP | Local stdio, user config, run activation, bounded discovery and credential binding are present; remote/OAuth are deferred. |
| Artifact/Asset | Typed durable create/read/update/list/history/archive/export, composition, strict PNG import, Document/PPTX embedding and historical export are present. |
| Skill/Plugin | Built-in/project/third-party/declarative Plugin Skill contribution uses the existing lazy Context path; executable Plugin contribution is deferred. |

No additional general-purpose Tool met all six admission rules in this
changeset. Further capability work is demand-driven.

## Deferred capability set

- `web.download` until existing governance can honestly authorize a combined
  Network + Project mutation;
- remote MCP, OAuth, executable Plugin host/ToolProvider/Marketplace, and
  generic API/CLI/Native adapter frameworks;
- JPEG/WebP/GIF/TIFF/external SVG Assets, SVG rasterization, Asset delete/GC;
- Spreadsheet formulas/calculation, pivot tables, charts, Office import or
  bidirectional sync;
- OCR, image understanding, arbitrary archives, media/CAD intelligence;
- Artifact UI, Asset manager, Presentation editor, and download UI.

These are explicit V0.1 exclusions or demand-driven work, not blockers to the
current capability sufficiency decision.

## Targeted evidence

- affected Rust suites: Agent `124/124`, Office writer probe `8/8`, Contracts
  `2/2`, Core `29/29`, Storage `26/26`;
- Presentation history fixture proves `R1 -> PNG A`, `R2 -> PNG B`, then exact
  exports `R1/A`, `R2/B`, `R1/A` with production media reopen;
- Core pipeline fixtures prove Presentation create/export, metadata-only list
  and history, archive/restore approval and receipt boundaries, archived child
  composition export, and lifecycle commit-before-receipt recovery;
- migration fixture proves schema-10 data survives forward migration 0011 and
  failed migration rolls back registry and columns atomically;
- generated TypeScript, Core integration, Core/Cross/Docs development lanes,
  Clippy `-D warnings`, formatting, context audit, diff check, and release Core
  build form the final targeted Gate for this changeset.

Full PreMerge, Desktop Browser E2E, UI/visual, packaged, portable, live network,
and Model probes are outside this backend-only closeout and are not used as
evidence.
