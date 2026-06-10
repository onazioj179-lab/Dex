// =============================================================================
// DEX 6.0 — Session Replay (Tauri port of src/main/core/SessionReplayManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed session replay (session-replay:* channels), reading/writing the
//! shared `dex.db` `session_replay` table with the identical schema, queries, and
//! return shapes as the Electron manager (Feature 1). Fully ported:
//!   - getSessions: GROUP BY session_id aggregate (start/end/count/duration)
//!   - getSessionActions: per-session ordered rows, before/after_state run back
//!     through base64 + zlib inflate + JSON parse (same fallback chain as the
//!     TS decompressJson: parse the stored text, else return it verbatim)
//!   - recordAction: states zlib-deflated and base64-encoded (Node parity via
//!     the shared [`crate::zlib`] helpers), attributed to the live session
//!   - getCurrentSession: per-process { sessionId, startTime } captured on
//!     first use, mirroring Electron's initialize()-time crypto.randomUUID()
//!   - the 7-session retention cleanup runs at ensure_schema (initialize) time

use crate::zlib;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::sync::OnceLock;

/// Sessions retained in the table (matches MAX_SESSIONS).
const MAX_SESSIONS: usize = 7;

/// The live per-process session, captured lazily on first use — the Tauri
/// analog of Electron's initialize()-time `crypto.randomUUID()` + Date.now().
struct LiveSession {
    id: String,
    start_time: i64,
}

fn live_session() -> &'static LiveSession {
    static LIVE: OnceLock<LiveSession> = OnceLock::new();
    LIVE.get_or_init(|| LiveSession {
        id: pseudo_uuid_v4(),
        start_time: current_millis(),
    })
}

/// A UUIDv4-shaped session label seeded from the wall clock, monotonic clock,
/// and process id, mixed through SplitMix64. The id only namespaces one app
/// run's rows in the local replay table, so this does not need to be (and is
/// not) cryptographically random.
fn pseudo_uuid_v4() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mono = std::time::Instant::now();
    let mut seed = nanos ^ ((std::process::id() as u64) << 32) ^ (&mono as *const _ as u64);
    let mut next = || {
        seed = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = seed;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    };
    let (hi, lo) = (next(), next());
    let mut bytes = [0u8; 16];
    bytes[..8].copy_from_slice(&hi.to_be_bytes());
    bytes[8..].copy_from_slice(&lo.to_be_bytes());
    bytes[6] = (bytes[6] & 0x0F) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3F) | 0x80; // RFC 4122 variant
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

/// Wall-clock milliseconds since the Unix epoch (Date.now() equivalent).
fn current_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// compressJson parity: JSON-stringify non-strings (strings pass raw), zlib
/// deflate, base64-encode. On the (unreachable) compression error path the TS
/// falls back to the plain JSON text; mirrored here.
fn compress_json(data: &Value) -> String {
    let json_str = match data.as_str() {
        Some(s) => s.to_string(),
        None => data.to_string(),
    };
    BASE64.encode(zlib::deflate(json_str.as_bytes()))
}

/// decompressJson parity: base64-decode + inflate + JSON-parse; on any failure
/// try JSON-parsing the stored text; else return the stored text verbatim.
fn decompress_json(stored: &str) -> Value {
    if let Ok(compressed) = BASE64.decode(stored) {
        if let Ok(bytes) = zlib::inflate(&compressed) {
            if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
                return v;
            }
        }
    }
    serde_json::from_str(stored).unwrap_or_else(|_| json!(stored))
}

/// Create the session_replay table + indexes (matches SessionReplayManager.createTables),
/// then drop all but the newest MAX_SESSIONS sessions (cleanupOldSessions, which
/// Electron also runs at initialize time).
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
    cleanup_old_sessions(conn);
}

/// Keep only the newest MAX_SESSIONS sessions (by first-action time), deleting
/// every older session's rows — matches cleanupOldSessions.
fn cleanup_old_sessions(conn: &Connection) {
    let mut stmt = match conn.prepare(
        "SELECT DISTINCT session_id, MIN(timestamp) as start_time \
         FROM session_replay GROUP BY session_id ORDER BY start_time DESC",
    ) {
        Ok(s) => s,
        Err(_) => return,
    };
    let sessions: Vec<String> = match stmt.query_map([], |r| r.get::<_, String>(0)) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(_) => return,
    };
    for session_id in sessions.iter().skip(MAX_SESSIONS) {
        let _ = conn.execute(
            "DELETE FROM session_replay WHERE session_id = ?",
            params![session_id],
        );
    }
}

/// session-replay:recordAction — recordAction(actionType, app, beforeState,
/// afterState). Compresses both states, attributes the row to the live session,
/// and returns the new row id (-1 on failure, as the TS does).
fn record_action(conn: &Connection, action_type: &str, app: &str, before: &Value, after: &Value) -> Value {
    let inserted = conn.execute(
        "INSERT INTO session_replay (session_id, action_type, app, before_state, after_state, timestamp) \
         VALUES (?, ?, ?, ?, ?, ?)",
        params![
            live_session().id,
            action_type,
            app,
            compress_json(before),
            compress_json(after),
            current_millis()
        ],
    );
    match inserted {
        Ok(_) => json!(conn.last_insert_rowid()),
        Err(_) => json!(-1),
    }
}

/// One row -> the ReplayEntry shape (snake_case keys, column order matches the
/// `SELECT *` the TS issues against the table above). `before_state`/`after_state`
/// are nullable TEXT and are run back through decompressJson, as getSessionActions
/// does before returning rows.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let decompress = |v: Option<String>| match v {
        Some(s) => decompress_json(&s),
        None => Value::Null,
    };
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "session_id": row.get::<_, String>(1)?,
        "action_type": row.get::<_, String>(2)?,
        "app": row.get::<_, String>(3)?,
        "before_state": decompress(row.get::<_, Option<String>>(4)?),
        "after_state": decompress(row.get::<_, Option<String>>(5)?),
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
/// for one session ordered by timestamp ASC, with before_state/after_state
/// decompressed back to their original values.
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

        // recordAction(actionType, app, beforeState, afterState) -> the new row
        // id, attributed to the live per-process session (-1 on failure).
        "session-replay:recordAction" => {
            let action_type = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let app = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let before = args.get(2).cloned().unwrap_or(Value::Null);
            let after = args.get(3).cloned().unwrap_or(Value::Null);
            record_action(conn, action_type, app, &before, &after)
        }

        // getCurrentSession -> the live per-process { sessionId, startTime }.
        "session-replay:getCurrentSession" => {
            let live = live_session();
            json!({
                "sessionId": live.id,
                "startTime": live.start_time
            })
        }

        _ => Value::Null,
    }
}
