// =============================================================================
// DEX 6.0 — Reminders (Tauri port of src/main/core/ReminderManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed reminders (reminder:* channels), reading/writing the shared
//! `dex.db` `reminders` table with the identical schema, queries, and return
//! shapes as the Electron manager (Feature 28). Only the CRUD surface is part of
//! the renderer-facing IPC contract — create / snooze / complete / remove /
//! getAll / getUpcoming — and it is ported faithfully here.
//!
//! The live scheduler is NOT an IPC channel and is intentionally absent: the
//! Electron manager runs a 30s setInterval (`startChecking`/`processReminders`)
//! that fires OS `Notification`s, pushes `reminder:fired` to the renderer, emits
//! on the event bus, inserts into the `notifications` table, and advances/repeats
//! due rows. Those are timer + BrowserWindow + OS-notification concerns that live
//! in the Tauri command/runtime layer, not in these pure DB functions, so they
//! degrade honestly (no fabricated firing). The persisted state they rely on
//! (remind_at, repeat, completed, snoozed_until) is fully maintained by the CRUD
//! handlers below, so a real Tauri scheduler can drive firing from this table.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// The 4 valid repeat options (matches REPEAT_OPTIONS in the TS, in order).
const REPEAT_OPTIONS: [&str; 4] = ["none", "daily", "weekly", "monthly"];

/// Create the reminders table + indexes (matches ReminderManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            item_type TEXT NOT NULL DEFAULT '',
            item_id TEXT NOT NULL DEFAULT '',
            remind_at TEXT NOT NULL,
            repeat TEXT NOT NULL DEFAULT 'none',
            completed INTEGER NOT NULL DEFAULT 0,
            snoozed_until TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at);
        CREATE INDEX IF NOT EXISTS idx_reminders_completed ON reminders(completed);",
    );
}

/// One row -> the Reminder shape (column order matches `SELECT *` on the table
/// definition above, exactly as Electron's better-sqlite3 returned it;
/// `snoozed_until` is nullable, all others non-null).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "title": row.get::<_, String>(2)?,
        "body": row.get::<_, String>(3)?,
        "item_type": row.get::<_, String>(4)?,
        "item_id": row.get::<_, String>(5)?,
        "remind_at": row.get::<_, String>(6)?,
        "repeat": row.get::<_, String>(7)?,
        "completed": row.get::<_, i64>(8)?,
        "snoozed_until": row.get::<_, Option<String>>(9)?,
        "created_at": row.get::<_, String>(10)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, app, title, body, item_type, item_id, remind_at, repeat, completed, snoozed_until, created_at FROM reminders";

fn query_list(conn: &Connection, sql: &str, p: Vec<SqlValue>) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// reminder:create — create(params). Returns the inserted Reminder row, or null
/// when the trimmed title is empty (mirrors the `if (!trimmedTitle) return null`
/// guard) or the DB write fails.
fn create(conn: &Connection, params_obj: &Value) -> Value {
    let title = params_obj
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Value::Null;
    }

    // String fields default to '' when omitted/empty (TS `params.x || ''`).
    let s = |key: &str, default: &str| {
        params_obj
            .get(key)
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .unwrap_or(default)
            .to_string()
    };

    let app = s("app", "");
    let body = s("body", "");
    let item_type = s("itemType", "");
    let item_id = s("itemId", "");
    let remind_at = s("remindAt", "");

    // repeat validated against the allow-list, defaulting to 'none'.
    let raw_repeat = params_obj
        .get("repeat")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let repeat = if REPEAT_OPTIONS.contains(&raw_repeat) {
        raw_repeat
    } else {
        "none"
    };

    if conn
        .execute(
            "INSERT INTO reminders (app, title, body, item_type, item_id, remind_at, repeat)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![app, trimmed, body, item_type, item_id, remind_at, repeat],
        )
        .is_err()
    {
        return Value::Null;
    }

    let id = conn.last_insert_rowid();
    let sql = format!("{} WHERE id = ?", SELECT_ALL);
    let out = conn.query_row(&sql, params![id], row_to_json).unwrap_or(Value::Null);
    out
}

/// reminder:getAll — getAll(includeCompleted=false). Returns Reminder[].
fn get_all(conn: &Connection, include_completed: bool) -> Value {
    let sql = if include_completed {
        format!("{} ORDER BY remind_at ASC", SELECT_ALL)
    } else {
        format!("{} WHERE completed = 0 ORDER BY remind_at ASC", SELECT_ALL)
    };
    query_list(conn, &sql, Vec::new())
}

/// reminder:getUpcoming — getUpcoming(hours=24). Returns the not-yet-completed
/// reminders whose remind_at is within the next `hours`. The TS computes the
/// cutoff as `Date.now() + hours*3600000`; we compute it DB-side with
/// `datetime('now', '+N hours')` so the persisted-time comparison stays faithful.
fn get_upcoming(conn: &Connection, hours: i64) -> Value {
    let sql = format!(
        "{} WHERE completed = 0 AND remind_at <= datetime('now', ?) ORDER BY remind_at ASC",
        SELECT_ALL
    );
    let modifier = format!("+{} hours", hours);
    query_list(conn, &sql, vec![SqlValue::Text(modifier)])
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "reminder:create" => create(conn, &args.get(0).cloned().unwrap_or_else(|| json!({}))),

        // snooze/complete/remove return boolean true in Electron (the `if (!db)
        // return false` path never triggers here — the connection is always
        // present in this dispatcher).
        "reminder:snooze" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let minutes = args.get(1).and_then(|v| v.as_i64()).unwrap_or(0);
            // until = Date.now() + minutes*60000, computed DB-side to stay faithful.
            let modifier = format!("+{} minutes", minutes);
            let _ = conn.execute(
                "UPDATE reminders SET snoozed_until = datetime('now', ?) WHERE id = ?",
                params![modifier, id],
            );
            json!(true)
        }
        "reminder:complete" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let _ = conn.execute(
                "UPDATE reminders SET completed = 1 WHERE id = ?",
                params![id],
            );
            json!(true)
        }
        "reminder:remove" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let _ = conn.execute("DELETE FROM reminders WHERE id = ?", params![id]);
            json!(true)
        }

        "reminder:getAll" => {
            // includeCompleted is optional and defaults to false.
            let include_completed = args.get(0).and_then(|v| v.as_bool()).unwrap_or(false);
            get_all(conn, include_completed)
        }
        "reminder:getUpcoming" => {
            // hours is optional and defaults to 24.
            let hours = args.get(0).and_then(|v| v.as_i64()).unwrap_or(24);
            get_upcoming(conn, hours)
        }

        _ => Value::Null,
    }
}
