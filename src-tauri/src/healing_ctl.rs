// =============================================================================
// DEX Tauri — Self-Healing subsystem (port of the read/data `healing:*` IPC
// handlers in src/main/core/SelfHealingManager.ts).
//
// Pure-data, JSON-backed tier. Electron used a single `electron-store` named
// `self-healing` (so `self-healing.json` under userData) with these top-level
// keys:
//   - config:               SelfHealingConfig
//   - checkpoints:          StateCheckpoint[]
//   - corruptionHistory:    CorruptionReport[]
//   - lastHealthCheck:      number
//   - consecutiveFailures:  number
// This mirrors that exact file (`self-healing.json` under <appData>) and the
// same top-level keys, so the renderer sees identical shapes.
//
// NOTE ON NAMING: the orchestration brief referenced `getStatus`/`getLog` and a
// `heal-log.json` file; the real subsystem in this repo is SelfHealingManager
// with the `healing:*` channels and the `self-healing` store. This port follows
// the ACTUAL source of truth. Mapping of intent:
//   getStatus -> healing:getHealth (HealthReport) + healing:getConfig
//   getLog    -> healing:getCorruptionHistory (CorruptionReport[]) +
//                healing:getCheckpoints (StateCheckpoint[])
//
// CHANNELS PORTED (pure reads — no fs scanning, no recovery, no native timers):
//   - healing:getConfig             -> SelfHealingConfig (stored config, with
//                                      the Electron `defaults` applied field-by-
//                                      field when the store is empty/missing).
//   - healing:getHealth             -> HealthReport. Electron computes status
//                                      from corruptionHistory entries newer than
//                                      24h that were NOT auto-recovered. We
//                                      reproduce that derivation exactly (incl.
//                                      getWorstStatus). `lastCheck` reads the
//                                      stored `lastHealthCheck` (0 default).
//   - healing:getCheckpoints        -> StateCheckpoint[] (stored array, []).
//   - healing:getCorruptionHistory  -> CorruptionReport[]. Electron signature is
//                                      getCorruptionHistory(limit=50) and returns
//                                      history.slice(-limit). The renderer passes
//                                      no arg, so default 50; we honour an
//                                      optional positional limit arg too.
//
// CHANNELS SKIPPED (heavy — need the live native runtime; NOT faked):
//   - healing:runCheck      runs every state validator (fs reads, JSON parse,
//                           process.memoryUsage), attempts recovery actions, and
//                           mutates the store. Diagnose+heal. Returns Value::Null.
//   - healing:rollback      copies checkpoint files back over userData stores
//                           (fs restore / heal). Returns Value::Null.
//   - healing:updateConfig  mutates config AND re-arms native setInterval health
//                           timers; the timer side-effect cannot be reproduced
//                           in this data tier. Returns Value::Null.
//
// DIVERGENCES (documented):
//   - TIME: Electron used Date.now(); we use SystemTime epoch millis. The 24h
//     recency window in getHealth therefore keys off the host clock identically.
//   - getHealth/getCorruptionHistory are pure reads here. In Electron, getHealth
//     is also a pure read (it does NOT run validators — that's runCheck), so this
//     is faithful, not a degrade.
//   - Heavy channels return Value::Null (the prefix route degrades honestly). The
//     renderer treats runCheck/rollback as best-effort native operations.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "self-healing.json";
const DAY_MS: i64 = 86_400_000;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO (electron-store JSON under appData) ----------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// --- defaults (mirror the electron-store `defaults` block) ------------------

fn default_config() -> Value {
    json!({
        "enabled": true,
        "checkIntervalMs": 5 * 60 * 1000,
        "maxCheckpoints": 5,
        "autoRecover": true,
        "notifyOnRecovery": true,
    })
}

// getConfig(): healingStore.get('config'). The store seeds `config` from
// defaults on first use; if any field is missing we apply the same default so
// the shape is always complete.
fn get_config(app: &tauri::AppHandle) -> Value {
    let stored = read_store(app);
    let cfg = stored.get("config");
    let def = default_config();
    let pick_bool = |k: &str| {
        cfg.and_then(|c| c.get(k))
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| def[k].as_bool().unwrap_or(false))
    };
    let pick_i64 = |k: &str| {
        cfg.and_then(|c| c.get(k))
            .and_then(|v| v.as_i64())
            .unwrap_or_else(|| def[k].as_i64().unwrap_or(0))
    };
    json!({
        "enabled": pick_bool("enabled"),
        "checkIntervalMs": pick_i64("checkIntervalMs"),
        "maxCheckpoints": pick_i64("maxCheckpoints"),
        "autoRecover": pick_bool("autoRecover"),
        "notifyOnRecovery": pick_bool("notifyOnRecovery"),
    })
}

fn corruption_history(app: &tauri::AppHandle) -> Vec<Value> {
    read_store(app)
        .get("corruptionHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn checkpoints(app: &tauri::AppHandle) -> Vec<Value> {
    read_store(app)
        .get("checkpoints")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

// SelfHealingManager.getWorstStatus(current, severity).
fn worst_status(current: &str, severity: &str) -> &'static str {
    let order = ["healthy", "degraded", "critical", "recovering"];
    let new_status = match severity {
        "low" | "medium" => "degraded",
        "high" | "critical" => "critical",
        _ => "degraded",
    };
    let cur_idx = order.iter().position(|s| *s == current).unwrap_or(0);
    let new_idx = order.iter().position(|s| *s == new_status).unwrap_or(0);
    if new_idx > cur_idx {
        new_status
    } else {
        // Return the canonical static for `current` (or healthy fallback).
        order.iter().copied().find(|s| *s == current).unwrap_or("healthy")
    }
}

// getHealthReport(): recentIssues = history newer than 24h AND !autoRecovered;
// status folded over those via getWorstStatus.
fn get_health(app: &tauri::AppHandle) -> Value {
    let history = corruption_history(app);
    let now = now_ms();
    let recent: Vec<Value> = history
        .iter()
        .filter(|c| {
            let detected = c.get("detectedAt").and_then(|v| v.as_i64()).unwrap_or(0);
            let auto = c.get("autoRecovered").and_then(|v| v.as_bool()).unwrap_or(false);
            now - detected < DAY_MS && !auto
        })
        .cloned()
        .collect();

    let mut status = "healthy";
    for issue in &recent {
        let sev = issue.get("severity").and_then(|v| v.as_str()).unwrap_or("low");
        status = worst_status(status, sev);
    }

    let last_check = read_store(app)
        .get("lastHealthCheck")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let auto_recoveries = history
        .iter()
        .filter(|c| c.get("autoRecovered").and_then(|v| v.as_bool()).unwrap_or(false))
        .count();

    json!({
        "status": status,
        "lastCheck": last_check,
        "checksPerformed": history.len(),
        "corruptionsDetected": history.len(),
        "autoRecoveries": auto_recoveries,
        "currentIssues": recent,
    })
}

// getCorruptionHistory(limit = 50): history.slice(-limit).
fn get_corruption_history(app: &tauri::AppHandle, limit: usize) -> Value {
    let history = corruption_history(app);
    let start = history.len().saturating_sub(limit);
    json!(history[start..].to_vec())
}

/// Route a `healing:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; the
/// heavy/mutating ones degrade to Value::Null (honest, not faked).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "healing:getConfig" => get_config(app),
        "healing:getHealth" => get_health(app),
        "healing:getCheckpoints" => json!(checkpoints(app)),
        "healing:getCorruptionHistory" => {
            let limit = args
                .get(0)
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
                .unwrap_or(50);
            get_corruption_history(app, limit)
        }
        // Heavy channels — NOT ported, NOT faked (need the native runtime).
        "healing:runCheck" | "healing:rollback" | "healing:updateConfig" => Value::Null,
        _ => Value::Null,
    }
}
