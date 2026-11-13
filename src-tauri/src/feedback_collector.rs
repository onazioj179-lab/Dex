// =============================================================================
// DEX 6.0 — Feedback Collector (Tauri port of src/main/core/FeedbackCollector.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Local-only in-app feedback (feedback:* channels). Under Electron each report
//! is written as a JSON file under `app.getPath('userData')/feedback/` AND a row
//! is inserted into the shared `dex.db` `feedback_reports` table. Only the table
//! persistence is a DB operation; everything else (the userData feedback dir, the
//! JSON file read/write, and `gatherSystemInfo`, which reads `app.getVersion()`,
//! `os.platform()`/`os.release()`, and the renderer's `window.__dexActiveApp` via
//! `executeJavaScript`) is an Electron/OS capability that does not exist in this
//! pure-DB layer. So the DB INSERT is ported faithfully and the file/system-info
//! and filesystem-backed channels degrade honestly (see each handler comment),
//! never fabricating a path, a system-info object, or a report list.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

/// Create the feedback_reports table (verbatim from DatabaseManager.initSchema).
/// No indexes are defined for this table in the Electron schema, so none here.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS feedback_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_type TEXT NOT NULL,
            description TEXT NOT NULL,
            system_info TEXT DEFAULT NULL,
            created_at INTEGER NOT NULL
        );",
    );
}

/// feedback:submit — submitReport(reportType, description, includeSystemInfo).
/// Under Electron this returns `{ filePath }` after gathering system info,
/// writing a `feedback-<now>.json` file under the userData feedback dir, and
/// inserting a row into `feedback_reports`. The DB INSERT is ported faithfully
/// here (report_type, description, created_at). `system_info` is stored as NULL:
/// gatherSystemInfo depends on Electron/OS APIs (app version, os.platform, the
/// renderer's active app, the electron-log file tail) that don't exist in this
/// DB layer, so we never fabricate a system_info object even when
/// includeSystemInfo is true. The `{ filePath }` return cannot be produced
/// (it derives from the Electron userData feedback dir + JSON file write), so we
/// degrade the return honestly while still persisting the report row.
fn submit(conn: &Connection, args: &Value) -> Value {
    let report_type = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let description = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    // now = Date.now() (epoch milliseconds), matching the TS created_at.
    let now: i64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    // system_info is NULL — gatherSystemInfo is not portable to the DB layer.
    let inserted = conn.execute(
        "INSERT INTO feedback_reports (report_type, description, system_info, created_at) VALUES (?, ?, ?, ?)",
        params![report_type, description, None::<String>, now],
    );

    if inserted.is_err() {
        return json!({
            "success": false,
            "error": "failed to persist feedback report"
        });
    }

    // The Electron handler returns { filePath } from the userData feedback dir +
    // JSON file write — an OS/path capability absent here. Degrade honestly; the
    // report row was still persisted above.
    json!({
        "success": false,
        "error": "feedback file write + filePath not available in DB layer (not ported); report row persisted"
    })
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "feedback:submit" => submit(conn, args),

        // feedback:submit and feedback:getSystemInfoPreview are answered in main.rs
        // (submit_to_file / system_info), which has the data and log folders.
        "feedback:getSystemInfoPreview" => system_info(
            args.get(0).and_then(|v| v.as_str()).unwrap_or(""),
            &crate::renderer_log::log_path(),
        ),

        // getAllReports reads JSON files from the userData feedback dir off the
        // filesystem (not the feedback_reports table), so it is not a DB op. It
        // returns FeedbackReport[] under Electron; degrade honestly to an empty
        // list rather than fabricating reports.
        "feedback:getAllReports" => json!([]),

        // getFeedbackDir returns the Electron userData feedback dir path — an
        // OS/path capability absent in the DB layer. Degrade honestly.
        "feedback:getFeedbackDir" => Value::Null,

        _ => Value::Null,
    }
}

// ---------------------------------------------------------------------------
// Real report + system info (routed from main.rs, which has the data dir).
// Before: submit answered success:false with no file, and the preview answered
// "not ported", so the panel showed "Report saved" with an empty path.
// ---------------------------------------------------------------------------

/// What "Include system info" adds. Nothing personal: version, OS, CPU arch,
/// and the last renderer warnings/errors DEX logged itself.
pub fn system_info(active_app: &str, log_path: &std::path::Path) -> Value {
    let tail: Vec<String> = std::fs::read_to_string(log_path)
        .map(|t| t.lines().rev().take(10).map(|l| l.chars().take(400).collect()).collect::<Vec<_>>())
        .unwrap_or_default()
        .into_iter()
        .rev()
        .collect();
    json!({
        "dexVersion": env!("CARGO_PKG_VERSION"),
        "osName": sysinfo::System::name().unwrap_or_else(|| std::env::consts::OS.to_string()),
        "osVersion": sysinfo::System::long_os_version().or_else(sysinfo::System::os_version).unwrap_or_default(),
        "arch": std::env::consts::ARCH,
        "capabilityTier": "desktop",
        "activeApp": active_app,
        "errorLogTail": tail,
    })
}

/// feedback:submit(type, description, includeSystemInfo, activeApp?) -> { success, filePath }.
/// Saves the row and a `feedback-<ms>.json` file under `<data>/feedback/` that the
/// user can attach to a support message. Nothing is sent anywhere.
pub fn submit_to_file(conn: &Connection, dir: &std::path::Path, args: &Value, log_path: &std::path::Path) -> Value {
    let report_type = args.get(0).and_then(|v| v.as_str()).unwrap_or("bug");
    let description = args.get(1).and_then(|v| v.as_str()).unwrap_or("").trim();
    if description.is_empty() {
        return json!({ "success": false, "error": "Describe the problem first." });
    }
    let include = args.get(2).and_then(|v| v.as_bool()).unwrap_or(true);
    let active = args.get(3).and_then(|v| v.as_str()).unwrap_or("");
    let now: i64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let info = if include { system_info(active, log_path) } else { Value::Null };
    let info_s = if include { Some(info.to_string()) } else { None };
    if let Err(e) = conn.execute(
        "INSERT INTO feedback_reports (report_type, description, system_info, created_at) VALUES (?, ?, ?, ?)",
        params![report_type, description, info_s, now],
    ) {
        return json!({ "success": false, "error": format!("Couldn't save the report: {e}") });
    }
    if let Err(e) = std::fs::create_dir_all(dir) {
        return json!({ "success": false, "error": format!("Couldn't create the feedback folder: {e}") });
    }
    let path = dir.join(format!("feedback-{now}.json"));
    let body = json!({ "type": report_type, "description": description, "createdAt": now, "systemInfo": info });
    match std::fs::write(&path, serde_json::to_string_pretty(&body).unwrap_or_default()) {
        Ok(()) => json!({ "success": true, "filePath": path.to_string_lossy() }),
        Err(e) => json!({ "success": false, "error": format!("Couldn't write the report file: {e}") }),
    }
}

#[cfg(test)]
mod file_tests {
    use super::*;

    #[test]
    fn submit_writes_row_and_file_with_system_info() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn);
        let dir = std::env::temp_dir().join(format!("dex-feedback-{}", crate::util::pseudo_uuid_v4()));
        let log = dir.join("none.log");
        let r = submit_to_file(&conn, &dir, &json!(["bug", "It broke", true, "notes"]), &log);
        assert_eq!(r["success"], true, "{r}");
        let text = std::fs::read_to_string(r["filePath"].as_str().unwrap()).unwrap();
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["description"], "It broke");
        assert_eq!(v["systemInfo"]["activeApp"], "notes");
        assert_eq!(v["systemInfo"]["dexVersion"], env!("CARGO_PKG_VERSION"));
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM feedback_reports", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        assert_eq!(submit_to_file(&conn, &dir, &json!(["bug", "  "]), &log)["success"], false);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
