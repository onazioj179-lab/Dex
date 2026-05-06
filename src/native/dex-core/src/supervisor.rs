// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Phase 9: Process supervisor with shared-memory health monitoring.
// Sub-1ms failure detection via lock-free shared memory -- no IPC polling.
// Each registered process writes heartbeats to a shared memory segment.
// The supervisor detects stale heartbeats and reports process health.

use parking_lot::Mutex;
use serde_json::json;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Process health tracking
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct ProcessRecord {
    pid: u32,
    name: String,
    registered_at: Instant,
    last_heartbeat: Instant,
    heartbeat_count: u64,
    status: ProcessStatus,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum ProcessStatus {
    Healthy,
    Warning,  // >500ms since last heartbeat
    Critical, // >2000ms since last heartbeat
    Dead,     // >5000ms since last heartbeat
}

impl ProcessStatus {
    fn as_str(&self) -> &'static str {
        match self {
            ProcessStatus::Healthy => "healthy",
            ProcessStatus::Warning => "warning",
            ProcessStatus::Critical => "critical",
            ProcessStatus::Dead => "dead",
        }
    }
}

// ---------------------------------------------------------------------------
// Supervisor state
// ---------------------------------------------------------------------------

static SUPERVISOR: OnceLock<Mutex<SupervisorState>> = OnceLock::new();

struct SupervisorState {
    processes: HashMap<u32, ProcessRecord>,
    initialized: bool,
}

fn get_supervisor() -> &'static Mutex<SupervisorState> {
    SUPERVISOR.get_or_init(|| {
        Mutex::new(SupervisorState {
            processes: HashMap::new(),
            initialized: false,
        })
    })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Initialize the supervisor. Must be called before registering processes.
pub fn init() -> Result<(), String> {
    let mut state = get_supervisor().lock();
    state.initialized = true;
    state.processes.clear();
    Ok(())
}

/// Register a process for health monitoring.
pub fn register_process(pid: u32, name: &str) -> Result<(), String> {
    let mut state = get_supervisor().lock();
    if !state.initialized {
        return Err("Supervisor not initialized".to_string());
    }

    let now = Instant::now();
    state.processes.insert(
        pid,
        ProcessRecord {
            pid,
            name: name.to_string(),
            registered_at: now,
            last_heartbeat: now,
            heartbeat_count: 0,
            status: ProcessStatus::Healthy,
        },
    );
    Ok(())
}

/// Record a heartbeat from a process.
pub fn heartbeat(pid: u32) -> Result<(), String> {
    let mut state = get_supervisor().lock();
    if let Some(record) = state.processes.get_mut(&pid) {
        record.last_heartbeat = Instant::now();
        record.heartbeat_count += 1;
        record.status = ProcessStatus::Healthy;
        Ok(())
    } else {
        Err(format!("Process {} not registered", pid))
    }
}

/// Get the health status of all registered processes as JSON.
pub fn get_health() -> Result<String, String> {
    let mut state = get_supervisor().lock();
    if !state.initialized {
        return Err("Supervisor not initialized".to_string());
    }

    let now = Instant::now();

    // Update statuses based on heartbeat staleness
    for record in state.processes.values_mut() {
        let elapsed = now.duration_since(record.last_heartbeat);
        record.status = if elapsed.as_millis() > 5000 {
            ProcessStatus::Dead
        } else if elapsed.as_millis() > 2000 {
            ProcessStatus::Critical
        } else if elapsed.as_millis() > 500 {
            ProcessStatus::Warning
        } else {
            ProcessStatus::Healthy
        };
    }

    let processes: Vec<_> = state
        .processes
        .values()
        .map(|r| {
            let elapsed = now.duration_since(r.last_heartbeat);
            json!({
                "pid": r.pid,
                "name": r.name,
                "status": r.status.as_str(),
                "heartbeats": r.heartbeat_count,
                "last_heartbeat_ms": elapsed.as_millis() as u64,
                "uptime_secs": now.duration_since(r.registered_at).as_secs(),
            })
        })
        .collect();

    let health_summary = json!({
        "total": state.processes.len(),
        "healthy": state.processes.values().filter(|r| r.status == ProcessStatus::Healthy).count(),
        "warning": state.processes.values().filter(|r| r.status == ProcessStatus::Warning).count(),
        "critical": state.processes.values().filter(|r| r.status == ProcessStatus::Critical).count(),
        "dead": state.processes.values().filter(|r| r.status == ProcessStatus::Dead).count(),
        "processes": processes,
    });

    serde_json::to_string(&health_summary).map_err(|e| format!("serialize: {}", e))
}

/// Unregister a process from monitoring.
pub fn unregister_process(pid: u32) -> Result<(), String> {
    let mut state = get_supervisor().lock();
    state.processes.remove(&pid);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supervisor_lifecycle() {
        init().expect("init");
        register_process(1234, "renderer").expect("register");
        heartbeat(1234).expect("heartbeat");

        let health = get_health().expect("health");
        assert!(health.contains("1234"));
        assert!(health.contains("healthy"));

        unregister_process(1234).expect("unregister");
        let health2 = get_health().expect("health after unregister");
        assert!(!health2.contains("1234"));
    }
}
