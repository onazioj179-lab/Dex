// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//! Confirmed Task Manager actions operate on a sampled Windows process instance.
use serde_json::{json, Value};

pub fn instance(pid: u32, started: u64) -> Option<String> {
    #[cfg(windows)]
    return windows_process::instance(pid, started).map(|time| time.to_string());
    #[cfg(not(windows))]
    {
        let _ = (pid, started);
        None
    }
}

pub fn end(args: &Value) -> Value {
    #[cfg(windows)]
    return windows_process::end(args);
    #[cfg(not(windows))]
    {
        let _ = args;
        json!({ "success": false, "error": "Confirmed process actions are unavailable on this platform." })
    }
}

#[cfg(windows)]
mod windows_process {
    use super::*;
    use std::collections::{HashMap, HashSet};
    use sysinfo::{Pid, System};
    use windows::Win32::{
        Foundation::{CloseHandle, FILETIME, HANDLE},
        System::Threading::{
            GetProcessTimes, OpenProcess, TerminateProcess, PROCESS_QUERY_LIMITED_INFORMATION,
            PROCESS_TERMINATE,
        },
    };

    struct ProcessHandle(HANDLE);

    impl Drop for ProcessHandle {
        fn drop(&mut self) {
            let _ = unsafe { CloseHandle(self.0) };
        }
    }

    impl ProcessHandle {
        fn open(pid: u32, terminate: bool) -> Option<Self> {
            if pid == 0 || pid == std::process::id() {
                return None;
            }
            let mut rights = PROCESS_QUERY_LIMITED_INFORMATION;
            if terminate {
                rights |= PROCESS_TERMINATE;
            }
            unsafe { OpenProcess(rights, false, pid) }.ok().map(Self)
        }

        fn creation_time(&self) -> Option<u64> {
            let mut creation = FILETIME::default();
            let mut exit = FILETIME::default();
            let mut kernel = FILETIME::default();
            let mut user = FILETIME::default();
            unsafe { GetProcessTimes(self.0, &mut creation, &mut exit, &mut kernel, &mut user) }
                .ok()?;
            if exit.dwHighDateTime != 0 || exit.dwLowDateTime != 0 {
                return None;
            }
            Some((u64::from(creation.dwHighDateTime) << 32) | u64::from(creation.dwLowDateTime))
        }

        fn terminate(&self) -> bool {
            unsafe { TerminateProcess(self.0, 1) }.is_ok()
        }
    }

    fn matches_start(time: u64, started: u64) -> bool {
        started != 0 && (time / 10_000_000).checked_sub(11_644_473_600) == Some(started)
    }

    pub fn instance(pid: u32, started: u64) -> Option<u64> {
        let time = ProcessHandle::open(pid, false)?.creation_time()?;
        matches_start(time, started).then_some(time)
    }

    fn failure(error: &str) -> Value {
        json!({ "success": false, "error": error })
    }

    pub fn end(args: &Value) -> Value {
        let request = &args[0];
        let Some(pid) = request["pid"]
            .as_u64()
            .and_then(|pid| u32::try_from(pid).ok())
        else {
            return failure("Invalid process ID.");
        };
        let Some(expected) = request["instance"]
            .as_str()
            .and_then(|time| time.parse::<u64>().ok())
        else {
            return failure("Refresh Task Manager before ending this process.");
        };
        let Some(root) = ProcessHandle::open(pid, true) else {
            return failure("The process exited or Windows denied access.");
        };
        if root.creation_time() != Some(expected) {
            return failure("This process has changed. Refresh Task Manager and select it again.");
        }

        let mut failed = 0;
        let mut ended = 0;
        if request["tree"].as_bool() == Some(true) {
            let mut sys = System::new();
            sys.refresh_processes_specifics(sysinfo::ProcessRefreshKind::new());
            let mut children: HashMap<Pid, Vec<Pid>> = HashMap::new();
            for (&pid, process) in sys.processes() {
                if let Some(parent) = process.parent() {
                    children.entry(parent).or_default().push(pid);
                }
            }
            let root_pid = Pid::from_u32(pid);
            let mut visited = HashSet::from([root_pid]);
            let mut pending = vec![(root_pid, expected)];
            let mut handles = Vec::new();
            while let Some((parent, parent_start)) = pending.pop() {
                for &child in children.get(&parent).into_iter().flatten() {
                    if child.as_u32() == std::process::id() {
                        return failure("This process tree contains DEX.");
                    }
                    if !visited.insert(child) {
                        continue;
                    }
                    let Some(process) = sys.process(child) else {
                        continue;
                    };
                    let Some(handle) = ProcessHandle::open(child.as_u32(), true) else {
                        failed += 1;
                        continue;
                    };
                    let Some(time) = handle.creation_time() else {
                        continue;
                    };
                    // A reused parent PID may still appear in older children’s metadata.
                    if time < parent_start || !matches_start(time, process.start_time()) {
                        continue;
                    }
                    pending.push((child, time));
                    handles.push(handle);
                }
            }
            for handle in handles.into_iter().rev() {
                if handle.terminate() {
                    ended += 1;
                } else {
                    failed += 1;
                }
            }
        }
        if root.terminate() {
            ended += 1;
        } else {
            failed += 1;
        }
        json!({
            "success": failed == 0,
            "ended": ended,
            "failed": failed,
            "error": if failed > 0 { Some(format!("Ended {ended} process(es). Could not end {failed}.")) } else { None },
        })
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::process::Command;

        #[test]
        fn checks_creation_time_and_ends_only_the_observed_instance() {
            let child = Command::new("cmd.exe")
                .args(["/d", "/c", "pause"])
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::null())
                .spawn()
                .unwrap();
            struct OwnedChild(std::process::Child);
            impl Drop for OwnedChild {
                fn drop(&mut self) {
                    let _ = self.0.kill();
                    let _ = self.0.wait();
                }
            }
            let mut child = OwnedChild(child);
            let pid = child.0.id();
            let handle = ProcessHandle::open(pid, false).unwrap();
            let time = handle.creation_time().unwrap();
            assert_eq!(
                end(&json!([{ "pid": pid, "instance": (time + 1).to_string() }]))["success"],
                false
            );
            assert!(child.0.try_wait().unwrap().is_none());
            assert_eq!(
                end(&json!([{ "pid": pid, "instance": time.to_string() }]))["success"],
                true
            );
            assert!(!child.0.wait().unwrap().success());
        }
    }
}
