use fielora_contracts::DeviceId;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{ExitStatus, Stdio};
use std::time::Duration;
use thiserror::Error;
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use uuid::{Uuid, Version};

pub const MAX_CREDENTIAL_BYTES: usize = 2048;

const MAX_MANAGED_PROCESS_ARGUMENTS: usize = 128;
const MAX_MANAGED_PROCESS_ENVIRONMENT: usize = 128;

#[derive(Debug, Clone)]
pub struct ManagedChildConfig {
    pub executable: PathBuf,
    pub arguments: Vec<OsString>,
    pub working_directory: PathBuf,
    pub environment: Vec<(OsString, OsString)>,
}

#[derive(Debug)]
pub struct ManagedChildStdio {
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
    pub stderr: ChildStderr,
}

#[derive(Debug, Error)]
pub enum ManagedChildError {
    #[error("managed child configuration is invalid")]
    InvalidConfiguration,
    #[error("managed child I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("managed child did not exit after termination")]
    TerminationTimeout,
    #[error("managed child process handle is unavailable")]
    ProcessHandleUnavailable,
    #[error("Windows Job Object operation failed")]
    JobObject,
}

/// A generic, bounded local child process owned by Fielora.
///
/// The child receives no inherited environment and is attached to a Windows
/// Job Object so closing or terminating this owner applies to the process tree.
pub struct ManagedChild {
    child: Child,
    #[cfg(windows)]
    job: WindowsJob,
}

impl std::fmt::Debug for ManagedChild {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ManagedChild")
            .field("id", &self.child.id())
            .finish_non_exhaustive()
    }
}

impl ManagedChild {
    pub fn spawn(
        config: ManagedChildConfig,
    ) -> Result<(Self, ManagedChildStdio), ManagedChildError> {
        if !config.executable.is_absolute()
            || !config.executable.is_file()
            || !config.working_directory.is_absolute()
            || !config.working_directory.is_dir()
            || config.arguments.len() > MAX_MANAGED_PROCESS_ARGUMENTS
            || config.environment.len() > MAX_MANAGED_PROCESS_ENVIRONMENT
            || config
                .environment
                .iter()
                .any(|(key, _)| key.is_empty() || key.to_string_lossy().contains('='))
        {
            return Err(ManagedChildError::InvalidConfiguration);
        }

        let mut command = Command::new(&config.executable);
        command
            .args(&config.arguments)
            .current_dir(&config.working_directory)
            .env_clear()
            .envs(config.environment)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(false);
        let mut child = command.spawn()?;
        #[cfg(windows)]
        let job = match WindowsJob::assign(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.start_kill();
                return Err(error);
            }
        };
        let stdio = ManagedChildStdio {
            stdin: child
                .stdin
                .take()
                .ok_or(ManagedChildError::ProcessHandleUnavailable)?,
            stdout: child
                .stdout
                .take()
                .ok_or(ManagedChildError::ProcessHandleUnavailable)?,
            stderr: child
                .stderr
                .take()
                .ok_or(ManagedChildError::ProcessHandleUnavailable)?,
        };
        Ok((
            Self {
                child,
                #[cfg(windows)]
                job,
            },
            stdio,
        ))
    }

    pub fn id(&self) -> Option<u32> {
        self.child.id()
    }

    pub fn try_wait(&mut self) -> Result<Option<ExitStatus>, ManagedChildError> {
        Ok(self.child.try_wait()?)
    }

    pub async fn shutdown(
        &mut self,
        graceful_timeout: Duration,
        termination_timeout: Duration,
    ) -> Result<ExitStatus, ManagedChildError> {
        if let Some(status) = self.child.try_wait()? {
            return Ok(status);
        }
        if let Ok(result) = tokio::time::timeout(graceful_timeout, self.child.wait()).await {
            return Ok(result?);
        }
        self.terminate_tree()?;
        match tokio::time::timeout(termination_timeout, self.child.wait()).await {
            Ok(result) => Ok(result?),
            Err(_) => Err(ManagedChildError::TerminationTimeout),
        }
    }

    pub fn terminate_tree(&mut self) -> Result<(), ManagedChildError> {
        #[cfg(windows)]
        {
            self.job.terminate()
        }
        #[cfg(not(windows))]
        {
            self.child.start_kill()?;
            Ok(())
        }
    }
}

impl Drop for ManagedChild {
    fn drop(&mut self) {
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.terminate_tree();
            let _ = self.child.start_kill();
        }
    }
}

#[cfg(windows)]
struct WindowsJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for WindowsJob {}

#[cfg(windows)]
impl WindowsJob {
    fn assign(child: &Child) -> Result<Self, ManagedChildError> {
        use std::ptr::null;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        };
        let job = unsafe { CreateJobObjectW(null(), null()) };
        if job.is_null() {
            return Err(ManagedChildError::JobObject);
        }
        let mut information: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        information.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &information as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        let process = child
            .raw_handle()
            .ok_or(ManagedChildError::ProcessHandleUnavailable)?
            as windows_sys::Win32::Foundation::HANDLE;
        if configured == 0 || unsafe { AssignProcessToJobObject(job, process) } == 0 {
            unsafe { windows_sys::Win32::Foundation::CloseHandle(job) };
            return Err(ManagedChildError::JobObject);
        }
        Ok(Self(job))
    }

    fn terminate(&self) -> Result<(), ManagedChildError> {
        use windows_sys::Win32::System::JobObjects::TerminateJobObject;
        if unsafe { TerminateJobObject(self.0, 1) } == 0 {
            Err(ManagedChildError::JobObject)
        } else {
            Ok(())
        }
    }
}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe { windows_sys::Win32::Foundation::CloseHandle(self.0) };
    }
}

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
    pub base_dir: PathBuf,
    pub data_dir: PathBuf,
    pub library_dir: PathBuf,
    pub cache_dir: PathBuf,
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
        let data_root = std::env::var_os("FIELORA_MANAGED_DATA_ROOT").map(PathBuf::from);
        let library_root = std::env::var_os("FIELORA_MANAGED_LIBRARY_ROOT").map(PathBuf::from);
        let cache_root = std::env::var_os("FIELORA_MANAGED_CACHE_ROOT").map(PathBuf::from);
        Self::from_storage_roots(
            root.clone(),
            data_root.unwrap_or_else(|| root.join("data")),
            library_root.unwrap_or_else(|| root.join("library")),
            cache_root.unwrap_or_else(|| root.join("cache")),
        )
    }

    pub fn from_root(root: PathBuf) -> Result<Self, PlatformError> {
        Self::from_storage_roots(
            root.clone(),
            root.join("data"),
            root.join("library"),
            root.join("cache"),
        )
    }

    pub fn from_storage_roots(
        root: PathBuf,
        data_dir: PathBuf,
        library_dir: PathBuf,
        cache_dir: PathBuf,
    ) -> Result<Self, PlatformError> {
        let runtime_dir = root.join("runtime");
        let logs_dir = root.join("logs");
        let config_dir = root.join("config");
        for directory in [
            &data_dir,
            &library_dir,
            &cache_dir,
            &runtime_dir,
            &logs_dir,
            &config_dir,
        ] {
            fs::create_dir_all(directory)?;
        }
        Ok(Self {
            base_dir: root,
            database: data_dir.join("fielora.db"),
            core_log: logs_dir.join("fielora-core.log"),
            device_identity: config_dir.join("device-id"),
            data_dir,
            library_dir,
            cache_dir,
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

    #[test]
    fn storage_roots_are_independent_and_database_stays_in_data_root() {
        let root = temporary_root();
        let data = root.join("durable");
        let library = root.join("large-library");
        let cache = root.join("disposable");
        let paths = PlatformPaths::from_storage_roots(
            root.clone(),
            data.clone(),
            library.clone(),
            cache.clone(),
        )
        .unwrap();
        assert_eq!(paths.data_dir, data);
        assert_eq!(paths.database, data.join("fielora.db"));
        assert_eq!(paths.library_dir, library);
        assert_eq!(paths.cache_dir, cache);
        fs::remove_dir_all(root).unwrap();
    }
}
