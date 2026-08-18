# Fielora V0.1 Phase 04 Contract Delta Candidate

状态：`FROZEN / PROVIDER ACCEPTANCE DEFERRED TO PHASE EXIT / IMPLEMENTATION AUTHORIZED`

版本：V0.1 Frozen

日期：2026-08-16

本文件是对 Frozen `CORE_CONTRACTS_V0.1.md` 的 additive delta。FIPC 仍为 `FIPC/1`、protocol `1.0`；Phase 01/02 ID、Field/State/Object/Relation/Activity/Surface/Resume semantics 不被改写。

## 1. New identities

```text
ProviderConfigId  UUIDv7, durable, Fielora-owned local configuration identity
CaptureId         UUIDv7, durable, Fielora-owned content/provenance identity
ContextPackageId  UUIDv7, ephemeral per invocation
ModelInvocationId UUIDv7, ephemeral per invocation
```

Provider response/session/tool-call id 只能作为 adapter metadata，不得替代以上 identity。

## 2. Provider domain

```text
ProviderKind     OPENAI | ANTHROPIC | OPENAI_COMPATIBLE
EndpointClass    OFFICIAL | CUSTOM
ProviderLifecycle ACTIVE | DISABLED | REMOVED
```

`OPENAI`/`ANTHROPIC` 必须为 `OFFICIAL` 且 `base_url = null`；`OPENAI_COMPATIBLE` 必须为 `CUSTOM`、HTTPS base URL、显式风险确认。官方 endpoint 不允许用户覆盖。`REMOVED` 是 tombstone，保留 Capture provenance FK；重新使用必须显式 reconfigure。

`ProviderKind` 是 V0.1 persistence/adapter catalog，不是 `ModelInvocation` 的内部 wire standard。OpenAI Responses、Anthropic Messages、OpenAI-compatible 或未来 additive provider-native adapters 都必须归一化为第 3 节事件；Provider/协议选择不得改变上层 identity、authority 或 mutation semantics。

Provider configuration creation 必须在 UI 展示 external-send/provider-retention disclosure 并由用户显式继续。Phase 04 不增加 retention acknowledgement column：没有 legacy ProviderConfig，成功创建本身就是该 disclosure flow 的审计事实；Activity 只记录 config 创建，不记录 secret 或发送内容。

Credential 由 `credential_ref` 间接引用。Phase 04 冻结一个窄化例外：secret 可在 trusted credential input 与一次性 `command.provider.store_credential` payload 中短暂存在，写入 vault 后立即释放；它不得进入普通 Renderer application state、query/event/response、Activity、DB、log、trace、screenshot、fixture 或 artifact，也不得被 echo。该例外取代 Capability Candidate 中“绝不进入任何 FIPC payload”的不可实现绝对表述。

## 3. Model invocation

### 3.1 Request

```text
ModelInvocationRequest {
  invocation_id
  provider_config_id
  model_id
  intent                 ASK | CONTINUE
  user_input
  context_package        immutable ordered chips
  response_mode          TEXT
}
```

Core 在接收 request 后同步返回 `invocation_id`，Provider I/O 在 worker 中执行；FIPC reader 必须继续响应 cancel/query。Context Package 不持久化。

### 3.2 Stream events

```text
STARTED
OUTPUT_TEXT_DELTA
TOOL_PROPOSAL
USAGE
COMPLETED
CANCELLED
FAILED
```

每个 invocation 恰有一个 terminal event。`TOOL_PROPOSAL` 只包含归一化 name + bounded arguments + provider opaque id，不得触发执行。收到任何 output bytes 后禁止自动 retry；用户可显式重试并获得新 invocation id。未知 provider event 可忽略并计入 adapter diagnostic，但原始 payload 不进入 UI/log。

### 3.3 Stable errors

```text
PROVIDER_CONFIG_NOT_FOUND
PROVIDER_DISABLED
CREDENTIAL_MISSING
CREDENTIAL_REJECTED
MODEL_NOT_AVAILABLE
PROVIDER_RATE_LIMITED
PROVIDER_UNAVAILABLE
PROVIDER_PROTOCOL_ERROR
PROVIDER_RESPONSE_TOO_LARGE
CONTEXT_TOO_LARGE
CONTEXT_BLOCKED
CUSTOM_ENDPOINT_REJECTED
INVOCATION_NOT_FOUND
INVOCATION_ALREADY_TERMINAL
INVOCATION_CANCELLED
```

Provider/HTTP/SDK 原始错误不得直接显示在 UI。安全诊断可保留 status class、request id 的脱敏形式与 stable error，不保留 Authorization、prompt 或 response body。

### 3.4 Retention boundary

```text
LOCAL_RETENTION
Fielora does not persist full prompt/response by default.

PROVIDER_RETENTION
External Provider handling is provider/account-policy dependent.

OPENAI_RESPONSES
store = false by default and cannot be overridden in Phase 04.

USER_DISCLOSURE
"Not saved by Fielora" must never be presented as
"not retained by the Provider".
```

Adapter request policy：OpenAI 必须 `store:false` 且不得调用 Conversations/previous-response continuity；Anthropic 不添加不存在的 retention flag。Provider policy URI 可由 trusted adapter metadata 提供给 UI，但不是 authority、也不进入 Capture identity。Local Activity/diagnostic 只保存 bounded metadata。

## 4. Context contract

```text
ContextChip {
  kind                    CURRENT_FIELD | CURRENT_FOCUS | CURRENT_PAGE |
                          CURRENT_SELECTION | CAPTURE | USER_NOTE
  source_identity
  source_revision_or_navigation_generation
  display_label
  content
  sensitivity             NORMAL | SENSITIVE | BLOCKED
  completeness            COMPLETE | PARTIAL
}
```

Main 只能把 active main-frame、当前 page id + navigation generation 的 Browse candidate 交给 Core；Core 对 Field/Capture reference 重读 authoritative data。remote page content 始终是不可信输入。超限、stale 或 BLOCKED 不得静默发送。

## 5. Capture aggregate

```text
Capture {
  id, owner_principal_id, created_by, source_activity_id
  kind                    TEXT | PAGE | SELECTION | MODEL_OUTPUT | FIELD_EXCERPT
  title, content
  placement_status        INBOX | ATTACHED | PROMOTED
  lifecycle_status        ACTIVE | ARCHIVED
  attached_field_id?
  promoted_as?            IDEA_CANDIDATE
  source                  immutable provenance union
  revision, created_at, updated_at
}
```

`IDEA_CANDIDATE` 是 Capture aggregate 的语义角色，不新增 Idea table，不是 `FieldStateKind`。Phase 04 不扩展 FACT/DECISION/ASSUMPTION/QUESTION/TASK/BLOCKER/RESULT，也不创建 Requirement。

Mutation invariants：

- create 与 source Activity 同 transaction；
- content/source 创建后 immutable；archive/restore 只改 lifecycle；
- attach 只允许 INBOX→ATTACHED 或 ATTACHED reattach 到同一 Field；Phase 04 禁止跨 Field move；
- promote 只允许 ACTIVE Capture，变为 PROMOTED + IDEA_CANDIDATE；
- attach/promote 到 Field 时，Capture mutation、Activity 与 Field aggregate revision +1 同 transaction；
- DB commit 后才发 event；失败或 cancel 不产生 Capture；
- Browser ASK 未 Capture 时使用 global Activity 或不写 durable Activity，不得改变任何 Field aggregate。

## 6. Commands, queries and events

```text
command.provider.create_config
command.provider.update_config
command.provider.store_credential      # one-shot secret ingress
command.provider.delete_credential
command.provider.probe
command.provider.remove_config
query.provider.list_configs
query.provider.get_config

command.model.start
command.model.cancel
event.model.invocation

command.capture.create
command.capture.attach
command.capture.promote
command.capture.archive
command.capture.restore
query.capture.list
query.capture.get
event.capture.changed
```

所有 payload 使用 typed validation、unknown-field reject、bounded string/array。`query.provider.*` 永不返回 secret/credential bytes。Provider remove 顺序为：先删除 vault secret，再写 `REMOVED` tombstone；若后续 DB 写失败，保留可检测的 missing-credential config，由 bootstrap/query reconcile 为 `DISABLED`，不得重新生成 secret。

## 7. Activity actions

Phase 04 新增 domain action name，但不改变 `activities` 表结构：

```text
PROVIDER_CONFIG_CREATED
PROVIDER_CONFIG_UPDATED
PROVIDER_CONFIG_REMOVED
CAPTURE_CREATED
CAPTURE_ATTACHED
CAPTURE_PROMOTED
CAPTURE_ARCHIVED
CAPTURE_RESTORED
MODEL_INVOCATION_COMPLETED     # metadata only, no prompt/response
MODEL_INVOCATION_FAILED        # metadata only, no raw provider error
```

Invocation Activity 仅保存 provider config id、model id、intent、terminal class、duration/usage 的 bounded metadata。Browse loose ask 必须保持 `field_id = null`；Field ask 可以是 field-scoped history，但不能自行创建/修改 State、Object、Relation、Requirement 或 Verified Result。

## 8. Permission minimum

Phase 04 Domain 只实现：

- Capability Boundary：model external send 与 custom endpoint 是否可用；
- Mandate：本次用户显式 invocation/capture/promote；
- Approval Routing：SENSITIVE send 与 custom endpoint 确认；
- Semantic Authority：model/tool proposal 恒为 NONE，用户显式 Promote 只授予 IDEA_CANDIDATE admission。

四层不得压成单轴 permission enum。任何 Provider、Model、网页、tool proposal 或 metadata 都不能 self-grant。
