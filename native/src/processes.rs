// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Process Management
// Replaces: psutil.process_iter(), ps-list, systeminformation.processes()
// ═══════════════════════════════════════════════════════════════════════════

use napi::bindgen_prelude::*;
use napi_derive::napi;
use sysinfo::{Pid, ProcessStatus};
use std::collections::HashSet;
use std::sync::OnceLock;

// ─────────────────────────────────────────────────────────────────────────
// Process categorization
// ─────────────────────────────────────────────────────────────────────────

static SYS_PROCS: OnceLock<HashSet<&'static str>> = OnceLock::new();
static CLOSE_APPS: OnceLock<Vec<&'static str>> = OnceLock::new();

/// Known threat/suspicious process name fragments.
static THREAT_NAMES: &[&str] = &[
    "xmrig", "coinhive", "nicehash", "cryptominer", "monero",
    "keylogger", "spyware", "adware", "trojan", "rootkit",
    "backdoor", "stealer", "ransomware", "botnet", "rat.exe",
];

fn sys_procs() -> &'static HashSet<&'static str> {
    SYS_PROCS.get_or_init(|| {
        [
            // Windows
            "system", "registry", "smss.exe", "csrss.exe", "wininit.exe",
            "services.exe", "lsass.exe", "svchost.exe", "winlogon.exe",
            "dwm.exe", "explorer.exe", "taskhostw.exe", "runtimebroker.exe",
            "fontdrvhost.exe", "ctfmon.exe", "conhost.exe", "dllhost.exe",
            "audiodg.exe", "spoolsv.exe", "securityhealthservice.exe",
            // macOS
            "kernel_task", "launchd", "loginwindow", "windowserver",
            "dock", "finder", "systemuiserver", "coreaudiod", "bluetoothd",
            // Linux
            "init", "systemd", "kthreadd", "ksoftirqd", "kworker",
        ].into_iter().collect()
    })
}

fn close_apps() -> &'static Vec<&'static str> {
    CLOSE_APPS.get_or_init(|| {
        vec![
            "spotify", "discord", "slack", "teams", "zoom", "skype",
            "steam", "epicgameslauncher", "origin", "battle.net",
            "onedrive", "dropbox", "googledrivesync",
            "adobedesktopservice", "ccxprocess", "adobe cef helper",
            "telegram", "whatsapp", "signal",
        ]
    })
}

fn categorize(name_lower: &str, cpu: f64, mem_pct: f64) -> &'static str {
    if sys_procs().contains(name_lower) || name_lower.starts_with("svchost") {
        "system"
    } else if close_apps().iter().any(|a| name_lower.contains(a)) {
        "safe_to_close"
    } else if cpu == 0.0 && mem_pct < 0.5 {
        "background"
    } else {
        "user"
    }
}

/// Compute a threat score (0 = clean, higher = more suspicious).
/// Scoring:
///  +3 for matching a known threat name fragment
///  +1 for hidden process (starts with '.')
///  +1 for CPU > 80%
///  +1 for memory > 2 GB
fn threat_score(name_lower: &str, cpu: f64, mem_mb: f64) -> u32 {
    let mut score: u32 = 0;
    if THREAT_NAMES.iter().any(|t| name_lower.contains(t)) {
        score += 3;
    }
    if name_lower.starts_with('.') {
        score += 1;
    }
    if cpu > 80.0 {
        score += 1;
    }
    if mem_mb > 2048.0 {
        score += 1;
    }
    score
}

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f64,
    pub memory_percent: f64,
    pub memory_mb: f64,
    pub status: String,
    pub category: String,
    /// 0 = clean, 1-2 = suspicious, 3+ = probable threat
    pub threat_score: u32,
}

#[napi(object)]
#[derive(Clone)]
pub struct CloseProcessResult {
    pub success: bool,
    pub message: String,
}

// ─────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────

/// Get running processes sorted by resource usage.
#[napi]
pub fn get_processes(limit: Option<u32>) -> Result<Vec<ProcessInfo>> {
    let limit = limit.unwrap_or(30) as usize;
    let mut s = crate::system::shared_sys()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;

    s.refresh_processes();
    s.refresh_cpu();

    let total_mem = s.total_memory() as f64;
    let mut procs: Vec<ProcessInfo> = Vec::with_capacity(limit);

    for (pid, proc) in s.processes() {
        let name = proc.name().to_string();
        let lower = name.to_lowercase();
        let mem_bytes = proc.memory() as f64;
        let mem_mb = mem_bytes / (1024.0 * 1024.0);
        let mem_pct = if total_mem > 0.0 { (mem_bytes / total_mem) * 100.0 } else { 0.0 };
        let cpu = proc.cpu_usage() as f64;

        let status = match proc.status() {
            ProcessStatus::Run => "running",
            ProcessStatus::Sleep => "sleeping",
            ProcessStatus::Stop => "stopped",
            ProcessStatus::Zombie => "zombie",
            ProcessStatus::Idle => "idle",
            _ => "unknown",
        };

        procs.push(ProcessInfo {
            pid: pid.as_u32(),
            name,
            cpu_percent: (cpu * 100.0).round() / 100.0,
            memory_percent: (mem_pct * 100.0).round() / 100.0,
            memory_mb: (mem_mb * 10.0).round() / 10.0,
            status: status.to_string(),
            category: categorize(&lower, cpu, mem_pct).to_string(),
            threat_score: threat_score(&lower, cpu, mem_mb),
        });
    }

    // Sort by combined CPU + memory (descending)
    procs.sort_by(|a, b| {
        let sb = b.cpu_percent + b.memory_percent;
        let sa = a.cpu_percent + a.memory_percent;
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });

    procs.truncate(limit);
    Ok(procs)
}

/// Close a process by PID. Refuses system-critical processes.
#[napi]
pub fn close_process(pid: u32, force: Option<bool>) -> Result<CloseProcessResult> {
    let _force = force.unwrap_or(false);
    let mut s = crate::system::shared_sys()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;

    s.refresh_processes();

    let sysinfo_pid = Pid::from(pid as usize);

    match s.process(sysinfo_pid) {
        Some(process) => {
            let lower = process.name().to_lowercase();
            if sys_procs().contains(lower.as_str()) || lower.starts_with("svchost") {
                return Ok(CloseProcessResult {
                    success: false,
                    message: "Cannot close system-critical process".into(),
                });
            }

            let pname = process.name().to_string();
            // sysinfo's kill() sends SIGKILL (force) on Unix, TerminateProcess on Windows.
            // There's no cross-platform SIGTERM in sysinfo, so both paths use kill().
            process.kill();

            Ok(CloseProcessResult {
                success: true,
                message: format!("Closed {}", pname),
            })
        }
        None => Ok(CloseProcessResult {
            success: false,
            message: "Process not found".into(),
        }),
    }
}

/// Close process(es) by name. Returns count of terminated processes.
/// More AV-friendly than spawning taskkill.
#[napi]
pub fn close_process_by_name(process_name: String, force: Option<bool>) -> Result<CloseProcessResult> {
    let _force = force.unwrap_or(false);
    let target_lower = process_name.to_lowercase();
    
    let mut s = crate::system::shared_sys()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;

    s.refresh_processes();

    let mut closed_count = 0u32;
    let mut failed_count = 0u32;

    // Collect PIDs first to avoid borrowing issues
    let pids_to_kill: Vec<(Pid, String)> = s
        .processes()
        .iter()
        .filter(|(_, p)| {
            let lower = p.name().to_lowercase();
            lower == target_lower || lower.starts_with(&format!("{}.", target_lower))
        })
        .filter(|(_, p)| {
            let lower = p.name().to_lowercase();
            // Skip system-critical processes
            !sys_procs().contains(lower.as_str()) && !lower.starts_with("svchost")
        })
        .map(|(pid, p)| (*pid, p.name().to_string()))
        .collect();

    // Now kill them
    for (pid, _name) in pids_to_kill {
        if let Some(process) = s.process(pid) {
            process.kill();
            closed_count += 1;
        } else {
            failed_count += 1;
        }
    }

    if closed_count > 0 {
        Ok(CloseProcessResult {
            success: true,
            message: format!("Closed {} instance(s) of {}", closed_count, process_name),
        })
    } else if failed_count > 0 {
        Ok(CloseProcessResult {
            success: false,
            message: format!("Failed to close {} instance(s)", failed_count),
        })
    } else {
        Ok(CloseProcessResult {
            success: false,
            message: format!("No process found matching '{}'", process_name),
        })
    }
}

/// Free system memory — platform-specific cleanup.
#[napi]
pub fn free_memory() -> Result<CloseProcessResult> {
    #[allow(unused_mut, unused_assignments)]
    let mut ok = true;
    #[allow(unused_assignments)]
    let mut msg = String::from("Memory cleanup initiated");

    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("purge").output() {
            Ok(out) if out.status.success() => {}
            Ok(out) => { ok = false; msg = format!("purge failed: {}", String::from_utf8_lossy(&out.stderr).trim()); }
            Err(e) => { ok = false; msg = format!("purge error: {}", e); }
        }
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("sync").output();
        if let Err(e) = std::fs::write("/proc/sys/vm/drop_caches", "3") {
            ok = false;
            msg = format!("drop_caches failed (may need root): {}", e);
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Windows doesn't have a safe user-level memory purge command
        msg = "Memory cleanup not available on Windows".into();
    }

    Ok(CloseProcessResult { success: ok, message: msg })
}

/// Set process priority. Priority levels: "low", "below_normal", "normal", "above_normal", "high".
/// Only works on Windows. Returns success status.
#[napi]
pub fn set_process_priority(pid: f64, priority: String) -> Result<CloseProcessResult> {
    let _pid = pid as u32;
    let _priority = priority.to_lowercase();

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // Windows SetPriority WMI numeric values:
        // Idle=64, BelowNormal=16384, Normal=32, AboveNormal=32768, High=128, Realtime=256
        let priority_val = match _priority.as_str() {
            "low" | "idle" => "64",
            "below_normal" => "16384",
            "normal" => "32",
            "above_normal" => "32768",
            "high" => "128",
            _ => return Ok(CloseProcessResult {
                success: false,
                message: format!("Unknown priority: {}", _priority),
            }),
        };

        // Use PowerShell as wmic is deprecated; set via Get-Process and -Priority
        let ps_script = format!(
            "Get-WmiObject Win32_Process -Filter 'ProcessId={}' | ForEach-Object {{ $_.SetPriority({}) }}",
            _pid, priority_val
        );
        match Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output()
        {
            Ok(out) if out.status.success() => Ok(CloseProcessResult {
                success: true,
                message: format!("Set process {} to {} priority", _pid, _priority),
            }),
            Ok(out) => Ok(CloseProcessResult {
                success: false,
                message: format!("SetPriority failed: {}", String::from_utf8_lossy(&out.stderr).trim()),
            }),
            Err(e) => Ok(CloseProcessResult {
                success: false,
                message: format!("Failed: {}", e),
            }),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        let nice_val = match _priority.as_str() {
            "low" | "idle" => "19",
            "below_normal" => "10",
            "normal" => "0",
            "above_normal" => "-5",
            "high" => "-10",
            _ => return Ok(CloseProcessResult {
                success: false,
                message: format!("Unknown priority: {}", _priority),
            }),
        };
        match Command::new("renice")
            .args([nice_val, "-p", &_pid.to_string()])
            .output()
        {
            Ok(out) if out.status.success() => Ok(CloseProcessResult {
                success: true,
                message: format!("Set process {} to {} (nice {})", _pid, _priority, nice_val),
            }),
            Ok(out) => Ok(CloseProcessResult {
                success: false,
                message: format!("renice failed: {}", String::from_utf8_lossy(&out.stderr).trim()),
            }),
            Err(e) => Ok(CloseProcessResult {
                success: false,
                message: format!("renice error: {}", e),
            }),
        }
    }
}

/// Get process I/O statistics (read/write bytes) for a given PID.
#[napi(object)]
#[derive(Clone)]
pub struct ProcessIOStats {
    pub pid: f64,
    pub read_bytes: f64,
    pub write_bytes: f64,
}

#[napi]
pub fn get_process_io_stats(pid: f64) -> Result<ProcessIOStats> {
    let target_pid = Pid::from(pid as usize);
    let mut sys = sysinfo::System::new();
    sys.refresh_processes();

    if let Some(process) = sys.process(target_pid) {
        let disk = process.disk_usage();
        Ok(ProcessIOStats {
            pid,
            read_bytes: disk.total_read_bytes as f64,
            write_bytes: disk.total_written_bytes as f64,
        })
    } else {
        Ok(ProcessIOStats {
            pid,
            read_bytes: 0.0,
            write_bytes: 0.0,
        })
    }
}
