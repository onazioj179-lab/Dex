// =============================================================================
// DEX 6.0 — Full Text Index (Tauri port of src/main/core/FullTextIndexManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed universal full-text search (fts:* channels), reading/writing
//! the shared `dex.db` with the identical schema (a `universal_index` content
//! table + a `universal_fts` FTS5 mirror with BM25 ranking, two indexes, and
//! three sync triggers) and return shapes as the Electron manager (Feature 29).
//! The renderer-facing surface is the five handlers below, ported faithfully;
//! the `initialize`/BrowserWindow lifecycle is an internal Electron concern.
//!
//! `fts:rebuild` in Electron walks foreign tables (`version_history`,
//! `scratchpad`, `daily_notes`) that this module does not own. Those reads are
//! wrapped to degrade to empty when the table is absent (matching the TS
//! `try { ... } catch { /* table may not exist */ }` guards), so a rebuild on a
//! database without those tables succeeds and simply indexes fewer items.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Map, Value};

// -----------------------------------------------------------------------------
// Schema (matches FullTextIndexManager.createTables verbatim, as IF NOT EXISTS).
// -----------------------------------------------------------------------------

const SCHEMA_SQL: &str = "
CREATE VIRTUAL TABLE IF NOT EXISTS universal_fts USING fts5(
  app,
  item_type,
  item_id,
  title,
  body,
  content='universal_index',
  content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TABLE IF NOT EXISTS universal_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(app, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_universal_app ON universal_index(app);
CREATE INDEX IF NOT EXISTS idx_universal_type ON universal_index(item_type);

CREATE TRIGGER IF NOT EXISTS universal_index_ai AFTER INSERT ON universal_index BEGIN
  INSERT INTO universal_fts(rowid, app, item_type, item_id, title, body)
  VALUES (new.id, new.app, new.item_type, new.item_id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS universal_index_ad AFTER DELETE ON universal_index BEGIN
  INSERT INTO universal_fts(universal_fts, rowid, app, item_type, item_id, title, body)
  VALUES ('delete', old.id, old.app, old.item_type, old.item_id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS universal_index_au AFTER UPDATE ON universal_index BEGIN
  INSERT INTO universal_fts(universal_fts, rowid, app, item_type, item_id, title, body)
  VALUES ('delete', old.id, old.app, old.item_type, old.item_id, old.title, old.body);
  INSERT INTO universal_fts(rowid, app, item_type, item_id, title, body)
  VALUES (new.id, new.app, new.item_type, new.item_id, new.title, new.body);
END;
";

/// Create the universal_index content table, the universal_fts FTS5 mirror, the
/// two secondary indexes, and the three sync triggers (matches createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(SCHEMA_SQL);
}

// -----------------------------------------------------------------------------
// Row -> JSON helpers.
// -----------------------------------------------------------------------------

/// One search-result row in the `SearchResult` shape. Electron's better-sqlite3
/// exposes the row keyed by the SELECT aliases, which here are the raw
/// snake_case columns (id, app, item_type, item_id, title, body) plus `rank`.
fn row_to_search(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "item_type": row.get::<_, String>(2)?,
        "item_id": row.get::<_, String>(3)?,
        "title": row.get::<_, String>(4)?,
        "body": row.get::<_, String>(5)?,
        "rank": row.get::<_, f64>(6)?,
    }))
}

/// Generic list runner (keeps `stmt` alive in its own binding per the rusqlite
/// lifetime rule). Returns `[]` on any prepare/query error.
fn query_list(
    conn: &Connection,
    sql: &str,
    p: Vec<SqlValue>,
    map_fn: fn(&Row) -> rusqlite::Result<Value>,
) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), map_fn) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

// -----------------------------------------------------------------------------
// Core operations.
// -----------------------------------------------------------------------------

/// index(app, itemType, itemId, title, body) -> boolean. Upserts the content row
/// (triggers keep the FTS mirror in sync). Returns true on success, false when
/// the write fails (matches the `if (!db) return false` / always-true TS path).
fn index(conn: &Connection, app: &str, item_type: &str, item_id: &str, title: &str, body: &str) -> bool {
    conn.execute(
        "INSERT INTO universal_index (app, item_type, item_id, title, body, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(app, item_type, item_id) DO UPDATE SET
           title = excluded.title,
           body = excluded.body,
           updated_at = datetime('now')",
        params![app, item_type, item_id, title, body],
    )
    .is_ok()
}

/// removeFromIndex(app, itemType, itemId) -> boolean.
fn remove_from_index(conn: &Connection, app: &str, item_type: &str, item_id: &str) -> bool {
    conn.execute(
        "DELETE FROM universal_index WHERE app = ? AND item_type = ? AND item_id = ?",
        params![app, item_type, item_id],
    )
    .is_ok()
}

/// search(query, options?) -> SearchResult[]. Mirrors the FTS5 MATCH query with
/// bm25 ranking. Empty / fully-sanitized-away queries return []. The query is
/// sanitized identically to the TS (special FTS chars replaced with spaces) and
/// bound as a parameter. On any FTS error -> [] (matches the try/catch).
fn search(conn: &Connection, query: &str, options: &Value) -> Value {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return json!([]);
    }

    // limit = min(options.limit || 50, 200)
    let limit = options
        .get("limit")
        .and_then(|v| v.as_i64())
        .filter(|&v| v != 0)
        .unwrap_or(50)
        .min(200);

    // Sanitize for FTS5 — replace special characters with spaces (matches the
    // regex /["\-\[\]{}()*+?.,\\^$|#]/g), then trim.
    const SPECIAL: &[char] = &[
        '"', '-', '[', ']', '{', '}', '(', ')', '*', '+', '?', '.', ',', '\\', '^', '$', '|', '#',
    ];
    let safe_query: String = trimmed
        .chars()
        .map(|c| if SPECIAL.contains(&c) { ' ' } else { c })
        .collect();
    let safe_query = safe_query.trim().to_string();
    if safe_query.is_empty() {
        return json!([]);
    }

    let mut sql = String::from(
        "SELECT ui.id, ui.app, ui.item_type, ui.item_id, ui.title, ui.body, \
         bm25(universal_fts) as rank \
         FROM universal_fts f \
         JOIN universal_index ui ON ui.id = f.rowid \
         WHERE universal_fts MATCH ?",
    );
    let mut p: Vec<SqlValue> = vec![SqlValue::Text(safe_query)];

    if let Some(app) = options.get("app").and_then(|v| v.as_str()) {
        sql.push_str(" AND ui.app = ?");
        p.push(SqlValue::Text(app.to_string()));
    }
    if let Some(item_type) = options.get("itemType").and_then(|v| v.as_str()) {
        sql.push_str(" AND ui.item_type = ?");
        p.push(SqlValue::Text(item_type.to_string()));
    }

    sql.push_str(" ORDER BY rank LIMIT ?");
    p.push(SqlValue::Integer(limit));

    query_list(conn, &sql, p, row_to_search)
}

/// Recursively flatten any JSON value into a space-joined string (matches the
/// private `extractText` helper, including the depth > 5 cutoff).
fn extract_text(v: &Value, depth: u32) -> String {
    if depth > 5 {
        return String::new();
    }
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Array(arr) => arr
            .iter()
            .map(|item| extract_text(item, depth + 1))
            .collect::<Vec<_>>()
            .join(" "),
        Value::Object(map) => map
            .values()
            .map(|val| extract_text(val, depth + 1))
            .collect::<Vec<_>>()
            .join(" "),
    }
}

/// rebuildIndex() -> number of items indexed. Walks the foreign tables
/// (`version_history`, `scratchpad`, `daily_notes`). Each scan is wrapped to
/// degrade to empty when its table is absent (matches the TS try/catch guards),
/// so the rebuild always succeeds and reports however many rows it could index.
fn rebuild_index(conn: &Connection) -> i64 {
    let mut count: i64 = 0;

    // version_history: SELECT DISTINCT app, project_name, data; body = flattened JSON.
    if let Ok(mut stmt) =
        conn.prepare("SELECT DISTINCT app, project_name, data FROM version_history")
    {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        }) {
            for row in rows.flatten() {
                let (app, project_name, data) = row;
                // JSON.parse(v.data || '{}'); skip on bad data (matches inner try/catch).
                let parsed: Value = serde_json::from_str(&data.unwrap_or_default())
                    .unwrap_or_else(|_| json!({}));
                let body = extract_text(&parsed, 0);
                if index(conn, &app, "project", &project_name, &project_name, &body) {
                    count += 1;
                }
            }
        }
    }

    // scratchpad: SELECT *; index('scratchpad','note', id, title, content).
    if let Ok(mut stmt) = conn.prepare("SELECT id, title, content FROM scratchpad") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        }) {
            for row in rows.flatten() {
                let (id, title, content) = row;
                if index(
                    conn,
                    "scratchpad",
                    "note",
                    &id.to_string(),
                    title.as_deref().unwrap_or(""),
                    content.as_deref().unwrap_or(""),
                ) {
                    count += 1;
                }
            }
        }
    }

    // daily_notes: SELECT *; index('daily-notes','daily-note', id, title, content).
    if let Ok(mut stmt) = conn.prepare("SELECT id, title, content FROM daily_notes") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        }) {
            for row in rows.flatten() {
                let (id, title, content) = row;
                if index(
                    conn,
                    "daily-notes",
                    "daily-note",
                    &id.to_string(),
                    title.as_deref().unwrap_or(""),
                    content.as_deref().unwrap_or(""),
                ) {
                    count += 1;
                }
            }
        }
    }

    count
}

/// getIndexStats() -> { totalItems, byApp, byType } (camelCase top-level keys;
/// byApp/byType are objects keyed by the grouping value). Defaults to zeros /
/// empty objects when the table is absent (matches the `if (!db)` fallback).
fn get_index_stats(conn: &Connection) -> Value {
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM universal_index", [], |r| r.get(0))
        .unwrap_or(0);

    let group_map = |sql: &str| -> Map<String, Value> {
        let mut out = Map::new();
        if let Ok(mut stmt) = conn.prepare(sql) {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            }) {
                for row in rows.flatten() {
                    out.insert(row.0, json!(row.1));
                }
            }
        }
        out
    };

    let by_app = group_map("SELECT app, COUNT(*) as cnt FROM universal_index GROUP BY app");
    let by_type =
        group_map("SELECT item_type, COUNT(*) as cnt FROM universal_index GROUP BY item_type");

    json!({
        "totalItems": total,
        "byApp": Value::Object(by_app),
        "byType": Value::Object(by_type),
    })
}

// -----------------------------------------------------------------------------
// Dispatch.
// -----------------------------------------------------------------------------

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("");

    match channel {
        // index(app, itemType, itemId, title, body) -> boolean
        "fts:index" => json!(index(conn, s(0), s(1), s(2), s(3), s(4))),

        // removeFromIndex(app, itemType, itemId) -> boolean
        "fts:remove" => json!(remove_from_index(conn, s(0), s(1), s(2))),

        // search(query, options?) -> SearchResult[]
        "fts:search" => {
            let options = args.get(1).cloned().unwrap_or_else(|| json!({}));
            search(conn, s(0), &options)
        }

        // rebuildIndex() -> number
        "fts:rebuild" => json!(rebuild_index(conn)),

        // getIndexStats() -> { totalItems, byApp, byType }
        "fts:stats" => get_index_stats(conn),

        _ => Value::Null,
    }
}
