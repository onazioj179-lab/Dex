// =============================================================================
// DEX Tauri — Creator-access subsystem (port of the data/read surface of
// CreatorAccessService.ts).
//
// Pure-data, JSON-backed tier. Electron persisted the unlock token in
// `userData/creator-access.json`; this mirrors that file 1:1 under <appData>:
//   - creator-access.json : { token: string, expiresAt: number }
// (The file name is `creator-access.json`, NOT a `creator` electron-store; this
// service used raw fs.writeFileSync, so there is no top-level store wrapper key —
// the JSON object IS the PersistedToken.)
//
// Two DATA/read channels are ported at the EXACT Electron return shapes:
//   - creator:status  (getStatus) -> { configured, fingerprint, available }
//   - creator:current (getAccess) -> { unlocked, reason? , expiresAt? }
//
// NATIVE divergence (documented, central to this subsystem): every meaningful
// answer in CreatorAccessService depends on the native `creator_key` N-API
// module (creatorKeyStatus / creatorCheckToken / creatorMakeChallenge /
// creatorVerifySignature). That module performs offline-owner HMAC signing and
// verification, with a secret REGENERATED on every process boot — it is not a
// data operation and cannot be reproduced in the pure-data Tauri tier.
//
// Therefore the two ported read channels return the SAME shapes Electron itself
// returns when the native module is absent (the `loadNative() == null`
// branches). This is faithful, not faked: those branches are real, documented
// Electron behaviour, the renderer already handles them (resolvePlan() treats a
// non-unlocked / unavailable state as the 'free' tier, see src/shared/plan.ts),
// and crucially this NEVER fabricates an unlocked/power state. creator:current
// still reads the persisted token file exactly as Electron did (same path, same
// shape, same corrupt-tolerant parse) so the data layer is honest; only the
// native validity verdict is reported as unavailable.
//
// HEAVY channels (creator:challenge + creator:verify == requestAccess,
// creator:lock == revokeAccess) are NOT ported — challenge/verify are native
// HMAC crypto, and lock is a privileged state mutation gated on that flow. They
// return null (prefix route degrades honestly). See channelsSkipped.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

// Same on-disk file name Electron used (app.getPath('userData') + file). On the
// Tauri tier the equivalent root is app_data_dir().
const TOKEN_FILE: &str = "creator-access.json";

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(TOKEN_FILE)
}

// loadPersisted(): parse creator-access.json, returning the object only if it has
// a string `token` and a number `expiresAt`; otherwise null. Corrupt / missing
// files are silently ignored, mirroring the Electron try/catch.
fn load_persisted(app: &tauri::AppHandle) -> Option<Value> {
    let raw = std::fs::read_to_string(store_path(app)).ok()?;
    let parsed: Value = serde_json::from_str(&raw).ok()?;
    let token_ok = parsed.get("token").and_then(|v| v.as_str()).is_some();
    let exp_ok = parsed
        .get("expiresAt")
        .map(|v| v.is_number())
        .unwrap_or(false);
    if token_ok && exp_ok {
        Some(parsed)
    } else {
        None
    }
}

// creator:status (getStatus). The native verifier is unavailable on the data
// tier, so this is the exact `if (!native)` branch from registerCreatorAccessIpc:
//   return { configured: false, fingerprint: null, available: false };
fn get_status(_app: &tauri::AppHandle) -> Value {
    json!({
        "configured": false,
        "fingerprint": Value::Null,
        "available": false,
    })
}

// creator:current (getAccess). We faithfully read the persisted token file as
// Electron did. Electron then asks the native module to validate it; with no
// native module Electron returns { unlocked: false, reason: 'native-unavailable' }
// (the `if (!native)` branch, which precedes the file read). We mirror that exact
// shape. The file read still runs so the data layer behaves identically should a
// future native verdict layer be wired in.
fn get_current(app: &tauri::AppHandle) -> Value {
    let _persisted = load_persisted(app);
    json!({
        "unlocked": false,
        "reason": "native-unavailable",
    })
}

/// Route a `creator:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The two read channels are ported; the native
/// HMAC / mutation channels (challenge, verify, lock) return Value::Null so the
/// prefix route degrades honestly without ever fabricating an unlocked state.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "creator:status" => get_status(_app),
        "creator:current" => get_current(_app),
        // Heavy / native channels — intentionally not ported (see header).
        _ => Value::Null,
    }
}
