// =============================================================================
// DEX 6.0 — Workflows store (native backing for the Workflows app)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed persistence for saved automations, replacing the renderer's
//! `localStorage['dex-workflows']` fallback. Contract matches the Workflows app:
//!   workflows:getAll          -> Workflow[]            (newest first)
//!   workflows:save  (workflow)-> { success }           (upsert by id)
//!   workflows:delete (id)     -> { success }
//!
//! A workflow is stored losslessly as its full JSON object in a `data` column
//! (the app's shape carries nodes/connections/lastRun), with `id` + `updated_at`
//! promoted for upsert + ordering — the same pattern as uki_chat's data column.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );",
    );
}

/// getAll() -> Workflow[] (full objects, newest first). Returns `[]` on any error
/// so the renderer degrades to its localStorage fallback rather than breaking.
fn get_all(conn: &Connection) -> Value {
    let mut stmt = match conn.prepare("SELECT data FROM workflows ORDER BY updated_at DESC") {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([], |r| r.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows
        .filter_map(|r| r.ok())
        .filter_map(|s| serde_json::from_str::<Value>(&s).ok())
        .collect();
    json!(out)
}

/// save(workflow) -> upsert by the workflow's own `id`. Stores the full object.
fn save(conn: &Connection, wf: &Value) -> Value {
    let id = wf.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if id.is_empty() {
        return json!({ "success": false, "error": "workflow missing id" });
    }
    let res = conn.execute(
        "INSERT INTO workflows (id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        params![id, wf.to_string(), now_ms()],
    );
    match res {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn delete(conn: &Connection, id: &str) -> Value {
    let _ = conn.execute("DELETE FROM workflows WHERE id = ?", params![id]);
    json!({ "success": true })
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "workflows:getAll" => get_all(conn),
        "workflows:save" => save(conn, &args.get(0).cloned().unwrap_or(Value::Null)),
        "workflows:delete" => delete(conn, args.get(0).and_then(|v| v.as_str()).unwrap_or("")),
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crud_round_trip_is_lossless() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn);
        // Empty store -> [].
        assert_eq!(get_all(&conn), json!([]));

        // Save two; full objects round-trip (nodes/steps preserved).
        assert_eq!(save(&conn, &json!({ "id": "a", "name": "Alpha", "steps": 3, "nodes": [1, 2] }))["success"], json!(true));
        assert_eq!(save(&conn, &json!({ "id": "b", "name": "Beta", "steps": 1 }))["success"], json!(true));
        let arr = get_all(&conn);
        let list = arr.as_array().unwrap();
        assert_eq!(list.len(), 2);
        let names: Vec<&str> = list.iter().filter_map(|w| w.get("name").and_then(|v| v.as_str())).collect();
        assert!(names.contains(&"Alpha") && names.contains(&"Beta"));

        // Upsert by id: count stays 2 and fields update losslessly.
        save(&conn, &json!({ "id": "a", "name": "Alpha2", "steps": 5, "nodes": [9] }));
        let after = get_all(&conn);
        let list2 = after.as_array().unwrap();
        assert_eq!(list2.len(), 2);
        let a = list2.iter().find(|w| w.get("id").and_then(|v| v.as_str()) == Some("a")).unwrap();
        assert_eq!(a.get("name").and_then(|v| v.as_str()), Some("Alpha2"));
        assert_eq!(a.get("steps").and_then(|v| v.as_i64()), Some(5));
        assert_eq!(a.get("nodes").and_then(|v| v.as_array()).map(|n| n.len()), Some(1));

        // Delete by id.
        delete(&conn, "a");
        let after_del = get_all(&conn);
        assert_eq!(after_del.as_array().unwrap().len(), 1);
        assert_eq!(after_del.as_array().unwrap()[0].get("id").and_then(|v| v.as_str()), Some("b"));

        // A workflow with no id is rejected (never silently inserted).
        assert_eq!(save(&conn, &json!({ "name": "no-id" }))["success"], json!(false));
    }
}
