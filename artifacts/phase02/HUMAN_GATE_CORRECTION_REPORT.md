# Phase 02 Human Gate UI Correction Report

状态：`DEV_SLICE_PASS / FORMAL_PACKAGED_REVALIDATION_PENDING`

日期：2026-08-14

提交：`f03ed1fe120e60f925896e12a35caca7cc19ec54`

## 发现的问题

Human Gate 前的 dev 体验确认底层 Reality persistence 正常，但默认 UI 将 continuation、snapshot freshness 与 layout source 拼在同一条 Resume 提示中，并直接显示 revision、pane primitive、wire status/kind/action 等内部术语。这使正确的 legacy compatibility semantics 看起来像旧 Resume 正在覆盖当前 Reality。

## 修正边界

本次只修改 React renderer、表现层纯函数、CSS 与 E2E assertions：

- 保留 Frozen continuation priority 与所有 Core 返回值；
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

Evidence：

- `artifacts/phase02/dev-phase02-resume.png`
- `artifacts/phase02/dev-phase02-legacy-resume.png`

第一次 dev E2E 冷启动超过旧 30 秒 page-target 等待窗，尚未进入任何产品断言；等待窗调整为 60 秒后，完整 targeted gate 稳定 PASS。该调整只修正测试基础设施慢启动容忍度。

## 当前边界

按双模式验证规则，本 Slice 未提前打包。现有 packaged/portable artifact 不包含本次 renderer correction，只能保留为既有 Core/Desktop Reality Evidence。用户先通过长期运行的 `pnpm dev` 体验当前 UI；正式阶段 Gate 再重新生成和验证 packaged/portable build。

因此 Human Experience 与 Phase 02 Final Acceptance 继续保持 pending。
