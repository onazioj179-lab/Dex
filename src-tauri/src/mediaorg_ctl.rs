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
//   - HEAVY channels organize / tag / categorize are NOW ported with REAL native
//     code (file-mover / classifier). They operate on the SAME `mediaFiles` KV
//     index that list/get read, keeping this module self-consistent. See the
//     "HEAVY CHANNELS" section below for the per-channel contract.
// =============================================================================
//
// HEAVY CHANNELS (native port)
// ----------------------------------------------------------------------------
// There is no single Electron handler literally named mediaorg:organize /
// mediaorg:tag / mediaorg:categorize: these are the migration-named heavy
// "intents" for this namespace. Their behaviour is modelled directly on the two
// Electron media subsystems:
//   - controllers/MediaController.ts   (the `mediaFiles` index + storage-by-type
//     layout `userData/media/<type>s/<id><ext>`, MediaFile.tags: string[])
//   - core/MediaOrganization.ts        (tagMedia, suggestTags/categorize-by-type,
//     getStats), which mutates an index and persists, emitting renderer events.
// We implement them against THIS module's existing `mediaFiles` KV index so the
// renderer's list/get keep seeing one coherent store:
//
//   - mediaorg:tag(mediaId, tags)
//       Add tag string(s) to a MediaFile.tags[] (dedup, preserves order), bump
//       updatedAt, persist to KV, emit "mediaorg:tagged". Mirrors tagMedia() +
//       MediaController.updateMetadata's tag merge. tags arg may be a string or
//       a string[]. -> updated MediaFile, or { success:false, error } if absent.
//
//   - mediaorg:categorize(mediaId?)
//       Native classifier: derive MediaType ('image'|'audio'|'video'|'document'
//       |'other') from mimeType, then file extension, using MediaController's
//       MIME/extension maps. With a mediaId, re-categorize that one file; with no
//       id, sweep every file whose `type` is missing/wrong. Writes corrected
//       `type` + updatedAt, persists, emits "mediaorg:categorized".
//       -> { success, updated, changed[] } (changed = ids whose type changed).
//
//   - mediaorg:organize(options?)
//       Real fs mover: ensure the by-type subfolders exist under
//       app_data_dir()/media (images/audio/video/documents/other, matching
//       Electron's `type + 's'` dirs) and move each file whose on-disk location
//       is not already inside its type folder there, updating MediaFile.filePath.
//       Pinned files are skipped when options.skipPinned is true. Runs the move
//       work on a background std::thread (OS file IO off the dispatch path),
//       emitting "mediaorg:organized" with the result when done; returns an
//       immediate ack { success:true, started:true, queued:<n> }. Files are
//       categorized first (same classifier) so they land in the right folder.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const MEDIA_KEY: &str = "mediaFiles";

fn load(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, MEDIA_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn save(app: &tauri::AppHandle, files: Vec<Value>) {
    let _ = crate::kv_set(app, MEDIA_KEY, Value::Array(files));
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn created_at(f: &Value) -> i64 {
    f.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}

fn id_of(f: &Value) -> Option<&str> {
    f.get("id").and_then(|v| v.as_str())
}

// --- native classifier (mirrors MediaController MIME/extension maps) ---------

// MediaType bucket for a mimeType, matching MIME_TYPE_MAP in MediaController.ts.
fn type_for_mime(mime: &str) -> Option<&'static str> {
    match mime {
        "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/svg+xml" => Some("image"),
        "audio/mpeg" | "audio/wav" | "audio/ogg" | "audio/webm" => Some("audio"),
        "video/mp4" | "video/webm" | "video/quicktime" => Some("video"),
        "application/pdf" | "text/plain" | "text/markdown" | "application/json" => Some("document"),
        _ => None,
    }
}

// MediaType bucket for a lowercase extension incl. dot (e.g. ".png").
// Mirrors getMimeType() -> MIME_TYPE_MAP in MediaController.ts.
fn type_for_ext(ext: &str) -> Option<&'static str> {
    match ext {
        ".jpg" | ".jpeg" | ".png" | ".gif" | ".webp" | ".svg" => Some("image"),
        ".mp3" | ".wav" | ".ogg" | ".webm" => Some("audio"),
        ".mp4" | ".mov" => Some("video"),
        ".pdf" | ".txt" | ".md" | ".json" => Some("document"),
        _ => None,
    }
}

// Lowercase extension (incl. leading dot) of a path-like string, or "".
fn ext_of(path_str: &str) -> String {
    Path::new(path_str)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()))
        .unwrap_or_default()
}

// Resolve the canonical MediaType for one MediaFile: mimeType first, then the
// extension of filePath/originalName/name, else "other" (MediaController fallback).
fn classify(f: &Value) -> &'static str {
    if let Some(t) = f.get("mimeType").and_then(|v| v.as_str()).and_then(type_for_mime) {
        return t;
    }
    for key in ["filePath", "originalName", "name"] {
        if let Some(s) = f.get(key).and_then(|v| v.as_str()) {
            if let Some(t) = type_for_ext(&ext_of(s)) {
                return t;
            }
        }
    }
    "other"
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

// --- mediaorg:tag ------------------------------------------------------------

// Collect tag arg into a Vec<String>: accepts a single string or a string array.
fn tags_arg(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::String(s)) => vec![s.clone()],
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(|t| t.as_str().map(|s| s.to_string()))
            .collect(),
        _ => Vec::new(),
    }
}

// Add tag string(s) to a MediaFile.tags[] (dedup, preserve order), bump
// updatedAt, persist, emit "mediaorg:tagged" -> updated MediaFile or error.
fn tag(app: &tauri::AppHandle, media_id: &str, new_tags: Vec<String>) -> Value {
    let mut files = load(app);
    let idx = files.iter().position(|f| id_of(f) == Some(media_id));
    let Some(idx) = idx else {
        return json!({ "success": false, "error": "media not found" });
    };

    let file = &mut files[idx];
    // Existing tags as a Vec<String> (MediaFile.tags is string[]).
    let mut tags: Vec<String> = file
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default();
    for t in new_tags {
        let t = t.trim().to_string();
        if !t.is_empty() && !tags.iter().any(|x| x == &t) {
            tags.push(t);
        }
    }
    if let Value::Object(obj) = file {
        obj.insert("tags".into(), json!(tags));
        obj.insert("updatedAt".into(), json!(now_ms()));
    }
    let updated = files[idx].clone();
    save(app, files);
    crate::native_ops::emit_event(
        app,
        "mediaorg:tagged",
        &json!({ "mediaId": media_id, "tags": updated.get("tags").cloned().unwrap_or(json!([])) }),
    );
    updated
}

// --- mediaorg:categorize -----------------------------------------------------

// Re-derive MediaFile.type via the native classifier. With media_id: one file.
// Without: sweep all files. Persists corrected types, emits "mediaorg:categorized".
fn categorize(app: &tauri::AppHandle, media_id: Option<&str>) -> Value {
    let mut files = load(app);
    let mut changed: Vec<String> = Vec::new();
    let ts = now_ms();

    for f in files.iter_mut() {
        if let Some(want) = media_id {
            if id_of(f) != Some(want) {
                continue;
            }
        }
        let correct = classify(f);
        let current = f.get("type").and_then(|v| v.as_str());
        if current != Some(correct) {
            if let Some(id) = id_of(f).map(String::from) {
                changed.push(id);
            }
            if let Value::Object(obj) = f {
                obj.insert("type".into(), json!(correct));
                obj.insert("updatedAt".into(), json!(ts));
            }
        }
    }

    // If a specific id was requested but never matched, report not-found.
    if let Some(want) = media_id {
        if !files.iter().any(|f| id_of(f) == Some(want)) {
            return json!({ "success": false, "error": "media not found" });
        }
    }

    let total = if media_id.is_some() { 1 } else { files.len() };
    save(app, files);
    crate::native_ops::emit_event(
        app,
        "mediaorg:categorized",
        &json!({ "changed": changed }),
    );
    json!({ "success": true, "updated": total, "changed": changed })
}

// --- mediaorg:organize -------------------------------------------------------

// Storage subfolder for a MediaType, matching MediaController's `type + 's'`.
fn type_dir(t: &str) -> &'static str {
    match t {
        "image" => "images",
        "audio" => "audio",
        "video" => "video",
        "document" => "documents",
        _ => "other",
    }
}

// Move files into app_data_dir()/media/<type-dir>/ on a background thread.
// Files already inside their correct type folder are left in place. Pinned
// files are skipped when skip_pinned. Categorizes first so each file lands in
// the right folder. Returns an immediate ack; the final result is emitted on
// "mediaorg:organized".
fn organize(app: &tauri::AppHandle, skip_pinned: bool) -> Value {
    let files = load(app);

    // Plan the work synchronously (cheap, in-memory) so we can return a queued
    // count; the actual fs moves run off-thread.
    let media_root: PathBuf = app
        .dex_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("media");

    // Build (id, src, dest, type) tuples for files needing a move.
    struct Plan {
        id: String,
        src: PathBuf,
        dest: PathBuf,
        new_type: String,
    }
    let mut plans: Vec<Plan> = Vec::new();
    for f in &files {
        let Some(id) = id_of(f).map(String::from) else { continue };
        if skip_pinned && f.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false) {
            continue;
        }
        let Some(src_str) = f.get("filePath").and_then(|v| v.as_str()) else { continue };
        if src_str.is_empty() {
            continue;
        }
        let new_type = classify(f).to_string();
        let dir = media_root.join(type_dir(&new_type));
        let file_name = Path::new(src_str)
            .file_name()
            .map(|n| n.to_os_string())
            .unwrap_or_else(|| std::ffi::OsString::from(format!("{}{}", id, ext_of(src_str))));
        let dest = dir.join(&file_name);
        let src = PathBuf::from(src_str);
        // Skip if already in the correct location.
        if src == dest {
            continue;
        }
        plans.push(Plan { id, src, dest, new_type });
    }

    let queued = plans.len();
    let app_bg = app.clone();
    crate::util::spawn_named("mediaorg", move || {
        // Ensure the by-type subfolders exist (mirrors initialize()).
        for sub in ["images", "audio", "video", "documents", "other"] {
            let _ = std::fs::create_dir_all(media_root.join(sub));
        }

        let mut moved: Vec<String> = Vec::new();
        let mut errors: Vec<Value> = Vec::new();
        // id -> (new filePath, new type) for the ones that actually moved.
        let mut updates: std::collections::HashMap<String, (String, String)> =
            std::collections::HashMap::new();

        for p in plans {
            if !p.src.exists() {
                errors.push(json!({ "id": p.id, "error": "source missing" }));
                continue;
            }
            if let Some(parent) = p.dest.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            // Prefer rename (atomic, same volume); fall back to copy+remove for
            // cross-volume moves where rename fails.
            let outcome = std::fs::rename(&p.src, &p.dest).or_else(|_| {
                std::fs::copy(&p.src, &p.dest)
                    .and_then(|_| std::fs::remove_file(&p.src))
            });
            match outcome {
                Ok(_) => {
                    let dest_str = p.dest.to_string_lossy().to_string();
                    updates.insert(p.id.clone(), (dest_str, p.new_type));
                    moved.push(p.id);
                }
                Err(e) => errors.push(json!({ "id": p.id, "error": e.to_string() })),
            }
        }

        // Re-load and apply path/type updates (KV may have changed meanwhile).
        if !updates.is_empty() {
            let mut latest = load(&app_bg);
            let ts = now_ms();
            for f in latest.iter_mut() {
                if let Some(id) = id_of(f).map(String::from) {
                    if let Some((new_path, new_type)) = updates.get(&id) {
                        if let Value::Object(obj) = f {
                            obj.insert("filePath".into(), json!(new_path));
                            obj.insert("type".into(), json!(new_type));
                            obj.insert("updatedAt".into(), json!(ts));
                        }
                    }
                }
            }
            save(&app_bg, latest);
        }

        crate::native_ops::emit_event(
            &app_bg,
            "mediaorg:organized",
            &json!({
                "success": true,
                "moved": moved.len(),
                "movedIds": moved,
                "errors": errors,
            }),
        );
    });

    json!({ "success": true, "started": true, "queued": queued })
}

/// Route a `mediaorg:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The data channels (list/get) and the heavy
/// channels (tag/categorize/organize) are handled natively; every other channel
/// in the namespace returns Value::Null (honest degrade), so prefix routing on
/// `mediaorg:` is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "mediaorg:list" => list(app),
        "mediaorg:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get(app, id)
        }
        // tag(mediaId, tags: string | string[])
        "mediaorg:tag" => {
            let media_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            if media_id.is_empty() {
                return json!({ "success": false, "error": "mediaId required" });
            }
            tag(app, media_id, tags_arg(args.get(1)))
        }
        // categorize(mediaId?) — id absent/empty => sweep all
        "mediaorg:categorize" => {
            let media_id = args.get(0).and_then(|v| v.as_str()).filter(|s| !s.is_empty());
            categorize(app, media_id)
        }
        // organize(options?: { skipPinned?: boolean })
        "mediaorg:organize" => {
            let skip_pinned = args
                .get(0)
                .and_then(|o| o.get("skipPinned"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            organize(app, skip_pinned)
        }
        _ => Value::Null,
    }
}
