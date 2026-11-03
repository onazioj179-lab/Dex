// =============================================================================
// DEX 6.0 — Tauri Shell (GOAL-6A)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! DEX 6.0 Tauri shell entry point. Hosts the EXISTING Vite renderer
//! (`../dist/renderer`) and exposes the first native command —
//! `smart_router_route` — backed by the `dex-smart-router` crate, so the React
//! UI can reach the native core through the platform bridge
//! (`src/renderer/services/platform`). Additive: the Electron app (`src/main`)
//! is untouched and remains the shipping product while the migration proceeds.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod activity_feed;
mod browser_view;
mod paths;
mod webview2;
mod storage_ctl;
mod secrets_ctl;
mod ollama_proxy;
mod git;
mod env_manager;
mod ssh;
mod fs_ops;
mod watch;
mod analytics;
mod power;
mod modes;
mod projects;
mod duplicates_resolver;
mod focus_sessions;
mod memory_tracking;
mod operations_log;
mod performance_tier;
mod text_summarizer;
mod resource_monitoring;
mod rule_engine;
mod sessions_manager;
mod splitview_presets;
mod split_view;
mod stability_check;
mod startup_timeline;
mod system_health;
mod tag_manager;
mod user_profile;
mod voice_notes;
mod log_manager;
mod notes_metadata;
mod permissions_manager;
mod pattern_tracking;
mod accessibility_ctl;
mod adaptive_ctl;
mod advisor_ctl;
mod api_server;
mod archive_ctl;
mod autofill_ctl;
mod background_tasks;
mod batch_ctl;
mod battery_ctl;
mod behavior_ctl;
mod browser_ctl;
mod budget_ctl;
mod cli_ctl;
mod cloudsync_ctl;
mod code_ctl;
mod connectors_ctl;
mod containment_ctl;
mod sandbox_ctl;
mod gpu_priority;
mod context_ctl;
mod controls_ctl;
mod corepc_ctl;
mod crash_reporter;
mod creator_ctl;
mod db_perf_ctl;
mod deeplink_ctl;
mod devplatform_ctl;
mod documents_ctl;
mod dtp_ctl;
mod editor_ctl;
mod embedding_ctl;
mod encryption_ctl;
mod enforce_ctl;
mod engine_ctl;
mod export_ctl;
mod extensions_ctl;
mod failure_ctl;
mod features_ctl;
mod folderrules_ctl;
mod gallery_ctl;
mod gpu_ctl;
mod guardrails_ctl;
mod hardware_ctl;
mod healing_ctl;
mod history_ctl;
mod hotkey_ctl;
mod http_transfer_ctl;
mod idle_ctl;
mod import_ctl;
mod input_ctl;
mod ipc_perf;
mod keys_ctl;
mod largefile_ctl;
mod launcher_ctl;
mod longevity_ctl;
mod maintenance_ctl;
mod mediaorg_ctl;
mod mental_ctl;
mod motion_ctl;
mod multiuser_ctl;
mod nextgen_ctl;
mod nexus_ctl;
mod observability_ctl;
mod optimistic_ctl;
mod performance_ctl;
mod permission_ctl;
mod phase1_ctl;
mod pipeline_ctl;
mod plugin_gate;
mod plugins_ctl;
mod prerender_ctl;
mod privacy_ctl;
mod quickactions_ctl;
mod recovery_ctl;
mod reliability_ctl;
mod render_ctl;
mod renderer_health;
mod resource_governor;
mod scheduler_ctl;
mod scripting_ctl;
mod selftest_ctl;
mod session_ctl;
mod shutdown_sequencer;
mod snapshot_ctl;
mod softero_ctl;
mod startup_sequencer;
mod state_ctl;
mod state_sync;
mod sync_ctl;
mod task_queue;
mod thermal_ctl;
mod transfer_ctl;
mod uki_ctl;
mod undo_ctl;
mod uninstall_ctl;
mod update_service;
mod video_ctl;
mod vinx_ctl;
mod visual_ctl;
mod voice_ctl;
mod wake_ctl;
mod watchdog_ctl;
mod xenon_ctl;
mod contract_ctl;
mod device_ctl;
mod games;
mod governance_ctl;
mod intelligence_ctl;
mod learning_ctl;
mod monitor_ctl;
mod network_ctl;
mod security_ctl;
mod store_ctl;
mod tagging_ctl;
mod tasks_ctl;
mod timeline_ctl;
mod trust_ctl;
mod update_ctl;
mod updates_ctl;
mod workflow_ctl;
mod changelog;
mod color_labels;
mod content_expiry;
mod daily_note;
mod dashboard;
mod db;
mod feedback_collector;
mod goal_system;
mod help_system;
mod journal;
mod layout;
mod licensing;
mod native_ops;
// Command-layer modules (app/OS-bound channels, reuse native_ops helpers).
mod cmd_export_bundle;
mod cmd_file_watcher;
mod cmd_link_preview;
mod cmd_scratchpad;
mod cmd_window_monitor;
mod notifications;
mod ai_runtime;
mod auth;
mod http_transfer;
mod read_later;
mod recycle_bin;
mod rewind;
mod terminal;
mod workflows;
mod security;
mod relationship_graph;
mod reminder;
mod scratchpad;
mod search_history;
mod smart_grouping;
mod smart_rename;
mod snapshot_comparison;
mod statistics_dashboard;
mod time_tracking;
mod uki_chat;
mod util;
mod version_history;
mod word_count;
mod zlib;
// Wave 2 — project-* family + voice memo, daily briefing, dependency,
// duplication detector, bulk metadata.
mod bulk_metadata;
mod daily_briefing;
mod dependency;
mod duplication_detector;
mod project_archiver;
mod project_comparison;
mod project_export_bundle;
mod project_health;
mod project_linker;
mod project_lock;
mod project_timeline;
mod voice_memo;
// Wave 3 — notes, NL tasks, theme schedule, session replay, shared media,
// vinx presentation, localization, keyboard navigation.
mod keyboard_navigation;
mod localization;
mod nl_task;
mod notes;
mod session_replay;
mod shared_media_library;
mod theme_schedule;
mod vinx_presentation;
// Wave 4 — notification hub, localization engine, global search, FTS index,
// multi-window/monitor, migration, link preview, live collab, file watcher,
// backup/restore. (Several are window/network/fs-bound and degrade honestly.)
mod backup_restore;
mod file_watcher;
mod full_text_index;
mod global_content_search;
mod link_preview;
mod live_collaboration;
mod localization_engine;
mod migration;
mod multi_monitor;
mod multi_window;
mod unified_notification_hub;

use paths::DexPaths;
use dex_smart_router::{route_for_prompt, RouteCandidate, RoutingGoal};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::Manager;

/// Resolve a renderer path which may be an alias ("documents", "home", ...) or a
/// real absolute path. Mirrors the Electron `resolveSystemPath` aliases.
fn resolve_path(app: &tauri::AppHandle, input: &str) -> PathBuf {
    let p = app.path();
    let fallback = || PathBuf::from(".");
    match input.trim().to_lowercase().as_str() {
        "home" | "~" => p.home_dir().unwrap_or_else(|_| fallback()),
        "documents" => p.document_dir().unwrap_or_else(|_| fallback()),
        "desktop" => p.desktop_dir().unwrap_or_else(|_| fallback()),
        "downloads" => p.download_dir().unwrap_or_else(|_| fallback()),
        "pictures" => p.picture_dir().unwrap_or_else(|_| fallback()),
        "music" => p.audio_dir().unwrap_or_else(|_| fallback()),
        "videos" => p.video_dir().unwrap_or_else(|_| fallback()),
        _ => PathBuf::from(input),
    }
}

/// `files:list` — read a directory, returning the same shape the Electron
/// FileManagerController did: { success, path, files: [{ name, path, isDirectory,
/// size, modified, extension }] }.
fn files_list(app: &tauri::AppHandle, dir: &str) -> Value {
    let resolved = resolve_path(app, dir);
    let read = match std::fs::read_dir(&resolved) {
        Ok(r) => r,
        Err(e) => {
            return json!({
                "success": false, "error": e.to_string(),
                "path": resolved.to_string_lossy(), "files": [],
            });
        }
    };
    let mut files: Vec<Value> = Vec::new();
    for entry in read.flatten() {
        let path = entry.path();
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();
        let name = entry.file_name().to_string_lossy().to_string();
        files.push(json!({
            "path": path.to_string_lossy(),
            "isDirectory": is_dir,
            "size": size,
            "modified": modified,
            "extension": ext,
            "hidden": meta.as_ref().map(|m| is_hidden_entry(&name, m)).unwrap_or(false),
            "name": name,
        }));
    }
    json!({ "success": true, "path": resolved.to_string_lossy(), "files": files })
}

/// Hidden per the platform: dotfiles everywhere, plus the HIDDEN / SYSTEM
/// attributes on Windows (Settings > Files > Show Hidden Files).
fn is_hidden_entry(name: &str, meta: &std::fs::Metadata) -> bool {
    if name.starts_with('.') {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
        if meta.file_attributes() & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM) != 0 {
            return true;
        }
    }
    #[cfg(not(windows))]
    let _ = meta;
    false
}

/// Destination of a move/copy: target_dir joined with the source basename.
fn dest_in_dir(src: &str, target_dir: &str) -> PathBuf {
    let name = std::path::Path::new(src)
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    PathBuf::from(target_dir).join(name)
}

fn io_result(res: std::io::Result<()>, path: &str) -> Value {
    match res {
        Ok(()) => json!({ "success": true, "path": path }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn files_rename(old: &str, new_name: &str) -> Value {
    // Only the basename of new_name (prevent path traversal via the filename).
    let safe = std::path::Path::new(new_name)
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    let dest = std::path::Path::new(old)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join(safe);
    io_result(std::fs::rename(old, &dest), &dest.to_string_lossy())
}

fn files_move(src: &str, target_dir: &str) -> Value {
    let dest = dest_in_dir(src, target_dir);
    match std::fs::rename(src, &dest) {
        Ok(()) => json!({ "success": true, "path": dest.to_string_lossy() }),
        // rename fails across volumes — fall back to copy + remove.
        Err(_) => match std::fs::copy(src, &dest) {
            Ok(_) => io_result(std::fs::remove_file(src), &dest.to_string_lossy()),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        },
    }
}

fn files_copy(src: &str, target_dir: &str) -> Value {
    let dest = dest_in_dir(src, target_dir);
    if std::path::Path::new(src).is_dir() {
        return json!({ "success": false, "error": "directory copy not supported yet" });
    }
    match std::fs::copy(src, &dest) {
        Ok(_) => json!({ "success": true, "path": dest.to_string_lossy() }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn files_delete(path: &str) -> Value {
    let p = std::path::Path::new(path);
    let res = if p.is_dir() {
        std::fs::remove_dir_all(p)
    } else {
        std::fs::remove_file(p)
    };
    io_result(res, path)
}

fn files_mkdir(path: &str) -> Value {
    io_result(std::fs::create_dir_all(path), path)
}

/// `files:organizeByType` — sort the immediate (non-recursive) files of a
/// directory into type subfolders (images/documents/spreadsheets/audio/video/
/// archives/other), returning the `FileOperation[]` move log the Electron
/// `FileManager.organizeByType` produced. Each entry mirrors the TS
/// `FileOperation` shape exactly: { id, type:'move', sourcePath, targetPath,
/// timestamp, success, error?, undoable:true, undoData:{originalPath,
/// originalName} }. The extension -> folder map is byte-identical to Electron.
/// NOTE: the server-side, cross-call undo *history* the Electron engine kept
/// (so `undoLastOperation` could replay) is not ported — each call is stateless
/// (documented gap in docs/TAURI-MIGRATION.md); the per-op `undoData` is still
/// returned so the renderer has everything needed to reverse a move itself.
fn files_organize_by_type(dir: &str) -> Value {
    let now_ms = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // Same extension -> folder map as the Electron FileManager (lowercased).
    let type_map: &[(&str, &[&str])] = &[
        ("images", &[".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"]),
        ("documents", &[".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt"]),
        ("spreadsheets", &[".xls", ".xlsx", ".csv", ".ods"]),
        ("audio", &[".mp3", ".wav", ".flac", ".aac", ".ogg"]),
        ("video", &[".mp4", ".avi", ".mkv", ".mov", ".wmv"]),
        ("archives", &[".zip", ".rar", ".7z", ".tar", ".gz"]),
    ];

    let read = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };

    let mut operations: Vec<Value> = Vec::new();
    for entry in read.flatten() {
        let path = entry.path();
        // Skip directories (only files are organized).
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }

        let ext = path
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
            .unwrap_or_default();
        let folder = type_map
            .iter()
            .find(|(_, exts)| exts.contains(&ext.as_str()))
            .map(|(name, _)| *name)
            .unwrap_or("other");

        let target_dir = PathBuf::from(dir).join(folder);
        // Create the destination folder on demand; skip this file if it fails
        // (matches the Electron `continue` on mkdir error).
        if !target_dir.exists() && std::fs::create_dir_all(&target_dir).is_err() {
            continue;
        }

        let src = path.to_string_lossy().to_string();
        let original_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let target_path = target_dir.join(&original_name);
        let target_str = target_path.to_string_lossy().to_string();

        // Build the operation record (success filled in after the move).
        let mut op = json!({
            "id": crate::util::pseudo_uuid_v4(),
            "type": "move",
            "sourcePath": src,
            "targetPath": target_str,
            "timestamp": now_ms,
            "success": false,
            "undoable": true,
            "undoData": { "originalPath": src, "originalName": original_name },
        });

        if target_path.exists() {
            op["error"] = json!("Target file already exists");
        } else {
            match std::fs::rename(&path, &target_path) {
                Ok(()) => op["success"] = json!(true),
                // Cross-volume rename fails — fall back to copy + remove.
                Err(_) => match std::fs::copy(&path, &target_path) {
                    Ok(_) => match std::fs::remove_file(&path) {
                        Ok(()) => op["success"] = json!(true),
                        Err(e) => op["error"] = json!(e.to_string()),
                    },
                    Err(e) => op["error"] = json!(e.to_string()),
                },
            }
        }
        operations.push(op);
    }

    Value::Array(operations)
}

/// `system:getStatus` / `power:getStats` — full live snapshot: CPU%, cores,
/// memory, disk, and network throughput.
///
/// CPU usage and network rate are deltas, so this takes two samples around a
/// short sleep (`MINIMUM_CPU_UPDATE_INTERVAL`) -- a single refresh always reports
/// 0% CPU. The structured `cpu`/`memory`/`disk`/`network`/`uptime` fields are
/// what the Task Manager reads; the flat `memory*MB`/`uptimeSec` fields are kept
/// for the older power/diagnostics consumers that still read them.
fn system_status() -> Value {
    use std::time::Instant;

    let mut sys = sysinfo::System::new_all();
    // Baseline network counters; received()/transmitted() then report the bytes
    // moved since this point, which we divide by the elapsed time for a rate.
    let mut networks = sysinfo::Networks::new_with_refreshed_list();
    let t0 = Instant::now();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_all();
    networks.refresh();
    let elapsed = t0.elapsed().as_secs_f64().max(0.001);

    let cpu_usage = sys.global_cpu_info().cpu_usage();
    let cores = sys.cpus().len() as u64;

    let mem_used = sys.used_memory(); // bytes (sysinfo 0.30)
    let mem_total = sys.total_memory();
    let mem_percent = if mem_total > 0 { (mem_used as f64 / mem_total as f64) * 100.0 } else { 0.0 };
    let mem_available = sys.available_memory();
    let (swap_used, swap_total) = (sys.used_swap(), sys.total_swap());

    let (mut rx, mut tx, mut iface_count) = (0u64, 0u64, 0u64);
    for (_iface, data) in &networks {
        rx += data.received();
        tx += data.transmitted();
        iface_count += 1;
    }
    let rx_bps = (rx as f64 / elapsed) as u64;
    let tx_bps = (tx as f64 / elapsed) as u64;

    let disks = sysinfo::Disks::new_with_refreshed_list();
    let (mut disk_total, mut disk_avail) = (0u64, 0u64);
    for d in &disks {
        disk_total += d.total_space();
        disk_avail += d.available_space();
    }
    let disk_used = disk_total.saturating_sub(disk_avail);
    let disk_percent = if disk_total > 0 { (disk_used as f64 / disk_total as f64) * 100.0 } else { 0.0 };

    let uptime = sysinfo::System::uptime();

    json!({
        "success": true,
        "shell": "tauri",
        // Legacy flat fields (power:getStats / diagnostics back-compat).
        "memoryUsedMB": mem_used / (1024 * 1024),
        "memoryTotalMB": mem_total / (1024 * 1024),
        "uptimeSec": uptime,
        // Structured fields read by the Task Manager.
        "cpu": { "usage": cpu_usage, "cores": cores },
        "memory": {
            "used": mem_used, "total": mem_total, "percent": mem_percent,
            "available": mem_available, "swapUsed": swap_used, "swapTotal": swap_total,
        },
        "disk": { "used": disk_used, "total": disk_total, "percent": disk_percent },
        "network": { "connected": iface_count > 0, "rxBps": rx_bps, "txBps": tx_bps },
        "uptime": uptime,
    })
}

/// A process row for ranking. Kept separate from the JSON shape so the ranking
/// policy is pure + unit-testable without sysinfo / a live machine.
#[derive(Clone)]
struct ProcInfo {
    pid: u32,
    name: String,
    cpu: f32,
    memory_mb: u64,
}

/// Number of processes returned to the UI. A task list wants the resource hogs,
/// not an unsorted dump of every PID on the machine.
const PROCESS_LIMIT: usize = 60;

/// Rank by resource pressure — CPU% descending, memory as the tiebreaker — and
/// keep the top `limit`. Pure and deterministic.
fn rank_processes(mut procs: Vec<ProcInfo>, limit: usize) -> Vec<ProcInfo> {
    procs.sort_by(|a, b| {
        b.cpu
            .partial_cmp(&a.cpu)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.memory_mb.cmp(&a.memory_mb))
    });
    procs.truncate(limit);
    procs
}

/// `system:getProcesses` — top running processes by resource use (pid, name,
/// cpu%, memMB). Ranked + capped so the UI gets the hogs, not raw noise.
/// Returns a bare array: every renderer caller (Task Manager, Power, Settings,
/// UKI) and `global.d.ts` expect `any[]`; the old `{ success, processes }`
/// wrapper made all of them show an empty list.
fn system_processes() -> Value {
    let mut sys = sysinfo::System::new_all();
    // Per-process CPU% is a delta between two samples; without the sleep every
    // process reads 0% and the ranking collapses to memory only.
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_all();
    let all: Vec<ProcInfo> = sys
        .processes()
        .iter()
        .map(|(pid, p)| ProcInfo {
            pid: pid.as_u32(),
            name: p.name().to_string(),
            cpu: p.cpu_usage(),
            memory_mb: p.memory() / (1024 * 1024),
        })
        .collect();
    let procs: Vec<Value> = rank_processes(all, PROCESS_LIMIT)
        .iter()
        .map(|p| {
            json!({
                "pid": p.pid,
                "name": p.name,
                "cpu": p.cpu,
                "memory": p.memory_mb,
            })
        })
        .collect();
    Value::Array(procs)
}

#[cfg(test)]
mod process_ranking_tests {
    use super::{rank_processes, ProcInfo};

    fn p(pid: u32, cpu: f32, memory_mb: u64) -> ProcInfo {
        ProcInfo { pid, name: format!("proc{pid}"), cpu, memory_mb }
    }

    #[test]
    fn ranks_by_cpu_then_memory_and_truncates() {
        let procs = vec![p(1, 5.0, 100), p(2, 50.0, 10), p(3, 5.0, 900)];
        let top = rank_processes(procs, 2);
        assert_eq!(top.len(), 2);
        assert_eq!(top[0].pid, 2, "highest CPU first");
        assert_eq!(top[1].pid, 3, "CPU tie -> higher memory first");
    }

    #[test]
    fn limit_larger_than_len_is_safe() {
        assert_eq!(rank_processes(vec![p(1, 1.0, 1)], 10).len(), 1);
        assert!(rank_processes(vec![], 5).is_empty());
    }
}

/// `system:killProcess` — terminate by pid.
fn system_kill(pid: u32) -> Value {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_processes();
    match sys.process(sysinfo::Pid::from_u32(pid)) {
        Some(p) => {
            let ok = p.kill();
            json!({ "success": ok, "message": if ok { "terminated" } else { "kill failed" } })
        }
        None => json!({ "success": false, "message": "process not found" }),
    }
}

// --- Launch at login ---------------------------------------------------------
// Per-user `Run` key (HKCU, no admin). The value is the current executable, so
// the entry follows wherever DEX is installed. Other platforms report
// `supported: false` and the Settings row hides itself.

#[cfg(windows)]
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(windows)]
const RUN_VALUE: &str = "DEX";

#[cfg(windows)]
fn reg(args: &[&str]) -> bool {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("reg")
        .args(args)
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn launch_at_login_get() -> Value {
    #[cfg(windows)]
    {
        let enabled = reg(&["query", RUN_KEY, "/v", RUN_VALUE]);
        json!({ "supported": true, "enabled": enabled })
    }
    #[cfg(not(windows))]
    {
        json!({ "supported": false, "enabled": false })
    }
}

fn launch_at_login_set(enable: bool) -> Value {
    #[cfg(windows)]
    {
        let ok = if enable {
            match std::env::current_exe() {
                Ok(exe) => {
                    let quoted = format!("\"{}\"", exe.display());
                    reg(&["add", RUN_KEY, "/v", RUN_VALUE, "/t", "REG_SZ", "/d", &quoted, "/f"])
                }
                Err(_) => false,
            }
        } else {
            // Deleting a value that is not there fails; that still means "off".
            reg(&["delete", RUN_KEY, "/v", RUN_VALUE, "/f"]) || !reg(&["query", RUN_KEY, "/v", RUN_VALUE])
        };
        let enabled = reg(&["query", RUN_KEY, "/v", RUN_VALUE]);
        json!({ "supported": true, "success": ok && enabled == enable, "enabled": enabled })
    }
    #[cfg(not(windows))]
    {
        let _ = enable;
        json!({ "supported": false, "success": false, "enabled": false })
    }
}

// --- Shell open policy -------------------------------------------------------
// `open::that` hands its argument to the OS opener (ShellExecuteW on Windows),
// which will happily launch executables, scripts, installers and arbitrary URI
// handlers. The renderer (or an XSS in it) must not be able to reach that, so
// both open channels validate the target first.

/// URI schemes `shell:openExternal` may open. Built from real renderer usage:
/// http/https (Settings repository/issues links, account checkout + billing
/// portal, UKI `ui.openLink`, Workflows "Open URL"), mailto (account payment
/// methods), windowsdefender (Settings > Privacy "Open Windows Security"),
/// ms-settings (Settings buttons that jump to Windows display/sound/Bluetooth/
/// network pages). Both Windows schemes only open system settings UI.
const OPEN_EXTERNAL_SCHEMES: &[&str] =
    &["http", "https", "mailto", "windowsdefender", "ms-settings"];

/// Extensions `shell:openPath` refuses: anything the OS opener would execute,
/// install, or follow to another target (Windows PATHEXT + Microsoft's
/// "unsafe file types" list, shortcuts, and the macOS/Linux equivalents).
/// Launching apps goes through `launcher:*`, which only runs scanned apps.
const BLOCKED_OPEN_EXTENSIONS: &[&str] = &[
    // Windows executables / installers / libraries
    "exe", "com", "scr", "pif", "cpl", "msc", "msi", "msp", "mst", "msix", "msixbundle",
    "appx", "appxbundle", "application", "appref-ms", "gadget", "dll", "ocx", "sys", "drv",
    "xll", "xbap", "diagcab", "diagcfg", "diagpkg",
    // Windows scripts / script hosts
    "bat", "cmd", "ps1", "psm1", "psd1", "ps1xml", "psc1", "pssc", "vb", "vbs", "vbe", "js",
    "jse", "wsf", "wsh", "wsc", "ws", "hta", "sct", "shb", "shs", "msh", "msh1", "msh2",
    "mshxml", "msh1xml", "msh2xml", "reg", "inf", "scf", "jar",
    // Shortcuts / redirectors that resolve to another (possibly executable) target
    "lnk", "url", "website", "settingcontent-ms", "library-ms", "searchconnector-ms",
    // Cross-platform script interpreters
    "py", "pyw", "pyc", "pyz", "pl", "rb", "php", "sh", "bash", "zsh", "csh", "ksh", "fish",
    // macOS / Linux launchers and installers
    "app", "command", "tool", "workflow", "terminal", "pkg", "mpkg", "desktop", "appimage",
    "run", "deb", "rpm",
];

/// Validate a `shell:openExternal` target: a well-formed URI whose scheme is
/// on [`OPEN_EXTERNAL_SCHEMES`]. Web URLs must carry a host.
fn check_external_url(target: &str) -> Result<(), String> {
    let t = target.trim();
    if t.is_empty() {
        return Err("empty URL".into());
    }
    if t.chars().any(|c| c.is_control()) {
        return Err("URL contains control characters".into());
    }
    let (scheme, rest) = t
        .split_once(':')
        .ok_or_else(|| "not a URL (missing scheme)".to_string())?;
    let valid_scheme = scheme.chars().next().map_or(false, |c| c.is_ascii_alphabetic())
        && scheme.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'));
    if !valid_scheme {
        return Err("not a URL (invalid scheme)".into());
    }
    let scheme = scheme.to_ascii_lowercase();
    if !OPEN_EXTERNAL_SCHEMES.contains(&scheme.as_str()) {
        return Err(format!("URL scheme '{scheme}:' is not allowed"));
    }
    if scheme == "http" || scheme == "https" {
        let host = rest
            .strip_prefix("//")
            .ok_or_else(|| "web URL must start with //".to_string())?
            .split(['/', '?', '#'])
            .next()
            .unwrap_or("");
        if host.rsplit('@').next().unwrap_or("").is_empty() {
            return Err("web URL has no host".into());
        }
    }
    Ok(())
}

/// Lowercased extension of a file name, ignoring the trailing dots/spaces that
/// Windows silently strips ("evil.exe. " opens as "evil.exe").
fn effective_extension(path: &std::path::Path) -> Option<String> {
    let name = path.file_name()?.to_string_lossy();
    let name = name.trim_end_matches(['.', ' ']);
    let (_, ext) = name.rsplit_once('.')?;
    Some(ext.to_ascii_lowercase())
}

/// Validate a resolved `shell:openPath` target: an absolute, local, existing
/// file or folder that is not an executable/script/shortcut.
fn check_open_path(path: &std::path::Path) -> Result<(), String> {
    let raw = path.to_string_lossy();
    if raw.trim().is_empty() {
        return Err("empty path".into());
    }
    if raw.chars().any(|c| c.is_control()) {
        return Err("path contains control characters".into());
    }
    if raw.contains("://") {
        return Err("URLs must be opened with shell:openExternal".into());
    }
    // UNC / device paths: opening them can leak NTLM credentials to a remote
    // host or reach \\?\ and \\.\ device namespaces.
    if raw.starts_with("\\\\") || raw.starts_with("//") {
        return Err("network and device paths are not allowed".into());
    }
    if !path.is_absolute() {
        return Err("path must be absolute".into());
    }
    // NTFS alternate data streams ("notes.txt:payload.exe"): the only colon a
    // Windows path may carry is the drive letter's.
    #[cfg(windows)]
    if raw.char_indices().any(|(i, c)| c == ':' && i != 1) {
        return Err("alternate data streams are not allowed".into());
    }
    let meta = std::fs::metadata(path).map_err(|e| format!("path not found: {e}"))?;
    // Check both the name as given and the real target (symlinks/junctions,
    // 8.3 names and case are resolved by canonicalize).
    let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    for p in [path, canonical.as_path()] {
        if let Some(ext) = effective_extension(p) {
            if BLOCKED_OPEN_EXTENSIONS.contains(&ext.as_str()) {
                return Err(format!("refusing to open executable or script (.{ext})"));
            }
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if meta.is_file() && meta.permissions().mode() & 0o111 != 0 {
            return Err("refusing to open an executable file".into());
        }
    }
    let _ = meta;
    Ok(())
}

fn open_with_os(target: &str) -> Value {
    match open::that(target) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// `shell:openExternal` — open an allow-listed URI with the OS default handler.
fn shell_open_external(target: &str) -> Value {
    match check_external_url(target) {
        Ok(()) => open_with_os(target.trim()),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

/// `shell:openPath` / `fileIntel:openFile` / `media:openWithSystem` — open an
/// existing, non-executable file or folder (aliases like "pictures" resolve).
fn shell_open_path(app: &tauri::AppHandle, target: &str) -> Value {
    let resolved = resolve_path(app, target);
    match check_open_path(&resolved) {
        Ok(()) => open_with_os(&resolved.to_string_lossy()),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[cfg(test)]
mod shell_open_policy_tests {
    use super::{check_external_url, check_open_path, effective_extension};
    use std::path::{Path, PathBuf};

    #[test]
    fn external_allows_web_mail_and_windows_security() {
        for ok in [
            "https://github.com/dex/dex/issues",
            "HTTP://example.com",
            "https://user@example.com:8443/a?b=c#d",
            "  https://example.com/padded  ",
            "mailto:billing@example.com?subject=Hi",
            "windowsdefender:",
            "windowsdefender://threat",
            "ms-settings:display",
            "MS-SETTINGS:sound",
            "ms-settings:bluetooth",
            "ms-settings:network",
        ] {
            assert!(check_external_url(ok).is_ok(), "{ok} should be allowed");
        }
    }

    #[test]
    fn external_refuses_files_executables_and_other_schemes() {
        for bad in [
            "",
            "   ",
            "C:\\Windows\\System32\\calc.exe",
            "calc.exe",
            "/usr/bin/xterm",
            "file:///C:/Windows/System32/cmd.exe",
            "javascript:alert(1)",
            "vbscript:msgbox",
            "ms-msdt:/id PCWDiagnostic",
            "search-ms:query=x&crumb=location:\\\\evil\\share",
            "ms-officecmd:{}",
            "ms-settings-evil:display",
            "ms-setting:display",
            "\\\\evil-host\\share\\payload.exe",
            "https:example.com",
            "https://",
            "https://@/",
            "https://example.com/\nmalicious",
            "1http://example.com",
        ] {
            assert!(check_external_url(bad).is_err(), "{bad:?} should be refused");
        }
    }

    #[test]
    fn extension_ignores_windows_trailing_dots_and_spaces() {
        assert_eq!(effective_extension(Path::new("evil.EXE")).as_deref(), Some("exe"));
        assert_eq!(effective_extension(Path::new("evil.exe. .")).as_deref(), Some("exe"));
        assert_eq!(effective_extension(Path::new("README")), None);
    }

    fn scratch_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dex-shell-open-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn path_allows_existing_documents_and_folders() {
        let dir = scratch_dir("allow");
        for name in ["report.pdf", "photo.JPG", "notes.txt", "Makefile"] {
            let f = dir.join(name);
            std::fs::write(&f, b"x").unwrap();
            assert!(check_open_path(&f).is_ok(), "{name} should be allowed");
        }
        assert!(check_open_path(&dir).is_ok(), "folders open in the file manager");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn path_refuses_executables_scripts_and_shortcuts() {
        let dir = scratch_dir("refuse");
        for name in [
            "setup.exe", "run.BAT", "x.cmd", "x.ps1", "x.vbs", "x.js", "pkg.msi", "app.lnk",
            "screen.scr", "site.url", "page.hta", "tool.jar", "x.py", "x.sh", "x.reg",
        ] {
            let f = dir.join(name);
            std::fs::write(&f, b"x").unwrap();
            let err = check_open_path(&f).expect_err(name);
            assert!(err.contains("executable"), "{name}: {err}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn path_refuses_missing_relative_network_and_url_targets() {
        let dir = scratch_dir("misc");
        assert!(check_open_path(&dir.join("missing.pdf")).is_err());
        assert!(check_open_path(Path::new("relative/notes.txt")).is_err());
        assert!(check_open_path(Path::new("\\\\evil-host\\share\\doc.pdf")).is_err());
        assert!(check_open_path(Path::new("//evil-host/share/doc.pdf")).is_err());
        assert!(check_open_path(Path::new("https://example.com")).is_err());
        assert!(check_open_path(Path::new("")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn path_refuses_alternate_data_streams_and_device_paths() {
        let dir = scratch_dir("ads");
        let f = dir.join("notes.txt");
        std::fs::write(&f, b"x").unwrap();
        let ads = PathBuf::from(format!("{}:payload.exe", f.display()));
        assert!(check_open_path(&ads).is_err());
        assert!(check_open_path(Path::new("\\\\?\\C:\\Windows\\System32\\calc.exe")).is_err());
        assert!(check_open_path(Path::new("\\\\.\\PhysicalDrive0")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn path_refuses_extensionless_executables() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch_dir("exec");
        let f = dir.join("payload");
        std::fs::write(&f, b"#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(check_open_path(&f).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// `os:lockScreen` — lock the workstation (Windows). Other power controls
/// (shutdown/restart/sleep) are intentionally deferred until tested.
fn os_lock() -> Value {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("rundll32.exe")
            .args(["user32.dll,LockWorkStation"])
            .spawn();
        json!({ "success": true })
    }
    #[cfg(not(windows))]
    {
        json!({ "success": false, "error": "unsupported platform" })
    }
}

// --- Batch 1: clipboard ----------------------------------------------------
fn clipboard_write(text: &str) -> Value {
    match arboard::Clipboard::new().and_then(|mut c| c.set_text(text.to_string())) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}
fn clipboard_read() -> Value {
    match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
        Ok(t) => json!(t),
        Err(_) => json!(""),
    }
}

// --- Batch 2: persistent key-value store (JSON in app config dir) ----------
fn kv_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .dex_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("dex-kv.json")
}
fn kv_load(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    std::fs::read_to_string(kv_path(app))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}
pub(crate) fn kv_get(app: &tauri::AppHandle, key: &str) -> Value {
    kv_load(app).get(key).cloned().unwrap_or(Value::Null)
}
pub(crate) fn kv_set(app: &tauri::AppHandle, key: &str, value: Value) -> Value {
    let mut map = kv_load(app);
    map.insert(key.to_string(), value);
    let data = serde_json::to_string(&Value::Object(map)).unwrap_or_default();
    match std::fs::write(kv_path(app), data) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// Settings > Reset DEX: set the KV file aside (renamed, not deleted, so a
/// mistaken reset can be undone by renaming it back) and start empty.
fn kv_reset(app: &tauri::AppHandle) -> Value {
    let path = kv_path(app);
    if !path.exists() {
        return json!({ "success": true, "backup": Value::Null });
    }
    let backup = path.with_file_name(format!("dex-kv.reset-{}.json", chrono_free_now_ms()));
    match std::fs::rename(&path, &backup) {
        Ok(()) => json!({ "success": true, "backup": backup.display().to_string() }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn chrono_free_now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// --- Settings + theme (kv-backed) ------------------------------------------
// Both subsystems are pure key-value in Electron (capabilityLayer.storage for
// settings, dataStore for themeConfig). The renderer reaches them through the
// same persistent store, so they ride the kv file above — no new state needed.
const SETTINGS_KEY: &str = "dex-system-settings";
const THEME_KEY: &str = "themeConfig";

fn settings_get(app: &tauri::AppHandle) -> Value {
    let v = kv_get(app, SETTINGS_KEY);
    if v.is_object() {
        v
    } else {
        json!({})
    }
}

/// Default theme config — mirrors THEME_DEFAULTS in src/main/utils/constants.ts.
fn theme_defaults() -> Value {
    json!({
        "mode": "dark",
        "accentColor": "#6366f1",
        "fontScale": 1,
        "reducedMotion": false,
        "density": "comfortable",
    })
}

fn theme_config(app: &tauri::AppHandle) -> Value {
    let v = kv_get(app, THEME_KEY);
    if v.is_object() {
        v
    } else {
        theme_defaults()
    }
}

/// Mutate one field of the stored theme config (the theme:set* handlers).
fn theme_set_field(app: &tauri::AppHandle, field: &str, value: Value) -> Value {
    let mut map = kv_get(app, THEME_KEY)
        .as_object()
        .cloned()
        .unwrap_or_default();
    map.insert(field.to_string(), value);
    kv_set(app, THEME_KEY, Value::Object(map))
}

fn theme_presets() -> Value {
    json!([
        { "id": "true-black", "name": "True Black", "accentColor": "#0a84ff", "mode": "dark" },
        { "id": "midnight", "name": "Midnight", "accentColor": "#5e5ce6", "mode": "dark" },
        { "id": "ocean", "name": "Ocean", "accentColor": "#64d2ff", "mode": "dark" },
        { "id": "sunset", "name": "Sunset", "accentColor": "#ff9f0a", "mode": "dark" },
        { "id": "rose", "name": "Rose", "accentColor": "#ff375f", "mode": "dark" },
    ])
}

fn theme_apply_preset(app: &tauri::AppHandle, preset_id: &str) -> Value {
    let accent = match preset_id {
        "true-black" => "#0a84ff",
        "midnight" => "#5e5ce6",
        "ocean" => "#64d2ff",
        "sunset" => "#ff9f0a",
        "rose" => "#ff375f",
        _ => return json!({ "success": true }), // unknown preset: no-op, matches Electron
    };
    let preset = json!({
        "mode": "dark", "accentColor": accent, "fontScale": 1,
        "reducedMotion": false, "density": "comfortable",
    });
    let _ = kv_set(app, THEME_KEY, preset);
    json!({ "success": true })
}

// --- Batch 3: reveal in file manager ---------------------------------------
fn reveal_in_explorer(path: &str) -> Value {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn();
        json!({ "success": true })
    }
    #[cfg(not(windows))]
    {
        let _ = open::that(path);
        json!({ "success": true })
    }
}

// --- Batch 5: app data locations -------------------------------------------
fn app_paths(app: &tauri::AppHandle) -> Value {
    let p = app.path();
    json!({
        "config": p.app_config_dir().ok().map(|d| d.to_string_lossy().to_string()),
        "data": p.app_data_dir().ok().map(|d| d.to_string_lossy().to_string()),
        "home": p.home_dir().ok().map(|d| d.to_string_lossy().to_string()),
    })
}

// --- Wave 2: bounded filesystem walk powering search + recent --------------
// Bounded (depth-first, capped) so a query can never hang the worker thread on
// a huge tree. A native index (Tantivy) supersedes this in a later batch.
fn walk_collect(root: &std::path::Path, max: usize) -> Vec<(PathBuf, std::fs::Metadata)> {
    let mut out: Vec<(PathBuf, std::fs::Metadata)> = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    let cap_scan = max.saturating_mul(4);
    let mut scanned = 0usize;
    while let Some(dir) = stack.pop() {
        if out.len() >= max || scanned >= cap_scan {
            break;
        }
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            scanned += 1;
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.starts_with('.') || name == "node_modules" || name == "$recycle.bin" {
                    continue;
                }
                stack.push(entry.path());
            } else {
                out.push((entry.path(), meta));
                if out.len() >= max {
                    break;
                }
            }
        }
    }
    out
}

fn file_entry_json(path: &std::path::Path, meta: &std::fs::Metadata) -> Value {
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();
    json!({
        "name": path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        "path": path.to_string_lossy(),
        "type": ext.clone(),
        "extension": ext,
        "size": meta.len(),
        "modified": modified,
        "score": 1.0,
    })
}

fn files_search(app: &tauri::AppHandle, query: &str, location: Option<String>) -> Value {
    if query.trim().is_empty() {
        return json!({ "success": true, "files": [] });
    }
    let root = resolve_path(app, &location.unwrap_or_else(|| "home".into()));
    let q = query.to_lowercase();
    let files = walk_collect(&root, 8000);
    let matches: Vec<Value> = files
        .iter()
        .filter(|(p, _)| {
            p.file_name()
                .map(|n| n.to_string_lossy().to_lowercase().contains(&q))
                .unwrap_or(false)
        })
        .take(200)
        .map(|(p, m)| file_entry_json(p, m))
        .collect();
    json!({ "success": true, "files": matches })
}

fn files_recent(app: &tauri::AppHandle, limit: usize) -> Value {
    let p = app.path();
    let mut files: Vec<(PathBuf, std::fs::Metadata)> = Vec::new();
    for dir in [p.document_dir(), p.desktop_dir(), p.download_dir()]
        .into_iter()
        .flatten()
    {
        files.extend(walk_collect(&dir, 3000));
    }
    files.sort_by_key(|b| std::cmp::Reverse(b.1.modified().ok()));
    let out: Vec<Value> = files
        .iter()
        .take(limit)
        .map(|(p, m)| file_entry_json(p, m))
        .collect();
    json!({ "success": true, "files": out })
}

fn get_scopes(app: &tauri::AppHandle) -> Value {
    let stored = kv_get(app, "fileScopes");
    if let Some(arr) = stored.as_array() {
        if !arr.is_empty() {
            return json!(arr);
        }
    }
    let p = app.path();
    let mut scopes: Vec<Value> = Vec::new();
    for (name, dir) in [
        ("Documents", p.document_dir()),
        ("Desktop", p.desktop_dir()),
        ("Downloads", p.download_dir()),
    ] {
        if let Ok(d) = dir {
            scopes.push(json!({ "path": d.to_string_lossy(), "name": name, "fileCount": 0, "indexed": false }));
        }
    }
    json!(scopes)
}

// --- Wave B: trash (safe delete) + os/disk info ----------------------------
fn move_to_trash(path: &str) -> Value {
    match trash::delete(path) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn os_info() -> Value {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0);
    json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "cores": cores,
        "memTotalMB": sys.total_memory() / (1024 * 1024),
        "hostname": sysinfo::System::host_name(),
    })
}

fn disk_usage() -> Value {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let list: Vec<Value> = disks
        .iter()
        .map(|d| {
            json!({
                "mount": d.mount_point().to_string_lossy(),
                "totalGB": d.total_space() / (1024 * 1024 * 1024),
                "availableGB": d.available_space() / (1024 * 1024 * 1024),
            })
        })
        .collect();
    json!({ "success": true, "disks": list })
}

// --- Native audio analysis (GOAL-6C) ---------------------------------------
fn audio_metadata(path: &str) -> Value {
    match dex_audio::metadata(path) {
        Ok(m) => json!(m),
        Err(e) => json!({ "success": false, "error": e }),
    }
}
fn audio_waveform(path: &str, buckets: usize) -> Value {
    match dex_audio::waveform(path, buckets) {
        Ok(peaks) => json!({ "success": true, "peaks": peaks }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Native beat/tempo/onset analysis (Smart Tempo). `opts` is an optional JSON
/// object: { hop, minBpm, maxBpm, sensitivity } — any subset overrides defaults.
fn audio_beats(path: &str, opts: &Value) -> Value {
    let mut o = dex_audio::BeatOptions::default();
    if let Some(h) = opts.get("hop").and_then(|v| v.as_u64()) {
        o.hop = h as usize;
    }
    if let Some(v) = opts.get("minBpm").and_then(|v| v.as_f64()) {
        o.min_bpm = v as f32;
    }
    if let Some(v) = opts.get("maxBpm").and_then(|v| v.as_f64()) {
        o.max_bpm = v as f32;
    }
    if let Some(v) = opts.get("sensitivity").and_then(|v| v.as_f64()) {
        o.sensitivity = v as f32;
    }
    match dex_audio::analyze_beats(path, o) {
        Ok(a) => json!({
            "success": true,
            "bpm": a.bpm,
            "confidence": a.confidence,
            "onsets": a.onsets,
            "hop": a.hop,
            "sampleRate": a.sample_rate,
        }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Native musical key/scale detection (chromagram + Krumhansl-Schmuckler).
fn audio_key(path: &str) -> Value {
    match dex_audio::detect_key(path) {
        Ok(k) => json!({
            "success": true,
            "key": k.key,
            "scale": k.scale,
            "confidence": k.confidence,
            "chroma": k.chroma,
            "sampleRate": k.sample_rate,
        }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Native silence detection + removal plan. `opts` is an optional JSON object:
/// { thresholdDb, minSilenceSec, windowSec, paddingSec }.
fn audio_silence(path: &str, opts: &Value) -> Value {
    let mut o = dex_audio::SilenceOptions::default();
    if let Some(v) = opts.get("thresholdDb").and_then(|v| v.as_f64()) {
        o.threshold_db = v as f32;
    }
    if let Some(v) = opts.get("minSilenceSec").and_then(|v| v.as_f64()) {
        o.min_silence_sec = v as f32;
    }
    if let Some(v) = opts.get("windowSec").and_then(|v| v.as_f64()) {
        o.window_sec = v as f32;
    }
    if let Some(v) = opts.get("paddingSec").and_then(|v| v.as_f64()) {
        o.padding_sec = v as f32;
    }
    match dex_audio::analyze_silence(path, o) {
        Ok(p) => json!({
            "success": true,
            "keep": p.keep,
            "remove": p.remove,
            "removedSec": p.removed_sec,
            "keptSec": p.kept_sec,
            "originalSec": p.original_sec,
        }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Native integrated loudness (BS.1770 LUFS) + sample peak.
fn audio_loudness(path: &str) -> Value {
    match dex_audio::analyze_loudness(path) {
        Ok(l) => json!({
            "success": true,
            "lufs": l.lufs,
            "peakDbfs": l.peak_dbfs,
            "sampleRate": l.sample_rate,
        }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

// --- Native search index (Tantivy, GOAL-6A) --------------------------------
/// Query the index; `None` when the index is empty so the caller falls back to
/// the bounded filesystem walk.
fn index_search(app: &tauri::AppHandle, query: &str, limit: usize) -> Option<Value> {
    // Clone the (Arc-backed) index handle out of the guard and release the lock
    // immediately, so a concurrent rebuild can't block this search.
    let state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let idx = { state.lock().ok()?.as_ref()?.clone() };
    if idx.count() == 0 {
        return None;
    }
    Some(json!({ "success": true, "files": idx.search(query, limit) }))
}

/// Clear + rebuild the index from the user's document folders.
fn index_rebuild(app: &tauri::AppHandle) -> Value {
    // Take a clone of the index handle, then DROP the lock before the multi-second
    // clear + walk so searches stay responsive during a rebuild. The clone shares
    // the same underlying Tantivy index (internally synchronized).
    let state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let idx = {
        let guard = match state.lock() {
            Ok(g) => g,
            Err(_) => return json!({ "success": false, "error": "index busy" }),
        };
        match guard.as_ref() {
            Some(i) => i.clone(),
            None => return json!({ "success": false, "error": "index unavailable" }),
        }
    }; // lock released here

    if let Err(e) = idx.clear() {
        return json!({ "success": false, "error": e });
    }
    let p = app.path();
    let mut total = 0usize;
    for dir in [p.document_dir(), p.desktop_dir(), p.download_dir()]
        .into_iter()
        .flatten()
    {
        if let Ok(n) = idx.index_path(&dir, 20000) {
            total += n;
        }
    }
    json!({ "success": true, "indexed": total })
}

fn index_stats(app: &tauri::AppHandle) -> Value {
    let state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let count = state
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|i| i.count()))
        .unwrap_or(0);
    json!({ "indexed": count, "shell": "tauri" })
}

/// Clone the managed search-index handle out of the lock (Arc-backed, so cheap),
/// releasing the mutex before any indexing work. `None` when unavailable.
fn index_handle(app: &tauri::AppHandle) -> Option<dex_search::SearchIndex> {
    let state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let idx = state.lock().ok()?.as_ref()?.clone();
    Some(idx)
}

/// Upsert an arbitrary content doc (note / clipboard / …) into the unified index
/// so global search spans every kind of DEX content, not just files.
fn search_upsert_doc(app: &tauri::AppHandle, id: &str, source: &str, title: &str, body: &str, modified: u64) -> Value {
    let idx = match index_handle(app) {
        Some(i) => i,
        None => return json!({ "success": false, "error": "index unavailable" }),
    };
    match idx.upsert_doc(id, source, title, body, modified) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Remove a unified-index doc (any source) by its stable id.
fn search_remove_doc(app: &tauri::AppHandle, id: &str) -> Value {
    let idx = match index_handle(app) {
        Some(i) => i,
        None => return json!({ "success": false, "error": "index unavailable" }),
    };
    match idx.remove_doc(id) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Incrementally re-sync the index against the user's folders WITHOUT a full
/// rebuild: snapshot each folder (size+mtime), diff it against the previous
/// snapshot held in managed state, then `upsert_file` the added/modified files
/// and `remove_path` the deleted ones. Cheap to call often (e.g. on focus).
///
/// Guard: a first run (empty baseline) or an unusually large diff falls back to a
/// full clear+rebuild, because `upsert_file` commits per file and thousands of
/// commits would be pathological — incremental is for the small steady-state diff.
/// The last-synced `{path -> stamp}` snapshot, persisted INSIDE the index dir so
/// the two can never drift apart (wipe the index and its snapshot goes too).
/// Without it every launch started from an empty snapshot, and the launch-time
/// `search:sync` took the "initial build" path: clear + re-index every file in
/// Documents/Desktop/Downloads (measured ~80 CPU-seconds per launch).
fn snapshot_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.dex_data_dir().unwrap_or_default().join("search-index").join("dex-snapshot.json")
}

/// Load the persisted snapshot, but only when the index actually holds
/// documents — an empty/new index must be built, not diffed.
fn load_snapshot(app: &tauri::AppHandle, index: Option<&dex_search::SearchIndex>) -> dex_scanner::Snapshot {
    if index.map(|i| i.count()).unwrap_or(0) == 0 {
        return dex_scanner::Snapshot::new();
    }
    std::fs::read(snapshot_path(app))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save_snapshot(app: &tauri::AppHandle, snap: &dex_scanner::Snapshot) {
    if let Ok(bytes) = serde_json::to_vec(snap) {
        let path = snapshot_path(app);
        let tmp = path.with_extension("json.tmp");
        // write-then-rename so a crash mid-write never leaves a torn snapshot
        if std::fs::write(&tmp, bytes).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

fn index_sync(app: &tauri::AppHandle) -> Value {
    // Clone the (Arc-backed) index handle and release the search lock immediately.
    let search_state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let idx = {
        let guard = match search_state.lock() {
            Ok(g) => g,
            Err(_) => return json!({ "success": false, "error": "index busy" }),
        };
        match guard.as_ref() {
            Some(i) => i.clone(),
            None => return json!({ "success": false, "error": "index unavailable" }),
        }
    };

    let p = app.path();
    let dirs: Vec<std::path::PathBuf> = [p.document_dir(), p.desktop_dir(), p.download_dir()]
        .into_iter()
        .flatten()
        .collect();

    // Hold the snapshot lock for the whole sync so two syncs can't interleave; it
    // is a different mutex from the search index, so queries stay responsive.
    let snap_state = app.state::<std::sync::Mutex<dex_scanner::Snapshot>>();
    let mut prev = match snap_state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false, "error": "snapshot busy" }),
    };

    if prev.is_empty() {
        *prev = load_snapshot(app, Some(&idx));
    }
    let mut new_snapshot: dex_scanner::Snapshot = dex_scanner::Snapshot::new();
    for dir in &dirs {
        new_snapshot.extend(dex_scanner::scan_snapshot(dir, 20000));
    }
    let diff = dex_scanner::diff_snapshots(&prev, &new_snapshot);

    const SYNC_UPSERT_LIMIT: usize = 500;
    let change_count = diff.added.len() + diff.modified.len();
    if prev.is_empty() || change_count > SYNC_UPSERT_LIMIT {
        // Initial build or too-large diff: a full rebuild is cheaper than thousands
        // of single-file commits. Reset the baseline to the freshly-scanned state.
        let _ = idx.clear();
        let mut total = 0usize;
        for dir in &dirs {
            if let Ok(n) = idx.index_path(dir, 20000) {
                total += n;
            }
        }
        *prev = new_snapshot;
        save_snapshot(app, &prev);
        return json!({ "success": true, "mode": "rebuilt", "indexed": total });
    }

    // One commit for the whole diff (was one writer + commit per file).
    let upserts: Vec<std::path::PathBuf> = diff.added.iter().chain(diff.modified.iter()).map(std::path::PathBuf::from).collect();
    let removals: Vec<std::path::PathBuf> = diff.removed.iter().map(std::path::PathBuf::from).collect();
    let (upserted, removed) = match idx.apply_file_changes(&upserts, &removals) {
        Ok(n) => (n, removals.len()),
        Err(_) => (0, 0),
    };
    let changed = !diff.is_empty();
    *prev = new_snapshot;
    if changed {
        save_snapshot(app, &prev); // unchanged tree: skip the multi-MB rewrite
    }

    json!({
        "success": true,
        "mode": "incremental",
        "added": diff.added.len(),
        "modified": diff.modified.len(),
        "removed": removed,
        "upserted": upserted,
    })
}

/// Start a live, push-based filesystem watcher over the indexed folders so the
/// search index refreshes itself as files change — the push complement to the
/// poll-based `search:sync`. Change bursts are coalesced (~1.5s quiet window) and
/// then run through `index_sync`, whose snapshot-diff collapses even noisy or
/// metadata-only events down to the minimal set of upserts/removals. The watcher
/// is owned by its debounce thread for the app's lifetime; if setup fails it
/// degrades silently (on-demand `search:sync` / `search:rebuild` still work).
/// What one debounced burst of watcher events asks the index to do.
enum IndexWork {
    /// Upsert/remove exactly these paths (no directory walk).
    Paths(std::collections::HashSet<std::path::PathBuf>),
    /// Directory-level change, watcher overflow or a huge burst: full sync.
    Full,
}

/// Apply changed paths straight to the index. Returns false when the batch
/// needs a full sync instead (a directory appeared/vanished: its children
/// can't be known from the event alone).
fn index_apply_paths(app: &tauri::AppHandle, paths: &std::collections::HashSet<std::path::PathBuf>) -> bool {
    let search_state = app.state::<std::sync::Mutex<Option<dex_search::SearchIndex>>>();
    let idx = match search_state.lock() {
        Ok(g) => match g.as_ref() {
            Some(i) => i.clone(),
            None => return true, // no index: nothing to keep fresh
        },
        Err(_) => return true,
    };
    let (mut upserts, mut removals) = (Vec::new(), Vec::new());
    for p in paths {
        if p.is_dir() {
            return false;
        }
        if p.is_file() {
            upserts.push(p.clone());
        } else if p.extension().is_none() {
            // Gone and extension-less: may have been a folder of indexed files.
            return false;
        } else {
            removals.push(p.clone());
        }
    }
    // One commit for the whole burst (was one writer + commit per file).
    let _ = idx.apply_file_changes(&upserts, &removals);
    true
}

fn start_index_watcher(app: tauri::AppHandle) {
    use notify::Watcher;
    let dirs: Vec<std::path::PathBuf> = {
        let p = app.path();
        [p.document_dir(), p.desktop_dir(), p.download_dir()]
            .into_iter()
            .flatten()
            .collect()
    };
    if dirs.is_empty() {
        return;
    }
    // None = the watcher lost events (overflow) and asks for a rescan.
    let (tx, rx) = std::sync::mpsc::channel::<Option<Vec<std::path::PathBuf>>>();
    let roots = dirs.clone();
    // An event matters only if it can change the index: paths inside dirs the
    // scanner never walks (node_modules, target, .git, dist, ...) cannot. Without
    // this filter a build churning under Documents re-triggered a full walk of
    // all three folders every ~1.5 s (measured: up to ~70% of a core at "idle").
    let relevant = move |p: &std::path::Path| match roots.iter().find(|r| p.starts_with(r)) {
        Some(root) => !dex_scanner::is_ignored_under(root, p),
        None => true,
    };
    let mut watcher = match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if event.need_rescan() {
                let _ = tx.send(None);
                return;
            }
            if matches!(
                event.kind,
                notify::EventKind::Create(_)
                    | notify::EventKind::Modify(_)
                    | notify::EventKind::Remove(_)
            ) {
                // A folder's own data/metadata "modify" just echoes changes to its
                // children (which arrive as their own events); only a folder being
                // created, removed or renamed needs the full sync it would trigger.
                let echo = matches!(event.kind, notify::EventKind::Modify(k) if !matches!(k, notify::event::ModifyKind::Name(_)));
                let paths: Vec<_> = event
                    .paths
                    .into_iter()
                    .filter(|p| relevant(p) && !(echo && p.is_dir()))
                    .collect();
                if !paths.is_empty() {
                    let _ = tx.send(Some(paths));
                }
            }
        }
    }) {
        Ok(w) => w,
        Err(_) => return,
    };
    for dir in &dirs {
        let _ = watcher.watch(dir.as_path(), notify::RecursiveMode::Recursive);
    }
    // Normal edits are applied per path (no walk). A FULL sync walks all three
    // folders — and with an empty in-memory snapshot (every launch) it rebuilds
    // the whole index, ~30+ CPU-seconds measured — so it is reserved for
    // directory-level changes/overflow and spaced at least MIN_FULL_GAP apart.
    const MIN_FULL_GAP: std::time::Duration = std::time::Duration::from_secs(30);
    const MAX_BATCH: usize = 200;
    crate::util::spawn_named("main", move || {
        let _keep_alive = watcher; // own the watcher so it stays active
        let mut last_full: Option<std::time::Instant> = None;
        let add = |work: &mut IndexWork, msg: Option<Vec<std::path::PathBuf>>| match (msg, &mut *work) {
            (Some(paths), IndexWork::Paths(set)) => {
                set.extend(paths);
                if set.len() > MAX_BATCH {
                    *work = IndexWork::Full;
                }
            }
            (None, _) => *work = IndexWork::Full,
            (Some(_), IndexWork::Full) => {}
        };
        loop {
            // Block until the first change in a quiet period.
            let first = match rx.recv() {
                Ok(m) => m,
                Err(_) => break,
            };
            let mut work = IndexWork::Paths(Default::default());
            add(&mut work, first);
            // Coalesce the burst: drain until ~1.5s of quiet.
            loop {
                match rx.recv_timeout(std::time::Duration::from_millis(1500)) {
                    Ok(m) => add(&mut work, m),
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => break,
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
            let full = match &work {
                IndexWork::Paths(set) => !index_apply_paths(&app, set),
                IndexWork::Full => true,
            };
            if full {
                if let Some(wait) = last_full.and_then(|t| MIN_FULL_GAP.checked_sub(t.elapsed())) {
                    std::thread::sleep(wait);
                    while rx.try_recv().is_ok() {} // the full sync covers these too
                }
                let _ = index_sync(&app);
                last_full = Some(std::time::Instant::now());
            }
        }
    });
}

/// Native Vault dispatch (GOAL-6B) — encrypted password manager + TOTP. State is
/// a Tauri-managed `Mutex<VaultManager>`; the master key lives only in memory
/// while unlocked. Handles every `vault:*` channel except `vault:copyToClipboard`
/// (clipboard, handled earlier).
fn vault_dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let val = |i: usize| args.get(i).cloned().unwrap_or(Value::Null);

    let state = app.state::<std::sync::Mutex<dex_vault::VaultManager>>();
    let mut vault = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false, "error": "vault busy" }),
    };

    let res = |r: Result<(), String>| match r {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    };
    let resb = |r: Result<bool, String>| match r {
        Ok(b) => json!(b),
        Err(e) => json!({ "success": false, "error": e }),
    };
    let resv = |r: Result<Value, String>| match r {
        Ok(v) => v,
        Err(e) => json!({ "success": false, "error": e }),
    };

    match channel {
        "vault:getState" => vault.state(),
        "vault:exists" => json!(vault.exists()),
        "vault:create" => res(vault.create(&s(0))),
        "vault:unlock" => res(vault.unlock(&s(0))),
        "vault:lock" => {
            vault.lock();
            Value::Null
        }
        "vault:getCredentials" => vault.credentials(),
        "vault:getCredential" => vault.credential(&s(0)),
        "vault:addCredential" => resv(vault.add_credential(val(0))),
        "vault:updateCredential" => resb(vault.update_credential(&s(0), &val(1))),
        "vault:deleteCredential" => resb(vault.delete_credential(&s(0))),
        "vault:searchCredentials" => vault.search_credentials(&s(0)),
        "vault:getAuthenticators" => vault.authenticators(),
        "vault:addAuthenticator" => resv(vault.add_authenticator(val(0))),
        "vault:updateAuthenticator" => resb(vault.update_authenticator(&s(0), &val(1))),
        "vault:deleteAuthenticator" => resb(vault.delete_authenticator(&s(0))),
        "vault:generateTOTP" => vault.generate_totp(&s(0), now),
        "vault:generateTOTPFromSecret" => {
            let opts = val(1);
            let digits = opts.get("digits").and_then(|x| x.as_u64()).unwrap_or(6) as u32;
            let period = opts.get("period").and_then(|x| x.as_u64()).unwrap_or(30);
            match dex_vault::totp::totp(&s(0), now, digits, period) {
                Some(code) => {
                    json!({ "code": code, "remaining": dex_vault::totp::seconds_remaining(now, period) })
                }
                None => Value::Null,
            }
        }
        "vault:parseOTPUri" => match dex_vault::totp::parse_otpauth(&s(0)) {
            Some(u) => json!({
                "label": u.label, "secret": u.secret, "issuer": u.issuer,
                "digits": u.digits, "period": u.period,
            }),
            None => Value::Null,
        },
        "vault:getSettings" => vault.settings(),
        "vault:updateSettings" => resb(vault.update_settings(&val(0))),
        "vault:generatePassword" => {
            let o = val(0);
            let opts = dex_vault::password::GenOptions {
                length: o.get("length").and_then(|x| x.as_u64()).unwrap_or(20) as usize,
                lowercase: o.get("lowercase").and_then(|x| x.as_bool()).unwrap_or(true),
                uppercase: o.get("uppercase").and_then(|x| x.as_bool()).unwrap_or(true),
                numbers: o.get("numbers").and_then(|x| x.as_bool()).unwrap_or(true),
                symbols: o.get("symbols").and_then(|x| x.as_bool()).unwrap_or(true),
            };
            json!(dex_vault::password::generate(&opts))
        }
        "vault:assessPasswordStrength" => {
            let (score, label, suggestions) = dex_vault::password::assess_strength(&s(0));
            json!({ "score": score, "label": label, "suggestions": suggestions })
        }
        "vault:auditPasswords" => vault_audit(&vault),
        "vault:exportVault" => match vault.export(&s(0)) {
            Ok(blob) => json!(blob),
            Err(_) => Value::Null,
        },
        "vault:importVault" => resb(vault.import(&s(0), &s(1))),
        "vault:changeMasterPassword" => resb(vault.change_master_password(&s(0), &s(1))),
        _ => Value::Null,
    }
}

/// Audit stored credential passwords for weakness + reuse.
fn vault_audit(vault: &dex_vault::VaultManager) -> Value {
    let arr = vault.credentials().as_array().cloned().unwrap_or_default();
    let mut weak = 0usize;
    let mut seen: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for c in &arr {
        if let Some(pw) = c.get("password").and_then(|v| v.as_str()) {
            let (score, _, _) = dex_vault::password::assess_strength(pw);
            if score < 2 {
                weak += 1;
            }
            *seen.entry(pw.to_string()).or_insert(0) += 1;
        }
    }
    let reused = seen.values().filter(|&&n| n > 1).count();
    json!({ "total": arr.len(), "weak": weak, "reused": reused })
}

/// Security permissions store dispatch — locks the session-scoped managed state
/// (the portable core of the Electron SecurityController).
fn security_dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let state = app.state::<std::sync::Mutex<security::SecurityState>>();
    let mut guard = match state.lock() {
        Ok(g) => g,
        Err(_) => return Value::Null,
    };
    security::dispatch(&mut guard, channel, args)
}

/// Shared-database dispatch — routes the SQLite-backed subsystems (which all
/// share `dex.db`) to their handlers. Locks the one connection; degrades to
/// `null` when SQLite is unavailable (no persistence), mirroring Electron.
/// `system:killProcessTree` — terminate a pid AND all of its descendants (sysinfo
/// parent links, leaves-first). Restored after a git-checkout revert.
fn system_kill_tree(pid: u32) -> Value {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_processes();
    let root = sysinfo::Pid::from_u32(pid);
    let mut to_kill: Vec<sysinfo::Pid> = vec![root];
    let mut i = 0;
    while i < to_kill.len() {
        let parent = to_kill[i];
        for (cpid, proc_) in sys.processes() {
            if proc_.parent() == Some(parent) && !to_kill.contains(cpid) {
                to_kill.push(*cpid);
            }
        }
        i += 1;
    }
    let mut killed = 0;
    for p in to_kill.iter().rev() {
        if let Some(proc_) = sys.process(*p) {
            if proc_.kill() { killed += 1; }
        }
    }
    json!({ "success": true, "message": format!("Terminated {} process(es)", killed) })
}

fn db_dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let state = app.state::<db::DbState>();
    let guard = match state.lock() {
        Ok(g) => g,
        Err(_) => return Value::Null,
    };
    let conn = match guard.as_ref() {
        Some(c) => c,
        None => return Value::Null,
    };
    // Each SQLite-backed subsystem owns one channel prefix; route by prefix to
    // the module that ensured the matching tables in setup().
    if channel.starts_with("activity-feed:") {
        return activity_feed::dispatch(conn, channel, args);
    }
    if channel.starts_with("changelog:") {
        return changelog::dispatch(conn, channel, args);
    }
    if channel.starts_with("color-labels:") {
        return color_labels::dispatch(conn, channel, args);
    }
    if channel.starts_with("dashboard:") {
        return dashboard::dispatch(conn, channel, args);
    }
    if channel.starts_with("goal-system:") {
        return goal_system::dispatch(conn, channel, args);
    }
    if channel.starts_with("help:") {
        return help_system::dispatch(conn, channel, args);
    }
    if channel.starts_with("journal:") {
        return journal::dispatch(conn, channel, args);
    }
    if channel.starts_with("layout:") {
        return layout::dispatch(conn, channel, args);
    }
    if channel.starts_with("licensing:") {
        return licensing::dispatch(conn, channel, args);
    }
    if channel.starts_with("read-later:") {
        return read_later::dispatch(conn, channel, args);
    }
    if channel.starts_with("recycle-bin:") {
        return recycle_bin::dispatch(conn, channel, args);
    }
    if channel.starts_with("workflows:") {
        return workflows::dispatch(conn, channel, args);
    }
    if channel.starts_with("time-tracking:") {
        return time_tracking::dispatch(conn, channel, args);
    }
    if channel.starts_with("word-count:") {
        return word_count::dispatch(conn, channel, args);
    }
    if channel.starts_with("content-expiry:") {
        return content_expiry::dispatch(conn, channel, args);
    }
    if channel.starts_with("daily-note:") {
        return daily_note::dispatch(conn, channel, args);
    }
    if channel.starts_with("feedback:") {
        return feedback_collector::dispatch(conn, channel, args);
    }
    if channel.starts_with("relationship-graph:") {
        return relationship_graph::dispatch(conn, channel, args);
    }
    if channel.starts_with("reminder:") {
        return reminder::dispatch(conn, channel, args);
    }
    if channel.starts_with("scratchpad:") {
        return scratchpad::dispatch(conn, channel, args);
    }
    if channel.starts_with("search-history:") {
        return search_history::dispatch(conn, channel, args);
    }
    if channel.starts_with("smart-grouping:") {
        return smart_grouping::dispatch(conn, channel, args);
    }
    if channel.starts_with("smart-rename:") {
        return smart_rename::dispatch(conn, channel, args);
    }
    if channel.starts_with("snapshot-comparison:") {
        return snapshot_comparison::dispatch(conn, channel, args);
    }
    if channel.starts_with("stats-dashboard:") {
        return statistics_dashboard::dispatch(conn, channel, args);
    }
    if channel.starts_with("version-history:") {
        return version_history::dispatch(conn, channel, args);
    }
    if channel.starts_with("bulk-metadata:") {
        return bulk_metadata::dispatch(conn, channel, args);
    }
    if channel.starts_with("daily-briefing:") {
        return daily_briefing::dispatch(conn, channel, args);
    }
    if channel.starts_with("dependencies:") {
        return dependency::dispatch(conn, channel, args);
    }
    if channel.starts_with("duplication-detector:") {
        return duplication_detector::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-archiver:") {
        // The archiver also touches the filesystem: `.dex-archive` files live
        // under app_data_dir/archive (the Tauri analog of Electron userData).
        let archive_dir = app
            .dex_data_dir()
            .unwrap_or_default()
            .join("archive");
        return project_archiver::dispatch(conn, &archive_dir, channel, args);
    }
    if channel.starts_with("project-comparison:") {
        return project_comparison::dispatch(conn, channel, args);
    }
    if channel.starts_with("export-bundle:") {
        return project_export_bundle::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-health:") {
        return project_health::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-linker:") {
        return project_linker::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-lock:") {
        return project_lock::dispatch(conn, channel, args);
    }
    if channel.starts_with("project-timeline:") {
        return project_timeline::dispatch(conn, channel, args);
    }
    if channel.starts_with("voice-memo:") {
        // Voice memos write/read `.opus` files under app_data_dir/voice-memos
        // (the Tauri analog of Electron userData) and probe for whisper.wasm.
        let data_dir = app.dex_data_dir().unwrap_or_default();
        return voice_memo::dispatch(conn, &data_dir, channel, args);
    }
    if channel.starts_with("dexnotes:") {
        return notes::dispatch(conn, channel, args);
    }
    if channel.starts_with("nl-task:") {
        return nl_task::dispatch(conn, channel, args);
    }
    if channel.starts_with("theme-schedule:") {
        return theme_schedule::dispatch(conn, channel, args);
    }
    if channel.starts_with("session-replay:") {
        return session_replay::dispatch(conn, channel, args);
    }
    if channel.starts_with("media-library:") {
        return shared_media_library::dispatch(conn, channel, args);
    }
    if channel.starts_with("vinx-presentation:") {
        return vinx_presentation::dispatch(conn, channel, args);
    }
    if channel.starts_with("i18n:") {
        return localization::dispatch(conn, channel, args);
    }
    if channel.starts_with("keyboard-nav:") {
        return keyboard_navigation::dispatch(conn, channel, args);
    }
    if channel.starts_with("notification-center:") {
        return unified_notification_hub::dispatch(conn, channel, args);
    }
    if channel.starts_with("localization:") {
        return localization_engine::dispatch(conn, channel, args);
    }
    if channel.starts_with("global-search:") {
        return global_content_search::dispatch(conn, channel, args);
    }
    if channel.starts_with("fts:") {
        return full_text_index::dispatch(conn, channel, args);
    }
    // multiwindow:* is handled natively at the top level (needs the AppHandle to
    // create real OS windows); it never reaches db_dispatch. ensure_schema below
    // still creates the detached_windows table for dex.db schema parity.
    if channel.starts_with("multimonitor:") {
        return multi_monitor::dispatch(conn, channel, args);
    }
    if channel.starts_with("migration:") {
        return migration::dispatch(conn, channel, args);
    }
    if channel.starts_with("link-preview:") {
        return link_preview::dispatch(conn, channel, args);
    }
    if channel.starts_with("live-collab:") {
        return live_collaboration::dispatch(conn, channel, args);
    }
    if channel.starts_with("file-watcher:") {
        return file_watcher::dispatch(conn, channel, args);
    }
    if channel.starts_with("backup:") {
        // Metadata/settings only — create/verify/restore are explicit
        // native_ops arms in dex_ipc (they manage the live connection).
        return backup_restore::dispatch(conn, channel, args);
    }
    if channel.starts_with("uki-chat:") {
        return uki_chat::dispatch(conn, channel, args);
    }
    Value::Null
}

/// Notification Center dispatch (GOAL-6A) — every `notifications:*` channel,
/// backed by a Tauri-managed `Mutex<NotificationStore>`. Mirrors the Electron
/// NotificationCenter return shapes exactly (see src/main/core/NotificationCenter.ts).
fn notifications_dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let state = app.state::<std::sync::Mutex<notifications::NotificationStore>>();
    let mut store = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false, "error": "notifications busy" }),
    };
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let arg = |i: usize| args.get(i).cloned().unwrap_or(Value::Null);

    match channel {
        "notifications:create" => store.create(&arg(0)),
        "notifications:createProgress" => {
            let d = arg(0);
            store.create_progress(
                d.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                d.get("message").and_then(|v| v.as_str()).unwrap_or(""),
                d.get("category").and_then(|v| v.as_str()).unwrap_or("general"),
                d.get("total").and_then(|v| v.as_i64()).unwrap_or(0),
            )
        }
        "notifications:updateProgress" => {
            let current = args.get(1).and_then(|v| v.as_i64()).unwrap_or(0);
            let message = args.get(2).and_then(|v| v.as_str()).map(String::from);
            store.update_progress(&s(0), current, message)
        }
        "notifications:list" => store.list_json(&arg(0)),
        "notifications:get" => store.get(&s(0)),
        "notifications:getUnread" => store.get_unread(),
        "notifications:getUnreadCount" => json!(store.get_unread_count()),
        "notifications:getGrouped" => store.get_grouped(&arg(0)),
        "notifications:search" => store.search(&s(0)),
        "notifications:markRead" => store.mark_read(&s(0)),
        "notifications:markAllRead" => store.mark_all_read(),
        "notifications:dismiss" => store.dismiss(&s(0)),
        "notifications:dismissAll" => store.dismiss_all(),
        "notifications:clear" => store.clear(),
        "notifications:clearCategory" => store.clear_category(&s(0)),
        "notifications:executeAction" => store.execute_action(&s(0), &s(1)),
        "notifications:stats" => store.get_stats(),
        "notifications:config" => store.config_json(),
        "notifications:setConfig" => store.set_config(&arg(0)),
        _ => Value::Null,
    }
}

/// Generic IPC dispatcher — the Electron->Tauri migration bridge. The renderer's
/// `window.dex` / `window.electron` route every `<namespace>:<method>` channel
/// here (see src/renderer/services/platform/tauriCompat.ts). Channels are ported
/// one subsystem at a time; anything not yet ported returns `null`, so the UI
/// degrades gracefully (same as the browser preview) instead of crashing.
#[tauri::command]
async fn dex_ipc(app: tauri::AppHandle, window: tauri::Window, channel: String, args: Value) -> Value {
    // Run OFF the UI thread. A synchronous `#[tauri::command]` executes on the main
    // thread, so the renderer's boot-time flood of IPC calls — SQLite, filesystem,
    // sysinfo, all blocking — froze the webview ("DEX not responding"). Hopping onto
    // the blocking thread pool keeps the event loop free; calls still serialize on
    // the shared DB mutex, but never on the UI thread.
    //
    // Panic guard: a single ported module that panics must NOT crash the app — it
    // degrades to null (same as an unported channel). Recovered panics are logged.
    let ch_for_log = channel.clone();
    tauri::async_runtime::spawn_blocking(move || {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            dex_ipc_impl(app, window, channel, args)
        })) {
            Ok(v) => v,
            Err(_) => {
                eprintln!("[dex_ipc] recovered from panic in channel: {ch_for_log}");
                Value::Null
            }
        }
    })
    .await
    .unwrap_or(Value::Null)
}

fn dex_ipc_impl(app: tauri::AppHandle, window: tauri::Window, channel: String, args: Value) -> Value {
    // Positional arg helpers (the renderer sends method args as a JSON array).
    let arg_str = |i: usize| args.get(i).and_then(|v| v.as_str()).map(|s| s.to_string());
    let arg_u64 = |i: usize| args.get(i).and_then(|v| v.as_u64());

    // === Migration wiring (modules; revert-proof) ===
    if channel.starts_with("git:") { return git::dispatch(&channel, &args); }
    if channel.starts_with("env:") { return env_manager::dispatch(&app, &channel, &args); }
    if channel.starts_with("ssh:") { return ssh::dispatch(&app, &channel, &args); }
    if channel.starts_with("analytics:") { return analytics::dispatch(&app, &channel, &args); }
    if channel.starts_with("mode:") { return modes::dispatch(&app, &channel, &args); }
    if channel.starts_with("browserView:") { return browser_view::dispatch(&app, &window, &channel, &args); }
    if channel.starts_with("activity:") { return activity_feed::dispatch_kv(&app, &channel, &args); }
    if channel.starts_with("duplicates:") { return duplicates_resolver::dispatch(&app, &channel, &args); }
    if channel.starts_with("focus:") { return focus_sessions::dispatch(&app, &channel, &args); }
    if channel.starts_with("memory:") { return memory_tracking::dispatch(&app, &channel, &args); }
    if channel.starts_with("operations:") { return operations_log::dispatch(&app, &channel, &args); }
    if channel.starts_with("perf:") { return performance_tier::dispatch(&app, &channel, &args); }
    if channel.starts_with("reader:") { return text_summarizer::dispatch(&app, &channel, &args); }
    if channel.starts_with("resource:") { return resource_monitoring::dispatch(&app, &channel, &args); }
    if channel.starts_with("rule:") { return rule_engine::dispatch(&app, &channel, &args); }
    if channel.starts_with("sessions:") { return sessions_manager::dispatch(&app, &channel, &args); }
    if channel.starts_with("splitview:") { return splitview_presets::dispatch(&app, &channel, &args); }
    if channel.starts_with("split:") { return split_view::dispatch(&app, &channel, &args); }
    if channel.starts_with("stability:") { return stability_check::dispatch(&app, &channel, &args); }
    if channel.starts_with("startup:") { return startup_timeline::dispatch(&app, &channel, &args); }
    if channel.starts_with("systemHealth:") { return system_health::dispatch(&app, &channel, &args); }
    if channel.starts_with("tags:") { return tag_manager::dispatch(&app, &channel, &args); }
    if channel.starts_with("user:") { return user_profile::dispatch(&app, &channel, &args); }
    if channel.starts_with("voiceNotes:") { return voice_notes::dispatch(&app, &channel, &args); }
    if channel.starts_with("accessibility:") { return accessibility_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("adaptive:") { return adaptive_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("advisory:") { return advisor_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("api:") { return api_server::dispatch(&app, &channel, &args); }
    if channel.starts_with("archive:") { return archive_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("autofill:") { return autofill_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("background-tasks:") { return background_tasks::dispatch(&app, &channel, &args); }
    if channel.starts_with("batch:") { return batch_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("battery:") { return battery_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("behavior:") { return behavior_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("browser:") { return browser_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("budget:") { return budget_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("cli:") { return cli_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("cloudsync:") { return cloudsync_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("code:") { return code_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("connectors:") { return connectors_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("containment:") { return containment_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("sandbox:") { return sandbox_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("gpu-priority:") { return gpu_priority::dispatch(&app, &channel, &args); }
    if channel.starts_with("context:") { return context_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("controls:") { return controls_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("corepc:") { return corepc_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("crash-reporter:") { return crash_reporter::dispatch(&app, &channel, &args); }
    if channel.starts_with("creator:") { return creator_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("db-perf:") { return db_perf_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("deeplink:") { return deeplink_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("devplatform:") { return devplatform_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("documents:") { return documents_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("dtp:") { return dtp_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("editor:") { return editor_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("embedding:") { return embedding_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("encryption:") { return encryption_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("enforce:") { return enforce_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("engine:") { return engine_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("export:") { return export_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("extensions:") { return extensions_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("failure:") { return failure_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("features:") { return features_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("folderrules:") { return folderrules_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("gallery:") { return gallery_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("gpu:") { return gpu_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("guardrails:") { return guardrails_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("hardware:") { return hardware_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("healing:") { return healing_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("history:") { return history_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("hotkeys:") { return hotkey_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("http-transfer:") { return http_transfer_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("idle:") { return idle_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("import:") { return import_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("input:") { return input_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("ipc-perf:") { return ipc_perf::dispatch(&app, &channel, &args); }
    if channel.starts_with("keys:") { return keys_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("largefile:") { return largefile_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("launcher:") { return launcher_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("longevity:") { return longevity_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("maintenance:") { return maintenance_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("mediaorg:") { return mediaorg_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("mental:") { return mental_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("motion:") { return motion_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("multiuser:") { return multiuser_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("nextgen:") { return nextgen_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("nexus:") { return nexus_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("observability:") { return observability_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("optimistic:") { return optimistic_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("performance:") { return performance_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("permission:") { return permission_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("phase1:") { return phase1_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("pipeline:") { return pipeline_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("plugin-gate:") { return plugin_gate::dispatch(&app, &channel, &args); }
    if channel.starts_with("plugins:") { return plugins_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("prerender:") { return prerender_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("privacy:") { return privacy_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("pty:") { return terminal::dispatch(&app, &channel, &args); }
    if channel.starts_with("quickactions:") { return quickactions_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("recovery:") { return recovery_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("reliability:") { return reliability_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("render:") { return render_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("renderer-health:") { return renderer_health::dispatch(&app, &channel, &args); }
    if channel.starts_with("resource-governor:") { return resource_governor::dispatch(&app, &channel, &args); }
    if channel.starts_with("scheduler:") { return scheduler_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("scripting:") { return scripting_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("selftest:") { return selftest_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("session:") { return session_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("shutdown-sequencer:") { return shutdown_sequencer::dispatch(&app, &channel, &args); }
    if channel.starts_with("snapshot:") { return snapshot_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("softero:") { return softero_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("startup-sequencer:") { return startup_sequencer::dispatch(&app, &channel, &args); }
    if channel.starts_with("state:") { return state_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("state-sync:") { return state_sync::dispatch(&app, &channel, &args); }
    if channel.starts_with("sync:") { return sync_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("task-queue:") { return task_queue::dispatch(&app, &channel, &args); }
    if channel.starts_with("thermal:") { return thermal_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("transfer:") { return transfer_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("uki:") { return uki_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("undo:") { return undo_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("uninstall:") { return uninstall_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("update-service:") { return update_service::dispatch(&app, &channel, &args); }
    if channel.starts_with("video:") { return video_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("vinx:") { return vinx_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("visual:") { return visual_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("voice:") { return voice_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("wake:") { return wake_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("watchdog:") { return watchdog_ctl::dispatch(&app, &channel, &args); }
    if channel.starts_with("xenon:") { return xenon_ctl::dispatch(&app, &channel, &args); }
    match channel.as_str() {
        "app:getVersion" => json!(env!("CARGO_PKG_VERSION")),
        // === Migration wiring (arms) ===
        "fs:readdir" => fs_ops::readdir(&arg_str(0).unwrap_or_default()),
        "fs:readFileHead" => fs_ops::read_file_head(&arg_str(0).unwrap_or_default(), arg_u64(1).unwrap_or(0)),
        "media:getMediaFiles" => { let home = app.path().home_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")); fs_ops::get_media_files(&arg_str(0).unwrap_or_default(), &home) }
        ch @ ("watch:start" | "watch:stop") => watch::dispatch(&app, ch, &args),
        "system:killProcessTree" => system_kill_tree(arg_u64(0).unwrap_or(0) as u32),
        ch @ ("projects:getAll" | "projects:getActive" | "projects:create" | "projects:update" | "projects:delete" | "projects:setActive") => projects::dispatch(&app, ch, &args),
        ch @ ("power:getProfile" | "power:getState" | "power:setProfile" | "power:quickBoost" | "power:getResourceHogs" | "power:freeMemory" | "power:getSuggestedCleanup" | "power:setCpuLimit" | "power:setGpuLimit" | "power:setFanCurve") => power::dispatch(&app, ch, &args),
        ch @ ("logs:get" | "logs:clear") => log_manager::dispatch(&app, ch, &args),
        ch @ ("notes:start-server" | "notes:stop-server") => notes_metadata::dispatch(&app, ch, &args),
        ch @ ("permissions:getAll" | "permissions:grant" | "permissions:revoke") => permissions_manager::dispatch(&app, ch, &args),
        ch @ ("patterns:recordAppOpen" | "patterns:recordAppClose" | "patterns:recordFileOpen" | "patterns:recordToolUse" | "patterns:recordAction" | "patterns:recordToolCombo" | "patterns:getSuggestions" | "patterns:getFrequent" | "patterns:getRecent" | "patterns:getToolCombos" | "patterns:getDayPatterns" | "patterns:getHourlyPatterns" | "patterns:getPreferredApp" | "patterns:getSessionStats" | "patterns:getAllPatterns" | "patterns:cleanup") => pattern_tracking::dispatch(&app, ch, &args),
        ch @ ("contract:getConfig" | "contract:getGuarantees" | "contract:getViolations") => contract_ctl::dispatch(&app, ch, &args),
        ch @ ("device:getThisDevice" | "device:getAll") => device_ctl::dispatch(&app, ch, &args),
        ch @ ("games:list" | "games:playtime") => games::dispatch(&app, ch, &args),
        ch @ ("governance:getPolicies" | "governance:getPolicy") => governance_ctl::dispatch(&app, ch, &args),
        ch @ ("intelligence:getState" | "intelligence:getConfig") => intelligence_ctl::dispatch(&app, ch, &args),
        ch @ "learning:getModels" => learning_ctl::dispatch(&app, ch, &args),
        ch @ ("monitor:getBaseline" | "monitor:getDigests") => monitor_ctl::dispatch(&app, ch, &args),
        // Full network:* surface (summary/getStatus + config/setConfig/setMode/
        // setOffline/connections/history/usage/policies). Was a 2-channel arm, so
        // network:config (which load_config answers with a real default object)
        // silently degraded; prefix-route the tier. networkHygiene:/connection:
        // are separate prefixes and unaffected.
        ch if ch.starts_with("network:") => network_ctl::dispatch(&app, ch, &args),
        ch @ "security:getPolicy" => security_ctl::dispatch(&app, ch, &args),
        ch @ ("store:list" | "store:installed") => store_ctl::dispatch(&app, ch, &args),
        ch @ ("tags:list" | "tags:get") => tagging_ctl::dispatch(&app, ch, &args),
        ch @ ("tasks:list" | "tasks:get") => tasks_ctl::dispatch(&app, ch, &args),
        ch @ ("timeline:getEvents" | "timeline:getEvent") => timeline_ctl::dispatch(&app, ch, &args),
        ch @ "trust:list" => trust_ctl::dispatch(&app, ch, &args),
        ch @ "update:getStatus" => update_ctl::dispatch(&app, ch, &args),
        // Full updates:* surface (getInfo/getPreferences + canDowngrade, install
        // history, changelog, skip/remindLater, pruneCache, ...). Was an explicit
        // 3-channel arm, so canDowngrade et al. silently degraded; prefix-route
        // the whole tier (updates_ctl returns Null only for the genuinely
        // updater-runtime-bound channels). `update:getConfig` (singular) stays.
        ch if ch.starts_with("updates:") || ch == "update:getConfig" => updates_ctl::dispatch(&app, ch, &args),
        ch @ ("workflow:getAll" | "workflow:get") => workflow_ctl::dispatch(&app, ch, &args),
        "app:ping" => json!("pong"),

        // --- Files ----------------------------------------------------------
        "files:list" => files_list(&app, &arg_str(0).unwrap_or_else(|| "home".into())),
        "files:getScopes" | "fileSearch:getScopes" => get_scopes(&app),
        "files:isInScope" => json!(true),
        // Real bounded search/recent (Wave 2). files.recent/files.search pass an
        // options object; search.query passes a positional query string.
        "files:recent" | "fileIntel:getRecentFiles" => {
            let a0 = args.get(0).cloned().unwrap_or(Value::Null);
            let limit = a0
                .get("limit")
                .and_then(|v| v.as_u64())
                .or_else(|| a0.as_u64())
                .unwrap_or(20) as usize;
            files_recent(&app, limit)
        }
        "files:search" | "fileSearch:search" | "search:query" => {
            let a0 = args.get(0).cloned().unwrap_or(Value::Null);
            let query = a0
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| a0.get("query").and_then(|v| v.as_str()).map(|s| s.to_string()))
                .unwrap_or_default();
            let location = a0.get("location").and_then(|v| v.as_str()).map(|s| s.to_string());
            // Prefer the native Tantivy index; fall back to the bounded walk
            // until the index has been built (search:rebuild).
            index_search(&app, &query, 200).unwrap_or_else(|| files_search(&app, &query, location))
        }
        "files:rename" => files_rename(&arg_str(0).unwrap_or_default(), &arg_str(1).unwrap_or_default()),
        "files:move" => files_move(&arg_str(0).unwrap_or_default(), &arg_str(1).unwrap_or_default()),
        "files:copy" => files_copy(&arg_str(0).unwrap_or_default(), &arg_str(1).unwrap_or_default()),
        "files:delete" => files_delete(&arg_str(0).unwrap_or_default()),
        "files:mkdir" => files_mkdir(&arg_str(0).unwrap_or_default()),
        "files:organizeByType" => files_organize_by_type(&arg_str(0).unwrap_or_default()),

        // --- System / power -------------------------------------------------
        "system:getStatus" => system_status(),
        "power:getStats" => system_status(),
        "system:getProcesses" => system_processes(),
        "system:killProcess" | "power:closeProcess" => system_kill(arg_u64(0).unwrap_or(0) as u32),
        "system:getLaunchAtLogin" => launch_at_login_get(),
        "system:setLaunchAtLogin" => launch_at_login_set(args.get(0).and_then(|v| v.as_bool()).unwrap_or(false)),

        // --- Shell ----------------------------------------------------------
        "shell:openExternal" => shell_open_external(&arg_str(0).unwrap_or_default()),
        "shell:openPath" => shell_open_path(&app, &arg_str(0).unwrap_or_default()),

        // --- OS theme accent ------------------------------------------------
        // Read the live OS accent color (#RRGGBB) so the UI can match the system.
        "theme:getSystemAccentColor" => native_ops::system_accent_color(),

        // --- Native dialogs (Tauri dialog plugin) --------------------------
        // Electron dialog.showOpenDialog parity: { canceled, filePaths }.
        "dialog:showOpenDialog" | "files:openDialog" => native_ops::show_open_dialog(&app, &args),

        // --- Filesystem command layer (need app paths/dialog + the db) -----
        // (project-archiver:* and media-library:* run their fs work inside
        // their db modules, which receive the app data dir via db_dispatch.)
        "changelog:export" => native_ops::changelog_export(&app, &args),
        // Native picker -> { filePath } | null. Must sit above the db-backed
        // `dexnotes:` prefix route below, which has no picker arm (these used to
        // fall through to it and return null, so Notes' Attach/Import did nothing).
        "dexnotes:pick-attachment-file" | "dexnotes:pick-import-file" => native_ops::note_pick_file(&app),
        "dexnotes:addAttachment" => native_ops::note_add_attachment(&app, &args),
        "dexnotes:removeAttachment" => native_ops::note_remove_attachment(&app, &args),
        "dexnotes:openAttachment" => native_ops::note_open_attachment(&app, &args),
        "backup:create" => native_ops::backup_create(&app, &args),
        "backup:verify" => native_ops::backup_verify(&app, &args),
        "backup:restore" => native_ops::backup_restore(&app, &args),
        "export-bundle:create" => cmd_export_bundle::create(&app, &args),
        "link-preview:fetch" => cmd_link_preview::fetch(&app, &args),
        ch @ ("scratchpad:updateContent" | "scratchpad:saveNow") => {
            cmd_scratchpad::dispatch(&app, ch, &args)
        }
        ch @ ("file-watcher:addFolder" | "file-watcher:importFile" | "file-watcher:removeFolder") => {
            cmd_file_watcher::dispatch(&app, ch, &args)
        }
        ch @ ("multimonitor:get-displays"
        | "multimonitor:get-current-display"
        | "multimonitor:get-scale-factor") => cmd_window_monitor::dispatch(&window, ch, &args),

        // --- Notification center: DB insert + OS toast ---------------------
        // The DB record (read by the in-app notification center) is written by
        // the hub module; additionally raise an OS notification, matching the
        // Electron `send` which also fired a native Notification. Skip the toast
        // when the hub returns -1 (the app's notifications are disabled).
        "notification-center:send" => {
            let res = db_dispatch(&app, "notification-center:send", &args);
            if let Some(id) = res.as_i64().filter(|n| *n >= 0) {
                if let Some(p) = args.get(0) {
                    let title = p.get("title").and_then(|v| v.as_str()).unwrap_or("");
                    let body = p.get("body").and_then(|v| v.as_str()).unwrap_or("");
                    // `osToast: false` = the user turned "Allow Notifications" off:
                    // keep the record in the center, skip the Windows toast.
                    let os_toast = p.get("osToast").and_then(|v| v.as_bool()).unwrap_or(true);
                    // `osToastPrivate: true` = DEX is locked. Windows toasts show
                    // above the lock screen, so reveal nothing but the fact.
                    let private = p.get("osToastPrivate").and_then(|v| v.as_bool()).unwrap_or(false);
                    // `osToastSound: true` = Settings > Notifications > Sound is on.
                    let sound = p.get("osToastSound").and_then(|v| v.as_bool()).unwrap_or(false);
                    if os_toast && (!title.is_empty() || !body.is_empty()) {
                        if private {
                            native_ops::notify_with_sound(&app, "DEX", "You have a new notification", sound);
                        } else {
                            native_ops::notify_with_sound(&app, title, body, sound);
                        }
                    }
                }
                // Electron also pushes the inserted record + the unread count
                // (broadcastNewNotification / broadcastUnreadCount).
                let _ = native_ops::with_conn(&app, |conn| {
                    let record = unified_notification_hub::record_by_id(conn, id);
                    if !record.is_null() {
                        native_ops::emit_event(&app, "notification-center:new", &record);
                    }
                    let count = unified_notification_hub::get_unread_count(conn);
                    native_ops::emit_event(&app, "notification-center:unread-count", &count);
                    Value::Null
                });
            }
            res
        }

        // markRead/markAllRead/clearAll/delete change the unread set; Electron
        // broadcasts the new unread count after each (broadcastUnreadCount).
        ch @ ("notification-center:markRead"
        | "notification-center:markAllRead"
        | "notification-center:clearAll"
        | "notification-center:delete") => {
            let res = db_dispatch(&app, ch, &args);
            let _ = native_ops::with_conn(&app, |conn| {
                let count = unified_notification_hub::get_unread_count(conn);
                native_ops::emit_event(&app, "notification-center:unread-count", &count);
                Value::Null
            });
            res
        }

        // --- OS controls (lock only; shutdown/restart/sleep deferred until
        //     tested, to avoid an accidental shutdown during migration) ------
        "os:lockScreen" => os_lock(),

        // --- Batch 1: Clipboard --------------------------------------------
        "clipboard:writeText" | "vault:copyToClipboard" => {
            clipboard_write(&arg_str(0).unwrap_or_default())
        }
        "clipboard:readText" => clipboard_read(),

        // --- Batch 2: Persistent key-value storage -------------------------
        "capability:storage:get" | "storage:get" => kv_get(&app, &arg_str(0).unwrap_or_default()),
        "capability:storage:set" | "storage:set" => {
            kv_set(&app, &arg_str(0).unwrap_or_default(), args.get(1).cloned().unwrap_or(Value::Null))
        }
        "storage:resetKv" => kv_reset(&app),

        // --- Settings (kv-backed; mirrors capabilityLayer.storage) ----------
        // `apply` does power/opacity side effects in Electron that aren't native
        // yet; the durable part (persisting the settings) is what the renderer
        // relies on, so both store under the same key and report success.
        "settings:get" => settings_get(&app),
        "settings:save" | "settings:apply" => {
            kv_set(&app, SETTINGS_KEY, args.get(0).cloned().unwrap_or(Value::Null))
        }

        // --- Theme (kv-backed; mirrors dataStore themeConfig) ---------------
        "theme:getConfig" | "theme:export" => theme_config(&app),
        "theme:getMode" => theme_config(&app)
            .get("mode")
            .cloned()
            .unwrap_or_else(|| json!("dark")),
        "theme:setMode" => theme_set_field(&app, "mode", args.get(0).cloned().unwrap_or(Value::Null)),
        "theme:setAccentColor" => {
            theme_set_field(&app, "accentColor", args.get(0).cloned().unwrap_or(Value::Null))
        }
        "theme:setFontScale" => {
            theme_set_field(&app, "fontScale", args.get(0).cloned().unwrap_or(Value::Null))
        }
        "theme:setReducedMotion" => {
            theme_set_field(&app, "reducedMotion", args.get(0).cloned().unwrap_or(Value::Null))
        }
        "theme:setDensity" => {
            theme_set_field(&app, "density", args.get(0).cloned().unwrap_or(Value::Null))
        }
        "theme:generateCSSVariables" => {
            // Read raw (may be empty) so the fallbacks match the Electron handler.
            let cfg = kv_get(&app, THEME_KEY);
            let accent = cfg
                .get("accentColor")
                .and_then(|v| v.as_str())
                .unwrap_or("#0a84ff");
            let scale = cfg.get("fontScale").and_then(|v| v.as_f64()).unwrap_or(1.0);
            json!(format!("--accent-color: {}; --font-scale: {};", accent, scale))
        }
        "theme:getPresets" => theme_presets(),
        "theme:applyPreset" => theme_apply_preset(&app, &arg_str(0).unwrap_or_default()),
        "theme:import" => {
            let cfg = args.get(0).cloned().unwrap_or(Value::Null);
            if cfg.is_object() {
                kv_set(&app, THEME_KEY, cfg)
            } else {
                json!({ "success": true })
            }
        }
        // --- Batch 3: Reveal in explorer / open file -----------------------
        "fileIntel:revealInExplorer" | "shell:showItemInFolder" => {
            reveal_in_explorer(&arg_str(0).unwrap_or_default())
        }
        "fileIntel:openFile" | "media:openWithSystem" => {
            shell_open_path(&app, &arg_str(0).unwrap_or_default())
        }

        // --- Batch 4: Health / diagnostics ---------------------------------
        "health:check" | "health:getStatus" | "watchdog:health" => {
            json!({ "healthy": true, "shell": "tauri" })
        }
        "diagnostics:getSystemInfo" => system_status(),
        "diagnostics:getWebView2" => webview2::status_json(),
        ch @ ("storage:getUsage" | "storage:clearCaches") => storage_ctl::dispatch(&app, ch),
        ch @ ("secrets:status" | "secrets:list" | "secrets:set" | "secrets:get" | "secrets:delete") => secrets_ctl::dispatch(&app, ch, &args),
        "ollama:request" => ollama_proxy::dispatch(&args),

        // --- Batch 5: App data locations -----------------------------------
        "app:getPath" | "data:getLocations" => app_paths(&app),

        // --- Batch 9: diagnostics / crash stats ----------------------------
        "diagnostics:getPerformance" => system_status(),
        "diagnostics:getLogs" | "crashReporter:getRecent" | "health:getLogs" => json!([]),
        "crashReporter:getStats" => json!({ "total": 0, "recent": [] }),

        // --- Batch 10: connectivity (best-effort) --------------------------
        "connection:isOnline" | "networkHygiene:isOnline" => json!(true),

        // --- Wave B: trash / OS info / disk usage --------------------------
        "files:trash" | "shell:trashItem" | "fileIntel:moveToTrash" => {
            move_to_trash(&arg_str(0).unwrap_or_default())
        }
        "os:getInfo" | "system:getInfo" => os_info(),
        "app:getName" => json!("DEX"),
        "system:getDiskUsage" | "power:getDiskUsage" => disk_usage(),

        // --- Native search index (GOAL-6A, Tantivy) ------------------------
        "search:rebuild" | "fileSearch:reindex" => index_rebuild(&app),
        "search:sync" | "fileSearch:sync" => index_sync(&app),
        "search:getStats" => index_stats(&app),
        "search:upsertDoc" | "search:indexDoc" => search_upsert_doc(
            &app,
            &arg_str(0).unwrap_or_default(),
            &arg_str(1).unwrap_or_else(|| "note".into()),
            &arg_str(2).unwrap_or_default(),
            &arg_str(3).unwrap_or_default(),
            arg_u64(4).unwrap_or(0),
        ),
        "search:removeDoc" | "search:deleteDoc" => {
            search_remove_doc(&app, &arg_str(0).unwrap_or_default())
        }

        // --- Native audio analysis (GOAL-6C) -------------------------------
        "audio:getMetadata" | "audio:getInfo" => audio_metadata(&arg_str(0).unwrap_or_default()),
        "audio:getWaveform" | "audio:getPeaks" | "media:getWaveform" => {
            audio_waveform(&arg_str(0).unwrap_or_default(), arg_u64(1).unwrap_or(256) as usize)
        }
        "audio:analyzeBeats" | "audio:detectTempo" | "media:analyzeBeats" => {
            let opts = args.get(1).cloned().unwrap_or_else(|| json!({}));
            audio_beats(&arg_str(0).unwrap_or_default(), &opts)
        }
        "audio:detectKey" | "audio:analyzeKey" | "media:detectKey" => {
            audio_key(&arg_str(0).unwrap_or_default())
        }
        "audio:analyzeSilence" | "audio:detectSilence" | "media:analyzeSilence" => {
            let opts = args.get(1).cloned().unwrap_or_else(|| json!({}));
            audio_silence(&arg_str(0).unwrap_or_default(), &opts)
        }
        "audio:loudness" | "audio:analyzeLoudness" | "media:loudness" => {
            audio_loudness(&arg_str(0).unwrap_or_default())
        }

        // --- Native file scanner: duplicate detection (GOAL-6A) ------------
        "fileIntel:findDuplicates" => {
            let root = resolve_path(&app, &arg_str(0).unwrap_or_else(|| "home".into()));
            json!({ "success": true, "groups": dex_scanner::find_duplicates(&root, 20000) })
        }
        "fileIntel:groupByType" => {
            let root = resolve_path(&app, &arg_str(0).unwrap_or_else(|| "home".into()));
            json!({ "success": true, "groups": dex_scanner::group_by_type(&root, 20000) })
        }
        "fileIntel:getStatistics" => {
            let root = resolve_path(&app, &arg_str(0).unwrap_or_else(|| "home".into()));
            let groups = dex_scanner::group_by_type(&root, 20000);
            let total: usize = groups.iter().map(|g| g.count).sum();
            json!({ "success": true, "total": total, "byType": groups })
        }

        // --- Native automation engine (GOAL-6C) ----------------------------
        // Definition-based runs execute natively; id-based execute needs a native
        // store (later) and degrades gracefully.
        "automation:run" | "workflow:executeNew" | "workflow:execute" | "automations:execute" => {
            let def = args.get(0).cloned().unwrap_or(Value::Null);
            if def.get("steps").is_some() {
                dex_automation::run(&def, &args.get(1).cloned().unwrap_or_else(|| json!({})))
            } else {
                json!({ "success": false, "error": "automation not found (native store pending)" })
            }
        }

        // --- Window controls -----------------------------------------------
        // Electron's handlers all return { success: true }; mirror that so these
        // (which work) aren't counted as degraded in the bridge telemetry.
        "window:minimize" => {
            let _ = window.minimize();
            json!({ "success": true })
        }
        "window:maximize" => {
            // The renderer treats this as a toggle.
            match window.is_maximized() {
                Ok(true) => {
                    let _ = window.unmaximize();
                }
                _ => {
                    let _ = window.maximize();
                }
            }
            json!({ "success": true })
        }
        // Electron's window:close HIDES to tray. The Tauri shell has no tray yet,
        // so hiding would strand the app with no way to restore it — actually
        // close until the tray subsystem is ported. (Revisit at tray parity.)
        "window:close" => {
            let _ = window.close();
            json!({ "success": true })
        }
        "window:hide" => {
            let _ = window.hide();
            json!({ "success": true })
        }
        // No native title-bar overlay under Tauri (the titlebar is CSS) — accept
        // the toggle as a no-op so the renderer's titlebar logic proceeds.
        "window:setTitleBarOverlay" => json!({ "success": true }),

        // --- SQLite-backed subsystems (shared dex.db) ----------------------
        // Every db-backed subsystem routes through db_dispatch, which locks the
        // one shared connection and forwards by channel prefix to its module.
        ch if ch.starts_with("activity-feed:")
            || ch.starts_with("changelog:")
            || ch.starts_with("color-labels:")
            || ch.starts_with("dashboard:")
            || ch.starts_with("goal-system:")
            || ch.starts_with("help:")
            || ch.starts_with("journal:")
            || ch.starts_with("layout:")
            || ch.starts_with("licensing:")
            || ch.starts_with("read-later:")
            || ch.starts_with("recycle-bin:")
            || ch.starts_with("workflows:")
            || ch.starts_with("time-tracking:")
            || ch.starts_with("word-count:")
            || ch.starts_with("content-expiry:")
            || ch.starts_with("daily-note:")
            || ch.starts_with("feedback:")
            || ch.starts_with("relationship-graph:")
            || ch.starts_with("reminder:")
            || ch.starts_with("scratchpad:")
            || ch.starts_with("search-history:")
            || ch.starts_with("smart-grouping:")
            || ch.starts_with("smart-rename:")
            || ch.starts_with("snapshot-comparison:")
            || ch.starts_with("stats-dashboard:")
            || ch.starts_with("version-history:")
            || ch.starts_with("bulk-metadata:")
            || ch.starts_with("daily-briefing:")
            || ch.starts_with("dependencies:")
            || ch.starts_with("duplication-detector:")
            || ch.starts_with("project-archiver:")
            || ch.starts_with("project-comparison:")
            || ch.starts_with("export-bundle:")
            || ch.starts_with("project-health:")
            || ch.starts_with("project-linker:")
            || ch.starts_with("project-lock:")
            || ch.starts_with("project-timeline:")
            || ch.starts_with("voice-memo:")
            || ch.starts_with("dexnotes:")
            || ch.starts_with("nl-task:")
            || ch.starts_with("theme-schedule:")
            || ch.starts_with("session-replay:")
            || ch.starts_with("media-library:")
            || ch.starts_with("vinx-presentation:")
            || ch.starts_with("i18n:")
            || ch.starts_with("keyboard-nav:")
            || ch.starts_with("notification-center:")
            || ch.starts_with("localization:")
            || ch.starts_with("global-search:")
            || ch.starts_with("fts:")
            || ch.starts_with("multiwindow:")
            || ch.starts_with("multimonitor:")
            || ch.starts_with("migration:")
            || ch.starts_with("link-preview:")
            || ch.starts_with("live-collab:")
            || ch.starts_with("file-watcher:")
            || ch.starts_with("backup:")
            || ch.starts_with("uki-chat:") =>
        {
            db_dispatch(&app, ch, &args)
        }

        // --- Pure native engines (no DB / SQLite gate) ---------------------
        // Rewind reconstruction (core/dex-rewind) and the AI runtime
        // (core/dex-ai-runtime: request build, response/stream parse, and the
        // blocking HTTP transport). Routed at the top level — NOT through
        // db_dispatch, which short-circuits to null when SQLite is unavailable.
        ch if ch.starts_with("rewind:") => rewind::dispatch(ch, &args),
        ch if ch.starts_with("ai-runtime:") => ai_runtime::dispatch(ch, &args),

        // --- Auth: full credential engine (enrol + verify + change + clear +
        // recovery + lockout + session tokens). Secrets are Argon2id-hashed in
        // the shared KV; biometric runs the real OS verifier. Restored from
        // #57, which was lost when main's history was rewritten.
        // `auth:biometricsAvailable` is answered renderer-side. No idle locking.
        ch if ch.starts_with("auth:") => {
            auth::dispatch(&app, ch, &args)
        }

        // --- Multi-window: detach an inner app into a REAL OS window ---------
        // Tauri WebviewWindow creation (the live-window surface Electron had).
        // Routed here, not via db_dispatch, because it needs the AppHandle.
        ch if ch.starts_with("multiwindow:") => multi_window::dispatch_native(&app, ch, &args),

        // --- Terminal / PTY (core/PtyService parity) -----------------------
        // Piped-stdio shell sessions; output streams back as pty:data/pty:exit
        // events. Needs the AppHandle (for emit + managed session state).
        ch if ch.starts_with("pty:") => terminal::dispatch(&app, ch, &args),

        // --- HTTP file transfer (LAN QR/link share) ------------------------
        // Self-contained HTTP server for download/upload over the LAN (the DTP
        // device-to-device protocol is separate). transfer:selectFiles is the
        // shared native multi-file picker.
        ch if ch.starts_with("httpTransfer:") || ch == "transfer:selectFiles" => {
            http_transfer::dispatch(&app, ch, &args)
        }

        // --- Notification Center (GOAL-6A): all notifications:* channels ---
        ch if ch.starts_with("notifications:") => notifications_dispatch(&app, ch, &args),

        // --- Vault (GOAL-6B): all vault:* channels except copyToClipboard --
        ch if ch.starts_with("vault:") => vault_dispatch(&app, ch, &args),

        // --- Security permissions (SecurityController portable core) -------
        ch if ch.starts_with("security:") => security_dispatch(&app, ch, &args),

        // More subsystem handlers land here as the migration proceeds
        // (universal search index, audio, automation, transfer, ...).
        _ => Value::Null,
    }
}

/// Rank the supplied candidate models for a goal + prompt, natively. The
/// renderer (which knows the keystore/registry) builds the candidate set and
/// passes it in; the native core does the ranking math. Mirrors the TS
/// `routeConfiguredModels` so the result matches the Electron path.
#[tauri::command]
fn smart_router_route(
    goal: String,
    user_text: String,
    candidates: Vec<RouteCandidate>,
) -> Vec<String> {
    route_for_prompt(RoutingGoal::parse(&goal), &user_text, &candidates)
}

/// Run every subsystem's `ensure_schema` against the shared connection. Called
/// at startup and again by `backup:restore` after swapping in a snapshot. All
/// calls are idempotent (CREATE TABLE IF NOT EXISTS + seeds).
pub(crate) fn ensure_all_schemas(c: &rusqlite::Connection) {
    activity_feed::ensure_schema(c);
    changelog::ensure_schema(c);
    color_labels::ensure_schema(c);
    content_expiry::ensure_schema(c);
    daily_note::ensure_schema(c);
    dashboard::ensure_schema(c);
    feedback_collector::ensure_schema(c);
    goal_system::ensure_schema(c);
    help_system::ensure_schema(c);
    journal::ensure_schema(c);
    layout::ensure_schema(c);
    licensing::ensure_schema(c);
    read_later::ensure_schema(c);
    recycle_bin::ensure_schema(c);
    relationship_graph::ensure_schema(c);
    reminder::ensure_schema(c);
    scratchpad::ensure_schema(c);
    search_history::ensure_schema(c);
    smart_grouping::ensure_schema(c);
    smart_rename::ensure_schema(c);
    snapshot_comparison::ensure_schema(c);
    statistics_dashboard::ensure_schema(c);
    time_tracking::ensure_schema(c);
    version_history::ensure_schema(c);
    word_count::ensure_schema(c);
    bulk_metadata::ensure_schema(c);
    daily_briefing::ensure_schema(c);
    dependency::ensure_schema(c);
    duplication_detector::ensure_schema(c);
    project_archiver::ensure_schema(c);
    project_comparison::ensure_schema(c);
    project_export_bundle::ensure_schema(c);
    project_health::ensure_schema(c);
    project_linker::ensure_schema(c);
    project_lock::ensure_schema(c);
    project_timeline::ensure_schema(c);
    voice_memo::ensure_schema(c);
    keyboard_navigation::ensure_schema(c);
    localization::ensure_schema(c);
    nl_task::ensure_schema(c);
    notes::ensure_schema(c);
    session_replay::ensure_schema(c);
    shared_media_library::ensure_schema(c);
    theme_schedule::ensure_schema(c);
    vinx_presentation::ensure_schema(c);
    backup_restore::ensure_schema(c);
    file_watcher::ensure_schema(c);
    full_text_index::ensure_schema(c);
    global_content_search::ensure_schema(c);
    link_preview::ensure_schema(c);
    live_collaboration::ensure_schema(c);
    localization_engine::ensure_schema(c);
    migration::ensure_schema(c);
    multi_monitor::ensure_schema(c);
    multi_window::ensure_schema(c);
    unified_notification_hub::ensure_schema(c);
    uki_chat::ensure_schema(c);
    workflows::ensure_schema(c);
}

fn main() {
    webview2::install_panic_logger();
    // Must run before WebView2 opens its cache files (see storage_ctl.rs).
    storage_ctl::run_pending_cache_clear();
    // Fail loudly and helpfully when no WebView2 runtime exists, instead of
    // letting webview creation fail with no window and no message.
    if !webview2::preflight() {
        std::process::exit(1);
    }
    webview2::start_load_watchdog(std::time::Duration::from_secs(30));
    let result = tauri::Builder::default()
        // MUST be the first plugin. A second launch focuses the running window
        // and exits instead of starting a duplicate shell: a duplicate would
        // double-run the reminder/autobackup schedulers and file watchers on the
        // same dex.db, and if launched with different WebView2 options it hangs
        // with an empty window (the profile is locked by the first instance).
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Vault state lives for the app lifetime; the key is only set while
            // unlocked. File is stored in the app config dir.
            let vault_path = app
                .dex_config_dir()
                .unwrap_or_default()
                .join("vault.dex");
            app.manage(std::sync::Mutex::new(dex_vault::VaultManager::new(vault_path)));
            // Native search index (built on demand via search:rebuild).
            let index_dir = app
                .dex_data_dir()
                .unwrap_or_default()
                .join("search-index");
            app.manage(std::sync::Mutex::new(
                dex_search::SearchIndex::open_or_create(&index_dir).ok(),
            ));
            // Previous file snapshot for incremental `search:sync` (size+mtime per
            // path). Starts empty; the first sync restores it from disk (kept off
            // the startup path) so a relaunch diffs instead of rebuilding.
            app.manage(std::sync::Mutex::new(dex_scanner::Snapshot::new()));
            // Notification center — persists under the app data dir, mirroring
            // Electron's userData/notifications.
            let notif_dir = app
                .dex_data_dir()
                .unwrap_or_default()
                .join("notifications");
            app.manage(std::sync::Mutex::new(
                notifications::NotificationStore::new(notif_dir),
            ));
            // Shared SQLite database (dex.db) for the ~50 db-backed subsystems.
            // Each ported subsystem ensures its own tables here.
            let db_path = app
                .dex_data_dir()
                .unwrap_or_default()
                .join("databases")
                .join("dex.db");
            let conn = db::open(&db_path).ok();
            if let Some(ref c) = conn {
                // Each subsystem ensures its own tables (CREATE TABLE IF NOT
                // EXISTS), mirroring how the Electron managers init on the shared
                // DatabaseManager. Factored out so backup:restore can re-run it
                // after swapping in a snapshot. Order is irrelevant; all idempotent.
                ensure_all_schemas(c);
            }
            let db_state: db::DbState = std::sync::Mutex::new(conn);
            app.manage(db_state);
            // File-swap gate for backup:restore vs out-of-band dex.db connections.
            app.manage(db::DbGate::new(()));
            // Terminal/PTY session table (in-app shell; piped-stdio sessions).
            app.manage(terminal::TerminalState::default());
            // Live file-watcher table; start watchers for persisted folders now
            // that the db + watched_folders schema are ready (mirrors startWatching).
            app.manage(cmd_file_watcher::FileWatchState::default());
            cmd_file_watcher::start_all(app.handle().clone());
            // Live, push-based watcher that keeps the native search index fresh as
            // files change (debounced -> index_sync). Best-effort; the poll-based
            // search:sync / search:rebuild remain the fallback.
            start_index_watcher(app.handle().clone());
            // Security permissions store (session-scoped; SecurityController parity).
            app.manage(std::sync::Mutex::new(security::SecurityState::default()));
            app.manage(watch::GenericWatchState::default());
            app.manage(power::PowerProfileState::default());
            // HTTP file-transfer server slot (started on demand via httpTransfer:start).
            app.manage::<http_transfer::HttpTransferState>(std::sync::Mutex::new(None));
            // Background reminder scheduler — polls due reminders every 30s and
            // fires OS notifications (mirrors ReminderManager's interval).
            native_ops::start_reminder_scheduler(app.handle().clone());
            // Automatic backup scheduler (honors backup_settings; catchup on boot).
            native_ops::start_autobackup_scheduler(app.handle().clone());
            Ok(())
        })
        .on_page_load(|_webview, _payload| webview2::mark_page_loaded())
        .invoke_handler(tauri::generate_handler![smart_router_route, dex_ipc])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        webview2::fatal("The DEX window could not be created", &e.to_string());
        std::process::exit(1);
    }
}

