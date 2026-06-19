// =============================================================================
// DEX Tauri — Stability/health subsystem (partial port of the `stability:*`
// IPC surface). Tier: heartbeat only.
//
// The Electron `stability:*` namespace is spread across four live, in-memory
// monitors (StabilityCore, SessionStabilityManager, InnerAppStabilityManager,
// plus a heartbeat handler in main.ts). Almost the entire surface is RUNTIME
// telemetry: memory-pressure sampling, frame-time / latency variance windows,
// a renderer watchdog on an OS timer, per-inner-app health/violation state, and
// manual GC compaction. None of that is pure CRUD data — it is process-local
// behaviour that has no honest meaning in a stateless dispatcher, and the task
// rules forbid faking it. Those channels are therefore SKIPPED (see dispatch()),
// returning Value::Null so the prefix route degrades honestly.
//
// The one clean, pure-data channel is the async heartbeat from main.ts:
//   ipcMain.handle('stability:ping') -> { status: 'ok', uptime, timestamp }
// which the renderer (stabilityHooks.ts startPingInterval) calls via invoke().
// We reproduce that EXACT shape. `uptime` mirrors Node's process.uptime()
// (process lifetime in fractional SECONDS) and `timestamp` mirrors Date.now()
// (epoch millis).
//
// DIVERGENCE (uptime origin): Node's process.uptime() counts from process spawn.
// We have no spawn hook inside this module, so the origin Instant is captured
// LAZILY on the first stability:ping call (std::sync::OnceLock). uptime is thus
// measured from the first heartbeat rather than from true process start. The
// renderer only uses ping to detect an unresponsive main process (it checks for
// a truthy reply, not the uptime magnitude), so the value is informational and
// this shift is harmless. The field name/type (number of seconds) is preserved.
//
// NOTE: there is a second, SYNCHRONOUS 'stability:ping' in StabilityCore.ts
// (ipcMain.on, event.returnValue = { pong: true, timestamp }). The renderer uses
// invoke() (async), which in Electron resolves against the `handle` registration
// in main.ts, not the sync `on` handler. We match main.ts's shape and do NOT
// invent the `pong` field.
//
// Storage: none. This subsystem is in-memory health only; nothing is persisted.
// =============================================================================

use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

// Lazily-captured process-relative origin for the uptime field (see header).
static PING_ORIGIN: OnceLock<Instant> = OnceLock::new();

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// process.uptime()-equivalent: fractional seconds since the origin instant.
fn uptime_secs() -> f64 {
    let origin = PING_ORIGIN.get_or_init(Instant::now);
    origin.elapsed().as_secs_f64()
}

/// Route a `stability:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts / dex_ipc). Only the pure-data heartbeat is ported;
/// every other channel in the namespace is intentionally skipped (Value::Null).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Pure data: { status: 'ok', uptime, timestamp } — matches main.ts exactly.
        "stability:ping" => json!({
            "status": "ok",
            "uptime": uptime_secs(),
            "timestamp": now_ms(),
        }),

        // ---- intentionally NOT ported (live runtime telemetry / in-memory state) ----
        // SessionStabilityManager (process-local sampling windows + OS timers):
        //   stability:getMetrics, stability:getSnapshot, stability:getUptime,
        //   stability:compact (manual GC compaction), and the send-only reporters
        //   stability:idle, stability:frameTime, stability:latency.
        // StabilityCore (event log + renderer watchdog on an OS timer):
        //   stability:getStats, stability:getRecentEvents, stability:isStable,
        //   stability:reportError.
        // InnerAppStabilityManager (per-inner-app health/violation/operation state):
        //   stability:get-health, stability:get-all-health, stability:get-violations,
        //   stability:report-error, stability:report-success, stability:begin-operation,
        //   stability:complete-operation, stability:clear-violations, stability:reset-app.
        // All omitted: there is no honest stateless port and faking is forbidden.
        _ => Value::Null,
    }
}
