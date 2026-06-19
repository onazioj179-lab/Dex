// =============================================================================
// DEX Tauri — Tagging subsystem (port of the read/CRUD surface of
// src/main/core/FileTaggingSystem.ts).
//
// Pure-data, JSON-backed tier. Only the TAG-MANAGEMENT read channels are ported:
//   - tags:list -> Tag[]        (all tags, sorted by usageCount DESC)
//   - tags:get  -> Tag | null   (one tag by id, or null)
//
// STORAGE divergence (documented): the port brief named the store
// `electron-store:tags`, but FileTaggingSystem does NOT use electron-store. It
// persists a BARE JSON array of Tag under <userData>/tagging/tags.json
// (FileTaggingSystem.saveData -> JSON.stringify(Array.from(this.tags.values()))).
// We mirror that EXACT layout under <appData>/tagging/tags.json: a bare array,
// no top-level key wrapper. Reading an absent/corrupt file yields [] (Electron's
// loadData swallows the read error and starts empty), so tags:list returns [] and
// tags:get returns null until tags exist.
//
// A Tag is (FileTaggingSystem.ts `interface Tag`):
//   { id: string, name: string, color: string, description?: string,
//     icon?: string, createdAt: number, usageCount: number }
// `description` / `icon` are optional and are emitted only when present in the
// stored record (matching how JSON.stringify drops undefined keys), so the
// renderer sees byte-identical objects to what Electron returned.
//
// SORT note: listTags() sorts by `b.usageCount - a.usageCount` (descending,
// stable for ties via Array.prototype.sort). We use a stable sort on the loaded
// order with the same comparator, so equal-usage tags keep file order — matching
// the Electron Map-insertion / load order.
//
// SKIPPED (heavy / stateful — need the native runtime, NOT faked here):
//   - tags:create / tags:update / tags:delete  : mutate the in-memory Map + the
//     live usageCount bookkeeping spread across fileMetadata, emit IPC events,
//     and run the debounced saveData() timer. Porting only the data write would
//     desync usageCount and the metadata.json side, so they are omitted.
//   - "apply" (tagging:addTag / tagging:setTags) : file-tagging writes that touch
//     fileMetadata + pathIndex + tag.usageCount and persist metadata.json; out of
//     scope for the read surface and omitted.
// Omitted channels fall through to Value::Null (honest degrade).
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

const TAGS_FILE: &str = "tags.json";
const TAGGING_DIR: &str = "tagging";

// --- file IO ----------------------------------------------------------------

// <appData>/tagging/tags.json — same relative layout as Electron's
// <userData>/tagging/tags.json.
fn tags_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(TAGGING_DIR);
    let _ = std::fs::create_dir_all(&dir);
    dir.join(TAGS_FILE)
}

// The stored file is a BARE JSON array of Tag. Absent / unparseable -> [].
fn load_tags(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(tags_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

// --- field accessors --------------------------------------------------------

fn id_of(t: &Value) -> Option<&str> {
    t.get("id").and_then(|v| v.as_str())
}

fn usage_count(t: &Value) -> i64 {
    t.get("usageCount").and_then(|v| v.as_i64()).unwrap_or(0)
}

// Re-emit a Tag at the exact Electron shape. Required keys are always present;
// optional keys (description, icon) are only included when the stored record had
// them, mirroring JSON.stringify dropping undefined.
fn shape_tag(t: &Value) -> Value {
    let mut out = Map::new();
    out.insert("id".into(), json!(t.get("id").and_then(|v| v.as_str()).unwrap_or("")));
    out.insert("name".into(), json!(t.get("name").and_then(|v| v.as_str()).unwrap_or("")));
    out.insert("color".into(), json!(t.get("color").and_then(|v| v.as_str()).unwrap_or("")));
    if let Some(d) = t.get("description") {
        if !d.is_null() {
            out.insert("description".into(), d.clone());
        }
    }
    if let Some(ic) = t.get("icon") {
        if !ic.is_null() {
            out.insert("icon".into(), ic.clone());
        }
    }
    out.insert(
        "createdAt".into(),
        json!(t.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)),
    );
    out.insert("usageCount".into(), json!(usage_count(t)));
    Value::Object(out)
}

// --- ported reads -----------------------------------------------------------

// FileTaggingSystem.listTags(): all tags sorted by usageCount DESC (stable).
fn list_tags(app: &tauri::AppHandle) -> Value {
    let mut tags = load_tags(app);
    tags.sort_by(|a, b| usage_count(b).cmp(&usage_count(a)));
    json!(tags.iter().map(shape_tag).collect::<Vec<Value>>())
}

// FileTaggingSystem.getTag(tagId): the matching Tag, or null.
fn get_tag(app: &tauri::AppHandle, tag_id: &str) -> Value {
    load_tags(app)
        .iter()
        .find(|t| id_of(t) == Some(tag_id))
        .map(shape_tag)
        .unwrap_or(Value::Null)
}

/// Route the ported tag-read channels. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the DATA channels are handled; the
/// heavy create/update/delete/apply channels are intentionally NOT matched and
/// fall through to Value::Null (honest degrade — they need the native runtime).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "tags:list" => list_tags(app),
        "tags:get" => {
            let tag_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_tag(app, tag_id)
        }
        _ => Value::Null,
    }
}
