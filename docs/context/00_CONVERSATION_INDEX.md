# Fielora Conversation Index

目的：让 Codex 理解 Fielora 从“AI 浏览器构想”逐步演化成“以 Field 为中心的连续数字工作与生活环境”的过程。

## 阅读顺序

### Stage A — 品牌与起点
- Fielora 命名；
- Field 保留为核心工作概念；
- DXE 是内部能力，不是产品名。

### Stage B — 第一版 AI Browser 功能构想
- Browser / Field / AI / Context / Web Action / Artifact / Capability / Automation / Trust；
- 初期 Field 仍偏 Workspace。

### Stage C — 去同质化
- 普通 AI Browser 功能快速商品化；
- Field 必须从 Workspace 升级为可持续运行的工作单位；
- Capability / Field State / DXE / Human-Agent Shared State 被重新定义。

### Stage D — Chromium / App Runtime
- Browser 不只浏览 Web，也可成为软件运行宿主；
- Fielora App Runtime 作为长期方向；
- 但 App Runtime 必须服务工作连续性，不反过来成为 V0.1 目标。

### Stage E — 真实工作与生活
- Universal Capture；
- Idea Inbox；
- Idea → Requirement → Build → Verify；
- Existing Project Takeover；
- Creative / Design / Music / Film；
- Leisure Capture；
- Personal Library。

### Stage F — 产品边界
- 不重做成熟专业软件；
- Capability Connector；
- Coding 是深度一等场景；
- Multi-LLM Provider；
- Local LLM 延后；
- 长期 Personal Steward / Butler。

### Stage G — 竞争边界
- Chrome / 豆包 / Tabbit 等 AI Browser 的通用能力视为基础设施；
- Fielora 的差异在 Continuity / Lifecycle / Field / Dynamic Surface / Promotion / Work Lineage。

### Stage H — Interaction Spec
- Now / Browse / Field；
- Summon；
- Context Chips；
- Progressive Context；
- Dynamic Surface；
- Development Field；
- Verify；
- Resume。

### Stage I — 开发与交付基线
- Windows 11 x64；
- Electron/Chromium V0.1 验证宿主；
- TypeScript + Rust；
- Python 仅研究评测；
- C++ 仅未来必要 Chromium 胶水；
- Unit → Integration → E2E → Package → Smoke → Human Acceptance。

### Stage J — Technical Architecture Freeze
- Electron Main supervised Rust Sidecar + FIPC/1；
- SQLite / rusqlite bundled + single Storage Worker；
- frozen Core Contracts 与 Phase 01 Schema；
- trusted `fielora://app` production origin；
- parent-pipe EOF 有界退出；
- 当时 Phase 01 READY，尚待 Canonical Local Worktree、Toolchain 与显式 Implementation Authorization。

### Stage K — Phase 01 Core Vertical Slice 与 Closeout
- 以 baseline `bfdcbe0147b142cdf73ba06986fe7f35aaf2a604` 创建 `phase/01-core-vertical-slice`；
- 完成 Electron → typed preload → FIPC/1 → Rust Core → SQLite → Activity/Event → React → packaged restart/resume 的真实纵向闭环；
- Engineering Gate、Desktop Reality Gate 与 Human Experience Gate 全部 PASS；
- 用户于 2026-08-14 正式裁决 `PHASE_01: COMPLETE`；
- Closeout 只同步已确认事实，不开始 Phase 02。

### Stage L — Phase 02 Scope Freeze
- 从 clean `main@65a8751873deb8ef395286e06d62a9489462629f` 建立 `phase/02-freeze-candidate`，只做设计评审与 bounded validation；
- Phase 02 收紧为 Field Reality aggregate revision、State lifecycle、HTTPS REFERENCE、bounded lineage、constrained SurfaceLayoutV1 与 deterministic richer Resume；
- 真实 0001 + Candidate 0002 的 normal upgrade 与 incompatible-data rollback probe 均 PASS；
- 用户于 2026-08-14 正式裁决 `PHASE_02: APPROVED_FOR_FREEZE`；
- Freeze closeout 只冻结规格，Phase 02 继续 `IMPLEMENTATION NOT AUTHORIZED / NOT STARTED`。

### Stage M — Phase 02 Implementation、Human Correction 与 Complete
- 用户基于 `main@1419b8541a188e59af7ed2966f869bdde2dc7ada` 明确授权 Phase 02 Implementation；
- 严格实现 Frozen Field Reality、State/REFERENCE、bounded lineage、SurfaceLayoutV1、Resume 与 Migration 0002，Frozen specs diff 0；
- Engineering、Desktop Reality、Human Experience 与 Post-correction Full Gate 全部 PASS；
- correction 后 packaged/portable 各完成 17 项 smoke checks，最终 Portable SHA-256 为 `24bf2bae54cf029ae748da0f8f7f6f6fb8c73a0e7049ebe76744017055d02a93`；
- 用户于 2026-08-14 裁决 `PHASE_02_FINAL_ACCEPTANCE: GRANTED`、`PHASE_02: COMPLETE`；
- closeout/merge main 获授权，但 Phase 03 未授权；下一步先单独落实 Development Workflow Hardening。

### Stage N — Lightweight Development Workflow Hardening
- 从稳定 `main@e757d050b97a3f0dd3b6812bccefc1e433571c8f` 单独实施，不重新打开 Phase 02；
- 保留长期 `pnpm dev`，新增 Docs/UI/Core/Cross/PreMerge 五条显式验证 Lane；
- 所有 main 准入运行 PreMerge，packaging-sensitive 变更追加 targeted packaged smoke；
- Development Gate 不替代正式 Phase Gate，不增加依赖或产品能力；
- Hardening 完成后继续 `PHASE_03: NOT_AUTHORIZED`，等待单独裁决。

### Stage O — Phase 03 Browse Foundation 与 Complete
- 用户以 `main@7dc1aac593a4d478b7e175e5e197cf99466c1f47` 授权 Phase 03，按 Real Web Runtime、Page Lifecycle、Browse/Field Boundary、Security Boundary、Desktop Experience 五个纵向 Slice 推进；
- 真实 Remote/Local Page 使用无 Node/preload/app bridge 的隔离 `WebContentsView`；Page 是 ephemeral Browse 资源，不进入 Field/Object identity、Schema 或 Migration；
- Loose Browse 不创建或修改 Field Reality；安全 Policy 使用 initiator + target，Remote→`file://` 与所有 Loose Browse→`fielora://app` 保持拒绝；
- 多轮 Human Gate 修复了 native View 可见性、Fields 导航、window-open、Omnibox、0 Page lifecycle、错误提示、fresh Main launch、窄窗 viewport、Clipboard、原生上下文菜单、loading 与 favicon；
- 用户于 2026-08-16 最终裁决 `PHASE_03_FINAL_ACCEPTANCE: GRANTED`、`PHASE_03: COMPLETE`；
- 正式 Gate 在 dev、packaged、fresh-directory portable 中同时通过 Phase 02 Field Reality 与 Phase 03 Browse E2E；Portable SHA-256 为 `6084dbf493951d8a51e41a6a43c750926a60f29e9cd2b5c83ac094bb951c0197`；
- Phase 03 完结后只进入后续设计讨论，不自动授权下一阶段实现。

### Stage P — Phase 04 → Alpha Competition Audit 与 Remap Candidate

- 用户确认 `CODEX_READING_REPORT.md` 的当前 ChatGPT desktop 竞品审计：Browser、AI、Coding、Terminal、Computer Use、MCP、Artifacts、Projects 与长期任务均应视为基础设施能力；
- 后续差异必须由 `Capability → Field Reality → Goal/Requirement/Decision → Action → Evidence → Verified Result → Resume` 证明；
- 用户授权重排 Phase 04 → Alpha，但明确 `PHASE_04_FREEZE: NOT_YET`、`PHASE_04_IMPLEMENTATION: NOT_AUTHORIZED`；
- Remap Candidate 保留 04–10 编号与既有 schema responsibility，重新定义为 Field Entry、Persistent Project Reality、Field-native Development Workspace、Controlled Execution Runtime、Reality Closure、Capability Connector Proof、Continuity Library & Alpha Closure；
- 每个 Phase 必须区分 Foundation Capabilities 与 Fielora Semantics，并以可证伪 Differentiation Hypothesis、纵向 Hero Flow、Negative Evidence 与 Human Gate 裁决；
- 用户确认 Codex 的 Projects/Goals/Memory/Computer History/evidence loop 与 Fielora 存在显著重叠；“记得更多、跨会话续做、测试后继续”不再是差异，统一边界为 `Context informs the Agent; Reality governs the work`；
- Reality 最低 Contract 增加 Identity、Type、Provenance、Authority、Lifecycle、Operational Effect、Verification Relation、Provider Independence；Phase 05/08/Alpha 分别加入 invalidation propagation、revision mismatch、provider replacement 强化 Gate；
- Phase 04 Freeze 前必须锁住 Fielora-owned identity、AI output 默认无权威、provenance/authority 分离、Context≠Reality，但本轮仍未授权 Freeze 或实现；
- Candidate 位于 `docs/architecture/PHASE_04_ALPHA_REMAP_CANDIDATE_V0.1.md`，仍等待用户审查，不是 Frozen Spec。

### Stage Q — Phase 04 Freeze Package 编写与审查

- 用户于 2026-08-16 明确要求正式进入 Phase 04 Freeze Package 的编写与审查，不再做战略层重排；
- 既有 Remap 与 13 项 Capability Definition 被接受为 Freeze input，不等同于 Phase 04 Final Freeze；
- Product、Contract、Migration 0004、Implementation、Test 五份 Candidate 与 Cross-review 已形成，入口为 `docs/architecture/PHASE_04_FREEZE_PACKAGE_CANDIDATE_V0.1.md`；
- Candidate 决定 OpenAI + Anthropic 两个真实 Provider family、Windows Credential Manager、direct Rust HTTP adapter、explicit Context、Capture/Inbox/IDEA_CANDIDATE Promote、无自动 Reality mutation；
- Migration 0004 仅提出 exact SQL 与结构探针；产品 migration registry/schema version 未改变；
- 一次性 trusted credential ingress、Phase 03 Installer 历史例外、两家 Provider 组合及外部 bounded probes 仍需用户在 Final Freeze 前确认；
- 当前 `PHASE_04_FREEZE_PACKAGE: READY_FOR_USER_REVIEW`，但 `PHASE_04_FREEZE: NOT_YET`、`PHASE_04_IMPLEMENTATION: NOT_AUTHORIZED`。

### Stage R — Phase 04 Retention Amendment 与 Final Probes

- 用户正式接受 Remap、Capability Definition 和 Freeze Package 进入 Final Probes/Amendment；四项裁决全部 ACCEPTED/AUTHORIZED；
- Provider-retention blocker 已补齐：Fielora local non-retention 与 Provider-side retention 分离；OpenAI Responses 强制 `store:false`，但 UI 不得声称 ZDR 或 Provider 零保留；
- 首次 Provider 配置/发送显示 external-send 与 Provider policy disclosure，不新增复杂 Privacy UI 或 consent table；
- Migration candidate runner 验证 fresh/2→4/idempotence/tamper/rollback/gap，canonical hash 修正为与现有 runner normalization 一致的 `4d142745...0f869ab`；
- WinCred create/read/2048-byte replace/delete PASS 且测试 credential 已清理；Provider normalization、custom endpoint、Context/Capture fixtures 均 PASS；
- 真实 OpenAI/Anthropic probe 因四个专用 test credential/model 环境变量未提供而 fail-closed SKIP，外部请求为 0；
- Evidence 位于 `artifacts/phase04/freeze/PHASE_04_FREEZE_PROBE_REPORT.md`；`PHASE_04_FINAL_FREEZE_CANDIDATE: NOT_READY`、`PHASE_04_FREEZE: NOT_YET`、`PHASE_04_IMPLEMENTATION: NOT_AUTHORIZED`。

### Stage S — Phase 04 Gate Amendment、实现与 Engineering Validation

- 用户通过 Provider Gate Amendment 将真实 Provider proof 从 pre-Freeze blocker 移到 implemented-product Phase Exit Acceptance，并裁决 `PHASE_04_FREEZE: GRANTED`、`PHASE_04_IMPLEMENTATION: AUTHORIZED`；
- Slice 01–05 已连续实现：Provider/WinCred/stream、Summon/Context、Browse boundary、Capture/Inbox/Attach、Promote/Swap/Resume；
- Cross-review 收紧 Frozen Context/Capture bounds、credential-like outbound block、custom endpoint SSRF、Provider terminal marker 与 Tool Proposal no-execution；
- 正式 `pnpm verify:phase04` 最终跑通 26 TS、29 Rust、5 Core integration，以及 dev/packaged/fresh portable 的 Phase 02、03、04 回归；
- Evidence 与人工清单位于 `artifacts/phase04/`；当前 `PHASE_04_ENGINEERING_GATE: PASS`、`PHASE_04_REAL_PROVIDER_ACCEPTANCE: PENDING`、`PHASE_04_HUMAN_EXPERIENCE_GATE: PENDING`、`PHASE_04: NOT_COMPLETE`。

### Stage T — Phase 04 Human Experience Remediation

- 用户人工体验裁决 HX-01–HX-07：旧 Summon 过度工程化，Ask/Inbox/Providers 三等权 IA 错误，Context/Sensitivity/Provider 暴露过多，Inbox 倾倒正文，Domain 术语直出，视觉与 Fielora 不一致，Summon/Capture 关系不清；
- 本轮只授权 deterministic fixed React UX remediation；Provider/ModelInvocation/Context/Capture/Reality/Permission/Migration 0004 semantics 保持，Phase 05 与完整 DXE 均未授权；
- Summon 已改为 Ask-first，Context 默认折叠，Sensitivity 异常驱动，Provider Setup 低频独立，Inbox 独立并使用 bounded preview，自然语言动作替代 Domain 名称，Quick Capture 保持 Browse；
- Phase 04 remediation E2E 在 dev、packaged、fresh extracted portable 三宿主 20/20 PASS，Phase 02 三宿主 PASS，新 portable SHA-256 为 `3a2bfdcca925dc0a70c81971c62253144294b387aa368969428308d0a3a9f662`；
- 完整 Gate fresh rerun 当前被 Windows Clipboard `Access denied` 阻断在 Phase 03 原生 Ctrl+C/Ctrl+V 硬断言；测试没有跳过或放宽。因此 baseline Engineering PASS 保留，但 remediation revalidation 尚缺这一项环境复验；
- 当前 `PHASE_04_HUMAN_EXPERIENCE_GATE: PENDING_RETEST`、`PHASE_04_REAL_PROVIDER_ACCEPTANCE: PENDING`、`PHASE_04_FINAL_ACCEPTANCE: NOT_YET`、`PHASE_05: NOT_AUTHORIZED`、`DXE_SURFACE_RUNTIME: NOT_IMPLEMENTED`。

### Stage U — ChatGPT Desktop / Codex Competitive Rebase

- 用户按 2026-08-17 当前官方能力再次收紧竞争边界：Chat、Projects/本地文件夹、Goal/Resume、Memory、Browser、Coding、Permission、Plugins/MCP、Computer Use 与 Multi-provider 等均是 Foundation；
- `ChatGPT = AI Chat`、`Fielora = AI Work Environment` 正式失效，一级抽象改为 `AI-centered workspace` 与 `Work-centered environment`；
- Field/Reality 等名称本身不是差异，主差异 Gate 只保留 Explicit Lifecycle、Operational Work State、Persistent Work Lineage + Verification、DXE；
- 所有未来功能必须执行 ChatGPT Project + Codex 同构检查；体验基本相同则压薄、学习成熟方案或延后，不得作为差异；
- 官方能力限定被同步：Computer Use 可用于受支持地区的 macOS/Windows Desktop；Computer History 当前仍限 macOS Desktop且受计划/管理员/地区条件限制；
- Phase 编号不变；Phase 10 Alpha Closure 加入最小 bounded DXE Runtime proof。Phase 04 Frozen Contract/Exit 状态不变，Phase 05 未授权，DXE Runtime 仍未实现。

### Stage V — Rapid Desktop Foundation Rebase

- 用户明确指出当前 Reality 与 Codex Project 在真实体验上没有差异，现有开发过度依赖定义、Freeze 与阶段文档；
- 当前优先级改为先快速交付 Codex-like multi-provider desktop，允许基础体验高度同构；
- Settings 支持自由 Provider/Base URL/API Key/Model ID，Project/Conversation/Coding/Diff/Terminal/Test/Restart 构成首个完整闭环；
- stable long tasks 完成后才接 Aegis，再接 DXE，最后演进 Personal Steward；三者当前均未实现；
- 现有 Field 作为 Project compatibility layer，Phase 01–04 代码/Evidence 保留复用，旧 Phase 04→10 route 被 supersede；
- 首次阅读从 57 文件缩为最小当前事实集，普通可逆功能不再制作 Freeze Package，只有高风险变化需要短 Change Impact。

## 当前事实源

历史脉络：`01_CONVERSATION_TIMELINE.md`

当前正式 Reality：`02_PROJECT_REALITY.md`

决策账本：`03_DECISIONS.md`

否决与延后：`04_REJECTED_DEFERRED.md`

交互实现：`../product/FIELORA_V0.1_INTERACTION_SPEC_CN.md`

技术基线：`../architecture/TECHNICAL_BASELINE_V0.1.md`

冻结架构：`../architecture/TECHNICAL_ARCHITECTURE_V0.1.md`

Phase 04 → Alpha 重排候选：`../architecture/PHASE_04_ALPHA_REMAP_CANDIDATE_V0.1.md`

Phase 04 Freeze Package Candidate：`../architecture/PHASE_04_FREEZE_PACKAGE_CANDIDATE_V0.1.md`

Phase 04 Freeze Probe Evidence：`../../artifacts/phase04/freeze/PHASE_04_FREEZE_PROBE_REPORT.md`

Phase 04 Implementation Evidence：`../../artifacts/phase04/PHASE_04_IMPLEMENTATION_REPORT.md`

Phase 04 Human Experience Remediation：`../../artifacts/phase04/HUMAN_EXPERIENCE_REMEDIATION_REPORT.md`

竞争重定位 Change Impact：`../../artifacts/strategy/2026-08-17_COMPETITIVE_REBASE_CHANGE_IMPACT.md`

Rapid Desktop Rebase：`../product/RAPID_DESKTOP_EXECUTION_V0.1.md`

Rapid Desktop Change Impact：`../../artifacts/strategy/2026-08-17_RAPID_DESKTOP_REBASE_CHANGE_IMPACT.md`

Phase 04 Test / Human Gate：`../../artifacts/phase04/TEST_REPORT.md`、`../../artifacts/phase04/HUMAN_ACCEPTANCE_CHECKLIST.md`

核心 Contract：`../architecture/CORE_CONTRACTS_V0.1.md`

Phase 01 Schema：`../architecture/SCHEMA_FREEZE_V0.1.md`

Phase 01 实现规格：`../architecture/PHASE_01_IMPLEMENTATION_SPEC_V0.1.md`

Phase 02 实现规格：`../architecture/PHASE_02_IMPLEMENTATION_SPEC_V0.1.md`

Phase 02 Contract 增量：`../architecture/PHASE_02_CONTRACT_DELTA_V0.1.md`

Phase 02 Migration 0002 规格：`../architecture/PHASE_02_MIGRATION_0002_V0.1.md`

Phase 03 Closeout：`../../artifacts/phase03/PHASE_03_CLOSEOUT_REPORT.md`
