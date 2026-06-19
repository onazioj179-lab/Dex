// =============================================================================
// DEX Tauri — Encryption subsystem (port of the `encryption:*` IPC handlers in
// EncryptionController.ts -> EncryptionService.ts).
//
// Pure-data, JSON-backed tier. Electron used one `electron-store` file named
// `dex-encryption` under userData; this mirrors that shape under <appData>:
//   - dex-encryption.json : { config: EncryptionConfig, saltBase64?, keyChecksum?,
//                             encryptedKey?, encryptedSystemKey? }
// The `config` object is the only top-level key this port reads/writes, exactly
// as electron-store persisted it (a top-level `config` key whose value is the
// EncryptionConfig). Return shapes match the Electron handlers exactly so the
// renderer is unchanged.
//
// SCOPE / SPEC NOTE: the porting spec named `getPublicKey` / `listKeys` as the
// data channels, but those channels DO NOT exist in the `encryption:` namespace
// (EncryptionController.ts / preload.ts). They belong to the `ssh:` namespace
// (already ported in ssh.rs) and the `secureKeys:` namespace. Inventing them
// here would mean fabricating return shapes, which the rules forbid. Instead this
// module ports the REAL data/CRUD surface of the `encryption:` namespace at exact
// Electron shapes:
//   - encryption:getConfig    -> EncryptionConfig (the stored `config` object,
//                                with EncryptionService defaults if unset)
//   - encryption:updateConfig -> EncryptionConfig (merged + persisted)
//   - encryption:getStatus    -> { available, enabled, locked, keySource,
//                                  lastKeyRotation } (see divergence below)
//
// EncryptionConfig is:
//   { enabled, keySource: 'password'|'system', encryptNotes, encryptMedia,
//     encryptSessions, encryptOperations, initialized, lastKeyRotation? }
//
// DIVERGENCES (documented):
//   - getStatus().available reflected Electron's safeStorage.isEncryptionAvailable()
//     (an OS-keychain probe) and getStatus().locked reflected the live in-memory
//     `isUnlocked` flag. Neither has a native equivalent in this pure-data tier:
//     there is no safeStorage and no in-process keyData here. We therefore report
//     `available: false` and `locked: true` (the safe, honest "no live key
//     material loaded" state). `enabled`, `keySource`, and `lastKeyRotation` come
//     straight from the persisted config and match Electron exactly.
//   - All key-material / crypto-runtime channels (encrypt, decrypt, unlock,
//     lock, disable, initWithPassword, initWithSystemKey, isEncrypted) require the
//     native crypto + OS keychain runtime and are NOT ported (see dispatch()).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "dex-encryption.json";
const CONFIG_KEY: &str = "config";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO (electron-store JSON under appData) -----------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_store(app: &tauri::AppHandle, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app), s).is_ok(),
        Err(_) => false,
    }
}

// EncryptionService store defaults for the `config` object (constructor defaults).
fn default_config() -> Value {
    json!({
        "enabled": false,
        "keySource": "system",
        "encryptNotes": true,
        "encryptMedia": true,
        "encryptSessions": true,
        "encryptOperations": false,
        "initialized": false,
    })
}

// EncryptionService.getConfig(): encryptionStore.get('config').
fn get_config(app: &tauri::AppHandle) -> Value {
    match read_store(app).get(CONFIG_KEY) {
        Some(v) if v.is_object() => v.clone(),
        _ => default_config(),
    }
}

// EncryptionService.updateConfig(updates): { ...config, ...updates } then persist.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut config = get_config(app).as_object().cloned().unwrap_or_default();
    if let Some(u) = updates.as_object() {
        for (k, v) in u {
            config.insert(k.clone(), v.clone());
        }
    }
    let merged = Value::Object(config);

    // Persist back into the top-level `config` key, preserving any other
    // top-level keys electron-store may have written (salt/checksum/keys).
    let mut store = read_store(app).as_object().cloned().unwrap_or_default();
    store.insert(CONFIG_KEY.into(), merged.clone());
    write_store(app, &Value::Object(store));

    merged
}

// EncryptionService.getStatus(). See header for available/locked divergence.
fn get_status(app: &tauri::AppHandle) -> Value {
    let config = get_config(app);
    let enabled = config.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    let initialized = config
        .get("initialized")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    // Electron: keySource = config.initialized ? config.keySource : null.
    let key_source = if initialized {
        config.get("keySource").cloned().unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    // Electron: lastKeyRotation ?? null.
    let last_rotation = config
        .get("lastKeyRotation")
        .filter(|v| v.is_number())
        .cloned()
        .unwrap_or(Value::Null);

    json!({
        "available": false, // no safeStorage in this tier (divergence)
        "enabled": enabled,
        "locked": true,     // no in-memory key material in this tier (divergence)
        "keySource": key_source,
        "lastKeyRotation": last_rotation,
    })
}

/// Route an `encryption:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is handled:
/// the three data channels are ported, and the crypto/keychain-runtime channels
/// honestly degrade (Value::Null, or a shaped failure object where the renderer
/// reads `.success`). NOTE on prefixRouteSafe: the spec also names a `disable`
/// channel that the renderer reads as { success }, so this dispatcher returns a
/// shaped failure for it rather than null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let _ = now_ms; // kept for parity with sibling modules; no id/ts produced here
    match channel {
        // --- ported data channels ---
        "encryption:getConfig" => get_config(app),
        "encryption:updateConfig" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &updates)
        }
        "encryption:getStatus" => get_status(app),

        // --- heavy / runtime channels: not ported (need native crypto + OS
        // keychain). Renderer reads `.success` on these, so return a shaped
        // failure object rather than bare null (honest degrade).
        "encryption:encrypt"
        | "encryption:decrypt"
        | "encryption:unlock"
        | "encryption:disable"
        | "encryption:initWithPassword"
        | "encryption:initWithSystemKey" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }
        // lock() returns { success: true } in Electron but its only effect is
        // zeroing in-memory key material that does not exist in this tier; there
        // is nothing to lock, so honestly report failure.
        "encryption:lock" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }
        // isEncrypted is a pure structural predicate but it is a heavy-path helper
        // tied to the crypto runtime per the porting spec; not ported.
        "encryption:isEncrypted" => Value::Null,

        _ => Value::Null,
    }
}
