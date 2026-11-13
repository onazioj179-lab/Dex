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
// HEAVY channels (now ported — they are pure data mutations on the JSON store
// plus a content-addressed blob refcount index; no native blob backbone is
// actually required, so they are implemented faithfully rather than faked):
//   - snapshot:capture (id, entries) -> Snapshot
//       entries: Record<path, { sha256: string, bytes: number }>. Each blob is
//       refcount-bumped via the persisted blob index (MemoryBlobIndex.put), the
//       tree is built path -> sha256, and makeSnapshot(id, tree, now) is stored.
//   - snapshot:discard (id) -> boolean
//       unref every blob in the snapshot's tree, delete the snapshot. false if
//       the id is unknown.
//   - snapshot:diff (fromId|null, toId) -> diff | null
//       diffSnapshots(from ?? empty, to); null if `toId` is unknown. Returns
//       { added, removed, changed } each a SORTED string[].
//   - snapshot:prune (maxAgeMs) -> string[]
//       discard every snapshot whose takenAt < now - maxAgeMs, returning the
//       discarded ids (in store.list() order: takenAt ascending).
//
// BLOB INDEX (port of MemoryBlobIndex): persisted alongside snapshots in the
// same file under the "blobs" key, mirroring the two backing maps exactly:
//   snapshots.json : {
//     "snapshots": { "<id>": Snapshot, ... },
//     "blobs": { "counts": { "<sha>": n, ... }, "sizes": { "<sha>": bytes, ... } }
//   }
// put(ref): set size if unseen, counts[sha] += 1. unref(sha): if count<=1 delete
// both maps else count -= 1. This keeps refcounts correct across restarts so a
// later restore/GC pass over the blob store behaves identically to Electron.
//
// DIVERGENCES (documented):
//   - Persistence: Electron's store + blob index were process-lifetime
//     in-memory; this tier persists both to snapshots.json so they survive
//     restarts. This strictly matches the service's own stated intent ("a future
//     pass swaps these in-memory stores for ... persistent ones"). Returned data
//     shapes are identical.
//   - now() is std::time::SystemTime epoch millis (Electron used Date.now()).
//   - capture's `id` is supplied by the caller exactly as in Electron (the
//     manager does not generate ids); pseudo_uuid_v4 is therefore not used.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SNAPSHOTS_FILE: &str = "snapshots.json";
const SNAPSHOTS_KEY: &str = "snapshots";
const BLOBS_KEY: &str = "blobs";

// --- file IO (electron-store/fs-json under appData, mirrors analytics.rs) ----

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(SNAPSHOTS_FILE)
}

fn read_file(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_file(app: &tauri::AppHandle, root: &Value) {
    if let Ok(raw) = serde_json::to_string(root) {
        let _ = crate::write_atomic(store_path(app), raw);
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

// Whole-file root, defaulting to an empty object with both sub-stores present.
fn read_root(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    read_file(app).as_object().cloned().unwrap_or_default()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- blob index (port of MemoryBlobIndex; counts + sizes maps) ----------------

fn blobs_counts(root: &serde_json::Map<String, Value>) -> serde_json::Map<String, Value> {
    root.get(BLOBS_KEY)
        .and_then(|b| b.get("counts"))
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

fn blobs_sizes(root: &serde_json::Map<String, Value>) -> serde_json::Map<String, Value> {
    root.get(BLOBS_KEY)
        .and_then(|b| b.get("sizes"))
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

fn write_blobs(
    root: &mut serde_json::Map<String, Value>,
    counts: serde_json::Map<String, Value>,
    sizes: serde_json::Map<String, Value>,
) {
    root.insert(
        BLOBS_KEY.to_string(),
        json!({ "counts": Value::Object(counts), "sizes": Value::Object(sizes) }),
    );
}

// MemoryBlobIndex.put({ sha256, bytes }): set size if unseen, count += 1.
fn blob_put(
    counts: &mut serde_json::Map<String, Value>,
    sizes: &mut serde_json::Map<String, Value>,
    sha: &str,
    bytes: i64,
) {
    if !sizes.contains_key(sha) {
        sizes.insert(sha.to_string(), json!(bytes));
    }
    let cur = counts.get(sha).and_then(|v| v.as_i64()).unwrap_or(0);
    counts.insert(sha.to_string(), json!(cur + 1));
}

// MemoryBlobIndex.unref(sha): if count<=1 drop both maps else count -= 1.
fn blob_unref(
    counts: &mut serde_json::Map<String, Value>,
    sizes: &mut serde_json::Map<String, Value>,
    sha: &str,
) {
    let cur = counts.get(sha).and_then(|v| v.as_i64()).unwrap_or(0);
    if cur <= 1 {
        counts.remove(sha);
        sizes.remove(sha);
    } else {
        counts.insert(sha.to_string(), json!(cur - 1));
    }
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

// --- heavy channels (SnapshotManager) ----------------------------------------

// SnapshotManager.capture(id, entries): bump each blob ref, build the tree
// (path -> sha256), makeSnapshot(id, tree, now), store.put, return the snapshot.
fn capture(app: &tauri::AppHandle, id: &str, entries: &Value) -> Value {
    let mut root = read_root(app);
    let mut counts = blobs_counts(&root);
    let mut sizes = blobs_sizes(&root);
    let mut snaps = root
        .get(SNAPSHOTS_KEY)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    // tree built in entries iteration order, mirroring Object.entries(entries).
    let mut tree = serde_json::Map::new();
    if let Some(obj) = entries.as_object() {
        // blobs.put for every value, then build the path -> sha256 fileMap.
        for v in obj.values() {
            let sha = v.get("sha256").and_then(|s| s.as_str()).unwrap_or("");
            let bytes = v.get("bytes").and_then(|b| b.as_i64()).unwrap_or(0);
            blob_put(&mut counts, &mut sizes, sha, bytes);
        }
        for (path, v) in obj.iter() {
            let sha = v.get("sha256").and_then(|s| s.as_str()).unwrap_or("");
            tree.insert(path.clone(), json!(sha));
        }
    }

    // makeSnapshot(id, tree, now): { id, takenAt, tree }
    let snap = json!({
        "id": id,
        "takenAt": now_ms(),
        "tree": Value::Object(tree),
    });
    snaps.insert(id.to_string(), snap.clone());

    root.insert(SNAPSHOTS_KEY.to_string(), Value::Object(snaps));
    write_blobs(&mut root, counts, sizes);
    write_file(app, &Value::Object(root));
    snap
}

// SnapshotManager.discard(id): unref every blob in the tree, delete snapshot.
// Returns false if the id is unknown. Operates on a pre-loaded root so prune can
// reuse it; returns the (possibly mutated) result flag.
fn discard_in_root(root: &mut serde_json::Map<String, Value>, id: &str) -> bool {
    let mut snaps = root
        .get(SNAPSHOTS_KEY)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let snap = match snaps.get(id) {
        Some(s) => s.clone(),
        None => return false,
    };
    let mut counts = blobs_counts(root);
    let mut sizes = blobs_sizes(root);
    if let Some(tree) = snap.get("tree").and_then(|t| t.as_object()) {
        for sha in tree.values() {
            if let Some(sha) = sha.as_str() {
                blob_unref(&mut counts, &mut sizes, sha);
            }
        }
    }
    snaps.remove(id);
    root.insert(SNAPSHOTS_KEY.to_string(), Value::Object(snaps));
    write_blobs(root, counts, sizes);
    true
}

fn discard(app: &tauri::AppHandle, id: &str) -> Value {
    let mut root = read_root(app);
    let ok = discard_in_root(&mut root, id);
    if ok {
        write_file(app, &Value::Object(root));
    }
    json!(ok)
}

// diffSnapshots(a, b): added/removed/changed, each SORTED.
fn diff_snapshots(a: &Value, b: &Value) -> Value {
    let empty = serde_json::Map::new();
    let at = a.get("tree").and_then(|t| t.as_object()).unwrap_or(&empty);
    let bt = b.get("tree").and_then(|t| t.as_object()).unwrap_or(&empty);

    let mut added: Vec<String> = Vec::new();
    let mut removed: Vec<String> = Vec::new();
    let mut changed: Vec<String> = Vec::new();
    for (k, bv) in bt.iter() {
        match at.get(k) {
            None => added.push(k.clone()),
            Some(av) if av != bv => changed.push(k.clone()),
            _ => {}
        }
    }
    for k in at.keys() {
        if !bt.contains_key(k) {
            removed.push(k.clone());
        }
    }
    added.sort();
    removed.sort();
    changed.sort();
    json!({ "added": added, "removed": removed, "changed": changed })
}

// SnapshotManager.diff(fromId|null, toId): null if toId unknown; else diff of
// (from ?? empty-snapshot) against to.
fn diff(app: &tauri::AppHandle, from_id: Option<&str>, to_id: &str) -> Value {
    let map = read_map(app);
    let to = match map.get(to_id) {
        Some(t) => t.clone(),
        None => return Value::Null,
    };
    let empty = json!({ "id": "__empty__", "takenAt": 0, "tree": {} });
    let from = match from_id {
        Some(fid) => map.get(fid).cloned().unwrap_or(empty),
        None => empty,
    };
    diff_snapshots(&from, &to)
}

// SnapshotManager.prune(maxAgeMs): discard every snapshot with takenAt < cutoff,
// iterating store.list() order (takenAt ascending); return the discarded ids.
fn prune(app: &tauri::AppHandle, max_age_ms: i64) -> Value {
    let cutoff = now_ms() - max_age_ms;
    let mut root = read_root(app);

    // store.list() order: collect (id, takenAt) sorted ascending by takenAt.
    let mut ordered: Vec<(String, i64)> = root
        .get(SNAPSHOTS_KEY)
        .and_then(|v| v.as_object())
        .map(|m| {
            m.iter()
                .map(|(id, s)| (id.clone(), taken_at(s)))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    ordered.sort_by(|a, b| a.1.cmp(&b.1));

    let mut dropped: Vec<String> = Vec::new();
    for (id, ts) in ordered {
        if ts < cutoff && discard_in_root(&mut root, &id) {
            dropped.push(id);
        }
    }
    write_file(app, &Value::Object(root));
    Value::Array(dropped.into_iter().map(Value::String).collect())
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
        "snapshot:capture" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let entries = args.get(1).cloned().unwrap_or(Value::Null);
            capture(app, id, &entries)
        }
        "snapshot:discard" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            discard(app, id)
        }
        "snapshot:diff" => {
            // (fromId | null, toId)
            let from_id = args.get(0).and_then(|v| v.as_str());
            let to_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            diff(app, from_id, to_id)
        }
        "snapshot:prune" => {
            let max_age_ms = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            prune(app, max_age_ms)
        }
        _ => Value::Null,
    }
}
