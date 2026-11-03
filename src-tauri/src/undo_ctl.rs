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

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const UNDO_FILE: &str = "undo-stack.json";
const UNDO_KEY: &str = "undoStack";
const REDO_KEY: &str = "redoStack";
const ENTRIES_KEY: &str = "entries";

// --- file IO (fs-json under appData, mirrors snapshot_ctl.rs / analytics.rs) --

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(UNDO_FILE)
}

fn read_file(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_file(app: &tauri::AppHandle, value: &Value) {
    if let Ok(raw) = serde_json::to_string_pretty(value) {
        let _ = std::fs::write(store_path(app), raw);
    }
}

// Pull the persisted id-stacks as owned Vecs (missing/non-array -> empty).
fn read_id_stack(root: &Value, key: &str) -> Vec<String> {
    root.get(key)
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
        .unwrap_or_default()
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

// Build the getStatus() shape from a parsed root document (parity with
// GlobalUndoHistory.getStatus()). Used as the `undo:statusChanged` payload.
fn build_status(root: &Value) -> Value {
    let undo = read_id_stack(root, UNDO_KEY);
    let redo = read_id_stack(root, REDO_KEY);
    let entries = root.get(ENTRIES_KEY);

    let next_of = |stack: &[String]| -> Value {
        match stack.last() {
            Some(id) => {
                let desc = entries
                    .and_then(|e| e.get(id))
                    .and_then(|e| e.get("description"))
                    .cloned()
                    .unwrap_or(Value::Null);
                json!({ "id": id, "description": desc })
            }
            None => Value::Null,
        }
    };

    json!({
        "canUndo": !undo.is_empty(),
        "canRedo": !redo.is_empty(),
        "undoCount": undo.len(),
        "redoCount": redo.len(),
        "nextUndo": next_of(&undo),
        "nextRedo": next_of(&redo),
    })
}

// Faithful port of GlobalUndoHistory.executeUndo(entry): performs the REAL
// filesystem mutation described by entry.undoData. Returns Err(message) on
// failure so the caller can mark the entry 'failed' (matching the TS try/catch).
fn execute_undo(undo_data: &Value) -> Result<(), String> {
    let kind = undo_data.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let original = undo_data.get("originalPath").and_then(|v| v.as_str());
    let new_path = undo_data.get("newPath").and_then(|v| v.as_str());
    let backup = undo_data.get("backupPath").and_then(|v| v.as_str());
    let content = undo_data.get("originalContent").and_then(|v| v.as_str());

    match kind {
        "file_restore" => {
            if let (Some(orig), Some(bak)) = (original, backup) {
                std::fs::copy(bak, orig).map(|_| ()).map_err(|e| e.to_string())
            } else if let (Some(orig), Some(c)) = (original, content) {
                std::fs::write(orig, c).map_err(|e| e.to_string())
            } else {
                Ok(())
            }
        }
        "file_delete" => {
            if let Some(orig) = original {
                std::fs::remove_file(orig).map_err(|e| e.to_string())
            } else {
                Ok(())
            }
        }
        "file_rename" => {
            if let (Some(orig), Some(np)) = (original, new_path) {
                std::fs::rename(np, orig).map_err(|e| e.to_string())
            } else {
                Ok(())
            }
        }
        // state_restore / custom: Electron only emits an in-process event for the
        // renderer to handle; no filesystem work and never an error.
        _ => Ok(()),
    }
}

// Faithful port of GlobalUndoHistory.executeRedo(entry). Note the Electron
// original is deliberately minimal here: file_restore writes a `.redo` sidecar,
// file_delete is a documented no-op (lacks stored content), only file_rename is
// a real move. We mirror that exactly rather than invent new behavior.
fn execute_redo(undo_data: &Value) -> Result<(), String> {
    let kind = undo_data.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let original = undo_data.get("originalPath").and_then(|v| v.as_str());
    let new_path = undo_data.get("newPath").and_then(|v| v.as_str());
    let backup = undo_data.get("backupPath").and_then(|v| v.as_str());

    match kind {
        "file_restore" => {
            if let (Some(orig), Some(bak)) = (original, backup) {
                match std::fs::read(orig) {
                    Ok(bytes) => std::fs::write(format!("{}.redo", bak), bytes)
                        .map_err(|e| e.to_string()),
                    Err(e) => Err(e.to_string()),
                }
            } else {
                Ok(())
            }
        }
        "file_delete" => Ok(()), // documented limitation in Electron: no-op
        "file_rename" => {
            if let (Some(orig), Some(np)) = (original, new_path) {
                std::fs::rename(orig, np).map_err(|e| e.to_string())
            } else {
                Ok(())
            }
        }
        _ => Ok(()),
    }
}

// undo:undo -> GlobalUndoHistory.undo() + undoEntry(): pop the undo stack,
// execute the real fs revert, flip the entry's status/can-flags, move it to the
// redo stack, persist, and emit `undo:statusChanged`.
fn undo(app: &tauri::AppHandle) -> Value {
    let mut root = read_file(app);
    if !root.is_object() {
        root = json!({});
    }

    let mut undo_stack = read_id_stack(&root, UNDO_KEY);
    let mut redo_stack = read_id_stack(&root, REDO_KEY);

    let entry_id = match undo_stack.pop() {
        Some(id) => id,
        None => return json!({ "success": false, "error": "Nothing to undo" }),
    };

    // undoEntry(): look the entry up; missing -> error (stack already popped,
    // matching the TS where undo() pops then delegates to undoEntry()).
    let entry = match root.get(ENTRIES_KEY).and_then(|e| e.get(&entry_id)).cloned() {
        Some(e) => e,
        None => {
            // Persist the popped stack so we don't loop on a dangling id.
            root[UNDO_KEY] = json!(undo_stack);
            write_file(app, &root);
            return json!({ "success": false, "error": "Entry not found" });
        }
    };

    if !entry.get("canUndo").and_then(|v| v.as_bool()).unwrap_or(false) {
        // TS undoEntry() returns early WITHOUT consuming the stack; restore it.
        return json!({ "success": false, "error": "Cannot undo this action" });
    }

    let undo_data = entry.get("undoData").cloned().unwrap_or(Value::Null);
    let mut entry = entry;

    match execute_undo(&undo_data) {
        Ok(()) => {
            entry["status"] = json!("undone");
            entry["canUndo"] = json!(false);
            entry["canRedo"] = json!(true);
            redo_stack.push(entry_id.clone());

            root[UNDO_KEY] = json!(undo_stack);
            root[REDO_KEY] = json!(redo_stack);
            if !root.get(ENTRIES_KEY).map(|e| e.is_object()).unwrap_or(false) {
                root[ENTRIES_KEY] = json!({});
            }
            root[ENTRIES_KEY][&entry_id] = entry.clone();
            write_file(app, &root);

            crate::native_ops::emit_event(app, "undo:statusChanged", &build_status(&root));
            json!({ "success": true, "entry": entry })
        }
        Err(msg) => {
            // TS marks the entry failed (stack stays popped) and returns the error.
            entry["status"] = json!("failed");
            root[UNDO_KEY] = json!(undo_stack);
            if !root.get(ENTRIES_KEY).map(|e| e.is_object()).unwrap_or(false) {
                root[ENTRIES_KEY] = json!({});
            }
            root[ENTRIES_KEY][&entry_id] = entry;
            write_file(app, &root);
            json!({ "success": false, "error": msg })
        }
    }
}

// undo:redo -> GlobalUndoHistory.redo(): pop the redo stack, execute the real
// fs re-apply, flip the entry flags, move it back to the undo stack, persist,
// and emit `undo:statusChanged`.
fn redo(app: &tauri::AppHandle) -> Value {
    let mut root = read_file(app);
    if !root.is_object() {
        root = json!({});
    }

    let mut undo_stack = read_id_stack(&root, UNDO_KEY);
    let mut redo_stack = read_id_stack(&root, REDO_KEY);

    let entry_id = match redo_stack.pop() {
        Some(id) => id,
        None => return json!({ "success": false, "error": "Nothing to redo" }),
    };

    let entry = root.get(ENTRIES_KEY).and_then(|e| e.get(&entry_id)).cloned();
    let mut entry = match entry {
        Some(e) if e.get("canRedo").and_then(|v| v.as_bool()).unwrap_or(false) => e,
        _ => {
            // TS: `if (!entry || !entry.canRedo)` -> error AFTER the pop.
            root[REDO_KEY] = json!(redo_stack);
            write_file(app, &root);
            return json!({ "success": false, "error": "Cannot redo this action" });
        }
    };

    let undo_data = entry.get("undoData").cloned().unwrap_or(Value::Null);

    match execute_redo(&undo_data) {
        Ok(()) => {
            entry["status"] = json!("redone");
            entry["canUndo"] = json!(true);
            entry["canRedo"] = json!(false);
            undo_stack.push(entry_id.clone());

            root[UNDO_KEY] = json!(undo_stack);
            root[REDO_KEY] = json!(redo_stack);
            if !root.get(ENTRIES_KEY).map(|e| e.is_object()).unwrap_or(false) {
                root[ENTRIES_KEY] = json!({});
            }
            root[ENTRIES_KEY][&entry_id] = entry.clone();
            write_file(app, &root);

            crate::native_ops::emit_event(app, "undo:statusChanged", &build_status(&root));
            json!({ "success": true, "entry": entry })
        }
        Err(msg) => {
            entry["status"] = json!("failed");
            root[REDO_KEY] = json!(redo_stack);
            if !root.get(ENTRIES_KEY).map(|e| e.is_object()).unwrap_or(false) {
                root[ENTRIES_KEY] = json!({});
            }
            root[ENTRIES_KEY][&entry_id] = entry;
            write_file(app, &root);
            json!({ "success": false, "error": msg })
        }
    }
}

/// Route an `undo:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). canUndo/canRedo are read-only; undo/redo perform
/// the real filesystem revert/re-apply and emit `undo:statusChanged`. The undo
/// channels here take no arguments (parity with the TS handlers), so `_args` is
/// unused; unknown channels return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "undo:canUndo" => can_undo(app),
        "undo:canRedo" => can_redo(app),
        "undo:undo" => undo(app),
        "undo:redo" => redo(app),
        _ => Value::Null,
    }
}
