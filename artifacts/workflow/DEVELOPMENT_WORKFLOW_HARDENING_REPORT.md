# Development Workflow Hardening Report

状态：`COMPLETE / VERIFIED`

日期：2026-08-14

基线：`main@e757d050b97a3f0dd3b6812bccefc1e433571c8f`

分支：`codex/development-workflow-hardening`

## Scope

本次只修改开发验证入口、E2E Evidence 隔离与项目事实文档。没有新增依赖，没有修改 Phase 02 产品语义或三份 Frozen specs，没有生成新的 packaged/portable artifact，也没有定义或开始 Phase 03。

## Implemented

- `pnpm audit:context`：只读校验 manifest JSON、文件存在性、bytes、SHA-256、required reading entry 与重复项；
- `pnpm verify:dev:docs`：Context/manifest Lane；
- `pnpm verify:dev:ui`：TypeScript typecheck、lint、unit Lane；
- `pnpm verify:dev:core`：Rust fmt、unit、Clippy Lane；
- `pnpm verify:dev:cross`：Contracts + UI + Core + real FIPC Integration；
- `pnpm verify:premerge`：Cross + real Desktop E2E；
- PreMerge E2E 截图写入经校验的系统临时目录并在完成后清理，避免覆盖正式 Phase Evidence；
- PreMerge-only cold Forge target wait 为 120 秒；正式 Phase Gate 保持自身配置和 Evidence 路径。

## Validation

`pnpm verify:dev:docs`：PASS，约 1.2 秒。

最终 `pnpm verify:premerge`：PASS，约 73.1 秒：

| Gate | Result |
|---|---|
| Context manifest | 39/39 files、32/32 required PASS |
| Generated contracts | PASS / zero drift |
| TypeScript typecheck / lint | PASS |
| TypeScript unit | 12/12 PASS |
| Rust fmt | PASS |
| Rust unit | 19/19 PASS |
| Rust Clippy | PASS |
| Real FIPC Integration | 4/4 PASS |
| Real Desktop E2E | PASS |
| Formal Phase 02 Evidence diff | 0 |
| Residual E2E temp directory/process | NONE |

报告与 Required Reading 固化后再次运行最终 PreMerge；manifest 39/39 files、32/32 required reading 全匹配。

验证期间识别并关闭两项 harness 问题：当前 PowerShell/.NET 不支持 `Directory.CreateTempSubdirectory`，已改为 GUID 临时目录并校验删除边界；一次冷 Forge 启动超过旧 60 秒 target wait，PreMerge-only wait 调整为 120 秒后真实 E2E 在约 41.2 秒完成。两者均发生在产品断言前，不是产品 failure。

已知的 `ts-rs deny_unknown_fields` 与 Node module-type warning 仍为非阻塞既知 warning；本次不借 Hardening 扩大依赖或修改产品配置。

## Boundary after completion

```text
DEVELOPMENT_WORKFLOW_HARDENING: COMPLETE
PHASE_02: COMPLETE
PHASE_03: NOT_AUTHORIZED
```

下一步必须等待用户单独定义并授权 Phase 03。
