// =============================================================================
// DEX Tauri — Motion subsystem (port of the `motion:*` channels in
// src/main/core/MotionController.ts).
//
// NOTE ON SOURCE NAME: the porting task named the Electron source as
// `MotionAnimation.ts`; that file does not exist in the tree. The actual owner
// of the `motion:*` IPC channels is `src/main/core/MotionController.ts`, which
// is what this port mirrors.
//
// NOTE ON CHANNEL NAMES: the task lists heavy channels `animate` and `stop`.
// Electron has no literal `motion:animate` / `motion:stop` handlers — the live
// animation runtime is driven through the lifecycle channels MotionController
// actually registers:
//   - motion:requestAnimation  (approve + adjust an animation; the "animate"
//                               entry point — this is the heavy path that runs
//                               the performance tier check and mutates counters)
//   - motion:animationStart    (active-animation counter ++)
//   - motion:animationEnd      (active-animation counter --; the "stop" path)
// So `animate` is ported as the requestAnimation/animationStart entry point and
// `stop` as the animationEnd entry point, plus the bare `motion:animate` /
// `motion:stop` aliases so either spelling routes correctly.
//
// NOTE ON STORAGE: MotionController holds its counters in memory. Under Tauri the
// dispatcher is stateless across calls, so the live counters (activeAnimations,
// animationsBlocked) are persisted in the kv file under MOTION_KEY and read back
// by motion:getState — same contract, just durable instead of per-process RAM.
//
// HEAVY native work done here (previously skipped, now real):
//   - performance tier detection: the live `motionState` "reduced" tier comes
//     from a native CPU/memory sampler (MotionController.performanceReducedMotion,
//     fed by ResourceGovernor against REDUCED_MOTION_CPU_THRESHOLD = 50% and
//     REDUCED_MOTION_MEMORY_THRESHOLD_MB = 1800). That is reproduced here with a
//     real sysinfo CPU+memory sample (precedent: adaptive_ctl.rs sample_load).
//   - approval math: the exact MOTION_DISCIPLINE duration clamps + reduced-mode
//     halving + easing selection from approveAnimation().
//   - counter mutation + durable persistence via crate::kv_get / crate::kv_set.
//   - renderer push: motion:stateChanged is broadcast via
//     crate::native_ops::emit_event (Electron's webContents.send analog).
//
// DATA channels PORTED:
//   - motion:getState         -> { state, activeAnimations, animationsBlocked }
//   - motion:getConfig        -> full MotionConfig
//   - motion:requestAnimation -> AnimationApproval  (alias: motion:animate)
//   - motion:animationStart   -> Value::Null (void sink, counter ++)
//   - motion:animationEnd     -> Value::Null (void sink, counter --; alias stop)
//   - motion:stop             -> Value::Null (alias of animationEnd)
//   - motion:prefersReduced   -> Value::Null (void sink, persists preference)
// =============================================================================

use serde_json::{json, Value};

// --- MOTION DISCIPLINE constants (mirror MotionController.ts MOTION_DISCIPLINE)
const MAX_FADE_DURATION: i64 = 180;
const MAX_SLIDE_DURATION: i64 = 180;
const MAX_SCALE_DURATION: i64 = 150;
const MIN_ANIMATION_DURATION: i64 = 50;
const REDUCED_MOTION_CPU_THRESHOLD: f64 = 50.0; // disable-tier CPU percent
const REDUCED_MOTION_MEMORY_THRESHOLD_MB: f64 = 1800.0; // reduced-tier memory MB

const EASING_STANDARD: &str = "cubic-bezier(0.2, 0, 0, 1)";
const EASING_ENTER: &str = "cubic-bezier(0, 0, 0.2, 1)";
const EASING_INSTANT: &str = "linear";

const ALLOWED_MOTION: [&str; 4] = ["fade", "slide", "scale-subtle", "focus-ring"];

/// kv key holding the durable runtime counters + last-known preference.
const MOTION_KEY: &str = "motion-runtime";

// -----------------------------------------------------------------------------
// Durable runtime state (the in-memory counters the Electron controller owned).
// -----------------------------------------------------------------------------

/// Read the persisted runtime blob, defaulting every field.
fn load_runtime(app: &tauri::AppHandle) -> (i64, i64, bool) {
    let v = crate::kv_get(app, MOTION_KEY);
    let active = v
        .get("activeAnimations")
        .and_then(|x| x.as_i64())
        .unwrap_or(0)
        .max(0);
    let blocked = v
        .get("animationsBlocked")
        .and_then(|x| x.as_i64())
        .unwrap_or(0)
        .max(0);
    let prefers = v
        .get("prefersReducedMotion")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    (active, blocked, prefers)
}

fn save_runtime(app: &tauri::AppHandle, active: i64, blocked: i64, prefers: bool) {
    crate::kv_set(
        app,
        MOTION_KEY,
        json!({
            "activeAnimations": active.max(0),
            "animationsBlocked": blocked.max(0),
            "prefersReducedMotion": prefers,
        }),
    );
}

// -----------------------------------------------------------------------------
// Performance tier — REAL native CPU/memory sampler.
// -----------------------------------------------------------------------------

/// Sample current load. Returns (cpu_percent 0..100, used_memory_mb).
/// Mirrors adaptive_ctl.rs::sample_load — double CPU refresh with the minimum
/// interval so the second read is a real delta, not a 0.
fn sample_load() -> (f64, f64) {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu();
    sys.refresh_memory();

    let cpu_percent = sys.global_cpu_info().cpu_usage() as f64; // 0..100
    let used_mb = sys.used_memory() as f64 / (1024.0 * 1024.0); // bytes -> MB
    (cpu_percent, used_mb)
}

/// Whether performance load forces the "reduced" tier. This is the native work
/// MotionController received from ResourceGovernor: CPU at/over the threshold OR
/// memory at/over the threshold degrades motion.
fn performance_reduced() -> bool {
    let (cpu, used_mb) = sample_load();
    cpu >= REDUCED_MOTION_CPU_THRESHOLD || used_mb >= REDUCED_MOTION_MEMORY_THRESHOLD_MB
}

/// Resolve the live motion state with the SAME priority as updateMotionState():
///   prefers-reduced -> "disabled" (highest priority)
///   else performance load -> "reduced"
///   else -> "full"
fn resolve_state(prefers_reduced: bool) -> &'static str {
    if prefers_reduced {
        "disabled"
    } else if performance_reduced() {
        "reduced"
    } else {
        "full"
    }
}

// -----------------------------------------------------------------------------
// Data channels.
// -----------------------------------------------------------------------------

/// motion:getState — mirror the Electron handler's exact return shape, now with
/// the real performance tier and the durable counters.
fn get_state(app: &tauri::AppHandle) -> Value {
    let (active, blocked, prefers) = load_runtime(app);
    json!({
        "state": resolve_state(prefers),
        "activeAnimations": active,
        "animationsBlocked": blocked,
    })
}

/// motion:getConfig — mirror MotionController.getConfig() exactly.
fn get_config(app: &tauri::AppHandle) -> Value {
    let (_active, _blocked, prefers) = load_runtime(app);
    let state = resolve_state(prefers);
    let max_duration = match state {
        "disabled" => 0,
        "reduced" => 90,
        _ => MAX_FADE_DURATION,
    };
    let easing = if state == "disabled" {
        EASING_INSTANT
    } else {
        EASING_STANDARD
    };
    json!({
        "state": state,
        "prefersReducedMotion": prefers,
        "systemReducedMotion": prefers,
        // performanceReducedMotion reflects whether load (not the OS pref) drove
        // the reduced tier — true only when the state is "reduced".
        "performanceReducedMotion": state == "reduced",
        "maxDuration": max_duration,
        "easing": easing,
    })
}

/// Broadcast the current config to the renderer — Electron's
/// broadcastMotionState() / webContents.send('motion:stateChanged', config).
fn broadcast_state(app: &tauri::AppHandle) {
    let config = get_config(app);
    crate::native_ops::emit_event(app, "motion:stateChanged", &config);
}

/// motion:requestAnimation (a.k.a. the "animate" entry point) — approve/adjust an
/// animation request. Faithful port of approveAnimation(): runs the live state
/// (including the native performance tier), applies the discipline clamps,
/// mutates the durable counters, and returns the exact AnimationApproval shape.
///
/// On approval the active-animation counter is incremented (mirroring the paired
/// motion:animationStart the renderer would otherwise fire). The matching `stop`
/// channel decrements it.
fn request_animation(app: &tauri::AppHandle, args: &Value) -> Value {
    let req = args.get(0).cloned().unwrap_or(Value::Null);
    let req_type = req
        .get("type")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let duration_ms = req
        .get("durationMs")
        .and_then(|x| x.as_i64())
        .unwrap_or(0);

    let (mut active, mut blocked, prefers) = load_runtime(app);
    let state = resolve_state(prefers);

    // Motion disabled -> block.
    if state == "disabled" {
        blocked += 1;
        save_runtime(app, active, blocked, prefers);
        return json!({
            "approved": false,
            "adjustedDuration": 0,
            "easing": EASING_INSTANT,
            "reason": "Motion disabled (reduced-motion preference)",
        });
    }

    // Disallowed motion type -> block.
    if !ALLOWED_MOTION.contains(&req_type.as_str()) {
        blocked += 1;
        save_runtime(app, active, blocked, prefers);
        return json!({
            "approved": false,
            "adjustedDuration": 0,
            "easing": EASING_INSTANT,
            "reason": format!("Motion type \"{}\" is not allowed", req_type),
        });
    }

    // Apply per-type duration ceiling.
    let mut adjusted = match req_type.as_str() {
        "fade" => duration_ms.min(MAX_FADE_DURATION),
        "slide" => duration_ms.min(MAX_SLIDE_DURATION),
        "scale-subtle" => duration_ms.min(MAX_SCALE_DURATION),
        "focus-ring" => duration_ms.min(100),
        _ => duration_ms,
    };
    // Apply the minimum-duration floor.
    adjusted = adjusted.max(MIN_ANIMATION_DURATION);
    // Halve further when the live state is the reduced tier.
    if state == "reduced" {
        adjusted = (adjusted as f64 * 0.5).floor() as i64;
    }

    let easing = if req_type == "fade" {
        EASING_ENTER
    } else {
        EASING_STANDARD
    };

    // Approved -> this animation is now active.
    active += 1;
    save_runtime(app, active, blocked, prefers);

    json!({
        "approved": true,
        "adjustedDuration": adjusted,
        "easing": easing,
    })
}

/// motion:animationStart — fire-and-forget counter ++ (void sink).
fn animation_start(app: &tauri::AppHandle) -> Value {
    let (active, blocked, prefers) = load_runtime(app);
    save_runtime(app, active + 1, blocked, prefers);
    Value::Null
}

/// motion:animationEnd (a.k.a. the "stop" entry point) — counter -- (void sink),
/// clamped at 0 just like Math.max(0, activeAnimations - 1).
fn animation_end(app: &tauri::AppHandle) -> Value {
    let (active, blocked, prefers) = load_runtime(app);
    save_runtime(app, (active - 1).max(0), blocked, prefers);
    Value::Null
}

/// motion:prefersReduced — record the renderer's reduced-motion preference and
/// rebroadcast the resulting config (void sink, mirrors the Electron `on`
/// handler that set the flag + updateMotionState()).
fn prefers_reduced(app: &tauri::AppHandle, args: &Value) -> Value {
    let prefers = args.get(0).and_then(|x| x.as_bool()).unwrap_or(false);
    let (active, blocked, _) = load_runtime(app);
    save_runtime(app, active, blocked, prefers);
    broadcast_state(app);
    Value::Null
}

/// Route a `motion:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The heavy animate/stop lifecycle is now ported on
/// top of a durable, performance-aware backend; unknown channels degrade to
/// Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "motion:getState" => get_state(app),
        "motion:getConfig" => get_config(app),

        // "animate" entry point + its bare alias.
        "motion:requestAnimation" | "motion:animate" => {
            let result = request_animation(app, args);
            broadcast_state(app);
            result
        }

        // Active-animation lifecycle sinks.
        "motion:animationStart" => animation_start(app),

        // "stop" entry point + its bare alias.
        "motion:animationEnd" | "motion:stop" => animation_end(app),

        // Reduced-motion preference sink.
        "motion:prefersReduced" => prefers_reduced(app, args),

        _ => Value::Null,
    }
}
