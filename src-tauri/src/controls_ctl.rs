// =============================================================================
// DEX Tauri — Floating Media Controls subsystem (port of the `controls:*` IPC
// handlers in core/FloatingMediaControls.ts).
//
// Pure-data tier. This file ports ONLY the data/CRUD surface — i.e. the single
// `controls:getState` read. The transport-heavy / live playback channels
// (play/pause/next/previous, the `controls:action` emitter bus, visibility,
// timers, mouse interaction, renderer push events) are NOT ported here: they
// drive a live in-process EventEmitter + BrowserWindow overlay that has no
// equivalent in this pure-data tier.
//
// STATE shape (from FloatingMediaControlsClass.getState() -> { ...this.state }):
//   {
//     context: "audio"|"video"|"gallery"|"none",
//     visibility: "visible"|"hidden"|"fading",
//     position: "bottom"|"top"|"left"|"right"|"floating",
//     playback: {
//       isPlaying, isPaused, isMuted: bool,
//       currentTime, duration, volume, playbackRate: number,
//       buffered?: number          // optional; absent by default
//     },
//     track?: TrackInfo,           // optional; ABSENT by default (undefined in
//                                  // the class -> dropped by JSON spread)
//     hasNext, hasPrevious: bool,
//     isFullscreen, isPiP: bool,
//     showWaveform, showSubtitles: bool,
//     subtitleTrack?: string,      // optional; absent by default
//     audioTrack?: string,         // optional; absent by default
//   }
//
// STORAGE divergence (documented):
//   The prompt designates DataStore-KV key `controls` as the storage for this
//   subsystem. The Electron class, however, holds `state` purely IN MEMORY and
//   NEVER persists it (only `config` and `layouts` are written to disk, under
//   <userData>/media-controls/, and those are not part of this data surface).
//   So at parity, `controls:getState` ALWAYS returns the hard-coded default
//   state on a fresh process. We mirror that exactly: defaults are the source of
//   truth. We additionally MERGE any object previously written to the KV
//   `controls` key over those defaults (forward-compatible, no-op until something
//   writes it) so the read stays honest rather than ignoring the designated key.
//   No KV write is performed by this read-only surface.
//
// No ids / timestamps are produced by `getState`, so no pseudo_uuid_v4 / epoch
// helpers are needed here. serde_json + std + tauri only; no new deps.
// =============================================================================

use serde_json::{json, Map, Value};

const STATE_KEY: &str = "controls";

// The exact default ControlsState the Electron constructor builds. `track`,
// `buffered`, `subtitleTrack`, `audioTrack` are intentionally OMITTED — they are
// `undefined` in the class and therefore absent from the `{ ...this.state }`
// JSON the renderer receives.
fn default_state() -> Value {
    json!({
        "context": "none",
        "visibility": "hidden",
        "position": "bottom",
        "playback": {
            "isPlaying": false,
            "isPaused": false,
            "isMuted": false,
            "currentTime": 0,
            "duration": 0,
            "volume": 1.0,
            "playbackRate": 1.0,
        },
        "hasNext": false,
        "hasPrevious": false,
        "isFullscreen": false,
        "isPiP": false,
        "showWaveform": false,
        "showSubtitles": false,
    })
}

// getState() -> { ...this.state }. Defaults are authoritative; any object
// persisted at KV `controls` is shallow-merged on top (forward-compatible).
fn get_state(app: &tauri::AppHandle) -> Value {
    let mut state: Map<String, Value> = default_state()
        .as_object()
        .cloned()
        .unwrap_or_default();

    if let Value::Object(saved) = crate::kv_get(app, STATE_KEY) {
        for (k, v) in saved {
            state.insert(k, v);
        }
    }

    Value::Object(state)
}

/// Route a `controls:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the data channel `controls:getState` is
/// ported; every other channel in the namespace (the live playback/visibility/
/// interaction surface) returns Value::Null — an honest "not ported" degrade
/// rather than a faked result.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "controls:getState" => get_state(app),
        _ => Value::Null,
    }
}
