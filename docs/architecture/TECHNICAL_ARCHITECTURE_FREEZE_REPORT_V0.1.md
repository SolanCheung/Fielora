# Fielora V0.1 Technical Architecture Freeze Report

状态：FREEZE COMPLETE / IMPLEMENTATION NOT STARTED  
日期：2026-08-13  
阻塞 Gate：`LOCAL_WORKTREE_NOT_CONFIRMED`

## 1. 用户裁决

```text
Technical Architecture: APPROVED FOR FREEZE
Core Contracts: APPROVED FOR FREEZE
Phase 01 Schema: APPROVED FOR FREEZE
Phase 01 Implementation Spec: READY
Remote Repo: CONFIRMED EMPTY
Local Worktree: NOT CONFIRMED
Implementation: NOT STARTED
```

本轮只更新项目事实与规格文档，没有修改产品代码、安装依赖、初始化技术栈、执行 `git init`、clone remote 或切换本机 Node。

## 2. Required Freeze Amendments

四项 amendment 已全部写入 Technical Architecture 与 Phase 01 Implementation Spec：

1. pnpm 从 11.13.1 更新并冻结为 11.21.0；
2. rusqlite 从 0.40.1 更新并冻结为 0.40.2，启用 `bundled`；
3. trusted local application origin boundary 冻结为 production `fielora://app`；dev 仅允许当次 Forge entry 解析出的精确 loopback origin；Browse/remote content 始终不受信任且没有 Fielora bridge；
4. Rust Sidecar 将 parent-pipe stdin EOF 视为权威 shutdown signal，安全清理并在 2 秒内退出，不得成为 orphan。

版本核验：pnpm 11.21.0 是 2026-08-09 的 signed release；rusqlite 0.40.2 已在 crates.io 发布、未撤回，crate metadata 包含 `bundled` feature。

## 3. 已冻结事实

- Phase 01 toolchain：Electron 43.4.0、Node 24.18.1 LTS、pnpm 11.21.0、Rust 1.97.1 / Edition 2024、rusqlite 0.40.2 `bundled`、Electron Forge + Webpack + TypeScript + React；
- monorepo 边界与 dependency direction；
- Electron Main supervised Rust Sidecar；
- FIPC/1 JSON Lines + JSON-RPC-compliant envelope；
- SQLite single Storage Worker、embedded migrations 与 checksum；
- Core Contracts 五层、typed identity、Reality / Surface Snapshot truth separation；
- Phase 01 Migration 0001、commands、queries、events 与 revision 规则；
- production/dev trusted application origin policy；
- parent-pipe EOF shutdown policy；
- Rust → TypeScript DTO generation 与 drift gate；
- Phase 01 Static → Human Acceptance gate 与 Portable packaging；
- Installer checkpoints：Phase 03、Phase 08、Final Alpha。

## 4. Repo 与本机环境事实

- Remote：`git@github.com:SolanCheung/Fielora.git`；
- Remote 状态：`REMOTE_REPO_CONFIRMED_EMPTY`；
- 当前目录：非 Git Context Pack；
- Local Worktree：`LOCAL_WORKTREE_NOT_CONFIRMED`；
- Implementation：`IMPLEMENTATION_NOT_STARTED`；
- 本机 Node 由 `D:\AppInstall\nvm\nvm` 下的 NVM 管理；用户报告主要版本为 14.18.2 与 22.16.0；
- 14.18.2/22.16.0 都不能替代冻结的 Phase 01 Node 24.18.1；当前没有安装或切换版本。

Remote 已确认不等于 Local Worktree 已确认。用户明确给出 Local Worktree 前，不得在当前目录 `git init`，也不得开始 bootstrap 或依赖安装。

## 5. 已关闭冲突

| 冲突 | 关闭方式 |
|---|---|
| Candidate / 等待裁决 vs 用户批准 | 四份核心文档改为 FROZEN / APPROVED；Phase 01 Spec 改为 READY + Local Worktree Gate |
| pnpm 11.13.1 vs 11.21.0 | 统一为 11.21.0 |
| rusqlite 0.40.1 vs 0.40.2 | 统一为 0.40.2 `bundled` |
| “known local origin”语义过宽 | production 精确为 `fielora://app`；dev 精确到当次 Forge loopback origin；禁止 wildcard/file/remote |
| 只有显式 `system.shutdown` 的退出路径 | 增加 parent-pipe EOF 权威退出语义与 Integration test |
| “Alpha 中定期验证 Installer”未给 cadence | 固定为 Phase 03 / Phase 08 / Final Alpha |
| `REAL_REPO_NOT_CONFIRMED` 混合远端与本地状态 | 拆为 `REMOTE_REPO_CONFIRMED_EMPTY` 与 `LOCAL_WORKTREE_NOT_CONFIRMED` |
| Technical Architecture 阶段冻结 Connector transport 的旧措辞 | Contract/Adapter 已冻结；具体 MCP protocol/transport 明确延至 Phase 09 前冻结 |

## 6. 仍 Open 的技术决定

以下不阻塞 Phase 01，但必须在所属 Phase 前通过 bounded spike / review 冻结：

- precise Browse tab / WebContents model；
- code editor implementation；
- LSP host boundary；
- terminal PTY 与后续 Platform Adapter 细节；
- project scan architecture；
- CodingAgentProvider 的 OpenCode / ACP viability；
- Generic MCP 的协议范围、client/runtime、stdio/network transport、discovery、auth、cancel 与 negotiation；
- Provider credential vault；
- Evidence artifact store、retention 与 encryption；
- updater、code signing 与 final installer technology；
- future Exchange / sync 的 ID、access 与 provenance 细节；
- Capability Acquisition / Mandate 是否进入后续版本。

当前唯一阻塞 Phase 01 实现的外部决定是 Local Worktree 的确认。

## 7. 新增冲突审计

没有新增产品范围或架构硬冲突。

存在一个已显式管理的环境差异，不构成架构冲突：本机现有主要 Node 版本是 14.18.2/22.16.0，而冻结工具链要求 24.18.1。该差异由未来 Local Worktree Toolchain Gate 处理，不能在当前 Freeze 阶段提前安装或用 22.16.0 降级替代。

## 8. 文档同步

已同步：

- `docs/context/02_PROJECT_REALITY.md`；
- `docs/context/03_DECISIONS.md`；
- `docs/context/04_REJECTED_DEFERRED.md`；
- `docs/architecture/TECHNICAL_BASELINE_V0.1.md`；
- `docs/architecture/TECHNICAL_ARCHITECTURE_V0.1.md`；
- `docs/architecture/CORE_CONTRACTS_V0.1.md`；
- `docs/architecture/SCHEMA_FREEZE_V0.1.md`；
- `docs/architecture/PHASE_01_IMPLEMENTATION_SPEC_V0.1.md`；
- `docs/architecture/TEST_AND_DELIVERY_BASELINE_V0.1.md`；
- `docs/architecture/TECHNICAL_ARCHITECTURE_REVIEW_REPORT_V0.1.md`；
- `README.md`、`AGENTS.md`、Reading Gate、Conversation Index 与 `context_manifest.json`。

## 9. 下一 Gate

下一步不是实现，而是等待用户确认真正 Local Worktree。确认后，必须先只读报告 worktree absolute path、remote、branch、commit/empty-repo state 与 dirty files，并核验精确工具链；没有新的明确实现授权时，仍不得编码。
