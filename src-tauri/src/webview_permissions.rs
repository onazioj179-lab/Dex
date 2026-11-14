// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Web permission requests from DEX's own interface.
//!
//! WebView2 shows a "tauri.localhost wants to ..." prompt for every clipboard
//! read, MIDI, camera, etc. request and, when the prompt is dismissed, asks again
//! on the next request. This module answers those requests for DEX's own pages
//! from one stored policy per permission (Allow / Ask / Block) that the user
//! reviews and changes in Settings › Privacy & Security › Permissions.
//!
//! Scope is deliberately narrow:
//! * Only the main window's webview is hooked. Browser tabs are separate child
//!   webviews (`browser_view.rs`) and keep WebView2's own prompts.
//! * Only requests whose origin is DEX's bundled app (`tauri.localhost`, or the
//!   dev server in debug builds) are answered. Anything else, such as an embedded
//!   third-party frame, falls through to WebView2's prompt.
//! * "Ask" hands the request back to WebView2 unchanged, so the platform prompt
//!   and its saved decision still apply.

use crate::util::LockSafe;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const KV_KEY: &str = "webPermissions";

struct Kind {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    default: &'static str,
}

// Defaults: clipboard read is allowed because DEX only reads the clipboard when
// you paste or open clipboard history (it never polls in the background), and
// the same read is already available to DEX natively. MIDI SysEx can reprogram
// devices and no DEX feature needs it, so it is blocked. Everything else asks.
const KINDS: &[Kind] = &[
    Kind { id: "clipboardRead", label: "Clipboard", description: "Read text and images you copied, when you paste or open clipboard history", default: "allow" },
    Kind { id: "midiSysex", label: "MIDI device programming", description: "Send system-exclusive messages that can reprogram MIDI hardware. No DEX feature needs this", default: "deny" },
    Kind { id: "microphone", label: "Microphone", description: "Voice input, dictation and audio recording", default: "ask" },
    Kind { id: "camera", label: "Camera", description: "Video capture", default: "ask" },
    Kind { id: "geolocation", label: "Location", description: "Your approximate location, for Maps and Weather", default: "ask" },
    Kind { id: "notifications", label: "Web notifications", description: "Notifications sent through the web notification API", default: "ask" },
    Kind { id: "fileReadWrite", label: "File editing", description: "Edit a file you opened through a web file picker", default: "ask" },
    Kind { id: "windowManagement", label: "Window placement", description: "Read display layout to place windows", default: "ask" },
    Kind { id: "localFonts", label: "Installed fonts", description: "List the fonts installed on this computer", default: "ask" },
    Kind { id: "otherSensors", label: "Motion sensors", description: "Accelerometer, gyroscope and other device sensors", default: "ask" },
];

fn kind_def(id: &str) -> Option<&'static Kind> {
    KINDS.iter().find(|k| k.id == id)
}

fn valid_policy(p: &str) -> bool {
    matches!(p, "allow" | "ask" | "deny")
}

/// Stored policy overrides (only non-default choices are persisted).
fn policies() -> &'static Mutex<Map<String, Value>> {
    static P: OnceLock<Mutex<Map<String, Value>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(Map::new()))
}

/// Last request per permission: (unix ms, decision applied).
fn last_requests() -> &'static Mutex<HashMap<&'static str, (u64, &'static str)>> {
    static L: OnceLock<Mutex<HashMap<&'static str, (u64, &'static str)>>> = OnceLock::new();
    L.get_or_init(|| Mutex::new(HashMap::new()))
}

fn policy_for(id: &str) -> &'static str {
    let def = kind_def(id).map(|k| k.default).unwrap_or("ask");
    let stored = policies().lock().ok().and_then(|m| m.get(id).and_then(|v| v.as_str()).map(str::to_owned));
    match stored.as_deref() {
        Some("allow") => "allow",
        Some("deny") => "deny",
        Some("ask") => "ask",
        _ => def,
    }
}

/// True for DEX's bundled interface. The dev server only counts in debug builds.
pub(crate) fn is_trusted_origin(uri: &str) -> bool {
    let lower = uri.to_ascii_lowercase();
    if lower.starts_with("http://tauri.localhost") || lower.starts_with("https://tauri.localhost") || lower.starts_with("tauri://localhost") {
        // Reject look-alikes such as tauri.localhost.example.com.
        let rest = lower.splitn(2, "localhost").nth(1).unwrap_or("");
        return rest.is_empty() || rest.starts_with('/') || rest.starts_with(':') || rest.starts_with('?');
    }
    cfg!(debug_assertions) && (lower.starts_with("http://localhost:") || lower.starts_with("http://127.0.0.1:"))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The decision for one request: Some("allow"/"deny") answers it, None leaves it
/// to WebView2. Pure so it can be unit-tested without a webview.
pub(crate) fn decide(kind_id: &str, origin: &str) -> Option<&'static str> {
    if !is_trusted_origin(origin) {
        return None;
    }
    match policy_for(kind_id) {
        "allow" => Some("allow"),
        "deny" => Some("deny"),
        _ => None,
    }
}

fn record(kind_id: &str, decision: Option<&'static str>) {
    if let (Some(def), Ok(mut m)) = (kind_def(kind_id), last_requests().lock()) {
        m.insert(def.id, (now_ms(), decision.unwrap_or("ask")));
    }
}

/// Load the saved policy and hook the main window's webview. Call once from setup.
pub fn install(app: &tauri::AppHandle) {
    if let Value::Object(saved) = crate::kv_get(app, KV_KEY) {
        if let Ok(mut m) = policies().lock() {
            *m = saved.into_iter().filter(|(k, v)| kind_def(k).is_some() && v.as_str().map(valid_policy).unwrap_or(false)).collect();
        }
    }
    #[cfg(windows)]
    {
        use tauri::Manager;
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.with_webview(|wv| {
                if let Err(e) = unsafe { hook(&wv.controller()) } {
                    crate::webview2::log(&format!("permission handler not installed: {e}"));
                }
            });
        }
    }
}

#[cfg(windows)]
unsafe fn hook(controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller) -> windows_core::Result<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::PermissionRequestedEventHandler;

    let core = controller.CoreWebView2()?;
    let mut token = 0i64;
    core.add_PermissionRequested(
        &PermissionRequestedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
            args.PermissionKind(&mut kind)?;
            let id = match kind {
                COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ => "clipboardRead",
                COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES => "midiSysex",
                COREWEBVIEW2_PERMISSION_KIND_MICROPHONE => "microphone",
                COREWEBVIEW2_PERMISSION_KIND_CAMERA => "camera",
                COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION => "geolocation",
                COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS => "notifications",
                COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE => "fileReadWrite",
                COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT => "windowManagement",
                COREWEBVIEW2_PERMISSION_KIND_LOCAL_FONTS => "localFonts",
                COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS => "otherSensors",
                _ => return Ok(()),
            };
            let origin = {
                let mut uri = windows_core::PWSTR::null();
                args.Uri(&mut uri)?;
                webview2_com::take_pwstr(uri)
            };
            if !is_trusted_origin(&origin) {
                return Ok(());
            }
            let decision = decide(id, &origin);
            record(id, decision);
            match decision {
                Some("allow") => args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?,
                Some("deny") => args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)?,
                _ => {}
            }
            Ok(())
        })),
        &mut token,
    )
}

fn list() -> Value {
    let last = last_requests().lock().map(|m| m.clone()).unwrap_or_default();
    Value::Array(
        KINDS
            .iter()
            .map(|k| {
                let (at, decision) = last.get(k.id).copied().map(|(t, d)| (json!(t), json!(d))).unwrap_or((Value::Null, Value::Null));
                json!({
                    "id": k.id,
                    "label": k.label,
                    "description": k.description,
                    "policy": policy_for(k.id),
                    "default": k.default,
                    "lastRequestedAt": at,
                    "lastDecision": decision,
                })
            })
            .collect(),
    )
}

fn persist(app: &tauri::AppHandle) -> Value {
    let snapshot = policies().lock().map(|m| m.clone()).unwrap_or_default();
    crate::kv_set(app, KV_KEY, Value::Object(snapshot))
}

/// `webPermissions:list` / `webPermissions:set(id, policy)` / `webPermissions:reset`.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "webPermissions:list" => list(),
        "webPermissions:set" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let policy = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let Some(def) = kind_def(id) else { return json!({ "success": false, "error": "Unknown permission" }) };
            if !valid_policy(policy) {
                return json!({ "success": false, "error": "Policy must be allow, ask or deny" });
            }
            if let Ok(mut m) = policies().lock() {
                if policy == def.default { m.remove(id); } else { m.insert(id.to_string(), json!(policy)); }
            }
            persist(app)
        }
        "webPermissions:reset" => {
            if let Ok(mut m) = policies().lock() { m.clear(); }
            persist(app)
        }
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The policy map is process-global; tests that touch it run one at a time.
    static SERIAL: Mutex<()> = Mutex::new(());

    #[test]
    fn only_the_bundled_origin_is_trusted() {
        assert!(is_trusted_origin("http://tauri.localhost/"));
        assert!(is_trusted_origin("https://tauri.localhost"));
        assert!(is_trusted_origin("tauri://localhost/index.html"));
        assert!(!is_trusted_origin("http://tauri.localhost.evil.com/"));
        assert!(!is_trusted_origin("https://example.com/"));
        assert!(!is_trusted_origin(""));
    }

    #[test]
    fn defaults_answer_clipboard_and_sysex_and_leave_the_rest_to_webview2() {
        let _g = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        policies().lock_safe().clear();
        let dex = "http://tauri.localhost/";
        assert_eq!(decide("clipboardRead", dex), Some("allow"));
        assert_eq!(decide("midiSysex", dex), Some("deny"));
        assert_eq!(decide("camera", dex), None);
        // Other origins are never answered, whatever the policy.
        assert_eq!(decide("clipboardRead", "https://example.com/"), None);
    }

    #[test]
    fn stored_choice_overrides_the_default() {
        let _g = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        policies().lock_safe().insert("clipboardRead".into(), json!("deny"));
        assert_eq!(decide("clipboardRead", "http://tauri.localhost/"), Some("deny"));
        policies().lock_safe().insert("clipboardRead".into(), json!("ask"));
        assert_eq!(decide("clipboardRead", "http://tauri.localhost/"), None);
        policies().lock_safe().clear();
    }

    #[test]
    fn list_has_every_kind_with_a_valid_policy() {
        let _g = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let Value::Array(rows) = list() else { panic!("not an array") };
        assert_eq!(rows.len(), KINDS.len());
        for r in rows {
            assert!(valid_policy(r["policy"].as_str().unwrap()));
        }
    }
}
