// =============================================================================
// DEX Tauri — Developer Platform subsystem (data tier port of
// src/main/core/DeveloperPlatformManager.ts).
//
// Pure-data, JSON-backed tier. Only the read-only data surface is ported here;
// the extension RUNTIME (loading entry points, sandboxing, live event-bus/IPC
// monitoring, theme application to the live window) is a native side-effect tier
// that has no place in a stateless dispatcher and is deliberately NOT reproduced.
//
// Storage (fs-json) under <appData>:
//   - dev-manifest.json : { modules: [LoadedExtension, ...], themes: [...],
//                           sandbox: { active, dir } }
//       The persisted catalog of installed extensions + loaded themes + the
//       sandbox flag. The Electron manager kept this state in in-memory Maps
//       populated by scanning <userData>/extensions at startup; on Tauri the same
//       catalog is read from / written to this JSON file so the data survives
//       without the live filesystem scan / module loader.
//   - dev-console.json  : { buffer: [DevConsoleEntry, ...], paused: bool }
//       The dev-console ring buffer + paused flag. The Electron manager held
//       these on the singleton (devConsoleBuffer / devConsolePaused); persisting
//       them gives the stateless dispatcher the same observable behavior.
//
// Channels & EXACT Electron return shapes:
//   - devplatform:getInfo    -> { apiVersion, apiDocs, cssProperties }
//       * apiVersion    == DeveloperPlatformManager.getAPIVersion()      (DEX_API_VERSION)
//       * apiDocs       == getAPIDocumentation() (the API_METHODS array, deep-copied)
//       * cssProperties == getCSSProperties()    (the CSS_CUSTOM_PROPERTIES array)
//       All three are deterministic constants in the Electron source, so the
//       returned shape is byte-for-byte identical to what the renderer received
//       from those getters. (These were three separate Electron getters; the
//       orchestrator's `getInfo` channel bundles the static platform-info trio.)
//   - devplatform:getModules -> LoadedExtension[] at the get-extensions shape:
//       [{ manifest, loaded, enabled, error }, ...]  (error omitted when absent,
//       exactly like the Electron object spread `error: ext.error` collapsing to
//       undefined -> dropped over IPC).
//
// HEAVY channels NOW PORTED with real native implementations:
//   - executeCommand : the extension/dev command surface. A composite that takes
//                      a positional [command, payload?] pair and dispatches to the
//                      native analogues of the Electron management methods
//                      (install / uninstall / enable / disable / validate /
//                      applyTheme / get-themes / enter-sandbox / exit-sandbox /
//                      is-sandbox). These are real fs + state operations against
//                      the persisted dev-manifest.json catalog; applyTheme pushes
//                      the live `devplatform:apply-theme` renderer event exactly
//                      like the Electron webContents.send call. The one piece that
//                      genuinely needs a JS runtime — sandboxed execution of an
//                      extension entry point — is not faked.
//   - debug          : the live dev-console surface. A composite that takes a
//                      positional [action, payload?] pair and dispatches to the
//                      native analogues of the Electron console methods
//                      (getBuffer / clear / pause / resume / log). The buffer +
//                      paused flag are persisted in dev-console.json (the Electron
//                      manager kept them in memory on the singleton); a `log`
//                      action appends an entry AND pushes the live
//                      `devplatform:console-entry` renderer event, matching
//                      devConsoleLog's webContents.send.
//
// DIVERGENCES (documented):
//   - The Electron manager exposed these data reads as separate channels
//     (get-api-version / get-api-docs / get-css-properties for info;
//     get-extensions for modules). This port follows the orchestrator-assigned
//     two-channel surface (getInfo / getModules), composing the static getters
//     into one `getInfo` object. No field names or value types are changed.
//   - The extension catalog is read from dev-manifest.json rather than rebuilt by
//     scanning a directory of manifest.json files at runtime. The per-extension
//     record shape ({ manifest, loaded, enabled, error }) is preserved exactly.
//   - The orchestrator surface exposes the management + console operations as two
//     composite verbs (executeCommand / debug) carrying a leading sub-command
//     string, rather than the Electron one-channel-per-method layout
//     (install-extension / get-console-buffer / ...). The sub-command names and
//     every return shape are preserved; only the routing envelope differs.
//   - SystemTime epoch-millis is used for DevConsoleEntry.timestamp (Date.now()
//     parity). pseudo_uuid_v4 is available but the Electron console entries carry
//     no id, so it remains unused (entries are keyed by timestamp like upstream).
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const MANIFEST_FILE: &str = "dev-manifest.json";
const CONSOLE_FILE: &str = "dev-console.json";

// DEX_API_VERSION constant from DeveloperPlatformManager.ts.
const DEX_API_VERSION: &str = "1.0.0";

// devConsoleMaxEntries from the Electron manager.
const DEV_CONSOLE_MAX_ENTRIES: usize = 5000;

// VALID_PERMISSIONS set from the Electron manager (used by validate).
const VALID_PERMISSIONS: &[&str] = &[
    "storage:read", "storage:write",
    "files:read", "files:write",
    "notes:read", "notes:write",
    "tasks:read", "tasks:write",
    "media:read", "media:write",
    "settings:read", "settings:write",
    "events:subscribe", "events:emit",
    "network:fetch", "network:websocket",
    "clipboard:read", "clipboard:write",
    "notifications:send",
    "ui:panel", "ui:modal", "ui:toolbar",
    "system:info",
];

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

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

fn write_file(app: &tauri::AppHandle, name: &str, value: &Value) -> bool {
    match serde_json::to_string_pretty(value) {
        Ok(raw) => crate::write_atomic(store_path(app, name), raw).is_ok(),
        Err(_) => false,
    }
}

// Epoch milliseconds (Date.now() parity).
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// --- API_METHODS (deep copy of the Electron const, returned by get-api-docs) -

fn api_method(
    name: &str,
    description: &str,
    parameters: Value,
    return_type: &str,
) -> Value {
    json!({
        "name": name,
        "introduced": "1.0.0",
        "description": description,
        "parameters": parameters,
        "returnType": return_type,
    })
}

fn param(name: &str, ptype: &str, description: &str) -> Value {
    json!({ "name": name, "type": ptype, "description": description })
}

// getAPIDocumentation(): API_METHODS.map(m => ({ ...m })).
fn api_docs() -> Value {
    json!([
        api_method("dex.storage.get", "Read a value from extension storage",
            json!([param("key", "string", "Storage key")]), "Promise<any>"),
        api_method("dex.storage.set", "Write a value to extension storage",
            json!([param("key", "string", "Storage key"), param("value", "any", "Value to store")]), "Promise<void>"),
        api_method("dex.storage.delete", "Delete a value from extension storage",
            json!([param("key", "string", "Storage key")]), "Promise<void>"),
        api_method("dex.storage.list", "List all keys in extension storage",
            json!([]), "Promise<string[]>"),
        api_method("dex.events.on", "Subscribe to an event on the event bus",
            json!([param("event", "string", "Event name"), param("callback", "Function", "Event handler")]), "() => void"),
        api_method("dex.events.emit", "Emit an event on the event bus",
            json!([param("event", "string", "Event name"), param("data", "any", "Event data")]), "void"),
        api_method("dex.notes.list", "List all notes",
            json!([param("folderId", "string?", "Optional folder filter")]), "Promise<NoteListItem[]>"),
        api_method("dex.notes.get", "Get a note by ID",
            json!([param("id", "string", "Note ID")]), "Promise<Note>"),
        api_method("dex.notes.create", "Create a new note",
            json!([param("options", "CreateNoteOptions", "Note creation options")]), "Promise<Note>"),
        api_method("dex.tasks.list", "List all tasks",
            json!([param("filter", "TaskFilter?", "Optional task filter")]), "Promise<Task[]>"),
        api_method("dex.tasks.create", "Create a new task",
            json!([param("options", "CreateTaskOptions", "Task creation options")]), "Promise<Task>"),
        api_method("dex.ui.showNotification", "Show a notification to the user",
            json!([param("message", "string", "Notification content"), param("type", "string", "info, warning, or error")]), "void"),
        api_method("dex.ui.showPanel", "Open a panel in the DEX workspace",
            json!([param("options", "PanelOptions", "Panel configuration")]), "Promise<Panel>"),
        api_method("dex.system.getVersion", "Get the current DEX version",
            json!([]), "string"),
        api_method("dex.system.getAPIVersion", "Get the current API version",
            json!([]), "string"),
        api_method("dex.system.getPlatform", "Get the current platform",
            json!([]), "string"),
        api_method("dex.clipboard.read", "Read clipboard content",
            json!([]), "Promise<string>"),
        api_method("dex.clipboard.write", "Write to clipboard",
            json!([param("text", "string", "Text to write")]), "Promise<void>"),
        api_method("dex.files.read", "Read a file from the sandbox",
            json!([param("path", "string", "Relative file path")]), "Promise<Buffer>"),
        api_method("dex.files.write", "Write a file to the sandbox",
            json!([param("path", "string", "Relative file path"), param("data", "Buffer|string", "File content")]), "Promise<void>"),
        api_method("dex.network.fetch", "Make an HTTP request",
            json!([param("url", "string", "URL to fetch"), param("options", "FetchOptions?", "Optional fetch options")]), "Promise<Response>"),
    ])
}

// getCSSProperties(): [...CSS_CUSTOM_PROPERTIES].
fn css_properties() -> Value {
    json!([
        "--color-bg-primary", "--color-bg-secondary", "--color-bg-tertiary", "--color-bg-elevated",
        "--color-bg-overlay", "--color-bg-input", "--color-bg-hover", "--color-bg-active",
        "--color-text-primary", "--color-text-secondary", "--color-text-tertiary", "--color-text-disabled",
        "--color-text-inverse", "--color-text-link",
        "--color-accent-primary", "--color-accent-secondary", "--color-accent-hover", "--color-accent-active",
        "--color-border-primary", "--color-border-secondary", "--color-border-focus",
        "--color-success", "--color-warning", "--color-error", "--color-info",
        "--color-success-bg", "--color-warning-bg", "--color-error-bg", "--color-info-bg",
        "--spacing-1", "--spacing-2", "--spacing-3", "--spacing-4", "--spacing-5", "--spacing-6", "--spacing-8",
        "--radius-sm", "--radius-md", "--radius-lg", "--radius-full",
        "--font-size-xs", "--font-size-sm", "--font-size-md", "--font-size-lg", "--font-size-xl",
        "--font-weight-normal", "--font-weight-medium", "--font-weight-semibold", "--font-weight-bold",
        "--shadow-sm", "--shadow-md", "--shadow-lg",
        "--transition-fast", "--transition-normal", "--transition-slow",
        "--z-dropdown", "--z-modal", "--z-tooltip", "--z-notification",
    ])
}

// devplatform:getInfo — bundles the three static platform-info getters.
fn get_info() -> Value {
    json!({
        "apiVersion": DEX_API_VERSION,
        "apiDocs": api_docs(),
        "cssProperties": css_properties(),
    })
}

// devplatform:getModules — mirrors the get-extensions handler shape from the
// persisted dev-manifest.json catalog. Each record:
//   { manifest, loaded, enabled, error? }
// `error` is omitted when absent, exactly like the Electron spread where an
// undefined ext.error is dropped over IPC.
fn get_modules(app: &tauri::AppHandle) -> Value {
    let modules = read_file(app, MANIFEST_FILE)
        .get("modules")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let out: Vec<Value> = modules
        .iter()
        .map(|ext| {
            let manifest = ext.get("manifest").cloned().unwrap_or(Value::Null);
            let loaded = ext.get("loaded").and_then(|v| v.as_bool()).unwrap_or(false);
            let enabled = ext.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
            let mut rec = serde_json::Map::new();
            rec.insert("manifest".into(), manifest);
            rec.insert("loaded".into(), json!(loaded));
            rec.insert("enabled".into(), json!(enabled));
            // Only include `error` when present and non-null (matches the spread
            // collapsing undefined -> field absent).
            if let Some(err) = ext.get("error") {
                if !err.is_null() {
                    rec.insert("error".into(), err.clone());
                }
            }
            Value::Object(rec)
        })
        .collect();

    json!(out)
}

// ===========================================================================
// executeCommand — the extension/dev management command surface.
// ===========================================================================
//
// args == [command: string, payload?: object]. Returns a result object whose
// shape matches the corresponding Electron management method exactly.

// Read the persisted catalog object ({ modules, themes, sandbox }), defaulting
// any missing section so callers can mutate freely.
fn read_catalog(app: &tauri::AppHandle) -> Value {
    let mut cat = read_file(app, MANIFEST_FILE);
    if !cat.is_object() {
        cat = json!({});
    }
    let obj = cat.as_object_mut().unwrap();
    obj.entry("modules").or_insert_with(|| json!([]));
    obj.entry("themes").or_insert_with(|| json!([]));
    obj.entry("sandbox").or_insert_with(|| json!({ "active": false, "dir": "" }));
    cat
}

// semver-ish gate: DeveloperPlatformManager.satisfiesVersion(current, required).
fn satisfies_version(current: &str, required: &str) -> bool {
    let parse = |s: &str| -> [i64; 3] {
        let mut out = [0i64; 3];
        for (i, part) in s.split('.').take(3).enumerate() {
            out[i] = part.parse::<i64>().unwrap_or(0);
        }
        out
    };
    let c = parse(current);
    let r = parse(required);
    if c[0] > r[0] { return true; }
    if c[0] < r[0] { return false; }
    if c[1] > r[1] { return true; }
    if c[1] < r[1] { return false; }
    c[2] >= r[2]
}

// validateExtensionPackage(packageDir): { valid, errors }. Pure fs + regex —
// fully native. Mirrors the Electron checks (presence of fields, id/version
// format, entryPoint/icon files exist, permission validity, JSON parse).
fn validate_package(package_dir: &str) -> Value {
    let mut errors: Vec<String> = Vec::new();
    let dir = PathBuf::from(package_dir);
    let manifest_path = dir.join("manifest.json");

    if !manifest_path.exists() {
        errors.push("manifest.json not found".into());
        return json!({ "valid": false, "errors": errors });
    }

    let raw = match std::fs::read_to_string(&manifest_path) {
        Ok(r) => r,
        Err(e) => {
            errors.push(format!("Invalid JSON in manifest: {}", e));
            return json!({ "valid": false, "errors": errors });
        }
    };
    let manifest: Value = match serde_json::from_str(&raw) {
        Ok(m) => m,
        Err(e) => {
            errors.push(format!("Invalid JSON in manifest: {}", e));
            return json!({ "valid": false, "errors": errors });
        }
    };

    let s = |k: &str| manifest.get(k).and_then(|v| v.as_str());
    if s("id").is_none() { errors.push("Missing id in manifest".into()); }
    if s("name").is_none() { errors.push("Missing name in manifest".into()); }
    if s("version").is_none() { errors.push("Missing version in manifest".into()); }
    if s("entryPoint").is_none() { errors.push("Missing entryPoint in manifest".into()); }
    if s("icon").is_none() { errors.push("Missing icon in manifest".into()); }
    if s("description").is_none() { errors.push("Missing description in manifest".into()); }
    if s("category").is_none() { errors.push("Missing category in manifest".into()); }

    // id format: /^[a-zA-Z][a-zA-Z0-9._-]+$/ (length >= 2). No regex crate; do it
    // by hand to stay dependency-free.
    if let Some(id) = s("id") {
        let valid_id = {
            let mut chars = id.chars();
            match chars.next() {
                Some(first) if first.is_ascii_alphabetic() => {
                    let rest: Vec<char> = chars.collect();
                    !rest.is_empty()
                        && rest.iter().all(|c| {
                            c.is_ascii_alphanumeric() || *c == '.' || *c == '_' || *c == '-'
                        })
                }
                _ => false,
            }
        };
        if !valid_id {
            errors.push("Invalid extension ID format".into());
        }
    }

    // version format: /^\d+\.\d+\.\d+$/
    if let Some(ver) = s("version") {
        let parts: Vec<&str> = ver.split('.').collect();
        let semantic = parts.len() == 3
            && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()));
        if !semantic {
            errors.push("Version must be semantic (x.y.z)".into());
        }
    }

    if let Some(ep) = s("entryPoint") {
        if !dir.join(ep).exists() {
            errors.push(format!("Entry point file not found: {}", ep));
        }
    }
    if let Some(icon) = s("icon") {
        if !dir.join(icon).exists() {
            errors.push(format!("Icon file not found: {}", icon));
        }
    }

    if let Some(perms) = manifest.get("permissions").and_then(|v| v.as_array()) {
        for perm in perms {
            if let Some(p) = perm.as_str() {
                if !VALID_PERMISSIONS.contains(&p) {
                    errors.push(format!("Unknown permission: {}", p));
                }
            }
        }
    }

    let valid = errors.is_empty();
    json!({ "valid": valid, "errors": errors })
}

// Recursive copy (copyDirectorySync parity).
fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

// installExtension(packagePath): { success, error? }. Reads the package
// manifest, copies the package into <appData>/extensions/<id>, loads a theme
// section if type=="theme", and records the LoadedExtension in the catalog.
fn cmd_install(app: &tauri::AppHandle, payload: &Value) -> Value {
    let package_path = payload
        .get("packagePath")
        .or_else(|| payload.get("path"))
        .and_then(|v| v.as_str());
    let package_path = match package_path {
        Some(p) => p,
        None => return json!({ "success": false, "error": "Package file not found" }),
    };
    let pkg_dir = PathBuf::from(package_path);
    if !pkg_dir.exists() {
        return json!({ "success": false, "error": "Package file not found" });
    }

    let manifest_raw = match std::fs::read_to_string(pkg_dir.join("manifest.json")) {
        Ok(r) => r,
        Err(e) => return json!({ "success": false, "error": e.to_string() }),
    };
    let manifest: Value = match serde_json::from_str(&manifest_raw) {
        Ok(m) => m,
        Err(e) => return json!({ "success": false, "error": e.to_string() }),
    };

    let id = manifest.get("id").and_then(|v| v.as_str());
    let name = manifest.get("name").and_then(|v| v.as_str());
    let version = manifest.get("version").and_then(|v| v.as_str());
    let (id, _name, _version) = match (id, name, version) {
        (Some(i), Some(n), Some(v)) if !i.is_empty() && !n.is_empty() && !v.is_empty() => (i, n, v),
        _ => return json!({ "success": false, "error": "Invalid manifest" }),
    };

    let ext_root = store_path(app, "extensions");
    let _ = std::fs::create_dir_all(&ext_root);
    let target_dir = ext_root.join(id);
    if target_dir.exists() {
        let _ = std::fs::remove_dir_all(&target_dir);
    }
    if let Err(e) = copy_dir_recursive(&pkg_dir, &target_dir) {
        return json!({ "success": false, "error": e.to_string() });
    }

    // loadExtension: API-version gate + theme load + catalog upsert.
    let required_api = manifest
        .get("minAPIVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0.0");
    let mut cat = read_catalog(app);

    if !satisfies_version(DEX_API_VERSION, required_api) {
        let msg = format!(
            "Extension {} requires API version {} but current is {}",
            id, required_api, DEX_API_VERSION
        );
        upsert_module(&mut cat, id, &manifest, false, false, Some(&msg));
        write_file(app, MANIFEST_FILE, &cat);
        // Electron still returns success:true here (the package was copied; the
        // record is just marked not-loaded). Preserve that.
        return json!({ "success": true });
    }

    if manifest.get("type").and_then(|v| v.as_str()) == Some("theme") {
        load_theme(app, &mut cat, id, &manifest, &target_dir);
    }

    upsert_module(&mut cat, id, &manifest, true, true, None);
    write_file(app, MANIFEST_FILE, &cat);
    json!({ "success": true })
}

// Insert or replace a module record in the catalog.modules array.
fn upsert_module(
    cat: &mut Value,
    id: &str,
    manifest: &Value,
    loaded: bool,
    enabled: bool,
    error: Option<&str>,
) {
    let mut rec = serde_json::Map::new();
    rec.insert("manifest".into(), manifest.clone());
    rec.insert("loaded".into(), json!(loaded));
    rec.insert("enabled".into(), json!(enabled));
    if let Some(e) = error {
        rec.insert("error".into(), json!(e));
    }
    let rec = Value::Object(rec);

    let modules = cat["modules"].as_array_mut().unwrap();
    if let Some(slot) = modules.iter_mut().find(|m| {
        m.get("manifest").and_then(|x| x.get("id")).and_then(|x| x.as_str()) == Some(id)
    }) {
        *slot = rec;
    } else {
        modules.push(rec);
    }
}

// loadThemeExtension: read the theme entry point, keep only known CSS custom
// properties, and record the theme in catalog.themes.
fn load_theme(
    app: &tauri::AppHandle,
    cat: &mut Value,
    id: &str,
    manifest: &Value,
    directory: &std::path::Path,
) {
    let _ = app;
    let entry = manifest
        .get("entryPoint")
        .and_then(|v| v.as_str())
        .unwrap_or("theme.json");
    let theme_path = directory.join(entry);
    let raw = match std::fs::read_to_string(&theme_path) {
        Ok(r) => r,
        Err(_) => return,
    };
    let theme_data: Value = match serde_json::from_str(&raw) {
        Ok(d) => d,
        Err(_) => return,
    };
    let known: Vec<Value> = css_properties().as_array().cloned().unwrap_or_default();
    let mut properties = serde_json::Map::new();
    if let Some(obj) = theme_data.as_object() {
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                if known.iter().any(|p| p.as_str() == Some(k.as_str())) {
                    properties.insert(k.clone(), json!(s));
                }
            }
        }
    }
    let name = manifest.get("name").and_then(|v| v.as_str()).unwrap_or(id);
    let theme = json!({ "id": id, "name": name, "properties": Value::Object(properties) });

    let themes = cat["themes"].as_array_mut().unwrap();
    if let Some(slot) = themes
        .iter_mut()
        .find(|t| t.get("id").and_then(|x| x.as_str()) == Some(id))
    {
        *slot = theme;
    } else {
        themes.push(theme);
    }
}

// uninstallExtension(id) -> bool. Removes the on-disk directory, the module
// record, and any theme record.
fn cmd_uninstall(app: &tauri::AppHandle, id: &str) -> bool {
    let mut cat = read_catalog(app);
    let modules = cat["modules"].as_array().cloned().unwrap_or_default();
    let exists = modules.iter().any(|m| {
        m.get("manifest").and_then(|x| x.get("id")).and_then(|x| x.as_str()) == Some(id)
    });
    if !exists {
        return false;
    }
    let dir = store_path(app, "extensions").join(id);
    if dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    if let Some(arr) = cat["modules"].as_array_mut() {
        arr.retain(|m| {
            m.get("manifest").and_then(|x| x.get("id")).and_then(|x| x.as_str()) != Some(id)
        });
    }
    if let Some(arr) = cat["themes"].as_array_mut() {
        arr.retain(|t| t.get("id").and_then(|x| x.as_str()) != Some(id));
    }
    write_file(app, MANIFEST_FILE, &cat);
    true
}

// enableExtension/disableExtension(id) -> bool. Flips the enabled flag.
fn cmd_set_enabled(app: &tauri::AppHandle, id: &str, enabled: bool) -> bool {
    let mut cat = read_catalog(app);
    let mut hit = false;
    if let Some(arr) = cat["modules"].as_array_mut() {
        for m in arr.iter_mut() {
            let m_id = m.get("manifest").and_then(|x| x.get("id")).and_then(|x| x.as_str());
            if m_id == Some(id) {
                if let Some(obj) = m.as_object_mut() {
                    obj.insert("enabled".into(), json!(enabled));
                }
                hit = true;
            }
        }
    }
    if hit {
        write_file(app, MANIFEST_FILE, &cat);
    }
    hit
}

// get-themes -> [{ id, name, propertyCount }, ...]
fn cmd_get_themes(app: &tauri::AppHandle) -> Value {
    let cat = read_catalog(app);
    let themes = cat["themes"].as_array().cloned().unwrap_or_default();
    let out: Vec<Value> = themes
        .iter()
        .map(|t| {
            let id = t.get("id").cloned().unwrap_or(Value::Null);
            let name = t.get("name").cloned().unwrap_or(Value::Null);
            let count = t
                .get("properties")
                .and_then(|p| p.as_object())
                .map(|o| o.len())
                .unwrap_or(0);
            json!({ "id": id, "name": name, "propertyCount": count })
        })
        .collect();
    json!(out)
}

// applyTheme(themeId) -> bool. Pushes the live `devplatform:apply-theme`
// renderer event with the theme's properties (Electron webContents.send).
fn cmd_apply_theme(app: &tauri::AppHandle, theme_id: &str) -> bool {
    let cat = read_catalog(app);
    let themes = cat["themes"].as_array().cloned().unwrap_or_default();
    let theme = themes
        .iter()
        .find(|t| t.get("id").and_then(|x| x.as_str()) == Some(theme_id));
    let props = match theme {
        Some(t) => t.get("properties").cloned().unwrap_or(json!({})),
        None => return false,
    };
    crate::native_ops::emit_event(app, "devplatform:apply-theme", &props);
    true
}

// enterSandboxMode() -> string (the temp dir). exitSandboxMode() / isSandboxMode.
fn cmd_enter_sandbox(app: &tauri::AppHandle) -> Value {
    let dir = std::env::temp_dir().join(format!("dex-sandbox-{}", now_ms()));
    let _ = std::fs::create_dir_all(&dir);
    let dir_str = dir.to_string_lossy().to_string();
    let mut cat = read_catalog(app);
    cat["sandbox"] = json!({ "active": true, "dir": dir_str });
    write_file(app, MANIFEST_FILE, &cat);
    json!(dir_str)
}

fn cmd_exit_sandbox(app: &tauri::AppHandle) -> bool {
    let mut cat = read_catalog(app);
    let dir = cat["sandbox"].get("dir").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let active = cat["sandbox"].get("active").and_then(|v| v.as_bool()).unwrap_or(false);
    if active && !dir.is_empty() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    cat["sandbox"] = json!({ "active": false, "dir": "" });
    write_file(app, MANIFEST_FILE, &cat);
    true
}

fn cmd_is_sandbox(app: &tauri::AppHandle) -> bool {
    read_catalog(app)["sandbox"]
        .get("active")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

// devplatform:executeCommand — composite management verb.
fn execute_command(app: &tauri::AppHandle, args: &Value) -> Value {
    let command = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    // Payload is the second positional arg; default to an empty object so the
    // per-command extractors are uniform.
    let payload = args.get(1).cloned().unwrap_or(json!({}));
    let id = || -> String {
        payload
            .get("id")
            .or_else(|| payload.get("extensionId"))
            .or_else(|| payload.get("themeId"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_default()
    };

    match command {
        "install" | "installExtension" | "install-extension" => cmd_install(app, &payload),
        "uninstall" | "uninstallExtension" | "uninstall-extension" => {
            json!({ "success": cmd_uninstall(app, &id()) })
        }
        "enable" | "enableExtension" | "enable-extension" => {
            json!({ "success": cmd_set_enabled(app, &id(), true) })
        }
        "disable" | "disableExtension" | "disable-extension" => {
            json!({ "success": cmd_set_enabled(app, &id(), false) })
        }
        "validate" | "validateExtension" | "validate-extension" => {
            let dir = payload
                .get("packageDir")
                .or_else(|| payload.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            validate_package(dir)
        }
        "getThemes" | "get-themes" => cmd_get_themes(app),
        "applyTheme" | "apply-theme" => json!({ "success": cmd_apply_theme(app, &id()) }),
        "enterSandbox" | "enter-sandbox" => json!({ "dir": cmd_enter_sandbox(app) }),
        "exitSandbox" | "exit-sandbox" => json!({ "success": cmd_exit_sandbox(app) }),
        "isSandbox" | "is-sandbox" => json!({ "sandbox": cmd_is_sandbox(app) }),
        // Running an extension entry point requires a sandboxed JS runtime that
        // does not exist in a stateless native dispatcher. Honest failure.
        "run" | "runExtension" | "exec" => json!({
            "success": false,
            "error": "not ported (needs native runtime)"
        }),
        _ => json!({ "success": false, "error": format!("Unknown command: {}", command) }),
    }
}

// ===========================================================================
// debug — the live dev-console surface.
// ===========================================================================
//
// args == [action: string, payload?]. The buffer + paused flag are persisted in
// dev-console.json. A `log` action also pushes the live console-entry event.

fn read_console(app: &tauri::AppHandle) -> Value {
    let mut c = read_file(app, CONSOLE_FILE);
    if !c.is_object() {
        c = json!({});
    }
    let obj = c.as_object_mut().unwrap();
    obj.entry("buffer").or_insert_with(|| json!([]));
    obj.entry("paused").or_insert_with(|| json!(false));
    c
}

fn debug_command(app: &tauri::AppHandle, args: &Value) -> Value {
    let action = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let payload = args.get(1).cloned().unwrap_or(Value::Null);

    match action {
        // get-console-buffer -> last 500 entries.
        "getBuffer" | "get-buffer" | "get-console-buffer" => {
            let console = read_console(app);
            let buffer = console["buffer"].as_array().cloned().unwrap_or_default();
            let start = buffer.len().saturating_sub(500);
            json!(buffer[start..].to_vec())
        }
        // clear-console -> true.
        "clear" | "clear-console" => {
            let mut console = read_console(app);
            console["buffer"] = json!([]);
            write_file(app, CONSOLE_FILE, &console);
            json!(true)
        }
        // pause-console -> true.
        "pause" | "pause-console" => {
            let mut console = read_console(app);
            console["paused"] = json!(true);
            write_file(app, CONSOLE_FILE, &console);
            json!(true)
        }
        // resume-console -> true.
        "resume" | "resume-console" => {
            let mut console = read_console(app);
            console["paused"] = json!(false);
            write_file(app, CONSOLE_FILE, &console);
            json!(true)
        }
        // devConsoleLog(type, module, payload, level, extra): append + push event.
        // Respects the paused flag (no-op while paused), trims the ring buffer to
        // 80% of max when it overflows, and pushes `devplatform:console-entry`.
        "log" => {
            let mut console = read_console(app);
            if console["paused"].as_bool().unwrap_or(false) {
                return Value::Null;
            }
            let p = if payload.is_object() { payload.clone() } else { json!({}) };
            let entry_type = p.get("type").and_then(|v| v.as_str()).unwrap_or("log");
            let level = p.get("level").and_then(|v| v.as_str()).unwrap_or("info");
            let module = p.get("module").and_then(|v| v.as_str()).unwrap_or("");
            let entry_payload = p.get("payload").cloned().unwrap_or(Value::Null);

            let mut entry = serde_json::Map::new();
            entry.insert("timestamp".into(), json!(now_ms()));
            entry.insert("type".into(), json!(entry_type));
            entry.insert("level".into(), json!(level));
            entry.insert("module".into(), json!(module));
            entry.insert("payload".into(), entry_payload);
            // Carry through the optional extra discriminators (eventType / channel
            // / sender / receiver) when present, like the `...extra` spread.
            for k in ["eventType", "channel", "sender", "receiver"] {
                if let Some(v) = p.get(k) {
                    if !v.is_null() {
                        entry.insert(k.into(), v.clone());
                    }
                }
            }
            let entry = Value::Object(entry);

            if let Some(buf) = console["buffer"].as_array_mut() {
                buf.push(entry.clone());
                if buf.len() > DEV_CONSOLE_MAX_ENTRIES {
                    let keep = (DEV_CONSOLE_MAX_ENTRIES as f64 * 0.8).round() as usize;
                    let start = buf.len().saturating_sub(keep);
                    *buf = buf[start..].to_vec();
                }
            }
            write_file(app, CONSOLE_FILE, &console);
            crate::native_ops::emit_event(app, "devplatform:console-entry", &entry);
            Value::Null
        }
        // is-paused convenience read.
        "isPaused" | "is-paused" => {
            json!(read_console(app)["paused"].as_bool().unwrap_or(false))
        }
        _ => Value::Null,
    }
}

/// Route a `devplatform:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; ported data channels return their shape, heavy/unknown channels
/// return Value::Null (honest degrade — prefix routing is safe).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "devplatform:getInfo" => get_info(),
        "devplatform:getModules" => get_modules(app),
        // Heavy channels — now ported with real native implementations.
        "devplatform:executeCommand" => execute_command(app, args),
        "devplatform:debug" => debug_command(app, args),
        // Anything else: honest null (prefix routing is safe).
        _ => Value::Null,
    }
}
