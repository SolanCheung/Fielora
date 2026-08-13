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
- Phase 01 READY，但 Local Worktree 未确认，Implementation 未开始。

## 当前事实源

历史脉络：`01_CONVERSATION_TIMELINE.md`

当前正式 Reality：`02_PROJECT_REALITY.md`

决策账本：`03_DECISIONS.md`

否决与延后：`04_REJECTED_DEFERRED.md`

交互实现：`../product/FIELORA_V0.1_INTERACTION_SPEC_CN.md`

技术基线：`../architecture/TECHNICAL_BASELINE_V0.1.md`

冻结架构：`../architecture/TECHNICAL_ARCHITECTURE_V0.1.md`

核心 Contract：`../architecture/CORE_CONTRACTS_V0.1.md`

Phase 01 Schema：`../architecture/SCHEMA_FREEZE_V0.1.md`

Phase 01 实现规格：`../architecture/PHASE_01_IMPLEMENTATION_SPEC_V0.1.md`
