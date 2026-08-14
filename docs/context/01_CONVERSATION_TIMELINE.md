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

## 第二十三阶段 — Phase 01 Implementation Authorization 与真实纵向闭环
用户以 baseline `bfdcbe0147b142cdf73ba06986fe7f35aaf2a604` 和 required-reading manifest 为唯一基线，正式授权 Phase 01 Core Vertical Slice Implementation，并明确禁止提前实现 Later Phase 能力。

实现建立 `phase/01-core-vertical-slice` 分支，完成 Electron trusted renderer、typed preload allowlist、Electron Main supervised Rust Sidecar、FIPC/1、SQLite Migration 0001、Field create/list/get/update focus、Activity/Event、Surface Snapshot、packaged restart/resume 与 Portable ZIP。Engineering Gate 的 Static、Unit、Clippy/Release、Integration、Desktop E2E、Package 与 Packaged Smoke 全部通过。

## 第二十四阶段 — Desktop Reality、Human Experience 与 Closeout
Desktop Reality Verification 在实际 Windows 桌面进程、packaged `Fielora.exe`、`fielora://app` renderer、真实 Rust Core 与 SQLite 上复核通过；验证了无 dev server/Node 依赖、bridge/security 边界、正常退出、parent-pipe EOF 无 orphan，以及完整 executable restart/resume。

Human Experience Gate 随后由用户确认 PASS。用户于 2026-08-14 正式裁决 `PHASE_01: COMPLETE`，并授权同步 Reality、Decisions、Reports 与 Git 历史。该裁决只关闭 Phase 01，不授权或开始 Phase 02。

## 第二十五阶段 — Phase 02 Final Freeze Candidate 与 Freeze Closeout
用户批准 Phase 02 Scope Review 方向，但明确不授权产品实现。设计候选从 clean `main@65a8751873deb8ef395286e06d62a9489462629f` 独立建立，只覆盖 Field Reality aggregate revision、State lifecycle、HTTPS-only REFERENCE、bounded `SOURCED_FROM`/`SUPERSEDED_BY` lineage、append-only Activity、constrained SurfaceLayoutV1、per-device Snapshot 与 deterministic richer Resume。

Final amendment 固定 State content 4000、Activity summary 240、Resume 每组 5，修正 REFERENCE ACTIVE↔ARCHIVED lifecycle、typed relation self-edge 与空 TaskPane invariant，并明确 72/28 只属于 renderer default。真实 Migration 0001 与 Candidate 0002 在系统临时 SQLite 中完成 normal 1→2 和 incompatible-data rollback probe，均 PASS；没有创建产品 Migration 0002 或推进产品 schema version。

用户于 2026-08-14 正式裁决 `PHASE_02: APPROVED_FOR_FREEZE`，将三份 Final Candidate 收敛为正式 Frozen Phase 02 规格。同时明确 `PHASE_02_IMPLEMENTATION_AUTHORIZED: NO`：Freeze 不构成产品实现授权，Rust/TypeScript Phase 02 实现与产品 Migration 0002 仍未开始。

## 第二十六阶段 — Phase 02 Implementation、Human Gate Correction 与 Complete

用户随后基于精确 `main@1419b8541a188e59af7ed2966f869bdde2dc7ada` 明确授权 Phase 02 Implementation，同时要求不得自行改变 Frozen semantics。`phase/02-field-reality` 完成 Field Reality aggregate、State lifecycle、HTTPS-only REFERENCE、bounded lineage、typed mode/focus、固定 SurfaceLayoutV1、deterministic richer Resume、Migration 0002、20 个 additive FIPC capabilities 与严格 Electron bridge；三份 Frozen Phase 02 specs 保持 diff 0。

初次完整 Engineering/Desktop Reality Gate 通过后，长期 `pnpm dev` Human Experience 发现 legacy Resume presentation 与内部诊断术语泄露。`f03ed1f` 以 renderer-only correction 将 legacy focus 表达为“上次关注”，隐藏 snapshot/layout/revision/pane/wire diagnostics，没有修改 Contract、Schema、Migration、Rust Core 或 FIPC/1。

Post-correction `pnpm verify:phase02` 完整退出 0；TypeScript 12/12、Rust 19/19、FIPC Integration 4/4、Desktop E2E、Package、Packaged Smoke 与 fresh-directory Portable Smoke 全部 PASS。packaged/portable 各完成 17 项 checks，最终 ZIP 为 145,998,148 bytes，SHA-256 `24bf2bae54cf029ae748da0f8f7f6f6fb8c73a0e7049ebe76744017055d02a93`。

用户基于最终 Evidence 与已经完成的实际 Human Experience 正式裁决 `PHASE_02_HUMAN_EXPERIENCE_GATE: PASS`、`PHASE_02_FINAL_ACCEPTANCE: GRANTED`、`PHASE_02: COMPLETE`，并授权 closeout 与 merge main。该裁决不授权 Phase 03；main closeout 后先停住，下一步单独落实 Development Workflow Hardening，再单独定义 Phase 03 推进方式。

## 第二十七阶段 — Lightweight Development Workflow Hardening

Phase 02 以 merge commit `e757d050b97a3f0dd3b6812bccefc1e433571c8f` 稳定进入 main 后，用户单独授权一次轻量 Development Workflow Hardening，并继续保留 `PHASE_03: NOT_AUTHORIZED`。

Hardening 保留长期 `pnpm dev` 的日常开发模式，增加 Docs/UI/Core/Cross/PreMerge 五条显式 Gate Lane。Slice Lane 用于快速反馈；所有 main 准入运行 PreMerge，覆盖 Context audit、generated Contract、TypeScript、Rust、real FIPC Integration 与 Desktop E2E。Packaging-sensitive 变更额外升级到 targeted packaged smoke，正式阶段的 Release/Package/Portable/Evidence/Human Gate 不被替代。

该任务不增加产品依赖、Git hook manager、远程 CI 服务或产品能力，也不通过自动路径判断跳过 Gate。完成并 merge main 后停止，Phase 03 的范围、Gate 与授权由后续单独裁决。
