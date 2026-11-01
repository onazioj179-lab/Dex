// =============================================================================
// DEX 6.0 — Native File Scanner (GOAL-6A)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Duplicate-file detection via content hashing. Fast two-pass: group candidates
//! by byte size first (cheap), then SHA-256 only files that share a size (so most
//! files are never hashed). Streaming hash — never loads a whole file into RAM.

use rayon::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize, Clone, Debug)]
pub struct DupGroup {
    pub hash: String,
    pub size: u64,
    pub paths: Vec<String>,
}

/// Directory names never traversed: build output + vendored dependencies. A
/// `target/` or `node_modules/` would flood dedup/grouping with irrelevant files
/// and waste the hashing budget. Dot-dirs (.git, ...) are skipped separately.
/// (Kept in sync with dex-search's SKIP_DIRS so the two native walks agree.)
const SKIP_DIRS: &[&str] = &[
    "node_modules", "$recycle.bin", "target", "dist", "build", "out",
    "coverage", "vendor", "__pycache__",
];

/// True when `path` sits inside a directory the walk never descends into
/// (a SKIP_DIRS entry or a dot-dir), judged only by the components BELOW
/// `root` — so a user whose home folder happens to be called "build" is not
/// ignored wholesale. Paths outside `root` are never ignored. Live watchers use
/// this to drop events (e.g. a cargo/npm build churning `target/` or
/// `node_modules/` under Documents) that could never change the index.
pub fn is_ignored_under(root: &Path, path: &Path) -> bool {
    let rel = match path.strip_prefix(root) {
        Ok(r) => r,
        Err(_) => return false,
    };
    // Every component except the last is a directory on the way to the entry;
    // the last is the entry itself, which may also be an ignored directory.
    rel.components().any(|c| match c {
        std::path::Component::Normal(name) => {
            let name = name.to_string_lossy().to_lowercase();
            name.starts_with('.') || SKIP_DIRS.contains(&name.as_str())
        }
        _ => false,
    })
}

/// Bounded depth-first walk returning (path, size, modified_secs) for files.
/// The mtime is carried so change-detection snapshots can reuse the one walk.
fn walk(root: &Path, max: usize) -> Vec<(PathBuf, u64, u64)> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    let cap_scan = max.saturating_mul(4);
    let mut scanned = 0usize;
    while let Some(dir) = stack.pop() {
        if out.len() >= max || scanned >= cap_scan {
            break;
        }
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            scanned += 1;
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                stack.push(entry.path());
            } else {
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                out.push((entry.path(), meta.len(), modified));
                if out.len() >= max {
                    break;
                }
            }
        }
    }
    out
}

/// SHA-256 of a file's contents (streaming).
fn hash_file(path: &Path) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).ok()?;
    Some(format!("{:x}", hasher.finalize()))
}

/// Find groups of byte-identical files under `root` (bounded to `max` files).
pub fn find_duplicates(root: &Path, max: usize) -> Vec<DupGroup> {
    let mut by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    for (path, size, _modified) in walk(root, max) {
        if size > 0 {
            by_size.entry(size).or_default().push(path);
        }
    }

    // Only files that share a size can be duplicates — collect those candidates,
    // then SHA-256 them all in parallel (hashing is the dominant, embarrassingly
    // parallel cost; each hash_file is independent and streams).
    let candidates: Vec<(u64, PathBuf)> = by_size
        .into_iter()
        .filter(|(_, ps)| ps.len() >= 2)
        .flat_map(|(size, ps)| ps.into_iter().map(move |p| (size, p)))
        .collect();
    let hashed: Vec<(u64, String, String)> = candidates
        .par_iter()
        .filter_map(|(size, p)| {
            hash_file(p).map(|h| (*size, h, p.to_string_lossy().to_string()))
        })
        .collect();

    // Regroup by (size, hash); a group of >=2 identical files is a duplicate set.
    let mut by_sh: HashMap<(u64, String), Vec<String>> = HashMap::new();
    for (size, hash, path) in hashed {
        by_sh.entry((size, hash)).or_default().push(path);
    }
    let mut groups: Vec<DupGroup> = by_sh
        .into_iter()
        .filter(|(_, ps)| ps.len() >= 2)
        .map(|((size, hash), paths)| DupGroup { hash, size, paths })
        .collect();
    // Largest wasted space first (saturating to avoid overflow on absurd inputs).
    groups.sort_by(|a, b| {
        b.size
            .saturating_mul(b.paths.len() as u64)
            .cmp(&a.size.saturating_mul(a.paths.len() as u64))
    });
    groups
}

/// Map a filename to a high-level category for smart organization.
pub fn categorize(name: &str) -> &'static str {
    let ext = std::path::Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "heic" | "tiff" => "images",
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv" => "videos",
        "mp3" | "wav" | "flac" | "ogg" | "aac" | "m4a" | "wma" => "audio",
        "pdf" | "doc" | "docx" | "txt" | "md" | "rtf" | "odt" | "pages" => "documents",
        "xls" | "xlsx" | "csv" | "ods" | "numbers" => "spreadsheets",
        "ppt" | "pptx" | "key" | "odp" => "presentations",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" => "archives",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "java" | "go" | "c" | "cpp" | "h" | "html"
        | "css" | "json" | "xml" | "sh" | "rb" | "php" | "sql" => "code",
        "exe" | "msi" | "dmg" | "app" | "deb" | "rpm" => "applications",
        _ => "other",
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct TypeGroup {
    pub category: String,
    pub count: usize,
    pub total_size: u64,
    pub paths: Vec<String>,
}

/// Group files under `root` by category (count + total size + paths), largest first.
pub fn group_by_type(root: &Path, max: usize) -> Vec<TypeGroup> {
    let mut map: HashMap<&'static str, (usize, u64, Vec<String>)> = HashMap::new();
    for (path, size, _modified) in walk(root, max) {
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let entry = map.entry(categorize(&name)).or_default();
        entry.0 += 1;
        entry.1 += size;
        entry.2.push(path.to_string_lossy().to_string());
    }
    let mut out: Vec<TypeGroup> = map
        .into_iter()
        .map(|(cat, (count, total_size, paths))| TypeGroup {
            category: cat.to_string(),
            count,
            total_size,
            paths,
        })
        .collect();
    out.sort_by_key(|b| std::cmp::Reverse(b.count));
    out
}

// ---------------------------------------------------------------------------
// Change detection — the basis of native file monitoring. Take a `Snapshot` of a
// tree, take another later, and `diff_snapshots` reports exactly what was added,
// modified, or removed. A watcher feeds those paths to the search index's
// `upsert_file` / `remove_path` so the index stays live without a full rebuild.
// ---------------------------------------------------------------------------

/// A lightweight per-file fingerprint: byte size + mtime (seconds). A change to
/// either marks the file modified — cheap and avoids hashing on every poll.
#[derive(Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct FileStamp {
    pub size: u64,
    pub modified: u64,
}

/// State of a tree at one moment: path -> stamp.
pub type Snapshot = HashMap<String, FileStamp>;

/// Capture a `{path -> stamp}` snapshot of `root` (bounded to `max` files).
pub fn scan_snapshot(root: &Path, max: usize) -> Snapshot {
    walk(root, max)
        .into_iter()
        .map(|(path, size, modified)| {
            (path.to_string_lossy().to_string(), FileStamp { size, modified })
        })
        .collect()
}

/// The paths that changed between two snapshots of the same tree.
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SnapshotDiff {
    pub added: Vec<String>,
    pub modified: Vec<String>,
    pub removed: Vec<String>,
}

impl SnapshotDiff {
    pub fn is_empty(&self) -> bool {
        self.added.is_empty() && self.modified.is_empty() && self.removed.is_empty()
    }
}

/// Diff `old` -> `new`: present only in `new` = added; in both with a changed
/// stamp = modified; present only in `old` = removed. Each list is sorted so the
/// result is deterministic.
pub fn diff_snapshots(old: &Snapshot, new: &Snapshot) -> SnapshotDiff {
    let mut d = SnapshotDiff::default();
    for (path, stamp) in new {
        match old.get(path) {
            None => d.added.push(path.clone()),
            Some(prev) if prev != stamp => d.modified.push(path.clone()),
            _ => {}
        }
    }
    for path in old.keys() {
        if !new.contains_key(path) {
            d.removed.push(path.clone());
        }
    }
    d.added.sort();
    d.modified.sort();
    d.removed.sort();
    d
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignored_under_skips_build_dirs_and_dot_dirs_below_root() {
        let root = Path::new("C:/Users/u/Documents");
        assert!(is_ignored_under(root, Path::new("C:/Users/u/Documents/app/node_modules/x/i.js")));
        assert!(is_ignored_under(root, Path::new("C:/Users/u/Documents/rs/target/release/a.o")));
        assert!(is_ignored_under(root, Path::new("C:/Users/u/Documents/repo/.git/index")));
        assert!(is_ignored_under(root, Path::new("C:/Users/u/Documents/web/Dist/main.js")));
        assert!(!is_ignored_under(root, Path::new("C:/Users/u/Documents/notes/todo.txt")));
        assert!(!is_ignored_under(root, Path::new("C:/Users/u/Documents/targets.txt")));
    }

    #[test]
    fn ignored_under_judges_only_components_below_root() {
        // A home folder literally named "build" must not hide everything.
        let root = Path::new("C:/Users/build/Documents");
        assert!(!is_ignored_under(root, Path::new("C:/Users/build/Documents/report.docx")));
        // Outside the root: never ignored.
        assert!(!is_ignored_under(root, Path::new("D:/elsewhere/node_modules/a.js")));
    }

    #[test]
    fn categorizes_by_extension() {
        assert_eq!(categorize("photo.JPG"), "images");
        assert_eq!(categorize("song.mp3"), "audio");
        assert_eq!(categorize("main.rs"), "code");
        assert_eq!(categorize("report.pdf"), "documents");
        assert_eq!(categorize("noext"), "other");
    }

    #[test]
    fn groups_files_by_type() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.png"), b"x").unwrap();
        std::fs::write(dir.path().join("b.png"), b"yy").unwrap();
        std::fs::write(dir.path().join("c.rs"), b"zzz").unwrap();
        let groups = group_by_type(dir.path(), 1000);
        let images = groups.iter().find(|g| g.category == "images").unwrap();
        assert_eq!(images.count, 2);
        assert!(groups.iter().any(|g| g.category == "code" && g.count == 1));
    }

    #[test]
    fn finds_byte_identical_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"same content here").unwrap();
        std::fs::write(dir.path().join("b.txt"), b"same content here").unwrap();
        std::fs::write(dir.path().join("c.txt"), b"different!!!").unwrap();

        let groups = find_duplicates(dir.path(), 1000);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].paths.len(), 2);
        assert_eq!(groups[0].size, 17); // "same content here"
    }

    #[test]
    fn same_size_different_content_is_not_a_duplicate() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"AAAA").unwrap();
        std::fs::write(dir.path().join("b.txt"), b"BBBB").unwrap(); // same size, different bytes
        assert!(find_duplicates(dir.path(), 1000).is_empty());
    }

    #[test]
    fn snapshot_diff_detects_add_modify_remove() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.txt");
        let b = dir.path().join("b.txt");
        std::fs::write(&a, b"one").unwrap();
        std::fs::write(&b, b"two").unwrap();
        let snap1 = scan_snapshot(dir.path(), 1000);
        assert_eq!(snap1.len(), 2);

        // Add c, modify a (size changes -> detected regardless of mtime resolution),
        // remove b.
        std::fs::write(dir.path().join("c.txt"), b"three").unwrap();
        std::fs::write(&a, b"one-much-longer-now").unwrap();
        std::fs::remove_file(&b).unwrap();
        let snap2 = scan_snapshot(dir.path(), 1000);

        let d = diff_snapshots(&snap1, &snap2);
        assert_eq!(d.added.len(), 1, "exactly c.txt added");
        assert!(d.added[0].ends_with("c.txt"));
        assert_eq!(d.modified.len(), 1, "exactly a.txt modified");
        assert!(d.modified[0].ends_with("a.txt"));
        assert_eq!(d.removed.len(), 1, "exactly b.txt removed");
        assert!(d.removed[0].ends_with("b.txt"));
        assert!(!d.is_empty());
    }

    #[test]
    fn identical_snapshots_diff_empty() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"x").unwrap();
        let s = scan_snapshot(dir.path(), 1000);
        assert!(diff_snapshots(&s, &s.clone()).is_empty());
    }

    #[test]
    fn no_files_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(find_duplicates(dir.path(), 1000).is_empty());
    }

    #[test]
    fn skips_build_and_dependency_dirs() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("keep.png"), b"x").unwrap();
        // Two identical files inside target/ would be a duplicate group IF scanned.
        let tgt = dir.path().join("target");
        std::fs::create_dir_all(&tgt).unwrap();
        std::fs::write(tgt.join("artifact.png"), b"x").unwrap();
        std::fs::write(tgt.join("artifact2.png"), b"x").unwrap();

        let total: usize = group_by_type(dir.path(), 1000).iter().map(|g| g.count).sum();
        assert_eq!(total, 1, "only keep.png should be scanned");
        assert!(find_duplicates(dir.path(), 1000).is_empty(), "target/ dupes must not be scanned");
    }
}
