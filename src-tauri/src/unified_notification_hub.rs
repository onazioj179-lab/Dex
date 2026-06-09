// =============================================================================
// DEX 6.0 — Unified Notification Hub (Tauri port of src/main/core/UnifiedNotificationHub.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed unified notification center (notification-center:* channels),
//! reading/writing the shared `dex.db` `notifications` + `notification_preferences`
//! tables with the identical schema, queries, and return shapes as the Electron
//! `UnifiedNotificationCenter`. The DB path is ported faithfully: per-app
//! preference gating, the INSERT, unread counts, mark/clear/delete, and the
//! preference get/set/list channels.
//!
//! The Electron hub also drives OS-level concerns that have no place in these
//! pure DB functions: desktop `ElectronNotification` toasts, `mainWindow`
//! webContents broadcasts (`:new`, `:unread-count`, `:dnd-changed`), and an
//! in-memory Do-Not-Disturb timer/counter. Those are side effects layered on
//! top of the DB writes; the renderer-visible RETURN values are unchanged by
//! them, so `send`/`markRead`/etc. are ported by their DB behaviour, and the
//! purely in-memory DND state (`setDnd`/`isDnd`) degrades honestly since no
//! process-lifetime singleton survives in this stateless dispatch layer.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

/// The allow-list of delivery methods (matches the DeliveryMethod union).
const DELIVERY_METHODS: [&str; 3] = ["all", "bell", "silent"];

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Create the notifications + notification_preferences tables (verbatim from
/// DatabaseManager.createTables; no indexes are defined there).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            action TEXT DEFAULT NULL,
            read INTEGER DEFAULT 0,
            delivery TEXT DEFAULT 'all',
            timestamp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notification_preferences (
            app TEXT PRIMARY KEY,
            enabled INTEGER DEFAULT 1,
            delivery TEXT DEFAULT 'all'
        );",
    );
}

/// One row -> the NotificationRecord shape. Column order matches the explicit
/// SELECT_COLS list below (which mirrors `SELECT *` on the table definition, as
/// better-sqlite3 returned it under Electron). `action` is nullable.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "title": row.get::<_, String>(2)?,
        "body": row.get::<_, String>(3)?,
        "action": row.get::<_, Option<String>>(4)?,
        "read": row.get::<_, i64>(5)?,
        "delivery": row.get::<_, Option<String>>(6)?,
        "timestamp": row.get::<_, i64>(7)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, app, title, body, action, read, delivery, timestamp FROM notifications";

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

/// getAppPreference(appName) -> { app, enabled: bool, delivery }. Falls back to
/// the default { enabled: true, delivery: 'all' } when no row exists (or on any
/// DB error), exactly like the TS getter.
fn get_app_preference(conn: &Connection, app_name: &str) -> Value {
    let row = conn.query_row(
        "SELECT app, enabled, delivery FROM notification_preferences WHERE app = ?",
        params![app_name],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        },
    );
    match row {
        Ok((app, enabled, delivery)) => json!({
            "app": app,
            "enabled": enabled == 1,
            "delivery": delivery,
        }),
        Err(_) => json!({
            "app": app_name,
            "enabled": true,
            "delivery": "all",
        }),
    }
}

/// notification-center:send — send(payload). Inserts when the target app's
/// preference is enabled (default enabled), returning the new id; returns -1
/// when the preference is disabled (matching the TS `if (!prefs.enabled)` guard).
/// The OS toast / renderer broadcasts / DND counter are side effects that do not
/// affect this return value, so they are intentionally not reproduced here.
fn send(conn: &Connection, payload: &Value) -> Value {
    let app = payload.get("app").and_then(|v| v.as_str()).unwrap_or("");

    let prefs = get_app_preference(conn, app);
    let enabled = prefs.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    if !enabled {
        return json!(-1);
    }
    let pref_delivery = prefs
        .get("delivery")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
        .unwrap_or("all");

    let title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let body = payload.get("body").and_then(|v| v.as_str()).unwrap_or("");

    // effectiveDelivery = payload.delivery || prefs.delivery || 'all'
    let effective_delivery = payload
        .get("delivery")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
        .unwrap_or(pref_delivery);

    // actionJson = payload.action ? JSON.stringify(payload.action) : null
    let action_json: Option<String> = match payload.get("action") {
        Some(a) if !a.is_null() => Some(serde_json::to_string(a).unwrap_or_default()),
        _ => None,
    };

    let now = now_ms();
    let inserted = conn.execute(
        "INSERT INTO notifications (app, title, body, action, read, delivery, timestamp) \
         VALUES (?, ?, ?, ?, 0, ?, ?)",
        params![app, title, body, action_json, effective_delivery, now],
    );
    if inserted.is_err() {
        // TS returns -1 when `db` is unavailable; an insert failure degrades the
        // same way rather than fabricating an id.
        return json!(-1);
    }
    json!(conn.last_insert_rowid())
}

/// notification-center:getAll — getAll(limit=200). Returns NotificationRecord[].
fn get_all(conn: &Connection, args: &Value) -> Value {
    // limit defaults to 200 (TS default param); a missing/non-numeric arg falls back.
    let limit = args.get(0).and_then(|v| v.as_i64()).unwrap_or(200);
    let sql = format!("{} ORDER BY timestamp DESC LIMIT ?", SELECT_COLS);
    query_list(conn, &sql, vec![SqlValue::Integer(limit)])
}

/// notification-center:getUnreadCount — getUnreadCount(). Returns a number (0
/// when the DB is unavailable).
fn get_unread_count(conn: &Connection) -> Value {
    let cnt: i64 = conn
        .query_row("SELECT COUNT(*) FROM notifications WHERE read = 0", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    json!(cnt)
}

/// notification-center:getAllPreferences — getAllPreferences(). Returns
/// { app, enabled: bool, delivery }[].
fn get_all_preferences(conn: &Connection) -> Value {
    let mut stmt = match conn.prepare("SELECT app, enabled, delivery FROM notification_preferences")
    {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([], |r| {
        Ok(json!({
            "app": r.get::<_, String>(0)?,
            "enabled": r.get::<_, i64>(1)? == 1,
            "delivery": r.get::<_, Option<String>>(2)?,
        }))
    }) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "notification-center:send" => {
            send(conn, &args.get(0).cloned().unwrap_or_else(|| json!({})))
        }
        "notification-center:getAll" => get_all(conn, args),
        "notification-center:getUnreadCount" => get_unread_count(conn),

        // markRead/markAllRead/clearAll/delete are void in TS; the IPC handlers
        // return `true`. (broadcastUnreadCount is a renderer side effect.)
        "notification-center:markRead" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let _ = conn.execute("UPDATE notifications SET read = 1 WHERE id = ?", params![id]);
            json!(true)
        }
        "notification-center:markAllRead" => {
            let _ = conn.execute("UPDATE notifications SET read = 1 WHERE read = 0", []);
            json!(true)
        }
        "notification-center:clearAll" => {
            let _ = conn.execute("DELETE FROM notifications", []);
            json!(true)
        }
        "notification-center:delete" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let _ = conn.execute("DELETE FROM notifications WHERE id = ?", params![id]);
            json!(true)
        }

        // setDnd toggles process-lifetime in-memory state (the DND flag, start
        // time, and a counter of suppressed notifications) and emits a
        // `:dnd-changed` renderer broadcast. None of that survives this stateless
        // dispatch layer, so it degrades honestly rather than pretending to hold
        // a flag that the next call cannot observe.
        "notification-center:setDnd" => json!({
            "success": false,
            "error": "in-memory Do Not Disturb state has no persistent store in the DB layer (not ported)"
        }),
        // isDnd reads that same in-memory flag — always false here, so it cannot
        // honestly report a toggled state; degrade rather than fabricate `false`.
        "notification-center:isDnd" => json!({
            "success": false,
            "error": "in-memory Do Not Disturb state has no persistent store in the DB layer (not ported)"
        }),

        "notification-center:getAppPreference" => {
            let app_name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_app_preference(conn, app_name)
        }
        "notification-center:setAppPreference" => {
            let app_name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let enabled = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            let raw_delivery = args.get(2).and_then(|v| v.as_str()).unwrap_or("all");
            // delivery is a DeliveryMethod under the bridge; guard the value.
            let delivery = if DELIVERY_METHODS.contains(&raw_delivery) {
                raw_delivery
            } else {
                "all"
            };
            let enabled_int: i64 = if enabled { 1 } else { 0 };
            let _ = conn.execute(
                "INSERT INTO notification_preferences (app, enabled, delivery) VALUES (?, ?, ?) \
                 ON CONFLICT(app) DO UPDATE SET enabled = ?, delivery = ?",
                params![app_name, enabled_int, delivery, enabled_int, delivery],
            );
            json!(true)
        }
        "notification-center:getAllPreferences" => get_all_preferences(conn),

        _ => Value::Null,
    }
}
