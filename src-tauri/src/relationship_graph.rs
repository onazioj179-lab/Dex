// =============================================================================
// DEX 6.0 — Relationship Graph (Tauri port of src/main/core/RelationshipGraphManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed relationship graph (relationship-graph:* channels), reading/
//! writing the shared `dex.db` `graph_cache` + `graph_node_positions` tables with
//! the identical schema, queries, and return shapes as the Electron manager
//! (Feature 4). `compute` pre-computes nodes (apps/projects/tasks/media) and edges
//! (project links + dependencies) by reading other subsystems' tables
//! (`project_links`, `dependencies`, `color_labels`, `media_library`); those reads
//! are wrapped exactly like the TS try/catch so a missing table degrades to an
//! empty contribution rather than failing. The graph-building logic is pure over
//! the stored rows, so it is reproduced natively here.
//!
//! `setTier` mutates an in-memory capability tier on the Electron manager
//! instance. The dispatcher here is stateless (it only receives a borrowed
//! `Connection`), so there is no instance to mutate across calls; `setTier`
//! degrades honestly (returns `{ success: true }` as the void TS handler would,
//! but does not retain the value), and `compute` uses the manager's default tier
//! of 2 (maxNodes = 10000), matching the default Electron behavior before any
//! setTier call. This is documented rather than faked.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

/// The default capability tier (matches `capabilityTier = 2` field default).
/// Tier <= 1 caps the graph at 200 nodes; otherwise 10000.
const DEFAULT_TIER: i64 = 2;

/// The seed app nodes added first, in order (matches the `apps` array in the TS).
const SEED_APPS: &[&str] = &[
    "vinx", "notes", "tasks", "kanban", "prism", "flux", "forge", "imosion", "calendar",
];

/// Create the graph_cache + graph_node_positions tables (matches createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS graph_cache (
            id INTEGER PRIMARY KEY DEFAULT 1,
            data TEXT NOT NULL,
            computed_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS graph_node_positions (
            node_id TEXT PRIMARY KEY,
            x REAL NOT NULL,
            y REAL NOT NULL,
            updated_at INTEGER NOT NULL
        );",
    );
    // The compute pass also reads project_links, dependencies, color_labels, and
    // media_library, but those tables are owned + created by their own modules;
    // the TS wraps the reads in try/catch and degrades when a table is absent, so
    // we do NOT re-create them here.
}

/// Current epoch milliseconds (matches `Date.now()`).
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Look up a saved position for `node_id` -> (x, y) as JSON numbers or null each,
/// matching `pos?.x ?? null` / `pos?.y ?? null`.
fn lookup_position(conn: &Connection, node_id: &str) -> (Value, Value) {
    match conn.query_row(
        "SELECT x, y FROM graph_node_positions WHERE node_id = ?",
        params![node_id],
        |r| Ok((r.get::<_, f64>(0)?, r.get::<_, f64>(1)?)),
    ) {
        Ok((x, y)) => (json!(x), json!(y)),
        Err(_) => (Value::Null, Value::Null),
    }
}

/// Reproduces RelationshipGraphManager.computeGraph(): build nodes + edges from
/// the stored rows, persist to graph_cache, return the GraphData shape.
fn compute_graph(conn: &Connection) -> Value {
    // maxNodes = capabilityTier <= 1 ? 200 : 10000 (default tier is 2).
    let max_nodes: usize = if DEFAULT_TIER <= 1 { 200 } else { 10000 };

    let mut nodes: Vec<Value> = Vec::new();
    let mut edges: Vec<Value> = Vec::new();
    // Preserve insertion order + dedupe by id (matches the JS Map semantics).
    let mut node_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    // addNode closure equivalent: skip if already present or at the node cap.
    macro_rules! add_node {
        ($id:expr, $ty:expr, $label:expr, $app:expr, $usage:expr) => {{
            let id: String = $id;
            if !node_ids.contains(&id) && node_ids.len() < max_nodes {
                let (x, y) = lookup_position(conn, &id);
                nodes.push(json!({
                    "id": id,
                    "type": $ty,
                    "label": $label,
                    "app": $app,
                    "usage": $usage,
                    "x": x,
                    "y": y,
                }));
                node_ids.insert(id);
            }
        }};
    }

    // Seed app nodes (usage 50). type "app", label/app = the app name.
    for app_name in SEED_APPS {
        add_node!(
            format!("app:{}", app_name),
            "app",
            (*app_name).to_string(),
            (*app_name).to_string(),
            50
        );
    }

    // project_links -> project nodes + project-link edges. Wrapped like the TS
    // try/catch: a missing table or read error simply contributes nothing.
    let links: Vec<(i64, String, String, String, String)> = {
        let mut out = Vec::new();
        if let Ok(mut stmt) = conn
            .prepare("SELECT id, source_app, source_id, target_app, target_id FROM project_links")
        {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            }) {
                out = rows.filter_map(|r| r.ok()).collect();
            }
        }
        out
    };
    for (id, source_app, source_id, target_app, target_id) in &links {
        let src_id = format!("project:{}:{}", source_app, source_id);
        let tgt_id = format!("project:{}:{}", target_app, target_id);
        add_node!(src_id.clone(), "project", source_id.clone(), source_app.clone(), 10);
        add_node!(tgt_id.clone(), "project", target_id.clone(), target_app.clone(), 10);
        edges.push(json!({
            "id": format!("link:{}", id),
            "source": src_id,
            "target": tgt_id,
            "type": "project-link",
            "weight": 2,
        }));
    }

    // dependencies -> task/project nodes + task-dependency edges.
    let deps: Vec<(
        i64,
        String,
        String,
        String,
        String,
        String,
        String,
    )> = {
        let mut out = Vec::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, blocker_type, blocker_app, blocker_id, blocked_type, blocked_app, blocked_id FROM dependencies",
        ) {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                ))
            }) {
                out = rows.filter_map(|r| r.ok()).collect();
            }
        }
        out
    };
    for (id, blocker_type, blocker_app, blocker_id, blocked_type, blocked_app, blocked_id) in &deps {
        let blocker_node_id = format!("{}:{}:{}", blocker_type, blocker_app, blocker_id);
        let blocked_node_id = format!("{}:{}:{}", blocked_type, blocked_app, blocked_id);
        let blocker_ty = if blocker_type == "task" { "task" } else { "project" };
        let blocked_ty = if blocked_type == "task" { "task" } else { "project" };
        add_node!(blocker_node_id.clone(), blocker_ty, blocker_id.clone(), blocker_app.clone(), 5);
        add_node!(blocked_node_id.clone(), blocked_ty, blocked_id.clone(), blocked_app.clone(), 5);
        edges.push(json!({
            "id": format!("dep:{}", id),
            "source": blocker_node_id,
            "target": blocked_node_id,
            "type": "task-dependency",
            "weight": 3,
        }));
    }

    // color_labels -> distinct task/project nodes (no edges).
    let color_labels: Vec<(String, String, String)> = {
        let mut out = Vec::new();
        if let Ok(mut stmt) =
            conn.prepare("SELECT DISTINCT item_id, app, item_type FROM color_labels")
        {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?, // item_id
                    r.get::<_, String>(1)?, // app
                    r.get::<_, String>(2)?, // item_type
                ))
            }) {
                out = rows.filter_map(|r| r.ok()).collect();
            }
        }
        out
    };
    for (item_id, app, item_type) in &color_labels {
        let node_id = format!("{}:{}:{}", item_type, app, item_id);
        let ty = if item_type == "task" { "task" } else { "project" };
        add_node!(node_id, ty, item_id.clone(), app.clone(), 3);
    }

    // media_library -> media nodes (top 100 by use_count). usage = use_count || 1.
    // The TS SELECT lists `id, filename, type` but the loop reads `m.use_count`;
    // better-sqlite3 `.all()` returns full named rows so use_count is present and
    // ordering is by use_count DESC. We select the columns the loop actually uses
    // (id, filename, use_count) to preserve that behavior faithfully.
    let media_items: Vec<(i64, String, i64)> = {
        let mut out = Vec::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, filename, use_count FROM media_library ORDER BY use_count DESC LIMIT 100",
        ) {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,                       // id
                    r.get::<_, String>(1)?,                    // filename
                    r.get::<_, Option<i64>>(2)?.unwrap_or(0),  // use_count (nullable)
                ))
            }) {
                out = rows.filter_map(|r| r.ok()).collect();
            }
        }
        out
    };
    for (id, filename, use_count) in &media_items {
        // usage = m.use_count || 1 (0/null -> 1).
        let usage = if *use_count != 0 { *use_count } else { 1 };
        add_node!(format!("media:{}", id), "media", filename.clone(), "media".to_string(), usage);
    }

    let computed_at = now_ms();
    let graph_data = json!({
        "nodes": nodes,
        "edges": edges,
        "computed_at": computed_at,
    });

    // Persist to graph_cache (id = 1 upsert). Non-critical: ignore errors.
    if let Ok(serialized) = serde_json::to_string(&graph_data) {
        let _ = conn.execute(
            "INSERT INTO graph_cache (id, data, computed_at) VALUES (1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET data = ?, computed_at = ?",
            params![serialized, computed_at, serialized, computed_at],
        );
    }

    graph_data
}

/// Reproduces getCachedGraph(): parse and return the cached GraphData, or null.
fn get_cached_graph(conn: &Connection) -> Value {
    let row: Result<String, _> = conn.query_row(
        "SELECT data, computed_at FROM graph_cache WHERE id = 1",
        [],
        |r| r.get::<_, String>(0),
    );
    match row {
        Ok(data) => serde_json::from_str::<Value>(&data).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

/// saveNodePosition(nodeId, x, y) — upsert the position. Void in Electron.
fn save_node_position(conn: &Connection, args: &Value) {
    let node_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let x = args.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let y = args.get(2).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let updated_at = now_ms();
    let _ = conn.execute(
        "INSERT INTO graph_node_positions (node_id, x, y, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(node_id) DO UPDATE SET x = ?, y = ?, updated_at = ?",
        params![node_id, x, y, updated_at, x, y, updated_at],
    );
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "relationship-graph:compute" => compute_graph(conn),
        "relationship-graph:getCached" => get_cached_graph(conn),
        // saveNodePosition is a void TS handler -> { success: true }.
        "relationship-graph:saveNodePosition" => {
            save_node_position(conn, args);
            json!({ "success": true })
        }
        // setTier mutates in-memory capability tier on the Electron manager
        // instance; this stateless dispatcher has no instance to retain it on, so
        // the value cannot persist across calls. The void TS handler returns
        // undefined (-> { success: true } here); compute() uses the default tier
        // of 2. Degraded honestly: the call succeeds but the tier is not stored.
        "relationship-graph:setTier" => json!({ "success": true }),
        _ => Value::Null,
    }
}
