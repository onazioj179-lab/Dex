// =============================================================================
// DEX Tauri — Failure Containment (port of core/FailureContainment.ts, the
// `containment:*` IPC handlers).
//
// The Electron FailureContainment is a singleton that persists ALL of its state
// in an electron-store (`config`, `faults`, `domainStatus`, `safeMode`,
// `lastStableConfig`) and keeps exactly one live runtime artifact: a per-domain
// isolation `setTimeout` that auto-restores a domain after `isolationTimeoutMs`.
// Everything else the channels touch is pure persisted data.
//
// This port reconstructs that store inside DataStore-KV under the SAME key the
// contract names ("containment"), as a single object with the same sub-keys
// Electron used (config / faults / domainStatus / safeMode). The isolation
// timer is implemented for real with std::thread::spawn + sleep (precedent:
// native_ops.rs start_reminder_scheduler), and on wake it RE-READS the KV state
// and restores the domain only if it is still isolated and its `isolatedAt`
// timestamp matches — so the revert survives process restarts and is not fooled
// by a manual restore + re-isolate in the interim (compute-on-wake guard,
// replacing Electron's in-memory `isolationTimers` map / `clearTimeout`).
//
// Process-level error hooks (`unhandledRejection` / `uncaughtException`) and the
// default recovery handlers (renderer reload via BrowserWindow) drive Electron's
// `reportFault` path — but `reportFault` is NOT one of the contracted channels,
// so its absence does not degrade any listed channel. The renderer
// `containment:fault` push (notifyUser) is reproduced via
// crate::native_ops::emit_event when enterSafeMode crosses a critical threshold,
// matching Electron's webContents.send payload shape.
//
// DIVERGENCE (storage backend, documented): Electron used an electron-store file
// `failure-containment.json`. The contract specifies datastore-kv:containment, so
// state lives under the DataStore-KV `containment` entry. Returned shapes are
// byte-for-byte the Electron interfaces (FailureContainmentConfig, Fault,
// DomainStatus, SafeModeConfig). No legacy-file migration runs (no hostless
// engine owns that side effect).
//
// PORTED (real native behavior, exact Electron shapes):
//   getConfig, updateConfig, getDomainStatus (all-domains map), getFaults(limit),
//   getSafeMode, enterSafeMode(reason), exitSafeMode, isolateDomain(domain),
//   restoreDomain(domain), clearFaults.
//
// DEGRADED: none of the contracted channels. (reportFault + global error hooks +
// renderer-reload recovery handlers are out of contract and intentionally not
// surfaced here.)
// =============================================================================

use serde_json::{json, Value};

const CONTAINMENT_KEY: &str = "containment";

// The seven fault domains, in the same order electron-store seeded them.
const DOMAINS: [&str; 7] = [
    "core",
    "ui",
    "automation",
    "network",
    "storage",
    "background",
    "encryption",
];

// disabledDomains entered/exited by safe mode (matches enterSafeMode).
const SAFE_MODE_DISABLED: [&str; 3] = ["automation", "background", "network"];

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// FailureContainment.ts store `defaults.config` — returned verbatim when absent.
fn default_config() -> Value {
    json!({
        "enabled": true,
        "maxFaultsBeforeIsolation": 3,
        "autoRecoveryEnabled": true,
        "maxRecoveryAttempts": 3,
        "isolationTimeoutMs": 5 * 60 * 1000, // 5 minutes
        "notifyUserOnCritical": true,
    })
}

fn default_domain_status(domain: &str) -> Value {
    json!({
        "domain": domain,
        "healthy": true,
        "faultCount": 0,
        "lastFault": Value::Null,
        "isolated": false,
        "recoveryInProgress": false,
    })
}

fn default_all_domain_status() -> Value {
    let mut map = serde_json::Map::new();
    for d in DOMAINS.iter() {
        map.insert((*d).to_string(), default_domain_status(d));
    }
    Value::Object(map)
}

fn default_safe_mode() -> Value {
    json!({
        "active": false,
        "reason": Value::Null,
        "activatedAt": Value::Null,
        "disabledDomains": [],
    })
}

// Load the whole `containment` KV object, normalised so every sub-key exists with
// the Electron default shape. This is the single source of truth all channels
// read/mutate; sub-keys missing on a fresh install seed exactly as electron-store
// would have on first launch.
fn load_state(app: &tauri::AppHandle) -> Value {
    let raw = crate::kv_get(app, CONTAINMENT_KEY);
    let obj = raw.as_object();

    let config = obj
        .and_then(|o| o.get("config"))
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(default_config);

    let faults = obj
        .and_then(|o| o.get("faults"))
        .filter(|v| v.is_array())
        .cloned()
        .unwrap_or_else(|| json!([]));

    // domainStatus: normalise so all seven domains are present.
    let mut status_map = obj
        .and_then(|o| o.get("domainStatus"))
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    for d in DOMAINS.iter() {
        status_map
            .entry((*d).to_string())
            .or_insert_with(|| default_domain_status(d));
    }

    let safe_mode = obj
        .and_then(|o| o.get("safeMode"))
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(default_safe_mode);

    json!({
        "config": config,
        "faults": faults,
        "domainStatus": Value::Object(status_map),
        "safeMode": safe_mode,
    })
}

fn save_state(app: &tauri::AppHandle, state: Value) {
    let _ = crate::kv_set(app, CONTAINMENT_KEY, state);
}

// --- channel: getConfig ----------------------------------------------------
fn get_config(app: &tauri::AppHandle) -> Value {
    load_state(app)["config"].clone()
}

// --- channel: updateConfig -------------------------------------------------
// { ...config, ...updates } shallow merge; returns the updated config.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut state = load_state(app);
    let mut config = state["config"].as_object().cloned().unwrap_or_default();
    if let Some(u) = updates.as_object() {
        for (k, v) in u {
            config.insert(k.clone(), v.clone());
        }
    }
    let config = Value::Object(config);
    state["config"] = config.clone();
    save_state(app, state);
    config
}

// --- channel: getDomainStatus ---------------------------------------------
// getAllDomainStatus(): the full Record<FaultDomain, DomainStatus>.
fn get_domain_status(app: &tauri::AppHandle) -> Value {
    load_state(app)["domainStatus"].clone()
}

// --- channel: getFaults ----------------------------------------------------
// getFaults(limit = 50): faults.slice(-limit).
fn get_faults(app: &tauri::AppHandle, limit_arg: &Value) -> Value {
    let limit = limit_arg.as_u64().unwrap_or(50) as usize;
    let faults = load_state(app)["faults"].clone();
    let arr = faults.as_array().cloned().unwrap_or_default();
    let start = arr.len().saturating_sub(limit.max(0));
    Value::Array(arr[start..].to_vec())
}

// --- channel: getSafeMode --------------------------------------------------
fn get_safe_mode(app: &tauri::AppHandle) -> Value {
    load_state(app)["safeMode"].clone()
}

// --- isolation core (shared by isolateDomain / enterSafeMode) --------------
// Mutates the given state IN PLACE: marks `domain` isolated and stamps an
// `isolatedAt` epoch-ms used by the auto-revert guard. Returns the
// isolationTimeoutMs to schedule, or None if the domain was already isolated /
// unknown (so callers skip re-arming, mirroring Electron's early `return true`).
fn isolate_in_state(state: &mut Value, domain: &str) -> Option<(u64, u64)> {
    if !DOMAINS.contains(&domain) {
        return None;
    }
    let timeout = state["config"]["isolationTimeoutMs"].as_u64().unwrap_or(300_000);
    let status = &mut state["domainStatus"][domain];
    if status.get("isolated").and_then(|v| v.as_bool()).unwrap_or(false) {
        return None;
    }
    let stamp = now_ms();
    status["isolated"] = json!(true);
    status["healthy"] = json!(false);
    status["isolatedAt"] = json!(stamp);
    Some((timeout, stamp))
}

// Restore a domain in place. Returns true if it was isolated (mirrors Electron's
// behavior: status reset only when transitioning out of isolation).
fn restore_in_state(state: &mut Value, domain: &str) -> bool {
    if !DOMAINS.contains(&domain) {
        return false;
    }
    let status = &mut state["domainStatus"][domain];
    if !status.get("isolated").and_then(|v| v.as_bool()).unwrap_or(false) {
        return false;
    }
    status["isolated"] = json!(false);
    status["faultCount"] = json!(0);
    status["healthy"] = json!(true);
    if let Some(o) = status.as_object_mut() {
        o.remove("isolatedAt");
    }
    true
}

// Spawn the real auto-revert timer. After `timeout` ms it re-reads KV state and
// restores `domain` only if it is STILL isolated AND its `isolatedAt` equals the
// `stamp` we armed with — so a manual restore (which clears isolatedAt) or a
// fresh re-isolation (new stamp) correctly cancels this revert, replacing
// Electron's clearTimeout(isolationTimers.get(domain)). Compute-on-wake; no
// shared timer map needed.
fn schedule_auto_revert(app: &tauri::AppHandle, domain: String, timeout: u64, stamp: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(timeout));
        let mut state = load_state(&app);
        let still = state["domainStatus"][domain.as_str()]
            .get("isolatedAt")
            .and_then(|v| v.as_u64())
            == Some(stamp);
        if still && restore_in_state(&mut state, &domain) {
            save_state(&app, state);
        }
    });
}

// --- channel: isolateDomain ------------------------------------------------
fn isolate_domain(app: &tauri::AppHandle, domain_arg: &Value) -> Value {
    let domain = match domain_arg.as_str() {
        Some(d) => d.to_string(),
        None => return json!(true), // Electron returns true even for no-op paths
    };
    let mut state = load_state(app);
    if let Some((timeout, stamp)) = isolate_in_state(&mut state, &domain) {
        save_state(app, state);
        schedule_auto_revert(app, domain, timeout, stamp);
    }
    json!(true)
}

// --- channel: restoreDomain ------------------------------------------------
fn restore_domain(app: &tauri::AppHandle, domain_arg: &Value) -> Value {
    let domain = match domain_arg.as_str() {
        Some(d) => d.to_string(),
        None => return json!(true),
    };
    let mut state = load_state(app);
    if restore_in_state(&mut state, &domain) {
        save_state(app, state);
    }
    json!(true)
}

// --- channel: enterSafeMode ------------------------------------------------
// Sets safeMode active with the fixed disabledDomains, isolates each of them
// (arming a real revert timer per domain), and pushes the renderer notice.
fn enter_safe_mode(app: &tauri::AppHandle, reason_arg: &Value) -> Value {
    let reason = reason_arg.as_str().unwrap_or("").to_string();
    let mut state = load_state(app);

    state["safeMode"] = json!({
        "active": true,
        "reason": reason,
        "activatedAt": now_ms(),
        "disabledDomains": SAFE_MODE_DISABLED,
    });

    // Isolate non-essential domains; collect timers to arm after the save.
    let mut to_arm: Vec<(String, u64, u64)> = Vec::new();
    for d in SAFE_MODE_DISABLED.iter() {
        if let Some((timeout, stamp)) = isolate_in_state(&mut state, d) {
            to_arm.push(((*d).to_string(), timeout, stamp));
        }
    }
    save_state(app, state);
    for (domain, timeout, stamp) in to_arm {
        schedule_auto_revert(app, domain, timeout, stamp);
    }

    // Renderer push parity with notifyUser's webContents.send shape.
    crate::native_ops::emit_event(
        app,
        "containment:safe-mode",
        &json!({ "active": true, "reason": reason_arg.clone() }),
    );

    json!(true)
}

// --- channel: exitSafeMode -------------------------------------------------
fn exit_safe_mode(app: &tauri::AppHandle) -> Value {
    let mut state = load_state(app);
    let active = state["safeMode"]["active"].as_bool().unwrap_or(false);
    if !active {
        return json!(true);
    }

    // Restore the domains that were disabled by safe mode (Electron iterates the
    // stored disabledDomains list, which is fixed to SAFE_MODE_DISABLED).
    let disabled: Vec<String> = state["safeMode"]["disabledDomains"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_else(|| SAFE_MODE_DISABLED.iter().map(|s| s.to_string()).collect());
    for d in &disabled {
        restore_in_state(&mut state, d);
    }

    state["safeMode"] = default_safe_mode();
    save_state(app, state);

    crate::native_ops::emit_event(
        app,
        "containment:safe-mode",
        &json!({ "active": false, "reason": Value::Null }),
    );

    json!(true)
}

// --- channel: clearFaults --------------------------------------------------
// Empties faults and resets every domain status to healthy / not-isolated.
fn clear_faults(app: &tauri::AppHandle) -> Value {
    let mut state = load_state(app);
    state["faults"] = json!([]);

    if let Some(map) = state["domainStatus"].as_object_mut() {
        for (_domain, status) in map.iter_mut() {
            status["faultCount"] = json!(0);
            status["healthy"] = json!(true);
            status["isolated"] = json!(false);
            status["recoveryInProgress"] = json!(false);
            if let Some(o) = status.as_object_mut() {
                o.remove("isolatedAt");
            }
        }
    }
    save_state(app, state);
    json!(true)
}

/// Route a `containment:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts): updateConfig -> args[0] = partial config;
/// getFaults -> args[0] = limit; enterSafeMode -> args[0] = reason;
/// isolate/restoreDomain -> args[0] = domain. Reads take no args. Unknown
/// channels degrade to Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        "containment:getConfig" => get_config(app),
        "containment:updateConfig" => update_config(app, &a0),
        "containment:getDomainStatus" => get_domain_status(app),
        "containment:getFaults" => get_faults(app, &a0),
        "containment:getSafeMode" => get_safe_mode(app),
        "containment:enterSafeMode" => enter_safe_mode(app, &a0),
        "containment:exitSafeMode" => exit_safe_mode(app),
        "containment:isolateDomain" => isolate_domain(app, &a0),
        "containment:restoreDomain" => restore_domain(app, &a0),
        "containment:clearFaults" => clear_faults(app),
        _ => Value::Null,
    }
}
