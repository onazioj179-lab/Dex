// =============================================================================
// DEX 6.0 — Session Replay (Tauri port of src/main/core/SessionReplayManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed session replay (session-replay:* channels), reading/writing the
//! shared `dex.db` `session_replay` table with the identical schema, queries, and
//! return shapes as the Electron manager (Feature 1). The persisted session/event
//! CRUD + aggregate queries are ported faithfully:
//!   - getSessions: GROUP BY session_id aggregate (start/end/count/duration)
//!   - getSessionActions: per-session ordered rows (before/after_state inflated)
//!   - recordAction: deflate before/after state, attribute to the current session,
//!     insert, return lastInsertRowid
//!   - getCurrentSession: { sessionId, startTime } for this run's session
//!
//! Per-run session identity: Electron mints a `crypto.randomUUID()` once at
//! `initialize()` and holds it in memory (`currentSessionId` + `sessionStartTime`).
//! These are pure stateless functions with no module state, so — exactly as
//! `journal.rs` does — the current run's session id + start time are minted in
//! `ensure_schema` and stored in a tiny `session_replay_meta` table, which every
//! later dispatch reads back. This reproduces the single-session-per-run behaviour
//! without holding process state.
//!
//! Compression: Electron zlib-deflates the before/after JSON state and stores it.
//! Here `crate::compress` (flate2, byte-compatible with Node's zlib) deflates the
//! JSON to a zlib BLOB on write and inflates it back on read, so the state values
//! round-trip identically.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Create the session_replay table + indexes (matches SessionReplayManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS session_replay (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            app TEXT NOT NULL,
            before_state TEXT,
            after_state TEXT,
            timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_session_replay_session ON session_replay(session_id);
        CREATE INDEX IF NOT EXISTS idx_session_replay_timestamp ON session_replay(timestamp);

        -- Extension (not in TS): holds this run's current session id + start time
        -- so the pure stateless handlers can attribute recordAction writes and
        -- answer getCurrentSession, replacing Electron's in-memory
        -- currentSessionId / sessionStartTime fields set at initialize().
        CREATE TABLE IF NOT EXISTS session_replay_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    );

    seed_session(conn);
}

/// Mint this run's session (mirrors initialize(): currentSessionId =
/// crypto.randomUUID(), sessionStartTime = Date.now()): generate a v4-style UUID
/// and remember it + the start time in session_replay_meta. Idempotent — only
/// runs the first time per DB lifetime/process.
fn seed_session(conn: &Connection) {
    let existing: Option<String> = conn
        .query_row(
            "SELECT value FROM session_replay_meta WHERE key = 'current_session_id'",
            [],
            |r| r.get(0),
        )
        .ok();
    if existing.is_some() {
        return;
    }

    let session_id = gen_uuid(conn);
    let now = now_ms();
    let _ = conn.execute(
        "INSERT OR REPLACE INTO session_replay_meta (key, value) VALUES ('current_session_id', ?)",
        params![session_id],
    );
    let _ = conn.execute(
        "INSERT OR REPLACE INTO session_replay_meta (key, value) VALUES ('session_start_time', ?)",
        params![now.to_string()],
    );
}

/// The current run's session id (Electron's currentSessionId).
fn current_session_id(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM session_replay_meta WHERE key = 'current_session_id'",
        [],
        |r| r.get(0),
    )
    .unwrap_or_default()
}

/// The current run's session start time (Electron's sessionStartTime).
fn session_start_time(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT value FROM session_replay_meta WHERE key = 'session_start_time'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| s.parse::<i64>().ok())
    .unwrap_or(0)
}

/// v4-style UUID without a new dep: 16 random bytes from SQLite's randomblob,
/// with the version (4) and variant nibbles set, formatted 8-4-4-4-12. Mirrors
/// the shape/uniqueness of Node's crypto.randomUUID() (same approach as journal.rs).
fn gen_uuid(conn: &Connection) -> String {
    let hex: String = conn
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .unwrap_or_else(|_| format!("{:032x}", now_ms() as u128));
    let mut b: Vec<char> = hex.chars().collect();
    while b.len() < 32 {
        b.push('0');
    }
    b[12] = '4'; // version 4
    b[16] = ['8', '9', 'a', 'b'][(now_ms() as usize) & 3]; // variant 10xx
    let s: String = b.into_iter().collect();
    format!(
        "{}-{}-{}-{}-{}",
        &s[0..8],
        &s[8..12],
        &s[12..16],
        &s[16..20],
        &s[20..32]
    )
}

/// Decompress a stored before/after_state column to the JSON value the renderer
/// expects. Mirrors the TS `decompressJson`: try zlib-inflate then JSON.parse;
/// if that fails, try JSON.parse of the raw text; otherwise return the raw text.
/// A NULL column round-trips to JSON null.
fn decompress_state(col: Option<Vec<u8>>) -> Value {
    let bytes = match col {
        Some(b) => b,
        None => return Value::Null,
    };
    // zlib-inflate -> JSON.parse
    if let Some(s) = crate::compress::inflate_to_string(&bytes) {
        if let Ok(v) = serde_json::from_str::<Value>(&s) {
            return v;
        }
    }
    // Fallback: treat the raw bytes as text, JSON.parse, else return as string.
    let raw = String::from_utf8_lossy(&bytes).to_string();
    match serde_json::from_str::<Value>(&raw) {
        Ok(v) => v,
        Err(_) => Value::String(raw),
    }
}

/// One row -> the ReplayEntry shape (snake_case keys, column order matches the
/// `SELECT` the TS issues against the table above). `before_state`/`after_state`
/// hold zlib-deflated JSON BLOBs (written by recordAction); they are inflated and
/// parsed back to their JSON value here, matching the TS `decompressJson` on read.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "session_id": row.get::<_, String>(1)?,
        "action_type": row.get::<_, String>(2)?,
        "app": row.get::<_, String>(3)?,
        "before_state": decompress_state(row.get::<_, Option<Vec<u8>>>(4)?),
        "after_state": decompress_state(row.get::<_, Option<Vec<u8>>>(5)?),
        "timestamp": row.get::<_, i64>(6)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, session_id, action_type, app, before_state, after_state, timestamp FROM session_replay";

/// session-replay:getSessions -> getSessions(): ReplaySession[] aggregate rows,
/// ordered by start_time DESC (matches the GROUP BY query verbatim).
fn get_sessions(conn: &Connection) -> Value {
    let sql = "SELECT session_id, \
               MIN(timestamp) as start_time, \
               MAX(timestamp) as end_time, \
               COUNT(*) as action_count, \
               (MAX(timestamp) - MIN(timestamp)) as duration_ms \
               FROM session_replay \
               GROUP BY session_id \
               ORDER BY start_time DESC";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([], |r| {
        Ok(json!({
            "session_id": r.get::<_, String>(0)?,
            "start_time": r.get::<_, i64>(1)?,
            "end_time": r.get::<_, i64>(2)?,
            "action_count": r.get::<_, i64>(3)?,
            "duration_ms": r.get::<_, i64>(4)?,
        }))
    }) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// session-replay:getSessionActions -> getSessionActions(sessionId): ReplayEntry[]
/// for one session ordered by timestamp ASC. before_state/after_state are inflated
/// and JSON-parsed back to their values via `row_to_json` (matching the TS map).
fn get_session_actions(conn: &Connection, session_id: &str) -> Value {
    let sql = format!("{} WHERE session_id = ? ORDER BY timestamp ASC", SELECT_COLS);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(
        rusqlite::params_from_iter(vec![SqlValue::Text(session_id.to_string())]),
        row_to_json,
    ) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// session-replay:recordAction -> recordAction(actionType, app, beforeState,
/// afterState): number. Deflates the before/after JSON state (matching the TS
/// compressJson), attributes the write to this run's session id, inserts, and
/// returns lastInsertRowid. Returns -1 on failure — the same value the TS returns
/// when the DB is absent or the insert throws.
fn record_action(
    conn: &Connection,
    action_type: &str,
    app: &str,
    before_state: &Value,
    after_state: &Value,
) -> Value {
    let session_id = current_session_id(conn);

    // compressJson(data): JSON.stringify then zlib-deflate. A JSON null arg (the
    // renderer passing null/undefined) stringifies to "null", matching the TS.
    let compress = |v: &Value| -> Vec<u8> {
        let json_str = serde_json::to_string(v).unwrap_or_else(|_| "null".to_string());
        crate::compress::deflate_str(&json_str)
    };
    let compressed_before = compress(before_state);
    let compressed_after = compress(after_state);
    let now = now_ms();

    match conn.execute(
        "INSERT INTO session_replay (session_id, action_type, app, before_state, after_state, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![session_id, action_type, app, compressed_before, compressed_after, now],
    ) {
        Ok(_) => json!(conn.last_insert_rowid()),
        Err(_) => json!(-1),
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "session-replay:getSessions" => get_sessions(conn),

        "session-replay:getSessionActions" => {
            let session_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_session_actions(conn, session_id)
        }

        // recordAction(actionType, app, beforeState, afterState) -> rowid | -1.
        "session-replay:recordAction" => {
            let action_type = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let app = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let before_state = args.get(2).cloned().unwrap_or(Value::Null);
            let after_state = args.get(3).cloned().unwrap_or(Value::Null);
            record_action(conn, action_type, app, &before_state, &after_state)
        }

        // getCurrentSession -> { sessionId, startTime } captured for this run.
        "session-replay:getCurrentSession" => json!({
            "sessionId": current_session_id(conn),
            "startTime": session_start_time(conn),
        }),

        _ => Value::Null,
    }
}
