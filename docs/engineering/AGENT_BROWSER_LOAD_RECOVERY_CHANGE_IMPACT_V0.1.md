# Browser load recovery — 2026-09-11

Actual resumed receipt-popup run opened localhost:150 twice and received success with no elements, empty text and navigation generation zero. Project configuration and an observed listener were 127.0.0.2:8019. The model inferred login without observing a login page and still pursued an incorrect customer-title requirement. Previous plan-friction repairs did not certify semantic task fidelity.

Correct the existing Browser Tools/Host boundary: retain main-frame load failures independently of transient UI loading state, and do not return a successful DOM observation for failed/uncommitted navigation. Include bounded network diagnostics, requested/committed addresses, document/content state and the presence (never value) of a visible password control. Empty content is not authentication evidence.

Server receipts distinguish process-running from endpoint-listening. Add an optional, bounded loopback-only TCP readiness probe to browser_server status/start; it sends no application data and follows no redirects. It does not prove HTTP/UI readiness. Existing tool policy, run-owned process lifetime, untrusted browser session/navigation rules, screenshot/verification and password restrictions remain unchanged. No schema or second runtime; do not change or stop the user's finance server.

Recovery uses actual browser failures to request configuration/address/output inspection instead of accepting an unsupported login explanation. UI explains browser failures and server readiness. No new mandatory planning gate, unlimited retries or assertion of semantic task completion.

Validate with real local listeners and failed connections, actual Electron wrong-address navigation, successful retry, empty page versus login form, existing page verification and security regressions. Real model/business correctness remains a separate acceptance; fixture PASS cannot establish it.
