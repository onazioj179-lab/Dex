// =============================================================================
// DEX 6.0 — Session Replay (Tauri port of src/main/core/SessionReplayManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed session replay (session-replay:* channels), reading/writing the
//! shared `dex.db` `session_replay` table with the identical schema, queries, and
//! return shapes as the Electron manager (Feature 1). The persisted session/event
//! CRUD + aggregate queries are ported faithfully:
//!   - getSessions: GROUP BY session_id aggregate (start/end/count/duration)
//!   - getSessionActions: per-session ordered rows
//!
//! Two concerns DEGRADE HONESTLY because they depend on Electron-runtime state /
//! crates not available in this pure DB layer (only rusqlite + serde_json):
//!   - The live current session id is a per-process `crypto.randomUUID()` held in
//!     memory at `initialize()` time, advanced/cleaned by timers. There is no such
//!     in-memory instance here, so `getCurrentSession` returns an empty/0 session
//!     and `recordAction` cannot attribute writes to a live session (it has no
//!     compression either — zlib is not a dependency). Both are non-DB live
//!     recording concerns and are reported as not-ported rather than faked.
//!   - `getSessionActions` decompresses before/after_state via zlib in Electron;
//!     with no zlib here the stored value is returned verbatim (honest pass-through
//!     of whatever bytes the persisted column holds).

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, Row};
use serde_json::{json, Value};

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
        CREATE INDEX IF NOT EXISTS idx_session_replay_timestamp ON session_replay(timestamp);",
    );
}

/// One row -> the ReplayEntry shape (snake_case keys, column order matches the
/// `SELECT *` the TS issues against the table above). `before_state`/`after_state`
/// are nullable TEXT; Electron decompresses them via zlib before returning, which
/// is not available here, so the stored value is passed through verbatim.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "session_id": row.get::<_, String>(1)?,
        "action_type": row.get::<_, String>(2)?,
        "app": row.get::<_, String>(3)?,
        "before_state": row.get::<_, Option<String>>(4)?,
        "after_state": row.get::<_, Option<String>>(5)?,
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
/// for one session ordered by timestamp ASC. before_state/after_state are returned
/// as-stored (zlib decompression is not available in this DB-only layer).
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

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "session-replay:getSessions" => get_sessions(conn),

        "session-replay:getSessionActions" => {
            let session_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_session_actions(conn, session_id)
        }

        // recordAction in Electron attributes the write to the live in-memory
        // session id (crypto.randomUUID at initialize) and zlib-compresses the
        // before/after state. Neither the per-process live session nor zlib exist
        // in this pure DB layer, so the write cannot be reproduced faithfully.
        // It returns -1 (the same value the TS returns when the DB is absent /
        // the insert fails) rather than persisting an unattributed/uncompressed
        // row that getSessionActions could not round-trip. Live recording belongs
        // in the Tauri runtime layer, which would own the session id + compression
        // and call a faithful insert.
        "session-replay:recordAction" => json!(-1),

        // getCurrentSession returns the live in-memory { sessionId, startTime }
        // captured at initialize(); there is no such instance here, so it degrades
        // to an empty session id / 0 start time (honest "no live session").
        "session-replay:getCurrentSession" => json!({
            "sessionId": "",
            "startTime": 0
        }),

        _ => Value::Null,
    }
}
