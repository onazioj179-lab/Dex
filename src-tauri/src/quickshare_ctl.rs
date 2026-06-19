// =============================================================================
// DEX Tauri — QuickShare subsystem (intended port of the `quickshare:*` IPC
// handlers).
//
// HONEST-STATE HEADER (read before extending this module):
//
// The port brief named:
//   - source file: src/main/core/QuickShare.ts       -> DOES NOT EXIST
//   - DATA channel: quickshare:getLinks              -> DOES NOT EXIST
//   - HEAVY channels: quickshare:share, quickshare:revoke
//       * quickshare:share EXISTS but is network/file-transfer (heavy native
//         runtime: device discovery + actual byte transfer). MUST be skipped.
//       * quickshare:revoke DOES NOT EXIST.
//   - storage: datastore-kv:quickshare               -> NO SUCH KEY is written
//
// The only QuickShare implementation in this repo is the in-memory
// `QuickShareService` inside src/main/core/EcosystemIntegration.ts. Its actual
// channels are: quickshare:get-devices, quickshare:share(targetId, files[]),
// quickshare:accept, quickshare:reject, quickshare:history,
// quickshare:start-discovery, quickshare:stop-discovery. It persists NOTHING
// (all state lives in `Map`s rebuilt from live network discovery) and exposes
// neither `getLinks` nor `revoke`. No renderer calls any quickshare:* channel.
//
// Consequently there is NO pure-data CRUD surface to port: the requested data
// channel has no Electron return shape to mirror, and inventing one would
// violate the "never invent fields" rule. Every real quickshare:* channel
// depends on the live native runtime (BLE/Wi-Fi discovery, file transfer) and
// belongs to the HEAVY tier.
//
// This module therefore implements the data tier as a faithful no-op: it
// answers the (non-existent) data channel and the heavy channels with
// Value::Null (honest degrade), and is INTENTIONALLY not prefix-routed for the
// whole namespace — see prefixRouteSafe = false in the returned metadata. The
// live device/history/discovery channels must keep flowing to the native
// runtime, not be nulled out by this dispatcher.
//
// DIVERGENCES (documented):
//   - No DataStore-KV key is read or written: the named `quickshare` key is not
//     produced by any Electron code, so reading it would be fabricating storage
//     that never existed. If a real persisted share-link model is added later,
//     wire it through crate::kv_get/crate::kv_set with the SAME key string and
//     flip getLinks to return the stored array (default []).
//   - share/revoke are NOT implemented and NOT faked (heavy native runtime).
// =============================================================================

use serde_json::Value;

/// Route a `quickshare:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
///
/// IMPORTANT: this is NOT a safe whole-namespace prefix route. The live
/// quickshare channels (get-devices, history, accept, reject, start/stop
/// discovery) must reach the native runtime; do not route the entire
/// `quickshare:` prefix here. Only the data/heavy channels listed below are
/// owned by this module, and all degrade to Null because no pure-data surface
/// exists in the Electron source.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // DATA (requested) — no Electron return shape exists; honest null.
        "quickshare:getLinks" => Value::Null,

        // HEAVY — needs the native runtime (discovery + byte transfer). Not
        // implemented, not faked.
        "quickshare:share" => Value::Null,
        "quickshare:revoke" => Value::Null,

        _ => Value::Null,
    }
}
