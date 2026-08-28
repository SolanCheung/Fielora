# IDR V2 Storage Change Impact

Date: 2026-08-28  
Status: `IMPLEMENTED CANDIDATE / NOT FROZEN / TARGETED VALIDATED`

## Change

- Add one additive migration to the existing Fielora DataRoot SQLite database.
- Add seven IDR tables for singleton aggregate revision, typed Human Model
  items, transition history, normalized provenance, Reality references, and
  minimal erasure tombstones.
- Add a provider-neutral local storage API for admitted Human Model mutations.
- Keep Resolver, Context, Agent, Model extraction, UI/FIPC, Eval, sync, FTS,
  vectors, embeddings, and multi-user behavior absent.

## Security and authority invariants

- IDR remains `Harness.IDR`; storage grants no Permission or Reality authority.
- Payloads are closed/versioned/bounded; unknown structures and versions fail
  closed. Durable items require provenance.
- No credential, secret-specific field, transcript body, Provider response,
  hidden reasoning, file body, or webpage body is introduced.
- `ERASE_IF_ALLOWED` proves application-level semantic erasure only. It does
  not claim physical-sector secure deletion, forensic zero recoverability, or
  legal compliance.
- Existing Agent behavior and `agent_context_snapshots` remain unchanged.

## Migration and rollback

- Resolve the next free migration ordinal at implementation time; current
  audit resolves IDR to schema version 12.
- Migration is additive and starts at aggregate revision 0 with zero items.
- Any migration/mutation failure rolls back tables/relations/history/revision
  atomically. A successful production migration has no automatic destructive
  down migration; rollback requires a compatible binary or verified backup.

## Required proof

- Clean/existing upgrade, registry/checksum/reopen, forced migration rollback.
- Kind/payload/basis/confidence/lifecycle/revision constraints.
- Atomic correction/supersession and stale-write rejection.
- Shared provenance retention/GC, reset, item-ID non-reuse.
- High-entropy sentinel occurrences across all IDR tables after erase: zero.

## Result

- Resolved migration: `0012_idr_v2_human_model`; existing schema 11 upgrades
  atomically to schema 12 and reopens with revision 0 / zero items.
- Seven tables and six required indexes are present; forbidden optional IDR
  tables, FTS, vector, embedding, Profile/User rows, and new dependencies are
  absent.
- Forced migration and mid-correction failures roll back physical objects,
  registry rows, item/history/relation effects, and aggregate revision.
- Terminal states are protected by the typed repository (`REPOSITORY_ONLY`),
  avoiding a second trigger-based lifecycle runtime.
- IDR semantic sentinel occurrences after `ERASE_IF_ALLOWED`: `0` across all
  IDR semantic/history/provenance/relation/tombstone tables.
- This is application-level semantic erasure, not disk-sector secure deletion,
  zero forensic recoverability, or legal deletion certification.

`DEPENDENCY_CHANGE: NONE`
