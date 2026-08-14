# Fielora Phase 02 Freeze Candidate

状态：CANDIDATE / NOT FROZEN / IMPLEMENTATION NOT AUTHORIZED

版本：V0.1

日期：2026-08-14

基线：`main@65a8751873deb8ef395286e06d62a9489462629f`

本文件只关闭 Phase 02 的设计候选，不修改既有 Frozen Architecture、Core Contracts 或 Migration 0001，不授权创建 Migration 0002 产品文件、修改 Rust/TypeScript 产品实现、增加依赖或开始 Phase 02。

精确 Contract DTO/FIPC surface 见 `PHASE_02_CONTRACT_DELTA_CANDIDATE_V0.1.md`；精确物理增量见 `PHASE_02_MIGRATION_0002_CANDIDATE_V0.1.md`。

## 1. Candidate verdict

Phase 02 只建立以下真实闭环：

```text
Field Reality aggregate
  → State lifecycle
  → REFERENCE Object
  → bounded lineage
  → append-only Activity
  → constrained SurfaceLayoutV1
  → per-device Snapshot
  → deterministic richer Resume
```

Phase 02 不创建通用资源平台、知识图谱、自由布局引擎、个人记忆或 AI/Browse runtime。

## 2. 实现前五问

1. 真实问题：Phase 01 只能恢复 Field 与一段 focus；用户无法保存“现在什么是真的”、未解决事项、来源关系和可继续的工作现场。
2. 所属层：全部属于 Field；不属于 Now、Browse 或全局 Library。
3. 依据：Technical Architecture Phase Map 的 `Field State + Activity + DXE primitives + richer Resume`，以及 Core Contracts 的 State/Object/Relation/Activity/Snapshot 分离。
4. V0.1：是；但只实现本文件的 Phase 02 子集。
5. 否决项：不得形成永久 State Dashboard、永久 Activity 面板、任意 Generative UI、通用知识图谱或 AI Sidebar。

## 3. 精确范围

### 3.1 In scope

- `fields.revision` 成为 Field Reality aggregate revision；
- Field Mode 与 typed Field Focus 的真实 mutation；
- FACT / DECISION / ASSUMPTION / QUESTION / TASK / BLOCKER / RESULT State；
- State create、revise、resolve/reopen、retract、atomic supersede；
- ObjectKind 只开放 `REFERENCE`；
- REFERENCE create、revise、archive；
- 只保留 `SOURCED_FROM` 与 `SUPERSEDED_BY` 两种 lineage；
- Reality mutation 与一条 Activity 同 transaction；
- Activity keyset pagination 与按需 Inspector；
- `SurfaceLayoutV1` 固定模板、TaskPane、ReferencePane；
- Snapshot V1 保存、Phase 01 legacy snapshot fallback；
- deterministic richer Resume；
- Migration 0002 与 migration registry 的顺序/checksum 支持；
- Phase 01 全部 regression gates。

### 3.2 Explicitly out of scope

- Personal Memory、长期偏好、用户画像、跨 Field memory；
- Agent principal 的运行时使用、Agent activity state、orchestration；
- LLM provider、prompt、model selection、AI recommendation；
- Browser/WebPane、页面获取、网页摘要、外部变化检测；
- Summon、Context Chips、Capture、Inbox；
- Requirement、Project Reality、Existing Project Takeover；
- File/Code/Terminal/Preview/Build/Test/Verify/Evidence；
- Capability、MCP、Connector、credentials；
- Library、sync、cloud、sharing；
- arbitrary ObjectKind、arbitrary Relation、arbitrary pane、arbitrary metadata/layout JSON。

0001 中预留的 `principals.kind = AGENT` 不构成 Phase 02 Agent 能力。Phase 02 command actor 只允许当前 `LOCAL_USER`；storage maintenance 可使用 `SYSTEM`，但不生成业务 Activity。

## 4. Field Reality aggregate revision

`fields.revision` 是整个 Field Reality 的单调 aggregate revision，不再只表示 `fields` row 本身。

以下成功 mutation 各递增一次且只递增一次：

- Field mode 更新；
- Field focus 更新或清除；
- State create/revise/status transition/supersede；
- REFERENCE create/revise/archive；
- source relation attach/retract。

以下不递增：

- query；
- Activity query；
- Surface snapshot save/retention；
- Resume 组合与 legacy layout fallback；
- process health、device last-seen、migration bookkeeping。

事务规则：Reality rows、对应 Activity 与 aggregate revision 在同一 SQLite transaction 中提交；Domain Event 只在 commit 成功后发布。失败、validation error、not found 或 optimistic conflict 不得改变 Reality、Activity、revision 或 event stream。

State/Object 使用各自 resource revision 做 targeted optimistic concurrency；Field mode/focus 使用 expected Field aggregate revision。创建新 resource 或 source relation时不要求客户端锁住整个 Field，但 storage 必须通过原子 `fields.revision = fields.revision + 1` 返回新的 aggregate revision。

## 5. State lifecycle

### 5.1 Stable enums

```text
FieldStateKind = FACT | DECISION | ASSUMPTION | QUESTION | TASK | BLOCKER | RESULT
StateStatus    = ACTIVE | RESOLVED | SUPERSEDED | RETRACTED
```

### 5.2 Creation and mutable fields

- create status 固定为 `ACTIVE`，revision 固定为 1；
- content trim 后 1–4000 Unicode scalar values；
- confidence 可空；非空时为 0.0–1.0 finite number；
- created_by 固定为当前 LOCAL_USER；
- source_activity_id 指向创建该 State 的 Activity，创建后不可变；
- revise 只替换完整 `content` 与完整 `confidence`，禁止 arbitrary patch；
- ACTIVE 或 RESOLVED 可 revise；SUPERSEDED/RETRACTED 为不可修改 terminal state；
- 每次 revise 使 State revision +1、Field aggregate revision +1。

### 5.3 Transition matrix

| From | To | Allowed kinds | Rule |
|---|---|---|---|
| ACTIVE | RESOLVED | QUESTION / TASK / BLOCKER | normal resolution |
| RESOLVED | ACTIVE | QUESTION / TASK / BLOCKER | explicit reopen |
| ACTIVE | RETRACTED | all | terminal correction/removal from current Reality |
| RESOLVED | RETRACTED | QUESTION / TASK / BLOCKER | terminal correction |
| ACTIVE | SUPERSEDED | all | only through atomic supersede |
| RESOLVED | SUPERSEDED | QUESTION / TASK / BLOCKER | only through atomic supersede |

其他 transition 全部拒绝。FACT/DECISION/ASSUMPTION/RESULT 不使用 RESOLVED。

Atomic supersede 必须在一个 command/transaction 中：创建同 kind replacement State、将旧 State 设为 SUPERSEDED、创建 `old STATE SUPERSEDED_BY replacement STATE` Relation、写一条 `STATE_SUPERSEDED` Activity，并使 Field aggregate revision 只增加一次。replacement status 为 ACTIVE。

replacement 的 source_activity_id 指向本次 `STATE_SUPERSEDED` Activity。若旧 State 是当前 typed focus，focus 在同一 transaction 中移动到 replacement；retract 当前 focused State 时在同一 transaction 清除 focus。两者都不额外增加 Field revision 或第二条 Activity。

State 永不物理删除。

## 6. REFERENCE Object

### 6.1 Object semantics

Phase 02：

```text
ObjectKind      = REFERENCE
ReferenceType   = HTTPS_URL
ObjectLifecycle = ACTIVE | ARCHIVED
```

REFERENCE 只是当前 Field 的稳定 membership/reference，不是网页快照、Browser Tab、Document、Capture、Library Object、Evidence 或 Memory。

### 6.2 Exact constraints

- Object identity 使用 UUIDv7；URL 不是 identity；
- owner/created_by 固定为当前 LOCAL_USER；Phase 02 Domain AccessEnvelope 固定为 local-private/owner-only，不新增 ACL column；provenance 由 created_by + source_activity_id 表达；
- title trim 后 1–120 Unicode scalar values；
- `external_ref_type` 固定为 `HTTPS_URL`；
- URL 必须为绝对 HTTPS URL，序列化后最多 2048 bytes；
- 禁止 username/password；scheme/host lowercase、移除默认 443 port、空 path 规范为 `/`，保留 path/query/fragment；
- Phase 02 不 fetch、不 navigate、不 preview URL；UI 只显示与复制；
- metadata 必须为 canonical `{}`，Phase 02 不暴露 metadata write；
- create 为 ACTIVE/revision 1；
- source_activity_id 指向同 transaction 的 `REFERENCE_CREATED` Activity，创建后不可变；
- revise 可完整替换 title 与 URL，仅 ACTIVE 可 revise；
- archive 为 ACTIVE → ARCHIVED，terminal；
- 同一 Field 中不允许两个 ACTIVE REFERENCE 指向同一 canonical URL；
- archived reference 可以被历史 Activity/Relation 引用，但不能新建 source relation，也不能成为可恢复 open object。

Archive REFERENCE 必须在同一 transaction 中清除指向它的 typed focus，并将所有指向它的 ACTIVE SOURCED_FROM Relation 转为 RETRACTED（各 Relation revision +1）。整个 archive command 仍只写一条 `REFERENCE_ARCHIVED` Activity、只递增一次 Field aggregate revision；Activity summary 可记录受影响 relation count，不记录 URL。

REFERENCE 永不物理删除。本地 path、`file:`、`javascript:`、credential-bearing URL 和 opaque provider session ref 全部拒绝。

## 7. Bounded Relation

Phase 02 只冻结两种：

| Relation | From | To | Creation |
|---|---|---|---|
| SOURCED_FROM | STATE | active REFERENCE Object | explicit attach-source command |
| SUPERSEDED_BY | STATE | replacement STATE | atomic state-supersede command only |

共同约束：

- 两端必须存在并属于同一 Field；
- endpoint type 与 Relation matrix 必须在 Domain 校验；
- 不允许 self relation；
- 同一 active endpoint tuple 不得重复；
- Relation lifecycle 为 ACTIVE / RETRACTED，revision 从 1 开始；
- 只有 SOURCED_FROM 可通过显式 command 从 ACTIVE → RETRACTED；
- SUPERSEDED_BY 不可撤回，保持不可变 lineage；
- 不提供 generic `create_relation(type, metadata)`；
- 不提供 arbitrary `RELATED_TO`、tag edge、graph traversal 或 knowledge inference；
- Relation 不物理删除。

## 8. Activity

Activity append-only，只回答“发生了什么”，不保存完整 before/after、command output、diff、Evidence、prompt 或完整 State content。

Phase 02 action allowlist：

```text
FIELD_CREATED
FIELD_FOCUS_UPDATED
FIELD_MODE_UPDATED
STATE_CREATED
STATE_REVISED
STATE_STATUS_CHANGED
STATE_SUPERSEDED
REFERENCE_CREATED
REFERENCE_REVISED
REFERENCE_ARCHIVED
REFERENCE_SOURCE_ATTACHED
REFERENCE_SOURCE_RETRACTED
```

- actor 只允许当前 LOCAL_USER；
- intent 固定存为 NULL；Phase 02 没有 IDR/Agent intent input；
- target 使用 typed ResourceRef；
- summary 最多 240 Unicode scalar values，只保留脱敏摘要；
- trace_id 继续使用 FIPC request trace；
- list order 固定为 `(created_at DESC, id DESC)`；
- default limit 50，minimum 1，maximum 100；
- cursor 为上一页最后一项的 `(created_at, ActivityId)`，不使用 offset pagination；
- Snapshot、Resume、retention cleanup 不生成业务 Activity。

## 9. Constrained DXE / SurfaceLayoutV1

Phase 02 不实现自由布局、坐标、像素大小、任意百分比或用户生成 pane schema。

### 9.1 Available primitives

```text
TASK_PANE
REFERENCE_PANE
```

- TASK_PANE 绑定当前 Field 的 TASK State collection；
- REFERENCE_PANE 必须绑定同一 Field 的一个 ACTIVE REFERENCE Object；
- State/Activity 的其他信息通过按需 Context Inspector 显示，不是常驻 pane；
- V0.1 列出的 Web/Document/Code/Terminal/Preview/Requirement/Table/Media/Evidence/Conversation/ExternalApp Pane 在 Phase 02 不可实例化。

### 9.2 Fixed templates

```text
PRIMARY_ONLY
PRIMARY_SUPPORT_RIGHT
PRIMARY_TWO_SUPPORTS_RIGHT
```

- exactly one primary；
- supporting 数量必须与 template 匹配，最多两个；
- right support column 使用固定 72/28 宽度；two-supports 在右栏固定上下等分；
- primary 不可 collapsed；supporting 可 collapsed；
- pane id 必须唯一；focused pane 必须存在且未 collapsed；
- 同一 REFERENCE Object 在一个 layout 中最多出现一次；
- select/arrange/resize 被约束为切换上述 template；focus/collapse/replace 只能修改 typed slot state；
- 无 arbitrary style、component name、HTML、React、script 或 JSON settings。

Snapshot V1 request 只提交 typed layout；`open_objects_json` 由 REFERENCE_PANE bindings 推导，客户端不得单独提交以免分叉。

PaneId 是 layout-local presentation identity，不是 Domain Object identity：trim 后 1–64 ASCII characters，只允许 `[a-z0-9_-]`。新 pane 使用 `pane_<uuidv7>`；默认/legacy fallback 必须使用固定 `primary_task`，保证无 snapshot 时 Resume 结果确定。

默认 layout 精确为：`version=1`、`PRIMARY_ONLY`、primary=`TASK_PANE/FIELD_TASKS/primary_task/not collapsed`、focused=`primary_task`、supporting empty。

## 10. Phase 01 compatibility

- FIPC/1 JSON-RPC framing、NDJSON、hello、deadline、trace、error envelope、supervision 与 security boundary 保持不变；
- `ProtocolVersion { major: 1, minor: 0 }` 保持不变；additive methods 只通过 hello capabilities 宣告；
- Phase 01 methods 保留；新的 renderer 不再写任意 layout/open_objects；
- Phase 01 arbitrary focus command 只允许继续写 trim 后 1–120 scalar 的 legacy text，不再接受 object/array/number/bool；
- Phase 02 新增 typed focus command；
- `current_focus_json` 的 exact tagged V1 object 解码为 typed focus；bounded JSON string 解码为 legacy text；其他历史 payload 标记 `INVALID_IGNORED` 并在 Resume 中当作无 focus，读取不得自动改写 DB；
- 旧 snapshot 只在 exact Phase 01 shape `{"primary":"FIELD","supporting":[]}` 且 `open_objects=[]` 时视为 legacy；
- legacy snapshot 在 Resume 时映射为默认 `PRIMARY_ONLY + TASK_PANE`，标记 `LEGACY_PHASE01_FALLBACK`，不得在读取时覆写 DB；下一次用户保存才写 V1 snapshot；
- 其他未知/无效 snapshot 被忽略并标记 `INVALID_IGNORED`，不得导致 Core 或 UI 启动失败。

## 11. Deterministic richer Resume

Resume 必须在一个一致性 read transaction 中组合：

- authoritative Field view 与 aggregate revision；
- typed/legacy current focus；
- current device 最新 snapshot；
- validated SurfaceLayoutV1；
- 最多 5 条 ACTIVE BLOCKER、5 条 ACTIVE QUESTION、5 条 ACTIVE TASK，每组按 `(updated_at DESC, id DESC)`；
- last Activity；
- unavailable archived/missing object ids；
- structured continuation target；
- `external_changes = NOT_EVALUATED_PHASE_02`。

Snapshot freshness：

```text
NONE     = no snapshot
CURRENT  = observed_field_revision == current field revision
STALE    = observed_field_revision < current field revision
INVALID  = observed_field_revision > current field revision or invalid payload
```

STALE layout 可以作为 presentation hint 使用，但 State/Object/Relation/Mode/Focus 永远来自当前 Reality；snapshot 不能覆盖 authoritative rows。

Continuation priority 固定为：

1. valid typed current focus；
2. valid legacy text focus；
3. newest ACTIVE BLOCKER；
4. newest ACTIVE QUESTION；
5. newest ACTIVE TASK；
6. last Activity target（目标仍存在时）；
7. FIELD_OVERVIEW。

Core 只返回 structured `reason + target`，不生成自然语言推荐，不调用 LLM。Renderer 负责固定文案。

## 12. Security boundaries

- Renderer 只能通过 preload exact allowlist 调用新增 methods；
- Main 继续校验 expected webContents、main frame、exact origin、channel 与 payload shape；
- Core 对 enum、UUIDv7、length、URL、relation matrix、ownership、revision、layout 全部重验；
- Phase 02 不增加 network dependency，不发起 HTTP，不创建 Browser WebContents；
- URL 只作为 inert reference；
- Activity/log 不记录完整 State、URL query secrets、credentials、FIPC params 或 snapshot JSON；
- metadata/layout 不成为万能 JSON/EAV 扩展点；
- 不增加 secret store、provider adapter、agent runtime 或 memory table。

## 13. Acceptance Gate candidate

### 13.1 Freeze Gate

- 本文件、Contract Delta、Migration 0002 三份 candidate 经用户裁决 FROZEN/APPROVED；
- Frozen Core Contracts/Schema/Architecture 同步后 manifest 逐项通过；
- 另有明确 Phase 02 Implementation Authorization。

### 13.2 Static / Domain

- Rust fmt/clippy/test、TS typecheck/lint/test、generated contracts drift 全 PASS；
- State transition matrix、terminal state、same-kind supersede；
- URL canonicalization/credential rejection/duplicate active reference；
- relation endpoint existence/same Field/type matrix/no duplicate；
- layout template/pane/focus/collapse/reference validation；
- resource revision 与 Field aggregate revision 精确断言。

### 13.3 Transaction / Migration

- fresh DB 0→1→2；真实 Phase 01 DB 1→2；重复 restart 幂等；
- 0001 checksum 保持不变；0002 checksum mismatch 阻止启动；
- incompatible legacy rows 使 migration 整体回滚并返回明确错误，不静默改写；
- 每个 Reality command 证明 Reality + Activity + Field revision atomic；
- 失败 command 无 Activity/revision/event；event 只在 commit 后；
- schema validation 检查 columns、CHECK、indexes，不只检查 table 名。

### 13.4 FIPC / Desktop

- FIPC/1 transport compatibility、hello capabilities、unknown method、malformed params、deadline、parent EOF、Core restart；
- Activity keyset pagination 无重复/遗漏；
- on-demand Inspector，不出现永久 State/Activity/AI sidebar；
- 一个 primary、最多两个 supporting，不能构造自由布局；
- no network request、no Browser、no Agent/LLM symbols/dependencies/runtime paths。

### 13.5 Real packaged restart/resume

使用真实 packaged executable、真实 Rust sidecar 与真实 SQLite：

1. 创建 Field；
2. 创建 TASK、QUESTION、BLOCKER；
3. resolve/reopen、revise、supersede State；
4. 创建 HTTPS REFERENCE 并 attach source；
5. 设置 typed focus/mode；
6. 保存 TaskPane + ReferencePane V1 layout；
7. 完全退出 packaged app；
8. 再启动并核验 Field revision、State、Relation、Activity、layout、open reference、continuation target；
9. 在 snapshot 后改变 Reality，证明 Resume 标记 STALE 且旧 snapshot 不覆盖新 Reality；
10. archive open reference，证明 Resume 安全降级并报告 unavailable；
11. kill Core 后自动恢复，数据仍一致。

不得以 mock、in-memory repository、fixture DB 或仅 development mode 代替。

## 14. Candidate close conditions

本 candidate 已给出可冻结的语义，不存在需要扩大 Phase 的设计缺口。进入正式 Freeze 前只剩以下审核动作：

1. 用户确认 HTTPS-only REFERENCE 是否满足 Phase 02；
2. 用户确认 State content 4000、Activity summary 240、Resume 每组 5 条的上限；
3. 用户确认固定 72/28 右栏模板，不开放其他 density；
4. 执行 schema migration SQL 的 SQLite parser/probe 属于 Implementation Authorization 后的工作，本轮不运行产品 migration。

`set_focus_v1`、`save_snapshot_v1`、`resume_v1` 方法名在本 Candidate 中已经关闭，不再作为实现期选择。若上述 1–3 被否决，返回设计修订；不允许在实现中自行选择。除此之外未发现 Frozen Spec conflict。
