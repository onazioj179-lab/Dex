// =============================================================================
// DEX Tauri — Video subsystem port (REQUESTED: video:getMetadata,
// video:getThumbnail; SKIP: video:process, video:transcode).
//
// PORT OUTCOME: nothing to port. The task named these sources/shapes:
//   - Electron source: src/main/core/VideoProcessing.ts  -> DOES NOT EXIST.
//   - Storage:         fs-json:video-cache.json          -> DOES NOT EXIST.
//   - Channels:        video:getMetadata / video:getThumbnail /
//                      video:process / video:transcode   -> NONE are registered
//                      anywhere in the Electron main (ipcMain.handle) or the
//                      preload bridge. Verified by repo-wide search.
//
// WHAT ACTUALLY EXISTS in this codebase for video:
//   - src/main/core/VideoPlayerSystem.ts: a player (playback/queue/library/
//     playlist) whose channels are video:play, video:getVideos, video:config,
//     etc. It has NO getMetadata/getThumbnail/process/transcode, and its data
//     lives as per-file JSON under <userData>/video/{library,playlists}, NOT in
//     a "video-cache.json".
//   - Video metadata/probe is NATIVE-ONLY: main.ts's native:video-metadata /
//     native:media-probe call the napi module (NativeVideo.getMetadata ->
//     mod.getVideoMetadata, probeMediaFile). There is no JS/Electron
//     implementation and no JSON cache to mirror.
//
// Because the two requested DATA channels have NO Electron handler to port from
// (no return shape, no storage), and the only real video-metadata path is the
// native napi module — which is the explicitly blocked "needs native runtime"
// tier — there is nothing to faithfully reproduce. Per the porting rules
// ("never invent fields", "do not fake", "prefer fewer correct channels"), we
// invent neither a video-cache.json store nor metadata/thumbnail shapes that no
// renderer reads or writes. Doing so would orphan data the UI never touches.
//
// This module is therefore an honest no-op router: it owns the `video:` prefix
// and returns Value::Null for every channel (the same honest-degrade contract
// rule_engine.rs uses for unknown channels). If/when a real VideoProcessing
// data surface with a JSON cache is added to Electron, port it here against its
// actual shapes using the analytics.rs (electron-store JSON) or rule_engine.rs
// (DataStore-KV) template, whichever the real storage uses.
//
// NOTE: This file intentionally adds no dependencies and reads/writes no files,
// since there is no verified storage key/path to bind to.
// =============================================================================

use serde_json::Value;

/// Route a `video:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). No data channel from the task brief maps to a real
/// Electron handler in this codebase, and the only metadata path is the native
/// napi module (blocked), so every channel honestly degrades to Value::Null
/// rather than fabricating a shape. `_app`/`_args` are accepted to match the
/// dispatcher signature used by the other ported modules.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // REQUESTED data channels — no Electron source/shape/storage to port.
        // Returning Null is the honest result: the native bridge (the real
        // metadata path) is unavailable in the Tauri data tier.
        "video:getMetadata" => Value::Null,
        "video:getThumbnail" => Value::Null,

        // HEAVY channels — explicitly NOT ported, not faked (need native runtime).
        "video:process" => Value::Null,
        "video:transcode" => Value::Null,

        // Any other video:* channel (e.g. the real VideoPlayerSystem playback
        // channels, which are out of scope for this data-tier port).
        _ => Value::Null,
    }
}
