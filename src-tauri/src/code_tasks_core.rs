// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use crate::terminal_pty::Utf8Stream;
use serde::Serialize;
use serde_json::Value;
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::Duration;

const MANIFEST_LIMIT: u64 = 1024 * 1024;
const OUTPUT_LIMIT: usize = 256 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    id: String,
    label: String,
    command: String,
    category: &'static str,
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    unavailable_reason: Option<&'static str>,
    #[serde(skip)]
    plan: Option<Plan>,
}

#[derive(Clone, Debug)]
struct Plan {
    executable: PathBuf,
    args: Vec<String>,
}

pub fn project_root(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err("An absolute project folder is required.".into());
    }
    let root = path
        .canonicalize()
        .map_err(|error| format!("Cannot open project folder: {error}"))?;
    if !root.is_dir() {
        return Err("The project path is not a folder.".into());
    }
    Ok(root)
}

fn manifest(root: &Path, name: &str) -> Result<Option<Vec<u8>>, String> {
    let path = root.join(name);
    let info = match path.symlink_metadata() {
        Ok(info) => info,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Cannot read {name}: {error}")),
    };
    if !info.is_file() || !path.canonicalize().is_ok_and(|path| path.starts_with(root)) {
        return Err(format!("{name} must be a regular file within the project."));
    }
    let mut contents = Vec::new();
    File::open(path)
        .and_then(|file| file.take(MANIFEST_LIMIT + 1).read_to_end(&mut contents))
        .map_err(|error| format!("Cannot read {name}: {error}"))?;
    if contents.len() as u64 > MANIFEST_LIMIT {
        return Err(format!("{name} is larger than 1 MiB."));
    }
    Ok(Some(contents))
}

fn task_category(name: &str) -> Option<&'static str> {
    if name.is_empty()
        || name.len() > 80
        || !name.as_bytes()[0].is_ascii_alphanumeric()
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b":._-".contains(&byte))
    {
        return None;
    }
    if name == "type-check" {
        return Some("check");
    }
    match name.split([':', '-', '_', '.']).next().unwrap_or_default() {
        "build" => Some("build"),
        "test" => Some("test"),
        "check" | "lint" | "typecheck" => Some("check"),
        _ => None,
    }
}

fn installed_tool<'a>(root: &'a Path, filename: &str) -> impl Iterator<Item = PathBuf> + 'a {
    let name = filename.to_owned();
    let path = std::env::var_os("PATH").unwrap_or_default();
    std::env::split_paths(&path)
        .collect::<Vec<_>>()
        .into_iter()
        .filter_map(move |dir| {
            if !dir.is_absolute() {
                return None;
            }
            let launcher = dir.join(&name);
            let full = launcher.canonicalize().ok()?;
            if full.starts_with(root) || !full.is_file() {
                return None;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if full.metadata().ok()?.permissions().mode() & 0o111 == 0 {
                    return None;
                }
            }
            // Rustup dispatches based on argv[0], including when cargo is a symlink.
            Some(launcher)
        })
}

#[cfg(windows)]
fn npm_plan(root: &Path) -> Option<Plan> {
    for node in installed_tool(root, "node.exe") {
        let cli = node.parent()?.join("node_modules/npm/bin/npm-cli.js");
        if cli.is_file() && cli.canonicalize().is_ok_and(|path| !path.starts_with(root)) {
            return Some(Plan {
                executable: node,
                args: vec![cli.to_string_lossy().into_owned()],
            });
        }
    }
    // Independent npm installs put their launcher on PATH beside the npm tree.
    let node = installed_tool(root, "node.exe").next()?;
    let cli = installed_tool(root, "npm.cmd")
        .filter_map(|launcher| {
            let script = launcher
                .parent()?
                .join("node_modules/npm/bin/npm-cli.js")
                .canonicalize()
                .ok()?;
            (script.is_file() && !script.starts_with(root)).then_some(script)
        })
        .next()?;
    Some(Plan {
        executable: node,
        args: vec![cli.to_string_lossy().into_owned()],
    })
}

#[cfg(not(windows))]
fn npm_plan(root: &Path) -> Option<Plan> {
    Some(Plan {
        executable: installed_tool(root, "npm").next()?,
        args: Vec::new(),
    })
}

#[derive(Serialize)]
pub struct Catalog {
    tasks: Vec<Task>,
    warnings: Vec<String>,
}

fn discover_npm(root: &Path, tasks: &mut Vec<Task>) -> Result<(), String> {
    if let Some(package) = manifest(root, "package.json")? {
        let package: Value = serde_json::from_slice(
            package
                .strip_prefix(&[0xef, 0xbb, 0xbf])
                .unwrap_or(&package),
        )
        .map_err(|error| format!("Cannot parse package.json: {error}"))?;
        if let Some(scripts) = package["scripts"].as_object() {
            let npm = npm_plan(root);
            for (name, script) in scripts {
                let Some(category) = task_category(name) else {
                    continue;
                };
                if !script
                    .as_str()
                    .is_some_and(|script| !script.trim().is_empty())
                {
                    continue;
                }
                let plan = npm.clone().map(|mut plan| {
                    plan.args.extend(["run".to_owned(), name.to_owned()]);
                    plan
                });
                tasks.push(Task {
                    id: format!("npm:{name}"),
                    label: format!("npm {name}"),
                    command: format!("npm run {name}"),
                    category,
                    available: plan.is_some(),
                    unavailable_reason: plan
                        .is_none()
                        .then_some("Node.js and npm must be available on PATH."),
                    plan,
                });
            }
        }
    }
    Ok(())
}

pub fn discover(root: &Path) -> Catalog {
    let mut tasks = Vec::new();
    let mut warnings = Vec::new();
    if let Err(error) = discover_npm(root, &mut tasks) {
        warnings.push(error);
    }
    match manifest(root, "Cargo.toml") {
        Ok(Some(_)) => {
            let cargo =
                installed_tool(root, if cfg!(windows) { "cargo.exe" } else { "cargo" }).next();
            for name in ["build", "test", "check"] {
                tasks.push(Task {
                    id: format!("cargo:{name}"),
                    label: format!("Cargo {name}"),
                    command: format!("cargo {name} --message-format=short"),
                    category: name,
                    available: cargo.is_some(),
                    unavailable_reason: cargo
                        .is_none()
                        .then_some("Cargo must be available on PATH."),
                    plan: cargo.clone().map(|executable| Plan {
                        executable,
                        args: vec![name.into(), "--message-format=short".into()],
                    }),
                });
            }
        }
        Ok(None) => {}
        Err(error) => warnings.push(error),
    }
    Catalog { tasks, warnings }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

struct State {
    phase: Phase,
    code: Option<i32>,
    error: Option<String>,
    first_byte: u64,
    output: String,
}

pub struct Run {
    pub id: u64,
    pub root: PathBuf,
    pub task: Task,
    cancel: AtomicBool,
    state: Mutex<State>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot<'a> {
    id: u64,
    root: &'a Path,
    task: &'a Task,
    phase: Phase,
    code: Option<i32>,
    error: Option<String>,
    cursor: u64,
    reset: bool,
    truncated: bool,
    output: String,
}

impl Run {
    pub fn snapshot(&self, cursor: u64) -> Snapshot<'_> {
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let end = state.first_byte + state.output.len() as u64;
        let offset = cursor
            .saturating_sub(state.first_byte)
            .min(state.output.len() as u64) as usize;
        let reset =
            cursor < state.first_byte || cursor > end || !state.output.is_char_boundary(offset);
        Snapshot {
            id: self.id,
            root: &self.root,
            task: &self.task,
            phase: state.phase,
            code: state.code,
            error: state.error.clone(),
            cursor: end,
            reset,
            truncated: state.first_byte > 0,
            output: state.output[if reset { 0 } else { offset }..].to_owned(),
        }
    }

    pub fn is_running(&self) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .phase
            == Phase::Running
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Release);
    }

    fn append(&self, output: &str) {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if state.phase != Phase::Running {
            return;
        }
        state.output.push_str(output);
        let mut cut = state.output.len().saturating_sub(OUTPUT_LIMIT);
        while !state.output.is_char_boundary(cut) {
            cut += 1;
        }
        state.output.drain(..cut);
        state.first_byte += cut as u64;
    }

    fn finish(
        &self,
        status: io::Result<ExitStatus>,
        cancelled: bool,
        output_error: Option<String>,
    ) {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        match status {
            Ok(status) => {
                state.code = status.code();
                state.phase = if cancelled {
                    Phase::Cancelled
                } else if status.success() {
                    Phase::Succeeded
                } else {
                    Phase::Failed
                };
                state.error = output_error;
            }
            Err(error) => {
                state.phase = Phase::Failed;
                state.error = Some(error.to_string());
            }
        }
    }
}

fn read_output(run: &Run, reader: impl Read) -> io::Result<()> {
    let mut reader = reader;
    let mut decoder = Utf8Stream::default();
    let mut bytes = [0; 8192];
    loop {
        match reader.read(&mut bytes) {
            Ok(0) => break,
            Ok(count) => run.append(&decoder.decode(&bytes[..count])),
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        }
    }
    run.append(&decoder.finish());
    Ok(())
}

#[cfg(unix)]
fn terminate_group(pid: u32) -> io::Result<()> {
    if unsafe { libc::kill(-(pid as i32), libc::SIGKILL) } == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

fn start(id: u64, root: PathBuf, task: Task) -> Result<Arc<Run>, String> {
    let plan = task.plan.as_ref().ok_or_else(|| {
        task.unavailable_reason
            .unwrap_or("Task tool unavailable.")
            .to_owned()
    })?;
    let mut command = Command::new(&plan.executable);
    command
        .args(&plan.args)
        .current_dir(&root)
        .env("NO_COLOR", "1")
        .env("CARGO_TERM_COLOR", "never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    let job = {
        use std::os::windows::process::CommandExt;
        command.creation_flags(windows::Win32::System::Threading::CREATE_NO_WINDOW.0);
        crate::terminal_pty::WindowsProcessJob::new()
            .map_err(|error| format!("Cannot isolate task processes: {error}"))?
    };
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Cannot start {}: {error}", task.label))?;
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        if let Err(error) = job.attach(Some(child.as_raw_handle())) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("Cannot isolate task processes: {error}"));
        }
    }
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let run = Arc::new(Run {
        id,
        root,
        task,
        cancel: AtomicBool::new(false),
        state: Mutex::new(State {
            phase: Phase::Running,
            code: None,
            error: None,
            first_byte: 0,
            output: String::new(),
        }),
    });
    let (done, wait) = mpsc::channel();
    for pipe in [Box::new(stdout) as Box<dyn Read + Send>, Box::new(stderr)] {
        let run = Arc::clone(&run);
        let done = done.clone();
        std::thread::spawn(move || {
            let _ = done.send(read_output(&run, pipe));
        });
    }
    drop(done);
    let running = Arc::clone(&run);
    std::thread::spawn(move || {
        let mut cancelled = false;
        let mut cancellation_error = None;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Err(error) => break Err(error),
                Ok(None) => {}
            }
            if running.cancel.swap(false, Ordering::AcqRel) {
                #[cfg(windows)]
                let killed = job.terminate();
                #[cfg(unix)]
                let killed = terminate_group(child.id());
                match killed.or_else(|_| child.kill()) {
                    Ok(()) => cancelled = true,
                    Err(error) => {
                        cancellation_error = Some(format!("Could not cancel the task: {error}"))
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(40));
        };
        #[cfg(windows)]
        drop(job);
        let mut output_error = cancellation_error;
        for _ in 0..2 {
            match wait.recv_timeout(Duration::from_secs(1)) {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    output_error = Some(format!("Could not read task output: {error}"))
                }
                Err(_) => {
                    output_error =
                        Some("Some output streams did not close after the task exited.".into());
                    break;
                }
            }
        }
        running.finish(status, cancelled, output_error);
    });
    Ok(run)
}

pub fn start_project_task(id: u64, root: PathBuf, name: &str) -> Result<Arc<Run>, String> {
    let task = discover(&root)
        .tasks
        .into_iter()
        .find(|task| task.id == name)
        .ok_or("That task is not declared by this project.")?;
    start(id, root, task)
}

pub fn diagnostic_path(root: &Path, reported: &str) -> Result<PathBuf, String> {
    use std::path::Component;
    let path = Path::new(reported);
    if reported.is_empty() || reported.len() > 1024 || reported.chars().any(char::is_control) {
        return Err("Invalid diagnostic path.".into());
    }
    let candidate = if path.is_absolute() {
        #[cfg(windows)]
        let plain = {
            let root = root.to_string_lossy();
            if let Some(tail) = root.strip_prefix(r"\\?\UNC\") {
                PathBuf::from(format!(r"\\{tail}"))
            } else {
                PathBuf::from(root.strip_prefix(r"\\?\").unwrap_or(&root))
            }
        };
        #[cfg(not(windows))]
        let plain = root;
        if !path.starts_with(root) && !path.starts_with(plain) {
            return Err("The diagnostic points outside this project.".into());
        }
        path.to_owned()
    } else {
        if path
            .components()
            .any(|segment| !matches!(segment, Component::Normal(_) | Component::CurDir))
        {
            return Err("The diagnostic points outside this project.".into());
        }
        root.join(path)
    };
    let resolved = candidate
        .canonicalize()
        .map_err(|_| "The diagnostic file is unavailable.")?;
    if !resolved.starts_with(root) || !resolved.is_file() {
        return Err("The diagnostic points outside this project.".into());
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::AtomicU64;
    use std::time::Instant;

    struct Project(PathBuf);
    impl Project {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "dex-task-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path.canonicalize().unwrap())
        }
        fn write(&self, name: &str, content: &str) {
            let file = self.0.join(name);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, content).unwrap();
        }
    }
    impl Drop for Project {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn wait_for(run: &Run) -> Snapshot<'_> {
        let deadline = Instant::now() + Duration::from_secs(20);
        while run.is_running() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(25));
        }
        let result = run.snapshot(0);
        if result.phase == Phase::Running {
            run.cancel();
            panic!("Task timed out: {}", result.output);
        }
        result
    }

    #[test]
    fn discovers_supported_manifest_tasks_without_running_scripts() {
        let project = Project::new();
        project.write("package.json", r#"{"scripts":{"build":"invalid-command","test:unit":"invalid-command","test:empty":" ","test:bad&name":"invalid-command","deploy":"invalid-command"}}"#);
        project.write("Cargo.toml", "[workspace]\n");
        let catalog = discover(&project.0);
        let ids: Vec<_> = catalog.tasks.iter().map(|task| task.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "npm:build",
                "npm:test:unit",
                "cargo:build",
                "cargo:test",
                "cargo:check"
            ]
        );
        assert!(!project.0.join("target").exists());
        assert!(start_project_task(1, project.0.clone(), "npm:deploy").is_err());
    }

    #[test]
    fn invalid_npm_manifest_leaves_cargo_tasks_and_invalid_paths_are_rejected() {
        let project = Project::new();
        project.write("package.json", "{invalid");
        project.write("Cargo.toml", "[workspace]\n");
        project.write("src/main.rs", "");
        let catalog = discover(&project.0);
        assert_eq!(catalog.warnings.len(), 1);
        assert_eq!(catalog.tasks.len(), 3);
        assert!(diagnostic_path(&project.0, "src/main.rs").is_ok());
        assert!(diagnostic_path(&project.0, "../Cargo.toml").is_err());
        assert!(project_root("relative/project").is_err());
    }

    #[test]
    #[ignore = "Started as a subprocess by the task tests"]
    fn fixture_failure() {
        println!(
            "native stdout at {}",
            std::env::current_dir().unwrap().display()
        );
        eprintln!("native stderr ✓");
        std::process::exit(7);
    }

    #[test]
    #[ignore = "Started as a subprocess by the task tests"]
    fn fixture_slow() {
        println!("task has started");
        std::thread::sleep(Duration::from_secs(30));
    }

    fn fixture(root: PathBuf, name: &str) -> Arc<Run> {
        start(
            1,
            root,
            Task {
                id: name.into(),
                label: name.into(),
                command: name.into(),
                category: "test",
                available: true,
                unavailable_reason: None,
                plan: Some(Plan {
                    executable: std::env::current_exe().unwrap(),
                    args: vec![
                        "--exact".into(),
                        format!("code_tasks_core::tests::{name}"),
                        "--ignored".into(),
                        "--nocapture".into(),
                    ],
                }),
            },
        )
        .unwrap()
    }

    #[test]
    fn real_process_reports_both_streams_the_working_directory_and_exit_code() {
        let project = Project::new();
        let run = fixture(project.0.clone(), "fixture_failure");
        let result = wait_for(&run);
        assert_eq!(result.phase, Phase::Failed);
        assert_eq!(result.code, Some(7));
        assert!(result.output.contains("native stdout at"));
        assert!(result
            .output
            .contains(project.0.file_name().unwrap().to_str().unwrap()));
        assert!(result.output.contains("native stderr ✓"));
        assert!(run.snapshot(result.cursor).output.is_empty());
    }

    #[test]
    fn a_running_process_is_cancelled_and_reaped() {
        let project = Project::new();
        let run = fixture(project.0.clone(), "fixture_slow");
        let deadline = Instant::now() + Duration::from_secs(5);
        while !run.snapshot(0).output.contains("task has started")
            && run.is_running()
            && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(20));
        }
        run.cancel();
        let result = wait_for(&run);
        assert_eq!(result.phase, Phase::Cancelled);
        assert!(result.output.contains("task has started"));
    }

    #[test]
    fn retained_output_restarts_after_rollover_on_a_utf8_boundary() {
        let project = Project::new();
        let run = fixture(project.0.clone(), "fixture_slow");
        run.append(&"✓".repeat(OUTPUT_LIMIT / 3 + 10));
        let result = run.snapshot(0);
        assert!(result.reset);
        assert!(result.output.len() <= OUTPUT_LIMIT);
        assert!(result.output.starts_with('✓'));
        run.cancel();
        assert_eq!(wait_for(&run).phase, Phase::Cancelled);
    }

    #[test]
    #[ignore = "Runs the host's installed npm and Cargo on a temporary fixture"]
    fn installed_npm_and_cargo_execute_project_workflows() {
        let project = Project::new();
        project.write(
            "package.json",
            r#"{"scripts":{"build":"node build.cjs","test":"node test.cjs"}}"#,
        );
        project.write(
            "build.cjs",
            "process.stdout.write(require('fs').readFileSync('marker.txt', 'utf8'));",
        );
        project.write("marker.txt", "build read from the open project");
        project.write(
            "test.cjs",
            "console.error('fixture test failed'); process.exit(7);",
        );
        project.write(
            "Cargo.toml",
            "[package]\nname = \"dex_task_fixture\"\nversion = \"0.0.1\"\nedition = \"2021\"\n",
        );
        project.write(
            "src/lib.rs",
            "#[test] fn real_test() { assert_eq!(2 + 2, 4); }",
        );
        let build = start_project_task(1, project.0.clone(), "npm:build").unwrap();
        let build = wait_for(&build);
        assert_eq!(build.phase, Phase::Succeeded, "{}", build.output);
        assert!(
            build.output.contains("build read from the open project"),
            "{}",
            build.output
        );
        let npm_test = start_project_task(2, project.0.clone(), "npm:test").unwrap();
        let npm_test = wait_for(&npm_test);
        assert_eq!(npm_test.code, Some(7), "{}", npm_test.output);
        assert!(npm_test.output.contains("fixture test failed"));
        let cargo_build = start_project_task(3, project.0.clone(), "cargo:build").unwrap();
        let cargo_build = wait_for(&cargo_build);
        assert_eq!(
            cargo_build.phase,
            Phase::Succeeded,
            "{}",
            cargo_build.output
        );
        let cargo = start_project_task(4, project.0.clone(), "cargo:test").unwrap();
        let cargo = wait_for(&cargo);
        assert_eq!(cargo.phase, Phase::Succeeded, "{}", cargo.output);
        assert!(cargo.output.contains("test real_test ... ok"));
    }
}
