// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use crate::code_tasks_core::{self, Run};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[derive(Default)]
struct Inner {
    runs: HashMap<String, Arc<Run>>,
    next_id: u64,
}

#[derive(Default)]
pub struct CodeTasks(Mutex<Inner>);

fn request(
    app: &tauri::AppHandle,
    owner: &str,
    channel: &str,
    args: &Value,
) -> Result<Value, String> {
    if channel == "codeTasks:list" {
        let root = code_tasks_core::project_root(args["root"].as_str().unwrap_or_default())?;
        let mut catalog = serde_json::to_value(code_tasks_core::discover(&root))
            .map_err(|error| error.to_string())?;
        catalog["success"] = json!(true);
        return Ok(catalog);
    }
    let state = app.state::<CodeTasks>();
    let mut state = state
        .0
        .lock()
        .map_err(|_| "Project task service is unavailable.")?;
    if channel == "codeTasks:start" {
        if app.get_webview_window(owner).is_none() {
            return Err("The project window is closed.".into());
        }
        if state.runs.get(owner).is_some_and(|run| run.is_running()) {
            return Err("A project task is already running in this window.".into());
        }
        let root = code_tasks_core::project_root(args["root"].as_str().unwrap_or_default())?;
        state.next_id = state
            .next_id
            .checked_add(1)
            .ok_or("Project task sequence exhausted.")?;
        let run = code_tasks_core::start_project_task(
            state.next_id,
            root,
            args["taskId"].as_str().unwrap_or_default(),
        )?;
        let result = json!({ "success": true, "run": run.snapshot(0) });
        state.runs.insert(owner.into(), run);
        return Ok(result);
    }
    let existing = state.runs.get(owner).cloned();
    drop(state);
    let id = args["id"].as_u64();
    if channel == "codeTasks:read" && id.is_none() {
        return Ok(json!({ "success": true, "run": existing.map(|run| json!(run.snapshot(0))) }));
    }
    let run = existing
        .filter(|run| Some(run.id) == id)
        .ok_or("This project task is no longer available.")?;
    match channel {
        "codeTasks:cancel" => {
            run.cancel();
            Ok(json!({ "success": true }))
        }
        "codeTasks:read" => Ok(
            json!({ "success": true, "run": run.snapshot(args["cursor"].as_u64().unwrap_or(0)) }),
        ),
        "codeTasks:diagnosticPath" => {
            let path = code_tasks_core::diagnostic_path(
                &run.root,
                args["path"].as_str().unwrap_or_default(),
            )?;
            Ok(json!({ "success": true, "path": path }))
        }
        _ => Err("Unknown project task operation.".into()),
    }
}

pub fn dispatch(app: &tauri::AppHandle, owner: &str, channel: &str, args: &Value) -> Value {
    request(app, owner, channel, &args[0])
        .unwrap_or_else(|error| json!({ "success": false, "error": error }))
}

pub fn close_window(app: &tauri::AppHandle, owner: &str) {
    if let Some(state) = app.try_state::<CodeTasks>() {
        if let Ok(mut state) = state.0.lock() {
            if let Some(run) = state.runs.remove(owner) {
                run.cancel();
            }
        }
    }
}
