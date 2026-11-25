// =============================================================================
// DEX 6.0 — uki AI conversation store (native, persistent)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Persistent multi-conversation history for the uki AI chat app (uki-chat:*
//! channels). Under Electron the copilot conversation was an IN-MEMORY array
//! (src/main/uki/UkiCopilot.ts `private conversation: CopilotMessage[]`) lost on
//! every restart; this module upgrades it to durable SQLite storage in the
//! shared `dex.db`, supporting many named conversations with full history and
//! search. The AI processing itself (planning, model calls, actions) lives in
//! the renderer's `src/shared/uki` agent framework — this store only persists
//! what it produces, so it works identically under both shells.
//!
//! Message rows keep the renderer's CopilotMessage shape: indexed columns for
//! id/role/content/timestamp plus a `data` JSON column carrying the full
//! message object (attachments, codeBlocks, actions, confidence), returned
//! parsed so the renderer round-trips messages losslessly.

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

/// v4-style UUID via SQLite randomblob (same approach as journal.rs).
fn gen_uuid(conn: &Connection) -> String {
    let hex: String = conn
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .unwrap_or_else(|_| format!("{:032x}", now_ms() as u128));
    let mut b: Vec<char> = hex.chars().collect();
    while b.len() < 32 {
        b.push('0');
    }
    b[12] = '4';
    b[16] = ['8', '9', 'a', 'b'][(now_ms() as usize) & 3];
    let s: String = b.into_iter().collect();
    format!("{}-{}-{}-{}-{}", &s[0..8], &s[8..12], &s[12..16], &s[16..20], &s[20..32])
}

/// Create the conversation + message tables and indexes. Idempotent.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS uki_conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'New Conversation',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            message_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS uki_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            data TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_uki_msg_conv ON uki_messages(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_uki_conv_updated ON uki_conversations(updated_at);",
    );
}

/// One uki_conversations row -> JSON (snake_case, SELECT column order).
fn conv_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "title": row.get::<_, String>(1)?,
        "created_at": row.get::<_, i64>(2)?,
        "updated_at": row.get::<_, i64>(3)?,
        "message_count": row.get::<_, i64>(4)?,
    }))
}

const CONV_COLS: &str =
    "SELECT id, title, created_at, updated_at, message_count FROM uki_conversations";

/// One uki_messages row -> the CopilotMessage shape the renderer stores: the
/// `data` JSON is the source of truth when present (lossless round-trip), with
/// the indexed columns as the fallback for rows written without extras.
fn msg_to_json(row: &Row) -> rusqlite::Result<Value> {
    let id: String = row.get(0)?;
    let role: String = row.get(2)?;
    let content: String = row.get(3)?;
    let data: Option<String> = row.get(4)?;
    let created_at: i64 = row.get(5)?;
    if let Some(d) = data {
        if let Ok(mut v) = serde_json::from_str::<Value>(&d) {
            if v.is_object() {
                // Keep the canonical columns authoritative for identity/order.
                let obj = v.as_object_mut().unwrap();
                obj.insert("id".into(), json!(id));
                obj.insert("timestamp".into(), json!(created_at));
                return Ok(v);
            }
        }
    }
    Ok(json!({ "id": id, "role": role, "content": content, "timestamp": created_at }))
}

fn get_conversation(conn: &Connection, id: &str) -> Value {
    let sql = format!("{} WHERE id = ?", CONV_COLS);
    conn.query_row(&sql, params![id], conv_to_json)
        .unwrap_or(Value::Null)
}

/// uki-chat:createConversation(title?) -> the new conversation row.
fn create_conversation(conn: &Connection, args: &Value) -> Value {
    let title = args
        .get(0)
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("New Conversation")
        .to_string();
    let id = gen_uuid(conn);
    let now = now_ms();
    let inserted = conn.execute(
        "INSERT INTO uki_conversations (id, title, created_at, updated_at, message_count) VALUES (?, ?, ?, ?, 0)",
        params![id, title, now, now],
    );
    if inserted.is_err() {
        return Value::Null;
    }
    get_conversation(conn, &id)
}

/// History is unlimited: nothing is ever pruned, and a read can ask for all of it.
const READ_ALL: i64 = 1_000_000;

/// uki-chat:listConversations(limit?) -> rows newest-activity first.
fn list_conversations(conn: &Connection, args: &Value) -> Value {
    let limit = args.get(0).and_then(|v| v.as_i64()).unwrap_or(100).clamp(1, READ_ALL);
    let sql = format!("{} ORDER BY updated_at DESC LIMIT ?", CONV_COLS);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![limit], conv_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// uki-chat:getMessages(conversationId, limit?) -> the NEWEST `limit` messages,
/// oldest-first (chronological, ready to render). It used to return the first
/// `limit` rows, so a long conversation lost its newest messages on reload.
fn get_messages(conn: &Connection, args: &Value) -> Value {
    let conv_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let limit = args.get(1).and_then(|v| v.as_i64()).unwrap_or(READ_ALL).clamp(1, READ_ALL);
    let mut stmt = match conn.prepare(
        "SELECT id, conversation_id, role, content, data, created_at FROM (
           SELECT id, conversation_id, role, content, data, created_at, rowid AS rid FROM uki_messages
           WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
         ) ORDER BY created_at ASC, rid ASC",
    ) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![conv_id, limit], msg_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// uki-chat:appendMessage(conversationId, message) -> the stored message.
/// Bumps the conversation's updated_at/message_count and auto-titles a fresh
/// "New Conversation" from the first user message (first 48 chars).
fn append_message(conn: &Connection, args: &Value) -> Value {
    let conv_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let msg = args.get(1).cloned().unwrap_or(Value::Null);
    if conv_id.is_empty() || !msg.is_object() {
        return Value::Null;
    }
    if get_conversation(conn, &conv_id).is_null() {
        return Value::Null;
    }

    let id = msg
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| gen_uuid(conn));
    let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("user").to_string();
    let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let created_at = msg.get("timestamp").and_then(|v| v.as_i64()).unwrap_or_else(now_ms);
    let data = serde_json::to_string(&msg).unwrap_or_default();

    let inserted = conn.execute(
        "INSERT OR REPLACE INTO uki_messages (id, conversation_id, role, content, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![id, conv_id, role, content, data, created_at],
    );
    if inserted.is_err() {
        return Value::Null;
    }

    // Auto-title from the first user message of an untitled conversation.
    if role == "user" {
        let current: String = conn
            .query_row(
                "SELECT title FROM uki_conversations WHERE id = ?",
                params![conv_id],
                |r| r.get(0),
            )
            .unwrap_or_default();
        if current == "New Conversation" && !content.trim().is_empty() {
            let title: String = content.trim().chars().take(48).collect();
            let _ = conn.execute(
                "UPDATE uki_conversations SET title = ? WHERE id = ?",
                params![title, conv_id],
            );
        }
    }
    let _ = conn.execute(
        "UPDATE uki_conversations SET
            updated_at = ?,
            message_count = (SELECT COUNT(*) FROM uki_messages WHERE conversation_id = ?)
         WHERE id = ?",
        params![now_ms(), conv_id, conv_id],
    );

    conn.query_row(
        "SELECT id, conversation_id, role, content, data, created_at FROM uki_messages WHERE id = ?",
        params![id],
        msg_to_json,
    )
    .unwrap_or(Value::Null)
}

/// uki-chat:search(query, limit?) -> matching messages newest-first, each with
/// its conversation id + title attached so the app can jump to the spot.
fn search(conn: &Connection, args: &Value) -> Value {
    let q = args.get(0).and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if q.is_empty() {
        return json!([]);
    }
    let limit = args.get(1).and_then(|v| v.as_i64()).unwrap_or(50).clamp(1, 1000);
    let like = format!("%{}%", q);
    let mut stmt = match conn.prepare(
        "SELECT m.id, m.conversation_id, m.role, m.content, m.created_at, c.title
         FROM uki_messages m JOIN uki_conversations c ON c.id = m.conversation_id
         WHERE m.content LIKE ? ORDER BY m.created_at DESC LIMIT ?",
    ) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(
        rusqlite::params_from_iter(vec![SqlValue::Text(like), SqlValue::Integer(limit)]),
        |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "conversation_id": r.get::<_, String>(1)?,
                "role": r.get::<_, String>(2)?,
                "content": r.get::<_, String>(3)?,
                "timestamp": r.get::<_, i64>(4)?,
                "conversation_title": r.get::<_, String>(5)?,
            }))
        },
    ) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "uki-chat:createConversation" => create_conversation(conn, args),
        "uki-chat:listConversations" => list_conversations(conn, args),
        "uki-chat:getConversation" => get_conversation(conn, &s(0)),
        "uki-chat:getMessages" => get_messages(conn, args),
        "uki-chat:appendMessage" => append_message(conn, args),
        "uki-chat:renameConversation" => {
            let title = s(1);
            if title.trim().is_empty() {
                return json!(false);
            }
            let changed = conn
                .execute(
                    "UPDATE uki_conversations SET title = ?, updated_at = ? WHERE id = ?",
                    params![title.trim(), now_ms(), s(0)],
                )
                .unwrap_or(0);
            json!(changed > 0)
        }
        "uki-chat:deleteConversation" => {
            let id = s(0);
            let _ = conn.execute("DELETE FROM uki_messages WHERE conversation_id = ?", params![id]);
            let changed = conn
                .execute("DELETE FROM uki_conversations WHERE id = ?", params![id])
                .unwrap_or(0);
            json!(changed > 0)
        }
        "uki-chat:clearAll" => {
            let _ = conn.execute("DELETE FROM uki_messages", []);
            let _ = conn.execute("DELETE FROM uki_conversations", []);
            json!({ "success": true })
        }
        "uki-chat:search" => search(conn, args),
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        ensure_schema(&c);
        c
    }

    #[test]
    fn a_long_conversation_keeps_its_newest_messages() {
        let c = db();
        let conv = create_conversation(&c, &json!(["chat"]));
        let id = conv["id"].as_str().unwrap().to_string();
        for i in 0..5 {
            append_message(&c, &json!([id, { "id": format!("m{i}"), "role": "user", "content": format!("msg {i}"), "timestamp": 1000 + i }]));
        }
        let last2 = get_messages(&c, &json!([id, 2]));
        let got: Vec<&str> = last2.as_array().unwrap().iter().map(|m| m["content"].as_str().unwrap()).collect();
        assert_eq!(got, vec!["msg 3", "msg 4"]);
        // No limit = the whole history.
        assert_eq!(get_messages(&c, &json!([id])).as_array().unwrap().len(), 5);
    }

    #[test]
    fn lists_more_than_the_old_500_cap() {
        let c = db();
        for i in 0..600 {
            create_conversation(&c, &json!([format!("c{i}")]));
        }
        assert_eq!(list_conversations(&c, &json!([100000])).as_array().unwrap().len(), 600);
    }
}
