# Fielora V0.1 交互规格

状态：V0.1 Baseline Freeze / 实现基线  
平台：Desktop；Windows 11 x64 为唯一正式验收平台  
目标：Codex 可直接据此实现 V0.1 产品闭环。

## 1. 核心定义

> **浏览时，它是一款熟悉而优秀的浏览器；需要一点 AI 时，它是随时出现、完成后立即隐退的系统能力；当一件事情真正成为工作时，它进入 Field，并成为持续保存目标、状态、工具、AI 与工作现场的任务驱动环境。**

## 2. 一级状态

- NOW
- BROWSE
- FIELD

## 3. 全局 Shell

桌面基线：最低 1280×720，主设计 1440×900。

左侧导航展开约 220px，折叠约 56px。

一级导航：Now / Inbox / Fields / Library / Apps & Web / Settings。

头像只在全局右上角出现一次。Settings 只保留一个一级入口。

## 4. Now

目的：回答“我现在最可能继续什么？”

默认最多展示 3 个 Continue 项。每项只显示 Field name、current focus、last active。

不显示 Productivity Score、图表、百分比、复杂 Dashboard。

空状态必须提供一个明确下一步。

## 5. Composer

NOW：`询问、打开、创建、记录或继续……`

BROWSE：`询问、搜索、记录或执行……`

FIELD：`询问、修改、运行或继续……`

内部可称 Universal Composer，但 UI 不显示该标签。

## 6. IDR Intent

V0.1：NAVIGATE / SEARCH / ASK / CAPTURE / OPEN / CREATE / CONTINUE / CHANGE / ACT。

Referent 输入：Current Runtime、Current Field、Current Surface、Current Focus、Current Object、Current Page、Current Selection、Recent Activity、Explicit @ References、User Input。

输出：intent、referent[]、expected_change、confidence、ambiguity。

能安全推断时不要重复提问。

## 7. Capture

Capture 不设置独立一级快捷键。`Ctrl/Cmd + Shift + Space` 统一打开 `Summon Fielora`，再由 IDR 将“记一下”“保存这个”等输入解析为 CAPTURE Intent。

浮层约 480px，默认只显示输入、当前 Context、保存。

禁止默认要求 Tag / Folder / Project / Priority / Deadline。

可自动保存：content、created_at、source_type、source_title、source_uri、current_field_id、selection、screenshot、media_timestamp、file_reference。

保存后显示约 1 秒 `✓ 已记录`，立即回到原工作。

## 8. Inbox

V0.1 item：Text / Idea Candidate / Web Reference / Screenshot / Image / File / Audio or Video Timestamp。

整理动作：Attach to Field / Keep in Library / Promote / New Field。

Inbox 是过渡态，不是长期知识库。

## 9. Promote

V0.1 支持：

- Capture → Idea
- Idea → Field
- Browse Resource → Field Resource
- Discussion → Field Work
- Field Discovery → Requirement

只有“晋升为更长期正式工作对象”才使用 Promote。

## 10. Browse

保持成熟浏览器习惯：Back / Forward / Reload / URL Search / Tabs / New & Close Tab / History / Downloads / Bookmarks foundation / DevTools。

完整 Chrome Extension compatibility 只保留 future compatibility target，不属于 V0.1 验收条件，也不得推动 V0.1 提前进入 Chromium Fork。

**禁止永久 AI Sidebar。**

## 11. Browse Summon

入口：全局快捷键 `Ctrl/Cmd + Shift + Space`、顶部轻量 `✦`、Selection Action。

默认浮层约 520–620px。

Context Chips 可显示：当前页面、已选文字、Field、Requirement、Explicit @ Reference。Chips 可移除。

## 12. Progressive Context

默认上下文顺序：Current Selection → Current Page → Current Focus → Current Field Minimal State → Explicit References。

默认不把全部 Tab、全 History、全部 Fields、全 Library 一起传给模型。

## 13. Selection

选中文字 / 代码 / 图片时，只出现小 `✦`。

文字动作：询问 / 解释 / 记录 / 加入 Field。

代码动作：解释 / Review / 用于项目。

图片动作：询问图片 / Capture Reference / 加入 Field。

## 14. Lightweight Ask

简单 Ask 在浮层中回答。Esc 或点击外部关闭。不为每次 Ask 创建永久 Chat。

## 15. Expand / Continue in Field

问题扩大时 Summon 可扩大为 Temporary Surface。

真正成为持续工作时显示 `Continue in Field`。

只持久化有价值的 summary / source / evidence / decision / question，不盲存所有聊天 token。

## 16. Field

进入 Field 后 Browser Chrome 视觉降级。

Header 只显示 Field name、current focus、mode、可选 blocker/question count、sync、overflow。

内部 Mode：Explore / Think / Build / Operate / Verify；UI 只显示一个，例如 `Build ▾`。

## 17. DXE Surface Primitive

V0.1 允许：WebPane / DocumentPane / CodePane / TerminalPane / PreviewPane / RequirementPane / TaskPane / TablePane / MediaPane / ReferencePane / EvidencePane / ConversationPane / ExternalAppPane。

DXE 只可 select / arrange / resize / focus / collapse / replace。禁止任意生成 UI。

## 18. Surface Density

默认 1 个 Primary Pane，最多 2 个 Supporting Pane，Context Inspector 按需出现。

Primary 视觉目标约 65–75%。禁止默认七八个区域同屏。

## 19. Context Inspector

不是固定 AI 侧栏。按需显示 Sources / Activity / Details / Evidence，一次只显示当前最相关项。

## 20. Field Resume

Resume 是 Hero Feature。

重新进入时告诉用户上次正在做什么、未解决事项、是否有外部变化、推荐继续位置。

恢复：current_focus、surface_layout、open_objects、current_mode、active_requirement、active_file、active_preview、open_questions、last_activity。

目标是恢复“工作现场”，不是只重开 URL。

## 21. Software Development Field

生命周期：`Idea → Requirement → Research → Design → Build → Run → Test → Fix → Verify → Result`。

不是强制瀑布。

## 22. Requirement

最小字段：id / title / goal / description / acceptance_criteria[] / status / source_refs[] / implementation_refs[] / test_refs[]。

AI 可生成草稿，但不得自动标为用户确认。

## 23. Idea → Requirement

Think Surface 至少显示 Original Idea / Current Understanding / Open Questions / Explore / Turn into Requirement。

原始 Idea 保留并建立关系。

## 24. Build Surface

默认：`Requirement | Code | Preview`，Terminal 可折叠，Pane 可 Resize。

## 25. Coding V0.1

必须：Project Tree / Code Editor / Syntax Highlight / Basic LSP / Search / Terminal / Git Diff / Diagnostics / Run / Browser Preview。

不做完整 VS Code，Editor 保持模块化。

## 26. Existing Project Takeover

入口：`打开现有项目`，选择本地目录，先进入 `Understand Project`，初始不得修改源码。

扫描：repo tree / package / README / Git / routes / components / API / config / tests / build / backend / DB references。

形成 `Project Reality`，后续增量更新。

## 27. Change Request

小改动不强制完整 PRD。创建轻量 Change Request，并尝试关联 requirement / affected UI / affected files / affected API / tests / evidence。

## 28. Verify

触发：“测试刚才修改”“验证需求”“跑测试”。

Surface：`Test Cases | Real Product | Evidence`。

Evidence 可含 Screenshot / Console / Network / Logs。

FAIL 必须保持 FAIL，不允许因为 Agent 写完代码就自动完成。

## 29. Fix → Replay

Agent 修复后执行 `Replay Test`，验证真正 PASS 才更新结果。

## 30. Agent Activity

不永久占屏。默认一行状态，例如 `● 正在测试导出流程……`，点击后展开 Inspector。

状态：Planning / Reading / Acting / Waiting / Verifying / Completed / Failed / Needs Input。

## 31. Human Takeover

Agent 操作 Browser / Tool 时，条件允许必须可 `接管`。用户操作后 Agent 读取新的共享 Field State 继续。

## 32. External Professional Tool

当前任务需要 Blender 等工具时显示 Current Task / Recommended Tool / Open in Tool。

Field 保存 reason / related field / source file / expected result / current task。

深度自动化由 Capability Connector 后续完成。

V0.1 必须包含一个最小真实 Connector，优先采用 Generic MCP Connector，验证 `Contract → Call → Result → Evidence` 闭环；具体协议/transport 由 Technical Architecture 冻结。该要求不等于 V0.1 实现专业软件深度自动化。

## 33. Library

分类：全部 / Web / 文档 / 图片 / 视频 / 音频 / 代码 / 笔记。

每个资源至少：title / type / source / created_at / saved_at / related_fields[] / reason_saved / metadata。

## 34. Leisure

Fullscreen / media 默认隐藏 Task UI / Agent / Field Dashboard / AI 推荐。只有显式 Summon / Capture 才打断。

## 35. AI Provider

Settings 支持 Provider 数据驱动配置，预留 OpenAI / Anthropic / Google / Qwen / Custom OpenAI-compatible / other providers。

Field 可显示 `Model: Automatic ▾`。V0.1 Automatic 可使用默认 Provider。Local LLM 不进入 V0.1。

## 36. Loading / Error

Loading 局部化，不用整屏 Spinner。

Error 必须告诉用户：什么失败、什么已成功、下一步可做什么。部分失败不得丢掉已成功结果。

## 37. Keyboard

- Ctrl/Cmd + L：URL
- Ctrl/Cmd + T：New Tab
- Ctrl/Cmd + W：Close
- Ctrl/Cmd + Shift + Space：Summon Fielora
- Ctrl/Cmd + K：Focus Composer
- Esc：Dismiss Temporary UI

## 38. P0

Shell、Now、Inbox、Universal Capture、Browse、Summon、Context Chips、Field、Field Resume、Composer + IDR Contract、DXE Surface Primitive、Idea → Requirement、Development Field、Existing Project Takeover、Code Workspace、Terminal、Git Diff、Browser Preview、Verify、Evidence、Library、Multi-provider foundation、Capability Connector contract + 一个最小真实 Generic MCP Connector。

P0 还要求数据与交互模型不把 Windows、本地文件路径或永久单用户环境写成业务事实。OS-specific 行为通过 Platform Adapter；本地路径属于 Device Binding；Field / Object / Activity 预留 owner / actor / visibility / share_scope / permissions / provenance。以上不新增 V0.1 跨平台 UI、Exchange UI 或网络服务。

## 39. 明确不做

Local LLM、完整专业设计/建模/剪辑/DAW/CAD、Arbitrary Generative UI、Agent Marketplace、Capability Marketplace、Multi-Agent Society、完整人生管理、任意桌面软件完全自动化、自动学习所有软件 Workflow、完整 App Marketplace、Enterprise Admin、完整 Chrome Extension compatibility、macOS/Linux 正式验收、跨设备 Field Continuity 完整实现、完整 Fielora Exchange 通信/IM/共享 Field、Steward-to-Steward 自动协作。

## 40. Acceptance Scenarios

A Capture：Browse → Summon → “记一下……” → 自动关联页面 → 保存 → 回 Browse。

B Browse Ask：Selection → ✦ → Ask → Context Chip → Overlay answer → Esc。

C Promote：“这个和 Fielora 有关系，放进项目” → Attach Field → 可继续 Browse 或进入 Field。

D Resume：关闭 → 重开 → Now Continue → 恢复 Working Surface / Focus。

E Idea → Requirement：Promote Idea → Discuss → Requirement → 保留 Idea relation → 用户确认与 AI 草稿区分。

F Existing Project：选择 Repo → Understand → Project Reality → 不修改源码 → 持久化。

G Build：Requirement → “开始实现” → Requirement | Code | Preview + Terminal。

H Verify：“测试刚才修改” → Verify → 真实结果 + Evidence → FAIL 不得标完成。

I Connector：Field 发起 Generic MCP Capability → Contract 校验 → 真实 Call → Result 回到 Field → 生成可追溯 Evidence；失败不得伪装为成功。

## 41. 跨平台与 Exchange 模型边界

V0.1 UI 只按 Windows 11 x64 正式验收，但交互与数据语义不得把 Windows 路径、Windows-only 应用或单设备状态当作 Field Object 的永久身份。设备上的路径与可用程序属于 Device Binding。

Fielora Exchange 是长期方向，未来可交换 Message / Object / Request / Task / Proposal / Result / Field Invite。V0.1 只在 Field / Object / Activity 等核心模型预留 owner / actor / visibility / share_scope / permissions / provenance，不提供完整通信、IM、共享 Field、Field Invite UI 或 Steward-to-Steward 自动协作。

## 42. UI 最终审核

1. 遮住 Logo 后，是不是仍然只是 Chrome / Tabbit / 豆包 + AI Sidebar？
2. 是不是因为内部知道很多，所以把很多东西都展示出来？
3. 当前主工作对象是否绝对清晰？

任一答案不满足则继续改。
