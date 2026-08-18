# Fielora Phase 04 Provider Gate Amendment

状态：`FROZEN / ACCEPTED / IMPLEMENTATION AUTHORIZED`

版本：V0.1

日期：2026-08-16

## 1. User ruling

用户正式纠正 Phase 04 Provider Gate：真实 OpenAI + Anthropic credential probe 不再是 Freeze 前置条件。Freeze 冻结统一 Contract 与安全边界；Implementation 证明产品实现；Phase Exit Acceptance 才以产品内真实 Provider 验证 external send、stream、cancel、error、usage 与 provider swap。

```text
PHASE_04_PROVIDER_GATE_AMENDMENT: ACCEPTED
REAL_PROVIDER_PRE_FREEZE_PROBE: DEFERRED_TO_IMPLEMENTATION_ACCEPTANCE
PHASE_04_FREEZE_PACKAGE: VALIDATED_WITH_PROVIDER_ACCEPTANCE_DEFERRED
PHASE_04_FREEZE: GRANTED
PHASE_04_IMPLEMENTATION: AUTHORIZED
```

## 2. Frozen provider boundary

Fielora 的内部标准只能是 `ModelInvocation`：

```text
STARTED
OUTPUT_TEXT_DELTA
TOOL_PROPOSAL
USAGE
COMPLETED | CANCELLED | FAILED
```

OpenAI Responses 与 Anthropic Messages 是 V0.1 reference built-in adapters，不是 Fielora 的产品身份或内部 wire standard。`OPENAI_COMPATIBLE` 是当前 V0.1 custom adapter class；未来 adapter catalog 可以 additive 扩展 OpenAI Chat Completions、Anthropic-compatible 或 provider-native adapter，但不得改写稳定 Domain Contract。

Provider selection、Provider response/session identity 与 model metadata 都不是 Reality、Capture、Field、Permission 或 Resume identity。Provider swap 后 Fielora-owned identity 与 authority 必须不变。

## 3. Evidence disposition

既有真实 pre-freeze probe 诚实保留：

```text
REAL_PROVIDER_FREEZE_PROBE: NOT_RUN
REASON: NO_ELIGIBLE_TEST_CREDENTIALS
DISPOSITION: IMPLEMENTED_ADAPTER_ACCEPTANCE_DEBT
```

它不得改写为 PASS。Fixture、local controlled provider、Migration、WinCred、endpoint security、Context/Capture 与 zero-leak probe 足以授权实现，但不能单独宣布 `PHASE_04: COMPLETE`。

## 4. Exit acceptance

Phase 04 Exit 仍需至少两个实际允许自动 API 调用的 Provider/协议实现，通过真实 Fielora 产品链验证：external send、stream、cancel、representative error、usage（若 Provider 提供）、Capture、provider swap 与 restart/Resume。验收目标不预先锁定为特定国家或厂商，但必须记录 Provider、协议、endpoint class 与真实 wire → `ModelInvocation` normalization Evidence。

套餐条款禁止自动化脚本、自定义后端或 API testing 的 credential 不得用于该 Acceptance。Mock/fixture 全绿只能证明 Engineering Gate，不能替代 Real Provider Acceptance 或 Human Experience verdict。

## 5. Authorization separation

本 Amendment 同时记录用户已独立授权 Phase 04 Implementation；它不预先授予 Phase 04 Final Acceptance。最终状态仍需区分：

```text
PHASE_04_IMPLEMENTATION: AUTHORIZED
PHASE_04_ENGINEERING_GATE: PENDING
PHASE_04_REAL_PROVIDER_ACCEPTANCE: PENDING
PHASE_04_HUMAN_EXPERIENCE_GATE: PENDING
PHASE_04: NOT_COMPLETE
```
