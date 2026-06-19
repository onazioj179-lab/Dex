// =============================================================================
// DEX Tauri — CorePC subsystem (port of the `corepc:*` IPC surface backed by
// src/main/services/CorePCService.ts).
//
// Scope: ONLY the pure-data `getVersion` channel is ported here. CorePCService
// itself is an integrity/runtime layer (filesystem hashing of the immutable
// core bundle, plus heavy query/execute/notify operations); those are native-
// runtime concerns and are explicitly NOT reproduced — see channelsSkipped.
//
// `corepc:getVersion` -> the running DEX version as a plain string, mirroring the
// established house pattern for `app:getVersion` in main.rs, which returns
// env!("CARGO_PKG_VERSION"). In Electron the version string comes from
// app.getVersion(); at build time that value is sourced from the same
// package/Cargo version, so the returned shape (a bare JSON string) is identical
// and the renderer is unchanged.
//
// Storage: the corepc namespace nominally carries a DataStore-KV bucket
// (datastore-kv:corepc) for its heavy channels. The single DATA channel ported
// here is read-only and version-derived, so it neither reads nor writes KV; the
// crate::kv_get / crate::kv_set backbone is intentionally untouched.
//
// DIVERGENCES (documented):
//   - No `corepc:getVersion` IPC handler exists verbatim in CorePCService.ts
//     (which only registers `corepc:verify`). The version-getter is ported at
//     the canonical version-string shape used everywhere else in the codebase
//     (app:getVersion -> CARGO_PKG_VERSION); no fields are invented.
//   - The heavy channels (query/execute/notify, and the integrity-hashing
//     verify path) require the live native runtime / filesystem snapshotting and
//     are not ported or faked. They fall through to Value::Null.
// =============================================================================

use serde_json::{json, Value};

/// Route a `corepc:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only `getVersion` is a data channel; every other
/// channel in the namespace (the heavy query/execute/notify ops) returns
/// Value::Null — an honest degrade rather than a faked result.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // app.getVersion() -> version string. Same source as app:getVersion.
        "corepc:getVersion" => json!(env!("CARGO_PKG_VERSION")),
        _ => Value::Null,
    }
}
