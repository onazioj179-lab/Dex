// =============================================================================
// DEX Tauri — Video subsystem port (video:getMetadata, video:getThumbnail,
// video:process, video:transcode).
//
// SOURCE / SHAPE BINDING
// ----------------------
// `src/main/core/VideoProcessing.ts` does NOT exist in this repo (verified). The
// only real video-metadata surface in Electron is the NATIVE napi module exposed
// through `src/main/native/bridge.ts` (NativeVideo.getMetadata / .probe), wired
// at `native:video-metadata` / `native:media-probe` in main.ts. Its return shape
// is the authoritative contract (native/index.d.ts + src/main/native/types.ts):
//
//   VideoMetadata { durationSecs, width, height, fps, codec, audioCodec,
//                   audioChannels, audioSampleRate, bitrateKbps, fileSize,
//                   container, hasAudio, hasVideo }
//
// The native module docstring says it "supports MP4/MOV containers natively. For
// other formats, returns basic info from file size estimation." We reproduce
// exactly that behaviour HERE, in pure Rust, with no new dependency:
//   - MP4 / MOV (ISO-BMFF): walk the atom tree (moov/mvhd/trak/tkhd/mdia/mdhd/
//     hdlr/minf/stbl/stsd) and read real width/height/duration/codec/track info.
//   - Anything else: honest file-size estimation with the same field set.
//
// getThumbnail / process / transcode have no JS handler to port (no
// VideoProcessing.ts), and they are inherently codec work. The faithful native
// path is the system `ffmpeg`/`ffprobe` toolchain (std::process::Command, hidden
// console — precedent: power.rs `run`). When that toolchain is present we do the
// REAL operation (extract a frame, run a filter graph, transcode). When it is
// absent we DO NOT fake it: object channels return { success:false, error } and
// the renderer degrades. This is the same honest-degrade contract used elsewhere.
//
// No new crates: serde_json, std, tauri, crate::util, crate::native_ops only.
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/// Route a `video:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts): `args.get(0)` is the first positional argument.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // ---- REAL: native container parsing (MP4/MOV) + size estimation -----
        "video:getMetadata" => {
            let path = match str_arg(args, 0) {
                Some(p) => p,
                None => return json!({ "success": false, "error": "missing file path" }),
            };
            get_metadata(&path)
        }

        // ---- REAL where ffmpeg present, else honest degrade -----------------
        "video:getThumbnail" => {
            let path = match str_arg(args, 0) {
                Some(p) => p,
                None => return json!({ "success": false, "error": "missing file path" }),
            };
            // optional opts object: { timeSecs?, width? }
            let opts = args.get(1).cloned().unwrap_or(Value::Null);
            get_thumbnail(app, &path, &opts)
        }

        "video:process" => {
            let path = match str_arg(args, 0) {
                Some(p) => p,
                None => return json!({ "success": false, "error": "missing file path" }),
            };
            let opts = args.get(1).cloned().unwrap_or(Value::Null);
            process_video(app, &path, &opts)
        }

        "video:transcode" => {
            let path = match str_arg(args, 0) {
                Some(p) => p,
                None => return json!({ "success": false, "error": "missing file path" }),
            };
            let opts = args.get(1).cloned().unwrap_or(Value::Null);
            transcode_video(app, &path, &opts)
        }

        // Any other video:* channel (e.g. real VideoPlayerSystem playback
        // channels) is out of scope for this data-tier port.
        _ => Value::Null,
    }
}

// ---------------------------------------------------------------------------
// Arg helpers
// ---------------------------------------------------------------------------

fn str_arg(args: &Value, idx: usize) -> Option<String> {
    args.get(idx)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// video:getMetadata — real MP4/MOV atom parsing, else size estimation.
// Returns the exact VideoMetadata shape (see header) on success.
// ---------------------------------------------------------------------------

fn get_metadata(path: &str) -> Value {
    let p = Path::new(path);
    let file_size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    if file_size == 0 && !p.exists() {
        return json!({ "success": false, "error": "file not found" });
    }

    let container = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    // ISO-BMFF containers we can parse natively.
    let iso = matches!(container.as_str(), "mp4" | "m4v" | "mov" | "qt" | "m4a");
    if iso {
        if let Some(meta) = parse_iso_bmff(p, file_size, &container) {
            return meta;
        }
    }

    // Other formats: file-size estimation (matches the native docstring).
    estimate_metadata(file_size, &container)
}

/// Best-effort metadata for formats we don't parse: identical field set, values
/// derived only from file size + extension. Mirrors the native "basic info from
/// file size estimation" fallback so the renderer always gets a usable shape.
fn estimate_metadata(file_size: u64, container: &str) -> Value {
    let has_video = !matches!(container, "mp3" | "wav" | "flac" | "ogg" | "aac" | "m4a");
    // Assume a rough ~1.5 Mbps average bitrate to estimate duration from size.
    let bitrate_kbps: u64 = if has_video { 1500 } else { 192 };
    let duration_secs = if bitrate_kbps > 0 {
        (file_size as f64 * 8.0) / (bitrate_kbps as f64 * 1000.0)
    } else {
        0.0
    };
    json!({
        "success": true,
        "estimated": true,
        "durationSecs": round2(duration_secs),
        "width": 0,
        "height": 0,
        "fps": 0.0,
        "codec": "unknown",
        "audioCodec": if has_video { "unknown" } else { container },
        "audioChannels": 0,
        "audioSampleRate": 0,
        "bitrateKbps": bitrate_kbps,
        "fileSize": file_size,
        "container": container,
        "hasAudio": true,
        "hasVideo": has_video,
    })
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

// --- ISO base media file format (MP4/MOV) atom walker ----------------------
//
// We do a bounded scan of the top-level boxes to find `moov`, then walk into it
// for `mvhd` (timescale + duration) and each `trak` (tkhd for w/h, mdia/mdhd for
// per-track timescale/duration, hdlr for track type, stbl/stsd for the codec
// fourcc). This is enough for real width/height/duration/codec without a crate.

struct IsoState {
    timescale: u32,
    duration_units: u64,
    width: u32,
    height: u32,
    video_codec: Option<String>,
    audio_codec: Option<String>,
    audio_channels: u16,
    audio_sample_rate: u32,
    has_video: bool,
    has_audio: bool,
    // per-track context while walking
    cur_track_kind: TrackKind,
    cur_media_timescale: u32,
    cur_media_duration: u64,
}

#[derive(Clone, Copy, PartialEq)]
enum TrackKind {
    Unknown,
    Video,
    Audio,
}

fn parse_iso_bmff(path: &Path, file_size: u64, container: &str) -> Option<Value> {
    use std::io::Read;
    // Read up to the first 8 MiB — moov is almost always within that even when
    // it trails (it carries the small metadata, not the media samples we skip).
    let mut f = std::fs::File::open(path).ok()?;
    let cap = std::cmp::min(file_size, 8 * 1024 * 1024) as usize;
    let mut buf = vec![0u8; cap.max(8)];
    let n = f.read(&mut buf).ok()?;
    buf.truncate(n);

    let mut st = IsoState {
        timescale: 0,
        duration_units: 0,
        width: 0,
        height: 0,
        video_codec: None,
        audio_codec: None,
        audio_channels: 0,
        audio_sample_rate: 0,
        has_video: false,
        has_audio: false,
        cur_track_kind: TrackKind::Unknown,
        cur_media_timescale: 0,
        cur_media_duration: 0,
    };

    // Find moov at the top level, then walk it.
    let mut offset = 0usize;
    while offset + 8 <= buf.len() {
        let (size, fourcc, header_len) = read_box_header(&buf, offset)?;
        let body_start = offset + header_len;
        let body_end = if size == 0 {
            buf.len()
        } else {
            std::cmp::min(offset + size, buf.len())
        };
        if &fourcc == b"moov" && body_start <= body_end {
            walk_container(&buf[body_start..body_end], &mut st);
        }
        if size == 0 {
            break;
        }
        offset = offset.saturating_add(size);
        if size < header_len {
            break;
        }
    }

    if st.timescale == 0 && st.duration_units == 0 && st.width == 0 {
        // Couldn't parse anything meaningful — fall back to estimation.
        return None;
    }

    let duration_secs = if st.timescale > 0 {
        st.duration_units as f64 / st.timescale as f64
    } else {
        0.0
    };
    let bitrate_kbps = if duration_secs > 0.0 {
        ((file_size as f64 * 8.0) / duration_secs / 1000.0).round() as u64
    } else {
        0
    };

    Some(json!({
        "success": true,
        "estimated": false,
        "durationSecs": round2(duration_secs),
        "width": st.width,
        "height": st.height,
        "fps": 0.0, // requires stts sample-table math; left 0 (honest, native also approximates)
        "codec": st.video_codec.clone().unwrap_or_else(|| "unknown".into()),
        "audioCodec": st.audio_codec.clone().unwrap_or_else(|| "none".into()),
        "audioChannels": st.audio_channels,
        "audioSampleRate": st.audio_sample_rate,
        "bitrateKbps": bitrate_kbps,
        "fileSize": file_size,
        "container": container,
        "hasAudio": st.has_audio,
        "hasVideo": st.has_video,
    }))
}

/// Read a box header at `off`. Returns (total_size, fourcc, header_len).
/// Handles the 64-bit extended size (size == 1 -> 8-byte largesize follows).
fn read_box_header(buf: &[u8], off: usize) -> Option<(usize, [u8; 4], usize)> {
    if off + 8 > buf.len() {
        return None;
    }
    let size32 = u32::from_be_bytes([buf[off], buf[off + 1], buf[off + 2], buf[off + 3]]) as usize;
    let mut fourcc = [0u8; 4];
    fourcc.copy_from_slice(&buf[off + 4..off + 8]);
    if size32 == 1 {
        if off + 16 > buf.len() {
            return None;
        }
        let large = u64::from_be_bytes([
            buf[off + 8],
            buf[off + 9],
            buf[off + 10],
            buf[off + 11],
            buf[off + 12],
            buf[off + 13],
            buf[off + 14],
            buf[off + 15],
        ]) as usize;
        Some((large, fourcc, 16))
    } else {
        // size32 == 0 means "to end of file"; caller handles that.
        Some((size32, fourcc, 8))
    }
}

/// Walk a container box body, dispatching known child boxes.
fn walk_container(body: &[u8], st: &mut IsoState) {
    let mut off = 0usize;
    while off + 8 <= body.len() {
        let (size, fourcc, hlen) = match read_box_header(body, off) {
            Some(v) => v,
            None => break,
        };
        let child_start = off + hlen;
        let child_end = if size == 0 {
            body.len()
        } else {
            std::cmp::min(off + size, body.len())
        };
        if child_start > child_end {
            break;
        }
        let child = &body[child_start..child_end];

        match &fourcc {
            b"mvhd" => parse_mvhd(child, st),
            b"trak" => {
                // Reset per-track context, then recurse.
                st.cur_track_kind = TrackKind::Unknown;
                st.cur_media_timescale = 0;
                st.cur_media_duration = 0;
                walk_container(child, st);
            }
            b"tkhd" => parse_tkhd(child, st),
            b"mdia" => walk_container(child, st),
            b"mdhd" => parse_mdhd(child, st),
            b"hdlr" => parse_hdlr(child, st),
            b"minf" => walk_container(child, st),
            b"stbl" => walk_container(child, st),
            b"stsd" => parse_stsd(child, st),
            _ => {}
        }

        if size == 0 {
            break;
        }
        off = off.saturating_add(size);
        if size < hlen {
            break;
        }
    }
}

fn read_u32(b: &[u8], o: usize) -> u32 {
    if o + 4 > b.len() {
        return 0;
    }
    u32::from_be_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

fn read_u16(b: &[u8], o: usize) -> u16 {
    if o + 2 > b.len() {
        return 0;
    }
    u16::from_be_bytes([b[o], b[o + 1]])
}

fn read_u64(b: &[u8], o: usize) -> u64 {
    if o + 8 > b.len() {
        return 0;
    }
    u64::from_be_bytes([
        b[o],
        b[o + 1],
        b[o + 2],
        b[o + 3],
        b[o + 4],
        b[o + 5],
        b[o + 6],
        b[o + 7],
    ])
}

// mvhd: version(1) flags(3) [v0: ctime(4) mtime(4) timescale(4) duration(4)]
//                           [v1: ctime(8) mtime(8) timescale(4) duration(8)]
fn parse_mvhd(b: &[u8], st: &mut IsoState) {
    if b.is_empty() {
        return;
    }
    let version = b[0];
    if version == 1 {
        st.timescale = read_u32(b, 4 + 16);
        st.duration_units = read_u64(b, 4 + 20);
    } else {
        st.timescale = read_u32(b, 4 + 8);
        st.duration_units = read_u32(b, 4 + 12) as u64;
    }
}

// tkhd: version/flags(4) then times; track width/height are the LAST two 32-bit
// fixed-point (16.16) fields of the box. We read them from the tail to avoid the
// version-dependent middle layout.
fn parse_tkhd(b: &[u8], st: &mut IsoState) {
    if b.len() < 8 {
        return;
    }
    let w_fixed = read_u32(b, b.len() - 8);
    let h_fixed = read_u32(b, b.len() - 4);
    let w = w_fixed >> 16;
    let h = h_fixed >> 16;
    // Keep the largest track dimensions (the video track), ignore 0x0 tracks.
    if w > st.width {
        st.width = w;
    }
    if h > st.height {
        st.height = h;
    }
}

// mdhd: version/flags(4) [v0: ctime(4) mtime(4) timescale(4) duration(4)]
//                        [v1: ctime(8) mtime(8) timescale(4) duration(8)]
fn parse_mdhd(b: &[u8], st: &mut IsoState) {
    if b.is_empty() {
        return;
    }
    let version = b[0];
    if version == 1 {
        st.cur_media_timescale = read_u32(b, 4 + 16);
        st.cur_media_duration = read_u64(b, 4 + 20);
    } else {
        st.cur_media_timescale = read_u32(b, 4 + 8);
        st.cur_media_duration = read_u32(b, 4 + 12) as u64;
    }
    // If the movie header had no timescale (rare), borrow the first track's.
    if st.timescale == 0 && st.cur_media_timescale > 0 {
        st.timescale = st.cur_media_timescale;
        st.duration_units = st.cur_media_duration;
    }
}

// hdlr: version/flags(4) pre_defined(4) handler_type(4)['vide'|'soun'] ...
fn parse_hdlr(b: &[u8], st: &mut IsoState) {
    if b.len() < 12 {
        return;
    }
    let handler = &b[8..12];
    match handler {
        b"vide" => {
            st.cur_track_kind = TrackKind::Video;
            st.has_video = true;
        }
        b"soun" => {
            st.cur_track_kind = TrackKind::Audio;
            st.has_audio = true;
        }
        _ => st.cur_track_kind = TrackKind::Unknown,
    }
}

// stsd: version/flags(4) entry_count(4) then sample entries. The first entry's
// box header carries the codec fourcc; for audio entries the entry body also has
// channel count + sample rate.
fn parse_stsd(b: &[u8], st: &mut IsoState) {
    if b.len() < 8 {
        return;
    }
    // First sample entry starts at offset 8 (after version/flags + entry_count).
    let entry_off = 8usize;
    if entry_off + 8 > b.len() {
        return;
    }
    let mut fourcc = [0u8; 4];
    fourcc.copy_from_slice(&b[entry_off + 4..entry_off + 8]);
    let codec = fourcc_to_codec(&fourcc);

    match st.cur_track_kind {
        TrackKind::Video => {
            if st.video_codec.is_none() {
                st.video_codec = Some(codec);
            }
        }
        TrackKind::Audio => {
            if st.audio_codec.is_none() {
                st.audio_codec = Some(codec);
            }
            // AudioSampleEntry layout: 8 (box hdr) + 6 reserved + 2 data_ref
            //   + 8 reserved + 2 channelcount + 2 samplesize + 2 predefined
            //   + 2 reserved + 4 samplerate(16.16 fixed)
            let body = entry_off + 8; // start of audio entry body
            let chan = read_u16(b, body + 16);
            let rate_fixed = read_u32(b, body + 24);
            if chan > 0 {
                st.audio_channels = chan;
            }
            if rate_fixed > 0 {
                st.audio_sample_rate = rate_fixed >> 16;
            }
        }
        TrackKind::Unknown => {}
    }
}

/// Map a sample-entry fourcc to a friendly codec name (best-effort, common set).
fn fourcc_to_codec(fourcc: &[u8; 4]) -> String {
    let raw = String::from_utf8_lossy(fourcc).trim().to_string();
    match raw.as_str() {
        "avc1" | "avc3" => "h264".into(),
        "hvc1" | "hev1" => "hevc".into(),
        "vp08" => "vp8".into(),
        "vp09" => "vp9".into(),
        "av01" => "av1".into(),
        "mp4v" => "mpeg4".into(),
        "mp4a" => "aac".into(),
        ".mp3" | "mp3 " => "mp3".into(),
        "ac-3" => "ac3".into(),
        "ec-3" => "eac3".into(),
        "alac" => "alac".into(),
        "Opus" | "opus" => "opus".into(),
        other if other.is_empty() => "unknown".into(),
        other => other.to_string(),
    }
}

// ---------------------------------------------------------------------------
// ffmpeg / ffprobe toolchain helpers (for thumbnail / process / transcode).
// ---------------------------------------------------------------------------

/// True if `program --version` (or `-version` for ffmpeg) runs successfully.
fn tool_present(program: &str, version_flag: &str) -> bool {
    let mut cmd = std::process::Command::new(program);
    cmd.arg(version_flag);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

/// Run a tool with args, hidden console; return (success, stderr).
fn run_tool(program: &str, args: &[String]) -> (bool, String) {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    match cmd.output() {
        Ok(o) => (
            o.status.success(),
            String::from_utf8_lossy(&o.stderr).to_string(),
        ),
        Err(e) => (false, e.to_string()),
    }
}

/// Per-subsystem output directory under app data: <app_data>/video/out.
fn out_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let dir = base.join("video").join("out");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

// ---------------------------------------------------------------------------
// video:getThumbnail — extract one frame via ffmpeg, write JPEG to app data.
// opts: { timeSecs?: number, width?: number }
// ---------------------------------------------------------------------------

fn get_thumbnail(app: &tauri::AppHandle, path: &str, opts: &Value) -> Value {
    if !Path::new(path).exists() {
        return json!({ "success": false, "error": "file not found" });
    }
    if !tool_present("ffmpeg", "-version") {
        return json!({
            "success": false,
            "error": "not ported (needs native runtime): ffmpeg not found on PATH"
        });
    }

    let time_secs = opts.get("timeSecs").and_then(|v| v.as_f64()).unwrap_or(1.0);
    let width = opts
        .get("width")
        .and_then(|v| v.as_i64())
        .filter(|w| *w > 0)
        .unwrap_or(320);

    let id = crate::util::pseudo_uuid_v4();
    let out_path = out_dir(app).join(format!("thumb-{id}.jpg"));
    let out_str = out_path.to_string_lossy().to_string();

    let args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        format!("{time_secs}"),
        "-i".to_string(),
        path.to_string(),
        "-frames:v".to_string(),
        "1".to_string(),
        "-vf".to_string(),
        format!("scale={width}:-1"),
        out_str.clone(),
    ];
    let (ok, stderr) = run_tool("ffmpeg", &args);
    if !ok {
        return json!({ "success": false, "error": format!("ffmpeg failed: {}", tail(&stderr)) });
    }

    // Inline the frame as a data URL so the renderer can display it directly.
    let data_url = std::fs::read(&out_path)
        .ok()
        .map(|bytes| format!("data:image/jpeg;base64,{}", b64(&bytes)));

    json!({
        "success": true,
        "path": out_str,
        "dataUrl": data_url,
        "timeSecs": time_secs,
        "width": width,
        "generatedAt": now_ms(),
    })
}

// ---------------------------------------------------------------------------
// video:process — apply a simple filter graph via ffmpeg.
// opts: { op: "trim"|"scale"|"crop"|"mute"|"extractAudio", ... , format? }
// Emits "video:process-progress" / "video:process-done" renderer events.
// ---------------------------------------------------------------------------

fn process_video(app: &tauri::AppHandle, path: &str, opts: &Value) -> Value {
    if !Path::new(path).exists() {
        return json!({ "success": false, "error": "file not found" });
    }
    if !tool_present("ffmpeg", "-version") {
        return json!({
            "success": false,
            "error": "not ported (needs native runtime): ffmpeg not found on PATH"
        });
    }

    let op = opts
        .get("op")
        .and_then(|v| v.as_str())
        .unwrap_or("scale")
        .to_string();

    let in_ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_string();
    let out_ext = opts
        .get("format")
        .and_then(|v| v.as_str())
        .unwrap_or(&in_ext)
        .to_string();

    let id = crate::util::pseudo_uuid_v4();
    let out_path = out_dir(app).join(format!("proc-{id}.{out_ext}"));
    let out_str = out_path.to_string_lossy().to_string();

    let mut args: Vec<String> = vec!["-y".into(), "-i".into(), path.to_string()];
    match op.as_str() {
        "trim" => {
            if let Some(start) = opts.get("startSecs").and_then(|v| v.as_f64()) {
                args.push("-ss".into());
                args.push(format!("{start}"));
            }
            if let Some(dur) = opts.get("durationSecs").and_then(|v| v.as_f64()) {
                args.push("-t".into());
                args.push(format!("{dur}"));
            }
            args.push("-c".into());
            args.push("copy".into());
        }
        "scale" => {
            let w = opts.get("width").and_then(|v| v.as_i64()).unwrap_or(1280);
            args.push("-vf".into());
            args.push(format!("scale={w}:-2"));
        }
        "crop" => {
            let w = opts.get("width").and_then(|v| v.as_i64()).unwrap_or(0);
            let h = opts.get("height").and_then(|v| v.as_i64()).unwrap_or(0);
            let x = opts.get("x").and_then(|v| v.as_i64()).unwrap_or(0);
            let y = opts.get("y").and_then(|v| v.as_i64()).unwrap_or(0);
            args.push("-vf".into());
            args.push(format!("crop={w}:{h}:{x}:{y}"));
        }
        "mute" => {
            args.push("-an".into());
            args.push("-c:v".into());
            args.push("copy".into());
        }
        "extractAudio" => {
            args.push("-vn".into());
            args.push("-acodec".into());
            args.push("copy".into());
        }
        other => {
            return json!({ "success": false, "error": format!("unknown op: {other}") });
        }
    }
    args.push(out_str.clone());

    crate::native_ops::emit_event(
        app,
        "video:process-progress",
        &json!({ "id": id, "op": op, "status": "running" }),
    );

    let (ok, stderr) = run_tool("ffmpeg", &args);
    let result = if ok {
        let size = std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);
        json!({
            "success": true,
            "id": id,
            "op": op,
            "output": out_str,
            "fileSize": size,
            "finishedAt": now_ms(),
        })
    } else {
        json!({ "success": false, "id": id, "op": op, "error": format!("ffmpeg failed: {}", tail(&stderr)) })
    };

    crate::native_ops::emit_event(app, "video:process-done", &result);
    result
}

// ---------------------------------------------------------------------------
// video:transcode — change container/codec via ffmpeg.
// opts: { format?: "mp4"|"webm"|"mkv"|..., videoCodec?, audioCodec?,
//         crf?, preset? }
// Emits "video:transcode-progress" / "video:transcode-done" events.
// ---------------------------------------------------------------------------

fn transcode_video(app: &tauri::AppHandle, path: &str, opts: &Value) -> Value {
    if !Path::new(path).exists() {
        return json!({ "success": false, "error": "file not found" });
    }
    if !tool_present("ffmpeg", "-version") {
        return json!({
            "success": false,
            "error": "not ported (needs native runtime): ffmpeg not found on PATH"
        });
    }

    let format = opts
        .get("format")
        .and_then(|v| v.as_str())
        .unwrap_or("mp4")
        .to_string();
    let vcodec = opts
        .get("videoCodec")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let acodec = opts
        .get("audioCodec")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let crf = opts.get("crf").and_then(|v| v.as_i64());
    let preset = opts.get("preset").and_then(|v| v.as_str());

    let id = crate::util::pseudo_uuid_v4();
    let out_path = out_dir(app).join(format!("xcode-{id}.{format}"));
    let out_str = out_path.to_string_lossy().to_string();

    let mut args: Vec<String> = vec!["-y".into(), "-i".into(), path.to_string()];
    if let Some(vc) = &vcodec {
        args.push("-c:v".into());
        args.push(vc.clone());
    }
    if let Some(ac) = &acodec {
        args.push("-c:a".into());
        args.push(ac.clone());
    }
    if let Some(c) = crf {
        args.push("-crf".into());
        args.push(format!("{c}"));
    }
    if let Some(p) = preset {
        args.push("-preset".into());
        args.push(p.to_string());
    }
    args.push(out_str.clone());

    crate::native_ops::emit_event(
        app,
        "video:transcode-progress",
        &json!({ "id": id, "format": format, "status": "running" }),
    );

    let started = now_ms();
    let (ok, stderr) = run_tool("ffmpeg", &args);
    let result = if ok {
        let size = std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);
        json!({
            "success": true,
            "id": id,
            "format": format,
            "output": out_str,
            "fileSize": size,
            "elapsedMs": now_ms() - started,
            "finishedAt": now_ms(),
        })
    } else {
        json!({ "success": false, "id": id, "format": format, "error": format!("ffmpeg failed: {}", tail(&stderr)) })
    };

    crate::native_ops::emit_event(app, "video:transcode-done", &result);
    result
}

// ---------------------------------------------------------------------------
// Tiny utilities (no deps): base64 encode + stderr tail.
// ---------------------------------------------------------------------------

/// Standard base64 (RFC 4648) encoder — small, dependency-free.
fn b64(input: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(T[((n >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(T[(n & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// Last ~400 chars of an ffmpeg stderr blob, for a compact error message.
fn tail(s: &str) -> String {
    let t = s.trim();
    if t.len() <= 400 {
        t.to_string()
    } else {
        let start = t.len() - 400;
        // Snap to a char boundary.
        let mut idx = start;
        while idx < t.len() && !t.is_char_boundary(idx) {
            idx += 1;
        }
        t[idx..].to_string()
    }
}
