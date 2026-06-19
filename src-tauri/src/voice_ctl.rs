// =============================================================================
// DEX Tauri — Voice Control subsystem (port of the `voice:*` IPC handlers in
// VoiceControlEngine.ts).
//
// SCOPE: this module ports ONLY the pure-data status read of the voice
// subsystem. The live voice runtime (microphone capture, speech recognition,
// wake-word detection, command execution) is a native side-effecting engine
// with no data to persist beyond config/logs/sessions, and is NOT reproduced
// here — see channelsSkipped below.
//
// NAME RECONCILIATION (documented divergence from the orchestrator hint): the
// orchestrator described the data channel as `getStatus`, the heavy channels as
// `start/stop/process`, the source as VoiceController.ts and the storage as
// fs-json:voice-state.json. None of those literal names exist in the codebase:
//   - VoiceController.ts is the `voiceNotes` namespace (already ported in
//     voice_notes.rs); the `voice` namespace lives in VoiceControlEngine.ts.
//   - There is no `voice:getStatus`/`voice:start`/`voice:stop`/`voice:process`.
//     The status read in this namespace is `voice:getState` (returns the current
//     VoiceState). The heavy operations are `voice:startListening`,
//     `voice:stopListening` and transcript processing (`voice:cancelCommand`,
//     processTranscript). Those are mapped to the requested start/stop/process.
//   - Storage is the electron-store `voice-control` (so `voice-control.json`
//     under appData), not `voice-state.json`. We mirror the REAL file and its
//     top-level key wrappers (config/logs/sessions/totalCommandsExecuted/
//     lastUsed) exactly so the data layer matches Electron.
//
// `voice:getState` in Electron returns `this.state`, an in-memory VoiceState
// (default 'disabled'). On engine startup the state is set from persisted
// config: if `config.enabled` the engine moves to 'idle', otherwise it stays
// 'disabled' (initializeEngine / DEFAULT_CONFIG.enabled = false). A fresh Tauri
// process has no live listening session, so the faithful pure-data result is
// exactly that startup state derived from persisted config: 'idle' when enabled,
// else 'disabled'. ('listening'/'processing'/'executing' are transient runtime
// states that only exist while the native engine is active.)
// =============================================================================

use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

// electron-store name "voice-control" -> voice-control.json under appData.
const STORE_FILE: &str = "voice-control.json";

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// voice:getState — current VoiceState. Derived from persisted config exactly as
// the engine derives its startup state (enabled -> 'idle', else 'disabled').
// DEFAULT_CONFIG.enabled is false, so an absent/empty store yields 'disabled'.
fn get_state(app: &tauri::AppHandle) -> Value {
    let enabled = read_file(app, STORE_FILE)
        .get("config")
        .and_then(|c| c.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    Value::String(if enabled { "idle".into() } else { "disabled".into() })
}

/// Route a `voice:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the pure-data status read is handled; every
/// other channel in the namespace (live-runtime operations) returns Value::Null
/// (honest degrade — see channelsSkipped in the port metadata).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Requested "getStatus" == the real status read in this namespace.
        "voice:getState" => get_state(_app),
        _ => Value::Null,
    }
}
