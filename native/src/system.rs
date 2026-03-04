// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — System Monitoring
// Replaces: psutil + systeminformation for CPU, memory, battery, disk, network
// ═══════════════════════════════════════════════════════════════════════════

use napi::bindgen_prelude::*;
use napi_derive::napi;
use sysinfo::{Disks, Networks, System};
use std::sync::{Mutex, OnceLock};

// ─────────────────────────────────────────────────────────────────────────
// Shared System instance (sysinfo needs reuse for accurate CPU deltas)
// ─────────────────────────────────────────────────────────────────────────

static SYS: OnceLock<Mutex<System>> = OnceLock::new();

pub(crate) fn shared_sys() -> &'static Mutex<System> {
    SYS.get_or_init(|| {
        let mut s = System::new_all();
        s.refresh_all();
        Mutex::new(s)
    })
}

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct SystemStats {
    pub cpu_percent: f64,
    pub cpu_count: u32,
    pub cpu_per_core: Vec<f64>,
    pub cpu_freq_mhz: u32,
    pub memory_total: f64,
    pub memory_used: f64,
    pub memory_percent: f64,
    pub memory_available: f64,
    pub swap_total: f64,
    pub swap_used: f64,
    pub battery_percent: Option<f64>,
    pub battery_charging: Option<bool>,
    pub battery_time_left: Option<f64>,
    pub uptime: f64,
    pub platform: String,
    pub os_version: String,
    pub hostname: String,
    pub kernel_version: String,
}

#[napi(object)]
#[derive(Clone)]
pub struct DiskInfo {
    pub mount: String,
    pub fs_type: String,
    pub total: f64,
    pub used: f64,
    pub available: f64,
    pub percent: f64,
    pub name: String,
}

#[napi(object)]
#[derive(Clone)]
pub struct NetworkInfo {
    pub name: String,
    pub rx_bytes: f64,
    pub tx_bytes: f64,
    pub total_rx: f64,
    pub total_tx: f64,
}

// ─────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────

/// Get comprehensive system statistics — single call replaces multiple
/// psutil/systeminformation calls.
#[napi]
pub fn get_system_stats() -> Result<SystemStats> {
    let mut s = shared_sys().lock().map_err(|e| Error::from_reason(e.to_string()))?;

    s.refresh_cpu();
    s.refresh_memory();

    let cpus = s.cpus();
    let cpu_count = cpus.len() as u32;
    let global = s.global_cpu_info();
    let cpu_percent = global.cpu_usage() as f64;
    let cpu_freq_mhz = global.frequency() as u32;
    let cpu_per_core: Vec<f64> = cpus.iter().map(|c| c.cpu_usage() as f64).collect();

    let mt = s.total_memory() as f64;
    let mu = s.used_memory() as f64;
    let ma = s.available_memory() as f64;
    let mp = if mt > 0.0 { (mu / mt) * 100.0 } else { 0.0 };

    let (bp, bc, bt) = battery_info();

    Ok(SystemStats {
        cpu_percent,
        cpu_count,
        cpu_per_core,
        cpu_freq_mhz,
        memory_total: mt,
        memory_used: mu,
        memory_percent: mp,
        memory_available: ma,
        swap_total: s.total_swap() as f64,
        swap_used: s.used_swap() as f64,
        battery_percent: bp,
        battery_charging: bc,
        battery_time_left: bt,
        uptime: System::uptime() as f64,
        platform: std::env::consts::OS.to_string(),
        os_version: System::long_os_version().unwrap_or_default(),
        hostname: System::host_name().unwrap_or_default(),
        kernel_version: System::kernel_version().unwrap_or_default(),
    })
}

/// Get disk usage for all mounted volumes.
#[napi]
pub fn get_disk_info() -> Result<Vec<DiskInfo>> {
    let disks = Disks::new_with_refreshed_list();
    Ok(disks
        .iter()
        .map(|d| {
            let t = d.total_space() as f64;
            let a = d.available_space() as f64;
            let u = t - a;
            DiskInfo {
                mount: d.mount_point().to_string_lossy().into_owned(),
                fs_type: d.file_system().to_string_lossy().into_owned(),
                total: t,
                used: u,
                available: a,
                percent: if t > 0.0 { (u / t) * 100.0 } else { 0.0 },
                name: d.name().to_string_lossy().into_owned(),
            }
        })
        .collect())
}

/// Get network interface statistics.
#[napi]
pub fn get_network_info() -> Result<Vec<NetworkInfo>> {
    let nets = Networks::new_with_refreshed_list();
    Ok(nets
        .iter()
        .map(|(name, data)| NetworkInfo {
            name: name.clone(),
            rx_bytes: data.received() as f64,
            tx_bytes: data.transmitted() as f64,
            total_rx: data.total_received() as f64,
            total_tx: data.total_transmitted() as f64,
        })
        .collect())
}

// ─────────────────────────────────────────────────────────────────────────
// Battery — platform-specific (public for power.rs)
// ─────────────────────────────────────────────────────────────────────────

pub(crate) fn battery_info() -> (Option<f64>, Option<bool>, Option<f64>) {
    #[cfg(target_os = "windows")]
    return battery_windows();
    #[cfg(target_os = "macos")]
    return battery_macos();
    #[cfg(target_os = "linux")]
    return battery_linux();
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return (None, None, None);
}

#[cfg(target_os = "windows")]
fn battery_windows() -> (Option<f64>, Option<bool>, Option<f64>) {
    use std::process::Command;
    let out = Command::new("wmic")
        .args(["path", "Win32_Battery", "get", "EstimatedChargeRemaining,BatteryStatus", "/format:csv"])
        .output();
    match out {
        Ok(o) => {
            let txt = String::from_utf8_lossy(&o.stdout);
            for line in txt.lines().skip(1) {
                let p: Vec<&str> = line.split(',').collect();
                if p.len() >= 3 {
                    let st: u32 = p[1].trim().parse().unwrap_or(0);
                    let pct: f64 = p[2].trim().parse().unwrap_or(0.0);
                    return (Some(pct), Some(matches!(st, 2 | 6..=9)), None);
                }
            }
            (None, None, None)
        }
        Err(_) => (None, None, None),
    }
}

#[cfg(target_os = "macos")]
fn battery_macos() -> (Option<f64>, Option<bool>, Option<f64>) {
    use std::process::Command;
    match Command::new("pmset").args(["-g", "batt"]).output() {
        Ok(o) => {
            let txt = String::from_utf8_lossy(&o.stdout);
            let charging = txt.contains("AC Power") || txt.contains("charging");
            let pct = txt.lines().find(|l| l.contains('%')).and_then(|l| {
                l.split_whitespace()
                    .find(|w| w.ends_with("%;") || w.ends_with('%'))
                    .and_then(|w| w.trim_end_matches("%;").trim_end_matches('%').parse().ok())
            });
            let tl = txt.lines().find(|l| l.contains("remaining")).and_then(|l| {
                l.split_whitespace().find(|w| w.contains(':')).and_then(|w| {
                    let v: Vec<&str> = w.split(':').collect();
                    if v.len() == 2 {
                        Some(v[0].parse::<f64>().ok()? * 3600.0 + v[1].parse::<f64>().ok()? * 60.0)
                    } else { None }
                })
            });
            (pct, Some(charging), tl)
        }
        Err(_) => (None, None, None),
    }
}

#[cfg(target_os = "linux")]
fn battery_linux() -> (Option<f64>, Option<bool>, Option<f64>) {
    use std::fs;
    if let Ok(entries) = fs::read_dir("/sys/class/power_supply") {
        for entry in entries.flatten() {
            let p = entry.path();
            if entry.file_name().to_string_lossy().starts_with("BAT") {
                let cap = fs::read_to_string(p.join("capacity")).ok().and_then(|s| s.trim().parse().ok());
                let st = fs::read_to_string(p.join("status")).ok().map(|s| s.trim().to_lowercase());
                let ch = st.as_deref().map(|s| s == "charging" || s == "full");
                let en = fs::read_to_string(p.join("energy_now")).ok().and_then(|s| s.trim().parse::<f64>().ok());
                let pw = fs::read_to_string(p.join("power_now")).ok().and_then(|s| s.trim().parse::<f64>().ok());
                let tl = match (en, pw) { (Some(e), Some(p)) if p > 0.0 => Some((e / p) * 3600.0), _ => None };
                return (cap, ch, tl);
            }
        }
    }
    (None, None, None)
}
