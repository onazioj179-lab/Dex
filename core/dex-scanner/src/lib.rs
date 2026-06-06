// =============================================================================
// DEX 6.0 — Native File Scanner (GOAL-6A)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Duplicate-file detection via content hashing. Fast two-pass: group candidates
//! by byte size first (cheap), then SHA-256 only files that share a size (so most
//! files are never hashed). Streaming hash — never loads a whole file into RAM.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug)]
pub struct DupGroup {
    pub hash: String,
    pub size: u64,
    pub paths: Vec<String>,
}

/// Bounded depth-first walk returning (path, size) for files.
fn walk(root: &Path, max: usize) -> Vec<(PathBuf, u64)> {
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
                if name.starts_with('.') || name == "node_modules" || name == "$recycle.bin" {
                    continue;
                }
                stack.push(entry.path());
            } else {
                out.push((entry.path(), meta.len()));
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
    for (path, size) in walk(root, max) {
        if size > 0 {
            by_size.entry(size).or_default().push(path);
        }
    }

    let mut groups: Vec<DupGroup> = Vec::new();
    for (size, paths) in by_size {
        if paths.len() < 2 {
            continue; // unique size -> can't be a duplicate
        }
        let mut by_hash: HashMap<String, Vec<String>> = HashMap::new();
        for p in paths {
            if let Some(h) = hash_file(&p) {
                by_hash.entry(h).or_default().push(p.to_string_lossy().to_string());
            }
        }
        for (hash, ps) in by_hash {
            if ps.len() >= 2 {
                groups.push(DupGroup { hash, size, paths: ps });
            }
        }
    }
    // Largest wasted space first.
    groups.sort_by(|a, b| (b.size * b.paths.len() as u64).cmp(&(a.size * a.paths.len() as u64)));
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
    for (path, size) in walk(root, max) {
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
    out.sort_by(|a, b| b.count.cmp(&a.count));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn no_files_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(find_duplicates(dir.path(), 1000).is_empty());
    }
}
