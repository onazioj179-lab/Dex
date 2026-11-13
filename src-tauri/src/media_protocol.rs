// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// `dexmedia` protocol: local photos, music, video and PDFs for DEX's own UI.
//
// The renderer runs on `http://tauri.localhost`, and Chromium refuses `file://`
// subresources from an http origin ("Not allowed to load local resource"). Under
// Electron `file://` worked, so Gallery, Audio, Files previews, Quick Look, the
// PDF viewer and custom wallpapers all built `file://` URLs, and every one of
// them showed nothing in the Tauri build (verified in a release exe over CDP:
// a Windows wallpaper JPEG failed to load as file:///).
//
// URL form (Windows WebView2): http://dexmedia.localhost/<percent-encoded path>
//
// Rules, because this hands local files to a web view:
//   - only DEX's own webviews: Browser tabs (`dexbrowser-*`) get 403;
//   - only from DEX's own pages: the Referer origin must be DEX's
//     (tauri.localhost, or localhost in dev), so a remote page framed inside
//     DEX can't embed the user's files;
//   - only media types (no executables, scripts, SVG or HTML);
//   - only absolute local paths: no UNC/device paths, no `..`, no NTFS streams;
//   - Range requests for audio/video seeking; open-ended ranges are served in
//     4 MB pieces so a large video is never read into memory whole.

use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::http::{header, Request, Response, StatusCode};

pub const SCHEME: &str = "dexmedia";
const RANGE_CHUNK: u64 = 4 * 1024 * 1024;
const MAX_WHOLE_FILE: u64 = 256 * 1024 * 1024;

pub fn content_type(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "jpg" | "jpeg" | "jfif" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" | "oga" => "audio/ogg",
        "opus" => "audio/opus",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "weba" => "audio/webm",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "ogv" => "video/ogg",
        "pdf" => "application/pdf",
        _ => return None,
    })
}

fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// The local path a request URL names, if it is one DEX may serve.
pub fn path_from_uri_path(uri_path: &str) -> Result<(PathBuf, &'static str), String> {
    let raw = percent_decode(uri_path.trim_start_matches('/')).ok_or("bad encoding")?;
    if raw.is_empty() || raw.chars().any(|c| c.is_control()) {
        return Err("bad path".into());
    }
    if raw.starts_with("\\\\") || raw.starts_with("//") {
        return Err("network and device paths are not allowed".into());
    }
    let path = PathBuf::from(&raw);
    if !path.is_absolute() {
        return Err("path must be absolute".into());
    }
    if path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("'..' is not allowed".into());
    }
    #[cfg(windows)]
    if raw.char_indices().any(|(i, c)| c == ':' && i != 1) {
        return Err("alternate data streams are not allowed".into());
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .ok_or("no file type")?;
    let mime = content_type(&ext).ok_or_else(|| format!(".{ext} is not a media type"))?;
    Ok((path, mime))
}

/// Is the Referer one of DEX's own pages?
pub fn referer_allowed(referer: Option<&str>) -> bool {
    let Some(r) = referer else { return false };
    const OWN: &[&str] = &[
        "http://tauri.localhost/",
        "https://tauri.localhost/",
        "tauri://localhost/",
        "http://localhost:",
        "http://127.0.0.1:",
    ];
    OWN.iter().any(|o| r.starts_with(o)) || r == "http://tauri.localhost" || r == "tauri://localhost"
}

/// `bytes=a-b` / `bytes=a-` / `bytes=-n` -> inclusive (start, end) within `len`.
pub fn parse_range(h: &str, len: u64) -> Option<(u64, u64)> {
    let spec = h.trim().strip_prefix("bytes=")?;
    if spec.contains(',') || len == 0 {
        return None; // multi-range: not supported, serve normally
    }
    let (a, b) = spec.split_once('-')?;
    let (start, end) = if a.is_empty() {
        let n: u64 = b.parse().ok()?;
        (len.saturating_sub(n), len - 1)
    } else {
        let start: u64 = a.parse().ok()?;
        let end = if b.is_empty() { (start + RANGE_CHUNK - 1).min(len - 1) } else { b.parse::<u64>().ok()?.min(len - 1) };
        (start, end)
    };
    (start <= end && start < len).then_some((start, end))
}

fn plain(status: StatusCode, msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(msg.as_bytes().to_vec())
        .unwrap_or_default()
}

/// Serve one request. `webview_label` is the requesting webview.
pub fn handle(webview_label: &str, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if webview_label.starts_with("dexbrowser-") {
        return plain(StatusCode::FORBIDDEN, "not available to web pages");
    }
    let referer = request.headers().get(header::REFERER).and_then(|v| v.to_str().ok());
    if !referer_allowed(referer) {
        return plain(StatusCode::FORBIDDEN, "only DEX's own pages may load local media");
    }
    let (path, mime) = match path_from_uri_path(request.uri().path()) {
        Ok(p) => p,
        Err(e) => return plain(StatusCode::BAD_REQUEST, &e),
    };
    serve_file(&path, mime, request.headers().get(header::RANGE).and_then(|v| v.to_str().ok()))
}

pub fn serve_file(path: &Path, mime: &str, range: Option<&str>) -> Response<Vec<u8>> {
    let meta = match std::fs::metadata(path) {
        Ok(m) if m.is_file() => m,
        Ok(_) => return plain(StatusCode::NOT_FOUND, "not a file"),
        Err(_) => return plain(StatusCode::NOT_FOUND, "not found"),
    };
    let len = meta.len();
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) => return plain(StatusCode::FORBIDDEN, &e.to_string()),
    };
    let base = Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-cache")
        .header("X-Content-Type-Options", "nosniff")
        // Let DEX's own page read pixels/bytes (canvas, ID3, EXIF fallback).
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "http://tauri.localhost")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Range, Accept-Ranges, Content-Length");
    if let Some((start, end)) = range.and_then(|h| parse_range(h, len)) {
        let n = end - start + 1;
        let mut buf = vec![0u8; n as usize];
        if file.seek(SeekFrom::Start(start)).and_then(|_| file.read_exact(&mut buf)).is_err() {
            return plain(StatusCode::INTERNAL_SERVER_ERROR, "read failed");
        }
        return base
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
            .header(header::CONTENT_LENGTH, n.to_string())
            .body(buf)
            .unwrap_or_default();
    }
    if range.is_some() && len > 0 {
        return plain(StatusCode::RANGE_NOT_SATISFIABLE, "bad range");
    }
    if len > MAX_WHOLE_FILE {
        // Too big to hand over in one piece: media elements ask in ranges.
        return plain(StatusCode::PAYLOAD_TOO_LARGE, "request this file in ranges");
    }
    let mut buf = Vec::with_capacity(len as usize);
    if file.read_to_end(&mut buf).is_err() {
        return plain(StatusCode::INTERNAL_SERVER_ERROR, "read failed");
    }
    base.status(StatusCode::OK).header(header::CONTENT_LENGTH, buf.len().to_string()).body(buf).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(path: &str, referer: Option<&str>, range: Option<&str>) -> Request<Vec<u8>> {
        let mut b = Request::builder().uri(format!("http://dexmedia.localhost/{path}"));
        if let Some(r) = referer { b = b.header(header::REFERER, r); }
        if let Some(r) = range { b = b.header(header::RANGE, r); }
        b.body(Vec::new()).unwrap()
    }

    fn enc(p: &Path) -> String {
        p.to_string_lossy().bytes().map(|c| match c {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (c as char).to_string(),
            _ => format!("%{c:02X}"),
        }).collect()
    }

    fn temp_media(name: &str, bytes: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dexmedia-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(name);
        std::fs::write(&p, bytes).unwrap();
        p
    }

    #[test]
    fn serves_own_page_media_and_ranges() {
        let p = temp_media("a b.mp3", b"0123456789");
        let ok = handle("main", &req(&enc(&p), Some("http://tauri.localhost/"), None));
        assert_eq!(ok.status(), StatusCode::OK);
        assert_eq!(ok.body(), b"0123456789");
        assert_eq!(ok.headers()[header::CONTENT_TYPE], "audio/mpeg");
        let part = handle("main", &req(&enc(&p), Some("http://tauri.localhost/"), Some("bytes=2-5")));
        assert_eq!(part.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(part.body(), b"2345");
        assert_eq!(part.headers()[header::CONTENT_RANGE], "bytes 2-5/10");
        let tail = handle("main", &req(&enc(&p), Some("http://tauri.localhost/"), Some("bytes=-3")));
        assert_eq!(tail.body(), b"789");
        let open = handle("main", &req(&enc(&p), Some("http://localhost:5173/"), Some("bytes=8-")));
        assert_eq!(open.body(), b"89");
    }

    #[test]
    fn refuses_browser_tabs_foreign_pages_and_non_media() {
        let p = temp_media("b.png", b"png");
        assert_eq!(handle("dexbrowser-tab1", &req(&enc(&p), Some("http://tauri.localhost/"), None)).status(), StatusCode::FORBIDDEN);
        assert_eq!(handle("main", &req(&enc(&p), Some("https://evil.example/"), None)).status(), StatusCode::FORBIDDEN);
        assert_eq!(handle("main", &req(&enc(&p), None, None)).status(), StatusCode::FORBIDDEN);
        let exe = temp_media("c.exe", b"MZ");
        assert_eq!(handle("main", &req(&enc(&exe), Some("http://tauri.localhost/"), None)).status(), StatusCode::BAD_REQUEST);
        let svg = temp_media("d.svg", b"<svg/>");
        assert_eq!(handle("main", &req(&enc(&svg), Some("http://tauri.localhost/"), None)).status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn path_rules() {
        assert!(path_from_uri_path("relative%2Fx.png").is_err());
        assert!(path_from_uri_path("%5C%5Cserver%5Cshare%5Cx.png").is_err()); // \\server\share
        #[cfg(windows)]
        {
            assert!(path_from_uri_path("C%3A%2FUsers%2Fx.png").is_ok());
            assert!(path_from_uri_path("C%3A%2FUsers%2F..%2Fx.png").is_err());
            assert!(path_from_uri_path("C%3A%2Fx.png%3Aevil").is_err());
        }
        assert!(path_from_uri_path("%ZZ").is_err());
    }

    #[test]
    fn range_parsing() {
        assert_eq!(parse_range("bytes=0-0", 10), Some((0, 0)));
        assert_eq!(parse_range("bytes=5-100", 10), Some((5, 9)));
        assert_eq!(parse_range("bytes=10-", 10), None);
        assert_eq!(parse_range("bytes=0-1,4-5", 10), None);
        assert_eq!(parse_range("bytes=0-", 100 * 1024 * 1024), Some((0, RANGE_CHUNK - 1)));
    }
}
