// =============================================================================
// DEX 6.0 — Theme Schedule (Tauri port of src/main/core/ThemeScheduleManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Automatic theme switching settings (theme-schedule:* channels), persisting the
//! schedule into the shared `dex.db` `settings` table with the identical keys,
//! defaults, and return shapes as the Electron manager (Feature 36). The
//! schedule CRUD (mode / light+dark times / lat+lon) is ported faithfully, as is
//! the pure sunrise/sunset math behind `getInfo`.
//!
//! NOTE: the prefix is `theme-schedule:` (hyphenated) — NOT the bare `theme:`
//! prefix, so there is no collision with the existing theme:* handlers.
//!
//! The live side of the manager — applying the theme to the BrowserWindow via
//! Electron's `nativeTheme`, the per-minute scheduler timer, and pushing the
//! `theme-schedule:changed` event to the renderer — is an OS/UI concern that does
//! not exist in this pure DB layer. The void setters therefore persist the
//! schedule and return `{ success: true }`, while the live theme application is
//! intentionally not performed here (it belongs in the Tauri command layer).

use rusqlite::{params, Connection};
use serde_json::{json, Value};

/// Ensure the shared `settings` table exists (owned by DatabaseManager). The
/// manager only reads/writes settings; it creates no tables of its own, so we
/// just guarantee `settings` is present (matching the foreign-table degrade rule)
/// before any get/set so the reads never throw.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    );
}

/// Read a value from the shared settings table (matches getSetting(key, default)).
fn get_setting(conn: &Connection, key: &str, default: &str) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| default.to_string())
}

/// Write a value into the shared settings table (matches setSetting(key, value)).
fn set_setting(conn: &Connection, key: &str, value: &str) {
    let _ = conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
        params![key, value, value],
    );
}

/// Parse a settings string to f64 the way `parseFloat` does (default '0' -> 0.0).
/// parseFloat returns NaN on a non-numeric string; getInfo only compares
/// `latitude !== 0`, so NaN there would be truthy. To match parseFloat's leading
/// numeric prefix behaviour we strip from the first invalid char; a fully
/// non-numeric value yields NaN, represented here as f64::NAN.
fn parse_float(s: &str) -> f64 {
    let trimmed = s.trim_start();
    let mut end = 0;
    let bytes = trimmed.as_bytes();
    let mut seen_dot = false;
    let mut seen_digit = false;
    let mut i = 0;
    if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
        i += 1;
        end = i;
    }
    while i < bytes.len() {
        let c = bytes[i];
        if c.is_ascii_digit() {
            seen_digit = true;
            i += 1;
            end = i;
        } else if c == b'.' && !seen_dot {
            seen_dot = true;
            i += 1;
            end = i;
        } else {
            break;
        }
    }
    if !seen_digit {
        return f64::NAN;
    }
    trimmed[..end].parse::<f64>().unwrap_or(f64::NAN)
}

/// The ThemeSchedule object: mode/lightStart/darkStart/latitude/longitude,
/// read from the shared settings table with the same defaults as the TS.
fn get_schedule(conn: &Connection) -> Value {
    let mode = get_setting(conn, "theme_schedule_mode", "system");
    let light_start = get_setting(conn, "theme_light_start", "07:00");
    let dark_start = get_setting(conn, "theme_dark_start", "19:00");
    let latitude = parse_float(&get_setting(conn, "theme_latitude", "0"));
    let longitude = parse_float(&get_setting(conn, "theme_longitude", "0"));
    json!({
        "mode": mode,
        "lightStart": light_start,
        "darkStart": dark_start,
        "latitude": num_or_null(latitude),
        "longitude": num_or_null(longitude),
    })
}

/// JSON cannot represent NaN; parseFloat NaN serializes as null in practice.
fn num_or_null(n: f64) -> Value {
    serde_json::Number::from_f64(n).map(Value::Number).unwrap_or(Value::Null)
}

/// Pure sunrise/sunset computation (matches computeSunTimes verbatim): simplified
/// declination + hour-angle model returning "HH:MM" strings, clamped to [0,23.99].
fn compute_sun_times(lat: f64, lon: f64) -> (String, String) {
    use std::f64::consts::PI;

    // dayOfYear from the start of the current year (Date(year, 0, 0) base).
    let day_of_year = current_day_of_year();

    let declination = 23.45 * ((2.0 * PI / 365.0) * (day_of_year - 81.0)).sin();
    let dec_rad = declination * PI / 180.0;
    let lat_rad = lat * PI / 180.0;

    let mut cos_h = -lat_rad.tan() * dec_rad.tan();
    cos_h = cos_h.max(-1.0).min(1.0);
    let hour_angle = cos_h.acos() * 180.0 / PI;

    let solar_noon = 12.0 - lon / 15.0;
    let sunrise_hour = solar_noon - hour_angle / 15.0;
    let sunset_hour = solar_noon + hour_angle / 15.0;

    (clamp_time(sunrise_hour), clamp_time(sunset_hour))
}

/// h -> "HH:MM" clamped into [0, 23.99] (matches the TS `clamp` closure).
fn clamp_time(h: f64) -> String {
    let clamped = h.max(0.0).min(23.99);
    let hours = clamped.floor() as i64;
    let minutes = ((clamped - hours as f64) * 60.0).floor() as i64;
    format!("{:02}:{:02}", hours, minutes)
}

/// Day-of-year using the same base as the TS (`new Date(year, 0, 0)`), i.e. the
/// number of whole days since the day before Jan 1 of the current local year.
fn current_day_of_year() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    // Whole days since the Unix epoch.
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days_since_epoch = secs.div_euclid(86400);

    // Find Jan 1 of the current year (days since epoch), then dayOfYear is the
    // delta. The TS base is Date(year,0,0) (Dec 31 prev year), so dayOfYear is
    // `floor((now - base)/86400000)` = days since Jan 1 + 1; we reproduce that
    // by counting from Jan 1 and adding 1.
    let (year, _, _) = civil_from_days(days_since_epoch);
    let jan1 = days_from_civil(year, 1, 1);
    (days_since_epoch - jan1 + 1) as f64
}

/// Convert days-since-epoch -> (year, month, day) (Howard Hinnant's algorithm).
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Convert (year, month, day) -> days-since-epoch (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// The valid mode allow-list (matches `validModes` in setMode).
const VALID_MODES: [&str; 5] = ["system", "manual-light", "manual-dark", "scheduled", "solar"];

/// theme-schedule:getInfo — getCurrentInfo(). Returns
/// { schedule, currentTheme, sunTimes? }. `schedule` and `sunTimes` are derived
/// purely from the persisted settings; `currentTheme` is the live applied theme
/// in Electron (set by the scheduler/nativeTheme), which has no analogue here —
/// at startup loadSchedule() seeds it to the stored mode, which is the
/// deterministic value we reproduce.
fn get_info(conn: &Connection) -> Value {
    let schedule = get_schedule(conn);
    let current_theme = get_setting(conn, "theme_schedule_mode", "system");

    let mut result = json!({
        "schedule": schedule.clone(),
        "currentTheme": current_theme,
    });

    // sunTimes only when mode === 'solar' && latitude !== 0 (matches the TS guard).
    let mode = schedule.get("mode").and_then(|v| v.as_str()).unwrap_or("");
    let lat = schedule.get("latitude").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let lon = schedule.get("longitude").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if mode == "solar" && lat != 0.0 {
        let (sunrise, sunset) = compute_sun_times(lat, lon);
        if let Some(obj) = result.as_object_mut() {
            obj.insert("sunTimes".to_string(), json!({ "sunrise": sunrise, "sunset": sunset }));
        }
    }

    result
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "theme-schedule:getInfo" => get_info(conn),

        // setMode(mode): void. Persists the mode when it is in the allow-list
        // (invalid modes are a silent no-op, matching `if (!validModes...) return`).
        // The live applyScheduledTheme() (nativeTheme + renderer push) is not
        // ported; the persistence is. Void handler -> { success: true }.
        "theme-schedule:setMode" => {
            let mode = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            if VALID_MODES.contains(&mode) {
                set_setting(conn, "theme_schedule_mode", mode);
            }
            json!({ "success": true })
        }

        // setTimes(lightStart, darkStart): void. Persists both, then would apply
        // the theme live (not ported). Void handler -> { success: true }.
        "theme-schedule:setTimes" => {
            let light_start = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let dark_start = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            set_setting(conn, "theme_light_start", light_start);
            set_setting(conn, "theme_dark_start", dark_start);
            json!({ "success": true })
        }

        // setLocation(latitude, longitude): void. The TS coerces each via
        // String(value); persists both, then would apply the theme live (not
        // ported). Void handler -> { success: true }.
        "theme-schedule:setLocation" => {
            let latitude = num_arg_to_string(args.get(0));
            let longitude = num_arg_to_string(args.get(1));
            set_setting(conn, "theme_latitude", &latitude);
            set_setting(conn, "theme_longitude", &longitude);
            json!({ "success": true })
        }

        _ => Value::Null,
    }
}

/// String(value) coercion for a numeric arg coming over IPC: numbers stringify
/// without quotes, missing/other types fall back to "0" to keep the stored value
/// numeric-parseable (the renderer always sends numbers here).
fn num_arg_to_string(v: Option<&Value>) -> String {
    match v {
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::String(s)) => s.clone(),
        _ => "0".to_string(),
    }
}
