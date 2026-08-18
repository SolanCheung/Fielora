# Complete Agent V0.1 Automated Test Report

Date: 2026-08-18
Overall: **NOT_PASS**

## Passing gates

- TypeScript unit: 43 passed, 0 failed.
- Rust workspace: 42 passed, 0 failed.
- Core integration: 8 passed, 0 failed.
- Desktop Phase 02 dev regression: PASS.
- Agent Desktop Foundation: dev PASS, packaged PASS, fresh-extracted portable PASS.
- Packaged upgrade-collision/single-instance lifecycle: PASS.
- Release Core build and Windows x64 Electron package: PASS after using the already cached Electron 43.4.0 ZIP following one mirror `ECONNRESET`.

The Agent Desktop E2E proves native tool proposal, one-time approval, a real project file write, command verification, persisted assistant output, timeline rendering, and restart recovery. Machine evidence is in `DEV_DESKTOP_FOUNDATION_ACCEPTANCE.json`, `PACKAGED_DESKTOP_FOUNDATION_ACCEPTANCE.json`, and `PORTABLE_DESKTOP_FOUNDATION_ACCEPTANCE.json`.

## Non-passing gates

- `pnpm verify:premerge`: FAIL at the historical Browse E2E native Chromium Ctrl+C/Ctrl+V round trip. Contracts, TypeScript, Rust, clippy, Core integration, and Phase 02 Desktop E2E had passed earlier in the same run. The clipboard assertion was not skipped or weakened and failed again in targeted reruns.
- Live-provider probe: NOT_RUN because no eligible credential/model was explicitly authorized.
- Golden model-quality tasks: NOT_PASS. Deterministic harness/security/recovery tasks are recorded individually, but model-dependent coding quality, compaction-and-continue, and no-native-tool proposal fallback remain open.

Therefore `FIELORA_COMPLETE_AGENT_V0.1: ENGINEERING_PASS` is not asserted.
