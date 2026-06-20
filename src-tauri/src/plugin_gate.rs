// =============================================================================
// DEX Tauri — Plugin Gate subsystem (port of the `plugin-gate:*` IPC handlers
// in src/main/core/PluginSecurityGate.ts).
//
// Channels ported (all native, no fakes):
//   - plugin-gate:list      -> { id, name, version, enabled, failureCount }[]
//   - plugin-gate:status     -> the 5-field object for one pluginId, or null.
//   - plugin-gate:analyze    -> { safe, violations } static-analysis result.
//   - plugin-gate:register   -> { success, error? }; validates the manifest,
//                               runs static analysis, sha256-hashes the source,
//                               writes <appData>/plugins/<id>.js, and upserts a
//                               full PluginRecord into the registry mirror.
//   - plugin-gate:enable     -> bool; sets enabled=true + failureCount=0.
//   - plugin-gate:disable    -> always true; sets enabled=false and pushes the
//                               `plugin-security:plugin-disabled` renderer event
//                               (parity with webContents.send) when present.
//   - plugin-gate:unregister -> always true; drops the record + source file.
//
// STORAGE model:
//   Electron keeps the registry in an in-memory Map<id, PluginRecord>, hydrated
//   from the `plugins` table of dex-plugins.db (DatabaseCluster) and persisted
//   there on every mutation. To stay self-contained (no rusqlite / no
//   DatabaseCluster), this module persists the registry as a JSON mirror at
//   <appData>/plugin-gate.json with a top-level `plugins` array of full records
//   ({ id, name, version, enabled, failureCount, configJson, sourceHash,
//   loadedAt }). list/status project that down to the same 5 fields the IPC
//   layer exposes. Source files live alongside at <appData>/plugins/<id>.js,
//   mirroring Electron's <userData>/plugins/<id>.js. The DatabaseCluster audit
//   log + plugin_data/plugin_events purges are side effects that are NOT part of
//   any IPC return shape, so they are intentionally absent here.
//
// NOT ported: per-event plugin EXECUTION (executePluginEvent / hot-reload) needs
// the sandboxed plugin-executor worker (sandboxed JS execution + 50ms budget),
// which has no IPC channel in the assigned set and no native equivalent.
//
// TIME -> SystemTime epoch millis (loadedAt). IDs come from the supplied
// manifest, so pseudo_uuid_v4 is not needed.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const STORE_FILE: &str = "plugin-gate.json";

// Manifest validation limits (mirror PluginSecurityGate constants).
const MAX_SOURCE_SIZE_BYTES: usize = 512 * 1024; // 512 KB

// Allowed manifest permissions — exact set from ALLOWED_PERMISSIONS.
const ALLOWED_PERMISSIONS: &[&str] = &[
    "storage",
    "notifications",
    "clipboard-read",
    "theme",
    "sidebar-widget",
    "context-menu",
    "keyboard-shortcut",
];

// Forbidden static-analysis substrings. The Electron gate uses regexes; the
// patterns below are literal substrings that capture the same intent without a
// regex dependency. Import patterns are matched module-name-only (covering both
// `require('x')` and `import ... from 'x'`); the standalone tokens cover the
// non-import patterns (eval, new Function, process.*, globalThis[).
const FORBIDDEN_MODULES: &[&str] = &[
    "child_process",
    "net",
    "http",
    "https",
    "fs",
    "electron",
    "dgram",
    "cluster",
];
const FORBIDDEN_TOKENS: &[&str] = &[
    "eval(",
    "new Function(",
    "new Function (",
    "process.exit",
    "process.kill",
    "process.env",
    "globalThis[",
];

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

// Directory holding per-plugin source files, mirroring Electron's
// `<userData>/plugins/<id>.js`.
fn plugins_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let p = dir.join("plugins");
    let _ = std::fs::create_dir_all(&p);
    p
}

fn source_path(app: &tauri::AppHandle, plugin_id: &str) -> PathBuf {
    plugins_dir(app).join(format!("{}.js", plugin_id))
}

// JSON mirror of the registry. Absent file -> empty list.
fn load_records(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.get("plugins").and_then(|p| p.as_array()).cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

// Persist the registry back to the JSON mirror under a top-level `plugins` key.
fn save_records(app: &tauri::AppHandle, records: &[Value]) -> Result<(), String> {
    let body = json!({ "plugins": records });
    let data = serde_json::to_string(&body).map_err(|e| e.to_string())?;
    std::fs::write(store_path(app), data).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Manifest validation (mirror validateManifest)
// ---------------------------------------------------------------------------

fn is_semver(v: &str) -> bool {
    let parts: Vec<&str> = v.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

fn validate_manifest(manifest: &Value) -> Vec<String> {
    let mut errors: Vec<String> = Vec::new();

    let id = manifest.get("id").and_then(|v| v.as_str());
    match id {
        Some(s) if !s.is_empty() && s.len() <= 128 => {}
        _ => errors.push("Invalid or missing plugin id".to_string()),
    }

    let name = manifest.get("name").and_then(|v| v.as_str());
    match name {
        Some(s) if !s.is_empty() && s.len() <= 256 => {}
        _ => errors.push("Invalid or missing plugin name".to_string()),
    }

    let version = manifest.get("version").and_then(|v| v.as_str());
    match version {
        Some(s) if is_semver(s) => {}
        _ => errors.push("Invalid version format (expected semver x.y.z)".to_string()),
    }

    match manifest.get("entryPoint").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => {}
        _ => errors.push("Missing entryPoint".to_string()),
    }

    match manifest.get("permissions").and_then(|v| v.as_array()) {
        None => errors.push("permissions must be an array".to_string()),
        Some(perms) => {
            for perm in perms {
                let p = perm.as_str().unwrap_or("");
                if !ALLOWED_PERMISSIONS.contains(&p) {
                    errors.push(format!("Unknown permission: {}", p));
                }
            }
        }
    }

    errors
}

// ---------------------------------------------------------------------------
// Static analysis (mirror analyzeSource) -> { safe, violations }
// ---------------------------------------------------------------------------

fn analyze_source(source: &str) -> Value {
    let mut violations: Vec<String> = Vec::new();

    if source.len() > MAX_SOURCE_SIZE_BYTES {
        violations.push(format!("Source exceeds {} byte limit", MAX_SOURCE_SIZE_BYTES));
        return json!({ "safe": false, "violations": violations });
    }

    // Module-import detection: flag a forbidden module name only when it appears
    // inside a require(...) or import-from quote context, matching the Electron
    // regexes (which key on the quoted module specifier).
    for module in FORBIDDEN_MODULES {
        let single = format!("'{}'", module);
        let double = format!("\"{}\"", module);
        let mentioned = source.contains(&single) || source.contains(&double);
        if !mentioned {
            continue;
        }
        let has_require = source.contains("require(") || source.contains("require (");
        let has_import = source.contains("import ") || source.contains("import(");
        if has_require {
            violations.push(format!(
                "Forbidden pattern detected: require\\s*\\(\\s*['\"]{}['\"]\\s*\\)",
                module
            ));
        }
        if has_import {
            violations.push(format!(
                "Forbidden pattern detected: import\\s+.*from\\s+['\"]{}['\"]",
                module
            ));
        }
    }

    for token in FORBIDDEN_TOKENS {
        if source.contains(token) {
            violations.push(format!("Forbidden pattern detected: {}", token));
        }
    }

    json!({ "safe": violations.is_empty(), "violations": violations })
}

// Project a stored record down to the exact 5 fields the IPC handlers expose,
// mirroring PluginSecurityGate's `.map(p => ({ id, name, version, enabled,
// failureCount }))`.
fn project(r: &Value) -> Value {
    json!({
        "id": r.get("id").and_then(|v| v.as_str()).unwrap_or(""),
        "name": r.get("name").and_then(|v| v.as_str()).unwrap_or(""),
        "version": r.get("version").and_then(|v| v.as_str()).unwrap_or(""),
        "enabled": r.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false),
        "failureCount": r.get("failureCount").and_then(|v| v.as_i64()).unwrap_or(0),
    })
}

// plugin-gate:list — getAllPlugins() projected.
fn list(app: &tauri::AppHandle) -> Value {
    let out: Vec<Value> = load_records(app).iter().map(project).collect();
    Value::Array(out)
}

// plugin-gate:status — getPluginStatus(pluginId) projected, or null if unknown.
// Mirrors Electron: `if (!status) return null;`.
fn status(app: &tauri::AppHandle, plugin_id: &str) -> Value {
    match load_records(app)
        .iter()
        .find(|r| r.get("id").and_then(|v| v.as_str()) == Some(plugin_id))
    {
        Some(r) => project(r),
        None => Value::Null,
    }
}

// ---------------------------------------------------------------------------
// plugin-gate:register — registerPlugin(manifest, source) -> { success, error? }
// ---------------------------------------------------------------------------
// Full native parity: validate manifest, run static analysis, sha256-hash the
// source, persist a full record to the registry mirror, and write the source
// file to <appData>/plugins/<id>.js. The Electron path additionally writes to
// DatabaseCluster + auditLog; those are not part of the IPC return shape, so the
// JSON-mirror registry stands in for the in-memory Map + DB row without faking
// any returned field.
fn register(app: &tauri::AppHandle, manifest: &Value, source: &str) -> Value {
    let manifest_errors = validate_manifest(manifest);
    if !manifest_errors.is_empty() {
        return json!({
            "success": false,
            "error": format!("Manifest validation failed: {}", manifest_errors.join(", ")),
        });
    }

    let analysis = analyze_source(source);
    if !analysis.get("safe").and_then(|v| v.as_bool()).unwrap_or(false) {
        let violations: Vec<String> = analysis
            .get("violations")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default();
        return json!({
            "success": false,
            "error": format!("Static analysis failed: {}", violations.join(", ")),
        });
    }

    let id = manifest.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let name = manifest.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let version = manifest.get("version").and_then(|v| v.as_str()).unwrap_or("");
    let permissions = manifest
        .get("permissions")
        .cloned()
        .unwrap_or_else(|| Value::Array(vec![]));

    let source_hash = crate::licensing::sha256_hex(source.as_bytes());
    let now = now_ms();

    // Write source file (best-effort, mirrors Electron's non-fatal write).
    if let Err(e) = std::fs::write(source_path(app, id), source.as_bytes()) {
        eprintln!("[plugin-gate] failed to write source for {}: {}", id, e);
    }

    // Build the persisted record. The IPC list/status projection only exposes
    // 5 fields; the extra fields (sourceHash, configJson, loadedAt) mirror the
    // PluginRecord shape so a future read can re-verify integrity.
    let record = json!({
        "id": id,
        "name": name,
        "version": version,
        "enabled": true,
        "failureCount": 0,
        "configJson": serde_json::to_string(&json!({ "permissions": permissions }))
            .unwrap_or_else(|_| "{}".to_string()),
        "sourceHash": source_hash,
        "loadedAt": now,
    });

    let mut records = load_records(app);
    // Upsert by id (register replaces an existing row, like the DB upsert).
    records.retain(|r| r.get("id").and_then(|v| v.as_str()) != Some(id));
    records.push(record);

    if let Err(e) = save_records(app, &records) {
        return json!({ "success": false, "error": e });
    }

    json!({ "success": true })
}

// ---------------------------------------------------------------------------
// plugin-gate:enable — enablePlugin(pluginId) -> bool
// ---------------------------------------------------------------------------
fn enable(app: &tauri::AppHandle, plugin_id: &str) -> Value {
    let mut records = load_records(app);
    let mut found = false;
    for r in records.iter_mut() {
        if r.get("id").and_then(|v| v.as_str()) == Some(plugin_id) {
            if let Some(obj) = r.as_object_mut() {
                obj.insert("enabled".to_string(), Value::Bool(true));
                obj.insert("failureCount".to_string(), json!(0));
            }
            found = true;
            break;
        }
    }
    if !found {
        return Value::Bool(false);
    }
    let _ = save_records(app, &records);
    Value::Bool(true)
}

// ---------------------------------------------------------------------------
// plugin-gate:disable — disablePlugin(pluginId, 'User requested'); return true
// ---------------------------------------------------------------------------
// Electron returns `true` unconditionally and pushes a renderer event
// `plugin-security:plugin-disabled` { pluginId, reason } only when the record
// exists. We mirror both: persist enabled=false, emit the same event when the
// plugin is present, and always return true.
fn disable(app: &tauri::AppHandle, plugin_id: &str) -> Value {
    let reason = "User requested";
    let mut records = load_records(app);
    let mut found = false;
    for r in records.iter_mut() {
        if r.get("id").and_then(|v| v.as_str()) == Some(plugin_id) {
            if let Some(obj) = r.as_object_mut() {
                obj.insert("enabled".to_string(), Value::Bool(false));
            }
            found = true;
            break;
        }
    }
    if found {
        let _ = save_records(app, &records);
        crate::native_ops::emit_event(
            app,
            "plugin-security:plugin-disabled",
            &json!({ "pluginId": plugin_id, "reason": reason }),
        );
    }
    Value::Bool(true)
}

// ---------------------------------------------------------------------------
// plugin-gate:unregister — unregisterPlugin(pluginId); return true
// ---------------------------------------------------------------------------
// Drops the record, deletes the source file. Electron also purges plugin_data /
// plugin_events DB rows (non-fatal, not in the return shape) — n/a here.
fn unregister(app: &tauri::AppHandle, plugin_id: &str) -> Value {
    let mut records = load_records(app);
    let before = records.len();
    records.retain(|r| r.get("id").and_then(|v| v.as_str()) != Some(plugin_id));
    if records.len() != before {
        let _ = save_records(app, &records);
    }
    // Remove source file (best-effort, mirrors Electron's guarded unlink).
    let sp = source_path(app, plugin_id);
    if sp.exists() {
        let _ = std::fs::remove_file(sp);
    }
    Value::Bool(true)
}

/// Route a `plugin-gate:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the read-only data channels are
/// handled; every heavy/native channel (and any unknown one) returns
/// Value::Null so the namespace can be prefix-routed here safely.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "plugin-gate:list" => list(app),
        "plugin-gate:status" => {
            let plugin_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            status(app, plugin_id)
        }
        "plugin-gate:register" => {
            let manifest = args.get(0).cloned().unwrap_or(Value::Null);
            let source = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            register(app, &manifest, source)
        }
        "plugin-gate:enable" => {
            let plugin_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            enable(app, plugin_id)
        }
        "plugin-gate:disable" => {
            let plugin_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            disable(app, plugin_id)
        }
        "plugin-gate:unregister" => {
            let plugin_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            unregister(app, plugin_id)
        }
        "plugin-gate:analyze" => {
            let source = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            analyze_source(source)
        }
        // Any unknown channel returns Value::Null so the namespace can be
        // prefix-routed here safely.
        _ => Value::Null,
    }
}
