// =============================================================================
// DEX Tauri — Permission subsystem (port of the `permission:*` IPC handlers in
// core/PermissionGuard.ts; the granted/denied flags also back
// security/PermissionManager.ts).
//
// Pure-data, DataStore-KV tier (same backbone as modes_dispatch in main.rs and
// rule_engine.rs). Electron stored the user's permission flags under the
// `permissions` key of the `dex-data` electron-store — a DexPermissions object,
// default { openApps:true, closeApps:false, runCommands:false, adjustVolume:true,
// fileSystem:false, network:false }. On Tauri the DataStore keys live in the
// native KV store (dex-kv.json) reached via crate::kv_get / crate::kv_set, so we
// read the SAME key string ("permissions"), mirroring how `modes`/`rules` were
// ported. When the key is unset we apply the SAME electron-store defaults.
//
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// DATA channels ported (reads of the permission/feature state):
//   - permission:check          (arg0: permission key) -> bool
//                                 (PermissionGuard.hasPermission)
//   - permission:getAllStates   -> PermissionState[]
//                                 { permission, granted, lastChecked }
//   - permission:getAllFeatures -> FeatureDependency[]
//                                 { feature, requiredPermissions[], enabled,
//                                   degradedMode }
//   - permission:checkFeature   (arg0: feature) ->
//                                 { available, degraded, missingPermissions[] }
//
// HEAVY channels SKIPPED (need native runtime — NOT implemented, NOT faked):
//   - permission:request — opens a native modal dialog (electron `dialog.
//     showMessageBox`) and only on "Allow" persists the grant. There is no
//     pure-data equivalent; it falls through to the catch-all and returns
//     Value::Null (honest degrade, never a faked "granted").
//
// NOTE on the abstract spec ("grant"/"revoke" heavy channels): in this codebase
// those live in a DIFFERENT namespace (`permissions:grant` / `permissions:revoke`
// — note the trailing 's', via main.ts -> PermissionManager). They are NOT part
// of the `permission:` namespace this module routes, so there is nothing to skip
// here for them; this dispatch only owns `permission:*`.
//
// DIVERGENCES (documented):
//   - lastChecked: Electron's getAllStates returns live in-memory PermissionState
//     objects whose `lastChecked` was stamped at load/refresh time (Date.now()).
//     There is no persisted equivalent, so we stamp the current epoch-ms at read
//     time. The renderer treats this as a freshness marker; the load-bearing
//     field (`granted`) is exact. revokedAt/revokeReason are runtime-only fields
//     that are absent unless a revoke happened mid-session — since this is a cold
//     read with no monitor loop, they are omitted (matching a freshly loaded
//     state, where Electron also leaves them undefined / not serialized).
//   - Feature/permission ENUMERATION is reproduced verbatim from PermissionGuard:
//     the six permission keys and the eight default feature dependencies (and
//     their required permissions) are hard-coded to match registerDefaultFeatures
//     exactly. enabled/degradedMode are derived from the same all/some-granted
//     logic with gracefulDegradation = true (the default config).
// =============================================================================

use serde_json::{json, Value};

const PERMISSIONS_KEY: &str = "permissions";

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// The six permission keys in PermissionGuard.loadPermissionStates order.
const PERMISSION_KEYS: [&str; 6] = [
    "openApps",
    "closeApps",
    "runCommands",
    "adjustVolume",
    "fileSystem",
    "network",
];

// Default feature dependencies, verbatim from registerDefaultFeatures(), in
// insertion order (JS Map preserves it; getAllFeatures returns that order).
const FEATURES: [(&str, &[&str]); 8] = [
    ("app-launcher", &["openApps"]),
    ("app-killer", &["closeApps"]),
    ("command-execution", &["runCommands"]),
    ("volume-control", &["adjustVolume"]),
    ("file-operations", &["fileSystem"]),
    ("network-monitor", &["network"]),
    ("automation-runner", &["runCommands", "fileSystem"]),
    ("voice-commands", &["runCommands"]),
];

// Read the stored DexPermissions object, applying electron-store defaults when
// the key is unset (matches DataStore's defaults block).
fn load_permissions(app: &tauri::AppHandle) -> Value {
    match crate::kv_get(app, PERMISSIONS_KEY) {
        Value::Object(map) => Value::Object(map),
        _ => json!({
            "openApps": true,
            "closeApps": false,
            "runCommands": false,
            "adjustVolume": true,
            "fileSystem": false,
            "network": false,
        }),
    }
}

// PermissionGuard.hasPermission: state.granted ?? false, where granted came from
// `permissions[key] ?? false`. Either way an absent key reads as false.
fn has_permission(perms: &Value, key: &str) -> bool {
    perms.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

// permission:check
fn check(app: &tauri::AppHandle, permission: &str) -> Value {
    let perms = load_permissions(app);
    json!(has_permission(&perms, permission))
}

// permission:getAllStates -> PermissionState[]
fn get_all_states(app: &tauri::AppHandle) -> Value {
    let perms = load_permissions(app);
    let ts = now_ms();
    let states: Vec<Value> = PERMISSION_KEYS
        .iter()
        .map(|key| {
            json!({
                "permission": key,
                "granted": has_permission(&perms, key),
                "lastChecked": ts,
            })
        })
        .collect();
    json!(states)
}

// Derive a feature's (enabled, degraded) from the granted permissions, mirroring
// updateFeatureStates with gracefulDegradation = true.
fn feature_state(perms: &Value, required: &[&str]) -> (bool, bool) {
    let all_granted = required.iter().all(|p| has_permission(perms, p));
    let some_granted = required.iter().any(|p| has_permission(perms, p));
    let enabled = all_granted;
    let degraded = !all_granted && some_granted; // gracefulDegradation default = true
    (enabled, degraded)
}

// permission:getAllFeatures -> FeatureDependency[]
fn get_all_features(app: &tauri::AppHandle) -> Value {
    let perms = load_permissions(app);
    let features: Vec<Value> = FEATURES
        .iter()
        .map(|(feature, required)| {
            let (enabled, degraded) = feature_state(&perms, required);
            json!({
                "feature": feature,
                "requiredPermissions": required,
                "enabled": enabled,
                "degradedMode": degraded,
            })
        })
        .collect();
    json!(features)
}

// permission:checkFeature -> { available, degraded, missingPermissions }
// Unknown feature: isFeatureAvailable/isFeatureDegraded default to false and
// getMissingPermissions returns [] (no dependency entry).
fn check_feature(app: &tauri::AppHandle, feature: &str) -> Value {
    let perms = load_permissions(app);
    match FEATURES.iter().find(|(name, _)| *name == feature) {
        Some((_, required)) => {
            let (enabled, degraded) = feature_state(&perms, required);
            let missing: Vec<&str> = required
                .iter()
                .copied()
                .filter(|p| !has_permission(&perms, p))
                .collect();
            json!({
                "available": enabled,
                "degraded": degraded,
                "missingPermissions": missing,
            })
        }
        None => json!({
            "available": false,
            "degraded": false,
            "missingPermissions": [],
        }),
    }
}

/// Route a `permission:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every data channel in the namespace is
/// handled; the heavy `permission:request` and any unknown channel return
/// Value::Null (honest degrade — never a faked grant).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "permission:check" => {
            let permission = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            check(app, permission)
        }
        "permission:getAllStates" => get_all_states(app),
        "permission:getAllFeatures" => get_all_features(app),
        "permission:checkFeature" => {
            let feature = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            check_feature(app, feature)
        }
        // permission:request -> native dialog; not ported, not faked.
        _ => Value::Null,
    }
}
