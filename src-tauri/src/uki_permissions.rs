// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//! Native authority for assistant grants. Renderer caches are never trusted.
use serde_json::{json, Value};
use std::sync::OnceLock;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

pub const KEY: &str = "uki:native-permissions";
const CAPABILITIES: &[&str] = &["screen-read", "file-read", "file-write", "shell", "network", "clipboard", "microphone", "camera", "notifications"];
static SESSION: OnceLock<String> = OnceLock::new();
fn session() -> &'static str { SESSION.get_or_init(crate::util::pseudo_uuid_v4) }
fn now() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

fn live(record: &Value, timestamp: u64, session_id: &str) -> bool {
    let granted = record.get("grantedTs").and_then(Value::as_u64).unwrap_or(u64::MAX);
    if granted > timestamp { return false; }
    match record.get("scope").and_then(Value::as_str) {
        Some("persistent") => record.get("expiresTs").is_none(),
        Some("session") => record.get("nativeSession").and_then(Value::as_str) == Some(session_id)
            && record.get("expiresTs").and_then(Value::as_u64).is_some_and(|expiry| expiry > timestamp),
        _ => false,
    }
}

fn authority_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    crate::kv_path(app).map(|path| path.with_file_name("uki-native-permissions.json"))
}
pub fn list(app: &tauri::AppHandle) -> Value {
    let stored = authority_path(app).ok().and_then(|path| crate::kv_repository::get_current(&path, KEY).ok()).unwrap_or(Value::Null);
    let records: Vec<Value> = stored.as_array().into_iter().flatten()
        .filter(|record| live(record, now(), session())).cloned().collect();
    json!(records)
}
pub fn granted(app: &tauri::AppHandle, capability: &str) -> bool {
    list(app).as_array().is_some_and(|records| records.iter().any(|r| r.get("capability").and_then(Value::as_str) == Some(capability)))
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    if channel == "uki:permissions:list" { return list(app); }
    if !["uki:permissions:grant", "uki:permissions:revoke"].contains(&channel) { return json!({"ok": false, "error": "Unknown permission operation"}); }
    let capability = args.get(0).and_then(Value::as_str).unwrap_or("");
    if !CAPABILITIES.contains(&capability) { return json!({"ok": false, "error": "Unknown capability"}); }
    let grant = channel == "uki:permissions:grant";
    let scope = args.get(1).and_then(Value::as_str).unwrap_or("session");
    if grant && !["session", "persistent"].contains(&scope) { return json!({"ok": false, "error": "Invalid grant scope"}); }
    if grant && !app.dialog().message(format!("Allow UKI capability: {capability}?\nScope: {scope}.\nThis grants assistant access until revoked{}.", if scope == "session" { " or this app session ends (maximum four hours)" } else { "" }))
        .title("DEX — Assistant permission").buttons(MessageDialogButtons::OkCancel).blocking_show() {
        return json!({"ok": false, "error": "Permission denied by user"});
    }
    let timestamp = now();
    let mut record = json!({"schemaVersion": 1, "capability": capability, "scope": scope, "grantedTs": timestamp});
    if scope == "session" {
        record["expiresTs"] = json!(timestamp + 4 * 60 * 60 * 1000);
        record["nativeSession"] = json!(session());
    }
    let result = authority_path(app).and_then(|path| crate::kv_repository::update_authority(&path, |map| {
        let mut records: Vec<Value> = map.get(KEY).and_then(Value::as_array).into_iter().flatten()
            .filter(|r| live(r, timestamp, session()) && r.get("capability").and_then(Value::as_str) != Some(capability)).cloned().collect();
        if grant { records.push(record.clone()); }
        map.insert(KEY.into(), json!(records));
        Ok(())
    }).map_err(|e| e.to_string()));
    match result {
        Ok(()) => json!({"ok": true, "record": if grant { record } else { Value::Null }}),
        Err(error) => json!({"ok": false, "error": error}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn session_grants_expire_and_do_not_survive_restart() {
        let record = json!({"scope": "session", "grantedTs": 10, "expiresTs": 100, "nativeSession": "one"});
        assert!(live(&record, 20, "one"));
        assert!(!live(&record, 100, "one"));
        assert!(!live(&record, 20, "two"));
        assert!(!live(&record, 5, "one"));
    }
    #[test]
    fn malformed_grants_fail_closed() {
        assert!(!live(&json!({"scope":"session", "grantedTs":10}), 20, "one"));
        assert!(!live(&json!({"scope":"other", "grantedTs":10}), 20, "one"));
        assert!(live(&json!({"scope":"persistent", "grantedTs":10}), 20, "one"));
    }
}
