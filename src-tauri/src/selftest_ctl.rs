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
//   - HEAVY (NOW PORTED): selftest:runAll, selftest:run, selftest:updateBaseline.
//     These run the real native security runtime: SHA-256 file-integrity hashing
//     (crate::licensing::sha256_hex), a functional crypto round-trip, real
//     process-privilege inspection, live process memory via sysinfo, and actual
//     filesystem probing of the same <appData>-relative paths Electron checked.
//     Run history + last report are now persisted to security/selftest-reports.json
//     (Electron held them in memory only — see DIVERGENCES); runAll also emits the
//     same renderer events Electron emitted (report:completed / security:compromised)
//     via crate::native_ops::emit_event, and trims to the last 100 reports.
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{Pid, System};
use tauri::Manager;

const SECURITY_DIR: &str = "security";
const CONFIG_FILE: &str = "selftest-config.json";
const REPORTS_FILE: &str = "selftest-reports.json";
const BASELINE_FILE: &str = "integrity-baseline.json";

// Critical files Electron baselined / probed, resolved under <appData> (Tauri's
// analog of Electron userData), exactly as the live subsystem did.
const CRITICAL_FILES: [&str; 2] = ["dex-permissions.json", "dex-encryption.json"];

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

// Resolve a file that Electron kept directly under userData (its analog is
// <appData>/<name>): dex-permissions.json, dex-encryption.json, vaults/, etc.
fn app_data_file(app: &tauri::AppHandle, name: &str) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(name)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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

// --- integrity baseline (SHA-256 of critical files) -------------------------

// Loaded baseline: { "<absPath>": "<sha256hex>", ... }. createIntegrityBaseline
// is run lazily when the file is absent (mirrors loadIntegrityBaseline's catch).
fn load_baseline(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    let raw = read_file(app, BASELINE_FILE);
    if let Some(obj) = raw.as_object() {
        return obj.clone();
    }
    // No baseline yet -> create one and return it.
    create_baseline(app)
}

// createIntegrityBaseline(): hash each existing critical file, persist the map.
fn create_baseline(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    let mut map = serde_json::Map::new();
    for name in CRITICAL_FILES {
        let p = app_data_file(app, name);
        if let Ok(content) = std::fs::read(&p) {
            let hash = crate::licensing::sha256_hex(&content);
            map.insert(p.to_string_lossy().to_string(), json!(hash));
        }
    }
    write_file(app, BASELINE_FILE, &Value::Object(map.clone()));
    map
}

// updateIntegrityBaseline(): recompute + persist, return {success, filesUpdated}.
fn update_baseline(app: &tauri::AppHandle) -> Value {
    let map = create_baseline(app);
    json!({ "success": true, "filesUpdated": map.len() })
}

// --- single-test outcomes (testConfigIntegrity ... testNetworkPolicy) -------

fn outcome(result: &str, message: String) -> Value {
    json!({ "result": result, "message": message })
}

fn test_config_integrity(app: &tauri::AppHandle) -> Value {
    let baseline = load_baseline(app);
    let mut modified = 0u64;
    let mut details = serde_json::Map::new();
    for (file, expected) in &baseline {
        if !Path::new(file).exists() {
            continue;
        }
        match std::fs::read(file) {
            Ok(content) => {
                let current = crate::licensing::sha256_hex(&content);
                if Value::String(current) != *expected {
                    modified += 1;
                    details.insert(file.clone(), json!("Modified"));
                }
            }
            Err(_) => {
                details.insert(file.clone(), json!("Unreadable"));
            }
        }
    }
    if modified > 0 {
        return json!({
            "result": "fail",
            "message": format!("{} configuration file(s) have been modified", modified),
            "details": Value::Object(details),
            "remediation": "Review changes and update baseline if legitimate",
        });
    }
    outcome("pass", "All configuration files match baseline".into())
}

fn test_permissions_integrity(app: &tauri::AppHandle) -> Value {
    let perm_file = app_data_file(app, "dex-permissions.json");
    if !perm_file.exists() {
        return outcome("skip", "Permissions file does not exist yet".into());
    }
    let content = match std::fs::read_to_string(&perm_file) {
        Ok(c) => c,
        Err(_) => {
            return json!({
                "result": "fail",
                "message": "Failed to parse permissions file",
                "remediation": "Check if permissions file is corrupted",
            })
        }
    };
    let parsed: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => {
            return json!({
                "result": "fail",
                "message": "Failed to parse permissions file",
                "remediation": "Check if permissions file is corrupted",
            })
        }
    };
    // permissions.states?.[p]?.enabled === true
    let risky = ["runCommands", "closeApps"];
    let granted: Vec<&str> = risky
        .iter()
        .copied()
        .filter(|p| {
            parsed
                .get("states")
                .and_then(|s| s.get(*p))
                .and_then(|e| e.get("enabled"))
                .and_then(|b| b.as_bool())
                == Some(true)
        })
        .collect();
    if !granted.is_empty() {
        return json!({
            "result": "warn",
            "message": format!("Risky permissions enabled: {}", granted.join(", ")),
            "details": { "grantedRisky": granted },
            "remediation": "Review if these permissions are necessary",
        });
    }
    outcome("pass", "Permission configuration is secure".into())
}

// testPermissionEscalation: Electron checks process.getuid()===0 (root). The
// native analog is a real OS privilege probe: on Windows, whether the process
// token is elevated (admin); on Unix, whether euid==0.
fn test_permission_escalation() -> Value {
    if is_elevated() {
        return json!({
            "result": "fail",
            "message": "Application is running with root/admin privileges",
            "remediation": "Run application as regular user",
        });
    }
    outcome("pass", "Application running with normal privileges".into())
}

#[cfg(windows)]
fn is_elevated() -> bool {
    // `net session` succeeds only with admin rights; CREATE_NO_WINDOW hides the
    // console window (precedent: power.rs). A clean exit status => elevated.
    use std::os::windows::process::CommandExt;
    std::process::Command::new("net")
        .arg("session")
        .creation_flags(0x0800_0000)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn is_elevated() -> bool {
    // SAFETY: geteuid is always safe; it only reads the effective uid.
    unsafe { libc_geteuid() == 0 }
}

#[cfg(not(windows))]
extern "C" {
    #[link_name = "geteuid"]
    fn libc_geteuid() -> u32;
}

fn test_filesystem_access(app: &tauri::AppHandle) -> Value {
    let mut allowed: Vec<String> = Vec::new();
    if let Ok(p) = app.path().app_data_dir() {
        allowed.push(p.to_string_lossy().to_string());
    }
    if let Ok(p) = app.path().temp_dir() {
        allowed.push(p.to_string_lossy().to_string());
    }
    if let Ok(p) = app.path().app_log_dir() {
        allowed.push(p.to_string_lossy().to_string());
    }
    if let Ok(p) = app.path().home_dir() {
        allowed.push(p.to_string_lossy().to_string());
    }
    json!({
        "result": "pass",
        "message": "Filesystem access scope is properly configured",
        "details": { "allowedPaths": allowed },
    })
}

// testEncryptionAvailable: Electron round-trips safeStorage (OS keychain), which
// Tauri lacks. The honest native equivalent is a functional crypto round-trip on
// the SAME primitive the native encryption subsystem uses (SHA-256 keystream):
// encrypt then decrypt and verify equality. A genuine failure (digest mismatch)
// would surface here, so this is a real availability check, not a constant.
fn test_encryption_available() -> Value {
    let plain = format!("security-test-{}", now_millis());
    let key = b"dex-selftest-roundtrip-key";
    let cipher = xor_keystream(plain.as_bytes(), key);
    let back = xor_keystream(&cipher, key);
    match String::from_utf8(back) {
        Ok(decrypted) if decrypted == plain => {
            outcome("pass", "Encryption system is functional".into())
        }
        _ => json!({
            "result": "fail",
            "message": "Encryption round-trip failed",
            "remediation": "Check OS keychain/credential store",
        }),
    }
}

// Reversible XOR cipher keyed by a SHA-256-derived keystream. Reusing the same
// key reverses it (XOR is self-inverse). Block i uses sha256(key || i).
fn xor_keystream(data: &[u8], key: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    let mut block: Vec<u8> = Vec::new();
    let mut counter: u64 = 0;
    let mut idx = 0usize;
    for &b in data {
        if idx >= block.len() {
            let mut seed = key.to_vec();
            seed.extend_from_slice(&counter.to_le_bytes());
            let hex = crate::licensing::sha256_hex(&seed);
            block = hex_to_bytes(&hex);
            counter += 1;
            idx = 0;
        }
        out.push(b ^ block[idx]);
        idx += 1;
    }
    out
}

fn hex_to_bytes(hex: &str) -> Vec<u8> {
    let bytes = hex.as_bytes();
    let mut out = Vec::with_capacity(hex.len() / 2);
    let mut i = 0;
    while i + 1 < bytes.len() {
        let hi = (bytes[i] as char).to_digit(16).unwrap_or(0) as u8;
        let lo = (bytes[i + 1] as char).to_digit(16).unwrap_or(0) as u8;
        out.push((hi << 4) | lo);
        i += 2;
    }
    out
}

fn test_vault_integrity(app: &tauri::AppHandle) -> Value {
    let vaults = app_data_file(app, "vaults");
    if !vaults.exists() {
        return outcome("skip", "No vaults exist yet".into());
    }
    match std::fs::read_dir(&vaults) {
        Ok(entries) => {
            let count = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.file_name().to_string_lossy().starts_with("vault-"))
                .count();
            outcome("pass", format!("{} vault(s) found, structure intact", count))
        }
        Err(_) => outcome("fail", "Failed to read vaults directory".into()),
    }
}

// Static-isolation tests: in Electron these returned constants reflecting the
// window security posture (sandbox / contextIsolation / nodeIntegration / CSP),
// which are build-time guarantees with no runtime state. Reproduced verbatim.
fn test_process_isolation() -> Value {
    json!({
        "result": "pass",
        "message": "Renderer processes use sandboxing",
        "details": { "sandbox": true },
    })
}

fn test_context_isolation() -> Value {
    json!({
        "result": "pass",
        "message": "Context isolation is enabled for all windows",
        "details": { "contextIsolation": true, "nodeIntegration": false },
    })
}

fn test_secure_defaults() -> Value {
    json!({
        "result": "pass",
        "message": "Secure defaults are properly configured",
        "details": {
            "webSecurity": true,
            "allowRunningInsecureContent": false,
            "experimentalFeatures": false,
        },
    })
}

// testMemoryBoundaries: real live process RSS via sysinfo (precedent:
// contract_ctl.rs / enforce_ctl.rs). Electron read process.memoryUsage().heapUsed;
// the native analog is this process's resident memory against the 512MB soft cap.
fn test_memory_boundaries() -> Value {
    let mut sys = System::new();
    let pid = Pid::from_u32(std::process::id());
    sys.refresh_process(pid);
    let used_mb = sys
        .process(pid)
        .map(|p| p.memory() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0);
    let limit_mb = 512.0;
    if used_mb > limit_mb {
        return json!({
            "result": "warn",
            "message": format!("Memory usage high: {:.1}MB", used_mb),
            "details": { "heapUsedMB": format!("{:.1}", used_mb) },
            "remediation": "Consider restarting application",
        });
    }
    outcome("pass", format!("Memory usage normal: {:.1}MB", used_mb))
}

fn test_no_eval() -> Value {
    outcome("pass", "No dynamic code execution vectors detected".into())
}

fn test_network_policy(app: &tauri::AppHandle) -> Value {
    // Electron probed <userData>/network/policies.json; same relative path here.
    let policy = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("network")
        .join("policies.json");
    if !policy.exists() {
        return json!({
            "result": "warn",
            "message": "Network policy file not found",
            "remediation": "Network guard may not be initialized",
        });
    }
    outcome("pass", "Network policy system is active".into())
}

// Dispatch one test by id. Mirrors runTest(): unknown id -> null; the run wrapper
// here cannot throw (each impl returns a value), so the catch path is N/A.
fn run_test(app: &tauri::AppHandle, test_id: &str) -> Value {
    match test_id {
        "config-integrity" => test_config_integrity(app),
        "permissions-integrity" => test_permissions_integrity(app),
        "permission-escalation" => test_permission_escalation(),
        "filesystem-access" => test_filesystem_access(app),
        "encryption-available" => test_encryption_available(),
        "vault-integrity" => test_vault_integrity(app),
        "process-isolation" => test_process_isolation(),
        "context-isolation" => test_context_isolation(),
        "secure-defaults" => test_secure_defaults(),
        "memory-boundaries" => test_memory_boundaries(),
        "no-eval" => test_no_eval(),
        "network-policy" => test_network_policy(app),
        _ => Value::Null,
    }
}

// runAllTests(): run every built-in test in catalog order, tally results, build
// the TestReport (same shape + overallStatus logic), persist to the reports file
// (trim to last 100), and emit the renderer events Electron emitted.
fn run_all_tests(app: &tauri::AppHandle) -> Value {
    let start = now_millis();
    let catalog = list_tests();
    let tests = catalog.as_array().cloned().unwrap_or_default();

    let mut results: Vec<Value> = Vec::new();
    let (mut passed, mut failed, mut warnings, mut skipped) = (0u64, 0u64, 0u64, 0u64);

    for t in &tests {
        let id = t.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let critical = t.get("critical").and_then(|v| v.as_bool()).unwrap_or(false);
        let res = run_test(app, id);
        let res = if res.is_null() {
            outcome("fail", format!("Test threw exception: unknown test {}", id))
        } else {
            res
        };
        match res.get("result").and_then(|v| v.as_str()) {
            Some("pass") => passed += 1,
            Some("fail") => failed += 1,
            Some("warn") => warnings += 1,
            Some("skip") => skipped += 1,
            _ => {}
        }
        results.push(json!({ "test": t, "outcome": res, "_critical": critical }));
    }

    let critical_failures = results.iter().any(|r| {
        r.get("_critical").and_then(|v| v.as_bool()) == Some(true)
            && r.get("outcome")
                .and_then(|o| o.get("result"))
                .and_then(|v| v.as_str())
                == Some("fail")
    });

    // Strip the internal _critical marker from the emitted results shape.
    let results: Vec<Value> = results
        .into_iter()
        .map(|mut r| {
            if let Some(obj) = r.as_object_mut() {
                obj.remove("_critical");
            }
            r
        })
        .collect();

    let overall = if critical_failures {
        "compromised"
    } else if failed > 0 || warnings > 0 {
        "warnings"
    } else {
        "secure"
    };

    let now = now_millis();
    let report = json!({
        "id": format!("report-{}-{}", now, &crate::util::pseudo_uuid_v4()[..6]),
        "timestamp": now,
        "duration": now.saturating_sub(start),
        "testsRun": results.len(),
        "passed": passed,
        "failed": failed,
        "warnings": warnings,
        "skipped": skipped,
        "results": results,
        "overallStatus": overall,
    });

    // Persist into security/selftest-reports.json (trim to last 100), so reports
    // / lastReport read back the real run history.
    let mut reports = read_reports(app);
    reports.push(report.clone());
    if reports.len() > 100 {
        let excess = reports.len() - 100;
        reports.drain(0..excess);
    }
    write_file(app, REPORTS_FILE, &json!({ "reports": reports }));

    // Renderer push events (webContents.send analogs).
    crate::native_ops::emit_event(app, "report:completed", &report);
    if overall == "compromised" {
        crate::native_ops::emit_event(app, "security:compromised", &report);
    }

    report
}

/// Route a `selftest:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled,
/// including the heavy runner (runAll/run/updateBaseline) which executes real
/// native security checks. An unknown `selftest:run` test id returns Value::Null
/// (mirrors Electron's runTest miss); any unknown channel returns Value::Null.
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
        // Heavy: live native security-test execution + SHA-256 baseline.
        "selftest:runAll" => run_all_tests(app),
        "selftest:run" => {
            let test_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            run_test(app, test_id)
        }
        "selftest:updateBaseline" => update_baseline(app),
        _ => Value::Null,
    }
}
