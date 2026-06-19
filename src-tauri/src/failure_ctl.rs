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
// HEAVY channels deliberately NOT ported (need the live native runtime — process
// relaunch, retry/fallback event loops, error-reporting service):
//   - failure:recover  (attemptRecovery: app.relaunch/retry/fallback loops)
//   - failure:escalate (no such Electron channel; an analyze/escalate verb that
//                       would require the live recovery engine)
//   - failure:analyze  (the error-catalog / recovery analysis path)
// These return Value::Null via the prefix route (the renderer has no live data
// consumer for them).
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

/// Route a `failure:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the two DATA channels are ported; the heavy
/// recover/escalate/analyze verbs (live native runtime) return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Data channels (getLog == Electron `failure:history`).
        "failure:getLog" | "failure:history" => get_log(app),
        "failure:getStats" | "failure:stats" => get_stats(app),
        // Heavy channels: not ported (need native runtime). Honest degrade.
        _ => Value::Null,
    }
}
