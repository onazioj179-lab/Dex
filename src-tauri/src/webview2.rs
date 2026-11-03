// =============================================================================
// DEX Tauri — WebView2 runtime preflight + startup diagnostics.
//
// Why this exists: WebView2 failures used to be invisible. Release builds use
// the `windows` subsystem (no console) and `main()` ended in `.expect(..)`, so a
// missing runtime — or any webview-creation error — killed the process with no
// message at all. The v6.0.x installers were worse: they were built with the
// GNU toolchain, which links `WebView2Loader.dll` DYNAMICALLY (webview2-com-sys
// only links the static loader on MSVC), and the bundler never shipped that
// DLL. Windows' loader then refused to start the exe ("WebView2Loader.dll was
// not found") even though the WebView2 runtime itself was installed.
//
// Layers of the fix:
//   1. build.rs refuses Windows-GNU release builds (root cause).
//   2. scripts/verify-tauri-bundle.js fails a build whose exe still imports
//      WebView2Loader.dll (proof on the artifact we actually ship).
//   3. This module: before the event loop starts, ask the official loader API
//      whether a runtime is available. If not, explain and — only with the
//      user's consent — open Microsoft's official WebView2 download page. We
//      never download or install system components silently. Any startup
//      error/panic is written to <LocalAppData>/com.onazioj.dex/logs/startup.log
//      and shown in a message box instead of vanishing.
//   4. A page-load watchdog: controller creation is async, so its failures
//      never reach `run()`'s Result. No page load within 30 s = logged +
//      explained instead of an empty window hanging forever.
//   5. main() registers tauri-plugin-single-instance (a second launch focuses
//      the running window; duplicate shells are the usual watchdog trigger).
//   6. `diagnostics:getWebView2` reports detection details to the renderer.
// =============================================================================

use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;

/// Microsoft's official WebView2 distribution page (Evergreen Bootstrapper /
/// Standalone installers for x64, x86 and ARM64).
pub const DOWNLOAD_PAGE: &str = "https://developer.microsoft.com/microsoft-edge/webview2/#download";

/// Same identifier as tauri.conf.json; wry puts its `EBWebView` user-data dir
/// under %LOCALAPPDATA%\<identifier>, so startup logs sit right beside it.
const IDENTIFIER: &str = "com.onazioj.dex";
const MAX_LOG_BYTES: u64 = 256 * 1024;

/// Registry clients key for the Evergreen WebView2 Runtime (documented by
/// Microsoft for runtime detection).
#[cfg(windows)]
const RUNTIME_CLIENT_GUID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

pub fn log_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join(IDENTIFIER).join("logs")
}

pub fn log_path() -> PathBuf {
    log_dir().join("startup.log")
}

/// Append a timestamped line to the startup log. Best-effort: logging must
/// never be the thing that breaks startup. Rotates (truncates) past 256 KB.
pub fn log(line: &str) {
    let path = log_path();
    let _ = std::fs::create_dir_all(log_dir());
    if std::fs::metadata(&path).map(|m| m.len() > MAX_LOG_BYTES).unwrap_or(false) {
        let _ = std::fs::remove_file(&path);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "[{ts}] v{} {line}", env!("CARGO_PKG_VERSION"));
    }
}

/// Result of asking the loader for an installed runtime.
pub struct Detection {
    pub version: Option<String>,
    /// HRESULT / message when the loader reported a failure.
    pub error: Option<String>,
}

/// Authoritative detection: `GetAvailableCoreWebView2BrowserVersionString` is
/// the same call wry makes to locate the runtime, so it honours per-user and
/// per-machine installs, every architecture, and the
/// WEBVIEW2_BROWSER_EXECUTABLE_FOLDER override exactly as webview creation will.
#[cfg(windows)]
pub fn detect() -> Detection {
    use webview2_com::Microsoft::Web::WebView2::Win32::GetAvailableCoreWebView2BrowserVersionString;
    let mut info = windows_core::PWSTR::null();
    let res = unsafe { GetAvailableCoreWebView2BrowserVersionString(windows_core::PCWSTR::null(), &mut info) };
    match res {
        Ok(()) if !info.is_null() => {
            let v = webview2_com::take_pwstr(info);
            Detection { version: Some(v), error: None }
        }
        // Older loaders return S_OK + null when no runtime exists.
        Ok(()) => Detection { version: None, error: Some("no runtime found".into()) },
        Err(e) => Detection { version: None, error: Some(format!("{:#010X} {}", e.code().0, e.message())) },
    }
}

#[cfg(not(windows))]
pub fn detect() -> Detection {
    Detection { version: None, error: Some("WebView2 is Windows-only".into()) }
}

/// Run before `tauri::Builder::run`. Returns false when startup must stop.
#[cfg(windows)]
pub fn preflight() -> bool {
    let started = std::time::Instant::now();
    let d = detect();
    match d.version {
        Some(v) => {
            log(&format!("webview2 ok: runtime {v} ({} us)", started.elapsed().as_micros()));
            true
        }
        None => {
            let err = d.error.unwrap_or_default();
            log(&format!("webview2 MISSING: {err}; env override={:?}", override_folder()));
            let mut msg = String::from(
                "DEX needs the Microsoft Edge WebView2 Runtime, but it could not be found on this PC.\n\n",
            );
            if let Some(dir) = override_folder() {
                msg.push_str(&format!(
                    "Note: WEBVIEW2_BROWSER_EXECUTABLE_FOLDER is set to\n{dir}\nwhich does not contain a usable runtime. Removing that variable may fix this.\n\n"
                ));
            }
            msg.push_str(&format!(
                "Details: {err}\n\nOpen Microsoft's official WebView2 download page now? \
                 Install the Evergreen runtime for your PC, then start DEX again."
            ));
            if ask_yes_no("DEX — WebView2 Runtime required", &msg) {
                let _ = open::that(DOWNLOAD_PAGE);
            }
            false
        }
    }
}

#[cfg(not(windows))]
pub fn preflight() -> bool {
    true
}

fn override_folder() -> Option<String> {
    std::env::var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER").ok().filter(|s| !s.is_empty())
}

/// Show a fatal startup error (after logging it). Used when the event loop or
/// the webview fails to start, replacing the old silent `.expect` exit.
pub fn fatal(context: &str, detail: &str) {
    log(&format!("FATAL {context}: {detail}"));
    let msg = format!(
        "DEX could not start.\n\n{context}:\n{detail}\n\nA log was saved to:\n{}",
        log_path().display()
    );
    show_error("DEX — startup failed", &msg);
}

/// Persist panics to the startup log. Release builds have no console, so
/// without this a panic during setup leaves no trace at all.
pub fn install_panic_logger() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log(&format!("PANIC {info}"));
        prev(info);
    }));
}

static PAGE_LOADED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Called from the Builder's page-load hook: the main webview exists and is
/// navigating, so the WebView2 controller was created successfully.
pub fn mark_page_loaded() {
    PAGE_LOADED.store(true, std::sync::atomic::Ordering::SeqCst);
}

/// WebView2 controller creation is asynchronous: when it fails (damaged
/// runtime, a profile locked by a process started with different options,
/// security software blocking msedgewebview2.exe) the error never reaches
/// `Builder::run`'s Result — the app just sits with an empty window and no
/// WebView2 processes. Turn that silent hang into a logged, explained error.
pub fn start_load_watchdog(timeout: std::time::Duration) {
    crate::util::spawn_named("webview2", move || {
        std::thread::sleep(timeout);
        if PAGE_LOADED.load(std::sync::atomic::Ordering::SeqCst) {
            return;
        }
        let detected = detect().version.unwrap_or_else(|| "not found".into());
        log(&format!("WATCHDOG main webview not loaded after {}s (runtime: {detected})", timeout.as_secs()));
        show_error(
            "DEX — window did not load",
            &format!(
                "DEX's web engine (Microsoft Edge WebView2, runtime: {detected}) did not start \
                 within {} seconds.\n\n\
                 Common causes:\n\
                 - another copy of DEX is still closing: close it and try again\n\
                 - a damaged WebView2 install: repair it from Settings > Apps > Installed apps > \
                 Microsoft Edge WebView2 Runtime > Modify\n\
                 - security software blocking msedgewebview2.exe\n\n\
                 A log was saved to:\n{}",
                timeout.as_secs(),
                log_path().display()
            ),
        );
    });
}

/// `diagnostics:getWebView2` — detection details for Settings/support.
pub fn status_json() -> Value {
    let d = detect();
    json!({
        "installed": d.version.is_some(),
        "version": d.version,
        "error": d.error,
        "envOverride": override_folder(),
        "registry": registry_versions(),
        "processArch": std::env::consts::ARCH,
        "osArch": os_arch(),
        "linkage": if cfg!(target_env = "msvc") { "static" } else { "dynamic" },
        "downloadPage": DOWNLOAD_PAGE,
        "startupLog": log_path().to_string_lossy(),
    })
}

fn os_arch() -> String {
    // A 32-bit process on 64-bit Windows sees the real arch in *W6432.
    std::env::var("PROCESSOR_ARCHITEW6432")
        .or_else(|_| std::env::var("PROCESSOR_ARCHITECTURE"))
        .unwrap_or_default()
}

/// Registry `pv` values under the three documented locations (64-bit
/// per-machine lives under WOW6432Node). Diagnostic only — detection itself
/// uses the loader API above. Lazy (only on the diagnostics call) because it
/// shells out to reg.exe.
#[cfg(windows)]
fn registry_versions() -> Value {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let keys = [
        ("HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients", "machine-wow64"),
        ("HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients", "machine"),
        ("HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients", "user"),
    ];
    let mut out = serde_json::Map::new();
    for (root, label) in keys {
        let key = format!("{root}\\{RUNTIME_CLIENT_GUID}");
        let pv = std::process::Command::new("reg")
            .args(["query", &key, "/v", "pv"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .find(|l| l.trim_start().starts_with("pv"))
                    .and_then(|l| l.split_whitespace().last().map(str::to_string))
            })
            // "0.0.0.0" marks a runtime that was uninstalled but left its key.
            .filter(|v| v != "0.0.0.0");
        out.insert(label.into(), json!(pv));
    }
    Value::Object(out)
}

#[cfg(not(windows))]
fn registry_versions() -> Value {
    Value::Null
}

#[cfg(windows)]
mod msgbox {
    use std::ffi::c_void;
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: *mut c_void, text: *const u16, caption: *const u16, utype: u32) -> i32;
    }
    const MB_YESNO: u32 = 0x4;
    const MB_ICONERROR: u32 = 0x10;
    const MB_SETFOREGROUND: u32 = 0x1_0000;
    const IDYES: i32 = 6;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    pub fn show(title: &str, text: &str, yes_no: bool) -> bool {
        let flags = MB_ICONERROR | MB_SETFOREGROUND | if yes_no { MB_YESNO } else { 0 };
        let (t, c) = (wide(text), wide(title));
        unsafe { MessageBoxW(std::ptr::null_mut(), t.as_ptr(), c.as_ptr(), flags) == IDYES }
    }
}

#[cfg(windows)]
fn ask_yes_no(title: &str, text: &str) -> bool {
    msgbox::show(title, text, true)
}

#[cfg(windows)]
fn show_error(title: &str, text: &str) {
    msgbox::show(title, text, false);
}

#[cfg(not(windows))]
fn show_error(title: &str, text: &str) {
    eprintln!("{title}: {text}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_path_is_under_identifier() {
        let p = log_path();
        assert!(p.ends_with(PathBuf::from(IDENTIFIER).join("logs").join("startup.log")));
    }

    #[test]
    fn status_json_has_stable_shape() {
        let s = status_json();
        for k in ["installed", "version", "error", "processArch", "linkage", "downloadPage", "startupLog"] {
            assert!(s.get(k).is_some(), "missing key {k}");
        }
        assert_eq!(s["installed"].as_bool(), Some(s["version"].is_string()));
    }

    #[cfg(windows)]
    #[test]
    fn detects_runtime_consistently_with_error_field() {
        let d = detect();
        // Either a version or an error — never both, never neither.
        assert!(d.version.is_some() ^ d.error.is_some());
    }
}
