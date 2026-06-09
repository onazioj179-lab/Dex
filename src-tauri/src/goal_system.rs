// =============================================================================
// DEX 6.0 — Goal System (Tauri port of src/main/core/GoalSystemManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed weekly goal setting/tracking (goal-system:* channels), reading
//! and writing the shared `dex.db` `weekly_goals` + `goal_progress` tables with
//! the identical schema, queries, and return shapes as the Electron manager.
//! The "current week" is the ISO-week Monday, computed in SQLite to mirror the
//! TS `getWeekStart()` (Monday-based, `YYYY-MM-DD`). `created_at`/`updated_at`
//! are epoch-millis (matching JS `Date.now()`); dates are `YYYY-MM-DD` strings.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

/// Create the goal tables + indexes (matches GoalSystemManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS weekly_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_start TEXT NOT NULL UNIQUE,
            goal_text TEXT NOT NULL,
            completion_pct INTEGER DEFAULT 0,
            completed INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS goal_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            note TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_weekly_goals_week ON weekly_goals(week_start);
        CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON goal_progress(goal_id);
        -- autoComputeProgress reads the shared settings table (created by
        -- DatabaseManager); ensure it exists so the read never throws here.
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    );
}

/// Epoch-millis "now", mirroring JS `Date.now()`.
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Monday (ISO week start) of the current local-ish day as `YYYY-MM-DD`,
/// mirroring the TS `getWeekStart()`. SQLite `%w` is 0=Sunday..6=Saturday;
/// subtracting `((%w + 6) % 7)` days lands on Monday of this week.
fn current_week_start(conn: &Connection) -> String {
    conn.query_row(
        "SELECT date('now', '-' || ((CAST(strftime('%w','now') AS INTEGER) + 6) % 7) || ' days')",
        [],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_default()
}

/// Today's date as `YYYY-MM-DD`, mirroring `new Date().toISOString().split('T')[0]`.
fn today(conn: &Connection) -> String {
    conn.query_row("SELECT date('now')", [], |r| r.get::<_, String>(0))
        .unwrap_or_default()
}

/// One weekly_goals row -> the WeeklyGoal shape (snake_case keys, as `SELECT *`
/// returned under Electron/better-sqlite3).
fn goal_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "week_start": row.get::<_, String>(1)?,
        "goal_text": row.get::<_, String>(2)?,
        "completion_pct": row.get::<_, i64>(3)?,
        "completed": row.get::<_, i64>(4)?,
        "created_at": row.get::<_, i64>(5)?,
        "updated_at": row.get::<_, i64>(6)?,
    }))
}

/// One goal_progress row -> the GoalProgressEntry shape.
fn progress_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "goal_id": row.get::<_, i64>(1)?,
        "date": row.get::<_, String>(2)?,
        "note": row.get::<_, String>(3)?,
        "created_at": row.get::<_, i64>(4)?,
    }))
}

const GOAL_COLS: &str =
    "id, week_start, goal_text, completion_pct, completed, created_at, updated_at";

fn query_goal_list(conn: &Connection, sql: &str, p: Vec<SqlValue>) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), goal_row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// getCurrentGoal(): the WeeklyGoal for this ISO week, or null.
fn get_current_goal(conn: &Connection) -> Value {
    let week_start = current_week_start(conn);
    let sql = format!("SELECT {GOAL_COLS} FROM weekly_goals WHERE week_start = ?");
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![week_start], goal_row_to_json) {
        Ok(v) => v,
        // No row (or any error) -> null, exactly like better-sqlite3 .get().
        Err(_) => Value::Null,
    }
}

/// needsPrompt(): true only on Monday (getDay()===1) when no current goal exists.
fn needs_goal_prompt(conn: &Connection) -> Value {
    let dow: i64 = conn
        .query_row("SELECT CAST(strftime('%w','now') AS INTEGER)", [], |r| r.get(0))
        .unwrap_or(-1);
    // JS getDay(): 0=Sunday..6=Saturday; Monday === 1, same as SQLite %w.
    if dow != 1 {
        return json!(false);
    }
    json!(get_current_goal(conn).is_null())
}

/// setGoal(goalText): upsert this week's goal, return the row.
fn set_goal(conn: &Connection, args: &Value) -> Value {
    let goal_text = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let week_start = current_week_start(conn);
    let now = now_millis();
    let _ = conn.execute(
        "INSERT INTO weekly_goals (week_start, goal_text, completion_pct, completed, created_at, updated_at)
         VALUES (?, ?, 0, 0, ?, ?)
         ON CONFLICT(week_start) DO UPDATE SET goal_text = ?, updated_at = ?",
        params![week_start, goal_text, now, now, goal_text, now],
    );
    get_current_goal(conn)
}

/// updateProgress(pct): clamp 0..100, persist, return the row.
fn update_progress(conn: &Connection, args: &Value) -> Value {
    let raw = args.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let pct = raw.max(0.0).min(100.0);
    let week_start = current_week_start(conn);
    update_progress_value(conn, &week_start, pct);
    get_current_goal(conn)
}

/// Shared by updateProgress + autoCompute: write completion_pct (matches the
/// JS `Math.max(0, Math.min(100, x))` clamp; pct is stored to an INTEGER column
/// so it truncates toward zero, same as better-sqlite3 binding a float).
fn update_progress_value(conn: &Connection, week_start: &str, pct: f64) {
    let _ = conn.execute(
        "UPDATE weekly_goals SET completion_pct = ?, updated_at = ? WHERE week_start = ?",
        params![pct, now_millis(), week_start],
    );
}

/// completeGoal(): mark completed=1, completion_pct=100, return the row.
fn complete_goal(conn: &Connection) -> Value {
    let week_start = current_week_start(conn);
    let _ = conn.execute(
        "UPDATE weekly_goals SET completed = 1, completion_pct = 100, updated_at = ? WHERE week_start = ?",
        params![now_millis(), week_start],
    );
    get_current_goal(conn)
}

/// addProgressNote(note): append a dated note for the current goal (no-op if
/// there is no current goal), mirroring the TS void method.
fn add_progress_note(conn: &Connection, note: &str) {
    let goal = get_current_goal(conn);
    let goal_id = match goal.get("id").and_then(|v| v.as_i64()) {
        Some(id) => id,
        None => return,
    };
    let today = today(conn);
    let _ = conn.execute(
        "INSERT INTO goal_progress (goal_id, date, note, created_at) VALUES (?, ?, ?, ?)",
        params![goal_id, today, note, now_millis()],
    );
}

/// getProgressEntries(goalId): all notes for a goal, newest date first.
fn get_progress_entries(conn: &Connection, args: &Value) -> Value {
    let goal_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
    let mut stmt = match conn.prepare(
        "SELECT id, goal_id, date, note, created_at FROM goal_progress WHERE goal_id = ? ORDER BY date DESC",
    ) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![goal_id], progress_row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// getGoalHistory(): every weekly goal, newest week first.
fn get_goal_history(conn: &Connection) -> Value {
    query_goal_list(
        conn,
        &format!("SELECT {GOAL_COLS} FROM weekly_goals ORDER BY week_start DESC"),
        Vec::new(),
    )
}

/// autoComputeProgress(): bump this week's progress from completed tasks recorded
/// in settings('tasks_data'), then log a note and persist. Void in the TS.
fn auto_compute_progress(conn: &Connection) {
    let goal = get_current_goal(conn);
    if goal.is_null() {
        return;
    }
    // Skip already-completed goals (goal.completed truthy).
    if goal.get("completed").and_then(|v| v.as_i64()).unwrap_or(0) != 0 {
        return;
    }

    let week_start = current_week_start(conn);
    let mut score = goal
        .get("completion_pct")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    // tasks_data is a JSON array of tasks in the shared settings table.
    let task_json: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'tasks_data'",
            [],
            |r| r.get(0),
        )
        .ok();

    if let Some(raw) = task_json {
        if let Ok(Value::Array(tasks)) = serde_json::from_str::<Value>(&raw) {
            let completed_this_week = tasks
                .iter()
                .filter(|t| {
                    let status_ok =
                        t.get("status").and_then(|v| v.as_str()) == Some("completed");
                    if !status_ok {
                        return false;
                    }
                    // completedAt must be present and its YYYY-MM-DD >= weekStart.
                    match t.get("completedAt") {
                        Some(ca) if !ca.is_null() => completed_at_date(conn, ca)
                            .map(|d| d.as_str() >= week_start.as_str())
                            .unwrap_or(false),
                        _ => false,
                    }
                })
                .count() as i64;
            score = (score + completed_this_week * 5).min(100);
        }
        // Parse failure is non-critical in the TS (swallowed); we mirror that.
    }

    let note = format!("Auto-tracked: progress updated to {score}%");
    add_progress_note(conn, &note);
    update_progress_value(conn, &week_start, score as f64);
}

/// Mirror `new Date(t.completedAt).toISOString().split('T')[0]`: accept either an
/// epoch-millis number or a date/ISO string and reduce it to `YYYY-MM-DD` via
/// SQLite, so the comparison against weekStart matches the JS path.
fn completed_at_date(conn: &Connection, ca: &Value) -> Option<String> {
    if let Some(ms) = ca.as_i64() {
        // Epoch millis -> seconds for SQLite's unixepoch interpretation.
        conn.query_row(
            "SELECT strftime('%Y-%m-%d', ?/1000.0, 'unixepoch')",
            params![ms],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .filter(|s| !s.is_empty())
    } else if let Some(s) = ca.as_str() {
        // ISO-ish string -> date(). Falls back to None on unparseable input.
        conn.query_row("SELECT date(?)", params![s], |r| r.get::<_, Option<String>>(0))
            .ok()
            .flatten()
    } else {
        None
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "goal-system:getCurrentGoal" => get_current_goal(conn),
        "goal-system:needsPrompt" => needs_goal_prompt(conn),
        "goal-system:setGoal" => set_goal(conn, args),
        "goal-system:updateProgress" => update_progress(conn, args),
        "goal-system:completeGoal" => complete_goal(conn),
        // addProgressNote returns void in Electron; report success so the bridge
        // telemetry doesn't count it as unported.
        "goal-system:addProgressNote" => {
            let note = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            add_progress_note(conn, note);
            json!({ "success": true })
        }
        "goal-system:getProgressEntries" => get_progress_entries(conn, args),
        "goal-system:getGoalHistory" => get_goal_history(conn),
        // autoCompute returns void in Electron; report success likewise.
        "goal-system:autoCompute" => {
            auto_compute_progress(conn);
            json!({ "success": true })
        }
        _ => Value::Null,
    }
}
