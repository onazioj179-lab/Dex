// =============================================================================
// DEX Tauri — Input subsystem (port of the `input:*` IPC handlers in
// src/main/core/InputLatencyController.ts).
//
// PROMPT-vs-REALITY NOTE (read first):
// The task brief named channel `getState`, a `datastore-kv:input` store, and
// heavy channels subscribe/unsubscribe/simulate. None of those exist in the
// codebase. The real `input:*` namespace is the InputLatencyController, which is
// PURE IN-MEMORY RUNTIME TELEMETRY with NO persistent storage at all. Its IPC
// surface is:
//   - input:getSnapshot (handle)  -> InputLatencySnapshot   [DATA]
//   - input:getTargets  (handle)  -> INPUT_TARGETS constant  [DATA]
//   - input:shouldDefer (handle)  -> boolean                 [runtime compute]
//   - input:event       (send)    -> telemetry sink, returns void
//   - input:latency     (send)    -> telemetry sink, returns void
// So there is no CRUD/store key to mirror; the "data surface" is two read-only
// handlers. This module ports those two.
//
// PORTED channels & exact shapes:
//   - input:getTargets  -> the INPUT_TARGETS object, field-for-field (all the
//                          MAX_*/PRIORITY_*/*_THRESHOLD/*_DEBOUNCE/SAMPLE/REPORT
//                          numbers). This is a frozen compile-time constant in
//                          Electron, reproduced verbatim here.
//   - input:getSnapshot -> InputLatencySnapshot:
//                          { timestamp, avgTypingLatency, avgScrollLatency,
//                            avgClickLatency, p99TypingLatency, p99ScrollLatency,
//                            inputsDeferred, inputsCanceled, isResponsive }
//
// DIVERGENCE (documented, honest — no fabricated data):
//   getSnapshot() is computed from the controller's in-memory latency arrays,
//   which are filled ONLY by the native collector reacting to input:event /
//   input:latency. Under Tauri there is no such collector: those two channels
//   are accept-and-discard telemetry sinks (see rendererShims TELEMETRY_SINKS),
//   so the latency arrays are always empty. Feeding empty arrays through the
//   SAME getSnapshot() logic yields, deterministically:
//     avg* = 0, p99* = 0, inputsDeferred = 0, inputsCanceled = 0, and
//     isResponsive = true (0 <= every MAX_* target). Only `timestamp` is live.
//   This is the exact output of the ported function over the state that actually
//   exists on Tauri — identical to the renderer's own absent-channel fallback —
//   not an invented value. If a native input collector is added later, swap the
//   empty-state computation for real rolling-window data.
//
//   (input:shouldDefer, input:event, input:latency are NOT ported here — they
//   are already served by rendererShims as `false` / telemetry sinks, and the
//   first two need a native runtime collector. They are reported as skipped.)
// =============================================================================

use serde_json::{json, Value};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// INPUT_TARGETS — verbatim from InputLatencyController.ts. Frozen constant.
fn get_targets() -> Value {
    json!({
        "MAX_TYPING_LATENCY_MS": 16,
        "MAX_CURSOR_LATENCY_MS": 8,
        "MAX_SCROLL_LATENCY_MS": 8,
        "MAX_CLICK_LATENCY_MS": 16,
        "MAX_KEYDOWN_LATENCY_MS": 8,

        "PRIORITY_KEYBOARD": 1,
        "PRIORITY_POINTER": 2,
        "PRIORITY_SCROLL": 2,
        "PRIORITY_WINDOW": 3,
        "PRIORITY_BACKGROUND": 10,

        "DEFER_THRESHOLD_MS": 4,
        "CANCEL_THRESHOLD_MS": 16,
        "INPUT_DEBOUNCE_MS": 8,

        "LATENCY_SAMPLE_SIZE": 100,
        "LATENCY_REPORT_INTERVAL_MS": 5000,
    })
}

// getSnapshot() over the empty latency arrays that exist on Tauri (see header).
// calculateAverage([]) === 0 and calculatePercentile([], _) === 0, so every
// latency field is 0; isResponsive is `0 <= MAX_*` for all three checked targets
// (typing 16, scroll 8, click 16) -> true. Only timestamp is live.
fn get_snapshot() -> Value {
    let avg_typing = 0.0_f64;
    let avg_scroll = 0.0_f64;
    let avg_click = 0.0_f64;

    let is_responsive = avg_typing <= 16.0 && avg_scroll <= 8.0 && avg_click <= 16.0;

    json!({
        "timestamp": now_ms(),
        "avgTypingLatency": avg_typing,
        "avgScrollLatency": avg_scroll,
        "avgClickLatency": avg_click,
        "p99TypingLatency": 0,
        "p99ScrollLatency": 0,
        "inputsDeferred": 0,
        "inputsCanceled": 0,
        "isResponsive": is_responsive,
    })
}

/// Route an `input:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Data channels are served; runtime/telemetry
/// channels that need a native collector return Value::Null (honest degrade —
/// the renderer already has local fallbacks for them).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "input:getTargets" => get_targets(),
        "input:getSnapshot" => get_snapshot(),
        _ => Value::Null,
    }
}
