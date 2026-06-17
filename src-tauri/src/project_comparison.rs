// =============================================================================
// DEX 6.0 — Project Comparison (Tauri port of src/main/core/ProjectComparisonManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed structured project diff (project-comparison:* channels),
//! reading/writing the shared `dex.db` `comparison_history` table with the
//! identical schema, queries, and return shapes as the Electron manager
//! (Feature 26). `compare` flattens two project payloads, builds a field-level
//! diff (same / different / left-only / right-only), computes a similarity
//! percentage, records the run in `comparison_history`, and returns the
//! ComparisonResult. `compareVersions` rehydrates both sides from the
//! `version_history` table (owned by another subsystem) and degrades to null
//! when that table is absent — exactly as the TS try/catch does. `getHistory`
//! returns raw `SELECT *` rows (snake_case) in compared_at-DESC order.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the comparison_history table + index (matches createTables verbatim).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS comparison_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            left_id TEXT NOT NULL,
            left_name TEXT NOT NULL,
            right_id TEXT NOT NULL,
            right_name TEXT NOT NULL,
            similarity REAL NOT NULL DEFAULT 0,
            diff_count INTEGER NOT NULL DEFAULT 0,
            compared_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_comparison_app ON comparison_history(app);",
    );
    // Note: `version_history` (read by compareFromVersionHistory) is owned +
    // created by another subsystem; the TS wraps that read in try/catch and
    // degrades when the table is absent, so we do NOT re-create it here.
}

/// One comparison_history row -> object (column order matches `SELECT *` on the
/// table definition above, exactly as Electron's better-sqlite3 returned it).
/// `similarity` is a REAL column (kept as f64); all others are non-null.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "left_id": row.get::<_, String>(2)?,
        "left_name": row.get::<_, String>(3)?,
        "right_id": row.get::<_, String>(4)?,
        "right_name": row.get::<_, String>(5)?,
        "similarity": row.get::<_, f64>(6)?,
        "diff_count": row.get::<_, i64>(7)?,
        "compared_at": row.get::<_, String>(8)?,
    }))
}

const SELECT_ALL: &str = "SELECT id, app, left_id, left_name, right_id, right_name, similarity, diff_count, compared_at FROM comparison_history";

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

/// Flatten a JSON value into dotted-path -> scalar/array map, preserving
/// key insertion order (matches the TS `flatten`: recurse only into plain
/// non-array objects; arrays and scalars are leaves). Mirrors these cases:
///  - null/undefined  -> {}
///  - non-object      -> { prefix: obj }
///  - object          -> recurse each own key
///
/// The returned Vec keeps first-seen order so the diff field ordering matches
/// JS object key iteration order exactly.
fn flatten(obj: &Value, prefix: &str, out: &mut Vec<(String, Value)>) {
    match obj {
        // null/undefined -> contributes nothing
        Value::Null => {}
        // Non-object (string/number/bool) and arrays (Array is not recursed in
        // the TS: `typeof obj !== 'object'` is false for arrays, but the per-key
        // branch treats arrays as leaves via `!Array.isArray`). The top-level
        // `typeof obj !== 'object'` guard only fires for true scalars; arrays
        // passed at the top recurse over numeric indices in JS. Reproduce that.
        Value::Bool(_) | Value::Number(_) | Value::String(_) => {
            out.push((prefix.to_string(), obj.clone()));
        }
        Value::Array(arr) => {
            // typeof [] === 'object' in JS, so the top guard is skipped and the
            // loop runs over Object.keys([]) = numeric string indices.
            for (i, val) in arr.iter().enumerate() {
                let full_key = if prefix.is_empty() {
                    i.to_string()
                } else {
                    format!("{}.{}", prefix, i)
                };
                // Per-key rule: recurse only into plain non-array objects;
                // everything else (scalars AND arrays) is a leaf.
                if val.is_object() {
                    flatten(val, &full_key, out);
                } else {
                    push_unique(out, full_key, val.clone());
                }
            }
        }
        Value::Object(map) => {
            for (key, val) in map {
                let full_key = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{}.{}", prefix, key)
                };
                if val.is_object() {
                    flatten(val, &full_key, out);
                } else {
                    push_unique(out, full_key, val.clone());
                }
            }
        }
    }
}

/// JS object assignment semantics: a repeated key overwrites the existing value
/// but keeps its original position. (serde_json::Map already de-dups object
/// keys, so this only matters for array index collisions; kept for fidelity.)
fn push_unique(out: &mut Vec<(String, Value)>, key: String, val: Value) {
    if let Some(slot) = out.iter_mut().find(|(k, _)| *k == key) {
        slot.1 = val;
    } else {
        out.push((key, val));
    }
}

/// Look up a key in the flattened insertion-ordered list.
fn flat_get<'a>(flat: &'a [(String, Value)], key: &str) -> Option<&'a Value> {
    flat.iter().find(|(k, _)| k == key).map(|(_, v)| v)
}

/// JSON.stringify(a) === JSON.stringify(b) equality used by the TS for the
/// same/different decision. serde_json's Value PartialEq compares structurally,
/// which matches stringify equality for the scalar/array leaves flatten yields
/// (objects never reach here — they are always recursed into).
fn json_eq(a: &Value, b: &Value) -> bool {
    a == b
}

/// Status sort rank (matches the TS `order` map; default 0 for any unknown).
fn status_rank(status: &str) -> i32 {
    match status {
        "different" => 0,
        "left-only" => 1,
        "right-only" => 2,
        "same" => 3,
        _ => 0,
    }
}

/// Core comparison: flatten both sides, diff every key (left keys first, then
/// right-only keys — matching `new Set([...left, ...right])` order), compute
/// similarity, persist to comparison_history, and return the ComparisonResult
/// (camelCase leftProject/rightProject, camelCase diff fields, snake_case
/// compared_at). Mirrors ProjectComparisonManager.compare exactly.
#[allow(clippy::too_many_arguments)]
fn compare(
    conn: &Connection,
    app: &str,
    left_id: &str,
    left_name: &str,
    left_data: &Value,
    right_id: &str,
    right_name: &str,
    right_data: &Value,
) -> Value {
    let mut left_flat: Vec<(String, Value)> = Vec::new();
    flatten(left_data, "", &mut left_flat);
    let mut right_flat: Vec<(String, Value)> = Vec::new();
    flatten(right_data, "", &mut right_flat);

    // all_keys = Set([...leftKeys, ...rightKeys]): left order first, then any
    // right-only keys in their first-seen order.
    let mut all_keys: Vec<String> = Vec::new();
    for (k, _) in &left_flat {
        if !all_keys.iter().any(|x| x == k) {
            all_keys.push(k.clone());
        }
    }
    for (k, _) in &right_flat {
        if !all_keys.iter().any(|x| x == k) {
            all_keys.push(k.clone());
        }
    }

    let mut diffs: Vec<Value> = Vec::new();
    let mut same_count: i64 = 0;

    for key in &all_keys {
        let left = flat_get(&left_flat, key);
        let right = flat_get(&right_flat, key);
        match (left, right) {
            (Some(lv), Some(rv)) => {
                let is_same = json_eq(lv, rv);
                if is_same {
                    same_count += 1;
                }
                diffs.push(json!({
                    "field": key,
                    "leftValue": lv,
                    "rightValue": rv,
                    "status": if is_same { "same" } else { "different" },
                }));
            }
            (Some(lv), None) => {
                diffs.push(json!({
                    "field": key,
                    "leftValue": lv,
                    "rightValue": Value::Null,
                    "status": "left-only",
                }));
            }
            (None, Some(rv)) => {
                diffs.push(json!({
                    "field": key,
                    "leftValue": Value::Null,
                    "rightValue": rv,
                    "status": "right-only",
                }));
            }
            (None, None) => {}
        }
    }

    // Stable sort by status rank (matches Array.prototype.sort, which is stable
    // in modern V8, preserving the insertion order above within each status).
    diffs.sort_by(|a, b| {
        let ra = status_rank(a.get("status").and_then(|v| v.as_str()).unwrap_or(""));
        let rb = status_rank(b.get("status").and_then(|v| v.as_str()).unwrap_or(""));
        ra.cmp(&rb)
    });

    // similarity = allKeys.size > 0 ? round(same/size*100) : 100
    let size = all_keys.len() as i64;
    let similarity: i64 = if size > 0 {
        (((same_count as f64) / (size as f64)) * 100.0).round() as i64
    } else {
        100
    };

    // diff_count = diffs where status !== 'same'
    let diff_count = diffs
        .iter()
        .filter(|d| d.get("status").and_then(|v| v.as_str()) != Some("same"))
        .count() as i64;

    let _ = conn.execute(
        "INSERT INTO comparison_history (app, left_id, left_name, right_id, right_name, similarity, diff_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![app, left_id, left_name, right_id, right_name, similarity, diff_count],
    );

    json!({
        "leftProject": { "app": app, "id": left_id, "name": left_name },
        "rightProject": { "app": app, "id": right_id, "name": right_name },
        "diffs": diffs,
        "similarity": similarity,
        "compared_at": now_iso(),
    })
}

/// `new Date().toISOString()` equivalent: UTC, millisecond precision, trailing
/// 'Z'. Computed from the system clock without pulling in chrono (rusqlite +
/// serde_json only). Format: YYYY-MM-DDTHH:MM:SS.mmmZ.
fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs() as i64;
    let millis = dur.subsec_millis();

    let days = secs.div_euclid(86_400);
    let secs_of_day = secs.rem_euclid(86_400);
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    // Civil-from-days algorithm (Howard Hinnant), epoch 1970-01-01.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, minute, second, millis
    )
}

/// compareVersions -> compareFromVersionHistory(app, leftId, rightId): pull the
/// latest version_history row for each id, JSON.parse its `data`, and run
/// `compare`. Returns null when the DB read fails (e.g. version_history table
/// absent) or either row is missing — matching the TS try/catch + null guards.
/// A `data` value that fails to parse degrades to {} (TS catches and warns).
fn compare_versions(conn: &Connection, app: &str, left_id: &str, right_id: &str) -> Value {
    let fetch = |id: &str| -> Option<(String, String)> {
        conn.query_row(
            "SELECT project_name, data FROM version_history WHERE app = ? AND id = ? ORDER BY created_at DESC LIMIT 1",
            params![app, id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .ok()
    };

    let left_row = match fetch(left_id) {
        Some(r) => r,
        None => return Value::Null,
    };
    let right_row = match fetch(right_id) {
        Some(r) => r,
        None => return Value::Null,
    };

    let left_data = serde_json::from_str::<Value>(&left_row.1).unwrap_or_else(|_| json!({}));
    let right_data = serde_json::from_str::<Value>(&right_row.1).unwrap_or_else(|_| json!({}));

    compare(
        conn,
        app,
        left_id,
        &left_row.0,
        &left_data,
        right_id,
        &right_row.0,
        &right_data,
    )
}

/// getHistory(app?, limit=50): raw `SELECT *` rows (snake_case) ordered by
/// compared_at DESC. When `app` is provided, filters on it.
fn get_history(conn: &Connection, app: Option<&str>, limit: i64) -> Value {
    match app {
        Some(a) => query_list(
            conn,
            &format!("{} WHERE app = ? ORDER BY compared_at DESC LIMIT ?", SELECT_ALL),
            vec![SqlValue::Text(a.to_string()), SqlValue::Integer(limit)],
        ),
        None => query_list(
            conn,
            &format!("{} ORDER BY compared_at DESC LIMIT ?", SELECT_ALL),
            vec![SqlValue::Integer(limit)],
        ),
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "project-comparison:compare" => {
            let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let left_data = args.get(3).cloned().unwrap_or(Value::Null);
            let right_data = args.get(6).cloned().unwrap_or(Value::Null);
            compare(
                conn,
                &s(0),
                &s(1),
                &s(2),
                &left_data,
                &s(4),
                &s(5),
                &right_data,
            )
        }
        "project-comparison:compareVersions" => {
            let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
            compare_versions(conn, &s(0), &s(1), &s(2))
        }
        "project-comparison:getHistory" => {
            // app is optional; limit defaults to 50 (TS default param).
            let app = args.get(0).and_then(|v| v.as_str());
            let limit = args.get(1).and_then(|v| v.as_i64()).unwrap_or(50);
            get_history(conn, app, limit)
        }
        _ => Value::Null,
    }
}
