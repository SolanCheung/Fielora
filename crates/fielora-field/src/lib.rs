use fielora_contracts::*;
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

#[derive(Debug, Error, Clone, PartialEq)]
pub enum DomainError {
    #[error("{0}")]
    Validation(String),
    #[error("resource not found")]
    NotFound,
    #[error("revision conflict")]
    RevisionConflict,
    #[error("invalid state transition")]
    InvalidStateTransition,
    #[error("terminal resource")]
    TerminalResource,
    #[error("duplicate active reference")]
    DuplicateActiveReference,
    #[error("invalid reference URL")]
    InvalidReferenceUrl,
    #[error("invalid relation endpoint")]
    InvalidRelationEndpoint,
    #[error("invalid relation matrix")]
    InvalidRelationMatrix,
    #[error("duplicate active relation")]
    DuplicateActiveRelation,
    #[error("invalid surface layout: {0}")]
    InvalidSurfaceLayout(String),
    #[error("snapshot reference unavailable")]
    SnapshotReferenceUnavailable,
    #[error("migration contains incompatible data")]
    MigrationIncompatibleData,
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
    fn update_mode(
        &self,
        field_id: &FieldId,
        expected_revision: u64,
        mode: Option<FieldMode>,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<Field, DomainError>;
    fn set_focus_v1(
        &self,
        field_id: &FieldId,
        expected_revision: u64,
        focus: Option<&FieldFocusV1>,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<Field, DomainError>;
}

pub trait RealityRepository: Clone + Send + Sync + 'static {
    fn create_state(
        &self,
        state: &StateView,
        activity: &Activity,
    ) -> Result<RealityMutationResult<StateView>, DomainError>;
    fn get_state(&self, field_id: &FieldId, state_id: &StateId) -> Result<StateView, DomainError>;
    fn list_states(
        &self,
        request: &ListStatesRequest,
    ) -> Result<Page<StateView, StateCursor>, DomainError>;
    fn revise_state(
        &self,
        request: &ReviseStateRequest,
        content: &str,
        confidence: Option<f64>,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<StateView>, DomainError>;
    fn transition_state(
        &self,
        request: &TransitionStateRequest,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<StateView>, DomainError>;
    #[allow(clippy::too_many_arguments)]
    fn supersede_state(
        &self,
        request: &SupersedeStateRequest,
        replacement_id: &StateId,
        relation_id: &RelationId,
        replacement_content: &str,
        replacement_confidence: Option<f64>,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<SupersedeStateResult, DomainError>;

    fn create_reference(
        &self,
        reference: &ReferenceView,
        activity: &Activity,
    ) -> Result<RealityMutationResult<ReferenceView>, DomainError>;
    fn get_reference(
        &self,
        field_id: &FieldId,
        object_id: &ObjectId,
    ) -> Result<ReferenceView, DomainError>;
    fn list_references(
        &self,
        request: &ListReferencesRequest,
    ) -> Result<Page<ReferenceView, ReferenceCursor>, DomainError>;
    fn revise_reference(
        &self,
        request: &ReviseReferenceRequest,
        title: &str,
        canonical_url: &str,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<ReferenceView>, DomainError>;
    fn archive_reference(
        &self,
        request: &ArchiveReferenceRequest,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<ReferenceView>, DomainError>;
    fn restore_reference(
        &self,
        request: &RestoreReferenceRequest,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<ReferenceView>, DomainError>;

    fn attach_reference_source(
        &self,
        request: &AttachReferenceSourceRequest,
        relation_id: &RelationId,
        created_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<RelationView>, DomainError>;
    fn retract_reference_source(
        &self,
        request: &RetractReferenceSourceRequest,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<RelationView>, DomainError>;
    fn list_relations(
        &self,
        request: &ListRelationsRequest,
    ) -> Result<Page<RelationView, RelationCursor>, DomainError>;
    fn list_activities(
        &self,
        request: &ListActivitiesRequest,
    ) -> Result<Page<ActivityView, ActivityCursor>, DomainError>;
    fn resume_v1(
        &self,
        field_id: &FieldId,
        device_id: &DeviceId,
    ) -> Result<FieldResumeV1View, DomainError>;
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
    fn save_snapshot_v1(
        &self,
        field_id: &FieldId,
        device_id: &DeviceId,
        layout: &SurfaceLayoutV1,
        open_references: &[ObjectId],
        created_at: i64,
    ) -> Result<SurfaceSnapshotV1View, DomainError>;
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
        let activity = make_activity(
            &field_id,
            &self.local_user,
            "FIELD_CREATED",
            "FIELD",
            &field_id.0,
            None,
            trace_id.clone(),
            now,
        );
        self.repository.create_field(&field, &activity)?;
        Ok((
            field,
            event(field_id, FieldChangeKind::Created, None, 1, trace_id),
        ))
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
        validate_expected_revision(expected_revision)?;
        validate_legacy_focus(&focus)?;
        let activity = make_activity(
            &field_id,
            &self.local_user,
            "FIELD_FOCUS_UPDATED",
            "FIELD",
            &field_id.0,
            None,
            trace_id.clone(),
            now,
        );
        let field =
            self.repository
                .update_focus(&field_id, expected_revision, &focus, now, &activity)?;
        let event = event(
            field_id,
            FieldChangeKind::FocusUpdated,
            None,
            field.revision,
            trace_id,
        );
        Ok((field, event))
    }

    pub fn update_mode(
        &self,
        request: UpdateFieldModeRequest,
        trace_id: TraceId,
        now: i64,
    ) -> Result<(Field, DomainEventDTO), DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        validate_expected_revision(request.expected_field_revision)?;
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "FIELD_MODE_UPDATED",
            "FIELD",
            &request.field_id.0,
            None,
            trace_id.clone(),
            now,
        );
        let field = self.repository.update_mode(
            &request.field_id,
            request.expected_field_revision,
            request.mode,
            now,
            &activity,
        )?;
        let event = event(
            request.field_id,
            FieldChangeKind::ModeUpdated,
            None,
            field.revision,
            trace_id,
        );
        Ok((field, event))
    }

    pub fn set_focus_v1(
        &self,
        request: SetFieldFocusV1Request,
        trace_id: TraceId,
        now: i64,
    ) -> Result<(Field, DomainEventDTO), DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        validate_expected_revision(request.expected_field_revision)?;
        if let Some(focus) = &request.focus {
            validate_focus_ids(focus)?;
        }
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "FIELD_FOCUS_UPDATED",
            "FIELD",
            &request.field_id.0,
            None,
            trace_id.clone(),
            now,
        );
        let field = self.repository.set_focus_v1(
            &request.field_id,
            request.expected_field_revision,
            request.focus.as_ref(),
            now,
            &activity,
        )?;
        let event = event(
            request.field_id,
            FieldChangeKind::FocusUpdated,
            None,
            field.revision,
            trace_id,
        );
        Ok((field, event))
    }
}

#[derive(Clone)]
pub struct RealityService<R: RealityRepository> {
    repository: R,
    local_user: PrincipalId,
    device_id: DeviceId,
}

impl<R: RealityRepository> RealityService<R> {
    pub fn new(repository: R, local_user: PrincipalId, device_id: DeviceId) -> Self {
        Self {
            repository,
            local_user,
            device_id,
        }
    }

    pub fn create_state(
        &self,
        request: CreateStateRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(RealityMutationResult<StateView>, DomainEventDTO), DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        let content = validate_content(request.content)?;
        validate_confidence(request.confidence)?;
        let id = StateId::new(Uuid::now_v7().to_string());
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "STATE_CREATED",
            "STATE",
            &id.0,
            None,
            trace.clone(),
            now,
        );
        let state = StateView {
            id: id.clone(),
            field_id: request.field_id.clone(),
            kind: request.kind,
            content,
            status: StateStatus::Active,
            confidence: request.confidence,
            created_by: self.local_user.clone(),
            source_activity_id: ActivityId::new(activity.id.clone()),
            revision: 1,
            created_at: now,
            updated_at: now,
        };
        let result = self.repository.create_state(&state, &activity)?;
        let event = mutation_event(
            request.field_id,
            FieldChangeKind::StateCreated,
            ResourceRef::State { state_id: id },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn get_state(&self, request: StateReferenceRequest) -> Result<StateView, DomainError> {
        validate_two_ids(&request.field_id.0, &request.state_id.0)?;
        self.repository
            .get_state(&request.field_id, &request.state_id)
    }

    pub fn list_states(
        &self,
        request: ListStatesRequest,
    ) -> Result<Page<StateView, StateCursor>, DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        validate_limit(request.limit)?;
        if let Some(cursor) = &request.cursor {
            validate_uuid_v7("cursor.state_id", &cursor.state_id.0)?;
        }
        self.repository.list_states(&request)
    }

    pub fn revise_state(
        &self,
        request: ReviseStateRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(RealityMutationResult<StateView>, DomainEventDTO), DomainError> {
        validate_two_ids(&request.field_id.0, &request.state_id.0)?;
        validate_expected_revision(request.expected_state_revision)?;
        let content = validate_content(request.content.clone())?;
        validate_confidence(request.confidence)?;
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "STATE_REVISED",
            "STATE",
            &request.state_id.0,
            None,
            trace.clone(),
            now,
        );
        let result =
            self.repository
                .revise_state(&request, &content, request.confidence, now, &activity)?;
        let event = mutation_event(
            request.field_id.clone(),
            FieldChangeKind::StateRevised,
            ResourceRef::State {
                state_id: request.state_id.clone(),
            },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn transition_state(
        &self,
        request: TransitionStateRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(RealityMutationResult<StateView>, DomainEventDTO), DomainError> {
        validate_two_ids(&request.field_id.0, &request.state_id.0)?;
        validate_expected_revision(request.expected_state_revision)?;
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "STATE_STATUS_CHANGED",
            "STATE",
            &request.state_id.0,
            None,
            trace.clone(),
            now,
        );
        let result = self.repository.transition_state(&request, now, &activity)?;
        let event = mutation_event(
            request.field_id.clone(),
            FieldChangeKind::StateStatusChanged,
            ResourceRef::State {
                state_id: request.state_id.clone(),
            },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn supersede_state(
        &self,
        request: SupersedeStateRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(SupersedeStateResult, DomainEventDTO), DomainError> {
        validate_two_ids(&request.field_id.0, &request.state_id.0)?;
        validate_expected_revision(request.expected_state_revision)?;
        let content = validate_content(request.replacement_content.clone())?;
        validate_confidence(request.replacement_confidence)?;
        let replacement_id = StateId::new(Uuid::now_v7().to_string());
        let relation_id = RelationId::new(Uuid::now_v7().to_string());
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "STATE_SUPERSEDED",
            "STATE",
            &request.state_id.0,
            None,
            trace.clone(),
            now,
        );
        let result = self.repository.supersede_state(
            &request,
            &replacement_id,
            &relation_id,
            &content,
            request.replacement_confidence,
            now,
            &activity,
        )?;
        let event = mutation_event(
            request.field_id,
            FieldChangeKind::StateSuperseded,
            ResourceRef::State {
                state_id: replacement_id,
            },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn create_reference(
        &self,
        request: CreateReferenceRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(RealityMutationResult<ReferenceView>, DomainEventDTO), DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        let title = validate_reference_title(request.title)?;
        let canonical_url = canonicalize_https_url(&request.url)?;
        let id = ObjectId::new(Uuid::now_v7().to_string());
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "REFERENCE_CREATED",
            "OBJECT",
            &id.0,
            None,
            trace.clone(),
            now,
        );
        let reference = ReferenceView {
            id: id.clone(),
            field_id: request.field_id.clone(),
            owner_principal_id: self.local_user.clone(),
            created_by: self.local_user.clone(),
            source_activity_id: ActivityId::new(activity.id.clone()),
            kind: ObjectKind::Reference,
            title,
            reference_type: ReferenceType::HttpsUrl,
            canonical_url,
            lifecycle: ObjectLifecycle::Active,
            revision: 1,
            created_at: now,
            updated_at: now,
        };
        let result = self.repository.create_reference(&reference, &activity)?;
        let event = mutation_event(
            request.field_id,
            FieldChangeKind::ReferenceCreated,
            ResourceRef::Reference { object_id: id },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn get_reference(&self, request: ReferenceRequest) -> Result<ReferenceView, DomainError> {
        validate_two_ids(&request.field_id.0, &request.object_id.0)?;
        self.repository
            .get_reference(&request.field_id, &request.object_id)
    }

    pub fn list_references(
        &self,
        request: ListReferencesRequest,
    ) -> Result<Page<ReferenceView, ReferenceCursor>, DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        validate_limit(request.limit)?;
        if let Some(cursor) = &request.cursor {
            validate_uuid_v7("cursor.object_id", &cursor.object_id.0)?;
        }
        self.repository.list_references(&request)
    }

    pub fn revise_reference(
        &self,
        request: ReviseReferenceRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(RealityMutationResult<ReferenceView>, DomainEventDTO), DomainError> {
        validate_two_ids(&request.field_id.0, &request.object_id.0)?;
        validate_expected_revision(request.expected_object_revision)?;
        let title = validate_reference_title(request.title.clone())?;
        let canonical_url = canonicalize_https_url(&request.url)?;
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "REFERENCE_REVISED",
            "OBJECT",
            &request.object_id.0,
            None,
            trace.clone(),
            now,
        );
        let result =
            self.repository
                .revise_reference(&request, &title, &canonical_url, now, &activity)?;
        let event = mutation_event(
            request.field_id.clone(),
            FieldChangeKind::ReferenceRevised,
            ResourceRef::Reference {
                object_id: request.object_id.clone(),
            },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn archive_reference(
        &self,
        request: ArchiveReferenceRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(RealityMutationResult<ReferenceView>, DomainEventDTO), DomainError> {
        validate_two_ids(&request.field_id.0, &request.object_id.0)?;
        validate_expected_revision(request.expected_object_revision)?;
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "REFERENCE_ARCHIVED",
            "OBJECT",
            &request.object_id.0,
            None,
            trace.clone(),
            now,
        );
        let result = self
            .repository
            .archive_reference(&request, now, &activity)?;
        let event = mutation_event(
            request.field_id.clone(),
            FieldChangeKind::ReferenceArchived,
            ResourceRef::Reference {
                object_id: request.object_id.clone(),
            },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn restore_reference(
        &self,
        request: RestoreReferenceRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(RealityMutationResult<ReferenceView>, DomainEventDTO), DomainError> {
        validate_two_ids(&request.field_id.0, &request.object_id.0)?;
        validate_expected_revision(request.expected_object_revision)?;
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "REFERENCE_RESTORED",
            "OBJECT",
            &request.object_id.0,
            None,
            trace.clone(),
            now,
        );
        let result = self
            .repository
            .restore_reference(&request, now, &activity)?;
        let event = mutation_event(
            request.field_id.clone(),
            FieldChangeKind::ReferenceRestored,
            ResourceRef::Reference {
                object_id: request.object_id.clone(),
            },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn attach_reference_source(
        &self,
        request: AttachReferenceSourceRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(RealityMutationResult<RelationView>, DomainEventDTO), DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        validate_uuid_v7("state_id", &request.state_id.0)?;
        validate_uuid_v7("reference_id", &request.reference_id.0)?;
        let id = RelationId::new(Uuid::now_v7().to_string());
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "REFERENCE_SOURCE_ATTACHED",
            "RELATION",
            &id.0,
            None,
            trace.clone(),
            now,
        );
        let result = self
            .repository
            .attach_reference_source(&request, &id, now, &activity)?;
        let event = mutation_event(
            request.field_id,
            FieldChangeKind::ReferenceSourceAttached,
            ResourceRef::Relation { relation_id: id },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn retract_reference_source(
        &self,
        request: RetractReferenceSourceRequest,
        trace: TraceId,
        now: i64,
    ) -> Result<(RealityMutationResult<RelationView>, DomainEventDTO), DomainError> {
        validate_two_ids(&request.field_id.0, &request.relation_id.0)?;
        validate_expected_revision(request.expected_relation_revision)?;
        let activity = make_activity(
            &request.field_id,
            &self.local_user,
            "REFERENCE_SOURCE_RETRACTED",
            "RELATION",
            &request.relation_id.0,
            None,
            trace.clone(),
            now,
        );
        let result = self
            .repository
            .retract_reference_source(&request, now, &activity)?;
        let event = mutation_event(
            request.field_id.clone(),
            FieldChangeKind::ReferenceSourceRetracted,
            ResourceRef::Relation {
                relation_id: request.relation_id.clone(),
            },
            result.field_revision,
            trace,
        );
        Ok((result, event))
    }

    pub fn list_relations(
        &self,
        request: ListRelationsRequest,
    ) -> Result<Page<RelationView, RelationCursor>, DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        validate_limit(request.limit)?;
        if let Some(cursor) = &request.cursor {
            validate_uuid_v7("cursor.relation_id", &cursor.relation_id.0)?;
        }
        self.repository.list_relations(&request)
    }

    pub fn list_activities(
        &self,
        request: ListActivitiesRequest,
    ) -> Result<Page<ActivityView, ActivityCursor>, DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        validate_limit(request.limit)?;
        if let Some(cursor) = &request.cursor {
            validate_uuid_v7("cursor.activity_id", &cursor.activity_id.0)?;
        }
        self.repository.list_activities(&request)
    }

    pub fn resume_v1(&self, field_id: FieldId) -> Result<FieldResumeV1View, DomainError> {
        validate_uuid_v7("field_id", &field_id.0)?;
        self.repository.resume_v1(&field_id, &self.device_id)
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

    pub fn save_v1(
        &self,
        request: SaveSurfaceSnapshotV1Request,
        now: i64,
    ) -> Result<SurfaceSnapshotV1View, DomainError> {
        validate_uuid_v7("field_id", &request.field_id.0)?;
        let open = validate_surface_layout(&request.layout)?;
        self.repository.save_snapshot_v1(
            &request.field_id,
            &self.device_id,
            &request.layout,
            &open,
            now,
        )
    }
}

pub fn validate_title(title: String) -> Result<String, DomainError> {
    let title = title.trim().to_owned();
    if !(1..=120).contains(&title.chars().count()) {
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

pub fn validate_content(content: String) -> Result<String, DomainError> {
    let content = content.trim().to_owned();
    if !(1..=4000).contains(&content.chars().count()) {
        return Err(DomainError::Validation(
            "State content must contain 1 to 4000 characters".into(),
        ));
    }
    Ok(content)
}

pub fn validate_reference_title(title: String) -> Result<String, DomainError> {
    let title = title.trim().to_owned();
    if !(1..=120).contains(&title.chars().count()) {
        return Err(DomainError::Validation(
            "Reference title must contain 1 to 120 characters".into(),
        ));
    }
    Ok(title)
}

pub fn validate_confidence(confidence: Option<f64>) -> Result<(), DomainError> {
    if confidence.is_some_and(|value| !value.is_finite() || !(0.0..=1.0).contains(&value)) {
        return Err(DomainError::Validation(
            "confidence must be finite and between 0 and 1".into(),
        ));
    }
    Ok(())
}

pub fn canonicalize_https_url(input: &str) -> Result<String, DomainError> {
    let trimmed = input.trim();
    if trimmed.len() > 2048
        || trimmed
            .bytes()
            .any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control())
    {
        return Err(DomainError::InvalidReferenceUrl);
    }
    let (scheme, remainder) = trimmed
        .split_at_checked(8)
        .ok_or(DomainError::InvalidReferenceUrl)?;
    if !scheme.eq_ignore_ascii_case("https://") {
        return Err(DomainError::InvalidReferenceUrl);
    }
    let authority_end = remainder.find(['/', '?', '#']).unwrap_or(remainder.len());
    let authority = &remainder[..authority_end];
    let suffix = &remainder[authority_end..];
    if authority.is_empty() || authority.contains('@') {
        return Err(DomainError::InvalidReferenceUrl);
    }
    let normalized_authority = if authority.starts_with('[') {
        let close = authority
            .find(']')
            .ok_or(DomainError::InvalidReferenceUrl)?;
        let address = authority[1..close]
            .parse::<std::net::Ipv6Addr>()
            .map_err(|_| DomainError::InvalidReferenceUrl)?;
        let host = format!("[{address}]");
        match &authority[close + 1..] {
            "" | ":443" => host,
            port if port.starts_with(':') && port[1..].parse::<u16>().is_ok() => {
                format!("{host}{port}")
            }
            _ => return Err(DomainError::InvalidReferenceUrl),
        }
    } else {
        let (host, port) = match authority.rsplit_once(':') {
            Some((host, port))
                if !port.is_empty() && port.bytes().all(|byte| byte.is_ascii_digit()) =>
            {
                (host, Some(port))
            }
            Some(_) => return Err(DomainError::InvalidReferenceUrl),
            None => (authority, None),
        };
        let domain = host.strip_suffix('.').unwrap_or(host);
        if domain.is_empty() || domain.len() > 253 {
            return Err(DomainError::InvalidReferenceUrl);
        }
        if domain
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte == b'.')
        {
            domain
                .parse::<std::net::Ipv4Addr>()
                .map_err(|_| DomainError::InvalidReferenceUrl)?;
        } else if domain.split('.').any(|label| {
            label.is_empty()
                || label.len() > 63
                || !label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                || !label
                    .as_bytes()
                    .first()
                    .is_some_and(u8::is_ascii_alphanumeric)
                || !label
                    .as_bytes()
                    .last()
                    .is_some_and(u8::is_ascii_alphanumeric)
        }) {
            return Err(DomainError::InvalidReferenceUrl);
        }
        if port.is_some_and(|value| value.parse::<u16>().is_err()) {
            return Err(DomainError::InvalidReferenceUrl);
        }
        match port {
            Some("443") | None => host.to_ascii_lowercase(),
            Some(port) => format!("{}:{port}", host.to_ascii_lowercase()),
        }
    };
    let normalized_suffix = if suffix.is_empty() {
        "/".to_owned()
    } else if suffix.starts_with('?') || suffix.starts_with('#') {
        format!("/{suffix}")
    } else {
        suffix.to_owned()
    };
    let canonical = format!("https://{normalized_authority}{normalized_suffix}");
    if canonical.len() > 2048 {
        return Err(DomainError::InvalidReferenceUrl);
    }
    Ok(canonical)
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

pub fn validate_surface_layout(layout: &SurfaceLayoutV1) -> Result<Vec<ObjectId>, DomainError> {
    if layout.version != 1 {
        return Err(DomainError::InvalidSurfaceLayout(
            "version must be 1".into(),
        ));
    }
    let expected_supports = match layout.template {
        SurfaceTemplateV1::PrimaryOnly => 0,
        SurfaceTemplateV1::PrimarySupportRight => 1,
        SurfaceTemplateV1::PrimaryTwoSupportsRight => 2,
    };
    if layout.supporting.len() != expected_supports || layout.supporting.len() > 2 {
        return Err(DomainError::InvalidSurfaceLayout(
            "template/pane count mismatch".into(),
        ));
    }
    if layout.primary.collapsed {
        return Err(DomainError::InvalidSurfaceLayout(
            "primary cannot be collapsed".into(),
        ));
    }
    let panes = std::iter::once(&layout.primary)
        .chain(layout.supporting.iter())
        .collect::<Vec<_>>();
    let mut pane_ids: Vec<&str> = Vec::new();
    let mut task_count = 0;
    let mut references = Vec::new();
    for pane in &panes {
        let id = &pane.pane_id.0;
        if !(1..=64).contains(&id.len())
            || !id.bytes().all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
            })
        {
            return Err(DomainError::InvalidSurfaceLayout("invalid pane_id".into()));
        }
        if pane_ids.contains(&id.as_str()) {
            return Err(DomainError::InvalidSurfaceLayout(
                "duplicate pane_id".into(),
            ));
        }
        pane_ids.push(id.as_str());
        match (&pane.primitive, &pane.binding) {
            (SurfacePrimitiveV1::TaskPane, PaneBindingV1::FieldTasks) => task_count += 1,
            (SurfacePrimitiveV1::ReferencePane, PaneBindingV1::Reference { object_id }) => {
                validate_uuid_v7("layout.reference.object_id", &object_id.0)?;
                if references.contains(object_id) {
                    return Err(DomainError::InvalidSurfaceLayout(
                        "duplicate reference pane".into(),
                    ));
                }
                references.push(object_id.clone());
            }
            _ => {
                return Err(DomainError::InvalidSurfaceLayout(
                    "primitive/binding mismatch".into(),
                ));
            }
        }
    }
    if task_count > 1 {
        return Err(DomainError::InvalidSurfaceLayout(
            "at most one task pane is allowed".into(),
        ));
    }
    let focused = panes
        .iter()
        .find(|pane| pane.pane_id == layout.focused_pane_id)
        .ok_or_else(|| DomainError::InvalidSurfaceLayout("focused pane does not exist".into()))?;
    if focused.collapsed {
        return Err(DomainError::InvalidSurfaceLayout(
            "focused pane cannot be collapsed".into(),
        ));
    }
    Ok(references)
}

pub fn parse_persisted_focus(
    value: Option<&Value>,
) -> (FocusSource, Option<FieldFocusV1>, Option<String>) {
    match value {
        None | Some(Value::Null) => (FocusSource::None, None, None),
        Some(value) => {
            if let Ok(focus) = serde_json::from_value::<FieldFocusV1>(value.clone()) {
                return (FocusSource::TypedV1, Some(focus), None);
            }
            if let Value::String(text) = value {
                let trimmed = text.trim();
                if (1..=120).contains(&trimmed.chars().count()) {
                    return (FocusSource::LegacyText, None, Some(trimmed.to_owned()));
                }
            }
            (FocusSource::InvalidIgnored, None, None)
        }
    }
}

fn validate_legacy_focus(focus: &Value) -> Result<(), DomainError> {
    match focus {
        Value::String(text) if (1..=120).contains(&text.trim().chars().count()) => Ok(()),
        _ => Err(DomainError::Validation(
            "legacy focus must be a string containing 1 to 120 characters".into(),
        )),
    }
}

fn validate_focus_ids(focus: &FieldFocusV1) -> Result<(), DomainError> {
    match focus {
        FieldFocusV1::State { state_id } => validate_uuid_v7("focus.state_id", &state_id.0),
        FieldFocusV1::Reference { object_id } => validate_uuid_v7("focus.object_id", &object_id.0),
    }
}

fn validate_two_ids(field: &str, resource: &str) -> Result<(), DomainError> {
    validate_uuid_v7("field_id", field)?;
    validate_uuid_v7("resource_id", resource)
}
fn validate_expected_revision(value: u64) -> Result<(), DomainError> {
    if value < 1 {
        Err(DomainError::Validation(
            "expected revision must be at least 1".into(),
        ))
    } else {
        Ok(())
    }
}
fn validate_limit(value: Option<u16>) -> Result<(), DomainError> {
    if value.is_some_and(|limit| !(1..=100).contains(&limit)) {
        Err(DomainError::Validation(
            "limit must be between 1 and 100".into(),
        ))
    } else {
        Ok(())
    }
}

#[allow(clippy::too_many_arguments)]
fn make_activity(
    field_id: &FieldId,
    actor: &PrincipalId,
    action: &str,
    target_type: &str,
    target_id: &str,
    intent: Option<&str>,
    trace_id: TraceId,
    now: i64,
) -> Activity {
    Activity {
        id: Uuid::now_v7().to_string(),
        field_id: Some(field_id.clone()),
        actor_principal_id: actor.clone(),
        intent: intent.map(str::to_owned),
        action: action.into(),
        target_type: Some(target_type.into()),
        target_id: Some(target_id.into()),
        summary: Some(action.replace('_', " ").to_ascii_lowercase()),
        trace_id,
        created_at: now,
    }
}

fn event(
    field_id: FieldId,
    change: FieldChangeKind,
    resource: Option<ResourceRef>,
    revision: u64,
    trace_id: TraceId,
) -> DomainEventDTO {
    DomainEventDTO {
        event: "event.field.changed".into(),
        field_id,
        change,
        resource,
        revision,
        trace_id,
    }
}
fn mutation_event(
    field_id: FieldId,
    change: FieldChangeKind,
    resource: ResourceRef,
    revision: u64,
    trace_id: TraceId,
) -> DomainEventDTO {
    event(field_id, change, Some(resource), revision, trace_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_content_and_confidence_are_bounded() {
        assert_eq!(validate_content("  truth  ".into()).unwrap(), "truth");
        assert!(validate_content(" ".into()).is_err());
        assert!(validate_content("x".repeat(4001)).is_err());
        assert!(validate_confidence(Some(f64::NAN)).is_err());
        assert!(validate_confidence(Some(1.01)).is_err());
    }

    #[test]
    fn https_canonicalization_is_stable_and_rejects_credentials() {
        assert_eq!(
            canonicalize_https_url(" HTTPS://Example.COM:443 ").unwrap(),
            "https://example.com/"
        );
        assert_eq!(
            canonicalize_https_url("https://example.com?q=1#x").unwrap(),
            "https://example.com/?q=1#x"
        );
        assert!(canonicalize_https_url("http://example.com").is_err());
        assert!(canonicalize_https_url("https://user@example.com").is_err());
    }

    #[test]
    fn surface_layout_enforces_frozen_composition() {
        assert!(
            validate_surface_layout(&SurfaceLayoutV1::default_task())
                .unwrap()
                .is_empty()
        );
        let mut invalid = SurfaceLayoutV1::default_task();
        invalid.primary.collapsed = true;
        assert!(matches!(
            validate_surface_layout(&invalid),
            Err(DomainError::InvalidSurfaceLayout(_))
        ));
    }

    #[test]
    fn focus_compatibility_distinguishes_typed_legacy_and_invalid() {
        let id = StateId::new(Uuid::now_v7().to_string());
        let typed = serde_json::to_value(FieldFocusV1::State { state_id: id }).unwrap();
        assert_eq!(parse_persisted_focus(Some(&typed)).0, FocusSource::TypedV1);
        assert_eq!(
            parse_persisted_focus(Some(&Value::String(" task ".into()))).0,
            FocusSource::LegacyText
        );
        assert_eq!(
            parse_persisted_focus(Some(&serde_json::json!({"legacy":true}))).0,
            FocusSource::InvalidIgnored
        );
    }
}
