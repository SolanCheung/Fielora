# Fielora Project Reality V0.1

状态：当前事实源 / V0.1 Technical Architecture + Phase 02 Scope Freeze

日期：2026-08-14

## 1. 产品身份

产品名：**Fielora**。

`Field` 是 Fielora 的核心工作组织概念。`DXE` 是内部核心能力，不作为产品名称。

Fielora 当前不定义为“AI 浏览器”。更准确的内部定义：

> **Fielora 是连接个人数字工作与生活的连续层，以 Field 为持续工作单位，以 Browser / Apps / AI / Agent / Capability 作为完成工作的运行能力。**

Browser 是入口和 Runtime 之一，不是整个产品的中心。

## 2. 第一目标

第一要务：提升真实日常工作效率与生活质量。

主要消灭的问题：不同网页、对话、文件、IDE、测试工具、设计软件、创作软件之间切换导致的上下文断裂。

## 3. 三个一级运行状态

### NOW
回答“我现在最可能继续什么？”，不是 Dashboard，不做 Productivity Score。

### BROWSE
普通浏览器状态，可以遵循成熟 Chrome 类浏览习惯。

### FIELD
真正工作开始后的任务驱动环境。进入 Field 后，Tab / Page 降为资源，不再是一级组织单位。

## 4. Field 正式定义

Field 不是 Tab Group、Workspace Folder、Chat Session 或 Note Collection。

内部可维护：Goal、State、Object、Relation、Capability、Human、Agent、Activity、Evidence、Artifact、Policy、Surface。

默认 UI 不应把这些全部展示出来。

## 5. Field State

V0.1 内部状态类别：FACT / DECISION / ASSUMPTION / QUESTION / TASK / BLOCKER / RESULT。

重要 State 应可追溯来源。用户确认与 AI 推断必须可区分。

核心原则：

> Conversation is history; Field State is reality.

## 6. Capture / Inbox / Promote

Capture：任何状态快速记录 text、selection、page、screenshot、file、media timestamp；默认不要求分类。

`Ctrl/Cmd + Shift + Space` 统一用于 `Summon Fielora`。Capture 是 Summon 经 IDR 判断后的一个 Intent，不设置第二套独立一级 Capture 快捷键。

Inbox：存放尚未确定归属的内容。

Promote：当临时内容成长为持续工作时晋升。

核心链：`Capture → Idea → Field → Requirement → Build → Verify → Result`

## 7. AI 交互

禁止永久 AI Sidebar。

Fielora AI 是系统级可召唤能力。Browse 中通过 Shortcut Summon、轻量 `✦`、Selection Action、Context Chips、Progressive Context 工作。

简单问题在轻量 Overlay 中完成并消失；复杂讨论可 Expand；真正变成持续工作时 Continue in Field。

## 8. IDR

IDR 是轻量 Intent + Referent Resolution，不是独立重型产品。

输入：current runtime / field / focus / object / page / selection / recent activity / explicit refs / user input。

输出：intent / referent / expected change / confidence / ambiguity。

## 9. DXE

DXE 不是任意 Generative UI。

职责：根据 Field State、Intent、Current Goal、Available Objects / Capabilities 编排当前 Working Surface。

V0.1 仅通过固定 Surface Primitive 组合，只负责 select / arrange / resize / focus / collapse / replace。

## 10. UI 最高原则

> 能力常驻系统，不常驻屏幕。

默认一个主焦点，最多两个辅助区域；Context Inspector、Agent Activity、Evidence 等按需出现。

## 11. 核心软件开发流程

V0.1 最深场景：`Idea → Requirement → Research → Design → Build → Run → Test → Fix → Verify → Result`

Requirement 与 Implementation / Test / Evidence 持续关联。

## 12. Existing Project Takeover

接手已有前端或全栈项目是核心 Hero Flow。

初始进入 Understand Project，扫描 repository tree、package files、README、Git history、routes、components、API、config、tests、build、backend、database references，形成持久化 `Project Reality`。

Understand 阶段禁止擅自改源码。

## 13. Verify

Build 和 Verify 是两个不同状态。代码修改完成只表示 Action completed，必须通过真实验证才成为 Result verified。

测试 FAIL 需关联 Evidence，并能继续 Fix → Replay。

## 14. 专业软件边界

Fielora 不重做成熟专业工程软件。

自己做：Capture、Inbox、Field、Notes、Requirement、Research、Library、Coding 基础工作面、Verify、AI 交互、简单创作辅助。

连接：Blender、CAD、专业图像、专业视频、专业 DAW、其他成熟行业工具。

统一抽象：`Capability Connector`，可使用 MCP / API / CLI / Plugin / Extension / Native Bridge。

V0.1 不只定义 Interface，还必须实现一个最小真实 Connector，以 `Generic MCP Connector` 为优先验证方向，跑通 `Contract → Call → Result → Evidence`。Technical Architecture 已冻结 Connector Contract / Adapter 边界；具体 MCP 协议范围与 transport 是 Phase 09 前仍需冻结的开放决定。

## 15. Coding

Coding 是特殊一等能力，因为它位于最高频工作链。

V0.1：Project Tree、Editor、Syntax Highlight、Basic LSP、Search、Terminal、Git Diff、Diagnostics、Run、Browser Preview。

后续研究成熟高星开源 IDE / Editor，学习成熟架构，但不直接复制源码或完整产品结构。

## 16. Creative / Design / Media

长期支持 Design Field、Image Asset Workflow、Film Field、Music Field，但第一版不做完整专业编辑器。

Fielora 更重要的是维护为什么打开工具、当前 Task、Source Asset、Expected Output、Result 回到哪个 Field。

## 17. Leisure

生活体验不能被过度生产力化。看电影 / 视频 / 听音乐时默认最小 UI，不弹 AI 总结、不推任务、不永久 Agent；只保留显式 Summon / Capture。

## 18. Library

Library 是长期个人资源层，不是单纯 Notes App。保存 Web / document / image / video / audio / code / note / references，并逐步保留 source / time / related field / reason saved / usage history。

## 19. Multi-LLM

Fielora 必须 Provider-neutral。V0.1 支持统一 Provider 抽象，目标可接 OpenAI / Anthropic / Google / Qwen / MiniMax / OpenAI-compatible / 其他 Provider。

Local LLM 长期可支持，**V0.1 不实现**。

## 20. App Runtime

Fielora 长期可同时成为 Browser Host 与 Fielora App Host，但 V0.1 不以构建 App Platform 为主目标。App Runtime 必须服务“工作连续性”。

## 21. 长期 Personal Steward

长期方向：Fielora 逐渐理解用户工作与生活，成为 Personal Steward / Butler。它应从长期 Field / Activity / Preference 中成长，而不是第一版放一个“AI 管家”入口。

## 22. 竞争边界

网页总结、AI 搜索、划词问答、截图问答、永久 AI Sidebar、跨 Tab Context、Vertical Tabs、Split View、Browser Agent、Multi-LLM、MCP、保存 Workflow 等不作为核心差异化。

真正差异：Continuity、Field、Lifecycle、Promotion、Work Lineage、Resume Reality、Dynamic Surface、Human-Agent Shared State、专业工具编排、长期 Personal Steward。

## 23. 当前 V0.1 平台

唯一正式验收平台：**Windows 11 x64**。

V0.1 是本地桌面应用，不以 Web SaaS 为主交付形态。

Windows 是当前验收平台，不是架构假设。Core、Field Model、UI、Agent、Provider、Capability Contract 从第一天必须保持跨平台，不得依赖 Windows-specific 假设；OS-specific 能力进入 Platform Adapter。未来目标包含 macOS、Linux，并进一步支持跨设备 Field Continuity。

Field Object 的稳定身份不得等同本地文件路径；本地路径是某一设备上的 `Device Binding`。

## 24. 当前技术基线

Desktop Host：Electron + bundled Chromium，用于快速验证 Browser + Field 产品；暂不直接 Fork Chromium。

UI：TypeScript + React。

Core：Rust Sidecar Process。

Python：Research / Eval / Benchmark only。

C++：仅未来 Chromium 深层修改确实需要时使用。

跨平台边界：业务 Core 与 Contract 保持 OS-neutral；文件系统、进程、Shell、PTY、凭据、安全存储、窗口和其他原生能力通过 Platform Adapter 接入。

## 25. Electron 定位

Electron 是当前 V0.1 验证宿主，不是永久架构承诺。若未来完整 Chrome Extension compatibility、Browser Process 深度控制、Profile / Network / Process 等成为核心壁垒，再评估更深 Chromium Integration / Fork。

完整 Chrome Extension compatibility 不属于 V0.1 验收条件，只保留 future compatibility target；不得以该目标为理由提前进入 Chromium Fork。

## 26. 交付标准

Codex 完成定义不是 `pnpm dev 能跑`。每个开发 Phase 必须提供 Portable Windows Build、Test Report、Known Issues 和 Build Info；Installer 固定在 Phase 03、Phase 08、Final Alpha 验证；Fielora V0.1 Alpha 最终交付必须同时包含 Portable + Installer。

统一测试 Gate：`Static → Unit(TS/Rust) → Rust Clippy/Release Build → Integration → Desktop E2E → Package → Packaged Smoke → Human Experience Acceptance`

验证执行采用双模式：日常开发、调试与人工体验长期运行 `pnpm dev`，不因每次普通迭代重复打包解压；只有正式阶段 Gate 才生成并验证 packaged/portable build。若 Electron/Forge packaging、Main/Preload entry、ASAR/resource、bundled sidecar、production origin/protocol、persistence path、签名权限、runtime 升级或其他 packaging-sensitive 基础设施发生变更，可在正式 Gate 前触发与风险相匹配的 targeted packaged smoke。Targeted smoke 不替代正式阶段完整 Gate。

## 27. V0.1 P0

Shell、Now、Inbox、Universal Capture、Browse foundation、Summon、Context Chips、Field、Field Resume、Composer + IDR contract、DXE primitives、Idea → Requirement、Development Field、Existing Project Takeover、Basic Code Workspace、Terminal、Git Diff、Browser Preview、Verify、Evidence、Library foundation、Multi-provider foundation、Capability Connector contract + 一个最小真实 Generic MCP Connector。

P0 的架构约束还包括：核心层跨平台、OS-specific Platform Adapter、Field Object identity 与 Device Binding 分离，以及核心模型预留 owner / actor / visibility / share_scope / permissions / provenance 语义。这些是模型和边界要求，不扩大 V0.1 UI 或网络服务范围。

## 28. V0.1 明确不做

Local LLM Runtime、完整 Blender/Photoshop/Video Editor/DAW/CAD 替代、任意 Generative UI、Agent Marketplace、Capability Marketplace、Multi-Agent Society、完整人生管理、任意桌面软件全自动控制、自动学习所有软件 Workflow、完整 Fielora App Marketplace、Enterprise Admin、完整 Chrome Extension compatibility、Fielora Exchange 的完整通信/IM/共享 Field、Steward-to-Steward 自动协作。

## 29. 跨平台与跨设备方向

V0.1 只在 Windows 11 x64 正式验收，但架构必须允许未来进入 macOS、Linux 和跨设备 Field Continuity。跨平台不是 V0.1 多平台交付承诺，而是禁止把核心模型与 Windows 或单一设备绑定的架构基线。

稳定 Field / Object identity 与设备上的路径、应用、进程等绑定信息分离。设备绑定变化不应使 Field Object 失去身份或工作谱系。

## 30. Fielora Exchange

Fielora 长期支持不同用户的 Fielora 之间交换 Message / Object / Request / Task / Proposal / Result / Field Invite。

V0.1 不实现完整通信、IM、共享 Field 或 Steward-to-Steward 自动协作；只要求 Field / Object / Activity 等核心模型不要假设永久单用户本地环境，并预留 owner / actor / visibility / share_scope / permissions / provenance 语义。该预留不得扩大 V0.1 UI、账号体系或网络服务范围。

## 31. Technical Architecture Freeze

2026-08-13 用户批准冻结 Technical Architecture、Core Contracts 与 Phase 01 Schema；随后又以这些冻结文档和 baseline commit 为唯一基线，显式授权 Phase 01 实现。Phase 01 已在不改变冻结 Contract / Schema 语义的前提下完成。

Phase 01 精确工具链冻结为：Electron 43.4.0、Node 24.18.1 LTS、pnpm 11.21.0、Rust 1.97.1 / Edition 2024、rusqlite 0.40.2 `bundled`、Electron Forge + Webpack + TypeScript + React。

生产 App UI 的唯一 trusted local application origin 是 `fielora://app`。开发态仅可在非 packaged 模式下接受 Forge renderer entry 解析出的当次精确 loopback origin；禁止 wildcard localhost/127.0.0.1、任意端口、`file://` 或远程 origin。Browse/remote content 必须处于 untrusted WebContents/session boundary，不获得 Fielora preload/bridge。

Rust Sidecar 将 parent-owned stdin pipe EOF 视为权威 shutdown signal；即使没有收到 `system.shutdown`，也必须停止接收请求、安全清理，并在 2 秒内退出，不得成为 orphan。Sidecar 不自行重启，restart ownership 只属于 Electron Main。

Installer cadence 冻结为 Phase 03、Phase 08、Final Alpha；每个 Phase 的 Portable Build 仍是硬 Gate，Final Alpha 同时交付 Portable + Installer。

## 32. Canonical Repository 与 Toolchain Gate

Canonical Local Worktree 已由用户明确确认为 `F:\项目\Fielora`。该目录是 Git repository，默认分支 `main`，remote `origin` 绑定 `git@github.com:SolanCheung/Fielora.git`。Remote 在 bootstrap 时由 GitHub API 与用户裁决共同确认为当前账户 `SolanCheung` 所有的 private empty repository。

Toolchain Preparation 已完成并实测：Node 24.18.1（NVM active）、pnpm 11.21.0、Rust/Cargo 1.97.1、rustfmt 与 clippy 1.97.1 toolchain components。Repo 提交 `.node-version`、`rust-toolchain.toml`、`pnpm-lock.yaml` 与 `Cargo.lock`；Phase 01 workspace 与冻结范围内的产品依赖已经真实建立。

Phase 01 从 baseline commit `bfdcbe0147b142cdf73ba06986fe7f35aaf2a604` 在 `phase/01-core-vertical-slice` 分支实施；Engineering evidence head 为 `5051ab31a25285b16ef5bc3aad1ffaaeebbd1a16`。Closeout 后以项目既定 feature-branch → `main` 流程保存完整 Git 历史。

## 33. Phase 01 Complete

Phase 01 Core Vertical Slice 已证明真实链路：`Electron Renderer → typed preload → Electron Main → FIPC/1 → Rust Core → SQLite transaction → Activity/Event → React query → packaged restart/resume`。

截至 2026-08-14：

- Engineering Gate：PASS；
- Desktop Reality Gate：`DESKTOP_REALITY_GATE_PASS`；
- Human Experience Gate：PASS；
- 用户正式裁决：`PHASE_01: COMPLETE`；
- Portable artifact：`artifacts/phase01/Fielora-V0.1-Phase01-win-x64.zip`；
- Portable SHA-256：`04a0d539d11324e941f2f4c7bee39628ad919dcb7e0326afb8525ebc1b7220f9`；
- 冻结规格冲突：无；
- Phase 02：`NOT_AUTHORIZED` / `NOT_STARTED`。

Engineering、Desktop Reality、Human Experience 与 Closeout 证据见 `artifacts/phase01/`。Phase 01 Complete 只确认首个 Core Vertical Slice，不代表 V0.1 全部阶段完成。

## 34. Phase 02 Frozen Specification

用户已批准 Phase 02 Scope Review 方向，但明确未授权实现。2026-08-14 基于已经隔离 Logo 与 Phase 01 状态勘误后的 clean `main@65a8751873deb8ef395286e06d62a9489462629f` 创建 `phase/02-freeze-candidate`，完成设计候选、final amendment 与 bounded SQLite validation。

用户于 2026-08-14 正式裁决：

```text
PHASE_02: APPROVED_FOR_FREEZE
PHASE_02_IMPLEMENTATION_AUTHORIZED: NO
PHASE_02_IMPLEMENTATION_STARTED: NO
```

Frozen Phase 02 边界：

- `fields.revision` 是 Field Reality aggregate revision；
- Phase 02 ObjectKind 只开放 `REFERENCE`；
- Relation 只保留真正需要的 bounded lineage；
- DXE 不做自由布局；
- FIPC/1 transport 保持不变，additive methods 不触发 transport version 重设计；
- Personal Memory、Agent、Browser、LLM 与其他 Later Phase 能力不进入 Phase 02。

精确 State lifecycle、REFERENCE、Relation matrix、SurfaceLayoutV1、deterministic richer Resume、Contract delta 与 Migration 0002 位于：

- `docs/architecture/PHASE_02_IMPLEMENTATION_SPEC_V0.1.md`；
- `docs/architecture/PHASE_02_CONTRACT_DELTA_V0.1.md`；
- `docs/architecture/PHASE_02_MIGRATION_0002_V0.1.md`。

三份文件状态为 `FROZEN / APPROVED / IMPLEMENTATION NOT AUTHORIZED / IMPLEMENTATION NOT STARTED`。它们冻结设计与未来实现边界，不是产品实现文件。

Final amendment 已确认：REFERENCE 保持 HTTPS-only；State content 4000、Activity summary 240、Resume 每组 5；REFERENCE lifecycle 为 ACTIVE↔ARCHIVED；Relation self-edge 以完整 typed endpoint 判断；一个 layout 最多一个 FIELD_TASKS TaskPane，且零 TASK 的空 TaskPane 合法。Surface template 仍固定，但 72/28 只属于 Phase 02 renderer default，不进入 durable layout semantics。

真实 0001 + Candidate 0002 已在系统临时 SQLite 中完成正常 1→2 与 incompatible-data rollback probe，两条路径均 PASS，临时文件已清理。证据位于 `artifacts/phase02/`。该 probe 证明 frozen SQL 在 bounded paths 上可迁移与 fail-closed，但不等于产品 Migration 0002 已创建、产品 runner 已验证或 schema version 已推进。

Freeze closeout 未创建 `crates/fielora-storage/migrations/0002_phase02_reality.sql`，未修改 Rust/TypeScript Phase 02 产品实现，也未增加依赖。Phase 02 继续保持 `NOT_AUTHORIZED / NOT_STARTED`；只有后续单独的明确 Implementation Authorization 才能进入实现。

## 35. Phase 02 Final Acceptance Candidate

用户于 2026-08-14 基于精确 `main@1419b8541a188e59af7ed2966f869bdde2dc7ada` 正式裁决 `PHASE_02_IMPLEMENTATION_AUTHORIZED: YES`。该裁决只改变 Phase 02 的实现授权状态，不改变第 34 节记录的 Frozen semantics；Frozen Implementation Specification、Contract Delta 与 Migration 0002 Specification 保持原文不变。

实现位于 `phase/02-field-reality`，实现提交为 `baeb73298bd8ffca007dc365394b45ff1c4ae819`。产品 schema 已按 Frozen Migration 0002 推进到 version 2；Field Reality aggregate、State lifecycle、唯一 REFERENCE Object、bounded lineage、typed mode/focus、固定 SurfaceLayoutV1、deterministic richer Resume、20 个 additive Phase 02 capabilities 与严格 Electron bridge 已进入实现。FIPC/1 transport 和 `ProtocolVersion 1.0` 未改变，没有扩入 Later Phase 能力，也没有新增产品依赖。

截至 2026-08-14：

- Static / generated contracts：PASS；
- TypeScript unit、Rust unit、Clippy、Release：PASS；
- real FIPC Integration：PASS；
- Desktop E2E dev：PASS；
- Windows x64 Package / Packaged Smoke：PASS；
- Portable Build / fresh-directory Portable Smoke：PASS；
- Engineering Gate：PASS；
- Desktop Reality Gate：PASS；
- Human Experience Gate：`PENDING_USER`；
- Phase 02 Final Acceptance：`NOT_GRANTED`；
- Phase 02：`NOT_COMPLETE`。

Post-correction portable artifact 为 `artifacts/phase02/Fielora-V0.1-Phase02-win-x64.zip`，bytes `145998148`，SHA-256 `24bf2bae54cf029ae748da0f8f7f6f6fb8c73a0e7049ebe76744017055d02a93`。实现、测试、已知限制、构建信息与待人工验收清单位于 `artifacts/phase02/`。

Human Gate 前的长期 `pnpm dev` 体验发现：Core Reality persistence 未失败，但 renderer 将 continuation、snapshot freshness、layout source、revision、pane primitive 与 raw wire enum 暴露给用户，使正确的 legacy compatibility semantics 呈现为误导性的“继续 + STALE”。该问题是 presentation defect，不是旧 snapshot 覆盖 authoritative Reality，也不需要改变 Frozen continuation priority。

`f03ed1fe120e60f925896e12a35caca7cc19ec54` 已完成 bounded renderer-only correction：legacy focus 显示为“上次关注”，默认 UI 隐藏 migration/snapshot/revision/pane diagnostic，mode/kind/status/reference/activity 使用产品语言。TypeScript typecheck、lint、12/12 unit 与真实 Electron dev E2E 均 PASS；exact legacy focus + stale Phase 01 snapshot + current Phase 02 TASK 已被独立复现并验证。Contract、Schema、Migration、Rust Core、Electron bridge、FIPC/1 与三份 Frozen specs 零修改。

Post-correction Full Gate 已基于包含该 UI correction 的 source `ccd849c3b4c52662cd89fab023a00db857e88e21` 重新生成 packaged/portable build。完整 `pnpm verify:phase02` 于 2026-08-14 17:22:55–17:25:48 +08:00 退出 0：Static、12 项 TypeScript unit、19 项 Rust unit、Clippy/Release、4 项 FIPC Integration、Desktop E2E、Package、Packaged Smoke、Portable 与 fresh-directory Portable Smoke 全部 PASS。Packaged 与 Portable 各完成 17 项 acceptance checks；四张 standard/legacy 成品截图经人工检查未见 correction 回归。

Final Acceptance Candidate 已固化于 `artifacts/phase02/PHASE_02_FINAL_ACCEPTANCE_CANDIDATE.md`。机器 Evidence 已满足提交 Final Acceptance 的前提，但用户尚未作 Human Experience / Final Acceptance 裁决；因此 `PHASE_02_FINAL_ACCEPTANCE: NOT_GRANTED`、`MERGE_TO_MAIN: NOT_DONE`、`PHASE_03: NOT_AUTHORIZED`。

“实现完成”仍不等于“Phase 02 完成”。只有用户完成 Human Experience Gate，并在真实 Evidence 基础上给出 Phase 02 Final Acceptance 裁决后，Phase 02 才能进入 Complete closeout。

## 36. 最高产品原则

> **不是把所有软件装进 Fielora，而是让用户的工作与生活在软件之间不再断掉。**

> **浏览时像优秀浏览器；轻量 AI 时随叫随走；真正工作时进入 Field。**
