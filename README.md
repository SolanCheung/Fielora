# Fielora Codex Context Pack

版本：2026-08-14 / V0.1 Phase 02 Frozen Specification

本包用于让 Codex 在首次接手 Fielora 仓库时，不依赖单次 Prompt 猜测产品，而是先完整读取项目历史、当前事实、明确决策、交互规格和技术基线。

## 使用方式

将本包内容复制到 Fielora 仓库根目录，使 `AGENTS.md` 位于仓库根目录。

然后在 Codex 中打开该仓库，粘贴 `CODEX_FIRST_PROMPT.md` 的内容作为第一条任务。

**第一次任务只允许阅读和生成阅读报告，不允许修改产品代码。**

## 阅读优先级

发生冲突时，按以下优先级处理：

1. 最新明确用户决定
2. `docs/context/02_PROJECT_REALITY.md`
3. `docs/context/03_DECISIONS.md`
4. `docs/product/FIELORA_V0.1_INTERACTION_SPEC_CN.md`
5. `docs/architecture/*`
6. `docs/context/01_CONVERSATION_TIMELINE.md`
7. 更早的构想、探索性方案

任何无法确认的冲突不得由 Codex 自行“合理化”，必须列入阅读报告。

## 重要说明

`01_CONVERSATION_TIMELINE.md` 是根据当前 Fielora 对话、项目历史与已上传的《Fielora 功能讨论》资料制作的**高保真时序重建**，用于保留“为什么会做出当前决定”的历史脉络；它不冒充 ChatGPT 官方逐字导出的原始聊天记录。

项目真正的当前事实源是 `02_PROJECT_REALITY.md`；已冻结实现边界见 `docs/architecture/TECHNICAL_ARCHITECTURE_V0.1.md`、`CORE_CONTRACTS_V0.1.md`、`SCHEMA_FREEZE_V0.1.md`、`PHASE_01_IMPLEMENTATION_SPEC_V0.1.md`、`PHASE_02_IMPLEMENTATION_SPEC_V0.1.md`、`PHASE_02_CONTRACT_DELTA_V0.1.md` 与 `PHASE_02_MIGRATION_0002_V0.1.md`。

## 当前阶段状态

Phase 01 Core Vertical Slice 已完成 Engineering、Desktop Reality 与 Human Experience Gate。用户于 2026-08-14 正式裁决 `PHASE_01: COMPLETE`。

完成证据位于 `artifacts/phase01/`。Phase 02 Final Freeze Candidate 已完成 amendment 与 bounded SQLite validation，用户于 2026-08-14 正式裁决 `PHASE_02: APPROVED_FOR_FREEZE`。三份 Phase 02 规格现为 `FROZEN / APPROVED`，但该裁决不构成 Implementation Authorization。Phase 02 继续保持 `NOT_AUTHORIZED / NOT_STARTED`；不得创建产品 Migration 0002、修改 Rust/TypeScript Phase 02 实现或提前实现 Later Phase 能力。
