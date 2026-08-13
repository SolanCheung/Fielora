// Generated from Rust DTOs. Do not edit by hand.

export type FieldId = string;

export type PrincipalId = string;

export type DeviceId = string;

export type ObjectId = string;

export type SurfaceSnapshotId = string;

export type TraceId = string;

export type ProtocolVersion = { major: number, minor: number, };

export type FipcErrorData = { code: string, trace_id: string, retryable: boolean, details: unknown, };

export type HelloRequest = Record<symbol, never>;

export type HelloResponse = { core_version: string, protocol: ProtocolVersion, schema_version: number, capabilities: Array<string>, };

export type CreateFieldRequest = { title: string, goal: string | null, };

export type UpdateFocusRequest = { field_id: FieldId, expected_revision: number, focus: unknown, };

export type SaveSurfaceSnapshotRequest = { field_id: FieldId, layout: unknown, open_objects: Array<ObjectId>, };

export type FieldReferenceRequest = { field_id: FieldId, };

export type FieldLifecycle = "ACTIVE" | "COMPLETED" | "ARCHIVED";

export type FieldMode = "EXPLORE" | "THINK" | "BUILD" | "OPERATE" | "VERIFY";

export type FieldSummary = { id: FieldId, title: string, goal: string | null, current_mode: FieldMode | null, current_focus: unknown | null, revision: number, updated_at: number, };

export type FieldView = { id: FieldId, owner_principal_id: PrincipalId, title: string, goal: string | null, lifecycle_status: FieldLifecycle, current_mode: FieldMode | null, current_focus: unknown | null, revision: number, created_at: number, updated_at: number, };

export type SurfaceSnapshotView = { id: SurfaceSnapshotId, field_id: FieldId, device_id: DeviceId, observed_field_revision: number, layout: unknown, open_objects: Array<ObjectId>, created_at: number, };

export type SurfaceResumeView = { field: FieldView, snapshot: SurfaceSnapshotView | null, };

export type DomainEventDTO = { event: string, field_id: FieldId, change: string, revision: number, trace_id: TraceId, };

export type CoreHealthState = "STARTING" | "READY" | "UNAVAILABLE" | "DEGRADED" | "SHUTTING_DOWN";

export type HealthDTO = { state: CoreHealthState, core_version: string, protocol: ProtocolVersion, schema_version: number, pid: number, db_path: string, };

