# Phase 04 Freeze Package Review Report

状态：`VALIDATION PASS WITH PROVIDER ACCEPTANCE DEFERRED / FREEZE GRANTED / IMPLEMENTATION AUTHORIZED`

日期：2026-08-16

## 1. Review scope

本轮审查覆盖 Product、Contract、Migration、Implementation、Test 五份 Candidate，并与 Remap、Capability Definition、Frozen Phase 01/02 Contract/Schema、Phase 03 Browse closeout、Development Workflow 交叉核对。没有修改产品代码、依赖、lockfile、migration registry 或 schema version。

## 2. Required decisions coverage

| Capability Candidate 开放项 | Package resolution | Review |
|---|---|---|
| Remap 是否接受 | 用户裁决 `PHASE_04_ALPHA_REMAP_CANDIDATE: ACCEPTED`，不是 Final Freeze | ACCEPTED |
| 两个 Provider family | OpenAI Responses + Anthropic Messages；具体营销 model id 不冻结 | ACCEPTED |
| ProviderConfig persistence/delete | `provider_configs` + opaque credential_ref；delete-secret-first + REMOVED tombstone/reconcile | PASS |
| Windows vault | Win32 Credential Manager / CRED_TYPE_GENERIC / LOCAL_MACHINE；2048 是 Fielora 上限，WinCred 为 2560 | ACCEPTED / PROBE PASS |
| Endpoint/SSRF/redirect | official endpoint fixed；custom HTTPS DNS host、public addresses only、rebind-safe、redirect deny | FIXTURE PROBE PASS |
| Context exactness | 6 chip kinds、8/4k/12k limits、revision/generation、sensitivity/completeness | PASS |
| Capture exactness | two-table Migration 0004、5 kinds、placement/lifecycle、IDEA_CANDIDATE、FIPC/Activity | PASS |
| Retention | local non-retention 与 provider retention 分离；OpenAI `store:false`；不得宣称 Provider 不保留 | AMENDED / COMPLETE |
| external send/cost | target/model/context disclosure；first-use cost warning；post-response usage，no price promise | PASS |
| IDR | ASK/CAPTURE/PROMOTE/CONTINUE；freeform ASK；no automatic mutation at any confidence | PASS |
| Phase 03 Installer debt | 历史例外已接受；记录当时无 Evidence，不回溯伪造；下一次 Phase 08 | ACCEPTED |
| verify/evidence/Human | `pnpm verify:phase04` + dev/packaged/portable + Phase02/03 regression + artifacts layout | PASS |

## 3. Cross-contract findings

### Resolved

1. Capability Candidate 的“secret 不进入 FIPC payload”与当前 Renderer→Main→Rust ownership 不可同时成立。Package 将其窄化为一次性 trusted credential ingress；secret 仍不进入 ordinary state/query/event/log/artifact。该变更是显式 Contract correction，不是弱化 vault boundary。
2. `IDEA_CANDIDATE` 保持为 Capture role，不扩展 `FieldStateKind`，避免 Phase 04 提前进入 Phase 05 Project Reality/Requirement。
3. Page 继续是 ephemeral Browse identity；selection 带 page id + navigation generation，但不进入 durable Browser schema。
4. Migration 使用 0004，明确 0003 是 Phase 03 无 durable schema 的永久空号；不会回填或误报损坏。
5. Provider removal 使用 tombstone，避免删除 config 后破坏既有 MODEL_RESPONSE Capture provenance。
6. streaming/cancel 要求 Core 从同步 blocking loop 变为 worker + single writer，但不改变 FIPC/1 framing 或 trusted origin。

### User decisions received

1. `TRUSTED_CREDENTIAL_FIPC_EXCEPTION: ACCEPTED`；
2. `PHASE_03_INSTALLER_HISTORICAL_EXCEPTION: ACCEPTED`；
3. `OPENAI_RESPONSES + ANTHROPIC_MESSAGES: ACCEPTED`；
4. `PHASE_04_BOUNDED_REAL_CREDENTIAL_PROBES: AUTHORIZED`，仅 synthetic input、固定预算、无 retry、不构成实现授权。

### Provider-retention amendment

用户指出 local non-retention 不能推出 remote non-retention，Cross-review 确认是 blocker-level wording gap。Product、Contract、Implementation 与 Test 已补入：

- Fielora 默认不本地持久化 full prompt/response；
- Provider handling 取决于 Provider/account policy；
- OpenAI Responses 强制 `store:false`，但不声称 ZDR 或无 abuse-monitoring retention；
- Anthropic 不伪造 retention flag；
- 首次配置/发送显示 external-send + Provider policy disclosure；
- UI 禁止把“Not saved by Fielora”表述为“Not retained by Provider”。

## 4. Bounded validation completed

- Candidate SQL frozen-normalized bytes：5,740；
- SHA-256：`4d142745b3e9a5ccd8c27f422ecdc888163a575a91b0515f90a1ee6aa0f869ab`；
- Candidate runner probe 对真实 0001 + 0002 + Candidate 0004 验证 fresh、2→4、idempotence、checksum tamper、failed rollback、FK、query plan 与 intentional `(1,2,4)` gap：PASS；
- WinCred `CRED_TYPE_GENERIC / CRED_PERSIST_LOCAL_MACHINE` create/read、replace/read 2048 bytes、delete/unreadable：PASS；测试 credential 已删除；
- OpenAI/Anthropic fragmented SSE normalization、tool-proposal-only、unknown/malformed/oversize/error mapping fixtures：PASS；
- custom endpoint HTTPS/DNS/IP/mixed DNS/rebinding/redirect policy fixture：PASS；
- Context/Capture bounds、transition、immutable provenance、Field revision 与 IDR mutation confirmation fixture：PASS；
- 产品 runner、schema version 与产品 DB 均未修改。

真实 Provider probe 因本机未提供四个专用 test credential/model 环境变量而 fail-closed 为 SKIP，external requests 为 0。用户随后通过 `PHASE_04_PROVIDER_GATE_AMENDMENT_V0.1.md` 将其从 Freeze blocker 改为 implemented-adapter Phase Exit Acceptance debt；完整历史证据见 `artifacts/phase04/freeze/PHASE_04_FREEZE_PROBE_REPORT.md`。

用户已确认当前没有新的 architecture blocker。剩余 probe 不再承担 Provider 研究任务，也不得扩展到 tools、conversation continuity、reasoning API、structured output、prompt caching、batch、computer use 或其他 provider-specific advanced feature。Cross-review 只接受以下证明链：provider-specific wire protocol → Fielora normalization → same stable invocation semantics；complete/cancel/failed 三条事件序列必须完全一致，并同时取得 prompt/response/credential/header/log 五类泄露计数为 0。

## 5. Primary-source review basis

- OpenAI Responses API create/stream contract：<https://developers.openai.com/api/reference/typescript/resources/responses/methods/create>
- OpenAI API data controls / Responses retention：<https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint>
- Anthropic Messages API：<https://platform.claude.com/docs/en/api/messages>
- Anthropic streaming events：<https://platform.claude.com/docs/en/build-with-claude/streaming>
- Anthropic commercial/API retention：<https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data>
- Microsoft Win32 Credential Manager `CredWriteW` / `CredReadW` / `CredDeleteW`：<https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew>、<https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credreadw>、<https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-creddeletew>
- Microsoft `CREDENTIALW` bounds/persistence：<https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw>
- Electron `safeStorage` 与 `webContents`：<https://www.electronjs.org/docs/latest/api/safe-storage>、<https://www.electronjs.org/docs/latest/api/web-contents/>

这些来源只支持 adapter/security 可实施性审查，不替代仓库内 Frozen Product/Domain Contract，也不授权网络调用或 credential 写入。

## 6. Current verdict

```text
STRATEGIC_REMAP: NO_FURTHER_REMAP_REQUIRED
FREEZE_PACKAGE_AUTHORING: COMPLETE
USER_REVIEW: ACCEPTED_FOR_FINAL_PROBES_AND_AMENDMENT
PROVIDER_RETENTION_SEMANTICS: AMENDED
MIGRATION_WINCRED_FIXTURE_PROBES: PASS
REAL_PROVIDER_PRE_FREEZE_PROBE: DEFERRED_TO_IMPLEMENTATION_ACCEPTANCE
FREEZE_PACKAGE_VALIDATION: PASS_WITH_PROVIDER_ACCEPTANCE_DEFERRED

PHASE_04_FREEZE: GRANTED
PHASE_04_IMPLEMENTATION: AUTHORIZED
PRODUCT_CODE_CHANGED: NO
DEPENDENCIES_CHANGED: NO
SCHEMA_VERSION_CHANGED: NO
```
