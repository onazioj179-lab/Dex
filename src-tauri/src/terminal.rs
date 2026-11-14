// =============================================================================
// DEX 7.0.1 — Terminal / PTY service (real pseudoterminal)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Shell sessions for the Terminal panel (DexCode). Each session is a REAL
//! pseudoterminal via `portable-pty`: ConPTY on Windows, openpty on unix. The
//! shell sees a TTY, so prompts, line editing (PSReadLine / readline), colours,
//! cursor movement, full-screen programs and interactive REPLs behave as they do
//! in Windows Terminal. The renderer is a terminal emulator (xterm.js) that sends
//! raw keystrokes and reports its geometry; `pty:resize` resizes the pseudoconsole.
//!
//! Replaces the 6.x piped-stdio port of Electron's PtyService (no TTY: no prompt
//! from many tools, no colour detection, resize was a no-op).
//!
//! IPC surface (routed by the `pty:` prefix in `dex_ipc`, contract unchanged):
//!   pty:spawn / pty:create ({ shell?, cwd?, cols?, rows? }) -> { sessionId, shell, cwd, pty:true } | { error }
//!   pty:write     ({ sessionId, data })         -> { success } | { success:false, error }
//!   pty:read      ({ sessionId })               -> { success, alive, data, code? }  (pull-drain output)
//!   pty:resize    ({ sessionId, cols, rows })   -> { success, cols, rows }  (resizes the pseudoconsole)
//!   pty:kill / pty:destroy ({ sessionId })      -> { success }
//!   pty:getSize   ({ sessionId })               -> { found, cols, rows }
//!   pty:getStatus ({ sessionId })               -> { alive, exists, code?, shell?, cwd?, cols?, rows? }
//!   pty:list      ()                            -> { sessions: [{ id, shell, cwd, alive }] }
//! Events emitted to the renderer (via `native_ops::emit_event`):
//!   "pty:data" { sessionId, data }
//!   "pty:exit" { sessionId, code }
//!
//! Teardown: a waiter thread owns the child and blocks in `wait()`. On exit it
//! removes the session from the map and drops the master OUTSIDE the state lock
//! (on Windows `ClosePseudoConsole` can wait for the output pipe to drain, and the
//! reader thread takes the same lock to buffer output, so dropping under the lock
//! could deadlock). Closing the master ends the reader. Whichever of the two
//! threads finishes second emits `pty:exit`, so trailing output always arrives
//! before the exit event.

use crate::util::LockSafe;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Manager;

const MAX_SESSIONS: usize = 16;
const MIN_COLS: u16 = 2;
const MIN_ROWS: u16 = 1;
const MAX_DIM: u16 = 1000;

/// One live pseudoterminal session.
pub struct Session {
    id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    /// Pending output for the pull-based `pty:read` channel (capped at MAX_BUFFER).
    buffer: String,
}

/// Exit record retained briefly after a session ends so `pty:getStatus` /
/// `pty:read` can still report the final code and drain trailing output.
struct ExitRecord {
    code: Option<i32>,
    buffer: String,
}

#[derive(Default)]
pub struct Inner {
    sessions: HashMap<String, Session>,
    recent_exits: HashMap<String, ExitRecord>,
    next_id: u32,
}

/// Hard cap on a session's retained output buffer (bytes).
const MAX_BUFFER: usize = 256 * 1024;
/// Cap on retained exit records so a churny session list cannot leak memory.
const MAX_RECENT_EXITS: usize = 32;

/// Tauri-managed terminal state (registered in `setup()`).
pub type TerminalState = Mutex<Inner>;

/// Shared between a session's reader and waiter threads.
struct Teardown {
    /// How many of the two threads (reader, waiter) have finished.
    done: AtomicU8,
    code: Mutex<Option<i32>>,
}

fn home_dir() -> String {
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".into())
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME").unwrap_or_else(|_| "/".into())
    }
}

fn exists_abs(p: &str) -> bool {
    let path = std::path::Path::new(p);
    path.is_absolute() && path.exists()
}

/// Resolve a shell that actually exists, mirroring the Electron candidate chain.
/// Always ends in a shell that is effectively always present (cmd.exe / /bin/sh)
/// so a missing pwsh/zsh can never leave us unspawnable.
fn resolve_shell() -> (String, Vec<String>) {
    #[cfg(windows)]
    {
        let sys_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        let pf = std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files".into());
        let pwsh = format!("{}\\PowerShell\\7\\pwsh.exe", pf);
        let powershell = format!(
            "{}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
            sys_root
        );
        let cmd = std::env::var("COMSPEC").unwrap_or_else(|_| format!("{}\\System32\\cmd.exe", sys_root));
        if exists_abs(&pwsh) {
            return (pwsh, vec!["-NoLogo".into()]);
        }
        if exists_abs(&powershell) {
            return (powershell, vec!["-NoLogo".into()]);
        }
        (cmd, vec![])
    }
    #[cfg(not(windows))]
    {
        if let Ok(user_shell) = std::env::var("SHELL") {
            if exists_abs(&user_shell) {
                return (user_shell, vec!["-i".into()]);
            }
        }
        if cfg!(target_os = "macos") && exists_abs("/bin/zsh") {
            return ("/bin/zsh".into(), vec!["-i".into()]);
        }
        if exists_abs("/bin/bash") {
            return ("/bin/bash".into(), vec!["-i".into()]);
        }
        ("/bin/sh".into(), vec!["-i".into()])
    }
}

/// Shells installed on this machine, for the terminal's profile menu. Only
/// fixed, well-known locations are probed (no PATH walk); every entry passes
/// `shell_allowed`, so the renderer can hand `path` straight back to `pty:spawn`.
fn installed_shells() -> Vec<(String, String, String)> {
    let mut out: Vec<(String, String, String)> = Vec::new();
    let mut add = |id: &str, label: &str, path: String| {
        if exists_abs(&path) && shell_allowed(&path) && !out.iter().any(|(_, _, p)| p.eq_ignore_ascii_case(&path)) {
            out.push((id.to_string(), label.to_string(), path));
        }
    };
    #[cfg(windows)]
    {
        let sys_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        let pf = std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files".into());
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        add("pwsh", "PowerShell 7", format!("{pf}\\PowerShell\\7\\pwsh.exe"));
        add("powershell", "Windows PowerShell", format!("{sys_root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"));
        add("cmd", "Command Prompt", format!("{sys_root}\\System32\\cmd.exe"));
        add("git-bash", "Git Bash", format!("{pf}\\Git\\bin\\bash.exe"));
        if !local.is_empty() {
            add("git-bash", "Git Bash", format!("{local}\\Programs\\Git\\bin\\bash.exe"));
        }
        // wsl.exe ships with Windows even when no Linux distribution is set up;
        // starting it then begins a WSL download that asks for elevation. Only
        // offer it when a distribution is registered.
        if wsl_has_distribution() {
            add("wsl", "WSL", format!("{sys_root}\\System32\\wsl.exe"));
        }
    }
    #[cfg(not(windows))]
    {
        add("zsh", "zsh", "/bin/zsh".into());
        add("bash", "bash", "/bin/bash".into());
        add("fish", "fish", "/usr/bin/fish".into());
        add("sh", "sh", "/bin/sh".into());
    }
    out
}

/// True when `reg query` output for the Lxss key lists at least one distribution.
fn lxss_lists_distribution(reg_output: &str) -> bool {
    reg_output.lines().any(|l| {
        let t = l.trim_start();
        t.starts_with("DistributionName") && t.split_whitespace().nth(2).is_some_and(|name| !name.is_empty())
    })
}

/// Whether WSL has a Linux distribution registered for this user (read-only
/// registry query; never runs wsl.exe, which would offer to install WSL).
#[cfg(windows)]
fn wsl_has_distribution() -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("reg")
        .args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss", "/s", "/v", "DistributionName"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .is_some_and(|o| lxss_lists_distribution(&String::from_utf8_lossy(&o.stdout)))
}

#[cfg(not(windows))]
fn wsl_has_distribution() -> bool {
    false
}

fn is_wsl(shell: &str) -> bool {
    shell.rsplit(['\\', '/']).next().is_some_and(|b| b.eq_ignore_ascii_case("wsl.exe") || b.eq_ignore_ascii_case("wsl"))
}

fn list_shells() -> Value {
    let (default, _) = resolve_shell();
    let shells: Vec<Value> = installed_shells()
        .into_iter()
        .map(|(id, label, path)| {
            let is_default = path.eq_ignore_ascii_case(&default);
            json!({ "id": id, "label": label, "path": path, "default": is_default })
        })
        .collect();
    json!({ "shells": shells, "default": default })
}

/// Whether a caller-supplied shell override is a recognized shell binary (matched
/// by basename) — stops a compromised renderer from launching an arbitrary PATH
/// executable via `pty:spawn` while still allowing a legitimate custom shell.
fn shell_allowed(req: &str) -> bool {
    const ALLOWED: &[&str] = &[
        "pwsh", "pwsh.exe", "powershell", "powershell.exe", "cmd", "cmd.exe", "bash",
        "bash.exe", "zsh", "sh", "fish", "dash", "nu", "nu.exe", "git-bash.exe", "wsl.exe",
        "ksh", "tcsh", "csh",
    ];
    let base = std::path::Path::new(req)
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !ALLOWED.contains(&base.as_str()) {
        return false;
    }
    // Absolute overrides must exist; bare names resolve on PATH at spawn time.
    !std::path::Path::new(req).is_absolute() || std::path::Path::new(req).exists()
}

/// Default arguments for a shell chosen by basename (correct even when the caller
/// overrode the resolved default — avoids carrying e.g. pwsh's `-NoLogo` to cmd).
fn args_for(shell: &str) -> Vec<String> {
    let base = std::path::Path::new(shell)
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match base.as_str() {
        "pwsh" | "pwsh.exe" | "powershell" | "powershell.exe" => vec!["-NoLogo".into()],
        "cmd" | "cmd.exe" => vec![],
        // Interactive unix shells.
        "bash" | "bash.exe" | "zsh" | "sh" | "fish" | "dash" | "ksh" | "tcsh" | "csh" => {
            vec!["-i".into()]
        }
        _ => vec![],
    }
}

fn cap_buffer(buf: &mut String) {
    if buf.len() > MAX_BUFFER {
        let mut cut = buf.len() - MAX_BUFFER;
        while cut < buf.len() && !buf.is_char_boundary(cut) {
            cut += 1;
        }
        buf.drain(..cut);
    }
}

/// Append a chunk to a session's pull buffer (for `pty:read`). After the session
/// has been torn down, trailing output lands in its exit record instead.
fn push_session_buffer(app: &tauri::AppHandle, id: &str, data: &str) {
    let state = app.state::<TerminalState>();
    let mut inner = state.lock_safe();
    if let Some(s) = inner.sessions.get_mut(id) {
        s.buffer.push_str(data);
        cap_buffer(&mut s.buffer);
    } else if let Some(rec) = inner.recent_exits.get_mut(id) {
        rec.buffer.push_str(data);
        cap_buffer(&mut rec.buffer);
    }
}

/// Split `bytes` into the longest valid-UTF-8 prefix (decoded) and an incomplete
/// trailing sequence to carry into the next read. A multi-byte character split
/// across two reads would otherwise decode as two U+FFFD replacement chars
/// (box-drawing, emoji and non-Latin output from ConPTY hit this constantly).
pub(crate) fn decode_utf8_stream(carry: &mut Vec<u8>, bytes: &[u8]) -> String {
    carry.extend_from_slice(bytes);
    let mut out = String::new();
    loop {
        match std::str::from_utf8(carry) {
            Ok(s) => {
                out.push_str(s);
                carry.clear();
                return out;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                out.push_str(std::str::from_utf8(&carry[..valid]).unwrap_or(""));
                match e.error_len() {
                    // Incomplete sequence at the end: keep it for the next read.
                    None => {
                        carry.drain(..valid);
                        return out;
                    }
                    // Genuinely invalid bytes: replace and continue after them.
                    Some(bad) => {
                        out.push('\u{FFFD}');
                        carry.drain(..valid + bad);
                    }
                }
            }
        }
    }
}

fn finish_part(app: &tauri::AppHandle, id: &str, td: &Teardown) {
    // fetch_add returns the previous value: 1 means this thread finished second.
    if td.done.fetch_add(1, Ordering::AcqRel) == 1 {
        let code = td.code.lock().ok().and_then(|c| *c);
        crate::native_ops::emit_event(app, "pty:exit", &json!({ "sessionId": id, "code": code }));
    }
}

/// Stream the pseudoterminal's output to the renderer as `pty:data` events.
fn spawn_reader(app: tauri::AppHandle, id: String, mut reader: Box<dyn Read + Send>, td: Arc<Teardown>) {
    crate::util::spawn_named("terminal-read", move || {
        let mut buf = [0u8; 16384];
        let mut carry: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = decode_utf8_stream(&mut carry, &buf[..n]);
                    if data.is_empty() {
                        continue;
                    }
                    push_session_buffer(&app, &id, &data);
                    crate::native_ops::emit_event(&app, "pty:data", &json!({ "sessionId": id, "data": data }));
                }
                Err(_) => break,
            }
        }
        finish_part(&app, &id, &td);
    });
}

/// Wait for the shell to exit, then tear the session down (see module docs).
fn spawn_waiter(
    app: tauri::AppHandle,
    id: String,
    mut child: Box<dyn portable_pty::Child + Send + Sync>,
    td: Arc<Teardown>,
) {
    crate::util::spawn_named("terminal-wait", move || {
        let code = child.wait().ok().map(|st| st.exit_code() as i32);
        { let mut c = td.code.lock_safe();
            *c = code;
        }
        let state = app.state::<TerminalState>();
        let session = match state.lock() {
            Ok(mut inner) => {
                let s = inner.sessions.remove(&id);
                if let Some(ref sess) = s {
                    if inner.recent_exits.len() >= MAX_RECENT_EXITS {
                        if let Some(k) = inner.recent_exits.keys().next().cloned() {
                            inner.recent_exits.remove(&k);
                        }
                    }
                    inner.recent_exits.insert(id.clone(), ExitRecord { code, buffer: sess.buffer.clone() });
                }
                s
            }
            Err(_) => None,
        };
        // Lock released: closing the pseudoconsole may wait for the reader.
        drop(session);
        finish_part(&app, &id, &td);
    });
}

/// Make Ctrl+C reach programs run in the terminal.
///
/// Windows keeps an "ignore Ctrl+C" flag per process that children inherit.
/// When DEX is started by something that set it (Git Bash, some launchers and
/// scripts do), every shell DEX spawns inherits it and `CTRL_C_EVENT` from the
/// pseudoconsole is dropped, so `^C` cannot stop `ping -t`, a dev server, etc.
/// Restoring normal processing in DEX before the first spawn fixes all
/// children. Runs once; harmless when the flag was not set.
#[cfg(windows)]
fn restore_ctrl_c_for_children() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        #[link(name = "kernel32")]
        extern "system" {
            fn SetConsoleCtrlHandler(
                handler: Option<unsafe extern "system" fn(u32) -> i32>,
                add: i32,
            ) -> i32;
        }
        // SAFETY: NULL handler + FALSE only clears the process's ignore-Ctrl+C
        // flag; no callback is registered and no memory is passed.
        unsafe {
            SetConsoleCtrlHandler(None, 0);
        }
    });
}

#[cfg(not(windows))]
fn restore_ctrl_c_for_children() {}

fn clamp_dim(v: Option<u64>, default: u16, min: u16) -> u16 {
    v.map(|n| n.min(MAX_DIM as u64) as u16).unwrap_or(default).max(min)
}

fn spawn_session(app: &tauri::AppHandle, opts: &Value) -> Value {
    {
        let state = app.state::<TerminalState>();
        let inner = state.lock_safe();
        if inner.sessions.len() >= MAX_SESSIONS {
            return json!({ "error": format!("Maximum {} terminal sessions reached.", MAX_SESSIONS) });
        }
    }

    let (def_shell, _) = resolve_shell();
    let mut shell = def_shell;
    if let Some(req) = opts.get("shell").and_then(|v| v.as_str()) {
        if shell_allowed(req) {
            shell = req.to_string();
        }
    }
    if is_wsl(&shell) && !wsl_has_distribution() {
        // A saved profile can still name WSL; don't let it start an install.
        return json!({ "error": "WSL has no Linux distribution installed. Install one yourself (for example `wsl --install` in an administrator terminal), then open a WSL tab again." });
    }
    let args = args_for(&shell);

    let cwd = opts
        .get("cwd")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty() && std::path::Path::new(s).is_dir())
        .map(|s| s.to_string())
        .unwrap_or_else(home_dir);
    let cols = clamp_dim(opts.get("cols").and_then(|v| v.as_u64()), 80, MIN_COLS);
    let rows = clamp_dim(opts.get("rows").and_then(|v| v.as_u64()), 24, MIN_ROWS);

    restore_ctrl_c_for_children();
    let pty = native_pty_system();
    let pair = match pty.openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }) {
        Ok(p) => p,
        Err(e) => return json!({ "error": format!("Could not open a pseudoterminal: {e}") }),
    };

    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(&args);
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "DEX");

    let child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("Could not start {shell}: {e}") }),
    };
    // The child holds its own handle to the slave side.
    drop(pair.slave);

    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => return json!({ "error": format!("terminal output unavailable: {e}") }),
    };
    let writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => return json!({ "error": format!("terminal input unavailable: {e}") }),
    };
    let killer = child.clone_killer();

    let id = {
        let state = app.state::<TerminalState>();
        let mut inner = state.lock_safe();
        inner.next_id += 1;
        let id = format!("pty-{}", inner.next_id);
        inner.sessions.insert(
            id.clone(),
            Session {
                id: id.clone(),
                shell: shell.clone(),
                cwd: cwd.clone(),
                cols,
                rows,
                master: pair.master,
                writer,
                killer,
                buffer: String::new(),
            },
        );
        id
    };

    let td = Arc::new(Teardown { done: AtomicU8::new(0), code: Mutex::new(None) });
    spawn_reader(app.clone(), id.clone(), reader, td.clone());
    spawn_waiter(app.clone(), id.clone(), child, td);

    json!({ "sessionId": id, "shell": shell, "cwd": cwd, "pty": true })
}

fn write_session(app: &tauri::AppHandle, opts: &Value) -> Value {
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let data = opts.get("data").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let mut inner = state.lock_safe();
    match inner.sessions.get_mut(sid) {
        Some(s) => match s.writer.write_all(data.as_bytes()).and_then(|_| s.writer.flush()) {
            Ok(_) => json!({ "success": true }),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        },
        None => json!({ "success": false, "error": "Unknown session" }),
    }
}

fn resize_session(app: &tauri::AppHandle, opts: &Value) -> Value {
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let mut inner = state.lock_safe();
    match inner.sessions.get_mut(sid) {
        Some(s) => {
            let cols = clamp_dim(opts.get("cols").and_then(|v| v.as_u64()), s.cols, MIN_COLS);
            let rows = clamp_dim(opts.get("rows").and_then(|v| v.as_u64()), s.rows, MIN_ROWS);
            if cols == s.cols && rows == s.rows {
                return json!({ "success": true, "cols": cols, "rows": rows });
            }
            match s.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }) {
                Ok(_) => {
                    s.cols = cols;
                    s.rows = rows;
                    json!({ "success": true, "cols": cols, "rows": rows })
                }
                Err(e) => json!({ "success": false, "error": e.to_string() }),
            }
        }
        None => json!({ "success": false }),
    }
}

fn kill_session(app: &tauri::AppHandle, opts: &Value) -> Value {
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let mut inner = state.lock_safe();
    // Kill but leave the entry; the waiter reaps the child, tears the session
    // down and (with the reader) emits `pty:exit` — one teardown path.
    match inner.sessions.get_mut(sid) {
        Some(s) => {
            let _ = s.killer.kill();
            json!({ "success": true })
        }
        None => json!({ "success": false }),
    }
}

fn list_sessions(app: &tauri::AppHandle) -> Value {
    let state = app.state::<TerminalState>();
    let inner = state.lock_safe();
    let sessions: Vec<Value> = inner
        .sessions
        .values()
        .map(|s| json!({ "id": s.id, "shell": s.shell, "cwd": s.cwd, "alive": true }))
        .collect();
    json!({ "sessions": sessions })
}

/// Return the pseudoconsole geometry for a session (last spawn/`pty:resize`). Reports `found:false` for an unknown/exited session.
fn get_size(app: &tauri::AppHandle, opts: &Value) -> Value {
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let inner = state.lock_safe();
    match inner.sessions.get(sid) {
        Some(s) => json!({ "found": true, "cols": s.cols, "rows": s.rows }),
        None => json!({ "found": false, "cols": 0, "rows": 0 }),
    }
}

/// Report liveness for a session: `alive:true` while the child runs; once it has
/// exited (and been finalized) `alive:false` with the retained exit `code`. An id
/// never seen yields `{ alive:false, exists:false }`.
fn get_status(app: &tauri::AppHandle, opts: &Value) -> Value {
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let inner = state.lock_safe();
    if let Some(s) = inner.sessions.get(sid) {
        return json!({
            "alive": true,
            "exists": true,
            "shell": s.shell,
            "cwd": s.cwd,
            "cols": s.cols,
            "rows": s.rows,
        });
    }
    if let Some(rec) = inner.recent_exits.get(sid) {
        return json!({ "alive": false, "exists": true, "code": rec.code });
    }
    json!({ "alive": false, "exists": false })
}

/// Pull-drain a session's buffered output (alternative to subscribing to the
/// `pty:data` event stream). Returns the accumulated text and clears it. After a
/// session exits, its final undrained output is still readable once from the
/// retained exit record, which is then removed.
fn read_session(app: &tauri::AppHandle, opts: &Value) -> Value {
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let mut inner = state.lock_safe();
    if let Some(s) = inner.sessions.get_mut(sid) {
        let data = std::mem::take(&mut s.buffer);
        return json!({ "success": true, "alive": true, "data": data });
    }
    // Session already exited: hand back its trailing output once, then drop it.
    if let Some(rec) = inner.recent_exits.remove(sid) {
        return json!({ "success": true, "alive": false, "code": rec.code, "data": rec.buffer });
    }
    json!({ "success": false, "error": "Unknown session", "data": "" })
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let opts = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        "pty:spawn" | "pty:create" => spawn_session(app, &opts),
        "pty:write" => write_session(app, &opts),
        "pty:read" => read_session(app, &opts),
        "pty:resize" => resize_session(app, &opts),
        "pty:kill" | "pty:destroy" => kill_session(app, &opts),
        "pty:getSize" => get_size(app, &opts),
        "pty:getStatus" => get_status(app, &opts),
        "pty:list" => list_sessions(app),
        "pty:shells" => list_shells(),
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_utf8_stream, exists_abs, installed_shells, is_wsl, list_shells, lxss_lists_distribution, resolve_shell, shell_allowed};

    #[test]
    fn utf8_split_across_reads_is_reassembled() {
        let bytes = "a─b😀c".as_bytes();
        let mut carry = Vec::new();
        let mut out = String::new();
        for chunk in bytes.chunks(1) {
            out.push_str(&decode_utf8_stream(&mut carry, chunk));
        }
        assert_eq!(out, "a─b😀c");
        assert!(carry.is_empty());
    }

    #[test]
    fn invalid_bytes_are_replaced_not_stuck() {
        let mut carry = Vec::new();
        let out = decode_utf8_stream(&mut carry, &[b'x', 0xFF, b'y']);
        assert_eq!(out, "x\u{FFFD}y");
        assert!(carry.is_empty());
    }

    #[test]
    fn installed_shells_exist_and_are_spawnable() {
        let shells = installed_shells();
        assert!(!shells.is_empty(), "at least the system shell is always present");
        for (_, _, path) in &shells {
            assert!(exists_abs(path), "{path} must exist");
            assert!(shell_allowed(path), "{path} must be accepted by pty:spawn");
        }
        let (default, _) = resolve_shell();
        assert!(shells.iter().any(|(_, _, p)| p.eq_ignore_ascii_case(&default)), "the default shell is listed");
        let v = list_shells();
        assert_eq!(v["shells"].as_array().unwrap().iter().filter(|s| s["default"] == true).count(), 1);
    }

    #[test]
    fn wsl_is_offered_only_with_a_distribution() {
        let none = "ERROR: The system was unable to find the specified registry key or value.";
        assert!(!lxss_lists_distribution(none));
        assert!(!lxss_lists_distribution(""));
        let one = "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss\\{5c0d}\r\n    DistributionName    REG_SZ    Ubuntu\r\n\r\nEnd of search: 1 match(es) found.\r\n";
        assert!(lxss_lists_distribution(one));
        assert!(is_wsl("C:\\WINDOWS\\System32\\wsl.exe"));
        assert!(is_wsl("WSL.EXE"));
        assert!(!is_wsl("C:\\Program Files\\Git\\bin\\bash.exe"));
    }

    #[test]
    fn incomplete_tail_is_carried() {
        let mut carry = Vec::new();
        let euro = "€".as_bytes();
        assert_eq!(decode_utf8_stream(&mut carry, &euro[..2]), "");
        assert_eq!(carry.len(), 2);
        assert_eq!(decode_utf8_stream(&mut carry, &euro[2..]), "€");
    }
}
