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
// LIFECYCLE / MUTATION channels (now ported, real native code over the JSON
// store, byte-for-byte the same records Electron writes):
//   - hotkeys:create          -> HotkeyBinding (or { error } on conflict)
//   - hotkeys:update          -> HotkeyBinding | null (or { error } on conflict)
//   - hotkeys:delete          -> bool
//   - hotkeys:toggle          -> HotkeyBinding | null (delegates to update)
//   - hotkeys:check-conflict  -> HotkeyBinding | null
//   - hotkeys:get-stats       -> HotkeyStats
//   - hotkeys:reset-defaults  -> HotkeyBinding[]
//   - hotkeys:get-settings    -> settings object
//   - hotkeys:update-settings -> merged settings object
//   - hotkeys:record          -> emits `hotkey:start-recording`, returns null
//                                (the key capture is a renderer round-trip)
//
// DEGRADED (need a native runtime the data tier doesn't own):
//   - hotkeys:register / hotkeys:unregister : these are PRIVATE methods in
//     Electron (no ipcMain.handle) whose only effect is OS-level
//     globalShortcut.register/unregister. Tauri has no global-shortcut plugin
//     dependency in this project, so true OS registration cannot be performed
//     without adding a dep (forbidden). The DATA side (enabled flag) is already
//     covered by create/update/toggle, so these return Value::Null.
//   - hotkeys:remap : no such handler exists in the Electron controller; the
//     equivalent (changing a binding's shortcut) is done through hotkeys:update.
//     Returns Value::Null.
//
// Unknown channels return Value::Null (honest degrade).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "dex-hotkeys.json";

/// Default settings object, mirroring the electron-store `defaults.settings`.
fn default_settings() -> Value {
    json!({
        "enabled": true,
        "showNotifications": true,
        "allowConflicts": false,
    })
}

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

// --- mutation helpers (operate on the full store root) -----------------------

/// Read the store root as an object, with the `bindings` map guaranteed seeded
/// (defaults materialized if absent). Returns (root, bindings) where `bindings`
/// is also embedded in `root` under "bindings".
fn read_root_with_bindings(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    // ensure_bindings persists defaults if needed; re-read the full root after so
    // sibling keys (usageStats/settings) survive subsequent writes.
    let _ = ensure_bindings(app);
    read_store(app).as_object().cloned().unwrap_or_default()
}

/// Current settings, falling back to defaults for any missing keys.
fn current_settings(app: &tauri::AppHandle) -> Value {
    let store = read_store(app);
    let mut s = default_settings();
    if let (Some(target), Some(stored)) = (
        s.as_object_mut(),
        store.get("settings").and_then(|v| v.as_object()),
    ) {
        for (k, v) in stored {
            target.insert(k.clone(), v.clone());
        }
    }
    s
}

/// checkConflict(shortcut, excludeId?) -> matching HotkeyBinding | null.
/// Case-insensitive shortcut compare, skipping `exclude_id`.
fn check_conflict(app: &tauri::AppHandle, shortcut: &str, exclude_id: Option<&str>) -> Value {
    let bindings = ensure_bindings(app);
    let want = shortcut.to_lowercase();
    for b in bindings.values() {
        let id = b.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if let Some(ex) = exclude_id {
            if id == ex {
                continue;
            }
        }
        let sc = b
            .get("shortcut")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_lowercase();
        if sc == want {
            return b.clone();
        }
    }
    Value::Null
}

/// createBinding(binding) -> HotkeyBinding, or { error } if it conflicts and
/// settings.allowConflicts is false (Electron throws; we surface as an object
/// with an `error` field so the renderer's catch path reports it cleanly).
fn create_binding(app: &tauri::AppHandle, binding: &Value) -> Value {
    let shortcut = binding.get("shortcut").and_then(|v| v.as_str()).unwrap_or("");
    let allow = current_settings(app)
        .get("allowConflicts")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let conflict = check_conflict(app, shortcut, None);
    if conflict.is_object() && !allow {
        let name = conflict.get("name").and_then(|v| v.as_str()).unwrap_or("");
        return json!({ "error": format!("Shortcut conflict: {} is already used by \"{}\"", shortcut, name) });
    }

    let now = now_ms();
    let id = format!(
        "hotkey-{}-{}",
        now,
        &crate::util::pseudo_uuid_v4().replace('-', "")[..9]
    );

    let mut obj = binding.as_object().cloned().unwrap_or_default();
    obj.insert("id".into(), json!(id));
    obj.insert("isDefault".into(), json!(false));
    obj.insert("createdAt".into(), json!(now));
    obj.insert("updatedAt".into(), json!(now));
    let new_binding = Value::Object(obj);

    let mut root = read_root_with_bindings(app);
    let mut bindings = root
        .get("bindings")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    bindings.insert(id.clone(), new_binding.clone());
    root.insert("bindings".into(), Value::Object(bindings));
    write_store(app, &Value::Object(root));

    new_binding
}

/// updateBinding(id, updates) -> HotkeyBinding | null, or { error } on conflict.
fn update_binding(app: &tauri::AppHandle, id: &str, updates: &Value) -> Value {
    let mut root = read_root_with_bindings(app);
    let mut bindings = root
        .get("bindings")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let existing = match bindings.get(id) {
        Some(b) => b.clone(),
        None => return Value::Null,
    };

    // If shortcut changed, check for conflicts (excluding self).
    if let Some(new_sc) = updates.get("shortcut").and_then(|v| v.as_str()) {
        let old_sc = existing.get("shortcut").and_then(|v| v.as_str()).unwrap_or("");
        if new_sc != old_sc {
            let allow = current_settings(app)
                .get("allowConflicts")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let conflict = check_conflict(app, new_sc, Some(id));
            if conflict.is_object() && !allow {
                let name = conflict.get("name").and_then(|v| v.as_str()).unwrap_or("");
                return json!({ "error": format!("Shortcut conflict: {} is already used by \"{}\"", new_sc, name) });
            }
        }
    }

    // Merge: existing <- updates, then force id and updatedAt.
    let mut merged = existing.as_object().cloned().unwrap_or_default();
    if let Some(up) = updates.as_object() {
        for (k, v) in up {
            merged.insert(k.clone(), v.clone());
        }
    }
    merged.insert("id".into(), json!(id));
    merged.insert("updatedAt".into(), json!(now_ms()));
    let updated = Value::Object(merged);

    bindings.insert(id.to_string(), updated.clone());
    root.insert("bindings".into(), Value::Object(bindings));
    write_store(app, &Value::Object(root));

    updated
}

/// deleteBinding(id) -> bool.
fn delete_binding(app: &tauri::AppHandle, id: &str) -> Value {
    let mut root = read_root_with_bindings(app);
    let mut bindings = root
        .get("bindings")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    if bindings.remove(id).is_none() {
        return json!(false);
    }
    root.insert("bindings".into(), Value::Object(bindings));
    write_store(app, &Value::Object(root));
    json!(true)
}

/// getStats() -> HotkeyStats { totalBindings, globalBindings, enabledBindings, usageStats }.
fn get_stats(app: &tauri::AppHandle) -> Value {
    let bindings = ensure_bindings(app);
    let total = bindings.len();
    let global = bindings
        .values()
        .filter(|b| b.get("global").and_then(|v| v.as_bool()) == Some(true))
        .count();
    let enabled = bindings
        .values()
        .filter(|b| b.get("enabled").and_then(|v| v.as_bool()) == Some(true))
        .count();
    let usage = read_store(app)
        .get("usageStats")
        .cloned()
        .unwrap_or_else(|| json!({}));
    json!({
        "totalBindings": total,
        "globalBindings": global,
        "enabledBindings": enabled,
        "usageStats": usage,
    })
}

/// resetToDefaults() -> HotkeyBinding[]. Clears bindings then re-seeds defaults,
/// preserving usageStats/settings; returns the resulting binding list.
fn reset_defaults(app: &tauri::AppHandle) -> Value {
    let mut root = read_store(app).as_object().cloned().unwrap_or_default();
    root.insert("bindings".into(), json!({}));
    write_store(app, &Value::Object(root));
    // ensure_bindings now sees no isDefault entry and re-materializes defaults.
    list_bindings(app)
}

/// updateSettings(partial) -> merged settings object.
fn update_settings(app: &tauri::AppHandle, partial: &Value) -> Value {
    let mut settings = current_settings(app);
    if let (Some(target), Some(incoming)) = (settings.as_object_mut(), partial.as_object()) {
        for (k, v) in incoming {
            target.insert(k.clone(), v.clone());
        }
    }
    let mut root = read_store(app).as_object().cloned().unwrap_or_default();
    root.insert("settings".into(), settings.clone());
    write_store(app, &Value::Object(root));
    settings
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
        "hotkeys:create" => {
            let binding = args.get(0).cloned().unwrap_or_else(|| json!({}));
            create_binding(app, &binding)
        }
        "hotkeys:update" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let updates = args.get(1).cloned().unwrap_or_else(|| json!({}));
            update_binding(app, id, &updates)
        }
        "hotkeys:delete" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_binding(app, id)
        }
        "hotkeys:toggle" => {
            // toggleBinding(id, enabled) -> updateBinding(id, { enabled }).
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let enabled = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            update_binding(app, id, &json!({ "enabled": enabled }))
        }
        "hotkeys:check-conflict" => {
            let shortcut = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let exclude = args.get(1).and_then(|v| v.as_str());
            check_conflict(app, shortcut, exclude)
        }
        "hotkeys:get-stats" => get_stats(app),
        "hotkeys:reset-defaults" => reset_defaults(app),
        "hotkeys:get-settings" => current_settings(app),
        "hotkeys:update-settings" => {
            let partial = args.get(0).cloned().unwrap_or_else(|| json!({}));
            update_settings(app, &partial)
        }
        "hotkeys:record" => {
            // startRecording() asks the renderer to capture keys, then awaits a
            // `hotkey:recorded` reply. The capture itself is a renderer concern;
            // we fire the start signal and return null (void) so the recorder UI
            // engages. The eventual shortcut comes back through the renderer.
            crate::native_ops::emit_event(app, "hotkey:start-recording", &json!({}));
            Value::Null
        }
        // DEGRADED: OS global-shortcut registration (no plugin dep) / no such
        // Electron handler. See the module header for the rationale.
        "hotkeys:register" | "hotkeys:unregister" | "hotkeys:remap" => Value::Null,
        _ => Value::Null,
    }
}
