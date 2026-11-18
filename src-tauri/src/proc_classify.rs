// =============================================================================
// DEX Platform — process categories + startup items for Task Manager
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Real categories, no guessing:
//!   dex         DEX itself and every process it started (parent chain to our pid)
//!   app         owns a visible, titled top-level window (what Windows calls an app)
//!   background  everything else
//! Startup items: the Run keys (current user, all users) with their enabled
//! state from StartupApproved, and both Startup folders. Read-only.

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::process::{Command, Stdio};

/// PIDs that own a visible top-level window with a title.
#[cfg(windows)]
pub fn windowed_pids() -> HashSet<u32> {
    use std::ffi::c_void;
    type Hwnd = *mut c_void;
    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(cb: unsafe extern "system" fn(Hwnd, isize) -> i32, lparam: isize) -> i32;
        fn IsWindowVisible(hwnd: Hwnd) -> i32;
        fn GetWindowTextLengthW(hwnd: Hwnd) -> i32;
        fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
        fn GetWindow(hwnd: Hwnd, cmd: u32) -> Hwnd;
    }
    const GW_OWNER: u32 = 4;
    unsafe extern "system" fn cb(hwnd: Hwnd, lparam: isize) -> i32 {
        // SAFETY: lparam is the &mut HashSet passed below, alive for the call.
        let set = &mut *(lparam as *mut HashSet<u32>);
        if IsWindowVisible(hwnd) != 0 && GetWindowTextLengthW(hwnd) > 0 && GetWindow(hwnd, GW_OWNER).is_null() {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid != 0 { set.insert(pid); }
        }
        1
    }
    let mut set: HashSet<u32> = HashSet::new();
    // SAFETY: the callback only touches `set`, which outlives EnumWindows.
    unsafe { EnumWindows(cb, &mut set as *mut HashSet<u32> as isize); }
    set
}

#[cfg(not(windows))]
pub fn windowed_pids() -> HashSet<u32> { HashSet::new() }

/// Category for each pid. `parents` maps pid -> parent pid.
pub fn categorize(pids: &[u32], parents: &HashMap<u32, u32>, windowed: &HashSet<u32>, self_pid: u32) -> HashMap<u32, &'static str> {
    let mut out = HashMap::new();
    for &pid in pids {
        let mut cur = pid;
        let mut dex = false;
        for _ in 0..32 {
            if cur == self_pid { dex = true; break; }
            match parents.get(&cur) { Some(&p) if p != cur && p != 0 => cur = p, _ => break }
        }
        out.insert(pid, if dex { "dex" } else if windowed.contains(&pid) { "app" } else { "background" });
    }
    out
}

/// Parse `reg query` output: "    Name    REG_TYPE    data" lines.
pub fn parse_reg(output: &str) -> Vec<(String, String, String)> {
    output
        .lines()
        .filter_map(|l| {
            let l = l.trim_end();
            if !l.starts_with("    ") { return None; }
            let t = l.trim_start();
            let i = t.find("    REG_")?;
            let name = t[..i].trim().to_string();
            let rest = t[i + 4..].trim_start();
            let j = rest.find(char::is_whitespace).unwrap_or(rest.len());
            let ty = rest[..j].to_string();
            let data = rest[j..].trim().to_string();
            Some((name, ty, data))
        })
        .collect()
}

fn reg_query(key: &str) -> String {
    let mut c = Command::new("reg");
    c.args(["query", key]).stdin(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    c.output().ok().map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default()
}

/// StartupApproved data: first byte 02/06 = enabled, 03/07 = disabled (as Windows writes it).
pub fn approved_state(hex: &str) -> Option<bool> {
    let b = u8::from_str_radix(hex.get(0..2)?, 16).ok()?;
    Some(b & 1 == 0)
}

pub fn startup_items() -> Value {
    let mut items: Vec<Value> = Vec::new();
    for (hive, label) in [("HKCU", "Run key (you)"), ("HKLM", "Run key (all users)")] {
        let run = reg_query(&format!(r"{hive}\Software\Microsoft\Windows\CurrentVersion\Run"));
        let approved: HashMap<String, Option<bool>> = parse_reg(&reg_query(&format!(r"{hive}\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run")))
            .into_iter().map(|(n, _, d)| (n.to_lowercase(), approved_state(&d))).collect();
        for (name, _ty, data) in parse_reg(&run) {
            let enabled = approved.get(&name.to_lowercase()).copied().flatten().unwrap_or(true);
            items.push(json!({ "name": name, "command": data, "location": label, "enabled": enabled }));
        }
    }
    let folders = [
        (std::env::var("APPDATA").ok().map(|a| format!(r"{a}\Microsoft\Windows\Start Menu\Programs\Startup")), "Startup folder (you)"),
        (std::env::var("ProgramData").ok().map(|a| format!(r"{a}\Microsoft\Windows\Start Menu\Programs\StartUp")), "Startup folder (all users)"),
    ];
    for (dir, label) in folders {
        let Some(dir) = dir else { continue };
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.eq_ignore_ascii_case("desktop.ini") { continue; }
            items.push(json!({ "name": name.trim_end_matches(".lnk"), "command": e.path().to_string_lossy(), "location": label, "enabled": true }));
        }
    }
    json!({ "success": true, "items": items })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn categories_follow_the_parent_chain_and_windows() {
        let parents: HashMap<u32, u32> = [(10, 1), (11, 10), (12, 11), (20, 1), (30, 1)].into_iter().collect();
        let windowed: HashSet<u32> = [20].into_iter().collect();
        let c = categorize(&[10, 11, 12, 20, 30], &parents, &windowed, 10);
        assert_eq!(c[&10], "dex");
        assert_eq!(c[&12], "dex"); // grandchild of DEX (a WebView2 renderer)
        assert_eq!(c[&20], "app");
        assert_eq!(c[&30], "background");
    }

    #[test]
    fn parent_loops_terminate() {
        let parents: HashMap<u32, u32> = [(5, 6), (6, 5)].into_iter().collect();
        let c = categorize(&[5], &parents, &HashSet::new(), 99);
        assert_eq!(c[&5], "background");
    }

    #[test]
    fn reg_output_is_parsed() {
        let out = "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    OneDrive    REG_SZ    \"C:\\Program Files\\OneDrive.exe\" /background\r\n    Tool Name    REG_EXPAND_SZ    %LOCALAPPDATA%\\tool.exe\r\n\r\n";
        let v = parse_reg(out);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].0, "OneDrive");
        assert_eq!(v[0].2, "\"C:\\Program Files\\OneDrive.exe\" /background");
        assert_eq!(v[1].0, "Tool Name");
        assert_eq!(v[1].1, "REG_EXPAND_SZ");
    }

    #[test]
    fn approved_bytes() {
        assert_eq!(approved_state("020000000000000000000000"), Some(true));
        assert_eq!(approved_state("03000000E1C9F6E2"), Some(false));
        assert_eq!(approved_state(""), None);
    }

    #[test]
    fn windows_listing_runs() {
        // Smoke: on a desktop session at least the console/IDE owns a window; never panics.
        let _ = windowed_pids();
    }
}

#[cfg(test)]
mod live_tests {
    /// Read-only look at this machine (prints, asserts shape only).
    #[test]
    fn startup_and_windows_on_this_pc() {
        let v = super::startup_items();
        let items = v["items"].as_array().cloned().unwrap_or_default();
        println!("startup items: {}", items.len());
        for i in items.iter().take(8) { println!("  {} | {} | enabled={}", i["name"], i["location"], i["enabled"]); }
        println!("windowed pids: {}", super::windowed_pids().len());
        assert_eq!(v["success"], true);
    }
}
