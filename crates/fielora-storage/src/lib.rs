use fielora_contracts::{
    DeviceId, FieldId, FieldLifecycle, FieldMode, ObjectId, PrincipalId, SurfaceSnapshotId,
};
use fielora_field::{
    Activity, DomainError, Field, FieldRepository, SurfaceRepository, SurfaceSnapshot,
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
const MIGRATION_NAME: &str = "core";
const SCHEMA_VERSION: u32 = 1;
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
}

enum StorageCommand {
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

fn run_worker(mut connection: Connection, receiver: Receiver<StorageCommand>) {
    while let Ok(command) = receiver.recv() {
        match command {
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
    let checksum = migration_checksum(MIGRATION_0001);
    let existing: Option<String> = connection
        .query_row(
            "SELECT checksum FROM schema_migrations WHERE version = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(existing) = existing {
        if existing != checksum {
            return Err(StorageError::MigrationChecksum { version: 1 });
        }
        validate_schema(connection)?;
        return Ok(());
    }

    let transaction = connection.transaction()?;
    transaction.execute_batch(MIGRATION_0001)?;
    validate_schema(&transaction)?;
    transaction.execute(
        "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (1, ?1, ?2, ?3)",
        params![MIGRATION_NAME, checksum, now],
    )?;
    transaction.commit()?;
    Ok(())
}

fn migration_checksum(sql: &str) -> String {
    format!("{:x}", Sha256::digest(sql.as_bytes()))
}

fn validate_schema(connection: &Connection) -> Result<(), StorageError> {
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
            DomainError::Conflict
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
    use fielora_contracts::TraceId;
    use fielora_field::{FieldService, SurfaceService};
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
}
