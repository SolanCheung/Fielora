use fielora_contracts::*;
use fielora_field::{
    Activity, DomainError, Field, FieldRepository, RealityRepository, SurfaceRepository,
    SurfaceSnapshot, parse_persisted_focus, validate_surface_layout,
};
use fielora_platform::DeviceIdentity;
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::thread::{self, JoinHandle};
use thiserror::Error;
use uuid::Uuid;

const MIGRATION_0001: &str = include_str!("../migrations/0001_core.sql");
const MIGRATION_0002: &str = include_str!("../migrations/0002_phase02_reality.sql");
const MIGRATION_0001_NAME: &str = "core";
const MIGRATION_0002_NAME: &str = "phase02_reality";
const MIGRATION_0002_FROZEN_SHA256: &str =
    "9152a933786c33a58769d1c0268084a4471113fd3eee1436d122dcb1986039f9";
const SCHEMA_VERSION: u32 = 2;
const LOCAL_USER_NAME: &str = "Local user";
const SYSTEM_NAME: &str = "Fielora system";

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("SQLite failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("migration checksum mismatch for version {version}")]
    MigrationChecksum { version: u32 },
    #[error("SQLite open gate failed: {0}")]
    OpenGate(String),
    #[error("storage worker stopped")]
    WorkerStopped,
    #[error("invalid persisted JSON: {0}")]
    InvalidJson(String),
    #[error("revision cannot be represented as SQLite INTEGER")]
    RevisionOutOfRange,
    #[error("MIGRATION_INCOMPATIBLE_DATA")]
    MigrationIncompatibleData,
}

enum StorageCommand {
    Task(Box<dyn FnOnce(&mut Connection) + Send>),
    CreateField {
        field: Field,
        activity: Activity,
        reply: SyncSender<Result<(), DomainError>>,
    },
    ListFields {
        reply: SyncSender<Result<Vec<Field>, DomainError>>,
    },
    GetField {
        field_id: FieldId,
        reply: SyncSender<Result<Field, DomainError>>,
    },
    UpdateFocus {
        field_id: FieldId,
        expected_revision: u64,
        focus: Value,
        updated_at: i64,
        activity: Activity,
        reply: SyncSender<Result<Field, DomainError>>,
    },
    SaveSnapshot {
        field_id: FieldId,
        device_id: DeviceId,
        layout: Value,
        open_objects: Vec<ObjectId>,
        created_at: i64,
        reply: SyncSender<Result<SurfaceSnapshot, DomainError>>,
    },
    LatestSnapshot {
        field_id: FieldId,
        device_id: DeviceId,
        reply: SyncSender<Result<Option<SurfaceSnapshot>, DomainError>>,
    },
    Shutdown,
}

#[derive(Clone)]
pub struct StorageHandle {
    sender: SyncSender<StorageCommand>,
    pub local_user: PrincipalId,
    pub device_id: DeviceId,
    pub database_path: PathBuf,
}

pub struct StorageWorker {
    handle: StorageHandle,
    worker: Option<JoinHandle<()>>,
}

impl StorageWorker {
    pub fn start(
        database_path: &Path,
        device: DeviceIdentity,
        now: i64,
    ) -> Result<Self, StorageError> {
        let mut connection = open_connection(database_path)?;
        apply_migrations(&mut connection, now)?;
        let local_user = bootstrap_records(&mut connection, &device, now)?;
        let (sender, receiver) = mpsc::sync_channel(64);
        let path = database_path.to_path_buf();
        let worker = thread::Builder::new()
            .name("fielora-storage".into())
            .spawn(move || run_worker(connection, receiver))
            .map_err(|_| StorageError::WorkerStopped)?;
        let handle = StorageHandle {
            sender,
            local_user,
            device_id: device.id,
            database_path: path,
        };
        Ok(Self {
            handle,
            worker: Some(worker),
        })
    }

    pub fn handle(&self) -> StorageHandle {
        self.handle.clone()
    }

    pub fn shutdown(mut self) {
        let _ = self.handle.sender.send(StorageCommand::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for StorageWorker {
    fn drop(&mut self) {
        let _ = self.handle.sender.send(StorageCommand::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl FieldRepository for StorageHandle {
    fn create_field(&self, field: &Field, activity: &Activity) -> Result<(), DomainError> {
        request(&self.sender, |reply| StorageCommand::CreateField {
            field: field.clone(),
            activity: activity.clone(),
            reply,
        })
    }

    fn list_active_fields(&self) -> Result<Vec<Field>, DomainError> {
        request(&self.sender, |reply| StorageCommand::ListFields { reply })
    }

    fn get_field(&self, field_id: &FieldId) -> Result<Field, DomainError> {
        request(&self.sender, |reply| StorageCommand::GetField {
            field_id: field_id.clone(),
            reply,
        })
    }

    fn update_focus(
        &self,
        field_id: &FieldId,
        expected_revision: u64,
        focus: &Value,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<Field, DomainError> {
        request(&self.sender, |reply| StorageCommand::UpdateFocus {
            field_id: field_id.clone(),
            expected_revision,
            focus: focus.clone(),
            updated_at,
            activity: activity.clone(),
            reply,
        })
    }

    fn update_mode(
        &self,
        field_id: &FieldId,
        expected_revision: u64,
        mode: Option<FieldMode>,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<Field, DomainError> {
        let field_id = field_id.clone();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            update_mode(
                connection,
                &field_id,
                expected_revision,
                mode,
                updated_at,
                &activity,
            )
        })
    }

    fn set_focus_v1(
        &self,
        field_id: &FieldId,
        expected_revision: u64,
        focus: Option<&FieldFocusV1>,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<Field, DomainError> {
        let field_id = field_id.clone();
        let focus = focus.cloned();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            set_focus_v1(
                connection,
                &field_id,
                expected_revision,
                focus.as_ref(),
                updated_at,
                &activity,
            )
        })
    }
}

impl SurfaceRepository for StorageHandle {
    fn save_snapshot(
        &self,
        field_id: &FieldId,
        device_id: &DeviceId,
        layout: &Value,
        open_objects: &[ObjectId],
        created_at: i64,
    ) -> Result<SurfaceSnapshot, DomainError> {
        request(&self.sender, |reply| StorageCommand::SaveSnapshot {
            field_id: field_id.clone(),
            device_id: device_id.clone(),
            layout: layout.clone(),
            open_objects: open_objects.to_vec(),
            created_at,
            reply,
        })
    }

    fn latest_snapshot(
        &self,
        field_id: &FieldId,
        device_id: &DeviceId,
    ) -> Result<Option<SurfaceSnapshot>, DomainError> {
        request(&self.sender, |reply| StorageCommand::LatestSnapshot {
            field_id: field_id.clone(),
            device_id: device_id.clone(),
            reply,
        })
    }

    fn save_snapshot_v1(
        &self,
        field_id: &FieldId,
        device_id: &DeviceId,
        layout: &SurfaceLayoutV1,
        open_references: &[ObjectId],
        created_at: i64,
    ) -> Result<SurfaceSnapshotV1View, DomainError> {
        let field_id = field_id.clone();
        let device_id = device_id.clone();
        let layout = layout.clone();
        let open_references = open_references.to_vec();
        request_task(&self.sender, move |connection| {
            save_snapshot_v1(
                connection,
                &field_id,
                &device_id,
                &layout,
                &open_references,
                created_at,
            )
        })
    }
}

impl RealityRepository for StorageHandle {
    fn create_state(
        &self,
        state: &StateView,
        activity: &Activity,
    ) -> Result<RealityMutationResult<StateView>, DomainError> {
        let state = state.clone();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            create_state(connection, &state, &activity)
        })
    }

    fn get_state(&self, field_id: &FieldId, state_id: &StateId) -> Result<StateView, DomainError> {
        let field_id = field_id.clone();
        let state_id = state_id.clone();
        request_task(&self.sender, move |connection| {
            get_state(connection, &field_id, &state_id)
        })
    }

    fn list_states(
        &self,
        request: &ListStatesRequest,
    ) -> Result<Page<StateView, StateCursor>, DomainError> {
        let request = request.clone();
        request_task(&self.sender, move |connection| {
            list_states(connection, &request)
        })
    }

    fn revise_state(
        &self,
        request: &ReviseStateRequest,
        content: &str,
        confidence: Option<f64>,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<StateView>, DomainError> {
        let request = request.clone();
        let content = content.to_owned();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            revise_state(
                connection, &request, &content, confidence, updated_at, &activity,
            )
        })
    }

    fn transition_state(
        &self,
        request: &TransitionStateRequest,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<StateView>, DomainError> {
        let request = request.clone();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            transition_state(connection, &request, updated_at, &activity)
        })
    }

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
    ) -> Result<SupersedeStateResult, DomainError> {
        let request = request.clone();
        let replacement_id = replacement_id.clone();
        let relation_id = relation_id.clone();
        let content = replacement_content.to_owned();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            supersede_state(
                connection,
                &request,
                &replacement_id,
                &relation_id,
                &content,
                replacement_confidence,
                updated_at,
                &activity,
            )
        })
    }

    fn create_reference(
        &self,
        reference: &ReferenceView,
        activity: &Activity,
    ) -> Result<RealityMutationResult<ReferenceView>, DomainError> {
        let reference = reference.clone();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            create_reference(connection, &reference, &activity)
        })
    }

    fn get_reference(
        &self,
        field_id: &FieldId,
        object_id: &ObjectId,
    ) -> Result<ReferenceView, DomainError> {
        let field_id = field_id.clone();
        let object_id = object_id.clone();
        request_task(&self.sender, move |connection| {
            get_reference(connection, &field_id, &object_id)
        })
    }

    fn list_references(
        &self,
        request: &ListReferencesRequest,
    ) -> Result<Page<ReferenceView, ReferenceCursor>, DomainError> {
        let request = request.clone();
        request_task(&self.sender, move |connection| {
            list_references(connection, &request)
        })
    }

    fn revise_reference(
        &self,
        request: &ReviseReferenceRequest,
        title: &str,
        canonical_url: &str,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<ReferenceView>, DomainError> {
        let request = request.clone();
        let title = title.to_owned();
        let url = canonical_url.to_owned();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            revise_reference(connection, &request, &title, &url, updated_at, &activity)
        })
    }

    fn archive_reference(
        &self,
        request: &ArchiveReferenceRequest,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<ReferenceView>, DomainError> {
        let request = request.clone();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            archive_reference(connection, &request, updated_at, &activity)
        })
    }

    fn restore_reference(
        &self,
        request: &RestoreReferenceRequest,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<ReferenceView>, DomainError> {
        let request = request.clone();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            restore_reference(connection, &request, updated_at, &activity)
        })
    }

    fn attach_reference_source(
        &self,
        request: &AttachReferenceSourceRequest,
        relation_id: &RelationId,
        created_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<RelationView>, DomainError> {
        let request = request.clone();
        let relation_id = relation_id.clone();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            attach_reference_source(connection, &request, &relation_id, created_at, &activity)
        })
    }

    fn retract_reference_source(
        &self,
        request: &RetractReferenceSourceRequest,
        updated_at: i64,
        activity: &Activity,
    ) -> Result<RealityMutationResult<RelationView>, DomainError> {
        let request = request.clone();
        let activity = activity.clone();
        request_task(&self.sender, move |connection| {
            retract_reference_source(connection, &request, updated_at, &activity)
        })
    }

    fn list_relations(
        &self,
        request: &ListRelationsRequest,
    ) -> Result<Page<RelationView, RelationCursor>, DomainError> {
        let request = request.clone();
        request_task(&self.sender, move |connection| {
            list_relations(connection, &request)
        })
    }

    fn list_activities(
        &self,
        request: &ListActivitiesRequest,
    ) -> Result<Page<ActivityView, ActivityCursor>, DomainError> {
        let request = request.clone();
        request_task(&self.sender, move |connection| {
            list_activities(connection, &request)
        })
    }

    fn resume_v1(
        &self,
        field_id: &FieldId,
        device_id: &DeviceId,
    ) -> Result<FieldResumeV1View, DomainError> {
        let field_id = field_id.clone();
        let device_id = device_id.clone();
        request_task(&self.sender, move |connection| {
            resume_v1(connection, &field_id, &device_id)
        })
    }
}

fn request<T>(
    sender: &SyncSender<StorageCommand>,
    command: impl FnOnce(SyncSender<Result<T, DomainError>>) -> StorageCommand,
) -> Result<T, DomainError> {
    let (reply_tx, reply_rx) = mpsc::sync_channel(1);
    sender
        .send(command(reply_tx))
        .map_err(|_| DomainError::Storage("storage worker stopped".into()))?;
    reply_rx
        .recv()
        .map_err(|_| DomainError::Storage("storage worker stopped".into()))?
}

fn request_task<T: Send + 'static>(
    sender: &SyncSender<StorageCommand>,
    task: impl FnOnce(&mut Connection) -> Result<T, DomainError> + Send + 'static,
) -> Result<T, DomainError> {
    let (reply_tx, reply_rx) = mpsc::sync_channel(1);
    sender
        .send(StorageCommand::Task(Box::new(move |connection| {
            let _ = reply_tx.send(task(connection));
        })))
        .map_err(|_| DomainError::Storage("storage worker stopped".into()))?;
    reply_rx
        .recv()
        .map_err(|_| DomainError::Storage("storage worker stopped".into()))?
}

fn run_worker(mut connection: Connection, receiver: Receiver<StorageCommand>) {
    while let Ok(command) = receiver.recv() {
        match command {
            StorageCommand::Task(task) => task(&mut connection),
            StorageCommand::CreateField {
                field,
                activity,
                reply,
            } => {
                let result = create_field(&mut connection, &field, &activity).map_err(map_storage);
                let _ = reply.send(result);
            }
            StorageCommand::ListFields { reply } => {
                let _ = reply.send(list_fields(&connection).map_err(map_storage));
            }
            StorageCommand::GetField { field_id, reply } => {
                let _ = reply.send(get_field(&connection, &field_id));
            }
            StorageCommand::UpdateFocus {
                field_id,
                expected_revision,
                focus,
                updated_at,
                activity,
                reply,
            } => {
                let _ = reply.send(update_focus(
                    &mut connection,
                    &field_id,
                    expected_revision,
                    &focus,
                    updated_at,
                    &activity,
                ));
            }
            StorageCommand::SaveSnapshot {
                field_id,
                device_id,
                layout,
                open_objects,
                created_at,
                reply,
            } => {
                let result = save_snapshot(
                    &mut connection,
                    &field_id,
                    &device_id,
                    &layout,
                    &open_objects,
                    created_at,
                );
                let _ = reply.send(result);
            }
            StorageCommand::LatestSnapshot {
                field_id,
                device_id,
                reply,
            } => {
                let _ = reply.send(latest_snapshot(&connection, &field_id, &device_id));
            }
            StorageCommand::Shutdown => break,
        }
    }
}

pub fn open_connection(path: &Path) -> Result<Connection, StorageError> {
    let connection = Connection::open(path)?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;\nPRAGMA journal_mode = WAL;\nPRAGMA synchronous = FULL;\nPRAGMA busy_timeout = 5000;",
    )?;
    let foreign_keys: i64 = connection.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
    let journal_mode: String = connection.query_row("PRAGMA journal_mode", [], |row| row.get(0))?;
    let synchronous: i64 = connection.query_row("PRAGMA synchronous", [], |row| row.get(0))?;
    let busy_timeout: i64 = connection.query_row("PRAGMA busy_timeout", [], |row| row.get(0))?;
    if foreign_keys != 1 {
        return Err(StorageError::OpenGate("foreign_keys is not ON".into()));
    }
    if !journal_mode.eq_ignore_ascii_case("wal") {
        return Err(StorageError::OpenGate("journal_mode is not WAL".into()));
    }
    if synchronous != 2 {
        return Err(StorageError::OpenGate("synchronous is not FULL".into()));
    }
    if busy_timeout != 5000 {
        return Err(StorageError::OpenGate("busy_timeout is not 5000".into()));
    }
    Ok(connection)
}

pub fn apply_migrations(connection: &mut Connection, now: i64) -> Result<(), StorageError> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (\n\
         version INTEGER PRIMARY KEY,\n\
         name TEXT NOT NULL,\n\
         checksum TEXT NOT NULL,\n\
         applied_at INTEGER NOT NULL\n\
         );",
    )?;
    let checksum_0001 = migration_checksum(MIGRATION_0001);
    let checksum_0002 = frozen_migration_checksum(MIGRATION_0002);
    if checksum_0002 != MIGRATION_0002_FROZEN_SHA256 {
        return Err(StorageError::MigrationChecksum { version: 2 });
    }

    verify_applied_migration(connection, 1, MIGRATION_0001_NAME, &checksum_0001)?;
    if !migration_exists(connection, 1)? {
        let transaction =
            connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        transaction.execute_batch(MIGRATION_0001)?;
        validate_base_schema(&transaction)?;
        transaction.execute(
            "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (1, ?1, ?2, ?3)",
            params![MIGRATION_0001_NAME, checksum_0001, now],
        )?;
        transaction.commit()?;
    }

    verify_applied_migration(connection, 2, MIGRATION_0002_NAME, &checksum_0002)?;
    if !migration_exists(connection, 2)? {
        let transaction =
            connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        if transaction.execute_batch(MIGRATION_0002).is_err() {
            return Err(StorageError::MigrationIncompatibleData);
        }
        transaction.execute(
            "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (2, ?1, ?2, ?3)",
            params![MIGRATION_0002_NAME, checksum_0002, now],
        )?;
        validate_schema(&transaction)?;
        transaction.commit()?;
    }
    validate_schema(connection)?;
    Ok(())
}

fn migration_exists(connection: &Connection, version: u32) -> Result<bool, StorageError> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=?1)",
            [version],
            |row| row.get(0),
        )
        .map_err(StorageError::from)
}

fn verify_applied_migration(
    connection: &Connection,
    version: u32,
    expected_name: &str,
    expected_checksum: &str,
) -> Result<(), StorageError> {
    let existing: Option<(String, String)> = connection
        .query_row(
            "SELECT name, checksum FROM schema_migrations WHERE version=?1",
            [version],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    if let Some((name, checksum)) = existing {
        if checksum != expected_checksum {
            return Err(StorageError::MigrationChecksum { version });
        }
        if name != expected_name {
            return Err(StorageError::OpenGate(format!(
                "migration {version} name mismatch"
            )));
        }
    }
    Ok(())
}

fn migration_checksum(sql: &str) -> String {
    format!("{:x}", Sha256::digest(sql.as_bytes()))
}

fn frozen_migration_checksum(sql: &str) -> String {
    let normalized = sql.replace("\r\n", "\n");
    migration_checksum(normalized.trim_end_matches('\n'))
}

fn validate_base_schema(connection: &Connection) -> Result<(), StorageError> {
    const TABLES: [&str; 10] = [
        "schema_migrations",
        "principals",
        "fields",
        "field_state_entries",
        "field_objects",
        "field_relations",
        "activities",
        "devices",
        "device_bindings",
        "surface_snapshots",
    ];
    for table in TABLES {
        let exists: i64 = connection.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |row| row.get(0),
        )?;
        if exists != 1 {
            return Err(StorageError::OpenGate(format!(
                "migration validation missing table {table}"
            )));
        }
    }
    Ok(())
}

fn validate_schema(connection: &Connection) -> Result<(), StorageError> {
    validate_base_schema(connection)?;
    const REQUIRED_COLUMNS: [(&str, &str); 10] = [
        ("field_state_entries", "status"),
        ("field_state_entries", "source_activity_id"),
        ("field_objects", "created_by"),
        ("field_objects", "source_activity_id"),
        ("field_objects", "lifecycle_status"),
        ("field_objects", "revision"),
        ("field_relations", "lifecycle_status"),
        ("field_relations", "revision"),
        ("field_relations", "updated_at"),
        ("field_state_entries", "revision"),
    ];
    for (table, column) in REQUIRED_COLUMNS {
        let count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info(?1) WHERE name=?2 AND \"notnull\"=1",
            params![table, column],
            |row| row.get(0),
        )?;
        if count != 1 {
            return Err(StorageError::OpenGate(format!(
                "required NOT NULL column missing: {table}.{column}"
            )));
        }
    }
    const REQUIRED_CHECKS: [(&str, &[&str]); 3] = [
        (
            "field_state_entries",
            &[
                "KIND IN (",
                "STATUS IN (",
                "STATUS != 'RESOLVED'",
                "CONFIDENCE >= 0.0",
                "CREATED_AT <= UPDATED_AT",
            ],
        ),
        (
            "field_objects",
            &[
                "OBJECT_KIND = 'REFERENCE'",
                "EXTERNAL_REF_TYPE = 'HTTPS_URL'",
                "LIFECYCLE_STATUS IN ('ACTIVE', 'ARCHIVED')",
                "REVISION >= 1",
                "CREATED_AT <= UPDATED_AT",
            ],
        ),
        (
            "field_relations",
            &[
                "RELATION_TYPE IN ('SOURCED_FROM', 'SUPERSEDED_BY')",
                "LIFECYCLE_STATUS IN ('ACTIVE', 'RETRACTED')",
                "FROM_TYPE != TO_TYPE OR FROM_ID != TO_ID",
                "RELATION_TYPE = 'SOURCED_FROM'",
                "RELATION_TYPE = 'SUPERSEDED_BY'",
            ],
        ),
    ];
    for (table, fragments) in REQUIRED_CHECKS {
        let sql: String = connection.query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |row| row.get(0),
        )?;
        let normalized = sql
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_ascii_uppercase();
        for fragment in fragments {
            if !normalized.contains(fragment) {
                return Err(StorageError::OpenGate(format!(
                    "required CHECK missing: {table}:{fragment}"
                )));
            }
        }
    }
    const REQUIRED_INDEXES: [(&str, &str); 6] = [
        (
            "idx_state_field_status_updated",
            "FIELD_ID, STATUS, UPDATED_AT DESC, ID DESC",
        ),
        (
            "idx_objects_field_lifecycle_updated",
            "FIELD_ID, LIFECYCLE_STATUS, UPDATED_AT DESC, ID DESC",
        ),
        (
            "idx_relations_field_lifecycle_created",
            "FIELD_ID, LIFECYCLE_STATUS, CREATED_AT DESC, ID DESC",
        ),
        (
            "uq_active_reference_per_field",
            "WHERE OBJECT_KIND = 'REFERENCE' AND LIFECYCLE_STATUS = 'ACTIVE'",
        ),
        (
            "uq_active_relation_tuple",
            "WHERE LIFECYCLE_STATUS = 'ACTIVE'",
        ),
        (
            "idx_activities_field_created",
            "FIELD_ID, CREATED_AT DESC, ID DESC",
        ),
    ];
    for (index, expected_fragment) in REQUIRED_INDEXES {
        let sql: Option<String> = connection
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type='index' AND name=?1",
                [index],
                |row| row.get(0),
            )
            .optional()?;
        let Some(sql) = sql else {
            return Err(StorageError::OpenGate(format!(
                "required index missing: {index}"
            )));
        };
        let normalized = sql
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_ascii_uppercase();
        if !normalized.contains(expected_fragment) {
            return Err(StorageError::OpenGate(format!(
                "required index shape invalid: {index}"
            )));
        }
    }
    let foreign_key_violation: Option<String> = connection
        .query_row("PRAGMA foreign_key_check", [], |row| row.get(0))
        .optional()?;
    if foreign_key_violation.is_some() {
        return Err(StorageError::OpenGate("foreign_key_check failed".into()));
    }
    let migrations: i64 = connection.query_row(
        "SELECT COUNT(*) FROM schema_migrations WHERE version IN (1,2)",
        [],
        |row| row.get(0),
    )?;
    if migrations != 2 {
        return Err(StorageError::OpenGate(
            "migration registry incomplete".into(),
        ));
    }
    Ok(())
}

fn bootstrap_records(
    connection: &mut Connection,
    device: &DeviceIdentity,
    now: i64,
) -> Result<PrincipalId, StorageError> {
    let transaction = connection.transaction()?;
    let local_user = ensure_principal(&transaction, "LOCAL_USER", LOCAL_USER_NAME, now)?;
    ensure_principal(&transaction, "SYSTEM", SYSTEM_NAME, now)?;
    transaction.execute(
        "INSERT INTO devices(id, name, platform, architecture, created_at, last_seen_at)\n\
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)\n\
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, platform=excluded.platform,\n\
         architecture=excluded.architecture, last_seen_at=excluded.last_seen_at",
        params![
            device.id.0,
            device.name,
            device.platform,
            device.architecture,
            now
        ],
    )?;
    transaction.commit()?;
    Ok(local_user)
}

fn ensure_principal(
    transaction: &Transaction<'_>,
    kind: &str,
    display_name: &str,
    now: i64,
) -> Result<PrincipalId, StorageError> {
    if let Some(id) = transaction
        .query_row("SELECT id FROM principals WHERE kind=?1", [kind], |row| {
            row.get::<_, String>(0)
        })
        .optional()?
    {
        return Ok(PrincipalId::new(id));
    }
    let id = PrincipalId::new(Uuid::now_v7().to_string());
    transaction.execute(
        "INSERT INTO principals(id, kind, display_name, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id.0, kind, display_name, now],
    )?;
    Ok(id)
}

fn create_field(
    connection: &mut Connection,
    field: &Field,
    activity: &Activity,
) -> Result<(), StorageError> {
    let transaction = connection.transaction()?;
    transaction.execute(
        "INSERT INTO fields(id, owner_principal_id, title, goal, lifecycle_status, current_mode,\n\
         current_focus_json, revision, created_at, updated_at)\n\
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            field.id.0,
            field.owner_principal_id.0,
            field.title,
            field.goal,
            lifecycle_to_db(field.lifecycle_status),
            field.current_mode.map(mode_to_db),
            encode_optional_json(&field.current_focus)?,
            revision_to_sql(field.revision)?,
            field.created_at,
            field.updated_at
        ],
    )?;
    insert_activity(&transaction, activity)?;
    transaction.commit()?;
    Ok(())
}

fn list_fields(connection: &Connection) -> Result<Vec<Field>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT id, owner_principal_id, title, goal, lifecycle_status, current_mode,\n\
         current_focus_json, revision, created_at, updated_at\n\
         FROM fields WHERE lifecycle_status='ACTIVE' ORDER BY updated_at DESC",
    )?;
    statement
        .query_map([], field_from_row)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(StorageError::from)
}

fn get_field(connection: &Connection, field_id: &FieldId) -> Result<Field, DomainError> {
    connection
        .query_row(
            "SELECT id, owner_principal_id, title, goal, lifecycle_status, current_mode,\n\
             current_focus_json, revision, created_at, updated_at FROM fields WHERE id=?1",
            [&field_id.0],
            field_from_row,
        )
        .optional()
        .map_err(|error| DomainError::Storage(error.to_string()))?
        .ok_or(DomainError::NotFound)
}

fn update_focus(
    connection: &mut Connection,
    field_id: &FieldId,
    expected_revision: u64,
    focus: &Value,
    updated_at: i64,
    activity: &Activity,
) -> Result<Field, DomainError> {
    let transaction = connection
        .transaction()
        .map_err(|error| DomainError::Storage(error.to_string()))?;
    let focus_json =
        serde_json::to_string(focus).map_err(|error| DomainError::Validation(error.to_string()))?;
    let changed = transaction
        .execute(
            "UPDATE fields SET current_focus_json=?1, revision=revision+1, updated_at=MAX(updated_at, ?2)\n\
             WHERE id=?3 AND revision=?4",
            params![
                focus_json,
                updated_at,
                field_id.0,
                i64::try_from(expected_revision).map_err(|_| DomainError::Validation(
                    "expected_revision is too large".into()
                ))?
            ],
        )
        .map_err(|error| DomainError::Storage(error.to_string()))?;
    if changed == 0 {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM fields WHERE id=?1)",
                [&field_id.0],
                |row| row.get(0),
            )
            .map_err(|error| DomainError::Storage(error.to_string()))?;
        return Err(if exists {
            DomainError::RevisionConflict
        } else {
            DomainError::NotFound
        });
    }
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field = transaction
        .query_row(
            "SELECT id, owner_principal_id, title, goal, lifecycle_status, current_mode,\n\
             current_focus_json, revision, created_at, updated_at FROM fields WHERE id=?1",
            [&field_id.0],
            field_from_row,
        )
        .map_err(|error| DomainError::Storage(error.to_string()))?;
    transaction
        .commit()
        .map_err(|error| DomainError::Storage(error.to_string()))?;
    Ok(field)
}

fn update_mode(
    connection: &mut Connection,
    field_id: &FieldId,
    expected_revision: u64,
    mode: Option<FieldMode>,
    updated_at: i64,
    activity: &Activity,
) -> Result<Field, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let changed = transaction
        .execute(
            "UPDATE fields SET current_mode=?1, revision=revision+1, updated_at=MAX(updated_at, ?2) WHERE id=?3 AND revision=?4",
            params![mode.map(mode_to_db), updated_at, field_id.0, revision_to_domain(expected_revision)?],
        )
        .map_err(storage_domain)?;
    ensure_mutated_field(&transaction, field_id, changed)?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field = get_field_tx(&transaction, field_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(field)
}

fn set_focus_v1(
    connection: &mut Connection,
    field_id: &FieldId,
    expected_revision: u64,
    focus: Option<&FieldFocusV1>,
    updated_at: i64,
    activity: &Activity,
) -> Result<Field, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    if let Some(focus) = focus {
        match focus {
            FieldFocusV1::State { state_id } => {
                let valid: bool = transaction
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM field_state_entries WHERE id=?1 AND field_id=?2 AND status IN ('ACTIVE','RESOLVED'))",
                        params![state_id.0, field_id.0],
                        |row| row.get(0),
                    )
                    .map_err(storage_domain)?;
                if !valid {
                    return Err(DomainError::InvalidRelationEndpoint);
                }
            }
            FieldFocusV1::Reference { object_id } => {
                let valid: bool = transaction
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM field_objects WHERE id=?1 AND field_id=?2 AND lifecycle_status='ACTIVE')",
                        params![object_id.0, field_id.0],
                        |row| row.get(0),
                    )
                    .map_err(storage_domain)?;
                if !valid {
                    return Err(DomainError::InvalidRelationEndpoint);
                }
            }
        }
    }
    let focus_json = focus
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| DomainError::Validation(error.to_string()))?;
    let changed = transaction
        .execute(
            "UPDATE fields SET current_focus_json=?1, revision=revision+1, updated_at=MAX(updated_at, ?2) WHERE id=?3 AND revision=?4",
            params![focus_json, updated_at, field_id.0, revision_to_domain(expected_revision)?],
        )
        .map_err(storage_domain)?;
    ensure_mutated_field(&transaction, field_id, changed)?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field = get_field_tx(&transaction, field_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(field)
}

fn ensure_mutated_field(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    changed: usize,
) -> Result<(), DomainError> {
    if changed == 1 {
        return Ok(());
    }
    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM fields WHERE id=?1)",
            [&field_id.0],
            |row| row.get(0),
        )
        .map_err(storage_domain)?;
    Err(if exists {
        DomainError::RevisionConflict
    } else {
        DomainError::NotFound
    })
}

fn get_field_tx(transaction: &Transaction<'_>, field_id: &FieldId) -> Result<Field, DomainError> {
    transaction
        .query_row(
            "SELECT id, owner_principal_id, title, goal, lifecycle_status, current_mode, current_focus_json, revision, created_at, updated_at FROM fields WHERE id=?1",
            [&field_id.0], field_from_row,
        )
        .optional()
        .map_err(storage_domain)?
        .ok_or(DomainError::NotFound)
}

fn revision_to_domain(value: u64) -> Result<i64, DomainError> {
    i64::try_from(value).map_err(|_| DomainError::Validation("revision is too large".into()))
}

fn storage_domain(error: rusqlite::Error) -> DomainError {
    DomainError::Storage(error.to_string())
}

fn insert_activity(transaction: &Transaction<'_>, activity: &Activity) -> Result<(), StorageError> {
    transaction.execute(
        "INSERT INTO activities(id, field_id, actor_principal_id, intent, action, target_type,\n\
         target_id, summary, trace_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            activity.id,
            activity.field_id.as_ref().map(|id| &id.0),
            activity.actor_principal_id.0,
            activity.intent,
            activity.action,
            activity.target_type,
            activity.target_id,
            activity.summary,
            activity.trace_id.0,
            activity.created_at
        ],
    )?;
    Ok(())
}

fn save_snapshot(
    connection: &mut Connection,
    field_id: &FieldId,
    device_id: &DeviceId,
    layout: &Value,
    open_objects: &[ObjectId],
    created_at: i64,
) -> Result<SurfaceSnapshot, DomainError> {
    let transaction = connection
        .transaction()
        .map_err(|error| DomainError::Storage(error.to_string()))?;
    let observed_field_revision: Option<i64> = transaction
        .query_row(
            "SELECT revision FROM fields WHERE id=?1",
            [&field_id.0],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| DomainError::Storage(error.to_string()))?;
    let observed_field_revision =
        u64::try_from(observed_field_revision.ok_or(DomainError::NotFound)?)
            .map_err(|_| DomainError::Storage("persisted revision is invalid".into()))?;
    let id = SurfaceSnapshotId::new(Uuid::now_v7().to_string());
    let layout_json = serde_json::to_string(layout)
        .map_err(|error| DomainError::Validation(error.to_string()))?;
    let open_objects_json = serde_json::to_string(
        &open_objects
            .iter()
            .map(|object| &object.0)
            .collect::<Vec<_>>(),
    )
    .map_err(|error| DomainError::Validation(error.to_string()))?;
    transaction
        .execute(
            "INSERT INTO surface_snapshots(id, field_id, device_id, observed_field_revision,\n\
             layout_json, open_objects_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id.0,
                field_id.0,
                device_id.0,
                i64::try_from(observed_field_revision)
                    .map_err(|_| DomainError::Storage("revision is too large".into()))?,
                layout_json,
                open_objects_json,
                created_at
            ],
        )
        .map_err(|error| DomainError::Storage(error.to_string()))?;
    transaction
        .execute(
            "DELETE FROM surface_snapshots WHERE id IN (\n\
             SELECT id FROM surface_snapshots WHERE field_id=?1 AND device_id=?2\n\
             ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 10)",
            params![field_id.0, device_id.0],
        )
        .map_err(|error| DomainError::Storage(error.to_string()))?;
    transaction
        .commit()
        .map_err(|error| DomainError::Storage(error.to_string()))?;
    Ok(SurfaceSnapshot {
        id,
        field_id: field_id.clone(),
        device_id: device_id.clone(),
        observed_field_revision,
        layout: layout.clone(),
        open_objects: open_objects.to_vec(),
        created_at,
    })
}

fn latest_snapshot(
    connection: &Connection,
    field_id: &FieldId,
    device_id: &DeviceId,
) -> Result<Option<SurfaceSnapshot>, DomainError> {
    connection
        .query_row(
            "SELECT id, field_id, device_id, observed_field_revision, layout_json,\n\
             open_objects_json, created_at FROM surface_snapshots\n\
             WHERE field_id=?1 AND device_id=?2 ORDER BY created_at DESC, id DESC LIMIT 1",
            params![field_id.0, device_id.0],
            snapshot_from_row,
        )
        .optional()
        .map_err(|error| DomainError::Storage(error.to_string()))
}

fn save_snapshot_v1(
    connection: &mut Connection,
    field_id: &FieldId,
    device_id: &DeviceId,
    layout: &SurfaceLayoutV1,
    open_references: &[ObjectId],
    created_at: i64,
) -> Result<SurfaceSnapshotV1View, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let observed: Option<i64> = transaction
        .query_row(
            "SELECT revision FROM fields WHERE id=?1",
            [&field_id.0],
            |row| row.get(0),
        )
        .optional()
        .map_err(storage_domain)?;
    let observed = u64::try_from(observed.ok_or(DomainError::NotFound)?)
        .map_err(|_| DomainError::Storage("persisted revision is invalid".into()))?;
    for object_id in open_references {
        let active: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM field_objects WHERE id=?1 AND field_id=?2 AND object_kind='REFERENCE' AND lifecycle_status='ACTIVE')",
                params![object_id.0, field_id.0],
                |row| row.get(0),
            )
            .map_err(storage_domain)?;
        if !active {
            return Err(DomainError::SnapshotReferenceUnavailable);
        }
    }
    let id = SurfaceSnapshotId::new(Uuid::now_v7().to_string());
    let layout_json = serde_json::to_string(layout)
        .map_err(|error| DomainError::Validation(error.to_string()))?;
    let open_json =
        serde_json::to_string(&open_references.iter().map(|id| &id.0).collect::<Vec<_>>())
            .map_err(|error| DomainError::Validation(error.to_string()))?;
    transaction
        .execute(
            "INSERT INTO surface_snapshots(id, field_id, device_id, observed_field_revision, layout_json, open_objects_json, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![id.0, field_id.0, device_id.0, revision_to_domain(observed)?, layout_json, open_json, created_at],
        )
        .map_err(storage_domain)?;
    transaction
        .execute(
            "DELETE FROM surface_snapshots WHERE id IN (SELECT id FROM surface_snapshots WHERE field_id=?1 AND device_id=?2 ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 10)",
            params![field_id.0, device_id.0],
        )
        .map_err(storage_domain)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(SurfaceSnapshotV1View {
        id,
        field_id: field_id.clone(),
        device_id: device_id.clone(),
        observed_field_revision: observed,
        layout: layout.clone(),
        open_reference_ids: open_references.to_vec(),
        created_at,
    })
}

fn bump_field(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    updated_at: i64,
) -> Result<u64, DomainError> {
    let changed = transaction
        .execute(
            "UPDATE fields SET revision=revision+1, updated_at=MAX(updated_at, ?1) WHERE id=?2 AND lifecycle_status='ACTIVE'",
            params![updated_at, field_id.0],
        )
        .map_err(storage_domain)?;
    if changed == 0 {
        return Err(DomainError::NotFound);
    }
    let revision: i64 = transaction
        .query_row(
            "SELECT revision FROM fields WHERE id=?1",
            [&field_id.0],
            |row| row.get(0),
        )
        .map_err(storage_domain)?;
    u64::try_from(revision)
        .map_err(|_| DomainError::Storage("persisted field revision is invalid".into()))
}

fn create_state(
    connection: &mut Connection,
    state: &StateView,
    activity: &Activity,
) -> Result<RealityMutationResult<StateView>, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    ensure_active_field(&transaction, &state.field_id)?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    transaction
        .execute(
            "INSERT INTO field_state_entries(id,field_id,kind,content,status,confidence,created_by,source_activity_id,revision,created_at,updated_at) VALUES (?1,?2,?3,?4,'ACTIVE',?5,?6,?7,1,?8,?8)",
            params![state.id.0, state.field_id.0, state_kind_to_db(state.kind), state.content, state.confidence, state.created_by.0, state.source_activity_id.0, state.created_at],
        )
        .map_err(storage_domain)?;
    let field_revision = bump_field(&transaction, &state.field_id, state.created_at)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(RealityMutationResult {
        resource: state.clone(),
        field_revision,
    })
}

fn get_state(
    connection: &Connection,
    field_id: &FieldId,
    state_id: &StateId,
) -> Result<StateView, DomainError> {
    connection
        .query_row(
            "SELECT id,field_id,kind,content,status,confidence,created_by,source_activity_id,revision,created_at,updated_at FROM field_state_entries WHERE id=?1 AND field_id=?2",
            params![state_id.0, field_id.0], state_from_row,
        )
        .optional().map_err(storage_domain)?.ok_or(DomainError::NotFound)
}

fn get_state_tx(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    state_id: &StateId,
) -> Result<StateView, DomainError> {
    transaction
        .query_row(
            "SELECT id,field_id,kind,content,status,confidence,created_by,source_activity_id,revision,created_at,updated_at FROM field_state_entries WHERE id=?1 AND field_id=?2",
            params![state_id.0, field_id.0], state_from_row,
        )
        .optional().map_err(storage_domain)?.ok_or(DomainError::NotFound)
}

fn list_states(
    connection: &Connection,
    request: &ListStatesRequest,
) -> Result<Page<StateView, StateCursor>, DomainError> {
    let limit = i64::from(request.limit.unwrap_or(50));
    let kind = request.kind.map(state_kind_to_db);
    let status = request.status.map(state_status_to_db);
    let cursor_time = request.cursor.as_ref().map(|cursor| cursor.updated_at);
    let cursor_id = request
        .cursor
        .as_ref()
        .map(|cursor| cursor.state_id.0.as_str());
    let mut statement = connection.prepare(
        "SELECT id,field_id,kind,content,status,confidence,created_by,source_activity_id,revision,created_at,updated_at FROM field_state_entries
         WHERE field_id=?1 AND (?2 IS NULL OR kind=?2) AND (?3 IS NULL OR status=?3)
         AND (?4 IS NULL OR updated_at < ?4 OR (updated_at=?4 AND id < ?5))
         ORDER BY updated_at DESC,id DESC LIMIT ?6"
    ).map_err(storage_domain)?;
    let rows = statement
        .query_map(
            params![
                request.field_id.0,
                kind,
                status,
                cursor_time,
                cursor_id,
                limit + 1
            ],
            state_from_row,
        )
        .map_err(storage_domain)?;
    let mut items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_domain)?;
    let next_cursor = if items.len() > limit as usize {
        items.truncate(limit as usize);
        items.last().map(|item| StateCursor {
            updated_at: item.updated_at,
            state_id: item.id.clone(),
        })
    } else {
        None
    };
    Ok(Page { items, next_cursor })
}

fn revise_state(
    connection: &mut Connection,
    request: &ReviseStateRequest,
    content: &str,
    confidence: Option<f64>,
    updated_at: i64,
    activity: &Activity,
) -> Result<RealityMutationResult<StateView>, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let current = get_state_tx(&transaction, &request.field_id, &request.state_id)?;
    if matches!(
        current.status,
        StateStatus::Superseded | StateStatus::Retracted
    ) {
        return Err(DomainError::TerminalResource);
    }
    if current.revision != request.expected_state_revision {
        return Err(DomainError::RevisionConflict);
    }
    transaction.execute(
        "UPDATE field_state_entries SET content=?1,confidence=?2,revision=revision+1,updated_at=MAX(updated_at,?3) WHERE id=?4",
        params![content, confidence, updated_at, request.state_id.0],
    ).map_err(storage_domain)?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field_revision = bump_field(&transaction, &request.field_id, updated_at)?;
    let resource = get_state_tx(&transaction, &request.field_id, &request.state_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(RealityMutationResult {
        resource,
        field_revision,
    })
}

fn transition_state(
    connection: &mut Connection,
    request: &TransitionStateRequest,
    updated_at: i64,
    activity: &Activity,
) -> Result<RealityMutationResult<StateView>, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let current = get_state_tx(&transaction, &request.field_id, &request.state_id)?;
    if matches!(
        current.status,
        StateStatus::Superseded | StateStatus::Retracted
    ) {
        return Err(DomainError::TerminalResource);
    }
    if current.revision != request.expected_state_revision {
        return Err(DomainError::RevisionConflict);
    }
    let target = match request.target {
        StateTransitionTarget::Active => StateStatus::Active,
        StateTransitionTarget::Resolved => StateStatus::Resolved,
        StateTransitionTarget::Retracted => StateStatus::Retracted,
    };
    let resolvable = matches!(
        current.kind,
        FieldStateKind::Question | FieldStateKind::Task | FieldStateKind::Blocker
    );
    let allowed = match (current.status, target) {
        (StateStatus::Active, StateStatus::Retracted) => true,
        (StateStatus::Active, StateStatus::Resolved)
        | (StateStatus::Resolved, StateStatus::Active)
        | (StateStatus::Resolved, StateStatus::Retracted) => resolvable,
        _ => false,
    };
    if !allowed {
        return Err(DomainError::InvalidStateTransition);
    }
    transaction.execute(
        "UPDATE field_state_entries SET status=?1,revision=revision+1,updated_at=MAX(updated_at,?2) WHERE id=?3",
        params![state_status_to_db(target), updated_at, request.state_id.0],
    ).map_err(storage_domain)?;
    if target == StateStatus::Retracted {
        clear_typed_state_focus(&transaction, &request.field_id, &request.state_id)?;
    }
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field_revision = bump_field(&transaction, &request.field_id, updated_at)?;
    let resource = get_state_tx(&transaction, &request.field_id, &request.state_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(RealityMutationResult {
        resource,
        field_revision,
    })
}

#[allow(clippy::too_many_arguments)]
fn supersede_state(
    connection: &mut Connection,
    request: &SupersedeStateRequest,
    replacement_id: &StateId,
    relation_id: &RelationId,
    content: &str,
    confidence: Option<f64>,
    updated_at: i64,
    activity: &Activity,
) -> Result<SupersedeStateResult, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let current = get_state_tx(&transaction, &request.field_id, &request.state_id)?;
    if matches!(
        current.status,
        StateStatus::Superseded | StateStatus::Retracted
    ) {
        return Err(DomainError::TerminalResource);
    }
    if current.revision != request.expected_state_revision {
        return Err(DomainError::RevisionConflict);
    }
    if current.status == StateStatus::Resolved
        && !matches!(
            current.kind,
            FieldStateKind::Question | FieldStateKind::Task | FieldStateKind::Blocker
        )
    {
        return Err(DomainError::InvalidStateTransition);
    }
    insert_activity(&transaction, activity).map_err(map_storage)?;
    transaction.execute("UPDATE field_state_entries SET status='SUPERSEDED',revision=revision+1,updated_at=MAX(updated_at,?1) WHERE id=?2", params![updated_at, request.state_id.0]).map_err(storage_domain)?;
    transaction.execute(
        "INSERT INTO field_state_entries(id,field_id,kind,content,status,confidence,created_by,source_activity_id,revision,created_at,updated_at) VALUES (?1,?2,?3,?4,'ACTIVE',?5,?6,?7,1,?8,?8)",
        params![replacement_id.0, request.field_id.0, state_kind_to_db(current.kind), content, confidence, activity.actor_principal_id.0, activity.id, updated_at],
    ).map_err(storage_domain)?;
    transaction.execute(
        "INSERT INTO field_relations(id,field_id,from_type,from_id,relation_type,to_type,to_id,lifecycle_status,created_by,revision,created_at,updated_at) VALUES (?1,?2,'STATE',?3,'SUPERSEDED_BY','STATE',?4,'ACTIVE',?5,1,?6,?6)",
        params![relation_id.0, request.field_id.0, request.state_id.0, replacement_id.0, activity.actor_principal_id.0, updated_at],
    ).map_err(storage_domain)?;
    move_typed_state_focus(
        &transaction,
        &request.field_id,
        &request.state_id,
        replacement_id,
    )?;
    let field_revision = bump_field(&transaction, &request.field_id, updated_at)?;
    let previous = get_state_tx(&transaction, &request.field_id, &request.state_id)?;
    let replacement = get_state_tx(&transaction, &request.field_id, replacement_id)?;
    let relation = get_relation_tx(&transaction, &request.field_id, relation_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(SupersedeStateResult {
        previous,
        replacement,
        relation,
        field_revision,
    })
}

fn create_reference(
    connection: &mut Connection,
    reference: &ReferenceView,
    activity: &Activity,
) -> Result<RealityMutationResult<ReferenceView>, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    ensure_active_field(&transaction, &reference.field_id)?;
    ensure_reference_url_available(
        &transaction,
        &reference.field_id,
        &reference.canonical_url,
        None,
    )?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    transaction.execute(
        "INSERT INTO field_objects(id,field_id,owner_principal_id,created_by,source_activity_id,object_kind,title,external_ref_type,external_ref_id,metadata_json,lifecycle_status,revision,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,'REFERENCE',?6,'HTTPS_URL',?7,'{}','ACTIVE',1,?8,?8)",
        params![reference.id.0, reference.field_id.0, reference.owner_principal_id.0, reference.created_by.0, reference.source_activity_id.0, reference.title, reference.canonical_url, reference.created_at],
    ).map_err(map_reference_write_error)?;
    let field_revision = bump_field(&transaction, &reference.field_id, reference.created_at)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(RealityMutationResult {
        resource: reference.clone(),
        field_revision,
    })
}

fn get_reference(
    connection: &Connection,
    field_id: &FieldId,
    object_id: &ObjectId,
) -> Result<ReferenceView, DomainError> {
    connection.query_row(
        "SELECT id,field_id,owner_principal_id,created_by,source_activity_id,object_kind,title,external_ref_type,external_ref_id,lifecycle_status,revision,created_at,updated_at FROM field_objects WHERE id=?1 AND field_id=?2",
        params![object_id.0, field_id.0], reference_from_row,
    ).optional().map_err(storage_domain)?.ok_or(DomainError::NotFound)
}

fn get_reference_tx(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    object_id: &ObjectId,
) -> Result<ReferenceView, DomainError> {
    transaction.query_row(
        "SELECT id,field_id,owner_principal_id,created_by,source_activity_id,object_kind,title,external_ref_type,external_ref_id,lifecycle_status,revision,created_at,updated_at FROM field_objects WHERE id=?1 AND field_id=?2",
        params![object_id.0, field_id.0], reference_from_row,
    ).optional().map_err(storage_domain)?.ok_or(DomainError::NotFound)
}

fn list_references(
    connection: &Connection,
    request: &ListReferencesRequest,
) -> Result<Page<ReferenceView, ReferenceCursor>, DomainError> {
    let limit = i64::from(request.limit.unwrap_or(50));
    let lifecycle = Some(object_lifecycle_to_db(
        request.lifecycle.unwrap_or(ObjectLifecycle::Active),
    ));
    let cursor_time = request.cursor.as_ref().map(|cursor| cursor.updated_at);
    let cursor_id = request
        .cursor
        .as_ref()
        .map(|cursor| cursor.object_id.0.as_str());
    let mut statement = connection.prepare(
        "SELECT id,field_id,owner_principal_id,created_by,source_activity_id,object_kind,title,external_ref_type,external_ref_id,lifecycle_status,revision,created_at,updated_at FROM field_objects
         WHERE field_id=?1 AND object_kind='REFERENCE' AND (?2 IS NULL OR lifecycle_status=?2)
         AND (?3 IS NULL OR updated_at < ?3 OR (updated_at=?3 AND id < ?4))
         ORDER BY updated_at DESC,id DESC LIMIT ?5"
    ).map_err(storage_domain)?;
    let rows = statement
        .query_map(
            params![
                request.field_id.0,
                lifecycle,
                cursor_time,
                cursor_id,
                limit + 1
            ],
            reference_from_row,
        )
        .map_err(storage_domain)?;
    let mut items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_domain)?;
    let next_cursor = if items.len() > limit as usize {
        items.truncate(limit as usize);
        items.last().map(|item| ReferenceCursor {
            updated_at: item.updated_at,
            object_id: item.id.clone(),
        })
    } else {
        None
    };
    Ok(Page { items, next_cursor })
}

fn revise_reference(
    connection: &mut Connection,
    request: &ReviseReferenceRequest,
    title: &str,
    canonical_url: &str,
    updated_at: i64,
    activity: &Activity,
) -> Result<RealityMutationResult<ReferenceView>, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let current = get_reference_tx(&transaction, &request.field_id, &request.object_id)?;
    if current.lifecycle == ObjectLifecycle::Archived {
        return Err(DomainError::TerminalResource);
    }
    if current.revision != request.expected_object_revision {
        return Err(DomainError::RevisionConflict);
    }
    ensure_reference_url_available(
        &transaction,
        &request.field_id,
        canonical_url,
        Some(&request.object_id),
    )?;
    transaction.execute(
        "UPDATE field_objects SET title=?1,external_ref_id=?2,revision=revision+1,updated_at=MAX(updated_at,?3) WHERE id=?4",
        params![title, canonical_url, updated_at, request.object_id.0],
    ).map_err(map_reference_write_error)?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field_revision = bump_field(&transaction, &request.field_id, updated_at)?;
    let resource = get_reference_tx(&transaction, &request.field_id, &request.object_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(RealityMutationResult {
        resource,
        field_revision,
    })
}

fn archive_reference(
    connection: &mut Connection,
    request: &ArchiveReferenceRequest,
    updated_at: i64,
    activity: &Activity,
) -> Result<RealityMutationResult<ReferenceView>, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let current = get_reference_tx(&transaction, &request.field_id, &request.object_id)?;
    if current.lifecycle == ObjectLifecycle::Archived {
        return Err(DomainError::TerminalResource);
    }
    if current.revision != request.expected_object_revision {
        return Err(DomainError::RevisionConflict);
    }
    transaction.execute("UPDATE field_objects SET lifecycle_status='ARCHIVED',revision=revision+1,updated_at=MAX(updated_at,?1) WHERE id=?2", params![updated_at, request.object_id.0]).map_err(storage_domain)?;
    transaction.execute(
        "UPDATE field_relations SET lifecycle_status='RETRACTED',revision=revision+1,updated_at=MAX(updated_at,?1) WHERE field_id=?2 AND relation_type='SOURCED_FROM' AND to_type='OBJECT' AND to_id=?3 AND lifecycle_status='ACTIVE'",
        params![updated_at, request.field_id.0, request.object_id.0],
    ).map_err(storage_domain)?;
    clear_typed_reference_focus(&transaction, &request.field_id, &request.object_id)?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field_revision = bump_field(&transaction, &request.field_id, updated_at)?;
    let resource = get_reference_tx(&transaction, &request.field_id, &request.object_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(RealityMutationResult {
        resource,
        field_revision,
    })
}

fn restore_reference(
    connection: &mut Connection,
    request: &RestoreReferenceRequest,
    updated_at: i64,
    activity: &Activity,
) -> Result<RealityMutationResult<ReferenceView>, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let current = get_reference_tx(&transaction, &request.field_id, &request.object_id)?;
    if current.lifecycle != ObjectLifecycle::Archived {
        return Err(DomainError::InvalidStateTransition);
    }
    if current.revision != request.expected_object_revision {
        return Err(DomainError::RevisionConflict);
    }
    ensure_reference_url_available(
        &transaction,
        &request.field_id,
        &current.canonical_url,
        Some(&request.object_id),
    )?;
    transaction.execute("UPDATE field_objects SET lifecycle_status='ACTIVE',revision=revision+1,updated_at=MAX(updated_at,?1) WHERE id=?2", params![updated_at, request.object_id.0]).map_err(map_reference_write_error)?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field_revision = bump_field(&transaction, &request.field_id, updated_at)?;
    let resource = get_reference_tx(&transaction, &request.field_id, &request.object_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(RealityMutationResult {
        resource,
        field_revision,
    })
}

fn ensure_reference_url_available(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    url: &str,
    excluding: Option<&ObjectId>,
) -> Result<(), DomainError> {
    let duplicate: bool = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM field_objects WHERE field_id=?1 AND object_kind='REFERENCE' AND lifecycle_status='ACTIVE' AND external_ref_type='HTTPS_URL' AND external_ref_id=?2 AND (?3 IS NULL OR id != ?3))",
        params![field_id.0, url, excluding.map(|id| id.0.as_str())], |row| row.get(0),
    ).map_err(storage_domain)?;
    if duplicate {
        Err(DomainError::DuplicateActiveReference)
    } else {
        Ok(())
    }
}

fn map_reference_write_error(error: rusqlite::Error) -> DomainError {
    if is_constraint(&error) {
        DomainError::DuplicateActiveReference
    } else {
        storage_domain(error)
    }
}

fn attach_reference_source(
    connection: &mut Connection,
    request: &AttachReferenceSourceRequest,
    relation_id: &RelationId,
    created_at: i64,
    activity: &Activity,
) -> Result<RealityMutationResult<RelationView>, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let _state =
        get_state_tx(&transaction, &request.field_id, &request.state_id).map_err(|error| {
            match error {
                DomainError::NotFound => DomainError::InvalidRelationEndpoint,
                other => other,
            }
        })?;
    let reference = get_reference_tx(&transaction, &request.field_id, &request.reference_id)
        .map_err(|error| match error {
            DomainError::NotFound => DomainError::InvalidRelationEndpoint,
            other => other,
        })?;
    if reference.lifecycle != ObjectLifecycle::Active {
        return Err(DomainError::InvalidRelationEndpoint);
    }
    let duplicate: bool = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM field_relations WHERE field_id=?1 AND relation_type='SOURCED_FROM' AND from_type='STATE' AND from_id=?2 AND to_type='OBJECT' AND to_id=?3 AND lifecycle_status='ACTIVE')",
        params![request.field_id.0, request.state_id.0, request.reference_id.0], |row| row.get(0),
    ).map_err(storage_domain)?;
    if duplicate {
        return Err(DomainError::DuplicateActiveRelation);
    }
    transaction.execute(
        "INSERT INTO field_relations(id,field_id,from_type,from_id,relation_type,to_type,to_id,lifecycle_status,created_by,revision,created_at,updated_at) VALUES (?1,?2,'STATE',?3,'SOURCED_FROM','OBJECT',?4,'ACTIVE',?5,1,?6,?6)",
        params![relation_id.0, request.field_id.0, request.state_id.0, request.reference_id.0, activity.actor_principal_id.0, created_at],
    ).map_err(|error| if is_constraint(&error) { DomainError::DuplicateActiveRelation } else { storage_domain(error) })?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field_revision = bump_field(&transaction, &request.field_id, created_at)?;
    let resource = get_relation_tx(&transaction, &request.field_id, relation_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(RealityMutationResult {
        resource,
        field_revision,
    })
}

fn retract_reference_source(
    connection: &mut Connection,
    request: &RetractReferenceSourceRequest,
    updated_at: i64,
    activity: &Activity,
) -> Result<RealityMutationResult<RelationView>, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let current = get_relation_tx(&transaction, &request.field_id, &request.relation_id)?;
    if current.relation_type != RelationType::SourcedFrom {
        return Err(DomainError::InvalidRelationMatrix);
    }
    if current.lifecycle != RelationLifecycle::Active {
        return Err(DomainError::TerminalResource);
    }
    if current.revision != request.expected_relation_revision {
        return Err(DomainError::RevisionConflict);
    }
    transaction.execute("UPDATE field_relations SET lifecycle_status='RETRACTED',revision=revision+1,updated_at=MAX(updated_at,?1) WHERE id=?2", params![updated_at, request.relation_id.0]).map_err(storage_domain)?;
    insert_activity(&transaction, activity).map_err(map_storage)?;
    let field_revision = bump_field(&transaction, &request.field_id, updated_at)?;
    let resource = get_relation_tx(&transaction, &request.field_id, &request.relation_id)?;
    transaction.commit().map_err(storage_domain)?;
    Ok(RealityMutationResult {
        resource,
        field_revision,
    })
}

fn get_relation_tx(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    relation_id: &RelationId,
) -> Result<RelationView, DomainError> {
    transaction.query_row(
        "SELECT id,field_id,from_type,from_id,relation_type,to_type,to_id,lifecycle_status,created_by,revision,created_at,updated_at FROM field_relations WHERE id=?1 AND field_id=?2",
        params![relation_id.0, field_id.0], relation_from_row,
    ).optional().map_err(storage_domain)?.ok_or(DomainError::NotFound)
}

fn list_relations(
    connection: &Connection,
    request: &ListRelationsRequest,
) -> Result<Page<RelationView, RelationCursor>, DomainError> {
    let limit = i64::from(request.limit.unwrap_or(50));
    let relation_type = request.relation_type.map(relation_type_to_db);
    let lifecycle = Some(relation_lifecycle_to_db(
        request.lifecycle.unwrap_or(RelationLifecycle::Active),
    ));
    let (endpoint_type, endpoint_id): (Option<&str>, Option<&str>) = match &request.endpoint {
        Some(LineageEndpointRef::State { state_id }) => (Some("STATE"), Some(state_id.0.as_str())),
        Some(LineageEndpointRef::Reference { object_id }) => {
            (Some("OBJECT"), Some(object_id.0.as_str()))
        }
        None => (None, None),
    };
    let cursor_time = request.cursor.as_ref().map(|cursor| cursor.created_at);
    let cursor_id = request
        .cursor
        .as_ref()
        .map(|cursor| cursor.relation_id.0.as_str());
    let mut statement=connection.prepare(
        "SELECT id,field_id,from_type,from_id,relation_type,to_type,to_id,lifecycle_status,created_by,revision,created_at,updated_at FROM field_relations
         WHERE field_id=?1 AND (?2 IS NULL OR relation_type=?2) AND (?3 IS NULL OR lifecycle_status=?3)
         AND (?4 IS NULL OR (from_type=?4 AND from_id=?5) OR (to_type=?4 AND to_id=?5))
         AND (?6 IS NULL OR created_at < ?6 OR (created_at=?6 AND id < ?7)) ORDER BY created_at DESC,id DESC LIMIT ?8"
    ).map_err(storage_domain)?;
    let rows = statement
        .query_map(
            params![
                request.field_id.0,
                relation_type,
                lifecycle,
                endpoint_type,
                endpoint_id,
                cursor_time,
                cursor_id,
                limit + 1
            ],
            relation_from_row,
        )
        .map_err(storage_domain)?;
    let mut items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_domain)?;
    let next_cursor = if items.len() > limit as usize {
        items.truncate(limit as usize);
        items.last().map(|item| RelationCursor {
            created_at: item.created_at,
            relation_id: item.id.clone(),
        })
    } else {
        None
    };
    Ok(Page { items, next_cursor })
}

fn list_activities(
    connection: &Connection,
    request: &ListActivitiesRequest,
) -> Result<Page<ActivityView, ActivityCursor>, DomainError> {
    let limit = i64::from(request.limit.unwrap_or(50));
    let cursor_time = request.cursor.as_ref().map(|cursor| cursor.created_at);
    let cursor_id = request
        .cursor
        .as_ref()
        .map(|cursor| cursor.activity_id.0.as_str());
    let mut statement=connection.prepare(
        "SELECT id,field_id,actor_principal_id,action,target_type,target_id,summary,trace_id,created_at FROM activities
         WHERE field_id=?1 AND (?2 IS NULL OR created_at < ?2 OR (created_at=?2 AND id < ?3)) ORDER BY created_at DESC,id DESC LIMIT ?4"
    ).map_err(storage_domain)?;
    let rows = statement
        .query_map(
            params![request.field_id.0, cursor_time, cursor_id, limit + 1],
            activity_from_row,
        )
        .map_err(storage_domain)?;
    let mut items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_domain)?;
    let next_cursor = if items.len() > limit as usize {
        items.truncate(limit as usize);
        items.last().map(|item| ActivityCursor {
            created_at: item.created_at,
            activity_id: item.id.clone(),
        })
    } else {
        None
    };
    Ok(Page { items, next_cursor })
}

fn resume_v1(
    connection: &mut Connection,
    field_id: &FieldId,
    device_id: &DeviceId,
) -> Result<FieldResumeV1View, DomainError> {
    let transaction = connection.transaction().map_err(storage_domain)?;
    let field = get_field_tx(&transaction, field_id)?;
    let field_view = field_to_view(field.clone());
    let (mut focus_source, mut typed_focus, legacy_text_focus) =
        parse_persisted_focus(field.current_focus.as_ref());
    if typed_focus.as_ref().is_some_and(|focus| {
        !focus_target_available(&transaction, field_id, focus).unwrap_or(false)
    }) {
        focus_source = FocusSource::InvalidIgnored;
        typed_focus = None;
    }

    let snapshot: Option<(i64,String,String)> = transaction.query_row(
        "SELECT observed_field_revision,layout_json,open_objects_json FROM surface_snapshots WHERE field_id=?1 AND device_id=?2 ORDER BY created_at DESC,id DESC LIMIT 1",
        params![field_id.0,device_id.0], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).optional().map_err(storage_domain)?;
    let mut snapshot_freshness = SnapshotFreshness::None;
    let mut layout_source = LayoutSource::Default;
    let mut layout = SurfaceLayoutV1::default_task();
    let mut open_reference_ids = Vec::new();
    if let Some((observed, layout_json, open_json)) = snapshot {
        let observed = u64::try_from(observed).unwrap_or(0);
        snapshot_freshness = match observed.cmp(&field.revision) {
            std::cmp::Ordering::Less => SnapshotFreshness::Stale,
            std::cmp::Ordering::Equal => SnapshotFreshness::Current,
            std::cmp::Ordering::Greater => SnapshotFreshness::Invalid,
        };
        if snapshot_freshness == SnapshotFreshness::Invalid {
            layout_source = LayoutSource::InvalidIgnored;
        } else if let Ok(candidate) = serde_json::from_str::<SurfaceLayoutV1>(&layout_json) {
            match validate_surface_layout(&candidate) {
                Ok(open) => {
                    layout_source = LayoutSource::SnapshotV1;
                    layout = candidate;
                    open_reference_ids = open;
                }
                Err(_) => {
                    layout_source = LayoutSource::InvalidIgnored;
                    snapshot_freshness = SnapshotFreshness::Invalid;
                }
            }
        } else {
            let legacy_layout: Result<Value, _> = serde_json::from_str(&layout_json);
            let legacy_open: Result<Vec<String>, _> = serde_json::from_str(&open_json);
            if legacy_layout.ok().as_ref()
                == Some(&serde_json::json!({"primary":"FIELD","supporting":[]}))
                && legacy_open.ok().is_some_and(|items| items.is_empty())
            {
                layout_source = LayoutSource::LegacyPhase01Fallback;
            } else {
                layout_source = LayoutSource::InvalidIgnored;
                snapshot_freshness = SnapshotFreshness::Invalid;
            }
        }
    }
    let unavailable_reference_ids = open_reference_ids
        .iter()
        .filter(|id| !active_reference_exists(&transaction, field_id, id).unwrap_or(false))
        .cloned()
        .collect::<Vec<_>>();
    let active_blockers = resume_state_items(&transaction, field_id, FieldStateKind::Blocker)?;
    let active_questions = resume_state_items(&transaction, field_id, FieldStateKind::Question)?;
    let active_tasks = resume_state_items(&transaction, field_id, FieldStateKind::Task)?;
    let last_activity=transaction.query_row(
        "SELECT id,field_id,actor_principal_id,action,target_type,target_id,summary,trace_id,created_at FROM activities WHERE field_id=?1 ORDER BY created_at DESC,id DESC LIMIT 1",
        [&field_id.0],activity_from_row,
    ).optional().map_err(storage_domain)?;
    let continuation = choose_continuation(
        &transaction,
        field_id,
        typed_focus.as_ref(),
        legacy_text_focus.as_ref(),
        &active_blockers,
        &active_questions,
        &active_tasks,
        last_activity.as_ref(),
    )?;
    transaction.commit().map_err(storage_domain)?;
    Ok(FieldResumeV1View {
        field: field_view,
        field_revision: field.revision,
        focus_source,
        typed_focus,
        legacy_text_focus,
        snapshot_freshness,
        layout_source,
        layout,
        open_reference_ids,
        unavailable_reference_ids,
        active_blockers,
        active_questions,
        active_tasks,
        last_activity,
        continuation,
        external_changes: ExternalChangeAssessment::NotEvaluatedPhase02,
    })
}

fn resume_state_items(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    kind: FieldStateKind,
) -> Result<Vec<ResumeStateItem>, DomainError> {
    let mut statement=transaction.prepare("SELECT id,kind,content,revision,updated_at FROM field_state_entries WHERE field_id=?1 AND kind=?2 AND status='ACTIVE' ORDER BY updated_at DESC,id DESC LIMIT 5").map_err(storage_domain)?;
    let rows = statement
        .query_map(params![field_id.0, state_kind_to_db(kind)], |row| {
            let content: String = row.get(2)?;
            let excerpt = content.chars().take(240).collect();
            Ok(ResumeStateItem {
                id: StateId::new(row.get::<_, String>(0)?),
                kind: state_kind_from_db(&row.get::<_, String>(1)?)?,
                content_excerpt: excerpt,
                revision: revision_from_row(row, 3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(storage_domain)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(storage_domain)
}

#[allow(clippy::too_many_arguments)]
fn choose_continuation(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    typed: Option<&FieldFocusV1>,
    legacy: Option<&String>,
    blockers: &[ResumeStateItem],
    questions: &[ResumeStateItem],
    tasks: &[ResumeStateItem],
    last: Option<&ActivityView>,
) -> Result<ResumeContinuation, DomainError> {
    if let Some(focus) = typed {
        let target = match focus {
            FieldFocusV1::State { state_id } => ContinuationTarget::State {
                state_id: state_id.clone(),
            },
            FieldFocusV1::Reference { object_id } => ContinuationTarget::Reference {
                object_id: object_id.clone(),
            },
        };
        return Ok(ResumeContinuation {
            reason: ContinuationReason::TypedFocus,
            target,
        });
    }
    if let Some(label) = legacy {
        return Ok(ResumeContinuation {
            reason: ContinuationReason::LegacyTextFocus,
            target: ContinuationTarget::LegacyText {
                label: label.clone(),
            },
        });
    }
    if let Some(item) = blockers.first() {
        return Ok(ResumeContinuation {
            reason: ContinuationReason::ActiveBlocker,
            target: ContinuationTarget::State {
                state_id: item.id.clone(),
            },
        });
    }
    if let Some(item) = questions.first() {
        return Ok(ResumeContinuation {
            reason: ContinuationReason::ActiveQuestion,
            target: ContinuationTarget::State {
                state_id: item.id.clone(),
            },
        });
    }
    if let Some(item) = tasks.first() {
        return Ok(ResumeContinuation {
            reason: ContinuationReason::ActiveTask,
            target: ContinuationTarget::State {
                state_id: item.id.clone(),
            },
        });
    }
    if let Some(activity) = last
        && let Some(target) = activity.target.as_ref().and_then(|target| {
            valid_activity_continuation(transaction, field_id, target)
                .ok()
                .flatten()
        })
    {
        return Ok(ResumeContinuation {
            reason: ContinuationReason::LastActivity,
            target,
        });
    }
    Ok(ResumeContinuation {
        reason: ContinuationReason::FieldOverview,
        target: ContinuationTarget::FieldOverview,
    })
}

fn valid_activity_continuation(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    target: &ResourceRef,
) -> Result<Option<ContinuationTarget>, DomainError> {
    Ok(match target {
        ResourceRef::Field {
            field_id: target_field,
        } if target_field == field_id => Some(ContinuationTarget::FieldOverview),
        ResourceRef::State { state_id }
            if get_state_tx(transaction, field_id, state_id).is_ok() =>
        {
            Some(ContinuationTarget::State {
                state_id: state_id.clone(),
            })
        }
        ResourceRef::Reference { object_id }
            if active_reference_exists(transaction, field_id, object_id)? =>
        {
            Some(ContinuationTarget::Reference {
                object_id: object_id.clone(),
            })
        }
        _ => None,
    })
}

fn focus_target_available(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    focus: &FieldFocusV1,
) -> Result<bool, DomainError> {
    match focus {
        FieldFocusV1::State { state_id } => Ok(get_state_tx(transaction, field_id, state_id)
            .is_ok_and(|state| {
                !matches!(
                    state.status,
                    StateStatus::Superseded | StateStatus::Retracted
                )
            })),
        FieldFocusV1::Reference { object_id } => {
            active_reference_exists(transaction, field_id, object_id)
        }
    }
}

fn active_reference_exists(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    object_id: &ObjectId,
) -> Result<bool, DomainError> {
    transaction.query_row("SELECT EXISTS(SELECT 1 FROM field_objects WHERE id=?1 AND field_id=?2 AND object_kind='REFERENCE' AND lifecycle_status='ACTIVE')",params![object_id.0,field_id.0],|row|row.get(0)).map_err(storage_domain)
}

fn ensure_active_field(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
) -> Result<(), DomainError> {
    let active: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM fields WHERE id=?1 AND lifecycle_status='ACTIVE')",
            [&field_id.0],
            |row| row.get(0),
        )
        .map_err(storage_domain)?;
    if active {
        Ok(())
    } else {
        Err(DomainError::NotFound)
    }
}

fn clear_typed_state_focus(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    state_id: &StateId,
) -> Result<(), DomainError> {
    clear_focus_matching(
        transaction,
        field_id,
        &FieldFocusV1::State {
            state_id: state_id.clone(),
        },
        None,
    )
}
fn clear_typed_reference_focus(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    object_id: &ObjectId,
) -> Result<(), DomainError> {
    clear_focus_matching(
        transaction,
        field_id,
        &FieldFocusV1::Reference {
            object_id: object_id.clone(),
        },
        None,
    )
}
fn move_typed_state_focus(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    from: &StateId,
    to: &StateId,
) -> Result<(), DomainError> {
    clear_focus_matching(
        transaction,
        field_id,
        &FieldFocusV1::State {
            state_id: from.clone(),
        },
        Some(&FieldFocusV1::State {
            state_id: to.clone(),
        }),
    )
}
fn clear_focus_matching(
    transaction: &Transaction<'_>,
    field_id: &FieldId,
    expected: &FieldFocusV1,
    replacement: Option<&FieldFocusV1>,
) -> Result<(), DomainError> {
    let current: Option<String> = transaction
        .query_row(
            "SELECT current_focus_json FROM fields WHERE id=?1",
            [&field_id.0],
            |row| row.get(0),
        )
        .optional()
        .map_err(storage_domain)?
        .flatten();
    if current
        .as_deref()
        .and_then(|json| serde_json::from_str::<FieldFocusV1>(json).ok())
        .as_ref()
        == Some(expected)
    {
        let replacement = replacement
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| DomainError::Storage(error.to_string()))?;
        transaction
            .execute(
                "UPDATE fields SET current_focus_json=?1 WHERE id=?2",
                params![replacement, field_id.0],
            )
            .map_err(storage_domain)?;
    }
    Ok(())
}

fn field_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Field> {
    let lifecycle: String = row.get(4)?;
    let mode: Option<String> = row.get(5)?;
    let focus_json: Option<String> = row.get(6)?;
    Ok(Field {
        id: FieldId::new(row.get::<_, String>(0)?),
        owner_principal_id: PrincipalId::new(row.get::<_, String>(1)?),
        title: row.get(2)?,
        goal: row.get(3)?,
        lifecycle_status: lifecycle_from_db(&lifecycle)?,
        current_mode: mode.as_deref().map(mode_from_db).transpose()?,
        current_focus: focus_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(|error| conversion_error(error.to_string()))?,
        revision: revision_from_row(row, 7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn field_to_view(field: Field) -> FieldView {
    FieldView {
        id: field.id,
        owner_principal_id: field.owner_principal_id,
        title: field.title,
        goal: field.goal,
        lifecycle_status: field.lifecycle_status,
        current_mode: field.current_mode,
        current_focus: field.current_focus,
        revision: field.revision,
        created_at: field.created_at,
        updated_at: field.updated_at,
    }
}

fn state_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StateView> {
    Ok(StateView {
        id: StateId::new(row.get::<_, String>(0)?),
        field_id: FieldId::new(row.get::<_, String>(1)?),
        kind: state_kind_from_db(&row.get::<_, String>(2)?)?,
        content: row.get(3)?,
        status: state_status_from_db(&row.get::<_, String>(4)?)?,
        confidence: row.get(5)?,
        created_by: PrincipalId::new(row.get::<_, String>(6)?),
        source_activity_id: ActivityId::new(row.get::<_, String>(7)?),
        revision: revision_from_row(row, 8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn reference_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReferenceView> {
    let kind: String = row.get(5)?;
    let reference_type: String = row.get(7)?;
    if kind != "REFERENCE" || reference_type != "HTTPS_URL" {
        return Err(conversion_error("invalid reference discriminant".into()));
    }
    Ok(ReferenceView {
        id: ObjectId::new(row.get::<_, String>(0)?),
        field_id: FieldId::new(row.get::<_, String>(1)?),
        owner_principal_id: PrincipalId::new(row.get::<_, String>(2)?),
        created_by: PrincipalId::new(row.get::<_, String>(3)?),
        source_activity_id: ActivityId::new(row.get::<_, String>(4)?),
        kind: ObjectKind::Reference,
        title: row.get(6)?,
        reference_type: ReferenceType::HttpsUrl,
        canonical_url: row.get(8)?,
        lifecycle: object_lifecycle_from_db(&row.get::<_, String>(9)?)?,
        revision: revision_from_row(row, 10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn relation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RelationView> {
    let from_type: String = row.get(2)?;
    let from_id: String = row.get(3)?;
    let relation_type = relation_type_from_db(&row.get::<_, String>(4)?)?;
    let to_type: String = row.get(5)?;
    let to_id: String = row.get(6)?;
    let from = endpoint_from_db(&from_type, from_id)?;
    let to = endpoint_from_db(&to_type, to_id)?;
    Ok(RelationView {
        id: RelationId::new(row.get::<_, String>(0)?),
        field_id: FieldId::new(row.get::<_, String>(1)?),
        relation_type,
        from,
        to,
        lifecycle: relation_lifecycle_from_db(&row.get::<_, String>(7)?)?,
        created_by: PrincipalId::new(row.get::<_, String>(8)?),
        revision: revision_from_row(row, 9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn activity_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivityView> {
    let field_id: Option<String> = row.get(1)?;
    let target_type: Option<String> = row.get(4)?;
    let target_id: Option<String> = row.get(5)?;
    let target = match (target_type.as_deref(), target_id) {
        (Some("FIELD"), Some(id)) => Some(ResourceRef::Field {
            field_id: FieldId::new(id),
        }),
        (Some("STATE"), Some(id)) => Some(ResourceRef::State {
            state_id: StateId::new(id),
        }),
        (Some("OBJECT"), Some(id)) => Some(ResourceRef::Reference {
            object_id: ObjectId::new(id),
        }),
        (Some("RELATION"), Some(id)) => Some(ResourceRef::Relation {
            relation_id: RelationId::new(id),
        }),
        (None, None) => None,
        _ => return Err(conversion_error("invalid activity target".into())),
    };
    Ok(ActivityView {
        id: ActivityId::new(row.get::<_, String>(0)?),
        field_id: field_id.map(FieldId::new),
        actor_principal_id: PrincipalId::new(row.get::<_, String>(2)?),
        action: activity_action_from_db(&row.get::<_, String>(3)?)?,
        target,
        summary: row.get(6)?,
        trace_id: TraceId::new(row.get::<_, String>(7)?),
        created_at: row.get(8)?,
    })
}

fn state_kind_to_db(value: FieldStateKind) -> &'static str {
    match value {
        FieldStateKind::Fact => "FACT",
        FieldStateKind::Decision => "DECISION",
        FieldStateKind::Assumption => "ASSUMPTION",
        FieldStateKind::Question => "QUESTION",
        FieldStateKind::Task => "TASK",
        FieldStateKind::Blocker => "BLOCKER",
        FieldStateKind::Result => "RESULT",
    }
}
fn state_kind_from_db(value: &str) -> rusqlite::Result<FieldStateKind> {
    match value {
        "FACT" => Ok(FieldStateKind::Fact),
        "DECISION" => Ok(FieldStateKind::Decision),
        "ASSUMPTION" => Ok(FieldStateKind::Assumption),
        "QUESTION" => Ok(FieldStateKind::Question),
        "TASK" => Ok(FieldStateKind::Task),
        "BLOCKER" => Ok(FieldStateKind::Blocker),
        "RESULT" => Ok(FieldStateKind::Result),
        _ => Err(conversion_error(format!("unknown state kind {value}"))),
    }
}
fn state_status_to_db(value: StateStatus) -> &'static str {
    match value {
        StateStatus::Active => "ACTIVE",
        StateStatus::Resolved => "RESOLVED",
        StateStatus::Superseded => "SUPERSEDED",
        StateStatus::Retracted => "RETRACTED",
    }
}
fn state_status_from_db(value: &str) -> rusqlite::Result<StateStatus> {
    match value {
        "ACTIVE" => Ok(StateStatus::Active),
        "RESOLVED" => Ok(StateStatus::Resolved),
        "SUPERSEDED" => Ok(StateStatus::Superseded),
        "RETRACTED" => Ok(StateStatus::Retracted),
        _ => Err(conversion_error(format!("unknown state status {value}"))),
    }
}
fn object_lifecycle_to_db(value: ObjectLifecycle) -> &'static str {
    match value {
        ObjectLifecycle::Active => "ACTIVE",
        ObjectLifecycle::Archived => "ARCHIVED",
    }
}
fn object_lifecycle_from_db(value: &str) -> rusqlite::Result<ObjectLifecycle> {
    match value {
        "ACTIVE" => Ok(ObjectLifecycle::Active),
        "ARCHIVED" => Ok(ObjectLifecycle::Archived),
        _ => Err(conversion_error(format!(
            "unknown object lifecycle {value}"
        ))),
    }
}
fn relation_type_to_db(value: RelationType) -> &'static str {
    match value {
        RelationType::SourcedFrom => "SOURCED_FROM",
        RelationType::SupersededBy => "SUPERSEDED_BY",
    }
}
fn relation_type_from_db(value: &str) -> rusqlite::Result<RelationType> {
    match value {
        "SOURCED_FROM" => Ok(RelationType::SourcedFrom),
        "SUPERSEDED_BY" => Ok(RelationType::SupersededBy),
        _ => Err(conversion_error(format!("unknown relation type {value}"))),
    }
}
fn relation_lifecycle_to_db(value: RelationLifecycle) -> &'static str {
    match value {
        RelationLifecycle::Active => "ACTIVE",
        RelationLifecycle::Retracted => "RETRACTED",
    }
}
fn relation_lifecycle_from_db(value: &str) -> rusqlite::Result<RelationLifecycle> {
    match value {
        "ACTIVE" => Ok(RelationLifecycle::Active),
        "RETRACTED" => Ok(RelationLifecycle::Retracted),
        _ => Err(conversion_error(format!(
            "unknown relation lifecycle {value}"
        ))),
    }
}
fn endpoint_from_db(kind: &str, id: String) -> rusqlite::Result<LineageEndpointRef> {
    match kind {
        "STATE" => Ok(LineageEndpointRef::State {
            state_id: StateId::new(id),
        }),
        "OBJECT" => Ok(LineageEndpointRef::Reference {
            object_id: ObjectId::new(id),
        }),
        _ => Err(conversion_error(format!("unknown endpoint kind {kind}"))),
    }
}

fn activity_action_from_db(value: &str) -> rusqlite::Result<ActivityAction> {
    match value {
        "FIELD_CREATED" => Ok(ActivityAction::FieldCreated),
        "FIELD_FOCUS_UPDATED" => Ok(ActivityAction::FieldFocusUpdated),
        "FIELD_MODE_UPDATED" => Ok(ActivityAction::FieldModeUpdated),
        "STATE_CREATED" => Ok(ActivityAction::StateCreated),
        "STATE_REVISED" => Ok(ActivityAction::StateRevised),
        "STATE_STATUS_CHANGED" => Ok(ActivityAction::StateStatusChanged),
        "STATE_SUPERSEDED" => Ok(ActivityAction::StateSuperseded),
        "REFERENCE_CREATED" => Ok(ActivityAction::ReferenceCreated),
        "REFERENCE_REVISED" => Ok(ActivityAction::ReferenceRevised),
        "REFERENCE_ARCHIVED" => Ok(ActivityAction::ReferenceArchived),
        "REFERENCE_RESTORED" => Ok(ActivityAction::ReferenceRestored),
        "REFERENCE_SOURCE_ATTACHED" => Ok(ActivityAction::ReferenceSourceAttached),
        "REFERENCE_SOURCE_RETRACTED" => Ok(ActivityAction::ReferenceSourceRetracted),
        _ => Err(conversion_error(format!("unknown activity action {value}"))),
    }
}

fn is_constraint(error: &rusqlite::Error) -> bool {
    matches!(error,rusqlite::Error::SqliteFailure(code,_) if code.code==rusqlite::ErrorCode::ConstraintViolation)
}

fn snapshot_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SurfaceSnapshot> {
    let layout_json: String = row.get(4)?;
    let open_objects_json: String = row.get(5)?;
    let open_objects: Vec<String> = serde_json::from_str(&open_objects_json)
        .map_err(|error| conversion_error(error.to_string()))?;
    Ok(SurfaceSnapshot {
        id: SurfaceSnapshotId::new(row.get::<_, String>(0)?),
        field_id: FieldId::new(row.get::<_, String>(1)?),
        device_id: DeviceId::new(row.get::<_, String>(2)?),
        observed_field_revision: revision_from_row(row, 3)?,
        layout: serde_json::from_str(&layout_json)
            .map_err(|error| conversion_error(error.to_string()))?,
        open_objects: open_objects.into_iter().map(ObjectId::new).collect(),
        created_at: row.get(6)?,
    })
}

fn conversion_error(message: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(StorageError::InvalidJson(message)),
    )
}

fn encode_optional_json(value: &Option<Value>) -> Result<Option<String>, StorageError> {
    value
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| StorageError::InvalidJson(error.to_string()))
}

fn revision_to_sql(value: u64) -> Result<i64, StorageError> {
    i64::try_from(value).map_err(|_| StorageError::RevisionOutOfRange)
}

fn revision_from_row(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<u64> {
    let value: i64 = row.get(index)?;
    u64::try_from(value).map_err(|_| conversion_error("negative revision".into()))
}

fn lifecycle_to_db(value: FieldLifecycle) -> &'static str {
    match value {
        FieldLifecycle::Active => "ACTIVE",
        FieldLifecycle::Completed => "COMPLETED",
        FieldLifecycle::Archived => "ARCHIVED",
    }
}

fn lifecycle_from_db(value: &str) -> rusqlite::Result<FieldLifecycle> {
    match value {
        "ACTIVE" => Ok(FieldLifecycle::Active),
        "COMPLETED" => Ok(FieldLifecycle::Completed),
        "ARCHIVED" => Ok(FieldLifecycle::Archived),
        _ => Err(conversion_error(format!("unknown lifecycle {value}"))),
    }
}

fn mode_to_db(value: FieldMode) -> &'static str {
    match value {
        FieldMode::Explore => "EXPLORE",
        FieldMode::Think => "THINK",
        FieldMode::Build => "BUILD",
        FieldMode::Operate => "OPERATE",
        FieldMode::Verify => "VERIFY",
    }
}

fn mode_from_db(value: &str) -> rusqlite::Result<FieldMode> {
    match value {
        "EXPLORE" => Ok(FieldMode::Explore),
        "THINK" => Ok(FieldMode::Think),
        "BUILD" => Ok(FieldMode::Build),
        "OPERATE" => Ok(FieldMode::Operate),
        "VERIFY" => Ok(FieldMode::Verify),
        _ => Err(conversion_error(format!("unknown mode {value}"))),
    }
}

fn map_storage(error: StorageError) -> DomainError {
    DomainError::Storage(error.to_string())
}

pub fn schema_version() -> u32 {
    SCHEMA_VERSION
}

#[cfg(test)]
mod tests {
    use super::*;
    use fielora_field::{FieldService, RealityService, SurfaceService};
    use fielora_platform::PlatformPaths;
    use std::fs;

    fn temporary_root() -> PathBuf {
        std::env::temp_dir().join(format!("fielora-storage-{}", Uuid::now_v7()))
    }

    fn start(root: &Path, now: i64) -> StorageWorker {
        let paths = PlatformPaths::from_root(root.to_path_buf()).unwrap();
        let device = DeviceIdentity::load_or_create(&paths.device_identity).unwrap();
        StorageWorker::start(&paths.database, device, now).unwrap()
    }

    #[test]
    fn migration_and_bootstrap_are_idempotent_across_reopen() {
        let root = temporary_root();
        let first_user = {
            let worker = start(&root, 1);
            worker.handle().local_user.clone()
        };
        let second_user = {
            let worker = start(&root, 2);
            worker.handle().local_user.clone()
        };
        assert_eq!(first_user, second_user);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn migration_checksum_mismatch_blocks_reopen() {
        let root = temporary_root();
        let paths = PlatformPaths::from_root(root.clone()).unwrap();
        let device = DeviceIdentity::load_or_create(&paths.device_identity).unwrap();
        {
            let worker = StorageWorker::start(&paths.database, device.clone(), 1).unwrap();
            drop(worker);
        }
        {
            let connection = open_connection(&paths.database).unwrap();
            connection
                .execute(
                    "UPDATE schema_migrations SET checksum='tampered' WHERE version=1",
                    [],
                )
                .unwrap();
        }
        assert!(matches!(
            StorageWorker::start(&paths.database, device, 2),
            Err(StorageError::MigrationChecksum { version: 1 })
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reality_activity_and_snapshot_survive_real_close_reopen() {
        let root = temporary_root();
        let field_id = {
            let worker = start(&root, 1);
            let handle = worker.handle();
            let fields = FieldService::new(handle.clone(), handle.local_user.clone());
            let trace = TraceId::new(Uuid::now_v7().to_string());
            let (field, _) = fields
                .create("Persistent Field".into(), None, trace.clone(), 2)
                .unwrap();
            let (field, _) = fields
                .update_focus(field.id, 1, Value::String("Persistence".into()), trace, 3)
                .unwrap();
            let surfaces = SurfaceService::new(handle.clone(), handle.device_id.clone());
            surfaces
                .save(
                    field.id.clone(),
                    serde_json::json!({"primary":"field"}),
                    vec![],
                    4,
                )
                .unwrap();
            field.id
        };
        {
            let worker = start(&root, 5);
            let handle = worker.handle();
            let fields = FieldService::new(handle.clone(), handle.local_user.clone());
            let reopened = fields.get(&field_id).unwrap();
            assert_eq!(
                reopened.current_focus,
                Some(Value::String("Persistence".into()))
            );
            let surfaces = SurfaceService::new(handle.clone(), handle.device_id.clone());
            assert_eq!(
                surfaces
                    .latest(&field_id)
                    .unwrap()
                    .unwrap()
                    .observed_field_revision,
                2
            );
            let connection = open_connection(&handle.database_path).unwrap();
            let activities: i64 = connection
                .query_row("SELECT COUNT(*) FROM activities", [], |row| row.get(0))
                .unwrap();
            assert_eq!(activities, 2);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn snapshots_keep_only_latest_ten() {
        let root = temporary_root();
        let worker = start(&root, 1);
        let handle = worker.handle();
        let fields = FieldService::new(handle.clone(), handle.local_user.clone());
        let trace = TraceId::new(Uuid::now_v7().to_string());
        let (field, _) = fields.create("Snapshots".into(), None, trace, 2).unwrap();
        let surfaces = SurfaceService::new(handle.clone(), handle.device_id.clone());
        for index in 0..12 {
            surfaces
                .save(
                    field.id.clone(),
                    serde_json::json!({"index": index}),
                    vec![],
                    10 + index,
                )
                .unwrap();
        }
        let connection = open_connection(&handle.database_path).unwrap();
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM surface_snapshots", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 10);
        drop(connection);
        drop(worker);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn frozen_migration_sql_checksum_is_exact() {
        assert_eq!(
            frozen_migration_checksum(MIGRATION_0002),
            MIGRATION_0002_FROZEN_SHA256
        );
        assert_eq!(schema_version(), 2);
    }

    #[test]
    fn incompatible_legacy_rows_roll_back_migration_0002() {
        let root = temporary_root();
        let paths = PlatformPaths::from_root(root.clone()).unwrap();
        let device = DeviceIdentity::load_or_create(&paths.device_identity).unwrap();
        let mut connection = open_connection(&paths.database).unwrap();
        connection.execute_batch("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,applied_at INTEGER NOT NULL);").unwrap();
        connection.execute_batch(MIGRATION_0001).unwrap();
        connection
            .execute(
                "INSERT INTO schema_migrations VALUES(1,?1,?2,1)",
                params![MIGRATION_0001_NAME, migration_checksum(MIGRATION_0001)],
            )
            .unwrap();
        let user = bootstrap_records(&mut connection, &device, 1).unwrap();
        let field = Uuid::now_v7().to_string();
        connection.execute("INSERT INTO fields(id,owner_principal_id,title,lifecycle_status,revision,created_at,updated_at) VALUES(?1,?2,'legacy','ACTIVE',1,1,1)",params![field,user.0]).unwrap();
        connection.execute("INSERT INTO field_objects(id,field_id,owner_principal_id,object_kind,title,external_ref_type,external_ref_id,metadata_json,created_at,updated_at) VALUES(?1,?2,?3,'LEGACY','legacy',NULL,NULL,'{}',1,1)",params![Uuid::now_v7().to_string(),field,user.0]).unwrap();
        assert!(matches!(
            apply_migrations(&mut connection, 2),
            Err(StorageError::MigrationIncompatibleData)
        ));
        let version2: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version=2",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let transient: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE '%_v2'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!((version2, transient), (0, 0));
        drop(connection);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn phase02_reality_is_atomic_and_resume_is_authoritative() {
        let root = temporary_root();
        let worker = start(&root, 1);
        let handle = worker.handle();
        let fields = FieldService::new(handle.clone(), handle.local_user.clone());
        let reality = RealityService::new(
            handle.clone(),
            handle.local_user.clone(),
            handle.device_id.clone(),
        );
        let surfaces = SurfaceService::new(handle.clone(), handle.device_id.clone());
        let trace = || TraceId::new(Uuid::now_v7().to_string());
        let (field, _) = fields.create("Reality".into(), None, trace(), 2).unwrap();
        let (task, _) = reality
            .create_state(
                CreateStateRequest {
                    field_id: field.id.clone(),
                    kind: FieldStateKind::Task,
                    content: " Ship ".into(),
                    confidence: Some(0.8),
                },
                trace(),
                3,
            )
            .unwrap();
        assert_eq!(
            (task.resource.content.as_str(), task.field_revision),
            ("Ship", 2)
        );
        let (resolved, _) = reality
            .transition_state(
                TransitionStateRequest {
                    field_id: field.id.clone(),
                    state_id: task.resource.id.clone(),
                    expected_state_revision: 1,
                    target: StateTransitionTarget::Resolved,
                },
                trace(),
                4,
            )
            .unwrap();
        assert_eq!(
            (resolved.resource.status, resolved.field_revision),
            (StateStatus::Resolved, 3)
        );
        let (reopened, _) = reality
            .transition_state(
                TransitionStateRequest {
                    field_id: field.id.clone(),
                    state_id: task.resource.id.clone(),
                    expected_state_revision: 2,
                    target: StateTransitionTarget::Active,
                },
                trace(),
                5,
            )
            .unwrap();
        let (revised, _) = reality
            .revise_state(
                ReviseStateRequest {
                    field_id: field.id.clone(),
                    state_id: task.resource.id.clone(),
                    expected_state_revision: 3,
                    content: "Ship verified".into(),
                    confidence: Some(1.0),
                },
                trace(),
                6,
            )
            .unwrap();
        assert_eq!((reopened.field_revision, revised.field_revision), (4, 5));
        let (focused, _) = fields
            .set_focus_v1(
                SetFieldFocusV1Request {
                    field_id: field.id.clone(),
                    expected_field_revision: 5,
                    focus: Some(FieldFocusV1::State {
                        state_id: task.resource.id.clone(),
                    }),
                },
                trace(),
                7,
            )
            .unwrap();
        assert_eq!(focused.revision, 6);
        let (superseded, _) = reality
            .supersede_state(
                SupersedeStateRequest {
                    field_id: field.id.clone(),
                    state_id: task.resource.id.clone(),
                    expected_state_revision: 4,
                    replacement_content: "Ship accepted".into(),
                    replacement_confidence: Some(1.0),
                },
                trace(),
                8,
            )
            .unwrap();
        assert_eq!(superseded.field_revision, 7);
        assert_eq!(superseded.previous.status, StateStatus::Superseded);
        assert_eq!(
            fields.get(&field.id).unwrap().current_focus,
            Some(
                serde_json::to_value(FieldFocusV1::State {
                    state_id: superseded.replacement.id.clone()
                })
                .unwrap()
            )
        );
        let (reference, _) = reality
            .create_reference(
                CreateReferenceRequest {
                    field_id: field.id.clone(),
                    title: " Source ".into(),
                    url: "HTTPS://Example.COM:443/path?q=secret".into(),
                },
                trace(),
                9,
            )
            .unwrap();
        assert_eq!(
            (
                reference.resource.canonical_url.as_str(),
                reference.field_revision
            ),
            ("https://example.com/path?q=secret", 8)
        );
        let (relation, _) = reality
            .attach_reference_source(
                AttachReferenceSourceRequest {
                    field_id: field.id.clone(),
                    state_id: superseded.replacement.id.clone(),
                    reference_id: reference.resource.id.clone(),
                },
                trace(),
                10,
            )
            .unwrap();
        assert_eq!(relation.field_revision, 9);
        let (focused, _) = fields
            .set_focus_v1(
                SetFieldFocusV1Request {
                    field_id: field.id.clone(),
                    expected_field_revision: 9,
                    focus: Some(FieldFocusV1::Reference {
                        object_id: reference.resource.id.clone(),
                    }),
                },
                trace(),
                11,
            )
            .unwrap();
        assert_eq!(focused.revision, 10);
        let layout = SurfaceLayoutV1 {
            version: 1,
            template: SurfaceTemplateV1::PrimarySupportRight,
            primary: SurfaceLayoutV1::default_task().primary,
            supporting: vec![SurfacePaneV1 {
                pane_id: PaneId::new(format!("pane_{}", Uuid::now_v7())),
                primitive: SurfacePrimitiveV1::ReferencePane,
                binding: PaneBindingV1::Reference {
                    object_id: reference.resource.id.clone(),
                },
                collapsed: false,
            }],
            focused_pane_id: PaneId::new("primary_task"),
        };
        assert_eq!(
            surfaces
                .save_v1(
                    SaveSurfaceSnapshotV1Request {
                        field_id: field.id.clone(),
                        layout
                    },
                    12
                )
                .unwrap()
                .observed_field_revision,
            10
        );
        let (archived, _) = reality
            .archive_reference(
                ArchiveReferenceRequest {
                    field_id: field.id.clone(),
                    object_id: reference.resource.id.clone(),
                    expected_object_revision: 1,
                },
                trace(),
                13,
            )
            .unwrap();
        assert_eq!(archived.field_revision, 11);
        let resume = reality.resume_v1(field.id.clone()).unwrap();
        assert_eq!(resume.snapshot_freshness, SnapshotFreshness::Stale);
        assert_eq!(
            resume.unavailable_reference_ids,
            vec![reference.resource.id.clone()]
        );
        assert_eq!(resume.focus_source, FocusSource::None);
        let relations = reality
            .list_relations(ListRelationsRequest {
                field_id: field.id.clone(),
                relation_type: None,
                lifecycle: Some(RelationLifecycle::Retracted),
                endpoint: None,
                cursor: None,
                limit: None,
            })
            .unwrap();
        assert_eq!(
            relations
                .items
                .iter()
                .find(|item| item.id == relation.resource.id)
                .unwrap()
                .lifecycle,
            RelationLifecycle::Retracted
        );
        let (restored, _) = reality
            .restore_reference(
                RestoreReferenceRequest {
                    field_id: field.id.clone(),
                    object_id: reference.resource.id.clone(),
                    expected_object_revision: 2,
                },
                trace(),
                14,
            )
            .unwrap();
        assert_eq!(restored.field_revision, 12);
        let activity_count = reality
            .list_activities(ListActivitiesRequest {
                field_id: field.id.clone(),
                cursor: None,
                limit: Some(100),
            })
            .unwrap()
            .items
            .len();
        let before = fields.get(&field.id).unwrap().revision;
        assert_eq!(
            reality
                .create_reference(
                    CreateReferenceRequest {
                        field_id: field.id.clone(),
                        title: "Duplicate".into(),
                        url: "https://example.com/path?q=secret".into()
                    },
                    trace(),
                    15
                )
                .unwrap_err(),
            DomainError::DuplicateActiveReference
        );
        assert_eq!(
            (
                fields.get(&field.id).unwrap().revision,
                reality
                    .list_activities(ListActivitiesRequest {
                        field_id: field.id.clone(),
                        cursor: None,
                        limit: Some(100)
                    })
                    .unwrap()
                    .items
                    .len()
            ),
            (before, activity_count)
        );
        drop(worker);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn phase02_rejections_leave_reality_activity_and_revisions_unchanged() {
        let root = temporary_root();
        let worker = start(&root, 1);
        let handle = worker.handle();
        let fields = FieldService::new(handle.clone(), handle.local_user.clone());
        let reality = RealityService::new(
            handle.clone(),
            handle.local_user.clone(),
            handle.device_id.clone(),
        );
        let trace = || TraceId::new(Uuid::now_v7().to_string());
        let (field, _) = fields.create("Rejects".into(), None, trace(), 2).unwrap();
        let (fact, _) = reality
            .create_state(
                CreateStateRequest {
                    field_id: field.id.clone(),
                    kind: FieldStateKind::Fact,
                    content: "Frozen fact".into(),
                    confidence: None,
                },
                trace(),
                3,
            )
            .unwrap();
        let activity_count = || {
            reality
                .list_activities(ListActivitiesRequest {
                    field_id: field.id.clone(),
                    cursor: None,
                    limit: Some(100),
                })
                .unwrap()
                .items
                .len()
        };
        assert_eq!(
            reality
                .transition_state(
                    TransitionStateRequest {
                        field_id: field.id.clone(),
                        state_id: fact.resource.id.clone(),
                        expected_state_revision: 1,
                        target: StateTransitionTarget::Resolved,
                    },
                    trace(),
                    4,
                )
                .unwrap_err(),
            DomainError::InvalidStateTransition
        );
        assert_eq!(
            (fields.get(&field.id).unwrap().revision, activity_count()),
            (2, 2)
        );
        let (retracted, _) = reality
            .transition_state(
                TransitionStateRequest {
                    field_id: field.id.clone(),
                    state_id: fact.resource.id.clone(),
                    expected_state_revision: 1,
                    target: StateTransitionTarget::Retracted,
                },
                trace(),
                5,
            )
            .unwrap();
        assert_eq!(retracted.field_revision, 3);
        assert_eq!(
            reality
                .revise_state(
                    ReviseStateRequest {
                        field_id: field.id.clone(),
                        state_id: fact.resource.id,
                        expected_state_revision: 2,
                        content: "Cannot revise".into(),
                        confidence: None,
                    },
                    trace(),
                    6,
                )
                .unwrap_err(),
            DomainError::TerminalResource
        );
        assert_eq!(
            (fields.get(&field.id).unwrap().revision, activity_count()),
            (3, 3)
        );
        assert_eq!(
            reality
                .create_reference(
                    CreateReferenceRequest {
                        field_id: field.id.clone(),
                        title: "Credential".into(),
                        url: "https://user:secret@example.com/".into(),
                    },
                    trace(),
                    7,
                )
                .unwrap_err(),
            DomainError::InvalidReferenceUrl
        );
        assert_eq!(
            (fields.get(&field.id).unwrap().revision, activity_count()),
            (3, 3)
        );
        drop(worker);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn activity_keyset_pages_have_no_duplicates_or_omissions() {
        let root = temporary_root();
        let worker = start(&root, 1);
        let handle = worker.handle();
        let fields = FieldService::new(handle.clone(), handle.local_user.clone());
        let reality = RealityService::new(
            handle.clone(),
            handle.local_user.clone(),
            handle.device_id.clone(),
        );
        let trace = || TraceId::new(Uuid::now_v7().to_string());
        let (field, _) = fields
            .create("Pagination".into(), None, trace(), 2)
            .unwrap();
        for index in 0..55 {
            reality
                .create_state(
                    CreateStateRequest {
                        field_id: field.id.clone(),
                        kind: FieldStateKind::Task,
                        content: format!("Task {index}"),
                        confidence: None,
                    },
                    trace(),
                    3,
                )
                .unwrap();
        }
        let mut cursor = None;
        let mut ids = Vec::new();
        loop {
            let page = reality
                .list_activities(ListActivitiesRequest {
                    field_id: field.id.clone(),
                    cursor,
                    limit: Some(20),
                })
                .unwrap();
            ids.extend(page.items.into_iter().map(|activity| activity.id.0));
            cursor = page.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        assert_eq!(ids.len(), 56);
        assert_eq!(
            ids.iter().collect::<std::collections::HashSet<_>>().len(),
            56
        );
        drop(worker);
        fs::remove_dir_all(root).unwrap();
    }
}
