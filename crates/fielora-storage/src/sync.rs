//! Provider-neutral future sync boundary. V0.1 intentionally ships only the
//! disabled provider and therefore cannot perform a network request.

use fielora_contracts::SyncChangeView;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingSyncClass {
    Syncable,
    DeviceLocal,
    NeverSync,
}

pub fn classify_setting(key: &str) -> SettingSyncClass {
    match key {
        "appearance.theme" | "language" | "interaction.preference" => SettingSyncClass::Syncable,
        "storage.data_root"
        | "storage.library_root"
        | "storage.cache_root"
        | "project.local_path"
        | "window.state"
        | "external_app.path" => SettingSyncClass::DeviceLocal,
        "credential" | "secret" | "cache" | "temporary_state" => SettingSyncClass::NeverSync,
        _ => SettingSyncClass::DeviceLocal,
    }
}

pub trait SyncProvider {
    fn push_changes(&self, changes: &[SyncChangeView]) -> Result<(), &'static str>;
    fn pull_changes(&self) -> Result<Vec<SyncChangeView>, &'static str>;
    fn upload_blob(&self, content_hash: &str, bytes: &[u8]) -> Result<(), &'static str>;
    fn download_blob(&self, content_hash: &str) -> Result<Vec<u8>, &'static str>;
    fn get_checkpoint(&self) -> Result<Option<String>, &'static str>;
    fn commit_checkpoint(&self, checkpoint: &str) -> Result<(), &'static str>;
    fn request_count(&self) -> u64;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct DisabledSyncProvider;

impl SyncProvider for DisabledSyncProvider {
    fn push_changes(&self, _changes: &[SyncChangeView]) -> Result<(), &'static str> {
        Err("SYNC_DISABLED")
    }
    fn pull_changes(&self) -> Result<Vec<SyncChangeView>, &'static str> {
        Err("SYNC_DISABLED")
    }
    fn upload_blob(&self, _content_hash: &str, _bytes: &[u8]) -> Result<(), &'static str> {
        Err("SYNC_DISABLED")
    }
    fn download_blob(&self, _content_hash: &str) -> Result<Vec<u8>, &'static str> {
        Err("SYNC_DISABLED")
    }
    fn get_checkpoint(&self) -> Result<Option<String>, &'static str> {
        Err("SYNC_DISABLED")
    }
    fn commit_checkpoint(&self, _checkpoint: &str) -> Result<(), &'static str> {
        Err("SYNC_DISABLED")
    }
    fn request_count(&self) -> u64 {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_provider_makes_zero_requests_and_settings_are_classified() {
        let provider = DisabledSyncProvider;
        assert_eq!(provider.pull_changes(), Err("SYNC_DISABLED"));
        assert_eq!(provider.request_count(), 0);
        assert_eq!(
            classify_setting("appearance.theme"),
            SettingSyncClass::Syncable
        );
        assert_eq!(
            classify_setting("storage.data_root"),
            SettingSyncClass::DeviceLocal
        );
        assert_eq!(classify_setting("credential"), SettingSyncClass::NeverSync);
    }
}
