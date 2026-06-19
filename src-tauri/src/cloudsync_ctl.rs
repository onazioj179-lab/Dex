// =============================================================================
// DEX Tauri — CloudSync subsystem (port of the `cloudsync:*` IPC handlers in
// src/main/core/EcosystemIntegration.ts -> CloudSyncService).
//
// DATA/CRUD tier only. The Electron CloudSyncService kept its config in a plain
// in-memory field (NO electron-store, NO persistence) and tracked a live
// `syncStatus` Map<path,status> fed by fs.watch watchers. Only the pure-data,
// read-side surface is ported here:
//   - cloudsync:status (getStatus) -> { config: CloudSyncConfig, files: [...] }
//   - cloudsync:getConfig          -> CloudSyncConfig          (config-only view)
//
// STORAGE divergence (documented): Electron held config in memory and lost it on
// quit. Per the migration mandate (datastore-kv:cloudsync) we persist the config
// in the native KV store (dex-kv.json) under the key "cloudsync" via
// crate::kv_get / crate::kv_set — the same backbone modes/rules use. When the key
// is unset we synthesize the EXACT default config the Electron service shipped
// with (enabled:false, provider:"dex-cloud", syncDesktop:true, syncDocuments:true,
// syncDownloads:false, conflictResolution:"newest", bandwidthLimit:0).
//
// FILES divergence (documented): getStatus().files came from the live in-memory
// `syncStatus` Map populated by fs.watch debounced sync attempts. Tauri has no
// such watcher running in this pure-data tier, so `files` is always [] (an empty
// array, matching the shape `{ path, status }[]`). This is an honest empty, not a
// fake — no synthetic file rows are invented.
//
// CloudSyncConfig shape (exact, from the TS interface):
//   { enabled: bool, provider: "dex-cloud"|"custom", syncDesktop: bool,
//     syncDocuments: bool, syncDownloads: bool,
//     conflictResolution: "newest"|"ask"|"keep-both", bandwidthLimit: number }
//
// SKIPPED (heavy, need a native runtime — fs watchers / network sync):
//   - cloudsync:sync-all  (the "sync" channel): walks watched folders and pushes
//     each file through syncFile -> cloud API. No watchers/cloud here. Routed to
//     Value::Null (the Electron handler returned void/undefined anyway).
//   - resolveConflicts: no such channel exists in the Electron source; conflict
//     handling was a passive config field (conflictResolution), never an IPC
//     call. Nothing to route; the catch-all returns Value::Null.
//   - cloudsync:enable / cloudsync:disable: side-effecting (start/stop fs.watch
//     watchers). Electron returned void. Routed to Value::Null (honest no-op for
//     the data tier; no watchers to start, nothing the renderer reads as data).
// =============================================================================

use serde_json::{json, Value};

const CONFIG_KEY: &str = "cloudsync";

// Exact default CloudSyncConfig from CloudSyncService's in-memory initializer.
fn default_config() -> Value {
    json!({
        "enabled": false,
        "provider": "dex-cloud",
        "syncDesktop": true,
        "syncDocuments": true,
        "syncDownloads": false,
        "conflictResolution": "newest",
        "bandwidthLimit": 0,
    })
}

// Read the persisted config, falling back to the shipped defaults. We merge any
// stored fields over the defaults so a partially-written config still returns a
// fully-shaped object (mirrors Electron's `{ ...this.config, ...config }` merge).
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let (Some(base), Value::Object(stored)) = (cfg.as_object_mut(), crate::kv_get(app, CONFIG_KEY))
    {
        for (k, v) in stored {
            base.insert(k, v);
        }
    }
    cfg
}

// CloudSyncService.getStatus() -> { config, files }. `files` is the empty data
// tier projection of the live syncStatus map (see header).
fn get_status(app: &tauri::AppHandle) -> Value {
    json!({
        "config": get_config(app),
        "files": Value::Array(Vec::new()),
    })
}

/// Route a `cloudsync:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; the
/// heavy/side-effecting ones return Value::Null (honest degrade, matching the
/// void Electron handlers), so prefix-routing the whole namespace here is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // getStatus
        "cloudsync:status" | "cloudsync:getStatus" => get_status(app),
        // getConfig (config-only view; no dedicated Electron channel — see header)
        "cloudsync:getConfig" | "cloudsync:config" => get_config(app),
        // Heavy / side-effecting — not ported (need native fs watchers / cloud).
        // Electron returned void; honest Null here.
        "cloudsync:sync-all" | "cloudsync:enable" | "cloudsync:disable" => Value::Null,
        _ => Value::Null,
    }
}
