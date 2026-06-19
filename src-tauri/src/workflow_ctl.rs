// =============================================================================
// DEX Tauri — Workflow data surface (partial port of the `workflow:*` IPC
// handlers in WorkflowController.ts, which delegate to WorkflowEngine).
//
// Pure-data, JSON-backed tier (same backbone as analytics.rs). Electron's
// WorkflowEngine persisted saved workflows to a plain JSON file under userData
// (NOT electron-store): `dex-workflows.json` with the shape
//   { workflows: [Workflow, ...] }
// and loaded them into an in-memory Map keyed by workflow.id. This module
// mirrors that file verbatim under <appData>/dex-workflows.json so the renderer
// sees identical data.
//
// Channels ported (DATA only) and their EXACT Electron return shapes:
//   - workflow:getAll -> Workflow[]        (WorkflowEngine.getWorkflows():
//                        Array.from(savedWorkflows.values()) — the stored
//                        objects verbatim, [] when none)
//   - workflow:get    -> Workflow | null   (WorkflowEngine.getWorkflow(id):
//                        savedWorkflows.get(id) ?? null — stored object verbatim,
//                        or JSON null for an unknown id)
//
// A Workflow object is returned exactly as stored; this module does not reshape,
// validate, or inject fields — both handlers are read-only passthroughs over the
// persisted array, so faithfully echoing the stored JSON is the correct port.
//
// HEAVY channels are intentionally NOT handled here (they need the live native
// runtime: process spawning, the executor graph, dialogs, the active-execution
// state machine):
//   - workflow:execute / workflow:cancel(abort/pause/resume) / debug
// `dispatch` returns Value::Null for any channel it does not port (honest
// degrade), so the prefix router must NOT blanket-route the `workflow:` namespace
// to this module — sibling handlers in main.rs (e.g. workflow:execute/executeNew)
// own those channels. Route only workflow:getAll / workflow:get here.
//
// DIVERGENCES (documented):
//   - Storage location: Electron used app.getPath('userData'); Tauri uses
//     app.path().app_data_dir(). Same file name and same { workflows: [...] }
//     wrapper, so the on-disk contract is preserved across the migration.
//   - Electron held the workflows in an in-memory Map (populated once at engine
//     construction) and the read handlers served from that Map. This module reads
//     the file on each call instead. For the read-only `getAll`/`get` surface the
//     observable result is identical (the Map is just a load-time cache of the
//     same file); it also means out-of-band writes are picked up immediately.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const WORKFLOWS_FILE: &str = "dex-workflows.json";

// --- file IO (mirrors analytics.rs store_path/read_file helpers) -------------

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

// The persisted workflow array (`data.workflows ?? []` in loadWorkflows).
fn read_workflows(app: &tauri::AppHandle) -> Vec<Value> {
    read_file(app, WORKFLOWS_FILE)
        .get("workflows")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn id_of(w: &Value) -> Option<&str> {
    w.get("id").and_then(|v| v.as_str())
}

// WorkflowEngine.getWorkflows() -> Workflow[]
fn get_all(app: &tauri::AppHandle) -> Value {
    json!(read_workflows(app))
}

// WorkflowEngine.getWorkflow(id) -> Workflow | null
fn get_one(app: &tauri::AppHandle, workflow_id: &str) -> Value {
    read_workflows(app)
        .into_iter()
        .find(|w| id_of(w) == Some(workflow_id))
        .unwrap_or(Value::Null)
}

/// Route a `workflow:*` DATA channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the read-only data channels are
/// ported; every other channel (heavy/runtime or owned elsewhere) returns
/// Value::Null so the caller can fall through to its own handler.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "workflow:getAll" => get_all(app),
        "workflow:get" => {
            let workflow_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_one(app, workflow_id)
        }
        _ => Value::Null,
    }
}
