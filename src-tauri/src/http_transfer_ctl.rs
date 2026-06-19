// =============================================================================
// DEX Tauri — HTTP Transfer data/CRUD surface (port of the read-only IPC
// handlers in controllers/HttpTransferServer.ts).
//
// WHY A `_ctl` FILE: the primary module `http_transfer.rs` already exists and
// already ports the FULL namespace (including a live tiny_http server, in-memory
// shared/pending state, and the heavy upload/download paths). Per the porting
// rules, when `<module>.rs` is present this data-tier port is delivered as a
// separate self-contained file so it neither edits nor collides with it.
//
// SCOPE: this file ports ONLY the pure-data, no-native-runtime surface — the
// read-only status query and the in-memory list query — at the EXACT Electron
// return shapes the renderer reads. The Electron `HttpTransferServer` keeps ALL
// its state in process memory (`Map`s for sharedFiles / pendingUploads) and a
// live `http.Server`; nothing is persisted to electron-store or DataStore-KV.
// There is therefore no storage key to read here: with no live server owned by
// this tier, the faithful data answers are the server's STOPPED-state shapes.
//
// CHANNELS PORTED (data tier, exact shapes from getServerInfo / pending-uploads):
//   - http-transfer:info            -> {isRunning,url,qrData,localIP,port,
//                                        sharedFiles[],hostname}
//   - http-transfer:pending-uploads -> [{id,fileName,fileSize,senderIp,status}]
//
// CHANNELS SKIPPED (need the native HTTP runtime / live in-memory server, not
// reproduced or faked here — see channelsSkipped): start, stop, share, unshare,
// accept-upload, pick-and-share. Each returns its Electron-shaped `{success:...}`
// error object because the renderer reads those results as shaped objects.
//
// DIVERGENCES (documented):
//   - localIP: Electron walked os.networkInterfaces() for the first non-internal
//     IPv4. To stay dependency-free we resolve the LAN IPv4 via the OS routing
//     table (UDP connect to a public addr, read local_addr — no packets sent),
//     falling back to 127.0.0.1, exactly mirroring the Electron fallback.
//   - hostname: Electron used os.hostname(); we read COMPUTERNAME / HOSTNAME and
//     fall back to "DEX". Same string slot, host-derived.
//   - port: with no live server, info reports the Electron default base port
//     47633 (its `this.port` initial value), matching a never-started server.
//   - The heavy channels are intentionally NOT implemented; their stub objects
//     match the Electron success/error shape so the renderer degrades honestly.
// =============================================================================

use serde_json::{json, Value};

const BASE_PORT: u16 = 47633;

/// Best-effort LAN IPv4 via the OS routing table (no packets sent, no crate).
/// Mirrors getLocalIP()'s "first non-internal IPv4, else 127.0.0.1".
fn local_ip() -> String {
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

/// os.hostname() analogue.
fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DEX".to_string())
}

// http-transfer:info -> getServerInfo(). This data tier owns no live server, so
// the faithful answer is the stopped-state shape: isRunning false, url/qrData
// null, sharedFiles empty. Field names/types match the Electron object exactly.
fn server_info() -> Value {
    json!({
        "isRunning": false,
        "url": Value::Null,
        "qrData": Value::Null,
        "localIP": local_ip(),
        "port": BASE_PORT,
        "sharedFiles": [],
        "hostname": hostname(),
    })
}

// http-transfer:pending-uploads -> the filtered/mapped pending list. With no
// live server in this tier there are no in-memory pending uploads, so the
// faithful result is an empty array (same element shape as Electron's map).
fn pending_uploads() -> Value {
    json!([])
}

/// Route an `http-transfer:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the pure-data channels are answered;
/// the native-runtime channels return their Electron-shaped error object (the
/// renderer reads `{success}` from them), and anything else returns Value::Null.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // --- data tier (ported) ---
        "http-transfer:info" => server_info(),
        "http-transfer:pending-uploads" => pending_uploads(),

        // --- heavy / native-runtime tier (NOT ported, honest shaped errors) ---
        // Renderer reads { success, ... } from each of these, so return a
        // shaped failure rather than null. No server is started/touched.
        "http-transfer:start"
        | "http-transfer:stop"
        | "http-transfer:share"
        | "http-transfer:unshare"
        | "http-transfer:accept-upload"
        | "http-transfer:pick-and-share" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}
