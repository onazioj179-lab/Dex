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

#[cfg(test)]
mod tests {
    use super::*;

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
