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

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const STORE_FILE: &str = "dex-autofill.json";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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

fn write_store(app: &tauri::AppHandle, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => crate::write_atomic(store_path(app), s).is_ok(),
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

// Read the full store as a mutable JSON object, seeding an empty object when the
// file is absent/corrupt so writes always have a place to land.
fn read_store_obj(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    match read_store(app) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    }
}

// Set a top-level key, then persist. Mirrors electron-store `set(key, value)`.
fn set_store_key(app: &tauri::AppHandle, key: &str, value: Value) -> bool {
    let mut store = read_store_obj(app);
    store.insert(key.into(), value);
    write_store(app, &Value::Object(store))
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

// encryptData() base64 fallback: Buffer.from(data).toString('base64'). Mirrors
// the no-safeStorage obfuscation path so values written here round-trip through
// b64_decode_to_utf8() above. Not OS-keychain interoperable (documented).
fn b64_encode_utf8(s: &str) -> String {
    const TBL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = s.as_bytes();
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TBL[((n >> 18) & 63) as usize] as char);
        out.push(TBL[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(TBL[((n >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TBL[(n & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
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

// autofill:updateSettings(updates) — shallow-merge updates over the current
// (defaulted) settings, persist, return the merged settings (Electron shape).
fn update_settings(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut merged = match get_settings(app) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    if let Some(u) = updates.as_object() {
        for (k, v) in u {
            // Only accept the known boolean fields, mirroring AutoFillSettings.
            if matches!(
                k.as_str(),
                "enabled"
                    | "savePasswords"
                    | "saveAddresses"
                    | "saveCards"
                    | "autoFillForms"
                    | "smartSuggestions"
            ) {
                merged.insert(k.clone(), v.clone());
            }
        }
    }
    let merged = Value::Object(merged);
    set_store_key(app, "settings", merged.clone());
    merged
}

// autofill:savePassword(domain, username, password) — validate, gate on
// settings.savePasswords, upsert by (domain, username). Returns the id, or null.
fn save_password(app: &tauri::AppHandle, domain: &Value, username: &Value, password: &Value) -> Value {
    let domain = match domain.as_str() {
        Some(s) if !s.is_empty() && s.len() <= 2048 => s,
        _ => return Value::Null,
    };
    let username = match username.as_str() {
        Some(s) if !s.is_empty() && s.len() <= 512 => s,
        _ => return Value::Null,
    };
    let password = match password.as_str() {
        Some(s) if !s.is_empty() && s.len() <= 10000 => s,
        _ => return Value::Null,
    };
    let save_ok = get_settings(app)
        .get("savePasswords")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if !save_ok {
        return Value::Null;
    }

    let mut passwords = read_array(app, "passwords");
    let now = now_ms();
    // Upsert existing (domain, username) match.
    if let Some(existing) = passwords.iter_mut().find(|p| {
        p.get("domain").and_then(|v| v.as_str()) == Some(domain)
            && p.get("username").and_then(|v| v.as_str()) == Some(username)
    }) {
        if let Some(obj) = existing.as_object_mut() {
            obj.insert("password".into(), json!(b64_encode_utf8(password)));
            obj.insert("updatedAt".into(), json!(now));
        }
        let id = existing.get("id").cloned().unwrap_or(Value::Null);
        set_store_key(app, "passwords", json!(passwords));
        return id;
    }

    let id = crate::util::pseudo_uuid_v4();
    passwords.push(json!({
        "id": id,
        "domain": domain,
        "username": username,
        "password": b64_encode_utf8(password),
        "createdAt": now,
        "updatedAt": now,
    }));
    set_store_key(app, "passwords", json!(passwords));
    json!(id)
}

// autofill:deletePassword(id) — drop by id, persist, return true.
fn delete_password(app: &tauri::AppHandle, id: &str) -> Value {
    let passwords: Vec<Value> = read_array(app, "passwords")
        .into_iter()
        .filter(|p| p.get("id").and_then(|v| v.as_str()) != Some(id))
        .collect();
    set_store_key(app, "passwords", json!(passwords));
    json!(true)
}

// autofill:saveAddress(address) — gate on settings.saveAddresses, append with a
// fresh id + createdAt. Returns the id, or null.
fn save_address(app: &tauri::AppHandle, address: &Value) -> Value {
    let save_ok = get_settings(app)
        .get("saveAddresses")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if !save_ok {
        return Value::Null;
    }
    let mut obj = address.as_object().cloned().unwrap_or_default();
    let id = crate::util::pseudo_uuid_v4();
    // Spread address, then id + createdAt override (matches Electron ordering).
    obj.insert("id".into(), json!(id));
    obj.insert("createdAt".into(), json!(now_ms()));

    let mut addresses = read_array(app, "addresses");
    addresses.push(Value::Object(obj));
    set_store_key(app, "addresses", json!(addresses));
    json!(id)
}

// autofill:deleteAddress(id) — drop by id, persist, return true.
fn delete_address(app: &tauri::AppHandle, id: &str) -> Value {
    let addresses: Vec<Value> = read_array(app, "addresses")
        .into_iter()
        .filter(|a| a.get("id").and_then(|v| v.as_str()) != Some(id))
        .collect();
    set_store_key(app, "addresses", json!(addresses));
    json!(true)
}

// autofill:saveCard({ label, number, expiryMonth, expiryYear, cvv }) — gate on
// settings.saveCards, store lastFour + encrypted { number, cvv }. Returns id/null.
fn save_card(app: &tauri::AppHandle, card: &Value) -> Value {
    let save_ok = get_settings(app)
        .get("saveCards")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !save_ok {
        return Value::Null;
    }
    let number = card.get("number").and_then(|v| v.as_str()).unwrap_or("");
    let cvv = card.get("cvv").and_then(|v| v.as_str()).unwrap_or("");
    // lastFour = number.slice(-4) (char-wise, matching JS String.slice).
    let chars: Vec<char> = number.chars().collect();
    let last_four: String = if chars.len() >= 4 {
        chars[chars.len() - 4..].iter().collect()
    } else {
        chars.iter().collect()
    };
    let card_data_plain = json!({ "number": number, "cvv": cvv }).to_string();

    let id = crate::util::pseudo_uuid_v4();
    let mut cards = read_array(app, "cards");
    cards.push(json!({
        "id": id,
        "label": card.get("label").cloned().unwrap_or(Value::Null),
        "lastFour": last_four,
        "cardData": b64_encode_utf8(&card_data_plain),
        "expiryMonth": card.get("expiryMonth").cloned().unwrap_or(Value::Null),
        "expiryYear": card.get("expiryYear").cloned().unwrap_or(Value::Null),
        "createdAt": now_ms(),
    }));
    set_store_key(app, "cards", json!(cards));
    json!(id)
}

// autofill:deleteCard(id) — drop by id, persist, return true.
fn delete_card(app: &tauri::AppHandle, id: &str) -> Value {
    let cards: Vec<Value> = read_array(app, "cards")
        .into_iter()
        .filter(|c| c.get("id").and_then(|v| v.as_str()) != Some(id))
        .collect();
    set_store_key(app, "cards", json!(cards));
    json!(true)
}

// autofill:getPaymentMethods — alias for the redacted card list (parity name).
// AutoFillController exposed cards via getCards; the renderer also queries the
// "payment methods" name, so serve the same redacted shape.
fn get_payment_methods(app: &tauri::AppHandle) -> Value {
    get_cards(app)
}

// autofill:getPaymentMethod(id) — single redacted card by id, or null.
fn get_payment_method(app: &tauri::AppHandle, id: &str) -> Value {
    match get_cards(app)
        .as_array()
        .and_then(|a| a.iter().find(|c| c.get("id").and_then(|v| v.as_str()) == Some(id)).cloned())
    {
        Some(c) => c,
        None => Value::Null,
    }
}

// autofill:getSuggestions({ domain, fieldName, fieldType }) — ranked
// FormFieldSuggestion[]. Faithful port of the heuristic chain.
fn get_suggestions(app: &tauri::AppHandle, context: &Value) -> Value {
    let settings = get_settings(app);
    let enabled = settings.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    let smart = settings
        .get("smartSuggestions")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if !enabled || !smart {
        return json!([]);
    }

    let domain = context.get("domain").and_then(|v| v.as_str()).unwrap_or("");
    let field_name = context.get("fieldName").and_then(|v| v.as_str()).unwrap_or("");
    let field_type = context.get("fieldType").and_then(|v| v.as_str()).unwrap_or("");
    let lower_field = field_name.to_lowercase();

    let mut suggestions: Vec<Value> = Vec::new();

    // Password suggestions (push the username, mirroring Electron).
    if field_type == "password" || lower_field.contains("password") {
        for p in read_array(app, "passwords") {
            let pd = p.get("domain").and_then(|v| v.as_str()).unwrap_or("");
            if !pd.is_empty() && domain.contains(pd) {
                suggestions.push(json!({
                    "field": "password",
                    "value": p.get("username").cloned().unwrap_or(Value::Null),
                    "type": "password",
                    "confidence": 0.9,
                }));
            }
        }
    }

    // Username / email suggestions (unique usernames, first 3 — insertion order).
    if lower_field.contains("email") || lower_field.contains("user") {
        let mut seen: Vec<String> = Vec::new();
        for p in read_array(app, "passwords") {
            if let Some(u) = p.get("username").and_then(|v| v.as_str()) {
                if !seen.iter().any(|s| s == u) {
                    seen.push(u.to_string());
                }
            }
        }
        for u in seen.into_iter().take(3) {
            suggestions.push(json!({
                "field": "email",
                "value": u,
                "type": "text",
                "confidence": 0.8,
            }));
        }
    }

    // Address suggestions (street of first 3 addresses).
    if lower_field.contains("address") || lower_field.contains("street") {
        for a in read_array(app, "addresses").into_iter().take(3) {
            suggestions.push(json!({
                "field": "address",
                "value": a.get("street").cloned().unwrap_or(Value::Null),
                "type": "address",
                "confidence": 0.85,
            }));
        }
    }

    // Name suggestions (unique names, first 3).
    if lower_field.contains("name") && !lower_field.contains("user") {
        let mut seen: Vec<String> = Vec::new();
        for a in read_array(app, "addresses") {
            if let Some(n) = a.get("name").and_then(|v| v.as_str()) {
                if !seen.iter().any(|s| s == n) {
                    seen.push(n.to_string());
                }
            }
        }
        for n in seen.into_iter().take(3) {
            suggestions.push(json!({
                "field": "name",
                "value": n,
                "type": "text",
                "confidence": 0.75,
            }));
        }
    }

    // Form history for "<domain>:<fieldName>" (first 3 values).
    let history_key = format!("{}:{}", domain, field_name);
    if let Some(hist) = read_store(app)
        .get("formHistory")
        .and_then(|h| h.get(&history_key))
        .and_then(|v| v.as_array())
        .cloned()
    {
        for value in hist.into_iter().take(3) {
            suggestions.push(json!({
                "field": field_name,
                "value": value,
                "type": "text",
                "confidence": 0.6,
            }));
        }
    }

    // Stable sort by confidence descending (matches Array.prototype.sort intent).
    suggestions.sort_by(|a, b| {
        let ca = a.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let cb = b.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
        cb.partial_cmp(&ca).unwrap_or(std::cmp::Ordering::Equal)
    });
    json!(suggestions)
}

// autofill:saveFormValue(domain, fieldName, value) — prepend unique value to the
// "<domain>:<fieldName>" history list (cap 10). Void (returns Null).
fn save_form_value(app: &tauri::AppHandle, domain: &str, field_name: &str, value: &Value) -> Value {
    let value = match value.as_str() {
        Some(s) if s.chars().count() >= 2 => s,
        _ => return Value::Null,
    };
    let key = format!("{}:{}", domain, field_name);
    let mut store = read_store_obj(app);
    let mut history = store
        .get("formHistory")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let existing = history
        .get(&key)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    // [value, ...existing.filter(v => v !== value)].slice(0, 10)
    let mut updated: Vec<Value> = vec![json!(value)];
    for v in existing {
        if v.as_str() != Some(value) {
            updated.push(v);
        }
    }
    updated.truncate(10);
    history.insert(key, json!(updated));
    store.insert("formHistory".into(), Value::Object(history));
    let _ = write_store(app, &Value::Object(store));
    Value::Null
}

// autofill:autoFillForm(domain) — first matching credential, with the password
// decrypted. { username, password } or null. Gated on enabled + autoFillForms.
fn auto_fill_form(app: &tauri::AppHandle, domain: &str) -> Value {
    let settings = get_settings(app);
    let enabled = settings.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    let auto = settings
        .get("autoFillForms")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if !enabled || !auto {
        return Value::Null;
    }
    for p in read_array(app, "passwords") {
        let pd = p.get("domain").and_then(|v| v.as_str()).unwrap_or("");
        if !pd.is_empty() && domain.contains(pd) {
            let enc = p.get("password").and_then(|v| v.as_str()).unwrap_or("");
            return json!({
                "username": p.get("username").cloned().unwrap_or(Value::Null),
                "password": b64_decode_to_utf8(enc),
            });
        }
    }
    Value::Null
}

// autofill:clearAll — wipe passwords, addresses, cards, formHistory. Returns true.
fn clear_all(app: &tauri::AppHandle) -> Value {
    let mut store = read_store_obj(app);
    store.insert("passwords".into(), json!([]));
    store.insert("addresses".into(), json!([]));
    store.insert("cards".into(), json!([]));
    store.insert("formHistory".into(), json!({}));
    write_store(app, &Value::Object(store));
    json!(true)
}

/// Route an `autofill:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). All listed channels are ported natively
/// over the JSON-backed store; unknown channels return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "autofill:getSettings" => get_settings(app),
        "autofill:updateSettings" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_settings(app, &updates)
        }
        "autofill:getPasswords" => {
            let domain = args.get(0).cloned().unwrap_or(Value::Null);
            get_passwords(app, &domain)
        }
        "autofill:getPassword" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_password(app, id)
        }
        "autofill:savePassword" => {
            let domain = args.get(0).cloned().unwrap_or(Value::Null);
            let username = args.get(1).cloned().unwrap_or(Value::Null);
            let password = args.get(2).cloned().unwrap_or(Value::Null);
            save_password(app, &domain, &username, &password)
        }
        "autofill:deletePassword" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_password(app, id)
        }
        "autofill:getAddresses" => get_addresses(app),
        "autofill:getAddress" => {
            // Single address by id (companion to getAddresses); null if absent.
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            match read_array(app, "addresses")
                .into_iter()
                .find(|a| a.get("id").and_then(|v| v.as_str()) == Some(id))
            {
                Some(a) => a,
                None => Value::Null,
            }
        }
        "autofill:saveAddress" => {
            let address = args.get(0).cloned().unwrap_or(Value::Null);
            save_address(app, &address)
        }
        "autofill:deleteAddress" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_address(app, id)
        }
        "autofill:getCards" => get_cards(app),
        "autofill:getPaymentMethods" => get_payment_methods(app),
        "autofill:getPaymentMethod" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_payment_method(app, id)
        }
        "autofill:saveCard" => {
            let card = args.get(0).cloned().unwrap_or(Value::Null);
            save_card(app, &card)
        }
        "autofill:deleteCard" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_card(app, id)
        }
        "autofill:getSuggestions" => {
            let context = args.get(0).cloned().unwrap_or(Value::Null);
            get_suggestions(app, &context)
        }
        "autofill:saveFormValue" => {
            let domain = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let field_name = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let value = args.get(2).cloned().unwrap_or(Value::Null);
            save_form_value(app, domain, field_name, &value)
        }
        "autofill:autoFillForm" => {
            let domain = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            auto_fill_form(app, domain)
        }
        "autofill:clearAll" => clear_all(app),
        _ => Value::Null,
    }
}
