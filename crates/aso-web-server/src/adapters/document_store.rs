//! Server-owned document storage. Database `storage_uri` values are treated as
//! opaque relative object keys, never as URLs or caller-controlled paths.

use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

use aso_host::{
    document_upload::{DocumentUploadError, MAX_DOCUMENT_UPLOAD_BYTES},
    source::{DocumentSourceError, MAX_DOCUMENT_SOURCE_BYTES},
};
use async_trait::async_trait;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[async_trait]
pub trait DocumentStore: Send + Sync {
    async fn read(&self, storage_key: &str) -> Result<Vec<u8>, DocumentSourceError>;

    async fn write_verified(
        &self,
        storage_key: &str,
        bytes: Vec<u8>,
        expected_sha256: [u8; 32],
    ) -> Result<(), DocumentUploadError>;

    async fn delete_if_matches(
        &self,
        storage_key: &str,
        expected_sha256: [u8; 32],
    ) -> Result<(), DocumentUploadError>;
}

pub struct UnavailableDocumentStore;

#[async_trait]
impl DocumentStore for UnavailableDocumentStore {
    async fn read(&self, _: &str) -> Result<Vec<u8>, DocumentSourceError> {
        Err(DocumentSourceError::Unavailable)
    }

    async fn write_verified(
        &self,
        _: &str,
        _: Vec<u8>,
        _: [u8; 32],
    ) -> Result<(), DocumentUploadError> {
        Err(DocumentUploadError::Unavailable)
    }

    async fn delete_if_matches(&self, _: &str, _: [u8; 32]) -> Result<(), DocumentUploadError> {
        Err(DocumentUploadError::Unavailable)
    }
}

#[derive(Clone)]
pub struct LocalDocumentStore {
    root: PathBuf,
}

impl LocalDocumentStore {
    pub fn new(root: impl AsRef<Path>) -> Result<Self, &'static str> {
        let root = root
            .as_ref()
            .canonicalize()
            .map_err(|_| "ASO_DOCUMENT_STORE_ROOT must name a readable directory")?;
        if !root.is_dir() {
            return Err("ASO_DOCUMENT_STORE_ROOT must name a readable directory");
        }
        Ok(Self { root })
    }

    fn read_bounded(root: &Path, storage_key: &str) -> Result<Vec<u8>, DocumentSourceError> {
        let key = Path::new(storage_key);
        if storage_key.is_empty()
            || key.is_absolute()
            || key.components().any(|component| {
                matches!(
                    component,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(DocumentSourceError::Unavailable);
        }
        let path = root
            .join(key)
            .canonicalize()
            .map_err(|_| DocumentSourceError::NotFound)?;
        if !path.starts_with(root) || !path.is_file() {
            return Err(DocumentSourceError::Unavailable);
        }
        let file = File::open(path).map_err(|_| DocumentSourceError::Unavailable)?;
        if file
            .metadata()
            .map_err(|_| DocumentSourceError::Unavailable)?
            .len()
            > MAX_DOCUMENT_SOURCE_BYTES as u64
        {
            return Err(DocumentSourceError::TooLarge);
        }
        let mut bytes = Vec::new();
        file.take(MAX_DOCUMENT_SOURCE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| DocumentSourceError::Unavailable)?;
        if bytes.len() > MAX_DOCUMENT_SOURCE_BYTES {
            return Err(DocumentSourceError::TooLarge);
        }
        if bytes.is_empty() {
            return Err(DocumentSourceError::Unavailable);
        }
        Ok(bytes)
    }

    fn valid_relative_key(storage_key: &str) -> bool {
        let key = Path::new(storage_key);
        !storage_key.is_empty()
            && !key.is_absolute()
            && key
                .components()
                .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
            && key.file_name().is_some()
    }

    fn verified_existing(
        path: &Path,
        expected_sha256: &[u8; 32],
    ) -> Result<(), DocumentUploadError> {
        let file = File::open(path).map_err(|_| DocumentUploadError::Unavailable)?;
        if file
            .metadata()
            .map_err(|_| DocumentUploadError::Unavailable)?
            .len()
            > MAX_DOCUMENT_UPLOAD_BYTES as u64
        {
            return Err(DocumentUploadError::IntegrityMismatch);
        }
        let mut bytes = Vec::new();
        file.take(MAX_DOCUMENT_UPLOAD_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| DocumentUploadError::Unavailable)?;
        if bytes.is_empty()
            || bytes.len() > MAX_DOCUMENT_UPLOAD_BYTES
            || Sha256::digest(&bytes).as_slice() != expected_sha256
        {
            return Err(DocumentUploadError::IntegrityMismatch);
        }
        Ok(())
    }

    fn writable_path(root: &Path, storage_key: &str) -> Result<PathBuf, DocumentUploadError> {
        if !Self::valid_relative_key(storage_key) {
            return Err(DocumentUploadError::Unavailable);
        }
        let key = Path::new(storage_key);
        let parent_key = key.parent().ok_or(DocumentUploadError::Unavailable)?;
        let requested_parent = root.join(parent_key);
        fs::create_dir_all(&requested_parent).map_err(|_| DocumentUploadError::Unavailable)?;
        let parent = requested_parent
            .canonicalize()
            .map_err(|_| DocumentUploadError::Unavailable)?;
        if !parent.starts_with(root) || !parent.is_dir() {
            return Err(DocumentUploadError::Unavailable);
        }
        let file_name = key.file_name().ok_or(DocumentUploadError::Unavailable)?;
        Ok(parent.join(file_name))
    }

    fn write_bounded(
        root: &Path,
        storage_key: &str,
        bytes: &[u8],
        expected_sha256: &[u8; 32],
    ) -> Result<(), DocumentUploadError> {
        if bytes.is_empty() {
            return Err(DocumentUploadError::Invalid);
        }
        if bytes.len() > MAX_DOCUMENT_UPLOAD_BYTES {
            return Err(DocumentUploadError::TooLarge);
        }
        if Sha256::digest(bytes).as_slice() != expected_sha256 {
            return Err(DocumentUploadError::IntegrityMismatch);
        }

        let path = Self::writable_path(root, storage_key)?;
        if path.exists() {
            return Self::verified_existing(&path, expected_sha256);
        }
        let parent = path.parent().ok_or(DocumentUploadError::Unavailable)?;
        let temporary = parent.join(format!(".upload-{}", Uuid::new_v4()));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let result = (|| {
            let mut file = options
                .open(&temporary)
                .map_err(|_| DocumentUploadError::Unavailable)?;
            file.write_all(bytes)
                .map_err(|_| DocumentUploadError::Unavailable)?;
            file.sync_all()
                .map_err(|_| DocumentUploadError::Unavailable)?;
            match fs::hard_link(&temporary, &path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    Self::verified_existing(&path, expected_sha256)?;
                }
                Err(_) => return Err(DocumentUploadError::Unavailable),
            }
            File::open(parent)
                .and_then(|directory| directory.sync_all())
                .map_err(|_| DocumentUploadError::Unavailable)?;
            Self::verified_existing(&path, expected_sha256)
        })();
        let _ = fs::remove_file(&temporary);
        result
    }

    fn delete_bounded(
        root: &Path,
        storage_key: &str,
        expected_sha256: &[u8; 32],
    ) -> Result<(), DocumentUploadError> {
        if !Self::valid_relative_key(storage_key) {
            return Err(DocumentUploadError::Unavailable);
        }
        let requested = root.join(storage_key);
        if !requested.exists() {
            return Ok(());
        }
        let path = requested
            .canonicalize()
            .map_err(|_| DocumentUploadError::Unavailable)?;
        if !path.starts_with(root) || !path.is_file() {
            return Err(DocumentUploadError::Unavailable);
        }
        Self::verified_existing(&path, expected_sha256)?;
        fs::remove_file(&path).map_err(|_| DocumentUploadError::Unavailable)?;
        let parent = path.parent().ok_or(DocumentUploadError::Unavailable)?;
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| DocumentUploadError::Unavailable)?;
        Ok(())
    }
}

#[async_trait]
impl DocumentStore for LocalDocumentStore {
    async fn read(&self, storage_key: &str) -> Result<Vec<u8>, DocumentSourceError> {
        let root = self.root.clone();
        let storage_key = storage_key.to_owned();
        tokio::task::spawn_blocking(move || Self::read_bounded(&root, &storage_key))
            .await
            .map_err(|_| DocumentSourceError::Unavailable)?
    }

    async fn write_verified(
        &self,
        storage_key: &str,
        bytes: Vec<u8>,
        expected_sha256: [u8; 32],
    ) -> Result<(), DocumentUploadError> {
        let root = self.root.clone();
        let storage_key = storage_key.to_owned();
        tokio::task::spawn_blocking(move || {
            Self::write_bounded(&root, &storage_key, &bytes, &expected_sha256)
        })
        .await
        .map_err(|_| DocumentUploadError::Unavailable)?
    }

    async fn delete_if_matches(
        &self,
        storage_key: &str,
        expected_sha256: [u8; 32],
    ) -> Result<(), DocumentUploadError> {
        let root = self.root.clone();
        let storage_key = storage_key.to_owned();
        tokio::task::spawn_blocking(move || {
            Self::delete_bounded(&root, &storage_key, &expected_sha256)
        })
        .await
        .map_err(|_| DocumentUploadError::Unavailable)?
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn fixture_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "aso-source-store-{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        fs::create_dir_all(root.join("documents")).unwrap();
        root
    }

    #[tokio::test]
    async fn reads_relative_object_and_refuses_path_escape() {
        let root = fixture_root();
        fs::write(root.join("documents/source.pdf"), b"%PDF synthetic").unwrap();
        let store = LocalDocumentStore::new(&root).unwrap();
        assert_eq!(
            store.read("documents/source.pdf").await.unwrap(),
            b"%PDF synthetic"
        );
        for key in ["../foreign.pdf", "/tmp/foreign.pdf", ""] {
            assert!(store.read(key).await.is_err(), "accepted {key}");
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn refuses_object_over_delivery_limit() {
        let root = fixture_root();
        let file = File::create(root.join("documents/large.pdf")).unwrap();
        file.set_len(MAX_DOCUMENT_SOURCE_BYTES as u64 + 1).unwrap();
        let store = LocalDocumentStore::new(&root).unwrap();
        assert_eq!(
            store.read("documents/large.pdf").await,
            Err(DocumentSourceError::TooLarge)
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn verified_write_is_idempotent_and_refuses_tampered_existing_object() {
        let root = fixture_root();
        let store = LocalDocumentStore::new(&root).unwrap();
        let key = "documents/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/abababababababababababababababababababababababababababababababab";
        let bytes = b"Synthetic bounded source".to_vec();
        let digest: [u8; 32] = Sha256::digest(&bytes).into();
        store
            .write_verified(key, bytes.clone(), digest)
            .await
            .unwrap();
        store
            .write_verified(key, bytes.clone(), digest)
            .await
            .unwrap();
        assert_eq!(store.read(key).await.unwrap(), bytes);

        fs::write(root.join(key), b"tampered").unwrap();
        assert_eq!(
            store.write_verified(key, bytes, digest).await,
            Err(DocumentUploadError::IntegrityMismatch)
        );
        assert_eq!(
            store.delete_if_matches(key, digest).await,
            Err(DocumentUploadError::IntegrityMismatch)
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn verified_delete_removes_only_matching_object() {
        let root = fixture_root();
        let store = LocalDocumentStore::new(&root).unwrap();
        let key = "documents/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003/cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd";
        let bytes = b"Synthetic disposable source".to_vec();
        let digest: [u8; 32] = Sha256::digest(&bytes).into();
        store.write_verified(key, bytes, digest).await.unwrap();
        store.delete_if_matches(key, digest).await.unwrap();
        assert_eq!(store.read(key).await, Err(DocumentSourceError::NotFound));
        store.delete_if_matches(key, digest).await.unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}
