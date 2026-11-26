// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
#[cfg(not(windows))]
use portable_pty::ChildKiller;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{self, Read, Write};
#[cfg(windows)]
pub(crate) use windows_job::Job as WindowsProcessJob;

pub struct Process {
    pub child: Box<dyn Child + Send + Sync>,
    pub reader: Box<dyn Read + Send>,
    pub writer: Box<dyn Write + Send>,
    pub terminal: Terminal,
    pub startup: Option<std::sync::mpsc::Receiver<bool>>,
}

pub struct Terminal {
    master: Box<dyn MasterPty + Send>,
    #[cfg(not(windows))]
    killer: Box<dyn ChildKiller + Send + Sync>,
    #[cfg(windows)]
    job: windows_job::Job,
    #[cfg(not(windows))]
    child_pid: Option<u32>,
}

pub fn size(cols: u64, rows: u64) -> PtySize {
    PtySize {
        cols: cols.clamp(1, 500) as u16,
        rows: rows.clamp(1, 300) as u16,
        pixel_width: 0,
        pixel_height: 0,
    }
}

pub fn spawn(shell: &str, args: &[String], cwd: &str, size: PtySize) -> Result<Process, String> {
    if !std::path::Path::new(cwd).is_dir() {
        return Err(format!("Terminal working directory does not exist: {cwd}"));
    }
    let pair = native_pty_system()
        .openpty(size)
        .map_err(|error| error.to_string())?;
    let mut command = CommandBuilder::new(shell);
    command.args(args);
    command.cwd(cwd);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    #[cfg(windows)]
    let job = windows_job::Job::new().map_err(|error| error.to_string())?;
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);
    #[cfg(windows)]
    let child = {
        let mut child = child;
        if let Err(error) = job.attach(child.as_raw_handle()) {
            let _ = child.kill();
            // Keep reading while ConPTY closes its output handles.
            let drain = std::thread::spawn(move || io::copy(&mut { reader }, &mut io::sink()));
            let mut writer = writer;
            let _ = writer.write_all(b"\x1b[1;1R");
            drop(writer);
            drop(pair.master);
            let _ = child.wait();
            let _ = drain.join();
            return Err(format!("Cannot isolate terminal processes: {error}"));
        }
        child
    };
    let terminal = Terminal {
        master: pair.master,
        #[cfg(not(windows))]
        killer: child.clone_killer(),
        #[cfg(windows)]
        job,
        #[cfg(not(windows))]
        child_pid: child.process_id(),
    };
    #[cfg(windows)]
    let (reader, startup) = {
        let (ready, wait) = std::sync::mpsc::channel();
        (
            Box::new(CursorHandshake {
                reader,
                ready: Some(ready),
                pending: io::Cursor::new(Vec::new()),
            }) as Box<dyn Read + Send>,
            Some(wait),
        )
    };
    #[cfg(not(windows))]
    let startup = None;
    Ok(Process {
        child,
        reader,
        writer,
        terminal,
        startup,
    })
}

/// portable-pty requests an inherited Windows cursor position. A transcript
/// panel has no cursor to report, so initialize the new console at row/column 1.
/// This runs on the input worker before forwarding any user keystrokes.
pub fn prepare_input(
    startup: Option<std::sync::mpsc::Receiver<bool>>,
    writer: &mut dyn Write,
) -> io::Result<()> {
    if startup.and_then(|ready| ready.recv_timeout(std::time::Duration::from_secs(3)).ok())
        == Some(true)
    {
        writer.write_all(b"\x1b[1;1R")?;
        writer.flush()?;
    }
    Ok(())
}

#[cfg(windows)]
struct CursorHandshake {
    reader: Box<dyn Read + Send>,
    ready: Option<std::sync::mpsc::Sender<bool>>,
    pending: io::Cursor<Vec<u8>>,
}

#[cfg(windows)]
impl Read for CursorHandshake {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        const QUERY: &[u8] = b"\x1b[6n";
        if let Some(ready) = self.ready.take() {
            let mut first = [0u8; 4];
            let mut used = 0;
            while used < first.len() && QUERY.starts_with(&first[..used]) {
                match self.reader.read(&mut first[used..]) {
                    Ok(0) => break,
                    Ok(count) => used += count,
                    Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                    Err(error) => return Err(error),
                }
            }
            let matched = &first[..used] == QUERY;
            let _ = ready.send(matched);
            if !matched {
                self.pending = io::Cursor::new(first[..used].to_vec());
            }
        }
        let count = self.pending.read(buffer)?;
        if count > 0 {
            Ok(count)
        } else {
            self.reader.read(buffer)
        }
    }
}

impl Terminal {
    pub fn resize(&self, size: PtySize) -> Result<(), String> {
        self.master.resize(size).map_err(|error| error.to_string())
    }

    pub fn kill(&mut self) -> io::Result<()> {
        #[cfg(windows)]
        return self.job.terminate();
        #[cfg(not(windows))]
        {
            // Interactive shells put the foreground job in its own process
            // group. Openpty created a separate session for this shell.
            let group = self.master.process_group_leader();
            if let Some(group) = group.filter(|group| *group > 1) {
                unsafe { libc::kill(-group, libc::SIGKILL) };
            }
            if let Some(pid) = self.child_pid.filter(|pid| *pid > 1) {
                if unsafe { libc::kill(-(pid as i32), libc::SIGKILL) } == 0 {
                    return Ok(());
                }
            }
            self.killer.kill()
        }
    }
}

#[cfg(windows)]
mod windows_job {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle};
    use windows::core::{Error, Result, PCWSTR};
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    pub struct Job(OwnedHandle);

    impl Job {
        pub fn new() -> Result<Self> {
            let handle = unsafe { CreateJobObjectW(None, PCWSTR::null()) }?;
            let job = Self(unsafe { OwnedHandle::from_raw_handle(handle.0) });
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            unsafe {
                SetInformationJobObject(
                    job.handle(),
                    JobObjectExtendedLimitInformation,
                    (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                    std::mem::size_of_val(&limits) as u32,
                )?;
            }
            Ok(job)
        }

        fn handle(&self) -> HANDLE {
            HANDLE(self.0.as_raw_handle())
        }

        pub fn attach(&self, process: Option<RawHandle>) -> Result<()> {
            let process = process.ok_or_else(|| {
                Error::new(
                    windows::core::HRESULT(0x80004005u32 as i32),
                    "Missing shell process handle",
                )
            })?;
            unsafe { AssignProcessToJobObject(self.handle(), HANDLE(process)) }
        }

        pub fn terminate(&self) -> std::io::Result<()> {
            unsafe { TerminateJobObject(self.handle(), 130) }.map_err(std::io::Error::other)
        }

        #[cfg(test)]
        pub fn active_processes(&self) -> Result<u32> {
            use windows::Win32::System::JobObjects::{
                JobObjectBasicAccountingInformation, QueryInformationJobObject,
                JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
            };
            let mut info = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
            unsafe {
                QueryInformationJobObject(
                    Some(self.handle()),
                    JobObjectBasicAccountingInformation,
                    (&mut info as *mut JOBOBJECT_BASIC_ACCOUNTING_INFORMATION).cast(),
                    std::mem::size_of_val(&info) as u32,
                    None,
                )?;
            }
            Ok(info.ActiveProcesses)
        }
    }
}

// An OS read can end in the middle of a character. Preserve the incomplete
// suffix and replace malformed bytes without altering correctly encoded text.
#[derive(Default)]
pub struct Utf8Stream(Vec<u8>);

impl Utf8Stream {
    pub fn decode(&mut self, bytes: &[u8]) -> String {
        self.0.extend_from_slice(bytes);
        let mut output = String::new();
        let mut rest = self.0.as_slice();
        loop {
            match std::str::from_utf8(rest) {
                Ok(text) => {
                    output.push_str(text);
                    rest = &[];
                    break;
                }
                Err(error) => {
                    let (valid, suffix) = rest.split_at(error.valid_up_to());
                    output.push_str(std::str::from_utf8(valid).expect("validated UTF-8 prefix"));
                    let Some(length) = error.error_len() else {
                        rest = suffix;
                        break;
                    };
                    output.push('\u{fffd}');
                    rest = &suffix[length..];
                }
            }
        }
        let consumed = self.0.len() - rest.len();
        self.0.drain(..consumed);
        output
    }

    pub fn finish(self) -> String {
        String::from_utf8_lossy(&self.0).into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delivers_split_utf8_without_replacement_and_reports_bad_suffix() {
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.decode(b"A\xf0\x9f"), "A");
        assert_eq!(stream.decode(b"\x98\x80\xffB\xe2"), "😀�B");
        assert_eq!(stream.finish(), "�");
    }

    #[test]
    fn clamps_geometry_before_casting_to_platform_dimensions() {
        assert_eq!(size(u64::MAX, u64::MAX), size(500, 300));
        assert_eq!(size(0, 0), size(1, 1));
    }

    #[test]
    fn streams_a_real_terminal_and_applies_native_resize() {
        #[cfg(windows)]
        let (shell, args, input) = (
            "cmd.exe",
            vec!["/D".to_string(), "/Q".to_string()],
            "@echo DEX_%OS%_PTY\rexit\r",
        );
        #[cfg(not(windows))]
        let (shell, args, input) = (
            "/bin/sh",
            vec!["-i".to_string()],
            "test -t 0 && printf 'DEX_%s_PTY\\n' UNIX; exit\n",
        );
        let cwd = std::env::temp_dir();
        let Process {
            mut child,
            mut reader,
            mut writer,
            terminal,
            startup,
        } = spawn(shell, &args, cwd.to_str().unwrap(), size(80, 24)).unwrap();
        let read = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = reader.read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).into_owned()
        });
        prepare_input(startup, &mut *writer).unwrap();
        terminal.resize(size(101, 37)).unwrap();
        assert_eq!(terminal.master.get_size().unwrap(), size(101, 37));
        writer.write_all(input.as_bytes()).unwrap();
        writer.flush().unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(8);
        let result = loop {
            if let Some(status) = child.try_wait().unwrap() {
                break Some(status);
            }
            if std::time::Instant::now() >= deadline {
                break None;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        if result.is_none() {
            let _ = child.kill();
        }
        drop(writer);
        drop(terminal);
        let output = read.join().unwrap();
        assert!(result.is_some_and(|status| status.success()), "{output:?}");
        #[cfg(windows)]
        assert!(output.contains("DEX_Windows_NT_PTY"), "{output:?}");
        #[cfg(not(windows))]
        assert!(output.contains("DEX_UNIX_PTY"), "{output:?}");
    }

    #[cfg(windows)]
    #[test]
    fn terminating_a_terminal_job_reclaims_its_descendants() {
        let directory = std::env::temp_dir();
        let Process {
            mut child,
            mut reader,
            mut writer,
            mut terminal,
            startup,
        } = spawn(
            "cmd.exe",
            &["/D".into(), "/Q".into()],
            directory.to_str().unwrap(),
            size(80, 24),
        )
        .unwrap();
        let read = std::thread::spawn(move || io::copy(&mut reader, &mut io::sink()));
        prepare_input(startup, &mut *writer).unwrap();
        writer
            .write_all(b"start \"\" /b cmd.exe /D /Q /C pause\r")
            .unwrap();
        writer.flush().unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        let opened_descendant = loop {
            if terminal.job.active_processes().unwrap() > 1 {
                break true;
            }
            if std::time::Instant::now() >= deadline {
                break false;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        terminal.kill().unwrap();
        let status = child.wait().unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        let remaining = loop {
            let count = terminal.job.active_processes().unwrap();
            if count == 0 || std::time::Instant::now() >= deadline {
                break count;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        drop(writer);
        drop(terminal);
        let _ = read.join().unwrap();
        assert!(opened_descendant);
        assert!(!status.success());
        assert_eq!(remaining, 0);
    }
}
