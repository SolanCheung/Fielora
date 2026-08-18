# Phase 04 Implementation Report

日期：2026-08-17

状态：`SLICES 01-05 IMPLEMENTED / ENGINEERING GATE PASS / PHASE EXIT ACCEPTANCE PENDING`

## Outcome

Phase 04 的五个纵向 Slice 已连续实现。产品现在具备可关闭的全局 Summon、provider-neutral 流式调用、显式 Context Package、Browse Quick Capture、Capture Inbox/Attach/Promote、Windows Credential Manager 凭据边界，以及跨重启的 Fielora-owned identity/provenance/Resume。

## Slice results

| Slice | 实现结果 |
|---|---|
| 01 Provider / Credential / Streaming | `fielora-model` direct HTTP adapters；OpenAI Responses、Anthropic Messages、OpenAI-compatible；bounded SSE、usage/tool/error normalization；cancel；WinCred；Core async writer/runtime |
| 02 Field Summon / Context | Now/Browse/Field 同一 overlay；Context chips 可删除；USER_NOTE 可添加/编辑；SENSITIVE 与 custom endpoint 逐次确认；Core 重读 Field/Focus/Capture |
| 03 Browse Ask / Boundary | Main 从 active main frame 按 navigation generation 重取 page/selection；超限显式不附加；remote WebContents 仍无 app bridge |
| 04 Capture / Inbox / Attach | exact Migration 0004、schema 4；Capture immutable content/provenance；Inbox、archive/restore、Attach；事务内 Field revision + Activity |
| 05 Promote / Swap / Resume | explicit `IDEA_CANDIDATE` Promote；Provider provenance 保留；重启恢复；dev/packaged/portable 交付 |

## Security implementation

- Credential DB 只保存 `Fielora/provider/<uuid>` opaque target；secret 仅走 trusted one-shot write 并由 owned byte buffer Drop zeroize。
- custom endpoint 只允许 HTTPS DNS hostname；拒绝 userinfo、fragment、IP literal、localhost/`.local`、private/loopback/link-local/multicast/reserved/documentation/benchmark 地址、mixed DNS、redirect 与 proxy inheritance。
- Context 最多 8 chips；单 chip 4,000 scalar/16 KiB；总计 12,000 scalar/48 KiB；输入 8,000 scalar/32 KiB；Capture 16,000 scalar/64 KiB。
- credential-like outbound text fail-closed 为 `CONTEXT_BLOCKED`，错误不回显被阻断内容。
- Provider stream 没有真实 terminal marker时不会误报 COMPLETED；任何 terminal 之后没有 delta。

## Current state

```text
PHASE_04_IMPLEMENTATION: EXECUTED
PHASE_04_ENGINEERING_GATE: PASS
PHASE_04_REAL_PROVIDER_ACCEPTANCE: PENDING_NO_ELIGIBLE_AUTOMATION_CREDENTIALS
PHASE_04_HUMAN_EXPERIENCE_GATE: PENDING
PHASE_04_FINAL_ACCEPTANCE: NOT_YET
PHASE_04: NOT_COMPLETE
```

Fixture 和 local protocol proof 只证明 Engineering。真实 Provider 与用户体验仍须按独立清单裁决。

## Human Experience Remediation Addendum — 2026-08-17

Human Gate 发现的 HX-01–HX-07 已通过 fixed React UX 修复：Summon 聚焦 Ask；Context 默认折叠；Sensitivity 改为异常驱动；Provider 退出高频主体验；Inbox 独立并使用 bounded preview；用户动作改为自然语言；Quick Capture 保持不打断 Browse。底层 Provider、Credential、ModelInvocation、Context、Capture、Reality、Permission、Migration 0004 semantics 均未改变。

```text
DXE_DESIGN_PRINCIPLES: PARTIALLY_APPLIED
DXE_SURFACE_RUNTIME: NOT_IMPLEMENTED
```

Phase 04 remediation E2E 在 dev、packaged、fresh extracted portable 均 PASS。完整 `pnpm verify:phase04` 的 fresh rerun 当前被 Windows Clipboard `Access denied` 阻断在 Phase 03 原生 Ctrl+C/Ctrl+V 断言；未跳过或放宽。详见 `HUMAN_EXPERIENCE_REMEDIATION_REPORT.md` 与 `TEST_REPORT.md`。
