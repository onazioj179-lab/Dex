// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Secret store for AI provider API keys: `secrets:set|get|delete|list`.
//
// On Windows each value is protected with DPAPI (CryptProtectData, CurrentUser
// scope) by calling crypt32.dll directly -- no PowerShell round-trip, no new
// crates. The protected blobs live in <appData>/uki-secrets.json, so the file
// is useless to another Windows user or on another machine. Before this, keys
// sat in localStorage behind a reversible XOR.
//
// Scope: names must be `uki-provider:<id>` ([a-z0-9-], <= 40 chars). Values are
// capped at 8 KB. On other platforms the store reports unavailable and the
// renderer keeps its legacy fallback (documented, not hidden).
//

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;

const FILE: &str = "uki-secrets.json";
const MAX_VALUE: usize = 8 * 1024;

/// Scopes a secret may live under: AI provider keys, and the Browser's saved
/// logins and card numbers (which used to rely on an Electron-only IPC).
const SCOPES: &[&str] = &["uki-provider:", "browser-login:", "browser-card:"];

pub fn valid_name(name: &str) -> bool {
    let Some(id) = SCOPES.iter().find_map(|p| name.strip_prefix(p)) else { return false };
    !id.is_empty() && id.len() <= 40 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn store_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.dex_data_dir().ok().map(|d| d.join(FILE))
}

fn load(app: &tauri::AppHandle) -> BTreeMap<String, String> {
    store_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(app: &tauri::AppHandle, map: &BTreeMap<String, String>) -> bool {
    let Some(p) = store_path(app) else { return false };
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = p.with_extension("json.tmp");
    let Ok(body) = serde_json::to_string(map) else { return false };
    crate::write_atomic(&tmp, body).is_ok() && std::fs::rename(&tmp, &p).is_ok()
}

#[cfg(windows)]
mod dpapi {
    use std::ffi::c_void;

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            data_in: *const DataBlob,
            description: *const u16,
            entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
        fn CryptUnprotectData(
            data_in: *const DataBlob,
            description: *mut *mut u16,
            entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(mem: *mut c_void) -> *mut c_void;
    }

    // Fixed app entropy: a blob protected by another app for this user cannot
    // be unprotected here without it (defence in depth, not a secret).
    const ENTROPY: &[u8] = b"dex-uki-secrets-v1";

    fn run(input: &[u8], protect: bool) -> Option<Vec<u8>> {
        let inb = DataBlob { cb_data: input.len() as u32, pb_data: input.as_ptr() as *mut u8 };
        let ent = DataBlob { cb_data: ENTROPY.len() as u32, pb_data: ENTROPY.as_ptr() as *mut u8 };
        let mut out = DataBlob { cb_data: 0, pb_data: std::ptr::null_mut() };
        // SAFETY: all pointers are valid for the duration of the call; DPAPI
        // allocates `out.pb_data` with LocalAlloc, which we copy then free.
        let ok = unsafe {
            if protect {
                CryptProtectData(&inb, std::ptr::null(), &ent, std::ptr::null_mut(), std::ptr::null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            } else {
                CryptUnprotectData(&inb, std::ptr::null_mut(), &ent, std::ptr::null_mut(), std::ptr::null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            }
        };
        if ok == 0 || out.pb_data.is_null() {
            return None;
        }
        let bytes = unsafe { std::slice::from_raw_parts(out.pb_data, out.cb_data as usize).to_vec() };
        unsafe { LocalFree(out.pb_data as *mut c_void) };
        Some(bytes)
    }

    pub fn protect(plain: &[u8]) -> Option<Vec<u8>> { run(plain, true) }
    pub fn unprotect(blob: &[u8]) -> Option<Vec<u8>> { run(blob, false) }
}

#[cfg(windows)]
fn protect(plain: &str) -> Option<String> {
    use base64::Engine;
    dpapi::protect(plain.as_bytes()).map(|b| base64::engine::general_purpose::STANDARD.encode(b))
}

#[cfg(windows)]
fn unprotect(stored: &str) -> Option<String> {
    use base64::Engine;
    let blob = base64::engine::general_purpose::STANDARD.decode(stored).ok()?;
    String::from_utf8(dpapi::unprotect(&blob)?).ok()
}

#[cfg(not(windows))]
fn protect(_plain: &str) -> Option<String> { None }
#[cfg(not(windows))]
fn unprotect(_stored: &str) -> Option<String> { None }

pub fn available() -> bool {
    cfg!(windows)
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let name = args.get(0).and_then(|v| v.as_str()).unwrap_or_default().to_string();
    match channel {
        "secrets:status" => json!({ "available": available(), "backend": if available() { "dpapi" } else { "none" } }),
        "secrets:list" => {
            let names: Vec<String> = load(app).keys().cloned().collect();
            json!(names)
        }
        _ if !valid_name(&name) => json!({ "success": false, "error": "invalid secret name" }),
        "secrets:set" => {
            let value = args.get(1).and_then(|v| v.as_str()).unwrap_or_default();
            if value.is_empty() || value.len() > MAX_VALUE {
                return json!({ "success": false, "error": "empty or oversized value" });
            }
            let Some(blob) = protect(value) else {
                return json!({ "success": false, "error": "secure storage unavailable" });
            };
            let mut map = load(app);
            map.insert(name, blob);
            json!({ "success": save(app, &map) })
        }
        "secrets:get" => match load(app).get(&name).and_then(|b| unprotect(b)) {
            Some(v) => json!(v),
            None => Value::Null,
        },
        "secrets:delete" => {
            let mut map = load(app);
            let existed = map.remove(&name).is_some();
            json!({ "success": !existed || save(app, &map) })
        }
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_scoped() {
        assert!(valid_name("uki-provider:openai"));
        assert!(valid_name("uki-provider:open-router2"));
        assert!(!valid_name("openai"));
        assert!(!valid_name("uki-provider:"));
        assert!(!valid_name("uki-provider:../x"));
        assert!(!valid_name("uki-provider:OpenAI"));
        assert!(valid_name("browser-login:3f2a9c1e-7b4d-4c2a-9e1f-0a1b2c3d4e5f"));
        assert!(valid_name("browser-card:1793717339689"));
        assert!(!valid_name("browser-login:"));
        assert!(!valid_name("browser-login:../../x"));
        assert!(!valid_name("browser:abc"));
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_round_trip() {
        let blob = protect("sk-test-123").expect("protect");
        assert!(!blob.contains("sk-test"));
        assert_eq!(unprotect(&blob).as_deref(), Some("sk-test-123"));
        assert!(unprotect("bm90LWEtYmxvYg==").is_none());
    }
}
