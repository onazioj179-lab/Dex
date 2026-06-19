// =============================================================================
// DEX Tauri — Tags subsystem (port of the `tags:*` IPC handlers in main.ts).
//
// Pure-data CRUD over the DataStore-KV array stored under the `"tags"` key
// (Electron: `this.dataStore.get/set('tags', ...)`). This mirrors the modes
// port: read/mutate/write via crate::kv_get / crate::kv_set with the SAME key
// string, so the on-disk shape and the renderer stay unchanged.
//
// Each tag is an opaque object `{ id, name, ... }`; only `id` (match key) and
// `name` (rename target) are touched. Unknown fields are preserved verbatim.
//
// Return shapes match the Electron handlers EXACTLY:
//   tags:rename       -> { success: true }
//   tags:merge        -> { success: true, mergedInto: <targetId> }
//   tags:delete       -> { success: true }
//   tags:bulk-rename  -> { success: true }
//   tags:bulk-merge   -> { success: true, mergedInto: <targetId> }
//
// Divergences: none. Electron's `merge`/`bulk-merge` only drop the source tag(s)
// and report `mergedInto`; they do NOT re-point items onto the target (no item
// re-tagging happened in the original handler), so neither does this. The KV
// store persists silently in both worlds, so a write failure is not surfaced
// (Electron also returned `{ success: true }` regardless of persistence).
//
// HEAVY channels: none in this namespace. Every `tags:*` handler is plain data.
// =============================================================================

use serde_json::{json, Value};

const KEY: &str = "tags";

// Read the tags array from the KV store. Missing/non-array -> [] (Electron's
// `|| []`).
fn read_tags(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn write_tags(app: &tauri::AppHandle, tags: Vec<Value>) {
    crate::kv_set(app, KEY, Value::Array(tags));
}

fn tag_id_is(t: &Value, id: &str) -> bool {
    t.get("id").and_then(|v| v.as_str()) == Some(id)
}

/// Route a `tags:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in this namespace is handled; any
/// unrecognized one returns Value::Null so a prefix route degrades honestly.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // rename(tagId, newName): set the matching tag's name; no-op if absent.
        "tags:rename" => {
            let tag_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let new_name = args.get(1).cloned().unwrap_or(Value::Null);
            let mut tags = read_tags(app);
            let mut found = false;
            for t in tags.iter_mut() {
                if tag_id_is(t, tag_id) {
                    if let Some(obj) = t.as_object_mut() {
                        obj.insert("name".into(), new_name.clone());
                    }
                    found = true;
                    break;
                }
            }
            if found {
                write_tags(app, tags);
            }
            json!({ "success": true })
        }

        // merge(sourceId, targetId): drop the source tag, report the target.
        "tags:merge" => {
            let source_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let target_id = args.get(1).cloned().unwrap_or(Value::Null);
            let tags: Vec<Value> = read_tags(app)
                .into_iter()
                .filter(|t| !tag_id_is(t, source_id))
                .collect();
            write_tags(app, tags);
            json!({ "success": true, "mergedInto": target_id })
        }

        // delete(tagId): drop the matching tag.
        "tags:delete" => {
            let tag_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let tags: Vec<Value> = read_tags(app)
                .into_iter()
                .filter(|t| !tag_id_is(t, tag_id))
                .collect();
            write_tags(app, tags);
            json!({ "success": true })
        }

        // bulk-rename(renames: [{ id, name }]): apply each rename in order.
        "tags:bulk-rename" => {
            let renames = args.get(0).and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let mut tags = read_tags(app);
            for r in &renames {
                let id = match r.get("id").and_then(|v| v.as_str()) {
                    Some(s) => s,
                    None => continue,
                };
                let name = r.get("name").cloned().unwrap_or(Value::Null);
                for t in tags.iter_mut() {
                    if tag_id_is(t, id) {
                        if let Some(obj) = t.as_object_mut() {
                            obj.insert("name".into(), name.clone());
                        }
                        break;
                    }
                }
            }
            write_tags(app, tags);
            json!({ "success": true })
        }

        // bulk-merge(sourceIds, targetId): drop all source tags, report target.
        "tags:bulk-merge" => {
            let source_ids: Vec<String> = args
                .get(0)
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let target_id = args.get(1).cloned().unwrap_or(Value::Null);
            let tags: Vec<Value> = read_tags(app)
                .into_iter()
                .filter(|t| {
                    let id = t.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    !source_ids.iter().any(|s| s == id)
                })
                .collect();
            write_tags(app, tags);
            json!({ "success": true, "mergedInto": target_id })
        }

        _ => Value::Null,
    }
}
