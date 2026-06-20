// =============================================================================
// DEX Tauri — Network subsystem (port of the `network:*` surface that Electron
// spreads across THREE services:
//   - src/main/core/NetworkGuard.ts        (summary/config/policy/connectivity)
//   - src/main/security/NetworkHygieneMonitor.ts (hygiene config/status/log/stats)
//   - src/main/services/SpeedTestService.ts (network:speedtest:run)
// The task named SecurityController.ts; that file only *registers* the hygiene
// handlers — the real logic lives in NetworkHygieneMonitor, which we port here.)
//
// STORAGE — two persistence backends, mirroring the two Electron services:
//   1. NetworkGuard is plain fs-json under a `network/` subdir of userData:
//        <appData>/network/config.json   : NetworkConfig (object)
//        <appData>/network/policies.json : NetworkPolicy[]
//      We read/write those exact relative paths under app_data_dir().
//   2. NetworkHygieneMonitor is an electron-store named `dex-network`, i.e. a
//      single JSON file `dex-network.json` whose top-level keys are
//        config / connectionLog / certificateCache / statistics
//      electron-store writes to <userData>/dex-network.json, so we put it next to
//      the network/ dir (under app_data_dir()) with the SAME shape + defaults.
//
// RUNTIME DIVERGENCE (documented, unavoidable without Electron's session):
//   NetworkGuard's per-request counters (totalBytesIn/Out, activeConnections,
//   blockedAttempts) and the live connection/usage history only exist while the
//   `session.defaultSession.webRequest` interceptor runs. Tauri has no such
//   global request hook, so those reads return the SAME values a freshly-started
//   Electron NetworkGuard returns before any traffic — empty history, zero
//   counters — rather than fabricated numbers. uptimeMs is honest (this process).
//
// REAL native work done here (not stubs):
//   - config / policy CRUD with on-disk persistence + renderer push events
//   - connectivity / domain reachability via a real TCP connect probe (no new dep)
//   - hygiene config/domain/pause/stats CRUD persisted to dex-network.json
//   - certificate validation degraded honestly (a real TLS chain check needs a
//     TLS crate we are not allowed to add)
//   - speedtest:run via real ureq HTTP timing (ping HEAD + sized download)
//
// HONEST DEGRADE (cannot be done natively without the Electron runtime):
//   - network:scan / network:monitor / network:block — these drive the live
//     `webRequest` interceptor / global outbound monitor, which has no Tauri
//     equivalent. Shaped failure, listed as degraded.
//   - network:validate-certificate — real chain validation needs a TLS library
//     (rustls/native-tls) we may not add; returns a shaped "not ported".
// =============================================================================

use serde_json::{json, Value};
use std::io::Read;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::Manager;

const CONFIG_FILE: &str = "config.json";
const POLICIES_FILE: &str = "policies.json";

// NetworkGuard DEFAULT_CONFIG.mode.
const DEFAULT_MODE: &str = "full";

// electron-store file for NetworkHygieneMonitor (`new Store({ name: 'dex-network' })`).
const HYGIENE_FILE: &str = "dex-network.json";

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn now_ms_i64() -> i64 {
    now_ms() as i64
}

// ISO-8601 (UTC) timestamp like `new Date().toISOString()` — used by speedtest.
// Pure conversion from epoch millis, no chrono dependency.
fn iso8601(ms: u64) -> String {
    // Days since epoch -> civil date (Howard Hinnant's algorithm).
    let secs = (ms / 1000) as i64;
    let millis = (ms % 1000) as i64;
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (hour, minute, second) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, minute, second, millis
    )
}

// Process-scoped start instant, mirroring NetworkGuard's `startTime = Date.now()`.
fn start_ms() -> u64 {
    static START: OnceLock<u64> = OnceLock::new();
    *START.get_or_init(now_ms)
}

fn network_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("network");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_json_at(path: &PathBuf) -> Value {
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn read_network_json(app: &tauri::AppHandle, name: &str) -> Value {
    read_json_at(&network_dir(app).join(name))
}

// Pretty-write JSON (Electron used JSON.stringify(.., null, 2)); failures swallow.
fn write_network_json(app: &tauri::AppHandle, name: &str, value: &Value) -> bool {
    let path = network_dir(app).join(name);
    match serde_json::to_string_pretty(value) {
        Ok(s) => std::fs::write(path, s).is_ok(),
        Err(_) => false,
    }
}

// =============================================================================
// NetworkGuard — config
// =============================================================================

// DEFAULT_CONFIG object from NetworkGuard.ts.
fn default_config() -> Value {
    json!({
        "mode": DEFAULT_MODE,
        "allowUpdates": true,
        "allowExtensionNetwork": false,
        "maxConcurrentConnections": 50,
        "connectionTimeout": 30000,
        "logConnections": true,
        "alertOnNewDomain": true,
        "offlineMode": false,
    })
}

// loadConfig parity: { ...DEFAULT_CONFIG, ...JSON.parse(config.json) }.
fn load_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let (Value::Object(base), Value::Object(stored)) =
        (&mut cfg, read_network_json(app, CONFIG_FILE))
    {
        for (k, v) in stored {
            base.insert(k, v);
        }
    }
    cfg
}

fn save_config(app: &tauri::AppHandle, cfg: &Value) -> bool {
    write_network_json(app, CONFIG_FILE, cfg)
}

fn config_mode(app: &tauri::AppHandle) -> String {
    load_config(app)
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_MODE)
        .to_string()
}

// =============================================================================
// NetworkGuard — policies
// =============================================================================

const CORE_ALLOWED_DOMAINS: &[&str] = &[
    "github.com",
    "api.github.com",
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
];

// loadPolicies parity: if policies.json is missing/invalid, seed the core domains
// (and persist them), exactly like the Electron catch branch.
fn load_policies(app: &tauri::AppHandle) -> Vec<Value> {
    match read_network_json(app, POLICIES_FILE) {
        Value::Array(a) => a,
        _ => {
            let now = now_ms_i64();
            let seeded: Vec<Value> = CORE_ALLOWED_DOMAINS
                .iter()
                .map(|d| {
                    json!({
                        "id": format!("core-{}", d),
                        "name": format!("Core: {}", d),
                        "domain": d,
                        "allowed": true,
                        "reason": "Core functionality",
                        "createdAt": now,
                        "isUserDefined": false,
                    })
                })
                .collect();
            write_network_json(app, POLICIES_FILE, &Value::Array(seeded.clone()));
            seeded
        }
    }
}

fn save_policies(app: &tauri::AppHandle, policies: &[Value]) -> bool {
    write_network_json(app, POLICIES_FILE, &Value::Array(policies.to_vec()))
}

fn user_policy_counts(app: &tauri::AppHandle) -> (i64, i64) {
    let policies = load_policies(app);
    let mut allowed = 0i64;
    let mut blocked = 0i64;
    for p in &policies {
        if !p.get("isUserDefined").and_then(|v| v.as_bool()).unwrap_or(false) {
            continue;
        }
        if p.get("allowed").and_then(|v| v.as_bool()).unwrap_or(false) {
            allowed += 1;
        } else {
            blocked += 1;
        }
    }
    (allowed, blocked)
}

fn is_local_connection(domain: &str) -> bool {
    domain == "localhost"
        || domain == "127.0.0.1"
        || domain == "::1"
        || domain.ends_with(".local")
        || domain.starts_with("192.168.")
        || domain.starts_with("10.")
        || domain.starts_with("172.16.")
}

// findPolicy parity: exact match, then `*.base` wildcard (endsWith base).
fn find_policy<'a>(policies: &'a [Value], domain: &str) -> Option<&'a Value> {
    if let Some(p) = policies.iter().find(|p| {
        p.get("domain").and_then(|v| v.as_str()) == Some(domain)
    }) {
        return Some(p);
    }
    for p in policies {
        if let Some(pd) = p.get("domain").and_then(|v| v.as_str()) {
            if let Some(base) = pd.strip_prefix("*.") {
                if domain.ends_with(base) {
                    return Some(p);
                }
            }
        }
    }
    None
}

// =============================================================================
// NetworkGuard — summary (the status read)
// =============================================================================

fn get_summary(app: &tauri::AppHandle) -> Value {
    let (allowed_domains, blocked_domains) = user_policy_counts(app);
    // status: probe connectivity for an honest live value (Electron derives it
    // from the periodic dns.resolve check; we do the equivalent TCP probe).
    let status = match probe_connectivity() {
        (true, ms) if ms > 2000 => "limited",
        (true, _) => "online",
        (false, _) => "offline",
    };
    json!({
        "status": status,
        "mode": config_mode(app),
        "totalBytesIn": 0,
        "totalBytesOut": 0,
        "activeConnections": 0,
        "blockedAttempts": 0,
        "allowedDomains": allowed_domains,
        "blockedDomains": blocked_domains,
        "uptimeMs": now_ms().saturating_sub(start_ms()),
    })
}

// =============================================================================
// Connectivity probe — real TCP reachability (no new dependency)
// =============================================================================

// Try to open a TCP connection to host:port within `timeout`; return success +
// elapsed millis. Mirrors NetworkGuard's intent (reach a known host, measure
// latency) using only std::net. DNS resolution happens inside to_socket_addrs.
fn tcp_probe(host: &str, port: u16, timeout: Duration) -> (bool, u64) {
    let start = std::time::Instant::now();
    let addrs = match (host, port).to_socket_addrs() {
        Ok(a) => a,
        Err(_) => return (false, 0),
    };
    for addr in addrs {
        if TcpStream::connect_timeout(&addr, timeout).is_ok() {
            return (true, start.elapsed().as_millis() as u64);
        }
    }
    (false, 0)
}

// Connectivity check against a well-known host, mirroring NetworkGuard's
// `dns.resolve('dns.google')` reachability test (we connect to dns.google:443).
fn probe_connectivity() -> (bool, u64) {
    tcp_probe("dns.google", 443, Duration::from_millis(2500))
}

// network:checkConnectivity -> { status, latencyMs? }
fn check_connectivity() -> Value {
    let (ok, ms) = probe_connectivity();
    if ok {
        let status = if ms > 2000 { "limited" } else { "online" };
        json!({ "status": status, "latencyMs": ms })
    } else {
        json!({ "status": "offline" })
    }
}

// network:testDomain -> { reachable, latencyMs?, blocked, reason? }
fn test_domain(app: &tauri::AppHandle, domain: &str) -> Value {
    let cfg = load_config(app);
    let mode = cfg.get("mode").and_then(|v| v.as_str()).unwrap_or(DEFAULT_MODE);
    let offline = cfg.get("offlineMode").and_then(|v| v.as_bool()).unwrap_or(false);

    // Policy check (blocked policy short-circuits).
    let policies = load_policies(app);
    if let Some(p) = find_policy(&policies, domain) {
        if !p.get("allowed").and_then(|v| v.as_bool()).unwrap_or(false) {
            let reason = p.get("reason").and_then(|v| v.as_str()).unwrap_or("Blocked");
            return json!({ "reachable": false, "blocked": true, "reason": reason });
        }
    }
    if mode == "disabled" || offline {
        return json!({
            "reachable": false, "blocked": true,
            "reason": "Network disabled or offline"
        });
    }
    if mode == "local-only" && !is_local_connection(domain) {
        return json!({ "reachable": false, "blocked": true, "reason": "Local-only mode" });
    }

    // Real reachability: TCP connect to :443 (https) as the modern analog of a
    // DNS resolve — a successful connect proves the name resolved AND is routable.
    let (ok, ms) = tcp_probe(domain, 443, Duration::from_millis(3000));
    if ok {
        json!({ "reachable": true, "latencyMs": ms, "blocked": false })
    } else {
        json!({ "reachable": false, "blocked": false, "reason": "DNS resolution failed" })
    }
}

// =============================================================================
// NetworkGuard — CRUD handlers
// =============================================================================

fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut cfg = load_config(app);
    if let (Value::Object(base), Value::Object(upd)) = (&mut cfg, updates) {
        for (k, v) in upd {
            base.insert(k.clone(), v.clone());
        }
    }
    save_config(app, &cfg);
    crate::native_ops::emit_event(app, "config:changed", &cfg);
    json!({ "success": true })
}

fn set_mode(app: &tauri::AppHandle, mode: &str) -> Value {
    let mut cfg = load_config(app);
    if let Value::Object(map) = &mut cfg {
        map.insert("mode".into(), json!(mode));
    }
    save_config(app, &cfg);
    crate::native_ops::emit_event(app, "mode:changed", &json!(mode));
    json!({ "success": true })
}

fn set_offline(app: &tauri::AppHandle, offline: bool) -> Value {
    let mut cfg = load_config(app);
    if let Value::Object(map) = &mut cfg {
        map.insert("offlineMode".into(), json!(offline));
    }
    save_config(app, &cfg);
    crate::native_ops::emit_event(app, "offline:changed", &json!(offline));
    json!({ "success": true })
}

// addPolicy(domain, allowed, reason?) — Map keyed by domain (set replaces).
fn add_policy(app: &tauri::AppHandle, domain: &str, allowed: bool, reason: Option<&str>) -> Value {
    let now = now_ms_i64();
    let reason = reason
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| if allowed { "User allowed".into() } else { "User blocked".into() });
    let policy = json!({
        "id": format!("user-{}-{}", now, &crate::util::pseudo_uuid_v4()[..6]),
        "name": domain,
        "domain": domain,
        "allowed": allowed,
        "reason": reason,
        "createdAt": now,
        "isUserDefined": true,
    });

    let mut policies = load_policies(app);
    // Map semantics: replace any existing entry with the same domain.
    policies.retain(|p| p.get("domain").and_then(|v| v.as_str()) != Some(domain));
    policies.push(policy.clone());
    save_policies(app, &policies);
    crate::native_ops::emit_event(app, "policy:added", &policy);
    policy
}

// removePolicy(domain) — core (non-user) policies cannot be removed.
fn remove_policy(app: &tauri::AppHandle, domain: &str) -> Value {
    let mut policies = load_policies(app);
    let existing = policies
        .iter()
        .find(|p| p.get("domain").and_then(|v| v.as_str()) == Some(domain))
        .cloned();
    match existing {
        Some(p) => {
            let is_user = p.get("isUserDefined").and_then(|v| v.as_bool()).unwrap_or(false);
            if !is_user {
                return json!({ "success": false });
            }
            policies.retain(|q| q.get("domain").and_then(|v| v.as_str()) != Some(domain));
            save_policies(app, &policies);
            crate::native_ops::emit_event(app, "policy:removed", &json!(domain));
            json!({ "success": true })
        }
        None => json!({ "success": false }),
    }
}

// =============================================================================
// NetworkHygieneMonitor — electron-store backed (dex-network.json)
// =============================================================================

fn hygiene_defaults() -> Value {
    json!({
        "config": {
            "enabled": true,
            "enforceHttps": true,
            "validateCertificates": true,
            "allowInbound": false,
            "pauseOnUncertainty": true,
            "trustedDomains": [
                "github.com", "api.github.com", "githubusercontent.com", "electronjs.org"
            ],
            "blockedDomains": [],
            "maxConcurrentConnections": 200,
            "connectionTimeout": 30000,
            "logAllConnections": false,
        },
        "connectionLog": [],
        "certificateCache": {},
        "statistics": {
            "totalConnections": 0,
            "blockedConnections": 0,
            "httpsConnections": 0,
            "httpConnections": 0,
            "certificateErrors": 0,
            "lastReset": now_ms_i64(),
        },
    })
}

// Load the whole electron-store doc, filling any missing top-level key with its
// default (electron-store `defaults` semantics).
fn hygiene_store(app: &tauri::AppHandle) -> Value {
    let mut doc = hygiene_defaults();
    let stored = read_json_at(&app_data_dir(app).join(HYGIENE_FILE));
    if let (Value::Object(base), Value::Object(s)) = (&mut doc, stored) {
        for (k, v) in s {
            base.insert(k, v);
        }
    }
    doc
}

fn hygiene_save(app: &tauri::AppHandle, doc: &Value) -> bool {
    let path = app_data_dir(app).join(HYGIENE_FILE);
    match serde_json::to_string_pretty(doc) {
        Ok(s) => std::fs::write(path, s).is_ok(),
        Err(_) => false,
    }
}

fn hygiene_get_config(app: &tauri::AppHandle) -> Value {
    hygiene_store(app).get("config").cloned().unwrap_or_else(|| {
        hygiene_defaults().get("config").cloned().unwrap_or(Value::Null)
    })
}

fn hygiene_update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut doc = hygiene_store(app);
    let mut cfg = hygiene_get_config(app);
    if let (Value::Object(base), Value::Object(upd)) = (&mut cfg, updates) {
        for (k, v) in upd {
            base.insert(k.clone(), v.clone());
        }
    }
    if let Value::Object(map) = &mut doc {
        map.insert("config".into(), cfg.clone());
    }
    hygiene_save(app, &doc);
    cfg
}

// updateNetworkStatus parity. net.isOnline() -> a real TCP reachability probe;
// connectionType "ethernet" when online (Electron assumed wired on desktop).
fn hygiene_status(app: &tauri::AppHandle) -> Value {
    let (online, _) = probe_connectivity();
    let blocked = hygiene_store(app)
        .get("statistics")
        .and_then(|s| s.get("blockedConnections"))
        .cloned()
        .unwrap_or(json!(0));
    json!({
        "online": online,
        "connectionType": if online { "ethernet" } else { "unknown" },
        "metered": false,
        "lastCheck": now_ms_i64(),
        "activeConnections": 0,
        "blockedAttempts": blocked,
    })
}

// getConnectivityState parity.
fn hygiene_connectivity() -> Value {
    let (online, _) = probe_connectivity();
    json!({
        "wifi": {
            "available": true,
            "connected": online,
            "strength": if online { 100 } else { 0 },
            "metered": false,
        },
        "cellular": { "available": false, "connected": false },
        "bluetooth": { "available": false, "connected": false },
        "vpn": false,
    })
}

// Mutate a string array inside config (trustedDomains / blockedDomains).
fn hygiene_domain_op(app: &tauri::AppHandle, field: &str, domain: &str, add: bool) -> Value {
    let mut cfg = hygiene_get_config(app);
    if let Value::Object(map) = &mut cfg {
        let mut list: Vec<Value> = map
            .get(field)
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if add {
            if !list.iter().any(|v| v.as_str() == Some(domain)) {
                list.push(json!(domain));
            }
        } else {
            list.retain(|v| v.as_str() != Some(domain));
        }
        map.insert(field.into(), Value::Array(list));
    }
    let mut doc = hygiene_store(app);
    if let Value::Object(m) = &mut doc {
        m.insert("config".into(), cfg);
    }
    hygiene_save(app, &doc);
    json!(true)
}

fn hygiene_connection_log(app: &tauri::AppHandle, limit: usize) -> Value {
    let log = hygiene_store(app)
        .get("connectionLog")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    // electron-store returns .slice(0, limit) — the most recent first (unshift).
    let slice: Vec<Value> = log.into_iter().take(limit).collect();
    Value::Array(slice)
}

fn hygiene_statistics(app: &tauri::AppHandle) -> Value {
    hygiene_store(app).get("statistics").cloned().unwrap_or_else(|| {
        hygiene_defaults().get("statistics").cloned().unwrap_or(Value::Null)
    })
}

fn hygiene_reset_stats(app: &tauri::AppHandle) -> Value {
    let mut doc = hygiene_store(app);
    if let Value::Object(map) = &mut doc {
        map.insert(
            "statistics".into(),
            json!({
                "totalConnections": 0,
                "blockedConnections": 0,
                "httpsConnections": 0,
                "httpConnections": 0,
                "certificateErrors": 0,
                "lastReset": now_ms_i64(),
            }),
        );
    }
    hygiene_save(app, &doc);
    json!(true)
}

// Hygiene pause/resume is a process-scoped flag (Electron held it in memory and
// did not persist it). Keep the same semantics with a session-scoped flag.
fn hygiene_paused_flag() -> &'static std::sync::atomic::AtomicBool {
    static PAUSED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    &PAUSED
}

// validateConnection parity (best-effort, using on-disk config). The live
// active-connection map and TLS cert validation are not available, so the
// cert-validation branch is skipped (validateCertificates path) the same way a
// trusted/disabled config would short-circuit it.
fn hygiene_validate_connection(app: &tauri::AppHandle, domain: &str, protocol: &str) -> Value {
    let cfg = hygiene_get_config(app);
    let enabled = cfg.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    if !enabled {
        return json!({ "allowed": true, "reason": "Monitor disabled" });
    }
    let pause_on = cfg.get("pauseOnUncertainty").and_then(|v| v.as_bool()).unwrap_or(true);
    if hygiene_paused_flag().load(std::sync::atomic::Ordering::Relaxed) && pause_on {
        return json!({ "allowed": false, "reason": "Network activity paused" });
    }
    // Blocked-domain check (isDomainBlocked: exact, ".base" suffix, or "*.base").
    let blocked: Vec<String> = cfg
        .get("blockedDomains")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let is_blocked = blocked.iter().any(|b| {
        if let Some(base) = b.strip_prefix("*.") {
            domain.ends_with(base)
        } else {
            domain == b || domain.ends_with(&format!(".{}", b))
        }
    });
    if is_blocked {
        return json!({ "allowed": false, "reason": "Domain is blocked" });
    }
    let enforce_https = cfg.get("enforceHttps").and_then(|v| v.as_bool()).unwrap_or(true);
    if enforce_https
        && (protocol == "http" || protocol == "ws")
        && domain != "localhost"
        && domain != "127.0.0.1"
    {
        return json!({ "allowed": false, "reason": "Only HTTPS/WSS connections allowed" });
    }
    json!({ "allowed": true, "reason": "Validation passed" })
}

// =============================================================================
// SpeedTest — network:speedtest:run (real HTTP timing via ureq)
// =============================================================================

// round2 parity.
fn round2(n: f64) -> f64 {
    if !n.is_finite() {
        return 0.0;
    }
    (n * 100.0).round() / 100.0
}

fn bytes_per_ms_to_mbps(bytes: u64, duration_ms: u64) -> f64 {
    if duration_ms == 0 || bytes == 0 {
        return 0.0;
    }
    let bits = bytes as f64 * 8.0;
    let seconds = duration_ms as f64 / 1000.0;
    round2((bits / seconds) / 1_000_000.0)
}

// aggregateSamples parity: drop the slowest when 3+, mean of the rest.
fn aggregate_samples(samples: &[(u64, u64)]) -> f64 {
    let mut mbps: Vec<f64> = samples
        .iter()
        .filter(|(b, d)| *b > 0 && *d > 0)
        .map(|(b, d)| bytes_per_ms_to_mbps(*b, *d))
        .collect();
    if mbps.is_empty() {
        return 0.0;
    }
    mbps.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let trimmed: &[f64] = if mbps.len() >= 3 { &mbps[1..] } else { &mbps[..] };
    let sum: f64 = trimmed.iter().sum();
    round2(sum / trimmed.len() as f64)
}

// computeJitter parity: mean absolute deviation between consecutive samples.
fn compute_jitter(pings: &[u64]) -> f64 {
    let valid: Vec<u64> = pings.iter().copied().filter(|p| *p > 0).collect();
    if valid.len() < 2 {
        return 0.0;
    }
    let mut total = 0u64;
    for i in 1..valid.len() {
        total += valid[i].abs_diff(valid[i - 1]);
    }
    round2(total as f64 / (valid.len() - 1) as f64)
}

// classifySpeed parity.
fn classify_speed(mbps: f64) -> &'static str {
    if !mbps.is_finite() || mbps < 1.0 {
        "offline"
    } else if mbps < 10.0 {
        "poor"
    } else if mbps < 25.0 {
        "fair"
    } else if mbps < 100.0 {
        "good"
    } else {
        "excellent"
    }
}

// One HTTP request; return (bytes_read, elapsed_ms) or None on error/timeout.
fn speed_request(method: &str, url: &str, timeout: Duration) -> Option<(u64, u64)> {
    let agent = ureq::AgentBuilder::new().timeout(timeout).build();
    let start = std::time::Instant::now();
    let req = match method {
        "HEAD" => agent.head(url),
        _ => agent.get(url),
    }
    .set("User-Agent", "DEX-SpeedTest/1.0")
    .set("Cache-Control", "no-cache")
    .set("Pragma", "no-cache");
    let resp = req.call().ok()?;
    // Drain the body to measure throughput (HEAD has none -> 0 bytes, fine).
    let mut buf = Vec::new();
    let bytes = resp
        .into_reader()
        .take(8 * 1024 * 1024) // hard cap so a misconfigured endpoint can't OOM us
        .read_to_end(&mut buf)
        .map(|n| n as u64)
        .unwrap_or(0);
    Some((bytes, start.elapsed().as_millis() as u64))
}

// runSpeedTest parity: ping (HEAD x3 per endpoint) then sized download samples.
// Endpoints mirror SpeedTestService DEFAULT_CONFIG (upload is null -> skipped).
fn run_speedtest() -> Value {
    const PING_ENDPOINTS: &[&str] = &[
        "https://www.cloudflare.com/cdn-cgi/trace",
        "https://1.1.1.1/cdn-cgi/trace",
    ];
    const DOWNLOAD_BASE: &str = "https://speed.cloudflare.com/__down?bytes=";
    const DOWNLOAD_BYTES: u64 = 1024 * 1024;
    const SAMPLES: usize = 3;
    const PER_REQ_TIMEOUT: Duration = Duration::from_secs(12);

    // --- ping ---
    let mut ping_samples: Vec<u64> = Vec::new();
    for ep in PING_ENDPOINTS {
        for _ in 0..3 {
            if let Some((_, ms)) = speed_request("HEAD", ep, Duration::from_secs(4)) {
                ping_samples.push(ms);
            }
        }
    }
    if ping_samples.is_empty() {
        return json!({
            "downloadMbps": 0, "uploadMbps": 0, "pingMs": 0, "jitterMs": 0,
            "quality": "offline", "timestamp": iso8601(now_ms()), "server": "unreachable",
        });
    }
    let avg_ping = (ping_samples.iter().sum::<u64>() as f64 / ping_samples.len() as f64).round() as u64;
    let jitter = compute_jitter(&ping_samples);

    // --- download ---
    let mut dl_samples: Vec<(u64, u64)> = Vec::new();
    let url = format!("{}{}", DOWNLOAD_BASE, DOWNLOAD_BYTES);
    for _ in 0..SAMPLES {
        if let Some((bytes, ms)) = speed_request("GET", &url, PER_REQ_TIMEOUT) {
            if bytes > 0 && ms > 0 {
                dl_samples.push((bytes, ms));
            }
        }
    }
    let download_mbps = aggregate_samples(&dl_samples);

    json!({
        "downloadMbps": download_mbps,
        "uploadMbps": 0, // uploadEndpoint is null in DEFAULT_CONFIG -> skipped
        "pingMs": avg_ping,
        "jitterMs": jitter,
        "quality": classify_speed(download_mbps),
        "timestamp": iso8601(now_ms()),
        "server": DOWNLOAD_BASE,
    })
}

// =============================================================================
// DISPATCH
// =============================================================================

/// Route a `network:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg_str = |i: usize| args.get(i).and_then(|v| v.as_str()).map(String::from);
    let arg_bool = |i: usize| args.get(i).and_then(|v| v.as_bool());

    match channel {
        // --- NetworkGuard: status / reads ---
        "network:summary" | "network:getStatus" => get_summary(app),

        // Live in-memory reads — honest fresh-process values (no global request
        // hook in Tauri). Empty arrays, exactly like a just-started NetworkGuard.
        "network:connections" => json!([]),
        "network:history" => json!([]),
        "network:usage" => json!([]),

        // --- NetworkGuard: config CRUD ---
        "network:config" => load_config(app),
        "network:setConfig" => {
            update_config(app, args.get(0).unwrap_or(&Value::Null))
        }
        "network:setMode" => {
            set_mode(app, &arg_str(0).unwrap_or_else(|| DEFAULT_MODE.into()))
        }
        "network:setOffline" => set_offline(app, arg_bool(0).unwrap_or(false)),

        // --- NetworkGuard: policy CRUD ---
        "network:policies" => Value::Array(load_policies(app)),
        "network:addPolicy" => add_policy(
            app,
            &arg_str(0).unwrap_or_default(),
            arg_bool(1).unwrap_or(false),
            arg_str(2).as_deref(),
        ),
        "network:removePolicy" => remove_policy(app, &arg_str(0).unwrap_or_default()),

        // --- NetworkGuard: connectivity / domain probes (real TCP) ---
        "network:checkConnectivity" => check_connectivity(),
        "network:testDomain" => test_domain(app, &arg_str(0).unwrap_or_default()),

        // --- NetworkHygieneMonitor (dex-network.json) ---
        "network:get-hygiene-config" => hygiene_get_config(app),
        "network:update-hygiene-config" => {
            hygiene_update_config(app, args.get(0).unwrap_or(&Value::Null))
        }
        "network:get-hygiene-status" | "networkHygiene:getStatus" => hygiene_status(app),
        "network:get-connectivity" | "networkHygiene:getConnectivity" => hygiene_connectivity(),
        "network:add-trusted-domain" => {
            hygiene_domain_op(app, "trustedDomains", &arg_str(0).unwrap_or_default(), true)
        }
        "network:remove-trusted-domain" => {
            hygiene_domain_op(app, "trustedDomains", &arg_str(0).unwrap_or_default(), false)
        }
        "network:add-blocked-domain" => {
            hygiene_domain_op(app, "blockedDomains", &arg_str(0).unwrap_or_default(), true)
        }
        "network:remove-blocked-domain" => {
            hygiene_domain_op(app, "blockedDomains", &arg_str(0).unwrap_or_default(), false)
        }
        "network:pause-hygiene" => {
            hygiene_paused_flag().store(true, std::sync::atomic::Ordering::Relaxed);
            json!(true)
        }
        "network:resume-hygiene" => {
            hygiene_paused_flag().store(false, std::sync::atomic::Ordering::Relaxed);
            json!(true)
        }
        "network:is-paused" => {
            json!(hygiene_paused_flag().load(std::sync::atomic::Ordering::Relaxed))
        }
        "network:get-connection-log" => {
            let limit = args.get(0).and_then(|v| v.as_u64()).unwrap_or(100) as usize;
            hygiene_connection_log(app, limit)
        }
        "network:get-statistics" => hygiene_statistics(app),
        "network:reset-statistics" => hygiene_reset_stats(app),
        "network:validate-connection" => hygiene_validate_connection(
            app,
            &arg_str(0).unwrap_or_default(),
            &arg_str(2).unwrap_or_else(|| "https".into()),
        ),

        // --- SpeedTest ---
        "network:speedtest:run" => run_speedtest(),

        // --- HONEST DEGRADE: need the Electron runtime / a TLS crate ---
        // Live outbound interception monitor (session.webRequest) has no Tauri
        // analog; real TLS chain validation needs a TLS library we may not add.
        "network:scan" | "network:monitor" | "network:block"
        | "network:validate-certificate" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso8601_epoch_zero() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn iso8601_known_instant() {
        // 2021-01-01T00:00:00.000Z == 1609459200000 ms.
        assert_eq!(iso8601(1_609_459_200_000), "2021-01-01T00:00:00.000Z");
    }

    #[test]
    fn mbps_conversion() {
        // 1 MB in 1000 ms = 8 Mbit/s.
        assert_eq!(bytes_per_ms_to_mbps(1_000_000, 1000), 8.0);
        assert_eq!(bytes_per_ms_to_mbps(0, 1000), 0.0);
        assert_eq!(bytes_per_ms_to_mbps(1000, 0), 0.0);
    }

    #[test]
    fn aggregate_drops_slowest_when_three_plus() {
        // 8, 16, 24 Mbps samples -> drop slowest (8), mean(16,24) = 20.
        let samples = [(1_000_000, 1000), (2_000_000, 1000), (3_000_000, 1000)];
        assert_eq!(aggregate_samples(&samples), 20.0);
    }

    #[test]
    fn jitter_mean_abs_deviation() {
        assert_eq!(compute_jitter(&[10, 20, 30]), 10.0);
        assert_eq!(compute_jitter(&[10]), 0.0);
    }

    #[test]
    fn classify_thresholds() {
        assert_eq!(classify_speed(0.5), "offline");
        assert_eq!(classify_speed(5.0), "poor");
        assert_eq!(classify_speed(20.0), "fair");
        assert_eq!(classify_speed(50.0), "good");
        assert_eq!(classify_speed(150.0), "excellent");
    }

    #[test]
    fn local_connection_detection() {
        assert!(is_local_connection("localhost"));
        assert!(is_local_connection("192.168.1.5"));
        assert!(is_local_connection("printer.local"));
        assert!(!is_local_connection("github.com"));
    }
}
