// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! System-wide shortcuts: keys that reach DEX from any app in Windows.
//!
//! `RegisterHotKey` on a dedicated thread with its own message loop. A press
//! arrives as `WM_HOTKEY`; DEX comes to the front (receiving the hotkey gives
//! this process the foreground right) and the renderer gets
//! `global-hotkey:pressed { action }` to open UKI, search, Notes, and so on.
//! `show-dex` is handled here: it shows DEX, or minimizes it when DEX is
//! already in front.
//!
//! The bindings live in `<data>/dex-global-hotkeys.json`. A key another app
//! already holds can't be registered; that is reported per binding
//! (`registered: false` + `error`) rather than hidden.
//!
//! Channels:
//!   global-hotkeys:list  ()                               -> { enabled, bindings: [...] }
//!   global-hotkeys:set   ({ action, accelerator?, enabled? }) -> same as list | { error }
//!   global-hotkeys:setEnabled ({ enabled })               -> same as list
//!   global-hotkeys:reset ()                               -> same as list

use crate::paths::DexPaths;
use crate::util::LockSafe;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const STORE_FILE: &str = "dex-global-hotkeys.json";

/// (action, label, default accelerator). Defaults avoid DEX's own in-app Ctrl+Alt keys
/// (arrows, digits, Z, S, [ ] `), because a registered key is taken from every app,
/// DEX included.
pub const ACTIONS: &[(&str, &str, &str)] = &[
    ("show-dex", "Show or hide DEX", "Ctrl+Alt+D"),
    ("ask-uki", "Ask UKI", "Ctrl+Alt+U"),
    ("search", "Search DEX", "Ctrl+Alt+Space"),
    ("clipboard", "Clipboard history", "Ctrl+Alt+V"),
    ("new-note", "New note", "Ctrl+Alt+N"),
    ("terminal", "Open Terminal", "Ctrl+Alt+T"),
];

#[derive(Clone, Debug, PartialEq)]
pub struct Binding {
    pub action: String,
    pub accelerator: String,
    pub enabled: bool,
}

#[derive(Default)]
struct State {
    enabled: bool,
    bindings: Vec<Binding>,
    /// action -> None (registered) | Some(error)
    status: Vec<(String, Option<String>)>,
    thread_id: u32,
}

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(State::default()))
}

// --- Accelerators ------------------------------------------------------------

pub const MOD_ALT: u32 = 0x1;
pub const MOD_CONTROL: u32 = 0x2;
pub const MOD_SHIFT: u32 = 0x4;
pub const MOD_WIN: u32 = 0x8;

/// Parse "Ctrl+Alt+K" into (modifiers, virtual key). At least one of Ctrl/Alt/Win is
/// required: a system-wide Shift+K or plain K would steal typing from every app.
pub fn parse_accelerator(s: &str) -> Result<(u32, u32), String> {
    let mut mods = 0u32;
    let mut key: Option<u32> = None;
    for raw in s.split('+').map(|p| p.trim()).filter(|p| !p.is_empty()) {
        match raw.to_ascii_lowercase().as_str() {
            "ctrl" | "control" | "commandorcontrol" | "cmdorctrl" => mods |= MOD_CONTROL,
            "alt" | "option" => mods |= MOD_ALT,
            "shift" => mods |= MOD_SHIFT,
            "win" | "super" | "meta" | "cmd" => mods |= MOD_WIN,
            other => {
                if key.is_some() { return Err(format!("{s}: only one key besides the modifiers")); }
                key = Some(vk_for(other).ok_or_else(|| format!("{s}: unknown key '{raw}'"))?);
            }
        }
    }
    let vk = key.ok_or_else(|| format!("{s}: no key"))?;
    if mods & (MOD_CONTROL | MOD_ALT | MOD_WIN) == 0 {
        return Err("A system-wide shortcut needs Ctrl, Alt or Win.".into());
    }
    Ok((mods, vk))
}

fn vk_for(k: &str) -> Option<u32> {
    let b = k.as_bytes();
    if b.len() == 1 && b[0].is_ascii_alphanumeric() { return Some(b[0].to_ascii_uppercase() as u32); }
    if let Some(n) = k.strip_prefix('f').and_then(|n| n.parse::<u32>().ok()) {
        if (1..=24).contains(&n) { return Some(0x70 + n - 1); }
    }
    Some(match k {
        "space" => 0x20,
        "enter" | "return" => 0x0D,
        "tab" => 0x09,
        "backspace" => 0x08,
        "delete" | "del" => 0x2E,
        "insert" | "ins" => 0x2D,
        "home" => 0x24,
        "end" => 0x23,
        "pageup" => 0x21,
        "pagedown" => 0x22,
        "up" | "arrowup" => 0x26,
        "down" | "arrowdown" => 0x28,
        "left" | "arrowleft" => 0x25,
        "right" | "arrowright" => 0x27,
        "`" | "backquote" => 0xC0,
        "-" | "minus" => 0xBD,
        "=" | "equal" | "plus" => 0xBB,
        "," | "comma" => 0xBC,
        "." | "period" => 0xBE,
        "/" | "slash" => 0xBF,
        ";" | "semicolon" => 0xBA,
        "'" | "quote" => 0xDE,
        "[" | "bracketleft" => 0xDB,
        "]" | "bracketright" => 0xDD,
        "\\" | "backslash" => 0xDC,
        _ => return None,
    })
}

/// Canonical spelling ("ctrl+alt+k" -> "Ctrl+Alt+K") so duplicates compare equal.
pub fn normalize(s: &str) -> Result<String, String> {
    parse_accelerator(s)?;
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
    let has = |names: &[&str]| parts.iter().any(|p| names.contains(&p.to_ascii_lowercase().as_str()));
    let mut out: Vec<String> = Vec::new();
    if has(&["ctrl", "control", "commandorcontrol", "cmdorctrl"]) { out.push("Ctrl".into()); }
    if has(&["alt", "option"]) { out.push("Alt".into()); }
    if has(&["shift"]) { out.push("Shift".into()); }
    if has(&["win", "super", "meta", "cmd"]) { out.push("Win".into()); }
    let key = parts
        .iter()
        .find(|p| !["ctrl", "control", "commandorcontrol", "cmdorctrl", "alt", "option", "shift", "win", "super", "meta", "cmd"]
            .contains(&p.to_ascii_lowercase().as_str()))
        .copied()
        .unwrap_or("");
    let key = if key.len() == 1 { key.to_ascii_uppercase() } else {
        let mut c = key.chars();
        match c.next() { Some(f) => f.to_ascii_uppercase().to_string() + &c.as_str().to_ascii_lowercase(), None => String::new() }
    };
    out.push(key);
    Ok(out.join("+"))
}

// --- Store -------------------------------------------------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn defaults() -> Vec<Binding> {
    ACTIONS.iter().map(|(a, _, k)| Binding { action: (*a).into(), accelerator: (*k).into(), enabled: true }).collect()
}

/// Merge a stored file over the defaults (unknown actions dropped, new actions added).
pub fn merge_stored(v: &Value) -> (bool, Vec<Binding>) {
    let enabled = v.get("enabled").and_then(|e| e.as_bool()).unwrap_or(true);
    let mut out = defaults();
    if let Some(list) = v.get("bindings").and_then(|b| b.as_array()) {
        for item in list {
            let Some(action) = item.get("action").and_then(|a| a.as_str()) else { continue };
            if let Some(b) = out.iter_mut().find(|b| b.action == action) {
                if let Some(acc) = item.get("accelerator").and_then(|a| a.as_str()) {
                    if let Ok(n) = normalize(acc) { b.accelerator = n; }
                }
                if let Some(en) = item.get("enabled").and_then(|e| e.as_bool()) { b.enabled = en; }
            }
        }
    }
    (enabled, out)
}

fn load(app: &tauri::AppHandle) -> (bool, Vec<Binding>) {
    let v = std::fs::read_to_string(store_path(app)).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok()).unwrap_or(Value::Null);
    merge_stored(&v)
}

fn save(app: &tauri::AppHandle, enabled: bool, bindings: &[Binding]) {
    let body = json!({
        "enabled": enabled,
        "bindings": bindings.iter().map(|b| json!({ "action": b.action, "accelerator": b.accelerator, "enabled": b.enabled })).collect::<Vec<_>>(),
    });
    if let Ok(s) = serde_json::to_string_pretty(&body) { let _ = std::fs::write(store_path(app), s); }
}

fn snapshot() -> Value {
    let st = state().lock_safe();
    let bindings: Vec<Value> = st.bindings.iter().map(|b| {
        let label = ACTIONS.iter().find(|(a, _, _)| *a == b.action).map(|(_, l, _)| *l).unwrap_or("");
        let default = ACTIONS.iter().find(|(a, _, _)| *a == b.action).map(|(_, _, k)| *k).unwrap_or("");
        let status = st.status.iter().find(|(a, _)| *a == b.action).map(|(_, e)| e.clone());
        let registered = matches!(status, Some(None));
        let error = status.and_then(|e| e);
        json!({
            "action": b.action, "label": label, "accelerator": b.accelerator, "default": default,
            "enabled": b.enabled, "registered": registered, "error": error,
        })
    }).collect();
    json!({ "enabled": st.enabled, "supported": cfg!(windows), "bindings": bindings })
}

// --- Native thread -----------------------------------------------------------

#[cfg(windows)]
mod win {
    use super::*;
    use tauri::Manager;
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS};
    use windows::Win32::UI::WindowsAndMessaging::{GetMessageW, PostThreadMessageW, MSG, WM_APP, WM_HOTKEY};

    const WM_RELOAD: u32 = WM_APP + 0x41;
    const MOD_NOREPEAT: u32 = 0x4000;

    /// Ask the hotkey thread to re-register from the shared state.
    pub fn reload() {
        let tid = state().lock_safe().thread_id;
        if tid != 0 {
            unsafe { let _ = PostThreadMessageW(tid, WM_RELOAD, WPARAM(0), LPARAM(0)); }
        }
    }

    fn register_all(registered: &mut Vec<i32>) {
        for id in registered.drain(..) {
            unsafe { let _ = UnregisterHotKey(Some(HWND::default()), id); }
        }
        let mut st = state().lock_safe();
        let enabled = st.enabled;
        let bindings = st.bindings.clone();
        let mut status = Vec::new();
        for (i, b) in bindings.iter().enumerate() {
            if !enabled || !b.enabled { status.push((b.action.clone(), Some("Off".to_string()))); continue; }
            let id = 0x4000 + i as i32;
            match parse_accelerator(&b.accelerator) {
                Ok((mods, vk)) => {
                    let ok = unsafe { RegisterHotKey(Some(HWND::default()), id, HOT_KEY_MODIFIERS(mods | MOD_NOREPEAT), vk) };
                    if ok.is_ok() {
                        registered.push(id);
                        status.push((b.action.clone(), None));
                    } else {
                        status.push((b.action.clone(), Some(format!("{} is in use by another app.", b.accelerator))));
                    }
                }
                Err(e) => status.push((b.action.clone(), Some(e))),
            }
        }
        st.status = status;
    }

    fn on_press(app: &tauri::AppHandle, action: &str) {
        let Some(w) = app.get_webview_window("main") else { return };
        if action == "show-dex" {
            let front = w.is_focused().unwrap_or(false) && w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false);
            if front { let _ = w.minimize(); return; }
        }
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        if action != "show-dex" {
            crate::native_ops::emit_event(app, "global-hotkey:pressed", &json!({ "action": action }));
        }
    }

    pub fn start(app: tauri::AppHandle) {
        crate::util::spawn_named("global-hotkeys", move || {
            state().lock_safe().thread_id = unsafe { GetCurrentThreadId() };
            let mut registered: Vec<i32> = Vec::new();
            register_all(&mut registered);
            crate::native_ops::emit_event(&app, "global-hotkey:changed", &snapshot());
            let mut msg = MSG::default();
            loop {
                let r = unsafe { GetMessageW(&mut msg, None, 0, 0) };
                if r.0 <= 0 { break; }
                if msg.message == WM_HOTKEY {
                    let idx = (msg.wParam.0 as i32 - 0x4000) as usize;
                    let action = state().lock_safe().bindings.get(idx).map(|b| b.action.clone());
                    if let Some(a) = action { on_press(&app, &a); }
                } else if msg.message == WM_RELOAD {
                    register_all(&mut registered);
                    crate::native_ops::emit_event(&app, "global-hotkey:changed", &snapshot());
                }
            }
        });
    }
}

/// Load the bindings and start the hotkey thread (Windows). Called once from setup.
pub fn init(app: &tauri::AppHandle) {
    let (enabled, bindings) = load(app);
    {
        let mut st = state().lock_safe();
        st.enabled = enabled;
        st.bindings = bindings;
    }
    #[cfg(windows)]
    win::start(app.clone());
}

fn apply(app: &tauri::AppHandle, enabled: bool, bindings: Vec<Binding>) -> Value {
    save(app, enabled, &bindings);
    {
        let mut st = state().lock_safe();
        st.enabled = enabled;
        st.bindings = bindings;
    }
    #[cfg(windows)]
    {
        win::reload();
        // The thread re-registers asynchronously; give it a moment so the
        // answer carries the real registration result.
        std::thread::sleep(std::time::Duration::from_millis(60));
    }
    snapshot()
}

/// Validate a change against the current bindings (pure, for tests).
pub fn with_change(bindings: &[Binding], action: &str, accelerator: Option<&str>, enabled: Option<bool>) -> Result<Vec<Binding>, String> {
    let mut next = bindings.to_vec();
    let idx = next.iter().position(|b| b.action == action).ok_or_else(|| format!("Unknown shortcut '{action}'."))?;
    if let Some(acc) = accelerator {
        let n = normalize(acc)?;
        if let Some(other) = next.iter().find(|b| b.action != action && b.enabled && b.accelerator == n) {
            let label = ACTIONS.iter().find(|(a, _, _)| *a == other.action).map(|(_, l, _)| *l).unwrap_or(&other.action);
            return Err(format!("{n} is already used for {label}."));
        }
        next[idx].accelerator = n;
    }
    if let Some(e) = enabled { next[idx].enabled = e; }
    Ok(next)
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        "global-hotkeys:list" => snapshot(),
        "global-hotkeys:set" => {
            let action = a0.get("action").and_then(|v| v.as_str()).unwrap_or("");
            let acc = a0.get("accelerator").and_then(|v| v.as_str());
            let en = a0.get("enabled").and_then(|v| v.as_bool());
            let (enabled, cur) = { let st = state().lock_safe(); (st.enabled, st.bindings.clone()) };
            match with_change(&cur, action, acc, en) {
                Ok(next) => apply(app, enabled, next),
                Err(e) => json!({ "error": e }),
            }
        }
        "global-hotkeys:setEnabled" => {
            let en = a0.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            let cur = state().lock_safe().bindings.clone();
            apply(app, en, cur)
        }
        "global-hotkeys:reset" => apply(app, true, defaults()),
        _ => json!({ "error": format!("unknown channel {channel}") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_normalizes() {
        assert_eq!(parse_accelerator("Ctrl+Alt+D").unwrap(), (MOD_CONTROL | MOD_ALT, 'D' as u32));
        assert_eq!(parse_accelerator("ctrl+alt+space").unwrap(), (MOD_CONTROL | MOD_ALT, 0x20));
        assert_eq!(parse_accelerator("Win+Shift+F5").unwrap(), (MOD_WIN | MOD_SHIFT, 0x74));
        assert_eq!(normalize("alt+ctrl+k").unwrap(), "Ctrl+Alt+K");
        assert_eq!(normalize("CommandOrControl+Alt+SPACE").unwrap(), "Ctrl+Alt+Space");
    }

    #[test]
    fn refuses_keys_that_would_steal_typing() {
        assert!(parse_accelerator("K").is_err());
        assert!(parse_accelerator("Shift+K").is_err());
        assert!(parse_accelerator("Ctrl+Alt").is_err());
        assert!(parse_accelerator("Ctrl+K+J").is_err());
        assert!(parse_accelerator("Ctrl+Nope").is_err());
    }

    #[test]
    fn defaults_are_valid_and_unique() {
        let d = defaults();
        for b in &d { assert_eq!(normalize(&b.accelerator).unwrap(), b.accelerator); }
        let mut keys: Vec<_> = d.iter().map(|b| b.accelerator.clone()).collect();
        keys.sort();
        keys.dedup();
        assert_eq!(keys.len(), d.len());
    }

    #[test]
    fn change_rejects_duplicates_and_unknown_actions() {
        let d = defaults();
        assert!(with_change(&d, "ask-uki", Some("ctrl+alt+d"), None).unwrap_err().contains("Show or hide DEX"));
        assert!(with_change(&d, "nope", Some("Ctrl+Alt+J"), None).is_err());
        let n = with_change(&d, "ask-uki", Some("ctrl+shift+alt+j"), Some(false)).unwrap();
        let b = n.iter().find(|b| b.action == "ask-uki").unwrap();
        assert_eq!((b.accelerator.as_str(), b.enabled), ("Ctrl+Alt+Shift+J", false));
    }

    /// The real Win32 call: register a combo nobody uses, then release it.
    #[cfg(windows)]
    #[test]
    fn registers_with_windows() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS};
        let (mods, vk) = parse_accelerator("Ctrl+Alt+Shift+F24").unwrap();
        let ok = unsafe { RegisterHotKey(Some(HWND::default()), 0x7ff0, HOT_KEY_MODIFIERS(mods | 0x4000), vk) };
        assert!(ok.is_ok(), "RegisterHotKey failed: {ok:?}");
        assert!(unsafe { UnregisterHotKey(Some(HWND::default()), 0x7ff0) }.is_ok());
    }

    #[test]
    fn stored_file_merges_over_defaults() {
        let v = json!({ "enabled": false, "bindings": [
            { "action": "search", "accelerator": "ctrl+alt+f", "enabled": true },
            { "action": "gone", "accelerator": "Ctrl+Alt+G" },
            { "action": "terminal", "enabled": false },
        ]});
        let (en, b) = merge_stored(&v);
        assert!(!en);
        assert_eq!(b.len(), ACTIONS.len());
        assert_eq!(b.iter().find(|x| x.action == "search").unwrap().accelerator, "Ctrl+Alt+F");
        assert!(!b.iter().find(|x| x.action == "terminal").unwrap().enabled);
    }
}
