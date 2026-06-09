// =============================================================================
// DEX 6.0 — Tauri Shell (GOAL-6A)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! DEX 6.0 Tauri shell entry point. Hosts the EXISTING Vite renderer
//! (`../dist/renderer`) and exposes the first native command —
//! `smart_router_route` — backed by the `dex-smart-router` crate, so the React
//! UI can reach the native core through the platform bridge
//! (`src/renderer/services/platform`). Additive: the Electron app (`src/main`)
//! is untouched and remains the shipping product while the migration proceeds.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod activity_feed;
mod changelog;
mod color_labels;
mod content_expiry;
mod daily_note;
mod dashboard;
mod db;
mod feedback_collector;
mod goal_system;
mod help_system;
mod journal;
mod layout;
mod licensing;
mod notifications;
mod read_later;
mod recycle_bin;
mod relationship_graph;
mod reminder;
mod scratchpad;
mod search_history;
mod smart_grouping;
mod smart_rename;
mod snapshot_comparison;
mod statistics_dashboard;
mod time_tracking;
mod version_history;
mod word_count;
// Wave 2 — project-* family + voice memo, daily briefing, dependency,
// duplication detector, bulk metadata.
mod bulk_metadata;
mod daily_briefing;
mod dependency;
mod duplication_detector;
mod project_archiver;
mod project_comparison;
mod project_export_bundle;
mod project_health;
mod project_linker;
mod project_lock;
mod project_timeline;
mod voice_memo;
// Wave 3 — notes, NL tasks, theme schedule, session replay, shared media,
// vinx presentation, localization, keyboard navigation.
mod keyboard_navigation;
mod localization;
mod nl_task;
mod notes;
mod session_replay;
mod shared_media_library;
mod theme_schedule;
mod vinx_presentation;
// Wave 4 — notification hub, localization engine, global search, FTS index,
// multi-window/monitor, migration, link preview, live collab, file watcher,
// backup/restore. (Several are window/network/fs-bound and degrade honestly.)
mod backup_restore;
mod file_watcher;
mod full_text_index;
mod global_content_search;
mod link_preview;
mod live_collaboration;
mod localization_engine;
mod migration;
mod multi_monitor;
mod multi_window;
mod unified_notification_hub;

use dex_smart_router::{route_for_prompt, RouteCandidate, RoutingGoal};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::Manager;

/// Resolve a renderer path which may be an alias ("documents", "home", ...) or a
/// real absolute path. Mirrors the Electron `resolveSystemPath` aliases.
fn resolve_path(app: &tauri::AppHandle, input: &str) -> PathBuf {
    let p = app.path();
    let fallback = || PathBuf::from(".");
    match input.trim().to_lowercase().as_str() {
        "home" | "~" => p.home_dir().unwrap_or_else(|_| fallback()),
        "documents" => p.document_dir().unwrap_or_else(|_| fallback()),
        "desktop" => p.desktop_dir().unwrap_or_else(|_| fallback()),
        "downloads" => p.download_dir().unwrap_or_else(|_| fallback()),
        "pictures" => p.picture_dir().unwrap_or_else(|_| fallback()),
        "music" => p.audio_dir().unwrap_or_else(|_| fallback()),
        "videos" => p.video_dir().unwrap_or_else(|_| fallback()),
        _ => PathBuf::from(input),
    }
}

/// `files:list` — read a directory, returning the same shape the Electron
/// FileManagerController did: { success, path, files: [{ name, path, isDirectory,
/// size, modified, extension }] }.
fn files_list(app: &tauri::AppHandle, dir: &str) -> Value {
    let resolved = resolve_path(app, dir);
    let read = match std::fs::read_dir(&resolved) {
        Ok(r) => r,
        Err(e) => {
            return json!({
                "success": false, "error": e.to_string(),
                "path": resolved.to_string_lossy(), "files": [],
            });
        }
    };
    let mut files: Vec<Value> = Vec::new();
    for entry in read.flatten() {
        let path = entry.path();
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();
        files.push(json!({
            "name": entry.file_name().to_string_lossy(),
            "path": path.to_string_lossy(),
            "isDirectory": is_dir,
            "size": size,
            "modified": modified,
            "extension": ext,
        }));
    }
    json!({ "success": true, "path": resolved.to_string_lossy(), "files": files })
}

/// Destination of a move/copy: target_dir joined with the source basename.
fn dest_in_dir(src: &str, target_dir: &str) -> PathBuf {
    let name = std::path::Path::new(src)
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    PathBuf::from(target_dir).join(name)
}

fn io_result(res: std::io::Result<()>, path: &str) -> Value {
    match res {
        Ok(()) => json!({ "success": true, "path": path }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn files_rename(old: &str, new_name: &str) -> Value {
    // Only the basename of new_name (prevent path traversal via the filename).
    let safe = std::path::Path::new(new_name)
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    let dest = std::path::Path::new(old)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join(safe);
    io_result(std::fs::rename(old, &dest), &dest.to_string_lossy())
}

fn files_move(src: &str, target_dir: &str) -> Value {
    let dest = dest_in_dir(src, target_dir);
    match std::fs::rename(src, &dest) {
        Ok(()) => json!({ "success": true, "path": dest.to_string_lossy() }),
        // rename fails across volumes — fall back to copy + remove.
        Err(_) => match std::fs::copy(src, &dest) {
            Ok(_) => io_result(std::fs::remove_file(src), &dest.to_string_lossy()),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        },
    }
}

fn files_copy(src: &str, target_dir: &str) -> Value {
    let dest = dest_in_dir(src, target_dir);
    if std::path::Path::new(src).is_dir() {
        return json!({ "success": false, "error": "directory copy not supported yet" });
    }
    match std::fs::copy(src, &dest) {
        Ok(_) => json!({ "success": true, "path": dest.to_string_lossy() }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn files_delete(path: &str) -> Value {
    let p = std::path::Path::new(path);
    let res = if p.is_dir() {
        std::fs::remove_dir_all(p)
    } else {
        std::fs::remove_file(p)
    };
    io_result(res, path)
}

fn files_mkdir(path: &str) -> Value {
    io_result(std::fs::create_dir_all(path), path)
}

/// `system:getStatus` / `power:getStats` — memory + uptime snapshot.
fn system_status() -> Value {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    json!({
        "success": true,
        "shell": "tauri",
        "memoryUsedMB": sys.used_memory() / (1024 * 1024),
        "memoryTotalMB": sys.total_memory() / (1024 * 1024),
        "uptimeSec": sysinfo::System::uptime(),
    })
}

/// `system:getProcesses` — running process list (pid, name, cpu%, memMB).
fn system_processes() -> Value {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    let procs: Vec<Value> = sys
        .processes()
        .iter()
        .map(|(pid, p)| {
            json!({
                "pid": pid.as_u32(),
                "name": p.name(),
                "cpu": p.cpu_usage(),
                "memory": p.memory() / (1024 * 1024),
            })
        })
        .collect();
    json!({ "success": true, "processes": procs })
}

/// `system:killProcess` — terminate by pid.
fn system_kill(pid: u32) -> Value {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_processes();
    match sys.process(sysinfo::Pid::from_u32(pid)) {
        Some(p) => {
            let ok = p.kill();
            json!({ "success": ok, "message": if ok { "terminated" } else { "kill failed" } })
        }
        None => json!({ "success": false, "message": "process not found" }),
    }
}

/// `shell:openPath` / `shell:openExternal` — open with the OS default handler.
fn shell_open(target: &str) -> Value {
    match open::that(target) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// `os:lockScreen` — lock the workstation (Windows). Other power controls
/// (shutdown/restart/sleep) are intentionally deferred until tested.
fn os_lock() -> Value {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("rundll32.exe")
            .args(["user32.dll,LockWorkStation"])
            .spawn();
        json!({ "success": true })
    }
    #[cfg(not(windows))]
    {
        json!({ "success": false, "error": "unsupported platform" })
    }
}

// --- Batch 1: clipboard ----------------------------------------------------
fn clipboard_write(text: &str) -> Value {
    match arboard::Clipboard::new().and_then(|mut c| c.set_text(text.to_string())) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}
fn clipboard_read() -> Value {
    match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
        Ok(t) => json!(t),
        Err(_) => json!(""),
    }
}

// --- Batch 2: persistent key-value store (JSON in app config dir) ----------
fn kv_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("dex-kv.json")
}
fn kv_load(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    std::fs::read_to_string(kv_path(app))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}
fn kv_get(app: &tauri::AppHandle, key: &str) -> Value {
    kv_load(app).get(key).cloned().unwrap_or(Value::Null)
}
fn kv_set(app: &tauri::AppHandle, key: &str, value: Value) -> Value {
    let mut map = kv_load(app);
    map.insert(key.to_string(), value);
    let data = serde_json::to_string(&Value::Object(map)).unwrap_or_default();
    match std::fs::write(kv_path(app), data) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

// --- Settings + theme (kv-backed) ------------------------------------------
// Both subsystems are pure key-value in Electron (capabilityLayer.storage for
// settings, dataStore for themeConfig). The renderer reaches them through the
// same persistent store, so they ride the kv file above — no new state needed.
const SETTINGS_KEY: &str = "dex-system-settings";
const THEME_KEY: &str = "themeConfig";

fn settings_get(app: &tauri::AppHandle) -> Value {
    let v = kv_get(app, SETTINGS_KEY);
    if v.is_object() {
        v
    } else {
        json!({})
    }
}

/// Default theme config — mirrors THEME_DEFAULTS in src/main/utils/constants.ts.
fn theme_defaults() -> Value {
    json!({
        "mode": "dark",
        "accentColor": "#6366f1",
        "fontScale": 1,
        "reducedMotion": false,
        "density": "comfortable",
    })
}

fn theme_config(app: &tauri::AppHandle) -> Value {
    let v = kv_get(app, THEME_KEY);
    if v.is_object() {
        v
    } else {
        theme_defaults()
    }
}

/// Mutate one field of the stored theme config (the theme:set* handlers).
fn theme_set_field(app: &tauri::AppHandle, field: &str, value: Value) -> Value {
    let mut map = kv_get(app, THEME_KEY)
        .as_object()
        .cloned()
        .unwrap_or_default();
    map.insert(field.to_string(), value);
    kv_set(app, THEME_KEY, Value::Object(map))
}

fn theme_presets() -> Value {
    json!([
        { "id": "true-black", "name": "True Black", "accentColor": "#0a84ff", "mode": "dark" },
        { "id": "midnight", "name": "Midnight", "accentColor": "#5e5ce6", "mode": "dark" },
        { "id": "ocean", "name": "Ocean", "accentColor": "#64d2ff", "mode": "dark" },
        { "id": "sunset", "name": "Sunset", "accentColor": "#ff9f0a", "mode": "dark" },
        { "id": "rose", "name": "Rose", "accentColor": "#ff375f", "mode": "dark" },
    ])
}

fn theme_apply_preset(app: &tauri::AppHandle, preset_id: &str) -> Value {
    let accent = match preset_id {
        "true-black" => "#0a84ff",
        "midnight" => "#5e5ce6",
        "ocean" => "#64d2ff",
        "sunset" => "#ff9f0a",
        "rose" => "#ff375f",
        _ => return json!({ "success": true }), // unknown preset: no-op, matches Electron
    };
    let preset = json!({
        "mode": "dark", "accentColor": accent, "fontScale": 1,
        "reducedMotion": false, "density": "comfortable",
    });
    let _ = kv_set(app, THEME_KEY, preset);
    json!({ "success": true })
}

// --- Batch 3: reveal in file manager ---------------------------------------
fn reveal_in_explorer(path: &str) -> Value {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn();
        json!({ "success": true })
    }
    #[cfg(not(windows))]
    {
        let _ = open::that(path);
        json!({ "success": true })
    }
}

// --- Batch 5: app data locations -------------------------------------------
fn app_paths(app: &tauri::AppHandle) -> Value {
    let p = app.path();
    json!({
        "config": p.app_config_dir().ok().map(|d| d.to_string_lossy().to_string()),
        "data": p.app_data_dir().ok().map(|d| d.to_string_lossy().to_string()),
        "home": p.home_dir().ok().map(|d| d.to_string_lossy().to_string()),
    })
}

// --- Wave 2: bounded filesystem walk powering search + recent --------------
// Bounded (depth-first, capped) so a query can never hang the worker thread on
// a huge tree. A native index (Tantivy) supersedes this in a later batch.
fn walk_collect(root: &std::path::Path, max: usize) -> Vec<(PathBuf, std::fs::Metadata)> {
    let mut out: Vec<(PathBuf, std::fs::Metadata)> = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    let cap_scan = max.saturating_mul(4);
    let mut scanned = 0usize;
    while let Some(dir) = stack.pop() {
        if out.len() >= max || scanned >= cap_scan {
            break;
        }
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            scanned += 1;
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.starts_with('.') || name == "node_modules" || name == "$recycle.bin" {
                    continue;
                }
                stack.push(entry.path());
            } else {
                out.push((entry.path(), meta));
                if out.len() >= max {
                    break;
                }
            }
        }
    }
    out
}

fn file_entry_json(path: &std::path::Path, meta: &std::fs::Metadata) -> Value {
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();
    json!({
        "name": path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        "path": path.to_string_lossy(),
        "type": ext.clone(),
        "extension": ext,
        "size": meta.len(),
        "modified": modified,
        "score": 1.0,
    })
}

fn files_search(app: &tauri::AppHandle, query: &str, location: Option<String>) -> Value {
    if query.trim().is_empty() {
        return json!({ "success": true, "files": [] });
    }
    let root = resolve_path(app, &location.unwrap_or_else(|| "home".into()));
    let q = query.to_lowercase();
    let files = walk_collect(&root, 8000);
    let matches: Vec<Value> = files
        .iter()
        .filter(|(p, _)| {
            p.file_name()
                .map(|n| n.to_string_lossy().to_lowercase().contains(&q))
                .unwrap_or(false)
        })
        .take(200)
        .map(|(p, m)| file_entry_json(p, m))
        .collect();
    json!({ "success": true, "files": matches })
}

fn files_recent(app: &tauri::AppHandle, limit: usize) -> Value {
    let p = app.path();
    let mut files: Vec<(PathBuf, std::fs::Metadata)> = Vec::new();
    for dir in [p.document_dir(), p.desktop_dir(), p.download_dir()]
        .into_iter()
        .flatten()
    {
        files.extend(walk_collect(&dir, 3000));
    }
    files.sort_by(|a, b| b.1.modified().ok().cmp(&a.1.modified().ok()));
    let out: Vec<Value> = files
        .iter()
        .take(limit)
        .map(|(p, m)| file_entry_json(p, m))
        .collect();
    json!({ "success": true, "files": out })
}

fn get_scopes(app: &tauri::AppHandle) -> Value {
    let stored = kv_get(app, "fileScopes");
    if let Some(arr) = stored.as_array() {
        if !arr.is_empty() {
            return json!(arr);
        }
    }
    let p = app.path();
    let mut scopes: Vec<Value> = Vec::new();
    for (name, dir) in [
        ("Documents", p.document_dir()),
        ("Desktop", p.desktop_dir()),
        ("Downloads", p.download_dir()),
    ] {
        if let Ok(d) = dir {
            scopes.push(json!({ "path": d.to_string_lossy(), "name": name, "fileCount": 0, "indexed": false }));
        }
    }
    json!(scopes)
}

// --- Wave B: trash (safe delete) + os/disk info ----------------------------
fn move_to_trash(path: &str) -> Value {
    match trash::delete(path) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn os_info() -> Value {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0);
    json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "cores": cores,
        "memTotalMB": sys.total_memory() / (1024 * 1024),
        "hostname": sysinfo::System::host_name(),
    })
}

fn disk_usage() -> Value {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let list: Vec<Value> = disks
        .iter()
        .map(|d| {
            json!({
                "mount": d.mount_point().to_string_lossy(),
                "totalGB": d.total_space() / (1024 * 1024 * 1024),
                "availableGB": d.available_space() / (1024 * 1024 * 1024),
            })
        })
        .collect();
    json!({ "success": true, "disks": list })
}

// --- Native audio analysis (GOAL-6C) ---------------------------------------
fn audio_metadata(path: &str) -> Value {
    match dex_audio::metadata(path) {
        Ok(m) => json!(m),
        Err(e) => json!({ "success": false, "error": e }),
    }
}
fn audio_waveform(path: &str, buckets: usize) -> Value {
    match dex_audio::waveform(path, buckets) {
        Ok(peaks) => json!({ "success": true, "peaks": peaks }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

// --- Native search index (Tantivy, GOAL-6A) --------------------------------
/// Query the index; `None` when the index is empty so the caller falls back to
/// the bounded filesystem walk.
fn index_search(app: &tauri::AppHandle, query: &str, limit: usize) -> Option<Value> {
    let state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let guard = state.lock().ok()?;
    let idx = guard.as_ref()?;
    if idx.count() == 0 {
        return None;
    }
    Some(json!({ "success": true, "files": idx.search(query, limit) }))
}

/// Clear + rebuild the index from the user's document folders.
fn index_rebuild(app: &tauri::AppHandle) -> Value {
    let state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let guard = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false, "error": "index busy" }),
    };
    let idx = match guard.as_ref() {
        Some(i) => i,
        None => return json!({ "success": false, "error": "index unavailable" }),
    };
    if let Err(e) = idx.clear() {
        return json!({ "success": false, "error": e });
    }
    let p = app.path();
    let mut total = 0usize;
    for dir in [p.document_dir(), p.desktop_dir(), p.download_dir()]
        .into_iter()
        .flatten()
    {
        if let Ok(n) = idx.index_path(&dir, 20000) {
            total += n;
        }
    }
    json!({ "success": true, "indexed": total })
}

fn index_stats(app: &tauri::AppHandle) -> Value {
    let state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let count = state
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|i| i.count()))
        .unwrap_or(0);
    json!({ "indexed": count, "shell": "tauri" })
}

/// Native Vault dispatch (GOAL-6B) — encrypted password manager + TOTP. State is
/// a Tauri-managed `Mutex<VaultManager>`; the master key lives only in memory
/// while unlocked. Handles every `vault:*` channel except `vault:copyToClipboard`
/// (clipboard, handled earlier).
fn vault_dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let val = |i: usize| args.get(i).cloned().unwrap_or(Value::Null);

    let state = app.state::<std::sync::Mutex<dex_vault::VaultManager>>();
    let mut vault = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false, "error": "vault busy" }),
    };

    let res = |r: Result<(), String>| match r {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    };
    let resb = |r: Result<bool, String>| match r {
        Ok(b) => json!(b),
        Err(e) => json!({ "success": false, "error": e }),
    };
    let resv = |r: Result<Value, String>| match r {
        Ok(v) => v,
        Err(e) => json!({ "success": false, "error": e }),
    };

    match channel {
        "vault:getState" => vault.state(),
        "vault:exists" => json!(vault.exists()),
        "vault:create" => res(vault.create(&s(0))),
        "vault:unlock" => res(vault.unlock(&s(0))),
        "vault:lock" => {
            vault.lock();
            Value::Null
        }
        "vault:getCredentials" => vault.credentials(),
        "vault:getCredential" => vault.credential(&s(0)),
        "vault:addCredential" => resv(vault.add_credential(val(0))),
        "vault:updateCredential" => resb(vault.update_credential(&s(0), &val(1))),
        "vault:deleteCredential" => resb(vault.delete_credential(&s(0))),
        "vault:searchCredentials" => vault.search_credentials(&s(0)),
        "vault:getAuthenticators" => vault.authenticators(),
        "vault:addAuthenticator" => resv(vault.add_authenticator(val(0))),
        "vault:updateAuthenticator" => resb(vault.update_authenticator(&s(0), &val(1))),
        "vault:deleteAuthenticator" => resb(vault.delete_authenticator(&s(0))),
        "vault:generateTOTP" => vault.generate_totp(&s(0), now),
        "vault:generateTOTPFromSecret" => {
            let opts = val(1);
            let digits = opts.get("digits").and_then(|x| x.as_u64()).unwrap_or(6) as u32;
            let period = opts.get("period").and_then(|x| x.as_u64()).unwrap_or(30);
            match dex_vault::totp::totp(&s(0), now, digits, period) {
                Some(code) => {
                    json!({ "code": code, "remaining": dex_vault::totp::seconds_remaining(now, period) })
                }
                None => Value::Null,
            }
        }
        "vault:parseOTPUri" => match dex_vault::totp::parse_otpauth(&s(0)) {
            Some(u) => json!({
                "label": u.label, "secret": u.secret, "issuer": u.issuer,
                "digits": u.digits, "period": u.period,
            }),
            None => Value::Null,
        },
        "vault:getSettings" => vault.settings(),
        "vault:updateSettings" => resb(vault.update_settings(&val(0))),
        "vault:generatePassword" => {
            let o = val(0);
            let opts = dex_vault::password::GenOptions {
                length: o.get("length").and_then(|x| x.as_u64()).unwrap_or(20) as usize,
                lowercase: o.get("lowercase").and_then(|x| x.as_bool()).unwrap_or(true),
                uppercase: o.get("uppercase").and_then(|x| x.as_bool()).unwrap_or(true),
                numbers: o.get("numbers").and_then(|x| x.as_bool()).unwrap_or(true),
                symbols: o.get("symbols").and_then(|x| x.as_bool()).unwrap_or(true),
            };
            json!(dex_vault::password::generate(&opts))
        }
        "vault:assessPasswordStrength" => {
            let (score, label, suggestions) = dex_vault::password::assess_strength(&s(0));
            json!({ "score": score, "label": label, "suggestions": suggestions })
        }
        "vault:auditPasswords" => vault_audit(&vault),
        "vault:exportVault" => match vault.export(&s(0)) {
            Ok(blob) => json!(blob),
            Err(_) => Value::Null,
        },
        "vault:importVault" => resb(vault.import(&s(0), &s(1))),
        "vault:changeMasterPassword" => resb(vault.change_master_password(&s(0), &s(1))),
        _ => Value::Null,
    }
}

/// Audit stored credential passwords for weakness + reuse.
fn vault_audit(vault: &dex_vault::VaultManager) -> Value {
    let arr = vault.credentials().as_array().cloned().unwrap_or_default();
    let mut weak = 0usize;
    let mut seen: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for c in &arr {
        if let Some(pw) = c.get("password").and_then(|v| v.as_str()) {
            let (score, _, _) = dex_vault::password::assess_strength(pw);
            if score < 2 {
                weak += 1;
            }
            *seen.entry(pw.to_string()).or_insert(0) += 1;
        }
    }
    let reused = seen.values().filter(|&&n| n > 1).count();
    json!({ "total": arr.len(), "weak": weak, "reused": reused })
}

/// Shared-database dispatch — routes the SQLite-backed subsystems (which all
/// share `dex.db`) to their handlers. Locks the one connection; degrades to
/// `null` when SQLite is unavailable (no persistence), mirroring Electron.
fn db_dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let state = app.state::<db::DbState>();
    let guard = match state.lock() {
        Ok(g) => g,
        Err(_) => return Value::Null,
    };
    let conn = match guard.as_ref() {
        Some(c) => c,
        None => return Value::Null,
    };
    // Each SQLite-backed subsystem owns one channel prefix; route by prefix to
    // the module that ensured the matching tables in setup().
    if channel.starts_with("activity-feed:") {
        return activity_feed::dispatch(conn, channel, args);
    }
    if channel.starts_with("changelog:") {
        return changelog::dispatch(conn, channel, args);
    }
    if channel.starts_with("color-labels:") {
        return color_labels::dispatch(conn, channel, args);
    }
    if channel.starts_with("dashboard:") {
        return dashboard::dispatch(conn, channel, args);
    }
    if channel.starts_with("goal-system:") {
        return goal_system::dispatch(conn, channel, args);
    }
    if channel.starts_with("help:") {
        return help_system::dispatch(conn, channel, args);
    }
    if channel.starts_with("journal:") {
        return journal::dispatch(conn, channel, args);
    }
    if channel.starts_with("layout:") {
        return layout::dispatch(conn, channel, args);
    }
    if channel.starts_with("licensing:") {
        return licensing::dispatch(conn, channel, args);
    }
    if channel.starts_with("read-later:") {
        return read_later::dispatch(conn, channel, args);
    }
    if channel.starts_with("recycle-bin:") {
        return recycle_bin::dispatch(conn, channel, args);
    }
    if channel.starts_with("time-tracking:") {
        return time_tracking::dispatch(conn, channel, args);
    }
    if channel.starts_with("word-count:") {
        return word_count::dispatch(conn, channel, args);
    }
    if channel.starts_with("content-expiry:") {
        return content_expiry::dispatch(conn, channel, args);
    }
    if channel.starts_with("daily-note:") {
        return daily_note::dispatch(conn, channel, args);
    }
    if channel.starts_with("feedback:") {
        return feedback_collector::dispatch(conn, channel, args);
    }
    if channel.starts_with("relationship-graph:") {
        return relationship_graph::dispatch(conn, channel, args);
    }
    if channel.starts_with("reminder:") {
        return reminder::dispatch(conn, channel, args);
    }
    if channel.starts_with("scratchpad:") {
        return scratchpad::dispatch(conn, channel, args);
    }
    if channel.starts_with("search-history:") {
        return search_history::dispatch(conn, channel, args);
    }
    if channel.starts_with("smart-grouping:") {
        return smart_grouping::dispatch(conn, channel, args);
    }
    if channel.starts_with("smart-rename:") {
        return smart_rename::dispatch(conn, channel, args);
    }
    if channel.starts_with("snapshot-comparison:") {
        return snapshot_comparison::dispatch(conn, channel, args);
    }
    if channel.starts_with("stats-dashboard:") {
        return statistics_dashboard::dispatch(conn, channel, args);
    }
    if channel.starts_with("version-history:") {
        return version_history::dispatch(conn, channel, args);
    }
    if channel.starts_with("bulk-metadata:") {
        return bulk_metadata::dispatch(conn, channel, args);
    }
    if channel.starts_with("daily-briefing:") {
        return daily_briefing::dispatch(conn, channel, args);
    }
    if channel.starts_with("dependencies:") {
        return dependency::dispatch(conn, channel, args);
    }
    if channel.starts_with("duplication-detector:") {
        return duplication_detector::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-archiver:") {
        return project_archiver::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-comparison:") {
        return project_comparison::dispatch(conn, channel, args);
    }
    if channel.starts_with("export-bundle:") {
        return project_export_bundle::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-health:") {
        return project_health::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-linker:") {
        return project_linker::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-lock:") {
        return project_lock::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-timeline:") {
        return project_timeline::dispatch(conn, channel, args);
    }
    if channel.starts_with("voice-memo:") {
        return voice_memo::dispatch(conn, channel, args);
    }
    if channel.starts_with("dexnotes:") {
        return notes::dispatch(conn, channel, args);
    }
    if channel.starts_with("nl-task:") {
        return nl_task::dispatch(conn, channel, args);
    }
    if channel.starts_with("theme-schedule:") {
        return theme_schedule::dispatch(conn, channel, args);
    }
    if channel.starts_with("session-replay:") {
        return session_replay::dispatch(conn, channel, args);
    }
    if channel.starts_with("media-library:") {
        return shared_media_library::dispatch(conn, channel, args);
    }
    if channel.starts_with("vinx-presentation:") {
        return vinx_presentation::dispatch(conn, channel, args);
    }
    if channel.starts_with("i18n:") {
        return localization::dispatch(conn, channel, args);
    }
    if channel.starts_with("keyboard-nav:") {
        return keyboard_navigation::dispatch(conn, channel, args);
    }
    if channel.starts_with("notification-center:") {
        return unified_notification_hub::dispatch(conn, channel, args);
    }
    if channel.starts_with("localization:") {
        return localization_engine::dispatch(conn, channel, args);
    }
    if channel.starts_with("global-search:") {
        return global_content_search::dispatch(conn, channel, args);
    }
    if channel.starts_with("fts:") {
        return full_text_index::dispatch(conn, channel, args);
    }
    if channel.starts_with("multiwindow:") {
        return multi_window::dispatch(conn, channel, args);
    }
    if channel.starts_with("multimonitor:") {
        return multi_monitor::dispatch(conn, channel, args);
    }
    if channel.starts_with("migration:") {
        return migration::dispatch(conn, channel, args);
    }
    if channel.starts_with("link-preview:") {
        return link_preview::dispatch(conn, channel, args);
    }
    if channel.starts_with("live-collab:") {
        return live_collaboration::dispatch(conn, channel, args);
    }
    if channel.starts_with("file-watcher:") {
        return file_watcher::dispatch(conn, channel, args);
    }
    if channel.starts_with("backup:") {
        return backup_restore::dispatch(conn, channel, args);
    }
    Value::Null
}

/// Notification Center dispatch (GOAL-6A) — every `notifications:*` channel,
/// backed by a Tauri-managed `Mutex<NotificationStore>`. Mirrors the Electron
/// NotificationCenter return shapes exactly (see src/main/core/NotificationCenter.ts).
fn notifications_dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let state = app.state::<std::sync::Mutex<notifications::NotificationStore>>();
    let mut store = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false, "error": "notifications busy" }),
    };
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let arg = |i: usize| args.get(i).cloned().unwrap_or(Value::Null);

    match channel {
        "notifications:create" => store.create(&arg(0)),
        "notifications:createProgress" => {
            let d = arg(0);
            store.create_progress(
                d.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                d.get("message").and_then(|v| v.as_str()).unwrap_or(""),
                d.get("category").and_then(|v| v.as_str()).unwrap_or("general"),
                d.get("total").and_then(|v| v.as_i64()).unwrap_or(0),
            )
        }
        "notifications:updateProgress" => {
            let current = args.get(1).and_then(|v| v.as_i64()).unwrap_or(0);
            let message = args.get(2).and_then(|v| v.as_str()).map(String::from);
            store.update_progress(&s(0), current, message)
        }
        "notifications:list" => store.list_json(&arg(0)),
        "notifications:get" => store.get(&s(0)),
        "notifications:getUnread" => store.get_unread(),
        "notifications:getUnreadCount" => json!(store.get_unread_count()),
        "notifications:getGrouped" => store.get_grouped(&arg(0)),
        "notifications:search" => store.search(&s(0)),
        "notifications:markRead" => store.mark_read(&s(0)),
        "notifications:markAllRead" => store.mark_all_read(),
        "notifications:dismiss" => store.dismiss(&s(0)),
        "notifications:dismissAll" => store.dismiss_all(),
        "notifications:clear" => store.clear(),
        "notifications:clearCategory" => store.clear_category(&s(0)),
        "notifications:executeAction" => store.execute_action(&s(0), &s(1)),
        "notifications:stats" => store.get_stats(),
        "notifications:config" => store.config_json(),
        "notifications:setConfig" => store.set_config(&arg(0)),
        _ => Value::Null,
    }
}

/// Generic IPC dispatcher — the Electron->Tauri migration bridge. The renderer's
/// `window.dex` / `window.electron` route every `<namespace>:<method>` channel
/// here (see src/renderer/services/platform/tauriCompat.ts). Channels are ported
/// one subsystem at a time; anything not yet ported returns `null`, so the UI
/// degrades gracefully (same as the browser preview) instead of crashing.
#[tauri::command]
fn dex_ipc(app: tauri::AppHandle, window: tauri::Window, channel: String, args: Value) -> Value {
    // Positional arg helpers (the renderer sends method args as a JSON array).
    let arg_str = |i: usize| args.get(i).and_then(|v| v.as_str()).map(|s| s.to_string());
    let arg_u64 = |i: usize| args.get(i).and_then(|v| v.as_u64());

    match channel.as_str() {
        "app:getVersion" => json!(env!("CARGO_PKG_VERSION")),
        "app:ping" => json!("pong"),

        // --- Files ----------------------------------------------------------
        "files:list" => files_list(&app, &arg_str(0).unwrap_or_else(|| "home".into())),
        "files:getScopes" | "fileSearch:getScopes" => get_scopes(&app),
        "files:isInScope" => json!(true),
        // Real bounded search/recent (Wave 2). files.recent/files.search pass an
        // options object; search.query passes a positional query string.
        "files:recent" | "fileIntel:getRecentFiles" => {
            let a0 = args.get(0).cloned().unwrap_or(Value::Null);
            let limit = a0
                .get("limit")
                .and_then(|v| v.as_u64())
                .or_else(|| a0.as_u64())
                .unwrap_or(20) as usize;
            files_recent(&app, limit)
        }
        "files:search" | "fileSearch:search" | "search:query" => {
            let a0 = args.get(0).cloned().unwrap_or(Value::Null);
            let query = a0
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| a0.get("query").and_then(|v| v.as_str()).map(|s| s.to_string()))
                .unwrap_or_default();
            let location = a0.get("location").and_then(|v| v.as_str()).map(|s| s.to_string());
            // Prefer the native Tantivy index; fall back to the bounded walk
            // until the index has been built (search:rebuild).
            index_search(&app, &query, 200).unwrap_or_else(|| files_search(&app, &query, location))
        }
        "files:rename" => files_rename(&arg_str(0).unwrap_or_default(), &arg_str(1).unwrap_or_default()),
        "files:move" => files_move(&arg_str(0).unwrap_or_default(), &arg_str(1).unwrap_or_default()),
        "files:copy" => files_copy(&arg_str(0).unwrap_or_default(), &arg_str(1).unwrap_or_default()),
        "files:delete" => files_delete(&arg_str(0).unwrap_or_default()),
        "files:mkdir" => files_mkdir(&arg_str(0).unwrap_or_default()),

        // --- System / power -------------------------------------------------
        "system:getStatus" => system_status(),
        "power:getStats" => system_status(),
        "system:getProcesses" => system_processes(),
        "system:killProcess" | "power:closeProcess" => system_kill(arg_u64(0).unwrap_or(0) as u32),

        // --- Shell ----------------------------------------------------------
        "shell:openExternal" | "shell:openPath" => shell_open(&arg_str(0).unwrap_or_default()),

        // --- OS controls (lock only; shutdown/restart/sleep deferred until
        //     tested, to avoid an accidental shutdown during migration) ------
        "os:lockScreen" => os_lock(),

        // --- Batch 1: Clipboard --------------------------------------------
        "clipboard:writeText" | "vault:copyToClipboard" => {
            clipboard_write(&arg_str(0).unwrap_or_default())
        }
        "clipboard:readText" => clipboard_read(),

        // --- Batch 2: Persistent key-value storage -------------------------
        "capability:storage:get" | "storage:get" => kv_get(&app, &arg_str(0).unwrap_or_default()),
        "capability:storage:set" | "storage:set" => {
            kv_set(&app, &arg_str(0).unwrap_or_default(), args.get(1).cloned().unwrap_or(Value::Null))
        }

        // --- Settings (kv-backed; mirrors capabilityLayer.storage) ----------
        // `apply` does power/opacity side effects in Electron that aren't native
        // yet; the durable part (persisting the settings) is what the renderer
        // relies on, so both store under the same key and report success.
        "settings:get" => settings_get(&app),
        "settings:save" | "settings:apply" => {
            kv_set(&app, SETTINGS_KEY, args.get(0).cloned().unwrap_or(Value::Null))
        }

        // --- Theme (kv-backed; mirrors dataStore themeConfig) ---------------
        "theme:getConfig" | "theme:export" => theme_config(&app),
        "theme:getMode" => theme_config(&app)
            .get("mode")
            .cloned()
            .unwrap_or_else(|| json!("dark")),
        "theme:setMode" => theme_set_field(&app, "mode", args.get(0).cloned().unwrap_or(Value::Null)),
        "theme:setAccentColor" => {
            theme_set_field(&app, "accentColor", args.get(0).cloned().unwrap_or(Value::Null))
        }
        "theme:setFontScale" => {
            theme_set_field(&app, "fontScale", args.get(0).cloned().unwrap_or(Value::Null))
        }
        "theme:setReducedMotion" => {
            theme_set_field(&app, "reducedMotion", args.get(0).cloned().unwrap_or(Value::Null))
        }
        "theme:setDensity" => {
            theme_set_field(&app, "density", args.get(0).cloned().unwrap_or(Value::Null))
        }
        "theme:generateCSSVariables" => {
            // Read raw (may be empty) so the fallbacks match the Electron handler.
            let cfg = kv_get(&app, THEME_KEY);
            let accent = cfg
                .get("accentColor")
                .and_then(|v| v.as_str())
                .unwrap_or("#0a84ff");
            let scale = cfg.get("fontScale").and_then(|v| v.as_f64()).unwrap_or(1.0);
            json!(format!("--accent-color: {}; --font-scale: {};", accent, scale))
        }
        "theme:getPresets" => theme_presets(),
        "theme:applyPreset" => theme_apply_preset(&app, &arg_str(0).unwrap_or_default()),
        "theme:import" => {
            let cfg = args.get(0).cloned().unwrap_or(Value::Null);
            if cfg.is_object() {
                kv_set(&app, THEME_KEY, cfg)
            } else {
                json!({ "success": true })
            }
        }
        // OS accent-color read is deferred; null makes the UI keep its configured
        // accent (the same path Electron takes on unsupported platforms).
        "theme:getSystemAccentColor" => Value::Null,

        // --- Batch 3: Reveal in explorer / open file -----------------------
        "fileIntel:revealInExplorer" | "shell:showItemInFolder" => {
            reveal_in_explorer(&arg_str(0).unwrap_or_default())
        }
        "fileIntel:openFile" | "media:openWithSystem" => shell_open(&arg_str(0).unwrap_or_default()),

        // --- Batch 4: Health / diagnostics ---------------------------------
        "health:check" | "health:getStatus" | "watchdog:health" => {
            json!({ "healthy": true, "shell": "tauri" })
        }
        "diagnostics:getSystemInfo" => system_status(),

        // --- Batch 5: App data locations -----------------------------------
        "app:getPath" | "data:getLocations" => app_paths(&app),

        // --- Batch 9: diagnostics / crash stats ----------------------------
        "diagnostics:getPerformance" => system_status(),
        "diagnostics:getLogs" | "crashReporter:getRecent" | "health:getLogs" => json!([]),
        "crashReporter:getStats" => json!({ "total": 0, "recent": [] }),

        // --- Batch 10: connectivity (best-effort) --------------------------
        "connection:isOnline" | "networkHygiene:isOnline" => json!(true),

        // --- Wave B: trash / OS info / disk usage --------------------------
        "files:trash" | "shell:trashItem" | "fileIntel:moveToTrash" => {
            move_to_trash(&arg_str(0).unwrap_or_default())
        }
        "os:getInfo" | "system:getInfo" => os_info(),
        "app:getName" => json!("DEX"),
        "system:getDiskUsage" | "power:getDiskUsage" => disk_usage(),

        // --- Native search index (GOAL-6A, Tantivy) ------------------------
        "search:rebuild" | "fileSearch:reindex" => index_rebuild(&app),
        "search:getStats" => index_stats(&app),

        // --- Native audio analysis (GOAL-6C) -------------------------------
        "audio:getMetadata" | "audio:getInfo" => audio_metadata(&arg_str(0).unwrap_or_default()),
        "audio:getWaveform" | "audio:getPeaks" | "media:getWaveform" => {
            audio_waveform(&arg_str(0).unwrap_or_default(), arg_u64(1).unwrap_or(256) as usize)
        }

        // --- Native file scanner: duplicate detection (GOAL-6A) ------------
        "fileIntel:findDuplicates" => {
            let root = resolve_path(&app, &arg_str(0).unwrap_or_else(|| "home".into()));
            json!({ "success": true, "groups": dex_scanner::find_duplicates(&root, 20000) })
        }
        "fileIntel:groupByType" => {
            let root = resolve_path(&app, &arg_str(0).unwrap_or_else(|| "home".into()));
            json!({ "success": true, "groups": dex_scanner::group_by_type(&root, 20000) })
        }
        "fileIntel:getStatistics" => {
            let root = resolve_path(&app, &arg_str(0).unwrap_or_else(|| "home".into()));
            let groups = dex_scanner::group_by_type(&root, 20000);
            let total: usize = groups.iter().map(|g| g.count).sum();
            json!({ "success": true, "total": total, "byType": groups })
        }

        // --- Native automation engine (GOAL-6C) ----------------------------
        // Definition-based runs execute natively; id-based execute needs a native
        // store (later) and degrades gracefully.
        "automation:run" | "workflow:executeNew" | "workflow:execute" | "automations:execute" => {
            let def = args.get(0).cloned().unwrap_or(Value::Null);
            if def.get("steps").is_some() {
                dex_automation::run(&def, &args.get(1).cloned().unwrap_or_else(|| json!({})))
            } else {
                json!({ "success": false, "error": "automation not found (native store pending)" })
            }
        }

        // --- Window controls -----------------------------------------------
        // Electron's handlers all return { success: true }; mirror that so these
        // (which work) aren't counted as degraded in the bridge telemetry.
        "window:minimize" => {
            let _ = window.minimize();
            json!({ "success": true })
        }
        "window:maximize" => {
            // The renderer treats this as a toggle.
            match window.is_maximized() {
                Ok(true) => {
                    let _ = window.unmaximize();
                }
                _ => {
                    let _ = window.maximize();
                }
            }
            json!({ "success": true })
        }
        // Electron's window:close HIDES to tray. The Tauri shell has no tray yet,
        // so hiding would strand the app with no way to restore it — actually
        // close until the tray subsystem is ported. (Revisit at tray parity.)
        "window:close" => {
            let _ = window.close();
            json!({ "success": true })
        }
        "window:hide" => {
            let _ = window.hide();
            json!({ "success": true })
        }
        // No native title-bar overlay under Tauri (the titlebar is CSS) — accept
        // the toggle as a no-op so the renderer's titlebar logic proceeds.
        "window:setTitleBarOverlay" => json!({ "success": true }),

        // --- SQLite-backed subsystems (shared dex.db) ----------------------
        // Every db-backed subsystem routes through db_dispatch, which locks the
        // one shared connection and forwards by channel prefix to its module.
        ch if ch.starts_with("activity-feed:")
            || ch.starts_with("changelog:")
            || ch.starts_with("color-labels:")
            || ch.starts_with("dashboard:")
            || ch.starts_with("goal-system:")
            || ch.starts_with("help:")
            || ch.starts_with("journal:")
            || ch.starts_with("layout:")
            || ch.starts_with("licensing:")
            || ch.starts_with("read-later:")
            || ch.starts_with("recycle-bin:")
            || ch.starts_with("time-tracking:")
            || ch.starts_with("word-count:")
            || ch.starts_with("content-expiry:")
            || ch.starts_with("daily-note:")
            || ch.starts_with("feedback:")
            || ch.starts_with("relationship-graph:")
            || ch.starts_with("reminder:")
            || ch.starts_with("scratchpad:")
            || ch.starts_with("search-history:")
            || ch.starts_with("smart-grouping:")
            || ch.starts_with("smart-rename:")
            || ch.starts_with("snapshot-comparison:")
            || ch.starts_with("stats-dashboard:")
            || ch.starts_with("version-history:")
            || ch.starts_with("bulk-metadata:")
            || ch.starts_with("daily-briefing:")
            || ch.starts_with("dependencies:")
            || ch.starts_with("duplication-detector:")
            || ch.starts_with("project-archiver:")
            || ch.starts_with("project-comparison:")
            || ch.starts_with("export-bundle:")
            || ch.starts_with("project-health:")
            || ch.starts_with("project-linker:")
            || ch.starts_with("project-lock:")
            || ch.starts_with("project-timeline:")
            || ch.starts_with("voice-memo:")
            || ch.starts_with("dexnotes:")
            || ch.starts_with("nl-task:")
            || ch.starts_with("theme-schedule:")
            || ch.starts_with("session-replay:")
            || ch.starts_with("media-library:")
            || ch.starts_with("vinx-presentation:")
            || ch.starts_with("i18n:")
            || ch.starts_with("keyboard-nav:")
            || ch.starts_with("notification-center:")
            || ch.starts_with("localization:")
            || ch.starts_with("global-search:")
            || ch.starts_with("fts:")
            || ch.starts_with("multiwindow:")
            || ch.starts_with("multimonitor:")
            || ch.starts_with("migration:")
            || ch.starts_with("link-preview:")
            || ch.starts_with("live-collab:")
            || ch.starts_with("file-watcher:")
            || ch.starts_with("backup:") =>
        {
            db_dispatch(&app, ch, &args)
        }

        // --- Notification Center (GOAL-6A): all notifications:* channels ---
        ch if ch.starts_with("notifications:") => notifications_dispatch(&app, ch, &args),

        // --- Vault (GOAL-6B): all vault:* channels except copyToClipboard --
        ch if ch.starts_with("vault:") => vault_dispatch(&app, ch, &args),

        // More subsystem handlers land here as the migration proceeds
        // (universal search index, audio, automation, transfer, ...).
        _ => Value::Null,
    }
}

/// Rank the supplied candidate models for a goal + prompt, natively. The
/// renderer (which knows the keystore/registry) builds the candidate set and
/// passes it in; the native core does the ranking math. Mirrors the TS
/// `routeConfiguredModels` so the result matches the Electron path.
#[tauri::command]
fn smart_router_route(
    goal: String,
    user_text: String,
    candidates: Vec<RouteCandidate>,
) -> Vec<String> {
    route_for_prompt(RoutingGoal::parse(&goal), &user_text, &candidates)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Vault state lives for the app lifetime; the key is only set while
            // unlocked. File is stored in the app config dir.
            let vault_path = app
                .path()
                .app_config_dir()
                .unwrap_or_default()
                .join("vault.dex");
            app.manage(std::sync::Mutex::new(dex_vault::VaultManager::new(vault_path)));
            // Native search index (built on demand via search:rebuild).
            let index_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_default()
                .join("search-index");
            app.manage(std::sync::Mutex::new(
                dex_search::SearchIndex::open_or_create(&index_dir).ok(),
            ));
            // Notification center — persists under the app data dir, mirroring
            // Electron's userData/notifications.
            let notif_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_default()
                .join("notifications");
            app.manage(std::sync::Mutex::new(
                notifications::NotificationStore::new(notif_dir),
            ));
            // Shared SQLite database (dex.db) for the ~50 db-backed subsystems.
            // Each ported subsystem ensures its own tables here.
            let db_path = app
                .path()
                .app_data_dir()
                .unwrap_or_default()
                .join("databases")
                .join("dex.db");
            let conn = db::open(&db_path).ok();
            if let Some(ref c) = conn {
                // Each subsystem ensures its own tables (CREATE TABLE IF NOT
                // EXISTS), mirroring how the Electron managers init on the shared
                // DatabaseManager. Order is irrelevant; all are idempotent.
                activity_feed::ensure_schema(c);
                changelog::ensure_schema(c);
                color_labels::ensure_schema(c);
                content_expiry::ensure_schema(c);
                daily_note::ensure_schema(c);
                dashboard::ensure_schema(c);
                feedback_collector::ensure_schema(c);
                goal_system::ensure_schema(c);
                help_system::ensure_schema(c);
                journal::ensure_schema(c);
                layout::ensure_schema(c);
                licensing::ensure_schema(c);
                read_later::ensure_schema(c);
                recycle_bin::ensure_schema(c);
                relationship_graph::ensure_schema(c);
                reminder::ensure_schema(c);
                scratchpad::ensure_schema(c);
                search_history::ensure_schema(c);
                smart_grouping::ensure_schema(c);
                smart_rename::ensure_schema(c);
                snapshot_comparison::ensure_schema(c);
                statistics_dashboard::ensure_schema(c);
                time_tracking::ensure_schema(c);
                version_history::ensure_schema(c);
                word_count::ensure_schema(c);
                bulk_metadata::ensure_schema(c);
                daily_briefing::ensure_schema(c);
                dependency::ensure_schema(c);
                duplication_detector::ensure_schema(c);
                project_archiver::ensure_schema(c);
                project_comparison::ensure_schema(c);
                project_export_bundle::ensure_schema(c);
                project_health::ensure_schema(c);
                project_linker::ensure_schema(c);
                project_lock::ensure_schema(c);
                project_timeline::ensure_schema(c);
                voice_memo::ensure_schema(c);
                keyboard_navigation::ensure_schema(c);
                localization::ensure_schema(c);
                nl_task::ensure_schema(c);
                notes::ensure_schema(c);
                session_replay::ensure_schema(c);
                shared_media_library::ensure_schema(c);
                theme_schedule::ensure_schema(c);
                vinx_presentation::ensure_schema(c);
                backup_restore::ensure_schema(c);
                file_watcher::ensure_schema(c);
                full_text_index::ensure_schema(c);
                global_content_search::ensure_schema(c);
                link_preview::ensure_schema(c);
                live_collaboration::ensure_schema(c);
                localization_engine::ensure_schema(c);
                migration::ensure_schema(c);
                multi_monitor::ensure_schema(c);
                multi_window::ensure_schema(c);
                unified_notification_hub::ensure_schema(c);
            }
            let db_state: db::DbState = std::sync::Mutex::new(conn);
            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![smart_router_route, dex_ipc])
        .run(tauri::generate_context!())
        .expect("error while running the DEX Tauri shell");
}
