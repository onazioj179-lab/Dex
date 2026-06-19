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
//
// SKIPPED (heavy / live-runtime; NOT implemented, NOT faked):
//   - transfer:getProgress -> reads the in-memory `activeTransfers` Map
//     (live socket/stream byte counters); no persisted state to read. The
//     renderer reads a shaped object (TransferProgress | null), so we return
//     null for it (the same value Electron yields when the id is unknown,
//     which is always true with no live transfers).
//   - "initiate" — there is NO `transfer:initiate` channel in this controller;
//     the real initiators (transfer:send / :localCopy / :localMove / :receive
//     server controls / :pause / :resume / :cancel / browse dialogs / file IO)
//     are all live-runtime and out of scope for the data tier. Unknown/unported
//     channels in the namespace return Value::Null (honest degrade).
//
// prefixRouteSafe: TRUE — every channel under `transfer:` is either ported at
// its exact shape or returns Value::Null (transfer:getProgress -> null), so
// routing `channel.starts_with("transfer:")` here is correct.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

// Default electron-store file (the controller's Store had no `name`).
const STORE_FILE: &str = "config.json";
// Top-level key inside that store.
const CONFIG_KEY: &str = "transferConfig";

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

/// Route a `transfer:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the data-tier `getConfig` is ported; live
/// transfer/progress channels degrade honestly (Value::Null).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "transfer:getConfig" => get_config(app),
        // Heavy / live-runtime: no persisted state to read. The renderer reads
        // a (TransferProgress | null) shape; null is the value Electron returns
        // for an unknown id, which is always the case with no live transfers.
        "transfer:getProgress" => Value::Null,
        _ => Value::Null,
    }
}
