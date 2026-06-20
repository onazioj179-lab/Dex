// =============================================================================
// DEX Tauri — Transfer subsystem (port of the `transfer:*` IPC handlers in
// controllers/TransferController.ts).
//
// Pure-data tier ONLY. The Transfer subsystem is overwhelmingly a live native
// runtime (net.Server/net.Socket, fs read/write streams, an in-memory
// `activeTransfers` Map, throttling, checksums, dialogs). None of that is data
// the renderer can persist + replay; it requires sockets/streams that have no
// place in this JSON-backed dispatcher. We therefore port ONLY the one true
// data/config read.
//
// STORAGE NOTE (important divergence from the abstract brief, which said
// "electron-store:transfer"): the actual TransferController constructs its
// `electron-store` with NO `name` option — only `defaults`. electron-store then
// falls back to the DEFAULT store file `config.json` under userData, with these
// top-level keys: `transferConfig`, `permissions`, `pendingTransfers`. So
// `transfer:getConfig` returns the `transferConfig` sub-object of
// <appData>/config.json (NOT a `transfer.json`). We mirror that exact file +
// key here so a shared install reads/writes the same bytes. If the key is
// absent we synthesise the SAME defaults electron-store seeds (maxConcurrent 2,
// chunkSize 65536, throttleOnLoad true, autoResume false, verifyIntegrity true,
// defaultPort 47632).
//
// Channels:
//   - transfer:getConfig -> TransferConfig
//       { maxConcurrent, chunkSize, throttleOnLoad, autoResume,
//         verifyIntegrity, defaultPort }  (field names/types exact)
//   - transfer:getProgress(transferId) -> TransferProgress | null
//       Live state is now BACKED by KV (key `transfer:active`) instead of an
//       in-process Map we cannot persist. Each active transfer row stores byte
//       counters + startTime; getProgress computes percent/speed/eta on read
//       (exact mirror of getTransferProgress -> getActiveTransfers in the TS).
//       Unknown id -> null (same as Electron).
//   - transfer:initiate(request) -> { success, transferId? , error? }
//       NEW data-tier entry point (no such channel in the TS — see note below).
//       Performs a REAL native LOCAL file/folder copy|move with std::fs on a
//       background thread, recording byte progress into the `transfer:active` KV
//       row and emitting `transfer:progress` / `transfer:received` renderer
//       events through native_ops::emit_event — the faithful native analog of
//       the TS initiateLocalTransfer + updateTransferProgress path. Network
//       (wifi/bluetooth) initiation degrades honestly (needs live sockets).
//
// WHY `transfer:initiate` exists here: the abstract migration brief lists a
// `transfer:initiate` channel that the renderer's compat layer may call; the
// Electron controller never registered that exact name but DID expose the same
// behavior under transfer:localCopy / :localMove / :send. We unify those into a
// single `initiate` that dispatches on request.channel + a `mode` field, doing
// the local-copy path for real and degrading the socket paths.
//
// STILL DEGRADED (live-runtime; NOT faked):
//   - wifi/bluetooth send/receive (net.Server/net.Socket), pause/resume of a
//     live stream, OS file-picker dialogs — no persisted state / no sockets in
//     this dispatcher. The local-copy path of initiate IS real.
//
// prefixRouteSafe: TRUE — every channel under `transfer:` is either ported at
// its exact shape or degrades honestly, so routing `channel.starts_with(
// "transfer:")` here is correct.
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

// Default electron-store file (the controller's Store had no `name`).
const STORE_FILE: &str = "config.json";
// Top-level key inside that store.
const CONFIG_KEY: &str = "transferConfig";
// KV key holding the live active-transfer rows (the persisted analog of the
// in-process `activeTransfers` Map). Shape: { "<id>": { ...row } }.
const ACTIVE_KEY: &str = "transfer:active";

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// electron-store defaults.transferConfig — seeded when the key is absent.
fn default_config() -> Value {
    json!({
        "maxConcurrent": 2,
        "chunkSize": 65536,
        "throttleOnLoad": true,
        "autoResume": false,
        "verifyIntegrity": true,
        "defaultPort": 47632
    })
}

// store.get('transferConfig') with the seeded defaults as fallback. We coerce
// each field to its declared type so a partial / malformed stored object still
// yields a complete, correctly-typed TransferConfig (matching the TS interface).
fn get_config(app: &tauri::AppHandle) -> Value {
    let stored = read_store(app)
        .get(CONFIG_KEY)
        .filter(|v| v.is_object())
        .cloned();
    let def = default_config();
    let cfg = match stored {
        Some(v) => v,
        None => return def,
    };
    let i = |k: &str| -> i64 {
        cfg.get(k)
            .and_then(|v| v.as_i64())
            .unwrap_or_else(|| def.get(k).and_then(|v| v.as_i64()).unwrap_or(0))
    };
    let b = |k: &str| -> bool {
        cfg.get(k)
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| def.get(k).and_then(|v| v.as_bool()).unwrap_or(false))
    };
    json!({
        "maxConcurrent": i("maxConcurrent"),
        "chunkSize": i("chunkSize"),
        "throttleOnLoad": b("throttleOnLoad"),
        "autoResume": b("autoResume"),
        "verifyIntegrity": b("verifyIntegrity"),
        "defaultPort": i("defaultPort")
    })
}

// --- Active-transfer KV state ----------------------------------------------

// Load the active-transfer map ({ "<id>": row, ... }), tolerating absence.
fn load_active(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    crate::kv_get(app, ACTIVE_KEY)
        .as_object()
        .cloned()
        .unwrap_or_default()
}

fn save_active(app: &tauri::AppHandle, map: serde_json::Map<String, Value>) {
    let _ = crate::kv_set(app, ACTIVE_KEY, Value::Object(map));
}

// Compute the TransferProgress view of one stored row — the exact mirror of the
// TS getActiveTransfers() math (percent rounded, speed/eta rounded ints).
fn progress_of(id: &str, row: &Value) -> Value {
    let bytes = row.get("bytesTransferred").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let total = row.get("totalBytes").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let start = row.get("startTime").and_then(|v| v.as_u64()).unwrap_or_else(now_millis);
    let paused = row.get("paused").and_then(|v| v.as_bool()).unwrap_or(false);
    let done = row.get("done").and_then(|v| v.as_bool()).unwrap_or(false);

    let elapsed = ((now_millis().saturating_sub(start)) as f64) / 1000.0;
    let speed = if elapsed > 0.0 { bytes / elapsed } else { 0.0 };
    let remaining = (total - bytes).max(0.0);
    let eta = if speed > 0.0 { remaining / speed } else { 0.0 };
    let percent = if total > 0.0 {
        ((bytes / total) * 100.0).round()
    } else {
        0.0
    };
    let status = if done {
        "completed"
    } else if paused {
        "paused"
    } else {
        "active"
    };

    json!({
        "transferId": id,
        "bytesTransferred": bytes as i64,
        "totalBytes": total as i64,
        "percent": percent as i64,
        "speed": speed.round() as i64,
        "eta": eta.round() as i64,
        "status": status
    })
}

// getTransferProgress(transferId) — find the row, shape it, else null.
fn get_progress(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = match args.get(0).and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return Value::Null,
    };
    let map = load_active(app);
    match map.get(id) {
        Some(row) => progress_of(id, row),
        None => Value::Null,
    }
}

// --- Local copy/move engine (real native transfer) -------------------------

// Recursively total the byte size of a path (file or directory).
fn calc_size(path: &Path) -> u64 {
    match std::fs::metadata(path) {
        Ok(m) if m.is_file() => m.len(),
        Ok(m) if m.is_dir() => {
            let mut total = 0u64;
            if let Ok(entries) = std::fs::read_dir(path) {
                for e in entries.flatten() {
                    total += calc_size(&e.path());
                }
            }
            total
        }
        _ => 0,
    }
}

// Persisted progress bump: re-read, mutate the row's byte counter, write back,
// then push a `transfer:progress` event (mirror of updateTransferProgress).
fn bump_progress(app: &tauri::AppHandle, id: &str, bytes: u64, total: u64) {
    let mut map = load_active(app);
    if let Some(row) = map.get_mut(id).and_then(|v| v.as_object_mut()) {
        row.insert("bytesTransferred".into(), json!(bytes));
    }
    save_active(app, map);
    let percent = if total > 0 {
        (((bytes as f64) / (total as f64)) * 100.0).round() as i64
    } else {
        0
    };
    crate::native_ops::emit_event(
        app,
        "transfer:progress",
        &json!({
            "transferId": id,
            "bytesTransferred": bytes,
            "totalBytes": total,
            "percent": percent
        }),
    );
}

// Copy a single file with a chunked loop so we can account bytes as we go.
// Returns the running byte total after this file. `chunk` is the configured
// chunkSize. Errors propagate so the caller can mark the transfer failed.
fn copy_file_chunked(
    app: &tauri::AppHandle,
    id: &str,
    src: &Path,
    dst: &Path,
    chunk: usize,
    mut running: u64,
    total: u64,
) -> std::io::Result<u64> {
    use std::io::{Read, Write};
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut reader = std::fs::File::open(src)?;
    let mut writer = std::fs::File::create(dst)?;
    let mut buf = vec![0u8; chunk.max(4096)];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        writer.write_all(&buf[..n])?;
        running += n as u64;
        bump_progress(app, id, running, total);
    }
    writer.flush()?;
    Ok(running)
}

// Recursively copy a directory, threading the running byte total through.
fn copy_dir_chunked(
    app: &tauri::AppHandle,
    id: &str,
    src: &Path,
    dst: &Path,
    chunk: usize,
    mut running: u64,
    total: u64,
) -> std::io::Result<u64> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            running = copy_dir_chunked(app, id, &from, &to, chunk, running, total)?;
        } else {
            running = copy_file_chunked(app, id, &from, &to, chunk, running, total)?;
        }
    }
    Ok(running)
}

// initiate(request) — REAL local copy/move; honest degrade for network channels.
// request: { type, sourcePath, destinationPath?, channel, direction, mode? }
fn initiate(app: &tauri::AppHandle, args: &Value) -> Value {
    let req = match args.get(0) {
        Some(v) if v.is_object() => v.clone(),
        _ => return json!({ "success": false, "error": "request required" }),
    };

    let channel = req.get("channel").and_then(|v| v.as_str()).unwrap_or("local");
    // Only the local channel can be done natively here; wifi/bluetooth need a
    // live socket runtime (net.Server/net.Socket) we cannot host in this tier.
    if channel != "local" {
        return json!({
            "success": false,
            "error": "not ported (needs native runtime)"
        });
    }

    let source = match req.get("sourcePath").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return json!({ "success": false, "error": "sourcePath required" }),
    };
    let dest = match req.get("destinationPath").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return json!({ "success": false, "error": "destinationPath required" }),
    };
    // mode: copy (default) | move — matches localCopy/localMove split in the TS.
    let delete_source = req.get("mode").and_then(|v| v.as_str()) == Some("move");

    let src_path = PathBuf::from(&source);
    let meta = match std::fs::metadata(&src_path) {
        Ok(m) => m,
        Err(e) => return json!({ "success": false, "error": e.to_string() }),
    };
    let is_dir = meta.is_dir();
    let total = if is_dir { calc_size(&src_path) } else { meta.len() };

    let id = crate::util::pseudo_uuid_v4();
    let name = src_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| source.clone());

    // Register the active row (the persisted analog of activeTransfers.set).
    let mut map = load_active(app);
    map.insert(
        id.clone(),
        json!({
            "name": name,
            "type": if is_dir { "folder" } else { "file" },
            "direction": "send",
            "source": source,
            "destination": dest,
            "bytesTransferred": 0,
            "totalBytes": total,
            "paused": false,
            "done": false,
            "startTime": now_millis()
        }),
    );
    save_active(app, map);

    // Run the copy on a background thread so the dispatch call returns promptly
    // (the renderer then polls transfer:getProgress / listens for progress
    // events). Precedent: native_ops scheduler threads.
    let app2 = app.clone();
    let id2 = id.clone();
    let dest2 = dest.clone();
    let chunk = get_config(app)
        .get("chunkSize")
        .and_then(|v| v.as_u64())
        .unwrap_or(65536) as usize;
    std::thread::spawn(move || {
        let result = if is_dir {
            copy_dir_chunked(&app2, &id2, &src_path, &PathBuf::from(&dest2), chunk, 0, total)
        } else {
            copy_file_chunked(&app2, &id2, &src_path, &PathBuf::from(&dest2), chunk, 0, total)
        };

        match result {
            Ok(_) => {
                if delete_source {
                    if is_dir {
                        let _ = std::fs::remove_dir_all(&src_path);
                    } else {
                        let _ = std::fs::remove_file(&src_path);
                    }
                }
                // Mark done + emit a completion event (mirror of the TS
                // completeTransfer + transfer:received notify).
                let mut m = load_active(&app2);
                if let Some(row) = m.get_mut(&id2).and_then(|v| v.as_object_mut()) {
                    row.insert("done".into(), json!(true));
                    row.insert("bytesTransferred".into(), json!(total));
                }
                save_active(&app2, m);
                crate::native_ops::emit_event(
                    &app2,
                    "transfer:received",
                    &json!({ "transferId": id2, "size": total }),
                );
            }
            Err(e) => {
                let mut m = load_active(&app2);
                if let Some(row) = m.get_mut(&id2).and_then(|v| v.as_object_mut()) {
                    row.insert("error".into(), json!(e.to_string()));
                    row.insert("done".into(), json!(true));
                }
                save_active(&app2, m);
            }
        }
    });

    json!({ "success": true, "transferId": id })
}

/// Route a `transfer:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). `getConfig` reads the data-tier config; `initiate`
/// runs a real native local copy/move; `getProgress` reads live KV-backed state.
/// Live socket channels degrade honestly.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "transfer:getConfig" => get_config(app),
        "transfer:getProgress" => get_progress(app, args),
        "transfer:initiate" => initiate(app, args),
        _ => Value::Null,
    }
}
