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
// HEAVY channels are intentionally NOT ported (see channelsSkipped): setConfig,
// getEventLog, forceCheck, setProfile. They need the live power monitor / a
// mutable singleton runtime (event accumulation, profile override side-effects,
// periodic re-check) that does not exist in this stateless dispatcher. Routing
// in the namespace returns Value::Null for them (honest degrade).
//
// DIVERGENCES (documented):
//   - BATTERY READING: like adaptive_ctl.rs / power.rs in this tree, sysinfo
//     exposes no battery API and we add no new crate. Electron's own fallback
//     path (estimateBatteryLevel -> 100, isOnBatteryPower absent -> charging)
//     produced exactly the AC/full result we return here, so getStatus mirrors
//     that documented fallback rather than inventing a live reading:
//       level 100, charging true, timeRemaining null, powerSource "ac".
//     determineProfile() on an AC/charging status is always "full" — identical
//     to Electron when plugged in or when the battery level is unreadable.
//   - STATE is RUNTIME-ONLY in Electron (only the config file persists; the
//     BatteryState lives in the in-memory singleton). With no long-lived monitor
//     there is no accumulated profileHistory / warningsShown / energy use, so
//     getState returns the freshly-derived state with empty history arrays and
//     sessionEnergyUsage 0 — the same shape Electron held immediately after
//     detectInitialState() on a plugged-in machine. lastProfileChange is the
//     current epoch-ms (Date.now() precedent), via std::time::SystemTime.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "battery-config.json";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO ----------------------------------------------------------------

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

// getBatteryStatus() — see DIVERGENCES: no battery API, so this returns the
// exact AC/plugged-in fallback Electron produced when the level is unreadable.
fn get_status() -> Value {
    json!({
        "level": 100,
        "charging": true,
        "timeRemaining": Value::Null,
        "powerSource": "ac"
    })
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

fn get_profile(app: &tauri::AppHandle) -> String {
    determine_profile(&get_status(), &get_config(app))
}

fn get_restrictions(app: &tauri::AppHandle) -> Value {
    profile_restrictions(&get_profile(app))
}

// getState() — BatteryState. State is runtime-only in Electron; without a live
// monitor history is empty (see DIVERGENCES). Shape matches exactly.
fn get_state(app: &tauri::AppHandle) -> Value {
    let status = get_status();
    let profile = determine_profile(&status, &get_config(app));
    json!({
        "currentStatus": status,
        "currentProfile": profile,
        "lastProfileChange": now_ms(),
        "profileHistory": [],
        "warningsShown": [],
        "sessionEnergyUsage": 0
    })
}

/// Route a `battery:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is accounted for;
/// the ported data channels return their Electron shapes, the heavy channels and
/// any unknown channel return Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "battery:getStatus" => get_status(),
        "battery:getProfile" => json!(get_profile(app)),
        "battery:getRestrictions" => get_restrictions(app),
        "battery:getConfig" => get_config(app),
        "battery:getState" => get_state(app),
        // Heavy / runtime-only channels — not ported (need the live power
        // monitor + mutable singleton): setConfig, getEventLog, forceCheck,
        // setProfile. Return null rather than fake data.
        _ => Value::Null,
    }
}
