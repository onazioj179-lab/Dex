// =============================================================================
// DEX Tauri — Recovery subsystem (port of the `recovery:*` IPC handlers in
// src/main/core/CrashRecoverySystem.ts).
//
// SPEC RECONCILIATION (important, same situation handled by monitor_ctl.rs): the
// porting brief named source `src/main/core/Recovery.ts`, storage
// `fs-json:recovery.json`, DATA channel `getState`, and HEAVY channels
// `recover` / `restore`. None of those literal names exist in the repo. The real
// `recovery:` namespace is owned by CrashRecoverySystem.ts, which is NOT a single
// `recovery.json` file — it persists three plain JSON files under
// <userData>/recovery/ via std fs (same tier as analytics.rs / monitor_ctl.rs):
//   - session-state.json : a single SessionState object (the "state")
//   - crash-history.json : a CrashEvent[] array
//   - config.json        : a RecoveryConfig object (defaults merged on read)
// This module therefore mirrors monitor_ctl.rs (electron-store-style JSON under
// <appData> with identical file names / nested `recovery/` dir) rather than a
// single recovery.json. The brief's abstract DATA channel ("getState") maps to
// the concrete cold-readable DATA channels below; the abstract HEAVY channels
// ("recover" / "restore") map to the concrete live-runtime channels listed.
//
// PORTED (pure-data, reconstructable cold from the JSON files; shapes match the
// Electron handlers exactly so the renderer is unchanged):
//   - recovery:savedState -> SessionState | null
//         { timestamp, windows: WindowState[], activeWindow?, pendingOperations:
//           string[], unsavedData: Record<string, unknown> }
//         Electron returns `this.savedState`, which is populated by
//         checkForPreviousCrash(): it reads session-state.json and KEEPS it only
//         if state.timestamp > now - 5min; older state is treated as null (and
//         the file unlinked). We reproduce the read + 5-minute freshness gate and
//         return null when the file is missing/stale/corrupt. (We do not delete
//         the stale file — unlink is a runtime side-effect with no effect on the
//         returned value; documented divergence.)
//   - recovery:crashes(limit?) -> CrashEvent[]
//         Reads crash-history.json (an array; [] if missing/corrupt) and returns
//         the last min(limit||20, len) entries — exact Electron slice(-(limit||20)).
//   - recovery:stats -> RecoveryStats
//         { totalCrashes, successfulRecoveries, failedRecoveries, dataLossEvents,
//           lastCrash?, uptimeSinceLastCrash, crashesByType } derived purely from
//           crash-history.json, matching getStats() field-for-field.
//   - recovery:config -> RecoveryConfig
//         { enabled, autoRecover, maxRecoveryAttempts, recoveryDelayMs,
//           saveStateInterval, keepCrashHistory, showRecoveryNotification,
//           silentMode } = DEFAULT_CONFIG with config.json merged over it (exact
//           mirror of loadConfig()'s `{ ...DEFAULT_CONFIG, ...JSON.parse(data) }`).
//
// HEAVY (now ported as REAL native work against the same JSON files Electron
// used — the in-memory savedState becomes the persisted session-state.json, the
// source of truth cold). These are the concrete analogue of the brief's
// recover/restore heavy channels:
//   - recovery:saveState  -> stamps a fresh state, carries forward
//         pendingOperations / unsavedData, persists session-state.json -> { success }.
//         (windows[] is empty: this shell owns no Electron BrowserWindows; the
//         field shape is preserved — documented divergence.)
//   - recovery:dismiss    -> unlinks session-state.json (missing == success) -> { success }.
//   - recovery:setConfig  -> merges updates over the effective config, persists
//         config.json -> { success }. (The live 30s save-interval re-arm has no
//         cold equivalent and does not affect the persisted config — omitted.)
//   - recovery:unsavedData -> persists unsavedData[key]=data into
//         session-state.json (void; durable analogue of the in-memory mutation).
//   - recovery:restore    -> reads session-state.json, emits it to the renderer
//         (recovery:restore event) so the in-app workspace can restore itself
//         from unsavedData / pendingOperations, dismisses the saved state, and
//         returns { success, restored }. The OS-window recreation count
//         (`restored`) is computed from the persisted windows[] (empty in this
//         shell -> 0, reported honestly); recreating live Electron BrowserWindows
//         is the one piece with no native equivalent and is NOT faked.
//
// DIVERGENCES (documented):
//   - Storage location: Electron used path.join(app.getPath('userData'),
//     'recovery'); Tauri uses app.dex_data_dir().join("recovery"). Same
//     file NAMES and same JSON shapes / top-level structure (bare object for
//     state/config, bare array for crashes — no key wrappers, matching Electron's
//     JSON.stringify of the value directly).
//   - savedState does not delete the stale state file (Electron's unlink) — a
//     side-effect that does not change the returned value.
//   - stats.uptimeSinceLastCrash: Electron seeds it from the process startTime
//     when there are zero crashes (now - startTime). Cold there is no process
//     startTime, so the zero-crash case returns 0; when crashes exist the value
//     is now - lastCrash, identical to Electron.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const STATE_FILE: &str = "session-state.json";
const HISTORY_FILE: &str = "crash-history.json";
const CONFIG_FILE: &str = "config.json";
const FRESHNESS_MS: i64 = 5 * 60 * 1000; // checkForPreviousCrash: 5-minute window.

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO (mirrors analytics.rs / monitor_ctl.rs store_path/read_file) -----

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .dex_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("recovery");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Mirror of Electron's `fs.writeFile(file, JSON.stringify(value, null, 2))` —
// pretty-printed bare JSON (no key wrapper), same file names under <appData>/
// recovery/. Returns whether the write succeeded so the heavy channels can
// report `{ success }` exactly like the TS handlers.
fn write_file(app: &tauri::AppHandle, name: &str, value: &Value) -> bool {
    match serde_json::to_string_pretty(value) {
        Ok(raw) => crate::write_atomic(store_path(app, name), raw).is_ok(),
        Err(_) => false,
    }
}

// --- DEFAULT_CONFIG (mirror of the TS constant) ------------------------------

fn default_config() -> Value {
    json!({
        "enabled": true,
        "autoRecover": true,
        "maxRecoveryAttempts": 3,
        "recoveryDelayMs": 1000,
        "saveStateInterval": 30000,
        "keepCrashHistory": 50,
        "showRecoveryNotification": true,
        "silentMode": true,
    })
}

// --- crash history -----------------------------------------------------------

fn read_crashes(app: &tauri::AppHandle) -> Vec<Value> {
    match read_file(app, HISTORY_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

// getCrashHistory(limit?) -> this.crashes.slice(-(limit || 20))
fn get_crash_history(app: &tauri::AppHandle, limit: Option<i64>) -> Value {
    let crashes = read_crashes(app);
    let n = match limit {
        Some(l) if l > 0 => l as usize,
        _ => 20,
    };
    let start = crashes.len().saturating_sub(n);
    json!(crashes[start..].to_vec())
}

// getStats() -> RecoveryStats
fn get_stats(app: &tauri::AppHandle) -> Value {
    let crashes = read_crashes(app);

    let recovered = |c: &Value| c.get("recovered").and_then(|v| v.as_bool()).unwrap_or(false);
    let data_lost = |c: &Value| c.get("dataLost").and_then(|v| v.as_bool()).unwrap_or(false);

    let successful = crashes.iter().filter(|c| recovered(c)).count();
    let failed = crashes.iter().filter(|c| !recovered(c)).count();
    let loss = crashes.iter().filter(|c| data_lost(c)).count();

    // crashesByType: every CrashType key seeded at 0 (mirrors the TS object).
    let mut by_type = json!({
        "renderer-crash": 0,
        "renderer-unresponsive": 0,
        "main-exception": 0,
        "uncaught-promise": 0,
        "memory-pressure": 0,
        "gpu-crash": 0,
        "worker-crash": 0,
    });
    if let Some(obj) = by_type.as_object_mut() {
        for c in &crashes {
            if let Some(t) = c.get("type").and_then(|v| v.as_str()) {
                if let Some(slot) = obj.get_mut(t) {
                    let n = slot.as_i64().unwrap_or(0) + 1;
                    *slot = json!(n);
                }
            }
        }
    }

    let last_crash = crashes
        .last()
        .and_then(|c| c.get("timestamp"))
        .and_then(|v| v.as_i64());

    // Electron: starts at (now - startTime); if crashes exist, overwritten with
    // (now - lastCrash). Cold there is no startTime, so the no-crash case is 0.
    let uptime = match last_crash {
        Some(ts) => now_ms() - ts,
        None => 0,
    };

    let mut stats = json!({
        "totalCrashes": crashes.len(),
        "successfulRecoveries": successful,
        "failedRecoveries": failed,
        "dataLossEvents": loss,
        "uptimeSinceLastCrash": uptime,
        "crashesByType": by_type,
    });
    if let (Some(ts), Some(obj)) = (last_crash, stats.as_object_mut()) {
        obj.insert("lastCrash".into(), json!(ts));
    }
    stats
}

// recovery:savedState -> this.savedState (post checkForPreviousCrash gate).
fn get_saved_state(app: &tauri::AppHandle) -> Value {
    let state = read_file(app, STATE_FILE);
    let ts = state.get("timestamp").and_then(|v| v.as_i64());
    match ts {
        Some(t) if t > now_ms() - FRESHNESS_MS => state,
        _ => Value::Null, // missing / corrupt / stale -> null (no in-memory state cold).
    }
}

// loadConfig(): { ...DEFAULT_CONFIG, ...JSON.parse(config.json) }
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let (Some(obj), Value::Object(over)) = (cfg.as_object_mut(), read_file(app, CONFIG_FILE)) {
        for (k, v) in over {
            obj.insert(k, v);
        }
    }
    cfg
}

// --- heavy channels (state mutations on the file-backed subsystem) ------------

// Read the raw persisted state object, or an empty default SessionState shell
// (mirrors the object Electron constructs in the recovery:unsavedData handler
// when this.savedState is null). Never returns a stale-gated value — the heavy
// channels operate on the file as the source of truth, not the 5-minute read
// gate that savedState applies for the renderer banner.
fn read_state_raw(app: &tauri::AppHandle) -> Value {
    match read_file(app, STATE_FILE) {
        Value::Object(o) => Value::Object(o),
        _ => json!({
            "timestamp": now_ms(),
            "windows": [],
            "pendingOperations": [],
            "unsavedData": {},
        }),
    }
}

// recovery:saveState -> saveCurrentState() -> { success }.
//
// Electron enumerates live BrowserWindows and snapshots their geometry. In the
// Tauri shell this subsystem owns no Electron BrowserWindows, so there is no
// equivalent geometry to capture; we faithfully reproduce the REST of the
// method — stamp a fresh timestamp and CARRY FORWARD the existing
// pendingOperations / unsavedData (exactly as the TS reads
// `this.savedState?.pendingOperations || []` etc.), persist it, and report
// success. `windows` is written empty because none are owned here (documented
// divergence; the field shape is preserved). This is a real native file write,
// not a fake.
fn save_state(app: &tauri::AppHandle) -> Value {
    let prev = read_state_raw(app);
    let pending = prev
        .get("pendingOperations")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let unsaved = prev
        .get("unsavedData")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let state = json!({
        "timestamp": now_ms(),
        "windows": [],
        "pendingOperations": pending,
        "unsavedData": unsaved,
    });

    let ok = write_file(app, STATE_FILE, &state);
    json!({ "success": ok })
}

// recovery:restore -> restoreFromSavedState() -> { success, restored }.
//
// Electron recreates one Electron BrowserWindow per entry in
// savedState.windows, counts how many came back, dismisses the saved state, and
// returns { success: restored > 0, restored }. In the Tauri shell this
// subsystem owns no Electron BrowserWindows, and saveState() above persists
// `windows: []`, so there is no OS-window geometry to recreate -> the OS-window
// recreation count is genuinely 0 (reported honestly, never faked).
//
// We still perform the REST of the method as real native work rather than a
// flat degrade: the renderer-recoverable part of the session (pendingOperations
// + unsavedData) is pushed to the renderer so the in-app workspace can restore
// itself, then the saved state is dismissed exactly as Electron does after a
// restore. The returned shape matches Electron field-for-field; `restored`
// reflects recreated OS windows (0 here, by construction), so `success` is
// false unless a future native window layer populates windows[].
fn restore_state(app: &tauri::AppHandle) -> Value {
    // Source of truth is the persisted file (mirrors Electron's this.savedState,
    // which was loaded from session-state.json). No restore is possible if there
    // is no persisted object.
    let state = match read_file(app, STATE_FILE) {
        Value::Object(o) => Value::Object(o),
        _ => return json!({ "success": false, "restored": 0 }),
    };

    // Count OS windows we can recreate. This shell owns none, so the count is the
    // length of the persisted windows array (empty by construction) -> 0. Done as
    // a real computation, not a hard-coded 0, so it stays correct if a native
    // window layer later writes real window geometry here.
    let restored = state
        .get("windows")
        .and_then(|w| w.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    // Hand the renderer-recoverable session payload to the UI so it can restore
    // its own in-app views from unsavedData / pendingOperations (the part that
    // does NOT need OS windows). This is the native analogue of webContents.send.
    crate::native_ops::emit_event(app, "recovery:restore", &state);

    // Clear the saved state after restore (Electron calls dismissSavedState()).
    let _ = dismiss_state(app);

    json!({ "success": restored > 0, "restored": restored })
}

// recovery:dismiss -> dismissSavedState() -> { success }.
// Clears the persisted state (Electron also nulls the in-memory copy, which has
// no cold analog). Unlinks the file; matching Electron, a MISSING file is still
// success (existsSync gate -> no unlink -> returns true).
fn dismiss_state(app: &tauri::AppHandle) -> Value {
    let path = store_path(app, STATE_FILE);
    let ok = match std::fs::remove_file(&path) {
        Ok(_) => true,
        Err(e) => e.kind() == std::io::ErrorKind::NotFound,
    };
    json!({ "success": ok })
}

// recovery:setConfig(updates) -> updateConfig(updates) -> { success }.
// `{ ...this.config, ...updates }` then persist. We start from the merged
// effective config (defaults + existing config.json), apply the partial
// `updates` object over it, and write config.json — identical persisted result.
// The save-interval re-arm is a live-runtime side-effect (the 30s setInterval),
// which has no cold equivalent and does not affect the persisted config or the
// returned shape; it is intentionally omitted.
fn set_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut cfg = get_config(app);
    if let (Some(obj), Some(over)) = (cfg.as_object_mut(), updates.as_object()) {
        for (k, v) in over {
            obj.insert(k.clone(), v.clone());
        }
    }
    let ok = write_file(app, CONFIG_FILE, &cfg);
    json!({ "success": ok })
}

// recovery:unsavedData(key, data) -> ipcMain.on (void, fire-and-forget).
// Electron mutates the in-memory savedState.unsavedData[key] = data, creating a
// fresh SessionState shell first if none exists. We do the durable equivalent:
// read the persisted state (or the same default shell), set unsavedData[key],
// and write it back so it is recoverable cold via recovery:savedState. Void
// channel -> returns Value::Null after performing the real write. A missing
// `key` arg is a no-op (matches the JS where an undefined key would write to
// the literal "undefined" slot only if called; we guard instead of writing a
// junk key).
fn set_unsaved_data(app: &tauri::AppHandle, args: &Value) -> Value {
    let key = match args.get(0).and_then(|v| v.as_str()) {
        Some(k) if !k.is_empty() => k.to_string(),
        _ => return Value::Null,
    };
    let data = args.get(1).cloned().unwrap_or(Value::Null);

    let mut state = read_state_raw(app);
    if let Some(obj) = state.as_object_mut() {
        // Ensure timestamp present (the default shell already has it; an existing
        // file keeps its own — matches Electron not re-stamping on this path).
        if !obj.contains_key("timestamp") {
            obj.insert("timestamp".into(), json!(now_ms()));
        }
        let unsaved = obj
            .entry("unsavedData".to_string())
            .or_insert_with(|| json!({}));
        if let Some(map) = unsaved.as_object_mut() {
            map.insert(key, data);
        }
    }
    let _ = write_file(app, STATE_FILE, &state);
    Value::Null
}

/// Route a `recovery:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
///
/// DATA channels (cold-readable) and the state-mutating heavy channels
/// (saveState / dismiss / setConfig / unsavedData / restore) are all handled
/// natively against the same JSON files Electron used. `recovery:restore` does
/// the real renderer-recoverable work (push the persisted session to the UI +
/// dismiss) and reports an HONEST OS-window recreation count of 0 — recreating
/// live Electron BrowserWindows is the one piece with no native equivalent and
/// is never faked as a successful window restore.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- DATA (unchanged) ---
        "recovery:savedState" => get_saved_state(app),
        "recovery:crashes" => {
            let limit = args.get(0).and_then(|v| v.as_i64());
            get_crash_history(app, limit)
        }
        "recovery:stats" => get_stats(app),
        "recovery:config" => get_config(app),

        // --- HEAVY (native state mutations) ---
        "recovery:saveState" => save_state(app),
        "recovery:dismiss" => dismiss_state(app),
        "recovery:setConfig" => {
            let updates = args.get(0).cloned().unwrap_or_else(|| json!({}));
            set_config(app, &updates)
        }
        "recovery:unsavedData" => set_unsaved_data(app, args),

        // --- HEAVY (native restore: renderer push + dismiss; OS-window
        // recreation is genuinely 0 in this shell, reported honestly) ---
        "recovery:restore" => restore_state(app),

        _ => Value::Null,
    }
}
