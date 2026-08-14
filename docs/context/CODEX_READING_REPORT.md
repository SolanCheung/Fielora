# Fielora Codex 首次阅读报告

状态：用户已于 2026-08-14 明确确认；首次只读 Gate 已解除

阅读日期：2026-08-14

阅读基线：`phase/02-freeze-candidate@a31cb5db7969b7da16b9fa48e73e2c41204c4f21`

最新用户裁决：`PHASE_02: APPROVED_FOR_FREEZE`；`PHASE_02_IMPLEMENTATION_AUTHORIZED: NO`

## 1. Gate 结论

已按 `AGENTS.md` 的强制顺序完成当前 22 项必读资料的逐份完整阅读，并额外完整读取仓库根 `AGENTS.md` 与既有历史版 `CODEX_READING_REPORT.md`。没有以关键词检索替代阅读。

只读审计结果：

- 必读文件：全部存在，可完整读取；
- `context_manifest.json.required_reading`：22/22 均有 manifest file record；
- manifest 文件记录：29/29 的 SHA-256 与 bytes 全部匹配；
- Git root：`F:/项目/Fielora`；
- 当前分支/HEAD：`phase/02-freeze-candidate@a31cb5db7969b7da16b9fa48e73e2c41204c4f21`；
- 当前分支与 `origin/phase/02-freeze-candidate` 一致；
- `main` 与 `origin/main` 当前均为 `65a8751873deb8ef395286e06d62a9489462629f`；
- 本报告更新前工作区 clean；
- 本轮除本报告外未修改任何文件，未安装依赖，未创建产品 Migration 0002，未修改 Rust/TypeScript，也未推进产品 schema version。

## 2. 已完整阅读文件

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
16. `docs/architecture/PHASE_02_IMPLEMENTATION_SPEC_V0.1.md`（阅读时路径为 `PHASE_02_FREEZE_CANDIDATE_V0.1.md`）
17. `docs/architecture/PHASE_02_CONTRACT_DELTA_V0.1.md`（阅读时路径含 `_CANDIDATE`）
18. `docs/architecture/PHASE_02_MIGRATION_0002_V0.1.md`（阅读时路径含 `_CANDIDATE`）
19. `artifacts/phase02/PHASE_02_FREEZE_CANDIDATE_VALIDATION_REPORT.md`
20. `docs/architecture/TEST_AND_DELIVERY_BASELINE_V0.1.md`
21. `docs/context/READING_GATE.md`
22. `context_manifest.json`

另已完整阅读：`AGENTS.md`、既有历史版 `docs/context/CODEX_READING_REPORT.md`。

## 3. 未能读取文件

无。

历史视觉资产不属于本次强制阅读清单；它们只能在后续视觉任务中作为演化证据，不能替代最新 Product Reality、Interaction Spec 或 Frozen Architecture。

## 4. 当前产品定义与竞争边界

Fielora 是连接个人数字工作与生活的连续层：以 Field 为持续工作单位，以 Browser、Apps、AI、Agent 与 Capability 作为完成工作的运行能力。Browser 是入口和 Runtime 之一，不是产品中心。

Fielora 不能退化为 `Chromium + AI Sidebar + Agent`。网页总结、AI 搜索、跨 Tab、Vertical Tabs、Split View、Browser Agent、Multi-LLM、Connected Apps 与 MCP 都属于可拥有但不能解释产品存在理由的 Foundation/Commodity。真正差异是 Continuity、Lifecycle、Field、Promotion、Work Lineage、Resume Reality、Dynamic Surface、Human-Agent Shared State 和专业工具编排。

最高原则是：不是把所有软件装进 Fielora，而是让用户的工作与生活在软件之间不再断掉。

## 5. Now / Browse / Field

- **Now**：回答“我现在最可能继续什么”，最多突出少量 Continue 项；不是 Dashboard、Productivity Score 或多卡片状态墙。
- **Browse**：遵循成熟浏览器习惯。普通浏览不为不同而不同；AI 通过 Summon 临时出现，禁止永久 AI Sidebar。
- **Field**：真正工作后的任务驱动环境。进入 Field 后 Tab/Page 降为资源或 Surface，Current Goal、Current Reality 与当前主工作对象成为一级组织。

## 6. Field 与 Field State

Field 不是 Tab Group、Workspace Folder、Project Folder、Chat Session 或 Note Collection，而是持续运行的一级单位。内部可维护 Goal、State、Object、Relation、Activity、Evidence、Capability、Human/Agent 共享上下文、Policy、Working Surface 与 Resume 状态；这些复杂度不得全部常驻 UI。默认一个主焦点，最多两个辅助区域。

Field State 的基础类型为 FACT、DECISION、ASSUMPTION、QUESTION、TASK、BLOCKER、RESULT。它保存“现在什么是真的”，重要条目需可追溯来源，并区分用户确认与 AI 推断。

核心原则：`Conversation is history; Field State is reality.` 聊天记录说明发生过什么，不能自动成为当前事实源。

## 7. Capture / Inbox / Promote

- **Capture**：任何状态下快速记录 text、selection、page、screenshot、file、media timestamp 等；默认先保存，不强迫即时分类。统一快捷键打开 Summon，再由 IDR 解析 CAPTURE Intent。
- **Inbox**：未确定归属内容的过渡区，不是长期知识库。
- **Promote**：临时内容晋升为更长期正式工作对象；普通移动或分类不应滥用 Promote。

核心链：`Capture → Idea → Field → Requirement → Build → Verify → Result`。

## 8. IDR 与 DXE 当前边界

IDR 是轻量 Intent + Referent Resolution。输入当前 runtime/field/surface/focus/object/page/selection/recent activity/explicit refs/user input，输出 intent、referent、expected change、confidence、ambiguity。它不是独立重型产品、通用规划器或另一个 Agent。

DXE 根据 Field State、Intent、Current Goal 与可用 Object/Capability 编排 Working Surface。V0.1 只能从固定 Surface Primitive 中 select/arrange/resize/focus/collapse/replace，不能让 LLM 任意生成 React UI。内部能力可以复杂，默认屏幕必须简洁。

Phase 02 进一步把可实例化 Surface 收紧为固定 `SurfaceLayoutV1`、`TASK_PANE` 与 `REFERENCE_PANE`：exactly one primary、最多两个 supporting，不持久化坐标/尺寸/ratio；72/28 只是 renderer default。

## 9. Coding / Existing Project Takeover / Build / Verify

Coding 是 V0.1 一等工作流，因为它贯穿 `Idea → Requirement → Code → Run → Browser → Debug → Test → Fix → Verify`，但 Fielora 不从零复制完整 IDE。应研究成熟 Editor/LSP/Git/Terminal 架构，再围绕 Field、Agent、Context、Requirement 与 Verify 重设计。

Existing Project Takeover 是 Hero Flow。选择已有 repo 后先进入 Understand Project，读取 repo tree、package、README、Git、routes、components、API、config、tests、build、backend 与 DB references，形成持久化 Project Reality；初始阶段不得直接修改源码。

Requirement、Implementation、Test 与 Evidence 必须持续关联。Build 完成只代表 `Action completed`；真实测试与 Evidence 通过后才是 `Result verified`。FAIL 必须保持 FAIL；修复后要 Replay Test，真实 PASS 才更新验证状态。

## 10. 专业软件与 Capability Connector

Fielora 自己做跨场景、高频、核心、轻量的连续性能力：Capture、Inbox、Field、Notes、Requirement、Research、Library、Coding 基础工作面、Verify、AI 交互与简单创作辅助。

Blender、CAD、专业图像/视频/DAW 等成熟工程软件通过 Capability Connector 连接。Fielora 负责保存为什么打开、当前 Task、Source、Expected Output 与结果回到哪个 Field，不重复制造其专业编辑能力。

Capability Connector 可落到 MCP/API/CLI/Plugin/Extension/Native Bridge。V0.1 必须定义中立 Contract，并在 Phase 09 实现一个最小真实 Generic MCP Connector，验证 `Contract → Call → Result → Evidence`；失败或未实现不能伪装为成功。Phase 02 不包含 Connector。

## 11. 多 LLM Provider 原则

Agent、Field、UI 与业务逻辑不得绑定单一模型厂商。统一 Provider 抽象需覆盖 chat/responses、tool calling、streaming、usage、errors 与 model capabilities，可接 OpenAI、Anthropic、Google、Qwen、MiniMax、OpenAI-compatible 等。Local LLM 是未来增量，V0.1 明确不做。

## 12. V0.1 明确范围

V0.1 P0 包含 Shell/Now、Inbox/Universal Capture、Browse foundation、Summon/Context Chips、Field/Resume、Composer + IDR contract、固定 DXE primitives、Idea → Requirement、Development Field、Existing Project Takeover、Basic Code Workspace/Terminal/Git Diff/Browser Preview、Verify/Evidence、Library foundation、Multi-provider foundation，以及 Capability Connector contract + 一个最小真实 Generic MCP Connector。

数据与交互模型从第一天保持跨平台：Windows path 属于 Device Binding，不是 Object identity；核心模型预留 owner/actor/visibility/share_scope/permissions/provenance，但不扩张为 V0.1 Exchange UI、账号或网络服务。

## 13. V0.1 明确不做

Local LLM Runtime、完整专业设计/建模/剪辑/DAW/CAD 替代、任意 Generative UI、Agent/Capability Marketplace、Multi-Agent Society、完整人生管理、任意桌面软件完全自动化、自动学习所有软件 Workflow、完整 App Marketplace、Enterprise Admin、完整 Chrome Extension compatibility、Chromium Fork、macOS/Linux 正式验收、跨设备 Continuity 完整实现、完整 Exchange/IM/共享 Field 与 Steward-to-Steward 自动协作。

## 14. 当前技术基线

- 正式验收平台：Windows 11 x64 本地桌面应用；
- Desktop Host：Electron 43.4.0 + bundled Chromium，仅为 V0.1 验证宿主；
- UI：TypeScript + React；
- Core：Rust 1.97.1 / Edition 2024 Sidecar；
- Persistence：SQLite + rusqlite 0.40.2 `bundled`，单一 Storage Worker；
- Tooling：Node 24.18.1 LTS、pnpm 11.21.0、Electron Forge + Webpack；
- Python：Research/Eval/Benchmark；
- C++：仅未来 Chromium 深度集成确需时作为薄 Adapter；
- Production trusted app origin：精确 `fielora://app`；
- Rust Sidecar 将 parent-pipe EOF 作为权威 shutdown signal，2 秒内有界退出；
- FIPC/1 为 JSON-RPC 2.0 over UTF-8 NDJSON，Phase 02 additive methods 不改变 `ProtocolVersion 1.0`。

Phase 01 已完成真实 `Electron → typed preload → FIPC/1 → Rust Core → SQLite → Activity/Event → React → packaged restart/resume` 纵向闭环，并通过 Engineering、Desktop Reality 与 Human Experience Gate。

## 15. 构建、测试、打包与人工验收基线

统一 Gate：`Static → Unit(TS/Rust) → Rust Clippy/Release Build → Integration → Desktop E2E → Package → Packaged Smoke → Human Experience Acceptance`。

每个开发 Phase 必须提供 Portable Windows Build、Test Report、Build Info 与 Known Issues；Installer 固定在 Phase 03、Phase 08、Final Alpha，最终 Alpha 同时交付 Portable + Installer。自动化 PASS 不能替代 Human Experience Gate，且必须区分 Action completed 与 Result verified。

## 16. Phase 02 Final Candidate 的精确边界

Phase 02 只建立：Field Reality aggregate revision、State lifecycle、HTTPS-only REFERENCE、bounded `SOURCED_FROM`/`SUPERSEDED_BY` lineage、append-only Activity、constrained SurfaceLayoutV1、per-device Snapshot 与 deterministic richer Resume。

关键 frozen-candidate 约束：

- 每个成功 Reality mutation 在同一 transaction 中使 `fields.revision` 恰好 +1；
- State content 最多 4000 scalar，Activity summary 最多 240 scalar，Resume 的 ACTIVE BLOCKER/QUESTION/TASK 每组最多 5 条；
- REFERENCE lifecycle 为 ACTIVE↔ARCHIVED；restore 不暗中恢复旧 focus/relation；
- relation self-edge 比较完整 typed endpoint；
- 一个 layout 最多一个 FIELD_TASKS TaskPane，零 TASK 的空 TaskPane 合法且不创建占位 Reality；
- Snapshot 不成为第二事实源，Resume 以当前 Reality 为准；
- FIPC/1 transport 不变，仅 additive capability/method；
- Personal Memory、Agent、Browser、LLM、Capture/Inbox、Requirement/Coding/Verify/Evidence/Capability 等 Later Phase 全部排除。

真实 0001 + Candidate 0002 bounded probe 已证明正常 1→2 升级、incompatible-data fail-closed 整体回滚、typed self-edge 约束与临时文件清理均 PASS。它只证明候选 SQL 在限定数据路径上的可迁移性，不等于产品 Migration 0002 已创建、产品 runner 已验证、schema version 已推进或 Phase 02 实现获授权。

最新用户裁决使 Candidate 获得 Freeze 批准，但 `PHASE_02_IMPLEMENTATION_AUTHORIZED: NO` 保持不变。完成文档/Git closeout 仍不得创建 `crates/fielora-storage/migrations/0002_phase02_reality.sql`，不得修改 Rust/TypeScript Phase 02 实现。

## 17. 已否决设计

永久 AI Sidebar、Field=Tab Group/Workspace、任意 Generative UI、全部内部 State/Graph 常驻、重做成熟专业软件、从零发明完整 IDE、V0.1 Local LLM、V0.1 Chromium Fork、Leisure Productivity Dashboard、把核心架构绑定 Windows、以 local path 作为 Object identity、V0.1 扩张为完整 Exchange/IM/共享 Field、任意 origin 获得 app bridge，以及 parent 消失后保留 orphan Rust Sidecar。

## 18. 延后设计

更深 Chromium Integration/Fork、Local LLM、Fielora App Runtime、专业软件深度自动化、Creative Field 深化、Personal Steward、Capability Compiler/Acquisition、Agent/Capability/App Marketplace、Multi-Agent Society、完整 Chrome Extension compatibility、macOS/Linux 正式交付、跨设备 Field Continuity、完整 Exchange/IM/共享 Field/Steward 自动协作，以及 Deferred Mandate。

## 19. 文档冲突与 Freeze 同步结果

未发现 Final Candidate 与既有 Frozen Architecture/Core Contracts/Schema 的未解决语义冲突；Candidate validation report 也记录 `VALIDATION PASS` 与无剩余 Frozen Spec conflict。

用户确认本报告后，Freeze closeout 已将 Final Candidate、Project Reality、Decision Log、README、AGENTS、Reading Gate 与 manifest 同步为 `PHASE_02: APPROVED_FOR_FREEZE`，并继续保留 `IMPLEMENTATION NOT AUTHORIZED / NOT STARTED`。历史 validation artifact 中的 `NOT FROZEN` 是 Freeze 裁决前 verdict，已加注历史说明，不代表当前状态。

Phase 01 frozen Architecture/Core Contracts/Schema 没有被历史改写；Phase 02 已以正式增量规格收敛，并在总纲文档中明确冻结增量与 0001 不变。Migration 0002 仅冻结为正式规格，没有复制为产品 migration，也没有推进 schema version。

## 20. 仍未确定的问题

这些问题不阻塞 Phase 02 Freeze，且不得在本次 closeout 中自行决定：

- Phase 03 Browser tab/WebContents 精确模型；
- Phase 04 Provider credential storage；
- Phase 05 Project scan architecture；
- Phase 06 Editor、LSP host、CodingAgentProvider/OpenCode/ACP viability；
- Phase 07 terminal PTY；
- Phase 08 Evidence artifact retention/encryption；
- Phase 09 Generic MCP protocol scope、transport、discovery、authentication、timeout/cancellation 与 negotiation；
- updater、code signing、final installer technology；
- future Exchange ID/access/provenance 细节；
- 更深 Chromium、Capability Acquisition 与 Mandate 是否进入后续产品版本。

Phase 02 产品实现本身不是“待自行决定”的事项：当前明确为未授权、未开始；只有后续单独的 `PHASE_02_IMPLEMENTATION_AUTHORIZED: YES` 才能进入实现。

## 21. Gate 状态

用户已于 2026-08-14 明确确认本报告，首次只读 Gate 已解除。该确认只允许执行用户授权的 Freeze closeout，不改变 `PHASE_02_IMPLEMENTATION_AUTHORIZED: NO`，不得据此开始任何产品实现。
