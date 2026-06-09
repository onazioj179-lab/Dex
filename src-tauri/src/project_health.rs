// =============================================================================
// DEX 6.0 — Project Health (Tauri port of src/main/core/ProjectHealthManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed project health scoring (project-health:* channels), reading/
//! writing the shared `dex.db` `project_health` table with the identical schema,
//! queries, and return shapes as the Electron manager (Feature 8). The health
//! score computation over a supplied context is pure arithmetic and is ported
//! verbatim; the result is upserted and the in-memory ProjectHealth object is
//! returned (with id 0), exactly as the TS does. The `initialize`/BrowserWindow
//! wiring is an Electron-internal concern, not an IPC channel.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the project_health table + indexes (matches createTables verbatim).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS project_health (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 100,
            status TEXT NOT NULL DEFAULT 'healthy',
            signals TEXT NOT NULL DEFAULT '[]',
            computed_at INTEGER NOT NULL,
            UNIQUE(app, project_id)
        );
        CREATE INDEX IF NOT EXISTS idx_project_health_app ON project_health(app);
        CREATE INDEX IF NOT EXISTS idx_project_health_status ON project_health(status);",
    );
}

/// One row -> the ProjectHealth shape (snake_case keys, exactly as `SELECT *`
/// returned it under Electron, with `signals` JSON-parsed from its TEXT column).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let signals_text: String = row.get::<_, String>(6)?;
    let signals = serde_json::from_str::<Value>(&signals_text).unwrap_or_else(|_| json!([]));
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "project_id": row.get::<_, String>(2)?,
        "project_name": row.get::<_, String>(3)?,
        "score": row.get::<_, i64>(4)?,
        "status": row.get::<_, String>(5)?,
        "signals": signals,
        "computed_at": row.get::<_, i64>(7)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, app, project_id, project_name, score, status, signals, computed_at FROM project_health";

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

/// Current epoch milliseconds (the TS uses Date.now()).
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// project-health:compute -> computeHealth(app, projectId, projectName, context).
/// Pure score computation over the supplied context, identical to the TS:
/// builds the signals list + score, upserts the row, and returns the in-memory
/// ProjectHealth object (id is 0, matching the TS which returns before reading
/// back the autoincrement id).
fn compute_health(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let project_name = args.get(2).and_then(|v| v.as_str()).unwrap_or("").to_string();
    // context defaults to {} when the renderer omits it (TS default param `= {}`).
    let context = args.get(3).cloned().unwrap_or_else(|| json!({}));

    let mut signals: Vec<Value> = Vec::new();
    let mut score: i64 = 100;
    let now = now_ms();
    let day_ms: i64 = 86400000;

    // context.lastModified (number, ms). `if (context.lastModified)` is falsy for
    // 0/undefined, so we only act on a present, non-zero number.
    if let Some(last_modified) = context
        .get("lastModified")
        .and_then(|v| v.as_i64())
        .filter(|&v| v != 0)
    {
        // Math.floor((now - lastModified) / dayMs) — integer floor toward -inf.
        let days_since_modified = ((now - last_modified) as f64 / day_ms as f64).floor() as i64;
        if days_since_modified > 14 {
            // Math.min(30, (daysSinceModified - 14) * 2)
            let penalty = std::cmp::min(30, (days_since_modified - 14) * 2);
            score -= penalty;
            signals.push(json!({
                "name": "stale",
                "impact": -penalty,
                "description": format!("Not modified in {} days", days_since_modified),
            }));
        }
    }

    // context.completionPct !== undefined && < 50. Distinguish "absent" from 0.
    if let Some(completion_pct) = context.get("completionPct").and_then(|v| v.as_f64()) {
        if completion_pct < 50.0 {
            // Math.floor((50 - completionPct) / 5)
            let penalty = ((50.0 - completion_pct) / 5.0).floor() as i64;
            score -= penalty;
            // Renders completionPct the way JS string-coerces the number.
            signals.push(json!({
                "name": "low-completion",
                "impact": -penalty,
                "description": format!("Completion at {}%", num_to_string(&context["completionPct"])),
            }));
        }
    }

    if context.get("hasOverdueTasks").map(is_truthy).unwrap_or(false) {
        score -= 15;
        signals.push(json!({
            "name": "overdue-tasks",
            "impact": -15,
            "description": "Has overdue linked tasks",
        }));
    }

    if context.get("hasUnsavedChanges").map(is_truthy).unwrap_or(false) {
        score -= 10;
        signals.push(json!({
            "name": "unsaved-changes",
            "impact": -10,
            "description": "Unsaved changes older than 24 hours",
        }));
    }

    if context.get("linkedBlockedProject").map(is_truthy).unwrap_or(false) {
        score -= 10;
        signals.push(json!({
            "name": "blocked-link",
            "impact": -10,
            "description": "A linked project is blocked",
        }));
    }

    // context.isVinx && !context.recentExport
    let is_vinx = context.get("isVinx").map(is_truthy).unwrap_or(false);
    let recent_export = context.get("recentExport").map(is_truthy).unwrap_or(false);
    if is_vinx && !recent_export {
        score -= 10;
        signals.push(json!({
            "name": "no-export",
            "impact": -10,
            "description": "Vinx project not exported recently",
        }));
    }

    // Math.max(0, Math.min(100, score))
    score = score.clamp(0, 100);
    // score > 75 ? 'healthy' : score >= 50 ? 'needs-attention' : 'at-risk'
    let status = if score > 75 {
        "healthy"
    } else if score >= 50 {
        "needs-attention"
    } else {
        "at-risk"
    };

    // saveHealth: upsert by (app, project_id). Mirrors the TS INSERT ... ON CONFLICT.
    let signals_json = Value::Array(signals.clone()).to_string();
    let _ = conn.execute(
        "INSERT INTO project_health (app, project_id, project_name, score, status, signals, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(app, project_id) DO UPDATE SET
           project_name = ?, score = ?, status = ?, signals = ?, computed_at = ?",
        params![
            app, project_id, project_name, score, status, signals_json, now,
            project_name, score, status, signals_json, now
        ],
    );

    // Return the in-memory ProjectHealth object (id: 0), exactly as the TS does.
    json!({
        "id": 0,
        "app": app,
        "project_id": project_id,
        "project_name": project_name,
        "score": score,
        "status": status,
        "signals": signals,
        "computed_at": now,
    })
}

/// JS truthiness for a context flag (true / non-zero number / non-empty string).
fn is_truthy(val: &Value) -> bool {
    match val {
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        Value::String(s) => !s.is_empty(),
        Value::Null => false,
        // Objects/arrays are truthy in JS.
        _ => true,
    }
}

/// String-coerce a JSON number the way JS does for template interpolation
/// (integers print without a trailing ".0").
fn num_to_string(val: &Value) -> String {
    match val {
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        _ => String::new(),
    }
}

/// project-health:get -> getHealth(app, projectId). The single matching row with
/// signals parsed, or null when absent.
fn get_health(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let sql = format!("{} WHERE app = ? AND project_id = ?", SELECT_ALL);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![app, project_id], row_to_json) {
        Ok(v) => v,
        Err(_) => Value::Null,
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "project-health:compute" => compute_health(conn, args),
        "project-health:get" => get_health(conn, args),
        // getAllHealth(filter?): optional status filter, ORDER BY score ASC.
        "project-health:getAll" => {
            let filter = args.get(0).and_then(|v| v.as_str());
            match filter {
                Some(f) if !f.is_empty() => query_list(
                    conn,
                    &format!("{} WHERE status = ? ORDER BY score ASC", SELECT_ALL),
                    vec![SqlValue::Text(f.to_string())],
                ),
                _ => query_list(conn, &format!("{} ORDER BY score ASC", SELECT_ALL), Vec::new()),
            }
        }
        // getHealthByApp(app): all rows for an app, ORDER BY score ASC.
        "project-health:getByApp" => {
            let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
            query_list(
                conn,
                &format!("{} WHERE app = ? ORDER BY score ASC", SELECT_ALL),
                vec![SqlValue::Text(app)],
            )
        }
        _ => Value::Null,
    }
}
