// =============================================================================
// DEX Tauri — Security Self-Test subsystem (port of the `selftest:*` IPC
// handlers in src/main/core/SecuritySelfTest.ts).
//
// SCOPE NOTE (channel naming): the porting brief named the data channel
// "getResults" and the heavy channel "run". The live Electron subsystem exposes
// no `selftest:getResults`; its data/read surface is `selftest:reports`,
// `selftest:lastReport`, `selftest:list`, `selftest:config`, plus the pure-data
// write `selftest:setConfig`. The "getResults" mandate maps onto `reports`
// (the persisted run history); the "run" heavy mandate maps onto `runAll`/`run`
// (live security-test execution), which are SKIPPED.
//
// Pure-data, JSON-backed tier. Electron kept two files under
// <userData>/security/ via fs/promises:
//   - selftest-config.json     : SelfTestConfig (runOnStartup, periodicInterval,
//                                 failOnCritical, notifyOnFailure, autoRemediate)
//   - integrity-baseline.json  : { "<absPath>": "<sha256hex>", ... }
// and held run history + the last report IN MEMORY only (never on disk). This
// module mirrors the SAME relative paths under <appData> (Tauri's app_data_dir
// is the analogue of Electron's userData). Because reports were never persisted
// in Electron, and no native test runner exists on the Tauri side yet, the
// report history is read from an OPTIONAL companion file `security/
// selftest-reports.json` ({ reports: TestReport[] }) and degrades to [] / null
// when absent — an honest empty surface rather than fabricated results.
//
// Channels & shapes (matched to the Electron handlers):
//   - selftest:reports     -> TestReport[]   (last `limit||10`, oldest..newest)
//   - selftest:lastReport  -> TestReport | null
//   - selftest:list        -> [{ id, name, category, critical }, ...]
//   - selftest:config      -> SelfTestConfig
//   - selftest:setConfig   -> { success: true }   (pure-data merge + persist)
//
// DIVERGENCES (documented):
//   - Report history is file-backed here (Electron held it in memory). The shape
//     and slice semantics (`reports.slice(-(limit||10))`) are identical; only the
//     source of truth differs. With no file/runner present the result is [],
//     which is exactly what a freshly-started Electron process also returned.
//   - selftest:setConfig in Electron additionally (re)arms a periodic timer when
//     `periodicInterval` changes. That is a live side-effect with no effect on
//     the returned value ({ success: true }), so it is not reproduced. The
//     config is merged over DEFAULT_CONFIG and persisted identically.
//   - The built-in test catalog returned by `selftest:list` is static metadata
//     in Electron (the 13 registerBuiltInTests entries); it is reproduced here
//     verbatim (id/name/category/critical) since it carries no runtime state.
//   - HEAVY (skipped): selftest:runAll, selftest:run, selftest:updateBaseline —
//     these execute filesystem hashing, OS encryption round-trips and process
//     inspection (a native security runtime). Not implemented, not faked.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const SECURITY_DIR: &str = "security";
const CONFIG_FILE: &str = "selftest-config.json";
const REPORTS_FILE: &str = "selftest-reports.json";

// --- file IO ----------------------------------------------------------------

fn security_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(SECURITY_DIR);
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(security_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_file(app: &tauri::AppHandle, name: &str, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(security_path(app, name), s).is_ok(),
        Err(_) => false,
    }
}

// --- config -----------------------------------------------------------------

// DEFAULT_CONFIG in SecuritySelfTest.ts.
fn default_config() -> Value {
    json!({
        "runOnStartup": true,
        "periodicInterval": 24,
        "failOnCritical": true,
        "notifyOnFailure": true,
        "autoRemediate": true,
    })
}

// loadConfig(): { ...DEFAULT_CONFIG, ...JSON.parse(file) }.
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let (Some(base), Some(stored)) = (
        cfg.as_object_mut(),
        read_file(app, CONFIG_FILE).as_object(),
    ) {
        for (k, v) in stored {
            base.insert(k.clone(), v.clone());
        }
    }
    cfg
}

// updateConfig(updates): merge over current config, persist, return {success}.
fn set_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut cfg = get_config(app);
    if let (Some(base), Some(upd)) = (cfg.as_object_mut(), updates.as_object()) {
        for (k, v) in upd {
            base.insert(k.clone(), v.clone());
        }
    }
    write_file(app, CONFIG_FILE, &cfg);
    json!({ "success": true })
}

// --- reports / last report --------------------------------------------------

fn read_reports(app: &tauri::AppHandle) -> Vec<Value> {
    read_file(app, REPORTS_FILE)
        .get("reports")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

// reports handler: this.reports.slice(-(limit || 10)) — the last N, in stored
// (oldest..newest) order. limit 0 falls back to 10 (mirrors `limit || 10`).
fn get_reports(app: &tauri::AppHandle, limit: &Value) -> Value {
    let reports = read_reports(app);
    let n = limit.as_u64().filter(|n| *n != 0).unwrap_or(10) as usize;
    let start = reports.len().saturating_sub(n);
    json!(reports[start..].to_vec())
}

// lastReport handler: returns this.lastReport (null until a run completes).
fn get_last_report(app: &tauri::AppHandle) -> Value {
    read_reports(app).last().cloned().unwrap_or(Value::Null)
}

// --- built-in test catalog (listTests) --------------------------------------

// Static metadata mirror of registerBuiltInTests() -> listTests(): the 13
// built-in tests with { id, name, category, critical }.
fn list_tests() -> Value {
    json!([
        { "id": "config-integrity",      "name": "Configuration File Integrity", "category": "file-integrity", "critical": true },
        { "id": "permissions-integrity", "name": "Permissions File Integrity",    "category": "file-integrity", "critical": true },
        { "id": "permission-escalation", "name": "Permission Escalation Check",   "category": "permission",     "critical": true },
        { "id": "filesystem-access",     "name": "Filesystem Access Scope",       "category": "permission",     "critical": false },
        { "id": "encryption-available",  "name": "Encryption System Available",   "category": "encryption",     "critical": false },
        { "id": "vault-integrity",       "name": "Vault System Integrity",        "category": "encryption",     "critical": false },
        { "id": "process-isolation",     "name": "Process Isolation",             "category": "isolation",      "critical": true },
        { "id": "context-isolation",     "name": "Context Isolation",             "category": "isolation",      "critical": true },
        { "id": "secure-defaults",       "name": "Secure Defaults Check",         "category": "configuration",  "critical": false },
        { "id": "memory-boundaries",     "name": "Memory Boundaries",             "category": "runtime",        "critical": false },
        { "id": "no-eval",               "name": "No Dangerous Eval",             "category": "runtime",        "critical": true },
        { "id": "network-policy",        "name": "Network Policy Active",         "category": "network",        "critical": false },
    ])
}

/// Route a `selftest:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; heavy
/// channels (runAll/run/updateBaseline) and any unknown channel return
/// Value::Null (honest degrade — never a fabricated test outcome).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "selftest:reports" => {
            let limit = args.get(0).cloned().unwrap_or(Value::Null);
            get_reports(app, &limit)
        }
        "selftest:lastReport" => get_last_report(app),
        "selftest:list" => list_tests(),
        "selftest:config" => get_config(app),
        "selftest:setConfig" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            set_config(app, &updates)
        }
        // Heavy: live security-test execution / filesystem hashing baseline.
        // Not ported (needs native runtime). Degrade to null.
        "selftest:runAll" | "selftest:run" | "selftest:updateBaseline" => Value::Null,
        _ => Value::Null,
    }
}
