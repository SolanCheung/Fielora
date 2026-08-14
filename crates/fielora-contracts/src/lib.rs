use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

macro_rules! typed_id {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
        pub struct $name(pub String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str(&self.0)
            }
        }
    };
}

typed_id!(FieldId);
typed_id!(PrincipalId);
typed_id!(DeviceId);
typed_id!(ObjectId);
typed_id!(StateId);
typed_id!(ActivityId);
typed_id!(RelationId);
typed_id!(PaneId);
typed_id!(SurfaceSnapshotId);
typed_id!(TraceId);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ProtocolVersion {
    pub major: u16,
    pub minor: u16,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct FipcErrorData {
    pub code: String,
    pub trace_id: String,
    pub retryable: bool,
    #[ts(type = "unknown")]
    pub details: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct HelloRequest {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct HelloResponse {
    pub core_version: String,
    pub protocol: ProtocolVersion,
    pub schema_version: u32,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FieldLifecycle {
    Active,
    Completed,
    Archived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FieldMode {
    Explore,
    Think,
    Build,
    Operate,
    Verify,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FieldStateKind {
    Fact,
    Decision,
    Assumption,
    Question,
    Task,
    Blocker,
    Result,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StateStatus {
    Active,
    Resolved,
    Superseded,
    Retracted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StateTransitionTarget {
    Active,
    Resolved,
    Retracted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ObjectKind {
    Reference,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReferenceType {
    HttpsUrl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ObjectLifecycle {
    Active,
    Archived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RelationType {
    SourcedFrom,
    SupersededBy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RelationLifecycle {
    Active,
    Retracted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ResourceType {
    Field,
    State,
    Object,
    Relation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE", deny_unknown_fields)]
pub enum FieldFocusV1 {
    State { state_id: StateId },
    Reference { object_id: ObjectId },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FocusSource {
    None,
    TypedV1,
    LegacyText,
    InvalidIgnored,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct CreateFieldRequest {
    pub title: String,
    pub goal: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct UpdateFocusRequest {
    pub field_id: FieldId,
    #[ts(type = "number")]
    pub expected_revision: u64,
    #[ts(type = "unknown")]
    pub focus: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct SetFieldFocusV1Request {
    pub field_id: FieldId,
    #[ts(type = "number")]
    pub expected_field_revision: u64,
    pub focus: Option<FieldFocusV1>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct UpdateFieldModeRequest {
    pub field_id: FieldId,
    #[ts(type = "number")]
    pub expected_field_revision: u64,
    pub mode: Option<FieldMode>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct FieldReferenceRequest {
    pub field_id: FieldId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct FieldSummary {
    pub id: FieldId,
    pub title: String,
    pub goal: Option<String>,
    pub current_mode: Option<FieldMode>,
    #[ts(type = "unknown | null")]
    pub current_focus: Option<Value>,
    #[ts(type = "number")]
    pub revision: u64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct FieldView {
    pub id: FieldId,
    pub owner_principal_id: PrincipalId,
    pub title: String,
    pub goal: Option<String>,
    pub lifecycle_status: FieldLifecycle,
    pub current_mode: Option<FieldMode>,
    #[ts(type = "unknown | null")]
    pub current_focus: Option<Value>,
    #[ts(type = "number")]
    pub revision: u64,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct StateView {
    pub id: StateId,
    pub field_id: FieldId,
    pub kind: FieldStateKind,
    pub content: String,
    pub status: StateStatus,
    pub confidence: Option<f64>,
    pub created_by: PrincipalId,
    pub source_activity_id: ActivityId,
    #[ts(type = "number")]
    pub revision: u64,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct CreateStateRequest {
    pub field_id: FieldId,
    pub kind: FieldStateKind,
    pub content: String,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ReviseStateRequest {
    pub field_id: FieldId,
    pub state_id: StateId,
    #[ts(type = "number")]
    pub expected_state_revision: u64,
    pub content: String,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct TransitionStateRequest {
    pub field_id: FieldId,
    pub state_id: StateId,
    #[ts(type = "number")]
    pub expected_state_revision: u64,
    pub target: StateTransitionTarget,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct SupersedeStateRequest {
    pub field_id: FieldId,
    pub state_id: StateId,
    #[ts(type = "number")]
    pub expected_state_revision: u64,
    pub replacement_content: String,
    pub replacement_confidence: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct StateReferenceRequest {
    pub field_id: FieldId,
    pub state_id: StateId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct StateCursor {
    #[ts(type = "number")]
    pub updated_at: i64,
    pub state_id: StateId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ListStatesRequest {
    pub field_id: FieldId,
    pub kind: Option<FieldStateKind>,
    pub status: Option<StateStatus>,
    pub cursor: Option<StateCursor>,
    pub limit: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct ReferenceView {
    pub id: ObjectId,
    pub field_id: FieldId,
    pub owner_principal_id: PrincipalId,
    pub created_by: PrincipalId,
    pub source_activity_id: ActivityId,
    pub kind: ObjectKind,
    pub title: String,
    pub reference_type: ReferenceType,
    pub canonical_url: String,
    pub lifecycle: ObjectLifecycle,
    #[ts(type = "number")]
    pub revision: u64,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct CreateReferenceRequest {
    pub field_id: FieldId,
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ReviseReferenceRequest {
    pub field_id: FieldId,
    pub object_id: ObjectId,
    #[ts(type = "number")]
    pub expected_object_revision: u64,
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ArchiveReferenceRequest {
    pub field_id: FieldId,
    pub object_id: ObjectId,
    #[ts(type = "number")]
    pub expected_object_revision: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct RestoreReferenceRequest {
    pub field_id: FieldId,
    pub object_id: ObjectId,
    #[ts(type = "number")]
    pub expected_object_revision: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ReferenceRequest {
    pub field_id: FieldId,
    pub object_id: ObjectId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ReferenceCursor {
    #[ts(type = "number")]
    pub updated_at: i64,
    pub object_id: ObjectId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ListReferencesRequest {
    pub field_id: FieldId,
    pub lifecycle: Option<ObjectLifecycle>,
    pub cursor: Option<ReferenceCursor>,
    pub limit: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE", deny_unknown_fields)]
pub enum ResourceRef {
    Field { field_id: FieldId },
    State { state_id: StateId },
    Reference { object_id: ObjectId },
    Relation { relation_id: RelationId },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE", deny_unknown_fields)]
pub enum LineageEndpointRef {
    State { state_id: StateId },
    Reference { object_id: ObjectId },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct RelationView {
    pub id: RelationId,
    pub field_id: FieldId,
    pub relation_type: RelationType,
    pub from: LineageEndpointRef,
    pub to: LineageEndpointRef,
    pub lifecycle: RelationLifecycle,
    pub created_by: PrincipalId,
    #[ts(type = "number")]
    pub revision: u64,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct AttachReferenceSourceRequest {
    pub field_id: FieldId,
    pub state_id: StateId,
    pub reference_id: ObjectId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct RetractReferenceSourceRequest {
    pub field_id: FieldId,
    pub relation_id: RelationId,
    #[ts(type = "number")]
    pub expected_relation_revision: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct RelationCursor {
    #[ts(type = "number")]
    pub created_at: i64,
    pub relation_id: RelationId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ListRelationsRequest {
    pub field_id: FieldId,
    pub relation_type: Option<RelationType>,
    pub lifecycle: Option<RelationLifecycle>,
    pub endpoint: Option<LineageEndpointRef>,
    pub cursor: Option<RelationCursor>,
    pub limit: Option<u16>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActivityAction {
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct ActivityView {
    pub id: ActivityId,
    pub field_id: Option<FieldId>,
    pub actor_principal_id: PrincipalId,
    pub action: ActivityAction,
    pub target: Option<ResourceRef>,
    pub summary: Option<String>,
    pub trace_id: TraceId,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ActivityCursor {
    #[ts(type = "number")]
    pub created_at: i64,
    pub activity_id: ActivityId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ListActivitiesRequest {
    pub field_id: FieldId,
    pub cursor: Option<ActivityCursor>,
    pub limit: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct Page<T, C> {
    pub items: Vec<T>,
    pub next_cursor: Option<C>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct RealityMutationResult<T> {
    pub resource: T,
    #[ts(type = "number")]
    pub field_revision: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct SupersedeStateResult {
    pub previous: StateView,
    pub replacement: StateView,
    pub relation: RelationView,
    #[ts(type = "number")]
    pub field_revision: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SurfaceTemplateV1 {
    PrimaryOnly,
    PrimarySupportRight,
    PrimaryTwoSupportsRight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SurfacePrimitiveV1 {
    TaskPane,
    ReferencePane,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE", deny_unknown_fields)]
pub enum PaneBindingV1 {
    FieldTasks,
    Reference { object_id: ObjectId },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct SurfacePaneV1 {
    pub pane_id: PaneId,
    pub primitive: SurfacePrimitiveV1,
    pub binding: PaneBindingV1,
    pub collapsed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct SurfaceLayoutV1 {
    pub version: u8,
    pub template: SurfaceTemplateV1,
    pub primary: SurfacePaneV1,
    pub supporting: Vec<SurfacePaneV1>,
    pub focused_pane_id: PaneId,
}

impl SurfaceLayoutV1 {
    pub fn default_task() -> Self {
        Self {
            version: 1,
            template: SurfaceTemplateV1::PrimaryOnly,
            primary: SurfacePaneV1 {
                pane_id: PaneId::new("primary_task"),
                primitive: SurfacePrimitiveV1::TaskPane,
                binding: PaneBindingV1::FieldTasks,
                collapsed: false,
            },
            supporting: Vec::new(),
            focused_pane_id: PaneId::new("primary_task"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct SaveSurfaceSnapshotRequest {
    pub field_id: FieldId,
    #[ts(type = "unknown")]
    pub layout: Value,
    pub open_objects: Vec<ObjectId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct SaveSurfaceSnapshotV1Request {
    pub field_id: FieldId,
    pub layout: SurfaceLayoutV1,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct SurfaceSnapshotView {
    pub id: SurfaceSnapshotId,
    pub field_id: FieldId,
    pub device_id: DeviceId,
    #[ts(type = "number")]
    pub observed_field_revision: u64,
    #[ts(type = "unknown")]
    pub layout: Value,
    pub open_objects: Vec<ObjectId>,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct SurfaceSnapshotV1View {
    pub id: SurfaceSnapshotId,
    pub field_id: FieldId,
    pub device_id: DeviceId,
    #[ts(type = "number")]
    pub observed_field_revision: u64,
    pub layout: SurfaceLayoutV1,
    pub open_reference_ids: Vec<ObjectId>,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct SurfaceResumeView {
    pub field: FieldView,
    pub snapshot: Option<SurfaceSnapshotView>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SnapshotFreshness {
    None,
    Current,
    Stale,
    Invalid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LayoutSource {
    Default,
    SnapshotV1,
    LegacyPhase01Fallback,
    InvalidIgnored,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExternalChangeAssessment {
    NotEvaluatedPhase02,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct ResumeStateItem {
    pub id: StateId,
    pub kind: FieldStateKind,
    pub content_excerpt: String,
    #[ts(type = "number")]
    pub revision: u64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ContinuationReason {
    TypedFocus,
    LegacyTextFocus,
    ActiveBlocker,
    ActiveQuestion,
    ActiveTask,
    LastActivity,
    FieldOverview,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE", deny_unknown_fields)]
pub enum ContinuationTarget {
    State { state_id: StateId },
    Reference { object_id: ObjectId },
    LegacyText { label: String },
    FieldOverview,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ResumeContinuation {
    pub reason: ContinuationReason,
    pub target: ContinuationTarget,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct FieldResumeV1View {
    pub field: FieldView,
    #[ts(type = "number")]
    pub field_revision: u64,
    pub focus_source: FocusSource,
    pub typed_focus: Option<FieldFocusV1>,
    pub legacy_text_focus: Option<String>,
    pub snapshot_freshness: SnapshotFreshness,
    pub layout_source: LayoutSource,
    pub layout: SurfaceLayoutV1,
    pub open_reference_ids: Vec<ObjectId>,
    pub unavailable_reference_ids: Vec<ObjectId>,
    pub active_blockers: Vec<ResumeStateItem>,
    pub active_questions: Vec<ResumeStateItem>,
    pub active_tasks: Vec<ResumeStateItem>,
    pub last_activity: Option<ActivityView>,
    pub continuation: ResumeContinuation,
    pub external_changes: ExternalChangeAssessment,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum FieldChangeKind {
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct DomainEventDTO {
    pub event: String,
    pub field_id: FieldId,
    pub change: FieldChangeKind,
    pub resource: Option<ResourceRef>,
    #[ts(type = "number")]
    pub revision: u64,
    pub trace_id: TraceId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CoreHealthState {
    Starting,
    Ready,
    Unavailable,
    Degraded,
    ShuttingDown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct HealthDTO {
    pub state: CoreHealthState,
    pub core_version: String,
    pub protocol: ProtocolVersion,
    pub schema_version: u32,
    pub pid: u32,
    pub db_path: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_wire_enums_and_tagged_refs_are_exact() {
        assert_eq!(
            serde_json::to_string(&FieldMode::Build).unwrap(),
            "\"BUILD\""
        );
        assert_eq!(
            serde_json::to_string(&ReferenceType::HttpsUrl).unwrap(),
            "\"HTTPS_URL\""
        );
        assert_eq!(
            serde_json::to_value(FieldFocusV1::State {
                state_id: StateId::new("state")
            })
            .unwrap(),
            serde_json::json!({"kind":"STATE","state_id":"state"})
        );
        assert!(
            serde_json::from_value::<FieldFocusV1>(
                serde_json::json!({"kind":"STATE","state_id":"state","extra":true})
            )
            .is_err()
        );
    }

    #[test]
    fn default_surface_is_deterministic() {
        let layout = SurfaceLayoutV1::default_task();
        assert_eq!(layout.version, 1);
        assert_eq!(layout.primary.pane_id.0, "primary_task");
        assert!(layout.supporting.is_empty());
    }
}
