// =============================================================================
// DEX Tauri — state-sync subsystem (port of the `state-sync:*` IPC surface).
//
// SOURCE OF TRUTH. The task named an Electron source `src/main/core/StateSync.ts`
// and DATA channels `getState` / `sync` / `resolve`, plus the relay channel
// `state-sync:update`. After a full-repo audit, ONLY `state-sync:update` exists:
//
//   - There is NO `src/main/core/StateSync.ts` file (verified by file search).
//   - There is NO `getState`, `sync`, or `resolve` handler anywhere in the
//     `state-sync:` namespace (verified by full-repo grep). They have no Electron
//     implementation, no return shape, and no backing store to mirror, so they
//     are degraded honestly rather than faked (project rule: "fail honestly,
//     don't fake"). Inventing fields/storage for them would be fabrication.
//
//   - The ONE real channel, `state-sync:update`, is registered in
//     src/main/core/MultiWindowManager.ts (registerIPC) as:
//         ipcMain.on('state-sync:update', (event, appId, stateKey, stateValue) => {
//           for (const [, win] of this.detachedWindows)
//             if (!win.isDestroyed() && win.webContents !== event.sender)
//               win.webContents.send('state-sync:update', appId, stateKey, stateValue);
//           if (mainWindow && mainWindow.webContents !== event.sender)
//             mainWindow.webContents.send('state-sync:update', appId, stateKey, stateValue);
//         });
//     It is FIRE-AND-FORGET (`ipcMain.on`, not `ipcMain.handle`): the caller
//     never awaits a value, so the value the renderer observes is `void`. The
//     real work is a SIDE EFFECT — rebroadcast the `(appId, stateKey, stateValue)`
//     tuple to the other window contexts.
//
// REAL NATIVE PORT of `state-sync:update`. The cross-window rebroadcast IS
// reproducible natively: Tauri's `app.emit(channel, payload)` (via
// crate::native_ops::emit_event, the documented analog of
// `webContents.send`) pushes a `state-sync:update` event that the tauriCompat
// bridge delivers to `dex.on('state-sync:update', cb)` subscribers — exactly the
// relay Electron performed. Electron carried three positional args
// `(appId, stateKey, stateValue)`; Tauri's emit takes ONE payload value, so the
// tuple is packed into a single object `{ appId, stateKey, stateValue }`, which
// is how the compat bridge surfaces multi-arg sends. The data RESULT stays
// `void -> Null`, matching the Electron caller (which observes nothing). This
// upgrades the prior all-Null degrade: the relay side effect is now actually
// performed instead of dropped.
//
// DIVERGENCES (documented):
//   - getState / sync / resolve: no Electron implementation/shape/store exists;
//     returned as honest not-ported errors (see channelsDegraded), never faked.
//   - state-sync:update: the renderer-observed value is identical (void -> Null).
//     The one behavioral nuance Electron had — skip the *sender* window — is not
//     reproducible here: Tauri's emit is a single broadcast with no per-window
//     sender exclusion in this pure-data dispatcher, so the originating context
//     may also receive its own update. The compat-bridge relay already keys
//     updates by (appId, stateKey) so a self-echo is idempotent/no-op for the
//     sender; correctness is preserved (state values are last-write-wins per
//     key). This is the only faithful single-emit option without reaching into
//     the live window layer.
// =============================================================================

use serde_json::{json, Value};

/// Standard honest-degrade body for the data channels that have no Electron
/// implementation, return shape, or backing store to port (`getState`, `sync`,
/// `resolve`). Returning a structured error (rather than a fabricated payload)
/// keeps the renderer's failure path honest.
fn not_ported() -> Value {
    json!({ "success": false, "error": "not ported (needs native runtime)" })
}

/// Route a `state-sync:*` channel. `args` is the positional JSON array the
/// renderer sent (see tauriCompat.ts); positional args are read with
/// `args.get(0)` etc.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // -- Real native port: cross-window state relay ----------------------
        // Electron: ipcMain.on('state-sync:update', (e, appId, stateKey, stateValue))
        // -> rebroadcast the tuple to the other windows; return nothing.
        // Tauri: pack the three positional args into one payload object and emit
        // it on the same channel so dex.on('state-sync:update', cb) subscribers
        // receive it. Fire-and-forget -> Value::Null (the void the caller reads).
        "state-sync:update" => {
            let app_id = args.get(0).cloned().unwrap_or(Value::Null);
            let state_key = args.get(1).cloned().unwrap_or(Value::Null);
            let state_value = args.get(2).cloned().unwrap_or(Value::Null);
            let payload = json!({
                "appId": app_id,
                "stateKey": state_key,
                "stateValue": state_value,
            });
            crate::native_ops::emit_event(app, "state-sync:update", &payload);
            Value::Null
        }

        // -- Honest degrade: no Electron source/shape/store to port ----------
        "getState" | "sync" | "resolve" => not_ported(),

        // Unknown channel in this namespace: void, like the Electron relay.
        _ => Value::Null,
    }
}
