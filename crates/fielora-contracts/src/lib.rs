use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

macro_rules! typed_id {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
        #[ts(export)]
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
typed_id!(SurfaceSnapshotId);
typed_id!(TraceId);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ProtocolVersion {
    pub major: u16,
    pub minor: u16,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FipcErrorData {
    pub code: String,
    pub trace_id: String,
    pub retryable: bool,
    #[ts(type = "unknown")]
    pub details: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HelloRequest {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HelloResponse {
    pub core_version: String,
    pub protocol: ProtocolVersion,
    pub schema_version: u32,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateFieldRequest {
    pub title: String,
    pub goal: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateFocusRequest {
    pub field_id: FieldId,
    #[ts(type = "number")]
    pub expected_revision: u64,
    #[ts(type = "unknown")]
    pub focus: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SaveSurfaceSnapshotRequest {
    pub field_id: FieldId,
    #[ts(type = "unknown")]
    pub layout: Value,
    pub open_objects: Vec<ObjectId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FieldReferenceRequest {
    pub field_id: FieldId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
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
#[ts(export)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(export, rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FieldLifecycle {
    Active,
    Completed,
    Archived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(export, rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FieldMode {
    Explore,
    Think,
    Build,
    Operate,
    Verify,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
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
#[ts(export)]
pub struct SurfaceResumeView {
    pub field: FieldView,
    pub snapshot: Option<SurfaceSnapshotView>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DomainEventDTO {
    pub event: String,
    pub field_id: FieldId,
    pub change: String,
    #[ts(type = "number")]
    pub revision: u64,
    pub trace_id: TraceId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(export, rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CoreHealthState {
    Starting,
    Ready,
    Unavailable,
    Degraded,
    ShuttingDown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
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
    fn stable_wire_enums_are_uppercase() {
        assert_eq!(
            serde_json::to_string(&FieldMode::Build).unwrap(),
            "\"BUILD\""
        );
        assert_eq!(
            serde_json::to_string(&FieldLifecycle::Active).unwrap(),
            "\"ACTIVE\""
        );
    }
}
