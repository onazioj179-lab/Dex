// =============================================================================
// DEX Tauri — NextGen subsystem (intended port of the `nextgen:*` IPC handlers
// in src/main/core/NextGenIntegration.ts).
//
// HONEST PORT NOTE — NO DATA SURFACE TO PORT
// -----------------------------------------------------------------------------
// The task brief named an Electron source `NextGenFeatures.ts`, a DATA channel
// `getFeatures`, heavy channels `enable` / `test`, and storage
// `datastore-kv:nextgen`. NONE of these exist in this repo:
//   - There is no `NextGenFeatures.ts`. The real file is `NextGenIntegration.ts`.
//   - There is no `nextgen:getFeatures`, `nextgen:enable`, or `nextgen:test`
//     channel anywhere (verified across src/). The `getFeatures` matches in the
//     codebase are unrelated (renderer browser-compat + WASMEngine).
//   - The subsystem uses NO persistent storage at all — no electron-store, no
//     DataStore-KV `nextgen` key, no fs-json file. So there is nothing to mirror
//     under app_data_dir or via crate::kv_get / crate::kv_set.
//
// The ONLY `nextgen:*` channels that actually exist are runtime-status queries
// (NextGenIntegration.registerIPCHandlers):
//   - nextgen:getStatus   -> getInitializationStatus(): live aggregate of the
//                            12 in-memory OS-level managers' init state.
//   - nextgen:isHealthy   -> boolean over those live statuses.
//   - nextgen:getSystems  -> the live SystemStatus[] array.
//
// Every one of these reads in-memory state produced by initializing 12 native
// managers (IntentSessionManager, UsageAwareFileSystem, TrustworthySearch, ...).
// That native init lifecycle does not exist on the Tauri side, so these are
// HEAVY (runtime) channels, not a data/CRUD tier. They cannot be faithfully
// ported as pure data, and inventing a status payload would be faking a value
// the renderer treats as ground truth — explicitly disallowed.
//
// Therefore this module ports ZERO channels and returns Value::Null (honest
// degrade) for every `nextgen:*` channel. The renderer's compat layer treats a
// null result as "subsystem unavailable", which is the truthful state on Tauri
// until the native managers are themselves ported. Routing the whole namespace
// here is safe (prefixRouteSafe = true): no channel is left to a wrong handler.
//
// DIVERGENCES:
//   - Full subsystem stubbed (no data surface existed to port). See above.
//   - Named brief channels (getFeatures/enable/test) and storage key do not
//     exist; nothing was created for them.
// =============================================================================

use serde_json::Value;

/// Route a `nextgen:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The `nextgen` namespace has no pure-data surface —
/// every channel is a live runtime-status query against native managers that do
/// not exist on Tauri — so we honestly degrade to Value::Null for all of them
/// rather than fabricate status. `args` is accepted for signature parity with
/// the other module dispatchers.
pub fn dispatch(_app: &tauri::AppHandle, _channel: &str, _args: &Value) -> Value {
    // nextgen:getStatus / nextgen:isHealthy / nextgen:getSystems are all
    // runtime-only; no data tier to serve. Honest null for the entire namespace.
    Value::Null
}
