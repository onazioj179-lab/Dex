// =============================================================================
// DEX 6.0 — Statistics Dashboard (Tauri port of src/main/core/StatisticsDashboardManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed lifetime statistics (stats-dashboard:* channels), reading the
//! shared `dex.db` and aggregating across many subsystems' tables (Feature 20).
//! This manager OWNS only two tables — `stats_summary` (the cached snapshot) and
//! `usage_days` (the per-day action counter) — so ensure_schema creates exactly
//! those. Every other table it reads (`settings`, `media_library`,
//! `time_tracking`, `voice_memos`, `word_count_log`) is owned by another module;
//! the TS wraps those reads in try/catch and degrades to the field's default
//! when the table/row is absent, so each foreign read here degrades to its
//! default the same way. The `compute` result is the LifetimeStats object with
//! camelCase keys, identical to the Electron return shape.

use rusqlite::Connection;
use serde_json::{json, Value};

/// Create the two tables this manager owns (matches createTables verbatim).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS stats_summary (
            id INTEGER PRIMARY KEY DEFAULT 1,
            data TEXT NOT NULL,
            computed_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usage_days (
            date TEXT PRIMARY KEY,
            actions INTEGER DEFAULT 0
        );",
    );
    // Note: settings / media_library / time_tracking / voice_memos /
    // word_count_log are owned by other modules; computeStats reads them inside
    // try/catch and degrades when absent, so we do NOT create them here.
}

/// Current epoch milliseconds (matches JS `Date.now()` used for computedAt).
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Read a JSON-array `settings` value by key, returning its parsed array (or
/// None when the row/table is missing or the value does not parse to an array).
fn read_settings_array(conn: &Connection, key: &str) -> Option<Vec<Value>> {
    let value: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?",
            rusqlite::params![key],
            |r| r.get(0),
        )
        .ok()?;
    match serde_json::from_str::<Value>(&value) {
        Ok(Value::Array(a)) => Some(a),
        _ => None,
    }
}

/// computeStats() — aggregate lifetime stats, cache them, and return the
/// LifetimeStats object (camelCase keys, exactly as Electron returns it).
fn compute_stats(conn: &Connection) -> Value {
    // Defaults mirror the TS `stats` initializer.
    let mut total_tasks_created: i64 = 0;
    let mut total_tasks_completed: i64 = 0;
    let mut task_completion_rate: i64 = 0;
    let mut total_focus_sessions: i64 = 0;
    let mut total_focus_hours: f64 = 0.0;
    let total_exports: i64 = 0;
    let mut total_files_imported: i64 = 0;
    let mut total_notes_created: i64 = 0;
    let mut total_words_written: i64 = 0;
    let total_automations_triggered: i64 = 0;
    let total_plugins_installed: i64 = 0;
    let total_commands_run: i64 = 0;
    let mut total_voice_memos_recorded: i64 = 0;
    let mut total_time_spent_ms: i64 = 0;
    let mut longest_session_ms: i64 = 0;
    let mut most_used_app: String = "none".to_string();
    let mut most_productive_day: String = "none".to_string();
    let mut current_streak: i64 = 0;
    let mut longest_streak: i64 = 0;
    let computed_at: i64 = now_ms();

    // The TS wraps tasks/notes/media/focus + the inner blocks in one outer
    // try/catch. media_library is read WITHOUT its own inner try, so if that
    // table is missing the whole outer block aborts and the remaining fields
    // keep their defaults; we reproduce that by short-circuiting on its failure.
    let outer = (|| -> Option<()> {
        // tasks_data (settings JSON array)
        if let Some(tasks) = read_settings_array(conn, "tasks_data") {
            total_tasks_created = tasks.len() as i64;
            total_tasks_completed = tasks
                .iter()
                .filter(|t| t.get("status").and_then(|v| v.as_str()) == Some("completed"))
                .count() as i64;
            task_completion_rate = if total_tasks_created > 0 {
                ((total_tasks_completed as f64 / total_tasks_created as f64) * 100.0).round() as i64
            } else {
                0
            };
        }

        // notes_data (settings JSON array)
        if let Some(notes) = read_settings_array(conn, "notes_data") {
            total_notes_created = notes.len() as i64;
        }

        // media_library COUNT — no inner try in the TS, so a missing table
        // throws and aborts the rest of the outer block.
        let media_count: i64 = conn
            .query_row("SELECT COUNT(*) as c FROM media_library", [], |r| r.get(0))
            .ok()?;
        total_files_imported = media_count;

        // time_tracking (inner try/catch -> degrade to defaults).
        let _ = (|| -> Option<()> {
            let total: Option<i64> = conn
                .query_row("SELECT SUM(duration_ms) as total FROM time_tracking", [], |r| r.get(0))
                .ok()?;
            total_time_spent_ms = total.unwrap_or(0);

            let longest: Option<i64> = conn
                .query_row("SELECT MAX(duration_ms) as longest FROM time_tracking", [], |r| r.get(0))
                .ok()?;
            longest_session_ms = longest.unwrap_or(0);

            let app: Option<String> = conn
                .query_row(
                    "SELECT app, SUM(duration_ms) as total FROM time_tracking GROUP BY app ORDER BY total DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .ok();
            most_used_app = app.filter(|a| !a.is_empty()).unwrap_or_else(|| "none".to_string());
            Some(())
        })();

        // voice_memos (inner try/catch).
        let _ = (|| -> Option<()> {
            let c: i64 = conn
                .query_row("SELECT COUNT(*) as c FROM voice_memos", [], |r| r.get(0))
                .ok()?;
            total_voice_memos_recorded = c;
            Some(())
        })();

        // word_count_log (inner try/catch).
        let _ = (|| -> Option<()> {
            let total: Option<i64> = conn
                .query_row("SELECT SUM(words) as total FROM word_count_log", [], |r| r.get(0))
                .ok()?;
            total_words_written = total.unwrap_or(0);
            Some(())
        })();

        // focus_sessions (settings JSON array).
        if let Some(sessions) = read_settings_array(conn, "focus_sessions") {
            total_focus_sessions = sessions.len() as i64;
            let total_ms: f64 = sessions
                .iter()
                .map(|s| s.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .sum();
            total_focus_hours = (total_ms / 3_600_000.0 * 10.0).round() / 10.0;
        }

        // usage_days streak + most productive day (inner try/catch).
        let _ = (|| -> Option<()> {
            let mut stmt = conn
                .prepare("SELECT date, actions FROM usage_days ORDER BY date DESC")
                .ok()?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
                })
                .ok()?;
            let days: Vec<(String, i64)> = rows.filter_map(|r| r.ok()).collect();
            drop(stmt);

            if !days.is_empty() {
                let (cs, ls, pd) = compute_streaks(&days);
                current_streak = cs;
                longest_streak = ls;
                most_productive_day = pd;
            }
            Some(())
        })();

        Some(())
    })();
    let _ = outer;

    let stats = json!({
        "totalProjects": 0,
        "totalTasksCreated": total_tasks_created,
        "totalTasksCompleted": total_tasks_completed,
        "taskCompletionRate": task_completion_rate,
        "totalFocusSessions": total_focus_sessions,
        "totalFocusHours": total_focus_hours,
        "totalExports": total_exports,
        "totalFilesImported": total_files_imported,
        "totalNotesCreated": total_notes_created,
        "totalWordsWritten": total_words_written,
        "totalAutomationsTriggered": total_automations_triggered,
        "totalPluginsInstalled": total_plugins_installed,
        "totalCommandsRun": total_commands_run,
        "totalVoiceMemosRecorded": total_voice_memos_recorded,
        "totalTimeSpentMs": total_time_spent_ms,
        "longestSessionMs": longest_session_ms,
        "mostUsedApp": most_used_app,
        "mostProductiveDay": most_productive_day,
        "currentStreak": current_streak,
        "longestStreak": longest_streak,
        "computedAt": computed_at,
    });

    // Cache the snapshot (non-critical; ignore failures like the TS try/catch).
    let serialized = stats.to_string();
    let _ = conn.execute(
        "INSERT INTO stats_summary (id, data, computed_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = ?, computed_at = ?",
        rusqlite::params![serialized, computed_at, serialized, computed_at],
    );

    stats
}

/// Day count is the number of (date, actions) rows; we mirror the TS streak
/// math exactly (days are ordered DESC by date). Returns
/// (currentStreak, longestStreak, mostProductiveDay).
fn compute_streaks(days: &[(String, i64)]) -> (i64, i64, String) {
    let mut current_streak: i64 = 0;
    let mut longest_streak: i64 = 0;
    let mut streak: i64 = 0;
    // prevDate = new Date() (now) used only for the i === 0 comparison.
    let prev_now = epoch_days_now();

    for i in 0..days.len() {
        let d = parse_date_days(&days[i].0);
        if i == 0 {
            // diffDays = floor((now - d) / 1 day)
            let diff_days = prev_now - d;
            if diff_days <= 1 {
                streak = 1;
            } else {
                streak = 0;
            }
        } else {
            let prev = parse_date_days(&days[i - 1].0);
            let diff_days = prev - d;
            if diff_days == 1 {
                streak += 1;
            } else {
                longest_streak = longest_streak.max(streak);
                if i <= 1 {
                    current_streak = streak;
                }
                streak = 1;
            }
        }
    }
    longest_streak = longest_streak.max(streak);
    if current_streak == 0 {
        current_streak = streak;
    }

    let mut max_actions: i64 = 0;
    let mut max_date = String::new();
    for (date, actions) in days {
        if *actions > max_actions {
            max_actions = *actions;
            max_date = date.clone();
        }
    }
    let most_productive_day = if max_date.is_empty() {
        "none".to_string()
    } else {
        max_date
    };

    (current_streak, longest_streak, most_productive_day)
}

/// Whole-day index since the Unix epoch for an ISO `YYYY-MM-DD` date string,
/// matching `Math.floor(new Date(date).getTime() / 86400000)`. `new Date(d)`
/// parses a date-only string as UTC midnight, so the day index is exact.
fn parse_date_days(date: &str) -> i64 {
    // Take the date portion (the TS feeds either 'YYYY-MM-DD' rows).
    let d = date.split('T').next().unwrap_or(date);
    let mut parts = d.split('-');
    let y: i64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(1970);
    let m: i64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(1);
    let day: i64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(1);
    days_from_civil(y, m, day)
}

/// Whole days since the Unix epoch for "now" (UTC), matching `new Date()`
/// floored to days for the i === 0 diff comparison.
fn epoch_days_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    secs.div_euclid(86_400)
}

/// Days since the Unix epoch for a civil (proleptic Gregorian) Y-M-D date.
/// Howard Hinnant's days_from_civil algorithm.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146_097 + doe - 719_468
}

/// getCachedStats() — parsed LifetimeStats object from stats_summary, or null.
fn get_cached(conn: &Connection) -> Value {
    let data: Option<String> = conn
        .query_row("SELECT data FROM stats_summary WHERE id = 1", [], |r| r.get(0))
        .ok();
    match data {
        Some(s) => serde_json::from_str::<Value>(&s).unwrap_or(Value::Null),
        None => Value::Null,
    }
}

/// recordUsageDay() — increment today's action counter. Void in TS.
fn record_usage(conn: &Connection) {
    // today = new Date().toISOString().split('T')[0] -> UTC YYYY-MM-DD.
    let today = utc_today();
    let _ = conn.execute(
        "INSERT INTO usage_days (date, actions) VALUES (?, 1)
         ON CONFLICT(date) DO UPDATE SET actions = actions + 1",
        rusqlite::params![today],
    );
}

/// UTC date string `YYYY-MM-DD` (matches `new Date().toISOString().split('T')[0]`).
fn utc_today() -> String {
    let days = epoch_days_now();
    let (y, m, d) = civil_from_days(days);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// Inverse of days_from_civil: civil (Y, M, D) from days since the Unix epoch.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn dispatch(conn: &Connection, channel: &str, _args: &Value) -> Value {
    match channel {
        "stats-dashboard:compute" => compute_stats(conn),
        "stats-dashboard:getCached" => get_cached(conn),
        // recordUsage is void in Electron -> { success: true } per porting convention.
        "stats-dashboard:recordUsage" => {
            record_usage(conn);
            json!({ "success": true })
        }
        _ => Value::Null,
    }
}
