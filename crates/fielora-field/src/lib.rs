use fielora_contracts::{
    DeviceId, DomainEventDTO, FieldId, FieldLifecycle, FieldMode, ObjectId, PrincipalId,
    SurfaceSnapshotId, TraceId,
};
use serde_json::Value;
use thiserror::Error;
use uuid::{Uuid, Version};

#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    pub id: FieldId,
    pub owner_principal_id: PrincipalId,
    pub title: String,
    pub goal: Option<String>,
    pub lifecycle_status: FieldLifecycle,
    pub current_mode: Option<FieldMode>,
    pub current_focus: Option<Value>,
    pub revision: u64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Activity {
    pub id: String,
    pub field_id: Option<FieldId>,
    pub actor_principal_id: PrincipalId,
    pub intent: Option<String>,
    pub action: String,
    pub target_type: Option<String>,
    pub target_id: Option<String>,
    pub summary: Option<String>,
    pub trace_id: TraceId,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SurfaceSnapshot {
    pub id: SurfaceSnapshotId,
    pub field_id: FieldId,
    pub device_id: DeviceId,
    pub observed_field_revision: u64,
    pub layout: Value,
    pub open_objects: Vec<ObjectId>,
    pub created_at: i64,
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DomainError {
    #[error("{0}")]
    Validation(String),
    #[error("resource not found")]
    NotFound,
    #[error("revision conflict")]
    Conflict,
    #[error("storage error: {0}")]
    Storage(String),
}

pub trait FieldRepository: Clone + Send + Sync + 'static {
    fn create_field(&self, field: &Field, activity: &Activity) -> Result<(), DomainError>;
    fn list_active_fields(&self) -> Result<Vec<Field>, DomainError>;
    fn get_field(&self, field_id: &FieldId) -> Result<Field, DomainError>;
    fn update_focus(
        &self,
        field_id: &FieldId,
        expected_revision: u64,
        focus: &Value,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<Field, DomainError>;
}

pub trait SurfaceRepository: Clone + Send + Sync + 'static {
    fn save_snapshot(
        &self,
        field_id: &FieldId,
        device_id: &DeviceId,
        layout: &Value,
        open_objects: &[ObjectId],
        created_at: i64,
    ) -> Result<SurfaceSnapshot, DomainError>;
    fn latest_snapshot(
        &self,
        field_id: &FieldId,
        device_id: &DeviceId,
    ) -> Result<Option<SurfaceSnapshot>, DomainError>;
}

#[derive(Clone)]
pub struct FieldService<R: FieldRepository> {
    repository: R,
    local_user: PrincipalId,
}

impl<R: FieldRepository> FieldService<R> {
    pub fn new(repository: R, local_user: PrincipalId) -> Self {
        Self {
            repository,
            local_user,
        }
    }

    pub fn create(
        &self,
        title: String,
        goal: Option<String>,
        trace_id: TraceId,
        now: i64,
    ) -> Result<(Field, DomainEventDTO), DomainError> {
        let title = validate_title(title)?;
        let goal = validate_goal(goal)?;
        let field_id = FieldId::new(Uuid::now_v7().to_string());
        let field = Field {
            id: field_id.clone(),
            owner_principal_id: self.local_user.clone(),
            title,
            goal,
            lifecycle_status: FieldLifecycle::Active,
            current_mode: None,
            current_focus: None,
            revision: 1,
            created_at: now,
            updated_at: now,
        };
        let activity = Activity {
            id: Uuid::now_v7().to_string(),
            field_id: Some(field_id.clone()),
            actor_principal_id: self.local_user.clone(),
            intent: Some("CREATE".into()),
            action: "FIELD_CREATED".into(),
            target_type: Some("FIELD".into()),
            target_id: Some(field_id.0.clone()),
            summary: None,
            trace_id: trace_id.clone(),
            created_at: now,
        };
        self.repository.create_field(&field, &activity)?;
        let event = DomainEventDTO {
            event: "event.field.changed".into(),
            field_id,
            change: "created".into(),
            revision: 1,
            trace_id,
        };
        Ok((field, event))
    }

    pub fn list(&self) -> Result<Vec<Field>, DomainError> {
        self.repository.list_active_fields()
    }

    pub fn get(&self, field_id: &FieldId) -> Result<Field, DomainError> {
        validate_uuid_v7("field_id", &field_id.0)?;
        self.repository.get_field(field_id)
    }

    pub fn update_focus(
        &self,
        field_id: FieldId,
        expected_revision: u64,
        focus: Value,
        trace_id: TraceId,
        now: i64,
    ) -> Result<(Field, DomainEventDTO), DomainError> {
        validate_uuid_v7("field_id", &field_id.0)?;
        if expected_revision < 1 {
            return Err(DomainError::Validation(
                "expected_revision must be at least 1".into(),
            ));
        }
        let activity = Activity {
            id: Uuid::now_v7().to_string(),
            field_id: Some(field_id.clone()),
            actor_principal_id: self.local_user.clone(),
            intent: Some("CHANGE".into()),
            action: "FIELD_FOCUS_UPDATED".into(),
            target_type: Some("FIELD".into()),
            target_id: Some(field_id.0.clone()),
            summary: None,
            trace_id: trace_id.clone(),
            created_at: now,
        };
        let field =
            self.repository
                .update_focus(&field_id, expected_revision, &focus, now, &activity)?;
        let event = DomainEventDTO {
            event: "event.field.changed".into(),
            field_id,
            change: "focus_updated".into(),
            revision: field.revision,
            trace_id,
        };
        Ok((field, event))
    }
}

#[derive(Clone)]
pub struct SurfaceService<R: SurfaceRepository> {
    repository: R,
    device_id: DeviceId,
}

impl<R: SurfaceRepository> SurfaceService<R> {
    pub fn new(repository: R, device_id: DeviceId) -> Self {
        Self {
            repository,
            device_id,
        }
    }

    pub fn save(
        &self,
        field_id: FieldId,
        layout: Value,
        open_objects: Vec<ObjectId>,
        now: i64,
    ) -> Result<SurfaceSnapshot, DomainError> {
        validate_uuid_v7("field_id", &field_id.0)?;
        for object_id in &open_objects {
            validate_uuid_v7("open_objects", &object_id.0)?;
        }
        self.repository
            .save_snapshot(&field_id, &self.device_id, &layout, &open_objects, now)
    }

    pub fn latest(&self, field_id: &FieldId) -> Result<Option<SurfaceSnapshot>, DomainError> {
        validate_uuid_v7("field_id", &field_id.0)?;
        self.repository.latest_snapshot(field_id, &self.device_id)
    }
}

pub fn validate_title(title: String) -> Result<String, DomainError> {
    let title = title.trim().to_owned();
    let count = title.chars().count();
    if !(1..=120).contains(&count) {
        return Err(DomainError::Validation(
            "Field title must contain 1 to 120 characters".into(),
        ));
    }
    Ok(title)
}

pub fn validate_goal(goal: Option<String>) -> Result<Option<String>, DomainError> {
    if goal
        .as_ref()
        .is_some_and(|value| value.chars().count() > 4000)
    {
        return Err(DomainError::Validation(
            "Field goal must contain at most 4000 characters".into(),
        ));
    }
    Ok(goal)
}

pub fn validate_uuid_v7(label: &str, value: &str) -> Result<(), DomainError> {
    let uuid = Uuid::parse_str(value)
        .map_err(|_| DomainError::Validation(format!("{label} must be a canonical UUIDv7")))?;
    if uuid.get_version() != Some(Version::SortRand) || uuid.to_string() != value {
        return Err(DomainError::Validation(format!(
            "{label} must be a canonical UUIDv7"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct FakeRepository {
        fields: Arc<Mutex<Vec<Field>>>,
    }

    impl FieldRepository for FakeRepository {
        fn create_field(&self, field: &Field, _activity: &Activity) -> Result<(), DomainError> {
            self.fields.lock().unwrap().push(field.clone());
            Ok(())
        }

        fn list_active_fields(&self) -> Result<Vec<Field>, DomainError> {
            Ok(self.fields.lock().unwrap().clone())
        }

        fn get_field(&self, field_id: &FieldId) -> Result<Field, DomainError> {
            self.fields
                .lock()
                .unwrap()
                .iter()
                .find(|field| &field.id == field_id)
                .cloned()
                .ok_or(DomainError::NotFound)
        }

        fn update_focus(
            &self,
            field_id: &FieldId,
            expected_revision: u64,
            focus: &Value,
            updated_at: i64,
            _activity: &Activity,
        ) -> Result<Field, DomainError> {
            let mut fields = self.fields.lock().unwrap();
            let field = fields
                .iter_mut()
                .find(|field| &field.id == field_id)
                .ok_or(DomainError::NotFound)?;
            if field.revision != expected_revision {
                return Err(DomainError::Conflict);
            }
            field.revision += 1;
            field.current_focus = Some(focus.clone());
            field.updated_at = updated_at;
            Ok(field.clone())
        }
    }

    #[test]
    fn title_is_trimmed_and_bounded_by_unicode_scalars() {
        assert_eq!(validate_title("  Field  ".into()).unwrap(), "Field");
        assert!(validate_title(" ".into()).is_err());
        assert!(validate_title("界".repeat(121)).is_err());
    }

    #[test]
    fn goal_is_bounded() {
        assert!(validate_goal(Some("g".repeat(4000))).is_ok());
        assert!(validate_goal(Some("g".repeat(4001))).is_err());
    }

    #[test]
    fn create_and_focus_return_events_only_after_repository_success() {
        let repository = FakeRepository::default();
        let user = PrincipalId::new(Uuid::now_v7().to_string());
        let service = FieldService::new(repository, user);
        let trace = TraceId::new(Uuid::now_v7().to_string());
        let (field, created) = service
            .create("Phase 01".into(), None, trace.clone(), 1)
            .unwrap();
        assert_eq!(created.revision, 1);

        let (updated, changed) = service
            .update_focus(field.id, 1, Value::String("Persistence".into()), trace, 2)
            .unwrap();
        assert_eq!(updated.revision, 2);
        assert_eq!(changed.revision, 2);
    }

    #[test]
    fn stale_revision_conflicts() {
        let repository = FakeRepository::default();
        let user = PrincipalId::new(Uuid::now_v7().to_string());
        let service = FieldService::new(repository, user);
        let trace = TraceId::new(Uuid::now_v7().to_string());
        let (field, _) = service
            .create("Phase 01".into(), None, trace.clone(), 1)
            .unwrap();
        service
            .update_focus(
                field.id.clone(),
                1,
                Value::String("A".into()),
                trace.clone(),
                2,
            )
            .unwrap();
        assert_eq!(
            service.update_focus(field.id, 1, Value::String("B".into()), trace, 3),
            Err(DomainError::Conflict)
        );
    }
}
