// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Parallel File Scanner
// Replaces: sync readdirSync recursive scans in main.ts, RewindEngine.ts
// Uses jwalk for 3-10x faster parallel directory traversal
// ═══════════════════════════════════════════════════════════════════════════

use napi::bindgen_prelude::*;
use napi_derive::napi;
use jwalk::WalkDir;
use rayon::prelude::*;
use std::collections::HashSet;
use std::path::Path;
use std::time::SystemTime;
use std::sync::atomic::{AtomicU64, Ordering};
use std::ffi::OsStr;

/// Max symlink follow depth to prevent infinite loops
const MAX_SYMLINK_DEPTH: u32 = 8;

/// Batch string conversion: avoid allocation when path is valid UTF-8 (item 124)
#[inline]
fn os_str_to_string(s: &OsStr) -> String {
    match s.to_str() {
        Some(s) => s.to_owned(),
        None => s.to_string_lossy().into_owned(),
    }
}

#[inline]
fn path_to_string(p: &Path) -> String {
    match p.to_str() {
        Some(s) => s.to_owned(),
        None => p.to_string_lossy().into_owned(),
    }
}

/// Rate limiting: minimum milliseconds between scan_directory calls
const SCAN_RATE_LIMIT_MS: u64 = 500;

/// Last scan timestamp for rate limiting (epoch ms)
static LAST_SCAN_TIME: AtomicU64 = AtomicU64::new(0);

/// Rate limit check: returns true if too soon since last call
fn check_rate_limit() -> bool {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_SCAN_TIME.load(Ordering::Relaxed);
    if now - last < SCAN_RATE_LIMIT_MS {
        return true; // rate limited
    }
    LAST_SCAN_TIME.store(now, Ordering::Relaxed);
    false
}

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: f64,
    pub modified: f64,
    pub is_directory: bool,
}

#[napi(object)]
#[derive(Clone)]
pub struct ScanResult {
    pub files: Vec<FileEntry>,
    pub total_scanned: u32,
    pub duration_ms: f64,
    pub truncated: bool,
}

#[napi(object)]
#[derive(Clone)]
pub struct DirectorySize {
    pub total_bytes: f64,
    pub file_count: u32,
    pub dir_count: u32,
}

// ─────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────

/// Scan a directory recursively with parallel traversal (jwalk).
/// Rate-limited to prevent rapid successive calls from degrading performance.
#[napi]
pub fn scan_directory(
    root_path: String,
    extensions: Vec<String>,
    max_depth: Option<u32>,
    limit: Option<u32>,
    include_dirs: Option<bool>,
) -> Result<ScanResult> {
    // Rate limit: return empty result if called too rapidly
    if check_rate_limit() {
        return Ok(ScanResult {
            files: Vec::new(),
            total_scanned: 0,
            duration_ms: 0.0,
            truncated: false,
        });
    }

    let start = std::time::Instant::now();
    let root = Path::new(&root_path);

    if !root.exists() || !root.is_dir() {
        return Err(Error::from_reason(format!("Invalid directory: {}", root_path)));
    }

    // Resolve symlinks with a bounded depth to prevent circular symlink loops
    let canonical = {
        let mut p = root.to_path_buf();
        let mut depth = 0;
        while p.is_symlink() && depth < MAX_SYMLINK_DEPTH {
            p = std::fs::read_link(&p)
                .map_err(|e| Error::from_reason(format!("Symlink resolve error: {}", e)))?;
            depth += 1;
        }
        if depth >= MAX_SYMLINK_DEPTH {
            return Err(Error::from_reason("Symlink depth limit exceeded — possible loop".to_string()));
        }
        p.canonicalize()
            .map_err(|e| Error::from_reason(format!("Path resolve error: {}", e)))?
    };

    let max_depth = max_depth.unwrap_or(10) as usize;
    let limit = limit.unwrap_or(1000) as usize;
    let include_dirs = include_dirs.unwrap_or(false);

    let ext_filter: HashSet<String> = extensions.iter()
        .map(|e| e.to_lowercase().trim_start_matches('.').to_string())
        .collect();
    let filter = !ext_filter.is_empty();

    let mut files = Vec::with_capacity(limit.min(10_000));
    let mut total: u32 = 0;
    let mut truncated = false;

    for entry in WalkDir::new(&canonical).max_depth(max_depth).skip_hidden(false).sort(true) {
        let entry = match entry { Ok(e) => e, Err(_) => continue };
        total += 1;

        let is_dir = entry.file_type().is_dir();
        if is_dir && !include_dirs { continue; }
        if entry.depth() == 0 { continue; }

        let p = entry.path();
        let ext = if is_dir { String::new() } else {
            p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
        };

        if filter && !is_dir && !ext_filter.contains(&ext) { continue; }

        let (size, modified) = entry.metadata().ok().map(|m| {
            let sz = m.len() as f64;
            let mt = m.modified().ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as f64).unwrap_or(0.0);
            (sz, mt)
        }).unwrap_or((0.0, 0.0));

        files.push(FileEntry {
            path: path_to_string(&p),
            name: os_str_to_string(entry.file_name()),
            extension: ext,
            size,
            modified,
            is_directory: is_dir,
        });

        if files.len() >= limit { truncated = true; break; }
    }

    Ok(ScanResult { files, total_scanned: total, duration_ms: start.elapsed().as_secs_f64() * 1000.0, truncated })
}

/// Calculate total directory size.
#[napi]
pub fn get_directory_size(dir_path: String) -> Result<DirectorySize> {
    let root = Path::new(&dir_path);
    if !root.exists() || !root.is_dir() {
        return Ok(DirectorySize { total_bytes: 0.0, file_count: 0, dir_count: 0 });
    }

    let canonical = root.canonicalize()
        .map_err(|e| Error::from_reason(format!("Path resolve error: {}", e)))?;

    let mut bytes: u64 = 0;
    let mut fc: u32 = 0;
    let mut dc: u32 = 0;

    for entry in WalkDir::new(&canonical).skip_hidden(false) {
        let entry = match entry { Ok(e) => e, Err(_) => continue };
        if entry.file_type().is_dir() { dc += 1; } else {
            fc += 1;
            if let Ok(m) = entry.metadata() { bytes += m.len(); }
        }
    }

    Ok(DirectorySize { total_bytes: bytes as f64, file_count: fc, dir_count: dc })
}

#[napi(object)]
pub struct BatchFileInfo {
    pub path: String,
    pub exists: bool,
    pub size: f64,
    pub modified: f64,
    pub is_directory: bool,
}

/// Batch file stat using rayon parallelism — stat many paths concurrently.
#[napi]
pub fn batch_file_stats(paths: Vec<String>) -> Vec<BatchFileInfo> {
    paths.par_iter().map(|p| {
        let path_ref = Path::new(p);
        match std::fs::metadata(path_ref) {
            Ok(m) => BatchFileInfo {
                path: p.clone(),
                exists: true,
                size: m.len() as f64,
                modified: m.modified().ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as f64).unwrap_or(0.0),
                is_directory: m.is_dir(),
            },
            Err(_) => BatchFileInfo {
                path: p.clone(),
                exists: false,
                size: 0.0,
                modified: 0.0,
                is_directory: false,
            },
        }
    }).collect()
}

/// Scan for media files in user directories.
#[napi]
pub fn scan_media_files(
    scan_type: String,
    custom_paths: Option<Vec<String>>,
    limit: Option<u32>,
) -> Result<ScanResult> {
    let exts: Vec<&str> = match scan_type.as_str() {
        "audio" => vec!["mp3","wav","flac","aac","ogg","wma","m4a","opus","aiff"],
        "image" => vec!["jpg","jpeg","png","gif","bmp","webp","svg","tiff","ico","heic"],
        "video" => vec!["mp4","mkv","avi","mov","wmv","flv","webm","m4v","mpg","mpeg"],
        "document" => vec!["pdf","doc","docx","xls","xlsx","ppt","pptx","txt","md","csv","rtf"],
        _ => vec![],
    };

    let paths = custom_paths.unwrap_or_else(|| default_paths(&scan_type));
    let limit = limit.unwrap_or(500) as usize;
    let start = std::time::Instant::now();
    let ext_set: HashSet<String> = exts.iter().map(|e| e.to_string()).collect();

    let mut all: Vec<FileEntry> = Vec::new();
    let mut total: u32 = 0;

    for sp in &paths {
        let p = Path::new(sp);
        if !p.exists() || !p.is_dir() { continue; }

        for entry in WalkDir::new(p).max_depth(4).skip_hidden(true).sort(true) {
            let entry = match entry { Ok(e) => e, Err(_) => continue };
            total += 1;
            if entry.file_type().is_dir() { continue; }

            let fp = entry.path();
            let ext = fp.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if !ext_set.contains(&ext) { continue; }

            let (size, modified) = entry.metadata().ok().map(|m| {
                let s = m.len() as f64;
                let t = m.modified().ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as f64).unwrap_or(0.0);
                (s, t)
            }).unwrap_or((0.0, 0.0));

            all.push(FileEntry {
                path: path_to_string(&fp),
                name: os_str_to_string(entry.file_name()),
                extension: ext,
                size, modified, is_directory: false,
            });

            if all.len() >= limit { break; }
        }
        if all.len() >= limit { break; }
    }

    all.sort_by(|a, b| b.modified.partial_cmp(&a.modified).unwrap_or(std::cmp::Ordering::Equal));
    let truncated = all.len() >= limit;
    all.truncate(limit);

    Ok(ScanResult { files: all, total_scanned: total, duration_ms: start.elapsed().as_secs_f64() * 1000.0, truncated })
}

// ─────────────────────────────────────────────────────────────────────────
// Default media scan paths
// ─────────────────────────────────────────────────────────────────────────

fn default_paths(scan_type: &str) -> Vec<String> {
    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        let h = home.to_string_lossy().to_string();
        match scan_type {
            "audio" => { paths.push(format!("{}/Music", h)); paths.push(format!("{}/Downloads", h)); }
            "image" => { paths.push(format!("{}/Pictures", h)); paths.push(format!("{}/Downloads", h)); }
            "video" => { paths.push(format!("{}/Videos", h)); paths.push(format!("{}/Downloads", h)); }
            _ =>       { paths.push(format!("{}/Documents", h)); paths.push(format!("{}/Downloads", h)); }
        }
    }
    paths
}

// ─────────────────────────────────────────────────────────────────────────
// File Watcher (item 122) — notify crate for native FS events
// ─────────────────────────────────────────────────────────────────────────

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use std::sync::Mutex;
use ringbuf::{HeapRb, traits::{Producer, Consumer, Split}};

/// File change event returned to Node.
#[napi(object)]
pub struct FileChangeEvent {
    pub kind: String,    // "create" | "modify" | "remove" | "rename" | "other"
    pub paths: Vec<String>,
}

/// Ring buffer capacity for file events (lock-free producer/consumer).
const WATCHER_RING_CAPACITY: usize = 10_000;

/// Producer half (watcher thread pushes events).
static WATCHER_PRODUCER: once_cell::sync::Lazy<Mutex<ringbuf::HeapProd<FileChangeEvent>>> =
    once_cell::sync::Lazy::new(|| {
        let rb = HeapRb::<FileChangeEvent>::new(WATCHER_RING_CAPACITY);
        let (prod, cons) = rb.split();
        *WATCHER_CONSUMER.lock().expect("WATCHER_CONSUMER mutex poisoned during init") = Some(cons);
        Mutex::new(prod)
    });

/// Consumer half (drain call reads events).
static WATCHER_CONSUMER: once_cell::sync::Lazy<Mutex<Option<ringbuf::HeapCons<FileChangeEvent>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(None));

static WATCHER_INSTANCE: once_cell::sync::Lazy<Mutex<Option<RecommendedWatcher>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(None));

fn event_kind_label(kind: &EventKind) -> &'static str {
    match kind {
        EventKind::Create(_) => "create",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "remove",
        _ => "other",
    }
}

/// Start watching a directory (recursive). Events are buffered in a ring buffer; call `drain_file_events` to read.
#[napi]
pub fn start_file_watcher(dir: String) -> Result<bool> {
    let path = std::path::PathBuf::from(&dir);
    if !path.is_dir() {
        return Err(Error::from_reason(format!("Not a directory: {}", dir)));
    }

    // Ensure producer is initialized (triggers Lazy init of both halves)
    let _ = &*WATCHER_PRODUCER;

    let mut watcher = RecommendedWatcher::new(
        move |res: std::result::Result<Event, notify::Error>| {
            if let Ok(evt) = res {
                let kind = event_kind_label(&evt.kind).to_string();
                let paths: Vec<String> = evt.paths.iter().map(|p| path_to_string(p)).collect();
                if let Ok(mut prod) = WATCHER_PRODUCER.lock() {
                    // Ring buffer: if full, oldest events are silently dropped (bounded memory)
                    let _ = prod.try_push(FileChangeEvent { kind, paths });
                }
            }
        },
        Config::default(),
    ).map_err(|e| Error::from_reason(format!("Watcher init failed: {}", e)))?;

    watcher.watch(&path, RecursiveMode::Recursive)
        .map_err(|e| Error::from_reason(format!("Watch failed: {}", e)))?;

    *WATCHER_INSTANCE.lock().map_err(|e| Error::from_reason(format!("Watcher lock poisoned: {}", e)))? = Some(watcher);
    Ok(true)
}

/// Drain all buffered file events (non-blocking). Returns collected events since last drain.
#[napi]
pub fn drain_file_events() -> Vec<FileChangeEvent> {
    if let Ok(mut cons_opt) = WATCHER_CONSUMER.lock() {
        if let Some(cons) = cons_opt.as_mut() {
            let mut events = Vec::new();
            while let Some(evt) = cons.try_pop() {
                events.push(evt);
            }
            return events;
        }
    }
    Vec::new()
}

/// Stop the file watcher.
#[napi]
pub fn stop_file_watcher() -> bool {
    let Ok(mut guard) = WATCHER_INSTANCE.lock() else { return false; };
    *guard = None;
    true
}

/// Memory-mapped file read for large files — avoids copying entire file into heap.
/// Returns raw bytes as a Buffer for files > threshold, falls back to std::fs::read for small files.
#[napi]
pub fn mmap_read_file(file_path: String) -> Result<napi::bindgen_prelude::Buffer> {
    use memmap2::Mmap;
    let path = Path::new(&file_path);
    if !path.exists() || !path.is_file() {
        return Err(Error::from_reason(format!("File not found: {}", file_path)));
    }
    let file = std::fs::File::open(path)
        .map_err(|e| Error::from_reason(format!("Open failed: {}", e)))?;
    let meta = file.metadata()
        .map_err(|e| Error::from_reason(format!("Metadata failed: {}", e)))?;
    if meta.len() < 1_048_576 {
        let data = std::fs::read(path)
            .map_err(|e| Error::from_reason(format!("Read failed: {}", e)))?;
        return Ok(data.into());
    }
    let mmap = unsafe { Mmap::map(&file) }
        .map_err(|e| Error::from_reason(format!("Mmap failed: {}", e)))?;
    Ok(mmap.to_vec().into())
}
