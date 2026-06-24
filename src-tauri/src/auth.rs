// =============================================================================
// DEX 6.0 — Auth setup IPC (Tauri shell)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Native handlers for the `auth:setup:*` channels the Settings screen calls
//! to enrol a PIN / password / biometric. Ports the credential-writing half of
//! the Electron `AuthController` (`setPin` / `setPassword` / `enableBiometric`):
//!
//!   * Validation matches Electron exactly (PIN `^\d{4,6}$`, password >= 8).
//!   * Each secret is stored as a SALTED SHA-256 hash — never the plaintext —
//!     with a fresh 32-byte OS-CSPRNG salt (the canonical
//!     `keys_ctl::os_random_bytes`, i.e. `crypto.randomBytes` parity). Electron
//!     used PBKDF2; the documented Tauri port uses salted SHA-256 (see
//!     rendererShims `NATIVE_PENDING` + docs/TAURI-MIGRATION.md). The hash is
//!     `sha256_hex(salt_hex + secret)`.
//!   * Credentials live in the shared `dex-kv.json` store under
//!     `auth:credentials`, alongside the rest of the migrated KV subsystems.
//!   * Biometric enrolment runs the real OS verifier (Windows Hello
//!     `UserConsentVerifier`) before flipping the enabled flag — it is never
//!     faked; on a device without biometrics it returns `{success:false,error}`,
//!     matching Electron.

use serde_json::{json, Value};

const CRED_KEY: &str = "auth:credentials";

/// Lowercase-hex encoding of a byte slice (salt -> string for storage + hashing).
fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Salted SHA-256, hex — `sha256_hex(salt + secret)`. Reuses the one canonical
/// SHA-256 (`licensing::sha256_hex`); no second hash implementation.
fn hash_secret(secret: &str, salt_hex: &str) -> String {
    let mut input = String::with_capacity(salt_hex.len() + secret.len());
    input.push_str(salt_hex);
    input.push_str(secret);
    crate::licensing::sha256_hex(input.as_bytes())
}

/// Load the stored credential object (or an empty object if none yet).
fn load_credentials(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    crate::kv_get(app, CRED_KEY)
        .as_object()
        .cloned()
        .unwrap_or_default()
}

/// Persist the credential object back to the shared KV store.
fn save_credentials(app: &tauri::AppHandle, creds: serde_json::Map<String, Value>) -> bool {
    crate::kv_set(app, CRED_KEY, Value::Object(creds))
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// `auth:setup:pin` (args: `[pin]`) — validate + store a salted PIN hash.
fn setup_pin(app: &tauri::AppHandle, pin: &str) -> Value {
    let digits_ok = (4..=6).contains(&pin.len()) && pin.bytes().all(|b| b.is_ascii_digit());
    if !digits_ok {
        return json!({ "success": false, "error": "PIN must be 4-6 digits." });
    }
    let salt = to_hex(&crate::keys_ctl::os_random_bytes(32));
    let hash = hash_secret(pin, &salt);

    let mut creds = load_credentials(app);
    creds.insert("pinHash".into(), json!(hash));
    creds.insert("pinSalt".into(), json!(salt));
    creds.insert("pinLength".into(), json!(pin.len()));
    if save_credentials(app, creds) {
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Failed to set PIN." })
    }
}

/// `auth:setup:password` (args: `[password]`) — validate + store a salted hash.
fn setup_password(app: &tauri::AppHandle, password: &str) -> Value {
    if password.len() < 8 {
        return json!({ "success": false, "error": "Password must be at least 8 characters." });
    }
    let salt = to_hex(&crate::keys_ctl::os_random_bytes(32));
    let hash = hash_secret(password, &salt);

    let mut creds = load_credentials(app);
    creds.insert("passwordHash".into(), json!(hash));
    creds.insert("passwordSalt".into(), json!(salt));
    if save_credentials(app, creds) {
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Failed to set password." })
    }
}

/// Run the OS biometric verifier, returning Ok(()) only on a verified prompt.
/// Windows: the same Windows Hello `UserConsentVerifier` call the Electron
/// controller used. Other platforms: not wired here (returns an error) — there
/// is no headless biometric prompt to fake.
#[cfg(windows)]
fn verify_biometric() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let script = "Add-Type -AssemblyName System.Runtime.WindowsRuntime; \
[Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime] | Out-Null; \
$r = [Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync(\"Enable biometric authentication for DEX\").GetAwaiter().GetResult(); \
if($r -ne [Windows.Security.Credentials.UI.UserConsentVerificationResult]::Verified){exit 1}";
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", script])
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
fn verify_biometric() -> Result<(), String> {
    Err("Biometric authentication not available on this device.".into())
}

/// `auth:setup:biometric` (no args) — verify with the OS, then persist the flag.
fn setup_biometric(app: &tauri::AppHandle) -> Value {
    match verify_biometric() {
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

const MAX_ATTEMPTS: i64 = 5;
const LOCKOUT_MINUTES: i64 = 5;

/// Derive `(has_password, has_pin, has_biometric, pin_length)` from the stored
/// credential object.
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

/// The active auth method, derived from which credentials are enrolled. Matches
/// the `AuthState['method']` union the renderer expects.
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

/// `auth:getState` -> AuthController.getPublicState() parity. Derived from the
/// stored credentials. `isLocked` is false: native enrolment + state read are
/// ported, but live session locking is not (documented), and the renderer's own
/// default is also unlocked, so this never wrongly blocks the UI.
fn get_state(app: &tauri::AppHandle) -> Value {
    let (has_password, has_pin, has_biometric, _) = cred_flags(app);
    let is_enabled = has_password || has_pin || has_biometric;
    json!({
        "isLocked": false,
        "isEnabled": is_enabled,
        "method": derive_method(has_password, has_pin, has_biometric),
        "hasPassword": has_password,
        "hasPin": has_pin,
        "hasBiometric": has_biometric,
        "lockoutStatus": {
            "isLockedOut": false,
            "remainingMinutes": 0,
            "attemptsRemaining": MAX_ATTEMPTS,
        },
    })
}

/// `auth:getConfig` -> the `AuthConfig` projection the renderer stores. Derived
/// from credentials + the Electron default policy (session-policy fields like
/// lockOnSleep are renderer/OS concerns not yet wired natively, so they take
/// their documented defaults).
fn get_config(app: &tauri::AppHandle) -> Value {
    let (has_password, has_pin, has_biometric, pin_length) = cred_flags(app);
    let is_enabled = has_password || has_pin || has_biometric;
    json!({
        "enabled": is_enabled,
        "method": derive_method(has_password, has_pin, has_biometric),
        "pinLength": if pin_length == 6 { 6 } else { 4 },
        "lockOnSleep": false,
        "lockOnMinimize": false,
        "timeoutMinutes": 0,
        "requireOnLaunch": false,
        "requireOnResume": false,
        "maxAttempts": MAX_ATTEMPTS,
        "lockoutMinutes": LOCKOUT_MINUTES,
    })
}

/// Route the natively-handled `auth:*` channels (enrolment + state/config read).
/// Returns `Value::Null` for anything else so the central dispatcher falls
/// through. NB: `auth:biometricsAvailable` is served renderer-side (WebAuthn
/// probe) and never reaches here.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg_str = |i: usize| -> String {
        args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string()
    };
    match channel {
        "auth:setup:pin" => setup_pin(app, &arg_str(0)),
        "auth:setup:password" => setup_password(app, &arg_str(0)),
        "auth:setup:biometric" => setup_biometric(app),
        "auth:getState" => get_state(app),
        "auth:getConfig" => get_config(app),
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_hex_encodes_lowercase_two_chars_per_byte() {
        assert_eq!(to_hex(&[0x00, 0x0f, 0xff, 0xa5]), "000fffa5");
        assert_eq!(to_hex(&[]), "");
    }

    #[test]
    fn hash_is_deterministic_and_salt_sensitive() {
        let a = hash_secret("1234", "deadbeef");
        let b = hash_secret("1234", "deadbeef");
        let c = hash_secret("1234", "feedface");
        assert_eq!(a, b, "same secret+salt must hash identically");
        assert_ne!(a, c, "different salt must change the hash");
        // SHA-256 hex is 64 chars and never echoes the plaintext.
        assert_eq!(a.len(), 64);
        assert!(!a.contains("1234"));
    }

    #[test]
    fn different_secrets_differ() {
        assert_ne!(hash_secret("1234", "abcd"), hash_secret("1235", "abcd"));
    }
}
