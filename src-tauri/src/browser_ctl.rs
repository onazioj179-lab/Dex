// =============================================================================
// DEX Tauri — Browser bridge subsystem (port of the `browser:*` IPC handlers in
// WorkflowController.ts, which delegate to BrowserBridge in
// src/main/core/BrowserBridge.ts).
//
// Pure-data tier: ONLY the read-only `browser:getStatus` channel is ported. All
// the heavy channels (startServer/stopServer/startPairing/cancelPairing/
// disconnect/navigate/readPage/fillField/click and the related fillFormField)
// drive a live local HTTP pairing server and an attached real browser. Those
// require a native runtime and are deliberately NOT ported here — see
// channelsSkipped in the port metadata.
//
// STATE / STORAGE divergence (documented):
//   The Electron BrowserBridge keeps ALL of its state in process memory
//   (`status`, `connection`, `pairingRequest`) — it never persists to any
//   electron-store / DataStore-KV file. The migration brief listed a nominal
//   `datastore-kv:browser` storage key, but the source has no such persistence:
//   getStatus simply returns the current in-memory triple. Because every channel
//   that could MUTATE that state (startServer, startPairing, disconnect, ...) is
//   a skipped heavy channel and is never implemented on Tauri, the bridge can
//   never leave its constructor-default disconnected state in this build.
//   Therefore getStatus here faithfully returns that default, with no KV read.
//   If/when the native bridge lands, this should read the live native state
//   instead of the constant default.
//
// Channel & shape (from BrowserBridge.getStatus):
//   - browser:getStatus -> { status: BridgeStatus, connection: BrowserConnection | null,
//                            pairing: PairingRequest | null }
//     where BridgeStatus is one of "disconnected" | "connecting" | "connected" |
//     "pairing". The default (and only reachable) value in this build is:
//       { status: "disconnected", connection: null, pairing: null }
//     Field names match BrowserBridge exactly: note the key is "pairing" (the
//     status object key), NOT "pairingRequest" (the private member name).
// =============================================================================

use serde_json::{json, Value};

// BrowserBridge.getStatus() — returns the in-memory status triple. With every
// mutating channel skipped, this is permanently the constructor default.
fn get_status() -> Value {
    json!({
        "status": "disconnected",
        "connection": Value::Null,
        "pairing": Value::Null,
    })
}

/// Route a `browser:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only `browser:getStatus` is ported; every other
/// channel in the namespace (the skipped heavy channels and any other
/// `browser:*` event/action channels) returns Value::Null — honest degrade,
/// which keeps prefix routing of the whole namespace safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "browser:getStatus" => get_status(),
        _ => Value::Null,
    }
}
