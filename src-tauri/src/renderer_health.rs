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
// HEAVY channels intentionally NOT ported (see channelsSkipped): monitor,
// recover. They require the live runtime — the BrowserWindow ping/pong loop, the
// setInterval scheduler, the per-window webContents.send GC requests, and the
// emergency-state recovery side-effects — none of which exist in this stateless
// dispatcher. They are NOT faked; routing in the namespace returns Value::Null
// for them (honest degrade).
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
use sysinfo::System;

const BYTES_PER_MB: f64 = 1024.0 * 1024.0;

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

// getStatus() — aggregate snapshot. reports/flags/crashes are empty without the
// live monitor (see header); `current` is a fresh self-report so the renderer's
// developer panel always has at least one live reading to display.
fn get_status() -> Value {
    json!({
        "reports": [],
        "flags": [],
        "crashes": [],
        "current": current_report(),
        "timestamp": now_ms()
    })
}

/// Route a `renderer-health:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The one ported data channel returns its
/// Electron shape; the heavy channels (monitor, recover) and any unknown channel
/// return Value::Null (honest degrade) — they are never faked.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "renderer-health:getStatus" => get_status(),
        // Heavy / runtime-only channels — not ported (need the live ping/pong
        // loop, interval scheduler, and per-window GC/recovery side-effects):
        // monitor, recover. Return null rather than fake data.
        _ => Value::Null,
    }
}
