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

use crate::paths::DexPaths;
use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CONFIG_FILE: &str = "dex-api-config.json";
// electron-store: `new Store({ name: 'dex-webhooks' })` -> flat JSON whose
// top-level `subscriptions` key holds the WebhookSubscription[] array.
const WEBHOOK_FILE: &str = "dex-webhooks.json";

// Webhook HTTP delivery limits (the live runtime's request had no explicit cap;
// we add sane ones so a hostile endpoint can't hang the dispatcher thread).
const WEBHOOK_TIMEOUT: Duration = Duration::from_secs(8);
const WEBHOOK_MAX_RESP_BYTES: u64 = 64 * 1024;

// --- file IO (electron-store: flat JSON under appData) -----------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .dex_data_dir()
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
        Ok(s) => crate::write_atomic(store_path(app, name), s).is_ok(),
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

// --- heavy-channel helpers ---------------------------------------------------

// `Date.now()` parity: epoch milliseconds as i64.
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// setEnabled(enabled): persist `enabled` into the same flat config file, then
// return getConfig() (matching the `api:set-enabled` handler's return). The live
// HTTP server start/stop is runtime behavior, not data, and is intentionally not
// ported; we emit `api:enabled-changed` so a future runtime / the renderer can
// react to the persisted flag flip.
fn set_enabled(app: &tauri::AppHandle, enabled: bool) -> Value {
    let raw = read_file(app, CONFIG_FILE);
    let mut obj = raw.as_object().cloned().unwrap_or_default();
    obj.insert("enabled".into(), json!(enabled));
    write_file(app, CONFIG_FILE, &Value::Object(obj));
    crate::native_ops::emit_event(app, "api:enabled-changed", &json!({ "enabled": enabled }));
    get_config(app)
}

// regenerateApiKey(): mint a fresh `dex_...` key, persist it under `apiKey` in
// the flat config file, and return the new key string (the `api:regenerate-key`
// handler returns the raw string).
fn regenerate_api_key(app: &tauri::AppHandle) -> Value {
    let key = generate_api_key();
    let raw = read_file(app, CONFIG_FILE);
    let mut obj = raw.as_object().cloned().unwrap_or_default();
    obj.insert("apiKey".into(), json!(key.clone()));
    write_file(app, CONFIG_FILE, &Value::Object(obj));
    json!(key)
}

// HMAC-SHA256(key, msg) -> lowercase hex, matching Node's
// crypto.createHmac('sha256', secret).update(msg).digest('hex'). Built on the
// shell's one pure-Rust SHA-256 (crate::licensing::sha256_hex); no new dep.
// HMAC = H((k0 ^ opad) || H((k0 ^ ipad) || msg)), block size 64 for SHA-256.
fn hmac_sha256_hex(key: &[u8], msg: &[u8]) -> String {
    const BLOCK: usize = 64;
    // k0: keys longer than the block are hashed first, then zero-padded to BLOCK.
    let mut k0 = [0u8; BLOCK];
    if key.len() > BLOCK {
        let hashed = hex_to_bytes(&crate::licensing::sha256_hex(key));
        for (i, b) in hashed.iter().enumerate().take(BLOCK) {
            k0[i] = *b;
        }
    } else {
        for (i, b) in key.iter().enumerate() {
            k0[i] = *b;
        }
    }

    let mut ipad = [0u8; BLOCK];
    let mut opad = [0u8; BLOCK];
    for i in 0..BLOCK {
        ipad[i] = k0[i] ^ 0x36;
        opad[i] = k0[i] ^ 0x5c;
    }

    // inner = H((k0 ^ ipad) || msg)
    let mut inner_in = Vec::with_capacity(BLOCK + msg.len());
    inner_in.extend_from_slice(&ipad);
    inner_in.extend_from_slice(msg);
    let inner = hex_to_bytes(&crate::licensing::sha256_hex(&inner_in));

    // outer = H((k0 ^ opad) || inner)
    let mut outer_in = Vec::with_capacity(BLOCK + inner.len());
    outer_in.extend_from_slice(&opad);
    outer_in.extend_from_slice(&inner);
    crate::licensing::sha256_hex(&outer_in)
}

// Decode a lowercase hex string into bytes (used to recover raw SHA-256 digests
// from the shell's hex-only helper). Non-hex input yields an empty/partial vec,
// which is acceptable for our internal, always-hex inputs.
fn hex_to_bytes(s: &str) -> Vec<u8> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() / 2);
    let mut i = 0;
    while i + 1 < bytes.len() {
        let hi = (bytes[i] as char).to_digit(16);
        let lo = (bytes[i + 1] as char).to_digit(16);
        match (hi, lo) {
            (Some(h), Some(l)) => out.push(((h << 4) | l) as u8),
            _ => break,
        }
        i += 2;
    }
    out
}

// triggerWebhook(event, payload): REAL native delivery. Reads the dex-webhooks
// store, and for every enabled subscription that listens for `event`, POSTs the
// signed `{ event, timestamp, data }` envelope to its URL via ureq with the
// exact Electron headers, then persists lastTriggered / failureCount (disabling
// a sub after 5 consecutive failures, matching the source). Returns void
// (Value::Null) — the handler is `Promise<void>`.
fn trigger_webhook(app: &tauri::AppHandle, event: &str, payload: &Value) -> Value {
    // Respect the webhooksEnabled config gate (config.webhooksEnabled).
    let cfg = get_config(app);
    if !cfg
        .get("webhooksEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
    {
        return Value::Null;
    }

    let store = read_file(app, WEBHOOK_FILE);
    let mut subs = store
        .get("subscriptions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if subs.is_empty() {
        return Value::Null;
    }

    let agent = ureq::AgentBuilder::new().timeout(WEBHOOK_TIMEOUT).build();
    let mut changed = false;

    for sub in subs.iter_mut() {
        let enabled = sub.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
        let listens = sub
            .get("events")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().any(|e| e.as_str() == Some(event)))
            .unwrap_or(false);
        if !enabled || !listens {
            continue;
        }

        let url = match sub.get("url").and_then(|v| v.as_str()) {
            Some(u) if !u.is_empty() => u.to_string(),
            _ => continue,
        };
        let secret = sub.get("secret").and_then(|v| v.as_str()).unwrap_or("");

        // Envelope (exact key order/shape of the Electron webhookPayload).
        let envelope = json!({
            "event": event,
            "timestamp": now_ms(),
            "data": payload,
        });
        let body = serde_json::to_string(&envelope).unwrap_or_else(|_| "{}".to_string());
        let signature = hmac_sha256_hex(secret.as_bytes(), body.as_bytes());

        let result = agent
            .post(&url)
            .set("Content-Type", "application/json")
            .set("X-Dex-Signature", &format!("sha256={}", signature))
            .set("X-Dex-Event", event)
            .send_string(&body);

        let obj = match sub.as_object_mut() {
            Some(o) => o,
            None => continue,
        };
        changed = true;

        match result {
            Ok(resp) => {
                // Drain (capped) so the connection can be reused/closed cleanly.
                let mut sink = Vec::new();
                let _ = resp
                    .into_reader()
                    .take(WEBHOOK_MAX_RESP_BYTES)
                    .read_to_end(&mut sink);
                obj.insert("lastTriggered".into(), json!(now_ms()));
                obj.insert("failureCount".into(), json!(0));
            }
            Err(_) => {
                let next = obj
                    .get("failureCount")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0)
                    + 1;
                obj.insert("failureCount".into(), json!(next));
                if next >= 5 {
                    obj.insert("enabled".into(), json!(false));
                }
            }
        }
    }

    if changed {
        let mut root = store.as_object().cloned().unwrap_or_default();
        root.insert("subscriptions".into(), Value::Array(subs));
        write_file(app, WEBHOOK_FILE, &Value::Object(root));
    }
    Value::Null
}

/// Route an `api:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the pure-data getters are ported; every
/// heavy/runtime channel returns Value::Null (honest degrade), so routing all
/// of `api:*` here is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "api:get-config" => get_config(app),
        "api:get-key" => get_api_key(app),
        // setEnabled(enabled) -> getConfig(). The renderer sends a positional
        // array; arg 0 is the boolean (missing/non-bool -> false, matching JS
        // coercion of an absent arg).
        "api:set-enabled" => {
            let enabled = args
                .get(0)
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            set_enabled(app, enabled)
        }
        // regenerateApiKey() -> new key string.
        "api:regenerate-key" => regenerate_api_key(app),
        // triggerWebhook(event, payload) -> void. arg 0 = event, arg 1 = payload.
        "api:trigger-webhook" => {
            let event = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let payload = args.get(1).cloned().unwrap_or(Value::Null);
            if event.is_empty() {
                return Value::Null;
            }
            trigger_webhook(app, event, &payload)
        }
        _ => Value::Null,
    }
}
