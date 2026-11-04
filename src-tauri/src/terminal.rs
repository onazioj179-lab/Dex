// =============================================================================
// DEX 6.0 — Terminal / PTY service (Electron PtyService parity, native)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! In-app shell-session manager for the terminal panel (DexCode + Nexus). A
//! faithful port of `src/main/core/PtyService.ts`: like the Electron version it
//! uses piped stdio over `std::process::Command` (NOT a real PTY / node-pty), so
//! it works on every platform with no native build tools. Output is streamed to
//! the renderer with the same event contract.
//!
//! IPC surface (routed by the `pty:` prefix in `dex_ipc`):
//!   pty:spawn / pty:create ({ shell?, cwd?, cols?, rows? }) -> { sessionId } | { error }
//!   pty:write     ({ sessionId, data })         -> { success } | { success:false, error }
//!   pty:read      ({ sessionId })               -> { success, alive, data, code? }  (pull-drain output)
//!   pty:resize    ({ sessionId, cols, rows })   -> { success }   (no-op; geometry only)
//!   pty:kill / pty:destroy ({ sessionId })      -> { success }
//!   pty:getSize   ({ sessionId })               -> { found, cols, rows }
//!   pty:getStatus ({ sessionId })               -> { alive, exists, code?, shell?, cwd?, cols?, rows? }
//!   pty:list      ()                            -> { sessions: [{ id, shell, cwd, alive }] }
//! Events emitted to the renderer (via `native_ops::emit_event`):
//!   "pty:data" { sessionId, data }
//!   "pty:exit" { sessionId, code }

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

const MAX_SESSIONS: usize = 16;

/// One live shell session. The `Child` is kept so `kill`/exit-reaping can act on
/// it; `stdin` is split out so `pty:write` can feed keystrokes without locking
/// the child handle.
pub struct Session {
    id: String,
    shell: String,
    cwd: String,
    cols: u32,
    rows: u32,
    child: Child,
    stdin: Option<ChildStdin>,
    /// Pending output for the pull-based `pty:read` channel. The reader threads
    /// append decoded chunks here in addition to emitting `pty:data` events, so a
    /// renderer can either subscribe to events OR poll `pty:read` (or both).
    /// Capped at `MAX_BUFFER` bytes — oldest data is dropped to bound memory.
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
    /// Recently-exited sessions (bounded), keyed by id. Lets a renderer that
    /// polls observe the exit + any final output it had not yet read.
    recent_exits: HashMap<String, ExitRecord>,
    next_id: u32,
}

/// Hard cap on a session's retained output buffer (bytes). Keeps a long-lived
/// session from growing unbounded when the renderer never drains via `pty:read`.
const MAX_BUFFER: usize = 256 * 1024;
/// Cap on retained exit records so a churny session list cannot leak memory.
const MAX_RECENT_EXITS: usize = 32;

/// Tauri-managed terminal state (registered in `setup()`).
pub type TerminalState = Mutex<Inner>;

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

/// Append a chunk to a session's pull buffer (for `pty:read`), capped at
/// MAX_BUFFER with oldest bytes dropped on a UTF-8 boundary. Kept as a free fn so
/// the `State` guard is cleanly scoped (avoids an NLL borrow issue in the reader
/// thread loop).
fn push_session_buffer(app: &tauri::AppHandle, id: &str, data: &str) {
    let state = app.state::<TerminalState>();
    let mut inner = match state.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if let Some(s) = inner.sessions.get_mut(id) {
        s.buffer.push_str(data);
        if s.buffer.len() > MAX_BUFFER {
            let overflow = s.buffer.len() - MAX_BUFFER;
            let mut cut = overflow;
            while cut < s.buffer.len() && !s.buffer.is_char_boundary(cut) {
                cut += 1;
            }
            s.buffer.drain(..cut);
        }
    }
}

/// Stream a child's stdout/stderr to the renderer as `pty:data` events. The
/// primary (stdout) reader finalizes the session on EOF — reaps the child for its
/// exit code and emits `pty:exit`.
fn spawn_reader<R: Read + Send + 'static>(
    app: tauri::AppHandle,
    id: String,
    mut reader: R,
    finalize_on_eof: bool,
) {
    crate::util::spawn_named("terminal", move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    // Append to the session's pull buffer (for `pty:read`) before
                    // emitting the push event, so a poller never misses a chunk.
                    push_session_buffer(&app, &id, &data);
                    crate::native_ops::emit_event(
                        &app,
                        "pty:data",
                        &json!({ "sessionId": id, "data": data }),
                    );
                }
                Err(_) => break,
            }
        }
        if finalize_on_eof {
            finalize(&app, &id);
        }
    });
}

/// Remove a session and emit its `pty:exit` (with the reaped exit code). Idempotent
/// — if it was already removed (e.g. a concurrent `pty:kill` then this EOF), this
/// is a no-op.
fn finalize(app: &tauri::AppHandle, id: &str) {
    let state = app.state::<TerminalState>();
    let session = match state.lock() {
        Ok(mut inner) => inner.sessions.remove(id),
        Err(_) => return,
    };
    if let Some(mut s) = session {
        let code = s.child.wait().ok().and_then(|st| st.code());
        // Retain the exit code + any undrained output so a polling renderer can
        // still observe them via `pty:getStatus` / `pty:read` after teardown.
        if let Ok(mut inner) = state.lock() {
            if inner.recent_exits.len() >= MAX_RECENT_EXITS {
                // Evict an arbitrary old record to keep the map bounded.
                if let Some(k) = inner.recent_exits.keys().next().cloned() {
                    inner.recent_exits.remove(&k);
                }
            }
            inner.recent_exits.insert(
                id.to_string(),
                ExitRecord { code, buffer: std::mem::take(&mut s.buffer) },
            );
        }
        crate::native_ops::emit_event(app, "pty:exit", &json!({ "sessionId": id, "code": code }));
    }
}

fn spawn_session(app: &tauri::AppHandle, opts: &Value) -> Value {
    let state = app.state::<TerminalState>();
    let mut inner = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "error": "terminal state unavailable" }),
    };
    if inner.sessions.len() >= MAX_SESSIONS {
        return json!({ "error": format!("Maximum {} terminal sessions reached.", MAX_SESSIONS) });
    }

    let (def_shell, _) = resolve_shell();
    let mut shell = def_shell;
    if let Some(req) = opts.get("shell").and_then(|v| v.as_str()) {
        if shell_allowed(req) {
            shell = req.to_string();
        }
    }
    let args = args_for(&shell);

    let cwd = opts
        .get("cwd")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(home_dir);
    let cols = opts.get("cols").and_then(|v| v.as_u64()).unwrap_or(80).max(1) as u32;
    let rows = opts.get("rows").and_then(|v| v.as_u64()).unwrap_or(24).max(1) as u32;

    let mut cmd = Command::new(&shell);
    cmd.args(&args)
        .current_dir(&cwd)
        .env("TERM", "xterm-256color")
        .env("COLORTERM", "truecolor")
        .env("COLUMNS", cols.to_string())
        .env("LINES", rows.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW (Electron windowsHide parity)
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        // ENOENT / unspawnable shell surfaces here synchronously; the renderer's
        // spawn-failure path shows "terminal unavailable" instead of looping.
        Err(e) => return json!({ "error": e.to_string() }),
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();

    inner.next_id += 1;
    let id = format!("pty-{}", inner.next_id);
    inner.sessions.insert(
        id.clone(),
        Session {
            id: id.clone(),
            shell: shell.clone(),
            cwd,
            cols,
            rows,
            child,
            stdin,
            buffer: String::new(),
        },
    );
    drop(inner); // release the lock before starting the reader threads

    if let Some(out) = stdout {
        spawn_reader(app.clone(), id.clone(), out, true);
    }
    if let Some(err) = stderr {
        spawn_reader(app.clone(), id.clone(), err, false);
    }

    json!({ "sessionId": id })
}

fn write_session(app: &tauri::AppHandle, opts: &Value) -> Value {
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let data = opts.get("data").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let mut inner = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false, "error": "terminal state unavailable" }),
    };
    match inner.sessions.get_mut(sid) {
        Some(s) => match s.stdin.as_mut() {
            Some(stdin) => match stdin.write_all(data.as_bytes()).and_then(|_| stdin.flush()) {
                Ok(_) => json!({ "success": true }),
                Err(e) => json!({ "success": false, "error": e.to_string() }),
            },
            None => json!({ "success": false, "error": "session stdin closed" }),
        },
        None => json!({ "success": false, "error": "Unknown session" }),
    }
}

fn resize_session(app: &tauri::AppHandle, opts: &Value) -> Value {
    // Pipe-based stdio has no real TTY, so this only records geometry (matches
    // Electron, which keeps cols/rows for fit-addon and best-effort SIGWINCH).
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let mut inner = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false }),
    };
    match inner.sessions.get_mut(sid) {
        Some(s) => {
            if let Some(c) = opts.get("cols").and_then(|v| v.as_u64()) {
                if c > 0 {
                    s.cols = c as u32;
                }
            }
            if let Some(r) = opts.get("rows").and_then(|v| v.as_u64()) {
                if r > 0 {
                    s.rows = r as u32;
                }
            }
            json!({ "success": true })
        }
        None => json!({ "success": false }),
    }
}

fn kill_session(app: &tauri::AppHandle, opts: &Value) -> Value {
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let mut inner = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false }),
    };
    // Kill but leave the entry; the stdout reader hits EOF and `finalize` reaps it
    // and emits `pty:exit` (single source of truth for session teardown).
    match inner.sessions.get_mut(sid) {
        Some(s) => {
            let _ = s.child.kill();
            json!({ "success": true })
        }
        None => json!({ "success": false }),
    }
}

fn list_sessions(app: &tauri::AppHandle) -> Value {
    let state = app.state::<TerminalState>();
    let inner = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "sessions": [] }),
    };
    let sessions: Vec<Value> = inner
        .sessions
        .values()
        .map(|s| json!({ "id": s.id, "shell": s.shell, "cwd": s.cwd, "alive": true }))
        .collect();
    json!({ "sessions": sessions })
}

/// Return the recorded geometry for a session. Pipe-based stdio has no real TTY,
/// so cols/rows are the values last set by `pty:resize`/spawn (what the fit-addon
/// drives). Reports `found:false` for an unknown/exited session.
fn get_size(app: &tauri::AppHandle, opts: &Value) -> Value {
    let sid = opts.get("sessionId").and_then(|v| v.as_str()).unwrap_or_default();
    let state = app.state::<TerminalState>();
    let inner = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "found": false, "cols": 0, "rows": 0 }),
    };
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
    let inner = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "alive": false, "exists": false }),
    };
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
    let mut inner = match state.lock() {
        Ok(g) => g,
        Err(_) => return json!({ "success": false, "error": "terminal state unavailable", "data": "" }),
    };
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
        _ => Value::Null,
    }
}
