// =============================================================================
// DEX Tauri — Generic directory watcher (port of Electron watch:start/watch:stop)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// Electron's watch:start({id,path}) ran an fs.watch over a directory and pushed
// `watch:fileAdded {id, files:[fullPath]}` to the renderer when a file appeared;
// watch:stop({id}) closed it. This ports that with `notify` (already a dep),
// keyed by the renderer-supplied string id in Tauri-managed state. A notify
// watcher stops when dropped, so removing the entry tears the watch down.
// =============================================================================

use crate::util::LockSafe;
use notify::{event::ModifyKind, EventKind, RecursiveMode, Watcher};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

/// Live generic watchers, keyed by the renderer-supplied id. Registered as
/// Tauri-managed state in `setup()`.
pub type GenericWatchState = Mutex<HashMap<String, notify::RecommendedWatcher>>;

fn start(app: &tauri::AppHandle, args: &Value) -> Value {
    let spec = args.get(0).cloned().unwrap_or(Value::Null);
    let id = spec.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let dir = spec.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if id.is_empty() || dir.is_empty() {
        return json!({ "success": false, "error": "id and path required" });
    }
    if !Path::new(&dir).is_dir() {
        return json!({ "success": false, "error": "path does not exist" });
    }
    let state = app.state::<GenericWatchState>();
    let mut map = state.lock_safe();
    if map.contains_key(&id) {
        return json!({ "success": true }); // already watching (idempotent, matches TS)
    }
    let app_handle = app.clone();
    let watch_id = id.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            // fs.watch fired on 'rename' (create); notify's create + name events are
            // the equivalent. The is_file() guard drops the delete half, matching the
            // Electron existsSync(fullPath) && isFile() check.
            if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(ModifyKind::Name(_))) {
                for p in &event.paths {
                    if p.is_file() {
                        crate::native_ops::emit_event(
                            &app_handle,
                            "watch:fileAdded",
                            &json!({ "id": watch_id, "files": [p.to_string_lossy()] }),
                        );
                    }
                }
            }
        }
    });
    match watcher {
        Ok(mut w) => {
            if w.watch(Path::new(&dir), RecursiveMode::NonRecursive).is_ok() {
                map.insert(id, w);
                json!({ "success": true })
            } else {
                json!({ "success": false, "error": "failed to start watcher" })
            }
        }
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn stop(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = args
        .get(0)
        .and_then(|v| v.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    { let st = app.state::<GenericWatchState>(); let mut map = st.lock_safe();
        map.remove(&id);
    }
    json!({ "success": true })
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "watch:start" => start(app, args),
        "watch:stop" => stop(app, args),
        _ => Value::Null,
    }
}
