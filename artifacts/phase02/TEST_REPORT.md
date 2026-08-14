# Phase 02 Test Report

状态：`ENGINEERING_GATE_PASS / DESKTOP_REALITY_GATE_PASS`

验证命令：`pnpm verify:phase02`

完整运行：2026-08-14 15:51:56–15:55:37 +08:00

退出码：`0`

最终标记：`PHASE02_ENGINEERING_GATE=PASS`

## Gate Matrix

| Gate | 真实命令/链路 | 结果 |
|---|---|---|
| Generated contracts | `pnpm contracts:check` | PASS |
| TypeScript static | typecheck + ESLint | PASS |
| Rust static | rustfmt check + clippy `-D warnings` | PASS |
| TypeScript unit | Electron bridge validators，9 tests | PASS |
| Rust unit | contracts/core/field/platform/storage，19 tests | PASS |
| Rust release | `fielora-core` release build | PASS |
| Integration | 真实 debug core FIPC process，4 tests | PASS |
| Desktop E2E | Forge dev renderer + real Rust core + SQLite | PASS |
| Package | Electron Forge Windows x64 package | PASS |
| Packaged Smoke | packaged `Fielora.exe` + real Rust core + SQLite | PASS |
| Portable | Phase 02 Windows x64 ZIP | PASS |
| Portable Smoke | 解压到新临时目录后运行真实 executable | PASS |

## 覆盖的 Phase 02 行为

- schema 1→2 migration、重复打开幂等、registry checksum/name、incompatible legacy rollback；
- State 全生命周期、同 kind supersede、失败操作无部分 mutation；
- REFERENCE URL canonicalization、archive/restore、无隐式 relation/focus 恢复；
- bounded relation matrix、typed endpoint self-edge；
- typed mode/focus 与 Field aggregate revision；
- fixed SurfaceLayoutV1、空 TaskPane、latest 10 snapshot 上限；
- deterministic Resume、current/stale/invalid snapshot、unavailable reference；
- 56 条 Activity 的 keyset pagination 无遗漏、无重复；
- post-commit event、core crash 后由 Electron Main 重启；
- precise trusted origin、subframe bridge denial、external navigation denial、renderer 无 Node/require；
- inert REFERENCE 没有向 `example.com` 发起资源请求；
- dev、packaged、portable restart/resume。

## Desktop Evidence

三种真实运行形态均完成 15 项 acceptance checks，最终 `schema_version = 2`、`field_revision = 15`：

- `artifacts/phase02/PHASE_02_PACKAGED_ACCEPTANCE.json`
- `artifacts/phase02/PHASE_02_PORTABLE_ACCEPTANCE.json`
- `artifacts/phase02/dev-phase02-resume.png`
- `artifacts/phase02/packaged-phase02-resume.png`
- `artifacts/phase02/portable-phase02-resume.png`

截图显示恢复后的 Field、VERIFY mode、stale snapshot 回退、TaskPane 主工作面、ReferencePane 辅助面与默认关闭的 Context Inspector。

## Artifact

`artifacts/phase02/Fielora-V0.1-Phase02-win-x64.zip`

- bytes：`145997587`
- SHA-256：`f765df94c011139a43d6587225cbcd5fcf048b5f1fd97605f8b9858b34a81397`

## 尚未通过的 Gate

Human Experience Acceptance：`PENDING_USER`。此报告只证明 Engineering 与 Desktop Reality，不构成 Phase 02 Final Acceptance。
