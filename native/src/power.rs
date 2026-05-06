// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Power Profile Management
// Replaces: dex_core.py PowerManager (powercfg, pmset, cpupower)
// ═══════════════════════════════════════════════════════════════════════════

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::process::Command;
use std::sync::Mutex;
use once_cell::sync::Lazy;

// Wake lock child process handle (macOS/Linux only)
#[allow(dead_code)]
static WAKE_LOCK_CHILD: Lazy<Mutex<Option<std::process::Child>>> =
    Lazy::new(|| Mutex::new(None));

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct PowerProfile {
    pub name: String,
    pub description: String,
    pub cpu_limit: u32,
}

#[napi(object)]
#[derive(Clone)]
pub struct PowerResult {
    pub success: bool,
    pub profile: String,
    pub changes: Vec<String>,
    pub error: Option<String>,
}

#[napi(object)]
#[derive(Clone)]
pub struct PowerStatus {
    pub profile: String,
    pub battery_percent: Option<f64>,
    pub battery_charging: Option<bool>,
    pub battery_time_left: Option<f64>,
}

// ─────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────

/// Get available power profiles.
#[napi]
pub fn get_power_profiles() -> Vec<PowerProfile> {
    vec![
        PowerProfile { name: "eco".into(), description: "Maximum battery life".into(), cpu_limit: 50 },
        PowerProfile { name: "balanced".into(), description: "Normal operation".into(), cpu_limit: 100 },
        PowerProfile { name: "boost".into(), description: "Maximum performance".into(), cpu_limit: 100 },
    ]
}

/// Set power profile using OS-native commands.
#[napi]
pub fn set_power_profile(profile: String) -> Result<PowerResult> {
    if !matches!(profile.as_str(), "eco" | "balanced" | "boost") {
        return Ok(PowerResult {
            success: false, profile, changes: vec![],
            error: Some("Invalid profile. Use: eco, balanced, boost".into()),
        });
    }

    let mut changes: Vec<String> = Vec::new();

    match set_profile_os(&profile, &mut changes) {
        Ok(()) => Ok(PowerResult { success: true, profile, changes, error: None }),
        Err(e) => Ok(PowerResult { success: false, profile, changes, error: Some(e) }),
    }
}

/// Get current power status.
#[napi]
pub fn get_power_status() -> Result<PowerStatus> {
    let (bp, bc, bt) = crate::system::battery_info();
    Ok(PowerStatus {
        profile: detect_profile(),
        battery_percent: bp,
        battery_charging: bc,
        battery_time_left: bt,
    })
}

// ─────────────────────────────────────────────────────────────────────────
// Platform — profile switching
// ─────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn set_profile_os(profile: &str, changes: &mut Vec<String>) -> std::result::Result<(), String> {
    let guid = match profile {
        "eco" => "a1841308-3541-4fab-bc81-f71556f20b4a",
        "balanced" => "381b4222-f694-41f0-9685-ff5bb260df2e",
        "boost" => "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
        _ => return Err("Invalid profile".into()),
    };
    let out = Command::new("powercfg").args(["/setactive", guid]).output()
        .map_err(|e| format!("powercfg failed: {}", e))?;
    if out.status.success() {
        changes.push(format!("Windows power plan set to {}", profile));
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(target_os = "macos")]
fn set_profile_os(profile: &str, changes: &mut Vec<String>) -> std::result::Result<(), String> {
    let lp = if profile == "eco" { "1" } else { "0" };
    let out = Command::new("pmset").args(["-a", "lowpowermode", lp]).output()
        .map_err(|e| format!("pmset failed: {}", e))?;
    if out.status.success() {
        changes.push(if profile == "eco" { "Low Power Mode enabled".into() } else { "Low Power Mode disabled".into() });
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(target_os = "linux")]
fn set_profile_os(profile: &str, changes: &mut Vec<String>) -> std::result::Result<(), String> {
    let gov = match profile {
        "eco" => "powersave", "balanced" => "schedutil", "boost" => "performance",
        _ => return Err("Invalid profile".into()),
    };
    let out = Command::new("cpupower").args(["frequency-set", "-g", gov]).output()
        .map_err(|e| format!("cpupower failed: {}", e))?;
    if out.status.success() {
        changes.push(format!("CPU governor set to {}", gov));
        Ok(())
    } else {
        Err(format!("{} (ensure cpupower is installed and run with sudo)", String::from_utf8_lossy(&out.stderr).trim()))
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Platform — active profile detection
// ─────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn detect_profile() -> String {
    Command::new("powercfg").args(["/getactivescheme"]).output().ok()
        .map(|o| {
            let t = String::from_utf8_lossy(&o.stdout).to_lowercase();
            if t.contains("a1841308") || t.contains("power saver") { "eco" }
            else if t.contains("8c5e7fda") || t.contains("high performance") { "boost" }
            else { "balanced" }
        })
        .unwrap_or("balanced")
        .to_string()
}

#[cfg(target_os = "macos")]
fn detect_profile() -> String {
    Command::new("pmset").args(["-g"]).output().ok()
        .map(|o| {
            if String::from_utf8_lossy(&o.stdout).contains("lowpowermode          1") { "eco" } else { "balanced" }
        })
        .unwrap_or("balanced")
        .to_string()
}

#[cfg(target_os = "linux")]
fn detect_profile() -> String {
    std::fs::read_to_string("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor")
        .ok()
        .map(|s| match s.trim() {
            "powersave" => "eco", "performance" => "boost", _ => "balanced",
        })
        .unwrap_or("balanced")
        .to_string()
}

// ─────────────────────────────────────────────────────────────────────────
// Wake Lock — Prevent system sleep during long operations
// ─────────────────────────────────────────────────────────────────────────

/// Prevent the system from sleeping. Call release_wake_lock when done.
#[napi]
pub fn acquire_wake_lock(reason: String) -> Result<PowerResult> {
    let mut changes = Vec::new();

    #[cfg(target_os = "windows")]
    {
        match Command::new("powershell")
            .args(["-Command", "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class SleepPrev { [DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f); }'; [SleepPrev]::SetThreadExecutionState(0x80000003)"])
            .output()
        {
            Ok(_) => changes.push(format!("Wake lock acquired: {}", reason)),
            Err(e) => return Ok(PowerResult {
                success: false, profile: "wake-lock".into(), changes,
                error: Some(format!("Failed: {}", e)),
            }),
        }
    }

    #[cfg(target_os = "macos")]
    {
        match Command::new("caffeinate")
            .args(["-dis", "-w", &std::process::id().to_string()])
            .spawn()
        {
            Ok(child) => {
                if let Ok(mut guard) = WAKE_LOCK_CHILD.lock() {
                    *guard = Some(child);
                }
                changes.push(format!("caffeinate started: {}", reason));
            }
            Err(e) => return Ok(PowerResult {
                success: false, profile: "wake-lock".into(), changes,
                error: Some(format!("caffeinate failed: {}", e)),
            }),
        }
    }

    #[cfg(target_os = "linux")]
    {
        match Command::new("systemd-inhibit")
            .args(["--what=sleep:idle", &format!("--why={}", reason), "sleep", "infinity"])
            .spawn()
        {
            Ok(child) => {
                if let Ok(mut guard) = WAKE_LOCK_CHILD.lock() {
                    *guard = Some(child);
                }
                changes.push(format!("systemd-inhibit started: {}", reason));
            }
            Err(e) => return Ok(PowerResult {
                success: false, profile: "wake-lock".into(), changes,
                error: Some(format!("systemd-inhibit failed: {}", e)),
            }),
        }
    }

    Ok(PowerResult { success: true, profile: "wake-lock".into(), changes, error: None })
}

/// Release wake lock (allow system to sleep again).
#[napi]
pub fn release_wake_lock() -> Result<PowerResult> {
    let mut changes = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("powershell")
            .args(["-Command", "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class SleepRel { [DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f); }'; [SleepRel]::SetThreadExecutionState(0x80000000)"])
            .output();
        changes.push("Wake lock released".into());
    }

    #[cfg(target_os = "macos")]
    {
        // Kill stored child first, fall back to pkill
        if let Ok(mut guard) = WAKE_LOCK_CHILD.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
        let _ = Command::new("pkill").args(["-f", "caffeinate"]).output();
        changes.push("caffeinate stopped".into());
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(mut guard) = WAKE_LOCK_CHILD.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
        let _ = Command::new("pkill").args(["-f", "systemd-inhibit"]).output();
        changes.push("systemd-inhibit stopped".into());
    }

    Ok(PowerResult { success: true, profile: "wake-lock-released".into(), changes, error: None })
}
