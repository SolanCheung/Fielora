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
        SurfaceSnapshotId::decl(&config),
        TraceId::decl(&config),
        ProtocolVersion::decl(&config),
        FipcErrorData::decl(&config),
        HelloRequest::decl(&config),
        HelloResponse::decl(&config),
        CreateFieldRequest::decl(&config),
        UpdateFocusRequest::decl(&config),
        SaveSurfaceSnapshotRequest::decl(&config),
        FieldReferenceRequest::decl(&config),
        FieldLifecycle::decl(&config),
        FieldMode::decl(&config),
        FieldSummary::decl(&config),
        FieldView::decl(&config),
        SurfaceSnapshotView::decl(&config),
        SurfaceResumeView::decl(&config),
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
