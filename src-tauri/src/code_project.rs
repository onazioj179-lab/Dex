// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use crate::{
    code_project_core::{self, Workspace},
    git, kv_repository,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct WindowProject {
    workspace: Option<Workspace>,
    latest_search: u64,
    search: Option<Arc<AtomicBool>>,
}

impl WindowProject {
    fn stop_search(&mut self) {
        if let Some(search) = self.search.take() {
            search.store(true, Ordering::Release);
        }
    }
}

#[derive(Default)]
pub struct CodeProjects(Mutex<HashMap<String, WindowProject>>);

fn authority_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("dex-code-project-authority.json"))
        .map_err(|error| error.to_string())
}

fn remember_root(app: &tauri::AppHandle, owner: &str, root: Option<&Path>) -> Result<(), String> {
    if owner == "main" {
        kv_repository::update_authority(&authority_path(app)?, |map| {
            if let Some(root) = root {
                map.insert("root".into(), json!(root));
            } else {
                map.remove("root");
            }
            Ok(())
        })
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn read_root(app: &tauri::AppHandle, owner: &str) -> Result<Option<PathBuf>, String> {
    if owner != "main" {
        return Ok(None);
    }
    let stored = kv_repository::get_current(&authority_path(app)?, "root")
        .map_err(|error| error.to_string())?;
    let Some(path) = stored.as_str().map(Path::new) else {
        return Ok(None);
    };
    let root = code_project_core::root_path(path).map_err(|error| error.to_string())?;
    if root != path {
        return Err(
            "The saved project folder moved. Select it again to restore editing access.".into(),
        );
    }
    Ok(Some(root))
}

fn listing(root: &Path, writable: bool) -> Result<Value, String> {
    let listing = code_project_core::list(root, || false).map_err(|error| error.to_string())?;
    Ok(
        json!({ "success": true, "root": root, "writable": writable, "files": listing.files,
        "limited": listing.limited, "unreadable": listing.unreadable }),
    )
}

fn request(
    app: &tauri::AppHandle,
    owner: &str,
    channel: &str,
    data: &Value,
) -> Result<Value, String> {
    let state = app.state::<CodeProjects>();
    if channel == "codeProject:choose" {
        let Some(path) = app
            .dialog()
            .file()
            .set_title("Open Project Folder")
            .blocking_pick_folder()
            .and_then(crate::native_ops::fp_to_string)
        else {
            return Ok(json!({ "success": true, "canceled": true }));
        };
        let root =
            code_project_core::root_path(Path::new(&path)).map_err(|error| error.to_string())?;
        let response = listing(&root, true)?;
        let mut state = state
            .0
            .lock()
            .map_err(|_| "Project workspace is unavailable.")?;
        if app.get_webview_window(owner).is_none() {
            return Err("The project window is closed.".into());
        }
        remember_root(app, owner, Some(&root))?;
        let project = state.entry(owner.into()).or_default();
        project.stop_search();
        if !project
            .workspace
            .as_ref()
            .is_some_and(|workspace| workspace.root == root)
        {
            project.workspace = Some(Workspace::new(root));
        }
        return Ok(response);
    }
    if channel == "codeProject:restore" {
        let root = {
            let mut state = state
                .0
                .lock()
                .map_err(|_| "Project workspace is unavailable.")?;
            let project = state.entry(owner.into()).or_default();
            if project.workspace.is_none() {
                project.workspace = read_root(app, owner)?.map(Workspace::new);
            }
            project
                .workspace
                .as_ref()
                .map(|workspace| workspace.root.clone())
        };
        return match root {
            Some(root) => listing(&root, true),
            None => Ok(json!({ "success": true, "root": null })),
        };
    }
    if channel == "codeProject:list" {
        let root =
            code_project_core::root_path(Path::new(data["root"].as_str().unwrap_or_default()))
                .map_err(|error| error.to_string())?;
        let writable = state
            .0
            .lock()
            .map_err(|_| "Project workspace is unavailable.")?
            .get(owner)
            .and_then(|project| project.workspace.as_ref())
            .is_some_and(|workspace| workspace.root == root);
        return listing(&root, writable);
    }
    let mut state = state
        .0
        .lock()
        .map_err(|_| "Project workspace is unavailable.")?;
    let project = state.entry(owner.into()).or_default();
    let named_root = Path::new(data["root"].as_str().unwrap_or_default());
    if channel == "codeProject:close" {
        if project
            .workspace
            .as_ref()
            .is_some_and(|workspace| workspace.root == named_root)
        {
            remember_root(app, owner, None)?;
            project.workspace = None;
            project.stop_search();
        }
        return Ok(json!({ "success": true }));
    }
    if channel == "codeProject:cancelSearch" {
        let ticket = data["ticket"].as_u64().unwrap_or(0);
        if ticket >= project.latest_search {
            project.stop_search();
            project.latest_search = ticket;
        }
        return Ok(json!({ "success": true }));
    }
    if channel == "codeProject:search" {
        let ticket = data["ticket"]
            .as_u64()
            .filter(|ticket| *ticket > project.latest_search)
            .ok_or("Project search was superseded.")?;
        let query = data["query"]
            .as_str()
            .filter(|query| query.len() <= 1024)
            .ok_or("Invalid project query.")?;
        project.stop_search();
        let cancelled = Arc::new(AtomicBool::new(false));
        project.latest_search = ticket;
        project.search = Some(Arc::clone(&cancelled));
        drop(state);
        let root = code_project_core::root_path(named_root).map_err(|error| error.to_string())?;
        let limit = data["limit"].as_u64().unwrap_or(200).clamp(1, 200) as usize;
        let found =
            code_project_core::search(&root, query, limit, || cancelled.load(Ordering::Acquire))
                .map_err(|error| error.to_string())?;
        return Ok(
            json!({ "success": true, "hits": found.hits, "limited": found.limited, "skipped": found.skipped }),
        );
    }
    if matches!(channel, "codeProject:gitStatus" | "codeProject:gitDiff") {
        let root = project
            .workspace
            .as_ref()
            .filter(|workspace| workspace.root == named_root)
            .ok_or("Select the project folder to access Git changes.")?
            .root
            .clone();
        drop(state);
        return if channel == "codeProject:gitStatus" {
            git::project_status(&root)
        } else {
            git::project_diff(
                &root,
                data["path"].as_str().ok_or("Missing Git file.")?,
                data["previousPath"].as_str(),
                data["staged"].as_bool().unwrap_or(false),
            )
        };
    }
    let workspace = project
        .workspace
        .as_mut()
        .filter(|workspace| workspace.root == named_root)
        .ok_or("Select the folder in DexCode to enable editing in this project.")?;
    let path = data["path"].as_str().ok_or("Missing project file.")?;
    match channel {
        "codeProject:openFile" => {
            let document = workspace.open(path).map_err(|error| error.to_string())?;
            Ok(json!({ "success": true, "document": document }))
        }
        "codeProject:saveFile" => {
            let content = data["content"].as_str().ok_or("Missing file content.")?;
            let baseline = data["revision"]
                .as_str()
                .ok_or("Missing editor revision.")?;
            let revision = workspace
                .save(path, content, baseline)
                .map_err(|error| error.to_string())?;
            Ok(json!({ "success": true, "revision": revision }))
        }
        _ => Err("Unknown project operation.".into()),
    }
}

pub fn dispatch(app: &tauri::AppHandle, owner: &str, channel: &str, args: &Value) -> Value {
    request(app, owner, channel, &args[0])
        .unwrap_or_else(|error| json!({ "success": false, "error": error }))
}

pub fn close_window(app: &tauri::AppHandle, owner: &str) {
    if let Some(state) = app.try_state::<CodeProjects>() {
        if let Ok(mut state) = state.0.lock() {
            if let Some(mut project) = state.remove(owner) {
                project.stop_search();
            }
        }
    }
}
