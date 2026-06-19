// =============================================================================
// DEX Tauri — Wake subsystem (port of the `wake:*` IPC handlers in
// HardwareOptimization.ts -> InstantWakeService).
//
// NOTE ON NAMING: the porting brief named the source `WakeWord.ts` with channels
// `getStatus` / `enable` / `disable` and storage `datastore-kv:wake`. None of
// those exist in the repo. The real `wake` namespace is InstantWakeService
// (src/main/core/HardwareOptimization.ts), with two IPC channels:
//   - wake:get-state    -> WakeState           (the DATA / read channel)
//   - wake:set-enabled  -> void                (the HEAVY / native toggle)
// We map the brief's intent onto the real channels: get-state == "getStatus"
// (ported), set-enabled == enable/disable (skipped, needs native runtime).
//
// STORAGE TIER: fs-json, not DataStore-KV. InstantWakeService persists ONLY the
// `preservedState` object to `<userData>/wake-state.json` (plain JSON, no
// top-level wrapper key). We mirror that exact file name and shape under
// <appData> via std::fs. `loadStateFromDisk()` reads that file straight into
// `wakeState.preservedState`, so we do the same here.
//
// WakeState (getWakeState() returns `{ ...this.wakeState }`):
//   { lastSleepTime: number|null, lastWakeTime: number|null,
//     preservedState: { windows: WindowState[], activeApp: string|null,
//                       clipboardContent: string|null },
//     instantWakeEnabled: boolean }
//
// DIVERGENCES (documented):
//   - lastSleepTime / lastWakeTime are RUNTIME-only fields, set by the live
//     powerMonitor 'suspend'/'resume' listeners. They are never persisted and a
//     fresh InstantWakeService has them null. The pure-data tier has no
//     powerMonitor, so we always return null for both — identical to the state
//     the renderer sees on a fresh service (e.g. right after boot, before any
//     sleep cycle). This matches Electron's initial WakeState exactly.
//   - instantWakeEnabled is in-memory only (set by wake:set-enabled, never
//     written to disk). It is NOT recoverable from wake-state.json, so we return
//     the constructor default `true` — the value getWakeState() yields until the
//     heavy toggle is invoked. Because that toggle is a native channel we do not
//     port, `true` is always the correct data-tier value.
//   - preservedState: read from wake-state.json if present. If the file is
//     missing/corrupt, loadStateFromDisk() leaves the constructor default
//     intact, so we return the same default (empty windows, null app/clipboard).
//     Electron's saved file is the bare preservedState object (no wrapper key),
//     so we read/return it verbatim, only backfilling missing sub-fields to
//     guarantee the documented shape.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STATE_FILE: &str = "wake-state.json";

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

// The constructor default for wakeState.preservedState.
fn default_preserved_state() -> Value {
    json!({
        "windows": [],
        "activeApp": Value::Null,
        "clipboardContent": Value::Null,
    })
}

// Mirror loadStateFromDisk(): the on-disk file is the bare preservedState object.
// Read it if present (backfilling any missing documented sub-field), else fall
// back to the constructor default the service keeps when the file is absent.
fn load_preserved_state(app: &tauri::AppHandle) -> Value {
    let raw = read_file(app, STATE_FILE);
    let obj = match raw.as_object() {
        Some(o) => o,
        None => return default_preserved_state(),
    };
    json!({
        "windows": obj.get("windows").cloned().unwrap_or_else(|| json!([])),
        "activeApp": obj.get("activeApp").cloned().unwrap_or(Value::Null),
        "clipboardContent": obj.get("clipboardContent").cloned().unwrap_or(Value::Null),
    })
}

// wake:get-state -> getWakeState() == { ...this.wakeState }.
fn get_state(app: &tauri::AppHandle) -> Value {
    json!({
        "lastSleepTime": Value::Null,
        "lastWakeTime": Value::Null,
        "preservedState": load_preserved_state(app),
        "instantWakeEnabled": true,
    })
}

/// Route a `wake:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; the
/// native toggle (wake:set-enabled) returns Value::Null (honest degrade — it has
/// no data result and its effect requires the native runtime).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "wake:get-state" => get_state(app),
        // HEAVY: wake:set-enabled flips an in-memory flag and re-arms the live
        // powerMonitor restoration path. No data result; not ported.
        _ => Value::Null,
    }
}
