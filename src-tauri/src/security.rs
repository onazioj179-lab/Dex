// =============================================================================
// DEX 6.0 — Security permissions store (SecurityController parity, native)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! The portable core of the Electron `SecurityController`: the permissions
//! registry + toggle + audit log + report. Channels:
//!   security:getPermissions          -> Permission[]
//!   security:getPermission   (id)    -> Permission | null
//!   security:togglePermission(id,on) -> { success, error? }  (required perms locked)
//!   security:getLog                  -> LogEntry[]
//!   security:getReport               -> { appVersion, reportDate, permissions, sandbox, recommendations, risks }
//!
//! Session-scoped managed state (matches Electron's in-memory Map — toggles do
//! not persist across restart). The Electron `verifySandbox`/`exportAudit` are
//! Electron-sandbox-specific and intentionally NOT ported (they'd misreport in a
//! webview shell); the report carries a static sandbox summary instead.
//! Timestamps are epoch-ms (vs Electron's ISO string) — `new Date(ts)` reads both.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

#[derive(Clone, Serialize)]
pub struct Permission {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub reason: &'static str,
    pub required: bool,
    pub enabled: bool,
    pub scope: &'static str,
    pub risks: Vec<&'static str>,
    pub mitigations: Vec<&'static str>,
}

#[derive(Clone, Serialize)]
pub struct LogEntry {
    pub timestamp: i64,
    pub event: String,
    pub details: String,
}

/// File integrity record (parity with the Electron `IntegrityRecord`).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityRecord {
    pub file_path: String,
    pub hash: String,
    pub size: u64,
    pub last_verified: i64,
    pub status: String, // "verified" | "modified"
}

/// Security threat (parity with the Electron `SecurityThreat`). `kind` serializes
/// as `type` (a Rust keyword).
#[derive(Clone, Serialize)]
pub struct SecurityThreat {
    pub id: String,
    pub severity: String, // low | medium | high | critical
    #[serde(rename = "type")]
    pub kind: String, // integrity | tampering | exposure | permission
    pub message: String,
    pub timestamp: i64,
    pub resolved: bool,
}

pub struct SecurityState {
    permissions: Vec<Permission>,
    log: Vec<LogEntry>,
    integrity: HashMap<String, IntegrityRecord>,
    threats: Vec<SecurityThreat>,
}

impl Default for SecurityState {
    fn default() -> Self {
        Self {
            permissions: default_registry(),
            log: Vec::new(),
            integrity: HashMap::new(),
            threats: Vec::new(),
        }
    }
}

/// recordThreat: newest-first, capped (mirrors MAX_THREATS_STORED).
fn record_threat(state: &mut SecurityState, severity: &str, kind: &str, message: String) {
    let id = format!("threat-{}-{}", now_ms(), state.threats.len());
    state.threats.insert(0, SecurityThreat {
        id,
        severity: severity.to_string(),
        kind: kind.to_string(),
        message,
        timestamp: now_ms(),
        resolved: false,
    });
    if state.threats.len() > 100 {
        state.threats.truncate(100);
    }
}

/// SHA-256 (hex) + byte size of a file's current contents, or None if unreadable.
fn file_hash_and_size(path: &str) -> Option<(String, u64)> {
    let bytes = std::fs::read(path).ok()?;
    let size = bytes.len() as u64;
    Some((crate::licensing::sha256_hex(&bytes), size))
}

/// registerFileIntegrity: snapshot the file's hash + size as the trusted baseline.
fn register_integrity(state: &mut SecurityState, path: &str) -> Value {
    match file_hash_and_size(path) {
        Some((hash, size)) => {
            let rec = IntegrityRecord {
                file_path: path.to_string(),
                hash,
                size,
                last_verified: now_ms(),
                status: "verified".to_string(),
            };
            state.integrity.insert(path.to_string(), rec.clone());
            serde_json::to_value(&rec).unwrap_or(Value::Null)
        }
        None => Value::Null,
    }
}

/// verifyFileIntegrity: recompute + compare to the baseline; null if never
/// registered or unreadable. `status` flips to "modified" on any hash/size change.
fn verify_integrity(state: &mut SecurityState, path: &str) -> Value {
    if !state.integrity.contains_key(path) {
        return Value::Null;
    }
    match file_hash_and_size(path) {
        Some((hash, size)) => {
            let rec = state.integrity.get_mut(path).unwrap();
            let modified = rec.hash != hash || rec.size != size;
            rec.last_verified = now_ms();
            rec.status = if modified { "modified" } else { "verified" }.to_string();
            let result = serde_json::to_value(&*rec).unwrap_or(Value::Null);
            // A modified file is an integrity threat (mirrors recordThreat).
            if modified {
                record_threat(state, "medium", "integrity", format!("File modified: {}", path));
            }
            result
        }
        None => Value::Null,
    }
}

/// The permissions registry — a faithful copy of `PERMISSIONS_REGISTRY`.
fn default_registry() -> Vec<Permission> {
    // Compact constructor: 9 args map 1:1 to Permission's fields so the registry
    // below reads as a concise table. A struct/builder would bloat 15+ call sites.
    #[allow(clippy::too_many_arguments)]
    fn p(
        id: &'static str, name: &'static str, description: &'static str, reason: &'static str,
        required: bool, enabled: bool, scope: &'static str, risks: Vec<&'static str>, mitigations: Vec<&'static str>,
    ) -> Permission {
        Permission { id, name, description, reason, required, enabled, scope, risks, mitigations }
    }
    vec![
        p("file-system", "File System Access", "Read and write files on the local file system",
          "Required for saving user data, notes, recordings, and exports", true, true, "main",
          vec!["Could access sensitive files if misused"],
          vec!["Access limited to user data directory", "File operations only through controlled handlers", "No arbitrary path access from renderer"]),
        p("system-info", "System Information", "Read CPU, memory, disk, and process information",
          "Required for power management and system optimization", true, true, "main",
          vec!["Could reveal system configuration"],
          vec!["Data stays local", "No network transmission", "User can disable monitoring"]),
        p("process-control", "Process Control", "List and manage system processes",
          "Required for resource management and app closing", false, true, "main",
          vec!["Could terminate important processes"],
          vec!["Requires user confirmation for kills", "System processes protected", "Only affects user-space processes"]),
        p("audio-control", "Audio Control", "Control system volume and audio settings",
          "Required for voice features and volume control", false, true, "main",
          vec!["Could mute system unexpectedly"],
          vec!["Only responds to explicit user commands", "No automatic audio changes"]),
        p("notifications", "System Notifications", "Display desktop notifications",
          "Required for alerts, timers, and reminders", false, true, "main",
          vec!["Could spam notifications"],
          vec!["Rate limited", "User can disable"]),
        p("startup", "Launch at Startup", "Start application when system boots",
          "Optional convenience feature", false, false, "main",
          vec!["Uses system resources at boot"],
          vec!["Disabled by default", "User must explicitly enable"]),
        p("network", "Network Access", "Make HTTP requests for updates",
          "Required only for checking app updates", false, true, "main",
          vec!["Could potentially send data externally"],
          vec!["Only connects to update server", "No user data transmitted", "CSP blocks other connections"]),
        p("clipboard", "Clipboard Access", "Read and write to system clipboard",
          "Required for copy/paste functionality", false, true, "both",
          vec!["Could read sensitive clipboard data"],
          vec!["Only accesses when user initiates copy/paste", "No background clipboard monitoring"]),
    ]
}

fn log_event(state: &mut SecurityState, event: &str, details: String) {
    state.log.push(LogEntry { timestamp: now_ms(), event: event.to_string(), details });
    if state.log.len() > 100 {
        state.log.remove(0);
    }
}

/// togglePermission(id, enabled): required permissions can never be disabled.
fn toggle(state: &mut SecurityState, id: &str, enabled: bool) -> Value {
    let idx = state.permissions.iter().position(|p| p.id == id);
    match idx {
        None => json!({ "success": false, "error": "Permission not found" }),
        Some(i) => {
            if state.permissions[i].required {
                return json!({ "success": false, "error": "Cannot disable required permission" });
            }
            state.permissions[i].enabled = enabled;
            log_event(
                state,
                if enabled { "permission-enabled" } else { "permission-disabled" },
                format!("Permission {} {}", id, if enabled { "enabled" } else { "disabled" }),
            );
            json!({ "success": true })
        }
    }
}

/// generateSecurityReport parity: permissions + derived risks/recommendations.
fn report(state: &SecurityState) -> Value {
    let mut risks: Vec<Value> = Vec::new();
    let mut recommendations: Vec<&str> = Vec::new();
    for p in &state.permissions {
        if p.enabled && !p.required && p.id == "process-control" {
            risks.push(json!({ "level": "medium", "description": "Process control is enabled - can terminate applications" }));
        }
    }
    if state.permissions.iter().any(|p| p.id == "startup" && p.enabled) {
        recommendations.push("Consider disabling startup permission if not needed");
    }
    json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "reportDate": now_ms(),
        "permissions": serde_json::to_value(&state.permissions).unwrap_or(json!([])),
        "sandbox": { "sandboxed": true, "details": { "contextIsolation": true, "nodeIntegration": false } },
        "recommendations": recommendations,
        "risks": risks,
    })
}

pub fn dispatch(state: &mut SecurityState, channel: &str, args: &Value) -> Value {
    match channel {
        "security:getPermissions" => serde_json::to_value(&state.permissions).unwrap_or(json!([])),
        "security:getPermission" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            state
                .permissions
                .iter()
                .find(|p| p.id == id)
                .and_then(|p| serde_json::to_value(p).ok())
                .unwrap_or(Value::Null)
        }
        "security:togglePermission" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let enabled = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            toggle(state, &id, enabled)
        }
        "security:getLog" => serde_json::to_value(&state.log).unwrap_or(json!([])),
        "security:getReport" => report(state),
        "security:register-file-integrity" => {
            register_integrity(state, args.get(0).and_then(|v| v.as_str()).unwrap_or(""))
        }
        "security:verify-file-integrity" => {
            verify_integrity(state, args.get(0).and_then(|v| v.as_str()).unwrap_or(""))
        }
        "security:get-threats" => serde_json::to_value(&state.threats).unwrap_or(json!([])),
        "security:resolve-threat" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            match state.threats.iter_mut().find(|t| t.id == id) {
                Some(t) => { t.resolved = true; json!(true) }
                None => json!(false),
            }
        }
        // Other security:* channels (layered status, key vault, deep checks, etc.)
        // are not ported here and degrade to null, as before.
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toggle_respects_required_and_logs() {
        let mut s = SecurityState::default();
        assert_eq!(s.permissions.len(), 8);

        // Required permission cannot be disabled.
        let r = toggle(&mut s, "file-system", false);
        assert_eq!(r["success"], json!(false));
        assert!(s.permissions.iter().find(|p| p.id == "file-system").unwrap().enabled);

        // Optional permission toggles + is logged.
        let r2 = toggle(&mut s, "startup", true);
        assert_eq!(r2["success"], json!(true));
        assert!(s.permissions.iter().find(|p| p.id == "startup").unwrap().enabled);
        assert_eq!(s.log.len(), 1);
        assert_eq!(s.log[0].event, "permission-enabled");

        // Unknown permission rejected.
        assert_eq!(toggle(&mut s, "nope", true)["success"], json!(false));
    }

    #[test]
    fn report_derives_risks_and_recommendations() {
        let mut s = SecurityState::default();
        // process-control enabled by default -> a medium risk.
        let rep = report(&s);
        assert!(rep["risks"].as_array().unwrap().iter().any(|r| r["level"] == "medium"));
        // startup off by default -> no recommendation; enable it -> recommendation appears.
        assert!(rep["recommendations"].as_array().unwrap().is_empty());
        toggle(&mut s, "startup", true);
        let rep2 = report(&s);
        assert_eq!(rep2["recommendations"].as_array().unwrap().len(), 1);
        assert_eq!(rep2["permissions"].as_array().unwrap().len(), 8);
    }

    #[test]
    fn file_integrity_detects_tampering() {
        let mut s = SecurityState::default();
        let path = std::env::temp_dir().join("dex-integrity-test.txt");
        let path_str = path.to_string_lossy().to_string();
        std::fs::write(&path, b"original contents").unwrap();

        // Register baseline -> verified, 64-hex hash.
        let reg = register_integrity(&mut s, &path_str);
        assert_eq!(reg["status"], json!("verified"));
        assert_eq!(reg["hash"].as_str().unwrap().len(), 64);

        // Unchanged file verifies clean.
        assert_eq!(verify_integrity(&mut s, &path_str)["status"], json!("verified"));

        // Tamper -> verify flips to "modified".
        std::fs::write(&path, b"tampered, different length").unwrap();
        assert_eq!(verify_integrity(&mut s, &path_str)["status"], json!("modified"));

        // The modification recorded an integrity threat, surfaced + resolvable
        // through the channels.
        assert_eq!(s.threats.len(), 1);
        assert_eq!(s.threats[0].kind, "integrity");
        assert!(!s.threats[0].resolved);
        let threats = dispatch(&mut s, "security:get-threats", &json!([]));
        assert_eq!(threats.as_array().unwrap().len(), 1);
        let tid = s.threats[0].id.clone();
        assert_eq!(dispatch(&mut s, "security:resolve-threat", &json!([tid])), json!(true));
        assert!(s.threats[0].resolved);
        assert_eq!(dispatch(&mut s, "security:resolve-threat", &json!(["bogus"])), json!(false));

        // Never-registered path -> null.
        assert!(verify_integrity(&mut s, "/no/such/dex/path").is_null());

        let _ = std::fs::remove_file(&path);
    }
}
