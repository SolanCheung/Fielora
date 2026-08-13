# Fielora V0.1 Phase 01 Implementation Specification

状态：IMPLEMENTATION READY / WAITING EXPLICIT IMPLEMENTATION AUTHORIZATION  
版本：V0.1  
阶段：Phase 01  
正式验收平台：Windows 11 x64  
注意：Technical Architecture、Core Contracts 与 Phase 01 Schema 已批准冻结；Repo Bootstrap / Toolchain Gate 已完成，但当前仍未授权 Phase 01 产品实现

## 1. 唯一目标

Phase 01 必须真实证明：

```text
secure React Renderer
→ typed preload allowlist
→ Electron Main
→ FIPC/1
→ Rust Core / Field Runtime
→ SQLite transaction
→ post-commit event
→ Renderer query invalidation
→ packaged close/restart
→ Field + Focus + Surface Resume
```

如果该闭环没有在 Portable packaged app 中跑通，Phase 01 不通过。

## 2. Phase 01 非目标

不实现完整 Browser、AI、Coding Agent、OpenCode/ACP、Editor/Monaco、Terminal/PTY、LSP、MCP、Requirement、Project Takeover、Verification Runtime、Capability Acquisition、Mandate 或 Exchange。

UI 只用于证明架构，不承担最终视觉设计。

## 3. Repo Gate

修改代码、初始化 workspace 或安装依赖前，必须在真正 Repo 根报告：

```text
Repo
Remote
Branch
Current commit
Dirty files
```

命令：

```text
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
```

Remote Repo 已确认为 `git@github.com:SolanCheung/Fielora.git` 且为空；Canonical Local Worktree 已确认为 `F:\项目\Fielora`。Baseline Commit 后必须重新核验 remote、branch、HEAD、dirty files，以及最新 AGENTS、Context、Baseline Freeze、Technical Architecture、Core Contracts 与本 Phase spec。

当前 Gate：

```text
REMOTE_REPO_CONFIRMED_EMPTY
CANONICAL_LOCAL_WORKTREE_CONFIRMED
REPO_BOOTSTRAP_COMPLETE
TOOLCHAIN_GATE_PASS
IMPLEMENTATION_NOT_AUTHORIZED
```

有用户 dirty files 时不得 reset、checkout、clean 或覆盖。

## 4. Toolchain Gate

未来 Repo 首个实现提交锁定：

```text
Electron 43.4.0
Node 24.18.1 LTS
pnpm 11.21.0
Rust 1.97.1
Rust Edition 2024
rusqlite 0.40.2 + bundled
Electron Forge + Webpack + TypeScript + React
```

必须提交 `.node-version`（或等价文件）、`packageManager: pnpm@11.21.0`、`pnpm-lock.yaml`、`rust-toolchain.toml`、Cargo.lock。

本机 Node 由 `D:\AppInstall\nvm\nvm` 下的 NVM 管理；Node 24.18.1 已安装并 active，pnpm 11.21.0 已准备，Rust 1.97.1 + rustfmt/clippy 已设为 default toolchain。开始实现时仍须复验，不得因当前 Gate PASS 而跳过版本锁定或 lockfile Gate。

不得混用 npm/yarn lockfiles，不使用 `electron@latest`。

## 5. Phase 01 repo shape

只创建当前需要的：

```text
apps/desktop
packages/contracts/generated
crates/fielora-core
crates/fielora-contracts
crates/fielora-field
crates/fielora-storage
crates/fielora-platform
scripts
tests/integration
tests/e2e
tests/fixtures
artifacts/phase01
```

不创建未来空目录森林。

## 6. Phase 01 contracts

Typed IDs/DTO 至少包含：

```text
FieldId
PrincipalId
DeviceId
SurfaceSnapshotId
ProtocolVersion
FipcErrorData
HelloRequest / HelloResponse
CreateFieldRequest
UpdateFocusRequest
SaveSurfaceSnapshotRequest
FieldSummary / FieldView
SurfaceSnapshotView
DomainEventDTO
HealthDTO
```

Rust 是 wire contract source of truth；TS generated bindings 提交 Git；Static Gate regenerate 后必须无 diff。

## 7. FIPC/1

### Framing

- UTF-8 JSON Lines；
- one object + LF；
- maximum 4 MiB；
- stdout FIPC only，log to stderr/file；
- incremental bounded parser；
- invalid UTF-8/JSON/contract 与 oversized frame 不得使进程崩溃。

### Envelope

使用 JSON-RPC 2.0 compliant envelope。`error.code` 是 integer，稳定领域 code 在 `error.data.code`。

Phase 01 business codes：

```text
validation_failed
not_found
conflict
timeout
cancelled
storage_error
protocol_error
internal
```

### Handshake

Main 发出的第一条 request 是 `system.hello`。Core 仅在 Platform、SQLite、migration ready 后响应。major mismatch fatal，minor 依 capability list 兼容。

### Methods

Commands：

```text
command.field.create
command.field.update_focus
command.surface.save_snapshot
system.shutdown
system.cancel
```

Queries：

```text
query.field.list
query.field.get
query.surface.latest_snapshot
system.hello
system.health
```

Events：

```text
event.field.changed
event.core.health
```

Event 只能 transaction commit 后发布，并作为 query invalidation signal。

## 8. Desktop lifecycle

Startup Window 在 Core hello 前创建，显示 `正在启动 Fielora…`。Main 以 `shell=false`、`windowsHide=true` spawn Core。

5 秒内没有 hello：显示原因和 `重试 / 打开日志目录 / 退出`。

Core crash：标 unavailable、拒绝新写入、reject pending、60 秒最多重启 3 次、重新 hello/requery；超限显示 Core Degraded。

Shutdown：停止新写入、发送 `system.shutdown`、等待 2 秒，超时才 terminate。

Parent-pipe EOF：Core stdin EOF 是权威 shutdown signal。即使没有收到 `system.shutdown`，Core 也必须停止接收请求、安全完成或回滚 transaction、关闭 storage/logs，并在 2 秒内退出；不得成为 orphan。Core 不自行重启，restart ownership 只属于 Electron Main。

## 9. Electron bridge/security

```text
nodeIntegration=false
contextIsolation=true
sandbox=true
webSecurity=true
```

生产 App UI 只信任精确 origin `fielora://app`，入口为 `fielora://app/index.html`。开发态只在 `!app.isPackaged` 时信任 Forge renderer entry URL 解析出的精确 loopback origin；禁止通配 localhost/127.0.0.1、任意端口、`file://` 或远程 origin。

Preload 只暴露 Field/Surface/Core typed allowlist。Main 同时校验预期 App `webContents`、main frame、exact origin、channel 与 payload，不转发 arbitrary method string。Browse/remote WebContents 使用隔离 session，不加载 Fielora preload，也不得获得 `window.fielora`。

Renderer 不获得 Node、filesystem、child_process、raw ipcRenderer、raw FIPC 或 DB。

## 10. SQLite / Migration 0001

一个 Storage Worker 拥有 bundled SQLite connection。

Open gate：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
```

每项读取确认；不满足则启动失败。

Runner 先以固定 DDL bootstrap `schema_migrations` metadata table；该表不属于编号 migration。编号 Migration 内嵌二进制，metadata 保存 version/name/checksum/applied_at；修改已应用 migration checksum 必须失败。

`0001_core.sql` 只建立：

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

索引至少覆盖 active fields updated、state field/kind、objects/relations field、activities field/created、snapshots field/device/created。

## 11. Identity 与 path

- Domain ID 使用 UUIDv7 string；
- time 使用 UTC Unix ms；
- Device ID 由 Platform Adapter 保存在 installation-local config，再 upsert DB；
- local path 属于 DeviceBinding；
- command.surface.save_snapshot 不接受 Renderer-supplied device_id；
- Domain 不读取 `%LOCALAPPDATA%` 或 Windows API。

Windows Adapter 提供 data/runtime/log/config paths。`FIELORA_DATA_DIR` 仅 tests/dev。

## 12. Field commands

### Create

Input：title、optional goal。

```text
validate
→ UUIDv7
→ transaction insert Field + FIELD_CREATED Activity
→ commit
→ event.field.changed(created)
```

### List

默认只返回 ACTIVE，字段为 id/title/goal/current_mode/current_focus/revision/updated_at，按 updated_at DESC。

### Get

返回 FieldView，不自动 dump 全部 State/Object/Activity。

### Update focus

Input：field_id、expected_revision、focus。SQL optimistic update 影响 0 行返回 conflict；Activity 与 Reality 同 transaction。

## 13. Surface Resume

Snapshot input 只有 field_id、layout、open_objects；Core 补 device_id 与 observed field revision。

Snapshot 不存 authoritative focus/mode。Resume Query 返回：

```text
current FieldView
+ latest current-device SurfaceSnapshot
```

陈旧 snapshot 不能覆盖 Field Reality。每 Field/Device 保留最近 10 条。

## 14. Minimal UI

三个 screen：Startup、Now、Field。

Now：列出 active Field、Create Field、空状态。Field：显示 name、goal、current focus，可更新 Focus、返回 Now。

创建成功依赖 Core response/event 后重新 Query，不做 optimistic fake Field。

普通 UI 不展示 SQLite、FIPC、Rust、schema 或 UUID 等技术细节。Developer Diagnostics 只在 dev 显示 Core health/protocol/schema/DB path/Core pid。

## 15. Root scripts

未来 Repo 至少提供：

```text
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm make:portable
pnpm test:packaged
pnpm verify:phase01
```

`pnpm dev` 自动 build/ensure debug Core 并启动 Electron，不要求开发者手动拼三个终端。

## 16. Automated Gate

### Static

```text
pnpm typecheck
pnpm lint
cargo fmt --all -- --check
contract regenerate + git diff --exit-code
```

### Unit

TS：FIPC parser、pending/deadline、exact trusted-origin/main-frame bridge validation、startup health、Now view state。

Rust：title/goal validation、UUID、create、focus revision/conflict、migration apply/idempotence/checksum、repository ordering、snapshot truth separation。

```text
cargo test --workspace
```

### Rust Clippy/Release

```text
cargo clippy --workspace --all-targets -- -D warnings
cargo build --release -p fielora-core
```

### Integration

- real SQLite file close/reopen；
- spawn real Core，hello/create/list/shutdown/restart/list；
- close parent stdin without `system.shutdown`，Core 在 2 秒内退出且没有 orphan；
- invalid UTF-8/JSON、oversized frame、unknown method、wrong protocol major；
- commit-before-event invariant。

### Desktop E2E

- launch real Electron；
- create `Phase 01 Test`；
- update focus `Persistence`；
- close/relaunch；
- Field exists and focus is `Persistence`；
- kill Core；UI unavailable → restart → health restored → Field remains。
- trusted app main frame bridge works；remote/wrong-origin/subframe bridge is denied。

不 Mock Core。

## 17. Packaging

Phase 01 必须生成：

```text
artifacts/phase01/
├─ Fielora-V0.1-Phase01-win-x64.zip
├─ TEST_REPORT.md
├─ BUILD_INFO.json
└─ KNOWN_ISSUES.md
```

Release Core 固定复制到 packaged resource，由 CorePathResolver 解析。Packaged Smoke 必须证明没有使用 dev target/current working directory。

Phase 01 Installer 不是硬 Gate；Portable 是硬 Gate。Installer 固定在 Phase 03、Phase 08、Final Alpha 验证。

## 18. Human Experience Gate

人工只检查：可直接启动、无信息白屏、Core startup稳定、创建 Field 自然、重启恢复、错误可理解、UI 未暴露架构噪声。

Human Gate 未确认时，最多报告：

```text
ENGINEERING PASS
WAITING HUMAN ACCEPTANCE
```

不得报告 Phase Complete。

## 19. 实现顺序

1. Repo Bootstrap / toolchain；
2. Rust FIPC hello/shutdown；
3. Electron secure Startup + Core lifecycle；
4. Platform paths/device identity + SQLite migration；
5. Field Domain/ports；
6. SQLite repository/transactions/Activity；
7. Field FIPC/events；
8. React Now/Field；
9. Snapshot/Resume；
10. automated gates；
11. Portable package；
12. Packaged Smoke；
13. pause for Human Review。

每一步先跑相关测试，再进入下一步。

## 20. 禁止自行增加

Phase 01 不自行增加 Tailwind、Redux/Zustand、React Query、GraphQL、Prisma/Drizzle/SQLx、Tauri、Next/Nest、Docker、Cloud backend、Telemetry SaaS、Sentry、OpenAI SDK、MCP、OpenCode、Monaco 或复杂 task runner。

React local state 与简单 CSS Modules 足够。真实不可避免的新增依赖必须先获得用户批准。

## 21. Definition of Done

全部成立才进入 Human Gate：

- Repo/remote/branch/commit/dirty state 确认；
- toolchain/lockfiles fixed；
- Electron secure startup；
- real Rust Core lifecycle/handshake/restart/shutdown；
- SQLite migration/PRAGMA/checksum；
- principals/device identity；
- Field create/list/get/update focus + revision conflict + Activity；
- Snapshot + packaged restart Resume；
- Rust/TS generated contract drift gate；
- Static、Unit、Clippy/Release、Integration、Desktop E2E PASS；
- Portable ZIP + Packaged Smoke PASS；
- Build Info/Test Report/Known Issues complete。

最终演示很小：创建 `Fielora / Build V0.1`，Focus 设为 `Architecture`，关闭，打开，Field 与 Focus 仍存在。但底层必须真实经过 Electron、FIPC、Rust、Domain、SQLite、Activity、Revision、Device、Snapshot、Packaging 和 Recovery。

## 22. 当前状态

```text
TECHNICAL_ARCHITECTURE_FROZEN
CORE_CONTRACTS_FROZEN
PHASE_01_SCHEMA_FROZEN
REMOTE_REPO_CONFIRMED_EMPTY
CANONICAL_LOCAL_WORKTREE_CONFIRMED
REPO_BOOTSTRAP_COMPLETE
TOOLCHAIN_GATE_PASS
IMPLEMENTATION_NOT_AUTHORIZED
IMPLEMENTATION_NOT_STARTED
```
