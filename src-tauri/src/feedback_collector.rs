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

        // gatherSystemInfo reads Electron/OS APIs (app.getVersion, os.platform,
        // os.release, the capability_tier setting, the renderer's active app via
        // executeJavaScript, and the electron-log file tail). Not portable to the
        // DB layer — degrade honestly rather than fabricate a SystemInfo object.
        "feedback:getSystemInfoPreview" => json!({
            "success": false,
            "error": "system info gathering not available in DB layer (not ported)"
        }),

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
