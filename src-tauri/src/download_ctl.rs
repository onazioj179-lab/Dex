// =============================================================================
// DEX Platform — Browser downloads (`download:start`)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! The Browser asked for `download:start` but nothing answered under Tauri, so
//! a download sat at "downloading" forever and no file arrived. This fetches
//! http(s) URLs into the user's Downloads folder: streamed to a `.part` file,
//! renamed when complete, never overwriting an existing file.

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Upper bound so a runaway response can't fill the disk.
const MAX_BYTES: u64 = 8 * 1024 * 1024 * 1024;

fn fail(msg: impl Into<String>) -> Value {
    json!({ "success": false, "error": msg.into() })
}

/// A safe file name from the URL path (or the server's suggestion).
pub(crate) fn file_name_for(url: &str, disposition: Option<&str>) -> String {
    let from_header = disposition.and_then(|d| {
        let lower = d.to_ascii_lowercase();
        let i = lower.find("filename=")?;
        Some(d[i + 9..].trim().trim_matches('"').split(';').next().unwrap_or("").trim_matches('"').to_string())
    });
    let from_url = url
        .split(['?', '#'])
        .next()
        .and_then(|p| p.rsplit('/').next())
        .map(|s| percent_decode(s));
    let raw = from_header.filter(|s| !s.is_empty()).or(from_url).unwrap_or_default();
    let cleaned: String = raw
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() { "download".into() } else { cleaned.chars().take(150).collect() }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// "name.ext", then "name (1).ext", "name (2).ext", ... — first that's free.
pub(crate) fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (1..10_000)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or_else(|| dir.join(format!("{stem} ({}){ext}", std::process::id())))
}

fn start(app: &tauri::AppHandle, url: &str) -> Value {
    let Ok(parsed) = tauri::Url::parse(url.trim()) else { return fail("not a valid address") };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return fail("only http and https downloads are allowed");
    }
    let Ok(dir) = app.path().download_dir() else { return fail("couldn't find the Downloads folder") };
    let _ = std::fs::create_dir_all(&dir);

    let resp = match ureq::get(parsed.as_str()).timeout(std::time::Duration::from_secs(60 * 30)).call() {
        Ok(r) => r,
        Err(ureq::Error::Status(code, _)) => return fail(format!("the server answered {code}")),
        Err(e) => return fail(format!("couldn't reach the server: {e}")),
    };
    let name = file_name_for(parsed.as_str(), resp.header("content-disposition"));
    let target = unique_path(&dir, &name);
    let part = target.with_extension(format!(
        "{}part",
        target.extension().map(|e| format!("{}.", e.to_string_lossy())).unwrap_or_default()
    ));
    let mut file = match std::fs::File::create(&part) {
        Ok(f) => f,
        Err(e) => return fail(format!("couldn't create the file: {e}")),
    };
    let mut reader = resp.into_reader().take(MAX_BYTES + 1);
    let mut buf = vec![0u8; 256 * 1024];
    let mut total: u64 = 0;
    loop {
        let n = match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                drop(file);
                let _ = std::fs::remove_file(&part);
                return fail(format!("the download was interrupted: {e}"));
            }
        };
        total += n as u64;
        if total > MAX_BYTES || file.write_all(&buf[..n]).is_err() {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return fail(if total > MAX_BYTES { "the file is larger than 8 GB".to_string() } else { "couldn't write to the Downloads folder".to_string() });
        }
    }
    drop(file);
    if let Err(e) = std::fs::rename(&part, &target) {
        let _ = std::fs::remove_file(&part);
        return fail(format!("couldn't finish the file: {e}"));
    }
    json!({ "success": true, "path": target.to_string_lossy(), "size": total, "fileName": target.file_name().map(|n| n.to_string_lossy().to_string()) })
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "download:start" => match args.get(0).and_then(|v| v.as_str()) {
            Some(url) => start(app, url),
            None => fail("missing url"),
        },
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_safe_and_decoded() {
        assert_eq!(file_name_for("https://x.com/a/My%20File.zip?x=1", None), "My File.zip");
        assert_eq!(file_name_for("https://x.com/", None), "download");
        assert_eq!(file_name_for("https://x.com/d", Some("attachment; filename=\"re:port?.pdf\"")), "re_port_.pdf");
        assert_eq!(file_name_for("https://x.com/..", None), "download");
    }

    #[test]
    fn never_overwrites() {
        let dir = std::env::temp_dir().join(format!("dex-dl-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.zip"), b"x").unwrap();
        std::fs::write(dir.join("a (1).zip"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "a.zip").file_name().unwrap(), "a (2).zip");
        assert_eq!(unique_path(&dir, "b.zip").file_name().unwrap(), "b.zip");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
