// =============================================================================
// DEX Tauri — Renderer Health subsystem (port of the renderer-health surface in
// monitors/RendererHealthMonitor.ts + utils/HealthResponder.ts).
//
// Pure-data / status tier. The Electron monitor was a LIVE main-process service:
// it pinged every BrowserWindow every 60s (`renderer-health:ping`), collected
// `renderer-health:pong` reports into in-memory Maps (healthReports), derived
// RendererFlags (frozen / memory-pressure / low-fps / webgl-lost) into the
// `activeFlags` ring buffer, and tallied per-window crashes (crashTracker). None
// of that state was ever persisted (no electron-store / fs file, no DataStore
// key) — it lived only in process memory and reset every launch.
//
// Only ONE data-tier channel is ported: getStatus. It returns the aggregate
// health snapshot the monitor exposed through its accessors (getHealthFlags() /
// getCrashStats() + the latest reports), shaped exactly as the Electron objects.
// Without the live ping loop there are no accumulated reports/flags/crashes, so
// those arrays come back empty — the SAME shape Electron held at startup before
// the first pong arrived (mirrors the documented runtime-only divergence in
// battery_ctl.rs::get_state).
//
// Channel & shape (DATA tier ported here):
//   - renderer-health:getStatus -> {
//         reports: RendererHealthReport[],   // healthReports.values()
//         flags:   RendererFlag[],           // getHealthFlags(): last 50
//         crashes: CrashStat[],              // getCrashStats()
//         current: RendererHealthReport,     // a fresh self-report (see below)
//         timestamp: number
//       }
//     where
//       RendererHealthReport = { windowId, heapUsedMB, heapLimitMB,
//         heapUtilization, lastFrameTimeMs, errorCountSinceLastCheck,
//         webglContextLost, timestamp }
//       RendererFlag = { windowId, type, detail, timestamp }
//       CrashStat    = { windowId, crashCount, lastError }
//
// HEAVY channels NOW PORTED with real native code (see below): monitor, recover.
// The Electron monitor was a LIVE main-process service; the native analogs are:
//   - monitor  -> start a background std::thread that, like the Electron 60s
//     setInterval, emits `renderer-health:ping` to the renderer (the bridge analog
//     of webContents.send), samples live PROCESS memory via sysinfo on each tick,
//     derives RendererFlags (memory-pressure) into a shared in-memory ring buffer
//     (the analog of Electron's `activeFlags`, also process-memory-only / reset
//     each launch), and on critical heap emits `renderer-health:gc-request`. The
//     thread is started ONCE (guarded by a flag, mirroring Electron's
//     `if (pingInterval) return`). getStatus() reflects the flags this loop
//     accumulates. There is no BrowserWindow ping/pong RTT here, so the "frozen"
//     flag (which Electron set on a 2s no-response timeout) has no native source
//     and is never produced — documented in DIVERGENCES.
//   - recover  -> the renderer's recovery side-effects: force GC by emitting
//     `renderer-health:gc-request` to the renderer (Electron's
//     `renderer:memory-critical` handler), and persist an emergency-state snapshot
//     into the same shared in-memory store (Electron's
//     `renderer:save-emergency-state`, which also only held it in memory). Returns
//     the same `{ acknowledged, saved }`-style ack.
//
// DIVERGENCES (documented):
//   - PERSISTENCE: Electron held all of this in process memory (Maps + a flag
//     ring buffer), reset each launch. There is no native long-lived monitor in
//     this dispatcher, so reports/flags/crashes are empty arrays — the exact
//     shape Electron returned before any pong/crash had been recorded.
//   - `current`: HealthResponder built each report in the RENDERER from
//     `performance.memory` (a Chromium-only API unavailable here). We instead
//     fill the same field names from the live PROCESS memory via sysinfo (an
//     existing dep; same approach adaptive_ctl.rs / db_perf_ctl.rs use): heap*
//     are MB derived from used/total system memory, heapUtilization is used/total
//     in [0,1]. lastFrameTimeMs / errorCountSinceLastCheck have no native source
//     so they are 0 (the responder's own initial values before any frame/error),
//     webglContextLost false (the responder hard-coded false), windowId 0
//     (no BrowserWindow registry). timestamp is epoch-ms via SystemTime
//     (Date.now() precedent).
// =============================================================================

use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use sysinfo::System;

const BYTES_PER_MB: f64 = 1024.0 * 1024.0;

// --- Shared in-memory monitor state ---------------------------------------
// Mirrors the Electron monitor's process-memory-only state (it used a plain
// `RendererFlag[]` ring buffer + a `crashTracker` Map and never persisted any of
// it — reset every launch). We hold the SAME shapes here behind a Mutex so both
// the background monitor thread and the dispatcher (getStatus) can read/write
// them. No DataStore / fs key, by design — matching the documented runtime-only
// divergence in the header.

// Ensures the monitor interval thread is spawned at most once, the native analog
// of Electron's `if (pingInterval) return;` guard in startRendererHealthMonitor.
static MONITOR_STARTED: AtomicBool = AtomicBool::new(false);

// Derived RendererFlags accumulated by the monitor loop (Electron's activeFlags).
static ACTIVE_FLAGS: Mutex<Vec<Value>> = Mutex::new(Vec::new());

// The last emergency-state snapshot saved via `recover` (Electron's
// renderer:save-emergency-state, also memory-only). None until one is saved.
static EMERGENCY_STATE: Mutex<Option<Value>> = Mutex::new(None);

// Cap mirrors Electron's `while (activeFlags.length > 100) activeFlags.shift()`.
const MAX_FLAGS: usize = 100;

fn push_flag(flag: Value) {
    if let Ok(mut flags) = ACTIVE_FLAGS.lock() {
        flags.push(flag);
        while flags.len() > MAX_FLAGS {
            flags.remove(0);
        }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// A single self-report in the RendererHealthReport shape. See DIVERGENCES:
// heap* are sourced from live process memory (sysinfo) rather than the renderer's
// Chromium `performance.memory`, which does not exist outside the browser.
fn current_report() -> Value {
    let mut sys = System::new();
    sys.refresh_memory();
    let total = sys.total_memory().max(1); // bytes; avoid div-by-zero
    let used = sys.used_memory().min(total); // bytes
    let used_mb = used as f64 / BYTES_PER_MB;
    let limit_mb = total as f64 / BYTES_PER_MB;
    let utilization = used as f64 / total as f64;
    json!({
        "windowId": 0,
        "heapUsedMB": used_mb,
        "heapLimitMB": limit_mb,
        "heapUtilization": utilization,
        "lastFrameTimeMs": 0,
        "errorCountSinceLastCheck": 0,
        "webglContextLost": false,
        "timestamp": now_ms()
    })
}

// getStatus() — aggregate snapshot. `flags` now reflects whatever the native
// monitor loop has accumulated (last 50, mirroring Electron's getHealthFlags()
// slice(-50)); when the monitor has not been started it is empty — the same shape
// Electron returned before any pong/flag. `reports`/`crashes` stay empty: there
// is no per-BrowserWindow pong report registry nor a render-error crash feed in
// this dispatcher (no windowId namespace), so those keep their startup shape.
// `current` is a fresh self-report so the developer panel always has one live
// reading.
fn get_status() -> Value {
    let flags: Vec<Value> = ACTIVE_FLAGS
        .lock()
        .map(|f| f.iter().rev().take(50).rev().cloned().collect())
        .unwrap_or_default();
    json!({
        "reports": [],
        "flags": flags,
        "crashes": [],
        "current": current_report(),
        "timestamp": now_ms()
    })
}

// One monitor tick: the native analog of Electron's pingAllRenderers +
// processReport for the (single) renderer. Emits the ping the renderer's
// HealthResponder listens for, samples live process memory, derives the
// memory-pressure flag (>80% heap, exactly Electron's threshold), and on critical
// heap emits the GC request the responder honors. windowId 0 (no BrowserWindow
// registry). Returns the report it built so `monitor` can echo the first tick.
fn monitor_tick(app: &tauri::AppHandle) -> Value {
    let report = current_report();
    // Electron: win.webContents.send('renderer-health:ping', { windowId }).
    crate::native_ops::emit_event(app, "renderer-health:ping", &json!({ "windowId": 0 }));

    let util = report
        .get("heapUtilization")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let used_mb = report.get("heapUsedMB").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let limit_mb = report.get("heapLimitMB").and_then(|v| v.as_f64()).unwrap_or(0.0);

    // Electron processReport: memory pressure when heapUtilization > 0.8.
    if util > 0.8 {
        push_flag(json!({
            "windowId": 0,
            "type": "memory-pressure",
            "detail": format!(
                "Heap at {}% ({}MB / {}MB)",
                (util * 100.0).round() as i64,
                used_mb.round() as i64,
                limit_mb.round() as i64
            ),
            "timestamp": now_ms()
        }));
    }

    // Electron renderer:memory-critical -> broadcast a GC request. We trigger it
    // on very high heap so the responder can drop caches without a renderer round
    // trip (there is no renderer->main critical IPC in this dispatcher).
    if util > 0.9 {
        crate::native_ops::emit_event(app, "renderer-health:gc-request", &json!({}));
    }

    report
}

// monitor() — start the background health monitor (Electron
// startRendererHealthMonitor). Spawns a real std::thread that ticks every 60s
// (matching Electron's setInterval(pingAllRenderers, 60_000)), guarded so it runs
// at most once per process. Runs an immediate first tick so the caller and the
// returned snapshot are populated without waiting a full interval.
fn monitor(app: &tauri::AppHandle) -> Value {
    let first = monitor_tick(app);

    let already = MONITOR_STARTED.swap(true, Ordering::SeqCst);
    if !already {
        let app2 = app.clone();
        crate::util::spawn_named("renderer_health", move || loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
            monitor_tick(&app2);
        });
    }

    json!({
        "success": true,
        "running": true,
        "intervalMs": 60_000,
        "current": first,
        "flags": ACTIVE_FLAGS
            .lock()
            .map(|f| f.iter().rev().take(50).rev().cloned().collect::<Vec<Value>>())
            .unwrap_or_default(),
        "timestamp": now_ms()
    })
}

// recover(state?) — renderer recovery side-effects. Mirrors two Electron handlers:
//   renderer:memory-critical  -> force GC by broadcasting renderer-health:gc-request
//   renderer:save-emergency-state -> stash the snapshot in memory for recovery
// The optional first arg is the emergency state to save (any JSON). Returns the
// combined ack ({ acknowledged, saved }) the renderer expected from those calls.
fn recover(app: &tauri::AppHandle, args: &Value) -> Value {
    // Force GC in the renderer (Electron's memory-critical handler loop).
    crate::native_ops::emit_event(app, "renderer-health:gc-request", &json!({}));

    // Save the emergency state if one was provided (Electron save-emergency-state).
    let saved = match args.get(0) {
        Some(state) if !state.is_null() => {
            if let Ok(mut slot) = EMERGENCY_STATE.lock() {
                *slot = Some(state.clone());
            }
            true
        }
        _ => false,
    };

    // Echo whether a recovery snapshot is now held (reads the saved state back so
    // a caller can confirm what would be restored). null when none has been saved.
    let snapshot = EMERGENCY_STATE
        .lock()
        .ok()
        .and_then(|s| s.clone())
        .unwrap_or(Value::Null);

    json!({
        "success": true,
        "acknowledged": true,
        "saved": saved,
        "emergencyState": snapshot,
        "timestamp": now_ms()
    })
}

/// Route a `renderer-health:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). getStatus returns its Electron snapshot
/// shape; monitor starts the native background ping/flag loop; recover runs the
/// GC + emergency-state recovery side-effects. Unknown channels return
/// Value::Null (honest degrade) — none are faked.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "renderer-health:getStatus" => get_status(),
        "renderer-health:monitor" => monitor(app),
        "renderer-health:recover" => recover(app, args),
        _ => Value::Null,
    }
}
