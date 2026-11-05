// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! `download:start(url)` — the Browser's download button. Streams an http(s)
//! URL into the user's Downloads folder: `<name>.part` first, renamed when
//! complete, so an interrupted download never looks finished. Emits
//! `download:progress` events (throttled) and returns
//! `{ success: true, path, size }` or `{ success: false, error }`.

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

const MAX_BYTES: u64 = 8 * 1024 * 1024 * 1024; // 8 GB guard

/// A Windows-safe file name from a URL or Content-Disposition value.
pub fn safe_file_name(raw: &str) -> String {
    let decoded = percent_decode(raw);
    let cleaned: String = decoded
        .chars()
        .map(|c| if c.is_control() || "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.').trim_end_matches(['.', ' ']);
    let mut name = if trimmed.is_empty() { "download".to_string() } else { trimmed.chars().take(180).collect() };
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    const RESERVED: [&str; 22] = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
    if RESERVED.contains(&stem.as_str()) { name = format!("_{name}"); }
    name
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Name from the URL path's last segment (query/fragment stripped).
pub fn name_from_url(url: &str) -> String {
    let no_frag = url.split('#').next().unwrap_or(url);
    let no_query = no_frag.split('?').next().unwrap_or(no_frag);
    let after_scheme = no_query.splitn(2, "://").nth(1).unwrap_or(no_query);
    let path = after_scheme.splitn(2, '/').nth(1).unwrap_or("");
    safe_file_name(path.rsplit('/').find(|s| !s.is_empty()).unwrap_or(""))
}

/// `filename="x.pdf"` / `filename*=UTF-8''x.pdf` from a Content-Disposition header.
pub fn name_from_disposition(h: &str) -> Option<String> {
    for part in h.split(';').map(str::trim) {
        if let Some(v) = part.strip_prefix("filename*=") {
            let v = v.splitn(2, "''").nth(1).unwrap_or(v);
            return Some(safe_file_name(v.trim_matches('"')));
        }
    }
    for part in h.split(';').map(str::trim) {
        if let Some(v) = part.strip_prefix("filename=") {
            return Some(safe_file_name(v.trim_matches('"')));
        }
    }
    None
}

/// `name.ext`, then `name (1).ext`, … — never overwrites an existing file.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() { return first; }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    for n in 1..10_000 {
        let p = dir.join(format!("{stem} ({n}){ext}"));
        if !p.exists() { return p; }
    }
    dir.join(format!("{stem}-{}{ext}", std::process::id()))
}

pub fn start(app: &tauri::AppHandle, args: &Value) -> Value {
    let url = args.get(0).and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return json!({ "success": false, "error": "Only http and https downloads are supported." });
    }
    let dir = match app.path().download_dir() {
        Ok(d) => d,
        Err(e) => return json!({ "success": false, "error": format!("No Downloads folder: {e}") }),
    };
    let _ = std::fs::create_dir_all(&dir);

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(20))
        .timeout_read(std::time::Duration::from_secs(60))
        .user_agent("DEX")
        .build();
    let resp = match agent.get(&url).call() {
        Ok(r) => r,
        Err(ureq::Error::Status(code, _)) => return json!({ "success": false, "error": format!("The server answered {code}.") }),
        Err(e) => return json!({ "success": false, "error": e.to_string() }),
    };
    let total: Option<u64> = resp.header("Content-Length").and_then(|v| v.parse().ok());
    if total.map_or(false, |t| t > MAX_BYTES) {
        return json!({ "success": false, "error": "The file is larger than 8 GB." });
    }
    let name = resp.header("Content-Disposition").and_then(name_from_disposition).unwrap_or_else(|| name_from_url(&url));
    let target = unique_path(&dir, &name);
    let part = target.with_file_name(format!("{}.part", target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()));

    let mut file = match std::fs::File::create(&part) {
        Ok(f) => f,
        Err(e) => return json!({ "success": false, "error": e.to_string() }),
    };
    let mut reader = resp.into_reader().take(MAX_BYTES + 1);
    let mut buf = vec![0u8; 256 * 1024];
    let mut received: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    let fail = |part: &Path, msg: String| { let _ = std::fs::remove_file(part); json!({ "success": false, "error": msg }) };
    loop {
        let n = match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => { drop(file); return fail(&part, format!("Download interrupted: {e}")); }
        };
        if let Err(e) = file.write_all(&buf[..n]) { drop(file); return fail(&part, e.to_string()); }
        received += n as u64;
        if received > MAX_BYTES { drop(file); return fail(&part, "The file is larger than 8 GB.".into()); }
        if last_emit.elapsed().as_millis() >= 250 {
            last_emit = std::time::Instant::now();
            crate::native_ops::emit_event(app, "download:progress", &json!({ "url": url, "received": received, "total": total }));
        }
    }
    if let Err(e) = file.flush().and_then(|_| file.sync_all()) { drop(file); return fail(&part, e.to_string()); }
    drop(file);
    if let Some(t) = total {
        if received != t { return fail(&part, format!("Download incomplete ({received} of {t} bytes).")); }
    }
    if let Err(e) = std::fs::rename(&part, &target) { return fail(&part, e.to_string()); }
    crate::native_ops::emit_event(app, "download:progress", &json!({ "url": url, "received": received, "total": total.or(Some(received)) }));
    json!({ "success": true, "path": target.to_string_lossy(), "size": received })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_safe() {
        assert_eq!(name_from_url("https://x.org/a/b/report%20final.pdf?x=1#y"), "report final.pdf");
        assert_eq!(name_from_url("https://x.org/"), "download");
        assert_eq!(safe_file_name("..\\evil/../a:b.txt"), "_evil_.._a_b.txt");
        assert_eq!(safe_file_name("CON.txt"), "_CON.txt");
        assert_eq!(name_from_disposition("attachment; filename=\"q3.csv\""), Some("q3.csv".into()));
        assert_eq!(name_from_disposition("attachment; filename*=UTF-8''na%C3%AFve.txt"), Some("naïve.txt".into()));
        assert_eq!(name_from_disposition("inline"), None);
    }

    #[test]
    fn unique_path_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("dex-dl-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), "x").unwrap();
        std::fs::write(dir.join("a (1).txt"), "x").unwrap();
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a (2).txt"));
        assert_eq!(unique_path(&dir, "b.txt"), dir.join("b.txt"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
