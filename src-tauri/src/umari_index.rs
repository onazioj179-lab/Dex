// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use dex_search::{FileHit, SearchIndex};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    fs, io,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

const POLICY_KEY: &str = "approved-folders";
const MAX_FOLDERS: usize = 8;
const MAX_FILES: usize = 20_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Folder {
    path: PathBuf,
    include_contents: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Policy {
    version: u32,
    revision: String,
    indexed_revision: Option<String>,
    folders: Vec<Folder>,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            version: 1,
            revision: String::new(),
            indexed_revision: None,
            folders: Vec::new(),
        }
    }
}

impl Policy {
    fn read(value: Value) -> io::Result<Self> {
        if value.is_null() {
            return Ok(Self::default());
        }
        let policy: Self = serde_json::from_value(value)?;
        if policy.version != 1
            || policy.folders.len() > MAX_FOLDERS
            || policy
                .folders
                .iter()
                .any(|folder| !folder.path.is_absolute())
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid Umari scope policy",
            ));
        }
        Ok(policy)
    }

    fn ready(&self) -> bool {
        !self.folders.is_empty() && self.indexed_revision.as_deref() == Some(&self.revision)
    }

    fn mode_for(&self, path: &Path) -> Option<bool> {
        self.folders.iter().find_map(|folder| {
            let relative = path.strip_prefix(&folder.path).ok()?;
            dex_search::allowed_relative(relative).then_some(folder.include_contents)
        })
    }
}

struct WatchSession {
    revision: String,
    _watcher: RecommendedWatcher,
}

pub struct UmariIndex {
    index: Option<SearchIndex>,
    writer: Mutex<()>,
    epoch: AtomicU64,
    rebuilding: AtomicBool,
    watcher: Mutex<Option<WatchSession>>,
    watch_error: Mutex<Option<String>>,
}

impl UmariIndex {
    pub fn new(directory: Option<PathBuf>) -> Self {
        Self {
            index: directory.and_then(|path| SearchIndex::open_or_create(&path).ok()),
            writer: Mutex::new(()),
            epoch: AtomicU64::new(0),
            rebuilding: AtomicBool::new(false),
            watcher: Mutex::new(None),
            watch_error: Mutex::new(None),
        }
    }
}

fn authority_path(app: &AppHandle) -> Result<PathBuf, String> {
    crate::kv_path(app).map(|path| path.with_file_name("umari-authorized-folders.json"))
}

fn policy(app: &AppHandle) -> Result<Policy, String> {
    let path = authority_path(app)?;
    let value =
        crate::kv_repository::get_current(&path, POLICY_KEY).map_err(|error| error.to_string())?;
    Policy::read(value).map_err(|error| error.to_string())
}

fn change_policy(
    app: &AppHandle,
    change: impl FnOnce(&mut Policy) -> io::Result<()>,
) -> Result<(), String> {
    let path = authority_path(app)?;
    crate::kv_repository::update_authority(&path, |store| {
        let mut policy = Policy::read(store.get(POLICY_KEY).cloned().unwrap_or_default())?;
        change(&mut policy)?;
        store.insert(POLICY_KEY.into(), serde_json::to_value(policy)?);
        Ok(())
    })
    .map_err(|error| error.to_string())
}

fn invalidate(policy: &mut Policy) {
    policy.revision = crate::util::pseudo_uuid_v4();
    policy.indexed_revision = None;
}

fn root_is_eligible(root: &Path) -> bool {
    root.file_name().is_some()
        && root.components().all(|component| match component {
            Component::Normal(name) => dex_search::allowed_relative(Path::new(name)),
            Component::ParentDir | Component::CurDir => false,
            _ => true,
        })
        && fs::symlink_metadata(root)
            .is_ok_and(|metadata| metadata.is_dir() && dex_search::regular_entry(&metadata))
        && root.canonicalize().is_ok_and(|resolved| resolved == root)
}

fn add_folder(app: &AppHandle, contents: bool) -> Result<(), String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Choose a folder for Umari")
        .blocking_pick_folder()
        .ok_or("No folder was selected.")?;
    let path = picked
        .into_path()
        .map_err(|error| error.to_string())?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !root_is_eligible(&path) {
        return Err("Choose a specific folder outside hidden and excluded locations.".into());
    }
    let detail = if contents {
        "Read the text of supported files in this folder."
    } else {
        "Read file names and metadata in this folder."
    };
    if !app
        .dialog()
        .message(format!(
            "Allow Umari to index this folder?\n\n{}\n\n{detail}",
            path.display()
        ))
        .title("DEX — Umari indexing")
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show()
    {
        return Err("Folder indexing was cancelled.".into());
    }
    change_policy(app, |policy| {
        if policy
            .folders
            .iter()
            .any(|existing| path.starts_with(&existing.path) || existing.path.starts_with(&path))
        {
            return Err(io::Error::new(io::ErrorKind::AlreadyExists, "This folder overlaps an existing approval. Remove that approval before changing its coverage or indexing mode."));
        }
        if policy.folders.len() >= MAX_FOLDERS {
            return Err(io::Error::other("Up to eight folders can be approved."));
        }
        policy.folders.push(Folder {
            path,
            include_contents: contents,
        });
        invalidate(policy);
        Ok(())
    })?;
    stop_watch(app);
    Ok(())
}

fn remove_folder(app: &AppHandle, path: &Path) -> Result<(), String> {
    change_policy(app, |policy| {
        let old_len = policy.folders.len();
        policy.folders.retain(|folder| folder.path != path);
        if policy.folders.len() == old_len {
            return Err(io::Error::other("No such folder approval"));
        }
        invalidate(policy);
        Ok(())
    })?;
    stop_watch(app);
    // The removed scope is denied immediately by its revision. Rebuild the
    // remainder even if an earlier scan has not reached its cancellation check.
    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = rebuild_locked(&worker, true);
        if let Err(error) = result {
            if let Ok(mut stored) = worker.state::<UmariIndex>().watch_error.lock() {
                *stored = Some(error);
            }
        }
    });
    Ok(())
}

struct Rebuilding<'a>(&'a AtomicBool, &'a AppHandle);
impl Drop for Rebuilding<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
        let _ = self.1.emit("dex-umari-index-changed", ());
    }
}

fn rebuild_locked(app: &AppHandle, wait: bool) -> Result<usize, String> {
    let state = app.state::<UmariIndex>();
    let _guard = if wait {
        state
            .writer
            .lock()
            .map_err(|_| "The index is unavailable.")?
    } else {
        state
            .writer
            .try_lock()
            .map_err(|_| "Indexing is already running.")?
    };
    let epoch = state.epoch.load(Ordering::Acquire);
    let policy_before = policy(app)?;
    let index = state.index.as_ref().ok_or("The index is unavailable.")?;
    state.rebuilding.store(true, Ordering::Release);
    let _rebuilding = Rebuilding(&state.rebuilding, app);
    let _ = app.emit("dex-umari-index-changed", ());
    let approved: Vec<_> = policy_before
        .folders
        .iter()
        .filter(|folder| root_is_eligible(&folder.path))
        .map(|folder| (folder.path.clone(), folder.include_contents))
        .collect();
    let indexed = index.replace_scoped(&approved, MAX_FILES, || {
        state.epoch.load(Ordering::Acquire) != epoch
    })?;
    change_policy(app, |current| {
        if current.revision != policy_before.revision
            || state.epoch.load(Ordering::Acquire) != epoch
        {
            return Err(io::Error::other(
                "Folder approvals changed during indexing.",
            ));
        }
        current.indexed_revision = Some(current.revision.clone());
        Ok(())
    })?;
    if let Ok(mut error) = state.watch_error.lock() {
        let missing = policy_before.folders.len() - approved.len();
        *error = (missing != 0).then(|| format!("{missing} approved folder(s) are unavailable or excluded."));
    }
    start_watch(app);
    Ok(indexed)
}

fn stop_watch(app: &AppHandle) {
    let state = app.state::<UmariIndex>();
    state.epoch.fetch_add(1, Ordering::AcqRel);
    if let Ok(mut watcher) = state.watcher.lock() {
        *watcher = None;
    }
    let _ = app.emit("dex-umari-index-changed", ());
}

pub fn status(app: &AppHandle) -> Value {
    let state = app.state::<UmariIndex>();
    match policy(app) {
        Ok(policy) => {
            let indexed = if policy.ready() {
                state.index.as_ref().map_or(0, SearchIndex::count)
            } else {
                0
            };
            let watching = state.watcher.lock().is_ok_and(|watcher| {
                watcher
                    .as_ref()
                    .is_some_and(|watcher| watcher.revision == policy.revision)
            });
            let warning = state
                .watch_error
                .lock()
                .ok()
                .and_then(|error| error.clone());
            json!({ "success": true, "shell": "tauri", "folders": policy.folders, "indexed": indexed,
                "ready": policy.ready(), "building": state.rebuilding.load(Ordering::Acquire), "watching": watching, "warning": warning })
        }
        Err(error) => json!({ "success": false, "error": error }),
    }
}

pub fn scopes(app: &AppHandle) -> Value {
    let Ok(policy) = policy(app) else {
        return json!([]);
    };
    let indexed = policy.ready();
    json!(policy.folders.iter().map(|folder| json!({
        "path": folder.path, "name": folder.path.file_name().unwrap_or_default().to_string_lossy(),
        "indexed": indexed,
    })).collect::<Vec<_>>())
}

pub fn in_scope(app: &AppHandle, path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|metadata| dex_search::regular_entry(&metadata))
        && path.canonicalize()
        .ok()
        .and_then(|resolved| policy(app).ok()?.mode_for(&resolved))
        .is_some()
}

pub fn dispatch(app: &AppHandle, channel: &str, args: &Value) -> Value {
    let result = match channel {
        "umari:index:status" | "search:getStats" => return status(app),
        "umari:index:add" => add_folder(app, args[0].as_bool() == Some(true)).map(|()| None),
        "umari:index:remove" => {
            remove_folder(app, Path::new(args[0].as_str().unwrap_or_default())).map(|()| None)
        }
        "umari:index:rebuild"
        | "search:rebuild"
        | "fileSearch:reindex"
        | "search:sync"
        | "fileSearch:sync" => rebuild_locked(app, false).map(Some),
        "umari:index:cancel" => {
            app.state::<UmariIndex>()
                .epoch
                .fetch_add(1, Ordering::AcqRel);
            Ok(None)
        }
        _ => return json!({ "success": false, "error": "Unknown indexing operation" }),
    };
    match result {
        Ok(Some(indexed)) => json!({ "success": true, "indexed": indexed }),
        Ok(None) => json!({ "success": true }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

pub fn search(
    app: &AppHandle,
    query: &str,
    within: Option<&Path>,
    limit: usize,
) -> Option<Vec<FileHit>> {
    if query.trim().is_empty() || query.len() > 512 {
        return Some(Vec::new());
    }
    let state = app.state::<UmariIndex>();
    let policy_before = policy(app).ok()?;
    if !policy_before.ready() {
        return None;
    }
    let root = within.map(Path::canonicalize).transpose().ok()?;
    let index = state.index.as_ref()?;
    let matches = index
        .search(query, limit.saturating_mul(4).clamp(1, 800))
        .into_iter()
        .filter(|hit| {
            let path = Path::new(&hit.path);
            if root.as_ref().is_some_and(|root| !path.starts_with(root))
                || policy_before.mode_for(path).is_none()
            {
                return false;
            }
            let Ok(metadata) = fs::symlink_metadata(path) else {
                return false;
            };
            metadata.is_file()
                && dex_search::regular_entry(&metadata)
                && hit.size == metadata.len()
                && hit.modified == dex_search::modification_time(&metadata)
                && path.canonicalize().is_ok_and(|actual| actual == path)
        })
        .take(limit)
        .collect();
    let current = policy(app).ok()?;
    (current.ready() && current.revision == policy_before.revision).then_some(matches)
}

pub fn start_watch(app: &AppHandle) {
    let state = app.state::<UmariIndex>();
    let Ok(mut slot) = state.watcher.lock() else {
        return;
    };
    let Ok(policy) = policy(app) else {
        return;
    };
    if !policy.ready() {
        return;
    }
    if slot
        .as_ref()
        .is_some_and(|watcher| watcher.revision == policy.revision)
    {
        return;
    }
    let (tx, rx) = mpsc::sync_channel::<Event>(512);
    let overflow = Arc::new(AtomicBool::new(false));
    let callback_overflow = overflow.clone();
    let watcher = notify::recommended_watcher(move |event: notify::Result<Event>| match event {
        Ok(value)
            if matches!(
                value.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            ) =>
        {
            if tx.try_send(value).is_err() {
                callback_overflow.store(true, Ordering::Release);
            }
        }
        Err(_) => callback_overflow.store(true, Ordering::Release),
        _ => {}
    });
    let mut watcher = match watcher {
        Ok(watcher) => watcher,
        Err(error) => {
            if let Ok(mut warning) = state.watch_error.lock() {
                *warning = Some(error.to_string());
            }
            return;
        }
    };
    let mut watched = 0;
    for folder in policy
        .folders
        .iter()
        .filter(|folder| root_is_eligible(&folder.path))
    {
        match watcher.watch(&folder.path, RecursiveMode::Recursive) {
            Ok(()) => watched += 1,
            Err(error) => {
                if let Ok(mut warning) = state.watch_error.lock() {
                    *warning = Some(error.to_string());
                }
            }
        }
    }
    if watched == 0 {
        return;
    }
    let revision = policy.revision;
    *slot = Some(WatchSession {
        revision: revision.clone(),
        _watcher: watcher,
    });
    let worker = app.clone();
    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut events = vec![first];
            let deadline = Instant::now() + Duration::from_millis(400);
            while events.len() < 512 {
                let wait = deadline.saturating_duration_since(Instant::now());
                if wait.is_zero() {
                    break;
                }
                match rx.recv_timeout(wait) {
                    Ok(event) => events.push(event),
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
            let rescan = overflow.swap(false, Ordering::AcqRel);
            if let Err(error) = apply_events(&worker, &revision, events, rescan) {
                if let Ok(mut warning) = worker.state::<UmariIndex>().watch_error.lock() {
                    *warning = Some(error);
                }
            }
        }
    });
}

fn apply_events(
    app: &AppHandle,
    revision: &str,
    events: Vec<Event>,
    overflow: bool,
) -> Result<(), String> {
    let state = app.state::<UmariIndex>();
    let guard = state
        .writer
        .lock()
        .map_err(|_| "The index is unavailable.")?;
    let epoch = state.epoch.load(Ordering::Acquire);
    let policy = policy(app)?;
    if policy.revision != revision || !policy.ready() {
        return Ok(());
    }
    let mut paths = BTreeSet::new();
    let mut has_folder = overflow;
    for event in events {
        has_folder |= matches!(
            event.kind,
            EventKind::Remove(notify::event::RemoveKind::Folder)
        );
        let moves_tree = matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(notify::event::ModifyKind::Name(_))
        );
        for path in event.paths {
            // The watcher already uses canonical roots. Use the original path
            // for deletion so removed entries retain their exact index keys.
            if policy.mode_for(&path).is_none() {
                continue;
            }
            if fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.is_dir()) {
                has_folder |= moves_tree;
                continue;
            }
            paths.insert(path);
        }
    }
    let index = state.index.as_ref().ok_or("The index is unavailable.")?;
    if has_folder
        || index.count().saturating_add(paths.len() as u64)
            > (MAX_FILES * policy.folders.len() + 1024) as u64
    {
        drop(guard);
        return rebuild_locked(app, true).map(|_| ());
    }
    let updates: Vec<_> = paths
        .into_iter()
        .map(|path| {
            let mode = path
                .canonicalize()
                .ok()
                .filter(|canonical| canonical == &path)
                .and_then(|canonical| policy.mode_for(&canonical));
            (path, mode)
        })
        .collect();
    index.update_scoped(&updates, || state.epoch.load(Ordering::Acquire) != epoch)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_private_paths_and_stale_index_generations() {
        let root = std::env::temp_dir().join("approved-umari-project");
        let mut policy = Policy {
            revision: "current".into(),
            indexed_revision: Some("old".into()),
            folders: vec![Folder { path: root.clone(), include_contents: false }],
            ..Policy::default()
        };
        assert!(!policy.ready());
        policy.indexed_revision = Some("current".into());
        assert!(policy.ready());
        assert_eq!(policy.mode_for(&root.join("src/main.rs")), Some(false));
        assert_eq!(policy.mode_for(&root.join(".private/data.txt")), None);
        assert_eq!(policy.mode_for(&root.join("nested/secrets.yml")), None);
        assert_eq!(policy.mode_for(&root.with_file_name("outside.txt")), None);
    }
}
