# Rapid Desktop Rebase — Change Impact

日期：2026-08-17

状态：`PRODUCT ORDER + DEVELOPMENT PROCESS CHANGE`

## Change

- 旧 Phase 04→10 future execution order 被 Codex-like Desktop → Stable Long Tasks → Aegis → DXE → Personal Steward 取代；
- Reality/Field 不再作为近期差异，现有 Field 暂作 Project compatibility layer；
- 近期允许 Chat/Agent 成为 Project 主工作面；
- 57 份文件的首次阅读和阅读报告 Gate 取消，改为最小当前事实阅读；
- 普通可逆功能不再制作六件套 Freeze Package。

## Reused

Electron shell、Rust sidecar、SQLite、Phase 04 Provider adapters、Windows Credential Manager、streaming/cancel/error normalization、Browse 与现有测试全部保留复用。

## Not changed by this docs-only rebase

本轮未修改产品代码、Schema、Migration、credential storage、Provider wire、安全边界或已有 Artifact。任何实际 Conversation persistence、coding execution 或新 Migration 仍需在对应纵向切片中实现和验证。

## Current status

```text
CURRENT_BUILD_DIRECTION: CODEX_LIKE_MULTI_PROVIDER_DESKTOP
OLD_PHASE_04_TO_10_EXECUTION_ORDER: SUPERSEDED
PHASE_01_TO_04_CODE: RETAIN_AND_REUSE
LEGACY_PHASE_04_EXIT_GATES: HISTORICAL_NON_BLOCKING
AEGIS_IN_PRODUCT: NOT_IMPLEMENTED
DXE_SURFACE_RUNTIME: NOT_IMPLEMENTED
PERSONAL_STEWARD: NOT_IMPLEMENTED
```
