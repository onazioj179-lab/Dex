// =============================================================================
// DEX Tauri — Voice Notes subsystem (port of controllers/VoiceController.ts,
// Phase 7B). Pure-data metadata tier.
//
// STORAGE: despite the orchestrator's "electron-store:voiceNotes" hint, the
// Electron controller persists through `DataStore` (the native KV store), not a
// standalone electron-store file. Two keys are used, mirrored here verbatim via
// crate::kv_get / crate::kv_set:
//   - "voiceNotes"    : VoiceNote[]      (metadata for each recording)
//   - "voiceSettings" : VoiceSettings    (audioFormat, maxDurationMinutes, ...)
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// DIVERGENCES (documented):
//   1. voiceNotes:save is NOT ported. The Electron handler receives a raw audio
//      ArrayBuffer, writes the binary file to <userData>/voice-notes, then stats
//      it for `size`. Binary blobs cannot round-trip cleanly through the
//      positional-JSON dex_ipc bridge, and writing/encoding audio is native I/O
//      outside the pure-data tier. The renderer awaits a VoiceNote object, so
//      this returns a shaped error rather than null.
//   2. Electron's VoiceController.initialize() filters out notes whose audio file
//      no longer exists on disk (fs.existsSync) when first loaded. This port does
//      NOT re-stat the filesystem; it returns the persisted metadata as stored.
//      Stale entries (file deleted out-of-band) would therefore still appear
//      until a delete prunes them. This keeps the read path pure-data.
//   3. voiceNotes:delete also best-effort unlinks the on-disk audio file (using
//      the persisted absolute `filePath`), then removes the metadata entry,
//      matching the Electron behaviour. The boolean result mirrors Electron.
//   4. getStats / getSettings / getById etc. read straight from KV (no in-memory
//      cache), so they reflect whatever is currently persisted.
//   5. Default `title` for a created note is produced by `save` only, which is
//      not ported; no Date-formatting is performed in this module.
// =============================================================================

use serde_json::{json, Value};

const NOTES_KEY: &str = "voiceNotes";
const SETTINGS_KEY: &str = "voiceSettings";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- KV-backed metadata store -----------------------------------------------

fn read_notes(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, NOTES_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn write_notes(app: &tauri::AppHandle, notes: &[Value]) {
    crate::kv_set(app, NOTES_KEY, Value::Array(notes.to_vec()));
}

fn created_at(n: &Value) -> i64 {
    n.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}

fn note_id(n: &Value) -> Option<String> {
    n.get("id").and_then(|v| v.as_str()).map(String::from)
}

// --- settings ---------------------------------------------------------------

// DEFAULT_SETTINGS from VoiceController.ts.
fn default_settings() -> Value {
    json!({
        "audioFormat": "webm",
        "maxDurationMinutes": 30,
        "autoSaveInterval": 30,
        "storageFolder": "voice-notes",
    })
}

// getSettings(): { ...DEFAULT_SETTINGS, ...savedSettings }. Electron seeds the
// in-memory settings with the defaults then overlays whatever was persisted, so
// any missing key falls back to its default.
fn get_settings(app: &tauri::AppHandle) -> Value {
    let mut out = default_settings();
    if let Value::Object(saved) = crate::kv_get(app, SETTINGS_KEY) {
        if let Some(map) = out.as_object_mut() {
            for (k, v) in saved {
                map.insert(k, v);
            }
        }
    }
    out
}

// updateSettings(updates): merge over current settings, persist, return merged.
fn update_settings(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut merged = get_settings(app);
    if let (Some(map), Some(up)) = (merged.as_object_mut(), updates.as_object()) {
        for (k, v) in up {
            map.insert(k.clone(), v.clone());
        }
    }
    crate::kv_set(app, SETTINGS_KEY, merged.clone());
    merged
}

// --- search helpers ---------------------------------------------------------

fn matches_query(note: &Value, q: &str) -> bool {
    let title = note
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    if title.contains(q) {
        return true;
    }
    if let Some(tr) = note.get("transcription").and_then(|v| v.as_str()) {
        if tr.to_lowercase().contains(q) {
            return true;
        }
    }
    if let Some(tags) = note.get("tags").and_then(|v| v.as_array()) {
        for t in tags {
            if let Some(s) = t.as_str() {
                if s.to_lowercase().contains(q) {
                    return true;
                }
            }
        }
    }
    false
}

/// Route a `voiceNotes:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- CRUD -----------------------------------------------------------
        // getAll(): notes sorted newest-first (by createdAt desc).
        "voiceNotes:getAll" => {
            let mut notes = read_notes(app);
            notes.sort_by(|a, b| created_at(b).cmp(&created_at(a)));
            json!(notes)
        }
        // getById(id): VoiceNote | null.
        "voiceNotes:getById" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            read_notes(app)
                .into_iter()
                .find(|n| note_id(n).as_deref() == Some(id))
                .unwrap_or(Value::Null)
        }
        // updateMetadata(id, updates): merge updates, but preserve id+filePath and
        // bump updatedAt. Returns the updated note, or null if not found.
        "voiceNotes:update" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let updates = args.get(1).cloned().unwrap_or(Value::Null);
            let mut notes = read_notes(app);
            let idx = match notes.iter().position(|n| note_id(n).as_deref() == Some(id)) {
                Some(i) => i,
                None => return Value::Null,
            };
            let mut merged = notes[idx].as_object().cloned().unwrap_or_default();
            let orig_id = merged.get("id").cloned();
            let orig_path = merged.get("filePath").cloned();
            if let Some(up) = updates.as_object() {
                for (k, v) in up {
                    merged.insert(k.clone(), v.clone());
                }
            }
            // Prevent id/path change (Electron forces these back).
            if let Some(v) = orig_id {
                merged.insert("id".into(), v);
            }
            if let Some(v) = orig_path {
                merged.insert("filePath".into(), v);
            }
            merged.insert("updatedAt".into(), json!(now_ms()));
            let result = Value::Object(merged);
            notes[idx] = result.clone();
            write_notes(app, &notes);
            result
        }
        // delete(id): best-effort unlink of the on-disk file, then remove the
        // metadata entry. Returns true if removed, false if not found.
        "voiceNotes:delete" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let mut notes = read_notes(app);
            let idx = match notes.iter().position(|n| note_id(n).as_deref() == Some(id)) {
                Some(i) => i,
                None => return json!(false),
            };
            if let Some(path) = notes[idx].get("filePath").and_then(|v| v.as_str()) {
                let _ = std::fs::remove_file(path);
            }
            notes.remove(idx);
            write_notes(app, &notes);
            json!(true)
        }
        // --- Organization ---------------------------------------------------
        // togglePin(id): flip pinned, bump updatedAt. Returns note | null.
        "voiceNotes:togglePin" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let mut notes = read_notes(app);
            let idx = match notes.iter().position(|n| note_id(n).as_deref() == Some(id)) {
                Some(i) => i,
                None => return Value::Null,
            };
            if let Some(obj) = notes[idx].as_object_mut() {
                let pinned = obj.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false);
                obj.insert("pinned".into(), json!(!pinned));
                obj.insert("updatedAt".into(), json!(now_ms()));
            }
            let result = notes[idx].clone();
            write_notes(app, &notes);
            result
        }
        // --- File access ----------------------------------------------------
        // getAudioPath(id): the persisted filePath string, or null.
        "voiceNotes:getPath" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            read_notes(app)
                .into_iter()
                .find(|n| note_id(n).as_deref() == Some(id))
                .and_then(|n| n.get("filePath").cloned())
                .unwrap_or(Value::Null)
        }
        // --- Search ---------------------------------------------------------
        // search(query): case-insensitive over title/transcription/tags.
        "voiceNotes:search" => {
            let q = args
                .get(0)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let matches: Vec<Value> = read_notes(app)
                .into_iter()
                .filter(|n| matches_query(n, &q))
                .collect();
            json!(matches)
        }
        // getRecent(limit = 10): newest-first, sliced.
        "voiceNotes:getRecent" => {
            let limit = args.get(0).and_then(|v| v.as_u64()).unwrap_or(10) as usize;
            let mut notes = read_notes(app);
            notes.sort_by(|a, b| created_at(b).cmp(&created_at(a)));
            notes.truncate(limit);
            json!(notes)
        }
        // getPinned(): notes where pinned === true.
        "voiceNotes:getPinned" => {
            let pinned: Vec<Value> = read_notes(app)
                .into_iter()
                .filter(|n| n.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false))
                .collect();
            json!(pinned)
        }
        // --- Stats ----------------------------------------------------------
        // getStats(): { count, totalDuration, totalSize }.
        "voiceNotes:getStats" => {
            let notes = read_notes(app);
            let count = notes.len();
            let total_duration: f64 = notes
                .iter()
                .map(|n| n.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .sum();
            let total_size: f64 = notes
                .iter()
                .map(|n| n.get("size").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .sum();
            json!({
                "count": count,
                "totalDuration": total_duration,
                "totalSize": total_size,
            })
        }
        // --- Settings -------------------------------------------------------
        "voiceNotes:getSettings" => get_settings(app),
        "voiceNotes:updateSettings" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_settings(app, &updates)
        }
        // --- Skipped (native runtime) --------------------------------------
        // save(audioData, metadata): receives a binary audio ArrayBuffer and
        // writes the file to disk before returning a VoiceNote. Not pure-data and
        // cannot round-trip through positional JSON. The renderer awaits an
        // object, so return a shaped error rather than null.
        "voiceNotes:save" => json!({
            "success": false,
            "error": "not ported (needs native runtime)"
        }),
        _ => Value::Null,
    }
}
