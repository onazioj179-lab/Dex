// =============================================================================
// DEX 6.0 — Licensing + Telemetry (Tauri port of src/main/core/LicensingManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed licensing, feature-flag, telemetry and crash-report subsystem
//! (licensing:* channels). It reads/writes the same five tables the Electron
//! `LicensingManager` creates (license, telemetry_settings, telemetry_data,
//! crash_reports, telemetry_log) with the identical schema, and returns the
//! identical JSON shapes (camelCase keys, masked license key, etc.).
//!
//! Faithful parity notes:
//!   * The license row + trial bootstrap (loadLicense + checkTrialStatus) is
//!     applied lazily and idempotently at the start of each handler, exactly as
//!     Electron does on init — id=1 is seeded with a 30-day `pro` trial, and an
//!     expired trial with no key is downgraded to `free`.
//!   * Feature flags are derived from FEATURE_FLAGS_CONFIG and the current tier
//!     rank, the same table and ranking the TS uses.
//!   * Machine-id / verification-hash use a self-contained SHA-256 (no crypto
//!     dep) over a host fingerprint, so activate -> verify round-trips. The host
//!     fingerprint string differs from Node's `os.cpus()[0].model` wording, so a
//!     hash captured under Electron won't validate here and vice-versa; within
//!     this backend activate/verify stay consistent (see compute_machine_id).
//!   * Creator override (silent local elevation for the author's machines) is
//!     ported faithfully: env DEX_CREATOR=1 or a username whose salted SHA-256
//!     is in CREATOR_HASHES pins tier to `team`. Never exposed via IPC.
//!
//! Degraded honestly: the telemetry upload timer + crash upload are network /
//! background-timer concerns with no IPC surface, so they are not ported here;
//! `get-last-telemetry` still reads whatever the (timer-driven) telemetry_log
//! holds, returning null when empty — same as Electron before the first flush.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};
use std::time::{SystemTime, UNIX_EPOCH};

// --- Constants (verbatim from LicensingManager.ts) --------------------------

const TRIAL_DURATION_DAYS: i64 = 30;
const TELEMETRY_INTERVAL_MS: i64 = 7 * 24 * 60 * 60 * 1000;

const CREATOR_SALT: &str = "dex-creator-v1";
const CREATOR_HASHES: [&str; 3] = [
    "d992279e9f9134f8ccb97070eacb71284aabdb4bed89d511d89894de3fa0954d",
    "878f055a30a469db51fbef3a2e62029c48b2a73346c747e5d60fd1349ee539a6",
    "22276a01dc8ea18962134470ecb83782506b19c6c3d00afb3de040a51519d39c",
];

/// FEATURE_FLAGS_CONFIG: (feature, minimum tier) — verbatim from the TS map.
const FEATURE_FLAGS_CONFIG: [(&str, &str); 39] = [
    ("notes.basic", "free"),
    ("notes.attachments", "free"),
    ("notes.templates", "free"),
    ("tasks.basic", "free"),
    ("tasks.kanban", "free"),
    ("tasks.kanban.unlimited", "pro"),
    ("media.library", "free"),
    ("media.unlimited_storage", "pro"),
    ("automation.basic", "free"),
    ("automation.unlimited_rules", "pro"),
    ("rewind.basic", "free"),
    ("rewind.full", "pro"),
    ("rift.game", "free"),
    ("vinx.basic", "free"),
    ("vinx.full", "pro"),
    ("multi_window", "pro"),
    ("store.free_items", "free"),
    ("store.paid_items", "pro"),
    ("developer.console", "free"),
    ("developer.extensions", "free"),
    ("early_access", "pro"),
    ("team.collaboration", "team"),
    ("team.admin", "team"),
    ("team.priority_support", "team"),
    ("analytics.basic", "free"),
    ("analytics.advanced", "pro"),
    ("export.basic", "free"),
    ("export.advanced", "pro"),
    ("themes.basic", "free"),
    ("themes.custom", "free"),
    ("search.basic", "free"),
    ("search.advanced", "pro"),
    ("voice.memos", "free"),
    ("voice.transcription", "pro"),
    ("security.encryption", "free"),
    ("security.vault", "free"),
    ("backup.manual", "free"),
    ("backup.automatic", "free"),
    ("import.basic", "free"),
];

/// FREE_LIMITS — verbatim from the TS object.
fn free_limits() -> Value {
    json!({
        "maxStorageBytes": 5i64 * 1024 * 1024 * 1024,
        "maxKanbanBoards": 3,
        "maxAutomationRules": 5,
    })
}

fn tier_rank(tier: &str) -> i64 {
    match tier {
        "free" => 0,
        "pro" => 1,
        "team" => 2,
        _ => 0,
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Create every table this module touches (matches the TS SCHEMA_SQL verbatim).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS license (
            id INTEGER PRIMARY KEY,
            tier TEXT DEFAULT 'free',
            license_key TEXT,
            activated_at INTEGER,
            expires_at INTEGER,
            machine_id TEXT,
            last_verified INTEGER,
            verification_hash TEXT,
            trial_started_at INTEGER,
            trial_expires_at INTEGER,
            failed_verifications INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS telemetry_settings (
            id INTEGER PRIMARY KEY,
            telemetry_enabled INTEGER DEFAULT 0,
            crash_reporting_enabled INTEGER DEFAULT 0,
            prompt_shown INTEGER DEFAULT 0,
            last_sent_at INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS telemetry_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            key TEXT,
            value INTEGER DEFAULT 0,
            period_start INTEGER,
            period_end INTEGER
        );

        CREATE TABLE IF NOT EXISTS crash_reports (
            id TEXT PRIMARY KEY,
            dex_version TEXT,
            os_version TEXT,
            tier TEXT,
            stack_trace TEXT,
            performance_entries TEXT,
            timestamp INTEGER,
            sent INTEGER DEFAULT 0,
            user_approved INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS telemetry_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sent_at INTEGER,
            payload TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_telemetry_data_type_key ON telemetry_data(type, key);
        CREATE INDEX IF NOT EXISTS idx_crash_reports_timestamp ON crash_reports(timestamp);",
    );
    // initializeTelemetry(): seed the singleton settings row.
    let _ = conn.execute(
        "INSERT OR IGNORE INTO telemetry_settings (id) VALUES (1)",
        [],
    );
}

// --- Creator override -------------------------------------------------------

/// Salted SHA-256 of a candidate, matching hashCreatorCandidate in the TS.
fn hash_creator_candidate(value: &str) -> String {
    sha256_hex(format!("{}:{}", CREATOR_SALT, value.to_lowercase().trim()).as_bytes())
}

/// detectCreator(): env DEX_CREATOR=1, or a username whose salted hash matches.
/// `os.userInfo().username` maps to the USERNAME/USER env vars on each platform.
fn detect_creator() -> bool {
    if std::env::var("DEX_CREATOR").ok().as_deref() == Some("1") {
        return true;
    }
    let candidates = [
        std::env::var("USERNAME").unwrap_or_default(),
        std::env::var("USER").unwrap_or_default(),
    ];
    for c in candidates {
        if c.is_empty() {
            continue;
        }
        let h = hash_creator_candidate(&c);
        if CREATOR_HASHES.contains(&h.as_str()) {
            return true;
        }
    }
    false
}

// --- License row (loadLicense + checkTrialStatus) ---------------------------

/// The minimal license fields the handlers need.
struct License {
    tier: String,
    license_key: Option<String>,
    activated_at: Option<i64>,
    expires_at: Option<i64>,
    machine_id: Option<String>,
    verification_hash: Option<String>,
    trial_expires_at: Option<i64>,
}

/// loadLicense(): ensure row id=1 exists (seed a 30-day `pro` trial on first
/// run), then checkTrialStatus(): creator pins to team; an expired trial with no
/// key drops to free. Returns the current license view.
fn load_license(conn: &Connection) -> Option<License> {
    let exists: bool = conn
        .query_row("SELECT 1 FROM license WHERE id = 1", [], |_| Ok(true))
        .optional()
        .unwrap_or(None)
        .unwrap_or(false);
    if !exists {
        let now = now_ms();
        let trial_expires = now + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
        let _ = conn.execute(
            "INSERT INTO license (id, tier, trial_started_at, trial_expires_at, failed_verifications)
             VALUES (1, 'pro', ?, ?, 0)",
            params![now, trial_expires],
        );
    }

    let mut lic = read_license(conn)?;

    // checkTrialStatus()
    if detect_creator() {
        if lic.tier != "team" {
            let _ = conn.execute(
                "UPDATE license SET tier = ?, trial_expires_at = NULL WHERE id = 1",
                params!["team"],
            );
            lic.tier = "team".to_string();
            lic.trial_expires_at = None;
        }
        return Some(lic);
    }
    if lic.license_key.is_some() {
        return Some(lic);
    }
    if let Some(exp) = lic.trial_expires_at {
        if now_ms() > exp {
            let _ = conn.execute("UPDATE license SET tier = ? WHERE id = 1", params!["free"]);
            lic.tier = "free".to_string();
        }
    }
    Some(lic)
}

fn read_license(conn: &Connection) -> Option<License> {
    conn.query_row(
        "SELECT tier, license_key, activated_at, expires_at, machine_id, verification_hash, trial_expires_at
         FROM license WHERE id = 1",
        [],
        |r| {
            Ok(License {
                tier: r.get::<_, Option<String>>(0)?.unwrap_or_else(|| "free".to_string()),
                license_key: r.get(1)?,
                activated_at: r.get(2)?,
                expires_at: r.get(3)?,
                machine_id: r.get(4)?,
                verification_hash: r.get(5)?,
                trial_expires_at: r.get(6)?,
            })
        },
    )
    .optional()
    .unwrap_or(None)
}

// --- Derived getters (mirror the TS instance methods) -----------------------

fn current_tier(conn: &Connection, lic: &License) -> String {
    if detect_creator() {
        return "team".to_string();
    }
    let _ = conn;
    lic.tier.clone()
}

fn is_trial_active(lic: &License) -> bool {
    if detect_creator() {
        return false;
    }
    if lic.license_key.is_some() {
        return false;
    }
    match lic.trial_expires_at {
        Some(exp) => now_ms() < exp,
        None => false,
    }
}

fn trial_days_remaining(lic: &License) -> i64 {
    if detect_creator() {
        return 0;
    }
    if lic.license_key.is_some() {
        return 0;
    }
    match lic.trial_expires_at {
        Some(exp) => {
            let remaining = exp - now_ms();
            let days = (remaining as f64 / (24.0 * 60.0 * 60.0 * 1000.0)).ceil() as i64;
            days.max(0)
        }
        None => 0,
    }
}

/// getLimits(): creator -> null; free tier -> the FREE_LIMITS object; else null.
fn get_limits(conn: &Connection, lic: &License) -> Value {
    if detect_creator() {
        return Value::Null;
    }
    if current_tier(conn, lic) == "free" {
        free_limits()
    } else {
        Value::Null
    }
}

/// buildFeatureFlags() + the get-feature-flags handler: feature -> bool.
fn feature_flags(conn: &Connection, lic: &License) -> Value {
    let current_rank = tier_rank(&current_tier(conn, lic));
    let mut flags = Map::new();
    for (feature, min_tier) in FEATURE_FLAGS_CONFIG.iter() {
        flags.insert(feature.to_string(), json!(current_rank >= tier_rank(min_tier)));
    }
    Value::Object(flags)
}

/// isFeatureEnabled(): creator -> true; unknown feature -> true; else flag value.
fn is_feature_enabled(conn: &Connection, lic: &License, feature: &str) -> bool {
    if detect_creator() {
        return true;
    }
    match FEATURE_FLAGS_CONFIG.iter().find(|(f, _)| *f == feature) {
        Some((_, min_tier)) => tier_rank(&current_tier(conn, lic)) >= tier_rank(min_tier),
        None => true, // undefined -> true (matches the TS)
    }
}

// --- Machine id / verification (self-contained SHA-256, no crypto dep) ------

/// computeMachineId(): SHA-256 of `cpuModel|totalMem|platform`. The host
/// fingerprint differs in wording from Node's os.cpus()[0].model, so the digest
/// won't match a value captured under Electron — but activate/verify use this
/// same function, so they round-trip within this backend.
fn compute_machine_id() -> String {
    let cpu_model = host_cpu_model();
    let total_mem = host_total_mem();
    let platform = std::env::consts::OS;
    sha256_hex(format!("{}|{}|{}", cpu_model, total_mem, platform).as_bytes())
}

fn compute_verification_hash(key: &str, machine_id: &str) -> String {
    sha256_hex(format!("{}:{}", key, machine_id).as_bytes())
}

fn host_cpu_model() -> String {
    let mut sys = sysinfo::System::new();
    sys.refresh_cpu();
    sys.cpus()
        .first()
        .map(|c| c.brand().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn host_total_mem() -> String {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    // sysinfo reports bytes (matching os.totalmem()).
    sys.total_memory().to_string()
}

// --- IPC handlers -----------------------------------------------------------

/// licensing:get-license-info — masked key + computed trial fields + limits.
fn get_license_info(conn: &Connection, lic: &License) -> Value {
    let masked = lic.license_key.as_ref().map(|k| {
        let prefix: String = k.chars().take(5).collect();
        format!("{}-*****-*****-*****-*****", prefix)
    });
    json!({
        "tier": lic.tier,
        "licenseKey": masked,
        "activatedAt": lic.activated_at,
        "expiresAt": lic.expires_at,
        "isTrialActive": is_trial_active(lic),
        "trialDaysRemaining": trial_days_remaining(lic),
        "limits": get_limits(conn, lic),
    })
}

/// activateLicense(key) — validate format, store pro + key + machine fingerprint.
fn activate_license(conn: &Connection, key: &str) -> Value {
    // ^[A-Z0-9]{5}-{4 more groups}$  (5 groups of 5 alnum, dash-separated).
    if !is_valid_key(key) {
        return json!({
            "success": false,
            "error": "Invalid license key format. Expected format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
        });
    }
    let machine_id = compute_machine_id();
    let verification_hash = compute_verification_hash(key, &machine_id);
    let now = now_ms();
    let updated = conn
        .execute(
            "UPDATE license SET
                tier = 'pro',
                license_key = ?,
                activated_at = ?,
                machine_id = ?,
                last_verified = ?,
                verification_hash = ?,
                failed_verifications = 0
             WHERE id = 1",
            params![key, now, machine_id, now, verification_hash],
        )
        .unwrap_or(0);
    if updated == 0 {
        // No license row -> System not initialized (matches the TS guard).
        return json!({ "success": false, "error": "System not initialized" });
    }
    json!({ "success": true })
}

fn is_valid_key(key: &str) -> bool {
    let groups: Vec<&str> = key.split('-').collect();
    if groups.len() != 5 {
        return false;
    }
    groups.iter().all(|g| {
        g.len() == 5 && g.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    })
}

/// deactivateLicense() — reset to free, clear key + machine fingerprint.
fn deactivate_license(conn: &Connection) -> Value {
    let updated = conn
        .execute(
            "UPDATE license SET
                tier = 'free',
                license_key = NULL,
                activated_at = NULL,
                machine_id = NULL,
                last_verified = NULL,
                verification_hash = NULL,
                failed_verifications = 0
             WHERE id = 1",
            [],
        )
        .unwrap_or(0);
    json!(updated > 0)
}

/// verifyLicense() — creator -> valid; else re-derive the hash and compare.
fn verify_license(lic: &License) -> Value {
    if detect_creator() {
        return json!({ "valid": true });
    }
    let (key, hash) = match (
        lic.license_key.as_ref(),
        lic.machine_id.as_ref(),
        lic.verification_hash.as_ref(),
    ) {
        // All three must be present (stored machine id is informational; verify
        // re-derives the current one and compares the hash).
        (Some(k), Some(_m), Some(h)) => (k, h),
        _ => return json!({ "valid": false, "error": "No active license" }),
    };
    let current_machine_id = compute_machine_id();
    let expected = compute_verification_hash(key, &current_machine_id);
    if &expected != hash {
        return json!({ "valid": false, "error": "Machine ID mismatch" });
    }
    json!({ "valid": true })
}

// --- Telemetry settings -----------------------------------------------------

fn settings_int(conn: &Connection, column: &str) -> i64 {
    let sql = format!("SELECT {} FROM telemetry_settings WHERE id = 1", column);
    conn.query_row(&sql, [], |r| r.get::<_, Option<i64>>(0))
        .optional()
        .unwrap_or(None)
        .flatten()
        .unwrap_or(0)
}

/// isTelemetryEnabled(): creator -> false; else the stored flag.
fn is_telemetry_enabled(conn: &Connection) -> bool {
    if detect_creator() {
        return false;
    }
    settings_int(conn, "telemetry_enabled") == 1
}

/// setTelemetryEnabled(enabled): persist the flag and mark the prompt shown.
fn set_telemetry_enabled(conn: &Connection, enabled: bool) -> Value {
    let _ = conn.execute(
        "UPDATE telemetry_settings SET telemetry_enabled = ?, prompt_shown = 1 WHERE id = 1",
        params![if enabled { 1 } else { 0 }],
    );
    // The actual interval timer is a background concern (not ported); the durable
    // flag the renderer relies on is persisted. Electron returns void.
    json!({ "success": true })
}

fn set_crash_reporting_enabled(conn: &Connection, enabled: bool) -> Value {
    let _ = conn.execute(
        "UPDATE telemetry_settings SET crash_reporting_enabled = ? WHERE id = 1",
        params![if enabled { 1 } else { 0 }],
    );
    json!({ "success": true })
}

/// getLastTelemetryPayload(): newest telemetry_log payload, parsed back to JSON.
fn get_last_telemetry(conn: &Connection) -> Value {
    let payload: Option<String> = conn
        .query_row(
            "SELECT payload FROM telemetry_log ORDER BY sent_at DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .unwrap_or(None);
    match payload {
        Some(p) => serde_json::from_str::<Value>(&p).unwrap_or(Value::Null),
        None => Value::Null,
    }
}

// --- Crash reports ----------------------------------------------------------

/// getPendingCrashReport(): newest un-sent, un-approved report (or null).
fn get_pending_crash_report(conn: &Connection) -> Value {
    let row = conn
        .query_row(
            "SELECT id, dex_version, os_version, tier, stack_trace, performance_entries, timestamp
             FROM crash_reports WHERE sent = 0 AND user_approved = 0
             ORDER BY timestamp DESC LIMIT 1",
            [],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<i64>>(6)?,
                ))
            },
        )
        .optional()
        .unwrap_or(None);

    match row {
        None => Value::Null,
        Some((id, ver, os_ver, tier, stack, perf, ts)) => {
            let perf_json: Value = perf
                .as_deref()
                .and_then(|s| serde_json::from_str::<Value>(s).ok())
                .unwrap_or_else(|| json!([]));
            json!({
                "id": id,
                "dex_version": ver,
                "os_version": os_ver,
                "tier": tier,
                "stack_trace": stack,
                "performance_entries": perf_json,
                "timestamp": ts,
                "sent": false,
            })
        }
    }
}

fn approve_crash_report(conn: &Connection, id: &str) -> Value {
    let _ = conn.execute(
        "UPDATE crash_reports SET user_approved = 1, sent = 1 WHERE id = ?",
        params![id],
    );
    json!({ "success": true })
}

fn decline_crash_report(conn: &Connection, id: &str) -> Value {
    let _ = conn.execute("DELETE FROM crash_reports WHERE id = ?", params![id]);
    json!({ "success": true })
}

// --- Dispatch ---------------------------------------------------------------

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let b = |i: usize| args.get(i).and_then(|v| v.as_bool()).unwrap_or(false);

    match channel {
        "licensing:get-tier" => {
            let lic = match load_license(conn) {
                Some(l) => l,
                None => return json!("free"),
            };
            json!(current_tier(conn, &lic))
        }
        "licensing:get-license-info" => match load_license(conn) {
            Some(lic) => get_license_info(conn, &lic),
            None => Value::Null,
        },
        "licensing:activate" => {
            // Ensure the license row exists, then activate (matches init order).
            let _ = load_license(conn);
            activate_license(conn, &s(0))
        }
        "licensing:deactivate" => {
            let _ = load_license(conn);
            deactivate_license(conn)
        }
        "licensing:verify" => match load_license(conn) {
            Some(lic) => verify_license(&lic),
            None => json!({ "valid": false, "error": "No active license" }),
        },
        "licensing:is-feature-enabled" => {
            let lic = match load_license(conn) {
                Some(l) => l,
                None => return json!(true),
            };
            json!(is_feature_enabled(conn, &lic, &s(0)))
        }
        "licensing:get-feature-flags" => match load_license(conn) {
            Some(lic) => feature_flags(conn, &lic),
            None => json!({}),
        },
        "licensing:get-limits" => match load_license(conn) {
            Some(lic) => get_limits(conn, &lic),
            None => Value::Null,
        },

        "licensing:is-telemetry-enabled" => json!(is_telemetry_enabled(conn)),
        "licensing:set-telemetry-enabled" => set_telemetry_enabled(conn, b(0)),
        "licensing:is-crash-reporting-enabled" => {
            json!(settings_int(conn, "crash_reporting_enabled") == 1)
        }
        "licensing:set-crash-reporting-enabled" => set_crash_reporting_enabled(conn, b(0)),
        "licensing:was-telemetry-prompt-shown" => json!(settings_int(conn, "prompt_shown") == 1),
        "licensing:get-last-telemetry" => get_last_telemetry(conn),
        "licensing:get-pending-crash-report" => get_pending_crash_report(conn),
        "licensing:approve-crash-report" => approve_crash_report(conn, &s(0)),
        "licensing:decline-crash-report" => decline_crash_report(conn, &s(0)),

        _ => Value::Null,
    }
}

// keep TELEMETRY_INTERVAL_MS referenced (used by the not-ported upload timer in
// Electron; retained for parity of the constant set, exercised by tests below).
#[allow(dead_code)]
fn telemetry_week_start(now: i64) -> i64 {
    now - (now % TELEMETRY_INTERVAL_MS)
}

// =============================================================================
// Self-contained SHA-256 (FIPS 180-4) — avoids adding a crypto crate just for
// the machine-id / verification / creator hashes. Produces lowercase hex,
// matching Node's crypto.createHash('sha256')...digest('hex').
// =============================================================================

pub(crate) fn sha256_hex(data: &[u8]) -> String {
    let digest = sha256(data);
    let mut out = String::with_capacity(64);
    for byte in digest.iter() {
        out.push_str(&format!("{:02x}", byte));
    }
    out
}

fn sha256(data: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];

    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];

    // Padding.
    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (i, word) in w.iter_mut().enumerate().take(16) {
            *word = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut out = [0u8; 32];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_known_vectors() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_hex(b"The quick brown fox jumps over the lazy dog"),
            "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"
        );
    }

    #[test]
    fn key_validation_matches_regex() {
        assert!(is_valid_key("ABCDE-12345-FGHIJ-67890-KLMNO"));
        assert!(!is_valid_key("abcde-12345-FGHIJ-67890-KLMNO")); // lowercase
        assert!(!is_valid_key("ABCDE-12345-FGHIJ-67890")); // too few groups
        assert!(!is_valid_key("ABCD-12345-FGHIJ-67890-KLMNO")); // short group
    }

    #[test]
    fn week_start_is_interval_aligned() {
        let now = 1_700_000_000_000i64;
        assert_eq!(telemetry_week_start(now) % TELEMETRY_INTERVAL_MS, 0);
    }
}
