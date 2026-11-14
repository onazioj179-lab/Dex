// =============================================================================
// DEX Tauri — Adaptive Rendering read tier (port of core/AdaptiveRenderingEngine.ts,
// the `adaptive:*` IPC handlers).
//
// The Electron AdaptiveRenderingEngine is a LIVE engine: a 10s monitor loop folds
// real-time CPU/battery samples into a tier demotion/promotion state machine, and
// the renderer pushes activity (setRenderActive / setExportActive / setFocusedApp)
// that mutates that state and re-broadcasts the policy. None of that runtime exists
// on the Tauri main side (no monitor loop, no renderer activity reporter, no
// SystemProfiler instance holding `currentState`). This module ports ONLY the three
// read queries the renderer invokes, at the EXACT Electron return shapes, computing
// the underlying tier/load LIVE from system metrics (sysinfo + std) — the same
// approach as performance_tier.rs and resource_monitoring.rs. Nothing is persisted;
// every value is recomputed on each call. No new dependency is added.
//
// Storage note: the contract names `datastore-kv:adaptive`, but the Electron engine
// never reads or writes any store of its own — its policy is DERIVED from
// SystemProfiler (which persists `dex-system-profile`, not an `adaptive` key) and
// from in-memory activity flags. These three read channels therefore have NO
// persisted read-path state; there is nothing to fetch from kv:adaptive, so we
// compute live rather than invent a store. (kv_get/kv_set are intentionally unused.)
//
// PORTED (exact shape, matching registerIpcHandlers()):
//   - adaptive:getPolicy        -> RenderingPolicy (15 fields). The base tier is
//                                  SystemProfiler.getTier() (1|2|3); with no live
//                                  demotion state, effectiveTier == tier, exactly
//                                  what a freshly-constructed engine returns before
//                                  any setRenderActive/dynamicAdjustment runs.
//   - adaptive:getEffectiveTier -> number (policy.effectiveTier) = the base tier.
//   - adaptive:getSystemLoad    -> { cpuPercent, ramPercent, tier, onBattery,
//                                  renderActive, exportActive }.
//
// Tier computation mirrors SystemProfiler.calculateTier() exactly (the same scoring
// AdaptiveRenderingEngine's constructor consumes via systemProfiler.getTier()),
// fed by the natively-available metrics. policyForTier() is reproduced verbatim.
//
// DIVERGENCES (documented; values stay TRUTHFUL, nothing fabricated):
//   - calculateTier inputs without a native source default to the SAME values the
//     Tauri host actually has, mirroring sibling ports:
//       * gpu.isDedicated  = false  (no main-side GPU probe; identical to
//                                     performance_tier.rs's hasDiscreteGpu=false).
//       * storage.type     = "unknown" (no storage benchmark on this side; scores
//                             +10, the calculateTier 'unknown' branch).
//       * battery          = plugged in (sysinfo has no battery API and we add no
//                             crate — same stance as power.rs getStats; isPluggedIn
//                             true, so the battery -10 penalty does not apply and
//                             onBattery is false).
//       * backgroundProcessCount = -1 (the value SystemProfiler.updateSystemState
//                             itself uses on the monitoring path, where the
//                             expensive process count is skipped; < 200, no penalty).
//     RAM%/CPU% (the dynamic terms) ARE sampled live, so heavy-load tier
//     degradation is reproduced faithfully.
//   - getSystemLoad.onBattery is always false (see battery note). renderActive /
//     exportActive are always false: those flags are only ever set by the SKIPPED
//     setRenderActive / setExportActive channels, which have no host here, so the
//     engine's initial `false` is the steady, honest value.
//   - effectiveTier never diverges from tier: demotion/promotion is driven by the
//     monitor loop + activity flags (all SKIPPED / hostless), so the stateless read
//     always reports the base tier — the engine's pre-monitoring state.
//
// NOW PORTED (the four formerly-skipped heavy channels) — the in-memory engine
// runtime is rebuilt natively as a process-global, Mutex-guarded ENGINE state
// (std::sync::OnceLock + Mutex; no new dependency). This is the faithful analogue
// of the Electron singleton's mutable fields (isRenderingActive / isExportActive /
// focusedAppId / live backgroundCpuMaxPercent), persisting across IPC calls within
// the running process exactly as the Electron instance does:
//   - adaptive:setRenderActive(active)  -> set isRenderingActive, recalculatePolicy()
//                                          (re-derives backgroundCpuMaxPercent),
//                                          broadcast adaptive:policyChanged, return
//                                          the RenderingPolicy (15 fields).
//   - adaptive:setExportActive(active)  -> same, for isExportActive.
//   - adaptive:setFocusedApp(appId)     -> set focusedAppId, return the policy.
//   - adaptive:shouldYieldCpu()         -> live CPU% > backgroundProcessCpuCapPercent
//                                          (boolean) — recomputed from a fresh sample.
// recalculatePolicy() mirrors the Electron method verbatim: when render OR export is
// active, backgroundCpuMaxPercent = (effectiveTier===3 ? 5 : 10); otherwise the base
// policy value. The activity flags now also flow into adaptive:getPolicy /
// adaptive:getSystemLoad so all reads are mutually consistent with the writes.
//
// effectiveTier still tracks the live base tier (the demotion/promotion monitor loop
// that would diverge it is the 10s setInterval, which has no host here); battery and
// the monitor loop remain absent, matching the documented divergences below.
// =============================================================================

use crate::util::LockSafe;
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use sysinfo::System;

// --- process-global engine state (analogue of the Electron singleton's fields) ---

/// The mutable in-memory activity state the renderer drives via the four write/read
/// channels. Persists across IPC calls for the life of the process, exactly like the
/// Electron `adaptiveRenderer` singleton. `focused_app` defaults to "home" (the
/// Electron constructor default).
struct Engine {
    render_active: bool,
    export_active: bool,
    focused_app: String,
}

fn engine() -> &'static Mutex<Engine> {
    static ENGINE: OnceLock<Mutex<Engine>> = OnceLock::new();
    ENGINE.get_or_init(|| {
        Mutex::new(Engine {
            render_active: false,
            export_active: false,
            focused_app: "home".to_string(),
        })
    })
}

/// Read the current activity flags, recovering from a poisoned lock (a panic in a
/// prior holder must not wedge the whole namespace — fall back to the defaults).
fn read_activity() -> (bool, bool) {
    match engine().lock() {
        Ok(g) => (g.render_active, g.export_active),
        Err(p) => {
            let g = p.into_inner();
            (g.render_active, g.export_active)
        }
    }
}

// --- live system metrics ----------------------------------------------------

/// Sample CPU% and RAM% from live system metrics. CPU needs two refreshes a short
/// interval apart to yield a real delta (same idiom as resource_monitoring.rs /
/// power.rs). RAM% mirrors SystemProfiler: round(used / total * 100).
struct Load {
    cpu_percent: f64,
    ram_percent: i64,
    ram_gb: f64,
    cores: u64,
}

fn sample_load() -> Load {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu();
    sys.refresh_memory();

    let total = sys.total_memory().max(1); // bytes; avoid div-by-zero
    let used = sys.used_memory(); // bytes; total - available
    let cpu_percent = sys.global_cpu_info().cpu_usage() as f64; // 0..100
    let ram_percent = ((used as f64 / total as f64) * 100.0).round() as i64;
    // SystemProfiler: Math.round((totalmem / 1024^3) * 10) / 10.
    let ram_gb = ((total as f64 / (1024.0 * 1024.0 * 1024.0)) * 10.0).round() / 10.0;
    let cores = sys.cpus().len() as u64;

    Load { cpu_percent, ram_percent, ram_gb, cores }
}

// --- tier scoring (mirror of SystemProfiler.calculateTier) ------------------

/// calculateTier(hardware, state) from SystemProfiler.ts, fed by live metrics and
/// the documented native defaults for the inputs without a host source. Returns the
/// CapabilityTier 1|2|3 that AdaptiveRenderingEngine's constructor consumes.
fn calculate_tier(load: &Load) -> i64 {
    let mut score: i64 = 0;

    // RAM scoring (max 30).
    if load.ram_gb >= 16.0 {
        score += 30;
    } else if load.ram_gb >= 8.0 {
        score += 20;
    } else {
        score += 5;
    }

    // CPU scoring (max 30) — logicalThreads == os.cpus().length here.
    if load.cores >= 8 {
        score += 30;
    } else if load.cores >= 4 {
        score += 20;
    } else {
        score += 5;
    }

    // GPU scoring (max 20): isDedicated=false (no main-side probe) -> +8.
    score += 8;

    // Storage scoring (max 20): type="unknown" (no benchmark) -> +10.
    score += 10;

    // Dynamic adjustments from live state.
    if load.cpu_percent > 80.0 {
        score -= 15;
    } else if load.cpu_percent > 60.0 {
        score -= 8;
    }

    if load.ram_percent > 85 {
        score -= 10;
    } else if load.ram_percent > 70 {
        score -= 5;
    }

    // Battery: plugged in (no native battery source) -> no penalty.
    // backgroundProcessCount = -1 (monitoring-path default) -> not > 200, no penalty.

    if score >= 70 {
        1
    } else if score >= 40 {
        2
    } else {
        3
    }
}

// --- policy definitions (verbatim port of policyForTier) --------------------

/// policyForTier(tier): the full RenderingPolicy for a base tier. `maxFps:0` means
/// unlimited (Electron used 0). `timelineLongClipThresholdMin: Infinity` for tier 1
/// is emitted as a JSON number via f64::INFINITY -> serde renders it as null, which
/// is exactly how Electron's `Infinity` crosses IPC (JSON.stringify(Infinity)===null);
/// the renderer's `> threshold` comparisons treat that identically (never "long").
fn policy_for_tier(tier: i64) -> Value {
    match tier {
        1 => json!({
            "tier": 1,
            "effectiveTier": 1,
            "maxResolutionScale": 1.0,
            "maxPreviewResolution": 2160,
            "timelineAccuracy": "frame",
            "timelineLongClipThresholdMin": f64::INFINITY,
            "animationsEnabled": true,
            "maxFps": 0,
            "imagePreviewScale": 1.0,
            "imagePreviewDelayMs": 0,
            "gpuBudgetPercent": 80,
            "cpuMaxPercent": 90,
            "backgroundCpuMaxPercent": 70,
            "backgroundProcessCpuCapPercent": 15,
        }),
        3 => json!({
            "tier": 3,
            "effectiveTier": 3,
            "maxResolutionScale": 0.75,
            "maxPreviewResolution": 720,
            "timelineAccuracy": "keyframe",
            "timelineLongClipThresholdMin": 0,
            "animationsEnabled": false,
            "maxFps": 30,
            "imagePreviewScale": 0.5,
            "imagePreviewDelayMs": 0,
            "gpuBudgetPercent": 60,
            "cpuMaxPercent": 85,
            "backgroundCpuMaxPercent": 50,
            "backgroundProcessCpuCapPercent": 10,
        }),
        // Tier 2 is also the `default:` fallback in policyForTier (any non-1/3).
        _ => json!({
            "tier": 2,
            "effectiveTier": 2,
            "maxResolutionScale": 1.0,
            "maxPreviewResolution": 1080,
            "timelineAccuracy": "frame",
            "timelineLongClipThresholdMin": 30,
            "animationsEnabled": true,
            "maxFps": 60,
            "imagePreviewScale": 1.0,
            "imagePreviewDelayMs": 100,
            "gpuBudgetPercent": 80,
            "cpuMaxPercent": 90,
            "backgroundCpuMaxPercent": 70,
            "backgroundProcessCpuCapPercent": 15,
        }),
    }
}

// --- live policy assembly ---------------------------------------------------

/// Build the RenderingPolicy for the given base tier, then apply the live
/// recalculatePolicy() adjustment from the engine's activity flags. With no demotion
/// runtime, effectiveTier == tier, so policyForTier(tier) is the base; when render OR
/// export is active, backgroundCpuMaxPercent becomes (effectiveTier===3 ? 5 : 10),
/// matching the Electron recalculatePolicy() branch exactly.
fn current_policy(load: &Load) -> Value {
    let tier = calculate_tier(load);
    let mut policy = policy_for_tier(tier);
    let (render_active, export_active) = read_activity();
    if render_active || export_active {
        let bg = if tier == 3 { 5 } else { 10 };
        policy["backgroundCpuMaxPercent"] = json!(bg);
    }
    policy
}

// --- channel implementations ------------------------------------------------

/// adaptive:getPolicy — the current RenderingPolicy, reflecting the live activity
/// flags (effectiveTier == base tier; no demotion host).
fn get_policy(load: &Load) -> Value {
    current_policy(load)
}

/// adaptive:getSystemLoad — { cpuPercent, ramPercent, tier, onBattery,
/// renderActive, exportActive }. tier here is policy.effectiveTier (== base tier).
/// renderActive / exportActive now reflect the live engine flags set by the
/// setRenderActive / setExportActive channels.
fn get_system_load(load: &Load) -> Value {
    let tier = calculate_tier(load);
    let (render_active, export_active) = read_activity();
    json!({
        "cpuPercent": load.cpu_percent,
        "ramPercent": load.ram_percent,
        "tier": tier,
        "onBattery": false,
        "renderActive": render_active,
        "exportActive": export_active,
    })
}

/// adaptive:setRenderActive(active) / adaptive:setExportActive(active). Mutate the
/// corresponding activity flag, run recalculatePolicy() (re-derive the live policy),
/// broadcast `adaptive:policyChanged` to the renderer (Electron's
/// webContents.send(...)), and return the new RenderingPolicy. `active` is args[0]
/// (boolean; truthy coercion mirrors JS — any non-false/non-null value is true,
/// defaulting to false when omitted).
fn set_activity(app: &tauri::AppHandle, args: &Value, is_export: bool) -> Value {
    let active = match args.get(0) {
        Some(Value::Bool(b)) => *b,
        Some(Value::Null) | None => false,
        Some(other) => !other.is_null(), // JS-truthy: any present non-null value
    };
    {
        let mut g = engine().lock_safe();
        if is_export {
            g.export_active = active;
        } else {
            g.render_active = active;
        }
    }
    // recalculatePolicy(): re-derive from live flags + base tier, then broadcast.
    let policy = current_policy(&sample_load());
    crate::native_ops::emit_event(app, "adaptive:policyChanged", &policy);
    policy
}

/// adaptive:setFocusedApp(appId). Store the focused app id (args[0], string;
/// defaults to "home" when missing/non-string, the Electron field default) and
/// return the current policy unchanged — exactly what the Electron handler does.
fn set_focused_app(load: &Load, args: &Value) -> Value {
    let app_id = match args.get(0).and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => "home".to_string(),
    };
    {
        let mut g = engine().lock_safe();
        g.focused_app = app_id;
    }
    current_policy(load)
}

/// adaptive:shouldYieldCpu() -> boolean. Live CPU% compared against the current
/// policy's backgroundProcessCpuCapPercent, mirroring the Electron handler
/// (cpuUsage > policy.backgroundProcessCpuCapPercent). Uses the same sampled load
/// for both the CPU reading and the policy derivation so the comparison is coherent.
fn should_yield_cpu(load: &Load) -> Value {
    let policy = current_policy(load);
    let cap = policy
        .get("backgroundProcessCpuCapPercent")
        .and_then(|v| v.as_f64())
        .unwrap_or(15.0);
    json!(load.cpu_percent > cap)
}

/// Route an `adaptive:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts); these three reads take no arguments. Every channel in
/// the namespace is accounted for: the four heavy channels and any unknown one fall
/// to `_ => Value::Null` (honest degrade), so prefix-routing the namespace is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "adaptive:getPolicy" => get_policy(&sample_load()),
        "adaptive:getEffectiveTier" => json!(calculate_tier(&sample_load())),
        "adaptive:getSystemLoad" => get_system_load(&sample_load()),
        // Formerly-skipped heavy channels, now backed by the process-global engine.
        "adaptive:setRenderActive" => set_activity(app, args, false),
        "adaptive:setExportActive" => set_activity(app, args, true),
        "adaptive:setFocusedApp" => set_focused_app(&sample_load(), args),
        "adaptive:shouldYieldCpu" => should_yield_cpu(&sample_load()),
        _ => Value::Null,
    }
}
