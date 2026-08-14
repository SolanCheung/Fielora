# Fielora Agent Instructions

## 0. 最高规则

Fielora 是一个长期产品项目。

任何 Agent / Codex 在进行设计、架构、编码、重构或删除之前，不得仅依据当前 Prompt 猜测产品需求。

**第一次进入仓库时，必须先完成“只读上下文验收”。**

在用户明确确认阅读报告之前：

- 不得修改产品代码；
- 不得新增依赖；
- 不得初始化新的技术栈；
- 不得删除已有文件；
- 不得自行改变 V0.1 边界。

## 1. 强制阅读顺序

第一次进入仓库必须完整阅读：

1. `README.md`
2. `docs/context/00_CONVERSATION_INDEX.md`
3. `docs/context/01_CONVERSATION_TIMELINE.md`
4. `docs/context/02_PROJECT_REALITY.md`
5. `docs/context/03_DECISIONS.md`
6. `docs/context/04_REJECTED_DEFERRED.md`
7. `docs/context/05_SOURCE_ARCHIVE.md`
8. `docs/context/sources/Fielora_功能讨论_原始片段.txt`
9. `docs/product/COMPETITIVE_BOUNDARIES.md`
10. `docs/product/FIELORA_V0.1_INTERACTION_SPEC_CN.md`
11. `docs/architecture/TECHNICAL_BASELINE_V0.1.md`
12. `docs/architecture/TECHNICAL_ARCHITECTURE_V0.1.md`
13. `docs/architecture/CORE_CONTRACTS_V0.1.md`
14. `docs/architecture/SCHEMA_FREEZE_V0.1.md`
15. `docs/architecture/PHASE_01_IMPLEMENTATION_SPEC_V0.1.md`
16. `docs/architecture/PHASE_02_IMPLEMENTATION_SPEC_V0.1.md`
17. `docs/architecture/PHASE_02_CONTRACT_DELTA_V0.1.md`
18. `docs/architecture/PHASE_02_MIGRATION_0002_V0.1.md`
19. `artifacts/phase02/PHASE_02_FREEZE_CANDIDATE_VALIDATION_REPORT.md`
20. `artifacts/phase02/PHASE_02_IMPLEMENTATION_REPORT.md`
21. `artifacts/phase02/TEST_REPORT.md`
22. `artifacts/phase02/HUMAN_ACCEPTANCE_CHECKLIST.md`
23. `artifacts/phase02/HUMAN_GATE_CORRECTION_REPORT.md`
24. `artifacts/phase02/PHASE_02_FINAL_ACCEPTANCE_CANDIDATE.md`
25. `artifacts/phase02/PHASE_02_CLOSEOUT_REPORT.md`
26. `artifacts/phase02/KNOWN_ISSUES.md`
27. `artifacts/phase02/BUILD_INFO.json`
28. `docs/architecture/TEST_AND_DELIVERY_BASELINE_V0.1.md`
29. `docs/context/READING_GATE.md`
30. `context_manifest.json`

不得只做关键词搜索替代阅读。

## 2. 首次只读 Gate

阅读完成后，只允许生成：

`docs/context/CODEX_READING_REPORT.md`

该报告必须包含：

- 已完整阅读文件清单；
- 未能读取文件；
- 当前产品定义；
- Fielora 与普通 AI Browser 的区别；
- Now / Browse / Field 三态；
- Field 的角色；
- Capture / Inbox / Promote；
- Field State；
- DXE 当前边界；
- IDR 当前边界；
- Coding / Existing Project Takeover / Build / Verify 闭环；
- 专业软件“自己做 / 连接”的边界；
- Capability Connector；
- 多 LLM Provider 原则；
- V0.1 明确范围；
- V0.1 明确不做的内容；
- Windows / Electron / TypeScript / Rust 当前技术基线；
- 构建、测试、打包、人工验收基线；
- 已否决设计；
- 延后设计；
- 文档之间发现的冲突；
- 仍未确定的问题。

在用户确认报告前不得进入实现。

## 3. 产品核心原则

### 3.1 Fielora 不是 AI Sidebar Browser
禁止把 Fielora 简化成 `Chromium + AI Sidebar + Agent`。

### 3.2 Field 是持续工作的一级运行单位
Field 不是 Tab Group、Project Folder 或 Chat Session。

Field 维护 Goal、State、Objects、Relations、Activities、Evidence、Capabilities、Human/Agent 共享上下文、Working Surface 与 Resume 状态。

### 3.3 Conversation is history; Field State is reality
聊天记录保存“发生过什么”；Field State 保存“现在什么是真的”。

### 3.4 AI 是可召唤系统能力，不是常驻视觉区域
V0.1 禁止永久 AI Sidebar。

### 3.5 能力常驻系统，不常驻屏幕
系统内部可以复杂，默认 UI 必须简洁。

### 3.6 不重复制造成熟专业工程软件
Fielora 自己做跨场景、高频、核心、轻量能力；Blender、CAD、专业剪辑、专业 DAW 等通过 Capability Connector 连接。

### 3.7 Coding 是一等工作流，但不复制现有 IDE
研究成熟高质量开源 IDE / Editor 的基础设计，再结合 Field / Agent / Context / Verify 重设计；不得直接照搬源码或产品结构。

### 3.8 LLM Provider 中立
不得把 Agent、Field、UI 或业务逻辑绑定单一模型供应商。V0.1 不做本地 LLM。

### 3.9 当前现实可实施优先
任何能力进入 V0.1 前必须检查技术成熟度、工程可实现性、可验证性、成本与实际用户价值。

## 4. 实现前五问

实现任何重要能力前必须回答：

1. 它解决什么真实用户问题？
2. 它属于 Now / Browse / Field 哪一层？
3. 原始产品讨论或当前 Reality 的依据是什么？
4. 它是否属于 V0.1？
5. 它是否与明确否决项冲突？

若无法回答，不得自行扩产品定义。

## 5. 工程约束

当前 V0.1 语言职责：

- TypeScript / React：UI、Browser UI、Surface、交互；
- Rust：Field Runtime、State、Context、IDR、Agent orchestration、Capability、Evidence、Persistence、Native/Project integration；
- Python：Research / Eval / Benchmark；
- C++：只有未来 Chromium 深度集成确实需要时才使用。

当前 V0.1 平台：Windows 11 x64；Electron/Chromium 作为验证宿主；不直接 Fork Chromium；Rust Core 优先 Sidecar Process；本地优先持久化；多 LLM API Provider。

Phase 01 精确工具链与实现边界以已冻结的 `TECHNICAL_ARCHITECTURE_V0.1.md`、`CORE_CONTRACTS_V0.1.md`、`SCHEMA_FREEZE_V0.1.md`、`PHASE_01_IMPLEMENTATION_SPEC_V0.1.md` 为准。Canonical Local Worktree 已确认为 `F:\项目\Fielora`。Phase 01 Core Vertical Slice 已完成 Engineering、Desktop Reality 与 Human Experience Gate，用户于 2026-08-14 正式裁决 `PHASE_01: COMPLETE`。

用户于 2026-08-14 基于 `main@1419b8541a188e59af7ed2966f869bdde2dc7ada` 授权 Phase 02 Implementation。实现严格遵守三份 Frozen Phase 02 specs，并完成 Engineering、Desktop Reality、Human Experience、Post-correction Full Gate、Packaged Smoke 与 Portable Smoke。用户最终裁决 `PHASE_02_FINAL_ACCEPTANCE: GRANTED`、`PHASE_02: COMPLETE`；证据位于 `artifacts/phase02/`。

Phase 02 完成只授权 closeout 与 merge main，不构成 Phase 03 Implementation Authorization。`PHASE_03: NOT_AUTHORIZED`。不得继续扩展 Phase 02、提前实现 Phase 03 或自行改变 Frozen semantics。Phase 02 main closeout 后，先等待 Development Workflow Hardening 的单独任务与授权，再单独定义 Phase 03 推进方式。

## 6. 验证规则

“代码修改成功”不等于“功能验证成功”。必须区分 `Action completed` 与 `Result verified`。

## 7. UI 约束

默认禁止：永久 AI Sidebar、永久 Field State Dashboard、永久 Agent Activity 面板、五个 Mode 按钮常驻、多等权重 Dashboard 卡片、任意 LLM 生成 React UI、因内部状态多而全部暴露。

Field 默认一主焦点，最多两个辅助区域。

## 8. 变更项目事实

重大产品、架构、范围决定发生后，应同步更新：

- `docs/context/02_PROJECT_REALITY.md`
- `docs/context/03_DECISIONS.md`
- 受影响的 Product / Architecture Spec

不要只把重大决定留在 Codex 对话里。
