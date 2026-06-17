// =============================================================================
// DEX 6.0 — Daily Briefing (Tauri port of src/main/core/DailyBriefingManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed daily briefing (daily-briefing:* channels), reading/writing the
//! shared `dex.db` `daily_briefing_log` table with the identical schema, queries,
//! and return shapes as the Electron manager (Feature 3). The briefing aggregates
//! data the renderer already persists into the shared `settings` table
//! (`tasks_data`, `focus_sessions`) plus the manager's own per-day shown/dismissed
//! log, computing the BriefingData object exactly as the TS does.
//!
//! Two pieces of Electron state are per-process, NOT DB-backed: `dismissedToday`
//! (an in-memory flag reset every launch) and `briefingCache` (a memoized compute).
//! A stateless dispatch cannot reproduce that in-memory lifetime, so each request
//! recomputes from the DB — `getData` always returns a freshly computed briefing
//! (equivalent to a cold cache), and `shouldShow` consults only the persisted
//! `shown` flag (the transient `dismissedToday` short-circuit is honestly omitted
//! since it does not survive a process and is not part of any DB state).

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

/// Create the daily_briefing_log table (matches DailyBriefingManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS daily_briefing_log (
            date TEXT PRIMARY KEY,
            shown INTEGER DEFAULT 0,
            dismissed INTEGER DEFAULT 0
        );
        -- computeBriefing / loadSettings read the shared settings table (created
        -- by DatabaseManager); ensure it exists so the reads never throw here.
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    );
}

/// Number of whole days since the Unix epoch in UTC (floor of secs / 86400),
/// matching JavaScript's `new Date(ms).toISOString()` which is always UTC.
fn epoch_days_to_ymd(days: i64) -> String {
    // Civil-from-days algorithm (Howard Hinnant), valid for the proleptic
    // Gregorian calendar. Produces YYYY-MM-DD, the same shape as
    // toISOString().split('T')[0].
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// (today, yesterday) as YYYY-MM-DD in UTC, matching the TS date math
/// (`new Date().toISOString()` and `new Date(Date.now() - 86400000)`).
fn today_yesterday() -> (String, String) {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = now_secs.div_euclid(86400);
    (epoch_days_to_ymd(days), epoch_days_to_ymd(days - 1))
}

/// JS `new Date().getDay()` (0 = Sunday) in UTC. 1970-01-01 was a Thursday (4).
fn utc_day_of_week() -> usize {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = now_secs.div_euclid(86400);
    (((days % 7) + 4).rem_euclid(7)) as usize
}

/// Read a value from the shared settings table (matches getSetting).
fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .ok()
}

/// daily-briefing:isEnabled — isEnabled(). Reads `daily_briefing_enabled`
/// (default 'true'); enabled unless the stored value is exactly 'false'.
fn is_enabled(conn: &Connection) -> bool {
    let val = get_setting(conn, "daily_briefing_enabled").unwrap_or_else(|| "true".to_string());
    val != "false"
}

/// daily-briefing:setEnabled — setEnabled(enabled). Persists 'true'/'false' to
/// the shared settings table. Void in the TS.
fn set_enabled(conn: &Connection, enabled: bool) {
    let value = if enabled { "true" } else { "false" };
    let _ = conn.execute(
        "INSERT INTO settings (key, value) VALUES ('daily_briefing_enabled', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![value],
    );
}

/// daily-briefing:shouldShow — shouldShowBriefing(). False if disabled, else
/// true when there is no log row for today or its `shown` is 0.
/// (The transient in-memory `dismissedToday` flag is not DB-backed and does not
/// survive a process restart, so it is honestly omitted here — see module doc.)
fn should_show(conn: &Connection) -> bool {
    if !is_enabled(conn) {
        return false;
    }
    let (today, _) = today_yesterday();
    let shown: Option<i64> = conn
        .query_row(
            "SELECT shown FROM daily_briefing_log WHERE date = ?",
            params![today],
            |r| r.get(0),
        )
        .ok();
    match shown {
        None => true,
        Some(s) => s == 0,
    }
}

/// daily-briefing:markShown — markShown(). Upsert today's row with shown = 1.
/// Void in the TS.
fn mark_shown(conn: &Connection) {
    let (today, _) = today_yesterday();
    let _ = conn.execute(
        "INSERT INTO daily_briefing_log (date, shown) VALUES (?, 1)
         ON CONFLICT(date) DO UPDATE SET shown = 1",
        params![today],
    );
}

/// daily-briefing:dismiss — dismissForToday(). Upsert today's row with
/// shown = 1, dismissed = 1. Void in the TS. (The TS also sets an in-memory
/// `dismissedToday` flag; that transient flag is not DB state and is omitted.)
fn dismiss(conn: &Connection) {
    let (today, _) = today_yesterday();
    let _ = conn.execute(
        "INSERT INTO daily_briefing_log (date, shown, dismissed) VALUES (?, 1, 1)
         ON CONFLICT(date) DO UPDATE SET dismissed = 1",
        params![today],
    );
}

/// Round a float to the nearest integer, matching JS `Math.round` (half away
/// from zero for positive values, which is all this manager produces).
fn js_round(x: f64) -> i64 {
    (x + 0.5).floor() as i64
}

/// daily-briefing:getData — computeBriefing(). Builds the BriefingData object
/// from the shared settings table (tasks_data, focus_sessions) for today /
/// yesterday. Mirrors the TS field-by-field, including default values and the
/// suggestedAction selection. Foreign data (tasks/focus) lives in `settings`
/// values; missing/invalid JSON degrades to the same empty defaults the TS uses.
fn compute_briefing(conn: &Connection) -> Value {
    let (today, yesterday) = today_yesterday();

    // Defaults exactly as the TS initializes `briefing`.
    let mut unfinished_tasks: Vec<Value> = Vec::new();
    let mut due_today_tasks: Vec<Value> = Vec::new();
    let mut focus_total_minutes: i64 = 0;
    let mut focus_session_count: i64 = 0;
    let mut focus_avg_score: i64 = 0;
    // unfinishedVinxProjects / unseenNotes are never populated by the TS compute.
    let unfinished_vinx_projects: Vec<Value> = Vec::new();
    let unseen_notes: Vec<Value> = Vec::new();
    // Set in every branch of the if/else below (the TS default is always
    // overwritten); declared without an initializer so there's no dead store.
    let suggested_action: String;

    // --- tasks_data: filter to yesterday/today, non-completed, with a dueDate ---
    if let Some(raw) = get_setting(conn, "tasks_data") {
        if let Ok(Value::Array(tasks)) = serde_json::from_str::<Value>(&raw) {
            let map_task = |t: &Value| -> Value {
                // app: t.app || 'tasks'
                let app = t
                    .get("app")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .unwrap_or("tasks");
                // name: t.title || t.name  (JS leaves it undefined when both absent)
                let name = t
                    .get("title")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .or_else(|| t.get("name").and_then(|v| v.as_str()));
                json!({
                    "app": app,
                    "name": name,
                    "id": t.get("id").cloned().unwrap_or(Value::Null),
                })
            };

            for t in &tasks {
                let due = t.get("dueDate").and_then(|v| v.as_str());
                let status = t.get("status").and_then(|v| v.as_str());
                let not_completed = status != Some("completed");
                match due {
                    Some(d) if d == yesterday && !d.is_empty() && not_completed => {
                        unfinished_tasks.push(map_task(t));
                    }
                    _ => {}
                }
                match due {
                    Some(d) if d == today && !d.is_empty() && not_completed => {
                        due_today_tasks.push(map_task(t));
                    }
                    _ => {}
                }
            }
        }
    }

    // --- focus_sessions: summarize yesterday's sessions ---
    if let Some(raw) = get_setting(conn, "focus_sessions") {
        if let Ok(Value::Array(sessions)) = serde_json::from_str::<Value>(&raw) {
            let yesterday_sessions: Vec<&Value> = sessions
                .iter()
                .filter(|s| {
                    // s.date === yesterday  OR  (s.timestamp && date-of(timestamp) === yesterday)
                    let by_date = s.get("date").and_then(|v| v.as_str()) == Some(yesterday.as_str());
                    let by_ts = s
                        .get("timestamp")
                        .and_then(|v| v.as_i64())
                        .map(|ms| epoch_days_to_ymd(ms.div_euclid(86_400_000)) == yesterday)
                        .unwrap_or(false);
                    by_date || by_ts
                })
                .collect();

            let total_ms: f64 = yesterday_sessions
                .iter()
                .map(|s| s.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .sum();

            let count = yesterday_sessions.len() as i64;
            let avg_score = if count > 0 {
                let sum_score: f64 = yesterday_sessions
                    .iter()
                    .map(|s| s.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0))
                    .sum();
                js_round(sum_score / count as f64)
            } else {
                0
            };

            focus_total_minutes = js_round(total_ms / 60000.0);
            focus_session_count = count;
            focus_avg_score = avg_score;
        }
    }

    // --- suggestedAction ---
    let day_names = [
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ];
    if !due_today_tasks.is_empty() {
        let name = due_today_tasks[0]
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        suggested_action = format!("Start with \"{}\" which is due today.", name);
    } else if !unfinished_tasks.is_empty() {
        let name = unfinished_tasks[0]
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        suggested_action = format!("Finish \"{}\" from yesterday.", name);
    } else {
        let dow = utc_day_of_week();
        suggested_action = format!(
            "{} focus: review your projects and plan your day.",
            day_names[dow]
        );
    }

    json!({
        "date": today,
        "unfinishedTasks": unfinished_tasks,
        "unfinishedVinxProjects": unfinished_vinx_projects,
        "unseenNotes": unseen_notes,
        "dueTodayTasks": due_today_tasks,
        "focusSummary": {
            "totalMinutes": focus_total_minutes,
            "sessionCount": focus_session_count,
            "avgScore": focus_avg_score,
        },
        "suggestedAction": suggested_action,
    })
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "daily-briefing:shouldShow" => json!(should_show(conn)),
        // The TS returns the memoized cache when present, else computes. A
        // stateless dispatch has no surviving cache, so it always computes
        // (equivalent to a cold first call).
        "daily-briefing:getData" => compute_briefing(conn),
        "daily-briefing:markShown" => {
            mark_shown(conn);
            json!({ "success": true })
        }
        "daily-briefing:dismiss" => {
            dismiss(conn);
            json!({ "success": true })
        }
        "daily-briefing:setEnabled" => {
            let enabled = args.get(0).and_then(|v| v.as_bool()).unwrap_or(false);
            set_enabled(conn, enabled);
            json!({ "success": true })
        }
        "daily-briefing:isEnabled" => json!(is_enabled(conn)),
        _ => Value::Null,
    }
}
