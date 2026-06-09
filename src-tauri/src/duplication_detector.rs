// =============================================================================
// DEX 6.0 — Duplication Detector (Tauri port of src/main/core/DuplicationDetectorManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed cross-app duplication detector (duplication-detector:* channels),
//! reading/writing the shared `dex.db` `duplicate_groups` table with the identical
//! schema, queries, and return shapes as the Electron manager (Feature 9).
//!
//! `run` performs detection over data the Electron manager reads straight from the
//! shared DB: the `settings` rows `notes_data` / `tasks_data` (JSON blobs) and the
//! `media_library` table. Those are foreign tables owned by other subsystems, so
//! their reads are wrapped to degrade to empty when the table/row is absent — the
//! same try/catch-driven graceful path the TS takes — rather than fabricating
//! results. The Jaccard-similarity and grouping logic over those stored rows is
//! pure and ported faithfully. `dismiss`/`clearAll` are void in Electron and so
//! return `{ success: true }`.

use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::collections::HashMap;

/// Create the duplicate_groups table + indexes (matches createTables verbatim).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS duplicate_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            items TEXT NOT NULL,
            dismissed INTEGER DEFAULT 0,
            detected_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_duplicate_groups_type ON duplicate_groups(type);
        CREATE INDEX IF NOT EXISTS idx_duplicate_groups_dismissed ON duplicate_groups(dismissed);",
    );
    // Note: `settings` and `media_library` (read by runDetection) are owned and
    // created by other subsystems; the TS wraps those reads in try/catch and
    // degrades when they are absent, so we do NOT re-create them here.
}

/// One `duplicate_groups` row -> JSON. Column order matches the SELECT below and
/// the `SELECT *` shape under Electron (snake_case keys). The `getGroups` handler
/// re-maps `items` from its stored JSON string into a parsed array (see below).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "type": row.get::<_, String>(1)?,
        "items": row.get::<_, String>(2)?,
        "dismissed": row.get::<_, i64>(3)?,
        "detected_at": row.get::<_, i64>(4)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, type, items, dismissed, detected_at FROM duplicate_groups";

/// duplication-detector:getGroups -> getGroups(includeDismissed=false).
/// Returns each row spread (snake_case) with `items` replaced by the parsed JSON
/// array (matches `{ ...row, items: JSON.parse(row.items || '[]') }`).
fn get_groups(conn: &Connection, include_dismissed: bool) -> Value {
    let mut sql = String::from(SELECT_COLS);
    if !include_dismissed {
        sql.push_str(" WHERE dismissed = 0");
    }
    sql.push_str(" ORDER BY detected_at DESC");

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([], row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows
        .filter_map(|r| r.ok())
        .map(|mut row| {
            // items: JSON.parse(row.items || '[]')
            let raw = row
                .get("items")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let parsed = if raw.is_empty() {
                json!([])
            } else {
                serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!([]))
            };
            if let Some(obj) = row.as_object_mut() {
                obj.insert("items".to_string(), parsed);
            }
            row
        })
        .collect();
    json!(out)
}

/// duplication-detector:dismiss -> dismissGroup(id). Void in Electron.
fn dismiss_group(conn: &Connection, id: i64) {
    let _ = conn.execute(
        "UPDATE duplicate_groups SET dismissed = 1 WHERE id = ?",
        params![id],
    );
}

/// duplication-detector:clearAll -> clearAll(). Void in Electron.
fn clear_all(conn: &Connection) {
    let _ = conn.execute("DELETE FROM duplicate_groups", []);
}

/// Jaccard similarity over word sets (matches jaccardSimilarity verbatim):
/// lowercased, split on whitespace, keeping words with length > 2.
fn jaccard_similarity(a: &str, b: &str) -> f64 {
    let words_a: std::collections::HashSet<String> = a
        .to_lowercase()
        .split_whitespace()
        .filter(|w| w.len() > 2)
        .map(|w| w.to_string())
        .collect();
    let words_b: std::collections::HashSet<String> = b
        .to_lowercase()
        .split_whitespace()
        .filter(|w| w.len() > 2)
        .map(|w| w.to_string())
        .collect();

    if words_a.is_empty() && words_b.is_empty() {
        return 1.0;
    }
    if words_a.is_empty() || words_b.is_empty() {
        return 0.0;
    }

    let mut intersection = 0i64;
    for word in &words_a {
        if words_b.contains(word) {
            intersection += 1;
        }
    }
    let union = words_a.len() as i64 + words_b.len() as i64 - intersection;
    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

/// Read a single `settings` value by key, degrading to None when the `settings`
/// table is absent (foreign table) or the row does not exist.
fn read_setting(conn: &Connection, key: &str) -> Option<String> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?")
        .ok()?;
    stmt.query_row(params![key], |r| r.get::<_, Option<String>>(0))
        .ok()
        .flatten()
}

/// A detected DuplicateItem (matches the DuplicateItem interface field order).
fn make_item(
    app: &str,
    item_id: Value,
    item_name: &str,
    item_type: &str,
    last_modified: i64,
) -> Value {
    json!({
        "app": app,
        "item_id": item_id,
        "item_name": item_name,
        "item_type": item_type,
        "last_modified": last_modified,
    })
}

/// Coerce a JSON value that may be string/number/null to a string the way JS
/// would when assigning `item_id: notes[i].id` (passed through untouched here as
/// a JSON value to preserve the original type, mirroring no coercion in the TS).
fn json_str_field<'a>(obj: &'a Value, keys: &[&str]) -> &'a str {
    for k in keys {
        if let Some(s) = obj.get(*k).and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return s;
            }
        }
    }
    ""
}

/// runDetection(): build duplicate groups from notes/tasks/media, persist new
/// (non-dismissed) groups, and return them. `now` = Date.now() in ms.
fn run_detection(conn: &Connection) -> Value {
    let mut groups: Vec<Value> = Vec::new();
    let now: i64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    // --- similar-notes: pairwise Jaccard >= 0.85 over notes_data ---
    if let Some(raw) = read_setting(conn, "notes_data") {
        let notes: Value = serde_json::from_str(if raw.is_empty() { "[]" } else { &raw })
            .unwrap_or_else(|_| json!([]));
        if let Some(notes) = notes.as_array() {
            if notes.len() > 1 {
                for i in 0..notes.len() {
                    for j in (i + 1)..notes.len() {
                        let content_a = json_str_field(&notes[i], &["content", "text"]);
                        let content_b = json_str_field(&notes[j], &["content", "text"]);
                        if content_a.len() < 10 || content_b.len() < 10 {
                            continue;
                        }
                        let sim = jaccard_similarity(content_a, content_b);
                        if sim >= 0.85 {
                            let name_a = {
                                let n = json_str_field(&notes[i], &["title", "name"]);
                                if n.is_empty() { "Untitled" } else { n }
                            };
                            let name_b = {
                                let n = json_str_field(&notes[j], &["title", "name"]);
                                if n.is_empty() { "Untitled" } else { n }
                            };
                            let mod_a = notes[i]
                                .get("updatedAt")
                                .and_then(|v| v.as_i64())
                                .unwrap_or(now);
                            let mod_b = notes[j]
                                .get("updatedAt")
                                .and_then(|v| v.as_i64())
                                .unwrap_or(now);
                            groups.push(json!({
                                "id": 0,
                                "type": "similar-notes",
                                "items": [
                                    make_item("notes", notes[i].get("id").cloned().unwrap_or(Value::Null), name_a, "note", mod_a),
                                    make_item("notes", notes[j].get("id").cloned().unwrap_or(Value::Null), name_b, "note", mod_b),
                                ],
                                "dismissed": 0,
                                "detected_at": now,
                            }));
                        }
                    }
                }
            }
        }
    }

    // --- identical-tasks: group by lowercased trimmed title/name (len >= 3) ---
    if let Some(raw) = read_setting(conn, "tasks_data") {
        let tasks: Value = serde_json::from_str(if raw.is_empty() { "[]" } else { &raw })
            .unwrap_or_else(|_| json!([]));
        if let Some(tasks) = tasks.as_array() {
            // Preserve first-seen key order (JS Map iteration order).
            let mut order: Vec<String> = Vec::new();
            let mut name_map: HashMap<String, Vec<&Value>> = HashMap::new();
            for t in tasks {
                let key = json_str_field(t, &["title", "name"])
                    .to_lowercase();
                let key = key.trim().to_string();
                if key.len() < 3 {
                    continue;
                }
                if !name_map.contains_key(&key) {
                    order.push(key.clone());
                }
                name_map.entry(key).or_default().push(t);
            }
            for key in &order {
                let dupes = &name_map[key];
                if dupes.len() > 1 {
                    let items: Vec<Value> = dupes
                        .iter()
                        .map(|t| {
                            let app = json_str_field(t, &["app"]);
                            let app = if app.is_empty() { "tasks" } else { app };
                            let name = json_str_field(t, &["title", "name"]);
                            let last_modified = t
                                .get("updatedAt")
                                .and_then(|v| v.as_i64())
                                .unwrap_or(now);
                            make_item(
                                app,
                                t.get("id").cloned().unwrap_or(Value::Null),
                                name,
                                "task",
                                last_modified,
                            )
                        })
                        .collect();
                    groups.push(json!({
                        "id": 0,
                        "type": "identical-tasks",
                        "items": items,
                        "dismissed": 0,
                        "detected_at": now,
                    }));
                }
            }
        }
    }

    // --- identical-media: group by `${size}-${type}` over media_library ---
    // media_library is a foreign table; degrade to no media groups if absent.
    // Each row: (id, filename, key) where key = `${size}-${type}` exactly as the
    // TS template string coerces those two cells.
    let media: Vec<(i64, String, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, filepath, filename, type, size FROM media_library")
            .ok();
        match stmt.as_mut() {
            Some(stmt) => {
                let mapped = stmt.query_map([], |r| {
                    let id = r.get::<_, i64>(0)?; // id
                    let filename = r.get::<_, String>(2).unwrap_or_default(); // filename
                    let m_type = cell_to_key_part(r, 3); // type
                    let size = cell_to_key_part(r, 4); // size
                    Ok((id, filename, format!("{}-{}", size, m_type)))
                });
                match mapped {
                    Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
                    Err(_) => Vec::new(),
                }
            }
            None => Vec::new(),
        }
    };
    if !media.is_empty() {
        let mut order: Vec<String> = Vec::new();
        let mut size_map: HashMap<String, Vec<(i64, String)>> = HashMap::new();
        for (id, filename, key) in &media {
            if !size_map.contains_key(key) {
                order.push(key.clone());
            }
            size_map
                .entry(key.clone())
                .or_default()
                .push((*id, filename.clone()));
        }
        for key in &order {
            let dupes = &size_map[key];
            if dupes.len() > 1 {
                let items: Vec<Value> = dupes
                    .iter()
                    .map(|(id, filename)| {
                        // item_id: String(m.id)
                        make_item("media", json!(id.to_string()), filename, "media", now)
                    })
                    .collect();
                groups.push(json!({
                    "id": 0,
                    "type": "identical-media",
                    "items": items,
                    "dismissed": 0,
                    "detected_at": now,
                }));
            }
        }
    }

    save_groups(conn, &groups);
    json!(groups)
}

/// Read a media_library cell (size/type) the way the JS template string `${cell}`
/// would coerce it: integers/reals stringified, text passed through, NULL/absent
/// -> "" (JS would render `undefined`/`null`, but those rows never key-collide in
/// practice; the empty-string form keeps the key well-defined and stable).
fn cell_to_key_part(row: &Row, idx: usize) -> String {
    use rusqlite::types::ValueRef;
    match row.get_ref(idx) {
        Ok(ValueRef::Integer(i)) => i.to_string(),
        Ok(ValueRef::Real(f)) => f.to_string(),
        Ok(ValueRef::Text(t)) => String::from_utf8_lossy(t).to_string(),
        _ => String::new(),
    }
}

/// saveGroups: insert each group not already stored-as-dismissed (dedup by the
/// exact (type, items-JSON) pair), matching the TS guard verbatim.
fn save_groups(conn: &Connection, groups: &[Value]) {
    for g in groups {
        let group_type = g.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let items_json = serde_json::to_string(
            g.get("items").unwrap_or(&Value::Null),
        )
        .unwrap_or_else(|_| "[]".to_string());
        let detected_at = g.get("detected_at").and_then(|v| v.as_i64()).unwrap_or(0);

        // is this exact group already stored as dismissed?
        let already_dismissed: Option<i64> = conn
            .query_row(
                "SELECT id FROM duplicate_groups WHERE type = ? AND items = ? AND dismissed = 1",
                params![group_type, items_json],
                |r| r.get(0),
            )
            .ok();

        if already_dismissed.is_none() {
            let _ = conn.execute(
                "INSERT INTO duplicate_groups (type, items, dismissed, detected_at) VALUES (?, ?, 0, ?)",
                params![group_type, items_json, detected_at],
            );
        }
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "duplication-detector:run" => run_detection(conn),
        "duplication-detector:getGroups" => {
            // includeDismissed defaults to false (TS default param).
            let include_dismissed = args.get(0).and_then(|v| v.as_bool()).unwrap_or(false);
            get_groups(conn, include_dismissed)
        }
        // dismiss/clearAll are void in Electron -> { success: true }.
        "duplication-detector:dismiss" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            dismiss_group(conn, id);
            json!({ "success": true })
        }
        "duplication-detector:clearAll" => {
            clear_all(conn);
            json!({ "success": true })
        }
        _ => Value::Null,
    }
}
