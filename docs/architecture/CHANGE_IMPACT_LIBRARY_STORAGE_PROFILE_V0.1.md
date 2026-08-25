# Change Impact — Library, Storage Roots, Portable Profile

Status: IMPLEMENTATION-SCOPED / V0.1

## User flow

The fixed navigation converges on New conversation, Now, and Library. A user can
save local files or the current safe Browser page to Library, inspect and move
Fielora data/library roots, clear disposable cache, and export or import a
versioned `.fielora` profile. Browser-specific settings are entered from the
Browser's own overflow menu rather than the global settings category list.

## Current facts and boundaries

- The authoritative SQLite database is currently `<DataRoot>/fielora.db` and
  contains Project/Conversation plus the Agent run/event/tool/approval/
  verification ledger. WAL and SHM are SQLite-managed sidecars of that file.
- Device identity and device-local root selection stay outside portable profile
  data. Provider secrets remain exclusively in Windows Credential Manager.
- Vector index, durable Search/Internal index, a Library blob store, and durable
  Browser history/bookmarks are currently `NOT_PRESENT`.
- Project identity is the existing Field ID; its path remains a device binding.
  This change does not create a second Project identity.

## Schema and compatibility

Migration 0007 is additive. It adds one stable profile record, Library metadata,
and a separate sync change journal. Library deletion is a tombstone; prior
tables and Agent event immutability are unchanged. Existing databases migrate
in place through the existing checksum registry.

## Safety

- Library files live outside SQLite under LibraryRoot and are addressed by
  SHA-256-relative blob references.
- DataRoot migration stops Core before copying the WAL database, validates the
  closed copy, switches the machine-local root locator, and restarts Core. The
  source is retained; failure restarts from the source.
- LibraryRoot migration copies and verifies size/hash before switching. The
  source is retained.
- Portable export includes normalized AppPreferences, is checksummed, and excludes credentials, Browser sessions,
  device bindings, absolute machine paths, cache, and temporary runtime state.
  Import validates in a temporary directory before swapping durable data and
  retains a rollback copy. Provider configuration metadata is retained but an
  active provider is restored disabled until its credential is authorized on
  the new device.
- Sync is provider-neutral but disabled. No implementation performs a network
  request.

## Verification

Use targeted Rust storage/platform tests, targeted TypeScript storage/archive
and navigation tests, desktop typecheck, and the focused Library desktop flow.
No live model/provider request or broad phase/package gate is required.
