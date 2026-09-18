# Agent recovery and progress presentation — 2026-09-10

User flow: inspect a long coding task, continue after a model failure, review and
verify the existing changes. The observed runs failed at steps 46/38 with
PROVIDER_PROTOCOL_ERROR and ~121 KB transcripts; no HTTP rejection detail was
recorded, so context size is a hypothesis, not a confirmed provider cause.

- Reuse AgentCoordinator, existing Run/Events, retry lineage, Tool receipts and
  ContextCompiler. No schema, credential, permission or tool authority change.
- General model retries retain complete call/result exchanges and available
  verification tools while reducing older context. Persist bounded retry facts,
  never response bodies or credentials. Exhausted recoverable failures pause at
  the model boundary and resume the same Run with its evidence.
- Historical FAILED runs remain terminal. Explicit retry creates a linked
  attempt carrying historical findings and receipt-backed changed paths. They
  remain unverified; current files must be checked and fresh verification must
  cover carried and newly changed paths. Unknown effects are not replayed.
- Presentation keeps a small rotating current-progress preview and expandable
  history, with approval/pause actions always reachable. Unconfigured optional
  MCP is normal absence; actual connection errors stay visible in details.
- Keep Pane ownership, conversation rail, theme tokens and Phosphor icons.
  Tests: context exchange integrity, retry evidence/verification, same-run
  pause/restart/resume, legacy retry carryover, progress folding/animation,
  MCP diagnostics, terminal controls; Cross and actual packaged Electron smoke.
- Existing data remains readable; no new migration. Historical evidence stays
  immutable. Fixture checks do not establish real-provider task quality.
