// =============================================================================
// DEX Tauri — Notes server subsystem (port of main.ts `notes:*` handlers).
//
// The Electron "notes server" is a local-sync placeholder: it never opens a
// socket or touches the network. `notes:start-server` just reports the current
// note count and a fixed { port: 0, mode: 'local' } envelope; `notes:stop-server`
// reports stopped. Both are pure-data, so they port directly here.
//
// Storage: notes live in the `dex-data` electron-store under the top-level
// `notes` key — the same DataStore-KV backing modes use. We read it via
// crate::kv_get(app, "notes") (no write needed) so the count matches Electron.
//
// Return shapes match the Electron handlers exactly so the renderer is unchanged:
//   notes:start-server -> { success, status: "running", port: 0, mode: "local", noteCount }
//   notes:stop-server  -> { success, status: "stopped", mode: "local" }
//
// No heavy channels exist in this namespace (the "server" is a no-op), so there
// is nothing skipped; any unknown `notes:*` channel returns Value::Null (honest
// degrade), which keeps the prefix route safe.
// =============================================================================

use serde_json::{json, Value};

/// Count notes stored under the `notes` key in the dex-data DataStore.
/// Electron: `((await this.dataStore.get<any[]>('notes')) || []).length`.
fn note_count(app: &tauri::AppHandle) -> usize {
    match crate::kv_get(app, "notes") {
        Value::Array(a) => a.len(),
        _ => 0,
    }
}

/// Route a `notes:*` channel. Args are the positional JSON array the renderer
/// sent (both handlers here take no arguments).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "notes:start-server" => json!({
            "success": true,
            "status": "running",
            "port": 0,
            "mode": "local",
            "noteCount": note_count(app),
        }),
        "notes:stop-server" => json!({
            "success": true,
            "status": "stopped",
            "mode": "local",
        }),
        _ => Value::Null,
    }
}
