// =============================================================================
// DEX Tauri — API Server subsystem (port of api/ApiServer.ts).
//
// Pure-data slice only. The Electron ApiServer is mostly a live HTTP/webhook
// runtime (an http.Server, route table, rate limiter, HMAC webhook delivery);
// none of that is data CRUD. The only IPC channels that are pure data are the
// config/key getters, which read the `dex-api-config` electron-store. This
// module mirrors that store under <appData>:
//   - dex-api-config.json : { enabled, port, host, apiKey, corsOrigins,
//                             rateLimit, webhooksEnabled }  (electron-store puts
//                             each setting at the TOP LEVEL of the file, so we
//                             read/write the same flat keys — no wrapper object)
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// PORTED data channels (from initializeApiServer):
//   - api:get-config -> ApiConfig (the full settings object, with defaults)
//   - api:get-key    -> string    (the apiKey field of getConfig())
//
// API-KEY GENERATION (faithful side-effect): Electron's getConfig() reads
//   store.get('apiKey', this.generateApiKey())
// where generateApiKey() MINTS and PERSISTS a fresh key when none exists. So a
// first read has the side-effect of writing the key, and every later read is
// stable. We reproduce that: if `apiKey` is absent we generate one, persist it
// to the same file/key, and return it. Key shape is Electron's
//   `dex_${randomBytes(32).hex}`  = "dex_" + 64 lowercase hex chars.
// To stay rand-crate-free we build the 64 hex chars from two stripped
// crate::util::pseudo_uuid_v4() values (32 hex each). Collision resistance
// across one machine is all that is required (same precedent as rule_engine.rs).
//
// DIVERGENCES (documented):
//   - The HTTP server / routes / rate limiting / webhook delivery are runtime
//     behavior, not data, and are intentionally NOT ported (see skipped list).
//   - Electron's default `apiKey` is materialized on first getConfig() read.
//     Same here. All other defaults (enabled=false, port=45678, host=127.0.0.1,
//     corsOrigins=["http://localhost:*"], rateLimit=100, webhooksEnabled=true)
//     are pure defaults and are NOT persisted on read, matching electron-store's
//     `store.get(key, default)` (which returns the default without writing).
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "dex-api-config.json";

// --- file IO (electron-store: flat JSON under appData) -----------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
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

// generateApiKey(): `dex_${crypto.randomBytes(32).toString('hex')}` -> "dex_" +
// 64 lowercase hex chars. Two stripped UUIDs give exactly 64 hex chars.
fn generate_api_key() -> String {
    let mut hex: String = pseudo_uuid_v4().chars().filter(|c| *c != '-').collect();
    hex.push_str(
        &pseudo_uuid_v4()
            .chars()
            .filter(|c| *c != '-')
            .collect::<String>(),
    );
    hex.truncate(64);
    format!("dex_{}", hex)
}

// Read the `apiKey` field, minting + persisting one if absent (Electron's
// store.get('apiKey', generateApiKey()) side-effect).
fn ensure_api_key(app: &tauri::AppHandle, raw: &Value) -> String {
    if let Some(k) = raw.get("apiKey").and_then(|v| v.as_str()) {
        if !k.is_empty() {
            return k.to_string();
        }
    }
    let key = generate_api_key();
    // Persist into the same flat config file under the same `apiKey` key.
    let mut obj = raw.as_object().cloned().unwrap_or_default();
    obj.insert("apiKey".into(), json!(key));
    write_file(app, CONFIG_FILE, &Value::Object(obj));
    key
}

// getConfig(): the full ApiConfig with electron-store defaults.
fn get_config(app: &tauri::AppHandle) -> Value {
    let raw = read_file(app, CONFIG_FILE);

    let enabled = raw.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    let port = raw.get("port").and_then(|v| v.as_i64()).unwrap_or(45678);
    let host = raw
        .get("host")
        .and_then(|v| v.as_str())
        .unwrap_or("127.0.0.1")
        .to_string();
    let api_key = ensure_api_key(app, &raw);
    let cors_origins = raw
        .get("corsOrigins")
        .filter(|v| v.is_array())
        .cloned()
        .unwrap_or_else(|| json!(["http://localhost:*"]));
    let rate_limit = raw.get("rateLimit").and_then(|v| v.as_i64()).unwrap_or(100);
    let webhooks_enabled = raw
        .get("webhooksEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    json!({
        "enabled": enabled,
        "port": port,
        "host": host,
        "apiKey": api_key,
        "corsOrigins": cors_origins,
        "rateLimit": rate_limit,
        "webhooksEnabled": webhooks_enabled,
    })
}

// getApiKey(): getConfig().apiKey.
fn get_api_key(app: &tauri::AppHandle) -> Value {
    json!(ensure_api_key(app, &read_file(app, CONFIG_FILE)))
}

/// Route an `api:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the pure-data getters are ported; every
/// heavy/runtime channel returns Value::Null (honest degrade), so routing all
/// of `api:*` here is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "api:get-config" => get_config(app),
        "api:get-key" => get_api_key(app),
        // Heavy/runtime channels (set-enabled, regenerate-key, trigger-webhook)
        // need the live HTTP/webhook runtime and are intentionally not ported.
        _ => Value::Null,
    }
}
