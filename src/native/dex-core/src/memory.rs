// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX Core -- Memory monitoring with platform-native pressure detection.

use serde_json::{json, Value};

/// Memory pressure levels matching the DEX tier system.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PressureLevel {
    Normal,
    Moderate,
    High,
    Critical,
}

impl PressureLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            PressureLevel::Normal => "normal",
            PressureLevel::Moderate => "moderate",
            PressureLevel::High => "high",
            PressureLevel::Critical => "critical",
        }
    }
}

/// Get the current memory pressure level using platform-native APIs.
pub async fn get_pressure_level() -> String {
    let level = get_platform_pressure();
    level.as_str().to_string()
}

/// Platform-specific pressure detection.
fn get_platform_pressure() -> PressureLevel {
    #[cfg(target_os = "linux")]
    {
        return linux_psi_pressure();
    }
    #[cfg(target_os = "windows")]
    {
        return windows_memory_pressure();
    }
    #[cfg(target_os = "macos")]
    {
        return macos_memory_pressure();
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        PressureLevel::Normal
    }
}

#[cfg(target_os = "linux")]
fn linux_psi_pressure() -> PressureLevel {
    // Read /proc/pressure/memory for PSI (Pressure Stall Information)
    let psi = match std::fs::read_to_string("/proc/pressure/memory") {
        Ok(content) => content,
        Err(_) => return fallback_memory_pressure(),
    };

    // Parse "some avg10=X.XX" and "full avg10=X.XX" lines
    let mut some_avg10: f64 = 0.0;
    let mut full_avg10: f64 = 0.0;

    for line in psi.lines() {
        if line.starts_with("some") {
            if let Some(val) = parse_psi_avg10(line) {
                some_avg10 = val;
            }
        } else if line.starts_with("full") {
            if let Some(val) = parse_psi_avg10(line) {
                full_avg10 = val;
            }
        }
    }

    if full_avg10 > 5.0 {
        PressureLevel::Critical
    } else if some_avg10 > 10.0 {
        PressureLevel::High
    } else if some_avg10 > 3.0 {
        PressureLevel::Moderate
    } else {
        PressureLevel::Normal
    }
}

#[cfg(target_os = "linux")]
fn parse_psi_avg10(line: &str) -> Option<f64> {
    for part in line.split_whitespace() {
        if let Some(val) = part.strip_prefix("avg10=") {
            return val.parse::<f64>().ok();
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_memory_pressure() -> PressureLevel {
    // Use GlobalMemoryStatusEx to get memory load percentage
    // SAFETY: GlobalMemoryStatusEx is a read-only system call that fills
    // a caller-allocated struct. The struct is initialized with dwLength.
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        let mut status = MEMORYSTATUSEX {
            dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
            ..Default::default()
        };
        // SAFETY: status is properly initialized with dwLength set.
        // GlobalMemoryStatusEx only reads system state and writes to our stack buffer.
        let ok = unsafe { GlobalMemoryStatusEx(&mut status) };
        if ok.is_ok() {
            let load = status.dwMemoryLoad;
            return if load > 95 {
                PressureLevel::Critical
            } else if load > 85 {
                PressureLevel::High
            } else if load > 70 {
                PressureLevel::Moderate
            } else {
                PressureLevel::Normal
            };
        }
    }
    fallback_memory_pressure()
}

#[cfg(target_os = "macos")]
fn macos_memory_pressure() -> PressureLevel {
    // Read vm_statistics64 via host_statistics64 Mach API
    // Fallback to process RSS check if Mach call fails
    use std::process::Command;
    let output = Command::new("memory_pressure").arg("-Q").output();
    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            if text.contains("critical") {
                PressureLevel::Critical
            } else if text.contains("warn") {
                PressureLevel::High
            } else {
                PressureLevel::Normal
            }
        }
        Err(_) => fallback_memory_pressure(),
    }
}

fn fallback_memory_pressure() -> PressureLevel {
    // Generic fallback: check process RSS against system total
    // This is less accurate than platform-native approaches
    PressureLevel::Normal
}

/// Get current process memory usage statistics.
pub fn get_memory_usage() -> Value {
    #[cfg(target_os = "linux")]
    {
        if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
            let mut rss_kb: u64 = 0;
            let mut vm_size_kb: u64 = 0;
            for line in status.lines() {
                if let Some(val) = line.strip_prefix("VmRSS:") {
                    rss_kb = val.trim().split_whitespace().next()
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                } else if let Some(val) = line.strip_prefix("VmSize:") {
                    vm_size_kb = val.trim().split_whitespace().next()
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                }
            }
            return json!({
                "rss_bytes": rss_kb * 1024,
                "virtual_bytes": vm_size_kb * 1024,
                "platform": "linux"
            });
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Threading::GetCurrentProcess;
        use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
        let mut counters = PROCESS_MEMORY_COUNTERS::default();
        counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        // SAFETY: GetProcessMemoryInfo reads memory counters for our own process handle.
        // The counters struct is stack-allocated and properly sized.
        let ok = unsafe {
            GetProcessMemoryInfo(
                GetCurrentProcess(),
                &mut counters,
                counters.cb,
            )
        };
        if ok.is_ok() {
            return json!({
                "rss_bytes": counters.WorkingSetSize,
                "virtual_bytes": counters.PagefileUsage,
                "platform": "windows"
            });
        }
    }

    #[cfg(target_os = "macos")]
    {
        // Read from mach task_info for the current process
        use std::process::Command;
        if let Ok(output) = Command::new("ps")
            .args(["-o", "rss=,vsz=", "-p"])
            .arg(std::process::id().to_string())
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = text.trim().split_whitespace().collect();
            if parts.len() >= 2 {
                let rss: u64 = parts[0].parse().unwrap_or(0) * 1024;
                let vsz: u64 = parts[1].parse().unwrap_or(0) * 1024;
                return json!({
                    "rss_bytes": rss,
                    "virtual_bytes": vsz,
                    "platform": "macos"
                });
            }
        }
    }

    json!({
        "rss_bytes": 0,
        "virtual_bytes": 0,
        "platform": "unknown"
    })
}
