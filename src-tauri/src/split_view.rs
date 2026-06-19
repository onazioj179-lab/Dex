// =============================================================================
// DEX Tauri — Split-view cross-drop subsystem (port of the `split:*` ipcMain
// handlers in src/main/main.ts).
//
// Namespace: split. Only one channel lives under this prefix:
//   - split:cross-drop (data: any) -> { success: true }
//
// The Electron handler is a pure relay with NO persistence (storage tier
// "other:ui-state-ephemeral" — there is no electron-store or DataStore key):
//
//   ipcMain.handle('split:cross-drop', async (_, data) => {
//     this.mainWindow?.webContents.send('split:cross-drop-applied', data);
//     return { success: true };
//   });
//
// i.e. it rebroadcasts the dropped payload to the renderer on
// `split:cross-drop-applied` and unconditionally resolves `{ success: true }`.
//
// Port fidelity: the resolved value `{ success: true }` matches exactly. The
// live rebroadcast is reproduced via crate::native_ops::emit_event — the same
// shared analog of `mainWindow.webContents.send(channel, payload)` used across
// the other ports (one payload value per event; the tauriCompat bridge delivers
// it to `dex.on('split:cross-drop-applied', cb)`). The payload forwarded is the
// `data` argument verbatim (Electron forwarded it untouched). The Electron
// `?.` (no main window) collapsed to a no-op send; here a missing window simply
// makes the emit a no-op too, and the return value is unaffected.
//
// No id generation, timestamps, or storage are involved (the handler stores
// nothing), so there are no time/uuid divergences to document.
// =============================================================================

use serde_json::{json, Value};

/// Route a `split:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; any
/// not intentionally ported returns Value::Null (honest degrade), so routing
/// `channel.starts_with("split:")` here is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // split:cross-drop (data) -> { success: true }
        // Rebroadcast the payload on `split:cross-drop-applied`, then resolve.
        "split:cross-drop" => {
            let data = args.get(0).cloned().unwrap_or(Value::Null);
            crate::native_ops::emit_event(app, "split:cross-drop-applied", &data);
            json!({ "success": true })
        }
        _ => Value::Null,
    }
}
