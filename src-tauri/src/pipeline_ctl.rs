// =============================================================================
// DEX Tauri — Processing Pipeline subsystem (port of the read/data `pipeline:*`
// IPC handlers in core/ProcessingPipeline.ts).
//
// Pure-data, JSON-backed tier. Electron's ProcessingPipeline persisted to plain
// std::fs JSON files under <userData>/pipeline/ (NOT electron-store):
//   - pipeline/config.json : a PipelineConfig object
//   - pipeline/jobs.json   : ProcessingJob[]  (the COMPLETED jobs array)
// This module mirrors those exact relative paths under <appData>/pipeline/ and
// returns the same shapes so the renderer is unchanged.
//
// SCOPE — only the list/get/config DATA surface is ported. The actual subsystem
// keeps three live collections: pendingFiles, activeJobs (both in-memory Maps)
// and completedJobs (the persisted jobs.json array). Only completedJobs is on
// disk; the other two are populated solely by the live native runtime (the
// downloads FSWatcher and the in-flight processFile loop). In a Tauri process
// with no such runtime they are always empty, so the read getters for them
// honestly return [] — matching what Electron would return with no active work.
//
// Channels & shapes:
//   - pipeline:getConfig        -> PipelineConfig            (config.json merged
//                                  over the same hard-coded defaults Electron used)
//   - pipeline:updateConfig     -> bool (true)               (merge + persist
//                                  config.json; downloads-watcher side effect is
//                                  a native no-op here, see DIVERGENCES)
//   - pipeline:getPendingFiles  -> PendingFile[]  (always [], in-memory only)
//   - pipeline:getActiveJobs    -> ProcessingJob[] (always [], in-memory only)
//   - pipeline:getCompletedJobs -> ProcessingJob[]           (jobs.json, sorted
//                                  newest-first by createdAt, optional limit)
//   - pipeline:getJob           -> ProcessingJob | null      (search active then
//                                  completed; active is empty so == completed)
//
// HEAVY / SKIPPED (NOT ported, NOT faked):
//   - pipeline:processFile, pipeline:selectAndProcess  (execute) — run the
//     extract/analyze/summarize/organize/transcribe stage pipeline + native file
//     dialog + fs writes; need the native runtime.
//   - pipeline:cancelJob (cancel) — only meaningful against an in-flight active
//     job, which never exists here.
//   - pipeline:dismissPending — mutates the in-memory pendingFiles Map which is
//     always empty; deleting from an empty map is always false, so it is routed
//     to a faithful `false` rather than implemented against absent state.
//
// DIVERGENCES (documented):
//   - updateConfig's downloads FSWatcher arm/disarm is a live native side effect
//     with no effect on the returned value (always true on a successful write);
//     not reproduced. The persisted config and the bool result are identical.
//   - Electron's getConfig/updateConfig used fs.writeFileSync and would throw on
//     an IO error (rejecting the IPC promise). Here a failed write returns false
//     instead of panicking, an honest degrade rather than crashing the bridge.
//   - id generation in the live processing path used crypto.randomUUID(); the
//     ported read surface never mints ids, so no id helper is needed here.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "config.json";
const JOBS_FILE: &str = "jobs.json";

// --- file IO ----------------------------------------------------------------
// Electron: <userData>/pipeline/<name>. Mirror under <appData>/pipeline/<name>.

fn pipeline_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("pipeline");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(pipeline_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_json(app: &tauri::AppHandle, name: &str, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(pipeline_path(app, name), s).is_ok(),
        Err(_) => false,
    }
}

// --- config -----------------------------------------------------------------

// The exact hard-coded defaults from the ProcessingPipeline constructor.
fn default_config() -> Value {
    json!({
        "enabled": true,
        "watchDownloads": false,
        "autoPrompt": true,
        "defaultOptions": {
            "extract": true,
            "analyze": true,
            "summarize": false,
            "organize": false,
            "transcribe": false,
            "outputFormat": "note"
        },
        "supportedTypes": [
            ".txt", ".md", ".pdf", ".doc", ".docx",
            ".json", ".csv", ".xml", ".html",
            ".mp3", ".wav", ".m4a", ".ogg",
            ".jpg", ".jpeg", ".png", ".gif"
        ],
        "maxFileSizeMB": 100
    })
}

// getConfig(): defaults shallow-merged with the persisted config.json, returned
// as a copy ({ ...this.config }). Electron merges the file over the defaults at
// load (`{ ...this.config, ...JSON.parse(data) }`); we do the same shallow merge.
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let Some(stored) = read_json(app, CONFIG_FILE).as_object() {
        if let Some(base) = cfg.as_object_mut() {
            for (k, v) in stored {
                base.insert(k.clone(), v.clone());
            }
        }
    }
    cfg
}

// updateConfig(updates): shallow-merge updates onto current config, persist, true.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut cfg = get_config(app);
    if let (Some(base), Some(upd)) = (cfg.as_object_mut(), updates.as_object()) {
        for (k, v) in upd {
            base.insert(k.clone(), v.clone());
        }
    }
    // Electron always returns true after a successful writeFileSync; on an IO
    // failure we degrade to false rather than panicking the bridge.
    json!(write_json(app, CONFIG_FILE, &cfg))
}

// --- jobs -------------------------------------------------------------------

fn read_completed(app: &tauri::AppHandle) -> Vec<Value> {
    match read_json(app, JOBS_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn created_at(j: &Value) -> i64 {
    j.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}

// getCompletedJobs(limit?): sort newest-first by createdAt, optional slice.
fn get_completed_jobs(app: &tauri::AppHandle, limit: Option<u64>) -> Value {
    let mut jobs = read_completed(app);
    jobs.sort_by(|a, b| created_at(b).cmp(&created_at(a)));
    if let Some(n) = limit {
        jobs.truncate(n as usize);
    }
    json!(jobs)
}

// getJob(id): active jobs first (always empty here), then completed, else null.
fn get_job(app: &tauri::AppHandle, id: &str) -> Value {
    read_completed(app)
        .into_iter()
        .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(id))
        .unwrap_or(Value::Null)
}

/// Route a `pipeline:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; heavy
/// execute/cancel channels return Value::Null (honest degrade — not faked).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "pipeline:getConfig" => get_config(app),
        "pipeline:updateConfig" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &updates)
        }
        // In-memory-only collections: no native runtime populates them here, so
        // they faithfully return empty, matching Electron with no active work.
        "pipeline:getPendingFiles" => json!([]),
        "pipeline:getActiveJobs" => json!([]),
        "pipeline:getCompletedJobs" => {
            let limit = args.get(0).and_then(|v| v.as_u64());
            get_completed_jobs(app, limit)
        }
        "pipeline:getJob" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_job(app, id)
        }
        // dismissPending deletes from the (always empty) pendingFiles map -> false.
        "pipeline:dismissPending" => json!(false),
        // HEAVY (execute / cancel) — needs the native runtime, not ported.
        "pipeline:processFile"
        | "pipeline:selectAndProcess"
        | "pipeline:cancelJob" => Value::Null,
        _ => Value::Null,
    }
}
