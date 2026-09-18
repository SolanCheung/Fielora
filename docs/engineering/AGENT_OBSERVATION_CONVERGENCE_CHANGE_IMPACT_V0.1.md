# Agent observation convergence repair — 2026-09-13

User flow: continue a screenshot-guided UI correction, reach the actual control, use the rendered discrepancy to repair its source, and verify the requested result.

Confirmed production failures: empty CSS icon spans with a title were omitted from browser refs; new snapshot/capture identities counted as new progress on an unchanged page; every healthy page observation injected another instruction to inspect; transcript reduction discarded rendered text after the browser receipt/observation de-duplication. A model subsequently attributed observed mistranslations to cache and restored an unwanted field. The causal contribution of each prompt change to real-model performance remains unmeasured.

Repair within existing Model + Harness + Tools: expose bounded named/clickable DOM controls through existing refs, keep signature/hit-test/native-input checks; measure browser progress by observable page content rather than receipt IDs; preserve bounded rendered text during reduction; avoid redirecting a healthy observation back into another inspection. No new execution authority, state store, schema, migration, model dependency or bypass for stale input. No business-repository writes or production transactions.

Validation: replay redacted real tool receipts, negative tests for unchanged snapshots versus changed labels/actions, and real isolated Electron tests with the actual empty-span/CSS-icon markup and translation lookup behavior. These verify mechanisms, not real Qwen completion speed. Package the same source after Cross validation; retain original user data and previous deliverables.
