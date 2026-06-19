// =============================================================================
// DEX Tauri — Trust store subsystem (port of the trust-store `trust:*` IPC
// handlers in src/main/controllers/PluginController.ts, which delegate to the
// pure model in src/main/security/trustStore.ts).
//
// Pure-data, fs-JSON tier. Electron persisted the trust store as a plain JSON
// file at `userData/dex-trust-store.json` (NOT an electron-store, and NOT a
// top-level key wrapper — the file IS the TrustStoreData object). This mirrors
// that exactly under <appData>/dex-trust-store.json. Return shape matches the
// Electron `trust:list` handler (= loadTrustStore) precisely so the renderer is
// unchanged.
//
// SCOPE NOTE (important): the `trust:` namespace is shared by TWO controllers.
//   1. PluginController trust-store CRUD: trust:list / trust:add / trust:revoke
//      / trust:rotate  (fs-json dex-trust-store.json — this file).
//   2. TrustController transparency panel: trust:getStatus / trust:getFullReport
//      / trust:getPermissions / trust:runSecurityAudit / ... (LIVE native
//      services — SecurityAudit, PermissionLockdown, PerformanceGuardian,
//      EncryptionService, BackgroundTasks — not pure data, out of scope here).
// This module ONLY owns the trust-store subset. It returns Value::Null for every
// other trust: channel, which is an honest degrade but means a prefix route is
// NOT sufficient on its own (the panel channels would silently break). Hence
// prefixRouteSafe = false: route trust:list explicitly to this dispatch.
//
// CHANNEL NOTES vs the porting brief:
//   - The brief listed data channels "list, get": `trust:list` is real and
//     ported below. `trust:get` does NOT exist anywhere in the Electron source
//     (no `trust:get` handler) — there is nothing to port, so it is reported in
//     channelsSkipped as nonexistent rather than invented.
//   - The brief listed heavy channels "verify, certify": neither exists under
//     the `trust:` namespace. The nearest real heavy op is `plugins:verifyPackage`
//     (a different namespace, codeSigningGate — native crypto). The real trust:
//     mutations (add/revoke/rotate) require Ed25519 keyId derivation
//     (keyIdForPublicKey = sha256 over the public key) and key validation, which
//     is native-crypto work; they are intentionally NOT ported/faked.
//
// Channel & shape (from PluginController `trust:list` -> trustStore.loadTrustStore):
//   - trust:list -> TrustStoreData = { version: 1, keys: TrustedKey[] }
//     where TrustedKey = {
//       keyId: string,            // 64-hex sha256 prefix (kept as stored)
//       publicKey: string,        // 64 hex chars, lowercased on add
//       status: "active"|"revoked",
//       addedAt: number,
//       label?: string,           // optional
//       rotatedFrom?: string,     // optional
//     }
//     loadTrustStore returns emptyTrustStore() ({ version: 1, keys: [] }) when
//     the file is missing or unparseable, and otherwise runs normalizeTrustStore
//     which: returns empty if `keys` is not an array, and drops any entry whose
//     keyId isn't a string, whose publicKey isn't 64 hex chars, or whose status
//     isn't "active"/"revoked". Output is ALWAYS { version: 1, keys } — the
//     `version` field is forced to 1 regardless of the stored value. This port
//     reproduces that normalization exactly.
//
// DIVERGENCES (documented): none in the returned data. We do not preserve any
// extra/unknown fields on a key beyond what normalizeTrustStore validates against
// — but normalizeTrustStore in Electron keeps the WHOLE original entry object
// (it filters the array, it does not pick fields), so we likewise keep each
// surviving key object verbatim (only the top-level `version` is forced to 1).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const TRUST_STORE_FILE: &str = "dex-trust-store.json";

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(TRUST_STORE_FILE)
}

// emptyTrustStore(): { version: 1, keys: [] }
fn empty_store() -> Value {
    json!({ "version": 1, "keys": [] })
}

// Mirror trustStore.ts: 64 hex chars, case-insensitive.
fn is_64_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

// normalizeTrustStore(data): drop malformed entries; force version: 1.
fn normalize(data: &Value) -> Value {
    let keys = match data.get("keys").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return empty_store(),
    };
    let kept: Vec<Value> = keys
        .iter()
        .filter(|k| {
            let key_id_ok = k.get("keyId").and_then(|v| v.as_str()).is_some();
            // Electron tests String(k.publicKey) against the hex regex — a missing
            // or non-string publicKey stringifies to "undefined"/"[object ...]"
            // which fails the regex, so a plain as_str() check is equivalent.
            let pub_ok = k
                .get("publicKey")
                .and_then(|v| v.as_str())
                .map(is_64_hex)
                .unwrap_or(false);
            let status_ok = matches!(
                k.get("status").and_then(|v| v.as_str()),
                Some("active") | Some("revoked")
            );
            key_id_ok && pub_ok && status_ok
        })
        // Keep the whole original entry verbatim (filter, not field-pick).
        .cloned()
        .collect();
    json!({ "version": 1, "keys": kept })
}

// loadTrustStore(filePath): missing/unparseable -> empty; else normalize.
fn load(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(parsed) => normalize(&parsed),
            Err(_) => empty_store(),
        },
        Err(_) => empty_store(),
    }
}

/// Route a `trust:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the trust-store `trust:list` data channel is
/// owned here; all other trust: channels (panel + mutations) return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "trust:list" => load(app),
        _ => Value::Null,
    }
}
