// =============================================================================
// DEX Tauri — Governance policy surface (data/CRUD port of the policy reads in
// src/main/core/GovernanceFramework.ts).
//
// Pure-data, JSON-backed tier. Electron stored governance state in a single
// `electron-store` named `governance` (file `governance.json` under userData)
// with several top-level keys; the policy data lives under the `retentionPolicies`
// key as an array of DataRetentionPolicy. This module mirrors that file under
// <appData>/governance.json and reads the SAME top-level key wrapper.
//
// Channel mapping (the workflow spec names the data surface getPolicies/getPolicy;
// in this subsystem the policy collection is the retention-policy list):
//   - getPolicies -> the retentionPolicies array  (governance:getRetentionPolicies)
//   - getPolicy   -> a single policy looked up by dataType, or null if not found
//                    (mirrors the getPermission handler's `find(...) || null` shape)
//
// A DataRetentionPolicy is (exact field names/types from GovernanceFramework.ts):
//   { dataType: string, retentionDays: number, deletionMethod: 'soft'|'hard'|'secure',
//     exportable: boolean, ownerControlled: boolean }
//
// DEFAULTS divergence (documented, faithful): electron-store seeds the store with
// `defaults.retentionPolicies = DEFAULT_RETENTION_POLICIES` at construction, so the
// renderer sees that list even before any write. std::fs has no defaults layer, so
// when governance.json is absent OR has no `retentionPolicies` key we return the
// SAME embedded default list (byte-for-byte the DEFAULT_RETENTION_POLICIES values).
// Once the store file exists with the key, its value is returned verbatim.
//
// HEAVY channels (enforce/audit/update) are NOT ported — see channelsSkipped in the
// port metadata. They carry native side effects (filesystem retention deletion,
// audit-log writes) that need the native runtime; this module never fakes them.
// Routing `governance:*` to dispatch is therefore NOT total — see prefixRouteSafe
// (false): those channels must reach their own controller, not this one.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "governance.json";
const POLICIES_KEY: &str = "retentionPolicies";

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

// electron-store `defaults.retentionPolicies` (DEFAULT_RETENTION_POLICIES) — the
// list the renderer sees before any write. Values mirror GovernanceFramework.ts.
fn default_policies() -> Value {
    json!([
        { "dataType": "logs.application", "retentionDays": 30,  "deletionMethod": "hard", "exportable": true,  "ownerControlled": true },
        { "dataType": "logs.audit",       "retentionDays": 90,  "deletionMethod": "hard", "exportable": true,  "ownerControlled": true },
        { "dataType": "patterns.usage",   "retentionDays": 30,  "deletionMethod": "hard", "exportable": true,  "ownerControlled": true },
        { "dataType": "cache.temporary",  "retentionDays": 7,   "deletionMethod": "hard", "exportable": false, "ownerControlled": true },
        { "dataType": "workflows.user",   "retentionDays": -1,  "deletionMethod": "soft", "exportable": true,  "ownerControlled": true },
        { "dataType": "settings.user",    "retentionDays": -1,  "deletionMethod": "soft", "exportable": true,  "ownerControlled": true }
    ])
}

// getRetentionPolicies(): governanceStore.get('retentionPolicies'). With the
// electron-store defaults layer this is always an array; we reproduce that by
// falling back to the seeded defaults when the key is absent.
fn get_policies(app: &tauri::AppHandle) -> Value {
    match read_file(app, STORE_FILE).get(POLICIES_KEY) {
        Some(Value::Array(a)) => Value::Array(a.clone()),
        _ => default_policies(),
    }
}

// getPolicy(dataType): policies.find(p => p.dataType === id) || null. There is no
// literal singular handler in Electron; this mirrors the getPermission handler's
// find-or-null shape applied to the policy collection.
fn get_policy(app: &tauri::AppHandle, data_type: &str) -> Value {
    match get_policies(app) {
        Value::Array(a) => a
            .into_iter()
            .find(|p| p.get("dataType").and_then(|v| v.as_str()) == Some(data_type))
            .unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

/// Route a `governance:*` policy channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the data/read policy channels are
/// handled; every other governance channel (including the heavy enforce/audit/
/// update surface) returns Value::Null so it can be routed to its real owner.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "governance:getPolicies" | "governance:getRetentionPolicies" => get_policies(app),
        "governance:getPolicy" => {
            let data_type = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_policy(app, data_type)
        }
        _ => Value::Null,
    }
}
