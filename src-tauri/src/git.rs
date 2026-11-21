// =============================================================================
// DEX Tauri — Git subsystem (Electron->Tauri port of GitController.ts, Tier 5/43)
// Pure Rust: shells out to the system `git` binary via std::process::Command
// (arg arrays, no shell -> no injection). Return shapes match the Electron
// GitController EXACTLY so the same renderer (GitClient.tsx) works on both shells.
// Non-DB, so it routes by `git:` prefix straight from dex_ipc (no Connection).
// =============================================================================

use serde_json::{json, Value};
use std::io::{self, Read};
use std::path::Path;
use std::process::{Command, Stdio};

const STATUS_BYTES: usize = 4 * 1024 * 1024;
const PATCH_BYTES: usize = 128 * 1024;
const STATUS_FILES: usize = 2_000;

struct ProjectGitOutput {
    code: Option<i32>,
    bytes: Vec<u8>,
    limited: bool,
}

fn project_git(
    cwd: &Path,
    config: &[String],
    args: &[&str],
    limit: usize,
) -> io::Result<ProjectGitOutput> {
    let mut command = Command::new("git");
    command
        .current_dir(cwd)
        .args([
            "--no-pager",
            "--no-optional-locks",
            "--literal-pathspecs",
            "-c",
            "core.fsmonitor=false",
        ])
        .args(config)
        .args(args)
        .env("LC_ALL", "C")
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_COMMON_DIR")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn()?;
    let mut bytes = Vec::new();
    let output = child
        .stdout
        .take()
        .expect("Git stdout was piped")
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes);
    let limited = bytes.len() > limit;
    if limited || output.is_err() {
        let _ = child.kill();
    }
    let code = child.wait()?.code();
    output?;
    bytes.truncate(limit);
    Ok(ProjectGitOutput {
        code,
        bytes,
        limited,
    })
}

fn project_filters(root: &Path) -> Result<Vec<String>, String> {
    let result = project_git(
        root,
        &[],
        &[
            "config",
            "--null",
            "--name-only",
            "--get-regexp",
            "^filter\\.",
        ],
        PATCH_BYTES,
    )
    .map_err(|_| "Git could not be started. Check that Git is installed.")?;
    if result.limited || !matches!(result.code, Some(0 | 1)) {
        return Err("Git could not read its filter configuration.".into());
    }
    let names = std::str::from_utf8(&result.bytes).map_err(|_| "Git filter names are invalid.")?;
    let mut config = Vec::new();
    for name in names.split_terminator('\0') {
        let Some((driver, setting)) = name.rsplit_once('.') else {
            continue;
        };
        match setting {
            "process" | "clean" | "smudge" => {
                config.extend(["-c".into(), format!("{driver}.{setting}=")])
            }
            "required" => config.extend(["-c".into(), format!("{driver}.{setting}=false")]),
            _ => {}
        }
    }
    Ok(config)
}

fn project_prefix(root: &Path) -> Result<String, String> {
    let result = project_git(root, &[], &["rev-parse", "--show-prefix"], PATCH_BYTES)
        .map_err(|_| "Git could not be started. Check that Git is installed.")?;
    if result.limited || result.code != Some(0) {
        return Err("Git could not open a repository in this project.".into());
    }
    String::from_utf8(result.bytes)
        .map(|prefix| prefix.trim_end_matches(['\r', '\n']).to_string())
        .map_err(|_| "The repository path is not UTF-8.".into())
}

fn project_status_records(prefix: &str, bytes: &[u8], truncated: bool, max_files: usize) -> Value {
    // Porcelain -z keeps filenames literal, including spaces, arrows and newlines.
    // Rename/copy records carry the destination first and origin in the next field.
    let mut records = bytes
        .split_inclusive(|byte| *byte == 0)
        .filter_map(|record| record.strip_suffix(&[0]));
    let mut branch = None;
    let mut files = Vec::new();
    let mut limited = truncated;
    while let Some(record) = records.next() {
        if let Some(info) = record.strip_prefix(b"## ") {
            branch = Some(String::from_utf8_lossy(info).into_owned());
            continue;
        }
        if record.len() < 4 || record[2] != b' ' {
            continue;
        }
        let rename = matches!(record[0], b'R' | b'C') || matches!(record[1], b'R' | b'C');
        let source = rename.then(|| records.next()).flatten();
        if rename && source.is_none() {
            break;
        }
        let Some(name) = std::str::from_utf8(&record[3..])
            .ok()
            .and_then(|path| path.strip_prefix(prefix))
        else {
            continue;
        };
        if files.len() == max_files {
            limited = true;
            break;
        }
        let previous = source
            .and_then(|path| std::str::from_utf8(path).ok())
            .and_then(|path| path.strip_prefix(prefix));
        let untracked = record[..2] == *b"??";
        files.push(json!({ "path": name, "previousPath": previous,
            "index": char::from(record[0]), "work": char::from(record[1]),
            "staged": !untracked && record[0] != b' ', "untracked": untracked }));
    }
    json!({ "success": true, "branch": branch, "files": files, "limited": limited })
}

pub fn project_status(root: &Path) -> Result<Value, String> {
    let prefix = project_prefix(root)?;
    let config = project_filters(root)?;
    let result = project_git(
        root,
        &config,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "-b",
            "--untracked-files=all",
            "--ignore-submodules=all",
            "--",
            ".",
        ],
        STATUS_BYTES,
    )
    .map_err(|error| error.to_string())?;
    if !result.limited && result.code != Some(0) {
        return Err("Git could not list changes in this project.".into());
    }
    let repository_root = root
        .ancestors()
        .nth(prefix.split('/').filter(|part| !part.is_empty()).count())
        .ok_or("The Git repository root could not be determined.")?;
    let mut status = project_status_records(&prefix, &result.bytes, result.limited, STATUS_FILES);
    status["repositoryRoot"] = json!(repository_root);
    Ok(status)
}

fn project_pathspec(path: &str) -> Result<String, String> {
    if path.is_empty()
        || path.contains('\0')
        || path.split('/').any(|part| matches!(part, "" | "." | ".."))
        || (cfg!(windows) && path.contains(['\\', ':']))
    {
        return Err("The diff path must be inside this project.".into());
    }
    Ok(format!("./{path}"))
}

pub fn project_diff(
    root: &Path,
    path: &str,
    previous: Option<&str>,
    staged: bool,
) -> Result<Value, String> {
    let path = project_pathspec(path)?;
    let previous = previous.map(project_pathspec).transpose()?;
    let config = project_filters(root)?;
    let mut args = vec![
        "diff",
        "--relative",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--ignore-submodules=all",
    ];
    if staged {
        args.push("--cached");
    }
    args.extend(["--", &path]);
    if let Some(previous) = &previous {
        args.push(previous);
    }
    let result =
        project_git(root, &config, &args, PATCH_BYTES).map_err(|error| error.to_string())?;
    if !result.limited && result.code != Some(0) {
        return Err("Git could not read this diff.".into());
    }
    Ok(
        json!({ "success": true, "patch": String::from_utf8_lossy(&result.bytes), "limited": result.limited }),
    )
}

/// Run a git subcommand in `cwd`. Returns (ok, stdout, stderr).
fn run_git(cwd: &str, args: &[&str]) -> (bool, String, String) {
    if cwd.is_empty() || !Path::new(cwd).is_dir() {
        return (false, String::new(), "Invalid or missing directory".into());
    }
    match Command::new("git").arg("--literal-pathspecs").args(args).current_dir(cwd).output() {
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

/// Renderer-supplied paths are passed literally after the Git option separator.
fn arg_paths(args: &Value, i: usize) -> Vec<String> {
    args.get(i)
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .filter(|s| !s.is_empty() && !s.contains('\0'))
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

    let (ok_st, out, _) = run_git(cwd, &["status", "--porcelain=v1", "-z", "-b", "--untracked-files=all"]);
    if !ok_st {
        return json!({ "isRepo": true, "root": repo_root, "branch": Value::Null, "upstream": Value::Null, "ahead": 0, "behind": 0, "files": [] });
    }

    let mut branch: Option<String> = None;
    let mut upstream: Option<String> = None;
    let mut ahead: i64 = 0;
    let mut behind: i64 = 0;
    let mut status = project_status_records("", out.as_bytes(), false, usize::MAX);
    if let Some(info) = status["branch"].as_str() {
        let summary = info.strip_prefix("No commits yet on ").unwrap_or(info);
        if summary != "HEAD (no branch)" {
            let branch_part = summary.split(' ').next().unwrap_or("");
            let mut parts = branch_part.split("...");
            branch = parts.next().map(str::to_string);
            upstream = parts.next().map(str::to_string);
        }
        if let Some(p) = info.find("ahead ") {
            ahead = info[p + 6..].chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0);
        }
        if let Some(p) = info.find("behind ") {
            behind = info[p + 7..].chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0);
        }
    }

    json!({
        "isRepo": true,
        "root": repo_root,
        "branch": branch,
        "upstream": upstream,
        "ahead": ahead,
        "behind": behind,
        "files": status["files"].take(),
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
            let (k, out, _) = run_git(&cwd, &["diff", "--", &file]);
            Value::String(if k { out } else { String::new() })
        }
        _ => Value::Null,
    }
}

#[cfg(test)]
mod project_tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let tag = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("dex-git-{}-{tag}", std::process::id()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn git(&self, args: &[&str]) {
            let result = Command::new("git")
                .args(args)
                .current_dir(&self.0)
                .output()
                .unwrap();
            assert!(
                result.status.success(),
                "{}",
                String::from_utf8_lossy(&result.stderr)
            );
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let parent = std::env::temp_dir().canonicalize().unwrap();
            if let Ok(path) = self.0.canonicalize() {
                if path.parent() == Some(parent.as_path())
                    && path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| name.starts_with("dex-git-"))
                {
                    let _ = fs::remove_dir_all(path);
                }
            }
        }
    }

    #[test]
    fn status_and_diff_use_literal_files_inside_the_selected_subdirectory() {
        let fixture = Fixture::new();
        let root = fixture.0.join("selected project");
        fs::create_dir(&root).unwrap();
        fixture.git(&["init", "-q", "-b", "main"]);
        fixture.git(&["config", "user.name", "DEX Test"]);
        fixture.git(&["config", "user.email", "dex-test@example.invalid"]);
        fixture.git(&["config", "commit.gpgsign", "false"]);
        fs::write(root.join("[draft] file.txt"), "original line\n").unwrap();
        fs::write(root.join("old.txt"), "unchanged rename\n").unwrap();
        fs::write(fixture.0.join("sibling.txt"), "outside original\n").unwrap();
        fixture.git(&["add", "--", "."]);
        fixture.git(&["commit", "-qm", "Fixture baseline"]);
        fs::write(root.join("[draft] file.txt"), "staged line\n").unwrap();
        fixture.git(&[
            "--literal-pathspecs",
            "add",
            "--",
            "selected project/[draft] file.txt",
        ]);
        fixture.git(&[
            "mv",
            "selected project/old.txt",
            "selected project/new file.txt",
        ]);
        fs::write(root.join("[draft] file.txt"), "working line\n").unwrap();
        fs::write(root.join("-untracked.txt"), "new file\n").unwrap();
        fs::write(fixture.0.join("sibling.txt"), "outside changed\n").unwrap();
        fixture.git(&[
            "config",
            "filter.dex-test.clean",
            "echo filter-fired > filter-marker",
        ]);
        fixture.git(&["config", "filter.dex-test.required", "true"]);
        fs::write(root.join(".gitattributes"), "*.txt filter=dex-test\n").unwrap();

        let status = project_status(&root).unwrap();
        assert_eq!(status["branch"], "main");
        assert_eq!(status["repositoryRoot"], json!(fixture.0));
        let files = status["files"].as_array().unwrap();
        assert!(files.iter().all(|file| file["path"] != "sibling.txt"));
        assert!(files.iter().any(|file| file["path"] == "[draft] file.txt"
            && file["index"] == "M"
            && file["work"] == "M"));
        assert!(files
            .iter()
            .any(|file| file["path"] == "new file.txt" && file["previousPath"] == "old.txt"));
        assert!(files
            .iter()
            .any(|file| file["path"] == "-untracked.txt" && file["index"] == "?"));
        let staged = project_diff(&root, "[draft] file.txt", None, true).unwrap();
        assert!(staged["patch"].as_str().unwrap().contains("+staged line"));
        let work = project_diff(&root, "[draft] file.txt", None, false).unwrap();
        assert!(work["patch"].as_str().unwrap().contains("+working line"));
        let renamed = project_diff(&root, "new file.txt", Some("old.txt"), true).unwrap();
        assert!(renamed["patch"]
            .as_str()
            .unwrap()
            .contains("rename to new file.txt"));
        assert!(project_diff(&root, "../sibling.txt", None, false).is_err());
        assert!(!fixture.0.join("filter-marker").exists());
    }

    #[test]
    fn scoped_status_keeps_literal_names_and_skips_partial_records() {
        let result = project_status_records(
            "nested/",
            b"## main\0 M nested/a -> b\n.txt\0R  nested/new\0nested/old\0?? nested/partial",
            true,
            STATUS_FILES,
        );
        assert_eq!(result["limited"], true);
        let files = result["files"].as_array().unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0]["path"], "a -> b\n.txt");
        assert_eq!(files[1]["previousPath"], "old");
    }
}
