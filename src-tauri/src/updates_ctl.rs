// =============================================================================
// DEX Tauri — Updates subsystem (data/read surface of the `updates:*` IPC tier).
//
// NAMING / SOURCE-OF-TRUTH NOTE (read first):
//   The task named UpdateController.ts + electron-store key "updates" + a data
//   channel `updates:getAvailable`. In the live repo that controller is FULLY
//   DEPRECATED — it throws in its constructor and registers no IPC. The real
//   `updates:*` handlers live in src/main/core/ReleaseManager.ts, and there is
//   NO `updates:getAvailable` channel anywhere in the codebase (preload, no
//   renderer caller, no handler). The renderer reads "what update is available"
//   via `updates:getInfo` (UpdateManagerSection in Settings.tsx). So porting a
//   literal `getAvailable` would mean inventing a shape, which the rules forbid.
//
//   Storage is NOT electron-store either: ReleaseManager persists with raw
//   fs.writeFileSync to `<userData>/update-config.json` — a FLAT JSON object
//   (no top-level key wrapper). We mirror that exact file name + flat shape
//   under <appData>.
//
// WHAT IS PORTED (the genuinely data-pure reads, all backed by update-config.json):
//   - updates:getInfo        -> the getInfo() object (see ReleaseManager.getInfo)
//   - updates:getPreferences -> getPreferences() projection of the config
//   - update:getConfig       -> the full UpdateConfig (the `update:` sibling read
//                               the preload's updates.getConfig() invokes)
//
// HEAVY / NATIVE channels NOT ported (electron-updater network + quitAndInstall +
// dialogs + app.relaunch — none are pure data and must not be faked):
//   updates:check, updates:download, updates:install, updates:skip,
//   updates:remindLater, updates:downgrade, updates:openReleaseNotes,
//   updates:pruneCache, updates:setPreferences (writes that drive native policy),
//   updates:getChangelog / getReleaseNotesForVersion (read live status / on-disk
//   CHANGELOG.md, not persisted store data).
//
// DIVERGENCES (documented):
//   - currentVersion: Electron uses app.getVersion() (the running app's version).
//     Tauri exposes that via tauri::AppHandle::package_info().version; we emit it
//     as a string to match the Electron field exactly.
//   - latestVersion / releaseNotes / updateAvailable / isDownloading /
//     downloadProgress: in Electron these reflect the LIVE in-memory `status`
//     populated by electron-updater events. With no native updater running, no
//     check has happened, so these are their fresh-status defaults
//     (updateAvailable=false, isDownloading=false, downloadProgress=0,
//     latestVersion/releaseNotes absent/undefined). This matches what the
//     renderer sees on a cold start before any check resolves.
//   - updateServerUrl: read from <appData>/update-server.json (same file name as
//     Electron's UPDATE_SERVER_CONFIG_FILE); "" when absent. We do NOT create the
//     file on read (Electron created it lazily in loadUpdateServerUrl; that is a
//     native-side bootstrap, not part of the read shape).
//   - autoDownload/autoInstall are pinned to the current policy defaults on load,
//     exactly as ReleaseManager.loadConfig() does (persisted values are stale).
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const CONFIG_FILE: &str = "update-config.json";
const UPDATE_SERVER_CONFIG_FILE: &str = "update-server.json";
const INSTALL_HISTORY_FILE: &str = "update-install-history.json";

// DEFAULT_CONFIG (ReleaseManager.ts). autoDownload/autoInstall are policy-pinned.
const DEFAULT_AUTO_CHECK: bool = true;
const DEFAULT_AUTO_DOWNLOAD: bool = true;
const DEFAULT_AUTO_INSTALL: bool = true;
const DEFAULT_CHECK_INTERVAL: i64 = 4;
const DEFAULT_CHANNEL: &str = "stable";

// downgradeWindow.ts policy constants (ported verbatim).
const DOWNGRADE_WINDOW_DAYS: i64 = 30;
const DOWNGRADE_WINDOW_MS: i64 = DOWNGRADE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const MAX_DOWNGRADE_TARGETS: usize = 2;
const MAX_INSTALL_HISTORY: usize = MAX_DOWNGRADE_TARGETS + 1; // current + 2 prior

const RELEASES_URL: &str = "https://github.com/onazioj179-lab/Dex/releases";

// --- file IO ----------------------------------------------------------------

fn data_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(data_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Mirrors ReleaseManager.saveConfig(): raw fs.writeFileSync of a flat object,
// pretty-printed with 2-space indentation. Best-effort; failures are swallowed
// exactly as the TS logs-and-continues path does.
fn write_json(app: &tauri::AppHandle, name: &str, value: &Value) {
    if let Ok(raw) = serde_json::to_string_pretty(value) {
        let _ = std::fs::write(data_path(app, name), raw);
    }
}

// epoch millis (Date.now() parity).
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn current_version(app: &tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

// Open a URL with the OS default handler (shell.openExternal parity). Uses
// `cmd /c start` on Windows with the console window hidden (precedent: power.rs
// `run` / os_lock), falling back to xdg-open / open elsewhere. Returns whether
// the spawn was accepted by the OS.
fn open_external(url: &str) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // The empty "" is the (ignored) window-title arg `start` consumes first.
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .spawn()
            .is_ok()
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url).spawn().is_ok()
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(url).spawn().is_ok()
    }
}

// ReleaseManager.loadConfig(): DEFAULT_CONFIG spread over persisted JSON, then
// autoDownload/autoInstall force-pinned to the current policy defaults. Returns
// a UpdateConfig with every field present (flat object).
fn load_config(app: &tauri::AppHandle) -> Value {
    let raw = read_json(app, CONFIG_FILE);
    let g = |k: &str| raw.get(k);

    let auto_check = g("autoCheck").and_then(|v| v.as_bool()).unwrap_or(DEFAULT_AUTO_CHECK);
    let check_interval = g("checkInterval").and_then(|v| v.as_i64()).unwrap_or(DEFAULT_CHECK_INTERVAL);
    let last_check = g("lastCheck").and_then(|v| v.as_i64()).unwrap_or(0);
    let skip_version = g("skipVersion").cloned().unwrap_or(Value::Null);
    // skipVersion is string | null; coerce any non-string to null to match the type.
    let skip_version = if skip_version.is_string() { skip_version } else { Value::Null };
    let channel = g("channel").and_then(|v| v.as_str()).unwrap_or(DEFAULT_CHANNEL).to_string();
    let remind_later_until = g("remindLaterUntil").and_then(|v| v.as_i64()).unwrap_or(0);

    json!({
        "autoCheck": auto_check,
        "autoDownload": DEFAULT_AUTO_DOWNLOAD, // policy-pinned (see loadConfig)
        "autoInstall": DEFAULT_AUTO_INSTALL,   // policy-pinned (see loadConfig)
        "checkInterval": check_interval,
        "lastCheck": last_check,
        "skipVersion": skip_version,
        "channel": channel,
        "remindLaterUntil": remind_later_until,
    })
}

// loadUpdateServerUrl(): parsed.url || "" — read-only; we do not write the file.
fn update_server_url(app: &tauri::AppHandle) -> String {
    read_json(app, UPDATE_SERVER_CONFIG_FILE)
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

// ReleaseManager.getInfo(). status fields are at their cold/fresh defaults
// (no native updater has run) — see header divergence note.
fn get_info(app: &tauri::AppHandle) -> Value {
    let cfg = load_config(app);
    json!({
        "currentVersion": current_version(app),
        "updateAvailable": false,
        // latestVersion / releaseNotes are status.updateInfo?.x in Electron:
        // undefined with no available update. Omit them to mirror `undefined`.
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

// --- install history (downgrade eligibility) --------------------------------

// loadInstallHistory(): read the array, then apply pruneInstallHistory policy.
// Returns an oldest-first Vec of records {version, fromVersion, installedAt}.
fn load_install_history(app: &tauri::AppHandle) -> Vec<Value> {
    let raw = read_json(app, INSTALL_HISTORY_FILE);
    let arr = raw.as_array().cloned().unwrap_or_default();
    prune_install_history(arr, now_ms())
}

// saveInstallHistory(): prune, then persist the last MAX_INSTALL_HISTORY entries.
fn save_install_history(app: &tauri::AppHandle, history: &[Value]) {
    let pruned = prune_install_history(history.to_vec(), now_ms());
    let start = pruned.len().saturating_sub(MAX_INSTALL_HISTORY);
    let tail: Vec<Value> = pruned[start..].to_vec();
    write_json(app, INSTALL_HISTORY_FILE, &Value::Array(tail));
}

fn rec_version(r: &Value) -> Option<&str> {
    r.get("version").and_then(|v| v.as_str())
}
fn rec_installed_at(r: &Value) -> i64 {
    r.get("installedAt").and_then(|v| v.as_i64()).unwrap_or(0)
}

// pruneInstallHistory() port: filter invalid, sort oldest-first; if the window
// for the current (newest) record has elapsed, keep only that record; else cap
// to MAX_INSTALL_HISTORY newest entries.
fn prune_install_history(history: Vec<Value>, now: i64) -> Vec<Value> {
    let mut sorted: Vec<Value> = history
        .into_iter()
        .filter(|r| {
            r.get("version").and_then(|v| v.as_str()).is_some()
                && r.get("installedAt").and_then(|v| v.as_i64()).is_some()
        })
        .collect();
    if sorted.is_empty() {
        return vec![];
    }
    sorted.sort_by_key(rec_installed_at);

    let current = sorted.last().cloned().unwrap();
    if now - rec_installed_at(&current) > DOWNGRADE_WINDOW_MS {
        return vec![current];
    }
    if sorted.len() > MAX_INSTALL_HISTORY {
        let start = sorted.len() - MAX_INSTALL_HISTORY;
        return sorted[start..].to_vec();
    }
    sorted
}

// recordCurrentVersionIfNew(): if the newest record is not the running version,
// append a new install record and persist. Returns the (possibly updated) list.
fn record_current_version_if_new(app: &tauri::AppHandle) -> Vec<Value> {
    let mut history = load_install_history(app);
    let current = current_version(app);
    let last_version = history.last().and_then(|r| rec_version(r).map(|s| s.to_string()));
    if last_version.as_deref() == Some(current.as_str()) {
        return history;
    }
    let from = last_version.map(Value::from).unwrap_or(Value::Null);
    history.push(json!({
        "version": current,
        "fromVersion": from,
        "installedAt": now_ms(),
    }));
    save_install_history(app, &history);
    // Reload so callers see the persisted/pruned shape.
    load_install_history(app)
}

// collectTargetVersions() port: walk history newest->oldest, skip the current
// record, dedupe, cap at MAX_DOWNGRADE_TARGETS; legacy fromVersion fallback.
fn collect_target_versions(current: &Value, history: &[Value]) -> Vec<String> {
    let cur_ver = rec_version(current).unwrap_or("").to_string();
    let cur_at = rec_installed_at(current);
    let mut seen: Vec<String> = vec![cur_ver.clone()];
    let mut targets: Vec<String> = vec![];

    for r in history.iter().rev() {
        if targets.len() >= MAX_DOWNGRADE_TARGETS {
            break;
        }
        let v = match rec_version(r) {
            Some(v) if !v.is_empty() => v.to_string(),
            _ => continue,
        };
        if rec_installed_at(r) > cur_at {
            continue;
        }
        if v == cur_ver || seen.contains(&v) {
            continue;
        }
        seen.push(v.clone());
        targets.push(v);
    }

    if targets.is_empty() {
        if let Some(fv) = current.get("fromVersion").and_then(|v| v.as_str()) {
            if !fv.is_empty() && fv != cur_ver {
                targets.push(fv.to_string());
            }
        }
    }
    targets
}

// License tier — Electron's getLicenseTier() reads licensingManager and returns
// 'free' on ANY error. The tier lives in dex.db (rusqlite), which is out of this
// module's allowed-crate set and unreachable without a Connection from main.rs.
// We therefore mirror the catch-fallback and return "free"; the downgrade math
// itself is fully real (see degraded note).
fn license_tier(_app: &tauri::AppHandle) -> &'static str {
    "free"
}

// computeDowngradeEligibility() port.
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
    let primary = target_versions.first().cloned();

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

    let elapsed = (now - rec_installed_at(install_record)).max(0);
    let remaining_ms = DOWNGRADE_WINDOW_MS - elapsed;
    let day_ms = 24 * 60 * 60 * 1000;
    // Math.ceil(remainingMs / dayMs), clamped at 0.
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
        format!("v{}", primary.clone().unwrap_or_default())
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
    let history = record_current_version_if_new(app);
    let current = history.last();
    compute_downgrade_eligibility(current, license_tier(app), now_ms(), &history)
}

// downgrade() port. The native install-data rollback (createBackup/restore) is
// NOT performed here — that is the heavy backup subsystem. We honor the
// eligibility gate + target validation and open the GitHub release page (the
// user-facing step), matching the success/error shape. With tier defaulting to
// "free" this returns the ineligible shape unless a real tier read is wired.
fn downgrade(app: &tauri::AppHandle, target_version: Option<&str>) -> Value {
    let eligibility = can_downgrade(app);
    if !eligibility.get("eligible").and_then(|v| v.as_bool()).unwrap_or(false) {
        let reason = eligibility.get("reason").cloned().unwrap_or(Value::Null);
        return json!({ "success": false, "eligibility": eligibility, "error": reason });
    }

    let allowed: Vec<String> = eligibility
        .get("targetVersions")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let mut target = eligibility
        .get("targetVersion")
        .and_then(|v| v.as_str())
        .map(String::from);

    if let Some(req) = target_version {
        if !allowed.iter().any(|v| v == req) {
            let list = if allowed.is_empty() {
                "none".to_string()
            } else {
                allowed.iter().map(|v| format!("v{}", v)).collect::<Vec<_>>().join(", ")
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

    let url = match &target {
        Some(t) => format!("https://github.com/onazioj179-lab/Dex/releases/tag/v{}", t),
        None => RELEASES_URL.to_string(),
    };
    open_external(&url);
    json!({ "success": true, "eligibility": eligibility })
}

// --- changelog / release notes ----------------------------------------------

// getReleaseNotesForVersion() port. Electron reads
// <resourcesPath>/CHANGELOG.md; Tauri's bundled-resource analog is the resource
// dir. Section parsing matches the TS: collect lines under the matching
// `# x.y.z` heading until the next version heading.
fn release_notes_for_version(app: &tauri::AppHandle, version: &str) -> Value {
    let fallback = json!({
        "version": version,
        "notes": "Release notes unavailable for this version.",
    });

    // Resolve CHANGELOG.md from the bundled resource dir; fall back to the
    // exe-relative dir if resource resolution is unavailable.
    let mut path: Option<PathBuf> = app
        .path()
        .resource_dir()
        .ok()
        .map(|d| d.join("CHANGELOG.md"))
        .filter(|p| p.exists());
    if path.is_none() {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let cand = dir.join("CHANGELOG.md");
                if cand.exists() {
                    path = Some(cand);
                }
            }
        }
    }

    let text = match path.and_then(|p| std::fs::read_to_string(p).ok()) {
        Some(t) => t,
        None => return fallback,
    };

    let mut collecting = false;
    let mut collected: Vec<String> = vec![];
    for line in text.lines() {
        let normalized = line.trim();
        if is_version_heading(normalized) {
            if collecting {
                break;
            }
            collecting = normalized.contains(version);
            continue;
        }
        if collecting && !normalized.is_empty() {
            collected.push(strip_bullet(normalized).to_string());
        }
    }

    let notes = if collected.is_empty() {
        "Release notes unavailable for this version.".to_string()
    } else {
        collected.join("\n")
    };
    json!({ "version": version, "notes": notes })
}

// Match `^#+\s*\d+\.\d+\.\d+` (a markdown heading whose text starts with x.y.z).
fn is_version_heading(s: &str) -> bool {
    let rest = s.trim_start_matches('#');
    if rest.len() == s.len() {
        return false; // no leading '#'
    }
    let rest = rest.trim_start();
    let mut parts = rest.splitn(4, '.');
    let (a, b, c) = (parts.next(), parts.next(), parts.next());
    match (a, b, c) {
        (Some(a), Some(b), Some(c)) => {
            !a.is_empty()
                && a.chars().all(|ch| ch.is_ascii_digit())
                && !b.is_empty()
                && b.chars().all(|ch| ch.is_ascii_digit())
                && c.chars().take_while(|ch| ch.is_ascii_digit()).count() > 0
        }
        _ => false,
    }
}

// Strip a leading markdown bullet ("- " or "* "), matching /^[-*]\s*/.
fn strip_bullet(s: &str) -> &str {
    if let Some(rest) = s.strip_prefix('-').or_else(|| s.strip_prefix('*')) {
        rest.trim_start()
    } else {
        s
    }
}

// getChangelog() port. With no live updater status, status.updateInfo is absent,
// so releaseNotes falls back to 'No changelog available' — exactly the cold shape.
fn get_changelog(app: &tauri::AppHandle) -> Value {
    json!({
        "currentVersion": current_version(app),
        "changelog": "No changelog available",
    })
}

// --- cache prune ------------------------------------------------------------

// pruneCache() port. Walk <temp>/dex-cache, delete files older than maxAgeMs,
// remove now-empty dirs, return {freedBytes, removed}. No "protected artifact"
// is tracked here (no live download state in this read surface).
fn prune_cache(max_age_ms: i64) -> Value {
    let cache_path = std::env::temp_dir().join("dex-cache");
    if !cache_path.exists() {
        return json!({ "freedBytes": 0, "removed": 0 });
    }
    let cutoff = now_ms() - max_age_ms;
    let mut freed: i64 = 0;
    let mut removed: i64 = 0;
    walk_prune(&cache_path, cutoff, &mut freed, &mut removed);
    json!({ "freedBytes": freed, "removed": removed })
}

fn walk_prune(dir: &Path, cutoff: i64, freed: &mut i64, removed: &mut i64) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let full = entry.path();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            walk_prune(&full, cutoff, freed, removed);
            // Remove now-empty directories.
            if std::fs::read_dir(&full).map(|mut d| d.next().is_none()).unwrap_or(false) {
                let _ = std::fs::remove_dir(&full);
            }
            continue;
        }
        if !ft.is_file() {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(i64::MAX);
            if mtime_ms < cutoff {
                let size = meta.len() as i64;
                if std::fs::remove_file(&full).is_ok() {
                    *freed += size;
                    *removed += 1;
                }
            }
        }
    }
}

// --- mutations: setPreferences / skip / remindLater -------------------------

// setPreferences() port: merge the four user-facing prefs into config, persist,
// return {success: true}. autoDownload/autoInstall/channel/remindLaterUntil are
// carried through from the loaded config (policy-pinned where applicable).
fn set_preferences(app: &tauri::AppHandle, prefs: &Value) -> Value {
    let cfg = load_config(app);
    let get_cfg_bool = |k: &str, d: bool| cfg.get(k).and_then(|v| v.as_bool()).unwrap_or(d);
    let get_cfg_i64 = |k: &str, d: i64| cfg.get(k).and_then(|v| v.as_i64()).unwrap_or(d);

    let auto_check = prefs
        .get("autoCheck")
        .and_then(|v| v.as_bool())
        .unwrap_or_else(|| get_cfg_bool("autoCheck", DEFAULT_AUTO_CHECK));
    let check_interval = prefs
        .get("checkInterval")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| get_cfg_i64("checkInterval", DEFAULT_CHECK_INTERVAL));
    // skippedVersion: string | null. Honor an explicit value (incl. null) only
    // when the key is present; otherwise keep the existing skipVersion.
    let skip_version = match prefs.get("skippedVersion") {
        Some(Value::String(s)) => Value::String(s.clone()),
        Some(Value::Null) => Value::Null,
        _ => cfg.get("skipVersion").cloned().unwrap_or(Value::Null),
    };

    let merged = json!({
        "autoCheck": auto_check,
        "autoDownload": DEFAULT_AUTO_DOWNLOAD,
        "autoInstall": DEFAULT_AUTO_INSTALL,
        "checkInterval": check_interval,
        "lastCheck": get_cfg_i64("lastCheck", 0),
        "skipVersion": skip_version,
        "channel": cfg.get("channel").and_then(|v| v.as_str()).unwrap_or(DEFAULT_CHANNEL),
        "remindLaterUntil": get_cfg_i64("remindLaterUntil", 0),
    });
    write_json(app, CONFIG_FILE, &merged);
    json!({ "success": true })
}

// skipVersion() port: set skipVersion, persist, emit update:skipped. Returns
// {success: true} (the updates:skip handler shape). No-op if no target known.
fn skip_version(app: &tauri::AppHandle, version: Option<&str>) -> Value {
    // status.updateInfo is unavailable (cold), so a target must be supplied.
    if let Some(v) = version {
        let mut cfg = load_config(app);
        if let Some(obj) = cfg.as_object_mut() {
            obj.insert("skipVersion".to_string(), Value::String(v.to_string()));
        }
        write_json(app, CONFIG_FILE, &cfg);
        crate::native_ops::emit_event(app, "update:skipped", &Value::Null);
    }
    json!({ "success": true })
}

// remindMeLater() port: set remindLaterUntil = now + hours*3600_000, persist,
// emit update:remind-later. Returns {success: true}.
fn remind_later(app: &tauri::AppHandle, hours: i64) -> Value {
    let until = now_ms() + hours * 60 * 60 * 1000;
    let mut cfg = load_config(app);
    if let Some(obj) = cfg.as_object_mut() {
        obj.insert("remindLaterUntil".to_string(), json!(until));
    }
    write_json(app, CONFIG_FILE, &cfg);
    crate::native_ops::emit_event(app, "update:remind-later", &json!({ "until": until }));
    json!({ "success": true })
}

// openReleaseNotes() port: open the releases page, return {success, url}.
fn open_release_notes() -> Value {
    let ok = open_external(RELEASES_URL);
    json!({ "success": ok, "url": RELEASES_URL })
}

/// Route an `updates:*` (and the sibling `update:getConfig`) channel. Args are
/// the positional JSON array the renderer sent (see tauriCompat.ts).
///
/// Data-pure reads PLUS the natively-feasible heavy channels are served here:
/// config/prefs mutations (fs writes), skip/remindLater (writes + renderer
/// events), install-history + downgrade-window math, CHANGELOG.md parsing,
/// cache pruning, and opening release notes in the OS browser.
///
/// The genuinely-native updater channels (check/download/install/getAvailable)
/// require electron-updater's network feed + quitAndInstall + signed-artifact
/// verification — there is no native updater runtime here, so they return an
/// honest failure shape rather than fabricated status.
///
/// NOTE: this dispatch is still NOT safe to blanket-route by
/// `channel.starts_with("updates:")` — the caller routes the specific channels
/// below (prefixRouteSafe = false).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg0 = args.get(0);
    let arg0_str = arg0.and_then(|v| v.as_str());

    match channel {
        // --- data-pure reads (unchanged) ---
        "updates:getInfo" => get_info(app),
        "updates:getPreferences" => get_preferences(app),
        "update:getConfig" => load_config(app),

        // --- mutations (real fs writes + renderer events) ---
        "updates:setPreferences" => set_preferences(app, arg0.unwrap_or(&Value::Null)),
        "updates:skip" => skip_version(app, arg0_str),
        "updates:remindLater" => {
            let hours = arg0.and_then(|v| v.as_i64()).unwrap_or(24);
            remind_later(app, hours)
        }

        // --- downgrade / install history (real native math + state) ---
        "updates:getInstallHistory" => Value::Array(record_current_version_if_new(app)),
        "updates:canDowngrade" => can_downgrade(app),
        "updates:downgrade" => downgrade(app, arg0_str),

        // --- changelog / release notes (real CHANGELOG.md read) ---
        "updates:getChangelog" => get_changelog(app),
        "updates:getReleaseNotesForVersion" => {
            release_notes_for_version(app, arg0_str.unwrap_or(""))
        }
        "updates:openReleaseNotes" => open_release_notes(),

        // --- cache reclaim (real temp walk + delete) ---
        "updates:pruneCache" => {
            // ReleaseManager default: 3 days. Allow an override (ms) via arg0.
            let max_age = arg0.and_then(|v| v.as_i64()).unwrap_or(3 * 24 * 60 * 60 * 1000);
            prune_cache(max_age)
        }

        // --- NOT PORTED: need a native updater runtime (electron-updater) ---
        // check/download/install drive the network feed, signed-artifact
        // verification, dialogs, and quitAndInstall — none can be honestly
        // emulated from this read surface. getAvailable does not exist anywhere
        // in the source (see header) and has no defined shape.
        "updates:check" | "updates:download" | "updates:install" | "updates:getAvailable" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}
