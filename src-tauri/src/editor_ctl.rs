// =============================================================================
// DEX Tauri — Gallery Editor data surface (port of the data/CRUD slice of
// src/main/core/GalleryEditor.ts).
//
// Pure-data, JSON-backed tier. The Electron GalleryEditor keeps the live edit
// session (`activeEdit: EditState | null`) entirely in memory and never wrote it
// to disk; the `editor:getState` handler simply returns that in-memory value
// (an EditState, or null when no image is open). This port mirrors that single
// DATA channel:
//
//   - editor:getState -> EditState | null
//
// STORAGE (fs-json:editor-state.json): per the migration spec the editor's data
// surface is backed by a plain JSON file `editor-state.json` under <appData>
// (std::fs, no electron-store key wrapper — the whole file IS the state object).
// getState returns the parsed file when present, else null. Because the only
// channel that ever PRODUCES an EditState — editor:open — is a HEAVY channel
// (needs nativeImage to load pixel dimensions) and is intentionally NOT ported,
// no writer populates editor-state.json in this port; getState therefore returns
// null until a future native runtime writes that file. This is the honest
// degrade: the renderer reads exactly what Electron's getState returned when no
// session is active (null), and the full shape when one is.
//
// EditState shape (returned verbatim if the file holds it):
//   { sourceId, sourcePath, originalWidth, originalHeight,
//     crop: CropRegion|null, transform: { rotation, flipHorizontal,
//     flipVertical }, adjustments: { brightness, contrast, saturation },
//     resize: ResizeOptions|null, history: EditHistoryEntry[], historyIndex,
//     isDirty }
//
// DIVERGENCES (documented):
//   - Persistence: Electron never persisted activeEdit; the spec assigns this
//     surface an fs-json file (editor-state.json). We read that file rather than
//     hold process-global mutable state (Tauri command handlers are stateless
//     here). Behaviourally identical for getState: file-absent -> null, exactly
//     like a fresh Electron session with no open image.
//   - HEAVY channels (open/save/close/export) are not ported and not faked:
//     they require nativeImage (decode/encode/crop/resize) which has no pure-data
//     Tauri equivalent. They are omitted; the prefix route returns Value::Null
//     for them (honest degrade), matching the renderer's expectation when no
//     handler is registered.
//   - id generation (sourceId / history entry ids) lives only inside open() and
//     the mutation handlers, all of which are HEAVY/unported, so no id is minted
//     here. If a future port needs one, use crate::util::pseudo_uuid_v4().
// =============================================================================

use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

const STATE_FILE: &str = "editor-state.json";

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// editor:getState -> EditState | null. Electron returned the in-memory
// activeEdit; here the live session is the contents of editor-state.json. An
// absent/empty/invalid file degrades to null, exactly as Electron returned null
// when no image was open.
fn get_state(app: &tauri::AppHandle) -> Value {
    match read_file(app, STATE_FILE) {
        v @ Value::Object(_) => v,
        _ => Value::Null,
    }
}

/// Route an `editor:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the DATA channel `editor:getState` is ported;
/// the HEAVY channels (open/save/close/export) and any unknown channel return
/// Value::Null (honest degrade — no handler registered on the native side yet).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "editor:getState" => get_state(app),
        _ => Value::Null,
    }
}
