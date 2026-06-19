// =============================================================================
// DEX Tauri — Permissions subsystem (port of PermissionManager.ts, main.ts
// `permissions:getAll` / `permissions:grant` / `permissions:revoke`).
//
// Pure-data, DataStore-KV tier. In Electron these channels are served by
// `PermissionManager` over `DataStore`, which is the `dex-data` electron-store.
// Permissions live under the single top-level key `permissions` as the
// `DexPermissions` boolean record. Following the `mode:*` precedent (which also
// lived in `dex-data` and was ported to the unified KV store), this reads/writes
// crate::kv_get(app, "permissions") / crate::kv_set(app, "permissions", ...).
//
// Return shapes match the Electron handlers exactly so the renderer is unchanged:
//   - permissions:getAll -> { permissions: DexPermissions, descriptions: {...} }
//       `descriptions` reproduces PERMISSION_DESCRIPTIONS verbatim
//       (name/description/risk per capability key).
//   - permissions:grant  -> setPermission(p, true) then returns void -> null.
//   - permissions:revoke -> setPermission(p, false) then returns void -> null.
//
// DEFAULTS divergence (documented): electron-store falls back to its `defaults`
// when the `permissions` key is absent. The KV store has no schema defaults, so
// this module supplies the SAME default record DataStore declared
// (openApps:true, adjustVolume:true, the rest false) on read and seeds any
// missing capability key before grant/revoke, preserving the Electron shape.
//
// NAME-COLLISION caveat (documented, see dispatch): a SEPARATE subsystem
// (PermissionsService.ts) also registers `permissions:*` channels — `list`,
// `decide`, `plan-batch`, `record`, `revoke-all`, and a *different*
// `permissions:revoke(capability, origin)`. Those are NOT part of this port and
// are not handled here, so a blanket `channel.starts_with("permissions:")` route
// is NOT safe (prefixRouteSafe = false). Route the three ported channels by
// exact name. This module handles only the DexPermissions CRUD.
// =============================================================================

use serde_json::{json, Value};

// The six DexPermissions keys, with the DataStore-declared defaults. Used to
// seed a fresh/partial record so the returned shape always carries all keys.
const DEFAULTS: [(&str, bool); 6] = [
    ("openApps", true),
    ("closeApps", false),
    ("runCommands", false),
    ("adjustVolume", true),
    ("fileSystem", false),
    ("network", false),
];

// PERMISSION_DESCRIPTIONS — verbatim from PermissionManager.ts.
fn descriptions() -> Value {
    json!({
        "openApps": {
            "name": "Open Applications",
            "description": "Allow Dex to open applications and URLs",
            "risk": "low"
        },
        "closeApps": {
            "name": "Close Applications",
            "description": "Allow Dex to close or kill running applications",
            "risk": "medium"
        },
        "runCommands": {
            "name": "Run Commands",
            "description": "Allow Dex to execute terminal commands and scripts",
            "risk": "high"
        },
        "adjustVolume": {
            "name": "Adjust Volume",
            "description": "Allow Dex to control system volume",
            "risk": "low"
        },
        "fileSystem": {
            "name": "File System Access",
            "description": "Allow Dex to open files and folders",
            "risk": "medium"
        },
        "network": {
            "name": "Network Monitoring",
            "description": "Allow Dex to monitor network connection status",
            "risk": "low"
        }
    })
}

// getPermissions(): the stored DexPermissions record, with every default key
// present (mirrors electron-store falling back to `defaults`).
fn get_permissions(app: &tauri::AppHandle) -> Value {
    let stored = crate::kv_get(app, "permissions");
    let mut out = serde_json::Map::new();
    let existing = stored.as_object();
    for (key, default) in DEFAULTS.iter() {
        let val = existing
            .and_then(|m| m.get(*key))
            .and_then(|v| v.as_bool())
            .unwrap_or(*default);
        out.insert((*key).to_string(), json!(val));
    }
    Value::Object(out)
}

// setPermission(key, value): mutate one capability and persist the whole record.
// Unknown keys are written through verbatim, matching the TS index assignment.
fn set_permission(app: &tauri::AppHandle, key: &str, value: bool) {
    if key.is_empty() {
        return;
    }
    let mut perms = match get_permissions(app) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    perms.insert(key.to_string(), json!(value));
    crate::kv_set(app, "permissions", Value::Object(perms));
}

/// Route a `permissions:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). NOTE: only the three DexPermissions CRUD
/// channels are handled; the PermissionsService capability/origin channels share
/// this namespace and are intentionally NOT handled here (see header).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "permissions:getAll" => json!({
            "permissions": get_permissions(app),
            "descriptions": descriptions(),
        }),
        "permissions:grant" => {
            let permission = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            set_permission(app, permission, true);
            Value::Null
        }
        "permissions:revoke" => {
            let permission = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            set_permission(app, permission, false);
            Value::Null
        }
        _ => Value::Null,
    }
}
