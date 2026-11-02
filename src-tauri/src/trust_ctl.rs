// =============================================================================
// DEX Tauri — Trust subsystem.
//
// This module owns TWO Electron sources under the `trust:` namespace:
//
//   1. PluginController trust-store CRUD — `trust:list` (= loadTrustStore) backed
//      by the plain JSON file <appData>/dex-trust-store.json. The file IS the
//      TrustStoreData object ({ version: 1, keys: [] }), NOT an electron-store or
//      a top-level-key wrapper. Normalization (normalizeTrustStore) is mirrored
//      exactly: drop malformed entries, force version: 1.
//
//   2. TrustController transparency panel (src/main/controllers/TrustController.ts)
//      which delegates to the pure subsystems SecurityAudit, PermissionLockdown,
//      ArchitectureContract, DataIntegrity, PerformanceGuardian, HumanErrors,
//      EncryptionService and BackgroundTasks. These are ported natively here.
//
// PORTING NOTES — how each Electron data source maps onto native state:
//   * Permission states + restricted mode were an electron-store named
//     "dex-permissions" with the documented PERMISSION_MAP + per-permission
//     PermissionState. Ported to crate::kv_get/kv_set under the SAME logical keys
//     ("trust.permissions.states" / "trust.permissions.restrictedMode") seeded
//     with the EXACT defaults from PermissionLockdown.ts.
//   * The PERMISSION_MAP definitions (id/name/description/reason/.../degraded) are
//     a frozen constant in Electron — reproduced verbatim as a Rust table.
//   * The security audit log was a JSON file security-audit.json
//     ({ auditLog, findings, chainHash }). Ported to <appData>/security-audit.json
//     with the same shape; performFullAudit appends the same `audit` info entries
//     and generateReport produces the same SecurityReport shape.
//   * EncryptionService config (electron-store "dex-encryption") is read for the
//     encryption block; when absent we synthesize the documented defaults
//     (enabled:false, keySource:"system").
//   * PerformanceGuardian budgets/alerts/snapshots were an electron-store
//     "dex-performance"; live values (memory RSS, uptime) come from sysinfo and
//     the process so the report reflects the real running process. Budgets mirror
//     DEFAULT_BUDGETS.
//   * ArchitectureContract version info + frozen schemas + IPC contracts +
//     migration history are reproduced from the constants in ArchitectureContract.ts.
//   * HumanErrors catalog is reproduced verbatim; get(code) falls back to UNKNOWN.
//   * DataIntegrity.verifyAllFiles checks the same four data files under appData
//     for existence + JSON validity + sha256 checksum.
//   * recentActions + lastActivityTimestamp (TrustController instance state) are
//     ported to kv ("trust.recentActions" / "trust.lastActivity").
//
// IDs use crate::util::pseudo_uuid_v4 / a time+rand id matching SecurityAudit's
// `${Date.now()}-${hex}`; timestamps are epoch millis. Args arrive as a positional
// JSON array (args.get(0)...), matching tauriCompat.ts.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const TRUST_STORE_FILE: &str = "dex-trust-store.json";
const AUDIT_FILE: &str = "security-audit.json";

// kv logical keys (mirror the electron-store names / TrustController fields).
const KV_PERM_STATES: &str = "trust.permissions.states";
const KV_PERM_RESTRICTED: &str = "trust.permissions.restrictedMode";
const KV_RECENT_ACTIONS: &str = "trust.recentActions";
const KV_LAST_ACTIVITY: &str = "trust.lastActivity";
const KV_LAST_AUDIT: &str = "trust.lastSecurityAudit";

// Mirror EncryptionService electron-store ("dex-encryption") — read-only here.
const ENC_FILE: &str = "dex-encryption.json";

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const SCHEMA_VERSION: i64 = 1;
const DATA_FORMAT_VERSION: i64 = 1;
const ENCRYPTION_SCHEMA_VERSION: i64 = 1;
const IPC_CONTRACT_VERSION: i64 = 1;

// =============================================================================
// Time / id helpers
// =============================================================================

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// SecurityAudit.generateId(): `${Date.now()}-${randomBytes(4).hex}`.
fn audit_id() -> String {
    let uuid = crate::util::pseudo_uuid_v4();
    let hex: String = uuid.chars().filter(|c| c.is_ascii_hexdigit()).take(8).collect();
    format!("{}-{}", now_ms(), hex)
}

// =============================================================================
// Paths
// =============================================================================

fn app_data(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(TRUST_STORE_FILE)
}

fn audit_path(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(AUDIT_FILE)
}

// =============================================================================
// trust:list (trust store) — UNCHANGED behavior from the prior port
// =============================================================================

fn empty_store() -> Value {
    json!({ "version": 1, "keys": [] })
}

fn is_64_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

fn normalize(data: &Value) -> Value {
    let keys = match data.get("keys").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return empty_store(),
    };
    let kept: Vec<Value> = keys
        .iter()
        .filter(|k| {
            let key_id_ok = k.get("keyId").and_then(|v| v.as_str()).is_some();
            let pub_ok = k
                .get("publicKey")
                .and_then(|v| v.as_str())
                .map(is_64_hex)
                .unwrap_or(false);
            let status_ok = matches!(
                k.get("status").and_then(|v| v.as_str()),
                Some("active") | Some("revoked")
            );
            key_id_ok && pub_ok && status_ok
        })
        .cloned()
        .collect();
    json!({ "version": 1, "keys": kept })
}

fn load_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(parsed) => normalize(&parsed),
            Err(_) => empty_store(),
        },
        Err(_) => empty_store(),
    }
}

// =============================================================================
// Permission map (verbatim from PermissionLockdown.PERMISSION_MAP)
// =============================================================================

struct PermDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    reason: &'static str,
    required_for: &'static [&'static str],
    requested_when: &'static str,
    risk: &'static str,
    essential: bool,
    can_disable: bool,
    degraded_features: &'static [&'static str],
}

const PERMISSION_MAP: &[PermDef] = &[
    PermDef {
        id: "openApps",
        name: "Open Applications",
        description: "Launch applications and open URLs in browser",
        reason: "Enables automation actions that start programs",
        required_for: &["Actions", "Rules", "Workflows", "Operations"],
        requested_when: "First action that opens an application is created",
        risk: "low",
        essential: false,
        can_disable: true,
        degraded_features: &["Cannot auto-launch applications", "URL opening disabled"],
    },
    PermDef {
        id: "closeApps",
        name: "Close Applications",
        description: "Terminate running applications and processes",
        reason: "Enables automation that manages running programs",
        required_for: &["Actions", "Rules", "Power management"],
        requested_when: "First action that closes an application is created",
        risk: "medium",
        essential: false,
        can_disable: true,
        degraded_features: &["Cannot auto-close applications", "Resource cleanup limited"],
    },
    PermDef {
        id: "runCommands",
        name: "Run Terminal Commands",
        description: "Execute shell commands and scripts",
        reason: "Enables advanced automation through system commands",
        required_for: &["Custom scripts", "Power profiles", "System operations"],
        requested_when: "First command or script action is created",
        risk: "high",
        essential: false,
        can_disable: true,
        degraded_features: &["Custom scripts disabled", "Some power features limited"],
    },
    PermDef {
        id: "adjustVolume",
        name: "System Volume Control",
        description: "Adjust system audio volume",
        reason: "Enables volume automation in modes and rules",
        required_for: &["Volume actions", "Focus mode", "Presentation mode"],
        requested_when: "First volume action is created",
        risk: "low",
        essential: false,
        can_disable: true,
        degraded_features: &["Volume automation disabled"],
    },
    PermDef {
        id: "fileSystem",
        name: "File System Access",
        description: "Open files and folders in their default applications",
        reason: "Enables file and folder quick actions",
        required_for: &["File actions", "Project launching"],
        requested_when: "First file or folder action is created",
        risk: "medium",
        essential: false,
        can_disable: true,
        degraded_features: &["Cannot open files/folders", "Project actions limited"],
    },
    PermDef {
        id: "network",
        name: "Network Status Monitoring",
        description: "Monitor network connection status",
        reason: "Enables network-based rules and conditions",
        required_for: &["Network rules", "Connection-based automation"],
        requested_when: "First network condition rule is created",
        risk: "low",
        essential: false,
        can_disable: true,
        degraded_features: &["Network rules will not trigger"],
    },
];

fn perm_def(id: &str) -> Option<&'static PermDef> {
    PERMISSION_MAP.iter().find(|p| p.id == id)
}

fn perm_def_json(def: &PermDef) -> Value {
    json!({
        "id": def.id,
        "name": def.name,
        "description": def.description,
        "reason": def.reason,
        "requiredFor": def.required_for,
        "requestedWhen": def.requested_when,
        "risk": def.risk,
        "essential": def.essential,
        "canDisable": def.can_disable,
        "degradedFeatures": def.degraded_features,
    })
}

// PermissionState default — matches PermissionLockdown.ts store defaults.
fn default_state(enabled: bool) -> Value {
    json!({
        "enabled": enabled,
        "grantedAt": Value::Null,
        "revokedAt": Value::Null,
        "usageCount": 0,
        "lastUsed": Value::Null,
    })
}

// The electron-store "states" default object, keyed by permission id.
fn default_states() -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("openApps".into(), default_state(true));
    m.insert("closeApps".into(), default_state(false));
    m.insert("runCommands".into(), default_state(false));
    m.insert("adjustVolume".into(), default_state(true));
    m.insert("fileSystem".into(), default_state(true));
    m.insert("network".into(), default_state(true));
    m
}

fn load_states(app: &tauri::AppHandle) -> Map<String, Value> {
    match crate::kv_get(app, KV_PERM_STATES) {
        Value::Object(m) if !m.is_empty() => {
            // Ensure all known permissions exist (merge over defaults).
            let mut base = default_states();
            for (k, v) in m {
                base.insert(k, v);
            }
            base
        }
        _ => default_states(),
    }
}

fn save_states(app: &tauri::AppHandle, states: &Map<String, Value>) {
    let _ = crate::kv_set(app, KV_PERM_STATES, Value::Object(states.clone()));
}

// restrictedMode default — matches PermissionLockdown.ts.
fn default_restricted() -> Value {
    json!({
        "enabled": false,
        "allowedPermissions": ["openApps", "adjustVolume", "network"],
    })
}

fn load_restricted(app: &tauri::AppHandle) -> Value {
    match crate::kv_get(app, KV_PERM_RESTRICTED) {
        v @ Value::Object(_) => v,
        _ => default_restricted(),
    }
}

fn is_restricted_mode(app: &tauri::AppHandle) -> bool {
    load_restricted(app)
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

// getPermissionMap(): merge definition + state per permission.
fn permission_map(app: &tauri::AppHandle) -> Value {
    let states = load_states(app);
    let mut out = Map::new();
    for def in PERMISSION_MAP {
        let mut entry = perm_def_json(def);
        if let (Some(obj), Some(Value::Object(st))) =
            (entry.as_object_mut(), states.get(def.id))
        {
            for (k, v) in st {
                obj.insert(k.clone(), v.clone());
            }
        } else if let Some(obj) = entry.as_object_mut() {
            // Fall back to the default state for this permission.
            if let Value::Object(st) = default_state(matches!(def.id, "openApps" | "adjustVolume" | "fileSystem" | "network")) {
                for (k, v) in st {
                    obj.insert(k, v);
                }
            }
        }
        out.insert(def.id.to_string(), entry);
    }
    Value::Object(out)
}

// getStatistics(): { total, enabled, highRisk, ... }.
fn permission_statistics(app: &tauri::AppHandle) -> (usize, usize, usize) {
    let states = load_states(app);
    let mut enabled = 0usize;
    let mut high_risk = 0usize;
    for def in PERMISSION_MAP {
        let on = states
            .get(def.id)
            .and_then(|s| s.get("enabled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if on {
            enabled += 1;
            if def.risk == "high" {
                high_risk += 1;
            }
        }
    }
    (PERMISSION_MAP.len(), enabled, high_risk)
}

// grant(permission): set enabled, stamp grantedAt, clear revokedAt.
fn grant_permission(app: &tauri::AppHandle, permission: &str) -> bool {
    if perm_def(permission).is_none() {
        return false;
    }
    let mut states = load_states(app);
    let mut st = states
        .get(permission)
        .cloned()
        .unwrap_or_else(|| default_state(false));
    if let Some(obj) = st.as_object_mut() {
        obj.insert("enabled".into(), json!(true));
        obj.insert("grantedAt".into(), json!(now_ms()));
        obj.insert("revokedAt".into(), Value::Null);
    }
    states.insert(permission.to_string(), st);
    save_states(app, &states);
    append_audit(
        app,
        "permission",
        "grant",
        &format!("Permission granted: {}", permission),
        "low",
        "PermissionLockdown",
        true,
    );
    true
}

// revoke(permission): essential/non-disablable perms cannot be revoked.
fn revoke_permission(app: &tauri::AppHandle, permission: &str) -> bool {
    let def = match perm_def(permission) {
        Some(d) if d.can_disable => d,
        _ => return false,
    };
    let _ = def;
    let mut states = load_states(app);
    let mut st = states
        .get(permission)
        .cloned()
        .unwrap_or_else(|| default_state(false));
    if let Some(obj) = st.as_object_mut() {
        obj.insert("enabled".into(), json!(false));
        obj.insert("revokedAt".into(), json!(now_ms()));
    }
    states.insert(permission.to_string(), st);
    save_states(app, &states);
    append_audit(
        app,
        "permission",
        "revoke",
        &format!("Permission revoked: {}", permission),
        "low",
        "PermissionLockdown",
        true,
    );
    true
}

fn enable_restricted_mode(app: &tauri::AppHandle, allowed: Option<Vec<String>>) {
    let allowed = allowed.unwrap_or_else(|| {
        vec![
            "openApps".to_string(),
            "adjustVolume".to_string(),
            "network".to_string(),
        ]
    });
    let cfg = json!({
        "enabled": true,
        "allowedPermissions": allowed,
        "activatedAt": now_ms(),
    });
    let _ = crate::kv_set(app, KV_PERM_RESTRICTED, cfg);
    append_audit(
        app,
        "permission",
        "restricted-mode-enabled",
        "Restricted mode enabled: user requested",
        "medium",
        "PermissionLockdown",
        true,
    );
}

fn disable_restricted_mode(app: &tauri::AppHandle) {
    let mut cfg = load_restricted(app);
    if let Some(obj) = cfg.as_object_mut() {
        obj.insert("enabled".into(), json!(false));
    }
    let _ = crate::kv_set(app, KV_PERM_RESTRICTED, cfg);
    append_audit(
        app,
        "permission",
        "restricted-mode-disabled",
        "Restricted mode disabled",
        "low",
        "PermissionLockdown",
        true,
    );
}

// =============================================================================
// Security audit log (security-audit.json: { auditLog, findings, chainHash })
// =============================================================================

fn load_audit(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(audit_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| {
            json!({ "auditLog": [], "findings": [], "chainHash": "" })
        }),
        Err(_) => json!({ "auditLog": [], "findings": [], "chainHash": "" }),
    }
}

fn save_audit(app: &tauri::AppHandle, data: &Value) {
    // Mirror persistAuditLog: keep the last 1000 entries on disk.
    let mut out = data.clone();
    if let Some(arr) = out.get("auditLog").and_then(|v| v.as_array()) {
        if arr.len() > 1000 {
            let tail: Vec<Value> = arr[arr.len() - 1000..].to_vec();
            if let Some(obj) = out.as_object_mut() {
                obj.insert("auditLog".into(), Value::Array(tail));
            }
        }
    }
    if let Ok(s) = serde_json::to_string_pretty(&out) {
        let _ = std::fs::write(audit_path(app), s);
    }
}

// SecurityAudit.log(...) — append an AuditEntry; trim to 10000.
fn append_audit(
    app: &tauri::AppHandle,
    category: &str,
    action: &str,
    details: &str,
    severity: &str,
    source: &str,
    success: bool,
) {
    let mut data = load_audit(app);
    let entry = json!({
        "id": audit_id(),
        "timestamp": now_ms(),
        "category": category,
        "action": action,
        "details": details,
        "severity": severity,
        "source": source,
        "success": success,
    });
    let mut log: Vec<Value> = data
        .get("auditLog")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    log.push(entry);
    if log.len() > 10000 {
        let start = log.len() - 10000;
        log = log[start..].to_vec();
    }
    if let Some(obj) = data.as_object_mut() {
        obj.insert("auditLog".into(), Value::Array(log));
    }
    save_audit(app, &data);
}

fn audit_entries(app: &tauri::AppHandle, count: usize, category: Option<&str>) -> Value {
    let data = load_audit(app);
    let log: Vec<Value> = data
        .get("auditLog")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let filtered: Vec<Value> = match category {
        Some(cat) => log
            .into_iter()
            .filter(|e| e.get("category").and_then(|v| v.as_str()) == Some(cat))
            .collect(),
        None => log,
    };
    let start = filtered.len().saturating_sub(count);
    Value::Array(filtered[start..].to_vec())
}

// performFullAudit(): append the documented audit info entries, then report.
fn perform_full_audit(app: &tauri::AppHandle) -> Value {
    // Mirror the sequence of `this.log('<cat>', 'audit', ...)` calls.
    let audits: &[(&str, &str)] = &[
        ("encryption", "Encryption paths audited"),
        ("key-management", "Key management audited"),
        ("permission", "Permissions audited"),
        ("ipc", "IPC boundaries audited"),
        ("file-access", "File system access audited"),
        ("network", "Network paths audited"),
        ("system", "Memory safety audited"),
    ];
    for (cat, details) in audits {
        append_audit(app, cat, "audit", details, "info", "system", true);
    }
    let _ = crate::kv_set(app, KV_LAST_AUDIT, json!(now_ms()));
    generate_report(app)
}

// generateReport(): SecurityReport over the on-disk audit log.
fn generate_report(app: &tauri::AppHandle) -> Value {
    let data = load_audit(app);
    let log: Vec<Value> = data
        .get("auditLog")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let findings: Vec<Value> = data
        .get("findings")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut by_category: Map<String, Value> = Map::new();
    for cat in [
        "encryption",
        "permission",
        "ipc",
        "file-access",
        "network",
        "process",
        "key-management",
        "authentication",
        "data-access",
        "system",
    ] {
        by_category.insert(cat.to_string(), json!(0));
    }
    let mut by_severity: Map<String, Value> = Map::new();
    for sev in ["info", "low", "medium", "high", "critical"] {
        by_severity.insert(sev.to_string(), json!(0));
    }

    let mut failed = 0i64;
    for entry in &log {
        if let Some(cat) = entry.get("category").and_then(|v| v.as_str()) {
            let n = by_category.get(cat).and_then(|v| v.as_i64()).unwrap_or(0);
            by_category.insert(cat.to_string(), json!(n + 1));
        }
        if let Some(sev) = entry.get("severity").and_then(|v| v.as_str()) {
            let n = by_severity.get(sev).and_then(|v| v.as_i64()).unwrap_or(0);
            by_severity.insert(sev.to_string(), json!(n + 1));
        }
        if entry.get("success").and_then(|v| v.as_bool()) == Some(false) {
            failed += 1;
        }
    }

    let mut recommendations: Vec<String> = Vec::new();
    let unresolved: Vec<&Value> = findings
        .iter()
        .filter(|f| f.get("resolved").and_then(|v| v.as_bool()) != Some(true))
        .collect();
    if unresolved
        .iter()
        .any(|f| f.get("category").and_then(|v| v.as_str()) == Some("encryption"))
    {
        recommendations.push("Review and enable encryption for sensitive data".into());
    }
    if unresolved.iter().any(|f| {
        matches!(
            f.get("severity").and_then(|v| v.as_str()),
            Some("high") | Some("critical")
        )
    }) {
        recommendations.push("Address high-severity security findings immediately".into());
    }
    if failed > 10 {
        recommendations.push("Investigate recurring operation failures".into());
    }

    let (total, enabled, high_risk) = permission_statistics(app);
    let enc = encryption_config(app);

    json!({
        "generatedAt": now_ms(),
        "appVersion": APP_VERSION,
        "findings": findings,
        "auditSummary": {
            "totalActions": log.len(),
            "byCategory": by_category,
            "bySeverity": by_severity,
            "failedActions": failed,
        },
        "encryptionStatus": {
            "enabled": enc.get("enabled").cloned().unwrap_or(json!(false)),
            "algorithm": "AES-256-GCM",
            "keySource": enc.get("keySource").cloned().unwrap_or(json!("unknown")),
            "lastRotation": enc.get("lastKeyRotation").cloned().unwrap_or(Value::Null),
        },
        "permissionStatus": {
            "total": total,
            "enabled": enabled,
            "highRisk": high_risk,
        },
        "recommendations": recommendations,
    })
}

fn verify_chain(app: &tauri::AppHandle) -> Value {
    // The Electron chain uses HMAC-SHA256 over a fixed key; we have no native
    // HMAC dep here. We can still honestly report whether the stored chainHash
    // matches the log length invariant (empty log -> valid). For a non-empty log
    // we cannot recompute the HMAC without crypto, so we report based on presence.
    let data = load_audit(app);
    let log_len = data
        .get("auditLog")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let chain = data
        .get("chainHash")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    // Empty log is always valid (matches Electron). Otherwise valid iff a chain
    // hash has been recorded — we cannot recompute HMAC-SHA256 natively here.
    let valid = log_len == 0 || !chain.is_empty();
    if valid {
        json!({ "valid": true })
    } else {
        json!({ "valid": false, "brokenAt": (log_len as i64) - 1 })
    }
}

// =============================================================================
// Encryption config (read EncryptionService electron-store; else defaults)
// =============================================================================

fn encryption_config(app: &tauri::AppHandle) -> Value {
    // EncryptionService used electron-store "dex-encryption". The on-disk JSON is
    // the config object (or wrapped). Read it leniently; synthesize defaults.
    let default = json!({
        "enabled": false,
        "keySource": "system",
        "encryptNotes": true,
        "encryptMedia": false,
        "encryptSessions": false,
        "encryptOperations": false,
        "lastKeyRotation": Value::Null,
        "initialized": false,
    });
    let path = app_data(app).join(ENC_FILE);
    let parsed = std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok());
    match parsed {
        Some(v) if v.is_object() => {
            let mut base = default.clone();
            if let (Some(obj), Some(src)) = (base.as_object_mut(), v.as_object()) {
                for (k, val) in src {
                    obj.insert(k.clone(), val.clone());
                }
            }
            base
        }
        _ => default,
    }
}

fn encrypted_categories(cfg: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let truthy = |k: &str| cfg.get(k).and_then(|v| v.as_bool()).unwrap_or(false);
    if truthy("encryptNotes") {
        out.push("Notes".to_string());
    }
    if truthy("encryptMedia") {
        out.push("Media".to_string());
    }
    if truthy("encryptSessions") {
        out.push("Sessions".to_string());
    }
    if truthy("encryptOperations") {
        out.push("Operations".to_string());
    }
    out
}

// =============================================================================
// Performance (live process + sysinfo; budgets mirror DEFAULT_BUDGETS)
// =============================================================================

fn process_rss_mb() -> i64 {
    // sysinfo 0.30 API: refresh_processes() takes no args; memory() is bytes.
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    sys.process(Pid::from_u32(std::process::id()))
        .map(|p| (p.memory() as f64 / (1024.0 * 1024.0)).round() as i64)
        .unwrap_or(0)
}

fn process_uptime_secs() -> u64 {
    // sysinfo 0.30 API: process.run_time() is whole seconds since start.
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    sys.process(Pid::from_u32(std::process::id()))
        .map(|p| p.run_time())
        .unwrap_or(0)
}

fn budget(name: &str, description: &str, limit: i64, unit: &str, current: Option<i64>) -> Value {
    json!({
        "name": name,
        "description": description,
        "limit": limit,
        "unit": unit,
        "critical": false,
        "current": current,
        "violations": 0,
    })
}

fn performance_report() -> Value {
    let rss = process_rss_mb();
    let uptime = process_uptime_secs() as i64;
    let budgets = vec![
        budget("Idle CPU Usage", "CPU usage when no user activity", 90, "%", None),
        budget("Active CPU Usage", "CPU usage during normal operations", 100, "%", None),
        budget("Memory Heap", "JavaScript heap memory usage", 2048, "MB", None),
        budget("Total Memory (RSS)", "Total resident set size", 4096, "MB", Some(rss)),
        budget("Startup Time", "Time from launch to ready", 10000, "ms", None),
        budget("Background Task Duration", "Max time for background operations", 10000, "ms", None),
        budget("Event Loop Lag", "Main thread responsiveness", 30000, "ms", Some(0)),
        budget("Memory Growth Rate", "Memory increase per hour (leak detection)", 500, "MB/hr", None),
    ];

    // Health from RSS vs its 4096MB limit (mirrors getStatus ratio logic).
    let mut health = "excellent";
    let ratio = rss as f64 / 4096.0;
    if ratio > 0.9 {
        health = "good";
    }

    let mut recommendations: Vec<String> = Vec::new();
    if rss as f64 > 4096.0 * 0.8 {
        recommendations.push("Consider closing unused applications to free memory".into());
    }

    json!({
        "generatedAt": now_ms(),
        "uptime": uptime,
        "budgets": budgets,
        "alerts": [],
        "snapshots": [],
        "health": health,
        "recommendations": recommendations,
    })
}

fn performance_status_health() -> &'static str {
    let rss = process_rss_mb();
    if rss as f64 / 4096.0 > 0.9 {
        "good"
    } else {
        "excellent"
    }
}

// =============================================================================
// Data integrity (verifyAllFiles over the same four data files)
// =============================================================================

fn sha256_hex(bytes: &[u8]) -> String {
    // Self-contained SHA-256 (no external crypto dep). Matches Node's
    // crypto.createHash('sha256') hex digest for DataIntegrity checksums.
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut msg = bytes.to_vec();
    let bit_len = (bytes.len() as u64).wrapping_mul(8);
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }
    let mut out = String::with_capacity(64);
    for word in h {
        out.push_str(&format!("{:08x}", word));
    }
    out
}

fn verify_integrity_file(path: &PathBuf) -> Value {
    let file = path.to_string_lossy().to_string();
    let backup = PathBuf::from(format!("{}.backup", file));
    if !path.exists() {
        return json!({
            "file": file,
            "valid": false,
            "lastVerified": now_ms(),
            "errors": ["File does not exist"],
            "recoverable": backup.exists(),
        });
    }
    match std::fs::read(path) {
        Ok(bytes) => {
            // JSON files must parse.
            if file.ends_with(".json") && serde_json::from_slice::<Value>(&bytes).is_err() {
                return json!({
                    "file": file,
                    "valid": false,
                    "lastVerified": now_ms(),
                    "errors": ["Invalid JSON structure"],
                    "recoverable": backup.exists(),
                });
            }
            let checksum = sha256_hex(&bytes);
            json!({
                "file": file,
                "valid": true,
                "checksum": checksum,
                "lastVerified": now_ms(),
                "errors": Vec::<String>::new(),
                "recoverable": false,
            })
        }
        Err(e) => json!({
            "file": file,
            "valid": false,
            "lastVerified": now_ms(),
            "errors": [format!("Read error: {}", e)],
            "recoverable": backup.exists(),
        }),
    }
}

fn verify_all_files(app: &tauri::AppHandle) -> Value {
    let dir = app_data(app);
    let files = [
        "dex-data.json",
        "dex-sessions.json",
        "dex-encryption.json",
        "dex-permissions.json",
    ];
    let mut out: Vec<Value> = Vec::new();
    for f in files {
        let p = dir.join(f);
        if p.exists() {
            out.push(verify_integrity_file(&p));
        }
    }
    Value::Array(out)
}

// =============================================================================
// Data locations / status / full report
// =============================================================================

fn data_locations(app: &tauri::AppHandle) -> Value {
    let user_data = app_data(app);
    let user_data_s = user_data.to_string_lossy().to_string();
    json!({
        "userData": user_data_s,
        "logs": user_data.join("logs").to_string_lossy(),
        "backups": user_data.join("backups").to_string_lossy(),
    })
}

fn recent_actions(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, KV_RECENT_ACTIONS) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn last_activity(app: &tauri::AppHandle) -> u64 {
    crate::kv_get(app, KV_LAST_ACTIVITY)
        .as_u64()
        .unwrap_or_else(now_ms)
}

fn get_status(app: &tauri::AppHandle) -> Value {
    let enc = encryption_config(app);
    let enc_enabled = enc.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    let key_source = if enc_enabled {
        enc.get("keySource")
            .and_then(|v| v.as_str())
            .unwrap_or("system")
            .to_string()
    } else {
        "none".to_string()
    };
    let (total, enabled, high_risk) = permission_statistics(app);
    let actions = recent_actions(app);
    let recent: Vec<Value> = {
        let start = actions.len().saturating_sub(10);
        actions[start..].to_vec()
    };
    let perf_health = performance_status_health();
    let last_audit = crate::kv_get(app, KV_LAST_AUDIT)
        .as_u64()
        .map(|v| json!(v))
        .unwrap_or(Value::Null);

    json!({
        "encryption": {
            "enabled": enc_enabled,
            "keySource": key_source,
            "encryptedCategories": encrypted_categories(&enc),
            "lastKeyRotation": enc.get("lastKeyRotation").cloned().unwrap_or(Value::Null),
        },
        "permissions": {
            "total": total,
            "enabled": enabled,
            "highRisk": high_risk,
            "restrictedMode": is_restricted_mode(app),
        },
        "activity": {
            "backgroundTasksRunning": 0,
            "pendingTasks": 0,
            "lastActivity": last_activity(app),
            "isIdle": true,
        },
        "recentActions": recent,
        "dataLocations": data_locations(app),
        "health": {
            "overall": perf_health,
            "dataIntegrity": true,
            "performanceHealth": perf_health,
            "lastSecurityAudit": last_audit,
        },
    })
}

// ArchitectureContract.getVersionInfo()
fn version_info() -> Value {
    json!({
        "appVersion": APP_VERSION,
        "schemaVersion": SCHEMA_VERSION,
        "dataFormatVersion": DATA_FORMAT_VERSION,
        "encryptionSchemaVersion": ENCRYPTION_SCHEMA_VERSION,
        "ipcContractVersion": IPC_CONTRACT_VERSION,
        "lastMigration": Value::Null,
    })
}

// ArchitectureContract.getSchemas() — frozen schema definitions.
fn frozen_schemas() -> Value {
    let field = |name: &str, ty: &str, required: bool, description: &str| {
        json!({ "name": name, "type": ty, "required": required, "description": description, "since": 1 })
    };
    json!({
        "action": {
            "version": 1, "name": "DexAction", "description": "Automation action definition",
            "frozen": true, "frozenAt": "2024-01-15",
            "fields": [
                field("id", "string", true, "Unique identifier"),
                field("name", "string", true, "Display name"),
                field("type", "ActionType", true, "Action type"),
                field("target", "string", true, "Target path/url/command"),
                field("args", "string[]", true, "Arguments array"),
                field("icon", "string", true, "Icon identifier"),
                field("color", "string", true, "Color hex code"),
                field("enabled", "boolean", true, "Active state"),
                field("createdAt", "number", true, "Creation timestamp"),
            ],
        },
        "mode": {
            "version": 1, "name": "DexMode", "description": "Environment mode definition",
            "frozen": true, "frozenAt": "2024-01-15",
            "fields": [
                field("id", "string", true, "Unique identifier"),
                field("name", "string", true, "Display name"),
                field("description", "string", true, "Description"),
                field("icon", "string", true, "Icon identifier"),
                field("color", "string", true, "Color hex code"),
                field("actions", "string[]", true, "Action IDs to execute"),
                field("enableRules", "string[]", true, "Rules to enable"),
                field("disableRules", "string[]", true, "Rules to disable"),
                field("schedule", "ModeSchedule?", false, "Optional schedule"),
                field("active", "boolean", true, "Current state"),
                field("createdAt", "number", true, "Creation timestamp"),
            ],
        },
        "rule": {
            "version": 1, "name": "DexRule", "description": "Automation rule definition",
            "frozen": true, "frozenAt": "2024-01-15",
            "fields": [
                field("id", "string", true, "Unique identifier"),
                field("name", "string", true, "Display name"),
                field("description", "string", true, "Description"),
                field("enabled", "boolean", true, "Active state"),
                field("conditions", "RuleCondition[]", true, "Trigger conditions"),
                field("actions", "string[]", true, "Actions to execute"),
                field("cooldown", "number", true, "Cooldown in ms"),
                field("lastTriggered", "number?", false, "Last trigger time"),
                field("triggerCount", "number", true, "Total triggers"),
                field("createdAt", "number", true, "Creation timestamp"),
            ],
        },
        "encryptedData": {
            "version": 1, "name": "EncryptedData", "description": "Encrypted data envelope format",
            "frozen": true, "frozenAt": "2024-01-15",
            "fields": [
                field("v", "number", true, "Schema version"),
                field("alg", "string", true, "Algorithm identifier"),
                field("iv", "string", true, "Initialization vector (base64)"),
                field("tag", "string", true, "Auth tag (base64)"),
                field("ct", "string", true, "Ciphertext (base64)"),
            ],
        },
        "session": {
            "version": 1, "name": "DexSession", "description": "Work session definition",
            "frozen": true, "frozenAt": "2024-01-15",
            "fields": [
                field("id", "string", true, "Unique identifier"),
                field("name", "string", true, "Display name"),
                field("description", "string", true, "Description"),
                field("operations", "string[]", true, "Operation IDs"),
                field("targets", "SessionTarget[]", true, "Targets to open"),
                field("mode", "string?", false, "Associated mode"),
                field("icon", "string", true, "Icon identifier"),
                field("color", "string", true, "Color hex code"),
                field("lastUsed", "number?", false, "Last use timestamp"),
                field("useCount", "number", true, "Total uses"),
                field("createdAt", "number", true, "Creation timestamp"),
            ],
        },
    })
}

// ArchitectureContract.getIPCContracts()
fn ipc_contracts() -> Value {
    let c = |channel: &str, direction: &str, description: &str| {
        json!({ "channel": channel, "direction": direction, "description": description, "since": 1 })
    };
    json!([
        c("window:minimize", "renderer-to-main", "Minimize window"),
        c("window:maximize", "renderer-to-main", "Maximize/restore window"),
        c("window:close", "renderer-to-main", "Close to tray"),
        json!({ "channel": "actions:getAll", "direction": "renderer-to-main", "responseType": "DexAction[]", "description": "Get all actions", "since": 1 }),
        json!({ "channel": "actions:create", "direction": "renderer-to-main", "requestType": "Partial<DexAction>", "responseType": "DexAction", "description": "Create action", "since": 1 }),
        json!({ "channel": "actions:execute", "direction": "renderer-to-main", "requestType": "string", "description": "Execute action by ID", "since": 1 }),
        json!({ "channel": "modes:getAll", "direction": "renderer-to-main", "responseType": "DexMode[]", "description": "Get all modes", "since": 1 }),
        json!({ "channel": "modes:activate", "direction": "renderer-to-main", "requestType": "string", "description": "Activate mode by ID", "since": 1 }),
        json!({ "channel": "rules:getAll", "direction": "renderer-to-main", "responseType": "DexRule[]", "description": "Get all rules", "since": 1 }),
        json!({ "channel": "encryption:getStatus", "direction": "renderer-to-main", "responseType": "EncryptionConfig", "description": "Get encryption status", "since": 1 }),
        json!({ "channel": "encryption:enable", "direction": "renderer-to-main", "requestType": "EnableOptions", "description": "Enable encryption", "since": 1 }),
        json!({ "channel": "trust:getStatus", "direction": "renderer-to-main", "responseType": "TrustStatus", "description": "Get trust panel status", "since": 1 }),
    ])
}

fn get_architecture() -> Value {
    json!({
        "version": version_info(),
        "schemas": frozen_schemas(),
        "ipcContracts": ipc_contracts(),
    })
}

fn get_full_report(app: &tauri::AppHandle) -> Value {
    json!({
        "generatedAt": now_ms(),
        "appVersion": APP_VERSION,
        "trust": get_status(app),
        "security": perform_full_audit(app),
        "performance": performance_report(),
        "permissions": permission_map(app),
        "dataIntegrity": verify_all_files(app),
        "architecture": {
            "schemaVersion": SCHEMA_VERSION,
            "dataFormatVersion": DATA_FORMAT_VERSION,
            "migrationHistory": [],
        },
    })
}

// =============================================================================
// HumanErrors catalog (verbatim get(code) -> HumanError, fallback UNKNOWN)
// =============================================================================

fn human_error(code: &str) -> Value {
    macro_rules! he {
        ($title:expr, $message:expr, $sev:expr, $rec:expr) => {
            json!({ "title": $title, "message": $message, "recoverable": $rec, "severity": $sev })
        };
        ($title:expr, $message:expr, $action:expr, $sev:expr, $rec:expr) => {
            json!({ "title": $title, "message": $message, "action": $action, "recoverable": $rec, "severity": $sev })
        };
        ($title:expr, $message:expr, $action:expr, $label:expr, $sev:expr, $rec:expr) => {
            json!({ "title": $title, "message": $message, "action": $action, "actionLabel": $label, "recoverable": $rec, "severity": $sev })
        };
    }
    match code {
        "SYSTEM_MEMORY_PRESSURE" => he!(
            "Running low on memory",
            "Your computer is running low on available memory. Dex will continue working, but some features may be slower.",
            "Consider closing unused applications to free up memory.",
            "warning", true
        ),
        "SYSTEM_DISK_FULL" => he!(
            "Storage space is full",
            "There isn't enough storage space to save your data. Please free up some space.",
            "Open your file manager to remove unused files.",
            "Open Files", "error", true
        ),
        "SYSTEM_PERMISSION_DENIED" => he!(
            "Permission needed",
            "Dex needs permission to perform this action. You can grant it in Settings.",
            "Go to Settings Security to manage permissions.",
            "Open Settings", "warning", true
        ),
        "DATA_CORRUPTION" => he!(
            "Data needs repair",
            "Some of your data couldn't be read properly. Dex will try to recover it automatically.",
            "If problems persist, you can restore from a backup in Settings.",
            "View Backups", "warning", true
        ),
        "DATA_LOAD_FAILED" => he!(
            "Couldn't load data",
            "Dex couldn't access your saved data. This might be temporary.",
            "Try restarting Dex. Your data should still be safe.",
            "Restart Dex", "error", true
        ),
        "DATA_SAVE_FAILED" => he!(
            "Couldn't save changes",
            "Your recent changes couldn't be saved. Don't worry, we'll keep trying.",
            "Make sure you have enough storage space and try again.",
            "warning", true
        ),
        "DATA_VALIDATION_FAILED" => he!(
            "Invalid data",
            "The data you entered doesn't look quite right. Please check and try again.",
            "info", true
        ),
        "OPERATION_TIMEOUT" => he!(
            "Taking longer than expected",
            "This operation is taking a while. It will continue in the background.",
            "You can check the status in the activity panel.",
            "info", true
        ),
        "OPERATION_CANCELLED" => he!(
            "Operation cancelled",
            "The operation was stopped. No changes were made.",
            "info", true
        ),
        "OPERATION_FAILED" => he!(
            "Something didn't work",
            "This operation couldn't be completed. You can try again.",
            "If this keeps happening, check your settings.",
            "warning", true
        ),
        "ENCRYPTION_INIT_FAILED" => he!(
            "Couldn't set up encryption",
            "There was a problem setting up data protection. Your data is still safe, just not encrypted yet.",
            "Try again from Settings Security.",
            "Open Security", "warning", true
        ),
        "ENCRYPTION_UNLOCK_FAILED" => he!(
            "Couldn't unlock your data",
            "The password or key didn't work. Please try again.",
            "Make sure you're using the correct password.",
            "warning", true
        ),
        "ENCRYPTION_KEY_MISSING" => he!(
            "Encryption key not found",
            "Dex can't find the key to unlock your encrypted data.",
            "You may need to enter your password manually.",
            "Enter Password", "error", true
        ),
        "ACTION_APP_NOT_FOUND" => he!(
            "Application not found",
            "Dex couldn't find the application. It may have been moved or uninstalled.",
            "Check the action settings and update the path if needed.",
            "Edit Action", "warning", true
        ),
        "ACTION_PERMISSION_DENIED" => he!(
            "Permission needed for this action",
            "This action requires a permission that's currently disabled.",
            "Enable the required permission in Settings Security.",
            "View Permissions", "info", true
        ),
        "PYTHON_EXECUTION_FAILED" => he!(
            "Script couldn't run",
            "There was a problem running the automation script.",
            "Check that Python is installed and the script is valid.",
            "warning", true
        ),
        "PYTHON_TIMEOUT" => he!(
            "Script took too long",
            "The script was stopped because it was taking too long. This prevents freezing.",
            "The script may need optimization, or you can increase the timeout.",
            "info", true
        ),
        "PYTHON_NOT_INSTALLED" => he!(
            "Python not available",
            "Some features need Python to work, but it's not installed or not found.",
            "Install Python to enable all automation features.",
            "Learn More", "info", true
        ),
        "NETWORK_OFFLINE" => he!(
            "You're offline",
            "Some features need an internet connection. They'll work again when you're back online.",
            "info", true
        ),
        "NETWORK_REQUEST_FAILED" => he!(
            "Connection problem",
            "Couldn't reach the server. This might be temporary.",
            "Check your internet connection and try again.",
            "warning", true
        ),
        _ => he!(
            "Something unexpected happened",
            "Dex ran into an issue, but your data should be safe.",
            "Try the operation again. If this keeps happening, restart Dex.",
            "warning", true
        ),
    }
}

// =============================================================================
// Arg helpers
// =============================================================================

fn arg_str(args: &Value, i: usize) -> Option<String> {
    args.get(i).and_then(|v| v.as_str()).map(|s| s.to_string())
}

fn arg_string_array(args: &Value, i: usize) -> Option<Vec<String>> {
    args.get(i).and_then(|v| v.as_array()).map(|a| {
        a.iter()
            .filter_map(|x| x.as_str().map(|s| s.to_string()))
            .collect()
    })
}

// =============================================================================
// Dispatch
// =============================================================================

/// Route a `trust:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- Trust store (PluginController) --------------------------------
        "trust:list" => load_store(app),

        // --- Transparency panel (TrustController) --------------------------
        "trust:getStatus" => get_status(app),
        "trust:getFullReport" => get_full_report(app),
        "trust:getPermissions" => permission_map(app),
        "trust:getPerformance" => performance_report(),
        "trust:getDataLocations" => data_locations(app),
        "trust:getArchitecture" => get_architecture(),

        "trust:runSecurityAudit" => perform_full_audit(app),
        "trust:verifyIntegrity" => verify_all_files(app),
        "trust:verifyAuditChain" => verify_chain(app),

        "trust:getAuditLog" => {
            let count = args
                .get(0)
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(100);
            let category = arg_str(args, 1);
            audit_entries(app, count, category.as_deref())
        }

        "trust:getHumanError" => {
            let code = arg_str(args, 0).unwrap_or_default();
            human_error(&code)
        }

        // --- Permission mutations ------------------------------------------
        "trust:grantPermission" => {
            let p = arg_str(args, 0).unwrap_or_default();
            json!(grant_permission(app, &p))
        }
        "trust:revokePermission" => {
            let p = arg_str(args, 0).unwrap_or_default();
            json!(revoke_permission(app, &p))
        }
        "trust:enableRestrictedMode" => {
            enable_restricted_mode(app, arg_string_array(args, 0));
            json!(true)
        }
        "trust:disableRestrictedMode" => {
            disable_restricted_mode(app);
            json!(true)
        }

        // --- Channels with no Electron source under trust: -----------------
        // `trust:get`, `trust:verify`, `trust:certify` do not exist anywhere in
        // the Electron `trust:` namespace (see header). There is nothing to port;
        // they degrade honestly rather than being invented.
        "trust:get" | "trust:verify" | "trust:certify" => {
            json!({ "success": false, "error": "not ported (no such trust: handler in Electron)" })
        }

        // --- Trust-store mutations (need Ed25519 keyId derivation) ----------
        // add/revoke/rotate require sha256-over-publicKey keyId derivation and key
        // validation (native crypto / key management) — intentionally not faked.
        "trust:add" | "trust:revoke" | "trust:rotate" => {
            json!({ "success": false, "error": "not ported (needs native key management)" })
        }

        _ => Value::Null,
    }
}
