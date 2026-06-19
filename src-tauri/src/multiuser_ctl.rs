// =============================================================================
// DEX Tauri — Multi-user subsystem (port of the `multiuser:*` IPC handlers in
// src/main/core/MultiUserManager.ts, setupIPC()).
//
// SCOPE / SPEC RECONCILIATION (important):
//   The porting brief named data channels getSessions / getSession and heavy
//   channels join / leave / invite / sync, backed by fs-json:multiuser-state.json.
//   NONE of those exist in this codebase. The real `multiuser:*` namespace is
//   MultiUserManager.ts, which is a single-OS-user data-directory manager (it
//   detects the logged-in OS user and points userData at a per-user folder). It
//   is NOT a collaborative/session subsystem and has NO multiuser-state.json
//   store. Per project rules (match EXACT Electron shapes, never invent fields,
//   fail honestly — don't fake), this ports the FOUR pure-data channels that
//   actually exist, and lists the brief's nonexistent channels as skipped.
//
// Pure-data tier — no persisted store of its own. The Electron handlers read
// from an in-memory `currentUser: UserProfile` that is derived deterministically
// at startup from the OS user + a `.dex-initialized` marker file. We recompute
// the same values on demand (no in-memory cache needed for these read handlers).
//
// Channels & EXACT Electron return shapes (from setupIPC()):
//   - multiuser:get-username        -> string  (currentUser?.username || 'default')
//   - multiuser:get-data-directory  -> string  (per-user data dir, or userData)
//   - multiuser:is-first-run        -> boolean (currentUser?.isFirstRun || false)
//   - multiuser:get-profile         -> { username, dataDirectory, isFirstRun }
//                                       | null   (null only if init never ran)
//
// DIVERGENCES (documented):
//   - No `os`/`electron` modules. `username` mirrors detectUsername(): on Windows
//     read USERNAME, else USER; fall back to LOGNAME then "default" (Node used
//     os.userInfo().username || 'default'). The same sanitiser regex is applied
//     (control chars + <>:"/\|?* -> '_').
//   - `dataDirectory` mirrors getUserDataDirectory(): <APPDATA>/DEX/users/<user>
//     on Windows, ~/Library/Application Support/DEX/users/<user> on macOS, and
//     ${XDG_CONFIG_HOME:-~/.config}/DEX/users/<user> elsewhere — the SAME paths
//     Electron built, computed from the same env vars. Electron's initialize()
//     then calls app.setPath('userData', dataDir); getDataDirectory()'s fallback
//     branch (app.getPath('userData')) is only hit when init failed, which on
//     Tauri maps to the same computed dir, so the value is stable.
//   - `isFirstRun` mirrors the marker check: true when <dataDir>/.dex-initialized
//     does NOT exist. Electron's initialize() WRITES that marker on first run as
//     a side effect; these are READ handlers, so to avoid a write side effect on
//     a getter we DO NOT create the marker here (the live init path, when ported,
//     owns that). Net data shape returned is identical.
//   - currentUser is non-null in Electron after a successful initialize(); since
//     the values are recomputed deterministically here, get-profile returns the
//     object (never null) — matching the post-init steady state the renderer sees.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;

// detectUsername(): control chars + Windows-reserved path chars -> '_'.
fn sanitize_username(raw: &str) -> String {
    raw.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if (c as u32) <= 0x1f => '_',
            c => c,
        })
        .collect()
}

// detectUsername(): win32 -> USERNAME, else USER; fall back to LOGNAME then
// 'default' (Node's os.userInfo().username || 'default'), then sanitise.
fn username() -> String {
    let primary = if cfg!(target_os = "windows") {
        std::env::var("USERNAME")
    } else {
        std::env::var("USER")
    };
    let raw = primary
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("LOGNAME").ok().filter(|s| !s.is_empty()))
        .unwrap_or_else(|| "default".to_string());
    sanitize_username(&raw)
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

// getUserDataDirectory(username): same per-platform layout as Electron.
fn user_data_directory(user: &str) -> PathBuf {
    if cfg!(target_os = "windows") {
        let appdata = std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home_dir().join("AppData").join("Roaming"));
        appdata.join("DEX").join("users").join(user)
    } else if cfg!(target_os = "macos") {
        home_dir()
            .join("Library")
            .join("Application Support")
            .join("DEX")
            .join("users")
            .join(user)
    } else {
        let config = std::env::var("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home_dir().join(".config"));
        config.join("DEX").join("users").join(user)
    }
}

// isFirstRun(): no <dataDir>/.dex-initialized marker yet. Read-only: unlike the
// Electron initialize() path, we do NOT write the marker here.
fn is_first_run(data_dir: &PathBuf) -> bool {
    !data_dir.join(".dex-initialized").exists()
}

fn data_directory_string(user: &str) -> String {
    user_data_directory(user).to_string_lossy().to_string()
}

// multiuser:get-profile -> { username, dataDirectory, isFirstRun }.
fn get_profile(user: &str) -> Value {
    let dir = user_data_directory(user);
    json!({
        "username": user,
        "dataDirectory": dir.to_string_lossy().to_string(),
        "isFirstRun": is_first_run(&dir),
    })
}

/// Route a `multiuser:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the `multiuser:` namespace that
/// exists in Electron is handled; unknown / heavy channels return Value::Null
/// (honest degrade), so routing `channel.starts_with("multiuser:")` here is safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    let user = username();
    match channel {
        "multiuser:get-username" => json!(user),
        "multiuser:get-data-directory" => json!(data_directory_string(&user)),
        "multiuser:is-first-run" => json!(is_first_run(&user_data_directory(&user))),
        "multiuser:get-profile" => get_profile(&user),
        // No other channels exist in MultiUserManager.ts. The brief's
        // join/leave/invite/sync + getSessions/getSession are not in this
        // subsystem; nothing to route, so return null (honest degrade).
        _ => Value::Null,
    }
}
