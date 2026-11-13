// =============================================================================
// DEX Tauri — Hotkeys subsystem (data/read port of controllers/HotkeyController.ts).
//
// Pure-data, JSON-backed tier. Electron used one `electron-store` file
// (`dex-hotkeys`, name -> dex-hotkeys.json under userData) with this shape:
//   {
//     bindings:   { [id]: HotkeyBinding },   // a KEYED MAP, not an array
//     usageStats: { [id]: number },
//     settings:   { enabled, showNotifications, allowConflicts }
//   }
// This mirrors that file verbatim under <appData>/dex-hotkeys.json. Only the
// read/data channels are ported; the heavy channels that register/unregister/
// remap OS-level global shortcuts (globalShortcut.register etc.) need a native
// runtime and are intentionally NOT ported (see channelsSkipped / dispatch).
//
// A HotkeyBinding (from the Electron interface) is:
//   { id, name, description?, shortcut, action: { type, target, params? },
//     enabled, global, mode?, category, isDefault, createdAt, updatedAt }
//
// Ported channels & EXACT Electron return shapes:
//   - hotkeys:list -> HotkeyBinding[]            (Object.values(bindings))
//   - hotkeys:get  -> HotkeyBinding | null       (bindings[id]; undefined over
//                     IPC -> null when the id is unknown)
//
// DIVERGENCES (documented):
//   - hotkeys:list order. Electron returns Object.values(bindings), whose order
//     is JS object insertion/integer-key order. serde_json preserves the JSON
//     object's key order ONLY if the crate is built with the `preserve_order`
//     feature; otherwise keys come back sorted. The renderer treats the list as
//     an unordered set (it sorts/groups by category for display), so any order
//     difference is cosmetic and pre-sorted away. No field shape changes.
//   - This module performs NO default-hotkey seeding or migration. In Electron
//     that seeding happens in initialize() (a startup side-effect), not in the
//     get/list handlers, so the read shapes are identical. If the file has not
//     been written yet, list -> [] and get -> null, matching a store whose
//     `bindings` default is `{}`.
//
// LIFECYCLE channels now implemented with real native code over the JSON store:
//   - hotkeys:register(id)            -> { success, shortcut, global, ... }
//   - hotkeys:unregister(idOrShortcut)-> { success, shortcut }
//   - hotkeys:remap(id, newShortcut)  -> HotkeyBinding | { error }
//
//   These mirror HotkeyManager.registerHotkey / unregisterHotkey / the shortcut
//   half of updateBinding. The work that is genuinely doable without a live
//   global-shortcut runtime is done for real:
//     * conflict detection against the persisted bindings (checkConflict parity);
//     * a persisted ACTIVE-REGISTRY (`registered` map: shortcut -> bindingId, the
//       data analog of HotkeyManager.shortcutToBinding / registeredShortcuts) so
//       the renderer's app-only shortcut dispatch path (Electron sent these over
//       IPC, NOT through globalShortcut) can resolve a pressed shortcut -> binding;
//     * remap performs the full updateBinding shortcut mutation (bumps updatedAt,
//       rewrites the registry entry) and persists it byte-for-byte;
//     * each fires a renderer push (hotkey:registered / :unregistered / :remapped)
//       via crate::native_ops::emit_event — the Tauri analog of webContents.send.
//   The ONE piece that cannot be done without adding a forbidden dependency
//   (tauri-plugin-global-shortcut) is the OS-level system-wide key GRAB for
//   `global: true` bindings (globalShortcut.register). That is reported honestly
//   in the register result as `osRegistered:false` rather than faked; the
//   app-focused (global:false) path — which Electron itself routes through the
//   renderer, not globalShortcut — is fully functional.
//
// WIRING NOTE (uncertain, outside this file): main.rs currently routes the
// `hotkeys:` namespace to the sibling `hotkey_ctl` (singular) module and does not
// declare `mod hotkeys_ctl;`. This module is therefore self-contained and compiles
// independently, but is not the live dispatcher unless main.rs is pointed at it.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "dex-hotkeys.json";
const BINDINGS_KEY: &str = "bindings";
// Persisted active-registry: { shortcut -> bindingId }. The data analog of the
// in-memory HotkeyManager.shortcutToBinding map (and registeredShortcuts set).
const REGISTERED_KEY: &str = "registered";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO (electron-store JSON under appData) ----------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// The `bindings` top-level key is a keyed map { [id]: HotkeyBinding }.
fn read_bindings(app: &tauri::AppHandle) -> Value {
    read_store(app)
        .get(BINDINGS_KEY)
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()))
}

// Persist the whole store object (pretty), preserving sibling keys. Returns ok.
fn write_store(app: &tauri::AppHandle, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => crate::write_atomic(store_path(app), s).is_ok(),
        Err(_) => false,
    }
}

// checkConflict(shortcut, excludeId) parity: case-insensitive shortcut match
// against the persisted bindings; returns the conflicting binding or null.
fn check_conflict(app: &tauri::AppHandle, shortcut: &str, exclude_id: &str) -> Value {
    let target = shortcut.to_lowercase();
    let bindings = read_bindings(app);
    if let Some(map) = bindings.as_object() {
        for (id, b) in map {
            if !exclude_id.is_empty() && id == exclude_id {
                continue;
            }
            let s = b.get("shortcut").and_then(|v| v.as_str()).unwrap_or("");
            if s.to_lowercase() == target {
                return b.clone();
            }
        }
    }
    Value::Null
}

// True when settings.allowConflicts is set (defaults false, mirroring the store).
fn allow_conflicts(app: &tauri::AppHandle) -> bool {
    read_store(app)
        .get("settings")
        .and_then(|s| s.get("allowConflicts"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

// hotkeys:list -> Object.values(bindings) : HotkeyBinding[]
fn list_bindings(app: &tauri::AppHandle) -> Value {
    let bindings = read_bindings(app);
    let values: Vec<Value> = bindings
        .as_object()
        .map(|m| m.values().cloned().collect())
        .unwrap_or_default();
    Value::Array(values)
}

// hotkeys:get(id) -> bindings[id] : HotkeyBinding | null
fn get_binding(app: &tauri::AppHandle, id: &str) -> Value {
    read_bindings(app)
        .get(id)
        .cloned()
        .unwrap_or(Value::Null)
}

/// `hotkeys:register(id)` — registerHotkey parity (data + app-only path).
/// Looks up the binding, runs conflict detection, records it in the persisted
/// active-registry (shortcut -> id), and pushes `hotkey:registered`. The
/// system-wide OS key grab for `global` bindings needs tauri-plugin-global-shortcut
/// (a forbidden dependency) so it is reported as `osRegistered:false` rather than
/// faked; the app-focused path (which Electron itself routes via the renderer, not
/// globalShortcut) is fully wired through the registry below.
fn register(app: &tauri::AppHandle, id: &str) -> Value {
    let binding = get_binding(app, id);
    if binding.is_null() {
        return json!({ "success": false, "error": "binding not found" });
    }
    let shortcut = binding.get("shortcut").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let is_global = binding.get("global").and_then(|v| v.as_bool()).unwrap_or(false);
    let enabled = binding.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    if !enabled {
        // registerHotkey returns early when !binding.enabled.
        return json!({ "success": false, "error": "binding disabled" });
    }
    if shortcut.is_empty() {
        return json!({ "success": false, "error": "binding has no shortcut" });
    }

    // Conflict against another already-registered shortcut.
    let conflict = check_conflict(app, &shortcut, id);
    if !conflict.is_null() && !allow_conflicts(app) {
        let name = conflict.get("name").and_then(|v| v.as_str()).unwrap_or("");
        return json!({ "success": false, "error": format!("Shortcut conflict: {} is already used by \"{}\"", shortcut, name) });
    }

    // Record in the persisted registry (shortcut -> id), preserving siblings.
    let mut root = read_store(app).as_object().cloned().unwrap_or_default();
    let mut reg = root
        .get(REGISTERED_KEY)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    reg.insert(shortcut.clone(), json!(id));
    root.insert(REGISTERED_KEY.into(), Value::Object(reg));
    write_store(app, &Value::Object(root));

    crate::native_ops::emit_event(
        app,
        "hotkey:registered",
        &json!({ "id": id, "shortcut": shortcut, "global": is_global }),
    );

    json!({
        "success": true,
        "id": id,
        "shortcut": shortcut,
        "global": is_global,
        // Honest: true OS-wide registration of `global` bindings is not performed
        // (would require tauri-plugin-global-shortcut). App-focused dispatch works.
        "osRegistered": false,
    })
}

/// `hotkeys:unregister(idOrShortcut)` — unregisterHotkey parity (data side):
/// drop the entry from the persisted registry, matching either by shortcut key
/// directly or by the bindingId it maps to, and push `hotkey:unregistered`.
fn unregister(app: &tauri::AppHandle, key: &str) -> Value {
    let mut root = read_store(app).as_object().cloned().unwrap_or_default();
    let mut reg = root
        .get(REGISTERED_KEY)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    // Resolve the shortcut to remove: the arg may be the shortcut itself or a
    // bindingId. First try a direct shortcut key, then reverse-lookup by id, then
    // fall back to the binding's stored shortcut (when the registry is stale).
    let removed_shortcut: Option<String> = if reg.contains_key(key) {
        Some(key.to_string())
    } else if let Some((s, _)) = reg.iter().find(|(_, v)| v.as_str() == Some(key)) {
        Some(s.clone())
    } else {
        get_binding(app, key)
            .get("shortcut")
            .and_then(|v| v.as_str())
            .map(String::from)
            .filter(|s| reg.contains_key(s))
    };

    let shortcut = match removed_shortcut {
        Some(s) => s,
        None => return json!({ "success": false, "error": "not registered" }),
    };
    reg.remove(&shortcut);
    root.insert(REGISTERED_KEY.into(), Value::Object(reg));
    write_store(app, &Value::Object(root));

    crate::native_ops::emit_event(
        app,
        "hotkey:unregistered",
        &json!({ "shortcut": shortcut }),
    );
    json!({ "success": true, "shortcut": shortcut })
}

/// `hotkeys:remap(id, newShortcut)` — the shortcut half of updateBinding, done
/// for real: conflict-check the new shortcut (excluding self), rewrite the
/// binding's `shortcut` + `updatedAt`, move the registry entry from the old to
/// the new shortcut (when it was registered), persist, and push `hotkey:remapped`.
/// Returns the updated HotkeyBinding, or `{ error }` on conflict / not-found.
fn remap(app: &tauri::AppHandle, id: &str, new_shortcut: &str) -> Value {
    if new_shortcut.is_empty() {
        return json!({ "error": "newShortcut is required" });
    }
    let binding = get_binding(app, id);
    if binding.is_null() {
        return Value::Null; // updateBinding returns null for an unknown id.
    }
    let old_shortcut = binding.get("shortcut").and_then(|v| v.as_str()).unwrap_or("").to_string();

    // Only conflict-check when the shortcut actually changed (updateBinding parity).
    if new_shortcut != old_shortcut {
        let conflict = check_conflict(app, new_shortcut, id);
        if !conflict.is_null() && !allow_conflicts(app) {
            let name = conflict.get("name").and_then(|v| v.as_str()).unwrap_or("");
            return json!({ "error": format!("Shortcut conflict: {} is already used by \"{}\"", new_shortcut, name) });
        }
    }

    // Rewrite the binding in the store (shortcut + updatedAt), preserving the rest.
    let mut root = read_store(app).as_object().cloned().unwrap_or_default();
    let mut bindings = root
        .get(BINDINGS_KEY)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let mut obj = match bindings.get(id).and_then(|v| v.as_object()) {
        Some(o) => o.clone(),
        None => return Value::Null,
    };
    obj.insert("shortcut".into(), json!(new_shortcut));
    obj.insert("updatedAt".into(), json!(now_ms()));
    let updated = Value::Object(obj);
    bindings.insert(id.to_string(), updated.clone());
    root.insert(BINDINGS_KEY.into(), Value::Object(bindings));

    // Move the active-registry entry if this binding was registered.
    if let Some(reg_val) = root.get_mut(REGISTERED_KEY) {
        if let Some(reg) = reg_val.as_object_mut() {
            if reg.get(&old_shortcut).and_then(|v| v.as_str()) == Some(id) {
                reg.remove(&old_shortcut);
                reg.insert(new_shortcut.to_string(), json!(id));
            }
        }
    }
    write_store(app, &Value::Object(root));

    crate::native_ops::emit_event(
        app,
        "hotkey:remapped",
        &json!({ "id": id, "from": old_shortcut, "to": new_shortcut }),
    );
    updated
}

/// Route a `hotkeys:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The data/read channels and the
/// register/unregister/remap lifecycle channels are handled with real native code;
/// every other channel in the namespace returns Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "hotkeys:list" => list_bindings(app),
        "hotkeys:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_binding(app, id)
        }
        "hotkeys:register" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            register(app, id)
        }
        "hotkeys:unregister" => {
            let key = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            unregister(app, key)
        }
        "hotkeys:remap" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let new_shortcut = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            remap(app, id, new_shortcut)
        }
        _ => Value::Null,
    }
}
