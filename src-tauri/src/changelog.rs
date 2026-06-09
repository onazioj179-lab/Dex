// =============================================================================
// DEX 6.0 — Personal Changelog (Tauri port of src/main/core/PersonalChangelogManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed personal changelog (changelog:* channels), reading/writing the
//! shared `dex.db` `personal_changelog` table with the identical schema, queries,
//! and return shapes as the Electron manager (Feature 38). Entries can be
//! generated from the `activity_feed` table, summarized, and rendered to Markdown.
//! `changelog:export` opens a native save dialog under Electron — an OS/UI
//! capability not available in these pure DB functions — so it degrades honestly
//! (see the handler comment) while every DB-backed channel is ported faithfully.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Map, Value};

/// Create the personal_changelog table + indexes (matches createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS personal_changelog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            title TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            app TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_changelog_date ON personal_changelog(date);
        CREATE INDEX IF NOT EXISTS idx_changelog_category ON personal_changelog(category);",
    );
    // Note: `activity_feed` (read by generateFromActivity) is owned + created by
    // the activity_feed module; the TS wraps that read in try/catch and degrades
    // when the table is absent, so we do NOT re-create it here.
}

/// One row -> the ChangelogEntry shape (column order matches `SELECT *` on the
/// table definition above, exactly as Electron's better-sqlite3 returned it).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "date": row.get::<_, String>(1)?,
        "category": row.get::<_, String>(2)?,
        "title": row.get::<_, String>(3)?,
        "details": row.get::<_, String>(4)?,
        "app": row.get::<_, String>(5)?,
        "created_at": row.get::<_, String>(6)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, date, category, title, details, app, created_at FROM personal_changelog";

fn query_list(conn: &Connection, sql: &str, p: Vec<SqlValue>) -> Vec<Value> {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), row_to_json) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

/// changelog:add — addEntry(date, category, title, details='', app='').
/// Returns the inserted ChangelogEntry row, or null when the DB is absent or
/// the trimmed title is empty (mirrors the TS early returns).
fn add_entry(conn: &Connection, args: &Value) -> Value {
    let date = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let category = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let title = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
    // details/app default to '' when the renderer omits them (TS default params).
    let details = args.get(3).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let app = args.get(4).and_then(|v| v.as_str()).unwrap_or("").to_string();

    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Value::Null;
    }

    let inserted = conn.execute(
        "INSERT INTO personal_changelog (date, category, title, details, app) VALUES (?, ?, ?, ?, ?)",
        params![date, category, trimmed, details, app],
    );
    if inserted.is_err() {
        return Value::Null;
    }
    let id = conn.last_insert_rowid();

    let sql = format!("{} WHERE id = ?", SELECT_COLS);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![id], row_to_json) {
        Ok(v) => v,
        Err(_) => Value::Null,
    }
}

/// changelog:remove — removeEntry(id). Returns boolean (changes > 0).
fn remove_entry(conn: &Connection, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(-1);
    let changes = conn
        .execute("DELETE FROM personal_changelog WHERE id = ?", params![id])
        .unwrap_or(0);
    json!(changes > 0)
}

/// changelog:get — getEntries(options?). Returns ChangelogEntry[].
fn get_entries(conn: &Connection, options: &Value) -> Vec<Value> {
    let mut sql = String::from(SELECT_COLS);
    sql.push_str(" WHERE 1=1");
    let mut p: Vec<SqlValue> = Vec::new();

    if let Some(v) = options.get("startDate").and_then(|v| v.as_str()) {
        sql.push_str(" AND date >= ?");
        p.push(SqlValue::Text(v.to_string()));
    }
    if let Some(v) = options.get("endDate").and_then(|v| v.as_str()) {
        sql.push_str(" AND date <= ?");
        p.push(SqlValue::Text(v.to_string()));
    }
    if let Some(v) = options.get("category").and_then(|v| v.as_str()) {
        sql.push_str(" AND category = ?");
        p.push(SqlValue::Text(v.to_string()));
    }
    if let Some(v) = options.get("app").and_then(|v| v.as_str()) {
        sql.push_str(" AND app = ?");
        p.push(SqlValue::Text(v.to_string()));
    }

    sql.push_str(" ORDER BY date DESC, created_at DESC");
    // LIMIT is inlined in the TS as Math.min(limit||500, 2000).
    let limit = options.get("limit").and_then(|v| v.as_i64()).unwrap_or(500);
    let limit = limit.min(2000);
    sql.push_str(&format!(" LIMIT {}", limit));

    query_list(conn, &sql, p)
}

/// changelog:generate — generateFromActivity(startDate, endDate). Pulls rows
/// from activity_feed in the window and inserts a changelog entry for each,
/// returning the count inserted. Degrades to 0 if activity_feed is absent
/// (matches the TS try/catch).
fn generate_from_activity(conn: &Connection, args: &Value) -> Value {
    let start = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let end = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();

    let mut count: i64 = 0;

    // Read matching activity rows (event_type, title, details, app, created_at).
    let mut stmt = match conn.prepare(
        "SELECT created_at, event_type, title, details, app FROM activity_feed
         WHERE date(created_at) >= ? AND date(created_at) <= ?
         ORDER BY created_at ASC",
    ) {
        Ok(s) => s,
        Err(_) => return json!(0), // activity_feed may not exist
    };
    let rows = match stmt.query_map(params![start, end], |r| {
        Ok((
            r.get::<_, String>(0)?, // created_at
            r.get::<_, String>(1)?, // event_type
            r.get::<_, Option<String>>(2)?, // title (may be null)
            r.get::<_, Option<String>>(3)?, // details (may be null)
            r.get::<_, Option<String>>(4)?, // app (may be null)
        ))
    }) {
        Ok(r) => r,
        Err(_) => return json!(0),
    };
    let activities: Vec<(String, String, Option<String>, Option<String>, Option<String>)> =
        rows.filter_map(|r| r.ok()).collect();
    drop(stmt);

    for (created_at, event_type, title, details, app) in activities {
        // date = created_at.split('T')[0] || created_at.split(' ')[0]
        let date = {
            let t = created_at.split('T').next().unwrap_or("");
            if !t.is_empty() {
                t.to_string()
            } else {
                created_at
                    .split(' ')
                    .next()
                    .unwrap_or("")
                    .to_string()
            }
        };
        // category = event_type || 'general'
        let category = if event_type.is_empty() {
            "general".to_string()
        } else {
            event_type.clone()
        };
        // title = activity.title || activity.event_type
        let entry_title = match title {
            Some(t) if !t.is_empty() => t,
            _ => event_type.clone(),
        };
        // details = activity.details || ''
        let entry_details = details.unwrap_or_default();
        // app = activity.app || ''
        let entry_app = app.unwrap_or_default();

        let _ = conn.execute(
            "INSERT INTO personal_changelog (date, category, title, details, app)
             VALUES (?, ?, ?, ?, ?)",
            params![date, category, entry_title, entry_details, entry_app],
        );
        count += 1;
    }

    json!(count)
}

/// Build the ChangelogSummary shape from a window's entries.
fn build_summary(start: &str, end: &str, entries: Vec<Value>) -> Value {
    let mut by_category: Map<String, Value> = Map::new();
    let mut by_app: Map<String, Value> = Map::new();

    for entry in &entries {
        if let Some(cat) = entry.get("category").and_then(|v| v.as_str()) {
            let next = by_category.get(cat).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
            by_category.insert(cat.to_string(), json!(next));
        }
        if let Some(app) = entry.get("app").and_then(|v| v.as_str()) {
            // TS only counts truthy app values (empty string is skipped).
            if !app.is_empty() {
                let next = by_app.get(app).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
                by_app.insert(app.to_string(), json!(next));
            }
        }
    }

    let total = entries.len() as i64;
    json!({
        "period": format!("{} to {}", start, end),
        "entries": entries,
        "stats": {
            "total": total,
            "byCategory": by_category,
            "byApp": by_app,
        },
    })
}

/// changelog:getSummary — getSummary(startDate, endDate).
fn get_summary(conn: &Connection, args: &Value) -> Value {
    let start = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let end = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let entries = get_entries(conn, &json!({ "startDate": start, "endDate": end }));
    build_summary(start, end, entries)
}

/// changelog:renderMarkdown — renderMarkdown(startDate, endDate). Reproduces the
/// TS string assembly verbatim (grouping by date, per-entry detail expansion,
/// and the Categories / By Application summary sections).
fn render_markdown(conn: &Connection, args: &Value) -> Value {
    let start = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let end = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let summary = get_summary(conn, args);

    let entries: &Vec<Value> = match summary.get("entries").and_then(|v| v.as_array()) {
        Some(e) => e,
        None => return json!(""),
    };
    let total = summary
        .get("stats")
        .and_then(|s| s.get("total"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let mut lines: Vec<String> = Vec::new();
    lines.push("# Personal Changelog".to_string());
    lines.push(format!("## {} to {}", start, end));
    lines.push(String::new());
    lines.push(format!("Total changes: {}", total));
    lines.push(String::new());

    // Group entries by date, preserving first-seen order (JS Map iteration order).
    let mut order: Vec<String> = Vec::new();
    let mut by_date: std::collections::HashMap<String, Vec<&Value>> = std::collections::HashMap::new();
    for entry in entries {
        let date = entry.get("date").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if !by_date.contains_key(&date) {
            order.push(date.clone());
        }
        by_date.entry(date).or_default().push(entry);
    }

    for date in &order {
        lines.push(format!("### {}", date));
        lines.push(String::new());
        if let Some(group) = by_date.get(date) {
            for entry in group {
                let app = entry.get("app").and_then(|v| v.as_str()).unwrap_or("");
                let category = entry.get("category").and_then(|v| v.as_str()).unwrap_or("");
                let title = entry.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let app_label = if !app.is_empty() {
                    format!(" [{}]", app)
                } else {
                    String::new()
                };
                let cat_label = if category != "general" {
                    format!(" ({})", category)
                } else {
                    String::new()
                };
                lines.push(format!("- {}{}{}", title, app_label, cat_label));

                let details = entry.get("details").and_then(|v| v.as_str()).unwrap_or("");
                if !details.is_empty() {
                    match serde_json::from_str::<Value>(details) {
                        Ok(parsed) if parsed.is_object() => {
                            if let Some(obj) = parsed.as_object() {
                                for (key, val) in obj {
                                    // val && typeof val !== 'object' -> truthy scalar
                                    if is_truthy_scalar(val) {
                                        lines.push(format!("  - {}: {}", key, scalar_to_string(val)));
                                    }
                                }
                            }
                        }
                        // Parsed but not an object (e.g. a bare number/string/array):
                        // TS does nothing in that branch (no throw, no fallback).
                        Ok(_) => {}
                        // JSON.parse threw -> fallback to raw details unless empty/'{}'.
                        Err(_) => {
                            if !details.is_empty() && details != "{}" {
                                lines.push(format!("  - {}", details));
                            }
                        }
                    }
                }
            }
        }
        lines.push(String::new());
    }

    // Categories section (sorted by count DESC), then By Application.
    let by_category = summary
        .get("stats")
        .and_then(|s| s.get("byCategory"))
        .and_then(|v| v.as_object());
    if let Some(map) = by_category {
        if !map.is_empty() {
            lines.push("### Categories".to_string());
            lines.push(String::new());
            for (cat, cnt) in sort_by_count_desc(map) {
                lines.push(format!("- {}: {}", cat, cnt));
            }
            lines.push(String::new());
        }
    }

    let by_app = summary
        .get("stats")
        .and_then(|s| s.get("byApp"))
        .and_then(|v| v.as_object());
    if let Some(map) = by_app {
        if !map.is_empty() {
            lines.push("### By Application".to_string());
            lines.push(String::new());
            for (app, cnt) in sort_by_count_desc(map) {
                lines.push(format!("- {}: {}", app, cnt));
            }
            lines.push(String::new());
        }
    }

    json!(lines.join("\n"))
}

/// JS truthiness for a detail value that is NOT an object/array: numbers != 0,
/// non-empty strings, and true. (null/false/0/"" are skipped, matching `val &&`.)
fn is_truthy_scalar(val: &Value) -> bool {
    match val {
        Value::Object(_) | Value::Array(_) | Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        Value::String(s) => !s.is_empty(),
    }
}

/// Render a scalar detail value the way JS string-coerces it for template output.
fn scalar_to_string(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

/// Sort a {name: count} map by count DESC (stable on ties, like Array.sort over
/// Object.entries which preserves insertion order for equal keys).
fn sort_by_count_desc(map: &Map<String, Value>) -> Vec<(String, i64)> {
    let mut v: Vec<(String, i64)> = map
        .iter()
        .map(|(k, val)| (k.clone(), val.as_i64().unwrap_or(0)))
        .collect();
    v.sort_by(|a, b| b.1.cmp(&a.1));
    v
}

/// changelog:getCategories — getCategories(). Returns distinct categories ASC.
fn get_categories(conn: &Connection) -> Value {
    let mut stmt = match conn
        .prepare("SELECT DISTINCT category FROM personal_changelog ORDER BY category ASC")
    {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([], |r| r.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).map(Value::String).collect();
    json!(out)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "changelog:add" => add_entry(conn, args),
        "changelog:remove" => remove_entry(conn, args),
        "changelog:get" => {
            let options = args.get(0).cloned().unwrap_or_else(|| json!({}));
            json!(get_entries(conn, &options))
        }
        "changelog:generate" => generate_from_activity(conn, args),
        "changelog:getSummary" => get_summary(conn, args),
        "changelog:renderMarkdown" => render_markdown(conn, args),
        // changelog:export opens a native save dialog and writes a file to a
        // user-chosen path — an OS/UI capability that lives in the Tauri layer,
        // not in these pure DB functions. Degrade honestly rather than fake a
        // path. The Tauri command layer should wire the real save dialog and
        // call render_markdown() for the content.
        "changelog:export" => json!({
            "success": false,
            "error": "native save dialog not available in DB layer (not ported)"
        }),
        "changelog:getCategories" => get_categories(conn),
        _ => Value::Null,
    }
}
