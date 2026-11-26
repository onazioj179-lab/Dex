// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//! Native PTY lifecycle, window-scoped IPC and bounded terminal delivery.

use crate::terminal_pty::{self, Process, Terminal, Utf8Stream};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{self, Read, Write};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{self, SyncSender, TrySendError},
    Arc, Mutex,
};
use tauri::{Emitter, Manager};

const MAX_SESSIONS: usize = 16;
const MAX_RECENT_EXITS: usize = 32;
const MAX_BUFFER: usize = 256 * 1024;
const MAX_INPUT: usize = 64 * 1024;

struct Output {
    buffer: String,
    attached: bool,
}

struct Io {
    terminal: Option<Terminal>,
    input: Option<SyncSender<String>>,
    size: portable_pty::PtySize,
}

struct Session {
    id: String,
    owner: String,
    shell: String,
    cwd: String,
    io: Mutex<Io>,
    output: Mutex<Output>,
    child_exited: AtomicBool,
}

struct ExitRecord {
    id: String,
    owner: String,
    code: Option<u32>,
    output: Output,
}

#[derive(Default)]
pub struct Inner {
    sessions: HashMap<String, Arc<Session>>,
    exits: VecDeque<ExitRecord>,
    next_id: u64,
}

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
        let cmd =
            std::env::var("COMSPEC").unwrap_or_else(|_| format!("{}\\System32\\cmd.exe", sys_root));
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

/// Default arguments for a shell chosen by basename (correct even when the caller
/// overrode the resolved default — avoids carrying e.g. pwsh's `-NoLogo` to cmd).
fn args_for(shell: &str) -> Vec<String> {
    let base = std::path::Path::new(shell)
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match base.as_str() {
        "pwsh" | "pwsh.exe" | "powershell" | "powershell.exe" => vec!["-NoLogo".into()],
        "cmd" | "cmd.exe" => vec!["/D".into()],
        // Interactive unix shells.
        "bash" | "bash.exe" | "zsh" | "sh" | "fish" | "dash" | "ksh" | "tcsh" | "csh" => {
            vec!["-i".into()]
        }
        _ => vec![],
    }
}

fn profile_paths() -> Vec<(&'static str, String)> {
    #[cfg(windows)]
    let candidates = {
        let system = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        let programs = std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files".into());
        vec![
            (
                "PowerShell 7",
                format!("{programs}\\PowerShell\\7\\pwsh.exe"),
            ),
            (
                "Windows PowerShell",
                format!("{system}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
            ),
            ("Command Prompt", format!("{system}\\System32\\cmd.exe")),
        ]
    };
    #[cfg(not(windows))]
    let candidates = [
        ("Bash", "/bin/bash"),
        ("Zsh", "/bin/zsh"),
        ("Fish", "/usr/bin/fish"),
        ("POSIX shell", "/bin/sh"),
    ]
    .into_iter()
    .map(|(name, path)| (name, path.to_owned()))
    .collect::<Vec<_>>();
    candidates
        .into_iter()
        .filter(|(_, path)| std::path::Path::new(path).is_file())
        .collect()
}

fn requested_profile(request: &str) -> Option<String> {
    let path = std::path::Path::new(request);
    let canonical = path
        .is_absolute()
        .then(|| path.canonicalize().ok())
        .flatten();
    let (default, _) = resolve_shell();
    profile_paths()
        .into_iter()
        .map(|(_, profile)| profile)
        .chain([default])
        .find(|profile| {
            let profile = std::path::Path::new(profile);
            if let Some(canonical) = &canonical {
                return profile
                    .canonicalize()
                    .is_ok_and(|installed| &installed == canonical);
            }
            if path.components().count() != 1 {
                return false;
            }
            let name = profile
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            #[cfg(windows)]
            return name.eq_ignore_ascii_case(request)
                || name
                    .strip_suffix(".exe")
                    .is_some_and(|name| name.eq_ignore_ascii_case(request));
            #[cfg(not(windows))]
            return name == request;
        })
}

fn emit_data(app: &tauri::AppHandle, owner: &str, id: &str, data: &str) {
    if !data.is_empty() {
        let _ = app.emit_to(owner, "pty:data", json!({ "sessionId": id, "data": data }));
    }
}

fn finish(app: &tauri::AppHandle, session: &Session, code: Option<u32>) {
    let state = app.state::<TerminalState>();
    let Ok(mut state) = state.lock() else { return };
    if state.sessions.remove(&session.id).is_none() {
        return;
    }
    let Ok(mut output) = session.output.lock() else {
        return;
    };
    if output.attached {
        let _ = app.emit_to(
            session.owner.as_str(),
            "pty:exit",
            json!({ "sessionId": session.id, "code": code }),
        );
    }
    if state.exits.len() == MAX_RECENT_EXITS {
        state.exits.pop_front();
    }
    state.exits.push_back(ExitRecord {
        id: session.id.clone(),
        owner: session.owner.clone(),
        code,
        output: Output {
            buffer: std::mem::take(&mut output.buffer),
            attached: output.attached,
        },
    });
}

impl Session {
    fn publish(&self, app: &tauri::AppHandle, data: &str) {
        let Ok(mut output) = self.output.lock() else {
            return;
        };
        output.buffer.push_str(data);
        let mut cut = output.buffer.len().saturating_sub(MAX_BUFFER);
        while !output.buffer.is_char_boundary(cut) {
            cut += 1;
        }
        output.buffer.drain(..cut);
        if output.attached {
            emit_data(app, &self.owner, &self.id, data);
        }
    }

    fn terminate(&self) -> Result<(), String> {
        let mut io = self.io.lock().map_err(|_| "Terminal state unavailable")?;
        if !self.child_exited.load(Ordering::Acquire) {
            if let Some(terminal) = io.terminal.as_mut() {
                terminal.kill().map_err(|error| error.to_string())?;
            }
        }
        io.input.take();
        Ok(())
    }
}

fn spawn_session(app: &tauri::AppHandle, owner: &str, opts: &Value) -> Result<Value, String> {
    let state = app.state::<TerminalState>();
    let mut state = state.lock().map_err(|_| "Terminal state unavailable")?;
    if app.get_webview_window(owner).is_none() {
        return Err("Terminal window is closed.".into());
    }
    if state.sessions.len() >= MAX_SESSIONS {
        return Err(format!("Maximum {MAX_SESSIONS} terminal sessions reached."));
    }
    let (mut shell, _) = resolve_shell();
    if let Some(requested) = opts["shell"].as_str().filter(|shell| !shell.is_empty()) {
        shell = requested_profile(requested)
            .ok_or("The selected terminal shell is unavailable or unsupported.")?;
    }
    let cwd = opts["cwd"]
        .as_str()
        .filter(|cwd| !cwd.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(home_dir);
    let size = terminal_pty::size(
        opts["cols"].as_u64().unwrap_or(80),
        opts["rows"].as_u64().unwrap_or(24),
    );
    let Process {
        mut child,
        mut reader,
        mut writer,
        terminal,
        startup,
    } = terminal_pty::spawn(&shell, &args_for(&shell), &cwd, size)?;
    let (send_input, receive_input) = mpsc::sync_channel::<String>(32);
    let (send_code, receive_code) = mpsc::sync_channel(1);
    state.next_id += 1;
    let id = format!("pty-{}", state.next_id);
    let session = Arc::new(Session {
        id: id.clone(),
        owner: owner.to_owned(),
        shell,
        cwd,
        io: Mutex::new(Io {
            terminal: Some(terminal),
            input: Some(send_input),
            size,
        }),
        output: Mutex::new(Output {
            buffer: String::new(),
            attached: opts["deferEvents"].as_bool() != Some(true),
        }),
        child_exited: AtomicBool::new(false),
    });
    state.sessions.insert(id.clone(), Arc::clone(&session));
    drop(state);

    std::thread::spawn(move || {
        if terminal_pty::prepare_input(startup, &mut *writer).is_err() {
            return;
        }
        for data in receive_input {
            if writer
                .write_all(data.as_bytes())
                .and_then(|_| writer.flush())
                .is_err()
            {
                break;
            }
        }
    });
    let waiting = Arc::clone(&session);
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|status| status.exit_code());
        waiting.child_exited.store(true, Ordering::Release);
        let terminal = if let Ok(mut io) = waiting.io.lock() {
            io.input.take();
            io.terminal.take()
        } else {
            None
        };
        // Keep the output reader running while the console is closed, then
        // let the reader deliver the exit after it has drained the final text.
        drop(terminal);
        let _ = send_code.send(code);
    });
    let app = app.clone();
    std::thread::spawn(move || {
        let mut decoder = Utf8Stream::default();
        let mut buffer = [0; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => session.publish(&app, &decoder.decode(&buffer[..count])),
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
        session.publish(&app, &decoder.finish());
        finish(&app, &session, receive_code.recv().unwrap_or(None));
    });
    Ok(json!({ "sessionId": id, "interactive": true }))
}

fn attach(
    app: &tauri::AppHandle,
    owner: &str,
    id: &str,
    state: &mut Inner,
) -> Result<Value, String> {
    if let Some(session) = state
        .sessions
        .get(id)
        .filter(|session| session.owner == owner)
    {
        let mut output = session
            .output
            .lock()
            .map_err(|_| "Terminal output unavailable")?;
        if !output.attached {
            emit_data(app, owner, id, &output.buffer);
            output.attached = true;
        }
        return Ok(json!({ "success": true, "alive": true }));
    }
    let Some(record) = state
        .exits
        .iter_mut()
        .find(|record| record.owner == owner && record.id == id)
    else {
        return Err("Unknown terminal session".into());
    };
    if !record.output.attached {
        emit_data(app, owner, id, &record.output.buffer);
        let _ = app.emit_to(
            owner,
            "pty:exit",
            json!({ "sessionId": id, "code": record.code }),
        );
        record.output.attached = true;
    }
    Ok(json!({ "success": true, "alive": false, "code": record.code }))
}

fn request(
    app: &tauri::AppHandle,
    owner: &str,
    channel: &str,
    opts: &Value,
) -> Result<Value, String> {
    if channel == "pty:listProfiles" {
        let profiles: Vec<Value> = profile_paths()
            .into_iter()
            .map(|(label, shell)| json!({ "label": label, "shell": shell }))
            .collect();
        return Ok(json!({ "profiles": profiles }));
    }
    if matches!(channel, "pty:spawn" | "pty:create") {
        return spawn_session(app, owner, opts);
    }
    let id = opts["sessionId"].as_str().unwrap_or_default();
    let state = app.state::<TerminalState>();
    let mut state = state.lock().map_err(|_| "Terminal state unavailable")?;
    if channel == "pty:list" {
        let sessions: Vec<Value> = state
            .sessions
            .values()
            .filter(|session| session.owner == owner)
            .map(|session| {
                json!({ "id": session.id, "shell": session.shell, "cwd": session.cwd,
                "alive": !session.child_exited.load(Ordering::Acquire) })
            })
            .collect();
        return Ok(json!({ "sessions": sessions }));
    }
    if channel == "pty:attach" {
        return attach(app, owner, id, &mut state);
    }
    let session = state
        .sessions
        .get(id)
        .filter(|session| session.owner == owner)
        .cloned();
    let Some(session) = session else {
        let exit = state
            .exits
            .iter()
            .position(|record| record.owner == owner && record.id == id);
        return match channel {
            "pty:getSize" => Ok(json!({ "found": false, "cols": 0, "rows": 0 })),
            "pty:getStatus" => Ok(match exit {
                Some(index) => json!({ "alive": false, "exists": true, "code": state.exits[index].code }),
                None => json!({ "alive": false, "exists": false }),
            }),
            "pty:read" => exit.and_then(|index| state.exits.remove(index))
                .map(|record| json!({ "success": true, "alive": false, "code": record.code, "data": record.output.buffer }))
                .ok_or_else(|| "Unknown terminal session".into()),
            _ => Err("Unknown terminal session".into()),
        };
    };
    drop(state);
    if matches!(channel, "pty:kill" | "pty:destroy") {
        session.terminate()?;
        return Ok(json!({ "success": true }));
    }
    if channel == "pty:read" {
        let mut output = session
            .output
            .lock()
            .map_err(|_| "Terminal output unavailable")?;
        return Ok(
            json!({ "success": true, "alive": true, "data": std::mem::take(&mut output.buffer) }),
        );
    }
    let mut io = session
        .io
        .lock()
        .map_err(|_| "Terminal state unavailable")?;
    let size = io.size;
    match channel {
        "pty:write" => {
            let data = opts["data"].as_str().ok_or("Missing terminal input")?;
            if data.len() > MAX_INPUT {
                return Err("Terminal input exceeds 64 KiB.".into());
            }
            let input = io.input.as_ref().ok_or("Terminal input is closed")?;
            input
                .try_send(data.to_owned())
                .map_err(|error| match error {
                    TrySendError::Full(_) => "Terminal input queue is full.",
                    TrySendError::Disconnected(_) => "Terminal input is closed.",
                })?;
            Ok(json!({ "success": true }))
        }
        "pty:resize" => {
            let cols = opts["cols"]
                .as_u64()
                .filter(|value| *value > 0)
                .unwrap_or(size.cols.into());
            let rows = opts["rows"]
                .as_u64()
                .filter(|value| *value > 0)
                .unwrap_or(size.rows.into());
            let next = terminal_pty::size(cols, rows);
            if next != size {
                io.terminal
                    .as_ref()
                    .ok_or("Terminal already closed")?
                    .resize(next)?;
                io.size = next;
            }
            Ok(json!({ "success": true }))
        }
        "pty:getSize" => Ok(json!({ "found": true, "cols": size.cols, "rows": size.rows })),
        "pty:getStatus" => Ok(
            json!({ "alive": !session.child_exited.load(Ordering::Acquire), "exists": true,
            "shell": session.shell, "cwd": session.cwd, "cols": size.cols, "rows": size.rows }),
        ),
        _ => Ok(Value::Null),
    }
}

pub fn close_window(app: &tauri::AppHandle, owner: &str) {
    let Some(state) = app.try_state::<TerminalState>() else {
        return;
    };
    let Ok(mut state) = state.lock() else { return };
    let mut sessions = Vec::new();
    state.sessions.retain(|_, session| {
        if session.owner != owner {
            return true;
        }
        sessions.push(Arc::clone(session));
        false
    });
    state.exits.retain(|record| record.owner != owner);
    drop(state);
    for session in sessions {
        let _ = session.terminate();
    }
}

pub fn dispatch(app: &tauri::AppHandle, owner: &str, channel: &str, args: &Value) -> Value {
    request(app, owner, channel, &args[0])
        .unwrap_or_else(|error| json!({ "success": false, "error": error }))
}
