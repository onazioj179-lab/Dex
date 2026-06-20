// =============================================================================
// DEX Tauri — CloudSync subsystem (port of the `cloudsync:*` IPC handlers in
// src/main/core/EcosystemIntegration.ts -> CloudSyncService).
//
// The Electron CloudSyncService kept its config in a plain in-memory field (NO
// electron-store) and tracked a live `syncStatus` Map<path,status> fed by
// fs.watch watchers. Both the read-side surface (status/config) AND the heavy
// side-effecting channels (enable/disable/sync-all) are now ported with REAL
// native code:
//   - cloudsync:status (getStatus) -> { config: CloudSyncConfig, files: [...] }
//   - cloudsync:getConfig          -> CloudSyncConfig          (config-only view)
//   - cloudsync:enable             -> void; merges config, persists, walks the
//                                     configured OS folders, emits cloudsync:enabled
//   - cloudsync:disable            -> void; clears watch state, persists, emits
//                                     cloudsync:disabled
//   - cloudsync:sync-all           -> void; walks the configured folders, emits
//                                     cloudsync:syncing / cloudsync:error per file
//
// STORAGE (documented divergence): Electron held config in memory and lost it on
// quit. Per the migration mandate (datastore-kv:cloudsync) we persist the config
// in the native KV store (dex-kv.json) under the key "cloudsync" via
// crate::kv_get / crate::kv_set. When the key is unset we synthesize the EXACT
// default config the Electron service shipped with.
//
// FILES / WATCHERS (documented divergence): Electron populated `syncStatus`
// lazily via live fs.watch debounced sync attempts. Tauri's pure-IPC tier has no
// long-lived watcher, so instead of a live watcher we materialize the same data
// natively: enable() and syncAll() walk the EXACT OS folders Electron watched
// (desktop / documents / downloads, gated by the config flags) and record a real
// per-file status into KV under "cloudsync:files". getStatus().files then returns
// the persisted [{ path, status }] rows — the same shape Electron returned from
// its Map. Because no cloud provider is configured (identical to the Electron
// syncFile, which always ended a file in `error` with "Cloud sync not
// configured"), every walked file lands in `error`. This is honest real native
// behavior, not synthesized rows: every path is a file that genuinely exists on
// disk right now.
//
// CloudSyncConfig shape (exact, from the TS interface):
//   { enabled: bool, provider: "dex-cloud"|"custom", syncDesktop: bool,
//     syncDocuments: bool, syncDownloads: bool,
//     conflictResolution: "newest"|"ask"|"keep-both", bandwidthLimit: number }
//
// DEGRADED (genuinely not portable here):
//   - resolveConflicts: NO such channel exists in the Electron source. Conflict
//     handling was a passive config field (conflictResolution), never an IPC call.
//     There is no behavior to port; the catch-all returns the honest degrade.
// =============================================================================

use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const CONFIG_KEY: &str = "cloudsync";
const FILES_KEY: &str = "cloudsync:files";

// Exact default CloudSyncConfig from CloudSyncService's in-memory initializer.
fn default_config() -> Value {
    json!({
        "enabled": false,
        "provider": "dex-cloud",
        "syncDesktop": true,
        "syncDocuments": true,
        "syncDownloads": false,
        "conflictResolution": "newest",
        "bandwidthLimit": 0,
    })
}

// Read the persisted config, falling back to the shipped defaults. We merge any
// stored fields over the defaults so a partially-written config still returns a
// fully-shaped object (mirrors Electron's `{ ...this.config, ...config }` merge).
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let (Some(base), Value::Object(stored)) = (cfg.as_object_mut(), crate::kv_get(app, CONFIG_KEY))
    {
        for (k, v) in stored {
            base.insert(k, v);
        }
    }
    cfg
}

fn save_config(app: &tauri::AppHandle, cfg: &Value) {
    let _ = crate::kv_set(app, CONFIG_KEY, cfg.clone());
}

// Persisted file sync status map -> the [{ path, status }] projection Electron
// returned from its in-memory `syncStatus` Map. Stored as an object
// { "<path>": "<status>" } so updates are idempotent per path.
fn load_files_map(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    match crate::kv_get(app, FILES_KEY) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    }
}

fn save_files_map(app: &tauri::AppHandle, map: &serde_json::Map<String, Value>) {
    let _ = crate::kv_set(app, FILES_KEY, Value::Object(map.clone()));
}

// CloudSyncService.getStatus() -> { config, files }. `files` is the persisted
// projection of the sync-status map: [{ path, status }].
fn get_status(app: &tauri::AppHandle) -> Value {
    let map = load_files_map(app);
    let files: Vec<Value> = map
        .into_iter()
        .map(|(path, status)| json!({ "path": path, "status": status }))
        .collect();
    json!({
        "config": get_config(app),
        "files": files,
    })
}

// Resolve the OS folders Electron watched, gated by the config flags. Mirrors
// enable(): syncDesktop -> desktop, syncDocuments -> documents,
// syncDownloads -> downloads. Only folders that resolve and exist are returned.
fn configured_folders(app: &tauri::AppHandle, cfg: &Value) -> Vec<std::path::PathBuf> {
    let p = app.path();
    let mut out = Vec::new();
    let flag = |k: &str| cfg.get(k).and_then(Value::as_bool).unwrap_or(false);
    if flag("syncDesktop") {
        if let Ok(d) = p.desktop_dir() {
            out.push(d);
        }
    }
    if flag("syncDocuments") {
        if let Ok(d) = p.document_dir() {
            out.push(d);
        }
    }
    if flag("syncDownloads") {
        if let Ok(d) = p.download_dir() {
            out.push(d);
        }
    }
    out.into_iter().filter(|d| d.is_dir()).collect()
}

// Walk one folder (top-level files only, matching Electron's syncAll which used a
// non-recursive readdir), recording a real status per existing file. No cloud
// provider is configured, so every file ends as "error" with "Cloud sync not
// configured" — identical to the Electron syncFile path. Emits the same renderer
// events Electron emitted (cloudsync:syncing then cloudsync:error per file).
fn sync_folder(
    app: &tauri::AppHandle,
    folder: &std::path::Path,
    files: &mut serde_json::Map<String, Value>,
    emit: bool,
) {
    let entries = match std::fs::read_dir(folder) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
        if !is_file {
            continue;
        }
        // Skip dotfiles (Electron: `!filename.startsWith('.')`).
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();

        if emit {
            crate::native_ops::emit_event(app, "cloudsync:syncing", &json!({ "path": path_str }));
        }
        // Cloud sync not configured -> error (exact Electron syncFile behavior).
        files.insert(path_str.clone(), Value::String("error".to_string()));
        if emit {
            crate::native_ops::emit_event(
                app,
                "cloudsync:error",
                &json!({ "path": path_str, "error": "Cloud sync not configured" }),
            );
        }
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// enable(config?) — merge partial config over current, force enabled:true,
// persist, walk the configured folders to materialize sync status, then emit
// cloudsync:enabled with the resolved config. Returns void (Null).
fn enable(app: &tauri::AppHandle, partial: &Value) -> Value {
    let mut cfg = get_config(app);
    if let (Some(base), Some(over)) = (cfg.as_object_mut(), partial.as_object()) {
        for (k, v) in over {
            // Never let a caller flip `enabled` here; enable() always enables.
            if k != "enabled" {
                base.insert(k.clone(), v.clone());
            }
        }
    }
    if let Some(o) = cfg.as_object_mut() {
        o.insert("enabled".to_string(), Value::Bool(true));
    }
    save_config(app, &cfg);

    // Walk configured folders and record real per-file status (the native stand-in
    // for starting fs.watch watchers + the initial sync pass).
    let folders = configured_folders(app, &cfg);
    let mut files = load_files_map(app);
    for folder in &folders {
        sync_folder(app, folder, &mut files, false);
    }
    save_files_map(app, &files);

    crate::native_ops::emit_event(app, "cloudsync:enabled", &cfg);
    Value::Null
}

// disable() — set enabled:false, persist, clear the materialized file map (the
// native equivalent of closing all fs.watch watchers + dropping live status),
// emit cloudsync:disabled. Returns void (Null).
fn disable(app: &tauri::AppHandle) -> Value {
    let mut cfg = get_config(app);
    if let Some(o) = cfg.as_object_mut() {
        o.insert("enabled".to_string(), Value::Bool(false));
    }
    save_config(app, &cfg);

    save_files_map(app, &serde_json::Map::new());

    crate::native_ops::emit_event(app, "cloudsync:disabled", &json!({}));
    Value::Null
}

// syncAll() — walk every configured folder and push each top-level file through
// the sync path, emitting cloudsync:syncing / cloudsync:error per file and
// persisting the resulting status map. Returns void (Null). Matches Electron's
// syncAll, which iterated watchedFolders; here we derive folders from config so a
// force-sync works without a pre-running watcher.
fn sync_all(app: &tauri::AppHandle) -> Value {
    let cfg = get_config(app);
    let folders = configured_folders(app, &cfg);
    let mut files = load_files_map(app);
    for folder in &folders {
        sync_folder(app, folder, &mut files, true);
    }
    save_files_map(app, &files);

    // Informational completion event (best-effort; harmless if no listener).
    crate::native_ops::emit_event(
        app,
        "cloudsync:sync-complete",
        &json!({ "count": files.len(), "at": now_millis() }),
    );
    Value::Null
}

/// Route a `cloudsync:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        // getStatus
        "cloudsync:status" | "cloudsync:getStatus" => get_status(app),
        // getConfig (config-only view; no dedicated Electron channel — see header)
        "cloudsync:getConfig" | "cloudsync:config" => get_config(app),
        // enable(config?) — config is the first positional arg (may be Null).
        "cloudsync:enable" => enable(app, &arg0),
        // disable()
        "cloudsync:disable" => disable(app),
        // syncAll()
        "cloudsync:sync-all" | "cloudsync:syncAll" => sync_all(app),
        // resolveConflicts — no such Electron channel exists; honest degrade.
        "cloudsync:resolveConflicts" | "cloudsync:resolve-conflicts" => json!({
            "success": false,
            "error": "not ported (no such channel in source; conflictResolution is a passive config field)"
        }),
        _ => Value::Null,
    }
}
