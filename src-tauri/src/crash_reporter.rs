// =============================================================================
// DEX Tauri — Crash Reporter subsystem (port of core/CrashReporter.ts).
//
// Pure-data, JSON-backed READ tier. Electron persisted crashes as a RAW JSON
// ARRAY (no electron-store, no top-level key wrapper) written with
// fs.writeFileSync to `<userData>/crash-log.json`; this mirrors that file under
// <appData>/crash-log.json and reads the SAME flat-array shape.
//
// Only the two data-read channels are ported, at the EXACT Electron return
// shapes so the renderer is unchanged:
//   - crash-reporter:getRecent(limit?) -> CrashRecord[]   (last `limit||20`)
//   - crash-reporter:getStats()        -> CrashStats      (see shape below)
//
// CrashRecord: { id, timestamp, type, version, platform, arch, uptime,
//                message, stack? }   (records are read verbatim from disk)
// CrashStats:  { totalCrashes, crashesThisSession, crashesSinceUpdate,
//                lastCrash, recentCrashes: CrashRecord[], rollbackRecommended }
//
// DIVERGENCES (documented):
//   - FILE NAME: the task brief hinted `crash-reports.json`, but the Electron
//     constant is `CRASH_LOG_FILE = 'crash-log.json'` (CrashReporter.ts:46).
//     The real file name wins so existing on-disk logs are read; we use
//     `crash-log.json`.
//   - SESSION STATE: `crashesThisSession` and the constructor's `startTime`
//     live only in the long-lived Electron singleton. A stateless dispatch has
//     no session counter, so `crashesThisSession` is reported as 0. (Recording
//     crashes — which is what increments it — is a heavy/native channel that is
//     intentionally NOT ported here, so 0 is the faithful read-only value.)
//   - VERSION: `crashesSinceUpdate` / `rollbackRecommended` compare each record's
//     stored `version` against the running app version. Electron used
//     app.getVersion(); we use tauri's app.package_info().version (same source:
//     the bundle/package version).
//   - LOAD TRIM: Electron slices the loaded array to the last MAX_STORED_CRASHES
//     (200). We mirror that on read so totals match a freshly-loaded singleton.
//
// WRITE tier (now ported natively):
//   - crash-reporter:reportRendererError(data) -> { recorded: true }
//       records a 'renderer' crash: builds the CrashRecord, appends to the same
//       flat-array crash-log.json (trimmed to MAX_STORED_CRASHES), and pushes
//       'crash-reporter:new-crash' to the renderer (Electron webContents.send).
//   - crash-reporter:clear() -> { success: true }
//       empties the log (writes []), mirroring this.crashes=[] + saveCrashLog().
//
// DEGRADED (cannot be ported, not faked):
//   - crash-reporter:upload — no Electron handler exists; the native reporter is
//     local-only (submitURL='', uploadToServer:false). There is no remote target
//     to upload to, so it returns { success:false, error:"not ported ..." }.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const CRASH_LOG_FILE: &str = "crash-log.json";
const MAX_STORED_CRASHES: usize = 200;
const ROLLBACK_THRESHOLD: i64 = 5; // crashes since update triggers rollback suggestion
const RECENT_WINDOW_MS: i64 = 24 * 60 * 60 * 1000; // 24 hours

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(CRASH_LOG_FILE)
}

// Mirror loadCrashLog(): raw JSON array; non-array / empty / parse-fail -> [];
// then slice to the last MAX_STORED_CRASHES.
fn load_crashes(app: &tauri::AppHandle) -> Vec<Value> {
    let raw = match std::fs::read_to_string(store_path(app)) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    if raw.trim().is_empty() {
        return Vec::new();
    }
    let mut crashes = match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Array(a)) => a,
        _ => return Vec::new(),
    };
    if crashes.len() > MAX_STORED_CRASHES {
        crashes = crashes.split_off(crashes.len() - MAX_STORED_CRASHES);
    }
    crashes
}

fn current_version(app: &tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

// process.platform values (macos -> "darwin", windows -> "win32").
fn node_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

// process.arch values (x86_64 -> "x64", aarch64 -> "arm64", x86 -> "ia32").
fn node_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "ia32",
        "aarch64" => "arm64",
        other => other,
    }
}

// Mirror saveCrashLog(): trim to the last MAX_STORED_CRASHES, write pretty JSON.
fn save_crashes(app: &tauri::AppHandle, crashes: &[Value]) {
    let start = crashes.len().saturating_sub(MAX_STORED_CRASHES);
    let trimmed = &crashes[start..];
    if let Ok(serialized) = serde_json::to_string_pretty(trimmed) {
        let _ = crate::write_atomic(store_path(app), serialized);
    }
}

// Mirror recordCrash(): build the record, append, persist, push to the renderer.
// `uptime` in Electron was `(Date.now() - startTime) / 1000` (process uptime in
// seconds); a stateless dispatch has no session anchor, so we use host uptime
// (sysinfo::System::uptime, seconds since boot) as the faithful analog.
fn record_crash(
    app: &tauri::AppHandle,
    crash_type: &str,
    message: &str,
    stack: Option<&str>,
) -> Value {
    // id: Electron used `crash-<ts>-<rand6>`; pseudo_uuid_v4 is the crate-standard
    // id source and is at least as unique. Keep the `crash-` prefix for parity.
    let id = format!("crash-{}", crate::util::pseudo_uuid_v4());

    // message truncated to 500 chars, stack to 2000 (char-safe to avoid splitting
    // a multibyte boundary, unlike JS's UTF-16 .slice).
    let message_trunc: String = message.chars().take(500).collect();
    let stack_val = match stack {
        Some(s) if !s.is_empty() => {
            let t: String = s.chars().take(2000).collect();
            Value::String(t)
        }
        _ => Value::Null,
    };

    let record = json!({
        "id": id,
        "timestamp": now_ms(),
        "type": crash_type,
        "version": current_version(app),
        "platform": node_platform(),
        "arch": node_arch(),
        "uptime": sysinfo::System::uptime() as i64,
        "message": message_trunc,
        "stack": stack_val,
    });

    let mut crashes = load_crashes(app);
    crashes.push(record.clone());
    save_crashes(app, &crashes);

    // Electron: win.webContents.send('crash-reporter:new-crash', record).
    crate::native_ops::emit_event(app, "crash-reporter:new-crash", &record);

    record
}

fn timestamp(r: &Value) -> i64 {
    r.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0)
}

// crash-reporter:getRecent — this.crashes.slice(-(limit || 20)).
fn get_recent(app: &tauri::AppHandle, limit: Option<i64>) -> Value {
    let crashes = load_crashes(app);
    // `limit || 20`: 0 / absent fall back to 20 (mirrors JS falsy default).
    let n = match limit {
        Some(l) if l != 0 => l,
        _ => 20,
    };
    if n <= 0 {
        return json!([]);
    }
    let n = n as usize;
    let start = crashes.len().saturating_sub(n);
    json!(crashes[start..].to_vec())
}

// crash-reporter:getStats — see CrashStats shape.
fn get_stats(app: &tauri::AppHandle) -> Value {
    let crashes = load_crashes(app);
    let now = now_ms();
    let recent_cutoff = now - RECENT_WINDOW_MS;
    let version = current_version(app);

    let recent: Vec<Value> = crashes
        .iter()
        .filter(|c| timestamp(c) > recent_cutoff)
        .cloned()
        .collect();
    let crashes_since_update = crashes
        .iter()
        .filter(|c| c.get("version").and_then(|v| v.as_str()) == Some(version.as_str()))
        .count() as i64;

    // This process started `elapsed` ago (the startup timeline is anchored in main()).
    let session_start = now - crate::startup_timeline::anchor().elapsed().as_millis() as i64;
    let crashes_this_session = crashes.iter().filter(|c| timestamp(c) >= session_start).count() as i64;

    let last_crash = if crashes.is_empty() {
        0
    } else {
        timestamp(&crashes[crashes.len() - 1])
    };

    // recentCrashes.slice(-10)
    let recent_tail: Vec<Value> = {
        let start = recent.len().saturating_sub(10);
        recent[start..].to_vec()
    };

    json!({
        "totalCrashes": crashes.len(),
        // Session-only counter is unavailable in a stateless dispatch (see header).
        "crashesThisSession": crashes_this_session,
        "crashesSinceUpdate": crashes_since_update,
        "lastCrash": last_crash,
        "recentCrashes": recent_tail,
        "rollbackRecommended": crashes_since_update >= ROLLBACK_THRESHOLD,
    })
}

/// Route a `crash-reporter:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Heavy/native channels return Value::Null
/// (honest degrade) rather than fabricating a result.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "crash-reporter:getStats" => get_stats(app),
        "crash-reporter:getRecent" => {
            let limit = args.get(0).and_then(|v| v.as_i64());
            get_recent(app, limit)
        }
        // recordCrash('renderer', data.message, data.stack); -> { recorded: true }.
        "crash-reporter:reportRendererError" => {
            let data = args.get(0).cloned().unwrap_or(Value::Null);
            let message = data
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let stack = data.get("stack").and_then(|v| v.as_str());
            record_crash(app, "renderer", &message, stack);
            json!({ "recorded": true })
        }
        // this.crashes = []; saveCrashLog(); -> { success: true }.
        "crash-reporter:clear" => {
            save_crashes(app, &[]);
            json!({ "success": true })
        }
        // `upload` has no Electron handler: the native crashReporter runs with
        // submitURL='' and uploadToServer:false (local-only, by design for
        // privacy). There is nothing to upload to and no remote endpoint exists,
        // so this is honestly degraded rather than faked.
        "crash-reporter:upload" | "upload" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }
        _ => Value::Null,
    }
}
