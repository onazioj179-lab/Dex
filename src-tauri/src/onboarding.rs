// =============================================================================
// DEX Platform — Onboarding integrity (`onboarding:*`)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! The onboarding state lives here, in Rust-managed storage
//! (`<data dir>/onboarding.json`), not in a renderer flag.
//!
//! Required decision (the only one): acknowledging the current Terms of Service
//! and Privacy Notice. The License Agreement is accepted in the installer.
//! Everything else in setup (look, apps, UKI, notifications) is an optional
//! preference and is never required.
//!
//! Protected functionality (features that send data off this PC or run commands
//! for UKI) is refused by the IPC dispatcher until the required decision is on
//! record for the CURRENT document versions. A new Terms or Privacy version puts
//! existing profiles into "requires review". Declining leaves DEX usable
//! locally (limited mode); quitting is the other path.
//!
//! The file is validated on every load: unknown states, wrong types or versions
//! from the future are treated as "not started", never as "completed".

use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::paths::DexPaths;
use crate::util::LockSafe;

/// Bump when docs/TERMS.md changes materially.
pub const TERMS_VERSION: u32 = 2;
/// Bump when docs/PRIVACY.md changes materially.
pub const PRIVACY_VERSION: u32 = 1;
/// Bump when the set of required steps changes.
pub const FLOW_VERSION: u32 = 1;

/// Channels that need the required decision on record.
pub const PROTECTED_PREFIXES: &[&str] = &[
    "ukiterm:",
    "dtp:sendFiles", "dtp:startServer", "dtp:startDiscovery",
    "cloudsync:enable", "cloudsync:sync", "cloudsync:syncAll", "cloudsync:sync-all",
    "connectors:add", "connectors:addWithDialog",
];

#[derive(Clone, Debug, PartialEq)]
pub struct State {
    pub flow_version: u32,
    pub terms_version: u32,
    pub privacy_version: u32,
    pub accepted_at: Option<u64>,
    pub declined: bool,
    pub preferences_done: bool,
}

impl State {
    fn empty() -> Self {
        State { flow_version: 0, terms_version: 0, privacy_version: 0, accepted_at: None, declined: false, preferences_done: false }
    }

    /// Required decision on record for the current documents.
    pub fn required_done(&self) -> bool {
        self.accepted_at.is_some() && self.terms_version == TERMS_VERSION && self.privacy_version == PRIVACY_VERSION && !self.declined
    }

    /// not-started | in-progress | awaiting-required-decision | requires-review | declined | completed
    pub fn status(&self) -> &'static str {
        if self.declined { return "declined"; }
        if self.accepted_at.is_some() && !self.required_done() { return "requires-review"; }
        if self.required_done() && self.preferences_done && self.flow_version >= FLOW_VERSION { return "completed"; }
        if self.required_done() { return "in-progress"; }
        if self.preferences_done { return "awaiting-required-decision"; }
        if self.flow_version == 0 { "not-started" } else { "in-progress" }
    }

    fn to_json(&self) -> Value {
        json!({
            "flowVersion": self.flow_version, "termsVersion": self.terms_version, "privacyVersion": self.privacy_version,
            "acceptedAt": self.accepted_at, "declined": self.declined, "preferencesDone": self.preferences_done,
        })
    }

    /// Strict parse. Anything malformed or claiming a version newer than this
    /// build knows is rejected (treated as not started), never trusted.
    pub fn from_json(v: &Value) -> Option<Self> {
        let o = v.as_object()?;
        let u = |k: &str| -> Option<u32> { o.get(k)?.as_u64().filter(|n| *n <= 1_000).map(|n| n as u32) };
        let s = State {
            flow_version: u("flowVersion")?,
            terms_version: u("termsVersion")?,
            privacy_version: u("privacyVersion")?,
            accepted_at: match o.get("acceptedAt")? { Value::Null => None, x => Some(x.as_u64()?) },
            declined: o.get("declined")?.as_bool()?,
            preferences_done: o.get("preferencesDone")?.as_bool()?,
        };
        if s.flow_version > FLOW_VERSION || s.terms_version > TERMS_VERSION || s.privacy_version > PRIVACY_VERSION { return None; }
        if s.accepted_at.is_some() && (s.terms_version == 0 || s.privacy_version == 0) { return None; }
        Some(s)
    }
}

fn cache() -> &'static Mutex<Option<State>> {
    static C: OnceLock<Mutex<Option<State>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None))
}

fn file(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.dex_data_dir().ok().map(|d| d.join("onboarding.json"))
}

fn load(app: &tauri::AppHandle) -> State {
    let mut c = cache().lock_safe();
    if let Some(s) = c.as_ref() { return s.clone(); }
    let s = file(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| State::from_json(&v))
        .unwrap_or_else(State::empty);
    *c = Some(s.clone());
    s
}

fn save(app: &tauri::AppHandle, s: &State) -> Result<(), String> {
    let p = file(app).ok_or("no data folder")?;
    if let Some(dir) = p.parent() { let _ = std::fs::create_dir_all(dir); }
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&s.to_json()).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    *cache().lock_safe() = Some(s.clone());
    Ok(())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Used by the dispatcher: may this channel run now?
pub fn allows(app: &tauri::AppHandle, channel: &str) -> bool {
    if !PROTECTED_PREFIXES.iter().any(|p| channel == *p || (p.ends_with(':') && channel.starts_with(p))) { return true; }
    load(app).required_done()
}

fn view(s: &State) -> Value {
    json!({
        "ok": true, "status": s.status(), "requiredDone": s.required_done(),
        "current": { "terms": TERMS_VERSION, "privacy": PRIVACY_VERSION, "flow": FLOW_VERSION },
        "state": s.to_json(),
        "protected": PROTECTED_PREFIXES,
    })
}

/// Apply one request to a state (pure; unit-tested).
pub fn apply(mut s: State, channel: &str, args: &Value, now: u64) -> Result<State, String> {
    match channel {
        // The renderer must echo the versions it showed. A stale page cannot
        // accept documents it never displayed.
        "onboarding:accept" => {
            let t = args.get(0).and_then(|v| v.get("terms")).and_then(|v| v.as_u64());
            let p = args.get(0).and_then(|v| v.get("privacy")).and_then(|v| v.as_u64());
            if t != Some(TERMS_VERSION as u64) || p != Some(PRIVACY_VERSION as u64) {
                return Err("the documents changed; review the current versions".into());
            }
            s.terms_version = TERMS_VERSION;
            s.privacy_version = PRIVACY_VERSION;
            s.accepted_at = Some(now);
            s.declined = false;
            s.flow_version = s.flow_version.max(1);
            Ok(s)
        }
        "onboarding:decline" => {
            s.declined = true;
            s.accepted_at = None;
            s.flow_version = s.flow_version.max(1);
            Ok(s)
        }
        "onboarding:preferencesDone" => {
            s.preferences_done = true;
            s.flow_version = s.flow_version.max(1);
            Ok(s)
        }
        "onboarding:complete" => {
            if !s.required_done() { return Err("the required decision is not on record".into()); }
            s.preferences_done = true;
            s.flow_version = FLOW_VERSION;
            Ok(s)
        }
        _ => Err("unknown onboarding request".into()),
    }
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    if channel == "onboarding:status" { return view(&load(app)); }
    if channel == "onboarding:quit" { app.exit(0); return json!({ "ok": true }); }
    match apply(load(app), channel, args, now_ms()) {
        Ok(s) => match save(app, &s) { Ok(()) => view(&s), Err(e) => json!({ "ok": false, "error": format!("couldn't save: {e}") }) },
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn accepted() -> State {
        apply(State::empty(), "onboarding:accept", &json!([{ "terms": TERMS_VERSION, "privacy": PRIVACY_VERSION }]), 5).unwrap()
    }

    #[test]
    fn fresh_profile_is_not_started_and_blocks_protected() {
        let s = State::empty();
        assert_eq!(s.status(), "not-started");
        assert!(!s.required_done());
    }

    #[test]
    fn accept_requires_the_current_versions() {
        assert!(apply(State::empty(), "onboarding:accept", &json!([{ "terms": 0, "privacy": PRIVACY_VERSION }]), 1).is_err());
        assert!(apply(State::empty(), "onboarding:accept", &json!([]), 1).is_err());
        assert!(accepted().required_done());
    }

    #[test]
    fn complete_is_refused_without_the_required_decision() {
        let prefs = apply(State::empty(), "onboarding:preferencesDone", &json!([]), 1).unwrap();
        assert_eq!(prefs.status(), "awaiting-required-decision");
        assert!(apply(prefs, "onboarding:complete", &json!([]), 1).is_err());
        let done = apply(accepted(), "onboarding:complete", &json!([]), 1).unwrap();
        assert_eq!(done.status(), "completed");
    }

    #[test]
    fn decline_is_a_limited_mode_not_a_completion() {
        let d = apply(accepted(), "onboarding:decline", &json!([]), 1).unwrap();
        assert_eq!(d.status(), "declined");
        assert!(!d.required_done());
    }

    #[test]
    fn tampered_or_future_files_are_not_trusted() {
        // Claims completion but never accepted any document.
        assert!(State::from_json(&json!({ "flowVersion": 1, "termsVersion": 0, "privacyVersion": 0, "acceptedAt": 9, "declined": false, "preferencesDone": true })).is_none());
        // Versions from the future.
        assert!(State::from_json(&json!({ "flowVersion": 99, "termsVersion": 1, "privacyVersion": 1, "acceptedAt": 9, "declined": false, "preferencesDone": true })).is_none());
        // Wrong types / missing fields.
        assert!(State::from_json(&json!({ "flowVersion": "1" })).is_none());
        assert!(State::from_json(&json!("completed")).is_none());
        // A valid file round-trips.
        let s = accepted();
        assert_eq!(State::from_json(&s.to_json()), Some(s));
    }

    #[test]
    fn older_document_versions_require_review() {
        // Accepted an older Privacy Notice (simulated: version 0 < current).
        let mut s = accepted();
        s.privacy_version = 0;
        assert_eq!(s.status(), "requires-review");
        assert!(!s.required_done());
    }
}
