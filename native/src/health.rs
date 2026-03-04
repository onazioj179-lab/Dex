// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Health Monitoring (Watchdog + Learning Engine)
// Replaces: dex_core.py Watchdog + LearningEngine classes
// ═══════════════════════════════════════════════════════════════════════════

use napi::bindgen_prelude::*;
use napi_derive::napi;
use sysinfo::{Pid, System};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct HealthStatus {
    pub uptime: f64,
    pub uptime_formatted: String,
    pub error_count: u32,
    pub memory_mb: f64,
    pub avg_memory_mb: f64,
    pub memory_trend: String,
    pub healthy: bool,
}

#[napi(object)]
#[derive(Clone)]
pub struct Suggestion {
    pub suggestion_type: String,
    pub name: String,
    pub reason: String,
}

// ─────────────────────────────────────────────────────────────────────────
// Internal State
// ─────────────────────────────────────────────────────────────────────────

struct State {
    start: Instant,
    errors: u32,
    mem_samples: Vec<f64>,
    op_freq: HashMap<String, u32>,
    time_ops: HashMap<String, Vec<String>>,
    data_path: PathBuf,
}

static STATE: OnceLock<Mutex<State>> = OnceLock::new();

fn state() -> &'static Mutex<State> {
    STATE.get_or_init(|| {
        let dp = dirs::data_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".dex"))
            .join("dex");
        let (of, to) = load_patterns(&dp);
        Mutex::new(State {
            start: Instant::now(),
            errors: 0,
            mem_samples: Vec::with_capacity(120),
            op_freq: of,
            time_ops: to,
            data_path: dp,
        })
    })
}

// ─────────────────────────────────────────────────────────────────────────
// Health Monitoring
// ─────────────────────────────────────────────────────────────────────────

/// Record a heartbeat — samples process memory for trend detection.
#[napi]
pub fn heartbeat() -> Result<()> {
    let mut st = state().lock().map_err(|e| Error::from_reason(e.to_string()))?;

    let mut sys = System::new();
    let pid = Pid::from(std::process::id() as usize);
    sys.refresh_process(pid);

    if let Some(p) = sys.process(pid) {
        let mb = p.memory() as f64 / (1024.0 * 1024.0);
        st.mem_samples.push(mb);
        if st.mem_samples.len() > 120 { st.mem_samples.remove(0); }
    }

    Ok(())
}

/// Record an error for health tracking.
#[napi]
pub fn record_error(error_message: String) -> Result<()> {
    let mut st = state().lock().map_err(|e| Error::from_reason(e.to_string()))?;
    st.errors += 1;
    eprintln!("[DEX-HEALTH] Error #{}: {}", st.errors, error_message);
    Ok(())
}

/// Get DEX process health status.
#[napi]
pub fn get_health() -> Result<HealthStatus> {
    let st = state().lock().map_err(|e| Error::from_reason(e.to_string()))?;

    let up = st.start.elapsed().as_secs_f64();
    let h = (up as u64) / 3600;
    let m = ((up as u64) % 3600) / 60;

    // Current memory
    let mut sys = System::new();
    let pid = Pid::from(std::process::id() as usize);
    sys.refresh_process(pid);
    let cur = sys.process(pid).map(|p| p.memory() as f64 / (1024.0 * 1024.0)).unwrap_or(0.0);

    // Average
    let avg = if st.mem_samples.is_empty() { cur } else {
        st.mem_samples.iter().sum::<f64>() / st.mem_samples.len() as f64
    };

    // Trend
    let trend = if st.mem_samples.len() > 10 {
        let l = st.mem_samples.len();
        let recent: f64 = st.mem_samples[l - 10..].iter().sum::<f64>() / 10.0;
        let older: f64 = st.mem_samples[..10].iter().sum::<f64>() / 10.0;
        if recent > older * 1.2 { "increasing" } else if recent < older * 0.8 { "decreasing" } else { "stable" }
    } else { "stable" };

    Ok(HealthStatus {
        uptime: up,
        uptime_formatted: format!("{}h {}m", h, m),
        error_count: st.errors,
        memory_mb: (cur * 10.0).round() / 10.0,
        avg_memory_mb: (avg * 10.0).round() / 10.0,
        memory_trend: trend.to_string(),
        healthy: st.errors < 10 && trend != "increasing",
    })
}

// ─────────────────────────────────────────────────────────────────────────
// Learning Engine
// ─────────────────────────────────────────────────────────────────────────

/// Record a user activity for pattern learning.
#[napi]
pub fn record_activity(activity_type: String, name: String) -> Result<()> {
    if activity_type != "operation" { return Ok(()); }

    let mut st = state().lock().map_err(|e| Error::from_reason(e.to_string()))?;

    let count = st.op_freq.entry(name.clone()).or_insert(0);
    *count += 1;

    let hour = chrono::Local::now().format("%H:00").to_string();
    let ops = st.time_ops.entry(hour).or_default();
    if !ops.contains(&name) { ops.push(name); }

    // Persist every 10 operations
    let total: u32 = st.op_freq.values().sum();
    if total % 10 == 0 {
        save_patterns(&st.data_path, &st.op_freq, &st.time_ops);
    }

    Ok(())
}

/// Get intelligent suggestions based on learned patterns.
#[napi]
pub fn get_suggestions() -> Result<Vec<Suggestion>> {
    let st = state().lock().map_err(|e| Error::from_reason(e.to_string()))?;
    let mut suggestions = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Time-based
    let hour = chrono::Local::now().format("%H:00").to_string();
    if let Some(ops) = st.time_ops.get(&hour) {
        for op in ops.iter().take(3) {
            if seen.insert(op.clone()) {
                suggestions.push(Suggestion {
                    suggestion_type: "operation".into(),
                    name: op.clone(),
                    reason: format!("You often run this around {}", hour),
                });
            }
        }
    }

    // Frequency-based
    let mut sorted: Vec<_> = st.op_freq.iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(a.1));
    for (op, count) in sorted.iter().take(3) {
        if seen.insert((*op).clone()) {
            suggestions.push(Suggestion {
                suggestion_type: "operation".into(),
                name: (*op).clone(),
                reason: format!("Frequently used ({} times)", count),
            });
        }
    }

    suggestions.truncate(5);
    Ok(suggestions)
}

// ─────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────

fn load_patterns(dp: &Path) -> (HashMap<String, u32>, HashMap<String, Vec<String>>) {
    let f = dp.join("patterns.json");
    if let Ok(c) = std::fs::read_to_string(&f) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&c) {
            let of = v.get("operation_frequency").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
            let to = v.get("time_based_ops").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
            return (of, to);
        }
    }
    (HashMap::new(), HashMap::new())
}

fn save_patterns(dp: &Path, of: &HashMap<String, u32>, to: &HashMap<String, Vec<String>>) {
    let _ = std::fs::create_dir_all(dp);
    let data = serde_json::json!({ "operation_frequency": of, "time_based_ops": to });
    let _ = std::fs::write(dp.join("patterns.json"), serde_json::to_string_pretty(&data).unwrap_or_default());
}
