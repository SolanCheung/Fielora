# Fielora V0.1 Test & Delivery Baseline

状态：V0.1 Technical Architecture Freeze（2026-08-13）

## 1. 完成定义

禁止：`pnpm dev 能打开窗口 = 完成`。

每个开发 Phase 统一经过：`Static → Unit(TS/Rust) → Rust Clippy/Release Build → Integration → Desktop E2E → Package → Packaged Smoke → Human Experience Acceptance`。

各 Gate 必须按真实结果报告；后序 Gate 不能把前序 FAIL 静默覆盖为 PASS。

## 2. 开发入口

仓库最终应提供统一开发入口，例如 `pnpm dev`，启动 Renderer dev server、Electron Main、Rust Core。具体实现由 Technical Architecture 决定。

## 3. Static Gate

至少覆盖 TypeScript typecheck/lint、Rust fmt check（规则在 Technical Architecture 冻结）以及配置/契约的静态校验。Static 只证明静态约束通过，不替代 Unit 或运行时验证。

## 4. Unit Gate（TS / Rust）

TypeScript Unit 覆盖 reducers、interaction state、Context Chips、Surface layout、Composer routing client、UI components、persistence client boundary。

Rust Unit 覆盖核心 State、Permission、Evidence、IDR、Capability Contract、稳定 identity / Device Binding 边界及 Exchange 预留语义。核心逻辑必须可脱离 Electron 测试。

至少运行：

```bash
cargo test --workspace
```

## 5. Rust Clippy / Release Build Gate

至少运行：

```bash
cargo clippy --workspace --all-targets
cargo build --release
```

## 6. Integration

必须验证 UI ↔ Rust Core、Field persistence、Resume、Provider error handling、Browser context extraction、Project Reality persistence、Platform Adapter boundary，以及 Generic MCP Connector 的 `Contract → Call → Result → Evidence`。Connector FAIL 不得被记录为成功。

## 7. Desktop E2E

使用能真实启动 Desktop App 的 E2E 方案，至少自动化 Acceptance Scenarios A-I：Capture、Browse Ask、Promote、Resume、Idea→Requirement、Existing Project Takeover、Build、Verify、Generic MCP Connector。

V0.1 唯一正式 E2E 验收平台是 Windows 11 x64。架构测试需防止 Core/Contract 引入 Windows-specific 假设，但不要求 V0.1 在 macOS/Linux 跑正式产品验收。

## 8. Package

每个开发 Phase 需要生成 Packaged Build。

每个开发 Phase 必须生成 Portable ZIP、Test Report、Build Info、Known Issues。Installer 固定在 Phase 03、Phase 08、Final Alpha 构建验证；Fielora V0.1 Alpha 最终交付必须同时包含 Portable ZIP + Installer。

建议目录：

```text
artifacts/
├─ portable/
├─ installers/
├─ test-reports/
└─ build-info/
```

## 9. Portable 与 Installer

Portable Windows Build 是每个 Phase 的硬 Gate，方便人工测试、问题复现和保留阶段构建。Installer 不是 Phase 01/02 等每个早期 Phase 的硬 Gate，但 Phase 03、Phase 08 与 Final Alpha 是固定 Installer Gate；Final Alpha 必须同时有 Portable + Installer。

## 10. Packaged Smoke

必须验证 App 能启动、Rust Sidecar 路径正确、resource path 正确、persistence path 正确、不依赖 dev-only env、Browser 能打开、Capture 能保存、Field 能恢复、packaged app 不因权限差异失败。

Phase 01 还必须真实验证：production 只接受 `fielora://app` trusted origin；dev 只接受当次精确 Forge loopback origin；remote/wrong-origin/subframe bridge 被拒绝；Browse WebContents 没有 Fielora preload/bridge；关闭 parent stdin 且不发送 `system.shutdown` 时 Rust Sidecar 在 2 秒内退出并且没有 orphan。

## 11. Human Experience Gate

自动测试 PASS 后仍不能自动宣布产品验收。

人工必须检查 Summon 是否打断、Capture 是否够快、UI 是否杂乱、Browse 是否正常、Field 是否真正不同于 AI Browser、Surface 切换是否自然、Resume 是否减少重建上下文、Agent 状态是否过度打扰、Error/Loading 是否破坏工作区、字体间距布局视觉层级。

只有 `Engineering Gate PASS + Human Experience Gate PASS` 才算阶段通过。

## 12. Codex 阶段报告

每轮交付至少报告：

```text
Static: PASS/FAIL
TS Unit: X/X
Rust Tests: X/X
Rust Clippy: PASS/FAIL
Rust Release Build: PASS/FAIL
Integration: X/X
Desktop E2E: X/X
Package: PASS/FAIL
Packaged Smoke: PASS/FAIL
Human Experience Acceptance: PASS/FAIL
Acceptance Scenarios: X/9
Artifact: <path>
Known Issues: <count>
```

不得只说“已完成”。

## 13. V0.1 最终交付

目标：

```text
Fielora V0.1 Alpha/
├─ FieloraSetup-0.1.0.exe
├─ Fielora-0.1.0-win-x64.zip
├─ test-report.html
├─ KNOWN_ISSUES.md
└─ BUILD_INFO.json
```

用户不应为了测试产品而先安装 Node / Rust / pnpm，最终测试者应能直接双击 Fielora。

## 14. 当前不属于 V0.1 验收的内容

完整 Chrome Extension compatibility、macOS/Linux 正式产品验收、跨设备 Field Continuity、完整 Fielora Exchange 通信/IM/共享 Field、Steward-to-Steward 自动协作均不进入 V0.1 Acceptance。不得因 future compatibility target 将这些内容变成隐藏 Gate。
