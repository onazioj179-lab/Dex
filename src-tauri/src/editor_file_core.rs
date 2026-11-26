// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

pub const MAX_BYTES: usize = 8 * 1024 * 1024;
pub type Revision = Option<Vec<u8>>;
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
static REPLACE: Mutex<()> = Mutex::new(());

pub fn read(path: &Path) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)?
        .take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_BYTES {
        return Err(io::Error::other("Text files are limited to 8 MB"));
    }
    Ok(bytes)
}

pub fn digest(bytes: &[u8]) -> Vec<u8> {
    Sha256::digest(bytes).to_vec()
}

pub fn revision(path: &Path) -> io::Result<Revision> {
    match read(path) {
        Ok(bytes) => Ok(Some(digest(&bytes))),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn commit(path: &Path, content: &str, expected: &Revision) -> io::Result<()> {
    if content.len() > MAX_BYTES {
        return Err(io::Error::other("Text files are limited to 8 MB"));
    }
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("Missing parent"))?;
    let temp = parent.join(format!(
        ".dex-editor-{}-{}.tmp",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)?;
    let result = (|| {
        if let Ok(metadata) = fs::metadata(path) {
            file.set_permissions(metadata.permissions())?;
        }
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        // A regular file save and a project save can target the same file.
        let _lock = REPLACE
            .lock()
            .map_err(|_| io::Error::other("Text file writer unavailable."))?;
        if &revision(path)? != expected {
            return Err(io::Error::other(
                "File changed outside DEX. Reopen it or use Save As.",
            ));
        }
        if expected.is_none() {
            fs::hard_link(&temp, path)?;
            let _ = fs::remove_file(&temp);
        } else {
            fs::rename(&temp, path)?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}
