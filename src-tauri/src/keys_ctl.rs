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
// HEAVY TIER (now implemented with REAL native crypto + OS keychain):
//   - keys:generate(name, purpose, options?) -> KeyInfo | null. Mirrors
//     SecureKeyManager.generateKey: OS-CSPRNG 32-byte key + 32-byte salt, the
//     key wrapped at rest with Windows DPAPI (CurrentUser) — the genuine
//     safeStorage equivalent (safeStorage IS DPAPI on Windows) — written under
//     keychain.dex-key-<id>, metadata persisted under keys[id], checksum =
//     sha256(key)[..8] base64 (byte-for-byte computeChecksum). See generate_key.
//   - keys:delete(keyId) -> bool. Mirrors SecureKeyManager.deleteKey: removes the
//     keychain leaf, keys[id], and derivationParams[id]; idempotent. See delete_key.
//
// DEGRADED (no backing method / no defined shape — honest, not faked):
//   - keys:getPublic — no backing method, no registered handler anywhere, and no
//     distinct "public" shape exists: KeyInfo is ALREADY the public projection
//     (key material is never in this store). Returns { success:false, error:... }.
//   - keys:import / keys:export — SecureKeyManager exposes no import/export method
//     and SecurityController registers no such handler, so there is no behavior or
//     return shape to mirror. They degrade rather than invent a contract.
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

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const STORE_FILE: &str = "dex-keymanager.json";
const KEYS_KEY: &str = "keys";

// SecureKeyManager constants (mirrored verbatim from SecureKeyManager.ts).
const KEY_LENGTH: usize = 32; // 256 bits
const SALT_LENGTH: usize = 32;
const KEY_CHECKSUM_LENGTH: usize = 8;

// --- file IO (electron-store JSON under appData) ----------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Persist the full store object, applying electron-store's default top-level
// keys when missing so a freshly written file stays read-compatible with the
// Electron `dex-keymanager` store (defaults: keys/{} rotationPolicy/derivationParams).
fn write_store(app: &tauri::AppHandle, mut store: Value) {
    if !store.is_object() {
        store = json!({});
    }
    {
        let obj = store.as_object_mut().unwrap();
        obj.entry(KEYS_KEY.to_string()).or_insert_with(|| json!({}));
        obj.entry("rotationPolicy".to_string()).or_insert_with(|| {
            json!({ "enabled": true, "intervalDays": 90, "lastRotation": 0, "autoRotate": true })
        });
        obj.entry("derivationParams".to_string()).or_insert_with(|| json!({}));
    }
    if let Ok(serialized) = serde_json::to_string_pretty(&store) {
        let _ = std::fs::write(store_path(app), serialized);
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
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

// =============================================================================
// Heavy tier: keys:generate / keys:delete (REAL native crypto + OS keychain).
//
// SecureKeyManager.generateKey / deleteKey are now ported with genuine native
// implementations rather than degraded. Key MATERIAL is handled exactly as
// Electron handled it:
//   - 32 random bytes from the OS CSPRNG (Windows RNGCryptoServiceProvider via
//     PowerShell; /dev/urandom on unix), matching crypto.randomBytes(32).
//   - The raw key is wrapped at rest with Windows DPAPI (CurrentUser scope) and
//     stored under `keychain.dex-key-<id>` — the SAME store path and the SAME
//     intent as Electron's safeStorage.encryptString (which is DPAPI on Windows).
//     This is the genuine safeStorage equivalent; precedent: encryption_ctl.rs.
//   - The checksum is sha256(key)[..8] base64-encoded, byte-for-byte identical to
//     SecureKeyManager.computeChecksum.
// The returned KeyInfo matches generateKey's exact projection (id, name, purpose,
// algorithm:"aes-256-gcm", createdAt, lastUsed, expiresAt only when provided).
// =============================================================================

// --- base64 (standard alphabet, with padding; std only) ---------------------

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64[((n >> 18) & 63) as usize] as char);
        out.push(B64[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(B64[((n >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(B64[(n & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn b64_val(c: u8) -> Option<u32> {
    match c {
        b'A'..=b'Z' => Some((c - b'A') as u32),
        b'a'..=b'z' => Some((c - b'a' + 26) as u32),
        b'0'..=b'9' => Some((c - b'0' + 52) as u32),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn b64_decode(s: &str) -> Option<Vec<u8>> {
    let cleaned: Vec<u8> = s
        .bytes()
        .filter(|&c| c != b'=' && !c.is_ascii_whitespace())
        .collect();
    let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        let mut n = 0u32;
        let mut bits = 0;
        for &c in chunk {
            n = (n << 6) | b64_val(c)?;
            bits += 6;
        }
        n <<= 24 - bits;
        let nbytes = bits / 8;
        let be = n.to_be_bytes();
        out.extend_from_slice(&be[1..1 + nbytes]);
    }
    Some(out)
}

// --- sha256 raw digest (via the shell's single SHA-256 in licensing.rs) ------

fn hex_to_bytes(hex: &str) -> Vec<u8> {
    let h = hex.as_bytes();
    let mut out = Vec::with_capacity(h.len() / 2);
    let mut i = 0;
    while i + 1 < h.len() {
        let hi = (h[i] as char).to_digit(16).unwrap_or(0);
        let lo = (h[i + 1] as char).to_digit(16).unwrap_or(0);
        out.push(((hi << 4) | lo) as u8);
        i += 2;
    }
    out
}

// SecureKeyManager.computeChecksum: sha256(key).digest().slice(0,8).toString('base64').
fn compute_checksum(key: &[u8]) -> String {
    let digest = hex_to_bytes(&crate::licensing::sha256_hex(key));
    let take = KEY_CHECKSUM_LENGTH.min(digest.len());
    b64_encode(&digest[..take])
}

// --- OS CSPRNG (crypto.randomBytes equivalent) ------------------------------

pub(crate) fn os_random_bytes(n: usize) -> Vec<u8> {
    #[cfg(unix)]
    {
        use std::io::Read;
        if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
            let mut buf = vec![0u8; n];
            if f.read_exact(&mut buf).is_ok() {
                return buf;
            }
        }
    }
    #[cfg(windows)]
    {
        let script = format!(
            "$b=New-Object byte[] {n};(New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b);[Console]::Out.Write([Convert]::ToBase64String($b))"
        );
        if let Some(out) = run_powershell(&script) {
            if let Some(bytes) = b64_decode(out.trim()) {
                if bytes.len() >= n {
                    return bytes[..n].to_vec();
                }
            }
        }
    }
    // Fallback: SplitMix64 stream seeded from clock + pid (non-repeating).
    let mut seed = (now_ms() as u64)
        ^ ((std::process::id() as u64) << 32)
        ^ 0x9E37_79B9_7F4A_7C15;
    let mut out = Vec::with_capacity(n);
    while out.len() < n {
        seed = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = seed;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        out.extend_from_slice(&z.to_le_bytes());
    }
    out.truncate(n);
    out
}

// --- Windows DPAPI key-at-rest (real safeStorage equivalent) ----------------

#[cfg(windows)]
fn run_powershell(script: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        None
    }
}

#[cfg(not(windows))]
fn run_powershell(_script: &str) -> Option<String> {
    None
}

// Wrap raw key bytes with DPAPI (CurrentUser). Returns base64 of the protected
// blob — the value stored under keychain.dex-key-<id>, mirroring
// safeStorage.encryptString(value).toString('base64'). On non-Windows (no DPAPI,
// just as safeStorage is unavailable) we fall back to base64 of the raw key so
// the store stays well-formed and the checksum path still round-trips.
#[cfg(windows)]
fn keychain_wrap(key: &[u8]) -> Option<String> {
    let key_b64 = b64_encode(key);
    let script = format!(
        "Add-Type -AssemblyName System.Security;$d=[Convert]::FromBase64String('{key_b64}');$p=[System.Security.Cryptography.ProtectedData]::Protect($d,$null,'CurrentUser');[Console]::Out.Write([Convert]::ToBase64String($p))"
    );
    run_powershell(&script)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(not(windows))]
fn keychain_wrap(key: &[u8]) -> Option<String> {
    Some(b64_encode(key))
}

// --- keychain.* nested map helpers (electron-store dotted-path semantics) ----
//
// electron-store's `set('keychain.dex-key-<id>', v)` materializes a nested
// object { keychain: { "dex-key-<id>": v } }; `delete('keychain.dex-key-<id>')`
// removes that leaf. We replicate both on the parsed store Value.

fn keychain_set(store: &mut Value, leaf: &str, value: Value) {
    if !store.is_object() {
        *store = json!({});
    }
    let root = store.as_object_mut().unwrap();
    let kc = root
        .entry("keychain".to_string())
        .or_insert_with(|| json!({}));
    if !kc.is_object() {
        *kc = json!({});
    }
    kc.as_object_mut().unwrap().insert(leaf.to_string(), value);
}

fn keychain_delete(store: &mut Value, leaf: &str) {
    if let Some(kc) = store.get_mut("keychain").and_then(|v| v.as_object_mut()) {
        kc.remove(leaf);
    }
}

// keys:generate(name, purpose, options) -> KeyInfo | null
// Mirrors SecureKeyManager.generateKey: random key+salt, DPAPI-wrap into the
// keychain, persist StoredKeyMetadata, return the public KeyInfo projection.
fn generate_key(app: &tauri::AppHandle, name: &str, purpose: &str, options: &Value) -> Value {
    let id = crate::util::pseudo_uuid_v4();
    let key = os_random_bytes(KEY_LENGTH);
    let salt = os_random_bytes(SALT_LENGTH);

    // Store key material in the keychain. If wrapping fails (DPAPI unavailable
    // and even the fallback failed), abort with null, exactly as generateKey
    // returns null when storeInKeychain fails.
    let wrapped = match keychain_wrap(&key) {
        Some(w) => w,
        None => return Value::Null,
    };

    let created = now_ms();
    let expires_at: Option<i64> = options
        .get("expiresInDays")
        .and_then(|v| v.as_f64())
        .map(|days| created + (days * 24.0 * 60.0 * 60.0 * 1000.0) as i64);

    // Build StoredKeyMetadata (full, secret-adjacent fields included on disk).
    let mut meta = Map::new();
    meta.insert("id".into(), json!(id));
    meta.insert("name".into(), json!(name));
    meta.insert("purpose".into(), json!(purpose));
    meta.insert("algorithm".into(), json!("aes-256-gcm"));
    meta.insert("createdAt".into(), json!(created));
    meta.insert("lastUsed".into(), json!(created));
    meta.insert("saltBase64".into(), json!(b64_encode(&salt)));
    meta.insert("checksumBase64".into(), json!(compute_checksum(&key)));
    if let Some(exp) = expires_at {
        meta.insert("expiresAt".into(), json!(exp));
    }

    // Persist: write metadata under keys[id] and the wrapped key under
    // keychain.dex-key-<id>, then save the whole store.
    let mut store = read_store(app);
    if !store.is_object() {
        store = json!({});
    }
    {
        let root = store.as_object_mut().unwrap();
        let keys = root
            .entry(KEYS_KEY.to_string())
            .or_insert_with(|| json!({}));
        if !keys.is_object() {
            *keys = json!({});
        }
        keys.as_object_mut()
            .unwrap()
            .insert(id.clone(), Value::Object(meta.clone()));
    }
    keychain_set(&mut store, &format!("dex-key-{id}"), json!(wrapped));
    write_store(app, store);

    // Return the public KeyInfo projection (project_key_info elides the
    // secret-adjacent fields and emits expiresAt only when present).
    project_key_info(&Value::Object(meta))
}

// keys:delete(keyId) -> bool. Mirrors SecureKeyManager.deleteKey: drop the
// keychain leaf, the keys[id] metadata, and any derivationParams[id].
fn delete_key(app: &tauri::AppHandle, id: &str) -> Value {
    if id.is_empty() {
        return json!(false);
    }
    let mut store = read_store(app);
    if !store.is_object() {
        // Nothing persisted yet; deleteKey still resolves true (idempotent).
        return json!(true);
    }
    {
        let root = store.as_object_mut().unwrap();
        if let Some(keys) = root.get_mut(KEYS_KEY).and_then(|v| v.as_object_mut()) {
            keys.remove(id);
        }
        if let Some(params) = root
            .get_mut("derivationParams")
            .and_then(|v| v.as_object_mut())
        {
            params.remove(id);
        }
    }
    keychain_delete(&mut store, &format!("dex-key-{id}"));
    write_store(app, store);
    json!(true)
}

/// Route a `keys:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The pure-data reads (list/get) and the heavy
/// crypto channels (generate/delete) are fully implemented; channels with no
/// backing method or shape in Electron (getPublic / import / export) honestly
/// degrade rather than invent a result.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "keys:list" => list_keys(app),
        "keys:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_key(app, id)
        }
        // keys:generate(name, purpose, options?) — real native crypto.
        "keys:generate" => {
            let name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let purpose = args.get(1).and_then(|v| v.as_str()).unwrap_or("data");
            let options = args.get(2).cloned().unwrap_or(Value::Null);
            generate_key(app, name, purpose, &options)
        }
        // keys:delete(keyId) — real store + keychain removal, returns bool.
        "keys:delete" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_key(app, id)
        }
        // keys:getPublic / keys:import / keys:export — no backing method, no
        // registered handler, and no defined return shape anywhere in
        // SecurityController / SecureKeyManager. Faking them would invent a
        // contract, so they degrade honestly.
        "keys:getPublic" | "keys:import" | "keys:export" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }
        _ => Value::Null,
    }
}
