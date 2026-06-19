// =============================================================================
// DEX Tauri — Logs subsystem (port of utils/Logger.ts, channels logs:get/clear).
//
// The Electron Logger is an IN-MEMORY ring buffer (`private logs: LogEntry[]`,
// capped at maxLogs = 1000), fed by `logger.info/warn/error/success(...)` calls
// across the main process and pushed to the renderer via the `log:new` event.
// It is NOT backed by electron-store — there is no `new Store({name:"logs"})`
// anywhere, so the task's "electron-store:logs" hint does not apply.
//
// STORAGE DIVERGENCE (documented): there is no per-subsystem Tauri process that
// shares one live Logger instance the way the Electron main process did, so a
// purely in-process buffer here would always read back empty and `logs:get`
// could not round-trip. To keep `logs:get` / `logs:clear` coherent and exact in
// shape, this port persists the ring buffer to the native DataStore-KV store
// under the key "logs" (crate::kv_get / crate::kv_set), mirroring the
// modes_dispatch pattern. The same 1000-entry cap is enforced on write.
//
// EXACT SHAPES (match Logger.ts so the renderer is unchanged):
//   LogEntry = { id, timestamp, level, message, data? }
//     level: "info" | "warn" | "error" | "success"
//   logs:get(limit = 100) -> LogEntry[]   (the last `limit` entries, in order)
//   logs:clear()          -> null         (Electron clearLogs() returns void)
//
// SKIPPED (live-window / non-pure-data, no dispatchable channel):
//   - the `log:new` renderer push event (event emission, not a request/response
//     channel) and the addLog/info/warn/error/success writers (driven by live
//     main-process activity + electron-log file transport). These are not in the
//     `logs:` channel namespace and are intentionally not ported.
//
// id format mirrors shared/util/id.ts generateId() ("timestamp-random"); we use
// crate::util::pseudo_uuid_v4() for the random part. timestamps are epoch millis
// from std::time::SystemTime. No Date crate, rand, or Math.random.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};

const STORE_KEY: &str = "logs";
const MAX_LOGS: usize = 1000;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Mirrors generateId() in shared/util/id.ts: "<timestamp>-<random>".
fn generate_id() -> String {
    format!("{}-{}", now_ms(), &pseudo_uuid_v4().replace('-', "")[..9])
}

fn read_logs(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, STORE_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn write_logs(app: &tauri::AppHandle, mut logs: Vec<Value>) {
    // Keep logs within limit (mirrors Logger.addLog: slice(-maxLogs)).
    if logs.len() > MAX_LOGS {
        logs = logs.split_off(logs.len() - MAX_LOGS);
    }
    crate::kv_set(app, STORE_KEY, Value::Array(logs));
}

// getLogs(limit = 100): this.logs.slice(-limit) — the last `limit` entries.
fn get_logs(app: &tauri::AppHandle, limit: i64) -> Value {
    let logs = read_logs(app);
    if limit <= 0 {
        // slice(-0) === slice(0) in JS -> the whole array.
        return json!(logs);
    }
    let n = limit as usize;
    let start = logs.len().saturating_sub(n);
    json!(logs[start..].to_vec())
}

// clearLogs(): this.logs = []; returns void (-> null).
fn clear_logs(app: &tauri::AppHandle) -> Value {
    crate::kv_set(app, STORE_KEY, Value::Array(Vec::new()));
    Value::Null
}

/// Append a log entry (used by future native writers). Not wired to a `logs:`
/// channel here — kept so other Tauri subsystems can feed the same buffer that
/// `logs:get` reads. Mirrors Logger.addLog's entry shape and 1000-entry cap.
#[allow(dead_code)]
pub fn add_log(app: &tauri::AppHandle, level: &str, message: &str, data: Option<&Value>) -> Value {
    let level = match level {
        "warn" | "error" | "success" => level,
        _ => "info",
    };
    let mut entry = serde_json::Map::new();
    entry.insert("id".into(), json!(generate_id()));
    entry.insert("timestamp".into(), json!(now_ms()));
    entry.insert("level".into(), json!(level));
    entry.insert("message".into(), json!(message));
    if let Some(d) = data {
        entry.insert("data".into(), d.clone());
    }
    let entry = Value::Object(entry);

    let mut logs = read_logs(app);
    logs.push(entry.clone());
    write_logs(app, logs);
    entry
}

/// Route a `logs:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; any
/// intentionally-unported channel returns Value::Null (honest degrade), so a
/// `channel.starts_with("logs:")` route to this dispatch is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // getLogs(limit = 100) — default mirrors Logger.getLogs default arg.
        "logs:get" => {
            let limit = args.get(0).and_then(|v| v.as_i64()).unwrap_or(100);
            get_logs(app, limit)
        }
        "logs:clear" => clear_logs(app),
        _ => Value::Null,
    }
}
