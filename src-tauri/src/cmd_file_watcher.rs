// =============================================================================
// DEX 6.0 — File Watcher native commands (Tauri port of
// src/main/core/FileWatcherManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Native (AppHandle-backed) implementations of the two `file-watcher:*`
//! channels that the pure-DB `file_watcher` module cannot serve because they
//! reach outside SQLite:
//!   - `file-watcher:addFolder` opens the native OS directory picker, then
//!     persists the chosen folder into `watched_folders` and returns the row.
//!   - `file-watcher:importFile` stats the source file on disk (`fs.statSync`),
//!     detects its media type, and inserts a `media_library` row.
//!
//! These live here (with the Tauri `AppHandle`) rather than in `file_watcher.rs`
//! (pure `dispatch(conn, ...)`) for the same reason `native_ops` exists: they
//! need the OS dialog and the filesystem. The DB schema, column order, and
//! return shapes match `file_watcher.rs` (WatchedFolder) and
//! `shared_media_library.rs` (MediaRecord) exactly.
//!
//! DEFERRED — LIVE WATCHING: the Electron manager also runs a live `fs.watch`
//! over each configured folder, auto-importing / notifying on new media files
//! (`file-watcher:newFile`). That live filesystem watching is intentionally NOT
//! ported here: it needs a renderer event bridge (to push `file-watcher:newFile`
//! back to the UI), which the current tauriCompat layer no-ops. Only the config
//! insert (`addFolder`) and the on-demand `importFile` are in scope.

use crate::util::LockSafe;
use notify::{event::ModifyKind, EventKind, RecursiveMode, Watcher};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

use crate::native_ops::{detect_media_type, fp_to_string, now_ms, with_conn};

/// Live filesystem watchers, keyed by `watched_folders.id`. A `notify` watcher
/// stops when dropped, so removing the entry tears the watch down. Registered as
/// Tauri-managed state in `setup()`.
pub type FileWatchState = Mutex<HashMap<i64, notify::RecommendedWatcher>>;

/// Map an extension (with leading dot) to a media type, mirroring the Electron
/// `FileWatcherManager.getMediaType` sets exactly (video/audio/image, else None).
fn get_media_type(ext: &str) -> Option<&'static str> {
    const VIDEO: &[&str] = &[".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv"];
    const AUDIO: &[&str] = &[".mp3", ".wav", ".flac", ".ogg", ".aac", ".opus", ".m4a"];
    const IMAGE: &[&str] = &[".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".tiff"];
    let lower = ext.to_lowercase();
    if VIDEO.contains(&lower.as_str()) {
        return Some("video");
    }
    if AUDIO.contains(&lower.as_str()) {
        return Some("audio");
    }
    if IMAGE.contains(&lower.as_str()) {
        return Some("image");
    }
    None
}

fn ext_with_dot(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default()
}

/// `matchesFilter` parity: "all" matches everything; otherwise the file must be a
/// known media type present in the comma-separated filter list.
fn matches_filter(filename: &str, filter_str: &str) -> bool {
    if filter_str == "all" {
        return true;
    }
    let media_type = match get_media_type(&ext_with_dot(filename)) {
        Some(t) => t,
        None => return false,
    };
    filter_str
        .split(',')
        .map(|f| f.trim().to_lowercase())
        .any(|f| f == media_type || f == "all")
}

/// `handleNewFile` parity: when a matching media file appears, either auto-import
/// it into `media_library` or push a `file-watcher:newFile` event to the renderer.
fn handle_new_file(
    app: &tauri::AppHandle,
    folder_id: i64,
    file_types: &str,
    import_behavior: &str,
    path: &Path,
) {
    if !path.is_file() {
        return; // deletes / directories / vanished temp files
    }
    let filename = match path.file_name() {
        Some(n) => n.to_string_lossy().to_string(),
        None => return,
    };
    if !matches_filter(&filename, file_types) {
        return;
    }
    let filepath = path.to_string_lossy().to_string();

    if import_behavior == "auto-import" {
        // Mirror the Electron auto-import INSERT (8 explicit columns, type =
        // getMediaType||'file', dedupe on filepath).
        let media_type = get_media_type(&ext_with_dot(&filename)).unwrap_or("file");
        let size = std::fs::metadata(&filepath).map(|m| m.len() as i64).unwrap_or(0);
        let now = now_ms();
        with_conn(app, |conn| {
            let _ = conn.execute(
                "INSERT INTO media_library (filepath, filename, type, size, imported_by, last_used, use_count, timestamp)
                 VALUES (?, ?, ?, ?, 'file-watcher', ?, 1, ?)
                 ON CONFLICT(filepath) DO NOTHING",
                params![filepath, filename, media_type, size, now, now],
            );
            Value::Null
        });
    } else {
        crate::native_ops::emit_event(
            app,
            "file-watcher:newFile",
            &json!({ "folderId": folder_id, "filepath": filepath, "filename": filename }),
        );
    }
}

/// Start a live watcher for one configured folder (idempotent per folder id).
/// New/renamed files in the folder run through `handle_new_file`.
fn start_watch(
    app: &tauri::AppHandle,
    folder_id: i64,
    folder_path: String,
    file_types: String,
    import_behavior: String,
) {
    if !Path::new(&folder_path).exists() {
        return;
    }
    let state = app.state::<FileWatchState>();
    let mut map = state.lock_safe();
    if map.contains_key(&folder_id) {
        return; // already watching
    }
    let app_handle = app.clone();
    let watch_path = folder_path.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            // fs.watch fired on 'rename' (create/delete); notify's create + name
            // events are the equivalent. handle_new_file's is_file() guard drops
            // the delete half, matching the Electron existsSync check.
            if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(ModifyKind::Name(_))) {
                for p in &event.paths {
                    handle_new_file(&app_handle, folder_id, &file_types, &import_behavior, p);
                }
            }
        }
    });
    if let Ok(mut w) = watcher {
        if w.watch(Path::new(&watch_path), RecursiveMode::NonRecursive).is_ok() {
            map.insert(folder_id, w);
        }
    }
}

/// Stop and drop the live watcher for a folder id (no-op if none).
fn stop_watch(app: &tauri::AppHandle, folder_id: i64) {
    let state = app.state::<FileWatchState>();
    let mut map = state.lock_safe();
    map.remove(&folder_id);
}

/// Start watchers for every persisted folder. Called once in `setup()` after the
/// shared db is open and schemas are ensured (mirrors `startWatching()` on boot).
pub fn start_all(app: tauri::AppHandle) {
    let folders: Vec<(i64, String, String, String)> = {
        let state = app.state::<crate::db::DbState>();
        let guard = state.lock_safe();
        let conn = match guard.as_ref() {
            Some(c) => c,
            None => return,
        };
        let mut stmt = match conn
            .prepare("SELECT id, folder_path, file_types, import_behavior FROM watched_folders")
        {
            Ok(s) => s,
            Err(_) => return,
        };
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        });
        match rows {
            Ok(rs) => rs.filter_map(|r| r.ok()).collect(),
            Err(_) => return,
        }
    };
    for (id, path, types, behavior) in folders {
        start_watch(&app, id, path, types, behavior);
    }
}

/// Read one watched_folders row by folder_path into the WatchedFolder shape.
/// Column order / casing matches `file_watcher.rs::row_to_json` (SELECT *).
fn folder_row(conn: &Connection, folder_path: &str) -> Value {
    conn.query_row(
        "SELECT id, folder_path, file_types, import_behavior, created_at
         FROM watched_folders WHERE folder_path = ?",
        params![folder_path],
        |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "folder_path": r.get::<_, String>(1)?,
                "file_types": r.get::<_, String>(2)?,
                "import_behavior": r.get::<_, String>(3)?,
                "created_at": r.get::<_, i64>(4)?,
            }))
        },
    )
    .unwrap_or(Value::Null)
}

/// Read one media_library row by id into the MediaRecord shape. Column order /
/// casing matches `shared_media_library.rs::row_to_json` (SELECT *).
fn media_row(conn: &Connection, id: i64) -> Value {
    conn.query_row(
        "SELECT id, filepath, filename, type, size, duration, width, height, imported_by, last_used, use_count, thumbnail, timestamp
         FROM media_library WHERE id = ?",
        params![id],
        |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "filepath": r.get::<_, String>(1)?,
                "filename": r.get::<_, String>(2)?,
                "type": r.get::<_, String>(3)?,
                "size": r.get::<_, i64>(4)?,
                "duration": r.get::<_, Option<i64>>(5)?,
                "width": r.get::<_, Option<i64>>(6)?,
                "height": r.get::<_, Option<i64>>(7)?,
                "imported_by": r.get::<_, String>(8)?,
                "last_used": r.get::<_, i64>(9)?,
                "use_count": r.get::<_, i64>(10)?,
                "thumbnail": r.get::<_, Option<String>>(11)?,
                "timestamp": r.get::<_, i64>(12)?,
            }))
        },
    )
    .unwrap_or(Value::Null)
}

/// `file-watcher:addFolder` — addWatchedFolder(importBehavior?, fileTypes?).
/// Opens the native directory picker (there is no path argument, mirroring
/// `dialog.showOpenDialog({ properties: ['openDirectory'] })`); on cancel returns
/// null. Otherwise upserts the chosen folder into `watched_folders` honoring the
/// UNIQUE(folder_path) constraint (insert, else update behaviour/types — matching
/// the TS `ON CONFLICT(folder_path) DO UPDATE`) and returns the WatchedFolder row.
///
/// The Electron `addFolder` also starts a live `fs.watch` for the folder; that
/// live watching is deferred (needs a renderer event bridge), so only the
/// persisted config + returned row are ported.
fn add_folder(app: &tauri::AppHandle, args: &Value) -> Value {
    // ipcMain.handle('file-watcher:addFolder', (_e, importBehavior?, fileTypes?))
    let import_behavior = args
        .get(0)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("notify-only")
        .to_string();
    let file_types = args
        .get(1)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("all")
        .to_string();

    // Native "Select Folder to Watch" directory picker.
    let folder_path = match app
        .dialog()
        .file()
        .set_title("Select Folder to Watch")
        .blocking_pick_folder()
        .and_then(fp_to_string)
    {
        Some(p) => p,
        None => return Value::Null, // canceled / no selection
    };

    let row = with_conn(app, |conn| {
        // Mirror the TS upsert: insert the new folder, or on a UNIQUE(folder_path)
        // conflict update its file_types + import_behavior (created_at unchanged).
        let res = conn.execute(
            "INSERT INTO watched_folders (folder_path, file_types, import_behavior, created_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(folder_path) DO UPDATE SET file_types = excluded.file_types, import_behavior = excluded.import_behavior",
            params![folder_path, file_types, import_behavior, now_ms()],
        );
        if res.is_err() {
            return Value::Null;
        }
        folder_row(conn, &folder_path)
    });

    // Start the live watcher for the freshly configured folder (matches the TS
    // addFolder, which calls watchFolder after the upsert). Restart it if the
    // folder was re-added with a changed behavior/filter.
    if let Some(id) = row.get("id").and_then(|v| v.as_i64()) {
        let types = row.get("file_types").and_then(|v| v.as_str()).unwrap_or("all").to_string();
        let behavior = row
            .get("import_behavior")
            .and_then(|v| v.as_str())
            .unwrap_or("notify-only")
            .to_string();
        let fp = row.get("folder_path").and_then(|v| v.as_str()).unwrap_or(&folder_path).to_string();
        stop_watch(app, id);
        start_watch(app, id, fp, types, behavior);
    }
    row
}

/// `file-watcher:importFile` — importFile(filepath, filename). Stats the file on
/// disk for its size, detects its media type from the extension, and inserts a
/// `media_library` row (imported_by = 'file-watcher', use_count = 1, nullable
/// metadata). Dedupe by the UNIQUE(filepath) constraint (the TS uses
/// `ON CONFLICT(filepath) DO NOTHING`). Returns the inserted (or existing)
/// MediaRecord row; returns null when the source file is missing.
fn import_file(app: &tauri::AppHandle, args: &Value) -> Value {
    // ipcMain.handle('file-watcher:importFile', (_e, filepath, filename))
    let filepath = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let filename_arg = args.get(1).and_then(|v| v.as_str()).map(String::from);

    // fs.statSync throws (and the TS try/catch swallows) when the file is gone.
    let meta = match std::fs::metadata(&filepath) {
        Ok(m) => m,
        Err(_) => return Value::Null,
    };
    let size = meta.len() as i64;

    // Prefer the caller-supplied filename (the TS passes it through); fall back to
    // the basename of the path.
    let filename = filename_arg.filter(|s| !s.is_empty()).unwrap_or_else(|| {
        std::path::Path::new(&filepath)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    });
    let typ = detect_media_type(&filepath);

    with_conn(app, |conn| {
        // Dedupe by filepath (ON CONFLICT(filepath) DO NOTHING in the TS): if the
        // row already exists, return it rather than fabricating a new insert.
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM media_library WHERE filepath = ?",
                params![filepath],
                |r| r.get(0),
            )
            .ok();
        if let Some(id) = existing {
            return media_row(conn, id);
        }

        let now = now_ms();
        let inserted = conn.execute(
            "INSERT INTO media_library (filepath, filename, type, size, duration, width, height, imported_by, last_used, use_count, thumbnail, timestamp)
             VALUES (?, ?, ?, ?, NULL, NULL, NULL, 'file-watcher', ?, 1, NULL, ?)",
            params![filepath, filename, typ, size, now, now],
        );
        if inserted.is_err() {
            return Value::Null;
        }
        media_row(conn, conn.last_insert_rowid())
    })
}

/// Native dispatcher for the two filesystem/dialog-backed `file-watcher:*`
/// channels. The pure-DB channels (`getFolders`, `removeFolder`) stay in
/// `file_watcher::dispatch(conn, ...)`; only the channels that need the OS dialog
/// or the filesystem are routed here.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "file-watcher:addFolder" => add_folder(app, args),
        "file-watcher:importFile" => import_file(app, args),
        // removeWatchedFolder(id) -> boolean. Routed here (not the pure-DB
        // file_watcher module) so the live watcher is torn down alongside the
        // persisted DELETE — the side effect the TS removeWatchedFolder performs.
        "file-watcher:removeFolder" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            stop_watch(app, id);
            with_conn(app, |conn| {
                let _ = conn.execute("DELETE FROM watched_folders WHERE id = ?", params![id]);
                Value::Bool(true)
            })
        }
        _ => Value::Null,
    }
}
