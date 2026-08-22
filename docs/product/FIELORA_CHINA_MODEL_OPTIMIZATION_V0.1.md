# Fielora China Model Optimization V0.1

Status: `CURRENT PRODUCTION FOUNDATION / QWEN CODING PLAN INTERACTIVE ROUTE / AUTOMATED LIVE QUALITY BLOCKED`

Date: 2026-08-18

## 1. User flow

This route serves one current workflow:

```text
Choose Qwen / DeepSeek / Kimi / GLM / MiniMax / Doubao or a future Provider
  → fill an official OpenAI-compatible preset or manual endpoint
  → prove configuration and adapter safety without a paid request
  → run the real Fielora Agent path
  → inspect → edit → test → git diff → approved stage/commit/push
  → authorize an explicit request/cost/time bound for live quality evaluation
  → preserve live failures and change one generalized behavior at a time
  → compare identical cases
  → run Chinese/security holdouts and provider-neutral regression
```

Real Desktop verification remains Settings → Project → Conversation → AgentRun
→ tools/approval → diff/test → completion/recovery. A direct API 200 response is
not Agent acceptance.

## 2. Review verdict on the proposed instruction

The following parts are accepted as hard rules:

- generic baseline before model optimization;
- Provider-neutral Agent Kernel and canonical tool/runtime semantics;
- capability facts separated from eval-derived behavior preferences;
- stable English tool identifiers and typed JSON Schema;
- Chinese requirements, mixed identifiers, Windows/Unicode paths, repository
  prompt injection, context budgets, cancellation, errors, and verification in
  the case set;
- identical-case A/B plus untouched holdouts;
- zero secret, workspace escape, approval bypass, fake receipt, hash overwrite,
  and unauthorized destructive action tolerance;
- bounded live calls and honest L0–L3 support language.

The original instruction is intentionally narrowed in four places:

1. It cannot simultaneously be a preflight, a full live certification, a
   production optimization, and a packaged release gate. Those are sequential
   stages with separate evidence.
2. Existing Provider-level capability booleans are not expanded into a durable
   public Contract before a bounded probe establishes real model facts. Eval
   profiles hold `UNVERIFIED` values without changing FIPC/schema.
3. Provider-specific capability claims remain inactive until live evidence.
   The shared `china-coding-v1` behavior may be active because it changes only
   language/tool discipline and is covered by deterministic regression; it does
   not self-grant tools, permission, execution or verification authority.
4. Packaging and full Desktop regression occur after an evidence-backed
   production behavior change, not merely because preflight files were added.

## 3. Current repository evidence

- Existing runtime: `Project → Conversation → AgentRun`, Rust Agent Kernel,
  Context Compiler, typed Tool Runtime, Policy/Approval, Verification and
  recovery are implemented.
- Existing adapters: OpenAI Responses, Anthropic Messages and OpenAI-compatible
  chat completions normalize to one model/tool turn.
- Existing Golden suite: deterministic engineering tasks are present, but
  single-file bug, multi-file feature, failure-repair replay, semantic
  compaction and proposal-only quality are not all passing live tasks.
- The saved Qwen credential was safely classified as a Coding Plan key. Its
  Provider metadata is now `OPENAI_COMPATIBLE + qwen3.7-plus +
  coding.dashscope.aliyuncs.com/v1`; the credential reference was preserved and
  the database was backed up before the bounded metadata repair.
- Official Alibaba Cloud documentation describes `qwen3.7-plus` through its
  OpenAI-compatible chat interface and requires the region/workspace-specific
  compatible-mode Base URL. The user must choose the correct region/workspace;
  Fielora must not guess or rewrite it. Source:
  `https://help.aliyun.com/en/model-studio/compatibility-of-openai-with-dashscope`.

## 4. Implemented production foundation

- `china-coding-v1` recognizes Qwen, DeepSeek, Kimi, GLM, MiniMax and Doubao by
  model/endpoint metadata, keeps stable English tool names and adds concise
  Chinese execution discipline. Unknown models use `generic-coding-v1`.
- MiniMax OpenAI-compatible requests use its current
  `max_completion_tokens` wire field and omit optional stream fields that its
  conservative compatibility path does not require. Agent contracts stay
  provider-neutral.
- Model tool exposure is phase-aware: read-only runs receive Observe tools;
  after a file mutation, Git finalization is hidden until a recognized real
  test/check receipt passes.
- `run_command` success is not automatically “verification”. Only recognized
  test/build/lint/typecheck commands can satisfy the completion invariant.
- Typed `git_stage`, `git_unstage`, `git_create_branch`, `git_switch_branch`,
  `git_commit` and `git_push` reject broad/force operations and always request
  one-time approval, including under Full Control. Generic command execution
  cannot smuggle a Git mutation.
- Desktop Provider Setup supplies editable presets for the six initial model
  families, with separate Qwen general API and Qwen Coding Plan entries.
  Environment → Prepare commit preloads the safe Agent workflow instead of a
  shell string.
- Direct compatible invocations now have an explicit 1,024-token output bound.
  Qwen Plan endpoints receive the official `enable_thinking:true` request field;
  the field is not sent to unrelated compatible Providers.

## 5. Implemented preflight baseline

`pnpm eval:agent:qwen:preflight` now:

- builds the existing Core and runs the existing model/Agent adapter tests;
- validates eight fixed CN Agent cases and three untouched holdouts;
- freezes `generic-current` and records exact hashes of Model, Agent and Core
  source files;
- keeps `qwen3.7-plus-candidate-v1` inactive with unverified capability and
  behavior fields;
- reads only safe Provider configuration metadata through Core;
- validates configuration and live authorization as orthogonal gates;
- makes zero external model requests and never reads credential bytes.

The deterministic generic improvement in this slice is bounded CJK term
extraction for context ranking. It fixes a language-selection defect for every
Provider and is applied to both future A/B arms; it is not a Qwen branch.
Unicode/space/backslash project paths and UTF-8 observations have a dedicated
tool regression.

The metadata preflight now reports all six families without reading credential
bytes or writing full endpoint URLs to Evidence. One real S01 request was sent
to the standard Model Studio endpoint before the credential type was known; it
returned `CREDENTIAL_REJECTED` and triggered the mandatory stop. A secure local
diagnostic then classified the credential as Coding Plan without printing or
hashing it. The configuration was corrected to the plan-specific endpoint.
Project policy forbids using Coding Plan credentials for automated API
acceptance, so subsequent live-runner execution is blocked before request 1 and
the credential is available only for interactive coding in Fielora.

## 6. Stage gates

### Stage 0 — Preflight

Must pass adapter serialization/stream/tool-delta/error/cancel tests, typed tool
tests, redaction/security tests, profile/case validation, and safe Provider
metadata inspection. External requests remain zero.

### Stage 1 — Configuration and authorization

The Provider must be `OPENAI_COMPATIBLE`, use the user's real HTTPS compatible
Base URL, preserve the exact `qwen3.7-plus` model alias, and have a credential.
Live evaluation also requires explicit `LIVE_PROVIDER_CALLS`, Provider, model,
`MAX_TOTAL_REQUESTS`, `MAX_TOTAL_COST_CNY` and `MAX_WALL_TIME_SECONDS` bounds.

### Stage 2 — Per-provider live smoke

Run bounded auth/stream/tool/verification/cancel/error cases for one configured
Provider at a time. Stop immediately on any safety failure. One observed pass
is not stability or certification.

### Stage 3 — Frozen baseline

Run the existing Golden tasks and CN development cases without changing the
frozen prompt/tools/context/retry/adapter. Preserve every failure and classify
it before proposing a change.

### Stage 4 — One-variable optimization

Each candidate records Evidence → Hypothesis → Change → Expected benefit → Risk
→ target cases → holdouts. Production activation requires identical-case A/B.

### Stage 5 — Holdout and regression

Run the three untouched CN holdouts, generic non-Chinese Golden tasks, complete
security/fault matrix, Core/TypeScript/integration and Desktop/packaged gates
appropriate to the actual production change.

## 7. Current verdict

```text
QWEN_PROVIDER: CODING_PLAN_INTERACTIVE_READY
QWEN_MODEL: qwen3.7-plus
QWEN / DEEPSEEK / KIMI / GLM / MINIMAX / DOUBAO LIVE SUPPORT: UNVERIFIED
CHINA_CODING_V1: ACTIVE SHARED BEHAVIOR / NO NEW AUTHORITY
TYPED_GIT_AND_VERIFICATION_LOOP: IMPLEMENTED / DETERMINISTIC PASS
PROVIDER_PRESETS: IMPLEMENTED / EDITABLE
SAFETY_GATE: DETERMINISTIC TESTS PASS / LIVE QUALITY NOT RUN
QWEN_LIVE_EVAL: S01 CREDENTIAL_REJECTED ON WRONG STANDARD ENDPOINT / 1 REQUEST
QWEN_AUTOMATED_RETRY: BLOCKED_CODING_PLAN_POLICY
QWEN_INTERACTIVE_ROUTE: OPENAI_COMPATIBLE + PLAN ENDPOINT + THINKING ENABLED
COMPETITIVE_QUALITY: NOT_ESTABLISHED
```
