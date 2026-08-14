// Generated from Rust DTOs. Do not edit by hand.

export type FieldId = string;

export type PrincipalId = string;

export type DeviceId = string;

export type ObjectId = string;

export type StateId = string;

export type ActivityId = string;

export type RelationId = string;

export type PaneId = string;

export type SurfaceSnapshotId = string;

export type TraceId = string;

export type ProtocolVersion = { major: number, minor: number, };

export type FipcErrorData = { code: string, trace_id: string, retryable: boolean, details: unknown, };

export type HelloRequest = Record<symbol, never>;

export type HelloResponse = { core_version: string, protocol: ProtocolVersion, schema_version: number, capabilities: Array<string>, };

export type FieldLifecycle = "ACTIVE" | "COMPLETED" | "ARCHIVED";

export type FieldMode = "EXPLORE" | "THINK" | "BUILD" | "OPERATE" | "VERIFY";

export type FieldStateKind = "FACT" | "DECISION" | "ASSUMPTION" | "QUESTION" | "TASK" | "BLOCKER" | "RESULT";

export type StateStatus = "ACTIVE" | "RESOLVED" | "SUPERSEDED" | "RETRACTED";

export type StateTransitionTarget = "ACTIVE" | "RESOLVED" | "RETRACTED";

export type ObjectKind = "REFERENCE";

export type ReferenceType = "HTTPS_URL";

export type ObjectLifecycle = "ACTIVE" | "ARCHIVED";

export type RelationType = "SOURCED_FROM" | "SUPERSEDED_BY";

export type RelationLifecycle = "ACTIVE" | "RETRACTED";

export type ResourceType = "FIELD" | "STATE" | "OBJECT" | "RELATION";

export type FieldFocusV1 = { "kind": "STATE", state_id: StateId, } | { "kind": "REFERENCE", object_id: ObjectId, };

export type FocusSource = "NONE" | "TYPED_V1" | "LEGACY_TEXT" | "INVALID_IGNORED";

export type CreateFieldRequest = { title: string, goal: string | null, };

export type UpdateFocusRequest = { field_id: FieldId, expected_revision: number, focus: unknown, };

export type SetFieldFocusV1Request = { field_id: FieldId, expected_field_revision: number, focus: FieldFocusV1 | null, };

export type UpdateFieldModeRequest = { field_id: FieldId, expected_field_revision: number, mode: FieldMode | null, };

export type FieldReferenceRequest = { field_id: FieldId, };

export type FieldSummary = { id: FieldId, title: string, goal: string | null, current_mode: FieldMode | null, current_focus: unknown | null, revision: number, updated_at: number, };

export type FieldView = { id: FieldId, owner_principal_id: PrincipalId, title: string, goal: string | null, lifecycle_status: FieldLifecycle, current_mode: FieldMode | null, current_focus: unknown | null, revision: number, created_at: number, updated_at: number, };

export type StateView = { id: StateId, field_id: FieldId, kind: FieldStateKind, content: string, status: StateStatus, confidence: number | null, created_by: PrincipalId, source_activity_id: ActivityId, revision: number, created_at: number, updated_at: number, };

export type CreateStateRequest = { field_id: FieldId, kind: FieldStateKind, content: string, confidence: number | null, };

export type ReviseStateRequest = { field_id: FieldId, state_id: StateId, expected_state_revision: number, content: string, confidence: number | null, };

export type TransitionStateRequest = { field_id: FieldId, state_id: StateId, expected_state_revision: number, target: StateTransitionTarget, };

export type SupersedeStateRequest = { field_id: FieldId, state_id: StateId, expected_state_revision: number, replacement_content: string, replacement_confidence: number | null, };

export type StateReferenceRequest = { field_id: FieldId, state_id: StateId, };

export type StateCursor = { updated_at: number, state_id: StateId, };

export type ListStatesRequest = { field_id: FieldId, kind: FieldStateKind | null, status: StateStatus | null, cursor: StateCursor | null, limit: number | null, };

export type ReferenceView = { id: ObjectId, field_id: FieldId, owner_principal_id: PrincipalId, created_by: PrincipalId, source_activity_id: ActivityId, kind: ObjectKind, title: string, reference_type: ReferenceType, canonical_url: string, lifecycle: ObjectLifecycle, revision: number, created_at: number, updated_at: number, };

export type CreateReferenceRequest = { field_id: FieldId, title: string, url: string, };

export type ReviseReferenceRequest = { field_id: FieldId, object_id: ObjectId, expected_object_revision: number, title: string, url: string, };

export type ArchiveReferenceRequest = { field_id: FieldId, object_id: ObjectId, expected_object_revision: number, };

export type RestoreReferenceRequest = { field_id: FieldId, object_id: ObjectId, expected_object_revision: number, };

export type ReferenceRequest = { field_id: FieldId, object_id: ObjectId, };

export type ReferenceCursor = { updated_at: number, object_id: ObjectId, };

export type ListReferencesRequest = { field_id: FieldId, lifecycle: ObjectLifecycle | null, cursor: ReferenceCursor | null, limit: number | null, };

export type ResourceRef = { "kind": "FIELD", field_id: FieldId, } | { "kind": "STATE", state_id: StateId, } | { "kind": "REFERENCE", object_id: ObjectId, } | { "kind": "RELATION", relation_id: RelationId, };

export type LineageEndpointRef = { "kind": "STATE", state_id: StateId, } | { "kind": "REFERENCE", object_id: ObjectId, };

export type RelationView = { id: RelationId, field_id: FieldId, relation_type: RelationType, from: LineageEndpointRef, to: LineageEndpointRef, lifecycle: RelationLifecycle, created_by: PrincipalId, revision: number, created_at: number, updated_at: number, };

export type AttachReferenceSourceRequest = { field_id: FieldId, state_id: StateId, reference_id: ObjectId, };

export type RetractReferenceSourceRequest = { field_id: FieldId, relation_id: RelationId, expected_relation_revision: number, };

export type RelationCursor = { created_at: number, relation_id: RelationId, };

export type ListRelationsRequest = { field_id: FieldId, relation_type: RelationType | null, lifecycle: RelationLifecycle | null, endpoint: LineageEndpointRef | null, cursor: RelationCursor | null, limit: number | null, };

export type ActivityAction = "FIELD_CREATED" | "FIELD_FOCUS_UPDATED" | "FIELD_MODE_UPDATED" | "STATE_CREATED" | "STATE_REVISED" | "STATE_STATUS_CHANGED" | "STATE_SUPERSEDED" | "REFERENCE_CREATED" | "REFERENCE_REVISED" | "REFERENCE_ARCHIVED" | "REFERENCE_RESTORED" | "REFERENCE_SOURCE_ATTACHED" | "REFERENCE_SOURCE_RETRACTED";

export type ActivityView = { id: ActivityId, field_id: FieldId | null, actor_principal_id: PrincipalId, action: ActivityAction, target: ResourceRef | null, summary: string | null, trace_id: TraceId, created_at: number, };

export type ActivityCursor = { created_at: number, activity_id: ActivityId, };

export type ListActivitiesRequest = { field_id: FieldId, cursor: ActivityCursor | null, limit: number | null, };

export type Page<T, C> = { items: Array<T>, next_cursor: C | null, };

export type RealityMutationResult<T> = { resource: T, field_revision: number, };

export type SupersedeStateResult = { previous: StateView, replacement: StateView, relation: RelationView, field_revision: number, };

export type SurfaceTemplateV1 = "PRIMARY_ONLY" | "PRIMARY_SUPPORT_RIGHT" | "PRIMARY_TWO_SUPPORTS_RIGHT";

export type SurfacePrimitiveV1 = "TASK_PANE" | "REFERENCE_PANE";

export type PaneBindingV1 = { "kind": "FIELD_TASKS" } | { "kind": "REFERENCE", object_id: ObjectId, };

export type SurfacePaneV1 = { pane_id: PaneId, primitive: SurfacePrimitiveV1, binding: PaneBindingV1, collapsed: boolean, };

export type SurfaceLayoutV1 = { version: number, template: SurfaceTemplateV1, primary: SurfacePaneV1, supporting: Array<SurfacePaneV1>, focused_pane_id: PaneId, };

export type SaveSurfaceSnapshotRequest = { field_id: FieldId, layout: unknown, open_objects: Array<ObjectId>, };

export type SaveSurfaceSnapshotV1Request = { field_id: FieldId, layout: SurfaceLayoutV1, };

export type SurfaceSnapshotView = { id: SurfaceSnapshotId, field_id: FieldId, device_id: DeviceId, observed_field_revision: number, layout: unknown, open_objects: Array<ObjectId>, created_at: number, };

export type SurfaceSnapshotV1View = { id: SurfaceSnapshotId, field_id: FieldId, device_id: DeviceId, observed_field_revision: number, layout: SurfaceLayoutV1, open_reference_ids: Array<ObjectId>, created_at: number, };

export type SurfaceResumeView = { field: FieldView, snapshot: SurfaceSnapshotView | null, };

export type SnapshotFreshness = "NONE" | "CURRENT" | "STALE" | "INVALID";

export type LayoutSource = "DEFAULT" | "SNAPSHOT_V1" | "LEGACY_PHASE01_FALLBACK" | "INVALID_IGNORED";

export type ExternalChangeAssessment = "NOT_EVALUATED_PHASE02";

export type ResumeStateItem = { id: StateId, kind: FieldStateKind, content_excerpt: string, revision: number, updated_at: number, };

export type ContinuationReason = "TYPED_FOCUS" | "LEGACY_TEXT_FOCUS" | "ACTIVE_BLOCKER" | "ACTIVE_QUESTION" | "ACTIVE_TASK" | "LAST_ACTIVITY" | "FIELD_OVERVIEW";

export type ContinuationTarget = { "kind": "STATE", state_id: StateId, } | { "kind": "REFERENCE", object_id: ObjectId, } | { "kind": "LEGACY_TEXT", label: string, } | { "kind": "FIELD_OVERVIEW" };

export type ResumeContinuation = { reason: ContinuationReason, target: ContinuationTarget, };

export type FieldResumeV1View = { field: FieldView, field_revision: number, focus_source: FocusSource, typed_focus: FieldFocusV1 | null, legacy_text_focus: string | null, snapshot_freshness: SnapshotFreshness, layout_source: LayoutSource, layout: SurfaceLayoutV1, open_reference_ids: Array<ObjectId>, unavailable_reference_ids: Array<ObjectId>, active_blockers: Array<ResumeStateItem>, active_questions: Array<ResumeStateItem>, active_tasks: Array<ResumeStateItem>, last_activity: ActivityView | null, continuation: ResumeContinuation, external_changes: ExternalChangeAssessment, };

export type FieldChangeKind = "created" | "focus_updated" | "mode_updated" | "state_created" | "state_revised" | "state_status_changed" | "state_superseded" | "reference_created" | "reference_revised" | "reference_archived" | "reference_restored" | "reference_source_attached" | "reference_source_retracted";

export type DomainEventDTO = { event: string, field_id: FieldId, change: FieldChangeKind, resource: ResourceRef | null, revision: number, trace_id: TraceId, };

export type CoreHealthState = "STARTING" | "READY" | "UNAVAILABLE" | "DEGRADED" | "SHUTTING_DOWN";

export type HealthDTO = { state: CoreHealthState, core_version: string, protocol: ProtocolVersion, schema_version: number, pid: number, db_path: string, };

