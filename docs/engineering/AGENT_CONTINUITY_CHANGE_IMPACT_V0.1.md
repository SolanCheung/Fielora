# Agent continuous execution — Change Impact

2026-09-09 · Authorized correction after review of the first continuity candidate

User flow: investigate a coding problem, recover an unsuccessful edit, and
continue to a verified result without manually renewing every 24 steps.

- **Orchestration:** desktop normal/queued/retry requests use `max_steps: null`.
  Storage selects the existing 4096 cumulative circuit breaker; explicit 1–64
  step requests retain their exact limit. Checkpoints do not pause execution.
  Three/eight repeated unchanged observations request a different strategy;
  twelve repeated rounds pause. Distinct failures can add information, never
  proof of success. This is repetition detection, not semantic goal assessment.
- **Governance / Continuity:** overall windows allow 60 minutes of recorded
  model/tool execution, 2,000,000 input and 65,536 output tokens. Missing usage
  uses byte estimates; these are product defaults, not billing-grade accounting
  or empirically calibrated quality thresholds. Ledger replay preserves budgets
  across restart/approval. Only explicit user resume after resource exhaustion
  renews the window. Checks occur between bounded model/tool turns.
- **Context:** automatically reduce oversized history to original context,
  bounded receipt facts, separately labelled unverified model assessment, and
  complete recent tool exchanges. Preserve pinned images; no new summarizer,
  semantic plan authority or model-window-aware compression claim.
- **Verification:** action receipts and fresh revision-bound checks remain
  required. Unknown effects use existing reconciliation, not blind replay.
  Generic passing checks do not independently establish user-goal coverage.
- **Storage / compatibility:** existing candidate migration 0016 widens only
  the cumulative Run ceiling and preserves rows, IDs, indices and child refs;
  foreign keys are validated inside its transaction. No additional migration,
  credential, permission or Model contract. Old runs are not silently granted
  budget; old binaries require the pre-upgrade database backup for rollback.
- **Desktop:** resource/repetition pause reasons remain visible with Continue
  and Stop; normal long work retains the compact conversation layout.

Validation: default Composer run through step 27 with editing failure at 24 and
actual behavioral verification, no pause/resume; explicit limits, restart and
guarded edit recovery; resource exhaustion/replay/renewal; repeated-action escape;
complete reduced tool exchanges; migration preservation/rollback; Cross checks
and targeted packaged Electron smoke. Fixture-only, zero external model requests.
Real model quality, semantic compaction and general goal coverage remain unverified.
