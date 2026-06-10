// =============================================================================
// DEX 6.0 — Backup & Restore (Tauri port of src/main/core/BackupRestoreManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed backup metadata (backup:* channels), reading/writing the shared
//! `dex.db` `backups` + `backup_settings` tables with the identical schema,
//! queries, and return shapes as the Electron manager. The renderer-facing
//! surface is the seven handlers below.
//!
//! Fully ported: `backup:create` gathers the on-disk database files +
//! `settings.json` from the app data dir (the Tauri analog of Electron's
//! userData), builds the base64 JSON archive, gzips it at level 6, writes the
//! `.dexbak` file (under the configured backup_path, or `data_dir/backups`
//! when unset), records the row with a SHA-256 checksum, and prunes old
//! automatic backups. `backup:verify` re-reads the file, re-checks the
//! checksum, and validates the manifest; `backup:restore` takes a pre-restore
//! safety backup and writes the selected databases back to disk — all with the
//! exact `.dexbak` format and return shapes of the Electron manager, so backup
//! files round-trip between the shells. The auto-backup interval timer is an
//! Electron-runtime concern with no IPC surface and is not replicated here.

use crate::licensing::sha256_hex;
use crate::{util, zlib};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// The database files the Electron manager includes in every backup, relative
/// to the app data dir (absent files are skipped, as the TS does).
const DATABASE_FILES: [&str; 3] = ["dex-core.db", "dex-notes.db", "help.db"];

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

/// The directory `.dexbak` files are written to: the configured backup_path,
/// or `data_dir/backups` when unset (the same default the TS seeds at init).
fn backup_dir(conn: &Connection, data_dir: &Path) -> PathBuf {
    let configured = get_settings(conn)
        .get("backup_path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if configured.is_empty() {
        data_dir.join("backups")
    } else {
        PathBuf::from(configured)
    }
}

/// backup:create — createBackup(type='manual', description=''). Returns the
/// BackupRecord, or null on a filesystem failure (where the TS would reject).
fn create_backup(conn: &Connection, data_dir: &Path, backup_type: &str, description: &str) -> Value {
    let dir = backup_dir(conn, data_dir);
    if std::fs::create_dir_all(&dir).is_err() {
        return Value::Null;
    }

    let id = util::pseudo_uuid_v4();
    let iso = util::iso_utc_now();
    // `toISOString().replace(/[:.]/g, '-').substring(0, 19)`
    let timestamp: String = iso
        .chars()
        .map(|c| if c == ':' || c == '.' { '-' } else { c })
        .take(19)
        .collect();
    let filename = format!("dex-backup-{}-{}.dexbak", timestamp, backup_type);
    let filepath = dir.join(&filename);

    // Gather the database files + settings.json that exist on disk.
    let mut backup_data: Vec<(String, Vec<u8>)> = Vec::new();
    let mut included: Vec<String> = Vec::new();
    for db_file in DATABASE_FILES {
        if let Ok(bytes) = std::fs::read(data_dir.join(db_file)) {
            backup_data.push((db_file.to_string(), bytes));
            included.push(db_file.to_string());
        }
    }
    if let Ok(bytes) = std::fs::read(data_dir.join("settings.json")) {
        backup_data.push(("settings.json".to_string(), bytes));
    }

    // Manifest lists the data files (not itself), exactly as the TS builds it.
    let files: Vec<String> = backup_data.iter().map(|(k, _)| k.clone()).collect();
    let manifest = json!({
        "version": 1,
        "type": backup_type,
        "created_at": iso,
        "app_version": env!("CARGO_PKG_VERSION"),
        "databases": included,
        "files": files,
    });
    let manifest_bytes = serde_json::to_string_pretty(&manifest)
        .unwrap_or_default()
        .into_bytes();
    backup_data.push(("manifest.json".to_string(), manifest_bytes));

    // Archive = JSON object of base64 entries, gzipped at level 6 (.dexbak).
    let mut obj = serde_json::Map::new();
    for (k, v) in &backup_data {
        obj.insert(k.clone(), json!(BASE64.encode(v)));
    }
    let archive = Value::Object(obj).to_string();
    let compressed = zlib::gzip(archive.as_bytes());
    if std::fs::write(&filepath, &compressed).is_err() {
        return Value::Null;
    }

    let checksum = sha256_hex(&compressed);
    let size_bytes = compressed.len() as i64;
    let filepath_str = filepath.to_string_lossy().to_string();
    let _ = conn.execute(
        "INSERT INTO backups (id, filename, filepath, size_bytes, type, description, databases, checksum, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        params![
            id,
            filename,
            filepath_str,
            size_bytes,
            backup_type,
            description,
            json!(included).to_string(),
            checksum
        ],
    );
    if backup_type == "automatic" {
        let _ = conn.execute(
            "UPDATE backup_settings SET last_auto_backup = datetime('now') WHERE id = 1",
            [],
        );
    }
    prune_old_backups(conn);

    json!({
        "id": id,
        "filename": filename,
        "filepath": filepath_str,
        "size_bytes": size_bytes,
        "type": backup_type,
        "description": description,
        "databases": included,
        "checksum": checksum,
        "created_at": iso,
    })
}

/// Keep at most max_backups automatic backups, unlinking the pruned files
/// (matches pruneOldBackups, including swallowing per-file errors).
fn prune_old_backups(conn: &Connection) {
    let max_backups = get_settings(conn)
        .get("max_backups")
        .and_then(|v| v.as_i64())
        .unwrap_or(10)
        .max(0) as usize;
    let mut stmt = match conn.prepare(
        "SELECT id, filepath FROM backups WHERE type = 'automatic' ORDER BY created_at DESC",
    ) {
        Ok(s) => s,
        Err(_) => return,
    };
    let rows: Vec<(String, String)> = match stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(_) => return,
    };
    for (id, filepath) in rows.into_iter().skip(max_backups) {
        let _ = std::fs::remove_file(&filepath);
        let _ = conn.execute("DELETE FROM backups WHERE id = ?", params![id]);
    }
}

/// Read + parse a `.dexbak` archive into (archive object, manifest). Errors are
/// returned as the human-readable strings the TS verify path produces.
fn read_archive(filepath: &str) -> Result<(serde_json::Map<String, Value>, Value), String> {
    let file_data =
        std::fs::read(filepath).map_err(|e| format!("Verification failed: {}", e))?;
    let decompressed =
        zlib::gunzip(&file_data).map_err(|e| format!("Verification failed: {}", e))?;
    let archive: Value = serde_json::from_slice(&decompressed)
        .map_err(|e| format!("Verification failed: {}", e))?;
    let archive = match archive {
        Value::Object(m) => m,
        _ => return Err("Verification failed: archive is not an object".to_string()),
    };
    let manifest_b64 = match archive.get("manifest.json").and_then(|v| v.as_str()) {
        Some(m) => m,
        None => return Err("Backup is missing manifest.".to_string()),
    };
    let manifest_bytes = BASE64
        .decode(manifest_b64)
        .map_err(|e| format!("Verification failed: {}", e))?;
    let manifest: Value = serde_json::from_slice(&manifest_bytes)
        .map_err(|e| format!("Verification failed: {}", e))?;
    Ok((archive, manifest))
}

/// backup:verify — verifyBackup(id). Returns { valid, details } with the same
/// detail strings as the TS for every branch.
fn verify_backup(conn: &Connection, backup_id: &str) -> Value {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT filepath, checksum FROM backups WHERE id = ?",
            params![backup_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    let (filepath, checksum) = match row {
        Some(r) => r,
        None => return json!({ "valid": false, "details": "Backup not found" }),
    };
    if !Path::new(&filepath).exists() {
        return json!({ "valid": false, "details": "Backup file is missing from disk" });
    }
    let file_data = match std::fs::read(&filepath) {
        Ok(d) => d,
        Err(e) => return json!({ "valid": false, "details": format!("Verification failed: {}", e) }),
    };
    if sha256_hex(&file_data) != checksum {
        return json!({
            "valid": false,
            "details": "Checksum mismatch. Backup file may be corrupted."
        });
    }
    let (_, manifest) = match read_archive(&filepath) {
        Ok(a) => a,
        Err(details) => return json!({ "valid": false, "details": details }),
    };
    let version_ok = manifest.get("version").map(truthy).unwrap_or(false);
    let databases = manifest.get("databases").and_then(|v| v.as_array()).cloned();
    if !version_ok || databases.is_none() {
        return json!({ "valid": false, "details": "Manifest is malformed." });
    }
    let created_at = manifest
        .get("created_at")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    json!({
        "valid": true,
        "details": format!(
            "Backup valid. Contains {} databases, created at {}.",
            databases.map(|d| d.len()).unwrap_or(0),
            created_at
        )
    })
}

/// JS truthiness for the manifest `version` field check.
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(true),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

/// backup:restore — restoreBackup(id, selectedDatabases?). Verifies, takes the
/// pre-restore safety backup, then writes the selected database files (and
/// settings.json when present) back into the app data dir. The Electron close/
/// reopen of its `dex-core.db` handle is not needed here — this module does not
/// hold those files open.
fn restore_backup(conn: &Connection, data_dir: &Path, args: &Value) -> Value {
    let backup_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let selected: Option<Vec<String>> = args.get(1).and_then(|v| v.as_array()).map(|a| {
        a.iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect()
    });

    let filepath: Option<String> = conn
        .query_row(
            "SELECT filepath FROM backups WHERE id = ?",
            params![backup_id],
            |r| r.get(0),
        )
        .ok();
    let filepath = match filepath {
        Some(p) => p,
        None => {
            return json!({ "success": false, "restoredDatabases": [], "errors": ["Backup not found"] })
        }
    };

    let verification = verify_backup(conn, backup_id);
    if !verification.get("valid").and_then(|v| v.as_bool()).unwrap_or(false) {
        let details = verification
            .get("details")
            .and_then(|v| v.as_str())
            .unwrap_or("invalid backup")
            .to_string();
        return json!({ "success": false, "restoredDatabases": [], "errors": [details] });
    }

    let _ = create_backup(conn, data_dir, "pre_restore", "Pre-restore safety backup");

    let (archive, manifest) = match read_archive(&filepath) {
        Ok(a) => a,
        Err(details) => {
            return json!({ "success": false, "restoredDatabases": [], "errors": [details] })
        }
    };
    let databases_to_restore: Vec<String> = selected.unwrap_or_else(|| {
        manifest
            .get("databases")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    });

    let mut restored: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    for db_file in &databases_to_restore {
        let entry = match archive.get(db_file).and_then(|v| v.as_str()) {
            Some(e) => e,
            None => {
                errors.push(format!("Database {} not found in backup", db_file));
                continue;
            }
        };
        let result = BASE64
            .decode(entry)
            .map_err(|e| e.to_string())
            .and_then(|bytes| {
                std::fs::write(data_dir.join(db_file), bytes).map_err(|e| e.to_string())
            });
        match result {
            Ok(()) => restored.push(db_file.clone()),
            Err(e) => errors.push(format!("Failed to restore {}: {}", db_file, e)),
        }
    }
    if let Some(settings_b64) = archive.get("settings.json").and_then(|v| v.as_str()) {
        let result = BASE64
            .decode(settings_b64)
            .map_err(|e| e.to_string())
            .and_then(|bytes| {
                std::fs::write(data_dir.join("settings.json"), bytes).map_err(|e| e.to_string())
            });
        if let Err(e) = result {
            errors.push(format!("Failed to restore settings: {}", e));
        }
    }

    json!({
        "success": errors.is_empty(),
        "restoredDatabases": restored,
        "errors": errors,
    })
}

pub fn dispatch(conn: &Connection, data_dir: &Path, channel: &str, args: &Value) -> Value {
    match channel {
        "backup:list" => list_backups(conn),
        "backup:get-settings" => get_settings(conn),
        "backup:update-settings" => {
            let partial = args.get(0).cloned().unwrap_or_else(|| json!({}));
            update_settings(conn, &partial)
        }
        "backup:delete" => delete_backup(conn, args),
        "backup:create" => {
            let backup_type = args.get(0).and_then(|v| v.as_str()).unwrap_or("manual");
            let description = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            create_backup(conn, data_dir, backup_type, description)
        }
        "backup:verify" => {
            let backup_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            verify_backup(conn, backup_id)
        }
        "backup:restore" => restore_backup(conn, data_dir, args),
        _ => Value::Null,
    }
}
