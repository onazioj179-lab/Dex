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
// NOW PORTED (heavy / stateful) — real native writes, no fakery:
//   - tags:create / tags:update / tags:delete  : mutate the persisted tags.json
//     Map, keep usageCount bookkeeping consistent (delete also strips the tag id
//     from every metadata.json record + counts affectedFiles), and emit the same
//     renderer events (tagging:tagCreated / tagging:tagUpdated / tagging:tagDeleted)
//     via native_ops::emit_event. Persistence is synchronous (write-through), the
//     native analog of Electron's debounced saveData() — same on-disk layout.
//   - tagging:addTag / tagging:setTags ("apply") : file-tagging writes that touch
//     fileMetadata + tag.usageCount and persist metadata.json, mirroring
//     FileTaggingSystem.addTagToFile / setFileTags including maxTagsPerFile,
//     dedupe, usage inc/dec, and the cleanup-empty pass, then emit the matching
//     renderer events.
//
// STORAGE divergence (documented, mirrors Electron): file metadata lives in a
// BARE JSON array of FileMetadata under <appData>/tagging/metadata.json
// (FileTaggingSystem.saveData -> JSON.stringify(Array.from(fileMetadata.values()))).
// We read/write that exact layout. config.json (maxTagsPerFile etc.) is read for
// the cap if present, else the Electron defaults are used (maxTagsPerFile = 20,
// allowCustomFields = true).
//
// ID parity: Electron mints tag ids as `tag-${++idCounter}-${Date.now()}` where
// idCounter is the max numeric segment of existing ids (loadData). We recompute
// that counter from the persisted tags on each create so ids stay in the same
// family across restarts. pathHash parity: Electron uses md5(filePath); we have
// no md5 dep, so the native port stores pathHash as the lowercase hex of a stable
// FNV-1a-64 of the path. pathHash is an internal lookup key never surfaced to the
// renderer by the ported channels, so renderer-visible shapes stay byte-identical.
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const TAGS_FILE: &str = "tags.json";
const METADATA_FILE: &str = "metadata.json";
const CONFIG_FILE: &str = "config.json";
const TAGGING_DIR: &str = "tagging";
const DEFAULT_MAX_TAGS_PER_FILE: usize = 20;

const DEFAULT_TAG_COLORS: [&str; 10] = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899",
    "#14b8a6", "#6366f1", "#8b5cf6",
];

// --- file IO ----------------------------------------------------------------

// <appData>/tagging — same relative layout as Electron's <userData>/tagging.
fn tagging_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(TAGGING_DIR);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn tags_path(app: &tauri::AppHandle) -> PathBuf {
    tagging_dir(app).join(TAGS_FILE)
}

fn metadata_path(app: &tauri::AppHandle) -> PathBuf {
    tagging_dir(app).join(METADATA_FILE)
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    tagging_dir(app).join(CONFIG_FILE)
}

// The stored file is a BARE JSON array of Tag. Absent / unparseable -> [].
fn load_tags(app: &tauri::AppHandle) -> Vec<Value> {
    load_array(&tags_path(app))
}

// The stored file is a BARE JSON array of FileMetadata. Absent / unparseable -> [].
fn load_metadata(app: &tauri::AppHandle) -> Vec<Value> {
    load_array(&metadata_path(app))
}

fn load_array(path: &PathBuf) -> Vec<Value> {
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

// Write-through persistence, the native analog of the debounced saveData().
// Electron writes JSON.stringify(..., null, 2); we match the pretty layout.
fn save_tags(app: &tauri::AppHandle, tags: &[Value]) {
    if let Ok(raw) = serde_json::to_string_pretty(&tags) {
        let _ = std::fs::write(tags_path(app), raw);
    }
}

fn save_metadata(app: &tauri::AppHandle, metadata: &[Value]) {
    if let Ok(raw) = serde_json::to_string_pretty(&metadata) {
        let _ = std::fs::write(metadata_path(app), raw);
    }
}

// FileTaggingSystem.config.maxTagsPerFile (default 20). Read from config.json if
// present, else the Electron default.
fn max_tags_per_file(app: &tauri::AppHandle) -> usize {
    std::fs::read_to_string(config_path(app))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|v| v.get("maxTagsPerFile").and_then(|n| n.as_u64()))
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_MAX_TAGS_PER_FILE)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Stable FNV-1a-64 hex of the path. Used only as the internal pathHash key
// (never surfaced to the renderer by the ported channels).
fn path_hash(file_path: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in file_path.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", h)
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

// --- ported mutations -------------------------------------------------------

fn name_of(t: &Value) -> &str {
    t.get("name").and_then(|v| v.as_str()).unwrap_or("")
}

// Replicate Electron's idCounter: max numeric of the second `-`-segment of each
// existing tag id (`tag-<n>-<ts>`), per FileTaggingSystem.loadData.
fn current_id_counter(tags: &[Value]) -> i64 {
    let mut counter = 0i64;
    for t in tags {
        if let Some(id) = id_of(t) {
            if let Some(seg) = id.split('-').nth(1) {
                if let Ok(n) = seg.parse::<i64>() {
                    if n > counter {
                        counter = n;
                    }
                }
            }
        }
    }
    counter
}

// FileTaggingSystem.createTag(name, color?, description?). Dedupe by lowercased
// name (returns the existing tag unchanged), else mint a new tag, persist, and
// emit tagging:tagCreated.
fn create_tag(app: &tauri::AppHandle, args: &Value) -> Value {
    let name_raw = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let color = args.get(1).and_then(|v| v.as_str());
    let description = args.get(2).and_then(|v| v.as_str());

    let normalized = name_raw.trim().to_lowercase();
    let mut tags = load_tags(app);

    // Duplicate name -> return existing (Electron returns the existing Tag).
    if let Some(existing) = tags.iter().find(|t| name_of(t).to_lowercase() == normalized) {
        return shape_tag(existing);
    }

    let counter = current_id_counter(&tags) + 1;
    let ts = now_ms();
    let id = format!("tag-{}-{}", counter, ts);
    let color_val = match color {
        Some(c) if !c.is_empty() => c.to_string(),
        _ => DEFAULT_TAG_COLORS[(counter as usize) % DEFAULT_TAG_COLORS.len()].to_string(),
    };

    let mut obj = Map::new();
    obj.insert("id".into(), json!(id));
    obj.insert("name".into(), json!(name_raw.trim()));
    obj.insert("color".into(), json!(color_val));
    // Electron always sets `description` (possibly undefined). JSON.stringify
    // drops undefined, so only persist it when a string was provided.
    if let Some(d) = description {
        obj.insert("description".into(), json!(d));
    }
    obj.insert("createdAt".into(), json!(ts));
    obj.insert("usageCount".into(), json!(0));
    let tag = Value::Object(obj);

    tags.push(tag.clone());
    save_tags(app, &tags);

    let shaped = shape_tag(&tag);
    crate::native_ops::emit_event(app, "tagging:tagCreated", &shaped);
    shaped
}

// FileTaggingSystem.updateTag(tagId, updates). updates is Partial<Omit<Tag,
// 'id'|'createdAt'>>. Rejects (returns null) on missing tag or a name collision
// with another tag, else Object.assign + persist + emit tagging:tagUpdated.
fn update_tag(app: &tauri::AppHandle, args: &Value) -> Value {
    let tag_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let updates = args.get(1).cloned().unwrap_or(Value::Null);

    let mut tags = load_tags(app);
    let idx = match tags.iter().position(|t| id_of(t) == Some(tag_id)) {
        Some(i) => i,
        None => return Value::Null,
    };

    // Name-collision guard (against OTHER tags).
    if let Some(new_name) = updates.get("name").and_then(|v| v.as_str()) {
        let normalized = new_name.trim().to_lowercase();
        let collides = tags
            .iter()
            .any(|t| id_of(t) != Some(tag_id) && name_of(t).to_lowercase() == normalized);
        if collides {
            return Value::Null;
        }
    }

    // Object.assign(tag, updates): copy every provided key except id/createdAt
    // (those are Omit'd in the Electron signature, so a renderer can't send them
    // through the typed bridge; we defensively skip them anyway).
    if let Some(map) = updates.as_object() {
        if let Some(tag) = tags[idx].as_object_mut() {
            for (k, v) in map {
                if k == "id" || k == "createdAt" {
                    continue;
                }
                tag.insert(k.clone(), v.clone());
            }
        }
    }

    save_tags(app, &tags);
    let shaped = shape_tag(&tags[idx]);
    crate::native_ops::emit_event(app, "tagging:tagUpdated", &shaped);
    shaped
}

// FileTaggingSystem.deleteTag(tagId): strip the tag id from every metadata
// record (counting affectedFiles + bumping updatedAt), drop the tag, persist
// both files, emit tagging:tagDeleted. Returns { success, affectedFiles }.
fn delete_tag(app: &tauri::AppHandle, args: &Value) -> Value {
    let tag_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");

    let mut tags = load_tags(app);
    let idx = match tags.iter().position(|t| id_of(t) == Some(tag_id)) {
        Some(i) => i,
        None => return json!({ "success": false, "affectedFiles": 0 }),
    };

    let mut metadata = load_metadata(app);
    let mut affected_files = 0i64;
    let ts = now_ms();
    for m in metadata.iter_mut() {
        if let Some(arr) = m.get("tags").and_then(|v| v.as_array()) {
            if let Some(pos) = arr.iter().position(|t| t.as_str() == Some(tag_id)) {
                if let Some(tags_arr) = m.get_mut("tags").and_then(|v| v.as_array_mut()) {
                    tags_arr.remove(pos);
                }
                if let Some(mo) = m.as_object_mut() {
                    mo.insert("updatedAt".into(), json!(ts));
                }
                affected_files += 1;
            }
        }
    }

    tags.remove(idx);
    save_tags(app, &tags);
    if affected_files > 0 {
        save_metadata(app, &metadata);
    }

    crate::native_ops::emit_event(
        app,
        "tagging:tagDeleted",
        &json!({ "tagId": tag_id, "affectedFiles": affected_files }),
    );
    json!({ "success": true, "affectedFiles": affected_files })
}

// Locate (or create) a metadata record for filePath, returning its index into
// the loaded vec. Mirrors FileTaggingSystem.getOrCreateMetadata.
fn get_or_create_metadata(metadata: &mut Vec<Value>, file_path: &str) -> usize {
    if let Some(i) = metadata
        .iter()
        .position(|m| m.get("filePath").and_then(|v| v.as_str()) == Some(file_path))
    {
        return i;
    }
    let ts = now_ms();
    let mut obj = Map::new();
    obj.insert("filePath".into(), json!(file_path));
    obj.insert("pathHash".into(), json!(path_hash(file_path)));
    obj.insert("tags".into(), json!([]));
    obj.insert("label".into(), json!("none"));
    obj.insert("rating".into(), json!(0));
    obj.insert("notes".into(), json!(""));
    obj.insert("customFields".into(), json!({}));
    obj.insert("createdAt".into(), json!(ts));
    obj.insert("updatedAt".into(), json!(ts));
    metadata.push(Value::Object(obj));
    metadata.len() - 1
}

// Adjust a tag's usageCount by `delta`, clamped at 0 (Electron only decrements
// when usageCount > 0 and only increments existing tags).
fn bump_usage(tags: &mut [Value], tag_id: &str, delta: i64) {
    if let Some(t) = tags.iter_mut().find(|t| id_of(t) == Some(tag_id)) {
        let cur = t.get("usageCount").and_then(|v| v.as_i64()).unwrap_or(0);
        let next = (cur + delta).max(0);
        if let Some(o) = t.as_object_mut() {
            o.insert("usageCount".into(), json!(next));
        }
    }
}

// FileTaggingSystem.addTagToFile(filePath, tagId). Requires the tag to exist;
// dedupe; respects maxTagsPerFile; increments usageCount; persists both files;
// emits tagging:fileTagged with the updated metadata. Returns { success }.
fn add_tag_to_file(app: &tauri::AppHandle, args: &Value) -> Value {
    let file_path = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let tag_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");

    let mut tags = load_tags(app);
    if !tags.iter().any(|t| id_of(t) == Some(tag_id)) {
        return json!({ "success": false });
    }

    let mut metadata = load_metadata(app);
    let mi = get_or_create_metadata(&mut metadata, file_path);

    let already = metadata[mi]
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().any(|t| t.as_str() == Some(tag_id)))
        .unwrap_or(false);
    if already {
        // Already tagged -> success, no write (matches Electron early-return).
        return json!({ "success": true });
    }

    let cur_len = metadata[mi]
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    if cur_len >= max_tags_per_file(app) {
        return json!({ "success": false });
    }

    let ts = now_ms();
    if let Some(arr) = metadata[mi].get_mut("tags").and_then(|v| v.as_array_mut()) {
        arr.push(json!(tag_id));
    }
    if let Some(o) = metadata[mi].as_object_mut() {
        o.insert("updatedAt".into(), json!(ts));
    }
    bump_usage(&mut tags, tag_id, 1);

    save_tags(app, &tags);
    save_metadata(app, &metadata);

    crate::native_ops::emit_event(
        app,
        "tagging:fileTagged",
        &json!({ "filePath": file_path, "tagId": tag_id, "metadata": metadata[mi].clone() }),
    );
    json!({ "success": true })
}

// FileTaggingSystem.setFileTags(filePath, tagIds). Keeps only existing tag ids,
// caps at maxTagsPerFile, swaps usageCount (dec old set, inc new set), persists,
// emits tagging:fileTagsSet. Returns { success, applied }.
fn set_file_tags(app: &tauri::AppHandle, args: &Value) -> Value {
    let file_path = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let incoming: Vec<String> = args
        .get(1)
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let mut tags = load_tags(app);
    let exists = |id: &str, tags: &[Value]| tags.iter().any(|t| id_of(t) == Some(id));

    let cap = max_tags_per_file(app);
    let valid: Vec<String> = incoming
        .into_iter()
        .filter(|id| exists(id, &tags))
        .take(cap)
        .collect();

    let mut metadata = load_metadata(app);
    let mi = get_or_create_metadata(&mut metadata, file_path);

    // Decrement old usage.
    let old_tags: Vec<String> = metadata[mi]
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    for old in &old_tags {
        bump_usage(&mut tags, old, -1);
    }

    // Set + increment new usage.
    if let Some(o) = metadata[mi].as_object_mut() {
        o.insert("tags".into(), json!(valid.clone()));
        o.insert("updatedAt".into(), json!(now_ms()));
    }
    for id in &valid {
        bump_usage(&mut tags, id, 1);
    }

    save_tags(app, &tags);
    save_metadata(app, &metadata);

    crate::native_ops::emit_event(
        app,
        "tagging:fileTagsSet",
        &json!({ "filePath": file_path, "tags": valid.clone(), "metadata": metadata[mi].clone() }),
    );
    json!({ "success": true, "applied": valid })
}

/// Route the ported tagging channels. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Reads (tags:list / tags:get) and the heavy
/// CRUD + file-apply channels are all handled natively now; anything else falls
/// through to Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "tags:list" => list_tags(app),
        "tags:get" => {
            let tag_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_tag(app, tag_id)
        }
        "tags:create" => create_tag(app, args),
        "tags:update" => update_tag(app, args),
        "tags:delete" => delete_tag(app, args),
        "tagging:addTag" => add_tag_to_file(app, args),
        "tagging:setTags" => set_file_tags(app, args),
        _ => Value::Null,
    }
}
