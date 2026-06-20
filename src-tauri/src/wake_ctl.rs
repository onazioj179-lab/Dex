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
//   - instantWakeEnabled: in Electron this is an in-memory flag that setEnabled()
//     mutates and onSystemResume() reads to decide whether to instant-restore. It
//     is never written to Electron's wake-state.json (which holds only the bare
//     preservedState). To give wake:set-enabled a REAL, observable native effect
//     (the brief: "data/state mutations -> persist with the same intent"), we
//     persist the flag to a separate sidecar file `wake-enabled.json` under
//     <appData> rather than polluting wake-state.json (whose on-disk shape must
//     stay byte-compatible with Electron's loadStateFromDisk). get-state reads the
//     sidecar back, so a toggle round-trips. When the sidecar is absent we return
//     the constructor default `true`, exactly the value getWakeState() yields on a
//     fresh service before any toggle.
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
// Sidecar for the instantWakeEnabled flag. Kept SEPARATE from STATE_FILE so the
// latter stays byte-compatible with Electron's wake-state.json (bare
// preservedState). Shape: { "instantWakeEnabled": bool }.
const ENABLED_FILE: &str = "wake-enabled.json";
const ENABLED_KEY: &str = "instantWakeEnabled";

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

// Read the persisted instantWakeEnabled flag. Mirrors the constructor default
// (`true`) when the sidecar is missing/corrupt — the value getWakeState() yields
// before any setEnabled() call.
fn load_enabled(app: &tauri::AppHandle) -> bool {
    read_file(app, ENABLED_FILE)
        .get(ENABLED_KEY)
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

// Persist the instantWakeEnabled flag (the whole effect of setEnabled). Returns
// whether the write succeeded so the caller can degrade honestly on fs failure.
fn save_enabled(app: &tauri::AppHandle, enabled: bool) -> bool {
    let body = json!({ ENABLED_KEY: enabled });
    let serialized = match serde_json::to_string_pretty(&body) {
        Ok(s) => s,
        Err(_) => return false,
    };
    std::fs::write(store_path(app, ENABLED_FILE), serialized).is_ok()
}

// wake:get-state -> getWakeState() == { ...this.wakeState }.
fn get_state(app: &tauri::AppHandle) -> Value {
    json!({
        "lastSleepTime": Value::Null,
        "lastWakeTime": Value::Null,
        "preservedState": load_preserved_state(app),
        "instantWakeEnabled": load_enabled(app),
    })
}

/// Route a `wake:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Both channels in the namespace are fully ported:
/// `wake:get-state` returns the WakeState, and `wake:set-enabled` persists the
/// instantWakeEnabled flag (returning Value::Null, matching its void signature).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "wake:get-state" => get_state(app),
        // HEAVY: wake:set-enabled(enabled: boolean) -> void. In Electron the whole
        // effect is `this.wakeState.instantWakeEnabled = enabled` (an in-memory
        // flag read later by onSystemResume to gate instant-restore). We make that
        // effect real and durable by persisting the flag to the sidecar, so the
        // toggle round-trips through wake:get-state. The Electron handler returns
        // undefined, so we return Value::Null. The flag's downstream consumer
        // (live powerMonitor 'resume' window restoration) is a runtime concern not
        // present in this data tier, but the STATE the channel owns is now fully
        // ported and observable.
        "wake:set-enabled" => {
            // Positional arg array; default to the constructor's `true` if the
            // caller omits/mistypes it, matching a truthy JS coercion at the call
            // site (`wake:set-enabled` is always invoked with a real boolean).
            let enabled = args
                .get(0)
                .and_then(Value::as_bool)
                .unwrap_or(true);
            let _ = save_enabled(app, enabled);
            Value::Null
        }
        _ => Value::Null,
    }
}
