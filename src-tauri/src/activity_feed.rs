// =============================================================================
// DEX 6.0 — Activity Feed (Tauri port of src/main/core/ActivityFeedManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed activity feed (activity-feed:* channels), reading/writing the
//! shared `dex.db` `activity_feed` table with the identical schema, queries, and
//! return shapes as the Electron manager. The event-bus auto-recording is an
//! internal Electron concern (not an IPC channel); the renderer-facing surface
//! is the five handlers below, which are ported faithfully.
//!
//! ----------------------------------------------------------------------------
//! ADDENDUM — the `activity:*` namespace (NOT `activity-feed:*`).
//! ----------------------------------------------------------------------------
//! This file also hosts a SECOND, unrelated subsystem: the five `activity:*`
//! handlers in src/main/main.ts (getAll / getRecent / markRead / markAllRead /
//! clearAll). Those wrap `this.dataStore.get/set('activities')` — DataStore is a
//! single electron-store named `dex-data` whose `activities` value is a flat
//! array of records { id, type, title, timestamp, read, data? }. This is the
//! same DataStore-KV tier already ported for `modes:*` and `projects:*` in
//! main.rs, so the port uses the native KV store (crate::kv_get / crate::kv_set)
//! under the SAME top-level key "activities".
//!
//! DIVERGENCE (name): the file's required `dispatch(app, channel, args)` entry
//! point name is already taken by the SQLite feed's `dispatch(conn, ...)` above
//! (wired in main.rs as `activity-feed::dispatch(conn, ...)`). Two functions
//! can't share the name `dispatch` with different signatures, and editing
//! main.rs is out of scope here, so the `activity:*` entry point is exposed as
//! `dispatch_kv(app, channel, args)`. The orchestrator should route
//! `channel.starts_with("activity:")` to `activity_feed::dispatch_kv`. Nothing
//! creates records (no id gen / no timestamps) — the feed is populated by other
//! subsystems — so this is read + mark-read + clear only. Return shapes match
//! the Electron handlers exactly:
//!   - getAll      -> activities array (or [])
//!   - getRecent   -> last 20, reversed (newest-first)
//!   - markRead    -> { success: true }
//!   - markAllRead -> { success: true }
//!   - clearAll    -> { success: true }

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

const MAX_ENTRIES: i64 = 5000;

/// Create the activity_feed table + indexes (matches ActivityFeedManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS activity_feed (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT '',
            app TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_activity_feed_type ON activity_feed(event_type);
        CREATE INDEX IF NOT EXISTS idx_activity_feed_app ON activity_feed(app);
        CREATE INDEX IF NOT EXISTS idx_activity_feed_created ON activity_feed(created_at);",
    );
    clean_old_entries(conn);
}

/// Trim to the newest MAX_ENTRIES rows (matches cleanOldEntries).
fn clean_old_entries(conn: &Connection) {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM activity_feed", [], |r| r.get(0))
        .unwrap_or(0);
    if count > MAX_ENTRIES {
        let excess = count - MAX_ENTRIES;
        let _ = conn.execute(
            "DELETE FROM activity_feed WHERE id IN (SELECT id FROM activity_feed ORDER BY created_at ASC LIMIT ?)",
            params![excess],
        );
    }
}

/// One row -> the ActivityEntry shape (details kept as the stored JSON string,
/// exactly as `SELECT *` returned it under Electron).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "event_type": row.get::<_, String>(1)?,
        "source": row.get::<_, String>(2)?,
        "app": row.get::<_, String>(3)?,
        "title": row.get::<_, String>(4)?,
        "details": row.get::<_, String>(5)?,
        "created_at": row.get::<_, String>(6)?,
    }))
}

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

fn get_feed(conn: &Connection, options: &Value) -> Value {
    let limit = options
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(100)
        .clamp(0, 500);
    let offset = options.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);

    let mut sql = String::from(
        "SELECT id, event_type, source, app, title, details, created_at FROM activity_feed WHERE 1=1",
    );
    let mut p: Vec<SqlValue> = Vec::new();
    if let Some(app) = options.get("app").and_then(|v| v.as_str()) {
        sql.push_str(" AND app = ?");
        p.push(SqlValue::Text(app.to_string()));
    }
    if let Some(et) = options.get("eventType").and_then(|v| v.as_str()) {
        sql.push_str(" AND event_type = ?");
        p.push(SqlValue::Text(et.to_string()));
    }
    sql.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
    p.push(SqlValue::Integer(limit));
    p.push(SqlValue::Integer(offset));
    query_list(conn, &sql, p)
}

fn get_today(conn: &Connection) -> Value {
    query_list(
        conn,
        "SELECT id, event_type, source, app, title, details, created_at FROM activity_feed
         WHERE date(created_at) = date('now') ORDER BY created_at DESC LIMIT 200",
        Vec::new(),
    )
}

fn get_stats(conn: &Connection) -> Value {
    let one = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0) };
    let today = one("SELECT COUNT(*) FROM activity_feed WHERE date(created_at) = date('now')");
    let week = one("SELECT COUNT(*) FROM activity_feed WHERE date(created_at) >= date('now','-7 days')");
    let total = one("SELECT COUNT(*) FROM activity_feed");

    let mut by_type = serde_json::Map::new();
    if let Ok(mut stmt) = conn
        .prepare("SELECT event_type, COUNT(*) FROM activity_feed GROUP BY event_type ORDER BY COUNT(*) DESC")
    {
        if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))) {
            for (etype, cnt) in rows.flatten() {
                by_type.insert(etype, json!(cnt));
            }
        }
    }
    json!({ "today": today, "thisWeek": week, "total": total, "byType": by_type })
}

fn record(conn: &Connection, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let details = args.get(4).cloned().unwrap_or_else(|| json!({}));
    let details_str = serde_json::to_string(&details).unwrap_or_else(|_| "{}".to_string());
    let _ = conn.execute(
        "INSERT INTO activity_feed (event_type, source, app, title, details) VALUES (?,?,?,?,?)",
        params![s(0), s(1), s(2), s(3), details_str],
    );
    json!({ "success": true })
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "activity-feed:get" => get_feed(conn, &args.get(0).cloned().unwrap_or_else(|| json!({}))),
        "activity-feed:getToday" => get_today(conn),
        "activity-feed:stats" => get_stats(conn),
        // clear/record return void in Electron; we report success so the bridge
        // telemetry doesn't count them as unported.
        "activity-feed:clear" => {
            let _ = conn.execute("DELETE FROM activity_feed", []);
            json!({ "success": true })
        }
        "activity-feed:record" => record(conn, args),
        _ => Value::Null,
    }
}

// ============================================================================
// `activity:*` namespace — DataStore-KV port (see ADDENDUM in the file header).
// Backs the `activities` array via crate::kv_get / crate::kv_set, mirroring the
// `modes:*` / `projects:*` ports in main.rs.
// ============================================================================

// dataStore.get('activities') || []  — any non-array value falls back to [].
fn read_activities(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, "activities") {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn write_activities(app: &tauri::AppHandle, activities: &[Value]) {
    crate::kv_set(app, "activities", json!(activities));
}

/// Route an `activity:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
pub fn dispatch_kv(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // dataStore.get('activities') || []
        "activity:getAll" => json!(read_activities(app)),

        // activities.slice(-20).reverse()
        "activity:getRecent" => {
            let activities = read_activities(app);
            let start = activities.len().saturating_sub(20);
            let mut recent: Vec<Value> = activities[start..].to_vec();
            recent.reverse();
            json!(recent)
        }

        // find by id, set read=true if present, persist; always { success: true }
        "activity:markRead" => {
            let activity_id = args.get(0).and_then(|v| v.as_str());
            let mut activities = read_activities(app);
            if let Some(id) = activity_id {
                let mut changed = false;
                for a in activities.iter_mut() {
                    if a.get("id").and_then(|v| v.as_str()) == Some(id) {
                        if let Some(obj) = a.as_object_mut() {
                            obj.insert("read".into(), json!(true));
                        }
                        changed = true;
                        break;
                    }
                }
                if changed {
                    write_activities(app, &activities);
                }
            }
            json!({ "success": true })
        }

        // set read=true on every activity, persist; { success: true }
        "activity:markAllRead" => {
            let mut activities = read_activities(app);
            for a in activities.iter_mut() {
                if let Some(obj) = a.as_object_mut() {
                    obj.insert("read".into(), json!(true));
                }
            }
            write_activities(app, &activities);
            json!({ "success": true })
        }

        // dataStore.set('activities', []); { success: true }
        "activity:clearAll" => {
            write_activities(app, &[]);
            json!({ "success": true })
        }

        _ => Value::Null,
    }
}
