// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use crate::editor_file_core::{self, Revision};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs, io,
    path::{Component, Path, PathBuf},
};

const MAX_FILES: usize = 30_000;
const MAX_ENTRIES: usize = 150_000;
const MAX_DEPTH: usize = 32;
const MAX_SEARCH_BYTES: usize = 128 * 1024 * 1024;
const MAX_SEARCH_FILE_BYTES: u64 = 1024 * 1024;

#[derive(Serialize)]
pub struct ProjectFile {
    pub name: String,
    pub path: PathBuf,
}

#[derive(Serialize)]
pub struct Listing {
    pub files: Vec<ProjectFile>,
    pub limited: bool,
    pub unreadable: usize,
}

#[derive(Serialize)]
pub struct ProjectDocument {
    pub path: PathBuf,
    pub content: String,
    pub revision: String,
}

#[derive(Serialize)]
pub struct SearchHit {
    pub path: PathBuf,
    pub name: String,
    pub line: usize,
    pub text: String,
}

#[derive(Serialize)]
pub struct Search {
    pub hits: Vec<SearchHit>,
    pub limited: bool,
    pub skipped: usize,
}

pub struct Workspace {
    pub root: PathBuf,
    documents: HashMap<PathBuf, Revision>,
}

pub fn root_path(input: &Path) -> io::Result<PathBuf> {
    if !input.is_absolute() {
        return Err(io::Error::other("An absolute project folder is required."));
    }
    let root = input.canonicalize()?;
    if !root.is_dir() {
        return Err(io::Error::other("The project path is not a folder."));
    }
    Ok(root)
}

fn regular(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return false;
        }
    }
    meta.is_file() || meta.is_dir()
}

fn access_denied() -> io::Error {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        "Select a regular file inside the project folder.",
    )
}

fn path_inside(root: &Path, input: &Path) -> io::Result<PathBuf> {
    // Accept paths returned by the native listing and conventional absolute Windows paths.
    #[cfg(windows)]
    let plain_root = {
        let root = root.to_string_lossy();
        match root.strip_prefix(r"\\?\UNC\") {
            Some(rest) => PathBuf::from(format!(r"\\{rest}")),
            None => PathBuf::from(root.strip_prefix(r"\\?\").unwrap_or(&root)),
        }
    };
    #[cfg(not(windows))]
    let plain_root = root;
    let relative = if input.is_absolute() {
        input
            .strip_prefix(root)
            .or_else(|_| input.strip_prefix(plain_root))
            .map_err(|_| access_denied())?
    } else {
        input
    };
    if root.canonicalize()? != root {
        return Err(access_denied());
    }
    let mut path = root.to_owned();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err(access_denied());
        };
        path.push(name);
        if !regular(&path.symlink_metadata()?) {
            return Err(access_denied());
        }
    }
    let canonical = path.canonicalize()?;
    if !canonical.starts_with(root) || !canonical.is_file() {
        return Err(access_denied());
    }
    Ok(canonical)
}

fn revision_token(revision: &[u8]) -> String {
    revision.iter().map(|byte| format!("{byte:02x}")).collect()
}

impl Workspace {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            documents: HashMap::new(),
        }
    }

    pub fn open(&mut self, path: &str) -> io::Result<ProjectDocument> {
        let path = path_inside(&self.root, Path::new(path))?;
        let bytes = editor_file_core::read(&path)?;
        let revision = editor_file_core::digest(&bytes);
        let content =
            String::from_utf8(bytes).map_err(|_| io::Error::other("File is not UTF-8 text."))?;
        self.documents.insert(path.clone(), Some(revision.clone()));
        Ok(ProjectDocument {
            path,
            content,
            revision: revision_token(&revision),
        })
    }

    pub fn save(&mut self, path: &str, content: &str, expected: &str) -> io::Result<String> {
        let path = path_inside(&self.root, Path::new(path))?;
        let current = self.documents.get(&path).ok_or_else(access_denied)?;
        if !current
            .as_deref()
            .is_some_and(|bytes| revision_token(bytes) == expected)
        {
            return Err(io::Error::other(
                "This editor revision is stale. Reopen the file or use Save As.",
            ));
        }
        editor_file_core::commit(&path, content, current)?;
        let revision = editor_file_core::digest(content.as_bytes());
        let token = revision_token(&revision);
        self.documents.insert(path, Some(revision));
        Ok(token)
    }
}

fn excluded_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | ".svn"
            | ".hg"
            | "node_modules"
            | "target"
            | "dist"
            | ".next"
            | ".venv"
            | "venv"
            | "__pycache__"
            | ".cache"
    )
}

fn source_file(name: &str) -> bool {
    if name.starts_with(".env") || name.starts_with("credentials.") || name.starts_with("secrets.")
    {
        return false;
    }
    matches!(
        name,
        "makefile" | "cmakelists.txt" | "dockerfile" | "justfile"
    ) || name.rsplit_once('.').is_some_and(|(_, extension)| {
        matches!(
            extension,
            "dex"
                | "js"
                | "jsx"
                | "mjs"
                | "cjs"
                | "ts"
                | "tsx"
                | "json"
                | "md"
                | "txt"
                | "css"
                | "scss"
                | "html"
                | "xml"
                | "py"
                | "rs"
                | "go"
                | "java"
                | "kt"
                | "c"
                | "h"
                | "cc"
                | "cpp"
                | "hpp"
                | "cs"
                | "rb"
                | "php"
                | "sh"
                | "bash"
                | "zsh"
                | "sql"
                | "yml"
                | "yaml"
                | "toml"
                | "ini"
                | "vue"
                | "svelte"
                | "ps1"
                | "svg"
        )
    })
}

pub fn list(root: &Path, cancelled: impl Fn() -> bool) -> io::Result<Listing> {
    let mut result = Listing {
        files: Vec::new(),
        limited: false,
        unreadable: 0,
    };
    let mut pending = vec![(root.to_owned(), 0)];
    let mut seen = 0;
    while let Some((directory, depth)) = pending.pop() {
        if cancelled() {
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "Project scan canceled.",
            ));
        }
        if !directory
            .symlink_metadata()
            .is_ok_and(|meta| regular(&meta) && meta.is_dir())
            || !directory
                .canonicalize()
                .is_ok_and(|resolved| resolved.starts_with(root))
        {
            if depth == 0 {
                return Err(access_denied());
            }
            result.unreadable += 1;
            continue;
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if depth == 0 => return Err(error),
            Err(_) => {
                result.unreadable += 1;
                continue;
            }
        };
        for entry in entries {
            if cancelled() {
                return Err(io::Error::new(
                    io::ErrorKind::Interrupted,
                    "Project scan canceled.",
                ));
            }
            if result.files.len() >= MAX_FILES || seen >= MAX_ENTRIES {
                result.limited = true;
                break;
            }
            seen += 1;
            let path = match entry {
                Ok(entry) => entry.path(),
                Err(_) => {
                    result.unreadable += 1;
                    continue;
                }
            };
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            if excluded_dir(&name) {
                continue;
            }
            match path.symlink_metadata() {
                Ok(meta) if regular(&meta) && meta.is_dir() => {
                    if depth < MAX_DEPTH {
                        pending.push((path, depth + 1));
                    } else {
                        result.limited = true;
                    }
                }
                Ok(meta) if regular(&meta) && meta.is_file() && source_file(&name) => {
                    if let Some(relative) = path.strip_prefix(root).ok().and_then(Path::to_str) {
                        result.files.push(ProjectFile {
                            name: relative.replace('\\', "/"),
                            path,
                        });
                    } else {
                        result.unreadable += 1;
                    }
                }
                Err(_) => result.unreadable += 1,
                _ => {}
            }
        }
        if result.files.len() >= MAX_FILES || seen >= MAX_ENTRIES {
            result.limited = true;
            break;
        }
    }
    result
        .files
        .sort_unstable_by(|left, right| left.name.cmp(&right.name));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let root = std::env::temp_dir().join(format!(
                "dex-project-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&root).unwrap();
            Self(root_path(&root).unwrap())
        }
        fn file(&self, name: &str, content: &str) -> PathBuf {
            let file = self.0.join(name);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(&file, content).unwrap();
            file
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn scans_and_searches_nested_sources_without_dependencies_or_environment_files() {
        let project = Fixture::new();
        project.file("src/deep/main.ts", "export const Title = 'Καλημέρα';\n");
        project.file(".github/workflows/check.yml", "name: Source checks\n");
        project.file("node_modules/pkg/index.js", "Καλημέρα");
        project.file(".env.local", "Καλημέρα");
        project.file("target/generated.rs", "Καλημέρα");
        let listing = list(&project.0, || false).unwrap();
        assert_eq!(
            listing
                .files
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            [".github/workflows/check.yml", "src/deep/main.ts"]
        );
        let search = search(&project.0, "ΚΑΛΗΜΈΡΑ", 20, || false).unwrap();
        assert_eq!(search.hits.len(), 1);
        assert_eq!(search.hits[0].name, "src/deep/main.ts");
        assert_eq!(search.hits[0].line, 1);
    }

    #[test]
    fn saves_project_files_in_place_and_detects_stale_editor_and_disk_revisions() {
        let project = Fixture::new();
        let file = project.file("src/main.rs", "first λ");
        let mut workspace = Workspace::new(project.0.clone());
        let opened = workspace.open("src/main.rs").unwrap();
        let updated = workspace
            .save(file.to_str().unwrap(), "second λ", &opened.revision)
            .unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "second λ");
        assert!(workspace
            .save(file.to_str().unwrap(), "stale", &opened.revision)
            .is_err());
        fs::write(&file, "external edit").unwrap();
        assert!(workspace
            .save(file.to_str().unwrap(), "clobbered", &updated)
            .is_err());
        assert_eq!(fs::read_to_string(file).unwrap(), "external edit");
    }

    #[test]
    fn opening_and_saving_is_scoped_to_the_workspace_and_document() {
        let project = Fixture::new();
        let other = Fixture::new();
        let private = other.file("private.txt", "unchanged");
        let first = project.file("first.ts", "same content");
        let second = project.file("second.ts", "same content");
        let mut workspace = Workspace::new(project.0.clone());
        let original = workspace.open(first.to_str().unwrap()).unwrap();
        assert!(workspace.open(private.to_str().unwrap()).is_err());
        assert!(workspace.open("../private.txt").is_err());
        assert!(workspace
            .save(second.to_str().unwrap(), "unopened", &original.revision)
            .is_err());
        let mut new_session = Workspace::new(project.0.clone());
        assert!(new_session
            .save(first.to_str().unwrap(), "wrong session", &original.revision)
            .is_err());
        assert_eq!(fs::read_to_string(private).unwrap(), "unchanged");
    }

    #[test]
    fn directory_links_do_not_add_sources_or_grant_access() {
        let project = Fixture::new();
        let other = Fixture::new();
        other.file("outside.ts", "private");
        let link = project.0.join("redirect");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&other.0, &link).unwrap();
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let ordinary = |path: &Path| {
                path.display()
                    .to_string()
                    .trim_start_matches(r"\\?\")
                    .to_owned()
            };
            let status = std::process::Command::new("cmd.exe")
                .args([
                    "/D",
                    "/C",
                    "mklink",
                    "/J",
                    &ordinary(&link),
                    &ordinary(&other.0),
                ])
                .creation_flags(0x08000000)
                .output()
                .unwrap();
            assert!(status.status.success(), "{:?}", status);
        }
        let listing = list(&project.0, || false).unwrap();
        assert!(listing.files.is_empty());
        let mut workspace = Workspace::new(project.0.clone());
        assert!(workspace.open("redirect/outside.ts").is_err());
        #[cfg(windows)]
        fs::remove_dir(link).unwrap();
        #[cfg(unix)]
        fs::remove_file(link).unwrap();
    }

    #[test]
    fn search_obeys_cancellation_and_reports_result_limits() {
        let project = Fixture::new();
        project.file("src/get.ts", "needle\nneedle\n");
        assert_eq!(
            search(&project.0, "needle", 1, || true)
                .err()
                .unwrap()
                .kind(),
            io::ErrorKind::Interrupted
        );
        let found = search(&project.0, "needle", 1, || false).unwrap();
        assert_eq!(found.hits.len(), 1);
        assert!(found.limited);
    }

    #[test]
    fn concurrent_editor_writers_do_not_both_replace_the_same_revision() {
        let project = Fixture::new();
        let file = project.file("source.ts", "initial");
        let baseline = editor_file_core::revision(&file).unwrap();
        let successes = std::thread::scope(|scope| {
            let one = scope.spawn(|| editor_file_core::commit(&file, "one", &baseline).is_ok());
            let two = scope.spawn(|| editor_file_core::commit(&file, "two", &baseline).is_ok());
            [one.join().unwrap(), two.join().unwrap()]
                .into_iter()
                .filter(|success| *success)
                .count()
        });
        assert_eq!(successes, 1);
        assert!(matches!(
            fs::read_to_string(&file).unwrap().as_str(),
            "one" | "two"
        ));
        assert_eq!(fs::read_dir(&project.0).unwrap().count(), 1);
    }
}

pub fn search(
    root: &Path,
    query: &str,
    limit: usize,
    cancelled: impl Fn() -> bool,
) -> io::Result<Search> {
    use std::io::Read;
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Search {
            hits: Vec::new(),
            limited: false,
            skipped: 0,
        });
    }
    let index = list(root, &cancelled)?;
    let mut result = Search {
        hits: Vec::new(),
        limited: index.limited,
        skipped: index.unreadable,
    };
    let mut read_bytes = 0;
    let limit = limit.clamp(1, 200);
    'files: for file in index.files {
        if cancelled() {
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "Project search canceled.",
            ));
        }
        if read_bytes >= MAX_SEARCH_BYTES {
            result.limited = true;
            break;
        }
        let path = match path_inside(root, &file.path) {
            Ok(path) => path,
            Err(_) => {
                result.skipped += 1;
                continue;
            }
        };
        let budget = (MAX_SEARCH_BYTES - read_bytes).min(MAX_SEARCH_FILE_BYTES as usize);
        let mut bytes = Vec::new();
        let read = fs::File::open(path)
            .and_then(|file| file.take((budget + 1) as u64).read_to_end(&mut bytes));
        read_bytes += bytes.len();
        if read.is_err() || bytes.len() > budget {
            result.skipped += 1;
            continue;
        }
        let Ok(text) = std::str::from_utf8(&bytes) else {
            result.skipped += 1;
            continue;
        };
        for (line, text) in text.lines().enumerate() {
            if text.to_lowercase().contains(&query) {
                result.hits.push(SearchHit {
                    path: file.path.clone(),
                    name: file.name.clone(),
                    line: line + 1,
                    text: text.trim().chars().take(200).collect(),
                });
                if result.hits.len() == limit {
                    result.limited = true;
                    break 'files;
                }
            }
        }
    }
    Ok(result)
}
