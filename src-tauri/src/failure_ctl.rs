// =============================================================================
// DEX Tauri — Failure subsystem (port of the data surface of
// core/FailurePathHandler.ts: the `failure:*` IPC handlers).
//
// Pure-data, JSON-backed tier. The Electron handler kept its failure log in
// memory only (the `failureHistory` array, capped at 500, newest pushed to the
// end). The Tauri data tier reads that log from a single fs-json file under
// <appData> with the SAME name the migration brief specifies:
//   - failure-log.json : { "records": [FailureRecord, ...] }
// The producer of new records is the live failure handler (a HEAVY path, not
// ported here); this module is the read-only DATA surface over that file. The
// `records` array carries the same ordering as the Electron list (newest last).
//
// A FailureRecord (from FailurePathHandler.ts) is:
//   { id, code, severity, context, message, userMessage, recovered,
//     recoveryStrategy?, timestamp }
//   where context = { operation, component, input?, timestamp, stack?,
//   metadata? }.
//
// Channels & shapes:
//   - failure:getLog   (Electron `failure:history`, getHistory())
//       -> FailureRecord[]   (the stored array, [] if unset; newest last,
//                             exactly as Electron returned [...failureHistory])
//   - failure:getStats (getStatistics())
//       -> { total: number,
//            byCode: { [code]: number },
//            bySeverity: { [severity]: number } }
//          counts derived from the same records the log returns.
//
// HEAVY channels — now ported with REAL native code where feasible:
//   - failure:recover  (attemptRecovery(failureId, strategy)): native for the
//       strategies that don't need a live operation handler. `ignore` mutates the
//       persisted record (recovered=true) and returns success; `restart` relaunches
//       the app via app.restart() (after emitting `failure:recovered`).
//       `retry`/`fallback` emit a `failure:recoveryRequest` event then degrade
//       (no live operation
//       handler exists to satisfy the 5s round-trip Electron waited on), returning
//       { success:false, strategy, message:"no live operation handler (needs native runtime)" }.
//   - failure:escalate (no Electron channel; an escalate verb): native — finds the
//       record, marks it escalated in the persisted log, emits `failure:notify` +
//       `failure:occurred` to the renderer (mirrors notifyUser/broadcastFailure),
//       returns { success, ... }.
//   - failure:analyze  (error-catalog / recovery analysis path): fully native —
//       given a code or failureId, returns the catalog definition plus a recovery
//       analysis (available strategies, autoRecover, retry plan) and live stats.
//
// DIVERGENCES (documented):
//   - Persistence: Electron held the log purely in memory; on Tauri it is
//     persisted to failure-log.json so the data survives restarts. The returned
//     SHAPES are identical; only durability differs. getStats counts are derived
//     from the persisted records, matching getStatistics() exactly.
//   - Insertion order: getStatistics() iterates the array, so byCode/bySeverity
//     key insertion order follows first-seen order in the log — preserved here
//     by using serde_json::Map (insertion-ordered) over the records in order.
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

const LOG_FILE: &str = "failure-log.json";

// --- file IO ----------------------------------------------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// --- log store --------------------------------------------------------------

fn read_records(app: &tauri::AppHandle) -> Vec<Value> {
    read_file(app, LOG_FILE)
        .get("records")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

// getHistory(): `return [...this.failureHistory]` — the log array, newest last.
fn get_log(app: &tauri::AppHandle) -> Value {
    json!(read_records(app))
}

fn record_str<'a>(r: &'a Value, key: &str) -> &'a str {
    r.get(key).and_then(|v| v.as_str()).unwrap_or("")
}

// getStatistics(): { total, byCode, bySeverity } counted over the log.
fn get_stats(app: &tauri::AppHandle) -> Value {
    let records = read_records(app);
    let mut by_code: Map<String, Value> = Map::new();
    let mut by_severity: Map<String, Value> = Map::new();

    for r in &records {
        let code = record_str(r, "code").to_string();
        let severity = record_str(r, "severity").to_string();
        let c = by_code.get(&code).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
        by_code.insert(code, json!(c));
        let s = by_severity.get(&severity).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
        by_severity.insert(severity, json!(s));
    }

    json!({
        "total": records.len(),
        "byCode": Value::Object(by_code),
        "bySeverity": Value::Object(by_severity),
    })
}

// --- error catalog (ported from ERROR_CATALOG in FailurePathHandler.ts) -------
//
// Each tuple is (code, severity, message, userMessage, recoveryStrategies,
// autoRecover, retryCount, retryDelay, fallback). Kept in the SAME order as the
// Electron catalog so analysis output matches. A `None` fallback maps to an
// absent `fallback` key (Electron used an optional field).
struct ErrorDef {
    code: &'static str,
    severity: &'static str,
    message: &'static str,
    user_message: &'static str,
    strategies: &'static [&'static str],
    auto_recover: bool,
    retry_count: i64,
    retry_delay: i64,
    fallback: Option<&'static str>,
}

const ERROR_CATALOG: &[ErrorDef] = &[
    ErrorDef { code: "FS_NOT_FOUND", severity: "warning", message: "File or directory not found", user_message: "The file or folder could not be found. It may have been moved or deleted.", strategies: &["ignore", "manual"], auto_recover: false, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "FS_PERMISSION_DENIED", severity: "error", message: "Permission denied accessing file", user_message: "You don't have permission to access this file. Try running as administrator.", strategies: &["manual", "ignore"], auto_recover: false, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "FS_DISK_FULL", severity: "critical", message: "Disk space exhausted", user_message: "Your disk is full. Please free up some space and try again.", strategies: &["manual"], auto_recover: false, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "FS_FILE_IN_USE", severity: "warning", message: "File is in use by another process", user_message: "This file is being used by another program. Close it and try again.", strategies: &["retry", "ignore"], auto_recover: true, retry_count: 3, retry_delay: 1000, fallback: None },
    ErrorDef { code: "FS_READ_ERROR", severity: "error", message: "Failed to read file", user_message: "Could not read the file. It may be corrupted.", strategies: &["retry", "ignore"], auto_recover: true, retry_count: 2, retry_delay: 500, fallback: None },
    ErrorDef { code: "FS_WRITE_ERROR", severity: "error", message: "Failed to write file", user_message: "Could not save the file. Check if you have write permissions.", strategies: &["retry", "fallback"], auto_recover: true, retry_count: 2, retry_delay: 500, fallback: Some("Save to temp location") },
    ErrorDef { code: "NET_OFFLINE", severity: "warning", message: "No internet connection", user_message: "You appear to be offline. Some features may not work.", strategies: &["retry", "ignore"], auto_recover: true, retry_count: 3, retry_delay: 5000, fallback: None },
    ErrorDef { code: "NET_TIMEOUT", severity: "warning", message: "Request timed out", user_message: "The request took too long. Check your connection and try again.", strategies: &["retry", "ignore"], auto_recover: true, retry_count: 2, retry_delay: 2000, fallback: None },
    ErrorDef { code: "NET_SERVER_ERROR", severity: "error", message: "Server error", user_message: "The server encountered an error. Please try again later.", strategies: &["retry", "report"], auto_recover: true, retry_count: 2, retry_delay: 3000, fallback: None },
    ErrorDef { code: "ACTION_NOT_FOUND", severity: "warning", message: "Action not found", user_message: "This action is no longer available.", strategies: &["ignore"], auto_recover: false, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "ACTION_INVALID_INPUT", severity: "warning", message: "Invalid action input", user_message: "The action received invalid input. Please check and try again.", strategies: &["manual", "ignore"], auto_recover: false, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "ACTION_EXECUTION_FAILED", severity: "error", message: "Action execution failed", user_message: "The action could not complete. It has been safely cancelled.", strategies: &["retry", "ignore"], auto_recover: false, retry_count: 1, retry_delay: 500, fallback: None },
    ErrorDef { code: "MEDIA_UNSUPPORTED_FORMAT", severity: "warning", message: "Unsupported media format", user_message: "This file format is not supported.", strategies: &["ignore"], auto_recover: false, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "MEDIA_CORRUPTED", severity: "error", message: "Media file is corrupted", user_message: "This file appears to be damaged and cannot be opened.", strategies: &["ignore"], auto_recover: false, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "MEDIA_TOO_LARGE", severity: "warning", message: "Media file is too large", user_message: "This file is too large to process. Maximum size is 100MB.", strategies: &["ignore"], auto_recover: false, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "SYS_OUT_OF_MEMORY", severity: "critical", message: "Out of memory", user_message: "Dex is running low on memory. Some operations have been paused.", strategies: &["restart", "manual"], auto_recover: false, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "SYS_CPU_OVERLOAD", severity: "warning", message: "CPU overload detected", user_message: "Your system is under heavy load. Performance may be affected.", strategies: &["ignore"], auto_recover: true, retry_count: 0, retry_delay: 0, fallback: None },
    ErrorDef { code: "SYS_PROCESS_CRASH", severity: "critical", message: "Process crashed", user_message: "An unexpected error occurred. Dex is recovering...", strategies: &["restart"], auto_recover: true, retry_count: 1, retry_delay: 1000, fallback: None },
    ErrorDef { code: "DB_CONNECTION_FAILED", severity: "error", message: "Database connection failed", user_message: "Could not access stored data. Retrying...", strategies: &["retry", "fallback"], auto_recover: true, retry_count: 3, retry_delay: 1000, fallback: Some("Use cached data") },
    ErrorDef { code: "DB_CORRUPT", severity: "critical", message: "Database corruption detected", user_message: "Your data may be corrupted. Attempting recovery...", strategies: &["fallback", "manual"], auto_recover: true, retry_count: 0, retry_delay: 0, fallback: Some("Restore from backup") },
    ErrorDef { code: "UNKNOWN", severity: "error", message: "Unknown error occurred", user_message: "Something went wrong. Please try again.", strategies: &["retry", "ignore", "report"], auto_recover: false, retry_count: 1, retry_delay: 500, fallback: None },
];

/// getErrorInfo(code): catalog lookup, falling back to UNKNOWN (matches the
/// Electron handlers that use `errorCatalog.get(code) || get('UNKNOWN')`).
fn catalog_get(code: &str) -> &'static ErrorDef {
    ERROR_CATALOG
        .iter()
        .find(|d| d.code == code)
        .or_else(|| ERROR_CATALOG.iter().find(|d| d.code == "UNKNOWN"))
        .expect("UNKNOWN is always present in ERROR_CATALOG")
}

/// Serialize an ErrorDef to the same JSON shape getErrorInfo() returned.
fn def_to_json(d: &ErrorDef) -> Value {
    let mut obj = Map::new();
    obj.insert("code".into(), json!(d.code));
    obj.insert("severity".into(), json!(d.severity));
    obj.insert("message".into(), json!(d.message));
    obj.insert("userMessage".into(), json!(d.user_message));
    obj.insert("recoveryStrategies".into(), json!(d.strategies));
    obj.insert("autoRecover".into(), json!(d.auto_recover));
    obj.insert("retryCount".into(), json!(d.retry_count));
    obj.insert("retryDelay".into(), json!(d.retry_delay));
    if let Some(fb) = d.fallback {
        obj.insert("fallback".into(), json!(fb));
    }
    Value::Object(obj)
}

// --- log persistence helpers ------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn write_records(app: &tauri::AppHandle, records: Vec<Value>) {
    let payload = json!({ "records": records });
    if let Ok(raw) = serde_json::to_string(&payload) {
        let _ = std::fs::write(store_path(app, LOG_FILE), raw);
    }
}

/// Find a record by id, run `mutate` on it, persist the log, and return the
/// (possibly mutated) record. Returns None when no record matches.
fn mutate_record<F: FnOnce(&mut Value)>(
    app: &tauri::AppHandle,
    failure_id: &str,
    mutate: F,
) -> Option<Value> {
    let mut records = read_records(app);
    let idx = records
        .iter()
        .position(|r| record_str(r, "id") == failure_id)?;
    mutate(&mut records[idx]);
    let updated = records[idx].clone();
    write_records(app, records);
    Some(updated)
}

fn find_record(app: &tauri::AppHandle, failure_id: &str) -> Option<Value> {
    read_records(app)
        .into_iter()
        .find(|r| record_str(r, "id") == failure_id)
}

// --- recover (attemptRecovery) ----------------------------------------------
//
// Args: [failureId, strategy]. Mirrors attemptRecovery(failureId, strategy).
fn recover(app: &tauri::AppHandle, args: &Value) -> Value {
    let failure_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let strategy = args.get(1).and_then(|v| v.as_str()).unwrap_or("manual");

    // attemptRecovery first looks the record up; missing -> failure (parity).
    let record = match find_record(app, failure_id) {
        Some(r) => r,
        None => {
            return json!({
                "success": false,
                "strategy": strategy,
                "message": "Failure record not found",
            });
        }
    };
    let _def = catalog_get(record_str(&record, "code"));

    match strategy {
        // Native: mark the record resolved-by-ignore and persist it.
        "ignore" => {
            mutate_record(app, failure_id, |r| {
                if let Some(o) = r.as_object_mut() {
                    o.insert("recovered".into(), json!(true));
                    o.insert("recoveryStrategy".into(), json!("ignore"));
                }
            });
            json!({ "success": true, "strategy": "ignore" })
        }
        // Native: relaunch the running app (Electron used app.relaunch/exit).
        "restart" => {
            mutate_record(app, failure_id, |r| {
                if let Some(o) = r.as_object_mut() {
                    o.insert("recovered".into(), json!(true));
                    o.insert("recoveryStrategy".into(), json!("restart"));
                }
            });
            // Emit so the renderer can react before the process is replaced.
            crate::native_ops::emit_event(
                app,
                "failure:recovered",
                &json!({ "id": failure_id, "strategy": "restart" }),
            );
            app.restart()
        }
        // `retry`/`fallback` required a live operation handler to answer the 5s
        // round-trip Electron emitted; no such consumer exists in the data tier.
        // Emit the request (so a future handler could observe it) then degrade.
        "retry" | "fallback" => {
            crate::native_ops::emit_event(
                app,
                "failure:recoveryRequest",
                &json!({ "id": failure_id, "strategy": strategy,
                         "context": record.get("context").cloned().unwrap_or(Value::Null) }),
            );
            json!({
                "success": false,
                "strategy": strategy,
                "message": "no live operation handler (needs native runtime)",
            })
        }
        other => json!({ "success": false, "strategy": other, "message": "Unknown strategy" }),
    }
}

// --- escalate ----------------------------------------------------------------
//
// No Electron channel existed; this is an escalate verb. Native: find the
// record, mark it escalated in the persisted log, and push the same renderer
// events notifyUser()/broadcastFailure() emitted (failure:notify +
// failure:occurred). Args: [failureId].
fn escalate(app: &tauri::AppHandle, args: &Value) -> Value {
    let failure_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let record = match find_record(app, failure_id) {
        Some(r) => r,
        None => return json!({ "success": false, "error": "Failure record not found" }),
    };
    let def = catalog_get(record_str(&record, "code"));

    let escalated = mutate_record(app, failure_id, |r| {
        if let Some(o) = r.as_object_mut() {
            o.insert("escalated".into(), json!(true));
            o.insert("escalatedAt".into(), json!(now_ms()));
        }
    });

    // notifyUser(): send a toast payload for non-critical, dialog text otherwise.
    crate::native_ops::emit_event(
        app,
        "failure:notify",
        &json!({
            "id": failure_id,
            "severity": record_str(&record, "severity"),
            "message": record_str(&record, "userMessage"),
            "recoverable": !def.strategies.is_empty(),
        }),
    );
    // broadcastFailure(): the full record to all windows.
    crate::native_ops::emit_event(
        app,
        "failure:occurred",
        escalated.as_ref().unwrap_or(&record),
    );

    json!({
        "success": true,
        "id": failure_id,
        "severity": def.severity,
        "record": escalated.unwrap_or(record),
    })
}

// --- analyze -----------------------------------------------------------------
//
// Error-catalog / recovery analysis path. Fully native: given a code OR a
// failureId, resolve the catalog definition and return it plus a recovery
// analysis (strategy plan, auto-recover plan) and the live log stats. Args:
// [codeOrFailureId?]. With no arg it returns the catalog + stats overview.
fn analyze(app: &tauri::AppHandle, args: &Value) -> Value {
    let arg = args.get(0).and_then(|v| v.as_str()).unwrap_or("");

    // Resolve a target record (when arg is a failureId) and/or a code.
    let record = if arg.is_empty() { None } else { find_record(app, arg) };
    let code = match &record {
        Some(r) => record_str(r, "code").to_string(),
        None => arg.to_string(),
    };

    // No usable target -> catalog overview + stats (still a real, useful answer).
    if code.is_empty() {
        let catalog: Vec<Value> = ERROR_CATALOG.iter().map(def_to_json).collect();
        return json!({
            "success": true,
            "catalog": catalog,
            "stats": get_stats(app),
        });
    }

    let def = catalog_get(&code);
    let primary = def.strategies.first().copied().unwrap_or("manual");
    let auto = def.auto_recover && def.retry_count > 0;

    json!({
        "success": true,
        "code": def.code,
        "definition": def_to_json(def),
        "record": record.unwrap_or(Value::Null),
        "analysis": {
            "primaryStrategy": primary,
            "availableStrategies": def.strategies,
            "willAutoRecover": auto,
            "retryPlan": {
                "count": def.retry_count,
                "delayMs": def.retry_delay,
                "maxWaitMs": def.retry_count * def.retry_delay,
            },
            "fallback": def.fallback,
            "requiresUser": def.strategies.contains(&"manual"),
        },
        "stats": get_stats(app),
    })
}

/// Route a `failure:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Data channels plus the recover/escalate/analyze
/// verbs are ported with real native code; only the live-runtime retry/fallback
/// recovery path degrades honestly.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // Data channels (getLog == Electron `failure:history`).
        "failure:getLog" | "failure:history" => get_log(app),
        "failure:getStats" | "failure:stats" => get_stats(app),
        // Heavy channels — real native implementations.
        "failure:recover" => recover(app, args),
        "failure:escalate" => escalate(app, args),
        "failure:analyze" => analyze(app, args),
        _ => Value::Null,
    }
}
