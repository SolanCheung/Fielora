# Phase 04 Freeze Probe Report

状态：`PARTIAL PASS / REAL PROVIDER PROBE WAITING FOR TEST CREDENTIALS / FINAL FREEZE CANDIDATE NOT READY`

日期：2026-08-16

## 1. Authorization and boundaries

用户已授权测试凭据 bounded probes，限制为 synthetic input、固定调用预算、无无限 retry、不故意耗尽 quota/rate limit，且不构成产品实现授权。非产品 probe source 位于 `scripts/freeze/phase04/`；本目录只保存脱敏 Evidence。没有修改 product source、dependency、lockfile、migration registry、schema version 或产品 DB。

## 2. Results

| Probe | Result | Evidence |
|---|---|---|
| Migration 0001→0002→0004 candidate runner | PASS | fresh、2→4、idempotence、intentional gap、checksum tamper、rollback、FK、query plan |
| Win32 Credential Manager | PASS | CRED_TYPE_GENERIC create/read、2048-byte replace/read、delete/unreadable；测试项已删除 |
| Provider normalization fixtures | PASS | 两种 SSE event family、text/usage/tool proposal、unknown/malformed/oversize/error mapping |
| Custom endpoint policy | PASS | HTTPS、DNS/IP deny、mixed DNS、per-connection resolution、rebinding、redirect deny |
| Context/Capture contract | PASS | chip bounds、blocked context、transition、immutable provenance、Field revision、IDR mutation confirmation |
| Real OpenAI + Anthropic | SKIP | 四个专用 test credential/model 环境变量未提供；0 external requests |

WinCred 第一次启动在 credential write 前因 Windows PowerShell 的 .NET 不支持静态 RNG API 停止，没有创建 credential；改用兼容实例 API 后完整 probe PASS。最终 cleanup 验证测试 target 已不可读，且未枚举任何已有 credential。

## 3. Migration evidence

Candidate SQL 归一化规则与现有 `frozen_migration_checksum` 对齐：CRLF→LF、移除末尾 LF。最终 hash：

```text
4d142745b3e9a5ccd8c27f422ecdc888163a575a91b0515f90a1ee6aa0f869ab
```

此前使用“末尾单一 LF”的 `5a5c...` hash 已由 Cross-review 纠正，不再是 canonical candidate hash。产品 runner 仍为 schema version 2，未写入 0004。

## 4. Provider-retention amendment evidence

Package 已区分：

```text
LOCAL_RETENTION      Fielora 默认不持久化 full prompt/response
PROVIDER_RETENTION   取决于 Provider/account policy
OPENAI_RESPONSES     store:false，不构成 ZDR 声明
USER_DISCLOSURE      Not saved by Fielora != Not retained by Provider
```

OpenAI 官方资料说明 Responses application state 默认保留，并区分 application state 与 abuse-monitoring retention；`store:false` 不能推出无 Provider retention。Anthropic 官方隐私资料说明标准 API input/output 通常在 30 天内删除，但合同、ZDR、Usage Policy 与法律等会改变处理。因此 UI 只能精确声明 Fielora local behavior。

## 5. Real provider probe waiting condition

本机当前没有以下专用环境变量，因此脚本 fail-closed 为 SKIP 且没有发起网络请求：

```text
FIELORA_OPENAI_PROBE_KEY
FIELORA_OPENAI_PROBE_MODEL
FIELORA_ANTHROPIC_PROBE_KEY
FIELORA_ANTHROPIC_PROBE_MODEL
```

不得把 secret 粘贴进对话、repo、脚本、命令行参数或 artifact。应在启动 Codex/终端进程前通过安全环境注入；恢复后只运行：

```text
node scripts/freeze/phase04/probe-real-providers.mjs
```

脚本固定每家最多 2 次可能计费调用 + 1 次 invalid-auth、每次最多 32 output tokens、0 retries。合成输入正文不写入 Evidence，只保存 fingerprint；response body、secret 和 header value 均不输出。

Real probe 的 PASS 不是“两家 API 都返回字符串”。它必须记录 provider-specific wire event types，并证明两家进入同一稳定 `ModelInvocation` contract：

```text
complete  STARTED -> OUTPUT_TEXT_DELTA -> USAGE -> COMPLETED
cancel    STARTED -> OUTPUT_TEXT_DELTA -> CANCELLED
error     STARTED -> FAILED / CREDENTIAL_REJECTED
```

最终 Evidence 还必须固化 artifact/output leak scan：`promptBodies=0`、`responseBodies=0`、`credentialBytes=0`、`authorizationHeaders=0`、`secretLogBytes=0`。

## 6. Verdict

```text
PROVIDER_RETENTION_AMENDMENT: COMPLETE
MIGRATION_RUNNER_PROBE: PASS
WINCRED_PROBE: PASS
PROVIDER_CONTRACT_FIXTURES: PASS
CUSTOM_ENDPOINT_POLICY_PROBE: PASS
CONTEXT_CAPTURE_CONTRACT_PROBE: PASS
REAL_PROVIDER_PROBE: SKIP_NO_TEST_CREDENTIALS

PHASE_04_FINAL_FREEZE_CANDIDATE: NOT_READY
PHASE_04_FREEZE: NOT_YET
PHASE_04_IMPLEMENTATION: NOT_AUTHORIZED
```
