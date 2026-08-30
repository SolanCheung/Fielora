# Fielora V0.1 Durable Actionable File Artifact — Change Impact

Status: IMPLEMENTATION BOUNDARY / 2026-08-30

## User flow

A successful built-in Coding Agent file mutation commits one immutable revision to the existing durable Artifact lineage. Completed Changed Files and Review read the exact before/after bytes from the existing content-addressed store after reload or Core restart, show when the workspace changed later, retain a minimal reviewed state, and offer only hash-guarded undo through the existing PolicyEngine and ToolCall lifecycle.

## Contract and storage impact

- Extend the closed Artifact contract with `FILE_MUTATION` content containing a bounded operation plus project-relative before/after states. Absolute paths are never Artifact identity.
- Add migration 0015 relation tables for stable Project-file binding and per-revision `UNREVIEWED`/`REVIEWED` projection. These extend migration 0008; they do not create a second Artifact or revision system.
- Rebuild only `artifact_revisions` to replace the historical global `created_by_tool_call_id` uniqueness with `(created_by_tool_call_id, artifact_id)`, allowing one atomic multi-file ToolCall to append at most one revision to each existing Artifact.
- Exact before/after bytes use the existing shared `ContentBlobStore`; eligible file-revision owners are added to the existing Portable manifest. No blob deletion or sync journal entry is introduced.

## Governance and safety impact

- Only successful, receipt-backed built-in `create_file`, `write_file`, `replace_text`, `apply_patches`, bounded `delete_file`, and `restore_file` executions can commit file Artifact revisions. Failed, denied, cancelled, proposal-only, and uncommitted unknown calls cannot.
- Undo mediates a new normal `delete_file`, `restore_file`, or text `create_file` ToolCall through the existing PolicyEngine. Its existing hash/existence guard is the final race-safe check; stale revisions cannot overwrite newer work.
- Undo appends another immutable Artifact revision and never removes history. MOVE remains deferred until stable path-transfer identity can be represented without ambiguity.
- Existing `VerificationSubject::ArtifactRevision` remains the only exact verification binding. Artifact creation and review state never imply PASS.

## Compatibility and verification

- Migration 0015 is transactional, preserves every migration-0008 revision and provenance field, restores foreign-key enforcement, and runs `foreign_key_check` plus the current schema gate.
- File Artifact identity is Profile + stable Project/Field identity + normalized relative binding. Project rebind changes only the device-local root.
- Targeted contract, migration, persistence/idempotency, restart review, stale/undo, verification freshness, Portable eligibility, renderer, and deterministic fixture coverage are required.

## Operation support

| Operation | Review | Undo |
| --- | --- | --- |
| CREATE | FULL | FULL |
| MODIFY / REPLACE / APPLY | FULL | FULL |
| DELETE | FULL for captured bounded content | PARTIAL (bounded, text-safe restore only) |
| MOVE | DEFERRED | DEFERRED |
| RESTORE | FULL | FULL |

Review state is durable across reopen and restart. Applicability is recomputed as
`CURRENT` or `CHANGED_SINCE` without changing historical revision truth. Undo is
hash guarded and appends a new revision through the existing PolicyEngine,
ToolCall, and ToolRuntime path. Verification binds only to the exact
`VerificationSubject::ArtifactRevision`; creation or `REVIEWED` never implies
PASS. Recovery and Project-root relink preserve the existing Artifact and
revision identities because binding uses stable Project identity plus relative
path.

Out of scope: Agent Turn presentation redesign, Screenshot/Library conversion, MOVE undo, binary delete undo, Cloud Sync, GC, generalized Artifact types, a new runtime, database, or blob store.
