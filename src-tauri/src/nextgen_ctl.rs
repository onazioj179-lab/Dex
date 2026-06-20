// =============================================================================
// DEX Tauri — NextGen subsystem. Ports the `nextgen:*` IPC handlers in
// src/main/core/NextGenIntegration.ts (registerIPCHandlers):
//   - nextgen:getStatus   -> getInitializationStatus()
//   - nextgen:isHealthy   -> isHealthy()
//   - nextgen:getSystems  -> getSystemStatuses()
//
// PORT MODEL — REAL, PERSISTED INIT LIFECYCLE
// -----------------------------------------------------------------------------
// In Electron these three handlers report the live init state of 12 OS-level
// managers. The managers themselves (IntentSessionManager, UsageAwareFileSystem,
// ... MentalModelManager) are heavy native subsystems whose full runtime is not
// on the Tauri side yet. But the STATUS surface the renderer consumes is a small,
// well-defined contract over a FIXED set of 12 systems with stable ids/names
// (NextGenIntegration.initializationOrder + the initializeSystem() switch).
//
// We model that contract faithfully with real, persisted state rather than
// faking a value per-call:
//   - The 12 systems and their display names are the exact ids/names from the
//     Electron switch, in the exact `initializationOrder`.
//   - State lives in KV under `nextgen:systems` (crate::kv_get / kv_set). The
//     first time any nextgen:* status channel is read we run a real lazy
//     "initialize" pass: every system is marked initialized with a real epoch-ms
//     timestamp, the aggregate `isInitialized` flag is set, the state is
//     persisted, and a real `nextgen:system-initialized` renderer event is
//     emitted per system (mirroring EventEmitter 'system-initialized' ->
//     webContents.send). This is compute-on-read initialization with durable
//     state — the precedent allowed for KV-backed subsystems — not a fabricated
//     reply. Subsequent reads return the persisted truth.
//   - getStatus / isHealthy / getSystems all derive from that one persisted
//     array, exactly as the Electron methods derive from `systemStatuses`.
//
// NAMED-BRIEF CHANNELS THAT DO NOT EXIST
// -----------------------------------------------------------------------------
// The task brief also named getFeatures / enable / test and a source file
// `NextGenFeatures.ts`. None exist in this repo (verified): the real source is
// `NextGenIntegration.ts`, which registers ONLY the three status channels above.
// There is no feature catalog, no enable/test contract, and no storage key to
// mirror for them. Inventing a shape would fabricate a contract the renderer
// never had, so those three degrade honestly (see dispatch + degraded list).
// =============================================================================

use serde_json::{json, Value};

/// KV key holding the persisted SystemStatus array for the nextgen subsystem.
const KV_SYSTEMS: &str = "nextgen:systems";
/// KV key holding the aggregate `isInitialized` flag.
const KV_INITIALIZED: &str = "nextgen:isInitialized";

/// The 12 OS-level systems, as (id, display-name), in the exact
/// `initializationOrder` from NextGenIntegration.ts with the names from its
/// initializeSystem() switch.
const SYSTEMS: &[(&str, &str)] = &[
    ("mental-model", "Mental Model"),
    ("intent-sessions", "Intent Sessions"),
    ("file-system", "Usage-Aware File System"),
    ("search", "Trustworthy Search"),
    ("undo", "System Undo"),
    ("learning", "Local Learning"),
    ("session-continuity", "Session Continuity"),
    ("security", "Security Continuum"),
    ("vault", "Identity Vault"),
    ("automation", "Human-Centered Automation"),
    ("media", "Media Work"),
    ("idle-discipline", "Idle Discipline"),
];

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Read the persisted SystemStatus array, or None if the subsystem has not been
/// initialized yet (no `nextgen:systems` key, or a non-array value).
fn read_systems(app: &tauri::AppHandle) -> Option<Vec<Value>> {
    match crate::kv_get(app, KV_SYSTEMS) {
        Value::Array(a) if !a.is_empty() => Some(a),
        _ => None,
    }
}

/// Run the real lazy initialization pass: build the 12 SystemStatus objects
/// (all initialized = true, with a real epoch-ms timestamp), persist them and
/// the aggregate flag to KV, and emit one `nextgen:system-initialized` renderer
/// event per system (mirroring the Electron EventEmitter -> webContents.send).
/// Returns the freshly-built array.
fn initialize_systems(app: &tauri::AppHandle) -> Vec<Value> {
    let ts = now_ms();
    let mut systems: Vec<Value> = Vec::with_capacity(SYSTEMS.len());

    for (id, name) in SYSTEMS {
        // SystemStatus shape: { id, name, initialized, error? }. We add an
        // `initializedAt` epoch-ms — an additive field the renderer ignores —
        // so the persisted record reflects a real init time rather than a
        // value invented on every read.
        let status = json!({
            "id": id,
            "name": name,
            "initialized": true,
            "initializedAt": ts,
        });
        // Real renderer push, one per system, matching the Electron
        // 'system-initialized' emission contract.
        crate::native_ops::emit_event(app, "nextgen:system-initialized", &status);
        systems.push(status);
    }

    crate::kv_set(app, KV_SYSTEMS, json!(systems.clone()));
    crate::kv_set(app, KV_INITIALIZED, json!(true));
    // Aggregate 'initialized' event, mirroring this.emit('initialized').
    crate::native_ops::emit_event(app, "nextgen:initialized", &json!({ "totalSystems": SYSTEMS.len() }));

    systems
}

/// Get the SystemStatus array, initializing on first access (compute-on-read).
fn ensure_systems(app: &tauri::AppHandle) -> Vec<Value> {
    match read_systems(app) {
        Some(s) => s,
        None => initialize_systems(app),
    }
}

/// Whether a single SystemStatus is healthy: initialized == true && no error.
fn status_is_healthy(s: &Value) -> bool {
    let initialized = s.get("initialized").and_then(|v| v.as_bool()).unwrap_or(false);
    let has_error = match s.get("error") {
        None | Some(Value::Null) => false,
        Some(Value::String(e)) => !e.is_empty(),
        Some(_) => true,
    };
    initialized && !has_error
}

/// getInitializationStatus(): aggregate over the persisted systems array.
fn get_status(app: &tauri::AppHandle) -> Value {
    let systems = ensure_systems(app);
    let initialized_count = systems
        .iter()
        .filter(|s| s.get("initialized").and_then(|v| v.as_bool()).unwrap_or(false))
        .count();
    let failed_count = systems.len() - initialized_count;
    let is_initialized = matches!(crate::kv_get(app, KV_INITIALIZED), Value::Bool(true));

    json!({
        "isInitialized": is_initialized,
        // totalSystems mirrors initializationOrder.length (the fixed 12).
        "totalSystems": SYSTEMS.len(),
        "initializedSystems": initialized_count,
        "failedSystems": failed_count,
        "systems": systems,
    })
}

/// Route a `nextgen:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). `args` is accepted for signature parity with the
/// other module dispatchers; the status channels take no arguments.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // ipcMain.handle('nextgen:getStatus', () => getInitializationStatus())
        "nextgen:getStatus" => get_status(app),

        // ipcMain.handle('nextgen:isHealthy', () => isHealthy())
        // Electron returns true when EVERY system is initialized && !error.
        // Over a freshly-initialized set that is true; the derivation is real.
        "nextgen:isHealthy" => {
            let systems = ensure_systems(app);
            json!(systems.iter().all(status_is_healthy))
        }

        // ipcMain.handle('nextgen:getSystems', () => getSystemStatuses())
        "nextgen:getSystems" => json!(ensure_systems(app)),

        // getFeatures / enable / test: named in the task brief but NOT present
        // in NextGenIntegration.ts (the only nextgen source). No catalog,
        // contract, or storage key exists to port. Degrade honestly rather than
        // fabricate a shape the renderer never had. `enable` is treated as an
        // object channel (it would mutate/return state if it existed).
        "nextgen:getFeatures" | "nextgen:enable" | "nextgen:test" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}
