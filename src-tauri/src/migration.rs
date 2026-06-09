// =============================================================================
// DEX 6.0 — Migration Manager (Tauri port of src/main/core/MigrationManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Schema-migration tracking (migration:* channels), reading the shared `dex.db`
//! `schema_migrations` ledger with the identical schema, queries, and return
//! shapes as the Electron manager.
//!
//! Under Electron, MigrationManager also OWNS a hardcoded list of 10 migrations
//! and APPLIES their `up`/`down` SQL (CREATE/DROP TABLE) at startup, recording
//! each in `schema_migrations`. In the Tauri shell those tables are instead
//! created by each ported subsystem's own `ensure_schema` (CREATE TABLE IF NOT
//! EXISTS), so we do NOT replay the migration runner here — we only create the
//! ledger table and faithfully port the two read-only status/version channels.
//!
//! The MIGRATIONS catalogue (version -> name) is preserved verbatim below so the
//! status channel can report each migration's version/name and derive its
//! applied/pending/failed state from the ledger, exactly as the TS does.
//!
//! `migration:rollback` runs the destructive `down` SQL (DROP TABLE/INDEX) and
//! deletes ledger rows. Per the porting rules, destructive schema changes are NOT
//! run from this port — it degrades honestly (see the handler comment).

use serde_json::{json, Value};
use rusqlite::Connection;

/// (version, name) of every migration the Electron MigrationManager defines, in
/// catalogue order. Mirrors the `MIGRATIONS` array (the `up`/`down`/`checksum`
/// SQL is intentionally omitted — it is applied via each subsystem's
/// ensure_schema in the Tauri shell, not replayed here).
const MIGRATIONS: &[(i64, &str)] = &[
    (1, "initial_schema"),
    (2, "add_automation_tables"),
    (3, "add_version_history"),
    (4, "add_tags_table"),
    (5, "add_time_tracking"),
    (6, "add_personal_changelog"),
    (7, "add_display_and_window_tables"),
    (8, "add_licensing_tables"),
    (9, "add_help_system_tables"),
    (10, "add_locale_and_backup_tables"),
];

/// Create the schema_migrations ledger table (matches MigrationManager.initialize
/// — copied verbatim from the TS `CREATE TABLE` statement).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TEXT DEFAULT (datetime('now')),
          success INTEGER DEFAULT 1,
          execution_ms INTEGER DEFAULT 0
        );",
    );
}

/// getCurrentVersion() — MAX(version) WHERE success = 1, or 0. Mirrors the TS
/// `row?.ver || 0` fallback (NULL/absent -> 0).
fn get_current_version(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT MAX(version) as ver FROM schema_migrations WHERE success = 1",
        [],
        |r| r.get::<_, Option<i64>>(0),
    )
    .ok()
    .flatten()
    .unwrap_or(0)
}

/// One applied-ledger row -> (version, checksum, applied_at, success, execution_ms).
struct AppliedRecord {
    version: i64,
    applied_at: Option<String>,
    success: i64,
    execution_ms: i64,
}

/// getAppliedMigrations() — the full ledger ORDER BY version. Returns an empty
/// vec when the table is absent (mirrors the TS `if (!this.db) return []`).
fn get_applied(conn: &Connection) -> Vec<AppliedRecord> {
    let mut stmt = match conn.prepare(
        "SELECT version, name, checksum, applied_at, success, execution_ms FROM schema_migrations ORDER BY version",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([], |r| {
        Ok(AppliedRecord {
            version: r.get::<_, i64>(0)?,
            applied_at: r.get::<_, Option<String>>(3)?,
            success: r.get::<_, i64>(4)?,
            execution_ms: r.get::<_, i64>(5)?,
        })
    }) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

/// migration:get-version — getCurrentVersion(). Returns a number.
fn get_version(conn: &Connection) -> Value {
    json!(get_current_version(conn))
}

/// migration:get-status — getStatus(). Returns the MigrationStatus shape:
/// { currentVersion, latestVersion, pendingCount, migrations: [...] }.
fn get_status(conn: &Connection) -> Value {
    let applied = get_applied(conn);
    let current_version = get_current_version(conn);
    let latest_version = MIGRATIONS.last().map(|(v, _)| *v).unwrap_or(0);

    let mut migrations: Vec<Value> = Vec::new();
    for (version, name) in MIGRATIONS {
        let record = applied.iter().find(|r| r.version == *version);
        // status: pending by default; applied when success, failed otherwise.
        let status = match record {
            Some(r) if r.success != 0 => "applied",
            Some(_) => "failed",
            None => "pending",
        };
        let mut obj = serde_json::Map::new();
        obj.insert("version".to_string(), json!(version));
        obj.insert("name".to_string(), json!(name));
        obj.insert("status".to_string(), json!(status));
        // appliedAt / executionMs are present only when a ledger row exists
        // (TS spreads `record?.applied_at` -> undefined / omitted when absent).
        if let Some(r) = record {
            if let Some(at) = &r.applied_at {
                obj.insert("appliedAt".to_string(), json!(at));
            } else {
                obj.insert("appliedAt".to_string(), Value::Null);
            }
            obj.insert("executionMs".to_string(), json!(r.execution_ms));
        }
        migrations.push(Value::Object(obj));
    }

    let pending_count = migrations
        .iter()
        .filter(|m| m.get("status").and_then(|s| s.as_str()) == Some("pending"))
        .count() as i64;

    json!({
        "currentVersion": current_version,
        "latestVersion": latest_version,
        "pendingCount": pending_count,
        "migrations": migrations,
    })
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let _ = args; // get-status / get-version take no positional args.
    match channel {
        "migration:get-status" => get_status(conn),
        "migration:get-version" => get_version(conn),
        // migration:rollback(targetVersion) executes each rolled-back migration's
        // destructive `down` SQL (DROP TABLE / DROP INDEX) and deletes ledger
        // rows. Per the porting rules, destructive schema changes are NOT run
        // from this port — doing so would drop user-data tables owned by other
        // subsystems. Degrade honestly rather than destroy data.
        "migration:rollback" => json!({
            "success": false,
            "error": "destructive rollback (DROP TABLE) not run from DB layer (not ported)"
        }),
        _ => Value::Null,
    }
}
