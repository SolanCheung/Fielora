# Fielora Development Workflow V0.1

状态：`ACTIVE / VERIFIED`

生效基线：`main@e757d050b97a3f0dd3b6812bccefc1e433571c8f`

## 1. 目标

这套工作流解决两个现实问题：普通迭代不应反复打包解压，跨边界修改也不能只凭“页面能打开”进入 main。它只收紧开发与验证节奏，不改变产品范围、Frozen semantics 或 Phase Gate。

## 2. 长期运行开发模式

日常开发与人工体验继续长期运行：

```powershell
pnpm dev
```

普通 UI/Core 迭代不生成 packaged/portable。需要重启 Electron 或 Rust Core 时按受影响边界处理，不把“每改一次就正式打包”作为默认循环。

## 3. 分层 Gate

| Lane | 命令 | 适用范围 | 覆盖 |
|---|---|---|---|
| Docs | `pnpm verify:dev:docs` | context、decision、report、manifest only | manifest 文件、bytes、SHA-256、required reading |
| UI | `pnpm verify:dev:ui` | renderer、view state、CSS、纯 UI validation | typecheck、lint、TS unit |
| Core | `pnpm verify:dev:core` | Rust domain/runtime/storage/platform only | rustfmt、Rust unit、Clippy |
| Cross | `pnpm verify:dev:cross` | Contract、preload/Main bridge、Core↔UI、schema/persistence | Docs audit、contracts、UI、Core、real FIPC integration |
| PreMerge | `pnpm verify:premerge` | 任何准备进入 main 的变更 | Cross 全部 + real Desktop E2E |

所有 Lane 都在首个失败处停止，并输出稳定的 `GATE_START` / `GATE_PASS` / `DEVELOPMENT_GATE` 标记。日常 Gate 不覆盖正式 Evidence 日志，避免把临时验证伪装成阶段验收。

PreMerge Desktop E2E 将截图隔离到系统临时目录并在完成后清理；同时给冷 Forge 启动最多 120 秒 target wait。正式 Phase Gate 不设置这些开发变量，仍按冻结流程写入阶段 Evidence并使用自身 Gate 配置。

## 4. 风险升级规则

- 纯文档/manifest：Docs；进入 main 前仍跑 PreMerge，除非用户对纯历史/拼写修订另有明确裁决。
- renderer-only：开发中跑 UI；涉及 Resume、Surface、security-visible presentation 时追加 real Desktop E2E。
- Rust-only：开发中跑 Core；影响 persistence、resume、events、supervision 时升级到 Cross。
- Contract、generated DTO、Main/preload、FIPC、Migration/schema：直接跑 Cross。
- Electron/Forge config、entry、ASAR/resource、sidecar path、production origin/protocol、userData、runtime/权限/签名：除 PreMerge 外，必须追加 targeted packaged smoke。
- 正式阶段 Gate：仍运行该阶段冻结的完整 verify 命令，包含 Release、Package、Packaged Smoke、Portable、Portable Smoke 与 Human Experience；PreMerge 不能替代它。

如一个变更跨越多个类别，选择最高风险 Lane，不拆分成多个低风险 PASS 来规避更高 Gate。

## 5. main 准入

进入 main 前必须满足：

1. 变更范围与授权一致；
2. 对应开发 Lane 已通过；
3. `pnpm verify:premerge` 通过；
4. packaging-sensitive 变更已有 targeted packaged smoke；
5. manifest/required reading 同步；
6. Frozen spec 冲突为 0，或已停止并上报；
7. worktree 无未解释修改。

## 6. 不在本次 Hardening 中做

- 不增加依赖、Git hook manager、远程 CI 服务或新的发布平台；
- 不自动根据路径跳过 Gate；Lane 由责任人按风险显式选择；
- 不修改 Phase 02 产品实现或重新打开 Phase 02；
- 不定义、不授权、不开始 Phase 03。

需要更深的 CI、并行测试、缓存、flaky-test quarantine 或 Evidence automation 时，必须作为后续独立基础设施任务评审，不能在产品 Phase 中隐式扩张。
