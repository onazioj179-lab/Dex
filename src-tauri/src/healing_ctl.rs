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
// CHANNELS PORTED (heavy — real native diagnose/heal/mutate):
//   - healing:runCheck      runs every state validator with REAL native code (fs
//                           read+JSON-parse of settings.json/workflows.json, RSS
//                           via sysinfo), attempts real recovery (settings.json
//                           restore from .backup / fresh `{}`), appends un-
//                           recovered issues to corruptionHistory (capped 100),
//                           updates consecutiveFailures + lastHealthCheck, emits
//                           a `healing:health` push event, returns HealthReport.
//   - healing:rollback      real fs restore: copies every file in the checkpoint
//                           dir back over userData, taking a `.pre-rollback` copy
//                           of each existing target first. Returns bool.
//   - healing:updateConfig  shallow-merges + persists the config (typed-guarded).
//                           Returns the merged config. The Electron setInterval
//                           timer re-arm is a no-op here (checks are on-demand via
//                           runCheck, no live interval in this tier) — see the
//                           DIVERGENCE note on update_config.
//
// DIVERGENCES (documented):
//   - TIME: Electron used Date.now(); we use SystemTime epoch millis. The 24h
//     recency window in getHealth therefore keys off the host clock identically.
//   - getHealth/getCorruptionHistory are pure reads here. In Electron, getHealth
//     is also a pure read (it does NOT run validators — that's runCheck), so this
//     is faithful, not a degrade.
//   - USERDATA ROOT: Electron used app.getPath('userData'); the faithful Tauri
//     analog here is app_data_dir() (where self-healing.json already lives), so
//     the validators/recovery/rollback operate on settings.json, workflows.json,
//     and checkpoints/ under that same root.
//   - MEMORY: Electron checked V8 heapUsed; the portable native analog is this
//     process's resident set size (sysinfo process.memory()), same < 1 GB bound.
//   - The `global.gc()` memory recovery has no portable native trigger, so it
//     reports false (faithful to the Electron global.gc-absent branch).
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

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
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Persist the full store object back to `self-healing.json` (electron-store
// writes the entire JSON file on every `.set`). We read-modify-write the same
// file so the renderer's reads (get_config/get_health/...) observe the change.
fn write_store(app: &tauri::AppHandle, store: &Value) {
    if let Ok(s) = serde_json::to_string_pretty(store) {
        let _ = std::fs::write(store_path(app), s);
    }
}

// Mutate one top-level key on the store object, creating the object if the file
// was missing/non-object. Mirrors `healingStore.set(key, value)`.
fn store_set(app: &tauri::AppHandle, key: &str, value: Value) {
    let mut store = read_store(app);
    if !store.is_object() {
        store = json!({});
    }
    if let Some(obj) = store.as_object_mut() {
        obj.insert(key.to_string(), value);
    }
    write_store(app, &store);
}

// userData root. Electron used app.getPath('userData'); the store file already
// lives in app_data_dir(), so that is the faithful root for checkpoints + the
// settings/workflows stores the validators inspect.
fn user_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
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

// SelfHealingManager.getSeverity(component).
fn get_severity(component: &str) -> &'static str {
    let critical = ["encryption", "auth"];
    let high = ["settings", "workflows", "automations"];
    let medium = ["memory", "cache"];
    if critical.contains(&component) {
        "critical"
    } else if high.contains(&component) {
        "high"
    } else if medium.contains(&component) {
        "medium"
    } else {
        "low"
    }
}

// One state validator. Mirrors the three registerDefaultValidators entries:
//   settings : settings.json must be absent OR parse as JSON.
//   workflows: workflows.json must be absent OR parse, with `.workflows` (or the
//              root) being an array.
//   memory   : this process's RSS must be under 1 GB.
// Unknown components have no validator (Electron only registered these three) so
// they are reported valid.
fn run_validator(app: &tauri::AppHandle, component: &str) -> bool {
    match component {
        "settings" => {
            let p = user_data_dir(app).join("settings.json");
            match std::fs::read_to_string(&p) {
                Ok(raw) => serde_json::from_str::<Value>(&raw).is_ok(),
                // Missing file (or unreadable) -> Electron treats no file as valid.
                Err(_) => !p.exists(),
            }
        }
        "workflows" => {
            let p = user_data_dir(app).join("workflows.json");
            match std::fs::read_to_string(&p) {
                Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                    Ok(data) => {
                        let inner = data.get("workflows").unwrap_or(&data);
                        inner.is_array()
                    }
                    Err(_) => false,
                },
                Err(_) => !p.exists(),
            }
        }
        "memory" => {
            // process.memoryUsage().heapUsed < 1 GB. The portable native analog
            // is this process's resident set size via sysinfo.
            use sysinfo::{Pid, System};
            let mut sys = System::new();
            sys.refresh_processes();
            let pid = Pid::from_u32(std::process::id());
            let rss_bytes = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
            let rss_mb = rss_bytes as f64 / 1024.0 / 1024.0;
            rss_mb < 1024.0
        }
        _ => true,
    }
}

// recoveryActions for a component. Returns true on success.
//   settings: copy settings.json.backup over settings.json, else write `{}`.
//   memory  : Electron called global.gc() if exposed; there is no portable
//             native GC trigger, so this is a no-op that reports false (matches
//             the Electron branch where global.gc is undefined -> return false).
// Unknown components have no recovery action -> false.
fn attempt_recovery(app: &tauri::AppHandle, component: &str) -> bool {
    match component {
        "settings" => {
            let settings = user_data_dir(app).join("settings.json");
            let backup = user_data_dir(app).join("settings.json.backup");
            if backup.exists() {
                std::fs::copy(&backup, &settings).is_ok()
            } else {
                std::fs::write(&settings, "{}").is_ok()
            }
        }
        // No portable native GC; honest false (the global.gc-absent branch).
        "memory" => false,
        _ => false,
    }
}

// healing:runCheck -> runHealthCheck(). Runs every validator, attempts
// auto-recovery when enabled, appends un-recovered issues to corruptionHistory
// (capped at 100), updates consecutiveFailures + lastHealthCheck, emits a push
// event, and returns the same HealthReport shape as getHealth.
fn run_check(app: &tauri::AppHandle) -> Value {
    let cfg = get_config(app);
    let auto_recover = cfg.get("autoRecover").and_then(|v| v.as_bool()).unwrap_or(true);

    // Validator order matches the Map insertion order in Electron.
    let components = ["settings", "workflows", "memory"];
    let mut issues: Vec<Value> = Vec::new();
    let mut status = "healthy";
    let mut history = corruption_history(app);

    for component in components {
        let is_valid = run_validator(app, component);
        if is_valid {
            continue;
        }
        let now = now_ms();
        let mut report = json!({
            "id": format!("corruption_{}_{}", now, component),
            "detectedAt": now,
            "component": component,
            "severity": get_severity(component),
            "description": format!("State validation failed for {}", component),
            "autoRecovered": false,
            "recoveryAction": Value::Null,
        });

        if auto_recover {
            let recovered = attempt_recovery(app, component);
            report["autoRecovered"] = json!(recovered);
            report["recoveryAction"] = if recovered {
                json!("auto-recovery")
            } else {
                Value::Null
            };
        }

        let recovered = report.get("autoRecovered").and_then(|v| v.as_bool()).unwrap_or(false);
        if !recovered {
            let sev = report.get("severity").and_then(|v| v.as_str()).unwrap_or("low");
            status = worst_status(status, sev);
            issues.push(report.clone());
        }

        // Log corruption regardless of recovery (matches Electron), cap at 100.
        history.push(report);
        if history.len() > 100 {
            let drop = history.len() - 100;
            history.drain(0..drop);
        }
    }

    // Persist the mutated subsystem state.
    store_set(app, "corruptionHistory", json!(history));
    let prev_failures = read_store(app)
        .get("consecutiveFailures")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let consecutive = if issues.is_empty() { 0 } else { prev_failures + 1 };
    store_set(app, "consecutiveFailures", json!(consecutive));
    let now = now_ms();
    store_set(app, "lastHealthCheck", json!(now));

    let auto_recoveries = history
        .iter()
        .filter(|c| c.get("autoRecovered").and_then(|v| v.as_bool()).unwrap_or(false))
        .count();

    let report = json!({
        "status": status,
        "lastCheck": now,
        "checksPerformed": history.len(),
        "corruptionsDetected": history.len(),
        "autoRecoveries": auto_recoveries,
        "currentIssues": issues,
    });

    // Push the fresh report to the renderer (Electron's health-update channel
    // analog; renderer subscribers refresh on it). Best-effort.
    crate::native_ops::emit_event(app, "healing:health", &report);

    report
}

// healing:rollback -> rollbackToCheckpoint(checkpointId). Restores every file in
// the checkpoint dir over userData, taking a `.pre-rollback` copy of each
// existing target first. Returns a bool (Electron returns Promise<boolean>).
fn rollback(app: &tauri::AppHandle, checkpoint_id: &str) -> Value {
    let cps = checkpoints(app);
    let exists = cps
        .iter()
        .any(|c| c.get("id").and_then(|v| v.as_str()) == Some(checkpoint_id));
    if !exists {
        return json!(false);
    }

    let user_data = user_data_dir(app);
    let checkpoint_path = user_data.join("checkpoints").join(checkpoint_id);
    if !checkpoint_path.exists() {
        return json!(false);
    }

    let entries = match std::fs::read_dir(&checkpoint_path) {
        Ok(e) => e,
        Err(_) => return json!(false),
    };

    for entry in entries.flatten() {
        let source = entry.path();
        if !source.is_file() {
            continue;
        }
        let file_name = match source.file_name() {
            Some(n) => n.to_owned(),
            None => continue,
        };
        let dest = user_data.join(&file_name);
        // Backup current before restoring.
        if dest.exists() {
            let mut backup = dest.clone().into_os_string();
            backup.push(".pre-rollback");
            let _ = std::fs::copy(&dest, PathBuf::from(backup));
        }
        if std::fs::copy(&source, &dest).is_err() {
            return json!(false);
        }
    }

    json!(true)
}

// healing:updateConfig -> updateConfig(updates). Shallow-merges the partial
// config over the stored config and persists it, returning the merged config
// (Electron returns the updated SelfHealingConfig).
//
// DIVERGENCE: Electron also re-armed a live setInterval health timer when
// checkIntervalMs changed. There is no live interval in this data tier (checks
// are on-demand via runCheck), so the timer re-arm is a no-op here. The config
// value is persisted faithfully, so the next runCheck honours it.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut config = get_config(app);
    if let (Some(cfg_obj), Some(upd_obj)) = (config.as_object_mut(), updates.as_object()) {
        for (k, v) in upd_obj {
            // Only merge known config fields with the right type, so a malformed
            // partial cannot corrupt the stored shape.
            match k.as_str() {
                "enabled" | "autoRecover" | "notifyOnRecovery" => {
                    if v.is_boolean() {
                        cfg_obj.insert(k.clone(), v.clone());
                    }
                }
                "checkIntervalMs" | "maxCheckpoints" => {
                    if v.is_i64() || v.is_u64() {
                        cfg_obj.insert(k.clone(), v.clone());
                    }
                }
                _ => {}
            }
        }
    }
    store_set(app, "config", config.clone());
    config
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
        // Heavy channels — now ported with real native behaviour.
        "healing:runCheck" => run_check(app),
        "healing:rollback" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            rollback(app, id)
        }
        "healing:updateConfig" => {
            let updates = args.get(0).cloned().unwrap_or_else(|| json!({}));
            update_config(app, &updates)
        }
        _ => Value::Null,
    }
}
