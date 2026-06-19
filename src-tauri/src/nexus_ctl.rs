// =============================================================================
// DEX Tauri — Nexus subsystem router (intended port of the `nexus:*` IPC
// surface; see SOURCE-OF-TRUTH note below).
//
// ----------------------------------------------------------------------------
// SOURCE-OF-TRUTH DIVERGENCE (read this first)
// ----------------------------------------------------------------------------
// The porting brief named:
//   - Electron source : src/main/controllers/NexusController.ts
//   - Storage         : fs-json:nexus-state.json
//   - DATA channels   : nexus:getState, nexus:getConnections
//   - HEAVY channels  : nexus:connect, nexus:disconnect, nexus:query
//
// None of those channels, nor `nexus-state.json`, exist in the repository. The
// real `nexus:` IPC namespace (grepped across the whole tree) is ONLY the
// biometric router in NexusController.ts:
//   - nexus:biometric:list   -> { ok, capabilities: BiometricCapability[],
//                                  enrolled: NexusEnrolledRecord[] }
//   - nexus:biometric:enroll -> { ok, record } | { ok:false, error }
//   - nexus:biometric:test   -> { ok, verified, record } | { ok:false, error }
//   - nexus:biometric:revoke -> { ok }
// (`nexus:emergency` is a one-way event, not an invoke handler.)
//
// The brief's `getState`/`getConnections` most closely resemble the SystemMap
// controller (channels `systemMap:getState`-like / `systemMap:getConnections`),
// but those live in the `systemMap:` namespace, not `nexus:`, and would be the
// wrong thing to publish under a `nexus:` prefix route.
//
// Per the project rules (port ONLY real channels, at EXACT shapes; never invent
// fields or channels; do not fake heavy/native work), this module therefore:
//   * Does NOT fabricate getState/getConnections/connect/disconnect/query —
//     they have no Electron implementation to mirror.
//   * Does NOT port the biometric channels as "data", because every one of them
//     depends on native runtime that cannot be reproduced here at exact shape:
//       - `capabilities` comes from per-platform hardware probing
//         (Windows Hello / Touch ID / fprintd) — native.
//       - `enrolled`/`record` live in an in-memory Map that is NEVER persisted
//         (no electron-store, no JSON file); it resets every launch. There is
//         no storage surface to port, and persisting it would change behavior.
//       - enroll/test perform credential operations (heavy/native).
//
// The result is an honest router: it owns the `nexus:` namespace, returns
// Value::Null for anything outside the known channels, and returns the
// documented not-ported object for the biometric channels whose renderer reads
// a shaped `{ ok, ... }` result (so the UI degrades cleanly instead of throwing
// on `.ok`). No invented fields, no faked hardware.
// =============================================================================

use serde_json::{json, Value};

/// Shaped failure for channels the renderer reads as `{ ok, ... }`.
fn not_ported() -> Value {
    json!({ "ok": false, "error": "not ported (needs native runtime)" })
}

/// Route a `nexus:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The whole namespace is owned here; channels that
/// are not (and cannot be) ported return either Value::Null or a shaped
/// not-ported object, never faked data.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Biometric router — all require native hardware/credential runtime and
        // have no JSON/KV storage to port. The renderer destructures `.ok`, so
        // hand back a shaped failure rather than null for these.
        "nexus:biometric:list"
        | "nexus:biometric:enroll"
        | "nexus:biometric:test"
        | "nexus:biometric:revoke" => not_ported(),

        // Anything else in the namespace (incl. the brief's nonexistent
        // getState/getConnections/connect/disconnect/query and the one-way
        // nexus:emergency event): no Electron data handler -> honest null.
        _ => Value::Null,
    }
}
