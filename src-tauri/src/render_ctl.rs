// =============================================================================
// DEX Tauri — Render subsystem (port of the `render:*` IPC handlers in
// src/main/core/RenderGovernor.ts).
//
// PROMPT-vs-REALITY NOTE (read first):
// The task brief named the source `src/main/core/RenderingPipeline.ts`, a single
// DATA channel `getState`, a `datastore-kv:render` store, and heavy channels
// `render` / `optimize`. NONE of those exist in this codebase:
//   - There is no RenderingPipeline.ts; the real owner of the `render:*` IPC
//     namespace is RenderGovernor.ts.
//   - There is no `render:getState`, `render:render`, or `render:optimize`
//     channel, and no `datastore-kv:render` key — the RenderGovernor is PURE
//     IN-MEMORY RUNTIME TELEMETRY with NO persistent storage at all (same shape
//     as the InputLatencyController ported in input_ctl.rs).
// The actual `render:*` surface (RenderGovernor.setupIPCHandlers) is:
//   - render:getConfig    (handle) -> { displayMode, targetFrameTime, ... } [DATA]
//   - render:getSnapshot  (handle) -> RenderSnapshot                         [DATA]
//   - render:frameMetrics (send)   -> telemetry sink, returns void
//   - render:stateChange  (send)   -> telemetry sink, returns void
//   - render:inputEvent   (send)   -> telemetry sink, returns void
//
// So there is no CRUD/store key to mirror; the closest match to the brief's
// nominal `getState` DATA channel is `render:getSnapshot` (the governor's
// runtime state read-back). This module ports that one channel.
//
// PORTED channel & exact shape:
//   - render:getSnapshot -> RenderSnapshot:
//       { timestamp, displayMode, targetFrameTime, renderState, gpuState,
//         framesDropped, avgFrameTime, avgInputLatency, isVSynced, dpr }
//
// DELIBERATELY NOT PORTED HERE (returns null -> honest degrade):
//   - render:getConfig — already answered canonically by rendererShims.ts
//     (`renderConfig()`), which reads the live `window.devicePixelRatio` /
//     `window.screen.width` the renderer alone can see. The native side cannot
//     improve on that (sysinfo exposes no panel refresh rate), and duplicating a
//     weaker copy here would only risk diverging from the renderer's truth. We
//     route it to null so the established local shim stays authoritative.
//
// DIVERGENCE (documented, honest — no fabricated data):
//   getSnapshot() in Electron is derived from `frameHistory`, an in-memory ring
//   buffer filled ONLY by the native governor reacting to render:frameMetrics.
//   Under Tauri there is no such collector: render:frameMetrics/stateChange/
//   inputEvent are accept-and-discard telemetry sinks (see rendererShims
//   TELEMETRY_SINKS), so frameHistory is always empty and renderState/gpuState
//   never advance past their constructor defaults ('idle' / 'sleeping'). Feeding
//   that real, existing state through the SAME getSnapshot() logic yields,
//   deterministically:
//     displayMode = '60hz' (constructor default; no native display detection),
//     targetFrameTime = 1000/60 = 16.67 (TARGET_FRAME_TIME_60HZ),
//     renderState = 'idle', gpuState = 'sleeping',
//     framesDropped = 0, avgFrameTime = 0, avgInputLatency = 0,
//     isVSynced = true (constant in source), dpr = 1 (no native display info).
//   Only `timestamp` is live. This is the exact output of the ported function
//   over the state that actually exists on Tauri — identical to the renderer's
//   absent-channel fallback — not an invented value. If a native frame collector
//   and display-capability probe are added later, swap the empty-state values
//   for the real ring-buffer averages and detected display mode/DPR.
// =============================================================================

use serde_json::{json, Value};

// RENDER_TARGETS.TARGET_FRAME_TIME_60HZ — the governor's constructor default
// (no native display detection on Tauri, so the mode stays 60hz).
const TARGET_FRAME_TIME_60HZ: f64 = 16.67;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// getSnapshot() over the empty frameHistory + default state that exist on Tauri
// (see header). frameHistory.length === 0 makes both averages 0; renderState and
// gpuState are the constructor defaults; isVSynced is a source constant; dpr and
// displayMode fall back with no native display info. Only timestamp is live.
fn get_snapshot() -> Value {
    json!({
        "timestamp": now_ms(),
        "displayMode": "60hz",
        "targetFrameTime": TARGET_FRAME_TIME_60HZ,
        "renderState": "idle",
        "gpuState": "sleeping",
        "framesDropped": 0,
        "avgFrameTime": 0.0,
        "avgInputLatency": 0.0,
        "isVSynced": true,
        "dpr": 1,
    })
}

/// Route a `render:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The one runtime DATA channel is served; every
/// other channel in the namespace (getConfig — served locally by rendererShims;
/// the frameMetrics/stateChange/inputEvent telemetry sinks; and the brief's
/// nonexistent render/optimize) returns Value::Null (honest degrade), so this is
/// safe to route by `channel.starts_with("render:")`.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "render:getSnapshot" => get_snapshot(),
        _ => Value::Null,
    }
}
