// =============================================================================
// DEX Tauri — DTP (DEX Transfer Protocol) subsystem (port of the `dtp:*` IPC
// handlers in src/main/transfer/DTPController.ts).
//
// SCOPE / REALITY CHECK (important divergence from the porting brief):
// The brief asked to port two DATA channels `dtp:getStatus` and `dtp:getProgress`
// backed by a `datastore-kv:dtp` store, skipping heavy `initiate/send/receive/
// cancel`. NONE of those literal channels exist in this codebase. The actual
// `dtp:*` surface (DTPController.ts + preload.ts) is:
//   - LIVE control / heavy (native runtime): startServer, stopServer,
//     startDiscovery, stopDiscovery, refreshDevices, sendFiles, cancelSend,
//     pauseSend, resumeSend, approveDevice, denyDevice, pauseReceive,
//     cancelReceive, removeTrustedDevice, measureBandwidth, retryTransfer,
//     clearHistory  -> all touch a running TCP server (DTPServer), a UDP
//     discovery socket (DeviceDiscovery), or an outbound transfer client
//     (DTPClient). No native runtime here, nothing to fake.
//   - LIVE read (native runtime): getDevices (live mDNS/UDP peer table),
//     getHistory / getTrustedDevices (native sqlite via DTPServer). These are
//     READ channels but their data lives in the live native server/socket, not
//     in any electron-store or DataStore-KV. There is no pure-data backing to
//     port at the EXACT Electron shape, so per the brief's heavy-channel rule
//     (do not implement, do not fake) they are reported as not ported.
//   - There is NO request/response progress or status channel: progress/status
//     reach the renderer ONLY as pushed events (dtp:send-progress,
//     dtp:transfer-progress, dtp:transfer-complete, dtp:transfer-error, ...),
//     which are emitter side-effects, not dispatchable IPC handlers.
//
// Consequently zero channels are data-portable at their exact Electron shapes.
// This module still owns the WHOLE `dtp:` namespace so prefix-routing is safe:
// every channel the renderer reads as a shaped object returns the documented
// honest-degrade object { success:false, error:"not ported (needs native
// runtime)" }; array-returning reads return [] (Electron also returns [] when
// the server/discovery is absent — see DTPController getDevices/getHistory/
// getTrustedDevices); everything else returns Value::Null.
//
// No storage, ids, or timestamps are produced because nothing here persists
// pure data. Uses only serde_json, std, tauri.
// =============================================================================

use serde_json::{json, Value};

// Channels whose renderer callers read a shaped { success, ... } object.
// Electron returned { success:true } / { success:false, error } for these; we
// return the documented not-ported failure so the renderer degrades honestly
// instead of believing a native action succeeded.
fn not_ported() -> Value {
    json!({ "success": false, "error": "not ported (needs native runtime)" })
}

/// Route a `dtp:*` channel. Args are the positional JSON array the renderer sent
/// (see tauriCompat.ts). The entire namespace is owned here: heavy/live channels
/// the renderer reads as shaped objects return the not-ported failure; live
/// array reads return [] (matching Electron's server-absent fallback); anything
/// else returns Value::Null.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Live array reads — Electron returns [] when server/discovery is null.
        "dtp:getDevices" | "dtp:getHistory" | "dtp:getTrustedDevices" => json!([]),

        // Server control (DTPServer lifecycle).
        "dtp:startServer"
        | "dtp:stopServer"
        // Discovery control (DeviceDiscovery UDP socket).
        | "dtp:startDiscovery"
        | "dtp:stopDiscovery"
        | "dtp:refreshDevices"
        // Sending (DTPClient outbound transfer).
        | "dtp:sendFiles"
        | "dtp:cancelSend"
        | "dtp:pauseSend"
        | "dtp:resumeSend"
        // Receiving (DTPServer inbound transfer).
        | "dtp:approveDevice"
        | "dtp:denyDevice"
        | "dtp:pauseReceive"
        | "dtp:cancelReceive"
        // History + trusted-device mutation, bandwidth, retry.
        | "dtp:removeTrustedDevice"
        | "dtp:retryTransfer"
        | "dtp:clearHistory" => not_ported(),

        // measureBandwidth: renderer reads { mbps }. Electron returned { mbps:0 }
        // when the client is absent; mirror that honest zero rather than failing.
        "dtp:measureBandwidth" => json!({ "mbps": 0 }),

        _ => Value::Null,
    }
}
