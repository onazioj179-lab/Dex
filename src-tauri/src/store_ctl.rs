// =============================================================================
// DEX Tauri — App Store data surface (port of the read-only `store:*` IPC
// handlers in src/main/services/AppStoreService.ts).
//
// Pure-data, JSON-file tier. Despite the porting brief naming the source as
// "src/main/store/Store.ts" with an "electron-store:app" backing, the actual
// `store:` namespace in this repo is the App Store / installer service, and it
// does NOT use electron-store: it persists raw JSON files via std `fs` under
// <userData>/store/. We mirror that EXACTLY under <appData>/store/:
//   - catalog.json   : CatalogEntry[]   (the storefront catalog)
//   - installed.json : InstalledApp[]   (locally installed apps)
// Return shapes match the Electron handlers exactly so the renderer is
// unchanged (getCatalog/getInstalled each return a shallow copy of the array).
//
// Channels ported (the brief's "list" + "get" map onto the two read-only data
// channels of this subsystem):
//   - store:list      -> CatalogEntry[]   (getCatalog)
//   - store:installed -> InstalledApp[]   (getInstalled)   [the "get" surface]
//
// DIVERGENCES (documented):
//   - Storage backend: brief said electron-store key "app"; the real subsystem
//     uses fs-json files (catalog.json / installed.json). We reproduce the real
//     files and relative path (store/<name>.json) under app_data_dir, not an
//     electron-store wrapper. There is no top-level key wrapper — both files are
//     bare JSON arrays, exactly as AppStoreService writes them.
//   - Bundled-catalog fallback: Electron's loadCatalog() falls back to a
//     ship-with-the-app default (assets/config/dex-store-catalog.json, resolved
//     via __dirname / process.resourcesPath) when catalog.json is missing or
//     empty. Resolving Tauri's bundled-resource dir is out of scope for this
//     data module (it would need resource-dir / capabilities wiring), so on a
//     missing/empty/non-array catalog we honestly return [] rather than fake a
//     catalog. The renderer already treats an empty catalog as a valid state.
//   - In-process caches (catalogCache / installedCache) are a single-process
//     Electron optimization with no observable effect on the returned value;
//     each dispatch reads the file fresh. The data the renderer receives is
//     identical.
//
// Heavy / native channels are NOT ported here (see channelsSkipped in the port
// metadata): install / uninstall / plan / app:capabilities / local:* all need a
// native runtime (network download, Ed25519 verify, unpack, file dialogs) or
// shared planner/explain modules. They are simply not routed by this module.
// =============================================================================

use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

const CATALOG_FILE: &str = "catalog.json";
const INSTALLED_FILE: &str = "installed.json";

// <appData>/store/<name> — mirrors STORE_DIR() = userData/store in Electron.
fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("store");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

// Read a bare JSON array file; any read/parse failure or non-array yields [].
fn read_array(app: &tauri::AppHandle, name: &str) -> Vec<Value> {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(Value::Array(a)) => a,
            _ => Vec::new(),
        },
        Err(_) => Vec::new(),
    }
}

// getCatalog() -> CatalogEntry[]. See the bundled-fallback divergence above: an
// absent/empty/non-array catalog returns [] (no bundled-resource resolution).
fn get_catalog(app: &tauri::AppHandle) -> Vec<Value> {
    read_array(app, CATALOG_FILE)
}

// getInstalled() -> InstalledApp[].
fn get_installed(app: &tauri::AppHandle) -> Vec<Value> {
    read_array(app, INSTALLED_FILE)
}

/// Route a `store:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the two read-only data channels are handled;
/// every other `store:*` channel (the heavy installer / local-dev / publisher /
/// review surfaces) returns Value::Null so the caller degrades honestly rather
/// than receiving a faked result.
///
/// NOTE: the `store:` prefix is shared by other subsystems (store:publisher:*,
/// store:publish:*, store:review:*), so this dispatch must NOT own the whole
/// prefix — route the exact channels below to it, not `channel.starts_with`.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "store:list" => Value::Array(get_catalog(app)),
        "store:installed" => Value::Array(get_installed(app)),
        _ => Value::Null,
    }
}
