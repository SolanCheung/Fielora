# Complete Agent Change Impact V0.1

Status: IMPLEMENTED / REVIEWED
Date: 2026-08-18

> Compatibility context (2026-08-24): this document records the schema 6
> implementation impact. Canonical Agent ownership and terminology now follow
> `FIELORA_V0.1_AGENT_ARCHITECTURE_SPEC.md`. Approval-routing details that
> were later changed by D-250 are historical here; invariant safety, typed
> receipts, and fresh verification remain mandatory under every permission.

## Scope

This change introduces the first durable Fielora Agent execution system. It adds schema version 6, a provider-neutral model/tool loop, controlled project tools, approvals, verification receipts, crash recovery, bounded read-only subagents, and the corresponding Desktop bridge and UI.

## Data and compatibility

- Migration `0006_complete_agent.sql` adds Agent-only tables; it does not rewrite Project, Conversation, Field, Capture, Requirement, Artifact, or historical evidence rows.
- Existing databases migrate forward transactionally. Migration registry checksum and reopen/idempotence tests remain mandatory.
- `AgentEvent` is append-only. Mutable `AgentRun` and `AgentToolCall` rows are projections/runtime records, not Reality truth.
- Rollback is application-version rollback plus restoration from a pre-upgrade database copy. Schema 6 rows are intentionally not down-migrated in place.

## Security and permission impact

- Renderer remains an untrusted client and does not receive provider credentials or direct filesystem/process authority.
- Credentials remain in Windows Credential Manager and enter only the Core provider boundary.
- Tool effects are typed. Observe, workspace write, process, network, and destructive operations are evaluated separately from model/provider selection.
- Review mode asks for mutating/process actions; destructive and network effects ask even under full-control. Approval nonce consumption prevents replay.
- Project paths are canonicalized and checked for traversal/symlink escape. Writes use expected hashes, checkpoints, atomic replacement, and bounded payloads.
- Commands are program plus argv, run under a sanitized environment and Windows Job Object, and support timeout/cancel of the process tree.
- Tool observations and external model text are treated as untrusted data; output and context are bounded/redacted.

## Operational impact

- Startup reconciles incomplete tools to `UNKNOWN` and active runs to `PAUSED`; non-idempotent work is never automatically replayed.
- Any later workspace mutation invalidates an earlier command verification. A new successful command receipt is required before completion.
- Large/binary shared artifact workflows remain explicitly unsupported instead of being emulated through unsafe generic file or shell calls.

## Validation and rollback signals

Release must stop on migration checksum mismatch, protocol mismatch, failed package Core inclusion, failed Agent Desktop E2E, or a security/fault matrix regression. The current full premerge gate is not green because the historic Chromium native clipboard regression fails in this Windows desktop session; this is recorded without weakening the assertion.
