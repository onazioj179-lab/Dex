// =============================================================================
// DEX Platform — DEX Ledger shell bridge (`ledger:*` channels)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Owns the one open connection to `databases/ledger.db` (a separate file from
//! `dex.db`, so financial data is never mixed into other subsystems or their
//! backups) and forwards channels to the `dex-ledger` engine.
//!
//! Permission boundary:
//! - Only the main DEX webview may call these channels (checked in main.rs);
//!   browser tabs are remote origins with no IPC at all.
//! - The renderer never supplies a filesystem path. Every read or write of a
//!   user file (CSV import, export, receipts, backup export/import) goes
//!   through a native dialog opened HERE, so the user picks the path.
//! - Nothing in this module or the engine makes a network request.

use crate::native_ops::fp_to_string;
use crate::paths::DexPaths;
use dex_ledger::Ledger;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri_plugin_dialog::DialogExt;

const MAX_TEXT_FILE: u64 = 20 * 1024 * 1024;

#[derive(Default)]
pub struct LedgerState(Mutex<Option<Ledger>>);

fn paths(app: &tauri::AppHandle) -> Option<(PathBuf, PathBuf)> {
    let base = app.dex_data_dir().ok()?;
    Some((base.join("databases").join("ledger.db"), base.join("backups").join("ledger")))
}

fn fail(msg: impl Into<String>) -> Value {
    json!({ "ok": false, "error": msg.into() })
}

fn okv(v: Value) -> Value {
    json!({ "ok": true, "data": v })
}

fn payload(args: &Value) -> Value {
    match args {
        Value::Array(a) => a.first().cloned().unwrap_or(Value::Null),
        other => other.clone(),
    }
}

/// Run `f` with the open ledger, opening it on first use.
fn with_ledger(app: &tauri::AppHandle, f: impl FnOnce(&mut Ledger) -> Value) -> Value {
    let state = tauri::Manager::state::<LedgerState>(app);
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    if guard.is_none() {
        let Some((db, backups)) = paths(app) else { return fail("DEX can't find its data folder") };
        match Ledger::open(&db, &backups) {
            Ok(l) => *guard = Some(l),
            Err(e) => return json!({ "ok": false, "error": e, "recoverable": e.starts_with("CORRUPT") }),
        }
    }
    f(guard.as_mut().expect("ledger opened above"))
}

fn mime_for(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}

fn read_text_file(path: &Path) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_TEXT_FILE {
        return Err("That file is larger than 20 MB".into());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8(bytes.clone()).unwrap_or_else(|_| {
        // Many bank exports are Windows-1252/Latin-1: map bytes 1:1 so the
        // digits and separators survive (only accented letters may differ).
        bytes.iter().map(|&b| b as char).collect()
    }))
}

fn safe_file_name(s: &str, fallback: &str) -> String {
    let cleaned: String = s.chars().filter(|c| !"\\/:*?\"<>|".contains(*c) && !c.is_control()).collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() { fallback.to_string() } else { cleaned.chars().take(120).collect() }
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let p = payload(args);
    match channel {
        // Pick a CSV (bank export / statement) and return its text.
        "ledger:file:openCsv" => {
            let picked = app
                .dialog()
                .file()
                .set_title("Choose a CSV file")
                .add_filter("CSV or text", &["csv", "txt", "tsv"])
                .blocking_pick_file()
                .and_then(fp_to_string);
            let Some(path) = picked else { return okv(json!({ "canceled": true })) };
            let path = PathBuf::from(path);
            match read_text_file(&path) {
                Ok(content) => okv(json!({ "canceled": false, "name": path.file_name().map(|n| n.to_string_lossy().to_string()), "content": content })),
                Err(e) => fail(e),
            }
        }

        // Save text the engine produced (CSV export / report) where the user chooses.
        "ledger:file:saveText" => {
            let content = p.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = safe_file_name(p.get("suggestedName").and_then(|v| v.as_str()).unwrap_or(""), "ledger-export.csv");
            let picked = app.dialog().file().set_title("Save CSV").set_file_name(&name).add_filter("CSV", &["csv"]).blocking_save_file().and_then(fp_to_string);
            let Some(path) = picked else { return okv(json!({ "canceled": true })) };
            // UTF-8 BOM so spreadsheet apps read non-ASCII payees correctly.
            match std::fs::write(&path, format!("\u{feff}{content}")) {
                Ok(_) => okv(json!({ "canceled": false, "path": path })),
                Err(e) => fail(format!("Couldn't save the file: {e}")),
            }
        }

        "ledger:attachments:add" => {
            let Some(txn) = p.get("txnId").and_then(|v| v.as_i64()) else { return fail("missing txnId") };
            let picked = app
                .dialog()
                .file()
                .set_title("Attach a receipt")
                .add_filter("Receipts", &["png", "jpg", "jpeg", "gif", "webp", "heic", "pdf", "txt"])
                .blocking_pick_file()
                .and_then(fp_to_string);
            let Some(path) = picked else { return okv(json!({ "canceled": true })) };
            let path = PathBuf::from(path);
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            if size > 15 * 1024 * 1024 {
                return fail("Receipts are limited to 15 MB");
            }
            let bytes = match std::fs::read(&path) {
                Ok(b) => b,
                Err(e) => return fail(e.to_string()),
            };
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "receipt".into());
            with_ledger(app, |l| match l.attachment_add(txn, &name, mime_for(&name), &bytes) {
                Ok(v) => okv(v),
                Err(e) => fail(e),
            })
        }

        "ledger:attachments:saveAs" => {
            let Some(id) = p.get("id").and_then(|v| v.as_i64()) else { return fail("missing id") };
            let mut got: Option<(String, Vec<u8>)> = None;
            let r = with_ledger(app, |l| match l.attachment_bytes(id) {
                Ok((name, _, data)) => {
                    got = Some((name, data));
                    okv(json!({}))
                }
                Err(e) => fail(e),
            });
            let Some((name, bytes)) = got else { return r };
            let name = safe_file_name(&name, "receipt");
            let picked = app.dialog().file().set_title("Save receipt").set_file_name(&name).blocking_save_file().and_then(fp_to_string);
            let Some(path) = picked else { return okv(json!({ "canceled": true })) };
            match std::fs::write(&path, bytes) {
                Ok(_) => okv(json!({ "canceled": false, "path": path })),
                Err(e) => fail(e.to_string()),
            }
        }

        "ledger:backup:export" => {
            let picked = app.dialog().file().set_title("Export ledger backup").set_file_name("DEX Ledger backup.db").add_filter("DEX Ledger backup", &["db"]).blocking_save_file().and_then(fp_to_string);
            let Some(path) = picked else { return okv(json!({ "canceled": true })) };
            with_ledger(app, |l| match l.export_backup(Path::new(&path)) {
                Ok(v) => okv(v),
                Err(e) => fail(e),
            })
        }

        "ledger:backup:importFile" => {
            let picked = app.dialog().file().set_title("Restore a ledger backup").add_filter("DEX Ledger backup", &["db"]).blocking_pick_file().and_then(fp_to_string);
            let Some(path) = picked else { return okv(json!({ "canceled": true })) };
            with_ledger(app, |l| match l.restore_from_path(Path::new(&path)) {
                Ok(v) => okv(v),
                Err(e) => fail(e),
            })
        }

        "ledger:backup:openFolder" => {
            let Some((_, backups)) = paths(app) else { return fail("no data folder") };
            let _ = std::fs::create_dir_all(&backups);
            match open::that(&backups) {
                Ok(_) => okv(json!({})),
                Err(e) => fail(e.to_string()),
            }
        }

        // The ledger file failed its integrity check. Keep the damaged file
        // (renamed, never deleted) and either restore the newest backup or
        // start an empty ledger — only when the user picks one.
        "ledger:recover" => {
            let action = p.get("action").and_then(|v| v.as_str()).unwrap_or("");
            let Some((db, backups)) = paths(app) else { return fail("no data folder") };
            let state = tauri::Manager::state::<LedgerState>(app);
            let mut guard = match state.0.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            *guard = None;
            let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let kept = db.with_file_name(format!("ledger.damaged-{stamp}.db"));
            if db.exists() {
                if let Err(e) = std::fs::rename(&db, &kept) {
                    return fail(format!("Couldn't set the damaged file aside: {e}"));
                }
                for ext in ["db-wal", "db-shm"] {
                    let side = db.with_extension(ext);
                    let _ = std::fs::rename(&side, kept.with_extension(ext));
                }
            }
            let mut l = match Ledger::open(&db, &backups) {
                Ok(l) => l,
                Err(e) => return fail(e),
            };
            let mut restored = Value::Null;
            if action == "restoreLatest" {
                let latest = l.backup_list().ok().and_then(|v| v.as_array().and_then(|a| a.iter().find(|b| Ledger::validate_backup(&backups.join(b["file"].as_str().unwrap_or(""))).is_ok()).cloned()));
                match latest {
                    Some(b) => match l.restore_from_path(&backups.join(b["file"].as_str().unwrap_or(""))) {
                        Ok(_) => restored = b["file"].clone(),
                        Err(e) => return fail(e),
                    },
                    None => return fail("No usable backup was found; choose Start empty instead"),
                }
            }
            *guard = Some(l);
            okv(json!({ "damagedFileKeptAs": kept.file_name().map(|n| n.to_string_lossy().to_string()), "restoredFrom": restored }))
        }

        // An earlier DEX build kept a ledger as tables in dex.db. Report it so
        // setup can offer a one-time import; the old tables are only read.
        "ledger:legacy:probe" => match read_legacy(app, false) {
            Ok(v) => okv(v),
            Err(e) => fail(e),
        },
        "ledger:legacy:import" => {
            let doc = match read_legacy(app, true) {
                Ok(v) if !v.is_null() => v,
                Ok(_) => return fail("No earlier ledger was found"),
                Err(e) => return fail(e),
            };
            with_ledger(app, |l| {
                // Safety copy first, like every other bulk change.
                if let Err(e) = l.backup_create("before-import") {
                    return fail(e);
                }
                match l.import_legacy(&doc) {
                    Ok(v) => okv(v),
                    Err(e) => fail(e),
                }
            })
        }

        _ => with_ledger(app, |l| l.dispatch(channel, args)),
    }
}

/// Probe (counts) or load (full document) the earlier dex.db ledger tables.
fn read_legacy(app: &tauri::AppHandle, full: bool) -> Result<Value, String> {
    let state = tauri::Manager::state::<crate::db::DbState>(app);
    let guard = state.lock().map_err(|_| "database busy".to_string())?;
    let Some(conn) = guard.as_ref() else { return Ok(Value::Null) };
    let Some(probe) = crate::ledger_legacy::probe(conn) else { return Ok(Value::Null) };
    if !full {
        return Ok(probe);
    }
    crate::ledger_legacy::load(conn).map(|r| r.get("doc").cloned().unwrap_or(r))
}
