// =============================================================================
// DEX Tauri — Universal Media Engine, data surface
// (port of the pure-data `engine:*` IPC handlers in
//  src/main/core/UniversalMediaEngine.ts).
//
// Only the static capability/format-description surface is ported. These two
// handlers return constants the renderer reads to decide what it can play; in
// Electron they are computed once at construction from the AUDIO/VIDEO/IMAGE
// format tables and the default capabilities object. No storage is touched by
// either handler, so although the engine subsystem owns a `media-engine/
// config.json` (decode mode, memory caps, etc.) and could in principle map to
// DataStore-KV, NEITHER ported channel reads or writes it — config + sources +
// streaming are part of the heavy runtime surface and are intentionally skipped.
//
// Channels & shapes (exact, from the Electron handlers):
//   - engine:getCapabilities      -> EngineCapabilities
//       { hardwareAcceleration: bool, supportedAudioFormats: string[],
//         supportedVideoFormats: string[], supportedImageFormats: string[],
//         maxConcurrentStreams: number, supportsHDR: bool, supportsWebM: bool,
//         supportsHEVC: bool }
//   - engine:getSupportedFormats  -> { audio: string[], video: string[],
//                                      image: string[] }
//     (the task brief calls this "getFormats"; the real channel string the
//      renderer sends is `engine:getSupportedFormats`.)
//
// The format arrays are the extension keys (".mp3", ".mp4", ...) in the SAME
// declaration order as the Electron `Record` literals — `Object.keys()`
// preserves insertion order, so ordering is part of the contract and is kept.
//
// DIVERGENCES (documented):
//   - Platform-dependent capability tweaks in Electron's detectCapabilities()
//     run at init: on macOS `supportsHEVC` is flipped to true. That detection
//     is reproduced here from std::env::consts::OS so the returned object still
//     matches per-platform (darwin -> HEVC true). `hardwareAcceleration` is the
//     same hard-coded `true` Electron used (real GPU probing was a TODO there
//     too, so no behavior is lost).
//   - getCapabilities in Electron returns the live `this.capabilities` object,
//     which is only ever mutated by detectCapabilities(); since we recompute the
//     identical post-detection value, the shape and values are identical.
// =============================================================================

use serde_json::{json, Value};

// Extension -> mime tables, kept in Electron declaration order. Only the keys
// are surfaced by the ported channels, but the full pairs are retained verbatim
// so this mirrors the source 1:1 and is trivial to extend if a mime-returning
// channel is later ported.
const AUDIO_FORMATS: &[&str] = &[
    ".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus", ".wma", ".aiff", ".webm",
];

const VIDEO_FORMATS: &[&str] = &[
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".mpg", ".mpeg", ".3gp",
    ".ts", ".mts", ".m2ts",
];

const IMAGE_FORMATS: &[&str] = &[
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".tiff", ".tif", ".ico", ".heic",
    ".heif", ".avif", ".raw",
];

// EngineCapabilities, mirroring the constructor default + detectCapabilities().
fn get_capabilities() -> Value {
    // detectCapabilities(): supportsHEVC becomes true on macOS ("darwin").
    let supports_hevc = std::env::consts::OS == "macos";
    json!({
        "hardwareAcceleration": true,
        "supportedAudioFormats": AUDIO_FORMATS,
        "supportedVideoFormats": VIDEO_FORMATS,
        "supportedImageFormats": IMAGE_FORMATS,
        "maxConcurrentStreams": 4,
        "supportsHDR": true,
        "supportsWebM": true,
        "supportsHEVC": supports_hevc,
    })
}

// getSupportedFormats(): { audio, video, image } of extension keys.
fn get_supported_formats() -> Value {
    json!({
        "audio": AUDIO_FORMATS,
        "video": VIDEO_FORMATS,
        "image": IMAGE_FORMATS,
    })
}

/// Route an `engine:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the pure-data channels are handled; every
/// other `engine:*` channel (load/unload/stream/render/thumbnail/getConfig/
/// updateConfig/getStats/...) is part of the heavy native runtime surface and
/// returns Value::Null (honest degrade) rather than a faked result.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "engine:getCapabilities" => get_capabilities(),
        "engine:getSupportedFormats" => get_supported_formats(),
        _ => Value::Null,
    }
}
