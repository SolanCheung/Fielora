# Phase 04 Human Experience Remediation Report

日期：2026-08-17

状态：`IMPLEMENTED / PHASE 04 UX PASS / HUMAN RETEST REQUIRED`

## Outcome

本轮没有重做 Phase 04 架构，也没有进入 Phase 05。已实现的 Provider、Credential、ModelInvocation、Context Package、Capture、Inbox、Attach、Promote、Resume、Permission、Security 与 Migration 0004 语义保持不变；修改仅限 deterministic React presentation、交互编排和对应测试。

```text
DXE_DESIGN_PRINCIPLES: PARTIALLY_APPLIED
DXE_SURFACE_RUNTIME: NOT_IMPLEMENTED
```

## Before / After

| Before | After |
|---|---|
| Summon 是 Ask / Inbox / Providers 三个等权 Tab 的工程控制台 | Summon 首屏只服务“现在提问/继续”，输入成为第一视觉焦点 |
| Context chips 常驻并暴露实现结构 | 默认显示“上下文 · N”，按需展开检查、移除或补充 |
| “普通/敏感”选择器常驻 | 正常内容不显示控件；命中确定性规则时才出现一次性确认 |
| Provider 配置表单占据高频 Ask 体验 | Ask 只显示轻量 Provider 状态；配置进入独立低频 Setup Surface |
| Inbox 嵌在 Summon 内并倾倒网页正文 | Inbox 可独立进入；默认卡片只显示类型、标题、来源、时间、短预览和状态 |
| Attach / Promote / IDEA_CANDIDATE 暴露给用户 | 映射为“加入 Field / 作为灵感继续 / 作为上下文使用 / 归档” |
| Capture 与 Summon 的用途不清 | Quick Capture 保持不打断浏览；模型回答提供轻量“捕获回答”动作 |

## UX assertions

- Summon 不再存在三个等权 Tab，关闭后恢复原工作面与焦点。
- Now、Browse、Field 继续共享 `Ctrl+Shift+Space` 入口，没有永久 AI Sidebar。
- Context 默认折叠、可检查、可删除、可补充 USER_NOTE；原 bounds、source revision 与 stale protection 不变。
- 敏感内容只触发 exception-driven disclosure；用户可移除敏感内容或仅本次允许。
- 无 Provider 时 Ask 保持可理解的 degraded state，不把完整表单塞入首屏。
- Inbox 是独立 Capture 决策面；长正文在显式展开前不会出现。
- Browse PAGE 与 SELECTION Quick Capture 保持原 Page collection、活动 Page 和 Browse surface。
- 用户 UI 不显示 `IDEA_CANDIDATE` 等内部 Domain 名称。

## Changed files

核心 UX 变更：

- `apps/desktop/src/renderer/Phase04Layer.tsx`
- `apps/desktop/src/renderer/phase04-presentation.ts`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/PrimaryNav.tsx`
- `apps/desktop/src/renderer/QuickCapture.tsx`
- `apps/desktop/src/renderer/BrowseScreen.tsx`
- `apps/desktop/src/main.ts`（仅 E2E 并存和 Browser bounds settling；生产 single-instance 语义不变）

测试变更：

- `apps/desktop/src/renderer/phase04-presentation.test.ts`
- `tests/e2e/phase04-desktop-e2e.mjs`
- `tests/e2e/browse-slice01-e2e.mjs`

Evidence 与上下文文档按本报告、测试报告、人工清单和事实源同步更新。

## Validation summary

- TypeScript：28/28 PASS；Rust：29/29 PASS；Core integration：5/5 PASS。
- Phase 04 UX/Core E2E：dev / packaged / fresh extracted portable 均 PASS，每个宿主 20 项断言。
- Phase 02 regression：dev / packaged / fresh extracted portable 均 PASS。
- 新 Portable 已生成并完成 Phase 04 与 Phase 02 fresh-directory smoke。
- 当前 Windows 自动化会话对 `OpenClipboard` 返回 `Access denied`，导致重新执行 Phase 03 原生 Ctrl+C/Ctrl+V Gate 时停下。断言仍保留，未改写为 PASS；详见 `TEST_REPORT.md` 和人工清单。

## Current state

```text
PHASE_04_ENGINEERING_GATE: PASS (PRE-REMEDIATION BASELINE)
PHASE_04_REMEDIATION_ENGINEERING_REVALIDATION: PENDING_ONE_ENVIRONMENT_CHECK
PHASE_04_HUMAN_EXPERIENCE_GATE: PENDING_RETEST
PHASE_04_REAL_PROVIDER_ACCEPTANCE: PENDING

PHASE_04_FINAL_ACCEPTANCE: NOT_YET
PHASE_04: NOT_COMPLETE
PHASE_05: NOT_AUTHORIZED
DXE_SURFACE_RUNTIME: NOT_IMPLEMENTED
```

