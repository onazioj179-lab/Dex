// =============================================================================
// DEX Tauri — Thermal subsystem (port of the `thermal:*` IPC handlers in
// ThermalPowerManager.ts).
//
// NOTE ON NAMING: the port contract named the source `ThermalManagement.ts` and
// the data channel `getStatus`. The real Electron source is
// `src/main/core/ThermalPowerManager.ts`, and its sole read-only DATA channel is
// `thermal:getSnapshot` (registered via ipcMain.handle). That is the channel
// ported here — it is the "getStatus" of this subsystem. The two remaining
// channels are fire-and-forget live-state mutators (the "throttle" class) and
// are NOT ported (see channelsSkipped / dispatch).
//
// STORAGE: the manager's READ channel (getSnapshot) is a pure live read. Its two
// WRITE channels (`thermal:gpu-active`, `thermal:report-cpu`) mutate fields that
// getSnapshot() returns (gpuPowerMode, thermal.cpuPercent). In Electron those
// mutations live in the singleton's memory; a stateless dispatch has no such
// memory, so to make the port COHERENT (a gpu-active write actually shows up in a
// later getSnapshot, exactly as in Electron) we persist ONLY those two
// write-channel fields into a small `thermal` KV blob via crate::kv_get/kv_set:
//   { "gpuPowerMode": "low-power"|"high-performance", "cpuPercent": <number> }
// All other snapshot fields remain pure live/seed reads (no storage) as before.
// This is the minimal state needed to honour the write channels; we do NOT
// fabricate any field the manager itself never wrote.
//
// SHAPE (ThermalPowerSnapshot, getSnapshot() in ThermalPowerManager.ts; match
// exactly, no invented fields):
//   { thermal: { state, temperatureC, baselineC, cpuPercent, timestamp },
//     power:   { state, batteryPercent, isCharging, isDesktop, timestamp },
//     gpuPowerMode, backgroundWorkerReduction, gameFrameCap,
//     gameResolutionStep, animationScale, writeCoalesceMs }
//   ThermalState = 'cool'|'warm'|'hot'|'critical'
//   PowerState   = 'ac'|'battery-above-50'|'battery-20-50'|'battery-below-20'
//                  |'battery-below-5'
//
// DIVERGENCES (documented):
//   - The snapshot is the manager's LIVE in-memory state, which only departs
//     from its boot seed once the native monitoring loop (cpuTemperature /
//     currentLoad / battery polling + powerMonitor) runs and applyThermalState /
//     applyPowerState mutate the throttle fields. A stateless dispatch carries no
//     such loop, so every throttle-derived field reflects the constructor's seed:
//       gpuPowerMode "low-power", backgroundWorkerReduction 0, gameFrameCap 0,
//       gameResolutionStep 0, animationScale 1, writeCoalesceMs 100,
//       thermal.state "cool", thermal.temperatureC 0, thermal.baselineC 0,
//       power.state "ac", power.batteryPercent 100, power.isCharging false,
//       power.isDesktop true.
//     These are exactly the values getSnapshot() returns before any thermal/
//     power transition fires — the honest cold-start snapshot, EXCEPT for the two
//     write-channel fields below which read back from the `thermal` KV blob once
//     `thermal:gpu-active` / `thermal:report-cpu` have run.
//   - gpuPowerMode: seeded "low-power"; once `thermal:gpu-active` runs, getSnapshot
//     returns the persisted "high-performance"/"low-power" (the manager's
//     setGPUActive parity).
//   - thermal.cpuPercent: if `thermal:report-cpu` has supplied a value, getSnapshot
//     returns that persisted renderer-reported value (the manager's
//     `currentThermal.cpuPercent = cpuPercent` parity). Otherwise we reproduce it
//     from sysinfo's global CPU usage, sampled across MINIMUM_CPU_UPDATE_INTERVAL
//     and rounded, the same idiom power.rs / resource_monitoring.rs use. (Electron
//     seeds it 0 and overwrites it from currentLoad on the first checkThermal tick;
//     reading it live here is closer to a warmed manager than returning the 0 seed.)
//   - temperatureC stays 0: real temp came from systeminformation.cpuTemperature
//     (optional native module). sysinfo has no cross-platform CPU temperature API
//     and the contract forbids new deps, so we keep the seed 0 — exactly what
//     getSnapshot() returns when no temp sensor reading has arrived (the common
//     case on Windows, where cpuTemperature often yields main<=0).
//   - battery: detection used systeminformation.battery + Electron powerMonitor;
//     neither has a sysinfo analogue without a new dep (same precedent as
//     hardware_ctl.rs / power.rs noBattery), so power.* keeps its AC/desktop seed.
//   - timestamps: Date.now() -> SystemTime epoch millis. No Date crate.
// =============================================================================

use serde_json::{json, Value};
use sysinfo::System;

// The single KV key holding the two write-channel-mutated fields. Matches the
// `thermal` namespace; the renderer never reads this key directly (it reads
// getSnapshot), so the shape is private to this module.
const THERMAL_KEY: &str = "thermal";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// si.currentLoad -> Math.round(load.currentLoad). Two refreshes spaced by the
// minimum interval so sysinfo's delta-based CPU usage reports a real value.
fn cpu_percent() -> i64 {
    let mut sys = System::new();
    sys.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu();
    (sys.global_cpu_info().cpu_usage() as f64).round() as i64
}

// getSnapshot(): the live ThermalPowerSnapshot. Throttle-derived fields reflect
// the manager's boot seed (no monitoring loop in a stateless dispatch). The two
// write-channel fields (gpuPowerMode, thermal.cpuPercent) read back from the
// `thermal` KV blob if a write channel has set them; otherwise gpuPowerMode keeps
// its "low-power" seed and cpuPercent is read live. See module header.
fn get_snapshot(app: &tauri::AppHandle) -> Value {
    let ts = now_ms();
    let persisted = crate::kv_get(app, THERMAL_KEY);

    // gpuPowerMode: persisted value (setGPUActive parity) or boot seed.
    let gpu_power_mode = persisted
        .get("gpuPowerMode")
        .and_then(|v| v.as_str())
        .filter(|s| *s == "high-performance" || *s == "low-power")
        .unwrap_or("low-power")
        .to_string();

    // cpuPercent: renderer-reported value (report-cpu parity) or live sysinfo read.
    let cpu_percent_val = match persisted.get("cpuPercent").and_then(|v| v.as_i64()) {
        Some(n) => n,
        None => cpu_percent(),
    };

    json!({
        "thermal": {
            "state": "cool",
            "temperatureC": 0,
            "baselineC": 0,
            "cpuPercent": cpu_percent_val,
            "timestamp": ts,
        },
        "power": {
            "state": "ac",
            "batteryPercent": 100,
            "isCharging": false,
            "isDesktop": true,
            "timestamp": ts,
        },
        "gpuPowerMode": gpu_power_mode,
        "backgroundWorkerReduction": 0,
        "gameFrameCap": 0,
        "gameResolutionStep": 0,
        "animationScale": 1,
        "writeCoalesceMs": 100,
    })
}

// thermal:gpu-active — setGPUActive(active). Mutates gpuPowerMode and broadcasts
// `dex:gpu-power-mode` { mode } to the renderer. We persist the new mode into the
// `thermal` KV blob (so a later getSnapshot reflects it, exactly as the singleton
// does) and emit the same renderer event. Fire-and-forget (ipcMain.on) -> void.
fn set_gpu_active(app: &tauri::AppHandle, active: bool) {
    let mode = if active { "high-performance" } else { "low-power" };

    let mut map = match crate::kv_get(app, THERMAL_KEY) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    map.insert("gpuPowerMode".to_string(), Value::String(mode.to_string()));
    let _ = crate::kv_set(app, THERMAL_KEY, Value::Object(map));

    crate::native_ops::emit_event(app, "dex:gpu-power-mode", &json!({ "mode": mode }));
}

// thermal:report-cpu — currentThermal.cpuPercent = cpuPercent. The renderer pushes
// its own measured CPU load; the manager just records it. We persist it into the
// `thermal` KV blob so getSnapshot returns it. Fire-and-forget (ipcMain.on) -> void.
fn report_cpu(app: &tauri::AppHandle, cpu_percent: i64) {
    let mut map = match crate::kv_get(app, THERMAL_KEY) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    map.insert("cpuPercent".to_string(), json!(cpu_percent));
    let _ = crate::kv_set(app, THERMAL_KEY, Value::Object(map));
}

/// Route a `thermal:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The two write channels (`thermal:gpu-active`,
/// `thermal:report-cpu`) are fire-and-forget `ipcMain.on` mutators: they persist
/// the field they touch into the `thermal` KV blob (so getSnapshot reflects them,
/// matching the singleton) and, for gpu-active, emit the same renderer event the
/// manager broadcasts. Both return Value::Null (void), exactly as `ipcMain.on`
/// channels do — the renderer never reads a result.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "thermal:getSnapshot" => get_snapshot(app),
        // setGPUActive(active: boolean) — args[0] is the bool.
        "thermal:gpu-active" => {
            let active = args.get(0).and_then(|v| v.as_bool()).unwrap_or(false);
            set_gpu_active(app, active);
            Value::Null
        }
        // currentThermal.cpuPercent = cpuPercent — args[0] is the number.
        "thermal:report-cpu" => {
            if let Some(n) = args.get(0).and_then(|v| v.as_i64()) {
                report_cpu(app, n);
            } else if let Some(f) = args.get(0).and_then(|v| v.as_f64()) {
                report_cpu(app, f.round() as i64);
            }
            Value::Null
        }
        _ => Value::Null,
    }
}
