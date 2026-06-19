// =============================================================================
// DEX Tauri — Undo subsystem (port of the data/CRUD surface of the `undo:*` IPC
// handlers in src/main/core/GlobalUndoHistory.ts).
//
// Pure-data, JSON-backed tier. The Electron GlobalUndoHistory held its entire
// state IN MEMORY (entries Map + two id stacks `undoStack`/`redoStack`); there
// was NO Electron file on disk for the stack. Per the porting brief the fs-json
// storage name is `undo-stack.json`, which we place under <appData>. To preserve
// the exact stack semantics the file uses two top-level wrapper keys mirroring
// the in-memory fields:
//   undo-stack.json : { "undoStack": [<entryId>, ...], "redoStack": [<entryId>, ...] }
//
// Channels & shapes (derived from GlobalUndoHistory.getStatus(), which is the
// only data surface that exposes can-undo/can-redo):
//   - undo:canUndo -> boolean   (getStatus().canUndo === undoStack.length > 0)
//   - undo:canRedo -> boolean   (getStatus().canRedo === redoStack.length > 0)
// Both are plain booleans; field names/types match the `canUndo` / `canRedo`
// fields the renderer already consumes, so it is unchanged.
//
// SKIPPED heavy channels (need the live native undo runtime — file backups,
// fs restore/rename, in-memory entry graph + group bookkeeping):
//   - undo:undo / undo:redo
//     These mutate the real filesystem (restore/delete/rename backed-up files)
//     and rewrite the in-memory entry graph. They cannot be faithfully ported
//     into this pure-data tier and are NOT implemented and NOT faked: the prefix
//     route returns Value::Null (honest degrade) for them.
//
// DIVERGENCES (documented):
//   - Persistence: Electron's stacks were process-lifetime in-memory and started
//     empty every launch (and only the SKIPPED record/undo/redo runtime channels
//     ever pushed/popped them). This tier reads `undo-stack.json` if present.
//     Because the writers are the skipped heavy channels, the file is normally
//     absent and BOTH booleans read `false` — which is byte-for-byte identical to
//     a fresh in-memory getStatus() (`undoStack.length > 0` === false). If a
//     future native runtime persists the stack here, can-undo/can-redo track it
//     with no renderer change. Returned data shapes are identical.
//   - No id/time generation occurs on the ported (read-only) channels, so neither
//     crate::util::pseudo_uuid_v4() nor SystemTime is needed here; stack mutation
//     lives in the skipped heavy channels.
// =============================================================================

use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

const UNDO_FILE: &str = "undo-stack.json";
const UNDO_KEY: &str = "undoStack";
const REDO_KEY: &str = "redoStack";

// --- file IO (fs-json under appData, mirrors snapshot_ctl.rs / analytics.rs) --

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(UNDO_FILE)
}

fn read_file(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Length of a top-level id-stack array (missing/non-array -> 0).
fn stack_len(app: &tauri::AppHandle, key: &str) -> usize {
    read_file(app)
        .get(key)
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0)
}

// getStatus().canUndo === undoStack.length > 0
fn can_undo(app: &tauri::AppHandle) -> Value {
    Value::Bool(stack_len(app, UNDO_KEY) > 0)
}

// getStatus().canRedo === redoStack.length > 0
fn can_redo(app: &tauri::AppHandle) -> Value {
    Value::Bool(stack_len(app, REDO_KEY) > 0)
}

/// Route an `undo:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read/data channels are ported; the heavy
/// runtime channels (undo/redo) return Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "undo:canUndo" => can_undo(app),
        "undo:canRedo" => can_redo(app),
        // Heavy / native-runtime channels (undo / redo) — not ported, not faked.
        _ => Value::Null,
    }
}
