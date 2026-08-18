# Fielora V0.1 Phase 04 Implementation Specification Candidate

状态：`FROZEN / IMPLEMENTED / ENGINEERING GATE PASS / PROVIDER ACCEPTANCE DEFERRED TO PHASE EXIT`

版本：V0.1 Frozen

日期：2026-08-16

## 1. Architecture result

Phase 04 保持 Electron trusted shell + Rust sidecar + SQLite 架构。Provider HTTP、Context assembly、Capture domain、credential access 与 provider-neutral normalization 归 Rust；Renderer 只负责 Summon/Context/Capture UI；remote WebContents 不获得 Core、Provider、vault 或 FIPC bridge。

```text
Trusted Renderer
  -> typed Preload
  -> Electron Main orchestration
  -> FIPC/1
  -> Rust Core command router
       -> ContextAssembler
       -> ModelRuntime -> ProviderAdapter -> HTTPS
       -> Capture domain -> Storage Worker -> SQLite
       -> CredentialStore port -> Windows Credential Manager
```

## 2. Crate/module ownership

- 新增真实 `fielora-model` crate：provider-neutral contract、OpenAI/Anthropic/OpenAI-compatible adapters、bounded SSE parser、error normalization；
- `fielora-field`：Capture aggregate、transition、Reality admission；
- `fielora-storage`：Migration 0004、repositories、schema validation；
- `fielora-platform`：`CredentialStore` port 与 Windows Credential Manager adapter；
- `fielora-core`：async invocation registry、Context assembler、command/query/event orchestration；
- Electron Main：active Browse context candidate、selection extraction、window lifecycle；
- trusted Renderer：Summon overlay、Context chips、Inbox/Promote UI；
- Preload：仅新增窄化 typed capability，禁止暴露全量 `window.fielora` 给 BrowseScreen。

空 crate、mock-only shipping adapter 或把 secret/provider logic 放进 Renderer 均不算完成。

## 3. Core concurrency

当前同步 stdin/stdout loop 必须在 Slice 01 重构为：

- 单一 FIPC reader；
- bounded command dispatcher；
- Tokio ModelRuntime workers；
- cancellation token per invocation；
- 单一 stdout writer queue，序列化所有 responses/events；
- bounded queues 和 event size；writer failure/parent EOF 触发全局 cancel 与既有 bounded exit。

任何长 Provider stream 不得阻塞 cancel、health、query 或其他 command。FIPC framing、10 MiB upper bound、trusted-origin handshake 与 parent supervision 不变。

## 4. Provider implementation

首发采用直接 Rust HTTP adapter，不把 Domain 绑定 vendor SDK。冻结候选依赖版本（仅在实现授权后加入并由 lockfile 固定）：

```text
tokio          1.53.1
tokio-util     0.7.19
reqwest        0.13.4 (rustls, default TLS disabled)
futures-util   0.3.34
windows-sys    0.61.2 (Win32 Security Credentials)
```

不采用旧 eventsource convenience crate；实现 bounded SSE parser：单 event 最大 1 MiB、总 response buffer 最大 8 MiB、invalid UTF-8/JSON fail closed、unknown event forward-compatible ignore、终止后不再发 delta。HTTP redirects disabled；TLS certificate/hostname validation 必须开启。

OpenAI adapter 使用 Responses API，并对每次 Phase 04 request 强制写入不可覆盖的 `store:false`；不使用 Conversations、`previous_response_id`、background mode 或 Provider state 维持 Resume。Anthropic adapter 使用 Messages API，不伪造不存在的 retention request flag。两者归一化 text delta、usage、tool proposal、terminal、error 与 client-side abort。具体 model id 不编译进 Domain。

## 5. Custom endpoint security

`OPENAI_COMPATIBLE` endpoint：

- HTTPS only；禁止 userinfo、fragment、IP literal；hostname 必须是 DNS name；
- 每次连接前解析全部 A/AAAA；任一地址属于 loopback、private、link-local、multicast、reserved、documentation、benchmark 或 unspecified 即拒绝；
- connect 时必须约束到已验证地址集合并校验原 hostname TLS，防止 DNS rebinding；
- redirect 永久关闭；代理继承策略必须在 probe 中显式验证，不得绕过地址检查；
- 首次启用显示 normalized hostname 并记录 acknowledgement timestamp；
- Phase 04 不提供“允许私网”开关。

## 6. Credential implementation

Windows 正式 adapter 使用 Win32 Credential Manager：

```text
Type:        CRED_TYPE_GENERIC
TargetName:  Fielora/provider/<provider_config_uuid>
Persist:     CRED_PERSIST_LOCAL_MACHINE
Secret max:  2048 bytes (Fielora product limit; WinCred system limit is 2560 bytes)
```

通过 `CredWriteW`/`CredReadW`/`CredDeleteW` 访问；read 后将 buffer 限时保留在 adapter 内并尽快 zeroize owned copy。数据库只保存 target reference。配置创建顺序：先以 DISABLED 写 metadata，再 store credential，再 probe，成功才 ACTIVE。删除顺序遵循 Contract 的 delete-secret-first + tombstone/reconciliation。

## 7. Browse selection extraction

- 优先使用真实 `ContextMenuParams.selectionText/selectionRect`；
- Summon 时若需主动读取，只允许 Main 对 active main frame 调用常量、无参数、只读的 `executeJavaScriptInIsolatedWorld`；
- 不使用 remote preload、不注入可持久脚本/UI、不暴露 IPC；
- 返回 page id、navigation generation、URL、title、selection 和 timestamp；
- 进入 trusted Renderer 前做长度、URI、generation 与 type validation；
- navigation/close/page switch 后 candidate 失效。

## 8. Vertical slices

### Slice 01 — Provider / Credential / Streaming Foundation

OpenAI Responses 与 Anthropic Messages reference adapters、vault、config、stream/cancel/error、Core concurrency；无 Capture UI。实现 Gate 使用 deterministic fixtures/local controlled providers 证明 secret absence、two-protocol contract、cancel 与 FIPC non-blocking；真实 Provider validation 在 Phase Exit 执行。

### Slice 02 — Field Summon / Context

Field overlay、explicit chips、Core authoritative re-read、proposal boundary。Gate：what-is-sent disclosure、关闭不落 Reality、Field invariant diff。

### Slice 03 — Browse Ask / Boundary

安全 selection extraction、Browse Context、Loose Browse Ask。Gate：无 bridge/injection、page generation freshness、Field Reality 零变化。

### Slice 04 — Capture / Inbox / Attach

Migration 0004、Capture aggregate、Inbox query、archive/restore、attach。Gate：identity/provenance/restart、Field atomicity。

### Slice 05 — Promote / Swap / Resume

IDEA_CANDIDATE Promote、Provider swap/failure recovery、packaged/portable、Human Gate。Gate：同一 Capture/Field identity 跨 Provider 与 restart，失败无 half Reality。

每个 Slice 自动 Gate 不替代用户 Human Experience Gate。用户本轮已明确授权直接完成 Phase 04 全部实现，因此 Slice 01–05 可在各自工程 Gate 通过后连续推进，无需逐 Slice 停等；最终 Human/Provider Acceptance 仍单独裁决。

## 9. Change impact

```text
Contracts:    additive Provider/Model/Context/Capture FIPC/domain
Persistence:  schema 2 -> 4; provider_configs + captures
Security:     credential vault, external send, custom endpoint SSRF
Concurrency:  Core async workers + single writer
Browse:       read-only selection candidate only
Reality:      Capture admission; no new authoritative State kind
Packaging:    Rust deps, Win32 API, provider network
Hero Flow:    Phase 02 Field Resume + Phase 03 Browse regressions required
```

## 10. Implementation authorization

用户已通过 `PHASE_04_PROVIDER_GATE_AMENDMENT_V0.1.md` 授权 Slice 01–05 产品实现、精确依赖、lockfile、Migration 0004 registry 与 shipping artifacts。该授权不允许改变 Frozen semantics，也不构成 Phase 04 Final Acceptance。
