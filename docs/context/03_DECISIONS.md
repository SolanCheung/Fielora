# Fielora Decision Log

状态：已明确决定 / V0.1 Technical Architecture + Phase 02 Scope Freeze / Phase 01 COMPLETE（2026-08-14）

| ID | 决定 | 状态 |
|---|---|---|
| D-001 | 产品名使用 Fielora | CONFIRMED |
| D-002 | Field 是核心工作概念；DXE 是内部能力，不是产品名 | CONFIRMED |
| D-003 | Fielora 不以“AI 浏览器”作为最终核心定义 | CONFIRMED |
| D-004 | Field 不是 Tab Group / Workspace Folder | CONFIRMED |
| D-005 | Field State 与 Conversation 分离 | CONFIRMED |
| D-006 | State 基础类型：FACT / DECISION / ASSUMPTION / QUESTION / TASK / BLOCKER / RESULT | BASELINE |
| D-007 | Human 与 Agent 共享 Field State | CONFIRMED |
| D-008 | IDR 定位为轻量 Intent + Referent Resolution | CONFIRMED |
| D-009 | DXE 是任务状态驱动 Surface 编排，不是任意 Generative UI | CONFIRMED |
| D-010 | 能力常驻系统，不常驻屏幕 | CONFIRMED |
| D-011 | 禁止永久 AI Sidebar 作为主交互 | CONFIRMED |
| D-012 | 一级运行状态：Now / Browse / Field | CONFIRMED |
| D-013 | Browse 保持成熟浏览器习惯，不为不同而不同 | CONFIRMED |
| D-014 | Universal Capture 是 V0.1 核心能力 | CONFIRMED |
| D-015 | Capture 默认不要求即时分类 | CONFIRMED |
| D-016 | Inbox 是未整理内容的过渡态 | CONFIRMED |
| D-017 | Promote 是“临时内容晋升为持续工作”的交互语言 | CONFIRMED |
| D-018 | Software Development Field 是 V0.1 最深场景 | CONFIRMED |
| D-019 | Existing Project Takeover 是核心 Hero Flow | CONFIRMED |
| D-020 | Understand Existing Project 阶段不得直接修改源码 | CONFIRMED |
| D-021 | Requirement / Code / Test / Evidence 形成连续关系 | CONFIRMED |
| D-022 | Action completed 不等于 Result verified | CONFIRMED |
| D-023 | 专业工程软件不重做，通过 Capability Connector 连接 | CONFIRMED |
| D-024 | Capability Connector 可落到 MCP / API / CLI / Plugin / Extension / Native Bridge | CONFIRMED |
| D-025 | Coding 是一等能力，但不直接复制成熟 IDE 源码 | CONFIRMED |
| D-026 | 研究成熟高星开源 IDE，再按 Fielora 需求重设计 | CONFIRMED |
| D-027 | Fielora 必须 Multi-LLM Provider neutral | CONFIRMED |
| D-028 | V0.1 不做 Local LLM | CONFIRMED |
| D-029 | Leisure 默认不被生产力 UI / Agent 打扰 | CONFIRMED |
| D-030 | Library 不等同于独立 Notes App | CONFIRMED |
| D-031 | 长期发展为 Personal Steward / Butler，但不在第一版伪装成管家 | CONFIRMED |
| D-032 | Windows 11 x64 是 V0.1 唯一正式验收平台，不代表核心架构可以绑定 Windows | CURRENT BASELINE |
| D-033 | V0.1 使用 Electron/Chromium 作为验证宿主，不直接 Fork Chromium | CURRENT BASELINE |
| D-034 | UI 主语言 TypeScript + React | CURRENT BASELINE |
| D-035 | Core 主语言 Rust，优先 Sidecar | CURRENT BASELINE |
| D-036 | Python 仅 Research / Eval；C++ 仅未来必要 Chromium adapter | CURRENT BASELINE |
| D-037 | 每个开发 Phase 必须交付 Portable Windows Build；Installer 固定在 Phase 03 / Phase 08 / Final Alpha 验证；Final Alpha 交付 Portable + Installer | CONFIRMED / CLARIFIED BY D-055 |
| D-038 | 测试 Gate 为 Static → Unit(TS/Rust) → Rust Clippy/Release Build → Integration → Desktop E2E → Package → Packaged Smoke → Human Experience Acceptance | CONFIRMED |
| D-039 | Fielora App Runtime 是长期能力，但不能抢占 V0.1 核心验证 | CONFIRMED |
| D-040 | AI Browser 通用能力视为 Foundation / Commodity，而非 Hero Feature | CONFIRMED |
| D-041 | `Ctrl/Cmd + Shift + Space` 统一为 Summon Fielora；Capture 是经 IDR 解析的 Intent，不设第二套一级快捷键 | CONFIRMED |
| D-042 | 测试 Gate 统一为 Static → Unit(TS/Rust) → Rust Clippy/Release Build → Integration → Desktop E2E → Package → Packaged Smoke → Human Experience Acceptance | CONFIRMED |
| D-043 | 完整 Chrome Extension compatibility 不属于 V0.1 验收，仅保留 future compatibility target，且不得据此提前 Fork Chromium | CONFIRMED |
| D-044 | 每个开发 Phase 必须提供 Portable Build；Installer 固定在 Phase 03 / Phase 08 / Final Alpha 验证；Final Alpha 必须同时包含 Portable + Installer | CONFIRMED / CLARIFIED BY D-055 |
| D-045 | Capability Connector V0.1 必须包含一个最小真实 Connector，优先 Generic MCP Connector，验证 Contract → Call → Result → Evidence；Contract/Adapter 边界已冻结，具体 MCP 协议范围与 transport 在 Phase 09 前冻结 | CONFIRMED / CLARIFIED BY D-051 |
| D-046 | 不在当前非 Git Context Pack 目录执行 git init；先确认真正 Fielora Repo，再把项目上下文放入该 Repo | CONFIRMED |
| D-047 | Windows 11 x64 是 V0.1 唯一正式验收平台，但 Core、Field Model、UI、Agent、Provider、Capability Contract 必须从第一天跨平台；OS-specific 能力进入 Platform Adapter | CONFIRMED |
| D-048 | Field Object identity 不等同本地路径；本地路径属于 Device Binding；长期目标包含 macOS、Linux 与跨设备 Field Continuity | CONFIRMED |
| D-049 | Fielora Exchange 是长期方向，支持 Message / Object / Request / Task / Proposal / Result / Field Invite 的跨用户交换 | CONFIRMED |
| D-050 | V0.1 不实现完整 Exchange 通信、IM、共享 Field 或 Steward-to-Steward 自动协作；核心模型只预留 owner / actor / visibility / share_scope / permissions / provenance，且不扩 UI/网络范围 | CONFIRMED |
| D-051 | Technical Architecture、Core Contracts 与 Phase 01 Schema 批准冻结；Phase 01 Implementation Spec READY | CONFIRMED |
| D-052 | Phase 01 精确工具链为 Electron 43.4.0、Node 24.18.1 LTS、pnpm 11.21.0、Rust 1.97.1 / Edition 2024、rusqlite 0.40.2 `bundled`、Electron Forge + Webpack | FROZEN |
| D-053 | Production trusted local application origin 为精确 `fielora://app`；dev 仅接受当次 Forge entry 的精确 loopback origin；Browse/remote content 永不获得 app bridge | FROZEN |
| D-054 | Rust Sidecar 将 parent-pipe EOF 作为权威 shutdown signal，安全清理并在 2 秒内退出；不得 orphan，且不自行重启 | FROZEN |
| D-055 | Installer cadence 固定为 Phase 03、Phase 08、Final Alpha；每 Phase Portable，Final Alpha 同时交付 Portable + Installer | CONFIRMED |
| D-056 | 当时 Remote Repo `git@github.com:SolanCheung/Fielora.git` 已确认存在且为空；Local Worktree 未确认；确认前实现不开始 | HISTORICAL / SUPERSEDED BY D-058 |
| D-057 | 本机 Node 由 `D:\AppInstall\nvm\nvm` 管理；现有 14.18.2/22.16.0 只作环境事实，不能替代冻结的 Node 24.18.1；当前不安装或切换 | CONFIRMED |
| D-058 | `F:\项目\Fielora` 是 Fielora canonical Local Worktree；初始化 Git、默认分支 `main`，remote 为 `git@github.com:SolanCheung/Fielora.git` | CONFIRMED |
| D-059 | Repo Bootstrap / Toolchain Preparation 获授权；Baseline Commit 只包含冻结 Context Pack、docs、`.gitignore` 与精确工具链 metadata，不包含产品 workspace/code/dependencies/schema | CONFIRMED |
| D-060 | Node 24.18.1、pnpm 11.21.0、Rust 1.97.1 已准备并通过精确版本 Gate；这不构成 Phase 01 Implementation Authorization | CONFIRMED |
| D-061 | 用户以 baseline `bfdcbe0147b142cdf73ba06986fe7f35aaf2a604`、required-reading manifest 与冻结 Architecture/Contracts/Schema/Phase 01 Spec 为唯一实现基线，正式授权 `phase/01-core-vertical-slice` 实现 | CONFIRMED |
| D-062 | Phase 01 真实纵向闭环及 Static、Unit、Clippy/Release、Integration、Desktop E2E、Package、Packaged Smoke 全部通过；Engineering Gate 为 PASS | VERIFIED |
| D-063 | Phase 01 Portable 在实际 Windows desktop runtime 中证明 packaged Electron、`fielora://app`、Rust Core、SQLite、security boundaries、bounded shutdown/no orphan 与 executable restart/resume；Desktop Reality Gate 为 PASS | VERIFIED |
| D-064 | Human Experience Gate 已由用户确认 PASS；用户于 2026-08-14 正式裁决 `PHASE_01: COMPLETE` | CONFIRMED / COMPLETE |
| D-065 | Phase 01 closeout 不构成 Phase 02 或 Later Phase Implementation Authorization；Phase 02 保持 `NOT_AUTHORIZED` / `NOT_STARTED` | CONFIRMED |
| D-066 | 用户批准 Phase 02 Scope Review 方向并授权形成 Freeze Candidate，但未授权实现；Candidate 必须与既有 Logo/Phase 01 状态维护变更隔离，并从 clean main 建立 | CONFIRMED |
| D-067 | Phase 02 将 `fields.revision` 收紧为 Field Reality aggregate revision；每个成功 Reality mutation 在同一 transaction 中只递增一次 | FROZEN |
| D-068 | Phase 02 ObjectKind 只开放 REFERENCE；不得借 object/metadata 扩展为万能资源、Memory、Capture、Browser 或 Later Phase Aggregate | FROZEN |
| D-069 | Phase 02 Relation 只保留 State `SOURCED_FROM` REFERENCE 与 State `SUPERSEDED_BY` State 两类 bounded lineage，不建立 generic knowledge graph | FROZEN |
| D-070 | Phase 02 DXE 使用固定 SurfaceLayoutV1 template，只开放 TaskPane/ReferencePane，不实现坐标、自由 resize、任意 pane 或 Generative UI | FROZEN |
| D-071 | FIPC/1 transport、framing、hello 与 `ProtocolVersion 1.0` 保持不变；Phase 02 methods 通过 capabilities additive 扩展 | FROZEN |
| D-072 | Personal Memory、Agent、Browser、LLM、Capture/Inbox、Requirement/Coding/Verify/Evidence/Capability 等 Later Phase 能力继续排除在 Phase 02 外 | CONFIRMED |
| D-073 | Phase 02 REFERENCE 保持 HTTPS-only；State content 4000、Activity summary 240、Resume BLOCKER/QUESTION/TASK 每组 5 条 | FROZEN |
| D-074 | REFERENCE lifecycle 修正为 ACTIVE↔ARCHIVED；restore 不自动恢复旧 focus 或已 retracted SOURCED_FROM | FROZEN |
| D-075 | Relation self-edge 必须比较完整 typed endpoint；SQL 使用 `from_type != to_type OR from_id != to_id` | FROZEN |
| D-076 | 一个 SurfaceLayoutV1 最多一个 TASK_PANE/FIELD_TASKS；零 TASK 的空 TaskPane 是合法默认状态且不创建占位 Reality | FROZEN |
| D-077 | 固定 Surface template 保留；72/28 只作为 Phase 02 renderer default，不进入 durable Contract/Snapshot/Migration semantics | FROZEN |
| D-078 | 真实 0001 + Candidate 0002 临时 SQLite normal upgrade 与 incompatible-data rollback probe 均 PASS；该证据不等于 Freeze 或 Implementation Authorization | VERIFIED |
| D-079 | 用户于 2026-08-14 正式裁决 `PHASE_02: APPROVED_FOR_FREEZE`；Phase 02 Implementation Spec、Contract Delta 与 Migration 0002 Spec 收敛为正式 Frozen 规格 | FROZEN / APPROVED |
| D-080 | Phase 02 Freeze 不构成产品实现授权；`PHASE_02_IMPLEMENTATION_AUTHORIZED: NO`、`PHASE_02_IMPLEMENTATION_STARTED: NO`，不得创建产品 Migration 0002 或修改 Rust/TypeScript Phase 02 实现 | CONFIRMED |
