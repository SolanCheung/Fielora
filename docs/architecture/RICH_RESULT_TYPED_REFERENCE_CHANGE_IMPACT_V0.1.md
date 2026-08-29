# Rich Result Typed Reference Foundation — Change Impact V0.1

Status: AUTHORIZED / IMPLEMENTATION INPUT
Date: 2026-08-29

## Proposed change

Keep `ConversationMessage.content` as the completed Markdown document and add a
bounded typed-reference sidecar for trusted Project files, code ranges, and
existing HTTPS references. The existing Markdown renderer and Fielora-native
file/editor/Browser surfaces remain the only presentation and navigation
mechanisms. Evidence references remain deferred because there is no stable
identity-addressable Evidence Viewer.

## Affected contracts and modules

- Add a provider-neutral `ResultReference` contract and an optional/default-empty
  `references` field to Conversation message create/view contracts.
- Extend Conversation message persistence with one additive JSON column and a
  forward-only migration; historical rows read as `references: []`.
- Extend `MarkdownMessage` only with an opaque controlled-marker lookup backed by
  the sidecar. Plain Markdown paths and links cannot create typed behavior.
- Reuse `ProjectWorkspace.openFile`, the existing code editor, `ReferenceView`,
  and `BrowserRuntime.navigate`; add only a bounded line-range reveal input.

## Persistent data and compatibility

- Migration 0013 adds `conversation_messages.references_json` with a non-null
  empty-array default. No existing identity, row, or Markdown content is rewritten.
- Writes validate reference shape, same-Conversation Project scope, relative-path
  syntax, line bounds, HTTPS-only Web targets, and existing Reference identity.
- Old databases migrate transactionally; old messages and callers remain valid by
  using an empty reference list. Rollback requires restoring a pre-upgrade database
  copy; older binaries must not open a schema-13 database.

## Security and invariants

- Absolute paths, traversal, cross-Project targets, unsafe schemes, raw HTML, and
  shell opening are rejected. Durable file identity is Project/Field ID plus a
  normalized project-relative path, never a device path.
- The renderer activates a typed marker only when the durable sidecar contains the
  matching reference. Model/plain Markdown text is untrusted and cannot self-grant.
- Web activation stays behind the current trusted Desktop bridge and Browser policy;
  no external navigation policy or remote WebContents permission is widened.
- This change does not alter the Agent loop, Activity/Narrative chronology,
  approvals, verification authority, private reasoning, or artifact identity.

## Hero flows, verification, and rollback signals

- New completed result: persist Markdown plus File/Range/Web references, reopen the
  Conversation (including Core restart), render in place, then navigate through the
  existing Fielora surfaces.
- Historical result: Markdown without sidecar renders unchanged.
- Required targeted gates: contract generation/freshness, invalid-reference negative
  cases, schema-12 migration/reopen, storage round-trip, Markdown spoofing/regression,
  Project file/range reveal, Browser routing, deterministic Rich Result fixture,
  relevant Rust/TypeScript/lint, and `git diff --check`.
- Stop on migration checksum/compatibility failure, any path escape, typed behavior
  without sidecar, editor replacement, or Browser policy expansion.

## Closeout status

- `PROJECT_FILE = IMPLEMENTED / VALIDATED`
- `CODE_RANGE = IMPLEMENTED / VALIDATED`
- `WEB_REFERENCE = IMPLEMENTED / VALIDATED`
- `EVIDENCE_REFERENCE = DEFERRED`
- `INLINE_IMAGE_SCREENSHOT = DEFERRED`
- `DURABLE_ARTIFACT = DEFERRED`
- `RICH_RESULT_AST = DEFERRED`
- `DXE = DEFERRED`
