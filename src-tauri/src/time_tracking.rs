// =============================================================================
// DEX 6.0 — Time Tracking (Tauri port of src/main/core/TimeTrackingManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed time tracking (time-tracking:* channels), reading/writing the
//! shared `dex.db` `time_tracking` table with the identical schema, queries, and
//! return shapes as the Electron manager.
//!
//! The Electron manager keeps live in-memory tracking state (activeProject,
//! idle timers, accumulatedIdleMs, sessionId) that drives startTracking /
//! stopTracking / onIdleStart / onIdleEnd. `dispatch` is a pure, stateless
//! function over a borrowed &Connection, so there is no place to hold that
//! per-session timer state. Those four channels are therefore degraded honestly
//! (see the comments in dispatch); every pure DB-read/report channel is ported
//! faithfully with the exact same return shape the renderer saw under Electron.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the time_tracking table + indexes (matches TimeTrackingManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS time_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            date TEXT NOT NULL,
            session_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_time_tracking_app ON time_tracking(app);
        CREATE INDEX IF NOT EXISTS idx_time_tracking_date ON time_tracking(date);
        CREATE INDEX IF NOT EXISTS idx_time_tracking_project ON time_tracking(app, project_id);",
    );
}

/// One row -> the TimeReport shape for getDailyReport
/// (SELECT app, project_id, project_name, SUM(duration_ms) as total_ms, date).
fn report_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "app": row.get::<_, String>(0)?,
        "project_id": row.get::<_, String>(1)?,
        "project_name": row.get::<_, String>(2)?,
        // SUM() can come back as NULL for empty groups; clamp to 0 to mirror JS.
        "total_ms": row.get::<_, Option<i64>>(3)?.unwrap_or(0),
        "date": row.get::<_, String>(4)?,
    }))
}

/// One row -> the weekly-by-app shape (app, total_ms, week).
fn weekly_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "app": row.get::<_, String>(0)?,
        "total_ms": row.get::<_, Option<i64>>(1)?.unwrap_or(0),
        "week": row.get::<_, Option<String>>(2)?,
    }))
}

fn query_list<F>(conn: &Connection, sql: &str, p: Vec<SqlValue>, map_fn: F) -> Value
where
    F: Fn(&Row) -> rusqlite::Result<Value>,
{
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), map_fn) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// getDailyReport(days = 30): TimeReport[]
/// cutoff = (now - days*86400000) as YYYY-MM-DD; WHERE date >= cutoff.
fn get_daily_report(conn: &Connection, days: i64) -> Value {
    let cutoff = format!("-{} days", days);
    query_list(
        conn,
        "SELECT app, project_id, project_name, SUM(duration_ms) as total_ms, date
         FROM time_tracking WHERE date >= date('now', ?)
         GROUP BY app, project_id, date ORDER BY date DESC",
        vec![SqlValue::Text(cutoff)],
        report_row_to_json,
    )
}

/// getWeeklyByApp(): Array<{ app, total_ms, week }>
fn get_weekly_by_app(conn: &Connection) -> Value {
    query_list(
        conn,
        "SELECT app, SUM(duration_ms) as total_ms,
                strftime('%Y-W%W', date) as week
         FROM time_tracking
         GROUP BY app, week
         ORDER BY week DESC
         LIMIT 200",
        Vec::new(),
        weekly_row_to_json,
    )
}

/// getProjectTotal(app, projectId): number  (row?.total || 0)
fn get_project_total(conn: &Connection, app: &str, project_id: &str) -> Value {
    let total: i64 = conn
        .query_row(
            "SELECT SUM(duration_ms) as total FROM time_tracking WHERE app = ? AND project_id = ?",
            params![app, project_id],
            |r| r.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .unwrap_or(0);
    json!(total)
}

/// getTotalSessionTime(): number  (row?.total || 0)
fn get_total_session_time(conn: &Connection) -> Value {
    let total: i64 = conn
        .query_row("SELECT SUM(duration_ms) as total FROM time_tracking", [], |r| {
            r.get::<_, Option<i64>>(0)
        })
        .ok()
        .flatten()
        .unwrap_or(0);
    json!(total)
}

/// getLongestSession(): number  (row?.longest || 0)
fn get_longest_session(conn: &Connection) -> Value {
    let longest: i64 = conn
        .query_row("SELECT MAX(duration_ms) as longest FROM time_tracking", [], |r| {
            r.get::<_, Option<i64>>(0)
        })
        .ok()
        .flatten()
        .unwrap_or(0);
    json!(longest)
}

/// getMostUsedApp(): string | null  (row?.app || null)
fn get_most_used_app(conn: &Connection) -> Value {
    let app: Option<String> = conn
        .query_row(
            "SELECT app, SUM(duration_ms) as total FROM time_tracking GROUP BY app ORDER BY total DESC LIMIT 1",
            [],
            |r| r.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten();
    match app {
        Some(a) => json!(a),
        None => Value::Null,
    }
}

/// getTodayTotal(): number  (row?.total || 0); today = local-ISO date in TS.
/// SQLite date('now') is UTC; mirrors the TS toISOString().split('T')[0] (UTC).
fn get_today_total(conn: &Connection) -> Value {
    let total: i64 = conn
        .query_row(
            "SELECT SUM(duration_ms) as total FROM time_tracking WHERE date = date('now')",
            [],
            |r| r.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
        .unwrap_or(0);
    json!(total)
}

/// Internal: fetch the daily report rows as TimeReport-like tuples for export.
fn daily_report_rows(conn: &Connection, days: i64) -> Vec<(String, String, String, i64)> {
    // (date, app, project_name, total_ms) — only the fields exportReport formats.
    let cutoff = format!("-{} days", days);
    let mut stmt = match conn.prepare(
        "SELECT app, project_id, project_name, SUM(duration_ms) as total_ms, date
         FROM time_tracking WHERE date >= date('now', ?)
         GROUP BY app, project_id, date ORDER BY date DESC",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map(params![cutoff], |r| {
        Ok((
            r.get::<_, String>(4)?,                       // date
            r.get::<_, String>(0)?,                       // app
            r.get::<_, String>(2)?,                       // project_name
            r.get::<_, Option<i64>>(3)?.unwrap_or(0),     // total_ms
        ))
    }) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

/// exportReport(format, days = 30): string  — returns the formatted string.
fn export_report(conn: &Connection, format: &str, days: i64) -> Value {
    if format == "json" {
        // Mirror JSON.stringify(getDailyReport(days), null, 2) — same key order/shape.
        let data = get_daily_report(conn, days);
        let s = serde_json::to_string_pretty(&data).unwrap_or_else(|_| "[]".to_string());
        return json!(s);
    }

    let data = daily_report_rows(conn, days);

    if format == "markdown" {
        let mut md = String::from(
            "# Time Tracking Report\n\n| Date | App | Project | Duration |\n|------|-----|---------|----------|\n",
        );
        for (date, app, project_name, total_ms) in &data {
            let hrs = total_ms / 3_600_000;
            let mins = (total_ms % 3_600_000) / 60_000;
            md.push_str(&format!(
                "| {} | {} | {} | {}h {}m |\n",
                date, app, project_name, hrs, mins
            ));
        }
        return json!(md);
    }

    // 'text' (default)
    let mut text = String::from("Time Tracking Report\n\n");
    for (date, app, project_name, total_ms) in &data {
        let hrs = total_ms / 3_600_000;
        let mins = (total_ms % 3_600_000) / 60_000;
        text.push_str(&format!(
            "{} | {} | {} | {}h {}m\n",
            date, app, project_name, hrs, mins
        ));
    }
    json!(text)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // --- Pure DB-read / report channels: ported faithfully ---
        "time-tracking:getDailyReport" => {
            let days = args.get(0).and_then(|v| v.as_i64()).unwrap_or(30);
            get_daily_report(conn, days)
        }
        "time-tracking:getWeeklyByApp" => get_weekly_by_app(conn),
        "time-tracking:getProjectTotal" => {
            let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            get_project_total(conn, app, project_id)
        }
        "time-tracking:getTodayTotal" => get_today_total(conn),
        "time-tracking:getTotalSessionTime" => get_total_session_time(conn),
        "time-tracking:getLongestSession" => get_longest_session(conn),
        "time-tracking:getMostUsedApp" => get_most_used_app(conn),
        "time-tracking:exportReport" => {
            let format = args.get(0).and_then(|v| v.as_str()).unwrap_or("text");
            let days = args.get(1).and_then(|v| v.as_i64()).unwrap_or(30);
            export_report(conn, format, days)
        }

        // --- Live-session channels: depend on in-memory tracking state ---
        // startTracking/stopTracking/onIdleStart/onIdleEnd rely on the manager's
        // mutable in-memory timer state (activeProject, idleStartTime, isIdle,
        // accumulatedIdleMs, sessionId), which a stateless &Connection dispatch
        // cannot hold. Without that state we cannot compute a duration to persist,
        // so we degrade honestly instead of faking a write or a TimeEntry.
        //
        // stopTracking under Electron returns `null` when there is no active
        // project; with no session state here that is always the case, so `null`
        // is the faithful return value (not an error).
        "time-tracking:stopTracking" => Value::Null,
        // startTracking returns void in Electron and only mutates in-memory state;
        // we have nowhere to store it, so report the missing capability honestly.
        "time-tracking:startTracking" => {
            json!({ "success": false, "error": "live time-tracking session state not available in stateless backend (not ported)" })
        }
        "time-tracking:onIdleStart" => {
            json!({ "success": false, "error": "live idle-tracking session state not available in stateless backend (not ported)" })
        }
        "time-tracking:onIdleEnd" => {
            json!({ "success": false, "error": "live idle-tracking session state not available in stateless backend (not ported)" })
        }

        _ => Value::Null,
    }
}
