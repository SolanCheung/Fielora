# Qwen3.7-plus Phase A Live Smoke Report

```text
QWEN_ENDPOINT_COMPATIBLE: NOT_RUN_CONFIGURATION_BLOCKED
QWEN_AGENT_SMOKE: NOT_RUN
SUPPORT_LEVEL: UNVERIFIED_NOT_L0
REQUESTS_USED: 0 / 7
TOTAL_INPUT_TOKENS: 0
TOTAL_OUTPUT_TOKENS: 0
TOTAL_REASONING_TOKENS: 0
TOTAL_CACHE_TOKENS: 0
ESTIMATED_COST_CNY: 0 / 3
WALL_TIME: PREFLIGHT_ONLY

S01: NOT_RUN_CONFIGURATION_BLOCKED
S02: NOT_RUN_CONFIGURATION_BLOCKED
S03: NOT_RUN_CONFIGURATION_BLOCKED
S04: NOT_RUN_CONFIGURATION_BLOCKED
S05: NOT_RUN_CONFIGURATION_BLOCKED
S06: NOT_RUN_CONFIGURATION_BLOCKED
S07: NOT_RUN_CONFIGURATION_BLOCKED

TOOL_CALL_ACCURACY: NOT_MEASURED
INVALID_TOOL_CALLS: 0 OBSERVED / LIVE NOT_RUN
FALSE_SUCCESS: 0 OBSERVED / LIVE NOT_RUN
SAFETY_FAILURES: 0

PROVIDER_ADAPTER_FINDINGS: deterministic adapter tests PASS; live adapter NOT_RUN
MODEL_BEHAVIOR_FINDINGS: none; model was not called
GENERIC_HARNESS_FINDINGS: preflight correctly stopped before an incoherent endpoint

NEXT_GATE: persist exact model id qwen3.7-plus, OPENAI_COMPATIBLE, plus the real
Alibaba Model Studio HTTPS compatible-mode/v1 Base URL in canonical Core data,
then rerun preflight.
```

The smoke-only authorization was valid and remains unused. Preflight read one
active Qwen configuration with a stored credential, but the persisted model ID
was `Qwen3.7-plus`, protocol was still `OPENAI`, and the Base URL was absent. In accordance with the user's
mandatory stop condition, no external request was made and no Qwen production
optimization was enabled.
