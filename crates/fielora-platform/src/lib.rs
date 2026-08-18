use fielora_contracts::DeviceId;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::{Uuid, Version};

pub const MAX_CREDENTIAL_BYTES: usize = 2048;

#[derive(Debug)]
pub struct SecretBytes(Vec<u8>);

impl SecretBytes {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self(bytes)
    }
    pub fn expose(&self) -> &[u8] {
        &self.0
    }
}

impl Drop for SecretBytes {
    fn drop(&mut self) {
        self.0.fill(0);
    }
}

#[derive(Debug, Error)]
pub enum CredentialError {
    #[error("credential not found")]
    NotFound,
    #[error("credential is empty or exceeds the 2048-byte bound")]
    InvalidSize,
    #[error("credential manager operation failed")]
    Platform,
}

pub trait CredentialStore: Send + Sync {
    fn store(&self, target: &str, secret: SecretBytes) -> Result<(), CredentialError>;
    fn read(&self, target: &str) -> Result<SecretBytes, CredentialError>;
    fn delete(&self, target: &str) -> Result<(), CredentialError>;
    fn exists(&self, target: &str) -> bool {
        self.read(target).is_ok()
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct WindowsCredentialStore;

#[cfg(windows)]
impl CredentialStore for WindowsCredentialStore {
    fn store(&self, target: &str, secret: SecretBytes) -> Result<(), CredentialError> {
        use std::ptr::null_mut;
        use windows_sys::Win32::Security::Credentials::{
            CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredWriteW,
        };
        if secret.expose().is_empty() || secret.expose().len() > MAX_CREDENTIAL_BYTES {
            return Err(CredentialError::InvalidSize);
        }
        let mut target = wide(target);
        let mut user = wide("Fielora");
        let credential = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_mut_ptr(),
            Comment: null_mut(),
            LastWritten: unsafe { std::mem::zeroed() },
            CredentialBlobSize: secret.expose().len() as u32,
            CredentialBlob: secret.expose().as_ptr() as *mut u8,
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: null_mut(),
            TargetAlias: null_mut(),
            UserName: user.as_mut_ptr(),
        };
        if unsafe { CredWriteW(&credential, 0) } == 0 {
            Err(CredentialError::Platform)
        } else {
            Ok(())
        }
    }

    fn read(&self, target: &str) -> Result<SecretBytes, CredentialError> {
        use std::ptr::null_mut;
        use windows_sys::Win32::Foundation::{ERROR_NOT_FOUND, GetLastError};
        use windows_sys::Win32::Security::Credentials::{
            CRED_TYPE_GENERIC, CREDENTIALW, CredFree, CredReadW,
        };
        let target = wide(target);
        let mut raw: *mut CREDENTIALW = null_mut();
        if unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut raw) } == 0 {
            return if unsafe { GetLastError() } == ERROR_NOT_FOUND {
                Err(CredentialError::NotFound)
            } else {
                Err(CredentialError::Platform)
            };
        }
        let credential = unsafe { &*raw };
        let bytes = unsafe {
            std::slice::from_raw_parts(
                credential.CredentialBlob,
                credential.CredentialBlobSize as usize,
            )
        }
        .to_vec();
        unsafe { CredFree(raw as *const _) };
        Ok(SecretBytes::new(bytes))
    }

    fn delete(&self, target: &str) -> Result<(), CredentialError> {
        use windows_sys::Win32::Foundation::{ERROR_NOT_FOUND, GetLastError};
        use windows_sys::Win32::Security::Credentials::{CRED_TYPE_GENERIC, CredDeleteW};
        let target = wide(target);
        if unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0
            && unsafe { GetLastError() } != ERROR_NOT_FOUND
        {
            Err(CredentialError::Platform)
        } else {
            Ok(())
        }
    }
}

#[cfg(not(windows))]
impl CredentialStore for WindowsCredentialStore {
    fn store(&self, _: &str, _: SecretBytes) -> Result<(), CredentialError> {
        Err(CredentialError::Platform)
    }
    fn read(&self, _: &str) -> Result<SecretBytes, CredentialError> {
        Err(CredentialError::Platform)
    }
    fn delete(&self, _: &str) -> Result<(), CredentialError> {
        Err(CredentialError::Platform)
    }
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

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
