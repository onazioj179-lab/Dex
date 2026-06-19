// =============================================================================
// DEX Tauri — Softero subsystem (data/CRUD surface port of the `softero:*` IPC
// handlers in src/main/security/Softero.ts, the internal antivirus engine).
//
// Pure-data, fs-JSON tier. Electron stored Softero state as plain JSON files
// (NOT electron-store) under <userData>/softero/:
//   - softero/config.json        : SofteroConfig object
//   - softero/quarantine-db.json : QuarantineEntry[]  (a bare JSON array)
// This port reads the SAME relative paths under <appData> (Tauri's app_data_dir,
// the equivalent of Electron's userData) and returns the EXACT handler shapes so
// the renderer is unchanged.
//
// Channels ported (the read-only "list" data surface):
//   - softero:get-config       -> SofteroConfig  ({ ...DEFAULT_CONFIG, ...stored })
//   - softero:get-quarantine   -> QuarantineEntry[]  (the stored array, [] if none)
//   - softero:get-scan-history -> ScanResult[]
//
// HEAVY / runtime channels are deliberately NOT ported and NOT faked (they need
// the live native scanner, fs.watch, crypto quarantine, and the signature
// engine): scan-file, scan-directory, quick-scan, cancel-scan, get-status,
// quarantine-file, restore-quarantine, delete-quarantine, update-config,
// toggle-realtime. They route to Value::Null here (honest degrade). See the
// channelsSkipped metadata for the per-channel reason; the heavy "recover"
// (restore/delete quarantine) and "report" (scanning) groups map onto these.
//
// DIVERGENCES (documented):
//   - softero:get-scan-history reads the in-process `scanHistory` array in
//     Electron, which is NEVER persisted to disk (it lives only in the running
//     Softero instance and is wiped each launch). There is no file to read on
//     Tauri, so a freshly-started process honestly returns [] — exactly what
//     Electron returns before any scan runs this session. The `limit` arg is
//     still parsed (default 100) and applied to the (empty) tail for shape
//     fidelity. No scan results are fabricated.
//   - DEFAULT_CONFIG is mirrored verbatim so get-config returns the same merged
//     object Electron would after `{ ...DEFAULT_CONFIG, ...parsed }`. Electron
//     also lazily writes config.json on first load when absent; that write is a
//     side-effect with no bearing on the returned value, so it is not reproduced
//     by this read-only handler.
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "config.json";
const QUARANTINE_DB_FILE: &str = "quarantine-db.json";

// --- file IO (fs-json under <appData>/softero/) -----------------------------

fn softero_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("softero");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(softero_dir(app).join(name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// --- DEFAULT_CONFIG (verbatim from Softero.ts) ------------------------------

fn default_config() -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("realTimeProtection".into(), json!(true));
    m.insert("scanOnStartup".into(), json!(false));
    m.insert("maxFileSizeMB".into(), json!(100));
    m.insert("excludedPaths".into(), json!([]));
    m.insert("excludedExtensions".into(), json!([".log", ".tmp"]));
    m.insert("scanDepth".into(), json!(10));
    m.insert("quarantineMaxSizeMB".into(), json!(500));
    m.insert("heuristicSensitivity".into(), json!("medium"));
    m
}

// softero:get-config -> { ...DEFAULT_CONFIG, ...stored }
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let Some(stored) = read_json(app, CONFIG_FILE).as_object() {
        for (k, v) in stored {
            cfg.insert(k.clone(), v.clone());
        }
    }
    Value::Object(cfg)
}

// softero:get-quarantine -> QuarantineEntry[]  (Array.from(this.quarantine.values()))
fn get_quarantine(app: &tauri::AppHandle) -> Value {
    match read_json(app, QUARANTINE_DB_FILE) {
        Value::Array(a) => Value::Array(a),
        _ => json!([]),
    }
}

// softero:get-scan-history -> ScanResult[] (in-memory only; honestly [] on a
// fresh process). `limit` parsed and applied for shape fidelity.
fn get_scan_history(_app: &tauri::AppHandle, limit: usize) -> Value {
    let history: Vec<Value> = Vec::new();
    let start = history.len().saturating_sub(limit);
    json!(history[start..].to_vec())
}

/// Route a `softero:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; the
/// heavy/runtime channels (and any unknown one) return Value::Null (honest
/// degrade), so routing `channel.starts_with("softero:")` here is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "softero:get-config" => get_config(app),
        "softero:get-quarantine" => get_quarantine(app),
        "softero:get-scan-history" => {
            // Electron default: (_e, limit = 100).
            let limit = args
                .get(0)
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
                .unwrap_or(100);
            get_scan_history(app, limit)
        }
        // Heavy / runtime channels — not ported, not faked (need the live
        // scanner, fs.watch, crypto quarantine, or signature engine).
        _ => Value::Null,
    }
}
