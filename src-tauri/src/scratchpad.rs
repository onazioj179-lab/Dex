// =============================================================================
// DEX 6.0 — Scratchpad (Tauri port of src/main/core/ScratchpadManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed scratchpad (scratchpad:* channels), reading/writing the shared
//! `dex.db` `scratchpad` table (a single pinned row, id = 1) with the identical
//! schema, queries, and return shapes as the Electron manager. Electron buffers
//! edits in an in-memory `pendingContent` field flushed by a 5s autosave timer;
//! `scratchpad:updateContent` only mutates that buffer and `scratchpad:saveNow`
//! flushes it. That buffer + timer are in-memory session state with no DB effect
//! of their own, which a stateless DB dispatcher cannot hold between calls, so
//! both degrade honestly (see the handler comments). Every DB-backed channel
//! (getState, updatePosition, clear, sendToNotes) is ported faithfully.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

/// Create the scratchpad table (matches DatabaseManager's CREATE TABLE) and seed
/// the single pinned row (id = 1) the way ScratchpadManager.ensureRow does.
/// Idempotent: the INSERT is a no-op once the row exists.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS scratchpad (
            id INTEGER PRIMARY KEY DEFAULT 1,
            content TEXT DEFAULT '',
            position_x INTEGER DEFAULT -1,
            position_y INTEGER DEFAULT -1,
            width INTEGER DEFAULT 400,
            height INTEGER DEFAULT 300,
            updated_at INTEGER NOT NULL
        );",
    );
    // ensureRow(): INSERT the pinned row only when absent. The TS uses Date.now()
    // for updated_at on seed; we mirror that with the current epoch milliseconds.
    let exists: bool = conn
        .query_row("SELECT 1 FROM scratchpad WHERE id = 1", [], |_| Ok(true))
        .unwrap_or(false);
    if !exists {
        let _ = conn.execute(
            "INSERT INTO scratchpad (id, content, position_x, position_y, width, height, updated_at)
             VALUES (1, ?, -1, -1, 400, 300, ?)",
            params!["", now_ms()],
        );
    }
}

/// Current time in epoch milliseconds (matches the TS `Date.now()` calls).
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// scratchpad:getState — getState(). Returns the ScratchpadState shape (camelCase,
/// re-mapped from the row columns). Falls back to the same defaults the TS returns
/// when the DB/row is absent (content '', positions -1, 400x300, updated_at now).
fn get_state(conn: &Connection) -> Value {
    let row = conn.query_row(
        "SELECT content, position_x, position_y, width, height, updated_at FROM scratchpad WHERE id = 1",
        [],
        |r| {
            Ok(json!({
                // row.content || '' -> null/absent content coalesces to ''.
                "content": r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                "positionX": r.get::<_, i64>(1)?,
                "positionY": r.get::<_, i64>(2)?,
                "width": r.get::<_, i64>(3)?,
                "height": r.get::<_, i64>(4)?,
                "updatedAt": r.get::<_, i64>(5)?,
            }))
        },
    );
    match row {
        Ok(v) => v,
        Err(_) => json!({
            "content": "",
            "positionX": -1,
            "positionY": -1,
            "width": 400,
            "height": 300,
            "updatedAt": now_ms(),
        }),
    }
}

/// scratchpad:updatePosition — updatePosition(x, y, width, height). Void in TS;
/// the IPC handler returns boolean true after the UPDATE.
fn update_position(conn: &Connection, args: &Value) -> Value {
    let i = |idx: usize| args.get(idx).and_then(|v| v.as_i64()).unwrap_or(0);
    let _ = conn.execute(
        "UPDATE scratchpad SET position_x = ?, position_y = ?, width = ?, height = ?, updated_at = ? WHERE id = 1",
        params![i(0), i(1), i(2), i(3), now_ms()],
    );
    json!(true)
}

/// scratchpad:clear — clearContent(). Void in TS; the IPC handler returns boolean
/// true. Clears the persisted content (the in-memory pendingContent reset has no
/// stateless equivalent and no DB effect, so it is intentionally omitted).
fn clear_content(conn: &Connection) -> Value {
    let _ = conn.execute(
        "UPDATE scratchpad SET content = ?, updated_at = ? WHERE id = 1",
        params!["", now_ms()],
    );
    json!(true)
}

/// scratchpad:sendToNotes — sendToNotes(). Reads current state; if the content is
/// empty/whitespace returns null, otherwise clears the content and returns
/// { content } (the original, pre-clear text), matching the TS exactly.
fn send_to_notes(conn: &Connection) -> Value {
    let state = get_state(conn);
    let content = state
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if content.trim().is_empty() {
        return Value::Null;
    }
    let _ = clear_content(conn);
    json!({ "content": content })
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "scratchpad:getState" => get_state(conn),
        "scratchpad:updatePosition" => update_position(conn, args),
        "scratchpad:clear" => clear_content(conn),
        "scratchpad:sendToNotes" => send_to_notes(conn),

        // Electron buffered content in memory and flushed it every 5 s; this port
        // answered with an error, so nothing typed in the scratchpad was ever saved.
        // The renderer debounces, so each call is written straight to the row.
        "scratchpad:updateContent" => {
            let text = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            match conn.execute(
                "UPDATE scratchpad SET content = ?, updated_at = ? WHERE id = 1",
                params![text, now_ms()],
            ) {
                Ok(_) => json!(true),
                Err(e) => json!({ "success": false, "error": e.to_string() }),
            }
        }
        // Content is already on disk after each updateContent.
        "scratchpad:saveNow" => json!(true),

        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typed_content_is_saved_and_read_back() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn);
        assert_eq!(dispatch(&conn, "scratchpad:updateContent", &json!(["hello"])), json!(true));
        assert_eq!(dispatch(&conn, "scratchpad:saveNow", &json!([])), json!(true));
        assert_eq!(dispatch(&conn, "scratchpad:getState", &json!([]))["content"], "hello");
    }
}
