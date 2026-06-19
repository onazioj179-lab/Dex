// =============================================================================
// DEX Tauri — Filesystem read ops (Electron->Tauri port)
// Pure std::fs ports of the read-only filesystem channels that the renderer hits
// and that have no browser API (catalogued in rendererShims NATIVE_PENDING:
// fs:readdir, media:getMediaFiles). Return shapes match the Electron handlers
// (src/main/main.ts) exactly. fs:readFileHead is deferred — it returns an
// ArrayBuffer (binary-over-bridge) and needs the base64 plumbing standard.
// =============================================================================

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::{json, Value};
use std::io::Read;
use std::path::Path;

/// `fs:readFileHead(filePath, byteCount)` — Electron returned the first N bytes as
/// an ArrayBuffer. Binary can't cross the JSON `dex_ipc` bridge, so we use the
/// self-describing `{ "__dexBinary": "<base64>" }` envelope that tauriCompat
/// decodes back into an ArrayBuffer (the binary-over-bridge standard). Default
/// 131072 bytes, capped at 2MB — exactly matching the Electron handler.
pub fn read_file_head(path: &str, byte_count: u64) -> Value {
    let max = (if byte_count == 0 { 131072 } else { byte_count }).min(2 * 1024 * 1024) as usize;
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Value::Null,
    };
    let mut buf: Vec<u8> = Vec::with_capacity(max.min(1 << 16));
    match file.take(max as u64).read_to_end(&mut buf) {
        Ok(_) => json!({ "__dexBinary": BASE64.encode(&buf) }),
        Err(_) => Value::Null,
    }
}

/// `fs:readdir(dirPath)` — Electron returned `fs.promises.readdir` (file NAMES).
pub fn readdir(dir: &str) -> Value {
    match std::fs::read_dir(dir) {
        Ok(entries) => {
            let names: Vec<String> = entries
                .flatten()
                .filter_map(|e| e.file_name().into_string().ok())
                .collect();
            json!(names)
        }
        Err(_) => json!([]),
    }
}

/// `media:getMediaFiles(mediaType)` — scan ~/Music|Pictures|Videos recursively
/// (max depth 3, max 500 results), returning { path, name, extension, size,
/// modified } per the Electron handler.
pub fn get_media_files(media_type: &str, home: &Path) -> Value {
    let (sub, exts): (&str, &[&str]) = match media_type {
        "music" | "audio" => ("Music", &[".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".wma"]),
        "pictures" | "images" => ("Pictures", &[".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico"]),
        "videos" => ("Videos", &[".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm"]),
        _ => return json!([]),
    };
    let scan_path = home.join(sub);
    let mut results: Vec<Value> = Vec::new();
    if scan_path.exists() {
        scan_dir(&scan_path, 0, exts, &mut results);
    }
    results.truncate(500);
    json!(results)
}

fn scan_dir(dir: &Path, depth: usize, exts: &[&str], results: &mut Vec<Value>) {
    if depth > 3 || results.len() >= 500 {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if results.len() >= 500 {
            break;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            if !name.starts_with('.') {
                scan_dir(&path, depth + 1, exts, results);
            }
        } else if ft.is_file() {
            let ext = match path.extension().and_then(|e| e.to_str()) {
                Some(e) => format!(".{}", e.to_lowercase()),
                None => String::new(),
            };
            if exts.contains(&ext.as_str()) {
                if let Ok(meta) = entry.metadata() {
                    let modified = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as f64)
                        .unwrap_or(0.0);
                    results.push(json!({
                        "path": path.to_string_lossy(),
                        "name": name,
                        "extension": ext,
                        "size": meta.len(),
                        "modified": modified,
                    }));
                }
            }
        }
    }
}
