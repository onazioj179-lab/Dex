// =============================================================================
// DEX Tauri — HTTP Transfer kebab-channel surface
// (port of the IPC handlers in controllers/HttpTransferServer.ts)
//
// WHY THIS FILE EXISTS AND WHAT CHANGED
// -------------------------------------------------------------------------
// The Electron `HttpTransferServer` registers its IPC under KEBAB channel
// names: `ipcMain.handle('http-transfer:start' | ':stop' | ':share' | ...)`.
// Those are the names the renderer actually invokes. The Tauri router sends
// every `http-transfer:*` channel here (main.rs), while a separate FULL native
// port lives in `http_transfer.rs` exposed under CAMEL names
// (`httpTransfer:start`, ...) plus a Tauri-managed live-server state slot
// (`HttpTransferState`, registered in main.rs setup).
//
// A prior revision of this file answered ONLY the two read-only channels and
// returned `{success:false,"not ported"}` for the six heavy ones — even though
// `http_transfer.rs` already implements all of them with a REAL blocking
// tiny_http server, real multipart upload parsing, real file streaming, native
// accept/reject with disk writes, a native multi-file picker, and renderer
// push events. Because the renderer speaks kebab, that real server was
// unreachable from the UI and every heavy action degraded.
//
// THE FIX (real, not faked): translate each kebab channel + its positional
// args into the equivalent camel channel and delegate to the live
// `crate::http_transfer` server, which owns the single shared `HttpTransferState`
// and does the actual OS work. This wires the existing native implementation to
// the channels the renderer truly sends — one server, one state, exact Electron
// return shapes — instead of duplicating the server or stubbing it out.
//
// CHANNEL MAP (kebab here -> camel in http_transfer.rs):
//   http-transfer:start           -> httpTransfer:start            ({...opts}) -> {success,url,qrData}|{success,error}
//   http-transfer:stop            -> httpTransfer:stop             ()          -> {success}
//   http-transfer:share           -> httpTransfer:share            (paths[])   -> {success,fileIds[]}
//   http-transfer:unshare         -> httpTransfer:unshare          (fileId)    -> {success}
//   http-transfer:accept-upload   -> httpTransfer:acceptUpload     (id,accept) -> {success}
//   http-transfer:pick-and-share  -> httpTransfer:pickAndShare     ()          -> {success,fileIds[]}|{success,message}
//   http-transfer:info            -> httpTransfer:info             ()          -> {isRunning,url,qrData,localIP,port,sharedFiles[],hostname}
//   http-transfer:pending-uploads -> httpTransfer:getPendingUploads()          -> [{id,fileName,fileSize,senderIp,status}]
//
// ARGS PASS-THROUGH: the renderer sends positional args (tauriCompat). The
// kebab and camel handlers expect the SAME positional shapes (`share` takes a
// string[] at index 0, `unshare` a string, `accept-upload` (string, bool)), so
// the original `args` array is forwarded unchanged — no reshaping needed.
//
// DIVERGENCES: the Electron `start()` took no args; `http_transfer.rs`
// additionally honors optional `{downloadDir, autoAccept}` from args[0], which
// is a strict superset (an empty/null arg yields the default behavior). All
// return shapes, event names, and the upload accept/reject + file-expiry
// semantics are identical to Electron because the work is the shared server's.
// =============================================================================

use serde_json::Value;

/// Route an `http-transfer:*` (kebab) channel by delegating to the live native
/// server in `crate::http_transfer` under its `httpTransfer:*` (camel) names.
/// Args are the positional JSON array the renderer sent and are forwarded
/// unchanged; the camel handlers read the same indices.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let camel = match channel {
        "http-transfer:start" => "httpTransfer:start",
        "http-transfer:stop" => "httpTransfer:stop",
        "http-transfer:share" => "httpTransfer:share",
        "http-transfer:unshare" => "httpTransfer:unshare",
        "http-transfer:accept-upload" => "httpTransfer:acceptUpload",
        "http-transfer:pick-and-share" => "httpTransfer:pickAndShare",
        "http-transfer:info" => "httpTransfer:info",
        "http-transfer:pending-uploads" => "httpTransfer:getPendingUploads",
        _ => return Value::Null,
    };
    crate::http_transfer::dispatch(app, camel, args)
}
