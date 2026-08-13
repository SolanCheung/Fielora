# Fielora V0.1 Phase 01 Test Report

执行时间：2026-08-13（Asia/Shanghai）  
平台：Windows 11 x64（10.0.26200）  
源码：`3df25ebc23870d55700b85efae22f7e3428b969d`  
结论：`ENGINEERING PASS / WAITING HUMAN ACCEPTANCE`

## Gate 汇总

| Gate | 结果 | 可复查结果 |
|---|---|---|
| Rust → TypeScript contract drift | PASS | regenerate 后 `packages/contracts/generated` 无 diff |
| TypeScript typecheck | PASS | `tsc --noEmit` |
| ESLint | PASS | desktop source/config 全部通过 |
| Rust format | PASS | `cargo fmt --all -- --check` |
| TypeScript unit | PASS | 8/8，0 fail |
| Rust unit | PASS | 13/13，0 fail |
| Rust Clippy | PASS | workspace/all targets，`-D warnings` |
| Rust release build | PASS | `fielora-core` release binary |
| Core/SQLite integration | PASS | 3/3，0 fail |
| Desktop E2E dev | PASS | real Electron + real Core + real SQLite |
| Package | PASS | Electron Forge win32 x64 packaged app |
| Packaged smoke/restart/resume | PASS | real packaged `Fielora.exe` + packaged Core |
| Portable build | PASS | 145,700,464-byte ZIP |
| Portable extract/run/restart/resume | PASS | ZIP 解压至临时目录后直接运行 |
| Human Experience Acceptance | WAITING | 必须由用户人工裁决 |

全量原始输出见 `FULL_GATE.log`；末行是：

```text
PHASE01_ENGINEERING_GATE=PASS
```

## Unit / Integration 覆盖

TypeScript 8 项：FIPC 增量解析、pending/deadline 与 late response、Startup/Now view state、event invalidation ordering、production/dev trusted origin、expected webContents/main-frame/origin、bridge payload allowlist。

Rust 13 项：wire enum 稳定性、FIPC 增量与 oversize recovery、major/minor protocol、title/goal、UUID/transaction event timing、revision conflict、device identity、Migration 0001 idempotence/checksum、snapshot latest-10、真实 SQLite close/reopen。

Core integration 3 项：

1. 真实 Core 经 FIPC create/update/snapshot，关闭并重启后从真实 SQLite 恢复；
2. 不发送 `system.shutdown`，只关闭 parent stdin，Core 在 65.15 ms 退出（小于 2 秒）；
3. invalid UTF-8/JSON、4 MiB oversized frame recovery、unknown method、wrong major、newer minor、revision conflict 均按 contract 行为完成。

## Packaged / Portable acceptance

两种 build 均执行同一真实闭环：

1. 启动真实 Electron；
2. 确认 production origin 为 `fielora://app`，Renderer 没有 Node/`require`；
3. 拒绝 subframe bridge 与 external navigation；
4. 创建 `Fielora / Build V0.1`，Goal 为 `Ship a runnable Fielora V0.1`；
5. Focus 更新为 `Architecture`，并保存 current-device Surface Snapshot；
6. graceful close，重新启动同一 build；
7. query Field 与 latest Snapshot，确认 Focus、revision 与 observed revision；
8. 确认 Sidecar 来自 packaged `resources/fielora-core.exe`；
9. kill Core，观察 unavailable → Main supervision restart → hello/requery → Field 仍存在；
10. 再次 graceful close，确认无残留受测 Core。

Portable 不是从 workspace/out 直接执行：Gate 先解压 ZIP 到新临时目录，再从解压根目录运行 `Fielora.exe`。验收数据使用隔离的临时 `LOCALAPPDATA`，不是 dev DB。

## N/A 边界

V0.1 全局 Acceptance Scenarios A–I 中的 Capture、Browse Ask、Promote、Idea→Requirement、Existing Project Takeover、Build、Verify、Generic MCP Connector 属于后续冻结 Phase；Phase 01 spec 明确禁止提前实现，故本报告不把它们伪报为 PASS。Phase 01 仅报告 Core Vertical Slice 的真实工程闭环。

Phase 01 不创建 Browse WebContents；因此没有把“一个不存在的 Browse runtime”做成测试替身。实际验证的是 application WebContents 的 exact-origin/main-frame boundary、subframe bridge denial、remote navigation denial，以及生产 Renderer 无 Node 能力。

## 非阻塞输出

Node test runner 对未声明 package module type 的 `.ts` 测试打印 `MODULE_TYPELESS_PACKAGE_JSON` warning；测试、typecheck、packaging 均为 PASS。没有为消除非功能性 warning 改变 Forge package module semantics。

## 人工 Gate

自动化证据不能替代人工体验裁决。请按 `HUMAN_ACCEPTANCE_CHECKLIST.md` 使用 Portable ZIP 验收；确认前阶段状态必须保持 `WAITING HUMAN ACCEPTANCE`，不得报告 `Phase Complete`。
