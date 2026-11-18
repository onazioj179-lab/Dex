// =============================================================================
// DEX Platform — Umari: UKI's context and knowledge helper (`umari:*`)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Umari organises what UKI may know about the user's files. No model runs here:
//! it is deterministic Rust over the one unified search index (`dex-search`).
//!
//! - Authorized folders: DEX indexes Documents, Desktop and Downloads; anything
//!   else (a code workspace, a dataset folder) is indexed only after the user
//!   picks it here. Drive roots, the whole user profile, Windows, Program Files
//!   and app-data folders are refused. Removing a folder drops it from the index.
//! - Privacy: secret-looking files (keys, .env, credentials) are indexed by name
//!   only, never by content (`dex_search::is_sensitive_file`/`looks_like_secret`),
//!   and Umari never returns a snippet from one.
//! - Projects: folders with a manifest (package.json, Cargo.toml, pyproject.toml,
//!   go.mod, *.sln, CMakeLists.txt, ...) become projects, with the test/build
//!   commands their manifests actually declare. Nothing is invented: a project
//!   with no test script has no test command.
//! - Retrieval: `umari:retrieve` ranks index hits, attaches each to its project,
//!   and returns bounded snippets with their source path, inside a character
//!   budget the caller (UKI's context budget) sets.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::Manager;

use crate::paths::DexPaths;
use crate::util::LockSafe;

const MAX_FOLDERS: usize = 16;
const PROJECT_DEPTH: usize = 4;
const MAX_PROJECTS: usize = 200;
const SNIPPET_CHARS: usize = 360;

fn folders_file(app: &tauri::AppHandle) -> Option<PathBuf> { app.dex_data_dir().ok().map(|d| d.join("umari-folders.json")) }

/// The user-authorized extra folders (beyond Documents / Desktop / Downloads).
pub fn authorized_folders(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let Some(p) = folders_file(app) else { return Vec::new() };
    let Ok(text) = std::fs::read_to_string(p) else { return Vec::new() };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&text) else { return Vec::new() };
    items.iter().filter_map(|v| v.get("path").and_then(|p| p.as_str())).map(PathBuf::from).filter(|p| p.is_dir()).collect()
}

fn read_entries(app: &tauri::AppHandle) -> Vec<Value> {
    folders_file(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
}

fn write_entries(app: &tauri::AppHandle, items: &[Value]) -> bool {
    let Some(p) = folders_file(app) else { return false };
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(items).unwrap_or_default()).is_ok() && std::fs::rename(&tmp, &p).is_ok()
}

fn plain(p: &Path) -> String { p.to_string_lossy().replace("\\\\?\\", "") }

/// The default folders DEX already indexes.
pub fn default_folders(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let p = app.path();
    [p.document_dir(), p.desktop_dir(), p.download_dir()].into_iter().flatten().collect()
}

/// Validate a folder the user wants Umari to index.
pub fn check_folder(raw: &str, home: Option<&Path>, protected: &[PathBuf]) -> Result<PathBuf, String> {
    let p = Path::new(raw.trim());
    if raw.trim().is_empty() || !p.is_absolute() { return Err("choose a full folder path".into()); }
    let p = p.canonicalize().map_err(|_| "that folder does not exist".to_string())?;
    if !p.is_dir() { return Err("that is not a folder".into()); }
    let clean = PathBuf::from(plain(&p));
    if clean.parent().is_none() || clean.components().count() <= 1 { return Err("a whole drive is too broad; choose a folder inside it".into()); }
    let lower = plain(&clean).to_ascii_lowercase();
    let windir = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()).to_ascii_lowercase();
    for b in [windir.as_str(), "c:\\program files", "c:\\program files (x86)", "c:\\programdata"] {
        if lower == b || lower.starts_with(&format!("{b}\\")) { return Err("Windows and program folders are not indexed".into()); }
    }
    if lower.contains("\\appdata\\") || lower.ends_with("\\appdata") { return Err("app-data folders hold other programs' private data and are not indexed".into()); }
    if let Some(h) = home {
        let h = plain(h).to_ascii_lowercase();
        if lower == h { return Err("your whole user folder is too broad; choose a folder inside it".into()); }
    }
    for d in protected {
        let d = plain(d).to_ascii_lowercase();
        if lower == d || lower.starts_with(&format!("{d}\\")) { return Err("DEX already indexes that folder".into()); }
    }
    Ok(clean)
}

// ---- projects ---------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub struct Project {
    pub name: String,
    pub root: PathBuf,
    pub kinds: Vec<&'static str>,
    pub manifests: Vec<String>,
    pub test_command: Option<String>,
    pub build_command: Option<String>,
    pub scripts: Vec<String>,
    pub has_git: bool,
    pub modified: u64,
}

impl Project {
    fn to_json(&self) -> Value {
        json!({ "name": self.name, "root": plain(&self.root), "kinds": self.kinds, "manifests": self.manifests,
                "testCommand": self.test_command, "buildCommand": self.build_command, "scripts": self.scripts,
                "hasGit": self.has_git, "modified": self.modified })
    }
}

fn modified_secs(p: &Path) -> u64 {
    std::fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0)
}

/// Read one folder as a project, if it has a manifest. Commands come only
/// from what the manifests declare.
pub fn detect_project(dir: &Path) -> Option<Project> {
    let has = |f: &str| dir.join(f).is_file();
    let mut kinds: Vec<&'static str> = Vec::new();
    let mut manifests: Vec<String> = Vec::new();
    let mut test_command = None;
    let mut build_command = None;
    let mut scripts: Vec<String> = Vec::new();
    let mut name = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

    if has("package.json") {
        kinds.push("node");
        manifests.push("package.json".into());
        if let Ok(v) = std::fs::read_to_string(dir.join("package.json")).map(|t| serde_json::from_str::<Value>(&t).unwrap_or(Value::Null)) {
            if let Some(n) = v.get("name").and_then(|n| n.as_str()) { if !n.trim().is_empty() { name = n.to_string(); } }
            if let Some(obj) = v.get("scripts").and_then(|s| s.as_object()) {
                scripts = obj.keys().take(40).cloned().collect();
                let runner = if has("pnpm-lock.yaml") { "pnpm" } else if has("yarn.lock") { "yarn" } else { "npm" };
                if let Some(t) = obj.get("test").and_then(|t| t.as_str()) {
                    // npm's placeholder script is not a test suite.
                    if !t.contains("no test specified") { test_command = Some(format!("{runner} test")); }
                }
                if obj.contains_key("build") { build_command = Some(format!("{runner} run build")); }
            }
        }
    }
    if has("Cargo.toml") {
        kinds.push("rust");
        manifests.push("Cargo.toml".into());
        if let Ok(t) = std::fs::read_to_string(dir.join("Cargo.toml")) {
            if let Some(line) = t.lines().skip_while(|l| l.trim() != "[package]").skip(1).take_while(|l| !l.trim_start().starts_with('[')).find(|l| l.trim_start().starts_with("name")) {
                if let Some(n) = line.split('=').nth(1) { let n = n.trim().trim_matches('"'); if !n.is_empty() { name = n.into(); } }
            }
        }
        test_command.get_or_insert_with(|| "cargo test".into());
        build_command.get_or_insert_with(|| "cargo build".into());
    }
    if has("pyproject.toml") || has("setup.py") || has("requirements.txt") {
        kinds.push("python");
        for m in ["pyproject.toml", "setup.py", "requirements.txt"] { if has(m) { manifests.push(m.into()); } }
        let pytest = has("pytest.ini") || dir.join("tests").is_dir()
            || std::fs::read_to_string(dir.join("pyproject.toml")).map(|t| t.contains("pytest")).unwrap_or(false);
        if pytest { test_command.get_or_insert_with(|| "python -m pytest".into()); }
    }
    if has("go.mod") {
        kinds.push("go");
        manifests.push("go.mod".into());
        test_command.get_or_insert_with(|| "go test ./...".into());
        build_command.get_or_insert_with(|| "go build ./...".into());
    }
    if has("CMakeLists.txt") { kinds.push("cmake"); manifests.push("CMakeLists.txt".into()); }
    if has("pom.xml") { kinds.push("java"); manifests.push("pom.xml".into()); test_command.get_or_insert_with(|| "mvn test".into()); }
    if has("build.gradle") || has("build.gradle.kts") { kinds.push("gradle"); manifests.push("build.gradle".into()); }
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten().take(400) {
            let n = e.file_name().to_string_lossy().to_string();
            let l = n.to_ascii_lowercase();
            if l.ends_with(".sln") && !kinds.contains(&"dotnet") { kinds.push("dotnet"); manifests.push(n.clone()); test_command.get_or_insert_with(|| "dotnet test".into()); build_command.get_or_insert_with(|| "dotnet build".into()); }
        }
    }
    if kinds.is_empty() { return None; }
    let has_git = dir.join(".git").exists();
    let modified = manifests.iter().map(|m| modified_secs(&dir.join(m))).max().unwrap_or(0);
    Some(Project { name, root: dir.to_path_buf(), kinds, manifests, test_command, build_command, scripts, has_git, modified })
}

const SKIP: &[&str] = &["node_modules", "target", "dist", "build", "out", "coverage", "vendor", "__pycache__", "$recycle.bin", "venv", "env"];

/// Find projects under `roots`, at most `PROJECT_DEPTH` deep. A project's own
/// subfolders are not searched for nested projects (workspace members are
/// part of the project), which keeps this cheap and the list meaningful.
pub fn find_projects(roots: &[PathBuf]) -> Vec<Project> {
    let mut out = Vec::new();
    let mut stack: Vec<(PathBuf, usize)> = roots.iter().map(|r| (r.clone(), 0)).collect();
    let mut visited = 0usize;
    while let Some((dir, depth)) = stack.pop() {
        visited += 1;
        if visited > 20_000 || out.len() >= MAX_PROJECTS { break; }
        if let Some(p) = detect_project(&dir) { out.push(p); continue; }
        if depth >= PROJECT_DEPTH { continue; }
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else { continue };
            if !ft.is_dir() || ft.is_symlink() { continue; }
            let n = e.file_name().to_string_lossy().to_lowercase();
            if n.starts_with('.') || SKIP.contains(&n.as_str()) { continue; }
            stack.push((e.path(), depth + 1));
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

/// The project a path belongs to (deepest matching root).
pub fn project_for<'a>(path: &Path, projects: &'a [Project]) -> Option<&'a Project> {
    projects.iter().filter(|p| path.starts_with(&p.root)).max_by_key(|p| p.root.components().count())
}

// ---- retrieval ---------------------------------------------------------------

/// A short excerpt around the first query term found in `text` (char-safe).
pub fn snippet(text: &str, query: &str, max: usize) -> String {
    let lower = text.to_lowercase();
    let pos = query.split_whitespace().filter(|t| t.len() >= 2).filter_map(|t| lower.find(&t.to_lowercase())).min();
    let chars: Vec<char> = text.chars().collect();
    // Count chars in the lowercased text (a valid boundary there); clamp, as
    // lowercasing can change the length of a few characters.
    let center = pos.map(|byte| lower[..byte].chars().count()).unwrap_or(0).min(chars.len());
    let start = center.saturating_sub(max / 3);
    let end = (start + max).min(chars.len());
    let mut s: String = chars[start..end].iter().collect();
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if start > 0 { s = format!("…{s}"); }
    if end < chars.len() { s.push('…'); }
    s
}

fn under_any(path: &Path, roots: &[PathBuf]) -> bool {
    let l = plain(path).to_ascii_lowercase();
    roots.iter().any(|r| { let r = plain(r).to_ascii_lowercase(); l == r || l.starts_with(&format!("{r}\\")) || l.starts_with(&format!("{r}/")) })
}

fn retrieve(app: &tauri::AppHandle, query: &str, limit: usize, max_chars: usize, project_root: Option<&str>) -> Value {
    let q = query.trim();
    if q.is_empty() { return json!({ "ok": false, "error": "empty query" }); }
    let state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let idx = match state.lock_safe().as_ref() { Some(i) => i.clone(), None => return json!({ "ok": false, "error": "the search index is not ready" }) };
    let mut roots = default_folders(app);
    roots.extend(authorized_folders(app));
    let projects = find_projects(&roots);
    let hits = idx.search(q, (limit * 4).max(20));
    let mut used = 0usize;
    let mut items = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for h in hits {
        if items.len() >= limit || used >= max_chars { break; }
        if !seen.insert(h.id.clone()) { continue; }
        let is_file = h.source == "file";
        let path = PathBuf::from(&h.path);
        // Files must sit inside an authorized folder (the index can hold older
        // entries from a folder the user since removed).
        if is_file && !under_any(&path, &roots) { continue; }
        let project = if is_file { project_for(&path, &projects) } else { None };
        if let Some(pr) = project_root {
            if project.map(|p| plain(&p.root).to_ascii_lowercase()) != Some(pr.to_ascii_lowercase().replace('/', "\\")) { continue; }
        }
        let sensitive = is_file && dex_search::is_sensitive_file(&path);
        let mut text = String::new();
        if is_file && !sensitive && h.size > 0 && h.size <= 262_144 {
            if let Ok(t) = std::fs::read_to_string(&path) { if !dex_search::looks_like_secret(&t) { text = snippet(&t, q, SNIPPET_CHARS); } }
        }
        let budget_left = max_chars.saturating_sub(used);
        if text.chars().count() > budget_left { text = text.chars().take(budget_left).collect(); }
        used += text.chars().count() + h.name.len() + 16;
        items.push(json!({
            "source": h.source, "id": h.id, "path": if is_file { json!(plain(&path)) } else { Value::Null }, "name": h.name,
            "modified": h.modified, "size": h.size, "score": h.score, "snippet": text, "contentWithheld": sensitive,
            "project": project.map(|p| json!({ "name": p.name, "root": plain(&p.root), "kinds": p.kinds })),
        }));
    }
    json!({ "ok": true, "query": q, "items": items, "chars": used, "budget": max_chars })
}

fn index_after_change(app: &tauri::AppHandle) {
    let app = app.clone();
    std::thread::Builder::new().name("umari-index".into()).spawn(move || { let _ = crate::index_sync(&app); }).ok();
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a = args.get(0).cloned().unwrap_or(Value::Null);
    let s = |k: &str| a.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "umari:folders" => {
            let entries = read_entries(app);
            json!({ "ok": true, "defaults": default_folders(app).iter().map(|p| plain(p)).collect::<Vec<_>>(),
                    "folders": entries.into_iter().map(|mut e| { let exists = e.get("path").and_then(|p| p.as_str()).map(|p| Path::new(p).is_dir()).unwrap_or(false); e["exists"] = json!(exists); e }).collect::<Vec<_>>() })
        }
        "umari:addFolder" => {
            // No path from the caller: the user picks it in the native dialog,
            // so nothing (a page, a document, a model) can authorize a folder.
            use tauri_plugin_dialog::DialogExt;
            let Some(picked) = app.dialog().file().set_title("Choose a folder for DEX to index").blocking_pick_folder().and_then(|f| f.into_path().ok()) else {
                return json!({ "ok": false, "cancelled": true });
            };
            let mut entries = read_entries(app);
            if entries.len() >= MAX_FOLDERS { return json!({ "ok": false, "error": format!("at most {MAX_FOLDERS} folders") }); }
            let home = app.path().home_dir().ok();
            let mut protected = default_folders(app);
            protected.extend(authorized_folders(app));
            let dir = match check_folder(&plain(&picked), home.as_deref(), &protected) { Ok(d) => d, Err(e) => return json!({ "ok": false, "error": e }) };
            let entry = json!({ "path": plain(&dir), "name": dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), "addedAt": crate::xack::now_ms() });
            entries.push(entry.clone());
            if !write_entries(app, &entries) { return json!({ "ok": false, "error": "couldn't save the folder list" }); }
            index_after_change(app);
            json!({ "ok": true, "folder": entry })
        }
        "umari:removeFolder" => {
            let target = s("path").to_ascii_lowercase();
            let mut entries = read_entries(app);
            let before = entries.len();
            entries.retain(|e| e.get("path").and_then(|p| p.as_str()).map(|p| p.to_ascii_lowercase()) != Some(target.clone()));
            if entries.len() == before { return json!({ "ok": false, "error": "that folder is not in the list" }); }
            if !write_entries(app, &entries) { return json!({ "ok": false, "error": "couldn't save the folder list" }); }
            index_after_change(app);
            json!({ "ok": true })
        }
        "umari:projects" => {
            let mut roots = default_folders(app);
            roots.extend(authorized_folders(app));
            let projects = find_projects(&roots);
            json!({ "ok": true, "projects": projects.iter().map(|p| p.to_json()).collect::<Vec<_>>() })
        }
        "umari:retrieve" => {
            let limit = a.get("limit").and_then(|v| v.as_u64()).unwrap_or(8).clamp(1, 30) as usize;
            let max_chars = a.get("maxChars").and_then(|v| v.as_u64()).unwrap_or(4000).clamp(200, 20_000) as usize;
            let project = s("project");
            retrieve(app, &s("query"), limit, max_chars, if project.is_empty() { None } else { Some(project.as_str()) })
        }
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_projects_and_only_the_commands_their_manifests_declare() {
        let d = tempfile::tempdir().unwrap();
        let web = d.path().join("site");
        let lib = d.path().join("group").join("engine");
        let bare = d.path().join("bare");
        let notes = d.path().join("notes");
        for p in [&web, &lib, &bare, &notes] { std::fs::create_dir_all(p).unwrap(); }
        std::fs::write(web.join("package.json"), r#"{"name":"my-site","scripts":{"test":"vitest","build":"vite build","dev":"vite"}}"#).unwrap();
        std::fs::write(web.join("yarn.lock"), "").unwrap();
        std::fs::write(lib.join("Cargo.toml"), "[package]\nname = \"engine-core\"\nversion = \"0.1.0\"\n[dependencies]\n").unwrap();
        std::fs::write(bare.join("package.json"), r#"{"name":"bare","scripts":{"test":"echo \"Error: no test specified\" && exit 1"}}"#).unwrap();
        std::fs::write(notes.join("todo.md"), "x").unwrap();
        // A nested node_modules package must not show up as a project.
        std::fs::create_dir_all(web.join("node_modules").join("dep")).unwrap();
        std::fs::write(web.join("node_modules").join("dep").join("package.json"), "{}").unwrap();

        let ps = find_projects(&[d.path().to_path_buf()]);
        let names: Vec<&str> = ps.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(ps.len(), 3, "{names:?}");
        let site = ps.iter().find(|p| p.name == "my-site").unwrap();
        assert_eq!(site.test_command.as_deref(), Some("yarn test"));
        assert_eq!(site.build_command.as_deref(), Some("yarn run build"));
        assert!(site.scripts.contains(&"dev".to_string()));
        let eng = ps.iter().find(|p| p.name == "engine-core").unwrap();
        assert_eq!(eng.kinds, vec!["rust"]);
        assert_eq!(eng.test_command.as_deref(), Some("cargo test"));
        let bare = ps.iter().find(|p| p.name == "bare").unwrap();
        assert_eq!(bare.test_command, None, "npm's placeholder is not a test suite");
        assert_eq!(project_for(&lib.join("src").join("lib.rs"), &ps).unwrap().name, "engine-core");
        assert!(project_for(&notes.join("todo.md"), &ps).is_none());
    }

    #[test]
    fn folder_check_refuses_broad_and_system_locations() {
        // Not the system temp folder: it lives under AppData, which is refused.
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target");
        std::fs::create_dir_all(&base).unwrap();
        let d = tempfile::tempdir_in(&base).unwrap();
        let ok = d.path().join("work");
        std::fs::create_dir_all(&ok).unwrap();
        assert!(check_folder(&ok.to_string_lossy(), None, &[]).is_ok());
        assert!(check_folder("relative\\path", None, &[]).is_err());
        assert!(check_folder(&d.path().join("missing").to_string_lossy(), None, &[]).is_err());
        // Already covered by a default folder.
        assert!(check_folder(&ok.to_string_lossy(), None, &[d.path().to_path_buf()]).is_err());
        // The whole profile is too broad.
        assert!(check_folder(&ok.to_string_lossy(), Some(&ok.canonicalize().unwrap()), &[]).is_err());
        let appdata = tempfile::tempdir().unwrap(); // %TEMP% = AppData\Local\Temp
        #[cfg(windows)]
        assert!(check_folder(&appdata.path().to_string_lossy(), None, &[]).is_err());
        #[cfg(windows)]
        {
            assert!(check_folder("C:\\", None, &[]).is_err());
            let windir = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
            assert!(check_folder(&windir, None, &[]).is_err());
        }
    }

    #[test]
    fn snippet_centres_on_the_query_and_is_bounded_and_char_safe() {
        let text = format!("{} the quarterly roadmap for Ünïcode teams {}", "lorem ".repeat(200), "ipsum ".repeat(200));
        let s = snippet(&text, "roadmap", 80);
        assert!(s.contains("roadmap"), "{s}");
        assert!(s.chars().count() <= 84);
        assert!(s.starts_with('…') && s.ends_with('…'));
        assert_eq!(snippet("short", "zzz", 80), "short");
    }
}
