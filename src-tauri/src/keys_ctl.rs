// =============================================================================
// DEX Tauri — Keys subsystem (data/read tier of the `keys:*` IPC surface from
// SecurityController.registerExtendedSecurityHandlers, backed by
// SecureKeyManager).
//
// Pure-data, JSON-backed tier. Electron persisted key METADATA in an
// `electron-store` named `dex-keymanager` (file `dex-keymanager.json` under
// userData). This mirrors that file under <appData> with the SAME name and the
// SAME top-level `keys` key, whose value is a keyed map:
//   { keys: { [id]: StoredKeyMetadata }, rotationPolicy: {...}, derivationParams: {...} }
// Only the `keys` map is read here. The read handlers PROJECT each
// StoredKeyMetadata down to the public KeyInfo shape (SecureKeyManager.listKeys
// / getKeyInfo): the secret-adjacent fields `saltBase64` and `checksumBase64`
// are stripped, exactly as Electron does. The actual key MATERIAL never lived in
// this store anyway — it sits in the OS keychain (safeStorage) — so these reads
// never touch native crypto.
//
// KeyInfo (the exact projected shape, field-for-field):
//   { id, name, purpose, algorithm, createdAt, lastUsed,
//     rotatedAt?, expiresAt? }
// `rotatedAt` / `expiresAt` are optional: Electron builds the object as
//   { ..., rotatedAt: meta.rotatedAt, expiresAt: meta.expiresAt }
// and when those are `undefined` the keys are dropped during IPC/JSON
// serialization. We replicate that by inserting them ONLY when present in the
// stored metadata (never emitting an explicit null), so the renderer sees an
// identical object.
//
// CHANNELS:
//   - keys:list      -> KeyInfo[]        (Object.values(keys).map(project))
//   - keys:get       -> KeyInfo | null   (keys[id] projected, or null if absent)
//                       NB: in Electron this read is exposed via
//                       SecureKeyManager.getKeyInfo (registered as
//                       `secureKeys:getKeyInfo`, not under `keys:`). It is the
//                       canonical pure-data point-read of the same store and the
//                       same KeyInfo shape, so it is ported here under the
//                       assigned `keys:get` channel with no shape change.
//
// SKIPPED (heavy / not ported — see channelsSkipped):
//   - keys:getPublic — no backing method, no registered handler anywhere, and no
//     distinct "public" shape exists: KeyInfo is ALREADY the public projection
//     (key material is never in this store). Emitting anything would invent a
//     shape, so the channel is omitted and the prefix route returns null.
//   - keys:generate / keys:import / keys:export / keys:delete — all require the
//     native runtime (Node `crypto` key generation, `safeStorage` OS-keychain
//     encrypt/decrypt, checksum derivation). Not implemented and not faked.
//
// DIVERGENCES (documented):
//   - `keys:list` ordering: Electron returns Object.values(keys), whose order is
//     V8 insertion order over the JSON object. This repo builds serde_json
//     WITHOUT the `preserve_order` feature (see cmd_export_bundle.rs /
//     pattern_tracking.rs), so its Map is BTreeMap-backed and yields keys sorted
//     by id instead. The renderer key list is unordered for display (it
//     sorts/groups for the UI), so this ordering difference is cosmetic; no field
//     shape changes.
//   - No lock/unlock gating: listKeys/getKeyInfo in Electron read the store
//     directly and never check `isLocked` (only key MATERIAL retrieval does), so
//     these reads return metadata regardless of lock state — matched here.
//   - If the store file has not been written yet, `keys` defaults to {} so
//     list -> [] and get -> null, matching the electron-store `keys: {}` default.
// =============================================================================

use serde_json::{Map, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "dex-keymanager.json";
const KEYS_KEY: &str = "keys";

// --- file IO (electron-store JSON under appData) ----------------------------

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

// The `keys` top-level key is a keyed map { [id]: StoredKeyMetadata }.
fn read_keys(app: &tauri::AppHandle) -> Map<String, Value> {
    read_store(app)
        .get(KEYS_KEY)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

// Project StoredKeyMetadata -> KeyInfo, dropping saltBase64/checksumBase64 and
// emitting rotatedAt/expiresAt only when present (mirrors `{ rotatedAt: undefined }`
// being elided during serialization).
fn project_key_info(meta: &Value) -> Value {
    let mut out = Map::new();
    // Required fields: copy through verbatim, defaulting to null only if the
    // stored object is malformed (Electron would carry undefined the same way).
    for field in ["id", "name", "purpose", "algorithm", "createdAt", "lastUsed"] {
        out.insert(field.to_string(), meta.get(field).cloned().unwrap_or(Value::Null));
    }
    // Optional fields: include only when present (not absent / not null).
    for field in ["rotatedAt", "expiresAt"] {
        if let Some(v) = meta.get(field) {
            if !v.is_null() {
                out.insert(field.to_string(), v.clone());
            }
        }
    }
    Value::Object(out)
}

// keys:list -> Object.values(keys).map(project) : KeyInfo[]
fn list_keys(app: &tauri::AppHandle) -> Value {
    let keys = read_keys(app);
    let values: Vec<Value> = keys.values().map(project_key_info).collect();
    Value::Array(values)
}

// keys:get(id) -> getKeyInfo(id) : KeyInfo | null
fn get_key(app: &tauri::AppHandle, id: &str) -> Value {
    match read_keys(app).get(id) {
        Some(meta) => project_key_info(meta),
        None => Value::Null,
    }
}

/// Route a `keys:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the pure-data read channels are handled; the
/// generate/import/export/delete family (and the undefined-shaped getPublic)
/// return Value::Null — an honest degrade rather than a faked result.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "keys:list" => list_keys(app),
        "keys:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_key(app, id)
        }
        _ => Value::Null,
    }
}
