// =============================================================================
// DEX Tauri - Maintenance subsystem (port of the `maintenance:*` data surface
// of src/main/controllers/FeatureFlagsController.ts).
//
// Pure-data, electron-store-JSON tier. The Electron controller created an
// UNNAMED `electron-store` (`new Store({ defaults: {...} })`), which electron-
// store materializes as `config.json` at the ROOT of userData. The maintenance
// state lives under that store's top-level `maintenance` key, defaulting to
// `{ enabled: false, disabledFeatures: [] }`. We mirror the SAME file name
// (config.json under <appData>) and the SAME top-level key wrapper so the
// renderer is unchanged.
//
// Channels & shapes:
//   - maintenance:getState -> MaintenanceState
//         { enabled: boolean,
//           reason?: string,            // present only once enable() set it
//           startedAt?: string,         // ISO string, present only after enable()
//           scheduledEnd?: string,      // present only after enable()
//           disabledFeatures: string[] }
//     On a fresh store this is exactly `{ enabled: false, disabledFeatures: [] }`
//     (the electron-store default), with no reason/startedAt/scheduledEnd keys -
//     matching what `store.get('maintenance')` returns before any enable().
//
// HEAVY channels NOW PORTED (real native state mutation):
//   - maintenance:enable(reason?, scheduledEnd?) -> { success: true }
//         Writes { enabled:true, reason, startedAt:<ISO now>, scheduledEnd,
//         disabledFeatures:[] } to the `maintenance` key of config.json,
//         mirroring FeatureFlagsController.enableMaintenance EXACTLY (same shape,
//         same `new Date().toISOString()` startedAt). `reason`/`scheduledEnd` are
//         omitted from the stored object when not supplied (Electron stored them
//         as `undefined`, which electron-store/JSON drops, so omission is parity).
//   - maintenance:disable() -> { success: true }
//         Writes { enabled:false, disabledFeatures:[] } to the same key, exactly
//         like FeatureFlagsController.disableMaintenance (no reason/startedAt/
//         scheduledEnd carried over).
// Both do a read-modify-write of the SHARED config.json, touching ONLY the
// `maintenance` key so featureFlags/apiVersion/lastMigration are preserved.
//
// NATIVE ENHANCEMENT (documented divergence): enable() additionally honors a
// future `scheduledEnd` by spawning a std::thread that, at that wall-clock time,
// auto-disables maintenance (same write disable() performs) IF and ONLY IF the
// stored state is still enabled with the SAME startedAt (so a later enable/disable
// supersedes the timer and the stale thread no-ops). Electron only persisted
// scheduledEnd without ever acting on it; the renderer never relied on auto-
// revert, so this is purely additive and never contradicts the stored shape.
//
// DIVERGENCES (documented):
//   - File name: the Electron Store had no explicit `name`, so its on-disk file
//     is the electron-store default `config.json`. This same file also backs
//     featureFlags / apiVersion / lastMigration; getState is read-only and
//     enable/disable do a read-modify-write that re-inserts ONLY the `maintenance`
//     key, preserving every sibling key, so no other key is disturbed.
//   - If config.json is absent or the `maintenance` key is unset, we return the
//     electron-store default `{ enabled: false, disabledFeatures: [] }` verbatim
//     rather than null, mirroring electron-store's defaults behavior.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const STORE_FILE: &str = "config.json";
const MAINTENANCE_KEY: &str = "maintenance";

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// electron-store default for the `maintenance` key.
fn default_state() -> Value {
    json!({ "enabled": false, "disabledFeatures": [] })
}

// store.get('maintenance') -> MaintenanceState. Returns the persisted object if
// present; otherwise the electron-store default.
fn get_state(app: &tauri::AppHandle) -> Value {
    match read_store(app).get(MAINTENANCE_KEY) {
        Some(v) if v.is_object() => v.clone(),
        _ => default_state(),
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Format epoch milliseconds as a UTC ISO-8601 string with millisecond precision
// and a `Z` suffix, byte-for-byte matching JavaScript's `new Date(ms).toISOString()`
// (e.g. "2026-06-19T12:34:56.789Z"). Pure integer civil-calendar math, no deps.
fn iso_from_millis(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let secs_of_day = secs.rem_euclid(86_400);
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    // Civil-from-days algorithm (Howard Hinnant), days since 1970-01-01.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let day = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let month = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let year = if month <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, minute, second, millis
    )
}

// Read-modify-write of the SHARED config.json: set ONLY the `maintenance` key to
// `new_state`, preserving every other top-level key (featureFlags, apiVersion,
// lastMigration, ...). If the file is absent/corrupt we start from an empty
// object so a fresh enable() still persists, mirroring electron-store creating
// the file on first `set`.
fn set_state(app: &tauri::AppHandle, new_state: &Value) {
    let mut root = match read_store(app) {
        v @ Value::Object(_) => v,
        _ => Value::Object(serde_json::Map::new()),
    };
    if let Value::Object(map) = &mut root {
        map.insert(MAINTENANCE_KEY.to_string(), new_state.clone());
    }
    if let Ok(raw) = serde_json::to_string_pretty(&root) {
        let _ = crate::write_atomic(store_path(app), raw);
    }
}

// FeatureFlagsController.enableMaintenance(reason?, scheduledEnd?). Builds the
// state object with the same key set and the same startedAt semantics, omitting
// reason/scheduledEnd when not provided (electron-store/JSON drops `undefined`).
fn build_enabled_state(reason: Option<&str>, scheduled_end: Option<&str>, started_at: &str) -> Value {
    let mut obj = serde_json::Map::new();
    obj.insert("enabled".to_string(), json!(true));
    if let Some(r) = reason {
        obj.insert("reason".to_string(), json!(r));
    }
    obj.insert("startedAt".to_string(), json!(started_at));
    if let Some(s) = scheduled_end {
        obj.insert("scheduledEnd".to_string(), json!(s));
    }
    obj.insert("disabledFeatures".to_string(), json!([]));
    Value::Object(obj)
}

// Parse an ISO-8601 timestamp (as produced by JS `toISOString`, or any
// "YYYY-MM-DDTHH:MM[:SS[.mmm]]" with optional trailing `Z`) into epoch millis.
// Returns None on any unexpected shape so a malformed scheduledEnd simply skips
// the auto-revert timer rather than misfiring.
fn parse_iso_to_millis(s: &str) -> Option<i64> {
    let s = s.trim().trim_end_matches('Z');
    let (date, time) = s.split_once('T')?;
    let mut dp = date.split('-');
    let year: i64 = dp.next()?.parse().ok()?;
    let month: i64 = dp.next()?.parse().ok()?;
    let day: i64 = dp.next()?.parse().ok()?;

    let (hms, frac) = match time.split_once('.') {
        Some((a, b)) => (a, b),
        None => (time, ""),
    };
    let mut tp = hms.split(':');
    let hour: i64 = tp.next()?.parse().ok()?;
    let minute: i64 = tp.next()?.parse().ok()?;
    let second: i64 = tp.next().unwrap_or("0").parse().ok()?;
    let millis: i64 = if frac.is_empty() {
        0
    } else {
        // Take up to 3 fractional digits, right-pad to milliseconds.
        let mut f = frac.chars().take(3).collect::<String>();
        while f.len() < 3 {
            f.push('0');
        }
        f.parse().ok()?
    };

    // days_from_civil (Howard Hinnant), inverse of iso_from_millis.
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;

    Some(((days * 86_400 + hour * 3600 + minute * 60 + second) * 1000) + millis)
}

// NATIVE ENHANCEMENT: spawn a thread that auto-disables maintenance at
// `scheduled_end_ms`, but only if the persisted state is STILL the enable() that
// armed it (same startedAt + still enabled). A later enable/disable changes
// startedAt or enabled, so the stale thread no-ops on wake. Compute-on-read would
// be cleaner but the renderer reads stored state verbatim, so we materialize the
// revert into the same file the way disable() would.
fn schedule_auto_revert(app: &tauri::AppHandle, scheduled_end_ms: i64, started_at: String) {
    let now = now_ms();
    let delay = scheduled_end_ms - now;
    if delay <= 0 {
        return; // Already past; leave state as enabled, matching "no auto-revert ran".
    }
    let app = app.clone();
    crate::util::spawn_named("maintenance", move || {
        std::thread::sleep(std::time::Duration::from_millis(delay as u64));
        let still_armed = read_store(&app)
            .get(MAINTENANCE_KEY)
            .map(|m| {
                m.get("enabled").and_then(|e| e.as_bool()).unwrap_or(false)
                    && m.get("startedAt").and_then(|s| s.as_str()) == Some(started_at.as_str())
            })
            .unwrap_or(false);
        if still_armed {
            set_state(&app, &default_state());
        }
    });
}

/// Route a `maintenance:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// accounted for: getState returns the shaped state, and enable/disable perform
/// the real config.json state mutation and return `{ success: true }`.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "maintenance:getState" => get_state(app),

        // enableMaintenance(reason?, scheduledEnd?) -> { success: true }
        "maintenance:enable" => {
            let reason = args.get(0).and_then(|v| v.as_str());
            let scheduled_end = args.get(1).and_then(|v| v.as_str());
            let started_at = iso_from_millis(now_ms());
            let state = build_enabled_state(reason, scheduled_end, &started_at);
            set_state(app, &state);
            // Arm the native auto-revert if a parseable future scheduledEnd was given.
            if let Some(end_ms) = scheduled_end.and_then(parse_iso_to_millis) {
                schedule_auto_revert(app, end_ms, started_at);
            }
            json!({ "success": true })
        }

        // disableMaintenance() -> { success: true }
        "maintenance:disable" => {
            set_state(app, &default_state());
            json!({ "success": true })
        }

        _ => Value::Null,
    }
}
