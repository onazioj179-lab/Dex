// =============================================================================
// DEX Tauri — Uninstall subsystem (port of the `uninstall:*` IPC handlers).
//
// PROMPT-vs-REALITY divergence (documented): the porting brief named the source
// `src/main/core/Uninstaller.ts`, a `uninstall:getStatus` channel, and a
// `datastore-kv:uninstall` key. None of those exist. The real `uninstall:`
// namespace is implemented across two stateless/file-backed services, reached
// through the generic `uninstall:` prefix passthrough in preload.ts:
//   - src/main/core/UninstallManager.ts    -> uninstall:get-plan / :execute /
//                                             :verify  (walks host data dirs)
//   - src/main/core/CleanUninstallSystem.ts -> uninstall:footprint / :preview /
//                                             :execute / :exportUserData /
//                                             :listFiles / :config / :setConfig /
//                                             :trackFile / :openFootprintLocation
//
// CleanUninstallSystem persists its tracking to `footprint.json` under userData
// (its constructor seeds an in-memory DEFAULT_CONFIG; config is NOT in the file
// in Electron, but we extend the same file with a `config` key so :setConfig has
// somewhere durable to live — a strict superset that stays read-compatible).
//
// WHAT IS PORTED (real native code):
//   - uninstall:config              -> read footprint.json config (or defaults)
//   - uninstall:setConfig           -> merge + persist config, { success: true }
//   - uninstall:footprint           -> FootprintSummary computed from tracking
//   - uninstall:preview             -> UninstallPreview (live existsSync filter)
//   - uninstall:listFiles           -> TrackedFile[] (optional category filter)
//   - uninstall:trackFile           -> std::fs::metadata + persist, { success }
//   - uninstall:exportUserData      -> copy user-owned files + write manifest
//   - uninstall:openFootprintLocation -> open OS file manager at userData
//   - uninstall:get-plan            -> scan data/cache/config dirs -> UninstallPlan
//   - uninstall:verify              -> which DEX dirs still exist
//
// WHAT IS DEGRADED (honest, not faked):
//   - uninstall:getStatus  -> does not exist in Electron (no such handler).
//   - uninstall / cleanup  -> the destructive `uninstall:execute`. It deletes the
//     user's entire app-data tree and (in CleanUninstallSystem) blocks on a modal
//     dialog. Running that off a generic prefix passthrough with no live OS dialog
//     and no confirmation gate is unsafe, so it is refused rather than faked.
//
// ids -> crate::util::pseudo_uuid_v4(); timestamps -> SystemTime epoch millis.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const FOOTPRINT_FILE: &str = "footprint.json";

// --- helpers ----------------------------------------------------------------

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn user_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn footprint_path(app: &tauri::AppHandle) -> PathBuf {
    user_data_dir(app).join(FOOTPRINT_FILE)
}

/// CleanUninstallSystem.DEFAULT_CONFIG — field names/types match the TS exactly.
fn default_config() -> Value {
    json!({
        "trackNewFiles": true,
        "exportUserDataOnUninstall": true,
        "showConfirmationDialog": true,
        "removeRegistryEntries": true,
        "removeShortcuts": true,
        "secureDelete": false,
        "secureDeletePasses": 1,
    })
}

/// Read footprint.json -> { version, updatedAt, files: [], directories: [], config }.
/// Missing file / parse error yields an empty tracking shell with default config.
fn read_tracking(app: &tauri::AppHandle) -> Value {
    let parsed = std::fs::read_to_string(footprint_path(app))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());

    let mut obj = match parsed {
        Some(Value::Object(m)) => m,
        _ => Map::new(),
    };

    if !obj.contains_key("files") {
        obj.insert("files".into(), json!([]));
    }
    if !obj.contains_key("directories") {
        obj.insert("directories".into(), json!([]));
    }
    // Electron keeps config in memory; we surface defaults if the file lacks it.
    if !obj.get("config").map(|c| c.is_object()).unwrap_or(false) {
        obj.insert("config".into(), default_config());
    }
    Value::Object(obj)
}

fn write_tracking(app: &tauri::AppHandle, mut tracking: Value) {
    if let Some(o) = tracking.as_object_mut() {
        o.insert("version".into(), json!(1));
        o.insert("updatedAt".into(), json!(now_ms()));
    }
    if let Ok(raw) = serde_json::to_string_pretty(&tracking) {
        let _ = crate::write_atomic(footprint_path(app), raw);
    }
}

fn files_array(tracking: &Value) -> Vec<Value> {
    tracking
        .get("files")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn dirs_array(tracking: &Value) -> Vec<Value> {
    tracking
        .get("directories")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn config_value(tracking: &Value) -> Value {
    tracking
        .get("config")
        .filter(|c| c.is_object())
        .cloned()
        .unwrap_or_else(default_config)
}

// --- footprint / preview / list (CleanUninstallSystem) ----------------------

/// Reproduces CleanUninstallSystem.getFootprintSummary() from tracked files.
fn footprint_summary(app: &tauri::AppHandle) -> Value {
    let tracking = read_tracking(app);
    let files = files_array(&tracking);
    let dirs = dirs_array(&tracking);

    let categories = [
        "config", "data", "cache", "logs", "temp", "user-created", "vault",
        "index", "backup",
    ];
    let mut by_category = Map::new();
    for c in categories {
        by_category.insert(c.into(), json!({ "files": 0u64, "sizeBytes": 0u64 }));
    }

    let mut total_files: u64 = 0;
    let mut total_size: u64 = 0;
    let mut user_owned_files: u64 = 0;
    let mut user_owned_size: u64 = 0;

    for f in &files {
        let size = f.get("sizeBytes").and_then(|v| v.as_u64()).unwrap_or(0);
        let cat = f.get("category").and_then(|v| v.as_str()).unwrap_or("data");
        let user_owned = f.get("userOwned").and_then(|v| v.as_bool()).unwrap_or(false);

        total_files += 1;
        total_size += size;

        if let Some(entry) = by_category.get_mut(cat).and_then(|e| e.as_object_mut()) {
            let cur_files = entry.get("files").and_then(|v| v.as_u64()).unwrap_or(0);
            let cur_size = entry.get("sizeBytes").and_then(|v| v.as_u64()).unwrap_or(0);
            entry.insert("files".into(), json!(cur_files + 1));
            entry.insert("sizeBytes".into(), json!(cur_size + size));
        }

        if user_owned {
            user_owned_files += 1;
            user_owned_size += size;
        }
    }

    json!({
        "totalFiles": total_files,
        "totalDirectories": dirs.len(),
        "totalSizeBytes": total_size,
        "byCategory": Value::Object(by_category),
        "userOwnedFiles": user_owned_files,
        "userOwnedSizeBytes": user_owned_size,
    })
}

/// Reproduces CleanUninstallSystem.previewUninstall(options?).
fn preview_uninstall(app: &tauri::AppHandle, args: &Value) -> Value {
    let tracking = read_tracking(app);
    let config = config_value(&tracking);

    // keepUserData defaults to config.exportUserDataOnUninstall.
    let keep_user_data = args
        .get(0)
        .and_then(|o| o.get("keepUserData"))
        .and_then(|v| v.as_bool())
        .unwrap_or_else(|| {
            config
                .get("exportUserDataOnUninstall")
                .and_then(|v| v.as_bool())
                .unwrap_or(true)
        });

    let mut files_to_remove: Vec<Value> = Vec::new();
    let mut user_data_to_export: Vec<Value> = Vec::new();
    let mut total_size: u64 = 0;
    let mut has_vault = false;

    for f in files_array(&tracking) {
        let path = f.get("path").and_then(|v| v.as_str()).unwrap_or("");
        if path.is_empty() || !Path::new(path).exists() {
            continue;
        }
        let user_owned = f.get("userOwned").and_then(|v| v.as_bool()).unwrap_or(false);
        if user_owned && keep_user_data {
            user_data_to_export.push(f);
        } else {
            let size = f.get("sizeBytes").and_then(|v| v.as_u64()).unwrap_or(0);
            if f.get("category").and_then(|v| v.as_str()) == Some("vault") {
                has_vault = true;
            }
            total_size += size;
            files_to_remove.push(f);
        }
    }

    // Directories that still exist, sorted deepest-first (by separator count).
    let mut dirs: Vec<Value> = dirs_array(&tracking)
        .into_iter()
        .filter(|d| {
            d.get("path")
                .and_then(|v| v.as_str())
                .map(|p| Path::new(p).exists())
                .unwrap_or(false)
        })
        .collect();
    dirs.sort_by(|a, b| {
        let depth = |v: &Value| {
            v.get("path")
                .and_then(|p| p.as_str())
                .map(|s| s.split(|c| c == '/' || c == '\\').count())
                .unwrap_or(0)
        };
        depth(b).cmp(&depth(a))
    });

    let mut warnings: Vec<String> = Vec::new();
    if !user_data_to_export.is_empty() && keep_user_data {
        warnings.push(format!(
            "{} user files will be preserved or exported",
            user_data_to_export.len()
        ));
    }
    if has_vault {
        warnings.push(
            "Vault files will be permanently deleted - ensure you have exported important data"
                .to_string(),
        );
    }

    json!({
        "filesToRemove": files_to_remove,
        "directoriesToRemove": dirs,
        "userDataToExport": user_data_to_export,
        "totalSizeBytes": total_size,
        "warnings": warnings,
    })
}

/// Reproduces CleanUninstallSystem.listTrackedFiles(category?).
fn list_files(app: &tauri::AppHandle, args: &Value) -> Value {
    let tracking = read_tracking(app);
    let files = files_array(&tracking);
    match args.get(0).and_then(|v| v.as_str()) {
        Some(cat) => Value::Array(
            files
                .into_iter()
                .filter(|f| f.get("category").and_then(|v| v.as_str()) == Some(cat))
                .collect(),
        ),
        None => Value::Array(files),
    }
}

/// Reproduces CleanUninstallSystem.trackFile(path, category, userOwned?).
fn track_file(app: &tauri::AppHandle, args: &Value) -> Value {
    let mut tracking = read_tracking(app);
    let config = config_value(&tracking);

    // config.trackNewFiles gate, matching Electron.
    if !config.get("trackNewFiles").and_then(|v| v.as_bool()).unwrap_or(true) {
        return json!({ "success": false });
    }

    let file_path = match args.get(0).and_then(|v| v.as_str()) {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => return json!({ "success": false }),
    };
    let category = args
        .get(1)
        .and_then(|v| v.as_str())
        .unwrap_or("data")
        .to_string();
    let user_owned = args.get(2).and_then(|v| v.as_bool()).unwrap_or(false);

    let meta = match std::fs::metadata(&file_path) {
        Ok(m) => m,
        Err(_) => return json!({ "success": false }),
    };

    let size = meta.len();
    let created = meta
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or_else(now_ms);
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or_else(now_ms);

    let tracked = json!({
        "path": file_path,
        "category": category,
        "createdAt": created,
        "lastModified": modified,
        "sizeBytes": size,
        "essential": category == "config",
        "userOwned": user_owned,
    });

    // Map semantics: replace existing entry with same path, else append.
    if let Some(arr) = tracking.get_mut("files").and_then(|v| v.as_array_mut()) {
        if let Some(slot) = arr
            .iter_mut()
            .find(|e| e.get("path").and_then(|p| p.as_str()) == Some(file_path.as_str()))
        {
            *slot = tracked;
        } else {
            arr.push(tracked);
        }
    }

    write_tracking(app, tracking);
    json!({ "success": true })
}

/// Reproduces CleanUninstallSystem.updateConfig(updates) — merge + persist.
fn set_config(app: &tauri::AppHandle, args: &Value) -> Value {
    let mut tracking = read_tracking(app);
    let mut config = config_value(&tracking);

    if let (Some(updates), Some(cfg_obj)) =
        (args.get(0).and_then(|v| v.as_object()), config.as_object_mut())
    {
        for (k, v) in updates {
            cfg_obj.insert(k.clone(), v.clone());
        }
    }

    if let Some(o) = tracking.as_object_mut() {
        o.insert("config".into(), config);
    }
    write_tracking(app, tracking);
    json!({ "success": true })
}

/// Reproduces CleanUninstallSystem.exportUserData(outputPath).
fn export_user_data(app: &tauri::AppHandle, args: &Value) -> Value {
    let output_path = match args.get(0).and_then(|v| v.as_str()) {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => {
            return json!({
                "success": false,
                "exportedCount": 0,
                "error": "outputPath is required",
            })
        }
    };

    if let Err(e) = std::fs::create_dir_all(&output_path) {
        return json!({
            "success": false,
            "exportedCount": 0,
            "error": e.to_string(),
        });
    }

    let user_data = user_data_dir(app);
    let tracking = read_tracking(app);
    let user_files: Vec<Value> = files_array(&tracking)
        .into_iter()
        .filter(|f| f.get("userOwned").and_then(|v| v.as_bool()).unwrap_or(false))
        .collect();

    let mut exported_count: u64 = 0;
    for f in &user_files {
        let src = match f.get("path").and_then(|v| v.as_str()) {
            Some(p) if Path::new(p).exists() => PathBuf::from(p),
            _ => continue,
        };
        // Mirror path.relative(userData, src); fall back to file name on failure.
        let rel = src
            .strip_prefix(&user_data)
            .ok()
            .map(|p| p.to_path_buf())
            .or_else(|| src.file_name().map(PathBuf::from));
        let rel = match rel {
            Some(r) => r,
            None => continue,
        };
        let dest = output_path.join(&rel);
        if let Some(parent) = dest.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if std::fs::copy(&src, &dest).is_ok() {
            exported_count += 1;
        }
    }

    let manifest = json!({
        "exportedAt": now_ms(),
        "exportedFrom": "DEX",
        "version": app.package_info().version.to_string(),
        "fileCount": exported_count,
        "files": user_files.iter().map(|f| json!({
            "originalPath": f.get("path").cloned().unwrap_or(Value::Null),
            "category": f.get("category").cloned().unwrap_or(Value::Null),
            "sizeBytes": f.get("sizeBytes").cloned().unwrap_or(json!(0)),
        })).collect::<Vec<_>>(),
    });
    if let Ok(raw) = serde_json::to_string_pretty(&manifest) {
        let _ = crate::write_atomic(output_path.join("dex-export-manifest.json"), raw);
    }

    json!({ "success": true, "exportedCount": exported_count })
}

/// Reproduces CleanUninstallSystem.openFootprintLocation() — reveal userData in
/// the OS file manager. Console window suppressed on Windows (creation_flags).
fn open_footprint_location(app: &tauri::AppHandle) -> Value {
    let dir = user_data_dir(app);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("explorer")
            .arg(&dir)
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&dir).spawn();
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }

    json!({ "success": true })
}

// --- get-plan / verify (UninstallManager) -----------------------------------

fn recursive_dir_size(path: &Path) -> u64 {
    let mut size = 0u64;
    let entries = match std::fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return 0,
    };
    for entry in entries.flatten() {
        let p = entry.path();
        match entry.file_type() {
            Ok(ft) if ft.is_dir() => size += recursive_dir_size(&p),
            Ok(_) => {
                if let Ok(meta) = entry.metadata() {
                    size += meta.len();
                }
            }
            Err(_) => {}
        }
    }
    size
}

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// UninstallManager.getDataDirectories() — existing dirs only.
fn data_directories(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    dirs.push(user_data_dir(app));

    if cfg!(target_os = "windows") {
        let appdata = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join("AppData").join("Roaming"));
        let local = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join("AppData").join("Local"));
        for name in ["DEX", "Dex", "dex"] {
            dirs.push(appdata.join(name));
            dirs.push(local.join(name));
        }
    } else if cfg!(target_os = "macos") {
        dirs.push(home_dir().join("Library").join("Application Support").join("DEX"));
    } else {
        dirs.push(home_dir().join(".config").join("DEX"));
        dirs.push(home_dir().join(".local").join("share").join("DEX"));
    }

    dedup_existing(dirs)
}

/// UninstallManager.getCacheDirectories() — existing dirs only.
fn cache_directories(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    // app.getPath('sessionData') has no exact Tauri analogue; userData is the
    // closest stable base, matching where the session/cache subdirs live.
    let _ = app;

    if cfg!(target_os = "windows") {
        let local = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join("AppData").join("Local"));
        for name in ["DEX", "Dex", "dex"] {
            dirs.push(local.join(name).join("Cache"));
            dirs.push(local.join(name).join("Code Cache"));
            dirs.push(local.join(name).join("GPUCache"));
        }
    } else if cfg!(target_os = "macos") {
        dirs.push(home_dir().join("Library").join("Caches").join("DEX"));
        dirs.push(home_dir().join("Library").join("Caches").join("com.dex.app"));
    } else {
        dirs.push(home_dir().join(".cache").join("DEX"));
    }

    dedup_existing(dirs)
}

/// UninstallManager.getConfigDirectories() — existing entries only.
fn config_directories() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "macos") {
        dirs.push(
            home_dir()
                .join("Library")
                .join("Preferences")
                .join("com.dex.app.plist"),
        );
        dirs.push(
            home_dir()
                .join("Library")
                .join("Saved Application State")
                .join("com.dex.app.savedState"),
        );
    } else if cfg!(target_os = "linux") {
        dirs.push(home_dir().join(".config").join("DEX"));
    }
    dirs.into_iter().filter(|d| d.exists()).collect()
}

fn dedup_existing(dirs: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen: Vec<PathBuf> = Vec::new();
    for d in dirs {
        if d.exists() && !seen.contains(&d) {
            seen.push(d);
        }
    }
    seen
}

fn platform_string() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

fn path_size(p: &Path) -> u64 {
    match std::fs::metadata(p) {
        Ok(m) if m.is_dir() => recursive_dir_size(p),
        Ok(m) => m.len(),
        Err(_) => 0,
    }
}

fn paths_to_strings(dirs: &[PathBuf]) -> Vec<String> {
    dirs.iter().map(|p| p.to_string_lossy().to_string()).collect()
}

/// UninstallManager.getPlan().
fn get_plan(app: &tauri::AppHandle) -> Value {
    let data = data_directories(app);
    let cache = cache_directories(app);
    let config = config_directories();

    let mut total: u64 = 0;
    for d in data.iter().chain(cache.iter()).chain(config.iter()) {
        total += path_size(d);
    }

    let mut plan = json!({
        "platform": platform_string(),
        "dataDirectories": paths_to_strings(&data),
        "configDirectories": paths_to_strings(&config),
        "cacheDirectories": paths_to_strings(&cache),
        "totalSizeBytes": total,
    });

    if cfg!(target_os = "windows") {
        if let Some(o) = plan.as_object_mut() {
            o.insert(
                "registryKeys".into(),
                json!(["HKCU\\Software\\DEX", "HKLM\\Software\\DEX"]),
            );
        }
    }
    plan
}

/// UninstallManager.verifyUninstall().
fn verify(app: &tauri::AppHandle) -> Value {
    let mut remaining: Vec<String> = Vec::new();
    for d in data_directories(app)
        .iter()
        .chain(cache_directories(app).iter())
        .chain(config_directories().iter())
    {
        if d.exists() {
            remaining.push(d.to_string_lossy().to_string());
        }
    }
    json!({
        "clean": remaining.is_empty(),
        "remainingPaths": remaining,
    })
}

// --- dispatch ---------------------------------------------------------------

/// Route an `uninstall:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // CleanUninstallSystem — config (read defaults / persisted) + persist.
        "uninstall:config" => config_value(&read_tracking(app)),
        "uninstall:setConfig" => set_config(app, args),

        // CleanUninstallSystem — footprint tracking (all file-backed, native).
        "uninstall:footprint" => footprint_summary(app),
        "uninstall:preview" => preview_uninstall(app, args),
        "uninstall:listFiles" => list_files(app, args),
        "uninstall:trackFile" => track_file(app, args),
        "uninstall:exportUserData" => export_user_data(app, args),
        "uninstall:openFootprintLocation" => open_footprint_location(app),

        // UninstallManager — host-dir scans (native, read-only).
        "uninstall:get-plan" => get_plan(app),
        "uninstall:verify" => verify(app),

        // Not a real Electron handler in this repo.
        "uninstall:getStatus" => {
            json!({ "success": false, "error": "not ported (no such Electron handler)" })
        }

        // Destructive execute (deletes the whole app-data tree + modal dialog).
        // Refused, not faked: unsafe to run off a generic prefix passthrough with
        // no confirmation gate or live OS dialog.
        "uninstall:execute" | "uninstall:cleanup" | "uninstall:cleanUp" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}
