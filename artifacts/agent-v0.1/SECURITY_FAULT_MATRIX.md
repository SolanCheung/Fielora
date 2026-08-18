# Complete Agent V0.1 Security and Fault Matrix

| Fault / threat | Expected result | Result | Evidence |
|---|---|---|---|
| `..`, absolute path, or symlink escape | Reject before read/write | PASS | `fielora-agent` file-tool tests |
| Stale file hash / external edit | Reject without overwrite | PASS | hash guard and exact replacement tests |
| Secret-like project/context file | Exclude from model context | PASS | context compiler secret exclusion test |
| Credential-like task text | Reject without echo | PASS | Core validation tests |
| Renderer attempts direct authority | Typed narrow bridge only | PASS | Desktop validation/security tests |
| Partial streamed tool JSON | Never execute | PASS | model fragmented-argument tests |
| Approval replay | Nonce consumed once | PASS | storage/integration approval path |
| Network/destructive effect | Fail closed to explicit approval | PASS | policy state tests |
| Arbitrary shell string | Not accepted; program + argv only | PASS | tool schema/runtime tests |
| Long/child command cancel | Kill Windows process tree | PASS | Job Object cancellation test |
| Tool output contains secret marker | Redact and bound observation | PASS | command receipt/redaction test |
| Core crash during tool | Mark tool UNKNOWN, run PAUSED; no replay | PASS | storage and abrupt-restart integration |
| Write after earlier successful test | Invalidate earlier verification | PASS | Core execution-state regression test |
| Provider stream/error interruption | Stable terminal/error semantics | PASS (fixture) | model adapter tests; live provider NOT_RUN |
| Malicious repository instructions | Treat as data; cannot self-grant | PASS (engineering) | system/context boundary and policy tests |
| Archive traversal/bomb | No extraction surface; explicit unsupported | PASS (boundary) | `capability_status` |
| Remote web agent extraction | No Agent web tool exposed | PASS (boundary) | explicit `UNSUPPORTED_CAPABILITY` |
| Chromium clipboard contention | Preserve hard assertion | FAIL | `pnpm verify:premerge` Browse E2E |
