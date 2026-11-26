// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! What a DEX backup holds besides the database, and how a restore keeps the
//! backup list.
//!
//! A backup used to be `dex.db` alone, so a restore brought back neither DEX's
//! settings nor most app data. Two more things now travel inside the snapshot
//! (table `dex_backup_extra`, covered by the backup's checksum):
//!
//! * the native settings store (`dex-kv.json`);
//! * the interface's saved data, which the renderer mirrors to
//!   `renderer-state.json` (`backup:saveRendererState`).
//!
//! Passwords, the Vault key and API keys are not included. DEX Ledger keeps its
//! own backups. Backups made before this have no extra table and restore as before.

use crate::paths::DexPaths;
use rusqlite::{params, types::Value as SqlValue, Connection};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const TABLE: &str = "dex_backup_extra";
const KV: &str = "settings";
const RENDERER: &str = "interface";
const MAX_STATE: usize = 64 * 1024 * 1024;

fn state_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("renderer-state.json")
}

/// Replace a file in one step, so a crash leaves the old or the new copy.
fn replace_file(path: &Path, body: &str) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, body).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// `backup:saveRendererState` [json text of an object].
pub fn save_renderer_state(app: &tauri::AppHandle, args: &Value) -> Value {
    let Some(text) = args.get(0).and_then(|v| v.as_str()) else {
        return json!({ "success": false, "error": "expected text" });
    };
    if text.len() > MAX_STATE || !serde_json::from_str::<Value>(text).is_ok_and(|v| v.is_object()) {
        return json!({ "success": false, "error": "not a usable state" });
    }
    match replace_file(&state_path(app), text) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// `backup:rendererState` -> the saved text, or null.
pub fn renderer_state(app: &tauri::AppHandle) -> Value {
    std::fs::read_to_string(state_path(app)).map(Value::String).unwrap_or(Value::Null)
}

fn write_extras(snapshot: &Path, parts: &[(&str, String)]) -> rusqlite::Result<()> {
    let conn = Connection::open(snapshot)?;
    conn.execute_batch(&format!(
        "DROP TABLE IF EXISTS {TABLE}; CREATE TABLE {TABLE} (name TEXT PRIMARY KEY, body TEXT NOT NULL);"
    ))?;
    for (name, body) in parts {
        conn.execute(&format!("INSERT INTO {TABLE} (name, body) VALUES (?, ?)"), params![name, body])?;
    }
    conn.close().map_err(|(_, e)| e)
}

/// Add the extras to a fresh snapshot file.
pub fn pack(app: &tauri::AppHandle, snapshot: &Path) -> Result<(), String> {
    let mut parts = Vec::new();
    if let Ok(kv) = std::fs::read_to_string(crate::kv_path(app)) {
        parts.push((KV, kv));
    }
    if let Ok(state) = std::fs::read_to_string(state_path(app)) {
        parts.push((RENDERER, state));
    }
    write_extras(snapshot, &parts).map_err(|e| e.to_string())
}

/// Read the extras out of a restored database and drop the table, so later
/// snapshots don't carry a copy of a copy.
fn take_extras(conn: &Connection) -> rusqlite::Result<Vec<(String, String)>> {
    let has: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
        params![TABLE],
        |r| r.get(0),
    )?;
    if has == 0 {
        return Ok(Vec::new());
    }
    let parts = {
        let mut stmt = conn.prepare(&format!("SELECT name, body FROM {TABLE}"))?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    conn.execute_batch(&format!("DROP TABLE {TABLE};"))?;
    Ok(parts)
}

/// Put a restored backup's settings and interface data back in place.
pub fn unpack(app: &tauri::AppHandle, conn: &Connection) -> Result<(), String> {
    for (name, body) in take_extras(conn).map_err(|e| e.to_string())? {
        match name.as_str() {
            KV => replace_file(&crate::kv_path(app), &body)?,
            RENDERER => replace_file(&state_path(app), &body)?,
            _ => {}
        }
    }
    Ok(())
}

/// The rows of `backups` and `backup_settings`.
#[derive(Default)]
pub struct Catalogue {
    backups: Vec<Vec<SqlValue>>,
    settings: Vec<Vec<SqlValue>>,
}

const BACKUP_COLS: &str = "id, filename, filepath, size_bytes, type, description, databases, checksum, created_at";
const SETTING_COLS: &str = "id, auto_enabled, interval_hours, max_backups, backup_path, last_auto_backup, updated_at";

fn rows_of(conn: &Connection, table: &str, cols: &str) -> Vec<Vec<SqlValue>> {
    let n = cols.split(',').count();
    let Ok(mut stmt) = conn.prepare(&format!("SELECT {cols} FROM {table}")) else { return Vec::new() };
    let Ok(rows) = stmt.query_map([], |r| (0..n).map(|i| r.get::<_, SqlValue>(i)).collect()) else { return Vec::new() };
    rows.filter_map(|r| r.ok()).collect()
}

pub fn read_catalogue(conn: &Connection) -> Catalogue {
    Catalogue {
        backups: rows_of(conn, "backups", BACKUP_COLS),
        settings: rows_of(conn, "backup_settings", SETTING_COLS),
    }
}

pub fn write_catalogue(conn: &Connection, catalogue: &Catalogue) {
    for (table, cols, rows) in [
        ("backups", BACKUP_COLS, &catalogue.backups),
        ("backup_settings", SETTING_COLS, &catalogue.settings),
    ] {
        let marks = vec!["?"; cols.split(',').count()].join(", ");
        for row in rows {
            let _ = conn.execute(
                &format!("INSERT OR REPLACE INTO {table} ({cols}) VALUES ({marks})"),
                rusqlite::params_from_iter(row.iter()),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extras_travel_with_a_snapshot_and_are_taken_once() {
        let file = std::env::temp_dir().join(format!("dex-extras-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&file);
        Connection::open(&file).unwrap().execute_batch("CREATE TABLE notes (id TEXT);").unwrap();
        write_extras(&file, &[(KV, "{\"a\":1}".into()), (RENDERER, "{}".into())]).unwrap();
        let conn = Connection::open(&file).unwrap();
        let mut parts = take_extras(&conn).unwrap();
        parts.sort();
        assert_eq!(parts, vec![(RENDERER.into(), "{}".into()), (KV.into(), "{\"a\":1}".into())]);
        assert!(take_extras(&conn).unwrap().is_empty());
        drop(conn);
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn a_restore_keeps_the_newer_backup_list() {
        let live = Connection::open_in_memory().unwrap();
        let old = Connection::open_in_memory().unwrap();
        for c in [&live, &old] {
            crate::backup_restore::ensure_schema(c);
        }
        live.execute_batch(
            "INSERT INTO backups (id, filename, filepath, size_bytes, type, checksum) VALUES ('safety', 'f', 'p', 1, 'pre_restore', 'c');
             UPDATE backup_settings SET max_backups = 3 WHERE id = 1;",
        )
        .unwrap();
        write_catalogue(&old, &read_catalogue(&live));
        let kept: i64 = old.query_row("SELECT COUNT(*) FROM backups WHERE id = 'safety'", [], |r| r.get(0)).unwrap();
        let max: i64 = old.query_row("SELECT max_backups FROM backup_settings WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!((kept, max), (1, 3));
    }
}
