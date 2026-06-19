// =============================================================================
// DEX Tauri — GPU subsystem (intended port of the `gpu:*` data surface).
//
// STATUS: NOTHING PORTED. The inputs this task names do not exist in the repo,
// and the project rule "never invent fields/shapes, never fake" forbids
// fabricating a plausible-looking surface against a phantom source. This file
// exists so the namespace has an honest, self-contained home that compiles and
// degrades cleanly (every `gpu:*` channel returns Value::Null) rather than a
// module that fakes capability/memory objects the renderer never asked for.
//
// What the task asked to port vs. what the repo actually contains:
//   - Named source `src/main/core/GpuAcceleration.ts`  -> DOES NOT EXIST.
//   - Named DATA channels `gpu:getCapabilities`, `gpu:getMemory` -> DO NOT EXIST
//     anywhere in src/ (no preload binding, no ipcMain.handle, no renderer call).
//   - Named HEAVY channels `gpu:allocate`/`gpu:deallocate`/`gpu:optimize`
//     -> DO NOT EXIST either.
//   - Named storage `datastore-kv:gpu` -> NO such DataStore key is read/written
//     anywhere; there is no GPU CRUD/data tier to mirror.
//
// What the `gpu:*` namespace REALLY is in this codebase (for the record):
//   The only live `gpu:*` channels are render-throttling signals owned by
//   src/main/core/ResourceGovernor.ts — NOT a data/CRUD surface:
//     - gpu:getState     (invoke) -> { activityLevel, isRendering,
//                                       lastRenderTime, shouldRender }
//     - gpu:shouldRender (invoke) -> bool
//     - gpu:renderStart / gpu:renderEnd / gpu:activityLevel (send) -> events
//   These read live in-process governor state (current activity level, whether a
//   frame is in flight, last render timestamp, throttle decision). That state is
//   a property of the running Electron/Tauri process and has NO persisted,
//   data-tier representation: it cannot be reconstructed from electron-store or
//   DataStore-KV. Porting it would mean standing up the native ResourceGovernor
//   (frame timing, throttle policy, render-budget accounting) inside Rust — i.e.
//   exactly the "heavy native runtime" surface this task scopes OUT. So it is
//   correctly omitted here, the same way analytics.rs/engine_ctl.rs omit their
//   runtime channels.
//
// CONCLUSION: there is no faithful pure-data GPU port to write. Per the quality
// bar ("prefer fewer correct channels over many shaky ones" + "do not fake heavy
// channels"), the honest result is zero ported channels. dispatch() returns
// Value::Null for the entire namespace, so prefix-routing `gpu:` here is safe and
// behaves identically to the namespace being unrouted (renderer gets null and
// uses its existing fallbacks).
// =============================================================================

use serde_json::Value;

/// Route a `gpu:*` channel. Args are the positional JSON array the renderer sent
/// (see tauriCompat.ts). No GPU data channel exists to port (see file header),
/// so every channel — including the runtime governor signals — degrades to
/// Value::Null rather than returning a fabricated shape.
pub fn dispatch(_app: &tauri::AppHandle, _channel: &str, _args: &Value) -> Value {
    Value::Null
}
