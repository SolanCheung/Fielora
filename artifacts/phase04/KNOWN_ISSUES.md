# Phase 04 Known Issues

日期：2026-08-17

## Acceptance debt

- `PHASE_04_HUMAN_EXPERIENCE_GATE: PENDING_RETEST`：新 Summon、Context、Provider Setup、Inbox、Quick Capture 与整体视觉需要用户重新裁决。
- `PHASE_04_REAL_PROVIDER_ACCEPTANCE: PENDING`：当前没有符合自动化/API 测试条款的两种 eligible Provider credential；受限 Coding Plan 凭据未使用。
- `PHASE_04_REMEDIATION_ENGINEERING_REVALIDATION: PENDING_ONE_ENVIRONMENT_CHECK`：Windows 当前对自动化进程 `OpenClipboard` 返回 `Access denied`，fresh Phase 03 原生 Ctrl+C/Ctrl+V 回归硬失败。测试未跳过；需在 Clipboard 可访问会话重跑完整 Gate，或先完成人工 Ctrl+C/Ctrl+V 复验。

## Expected boundary

- `DXE_SURFACE_RUNTIME: NOT_IMPLEMENTED` 是本轮明确边界，不是遗漏。本轮只应用 fixed React components、deterministic local state、progressive disclosure 与 bounded setup/degraded surfaces。
- `provider_external_requests=0`；fixture PASS 不能冒充 real-provider PASS。

## Non-blocking engineering notes

- `ts-rs` 仍会提示无法解析 serde `deny_unknown_fields`；生成 TypeScript exactness、Main validator 与 Core serde reject 均有独立测试。
- Phase 04 fresh portable 测试目录的绝大多数文件已删除；当前 Codex desktop 进程仍持有 `resources/app.asar` 的读句柄，因此 `.tmp-phase04-remediation-portable` 暂留一个约 370 KB 文件。任务会话释放句柄后可删除；它不在交付 ZIP 内，也不是产品运行数据。
- `artifacts/phase04/Fielora.exe` 是已被 Desktop Foundation 替代的历史包。其旧单实例 `second-instance` 回调只检查 BrowserWindow 引用非空，在窗口已销毁但退出尚未完成时再次启动会触发 `Object has been destroyed`。该历史 Artifact 不被覆盖或删除；当前 Desktop Foundation 已修复并通过 packaged single-instance lifecycle E2E。人工复验当前包前需先退出仍在运行的旧 Phase 04 进程。

没有发现新的 Contract、Migration 0004、Credential、Provider identity、Reality 或 Permission architecture blocker。
