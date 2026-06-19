// =============================================================================
// DEX Tauri — Startup Timeline subsystem (port of startup:timeline / utils/StartupTimeline.ts).
//
// Computed-at-startup, no persistence. The Electron main process instrumented
// its boot with named phases (process:entry, app:ready, IPC:setup,
// window:create, renderer:did-finish-load, ...) via StartupTimeline.mark/
// begin/end, then `startup:timeline` returned StartupTimeline.snapshot():
//   { totalMs: number, phases: [{ name: string, durationMs: number }, ...] }
// The renderer (DiagnosticsPanel) reads totalMs and the phases array; it
// tolerates an empty phases array (it only renders when Array.isArray(phases)).
//
// DIVERGENCE (documented): the Tauri main process is not instrumented with
// those Electron-specific phase markers — they were emitted from points inside
// the Electron lifecycle (app.whenReady, BrowserWindow create, etc.) that do
// not exist here. Rather than FABRICATE phase names/durations the Electron
// runtime never produced, this returns the SAME shape with an empty `phases`
// array. `totalMs` is a real elapsed measurement: milliseconds since this
// module's monotonic anchor (captured on first touch, i.e. the earliest
// dispatch — diagnostics queries land shortly after launch). It mirrors
// Electron's `Date.now() - _t0` semantics (elapsed since the timeline's own
// origin) with the only difference being the origin is the module anchor
// rather than process entry, since no process-entry hook is wired here and
// editing main.rs is out of scope for this port. The shape matches exactly so
// the renderer is unchanged; the phase breakdown simply renders empty until
// native startup instrumentation is added.
// =============================================================================

use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::Instant;

// Monotonic origin for elapsed measurement. Captured the first time anything in
// this module is touched (the earliest `startup:timeline` dispatch). Using a
// monotonic Instant avoids wall-clock jumps; mirrors StartupTimeline._t0.
static ANCHOR: OnceLock<Instant> = OnceLock::new();

fn anchor() -> Instant {
    *ANCHOR.get_or_init(Instant::now)
}

// snapshot() — { totalMs, phases: [] }. totalMs is elapsed-since-anchor in ms.
fn snapshot() -> Value {
    let total_ms = anchor().elapsed().as_millis() as u64;
    json!({
        "totalMs": total_ms,
        "phases": Value::Array(Vec::new()),
    })
}

/// Route a `startup:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). `startup:timeline` is argument-less in Electron.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "startup:timeline" => snapshot(),
        _ => Value::Null,
    }
}
