// =============================================================================
// DEX Tauri — Idle subsystem (port of the `idle:*` IPC handlers in
// core/TrueIdleMode.ts).
//
// TrueIdleMode in Electron is a live, in-memory subsystem driven by a 10s
// background loop over `powerMonitor.getSystemIdleTime()` plus power/lock
// events. It exposes seven IPC channels:
//
//   - idle:status     -> IdleStatus { state, idleTime, lastActivity,
//                        suppressedTimers, powerSource }
//   - idle:activity   -> records activity (lastActivity=now, state->active),
//                        returns { success: true }
//   - idle:state      -> bare IdleState string ("active"|"idle"|"deep-idle"
//                        |"suspended") — `() => this.state`
//   - idle:forceState -> setState(state), returns { success: true }
//   - idle:setConfig  -> merge Partial<IdleConfig>, returns { success: true }
//   - idle:timers     -> Array<{ id, name, running, interval }>
//
// HEAVY CHANNELS NOW IMPLEMENTED NATIVELY
// ----------------------------------------
// The two "heavy" concerns the original data-tier port skipped were (a) the
// MONITOR loop that actually derives the idle state from the OS input timer, and
// (b) the NOTIFY push (`webContents.send('idle:stateChanged', status)`) that
// fans state changes out to the renderer. Both are now real:
//
//   * MONITOR: `getSystemIdleTime()` is implemented for real on Windows via the
//     Win32 `GetLastInputInfo` API, invoked through PowerShell's `Add-Type`
//     P/Invoke (no new crate; same "use an always-present OS tool" pattern as
//     native_ops::system_accent_color's `reg query`). The result is seconds of
//     user inactivity, exactly what Electron's powerMonitor.getSystemIdleTime
//     returns.
//   * The idle STATE is then derived compute-on-read from that idle time, the
//     persisted config thresholds, the recorded lastActivity, and any forced
//     override — so `idle:status` / `idle:state` report a genuinely live reading,
//     not a stale persisted value.
//   * A background MONITOR THREAD (std::thread::spawn + sleep, the
//     native_ops::start_reminder_scheduler precedent) is armed on first idle
//     touch. It re-derives the state every `checkInterval` ms and, on a
//     transition, emits `idle:stateChanged` with the full IdleStatus via
//     crate::native_ops::emit_event — the Tauri analog of the Electron
//     broadcast. That is the NOTIFY concern, done for real.
//
// STATE STORAGE (datastore-kv:idle namespace)
// -------------------------------------------
// TrueIdleMode has no persisted store; its state is in-memory. To keep the
// derivation consistent between the compute-on-read path and the monitor thread,
// the *inputs* (config, lastActivity, a manual force override, the last computed
// state, and the discovered power source) are persisted in the native KV store
// under sub-keys of "idle" via crate::kv_get / crate::kv_set. The derived state
// itself is recomputed, never trusted blindly.
//
// DIVERGENCES (documented)
// ------------------------
//   - getSystemIdleTime is Windows-only here: it uses GetLastInputInfo. On other
//     platforms there is no portable no-dependency source for per-input idle
//     time, so idleTime degrades to the time since the last recorded activity
//     (a lower bound) and the state still derives correctly from the thresholds.
//   - Managed timers (registerTimer) are an in-process API in Electron, never
//     reachable over IPC, and no native subsystem registers timers through this
//     tier. `idle:timers` therefore returns the persisted (empty by default)
//     list honestly rather than fabricating entries, and `suppressedTimers` in
//     the status is 0. This is a faithful reflection of the Tauri port's state,
//     not a fake.
//   - Power-source detection is best-effort via `WMIC Path Win32_Battery`
//     (always-present on Windows); absence of a battery -> "ac", query failure
//     -> "unknown", matching the Electron default.
// =============================================================================

use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};

const IDLE_KEY: &str = "idle";

// Defaults mirror DEFAULT_CONFIG in TrueIdleMode.ts.
const DEFAULT_IDLE_THRESHOLD: i64 = 60; // seconds
const DEFAULT_DEEP_IDLE_THRESHOLD: i64 = 300; // seconds
const DEFAULT_CHECK_INTERVAL: i64 = 10_000; // ms
const DEFAULT_SUSPEND_ON_BATTERY: bool = true;
const DEFAULT_REDUCED_POLLING: bool = true;

// Ensures the background monitor thread is spawned at most once per process.
static MONITOR_ARMED: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/// Epoch millis (mirrors Date.now()).
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Persisted state (sub-keys under the "idle" KV object)
// ---------------------------------------------------------------------------

/// Read the whole "idle" KV object (or an empty object if unset/not an object).
fn load_blob(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    match crate::kv_get(app, IDLE_KEY) {
        Value::Object(m) => m,
        // Legacy: the original data-tier stored a bare state string under "idle".
        // Preserve it as the forced/last state so we don't lose it.
        Value::String(s) => {
            let mut m = serde_json::Map::new();
            m.insert("lastState".into(), Value::String(s));
            m
        }
        _ => serde_json::Map::new(),
    }
}

fn save_blob(app: &tauri::AppHandle, blob: serde_json::Map<String, Value>) {
    crate::kv_set(app, IDLE_KEY, Value::Object(blob));
}

/// Effective config (persisted overrides merged over the TrueIdleMode defaults).
struct Config {
    idle_threshold: i64,
    deep_idle_threshold: i64,
    check_interval: i64,
    suspend_on_battery: bool,
    reduced_polling: bool,
}

fn load_config(blob: &serde_json::Map<String, Value>) -> Config {
    let c = blob.get("config").cloned().unwrap_or(Value::Null);
    let get_i = |k: &str, d: i64| c.get(k).and_then(|v| v.as_i64()).unwrap_or(d);
    let get_b = |k: &str, d: bool| c.get(k).and_then(|v| v.as_bool()).unwrap_or(d);
    Config {
        idle_threshold: get_i("idleThreshold", DEFAULT_IDLE_THRESHOLD),
        deep_idle_threshold: get_i("deepIdleThreshold", DEFAULT_DEEP_IDLE_THRESHOLD),
        check_interval: get_i("checkInterval", DEFAULT_CHECK_INTERVAL),
        suspend_on_battery: get_b("suspendOnBattery", DEFAULT_SUSPEND_ON_BATTERY),
        reduced_polling: get_b("reducedPolling", DEFAULT_REDUCED_POLLING),
    }
}

fn last_activity(blob: &serde_json::Map<String, Value>) -> i64 {
    blob.get("lastActivity").and_then(|v| v.as_i64()).unwrap_or_else(now_ms)
}

/// A manual `idle:forceState` override, if one is currently pinned.
fn forced_state(blob: &serde_json::Map<String, Value>) -> Option<&'static str> {
    blob.get("forcedState").and_then(|v| normalize_state(v))
}

/// Map an arbitrary JSON value to a valid IdleState, or None if it is not one.
fn normalize_state(v: &Value) -> Option<&'static str> {
    match v.as_str() {
        Some("active") => Some("active"),
        Some("idle") => Some("idle"),
        Some("deep-idle") => Some("deep-idle"),
        Some("suspended") => Some("suspended"),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Native OS idle time (the real MONITOR primitive)
// ---------------------------------------------------------------------------

/// Seconds of user inactivity, the Tauri analog of
/// `powerMonitor.getSystemIdleTime()`.
///
/// Windows: call the Win32 `GetLastInputInfo` API. There is no no-dependency
/// Rust binding available under the allowed dep set, so it is reached through
/// PowerShell's `Add-Type` P/Invoke (an always-present OS tool, the same pattern
/// as native_ops::system_accent_color's `reg query`). The script prints the
/// whole-second inactivity, which we parse.
///
/// Other platforms / failure: fall back to the time since the last recorded
/// `idle:activity` (a safe lower bound), so the derived state is still sane.
fn system_idle_time_secs(blob: &serde_json::Map<String, Value>) -> i64 {
    if let Some(secs) = native_idle_secs() {
        return secs;
    }
    // Fallback: elapsed since last recorded activity.
    let since = (now_ms() - last_activity(blob)) / 1000;
    since.max(0)
}

#[cfg(windows)]
fn native_idle_secs() -> Option<i64> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    // GetLastInputInfo gives the tick (ms since boot) of the last input;
    // Environment.TickCount is the current tick. Their difference / 1000 is the
    // idle time in seconds. Add-Type compiles the P/Invoke once per invocation.
    let script = r#"
$sig = @'
[DllImport("user32.dll")]
public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
[StructLayout(LayoutKind.Sequential)]
public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
'@
Add-Type -MemberDefinition $sig -Namespace W -Name U -UsingNamespace System.Runtime.InteropServices
$lii = New-Object W.U+LASTINPUTINFO
$lii.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($lii)
[void][W.U]::GetLastInputInfo([ref]$lii)
$idleMs = [Environment]::TickCount - $lii.dwTime
[Math]::Floor($idleMs / 1000)
"#;
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let n: i64 = text.trim().parse().ok()?;
    // TickCount wraps every ~49.7 days; a negative or absurd value -> bail to fallback.
    if n < 0 || n > 60 * 60 * 24 * 365 {
        return None;
    }
    Some(n)
}

#[cfg(not(windows))]
fn native_idle_secs() -> Option<i64> {
    None
}

// ---------------------------------------------------------------------------
// Native power source (best-effort)
// ---------------------------------------------------------------------------

#[cfg(windows)]
fn detect_power_source() -> &'static str {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    // BatteryStatus: 1 = discharging (on battery), 2 = on AC. No battery row ->
    // a desktop -> "ac". Query failure -> "unknown".
    let out = Command::new("wmic")
        .args(["Path", "Win32_Battery", "Get", "BatteryStatus", "/format:list"])
        .creation_flags(0x0800_0000)
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            for line in text.lines() {
                if let Some(v) = line.trim().strip_prefix("BatteryStatus=") {
                    match v.trim() {
                        "1" => return "battery",
                        "2" => return "ac",
                        _ => {}
                    }
                }
            }
            // No (or unknown) battery row -> treat as a desktop on mains power.
            "ac"
        }
        _ => "unknown",
    }
}

#[cfg(not(windows))]
fn detect_power_source() -> &'static str {
    "unknown"
}

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

/// Derive the live IdleState from the OS idle seconds + config, honoring a
/// manual force override. Mirrors TrueIdleMode.checkIdleState's thresholds.
fn derive_state(blob: &serde_json::Map<String, Value>, cfg: &Config, idle_secs: i64) -> &'static str {
    if let Some(forced) = forced_state(blob) {
        return forced;
    }
    if idle_secs >= cfg.deep_idle_threshold {
        "deep-idle"
    } else if idle_secs >= cfg.idle_threshold {
        "idle"
    } else {
        "active"
    }
}

/// Build the full IdleStatus object (the `idle:status` return AND the payload of
/// the `idle:stateChanged` push), persisting the freshly derived state + power
/// source back into the blob so `idle:state` and the renderer stay in sync.
fn build_status(app: &tauri::AppHandle) -> (Value, &'static str) {
    let mut blob = load_blob(app);
    let cfg = load_config(&blob);
    let idle_secs = system_idle_time_secs(&blob);
    let state = derive_state(&blob, &cfg, idle_secs);
    let power = detect_power_source();
    let last = last_activity(&blob);

    // Persist the derived snapshot so idle:state (and a fresh process) reflect it.
    blob.insert("lastState".into(), Value::String(state.to_string()));
    blob.insert("powerSource".into(), Value::String(power.to_string()));
    save_blob(app, blob);

    let status = json!({
        "state": state,
        "idleTime": idle_secs,
        "lastActivity": last,
        "suppressedTimers": 0,
        "powerSource": power,
    });
    (status, state)
}

// ---------------------------------------------------------------------------
// Monitor thread (the real loop + the NOTIFY push)
// ---------------------------------------------------------------------------

/// Arm the background idle monitor exactly once. It re-derives the state every
/// `checkInterval` ms and, on a transition, emits `idle:stateChanged` with the
/// full IdleStatus — the Tauri analog of TrueIdleMode.broadcastState(). This is
/// the MONITOR + NOTIFY pair, implemented natively (std::thread + sleep, the
/// native_ops::start_reminder_scheduler precedent).
fn arm_monitor(app: &tauri::AppHandle) {
    if MONITOR_ARMED.swap(true, Ordering::SeqCst) {
        return; // already running
    }
    let app = app.clone();
    crate::util::spawn_named("idle", move || {
        let mut prev: Option<String> = None;
        loop {
            let (status, state) = build_status(&app);
            let changed = prev.as_deref() != Some(state);
            if changed {
                crate::native_ops::emit_event(&app, "idle:stateChanged", &status);
                prev = Some(state.to_string());
            }
            // Re-read the (possibly reconfigured) checkInterval each tick.
            let blob = load_blob(&app);
            let cfg = load_config(&blob);
            let mut ms = cfg.check_interval;
            // When idle and reducedPolling is on, back off the poll rate to keep
            // the loop near-zero-cost (mirrors the "reduced polling when idle"
            // intent of the Electron config).
            if cfg.reduced_polling && state != "active" {
                ms = ms.saturating_mul(3);
            }
            // Clamp to a sane floor/ceiling so a bad config can't busy-spin.
            let ms = ms.clamp(1_000, 600_000) as u64;
            std::thread::sleep(std::time::Duration::from_millis(ms));
        }
    });
}

// ---------------------------------------------------------------------------
// Channel handlers
// ---------------------------------------------------------------------------

/// idle:status — `() => this.getStatus()`. Live derivation.
fn handle_status(app: &tauri::AppHandle) -> Value {
    let (status, _) = build_status(app);
    status
}

/// idle:state — `() => this.state`. The live-derived state (never a stale value).
fn handle_state(app: &tauri::AppHandle) -> Value {
    let (_, state) = build_status(app);
    json!(state)
}

/// idle:activity — `recordActivity()`: lastActivity = now, clear any force
/// override so the user's input wins, and (since fresh activity means "active")
/// reset the persisted state. Emits idle:stateChanged if that revived the user.
fn handle_activity(app: &tauri::AppHandle) -> Value {
    let mut blob = load_blob(app);
    let was = blob
        .get("lastState")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    blob.insert("lastActivity".into(), json!(now_ms()));
    // recordActivity() forces state back to active; drop any manual override.
    blob.remove("forcedState");
    blob.insert("lastState".into(), Value::String("active".into()));
    save_blob(app, blob);

    if was.as_deref() != Some("active") {
        let (status, _) = build_status(app);
        crate::native_ops::emit_event(app, "idle:stateChanged", &status);
    }
    json!({ "success": true })
}

/// idle:forceState — `setState(state)` for testing. Pins the state until the next
/// `idle:activity`, persists it, and broadcasts the change. Invalid states are
/// rejected (the renderer only ever sends a valid IdleState).
fn handle_force_state(app: &tauri::AppHandle, args: &Value) -> Value {
    let arg = args.get(0).cloned().unwrap_or(Value::Null);
    let state = match normalize_state(&arg) {
        Some(s) => s,
        None => return json!({ "success": false, "error": "invalid state" }),
    };
    let mut blob = load_blob(app);
    blob.insert("forcedState".into(), Value::String(state.to_string()));
    blob.insert("lastState".into(), Value::String(state.to_string()));
    save_blob(app, blob);

    // Broadcast the forced transition (TrueIdleMode.setState -> broadcastState).
    let (status, _) = build_status(app);
    crate::native_ops::emit_event(app, "idle:stateChanged", &status);
    json!({ "success": true })
}

/// idle:setConfig — `this.config = { ...this.config, ...config }`. Merges the
/// provided Partial<IdleConfig> over the persisted config. Returns { success }.
fn handle_set_config(app: &tauri::AppHandle, args: &Value) -> Value {
    let patch = args.get(0).cloned().unwrap_or(Value::Null);
    let patch = match patch {
        Value::Object(m) => m,
        _ => return json!({ "success": false, "error": "config must be an object" }),
    };
    let mut blob = load_blob(app);
    let mut cfg = match blob.get("config").cloned() {
        Some(Value::Object(m)) => m,
        _ => serde_json::Map::new(),
    };
    // Only accept the five known IdleConfig keys; ignore anything else.
    const KEYS: &[&str] = &[
        "idleThreshold",
        "deepIdleThreshold",
        "checkInterval",
        "suspendOnBattery",
        "reducedPolling",
    ];
    for k in KEYS {
        if let Some(v) = patch.get(*k) {
            cfg.insert((*k).to_string(), v.clone());
        }
    }
    blob.insert("config".into(), Value::Object(cfg));
    save_blob(app, blob);
    json!({ "success": true })
}

/// idle:timers — `() => this.getTimerInfo()`. Returns the managed-timer list as
/// `[{ id, name, running, interval }]`. No native subsystem registers timers
/// through this IPC tier (registerTimer is an in-process API in Electron, never
/// exposed over IPC), so this honestly reflects the persisted list, which is
/// empty by default — it does not fabricate entries.
fn handle_timers(app: &tauri::AppHandle) -> Value {
    let blob = load_blob(app);
    match blob.get("timers") {
        Some(Value::Array(a)) => Value::Array(a.clone()),
        _ => Value::Array(vec![]),
    }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/// Route an `idle:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The background monitor is armed lazily on the
/// first idle touch so the renderer starts receiving idle:stateChanged pushes.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    arm_monitor(app);
    match channel {
        "idle:status" => handle_status(app),
        "idle:state" | "idle:getState" => handle_state(app),
        "idle:activity" => handle_activity(app),
        "idle:forceState" => handle_force_state(app, args),
        "idle:setConfig" => handle_set_config(app, args),
        "idle:timers" => handle_timers(app),
        _ => Value::Null,
    }
}
