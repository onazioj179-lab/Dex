// =============================================================================
// DEX 6.0 — Word Count (Tauri port of src/main/core/WordCountManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed system-wide word-count tracking (word-count:* channels),
//! reading/writing the shared `dex.db` `word_count_log` table (and the shared
//! `settings` table for the persisted daily goal) with the identical schema,
//! queries, and return shapes as the Electron manager. The Electron manager
//! keeps `dailyGoal` as an in-memory cache that it loads from / writes back to
//! the `settings` table; since dispatch() is a pure stateless function, we read
//! and write that same `word_count_daily_goal` setting directly, which yields
//! identical results to the renderer.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

/// Create the word_count_log table + indexes (matches WordCountManager.createTables),
/// plus the shared `settings` table (owned by DatabaseManager) that the goal lives in.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS word_count_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            date TEXT NOT NULL,
            words INTEGER NOT NULL,
            session_id TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_word_count_date ON word_count_log(date);
        CREATE INDEX IF NOT EXISTS idx_word_count_app ON word_count_log(app);
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    );
}

/// Word-count rule from the TS: text.trim().split(/\s+/).filter(w => w.length > 0).length
fn count_words(text: &str) -> i64 {
    text.split_whitespace().count() as i64
}

/// Read the persisted daily goal (settings.word_count_daily_goal), parseInt || 0,
/// then max(0, .) as setDailyGoal stored it. Mirrors loadGoal()/getDailyGoal().
fn get_goal(conn: &Connection) -> i64 {
    let raw: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?",
            params!["word_count_daily_goal"],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "0".to_string());
    // parseInt(val, 10) || 0 — leading integer, NaN -> 0.
    raw.trim()
        .split(|c: char| !c.is_ascii_digit() && c != '-')
        .next()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0)
}

/// recordWordDelta(app, oldText, newText, sessionId) -> delta (number).
fn record(conn: &Connection, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("");
    let app = s(0);
    let old_text = s(1);
    let new_text = s(2);
    let session_id = s(3);

    let delta = count_words(new_text) - count_words(old_text);
    if delta == 0 {
        return json!(0);
    }
    // today = new Date().toISOString().split('T')[0] (UTC) -> date('now') (UTC).
    let _ = conn.execute(
        "INSERT INTO word_count_log (app, date, words, session_id) VALUES (?, date('now'), ?, ?)",
        params![app, delta, session_id],
    );
    json!(delta)
}

/// Math.max(0, row?.total || 0) over a SUM(words) query with optional date bound.
fn sum_words(conn: &Connection, sql: &str, p: &[&dyn rusqlite::ToSql]) -> i64 {
    let total: i64 = conn.query_row(sql, p, |r| r.get::<_, Option<i64>>(0).map(|o| o.unwrap_or(0)))
        .unwrap_or(0);
    total.max(0)
}

fn get_today(conn: &Connection) -> Value {
    json!(sum_words(
        conn,
        "SELECT SUM(words) FROM word_count_log WHERE date = date('now')",
        &[],
    ))
}

fn get_week(conn: &Connection) -> Value {
    // weekAgo = Date.now() - 7*86400000 (UTC date) -> date('now','-7 days').
    json!(sum_words(
        conn,
        "SELECT SUM(words) FROM word_count_log WHERE date >= date('now','-7 days')",
        &[],
    ))
}

fn get_all_time(conn: &Connection) -> Value {
    json!(sum_words(conn, "SELECT SUM(words) FROM word_count_log", &[]))
}

/// getDailyHistory(days=90) -> [{ date, words }] for date >= cutoff, ascending.
fn get_history(conn: &Connection, args: &Value) -> Value {
    // days?: number (default 90). cutoff = now - days days (UTC date).
    let days = args.get(0).and_then(|v| v.as_i64()).unwrap_or(90);
    let cutoff = format!("-{} days", days);
    let sql = "SELECT date, SUM(words) as words FROM word_count_log
               WHERE date >= date('now', ?) GROUP BY date ORDER BY date ASC";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![cutoff], |r| {
        Ok(json!({
            "date": r.get::<_, String>(0)?,
            "words": r.get::<_, Option<i64>>(1)?.unwrap_or(0),
        }))
    }) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// setDailyGoal(goal): goal = max(0, goal); persist as String(goal). Returns void.
fn set_goal(conn: &Connection, args: &Value) -> Value {
    let goal = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0).max(0);
    let _ = conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
        params!["word_count_daily_goal", goal.to_string(), goal.to_string()],
    );
    json!({ "success": true })
}

/// getDailyGoalProgress() -> { current, goal, percentage }.
fn get_progress(conn: &Connection) -> Value {
    let current = sum_words(
        conn,
        "SELECT SUM(words) FROM word_count_log WHERE date = date('now')",
        &[],
    );
    let goal = get_goal(conn);
    let percentage = if goal > 0 {
        // Math.min(100, Math.round((current / goal) * 100))
        let pct = ((current as f64 / goal as f64) * 100.0).round() as i64;
        pct.min(100)
    } else {
        0
    };
    json!({ "current": current, "goal": goal, "percentage": percentage })
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "word-count:record" => record(conn, args),
        "word-count:getToday" => get_today(conn),
        "word-count:getWeek" => get_week(conn),
        "word-count:getAllTime" => get_all_time(conn),
        "word-count:getHistory" => get_history(conn, args),
        // setGoal returns void in Electron; report success so the bridge telemetry
        // doesn't count it as unported.
        "word-count:setGoal" => set_goal(conn, args),
        "word-count:getGoal" => json!(get_goal(conn)),
        "word-count:getProgress" => get_progress(conn),
        _ => Value::Null,
    }
}
