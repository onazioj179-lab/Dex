// =============================================================================
// DEX Tauri — Enforce subsystem (port of the `enforce:*` IPC handlers in
// core/PerformanceEnforcer.ts).
//
// IMPORTANT scope note. PerformanceEnforcer is a LIVE runtime monitor, not a
// data store. Almost all of its `enforce:*` surface depends on a 30s setInterval
// loop sampling frame time / CPU / memory and broadcasting `enforce:action` to
// windows. None of that survives a stateless dispatch and none of it is pure
// data, so it is NOT ported (see channelsSkipped). The one channel that is
// genuinely pure data is the policy getter:
//
//   - enforce:getGuarantees -> the static GUARANTEES object (the performance
//     "policy": memory/cpu/frame/latency/jank/session ceilings). In Electron
//     this is a frozen `as const` constant returned verbatim; here we emit the
//     identical literal. This is the spec's `getPolicy` DATA channel for this
//     subsystem (the namespace exposes no channel literally named getPolicy —
//     getGuarantees IS the policy getter).
//
// One adjacent read-only channel is also handled honestly:
//   - enforce:getBaseline -> the established PerformanceBaseline or null.
//     Electron keeps this in memory and it is null until the 5-minute baseline
//     timer fires; with no runtime loop we can never establish it in-process, so
//     we read a persisted baseline from the DataStore-KV `enforce` key (the
//     storage backbone named in the port spec, dex-kv.json via crate::kv_get)
//     and otherwise return null — exactly the renderer's default-state value.
//
// Storage: DataStore-KV, key "enforce" (crate::kv_get). Mirrors the rule_engine
// port's use of crate::kv_get/kv_set against the same native KV file.
//
// DIVERGENCES (documented):
//   - getSnapshot / check are runtime-only (they read live sampled metrics and,
//     for check, drive the enforcement loop + broadcast side-effects). Returning
//     a fabricated "all passing" snapshot would be a lie about the machine's
//     real state, so they are skipped, not faked.
//   - enforce:metrics / reportMetrics is an ipcMain.on fire-and-forget that only
//     mutates in-memory sampling counters; with no loop to consume them there is
//     nothing to record. Skipped (returns null; renderer ignores the result).
//   - GUARANTEES values are emitted as the same JSON numbers Electron sent over
//     IPC (e.g. TARGET_FRAME_TIME_MS = 8.33). serde emits them identically.
// =============================================================================

use serde_json::{json, Value};

const ENFORCE_KEY: &str = "enforce";

// Mirror of GUARANTEES in PerformanceEnforcer.ts, field-for-field. This is the
// frozen policy object the renderer receives from enforce:getGuarantees.
fn guarantees() -> Value {
    json!({
        // Memory (hard ceilings)
        "MAX_MEMORY_MB": 2048,
        "MEMORY_GROWTH_MB_PER_HOUR": 10,
        // CPU (idle floor)
        "MAX_IDLE_CPU_PERCENT": 0.5,
        "MAX_ACTIVE_CPU_PERCENT": 25,
        // GPU (idle floor)
        "MAX_IDLE_GPU_ACTIVITY": 0,
        // Frame timing (smoothness)
        "TARGET_FRAME_TIME_MS": 8.33,
        "MAX_FRAME_TIME_MS": 16.67,
        "MAX_FRAME_VARIANCE": 2,
        "MAX_JANK_FRAMES_PER_MINUTE": 3,
        // Input latency (responsiveness)
        "MAX_TYPING_LATENCY_MS": 16,
        "MAX_SCROLL_LATENCY_MS": 8,
        "MAX_CLICK_LATENCY_MS": 16,
        // Long-session stability
        "MAX_PERFORMANCE_DEGRADATION_PERCENT": 10,
        "SESSION_STABILITY_HOURS": 24,
    })
}

// enforce:getBaseline — Electron returns `this.baseline`, a PerformanceBaseline
// or null. With no in-process sampling loop we read any persisted baseline from
// the DataStore-KV `enforce` key and otherwise return null (the default state).
fn get_baseline(app: &tauri::AppHandle) -> Value {
    match crate::kv_get(app, ENFORCE_KEY) {
        Value::Object(o) => o
            .get("baseline")
            .cloned()
            .unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

/// Route an `enforce:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Pure-data channels are answered; runtime-only and
/// fire-and-forget channels return Value::Null (honest degrade — see header).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // The policy getter (spec: getPolicy).
        "enforce:getGuarantees" => guarantees(),
        // Read-only baseline, persisted-or-null.
        "enforce:getBaseline" => get_baseline(_app),
        // Everything else in the namespace is runtime-only; degrade to null.
        _ => Value::Null,
    }
}
