# Phase 04 Test Report

日期：2026-08-17

正式命令：`pnpm verify:phase04`

## Status

```text
PHASE_04_ENGINEERING_GATE: PASS (existing implementation baseline)
PHASE_04_REMEDIATION_ENGINEERING_REVALIDATION: PENDING_ONE_ENVIRONMENT_CHECK
```

不能把本轮完整 Gate 写成 PASS：fresh run 在 Phase 03 的 Chromium 原生 Ctrl+C/Ctrl+V 断言处停止。Windows 当前对自动化进程的 `OpenClipboard` 返回 `Access denied`，且 `GetOpenClipboardWindow` 没有报告占用窗口。测试保留硬失败，没有删除、跳过或放宽该断言。

## Results

| Gate | 结果 |
|---|---|
| Context manifest / generated contracts | PASS（报告更新后再次审计） |
| TypeScript typecheck / ESLint / Rust fmt | PASS |
| TypeScript unit | 28/28 PASS |
| Rust unit | 29/29 PASS |
| Rust clippy `-D warnings` / release build | PASS |
| Core integration | 5/5 PASS |
| Phase 02 Desktop regression — dev / packaged / portable | PASS / PASS / PASS |
| Phase 03 Browse regression — remediation fresh run | BLOCKED_ENVIRONMENT at native clipboard; assertion preserved |
| Phase 04 Desktop E2E — dev / packaged / portable | PASS / PASS / PASS |
| Package / new Portable build | PASS / PASS |
| Phase 04 UX assertions per host | 20/20 PASS |
| Real Provider external requests | `0` |
| Real Provider Acceptance | PENDING |

## New UX coverage

Phase 04 E2E 固化：

1. 没有 Ask / Inbox / Providers 三等权 Tab；
2. Provider Setup 不在正常 Ask 首屏；
3. Context 默认折叠且可展开；
4. 敏感确认只在命中确定性规则时出现；
5. Inbox 可独立访问；
6. 长 Capture 默认只显示 bounded preview；
7. 用户界面不出现 `IDEA_CANDIDATE`；
8. Quick Capture 保持 Browse Page 与 surface；
9. Summon 关闭后恢复原焦点；
10. 无 Provider 时显示可理解的 degraded/setup state。

每个 Phase 04 宿主还继续证明 fixture complete/cancel/failed、Context Core reread、Credential/WinCred、Capture/Attach/Promote/Resume、Provider identity independence、secret/unsaved-prompt file scan 与 0 external request。

## Preliminary failures retained

- Browse resize 初版在紧凑导航 breakpoint 后只提交了第一次 native bounds；修复为 resize 当下同步并在 50ms 后收敛复核，随后通过 viewport/native bounds/DPR checkpoint。
- Forge wrapper 在慢速 Windows cleanup 时超过原退出窗口；超时仅扩展 wrapper cleanup budget，不移除产品断言。
- Windows 原生剪贴板曾间歇通过，最终正式 fresh run 进入持续 `Access denied`。三次重试仍硬失败；未修改 permission policy，也未用 DOM clipboard mock 代替 Chromium 原生行为。

## Leakage boundary

Phase 04 E2E 使用随机 credential 与 unsaved-prompt canary 并扫描临时 LocalAppData。最终 artifact/repo 扫描必须保持 credential pattern、Bearer token、Authorization value、credential canary、prompt/response canary 和 probe body marker 为 0；WinCred Fielora test target 必须为 0。

## Required closure

在 Windows Clipboard 可访问的会话重新执行 `pnpm verify:phase04`，或先按 `HUMAN_ACCEPTANCE_CHECKLIST.md` 完成真实 Ctrl+C/Ctrl+V 人工复验。只有完整 Gate 重跑成功，才可把 remediation engineering 状态提升为 `PASS / REVALIDATED`。

