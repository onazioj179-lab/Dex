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
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Manager;

use crate::util::LockSafe;

/// Cancel flags of downloads running in the background, by renderer id.
fn running() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static R: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Renderer-chosen ids: short and plain, so they are safe as map keys and in events.
pub(crate) fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

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

fn check_url(url: &str) -> Result<tauri::Url, Value> {
    let Ok(parsed) = tauri::Url::parse(url.trim()) else { return Err(fail("not a valid address")) };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(fail("only http and https downloads are allowed"));
    }
    Ok(parsed)
}

fn start(app: &tauri::AppHandle, url: &str) -> Value {
    run(app, url, None, &mut |_, _| {})
}

/// Download `url` into Downloads. `cancel` stops it (the .part file is
/// removed); `progress(received, total)` is called as bytes arrive.
fn run(app: &tauri::AppHandle, url: &str, cancel: Option<&AtomicBool>, progress: &mut dyn FnMut(u64, Option<u64>)) -> Value {
    let parsed = match check_url(url) { Ok(p) => p, Err(e) => return e };
    let Ok(dir) = app.path().download_dir() else { return fail("couldn't find the Downloads folder") };
    let _ = std::fs::create_dir_all(&dir);

    let resp = match ureq::get(parsed.as_str()).timeout(std::time::Duration::from_secs(60 * 30)).call() {
        Ok(r) => r,
        Err(ureq::Error::Status(code, _)) => return fail(format!("the server answered {code}")),
        Err(e) => return fail(format!("couldn't reach the server: {e}")),
    };
    let name = file_name_for(parsed.as_str(), resp.header("content-disposition"));
    let expected: Option<u64> = resp.header("content-length").and_then(|v| v.trim().parse().ok());
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
        if cancel.map(|c| c.load(Ordering::Relaxed)).unwrap_or(false) {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return json!({ "success": false, "cancelled": true, "error": "cancelled" });
        }
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
        progress(total, expected);
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

/// Background download with live `download:progress` events
/// ({ id, state: progressing|completed|failed|cancelled, received, total, percent, path?, fileName?, error? }).
fn start_background(app: &tauri::AppHandle, url: &str, id: &str) -> Value {
    if let Err(e) = check_url(url) { return e; }
    let flag = Arc::new(AtomicBool::new(false));
    {
        let mut map = running().lock_safe();
        if map.contains_key(id) { return fail("a download with this id is already running"); }
        map.insert(id.to_string(), flag.clone());
    }
    let id_out = id.to_string();
    let (app, url, id) = (app.clone(), url.to_string(), id.to_string());
    std::thread::spawn(move || {
        let mut last = Instant::now() - Duration::from_secs(1);
        let mut on_progress = |received: u64, total: Option<u64>| {
            if last.elapsed() < Duration::from_millis(200) { return; }
            last = Instant::now();
            let percent = total.filter(|t| *t > 0).map(|t| ((received.min(t) * 100) / t) as u32);
            crate::native_ops::emit_event(&app, "download:progress", &json!({
                "id": id, "state": "progressing", "received": received, "total": total, "percent": percent,
            }));
        };
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run(&app, &url, Some(&flag), &mut on_progress)))
            .unwrap_or_else(|_| fail("the download stopped unexpectedly"));
        running().lock_safe().remove(&id);
        let state = if res.get("success").and_then(|v| v.as_bool()) == Some(true) { "completed" }
            else if res.get("cancelled").and_then(|v| v.as_bool()) == Some(true) { "cancelled" } else { "failed" };
        let mut ev = json!({ "id": id, "state": state });
        if let (Some(o), Some(r)) = (ev.as_object_mut(), res.as_object()) {
            for k in ["path", "fileName", "size", "error"] { if let Some(v) = r.get(k) { o.insert(k.into(), v.clone()); } }
            if state == "completed" { o.insert("percent".into(), json!(100)); }
        }
        crate::native_ops::emit_event(&app, "download:progress", &ev);
    });
    json!({ "success": true, "id": id_out, "started": true })
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "download:start" => match (args.get(0).and_then(|v| v.as_str()), args.get(1).and_then(|v| v.as_str())) {
            (Some(url), Some(id)) if valid_id(id) => start_background(app, url, id),
            (Some(_), Some(_)) => fail("invalid download id"),
            (Some(url), None) => start(app, url),
            _ => fail("missing url"),
        },
        "download:cancel" => match args.get(0).and_then(|v| v.as_str()) {
            Some(id) => match running().lock_safe().get(id) {
                Some(flag) => { flag.store(true, Ordering::Relaxed); json!({ "success": true }) }
                None => fail("no such download"),
            },
            None => fail("missing id"),
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
    fn download_ids_are_plain() {
        assert!(valid_id("dl_1731_ab-9"));
        assert!(!valid_id(""));
        assert!(!valid_id("../x"));
        assert!(!valid_id(&"a".repeat(65)));
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
