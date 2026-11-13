// =============================================================================
// DEX Tauri — Extensions subsystem (port of the read/data IPC handlers in
// src/main/core/ExtensionFramework.ts).
//
// Pure-data, JSON-backed tier (same pattern as analytics.rs). Electron used a
// single `electron-store` named `dex-extensions` under userData; this mirrors
// that file verbatim under <appData>:
//   - dex-extensions.json : {
//       extensions:          { [id]: InstalledExtension },
//       grantedPermissions:  { [id]: ExtensionPermission[] },
//       enabled:             bool   // master switch, default true
//     }
// Return shapes match the Electron handlers exactly so the renderer is
// unchanged. Only the READ surface is ported here; the framework is described in
// the source as "a foundation for future extensibility, not actively shipped",
// so its mutating/runtime handlers stay native-only (see SKIPPED below).
//
// Channels & shapes:
//   - list  (extensions:getAll)    -> ExtensionStatus[]
//   - get   (extensions:getStatus) -> ExtensionStatus | null
//   - getStatus (extensions:getStatus) -> ExtensionStatus | null  (alias)
// Plus the pure-read master switch that lives in the same namespace:
//   - extensions:isEnabled         -> bool   (so prefix routing is total)
//
// ExtensionStatus is:
//   { id, name, version, enabled, verified, permissions: string[],
//     permissionsGranted: bool }
// where the first six fields come from InstalledExtension.manifest / flags and
// permissionsGranted is `(grantedPermissions[id] ?? []).length > 0`.
//
// DIVERGENCES (documented):
//   - Object.values(extensions) iteration order: Electron relied on JS object
//     insertion order. serde_json preserves object key order only with the
//     `preserve_order` feature; absent that, getAll's array order may differ
//     from Electron's. The set of entries and every field value is identical —
//     only ordering can vary. getStatus is keyed by id and unaffected.
//
// HEAVY / MUTATING CHANNELS (now ported, round 2):
//   The framework's state lives entirely in the `dex-extensions.json` store
//   (extensions map, grantedPermissions map, the `enabled` master switch) plus
//   a per-extension `sandboxPath` directory under <userData>/extensions. Every
//   mutating handler is a pure JSON-store edit (and, for uninstall, an fs
//   directory removal). None of them needs the live `loadedExtensions` Map —
//   that map is an in-process runtime cache with no persisted effect and no
//   renderer-visible return value, so dropping it changes no observable shape.
//   We therefore port them natively, 1:1 with the Electron methods:
//     - extensions:enable / disable          -> flip extensions[id].enabled
//     - extensions:enableSystem / disableSystem -> flip the `enabled` switch
//     - extensions:grantPermissions / revokePermissions -> edit grantedPermissions
//     - extensions:uninstall                  -> disable + revoke + delete entry
//                                                + rmdir sandboxPath
//   Each returns the SAME bool the Electron handler returned.
//
//   NOT ported (no such IPC channel exists in Electron, and no native path):
//     - extensions:install  -> Electron registered NO install handler in
//       ExtensionFramework; real install would unpack a signed bundle into a
//       sandbox + verify a manifest signature (native runtime). Honest degrade.
//     - extensions:execute  -> Electron registered NO execute handler; running
//       an extension entryPoint requires a sandboxed JS runtime. Honest degrade.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

const STORE_FILE: &str = "dex-extensions.json";

// Permissions that are NEVER allowed for extensions. Mirrors FORBIDDEN_PERMISSIONS
// in ExtensionFramework.ts (wildcard prefixes end with `*`).
const FORBIDDEN_PERMISSIONS: &[&str] = &[
    "encryption:*",
    "system:*",
    "permissions:*",
    "core:*",
];

// --- file IO (mirrors analytics.rs) -----------------------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Pretty-write the whole store back (electron-store writes 2-space-indented JSON).
fn write_file(app: &tauri::AppHandle, name: &str, value: &Value) -> bool {
    match serde_json::to_string_pretty(value) {
        Ok(raw) => crate::write_atomic(store_path(app, name), raw).is_ok(),
        Err(_) => false,
    }
}

// Load the whole store as an object, applying the electron-store defaults for any
// missing key so that a fresh/empty file behaves exactly like the TS schema.
fn load_store(app: &tauri::AppHandle) -> Map<String, Value> {
    let mut root = read_file(app, STORE_FILE)
        .as_object()
        .cloned()
        .unwrap_or_default();
    root.entry("extensions".to_string())
        .or_insert_with(|| json!({}));
    root.entry("grantedPermissions".to_string())
        .or_insert_with(|| json!({}));
    root.entry("enabled".to_string())
        .or_insert_with(|| json!(true));
    root
}

// --- store accessors --------------------------------------------------------

fn extensions_map(app: &tauri::AppHandle) -> Map<String, Value> {
    read_file(app, STORE_FILE)
        .get("extensions")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

fn granted_map(app: &tauri::AppHandle) -> Map<String, Value> {
    read_file(app, STORE_FILE)
        .get("grantedPermissions")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

// `enabled` defaults to true (store default), matching the electron-store schema.
fn is_enabled(app: &tauri::AppHandle) -> bool {
    read_file(app, STORE_FILE)
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

// `(grantedPermissions[id] ?? []).length > 0`.
fn permissions_granted(granted: &Map<String, Value>, id: &str) -> bool {
    granted
        .get(id)
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false)
}

// Build an ExtensionStatus from an InstalledExtension entry + granted map.
// Mirrors the object literal returned by getAllExtensions/getExtensionStatus.
fn to_status(ext: &Value, granted: &Map<String, Value>) -> Value {
    let manifest = ext.get("manifest").cloned().unwrap_or(Value::Null);
    let mstr = |k: &str| manifest.get(k).cloned().unwrap_or(Value::Null);
    // Electron reads ext.manifest.id for the granted lookup (not the map key).
    let id = manifest.get("id").and_then(|v| v.as_str()).unwrap_or("");
    json!({
        "id": mstr("id"),
        "name": mstr("name"),
        "version": mstr("version"),
        "enabled": ext.get("enabled").cloned().unwrap_or(Value::Null),
        "verified": ext.get("verified").cloned().unwrap_or(Value::Null),
        "permissions": manifest.get("permissions").cloned().unwrap_or_else(|| json!([])),
        "permissionsGranted": permissions_granted(granted, id),
    })
}

// getAllExtensions(): Object.values(extensions).map(toStatus).
fn get_all(app: &tauri::AppHandle) -> Value {
    let extensions = extensions_map(app);
    let granted = granted_map(app);
    let list: Vec<Value> = extensions
        .values()
        .map(|ext| to_status(ext, &granted))
        .collect();
    Value::Array(list)
}

// getExtensionStatus(id): extensions[id] -> ExtensionStatus | null.
fn get_status(app: &tauri::AppHandle, id: &str) -> Value {
    let extensions = extensions_map(app);
    match extensions.get(id) {
        Some(ext) => to_status(ext, &granted_map(app)),
        None => Value::Null,
    }
}

// --- mutating handlers (round-2 port) ---------------------------------------

// isPermissionAllowed(permission): false for any FORBIDDEN_PERMISSIONS entry
// (wildcard `prefix*` matches by startsWith; exact otherwise). 1:1 with TS.
fn is_permission_allowed(permission: &str) -> bool {
    for forbidden in FORBIDDEN_PERMISSIONS {
        if let Some(prefix) = forbidden.strip_suffix('*') {
            if permission.starts_with(prefix) {
                return false;
            }
        } else if permission == *forbidden {
            return false;
        }
    }
    true
}

// enableExtensionSystem(): set enabled=true -> true.
fn enable_system(app: &tauri::AppHandle) -> bool {
    let mut root = load_store(app);
    root.insert("enabled".to_string(), json!(true));
    write_file(app, STORE_FILE, &Value::Object(root))
}

// disableSystem handler: set enabled=false, unload all (no persisted effect) -> true.
fn disable_system(app: &tauri::AppHandle) -> bool {
    let mut root = load_store(app);
    root.insert("enabled".to_string(), json!(false));
    write_file(app, STORE_FILE, &Value::Object(root))
}

// enableExtension(id): system must be enabled AND extension must exist ->
// extensions[id].enabled = true. Returns false on either guard.
fn enable_extension(app: &tauri::AppHandle, id: &str) -> bool {
    let mut root = load_store(app);
    if !root.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true) {
        return false;
    }
    let exts = match root.get_mut("extensions").and_then(|v| v.as_object_mut()) {
        Some(m) => m,
        None => return false,
    };
    match exts.get_mut(id).and_then(|v| v.as_object_mut()) {
        Some(ext) => {
            ext.insert("enabled".to_string(), json!(true));
        }
        None => return false,
    }
    write_file(app, STORE_FILE, &Value::Object(root))
}

// disableExtension(id): extension must exist -> extensions[id].enabled = false.
// (The TS also drops it from loadedExtensions; that Map is not persisted.)
fn disable_extension(app: &tauri::AppHandle, id: &str) -> bool {
    let mut root = load_store(app);
    let exts = match root.get_mut("extensions").and_then(|v| v.as_object_mut()) {
        Some(m) => m,
        None => return false,
    };
    match exts.get_mut(id).and_then(|v| v.as_object_mut()) {
        Some(ext) => {
            ext.insert("enabled".to_string(), json!(false));
        }
        None => return false,
    }
    write_file(app, STORE_FILE, &Value::Object(root))
}

// grantPermissions(id, perms): extension must exist. Keep only allowed perms
// that the extension actually requested in its manifest -> grantedPermissions[id].
fn grant_permissions(app: &tauri::AppHandle, id: &str, perms: &Value) -> bool {
    let mut root = load_store(app);

    // requestedPermissions = extensions[id].manifest.permissions (guard exists).
    let requested: Vec<String> = match root
        .get("extensions")
        .and_then(|v| v.as_object())
        .and_then(|m| m.get(id))
    {
        Some(ext) => ext
            .get("manifest")
            .and_then(|m| m.get("permissions"))
            .and_then(|p| p.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        None => return false, // !extensions[id] -> false
    };

    let incoming = perms.as_array().cloned().unwrap_or_default();
    // allowedPermissions = perms.filter(isPermissionAllowed)
    // finalPermissions   = allowedPermissions.filter(p => requested.includes(p))
    let final_perms: Vec<Value> = incoming
        .into_iter()
        .filter(|p| p.as_str().map(is_permission_allowed).unwrap_or(false))
        .filter(|p| {
            p.as_str()
                .map(|s| requested.iter().any(|r| r == s))
                .unwrap_or(false)
        })
        .collect();

    let granted = root
        .entry("grantedPermissions".to_string())
        .or_insert_with(|| json!({}));
    if let Some(g) = granted.as_object_mut() {
        g.insert(id.to_string(), Value::Array(final_perms));
    }
    write_file(app, STORE_FILE, &Value::Object(root))
}

// revokePermissions(id): delete grantedPermissions[id] -> true (always).
fn revoke_permissions(app: &tauri::AppHandle, id: &str) -> bool {
    let mut root = load_store(app);
    if let Some(g) = root
        .get_mut("grantedPermissions")
        .and_then(|v| v.as_object_mut())
    {
        g.remove(id);
    }
    write_file(app, STORE_FILE, &Value::Object(root))
}

// uninstallExtension(id): disable + revoke + delete entry + rm sandboxPath.
// Returns true on success, false on any error (mirrors the try/catch -> false).
fn uninstall_extension(app: &tauri::AppHandle, id: &str) -> bool {
    let mut root = load_store(app);

    // Capture sandboxPath before deletion (best-effort fs cleanup afterwards).
    let sandbox_path = root
        .get("extensions")
        .and_then(|v| v.as_object())
        .and_then(|m| m.get(id))
        .and_then(|ext| ext.get("sandboxPath"))
        .and_then(|p| p.as_str())
        .map(String::from);

    // disableExtension(id): set enabled=false if present (no-op guard otherwise).
    if let Some(ext) = root
        .get_mut("extensions")
        .and_then(|v| v.as_object_mut())
        .and_then(|m| m.get_mut(id))
        .and_then(|e| e.as_object_mut())
    {
        ext.insert("enabled".to_string(), json!(false));
    }

    // revokePermissions(id): delete grantedPermissions[id].
    if let Some(g) = root
        .get_mut("grantedPermissions")
        .and_then(|v| v.as_object_mut())
    {
        g.remove(id);
    }

    // delete extensions[id].
    if let Some(exts) = root.get_mut("extensions").and_then(|v| v.as_object_mut()) {
        exts.remove(id);
    }

    if !write_file(app, STORE_FILE, &Value::Object(root)) {
        return false;
    }

    // Remove sandbox directory if it exists (recursive, force).
    if let Some(p) = sandbox_path {
        let path = PathBuf::from(&p);
        if path.exists() {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
    true
}

/// Route an `extensions:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The read channels return their shaped
/// value; the mutating channels return the SAME bool the Electron handler did;
/// the two channels with no native path (install/execute) honestly degrade.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg0 = || args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        // --- reads ---
        "extensions:getAll" => get_all(app),
        "extensions:getStatus" => get_status(app, &arg0()),
        "extensions:isEnabled" => json!(is_enabled(app)),

        // --- system master switch ---
        "extensions:enableSystem" => json!(enable_system(app)),
        "extensions:disableSystem" => json!(disable_system(app)),

        // --- per-extension enable/disable ---
        "extensions:enable" => json!(enable_extension(app, &arg0())),
        "extensions:disable" => json!(disable_extension(app, &arg0())),

        // --- permissions ---
        "extensions:grantPermissions" => {
            let perms = args.get(1).cloned().unwrap_or_else(|| json!([]));
            json!(grant_permissions(app, &arg0(), &perms))
        }
        "extensions:revokePermissions" => json!(revoke_permissions(app, &arg0())),

        // --- lifecycle ---
        "extensions:uninstall" => json!(uninstall_extension(app, &arg0())),

        // --- no native path (honest degrade); no such Electron channel ---
        "extensions:install" | "extensions:execute" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}
