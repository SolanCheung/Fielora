//! Neutral access to the existing LibraryRoot content-addressed blob layout.
//!
//! Assets and LibraryObjects have separate product semantics and metadata.
//! They only share immutable content bytes under `blobs/objects`; this type
//! never creates or reads a LibraryObject.

use crate::{AgentError, sha256};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ContentBlobStore {
    library_root: PathBuf,
}

impl ContentBlobStore {
    pub fn new(library_root: impl Into<PathBuf>) -> Self {
        Self {
            library_root: library_root.into(),
        }
    }

    pub fn blob_ref(content_sha256: &str) -> Result<String, AgentError> {
        validate_digest(content_sha256)?;
        Ok(format!(
            "blobs/objects/{}/{}",
            &content_sha256[..2],
            content_sha256
        ))
    }

    pub fn put_exact(&self, bytes: &[u8], expected_sha256: &str) -> Result<String, AgentError> {
        validate_digest(expected_sha256)?;
        if bytes.is_empty() || sha256(bytes) != expected_sha256 {
            return Err(AgentError::AssetContentChanged);
        }
        let blob_ref = Self::blob_ref(expected_sha256)?;
        let target = self.library_root.join(Path::new(&blob_ref));
        if target.exists() {
            self.verify_target(&target, bytes.len() as u64, expected_sha256)?;
            return Ok(blob_ref);
        }
        let parent = target.parent().ok_or(AgentError::IoFailed)?;
        fs::create_dir_all(parent).map_err(|_| AgentError::IoFailed)?;
        let temporary = parent.join(format!(".fielora-asset-{}.tmp", Uuid::now_v7()));
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| AgentError::IoFailed)?;
            file.write_all(bytes).map_err(|_| AgentError::IoFailed)?;
            file.sync_all().map_err(|_| AgentError::IoFailed)?;
            drop(file);
            match fs::rename(&temporary, &target) {
                Ok(()) => Ok(()),
                Err(_) if target.exists() => {
                    self.verify_target(&target, bytes.len() as u64, expected_sha256)
                }
                Err(_) => Err(AgentError::IoFailed),
            }
        })();
        if temporary.exists() {
            let _ = fs::remove_file(&temporary);
        }
        result?;
        self.verify_target(&target, bytes.len() as u64, expected_sha256)?;
        Ok(blob_ref)
    }

    pub fn read_verified(
        &self,
        blob_ref: &str,
        expected_length: u64,
        expected_sha256: &str,
        max_bytes: usize,
    ) -> Result<Vec<u8>, AgentError> {
        validate_digest(expected_sha256)?;
        if blob_ref != Self::blob_ref(expected_sha256)? || expected_length > max_bytes as u64 {
            return Err(AgentError::AssetContentChanged);
        }
        let target = self.library_root.join(Path::new(blob_ref));
        let metadata =
            fs::symlink_metadata(&target).map_err(|_| AgentError::AssetContentChanged)?;
        if !metadata.file_type().is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() != expected_length
        {
            return Err(AgentError::AssetContentChanged);
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
            if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Err(AgentError::AssetContentChanged);
            }
        }
        let bytes = fs::read(&target).map_err(|_| AgentError::AssetContentChanged)?;
        if bytes.len() > max_bytes
            || bytes.len() as u64 != expected_length
            || sha256(&bytes) != expected_sha256
        {
            return Err(AgentError::AssetContentChanged);
        }
        Ok(bytes)
    }

    fn verify_target(
        &self,
        target: &Path,
        expected_length: u64,
        expected_sha256: &str,
    ) -> Result<(), AgentError> {
        let metadata = fs::symlink_metadata(target).map_err(|_| AgentError::AssetContentChanged)?;
        if !metadata.file_type().is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() != expected_length
        {
            return Err(AgentError::AssetContentChanged);
        }
        let bytes = fs::read(target).map_err(|_| AgentError::AssetContentChanged)?;
        if format!("{:x}", Sha256::digest(bytes)) != expected_sha256 {
            return Err(AgentError::AssetContentChanged);
        }
        Ok(())
    }
}

fn validate_digest(value: &str) -> Result<(), AgentError> {
    if value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(AgentError::AssetContentChanged)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_put_dedup_and_corruption_fail_closed() {
        let root = std::env::temp_dir().join(format!("fielora-content-blob-{}", Uuid::now_v7()));
        let store = ContentBlobStore::new(&root);
        let bytes = b"same durable bytes";
        let digest = sha256(bytes);
        let blob_ref = store.put_exact(bytes, &digest).unwrap();
        assert_eq!(store.put_exact(bytes, &digest).unwrap(), blob_ref);
        assert_eq!(
            store
                .read_verified(&blob_ref, bytes.len() as u64, &digest, 1024)
                .unwrap(),
            bytes
        );
        fs::write(root.join(&blob_ref), b"corrupt").unwrap();
        assert_eq!(
            store
                .read_verified(&blob_ref, bytes.len() as u64, &digest, 1024)
                .unwrap_err(),
            AgentError::AssetContentChanged
        );
        fs::remove_file(root.join(&blob_ref)).unwrap();
        assert_eq!(
            store
                .read_verified(&blob_ref, bytes.len() as u64, &digest, 1024)
                .unwrap_err(),
            AgentError::AssetContentChanged
        );
        let _ = fs::remove_dir_all(root);
    }
}
