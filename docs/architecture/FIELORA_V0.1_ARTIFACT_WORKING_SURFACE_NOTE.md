# Fielora V0.1 Artifact Working Surface Note

**Status:** IMPLEMENTED FACTUAL NOTE

**Architecture:** existing `Model + Harness + Tools`

**Change Impact:** HIGH

**Database schema:** 11 (unchanged)

## Product path

```text
Project Conversation
  ↕ durable ToolCall / receipt
existing RightWorkspaceDock
  ├─ Artifact catalog
  └─ artifact:<ArtifactId> tabs
       ├─ CURRENT exact revision
       └─ PINNED HISTORICAL exact revision
```

The Working Surface is a read/inspect surface with chat-driven mutation. It is
not a new Desktop runtime, top-level product page, Artifact editor, Model Tool,
or persistence system. Tabs and selected slide/sheet are session-local UI state.
Artifact identity, revision, history, composition and archive truth remain in
the existing Durable Artifact Core.

## Desktop boundary

The added FIPC methods are bounded trusted Desktop read/mediation operations:

- list, exact read and metadata-only history use existing Profile-scoped
  storage semantics;
- PNG preview resolves one Asset by `AssetId + expected digest`, rechecks the
  bounded content blob and strict PNG admission, and returns no storage path;
- Diagram preview reads one exact revision, uses the existing deterministic
  renderer and structural reopen validation, and is displayed as an image;
- archive/restore creates a zero-Model human-command AgentRun and executes the
  existing `artifact.set_archive_state` Tool through Policy, ToolExecutor and
  durable receipt/recovery semantics.

No generic blob reader, filesystem path, export-on-open, or second mutation path
was introduced.

## Agent context boundary

When an Artifact tab is active at send time, Renderer supplies bounded selection
metadata. Core re-resolves the same Profile Artifact, exact viewed/current
revisions, archive state and optional slide/sheet before accepting it. The
validated fact is bound to `RunCreated`, included in the request Context Snapshot
manifest/digest, and available to subagent orchestration as metadata.

The selection is trusted application context. Artifact semantic content remains
`UNTRUSTED_ARTIFACT_CONTENT`; blocks, slides, cells, graph, history, Asset bytes,
digests and paths are not automatically inlined. Content must be obtained through
the existing `artifact.read` Tool when needed. HISTORICAL identifies an immutable
view and never implies in-place mutation authority.

## Implemented surfaces

- Document: heading, paragraph, bullets, table, exact SpreadsheetRange and PNG.
- Presentation: slide navigation, basic semantic layouts and PNG.
- Diagram: existing controlled deterministic SVG through `<img>`.
- Spreadsheet: sheet tabs and a fixed 20×10 sparse viewport for literal cells.
- History: metadata-first list with lazy exact revision reads.
- Lifecycle: foreground create auto-open, CURRENT update refresh, historical
  pin/new-version notice, archive/restore, close/reopen and durable restart reopen.

## Deferred

Direct manipulation editors, formula/calculation UI, charts, slide designer,
diagram canvas editing, full Office parity, workspace-tab persistence and global
visual redesign remain outside this changeset.
