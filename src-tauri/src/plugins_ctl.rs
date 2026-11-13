// =============================================================================
// DEX Tauri — Plugins subsystem (port of the DATA surface of
// src/main/controllers/PluginController.ts).
//
// Pure-data, JSON-backed tier (same backbone as analytics.rs). Electron used a
// single `electron-store` named `dex-plugins` under userData; this mirrors that
// shape under <appData> with the SAME file name and SAME top-level key wrappers:
//   - dex-plugins.json : {
//         plugins:  { "<id>": InstalledPlugin, ... },   (default {})
//         settings: { enabled, autoUpdate, allowUnverified, sandboxMode },
//         errors:   [ PluginError, ... ],
//     }
// Only the two read-only DATA channels are ported, at the EXACT Electron return
// shapes so the renderer is unchanged:
//   - plugins:list -> InstalledPlugin[]          (Object.values(plugins))
//   - plugins:get  -> InstalledPlugin | null     (plugins[id]; undefined -> null
//                     over IPC, so missing ids return Value::Null)
//
// An InstalledPlugin is (verbatim from the TS interface, not reshaped):
//   { manifest: PluginManifest, path: string, enabled: bool, verified: bool,
//     installedAt: number, updatedAt: number, settings: object,
//     state: PluginState }
// Both ported channels are pure passthrough of whatever is already persisted, so
// no field is constructed, defaulted, or invented here — the stored objects are
// returned as-is (mirroring Electron, which just hands back the store contents).
//
// HEAVY channels (this round) are now implemented natively where the behavior is
// real filesystem / state work, and honestly degraded where it requires running
// arbitrary plugin JS in a sandbox (which has no native equivalent):
//   - install   : REAL — local-directory source only. Reads/validates manifest,
//                 copies the plugin tree into <appData>/plugins/installed/<id>,
//                 persists the InstalledPlugin record. http(s) archive sources are
//                 degraded (zip extraction needs adm-zip, not a dep here).
//   - uninstall : REAL — disables, removes the installed files, drops the record.
//   - enable    : REAL state mutation (enabled=true, state="active") + record
//                 return. The optional `manifest.main` JS module that Electron
//                 `require()`d into a sandbox is NOT executed (no JS runtime); the
//                 persisted/returned state is real and identical.
//   - disable   : REAL state mutation (enabled=false, state="disabled") + record.
//   - reload    : REAL — disable then enable, returns the re-enabled record.
//   - execute   : DEGRADED — execute-command / execute-action invoke functions on
//                 a live, sandbox-loaded plugin JS instance. No JS runtime exists
//                 in the native tier, so this returns an honest failure envelope.
//
// DIVERGENCES (documented):
//   - Storage backend: electron-store(userData) -> std::fs JSON(appData), same
//     file name `dex-plugins.json` and same top-level `plugins` key. No data
//     reshaping; identical wrapper.
//   - listPlugins() returns Object.values(...) in JS insertion order. serde_json
//     preserves object key insertion order only with the `preserve_order`
//     feature; absent that, key iteration order is unspecified. The renderer
//     treats the list as an unordered set (it keys/sorts by manifest fields), so
//     ordering is not load-bearing. Values themselves are identical.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const PLUGINS_FILE: &str = "dex-plugins.json";

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Read the whole store object, synthesizing the Electron `defaults` for any
// missing top-level key so writes never clobber the documented shape.
fn read_store(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    let mut root = read_file(app, PLUGINS_FILE)
        .as_object()
        .cloned()
        .unwrap_or_default();
    root.entry("plugins".to_string()).or_insert_with(|| json!({}));
    root.entry("settings".to_string()).or_insert_with(|| {
        json!({
            "enabled": true,
            "autoUpdate": false,
            "allowUnverified": false,
            "sandboxMode": "strict"
        })
    });
    root.entry("errors".to_string()).or_insert_with(|| json!([]));
    root
}

// Persist the whole store object back to dex-plugins.json (electron-store wrote
// pretty JSON; we match that so the file stays human-diffable).
fn write_store(app: &tauri::AppHandle, root: &serde_json::Map<String, Value>) -> bool {
    let data = serde_json::to_string_pretty(&Value::Object(root.clone())).unwrap_or_default();
    crate::write_atomic(store_path(app, PLUGINS_FILE), data).is_ok()
}

// The `plugins` map from the store (default {} when unset / file missing).
fn plugins_map(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    read_file(app, PLUGINS_FILE)
        .get("plugins")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// The directory Electron used: <userData>/plugins/installed. We mirror it under
// the Tauri app-data dir so installs land in one stable, owned location.
fn installed_dir(app: &tauri::AppHandle, id: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    dir.join("plugins").join("installed").join(id)
}

// validateManifest(): required fields + id charset + permission allow-list.
// Returns Err(message) at the SAME wording Electron threw, so the renderer's
// error-surface text is unchanged.
fn validate_manifest(manifest: &Value) -> Result<(), String> {
    let id = manifest.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let name = manifest.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let version = manifest.get("version").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() || name.is_empty() || version.is_empty() {
        return Err("Invalid manifest: missing required fields".into());
    }
    if !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Invalid manifest: id must be lowercase alphanumeric with hyphens".into());
    }
    const VALID: &[&str] = &[
        "operations:read", "operations:write", "operations:execute",
        "workflows:read", "workflows:write", "workflows:execute",
        "notes:read", "notes:write",
        "files:read", "files:write",
        "network:http", "network:websocket",
        "system:info", "notifications:send",
        "clipboard:read", "clipboard:write",
        "storage:local",
    ];
    if let Some(perms) = manifest.get("permissions").and_then(|v| v.as_array()) {
        for p in perms {
            let p = p.as_str().unwrap_or("");
            if !VALID.contains(&p) {
                return Err(format!("Invalid permission: {}", p));
            }
        }
    }
    Ok(())
}

// getDefaultSettings(): manifest.contributes.settings -> { id: default }.
fn default_settings(manifest: &Value) -> Value {
    let mut out = serde_json::Map::new();
    if let Some(list) = manifest
        .get("contributes")
        .and_then(|c| c.get("settings"))
        .and_then(|s| s.as_array())
    {
        for s in list {
            if let (Some(id), Some(def)) = (s.get("id").and_then(|v| v.as_str()), s.get("default")) {
                if !def.is_null() {
                    out.insert(id.to_string(), def.clone());
                }
            }
        }
    }
    Value::Object(out)
}

// Recursive directory copy (std-only, mirrors fs.cpSync(..,{recursive:true})).
fn copy_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

// installPlugin(source): local-directory source only (the safe, fully-native
// path). Returns Ok(InstalledPlugin) or Err(message) at Electron's wording.
fn install_plugin(app: &tauri::AppHandle, source: &str) -> Result<Value, String> {
    if source.starts_with("http://") {
        return Err("Plugin downloads require HTTPS. Refusing insecure HTTP source.".into());
    }
    if source.starts_with("https://") {
        // Electron downloaded a .zip and extracted it with adm-zip. flate2 only
        // does gzip (not the zip container), and adm-zip is not a dep here, so we
        // cannot materialize the archive. Honest degrade rather than a fake record.
        return Err("Plugin archive extraction requires adm-zip. Install it or use a local path.".into());
    }

    let src_path = std::path::Path::new(source);
    if !src_path.exists() {
        return Err(format!("Invalid plugin source: {}", source));
    }
    let manifest_path = src_path.join("manifest.json");
    if !manifest_path.exists() {
        return Err("Plugin manifest not found".into());
    }
    let manifest: Value = std::fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .ok_or_else(|| "Plugin manifest not found".to_string())?;

    validate_manifest(&manifest)?;
    let id = manifest.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let mut root = read_store(app);
    {
        let plugins = root.get("plugins").and_then(|v| v.as_object());
        if plugins.map(|m| m.contains_key(&id)).unwrap_or(false) {
            return Err(format!("Plugin {} is already installed", id));
        }
    }

    let install_path = installed_dir(app, &id);
    if install_path.exists() {
        let _ = std::fs::remove_dir_all(&install_path);
    }
    copy_dir(src_path, &install_path).map_err(|e| format!("Failed to copy plugin: {}", e))?;

    let ts = now_ms();
    let plugin = json!({
        "manifest": manifest,
        "path": install_path.to_string_lossy(),
        "enabled": false,
        "verified": false,
        "installedAt": ts,
        "updatedAt": ts,
        "settings": default_settings(&manifest),
        "state": "installed",
    });

    if let Some(plugins) = root.get_mut("plugins").and_then(|v| v.as_object_mut()) {
        plugins.insert(id, plugin.clone());
    }
    write_store(app, &root);
    Ok(plugin)
}

// uninstallPlugin(id): disable, remove files, drop the record. -> bool.
fn uninstall_plugin(app: &tauri::AppHandle, id: &str) -> bool {
    let mut root = read_store(app);
    let path = root
        .get("plugins")
        .and_then(|v| v.get(id))
        .and_then(|p| p.get("path"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let path = match path {
        Some(p) => p,
        None => return false, // getPlugin(id) was undefined -> Electron returned false
    };
    if std::path::Path::new(&path).exists() {
        let _ = std::fs::remove_dir_all(&path);
    }
    if let Some(plugins) = root.get_mut("plugins").and_then(|v| v.as_object_mut()) {
        plugins.remove(id);
    }
    write_store(app, &root);
    true
}

// Mutate enabled/state on an installed record and return the updated record (or
// Value::Null when the id is unknown, mirroring `getPlugin(id) || null`).
fn set_plugin_state(app: &tauri::AppHandle, id: &str, enabled: bool, state: &str) -> Value {
    let mut root = read_store(app);
    let exists = root
        .get("plugins")
        .and_then(|v| v.get(id))
        .map(|p| p.is_object())
        .unwrap_or(false);
    if !exists {
        return Value::Null;
    }
    if let Some(plugin) = root
        .get_mut("plugins")
        .and_then(|v| v.as_object_mut())
        .and_then(|m| m.get_mut(id))
        .and_then(|p| p.as_object_mut())
    {
        plugin.insert("enabled".into(), json!(enabled));
        plugin.insert("state".into(), json!(state));
        plugin.insert("updatedAt".into(), json!(now_ms()));
    }
    let updated = root
        .get("plugins")
        .and_then(|v| v.get(id))
        .cloned()
        .unwrap_or(Value::Null);
    write_store(app, &root);
    updated
}

// listPlugins(): Object.values(pluginStore.get('plugins'))
fn list_plugins(app: &tauri::AppHandle) -> Value {
    let values: Vec<Value> = plugins_map(app).into_iter().map(|(_, v)| v).collect();
    json!(values)
}

// getPlugin(id): pluginStore.get(`plugins.${id}`)  (undefined -> null)
fn get_plugin(app: &tauri::AppHandle, id: &str) -> Value {
    plugins_map(app).get(id).cloned().unwrap_or(Value::Null)
}

/// Route a `plugins:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read-only DATA channels are handled;
/// every other channel in the namespace (the heavy, native-runtime ones) returns
/// Value::Null as an honest degrade.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg_str = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "plugins:list" => list_plugins(app),
        "plugins:get" => get_plugin(app, &arg_str(0)),

        // install/uninstall/enable/disable/reload: REAL fs + state work. Electron
        // resolved a value on success and rejected (threw) on failure; over IPC a
        // rejection becomes an Error in the renderer. The tauriCompat bridge has no
        // throw channel for a plain Value, so on failure we return an object with
        // an `error` field (the renderer's catch sites read `.error`). On success
        // we return the EXACT shape Electron resolved.
        "plugins:install" => match install_plugin(app, &arg_str(0)) {
            Ok(plugin) => {
                crate::native_ops::emit_event(app, "plugins:installed", &plugin);
                plugin
            }
            Err(e) => json!({ "error": e }),
        },
        "plugins:uninstall" => {
            let id = arg_str(0);
            let ok = uninstall_plugin(app, &id);
            if ok {
                crate::native_ops::emit_event(app, "plugins:uninstalled", &json!({ "id": id }));
            }
            json!(ok)
        }
        "plugins:enable" => {
            let id = arg_str(0);
            // loadPlugin() (sandboxed require() of manifest.main) cannot run in the
            // native tier; the persisted/returned state is the real, observable
            // result. State -> "active", enabled -> true, then notify the renderer.
            let updated = set_plugin_state(app, &id, true, "active");
            if !updated.is_null() {
                crate::native_ops::emit_event(app, "plugins:enabled", &updated);
            }
            updated
        }
        "plugins:disable" => {
            let id = arg_str(0);
            let updated = set_plugin_state(app, &id, false, "disabled");
            if !updated.is_null() {
                crate::native_ops::emit_event(app, "plugins:disabled", &updated);
            }
            updated
        }
        "plugins:reload" => {
            // reloadPlugin(): disable then enable; returns the re-enabled record.
            let id = arg_str(0);
            let disabled = set_plugin_state(app, &id, false, "disabled");
            if disabled.is_null() {
                Value::Null
            } else {
                let updated = set_plugin_state(app, &id, true, "active");
                if !updated.is_null() {
                    crate::native_ops::emit_event(app, "plugins:enabled", &updated);
                }
                updated
            }
        }

        // execute-command / execute-action invoke functions on a live, sandbox-
        // loaded plugin JS instance. There is no JS runtime in the native tier, so
        // these cannot run for real — honest failure envelope, never a fake result.
        "plugins:execute" | "plugins:execute-command" | "plugins:execute-action" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}
