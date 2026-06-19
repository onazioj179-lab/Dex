// =============================================================================
// DEX Tauri — State subsystem (port of the `state:*` IPC handlers in
// src/main/core/StateAccuracyLayer.ts — the State Accuracy Layer).
//
// READ-ONLY data tier. Only the read channels are ported here:
//   - state:get    -> the stored value, or null  (get)
//   - state:getAll -> Record<string, unknown>     (list)
// The write channels (set / transaction / sync / subscribe) are the "heavy"
// surface and are intentionally NOT ported (see channelsSkipped + DIVERGENCES).
//
// STORAGE DIVERGENCE (documented):
//   Electron's StateAccuracyLayer is a pure IN-MEMORY single-source-of-truth:
//   a Map<StateDomain, Map<key, StateEntry>>. There is NO electron-store file
//   and nothing is persisted to disk (despite the migration spec naming
//   `fs-json:app-state.json`, no such file exists in the Electron source). To
//   keep reads coherent with any future writer while staying within the
//   sanctioned native backbone, this port reads from the DataStore-KV file
//   (dex-kv.json) under a single key, `dex-state`, shaped exactly like the
//   in-memory layout flattened to plain JSON:
//       { "<domain>": { "<key>": <value>, ... }, ... }
//   Because the write channels are not ported, that key is normally absent, so
//   reads return null / {} — which is BYTE-IDENTICAL to what the Electron layer
//   returns on a fresh process before anything has been set. No fabricated data.
//
// RETURN-SHAPE fidelity (from StateAccuracyLayer.get / getAllInDomain):
//   - get<T>(domain, key): returns `entry?.value` => the stored value or
//     `undefined`. Over IPC, `undefined` serializes to null, so we return
//     Value::Null when absent. Unknown domain also yields undefined -> null.
//   - getAllInDomain(domain): returns a plain object { key: value, ... }, and
//     `{}` for an unknown domain. We mirror both exactly.
//
// Args arrive as a positional JSON array (see tauriCompat.ts):
//   state:get    -> [domain, key]
//   state:getAll -> [domain]
// =============================================================================

use serde_json::{json, Map, Value};

const STATE_KEY: &str = "dex-state";

// Valid domains, mirroring StateDomain / initializeDomains() in the Electron
// source. Electron rejects unknown domains in writes but, for the READ paths,
// get() and getAllInDomain() simply find no domain Map and return
// undefined / {} respectively. We reproduce that read behaviour: unknown
// domains are not special-cased — they just have no stored data.
const DOMAINS: [&str; 10] = [
    "ui", "search", "actions", "media", "editor", "files", "transfers",
    "system", "settings", "session",
];

fn is_known_domain(domain: &str) -> bool {
    DOMAINS.contains(&domain)
}

// The full `{ domain: { key: value } }` map from the KV store, or empty.
fn load_state(app: &tauri::AppHandle) -> Map<String, Value> {
    match crate::kv_get(app, STATE_KEY) {
        Value::Object(m) => m,
        _ => Map::new(),
    }
}

// state:get(domain, key) -> entry value or null.
fn get(app: &tauri::AppHandle, domain: &str, key: &str) -> Value {
    load_state(app)
        .get(domain)
        .and_then(|d| d.as_object())
        .and_then(|d| d.get(key))
        .cloned()
        .unwrap_or(Value::Null)
}

// state:getAll(domain) -> Record<string, unknown> ({} when domain has no data).
fn get_all(app: &tauri::AppHandle, domain: &str) -> Value {
    match load_state(app).get(domain).and_then(|d| d.as_object()) {
        Some(d) => Value::Object(d.clone()),
        None => json!({}),
    }
}

/// Route a `state:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read channels (get / getAll) are ported;
/// every other channel in the namespace — including the heavy write surface —
/// returns Value::Null (honest degrade), so prefix-routing the whole `state:`
/// namespace here is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "state:get" => {
            let domain = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let key = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            // Mirror Electron: unknown domain -> undefined -> null.
            if !is_known_domain(domain) {
                return Value::Null;
            }
            get(app, domain, key)
        }
        "state:getAll" => {
            let domain = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            // Mirror Electron: unknown domain -> {}.
            if !is_known_domain(domain) {
                return json!({});
            }
            get_all(app, domain)
        }
        // Heavy / not-ported: state:set, state:transaction, state:sync,
        // state:subscribe. No renderer reads a shaped object back from these in
        // a way the data tier can honor, so they degrade to null.
        _ => Value::Null,
    }
}
