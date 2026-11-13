// =============================================================================
// DEX Tauri — System Advisory subsystem (port of core/SystemAdvisoryService.ts).
//
// JSON-backed tier (same precedent as analytics.rs). Electron used a single
// `electron-store` named `system-advisory` (-> `system-advisory.json` under
// userData) holding four top-level keys: { config, activeAdvisories,
// dismissedIds, stats }. This mirrors the file name and the wrapper exactly so
// the renderer is unchanged.
//
// electron-store semantics: a store opened with `defaults` returns the default
// value for any key that has never been written. So on a cold/partial store,
// `advisoryStore.get('config')` yields the full default AdvisoryConfig, and on a
// populated store it yields whatever was persisted. We reproduce both: read the
// file's keys if present, otherwise return the documented defaults, and fill any
// missing field from the defaults so the shape is always complete.
//
// PORTED (all native, file-backed — no live engine required):
//   - advisory:getConfig    -> AdvisoryConfig
//   - advisory:getActive    -> Advisory[]  (drops expired first, like Electron's
//                              cleanExpiredAdvisories(); persists the pruned list)
//   - advisory:dismiss      -> boolean     (active.splice + dismissedIds key +
//                              stats.totalDismissed++)
//   - advisory:act          -> boolean     (runs the matching action handler,
//                              then dismiss; stats.totalActedOn++)
//   - advisory:updateConfig -> AdvisoryConfig (shallow merge onto stored config)
//
// Action handlers: Electron registered three default handlers
// ('clear-cache', 'compact-memory' [global.gc()], 'run-maintenance') that were
// effectively no-ops / best-effort and never threw. Natively there is no engine
// to drive and no portable no-dep GC, so the known handlers are treated as
// best-effort no-ops that succeed — preserving Electron's observable result
// (actOn returns true and the advisory is dismissed). actOn returns false only
// when the advisory is missing or has no actionId, matching the TS guard.
//
// Note: the Electron `suggest()` creation pipeline is internal (no IPC channel),
// so there is nothing to port for it; `advisory:new` is pushed only from
// suggest() and thus is never emitted here.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const STORE_FILE: &str = "system-advisory.json";

// --- file IO (mirrors analytics.rs) -----------------------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_file(app: &tauri::AppHandle, name: &str, value: &Value) {
    if let Ok(raw) = serde_json::to_string_pretty(value) {
        let _ = crate::write_atomic(store_path(app, name), raw);
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- store readers (electron-store key-granularity defaults) -----------------

// electron-store `config` defaults (verbatim from the TS store `defaults`).
fn default_config() -> Value {
    json!({
        "enabled": true,
        "showPerformance": true,
        "showMemory": true,
        "showBattery": true,
        "showStorage": true,
        "showMaintenance": true,
        "showUsagePatterns": false,
        "showFeatureTips": true,
        "maxActiveAdvisories": 3,
        "quietHoursStart": Value::Null,
        "quietHoursEnd": Value::Null,
        "minPriority": "low"
    })
}

fn default_stats() -> Value {
    json!({
        "totalShown": 0,
        "totalDismissed": 0,
        "totalActedOn": 0,
        "typeBreakdown": {
            "performance": 0,
            "memory": 0,
            "battery": 0,
            "storage": 0,
            "maintenance": 0,
            "usage-pattern": 0,
            "feature-tip": 0
        }
    })
}

/// advisoryStore.get('config') — persisted config merged over the defaults so
/// the returned object always has the complete shape (electron-store merges
/// defaults per top-level key; we keep field-level completeness).
fn get_config(app: &tauri::AppHandle) -> Value {
    let defaults = default_config();
    let stored = read_file(app, STORE_FILE);
    match stored.get("config").and_then(|v| v.as_object()) {
        Some(obj) => {
            let mut out = defaults.as_object().cloned().unwrap_or_default();
            for (k, v) in obj {
                out.insert(k.clone(), v.clone());
            }
            Value::Object(out)
        }
        None => defaults,
    }
}

/// advisoryStore.get('activeAdvisories') — persisted array or [].
fn get_active_raw(store: &Value) -> Vec<Value> {
    store
        .get("activeAdvisories")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

/// Read the whole store as a mutable object, filling the four top-level keys
/// from defaults so every writer sees a complete shape (electron-store parity).
fn read_store(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    let stored = read_file(app, STORE_FILE);
    let mut map = stored.as_object().cloned().unwrap_or_default();
    map.entry("config".to_string()).or_insert_with(default_config);
    map.entry("activeAdvisories".to_string())
        .or_insert_with(|| Value::Array(vec![]));
    map.entry("dismissedIds".to_string())
        .or_insert_with(|| Value::Array(vec![]));
    map.entry("stats".to_string()).or_insert_with(default_stats);
    map
}

// --- channel implementations -------------------------------------------------

/// advisory:getActive — cleanExpiredAdvisories() then return active list.
/// Mirrors the TS: filter out advisories whose `expiresAt` is non-null and in
/// the past, persist only if the count changed, return the (possibly pruned)
/// list.
fn get_active(app: &tauri::AppHandle) -> Value {
    let stored = read_file(app, STORE_FILE);
    let active = get_active_raw(&stored);
    let now = now_ms();

    let filtered: Vec<Value> = active
        .iter()
        .filter(|a| match a.get("expiresAt") {
            Some(Value::Number(n)) => n.as_i64().map(|e| e > now).unwrap_or(true),
            _ => true, // null / missing -> never expires
        })
        .cloned()
        .collect();

    if filtered.len() != active.len() {
        let mut map = read_store(app);
        map.insert(
            "activeAdvisories".to_string(),
            Value::Array(filtered.clone()),
        );
        write_file(app, STORE_FILE, &Value::Object(map));
    }

    Value::Array(filtered)
}

/// Core of TS dismiss(): remove the advisory from active, add its
/// `${type}_${title}` key to dismissedIds (capped at 50), bump
/// stats.totalDismissed. Operates on the already-read store map so act() can
/// reuse it without a second read. Returns whether an advisory was removed.
fn dismiss_in_map(map: &mut serde_json::Map<String, Value>, advisory_id: &str) -> bool {
    let active = map
        .get("activeAdvisories")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let index = active
        .iter()
        .position(|a| a.get("id").and_then(|v| v.as_str()) == Some(advisory_id));

    let index = match index {
        Some(i) => i,
        None => return false,
    };

    let advisory = active[index].clone();
    let a_type = advisory
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let a_title = advisory
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Remove from active.
    let mut new_active = active;
    new_active.remove(index);
    map.insert("activeAdvisories".to_string(), Value::Array(new_active));

    // Add dismissed key (dedupe, cap to most-recent 50).
    let key = format!("{}_{}", a_type, a_title);
    let mut dismissed = map
        .get("dismissedIds")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let already = dismissed
        .iter()
        .any(|v| v.as_str() == Some(key.as_str()));
    if !already {
        dismissed.push(Value::String(key));
        if dismissed.len() > 50 {
            let start = dismissed.len() - 50;
            dismissed.drain(0..start);
        }
        map.insert("dismissedIds".to_string(), Value::Array(dismissed));
    }

    increment_stat(map, "totalDismissed");
    true
}

/// stats.totalDismissed++ / totalActedOn++ / totalShown++ in place.
fn increment_stat(map: &mut serde_json::Map<String, Value>, key: &str) {
    let stats_val = map.get("stats").cloned();
    let mut stats = match stats_val.as_ref().and_then(|v| v.as_object()) {
        Some(obj) => {
            // Merge over defaults to be shape-complete.
            let mut out = default_stats().as_object().cloned().unwrap_or_default();
            for (k, v) in obj {
                out.insert(k.clone(), v.clone());
            }
            out
        }
        None => default_stats().as_object().cloned().unwrap_or_default(),
    };
    let current = stats.get(key).and_then(|v| v.as_i64()).unwrap_or(0);
    stats.insert(key.to_string(), json!(current + 1));
    map.insert("stats".to_string(), Value::Object(stats));
}

/// advisory:dismiss(id) -> boolean.
fn dismiss(app: &tauri::AppHandle, advisory_id: &str) -> Value {
    let mut map = read_store(app);
    let removed = dismiss_in_map(&mut map, advisory_id);
    if removed {
        write_file(app, STORE_FILE, &Value::Object(map));
    }
    Value::Bool(removed)
}

/// Whether an action id corresponds to a known best-effort handler. Electron
/// registered 'clear-cache', 'compact-memory', 'run-maintenance' as default
/// no-op / best-effort handlers; built-in advisories also reference
/// 'enable-battery-saver' (no handler registered by default). Any actionId is
/// accepted: TS only runs a handler if one is registered and otherwise still
/// succeeds. So this is informational only.
fn run_action_handler(action_id: &str) -> bool {
    // Best-effort no-ops, mirroring the stubbed Electron handlers. There is no
    // portable no-dep equivalent for global.gc(); none of the handlers threw, so
    // all succeed. (Returning true here never changes the result — actOn only
    // fails on a missing advisory / actionId — but keeps the intent explicit.)
    matches!(
        action_id,
        "clear-cache" | "compact-memory" | "run-maintenance"
    )
}

/// advisory:act(id) -> boolean. Find the advisory; require an actionId; run the
/// (best-effort) handler; bump stats.totalActedOn; then dismiss. Returns false
/// only when the advisory is missing or has no actionId (TS guard parity).
fn act(app: &tauri::AppHandle, advisory_id: &str) -> Value {
    let mut map = read_store(app);

    let active = map
        .get("activeAdvisories")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let advisory = active
        .iter()
        .find(|a| a.get("id").and_then(|v| v.as_str()) == Some(advisory_id))
        .cloned();

    let advisory = match advisory {
        Some(a) => a,
        None => return Value::Bool(false),
    };

    let action_id = advisory
        .get("actionId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());

    let action_id = match action_id {
        Some(id) => id.to_string(),
        None => return Value::Bool(false),
    };

    // Run best-effort handler (no-op for the known ids; never throws).
    let _ = run_action_handler(&action_id);

    // stats.totalActedOn++ then dismiss (which also bumps totalDismissed).
    increment_stat(&mut map, "totalActedOn");
    dismiss_in_map(&mut map, advisory_id);
    write_file(app, STORE_FILE, &Value::Object(map));

    Value::Bool(true)
}

/// advisory:updateConfig(partial) -> AdvisoryConfig. Shallow-merge the provided
/// partial onto the stored (defaults-merged) config, persist, return the merged
/// config — exactly TS `{ ...current, ...updates }`.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut current = get_config(app)
        .as_object()
        .cloned()
        .unwrap_or_default();

    if let Some(obj) = updates.as_object() {
        for (k, v) in obj {
            current.insert(k.clone(), v.clone());
        }
    }

    let merged = Value::Object(current);

    let mut map = read_store(app);
    map.insert("config".to_string(), merged.clone());
    write_file(app, STORE_FILE, &Value::Object(map));

    merged
}

/// Route an `advisory:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "advisory:getConfig" => get_config(app),
        "advisory:getActive" => get_active(app),
        "advisory:dismiss" => {
            let id = args
                .get(0)
                .and_then(|v| v.as_str())
                .unwrap_or("");
            dismiss(app, id)
        }
        "advisory:act" => {
            let id = args
                .get(0)
                .and_then(|v| v.as_str())
                .unwrap_or("");
            act(app, id)
        }
        "advisory:updateConfig" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &updates)
        }
        _ => Value::Null,
    }
}
