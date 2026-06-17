// =============================================================================
// DEX 6.0 — Global Content Search (Tauri port of src/main/core/GlobalContentSearch.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Cross-content search engine (global-search:* channels). The Electron manager
//! fans a normalized query across nine sources and groups the results by source,
//! sorted by relevance. Three sources are SQLite-backed and read foreign tables
//! owned by other subsystems (media_library, notifications, recycle_bin via
//! DatabaseManager); each read is wrapped so a missing table contributes no
//! results, matching the TS per-source try/catch. We do NOT re-create those
//! tables — they belong to their owning modules.
//!
//! The remaining six sources are not DB-backed in Electron and so degrade
//! honestly here:
//!   - Apps is a static in-memory catalog — ported verbatim (no I/O needed).
//!   - Notes / Tasks / Vinx Projects / Automation Rules read renderer
//!     localStorage via webContents.executeJavaScript — unavailable in this pure
//!     DB layer, so they contribute no results.
//!   - Rewind Journal scans userData/rewind/*.json on disk — no fs index in this
//!     layer, so it contributes no results.
//!
//! In every case a missing/unavailable source yields an empty list, exactly as
//! the TS Promise.allSettled drops failed/empty sources from the output.
//!
//! Channels (verified against GlobalContentSearchEngine.registerIPC):
//!   global-search:query   query(string) -> SearchResultGroup[]
//!   global-search:sources sources()     -> string[]  (the source names)
//! These are distinct from the unrelated `search:` handlers and untouched here.

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, Row};
use serde_json::{json, Value};

/// This manager owns no tables of its own; it only reads foreign tables created
/// by other subsystems. Provided for a uniform module surface (no-op).
pub fn ensure_schema(_conn: &Connection) {}

/// The nine source names, in build order (matches buildSources).
const SOURCE_NAMES: [&str; 9] = [
    "Notes",
    "Tasks",
    "Rewind Journal",
    "Vinx Projects",
    "Automation Rules",
    "Media Library",
    "Apps",
    "Notifications",
    "Recycle Bin",
];

/// Static app catalog: (id, name, desc). Matches the `apps` array verbatim.
const APPS: [(&str, &str, &str); 24] = [
    ("home", "Home", "Desktop home screen with widgets"),
    ("files", "Files", "File manager and browser"),
    ("browser", "Browser", "Built-in web browser"),
    ("settings", "Settings", "DEX settings and preferences"),
    ("transfers", "Transfers", "File transfer manager"),
    ("dashboard", "Dashboard", "System dashboard and analytics"),
    ("notes", "Notes", "Note taking and text editor"),
    ("tasks", "Tasks", "Task and to-do list manager"),
    ("power", "Power", "Power management and automation"),
    ("workflows", "Workflows", "Workflow designer and runner"),
    ("gallery", "Gallery", "Image gallery and viewer"),
    ("audio", "Audio", "Audio player and editor"),
    ("video", "Video", "Video player"),
    ("videoeditor", "Vinx", "Professional video editor"),
    ("imosion", "Imosion", "Motion graphics and animation"),
    ("prism", "Prism", "Photo editor and filters"),
    ("flux", "Flux", "Design and layout tool"),
    ("forge", "Forge", "Code editor and IDE"),
    ("calculator", "Calculator", "Calculator and unit converter"),
    ("calendar", "Calendar", "Calendar and event planner"),
    (
        "passwordgenerator",
        "Password Generator",
        "Secure password generator",
    ),
    ("rewind", "Rewind", "Activity timeline and journal"),
    ("kanban", "Kanban", "Kanban board project management"),
    ("achievements", "Achievements", "Achievements and gamification"),
];

/// calculateRelevance(query, text) — ported verbatim. query is already the
/// normalized (trimmed, lowercased) string; text is lowercased here.
fn calculate_relevance(query: &str, text: &str) -> f64 {
    let lower = text.to_lowercase();
    if lower == query {
        return 100.0;
    }
    if lower.starts_with(query) {
        return 90.0;
    }
    // query.split(/\s+/) — split on runs of whitespace.
    let words: Vec<&str> = query.split_whitespace().collect();
    let mut matched = 0usize;
    for w in &words {
        if lower.contains(w) {
            matched += 1;
        }
    }
    let total = words.len();
    if total > 0 && matched == total {
        return 80.0;
    }
    if matched > 0 {
        return 40.0 + (matched as f64 / total as f64) * 40.0;
    }
    0.0
}

/// Build one SearchResult object (matches the SearchResult interface shape).
fn make_result(
    source: &str,
    title: &str,
    description: &str,
    timestamp: Value,
    deep_link: &str,
    relevance: f64,
) -> Value {
    json!({
        "source": source,
        "title": title,
        "description": description,
        "timestamp": timestamp,
        "deepLink": deep_link,
        "relevance": relevance,
    })
}

/// JS `String.prototype.substring(0, n)` over Unicode scalar values (chars),
/// matching how the renderer truncates descriptions.
fn substring(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

// -----------------------------------------------------------------------------
// Static / in-memory source: Apps (ported faithfully — no I/O needed).
// -----------------------------------------------------------------------------

fn search_apps(query: &str) -> Vec<Value> {
    let mut results: Vec<Value> = Vec::new();
    for (id, name, desc) in APPS.iter() {
        let combined = format!("{} {}", name, desc);
        let rel = calculate_relevance(query, &combined);
        if rel > 0.0 {
            results.push(make_result(
                "Apps",
                name,
                desc,
                Value::Null,
                &format!("dex://app/{}", id),
                rel,
            ));
        }
    }
    results
}

// -----------------------------------------------------------------------------
// SQLite-backed sources. Each wraps its read so a missing table -> [] (matches
// the TS try/catch returning [] per source). We never CREATE these tables.
// -----------------------------------------------------------------------------

/// SELECT * FROM media_library WHERE filename LIKE ? LIMIT 50
/// (column order per DatabaseManager's media_library CREATE TABLE).
fn search_media_library(conn: &Connection, query: &str) -> Vec<Value> {
    let like = format!("%{}%", query);
    let map = |row: &Row| -> rusqlite::Result<Value> {
        // Columns referenced by the TS: filename, type, size, timestamp, id.
        let id: i64 = row.get("id")?;
        let filename: String = row.get("filename")?;
        let typ: String = row.get("type")?;
        let size: i64 = row.get("size")?;
        let timestamp: Option<i64> = row.get("timestamp")?;
        // `${(row.size / 1024 / 1024).toFixed(1)} MB`
        let mb = size as f64 / 1024.0 / 1024.0;
        let description = format!("{} - {:.1} MB", typ, mb);
        Ok(make_result(
            "Media Library",
            &filename,
            &description,
            timestamp.map(|t| json!(t)).unwrap_or(Value::Null),
            &format!("dex://media/file/{}", id),
            calculate_relevance(query, &filename),
        ))
    };
    let mut stmt = match conn.prepare("SELECT * FROM media_library WHERE filename LIKE ? LIMIT 50") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([SqlValue::Text(like)], map) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

/// SELECT * FROM notifications WHERE title LIKE ? OR body LIKE ? ORDER BY timestamp DESC LIMIT 30
fn search_notifications(conn: &Connection, query: &str) -> Vec<Value> {
    let like = format!("%{}%", query);
    let map = |row: &Row| -> rusqlite::Result<Value> {
        let title: String = row.get("title")?;
        let body: String = row.get("body")?;
        let timestamp: Option<i64> = row.get("timestamp")?;
        let combined = format!("{} {}", title, body);
        Ok(make_result(
            "Notifications",
            &title,
            &substring(&body, 120),
            timestamp.map(|t| json!(t)).unwrap_or(Value::Null),
            "",
            calculate_relevance(query, &combined),
        ))
    };
    let mut stmt = match conn.prepare(
        "SELECT * FROM notifications WHERE title LIKE ? OR body LIKE ? ORDER BY timestamp DESC LIMIT 30",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map(
        [SqlValue::Text(like.clone()), SqlValue::Text(like)],
        map,
    ) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

/// SELECT * FROM recycle_bin WHERE item_name LIKE ? ORDER BY deleted_at DESC LIMIT 30
fn search_recycle_bin(conn: &Connection, query: &str) -> Vec<Value> {
    let like = format!("%{}%", query);
    let map = |row: &Row| -> rusqlite::Result<Value> {
        let item_name: String = row.get("item_name")?;
        let item_type: String = row.get("item_type")?;
        let app: String = row.get("app")?;
        let deleted_at: Option<i64> = row.get("deleted_at")?;
        let description = format!("Deleted {} from {}", item_type, app);
        Ok(make_result(
            "Recycle Bin",
            &item_name,
            &description,
            deleted_at.map(|t| json!(t)).unwrap_or(Value::Null),
            "",
            calculate_relevance(query, &item_name),
        ))
    };
    let mut stmt = match conn
        .prepare("SELECT * FROM recycle_bin WHERE item_name LIKE ? ORDER BY deleted_at DESC LIMIT 30")
    {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([SqlValue::Text(like)], map) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

// -----------------------------------------------------------------------------
// Orchestration: search(query) -> SearchResultGroup[].
// -----------------------------------------------------------------------------

/// Resolve all sources for the normalized query, in build order.
/// Notes / Tasks / Rewind Journal / Vinx Projects / Automation Rules depend on
/// renderer localStorage or on-disk fs scans that don't exist in this DB layer,
/// so they degrade to empty (honest, not faked).
fn collect_source(conn: &Connection, name: &str, query: &str) -> Vec<Value> {
    match name {
        "Apps" => search_apps(query),
        "Media Library" => search_media_library(conn, query),
        "Notifications" => search_notifications(conn, query),
        "Recycle Bin" => search_recycle_bin(conn, query),
        // localStorage / fs-backed sources are unavailable here -> no results.
        _ => Vec::new(),
    }
}

/// Numeric relevance from a result object (for sorting).
fn relevance_of(v: &Value) -> f64 {
    v.get("relevance").and_then(|r| r.as_f64()).unwrap_or(0.0)
}

fn search(conn: &Connection, query: &str) -> Value {
    // `if (!query || query.trim().length === 0) return []`
    if query.trim().is_empty() {
        return json!([]);
    }
    let normalized = query.trim().to_lowercase();

    // Build a group per non-empty source, each sorted by relevance DESC.
    let mut groups: Vec<Value> = Vec::new();
    for name in SOURCE_NAMES.iter() {
        let mut results = collect_source(conn, name, &normalized);
        if results.is_empty() {
            continue;
        }
        // sort((a, b) => b.relevance - a.relevance) — stable, descending.
        results.sort_by(|a, b| {
            relevance_of(b)
                .partial_cmp(&relevance_of(a))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let total_count = results.len() as i64;
        groups.push(json!({
            "source": name,
            "results": results,
            "totalCount": total_count,
        }));
    }

    // groups.sort by each group's top result relevance DESC (0 if empty).
    groups.sort_by(|a, b| {
        let max_a = a
            .get("results")
            .and_then(|r| r.as_array())
            .and_then(|arr| arr.first())
            .map(relevance_of)
            .unwrap_or(0.0);
        let max_b = b
            .get("results")
            .and_then(|r| r.as_array())
            .and_then(|arr| arr.first())
            .map(relevance_of)
            .unwrap_or(0.0);
        max_b.partial_cmp(&max_a).unwrap_or(std::cmp::Ordering::Equal)
    });

    json!(groups)
}

/// global-search:sources — the source names, in build order.
fn sources() -> Value {
    json!(SOURCE_NAMES.to_vec())
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "global-search:query" => {
            let query = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            search(conn, query)
        }
        "global-search:sources" => sources(),
        _ => Value::Null,
    }
}
