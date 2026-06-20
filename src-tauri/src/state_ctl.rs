// =============================================================================
// DEX Tauri — State subsystem (port of the `state:*` IPC handlers in
// src/main/core/StateAccuracyLayer.ts — the State Accuracy Layer).
//
// Ported channels:
//   - state:get         -> the stored value, or null            (get)
//   - state:getAll      -> Record<string, unknown>              (list)
//   - state:set         -> boolean                              (write)
//   - state:transaction -> { success, transactionId, error? }   (atomic write)
//   - state:sync        -> Record<domain, Record<key, value>>   (sync payload)
//   - state:subscribe   -> StateSnapshot | null                 (domain snapshot)
//
// STORAGE MODEL (documented):
//   Electron's StateAccuracyLayer is a pure IN-MEMORY single-source-of-truth:
//   a Map<StateDomain, Map<key, StateEntry>>. There is NO electron-store file
//   and nothing is persisted to disk. To make this a real, durable native
//   single-source-of-truth (and to keep reads coherent with the writer) this
//   port persists through the sanctioned DataStore-KV backbone (dex-kv.json):
//
//     key `dex-state`          -> { "<domain>": { "<key>": <value>, ... }, ... }
//                                 (the flattened value map; read layout is
//                                  BYTE-IDENTICAL to getAllInDomain output, so
//                                  get / getAll / sync stay shape-faithful).
//     key `dex-state-versions` -> { "<domain>:<key>": <version:number>, ... }
//                                 (the per-key version counter, mirroring
//                                  StateAccuracyLayer.versions; kept under a
//                                  SEPARATE key so it never leaks into a domain
//                                  read).
//
//   On a fresh store both keys are absent, so reads return null / {} — exactly
//   what the Electron layer returns before anything has been set.
//
// RENDERER EVENTS:
//   Electron broadcasts every committed change to all windows via
//   webContents.send('state:changed', change). We mirror that with
//   crate::native_ops::emit_event(app, "state:changed", &change), one emit per
//   committed change, carrying the exact StateChange shape (domain, key,
//   previousValue, newValue, version, timestamp, source[, transactionId]).
//
// RETURN-SHAPE fidelity:
//   - get<T>(domain, key): entry?.value or undefined -> Value::Null when
//     absent / unknown domain.
//   - getAllInDomain(domain): { key: value, ... }, {} for unknown domain.
//   - set: returns true on success (incl. the no-op equal-value short-circuit),
//     false for an unknown domain (mirrors the Map miss -> false path).
//   - transact: { success, transactionId } on commit; on an unknown domain mid
//     transaction it rolls back ALL changes and returns
//     { success:false, transactionId, error:"Unknown domain: <d>" }.
//   - getSyncPayload(domains?): { <domain>: { key: value } } for the requested
//     domains, or for ALL initialized domains when none are given.
//   - getSnapshot(domain): { domain, entries, version, timestamp } | null.
//     Electron's `entries` is a Map<key, StateEntry>; over IPC a Map serializes
//     to {} (no enumerable own props), so we emit `entries: {}` to match the
//     wire shape, while `version` is the true max entry version.
//
// Args arrive as a positional JSON array (see tauriCompat.ts):
//   state:get         -> [domain, key]
//   state:getAll      -> [domain]
//   state:set         -> [domain, key, value]
//   state:transaction -> [ [ {domain,key,value}, ... ] ]
//   state:sync        -> [domains?]   (optional array of domain strings)
//   state:subscribe   -> [pattern]    ("<domain>:..." — domain is taken)
//
// SOURCE: writes coming over IPC originate in the renderer, so source="renderer"
// (matches Electron's setupIPC, which passes 'renderer' for set/transact).
// =============================================================================

use serde_json::{json, Map, Value};
use std::time::{SystemTime, UNIX_EPOCH};

const STATE_KEY: &str = "dex-state";
const VERSIONS_KEY: &str = "dex-state-versions";

// Epoch millis, matching Electron's Date.now().
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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

// ---- version store (separate KV key; mirrors StateAccuracyLayer.versions) ----

fn load_versions(app: &tauri::AppHandle) -> Map<String, Value> {
    match crate::kv_get(app, VERSIONS_KEY) {
        Value::Object(m) => m,
        _ => Map::new(),
    }
}

fn version_of(versions: &Map<String, Value>, full_key: &str) -> i64 {
    versions.get(full_key).and_then(|v| v.as_i64()).unwrap_or(0)
}

// Deep structural equality, mirroring StateAccuracyLayer.isEqual. serde_json's
// PartialEq already does deep equality on Value, including object key sets, so a
// direct comparison is exactly the intended semantics.
fn json_eq(a: &Value, b: &Value) -> bool {
    a == b
}

// Build a StateChange object in the exact Electron wire shape.
fn make_change(
    domain: &str,
    key: &str,
    previous: Value,
    new_value: &Value,
    version: i64,
    timestamp: i64,
    transaction_id: Option<&str>,
) -> Value {
    let mut c = Map::new();
    c.insert("domain".into(), json!(domain));
    c.insert("key".into(), json!(key));
    c.insert("previousValue".into(), previous);
    c.insert("newValue".into(), new_value.clone());
    c.insert("version".into(), json!(version));
    c.insert("timestamp".into(), json!(timestamp));
    c.insert("source".into(), json!("renderer"));
    if let Some(tx) = transaction_id {
        c.insert("transactionId".into(), json!(tx));
    }
    Value::Object(c)
}

// Persist the value + version maps, then broadcast each change to the renderer
// (mirrors StateAccuracyLayer.broadcastChange via webContents.send).
fn commit(
    app: &tauri::AppHandle,
    state: Map<String, Value>,
    versions: Map<String, Value>,
    changes: &[Value],
) {
    crate::kv_set(app, STATE_KEY, Value::Object(state));
    crate::kv_set(app, VERSIONS_KEY, Value::Object(versions));
    for change in changes {
        crate::native_ops::emit_event(app, "state:changed", change);
    }
}

// state:set(domain, key, value) -> boolean. Unknown domain -> false (mirrors
// the `if (!domainState) return false` path). Equal value -> true no-op.
fn set(app: &tauri::AppHandle, domain: &str, key: &str, value: &Value) -> Value {
    if !is_known_domain(domain) {
        return json!(false);
    }

    let mut state = load_state(app);
    let mut versions = load_versions(app);

    let domain_obj = state
        .entry(domain.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !domain_obj.is_object() {
        *domain_obj = Value::Object(Map::new());
    }

    let previous = domain_obj
        .as_object()
        .and_then(|d| d.get(key))
        .cloned()
        .unwrap_or(Value::Null);

    // Skip if unchanged (deep equality), returning true like Electron.
    if previous != Value::Null && json_eq(&previous, value) {
        return json!(true);
    }

    let full_key = format!("{}:{}", domain, key);
    let new_version = version_of(&versions, &full_key) + 1;
    let ts = now_ms();

    domain_obj
        .as_object_mut()
        .unwrap()
        .insert(key.to_string(), value.clone());
    versions.insert(full_key, json!(new_version));

    let change = make_change(domain, key, previous, value, new_version, ts, None);
    commit(app, state, versions, &[change]);

    json!(true)
}

// state:transaction(changes) -> { success, transactionId, error? }. Atomic: any
// unknown domain aborts the whole set and nothing is persisted (rollback).
fn transact(app: &tauri::AppHandle, changes: &Value) -> Value {
    let counter = now_ms();
    let transaction_id = format!("tx-{}-{}", counter, crate::util::pseudo_uuid_v4());

    let list = match changes.as_array() {
        Some(l) => l,
        None => {
            // Nothing to apply; an empty/invalid change set still commits cleanly
            // in Electron (the for-loops simply iterate zero times).
            return json!({ "success": true, "transactionId": transaction_id });
        }
    };

    let mut state = load_state(app);
    let mut versions = load_versions(app);
    let mut emitted: Vec<Value> = Vec::new();
    let ts = now_ms();

    // Validate + stage all changes against working copies; abort on any unknown
    // domain WITHOUT writing (the working copies are simply dropped) -> rollback.
    for change in list {
        let domain = change.get("domain").and_then(|v| v.as_str()).unwrap_or("");
        let key = change.get("key").and_then(|v| v.as_str()).unwrap_or("");
        let value = change.get("value").cloned().unwrap_or(Value::Null);

        if !is_known_domain(domain) {
            return json!({
                "success": false,
                "transactionId": transaction_id,
                "error": format!("Unknown domain: {}", domain),
            });
        }

        let domain_obj = state
            .entry(domain.to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !domain_obj.is_object() {
            *domain_obj = Value::Object(Map::new());
        }

        let previous = domain_obj
            .as_object()
            .and_then(|d| d.get(key))
            .cloned()
            .unwrap_or(Value::Null);

        let full_key = format!("{}:{}", domain, key);
        let new_version = version_of(&versions, &full_key) + 1;

        domain_obj
            .as_object_mut()
            .unwrap()
            .insert(key.to_string(), value.clone());
        versions.insert(full_key, json!(new_version));

        emitted.push(make_change(
            domain,
            key,
            previous,
            &value,
            new_version,
            ts,
            Some(&transaction_id),
        ));
    }

    commit(app, state, versions, &emitted);
    json!({ "success": true, "transactionId": transaction_id })
}

// state:sync(domains?) -> { <domain>: { key: value, ... }, ... }. With no
// domains, mirrors Electron's default of ALL initialized domains.
fn sync(app: &tauri::AppHandle, domains: Option<&Value>) -> Value {
    let state = load_state(app);
    let mut payload = Map::new();

    let target: Vec<String> = match domains.and_then(|v| v.as_array()) {
        Some(arr) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        None => DOMAINS.iter().map(|d| d.to_string()).collect(),
    };

    for domain in target {
        let entries = state
            .get(&domain)
            .and_then(|d| d.as_object())
            .cloned()
            .unwrap_or_default();
        payload.insert(domain, Value::Object(entries));
    }

    Value::Object(payload)
}

// state:subscribe(pattern) -> getSnapshot(pattern.split(':')[0]) | null.
// Subscription itself is event-driven (renderer listens to state:changed); the
// IPC call returns the current domain snapshot, matching Electron exactly.
fn subscribe_snapshot(app: &tauri::AppHandle, pattern: &str) -> Value {
    let domain = pattern.split(':').next().unwrap_or("");
    // Unknown domain -> getSnapshot returns null.
    if !is_known_domain(domain) {
        return Value::Null;
    }

    let state = load_state(app);
    let versions = load_versions(app);

    // Max version across this domain's keys (mirrors getSnapshot's maxVersion).
    let mut max_version: i64 = 0;
    if let Some(entries) = state.get(domain).and_then(|d| d.as_object()) {
        for key in entries.keys() {
            let v = version_of(&versions, &format!("{}:{}", domain, key));
            if v > max_version {
                max_version = v;
            }
        }
    }

    json!({
        "domain": domain,
        // Electron's `entries` is a Map; serialized over IPC it has no enumerable
        // own properties, so the wire shape is {}.
        "entries": {},
        "version": max_version,
        "timestamp": now_ms(),
    })
}

/// Route a `state:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The full read + write surface is ported:
/// get / getAll / set / transaction / sync / subscribe. Any other channel in the
/// namespace degrades to Value::Null (honest), so prefix-routing the whole
/// `state:` namespace here is safe.
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
        "state:set" => {
            let domain = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let key = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let value = args.get(2).cloned().unwrap_or(Value::Null);
            set(app, domain, key, &value)
        }
        "state:transaction" => transact(app, args.get(0).unwrap_or(&Value::Null)),
        "state:sync" => sync(app, args.get(0)),
        "state:subscribe" => {
            let pattern = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            subscribe_snapshot(app, pattern)
        }
        _ => Value::Null,
    }
}
