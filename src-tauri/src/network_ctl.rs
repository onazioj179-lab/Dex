// =============================================================================
// DEX Tauri — Network subsystem status (port of the `network:*` data read in
// src/main/core/NetworkGuard.ts; the task named SecurityController.ts but the
// real network:* data/CRUD surface lives in NetworkGuard).
//
// NAMING NOTE: the migration spec listed the data channel as `network:getStatus`
// and heavy channels `scan` / `monitor` / `block`. NetworkGuard does not use
// those literal channel names. The real channels are `network:summary` (the
// status read) plus a family of live-monitoring channels. We port the status
// read at the channel name NetworkGuard actually exposes — `network:summary` —
// and route the spec's heavy names plus every other live network:* channel to a
// documented degrade. Routing `network:` to this dispatch is therefore NOT
// blanket-safe for the active CRUD channels (config/policy mutation, live
// monitoring) and `prefixRouteSafe` is reported false.
//
// STORAGE divergence vs the templates: NetworkGuard is NOT electron-store and
// NOT DataStore-KV. It is plain fs-json under a `network/` subdirectory of
// userData:
//   - <appData>/network/config.json   : NetworkConfig (object)
//   - <appData>/network/policies.json : NetworkPolicy[]
// We read those exact relative paths under app_data_dir(), matching the file
// names and shapes loadConfig()/loadPolicies() use.
//
// RUNTIME divergence (documented, unavoidable without the native runtime):
// getSummary() blends persisted state (mode from config.json; allowed/blocked
// domain counts from user-defined policies) with IN-MEMORY counters that only
// exist while the live webRequest monitor runs:
//     status            (connectivity probe, defaults 'online')
//     totalBytesIn/Out  (accumulated per request; never persisted -> 0)
//     activeConnections (live socket map size -> 0)
//     blockedAttempts   (live block counter -> 0)
//     uptimeMs          (Date.now() - startTime, process-scoped)
// With no native monitor these are exactly the values a freshly-started Electron
// NetworkGuard returns before any traffic: status 'online', byte/connection/
// blocked counters 0, uptimeMs measured from THIS process start. We reproduce
// that faithfully — same shape, same fresh-process values — rather than fake
// traffic numbers we cannot observe.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Manager;

const CONFIG_FILE: &str = "config.json";
const POLICIES_FILE: &str = "policies.json";

// Default mode mirrors DEFAULT_CONFIG.mode in NetworkGuard.ts.
const DEFAULT_MODE: &str = "full";

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Process-scoped start instant, mirroring NetworkGuard's `startTime = Date.now()`
// (set at construction). uptimeMs is derived from this, so it is honest for the
// current Tauri process rather than a faked value.
fn start_ms() -> u64 {
    static START: OnceLock<u64> = OnceLock::new();
    *START.get_or_init(now_ms)
}

fn network_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("network");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(network_dir(app).join(name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Persisted config mode (config.json -> .mode), defaulting to DEFAULT_CONFIG.mode.
fn config_mode(app: &tauri::AppHandle) -> String {
    read_json(app, CONFIG_FILE)
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_MODE)
        .to_string()
}

// User-defined policies (policies.json), matching the isUserDefined filter in
// getSummary(). Returns (allowedCount, blockedCount).
fn user_policy_counts(app: &tauri::AppHandle) -> (i64, i64) {
    let policies = match read_json(app, POLICIES_FILE) {
        Value::Array(a) => a,
        _ => return (0, 0),
    };
    let mut allowed = 0i64;
    let mut blocked = 0i64;
    for p in &policies {
        let is_user = p.get("isUserDefined").and_then(|v| v.as_bool()).unwrap_or(false);
        if !is_user {
            continue;
        }
        if p.get("allowed").and_then(|v| v.as_bool()).unwrap_or(false) {
            allowed += 1;
        } else {
            blocked += 1;
        }
    }
    (allowed, blocked)
}

// NetworkGuard.getSummary() — the `network:summary` handler (the status read).
// Shape matches the NetworkSummary interface exactly.
fn get_summary(app: &tauri::AppHandle) -> Value {
    let (allowed_domains, blocked_domains) = user_policy_counts(app);
    json!({
        "status": "online",
        "mode": config_mode(app),
        "totalBytesIn": 0,
        "totalBytesOut": 0,
        "activeConnections": 0,
        "blockedAttempts": 0,
        "allowedDomains": allowed_domains,
        "blockedDomains": blocked_domains,
        "uptimeMs": now_ms().saturating_sub(start_ms()),
    })
}

/// Route a `network:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
///
/// Only the status read is ported. Live-monitoring / mutating channels (and the
/// spec's heavy `scan`/`monitor`/`block` names) need the native webRequest
/// monitor + DNS prober + on-disk policy mutation, so they degrade rather than
/// fabricate data. Channels whose renderer callers read a shaped object get a
/// shaped failure; pure reads get Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Ported: the status/summary read.
        "network:summary" | "network:getStatus" => get_summary(app),

        // HEAVY / not ported — need the native runtime. Shaped failure for the
        // spec's heavy channel names and the live-monitor reads the renderer may
        // treat as objects; honest null for everything else in the namespace.
        "network:scan"
        | "network:monitor"
        | "network:block"
        | "network:checkConnectivity"
        | "network:testDomain" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}
