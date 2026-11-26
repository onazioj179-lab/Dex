// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Play any audio or video file, of any size.
//!
//! DEX plays media in WebView2, which decodes H.264 / VP8 / VP9 / AV1 video and
//! AAC / MP3 / Opus / Vorbis / FLAC / PCM audio in MP4, WebM, Ogg, MP3, WAV and
//! FLAC files. Everything else (AVI, WMV, FLV, MKV with other codecs, HEVC,
//! MPEG-2, AC-3, DTS, WMA, APE, ALAC, AIFF …) used to fail with a black frame.
//!
//! `media:probe` asks ffprobe what is inside a file and decides:
//!   - direct    : WebView2 plays it as is (streamed by the dexmedia protocol,
//!                 which serves byte ranges, so multi-GB files seek instantly);
//!   - remux     : the codecs are fine, only the container is not: ffmpeg
//!                 copies the streams into MP4/WebM (no re-encode: seconds,
//!                 even for large files);
//!   - transcode : a codec WebView2 cannot decode: H.264 + AAC (video) or
//!                 AAC / FLAC (audio; lossless sources stay lossless).
//! `media:prepare` runs that on a background thread with progress events and
//! caches the result (<data>/media-cache, keyed by path + size + mtime, pruned
//! to 20 GB oldest-first), so the second play is instant.
//!
//! FFmpeg is the system's (winget install Gyan.FFmpeg). Without it, direct
//! files still play and the rest report a clear error instead of a black frame.
//!
//! Channels: media:probe {path}, media:prepare {path}, media:cacheInfo, media:clearCache.
//! Events:   media:prepare-progress {id, percent}, media:prepare-done {id, ok, path?, error?}.

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const CACHE_LIMIT_BYTES: u64 = 20 * 1024 * 1024 * 1024;

// --- Decision (pure) ------------------------------------------------------------

const DIRECT_VIDEO: &[&str] = &["h264", "vp8", "vp9", "av1"];
const DIRECT_AUDIO: &[&str] = &["aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le", "pcm_s24le", "pcm_f32le", "pcm_u8"];
const MP4_OK_VIDEO: &[&str] = &["h264", "av1"];
const MP4_OK_AUDIO: &[&str] = &["aac", "mp3", "opus", "flac"];
const WEBM_OK_VIDEO: &[&str] = &["vp8", "vp9", "av1"];
const WEBM_OK_AUDIO: &[&str] = &["opus", "vorbis"];
const LOSSLESS_AUDIO: &[&str] = &["alac", "ape", "wavpack", "tta", "pcm_s16be", "pcm_s24be", "pcm_s32le", "pcm_s32be", "pcm_f64le", "truehd", "mlp"];

#[derive(Debug, Clone, PartialEq)]
pub enum Plan {
    Direct,
    /// Copy the streams into this container (extension).
    Remux(&'static str),
    /// Re-encode into this container (extension).
    Transcode(&'static str),
}

fn ext_of(path: &str) -> String {
    Path::new(path).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// Containers WebView2 opens by file type.
fn direct_container(ext: &str) -> bool {
    matches!(ext, "mp4" | "m4v" | "m4a" | "mov" | "webm" | "ogg" | "ogv" | "oga" | "opus" | "mp3" | "wav" | "flac" | "aac")
}

/// What to do with a file whose first video / audio codecs are `video` / `audio` (ffprobe names).
pub fn decide(path: &str, video: Option<&str>, audio: Option<&str>) -> Plan {
    let ext = ext_of(path);
    let v_ok = video.map(|v| DIRECT_VIDEO.contains(&v)).unwrap_or(true);
    let a_ok = audio.map(|a| DIRECT_AUDIO.contains(&a)).unwrap_or(true);
    if v_ok && a_ok && direct_container(&ext) {
        // MOV/MP4 with codecs Chromium knows, or a plain audio file.
        return Plan::Direct;
    }
    if video.is_none() {
        // Audio only.
        return match audio {
            Some(a) if DIRECT_AUDIO.contains(&a) && a == "flac" => Plan::Remux("flac"),
            Some(a) if DIRECT_AUDIO.contains(&a) && (a == "aac" || a == "mp3") => Plan::Remux("m4a"),
            Some(a) if DIRECT_AUDIO.contains(&a) && (a == "opus" || a == "vorbis") => Plan::Remux("ogg"),
            Some(a) if LOSSLESS_AUDIO.contains(&a) || a.starts_with("pcm_") => Plan::Transcode("flac"),
            _ => Plan::Transcode("m4a"),
        };
    }
    let v = video.unwrap_or("");
    let a = audio.unwrap_or("aac");
    if MP4_OK_VIDEO.contains(&v) && (audio.is_none() || MP4_OK_AUDIO.contains(&a)) {
        return Plan::Remux("mp4");
    }
    if WEBM_OK_VIDEO.contains(&v) && (audio.is_none() || WEBM_OK_AUDIO.contains(&a)) {
        return Plan::Remux("webm");
    }
    Plan::Transcode("mp4")
}

/// ffmpeg arguments (after `-i input`) for a plan.
pub fn ffmpeg_args(plan: &Plan, has_video: bool, audio: Option<&str>) -> Vec<String> {
    let s = |x: &str| x.to_string();
    match plan {
        Plan::Direct => vec![],
        Plan::Remux(c) => {
            let mut a = vec![s("-map"), s("0:v:0?"), s("-map"), s("0:a:0?"), s("-c"), s("copy"), s("-sn"), s("-dn")];
            if *c == "mp4" || *c == "m4a" { a.extend([s("-movflags"), s("+faststart")]); }
            a
        }
        Plan::Transcode(c) => {
            let mut a = vec![s("-map"), s("0:v:0?"), s("-map"), s("0:a:0?"), s("-sn"), s("-dn")];
            if has_video {
                a.extend([s("-c:v"), s("libx264"), s("-preset"), s("veryfast"), s("-crf"), s("20"), s("-pix_fmt"), s("yuv420p")]);
            }
            match (*c, audio) {
                ("flac", _) => a.extend([s("-c:a"), s("flac")]),
                (_, Some(_)) | (_, None) => a.extend([s("-c:a"), s("aac"), s("-b:a"), s(if has_video { "192k" } else { "256k" })]),
            }
            if *c == "mp4" || *c == "m4a" { a.extend([s("-movflags"), s("+faststart")]); }
            a
        }
    }
}

/// Cache key for a file version (path + size + mtime), FNV-1a.
pub fn cache_key(path: &str, size: u64, mtime: u64) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in format!("{}|{size}|{mtime}", path.to_lowercase()).bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

/// Parse `out_time_us=` / `out_time_ms=` lines from `ffmpeg -progress`.
pub fn progress_percent(line: &str, duration_s: f64) -> Option<f64> {
    let v = line.strip_prefix("out_time_us=").or_else(|| line.strip_prefix("out_time_ms="))?;
    let us: f64 = v.trim().parse().ok()?;
    if duration_s <= 0.0 { return None; }
    Some(((us / 1_000_000.0) / duration_s * 100.0).clamp(0.0, 99.0))
}

// --- Native side -------------------------------------------------------------------

fn hidden(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let _ = cmd;
}

fn tool_ok(name: &str) -> bool {
    let mut c = Command::new(name);
    c.arg("-version").stdout(Stdio::null()).stderr(Stdio::null());
    hidden(&mut c);
    c.status().map(|s| s.success()).unwrap_or(false)
}

struct Probe { video: Option<String>, audio: Option<String>, duration: f64 }

fn probe(path: &str) -> Result<Probe, String> {
    let mut c = Command::new("ffprobe");
    c.args(["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", path]);
    hidden(&mut c);
    let out = c.output().map_err(|e| format!("ffprobe could not run: {e}"))?;
    if !out.status.success() {
        return Err(format!("not a media file ffprobe can read: {}", String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("")));
    }
    let v: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    let streams = v.get("streams").and_then(|s| s.as_array()).cloned().unwrap_or_default();
    let first = |kind: &str| streams.iter()
        .find(|s| s.get("codec_type").and_then(|t| t.as_str()) == Some(kind)
            // Cover art in audio files shows up as a video stream; ignore it.
            && !matches!(s.get("codec_name").and_then(|n| n.as_str()), Some("mjpeg" | "png" | "bmp")))
        .and_then(|s| s.get("codec_name").and_then(|n| n.as_str()).map(|n| n.to_string()));
    let duration = v.get("format").and_then(|f| f.get("duration")).and_then(|d| d.as_str()).and_then(|d| d.parse().ok()).unwrap_or(0.0);
    Ok(Probe { video: first("video"), audio: first("audio"), duration })
}

fn cache_dir(app: &tauri::AppHandle) -> PathBuf {
    let d = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from(".")).join("media-cache");
    let _ = std::fs::create_dir_all(&d);
    d
}

fn file_version(path: &str) -> Option<(u64, u64)> {
    let m = std::fs::metadata(path).ok()?;
    let mtime = m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
    Some((m.len(), mtime))
}

fn plan_name(p: &Plan) -> &'static str {
    match p { Plan::Direct => "direct", Plan::Remux(_) => "remux", Plan::Transcode(_) => "transcode" }
}

fn probe_channel(path: &str) -> Value {
    if !Path::new(path).is_file() { return json!({ "ok": false, "error": "file not found" }); }
    if !tool_ok("ffprobe") {
        // Without FFmpeg only the container can guide us.
        let direct = direct_container(&ext_of(path));
        return json!({ "ok": true, "plan": if direct { "direct" } else { "unavailable" }, "ffmpeg": false });
    }
    match probe(path) {
        Ok(p) => {
            let plan = decide(path, p.video.as_deref(), p.audio.as_deref());
            json!({ "ok": true, "plan": plan_name(&plan), "video": p.video, "audio": p.audio, "duration": p.duration, "ffmpeg": true })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

/// Keep the cache under the limit, oldest files first (never the one just made).
fn prune(dir: &Path, keep: &Path) {
    let mut files: Vec<(std::time::SystemTime, u64, PathBuf)> = std::fs::read_dir(dir).into_iter().flatten().flatten()
        .filter_map(|e| { let m = e.metadata().ok()?; if !m.is_file() { return None; } Some((m.modified().ok()?, m.len(), e.path())) })
        .collect();
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    files.sort_by_key(|f| f.0);
    for (_, len, p) in files {
        if total <= CACHE_LIMIT_BYTES { break; }
        if p == keep { continue; }
        if std::fs::remove_file(&p).is_ok() { total = total.saturating_sub(len); }
    }
}

fn prepare_channel(app: &tauri::AppHandle, path: &str) -> Value {
    if !Path::new(path).is_file() { return json!({ "ok": false, "error": "file not found" }); }
    let Some((size, mtime)) = file_version(path) else { return json!({ "ok": false, "error": "file not readable" }) };
    if !tool_ok("ffmpeg") || !tool_ok("ffprobe") {
        return json!({ "ok": false, "needsFfmpeg": true, "error": "Playing this format needs FFmpeg. Install it once (for example: winget install Gyan.FFmpeg), then open the file again." });
    }
    let p = match probe(path) { Ok(p) => p, Err(e) => return json!({ "ok": false, "error": e }) };
    let plan = decide(path, p.video.as_deref(), p.audio.as_deref());
    let ext = match plan { Plan::Direct => return json!({ "ok": true, "status": "ready", "path": path, "plan": "direct" }), Plan::Remux(e) | Plan::Transcode(e) => e };
    let out = cache_dir(app).join(format!("{}.{ext}", cache_key(path, size, mtime)));
    if out.is_file() && std::fs::metadata(&out).map(|m| m.len() > 0).unwrap_or(false) {
        // Touch it so pruning keeps recently played files.
        let _ = std::fs::File::options().append(true).open(&out).and_then(|f| f.set_modified(std::time::SystemTime::now()));
        return json!({ "ok": true, "status": "ready", "path": out.to_string_lossy(), "plan": plan_name(&plan) });
    }
    let id = crate::util::pseudo_uuid_v4();
    let tmp = out.with_extension(format!("part.{ext}"));
    let (app2, id2, src, dur, has_video, audio) = (app.clone(), id.clone(), path.to_string(), p.duration, p.video.is_some(), p.audio.clone());
    let plan2 = plan.clone();
    crate::util::spawn_named("media-prepare", move || {
        let mut args: Vec<String> = vec!["-y".into(), "-hide_banner".into(), "-nostats".into(), "-progress".into(), "pipe:1".into(), "-i".into(), src.clone()];
        args.extend(ffmpeg_args(&plan2, has_video, audio.as_deref()));
        args.push(tmp.to_string_lossy().to_string());
        let mut c = Command::new("ffmpeg");
        c.args(&args).stdout(Stdio::piped()).stderr(Stdio::piped());
        hidden(&mut c);
        let result = match c.spawn() {
            Err(e) => Err(format!("ffmpeg could not start: {e}")),
            Ok(mut child) => {
                // Drain stderr on its own thread so a chatty encoder can never block.
                let err_tail = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
                if let Some(stderr) = child.stderr.take() {
                    let tail = err_tail.clone();
                    std::thread::spawn(move || {
                        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                            if let Ok(mut t) = tail.lock() { *t = line; }
                        }
                    });
                }
                let mut last = -1.0;
                if let Some(stdout) = child.stdout.take() {
                    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                        if let Some(pct) = progress_percent(&line, dur) {
                            if pct - last >= 1.0 {
                                last = pct;
                                crate::native_ops::emit_event(&app2, "media:prepare-progress", &json!({ "id": id2, "percent": pct.round() }));
                            }
                        }
                    }
                }
                match child.wait() {
                    Ok(s) if s.success() => std::fs::rename(&tmp, &out).map_err(|e| e.to_string()),
                    Ok(_) => Err(format!("ffmpeg could not convert this file: {}", err_tail.lock().map(|t| t.clone()).unwrap_or_default())),
                    Err(e) => Err(e.to_string()),
                }
            }
        };
        let _ = std::fs::remove_file(&tmp);
        match result {
            Ok(()) => {
                if let Some(dir) = out.parent() { prune(dir, &out); }
                crate::native_ops::emit_event(&app2, "media:prepare-done", &json!({ "id": id2, "ok": true, "path": out.to_string_lossy() }));
            }
            Err(e) => crate::native_ops::emit_event(&app2, "media:prepare-done", &json!({ "id": id2, "ok": false, "error": e })),
        }
    });
    json!({ "ok": true, "status": "working", "id": id, "plan": plan_name(&plan) })
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    let path = a0.get("path").and_then(|v| v.as_str()).or_else(|| a0.as_str()).unwrap_or("").to_string();
    match channel {
        "media:probe" => probe_channel(&path),
        "media:prepare" => prepare_channel(app, &path),
        "media:cacheInfo" => {
            let dir = cache_dir(app);
            let (n, bytes) = std::fs::read_dir(&dir).into_iter().flatten().flatten()
                .filter_map(|e| e.metadata().ok().filter(|m| m.is_file()).map(|m| m.len()))
                .fold((0u64, 0u64), |(n, b), l| (n + 1, b + l));
            json!({ "files": n, "bytes": bytes, "limit": CACHE_LIMIT_BYTES })
        }
        "media:clearCache" => {
            let dir = cache_dir(app);
            let removed = std::fs::read_dir(&dir).into_iter().flatten().flatten().filter(|e| std::fs::remove_file(e.path()).is_ok()).count();
            json!({ "ok": true, "removed": removed })
        }
        _ => json!({ "ok": false, "error": format!("unknown channel {channel}") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decides_direct_remux_or_transcode() {
        assert_eq!(decide("a.mp4", Some("h264"), Some("aac")), Plan::Direct);
        assert_eq!(decide("a.webm", Some("vp9"), Some("opus")), Plan::Direct);
        assert_eq!(decide("a.mkv", Some("h264"), Some("aac")), Plan::Remux("mp4"));
        assert_eq!(decide("a.mkv", Some("vp9"), Some("opus")), Plan::Remux("webm"));
        assert_eq!(decide("a.mkv", Some("h264"), Some("ac3")), Plan::Transcode("mp4"));
        assert_eq!(decide("a.mp4", Some("hevc"), Some("aac")), Plan::Transcode("mp4"));
        assert_eq!(decide("a.avi", Some("mpeg4"), Some("mp3")), Plan::Transcode("mp4"));
        assert_eq!(decide("a.wmv", Some("wmv2"), Some("wmav2")), Plan::Transcode("mp4"));
    }

    #[test]
    fn audio_only_keeps_quality() {
        assert_eq!(decide("a.mp3", None, Some("mp3")), Plan::Direct);
        assert_eq!(decide("a.flac", None, Some("flac")), Plan::Direct);
        assert_eq!(decide("a.wma", None, Some("wmav2")), Plan::Transcode("m4a"));
        assert_eq!(decide("a.ape", None, Some("ape")), Plan::Transcode("flac"));
        assert_eq!(decide("a.m4a", None, Some("alac")), Plan::Transcode("flac"));
        assert_eq!(decide("a.aiff", None, Some("pcm_s16be")), Plan::Transcode("flac"));
        assert_eq!(decide("a.mka", None, Some("opus")), Plan::Remux("ogg"));
    }

    #[test]
    fn remux_copies_and_transcode_encodes() {
        let r = ffmpeg_args(&Plan::Remux("mp4"), true, Some("aac"));
        assert!(r.windows(2).any(|w| w == ["-c", "copy"]));
        assert!(r.contains(&"+faststart".to_string()));
        let t = ffmpeg_args(&Plan::Transcode("mp4"), true, Some("ac3"));
        assert!(t.windows(2).any(|w| w == ["-c:v", "libx264"]));
        assert!(t.windows(2).any(|w| w == ["-c:a", "aac"]));
        let f = ffmpeg_args(&Plan::Transcode("flac"), false, Some("ape"));
        assert!(f.windows(2).any(|w| w == ["-c:a", "flac"]));
        assert!(!f.contains(&"libx264".to_string()));
    }

    #[test]
    fn progress_and_cache_key() {
        assert_eq!(progress_percent("out_time_us=5000000", 10.0), Some(50.0));
        assert_eq!(progress_percent("out_time_us=99000000", 10.0), Some(99.0));
        assert_eq!(progress_percent("frame=10", 10.0), None);
        assert_ne!(cache_key("C:\\a.mkv", 1, 2), cache_key("C:\\a.mkv", 1, 3));
        assert_eq!(cache_key("C:\\A.mkv", 1, 2), cache_key("c:\\a.mkv", 1, 2));
    }

    /// End to end with the real FFmpeg (skipped when it is not installed):
    /// make an AVI with MPEG-4 video + MP3 audio, which WebView2 cannot play, and
    /// convert it to H.264/AAC MP4.
    #[test]
    fn converts_a_real_avi_when_ffmpeg_is_installed() {
        if !tool_ok("ffmpeg") || !tool_ok("ffprobe") { return; }
        let dir = std::env::temp_dir().join(format!("dex-media-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("clip.avi");
        let mut mk = Command::new("ffmpeg");
        mk.args(["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10", "-f", "lavfi", "-i", "sine=frequency=440",
            "-t", "2", "-c:v", "mpeg4", "-c:a", "libmp3lame", src.to_str().unwrap()]);
        hidden(&mut mk);
        assert!(mk.status().unwrap().success());
        let p = probe(src.to_str().unwrap()).unwrap();
        assert_eq!((p.video.as_deref(), p.audio.as_deref()), (Some("mpeg4"), Some("mp3")));
        let plan = decide(src.to_str().unwrap(), p.video.as_deref(), p.audio.as_deref());
        assert_eq!(plan, Plan::Transcode("mp4"));
        let out = dir.join("out.mp4");
        let mut args: Vec<String> = vec!["-y".into(), "-v".into(), "error".into(), "-i".into(), src.to_string_lossy().to_string()];
        args.extend(ffmpeg_args(&plan, true, Some("mp3")));
        args.push(out.to_string_lossy().to_string());
        let mut c = Command::new("ffmpeg");
        c.args(&args);
        hidden(&mut c);
        assert!(c.status().unwrap().success());
        let q = probe(out.to_str().unwrap()).unwrap();
        assert_eq!((q.video.as_deref(), q.audio.as_deref()), (Some("h264"), Some("aac")));
        assert_eq!(decide(out.to_str().unwrap(), q.video.as_deref(), q.audio.as_deref()), Plan::Direct);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
