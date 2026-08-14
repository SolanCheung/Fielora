use fielora_contracts::*;
use std::fs;
use std::path::PathBuf;
use ts_rs::{Config, TS};

fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("workspace root");
    let output_dir = root.join("packages/contracts/generated");
    fs::create_dir_all(&output_dir).expect("create generated contract directory");

    let config = Config::default();
    let declarations = [
        FieldId::decl(&config),
        PrincipalId::decl(&config),
        DeviceId::decl(&config),
        ObjectId::decl(&config),
        StateId::decl(&config),
        ActivityId::decl(&config),
        RelationId::decl(&config),
        PaneId::decl(&config),
        SurfaceSnapshotId::decl(&config),
        TraceId::decl(&config),
        ProtocolVersion::decl(&config),
        FipcErrorData::decl(&config),
        HelloRequest::decl(&config),
        HelloResponse::decl(&config),
        FieldLifecycle::decl(&config),
        FieldMode::decl(&config),
        FieldStateKind::decl(&config),
        StateStatus::decl(&config),
        StateTransitionTarget::decl(&config),
        ObjectKind::decl(&config),
        ReferenceType::decl(&config),
        ObjectLifecycle::decl(&config),
        RelationType::decl(&config),
        RelationLifecycle::decl(&config),
        ResourceType::decl(&config),
        FieldFocusV1::decl(&config),
        FocusSource::decl(&config),
        CreateFieldRequest::decl(&config),
        UpdateFocusRequest::decl(&config),
        SetFieldFocusV1Request::decl(&config),
        UpdateFieldModeRequest::decl(&config),
        FieldReferenceRequest::decl(&config),
        FieldSummary::decl(&config),
        FieldView::decl(&config),
        StateView::decl(&config),
        CreateStateRequest::decl(&config),
        ReviseStateRequest::decl(&config),
        TransitionStateRequest::decl(&config),
        SupersedeStateRequest::decl(&config),
        StateReferenceRequest::decl(&config),
        StateCursor::decl(&config),
        ListStatesRequest::decl(&config),
        ReferenceView::decl(&config),
        CreateReferenceRequest::decl(&config),
        ReviseReferenceRequest::decl(&config),
        ArchiveReferenceRequest::decl(&config),
        RestoreReferenceRequest::decl(&config),
        ReferenceRequest::decl(&config),
        ReferenceCursor::decl(&config),
        ListReferencesRequest::decl(&config),
        ResourceRef::decl(&config),
        LineageEndpointRef::decl(&config),
        RelationView::decl(&config),
        AttachReferenceSourceRequest::decl(&config),
        RetractReferenceSourceRequest::decl(&config),
        RelationCursor::decl(&config),
        ListRelationsRequest::decl(&config),
        ActivityAction::decl(&config),
        ActivityView::decl(&config),
        ActivityCursor::decl(&config),
        ListActivitiesRequest::decl(&config),
        Page::<StateView, StateCursor>::decl(&config),
        RealityMutationResult::<StateView>::decl(&config),
        SupersedeStateResult::decl(&config),
        SurfaceTemplateV1::decl(&config),
        SurfacePrimitiveV1::decl(&config),
        PaneBindingV1::decl(&config),
        SurfacePaneV1::decl(&config),
        SurfaceLayoutV1::decl(&config),
        SaveSurfaceSnapshotRequest::decl(&config),
        SaveSurfaceSnapshotV1Request::decl(&config),
        SurfaceSnapshotView::decl(&config),
        SurfaceSnapshotV1View::decl(&config),
        SurfaceResumeView::decl(&config),
        SnapshotFreshness::decl(&config),
        LayoutSource::decl(&config),
        ExternalChangeAssessment::decl(&config),
        ResumeStateItem::decl(&config),
        ContinuationReason::decl(&config),
        ContinuationTarget::decl(&config),
        ResumeContinuation::decl(&config),
        FieldResumeV1View::decl(&config),
        FieldChangeKind::decl(&config),
        DomainEventDTO::decl(&config),
        CoreHealthState::decl(&config),
        HealthDTO::decl(&config),
    ];

    let mut output = String::from("// Generated from Rust DTOs. Do not edit by hand.\n\n");
    for declaration in declarations {
        output.push_str("export ");
        output.push_str(&declaration);
        output.push_str("\n\n");
    }
    fs::write(output_dir.join("index.ts"), output).expect("write TypeScript contracts");
}
