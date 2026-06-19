// =============================================================================
// DEX Tauri — Motion subsystem (port of the `motion:*` data channel in
// src/main/core/MotionController.ts).
//
// NOTE ON SOURCE NAME: the porting task named the Electron source as
// `MotionAnimation.ts`; that file does not exist in the tree. The actual owner
// of the `motion:*` IPC channels is `src/main/core/MotionController.ts`, which
// is what this port mirrors.
//
// NOTE ON STORAGE: the task named `datastore-kv:motion` as the backing store.
// No such DataStore-KV key exists — `MotionController` holds NO persisted state.
// Its values are pure in-memory runtime counters that the live native process
// accumulates:
//   - motionState           : derived from OS reduced-motion + a native
//                             performance (CPU/memory) sampler.
//   - activeAnimations      : incremented/decremented by the fire-and-forget
//                             motion:animationStart / motion:animationEnd sinks.
//   - animationsBlocked     : incremented inside approveAnimation (motion:
//                             requestAnimation / "animate").
//
// DATA channel PORTED:
//   - motion:getState -> { state, activeAnimations, animationsBlocked }
//
// Electron's handler is exactly:
//   ipcMain.handle('motion:getState', () => ({
//     state: this.motionState,
//     activeAnimations: this.activeAnimations,
//     animationsBlocked: this.animationsBlocked,
//   }));
//
// DIVERGENCES (documented):
//   - `state`: the live value is computed from an OS reduced-motion signal AND a
//     native CPU/memory performance sampler ("reduced" tier). Neither is
//     available to this pure-data tier without the native runtime, and there is
//     no persisted value to read back. The honest, non-fabricated answer — the
//     same contract the renderer's own Tauri shim (rendererShims.ts
//     `motionState()`) already uses — is "full" unless the OS preference forces
//     "disabled". The OS preference is a renderer-only media query
//     (prefers-reduced-motion), not visible to the backend, so the backend's
//     truthful default here is "full". The renderer shim already serves
//     motion:getState locally with the OS-aware answer; this backend handler is
//     the honest fallback and never fabricates a "reduced"/performance tier.
//   - `activeAnimations` / `animationsBlocked`: these are live counters owned by
//     the in-memory controller and the heavy (animate/stop) path that is NOT
//     ported. With no native runtime accumulating them, the only truthful value
//     is 0. No fabrication — there is genuinely no activity to report.
//
// HEAVY channels SKIPPED (not ported, not faked): animate, stop. These drive the
// live animation runtime (approval, start/stop, counter mutation) and require
// the native process; they are omitted, so the prefix route returns Value::Null
// for them.
// =============================================================================

use serde_json::{json, Value};

/// motion:getState — mirror the Electron handler's exact return shape.
///
/// state is the honest backend default ("full"); activeAnimations and
/// animationsBlocked are 0 because no native runtime accumulates them here.
fn get_state(_app: &tauri::AppHandle) -> Value {
    json!({
        "state": "full",
        "activeAnimations": 0,
        "animationsBlocked": 0,
    })
}

/// Route a `motion:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the ported data channel returns a shaped
/// value; everything else in the namespace (including the skipped heavy
/// animate/stop channels) returns Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "motion:getState" => get_state(app),
        _ => Value::Null,
    }
}
