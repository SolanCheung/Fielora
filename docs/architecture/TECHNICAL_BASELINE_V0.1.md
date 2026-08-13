# Fielora V0.1 Technical Baseline

状态：V0.1 Technical Architecture Freeze（2026-08-13）；不得擅自扩大。

## 1. 目标平台

V0.1 唯一正式验收平台：**Windows 11 x64** 本地桌面应用。

第一版不以 Browser Extension 或 Web SaaS 作为主产品形态。

架构从第一天必须跨平台。Core、Field Model、UI、Agent、Provider、Capability Contract 不得依赖 Windows-specific 假设。未来目标包含 macOS、Linux，并进一步支持跨设备 Field Continuity；这不是 V0.1 多平台交付承诺。

## 2. 语言

### TypeScript + React
负责 Fielora Shell、Now、Inbox、Browse UI、Field UI、Composer / Summon、Context Chips、DXE Surface、Code Workspace UI。

UI 业务状态与组件 Contract 不得直接编码 Windows-only 假设；平台差异通过受控 Platform Adapter / capability exposure 进入。

### Rust
负责 Field Runtime、Field State、Context、IDR、Agent orchestration、Model Provider、Capability、Evidence、Persistence、Existing Project analysis、Files / Git / Native integration。

Core 业务模块保持 OS-neutral；Files / Git / Native、process、shell、PTY、credential storage 等 OS-specific 实现进入 Platform Adapter。

### Python
仅 research / eval / benchmark / experiments / test data tooling。

### C++
V0.1 不作为主语言。只有未来 Chromium 深层集成确实需要时进入薄 Adapter Layer。

## 3. Browser Host

V0.1 使用 **Electron + bundled Chromium**。

原因：优先验证 Fielora 产品范式、避免第一版陷入 Chromium C++ 大工程、保留 Browser Runtime、快速打包 Windows 桌面产品。

当前禁止第一阶段直接 Fork Chromium，也不要让 Electron API 渗入 Field Core。

完整 Chrome Extension compatibility 不属于 V0.1 验收条件，只保留 future compatibility target，不得因该目标提前 Fork Chromium。

## 4. 进程基线

```text
Fielora.exe
  ├─ Electron Main
  │   ├─ Browser / WebContents
  │   └─ Desktop lifecycle
  ├─ Renderer
  │   └─ React / TypeScript UI
  └─ fielora-core.exe
      └─ Rust Sidecar
```

Rust Sidecar 便于 Core 与 Electron 解耦、独立测试、崩溃隔离，并降低未来替换 Browser Host 的代价。

Electron Main 监督 Sidecar 生命周期。Sidecar 将 parent-owned stdin pipe EOF 视为权威 shutdown signal：停止接收请求，安全完成或回滚 transaction，关闭 storage/logs，并在 2 秒内退出，不得成为 orphan；Sidecar 不自行重启。

## 5. 通信边界

Renderer → Electron Main：Browser / window / desktop actions。

Renderer → Rust Core：通过受控 IPC Client。

Rust Core 不直接操作 React DOM。

Electron Main 不拥有 Field business truth。

Field / State / Evidence 的事实源位于 Core / Persistence 层。

## 6. 模块建议

```text
fielora/
├─ apps/desktop/
├─ packages/
│  ├─ ui/
│  ├─ surfaces/
│  ├─ browser-ui/
│  ├─ editor-ui/
│  └─ ipc-client/
├─ crates/
│  ├─ field/
│  ├─ state/
│  ├─ context/
│  ├─ idr/
│  ├─ agent/
│  ├─ capability/
│  ├─ model/
│  ├─ evidence/
│  ├─ project/
│  ├─ storage/
│  ├─ platform/
│  └─ native/
├─ research/
├─ evals/
└─ tests/
```

## 7. Persistence

V0.1 原则：**Local-first**。

需要持久化 Fields、State、Capture、Inbox、Library refs、Requirements、Project Reality、Evidence、Resume Snapshot、Provider config metadata。

DB 已冻结为 SQLite + `rusqlite 0.40.2` `bundled`，由 Rust Core 单一 Storage Worker 持有 connection；migration 内嵌且校验 checksum。不要让 UI localStorage 成为核心事实源。

Field / Object 必须使用与本地文件路径分离的稳定 identity。本地路径、设备上的应用定位和其他本机资源引用属于 `Device Binding`；Persistence 不得用 Windows absolute path 充当跨设备对象主键。

Field / Object / Activity 等核心模型需为未来多主体和交换预留 owner / actor / visibility / share_scope / permissions / provenance 语义，但 V0.1 不因此建设完整账号、同步、通信或共享服务。

## 8. Model Provider

必须定义统一 Provider Interface，不得在 Agent / Field 逻辑中直接写死厂商 SDK。

至少抽象 chat/responses、tool calling、streaming、usage、errors、model capabilities。

V0.1 不实现本地模型 Runtime。

## 9. Capability Connector

统一抽象外部工具能力，未来 Backend 可来自 MCP / API / CLI / Plugin / Browser Extension / Native Bridge。

V0.1 必须定义 Contract 并实现一个最小真实 Connector，优先采用 `Generic MCP Connector` 验证 `Contract → Call → Result → Evidence` 闭环。Technical Architecture 已冻结 Connector Contract、Capability Invocation/Policy/Result/Evidence 与 Adapter 边界；具体 MCP 协议范围、client/runtime 选择、process/network transport、discovery、authentication、timeout/cancellation 与 capability negotiation 在 Phase 09 开工前冻结。

Connector Contract 本身保持跨平台；transport 与 OS integration 通过 Adapter 隔离。禁止把未实现 Connector 或失败 Call 伪装成成功。

## 10. Browser Capability

V0.1 需要 navigation、current page、selection、screenshot where feasible、page metadata、downloads、DevTools access、browser preview。

完整 Chrome Extension compatibility 不属于 V0.1 验收条件，也不作为 Electron V0.1 已解决事实。它只保留为 future compatibility target；若未来成为核心需求，应单独立项评估 Chromium 深度集成。

## 11. Security

至少区分 read、local write、external send、destructive action、credentials、payments、permission elevation。

Agent 重要动作必须可追溯。V0.1 先实现真实可验证的最小权限边界，不做“万能 Agent 权限”。

生产 App UI 的唯一 trusted local application origin 是 `fielora://app`；开发态只在非 packaged 模式下接受 Forge renderer entry 的当次精确 loopback origin。禁止 wildcard localhost/127.0.0.1、任意端口、`file://` 或远程 origin。Browse/remote WebContents 使用隔离 session，不加载 Fielora preload，也不获得 typed app bridge。

## 12. 未来 Chromium 路线

只有当完整 extension compatibility、Browser Process 深层控制、Profile、Network、自定义 Chromium capability、更严格 sandbox 或 Electron 无法实现的 Browser UX 成为核心阻塞时再评估。

路线：`Electron Validation → Browser Adapter Boundary → Deeper Chromium Integration → Fork only if justified`

## 13. Platform Adapter

至少需要为 filesystem/path、process/shell、terminal PTY、credential/secure storage、window/desktop lifecycle、default browser/app launch、permissions 等 OS-specific 能力建立 Adapter 边界。Technical Architecture 已冻结 Phase 01 `fielora-platform` 边界、path/device identity 与 process lifecycle；PTY、credential 等后续接口粒度和 Windows 首实现方案在所属 Phase 开工前冻结。

核心层使用平台无关的 URI/identity/metadata 表达对象；Windows path 只存在于 Windows Device Binding。未来 macOS/Linux Adapter 不应要求改写 Field Model、Agent、Provider 或 Capability Contract。

## 14. Fielora Exchange 模型预留

长期 Exchange 可承载 Message / Object / Request / Task / Proposal / Result / Field Invite。V0.1 只要求核心实体与 Activity 不假设永久单用户本地环境，并预留 owner / actor / visibility / share_scope / permissions / provenance。

Core Contracts 与 Phase 01 Schema 已冻结 principal、owner、actor、visibility/share_scope/permission/provenance 的语义边界及首阶段所需物理字段；future Exchange 的完整 ID namespace、权限继承、provenance chain 与跨设备迁移策略仍延后。V0.1 不新增完整通信协议、IM、共享 Field、身份服务、云同步或 Steward-to-Steward 自动协作。

## 15. 冻结工具链

Phase 01 精确值：Electron 43.4.0、Node 24.18.1 LTS、pnpm 11.21.0、Rust 1.97.1 / Edition 2024、rusqlite 0.40.2 `bundled`、Electron Forge + Webpack + TypeScript + React。

本机 Node 由 `D:\AppInstall\nvm\nvm` 下的 NVM 管理；Node 24.18.1 已安装并设为 active，pnpm 11.21.0 已准备。Rust 1.97.1 已设为 default toolchain，并安装 rustfmt/clippy。Repo 使用 `.node-version` 与 `rust-toolchain.toml` 固定版本；产品 package/Cargo workspace 仍未创建。

## 16. 工程仓库前置条件

Canonical Local Worktree 已确认为 `F:\项目\Fielora`，已初始化 Git `main` 并绑定 `origin` 到 `git@github.com:SolanCheung/Fielora.git`。Baseline Commit 只允许包含冻结 Context Pack/docs、`.gitignore` 与精确工具链 metadata。Repo Bootstrap 完成不授权 Phase 01 实现；实现仍等待明确用户授权。

## 17. 仍开放的技术决定

不阻塞 Phase 01、按所属 Phase 冻结：Electron tab/webcontents Browser model、code editor implementation、LSP host boundary、terminal PTY、project scan architecture、CodingAgentProvider/OpenCode/ACP viability、provider credential storage、updater/code signing/final installer technology、Evidence artifact retention/encryption、Generic MCP Connector 的协议范围与 transport，以及 future Exchange 的 ID/access 细节。

Codex 不得在未评审情况下把这些设计成不可替换的深耦合实现。
