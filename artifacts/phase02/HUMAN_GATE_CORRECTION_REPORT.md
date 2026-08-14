# Phase 02 Human Gate UI Correction Report

状态：`POST_CORRECTION_FULL_GATE_PASS / HUMAN_EXPERIENCE_PASS / FINAL_ACCEPTANCE_GRANTED`

日期：2026-08-14

UI correction：`f03ed1fe120e60f925896e12a35caca7cc19ec54`

Packaged source：`ccd849c3b4c52662cd89fab023a00db857e88e21`

## 发现的问题

Human Gate 前的 dev 体验确认底层 Reality persistence 正常，但默认 UI 将 continuation、snapshot freshness、layout source、revision、pane primitive 与 raw wire enum 暴露给用户，使正确的 legacy compatibility semantics 看起来像旧 Resume 正在覆盖当前 Reality。

## 修正边界

本次只修改 React renderer、表现层纯函数、CSS 与 E2E assertions：

- 保留 Frozen continuation priority 与全部 Core 返回值；
- legacy text focus 显示为“上次关注”；
- 隐藏默认 UI 中的 stale/layout/revision/pane diagnostic；
- mode、kind、status、reference lifecycle 与 activity action 映射为用户语言；
- typed focus 不再序列化为 JSON 给用户；
- Task/Reference/Context 使用工作语言而非 Domain console 文案。

未修改 Contract、Schema、Migration、Rust Core、Electron bridge、FIPC/1 或 Frozen specs。

## Targeted Evidence

- TypeScript typecheck：PASS
- ESLint：PASS
- TypeScript unit：12/12 PASS
- Real Electron dev E2E：PASS
- exact legacy focus + stale Phase 01 snapshot + current Phase 02 TASK：PASS
- visible internal terminology denial：PASS
- visual inspection：PASS

第一轮 dev E2E 冷启动超过旧 30 秒 page-target 等待窗，尚未进入产品断言；测试基础设施等待窗调整为 60 秒后完整 targeted gate 稳定 PASS。

## Post-correction Formal Gate

`pnpm verify:phase02` 完整 PASS，并重新生成包含 correction 的 packaged/portable build：

- Packaged Smoke：PASS，17 acceptance checks；
- Portable fresh-directory Smoke：PASS，17 acceptance checks；
- post-correction packaged/portable standard + legacy screenshots：人工检查 PASS；
- Portable SHA-256：`24bf2bae54cf029ae748da0f8f7f6f6fb8c73a0e7049ebe76744017055d02a93`。

因此 correction 的正式成品 revalidation 已完成；用户随后裁决 Human Experience Gate PASS、Final Acceptance GRANTED、`PHASE_02: COMPLETE`。
