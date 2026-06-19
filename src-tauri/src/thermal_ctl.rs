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
// STORAGE: NONE. Despite the contract's `datastore-kv:thermal` note, the
// ThermalPowerManager persists nothing — it holds all state in memory and
// mutates it from a live 5s monitoring loop (systeminformation cpuTemperature /
// currentLoad / battery + Electron powerMonitor events). There is no
// electron-store, no DataStore key, no JSON file. We therefore read/write no
// storage; this module is a pure live-snapshot read. (We deliberately do NOT
// invent a `thermal` KV key the renderer never reads.)
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
//     power transition fires — the honest cold-start snapshot.
//   - thermal.cpuPercent: this is the one field the snapshot derives from a live
//     reading (si.currentLoad -> Math.round). We reproduce it from sysinfo's
//     global CPU usage, sampled across MINIMUM_CPU_UPDATE_INTERVAL and rounded,
//     the same idiom power.rs / resource_monitoring.rs use. (Electron seeds it 0
//     and overwrites it from currentLoad on the first checkThermal tick; reading
//     it live here is closer to a warmed manager than returning the 0 seed.)
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
// the manager's boot seed (no monitoring loop in a stateless dispatch); cpuPercent
// is read live. See module header for the full divergence list.
fn get_snapshot() -> Value {
    let ts = now_ms();
    json!({
        "thermal": {
            "state": "cool",
            "temperatureC": 0,
            "baselineC": 0,
            "cpuPercent": cpu_percent(),
            "timestamp": ts,
        },
        "power": {
            "state": "ac",
            "batteryPercent": 100,
            "isCharging": false,
            "isDesktop": true,
            "timestamp": ts,
        },
        "gpuPowerMode": "low-power",
        "backgroundWorkerReduction": 0,
        "gameFrameCap": 0,
        "gameResolutionStep": 0,
        "animationScale": 1,
        "writeCoalesceMs": 100,
    })
}

/// Route a `thermal:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The two HEAVY channels (`thermal:gpu-active`,
/// `thermal:report-cpu`) are live-state mutators on the native monitoring loop
/// and are intentionally NOT ported — they fall through to Value::Null (honest
/// degrade; they are fire-and-forget `ipcMain.on` channels whose results the
/// renderer never reads).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "thermal:getSnapshot" => get_snapshot(),
        _ => Value::Null,
    }
}
