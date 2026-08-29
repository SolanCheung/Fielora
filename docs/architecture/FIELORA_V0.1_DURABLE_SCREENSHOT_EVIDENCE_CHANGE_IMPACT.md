# Fielora V0.1 Durable Screenshot Evidence — Change Impact

Status: IMPLEMENTATION BOUNDARY / 2026-08-30

## User flow

The trusted Desktop captures the current visible Browser page, persists validated PNG bytes in the existing `LibraryRoot` content-addressed store, creates an independent durable `ScreenshotEvidence` record, and resolves a completed Markdown `IMAGE` reference through the existing inline image and Lightbox presentation.

## Contract and storage impact

- Add `ScreenshotEvidenceId`, a closed `BROWSER_VIEWPORT` source, durable content/capture/provenance fields, and explicit `INTERNAL`, `LOCAL_EVIDENCE`, `EXCLUDED`, `LOCAL_ONLY`, `ACTIVE` classifications.
- Add additive SQLite migration 0014 with Profile ownership and optional Conversation/Run/Tool/Verification foreign keys. Storage validates cross-run provenance; screenshot existence never supplies a verification outcome.
- Extend existing ResultReference `IMAGE` source with `SCREENSHOT_EVIDENCE`; preserve the historical `LIBRARY` wire value and existing marker/parser.

## Security and privacy impact

- Capture is available only through the trusted Desktop bridge and only for the active, visible, BrowserRuntime-managed page. Product code uses Electron `capturePage`, never CDP, and rechecks page identity plus navigation generation after capture.
- PNGs are fixed-format, time/byte/dimension/pixel bounded and pass the existing PNG admission plus `ContentBlobStore` integrity boundary before persistence.
- Screenshot records are hidden from Library, excluded from Portable Profile and local-only. Portable export changes from a LibraryRoot directory scan to an eligible LibraryObject/Artifact Asset manifest so evidence bytes cannot leak through `include_library=true`.

## Compatibility and verification

- Migration is additive and transactional; old ResultReference JSON remains readable through optional source-specific identity fields.
- Portable snapshots remove screenshot records; missing imported screenshot references fail soft as `图片不可用` while surrounding Markdown remains.
- Targeted contract, migration, persistence/restart, relation, capture guard/bounds/cancel/timeout, blob/migration, Portable, sync, renderer and one deterministic Desktop E2E are required.

Out of scope: Agent screenshot tools, automatic/full-page/window/desktop capture, Library promotion UI, Evidence Viewer, Artifact identity, attachment migration, Cloud Sync, DXE, new runtime, new blob store, parser or image viewer.
