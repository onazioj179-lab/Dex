// =============================================================================
// DEX Tauri — Idle subsystem (data tier; port of the `idle:*` IPC handlers in
// core/TrueIdleMode.ts).
//
// Pure-data, DataStore-KV tier (same backbone as modes_dispatch in main.rs and
// rule_engine.rs). Only the read-only DATA channel is ported here:
//
//   - idle:state  -> IdleState   (one of "active" | "idle" | "deep-idle" |
//                    "suspended"; a bare JSON string, matching the Electron
//                    handler `ipcMain.handle('idle:state', () => this.state)`).
//
// In Electron `this.state` is a live, in-memory value driven by a background
// loop over `powerMonitor.getSystemIdleTime()` plus power/lock events. There is
// no persisted store behind it. Following the assigned storage convention
// (datastore-kv:idle), the data tier reads the last-known state from the native
// KV store under the key "idle" via crate::kv_get, defaulting to "active" — the
// exact initial value `private state: IdleState = 'active'` in TrueIdleMode. The
// state would be *written* by the idle monitor loop, which is a HEAVY channel
// (see below) and is intentionally NOT implemented in the data tier. Until a
// native runtime arms that loop, this honestly reports the persisted/initial
// state rather than fabricating a live reading.
//
// DIVERGENCES (documented):
//   - No live computation: faithful `idle:state` requires the OS system-idle
//     timer (Electron's powerMonitor.getSystemIdleTime / Win32 GetLastInputInfo).
//     `sysinfo` (the only allowed native dep) does not expose per-input idle
//     time, so the data tier cannot derive the state itself. It returns the
//     KV-persisted value, defaulting to the Electron initial "active". This is
//     the same "data tier reflects stored state, heavy runtime not faked"
//     posture used elsewhere.
//   - Value is validated against the IdleState enum; any unexpected stored value
//     degrades to "active" so the renderer never sees an out-of-enum string.
// =============================================================================

use serde_json::{json, Value};

const IDLE_KEY: &str = "idle";

// The four valid IdleState variants from TrueIdleMode.ts. Anything else read
// from KV degrades to the Electron default ("active").
fn normalize_state(v: &Value) -> &'static str {
    match v.as_str() {
        Some("idle") => "idle",
        Some("deep-idle") => "deep-idle",
        Some("suspended") => "suspended",
        // "active", missing key, or any unexpected value -> Electron initial.
        _ => "active",
    }
}

// idle:state — `() => this.state`. Reads the persisted state from KV (key
// "idle"), defaulting to "active" exactly as `private state = 'active'`.
fn get_state(app: &tauri::AppHandle) -> Value {
    let stored = crate::kv_get(app, IDLE_KEY);
    json!(normalize_state(&stored))
}

/// Route an `idle:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read-only data channel is handled; heavy
/// runtime channels (monitor/notify and the in-memory mutators) are not faked
/// and return Value::Null (honest degrade), so prefix-routing the namespace is
/// safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Ported data channel. Both the prompt's "getState" alias and the actual
        // Electron channel name "idle:state" route here.
        "idle:state" | "idle:getState" => get_state(app),
        // Everything else in the namespace (idle:status, idle:activity,
        // idle:forceState, idle:setConfig, idle:timers, and the heavy
        // monitor/notify concerns) is live-runtime and intentionally not ported.
        _ => Value::Null,
    }
}
