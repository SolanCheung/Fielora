# Fielora Codex 首次阅读报告

> 历史 Gate 记录：以下状态描述首次阅读当时的事实。当前状态以 `02_PROJECT_REALITY.md` 与 `artifacts/phase01/PHASE_01_CLOSEOUT_REPORT.md` 为准；Phase 01 已于 2026-08-14 裁决 COMPLETE。

状态：等待用户确认；确认前禁止进入实现  
阅读日期：2026-08-13  
上下文基线：`v0.1-context-baseline-2026-08-12`

## 1. Gate 结论

本轮已完成首次“只读上下文验收”。我先读取了仓库根目录 `AGENTS.md`，随后按照 `context_manifest.json.required_reading` 的顺序完整阅读全部资料，没有用关键词搜索替代通读，也没有跳过历史时间线。

完整性检查结果：14 项 required reading 全部存在，文件 SHA-256 均与 `context_manifest.json` 记录一致。

本轮除生成本报告外，没有修改产品代码、安装依赖、初始化技术栈、删除文件或改变 V0.1 边界。

## 2. 已完整阅读文件

1. `README.md`
2. `AGENTS.md`
3. `docs/context/00_CONVERSATION_INDEX.md`
4. `docs/context/01_CONVERSATION_TIMELINE.md`
5. `docs/context/02_PROJECT_REALITY.md`
6. `docs/context/03_DECISIONS.md`
7. `docs/context/04_REJECTED_DEFERRED.md`
8. `docs/context/05_SOURCE_ARCHIVE.md`
9. `docs/context/sources/Fielora_功能讨论_原始片段.txt`
10. `docs/product/COMPETITIVE_BOUNDARIES.md`
11. `docs/product/FIELORA_V0.1_INTERACTION_SPEC_CN.md`
12. `docs/architecture/TECHNICAL_BASELINE_V0.1.md`
13. `docs/architecture/TEST_AND_DELIVERY_BASELINE_V0.1.md`
14. `docs/context/READING_GATE.md`
15. `context_manifest.json`（用于读取 required reading、复核清单与哈希）

## 3. 未能读取的文件

无。

`context_manifest.json.historical_visual_assets` 中的图片是历史视觉证据，不属于 `required_reading`。本轮没有把它们当作当前视觉规范；以后进行视觉实现前，应按 `05_SOURCE_ARCHIVE.md` 查看，并始终以 Project Reality 和最新 Interaction Spec 为准。

## 4. 事实优先级

文档冲突时采用以下顺序：

1. 最新明确用户决定；
2. `docs/context/02_PROJECT_REALITY.md`；
3. `docs/context/03_DECISIONS.md`；
4. `docs/product/FIELORA_V0.1_INTERACTION_SPEC_CN.md`；
5. `docs/architecture/*`；
6. `docs/context/01_CONVERSATION_TIMELINE.md`；
7. 更早的构想和探索方案。

历史时间线用于解释“为什么改变”，不冒充逐字聊天记录；Project Reality 是当前正式事实源。

## 5. 方案如何演化，以及为什么改变

Fielora 最初是一个完整 AI Browser 构想，包含 Browser、Field、AI、Context、Web Action、Artifact、Capability、Automation 和 Trust。当时已经尝试把组织方式从 `Window → Tab → Page` 提升为 `Goal → Field → Context → Resource → Agent → Action → Result`，但 Field 仍可能退化为高级 Workspace 或 Tab Group。

随后 Chrome、Opera Neon、Dia、Comet、Tabbit、豆包等产品持续吸收 Vertical Tabs、Split View、AI Sidebar、页面总结、跨 Tab Context、多模型、Connected Apps、Browser Agent、MCP 和 Workflow。这说明“浏览器再多一些 AI 功能”会迅速商品化。原始讨论尤其指出：若 Fielora 仍表现为“左侧 Field/Tab + 中间网页/多 Pane + 右侧 AI”，无论视觉还是能力都会越来越像 Chrome。

因此方案没有继续堆面板，而是把差异化抽象上移：Browse 接受成熟浏览器习惯；真正差异发生在 Field。Field 从容器升级为持续运行单位，维护 Current Reality，并由 DXE 按任务状态编排 Working Surface。AI 也从永久侧栏改为可召唤、完成即隐退的系统能力。

之后，项目又从抽象的未来浏览器回到真实工作和生活链：快速 Capture、Idea 晋升、Requirement、开发、接管旧项目、Run/Test/Fix/Verify、创作与专业软件协同、休闲体验和长期 Library。由此形成 `Capture → Idea → Field → Requirement → Build → Verify → Result`，并确定 Coding 和 Existing Project Takeover 为 V0.1 最深的验证场景。

最后，为避免产品验证被底层平台工程吞没，V0.1 采用 Windows + Electron/Chromium + TypeScript/React + Rust Sidecar；Chromium 深度集成、Local LLM、App Platform、专业软件深度自动化和 Personal Steward 均保留为有条件的长期方向。

## 6. 当前正式产品定义

Fielora 不是以“AI 浏览器”为核心身份的产品。当前正式定义是：

> Fielora 是连接个人数字工作与生活的连续层，以 Field 为持续工作单位，以 Browser、Apps、AI、Agent 和 Capability 作为完成工作的运行能力。

Browser 是入口和 Runtime 之一，不是产品中心。第一目标是提升真实日常工作效率与生活质量，减少网页、对话、文件、IDE、测试工具、设计和创作软件之间切换造成的上下文断裂。

最高产品原则不是“把所有软件装进 Fielora”，而是“让用户的工作与生活在软件之间不再断掉”。

## 7. 去同质化原则

AI 问网页、总结、搜索、划词/截图问答、跨 Tab Context、Vertical Tabs、Tab Group、Split View、Browser Agent、网页操作、Multi-LLM、Connected Apps、MCP/WebMCP、Workflow 保存和 AI 收藏/笔记都属于 Foundation / Commodity。Fielora 可以拥有它们，但不能用它们回答“为什么 Fielora 必须存在”。

真正竞争层是：

- Continuity：恢复完整工作现场，而非只恢复 Tab；
- Lifecycle：Idea、Requirement、Implementation、Test、Result 属于同一条持续链；
- Field：把数字工作的一级单位从 App、Tab、Chat 提升为 Field；
- Dynamic Surface：工作面随 Current Goal 和 Current Reality 变化；
- Promotion：临时捕获自然成长为正式工作；
- Work Lineage：追溯想法、调研、决定、代码、测试和证据之间的关系；
- Human-Agent Shared State：Human 与 Agent 在同一个 Field State 中交接；
- Professional Tool Orchestration：连接成熟工具，并维持其工作上下文；
- Resume Reality：离开后恢复“现在真实到哪里了”；
- Personal Steward：从长期真实状态逐渐成长，而不是首版包装一个管家入口。

视觉审核必须检查：遮住 Logo 后是否仍只是 Chrome / Tabbit / 豆包加 AI Sidebar；是否因系统内部知道很多就把所有能力常驻展示；当前最重要的工作对象是否占绝对视觉主导。

## 8. Now / Browse / Field

### Now

回答“我现在最可能继续什么？”。它不是多卡片 Dashboard，也不提供 Productivity Score、图表或百分比。默认最多显示 3 个 Continue 项，聚焦 Field name、current focus、last active；空状态要给出一个清晰下一步。

### Browse

普通浏览状态，遵循成熟 Chrome 类习惯，包括导航、URL、Tabs、History、Downloads、Bookmarks foundation 和 DevTools 等。Browse 不为了视觉不同而破坏已验证的浏览器交互。AI 通过 Summon 临时出现，不设永久 AI Sidebar。

### Field

真正工作开始后的任务驱动环境。进入 Field 后，Tab 和 Page 降为资源或 Surface，不再作为一级组织单位；Browser Chrome 在视觉上降级。Field Header 只保留 Field name、current focus、一个当前 mode 及少量必要状态。

三态关系可概括为：浏览时像优秀浏览器；轻量 AI 随叫随走；事情成为持续工作时进入 Field。

## 9. Field

Field 不是 Tab Group、Workspace Folder、Project Folder、Chat Session 或 Note Collection。它是有目标、状态、对象、关系、活动、证据、能力、策略、工作面和恢复状态的持续运行单位。

内部可以维护 Goal、State、Object、Relation、Capability、Human、Agent、Activity、Evidence、Artifact、Policy、Surface，但这些内部复杂度不应全部暴露给用户。默认 UI 只保留一个主焦点，最多两个辅助区域。

Field 使 Human 和 Agent 共享同一现实：Agent 的行动应留下 Actor、Intent、Action、Target、Before、After、Evidence 等可追溯信息；用户可以接管，Agent 再基于更新后的共享状态继续。

## 10. Capture / Inbox / Promote

### Capture

任何状态下快速记录 text、selection、page、screenshot、file、media timestamp 等。默认先保存，不强迫用户填写 Tag、Folder、Project、Priority 或 Deadline。保存后应迅速返回原工作，避免捕获动作本身破坏上下文。

### Inbox

尚未确定归属的内容过渡区，可包含文字、Idea Candidate、Web Reference、Screenshot、Image、File、Audio/Video Timestamp。整理动作包括 Attach to Field、Keep in Library、Promote 和 New Field。Inbox 不是长期知识库。

### Promote

仅表示临时对象晋升为更持久、正式的工作对象。V0.1 包括 Capture → Idea、Idea → Field、Browse Resource → Field Resource、Discussion → Field Work、Field Discovery → Requirement。普通移动、附加或分类不应滥用 Promote。

核心成长链是：`Capture → Idea → Field → Requirement → Build → Verify → Result`。

## 11. Field State

V0.1 状态类别为 FACT、DECISION、ASSUMPTION、QUESTION、TASK、BLOCKER、RESULT。重要状态应保留来源，并明确区分用户确认与 AI 推断。

核心原则是：

> Conversation is history; Field State is reality.

Conversation 记录“发生过什么”，不能自动代表当前仍然为真；Field State 保存“现在什么是真的”，是 Resume、Agent 继续工作、DXE 编排和验证状态的事实基础。聊天内容只应在有价值时沉淀为 summary、source、evidence、decision 或 question，而不是盲目保存所有 token 当作事实。

## 12. Summon / Context Chips / Progressive Context

AI 是系统级可召唤能力，不是常驻视觉区域。入口包括全局快捷键、顶部轻量 `✦` 和 Selection Action。

简单 Ask 在约 520–620px 的轻量 Overlay 内完成，Esc 或点击外部即可关闭，不为每次询问创建永久 Chat。问题扩大时可 Expand 为 Temporary Surface；只有成为持续工作时才 `Continue in Field`，对应 `Ask → Explore → Work`。

Context Chips 显式展示本次请求携带的上下文，例如当前页面、选择内容、Field、Requirement 和显式 `@` 引用，并允许移除，避免“模型暗中拿了什么上下文”不可见。

Progressive Context 的默认顺序是：Current Selection → Current Page → Current Focus → Current Field Minimal State → Explicit References。默认不得把全部 Tabs、History、Fields 或 Library 一股脑传给模型；上下文应按意图逐步扩张。

## 13. IDR 当前边界

IDR 是轻量 Intent + Referent Resolution，不是独立重型产品、通用规划器或另一个 Agent。

V0.1 Intent：NAVIGATE、SEARCH、ASK、CAPTURE、OPEN、CREATE、CONTINUE、CHANGE、ACT。

输入包括 Current Runtime、Current Field、Current Surface、Current Focus、Current Object、Current Page、Current Selection、Recent Activity、显式引用和 User Input；输出包括 intent、referent[]、expected_change、confidence、ambiguity。能安全推断时不重复追问，存在实质歧义时保留 ambiguity。

## 14. DXE 当前边界

DXE 是 `Field State + Intent + Current Goal + Available Objects/Capabilities → Working Surface` 的编排能力，不是让 LLM 任意生成 React UI。

V0.1 只能从固定 Surface Primitive 中 select、arrange、resize、focus、collapse、replace。Primitive 包括 WebPane、DocumentPane、CodePane、TerminalPane、PreviewPane、RequirementPane、TaskPane、TablePane、MediaPane、ReferencePane、EvidencePane、ConversationPane、ExternalAppPane。

默认一个 Primary Pane，占约 65–75% 视觉权重，最多两个 Supporting Pane；Context Inspector 仅按需显示 Sources、Activity、Details 或 Evidence。采用固定原语是为了稳定、可测、可控，同时仍能让工作面随任务自然变化。

## 15. Development Field

Software Development Field 是 V0.1 最深场景，生命周期为：

`Idea → Requirement → Research → Design → Build → Run → Test → Fix → Verify → Result`

它不是强制瀑布流程，而是一条可往返、可追溯的工作链。Build Surface 默认是 `Requirement | Code | Preview`，Terminal 可折叠；Verify Surface 是 `Test Cases | Real Product | Evidence`。

Requirement 最小字段包括 id、title、goal、description、acceptance_criteria[]、status、source_refs[]、implementation_refs[]、test_refs[]。AI 可以生成草稿，但不能自动伪装成用户已确认。

## 16. Existing Project Takeover

接手已有前端或全栈项目是 V0.1 Hero Flow。用户选择本地目录后必须先进入 `Understand Project`，初始阶段不得修改源码。

扫描范围包括 repository tree、package files、README、Git/历史、routes、components、API、config、tests、build、backend 和 database references。产出是持久化的 `Project Reality`，后续随着项目变化增量更新。

其意义不是单次生成 repo 摘要，而是先建立可信的当前项目现实，让后续 Change Request、Implementation、Test、Evidence 和 Resume 都有稳定依据。

## 17. Requirement → Code → Test → Evidence

Requirement、Implementation、Test 和 Evidence 必须持续建立关系，形成 Work Lineage：需求从哪里来、哪些资料支持决定、哪些文件或变更实现它、哪些真实测试验证它、结果依据是什么。

小改动不强制完整 PRD，可使用轻量 Change Request，并关联 requirement、affected UI/files/API、tests 和 evidence。

Build 完成只代表 `Action completed`。Verify 必须针对真实产品或真实运行结果执行测试，并保留 Screenshot、Console、Network、Logs 等 Evidence。FAIL 必须保持 FAIL；修复之后需 `Replay Test`，真实 PASS 后才能更新为 `Result verified`。

## 18. 专业软件边界

Fielora 自己做跨场景、高频、核心、轻量的连续性能力：Capture、Inbox、Field、Notes、Requirement、Research、Library、Coding 基础工作面、Verify、AI 交互和简单创作辅助。

Fielora 不重做 Blender、CAD、专业图像、专业视频、专业 DAW 等成熟工程软件。原因不是这些场景不重要，而是成熟工具已经积累复杂编辑能力、格式、性能、生态和专业工作流；重做会把资源消耗在重复基础设施上，削弱 Fielora 真正的连续性价值。

Fielora 负责保留“为什么打开工具、当前任务是什么、源文件是什么、预期输出是什么、结果应回到哪个 Field”，让外部专业工具成为完整工作链中的能力节点。

## 19. Capability Connector

Capability Connector 是连接外部成熟工具能力的统一抽象，后端可落到 MCP、API、CLI、Plugin、Extension、Browser Extension 或 Native Bridge。

V0.1 核心是定义可替换 Contract，并落地最小真实 Connector；未实现能力不得伪装为成功。深度专业软件自动化延后。Connector 还必须纳入权限与证据边界，至少区分 read、local write、external send、destructive action、credentials、payments 和 permission elevation。

## 20. Coding IDE 原则

Coding 是专业工具边界中的特殊例外：它位于 Fielora 最高频的端到端链 `Idea → Requirement → Code → Run → Browser → Debug → Test → Fix → Verify`，与 Field State、Agent、Browser Preview 和 Evidence 的耦合远深于偶尔打开某个专业创作工具，因此需要成为一等工作流。

V0.1 Coding 必须提供 Project Tree、Code Editor、Syntax Highlight、Basic LSP、Search、Terminal、Git Diff、Diagnostics、Run、Browser Preview。

但一等工作流不等于从零重造完整 IDE，也不等于直接复制 VS Code 或其他成熟项目的源码/产品结构。原则是研究成熟高质量、高星开源 IDE/Editor 的 Editor、LSP、Git、Terminal 等基础架构，再围绕 Field、Agent、Context、Requirement 和 Verify 重新设计；Editor 保持模块化。

## 21. Multi-LLM 与 Local LLM 边界

Fielora 必须 Provider-neutral，不能把 Agent、Field、UI 或业务逻辑写死到单一模型厂商。统一 Provider Interface 至少抽象 chat/responses、tool calling、streaming、usage、errors 和 model capabilities，目标可接 OpenAI、Anthropic、Google、Qwen、MiniMax、OpenAI-compatible 及其他 Provider。

V0.1 可以提供数据驱动的 Provider 配置和 `Model: Automatic`，但 Multi-LLM 本身也只是基础能力，不是核心差异化。

Local LLM 是长期可添加的 Provider 增量，V0.1 明确不实现。原因是 GPU 适配、模型 Runtime、下载与管理、资源调度、性能/兼容性和分发会抢占验证 Field、Continuity、Resume、Build/Verify 等核心产品假设的资源。

## 22. App Runtime

Chromium 长期不只可以浏览 Web，也可能同时成为 Browser Host 与 Fielora App Host。但 V0.1 不以构建 Fielora App Platform 或 Marketplace 为目标；App Runtime 只有在服务工作连续性时才有价值，不能反过来主导产品。

当前应保留 Browser Adapter 边界。只有当完整 Extension compatibility、Browser Process 深层控制、Profile、Network、自定义 Chromium capability、更严格 sandbox 或 Electron 无法达到的 Browser UX 成为核心阻塞时，才沿 `Electron Validation → Browser Adapter Boundary → Deeper Chromium Integration → Fork only if justified` 评估。

## 23. Personal Steward

长期方向是 Fielora 从真实 Field、Activity 和 Preference 中逐步理解用户工作与生活，成长为 Personal Steward / Butler。路径是“当前 Field → 多 Field → 工作习惯 → 更多生活连接 → Personal Steward”。

V0.1 不设置一个虚假的“AI 管家”入口，也不做完整人生管理。Steward 必须建立在长期、可信、可追溯的真实状态上，而不是靠人格化文案或一次性聊天假装理解用户。

休闲状态也不能为了喂养 Steward 而被生产力化：电影、视频和音乐默认 Minimal UI、No task spam、No agent spam，只由显式 Summon/Capture 打断。

## 24. V0.1 P0 范围

- Shell、Now；
- Inbox、Universal Capture；
- Browse foundation；
- Summon、Selection Action、Context Chips、Progressive Context；
- Field、Field Resume；
- Composer + IDR Contract；
- 固定 DXE Surface Primitives；
- Idea → Requirement；
- Development Field；
- Existing Project Takeover 与持久化 Project Reality；
- Basic Code Workspace、Terminal、Git Diff、Browser Preview；
- Build、Verify、Fix → Replay、Evidence；
- Library foundation；
- Multi-provider foundation；
- Capability Connector interface，以及技术基线要求的最小真实 Connector。

Field Resume 是 Hero Feature，至少恢复 current_focus、surface_layout、open_objects、current_mode、active_requirement、active_file、active_preview、open_questions 和 last_activity，并提示外部变化及建议继续位置。

## 25. V0.1 明确不做

- Local LLM Runtime；
- 完整 Blender、Photoshop 类图像编辑器、Video Editor、DAW、CAD 替代；
- Arbitrary Generative UI；
- Agent Marketplace、Capability Marketplace；
- Multi-Agent Society；
- 完整人生管理；
- 任意桌面软件完全自动化；
- 自动学习所有网站/软件 Workflow 或完整 Capability Compiler 自动化；
- 完整 Fielora App Marketplace；
- Enterprise Admin；
- 第一阶段直接 Fork Chromium；
- 从零重造完整 IDE；
- 永久 AI Sidebar、永久 Field State Dashboard、永久 Agent Activity 面板；
- 五个 Mode 按钮常驻、多等权重 Dashboard 卡片、全部内部 State/Graph 常驻展示；
- Leisure Productivity Dashboard。

## 26. Windows / Electron / TypeScript / Rust 技术决定

目标是 Windows 11 x64 本地桌面应用，不以 Browser Extension 或 Web SaaS 为第一版主交付形态。

- Desktop Host：Electron + bundled Chromium，用于尽快验证 Browser + Field 产品范式；
- UI：TypeScript + React，负责 Shell、Now、Inbox、Browse UI、Field UI、Composer/Summon、Context Chips、DXE Surface、Code Workspace UI；
- Core：Rust Sidecar Process，负责 Field Runtime/State、Context、IDR、Agent orchestration、Provider、Capability、Evidence、Persistence、Existing Project analysis、Files/Git/Native integration；
- Python：仅 Research、Eval、Benchmark、实验和测试数据工具；
- C++：V0.1 不作主语言，只在未来 Chromium 深层集成确有必要时作为薄 Adapter。

建议进程边界为 Electron Main 管 Browser/WebContents 与桌面生命周期，Renderer 管 React/TS UI，`fielora-core.exe` 管 Core。Renderer 通过受控 IPC 调用 Rust；Rust 不直接操作 React DOM；Electron Main 不拥有 Field business truth；Field/State/Evidence 的事实源位于 Core/Persistence。

持久化采用 Local-first，Fields、State、Capture、Inbox、Library refs、Requirements、Project Reality、Evidence、Resume Snapshot、Provider config metadata 都应进入正式持久化层，不能让 UI localStorage 成为核心事实源。

Electron 是 V0.1 验证宿主，不是永久架构承诺；同时也不允许 Electron API 渗入 Field Core，以保留未来替换 Browser Host 的空间。

## 27. 测试、打包与人工验收

“`pnpm dev` 能打开窗口”不是完成定义。重要 Phase 必须覆盖：Static、Unit、Rust、Integration、Electron E2E、Package、Packaged Smoke、Human Acceptance。

Rust 至少执行 `cargo test --workspace`、`cargo clippy --workspace --all-targets`、`cargo build --release`，核心 State、Permission、Evidence、IDR、Capability 逻辑应能脱离 Electron 测试。

TypeScript 要覆盖 reducers、interaction state、Context Chips、Surface layout、Composer routing client、UI components 和 persistence client boundary。Integration 要验证 UI ↔ Rust Core、Field persistence、Resume、Provider errors、Browser context extraction 和 Project Reality persistence。

Electron E2E 必须真实启动 Desktop App，并覆盖 A–H：Capture、Browse Ask、Promote、Resume、Idea → Requirement、Existing Project Takeover、Build、Verify。

每个可验收 Phase 应产出 Packaged Build。交付物包括 Portable Windows Build、Installer（按阶段成熟度验证并在最终交付提供）、Test Report、Build Info、Known Issues。Packaged Smoke 要验证 App、Rust Sidecar、resource/persistence path、无 dev-only 环境依赖、Browser、Capture、Field Resume 和权限差异。

自动化 PASS 仍不能代替 Human Experience Gate。人工要检查 Summon 是否打断、Capture 是否够快、UI 是否杂乱、Browse 是否自然、Field 是否真正不同于 AI Browser、Surface 切换是否自然、Resume 是否减少重建上下文、Agent 是否过度打扰、Error/Loading 是否破坏工作区，以及字体、间距和视觉层级。

阶段通过的条件是 `Engineering Gate PASS + Human Experience Gate PASS`。阶段报告不能只写“已完成”，必须报告 Build、Rust/TS/Integration/E2E 数量、Packaged Smoke、Acceptance Scenarios、Artifact 路径和 Known Issues。

## 28. 明确否决项

1. 永久 AI Sidebar：同质化、占屏，违背随叫随走；
2. Field = Tab Group / Workspace：不能维持 Current Reality，也无法建立持续生命周期；
3. Arbitrary Generative UI：不稳定、难测试、体验不可控；
4. 永久展示全部 State / Graph：内部重要不等于用户需要常看；
5. 重做 Blender / CAD / 专业视频 / DAW 等：偏离连续性核心价值；
6. 从零发明完整 IDE：重复成熟基础设施；
7. V0.1 Local LLM：吞噬核心验证资源；
8. V0.1 直接 Fork Chromium：过早陷入浏览器底层工程；
9. Leisure Productivity Dashboard：降低生活体验。

## 29. 延后但保留

- 更深 Chromium Integration / Fork：Electron 成为实质阻塞后评估；
- Local LLM：以后作为 Provider 增量；
- Fielora App Runtime：长期方向，当前只服务连续性；
- 专业软件深度 MCP / Plugin 自动化：V0.1 先做 Connector Contract/最小真实连接；
- Creative Field 深化：不在首版重做完整编辑器；
- Personal Steward / Butler：从长期真实状态成长；
- Capability Compiler 全自动化；
- Agent / Capability / App Marketplace；
- Multi-Agent Society。

## 30. 文档冲突与口径差异

以下问题没有静默修正：

### C-001 `Ctrl/Cmd + Shift + Space` 同时指向 Capture 与 Summon

Interaction Spec 第 7 节把它定义为 Capture 快捷键基线；第 11 节说 Browse Summon 入口包括全局快捷键；第 37 节又把同一组合键明确写为 `Summon Fielora`。可能的产品意图是同一 Summon/Composer 中包含 Capture，但当前文字没有明确说明按键后默认是 Capture 浮层还是通用 Summon。实现前必须冻结单一行为。

### C-002 测试链顺序表述不一致

Project Reality 写为 `Unit → Integration → Rust → Electron E2E → Package → Packaged Smoke → Human Experience Acceptance`；Test & Delivery Baseline 写为 `Static → Unit → Rust → Integration → E2E → Package → Packaged Smoke → Human Acceptance`。是否必须先 Rust 再 Integration，以及 Static 是否独立 Gate，文字顺序不完全一致。按事实优先级两者层级不同，但专项测试基线更具体；正式执行前仍应统一文档。

### C-003 Chrome Extension compatibility 是“目标”而非 V0.1 已承诺结果

Interaction Spec 的 Browse 基线写有 `extension compatibility target`；Technical Baseline 明确“完整 Chrome Extension compatibility 不作为 Electron V0.1 已解决事实”，若成为核心需求需单独评估 Chromium 深度集成。二者可解释为长期目标与当前能力边界，但验收范围尚未量化，不能把“target”实现成“V0.1 保证完整兼容”。

### C-004 Installer 的阶段要求存在口径松紧差异

Project Reality 的交付标准表述为至少包含 Portable Windows build、Installer、Test Report、Known Issues、Build Info；Test & Delivery Baseline 又说明内部 Alpha 可 Portable 优先、Installer 在稳定后必须，并要求定期验证，最终交付必须带 Installer。需要在 Phase 计划中明确从哪个阶段起 Installer 是硬 Gate。

### C-005 Capability Connector 的 P0 深度需进一步冻结

Project Reality 和 Interaction Spec 的 P0 强调 `Capability Connector interface`；Technical Baseline 要求“Contract 和最小真实 Connector”。这不是方向冲突，但会直接影响 V0.1 验收：必须明确最小真实 Connector 连接什么能力、成功/失败证据和权限边界是什么，不能只交接口，也不能擅自扩成专业软件深度自动化。

### C-006 当前工作目录与用户给出的 GitHub 地址尚未建立可验证关系

用户提供地址 `git@github.com:SolanCheung/Fielora.git`。当前工作目录执行 Git 只读检查时返回“not a git repository”，没有 `.git` 元数据，因此无法在本轮验证 remote、branch 或 commit。该情况不是产品文档冲突，也不影响阅读 Gate，但进入工程阶段前需要确认工作区来源或初始化/克隆策略；在用户确认报告前不得擅自处理。

除上述项目外，没有发现需要推翻 Project Reality 的硬冲突。早期“完整 AI Browser”“Field 偏 Workspace”“密集多面板 UI”等属于明确的历史演化或已否决方案，不应与当前定义合并。

## 31. 仍未确定的问题

产品/交互待冻结：

- Capture 与 Summon 的快捷键及入口关系；
- Browse 的 Chrome Extension compatibility 在 V0.1 的精确范围和验收条件；
- Capability Connector 的最小真实后端、用例、权限和 Evidence；
- Installer 从哪个可验收 Phase 起成为硬性要求；
- App Runtime 在 V0.1 中除边界预留外是否存在任何可验收表面能力。

Technical Architecture 评审前待冻结：

- Persistence DB；
- Rust IPC transport；
- Electron tab / webContents model；
- Code editor implementation；
- LSP host boundary；
- Terminal PTY；
- Project scan architecture；
- Provider credential storage；
- Updater 与 code signing；
- 精确 sandbox / permission model。

这些事项不得在未评审时被实现成不可替换的深耦合方案。

工程环境待确认：

- 当前目录为何没有 `.git` 元数据，以及它与 `git@github.com:SolanCheung/Fielora.git` 的关系；
- 当前仓库是否已有产品代码、原型或仅有 context pack，应在报告获确认后再做只读工程盘点。

## 32. 理解校验

### 1. 为什么 Field 不是 Tab Group？

Tab Group 只组织页面，中心仍是 Tab/Page；关闭、跨工具或过一段时间后，它通常不能表达目标、当前事实、决定、假设、任务、阻塞、实现、测试、证据、Human/Agent 活动和恢复位置。Field 是有生命周期和 Current Reality 的持续运行单位，网页只是它的一类资源或 Surface。若把 Field 做成 Tab Group，就会失去 Continuity、Work Lineage、Resume 和 Shared State，也会重新落入普通 AI Browser 的 Workspace 同质化。

### 2. 为什么 Fielora 不能靠 AI Sidebar 作为差异化？

因为 AI Sidebar、页面总结、跨 Tab Context、Connected Apps 和 Browser Agent 已被主流浏览器快速商品化；永久侧栏还会占屏、制造“AI 在工作旁边”的割裂感，并诱导把所有内部能力常驻显示。Fielora 的差异是 AI 与 Human 在同一 Field State 中工作、按需 Summon、把有效结果沉淀进完整生命周期，而不是多一个聊天面板。

### 3. 为什么 Browse 可以像 Chrome，但 Field 不应像 Chrome？

Browse 解决的是成熟、通用的页面导航问题，复用用户已掌握的 Chrome 类习惯能降低成本，不应为了不同而不同。Chrome 的一级抽象仍是 Page/Tab；Field 的一级抽象是 Goal/Current State/Working Surface。若 Field 仍表现为左 Tabs、中网页、右 AI，它就没有表达任务驱动工作环境，Fielora 的核心差异会消失。因此 Browse 可以熟悉，Field 必须让当前目标和主工作对象主导，Browser 仅是 Surface 之一。

### 4. 为什么专业软件不应在 Fielora 中重做？

Blender、CAD、专业图像/视频/DAW 已拥有深厚的格式、编辑、性能、插件和行业工作流。重做它们成本巨大、验证周期长，而且不解决 Fielora 最核心的上下文断裂。Fielora 应通过 Capability Connector 调用它们，同时维护 reason、task、source、expected output 和 result destination，使专业工具留在连续工作链中。

### 5. 为什么 Coding 是例外，需要更深的一等工作流？

Coding 贯穿 V0.1 最高频 Hero Chain：Idea、Requirement、Code、Run、Browser、Debug、Test、Fix、Verify。它与 Field State、Requirement、Agent、Preview、Git Diff 和 Evidence 需要高频、细粒度、可追溯联动，单纯“Open in external IDE”无法验证 Fielora 的核心生命周期。因此 V0.1 需要较深的 Code Workspace；但仍复用成熟 Editor/LSP/Git/Terminal 思路，不重造完整 IDE。

### 6. 为什么 Build 完成不能直接等同 Verify PASS？

Build 只能证明某个修改动作已完成，不能证明需求已满足、真实产品可运行、没有回归或测试证据可信。Verify 必须运行真实测试并观察 Real Product，保存 Screenshot、Console、Network、Logs 等 Evidence；失败就保持 FAIL。修复后还要 Replay，真正 PASS 才能更新结果。否则 Field State 会把 Agent 的行为误记为产品事实。

### 7. 为什么 Local LLM 不进入 V0.1？

Local LLM 会引入 GPU/驱动适配、模型下载与管理、Runtime、量化、资源调度、性能兼容和分发维护等大工程，直接挤占 Field、Capture/Promotion、Resume、Existing Project Takeover 和 Build/Verify 的核心验证资源。Provider-neutral 抽象已为未来加入本地 Provider 留出位置，因此现在延后不会锁死方向。

### 8. 为什么 Electron 当前只是 V0.1 验证宿主而不是永远的产品边界？

Electron + bundled Chromium 能以较低基础设施成本快速验证 Browser + Field 范式，并交付 Windows 桌面构建，避免首版陷入 Chromium C++。但未来若完整 Extension compatibility、Browser Process、Profile、Network、更严 sandbox 或独特 Browser UX 成为核心壁垒，Electron 可能不足。因此 Field Core 放在 Rust Sidecar、Electron API 不渗入业务事实层，并保留 Browser Adapter 边界；是否深度集成或 Fork Chromium必须由真实阻塞证明，而不是预先承诺。

## 33. Gate 状态

本报告生成后，首次阅读 Gate 进入“等待用户确认”状态。在用户明确确认 `CODEX_READING_REPORT.md` 正确之前，不进入产品设计落地、架构冻结、编码、依赖安装、技术栈初始化、删除或重构。
