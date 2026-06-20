// =============================================================================
// DEX Tauri — Floating Media Controls subsystem (port of the `controls:*` IPC
// handlers in core/FloatingMediaControls.ts).
//
// This file ports the data/CRUD read (`controls:getState`) PLUS the four core
// playback transport channels (play / pause / next / previous). Those four mirror
// `handleAction({type})` from the Electron class: they mutate playback state,
// persist it, push the `controls:stateChanged` renderer event (Electron's
// `mainWindow.webContents.send`) and the `controls:action` bus event (Electron's
// in-process `this.emit('action', ...)`), and return the `{ success, action }`
// shape. next/previous honor the same `hasNext` / `hasPrevious` guards as the
// class. The remaining live-overlay channels (visibility, timers, mouse
// interaction, config/layout disk I/O, the richer action variants) are still
// unported and fall through to Value::Null.
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

// Persist the merged state back to KV `controls`. We deliberately write the FULL
// merged object (defaults + prior writes + this mutation) so later getState reads
// stay coherent — the Electron class kept `state` in memory; here KV is the only
// durable carrier across the stateless dispatcher.
fn save_state(app: &tauri::AppHandle, state: &Value) {
    let _ = crate::kv_set(app, STATE_KEY, state.clone());
}

// Push the renderer-notification event Electron sent via
// `mainWindow.webContents.send('controls:stateChanged', this.state)`. Same
// channel name, same payload (the full state object).
fn notify_state_change(app: &tauri::AppHandle, state: &Value) {
    crate::native_ops::emit_event(app, "controls:stateChanged", state);
}

// Mirror Electron's `this.emit('action', name, value?)` action-bus emission. In
// Electron this was an in-process EventEmitter consumed by the renderer bridge;
// the Tauri equivalent is a renderer push event carrying { action, value? }.
fn emit_action(app: &tauri::AppHandle, action: &str, value: Option<Value>) {
    let mut payload = Map::new();
    payload.insert("action".into(), Value::String(action.to_string()));
    if let Some(v) = value {
        payload.insert("value".into(), v);
    }
    crate::native_ops::emit_event(app, "controls:action", &Value::Object(payload));
}

// Set a nested boolean on state.playback, creating the playback object if absent.
fn set_playback_bool(state: &mut Value, field: &str, val: bool) {
    if !state.get("playback").map(|p| p.is_object()).unwrap_or(false) {
        if let Value::Object(map) = state {
            map.insert("playback".into(), json!({}));
        }
    }
    if let Some(pb) = state.get_mut("playback").and_then(|p| p.as_object_mut()) {
        pb.insert(field.to_string(), Value::Bool(val));
    }
}

// handleAction({type:'play'}). Electron emitted 'action'='play' and (via the
// renderer) flipped playback; here we mutate the durable state to reflect play,
// persist it, push the state-change + action events, and return the Electron
// `{ success, action }` shape.
fn action_play(app: &tauri::AppHandle) -> Value {
    let mut state = get_state(app);
    set_playback_bool(&mut state, "isPlaying", true);
    set_playback_bool(&mut state, "isPaused", false);
    save_state(app, &state);
    emit_action(app, "play", None);
    notify_state_change(app, &state);
    json!({ "success": true, "action": "play" })
}

// handleAction({type:'pause'}).
fn action_pause(app: &tauri::AppHandle) -> Value {
    let mut state = get_state(app);
    set_playback_bool(&mut state, "isPlaying", false);
    set_playback_bool(&mut state, "isPaused", true);
    save_state(app, &state);
    emit_action(app, "pause", None);
    notify_state_change(app, &state);
    json!({ "success": true, "action": "pause" })
}

// handleAction({type:'next'}). Electron only emits when `this.state.hasNext`;
// otherwise the action is a no-op. We honor that guard exactly. The return shape
// is unchanged (`{ success:true, action:'next' }`) because Electron returns it
// regardless of whether the guarded emit fired.
fn action_next(app: &tauri::AppHandle) -> Value {
    let state = get_state(app);
    let has_next = state.get("hasNext").and_then(|v| v.as_bool()).unwrap_or(false);
    if has_next {
        emit_action(app, "next", None);
        // The actual track advance is owned by the renderer player; we re-push
        // state so listeners stay in sync (parity with notifyStateChange()).
        notify_state_change(app, &state);
    }
    json!({ "success": true, "action": "next" })
}

// handleAction({type:'previous'}). Guarded by `this.state.hasPrevious`.
fn action_previous(app: &tauri::AppHandle) -> Value {
    let state = get_state(app);
    let has_prev = state.get("hasPrevious").and_then(|v| v.as_bool()).unwrap_or(false);
    if has_prev {
        emit_action(app, "previous", None);
        notify_state_change(app, &state);
    }
    json!({ "success": true, "action": "previous" })
}

/// Route a `controls:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the data channel `controls:getState` is
/// ported; every other channel in the namespace (the live playback/visibility/
/// interaction surface) returns Value::Null — an honest "not ported" degrade
/// rather than a faked result.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "controls:getState" => get_state(app),
        "controls:play" => action_play(app),
        "controls:pause" => action_pause(app),
        "controls:next" => action_next(app),
        "controls:previous" => action_previous(app),
        _ => Value::Null,
    }
}
