// =============================================================================
// DEX 6.0 — Smart Grouping (Tauri port of src/main/core/SmartGroupingManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed smart grouping (smart-grouping:* channels), reading/writing the
//! shared `dex.db` `smart_groups` table with the identical schema, queries, and
//! return shapes as the Electron manager (Feature 16). `runGrouping` clusters
//! notes/tasks pulled from the `settings` table (keys `notes_data`/`tasks_data`)
//! by shared tags, creation proximity, and shared keywords, persists the new
//! groups, and returns them. The clustering is pure computation over DB-resident
//! JSON, so it is ported faithfully (the TS wraps the settings read in try/catch
//! and degrades to an empty list when the data is absent — mirrored here). The
//! `initialize` BrowserWindow wiring is an Electron-internal concern (not an IPC
//! channel) and is not part of the renderer-facing surface ported below.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::collections::HashMap;

/// One day in milliseconds, used by the creation-proximity heuristic.
const DAY_MS: i64 = 86_400_000;

/// Create the smart_groups table + indexes (matches SmartGroupingManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS smart_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            app TEXT NOT NULL,
            item_ids TEXT NOT NULL,
            signal TEXT NOT NULL,
            created INTEGER NOT NULL,
            dismissed INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_smart_groups_app ON smart_groups(app);
        CREATE INDEX IF NOT EXISTS idx_smart_groups_dismissed ON smart_groups(dismissed);",
    );
    // Note: the `settings` table read by runGrouping is owned + created by the
    // settings/store subsystem; the TS wraps that read in try/catch and degrades
    // when it is absent, so we do NOT re-create it here.
}

/// One smart_groups row -> the SmartGroup shape. Column order matches the
/// `SELECT *` getGroups query (id, label, app, item_ids, signal, created,
/// dismissed) under Electron, with `item_ids` re-parsed from its JSON text into
/// an array (matching the `...row, item_ids: JSON.parse(...)` re-map).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let item_ids_raw: String = row.get::<_, String>(3)?;
    let item_ids: Value = serde_json::from_str(&item_ids_raw).unwrap_or_else(|_| json!([]));
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "label": row.get::<_, String>(1)?,
        "app": row.get::<_, String>(2)?,
        "item_ids": item_ids,
        "signal": row.get::<_, String>(4)?,
        "created": row.get::<_, i64>(5)?,
        "dismissed": row.get::<_, i64>(6)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, label, app, item_ids, signal, created, dismissed FROM smart_groups";

fn query_list(conn: &Connection, sql: &str, p: Vec<SqlValue>) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// An in-memory candidate group, mirroring the TS SmartGroup objects built by
/// runGrouping (id is always 0, dismissed always 0, item_ids a list of ids).
struct Candidate {
    label: String,
    app: String,
    item_ids: Vec<Value>,
    signal: String,
}

/// Read the JSON array stored under a `settings` key (e.g. `notes_data`).
/// Returns the parsed array, or an empty vec when the key/table is absent or the
/// value does not parse to an array (matches `JSON.parse(row.value || '[]')` plus
/// the `Array.isArray` guard, all inside the TS try/catch).
fn read_settings_array(conn: &Connection, key: &str) -> Vec<Value> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?",
            params![key],
            |r| r.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten();
    match value {
        Some(raw) => {
            let raw = if raw.is_empty() { "[]".to_string() } else { raw };
            match serde_json::from_str::<Value>(&raw) {
                Ok(Value::Array(a)) => a,
                _ => Vec::new(),
            }
        }
        None => Vec::new(),
    }
}

/// `note.id` / `task.id` as a JSON value (preserved verbatim — ids may be
/// strings or numbers in the source data; the TS pushes them unchanged).
fn item_id(item: &Value) -> Value {
    item.get("id").cloned().unwrap_or(Value::Null)
}

/// JS-style equality for two id values as used by `Array.includes` over the
/// stored item ids (strict ===; no string/number coercion).
fn ids_eq(a: &Value, b: &Value) -> bool {
    a == b
}

/// True if `group` contains the given id (mirrors `g.item_ids.includes(id)`).
fn group_includes(group: &Candidate, id: &Value) -> bool {
    group.item_ids.iter().any(|x| ids_eq(x, id))
}

/// runGrouping() — cluster notes/tasks by shared tag, creation proximity, and
/// shared keyword; persist new groups; return the in-memory candidates as
/// SmartGroup objects. Mirrors the TS heuristics verbatim.
fn run_grouping(conn: &Connection, now: i64) -> Value {
    let mut groups: Vec<Candidate> = Vec::new();

    // ---- Notes ----
    // The TS only enters this block when the `notes_data` settings row exists;
    // an absent row (or empty/non-array value) yields no notes and thus no
    // groups, so iterating an empty list here is equivalent.
    let notes = read_settings_array(conn, "notes_data");
    {
        // shared-tag clustering (insertion-ordered, like the JS Map).
        let mut tag_order: Vec<String> = Vec::new();
        let mut tag_map: HashMap<String, Vec<Value>> = HashMap::new();
        for note in &notes {
            if let Some(tags) = note.get("tags").and_then(|v| v.as_array()) {
                for tag in tags {
                    if let Some(tag) = tag.as_str() {
                        if !tag_map.contains_key(tag) {
                            tag_order.push(tag.to_string());
                        }
                        tag_map.entry(tag.to_string()).or_default().push(note.clone());
                    }
                }
            }
        }
        for tag in &tag_order {
            let items = &tag_map[tag];
            if items.len() >= 2 {
                groups.push(Candidate {
                    label: format!("Notes tagged \"{}\"", tag),
                    app: "notes".to_string(),
                    item_ids: items.iter().map(item_id).collect(),
                    signal: format!("shared-tag:{}", tag),
                });
            }
        }

        // creation-proximity clustering (pairwise, < 1 day apart and > 0).
        for i in 0..notes.len() {
            for j in (i + 1)..notes.len() {
                let ci = notes[i].get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let cj = notes[j].get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let time_diff = (ci - cj).abs();
                if time_diff < DAY_MS && time_diff > 0 {
                    let id_i = item_id(&notes[i]);
                    let id_j = item_id(&notes[j]);
                    let exists_in_group = groups.iter().any(|g| {
                        g.app == "notes" && group_includes(g, &id_i) && group_includes(g, &id_j)
                    });
                    if !exists_in_group {
                        groups.push(Candidate {
                            label: "Created around the same time".to_string(),
                            app: "notes".to_string(),
                            item_ids: vec![id_i, id_j],
                            signal: "creation-proximity".to_string(),
                        });
                    }
                }
            }
        }

        // shared-keyword clustering (top-3 words per note, length > 4).
        let mut kw_order: Vec<String> = Vec::new();
        let mut keyword_map: HashMap<String, Vec<Value>> = HashMap::new();
        for note in &notes {
            let content_part = note
                .get("content")
                .and_then(|v| v.as_str())
                .or_else(|| note.get("text").and_then(|v| v.as_str()))
                .unwrap_or("");
            let title_part = note
                .get("title")
                .and_then(|v| v.as_str())
                .or_else(|| note.get("name").and_then(|v| v.as_str()))
                .unwrap_or("");
            let content = format!("{} {}", content_part, title_part).to_lowercase();

            // words = content.split(/\s+/).filter(w => w.length > 4)
            let words: Vec<&str> = content
                .split_whitespace()
                .filter(|w| w.chars().count() > 4)
                .collect();

            // wordFreq, insertion-ordered for the stable sort below.
            let mut freq_order: Vec<String> = Vec::new();
            let mut word_freq: HashMap<String, i64> = HashMap::new();
            for w in &words {
                if !word_freq.contains_key(*w) {
                    freq_order.push(w.to_string());
                }
                *word_freq.entry(w.to_string()).or_insert(0) += 1;
            }
            // topWords = entries.sort((a,b) => b[1]-a[1]).slice(0,3) — stable sort
            // over insertion order, descending by frequency.
            let mut entries: Vec<(String, i64)> =
                freq_order.iter().map(|w| (w.clone(), word_freq[w])).collect();
            entries.sort_by(|a, b| b.1.cmp(&a.1));
            let top_words: Vec<String> =
                entries.into_iter().take(3).map(|(w, _)| w).collect();

            for kw in top_words {
                if !keyword_map.contains_key(&kw) {
                    kw_order.push(kw.clone());
                }
                keyword_map.entry(kw).or_default().push(note.clone());
            }
        }
        for keyword in &kw_order {
            let items = &keyword_map[keyword];
            if items.len() >= 2 && items.len() <= 10 {
                // uniqueIds = [...new Set(ids)] — de-dup preserving first-seen order.
                let mut unique_ids: Vec<Value> = Vec::new();
                for it in items {
                    let id = item_id(it);
                    if !unique_ids.iter().any(|x| ids_eq(x, &id)) {
                        unique_ids.push(id);
                    }
                }
                if unique_ids.len() >= 2 {
                    let already_grouped = groups.iter().any(|g| {
                        g.app == "notes"
                            && g.signal.starts_with("shared-keyword")
                            && unique_ids.iter().all(|id| group_includes(g, id))
                    });
                    if !already_grouped {
                        groups.push(Candidate {
                            label: format!("Related to \"{}\"", keyword),
                            app: "notes".to_string(),
                            item_ids: unique_ids,
                            signal: format!("shared-keyword:{}", keyword),
                        });
                    }
                }
            }
        }
    }

    // ---- Tasks (shared-tag clustering only) ----
    let tasks = read_settings_array(conn, "tasks_data");
    if !tasks.is_empty() {
        let mut tag_order: Vec<String> = Vec::new();
        let mut tag_map: HashMap<String, Vec<Value>> = HashMap::new();
        for task in &tasks {
            if let Some(tags) = task.get("tags").and_then(|v| v.as_array()) {
                for tag in tags {
                    if let Some(tag) = tag.as_str() {
                        if !tag_map.contains_key(tag) {
                            tag_order.push(tag.to_string());
                        }
                        tag_map.entry(tag.to_string()).or_default().push(task.clone());
                    }
                }
            }
        }
        for tag in &tag_order {
            let items = &tag_map[tag];
            if items.len() >= 2 {
                groups.push(Candidate {
                    label: format!("Tasks tagged \"{}\"", tag),
                    app: "tasks".to_string(),
                    item_ids: items.iter().map(item_id).collect(),
                    signal: format!("shared-tag:{}", tag),
                });
            }
        }
    }

    // Persist new groups (skip duplicates of an active group with the same
    // app + item_ids JSON), then return the candidates as SmartGroup objects.
    save_groups(conn, &groups, now);

    let out: Vec<Value> = groups
        .iter()
        .map(|g| {
            json!({
                "id": 0,
                "label": g.label,
                "app": g.app,
                "item_ids": g.item_ids,
                "signal": g.signal,
                "created": now,
                "dismissed": 0,
            })
        })
        .collect();
    json!(out)
}

/// saveGroups(groups) — insert each candidate unless an active (dismissed = 0)
/// group already exists with the same app + item_ids JSON (matches the TS
/// existence check; the JSON is serialized the same way `JSON.stringify` does
/// for a plain array of ids).
fn save_groups(conn: &Connection, groups: &[Candidate], now: i64) {
    for g in groups {
        let ids_json = serde_json::to_string(&g.item_ids).unwrap_or_else(|_| "[]".to_string());
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM smart_groups WHERE app = ? AND item_ids = ? AND dismissed = 0",
                params![g.app, ids_json],
                |r| r.get(0),
            )
            .ok();
        if existing.is_none() {
            let _ = conn.execute(
                "INSERT INTO smart_groups (label, app, item_ids, signal, created, dismissed) VALUES (?, ?, ?, ?, ?, 0)",
                params![g.label, g.app, ids_json, g.signal, now],
            );
        }
    }
}

/// getGroups(app?) — active groups (dismissed = 0), newest first, item_ids
/// re-parsed to an array. Optional `app` filter.
fn get_groups(conn: &Connection, app: Option<&str>) -> Value {
    match app {
        Some(a) => query_list(
            conn,
            &format!("{} WHERE dismissed = 0 AND app = ? ORDER BY created DESC", SELECT_COLS),
            vec![SqlValue::Text(a.to_string())],
        ),
        None => query_list(
            conn,
            &format!("{} WHERE dismissed = 0 ORDER BY created DESC", SELECT_COLS),
            Vec::new(),
        ),
    }
}

/// convertToTag(groupId, tagName) — returns false when the group is missing,
/// otherwise dismisses it and returns true. The actual tag write-back is not
/// performed in the TS either (the handler only dismisses the group), so this
/// is a faithful port, not a degradation.
fn convert_to_tag(conn: &Connection, group_id: i64) -> Value {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM smart_groups WHERE id = ?",
            params![group_id],
            |r| r.get(0),
        )
        .ok();
    if exists.is_none() {
        return json!(false);
    }
    let _ = conn.execute(
        "UPDATE smart_groups SET dismissed = 1 WHERE id = ?",
        params![group_id],
    );
    json!(true)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // run() returns SmartGroup[] (the freshly computed candidates).
        "smart-grouping:run" => {
            // now = Date.now() (ms since epoch); computed once per run.
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            run_grouping(conn, now)
        }
        // getGroups(app?) — app is an optional string argument.
        "smart-grouping:getGroups" => {
            get_groups(conn, args.get(0).and_then(|v| v.as_str()))
        }
        // dismiss(id) is void in Electron -> { success: true }.
        "smart-grouping:dismiss" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let _ = conn.execute(
                "UPDATE smart_groups SET dismissed = 1 WHERE id = ?",
                params![id],
            );
            json!({ "success": true })
        }
        // convertToTag(groupId, tagName) -> boolean. tagName is currently unused
        // by the TS handler (it only dismisses), so it is read but not applied.
        "smart-grouping:convertToTag" => {
            let group_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            convert_to_tag(conn, group_id)
        }
        _ => Value::Null,
    }
}
