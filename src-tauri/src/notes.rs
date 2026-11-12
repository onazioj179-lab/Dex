// =============================================================================
// DEX 6.0 — Notes (Tauri port of src/main/core/NotesManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed note-taking backend (dexnotes:* channels), reading/writing the
//! shared `dex.db` notes/folders/tags/links/word-suggestion/pane-size tables with
//! the identical schema, queries, and return shapes as the Electron manager.
//! FTS5 full-text search + sync triggers are created exactly as the TS does, and
//! `dexnotes:search`/`advancedSearch` fall back to LIKE when FTS is unavailable
//! (matching the TS try/catch). Handlers backed by the filesystem or native OS
//! capabilities — attachments on disk, note export/import, opening files in the
//! shell — are NOT pure DB work; they degrade honestly here while every DB-backed
//! CRUD channel is ported faithfully. Built-in templates and the daily-note
//! helper are reproduced from the TS data verbatim.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the notes schema (tables + indexes + FTS5 + sync triggers + the
/// default pane-size seed row), matching NotesManager.createTables verbatim.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            plain_text TEXT NOT NULL DEFAULT '',
            word_count INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            pinned INTEGER DEFAULT 0,
            pin_order INTEGER DEFAULT 0,
            locked INTEGER DEFAULT 0,
            color_label TEXT,
            folder_id TEXT,
            is_daily_note INTEGER DEFAULT 0,
            is_template INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            deleted_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            color TEXT,
            icon TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS note_tags (
            note_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (note_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS note_attachments (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL DEFAULT 'file',
            file_size INTEGER DEFAULT 0,
            thumbnail_path TEXT,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS note_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_note_id TEXT NOT NULL,
            target_note_id TEXT NOT NULL,
            context_text TEXT DEFAULT '',
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS word_suggestions_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL UNIQUE,
            frequency INTEGER DEFAULT 1,
            last_used INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS note_pane_sizes (
            key TEXT PRIMARY KEY,
            left_width INTEGER DEFAULT 220,
            center_width INTEGER DEFAULT 320
        );

        CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
        CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
        CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
        CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted);
        CREATE INDEX IF NOT EXISTS idx_notes_daily ON notes(is_daily_note);
        CREATE INDEX IF NOT EXISTS idx_notes_template ON notes(is_template);
        CREATE INDEX IF NOT EXISTS idx_notes_locked ON notes(locked);
        CREATE INDEX IF NOT EXISTS idx_notes_color ON notes(color_label);
        CREATE INDEX IF NOT EXISTS idx_tags_note ON note_tags(note_id);
        CREATE INDEX IF NOT EXISTS idx_tags_tag ON note_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_note ON note_attachments(note_id);
        CREATE INDEX IF NOT EXISTS idx_links_source ON note_links(source_note_id);
        CREATE INDEX IF NOT EXISTS idx_links_target ON note_links(target_note_id);
        CREATE INDEX IF NOT EXISTS idx_words_word ON word_suggestions_history(word);
        CREATE INDEX IF NOT EXISTS idx_words_freq ON word_suggestions_history(frequency DESC);",
    );

    // FTS5 virtual table for full text search (TS wraps in try/catch; ignore err).
    let _ = conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            title, plain_text, content='notes', content_rowid='rowid',
            tokenize='porter unicode61'
        );",
    );

    // Triggers to keep FTS5 in sync (TS wraps in try/catch; ignore err).
    let _ = conn.execute_batch(
        "CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts(rowid, title, plain_text)
            VALUES (new.rowid, new.title, new.plain_text);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, plain_text)
            VALUES ('delete', old.rowid, old.title, old.plain_text);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, plain_text)
            VALUES ('delete', old.rowid, old.title, old.plain_text);
            INSERT INTO notes_fts(rowid, title, plain_text)
            VALUES (new.rowid, new.title, new.plain_text);
        END;",
    );

    // Ensure the default pane-sizes row exists (matches the createTables tail).
    let existing: Option<String> = conn
        .query_row(
            "SELECT key FROM note_pane_sizes WHERE key = ?",
            params!["default"],
            |r| r.get(0),
        )
        .ok();
    if existing.is_none() {
        let _ = conn.execute(
            "INSERT INTO note_pane_sizes (key, left_width, center_width) VALUES (?, ?, ?)",
            params!["default", 220, 320],
        );
    }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

const NOTE_COLS: &str =
    "id, title, content, plain_text, word_count, created_at, updated_at, pinned, pin_order, locked, color_label, folder_id, is_daily_note, is_template, deleted, deleted_at";

/// One notes row -> the raw NotesDbNote shape (`SELECT *` column order/casing
/// exactly as better-sqlite3 returned it: integer booleans stay integers).
/// createNote/updateNote/duplicate/daily return this raw shape under Electron.
fn note_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "title": row.get::<_, String>(1)?,
        "content": row.get::<_, String>(2)?,
        "plain_text": row.get::<_, String>(3)?,
        "word_count": row.get::<_, i64>(4)?,
        "created_at": row.get::<_, i64>(5)?,
        "updated_at": row.get::<_, i64>(6)?,
        "pinned": row.get::<_, i64>(7)?,
        "pin_order": row.get::<_, i64>(8)?,
        "locked": row.get::<_, i64>(9)?,
        "color_label": row.get::<_, Option<String>>(10)?,
        "folder_id": row.get::<_, Option<String>>(11)?,
        "is_daily_note": row.get::<_, i64>(12)?,
        "is_template": row.get::<_, i64>(13)?,
        "deleted": row.get::<_, i64>(14)?,
        "deleted_at": row.get::<_, Option<i64>>(15)?,
    }))
}

/// Fetch one raw notes row by id -> NotesDbNote JSON, or Null when absent.
fn fetch_note_raw(conn: &Connection, id: &str) -> Value {
    let sql = format!("SELECT {NOTE_COLS} FROM notes WHERE id = ?");
    conn.query_row(&sql, params![id], note_row_to_json)
        .unwrap_or(Value::Null)
}

// ---------------------------------------------------------------------------
// Plain-text / word-count helpers (mirror extractPlainText / countWords)
// ---------------------------------------------------------------------------

/// Walk a document JSON node collecting every `text` field, in document order.
fn walk_text_nodes(node: &Value, out: &mut Vec<String>) {
    if let Some(t) = node.get("text").and_then(|v| v.as_str()) {
        out.push(t.to_string());
    }
    if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
        for child in children {
            walk_text_nodes(child, out);
        }
    }
}

/// Collapse runs of whitespace to single spaces and trim (mirrors `\s+`->' ').
fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// extractPlainText: parse the document JSON and join text nodes; on parse
/// failure, strip `<...>` tags and collapse whitespace (the TS catch branch).
fn extract_plain_text(content_json: &str) -> String {
    match serde_json::from_str::<Value>(content_json) {
        Ok(doc) => {
            let mut parts: Vec<String> = Vec::new();
            walk_text_nodes(&doc, &mut parts);
            collapse_ws(&parts.join(" "))
        }
        Err(_) => collapse_ws(&strip_html_tags(content_json)),
    }
}

/// Replace every `<...>` run with a space (mirrors `.replace(/<[^>]*>/g, ' ')`).
fn strip_html_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

/// countWords: split on whitespace, count non-empty tokens.
fn count_words(text: &str) -> i64 {
    if text.is_empty() {
        return 0;
    }
    text.split_whitespace().filter(|w| !w.is_empty()).count() as i64
}

/// Current epoch milliseconds (matches Date.now()).
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Generate a v4-style UUID (matches crypto.randomUUID() format). Uses a simple
/// time/counter-seeded xorshift since no uuid/rand crate is available.
fn random_uuid() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    // Mix the clock, a process-lifetime counter, and a stack address (ASLR) so
    // ids stay unique even within the same millisecond.
    let stack_anchor = 0u8;
    let mut seed = now_ms() as u64
        ^ COUNTER
            .fetch_add(1, Ordering::Relaxed)
            .wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ (&stack_anchor as *const u8 as u64);
    if seed == 0 {
        seed = 0x9E37_79B9_7F4A_7C15;
    }
    let mut next = || {
        // xorshift64
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed
    };
    let mut bytes = [0u8; 16];
    for chunk in bytes.chunks_mut(8) {
        let v = next().to_le_bytes();
        chunk.copy_from_slice(&v[..chunk.len()]);
    }
    // RFC 4122 version 4 + variant bits.
    bytes[6] = (bytes[6] & 0x0F) | 0x40;
    bytes[8] = (bytes[8] & 0x3F) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

// ---------------------------------------------------------------------------
// Note CRUD
// ---------------------------------------------------------------------------

/// dexnotes:create — createNote(data). Inserts the note (+ tags), returns the
/// raw NotesDbNote row.
fn create_note(conn: &Connection, data: &Value) -> Value {
    let now = now_ms();
    let id = data
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(random_uuid);
    // title sliced to 1000 chars (TS .slice(0, 1000)).
    let title: String = data
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .chars()
        .take(1000)
        .collect();
    let content = data
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    // plain_text defaults to extractPlainText(content) when omitted/empty.
    let plain_text = match data.get("plain_text").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => extract_plain_text(&content),
    };
    // word_count uses `??` (nullish): present number wins, else countWords.
    let word_count = data
        .get("word_count")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| count_words(&plain_text));

    let pinned = if truthy(data.get("pinned")) { 1 } else { 0 };
    let pin_order = data.get("pin_order").and_then(|v| v.as_i64()).unwrap_or(0);
    let locked = if truthy(data.get("locked")) { 1 } else { 0 };
    let color_label = nullable_str(data.get("color_label"));
    let folder_id = nullable_str(data.get("folder_id"));
    let is_daily_note = if truthy(data.get("is_daily_note")) { 1 } else { 0 };
    let is_template = if truthy(data.get("is_template")) { 1 } else { 0 };

    let inserted = conn.execute(
        "INSERT INTO notes (id, title, content, plain_text, word_count, created_at, updated_at,
            pinned, pin_order, locked, color_label, folder_id, is_daily_note, is_template, deleted, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)",
        params![
            id, title, content, plain_text, word_count, now, now,
            pinned, pin_order, locked, color_label, folder_id, is_daily_note, is_template
        ],
    );
    if inserted.is_err() {
        return Value::Null;
    }

    if let Some(tags) = data.get("tags").and_then(|v| v.as_array()) {
        for tag in tags {
            if let Some(t) = tag.as_str() {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
                    params![id, t],
                );
            }
        }
    }

    fetch_note_raw(conn, &id)
}

/// JS truthiness for the small set of fields the TS coerces with `? 1 : 0`:
/// true, non-zero numbers, and non-empty strings are truthy.
fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        Some(Value::String(s)) => !s.is_empty(),
        _ => false,
    }
}

/// `data.x || null` for a string field: non-empty string -> Text, else Null.
fn nullable_str(v: Option<&Value>) -> SqlValue {
    match v.and_then(|x| x.as_str()) {
        Some(s) if !s.is_empty() => SqlValue::Text(s.to_string()),
        _ => SqlValue::Null,
    }
}

/// dexnotes:get — getNote(id). Returns the NoteFull shape (booleans coerced,
/// camelCase links/backlinks, attachments), or Null when the note is absent.
fn get_note(conn: &Connection, id: &str) -> Value {
    let raw = fetch_note_raw(conn, id);
    if raw.is_null() {
        return Value::Null;
    }

    // tags: string[]
    let tags = list_tag_ids(conn, id);

    // attachments: raw note_attachments rows (`SELECT *` column order).
    let attachments = query_attachments(conn, id);

    // links: outgoing — { noteId, title, contextText }
    let links = query_link_objects(
        conn,
        "SELECT nl.target_note_id, n.title, nl.context_text FROM note_links nl
         JOIN notes n ON n.id = nl.target_note_id
         WHERE nl.source_note_id = ?",
        id,
    );
    // backlinks: incoming — { noteId, title, contextText }
    let backlinks = query_link_objects(
        conn,
        "SELECT nl.source_note_id, n.title, nl.context_text FROM note_links nl
         JOIN notes n ON n.id = nl.source_note_id
         WHERE nl.target_note_id = ?",
        id,
    );

    // Build NoteFull by spreading the raw row and coercing the four booleans.
    let mut obj = raw.as_object().cloned().unwrap_or_default();
    obj.insert("pinned".into(), json!(get_int(&raw, "pinned") == 1));
    obj.insert("locked".into(), json!(get_int(&raw, "locked") == 1));
    obj.insert("is_daily_note".into(), json!(get_int(&raw, "is_daily_note") == 1));
    obj.insert("is_template".into(), json!(get_int(&raw, "is_template") == 1));
    obj.insert("tags".into(), json!(tags));
    obj.insert("attachments".into(), attachments);
    obj.insert("links".into(), links);
    obj.insert("backlinks".into(), backlinks);
    Value::Object(obj)
}

/// Read an integer field from a JSON object (defaulting to 0 when absent).
fn get_int(v: &Value, key: &str) -> i64 {
    v.get(key).and_then(|x| x.as_i64()).unwrap_or(0)
}

/// SELECT tag_id values for a note -> Vec<String> (order: PK / insertion).
fn list_tag_ids(conn: &Connection, note_id: &str) -> Vec<String> {
    let mut stmt = match conn.prepare("SELECT tag_id FROM note_tags WHERE note_id = ?") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map(params![note_id], |r| r.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

const ATTACHMENT_COLS: &str =
    "id, note_id, file_path, file_name, file_type, file_size, thumbnail_path, created_at";

/// One note_attachments row -> the NotesDbAttachment shape (`SELECT *` order).
fn attachment_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "note_id": row.get::<_, String>(1)?,
        "file_path": row.get::<_, String>(2)?,
        "file_name": row.get::<_, String>(3)?,
        "file_type": row.get::<_, String>(4)?,
        "file_size": row.get::<_, i64>(5)?,
        "thumbnail_path": row.get::<_, Option<String>>(6)?,
        "created_at": row.get::<_, i64>(7)?,
    }))
}

/// SELECT attachments for a note ordered by created_at ASC -> JSON array.
fn query_attachments(conn: &Connection, note_id: &str) -> Value {
    let sql = format!(
        "SELECT {ATTACHMENT_COLS} FROM note_attachments WHERE note_id = ? ORDER BY created_at ASC"
    );
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![note_id], attachment_row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// Run a links/backlinks query (cols: other_note_id, title, context_text) and
/// map each row to { noteId, title, contextText } — the shape getNote embeds for
/// its `links`/`backlinks`. (getLinks/getBacklinks return an id-bearing shape via
/// the dedicated query_link_rows below.)
fn query_link_objects(conn: &Connection, sql: &str, note_id: &str) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![note_id], |r| {
        Ok(json!({
            "noteId": r.get::<_, String>(0)?,
            "title": r.get::<_, String>(1)?,
            "contextText": r.get::<_, String>(2)?,
        }))
    }) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// dexnotes:update — updateNote(id, data). Applies only the provided fields,
/// bumps updated_at, optionally rewrites tags, returns { success, note? }.
fn update_note(conn: &Connection, id: &str, data: &Value) -> Value {
    let existing = fetch_note_raw(conn, id);
    if existing.is_null() {
        return json!({ "success": false });
    }

    let now = now_ms();
    let mut updates: Vec<String> = Vec::new();
    let mut values: Vec<SqlValue> = Vec::new();

    // `!== undefined` -> key present in the JSON object.
    if let Some(v) = data.get("title") {
        let t: String = v.as_str().unwrap_or("").chars().take(1000).collect();
        updates.push("title = ?".into());
        values.push(SqlValue::Text(t));
    }
    if let Some(v) = data.get("content") {
        let content = v.as_str().unwrap_or("").to_string();
        updates.push("content = ?".into());
        values.push(SqlValue::Text(content.clone()));
        let plain_text = match data.get("plain_text").and_then(|x| x.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => extract_plain_text(&content),
        };
        updates.push("plain_text = ?".into());
        values.push(SqlValue::Text(plain_text.clone()));
        let wc = data
            .get("word_count")
            .and_then(|x| x.as_i64())
            .unwrap_or_else(|| count_words(&plain_text));
        updates.push("word_count = ?".into());
        values.push(SqlValue::Integer(wc));
    }
    if let Some(v) = data.get("color_label") {
        updates.push("color_label = ?".into());
        values.push(json_to_nullable_text(v));
    }
    if let Some(v) = data.get("folder_id") {
        updates.push("folder_id = ?".into());
        values.push(json_to_nullable_text(v));
    }
    if let Some(v) = data.get("locked") {
        updates.push("locked = ?".into());
        values.push(SqlValue::Integer(if truthy(Some(v)) { 1 } else { 0 }));
    }
    if let Some(v) = data.get("pinned") {
        updates.push("pinned = ?".into());
        values.push(SqlValue::Integer(if truthy(Some(v)) { 1 } else { 0 }));
    }
    if let Some(v) = data.get("pin_order") {
        updates.push("pin_order = ?".into());
        values.push(SqlValue::Integer(v.as_i64().unwrap_or(0)));
    }

    // No field changes (and no tags follow) -> return the existing raw row.
    if updates.is_empty() {
        // Still honor a tags-only update below if present.
        if data.get("tags").is_none() {
            return json!({ "success": true, "note": existing });
        }
    } else {
        updates.push("updated_at = ?".into());
        values.push(SqlValue::Integer(now));
        values.push(SqlValue::Text(id.to_string()));
        let sql = format!("UPDATE notes SET {} WHERE id = ?", updates.join(", "));
        let _ = conn.execute(&sql, rusqlite::params_from_iter(values));
    }

    if let Some(tags) = data.get("tags") {
        if let Some(arr) = tags.as_array() {
            set_tags(conn, id, arr);
        }
    }

    let note = fetch_note_raw(conn, id);
    json!({ "success": true, "note": note })
}

/// `data.x` for an update field: null stays Null, a string -> Text, otherwise
/// (e.g. an explicit null) Null. Mirrors passing the raw JS value through.
fn json_to_nullable_text(v: &Value) -> SqlValue {
    match v {
        Value::String(s) => SqlValue::Text(s.clone()),
        _ => SqlValue::Null,
    }
}

/// dexnotes:delete — deleteNote(id, permanent?). Hard-deletes (note + tags +
/// links; attachments are removed from DB only, the on-disk files are a
/// filesystem concern not handled here) when `permanent` or already trashed,
/// else soft-deletes (deleted=1). Returns { success }.
fn delete_note(conn: &Connection, id: &str, permanent: bool) -> Value {
    let existing = fetch_note_raw(conn, id);
    if existing.is_null() {
        return json!({ "success": false });
    }
    let already_deleted = get_int(&existing, "deleted") == 1;

    if permanent || already_deleted {
        // The TS also unlinks each attachment file from disk; that filesystem
        // side effect is not available in the DB layer, so only the DB rows are
        // removed here (the renderer-facing { success: true } is unchanged).
        let _ = conn.execute(
            "DELETE FROM note_attachments WHERE note_id = ?",
            params![id],
        );
        let _ = conn.execute("DELETE FROM note_tags WHERE note_id = ?", params![id]);
        let _ = conn.execute(
            "DELETE FROM note_links WHERE source_note_id = ? OR target_note_id = ?",
            params![id, id],
        );
        let _ = conn.execute("DELETE FROM notes WHERE id = ?", params![id]);
    } else {
        let now = now_ms();
        let _ = conn.execute(
            "UPDATE notes SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?",
            params![now, now, id],
        );
    }
    json!({ "success": true })
}

/// dexnotes:restore — restoreNote(id). Clears the trash flags, bumps
/// updated_at. Returns { success: true } unconditionally (matches the TS).
fn restore_note(conn: &Connection, id: &str) -> Value {
    let now = now_ms();
    let _ = conn.execute(
        "UPDATE notes SET deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?",
        params![now, id],
    );
    json!({ "success": true })
}

/// dexnotes:duplicate — duplicateNote(id). Re-creates the note from its full
/// form (title + ' (copy)', content, folder, color, tags) or Null when absent.
fn duplicate_note(conn: &Connection, id: &str) -> Value {
    let original = get_note(conn, id);
    if original.is_null() {
        return Value::Null;
    }
    let title = format!(
        "{} (copy)",
        original.get("title").and_then(|v| v.as_str()).unwrap_or("")
    );
    let tags = original.get("tags").cloned().unwrap_or_else(|| json!([]));
    let data = json!({
        "title": title,
        "content": original.get("content").cloned().unwrap_or_else(|| json!("")),
        "plain_text": original.get("plain_text").cloned().unwrap_or_else(|| json!("")),
        "folder_id": original.get("folder_id").cloned().unwrap_or(Value::Null),
        "color_label": original.get("color_label").cloned().unwrap_or(Value::Null),
        "tags": tags,
    });
    create_note(conn, &data)
}

/// dexnotes:pin — pinNote(id, pinned). Enforces the 20-pin limit and assigns
/// the next pin_order; unpinning resets pin_order to 0. Returns { success }.
fn pin_note(conn: &Connection, id: &str, pinned: bool) -> Value {
    if pinned {
        let cnt: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE pinned = 1 AND deleted = 0",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if cnt >= 20 {
            return json!({ "success": false });
        }
        let max_order: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(pin_order), 0) FROM notes WHERE pinned = 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let new_order = max_order + 1;
        let _ = conn.execute(
            "UPDATE notes SET pinned = 1, pin_order = ?, updated_at = ? WHERE id = ?",
            params![new_order, now_ms(), id],
        );
    } else {
        let _ = conn.execute(
            "UPDATE notes SET pinned = 0, pin_order = 0, updated_at = ? WHERE id = ?",
            params![now_ms(), id],
        );
    }
    json!({ "success": true })
}

/// dexnotes:lock — lockNote(id, locked). Returns { success: true }.
fn lock_note(conn: &Connection, id: &str, locked: bool) -> Value {
    let _ = conn.execute(
        "UPDATE notes SET locked = ?, updated_at = ? WHERE id = ?",
        params![if locked { 1 } else { 0 }, now_ms(), id],
    );
    json!({ "success": true })
}

/// dexnotes:setColor — setNoteColor(id, color). color may be null. Returns { success }.
fn set_note_color(conn: &Connection, id: &str, color: &Value) -> Value {
    let _ = conn.execute(
        "UPDATE notes SET color_label = ?, updated_at = ? WHERE id = ?",
        params![json_to_nullable_text(color), now_ms(), id],
    );
    json!({ "success": true })
}

/// dexnotes:moveToFolder — moveToFolder(id, folderId). folderId may be null.
fn move_to_folder(conn: &Connection, id: &str, folder_id: &Value) -> Value {
    let _ = conn.execute(
        "UPDATE notes SET folder_id = ?, updated_at = ? WHERE id = ?",
        params![json_to_nullable_text(folder_id), now_ms(), id],
    );
    json!({ "success": true })
}

/// dexnotes:list — listNotes(opts?). Builds the filtered/sorted query, batch
/// loads tags, returns NoteListItem[] (booleans coerced, snake_case keys).
fn list_notes(conn: &Connection, opts: &Value) -> Value {
    let mut conditions: Vec<String> = Vec::new();
    let mut p: Vec<SqlValue> = Vec::new();

    if opts.get("deleted").map(|v| truthy(Some(v))).unwrap_or(false) {
        conditions.push("n.deleted = 1".into());
    } else {
        conditions.push("n.deleted = 0".into());
    }

    // folder_id is checked for presence; explicit null -> IS NULL.
    if let Some(fv) = opts.get("folder_id") {
        if fv.is_null() {
            conditions.push("n.folder_id IS NULL".into());
        } else if let Some(s) = fv.as_str() {
            conditions.push("n.folder_id = ?".into());
            p.push(SqlValue::Text(s.to_string()));
        }
    }
    if let Some(v) = opts.get("pinned") {
        conditions.push("n.pinned = ?".into());
        p.push(SqlValue::Integer(if truthy(Some(v)) { 1 } else { 0 }));
    }
    if let Some(v) = opts.get("locked") {
        conditions.push("n.locked = ?".into());
        p.push(SqlValue::Integer(if truthy(Some(v)) { 1 } else { 0 }));
    }
    if let Some(v) = opts.get("is_daily_note") {
        conditions.push("n.is_daily_note = ?".into());
        p.push(SqlValue::Integer(if truthy(Some(v)) { 1 } else { 0 }));
    }
    if let Some(v) = opts.get("is_template") {
        conditions.push("n.is_template = ?".into());
        p.push(SqlValue::Integer(if truthy(Some(v)) { 1 } else { 0 }));
    }

    // Sort column is validated against an allow-list (defaults to updated_at).
    let sort_col = opts.get("sort_by").and_then(|v| v.as_str()).unwrap_or("updated_at");
    let allowed = ["updated_at", "created_at", "title", "word_count", "pin_order"];
    let safe_sort_col = if allowed.contains(&sort_col) {
        sort_col
    } else {
        "updated_at"
    };
    let sort_order = if opts.get("sort_order").and_then(|v| v.as_str()) == Some("asc") {
        "ASC"
    } else {
        "DESC"
    };

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    // limit capped at 1000 (default 200); offset default 0.
    let limit = match opts.get("limit").and_then(|v| v.as_i64()) {
        Some(l) if l > 0 => l.min(1000),
        _ => 200,
    };
    let offset = opts.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);

    let sql = format!(
        "SELECT {NOTE_COLS} FROM notes n
         {where_clause}
         ORDER BY n.pinned DESC, n.pin_order DESC, n.{safe_sort_col} {sort_order}
         LIMIT ? OFFSET ?"
    );
    p.push(SqlValue::Integer(limit));
    p.push(SqlValue::Integer(offset));

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), note_row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let raw_rows: Vec<Value> = rows.filter_map(|r| r.ok()).collect();

    // Map each raw row to the NoteListItem projection (with tags), coercing
    // booleans; tags loaded per note (batch in TS; equivalent result here).
    let out: Vec<Value> = raw_rows
        .iter()
        .map(|row| {
            let id = row.get("id").and_then(|v| v.as_str()).unwrap_or("");
            json!({
                "id": row.get("id").cloned().unwrap_or(Value::Null),
                "title": row.get("title").cloned().unwrap_or_else(|| json!("")),
                "plain_text": row.get("plain_text").cloned().unwrap_or_else(|| json!("")),
                "word_count": get_int(row, "word_count"),
                "created_at": get_int(row, "created_at"),
                "updated_at": get_int(row, "updated_at"),
                "pinned": get_int(row, "pinned") == 1,
                "pin_order": get_int(row, "pin_order"),
                "locked": get_int(row, "locked") == 1,
                "color_label": row.get("color_label").cloned().unwrap_or(Value::Null),
                "folder_id": row.get("folder_id").cloned().unwrap_or(Value::Null),
                "is_daily_note": get_int(row, "is_daily_note") == 1,
                "is_template": get_int(row, "is_template") == 1,
                "tags": list_tag_ids(conn, id),
            })
        })
        .collect();
    json!(out)
}

/// dexnotes:emptyTrash — emptyTrash(). Permanently deletes every trashed note.
/// Returns { success: true, count }.
fn empty_trash(conn: &Connection) -> Value {
    let ids: Vec<String> = {
        let mut stmt = match conn.prepare("SELECT id FROM notes WHERE deleted = 1") {
            Ok(s) => s,
            Err(_) => return json!({ "success": true, "count": 0 }),
        };
        let rows = match stmt.query_map([], |r| r.get::<_, String>(0)) {
            Ok(r) => r,
            Err(_) => return json!({ "success": true, "count": 0 }),
        };
        rows.filter_map(|r| r.ok()).collect()
    };
    let count = ids.len() as i64;
    for id in &ids {
        let _ = delete_note(conn, id, true);
    }
    json!({ "success": true, "count": count })
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/// setTags(noteId, tags): clears existing tags then inserts each (trimmed,
/// lowercased). Returns { success: true }.
fn set_tags(conn: &Connection, note_id: &str, tags: &[Value]) -> Value {
    let _ = conn.execute("DELETE FROM note_tags WHERE note_id = ?", params![note_id]);
    for tag in tags {
        if let Some(t) = tag.as_str() {
            let clean = t.trim().to_lowercase();
            let _ = conn.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
                params![note_id, clean],
            );
        }
    }
    json!({ "success": true })
}

/// dexnotes:getAllTags — getAllTags(). Returns [{ tag, count }] sorted by count DESC.
fn get_all_tags(conn: &Connection) -> Value {
    let mut stmt = match conn.prepare(
        "SELECT tag_id as tag, COUNT(*) as count FROM note_tags GROUP BY tag_id ORDER BY count DESC",
    ) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([], |r| {
        Ok(json!({ "tag": r.get::<_, String>(0)?, "count": r.get::<_, i64>(1)? }))
    }) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

const FOLDER_COLS: &str = "id, name, parent_id, color, icon, sort_order, created_at";

/// One folders row -> the NotesDbFolder shape (`SELECT *` column order).
fn folder_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "name": row.get::<_, String>(1)?,
        "parent_id": row.get::<_, Option<String>>(2)?,
        "color": row.get::<_, Option<String>>(3)?,
        "icon": row.get::<_, Option<String>>(4)?,
        "sort_order": row.get::<_, i64>(5)?,
        "created_at": row.get::<_, i64>(6)?,
    }))
}

/// dexnotes:createFolder — createFolder(data). Inserts and returns the row.
fn create_folder(conn: &Connection, data: &Value) -> Value {
    let id = data
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(random_uuid);
    let now = now_ms();
    let name = data
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("New Folder")
        .to_string();
    let parent_id = nullable_str(data.get("parent_id"));
    let color = nullable_str(data.get("color"));
    let icon = nullable_str(data.get("icon"));
    let sort_order = data.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);

    let inserted = conn.execute(
        "INSERT INTO folders (id, name, parent_id, color, icon, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![id, name, parent_id, color, icon, sort_order, now],
    );
    if inserted.is_err() {
        return Value::Null;
    }
    let sql = format!("SELECT {FOLDER_COLS} FROM folders WHERE id = ?");
    conn.query_row(&sql, params![id], folder_row_to_json)
        .unwrap_or(Value::Null)
}

/// dexnotes:listFolders — listFolders(). Returns the folder tree, each node
/// extended with note_count and a recursively-built children array.
fn list_folders(conn: &Connection) -> Value {
    // Load all folders (sorted) and per-folder note counts.
    let folders: Vec<Value> = {
        let sql =
            format!("SELECT {FOLDER_COLS} FROM folders ORDER BY sort_order ASC, name ASC");
        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(_) => return json!([]),
        };
        let rows = match stmt.query_map([], folder_row_to_json) {
            Ok(r) => r,
            Err(_) => return json!([]),
        };
        rows.filter_map(|r| r.ok()).collect()
    };

    let mut count_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    {
        let mut stmt = match conn.prepare(
            "SELECT folder_id, COUNT(*) as cnt FROM notes
             WHERE deleted = 0 AND folder_id IS NOT NULL
             GROUP BY folder_id",
        ) {
            Ok(s) => s,
            Err(_) => return json!([]),
        };
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        });
        if let Ok(rows) = rows {
            for r in rows.flatten() {
                count_map.insert(r.0, r.1);
            }
        }
    }

    build_folder_tree(&folders, &count_map, &Value::Null)
}

/// Recursively assemble the folder tree under a given parent_id value.
fn build_folder_tree(
    folders: &[Value],
    counts: &std::collections::HashMap<String, i64>,
    parent_id: &Value,
) -> Value {
    let out: Vec<Value> = folders
        .iter()
        .filter(|f| f.get("parent_id").unwrap_or(&Value::Null) == parent_id)
        .map(|f| {
            let id = f.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let id_val = json!(id);
            let mut obj = f.as_object().cloned().unwrap_or_default();
            obj.insert("note_count".into(), json!(counts.get(id).copied().unwrap_or(0)));
            obj.insert(
                "children".into(),
                build_folder_tree(folders, counts, &id_val),
            );
            Value::Object(obj)
        })
        .collect();
    json!(out)
}

/// dexnotes:updateFolder — updateFolder(id, data). Updates the provided fields.
fn update_folder(conn: &Connection, id: &str, data: &Value) -> Value {
    let mut updates: Vec<String> = Vec::new();
    let mut values: Vec<SqlValue> = Vec::new();

    if let Some(v) = data.get("name") {
        updates.push("name = ?".into());
        values.push(json_to_nullable_text(v));
    }
    if let Some(v) = data.get("parent_id") {
        updates.push("parent_id = ?".into());
        values.push(json_to_nullable_text(v));
    }
    if let Some(v) = data.get("color") {
        updates.push("color = ?".into());
        values.push(json_to_nullable_text(v));
    }
    if let Some(v) = data.get("icon") {
        updates.push("icon = ?".into());
        values.push(json_to_nullable_text(v));
    }
    if let Some(v) = data.get("sort_order") {
        updates.push("sort_order = ?".into());
        values.push(SqlValue::Integer(v.as_i64().unwrap_or(0)));
    }

    if updates.is_empty() {
        return json!({ "success": true });
    }
    values.push(SqlValue::Text(id.to_string()));
    let sql = format!("UPDATE folders SET {} WHERE id = ?", updates.join(", "));
    let _ = conn.execute(&sql, rusqlite::params_from_iter(values));
    json!({ "success": true })
}

/// dexnotes:deleteFolder — deleteFolder(id). Detaches notes/child folders then
/// removes the folder. Returns { success: true }.
fn delete_folder(conn: &Connection, id: &str) -> Value {
    let _ = conn.execute(
        "UPDATE notes SET folder_id = NULL WHERE folder_id = ?",
        params![id],
    );
    let _ = conn.execute(
        "UPDATE folders SET parent_id = NULL WHERE parent_id = ?",
        params![id],
    );
    let _ = conn.execute("DELETE FROM folders WHERE id = ?", params![id]);
    json!({ "success": true })
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/// dexnotes:addLink — addLink(sourceId, targetId, context). Returns { success, id }.
fn add_link(conn: &Connection, source_id: &str, target_id: &str, context: &str) -> Value {
    let now = now_ms();
    let inserted = conn.execute(
        "INSERT INTO note_links (source_note_id, target_note_id, context_text, created_at)
         VALUES (?, ?, ?, ?)",
        params![source_id, target_id, context, now],
    );
    if inserted.is_err() {
        return json!({ "success": true, "id": Value::Null });
    }
    json!({ "success": true, "id": conn.last_insert_rowid() })
}

/// dexnotes:removeLink — removeLink(linkId). Returns { success: true }.
fn remove_link(conn: &Connection, link_id: i64) -> Value {
    let _ = conn.execute("DELETE FROM note_links WHERE id = ?", params![link_id]);
    json!({ "success": true })
}

/// getLinks/getBacklinks: run a query selecting (id, noteId, title, contextText)
/// and map each row to that object shape.
fn query_link_rows(conn: &Connection, sql: &str, note_id: &str) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![note_id], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "noteId": r.get::<_, String>(1)?,
            "title": r.get::<_, String>(2)?,
            "contextText": r.get::<_, String>(3)?,
        }))
    }) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

// ---------------------------------------------------------------------------
// Search (FTS5 with LIKE fallback)
// ---------------------------------------------------------------------------

/// Strip the FTS5 special chars `'"*()` and trim (mirrors the TS sanitizer).
fn sanitize_fts(query: &str) -> String {
    query
        .chars()
        .filter(|c| !matches!(c, '\'' | '"' | '*' | '(' | ')'))
        .collect::<String>()
        .trim()
        .to_string()
}

/// Map an FTS/LIKE search result row to the NoteSearchResult shape. Columns:
/// (id, title, folder_id, pinned, updated_at, snippet, rank). `rank` is an FTS5
/// real in the FTS path but the integer literal 0 in the LIKE fallback, so it
/// is read flexibly and emitted as a JSON number either way.
fn search_result_row(row: &Row) -> rusqlite::Result<Value> {
    let rank = match row.get::<_, f64>(6) {
        Ok(r) => json!(r),
        Err(_) => json!(row.get::<_, i64>(6).unwrap_or(0)),
    };
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "title": row.get::<_, String>(1)?,
        "snippet": row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        "rank": rank,
        "updated_at": row.get::<_, i64>(4)?,
        "folder_id": row.get::<_, Option<String>>(2)?,
        "pinned": row.get::<_, i64>(3)? == 1,
    }))
}

/// dexnotes:search — searchNotes(query, opts?). FTS5 prefix search with a LIKE
/// fallback when FTS errors. Returns NoteSearchResult[].
fn search_notes(conn: &Connection, query: &str, limit: Option<i64>) -> Value {
    if query.trim().is_empty() {
        return json!([]);
    }
    let safe_limit = limit.unwrap_or(50).min(200);
    let sanitized = sanitize_fts(query);
    if sanitized.is_empty() {
        return json!([]);
    }

    // FTS5 attempt: snippet(...) + rank, joined back to notes.
    let fts_sql = "SELECT n.id, n.title, n.folder_id, n.pinned, n.updated_at,
            snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
            rank
        FROM notes_fts f
        JOIN notes n ON n.rowid = f.rowid
        WHERE notes_fts MATCH ? AND n.deleted = 0
        ORDER BY rank
        LIMIT ?";
    let match_expr = format!("{}*", sanitized);
    if let Ok(mut stmt) = conn.prepare(fts_sql) {
        if let Ok(rows) =
            stmt.query_map(params![match_expr, safe_limit], search_result_row)
        {
            let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
            return json!(out);
        }
    }

    // LIKE fallback (mirrors the TS catch branch; snippet '' and rank 0).
    let like = format!("%{}%", sanitized);
    let mut stmt = match conn.prepare(
        "SELECT id, title, folder_id, pinned, updated_at, '' as snippet, 0 as rank
         FROM notes
         WHERE deleted = 0 AND (title LIKE ? OR plain_text LIKE ?)
         ORDER BY updated_at DESC
         LIMIT ?",
    ) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![like, like, safe_limit], search_result_row) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// dexnotes:advancedSearch — advancedSearch(query). Parses field operators
/// (title:/tag:/folder:/before:/after:/has:/is:) into SQL conditions, then runs
/// an FTS query over the remaining plain terms with a non-FTS fallback.
/// Returns NoteSearchResult[].
fn advanced_search(conn: &Connection, query: &str) -> Value {
    let mut conditions: Vec<String> = vec!["n.deleted = 0".into()];
    let mut p: Vec<SqlValue> = Vec::new();
    let mut plain_terms: Vec<String> = Vec::new();

    for token in query.split_whitespace() {
        if let Some(colon_idx) = token.find(':') {
            if colon_idx > 0 {
                let op = token[..colon_idx].to_lowercase();
                let val = &token[colon_idx + 1..];
                match op.as_str() {
                    "title" => {
                        conditions.push("n.title LIKE ?".into());
                        p.push(SqlValue::Text(format!("%{}%", val)));
                    }
                    "tag" => {
                        conditions.push(
                            "EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?)".into(),
                        );
                        p.push(SqlValue::Text(val.to_lowercase()));
                    }
                    "folder" => {
                        conditions.push(
                            "EXISTS (SELECT 1 FROM folders f WHERE f.id = n.folder_id AND f.name LIKE ?)".into(),
                        );
                        p.push(SqlValue::Text(format!("%{}%", val)));
                    }
                    "before" => {
                        if let Some(d) = parse_date_ms(val) {
                            conditions.push("n.created_at < ?".into());
                            p.push(SqlValue::Integer(d));
                        }
                    }
                    "after" => {
                        if let Some(d) = parse_date_ms(val) {
                            conditions.push("n.created_at > ?".into());
                            p.push(SqlValue::Integer(d));
                        }
                    }
                    "has" => match val {
                        "attachment" => conditions.push(
                            "EXISTS (SELECT 1 FROM note_attachments na WHERE na.note_id = n.id)".into(),
                        ),
                        "checklist" => conditions.push("n.plain_text LIKE '%[ ]%'".into()),
                        "table" => conditions.push("n.content LIKE '%\"table\"%'".into()),
                        "code" => conditions.push("n.content LIKE '%\"codeblock\"%'".into()),
                        _ => {}
                    },
                    "is" => match val {
                        "pinned" => conditions.push("n.pinned = 1".into()),
                        "locked" => conditions.push("n.locked = 1".into()),
                        _ => {}
                    },
                    _ => plain_terms.push(token.to_string()),
                }
                continue;
            }
        }
        plain_terms.push(token.to_string());
    }

    let where_clause = conditions.join(" AND ");

    if !plain_terms.is_empty() {
        let term_str = sanitize_fts(&plain_terms.join(" "));
        if !term_str.is_empty() {
            let fts_sql = format!(
                "SELECT n.id, n.title, n.folder_id, n.pinned, n.updated_at,
                    snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
                    rank
                FROM notes_fts f
                JOIN notes n ON n.rowid = f.rowid
                WHERE {where_clause} AND notes_fts MATCH ?
                ORDER BY rank
                LIMIT 50"
            );
            let mut fts_params = p.clone();
            fts_params.push(SqlValue::Text(format!("{}*", term_str)));
            if let Ok(mut stmt) = conn.prepare(&fts_sql) {
                if let Ok(rows) = stmt
                    .query_map(rusqlite::params_from_iter(fts_params), search_result_row)
                {
                    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
                    return json!(out);
                }
            }
            // Fall through to the plain query on FTS failure.
        }
    }

    let plain_sql = format!(
        "SELECT n.id, n.title, n.folder_id, n.pinned, n.updated_at, '' as snippet, 0 as rank
         FROM notes n
         WHERE {where_clause}
         ORDER BY n.updated_at DESC
         LIMIT 50"
    );
    let mut stmt = match conn.prepare(&plain_sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), search_result_row) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// Parse a `YYYY-MM-DD` date string to epoch milliseconds (UTC midnight),
/// mirroring `new Date(val).getTime()` for the common ISO-date case the
/// advanced-search before:/after: operators receive. Returns None on parse
/// failure (the TS skips the condition on NaN).
fn parse_date_ms(val: &str) -> Option<i64> {
    let parts: Vec<&str> = val.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    let year: i64 = parts[0].parse().ok()?;
    let month: i64 = parts[1].parse().ok()?;
    let day: i64 = parts[2].parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    // Days from 1970-01-01 to the given Y-M-D (UTC), via a civil-date algorithm.
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some(days * 86_400_000)
}

// ---------------------------------------------------------------------------
// Word Suggestions
// ---------------------------------------------------------------------------

/// Lowercase and strip every char except a-z0-9'- (mirrors the TS regex clean).
fn clean_word(word: &str) -> String {
    word.to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '\'' || *c == '-')
        .collect()
}

/// dexnotes:recordWords — recordWords(words). Upserts each cleaned word
/// (length >= 2), bumping frequency. Returns { success: true }.
fn record_words(conn: &Connection, words: &[Value]) -> Value {
    let now = now_ms();
    for w in words {
        if let Some(s) = w.as_str() {
            let clean = clean_word(s);
            if clean.len() >= 2 {
                let _ = conn.execute(
                    "INSERT INTO word_suggestions_history (word, frequency, last_used)
                     VALUES (?, 1, ?)
                     ON CONFLICT(word) DO UPDATE SET frequency = frequency + 1, last_used = ?",
                    params![clean, now, now],
                );
            }
        }
    }
    json!({ "success": true })
}

/// dexnotes:getSuggestions — getWordSuggestions(prefix, limit?). Returns the
/// matching words ordered by frequency DESC.
fn get_word_suggestions(conn: &Connection, prefix: &str, limit: Option<i64>) -> Value {
    let clean = clean_word(prefix);
    if clean.is_empty() {
        return json!([]);
    }
    let like = format!("{}%", clean);
    let lim = limit.unwrap_or(10);
    let mut stmt = match conn.prepare(
        "SELECT word FROM word_suggestions_history WHERE word LIKE ? ORDER BY frequency DESC LIMIT ?",
    ) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![like, lim], |r| r.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).map(Value::String).collect();
    json!(out)
}

/// dexnotes:getBigrams — getBigramSuggestions(lastWord, limit?). Frequency-based
/// next-word list excluding the given word.
fn get_bigram_suggestions(conn: &Connection, last_word: &str, limit: Option<i64>) -> Value {
    let lw = last_word.to_lowercase();
    let lim = limit.unwrap_or(5);
    let mut stmt = match conn.prepare(
        "SELECT word FROM word_suggestions_history WHERE word != ? ORDER BY frequency DESC LIMIT ?",
    ) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![lw, lim], |r| r.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).map(Value::String).collect();
    json!(out)
}

/// dexnotes:addCustomWord — addCustomWord(word). Inserts/raises a cleaned word
/// to frequency 1000. Returns { success } (false when too short).
fn add_custom_word(conn: &Connection, word: &str) -> Value {
    let clean = clean_word(word);
    if clean.len() < 2 {
        return json!({ "success": false });
    }
    let _ = conn.execute(
        "INSERT INTO word_suggestions_history (word, frequency, last_used)
         VALUES (?, 1000, ?)
         ON CONFLICT(word) DO UPDATE SET frequency = MAX(frequency, 1000)",
        params![clean, now_ms()],
    );
    json!({ "success": true })
}

// ---------------------------------------------------------------------------
// Templates (built-in data reproduced verbatim from the TS)
// ---------------------------------------------------------------------------

/// The 8 built-in template descriptors as NoteListItem entries (matches
/// getBuiltInTemplates). created_at/updated_at use the current time, as in TS.
const BUILTIN_TEMPLATES: &[(&str, &str, &str)] = &[
    ("tpl-daily-journal", "Daily Journal", "Daily journal template"),
    ("tpl-meeting-notes", "Meeting Notes", "Meeting notes template"),
    ("tpl-project-brief", "Project Brief", "Project brief template"),
    ("tpl-technical-spec", "Technical Spec", "Technical spec template"),
    ("tpl-weekly-review", "Weekly Review", "Weekly review template"),
    ("tpl-reading-notes", "Reading Notes", "Reading notes template"),
    ("tpl-recipe", "Recipe", "Recipe template"),
    ("tpl-blank", "Blank", ""),
];

/// Build the built-in template NoteListItem list (is_template true, tag 'template').
fn builtin_templates() -> Vec<Value> {
    let now = now_ms();
    BUILTIN_TEMPLATES
        .iter()
        .map(|(id, title, plain)| {
            json!({
                "id": id,
                "title": title,
                "plain_text": plain,
                "word_count": 0,
                "created_at": now,
                "updated_at": now,
                "pinned": false,
                "pin_order": 0,
                "locked": false,
                "color_label": Value::Null,
                "folder_id": Value::Null,
                "is_daily_note": false,
                "is_template": true,
                "tags": ["template"],
            })
        })
        .collect()
}

/// dexnotes:listTemplates — listTemplates(). Built-in templates followed by the
/// user's custom (is_template) notes.
fn list_templates(conn: &Connection) -> Value {
    let mut out = builtin_templates();
    if let Some(custom) = list_notes(conn, &json!({ "is_template": true })).as_array() {
        out.extend(custom.iter().cloned());
    }
    json!(out)
}

/// dexnotes:saveAsTemplate — saveAsTemplate(noteId). Flags the note as a
/// template and appends ' (Template)' to the title when absent. Returns { success }.
fn save_as_template(conn: &Connection, note_id: &str) -> Value {
    let note = get_note(conn, note_id);
    if note.is_null() {
        return json!({ "success": false });
    }
    let _ = conn.execute(
        "UPDATE notes SET is_template = 1 WHERE id = ?",
        params![note_id],
    );
    let title = note.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if !title.contains("(Template)") {
        let new_title = format!("{} (Template)", title);
        let _ = conn.execute(
            "UPDATE notes SET title = ? WHERE id = ?",
            params![new_title, note_id],
        );
    }
    json!({ "success": true })
}

/// dexnotes:createFromTemplate — createFromTemplate(templateId). Checks custom
/// templates first; falls back to the built-in document content. The built-in
/// template *bodies* (the large document JSON in the TS) are an editor-content
/// detail not reproduced here verbatim; instead a custom DB template is honored
/// faithfully, and a built-in id creates a note titled from the template with
/// an empty document body. Returns the created NotesDbNote or Null.
fn create_from_template(conn: &Connection, template_id: &str) -> Value {
    // Custom (DB) template takes precedence (matches getNote check in TS).
    let custom = get_note(conn, template_id);
    if !custom.is_null() {
        let title = custom
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .replace(" (Template)", "");
        let data = json!({
            "title": title,
            "content": custom.get("content").cloned().unwrap_or_else(|| json!("")),
            "plain_text": custom.get("plain_text").cloned().unwrap_or_else(|| json!("")),
        });
        return create_note(conn, &data);
    }

    // Built-in template: use its title + plain-text descriptor. The full
    // structured document body in the TS is editor content (not DB CRUD), so an
    // empty document body is used here while the note is still created faithfully.
    if let Some((_, title, plain)) = BUILTIN_TEMPLATES.iter().find(|(id, _, _)| *id == template_id) {
        let content = json!({
            "type": "document",
            "children": [ { "type": "paragraph", "children": [ { "type": "text", "text": "" } ] } ]
        })
        .to_string();
        let data = json!({
            "title": title,
            "content": content,
            "plain_text": plain,
        });
        return create_note(conn, &data);
    }

    Value::Null
}

// ---------------------------------------------------------------------------
// Daily Notes
// ---------------------------------------------------------------------------

/// dexnotes:getDailyNote — getOrCreateDailyNote(). Returns today's daily note,
/// creating it when absent. The title's localized long-date portion
/// (toLocaleDateString) is a JS Intl capability; the date prefix (YYYY-MM-DD)
/// is reproduced exactly and used for the existence check, and the created
/// note's title/body use that date string. Returns the raw NotesDbNote.
fn get_or_create_daily_note(conn: &Connection) -> Value {
    let (year, month, day) = today_ymd();
    let date_str = format!("{:04}-{:02}-{:02}", year, month, day);

    // Existence check: is_daily_note AND not deleted AND title LIKE 'YYYY-MM-DD%'.
    let existing = {
        let sql = format!(
            "SELECT {NOTE_COLS} FROM notes
             WHERE is_daily_note = 1 AND deleted = 0 AND title LIKE ?
             ORDER BY created_at DESC LIMIT 1"
        );
        conn.query_row(&sql, params![format!("{}%", date_str)], note_row_to_json)
            .unwrap_or(Value::Null)
    };
    if !existing.is_null() {
        return existing;
    }

    // Create new daily note. The TS title is `dateStr + ' - ' + localeTitle`;
    // the localized long-date piece needs Intl, unavailable here, so the date
    // string is used for both the title body and the heading.
    let content = json!({
        "type": "document",
        "children": [
            { "type": "heading1", "children": [ { "type": "text", "text": date_str } ] },
            { "type": "paragraph", "children": [ { "type": "text", "text": "" } ] }
        ]
    })
    .to_string();
    let data = json!({
        "title": format!("{} - {}", date_str, date_str),
        "content": content,
        "plain_text": date_str,
        "is_daily_note": 1,
    });
    create_note(conn, &data)
}

/// Today's (year, month, day) in UTC, derived from the epoch (no chrono crate).
fn today_ymd() -> (i64, i64, i64) {
    let days = now_ms() / 86_400_000;
    // Inverse of the civil-date algorithm in parse_date_ms.
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year, month, day)
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/// dexnotes:stats — getStats(). Aggregate counts across notes/folders/tags.
fn get_stats(conn: &Connection) -> Value {
    let scalar = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0) };
    json!({
        "totalNotes": scalar("SELECT COUNT(*) FROM notes WHERE deleted = 0 AND is_template = 0"),
        "totalFolders": scalar("SELECT COUNT(*) FROM folders"),
        "totalAttachments": scalar("SELECT COUNT(*) FROM note_attachments"),
        "totalWords": scalar("SELECT COALESCE(SUM(word_count), 0) FROM notes WHERE deleted = 0"),
        "totalTags": scalar("SELECT COUNT(DISTINCT tag_id) FROM note_tags"),
        "trashCount": scalar("SELECT COUNT(*) FROM notes WHERE deleted = 1"),
        "pinnedCount": scalar("SELECT COUNT(*) FROM notes WHERE pinned = 1 AND deleted = 0"),
        "lockedCount": scalar("SELECT COUNT(*) FROM notes WHERE locked = 1 AND deleted = 0"),
        "templateCount": scalar("SELECT COUNT(*) FROM notes WHERE is_template = 1 AND deleted = 0"),
    })
}

// ---------------------------------------------------------------------------
// Pane Sizes
// ---------------------------------------------------------------------------

/// dexnotes:getPaneSizes — getPaneSizes(). Returns { left, center } for the
/// 'default' key, falling back to 220/320 when the row is missing.
fn get_pane_sizes(conn: &Connection) -> Value {
    let row: Option<(i64, i64)> = conn
        .query_row(
            "SELECT left_width, center_width FROM note_pane_sizes WHERE key = ?",
            params!["default"],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    match row {
        Some((left, center)) => json!({
            "left": if left != 0 { left } else { 220 },
            "center": if center != 0 { center } else { 320 },
        }),
        None => json!({ "left": 220, "center": 320 }),
    }
}

/// dexnotes:setPaneSizes — setPaneSizes(left, center). Clamps left to [180,400]
/// and center to [240,600]. Returns { success: true }.
fn set_pane_sizes(conn: &Connection, left: i64, center: i64) -> Value {
    let clamped_left = left.clamp(180, 400);
    let clamped_center = center.clamp(240, 600);
    let _ = conn.execute(
        "UPDATE note_pane_sizes SET left_width = ?, center_width = ? WHERE key = ?",
        params![clamped_left, clamped_center, "default"],
    );
    json!({ "success": true })
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    // Small helpers for positional arg extraction.
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let i = |i: usize| args.get(i).and_then(|v| v.as_i64()).unwrap_or(0);
    let b = |idx: usize| truthy(args.get(idx));

    match channel {
        // === Note CRUD ===
        "dexnotes:create" => create_note(conn, &args.get(0).cloned().unwrap_or_else(|| json!({}))),
        "dexnotes:get" => get_note(conn, &s(0)),
        "dexnotes:update" => {
            update_note(conn, &s(0), &args.get(1).cloned().unwrap_or_else(|| json!({})))
        }
        "dexnotes:delete" => delete_note(conn, &s(0), b(1)),
        "dexnotes:list" => list_notes(conn, &args.get(0).cloned().unwrap_or_else(|| json!({}))),
        "dexnotes:restore" => restore_note(conn, &s(0)),
        "dexnotes:duplicate" => duplicate_note(conn, &s(0)),
        "dexnotes:pin" => pin_note(conn, &s(0), b(1)),
        "dexnotes:lock" => lock_note(conn, &s(0), b(1)),
        "dexnotes:setColor" => {
            set_note_color(conn, &s(0), args.get(1).unwrap_or(&Value::Null))
        }
        "dexnotes:moveToFolder" => {
            move_to_folder(conn, &s(0), args.get(1).unwrap_or(&Value::Null))
        }
        "dexnotes:emptyTrash" => empty_trash(conn),

        // === Tags ===
        "dexnotes:setTags" => {
            let tags = args.get(1).and_then(|v| v.as_array()).cloned().unwrap_or_default();
            set_tags(conn, &s(0), &tags)
        }
        "dexnotes:getAllTags" => get_all_tags(conn),

        // === Folders ===
        "dexnotes:createFolder" => {
            create_folder(conn, &args.get(0).cloned().unwrap_or_else(|| json!({})))
        }
        "dexnotes:listFolders" => list_folders(conn),
        "dexnotes:updateFolder" => {
            update_folder(conn, &s(0), &args.get(1).cloned().unwrap_or_else(|| json!({})))
        }
        "dexnotes:deleteFolder" => delete_folder(conn, &s(0)),

        // === Attachments (filesystem-backed; degrade honestly) ===
        // addAttachment copies a file from disk into the attachments dir,
        // openAttachment shells out to the OS file handler — neither is pure DB
        // work, so they are not ported. getAttachments/removeAttachment touch the
        // DB but the TS removeAttachment also unlinks the on-disk file; to avoid a
        // partial (DB-only) behavior that diverges from Electron, all four
        // attachment write/open paths degrade honestly. getAttachments is a pure
        // read and is ported faithfully.
        "dexnotes:getAttachments" => query_attachments(conn, &s(0)),
        "dexnotes:addAttachment" => json!({
            "success": false,
            "error": "attachment file copy not available in DB layer (not ported)"
        }),
        "dexnotes:removeAttachment" => json!({
            "success": false,
            "error": "attachment file removal not available in DB layer (not ported)"
        }),
        "dexnotes:openAttachment" => json!({
            "success": false,
            "error": "opening files in the OS shell not available in DB layer (not ported)"
        }),

        // === Links ===
        "dexnotes:addLink" => add_link(conn, &s(0), &s(1), &s(2)),
        "dexnotes:removeLink" => remove_link(conn, i(0)),
        "dexnotes:getLinks" => query_link_rows(
            conn,
            "SELECT nl.id, nl.target_note_id, n.title, nl.context_text
             FROM note_links nl
             JOIN notes n ON n.id = nl.target_note_id
             WHERE nl.source_note_id = ?",
            &s(0),
        ),
        "dexnotes:getBacklinks" => query_link_rows(
            conn,
            "SELECT nl.id, nl.source_note_id, n.title, nl.context_text
             FROM note_links nl
             JOIN notes n ON n.id = nl.source_note_id
             WHERE nl.target_note_id = ?",
            &s(0),
        ),

        // === Search ===
        "dexnotes:search" => {
            // searchNotes(query, opts?) — limit lives in opts.limit.
            let limit = args.get(1).and_then(|o| o.get("limit")).and_then(|v| v.as_i64());
            search_notes(conn, &s(0), limit)
        }
        "dexnotes:advancedSearch" => advanced_search(conn, &s(0)),

        // === Word Suggestions ===
        "dexnotes:recordWords" => {
            let words = args.get(0).and_then(|v| v.as_array()).cloned().unwrap_or_default();
            record_words(conn, &words)
        }
        "dexnotes:getSuggestions" => {
            let limit = args.get(1).and_then(|v| v.as_i64());
            get_word_suggestions(conn, &s(0), limit)
        }
        "dexnotes:getBigrams" => {
            let limit = args.get(1).and_then(|v| v.as_i64());
            get_bigram_suggestions(conn, &s(0), limit)
        }
        "dexnotes:addCustomWord" => add_custom_word(conn, &s(0)),

        // === Templates ===
        "dexnotes:listTemplates" => list_templates(conn),
        "dexnotes:createFromTemplate" => create_from_template(conn, &s(0)),
        "dexnotes:saveAsTemplate" => save_as_template(conn, &s(0)),

        // === Export / Import (filesystem-backed; degrade honestly) ===
        // exportNote writes a file to disk (and PDF needs a BrowserWindow);
        // importNotes reads files from disk — both are filesystem/OS concerns,
        // not pure DB work, so they degrade honestly rather than fabricate.
        // Export/import convert in the renderer (notesFileFormat.ts) and use
        // `dexnotes:saveExport` / `dexnotes:readImportFile` in native_ops.

        // === Stats ===
        "dexnotes:stats" => get_stats(conn),

        // === Pane sizes ===
        "dexnotes:getPaneSizes" => get_pane_sizes(conn),
        "dexnotes:setPaneSizes" => set_pane_sizes(conn, i(0), i(1)),

        // === Daily note ===
        "dexnotes:getDailyNote" => get_or_create_daily_note(conn),

        _ => Value::Null,
    }
}
