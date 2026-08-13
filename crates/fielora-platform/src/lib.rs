use fielora_contracts::DeviceId;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::{Uuid, Version};

#[derive(Debug, Error)]
pub enum PlatformError {
    #[error("LOCALAPPDATA is unavailable")]
    LocalAppDataUnavailable,
    #[error("platform I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("stored device identity is not a canonical UUIDv7")]
    InvalidDeviceIdentity,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformPaths {
    pub data_dir: PathBuf,
    pub runtime_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub config_dir: PathBuf,
    pub database: PathBuf,
    pub core_log: PathBuf,
    pub device_identity: PathBuf,
}

impl PlatformPaths {
    pub fn resolve(allow_development_override: bool) -> Result<Self, PlatformError> {
        let root = if allow_development_override {
            std::env::var_os("FIELORA_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(resolve_local_app_data_root()?)
        } else {
            resolve_local_app_data_root()?
        };
        Self::from_root(root)
    }

    pub fn from_root(root: PathBuf) -> Result<Self, PlatformError> {
        let data_dir = root.join("data");
        let runtime_dir = root.join("runtime");
        let logs_dir = root.join("logs");
        let config_dir = root.join("config");
        for directory in [&data_dir, &runtime_dir, &logs_dir, &config_dir] {
            fs::create_dir_all(directory)?;
        }
        Ok(Self {
            database: data_dir.join("fielora.db"),
            core_log: logs_dir.join("fielora-core.log"),
            device_identity: config_dir.join("device-id"),
            data_dir,
            runtime_dir,
            logs_dir,
            config_dir,
        })
    }
}

fn resolve_local_app_data_root() -> Result<PathBuf, PlatformError> {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|path| path.join("Fielora"))
        .ok_or(PlatformError::LocalAppDataUnavailable)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceIdentity {
    pub id: DeviceId,
    pub name: String,
    pub platform: String,
    pub architecture: String,
}

impl DeviceIdentity {
    pub fn load_or_create(path: &Path) -> Result<Self, PlatformError> {
        let id = if path.exists() {
            let value = fs::read_to_string(path)?;
            let value = value.trim();
            let uuid = Uuid::parse_str(value).map_err(|_| PlatformError::InvalidDeviceIdentity)?;
            if uuid.get_version() != Some(Version::SortRand) || uuid.to_string() != value {
                return Err(PlatformError::InvalidDeviceIdentity);
            }
            DeviceId::new(value)
        } else {
            let id = DeviceId::new(Uuid::now_v7().to_string());
            fs::write(path, format!("{}\n", id.0))?;
            id
        };
        Ok(Self {
            id,
            name: "This device".into(),
            platform: std::env::consts::OS.into(),
            architecture: std::env::consts::ARCH.into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_root() -> PathBuf {
        std::env::temp_dir().join(format!("fielora-platform-{}", Uuid::now_v7()))
    }

    #[test]
    fn device_identity_is_installation_local_and_stable() {
        let root = temporary_root();
        let paths = PlatformPaths::from_root(root.clone()).unwrap();
        let first = DeviceIdentity::load_or_create(&paths.device_identity).unwrap();
        let second = DeviceIdentity::load_or_create(&paths.device_identity).unwrap();
        assert_eq!(first.id, second.id);
        assert!(!first.id.0.contains('\\'));
        fs::remove_dir_all(root).unwrap();
    }
}
