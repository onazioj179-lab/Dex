// =============================================================================
// DEX Tauri — Failure Containment read tier (port of core/FailureContainment.ts,
// the `containment:*` IPC handlers).
//
// The Electron FailureContainment is a LIVE engine: it installs process-level
// `unhandledRejection` / `uncaughtException` hooks, holds an in-memory Map of
// per-domain recovery handlers and isolation `setTimeout` timers, drives a
// fault -> isolate -> auto-recover -> notify state machine, and broadcasts
// `containment:fault` / `-isolated` / `-safe-mode` to the renderer. None of that
// runtime exists on the Tauri main side (no process hooks, no recovery handler
// registry, no timer map). This module ports ONLY the single pure-data read the
// contract assigns — the containment POLICY (FailureContainmentConfig) — at the
// EXACT Electron return shape. Every mutating / live-state channel is SKIPPED
// (honest null), because each needs the hostless engine.
//
// Storage tier: DataStore-KV (same backbone as rule_engine.rs / modes_dispatch
// in main.rs), reached via crate::kv_get / crate::kv_set against the SAME key the
// contract names: "containment". The policy is the `config` sub-object of that
// stored value; when the key (or its `config`) is absent we return the SAME
// `defaults.config` electron-store seeded in FailureContainment.ts, so a fresh
// install reads identically to Electron's first launch.
//
// DIVERGENCE (storage backend, documented): Electron persisted this subsystem in
// an `electron-store` named `failure-containment` (file failure-containment.json),
// NOT in DataStore. The contract specifies `datastore-kv:containment`, so this
// port reads the `config` key under the DataStore-KV `containment` entry rather
// than the legacy electron-store file. The RETURNED policy shape is byte-for-byte
// the FailureContainmentConfig either way (enabled, maxFaultsBeforeIsolation,
// autoRecoveryEnabled, maxRecoveryAttempts, isolationTimeoutMs,
// notifyUserOnCritical), so the renderer's contract is unchanged. No legacy-file
// migration is performed here (no native engine runs to own that side effect).
//
// PORTED (exact shape, matching FailureContainment.getConfig()):
//   - containment:getConfig -> FailureContainmentConfig (6 fields, see above).
//     This is the "getPolicy" data surface in the porting contract.
//
// SKIPPED (need the live in-memory engine; honest null — see channelsSkipped):
//   updateConfig, getDomainStatus, getFaults, getSafeMode, enterSafeMode,
//   exitSafeMode, isolateDomain, restoreDomain, clearFaults.
// =============================================================================

use serde_json::{json, Value};

const CONTAINMENT_KEY: &str = "containment";

// FailureContainment.ts store `defaults.config` — returned verbatim when the
// stored policy is absent, exactly as electron-store would have seeded it.
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

// getConfig(): containmentStore.get('config'). The DataStore-KV `containment`
// entry mirrors the electron-store object, so the policy is its `config` field;
// a missing key or missing/non-object `config` falls back to the seeded default.
fn get_config(app: &tauri::AppHandle) -> Value {
    crate::kv_get(app, CONTAINMENT_KEY)
        .get("config")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(default_config)
}

/// Route a `containment:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts); the ported read takes no arguments. Every
/// channel in the namespace is accounted for: the nine live-engine channels and
/// any unknown one fall to `_ => Value::Null` (honest degrade), so prefix-routing
/// the whole `containment:` namespace to this dispatch is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "containment:getConfig" => get_config(app),
        // SKIPPED (hostless live engine):
        //   updateConfig  — mutates config; renderer reads it back, but writing
        //                   without the engine would desync the (skipped) live
        //                   isolation/recovery state machine.
        //   getDomainStatus / getFaults / getSafeMode — report in-memory live
        //                   fault/isolation state that no host produces here.
        //   enterSafeMode / exitSafeMode / isolateDomain / restoreDomain /
        //   clearFaults — mutate isolation timers + recovery handlers (need the
        //                   in-memory engine + process error hooks).
        _ => Value::Null,
    }
}
