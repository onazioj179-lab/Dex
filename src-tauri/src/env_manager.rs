// =============================================================================
// DEX Tauri — Environment Variables subsystem (port of EnvController.ts, Tier 5/44)
// System env is read-only (process env snapshot); DEX-managed overlays (global +
// per-app) persist to <appData>/dex-env.json. Return shapes match Electron.
// =============================================================================

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::Manager;

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("dex-env.json")
}

fn read_managed(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(v) => json!({
                "global": v.get("global").cloned().unwrap_or_else(|| json!({})),
                "apps": v.get("apps").cloned().unwrap_or_else(|| json!({})),
            }),
            Err(_) => json!({ "global": {}, "apps": {} }),
        },
        Err(_) => json!({ "global": {}, "apps": {} }),
    }
}

fn write_managed(app: &tauri::AppHandle, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app), s).is_ok(),
        Err(_) => false,
    }
}

fn valid_name(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn ok(message: &str) -> Value { json!({ "success": true, "message": message }) }
fn fail(message: &str) -> Value { json!({ "success": false, "message": message }) }

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "env:listSystem" => {
            // BTreeMap keeps it sorted by name, matching the Electron sort.
            let map: BTreeMap<String, String> = std::env::vars().collect();
            let list: Vec<Value> = map.into_iter().map(|(name, value)| json!({ "name": name, "value": value })).collect();
            json!(list)
        }
        "env:getManaged" => read_managed(app),
        "env:setManaged" => {
            let scope = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let name = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let value = args.get(2).and_then(|v| v.as_str());
            if !valid_name(name) {
                return fail("Invalid name. Use letters, digits, and underscores; cannot start with a digit.");
            }
            let value = match value { Some(v) => v, None => return fail("Value must be a string") };
            if scope.is_empty() { return fail("Invalid scope"); }
            let mut data = read_managed(app);
            if scope == "global" {
                data["global"][name] = json!(value);
            } else {
                if !data["apps"].get(scope).map(|v| v.is_object()).unwrap_or(false) {
                    data["apps"][scope] = json!({});
                }
                data["apps"][scope][name] = json!(value);
            }
            if write_managed(app, &data) { ok("Saved") } else { fail("Could not persist") }
        }
        "env:deleteManaged" => {
            let scope = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let name = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let mut data = read_managed(app);
            if scope == "global" {
                if let Some(obj) = data["global"].as_object_mut() { obj.remove(name); }
            } else if let Some(app_obj) = data["apps"].get_mut(scope).and_then(|v| v.as_object_mut()) {
                app_obj.remove(name);
                if app_obj.is_empty() {
                    if let Some(apps) = data["apps"].as_object_mut() { apps.remove(scope); }
                }
            }
            if write_managed(app, &data) { ok("Removed") } else { fail("Could not persist") }
        }
        _ => Value::Null,
    }
}
