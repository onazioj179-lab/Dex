// =============================================================================
// DEX Tauri — Auto-Fill subsystem (port of controllers/AutoFillController.ts).
//
// Pure-data, JSON-backed tier. Electron used a single `electron-store` file
// (name: "dex-autofill") holding five top-level keys. This mirrors that file
// under <appData> with the SAME name + ".json":
//   - dex-autofill.json : {
//       passwords:   SavedPassword[],
//       addresses:   SavedAddress[],
//       cards:       SavedCard[],
//       settings:    AutoFillSettings,
//       formHistory: { "<key>": string[] }
//     }
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// ONLY the data/read channels are ported (per the migration brief):
//   - autofill:getSettings  -> AutoFillSettings (the stored object, with the
//                              Electron defaults applied for any missing field).
//   - autofill:getPasswords -> redacted SavedPassword[] (no password field):
//                              { id, domain, username, createdAt, lastUsed }
//                              optional filter arg: substring match on domain.
//   - autofill:getPassword  -> the full SavedPassword with `password` DECRYPTED
//                              (see ENCRYPTION divergence) + lastUsed bumped and
//                              persisted; null if id not found.
//   - autofill:getAddresses -> SavedAddress[] (the stored array, [] if unset).
//   - autofill:getCards     -> redacted SavedCard[] (no cardData):
//                              { id, label, lastFour, expiryMonth, expiryYear }.
//
// DIVERGENCES (documented):
//   - ENCRYPTION: the Electron store was opened with `encryptionKey` (whole-file
//     AES via electron-store) AND individual secret fields were wrapped with
//     `safeStorage` (OS keychain) when available, else base64. Neither key
//     material is reachable here, and the brief mandates no new deps. We
//     therefore read/write PLAIN JSON (no whole-file crypto), and for
//     getPassword's per-field secret we mirror ONLY the documented base64
//     fallback path of decryptData() (Buffer.from(b64).toString('utf-8')). If a
//     stored value was OS-keychain-encrypted, that base64 decode yields the
//     original ciphertext bytes as lossy text — identical to the Electron
//     fallback when safeStorage is unavailable. Files written natively are not
//     interoperable with the encrypted Electron store; this is a clean-cutover
//     port, not a live dual-read.
//   - getPassword SIDE EFFECT: like Electron, a successful read bumps
//     `lastUsed = now` and persists the passwords array. Reproduced faithfully.
//   - HEAVY/mutating channels (updateSettings, savePassword, deletePassword,
//     saveAddress, deleteAddress, plus the non-ported saveCard/deleteCard/
//     getSuggestions/saveFormValue/autoFillForm/clearAll) are NOT implemented
//     here. They are out of scope for the data port. dispatch() returns
//     Value::Null for any channel it does not handle (honest degrade).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "dex-autofill.json";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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

fn write_store(app: &tauri::AppHandle, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app), s).is_ok(),
        Err(_) => false,
    }
}

fn read_array(app: &tauri::AppHandle, key: &str) -> Vec<Value> {
    read_store(app)
        .get(key)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

// decryptData() base64 fallback: Buffer.from(b64, 'base64').toString('utf-8').
// Mirrors the no-safeStorage path; lossy on non-utf8 bytes exactly like JS.
fn b64_decode_to_utf8(s: &str) -> String {
    const TBL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lut = [255u8; 256];
    for (i, c) in TBL.iter().enumerate() {
        lut[*c as usize] = i as u8;
    }
    let mut bytes: Vec<u8> = Vec::new();
    let mut acc: u32 = 0;
    let mut nbits: u32 = 0;
    for ch in s.bytes() {
        if ch == b'=' {
            break;
        }
        let v = lut[ch as usize];
        if v == 255 {
            continue; // skip whitespace/newlines, like atob-tolerant decoders
        }
        acc = (acc << 6) | v as u32;
        nbits += 6;
        if nbits >= 8 {
            nbits -= 8;
            bytes.push((acc >> nbits) as u8);
        }
    }
    String::from_utf8_lossy(&bytes).to_string()
}

// --- settings ---------------------------------------------------------------

// autofill:getSettings — the stored `settings` object, with Electron defaults
// applied for any missing field (electron-store `defaults` semantics).
fn get_settings(app: &tauri::AppHandle) -> Value {
    let raw = read_store(app);
    let s = raw.get("settings");
    let b = |k: &str, d: bool| {
        s.and_then(|o| o.get(k)).and_then(|v| v.as_bool()).unwrap_or(d)
    };
    json!({
        "enabled": b("enabled", true),
        "savePasswords": b("savePasswords", true),
        "saveAddresses": b("saveAddresses", true),
        "saveCards": b("saveCards", false),
        "autoFillForms": b("autoFillForms", true),
        "smartSuggestions": b("smartSuggestions", true),
    })
}

// --- passwords --------------------------------------------------------------

// autofill:getPasswords(domain?) — redacted list (no password), optional
// substring filter on the stored domain.
fn get_passwords(app: &tauri::AppHandle, domain: &Value) -> Value {
    let passwords = read_array(app, "passwords");
    let filter = domain.as_str().filter(|d| !d.is_empty());
    let out: Vec<Value> = passwords
        .into_iter()
        .filter(|p| match filter {
            Some(d) => p
                .get("domain")
                .and_then(|v| v.as_str())
                .map(|pd| pd.contains(d))
                .unwrap_or(false),
            None => true,
        })
        .map(|p| {
            json!({
                "id": p.get("id").cloned().unwrap_or(Value::Null),
                "domain": p.get("domain").cloned().unwrap_or(Value::Null),
                "username": p.get("username").cloned().unwrap_or(Value::Null),
                "createdAt": p.get("createdAt").cloned().unwrap_or(Value::Null),
                "lastUsed": p.get("lastUsed").cloned().unwrap_or(Value::Null),
            })
        })
        .collect();
    json!(out)
}

// autofill:getPassword(id) — full record with `password` decrypted; bumps
// lastUsed and persists. null if not found.
fn get_password(app: &tauri::AppHandle, id: &str) -> Value {
    let mut store = match read_store(app) {
        Value::Object(m) => m,
        _ => return Value::Null,
    };
    let passwords = match store.get_mut("passwords").and_then(|v| v.as_array_mut()) {
        Some(a) => a,
        None => return Value::Null,
    };
    let idx = match passwords
        .iter()
        .position(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
    {
        Some(i) => i,
        None => return Value::Null,
    };

    // Bump lastUsed and persist (Electron side effect).
    if let Some(obj) = passwords[idx].as_object_mut() {
        obj.insert("lastUsed".into(), json!(now_ms()));
    }
    let found = passwords[idx].clone();
    let _ = write_store(app, &Value::Object(store));

    // { ...found, password: decryptData(found.password) }
    let enc = found.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let mut out = found.as_object().cloned().unwrap_or_default();
    out.insert("password".into(), json!(b64_decode_to_utf8(enc)));
    Value::Object(out)
}

// --- addresses --------------------------------------------------------------

// autofill:getAddresses — the stored array verbatim.
fn get_addresses(app: &tauri::AppHandle) -> Value {
    json!(read_array(app, "addresses"))
}

// --- cards ------------------------------------------------------------------

// autofill:getCards — redacted list (no cardData / no secrets).
fn get_cards(app: &tauri::AppHandle) -> Value {
    let cards = read_array(app, "cards");
    let out: Vec<Value> = cards
        .into_iter()
        .map(|c| {
            json!({
                "id": c.get("id").cloned().unwrap_or(Value::Null),
                "label": c.get("label").cloned().unwrap_or(Value::Null),
                "lastFour": c.get("lastFour").cloned().unwrap_or(Value::Null),
                "expiryMonth": c.get("expiryMonth").cloned().unwrap_or(Value::Null),
                "expiryYear": c.get("expiryYear").cloned().unwrap_or(Value::Null),
            })
        })
        .collect();
    json!(out)
}

/// Route an `autofill:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the data/read channels are handled;
/// every other channel in the namespace (the heavy/mutating ones) returns
/// Value::Null — honest degrade, no faking.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "autofill:getSettings" => get_settings(app),
        "autofill:getPasswords" => {
            let domain = args.get(0).cloned().unwrap_or(Value::Null);
            get_passwords(app, &domain)
        }
        "autofill:getPassword" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_password(app, id)
        }
        "autofill:getAddresses" => get_addresses(app),
        "autofill:getCards" => get_cards(app),
        _ => Value::Null,
    }
}
