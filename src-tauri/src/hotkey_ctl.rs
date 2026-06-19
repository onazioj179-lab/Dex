// =============================================================================
// DEX Tauri — Hotkey subsystem (port of HotkeyController.ts, data tier only).
//
// Pure-data, JSON-backed tier. Electron used an `electron-store` named
// `dex-hotkeys` under userData; this mirrors that shape under <appData>:
//   - dex-hotkeys.json : {
//       bindings: { [id]: HotkeyBinding },
//       usageStats: { [id]: number },
//       settings: { enabled, showNotifications, allowConflicts }
//     }
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// A HotkeyBinding is:
//   { id, name, description?, shortcut, action: { type, target, params? },
//     enabled, global, mode?, category, isDefault, createdAt, updatedAt }
//
// PORTED data channels:
//   - hotkeys:list -> HotkeyBinding[]        (Object.values(bindings))
//   - hotkeys:get  -> HotkeyBinding | null   (bindings[id], or undefined -> null)
//
// DEFAULTS divergence (documented): in Electron the `bindings` map is empty {}
// until `HotkeyManager.initialize()` runs `initializeDefaultHotkeys()` at app
// startup (which also registers OS-level global shortcuts). The default SEEDING
// is pure data, and the renderer expects the defaults to be present when it reads
// list/get. We therefore reproduce ONLY the data half of that seeding lazily on
// read: if the stored bindings contain no `isDefault` entry, we materialize the
// DEFAULT_HOTKEYS (ids `hotkey-default-<index>`, createdAt/updatedAt = now) and
// persist them before answering — byte-for-byte the same records Electron writes.
// The shortcut REGISTRATION side-effect (globalShortcut.register) is a live
// native-runtime concern with no effect on the returned data and is not done
// here. The `migrateConflictingHotkeys` step is also a write-side concern tied
// to startup; it is not reproduced because it only rewrites pre-existing user
// data that this read-only port never created, and applying it would mutate
// stored state outside the two channels we own.
//
// HEAVY channels (register / unregister / remap and the other lifecycle/mutation
// handlers: create, update, delete, toggle, check-conflict, reset-defaults,
// get-stats, get-settings, update-settings, record) are NOT ported: they either
// require the OS globalShortcut runtime or are write/mutation paths outside this
// data-surface task. Unknown channels return Value::Null (honest degrade).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "dex-hotkeys.json";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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

fn write_store(app: &tauri::AppHandle, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app), s).is_ok(),
        Err(_) => false,
    }
}

// DEFAULT_HOTKEYS (data half), in the exact order Electron seeds them so the
// generated ids (`hotkey-default-<index>`) line up. Each entry is the binding
// minus id/createdAt/updatedAt, which are filled in at seed time.
fn default_hotkeys() -> Vec<Value> {
    vec![
        // Navigation
        json!({ "name": "Go to Dashboard", "shortcut": "CommandOrControl+1",
            "action": { "type": "page", "target": "dashboard" },
            "enabled": true, "global": false, "category": "navigation", "isDefault": true }),
        json!({ "name": "Go to Operations", "shortcut": "CommandOrControl+2",
            "action": { "type": "page", "target": "operations" },
            "enabled": true, "global": false, "category": "navigation", "isDefault": true }),
        json!({ "name": "Go to Workflows", "shortcut": "CommandOrControl+3",
            "action": { "type": "page", "target": "workflows" },
            "enabled": true, "global": false, "category": "navigation", "isDefault": true }),
        json!({ "name": "Go to Notes", "shortcut": "CommandOrControl+4",
            "action": { "type": "page", "target": "notes" },
            "enabled": true, "global": false, "category": "navigation", "isDefault": true }),
        json!({ "name": "Go to Settings", "shortcut": "CommandOrControl+,",
            "action": { "type": "page", "target": "settings" },
            "enabled": true, "global": false, "category": "navigation", "isDefault": true }),
        // Window
        json!({ "name": "Toggle Dex Window", "description": "Show/hide the main window",
            "shortcut": "CommandOrControl+Alt+D",
            "action": { "type": "window", "target": "toggle" },
            "enabled": true, "global": true, "category": "window", "isDefault": true }),
        json!({ "name": "Command Palette", "shortcut": "CommandOrControl+Shift+P",
            "action": { "type": "command", "target": "command-palette" },
            "enabled": true, "global": false, "category": "window", "isDefault": true }),
        json!({ "name": "Quick Search", "shortcut": "CommandOrControl+K",
            "action": { "type": "command", "target": "quick-search" },
            "enabled": true, "global": false, "category": "window", "isDefault": true }),
        // System
        json!({ "name": "Emergency Stop",
            "description": "Stop all running workflows and operations",
            "shortcut": "CommandOrControl+Alt+Q",
            "action": { "type": "command", "target": "emergency-stop" },
            "enabled": true, "global": true, "category": "system", "isDefault": true }),
        json!({ "name": "New Note", "shortcut": "CommandOrControl+N",
            "action": { "type": "command", "target": "new-note" },
            "enabled": true, "global": false, "category": "system", "isDefault": true }),
        json!({ "name": "New Workflow", "shortcut": "CommandOrControl+Shift+N",
            "action": { "type": "command", "target": "new-workflow" },
            "enabled": true, "global": false, "category": "system", "isDefault": true }),
    ]
}

// Mirror of initializeDefaultHotkeys() (data half only). Reads bindings; if no
// `isDefault` entry exists, seeds DEFAULT_HOTKEYS into the bindings map keyed by
// `hotkey-default-<index>` with createdAt/updatedAt = now, persists, and returns
// the resulting bindings object. Otherwise returns the existing bindings.
fn ensure_bindings(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    let store = read_store(app);
    let mut bindings = store
        .get("bindings")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let has_defaults = bindings
        .values()
        .any(|b| b.get("isDefault").and_then(|v| v.as_bool()) == Some(true));
    if has_defaults {
        return bindings;
    }

    let now = now_ms();
    for (index, hotkey) in default_hotkeys().into_iter().enumerate() {
        let id = format!("hotkey-default-{}", index);
        let mut obj = hotkey.as_object().cloned().unwrap_or_default();
        obj.insert("id".into(), json!(id));
        obj.insert("createdAt".into(), json!(now));
        obj.insert("updatedAt".into(), json!(now));
        bindings.insert(id, Value::Object(obj));
    }

    // Persist bindings while preserving any sibling keys (usageStats/settings).
    let mut root = store.as_object().cloned().unwrap_or_default();
    root.insert("bindings".into(), Value::Object(bindings.clone()));
    write_store(app, &Value::Object(root));

    bindings
}

// hotkeys:list -> Object.values(bindings)
fn list_bindings(app: &tauri::AppHandle) -> Value {
    let bindings = ensure_bindings(app);
    Value::Array(bindings.values().cloned().collect())
}

// hotkeys:get(id) -> bindings[id] | undefined -> null
fn get_binding(app: &tauri::AppHandle, id: &str) -> Value {
    let bindings = ensure_bindings(app);
    bindings.get(id).cloned().unwrap_or(Value::Null)
}

/// Route a `hotkeys:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the data channels (list/get) are ported; all
/// other channels in the namespace return Value::Null (honest degrade), so
/// prefix-routing the whole namespace here is safe.
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
