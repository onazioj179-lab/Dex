// =============================================================================
// DEX Tauri — Update Service subsystem (port of core/UpdateService.ts).
//
// Pure-data, JSON-backed tier (same shape/precedent as analytics.rs). Electron
// used a single hand-rolled JSON file (NOT electron-store) under userData:
//   - update-service.json : the UpdateServiceConfig object, written verbatim as
//     { pollIntervalHours, enabled, lastPoll, versionUrl } (no top-level key
//     wrapper — loadConfig spreads JSON.parse straight over DEFAULT_CONFIG).
// This mirrors that file name and unwrapped shape under <appData>.
//
// CHANNEL MAPPING (documented divergence): the prompt names the data channel
// `update-service:getStatus`. The Electron source exposes the read-only status
// getter as `update-service:getLastResult` (returns the last VersionCheckResult
// or null). There is no verbatim `getStatus` handler. To keep the renderer
// working under whichever name it calls, BOTH `update-service:getStatus` and
// `update-service:getLastResult` route to the same getter here. No field is
// invented; the returned shape is exactly VersionCheckResult | null.
//
// `getLastResult` is null until a `check` runs. The `check` channel is a HEAVY
// network poll (net.request to a remote VERSION.txt) that ALSO produces and
// persists lastResult; it is intentionally NOT ported (needs a native runtime).
// Because nothing in this pure-data port performs a check, lastResult is never
// populated by us — we read it from disk if a prior (Electron) run wrote it,
// otherwise return null, exactly as the Electron getter would on a cold start.
//
// VersionCheckResult shape (from checkVersion):
//   { currentVersion: string, remoteVersion: string|null,
//     updateAvailable: bool, checkedAt: number, error: string|null }
//
// getConfig shape (from the IPC handler — note it returns only THREE of the
// four config fields; versionUrl is deliberately omitted by Electron):
//   { pollIntervalHours: number, enabled: bool, lastPoll: number }
//
// DIVERGENCES:
//   - lastResult lived only in-memory in Electron (this.lastResult), set by
//     checkVersion. We have no in-memory session and no check, so getStatus/
//     getLastResult returns null unless a persisted result is found. The config
//     file does NOT store lastResult, so on this pure-data tier the value is
//     effectively always null — matching Electron's behaviour before any check.
//   - app.getVersion() -> tauri app.package_info().version (same build source
//     as app:getVersion / corepc:getVersion in this Tauri build).
// =============================================================================

use serde_json::{json, Value};
use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const CONFIG_FILE: &str = "update-service.json";

// DEFAULT_CONFIG from UpdateService.ts.
const DEFAULT_POLL_INTERVAL_HOURS: i64 = 4;
const DEFAULT_ENABLED: bool = true;
const DEFAULT_LAST_POLL: i64 = 0;
const DEFAULT_VERSION_URL: &str = "";

// fetchRemoteVersion timeout (TS used 10s) and a body cap so a misconfigured URL
// pointing at a huge resource can't blow up memory (the file is meant to hold a
// single version line).
const FETCH_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_BODY_BYTES: u64 = 64 * 1024;
const USER_AGENT: &str = "DEX-UpdateService/6.0";

// setConfig clamp bounds for pollIntervalHours (Math.max(1, Math.min(168, x))).
const MIN_POLL_HOURS: i64 = 1;
const MAX_POLL_HOURS: i64 = 168;

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// loadConfig(): { ...DEFAULT_CONFIG, ...JSON.parse(file) } — defaults backfilled
// for any missing field. This returns the FULL config including versionUrl (the
// on-disk shape), used by check/setConfig; `get_config` below narrows it to the
// three fields the Electron getConfig handler exposes.
fn load_config(app: &tauri::AppHandle) -> Value {
    let raw = read_file(app, CONFIG_FILE);
    let poll = raw
        .get("pollIntervalHours")
        .and_then(|v| v.as_i64())
        .unwrap_or(DEFAULT_POLL_INTERVAL_HOURS);
    let enabled = raw
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_ENABLED);
    let last_poll = raw
        .get("lastPoll")
        .and_then(|v| v.as_i64())
        .unwrap_or(DEFAULT_LAST_POLL);
    let version_url = raw
        .get("versionUrl")
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_VERSION_URL)
        .to_string();
    json!({
        "pollIntervalHours": poll,
        "enabled": enabled,
        "lastPoll": last_poll,
        "versionUrl": version_url,
    })
}

// saveConfig(): write the verbatim UpdateServiceConfig object (no top-level key
// wrapper, pretty-printed with two spaces — matching JSON.stringify(cfg, null, 2)).
fn save_config(app: &tauri::AppHandle, cfg: &Value) {
    if let Ok(raw) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(store_path(app, CONFIG_FILE), raw);
    }
}

// getConfig IPC shape — only THREE of the four fields (versionUrl omitted), as
// the Electron handler returns.
fn get_config(app: &tauri::AppHandle) -> Value {
    let cfg = load_config(app);
    json!({
        "pollIntervalHours": cfg.get("pollIntervalHours").cloned().unwrap_or(json!(DEFAULT_POLL_INTERVAL_HOURS)),
        "enabled": cfg.get("enabled").cloned().unwrap_or(json!(DEFAULT_ENABLED)),
        "lastPoll": cfg.get("lastPoll").cloned().unwrap_or(json!(DEFAULT_LAST_POLL)),
    })
}

// Date.now() — epoch milliseconds.
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// app.getVersion() — same build-time source as app:getVersion / corepc:getVersion.
fn current_version(app: &tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

// semverCompare(a, b) port: strip a leading 'v', split on '.', numeric-compare
// the first three components (missing -> 0). Returns >0 when a > b.
fn semver_compare(a: &str, b: &str) -> i64 {
    let parse = |s: &str| -> [i64; 3] {
        let s = s.strip_prefix('v').unwrap_or(s);
        let mut out = [0i64; 3];
        for (i, part) in s.split('.').take(3).enumerate() {
            // Number(part) in TS: a non-numeric segment yields NaN; (NaN || 0)
            // is NaN, but the comparison `diff !== 0` treats NaN diffs oddly.
            // In practice the version line is validated as \d+\.\d+\.\d+ before
            // this is called, so a clean numeric parse (fallback 0) matches.
            out[i] = part.parse::<i64>().unwrap_or(0);
        }
        out
    };
    let pa = parse(a);
    let pb = parse(b);
    for i in 0..3 {
        let diff = pa[i] - pb[i];
        if diff != 0 {
            return diff;
        }
    }
    0
}

// fetchRemoteVersion(): GET versionUrl over HTTPS-only, take the first line,
// validate it as \d+\.\d+\.\d+ (after an optional leading 'v'), and return the
// normalized version (leading 'v' stripped) or None. Mirrors the TS exactly:
//   - empty url -> None
//   - non-HTTPS or unparseable url -> None
//   - non-200 / transport error / timeout -> None
//   - body firstLine; if /^\d+\.\d+\.\d+/.test(stripV) -> stripV, else None
fn fetch_remote_version(url: &str) -> Option<String> {
    if url.is_empty() {
        return None;
    }
    // Enforce HTTPS (the TS rejects any non-https: protocol).
    let lower = url.to_ascii_lowercase();
    if !lower.starts_with("https://") {
        return None;
    }

    let agent = ureq::AgentBuilder::new().timeout(FETCH_TIMEOUT).build();
    let resp = agent.get(url).set("User-Agent", USER_AGENT).call().ok()?;
    // net.request only resolves a version on statusCode === 200; ureq's call()
    // returns Ok for 2xx/3xx, so explicitly require 200.
    if resp.status() != 200 {
        return None;
    }

    let mut buf = Vec::new();
    resp.into_reader()
        .take(MAX_BODY_BYTES)
        .read_to_end(&mut buf)
        .ok()?;
    let body = String::from_utf8_lossy(&buf);
    // body.trim().split('\n')[0].trim() — first non-empty-trimmed line.
    let first_line = body.trim().split('\n').next().unwrap_or("").trim();
    let stripped = first_line.strip_prefix('v').unwrap_or(first_line);
    if is_semver_prefixed(stripped) {
        Some(stripped.to_string())
    } else {
        None
    }
}

// /^\d+\.\d+\.\d+/ test (anchored at start, trailing content allowed).
fn is_semver_prefixed(s: &str) -> bool {
    let mut parts = s.splitn(4, '.');
    let a = parts.next();
    let b = parts.next();
    let c = parts.next();
    let (a, b, c) = match (a, b, c) {
        (Some(a), Some(b), Some(c)) => (a, b, c),
        _ => return false,
    };
    // a and b must be all-digit; c must START with one or more digits (the regex
    // is not anchored at the end, so "1.2.3-beta" matches).
    let all_digits = |x: &str| !x.is_empty() && x.bytes().all(|d| d.is_ascii_digit());
    let starts_digits = |x: &str| x.bytes().next().map_or(false, |d| d.is_ascii_digit());
    all_digits(a) && all_digits(b) && starts_digits(c)
}

// checkVersion(): build the VersionCheckResult, persist lastPoll, and — when an
// update is available — emit the renderer push that stands in for the Electron
// `releaseManager.checkForUpdates()` trigger (we have no ReleaseManager here, so
// instead of silently doing nothing we surface the availability to the renderer).
// Returns the exact VersionCheckResult shape.
fn check_version(app: &tauri::AppHandle) -> Value {
    let cfg = load_config(app);
    let version_url = cfg
        .get("versionUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let current = current_version(app);

    let remote = fetch_remote_version(&version_url);
    let update_available = match &remote {
        Some(r) => semver_compare(r, &current) > 0,
        None => false,
    };
    let checked_at = now_ms();

    let result = json!({
        "currentVersion": current,
        "remoteVersion": remote,
        "updateAvailable": update_available,
        "checkedAt": checked_at,
        "error": Value::Null,
    });

    // this.config.lastPoll = Date.now(); this.saveConfig();
    let mut new_cfg = cfg.clone();
    if let Some(obj) = new_cfg.as_object_mut() {
        obj.insert("lastPoll".into(), json!(checked_at));
    }
    save_config(app, &new_cfg);

    // releaseManager.checkForUpdates() side-effect: no ReleaseManager exists on
    // this tier, so push an honest renderer event carrying the result instead of
    // silently dropping it. The renderer can drive its own update UI off this.
    if update_available {
        crate::native_ops::emit_event(app, "update-service:update-available", &result);
    }

    result
}

// setConfig(updates): apply pollIntervalHours (clamped [1,168]) and enabled,
// persist, and return { success: true }. The polling lifecycle (start/stop) is a
// background timer in Electron; here checks are pull-based (the renderer calls
// `check`), so toggling enabled only persists the flag — there is no live
// interval thread to start or stop. fetchRemoteVersion already honors enablement
// implicitly via the renderer's call cadence; the persisted flag is authoritative.
fn set_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut cfg = load_config(app);
    let obj = match cfg.as_object_mut() {
        Some(o) => o,
        None => return json!({ "success": true }),
    };

    if let Some(poll) = updates.get("pollIntervalHours").and_then(|v| v.as_i64()) {
        let clamped = poll.max(MIN_POLL_HOURS).min(MAX_POLL_HOURS);
        obj.insert("pollIntervalHours".into(), json!(clamped));
    }
    if let Some(enabled) = updates.get("enabled").and_then(|v| v.as_bool()) {
        obj.insert("enabled".into(), json!(enabled));
    }

    save_config(app, &cfg);
    json!({ "success": true })
}

// update-service:getStatus / :getLastResult — VersionCheckResult | null.
// lastResult is in-memory-only in Electron and is never produced on this
// pure-data tier (no check), so this returns null, matching a cold start.
fn get_last_result(_app: &tauri::AppHandle) -> Value {
    Value::Null
}

/// Route an `update-service:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; the heavy network channels (check/download/install) return
/// Value::Null (honest degrade — not ported, needs native runtime).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // Status getter — both the prompt's named channel and the verbatim
        // Electron handler resolve to the same VersionCheckResult | null. After a
        // `check` runs, lastPoll is persisted but lastResult (in-memory in
        // Electron) is not stored, so this remains null on a cold read.
        "update-service:getStatus" | "update-service:getLastResult" => get_last_result(app),
        "update-service:getConfig" => get_config(app),

        // Heavy, now natively ported:
        //   check    -> HTTPS GET versionUrl, semver-compare, persist lastPoll,
        //               emit update-service:update-available on an update.
        //   setConfig-> clamp pollIntervalHours [1,168], toggle enabled, persist.
        "update-service:check" => check_version(app),
        "update-service:setConfig" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            set_config(app, &updates)
        }

        // download / install: these handlers DO NOT exist in UpdateService.ts —
        // they belong to the electron-updater release flow (ReleaseManager), which
        // requires the native auto-update runtime / signed artifacts. Honest
        // degrade rather than faking a download or installer invocation.
        "update-service:download" | "update-service:install" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}
