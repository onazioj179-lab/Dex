// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
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
    // Structured log to file and stderr
    log_error(&st.data_path, &format!("Error #{}: {}", st.errors, error_message));
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

    // Cap op_freq map at 500 entries to prevent unbounded memory growth
    if st.op_freq.len() >= 500 && !st.op_freq.contains_key(&name) {
        // Evict least-used entry
        if let Some(min_key) = st.op_freq.iter().min_by_key(|(_, v)| **v).map(|(k, _)| k.clone()) {
            st.op_freq.remove(&min_key);
        }
    }

    let count = st.op_freq.entry(name.clone()).or_insert(0);
    *count += 1;

    let hour = chrono::Local::now().format("%H:00").to_string();
    let ops = st.time_ops.entry(hour).or_default();
    if !ops.contains(&name) {
        // Cap time_ops per hour to 50 entries
        if ops.len() < 50 { ops.push(name); }
    }

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
// Persistence (with AES-256-GCM authenticated encryption)
// ─────────────────────────────────────────────────────────────────────────

use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;

/// Derive a 32-byte key from hostname + data path (deterministic per machine).
fn derive_key(dp: &Path) -> [u8; 32] {
    let seed = format!("DEX-patterns-v2-{}-{}", sysinfo::System::host_name().unwrap_or_default(), dp.display());
    // Simple key stretching: hash the seed multiple times
    let mut key = [0u8; 32];
    for (i, b) in seed.bytes().enumerate() {
        key[i % 32] ^= b;
    }
    // Mix in more entropy by folding
    for i in 0..32 {
        key[i] = key[i].wrapping_add(key[(i + 13) % 32]).wrapping_mul(0xA5);
        if key[i] == 0 { key[i] = 0xA5; }
    }
    key
}

/// Simple XOR for reading legacy format only (migration path).
fn xor_decrypt(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter().enumerate().map(|(i, b)| b ^ key[i % key.len()]).collect()
}

/// Derive legacy XOR key (for migration from XOR → AES-GCM).
fn derive_legacy_key(dp: &Path) -> Vec<u8> {
    let seed = format!("DEX-patterns-{}-{}", sysinfo::System::host_name().unwrap_or_default(), dp.display());
    let mut key = [0u8; 32];
    for (i, b) in seed.bytes().enumerate() {
        key[i % 32] ^= b;
    }
    for b in key.iter_mut() {
        if *b == 0 { *b = 0xA5; }
    }
    key.to_vec()
}

fn load_patterns(dp: &Path) -> (HashMap<String, u32>, HashMap<String, Vec<String>>) {
    let aes_file = dp.join("patterns.aes");
    let legacy_bin = dp.join("patterns.bin");
    let legacy_json = dp.join("patterns.json");
    let key = derive_key(dp);

    // Try AES-GCM format first (v2)
    if let Ok(enc) = std::fs::read(&aes_file) {
        if enc.len() > 12 {
            let nonce = Nonce::from_slice(&enc[..12]);
            if let Ok(cipher) = Aes256Gcm::new_from_slice(&key) {
                if let Ok(dec) = cipher.decrypt(nonce, &enc[12..]) {
                    if let Ok(c) = String::from_utf8(dec) {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&c) {
                            let of = v.get("operation_frequency").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
                            let to = v.get("time_based_ops").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
                            return (of, to);
                        }
                    }
                }
            }
        }
    }

    // Migrate from XOR-encrypted patterns.bin (v1)
    if let Ok(enc) = std::fs::read(&legacy_bin) {
        let legacy_key = derive_legacy_key(dp);
        let dec = xor_decrypt(&enc, &legacy_key);
        if let Ok(c) = String::from_utf8(dec) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&c) {
                let of = v.get("operation_frequency").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
                let to = v.get("time_based_ops").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
                // Migrate: save with AES-GCM and remove legacy file
                save_patterns(dp, &of, &to);
                let _ = std::fs::remove_file(&legacy_bin);
                return (of, to);
            }
        }
    }

    // Fallback: migrate from unencrypted patterns.json
    if let Ok(c) = std::fs::read_to_string(&legacy_json) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&c) {
            let of = v.get("operation_frequency").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
            let to = v.get("time_based_ops").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
            save_patterns(dp, &of, &to);
            let _ = std::fs::remove_file(&legacy_json);
            return (of, to);
        }
    }

    (HashMap::new(), HashMap::new())
}

fn save_patterns(dp: &Path, of: &HashMap<String, u32>, to: &HashMap<String, Vec<String>>) {
    if let Err(e) = std::fs::create_dir_all(dp) {
        log_error(dp, &format!("Failed to create data dir: {}", e));
        return;
    }
    let data = serde_json::json!({ "operation_frequency": of, "time_based_ops": to });
    let json = serde_json::to_string_pretty(&data).unwrap_or_default();
    let key = derive_key(dp);

    // Generate a random 96-bit nonce for each save
    let nonce_bytes: [u8; 12] = rand::random();
    let nonce = Nonce::from_slice(&nonce_bytes);

    match Aes256Gcm::new_from_slice(&key) {
        Ok(cipher) => {
            match cipher.encrypt(nonce, json.as_bytes()) {
                Ok(ciphertext) => {
                    let mut output = nonce_bytes.to_vec();
                    output.extend(ciphertext);
                    if let Err(e) = std::fs::write(dp.join("patterns.aes"), output) {
                        log_error(dp, &format!("Failed to save patterns: {}", e));
                    }
                }
                Err(e) => log_error(dp, &format!("Encryption error: {}", e)),
            }
        }
        Err(e) => log_error(dp, &format!("Cipher init error: {}", e)),
    }
}

/// Structured error logging to file instead of only eprintln
fn log_error(dp: &Path, msg: &str) {
    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let line = format!("[{}] ERROR: {}\n", ts, msg);
    eprintln!("[DEX-HEALTH] {}", msg);
    let log_file = dp.join("dex-errors.log");
    // Append to log file, truncate if > 1MB
    if log_file.exists() {
        if let Ok(meta) = std::fs::metadata(&log_file) {
            if meta.len() > 1_048_576 {
                let _ = std::fs::write(&log_file, &line);
                return;
            }
        }
    }
    let _ = std::fs::OpenOptions::new()
        .create(true).append(true).open(&log_file)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}
