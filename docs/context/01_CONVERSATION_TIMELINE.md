# Fielora 对话时序重建

> 本文不是逐字聊天导出，而是基于当前 Fielora 项目对话和已上传《Fielora 功能讨论》资料制作的高保真时序重建。它的价值是保存“为什么当前方案会变成现在这样”。

## 2026-08-11 — 名称与身份
产品最终采用 **Fielora** 作为品牌名。`Field` 作为核心工作组织概念；`DXE` 是内部核心能力，不作为产品名。

## 第一阶段 — 完整 AI Browser 思路
最初把 Fielora 设计为完整 AI Browser：Chromium Browser、Field、AI、Context、Web Action、Artifact、Capability、Automation、Trust。开始提出从 `Window → Tab → Page` 转向 `Goal → Field → Context → Resource → Agent → Action → Result`。

但此时 Field 仍容易退化成高级 Tab Group / Workspace。

## 第二阶段 — 同质化风险
审视 Chrome、Opera Neon、Dia、Comet、Tabbit、豆包等后发现，AI Sidebar、页面总结、跨 Tab、网页 Agent、Vertical Tabs、Split View、任务 Workspace、多模型、MCP 等正在迅速商品化。

结论：**Fielora 不能靠“更强 AI Browser”成立。**

## 第三阶段 — Field 升级为运行单位
Field 重新定义为有 Goal、State、Object、Relation、Capability、Human、Agent、Activity、Evidence、Artifact、Policy、Surface 的持续运行对象。

形成原则：

> Conversation is history. Field State is reality.

State 基础类型：FACT / DECISION / ASSUMPTION / QUESTION / TASK / BLOCKER / RESULT。

## 第四阶段 — Human 与 Agent 共享 Field
Agent 不应在另一个黑箱环境里工作后只回结果。Human 与 Agent 共享 Field State；用户能接管；Agent 能继续；Activity 可记录 Actor / Intent / Action / Target / Before / After / Evidence。

Agent Loop 逐步确定为：
`Observe Field → Resolve Intent → Select Capability → Plan Change → Act → Verify → Commit State → Recompose Surface`

IDR = 轻量 Intent + Referent Resolution。
DXE = Field State → Working Surface。

## 第五阶段 — DXE 从生成 UI 变成任务状态驱动工作面
明确 V0.1 不让 LLM 每次生成 React 页面。DXE 只从固定 Surface Primitive 中 select / arrange / resize / focus / collapse / replace。

形成 UI 原则：

> 能力常驻系统，不常驻屏幕。

## 第六阶段 — Browser 视觉降级与三态
Chrome 自身不断强化 Vertical Tabs、Split View、Gemini、Agent 后，进一步明确普通 Browse 可以像 Chrome，不需要为不同而不同。

真正差异必须发生在 Field。

形成三态：NOW / BROWSE / FIELD。

## 第七阶段 — Chromium 作为 Application Runtime
提出 Chromium 不只可浏览 Web，也可成为软件宿主；Fielora 长期可同时承担 Browser Runtime 与 Fielora App Runtime。

随后加入边界：App Runtime 必须服务“工作连续性”，不能反过来成为 V0.1 平台工程目标。

## 第八阶段 — 回到真实工作与生活
产品第一要务重新校准为提升真实工作效率和生活质量。

高频工作：灵感 → 讨论 → 调研 → 需求 → Web 开发 → 测试；也会接手已有前端/全栈项目。

创作兴趣：原型、设计、建模、工业产品、修图、AI 图片、视频、音乐、资料、笔记、电影、视频、音乐。

由此提出 Universal Capture：任何状态快速记录，默认先保存，不要求即时分类。

## 第九阶段 — Capture / Inbox / Promote
形成核心语言：Capture、Inbox、Promote。

链路：`Capture → Idea → Field → Requirement → Build → Verify → Result`

Promote 只用于“临时对象晋升为更持久正式工作对象”。

## 第十阶段 — Existing Project Takeover
接手旧项目成为 V0.1 Hero Flow。先 Understand Project，扫描 repo tree、package、README、Git、routes、components、API、config、tests、build、backend、DB references，形成持久化 Project Reality。初始阶段不得直接修改源码。

## 第十一阶段 — Build / Verify 闭环
Requirement 必须与 implementation / test / evidence 建关系。

重要原则：

> Action completed ≠ Result verified.

修复后必须 Replay Test，真正 PASS 后才能更新验证状态。

## 第十二阶段 — 专业软件边界
不重做 Blender、CAD、专业图像、视频、DAW 等成熟工程软件。

统一 Capability Layer：MCP / API / CLI / Plugin / Extension / Native Bridge。

Fielora 负责“为什么打开、当前任务、源文件、预期结果、结果回哪个 Field”。

## 第十三阶段 — Coding 是特殊一等能力
Coding 位于核心高频链 `Idea → Requirement → Code → Run → Browser → Debug → Test → Fix → Verify`，所以需要较深的一等工作流。

但不从零发明 IDE，不直接复制源码。研究成熟高星开源 IDE / Editor 的基础架构，再按 Field / Agent / Context / Verify 重设计。

## 第十四阶段 — Multi-LLM
明确 Fielora ≠ 某一个模型客户端。需要 Model Provider abstraction，可接 OpenAI、Anthropic、Google、Qwen、MiniMax、OpenAI-compatible 等。

Local LLM 长期可做，但 V0.1 不做。

## 第十五阶段 — Leisure 不被工作化
电影、视频、音乐状态默认 Minimal UI、No task spam、No agent spam，只保留显式 Summon / Capture。生活经验可在以后成为创作资产。

## 第十六阶段 — Library
Library 是长期资源层，不等同 Notes App。保存 Web、PDF、Image、Video、Audio、Code、Note、Reference，并逐步保留来源、时间、相关 Field、保存原因和使用历史。

## 第十七阶段 — Personal Steward / Butler
长期目标是 Fielora 从真实 Field / Activity / Preference 中逐渐理解用户工作与生活，成为 Personal Steward / Butler，而不是第一版放一个“AI 管家”入口。

路径：`当前 Field → 多 Field → 工作习惯 → 更多生活连接 → Personal Steward`

## 第十八阶段 — 与 AI Browser 去同质化
网页总结、AI 搜索、跨 Tab、多模型、Browser Agent、MCP、Workflow 等视为 Foundation / Commodity。

Fielora 差异重点：Continuity、Lifecycle、Field、Dynamic Surface、Promotion、Work Lineage、Human-Agent Shared State、Professional Tool Orchestration、长期 Personal Steward。

## 第十九阶段 — Browse 中如何沟通
拒绝永久 AI Sidebar。采用 Summon Model：快捷键、轻量 `✦`、Selection Action、Context Chips、Progressive Context、Lightweight Ask、Expand、Promote to Field。

核心链：`Ask → Explore → Work`

## 第二十阶段 — Interaction Spec
冻结 Now / Browse / Field、Composer、Capture、Inbox、Summon、Context Chips、Field Header、DXE Surface、Resume、Requirement、Development Field、Existing Project Takeover、Build、Verify、Evidence、Library、Provider、Error/Loading 与 Acceptance Scenarios。

## 第二十一阶段 — 技术语言
TypeScript + React：UI / Browser UI / Surface / Composer / Editor UI。

Rust：Field Runtime / State / Context / IDR / Agent orchestration / Capability / Evidence / Persistence / Project / Native integration。

Python：Research / Eval / Benchmark。

C++：仅未来 Chromium 深度集成必要时的薄 Adapter。

## 第二十二阶段 — 平台与交付
V0.1 目标 Windows 11 x64 本地桌面应用。暂定 Electron/Chromium + React/TS + Rust Sidecar，不直接 Fork Chromium。

Codex 交付不能只让 `pnpm dev` 能跑，必须提供 Packaged Build，并经过 Unit → Integration → E2E → Package → Packaged Smoke → Human Experience Acceptance。
