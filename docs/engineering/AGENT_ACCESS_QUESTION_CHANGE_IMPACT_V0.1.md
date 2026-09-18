# Current request boundary: project access questions

User flow: after an earlier implementation task, ask whether a supplied project
path can be read. Confirm access from a real current read receipt and finish
without resuming the older implementation or writing files.

Production evidence: Run `01a0b22b-c5b3-79a2-983a-81c9a0478799` correctly recorded
both action hints as false, but performed 49 observations and one successful
write under FULL_CONTROL. Completion was checked only after no-tool turns.

Change: add a narrow, deterministic current-request constraint for standalone
local access-confirmation questions, derived only from the original user
message. It is not a general language classifier or the inverse of the existing
action heuristic. Mixed requests to inspect and then implement remain on the
normal path. The existing Harness filters tools and rechecks the constraint at
execution, including queued/approved calls. A successful path-specific receipt
answers the access question immediately, independently of model tool-loop
termination. A failed observation never becomes successful access; inconclusive
attempts remain bounded and reported as such. History and model plans cannot
remove the constraint. No added permission, schema, migration, agent or runtime.

Affected owners: Ingress & Context (current source), Work Scope & Goal (bounded
question/result), Governance (effect restriction), Orchestration (receipt-backed
finish), existing Coordinator/ToolCall ledger (execution and evidence). General
semantic intent remains Model-owned. This deliberately does not claim to solve
all ambiguous natural-language intent or infer read-only mode from a question
mark. Reads retain reference containment and sensitive-path protections.

Validation: adversarial model outputs containing read + write/process/Git calls,
FULL_CONTROL and approved/resumed call bypasses, exact source matching, failed
access, mixed implementation questions, original-question desktop flow after a
failed historical task and restart, and a later explicit verified edit. Run Core/
Cross checks plus packaged desktop smoke; deterministic fixtures are mechanism
proof, not real Qwen acceptance. Do not modify customer projects or invoke saved
production credentials. Rollback removes the constraint; existing persisted
runs, events and approval contracts remain readable without migration.
