// =============================================================================
// DEX Tauri — state-sync subsystem (port attempt of the `state-sync:*` IPC
// surface).
//
// HONEST-DEGRADE TIER (no data to port). The task named an Electron source
// `src/main/core/StateSync.ts` and DATA channel `getState`, plus HEAVY channels
// `sync` / `resolve`. After auditing the entire repo, NONE of these exist:
//
//   - There is no `src/main/core/StateSync.ts` file.
//   - The ONLY `state-sync:*` channel anywhere in the Electron main process is
//     `state-sync:update`, registered in
//     src/main/core/MultiWindowManager.ts (registerIPC) as:
//         ipcMain.on('state-sync:update', (event, appId, stateKey, stateValue) => { ... })
//     plus an `ipc-message` forwarder in the same file. It is a FIRE-AND-FORGET
//     window-to-window relay over `ipcRenderer.send` (NOT `ipcMain.handle`): it
//     rebroadcasts the (appId, stateKey, stateValue) tuple to the other
//     detached/main windows and returns NOTHING. There is no request/response,
//     no return shape, no `electron-store`, no DataStore-KV key, and no
//     `state-sync.json` file backing it.
//   - There is no `getState`, `sync`, or `resolve` handler in the `state-sync:`
//     namespace (verified by full-repo grep). The `state-sync.json` storage
//     named in the task likewise does not exist.
//
// `src-tauri/src/multi_window.rs` already documents this exact conclusion in its
// header: the `state-sync:update` relay "has no DB component — it is
// intentionally not part of this dispatcher surface."
//
// Because porting requires matching EXACT Electron return shapes and never
// inventing fields/storage, there is nothing to port at a real shape here.
// Fabricating a `getState` handler with invented fields plus a fabricated
// `state-sync.json` store would be faking, which the project rules forbid
// ("fail honestly, don't fake"). So this module degrades honestly: `dispatch`
// owns the whole `state-sync:` namespace and returns Value::Null for every
// channel.
//
// `state-sync:update` over Tauri: the renderer-side relay is fire-and-forget
// (Electron used `ipcRenderer.send`, whose caller never awaits a value). The
// cross-window rebroadcast is a live-window side effect, not data, and lives in
// the window layer — not this pure-data dispatcher. Returning Null is the
// correct, lossless result for the value the renderer reads (none).
//
// DIVERGENCES (documented):
//   - getState / sync / resolve: not implemented and not faked — they have no
//     Electron implementation, return shape, or storage to mirror (see
//     channelsSkipped).
//   - state-sync:update: the data result is identical (void -> Null); the live
//     window-to-window rebroadcast side effect is intentionally not reproduced
//     in this pure-data layer (same precedent as multi_window.rs).
// =============================================================================

use serde_json::Value;

/// Route a `state-sync:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The entire namespace is a fire-and-forget
/// window relay with no request/response value and no backing store, so every
/// channel degrades honestly to Value::Null (the same void result the Electron
/// caller observes). `_args` is unused: no channel here reads a positional arg
/// for a returned value.
pub fn dispatch(_app: &tauri::AppHandle, _channel: &str, _args: &Value) -> Value {
    Value::Null
}
