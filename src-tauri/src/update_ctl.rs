// =============================================================================
// DEX Tauri — Update subsystem (port of core/ReleaseManager.ts).
//
// SCOPE: this module now serves the full `update:*` / `updates:*` surface that
// ReleaseManager.ts wired in setupIPC(), backed by REAL native code wherever the
// behavior does not require the live electron-updater runtime:
//
//   READ / CONFIG (real, file-backed exactly like ReleaseManager):
//     update:getStatus            -> getStatus()        (cold UpdateStatus)
//     update:getConfig            -> getConfig()        (full UpdateConfig)
//     update:updateConfig         -> updateConfig(...)  (merge + persist)
//     updates:getInfo             -> getInfo()
//     updates:getPreferences      -> getPreferences()
//     updates:setPreferences      -> setPreferences(...)
//
//   STATE MUTATIONS (real, persist to update-config.json + history file):
//     update:skip / updates:skip          -> skipVersion()
//     updates:remindLater                 -> remindMeLater()
//     update:getHistory                   -> getHistory()
//     updates:getRollbackHistory          -> history filtered to event=="restored"
//
//   BACKUP / RECOVERY (real, fs copy/remove under <appData>):
//     update:listBackups   update:restore   update:rollback   update:deleteBackup
//
//   RELEASE NOTES / CHANGELOG (real):
//     updates:openReleaseNotes            -> open the GitHub releases page
//     updates:getChangelog                -> from cold status (release notes)
//     updates:getReleaseNotesForVersion   -> parse bundled CHANGELOG.md
//
//   DOWNGRADE WINDOW (real, ports shared/update/downgradeWindow.ts math):
//     updates:canDowngrade   updates:downgrade   updates:getInstallHistory
//
//   CACHE RECLAIM (real, walks <temp>/dex-cache):
//     updates:pruneCache
//
// HEAVY / NATIVE-RUNTIME channels that genuinely CANNOT be done here (they need
// electron-updater's network feed against the GitHub provider, the in-flight
// download stream, and autoUpdater.quitAndInstall to swap the OS binary). These
// degrade honestly — { success:false, error:"not ported (needs native runtime)" }
// for the `updates:*` object channels, and the cold default for the `update:*`
// siblings so getStatus stays consistent:
//     update:check / updates:check, update:download / updates:download,
//     update:install / updates:install
//
// STORAGE (mirrors ReleaseManager's raw fs files, under <appData> = the Tauri
// analog of userData):
//   - update-config.json          : flat UpdateConfig object (no key wrapper)
//   - update-server.json          : { url }
//   - update-install-history.json : InstallRecord[] (downgrade eligibility)
//   - update-history.json         : event log (see HISTORY note)
//   - backups/backup-<ts>/        : backup directories
//
// HISTORY note (documented divergence): ReleaseManager keeps `this.history` in
// memory only (lost on quit). A stateless Tauri dispatch cannot reproduce a live
// in-process array, so to make getHistory / getRollbackHistory genuinely return
// the events the mutating channels record (skip / restored / downgrade /
// cache-pruned), history is persisted to update-history.json (newest-first, cap
// 100 — same cap as recordHistory). The shapes and event names are identical.
//
// VERSION: app.getVersion() -> app.package_info().version (house pattern).
// timestamps: SystemTime epoch millis. ids: crate::util::pseudo_uuid_v4().
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

const CONFIG_FILE: &str = "update-config.json";
const UPDATE_SERVER_CONFIG_FILE: &str = "update-server.json";
const INSTALL_HISTORY_FILE: &str = "update-install-history.json";
const HISTORY_FILE: &str = "update-history.json";
const BACKUP_DIR: &str = "backups";

// DEFAULT_CONFIG (ReleaseManager.ts). autoDownload/autoInstall are policy-pinned.
const DEFAULT_AUTO_CHECK: bool = true;
const DEFAULT_AUTO_DOWNLOAD: bool = true;
const DEFAULT_AUTO_INSTALL: bool = true;
const DEFAULT_CHECK_INTERVAL: i64 = 4;
const DEFAULT_CHANNEL: &str = "stable";

// Downgrade-window policy (shared/update/downgradeWindow.ts).
const DOWNGRADE_WINDOW_DAYS: i64 = 30;
const DOWNGRADE_WINDOW_MS: i64 = DOWNGRADE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const MAX_DOWNGRADE_TARGETS: usize = 2;
const MAX_INSTALL_HISTORY: usize = MAX_DOWNGRADE_TARGETS + 1;

const RELEASES_URL: &str = "https://github.com/onazioj179-lab/Dex/releases";

const NOT_PORTED: &str = "not ported (needs native runtime)";

// --- time / version ---------------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn current_version(app: &tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

// --- file IO (same shape as ReleaseManager raw fs writes) -------------------

fn data_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn backup_root(app: &tauri::AppHandle) -> PathBuf {
    data_path(app, BACKUP_DIR)
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(data_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_json(app: &tauri::AppHandle, name: &str, value: &Value) -> bool {
    match serde_json::to_string_pretty(value) {
        Ok(s) => std::fs::write(data_path(app, name), s).is_ok(),
        Err(_) => false,
    }
}

// --- config -----------------------------------------------------------------

// ReleaseManager.loadConfig(): DEFAULT_CONFIG spread over persisted JSON, then
// autoDownload/autoInstall force-pinned to the current policy defaults. Returns
// a full UpdateConfig (flat object, every field present).
fn load_config(app: &tauri::AppHandle) -> Value {
    let raw = read_json(app, CONFIG_FILE);
    let g = |k: &str| raw.get(k);

    let auto_check = g("autoCheck").and_then(|v| v.as_bool()).unwrap_or(DEFAULT_AUTO_CHECK);
    let check_interval = g("checkInterval").and_then(|v| v.as_i64()).unwrap_or(DEFAULT_CHECK_INTERVAL);
    let last_check = g("lastCheck").and_then(|v| v.as_i64()).unwrap_or(0);
    // skipVersion is string | null; coerce any non-string to null.
    let skip_version = match g("skipVersion") {
        Some(Value::String(s)) => json!(s),
        _ => Value::Null,
    };
    let channel = match g("channel").and_then(|v| v.as_str()) {
        Some("beta") => "beta",
        _ => DEFAULT_CHANNEL,
    };
    let remind_later_until = g("remindLaterUntil").and_then(|v| v.as_i64()).unwrap_or(0);

    json!({
        "autoCheck": auto_check,
        "autoDownload": DEFAULT_AUTO_DOWNLOAD, // policy-pinned (loadConfig)
        "autoInstall": DEFAULT_AUTO_INSTALL,   // policy-pinned (loadConfig)
        "checkInterval": check_interval,
        "lastCheck": last_check,
        "skipVersion": skip_version,
        "channel": channel,
        "remindLaterUntil": remind_later_until,
    })
}

fn save_config(app: &tauri::AppHandle, cfg: &Value) -> bool {
    write_json(app, CONFIG_FILE, cfg)
}

// ReleaseManager.updateConfig(): { ...config, ...updates } then persist. Only
// the known UpdateConfig keys are merged so the persisted shape stays clean.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut cfg = load_config(app);
    if let (Some(obj), Some(ups)) = (cfg.as_object_mut(), updates.as_object()) {
        for key in [
            "autoCheck",
            "autoDownload",
            "autoInstall",
            "checkInterval",
            "lastCheck",
            "skipVersion",
            "channel",
            "remindLaterUntil",
        ] {
            if let Some(v) = ups.get(key) {
                obj.insert(key.to_string(), v.clone());
            }
        }
    }
    save_config(app, &cfg);
    // Re-load so policy pins (autoDownload/autoInstall) and coercions reapply,
    // matching getConfig() after updateConfig().
    load_config(app)
}

// loadUpdateServerUrl(): parsed.url || "" — read-only; we do not write the file.
fn update_server_url(app: &tauri::AppHandle) -> String {
    read_json(app, UPDATE_SERVER_CONFIG_FILE)
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

// --- status -----------------------------------------------------------------

// The cold (boot-state) UpdateStatus. With no live updater running, every field
// is at its fresh default — this is exactly what ReleaseManager returns before a
// check resolves, and the only state a stateless dispatch can faithfully report.
fn default_status() -> Value {
    json!({
        "checking": false,
        "available": false,
        "downloading": false,
        "downloaded": false,
        "progress": 0,
        "error": Value::Null,
        "updateInfo": Value::Null,
    })
}

// ReleaseManager.getInfo(). status fields are at cold defaults (no live updater).
fn get_info(app: &tauri::AppHandle) -> Value {
    let cfg = load_config(app);
    json!({
        "currentVersion": current_version(app),
        "updateAvailable": false,
        // latestVersion / releaseNotes are status.updateInfo?.x in Electron:
        // undefined with no available update -> omitted to mirror `undefined`.
        "lastCheck": cfg.get("lastCheck").cloned().unwrap_or(json!(0)),
        "skippedVersion": cfg.get("skipVersion").cloned().unwrap_or(Value::Null),
        "isDownloading": false,
        "downloadProgress": 0,
        "remindLaterUntil": cfg.get("remindLaterUntil").and_then(|v| v.as_i64()).unwrap_or(0),
        "updateServerUrl": update_server_url(app),
    })
}

// ReleaseManager.getPreferences().
fn get_preferences(app: &tauri::AppHandle) -> Value {
    let cfg = load_config(app);
    json!({
        "autoCheck": cfg.get("autoCheck").and_then(|v| v.as_bool()).unwrap_or(DEFAULT_AUTO_CHECK),
        "checkInterval": cfg.get("checkInterval").and_then(|v| v.as_i64()).unwrap_or(DEFAULT_CHECK_INTERVAL),
        "lastCheck": cfg.get("lastCheck").and_then(|v| v.as_i64()).unwrap_or(0),
        "skippedVersion": cfg.get("skipVersion").cloned().unwrap_or(Value::Null),
        "showChangelog": true,
    })
}

// ReleaseManager.setPreferences(): merge the four user-facing prefs and persist,
// returning { success:true }. skippedVersion maps to config.skipVersion.
fn set_preferences(app: &tauri::AppHandle, prefs: &Value) -> Value {
    let cur = load_config(app);
    let mut updates = serde_json::Map::new();
    if let Some(v) = prefs.get("autoCheck") {
        updates.insert("autoCheck".into(), v.clone());
    }
    if let Some(v) = prefs.get("checkInterval") {
        updates.insert("checkInterval".into(), v.clone());
    }
    // setPreferences uses `prefs.skippedVersion ?? config.skipVersion`; only
    // override when the caller actually supplied it.
    if let Some(v) = prefs.get("skippedVersion") {
        updates.insert("skipVersion".into(), v.clone());
    } else {
        updates.insert(
            "skipVersion".into(),
            cur.get("skipVersion").cloned().unwrap_or(Value::Null),
        );
    }
    update_config(app, &Value::Object(updates));
    json!({ "success": true })
}

// --- history (persisted; see header HISTORY note) ---------------------------

fn load_history(app: &tauri::AppHandle) -> Vec<Value> {
    match read_json(app, HISTORY_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

// recordHistory(event, data): unshift { timestamp, event, data } then cap to 100.
fn record_history(app: &tauri::AppHandle, event: &str, data: Value) {
    let mut hist = load_history(app);
    let mut entry = serde_json::Map::new();
    entry.insert("timestamp".into(), json!(now_ms()));
    entry.insert("event".into(), json!(event));
    if !data.is_null() {
        entry.insert("data".into(), data);
    }
    hist.insert(0, Value::Object(entry));
    hist.truncate(100);
    write_json(app, HISTORY_FILE, &Value::Array(hist));
}

fn get_history(app: &tauri::AppHandle) -> Value {
    Value::Array(load_history(app))
}

// updates:getRollbackHistory -> history filtered to event === "restored".
fn get_rollback_history(app: &tauri::AppHandle) -> Value {
    let filtered: Vec<Value> = load_history(app)
        .into_iter()
        .filter(|e| e.get("event").and_then(|v| v.as_str()) == Some("restored"))
        .collect();
    Value::Array(filtered)
}

// --- skip / remind ----------------------------------------------------------

// skipVersion(version?): with no live updateInfo we can only skip an explicit
// version (status.updateInfo?.version is null at cold state). Persists skipVersion
// + records history. Returns void (Value::Null) for update:skip; the updates:skip
// wrapper adds { success:true }.
fn skip_version(app: &tauri::AppHandle, version: Option<&str>) -> bool {
    let target = match version {
        Some(v) if !v.is_empty() => v.to_string(),
        _ => return false, // no live updateInfo to fall back to in cold state
    };
    let mut updates = serde_json::Map::new();
    updates.insert("skipVersion".into(), json!(target));
    update_config(app, &Value::Object(updates));
    record_history(app, "skipped", json!({ "version": target }));
    true
}

// remindMeLater(hours=24): persist remindLaterUntil + emit update:remind-later.
fn remind_later(app: &tauri::AppHandle, hours: i64) {
    let until = now_ms() + hours * 60 * 60 * 1000;
    let mut updates = serde_json::Map::new();
    updates.insert("remindLaterUntil".into(), json!(until));
    update_config(app, &Value::Object(updates));
    crate::native_ops::emit_event(app, "update:remind-later", &json!({ "until": until }));
}

// --- backups ----------------------------------------------------------------

// listBackups(): readdir backups/, keep names starting with "backup-", sort desc.
fn list_backups(app: &tauri::AppHandle) -> Vec<String> {
    let root = backup_root(app);
    let mut names: Vec<String> = match std::fs::read_dir(&root) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n.starts_with("backup-"))
            .collect(),
        Err(_) => Vec::new(),
    };
    names.sort();
    names.reverse();
    names
}

// resolveBackupDir(ref): absolute path passes through; else join under backups/.
fn resolve_backup_dir(app: &tauri::AppHandle, backup_ref: &str) -> PathBuf {
    let p = Path::new(backup_ref);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        backup_root(app).join(backup_ref)
    }
}

// restoreFromBackup(dir): copy every (top-level) file from the backup dir back
// into <appData>; records "restored" history. Returns bool.
fn restore_from_backup(app: &tauri::AppHandle, backup_dir: &Path) -> bool {
    let dest_root = app
        .dex_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let entries = match std::fs::read_dir(backup_dir) {
        Ok(rd) => rd,
        Err(_) => return false,
    };
    let mut ok = true;
    for entry in entries.filter_map(|e| e.ok()) {
        let src = entry.path();
        if !src.is_file() {
            continue;
        }
        if let Some(name) = src.file_name() {
            let dst = dest_root.join(name);
            if std::fs::copy(&src, &dst).is_err() {
                ok = false;
            }
        }
    }
    if ok {
        record_history(
            app,
            "restored",
            json!({ "backupDir": backup_dir.to_string_lossy() }),
        );
    }
    ok
}

// rollback(ref?): restore the named backup, or the newest one when omitted.
fn rollback(app: &tauri::AppHandle, backup_ref: Option<&str>) -> bool {
    let target = match backup_ref {
        Some(r) if !r.is_empty() => r.to_string(),
        _ => match list_backups(app).into_iter().next() {
            Some(first) => first,
            None => return false,
        },
    };
    let dir = resolve_backup_dir(app, &target);
    restore_from_backup(app, &dir)
}

// deleteBackup(ref): rm -rf the backup dir; records history. Returns bool.
fn delete_backup(app: &tauri::AppHandle, backup_ref: &str) -> bool {
    let dir = resolve_backup_dir(app, backup_ref);
    if !dir.exists() {
        return false;
    }
    match std::fs::remove_dir_all(&dir) {
        Ok(()) => {
            record_history(app, "backup-deleted", json!({ "backupRef": backup_ref }));
            true
        }
        Err(_) => false,
    }
}

// --- release notes / changelog ----------------------------------------------

// openReleaseNotes(): open the GitHub releases page with the OS default handler
// (Electron shell.openExternal -> here open::that, same as shell:openExternal).
fn open_release_notes() -> Value {
    let _ = open::that(RELEASES_URL);
    json!({ "success": true, "url": RELEASES_URL })
}

// getChangelog(): { currentVersion, changelog }. With no live updateInfo the
// release notes are absent, so changelog is the cold fallback string.
fn get_changelog(app: &tauri::AppHandle) -> Value {
    json!({
        "currentVersion": current_version(app),
        "changelog": "No changelog available",
    })
}

// getReleaseNotesForVersion(version): parse the bundled CHANGELOG.md, collecting
// the lines under the matching `#+ X.Y.Z` heading until the next version heading.
// Electron read process.resourcesPath/CHANGELOG.md; the Tauri resource dir is the
// faithful analog. Falls back to the repo-root CHANGELOG.md when bundled is absent.
fn get_release_notes_for_version(app: &tauri::AppHandle, version: &str) -> Value {
    let fallback = || {
        json!({
            "version": version,
            "notes": "Release notes unavailable for this version.",
        })
    };

    // Candidate locations: bundled resource dir, then app dir (dev), then cwd.
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("CHANGELOG.md"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("CHANGELOG.md"));
        candidates.push(cwd.join("docs").join("CHANGELOG.md"));
    }

    let text = candidates
        .into_iter()
        .find_map(|p| std::fs::read_to_string(p).ok());
    let text = match text {
        Some(t) => t,
        None => return fallback(),
    };

    // Mirror the Electron parser: a heading matches /^#+\s*\d+\.\d+\.\d+/.
    let is_version_heading = |line: &str| -> bool {
        let l = line.trim_start();
        if !l.starts_with('#') {
            return false;
        }
        let after = l.trim_start_matches('#').trim_start();
        // require digit . digit . digit at the start of the remainder
        // (mirrors the Electron regex /^#+\s*\d+\.\d+\.\d+/).
        let mut parts = after.splitn(3, '.');
        let starts_digit = |s: &str| s.chars().next().map_or(false, |ch| ch.is_ascii_digit());
        let a = parts.next().unwrap_or("");
        let b = parts.next().unwrap_or("");
        let c = parts.next().unwrap_or("");
        starts_digit(a) && starts_digit(b) && starts_digit(c)
    };

    let mut collecting = false;
    let mut collected: Vec<String> = Vec::new();
    for raw in text.lines() {
        let normalized = raw.trim();
        if is_version_heading(normalized) {
            if collecting {
                break;
            }
            collecting = normalized.contains(version);
            continue;
        }
        if collecting && !normalized.is_empty() {
            // strip a leading list marker ("- " / "* ")
            let cleaned = normalized
                .strip_prefix("- ")
                .or_else(|| normalized.strip_prefix("* "))
                .unwrap_or(normalized);
            collected.push(cleaned.to_string());
        }
    }

    let notes = if collected.is_empty() {
        "Release notes unavailable for this version.".to_string()
    } else {
        collected.join("\n")
    };
    json!({ "version": version, "notes": notes })
}

// --- install history + downgrade window -------------------------------------

// pruneInstallHistory (shared/update/downgradeWindow.ts): filter valid records,
// sort oldest-first; if the current install's window has elapsed keep only the
// current record; else cap to MAX_INSTALL_HISTORY (newest wins).
fn prune_install_history(history: Vec<Value>) -> Vec<Value> {
    let mut sorted: Vec<Value> = history
        .into_iter()
        .filter(|r| {
            r.get("version").and_then(|v| v.as_str()).is_some()
                && r.get("installedAt").and_then(|v| v.as_i64()).is_some()
        })
        .collect();
    if sorted.is_empty() {
        return sorted;
    }
    sorted.sort_by_key(|r| r.get("installedAt").and_then(|v| v.as_i64()).unwrap_or(0));

    let current = sorted.last().cloned().unwrap();
    let current_installed = current
        .get("installedAt")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    if now_ms() - current_installed > DOWNGRADE_WINDOW_MS {
        return vec![current];
    }
    if sorted.len() > MAX_INSTALL_HISTORY {
        let start = sorted.len() - MAX_INSTALL_HISTORY;
        return sorted.split_off(start);
    }
    sorted
}

fn load_install_history(app: &tauri::AppHandle) -> Vec<Value> {
    let raw = match read_json(app, INSTALL_HISTORY_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    };
    prune_install_history(raw)
}

fn current_install_record(app: &tauri::AppHandle) -> Option<Value> {
    load_install_history(app).into_iter().last()
}

fn get_install_history(app: &tauri::AppHandle) -> Value {
    Value::Array(load_install_history(app))
}

// collectTargetVersions (downgradeWindow.ts): walk history newest->oldest, skip
// the current record + dups + future entries, take up to MAX_DOWNGRADE_TARGETS.
// Legacy fallback: when none collected, use current.fromVersion.
fn collect_target_versions(current: &Value, history: &[Value]) -> Vec<String> {
    let cur_version = current.get("version").and_then(|v| v.as_str()).unwrap_or("");
    let cur_installed = current
        .get("installedAt")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let mut seen: Vec<String> = vec![cur_version.to_string()];
    let mut targets: Vec<String> = Vec::new();

    for record in history.iter().rev() {
        if targets.len() >= MAX_DOWNGRADE_TARGETS {
            break;
        }
        let v = match record.get("version").and_then(|v| v.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        let installed = record
            .get("installedAt")
            .and_then(|x| x.as_i64())
            .unwrap_or(0);
        if installed > cur_installed {
            continue; // ignore future entries
        }
        if v == cur_version {
            continue;
        }
        if seen.contains(&v) {
            continue;
        }
        seen.push(v.clone());
        targets.push(v);
    }

    if targets.is_empty() {
        if let Some(from) = current.get("fromVersion").and_then(|v| v.as_str()) {
            if !from.is_empty() && from != cur_version {
                targets.push(from.to_string());
            }
        }
    }
    targets
}

// License tier: licensingManager.getCurrentTier() is a native-ML/licensing
// subsystem not reachable from this dispatch. ReleaseManager defaults to 'free'
// on any failure, so cold-state we report 'free' (the safe default — downgrade
// is gated behind Pro and must never be granted by accident).
fn license_tier() -> &'static str {
    "free"
}

// computeDowngradeEligibility (downgradeWindow.ts) ported verbatim.
fn compute_downgrade_eligibility(
    install_record: Option<&Value>,
    tier: &str,
    now: i64,
    history: &[Value],
) -> Value {
    let install_record = match install_record {
        Some(r) => r,
        None => {
            return json!({
                "eligible": false,
                "daysRemaining": 0,
                "targetVersion": Value::Null,
                "targetVersions": [],
                "reason": "No previous version recorded for this install.",
            });
        }
    };

    let target_versions = collect_target_versions(install_record, history);
    let primary: Value = target_versions
        .first()
        .map(|s| json!(s))
        .unwrap_or(Value::Null);

    if target_versions.is_empty() {
        return json!({
            "eligible": false,
            "daysRemaining": 0,
            "targetVersion": Value::Null,
            "targetVersions": [],
            "reason": "No previous version recorded for this install.",
        });
    }

    if tier == "free" {
        return json!({
            "eligible": false,
            "daysRemaining": 0,
            "targetVersion": primary,
            "targetVersions": target_versions,
            "reason": "Downgrade is a Pro feature. Upgrade to roll back to a previous version.",
        });
    }

    let installed_at = install_record
        .get("installedAt")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let elapsed = (now - installed_at).max(0);
    let remaining_ms = DOWNGRADE_WINDOW_MS - elapsed;
    let day_ms = 24 * 60 * 60 * 1000;
    // Math.ceil(remainingMs / dayMs), floored at 0.
    let days_remaining = if remaining_ms <= 0 {
        0
    } else {
        (remaining_ms + day_ms - 1) / day_ms
    };

    if remaining_ms <= 0 {
        return json!({
            "eligible": false,
            "daysRemaining": 0,
            "targetVersion": primary,
            "targetVersions": target_versions,
            "reason": format!(
                "Downgrade window expired. You had {} days from install to roll back.",
                DOWNGRADE_WINDOW_DAYS
            ),
        });
    }

    let version_label = if target_versions.len() > 1 {
        format!("one of {} prior versions", target_versions.len())
    } else {
        format!("v{}", target_versions[0])
    };
    let plural = if days_remaining == 1 { "" } else { "s" };

    json!({
        "eligible": true,
        "daysRemaining": days_remaining,
        "targetVersion": primary,
        "targetVersions": target_versions,
        "reason": format!(
            "{} day{} remaining to downgrade to {}.",
            days_remaining, plural, version_label
        ),
    })
}

fn can_downgrade(app: &tauri::AppHandle) -> Value {
    let history = load_install_history(app);
    let current = current_install_record(app);
    compute_downgrade_eligibility(current.as_ref(), license_tier(), now_ms(), &history)
}

// downgrade(target?): validate eligibility + requested target, restore the most
// recent backup, open the matching releases tag, record history. Mirrors
// ReleaseManager.downgrade exactly. The binary is NOT swapped (Electron does not
// either — it only rolls back user data and points the user at the installer).
fn downgrade(app: &tauri::AppHandle, target_version: Option<&str>) -> Value {
    let eligibility = can_downgrade(app);
    let eligible = eligibility
        .get("eligible")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !eligible {
        let reason = eligibility
            .get("reason")
            .cloned()
            .unwrap_or(Value::Null);
        return json!({ "success": false, "eligibility": eligibility, "error": reason });
    }

    // Resolve / validate the requested target against the allowed list.
    let allowed: Vec<String> = eligibility
        .get("targetVersions")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let mut target: Option<String> = eligibility
        .get("targetVersion")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if let Some(req) = target_version {
        if !req.is_empty() {
            if !allowed.iter().any(|v| v == req) {
                let list = if allowed.is_empty() {
                    "none".to_string()
                } else {
                    allowed
                        .iter()
                        .map(|v| format!("v{}", v))
                        .collect::<Vec<_>>()
                        .join(", ")
                };
                return json!({
                    "success": false,
                    "eligibility": eligibility,
                    "error": format!(
                        "Version v{} is not within the allowed downgrade window. Choose one of: {}.",
                        req, list
                    ),
                });
            }
            target = Some(req.to_string());
        }
    }

    // Restore the most recent backup (best-effort, matches Electron's flow).
    let backups = list_backups(app);
    let latest_backup = backups.first().cloned();
    if let Some(ref name) = latest_backup {
        let dir = resolve_backup_dir(app, name);
        if !restore_from_backup(app, &dir) {
            return json!({
                "success": false,
                "eligibility": eligibility,
                "error": "Backup restore failed.",
            });
        }
    }

    // Open the releases page (tag-specific when we have a target).
    let url = match &target {
        Some(t) => format!("{}/tag/v{}", RELEASES_URL, t),
        None => RELEASES_URL.to_string(),
    };
    let _ = open::that(&url);

    record_history(
        app,
        "downgrade-initiated",
        json!({ "targetVersion": target, "restoredBackup": latest_backup }),
    );

    let mut out = serde_json::Map::new();
    out.insert("success".into(), json!(true));
    out.insert("eligibility".into(), eligibility);
    if let Some(name) = latest_backup {
        out.insert("restoredBackup".into(), json!(name));
    }
    Value::Object(out)
}

// --- cache reclaim ----------------------------------------------------------

// pruneCache(maxAgeMs = 3 days): walk <temp>/dex-cache; delete files older than
// the cutoff, then remove now-empty dirs. Returns { freedBytes, removed }.
fn prune_cache(max_age_ms: i64) -> Value {
    let cache_path = std::env::temp_dir().join("dex-cache");
    if !cache_path.exists() {
        return json!({ "freedBytes": 0, "removed": 0 });
    }
    let cutoff = now_ms() - max_age_ms;
    let mut freed_bytes: i64 = 0;
    let mut removed: i64 = 0;
    walk_prune(&cache_path, cutoff, &mut freed_bytes, &mut removed);
    json!({ "freedBytes": freed_bytes, "removed": removed })
}

fn walk_prune(dir: &Path, cutoff: i64, freed_bytes: &mut i64, removed: &mut i64) {
    let entries = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let full = entry.path();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            walk_prune(&full, cutoff, freed_bytes, removed);
            // Remove now-empty directories.
            if let Ok(mut rd) = std::fs::read_dir(&full) {
                if rd.next().is_none() {
                    let _ = std::fs::remove_dir(&full);
                }
            }
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            if mtime_ms < cutoff {
                let size = meta.len() as i64;
                if std::fs::remove_file(&full).is_ok() {
                    *freed_bytes += size;
                    *removed += 1;
                }
            }
        }
    }
}

/// Route the `update:*` / `updates:*` channels. Args are the positional JSON
/// array the renderer sent (see tauriCompat.ts). Heavy network/install channels
/// degrade honestly; everything else is backed by real native code.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    let a0_str = || a0.as_str().map(|s| s.to_string());

    match channel {
        // --- read / config -------------------------------------------------
        "update:getStatus" => default_status(),
        "update:getConfig" => load_config(app),
        "update:updateConfig" => update_config(app, &a0),
        "updates:getInfo" => get_info(app),
        "updates:getPreferences" => get_preferences(app),
        "updates:setPreferences" => set_preferences(app, &a0),

        // --- history -------------------------------------------------------
        "update:getHistory" => get_history(app),
        "updates:getRollbackHistory" => get_rollback_history(app),

        // --- skip / remind -------------------------------------------------
        "update:skip" => {
            // returns void (Value::Null) like ipcMain skipVersion handler
            let _ = skip_version(app, a0_str().as_deref());
            Value::Null
        }
        "updates:skip" => {
            let _ = skip_version(app, a0_str().as_deref());
            json!({ "success": true })
        }
        "updates:remindLater" => {
            let hours = a0.as_i64().unwrap_or(24);
            remind_later(app, hours);
            json!({ "success": true })
        }

        // --- backups -------------------------------------------------------
        "update:listBackups" => json!(list_backups(app)),
        "update:restore" => {
            // restore(backupDir): the renderer passes an explicit dir/ref.
            match a0_str() {
                Some(dir) if !dir.is_empty() => {
                    json!(restore_from_backup(app, &resolve_backup_dir(app, &dir)))
                }
                _ => json!(false),
            }
        }
        "update:rollback" => json!(rollback(app, a0_str().as_deref())),
        "update:deleteBackup" => match a0_str() {
            Some(r) if !r.is_empty() => json!(delete_backup(app, &r)),
            _ => json!(false),
        },

        // --- release notes / changelog ------------------------------------
        "updates:openReleaseNotes" => open_release_notes(),
        "updates:getChangelog" => get_changelog(app),
        "updates:getReleaseNotesForVersion" => {
            let version = a0_str().unwrap_or_default();
            get_release_notes_for_version(app, &version)
        }

        // --- downgrade window ---------------------------------------------
        "updates:canDowngrade" => can_downgrade(app),
        "updates:downgrade" => downgrade(app, a0_str().as_deref()),
        "updates:getInstallHistory" => get_install_history(app),

        // --- cache reclaim -------------------------------------------------
        "updates:pruneCache" => {
            let default_max = 3 * 24 * 60 * 60 * 1000;
            let max_age = a0.as_i64().unwrap_or(default_max);
            prune_cache(max_age)
        }

        // --- HEAVY: electron-updater runtime required (degrade honestly) ---
        // The `update:*` siblings are void/status-shaped in Electron; returning
        // the cold default keeps getStatus consistent. The `updates:*` wrappers
        // are object-shaped -> { success:false, error }.
        "update:check" => default_status(),
        "update:download" => json!(false),
        "update:install" => Value::Null,
        "updates:check" => json!({
            "success": false,
            "updateAvailable": false,
            "info": Value::Null,
            "error": NOT_PORTED,
        }),
        "updates:download" | "updates:install" => {
            json!({ "success": false, "error": NOT_PORTED })
        }

        _ => Value::Null,
    }
}
