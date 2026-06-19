// =============================================================================
// DEX Tauri — Media-organizer data surface (port of the read/CRUD tier of
// controllers/MediaController.ts).
//
// Pure-data, DataStore-KV tier (same backbone as rule_engine.rs / modes_dispatch
// in main.rs). The Electron MediaController persisted its file index through
// `DataStore.get/set('mediaFiles')`. DataStore is a single electron-store, so on
// Tauri its keys live in the native KV store (dex-kv.json) reached via
// crate::kv_get / crate::kv_set. We therefore read the SAME key string
// ("mediaFiles") DataStore used — mirroring how `rules` / `modes` were ported.
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// A MediaFile is:
//   { id, name, originalName, filePath, type, mimeType, size, tags[],
//     description?, linkedTo?, pinned, createdAt, updatedAt }
//   - type      : 'image' | 'audio' | 'video' | 'document' | 'other'
//   - linkedTo? : { type: 'idea'|'note'|'session', id } (optional)
//   - description? optional
// These are passed through verbatim (we never re-key or invent fields); the index
// is whatever the renderer / importer previously wrote.
//
// Channels & shapes:
//   - mediaorg:list -> MediaFile[]        (the stored array, newest-first by
//                      createdAt, [] if unset — mirrors getAll())
//   - mediaorg:get  -> MediaFile | null   (by id; null if absent — mirrors
//                      getById())
//
// DIVERGENCES (documented):
//   - Naming: the renderer namespace for this data surface is `mediaorg:*`
//     (list/get). In Electron these were the MediaController methods getAll() /
//     getById(); the IPC method names differ but the data results are identical.
//   - getAll() in Electron sorts the in-memory array IN PLACE (mutating the
//     controller's cached order) then returns it. We sort a read-only copy and
//     do not write back — the persisted order is unchanged, but the returned
//     array is identically ordered (newest createdAt first).
//   - The Electron initialize() filtered out index entries whose filePath no
//     longer exists on disk (a startup hygiene pass). That is a side-effecting
//     fs sweep, not part of list/get semantics, so it is NOT reproduced here:
//     list/get return the stored index as-is. Stale entries (if any) are the
//     same data the renderer would have seen before the next restart.
//   - HEAVY channels organize / tag / categorize are NOT ported (they need the
//     native file-mover / classifier runtime). The prefix route returns null for
//     them; see channelsSkipped.
// =============================================================================

use serde_json::{json, Value};

const MEDIA_KEY: &str = "mediaFiles";

fn load(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, MEDIA_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn created_at(f: &Value) -> i64 {
    f.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}

fn id_of(f: &Value) -> Option<&str> {
    f.get("id").and_then(|v| v.as_str())
}

// MediaController.getAll(): newest-first by createdAt.
fn list(app: &tauri::AppHandle) -> Value {
    let mut files = load(app);
    files.sort_by(|a, b| created_at(b).cmp(&created_at(a)));
    json!(files)
}

// MediaController.getById(id): the file, or null.
fn get(app: &tauri::AppHandle, id: &str) -> Value {
    load(app)
        .into_iter()
        .find(|f| id_of(f) == Some(id))
        .unwrap_or(Value::Null)
}

/// Route a `mediaorg:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the data channels (list/get) are handled;
/// every other channel in the namespace — including the heavy organize/tag/
/// categorize — returns Value::Null (honest degrade), so prefix routing on
/// `mediaorg:` is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "mediaorg:list" => list(app),
        "mediaorg:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get(app, id)
        }
        _ => Value::Null,
    }
}
