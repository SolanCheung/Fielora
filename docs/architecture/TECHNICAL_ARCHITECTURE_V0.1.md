# Fielora V0.1 Technical Architecture

状态：FROZEN / APPROVED（含 Required Freeze Amendments）  
版本：V0.1  
日期：2026-08-13  
实现 Gate：Repo Bootstrap / Toolchain Gate 已执行；`IMPLEMENTATION_NOT_AUTHORIZED`，不得进入 Phase 01 实现

## 1. 架构目标

Fielora V0.1 的架构首先服务一个事实：Field Reality 必须独立于当前 UI、Browser Host、模型、Agent、Provider 和本地路径而持续存在。

第一条真实纵向闭环是：

```text
React UI
  → controlled preload bridge
  → Electron Main
  → FIPC/1 over child stdio
  → Rust Field Runtime
  → SQLite transaction
  → post-commit Domain Event
  → React query invalidation
  → packaged restart
  → Field + Focus + Surface Resume
```

架构原则：

- Field Runtime 是持久化 Reality 的唯一写入者；
- Activity 保存发生过什么，State 保存现在什么是真的；
- Domain 完整，物理实现克制；
- UI、FIPC DTO、Domain Model、Persistence Row 相互分离；
- Browser、Electron、Windows、Agent、Provider、Connector 都是 Adapter，不是 Domain Truth；
- Action completed 与 Result verified 永久分离；
- Phase 通过依赖真实运行、真实持久化、真实打包和真实验收，不依赖 Mock 声明。

## 2. 当前范围与非目标

本架构覆盖 V0.1 P0 所需的 Core、Desktop Host、Persistence、FIPC、Field/State/Activity、Resume、Development、Verification/Evidence、Provider、Capability Connector 与 Library 基础。

本轮不把以下方向加入 V0.1 P0：

- 完整 Capability Acquisition Runtime；
- Deploy Website Mandate Prototype；
- 完整 Mandate Runtime；
- 完整 Exchange / IM / Shared Field；
- macOS / Linux 正式产品验收；
- 完整 Chrome Extension compatibility；
- Chromium Fork；
- Full Event Sourcing；
- 通用 Workflow Engine；
- 万能 Resource EAV 表；
- Marketplace、ACL 系统或 Multi-Agent Society。

Capability Acquisition 与 Mandate 的 Contract 语义可作为 Deferred Design 保留，但 Baseline Freeze 没有把它们纳入 V0.1 P0。除非用户另行改变范围，不创建其 V0.1 Migration、UI、网络或 Runtime。

## 3. 平台与跨平台边界

V0.1 唯一正式交付和验收平台是 Windows 11 x64。

以下层从第一天保持 OS-neutral：

- Field Model 与 Field Runtime；
- Core Contracts 与 FIPC DTO；
- Agent / Provider / Capability Contract；
- Persistence ports；
- React 业务状态与 Surface Contract。

OS-specific 能力进入 Platform Adapter：

- app data / runtime / logs path；
- process / shell；
- terminal PTY；
- credential / secure storage；
- default app launch；
- window / desktop lifecycle；
- permission elevation 与原生系统集成。

未来 macOS、Linux 和跨设备 Field Continuity 不应要求改写 Field identity、Object identity、Agent、Provider 或 Capability Contract。

## 4. 精确工具链基线

Phase 01 Repo Bootstrap 使用：

| 项目 | 冻结值 | 说明 |
|---|---:|---|
| Electron | `43.4.0` | 精确版本，不使用 `latest` |
| Node.js | `24.18.1` LTS | 开发工具链；最终用户无需安装 Node |
| pnpm | `11.21.0` | 写入 `packageManager` 并提交 lockfile |
| Rust | `1.97.1` | `rust-toolchain.toml` 固定 |
| Rust Edition | `2024` | 所有 workspace crate 一致 |
| SQLite driver | `rusqlite 0.40.2` | 启用 `bundled` |
| Desktop build | Electron Forge + Webpack | 不采用 Forge Vite Plugin |
| UI | TypeScript + React | exact dependency graph 由 lockfile 固定 |
| Contract generation | `ts-rs` | 仅生成跨 FIPC DTO；exact version 由首个 lockfile 固定 |

版本事实已经通过官方发布渠道核验：Electron 43.4.0 于 2026-08-11 发布；Node 24 是 LTS 且 24.18.1 存在；Rust 1.97.1 于 2026-07-16 发布；pnpm 11.21.0 是 2026-08-09 的已签名正式发布；rusqlite 0.40.2 已在 crates.io 正式发布、未撤回且支持 `bundled` feature。

本机 Toolchain Gate 已执行：Node 由 `D:\AppInstall\nvm\nvm` 下的 NVM 管理，24.18.1 已安装并 active；pnpm 11.21.0 已准备；Rust 1.97.1 已设为 default，rustfmt/clippy components 已安装。精确版本 metadata 已提交候选，但产品 workspace 与依赖仍不存在。

升级规则：工具链升级必须是单独变更，重新通过 Static、Unit、Integration、Desktop E2E、Package 与 Packaged Smoke。

## 5. Monorepo 与模块边界

采用单一 Git Repo：

```text
Fielora/
├─ AGENTS.md
├─ package.json
├─ pnpm-workspace.yaml
├─ pnpm-lock.yaml
├─ Cargo.toml
├─ rust-toolchain.toml
├─ docs/
├─ apps/
│  └─ desktop/
├─ packages/
│  └─ contracts/
│     └─ generated/
├─ crates/
│  ├─ fielora-core/
│  ├─ fielora-contracts/
│  ├─ fielora-field/
│  ├─ fielora-storage/
│  └─ fielora-platform/
├─ scripts/
├─ tests/
│  ├─ integration/
│  ├─ e2e/
│  └─ fixtures/
└─ artifacts/
```

Phase 01 不创建 `agent`、`mcp`、`mandate`、`acquisition`、`lsp`、`coding-agent` 等未来空 crate 或目录。

职责：

- `fielora-core`：binary；composition root、runtime startup、FIPC server、command/query dispatch、post-commit event publication；
- `fielora-contracts`：跨进程 DTO、FIPC envelope、stable wire enums；
- `fielora-field`：Field Domain、commands、repository ports、application service、domain errors；
- `fielora-storage`：SQLite connection owner、migration、repository implementation、transaction boundary；
- `fielora-platform`：Platform ports 与 Windows Phase 01 implementation；
- `apps/desktop`：Electron Main、preload、React renderer；
- `packages/contracts/generated`：由 Rust DTO 生成并提交的 TypeScript types。

依赖方向：

```text
Electron Renderer → preload allowlist → Electron Main → FIPC DTO
                                                     ↓
                                                fielora-core
                                               /            \
                                      fielora-field       adapters
                                           ↑              /      \
                                      repository port  storage  platform
```

禁止 `field → storage`、`field → Electron`、`field → Windows API`、Renderer 直接访问 SQLite。

## 6. Desktop 进程模型

```text
Fielora.exe
├─ Electron Main
│  ├─ CoreProcessSupervisor
│  ├─ FipcClient
│  ├─ BrowserWindow lifecycle
│  └─ preload bridge validation
├─ sandboxed Renderer
│  └─ React / TypeScript view state
└─ resources/core/fielora-core.exe
   ├─ FIPC server
   ├─ Field Runtime
   ├─ Storage Worker
   └─ Platform Adapter
```

Electron Main 只拥有 Desktop lifecycle 和连接状态，不拥有 Field business truth。Renderer 只维护 view/loading/selection state；Field Reality 来自 Core Query/Event。

## 7. 安全的启动顺序

Draft 中“hello 成功后才创建窗口”与“失败时显示 Startup Error UI”无法同时成立。正式顺序修正为：

```text
app ready
→ acquire single-instance lock
→ create secure local BrowserWindow in Startup state
→ resolve packaged/debug core path
→ spawn core with shell=false, windowsHide=true
→ core resolves PlatformPaths and DeviceIdentity
→ core opens SQLite and applies migrations
→ Main sends system.hello as first FIPC request
→ hello success
→ Renderer transitions Startup → Now
```

若 5 秒内没有完成 hello，或 Core 提前退出，Startup Screen 显示可理解错误与 `重试 / 打开日志目录 / 退出`。不能出现无信息白屏。

Development 可通过受控 `FIELORA_CORE_PATH` 覆盖 Core；production 只从 packaged resources 固定解析。不得从 current working directory 猜路径。

## 8. Core lifecycle

### 8.1 Unexpected exit

Core 意外退出时：

1. Main 把 health 标为 unavailable；
2. 拒绝新的写操作并 reject pending requests；
3. 通知 Renderer；
4. 在 60 秒窗口内最多自动重启 3 次，使用短退避；
5. 每次重启重新 hello、打开 DB，并由 Renderer 重新 Query Reality；
6. 超限进入 Core Degraded，要求用户重启应用。

不得自动重放超时或中断的 Command。对可能已提交的本地 Command，先 Query/Reconcile；未来非幂等外部动作使用 `UNKNOWN_OUTCOME` 规则。

### 8.2 Graceful shutdown

```text
app quit requested
→ stop accepting new UI writes
→ system.shutdown
→ Core finishes active transaction and closes storage/logs
→ wait up to 2 seconds
→ force terminate only after timeout
```

### 8.3 Parent-pipe EOF

Electron Main 必须以 owned stdin/stdout pipe 启动 Rust Sidecar。Core 对 stdin 的 EOF 视为权威的 parent-pipe shutdown signal：无论是否先收到 `system.shutdown`，都停止接受新请求，安全完成或回滚当前 transaction，关闭 storage/logs，并在同一 2 秒 shutdown budget 内退出。若有界清理不能完成，Core 必须以非零状态自行终止，不能在 Electron Parent 消失后成为 orphan process。

Core 不自行重启；restart ownership 只属于 Electron Main supervisor。Integration 必须分别验证正常 `system.shutdown` 和“关闭 parent stdin、不发送 shutdown”的 EOF 路径。

## 9. Electron security baseline

BrowserWindow 至少设置：

```text
nodeIntegration = false
contextIsolation = true
sandbox = true
webSecurity = true
allowRunningInsecureContent = false
```

### 9.1 Trusted Local Application Origin Boundary

生产 App UI 的唯一 trusted application origin 冻结为 `fielora://app`，入口为 `fielora://app/index.html`。该 scheme 必须在 Electron ready 前注册为 standard/secure local application scheme，并由受控的本地 packaged resources handler 提供；不得把 `file://`、任意 HTTP(S) 页面或任意自定义 scheme host 当作 trusted app origin。

开发态只允许 Forge 为当前进程提供的 renderer entry URL 所解析出的**精确 loopback origin**，且只在 `!app.isPackaged` 时启用。禁止使用 `http://localhost:*`、`http://127.0.0.1:*` 或任意端口通配；每次启动只接受实际 entry 的 scheme + host + port。

每个 trusted bridge call 必须同时满足：

- 来自 Fielora App Window 的预期 `webContents`；
- sender frame 是该 `webContents` 的 main frame，而不是 iframe/subframe；
- sender URL 的 parsed origin 与当次运行的 exact trusted origin 相等；
- channel 位于 typed allowlist，payload 通过 schema validation。

Browse/remote content 必须使用隔离的 untrusted WebContents/session boundary，不装载 Fielora app preload，不获得 `window.fielora`，其 origin 永远不能升级为 trusted application origin。App Window 的 navigation、redirect、new-window 与 permission 默认 deny；明确外部 URL 只可交给隔离 Browser Runtime 或 system browser policy 处理。

### 9.2 Renderer 与 bridge hardening

同时：

- Renderer 不获得 `ipcRenderer`、`child_process`、filesystem 或 environment；
- preload 只暴露 typed allowlist；
- Main 按 9.1 校验 exact sender、main frame、origin、channel 和 payload shape；
- `setWindowOpenHandler` 默认 deny；
- navigation 默认限制到当次运行的 exact trusted app origin；
- permission request 默认 deny，后续 Browser Runtime 按明确 capability 开放；
- production 使用严格 CSP，不允许 remote code execution；
- Core spawn 参数不拼接用户输入，不使用 shell。

Phase 01 bridge：

```ts
window.fielora.field.create(...)
window.fielora.field.list(...)
window.fielora.field.get(...)
window.fielora.field.updateFocus(...)
window.fielora.surface.saveSnapshot(...)
window.fielora.surface.latestSnapshot(...)
window.fielora.core.getHealth()
window.fielora.core.subscribe(...)
```

禁止 Renderer 传任意 FIPC method string给 Main。

## 10. FIPC/1 Transport

### 10.1 Framing

- Electron Main 与 Rust Core 使用 child stdin/stdout；
- 每条消息是一个完整 UTF-8 JSON object，后跟 LF (`\n`)；
- 单条 frame 最大 4 MiB；
- screenshot、file、media 等大对象走 `ResourceRef`，不走 Base64；
- Core stdout 只能包含 FIPC frame；日志只写 stderr / log file；
- Renderer 不直接读取或写入 Core stdio。

Parser 必须按 bytes 增量解析，不能依赖无上限 `readLine`。无效 UTF-8、非法 JSON、invalid request、oversized frame 都不能导致 Main 或 Core panic/crash；oversized frame 丢弃到下一个 LF 后再恢复 framing。

### 10.2 JSON-RPC compliance 修正

FIPC/1 使用 JSON-RPC 2.0 envelope。JSON-RPC 的 `error.code` 必须是 integer；Draft 中字符串 `error.code` 不符合协议。稳定业务 code 移到 `error.data.code`：

```json
{
  "jsonrpc": "2.0",
  "id": "request-uuid",
  "error": {
    "code": -32602,
    "message": "Field title is required",
    "data": {
      "code": "validation_failed",
      "trace_id": "trace-uuid",
      "retryable": false,
      "details": {}
    }
  }
}
```

Phase 01 mapping：

| JSON-RPC code | `data.code` |
|---:|---|
| `-32700` | `protocol_error` / parse error |
| `-32600` | `protocol_error` / invalid request |
| `-32601` | `protocol_error` / unknown method |
| `-32602` | `validation_failed` |
| `-32603` | `internal` |
| `-32001` | `not_found` |
| `-32002` | `conflict` |
| `-32003` | `timeout` |
| `-32004` | `cancelled` |
| `-32005` | `storage_error` |

Parse/invalid-request errors在无法确定 request id 时使用 `id: null`。

### 10.3 Request metadata

```json
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "method": "command.field.create",
  "params": {},
  "_meta": {
    "protocol": "1.0",
    "trace_id": "uuid",
    "deadline_ms": 10000
  }
}
```

`deadline_ms` 是从接收时刻计算的 duration。Phase 01 不自动 retry Command。

### 10.4 Handshake

Main spawn Core 后发送的第一条 request 必须是 `system.hello`。Core 在 storage/migration ready 后返回：

```json
{
  "core_version": "0.1.0",
  "protocol": { "major": 1, "minor": 0 },
  "schema_version": 1,
  "capabilities": [
    "field.create",
    "field.list",
    "field.get",
    "field.update_focus",
    "surface.save_snapshot",
    "surface.latest_snapshot"
  ]
}
```

major 不一致是 fatal；client minor 大于 core minor 时只能使用 capability list 明确存在的能力。V0.1 不实现复杂 negotiation。

### 10.5 Pending、Event、Cancellation

Main 维护 `request_id → resolver/rejecter/deadline`。超时立即删除 pending；迟到 response 只记录 warning，不重新改变 UI。

Event 使用 JSON-RPC notification，例如 `event.field.changed`，只能在 transaction commit 后发布。Event 是 query invalidation signal，不是完整 Reality 副本；断线恢复后必须重新 Query。

`system.cancel` 属于 Main↔Core Contract。Phase 01 短 Field command 不要求主动使用，但 parser/dispatcher 保留取消语义。

## 11. Command / Query boundary

Phase 01 Commands：

- `command.field.create`
- `command.field.update_focus`
- `command.surface.save_snapshot`
- `system.shutdown`

Phase 01 Queries：

- `query.field.list`
- `query.field.get`
- `query.surface.latest_snapshot`
- `system.hello`
- `system.health`

任何 Reality mutation 都必须走 Command。UI 不能发送 SQL 或通用 update patch。

`command.surface.save_snapshot` 不接受 Renderer 提供的 `device_id`。Core 使用当前 Platform Adapter 的 DeviceIdentity，防止客户端伪造或混淆设备绑定。

## 12. Persistence architecture

### 12.1 Driver 与 ownership

- SQLite + `rusqlite 0.40.2` `bundled`；
- 只有 Rust Core 访问 DB；
- 一个 Storage Worker 明确拥有 Connection；
- Phase 01 不使用 pool、ORM、graph DB 或 event-sourcing framework；
- async Core 不在 executor hot path 长时间运行同步 SQLite；
- Repository port 在 `fielora-field`，SQLite implementation 在 `fielora-storage`。

### 12.2 Paths

Windows Adapter：

```text
%LOCALAPPDATA%\Fielora\data\fielora.db
%LOCALAPPDATA%\Fielora\runtime\
%LOCALAPPDATA%\Fielora\logs\fielora-core.log
%LOCALAPPDATA%\Fielora\config\device-id
```

`FIELORA_DATA_DIR` 只允许 tests/dev 使用。Production 忽略未授权 override。

### 12.3 Device identity

当前 device UUIDv7 由 Platform Adapter 首次生成并保存在独立的 installation-local `config/device-id`，然后 upsert 到 DB `devices`。DB 中的 device row 不是 identity 的唯一来源；复制/同步 Field DB 不应自动冒充原设备。

不得使用 computer name、MAC、Windows SID 或本地路径作为 Domain ID。设备名、platform、architecture 只是 metadata。

### 12.4 SQLite open gate

每次正式连接必须设置并验证：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
```

WAL 或 foreign keys 未真正启用时启动失败，不静默降级。

## 13. Migration strategy

- Migration SQL 位于 `crates/fielora-storage/migrations/` 并编译进 Core；
- runner 先以固定 DDL bootstrap `schema_migrations` metadata table；该 bootstrap table 不属于编号 migration；
- 每个 migration 在 transaction 中 apply → validate → record → commit；
- record 包含 `version`、`name`、`checksum`、`applied_at`；
- 已应用 migration 的 checksum 变化是 startup error，禁止静默重写历史；
- schema version 与 FIPC protocol version 分开演进。

Phase 01 先 bootstrap `schema_migrations`，再应用 `0001_core.sql` 建立：

```text
principals
fields
field_state_entries
field_objects
field_relations
activities
devices
device_bindings
surface_snapshots
```

后续表跟随真实 Phase migration 增加，不在 Phase 01 一次建立完整 V0.1 空 schema。

## 14. Phase 01 schema semantics

### 14.1 Stable primitives

- 所有持久化 Domain ID：UUIDv7，以标准 UUID string 存为 SQLite `TEXT`；
- 时间：UTC Unix milliseconds，SQLite `INTEGER`；
- `revision`：从 1 开始；mutation 使用 `expected_revision`；
- JSON column 必须在 Domain/Repository boundary 验证，不允许任意未验证字符串；
- title trim 后按 Unicode scalar value 计数，范围 1–120；goal 最大 4000。

### 14.2 Principals 与 Exchange 预留

Phase 01 初始化 `LOCAL_USER` 与 `SYSTEM` Principal。Field 有 owner，Activity 有 actor。

未来 Exchange 的 `visibility / share_scope / permissions / provenance` 在 Contract 层保留语义；V0.1 不建立 users/accounts/ACL/messages/field_invites 表。Field Object 默认继承 Field 的 local-private access envelope，不暗含“永远只有 user_id=1”。

### 14.3 Field Reality 与 Activity

`fields.current_focus_json` 是当前 Focus 的事实源。Create Field 与 Update Focus 都在同一 transaction 中写 Reality + append-only Activity；commit 后再 emit `event.field.changed`。

`field_state_entries` 使用 FACT / DECISION / ASSUMPTION / QUESTION / TASK / BLOCKER / RESULT。Phase 01 建表但不实现完整 State UI/commands。

`field_relations` 作为 Work Lineage 基础，不创建独立知识图谱或 WorkLineage Runtime。Generic endpoint 由 Domain 校验，不强行建立跨多表 FK。

### 14.4 Snapshot 非第二事实源

`surface_snapshots` 保存 per-device presentation state：

```text
id
field_id
device_id
field_revision
layout_json
open_objects_json
created_at
```

它不重复拥有 authoritative current focus/current mode。Resume 时 Core 返回最新 Field Reality 与当前设备最新 Snapshot；若 snapshot 的 `field_revision` 陈旧，UI 可以恢复安全 layout，但不得覆盖较新的 Field Focus。

每个 Field/Device 最多保留最近 10 个 Snapshot，清理属于 storage maintenance，不生成业务 Activity。

## 15. Domain transaction rules

### Field create

```text
validate title/goal
→ generate Field UUIDv7
→ transaction:
     insert field(owner = local user, revision = 1)
     insert FIELD_CREATED activity(trace_id)
→ commit
→ emit event.field.changed(change=created, revision=1)
```

### Update focus

```text
validate focus
→ UPDATE ... WHERE id=? AND revision=?
→ affected rows 0 => conflict
→ append FIELD_FOCUS_UPDATED activity in same transaction
→ commit
→ emit event.field.changed(change=focus_updated, new revision)
```

### Save snapshot

```text
resolve current DeviceIdentity in Core
→ validate referenced Field and layout/open objects DTO
→ insert snapshot with observed field_revision
→ prune >10 for field/device
→ commit
```

## 16. Rust ↔ TypeScript contracts

Rust 是跨 FIPC contract source of truth，但只 export DTO：

- Envelope / ErrorData / ProtocolVersion；
- typed IDs；
- CreateFieldRequest / UpdateFocusRequest；
- FieldSummary / FieldView；
- SaveSurfaceSnapshotRequest / SurfaceSnapshotView；
- DomainEventDTO / HealthDTO。

不 export Aggregate、Repository Row 或内部 error enum。Wire enum 使用显式稳定 serialization name，不依赖 Rust variant debug string。

生成到 `packages/contracts/generated/` 并提交。Static Gate 执行 regenerate 后必须 `git diff --exit-code`，防止 Rust/TS drift。

## 17. Logging 与隐私

Core 使用 `tracing`，stdout 禁止日志，stderr 与 `logs/fielora-core.log` 记录：startup、version、schema/migration、FIPC fatal、storage fatal、restart、shutdown。

默认不记录完整用户 text、Goal、Field State、credentials、FIPC params 或未来敏感数据。使用 trace_id、method、duration、result code 与脱敏 metadata。Phase 01 日志轮转可保持简单，但必须限制无限增长并列为 packaging smoke 检查项。

## 18. Build、test 与 delivery

统一 Gate：

```text
Static
→ Unit(TS/Rust)
→ Rust Clippy/Release Build
→ Integration
→ Desktop E2E
→ Package
→ Packaged Smoke
→ Human Experience Acceptance
```

Phase 01 必须真实验证：

- migration application + idempotence/checksum；
- real SQLite close/reopen persistence；
- FIPC hello/create/list/shutdown/restart；
- parent-pipe EOF 后 Core 在 2 秒内退出且不留 orphan；
- trusted app origin 正例，以及 remote/subframe/wrong-origin bridge 拒绝；
- invalid UTF-8/JSON、oversized frame、unknown method、wrong major；
- revision conflict；
- Core crash detection/restart/requery；
- real Electron create Field/update Focus/restart/Resume；
- packaged resource 内的 Core，而不是 dev target；
- Portable ZIP 可直接运行。

每个 Phase 必须有 Portable。Installer smoke checkpoints 固定为 Phase 03、Phase 08 和 Final Alpha；最终 V0.1 Alpha 必须同时提供 Portable + Installer。

## 19. V0.1 implementation phases

所有阶段仍属于 V0.1：

1. Repo + Desktop Shell + Rust Core + SQLite/Migration + FIPC + thin Field/Resume vertical slice；
2. Field State + Activity + DXE primitives + richer Resume；
3. Shell + Now + Browse Runtime；
4. Summon + Context Chips + Capture + Inbox + Multi-LLM Provider foundation；
5. Requirement + Existing Project Takeover + persistent Project Reality；
6. DevelopmentTask + CodingSession + Basic Code Workspace/Git Diff + CodingAgentProvider spike；
7. AI-first Development Runtime + Terminal/Run integration；
8. Verification + Evidence + Browser Preview；
9. Generic MCP Connector (`Contract → Call → Result → Evidence`)；
10. Library foundation + cross-cutting security/polish + Packaged Alpha。

OpenCode、ACP、Editor、LSP、PTY、MCP transport 等在所属 Phase 前做 bounded spike，不提前进入 Phase 01。

Capability Acquisition Minimal 与 Deploy Website Mandate Prototype 作为 Deferred candidate，不在当前 V0.1 P0 phase gate 中。

## 20. 已冻结与仍开放

以下项目已经冻结：

- monorepo 边界与依赖方向；
- exact Phase 01 toolchain；
- Electron Forge + Webpack；
- Electron Main supervised Rust sidecar；
- trusted local application origin boundary；
- Rust Sidecar 在 parent-pipe EOF 后有界退出；
- FIPC/1 JSON Lines + JSON-RPC-compliant envelope；
- SQLite/rusqlite bundled + single Storage Worker；
- UUIDv7、Unix ms、optimistic revision；
- migration embedding/checksum；
- Phase 01 schema、commands、queries、events；
- stable object identity / Device Binding separation；
- Field Reality / Surface Snapshot truth separation；
- Rust-to-TS DTO generation；
- Phase 01 packaging/test gate。

不阻塞 Phase 01、按后续 Phase 冻结：

- code editor implementation；
- LSP host boundary；
- terminal PTY implementation；
- Generic MCP protocol scope与 transport；
- CodingAgentProvider 的 OpenCode/ACP viability；
- Provider credential vault；
- updater、code signing、final installer technology；
- precise Browser tab/webContents model；
- Capability Acquisition / Mandate 是否进入后续产品版本。

Remote Repo 已确认为空仓库，Canonical Local Worktree 已确认为 `F:\项目\Fielora`。Repo Bootstrap / Toolchain Preparation 已完成；当前唯一阻塞 Phase 01 开工的外部前置项是用户尚未授予新的 `Implementation Authorization`。

## 21. Repo Gate

开始任何代码或依赖安装前必须在真正 Repo 中报告：

```text
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
```

Remote 已确认为 `git@github.com:SolanCheung/Fielora.git` 且为空。Canonical Local Worktree 是 `F:\项目\Fielora`；Git root、remote、branch、HEAD、dirty state 与 toolchain 必须在 Baseline Commit 后重新核验，Repo 根必须包含最新 `AGENTS.md`、context、product、architecture、Core Contracts 与 Phase 01 spec。

当前状态为：

```text
REMOTE_REPO_CONFIRMED_EMPTY
CANONICAL_LOCAL_WORKTREE_CONFIRMED
REPO_BOOTSTRAP_COMPLETE
TOOLCHAIN_GATE_PASS
IMPLEMENTATION_NOT_AUTHORIZED
IMPLEMENTATION_NOT_STARTED
```
