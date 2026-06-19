// =============================================================================
// DEX Tauri — Power & performance subsystem (port of controllers/PowerController.ts).
//
// Rounds out the already-native `power` namespace (getStats/closeProcess/
// getDiskUsage were partial). Profiles map to the same OS power plans the
// Electron controller drove (Windows powercfg GUIDs; macOS pmset; Linux
// cpupower) via std::process::Command, mirroring git.rs. The current profile is
// SESSION state (Electron's controller reset to 'balanced' each launch), so it
// lives in Tauri-managed state, not on disk.
//
// HONEST DIVERGENCES (documented, not silent):
//   - Battery: sysinfo has no battery API and we add no new crate, so getStats
//     reports hasBattery:false / powerSource:"ac" / 100% (Electron read it from
//     systeminformation or the native bridge). cpu/memory/topProcesses are real.
//   - setProfile applies the OS power PLAN only; Electron also deprioritized or
//     closed background processes via the native bridge — that aggressive,
//     process-killing step is deliberately NOT ported here.
//   - freeMemory has no native working-set trim (Electron's was largely a no-op
//     too: GC of its own process), so it reports a best-effort success/0 MB.
// =============================================================================

use serde_json::{json, Value};
use std::sync::Mutex;
use sysinfo::System;
use tauri::Manager;

/// Current power profile — session state, registered in `setup()`.
pub type PowerProfileState = Mutex<PowerStateInner>;

pub struct PowerStateInner {
    current_profile: String,
    applied_at: i64,
    previous_profile: Option<String>,
}

impl Default for PowerStateInner {
    fn default() -> Self {
        Self { current_profile: "balanced".into(), applied_at: now_ms(), previous_profile: None }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Processes that must never be classified closable (port of SYSTEM_PROCESSES).
const SYSTEM_PROCESSES: &[&str] = &[
    "system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "services.exe", "lsass.exe",
    "svchost.exe", "winlogon.exe", "dwm.exe", "explorer.exe", "taskhostw.exe", "runtimebroker.exe",
    "searchui.exe", "shellexperiencehost.exe", "sihost.exe", "fontdrvhost.exe", "ctfmon.exe",
    "securityhealthservice.exe", "spoolsv.exe", "audiodg.exe", "conhost.exe", "dllhost.exe",
    "kernel_task", "launchd", "loginwindow", "windowserver", "dock", "finder", "systemuiserver",
    "coreaudiod", "bluetoothd", "init", "systemd", "kthreadd", "ksoftirqd", "kworker",
];

// Substrings/suffix that mark a deprioritizable background process (port of
// BACKGROUND_PATTERNS: update/telemetry/crash/report/helper/agent/daemon/sync,
// plus a trailing "service").
const BACKGROUND_SUBSTRINGS: &[&str] =
    &["update", "telemetry", "crash", "report", "helper", "agent", "daemon", "sync"];

fn classify(name_lc: &str) -> (&'static str, bool) {
    if SYSTEM_PROCESSES.contains(&name_lc) {
        return ("system", false);
    }
    if name_lc.ends_with("service") || BACKGROUND_SUBSTRINGS.iter().any(|s| name_lc.contains(s)) {
        return ("background", true);
    }
    ("user", true)
}

// --- profile state ----------------------------------------------------------

fn lock_state(app: &tauri::AppHandle) -> tauri::State<'_, PowerProfileState> {
    app.state::<PowerProfileState>()
}

pub fn get_profile(app: &tauri::AppHandle) -> Value {
    let st = lock_state(app);
    let g = st.lock().unwrap_or_else(|e| e.into_inner());
    json!(g.current_profile)
}

pub fn get_state(app: &tauri::AppHandle) -> Value {
    let st = lock_state(app);
    let g = st.lock().unwrap_or_else(|e| e.into_inner());
    json!({
        "currentProfile": g.current_profile,
        "appliedAt": g.applied_at,
        "previousProfile": g.previous_profile,
    })
}

// Run a command, hiding the console window on Windows (no flash / AV noise).
fn run(program: &str, args: &[&str]) -> bool {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

fn apply_profile(profile: &str, changes: &mut Vec<String>) {
    let os = std::env::consts::OS;
    match profile {
        "eco" => match os {
            "windows" => {
                if run("powercfg", &["/setactive", "a1841308-3541-4fab-bc81-f71556f20b4a"]) {
                    changes.push("Activated Power Saver plan".into());
                } else {
                    changes.push("Could not change Windows power plan (may require admin)".into());
                }
            }
            "macos" => {
                if run("pmset", &["-a", "lowpowermode", "1"]) {
                    changes.push("Enabled Low Power Mode".into());
                } else {
                    changes.push("Low Power Mode requires admin privileges".into());
                }
            }
            _ => {
                if run("cpupower", &["frequency-set", "-g", "powersave"]) {
                    changes.push("Set CPU governor to powersave".into());
                } else {
                    changes.push("CPU frequency control not available".into());
                }
            }
        },
        "boost" => match os {
            "windows" => {
                if run("powercfg", &["/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"]) {
                    changes.push("Activated High Performance plan".into());
                } else if run("powercfg", &["/setactive", "e9a42b02-d5df-448d-aa00-03f14749eb61"]) {
                    changes.push("Activated Ultimate Performance plan".into());
                } else {
                    changes.push("High Performance mode requested".into());
                }
            }
            "macos" => {
                run("pmset", &["-a", "powernap", "0"]);
                changes.push("Performance mode requested".into());
            }
            _ => {
                if run("cpupower", &["frequency-set", "-g", "performance"]) {
                    changes.push("Set CPU governor to performance".into());
                } else {
                    changes.push("Performance mode requested".into());
                }
            }
        },
        // balanced (and any unknown) -> balanced plan
        _ => match os {
            "windows" => {
                if run("powercfg", &["/setactive", "381b4222-f694-41f0-9685-ff5bb260df2e"]) {
                    changes.push("Activated Balanced power plan".into());
                } else {
                    changes.push("Using default Windows power settings".into());
                }
            }
            "macos" => {
                if run("pmset", &["-a", "lowpowermode", "0"]) {
                    changes.push("Disabled Low Power Mode".into());
                } else {
                    changes.push("Using default macOS power settings".into());
                }
            }
            _ => {
                if run("cpupower", &["frequency-set", "-g", "schedutil"]) {
                    changes.push("Set CPU governor to schedutil".into());
                } else {
                    changes.push("Using default Linux power settings".into());
                }
            }
        },
    }
    let tail = match profile {
        "eco" => "Eco Mode active - prioritizing battery life",
        "boost" => "Boost Mode active - maximum performance",
        _ => "Balanced Mode active - normal operation",
    };
    changes.push(tail.into());
}

fn profile_name(profile: &str) -> &str {
    match profile {
        "eco" => "Eco",
        "boost" => "Boost",
        "balanced" => "Balanced",
        other => other,
    }
}

pub fn set_profile(app: &tauri::AppHandle, profile: &str) -> Value {
    let profile = if matches!(profile, "eco" | "balanced" | "boost") { profile } else { "balanced" };
    let st = lock_state(app);
    let mut g = st.lock().unwrap_or_else(|e| e.into_inner());
    if g.current_profile == profile {
        return json!({ "success": true, "message": format!("Already in {} mode", profile), "changes": [] });
    }
    let previous = g.current_profile.clone();
    let mut changes: Vec<String> = Vec::new();
    apply_profile(profile, &mut changes);
    g.previous_profile = Some(previous);
    g.current_profile = profile.to_string();
    g.applied_at = now_ms();
    json!({
        "success": true,
        "message": format!("Switched to {} mode", profile_name(profile)),
        "changes": changes,
    })
}

pub fn quick_boost(app: &tauri::AppHandle, duration_minutes: Option<u64>) -> Value {
    let minutes = duration_minutes.unwrap_or(30);
    let res = set_profile(app, "boost");
    if res.get("success").and_then(|v| v.as_bool()).unwrap_or(false) && minutes > 0 {
        // Revert to balanced after the window. NOTE: unlike Electron we do not
        // cancel a prior pending revert, so overlapping boosts may revert early.
        let app2 = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(minutes * 60));
            let _ = set_profile(&app2, "balanced");
        });
        return json!({ "success": true, "message": format!("Boost mode activated for {} minutes", minutes) });
    }
    res
}

// --- stats / processes ------------------------------------------------------

/// Sample the machine twice (a short interval apart) so CPU deltas are real.
fn sampled_system() -> System {
    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_all();
    sys
}

struct HogRow {
    pid: u32,
    name: String,
    cpu: f64,
    memory_pct: f64,
    memory_mb: u64,
    path: Option<String>,
    can_close: bool,
    priority: &'static str,
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

fn collect_hogs(sys: &System, total_bytes: u64) -> Vec<HogRow> {
    let total_bytes = total_bytes.max(1);
    let mut rows: Vec<HogRow> = sys
        .processes()
        .iter()
        .filter_map(|(pid, p)| {
            let name = p.name().to_string();
            if name.is_empty() {
                return None;
            }
            let cpu = p.cpu_usage() as f64;
            let mem_bytes = p.memory();
            let mem_pct = (mem_bytes as f64 / total_bytes as f64) * 100.0;
            // Only significant consumers (matches the Electron filter).
            if cpu <= 5.0 && mem_pct <= 2.0 {
                return None;
            }
            let name_lc = name.to_lowercase();
            let (priority, can_close) = classify(&name_lc);
            Some(HogRow {
                pid: pid.as_u32(),
                name,
                cpu: round1(cpu),
                memory_pct: round1(mem_pct),
                memory_mb: mem_bytes / (1024 * 1024),
                path: p.exe().map(|p| p.to_string_lossy().to_string()),
                can_close,
                priority,
            })
        })
        .collect();
    // Sort by combined pressure (cpu + mem*2), descending; keep top 20.
    rows.sort_by(|a, b| {
        let sa = a.cpu + a.memory_pct * 2.0;
        let sb = b.cpu + b.memory_pct * 2.0;
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });
    rows.truncate(20);
    rows
}

fn hog_json(h: &HogRow) -> Value {
    json!({
        "pid": h.pid,
        "name": h.name,
        "cpu": h.cpu,
        "memory": h.memory_pct,
        "memoryMB": h.memory_mb,
        "path": h.path,
        "canClose": h.can_close,
        "priority": h.priority,
    })
}

pub fn resource_hogs() -> Value {
    let sys = sampled_system();
    let total = sys.total_memory();
    json!(collect_hogs(&sys, total).iter().map(hog_json).collect::<Vec<Value>>())
}

pub fn get_stats(app: &tauri::AppHandle) -> Value {
    let profile = {
        let st = lock_state(app);
        let g = st.lock().unwrap_or_else(|e| e.into_inner());
        g.current_profile.clone()
    };
    let sys = sampled_system();
    let total = sys.total_memory();
    let used = sys.used_memory();
    let available = total.saturating_sub(used);
    let percent = if total > 0 { ((used as f64 / total as f64) * 100.0).round() as i64 } else { 0 };
    let cpu_usage = sys.global_cpu_info().cpu_usage().round() as i64;
    let cores = sys.cpus().len().max(1);
    let hogs = collect_hogs(&sys, total);

    json!({
        "profile": profile,
        "cpu": { "usage": cpu_usage, "cores": cores },
        "memory": { "total": total, "used": used, "available": available, "percent": percent },
        "battery": {
            "percent": 100,
            "charging": false,
            "timeRemaining": Value::Null,
            "hasBattery": false,
            "powerSource": "ac",
        },
        "topProcesses": hogs.iter().map(hog_json).collect::<Vec<Value>>(),
    })
}

pub fn free_memory() -> Value {
    // No native working-set trim available without a new dependency; report a
    // best-effort success (Electron's path was largely a no-op too).
    json!({ "success": true, "message": "Memory optimization requested", "freedMB": 0 })
}

pub fn suggested_cleanup() -> Value {
    let sys = sampled_system();
    let total = sys.total_memory();
    let hogs = collect_hogs(&sys, total);
    let cleanable: Vec<&HogRow> = hogs.iter().filter(|h| h.priority == "background" && h.can_close).collect();
    let cpu_percent: f64 = round1(cleanable.iter().map(|h| h.cpu).sum());
    let memory_mb: u64 = cleanable.iter().map(|h| h.memory_mb).sum();
    json!({
        "processes": cleanable.iter().map(|h| hog_json(h)).collect::<Vec<Value>>(),
        "potentialSavings": { "cpuPercent": cpu_percent, "memoryMB": memory_mb },
    })
}

// Advisory tuning channels (parity with main.ts, which only logged + echoed).
pub fn set_cpu_limit(limit: Option<f64>) -> Value {
    json!({ "success": true, "limit": limit.unwrap_or(0.0) })
}
pub fn set_gpu_limit(limit: Option<f64>) -> Value {
    json!({ "success": true, "limit": limit.unwrap_or(0.0) })
}
pub fn set_fan_curve(curve: Option<String>) -> Value {
    json!({ "success": true, "curve": curve.unwrap_or_default() })
}

/// Uniform entry for the dex_ipc bridge. Routes the 10 power channels that do NOT
/// collide with the committed power:getStats / power:closeProcess / power:getDiskUsage
/// arms. (getStats stays mapped to system_status in main.rs.)
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &serde_json::Value) -> serde_json::Value {
    match channel {
        "power:getProfile" => get_profile(app),
        "power:getState" => get_state(app),
        "power:setProfile" => set_profile(app, args.get(0).and_then(|v| v.as_str()).unwrap_or("")),
        "power:quickBoost" => quick_boost(app, args.get(0).and_then(|v| v.as_u64())),
        "power:getResourceHogs" => resource_hogs(),
        "power:freeMemory" => free_memory(),
        "power:getSuggestedCleanup" => suggested_cleanup(),
        "power:setCpuLimit" => set_cpu_limit(args.get(0).and_then(|v| v.as_f64())),
        "power:setGpuLimit" => set_gpu_limit(args.get(0).and_then(|v| v.as_f64())),
        "power:setFanCurve" => set_fan_curve(args.get(0).and_then(|v| v.as_str()).map(|s| s.to_string())),
        _ => serde_json::Value::Null,
    }
}
