# Phase 04 Implementation Cross-review

日期：2026-08-17

状态：`CORE CROSS-REVIEW PASS / UX REMEDIATION PASS / FULL RERUN PENDING ONE ENVIRONMENT CHECK`

| 审查面 | 证据与结论 | 状态 |
|---|---|---|
| Product | Summon 非常驻且 Ask-first；Context 渐进披露；Inbox 独立；Capture 显式；无聊天/执行 scope expansion | PASS |
| Contract | OpenAI/Anthropic/compatible wire delta、usage、tool、error 进入同一 `ModelInvocation`；complete/cancel/fail terminal 明确 | PASS_ENGINEERING |
| Migration | runner registry `(1,2,4)`；schema 4；canonical hash `4d142745…0f869ab`；无 secret/prompt/response/session table | PASS |
| Credential | WinCred create/read/delete；query/event/DB 不返回 secret；测试 target 最终为 0 | PASS |
| Endpoint | HTTPS DNS only、DNS resolution/pinning、private/reserved/mixed reject、redirect/proxy deny | PASS |
| Context | Frozen scalar/UTF-8/chip/aggregate bounds；Core authoritative reread；stale Browse generation reject；BLOCKED/credential-like fail closed | PASS |
| Capture/Reality | immutable content/provenance；Attach/Promote transaction；模型输出无默认 authority；IDEA_CANDIDATE 不扩 StateKind | PASS |
| Desktop | Phase 02 与 Phase 04 dev/packaged/fresh portable PASS；fresh Phase 03 rerun 被 Windows Clipboard Access denied 阻断 | PENDING_ENVIRONMENT |
| Leakage | E2E canary 未进入本地文件；Evidence 文本扫描无 credential/prompt canary/bearer token；WinCred 测试项清理 | PASS_ENGINEERING |
| Provider reality | 尚无条款允许自动 API 测试的两种真实 provider/protocol credential | PENDING |
| Human experience | 需要用户在真实日常网站与真实 eligible provider 上体验 | PENDING |

## Adapter-boundary review

自动 Evidence 不只判断“返回字符串”：三宿主均固化并断言 complete `STARTED → OUTPUT_TEXT_DELTA → USAGE → COMPLETED`、cancel `STARTED → CANCELLED`、failure `STARTED → FAILED / PROVIDER_RATE_LIMITED`。Provider fixture 单测另外证明 OpenAI Responses、Anthropic Messages 与 OpenAI-compatible 的不同 wire event 映射到相同 delta/usage/tool semantics，且 401/403、404、408/429、5xx 与 stream error 使用稳定错误码。

真实 Provider Gate 仍须证明 actual wire protocol → Fielora normalization → same semantics；本报告不把 fixture 结果写成真实 Provider PASS。

## Human Experience remediation review

- Ask / Inbox / Providers 三等权 Tab 已消失；Provider Setup 与 Inbox 均退出正常 Ask 首屏。
- Context Contract、limits、source revision/navigation generation 与 stale protection 没有变化；只把默认呈现压缩为可展开摘要。
- `SENSITIVE/BLOCKED` 保持原安全语义；常驻选择器改为命中确定性规则后的 exception-driven confirmation。
- Capture aggregate、Attach、Promote 与 `IDEA_CANDIDATE` Core semantics 未改；默认 UI 使用“加入 Field / 作为灵感继续 / 作为上下文使用 / 归档”。
- Inbox 默认 preview 最大 180 字符，完整 immutable content/provenance 只在显式展开后显示。
- 实现只使用 fixed React components 与 deterministic local presentation helpers。

```text
DXE_SURFACE_RUNTIME: NOT_IMPLEMENTED
PHASE_05_SCOPE_ENTERED: NO
```

## Unresolved blockers

没有新的 architecture blocker。Phase 04 Final Acceptance 的剩余条件为：

1. 至少两个实际允许自动 API 调用的 Provider/协议实现通过 bounded real-product acceptance；
2. 用户完成新的 Human Experience Retest；
3. Windows Clipboard 可访问后，完整 `pnpm verify:phase04` 重新跑通 Phase 03 原生 Ctrl+C/Ctrl+V 回归。
