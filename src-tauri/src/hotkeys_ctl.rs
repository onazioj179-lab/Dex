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
// =============================================================================

use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "dex-hotkeys.json";
const BINDINGS_KEY: &str = "bindings";

// --- file IO (electron-store JSON under appData) ----------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
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

/// Route a `hotkeys:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the data/read channels are handled; every
/// other channel in the namespace (the register/unregister/remap family that
/// needs the OS globalShortcut runtime) returns Value::Null — an honest degrade
/// rather than a faked success.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "hotkeys:list" => list_bindings(app),
        "hotkeys:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_binding(app, id)
        }
        _ => Value::Null,
    }
}
