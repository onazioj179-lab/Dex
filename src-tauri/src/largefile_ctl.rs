// =============================================================================
// DEX Tauri — Large File subsystem (port of the `largefile:*` IPC handlers in
// src/main/core/LargeFileReader.ts).
//
// NAME divergence (documented): the porting brief named the source
// `LargeFileHandler.ts` and the data channel `getInfo`; the real source is
// `LargeFileReader.ts` and the real channel is `largefile:info` (handler
// `getFileInfo`). This module ports that channel under its true name.
//
// Pure-data, FILESYSTEM-stat tier. The ONLY ported channel (`largefile:info`)
// reads file metadata via std::fs and derives recommendations — it persists
// nothing. The brief's `datastore-kv:largefile` storage is therefore unused by
// the ported surface; LargeFileReader keeps its state in-memory (open file
// sessions) and uses no electron-store/DataStore at all, so there is no key to
// mirror. Return shape matches the Electron handler exactly so the renderer is
// unchanged.
//
// getFileInfo -> { size, sizeFormatted, isLarge, recommendedChunkSize }
//   - size:               file byte length (number)
//   - sizeFormatted:      human string from the SAME formatBytes rules as
//                         LargeFileReader (B / KB 1dp / MB 1dp / GB 2dp)
//   - isLarge:            size > 10 MiB
//   - recommendedChunkSize: 256KB if >1GiB, 128KB if >100MiB, else 64KB default
//   (estimatedLineCount is declared optional in the TS type but the handler
//    never sets it, so it is omitted here too — never invent fields.)
//
// HEAVY channels SKIPPED (need the native runtime: live file descriptors,
// in-memory session map, chunked/line streaming). Per the brief these are NOT
// implemented and NOT faked; the prefix route returns Value::Null for them:
//   open, close, readNext, readChunk, readLines, seek, session, sessions,
//   setConfig.
//
// Helpers: std + serde_json only (no rand/Date/extra deps). Mirrors the file IO
// style of analytics.rs (app_data_dir is unused here since this channel touches
// an arbitrary caller-supplied path, exactly like the Electron handler).
// =============================================================================

use serde_json::{json, Value};

// LargeFileReader.formatBytes — byte-for-byte: thresholds and decimal places.
fn format_bytes(bytes: u64) -> String {
    let b = bytes as f64;
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", b / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", b / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", b / (1024.0 * 1024.0 * 1024.0))
    }
}

// getFileInfo(filePath) — stat the path and derive the recommendation fields.
// The Electron handler awaits fs.stat and lets a rejection bubble (the renderer
// sees a rejected promise). We have no shaped error contract for this channel,
// so on a stat failure we degrade to Value::Null (honest "no info") rather than
// invent a {error} object the renderer does not expect.
fn get_file_info(file_path: &str) -> Value {
    let meta = match std::fs::metadata(file_path) {
        Ok(m) => m,
        Err(_) => return Value::Null,
    };
    let size = meta.len();
    let is_large = size > 10 * 1024 * 1024; // > 10 MiB

    // DEFAULT_CONFIG.defaultChunkSize = 64KB; bumped for very large files.
    let recommended_chunk_size: u64 = if size > 1024 * 1024 * 1024 {
        256 * 1024 // > 1 GiB
    } else if size > 100 * 1024 * 1024 {
        128 * 1024 // > 100 MiB
    } else {
        64 * 1024
    };

    json!({
        "size": size,
        "sizeFormatted": format_bytes(size),
        "isLarge": is_large,
        "recommendedChunkSize": recommended_chunk_size,
    })
}

/// Route a `largefile:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the data channel `largefile:info`
/// is ported; every heavy/session channel (and anything unknown) returns
/// Value::Null so prefix routing over the whole namespace is safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "largefile:info" => {
            let file_path = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_file_info(file_path)
        }
        // Heavy / native-runtime channels — intentionally not ported, not faked.
        _ => Value::Null,
    }
}
