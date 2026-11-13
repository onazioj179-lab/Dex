// =============================================================================
// DEX Tauri — Battery subsystem (port of the `battery:*` IPC handlers in
// core/BatteryAwareOperation.ts).
//
// Pure-data / config tier. Electron persisted ONE plain JSON file under
// userData via fs.writeFile ('battery-config.json', the BatteryConfig object at
// top level, NO wrapper key) and merged it over DEFAULT_CONFIG on load. This
// module mirrors that file 1:1 under <appData>/battery-config.json. The profile/
// restriction/status/state values were all DERIVED at runtime from the live
// battery reading; the return shapes here match the Electron handlers exactly so
// the renderer (Learn.tsx reads getProfile -> string, getRestrictions -> object)
// is unchanged.
//
// Channels & shapes (DATA tier ported here):
//   - battery:getStatus       -> BatteryStatus
//        { level:number, charging:bool, timeRemaining:number|null,
//          powerSource:"ac"|"battery"|"unknown" }
//   - battery:getProfile      -> PowerProfile (string: full|balanced|
//          conservative|minimal|emergency)
//   - battery:getRestrictions -> ProfileRestrictions (the PROFILE_RESTRICTIONS
//          entry for the current profile)
//   - battery:getConfig       -> BatteryConfig (DEFAULT_CONFIG merged with the
//          persisted battery-config.json, exactly as loadConfig() produced it)
//   - battery:getState        -> BatteryState
//        { currentStatus, currentProfile, lastProfileChange, profileHistory[],
//          warningsShown[], sessionEnergyUsage }
//
// HEAVY channels NOW PORTED with real native behavior (see below): setConfig,
// getEventLog, forceCheck, setProfile. The in-memory singleton state Electron
// kept at runtime (config, mutable BatteryState, eventLog, manual override) is
// persisted to JSON files under <appData> so this stateless dispatcher can
// reproduce the same observable behavior across calls. The four write/check
// channels mutate those files and emit the same renderer events Electron emitted
// via webContents.send (profile-change).
//
// REAL BATTERY READING (Windows): getStatus / forceCheck now read the live
// battery via PowerShell `Win32_Battery` (EstimatedChargeRemaining +
// BatteryStatus), exactly the source Electron's getWindowsBatteryLevel used,
// spawned with CREATE_NO_WINDOW (precedent: power.rs `run`). On non-Windows, or
// when no battery / the query fails, we fall back to Electron's documented
// "assume plugged in" path (level 100, charging, AC) — identical to Electron's
// estimateBatteryLevel() catch returning 100.
//
// DIVERGENCES (documented):
//   - sysinfo exposes no battery API and we add no new crate, so the Windows
//     reading goes through PowerShell like Electron itself did.
//   - STATE persistence: Electron held BatteryState only in memory. We persist
//     the mutating fields (currentProfile when manually overridden,
//     lastProfileChange, profileHistory, warningsShown, sessionEnergyUsage) to
//     <appData>/battery-state.json and the eventLog to
//     <appData>/battery-events.json so getState/getEventLog/setProfile/forceCheck
//     compose correctly. currentStatus is always recomputed from the live
//     reading (never trusted from disk), matching performBatteryCheck which
//     overwrites currentStatus on every check.
//   - A MANUAL profile override (setProfile) is honored by getProfile/getState/
//     getRestrictions until a forceCheck/auto re-derivation clears it — mirroring
//     Electron, where setProfile assigned currentProfile directly and the next
//     performBatteryCheck/updateProfile would re-derive it from battery level.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const CONFIG_FILE: &str = "battery-config.json";
const STATE_FILE: &str = "battery-state.json";
const EVENTS_FILE: &str = "battery-events.json";

// Electron capped eventLog at 500 (slice to last 250) and profileHistory at 100
// (slice to last 50). Preserve both caps so persisted files cannot grow forever.
const EVENT_LOG_MAX: usize = 500;
const EVENT_LOG_KEEP: usize = 250;
const PROFILE_HISTORY_MAX: usize = 100;
const PROFILE_HISTORY_KEEP: usize = 50;

const VALID_PROFILES: [&str; 5] = ["full", "balanced", "conservative", "minimal", "emergency"];

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO ----------------------------------------------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Persist a value as pretty JSON, mirroring Electron's
// `fs.writeFile(path, JSON.stringify(x, null, 2))`. Errors are swallowed exactly
// like saveConfig()'s try/catch (it logged and continued).
fn write_file(app: &tauri::AppHandle, name: &str, value: &Value) {
    if let Ok(raw) = serde_json::to_string_pretty(value) {
        let _ = crate::write_atomic(store_path(app, name), raw);
    }
}

// --- defaults (mirror DEFAULT_CONFIG / PROFILE_RESTRICTIONS) -----------------

fn default_config() -> Value {
    json!({
        "enabled": true,
        "respectSystemPowerMode": true,
        "thresholds": {
            "emergency": 10,
            "minimal": 20,
            "conservative": 35,
            "balanced": 50
        },
        "checkIntervalMs": 30000,
        "showBatteryWarnings": true,
        "autoSleepOnCritical": false,
        "criticalBatteryAction": "save-and-minimize"
    })
}

// PROFILE_RESTRICTIONS[profile] — exact field values from BatteryAwareOperation.
fn profile_restrictions(profile: &str) -> Value {
    match profile {
        "full" | "balanced" => json!({
            "allowBackgroundSync": true,
            "allowIndexing": true,
            "allowAgentOperations": true,
            "allowNotifications": true,
            "pollingIntervalMultiplier": 1,
            "cpuThrottlePercent": 100,
            "reducedAnimations": false,
            "pauseNonEssentialTimers": false,
            "disablePreloading": false
        }),
        "conservative" => json!({
            "allowBackgroundSync": true,
            "allowIndexing": true,
            "allowAgentOperations": true,
            "allowNotifications": true,
            "pollingIntervalMultiplier": 1.5,
            "cpuThrottlePercent": 80,
            "reducedAnimations": false,
            "pauseNonEssentialTimers": false,
            "disablePreloading": false
        }),
        "minimal" => json!({
            "allowBackgroundSync": true,
            "allowIndexing": false,
            "allowAgentOperations": true,
            "allowNotifications": true,
            "pollingIntervalMultiplier": 2,
            "cpuThrottlePercent": 60,
            "reducedAnimations": true,
            "pauseNonEssentialTimers": false,
            "disablePreloading": false
        }),
        "emergency" => json!({
            "allowBackgroundSync": false,
            "allowIndexing": false,
            "allowAgentOperations": true,
            "allowNotifications": true,
            "pollingIntervalMultiplier": 3,
            "cpuThrottlePercent": 40,
            "reducedAnimations": true,
            "pauseNonEssentialTimers": true,
            "disablePreloading": true
        }),
        // Unknown profile: Electron's PROFILE_RESTRICTIONS lookup would be
        // undefined; only the five keys above exist. Fall back to "full".
        _ => profile_restrictions("full"),
    }
}

// loadConfig(): this.config = { ...DEFAULT_CONFIG, ...saved }. Shallow merge of
// the persisted top-level keys over the defaults.
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let (Some(base), Some(saved)) = (cfg.as_object_mut(), read_file(app, CONFIG_FILE).as_object())
    {
        for (k, v) in saved {
            base.insert(k.clone(), v.clone());
        }
    }
    cfg
}

// Run a command hidden (no console flash / AV noise on Windows), returning its
// stdout. Precedent: power.rs `run` (CREATE_NO_WINDOW). Returns None on failure.
fn run_capture(program: &str, args: &[&str]) -> Option<String> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        None
    }
}

// Live Windows battery reading via Win32_Battery — the exact WMI source
// Electron's getWindowsBatteryLevel used. EstimatedChargeRemaining is the 0-100
// level; BatteryStatus codes 2 (AC), 6/7/8/9 (charging) mean plugged in/charging.
// Returns (level, charging). None when there is no battery / the query fails.
#[cfg(windows)]
fn read_windows_battery() -> Option<(f64, bool)> {
    let script = "$b = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1; if ($b) { \"$($b.EstimatedChargeRemaining)|$($b.BatteryStatus)\" } else { 'none' }";
    let raw = run_capture(
        "powershell",
        &["-NoProfile", "-NonInteractive", "-Command", script],
    )?;
    let line = raw.trim();
    if line.is_empty() || line == "none" {
        return None;
    }
    let mut parts = line.split('|');
    let level: f64 = parts.next()?.trim().parse().ok()?;
    let status_code: i64 = parts.next().unwrap_or("").trim().parse().unwrap_or(2);
    // Win32_Battery.BatteryStatus: 2 = on AC, 3..=5 = discharging states,
    // 6/7/8/9 = charging variants. Treat anything other than "discharging" as
    // charging/plugged in (matches Electron's !isOnBatteryPower charging flag).
    let discharging = matches!(status_code, 1 | 3 | 4 | 5 | 10 | 11);
    Some((level, !discharging))
}

#[cfg(not(windows))]
fn read_windows_battery() -> Option<(f64, bool)> {
    None
}

// getBatteryStatus() — REAL reading where possible. On Windows query the live
// battery; on failure / no battery / other platforms fall back to Electron's
// documented "assume plugged in" path (level 100, charging, AC), identical to
// estimateBatteryLevel() returning 100 with isOnBatteryPower absent.
fn get_status() -> Value {
    match read_windows_battery() {
        Some((level, charging)) => json!({
            "level": level,
            "charging": charging,
            "timeRemaining": Value::Null,
            "powerSource": if charging { "ac" } else { "battery" }
        }),
        None => json!({
            "level": 100,
            "charging": true,
            "timeRemaining": Value::Null,
            "powerSource": "ac"
        }),
    }
}

// determineProfile(status): AC / charging is always "full". With the documented
// fallback status above this is constant, but kept faithful to the source logic.
fn determine_profile(status: &Value, config: &Value) -> String {
    let charging = status.get("charging").and_then(|v| v.as_bool()).unwrap_or(false);
    let source = status.get("powerSource").and_then(|v| v.as_str()).unwrap_or("unknown");
    if source == "ac" || charging {
        return "full".to_string();
    }
    let level = status.get("level").and_then(|v| v.as_f64()).unwrap_or(100.0);
    let th = config.get("thresholds");
    let t = |k: &str, d: f64| th.and_then(|o| o.get(k)).and_then(|v| v.as_f64()).unwrap_or(d);
    if level <= t("emergency", 10.0) {
        "emergency".to_string()
    } else if level <= t("minimal", 20.0) {
        "minimal".to_string()
    } else if level <= t("conservative", 35.0) {
        "conservative".to_string()
    } else if level <= t("balanced", 50.0) {
        "balanced".to_string()
    } else {
        "full".to_string()
    }
}

// Persisted, mutable portion of BatteryState (everything except the always-live
// currentStatus). Created lazily from defaults so getState works before any
// write. `manualProfile` records a setProfile() override that getProfile honors
// until the next forceCheck re-derives from the live battery (mirrors Electron).
fn read_state(app: &tauri::AppHandle) -> Value {
    let stored = read_file(app, STATE_FILE);
    if stored.is_object() {
        stored
    } else {
        json!({
            "manualProfile": Value::Null,
            "lastProfileChange": now_ms(),
            "profileHistory": [],
            "warningsShown": [],
            "sessionEnergyUsage": 0
        })
    }
}

// Current profile: a live manual override wins (set by setProfile, cleared by
// forceCheck), otherwise derive from the live status — exactly Electron, where
// currentProfile was either the last manual assignment or the value
// updateProfile() last derived.
fn get_profile(app: &tauri::AppHandle) -> String {
    if let Some(p) = read_state(app)
        .get("manualProfile")
        .and_then(|v| v.as_str())
        .filter(|p| VALID_PROFILES.contains(p))
    {
        return p.to_string();
    }
    determine_profile(&get_status(), &get_config(app))
}

fn get_restrictions(app: &tauri::AppHandle) -> Value {
    profile_restrictions(&get_profile(app))
}

// getState() — BatteryState. currentStatus is always the live reading;
// the mutable fields come from the persisted state file (built up by
// setProfile/forceCheck). Shape matches the Electron BatteryState exactly.
fn get_state(app: &tauri::AppHandle) -> Value {
    let status = get_status();
    let state = read_state(app);
    let profile = get_profile(app);
    json!({
        "currentStatus": status,
        "currentProfile": profile,
        "lastProfileChange": state.get("lastProfileChange").cloned().unwrap_or_else(|| json!(now_ms())),
        "profileHistory": state.get("profileHistory").cloned().unwrap_or_else(|| json!([])),
        "warningsShown": state.get("warningsShown").cloned().unwrap_or_else(|| json!([])),
        "sessionEnergyUsage": state.get("sessionEnergyUsage").cloned().unwrap_or_else(|| json!(0))
    })
}

// Append a BatteryEvent to the persisted log, applying Electron's 500/250 cap.
fn log_event(app: &tauri::AppHandle, ev_type: &str, data: Value) {
    let mut log = match read_file(app, EVENTS_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    };
    log.push(json!({
        "type": ev_type,
        "timestamp": now_ms(),
        "data": data
    }));
    if log.len() > EVENT_LOG_MAX {
        log = log.split_off(log.len() - EVENT_LOG_KEEP);
    }
    write_file(app, EVENTS_FILE, &Value::Array(log));
}

// --- heavy channels ---------------------------------------------------------

// battery:setConfig — merge partial config over current, persist, then
// re-derive the profile (updateProfile). Returns { success: true }.
fn set_config(app: &tauri::AppHandle, args: &Value) -> Value {
    let patch = args.get(0).cloned().unwrap_or(Value::Null);
    let mut cfg = get_config(app);
    if let (Some(base), Some(p)) = (cfg.as_object_mut(), patch.as_object()) {
        for (k, v) in p {
            base.insert(k.clone(), v.clone());
        }
    }
    write_file(app, CONFIG_FILE, &cfg);
    // updateProfile(): a config change can move thresholds; clear any stale
    // manual override and re-derive so the next read reflects the new config.
    update_profile(app);
    json!({ "success": true })
}

// Re-derive currentProfile from the live status + config, recording a
// profile-change event + history entry and emitting to the renderer when it
// actually changed — the native analog of updateProfile().
fn update_profile(app: &tauri::AppHandle) {
    let status = get_status();
    let cfg = get_config(app);
    let new_profile = determine_profile(&status, &cfg);
    let mut state = read_state(app);

    // Effective previous profile (manual override or last persisted derivation).
    let old_profile = state
        .get("manualProfile")
        .and_then(|v| v.as_str())
        .filter(|p| VALID_PROFILES.contains(p))
        .map(|s| s.to_string())
        .unwrap_or_else(|| determine_profile(&status, &cfg));

    // A live re-derivation clears any manual override (next forceCheck/auto check
    // would do the same in Electron).
    if let Some(obj) = state.as_object_mut() {
        obj.insert("manualProfile".into(), Value::Null);
    }

    if new_profile != old_profile {
        if let Some(obj) = state.as_object_mut() {
            obj.insert("lastProfileChange".into(), json!(now_ms()));
            let level = status.get("level").cloned().unwrap_or(json!(0));
            let charging = status.get("charging").and_then(|v| v.as_bool()).unwrap_or(false);
            let mut hist = match obj.get("profileHistory") {
                Some(Value::Array(a)) => a.clone(),
                _ => Vec::new(),
            };
            hist.push(json!({
                "profile": new_profile,
                "timestamp": now_ms(),
                "reason": format!("Battery at {}%, {}", level, if charging { "charging" } else { "discharging" })
            }));
            if hist.len() > PROFILE_HISTORY_MAX {
                hist = hist.split_off(hist.len() - PROFILE_HISTORY_KEEP);
            }
            obj.insert("profileHistory".into(), Value::Array(hist));
        }
        write_file(app, STATE_FILE, &state);
        log_event(app, "profile-change", json!({ "from": old_profile, "to": new_profile }));
        crate::native_ops::emit_event(
            app,
            "profile-change",
            &json!({ "from": old_profile, "to": new_profile, "restrictions": profile_restrictions(&new_profile) }),
        );
    } else {
        write_file(app, STATE_FILE, &state);
    }
}

// battery:getEventLog — the persisted BatteryEvent[] (empty array before any
// event), matching Electron's this.eventLog.
fn get_event_log(app: &tauri::AppHandle) -> Value {
    match read_file(app, EVENTS_FILE) {
        Value::Array(a) => Value::Array(a),
        _ => json!([]),
    }
}

// battery:forceCheck — performBatteryCheck(): take a fresh live reading, run the
// low/critical warning bookkeeping, re-derive the profile, and return the new
// currentStatus.
fn force_check(app: &tauri::AppHandle) -> Value {
    let status = get_status();
    check_battery_warnings(app, &status);
    update_profile(app);
    status
}

// checkBatteryWarnings(): record a 'low'/'critical' warning + event once per
// drain (deduped via warningsShown), and clear warnings once charging — exactly
// Electron's logic. No UI dialog is shown (that was an emit only); the persisted
// state + event log capture the same observable result.
fn check_battery_warnings(app: &tauri::AppHandle, status: &Value) {
    let cfg = get_config(app);
    if !cfg.get("showBatteryWarnings").and_then(|v| v.as_bool()).unwrap_or(true) {
        return;
    }
    let charging = status.get("charging").and_then(|v| v.as_bool()).unwrap_or(false);
    let level = status.get("level").and_then(|v| v.as_f64()).unwrap_or(100.0);
    let th = cfg.get("thresholds");
    let t = |k: &str, d: f64| th.and_then(|o| o.get(k)).and_then(|v| v.as_f64()).unwrap_or(d);

    let mut state = read_state(app);
    let mut warnings: Vec<Value> = match state.get("warningsShown") {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    let has = |w: &[Value], name: &str| w.iter().any(|v| v.as_str() == Some(name));

    if charging {
        // Reset warnings when charging (Electron cleared the array).
        if !warnings.is_empty() {
            warnings.clear();
            if let Some(o) = state.as_object_mut() {
                o.insert("warningsShown".into(), Value::Array(warnings));
            }
            write_file(app, STATE_FILE, &state);
        }
        return;
    }

    if level <= t("emergency", 10.0) {
        if !has(&warnings, "critical") {
            warnings.push(json!("critical"));
            if let Some(o) = state.as_object_mut() {
                o.insert("warningsShown".into(), Value::Array(warnings));
            }
            write_file(app, STATE_FILE, &state);
            log_event(app, "critical-battery", json!({ "level": level }));
            crate::native_ops::emit_event(app, "critical-battery", status);
        }
    } else if level <= t("minimal", 20.0) {
        if !has(&warnings, "low") {
            warnings.push(json!("low"));
            if let Some(o) = state.as_object_mut() {
                o.insert("warningsShown".into(), Value::Array(warnings));
            }
            write_file(app, STATE_FILE, &state);
            log_event(app, "low-battery", json!({ "level": level }));
            crate::native_ops::emit_event(app, "low-battery", status);
        }
    }
}

// battery:setProfile — manual override. Valid profile -> persist override, emit
// profile-change (manual: true), return { success: true, profile }. Invalid ->
// { success: false, error: 'Invalid profile' }. Mirrors Electron exactly.
fn set_profile(app: &tauri::AppHandle, args: &Value) -> Value {
    let profile = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    if !VALID_PROFILES.contains(&profile) {
        return json!({ "success": false, "error": "Invalid profile" });
    }
    let prev = get_profile(app);
    let mut state = read_state(app);
    if let Some(o) = state.as_object_mut() {
        o.insert("manualProfile".into(), json!(profile));
        o.insert("lastProfileChange".into(), json!(now_ms()));
    }
    write_file(app, STATE_FILE, &state);
    log_event(app, "profile-change", json!({ "from": prev, "to": profile, "manual": true }));
    crate::native_ops::emit_event(
        app,
        "profile-change",
        &json!({
            "from": prev,
            "to": profile,
            "restrictions": profile_restrictions(profile),
            "manual": true
        }),
    );
    json!({ "success": true, "profile": profile })
}

/// Route a `battery:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is accounted for;
/// the ported data channels return their Electron shapes, the heavy channels and
/// any unknown channel return Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "battery:getStatus" => get_status(),
        "battery:getProfile" => json!(get_profile(app)),
        "battery:getRestrictions" => get_restrictions(app),
        "battery:getConfig" => get_config(app),
        "battery:getState" => get_state(app),
        // Heavy channels — now ported with real native behavior (persisted state
        // + live battery reading + renderer events). See implementations above.
        "battery:setConfig" => set_config(app, args),
        "battery:getEventLog" => get_event_log(app),
        "battery:forceCheck" => force_check(app),
        "battery:setProfile" => set_profile(app, args),
        // Unknown channel in this namespace — honest degrade.
        _ => Value::Null,
    }
}
