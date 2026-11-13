// =============================================================================
// DEX Tauri — Storage usage + safe cache cleanup (Settings > Storage & Data).
//
// Replaces controls that only pretended to work (cache size / auto-clean /
// "Clear Cache" that removed a localStorage key nothing wrote, then reported
// success). Everything here is measured from disk.
//
//   storage:getUsage    -> { categories: [{ id, label, bytes, disposable, note }],
//                            totals: { keep, disposable }, pendingCacheClear }
//   storage:clearCaches -> schedules removal of the web engine's DISPOSABLE caches
//                          (HTTP cache, GPU/shader caches) and deletes old logs now.
//
// Why "next launch": WebView2 keeps its cache files open while DEX runs, so the
// directories can't be deleted live. `run_pending_cache_clear()` runs in main()
// BEFORE WebView2 starts. Safety: each cache dir is first RENAMED to a tombstone;
// Windows refuses to rename a directory containing open files, so a cache still
// in use (e.g. another DEX instance racing the single-instance check) is never
// touched. Never removed: Local Storage, IndexedDB, cookies, Code Cache (speeds
// up startup), databases, backups, the search index, vault, keys.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const MARKER: &str = "clear-web-cache.pending";

/// Disposable caches inside the WebView2 user-data folder (`EBWebView`).
const WEB_CACHE_DIRS: &[&str] = &[
    "Default/Cache",
    "Default/GPUCache",
    "Default/DawnGraphiteCache",
    "Default/DawnWebGPUCache",
    "GrShaderCache",
    "GraphiteDawnCache",
    "ShaderCache",
];

fn local_root() -> PathBuf {
    // Same folder wry uses for EBWebView and webview2.rs uses for logs.
    crate::webview2::log_dir().parent().map(Path::to_path_buf).unwrap_or_default()
}

fn web_root() -> PathBuf {
    local_root().join("EBWebView")
}

pub fn dir_size(p: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![p.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let Ok(m) = e.metadata() else { continue };
            if m.is_dir() {
                stack.push(e.path());
            } else {
                total += m.len();
            }
        }
    }
    total
}

fn web_cache_bytes() -> u64 {
    WEB_CACHE_DIRS.iter().map(|d| dir_size(&web_root().join(d))).sum()
}

pub fn usage(app: &tauri::AppHandle) -> Value {
    let data = app.dex_data_dir().unwrap_or_default();
    let mut cats: Vec<Value> = Vec::new();
    let mut keep = 0u64;
    let mut disposable = 0u64;
    let mut push = |id: &str, label: &str, bytes: u64, disp: bool, note: &str| {
        if disp { disposable += bytes } else { keep += bytes }
        cats.push(json!({ "id": id, "label": label, "bytes": bytes, "disposable": disp, "note": note }));
    };

    // Persistent user data — reported, never cleared from here.
    let known = ["databases", "backups", "search-index"];
    push("databases", "Databases (notes, tasks, settings)", dir_size(&data.join("databases")), false, "Your data");
    push("backups", "Backups", dir_size(&data.join("backups")), false, "Your data — manage in Backup & Sync");
    push("searchIndex", "Search index", dir_size(&data.join("search-index")), false, "Rebuilt automatically if removed");
    let other: u64 = std::fs::read_dir(&data)
        .map(|rd| {
            rd.flatten()
                .filter(|e| !known.contains(&e.file_name().to_string_lossy().as_ref()))
                .map(|e| if e.path().is_dir() { dir_size(&e.path()) } else { e.metadata().map(|m| m.len()).unwrap_or(0) })
                .sum()
        })
        .unwrap_or(0);
    push("otherData", "Other app data", other, false, "Preferences, history, app state");

    let web = web_root();
    push("webStorage", "Web storage (saved app state)", dir_size(&web.join("Default/Local Storage")) + dir_size(&web.join("Default/IndexedDB")), false, "Holds settings — kept");
    push("codeCache", "Script code cache", dir_size(&web.join("Default/Code Cache")), false, "Kept: makes DEX start faster");
    push("webCache", "Web engine cache", web_cache_bytes(), true, "Downloaded map tiles, images, GPU shaders");
    push("logs", "Logs", dir_size(&crate::webview2::log_dir()), true, "Startup diagnostics");

    json!({
        "categories": cats,
        "totals": { "keep": keep, "disposable": disposable },
        "pendingCacheClear": local_root().join(MARKER).exists(),
    })
}

/// Schedule the web-cache removal for the next launch and clear logs now.
pub fn clear_caches() -> Value {
    let root = local_root();
    let _ = std::fs::create_dir_all(&root);
    let scheduled = crate::write_atomic(root.join(MARKER), b"1").is_ok();
    // Logs aren't held open between writes, so they can go immediately.
    let logs = crate::webview2::log_dir();
    let log_bytes = dir_size(&logs);
    let _ = std::fs::remove_dir_all(&logs);
    crate::webview2::log("storage: cache clear scheduled for next launch; logs cleared");
    json!({
        "scheduled": scheduled,
        "webCacheBytes": web_cache_bytes(),
        "logBytesFreed": log_bytes,
    })
}

/// Called from main() before WebView2 starts. No-op unless scheduled.
pub fn run_pending_cache_clear() {
    let marker = local_root().join(MARKER);
    if !marker.exists() {
        return;
    }
    let (freed, skipped) = clear_dirs(&web_root(), WEB_CACHE_DIRS);
    let _ = std::fs::remove_file(&marker);
    crate::webview2::log(&format!(
        "storage: cleared web caches, freed {} KB{}",
        freed / 1024,
        if skipped > 0 { format!(", {skipped} dir(s) in use and left alone") } else { String::new() }
    ));
}

/// Remove `dirs` under `root`, but only those that can be renamed first (i.e.
/// nothing inside is open). Returns (bytes freed, dirs skipped as in-use).
fn clear_dirs(root: &Path, dirs: &[&str]) -> (u64, usize) {
    let (mut freed, mut skipped) = (0u64, 0usize);
    for rel in dirs {
        let dir = root.join(rel);
        if !dir.exists() {
            continue;
        }
        let tomb = dir.with_extension("dex-deleting");
        let _ = std::fs::remove_dir_all(&tomb); // leftover from an interrupted run
        if std::fs::rename(&dir, &tomb).is_err() {
            skipped += 1;
            continue;
        }
        freed += dir_size(&tomb);
        let _ = std::fs::remove_dir_all(&tomb);
    }
    (freed, skipped)
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str) -> Value {
    match channel {
        "storage:getUsage" => usage(app),
        "storage:clearCaches" => clear_caches(),
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("dex-storage-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn clears_only_listed_dirs_and_reports_bytes() {
        let root = tmp("clear");
        std::fs::create_dir_all(root.join("Default/Cache")).unwrap();
        crate::write_atomic(root.join("Default/Cache/blob"), vec![0u8; 4096]).unwrap();
        std::fs::create_dir_all(root.join("Default/Local Storage")).unwrap();
        crate::write_atomic(root.join("Default/Local Storage/keep"), b"settings").unwrap();
        let (freed, skipped) = clear_dirs(&root, &["Default/Cache", "Default/Missing"]);
        assert_eq!((freed, skipped), (4096, 0));
        assert!(!root.join("Default/Cache").exists());
        assert!(root.join("Default/Local Storage/keep").exists(), "user state must survive");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(windows)]
    #[test]
    fn leaves_a_dir_alone_while_a_file_inside_is_open() {
        let root = tmp("inuse");
        std::fs::create_dir_all(root.join("Default/Cache")).unwrap();
        let held = std::fs::File::create(root.join("Default/Cache/open")).unwrap();
        let (_, skipped) = clear_dirs(&root, &["Default/Cache"]);
        assert_eq!(skipped, 1);
        assert!(root.join("Default/Cache/open").exists());
        drop(held);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn dir_size_sums_nested_files() {
        let root = tmp("size");
        std::fs::create_dir_all(root.join("a/b")).unwrap();
        crate::write_atomic(root.join("a/x"), vec![0u8; 10]).unwrap();
        crate::write_atomic(root.join("a/b/y"), vec![0u8; 20]).unwrap();
        assert_eq!(dir_size(&root), 30);
        let _ = std::fs::remove_dir_all(&root);
    }
}
