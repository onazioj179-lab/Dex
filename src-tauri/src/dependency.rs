// =============================================================================
// DEX 6.0 — Dependency Manager (Tauri port of src/main/core/DependencyManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed project dependency tracker (dependencies:* channels), reading/
//! writing the shared `dex.db` `dependencies` table with the identical schema,
//! queries, and return shapes as the Electron manager (Feature 30). This is the
//! project/data "dependencies" manager (relationships between items, e.g.
//! source -> target with a dep_type), NOT npm/package installation or process
//! spawning — so it is a pure DB module and every handler is ported faithfully.
//! It supports circular-dependency detection (BFS) and dependency-chain
//! enumeration (DFS), mirroring the TS algorithms exactly. The `add` handler in
//! Electron also emits a `dependency-added` event on the event bus — an internal
//! side effect, not part of the IPC return value, so it is not replicated here.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::collections::HashSet;

/// The 4 valid dependency types (matches DEP_TYPES in the TS, in order).
const DEP_TYPES: [&str; 4] = ["blocks", "requires", "includes", "extends"];

/// Create the dependencies table + indexes (matches DependencyManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_name TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL,
            target_name TEXT NOT NULL DEFAULT '',
            dep_type TEXT NOT NULL DEFAULT 'requires',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(app, source_id, target_id, dep_type)
        );
        CREATE INDEX IF NOT EXISTS idx_dep_source ON dependencies(app, source_id);
        CREATE INDEX IF NOT EXISTS idx_dep_target ON dependencies(app, target_id);",
    );
}

/// One row -> the Dependency shape (snake_case keys, exactly as `SELECT *`
/// returned it under Electron; column order matches the table definition above).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "source_id": row.get::<_, String>(2)?,
        "source_name": row.get::<_, String>(3)?,
        "target_id": row.get::<_, String>(4)?,
        "target_name": row.get::<_, String>(5)?,
        "dep_type": row.get::<_, String>(6)?,
        "created_at": row.get::<_, String>(7)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, app, source_id, source_name, target_id, target_name, dep_type, created_at FROM dependencies";

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

/// BFS from `new_target_id` to see whether `source_id` is reachable, i.e.
/// whether adding source -> new_target would create a cycle. Mirrors the TS
/// `wouldCreateCircle` exactly, including the 500-node safety cap.
fn would_create_circle(conn: &Connection, app: &str, source_id: &str, new_target_id: &str) -> bool {
    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: Vec<String> = vec![new_target_id.to_string()];
    // queue.shift() pops the front; emulate with an index cursor for O(1) reads.
    let mut head = 0usize;

    while head < queue.len() {
        let current = queue[head].clone();
        head += 1;

        if current == source_id {
            return true;
        }
        if visited.contains(&current) {
            continue;
        }
        visited.insert(current.clone());

        // Read out-edges (target_id) for `current`; bind before iterating.
        let mut stmt = match conn
            .prepare("SELECT target_id FROM dependencies WHERE app = ? AND source_id = ?")
        {
            Ok(s) => s,
            Err(_) => return false,
        };
        let mapped = match stmt.query_map(params![app, current], |r| r.get::<_, String>(0)) {
            Ok(r) => r,
            Err(_) => return false,
        };
        let targets: Vec<String> = mapped.filter_map(|r| r.ok()).collect();
        drop(stmt);

        for t in targets {
            if !visited.contains(&t) {
                queue.push(t);
            }
        }

        // Safety: don't traverse more than 500 nodes.
        if visited.len() > 500 {
            break;
        }
    }

    false
}

/// dependencies:add -> addDependency(app, sourceId, sourceName, targetId,
/// targetName, depType='requires'). Returns { success, circular?, dependency? }
/// where `dependency` is the raw inserted row (snake_case). Self-reference,
/// circular, and duplicate cases all return { success: false } (with
/// circular: true added in the cycle case), matching the TS verbatim.
fn add_dependency(conn: &Connection, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("");
    let app = s(0);
    let source_id = s(1);
    let source_name = s(2);
    let target_id = s(3);
    let target_name = s(4);
    // depType defaults to 'requires' when omitted (TS default param).
    let raw_type = args.get(5).and_then(|v| v.as_str()).unwrap_or("requires");

    if source_id == target_id {
        return json!({ "success": false });
    }

    // valid_type = DEP_TYPES.includes(depType) ? depType : 'requires'
    let valid_type = if DEP_TYPES.contains(&raw_type) {
        raw_type
    } else {
        "requires"
    };

    // Check for circular dependency.
    if would_create_circle(conn, app, source_id, target_id) {
        return json!({ "success": false, "circular": true });
    }

    // Check for duplicate.
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM dependencies WHERE app = ? AND source_id = ? AND target_id = ? AND dep_type = ?",
            params![app, source_id, target_id, valid_type],
            |r| r.get(0),
        )
        .ok();
    if existing.is_some() {
        return json!({ "success": false });
    }

    if conn
        .execute(
            "INSERT INTO dependencies (app, source_id, source_name, target_id, target_name, dep_type)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![app, source_id, source_name, target_id, target_name, valid_type],
        )
        .is_err()
    {
        // The DB write failed; mirror a non-success result rather than fabricate.
        return json!({ "success": false });
    }

    let id = conn.last_insert_rowid();
    let sql = format!("{} WHERE id = ?", SELECT_ALL);
    let dep = conn
        .query_row(&sql, params![id], row_to_json)
        .unwrap_or(Value::Null);

    // Electron also emits `dependency-added` on the event bus here; that is an
    // internal side effect, not part of the IPC return value (not ported).
    json!({ "success": true, "dependency": dep })
}

/// dependencies:remove -> removeDependency(id). Returns boolean (changes > 0).
fn remove_dependency(conn: &Connection, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(-1);
    let changes = conn
        .execute("DELETE FROM dependencies WHERE id = ?", params![id])
        .unwrap_or(0);
    json!(changes > 0)
}

/// dependencies:getChain -> getChain(app, sourceId). DFS enumerating every path
/// from sourceId to a leaf, returning string[][]. Mirrors the TS recursion
/// (visited set with backtracking; a node with no out-edges terminates a chain).
fn get_chain(conn: &Connection, app: &str, source_id: &str) -> Value {
    let mut chains: Vec<Vec<String>> = Vec::new();
    let mut visited: HashSet<String> = HashSet::new();
    let mut path: Vec<String> = Vec::new();
    dfs_chain(conn, app, source_id, &mut visited, &mut path, &mut chains);
    json!(chains)
}

fn dfs_chain(
    conn: &Connection,
    app: &str,
    current: &str,
    visited: &mut HashSet<String>,
    path: &mut Vec<String>,
    chains: &mut Vec<Vec<String>>,
) {
    if visited.contains(current) {
        return;
    }
    visited.insert(current.to_string());
    path.push(current.to_string());

    // Read out-edges (target_id) for `current`; bind before iterating.
    let targets: Vec<String> = {
        let mut stmt = match conn
            .prepare("SELECT target_id FROM dependencies WHERE app = ? AND source_id = ?")
        {
            Ok(s) => s,
            Err(_) => {
                path.pop();
                visited.remove(current);
                return;
            }
        };
        let mapped = match stmt.query_map(params![app, current], |r| r.get::<_, String>(0)) {
            Ok(r) => r.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        };
        mapped
    };

    if targets.is_empty() {
        chains.push(path.clone());
    } else {
        for t in targets {
            dfs_chain(conn, app, &t, visited, path, chains);
        }
    }

    path.pop();
    visited.remove(current);
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "dependencies:add" => add_dependency(conn, args),
        "dependencies:remove" => remove_dependency(conn, args),
        "dependencies:get" => query_list(
            conn,
            &format!("{} WHERE app = ? AND source_id = ? ORDER BY created_at ASC", SELECT_ALL),
            vec![SqlValue::Text(s(0)), SqlValue::Text(s(1))],
        ),
        "dependencies:getDependents" => query_list(
            conn,
            &format!("{} WHERE app = ? AND target_id = ? ORDER BY created_at ASC", SELECT_ALL),
            vec![SqlValue::Text(s(0)), SqlValue::Text(s(1))],
        ),
        "dependencies:getAll" => query_list(
            conn,
            &format!("{} WHERE app = ? ORDER BY created_at ASC", SELECT_ALL),
            vec![SqlValue::Text(s(0))],
        ),
        "dependencies:getChain" => get_chain(conn, &s(0), &s(1)),
        // getTypes returns the static DEP_TYPES list (string[]), not DB-backed
        // but faithfully ported (no degradation needed).
        "dependencies:getTypes" => json!(DEP_TYPES.to_vec()),
        _ => Value::Null,
    }
}
