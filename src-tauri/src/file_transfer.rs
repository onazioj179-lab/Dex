// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use std::{
    collections::{HashMap, HashSet},
    ffi::{OsStr, OsString},
    fs::{self, File, Metadata},
    io::{self, ErrorKind, Read, Write},
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Conflict {
    Skip,
    KeepBoth,
}

#[derive(Debug)]
pub struct PartialMove {
    pub destination: PathBuf,
    pub reason: String,
}

impl std::fmt::Display for PartialMove {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Copied to {}, but kept the original: {}",
            self.destination.display(),
            self.reason
        )
    }
}

impl std::error::Error for PartialMove {}

pub fn normalize_source(path: &Path) -> io::Result<PathBuf> {
    let name = path.file_name().ok_or_else(|| {
        io::Error::new(
            ErrorKind::InvalidInput,
            "Choose a file or folder inside a directory",
        )
    })?;
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    // Resolve aliases to the parent while preserving a link as the final item.
    Ok(parent.canonicalize()?.join(name))
}

pub fn is_link(metadata: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const REPARSE_POINT: u32 = 0x400;
        if metadata.file_attributes() & REPARSE_POINT != 0 {
            return true;
        }
    }
    metadata.file_type().is_symlink()
}

#[cfg(windows)]
fn rename_new(src: &Path, dest: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(source: *const u16, target: *const u16, flags: u32) -> i32;
    }
    let source: Vec<u16> = src.as_os_str().encode_wide().chain([0]).collect();
    let target: Vec<u16> = dest.as_os_str().encode_wide().chain([0]).collect();
    if source[..source.len() - 1].contains(&0) || target[..target.len() - 1].contains(&0) {
        return Err(io::Error::new(ErrorKind::InvalidInput, "Invalid path"));
    }
    // Neither REPLACE_EXISTING nor COPY_ALLOWED is set. Cross-volume copies
    // take the cancellable, staged path below.
    if unsafe { MoveFileExW(source.as_ptr(), target.as_ptr(), 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn rename_new(src: &Path, dest: &Path) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let source = CString::new(src.as_os_str().as_bytes())?;
    let target = CString::new(dest.as_os_str().as_bytes())?;
    #[cfg(target_os = "linux")]
    let result = unsafe {
        libc::syscall(
            libc::SYS_renameat2,
            libc::AT_FDCWD,
            source.as_ptr(),
            libc::AT_FDCWD,
            target.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    #[cfg(target_os = "macos")]
    let result = unsafe { libc::renamex_np(source.as_ptr(), target.as_ptr(), libc::RENAME_EXCL) };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn rename_new(_: &Path, _: &Path) -> io::Result<()> {
    Err(io::Error::new(
        ErrorKind::Unsupported,
        "Safe file publishing is unavailable on this platform",
    ))
}

fn validate_name(name: &OsStr) -> io::Result<()> {
    let mut parts = Path::new(name).components();
    if !matches!(parts.next(), Some(Component::Normal(part)) if part == name)
        || parts.next().is_some()
    {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "Enter a file name without a path",
        ));
    }
    #[cfg(windows)]
    {
        let text = name.to_string_lossy();
        let base = text
            .split('.')
            .next()
            .unwrap_or_default()
            .trim_end()
            .to_ascii_uppercase();
        let reserved = matches!(base.as_str(), "AUX" | "CON" | "NUL" | "PRN" | "CLOCK$")
            || base
                .strip_prefix("COM")
                .or_else(|| base.strip_prefix("LPT"))
                .is_some_and(|suffix| {
                    matches!(
                        suffix,
                        "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                    )
                });
        if text.ends_with(['.', ' '])
            || reserved
            || text
                .chars()
                .any(|ch| ch < ' ' || matches!(ch, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        {
            return Err(io::Error::new(
                ErrorKind::InvalidInput,
                "This filename is not valid on Windows",
            ));
        }
    }
    Ok(())
}

pub fn rename(old: &Path, name: &OsStr) -> io::Result<PathBuf> {
    validate_name(name)?;
    let source = normalize_source(old)?;
    let target = source.with_file_name(name);
    rename_new(&source, &target)?;
    Ok(target)
}

pub fn check_cancel(cancel: &AtomicBool) -> io::Result<()> {
    if cancel.load(Ordering::Relaxed) {
        Err(io::Error::new(
            ErrorKind::Interrupted,
            "Operation cancelled",
        ))
    } else {
        Ok(())
    }
}

fn keep_both_name(initial: &OsStr, directory: bool, number: usize) -> OsString {
    let path = Path::new(initial);
    let extension = if directory { None } else { path.extension() };
    let mut name = if extension.is_some() {
        path.file_stem().unwrap_or(initial).to_os_string()
    } else {
        initial.to_os_string()
    };
    name.push(format!(" ({number})"));
    if let Some(extension) = extension {
        name.push(".");
        name.push(extension);
    }
    name
}

fn publish<F>(
    directory: &Path,
    name: &OsStr,
    is_dir: bool,
    conflict: Conflict,
    cancel: &AtomicBool,
    mut commit: F,
) -> io::Result<PathBuf>
where
    F: FnMut(&Path) -> io::Result<()>,
{
    for number in 1..=1000 {
        check_cancel(cancel)?;
        let path = if number == 1 {
            directory.join(name)
        } else {
            directory.join(keep_both_name(name, is_dir, number))
        };
        match commit(&path) {
            Ok(()) => return Ok(path),
            Err(error)
                if conflict == Conflict::KeepBoth && error.kind() == ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        ErrorKind::AlreadyExists,
        "No available numbered name at this destination",
    ))
}

struct Stage(PathBuf, bool);

impl Stage {
    fn create(parent: &Path) -> io::Result<Self> {
        Self::reserve(parent, "copy")
    }

    fn reserve(parent: &Path, operation: &str) -> io::Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let builder = fs::DirBuilder::new();
        #[cfg(unix)]
        let builder = {
            use std::os::unix::fs::DirBuilderExt;
            let mut builder = builder;
            builder.mode(0o700);
            builder
        };
        for _ in 0..64 {
            let sequence = NEXT.fetch_add(1, Ordering::Relaxed);
            let path = parent.join(format!(
                ".dex-{operation}-{}-{sequence}",
                std::process::id()
            ));
            match builder.create(&path) {
                Ok(()) => return Ok(Self(path, operation == "copy")),
                Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error),
            }
        }
        Err(io::Error::new(
            ErrorKind::AlreadyExists,
            "Could not reserve a staging directory",
        ))
    }
}

impl Drop for Stage {
    fn drop(&mut self) {
        if !self.1 {
            // Rename staging contains original files. Only remove empty directories.
            let _ = fs::remove_dir(&self.0);
            return;
        }
        if fs::remove_dir_all(&self.0).is_err() {
            make_stage_removable(&self.0);
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Position {
    Original,
    Staged,
    Published,
}

struct RenameEntry {
    source: PathBuf,
    target: PathBuf,
    staged: PathBuf,
    position: Position,
}

fn path_key(path: &Path) -> OsString {
    #[cfg(any(windows, target_os = "macos"))]
    {
        path.to_string_lossy().to_lowercase().into()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        path.as_os_str().to_owned()
    }
}

pub fn rename_batch(specifications: &[(PathBuf, OsString)]) -> io::Result<Vec<PathBuf>> {
    apply_rename_plan(specifications, rename_new)
}

fn apply_rename_plan(
    specifications: &[(PathBuf, OsString)],
    mut move_file: impl FnMut(&Path, &Path) -> io::Result<()>,
) -> io::Result<Vec<PathBuf>> {
    let mut source_keys = HashSet::new();
    let mut target_keys = HashSet::new();
    let mut paths = Vec::with_capacity(specifications.len());
    for (path, name) in specifications {
        validate_name(name)?;
        let source = normalize_source(path)?;
        let metadata = fs::symlink_metadata(&source)?;
        if !metadata.is_file() || is_link(&metadata) {
            return Err(io::Error::new(
                ErrorKind::Unsupported,
                format!("{} is not a regular file", source.display()),
            ));
        }
        let target = source.with_file_name(name);
        if !source_keys.insert(path_key(&source)) || !target_keys.insert(path_key(&target)) {
            return Err(io::Error::new(
                ErrorKind::InvalidInput,
                "The rename plan contains duplicate sources or destinations",
            ));
        }
        paths.push((source, target));
    }
    for (_, target) in &paths {
        match fs::symlink_metadata(target) {
            Ok(_) if !source_keys.contains(&path_key(target)) => {
                return Err(io::Error::new(
                    ErrorKind::AlreadyExists,
                    format!("{} already exists", target.display()),
                ));
            }
            Err(error) if error.kind() != ErrorKind::NotFound => return Err(error),
            _ => {}
        }
    }
    let mut stages = HashMap::<PathBuf, Stage>::new();
    let mut entries = Vec::with_capacity(paths.len());
    for (source, target) in paths {
        let parent = source.parent().expect("normalized source has a parent");
        let stage = match stages.entry(parent.to_path_buf()) {
            std::collections::hash_map::Entry::Occupied(existing) => existing.into_mut(),
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(Stage::reserve(parent, "rename")?)
            }
        };
        let staged = stage
            .0
            .join(source.file_name().expect("validated filename"));
        entries.push(RenameEntry {
            source,
            target,
            staged,
            position: Position::Original,
        });
    }

    let result = (|| {
        for entry in &mut entries {
            move_file(&entry.source, &entry.staged)?;
            entry.position = Position::Staged;
        }
        for entry in &mut entries {
            move_file(&entry.staged, &entry.target)?;
            entry.position = Position::Published;
        }
        Ok::<(), io::Error>(())
    })();
    if let Err(error) = result {
        for entry in entries.iter_mut().rev() {
            if entry.position == Position::Published
                && move_file(&entry.target, &entry.staged).is_ok()
            {
                entry.position = Position::Staged;
            }
        }
        let mut recovery = Vec::new();
        for entry in entries.iter_mut().rev() {
            match entry.position {
                Position::Original => {}
                Position::Staged => {
                    if move_file(&entry.staged, &entry.source).is_err() {
                        recovery.push(&entry.staged);
                    }
                }
                Position::Published => recovery.push(&entry.target),
            }
        }
        let mut message = format!("Could not apply batch rename: {error}");
        if recovery.is_empty() {
            message.push_str(". Original names were restored.");
        } else {
            let locations = recovery
                .iter()
                .map(|path| path.to_string_lossy())
                .collect::<Vec<_>>()
                .join("\n");
            message.push_str(&format!(
                ". Some files require recovery at these locations:\n{locations}"
            ));
        }
        return Err(io::Error::other(message));
    }
    Ok(entries.into_iter().map(|entry| entry.target).collect())
}

fn make_stage_removable(path: &Path) {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return;
    };
    if is_link(&metadata) {
        return;
    }
    let mut permissions = metadata.permissions();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.is_dir() {
            permissions.set_mode(permissions.mode() | 0o700);
        }
    }
    #[cfg(windows)]
    permissions.set_readonly(false);
    let _ = fs::set_permissions(path, permissions);
    if metadata.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                make_stage_removable(&entry.path());
            }
        }
    }
}

fn copy_payload(
    source: &Path,
    target: &Path,
    cancel: &AtomicBool,
    buffer: &mut [u8],
    depth: usize,
) -> io::Result<()> {
    check_cancel(cancel)?;
    if depth > 128 {
        return Err(io::Error::new(
            ErrorKind::Unsupported,
            "The folder nesting exceeds the supported copy depth",
        ));
    }
    let metadata = fs::symlink_metadata(source)?;
    if is_link(&metadata) {
        return Err(io::Error::new(
            ErrorKind::Unsupported,
            "This copy contains a symbolic link or reparse point",
        ));
    }
    if metadata.is_dir() {
        fs::create_dir(target)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_payload(
                &entry.path(),
                &target.join(entry.file_name()),
                cancel,
                buffer,
                depth + 1,
            )?;
        }
        fs::set_permissions(target, metadata.permissions())?;
    } else if metadata.is_file() {
        let mut options = File::options();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            const OPEN_REPARSE_POINT: u32 = 0x00200000;
            options.custom_flags(OPEN_REPARSE_POINT).share_mode(1); // FILE_SHARE_READ
        }
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let mut input = options.open(source)?;
        let opened = input.metadata()?;
        if !opened.is_file() || is_link(&opened) {
            return Err(io::Error::new(
                ErrorKind::Unsupported,
                "The source is no longer a regular file",
            ));
        }
        let mut output = File::options().write(true).create_new(true).open(target)?;
        let mut written = 0u64;
        loop {
            check_cancel(cancel)?;
            let read = input.read(buffer)?;
            if read == 0 {
                break;
            }
            output.write_all(&buffer[..read])?;
            written += read as u64;
        }
        let after = input.metadata()?;
        if written != opened.len()
            || after.len() != opened.len()
            || opened.modified().ok() != after.modified().ok()
        {
            return Err(io::Error::other(
                "The source changed while it was being copied",
            ));
        }
        output.sync_all()?;
        output.set_permissions(opened.permissions())?;
    } else {
        return Err(io::Error::new(
            ErrorKind::Unsupported,
            "Only regular files and folders can be copied",
        ));
    }
    Ok(())
}

fn staged_copy(
    source: &Path,
    directory: &Path,
    cancel: &AtomicBool,
) -> io::Result<(Stage, PathBuf)> {
    let stage = Stage::create(directory)?;
    let payload = stage.0.join("item");
    let mut buffer = vec![0; 128 * 1024];
    copy_payload(source, &payload, cancel, &mut buffer, 0)?;
    Ok((stage, payload))
}

fn cross_volume(error: &io::Error) -> bool {
    error.kind() == ErrorKind::CrossesDevices || (cfg!(windows) && error.raw_os_error() == Some(17))
}

/// Copies and cross-volume regular-file moves publish only a complete payload.
/// A cross-volume move trashes the original after publication so it can be recovered.
pub fn transfer(
    source: &Path,
    directory: &Path,
    moving: bool,
    conflict: Conflict,
    cancel: &AtomicBool,
    trash: impl FnOnce(&Path) -> io::Result<()>,
) -> io::Result<PathBuf> {
    let source = normalize_source(source)?;
    let directory = directory.canonicalize()?;
    if !directory.is_dir() {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "The destination must be a folder",
        ));
    }
    let name = source
        .file_name()
        .expect("normalize_source requires a file name");
    check_cancel(cancel)?;
    let metadata = fs::symlink_metadata(&source)?;
    let is_dir = metadata.is_dir() && !is_link(&metadata);
    if is_dir && directory.starts_with(source.canonicalize()?) {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "A folder cannot be copied or moved into itself",
        ));
    }
    if moving {
        if source.parent() == Some(directory.as_path()) {
            return Ok(source.clone());
        }
        match publish(&directory, name, is_dir, conflict, cancel, |target| {
            rename_new(&source, target)
        }) {
            Err(error) if cross_volume(&error) => {}
            result => return result,
        }
        if !metadata.is_file() || is_link(&metadata) {
            return Err(io::Error::new(
                ErrorKind::Unsupported,
                "Cross-volume moves require a regular file. A folder can be copied across volumes.",
            ));
        }
    }
    if conflict == Conflict::Skip {
        match fs::symlink_metadata(directory.join(name)) {
            Ok(_) => return Err(ErrorKind::AlreadyExists.into()),
            Err(error) if error.kind() != ErrorKind::NotFound => return Err(error),
            Err(_) => {}
        }
    }
    let (_stage, payload) = staged_copy(&source, &directory, cancel)?;
    let target = publish(&directory, name, is_dir, conflict, cancel, |target| {
        rename_new(&payload, target)
    })?;
    if moving {
        let unchanged = fs::symlink_metadata(&source).is_ok_and(|after| {
            after.is_file()
                && !is_link(&after)
                && after.len() == metadata.len()
                && after
                    .modified()
                    .ok()
                    .zip(metadata.modified().ok())
                    .is_some_and(|(a, b)| a == b)
        });
        if !unchanged {
            return Err(io::Error::other(PartialMove {
                destination: target,
                reason: "the source changed".into(),
            }));
        }
        trash(&source).map_err(|error| {
            io::Error::other(PartialMove {
                destination: target.clone(),
                reason: format!("could not move it to Trash ({error})"),
            })
        })?;
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renames_swaps_in_one_folder_and_matches_names_in_separate_folders() {
        let scratch = Stage::create(&std::env::temp_dir()).unwrap();
        let first = scratch.0.join("a.txt");
        let second = scratch.0.join("b.txt");
        let other = scratch.0.join("other");
        fs::create_dir(&other).unwrap();
        fs::write(&first, b"first").unwrap();
        fs::write(&second, b"second").unwrap();
        fs::write(other.join("start.txt"), b"other").unwrap();
        rename_batch(&[
            (first.clone(), "b.txt".into()),
            (second.clone(), "a.txt".into()),
            (other.join("start.txt"), "a.txt".into()),
        ])
        .unwrap();
        assert_eq!(fs::read(first).unwrap(), b"second");
        assert_eq!(fs::read(second).unwrap(), b"first");
        assert_eq!(fs::read(other.join("a.txt")).unwrap(), b"other");
        assert_eq!(fs::read_dir(&scratch.0).unwrap().count(), 3);
    }

    #[test]
    fn rolls_back_when_publication_fails_after_one_rename() {
        let scratch = Stage::create(&std::env::temp_dir()).unwrap();
        let first = scratch.0.join("one.txt");
        let second = scratch.0.join("two.txt");
        fs::write(&first, b"first").unwrap();
        fs::write(&second, b"second").unwrap();
        let mut attempts = 0;
        let result = apply_rename_plan(
            &[
                (first.clone(), "ONE.txt".into()),
                (second.clone(), "TWO.txt".into()),
            ],
            |source, destination| {
                attempts += 1;
                if attempts == 4 {
                    return Err(io::Error::new(
                        ErrorKind::PermissionDenied,
                        "fixture publication failure",
                    ));
                }
                rename_new(source, destination)
            },
        );
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Original names were restored"));
        assert_eq!(fs::read(&first).unwrap(), b"first");
        assert_eq!(fs::read(&second).unwrap(), b"second");
        let exact_names: HashSet<_> = fs::read_dir(&scratch.0)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(
            exact_names,
            HashSet::from([OsString::from("one.txt"), OsString::from("two.txt")])
        );
    }

    #[test]
    fn stages_complete_folder_and_keeps_both_under_a_numbered_name() {
        let scratch = Stage::create(&std::env::temp_dir()).unwrap();
        let source = scratch.0.join("pictures.v1");
        let destination = scratch.0.join("destination");
        fs::create_dir_all(source.join("nested/empty")).unwrap();
        fs::create_dir(&destination).unwrap();
        fs::create_dir(destination.join("pictures.v1")).unwrap();
        fs::write(source.join("nested/one.jpg"), b"new").unwrap();
        fs::write(destination.join("pictures.v1/existing"), b"original").unwrap();
        let cancel = AtomicBool::new(false);

        let conflict = transfer(
            &source,
            &destination,
            false,
            Conflict::Skip,
            &cancel,
            |_| panic!(),
        )
        .unwrap_err();
        assert_eq!(conflict.kind(), ErrorKind::AlreadyExists);
        let result = transfer(
            &source,
            &destination,
            false,
            Conflict::KeepBoth,
            &cancel,
            |_| panic!(),
        )
        .unwrap();
        assert_eq!(result.file_name().unwrap(), "pictures.v1 (2)");
        assert_eq!(fs::read(result.join("nested/one.jpg")).unwrap(), b"new");
        assert!(result.join("nested/empty").is_dir());
        assert_eq!(
            fs::read(destination.join("pictures.v1/existing")).unwrap(),
            b"original"
        );
        assert_eq!(fs::read_dir(&destination).unwrap().count(), 2);
    }

    #[test]
    fn uses_no_replace_for_rename_and_move() {
        let scratch = Stage::create(&std::env::temp_dir()).unwrap();
        let source = scratch.0.join("photo.png");
        let destination = scratch.0.join("destination");
        fs::create_dir(&destination).unwrap();
        fs::write(&source, b"source").unwrap();
        fs::write(source.with_file_name("existing.png"), b"rename target").unwrap();
        fs::write(destination.join("photo.png"), b"move target").unwrap();
        let cancel = AtomicBool::new(false);

        assert!(rename(&source, OsStr::new("existing.png")).is_err());
        assert!(rename(&source, OsStr::new("../outside.png")).is_err());
        assert!(transfer(
            &source,
            &destination,
            true,
            Conflict::Skip,
            &cancel,
            |_| panic!()
        )
        .is_err());
        let moved = transfer(
            &source,
            &destination,
            true,
            Conflict::KeepBoth,
            &cancel,
            |_| panic!(),
        )
        .unwrap();
        assert_eq!(moved.file_name().unwrap(), "photo (2).png");
        assert_eq!(fs::read(&moved).unwrap(), b"source");
        assert_eq!(
            fs::read(destination.join("photo.png")).unwrap(),
            b"move target"
        );
        assert!(!source.exists());
    }

    #[test]
    fn cancellation_and_descendant_targets_leave_the_source_intact() {
        let scratch = Stage::create(&std::env::temp_dir()).unwrap();
        let source = scratch.0.join("folder");
        let nested = source.join("inside");
        let destination = scratch.0.join("destination");
        fs::create_dir_all(&nested).unwrap();
        fs::create_dir(&destination).unwrap();
        fs::write(source.join("keep"), b"source").unwrap();
        let cancel = AtomicBool::new(true);
        assert_eq!(
            transfer(
                &source,
                &destination,
                false,
                Conflict::Skip,
                &cancel,
                |_| panic!()
            )
            .unwrap_err()
            .kind(),
            ErrorKind::Interrupted
        );
        cancel.store(false, Ordering::Relaxed);
        assert_eq!(
            transfer(
                &source,
                &nested,
                true,
                Conflict::Skip,
                &cancel,
                |_| panic!()
            )
            .unwrap_err()
            .kind(),
            ErrorKind::InvalidInput
        );
        assert!(source.join("keep").exists());
        assert_eq!(fs::read_dir(&destination).unwrap().count(), 0);
        assert_eq!(fs::read_dir(&nested).unwrap().count(), 0);
    }

    #[test]
    fn cancellation_before_publication_discards_the_stage() {
        let scratch = Stage::create(&std::env::temp_dir()).unwrap();
        let source = scratch.0.join("source");
        let destination = scratch.0.join("destination");
        fs::write(&source, b"complete payload").unwrap();
        fs::create_dir(&destination).unwrap();
        let cancel = AtomicBool::new(false);
        {
            let (_stage, payload) = staged_copy(&source, &destination, &cancel).unwrap();
            cancel.store(true, Ordering::Relaxed);
            assert_eq!(
                publish(
                    &destination,
                    OsStr::new("source"),
                    false,
                    Conflict::Skip,
                    &cancel,
                    |target| rename_new(&payload, target)
                )
                .unwrap_err()
                .kind(),
                ErrorKind::Interrupted
            );
        }
        assert_eq!(fs::read_dir(destination).unwrap().count(), 0);
        assert_eq!(fs::read(source).unwrap(), b"complete payload");
    }
}
