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
// HEAVY channels deliberately NOT ported (each needs a native runtime that does
// not exist in this data tier — filesystem copy/extract, require()-based module
// loading, sandbox activation, signature verification, registry network IO):
//   install, uninstall, enable, disable, execute (-command/-action), reload.
// They are omitted; the prefix route returns Value::Null for them (honest
// degrade) rather than faking a result.
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

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const PLUGINS_FILE: &str = "dex-plugins.json";

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// The `plugins` map from the store (default {} when unset / file missing).
fn plugins_map(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    read_file(app, PLUGINS_FILE)
        .get("plugins")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
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
    match channel {
        "plugins:list" => list_plugins(app),
        "plugins:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_plugin(app, id)
        }
        _ => Value::Null,
    }
}
