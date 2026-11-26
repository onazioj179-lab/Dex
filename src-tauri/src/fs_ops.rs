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

pub fn preview_text(raw: &str) -> Value {
    const LIMIT: usize = 256 * 1024;
    let result = (|| -> std::io::Result<Value> {
        let path = Path::new(raw);
        if !path.is_absolute() || !path.metadata()?.is_file() {
            return Err(std::io::Error::other("Choose a regular local file."));
        }
        let mut bytes = Vec::new();
        std::fs::File::open(path)?.take((LIMIT + 1) as u64).read_to_end(&mut bytes)?;
        let truncated = bytes.len() > LIMIT;
        bytes.truncate(LIMIT);
        let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
        let text = match std::str::from_utf8(bytes) {
            Ok(text) => text,
            Err(error) if truncated && error.error_len().is_none() => {
                std::str::from_utf8(&bytes[..error.valid_up_to()]).map_err(std::io::Error::other)?
            }
            Err(error) => return Err(std::io::Error::other(error)),
        };
        Ok(json!({"success": true, "content": text, "truncated": truncated}))
    })();
    result.unwrap_or_else(|_| json!({"success": false, "error": "Could not read this file as UTF-8 text."}))
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
        "music" | "audio" => ("Music", crate::gallery_media::AUDIO),
        "pictures" | "images" => ("Pictures", &[".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico"]),
        "videos" => ("Videos", &[".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm"]),
        _ => return json!([]),
    };
    json!(scan_media(&home.join(sub), exts))
}

pub(crate) fn scan_media(scan_path: &Path, exts: &[&str]) -> Vec<Value> {
    let mut results: Vec<Value> = Vec::new();
    scan_dir(scan_path, 0, exts, &mut results);
    results
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
                if let Ok(record) = media_record(&path) {
                    results.push(record);
                }
            }
        }
    }
}

pub(crate) fn media_record(path: &Path) -> std::io::Result<Value> {
    let meta = std::fs::metadata(path)?;
    if !meta.is_file() {
        return Err(std::io::Error::other("Expected a regular media file"));
    }
    let modified = meta.modified().ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0.0, |duration| duration.as_millis() as f64);
    Ok(json!({
        "path": path.to_string_lossy(),
        "name": path.file_name().unwrap_or_default().to_string_lossy(),
        "extension": path.extension().and_then(|ext| ext.to_str()).map(|ext| format!(".{}", ext.to_lowercase())),
        "size": meta.len(),
        "modified": modified,
    }))
}
