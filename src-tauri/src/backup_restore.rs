// =============================================================================
// DEX 6.0 — Backup & Restore (Tauri port of src/main/core/BackupRestoreManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed backup metadata (backup:* channels), reading/writing the shared
//! `dex.db` `backups` + `backup_settings` tables with the identical schema,
//! queries, and return shapes as the Electron manager.
//!
//! This module owns the pure-DB surface: `backup:list`, `backup:get-settings`,
//! `backup:update-settings`, and `backup:delete`. The stateful trio —
//! `backup:create` / `backup:verify` / `backup:restore` — is implemented in
//! `native_ops` (explicit `dex_ipc` arms, dispatched before this module), where
//! the live connection can be managed: `create` snapshots the Tauri-native
//! `dex.db` via `VACUUM INTO` (WAL-safe) and `restore` swaps the database file
//! atomically under the DbGate write lock. The Electron manager's multi-file
//! gzip archive format is not reproduced here because the Electron database
//! files (dex-core.db etc.) do not exist in the Tauri app data dir.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the backups + backup_settings tables and seed the singleton settings
/// row (matches BackupRestoreManager.initialize). The TS seeds `backup_path` with
/// a real on-disk path derived from `app.getPath('userData')`; that path is an OS
/// concern unavailable here, so the seed leaves it as the column default ('') and
/// the OS layer fills it in.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS backups (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            type TEXT NOT NULL,
            description TEXT DEFAULT '',
            databases TEXT DEFAULT '[]',
            checksum TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS backup_settings (
            id INTEGER PRIMARY KEY,
            auto_enabled INTEGER DEFAULT 1,
            interval_hours INTEGER DEFAULT 24,
            max_backups INTEGER DEFAULT 10,
            backup_path TEXT DEFAULT '',
            last_auto_backup TEXT DEFAULT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );",
    );

    // Seed the singleton settings row when absent (mirrors the `if (!settingsRow)`
    // branch). The TS passes a derived backup_path; we use the column default ('').
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM backup_settings WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if exists == 0 {
        let _ = conn.execute(
            "INSERT INTO backup_settings (id, auto_enabled, interval_hours, max_backups, backup_path) VALUES (1, 1, 24, 10, '')",
            [],
        );
    }
}

/// One row -> the BackupRecord shape. Matches `SELECT *` column order on the
/// `backups` table above, with `databases` parsed from its JSON string column.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let databases_raw: String = row.get(6)?;
    let databases: Value =
        serde_json::from_str(&databases_raw).unwrap_or_else(|_| json!([]));
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "filename": row.get::<_, String>(1)?,
        "filepath": row.get::<_, String>(2)?,
        "size_bytes": row.get::<_, i64>(3)?,
        "type": row.get::<_, String>(4)?,
        "description": row.get::<_, String>(5)?,
        "databases": databases,
        "checksum": row.get::<_, String>(7)?,
        "created_at": row.get::<_, String>(8)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, filename, filepath, size_bytes, type, description, databases, checksum, created_at FROM backups";

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

/// backup:list — listBackups(). Returns BackupRecord[] ordered newest-first, with
/// each row's `databases` JSON string parsed into an array (matches the TS map).
fn list_backups(conn: &Connection) -> Value {
    let sql = format!("{} ORDER BY created_at DESC", SELECT_COLS);
    query_list(conn, &sql, Vec::new())
}

/// Read the singleton settings row into the BackupSettings shape (matches
/// getSettings, including the `auto_enabled === 1` boolean coercion). When the
/// row is absent the TS returns the hard-coded defaults; mirror that here.
fn get_settings(conn: &Connection) -> Value {
    let sql = "SELECT auto_enabled, interval_hours, max_backups, backup_path, last_auto_backup FROM backup_settings WHERE id = 1";
    conn.query_row(sql, [], |row| {
        Ok(json!({
            "auto_enabled": row.get::<_, i64>(0)? == 1,
            "interval_hours": row.get::<_, i64>(1)?,
            "max_backups": row.get::<_, i64>(2)?,
            "backup_path": row.get::<_, String>(3)?,
            "last_auto_backup": row.get::<_, Option<String>>(4)?,
        }))
    })
    .unwrap_or_else(|_| {
        json!({
            "auto_enabled": true,
            "interval_hours": 24,
            "max_backups": 10,
            "backup_path": "",
            "last_auto_backup": Value::Null,
        })
    })
}

/// backup:update-settings — updateSettings(partial) then return getSettings().
/// Merges the partial over the current row (TS `{ ...current, ...settings }`) and
/// persists auto_enabled/interval_hours/max_backups/backup_path. The TS side
/// effects (mkdir of the new path, restarting the auto-backup timer) are OS/timer
/// concerns owned by the Tauri layer and are intentionally not performed here.
fn update_settings(conn: &Connection, partial: &Value) -> Value {
    let current = get_settings(conn);

    let auto_enabled = partial
        .get("auto_enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or_else(|| current.get("auto_enabled").and_then(|v| v.as_bool()).unwrap_or(true));
    let interval_hours = partial
        .get("interval_hours")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| current.get("interval_hours").and_then(|v| v.as_i64()).unwrap_or(24));
    let max_backups = partial
        .get("max_backups")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| current.get("max_backups").and_then(|v| v.as_i64()).unwrap_or(10));
    let backup_path = partial
        .get("backup_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            current
                .get("backup_path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        });

    let _ = conn.execute(
        "UPDATE backup_settings SET
            auto_enabled = ?, interval_hours = ?, max_backups = ?, backup_path = ?, updated_at = datetime('now')
         WHERE id = 1",
        params![
            if auto_enabled { 1 } else { 0 },
            interval_hours,
            max_backups,
            backup_path
        ],
    );

    get_settings(conn)
}

/// backup:delete — deleteBackup(id). Unlinks the on-disk `.dexbak` file
/// (best-effort, missing file tolerated as in the TS existsSync guard) and
/// removes the metadata row. Returns false when the backup row is absent.
fn delete_backup(conn: &Connection, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let filepath: Option<String> = conn
        .query_row(
            "SELECT filepath FROM backups WHERE id = ?",
            params![id],
            |r| r.get(0),
        )
        .ok();
    let filepath = match filepath {
        Some(p) => p,
        None => return json!(false),
    };
    let _ = std::fs::remove_file(filepath);
    let _ = conn.execute("DELETE FROM backups WHERE id = ?", params![id]);
    json!(true)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "backup:list" => list_backups(conn),
        "backup:get-settings" => get_settings(conn),
        "backup:update-settings" => {
            let partial = args.get(0).cloned().unwrap_or_else(|| json!({}));
            update_settings(conn, &partial)
        }
        "backup:delete" => delete_backup(conn, args),
        // backup:create / backup:verify / backup:restore are handled by the
        // explicit native_ops arms in dex_ipc (they manage the live connection
        // and snapshot/swap the Tauri-native dex.db) and never reach here.
        _ => Value::Null,
    }
}
