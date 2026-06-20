// =============================================================================
// DEX Tauri - App Launcher subsystem (full native port of
// src/main/core/AppLauncherSwitcher.ts, the `launcher:*` IPC handlers).
//
// The Electron launcher did NOT use electron-store; it persisted to two raw JSON
// files inside a `launcher` subdirectory of userData:
//   - <userData>/launcher/apps.json   : InstalledApp[]   (a bare JSON array)
//   - <userData>/launcher/config.json : Partial<LauncherConfig>
// We mirror the SAME relative paths under <appData> (Tauri's app_data_dir) and
// the SAME on-disk shapes (apps.json is a bare array, NOT key-wrapped).
//
// This round implements the previously-skipped HEAVY channels with real native
// code (process spawn, filesystem scan, sysinfo process list/kill, OS window
// activation, JSON-file state mutation), keeping the original read-only
// `launcher:apps` data channel intact:
//
//   launcher:apps / launcher:getApps -> InstalledApp[]   (getAllApps)
//   launcher:search    -> AppSearchResult[]              (scored search)
//   launcher:recent    -> InstalledApp[]                 (by lastUsed desc)
//   launcher:favorites -> InstalledApp[]                 (favorite, by name)
//   launcher:byCategory-> InstalledApp[]                 (category, by useCount)
//   launcher:launch    -> { success, pid?, error? }      (std::process spawn)
//   launcher:launchPath-> { success, pid?, error? }      (std::process spawn)
//   launcher:quick     -> { success, pid?, error? }      (top search hit launch)
//   launcher:favorite  -> { success }                    (apps.json mutation)
//   launcher:hide      -> { success }                    (apps.json mutation)
//   launcher:scan      -> { found, duration }            (native fs scan)
//   launcher:running   -> RunningApp[]                   (sysinfo process list)
//   launcher:switchTo  -> { success, error? }            (OS window activate)
//   launcher:close     -> { success, error? }            (sysinfo kill)
//   launcher:config    -> LauncherConfig                 (config.json + defaults)
//   launcher:setConfig -> { success }                    (config.json merge-write)
//
// Renderer push events mirror Electron's EventEmitter -> the renderer never
// subscribed to launcher emits over IPC (these were main-process EventEmitter
// events, not webContents.send), so no emit_event is required for parity; usage
// is reflected by re-reading apps.json. We still emit `launcher:scan:complete`
// and `launcher:app:launched` best-effort so a future renderer can observe them.
//
// DIVERGENCES (documented):
//   - Channel name: the data channel is `launcher:apps` in Electron (there is no
//     `launcher:getApps`). The dispatch accepts both spellings.
//   - Sorting: Electron used a.displayName.localeCompare(b.displayName). We use a
//     plain Unicode-codepoint comparison, which matches localeCompare for the
//     ASCII app names produced by the scanner; full ICU collation is not
//     reproducible without a collation crate (no new deps allowed).
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

const SUBDIR: &str = "launcher";
const APPS_FILE: &str = "apps.json";
const CONFIG_FILE: &str = "config.json";

// LauncherConfig defaults (mirror the Electron constructor).
const DEF_SCAN_ON_STARTUP: bool = true;
const DEF_SHOW_HIDDEN: bool = false;
const DEF_MAX_RECENT: u64 = 20;
const DEF_MAX_SEARCH: u64 = 50;

// --- time -------------------------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO ----------------------------------------------------------------

fn launcher_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(SUBDIR);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(launcher_dir(app).join(name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_json(app: &tauri::AppHandle, name: &str, value: &Value) -> bool {
    match serde_json::to_string_pretty(value) {
        Ok(raw) => std::fs::write(launcher_dir(app).join(name), raw).is_ok(),
        Err(_) => false,
    }
}

fn read_apps(app: &tauri::AppHandle) -> Vec<Value> {
    match read_json(app, APPS_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn write_apps(app: &tauri::AppHandle, apps: &[Value]) -> bool {
    write_json(app, APPS_FILE, &Value::Array(apps.to_vec()))
}

// --- config -----------------------------------------------------------------

// Resolved LauncherConfig (stored partial merged over defaults).
struct Config {
    scan_on_startup: bool,
    show_hidden_apps: bool,
    max_recent_apps: u64,
    max_search_results: u64,
    custom_paths: Vec<String>,
}

fn load_config(app: &tauri::AppHandle) -> Config {
    let v = read_json(app, CONFIG_FILE);
    let g = |k: &str| v.get(k);
    Config {
        scan_on_startup: g("scanOnStartup").and_then(|x| x.as_bool()).unwrap_or(DEF_SCAN_ON_STARTUP),
        show_hidden_apps: g("showHiddenApps").and_then(|x| x.as_bool()).unwrap_or(DEF_SHOW_HIDDEN),
        max_recent_apps: g("maxRecentApps").and_then(|x| x.as_u64()).unwrap_or(DEF_MAX_RECENT),
        max_search_results: g("maxSearchResults").and_then(|x| x.as_u64()).unwrap_or(DEF_MAX_SEARCH),
        custom_paths: g("customPaths")
            .and_then(|x| x.as_array())
            .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
            .unwrap_or_default(),
    }
}

fn config_json(c: &Config) -> Value {
    json!({
        "scanOnStartup": c.scan_on_startup,
        "showHiddenApps": c.show_hidden_apps,
        "maxRecentApps": c.max_recent_apps,
        "maxSearchResults": c.max_search_results,
        "customPaths": c.custom_paths,
    })
}

// --- app record accessors ---------------------------------------------------

fn is_hidden(a: &Value) -> bool {
    a.get("hidden").and_then(|v| v.as_bool()).unwrap_or(false)
}

fn is_favorite(a: &Value) -> bool {
    a.get("favorite").and_then(|v| v.as_bool()).unwrap_or(false)
}

fn display_name(a: &Value) -> &str {
    a.get("displayName").and_then(|v| v.as_str()).unwrap_or("")
}

fn use_count(a: &Value) -> i64 {
    a.get("useCount").and_then(|v| v.as_i64()).unwrap_or(0)
}

fn last_used(a: &Value) -> i64 {
    a.get("lastUsed").and_then(|v| v.as_i64()).unwrap_or(0)
}

fn app_id(a: &Value) -> &str {
    a.get("id").and_then(|v| v.as_str()).unwrap_or("")
}

fn app_path(a: &Value) -> &str {
    a.get("path").and_then(|v| v.as_str()).unwrap_or("")
}

fn category(a: &Value) -> &str {
    a.get("category").and_then(|v| v.as_str()).unwrap_or("other")
}

// visible(app): !hidden || showHiddenApps
fn visible(a: &Value, show_hidden: bool) -> bool {
    !is_hidden(a) || show_hidden
}

// --- listing channels -------------------------------------------------------

// AppLauncherSwitcher.getAllApps(): filter visible, sorted by displayName.
fn get_all_apps(app: &tauri::AppHandle) -> Value {
    let cfg = load_config(app);
    let mut out: Vec<Value> =
        read_apps(app).into_iter().filter(|a| visible(a, cfg.show_hidden_apps)).collect();
    out.sort_by(|a, b| display_name(a).cmp(display_name(b)));
    Value::Array(out)
}

// getRecentApps(): lastUsed && visible, sorted by lastUsed desc, capped.
fn get_recent_apps(app: &tauri::AppHandle) -> Vec<Value> {
    let cfg = load_config(app);
    let mut out: Vec<Value> = read_apps(app)
        .into_iter()
        .filter(|a| last_used(a) > 0 && visible(a, cfg.show_hidden_apps))
        .collect();
    out.sort_by(|a, b| last_used(b).cmp(&last_used(a)));
    out.truncate(cfg.max_recent_apps as usize);
    out
}

// getFavoriteApps(): favorite && visible, sorted by displayName.
fn get_favorite_apps(app: &tauri::AppHandle) -> Value {
    let cfg = load_config(app);
    let mut out: Vec<Value> = read_apps(app)
        .into_iter()
        .filter(|a| is_favorite(a) && visible(a, cfg.show_hidden_apps))
        .collect();
    out.sort_by(|a, b| display_name(a).cmp(display_name(b)));
    Value::Array(out)
}

// getAppsByCategory(category): category match && visible, sorted by useCount desc.
fn get_apps_by_category(app: &tauri::AppHandle, cat: &str) -> Value {
    let cfg = load_config(app);
    let mut out: Vec<Value> = read_apps(app)
        .into_iter()
        .filter(|a| category(a) == cat && visible(a, cfg.show_hidden_apps))
        .collect();
    out.sort_by(|a, b| use_count(b).cmp(&use_count(a)));
    Value::Array(out)
}

// searchApps(query): scored fuzzy search -> AppSearchResult[].
fn search_apps(app: &tauri::AppHandle, query: &str) -> Value {
    let cfg = load_config(app);
    if query.trim().is_empty() {
        // Empty query mirrors recent apps wrapped as exact/score-100 results.
        let results: Vec<Value> = get_recent_apps(app)
            .into_iter()
            .map(|a| json!({ "app": a, "score": 100.0, "matchType": "exact" }))
            .collect();
        return Value::Array(results);
    }

    let query_lower = query.to_lowercase();
    let now = now_ms();
    let mut results: Vec<(f64, Value)> = Vec::new();

    for a in read_apps(app) {
        if is_hidden(&a) && !cfg.show_hidden_apps {
            continue;
        }
        let name_lower = display_name(&a).to_lowercase();
        let mut score: f64 = 0.0;
        let mut match_type = "fuzzy";

        if name_lower == query_lower {
            score = 100.0;
            match_type = "exact";
        } else if name_lower.starts_with(&query_lower) {
            score = 80.0 + (query_lower.chars().count() as f64 / name_lower.chars().count().max(1) as f64) * 20.0;
            match_type = "prefix";
        } else if name_lower.contains(&query_lower) {
            score = 50.0 + (query_lower.chars().count() as f64 / name_lower.chars().count().max(1) as f64) * 30.0;
            match_type = "contains";
        } else {
            // Fuzzy: initials of displayName split on whitespace/-/_.
            let initials: String = display_name(&a)
                .split(|c: char| c.is_whitespace() || c == '-' || c == '_')
                .filter_map(|w| w.chars().next())
                .map(|c| c.to_ascii_lowercase())
                .collect();
            if initials.starts_with(&query_lower) {
                score = 40.0;
                match_type = "fuzzy";
            }
        }

        if score > 0.0 {
            // Boost by usage (cap 20), favorites (+15), recent within 24h (+10).
            score += (use_count(&a) as f64 * 2.0).min(20.0);
            if is_favorite(&a) {
                score += 15.0;
            }
            let lu = last_used(&a);
            if lu > 0 && (now - lu) < 24 * 60 * 60 * 1000 {
                score += 10.0;
            }
            results.push((score, json!({ "app": a, "score": score, "matchType": match_type })));
        }
    }

    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(cfg.max_search_results as usize);
    Value::Array(results.into_iter().map(|(_, v)| v).collect())
}

// --- mutation channels ------------------------------------------------------

// Set a boolean field (favorite/hidden) on the matching app id; persist.
fn set_app_flag(app: &tauri::AppHandle, id: &str, field: &str, value: bool) -> Value {
    let mut apps = read_apps(app);
    let mut found = false;
    for a in apps.iter_mut() {
        if app_id(a) == id {
            if let Some(obj) = a.as_object_mut() {
                obj.insert(field.to_string(), Value::Bool(value));
            }
            found = true;
            break;
        }
    }
    if found {
        write_apps(app, &apps);
        json!({ "success": true })
    } else {
        json!({ "success": false })
    }
}

// --- config channels --------------------------------------------------------

fn get_config(app: &tauri::AppHandle) -> Value {
    config_json(&load_config(app))
}

// setConfig(partial): merge partial over current, write the FULL resolved config
// (Electron persisted the full merged config object).
fn set_config(app: &tauri::AppHandle, partial: &Value) -> Value {
    let mut cfg = load_config(app);
    if let Some(v) = partial.get("scanOnStartup").and_then(|x| x.as_bool()) {
        cfg.scan_on_startup = v;
    }
    if let Some(v) = partial.get("showHiddenApps").and_then(|x| x.as_bool()) {
        cfg.show_hidden_apps = v;
    }
    if let Some(v) = partial.get("maxRecentApps").and_then(|x| x.as_u64()) {
        cfg.max_recent_apps = v;
    }
    if let Some(v) = partial.get("maxSearchResults").and_then(|x| x.as_u64()) {
        cfg.max_search_results = v;
    }
    if let Some(arr) = partial.get("customPaths").and_then(|x| x.as_array()) {
        cfg.custom_paths = arr.iter().filter_map(|s| s.as_str().map(String::from)).collect();
    }
    write_json(app, CONFIG_FILE, &config_json(&cfg));
    json!({ "success": true })
}

// --- launching --------------------------------------------------------------

// Spawn an executable detached, hiding the console window on Windows. Returns the
// child pid on success.
fn spawn_detached(path: &str, args: &[String]) -> Result<Option<u32>, String> {
    let mut cmd = std::process::Command::new(path);
    cmd.args(args);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW | DETACHED_PROCESS
        cmd.creation_flags(0x0800_0000 | 0x0000_0008);
    }
    match cmd.spawn() {
        Ok(child) => Ok(Some(child.id())),
        Err(e) => Err(e.to_string()),
    }
}

// launchByPath(appPath, args): open shortcuts/urls with the OS handler; spawn
// executables detached. Returns { success, pid?, error? }.
fn launch_by_path(app: &tauri::AppHandle, path: &str, args: &[String]) -> Value {
    if path.is_empty() {
        return json!({ "success": false, "error": "Empty path" });
    }
    let lower = path.to_lowercase();
    // Shortcuts/URLs and .app bundles -> OS default handler (mirrors shell.openPath
    // / `open`); plain executables -> detached spawn that yields a pid.
    let use_opener = lower.ends_with(".lnk")
        || lower.ends_with(".url")
        || lower.ends_with(".app")
        || lower.ends_with(".desktop");

    let result = if use_opener {
        match open::that(path) {
            Ok(()) => json!({ "success": true }),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        }
    } else {
        match spawn_detached(path, args) {
            Ok(pid) => json!({ "success": true, "pid": pid }),
            // Fall back to the OS opener if direct spawn fails (e.g. non-exe target).
            Err(spawn_err) => match open::that(path) {
                Ok(()) => json!({ "success": true }),
                Err(_) => json!({ "success": false, "error": spawn_err }),
            },
        }
    };

    if result.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let pid = result.get("pid").cloned().unwrap_or(Value::Null);
        crate::native_ops::emit_event(
            app,
            "launcher:app:launched",
            &json!({ "path": path, "pid": pid }),
        );
    }
    result
}

// Record a launch against a tracked app id: bump useCount + lastUsed, persist.
fn record_use(app: &tauri::AppHandle, id: &str) {
    let mut apps = read_apps(app);
    let mut changed = false;
    for a in apps.iter_mut() {
        if app_id(a) == id {
            let next = use_count(a) + 1;
            if let Some(obj) = a.as_object_mut() {
                obj.insert("useCount".to_string(), json!(next));
                obj.insert("lastUsed".to_string(), json!(now_ms()));
            }
            changed = true;
            break;
        }
    }
    if changed {
        write_apps(app, &apps);
    }
}

// launchApp(appId, args): resolve the stored app, launch by its path, track usage.
fn launch_app(app: &tauri::AppHandle, id: &str, args: &[String]) -> Value {
    let apps = read_apps(app);
    let target = apps.iter().find(|a| app_id(a) == id).cloned();
    let target = match target {
        Some(t) => t,
        None => return json!({ "success": false, "error": "App not found" }),
    };
    let res = launch_by_path(app, app_path(&target), args);
    if res.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        record_use(app, id);
    }
    res
}

// quickLaunch(query): launch the top search hit, else error.
fn quick_launch(app: &tauri::AppHandle, query: &str) -> Value {
    let results = search_apps(app, query);
    if let Some(first) = results.as_array().and_then(|a| a.first()) {
        if let Some(id) = first.get("app").map(|a| app_id(a).to_string()) {
            if !id.is_empty() {
                return launch_app(app, &id, &[]);
            }
        }
    }
    json!({ "success": false, "error": "No matching app found" })
}

// --- scanning ---------------------------------------------------------------

fn generate_app_id(name: &str) -> String {
    // toLowerCase -> non-alphanumeric runs to '-' -> trim leading/trailing '-'.
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in name.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn format_display_name(name: &str) -> String {
    // Replace -/_ with space, split camelCase, title-case each word's first char.
    let spaced: String = name.chars().map(|c| if c == '-' || c == '_' { ' ' } else { c }).collect();
    // camelCase boundary: lower followed by upper -> insert space.
    let mut camel = String::new();
    let mut prev: Option<char> = None;
    for c in spaced.chars() {
        if let Some(p) = prev {
            if p.is_ascii_lowercase() && c.is_ascii_uppercase() {
                camel.push(' ');
            }
        }
        camel.push(c);
        prev = Some(c);
    }
    // Title-case the first letter of each word.
    let mut out = String::new();
    let mut at_word_start = true;
    for c in camel.chars() {
        if c.is_whitespace() {
            at_word_start = true;
            out.push(c);
        } else if at_word_start {
            out.extend(c.to_uppercase());
            at_word_start = false;
        } else {
            out.push(c);
        }
    }
    out
}

const CATEGORY_KEYWORDS: &[(&str, &[&str])] = &[
    ("productivity", &["office", "word", "excel", "sheets", "docs", "notion", "obsidian", "todoist", "calendar"]),
    ("development", &["code", "studio", "ide", "terminal", "git", "docker", "node", "python", "java"]),
    ("media", &["spotify", "music", "video", "vlc", "player", "photo", "image", "netflix", "youtube"]),
    ("communication", &["slack", "discord", "teams", "zoom", "mail", "outlook", "telegram", "whatsapp"]),
    ("utilities", &["calculator", "notepad", "settings", "control", "finder", "explorer", "file"]),
    ("system", &["task manager", "activity monitor", "system", "preferences", "security"]),
];

fn detect_category(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    for (cat, kws) in CATEGORY_KEYWORDS {
        if kws.iter().any(|kw| lower.contains(kw)) {
            return cat;
        }
    }
    "other"
}

fn is_system_executable(name: &str) -> bool {
    const SYS: &[&str] = &[
        "uninstall", "setup", "install", "update", "updater", "helper", "crash", "reporter",
        "service", "daemon",
    ];
    let lower = name.to_lowercase();
    SYS.iter().any(|s| lower.contains(s))
}

fn new_app_record(id: &str, name: &str, display: &str, path: &str, cat: &str) -> Value {
    json!({
        "id": id,
        "name": name,
        "displayName": display,
        "path": path,
        "category": cat,
        "useCount": 0,
        "favorite": false,
        "hidden": false,
    })
}

// Recursively scan a directory for files with the given (lowercased) extension,
// adding non-system executables. Depth-limited like the Electron scanner.
fn scan_directory(
    base: &Path,
    ext: &str,
    found: &mut std::collections::HashMap<String, Value>,
) {
    let entries = match std::fs::read_dir(base) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            // Depth guard mirrors Electron's `depth < 10` heuristic.
            let depth = base.components().count();
            if depth < 10 {
                scan_directory(&path, ext, found);
            }
        } else {
            let fname = entry.file_name().to_string_lossy().to_string();
            if fname.to_lowercase().ends_with(ext) {
                let stem = &fname[..fname.len() - ext.len()];
                if is_system_executable(stem) {
                    continue;
                }
                let id = generate_app_id(stem);
                if id.is_empty() || found.contains_key(&id) {
                    continue;
                }
                let display = format_display_name(stem);
                let cat = detect_category(stem);
                found.insert(id.clone(), new_app_record(&id, stem, &display, &path.to_string_lossy(), cat));
            }
        }
    }
}

// Scan Start Menu / shortcut trees: every .lnk becomes an app (display = raw name).
fn scan_shortcuts(base: &Path, found: &mut std::collections::HashMap<String, Value>) {
    let entries = match std::fs::read_dir(base) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            scan_shortcuts(&path, found);
        } else {
            let fname = entry.file_name().to_string_lossy().to_string();
            if fname.to_lowercase().ends_with(".lnk") {
                let stem = &fname[..fname.len() - 4];
                let id = generate_app_id(stem);
                if id.is_empty() || found.contains_key(&id) {
                    continue;
                }
                let cat = detect_category(stem);
                found.insert(id.clone(), new_app_record(&id, stem, stem, &path.to_string_lossy(), cat));
            }
        }
    }
}

// Parse a Linux .desktop file into an app record (Name/Exec/Icon, skip NoDisplay).
fn parse_desktop_file(path: &Path, found: &mut std::collections::HashMap<String, Value>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut name = String::new();
    let mut exec = String::new();
    let mut icon = String::new();
    let mut no_display = false;
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("Name=") {
            if name.is_empty() {
                name = rest.trim().to_string();
            }
        } else if let Some(rest) = line.strip_prefix("Exec=") {
            if exec.is_empty() {
                exec = rest.trim().split(' ').next().unwrap_or("").to_string();
            }
        } else if let Some(rest) = line.strip_prefix("Icon=") {
            if icon.is_empty() {
                icon = rest.trim().to_string();
            }
        } else if line.starts_with("NoDisplay=true") {
            no_display = true;
        }
    }
    if !name.is_empty() && !exec.is_empty() && !no_display {
        let id = generate_app_id(&name);
        if id.is_empty() || found.contains_key(&id) {
            return;
        }
        let cat = detect_category(&name);
        let mut record = new_app_record(&id, &exec, &name, &exec, cat);
        if let Some(obj) = record.as_object_mut() {
            obj.insert("iconPath".to_string(), json!(icon));
        }
        found.insert(id, record);
    }
}

// Collect platform-specific app records (id -> record), respecting customPaths.
fn scan_platform(cfg: &Config) -> std::collections::HashMap<String, Value> {
    let mut found: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    let os = std::env::consts::OS;

    if os == "windows" {
        let mut base_paths: Vec<String> = Vec::new();
        if let Ok(pf) = std::env::var("ProgramFiles") {
            base_paths.push(pf);
        } else {
            base_paths.push("C:\\Program Files".into());
        }
        if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
            base_paths.push(pf86);
        } else {
            base_paths.push("C:\\Program Files (x86)".into());
        }
        if let Ok(lad) = std::env::var("LOCALAPPDATA") {
            base_paths.push(format!("{}\\Programs", lad));
        }
        if let Ok(ad) = std::env::var("APPDATA") {
            base_paths.push(format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", ad));
        }
        base_paths.extend(cfg.custom_paths.iter().cloned());

        for bp in &base_paths {
            let p = Path::new(bp);
            if p.exists() {
                scan_directory(p, ".exe", &mut found);
                scan_directory(p, ".lnk", &mut found);
            }
        }

        // Start Menu shortcut trees.
        let mut menus: Vec<String> = Vec::new();
        if let Ok(ad) = std::env::var("APPDATA") {
            menus.push(format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", ad));
        }
        menus.push("C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs".into());
        for m in &menus {
            let p = Path::new(m);
            if p.exists() {
                scan_shortcuts(p, &mut found);
            }
        }
    } else if os == "macos" {
        let mut base_paths: Vec<String> =
            vec!["/Applications".into(), "/System/Applications".into()];
        if let Ok(home) = std::env::var("HOME") {
            base_paths.push(format!("{}/Applications", home));
        }
        base_paths.extend(cfg.custom_paths.iter().cloned());
        for bp in &base_paths {
            let p = Path::new(bp);
            if !p.exists() {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(p) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    if is_dir && name.ends_with(".app") {
                        let app_name = name.trim_end_matches(".app");
                        let id = generate_app_id(app_name);
                        if id.is_empty() || found.contains_key(&id) {
                            continue;
                        }
                        let cat = detect_category(app_name);
                        found.insert(
                            id.clone(),
                            new_app_record(&id, app_name, app_name, &entry.path().to_string_lossy(), cat),
                        );
                    }
                }
            }
        }
    } else {
        // Linux .desktop scan.
        let mut base_paths: Vec<String> = vec![
            "/usr/share/applications".into(),
            "/usr/local/share/applications".into(),
        ];
        if let Ok(home) = std::env::var("HOME") {
            base_paths.push(format!("{}/.local/share/applications", home));
        }
        base_paths.extend(cfg.custom_paths.iter().cloned());
        for bp in &base_paths {
            let p = Path::new(bp);
            if !p.exists() {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(p) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(".desktop") {
                        parse_desktop_file(&entry.path(), &mut found);
                    }
                }
            }
        }
    }

    found
}

// scanApps(): native filesystem scan, preserving user data (lastUsed/useCount/
// favorite/hidden) for apps already in apps.json, persist, return { found, duration }.
fn scan_apps(app: &tauri::AppHandle) -> Value {
    let start = now_ms();
    let cfg = load_config(app);

    // Existing user data keyed by id.
    let existing = read_apps(app);
    let mut by_id: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    for a in &existing {
        by_id.insert(app_id(a).to_string(), a.clone());
    }

    let mut scanned = scan_platform(&cfg);

    // Preserve user data on rescan: keep existing apps' user fields; merge any
    // pre-existing apps not rediscovered (Electron never deleted stale entries).
    for (id, prev) in by_id.iter() {
        match scanned.get_mut(id) {
            Some(rec) => {
                if let Some(obj) = rec.as_object_mut() {
                    obj.insert("lastUsed".into(), prev.get("lastUsed").cloned().unwrap_or(Value::Null));
                    obj.insert("useCount".into(), json!(use_count(prev)));
                    obj.insert("favorite".into(), Value::Bool(is_favorite(prev)));
                    obj.insert("hidden".into(), Value::Bool(is_hidden(prev)));
                }
            }
            None => {
                scanned.insert(id.clone(), prev.clone());
            }
        }
    }

    let apps: Vec<Value> = scanned.into_values().collect();
    let count = apps.len();
    write_apps(app, &apps);

    let duration = now_ms() - start;
    crate::native_ops::emit_event(
        app,
        "launcher:scan:complete",
        &json!({ "found": count, "duration": duration }),
    );
    json!({ "found": count, "duration": duration })
}

// --- running apps -----------------------------------------------------------

fn is_system_process(name_lc: &str) -> bool {
    const SYS: &[&str] = &[
        "system", "svchost", "csrss", "wininit", "services", "smss", "lsass", "winlogon", "dwm",
        "conhost", "kernel_task", "launchd", "windowserver", "systemd", "init", "kworker",
    ];
    // Electron compared against the bare name (sans .exe for the CSV name, which
    // included the extension); strip a trailing .exe to match the same set.
    let bare = name_lc.strip_suffix(".exe").unwrap_or(name_lc);
    SYS.contains(&bare) || SYS.contains(&name_lc)
}

// getRunningApps(): real process snapshot via sysinfo, filtered to user-facing
// processes. RunningApp = { pid, name, memory } (memory in bytes).
fn get_running_apps() -> Value {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_processes();
    let mut out: Vec<Value> = Vec::new();
    for (pid, proc_) in sys.processes() {
        let name = proc_.name().to_string();
        if name.is_empty() || is_system_process(&name.to_lowercase()) {
            continue;
        }
        out.push(json!({
            "pid": pid.as_u32(),
            "name": name,
            "memory": proc_.memory(), // bytes
        }));
    }
    Value::Array(out)
}

// switchToApp(pid): bring the process's window to the foreground. Real OS calls,
// hiding the console on Windows.
fn switch_to_app(pid: u32) -> Value {
    let os = std::env::consts::OS;
    let ok = match os {
        "windows" => run_hidden(
            "powershell",
            &[
                "-NoProfile",
                "-NoLogo",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &format!("(New-Object -ComObject WScript.Shell).AppActivate({})", pid),
            ],
        ),
        "macos" => {
            // Resolve the process name from pid, then `tell application <name> to activate`.
            use sysinfo::{Pid, System};
            let mut sys = System::new();
            sys.refresh_processes();
            match sys.process(Pid::from_u32(pid)).map(|p| p.name().to_string()) {
                Some(name) if !name.is_empty() => run_hidden(
                    "osascript",
                    &["-e", &format!("tell application \"{}\" to activate", name)],
                ),
                _ => false,
            }
        }
        _ => {
            // Linux: best-effort wmctrl activation (not present on all distros).
            run_hidden(
                "sh",
                &[
                    "-c",
                    &format!("wmctrl -ia $(wmctrl -lp | grep {} | cut -d' ' -f1)", pid),
                ],
            )
        }
    };
    if ok {
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Could not activate window" })
    }
}

// closeApp(pid, force): terminate the process via sysinfo. `force` maps to SIGKILL
// on Unix; on Windows sysinfo kill is already a hard TerminateProcess.
fn close_app(pid: u32, force: bool) -> Value {
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    match sys.process(Pid::from_u32(pid)) {
        Some(p) => {
            let ok = if force {
                p.kill_with(sysinfo::Signal::Kill).unwrap_or_else(|| p.kill())
            } else {
                p.kill_with(sysinfo::Signal::Term).unwrap_or_else(|| p.kill())
            };
            if ok {
                json!({ "success": true })
            } else {
                json!({ "success": false, "error": "kill failed" })
            }
        }
        None => json!({ "success": false, "error": "process not found" }),
    }
}

// Run an OS command, hiding the console window on Windows. Returns success.
fn run_hidden(program: &str, args: &[&str]) -> bool {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

// --- arg helpers ------------------------------------------------------------

// Coerce arg[idx] into a Vec<String> (accepts a JSON array of strings, else []).
fn str_args(args: &Value, idx: usize) -> Vec<String> {
    args.get(idx)
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

fn str_arg(args: &Value, idx: usize) -> String {
    args.get(idx).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn u32_arg(args: &Value, idx: usize) -> u32 {
    args.get(idx).and_then(|v| v.as_u64()).map(|n| n as u32).unwrap_or(0)
}

fn bool_arg(args: &Value, idx: usize) -> bool {
    args.get(idx).and_then(|v| v.as_bool()).unwrap_or(false)
}

/// Route a `launcher:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). All listed channels are now natively implemented;
/// any unrecognized channel still degrades honestly to Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- listing / search (compute-on-read from apps.json) ---
        "launcher:apps" | "launcher:getApps" => get_all_apps(app),
        "launcher:search" => search_apps(app, &str_arg(args, 0)),
        "launcher:recent" => Value::Array(get_recent_apps(app)),
        "launcher:favorites" => get_favorite_apps(app),
        "launcher:byCategory" => get_apps_by_category(app, &str_arg(args, 0)),

        // --- launching (real process spawn / OS opener) ---
        "launcher:launch" => launch_app(app, &str_arg(args, 0), &str_args(args, 1)),
        "launcher:launchPath" => launch_by_path(app, &str_arg(args, 0), &str_args(args, 1)),
        "launcher:quick" => quick_launch(app, &str_arg(args, 0)),

        // --- app management (apps.json mutation) ---
        "launcher:favorite" => set_app_flag(app, &str_arg(args, 0), "favorite", bool_arg(args, 1)),
        "launcher:hide" => set_app_flag(app, &str_arg(args, 0), "hidden", bool_arg(args, 1)),

        // --- discovery / process control (native fs + sysinfo + OS) ---
        "launcher:scan" => scan_apps(app),
        "launcher:running" => get_running_apps(),
        "launcher:switchTo" => switch_to_app(u32_arg(args, 0)),
        "launcher:close" => close_app(u32_arg(args, 0), bool_arg(args, 1)),

        // --- config ---
        "launcher:config" => get_config(app),
        "launcher:setConfig" => set_config(app, args.get(0).unwrap_or(&Value::Null)),

        _ => Value::Null,
    }
}
