// =============================================================================
// DEX Tauri — UKI controller data surface (port of the pure-data `uki:*` IPC
// handlers in src/main/controllers/UkiController.ts, backed by UkiConfig.ts).
//
// SCOPE / TASK NOTE -----------------------------------------------------------
// The porting brief named a channel `uki:getState` backed by `fs-json:
// uki-state.json`. Neither exists in the Electron codebase: there is no
// `uki:getState` handler and no `uki-state.json` file anywhere in src/main.
// Rather than invent a fake channel/file (the "fail honestly, don't fake"
// rule), this module ports the REAL data-read surface of the `uki:` namespace
// that semantically corresponds to a state read:
//   - uki:getStatus    -> live engine status object
//   - uki:getConfig    -> persisted config object
//   - uki:updateConfig -> validated partial merge, returns merged config
//   - uki:resetConfig  -> defaults, returns the defaults
// Every other `uki:*` channel (engine/voice/ML/native-memory/copilot/blueprint/
// recall/operator) is HEAVY and returns Value::Null here, so a blanket
// `channel.starts_with("uki:")` prefix route to this dispatch is safe.
//
// STORAGE ---------------------------------------------------------------------
// UkiConfig used an electron-store named "uki-config" with the top-level key
// `ukiConfig`, i.e. <userData>/uki-config.json shaped { "ukiConfig": {...} }.
// IMPORTANT DIVERGENCE: that store was created with
//   encryptionKey: 'dex-uki-config-v1'
// so electron-store wrote AES-256-CBC ciphertext, NOT plaintext JSON. A
// dependency-free std::fs reader cannot decrypt it (no crypto crate allowed,
// and adding one is out of scope). We therefore:
//   - mirror the SAME file name + key wrapper (uki-config.json / "ukiConfig"),
//   - read it ONLY if it parses as plaintext JSON (forward-compatible if the
//     Tauri build drops the encryptionKey),
//   - and otherwise fall back to DEFAULT_CONFIG.
// `updateConfig`/`resetConfig` here write PLAINTEXT JSON under the same path,
// matching how every other ported subsystem persists. This is the same
// "encrypted electron-store -> plaintext app_data JSON" divergence accepted in
// other ports; the renderer-visible return shape is unchanged.
//
// SHAPE -----------------------------------------------------------------------
// getConfig / updateConfig / resetConfig return UkiConfigData (exact field
// names + defaults from UkiConfig.ts). getStatus returns the UkiEngine.
// getStatus() shape: { state, initialized, sessionTurns, degraded,
// consecutiveFailures }. There is no engine in Tauri, so getStatus reports the
// honest idle/uninitialized baseline (state:"idle", initialized:false, all
// counters 0) at the EXACT field names the renderer reads.
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "uki-config.json";
const CONFIG_KEY: &str = "ukiConfig";

// --- file IO ----------------------------------------------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        // Parse only if plaintext JSON; encrypted electron-store bytes fail
        // here and we fall back to defaults (documented divergence).
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_file(app: &tauri::AppHandle, name: &str, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app, name), s).is_ok(),
        Err(_) => false,
    }
}

// --- config defaults (mirror DEFAULT_CONFIG in UkiConfig.ts exactly) ---------

fn default_config() -> Value {
    json!({
        "enabled": true,
        "asrProvider": "webspeech",
        "ttsRate": 1.0,
        "ttsPitch": 1.0,
        "ttsVolume": 0.8,
        "ttsVoice": "",
        "shortcut": "CommandOrControl+Space",
        "wakeWordEnabled": false,
        "wakePhrase": "Hey UKI",
        "personality": "casual",
        "silenceTimeoutMs": 3000,
        "maxListenMs": 30000,
        "confirmDestructive": true,
        "showTranscript": true,
        "contextCacheSizeGB": 3,
        "contextRetentionDays": 30,
        "recallMode": "hybrid",
        "autoCleanupEnabled": true,
        "cleanupIntervalHours": 24,
        "memoryEnabled": true,
    })
}

// Stored config merged over defaults so missing keys always resolve, matching
// electron-store's `store.get('ukiConfig', DEFAULT_CONFIG)` semantics.
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    let stored = read_file(app, CONFIG_FILE);
    if let Some(inner) = stored.get(CONFIG_KEY).and_then(|v| v.as_object()) {
        if let Some(base) = cfg.as_object_mut() {
            for (k, v) in inner {
                // Only adopt keys we know (ignore stray fields), keeping the
                // exact UkiConfigData shape.
                if base.contains_key(k) {
                    base.insert(k.clone(), v.clone());
                }
            }
        }
    }
    cfg
}

fn write_config(app: &tauri::AppHandle, cfg: &Value) {
    write_file(app, CONFIG_FILE, &json!({ CONFIG_KEY: cfg }));
}

fn clamp(n: f64, lo: f64, hi: f64) -> f64 {
    n.max(lo).min(hi)
}

// Mirror UkiConfig.update(): validate + clamp each field, merge over current.
fn update_config(app: &tauri::AppHandle, partial: &Value) -> Value {
    let mut cfg = get_config(app);
    let p = match partial.as_object() {
        Some(o) => o,
        None => return cfg, // non-object partial: no-op, return current
    };
    let base = match cfg.as_object_mut() {
        Some(o) => o,
        None => return get_config(app),
    };

    let bool_field = |base: &mut Map<String, Value>, k: &str, p: &Map<String, Value>| {
        if let Some(b) = p.get(k).and_then(|v| v.as_bool()) {
            base.insert(k.into(), json!(b));
        }
    };
    let str_field =
        |base: &mut Map<String, Value>, k: &str, p: &Map<String, Value>, max: usize| {
            if let Some(s) = p.get(k).and_then(|v| v.as_str()) {
                let truncated: String = s.chars().take(max).collect();
                base.insert(k.into(), json!(truncated));
            }
        };
    let enum_field =
        |base: &mut Map<String, Value>, k: &str, p: &Map<String, Value>, allowed: &[&str]| {
            if let Some(s) = p.get(k).and_then(|v| v.as_str()) {
                if allowed.contains(&s) {
                    base.insert(k.into(), json!(s));
                }
            }
        };
    let num_field =
        |base: &mut Map<String, Value>, k: &str, p: &Map<String, Value>, lo: f64, hi: f64| {
            if let Some(n) = p.get(k).and_then(|v| v.as_f64()) {
                base.insert(k.into(), json!(clamp(n, lo, hi)));
            }
        };

    bool_field(base, "enabled", p);
    enum_field(base, "asrProvider", p, &["webspeech", "whisper-local", "whisper-api"]);
    num_field(base, "ttsRate", p, 0.5, 2.0);
    num_field(base, "ttsPitch", p, 0.5, 2.0);
    num_field(base, "ttsVolume", p, 0.0, 1.0);
    str_field(base, "ttsVoice", p, 200);
    str_field(base, "shortcut", p, 100);
    bool_field(base, "wakeWordEnabled", p);
    str_field(base, "wakePhrase", p, 50);
    enum_field(base, "personality", p, &["formal", "casual"]);
    num_field(base, "silenceTimeoutMs", p, 1000.0, 30000.0);
    num_field(base, "maxListenMs", p, 5000.0, 120000.0);
    bool_field(base, "confirmDestructive", p);
    bool_field(base, "showTranscript", p);
    num_field(base, "contextCacheSizeGB", p, 1.0, 32.0);
    num_field(base, "contextRetentionDays", p, 1.0, 365.0);
    enum_field(base, "recallMode", p, &["auto", "explicit", "hybrid"]);
    bool_field(base, "autoCleanupEnabled", p);
    num_field(base, "cleanupIntervalHours", p, 1.0, 168.0);
    bool_field(base, "memoryEnabled", p);

    write_config(app, &cfg);
    cfg
}

fn reset_config(app: &tauri::AppHandle) -> Value {
    let cfg = default_config();
    write_config(app, &cfg);
    cfg
}

// UkiEngine.getStatus() shape. No engine exists in Tauri, so report the honest
// uninitialized/idle baseline at the exact field names the renderer reads.
fn get_status() -> Value {
    json!({
        "state": "idle",
        "initialized": false,
        "sessionTurns": 0,
        "degraded": false,
        "consecutiveFailures": 0,
    })
}

/// Route a `uki:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only pure-data channels are handled; every heavy
/// engine/voice/ML channel returns Value::Null (honest degrade), keeping a
/// blanket `channel.starts_with("uki:")` prefix route safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "uki:getStatus" => get_status(),
        "uki:getConfig" => get_config(app),
        "uki:updateConfig" => {
            let partial = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &partial)
        }
        "uki:resetConfig" => reset_config(app),
        _ => Value::Null,
    }
}
