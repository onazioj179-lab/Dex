// =============================================================================
// DEX Tauri — Git subsystem (Electron->Tauri port of GitController.ts, Tier 5/43)
// Pure Rust: shells out to the system `git` binary via std::process::Command
// (arg arrays, no shell -> no injection). Return shapes match the Electron
// GitController EXACTLY so the same renderer (GitClient.tsx) works on both shells.
// Non-DB, so it routes by `git:` prefix straight from dex_ipc (no Connection).
// =============================================================================

use serde_json::{json, Value};
use std::path::Path;
use std::process::Command;

/// Run a git subcommand in `cwd`. Returns (ok, stdout, stderr).
fn run_git(cwd: &str, args: &[&str]) -> (bool, String, String) {
    if cwd.is_empty() || !Path::new(cwd).is_dir() {
        return (false, String::new(), "Invalid or missing directory".into());
    }
    match Command::new("git").args(args).current_dir(cwd).output() {
        Ok(o) => (
            o.status.success(),
            String::from_utf8_lossy(&o.stdout).to_string(),
            String::from_utf8_lossy(&o.stderr).to_string(),
        ),
        Err(e) => (false, String::new(), e.to_string()),
    }
}

fn arg_str(args: &Value, i: usize) -> String {
    args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

/// Renderer-supplied path list -> safe `git` arguments (drop empties / option-like).
fn arg_paths(args: &Value, i: usize) -> Vec<String> {
    args.get(i)
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .filter(|s| !s.is_empty() && !s.starts_with('-'))
                .map(String::from)
                .take(5000)
                .collect()
        })
        .unwrap_or_default()
}

fn ok(message: &str) -> Value { json!({ "success": true, "message": message }) }
fn fail(message: &str) -> Value {
    let m = message.trim();
    json!({ "success": false, "message": if m.is_empty() { "Git command failed" } else { m } })
}

fn get_status(cwd: &str) -> Value {
    let empty = json!({ "isRepo": false, "root": Value::Null, "branch": Value::Null, "upstream": Value::Null, "ahead": 0, "behind": 0, "files": [] });
    let (ok_root, root_out, _) = run_git(cwd, &["rev-parse", "--show-toplevel"]);
    if !ok_root { return empty; }
    let repo_root = root_out.trim().to_string();

    let (ok_st, out, _) = run_git(cwd, &["status", "--porcelain=v1", "-b", "--untracked-files=all"]);
    if !ok_st {
        return json!({ "isRepo": true, "root": repo_root, "branch": Value::Null, "upstream": Value::Null, "ahead": 0, "behind": 0, "files": [] });
    }

    let mut branch: Option<String> = None;
    let mut upstream: Option<String> = None;
    let mut ahead: i64 = 0;
    let mut behind: i64 = 0;
    let mut files: Vec<Value> = Vec::new();

    for line in out.lines().filter(|l| !l.is_empty()) {
        if let Some(info) = line.strip_prefix("## ") {
            // e.g. "main...origin/main [ahead 1, behind 2]"
            let branch_part = info.split(' ').next().unwrap_or("");
            let mut it = branch_part.split("...");
            let local = it.next().unwrap_or("");
            branch = if local == "HEAD (no branch)" { None } else { Some(local.to_string()) };
            upstream = it.next().map(|s| s.to_string());
            if let Some(p) = info.find("ahead ") {
                ahead = info[p + 6..].chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0);
            }
            if let Some(p) = info.find("behind ") {
                behind = info[p + 7..].chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0);
            }
            continue;
        }
        let bytes = line.as_bytes();
        let index = if !bytes.is_empty() { bytes[0] as char } else { ' ' };
        let work = if bytes.len() > 1 { bytes[1] as char } else { ' ' };
        let mut file_path = if line.len() > 3 { line[3..].to_string() } else { String::new() };
        if let Some(idx) = file_path.find(" -> ") {
            file_path = file_path[idx + 4..].to_string();
        }
        let untracked = index == '?' && work == '?';
        files.push(json!({
            "path": file_path,
            "index": index.to_string(),
            "work": work.to_string(),
            "staged": !untracked && index != ' ',
            "untracked": untracked,
        }));
    }

    json!({
        "isRepo": true,
        "root": repo_root,
        "branch": branch,
        "upstream": upstream,
        "ahead": ahead,
        "behind": behind,
        "files": files,
    })
}

fn get_log(cwd: &str, count: u64) -> Value {
    let n = count.clamp(1, 500);
    let fmt = "--pretty=format:%H\x1f%h\x1f%an\x1f%ad\x1f%s";
    let n_arg = format!("-n{}", n);
    let (ok_log, out, _) = run_git(cwd, &["log", &n_arg, fmt, "--date=short"]);
    if !ok_log { return json!([]); }
    let commits: Vec<Value> = out
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let mut f = line.split('\x1f');
            json!({
                "hash": f.next().unwrap_or(""),
                "shortHash": f.next().unwrap_or(""),
                "author": f.next().unwrap_or(""),
                "date": f.next().unwrap_or(""),
                "subject": f.next().unwrap_or(""),
            })
        })
        .collect();
    json!(commits)
}

fn get_branches(cwd: &str) -> Value {
    let (ok_cur, cur, _) = run_git(cwd, &["rev-parse", "--abbrev-ref", "HEAD"]);
    let (ok_list, list, _) = run_git(cwd, &["branch", "--format=%(refname:short)"]);
    let branches: Vec<String> = if ok_list {
        list.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
    } else {
        Vec::new()
    };
    json!({ "current": if ok_cur { Value::String(cur.trim().to_string()) } else { Value::Null }, "branches": branches })
}

/// `git:*` dispatcher. `channel` is the full "git:method"; `args` the positional array.
pub fn dispatch(channel: &str, args: &Value) -> Value {
    if channel == "git:check" {
        return match Command::new("git").arg("--version").output() {
            Ok(o) if o.status.success() => json!({ "available": true, "version": String::from_utf8_lossy(&o.stdout).trim() }),
            _ => json!({ "available": false, "version": "" }),
        };
    }

    let cwd = arg_str(args, 0);
    match channel {
        "git:status" => get_status(&cwd),
        "git:log" => get_log(&cwd, args.get(1).and_then(|v| v.as_u64()).unwrap_or(30)),
        "git:branches" => get_branches(&cwd),
        "git:stage" => {
            let paths = arg_paths(args, 1);
            if paths.is_empty() { return fail("No files to stage"); }
            let mut a = vec!["add", "--"];
            a.extend(paths.iter().map(|s| s.as_str()));
            let (k, _, e) = run_git(&cwd, &a);
            if k { ok("Staged") } else { fail(&e) }
        }
        "git:unstage" => {
            let paths = arg_paths(args, 1);
            if paths.is_empty() { return fail("No files to unstage"); }
            let mut a = vec!["restore", "--staged", "--"];
            a.extend(paths.iter().map(|s| s.as_str()));
            let (k, _, e) = run_git(&cwd, &a);
            if k { return ok("Unstaged"); }
            // Fall back to `reset` on older git.
            let mut a2 = vec!["reset", "-q", "HEAD", "--"];
            a2.extend(paths.iter().map(|s| s.as_str()));
            let (k2, _, e2) = run_git(&cwd, &a2);
            if k2 { ok("Unstaged") } else { fail(if e2.is_empty() { &e } else { &e2 }) }
        }
        "git:commit" => {
            let msg = arg_str(args, 1);
            if msg.trim().is_empty() { return fail("Commit message is required"); }
            let (k, out, e) = run_git(&cwd, &["commit", "-m", &msg]);
            if k { ok(out.trim()) } else { fail(if e.is_empty() { out.trim() } else { &e }) }
        }
        "git:push" => {
            let (k, out, e) = run_git(&cwd, &["push"]);
            if k { ok((if e.is_empty() { &out } else { &e }).trim()) } else { fail(if e.is_empty() { &out } else { &e }) }
        }
        "git:pull" => {
            let (k, out, e) = run_git(&cwd, &["pull", "--ff-only"]);
            if k { ok((if out.is_empty() { &e } else { &out }).trim()) } else { fail(if e.is_empty() { &out } else { &e }) }
        }
        "git:checkout" => {
            let branch = arg_str(args, 1);
            if branch.trim().is_empty() || branch.starts_with('-') { return fail("Invalid branch"); }
            let (k, out, e) = run_git(&cwd, &["checkout", &branch]);
            if k { ok((if e.is_empty() { &out } else { &e }).trim()) } else { fail(if e.is_empty() { &out } else { &e }) }
        }
        "git:diff" => {
            let file = arg_str(args, 1);
            if file.starts_with('-') { return Value::String(String::new()); }
            let (k, out, _) = run_git(&cwd, &["diff", "--", &file]);
            Value::String(if k { out } else { String::new() })
        }
        _ => Value::Null,
    }
}
