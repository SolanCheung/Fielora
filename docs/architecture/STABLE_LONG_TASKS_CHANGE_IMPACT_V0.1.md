# Stable Long Tasks Minimum Closure — Change Impact V0.1

Status: IMPLEMENTATION-BOUNDED

## Scope

This change completes the minimum reliable interruption/restart loop inside
`Harness.Continuity` and `Harness.Execution`. It reuses the existing AgentRun,
AgentEvents, ToolCalls, Approvals, tool receipts, and verification receipts.
It does not add another runtime, state store, permission system, or product
surface.

## Durable and safety impact

- Add a Core pause command and safe-boundary pause signal; cancellation remains
  independent and continues to retain already-observed mutations and evidence.
- Expand startup recovery events so interrupted tools are durably recorded as
  `UNKNOWN`, never inferred successful or blindly replayed.
- Reconcile unknown workspace writes through the existing Tool backend using
  contained path/hash evidence. Read-only work may be retried; interrupted
  verification must run fresh; Git, network, destructive, or divergent unknown
  execution fails safely instead of replaying.
- Bind verification-eligible process receipts to a deterministic current
  workspace revision. A later mutation or changed affected file makes the old
  verification stale and blocks completion.
- Skip duplicate non-repeatable tool proposals only when an existing durable
  successful receipt proves the same tool and arguments already completed.

## Compatibility

No schema or migration change is required: tool receipt JSON and immutable
Agent event payloads already carry bounded reconciliation and revision facts.
The provider-neutral Model contract is unchanged. Existing terminal Run states,
Approval nonces, project containment, symlink protection, SHA guards, policy
separation, and FULL_CONTROL invariant safety remain in force.

## Verification

Only Agent lifecycle, continuity, storage recovery, Approval, tool receipt,
verification freshness, and Coding Agent integration tests are in scope. UI,
Browse, packaging, and real Provider gates are excluded.
