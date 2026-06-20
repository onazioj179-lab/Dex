// =============================================================================
// DEX Tauri — Input subsystem (port of the `input:*` IPC handlers in
// src/main/core/InputLatencyController.ts).
//
// The real `input:*` namespace is the InputLatencyController — pure in-memory
// runtime telemetry with NO persistent storage. Its IPC surface is:
//   - input:getTargets  (handle)  -> INPUT_TARGETS constant      [DATA]
//   - input:getSnapshot (handle)  -> InputLatencySnapshot        [runtime read]
//   - input:shouldDefer (handle)  -> boolean                     [runtime compute]
//   - input:event       (send)    -> records an InputEvent, void
//   - input:latency     (send)    -> records a LatencyMeasurement, void
//
// HEAVY CHANNELS — now implemented with REAL native state (this round):
//   Earlier the write channels (input:event / input:latency) were accept-and-
//   discard sinks and the reads returned a hard-coded empty snapshot. They are
//   now backed by a process-global singleton (std::sync OnceLock + Mutex; no new
//   dependency) that mirrors the Electron controller's fields field-for-field:
//   rolling keyboard/scroll/pointer latency arrays (capped at LATENCY_SAMPLE_SIZE),
//   lastInputTime/lastInputType, and the inputsDeferred/inputsCanceled counters.
//   This is the faithful analogue of the Electron `InputLatencyController`
//   singleton: state persists across IPC calls for the life of the process, and
//   getSnapshot()/shouldDefer() compute over the LIVE data the renderer feeds in
//   (not a stubbed zero). `getState` is accepted as an alias for getSnapshot
//   (the brief's generic read-channel name; the controller's only state read is
//   the snapshot).
//
// FIDELITY NOTES:
//   - recordInputEvent mirrors the Electron logic exactly: lastInputTime is set
//     from the event's own timestamp, then `timeSinceLastInput = Date.now() -
//     lastInputTime` decides deferral (< DEFER_THRESHOLD_MS) and cancellation
//     (priority === 1 && < CANCEL_THRESHOLD_MS), bumping the same counters.
//   - The Electron defer/cancel CALLBACKS are in-process background-task hooks
//     (deferCallbacks / cancelCallbacks), not renderer sends, so there is no
//     webContents.send to emit here; faithfully, only the counters move. No
//     renderer event is fabricated.
//   - calculateAverage/calculatePercentile reproduce the Electron arithmetic
//     verbatim (empty -> 0; percentile index = ceil(p/100 * len) - 1, clamped).
// =============================================================================

use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// INPUT_TARGETS — verbatim from InputLatencyController.ts. Frozen constant.
const MAX_TYPING_LATENCY_MS: f64 = 16.0;
const MAX_SCROLL_LATENCY_MS: f64 = 8.0;
const MAX_CLICK_LATENCY_MS: f64 = 16.0;
const DEFER_THRESHOLD_MS: i64 = 4;
const CANCEL_THRESHOLD_MS: i64 = 16;
const LATENCY_SAMPLE_SIZE: usize = 100;

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

// --- process-global controller state (analogue of the Electron singleton) ---

/// The mutable in-memory telemetry the renderer drives via input:event /
/// input:latency and reads back via getSnapshot / shouldDefer. Persists across
/// IPC calls for the life of the process, exactly like the Electron
/// `InputLatencyController` singleton.
struct Controller {
    keyboard_latencies: Vec<f64>,
    scroll_latencies: Vec<f64>,
    pointer_latencies: Vec<f64>,
    inputs_deferred: i64,
    inputs_canceled: i64,
    last_input_time: i64,
    last_input_type: Option<String>,
}

fn controller() -> &'static Mutex<Controller> {
    static CTL: OnceLock<Mutex<Controller>> = OnceLock::new();
    CTL.get_or_init(|| {
        Mutex::new(Controller {
            keyboard_latencies: Vec::new(),
            scroll_latencies: Vec::new(),
            pointer_latencies: Vec::new(),
            inputs_deferred: 0,
            inputs_canceled: 0,
            last_input_time: 0,
            last_input_type: None,
        })
    })
}

/// Lock the controller, recovering from a poisoned lock (a panic in a prior
/// holder must not wedge the whole namespace).
fn lock_ctl() -> std::sync::MutexGuard<'static, Controller> {
    match controller().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    }
}

fn calculate_average(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

fn calculate_percentile(values: &[f64], percentile: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    // index = ceil((p/100) * len) - 1, clamped to >= 0 (matches Electron)
    let raw = ((percentile / 100.0) * sorted.len() as f64).ceil() as i64 - 1;
    let idx = raw.max(0) as usize;
    let idx = idx.min(sorted.len() - 1);
    sorted[idx]
}

// input:event — record an InputEvent. Mirrors recordInputEvent(). Void return.
//   InputEvent: { type: string, timestamp: number, priority: number }
fn record_input_event(args: &Value) {
    let input = args.get(0).cloned().unwrap_or(Value::Null);
    let ev_type = input
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("other")
        .to_string();
    // Electron sets lastInputTime = input.timestamp.
    let ev_timestamp = input
        .get("timestamp")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(now_ms);
    let priority = input.get("priority").and_then(|v| v.as_i64()).unwrap_or(0);

    let mut c = lock_ctl();
    c.last_input_time = ev_timestamp;
    c.last_input_type = Some(ev_type);

    // timeSinceLastInput = Date.now() - lastInputTime (verbatim Electron logic).
    let time_since = now_ms() - c.last_input_time;
    if time_since < DEFER_THRESHOLD_MS {
        c.inputs_deferred += 1; // triggerDeferral(): only the counter is process-local
    }
    if priority == 1 && time_since < CANCEL_THRESHOLD_MS {
        c.inputs_canceled += 1; // triggerCancellation(): counter only
    }
}

// input:latency — record a LatencyMeasurement. Mirrors recordLatency(). Void.
//   LatencyMeasurement: { type: string, inputTime, renderTime, latencyMs }
fn record_latency(args: &Value) {
    let m = args.get(0).cloned().unwrap_or(Value::Null);
    let m_type = m.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let latency = m.get("latencyMs").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let mut c = lock_ctl();
    let bucket = match m_type {
        "keyboard" => Some(&mut c.keyboard_latencies),
        "scroll" => Some(&mut c.scroll_latencies),
        "pointer" => Some(&mut c.pointer_latencies),
        _ => None,
    };
    if let Some(arr) = bucket {
        arr.push(latency);
        if arr.len() > LATENCY_SAMPLE_SIZE {
            arr.remove(0); // .shift()
        }
    }
}

// input:shouldDefer — mirrors shouldDeferWork(). Returns boolean.
fn should_defer() -> bool {
    let c = lock_ctl();
    if c.last_input_time == 0 {
        return false;
    }
    let time_since = now_ms() - c.last_input_time;
    time_since < DEFER_THRESHOLD_MS
}

// getSnapshot()/getState — InputLatencySnapshot computed over LIVE arrays.
fn get_snapshot() -> Value {
    let c = lock_ctl();
    let avg_typing = calculate_average(&c.keyboard_latencies);
    let avg_scroll = calculate_average(&c.scroll_latencies);
    let avg_click = calculate_average(&c.pointer_latencies);
    let p99_typing = calculate_percentile(&c.keyboard_latencies, 99.0);
    let p99_scroll = calculate_percentile(&c.scroll_latencies, 99.0);

    let is_responsive = avg_typing <= MAX_TYPING_LATENCY_MS
        && avg_scroll <= MAX_SCROLL_LATENCY_MS
        && avg_click <= MAX_CLICK_LATENCY_MS;

    json!({
        "timestamp": now_ms(),
        "avgTypingLatency": avg_typing,
        "avgScrollLatency": avg_scroll,
        "avgClickLatency": avg_click,
        "p99TypingLatency": p99_typing,
        "p99ScrollLatency": p99_scroll,
        "inputsDeferred": c.inputs_deferred,
        "inputsCanceled": c.inputs_canceled,
        "isResponsive": is_responsive,
    })
}

/// Route an `input:*` channel. Args are the positional JSON array the renderer
/// sent. Read channels return data; write (telemetry) channels mutate the
/// process-global controller and return Value::Null (void, as in Electron).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "input:getTargets" => get_targets(),
        // getState is the brief's generic read name; the controller's sole state
        // read is the snapshot, so it aliases getSnapshot.
        "input:getSnapshot" | "input:getState" | "getState" => get_snapshot(),
        "input:shouldDefer" => Value::Bool(should_defer()),
        "input:event" => {
            record_input_event(args);
            Value::Null
        }
        "input:latency" => {
            record_latency(args);
            Value::Null
        }
        _ => Value::Null,
    }
}
