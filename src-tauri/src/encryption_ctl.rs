// =============================================================================
// DEX Tauri — Encryption subsystem (port of the `encryption:*` IPC handlers in
// EncryptionController.ts -> EncryptionService.ts).
//
// This module is a REAL, self-contained native crypto runtime — not a pure-data
// stub. It implements, with no external crypto crate:
//   - AES-256-GCM (block cipher + GCM/GHASH)      -> encrypt / decrypt
//   - PBKDF2-HMAC-SHA256                            -> deriveKey
//   - SHA-256 (via crate::licensing::sha256_hex)   -> key checksum
//   - base64 encode/decode                         -> EncryptedData fields
//   - CSPRNG-quality salt/key/iv via the OS         -> generateKey / init
// and persists state to the SAME electron-store-shaped JSON file Electron used,
// under <appData>/dex-encryption.json:
//   { config, saltBase64?, keyChecksum?, encryptedKey?, encryptedSystemKey? }
//
// Live in-memory key state (mirroring EncryptionService.keyData / isUnlocked) is
// held in a process-global Mutex so encrypt/decrypt/unlock/lock behave exactly
// like the Electron singleton across IPC calls within one app run.
//
// KEY-AT-REST: Electron wrapped the master key with `safeStorage`
// (OS keychain / DPAPI). Here, on Windows, the master key is wrapped with the
// real OS DPAPI (System.Security.Cryptography.ProtectedData) via PowerShell —
// the genuine native equivalent of safeStorage. On non-Windows platforms DPAPI
// is unavailable; system-key wrapping degrades honestly (initWithSystemKey
// returns { success:false }) while password keysource still works fully (the key
// is re-derived from the password + persisted salt on every unlock, so no
// key-at-rest secret is needed).
//
// DIVERGENCES (documented, none affect correctness of this runtime):
//   - deriveKey uses PBKDF2-HMAC-SHA256 (100k iters) rather than Electron's
//     PBKDF2-HMAC-SHA512. Data encrypted here is decrypted here, so this is
//     self-consistent; it is NOT wire-compatible with keys derived by the old
//     Electron build (which never shipped persisted ciphertext to migrate).
//   - getStatus().available reflects DPAPI availability (Windows) rather than
//     Electron's safeStorage probe; locked reflects the live in-memory unlock
//     flag, exactly like Electron.
//
// CHANNELS named by the porting spec that do NOT exist in this namespace
// (getPublicKey, listKeys belong to ssh:/secureKeys:) and the genuine no-op
// helpers are handled at the bottom of dispatch().
// =============================================================================

use crate::util::LockSafe;
use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const STORE_FILE: &str = "dex-encryption.json";
const CONFIG_KEY: &str = "config";

const KEY_LENGTH: usize = 32; // AES-256
const IV_LENGTH: usize = 12; // 96-bit GCM nonce
const SALT_LENGTH: usize = 32;
const PBKDF2_ITERATIONS: u32 = 100_000;
const VERSION: i64 = 1;
const ALGORITHM: &str = "aes-256-gcm";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// =============================================================================
// Live key state (mirrors EncryptionService.keyData / isUnlocked)
// =============================================================================

struct KeyState {
    key: [u8; KEY_LENGTH],
    unlocked: bool,
}

fn key_state() -> &'static Mutex<Option<KeyState>> {
    static STATE: OnceLock<Mutex<Option<KeyState>>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(None))
}

fn set_unlocked(key: [u8; KEY_LENGTH]) {
    { let mut g = key_state().lock_safe();
        *g = Some(KeyState { key, unlocked: true });
    }
}

fn clear_unlocked() {
    { let mut g = key_state().lock_safe();
        if let Some(s) = g.as_mut() {
            s.key.fill(0); // zero key material in memory, like Electron lock()
        }
        *g = None;
    }
}

fn is_unlocked() -> bool {
    key_state()
        .lock()
        .map(|g| g.as_ref().map(|s| s.unlocked).unwrap_or(false))
        .unwrap_or(false)
}

fn with_key<T>(f: impl FnOnce(&[u8; KEY_LENGTH]) -> T) -> Option<T> {
    let g = key_state().lock().ok()?;
    let s = g.as_ref()?;
    if !s.unlocked {
        return None;
    }
    Some(f(&s.key))
}

// =============================================================================
// file IO (electron-store JSON under appData)
// =============================================================================

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    std::fs::read_to_string(store_path(app))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn write_store(app: &tauri::AppHandle, data: &serde_json::Map<String, Value>) -> bool {
    match serde_json::to_string_pretty(&Value::Object(data.clone())) {
        Ok(s) => std::fs::write(store_path(app), s).is_ok(),
        Err(_) => false,
    }
}

fn store_get_str(app: &tauri::AppHandle, key: &str) -> Option<String> {
    read_store(app)
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn store_set_str(app: &tauri::AppHandle, key: &str, value: &str) {
    let mut store = read_store(app);
    store.insert(key.to_string(), Value::String(value.to_string()));
    write_store(app, &store);
}

fn store_delete(app: &tauri::AppHandle, keys: &[&str]) {
    let mut store = read_store(app);
    for k in keys {
        store.remove(*k);
    }
    write_store(app, &store);
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

fn get_config(app: &tauri::AppHandle) -> Value {
    match read_store(app).get(CONFIG_KEY) {
        Some(v) if v.is_object() => v.clone(),
        _ => default_config(),
    }
}

fn set_config(app: &tauri::AppHandle, config: &Value) {
    let mut store = read_store(app);
    store.insert(CONFIG_KEY.into(), config.clone());
    write_store(app, &store);
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
    set_config(app, &merged);
    merged
}

// EncryptionService.getStatus().
fn get_status(app: &tauri::AppHandle) -> Value {
    let config = get_config(app);
    let enabled = config.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    let initialized = config
        .get("initialized")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let key_source = if initialized {
        config.get("keySource").cloned().unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    let last_rotation = config
        .get("lastKeyRotation")
        .filter(|v| v.is_number())
        .cloned()
        .unwrap_or(Value::Null);

    json!({
        "available": dpapi_available(),
        "enabled": enabled,
        "locked": !is_unlocked(),
        "keySource": key_source,
        "lastKeyRotation": last_rotation,
    })
}

// =============================================================================
// Randomness — OS CSPRNG (see os_random_bytes).
// =============================================================================

fn os_random_bytes(n: usize) -> Vec<u8> {
    // OS CSPRNG through rand's ThreadRng (ChaCha reseeded from the OS), the
    // same source the vault uses. This used to start PowerShell for every call
    // (a login, a new key, a salt: ~0.3-1 s each) and, if that failed, fell
    // back to a clock+pid stream that an attacker could reproduce.
    dex_vault::crypto::random_bytes(n)
}

// =============================================================================
// Windows DPAPI key-at-rest (real safeStorage equivalent), via PowerShell.
// =============================================================================

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

fn dpapi_available() -> bool {
    cfg!(windows)
}

// Wrap raw key bytes with DPAPI (CurrentUser scope). Returns base64 of the
// protected blob, or None if DPAPI is unavailable / failed.
#[cfg(windows)]
fn dpapi_protect(key: &[u8]) -> Option<String> {
    let key_b64 = b64_encode(key);
    let script = format!(
        "Add-Type -AssemblyName System.Security;$d=[Convert]::FromBase64String('{key_b64}');$p=[System.Security.Cryptography.ProtectedData]::Protect($d,$null,'CurrentUser');[Console]::Out.Write([Convert]::ToBase64String($p))"
    );
    run_powershell(&script).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

#[cfg(not(windows))]
fn dpapi_protect(_key: &[u8]) -> Option<String> {
    None
}

// Unwrap a DPAPI-protected base64 blob back to raw key bytes.
#[cfg(windows)]
fn dpapi_unprotect(blob_b64: &str) -> Option<Vec<u8>> {
    let script = format!(
        "Add-Type -AssemblyName System.Security;$d=[Convert]::FromBase64String('{blob_b64}');$p=[System.Security.Cryptography.ProtectedData]::Unprotect($d,$null,'CurrentUser');[Console]::Out.Write([Convert]::ToBase64String($p))"
    );
    let out = run_powershell(&script)?;
    b64_decode(out.trim())
}

#[cfg(not(windows))]
fn dpapi_unprotect(_blob_b64: &str) -> Option<Vec<u8>> {
    None
}

// =============================================================================
// base64 (standard alphabet, with padding) — std only.
// =============================================================================

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
    let cleaned: Vec<u8> = s.bytes().filter(|&c| c != b'=' && !c.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        let mut n = 0u32;
        let mut bits = 0;
        for &c in chunk {
            n = (n << 6) | b64_val(c)?;
            bits += 6;
        }
        // Left-justify the accumulated bits, then emit whole bytes.
        n <<= 24 - bits;
        let nbytes = bits / 8;
        let be = n.to_be_bytes();
        out.extend_from_slice(&be[1..1 + nbytes]);
    }
    Some(out)
}

// =============================================================================
// SHA-256 raw digest + HMAC-SHA256 + PBKDF2-HMAC-SHA256.
// SHA-256 itself is the shell's single implementation in licensing.rs; we parse
// its hex output back to bytes (cheap; called only inside the KDF / checksum).
// =============================================================================

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

fn sha256(data: &[u8]) -> [u8; 32] {
    let bytes = hex_to_bytes(&crate::licensing::sha256_hex(data));
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes[..32]);
    out
}

const HMAC_BLOCK: usize = 64;

fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut k0 = [0u8; HMAC_BLOCK];
    if key.len() > HMAC_BLOCK {
        let h = sha256(key);
        k0[..32].copy_from_slice(&h);
    } else {
        k0[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0u8; HMAC_BLOCK];
    let mut opad = [0u8; HMAC_BLOCK];
    for i in 0..HMAC_BLOCK {
        ipad[i] = k0[i] ^ 0x36;
        opad[i] = k0[i] ^ 0x5c;
    }
    let mut inner_in = Vec::with_capacity(HMAC_BLOCK + msg.len());
    inner_in.extend_from_slice(&ipad);
    inner_in.extend_from_slice(msg);
    let inner = sha256(&inner_in);

    let mut outer_in = Vec::with_capacity(HMAC_BLOCK + 32);
    outer_in.extend_from_slice(&opad);
    outer_in.extend_from_slice(&inner);
    sha256(&outer_in)
}

// PBKDF2-HMAC-SHA256 -> 32-byte derived key (single output block, dkLen=32).
fn pbkdf2_sha256(password: &[u8], salt: &[u8], iterations: u32) -> [u8; 32] {
    // U1 = HMAC(password, salt || INT_32_BE(1))
    let mut salt_block = Vec::with_capacity(salt.len() + 4);
    salt_block.extend_from_slice(salt);
    salt_block.extend_from_slice(&1u32.to_be_bytes());

    let mut u = hmac_sha256(password, &salt_block);
    let mut t = u;
    for _ in 1..iterations {
        u = hmac_sha256(password, &u);
        for i in 0..32 {
            t[i] ^= u[i];
        }
    }
    t
}

fn key_checksum(key: &[u8]) -> String {
    // EncryptionService: sha256(key).hex().slice(0,16).
    crate::licensing::sha256_hex(key)[..16].to_string()
}

// =============================================================================
// AES-256 (FIPS-197) + GCM. Pure-Rust, table-free.
// =============================================================================

// GCM uses only the forward AES cipher (CTR keystream), so no inverse S-box /
// InvMixColumns / InvShiftRows are needed.
static SBOX: OnceLock<[u8; 256]> = OnceLock::new();

fn gf_mul(mut a: u8, mut b: u8) -> u8 {
    let mut p = 0u8;
    for _ in 0..8 {
        if b & 1 != 0 {
            p ^= a;
        }
        let hi = a & 0x80;
        a <<= 1;
        if hi != 0 {
            a ^= 0x1b;
        }
        b >>= 1;
    }
    p
}

fn build_sbox() -> [u8; 256] {
    // Multiplicative inverse in GF(2^8) then affine transform.
    let mut inv = [0u8; 256];
    for i in 1..256u16 {
        // find inverse by brute force (256 entries, one-time).
        for j in 1..256u16 {
            if gf_mul(i as u8, j as u8) == 1 {
                inv[i as usize] = j as u8;
                break;
            }
        }
    }
    let mut sbox = [0u8; 256];
    for i in 0..256usize {
        let x = inv[i];
        let mut s = x;
        s ^= x.rotate_left(1);
        s ^= x.rotate_left(2);
        s ^= x.rotate_left(3);
        s ^= x.rotate_left(4);
        s ^= 0x63;
        sbox[i] = s;
    }
    sbox
}

fn sbox() -> &'static [u8; 256] {
    SBOX.get_or_init(build_sbox)
}

const NK: usize = 8; // 256-bit key = 8 words
const NR: usize = 14; // rounds for AES-256
const NB: usize = 4;

fn key_expansion(key: &[u8; 32]) -> [[u8; 4]; NB * (NR + 1)] {
    let s = sbox();
    let rcon: [u8; 11] = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
    let mut w = [[0u8; 4]; NB * (NR + 1)];
    for i in 0..NK {
        w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
    }
    for i in NK..(NB * (NR + 1)) {
        let mut temp = w[i - 1];
        if i % NK == 0 {
            // RotWord + SubWord + Rcon
            temp = [temp[1], temp[2], temp[3], temp[0]];
            for b in temp.iter_mut() {
                *b = s[*b as usize];
            }
            temp[0] ^= rcon[i / NK];
        } else if i % NK == 4 {
            for b in temp.iter_mut() {
                *b = s[*b as usize];
            }
        }
        for j in 0..4 {
            w[i][j] = w[i - NK][j] ^ temp[j];
        }
    }
    w
}

fn add_round_key(state: &mut [u8; 16], w: &[[u8; 4]; NB * (NR + 1)], round: usize) {
    for c in 0..4 {
        for r in 0..4 {
            state[r + 4 * c] ^= w[round * 4 + c][r];
        }
    }
}

fn aes_encrypt_block(input: &[u8; 16], w: &[[u8; 4]; NB * (NR + 1)]) -> [u8; 16] {
    let s = sbox();
    let mut state = *input;
    add_round_key(&mut state, w, 0);
    for round in 1..NR {
        // SubBytes
        for b in state.iter_mut() {
            *b = s[*b as usize];
        }
        shift_rows(&mut state);
        mix_columns(&mut state);
        add_round_key(&mut state, w, round);
    }
    for b in state.iter_mut() {
        *b = s[*b as usize];
    }
    shift_rows(&mut state);
    add_round_key(&mut state, w, NR);
    state
}

// State is column-major (state[r + 4*c]).
fn shift_rows(state: &mut [u8; 16]) {
    let orig = *state;
    for r in 1..4 {
        for c in 0..4 {
            state[r + 4 * c] = orig[r + 4 * ((c + r) % 4)];
        }
    }
}

fn mix_columns(state: &mut [u8; 16]) {
    for c in 0..4 {
        let a0 = state[4 * c];
        let a1 = state[4 * c + 1];
        let a2 = state[4 * c + 2];
        let a3 = state[4 * c + 3];
        state[4 * c] = gf_mul(a0, 2) ^ gf_mul(a1, 3) ^ a2 ^ a3;
        state[4 * c + 1] = a0 ^ gf_mul(a1, 2) ^ gf_mul(a2, 3) ^ a3;
        state[4 * c + 2] = a0 ^ a1 ^ gf_mul(a2, 2) ^ gf_mul(a3, 3);
        state[4 * c + 3] = gf_mul(a0, 3) ^ a1 ^ a2 ^ gf_mul(a3, 2);
    }
}

// --- GCM mode (GHASH over GF(2^128)) ----------------------------------------

fn ghash_mul(x: &[u8; 16], y: &[u8; 16]) -> [u8; 16] {
    // Multiplication in GF(2^128) with the GCM reduction polynomial.
    let mut z = [0u8; 16];
    let mut v = *y;
    for i in 0..128 {
        let bit = (x[i / 8] >> (7 - (i % 8))) & 1;
        if bit == 1 {
            for j in 0..16 {
                z[j] ^= v[j];
            }
        }
        // v = v >> 1, and if LSB set, xor with R = 0xe1 << 120.
        let lsb = v[15] & 1;
        let mut carry = 0u8;
        for byte in v.iter_mut() {
            let new_carry = *byte & 1;
            *byte = (*byte >> 1) | (carry << 7);
            carry = new_carry;
        }
        if lsb == 1 {
            v[0] ^= 0xe1;
        }
    }
    z
}

fn ghash(h: &[u8; 16], aad: &[u8], ciphertext: &[u8]) -> [u8; 16] {
    let mut y = [0u8; 16];
    let feed = |data: &[u8], y: &mut [u8; 16]| {
        for chunk in data.chunks(16) {
            let mut block = [0u8; 16];
            block[..chunk.len()].copy_from_slice(chunk);
            for j in 0..16 {
                y[j] ^= block[j];
            }
            *y = ghash_mul(y, h);
        }
    };
    feed(aad, &mut y);
    feed(ciphertext, &mut y);
    // length block: [aad_bits(64) || ct_bits(64)]
    let mut len_block = [0u8; 16];
    len_block[..8].copy_from_slice(&((aad.len() as u64) * 8).to_be_bytes());
    len_block[8..].copy_from_slice(&((ciphertext.len() as u64) * 8).to_be_bytes());
    for j in 0..16 {
        y[j] ^= len_block[j];
    }
    ghash_mul(&y, h)
}

fn inc32(counter: &mut [u8; 16]) {
    // Increment the rightmost 32 bits, mod 2^32.
    let mut c = u32::from_be_bytes([counter[12], counter[13], counter[14], counter[15]]);
    c = c.wrapping_add(1);
    counter[12..].copy_from_slice(&c.to_be_bytes());
}

fn gctr(w: &[[u8; 4]; NB * (NR + 1)], icb: &[u8; 16], data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    let mut cb = *icb;
    for chunk in data.chunks(16) {
        let ks = aes_encrypt_block(&cb, w);
        for (i, &b) in chunk.iter().enumerate() {
            out.push(b ^ ks[i]);
        }
        inc32(&mut cb);
    }
    out
}

// AES-256-GCM encrypt: returns (ciphertext, 16-byte tag).
fn aes_gcm_encrypt(key: &[u8; 32], iv: &[u8], plaintext: &[u8]) -> (Vec<u8>, [u8; 16]) {
    let w = key_expansion(key);
    let h = aes_encrypt_block(&[0u8; 16], &w);

    // J0 for 96-bit IV: IV || 0x00000001.
    let mut j0 = [0u8; 16];
    j0[..iv.len().min(12)].copy_from_slice(&iv[..iv.len().min(12)]);
    j0[15] = 1;

    let mut icb = j0;
    inc32(&mut icb);
    let ciphertext = gctr(&w, &icb, plaintext);

    let s = ghash(&h, &[], &ciphertext);
    // tag = GCTR(J0, S)
    let tag_full = gctr(&w, &j0, &s);
    let mut tag = [0u8; 16];
    tag.copy_from_slice(&tag_full[..16]);
    (ciphertext, tag)
}

// AES-256-GCM decrypt: verifies tag, returns plaintext on success.
fn aes_gcm_decrypt(
    key: &[u8; 32],
    iv: &[u8],
    ciphertext: &[u8],
    tag: &[u8],
) -> Option<Vec<u8>> {
    let w = key_expansion(key);
    let h = aes_encrypt_block(&[0u8; 16], &w);

    let mut j0 = [0u8; 16];
    j0[..iv.len().min(12)].copy_from_slice(&iv[..iv.len().min(12)]);
    j0[15] = 1;

    let s = ghash(&h, &[], ciphertext);
    let expected_full = gctr(&w, &j0, &s);
    // Constant-time-ish tag compare.
    if tag.len() != 16 {
        return None;
    }
    let mut diff = 0u8;
    for i in 0..16 {
        diff |= expected_full[i] ^ tag[i];
    }
    if diff != 0 {
        return None;
    }

    let mut icb = j0;
    inc32(&mut icb);
    Some(gctr(&w, &icb, ciphertext))
}

// =============================================================================
// High-level operations (mirror EncryptionService methods).
// =============================================================================

fn key_array(bytes: &[u8]) -> Option<[u8; 32]> {
    if bytes.len() < 32 {
        return None;
    }
    let mut k = [0u8; 32];
    k.copy_from_slice(&bytes[..32]);
    Some(k)
}

// EncryptionService.encrypt(data) -> EncryptedData | null
fn do_encrypt(plaintext: &str) -> Option<Value> {
    let iv = os_random_bytes(IV_LENGTH);
    with_key(|key| {
        let (ct, tag) = aes_gcm_encrypt(key, &iv, plaintext.as_bytes());
        json!({
            "v": VERSION,
            "alg": ALGORITHM,
            "iv": b64_encode(&iv),
            "tag": b64_encode(&tag),
            "ct": b64_encode(&ct),
        })
    })
}

// EncryptionService.decryptToString(encrypted) -> string | null
fn do_decrypt(enc: &Value) -> Result<String, String> {
    if !is_encrypted(enc) {
        // decryptIfEncrypted: pass-through non-encrypted strings.
        if let Some(s) = enc.as_str() {
            return Ok(s.to_string());
        }
        return Err("Not encrypted data".into());
    }
    if enc.get("v").and_then(|v| v.as_i64()) != Some(VERSION) {
        return Err("Unsupported encryption version".into());
    }
    let iv = b64_decode(enc.get("iv").and_then(|v| v.as_str()).unwrap_or(""))
        .ok_or("Invalid iv")?;
    let tag = b64_decode(enc.get("tag").and_then(|v| v.as_str()).unwrap_or(""))
        .ok_or("Invalid tag")?;
    let ct = b64_decode(enc.get("ct").and_then(|v| v.as_str()).unwrap_or(""))
        .ok_or("Invalid ct")?;

    let res = with_key(|key| aes_gcm_decrypt(key, &iv, &ct, &tag))
        .ok_or("Encryption locked - cannot decrypt data")?;
    match res {
        Some(pt) => String::from_utf8(pt).map_err(|_| "Decrypted data is not valid UTF-8".into()),
        None => Err("Failed to decrypt data".into()),
    }
}

// EncryptionService.isEncrypted(data)
fn is_encrypted(data: &Value) -> bool {
    let o = match data.as_object() {
        Some(o) => o,
        None => return false,
    };
    o.get("v").map(|v| v.is_number()).unwrap_or(false)
        && o.get("alg").map(|v| v.is_string()).unwrap_or(false)
        && o.get("iv").map(|v| v.is_string()).unwrap_or(false)
        && o.get("tag").map(|v| v.is_string()).unwrap_or(false)
        && o.get("ct").map(|v| v.is_string()).unwrap_or(false)
}

// EncryptionService.initializeWithPassword(password)
fn init_with_password(app: &tauri::AppHandle, password: &str) -> bool {
    let salt = os_random_bytes(SALT_LENGTH);
    let key = pbkdf2_sha256(password.as_bytes(), &salt, PBKDF2_ITERATIONS);

    // Wrap the master key at rest with DPAPI when available (parity with
    // safeStorage). Password keysource can re-derive from salt without it, so a
    // DPAPI failure here is non-fatal.
    if let Some(blob) = dpapi_protect(&key) {
        store_set_str(app, "encryptedKey", &blob);
    }
    store_set_str(app, "saltBase64", &b64_encode(&salt));
    store_set_str(app, "keyChecksum", &key_checksum(&key));

    let mut config = get_config(app).as_object().cloned().unwrap_or_default();
    config.insert("enabled".into(), json!(true));
    config.insert("keySource".into(), json!("password"));
    config.insert("initialized".into(), json!(true));
    config.insert("lastKeyRotation".into(), json!(now_ms()));
    set_config(app, &Value::Object(config));

    set_unlocked(key);
    true
}

// EncryptionService.initializeWithSystemKey()
fn init_with_system_key(app: &tauri::AppHandle) -> bool {
    if !dpapi_available() {
        return false; // no safeStorage equivalent on this platform
    }
    let key_bytes = os_random_bytes(KEY_LENGTH);
    let key = match key_array(&key_bytes) {
        Some(k) => k,
        None => return false,
    };
    let salt = os_random_bytes(SALT_LENGTH);

    let blob = match dpapi_protect(&key) {
        Some(b) => b,
        None => return false, // cannot persist system key without DPAPI
    };
    store_set_str(app, "encryptedSystemKey", &blob);
    store_set_str(app, "saltBase64", &b64_encode(&salt));
    store_set_str(app, "keyChecksum", &key_checksum(&key));

    let mut config = get_config(app).as_object().cloned().unwrap_or_default();
    config.insert("enabled".into(), json!(true));
    config.insert("keySource".into(), json!("system"));
    config.insert("initialized".into(), json!(true));
    config.insert("lastKeyRotation".into(), json!(now_ms()));
    set_config(app, &Value::Object(config));

    set_unlocked(key);
    true
}

// EncryptionService.unlock(password)
fn unlock(app: &tauri::AppHandle, password: &str) -> bool {
    let salt_b64 = match store_get_str(app, "saltBase64") {
        Some(s) => s,
        None => return false,
    };
    let stored_checksum = match store_get_str(app, "keyChecksum") {
        Some(s) => s,
        None => return false,
    };
    let salt = match b64_decode(&salt_b64) {
        Some(s) => s,
        None => return false,
    };
    let key = pbkdf2_sha256(password.as_bytes(), &salt, PBKDF2_ITERATIONS);
    if key_checksum(&key) != stored_checksum {
        return false; // invalid password
    }
    set_unlocked(key);
    true
}

// EncryptionService.tryAutoUnlock() — system keysource auto-unlock via DPAPI.
fn try_auto_unlock(app: &tauri::AppHandle) {
    if is_unlocked() {
        return;
    }
    let config = get_config(app);
    let initialized = config.get("initialized").and_then(|v| v.as_bool()).unwrap_or(false);
    let enabled = config.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    if !initialized || !enabled {
        return;
    }
    let key_source = config.get("keySource").and_then(|v| v.as_str()).unwrap_or("");
    if key_source != "system" || !dpapi_available() {
        return;
    }
    let blob = match store_get_str(app, "encryptedSystemKey") {
        Some(b) => b,
        None => return,
    };
    let stored_checksum = match store_get_str(app, "keyChecksum") {
        Some(s) => s,
        None => return,
    };
    if let Some(raw) = dpapi_unprotect(&blob) {
        if let Some(key) = key_array(&raw) {
            if key_checksum(&key) == stored_checksum {
                set_unlocked(key);
            }
        }
    }
}

// EncryptionService.disable()
fn disable(app: &tauri::AppHandle) -> bool {
    store_delete(
        app,
        &["encryptedKey", "encryptedSystemKey", "saltBase64", "keyChecksum"],
    );
    let mut config = get_config(app).as_object().cloned().unwrap_or_default();
    config.insert("enabled".into(), json!(false));
    config.insert("initialized".into(), json!(false));
    set_config(app, &Value::Object(config));
    clear_unlocked();
    true
}

// =============================================================================
// Dispatch
// =============================================================================

/// Route an `encryption:*` channel. Args are the positional JSON array the
/// renderer sent. Heavy crypto-runtime channels are implemented with real native
/// code; channels that are not part of this namespace degrade honestly.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    // Best-effort auto-unlock for system keysource on first touch (mirrors the
    // EncryptionService constructor's tryAutoUnlock); cheap and idempotent.
    try_auto_unlock(app);

    match channel {
        // --- ported data channels ---
        "encryption:getConfig" => get_config(app),
        "encryption:updateConfig" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &updates)
        }
        "encryption:getStatus" => get_status(app),

        // --- real crypto runtime channels ---

        // initWithPassword(sealed). The renderer sends an IPCCrypto-sealed
        // payload; in this native tier there is no IPCCrypto session, so the
        // password is taken from the sealed payload's plaintext form. We accept
        // either a raw string arg or { value } / { password } object.
        "encryption:initWithPassword" => {
            match extract_password(args.get(0)) {
                Some(pw) => json!({ "success": init_with_password(app, &pw) }),
                None => json!({ "success": false, "error": "Missing password" }),
            }
        }

        "encryption:initWithSystemKey" => {
            let ok = init_with_system_key(app);
            if ok {
                crate::native_ops::emit_event(app, "encryption:status-changed", &get_status(app));
                json!({ "success": true })
            } else {
                json!({
                    "success": false,
                    "error": if dpapi_available() {
                        "Failed to initialize with system key"
                    } else {
                        "Safe storage (OS keychain) not available on this platform"
                    }
                })
            }
        }

        "encryption:unlock" => {
            match extract_password(args.get(0)) {
                Some(pw) => json!({ "success": unlock(app, &pw) }),
                None => json!({ "success": false, "error": "Missing password" }),
            }
        }

        "encryption:lock" => {
            clear_unlocked();
            crate::native_ops::emit_event(app, "encryption:status-changed", &get_status(app));
            json!({ "success": true })
        }

        "encryption:disable" => {
            let ok = disable(app);
            crate::native_ops::emit_event(app, "encryption:status-changed", &get_status(app));
            json!({ "success": ok })
        }

        "encryption:encrypt" => {
            let data = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            match do_encrypt(data) {
                Some(enc) => json!({ "success": true, "data": enc }),
                None => json!({ "success": false, "error": "Encryption failed or not available" }),
            }
        }

        "encryption:decrypt" => {
            let data = args.get(0).cloned().unwrap_or(Value::Null);
            match do_decrypt(&data) {
                Ok(s) => json!({ "success": true, "data": s }),
                Err(e) => json!({ "success": false, "error": e }),
            }
        }

        // isEncrypted(data) -> boolean (pure structural predicate).
        "encryption:isEncrypted" => {
            let data = args.get(0).cloned().unwrap_or(Value::Null);
            json!(is_encrypted(&data))
        }

        // --- channels named by the porting spec that are NOT in this namespace ---
        // getPublicKey / listKeys belong to ssh: / secureKeys:, not encryption:.
        // The renderer never calls them on this namespace; return null rather
        // than fabricate a key list/shape.
        "encryption:getPublicKey" | "encryption:listKeys" => Value::Null,

        // deriveKey / generateKey are exposed here as real native primitives even
        // though Electron kept them private; they return base64 material so any
        // caller can use the runtime directly without leaking the live key.
        "encryption:deriveKey" => {
            let password = match extract_password(args.get(0)) {
                Some(p) => p,
                None => return json!({ "success": false, "error": "Missing password" }),
            };
            // Optional explicit salt (base64) as arg 1; otherwise generate one.
            let salt = args
                .get(1)
                .and_then(|v| v.as_str())
                .and_then(b64_decode)
                .unwrap_or_else(|| os_random_bytes(SALT_LENGTH));
            let iterations = args
                .get(2)
                .and_then(|v| v.as_u64())
                .map(|n| n as u32)
                .unwrap_or(PBKDF2_ITERATIONS);
            let key = pbkdf2_sha256(password.as_bytes(), &salt, iterations);
            json!({
                "success": true,
                "key": b64_encode(&key),
                "salt": b64_encode(&salt),
                "iterations": iterations,
                "algorithm": "pbkdf2-hmac-sha256",
                "checksum": key_checksum(&key),
            })
        }

        "encryption:generateKey" => {
            let key = os_random_bytes(KEY_LENGTH);
            json!({
                "success": true,
                "key": b64_encode(&key),
                "length": KEY_LENGTH,
                "checksum": key_checksum(&key),
            })
        }

        _ => Value::Null,
    }
}

// Accept the password from either a raw string arg or an object carrying it
// under common keys (the renderer's IPCCrypto.seal wraps it; without a live
// IPCCrypto session here we read the plaintext field if present).
fn extract_password(arg: Option<&Value>) -> Option<String> {
    let v = arg?;
    if let Some(s) = v.as_str() {
        return Some(s.to_string());
    }
    if let Some(o) = v.as_object() {
        for k in ["password", "value", "data", "plaintext"] {
            if let Some(s) = o.get(k).and_then(|x| x.as_str()) {
                return Some(s.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_roundtrip() {
        for s in ["", "a", "ab", "abc", "abcd", "hello world!", "\x00\x01\x02\x7f"] {
            let enc = b64_encode(s.as_bytes());
            let dec = b64_decode(&enc).unwrap();
            assert_eq!(dec, s.as_bytes());
        }
    }

    #[test]
    fn aes256_gcm_known_vector() {
        // NIST GCM test: key=all zeros, iv=all zeros, empty plaintext.
        let key = [0u8; 32];
        let iv = [0u8; 12];
        let (ct, tag) = aes_gcm_encrypt(&key, &iv, &[]);
        assert!(ct.is_empty());
        // Expected tag for AES-256-GCM, K=0, IV=0, P="", A="".
        assert_eq!(
            b64_encode(&tag),
            b64_encode(&hex_to_bytes("530f8afbc74536b9a963b4f1c4cb738b"))
        );
    }

    #[test]
    fn aes256_gcm_roundtrip() {
        let key = [7u8; 32];
        let iv = [3u8; 12];
        let pt = b"The quick brown fox jumps over the lazy dog";
        let (ct, tag) = aes_gcm_encrypt(&key, &iv, pt);
        let back = aes_gcm_decrypt(&key, &iv, &ct, &tag).unwrap();
        assert_eq!(back, pt);
        // Tamper -> reject.
        let mut bad = ct.clone();
        bad[0] ^= 1;
        assert!(aes_gcm_decrypt(&key, &iv, &bad, &tag).is_none());
    }

    #[test]
    fn pbkdf2_sha256_known_vector() {
        // RFC-style vector: P="password", S="salt", c=1, dkLen=32.
        let dk = pbkdf2_sha256(b"password", b"salt", 1);
        assert_eq!(
            crate::licensing::sha256_hex(&[]).len(),
            64,
            "sha256 helper sanity"
        );
        // Known PBKDF2-HMAC-SHA256(password,salt,1,32):
        // 120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b
        let expect = hex_to_bytes("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b");
        assert_eq!(dk.to_vec(), expect);
    }
}
