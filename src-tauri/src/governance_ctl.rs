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
// HEAVY channels (enforce/audit/update) — NOW PORTED with real native code below.
// They model the GovernanceEnforcer from src/main/core/GovernanceContract.ts:
//   - governance:enforce -> validateExecution(request): the enforcer's core gate.
//        Pure rule logic; on a denial it persists a ViolationReport (matching the
//        enforcer's reportViolation ring buffer, last-100) to KV and pushes a
//        renderer event so the UI updates live.
//   - governance:audit   -> getViolations(): returns the persisted violation
//        ring buffer (the audit trail), newest-last, exactly as the enforcer holds
//        it; an optional positional limit slices the tail.
//   - governance:update  -> the enforcer's state mutations (setAIEnabled /
//        setPluginsEnabled) persisted to KV, returning the governance status
//        object (getGovernanceStatus shape) and emitting governance:statusUpdated.
//
// State is persisted via crate::kv_get / crate::kv_set under two stable keys so the
// three channels share one source of truth across restarts (the Electron enforcer
// kept it in-process only; persistence is a faithful upgrade, not a behavior change
// in the returned shapes). FAITHFUL DIVERGENCE: GovernanceContract permanently
// forces AI disabled (aiEnabled is always false regardless of input) — we preserve
// that exact invariant in handle_update.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const STORE_FILE: &str = "governance.json";
const POLICIES_KEY: &str = "retentionPolicies";

// KV keys shared by the enforce/audit/update channels (single source of truth).
const KV_VIOLATIONS: &str = "governance.violations";
const KV_CONTRACT_STATE: &str = "governance.contractState";

// reportViolation keeps only the last 100 (GovernanceContract.ts line 379).
const MAX_VIOLATIONS: usize = 100;

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// --- file IO ----------------------------------------------------------------

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

// --- enforcer state (KV-backed) ---------------------------------------------

// Persisted violation ring buffer (ViolationReport[], GovernanceContract.ts).
fn load_violations(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, KV_VIOLATIONS) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn save_violations(app: &tauri::AppHandle, mut list: Vec<Value>) {
    // Mirror reportViolation: keep only the last MAX_VIOLATIONS.
    if list.len() > MAX_VIOLATIONS {
        list = list.split_off(list.len() - MAX_VIOLATIONS);
    }
    let _ = crate::kv_set(app, KV_VIOLATIONS, Value::Array(list));
}

// Persisted contract toggles. AI is permanently disabled in DEX (the enforcer
// forces aiEnabled = false); pluginsEnabled is the only mutable toggle.
fn plugins_enabled(app: &tauri::AppHandle) -> bool {
    crate::kv_get(app, KV_CONTRACT_STATE)
        .get("pluginsEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

// getGovernanceStatus() shape (GovernanceContract.ts line 554). pendingActions is
// always 0 here: the MediatedActionExecutor queue is an in-process renderer-side
// concept with no native persistence surface, so we report an empty queue.
fn governance_status(app: &tauri::AppHandle) -> Value {
    json!({
        "aiEnabled": false,
        "pluginsEnabled": plugins_enabled(app),
        "violationCount": load_violations(app).len(),
        "pendingActions": 0,
        "contractsActive": true
    })
}

// governance:enforce -> validateExecution(request). Faithful port of the three
// rules in GovernanceContract.ts; denials persist a ViolationReport and push a
// renderer event. Returns { allowed: bool, reason?: string }.
fn handle_enforce(app: &tauri::AppHandle, args: &Value) -> Value {
    let req = args.get(0).cloned().unwrap_or(Value::Null);
    let source = req.get("source").and_then(|v| v.as_str()).unwrap_or("");
    let action = req.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let target = req.get("target").and_then(|v| v.as_str()).unwrap_or("");

    // Determine outcome with the exact rule order from validateExecution.
    let denial: Option<(&str, &str, &str, &str, String)> = if source == "ai" && action != "suggest"
    {
        Some((
            "ai",
            "AI_SUGGESTIONS_ONLY",
            "violation",
            "ai",
            format!("AI attempted to execute: {}", action),
        ))
    } else if source == "plugin" && target == "ai" {
        Some((
            "plugin",
            "PLUGINS_CANNOT_CONTROL_AI",
            "violation",
            action,
            "Plugin attempted to invoke AI directly".to_string(),
        ))
    } else if source == "ai" && target.starts_with("plugin:") {
        Some((
            "ai",
            "AI_CANNOT_CONTROL_PLUGINS",
            "critical",
            "ai",
            format!("AI attempted to invoke plugin: {}", target),
        ))
    } else {
        None
    };

    match denial {
        Some((vtype, rule, severity, vsource, description)) => {
            let report = json!({
                "type": vtype,
                "rule": rule,
                "description": description,
                "severity": severity,
                "timestamp": now_millis(),
                "source": vsource
            });
            // reportViolation: push to ring buffer + emit('violation').
            let mut list = load_violations(app);
            list.push(report.clone());
            save_violations(app, list);
            // Renderer push (Electron webContents.send('governance:auditEntry')).
            crate::native_ops::emit_event(app, "governance:auditEntry", &report);

            let reason = match rule {
                "AI_SUGGESTIONS_ONLY" => "AI can only suggest, not execute",
                "PLUGINS_CANNOT_CONTROL_AI" => "Plugins cannot control AI directly",
                _ => "AI cannot control plugins",
            };
            json!({ "allowed": false, "reason": reason })
        }
        None => json!({ "allowed": true }),
    }
}

// governance:audit -> getViolations(). Returns the persisted violation ring
// buffer (the audit trail), newest-last. Optional positional limit slices the
// tail (most-recent N), matching the getAuditLog(limit) convention.
fn handle_audit(app: &tauri::AppHandle, args: &Value) -> Value {
    let mut list = load_violations(app);
    if let Some(limit) = args.get(0).and_then(|v| v.as_u64()) {
        let limit = limit as usize;
        if list.len() > limit {
            list = list.split_off(list.len() - limit);
        }
    }
    Value::Array(list)
}

// governance:update -> the enforcer's state mutations. Args[0] is a partial
// state object { pluginsEnabled?, aiEnabled?, clearViolations? }. AI stays
// permanently disabled (faithful invariant). Returns getGovernanceStatus() and
// emits governance:statusUpdated.
fn handle_update(app: &tauri::AppHandle, args: &Value) -> Value {
    let patch = args.get(0).cloned().unwrap_or(Value::Null);

    // setPluginsEnabled(enabled).
    if let Some(enabled) = patch.get("pluginsEnabled").and_then(|v| v.as_bool()) {
        let mut state = match crate::kv_get(app, KV_CONTRACT_STATE) {
            Value::Object(m) => Value::Object(m),
            _ => json!({}),
        };
        if let Some(obj) = state.as_object_mut() {
            obj.insert("pluginsEnabled".to_string(), json!(enabled));
            // setAIEnabled is a no-op in the contract: AI is permanently disabled.
            obj.insert("aiEnabled".to_string(), json!(false));
        }
        let _ = crate::kv_set(app, KV_CONTRACT_STATE, state);
    }

    // clearViolations() convenience (enforcer.clearViolations()).
    if patch
        .get("clearViolations")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let _ = crate::kv_set(app, KV_VIOLATIONS, json!([]));
    }

    let status = governance_status(app);
    crate::native_ops::emit_event(app, "governance:statusUpdated", &status);
    status
}

/// Route a `governance:*` policy channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The data/read policy channels and the
/// heavy enforce/audit/update enforcer surface are handled here; everything else
/// returns Value::Null so it can be routed to its real owner.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "governance:getPolicies" | "governance:getRetentionPolicies" => get_policies(app),
        "governance:getPolicy" => {
            let data_type = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_policy(app, data_type)
        }
        "governance:enforce" => handle_enforce(app, args),
        "governance:audit" => handle_audit(app, args),
        "governance:update" => handle_update(app, args),
        _ => Value::Null,
    }
}
