# Fielora V0.1 Technical Architecture Review Report

> 历史 Review 记录：以下 Gate 状态描述 2026-08-13 architecture review 当时的事实。当前状态以 `docs/context/02_PROJECT_REALITY.md` 与 `artifacts/phase01/PHASE_01_CLOSEOUT_REPORT.md` 为准；Phase 01 已于 2026-08-14 裁决 COMPLETE。

状态：CLOSED / APPROVED WITH REQUIRED FREEZE AMENDMENTS  
日期：2026-08-13  
结论：Architecture / Contracts / Schema 已冻结，Phase 01 Spec READY；实现仍受 `LOCAL_WORKTREE_NOT_CONFIRMED` 阻塞

## 1. 输入审计

本轮完整通读 6 份附件：

1. Phase 01 Implementation Specification（3153 行）；
2. Core Contracts：DevelopmentTask / CodingAgentProvider；
3. Core Contracts：Capability / Result / Policy / Evidence / Verification；
4. Core Contracts：CapabilityAcquisition / Mandate；
5. Phase 01 Implementation Specification 的重复附件；
6. Core Contract 收敛审计与 Schema Freeze。

两份 Phase 01 附件 SHA-256 均为：

```text
d4ffb311d29ce7da7da8fc296134bb9c5f4159b12b36a125b76776d1371ffda6
```

因此它们是逐字相同的副本，没有当作两个版本合并。

同时复核了已确认的 Project Reality、Baseline Freeze、Technical Baseline 与 Test/Delivery Baseline。优先级仍是最新用户裁决与当前 Reality 高于附件 Draft。

## 2. 评审产物

本轮生成以下 Candidate 文档：

1. `docs/architecture/TECHNICAL_ARCHITECTURE_V0.1.md`
2. `docs/architecture/CORE_CONTRACTS_V0.1.md`
3. `docs/architecture/SCHEMA_FREEZE_V0.1.md`
4. `docs/architecture/PHASE_01_IMPLEMENTATION_SPEC_V0.1.md`
5. `docs/architecture/TECHNICAL_ARCHITECTURE_REVIEW_REPORT_V0.1.md`

它们都明确标记为等待确认，没有写产品代码、安装依赖、初始化 workspace 或执行 `git init`。

## 3. 总体评价

附件 Draft 的核心架构方向正确：

- Rust Core 拥有 Field Reality；
- Electron 是受控 Host/Adapter；
- Field State 与 Activity 分离；
- DevelopmentTask 与 CodingSession 分离；
- CodingAgentProvider 与 Model Provider 分离；
- Capability、Policy、Result、Evidence、Verification 分层；
- Project/Object identity 与 Device path 分离；
- Domain 完整但 schema 分 Phase 增长；
- Phase 01 用最小纵向闭环验证架构，而不是先堆完整产品。

若把所有 Draft 原样实现，也会出现两个问题：一是 Capability Acquisition/Mandate 把 V0.1 推向通用 Agent OS；二是若干协议和事实源细节在实现时会形成真实 bug。Candidate 已在不破坏核心方向的前提下收敛和修正。

## 4. 接受的决定

### A-001 进程边界

接受 Electron Main + sandboxed Renderer + Rust Sidecar。Electron Main 负责 desktop/browser lifecycle，Rust Core 负责 Field/State/Evidence/Persistence truth。

### A-002 Monorepo 与依赖方向

接受 pnpm/Cargo 单 Repo、`fielora-core/contracts/field/storage/platform` 五个 Phase 01 crate，以及不创建未来空目录森林。

### A-003 SQLite

接受 SQLite + rusqlite bundled、Core 单写入者、单 Storage Worker、embedded migration、WAL/FK/FULL gate。

### A-004 FIPC transport

接受 child stdin/stdout + bounded UTF-8 JSON Lines、4 MiB 上限、stdout protocol only、ResourceRef 传大对象。

### A-005 Stable model primitives

接受 UUIDv7、UTC Unix milliseconds、optimistic revision、Principal/Device/DeviceBinding、append-only Activity 与 post-commit Event。

### A-006 Contract separation

接受 FIPC DTO、Domain Command/Aggregate、Persistence Row 分离；Rust 仅生成跨 FIPC TypeScript DTO。

### A-007 Phase 01 vertical slice

接受 Create/List/Get/Update Focus、Surface Snapshot、packaged restart Resume 作为第一条真实闭环。

### A-008 Development/Execution semantics

接受 DevelopmentTask/CodingSession、Capability/Policy/Result、Evidence/Verification 的语义分层，以及所有 PASS 必须有 Evidence。

## 5. 修订后接受的决定

### R-001 FIPC Error Contract

Draft 使用 `"jsonrpc":"2.0"`，但把字符串放进 `error.code`。JSON-RPC 2.0 要求 error code 是 integer。

修订：使用标准/保留 integer code；稳定业务 code 放到 `error.data.code`。UI 读取 `data.code`，不解析 message。

### R-002 Startup Window 顺序

Draft 一处写“hello success 后创建窗口”，另一处要求 handshake timeout 时显示 Startup Error UI。若窗口尚未创建，无法满足后者。

修订：先创建 secure local Startup Window，再 spawn/hello；成功进入 Now，失败在同一窗口显示可恢复错误。

### R-003 Device Identity

Draft 只把 Device UUID 保存到 DB。未来复制/同步 DB 时，另一设备可能复用原 device identity。

修订：Device UUID 由 Platform Adapter 保存在 installation-local config，再 upsert DB。DB row 是 device metadata/participation record，不是唯一 identity source。

### R-004 Snapshot 与 Field Truth

Draft 同时把 current focus/mode 写入 Field 和 SurfaceSnapshot，可能产生双事实源。

修订：Field 保存 authoritative current focus/mode；Snapshot 保存 observed field revision + layout/open objects。Resume 合并二者，陈旧 Snapshot 不覆盖较新 Field Reality。

### R-005 Snapshot device authority

Draft command 接受 Renderer 传入 device_id，允许客户端把 Snapshot 写到错误设备绑定。

修订：Renderer 不传 device_id；Core 通过当前 Platform Adapter DeviceIdentity 决定。

### R-006 Migration metadata

Draft 让 `0001_core.sql` 创建 `schema_migrations`，但 runner 在应用 0001 前需要知道已应用版本和 checksum。

修订：runner 以固定 DDL bootstrap metadata table；0001 只创建业务 core tables。已应用 migration checksum 变化必须失败。

### R-007 Electron security

Draft 已有 nodeIntegration/contextIsolation/sandbox，但缺少 navigation、new-window、permission、origin 和 CSP 边界。

修订：默认 deny new window/navigation/permissions，严格 sender/top-frame/origin validation 与 production CSP；后续 Browser Runtime 通过明确 capability 开放。

### R-008 Core restart

Draft 提出自动 restart，但没有明确 interrupted command 行为。

修订：reject pending、禁止自动重放 Command、restart 后重新 Query/Reconcile。未来非幂等 external operation 使用 UnknownOutcome。

### R-009 工具链版本

接受主版本方向。最终 Freeze Amendment 将精确值定为 Electron 43.4.0、Node 24.18.1 LTS、pnpm 11.21.0、Rust 1.97.1、rusqlite 0.40.2 bundled。Forge/React/ts-rs 等 exact package 由首个真实 Repo lockfile 固定。

## 6. 范围裁决

### 6.1 Capability Acquisition / Mandate

附件 Draft 把 Capability Acquisition Minimal 和 Deploy Website Mandate Prototype 写为 V0.1 implementation。当前 Baseline Freeze 的 P0 只要求：

```text
Capability Connector Contract
+
一个最小真实 Generic MCP Connector
```

而且明确把 Capability Compiler 自动化、完整人生管理和 Steward 自动协作延后。

因此 Candidate 的裁决是：

- 保留 Acquisition/Mandate 语义 Draft，避免未来重造权限/执行体系；
- 不把它们写入当前 V0.1 P0 phase gate；
- 不建 `capability_acquisitions` / `mandates` table；
- 不做 Deploy Website Mandate UI/Runtime；
- Phase 09 只交付 Generic MCP Connector 的真实 `Contract → Call → Result → Evidence`；
- 未来若用户明确扩 P0，再用独立 Baseline Change 恢复 Prototype。

这关闭了“Contract 能表达”与“V0.1 必须实现”之间的范围漂移。

### 6.2 Exchange

保留 Principal、owner、actor、access envelope 与 provenance 语义。V0.1 默认 local private，不建立 remote user、messages、field invites、ACL、sync 或 network service。

### 6.3 Cross-platform

Windows 11 x64 是唯一正式验收平台。Core/Contracts/UI semantics OS-neutral；Windows paths、process、PTY、credentials 等进入 Platform Adapter。V0.1 不增加 macOS/Linux delivery gate。

## 7. Schema Freeze 结论

### Phase 01 精确冻结

`schema_migrations` 由 runner bootstrap；Migration 0001 精确冻结：

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

列、CHECK、FK、indexes、revision 和 Snapshot truth rule 已写入独立 Schema Candidate。

### Later Phase 只冻结职责

后续 tables 的名称、职责、加入 Phase 已冻结；精确 columns/constraints 在对应 Phase 开工前冻结。这样避免 Phase 01 一次创建二十余张未使用表，也避免现在把高变 JSON 设计伪装成最终 schema。

### 明确不建

Full Event Sourcing、万能 Resource EAV、通用 Workflow、accounts/remote users/Exchange tables、ACL/role system、Marketplace/reputation/license registry、sync/cloud/multi-agent、Acquisition/Mandate physical tables。

## 8. V0.1 Phase Map

1. Core vertical slice：Repo/Desktop/Rust/SQLite/FIPC/thin Field Resume；
2. Field State/Activity/DXE primitives/richer Resume；
3. Shell/Now/Browse Runtime；
4. Summon/Context Chips/Capture/Inbox/Multi-LLM foundation；
5. Requirement/Existing Project Takeover/Project Reality；
6. DevelopmentTask/CodingSession/Basic Code Workspace/Git Diff/Provider spike；
7. AI-first Development/Terminal/Run；
8. Verification/Evidence/Browser Preview；
9. Generic MCP Connector；
10. Library/security/polish/Packaged Alpha。

这张 Phase Map 覆盖 Baseline P0，没有新增 Mandate 或 Acquisition 范围。

## 9. Phase 01 Blocking Decisions

用户已确认四份 Candidate。架构层只剩一个外部硬阻塞：

```text
LOCAL_WORKTREE_NOT_CONFIRMED
```

Remote Repo 已确认存在且为空。开始代码前仍必须确认真正 Local Worktree、remote、branch、commit/empty-repo state、dirty files，并把 Context Pack 放入 Repo。当前目录继续禁止 `git init`。

用户已一并确认：

1. Installer cadence：Phase 03、Phase 08、Final Alpha；
2. 精确工具链基线：Electron 43.4.0 / Node 24.18.1 / pnpm 11.21.0 / Rust 1.97.1 / rusqlite 0.40.2 bundled；
3. Production trusted local app origin 为 `fielora://app`，dev 只接受当次精确 Forge loopback origin；
4. Rust Sidecar 在 parent-pipe EOF 后有界退出，不留 orphan。

## 10. Non-blocking Later-Phase Decisions

- Electron tab/webContents Browser model；
- Editor implementation；
- LSP host boundary；
- terminal PTY / Platform Adapter；
- OpenCode Deep Adapter viability 与 ACP spike；
- Generic MCP protocol scope、stdio/network transport、auth/discovery/cancel；
- Provider credential vault；
- Evidence artifact store/retention/encryption；
- updater、code signing、final Installer technology；
- future sync/Exchange ID/access semantics；
- Acquisition/Mandate 是否进入后续版本。

这些不得被 Phase 01 随意实现成深耦合事实。

## 11. 新增冲突

没有新增硬冲突。

需要保持可见的三组边界张力：

1. `Windows Acceptance` 不等于 `Windows-bound Core`；
2. `Contract semantic reserve` 不等于 `P0 physical implementation`；
3. `Snapshot resume state` 不等于 `Field Reality`。

## 12. Toolchain 事实来源

- Electron 43.4.0 official release：`https://github.com/electron/electron/releases/tag/v43.4.0`
- Electron stable release table：`https://releases.electronjs.org/release?channel=stable`
- Node.js release status/archive：`https://nodejs.org/en/about/previous-releases`、`https://nodejs.org/en/download/archive/v24`
- Rust 1.97.1：`https://blog.rust-lang.org/2026/07/16/Rust-1.97.1/`
- pnpm 11.21.0：`https://github.com/pnpm/pnpm/releases/tag/v11.21.0`
- pnpm security lower bound：`https://github.com/pnpm/pnpm/security/advisories/GHSA-3qhv-2rgh-x77r`
- rusqlite 0.40.2：`https://crates.io/crates/rusqlite/0.40.2`

## 13. 建议裁决

用户最终裁决：

```text
Technical Architecture: APPROVED FOR FREEZE
Core Contracts: APPROVED FOR FREEZE
Phase 01 Schema: APPROVED FOR FREEZE
Phase 01 Implementation Spec: READY
Remote Repo: CONFIRMED EMPTY
Local Worktree: NOT CONFIRMED
Implementation: NOT STARTED
```

四份冻结文档已经进入 `context_manifest.required_reading`，Project Reality / Decisions / Baselines 已同步。该 Review Report 保留评审历史；冻结后的规范是实现事实源。
