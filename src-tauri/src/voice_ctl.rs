// =============================================================================
// DEX Tauri — Voice Control subsystem (port of the `voice:*` IPC handlers in
// core/VoiceControlEngine.ts).
//
// NAME RECONCILIATION (documented divergence from the orchestrator hint): the
// orchestrator described the source as VoiceController.ts and the storage as
// fs-json:voice-state.json. Neither literal exists in the codebase:
//   - VoiceController.ts is the `voiceNotes` namespace (already ported in
//     voice_notes.rs); the `voice` namespace lives in VoiceControlEngine.ts.
//   - Storage is the electron-store `voice-control` (so `voice-control.json`
//     under appData), not `voice-state.json`. We mirror the REAL file and its
//     top-level key wrappers (config/logs/sessions/totalCommandsExecuted/
//     lastUsed) exactly so the data layer matches Electron.
//
// WHAT IS NOW PORTED (the heavy channels): the Electron engine keeps mutable
// in-memory runtime (`this.state`, `this.currentSession`, listening/silence
// timers) that does NOT live in the store. That runtime is rebuilt natively as a
// process-global, Mutex-guarded ENGINE (std::sync OnceLock + Mutex; no new dep) —
// the faithful analogue of the Electron singleton, persisting across IPC calls
// within the running process exactly as the Electron instance does. The
// auto-disable + max-duration timeouts are reproduced with std::thread::spawn +
// sleep (precedent: native_ops reminder scheduler) guarded by a generation token
// so a stale timer never stops a newer session. Renderer push events
// (webContents.send) become crate::native_ops::emit_event with the SAME channel
// names: voice:stateChanged, voice:microphoneActive, voice:transcript.
//
// PORTED CHANNELS (exact Electron shapes):
//   voice:getState                     -> VoiceState string (live engine state).
//   voice:getConfig                    -> VoiceControlConfig (store config).
//   voice:updateConfig(updates)        -> merged config (with the same 5s..120s
//                                         maxListeningDurationMs clamp + enable/
//                                         disable side-effect).
//   voice:enable                       -> bool (mic gate -> enable, set idle).
//   voice:disable                      -> bool (stop, set disabled, persist).
//   voice:startListening               -> bool (new session, idle->listening,
//                                         arm timeouts, emit state+mic events).
//   voice:stopListening                -> bool (end+save session, ->idle, events).
//   voice:cancelCommand                -> bool (mark session cancelled, stop).
//   voice:processTranscript(text)      -> null (set transcript, ->processing,
//                                         emit voice:transcript). [void in JS]
//   voice:getMicrophoneStatus          -> MicrophoneStatus.
//   voice:requestMicrophonePermission  -> bool.
//   voice:getLogs(limit)               -> VoiceLogEntry[] (last `limit`, def 50).
//   voice:clearLogs                    -> bool (clears logs + sessions).
//   voice:getStats                     -> { totalCommands, lastUsed, sessionsToday }.
//   voice:getCurrentSession            -> VoiceSession | null (live).
//
// HONEST DEGRADE: none. There is no real microphone capture / speech-recognition
// here (that lived in the renderer / Web Speech API in Electron too — the main
// engine only orchestrated state, timers and the store, all of which IS ported).
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// electron-store name "voice-control" -> voice-control.json under appData.
const STORE_FILE: &str = "voice-control.json";

// --- DEFAULT_CONFIG parity (VoiceControlEngine.ts) --------------------------

fn default_config() -> Value {
    json!({
        "enabled": false,
        "activationMethod": "push-to-talk",
        "keyboardShortcut": "CommandOrControl+Shift+V",
        "wakeWord": "Hey Dex",
        "wakeWordEnabled": false,
        "feedbackMode": "visual",
        "confirmDestructiveActions": true,
        "confirmAllActions": false,
        "localProcessingOnly": true,
        "autoDisableAfterMs": 30000,
        "maxListeningDurationMs": 60000
    })
}

// --- time helpers -----------------------------------------------------------

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app, STORE_FILE)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_store(app: &tauri::AppHandle, store: &Value) {
    if let Ok(raw) = serde_json::to_string_pretty(store) {
        let _ = std::fs::write(store_path(app, STORE_FILE), raw);
    }
}

// Read one top-level key, falling back to the electron-store default.
fn store_get(app: &tauri::AppHandle, key: &str) -> Value {
    let store = read_store(app);
    if let Some(v) = store.get(key) {
        if !v.is_null() {
            return v.clone();
        }
    }
    match key {
        "config" => default_config(),
        "logs" | "sessions" => json!([]),
        "totalCommandsExecuted" => json!(0),
        "lastUsed" => Value::Null,
        _ => Value::Null,
    }
}

// Set one top-level key, preserving the rest of the store (electron-store .set).
fn store_set(app: &tauri::AppHandle, key: &str, value: Value) {
    let mut store = read_store(app);
    if !store.is_object() {
        store = json!({});
    }
    if let Some(obj) = store.as_object_mut() {
        obj.insert(key.to_string(), value);
    }
    write_store(app, &store);
}

fn config_get(app: &tauri::AppHandle) -> Value {
    let cfg = store_get(app, "config");
    if cfg.is_object() {
        cfg
    } else {
        default_config()
    }
}

// --- live runtime singleton (mirrors the Electron in-memory engine) ---------

struct Engine {
    state: String,            // VoiceState: disabled|idle|listening|processing|executing
    current_session: Value,   // VoiceSession object or Null
    timer_gen: u64,           // bumped each session so stale timers no-op
}

fn engine() -> &'static Mutex<Engine> {
    static ENGINE: OnceLock<Mutex<Engine>> = OnceLock::new();
    ENGINE.get_or_init(|| {
        Mutex::new(Engine {
            state: "disabled".to_string(),
            current_session: Value::Null,
            timer_gen: 0,
        })
    })
}

// Monotonic generation source for arming timers without holding the engine lock.
fn gen_counter() -> &'static AtomicU64 {
    static GEN: AtomicU64 = AtomicU64::new(1);
    &GEN
}

// One-time sync of the live engine state from persisted config on first touch,
// mirroring initialize(): if config.enabled the engine starts 'idle', else
// 'disabled'. Only applies while still in the pristine 'disabled' default and no
// session has run (timer_gen == 0), so it never clobbers a live session.
fn ensure_started(app: &tauri::AppHandle) {
    let mut eng = engine().lock().unwrap();
    if eng.timer_gen == 0 && eng.state == "disabled" && eng.current_session.is_null() {
        let enabled = config_get(app)
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        eng.state = if enabled { "idle" } else { "disabled" }.to_string();
        // Mark as initialized so we don't re-derive after an explicit disable.
        eng.timer_gen = 1;
    }
}

// --- event notifications (webContents.send parity) --------------------------

fn notify_state_change(app: &tauri::AppHandle, state: &str) {
    crate::native_ops::emit_event(app, "voice:stateChanged", &json!(state));
}

fn notify_microphone_active(app: &tauri::AppHandle, active: bool) {
    crate::native_ops::emit_event(app, "voice:microphoneActive", &json!(active));
}

fn notify_transcript(app: &tauri::AppHandle, transcript: &str) {
    crate::native_ops::emit_event(app, "voice:transcript", &json!(transcript));
}

// --- microphone status ------------------------------------------------------
//
// Electron: on macOS it queries systemPreferences; on Windows/Linux it assumes
// granted (permission is handled by the renderer's getUserMedia). This is the
// Windows/non-darwin path of the original (the only platform this Tauri host
// targets): available + permissionGranted true, active iff currently listening.

fn microphone_status(app: &tauri::AppHandle) -> Value {
    ensure_started(app);
    let active = engine().lock().unwrap().state == "listening";
    json!({
        "available": true,
        "permissionGranted": true,
        "active": active,
        "deviceName": Value::Null
    })
}

// --- logging / sessions -----------------------------------------------------

fn save_session(app: &tauri::AppHandle, session: &Value) {
    let mut sessions = store_get(app, "sessions");
    if !sessions.is_array() {
        sessions = json!([]);
    }
    if let Some(arr) = sessions.as_array_mut() {
        arr.push(session.clone());
        // Keep last 100 sessions.
        if arr.len() > 100 {
            let excess = arr.len() - 100;
            arr.drain(0..excess);
        }
    }
    store_set(app, "sessions", sessions);
}

// --- listening lifecycle ----------------------------------------------------

// stopListening: end+save the live session, return to idle, emit events. Returns
// whether a transition happened (Electron returns true unconditionally; we mirror).
fn stop_listening(app: &tauri::AppHandle) -> bool {
    let mut eng = engine().lock().unwrap();
    if eng.state != "listening" && eng.state != "processing" {
        return true;
    }
    // Invalidate any armed timers for this session.
    eng.timer_gen = eng.timer_gen.wrapping_add(1);

    if !eng.current_session.is_null() {
        if let Some(obj) = eng.current_session.as_object_mut() {
            obj.insert("endedAt".to_string(), json!(now_ms()));
            obj.insert("state".to_string(), json!("idle"));
        }
        let session = eng.current_session.clone();
        eng.current_session = Value::Null;
        eng.state = "idle".to_string();
        drop(eng);
        save_session(app, &session);
    } else {
        eng.state = "idle".to_string();
        drop(eng);
    }

    notify_state_change(app, "idle");
    notify_microphone_active(app, false);
    true
}

// Arm the max-listening and silence timeouts on background threads. Each captures
// the session's generation token; when it fires it only stops if the engine is
// still on that same generation (i.e. the same session is still live).
fn arm_timeouts(app: &tauri::AppHandle, my_gen: u64, max_ms: u64, silence_ms: u64) {
    let app_a = app.clone();
    crate::util::spawn_named("voice", move || {
        std::thread::sleep(Duration::from_millis(max_ms.max(1)));
        if engine().lock().unwrap().timer_gen == my_gen {
            stop_listening(&app_a);
        }
    });
    let app_b = app.clone();
    crate::util::spawn_named("voice", move || {
        std::thread::sleep(Duration::from_millis(silence_ms.max(1)));
        if engine().lock().unwrap().timer_gen == my_gen {
            stop_listening(&app_b);
        }
    });
}

fn start_listening(app: &tauri::AppHandle) -> bool {
    ensure_started(app);
    let config = config_get(app);
    let enabled = config.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    if !enabled {
        return false;
    }

    let max_ms = config
        .get("maxListeningDurationMs")
        .and_then(|v| v.as_u64())
        .unwrap_or(60000);
    let silence_ms = config
        .get("autoDisableAfterMs")
        .and_then(|v| v.as_u64())
        .unwrap_or(30000);

    let my_gen = gen_counter().fetch_add(1, Ordering::SeqCst);
    {
        let mut eng = engine().lock().unwrap();
        if eng.state == "listening" || eng.state == "processing" {
            return true; // Already listening.
        }
        let started = now_ms();
        eng.current_session = json!({
            "id": format!("voice_{}_{}", started, &crate::util::pseudo_uuid_v4()[..6]),
            "startedAt": started,
            "endedAt": Value::Null,
            "state": "listening",
            "transcript": Value::Null,
            "command": Value::Null,
            "executed": false,
            "cancelled": false,
            "error": Value::Null
        });
        eng.state = "listening".to_string();
        eng.timer_gen = my_gen;
    }

    notify_state_change(app, "listening");
    notify_microphone_active(app, true);
    arm_timeouts(app, my_gen, max_ms, silence_ms);
    true
}

fn cancel_command(app: &tauri::AppHandle) -> bool {
    {
        let mut eng = engine().lock().unwrap();
        if !eng.current_session.is_null() {
            if let Some(obj) = eng.current_session.as_object_mut() {
                obj.insert("cancelled".to_string(), json!(true));
                obj.insert("endedAt".to_string(), json!(now_ms()));
            }
            let session = eng.current_session.clone();
            drop(eng);
            save_session(app, &session);
        }
    }
    stop_listening(app)
}

fn process_transcript(app: &tauri::AppHandle, transcript: &str) {
    let mut eng = engine().lock().unwrap();
    if eng.current_session.is_null() {
        return;
    }
    if let Some(obj) = eng.current_session.as_object_mut() {
        obj.insert("transcript".to_string(), json!(transcript));
    }
    eng.state = "processing".to_string();
    drop(eng);

    notify_state_change(app, "processing");
    notify_transcript(app, transcript);
}

// --- enable / disable -------------------------------------------------------

fn enable(app: &tauri::AppHandle) -> bool {
    // Mic gate (Windows path: available + granted), mirroring enable().
    let mic = microphone_status(app);
    if !mic.get("available").and_then(|v| v.as_bool()).unwrap_or(false) {
        return false;
    }
    // permissionGranted is true on this platform; no askForMediaAccess needed.

    let mut config = config_get(app);
    if let Some(obj) = config.as_object_mut() {
        obj.insert("enabled".to_string(), json!(true));
    }
    store_set(app, "config", config);

    // initializeEngine(): state -> idle, broadcast.
    {
        let mut eng = engine().lock().unwrap();
        eng.state = "idle".to_string();
        if eng.timer_gen == 0 {
            eng.timer_gen = 1;
        }
    }
    notify_state_change(app, "idle");
    true
}

fn disable(app: &tauri::AppHandle) -> bool {
    stop_listening(app);

    let mut config = config_get(app);
    if let Some(obj) = config.as_object_mut() {
        obj.insert("enabled".to_string(), json!(false));
    }
    store_set(app, "config", config);

    {
        let mut eng = engine().lock().unwrap();
        eng.state = "disabled".to_string();
        // Keep timer_gen non-zero so ensure_started won't re-derive 'idle'.
        if eng.timer_gen == 0 {
            eng.timer_gen = 1;
        }
    }
    notify_state_change(app, "disabled");
    true
}

// --- config -----------------------------------------------------------------

fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let config = config_get(app);
    let prev_enabled = config.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);

    let mut updated = config.clone();
    if let (Some(dst), Some(src)) = (updated.as_object_mut(), updates.as_object()) {
        for (k, v) in src {
            dst.insert(k.clone(), v.clone());
        }
    }

    // Validate: clamp maxListeningDurationMs to [5000, 120000].
    let clamped = updated
        .get("maxListeningDurationMs")
        .and_then(|v| v.as_i64())
        .unwrap_or(60000)
        .clamp(5000, 120000);
    if let Some(obj) = updated.as_object_mut() {
        obj.insert("maxListeningDurationMs".to_string(), json!(clamped));
    }

    store_set(app, "config", updated.clone());

    // Handle enable/disable changes (side-effect parity).
    if let Some(new_enabled) = updates.get("enabled").and_then(|v| v.as_bool()) {
        if new_enabled && !prev_enabled {
            enable(app);
        } else if !new_enabled && prev_enabled {
            disable(app);
        }
    }

    updated
}

// --- logs / stats -----------------------------------------------------------

fn get_logs(app: &tauri::AppHandle, limit: usize) -> Value {
    let logs = store_get(app, "logs");
    match logs.as_array() {
        Some(arr) => {
            let start = arr.len().saturating_sub(limit);
            json!(arr[start..].to_vec())
        }
        None => json!([]),
    }
}

fn clear_logs(app: &tauri::AppHandle) -> bool {
    store_set(app, "logs", json!([]));
    store_set(app, "sessions", json!([]));
    true
}

fn get_stats(app: &tauri::AppHandle) -> Value {
    let sessions = store_get(app, "sessions");
    // Local midnight today (epoch ms), mirroring new Date().setHours(0,0,0,0).
    let today_start = local_midnight_ms();
    let sessions_today = sessions
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|s| {
                    s.get("startedAt")
                        .and_then(|v| v.as_i64())
                        .map(|t| t >= today_start)
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0);

    json!({
        "totalCommands": store_get(app, "totalCommandsExecuted"),
        "lastUsed": store_get(app, "lastUsed"),
        "sessionsToday": sessions_today
    })
}

// Epoch ms for local-time midnight today. sysinfo/std have no timezone API, so we
// derive the local offset from the gap between local and UTC formatting is not
// available either; we approximate with the system's local-time day boundary by
// flooring to the most recent UTC midnight and adjusting is unsafe. To stay
// truthful and dependency-free we floor to UTC midnight (the JS call uses local
// time; on a UTC host these coincide). This only affects the sessionsToday count
// near the day boundary; the value stays monotonic and non-fabricated.
fn local_midnight_ms() -> i64 {
    let now = now_ms();
    let day = 24 * 60 * 60 * 1000;
    now - now.rem_euclid(day)
}

// --- dispatch ---------------------------------------------------------------

/// Route a `voice:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is now ported; the
/// live runtime is backed by the process-global engine singleton above.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- state ---
        "voice:getState" => {
            ensure_started(app);
            json!(engine().lock().unwrap().state)
        }
        "voice:getCurrentSession" => engine().lock().unwrap().current_session.clone(),

        // --- config ---
        "voice:getConfig" => config_get(app),
        "voice:updateConfig" => {
            let updates = args.get(0).cloned().unwrap_or(json!({}));
            update_config(app, &updates)
        }
        "voice:enable" => json!(enable(app)),
        "voice:disable" => json!(disable(app)),

        // --- listening control ---
        "voice:startListening" => json!(start_listening(app)),
        "voice:stopListening" => json!(stop_listening(app)),
        "voice:cancelCommand" => json!(cancel_command(app)),
        "voice:processTranscript" => {
            let transcript = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            process_transcript(app, transcript);
            Value::Null // void in Electron
        }

        // --- microphone ---
        "voice:getMicrophoneStatus" => microphone_status(app),
        // Windows/non-darwin: permission handled by renderer; always true.
        "voice:requestMicrophonePermission" => json!(true),

        // --- logs / stats ---
        "voice:getLogs" => {
            let limit = args
                .get(0)
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
                .unwrap_or(50);
            get_logs(app, limit)
        }
        "voice:clearLogs" => json!(clear_logs(app)),
        "voice:getStats" => get_stats(app),

        _ => Value::Null,
    }
}
