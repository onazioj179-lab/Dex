// =============================================================================
// DEX Tauri — Universal Media Engine (port of src/main/core/UniversalMediaEngine.ts).
//
// The first round ported only the two pure-data capability handlers
// (engine:getCapabilities / engine:getSupportedFormats). This round extends the
// module with the rest of the channels that can run as REAL native code:
//
//   - engine:getConfig    -> the live EngineConfig, file-backed
//   - engine:updateConfig -> merge + persist EngineConfig, emit `configUpdated`
//   - engine:getStats     -> real EngineStats (active/streaming sources from the
//                            session source registry; cpu from sysinfo)
//   - engine:load         -> stat the file, classify by extension, register the
//                            source, emit `sourceLoaded` (real fs + bookkeeping)
//   - engine:canPlay      -> extension support test
//   - engine:getFormat    -> FormatSupport for a path
//
// PERSISTENCE — Electron stored config at
// `userData/media-engine/config.json` and recomputed it from defaults on load.
// We reproduce that exact file (same directory name, same JSON shape) under the
// Tauri app-data dir, with the same defaults and the same shallow-merge update
// semantics. SOURCE state in Electron was an in-process Map<id, MediaSource>
// rebuilt every launch; here it lives in the native KV store under "engine-
// sources" (crate::kv_get / crate::kv_set), the same backbone the other ported
// subsystems use, so getStats / load / unload stay consistent across IPC calls.
//
// HONEST DEGRADES (NOT faked) — these channels need a media runtime that is not
// present and that we may not add a dependency for:
//   - engine:transcode / engine:analyze — require ffmpeg/codec libraries to
//     decode + re-encode or probe streams. No such native runtime is bundled and
//     no new crate is allowed, so they return { success:false, error:... }.
//   - engine:play — playback is a renderer concern (<video>/<audio> elements);
//     there is no main-process player to drive and the channel does not exist in
//     the Electron source. Honest degrade.
//   - engine:render / engine:thumbnail — Electron used `nativeImage` (Chromium's
//     image codecs) to decode + resize + re-encode to a data URL. Without an
//     image codec crate this cannot be done natively, so they degrade rather than
//     return a broken/empty image.
//   - engine:stream / engine:readChunk / engine:closeStream — chunked file
//     streaming returned Node Buffers over IPC; the renderer can read files via
//     the fs namespace directly, and reproducing the Buffer-over-IPC contract
//     natively is out of scope for this round. Degrade.
//
// Channels & shapes are taken verbatim from the Electron handlers; see each fn.
// Args are the positional JSON array the renderer sent (args.get(0)...).
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

// Extension -> mime tables, kept in Electron declaration order. The capability
// channels surface only the keys; the full pairs are retained so getFormat /
// getMimeType return the same mime strings the Electron handler did.
const AUDIO_FORMATS: &[(&str, &str)] = &[
    (".mp3", "audio/mpeg"),
    (".m4a", "audio/mp4"),
    (".aac", "audio/aac"),
    (".flac", "audio/flac"),
    (".wav", "audio/wav"),
    (".ogg", "audio/ogg"),
    (".opus", "audio/opus"),
    (".wma", "audio/x-ms-wma"),
    (".aiff", "audio/aiff"),
    (".webm", "audio/webm"),
];

const VIDEO_FORMATS: &[(&str, &str)] = &[
    (".mp4", "video/mp4"),
    (".mkv", "video/x-matroska"),
    (".avi", "video/x-msvideo"),
    (".mov", "video/quicktime"),
    (".wmv", "video/x-ms-wmv"),
    (".flv", "video/x-flv"),
    (".webm", "video/webm"),
    (".m4v", "video/mp4"),
    (".mpg", "video/mpeg"),
    (".mpeg", "video/mpeg"),
    (".3gp", "video/3gpp"),
    (".ts", "video/mp2t"),
    (".mts", "video/mp2t"),
    (".m2ts", "video/mp2t"),
];

const IMAGE_FORMATS: &[(&str, &str)] = &[
    (".jpg", "image/jpeg"),
    (".jpeg", "image/jpeg"),
    (".png", "image/png"),
    (".gif", "image/gif"),
    (".webp", "image/webp"),
    (".bmp", "image/bmp"),
    (".svg", "image/svg+xml"),
    (".tiff", "image/tiff"),
    (".tif", "image/tiff"),
    (".ico", "image/x-icon"),
    (".heic", "image/heic"),
    (".heif", "image/heif"),
    (".avif", "image/avif"),
    (".raw", "image/raw"),
];

// Files larger than this are flagged streaming (STREAM_THRESHOLD = 50MB).
const STREAM_THRESHOLD: u64 = 50 * 1024 * 1024;

// Formats with common hardware decode support (port of isHardwareAccelerated).
const HW_FORMATS: &[&str] =
    &[".mp4", ".m4v", ".mov", ".webm", ".mp3", ".m4a", ".aac"];

// KV key holding the session source registry: { id -> MediaSource }.
const SOURCES_KEY: &str = "engine-sources";

fn keys_of(table: &[(&'static str, &'static str)]) -> Vec<&'static str> {
    table.iter().map(|(k, _)| *k).collect()
}

// --- capabilities / formats (round-1 channels, unchanged behavior) ----------

fn get_capabilities() -> Value {
    // detectCapabilities(): supportsHEVC becomes true on macOS ("darwin").
    let supports_hevc = std::env::consts::OS == "macos";
    json!({
        "hardwareAcceleration": true,
        "supportedAudioFormats": keys_of(AUDIO_FORMATS),
        "supportedVideoFormats": keys_of(VIDEO_FORMATS),
        "supportedImageFormats": keys_of(IMAGE_FORMATS),
        "maxConcurrentStreams": 4,
        "supportsHDR": true,
        "supportsWebM": true,
        "supportsHEVC": supports_hevc,
    })
}

fn get_supported_formats() -> Value {
    json!({
        "audio": keys_of(AUDIO_FORMATS),
        "video": keys_of(VIDEO_FORMATS),
        "image": keys_of(IMAGE_FORMATS),
    })
}

// --- format detection helpers (port of getMediaType/getMimeType/isSupported) -

fn ext_of(path: &str) -> String {
    // path.extname(p).toLowerCase(); leading dot included, like Node.
    let sep = path.rfind(['/', '\\']);
    match path.rfind('.') {
        // dot must come after the last path separator (and not be the basename's
        // leading char) to count as an extension, matching Node's path.extname.
        Some(idx) if idx > sep.map(|s| s + 1).unwrap_or(0) => path[idx..].to_lowercase(),
        _ => String::new(),
    }
}

fn lookup(table: &[(&'static str, &'static str)], ext: &str) -> Option<&'static str> {
    table.iter().find(|(k, _)| *k == ext).map(|(_, v)| *v)
}

fn media_type(ext: &str) -> Option<&'static str> {
    if lookup(AUDIO_FORMATS, ext).is_some() {
        Some("audio")
    } else if lookup(VIDEO_FORMATS, ext).is_some() {
        Some("video")
    } else if lookup(IMAGE_FORMATS, ext).is_some() {
        Some("image")
    } else {
        None
    }
}

fn mime_type(ext: &str) -> Option<&'static str> {
    lookup(AUDIO_FORMATS, ext)
        .or_else(|| lookup(VIDEO_FORMATS, ext))
        .or_else(|| lookup(IMAGE_FORMATS, ext))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// canPlayFile(filePath): is the extension supported.
fn can_play(path: &str) -> Value {
    json!(media_type(&ext_of(path)).is_some())
}

// getFormatInfo(filePath) -> FormatSupport | null.
fn get_format(path: &str) -> Value {
    let ext = ext_of(path);
    match mime_type(&ext) {
        Some(mime) => json!({
            "format": ext,
            "mimeType": mime,
            "canDecode": true,
            "canEncode": lookup(IMAGE_FORMATS, &ext).is_some(),
            "hardwareAccelerated": HW_FORMATS.contains(&ext.as_str()),
        }),
        None => Value::Null,
    }
}

// --- config (file-backed: media-engine/config.json) -------------------------

fn config_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .dex_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("media-engine");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    config_dir(app).join("config.json")
}

// The constructor defaults from Electron (EngineConfig).
fn default_config() -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("decodeMode".into(), json!("auto"));
    m.insert("maxMemoryUsage".into(), json!(512)); // MB
    m.insert("streamChunkSize".into(), json!(1024 * 1024)); // 1MB
    m.insert("streamBufferSize".into(), json!(5));
    m.insert("preloadDuration".into(), json!(5)); // seconds
    m.insert("enableHDR".into(), json!(true));
    m.insert("enableDeinterlace".into(), json!(false));
    m.insert("maxConcurrentLoads".into(), json!(3));
    m.insert("backgroundPlaybackAllowed".into(), json!(false));
    m
}

// loadConfig(): defaults shallow-merged with the saved file (saved keys win),
// mirroring `this.config = { ...this.config, ...saved }`.
fn load_config(app: &tauri::AppHandle) -> Map<String, Value> {
    let mut cfg = default_config();
    if let Ok(raw) = std::fs::read_to_string(config_path(app)) {
        if let Ok(Value::Object(saved)) = serde_json::from_str::<Value>(&raw) {
            for (k, v) in saved {
                cfg.insert(k, v);
            }
        }
    }
    cfg
}

fn save_config(app: &tauri::AppHandle, cfg: &Map<String, Value>) {
    let data = serde_json::to_string_pretty(&Value::Object(cfg.clone())).unwrap_or_default();
    let _ = std::fs::write(config_path(app), data);
}

fn get_config(app: &tauri::AppHandle) -> Value {
    Value::Object(load_config(app))
}

// updateConfig(updates): shallow-merge, persist, emit `configUpdated`, return config.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut cfg = load_config(app);
    if let Some(obj) = updates.as_object() {
        for (k, v) in obj {
            cfg.insert(k.clone(), v.clone());
        }
    }
    save_config(app, &cfg);
    let out = Value::Object(cfg);
    crate::native_ops::emit_event(app, "configUpdated", &out);
    out
}

// --- source registry (KV-backed) --------------------------------------------

fn read_sources(app: &tauri::AppHandle) -> Map<String, Value> {
    match crate::kv_get(app, SOURCES_KEY) {
        Value::Object(m) => m,
        _ => Map::new(),
    }
}

fn write_sources(app: &tauri::AppHandle, map: Map<String, Value>) {
    crate::kv_set(app, SOURCES_KEY, Value::Object(map));
}

// loadSource(filePath): stat, classify, register a MediaSource, emit `sourceLoaded`.
// Returns the MediaSource or null (unsupported / unreadable), exactly like Electron.
fn load_source(app: &tauri::AppHandle, path: &str) -> Value {
    if path.is_empty() {
        return Value::Null;
    }
    let ext = ext_of(path);
    let mtype = match media_type(&ext) {
        Some(t) => t,
        None => return Value::Null, // unsupported format -> null
    };
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return Value::Null, // unreadable -> null (Electron returned null on stat error)
    };
    let size = meta.len();

    // Dedupe by path, matching findSourceByPath() — return the existing source.
    let mut sources = read_sources(app);
    for v in sources.values() {
        if v.get("path").and_then(|p| p.as_str()) == Some(path) {
            return v.clone();
        }
    }

    let is_streaming = size > STREAM_THRESHOLD;
    let id = crate::util::pseudo_uuid_v4();
    let source = json!({
        "id": id,
        "path": path,
        "type": mtype,
        "mimeType": mime_type(&ext).unwrap_or("application/octet-stream"),
        "size": size,
        "isStreaming": is_streaming,
        "loadedAt": now_ms(),
    });

    sources.insert(id.clone(), source.clone());
    write_sources(app, sources);
    crate::native_ops::emit_event(app, "sourceLoaded", &source);
    source
}

// unloadSource(sourceId) -> bool. Removes from the registry, emits `sourceUnloaded`.
fn unload_source(app: &tauri::AppHandle, id: &str) -> Value {
    let mut sources = read_sources(app);
    if sources.remove(id).is_some() {
        write_sources(app, sources);
        crate::native_ops::emit_event(app, "sourceUnloaded", &json!(id));
        json!(true)
    } else {
        json!(false)
    }
}

// unloadAll(): clear the registry, emit `allUnloaded`.
fn unload_all(app: &tauri::AppHandle) -> Value {
    write_sources(app, Map::new());
    crate::native_ops::emit_event(app, "allUnloaded", &Value::Null);
    Value::Null
}

// --- stats (real cpu + registry-derived source counts) ----------------------

// getStats() -> EngineStats. activeSources/streamingSources/memoryUsage come from
// the source registry (non-streaming sizes summed in MB, like Electron's running
// `this.memoryUsage`). cpuUsage is REAL (sysinfo, sampled). gpuUsage stays 0
// (Electron's was a documented "would need platform-specific measurement" 0).
fn get_stats(app: &tauri::AppHandle) -> Value {
    let sources = read_sources(app);
    let active = sources.len();
    let mut streaming = 0usize;
    let mut memory_mb = 0f64;
    for v in sources.values() {
        let is_streaming = v.get("isStreaming").and_then(|b| b.as_bool()).unwrap_or(false);
        if is_streaming {
            streaming += 1;
        } else {
            let size = v.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
            memory_mb += size as f64 / (1024.0 * 1024.0);
        }
    }

    let cpu_usage = sampled_cpu();

    json!({
        "activeSources": active,
        "streamingSources": streaming,
        "memoryUsage": memory_mb,
        "cpuUsage": cpu_usage,
        "gpuUsage": 0,
        "droppedFrames": 0,
        "bufferHealth": 1.0,
    })
}

// Sample global CPU usage once over the minimum interval (precedent: power.rs).
fn sampled_cpu() -> i64 {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu();
    sys.global_cpu_info().cpu_usage().round() as i64
}

// --- honest degrades --------------------------------------------------------

fn degraded(reason: &str) -> Value {
    json!({ "success": false, "error": reason })
}

/// Route an `engine:*` channel. Args are the positional JSON array the renderer
/// sent. Channels that need a media runtime (transcode/analyze/render/thumbnail/
/// stream) or a renderer player (play) degrade honestly; the rest are real native
/// implementations.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg0_str = || args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    match channel {
        // pure-data capability surface
        "engine:getCapabilities" => get_capabilities(),
        "engine:getSupportedFormats" => get_supported_formats(),

        // format detection
        "engine:canPlay" => can_play(arg0_str()),
        "engine:getFormat" => get_format(arg0_str()),

        // source lifecycle (real fs + KV registry)
        "engine:load" => load_source(app, arg0_str()),
        "engine:unload" => unload_source(app, arg0_str()),
        "engine:unloadAll" => unload_all(app),

        // config (file-backed)
        "engine:getConfig" => get_config(app),
        "engine:updateConfig" => update_config(app, args.get(0).unwrap_or(&Value::Null)),

        // stats (real)
        "engine:getStats" => get_stats(app),

        // --- honest degrades: need a media runtime / renderer player ---------
        "engine:transcode" => degraded("not ported (needs native ffmpeg/codec runtime)"),
        "engine:analyze" => degraded("not ported (needs native ffmpeg/codec runtime)"),
        "engine:render" => degraded("not ported (needs native image codec runtime)"),
        "engine:thumbnail" => degraded("not ported (needs native image codec runtime)"),
        "engine:stream" => degraded("not ported (Buffer-over-IPC streaming; use fs namespace)"),
        "engine:readChunk" => degraded("not ported (Buffer-over-IPC streaming; use fs namespace)"),
        "engine:closeStream" => degraded("not ported (Buffer-over-IPC streaming; use fs namespace)"),
        "engine:play" => degraded("not ported (playback is a renderer concern)"),

        _ => Value::Null,
    }
}
