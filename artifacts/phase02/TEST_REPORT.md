# Phase 02 Test Report

状态：`POST_CORRECTION_FULL_GATE_PASS / HUMAN_EXPERIENCE_PASS / PHASE_02_COMPLETE`

验证命令：`pnpm verify:phase02`

完整运行：2026-08-14 17:22:55–17:25:48 +08:00

退出码：`0`

最终标记：`PHASE02_ENGINEERING_GATE=PASS`

## Gate Matrix

| Gate | 真实命令/链路 | 结果 |
|---|---|---|
| Generated contracts | `pnpm contracts:check` | PASS |
| TypeScript static | typecheck + ESLint | PASS |
| Rust static | rustfmt check + clippy `-D warnings` | PASS |
| TypeScript unit | Electron bridge / renderer validators，12 tests | PASS |
| Rust unit | contracts/core/field/platform/storage，19 tests | PASS |
| Rust release | `fielora-core` release build | PASS |
| Integration | 真实 debug core FIPC process，4 tests | PASS |
| Desktop E2E | Forge dev renderer + real Rust core + SQLite | PASS |
| Package | Electron Forge Windows x64 package | PASS |
| Packaged Smoke | packaged `Fielora.exe` + real Rust core + SQLite | PASS |
| Portable | Phase 02 Windows x64 ZIP | PASS |
| Portable Smoke | 解压到新临时目录后运行真实 executable | PASS |

机器日志：`artifacts/phase02/FULL_GATE.log`，SHA-256 `19adad603d68616bc5ee2ef38103ab9266378463889818bebcd806008faab5c2`。

## 覆盖的 Phase 02 行为

- schema 1→2 migration、幂等重开、registry checksum/name 与 incompatible legacy rollback；
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
- dev、packaged、portable restart/resume；
- legacy Resume correction 与默认 UI internal terminology denial。

## Desktop Evidence

Packaged 与 Portable 均完成 17 项 acceptance checks，最终 `schema_version = 2`、`field_revision = 15`：

- `artifacts/phase02/PHASE_02_PACKAGED_ACCEPTANCE.json`，SHA-256 `a506b02bd9bda2ef93c0c3b0e5233988d5ea74684f0277ad014c3ed112769742`
- `artifacts/phase02/PHASE_02_PORTABLE_ACCEPTANCE.json`，SHA-256 `f656e3c024e3ba336fa9ff6b55257ee39858e6b969207cc6596ffb4457973405`
- `artifacts/phase02/packaged-phase02-resume.png`
- `artifacts/phase02/packaged-phase02-legacy-resume.png`
- `artifacts/phase02/portable-phase02-resume.png`
- `artifacts/phase02/portable-phase02-legacy-resume.png`

四张 post-correction 成品截图已人工检查：当前 Reality 正常显示；legacy focus 表达为“上次关注”；未发现 `REV`、`STALE`、`LEGACY_PHASE01_FALLBACK`、pane primitive 或 raw wire enum 泄露。

## Artifact

`artifacts/phase02/Fielora-V0.1-Phase02-win-x64.zip`

- bytes：`145998148`
- SHA-256：`24bf2bae54cf029ae748da0f8f7f6f6fb8c73a0e7049ebe76744017055d02a93`
- packaged source：`ccd849c3b4c52662cd89fab023a00db857e88e21`

该 artifact 包含 UI correction，并已通过 fresh-directory Portable Smoke；同源 packaged app 也通过 Packaged Smoke。

## Final Acceptance

Human Experience Gate：`PASS`。Phase 02 Final Acceptance：`GRANTED`。用户已在真实体验与本报告所列 post-correction product artifact Evidence 基础上裁决 `PHASE_02: COMPLETE`。
