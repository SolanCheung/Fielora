# Fielora V0.1 Phase 04 Test and Delivery Plan Candidate

状态：`FROZEN / REAL PROVIDER ACCEPTANCE AT PHASE EXIT / IMPLEMENTATION AUTHORIZED`

版本：V0.1 Frozen

日期：2026-08-16

## 1. Gate principle

`Action completed != Result verified`。Phase 04 沿用 Static → Unit → Rust Clippy/Release → Integration → Desktop E2E → Package → Packaged Smoke → Portable Smoke → Human Experience；Development Lane 不替代正式 Phase Gate。

## 2. Static and contract gates

- context manifest、links、status vocabulary、Frozen spec drift；
- TS/Rust typecheck/lint/format；
- FIPC unknown-field reject、size bounds、exact terminal-event cardinality；
- Provider fixtures 对 OpenAI/Anthropic 不同事件形状归一化为同一 contract；
- tool request 只形成 `TOOL_PROPOSAL`，任何 fixture 都不能触发 tool/Connector execution；
- Renderer/Preload/Main/Core capability surface audit，remote WebContents bridge absence。

## 3. Domain and persistence gates

- Capture kind/placement/lifecycle transition matrix；immutable content/provenance；archive/restore；
- create/attach/promote 的 Activity、Field revision、event post-commit 原子性；
- Browse ASK 前后 Field list/Field/Resume/State/Object/Relation/Activity diff；
- Migration fresh 1→2→4、real version 2→4、idempotence、checksum tamper、failed rollback、FK/index/query plan；
- registry 明确 `(1,2,4)`，任何后加 0003 或误报 missing migration 都失败；
- Provider tombstone、missing credential reconciliation、Capture provenance FK；
- Phase 02 schema and behavior fixtures 全量回归。

## 4. Provider and stream gates

确定性 local fixtures 覆盖：delta fragmentation、multi-byte UTF-8、usage、unknown event、tool proposal、malformed SSE/JSON、1 MiB event/8 MiB response bound、429、401、5xx、timeout、disconnect、cancel race、terminal duplicate、writer backpressure、parent EOF。

真实网络 Gate 位于产品实现后的 Phase Exit Acceptance，使用至少两个实际允许自动 API 调用的 Provider/协议实现验证：real authentication、首 token、completed text normalization、usage（若提供）、client cancel、terminal/error semantics。输入使用固定 synthetic text 或明确人工测试内容；Evidence 不保存 prompt/response body，不得发送 repo、Field Reality 或真实用户数据。

Cross-review 不得把“两家都返回字符串”视为 PASS。Real probe 必须记录两家的 provider-specific wire event type 集合，并强断言它们归一化到同一 `ModelInvocation` 语义：complete 为 `STARTED → OUTPUT_TEXT_DELTA → USAGE → COMPLETED`，client cancel 为 `STARTED → OUTPUT_TEXT_DELTA → CANCELLED`，invalid-auth 为 `STARTED → FAILED` 且稳定映射 `CREDENTIAL_REJECTED`。Evidence 必须同时证明 `promptBodies=0`、`responseBodies=0`、`credentialBytes=0`、`authorizationHeaders=0`、`secretLogBytes=0`。

固定网络预算：每家最多 2 次可能计费请求（一次 complete、一次 cancel）+ 1 次 invalid-auth request；单次 output 上限 32 tokens；无自动或人工循环 retry；不得故意耗尽 quota、制造 rate limit 或长 timeout。`RATE_LIMITED`/`QUOTA_EXHAUSTED`/`TIMEOUT` 主要由 deterministic fixture/local controlled server 证明，真实 Gate 只映射自然出现的代表性错误。

OpenAI request fixture 与 outbound inspection 必须证明 `store:false` 永远存在且 `store:true` 被拒绝；还要证明未调用 Conversations、previous-response continuity 或 background mode。UI copy 必须区分 local non-retention 与 Provider policy，且首配置/首发送显示固定 external-send disclosure。

任何 bytes 已发出后的 transient failure 不自动 retry；测试必须证明没有重复 delta 或重复 Reality mutation。

## 5. Credential gates

- 专用 UUID target 的 Win32 store/read/replace/delete bounded integration；测试 finally 强制删除；
- secret 长度 0/2048/2049、Unicode/bytes、missing target、access failure；
- DB、logs、stdout/stderr、FIPC response/event、Renderer snapshot、crash/error、artifacts 全树 secret canary scan；
- UI 无 reveal/echo；Model/Agent contract 无 read-secret command；
- delete-secret-first 后 DB failure 的 safe degraded reconciliation。

## 6. Endpoint security gates

拒绝 HTTP、userinfo、fragment、IP literal、localhost、`.local` resolved private、IPv4/IPv6 loopback/private/link-local/multicast/reserved/unspecified、mixed public+private DNS、DNS rebinding、redirect to private/file/fielora、invalid TLS、proxy bypass。允许项只包括测试控制的 public HTTPS hostname；正式用户自定义 endpoint 需 Human acknowledgement。

## 7. Context and Browse gates

- 8-chip、per-chip/aggregate/user-input 上限，Unicode scalar 与 UTF-8 bytes 双重验证；
- 超限不静默 truncation；SENSITIVE confirm；BLOCKED deny；secret patterns deterministic redact；
- selection 只来自 active main frame；page switch/navigation generation/close 后 stale reject；
- iframe selection、恶意 page text、HTML/script string 只作纯文本；
- remote Node/preload/app bridge 继续不存在；Phase 03 protocol/permission/session/context-menu/loading/favicon regressions 全部通过。

## 8. Desktop E2E and Human Gate

至少覆盖：

1. Field Summon → inspect chips → Ask → close，不改变 Reality；
2. Browse selection → Ask → Capture → Inbox；
3. Inbox attach → Field restart/Resume；
4. completed model output Promote → IDEA_CANDIDATE；
5. partial stream cancel → no MODEL_OUTPUT/no half Reality；
6. Provider A Capture → switch Provider B → identity/provenance/Resume unchanged；
7. credential rejection、rate limit、offline、custom endpoint deny 的稳定提示；
8. 0 Browse Page、multi Page、Now/Fields/Field 往返与窗口 resize。

正式命令冻结为 `pnpm verify:phase04`（只能在实现授权后新增脚本）。它必须在 dev、packaged、fresh-directory portable 三种宿主运行；packaged/portable 同时回归 Phase 02 Field Reality 与 Phase 03 Browse E2E。Phase 04 交付 Portable，不新增 Installer checkpoint。用户已裁决 Phase 03 Installer checkpoint 为历史例外：明确当时无该 Evidence、关闭 debt、禁止回溯伪造 PASS；下一次常规 Installer 仍为 Phase 08。

Human Gate 必须使用真实日常网站和两个真实、合规可调用的 Provider/协议实现；Fixture PASS 不替代体验裁决。OpenAI Responses 与 Anthropic Messages 是 reference adapters，不是必须购买的厂商组合。

Freeze probe source 与产品测试命令分离：前者位于 `scripts/freeze/phase04/`，只用于 Final Freeze 前的 bounded validation；它不进入产品 runtime，也不构成 `pnpm verify:phase04` 实现。

## 9. Exit evidence

```text
artifacts/phase04/CHANGE_IMPACT.md
artifacts/phase04/TEST_REPORT.md
artifacts/phase04/BUILD_INFO.json
artifacts/phase04/PORTABLE_SMOKE_REPORT.md
artifacts/phase04/HUMAN_ACCEPTANCE_CHECKLIST.md
artifacts/phase04/PHASE_04_FINAL_ACCEPTANCE_CANDIDATE.md
artifacts/phase04/KNOWN_ISSUES.md
```

最终 `PHASE_04: COMPLETE` 必须由用户裁决；自动 Gate、Freeze approval 或 Implementation complete 均不能替代。
