// =============================================================================
// DEX Tauri — Games subsystem (port of src/main/services/GamesService.ts).
//
// Two storage models, faithfully mirrored:
//   - The discovered-games *list* in Electron lives in process memory
//     (`cachedGames`), populated by the heavy `games:scan` disk walk. A
//     stateless Tauri dispatch has no in-process cache that survives between
//     IPC calls, so the scan result is persisted to the native KV store under
//     the key "games:cache" (the SAME role `cachedGames` plays in Electron:
//     plan-launch / launch / list all read from it). getGames() returns
//     `cachedGames ? [...] : []` — i.e. [] until a scan has run, which the KV
//     mirror reproduces exactly (key absent -> []).
//   - Playtime *state* is persisted as a plain JSON object (NOT electron-store,
//     NOT key-wrapped) at <userData>/games-playtime.json, written with
//     JSON.stringify(obj, null, 2). The top level IS the
//     Record<gameId, PlaytimeRecord> map. We mirror the same file name under
//     <appData> and the same unwrapped object shape.
//
// CHANNEL MAPPING (logical name -> real GamesService IPC):
//   - data  "list"        -> games:list        -> DiscoveredGame[]               (PORTED, data)
//   - data  "getState"    -> games:playtime    -> Record<gameId, PlaytimeRecord> (PORTED, data)
//   - heavy "scan"        -> games:scan        -> real disk walk {games,errors}  (PORTED, native)
//   - heavy "plan-launch" -> games:plan-launch -> LaunchPlan | null              (PORTED, native)
//   - heavy "launch"      -> games:launch      -> detached child proc {ok,pid}   (PORTED, native)
//
// Return shapes match the Electron handlers exactly so the renderer
// (src/renderer/pages/Games.tsx) is unchanged.
//
// HONEST DIVERGENCES (documented, not silent):
//   - `games:scan` ignores any caller-provided ScanLocations override and uses
//     the OS-default locations (Electron's `defaultLocations()`), matching the
//     real behavior: the renderer never passes a locOverride, and Electron's
//     prefs path was a stub (`// Real impl reads user prefs`).
//   - The `web` source (`__internal:openWebRuntime`) needs a live OS window /
//     BrowserWindow that does not exist in a stateless dispatch (Electron itself
//     left it as `web-runtime-unimplemented`). games:launch for a web game
//     returns { ok:false, error:"web-runtime-unimplemented" } verbatim.
//   - Playtime is recorded by a background thread that waits on the spawned
//     child (parity with Electron's `child.on('exit', ...)`). Storefront
//     launches (Steam/Epic/GOG/itch) hand off to the launcher and the spawned
//     handoff process exits quickly, so recorded duration reflects the handoff,
//     same as Electron — there is no in-game session probe in either runtime.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const PLAYTIME_FILE: &str = "games-playtime.json";
const CACHE_KEY: &str = "games:cache";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn iso_now() -> String {
    // Minimal ISO-8601 UTC timestamp (recordSession only stores it as an opaque
    // string for "last played"). Built without a date crate.
    let ms = now_ms().max(0) as u64;
    let secs = ms / 1000;
    let days = secs / 86_400;
    let tod = secs % 86_400;
    let (hh, mm, ss) = (tod / 3600, (tod % 3600) / 60, tod % 60);
    // Civil date from days since epoch (Howard Hinnant's algorithm).
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y, m, d, hh, mm, ss, ms % 1000
    )
}

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

// --- playtime persistence (bare-object JSON, parity with loadPlaytime/persist) ---

fn load_playtime(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app, PLAYTIME_FILE)) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(v) if v.is_object() => v,
            _ => json!({}),
        },
        Err(_) => json!({}),
    }
}

fn persist_playtime(app: &tauri::AppHandle, map: &Value) {
    if let Ok(s) = serde_json::to_string_pretty(map) {
        let _ = crate::write_atomic(store_path(app, PLAYTIME_FILE), s);
    }
}

// recordSession(prev, gameId, durationSec, endIso) — pure port of launcher.ts.
fn record_session(prev: Option<&Value>, game_id: &str, duration_sec: i64, end_iso: &str) -> Value {
    let dur = duration_sec.max(0);
    match prev {
        None => json!({
            "gameId": game_id,
            "totalSec": dur,
            "lastPlayedIso": end_iso,
            "sessions": 1,
        }),
        Some(p) => {
            let total = p.get("totalSec").and_then(|v| v.as_i64()).unwrap_or(0) + dur;
            let sessions = p.get("sessions").and_then(|v| v.as_i64()).unwrap_or(0) + 1;
            json!({
                "gameId": game_id,
                "totalSec": total,
                "lastPlayedIso": end_iso,
                "sessions": sessions,
            })
        }
    }
}

// --- game cache (KV mirror of Electron's in-memory cachedGames) --------------

fn load_cache(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, CACHE_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn save_cache(app: &tauri::AppHandle, games: &[Value]) {
    let _ = crate::kv_set(app, CACHE_KEY, json!(games));
}

// getGames(): cachedGames ? [...cachedGames] : []. KV-absent -> [].
fn get_games(app: &tauri::AppHandle) -> Value {
    json!(load_cache(app))
}

fn get_playtime(app: &tauri::AppHandle) -> Value {
    load_playtime(app)
}

// --- default scan locations (port of defaultLocations()) ---------------------

struct ScanLocations {
    steam_libraries: Vec<PathBuf>,
    epic_manifests_dir: Option<PathBuf>,
    gog_games_dir: Option<PathBuf>,
    itch_apps_dir: Option<PathBuf>,
}

fn home_dir() -> PathBuf {
    // No new dependency: read the platform home env var directly.
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."))
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."))
    }
}

fn default_locations() -> ScanLocations {
    let home = home_dir();
    match std::env::consts::OS {
        "windows" => ScanLocations {
            steam_libraries: vec![PathBuf::from("C:/Program Files (x86)/Steam")],
            epic_manifests_dir: Some(PathBuf::from(
                "C:/ProgramData/Epic/EpicGamesLauncher/Data/Manifests",
            )),
            gog_games_dir: Some(PathBuf::from("C:/GOG Games")),
            itch_apps_dir: None,
        },
        "macos" => ScanLocations {
            steam_libraries: vec![home.join("Library/Application Support/Steam")],
            epic_manifests_dir: None,
            gog_games_dir: None,
            itch_apps_dir: None,
        },
        _ => ScanLocations {
            steam_libraries: vec![home.join(".steam/steam")],
            epic_manifests_dir: None,
            gog_games_dir: None,
            itch_apps_dir: Some(home.join(".config/itch/apps")),
        },
    }
}

// --- pure parsers (ports of scanner.ts / launcher.ts) ------------------------

// parseAcf(): regex-free extraction of "appid" "<digits>" and "name" "<...>".
fn parse_acf(text: &str) -> (Option<String>, Option<String>) {
    (extract_quoted_after(text, "\"appid\""), extract_quoted_after(text, "\"name\""))
}

// Find `key`, then the first `"<value>"` after it on the same logical span.
// Steam .acf pairs a key token with a tab and a quoted value: `"appid"\t\t"220"`.
fn extract_quoted_after(text: &str, key: &str) -> Option<String> {
    let mut search_from = 0usize;
    while let Some(rel) = text[search_from..].find(key) {
        let after = search_from + rel + key.len();
        let rest = &text[after..];
        // The value must be the next quoted token (skip whitespace/tabs only).
        let trimmed = rest.trim_start_matches(|c: char| c == ' ' || c == '\t');
        if let Some(stripped) = trimmed.strip_prefix('"') {
            if let Some(end) = stripped.find('"') {
                let val = &stripped[..end];
                // "name" must not match `"name"` inside an `"appid"` block etc.;
                // a non-empty token is what Electron's regex captured.
                if !val.is_empty() {
                    // For "appid" require all-digits, matching `\d+`.
                    if key == "\"appid\"" && !val.chars().all(|c| c.is_ascii_digit()) {
                        search_from = after;
                        continue;
                    }
                    return Some(val.to_string());
                }
            }
        }
        search_from = after;
    }
    None
}

// parseSteamManifest(): id steam:<appid>, requires appid && name.
fn parse_steam_manifest(appid: &str, name: &str, install_path: &Path) -> Option<Value> {
    if appid.is_empty() || name.is_empty() {
        return None;
    }
    Some(json!({
        "id": format!("steam:{}", appid),
        "source": "steam",
        "title": name,
        // GamesService overrides installPath with the steamapps dir.
        "installPath": install_path.to_string_lossy(),
        "raw": { "appid": appid, "name": name },
    }))
}

// parseEpicManifest(): id epic:<CatalogItemId ?? AppName>, requires id && title.
fn parse_epic_manifest(m: &Value) -> Option<Value> {
    let id = m
        .get("CatalogItemId")
        .and_then(|v| v.as_str())
        .or_else(|| m.get("AppName").and_then(|v| v.as_str()));
    let title = m
        .get("DisplayName")
        .and_then(|v| v.as_str())
        .or_else(|| m.get("AppName").and_then(|v| v.as_str()));
    match (id, title) {
        (Some(id), Some(title)) if !id.is_empty() && !title.is_empty() => Some(json!({
            "id": format!("epic:{}", id),
            "source": "epic",
            "title": title,
            "installPath": m.get("InstallLocation").and_then(|v| v.as_str()),
            "raw": m,
        })),
        _ => None,
    }
}

fn dir_exists(p: &Path) -> bool {
    std::fs::metadata(p).map(|m| m.is_dir()).unwrap_or(false)
}

fn list_dir(p: &Path) -> Vec<String> {
    std::fs::read_dir(p)
        .map(|rd| {
            rd.filter_map(|e| e.ok().map(|e| e.file_name().to_string_lossy().to_string()))
                .collect()
        })
        .unwrap_or_default()
}

// scanGames(loc, fs) — real disk walk, mirroring scanner.ts exactly.
fn scan_games(loc: &ScanLocations) -> (Vec<Value>, Vec<Value>) {
    let mut games: Vec<Value> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();

    // Steam
    for lib in &loc.steam_libraries {
        let apps_dir = lib.join("steamapps");
        if !dir_exists(&apps_dir) {
            continue;
        }
        for name in list_dir(&apps_dir) {
            if !name.starts_with("appmanifest_") || !name.ends_with(".acf") {
                continue;
            }
            let file = apps_dir.join(&name);
            match std::fs::read_to_string(&file) {
                Ok(text) => {
                    let (appid, gname) = parse_acf(&text);
                    let g = parse_steam_manifest(
                        appid.as_deref().unwrap_or(""),
                        gname.as_deref().unwrap_or(""),
                        &apps_dir,
                    );
                    match g {
                        Some(g) => games.push(g),
                        None => errors.push(json!({
                            "source": "steam", "path": name, "reason": "invalid-manifest"
                        })),
                    }
                }
                Err(e) => errors.push(json!({
                    "source": "steam", "path": name, "reason": e.to_string()
                })),
            }
        }
    }

    // Epic (.item JSON)
    if let Some(ref epic) = loc.epic_manifests_dir {
        if dir_exists(epic) {
            for name in list_dir(epic) {
                if !name.ends_with(".item") {
                    continue;
                }
                let file = epic.join(&name);
                match std::fs::read_to_string(&file) {
                    Ok(text) => match serde_json::from_str::<Value>(&text) {
                        Ok(jsonv) => match parse_epic_manifest(&jsonv) {
                            Some(g) => games.push(g),
                            None => errors.push(json!({
                                "source": "epic", "path": name, "reason": "invalid-manifest"
                            })),
                        },
                        Err(e) => errors.push(json!({
                            "source": "epic", "path": name, "reason": e.to_string()
                        })),
                    },
                    Err(e) => errors.push(json!({
                        "source": "epic", "path": name, "reason": e.to_string()
                    })),
                }
            }
        }
    }

    // GOG (subdir = game)
    if let Some(ref gog) = loc.gog_games_dir {
        if dir_exists(gog) {
            for sub in list_dir(gog) {
                games.push(json!({
                    "id": format!("gog:{}", sub),
                    "source": "gog",
                    "title": sub,
                    "installPath": gog.join(&sub).to_string_lossy(),
                }));
            }
        }
    }

    // itch.io (subdir = game)
    if let Some(ref itch) = loc.itch_apps_dir {
        if dir_exists(itch) {
            for sub in list_dir(itch) {
                games.push(json!({
                    "id": format!("itch:{}", sub),
                    "source": "itch",
                    "title": sub,
                    "installPath": itch.join(&sub).to_string_lossy(),
                }));
            }
        }
    }

    // Dedupe by id, preserving first-seen order (parity with scanner.ts Map).
    let mut seen: Vec<String> = Vec::new();
    let mut out: Vec<Value> = Vec::new();
    for g in games {
        let id = g.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if !seen.contains(&id) {
            seen.push(id);
            out.push(g);
        }
    }
    (out, errors)
}

// --- launch planning (port of planLaunch) ------------------------------------

fn id_suffix(id: &str) -> &str {
    id.splitn(2, ':').nth(1).unwrap_or("")
}

fn plan_launch(g: &Value, overlay: bool) -> Value {
    let id = g.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let source = g.get("source").and_then(|v| v.as_str()).unwrap_or("");
    let suffix = id_suffix(id);
    match source {
        "steam" => json!({
            "gameId": id, "source": "steam",
            "command": ["steam", format!("steam://rungameid/{}", suffix)],
            "overlay": overlay, "viaStorefront": true,
        }),
        "epic" => json!({
            "gameId": id, "source": "epic",
            "command": ["com.epicgames.launcher", format!("apps/{}?action=launch", suffix)],
            "overlay": overlay, "viaStorefront": true,
        }),
        "gog" => json!({
            "gameId": id, "source": "gog",
            "command": ["goggalaxy", format!("/command=runGame /gameId={}", suffix)],
            "overlay": overlay, "viaStorefront": true,
        }),
        "itch" => json!({
            "gameId": id, "source": "itch",
            "command": ["itch", "--launch", suffix],
            "overlay": overlay, "viaStorefront": true,
        }),
        "ea" => json!({
            "gameId": id, "source": "ea",
            "command": [format!("origin2://library/open/{}", suffix)],
            "overlay": overlay, "viaStorefront": true,
        }),
        "native" => {
            let install = g.get("installPath").and_then(|v| v.as_str());
            json!({
                "gameId": id, "source": "native",
                "command": install.map(|p| vec![p]).unwrap_or_default(),
                "cwd": install,
                "overlay": overlay, "viaStorefront": false,
            })
        }
        // web -> internal web runtime sentinel; overlay forced true (parity).
        _ => json!({
            "gameId": id, "source": "web",
            "command": ["__internal:openWebRuntime", id],
            "overlay": true, "viaStorefront": false,
        }),
    }
}

// planFor(gameId, opts): look up the cached game; null if unknown.
fn plan_for(app: &tauri::AppHandle, game_id: &str, overlay: bool) -> Value {
    let cache = load_cache(app);
    match cache
        .iter()
        .find(|g| g.get("id").and_then(|v| v.as_str()) == Some(game_id))
    {
        Some(g) => plan_launch(g, overlay),
        None => Value::Null,
    }
}

// --- native scan / launch ----------------------------------------------------

// games:scan — real disk walk; persist to cache; emit games:scanned.
fn scan(app: &tauri::AppHandle) -> Value {
    let loc = default_locations();
    let (games, errors) = scan_games(&loc);
    save_cache(app, &games);
    let result = json!({ "games": games, "errors": errors });
    // Electron's service does not push an event, but other Tauri subsystems
    // surface long-running native work to the renderer; emit a parity-safe
    // notice so live views can refresh without re-polling games:list.
    crate::native_ops::emit_event(app, "games:scanned", &result);
    result
}

#[cfg(windows)]
fn configure_no_window(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
}
#[cfg(not(windows))]
fn configure_no_window(_cmd: &mut std::process::Command) {}

// games:launch — resolve plan, spawn detached child, record playtime on exit.
fn launch(app: &tauri::AppHandle, game_id: &str, overlay: bool) -> Value {
    let plan = plan_for(app, game_id, overlay);
    if plan.is_null() {
        return json!({ "ok": false, "error": "unknown-game" });
    }
    let command: Vec<String> = plan
        .get("command")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    if command.is_empty() {
        return json!({ "ok": false, "error": "no-command" });
    }
    let cmd_name = command[0].clone();
    if cmd_name == "__internal:openWebRuntime" {
        // Needs a live OS BrowserWindow / web runtime that has no native stateless
        // equivalent; Electron itself returned this same error. Honest degrade.
        return json!({ "ok": false, "error": "web-runtime-unimplemented" });
    }
    let cwd = plan.get("cwd").and_then(|v| v.as_str()).map(|s| s.to_string());

    let mut proc = std::process::Command::new(&cmd_name);
    proc.args(&command[1..]);
    if let Some(ref dir) = cwd {
        proc.current_dir(dir);
    }
    proc.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    configure_no_window(&mut proc);

    match proc.spawn() {
        Ok(child) => {
            let pid = child.id();
            let start_ms = now_ms();
            // Wait for the child off-thread and record the session, mirroring
            // Electron's `child.on('exit', ...)` (no UI block; detached-equivalent).
            let app2 = app.clone();
            let gid = game_id.to_string();
            crate::util::spawn_named("games", move || {
                let mut child = child;
                let _ = child.wait();
                let sec = ((now_ms() - start_ms) as f64 / 1000.0).round() as i64;
                let mut pt = load_playtime(&app2);
                let updated = record_session(pt.get(&gid), &gid, sec, &iso_now());
                if let Some(obj) = pt.as_object_mut() {
                    obj.insert(gid.clone(), updated);
                }
                persist_playtime(&app2, &pt);
            });
            json!({ "ok": true, "pid": pid })
        }
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
}

/// Route a `games:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- data channels --------------------------------------------------
        "games:list" => get_games(app),
        "games:playtime" => get_playtime(app),

        // --- native heavy channels ------------------------------------------
        // scan(loc?) — locOverride ignored (Electron's prefs path was a stub and
        // the renderer never passes one); always uses OS defaults.
        "games:scan" => scan(app),

        // plan-launch(gameId, opts?) -> LaunchPlan | null
        "games:plan-launch" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let overlay = args
                .get(1)
                .and_then(|v| v.get("overlay"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if id.is_empty() {
                Value::Null
            } else {
                plan_for(app, id, overlay)
            }
        }

        // launch(gameId, opts?) -> { ok, pid? }
        "games:launch" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let overlay = args
                .get(1)
                .and_then(|v| v.get("overlay"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if id.is_empty() {
                json!({ "ok": false, "error": "unknown-game" })
            } else {
                launch(app, id, overlay)
            }
        }

        _ => Value::Null,
    }
}
