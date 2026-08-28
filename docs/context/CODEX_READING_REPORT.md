# Fielora Codex 首次阅读报告

状态：`HISTORICAL / FIRST-READ GATE SATISFIED / NO LONGER A DEVELOPMENT BLOCKER`

> `HISTORICAL / SUPERSEDED TERMINOLOGY`：本文中的轻量 `IDR` 是当前
> `Entry Intent Resolver` 的旧名，不是 `Individualized Disposition Runtime`。

阅读日期：2026-08-16（Asia/Shanghai）

阅读工作树：`F:\项目\Fielora`

Git 基线：`codex/phase-03-browse-foundation@7dc1aac593a4d478b7e175e5e197cf99466c1f47`

本报告生成时的最新裁决：2026-08-16 明确确认 `PHASE_03: COMPLETE`，随后确认本 Reading Report 的竞品审计并授权 `PHASE_04_ALPHA_REMAP`。后续事实已推进：Phase 04 Freeze 已授予、Slice 01–05 与限定 UX remediation 已实现；真实 Provider Acceptance、Human Retest 与一次 Clipboard-blocked full rerun 仍待关闭。2026-08-17 竞争口径又收窄为四项主差异机制。当前状态以 `02_PROJECT_REALITY.md` 第 49–50 节为准，本报告中的早期竞品表述由它们覆盖。

重要说明：首次只读 Gate 期间，当前工作树中的 Phase 03 产品代码、测试、脚本、文档与 Evidence 全部被视为用户既有工作，除本报告外未修改任何文件。用户确认报告并授权路线重排后，才开始编写独立 Remap Candidate 和同步项目事实；仍未修改产品代码、安装依赖、创建 Migration 或授权 Phase 04 实现。

## 1. Gate 结论

已按 `AGENTS.md` 规定顺序完整阅读 32 份强制材料，没有用关键词检索代替逐份阅读。仓库根 `AGENTS.md` 已在任务上下文中完整加载，并再次从本地文件完整复核；已有 2026-08-14 版 `CODEX_READING_REPORT.md` 也已完整读取，但其 22 项阅读基线和 `PHASE_03: NOT_AUTHORIZED` 状态已被后续事实超越，本报告取代其当前状态作用。

只读验收结果：

- 强制阅读文件：32/32 存在并可完整读取；
- `context_manifest.json.required_reading`：32/32 存在、无重复、均有文件记录；
- manifest 全部文件记录：39/39 存在，当前 bytes 与 SHA-256 全部匹配；
- Git root：`F:/项目/Fielora`；
- remote：`git@github.com:SolanCheung/Fielora.git`；
- 当前分支：`codex/phase-03-browse-foundation`；
- 当前 HEAD：`7dc1aac593a4d478b7e175e5e197cf99466c1f47`；
- 工作树不是 clean：存在用户既有 Phase 03 实现、文档、脚本、Evidence 与少量 Phase 02 screenshot/E2E 变化；
- 本轮唯一写入：本报告。

在用户明确确认本报告前，首次只读 Gate 保持生效；不进入实现，也不把本报告中的路线问题自动转化为新产品决定。

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
29. `docs/engineering/DEVELOPMENT_WORKFLOW_V0.1.md`
30. `artifacts/workflow/DEVELOPMENT_WORKFLOW_HARDENING_REPORT.md`
31. `docs/context/READING_GATE.md`
32. `context_manifest.json`

补充完整读取：`AGENTS.md`、旧版 `docs/context/CODEX_READING_REPORT.md`、`docs/architecture/TECHNICAL_ARCHITECTURE_REVIEW_REPORT_V0.1.md`、`docs/context/BASELINE_FREEZE_REPORT.md`、当前 Phase 03 Human Gate/Full Gate/packaged/portable Evidence，以及 Phase 03 formal gate/portable 脚本和根 `package.json`。

## 3. 未能读取文件

无。

历史视觉资产不属于本次强制阅读范围；若后续进入视觉任务，应按 `05_SOURCE_ARCHIVE.md` 的要求查看，但不能把历史原型当成当前定稿。

## 4. 当前产品定义

Fielora 是连接个人数字工作与生活的连续层：以 Field 为持续工作单位，以 Browser、Apps、AI、Agent 和 Capability 作为完成工作的运行能力。Browser 是入口与 Runtime 之一，不是产品中心。

最高产品原则是：不是把所有软件装进 Fielora，而是让用户的工作与生活在软件之间不再断掉。

## 5. Fielora 与普通 AI Browser 的区别

Fielora 不能退化为 `Chromium + AI Sidebar + Agent`。网页总结、AI 搜索、跨 Tab、Vertical Tabs、Split View、Browser Agent、Multi-LLM、Connected Apps 与 MCP 都可以成为基础能力，但不能解释 Fielora 为什么必须存在。

当前主差异 Gate 已收窄为四项：Explicit Lifecycle、Operational Work State、Persistent Work Lineage + Verification、DXE。Field/Reality/Resume/Memory/Coding/Browser/MCP/Agent/Permission/Multi-provider 等名称或能力本身均不算差异；Provider-neutral Reality、Governed Agency 与 Recovery 是必要架构边界，不是单独购买理由。Fielora 必须用 work-centered、跨 Chat/Agent/Provider 的 operational behavior 实证，而不是靠术语区分。

## 6. Now / Browse / Field 三态

- **Now**：回答“我现在最可能继续什么”，突出少量 Continue 项；不是 Dashboard、Productivity Score 或多卡片状态墙。
- **Browse**：遵循成熟浏览器习惯。Loose Browse 是临时浏览，Page/Tab/History 不自动成为 Field State，也不覆盖 Resume。
- **Field**：真正工作后的任务驱动环境。Page/Tab 在其中降为资源或 Surface，Field Reality 与当前主工作对象成为一级组织。

当前 Phase 03 只在既有 Shell/Now 基础上建立 Browse Foundation，没有授权把普通浏览自动升级为 Field、Capture 或 Library ingestion。

## 7. Field 的角色与 Field State

Field 不是 Tab Group、Workspace Folder、Project Folder、Chat Session 或 Note Collection，而是持续运行的一级工作单位。内部可维护 Goal、State、Objects、Relations、Activities、Evidence、Capabilities、Human/Agent 共享上下文、Policy、Working Surface 与 Resume 状态；这些内部复杂度不得全部常驻 UI。

Field State 的基础类型为 FACT、DECISION、ASSUMPTION、QUESTION、TASK、BLOCKER、RESULT。它保存“现在什么是真的”，重要 State 需要来源与 provenance，并区分用户确认和 AI 推断。

核心原则：`Conversation is history; Field State is reality.` Activity/Conversation 记录发生过什么，不能自动取代当前 Reality。

## 8. Capture / Inbox / Promote

- **Capture**：任何状态下快速记录 text、selection、page、screenshot、file、media timestamp 等；默认先保存，不强制即时分类。统一快捷键先打开 Summon，再由 IDR 解析 CAPTURE Intent。
- **Inbox**：尚未确定归属内容的过渡区，不是长期知识库。
- **Promote**：把临时内容晋升为更长期正式工作对象；普通移动或分类不应滥用 Promote。

核心链：`Capture → Idea → Field → Requirement → Build → Verify → Result`。

## 9. DXE 与 IDR 当前边界

IDR 是轻量 Intent + Referent Resolution。它根据 current runtime/field/surface/focus/object/page/selection/recent activity/explicit refs/user input，输出 intent、referent、expected change、confidence、ambiguity；它不是独立重型 Agent、通用规划器或另一个长期产品面。

DXE 根据 Field State、Intent、Current Goal 与可用 Object/Capability 编排 Working Surface。V0.1 只能从固定 Surface Primitive 中 select/arrange/resize/focus/collapse/replace，禁止让 LLM 任意生成 React UI。

当前已实现的 Phase 02 Surface 进一步收紧为固定 `SurfaceLayoutV1`、TaskPane 与 ReferencePane；exactly one primary、最多两个 supporting。72/28 只是 renderer 默认表现，不是 durable semantics。

## 10. Coding / Existing Project Takeover / Build / Verify 闭环

Coding 是一等工作流，因为它贯穿 `Idea → Requirement → Research → Design → Build → Run → Test → Fix → Verify → Result`，但 Fielora 不从零复制完整 IDE，也不能直接照搬成熟 IDE 源码或产品结构。

Existing Project Takeover 是 V0.1 Hero Flow。选择已有 repo 后先进入 Understand Project，扫描 repo tree、package、README、Git、routes、components、API、config、tests、build、backend 与 DB references，形成持久化 Project Reality；Understand 阶段不得擅自修改源码。

Requirement、Implementation、Test 与 Evidence 必须持续关联。Build 完成只代表 `Action completed`；真实测试与 Evidence 通过后才是 `Result verified`。FAIL 必须保持 FAIL；修复后必须 Replay Test，真实 PASS 才能更新验证状态。

DevelopmentTask、CodingSession 与 Model Provider 也必须分离：Task 是稳定工作委托，CodingSession 是某次 Agent 执行，Model Provider 只是模型能力来源。

## 11. 专业软件“自己做 / 连接”的边界

Fielora 自己做跨场景、高频、核心、轻量的连续性能力：Capture、Inbox、Field、Notes、Requirement、Research、Library、Coding 基础工作面、Verify、AI 交互与简单创作辅助。

Blender、CAD、专业图像/视频/DAW 等成熟工程软件通过 Connector 连接。Fielora 保存为什么打开、当前 Task、Source、Expected Output 与结果应回到哪个 Field，不重复制造这些工具的专业编辑能力。

## 12. Capability Connector

Capability Connector 可落到 MCP、API、CLI、Plugin、Extension 或 Native Bridge。V0.1 不能只定义接口；必须实现一个最小真实 Generic MCP Connector，验证 `Contract → Call → Result → Evidence`。

外部 metadata、网页或 LLM 不能扩大权限。Invocation、Policy、Result 与 Evidence 必须分层；失败、超时、取消或 Unknown Outcome 不能伪装为成功。具体 MCP 协议范围、transport、discovery、authentication、timeout/cancellation 与 negotiation 仍需在 Phase 09 开工前冻结。

## 13. 多 LLM Provider 原则

Agent、Field、UI 与业务逻辑不得绑定单一厂商。统一 Provider abstraction 至少覆盖 chat/responses、tool calling、streaming、usage、errors 与 model capabilities，并允许 OpenAI、Anthropic、Google、Qwen、MiniMax、OpenAI-compatible 等 Adapter。

“Provider-neutral”不等于把多个厂商名称写进设置页；需要真实的可替换 Contract、错误/能力降级、配置与 credential boundary。Local LLM 是未来增量，V0.1 明确不做。

## 14. V0.1 明确范围

当前 P0 包含：Shell/Now、Inbox/Universal Capture、Browse foundation、Summon/Context Chips/Progressive Context、Field/Resume、Composer + IDR contract、固定 DXE primitives、Idea → Requirement、Development Field、Existing Project Takeover、Basic Code Workspace、Terminal、Git Diff、Browser Preview、Verify/Evidence、Library foundation、Multi-provider foundation，以及 Capability Connector contract + 一个最小真实 Generic MCP Connector。

数据与交互模型从第一天保持跨平台：Windows path 属于 Device Binding，不是 Object identity；核心模型预留 owner/actor/visibility/share_scope/permissions/provenance，但不扩张为 V0.1 Exchange UI、账号、同步或网络服务。

## 15. V0.1 明确不做

Local LLM Runtime、完整专业设计/建模/剪辑/DAW/CAD 替代、任意 Generative UI、Agent/Capability Marketplace、Multi-Agent Society、完整人生管理、任意桌面软件完全自动化、自动学习所有软件 Workflow、完整 App Marketplace、Enterprise Admin、完整 Chrome Extension compatibility、V0.1 Chromium Fork、macOS/Linux 正式验收、跨设备 Continuity 完整实现、完整 Exchange/IM/共享 Field 与 Steward-to-Steward 自动协作。

## 16. Windows / Electron / TypeScript / Rust 技术基线

- 正式验收平台：Windows 11 x64 本地桌面应用；
- Desktop Host：Electron 43.4.0 + bundled Chromium，仅为 V0.1 验证宿主；
- UI：TypeScript + React；
- Core：Rust 1.97.1 / Edition 2024 Sidecar；
- Persistence：SQLite + rusqlite 0.40.2 `bundled`，单一 Storage Worker；
- Tooling：Node 24.18.1 LTS、pnpm 11.21.0、Electron Forge + Webpack；
- Python：Research/Eval/Benchmark；
- C++：仅未来 Chromium 深层集成确需时作为薄 Adapter；
- Production trusted app origin：精确 `fielora://app`；
- Rust Sidecar 将 parent-pipe EOF 作为权威 shutdown signal，2 秒内有界退出；
- FIPC/1：JSON-RPC 2.0 over bounded UTF-8 NDJSON；
- Browser remote/local Page：隔离 untrusted WebContents/session，无 Node/preload/app bridge；安全裁决同时使用 initiator 与 target。

## 17. 构建、测试、打包与人工验收基线

统一正式 Gate：`Static → Unit(TS/Rust) → Rust Clippy/Release Build → Integration → Desktop E2E → Package → Packaged Smoke → Human Experience Acceptance`。

日常开发与人工体验长期运行 `pnpm dev`；Docs/UI/Core/Cross Lane 只提供快速反馈。所有准备进入 main 的变更运行 `pnpm verify:premerge`；packaging-sensitive 变更额外做 targeted packaged smoke。PreMerge 或 targeted smoke 都不能代替正式 Phase Gate。

每个 Phase 必须提供 Portable Windows Build、Test Report、Build Info 与 Known Issues。Installer 固定在 Phase 03、Phase 08、Final Alpha；Final Alpha 必须同时交付 Portable + Installer。自动化 PASS 不能替代 Human Experience Gate。

## 18. 已否决设计

永久 AI Sidebar、Field=Tab Group/Workspace、任意 Generative UI、全部内部 State/Graph 常驻、重做成熟专业软件、从零发明完整 IDE、V0.1 Local LLM、V0.1 Chromium Fork、Leisure Productivity Dashboard、以 Chrome Extension compatibility 推动 Fork、核心架构绑定 Windows、以 local path 作为 Object identity、V0.1 扩张为完整 Exchange/IM/共享 Field、任意 origin 获得 app bridge，以及 parent 消失后保留 orphan Rust Sidecar。

## 19. 延后设计

更深 Chromium Integration/Fork、Local LLM、Fielora App Runtime、专业软件深度自动化、Creative Field 深化、Personal Steward、Capability Compiler/Acquisition、Agent/Capability/App Marketplace、Multi-Agent Society、完整 Chrome Extension compatibility、macOS/Linux 正式交付、跨设备 Field Continuity、完整 Exchange/IM/共享 Field/Steward 自动协作，以及 Deferred Mandate。

## 20. 当前阶段事实

- Phase 01：COMPLETE；
- Phase 02：COMPLETE；
- Development Workflow Hardening：COMPLETE；
- Phase 03：用户于 2026-08-16 最新明确裁决 `COMPLETE`；该裁决取代仓库文档中此前的 Slice 05 `FAIL / WAITING_REPAIR_REGATE` 当前状态；
- `artifacts/phase03/FULL_GATE.log` 证明 2026-08-16 的完整 Static/Unit/Rust/Integration/Desktop E2E/Package/Packaged Smoke/Portable/Portable Smoke Engineering Gate 已退出成功；
- 当前仓库已补入 Phase 03 Test Report、Build Info 与 Closeout Report；固定的 Phase 03 Installer checkpoint 仍未出现在 formal gate 脚本或 artifact 中，独立 Known Issues 也未形成。剩余项目属于 closeout evidence debt，不在本报告中反向推翻用户的 `PHASE_03: COMPLETE` 裁决；
- Phase 03 Complete 不会自动构成 Phase 04 Implementation Authorization；Phase 04 的修订范围与 Gate 仍需单独裁决。

## 21. 用户给出的 Phase 03→Alpha 路线与冻结 Phase Map 的初步对照

冻结 `TECHNICAL_ARCHITECTURE_V0.1.md` 的 V0.1 Phase Map 是：

1. Core vertical slice；
2. Field State/Activity/DXE/richer Resume；
3. Shell/Now/Browse Runtime；
4. Summon/Context Chips/Capture/Inbox/Multi-LLM foundation；
5. Requirement/Existing Project Takeover/Project Reality；
6. DevelopmentTask/CodingSession/Basic Code Workspace/Git Diff/CodingAgentProvider spike；
7. AI-first Development Runtime/Terminal/Run；
8. Verification/Evidence/Browser Preview；
9. Generic MCP Connector；
10. Library/security/polish/Packaged Alpha。

用户本轮表格的大方向与 Phase 03、05–09 基本连续，但不能原样替代冻结 Map：

- Phase 04 只写 Provider，会漏掉 Summon、Context Chips、Capture、Inbox，以及让 Provider 获得真实用户闭环的轻量 IDR/Composer 消费面；
- Phase 05 还应承担 Requirement、acceptance criteria 与 Project Reality provenance，不只是 repo scanner；
- Phase 06 还应包含 DevelopmentTask、CodingSession、change set/Git Diff 等稳定工作对象，不能只交付 Editor/LSP 外壳；
- Phase 07 的核心是 AI-first Development Runtime 与受控执行链，不只是 Terminal UI；
- Phase 08 还包含 Browser Preview，并需要说明为何 capability registry/execution physical tables在此落地、Generic MCP Adapter在 Phase 09 落地；
- “之后直接 Alpha Closeout”漏掉了 P0 的 Library foundation 与原冻结 Phase 10；
- Capture/Promote/Requirement/Build/Verify/Library 若没有明确阶段归属，P0 Hero Flows 无法在 Alpha Closeout 前闭合。

这意味着当前表格更像“工程主干摘要”，不是一份完整、可直接授权的 V0.1 Phase Baseline。

## 22. 文档之间发现的冲突或未闭合张力

1. **路线口径冲突已进入 Candidate 处理**：用户已授权 Remap；Candidate 保留 04–10 编号，把 Phase 04 重构为 Field Entry + Model Foundation，并保留 Phase 10 Continuity Library/Alpha Closure。它已同步 Reality/Decisions，但在用户接受前仍不取代 Frozen Map。
2. **Browse P0 口径未闭合**：Interaction Spec 的 Browse 列出 History、Downloads、Bookmarks foundation、DevTools；Phase 03 授权明确排除完整 History/Downloads/Bookmarks 产品，后续 Phase Map 也没有清晰归属。需要冻结“foundation”究竟指 Chromium 原生可用、最小 UI，还是 V0.1 不验收。
3. **Provider persistence/schema 缺口**：Technical Baseline 要求持久化 provider config metadata，Phase 04 又要 credential storage；但 Core Contract/schema 上限与 Phase growth map 没有 provider configuration/credential reference 的明确物理表。Phase 04 开工前需要 Contract/Schema/Migration 决定，secret 本身不得进普通 SQLite row。
4. **Phase 03 Complete 与 Installer Evidence 未对齐**：最新用户裁决已将 Phase 03 标为 COMPLETE；但 Installer cadence 冻结为 Phase 03/08/Final Alpha，而当前 `verify-phase03.ps1` 只做 package、portable 与 smoke，artifacts 中也没有 Installer。后续 closeout 必须记录 Installer 实际证据、明确补验，或由用户显式裁决该 checkpoint 的处理方式，不能悄悄把缺口写成已 PASS。
5. **Phase 03 Complete 与阶段 Evidence 文件部分未对齐**：当前 Phase 03 已有 Test Report、Build Info、Closeout Report、Full Gate log、acceptance JSON、截图和 portable ZIP，但没有独立 Known Issues 文件。该剩余缺口不推翻最新用户裁决，仍作为 closeout evidence debt 处理。
6. **Evidence 时序张力**：schema 把 `evidence` 表安排在 Phase 05，而 artifact store retention/encryption 仍开放到 Phase 08。Phase 05 必须明确 Project Reality provenance 使用哪一类 Evidence、是否只保存结构化/引用证据，以及敏感 artifact 在 Phase 08 前如何处理。
7. **Capability 时序张力已形成 Candidate 解法**：Frozen Schema 仍把 capabilities/capability_executions 与 verification tables 安排在 Phase 08；Remap Candidate 提议把 capabilities/executions 提前到 Phase 07 承载 Controlled Execution，Phase 08 消费它完成 Verification，Phase 09 只增加 MCP Adapter。该 timing change 仍须用户接受 Candidate 并在后续 Contract/Schema Freeze 中正式裁决。
8. **Phase 03 当前状态已同步**：Technical Architecture 当前状态块、Project Reality、Decision Log、README、Reading Report 与 manifest 已进入 Phase 03 COMPLETE 口径；历史 Slice 过程记录继续保留，不作为当前 verdict。
9. **原 Phase 03 的 Shell/Now 完整度不清**：架构 Map 写 Shell+Now+Browse Runtime，但实际 Phase 03 授权收紧为 Browse Foundation。现有 Shell/Now 可用不等于 P0 Shell/Now 已按最终 Alpha 验收完成，需要在后续 Alpha plan 中明确是已满足、后续 polish，还是仍有缺口。
10. **工作树事实与 Git 基线分离**：manifest 对当前 dirty 文件 39/39 匹配，但 HEAD 仍是 Phase 03 授权 baseline；当前重要 Reality、Decisions、Browser 实现与 Evidence 尚未形成可审计 commit/closeout 状态。

## 23. 仍未确定的问题

- Phase 03 Complete closeout 如何补齐/裁决 Installer checkpoint 与独立 Known Issues；Test Report、Build Info、Closeout Report 及最新用户裁决已同步进入当前 context pack；
- 用户本轮表格是对冻结 Phase Map 的简写，还是要求正式改变 V0.1 Baseline；
- Phase 04 的精确 slices：Provider contract、至少哪些真实 Adapter、streaming/tool/error/usage、config metadata、secure credential storage、Summon/Context Chips/IDR、Capture/Inbox/Promote 的边界与 Gate；
- Custom OpenAI-compatible endpoint 的网络/credential/SSRF 边界，以及模型调用的 external-send/cost policy；
- Phase 05 project scan architecture、symlink/junction、large/binary/secret exclusion、incremental fingerprint、provenance 与 Project Reality schema；
- Phase 06 Editor implementation、LSP host boundary、DevelopmentTask/CodingSession/change set、CodingAgentProvider/OpenCode/ACP viability；
- Phase 07 Windows PTY/ConPTY Adapter、process tree/cancel/encoding、Run/Git/Diagnostics 的权限与 Evidence 接口；
- Phase 08 Evidence artifact store、hash/retention/encryption、Browser Preview、Verification completion rule、capability execution基础与 Installer checkpoint；
- Phase 09 MCP protocol scope、stdio/network transport、discovery、authentication、timeout/cancellation、capability negotiation 与真实 Connector fixture；
- Library foundation 的正式阶段归属；
- History/Downloads/Bookmarks foundation 的 V0.1 验收口径；
- updater、code signing 与 Final Alpha Installer 技术；
- future Exchange ID/access/provenance、Capability Acquisition 与 Mandate 是否进入后续版本。

## 24. Gate 状态与下一步

本报告已完成首次只读上下文验收，并于 2026-08-16 获用户明确确认；首次只读 Gate 已解除。

用户同时授权基于本报告重排 Phase 04→V0.1 Alpha 路线，但明确不授权 Phase 04 Freeze 或 Implementation。独立 Candidate 位于 `docs/architecture/PHASE_04_ALPHA_REMAP_CANDIDATE_V0.1.md`，仍等待用户审查；Phase 03 Installer 与独立 Known Issues 的 closeout debt 继续显式保留。

## 25. 当前 ChatGPT 桌面版与 Fielora 规划能力对比（2026-08-16）

### 25.1 对比口径与总判断

本节依据 2026-08-16 可访问的 OpenAI 官方文档，而不是依据旧版 ChatGPT 印象或第三方宣传。它是竞争事实审计，不构成 Fielora Baseline Change，也不授权 Phase 04 实现。

当前 ChatGPT 桌面版已经被官方定义为复杂工作的“command center”，统一承载 ChatGPT Chat、ChatGPT Work 与 Codex，并覆盖本地项目、文件成品、浏览器、Computer Use、插件、长任务和开发工作流。[ChatGPT desktop app](https://learn.chatgpt.com/docs/app) [Get started with ChatGPT Work](https://learn.chatgpt.com/docs/get-started-with-work)

因此必须直说：如果 Fielora 的卖点只是“AI + Browser + Project + Coding + Terminal + MCP”，它已经没有足够产品差异。这些能力仍需要，但已经是进入竞争的基础设施，不是产品存在理由。

Fielora 仍可能成立的核心，不是“比 ChatGPT 多几个工具”，而是把工作组织单位从 chat/project/task 提升为持久的 Field Reality，并将 Capture、Requirement、Execution、Evidence、Verification 与 Resume 形成可追溯生命周期。最短的定位区分是：

> ChatGPT 擅长完成工作；Fielora 必须持续知道这项工作意味着什么、现在什么是真的、为什么是真的、产生了哪些可验证结果，以及跨天、跨工具、跨模型后从哪里继续。

### 25.2 逐项能力对照

| 能力 | 当前 ChatGPT 桌面版 | Fielora 规划 | 严格结论 |
|---|---|---|---|
| 产品组织中心 | ChatGPT / Codex，以及 Chat / Work；工作仍主要从 chat、project、goal/task 发起。 | Now / Browse / Field；Field 是 Goal、State、Objects、Relations、Activities、Evidence、Capabilities、Working Surface、Resume 的一级运行单位。 | 这是最重要的模型差异；若 Field 最终只是带文件的聊天项目，Fielora 失去成立理由。 |
| Project / 上下文 | Project 聚合 chats、files、instructions、sources；desktop 还可把本地目录作为 local project。[Projects and chats](https://learn.chatgpt.com/docs/projects) | Project/Development Field 保存结构化 Project Reality、Requirement、Task、provenance、current truth 与长期 Resume。 | “打开 repo 并理解项目”已是标配；差异只能来自持久、可修订、带来源的 Reality，而不是一次性 repo summary。 |
| 长任务与继续 | `/goal` 支持明确 outcome、constraints、verification、暂停/继续；云端 Work 可在应用关闭后继续，同一 chat/project 保持上下文。[Long-running work](https://learn.chatgpt.com/docs/long-running-work) | Resume 基于当前 Field Reality，不仅回到原 chat；Human 与 Agent 共享 State，并知道 blocker、next action、evidence 与 working surface。 | “长时间运行”和“恢复聊天”不再差异化；Fielora 必须证明恢复的是当前现实，而非对历史消息重新推断。 |
| Browser | 独立浏览器 profile，支持登录、历史、下载、地址栏搜索、浏览数据管理，并可交给 Computer Use 操作和验证。[Browser](https://learn.chatgpt.com/docs/browser) | Phase 03 已完成 Browse Foundation；长期重点是 Loose Browse / Field Boundary、Capture、Promote、Field Working Surface。 | ChatGPT 当前浏览器产品面明显更宽。Fielora 不应追逐通用浏览器 feature parity；只补可靠基础与真正进入 Field 生命周期所必需的能力。 |
| 桌面软件操作 | Computer Use 可看见并操作 GUI、跨应用工作；Windows 当前要求占用前台桌面。[Computer Use](https://learn.chatgpt.com/docs/computer-use) | 自己做轻量核心能力；专业工具经 Capability Connector 接入，并保存 reason、source、expected result、result-to-Field。 | “AI 会点软件”不是壁垒。Fielora 的价值只能是权限、意图、结果与 Field/Evidence 的编排，而不是更像宏工具。 |
| 文件与成品 | 可创建、预览、标注和迭代 documents、presentations、spreadsheets、PDF、HTML；成品可与聊天并排。[Work with files](https://learn.chatgpt.com/docs/artifacts-viewer) | 固定 Surface primitives + DXE，根据 Field State 编排工作面，并把 artifact 作为有身份、有关系、有来源的 Object。 | 仅做文档/表格/预览没有差异；DXE 必须体现 state-driven composition 和对象生命周期，同时避免任意 Generative UI。 |
| Coding / Existing Project | Codex 已覆盖本地/云环境、代码编辑、repo 指令、worktree、Git、代码审查和多客户端开发工作流。Review pane 可查看并 stage/revert/commit/push。[Code review](https://learn.chatgpt.com/docs/code-review) | Existing Project Takeover、DevelopmentTask、CodingSession、Editor/LSP、Git Diff、CodingAgentProvider 与 Field/Requirement/Evidence 关联。 | Repo understanding、Coding Agent、Git UI 已是强重叠区。Fielora 不应复制 Codex/IDE；应把 Requirement → Change → Test → Evidence 变成 Field-native contract。 |
| Terminal / Run | 每个桌面 chat 有 project/worktree-scoped terminal；可运行测试、脚本和 Git，并让 ChatGPT读取终端输出。[Integrated terminal](https://learn.chatgpt.com/docs/integrated-terminal) | Phase 07 PTY + Run/Git/Diagnostics + 受控执行链。 | Terminal UI 本身是标配；差异应在 execution identity、权限、取消、unknown outcome、artifact 与 Verification 归属。 |
| Verify | Goal 官方建议定义验证标准；Codex 可运行测试、读取失败输出、审查 diff。 | `Action completed ≠ Result verified`；Evidence/Verification 是持久领域对象，FAIL 保留，Fix 后 Replay，Requirement/Test/Evidence/Result 有可审计关联。 | 不能宣称 ChatGPT“不验证”。Fielora 的可竞争点是把验证从一次 agent 行为升级为持久、可查询、可重放、可审计的产品事实。Phase 08 是战略核心，不只是测试面板。 |
| 插件 / Connector / MCP | Plugin 可打包 skill、connector 与 MCP tools，并横跨 Chat、Work、Codex；本地 Codex host 支持 STDIO/HTTP/OAuth MCP。[Plugins](https://learn.chatgpt.com/docs/plugins) [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp) | 中立 Capability Connector Contract + 一个最小真实 Generic MCP Connector，闭合 Contract → Call → Result → Evidence。 | MCP 已是基础设施，Phase 09 不能当作核心差异化；应保持最小真实证明，把价值放在中立 Contract、policy、result/evidence semantics。 |
| 自动化 / 工作流学习 | 支持后台定时任务；macOS 还可 Record & Replay，把一次 GUI 演示转成可复用 skill。[Scheduled tasks](https://learn.chatgpt.com/docs/automations) [Record & Replay](https://learn.chatgpt.com/docs/extend/record-and-replay) | 通用自动化与“自动学会所有软件 workflow”不属于 V0.1；未来可能进入 Capability Acquisition。 | 这是后续竞争压力，但不应因此扩张 V0.1。先证明 Field Reality 与 Verify；否则只会在 OpenAI 已经强势的能力面追赶。 |
| 多模型 Provider | ChatGPT desktop 是 OpenAI 产品与账号体系主导的工作面；官方桌面能力文档没有把面向用户的跨 OpenAI/Anthropic/Google/Qwen 等可替换 Provider Contract 作为产品原则。 | Agent、Field、UI、业务逻辑与 Provider 解耦；统一 streaming/tool/error/usage/capability contract 与 credential boundary。 | Provider neutrality 仍是有效架构差异，但它主要是信任、可替换性和长期风险控制，不足以单独成为用户 Hero Flow。 |
| Capture / Inbox / Promote | 官方 Projects、files、sources 能保存上下文，但现有官方能力说明没有定义与 Fielora 相同的 Capture → Inbox → Promote → typed Object 生命周期。 | 任意状态快速 Capture，未归属内容进入 Inbox，经过用户意图后 Promote 为 Field/Requirement/正式 Object，并保留来源。 | 这是有价值的产品差异，但必须以低摩擦真实交互证明；若只是“上传文件到项目”，差异消失。 |
| Conversation 与 Reality | Chat、Project 与 Goal 能保留上下文，并可继续长任务。 | `Conversation is history; Field State is reality`；FACT/DECISION/ASSUMPTION/QUESTION/TASK/BLOCKER/RESULT 有 lifecycle 与 provenance。 | 这是 Fielora 最强的理论边界，也会是最难的 UX/正确性问题。V0.1 必须用 Hero Flow 证明它不是后台数据库概念。 |
| AI 视觉地位 | 产品入口和主要工作面仍以 Chat/Work/Codex 为中心，文件与浏览器可并排。 | AI 是随时召唤的系统能力，不是永久 Sidebar；默认 UI 以当前工作与 Field 主焦点为中心。 | 不应复制 ChatGPT 的模式切换和聊天中心布局。Fielora 的界面必须让用户先感知工作连续性，再感知 Agent。 |

### 25.3 对既定 Phase 04–09 的直接影响

1. **Phase 04 不能缩成 Provider 设置。** 多 Provider 是正确底座，但用户价值必须通过 Summon、Context Chips、Capture、Inbox 与至少一个真实模型调用纵向闭合。否则交付的是基础设施，没有 Fielora 体验。
2. **Phase 05 必须从“Repo Scanner”升级为“Persistent Project Reality”。** Repo 扫描、摘要与问答已被 Codex 商品化。真正 Gate 应验证 Requirement/acceptance criteria、typed facts、source/provenance、刷新与冲突处理、跨重启 Resume，而且 Understand 阶段不擅自改代码。
3. **Phase 06/07 必须保持薄工作面。** Editor/LSP/PTY/Git/Run 都要做，但不能以复制 IDE 或 Codex 为成功标准。成功标准应是 DevelopmentTask、CodingSession、change set、diagnostic、command execution 与 Field/Requirement 的可靠关联。
4. **Phase 08 应被视为战略 Phase。** Evidence identity/provenance 的骨架必须随 Phase 05/06 的工作对象出现，Phase 08 再闭合真实 Test → FAIL → Fix → Replay → Verified Result、artifact retention/encryption 与 Browser Preview。若 Evidence 到 Phase 08 才被临时外挂，前面对象会再次以聊天历史为事实源。
5. **Phase 09 只做最小、真实、可审计的 Connector proof。** 不以 connector 数量或 marketplace 为目标；OpenAI 已有更成熟的插件/MCP分发面，Fielora 要证明的是 provider/tool-neutral invocation 与 durable Evidence 回流。
6. **Alpha Closeout 不能省略 Phase 10/Library 归属。** Library 若只是文件列表没有价值；只有保留 Capture reason、source、Field relation、promotion history 与 verified output lineage，才属于 Fielora 的连续层。

### 25.4 最终竞争裁决

- **高度重叠、只能视为标配**：真实 Browser、AI 调用、Projects/local folder、repo understanding、Coding Agent、Terminal、Git/Review、Computer Use、文件成品、插件/MCP、长任务、定时任务。
- **仍可能构成 Fielora 核心差异**：Field 作为一级持续运行单位；Conversation/Activity 与 Reality 分离；Capture/Inbox/Promote；typed Object/State/Relation；跨工具 work lineage；Evidence/Verification 领域化；state-driven DXE；provider-neutral；以当前 Reality 为依据的 Resume。
- **最高产品风险**：这些差异目前大多是 contract 与架构语言。若 V0.1 的用户感知仍是“左边项目、中间聊天、右边工具”，市场会把它理解成较弱的 ChatGPT/Codex 替代品。
- **推荐战略**：不与 ChatGPT 争夺“最全 AI 工具箱”；集中证明一个完整 Hero Flow——从 Capture/Requirement 开始，接管已有项目，执行修改，产生真实失败与修复，保留 Evidence，第二天打开 Now 后基于 Field Reality 精确继续。这个闭环成立，Fielora 才具有独立产品定义。

本节记录的竞争审计已获用户确认。用户随后授权生成 Phase 04→Alpha Remap Candidate；Candidate 已独立写入 `docs/architecture/PHASE_04_ALPHA_REMAP_CANDIDATE_V0.1.md` 并同步 Reality/Decisions，但在用户明确接受前仍不取代 Frozen Phase Map，也不授权 Phase 04 Freeze 或实现。
