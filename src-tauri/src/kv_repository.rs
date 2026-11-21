// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//! One process-wide JSON repository. Never truncates the live generation.
use serde_json::{Map, Value};
use std::{fs, io::{self, Write}, path::{Path, PathBuf}, sync::{Mutex, atomic::{AtomicU64, Ordering}}};

static REPOSITORY: Mutex<()> = Mutex::new(());
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn backup(path: &Path) -> PathBuf { path.with_extension("json.previous") }
fn read_generation(path: &Path) -> io::Result<Map<String, Value>> {
    let bytes = fs::read(path)?;
    serde_json::from_slice(&bytes).map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Invalid KV generation; original file preserved"))
}
fn load(path: &Path) -> io::Result<Map<String, Value>> {
    match read_generation(path) {
        Ok(map) => Ok(map),
        Err(primary) => match read_generation(&backup(path)) {
            Ok(map) => Ok(map),
            Err(previous) if primary.kind() == io::ErrorKind::NotFound && previous.kind() == io::ErrorKind::NotFound => Ok(Map::new()),
            Err(_) => Err(primary),
        },
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "KV directory required"))?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".dex-kv-{}-{}.tmp", std::process::id(), SEQUENCE.fetch_add(1, Ordering::Relaxed)));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)] {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)?;
        #[cfg(unix)] fs::File::open(parent)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

pub fn get(path: &Path, key: &str) -> io::Result<Value> {
    let _guard = REPOSITORY.lock().map_err(|_| io::Error::other("KV repository lock poisoned"))?;
    Ok(load(path)?.get(key).cloned().unwrap_or(Value::Null))
}

/// Covers the entire read/mutate/commit, including distinct-key writers.
pub fn update<F>(path: &Path, change: F) -> io::Result<()>
where F: FnOnce(&mut Map<String, Value>) -> io::Result<()> { update_impl(path, change, true) }

pub fn update_authority<F>(path: &Path, change: F) -> io::Result<()>
where F: FnOnce(&mut Map<String, Value>) -> io::Result<()> { update_impl(path, change, false) }

pub fn get_current(path: &Path, key: &str) -> io::Result<Value> {
    let _guard = REPOSITORY.lock().map_err(|_| io::Error::other("KV repository lock poisoned"))?;
    Ok(read_current(path)?.get(key).cloned().unwrap_or(Value::Null))
}
fn read_current(path: &Path) -> io::Result<Map<String, Value>> {
    match read_generation(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound && !backup(path).exists() => Ok(Map::new()),
        result => result,
    }
}
fn update_impl<F>(path: &Path, change: F, recover: bool) -> io::Result<()>
where F: FnOnce(&mut Map<String, Value>) -> io::Result<()> {
    let _guard = REPOSITORY.lock().map_err(|_| io::Error::other("KV repository lock poisoned"))?;
    let mut map = if recover { load(path)? } else { read_current(path)? };
    change(&mut map)?;
    let bytes = serde_json::to_vec(&map)?;
    // Never replace the last good backup with a corrupt primary.
    if let Ok(previous) = read_generation(path) {
        atomic_write(&backup(path), &serde_json::to_vec(&previous)?)?;
    }
    atomic_write(path, &bytes)
}

pub fn set(path: &Path, key: &str, value: Value) -> io::Result<()> {
    if key == crate::app_preferences::KEY {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "Use the app preference service to update application settings"));
    }
    fn sensitive(key: &str, value: &Value) -> bool {
        let normalized: String = key.chars().filter(|c| c.is_ascii_alphanumeric()).flat_map(char::to_lowercase).collect();
        if matches!(normalized.as_str(), "password" | "apikey" | "accesstoken" | "refreshtoken" | "privatekey" | "clientsecret" | "secret")
            && value.as_str().is_some_and(|s| !s.is_empty()) { return true; }
        match value {
            Value::Object(map) => map.iter().any(|(key, value)| sensitive(key, value)),
            Value::Array(values) => values.iter().any(|value| sensitive("", value)),
            _ => false,
        }
    }
    if key.split([':', '/', '.']).any(|part| sensitive(part, &value)) || sensitive("", &value) {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "Sensitive credentials require secure storage"));
    }
    update(path, |map| { map.insert(key.to_owned(), value); Ok(()) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    struct TestStore(PathBuf);
    impl TestStore {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("dex-kv-test-{}-{}", std::process::id(), SEQUENCE.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir(&dir).unwrap();
            Self(dir.join("dex-kv.json"))
        }
    }
    impl Drop for TestStore {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.0);
            let _ = fs::remove_file(backup(&self.0));
            let _ = fs::remove_dir(self.0.parent().unwrap());
        }
    }
    #[test]
    fn concurrent_writers_preserve_every_key_and_atomic_increments() {
        let store = TestStore::new();
        std::thread::scope(|scope| {
            for n in 0..12 {
                let path = &store.0;
                scope.spawn(move || {
                    set(path, &format!("key-{n}"), json!(n)).unwrap();
                    update(path, |map| {
                        let count = map.get("count").and_then(Value::as_u64).unwrap_or(0);
                        map.insert("count".into(), json!(count + 1)); Ok(())
                    }).unwrap();
                });
            }
        });
        assert_eq!(get(&store.0, "count").unwrap(), json!(12));
        for n in 0..12 { assert_eq!(get(&store.0, &format!("key-{n}")).unwrap(), json!(n)); }
    }
    #[test]
    fn corrupt_primary_recovers_previous_and_does_not_destroy_it() {
        let store = TestStore::new();
        set(&store.0, "original", json!(true)).unwrap();
        set(&store.0, "second", json!(true)).unwrap();
        fs::write(&store.0, b"interrupted").unwrap();
        assert_eq!(get(&store.0, "original").unwrap(), json!(true));
        set(&store.0, "recovered", json!(true)).unwrap();
        assert_eq!(read_generation(&backup(&store.0)).unwrap().get("original"), Some(&json!(true)));
        assert_eq!(get(&store.0, "recovered").unwrap(), json!(true));
    }
    #[test]
    fn authorization_storage_never_revives_a_previous_grant() {
        let store = TestStore::new();
        set(&store.0, "grant", json!(true)).unwrap();
        set(&store.0, "grant", json!(false)).unwrap();
        fs::write(&store.0, b"interrupted").unwrap();
        assert!(get_current(&store.0, "grant").is_err());
        assert!(update_authority(&store.0, |_| Ok(())).is_err());
        assert_eq!(get(&store.0, "grant").unwrap(), json!(true));
    }
    #[test]
    fn unrepairable_data_is_preserved_and_mutation_is_rejected() {
        let store = TestStore::new();
        fs::write(&store.0, b"broken").unwrap();
        assert!(set(&store.0, "new", json!(1)).is_err());
        assert_eq!(fs::read(&store.0).unwrap(), b"broken");
    }
    #[test]
    fn failed_transaction_preserves_live_generation() {
        let store = TestStore::new();
        set(&store.0, "original", json!(true)).unwrap();
        assert!(update(&store.0, |map| { map.clear(); Err(io::Error::other("cancelled")) }).is_err());
        assert_eq!(get(&store.0, "original").unwrap(), json!(true));
    }
    #[test]
    fn plaintext_credentials_are_rejected_without_changing_data() {
        let store = TestStore::new();
        assert!(set(&store.0, "provider:apiKey", json!("secret")).is_err());
        assert!(set(&store.0, "settings", json!({"providers": [{"api_key": "secret"}]})).is_err());
        assert!(!store.0.exists());
        set(&store.0, "document", json!({"text": "password instructions"})).unwrap();
    }
}
