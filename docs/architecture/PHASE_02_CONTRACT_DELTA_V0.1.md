# Fielora V0.1 Phase 02 Contract Delta

状态：FROZEN / APPROVED / IMPLEMENTATION NOT AUTHORIZED / IMPLEMENTATION NOT STARTED

版本：V0.1

日期：2026-08-14

设计基线：`main@65a8751873deb8ef395286e06d62a9489462629f`

Freeze 裁决：用户于 2026-08-14 正式裁决 `PHASE_02: APPROVED_FOR_FREEZE`，并同时明确 `PHASE_02_IMPLEMENTATION_AUTHORIZED: NO`。

本文件是 `CORE_CONTRACTS_V0.1.md` 的正式 Frozen Phase 02 增量。现有 FIPC/1 transport、JSON-RPC/NDJSON framing、hello、deadline、trace、error envelope 与 Electron security boundary 不变。以下代码块冻结 wire semantics，不是产品代码，也不授权修改 Rust/TypeScript 实现。

## 1. Typed IDs and enums

```rust
typed_id!(StateId);
typed_id!(ActivityId);
typed_id!(RelationId);
typed_id!(PaneId);

enum FieldStateKind {
    Fact, Decision, Assumption, Question, Task, Blocker, Result,
}

enum StateStatus { Active, Resolved, Superseded, Retracted }
enum ObjectKind { Reference }
enum ReferenceType { HttpsUrl }
enum ObjectLifecycle { Active, Archived }
enum RelationType { SourcedFrom, SupersededBy }
enum RelationLifecycle { Active, Retracted }
enum ResourceType { Field, State, Object, Relation }
```

所有 enum 使用 `SCREAMING_SNAKE_CASE` stable wire name。

## 2. Field focus

```rust
enum FieldFocusV1 {
    State { state_id: StateId },
    Reference { object_id: ObjectId },
}

enum FocusSource {
    None,
    TypedV1,
    LegacyText,
    InvalidIgnored,
}

struct SetFieldFocusV1Request {
    field_id: FieldId,
    expected_field_revision: u64,
    focus: Option<FieldFocusV1>,
}

struct UpdateFieldModeRequest {
    field_id: FieldId,
    expected_field_revision: u64,
    mode: Option<FieldMode>,
}
```

Focus target 必须存在、属于 Field 且不是 terminal/archived。`None` 表示清除。Phase 01 `command.field.update_focus` 仅保留 bounded legacy text compatibility。

## 3. State DTOs

```rust
struct StateView {
    id: StateId,
    field_id: FieldId,
    kind: FieldStateKind,
    content: String,
    status: StateStatus,
    confidence: Option<f64>,
    created_by: PrincipalId,
    source_activity_id: ActivityId,
    revision: u64,
    created_at: i64,
    updated_at: i64,
}

struct CreateStateRequest {
    field_id: FieldId,
    kind: FieldStateKind,
    content: String,
    confidence: Option<f64>,
}

struct ReviseStateRequest {
    field_id: FieldId,
    state_id: StateId,
    expected_state_revision: u64,
    content: String,
    confidence: Option<f64>,
}

enum StateTransitionTarget { Active, Resolved, Retracted }

struct TransitionStateRequest {
    field_id: FieldId,
    state_id: StateId,
    expected_state_revision: u64,
    target: StateTransitionTarget,
}

struct SupersedeStateRequest {
    field_id: FieldId,
    state_id: StateId,
    expected_state_revision: u64,
    replacement_content: String,
    replacement_confidence: Option<f64>,
}

struct RealityMutationResult<T> {
    resource: T,
    field_revision: u64,
}

struct StateReferenceRequest {
    field_id: FieldId,
    state_id: StateId,
}

struct StateCursor {
    updated_at: i64,
    state_id: StateId,
}

struct ListStatesRequest {
    field_id: FieldId,
    kind: Option<FieldStateKind>,
    status: Option<StateStatus>,
    cursor: Option<StateCursor>,
    limit: Option<u16>,
}

struct SupersedeStateResult {
    previous: StateView,
    replacement: StateView,
    relation: RelationView,
    field_revision: u64,
}
```

Supersede result 还返回 replacement State 与 immutable SUPERSEDED_BY Relation。

若 superseded State 是 typed focus，result 中 Field 的 focus 已原子移动到 replacement。若 State transition 到 RETRACTED，指向它的 typed focus 已原子清除。replacement source_activity_id 指向本次 STATE_SUPERSEDED Activity。

State list filter 只允许：kind optional、status optional；默认按 `(updated_at DESC, id DESC)`。Default limit 50，maximum 100。Cursor 是 typed `{ updated_at, state_id }`。

## 4. REFERENCE DTOs

```rust
struct ReferenceView {
    id: ObjectId,
    field_id: FieldId,
    owner_principal_id: PrincipalId,
    created_by: PrincipalId,
    source_activity_id: ActivityId,
    kind: ObjectKind,                 // REFERENCE
    title: String,
    reference_type: ReferenceType,    // HTTPS_URL
    canonical_url: String,
    lifecycle: ObjectLifecycle,
    revision: u64,
    created_at: i64,
    updated_at: i64,
}

struct CreateReferenceRequest {
    field_id: FieldId,
    title: String,
    url: String,
}

struct ReviseReferenceRequest {
    field_id: FieldId,
    object_id: ObjectId,
    expected_object_revision: u64,
    title: String,
    url: String,
}

struct ArchiveReferenceRequest {
    field_id: FieldId,
    object_id: ObjectId,
    expected_object_revision: u64,
}

struct RestoreReferenceRequest {
    field_id: FieldId,
    object_id: ObjectId,
    expected_object_revision: u64,
}

struct ReferenceRequest {
    field_id: FieldId,
    object_id: ObjectId,
}

struct ReferenceCursor {
    updated_at: i64,
    object_id: ObjectId,
}

struct ListReferencesRequest {
    field_id: FieldId,
    lifecycle: Option<ObjectLifecycle>, // default ACTIVE
    cursor: Option<ReferenceCursor>,
    limit: Option<u16>,
}
```

不存在 generic Object create/update DTO，不接受 metadata、local path 或 browser state。

REFERENCE Domain aggregate 仍满足 Frozen FieldObject semantic contract：AccessEnvelope 在 Phase 02 固定投影为 local-private/owner-only，metadata 固定为空 canonical object，provenance 由 created_by + source_activity_id 构成。它们不是客户端可写字段。

Archive result 是 `RealityMutationResult<ReferenceView>`；它代表同一 transaction 已清除指向该 REFERENCE 的 typed focus，并 retract 全部 active SOURCED_FROM relations。不会返回或接受任意 cascade plan。

Restore result 是 `RealityMutationResult<ReferenceView>`。Restore 只执行 ARCHIVED → ACTIVE；若 canonical URL 与另一 ACTIVE REFERENCE 冲突则失败。它不恢复旧 focus 或旧 SOURCED_FROM Relation。

## 5. Bounded Relation DTOs

```rust
enum ResourceRef {
    Field { field_id: FieldId },
    State { state_id: StateId },
    Reference { object_id: ObjectId },
    Relation { relation_id: RelationId },
}

enum LineageEndpointRef {
    State { state_id: StateId },
    Reference { object_id: ObjectId },
}

struct RelationView {
    id: RelationId,
    field_id: FieldId,
    relation_type: RelationType,
    from: LineageEndpointRef,
    to: LineageEndpointRef,
    lifecycle: RelationLifecycle,
    created_by: PrincipalId,
    revision: u64,
    created_at: i64,
    updated_at: i64,
}

struct AttachReferenceSourceRequest {
    field_id: FieldId,
    state_id: StateId,
    reference_id: ObjectId,
}

struct RetractReferenceSourceRequest {
    field_id: FieldId,
    relation_id: RelationId,
    expected_relation_revision: u64,
}

struct RelationCursor {
    created_at: i64,
    relation_id: RelationId,
}

struct ListRelationsRequest {
    field_id: FieldId,
    relation_type: Option<RelationType>,
    lifecycle: Option<RelationLifecycle>, // default ACTIVE
    endpoint: Option<LineageEndpointRef>,
    cursor: Option<RelationCursor>,
    limit: Option<u16>,
}
```

不存在对外 generic Relation type 参数。SUPERSEDED_BY 只能由 State supersede command 产生。

State/Reference list 按 `(updated_at DESC, id DESC)`；Relation list 按 `(created_at DESC, id DESC)`。所有 list default limit 50、minimum 1、maximum 100，使用对应 typed cursor，不使用 offset。

## 6. Activity and pagination

```rust
enum ActivityAction {
    FieldCreated,
    FieldFocusUpdated,
    FieldModeUpdated,
    StateCreated,
    StateRevised,
    StateStatusChanged,
    StateSuperseded,
    ReferenceCreated,
    ReferenceRevised,
    ReferenceArchived,
    ReferenceRestored,
    ReferenceSourceAttached,
    ReferenceSourceRetracted,
}

struct ActivityView {
    id: ActivityId,
    field_id: Option<FieldId>,
    actor_principal_id: PrincipalId,
    action: ActivityAction,
    target: Option<ResourceRef>,
    summary: Option<String>,
    trace_id: TraceId,
    created_at: i64,
}

struct ActivityCursor {
    created_at: i64,
    activity_id: ActivityId,
}

struct ListActivitiesRequest {
    field_id: FieldId,
    cursor: Option<ActivityCursor>,
    limit: Option<u16>,
}

struct Page<T, C> {
    items: Vec<T>,
    next_cursor: Option<C>,
}
```

## 7. SurfaceLayoutV1

```rust
enum SurfaceTemplateV1 {
    PrimaryOnly,
    PrimarySupportRight,
    PrimaryTwoSupportsRight,
}

enum SurfacePrimitiveV1 { TaskPane, ReferencePane }

enum PaneBindingV1 {
    FieldTasks,
    Reference { object_id: ObjectId },
}

struct SurfacePaneV1 {
    pane_id: PaneId,
    primitive: SurfacePrimitiveV1,
    binding: PaneBindingV1,
    collapsed: bool,
}

struct SurfaceLayoutV1 {
    version: u8,                       // exactly 1
    template: SurfaceTemplateV1,
    primary: SurfacePaneV1,
    supporting: Vec<SurfacePaneV1>,   // exact count from template, max 2
    focused_pane_id: PaneId,
}

struct SaveSurfaceSnapshotV1Request {
    field_id: FieldId,
    layout: SurfaceLayoutV1,
}

struct SurfaceSnapshotV1View {
    id: SurfaceSnapshotId,
    field_id: FieldId,
    device_id: DeviceId,
    observed_field_revision: u64,
    layout: SurfaceLayoutV1,
    open_reference_ids: Vec<ObjectId>,
    created_at: i64,
}
```

Primitive/binding matrix：TASK_PANE 只能绑定 FIELD_TASKS；REFERENCE_PANE 只能绑定 REFERENCE。Primary 必须 `collapsed=false`。Template 与 supporting count：0/1/2 精确对应。一个 layout 最多一个 TASK_PANE/FIELD_TASKS；零 TASK State 的空 TaskPane 是合法默认状态，layout validation 不要求存在 TASK State，也不产生占位 Reality。

SurfaceLayoutV1 不包含 ratio/width/height/coordinates。Phase 02 renderer 可把 right-support template 默认显示为约 72/28、two-supports 默认上下等分，但该数值不得序列化进 layout_json、open_objects_json 或任何 durable Contract。

`FieldFocusV1`、`PaneBindingV1`、`ResourceRef`、`LineageEndpointRef`、`ContinuationTarget` 使用 internal tagged JSON：`kind` 是 SCREAMING_SNAKE_CASE discriminator，其余字段不得出现 unknown key。

PaneId 是 layout-local presentation identity，不适用 Domain UUIDv7 identity 规则。它必须为 1–64 ASCII characters，匹配 `^[a-z0-9_-]+$`；新 pane 采用 `pane_<uuidv7>`，默认 pane id 固定为 `primary_task`。

无 snapshot 与 Phase 01 legacy fallback 的 default layout 完全相同：

```text
version=1
template=PRIMARY_ONLY
primary=(primary_task, TASK_PANE, FIELD_TASKS, collapsed=false)
supporting=[]
focused_pane_id=primary_task
```

## 8. Deterministic richer Resume DTO

```rust
enum SnapshotFreshness { None, Current, Stale, Invalid }

enum LayoutSource {
    Default,
    SnapshotV1,
    LegacyPhase01Fallback,
    InvalidIgnored,
}

enum ExternalChangeAssessment { NotEvaluatedPhase02 }

struct ResumeStateItem {
    id: StateId,
    kind: FieldStateKind,
    content_excerpt: String, // max 240 scalar values
    revision: u64,
    updated_at: i64,
}

enum ContinuationReason {
    TypedFocus,
    LegacyTextFocus,
    ActiveBlocker,
    ActiveQuestion,
    ActiveTask,
    LastActivity,
    FieldOverview,
}

enum ContinuationTarget {
    State { state_id: StateId },
    Reference { object_id: ObjectId },
    LegacyText { label: String },
    FieldOverview,
}

struct ResumeContinuation {
    reason: ContinuationReason,
    target: ContinuationTarget,
}

struct FieldResumeV1View {
    field: FieldView,
    field_revision: u64,
    focus_source: FocusSource,
    typed_focus: Option<FieldFocusV1>,
    legacy_text_focus: Option<String>,
    snapshot_freshness: SnapshotFreshness,
    layout_source: LayoutSource,
    layout: SurfaceLayoutV1,
    open_reference_ids: Vec<ObjectId>,
    unavailable_reference_ids: Vec<ObjectId>,
    active_blockers: Vec<ResumeStateItem>,
    active_questions: Vec<ResumeStateItem>,
    active_tasks: Vec<ResumeStateItem>,
    last_activity: Option<ActivityView>,
    continuation: ResumeContinuation,
    external_changes: ExternalChangeAssessment,
}
```

每组 active item 最多 5 条。Resume read 不产生 Activity、Event 或 DB mutation。

## 9. FIPC/1 additive method surface

Transport protocol marker保持 `major=1, minor=0`。Hello capabilities 添加下列稳定 capability names：

```text
field.update_mode
field.set_focus_v1
state.create
state.get
state.list
state.revise
state.transition
state.supersede
reference.create
reference.get
reference.list
reference.revise
reference.archive
reference.restore
relation.attach_reference_source
relation.retract_reference_source
relation.list
activity.list
surface.save_snapshot_v1
field.resume_v1
```

对应 methods：

```text
command.field.update_mode
command.field.set_focus_v1
command.state.create
query.state.get
query.state.list
command.state.revise
command.state.transition
command.state.supersede
command.reference.create
query.reference.get
query.reference.list
command.reference.revise
command.reference.archive
command.reference.restore
command.relation.attach_reference_source
command.relation.retract_reference_source
query.relation.list
query.activity.list
command.surface.save_snapshot_v1
query.field.resume_v1
```

Additive method 不改变 frame、handshake 或 transport version。未知 capability 的客户端不得猜测调用。旧 method 只为 Phase 01 compatibility 保留，不成为 Phase 02 的 untyped extension point。

Result mapping 固定为：

| Method group | Result |
|---|---|
| field update mode/focus | `RealityMutationResult<FieldView>` |
| state create/revise/transition | `RealityMutationResult<StateView>` |
| state supersede | `SupersedeStateResult` |
| reference create/revise/archive/restore | `RealityMutationResult<ReferenceView>` |
| relation attach/retract | `RealityMutationResult<RelationView>` |
| state/reference/relation/activity list | typed `Page<View, Cursor>` |
| state/reference get | corresponding View |
| surface save snapshot v1 | `SurfaceSnapshotV1View` |
| field resume v1 | `FieldResumeV1View` |

Every Reality mutation result 的 `field_revision` 必须等于随后 post-commit event 的 revision。Query 不返回 speculative revision。

## 10. Domain event delta

继续使用单一 notification：

```rust
enum FieldChangeKind {
    Created,
    FocusUpdated,
    ModeUpdated,
    StateCreated,
    StateRevised,
    StateStatusChanged,
    StateSuperseded,
    ReferenceCreated,
    ReferenceRevised,
    ReferenceArchived,
    ReferenceRestored,
    ReferenceSourceAttached,
    ReferenceSourceRetracted,
}

struct FieldChangedEventV1 {
    event: String,          // exactly "event.field.changed"
    field_id: FieldId,
    change: FieldChangeKind,
    resource: Option<ResourceRef>,
    revision: u64,          // committed Field aggregate revision
    trace_id: TraceId,
}
```

现有 lower_snake_case wire values 可作为 enum 的 stable serialization，以保持 Phase 01 event compatibility；代码中不得继续使用任意 String。

## 11. Error delta

沿用现有 FIPC error envelope，新增 stable error codes：

```text
INVALID_STATE_TRANSITION
TERMINAL_RESOURCE
REVISION_CONFLICT
DUPLICATE_ACTIVE_REFERENCE
INVALID_REFERENCE_URL
INVALID_RELATION_ENDPOINT
INVALID_RELATION_MATRIX
DUPLICATE_ACTIVE_RELATION
INVALID_SURFACE_LAYOUT
SNAPSHOT_REFERENCE_UNAVAILABLE
MIGRATION_INCOMPATIBLE_DATA
```

错误 details 只包含 typed ids、expected/actual revision 与 bounded field names，不回传完整 State content、URL query、layout JSON 或 SQL。
