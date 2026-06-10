// =============================================================================
// DEX 6.0 — Scratchpad command layer (native updateContent / saveNow)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Native Tauri command implementations of the two scratchpad channels that the
//! pure-DB dispatcher in `scratchpad.rs` could not faithfully port:
//! `scratchpad:updateContent` and `scratchpad:saveNow`.
//!
//! Electron buffered edits in an in-memory `pendingContent` field that a 5s
//! autosave timer (or `saveNow`) flushed to disk. In the Tauri port there is no
//! renderer-side buffer to mirror and no per-session state in the stateless DB
//! dispatcher, so instead of degrading we persist the content DIRECTLY to the
//! shared `dex.db` `scratchpad` table on every call. This is simpler than the
//! Electron buffer/timer dance and functionally correct: the renderer already
//! calls `updateContent` as the user types and on blur, and `saveNow` carries
//! the latest content to flush. The DB-backed channels (getState,
//! updatePosition, clear, sendToNotes) remain in `scratchpad.rs`.

use crate::native_ops::{now_ms, with_conn};
use rusqlite::params;
use serde_json::{json, Value};

/// Persist `content` to the single pinned scratchpad row (id = 1), ensuring that
/// row exists first exactly as `scratchpad.rs::ensure_schema`/Electron's
/// `ensureRow` does (seed an empty row with default position/size when absent).
/// Returns the void-handler success shape used throughout `scratchpad.rs`:
/// `json!(true)`.
fn persist_content(app: &tauri::AppHandle, content: &str) -> Value {
    with_conn(app, |conn| {
        // ensureRow(): INSERT the pinned row only when absent, mirroring
        // scratchpad.rs::ensure_schema (same columns, defaults, and now_ms seed).
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
        let _ = conn.execute(
            "UPDATE scratchpad SET content = ?, updated_at = ? WHERE id = 1",
            params![content, now_ms()],
        );
        json!(true)
    })
}

/// Extract the content string from `args[0]`, defaulting to "" when missing or
/// not a string.
fn content_arg(args: &Value) -> String {
    args.get(0)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

/// Native dispatcher for the two scratchpad channels that persist content.
///
/// - `scratchpad:updateContent` — args[0] = content (string). Ensures the id = 1
///   row exists, then UPDATEs content + updated_at. Returns `json!(true)`,
///   matching the TS void handler (`return true`) and scratchpad.rs convention.
/// - `scratchpad:saveNow` — args may carry the latest content (string) in
///   args[0] or nothing. When present, persists it like updateContent; flushing
///   a non-existent buffer is otherwise a no-op. Returns `json!(true)`.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "scratchpad:updateContent" => persist_content(app, &content_arg(args)),
        "scratchpad:saveNow" => persist_content(app, &content_arg(args)),
        _ => Value::Null,
    }
}
