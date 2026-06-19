// =============================================================================
// DEX Tauri — Phase 1 Stability subsystem (port of the `phase1:*` IPC handlers
// in src/main/core/Phase1Integration.ts).
//
// NOTE ON SOURCE: the task brief named src/main/phases/Phase1.ts and a
// `datastore-kv:phase1` store with run/cancel channels. None of those exist in
// the repo. The real subsystem is Phase1Integration.ts, which registers exactly
// three channels — phase1:getStatus, phase1:getReport, phase1:forceCleanup —
// and PERSISTS NOTHING. getStatus() is a pure LIVE-state read derived from the
// in-process stability singletons; there is no key, no file, no CRUD surface.
// We therefore port only getStatus (the one DATA channel requested), computing
// its values from the Tauri runtime, and skip everything else (see below).
//
// Ported channel & EXACT shape (Phase1Status, from Phase1Integration.getStatus):
//   phase1:getStatus -> {
//     initialized: boolean,
//     systems: {
//       stabilityCore: boolean,
//       permissionGuard: boolean,
//       automationStability: boolean,
//       memoryLeakPrevention: boolean,
//       searchCorrectness: boolean,
//     },
//     health: "excellent" | "good" | "degraded" | "critical",
//     startupTime: number,
//     uptime: number,
//   }
//
// DIVERGENCES (documented):
//   - NO STORAGE. Electron read these fields from live singletons that do not
//     exist natively. We reproduce the shape honestly from the Tauri side:
//       * initialized + every systems.* flag = true. In Electron these mirror
//         `this.isInitialized`, which is set true after init() runs (and even on
//         init failure, to avoid retry loops). If the Tauri bridge is reachable,
//         the host process is up, so the faithful value is true.
//       * health = "excellent". Electron derives this from stabilityCore.getStats()
//         .currentHealth, whose default (no critical/failed-recovery events) is
//         "excellent". The native shell has no stability-event tracker and adds
//         no crate to build one, so the no-events baseline is exactly "excellent".
//       * startupTime = 0. Electron measures Date.now()-initStartTime around its
//         5-stage native init. That init does not exist here; there is nothing to
//         time, so 0 (the pre-init default) is the honest value.
//       * uptime = ms since this process first served a phase1 request, captured
//         once in a process-local OnceLock (mirrors stabilityCore's startTime =
//         process-start clock). Measured with std SystemTime epoch millis — no
//         Date/time crate. This is process uptime, NOT system boot uptime.
// =============================================================================

use serde_json::{json, Value};
use std::sync::OnceLock;

// Process-start instant (epoch millis), captured on first access. Mirrors the
// Electron stability core's `startTime`, set when the subsystem comes alive.
static START_MS: OnceLock<u64> = OnceLock::new();

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn start_ms() -> u64 {
    *START_MS.get_or_init(now_ms)
}

// Phase1Integration.getStatus() — live status, no persistence. See header for the
// per-field rationale on each native value.
fn get_status() -> Value {
    let uptime = now_ms().saturating_sub(start_ms());
    json!({
        "initialized": true,
        "systems": {
            "stabilityCore": true,
            "permissionGuard": true,
            "automationStability": true,
            "memoryLeakPrevention": true,
            "searchCorrectness": true,
        },
        "health": "excellent",
        "startupTime": 0,
        "uptime": uptime,
    })
}

/// Route a `phase1:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the DATA channel getStatus is ported; the
/// other namespace channels are runtime side-effects with no faithful native
/// behaviour and return Value::Null (honest degrade).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "phase1:getStatus" => get_status(),
        _ => Value::Null,
    }
}
