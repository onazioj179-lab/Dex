// =============================================================================
// DEX Tauri — User subsystem (port of the `user:*` IPC in main.ts, setupIPC).
//
// Two channels live under this namespace in Electron:
//
//   user:getProfile  (ipcMain.handle) -> pure data; PORTED.
//       Electron returned:
//           {
//             username:    os.userInfo().username || 'User',
//             displayName: username,            // same value
//             hostname:    os.hostname(),
//             platform:    process.platform,    // 'win32' | 'darwin' | 'linux'
//             arch:        process.arch,        // 'x64' | 'arm64' | ...
//           }
//       (Confirmed against preload.ts user.getProfile return type.)
//
//   user:activity    (ipcMain.on, fire-and-forget) -> NOT ported.
//       It only drives LIVE in-process runtime governors
//       (resourceGovernor.recordUserActivity + backgroundTasks.recordUserInput),
//       returns nothing, and the renderer sends it via `.send` expecting no
//       reply. There is no pure-data shape to preserve, so we no-op it and
//       return Value::Null (honest degrade — the resource governor is native
//       runtime, ported separately if/when that subsystem lands).
//
// DIVERGENCES (documented):
//   - No `os` module / crate dependency. `username` is read from the
//     USERNAME / USER / LOGNAME env vars (the same mapping licensing.rs uses
//     for os.userInfo().username), falling back to "User" exactly like the
//     Electron `|| 'User'`. `hostname` is read from COMPUTERNAME / HOSTNAME
//     (the same helper http_transfer.rs uses), falling back to "DEX". Electron's
//     os.hostname() effectively never returns empty, so the fallback is inert in
//     practice; it exists only so the field is always a non-empty string.
//   - `platform` / `arch` are mapped from Rust's compile-time
//     std::env::consts::OS / ARCH to Node's process.platform / process.arch
//     spellings (same table as error_reporting.rs) so the renderer is unchanged.
// =============================================================================

use serde_json::{json, Value};

// os.userInfo().username || 'User'. The username is the active user's login
// name, exposed by Node via os.userInfo(); on each platform that is the
// USERNAME (Windows) / USER (Unix) / LOGNAME env var.
fn username() -> String {
    let name = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_default();
    if name.is_empty() {
        "User".to_string()
    } else {
        name
    }
}

// os.hostname(). Mirrors http_transfer.rs::hostname (no dependency).
fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DEX".to_string())
}

// Map Rust's OS name to Node's process.platform values (same table as
// error_reporting.rs::node_platform).
fn node_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other, // "linux" etc. already match Node
    }
}

// Map Rust's ARCH to Node's process.arch values (same table as
// error_reporting.rs::node_arch).
fn node_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "ia32",
        "aarch64" => "arm64",
        other => other, // "arm" already matches Node
    }
}

fn get_profile() -> Value {
    let user = username();
    json!({
        "username": user,
        "displayName": user,
        "hostname": hostname(),
        "platform": node_platform(),
        "arch": node_arch(),
    })
}

/// Route a `user:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the `user:` namespace is handled
/// here; intentionally-skipped ones return Value::Null, so routing
/// `channel.starts_with("user:")` to this dispatch is safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "user:getProfile" => get_profile(),
        // Fire-and-forget activity ping for the native resource governor; no
        // pure-data shape and no reply expected. No-op + null (honest degrade).
        "user:activity" => Value::Null,
        _ => Value::Null,
    }
}
