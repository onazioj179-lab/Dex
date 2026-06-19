// =============================================================================
// DEX Tauri — Snapshot subsystem (port of the read/data `snapshot:*` IPC
// handlers in src/main/services/SnapshotService.ts).
//
// Pure-data, JSON-backed tier. The Electron service wrapped an IN-MEMORY
// MemorySnapshotStore (a Map<id, Snapshot>) behind IPC, with a TODO to swap in
// a persistent store later. There was therefore no Electron file on disk to
// mirror; per the porting brief the fs-json storage name is `snapshots.json`,
// which we place under <appData>/snapshots.json. To preserve the exact store
// semantics (id-keyed Map, list() sorted by takenAt ascending) the file uses a
// single top-level wrapper key:
//   snapshots.json : { "snapshots": { "<id>": Snapshot, ... } }
//
// A Snapshot (from src/shared/storage/blobStore.ts) is EXACTLY:
//   { id: string, takenAt: number, tree: Record<string, string> }
// where `tree` maps a path -> blob sha256. Return shapes match the Electron
// handlers exactly so the renderer is unchanged.
//
// Channels & shapes (from SnapshotService list()/get()):
//   - snapshot:list -> Snapshot[]            (store.list(): all snapshots sorted
//                      by takenAt ascending; [] if none)
//   - snapshot:get  (id) -> Snapshot | null  (store.get(id); JS `undefined`
//                      crosses IPC as null)
//
// SKIPPED heavy channels (need the native BlobStore: content-addressed blob
// refcounting / chunking, which is out of this pure-data tier):
//   - snapshot:capture / :discard / :diff / :prune
//     (the brief's create/delete/restore map onto these). They mutate blob
//     refcounts via MemoryBlobIndex.put/unref, so they cannot be faithfully
//     ported without the native blob backbone. They are NOT implemented and NOT
//     faked: the prefix route returns Value::Null (honest degrade) for them.
//
// DIVERGENCES (documented):
//   - Persistence: Electron's store was process-lifetime in-memory; this tier
//     persists to snapshots.json so list/get survive restarts. This is the only
//     behavioural change and it strictly matches the service's own stated intent
//     ("a future pass swaps these in-memory stores for ... persistent ones").
//     Returned data shapes are identical.
//   - No id/time generation occurs on the ported (read-only) channels, so no
//     pseudo_uuid_v4 / SystemTime is needed here; creation lives in the skipped
//     heavy channels.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const SNAPSHOTS_FILE: &str = "snapshots.json";
const SNAPSHOTS_KEY: &str = "snapshots";

// --- file IO (electron-store/fs-json under appData, mirrors analytics.rs) ----

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(SNAPSHOTS_FILE)
}

fn read_file(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// The id-keyed map of snapshots (the MemorySnapshotStore's backing Map).
fn read_map(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    read_file(app)
        .get(SNAPSHOTS_KEY)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

fn taken_at(s: &Value) -> i64 {
    s.get("takenAt").and_then(|v| v.as_i64()).unwrap_or(0)
}

// store.list(): Array.from(map.values()).sort((a, b) => a.takenAt - b.takenAt)
fn list(app: &tauri::AppHandle) -> Value {
    let mut snaps: Vec<Value> = read_map(app).into_iter().map(|(_, v)| v).collect();
    snaps.sort_by(|a, b| taken_at(a).cmp(&taken_at(b)));
    Value::Array(snaps)
}

// store.get(id): Snapshot | undefined  (undefined -> null over IPC)
fn get(app: &tauri::AppHandle, id: &str) -> Value {
    read_map(app).get(id).cloned().unwrap_or(Value::Null)
}

/// Route a `snapshot:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read/data channels are ported; the heavy
/// blob-backed channels (capture/discard/diff/prune) return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "snapshot:list" => list(app),
        "snapshot:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get(app, id)
        }
        // Heavy / native-blob channels — not ported, not faked.
        _ => Value::Null,
    }
}
