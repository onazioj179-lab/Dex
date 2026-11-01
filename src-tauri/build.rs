fn main() {
    guard_windows_gnu_release();
    tauri_build::build();
}

/// Refuse Windows-GNU release builds. webview2-com-sys links the WebView2
/// loader statically only on MSVC; on GNU the exe imports `WebView2Loader.dll`,
/// which the Tauri bundler does not ship. The resulting installer produces an
/// exe Windows will not even start ("WebView2Loader.dll was not found") — the
/// v6.0.x "WebView2 runtime not found" bug, even with the runtime installed.
/// Build with the MSVC toolchain (`rustup default stable-msvc`, needs VS Build
/// Tools). Set DEX_ALLOW_GNU_RELEASE=1 only for throwaway local binaries.
fn guard_windows_gnu_release() {
    println!("cargo:rerun-if-env-changed=DEX_ALLOW_GNU_RELEASE");
    let var = |k: &str| std::env::var(k).unwrap_or_default();
    if var("CARGO_CFG_TARGET_OS") == "windows"
        && var("CARGO_CFG_TARGET_ENV") == "gnu"
        && var("PROFILE") == "release"
        && std::env::var_os("DEX_ALLOW_GNU_RELEASE").is_none()
    {
        eprintln!(
            "error: DEX release builds must use the MSVC Rust toolchain.\n\
             The GNU toolchain links WebView2Loader.dll dynamically and the installer\n\
             does not ship it, so the installed app fails to start.\n\
             Fix: rustup default stable-x86_64-pc-windows-msvc  (or: cargo +stable-msvc ...)\n\
             Override (not for shipping): set DEX_ALLOW_GNU_RELEASE=1"
        );
        std::process::exit(1);
    }
}
