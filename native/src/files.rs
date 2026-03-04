// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Parallel File Scanner
// Replaces: sync readdirSync recursive scans in main.ts, RewindEngine.ts
// Uses jwalk for 3-10x faster parallel directory traversal
// ═══════════════════════════════════════════════════════════════════════════

use napi::bindgen_prelude::*;
use napi_derive::napi;
use jwalk::WalkDir;
use std::collections::HashSet;
use std::path::Path;
use std::time::SystemTime;

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
#[napi]
pub fn scan_directory(
    root_path: String,
    extensions: Vec<String>,
    max_depth: Option<u32>,
    limit: Option<u32>,
    include_dirs: Option<bool>,
) -> Result<ScanResult> {
    let start = std::time::Instant::now();
    let root = Path::new(&root_path);

    if !root.exists() || !root.is_dir() {
        return Err(Error::from_reason(format!("Invalid directory: {}", root_path)));
    }

    let canonical = root.canonicalize()
        .map_err(|e| Error::from_reason(format!("Path resolve error: {}", e)))?;

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
            path: p.to_string_lossy().into_owned(),
            name: entry.file_name().to_string_lossy().into_owned(),
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
                path: fp.to_string_lossy().into_owned(),
                name: entry.file_name().to_string_lossy().into_owned(),
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
