# Fielora V0.1 Baseline Freeze Report

> 历史 Freeze 记录：以下状态描述 baseline freeze 当时的事实。当前状态以 `02_PROJECT_REALITY.md` 与 `artifacts/phase01/PHASE_01_CLOSEOUT_REPORT.md` 为准；Phase 01 已于 2026-08-14 裁决 COMPLETE。

> `HISTORICAL / SUPERSEDED TERMINOLOGY`：本文中的 `IDR Intent` 是当前
> `Entry Intent Resolver` 的旧名，不是 `Individualized Disposition Runtime`。

状态：Baseline Freeze 完成；等待 Technical Architecture 评审  
冻结日期：2026-08-13  
依据：用户在首次阅读 Gate PASS 后给出的最新明确裁决

## 1. 本轮范围与约束

本轮只更新项目事实与规格文档，没有修改产品代码、安装依赖、初始化技术栈、删除文件或进入实现。

当前目录仍是非 Git Context Pack。本轮没有执行 `git init`。进入实现前，必须先确认真正 Fielora Repo，核验其与 `git@github.com:SolanCheung/Fielora.git` 的关系，再把本 Context Pack 放入该 Repo。

## 2. 已更新文件

1. `docs/context/02_PROJECT_REALITY.md`
2. `docs/context/03_DECISIONS.md`
3. `docs/context/04_REJECTED_DEFERRED.md`
4. `docs/product/FIELORA_V0.1_INTERACTION_SPEC_CN.md`
5. `docs/architecture/TECHNICAL_BASELINE_V0.1.md`
6. `docs/architecture/TEST_AND_DELIVERY_BASELINE_V0.1.md`
7. `context_manifest.json`（Context Pack 版本与受影响文件哈希同步；不改变 required reading 清单）
8. `docs/context/BASELINE_FREEZE_REPORT.md`（本报告）

## 3. 修改了哪些事实

### 3.1 Summon 与 Capture

- `Ctrl/Cmd + Shift + Space` 现在只有一个定义：`Summon Fielora`。
- Capture 不再拥有独立一级快捷键，也不新增第二套 Capture 快捷键。
- Capture 是 Summon 接收输入后，由 IDR 解析出的 CAPTURE Intent。
- Acceptance Scenario A 保持为 `Browse → Summon → “记一下……” → 自动关联页面 → 保存 → 回 Browse`。

### 3.2 测试 Gate

统一为：

`Static → Unit(TS/Rust) → Rust Clippy/Release Build → Integration → Desktop E2E → Package → Packaged Smoke → Human Experience Acceptance`

具体含义同步为：

- Static：TypeScript 静态检查、Rust fmt check 与配置/契约静态校验，具体命令在 Technical Architecture 冻结；
- Unit(TS/Rust)：TS 与 Rust 单元测试属于同一阶段；
- Rust Clippy/Release Build：单独执行 Clippy 与 Release Build；
- Integration：覆盖 UI ↔ Core、Persistence、Resume、Provider、Browser Context、Project Reality、Platform Adapter 与 Generic MCP Connector；
- Desktop E2E：真实启动 Desktop App；
- Package 与 Packaged Smoke 分离；
- 最后必须经过 Human Experience Acceptance。

### 3.3 Chrome Extension compatibility

- 完整 Chrome Extension compatibility 不属于 V0.1 验收条件。
- 只保留 future compatibility target。
- 不得以该目标为理由提前进入 Chromium Fork。
- Chromium 路线仍是 `Electron Validation → Browser Adapter Boundary → Deeper Chromium Integration → Fork only if justified`。

### 3.4 Portable / Installer

- 每个开发 Phase 必须提供 Portable Build、Test Report、Build Info 和 Known Issues。
- Installer 在 Alpha 阶段定期构建和验证，不是每个早期 Phase 的硬 Gate。
- Fielora V0.1 Alpha 最终交付必须同时包含 Portable + Installer。

### 3.5 Capability Connector

- V0.1 不再只交付 Connector Interface。
- 必须包含一个最小真实 Connector，当前优先方向是 `Generic MCP Connector`。
- 必须验证 `Contract → Call → Result → Evidence` 闭环。
- Connector 失败不得伪装为成功。
- Acceptance Scenarios 从 A–H 扩展为 A–I，I 为 Generic MCP Connector 的真实闭环。
- MCP 的具体协议范围、client/runtime、process/network transport、discovery、authentication、timeout/cancellation 与 capability negotiation 留到 Technical Architecture 冻结。

### 3.6 工程仓库前置条件

- 当前非 Git Context Pack 目录不得擅自 `git init`。
- 进入实现前必须确认真正 Fielora Repo，并核验与 `git@github.com:SolanCheung/Fielora.git` 的关系。
- Context Pack 必须放入真正 Repo，使 `AGENTS.md`、Project Reality、Decisions 和规格成为实现约束。

### 3.7 Cross-platform

- Windows 11 x64 仍是 V0.1 唯一正式验收平台。
- 架构从第一天必须跨平台，Core、Field Model、UI、Agent、Provider、Capability Contract 不得依赖 Windows-specific 假设。
- Filesystem/path、process/shell、PTY、credential storage、window lifecycle、app launch、permissions 等 OS-specific 能力进入 Platform Adapter。
- 长期目标包含 macOS、Linux 和跨设备 Field Continuity，但不构成 V0.1 多平台交付承诺。
- Field/Object 使用稳定 identity，不得把 Windows absolute path 或任何本地文件路径当作对象主键。
- 本地路径、设备应用定位和本机资源引用属于 Device Binding。

### 3.8 Fielora Exchange

- Fielora 长期允许不同用户间交换 Message、Object、Request、Task、Proposal、Result、Field Invite。
- V0.1 不实现完整通信、IM、共享 Field、身份/同步服务或 Steward-to-Steward 自动协作。
- V0.1 只要求 Field / Object / Activity 等核心模型不假设永久单用户本地环境，并为未来预留 owner / actor / visibility / share_scope / permissions / provenance。
- 这些预留不新增 V0.1 Exchange UI、账号体系或网络服务。

## 4. 已关闭的冲突

### CLOSED-001 Capture 与 Summon 快捷键冲突

已关闭。`Ctrl/Cmd + Shift + Space` 统一为 Summon Fielora；Capture 是 IDR Intent。

### CLOSED-002 测试链顺序冲突

已关闭。Project Reality 与 Test & Delivery Baseline 均使用同一条完整测试 Gate。

### CLOSED-003 Chrome Extension compatibility 口径不清

已关闭。它是 future compatibility target，不是 V0.1 Acceptance，也不能触发提前 Fork。

### CLOSED-004 Portable 与 Installer 阶段要求冲突

已关闭。Portable 为每个 Phase 硬 Gate；Installer 在 Alpha 定期验证，最终 V0.1 Alpha 为硬 Gate。

### CLOSED-005 Capability Connector 是 Interface 还是实际能力

已关闭。V0.1 要求 Contract + 一个最小真实 Generic MCP Connector，并进入 Integration/E2E/Evidence 验收。

### CLOSED-006 非 Git Context Pack 应如何处理

行为规则已关闭：不得在此 `git init`，必须先确认真正 Repo。实际 Repo 的位置、remote 和当前分支仍属于待确认的工程环境前置项。

## 5. 仍然 Open 的技术决策

以下事项必须在 Technical Architecture 评审中冻结，当前文档没有擅自决定实现：

1. Persistence DB 与 migration/versioning 策略；
2. Rust IPC transport、消息 schema、versioning、timeout/cancellation 与错误模型；
3. Electron tab / webContents model 与 Browser Adapter 边界；
4. Code editor implementation；
5. LSP host boundary；
6. Terminal PTY 架构，以及 Windows/macOS/Linux Platform Adapter 的接口；
7. Project scan architecture、增量更新和 Project Reality provenance；
8. Provider credential storage；
9. Updater、code signing 与 Installer 技术；
10. 精确 sandbox / permission model；
11. Platform Adapter 的 crate/package 拆分、接口粒度和 Windows 首实现；
12. Stable Field/Object ID 方案与 Device Binding schema；
13. Exchange 预留字段的 schema、ID namespace、默认值、权限继承、provenance chain 和 migration；
14. Generic MCP Connector 的协议版本/范围、client/runtime、stdio 或 network transport、discovery、authentication、capability negotiation、timeout/cancellation；
15. Static Gate 的 TypeScript lint/typecheck 和 Rust fmt 的最终命令；
16. Alpha 阶段 Installer 的具体定期验证节奏；
17. 真正 Fielora Repo 的本地位置、remote/branch 与 Context Pack 迁入方式。

## 6. 是否有新增冲突

本次裁决同步后，没有发现新的硬性产品冲突。

有三组需要在 Technical Architecture 中继续防止误读的“边界张力”，但它们不是冲突：

1. **Windows-only Acceptance vs cross-platform architecture**：V0.1 只交付/验收 Windows；跨平台要求约束核心架构和模型，不要求本版同时交付 macOS/Linux。
2. **Exchange model readiness vs no Exchange feature**：owner/actor/visibility/share_scope/permissions/provenance 是模型预留，不代表 V0.1 要做账户、网络、IM、共享 Field 或同步。
3. **Generic MCP Connector vs protocol not frozen**：P0 已确定必须有一个真实 Connector，但协议范围和 transport 尚待架构评审；这不允许退回 Interface-only，也不允许提前扩为通用专业软件自动化平台。

## 7. 更新后的 V0.1 P0

产品工作流：

- Shell、Now；
- Inbox、Universal Capture；
- Browse foundation；
- Summon Fielora、Context Chips、Progressive Context；
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
- Capability Connector Contract + 一个最小真实 Generic MCP Connector；
- Acceptance Scenarios A–I。

强制架构边界：

- Windows 11 x64 是唯一正式验收平台；
- Core、Field Model、UI、Agent、Provider、Capability Contract 保持跨平台；
- OS-specific 能力进入 Platform Adapter；
- Stable Field/Object identity 与 Device Binding 分离；
- Field/Object/Activity 预留 owner / actor / visibility / share_scope / permissions / provenance；
- 上述跨平台和 Exchange 预留不得扩大 V0.1 UI、网络或账号范围。

交付 Gate：

- `Static → Unit(TS/Rust) → Rust Clippy/Release Build → Integration → Desktop E2E → Package → Packaged Smoke → Human Experience Acceptance`；
- 每个 Phase 必须有 Portable；
- Alpha 阶段定期验证 Installer；
- V0.1 Alpha 最终必须有 Portable + Installer。

## 8. 更新后的 Deferred / Not in V0.1

既有 Deferred 保持：

- Local LLM；
- 更深 Chromium Integration / Fork；
- Fielora App Runtime / App Marketplace；
- 专业软件深度 MCP/Plugin 自动化；
- Creative Field 深化和完整专业编辑器；
- Personal Steward / Butler；
- Capability Compiler 全自动化；
- Agent / Capability / App Marketplace；
- Multi-Agent Society。

本次新增或进一步明确 Deferred：

- 完整 Chrome Extension compatibility；
- macOS / Linux 正式产品交付与验收；
- 跨设备 Field Continuity 完整实现；
- Fielora Exchange 的完整通信、IM、共享 Field、Field Invite 交付；
- 身份服务、云同步与 Steward-to-Steward 自动协作。

明确边界：Deferred 项只能保留接口和模型演进空间，不能变成 V0.1 隐藏功能或隐藏验收条件。

## 9. Freeze 结论

本次 Baseline Freeze 已把最新用户裁决同步到事实源、决策账本、否决/延期清单、交互规格、技术基线和测试交付基线。已知文档口径冲突均已关闭，没有新增硬冲突。

当前状态：**不开始编码，等待 Technical Architecture 评审。**
