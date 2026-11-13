// =============================================================================
// DEX 6.0 — Auth credential engine (Tauri shell)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! The full native `auth:*` engine: enrolment, verification, credential change,
//! clearing, recovery codes, brute-force lockout, and session tokens. Backs both
//! the Settings enrolment UI and the LockScreen unlock flow.
//!
//! Design / guarantees:
//!   * Secrets (PIN, password) are stored as an **Argon2id** hash — never the
//!     plaintext — with a fresh 32-byte OS-CSPRNG salt. Argon2id is the same KDF
//!     the vault uses (`dex_vault::crypto::derive_key`); reused here rather than
//!     adding a second KDF. Each stored secret records `{Hash, Salt, Algo}`.
//!   * Backward compatible: credentials enrolled by the previous build used a
//!     single salted SHA-256 (`Algo` absent). Those still verify, and on the next
//!     successful unlock they are transparently re-hashed to Argon2id (migration).
//!   * Hash comparison is constant-time.
//!   * Brute-force lockout: after MAX_ATTEMPTS consecutive failures the auth
//!     surface is locked for LOCKOUT_MINUTES. This is a per-attempt guard, NOT an
//!     idle/timeout lock — DEX never locks on inactivity (owner mandate), so
//!     `lockOnSleep`/`timeoutMinutes`/`requireOnResume` are always reported off.
//!   * Biometric (fingerprint / face) runs the real OS verifier (Windows Hello
//!     `UserConsentVerifier`); it is never faked. On a device without biometrics
//!     it returns `{success:false,error}`.
//!   * Session tokens are random and held in memory only (never persisted).
//!
//! Multiple methods coexist: a user may enrol any combination of password, PIN
//! and biometric; `derive_method` reports the active combination.

use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const CRED_KEY: &str = "auth:credentials";
const MAX_ATTEMPTS: i64 = 5;
const LOCKOUT_MINUTES: i64 = 5;
const RECOVERY_CODE_COUNT: usize = 10;
/// Security cooldown between successive password CHANGES (anti-spam / anti-abuse:
/// stops an attacker with brief access from churning the password, and stops
/// change-spam). Never blocks LOGIN and never blocks account RECOVERY, so it can
/// never lock a legitimate user out.
const PASSWORD_CHANGE_COOLDOWN_MINUTES: i64 = 60;
/// Minimum number of security questions required to enrol recovery.
const MIN_SECURITY_QUESTIONS: usize = 3;

/// In-memory set of valid session tokens. Never persisted — a restart
/// invalidates all sessions, which is the correct security default.
fn session_tokens() -> &'static Mutex<HashSet<String>> {
    static TOKENS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    TOKENS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Lowercase-hex encoding of a byte slice.
fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Decode a lowercase/uppercase hex string back to bytes. Returns empty on any
/// malformed input (treated as a non-matching credential downstream).
fn from_hex(s: &str) -> Vec<u8> {
    if s.len() % 2 != 0 {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let hi = (bytes[i] as char).to_digit(16);
        let lo = (bytes[i + 1] as char).to_digit(16);
        match (hi, lo) {
            (Some(h), Some(l)) => out.push((h * 16 + l) as u8),
            _ => return Vec::new(),
        }
        i += 2;
    }
    out
}

/// Constant-time byte-string comparison (avoids leaking match position via
/// timing). Both must be equal length AND content to return true.
fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

/// Strong hash: Argon2id over `secret` with the given salt bytes, hex-encoded.
/// Reuses the vault's KDF so there is one KDF in the codebase.
fn hash_argon2(secret: &str, salt: &[u8]) -> Option<String> {
    dex_vault::crypto::derive_key(secret, salt)
        .ok()
        .map(|key| to_hex(&key))
}

/// Legacy hash: `sha256_hex(salt_hex + secret)` — the previous build's scheme.
/// Kept only so pre-existing credentials still verify (then get migrated).
fn hash_legacy(secret: &str, salt_hex: &str) -> String {
    let mut input = String::with_capacity(salt_hex.len() + secret.len());
    input.push_str(salt_hex);
    input.push_str(secret);
    crate::licensing::sha256_hex(input.as_bytes())
}

fn load_credentials(app: &tauri::AppHandle) -> Map<String, Value> {
    crate::kv_get(app, CRED_KEY)
        .as_object()
        .cloned()
        .unwrap_or_default()
}

fn save_credentials(app: &tauri::AppHandle, creds: Map<String, Value>) -> bool {
    crate::kv_set(app, CRED_KEY, Value::Object(creds))
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Write a `{prefix}Hash/{prefix}Salt/{prefix}Algo` triple into `creds`,
/// hashing `secret` with Argon2id under a fresh salt. Returns false if the KDF
/// fails (extremely unlikely — only on allocation failure).
fn set_secret(creds: &mut Map<String, Value>, prefix: &str, secret: &str) -> bool {
    let salt = crate::keys_ctl::os_random_bytes(32);
    match hash_argon2(secret, &salt) {
        Some(hash) => {
            creds.insert(format!("{prefix}Hash"), json!(hash));
            creds.insert(format!("{prefix}Salt"), json!(to_hex(&salt)));
            creds.insert(format!("{prefix}Algo"), json!("argon2id"));
            true
        }
        None => false,
    }
}

/// Verify `input` against the stored `{prefix}` secret. On a successful match of
/// a LEGACY (non-argon2id) credential, transparently re-hash to Argon2id and
/// persist (best-effort migration). Returns whether it matched.
fn verify_secret(app: &tauri::AppHandle, prefix: &str, input: &str) -> bool {
    let creds = load_credentials(app);
    let stored = match creds.get(&format!("{prefix}Hash")).and_then(|v| v.as_str()) {
        Some(h) if !h.is_empty() => h.to_string(),
        _ => return false,
    };
    let salt_hex = creds
        .get(&format!("{prefix}Salt"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let algo = creds
        .get(&format!("{prefix}Algo"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if algo == "argon2id" {
        match hash_argon2(input, &from_hex(salt_hex)) {
            Some(h) => ct_eq(&h, &stored),
            None => false,
        }
    } else {
        // Legacy salted SHA-256.
        let matched = ct_eq(&hash_legacy(input, salt_hex), &stored);
        if matched {
            // Migrate to Argon2id now that we hold the plaintext.
            let mut updated = load_credentials(app);
            if set_secret(&mut updated, prefix, input) {
                let _ = save_credentials(app, updated);
            }
        }
        matched
    }
}

// ---------------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------------

/// Remaining lockout in minutes (rounded up), or 0 if not locked out.
fn lockout_remaining_minutes(creds: &Map<String, Value>) -> i64 {
    let until = creds.get("lockedUntil").and_then(|v| v.as_i64()).unwrap_or(0);
    let now = now_ms();
    if until > now {
        ((until - now) + 59_999) / 60_000
    } else {
        0
    }
}

fn attempts_remaining(creds: &Map<String, Value>) -> i64 {
    let used = creds.get("failedAttempts").and_then(|v| v.as_i64()).unwrap_or(0);
    (MAX_ATTEMPTS - used).max(0)
}

/// Record one failed attempt, arming the lockout window once MAX_ATTEMPTS is hit.
fn record_failure(app: &tauri::AppHandle) {
    let mut creds = load_credentials(app);
    let used = creds.get("failedAttempts").and_then(|v| v.as_i64()).unwrap_or(0) + 1;
    creds.insert("failedAttempts".into(), json!(used));
    if used >= MAX_ATTEMPTS {
        creds.insert("lockedUntil".into(), json!(now_ms() + LOCKOUT_MINUTES * 60_000));
    }
    let _ = save_credentials(app, creds);
}

/// Clear the failure counter + lockout window after a successful auth.
fn reset_failures(app: &tauri::AppHandle) {
    let mut creds = load_credentials(app);
    creds.remove("failedAttempts");
    creds.remove("lockedUntil");
    let _ = save_credentials(app, creds);
}

/// If a lockout window has fully elapsed, clear the counter so the user gets a
/// FRESH set of attempts rather than being re-locked by a single wrong entry.
/// This guarantees the lockout is always temporary — never a permanent wall.
fn clear_expired_lockout(app: &tauri::AppHandle) {
    let creds = load_credentials(app);
    let until = creds.get("lockedUntil").and_then(|v| v.as_i64()).unwrap_or(0);
    if until > 0 && until <= now_ms() {
        reset_failures(app);
    }
}

/// Mint a fresh in-memory session token.
fn issue_token() -> String {
    let token = to_hex(&crate::keys_ctl::os_random_bytes(32));
    if let Ok(mut set) = session_tokens().lock() {
        set.insert(token.clone());
    }
    token
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

fn setup_pin(app: &tauri::AppHandle, pin: &str) -> Value {
    let digits_ok = (4..=6).contains(&pin.len()) && pin.bytes().all(|b| b.is_ascii_digit());
    if !digits_ok {
        return json!({ "success": false, "error": "PIN must be 4-6 digits." });
    }
    let mut creds = load_credentials(app);
    if !set_secret(&mut creds, "pin", pin) {
        return json!({ "success": false, "error": "Failed to secure PIN." });
    }
    creds.insert("pinLength".into(), json!(pin.len()));
    creds.remove("failedAttempts");
    creds.remove("lockedUntil");
    if save_credentials(app, creds) {
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Failed to set PIN." })
    }
}

fn setup_password(app: &tauri::AppHandle, password: &str) -> Value {
    if password.len() < 8 {
        return json!({ "success": false, "error": "Password must be at least 8 characters." });
    }
    let mut creds = load_credentials(app);
    if !set_secret(&mut creds, "password", password) {
        return json!({ "success": false, "error": "Failed to secure password." });
    }
    creds.remove("failedAttempts");
    creds.remove("lockedUntil");
    if save_credentials(app, creds) {
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Failed to set password." })
    }
}

/// Run the OS biometric verifier (Windows Hello — fingerprint / face / device
/// PIN), returning Ok only on a verified prompt. `reason` is shown in the prompt.
#[cfg(windows)]
fn verify_biometric(reason: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // The reason is embedded in a double-quoted PowerShell string; strip quotes
    // and control chars so it can't break out of the literal.
    let safe_reason: String = reason
        .chars()
        .filter(|c| *c != '"' && *c != '`' && !c.is_control())
        .take(120)
        .collect();
    let script = format!(
        "Add-Type -AssemblyName System.Runtime.WindowsRuntime; \
[Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime] | Out-Null; \
$r = [Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync(\"{safe_reason}\").GetAwaiter().GetResult(); \
if($r -ne [Windows.Security.Credentials.UI.UserConsentVerificationResult]::Verified){{exit 1}}"
    );
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Biometric authentication not available on this device.".into())
    }
}

#[cfg(not(windows))]
fn verify_biometric(_reason: &str) -> Result<(), String> {
    Err("Biometric authentication not available on this device.".into())
}

fn setup_biometric(app: &tauri::AppHandle) -> Value {
    match verify_biometric("Enable biometric sign-in for DEX") {
        Ok(()) => {
            let mut creds = load_credentials(app);
            creds.insert("biometricEnabled".into(), json!(true));
            if save_credentials(app, creds) {
                json!({ "success": true })
            } else {
                json!({ "success": false, "error": "Failed to enable biometric." })
            }
        }
        Err(e) => json!({ "success": false, "error": e }),
    }
}

// ---------------------------------------------------------------------------
// Verification (unlock)
// ---------------------------------------------------------------------------

/// Shared PIN/password unlock path with lockout + token issuance + migration.
fn authenticate(app: &tauri::AppHandle, prefix: &str, input: &str) -> Value {
    clear_expired_lockout(app);
    let creds = load_credentials(app);
    let remaining = lockout_remaining_minutes(&creds);
    if remaining > 0 {
        let hint = if has_security_questions(&creds) {
            " Or recover your account with your security questions."
        } else {
            ""
        };
        return json!({
            "success": false,
            "error": format!("Too many attempts. Try again in {remaining} minute(s).{hint}"),
        });
    }
    if verify_secret(app, prefix, input) {
        reset_failures(app);
        json!({ "success": true, "token": issue_token() })
    } else {
        record_failure(app);
        let left = attempts_remaining(&load_credentials(app));
        json!({
            "success": false,
            "error": if left > 0 {
                format!("Incorrect. {left} attempt(s) remaining.")
            } else {
                format!("Too many attempts. Locked for {LOCKOUT_MINUTES} minutes.")
            },
        })
    }
}

fn authenticate_biometric(app: &tauri::AppHandle) -> Value {
    let creds = load_credentials(app);
    if !creds.get("biometricEnabled").and_then(|v| v.as_bool()).unwrap_or(false) {
        return json!({ "success": false, "error": "Biometric sign-in is not enabled." });
    }
    match verify_biometric("Unlock DEX") {
        Ok(()) => {
            reset_failures(app);
            json!({ "success": true, "token": issue_token() })
        }
        Err(e) => json!({ "success": false, "error": e }),
    }
}

// ---------------------------------------------------------------------------
// Management: change / clear / recovery / session
// ---------------------------------------------------------------------------

/// Accept either positional args (`[current, new]`) or a single JSON-string arg
/// (`JSON.stringify({currentPassword,newPassword})`) — the renderer uses both
/// conventions across call sites.
fn two_field_args(args: &Value, cur_key: &str, new_key: &str) -> (String, String) {
    // JSON-string form: args[0] is a stringified object.
    if let Some(s) = args.get(0).and_then(|v| v.as_str()) {
        if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(s) {
            let cur = obj.get(cur_key).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let new = obj.get(new_key).and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !cur.is_empty() || !new.is_empty() {
                return (cur, new);
            }
        }
    }
    // Positional form.
    let cur = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let new = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
    (cur, new)
}

/// Remaining password-change cooldown in minutes, or 0 if a change is allowed.
fn password_change_cooldown_remaining(creds: &Map<String, Value>) -> i64 {
    let last = creds.get("passwordChangedAt").and_then(|v| v.as_i64()).unwrap_or(0);
    if last <= 0 {
        return 0;
    }
    let elapsed_ms = now_ms() - last;
    let window_ms = PASSWORD_CHANGE_COOLDOWN_MINUTES * 60_000;
    if elapsed_ms < window_ms {
        ((window_ms - elapsed_ms) + 59_999) / 60_000
    } else {
        0
    }
}

fn change_password(app: &tauri::AppHandle, current: &str, new: &str) -> Value {
    if !verify_secret(app, "password", current) {
        return json!({ "success": false, "error": "Current password is incorrect." });
    }
    if new.len() < 8 {
        return json!({ "success": false, "error": "Password must be at least 8 characters." });
    }
    // Anti-spam cooldown between changes. Account recovery (security questions)
    // resets the password WITHOUT going through here, so a user who forgot their
    // password is never blocked by this.
    let cooldown = password_change_cooldown_remaining(&load_credentials(app));
    if cooldown > 0 {
        return json!({
            "success": false,
            "error": format!("For security you can change your password again in {cooldown} minute(s)."),
        });
    }
    let result = setup_password(app, new);
    if result.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let mut creds = load_credentials(app);
        creds.insert("passwordChangedAt".into(), json!(now_ms()));
        let _ = save_credentials(app, creds);
    }
    result
}

fn change_pin(app: &tauri::AppHandle, current: &str, new: &str) -> Value {
    if !verify_secret(app, "pin", current) {
        return json!({ "success": false, "error": "Current PIN is incorrect." });
    }
    setup_pin(app, new)
}

/// Remove a single enrolled method (`pin` / `password`), leaving the others in
/// place — the backing store for a Settings "Disable" toggle so the credential
/// is actually erased, not just hidden in the UI.
fn disable_secret(app: &tauri::AppHandle, prefix: &str) -> Value {
    let mut creds = load_credentials(app);
    creds.remove(&format!("{prefix}Hash"));
    creds.remove(&format!("{prefix}Salt"));
    creds.remove(&format!("{prefix}Algo"));
    if prefix == "pin" {
        creds.remove("pinLength");
    }
    if save_credentials(app, creds) {
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Failed to disable credential." })
    }
}

fn disable_biometric(app: &tauri::AppHandle) -> Value {
    let mut creds = load_credentials(app);
    creds.remove("biometricEnabled");
    if save_credentials(app, creds) {
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Failed to disable biometric." })
    }
}

/// Wipe all enrolled credentials. If a password is enrolled, the caller must
/// supply the correct current password (guards against a casual wipe).
fn clear_credentials(app: &tauri::AppHandle, current_password: Option<&str>) -> Value {
    let creds = load_credentials(app);
    let has_password = creds.get("passwordHash").and_then(|v| v.as_str()).is_some();
    if has_password {
        match current_password {
            Some(pw) if verify_secret(app, "password", pw) => {}
            _ => return json!({ "success": false, "error": "Current password is required." }),
        }
    }
    if save_credentials(app, Map::new()) {
        if let Ok(mut set) = session_tokens().lock() {
            set.clear();
        }
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Failed to clear credentials." })
    }
}

/// Generate one-time recovery codes. Plaintext is returned ONCE; only salted
/// hashes are stored. Codes are high-entropy, so a fast salted SHA-256 (not
/// Argon2id) keeps verification quick without weakening them meaningfully.
fn generate_recovery_codes(app: &tauri::AppHandle) -> Value {
    let mut plain = Vec::with_capacity(RECOVERY_CODE_COUNT);
    let mut stored = Vec::with_capacity(RECOVERY_CODE_COUNT);
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
    for _ in 0..RECOVERY_CODE_COUNT {
        let raw = crate::keys_ctl::os_random_bytes(10);
        let mut code = String::with_capacity(11);
        for (i, b) in raw.iter().enumerate() {
            if i == 5 {
                code.push('-');
            }
            code.push(ALPHABET[(*b as usize) % ALPHABET.len()] as char);
        }
        let salt = to_hex(&crate::keys_ctl::os_random_bytes(16));
        let hash = hash_legacy(&code, &salt);
        stored.push(json!({ "salt": salt, "hash": hash }));
        plain.push(code);
    }
    let mut creds = load_credentials(app);
    creds.insert("recoveryCodes".into(), json!(stored));
    if save_credentials(app, creds) {
        json!({ "success": true, "codes": plain })
    } else {
        json!({ "success": false })
    }
}

/// Consume a recovery code: if it matches a stored hash, remove it (one-time
/// use) and issue a session token.
fn authenticate_recovery(app: &tauri::AppHandle, code: &str) -> Value {
    let creds = load_credentials(app);
    let remaining = lockout_remaining_minutes(&creds);
    if remaining > 0 {
        return json!({
            "success": false,
            "error": format!("Too many attempts. Try again in {remaining} minute(s)."),
        });
    }
    let list = creds.get("recoveryCodes").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let mut matched_index: Option<usize> = None;
    for (i, entry) in list.iter().enumerate() {
        let salt = entry.get("salt").and_then(|v| v.as_str()).unwrap_or("");
        let hash = entry.get("hash").and_then(|v| v.as_str()).unwrap_or("");
        if ct_eq(&hash_legacy(code, salt), hash) {
            matched_index = Some(i);
            break;
        }
    }
    match matched_index {
        Some(i) => {
            let mut updated = load_credentials(app);
            if let Some(arr) = updated.get_mut("recoveryCodes").and_then(|v| v.as_array_mut()) {
                if i < arr.len() {
                    arr.remove(i);
                }
            }
            updated.remove("failedAttempts");
            updated.remove("lockedUntil");
            let _ = save_credentials(app, updated);
            json!({ "success": true, "token": issue_token() })
        }
        None => {
            record_failure(app);
            json!({ "success": false, "error": "Invalid recovery code." })
        }
    }
}

// ---------------------------------------------------------------------------
// Security questions — the "never permanently locked out" recovery path
// ---------------------------------------------------------------------------

/// Normalise an answer so trivial formatting differences don't fail a match:
/// trim, collapse internal whitespace, lowercase.
fn normalize_answer(answer: &str) -> String {
    answer.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn has_security_questions(creds: &Map<String, Value>) -> bool {
    creds
        .get("securityQuestions")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false)
}

/// Parse `[{question, answer}, ...]` from either a JSON-string arg or a JSON
/// array arg.
fn parse_qa(args: &Value) -> Vec<(String, String)> {
    let arr = match args.get(0) {
        Some(Value::String(s)) => serde_json::from_str::<Value>(s).ok(),
        Some(v) => Some(v.clone()),
        None => None,
    };
    let mut out = Vec::new();
    if let Some(Value::Array(items)) = arr {
        for it in items {
            let q = it.get("question").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let a = it.get("answer").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !q.is_empty() && !normalize_answer(&a).is_empty() {
                out.push((q, a));
            }
        }
    }
    out
}

/// `auth:setup:securityQuestions` — enrol recovery questions. Answers are
/// Argon2id-hashed (normalised first); the plaintext answers are never stored.
fn setup_security_questions(app: &tauri::AppHandle, args: &Value) -> Value {
    let qa = parse_qa(args);
    if qa.len() < MIN_SECURITY_QUESTIONS {
        return json!({
            "success": false,
            "error": format!("Enrol at least {MIN_SECURITY_QUESTIONS} security questions."),
        });
    }
    let mut stored = Vec::with_capacity(qa.len());
    for (question, answer) in qa {
        let salt = crate::keys_ctl::os_random_bytes(32);
        let hash = match hash_argon2(&normalize_answer(&answer), &salt) {
            Some(h) => h,
            None => return json!({ "success": false, "error": "Failed to secure answers." }),
        };
        stored.push(json!({
            "question": question,
            "answerHash": hash,
            "answerSalt": to_hex(&salt),
            "answerAlgo": "argon2id",
        }));
    }
    let mut creds = load_credentials(app);
    creds.insert("securityQuestions".into(), json!(stored));
    if save_credentials(app, creds) {
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Failed to save security questions." })
    }
}

/// `auth:getSecurityQuestions` — the enrolled questions (NEVER the answers), so
/// the recovery UI can prompt for them.
fn get_security_questions(app: &tauri::AppHandle) -> Value {
    let creds = load_credentials(app);
    let questions: Vec<Value> = creds
        .get("securityQuestions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(i, e)| json!({
                    "index": i,
                    "question": e.get("question").and_then(|v| v.as_str()).unwrap_or(""),
                }))
                .collect()
        })
        .unwrap_or_default();
    json!({ "enabled": !questions.is_empty(), "questions": questions })
}

/// `auth:recoverAccount` — verify ALL security-question answers, then clear any
/// lockout, optionally reset the password, and sign the user in. This is the
/// guaranteed way back in: it ignores the login lockout and the change cooldown.
///
/// Args (JSON-string or object): `{ answers: [string...], newPassword?: string }`.
fn recover_account(app: &tauri::AppHandle, args: &Value) -> Value {
    let obj = match args.get(0) {
        Some(Value::String(s)) => serde_json::from_str::<Value>(s).ok(),
        Some(v) => Some(v.clone()),
        None => None,
    };
    let obj = match obj {
        Some(Value::Object(o)) => o,
        _ => return json!({ "success": false, "error": "Invalid recovery request." }),
    };
    let answers: Vec<String> = obj
        .get("answers")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().map(|v| v.as_str().unwrap_or("").to_string()).collect())
        .unwrap_or_default();

    let creds = load_credentials(app);
    let questions = match creds.get("securityQuestions").and_then(|v| v.as_array()) {
        Some(q) if !q.is_empty() => q.clone(),
        _ => return json!({ "success": false, "error": "No security questions are set up." }),
    };
    if answers.len() != questions.len() {
        return json!({ "success": false, "error": "Please answer all security questions." });
    }
    // Every answer must match (constant-time-ish over the full set).
    let mut all_ok = true;
    for (entry, answer) in questions.iter().zip(answers.iter()) {
        let salt_hex = entry.get("answerSalt").and_then(|v| v.as_str()).unwrap_or("");
        let stored = entry.get("answerHash").and_then(|v| v.as_str()).unwrap_or("");
        let candidate = hash_argon2(&normalize_answer(answer), &from_hex(salt_hex));
        let matched = candidate.map(|h| ct_eq(&h, stored)).unwrap_or(false);
        if !matched {
            all_ok = false;
        }
    }
    if !all_ok {
        record_failure(app);
        return json!({ "success": false, "error": "One or more answers are incorrect." });
    }

    // Correct: always let them back in. Clear lockout first.
    reset_failures(app);

    // Optional password reset (bypasses the change cooldown — this IS the
    // forgot-password path).
    if let Some(new_pw) = obj.get("newPassword").and_then(|v| v.as_str()) {
        if !new_pw.is_empty() {
            if new_pw.len() < 8 {
                return json!({ "success": false, "error": "New password must be at least 8 characters." });
            }
            let mut c = load_credentials(app);
            if !set_secret(&mut c, "password", new_pw) {
                return json!({ "success": false, "error": "Failed to set new password." });
            }
            c.insert("passwordChangedAt".into(), json!(now_ms()));
            if !save_credentials(app, c) {
                return json!({ "success": false, "error": "Failed to save new password." });
            }
        }
    }
    json!({ "success": true, "token": issue_token() })
}

fn verify_session(token: &str) -> Value {
    let ok = !token.is_empty()
        && session_tokens()
            .lock()
            .map(|set| set.contains(token))
            .unwrap_or(false);
    json!(ok)
}

/// `auth:lock` — drop all live session tokens. Locking is explicit only; DEX
/// never locks on idle/sleep/resume, so there is no timer here.
fn lock(_app: &tauri::AppHandle) -> Value {
    if let Ok(mut set) = session_tokens().lock() {
        set.clear();
    }
    Value::Null
}

// ---------------------------------------------------------------------------
// State / config projections
// ---------------------------------------------------------------------------

fn cred_flags(app: &tauri::AppHandle) -> (bool, bool, bool, i64) {
    let creds = load_credentials(app);
    let has_password = creds.get("passwordHash").and_then(|v| v.as_str()).is_some();
    let has_pin = creds.get("pinHash").and_then(|v| v.as_str()).is_some();
    let has_biometric = creds
        .get("biometricEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let pin_length = creds.get("pinLength").and_then(|v| v.as_i64()).unwrap_or(4);
    (has_password, has_pin, has_biometric, pin_length)
}

fn derive_method(has_password: bool, has_pin: bool, has_biometric: bool) -> &'static str {
    match (has_biometric, has_password, has_pin) {
        (true, true, _) => "biometric+password",
        (true, _, true) => "biometric+pin",
        (true, false, false) => "biometric",
        (false, true, _) => "password",
        (false, false, true) => "pin",
        _ => "none",
    }
}

fn lockout_status(creds: &Map<String, Value>) -> Value {
    let remaining = lockout_remaining_minutes(creds);
    json!({
        "isLockedOut": remaining > 0,
        "remainingMinutes": remaining,
        "attemptsRemaining": attempts_remaining(creds),
    })
}

fn get_state(app: &tauri::AppHandle) -> Value {
    let creds = load_credentials(app);
    let (has_password, has_pin, has_biometric, _) = cred_flags(app);
    let is_enabled = has_password || has_pin || has_biometric;
    json!({
        // Never auto-locked: the session persists across close/resume (owner
        // mandate). Locking is opt-in via the explicit lock action only.
        "isLocked": false,
        "isEnabled": is_enabled,
        "method": derive_method(has_password, has_pin, has_biometric),
        "hasPassword": has_password,
        "hasPin": has_pin,
        "hasBiometric": has_biometric,
        // Recovery availability so the lock screen can offer "Forgot? Recover".
        "hasSecurityQuestions": has_security_questions(&creds),
        "hasRecoveryCodes": creds.get("recoveryCodes").and_then(|v| v.as_array()).map(|a| !a.is_empty()).unwrap_or(false),
        "lockoutStatus": lockout_status(&creds),
    })
}

fn get_config(app: &tauri::AppHandle) -> Value {
    let (has_password, has_pin, has_biometric, pin_length) = cred_flags(app);
    let is_enabled = has_password || has_pin || has_biometric;
    json!({
        "enabled": is_enabled,
        "method": derive_method(has_password, has_pin, has_biometric),
        "pinLength": if pin_length == 6 { 6 } else { 4 },
        // Idle/session-timeout locking is permanently OFF by design.
        "lockOnSleep": false,
        "lockOnMinimize": false,
        "timeoutMinutes": 0,
        "requireOnLaunch": false,
        "requireOnResume": false,
        "maxAttempts": MAX_ATTEMPTS,
        "lockoutMinutes": LOCKOUT_MINUTES,
    })
}

/// `auth:updateConfig` — the only persistent policy DEX honors is derived from
/// enrolment (method, pinLength). Idle/timeout fields are intentionally fixed
/// off, so config updates are accepted and the idle fields ignored. Returns the
/// (unchanged-policy) config so the renderer stays in sync.
fn update_config(app: &tauri::AppHandle) -> Value {
    json!({ "success": true, "config": get_config(app) })
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/// Route every natively-handled `auth:*` channel. `auth:biometricsAvailable` is
/// answered renderer-side (WebAuthn probe) and never reaches here; anything
/// unrecognised returns `Value::Null` so the central dispatcher can fall through.
/// Route an `auth:*` channel. Anything that can change sign-in state (enrol, disable,
/// lock, unlock attempts that move the lockout counter) is followed by an
/// `auth:state-changed` push with the fresh `getState`, so the auth store stays right
/// when Settings changes PIN/password/fingerprint directly over IPC.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let out = dispatch_inner(app, channel, args);
    let read_only = matches!(
        channel,
        "auth:getState" | "auth:getConfig" | "auth:getLockoutStatus" | "auth:getSecurityQuestions" | "auth:verifySession"
    );
    // Null = unknown channel, except lock (which answers nothing).
    if !read_only && (!out.is_null() || channel == "auth:lock") {
        crate::native_ops::emit_event(app, "auth:state-changed", &get_state(app));
    }
    out
}

fn dispatch_inner(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg_str = |i: usize| -> String {
        args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string()
    };
    match channel {
        // Enrolment (Settings uses the `setup:` names; the store proxy uses the
        // bare names — both are accepted).
        "auth:setup:pin" | "auth:setPin" => setup_pin(app, &arg_str(0)),
        "auth:setup:password" | "auth:setPassword" => setup_password(app, &arg_str(0)),
        "auth:setup:biometric" | "auth:enableBiometric" => setup_biometric(app),

        // Verification (unlock).
        "auth:authenticatePassword" => authenticate(app, "password", &arg_str(0)),
        "auth:authenticatePin" => authenticate(app, "pin", &arg_str(0)),
        "auth:authenticateBiometric" => authenticate_biometric(app),
        "auth:authenticateRecovery" => authenticate_recovery(app, &arg_str(0)),
        "auth:verifySession" => verify_session(&arg_str(0)),

        // Management.
        "auth:changePassword" => {
            let (cur, new) = two_field_args(args, "currentPassword", "newPassword");
            change_password(app, &cur, &new)
        }
        "auth:changePin" => {
            let (cur, new) = two_field_args(args, "currentPin", "newPin");
            change_pin(app, &cur, &new)
        }
        "auth:clearCredentials" => {
            let pw = args.get(0).and_then(|v| v.as_str());
            clear_credentials(app, pw)
        }
        "auth:generateRecoveryCodes" => generate_recovery_codes(app),
        "auth:updateConfig" => update_config(app),
        "auth:lock" => lock(app),

        // Security-question account recovery — the guaranteed way back in.
        "auth:setup:securityQuestions" | "auth:setSecurityQuestions" => {
            setup_security_questions(app, args)
        }
        "auth:getSecurityQuestions" => get_security_questions(app),
        "auth:recoverAccount" => recover_account(app, args),

        // Per-method disable (Settings "Disable" toggles) — actually erase the
        // credential instead of only flipping a UI flag.
        "auth:disablePin" => disable_secret(app, "pin"),
        "auth:disablePassword" => disable_secret(app, "password"),
        "auth:disableBiometric" => disable_biometric(app),

        // Read.
        "auth:getState" => get_state(app),
        "auth:getConfig" => get_config(app),
        "auth:getLockoutStatus" => lockout_status(&load_credentials(app)),

        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_hex_and_from_hex_roundtrip() {
        let bytes = [0x00, 0x0f, 0xff, 0xa5, 0x10];
        assert_eq!(to_hex(&bytes), "000fffa510");
        assert_eq!(from_hex("000fffa510"), bytes.to_vec());
        assert_eq!(from_hex(""), Vec::<u8>::new());
        // Malformed input decodes to empty (non-matching credential).
        assert_eq!(from_hex("xyz"), Vec::<u8>::new());
        assert_eq!(from_hex("abc"), Vec::<u8>::new()); // odd length
    }

    #[test]
    fn ct_eq_matches_content_and_length() {
        assert!(ct_eq("abcd", "abcd"));
        assert!(!ct_eq("abcd", "abce"));
        assert!(!ct_eq("abcd", "abcde"));
        assert!(ct_eq("", ""));
    }

    #[test]
    fn argon2_hash_is_deterministic_and_salt_sensitive() {
        let salt_a = [7u8; 32];
        let salt_b = [9u8; 32];
        let a1 = hash_argon2("1234", &salt_a).unwrap();
        let a2 = hash_argon2("1234", &salt_a).unwrap();
        let b = hash_argon2("1234", &salt_b).unwrap();
        assert_eq!(a1, a2, "same secret+salt hashes identically");
        assert_ne!(a1, b, "different salt changes the hash");
        assert!(!a1.contains("1234"), "hash never echoes the plaintext");
    }

    #[test]
    fn legacy_hash_still_verifies_via_ct_eq() {
        let salt = "deadbeef";
        let h = hash_legacy("1234", salt);
        assert!(ct_eq(&hash_legacy("1234", salt), &h));
        assert!(!ct_eq(&hash_legacy("1235", salt), &h));
        assert_eq!(h.len(), 64);
    }

    #[test]
    fn recovery_alphabet_excludes_ambiguous_chars() {
        const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for c in [b'0', b'O', b'1', b'I', b'l'] {
            assert!(!ALPHABET.contains(&c), "ambiguous char {} present", c as char);
        }
    }

    #[test]
    fn answer_normalization_is_forgiving_but_distinct() {
        assert_eq!(normalize_answer("  My   First  CAR "), "my first car");
        assert_eq!(normalize_answer("Fido"), normalize_answer("  fido "));
        assert_ne!(normalize_answer("blue"), normalize_answer("green"));
        assert_eq!(normalize_answer("   "), "");
    }

    #[test]
    fn password_change_cooldown_math() {
        let mut creds = Map::new();
        // No prior change: no cooldown.
        assert_eq!(password_change_cooldown_remaining(&creds), 0);
        // Just changed: full cooldown pending (rounded up, > 0).
        creds.insert("passwordChangedAt".into(), json!(now_ms()));
        let rem = password_change_cooldown_remaining(&creds);
        assert!(rem > 0 && rem <= PASSWORD_CHANGE_COOLDOWN_MINUTES);
        // Changed long ago: cooldown elapsed.
        creds.insert(
            "passwordChangedAt".into(),
            json!(now_ms() - (PASSWORD_CHANGE_COOLDOWN_MINUTES + 1) * 60_000),
        );
        assert_eq!(password_change_cooldown_remaining(&creds), 0);
    }

    #[test]
    fn lockout_remaining_and_attempts() {
        let mut creds = Map::new();
        assert_eq!(lockout_remaining_minutes(&creds), 0);
        assert_eq!(attempts_remaining(&creds), MAX_ATTEMPTS);
        // Armed lockout in the future.
        creds.insert("lockedUntil".into(), json!(now_ms() + 3 * 60_000));
        assert!(lockout_remaining_minutes(&creds) > 0);
        // Expired lockout reads as unlocked (clear_expired_lockout will reset it).
        creds.insert("lockedUntil".into(), json!(now_ms() - 1000));
        assert_eq!(lockout_remaining_minutes(&creds), 0);
        creds.insert("failedAttempts".into(), json!(2));
        assert_eq!(attempts_remaining(&creds), MAX_ATTEMPTS - 2);
    }

    #[test]
    fn has_security_questions_detects_enrolment() {
        let mut creds = Map::new();
        assert!(!has_security_questions(&creds));
        creds.insert("securityQuestions".into(), json!([]));
        assert!(!has_security_questions(&creds));
        creds.insert("securityQuestions".into(), json!([{ "question": "q", "answerHash": "h" }]));
        assert!(has_security_questions(&creds));
    }
}
