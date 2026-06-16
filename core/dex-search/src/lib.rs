// =============================================================================
// DEX 6.0 — Native Search Index (GOAL-6A)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Tantivy-backed full-text file index. Replaces the bounded per-query
//! filesystem walk with a real index: build once (`index_path`), then query
//! instantly (`search`). Schema: path/name/ext (stored) + modified/size (stored
//! u64). Queries are prefix-friendly so "rep" matches "report.pdf".

use rayon::prelude::*;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tantivy::collector::TopDocs;
use tantivy::directory::MmapDirectory;
use tantivy::query::QueryParser;
use tantivy::schema::{
    Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, Value, STORED, STRING, TEXT,
};
use tantivy::tokenizer::{LowerCaser, NgramTokenizer, TextAnalyzer};
use tantivy::{doc, Index, IndexWriter, TantivyDocument, Term};

/// One search result, shaped to match the renderer's file-result contract.
#[derive(Serialize, Clone, Debug)]
pub struct FileHit {
    pub path: String,
    pub name: String,
    pub extension: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub modified: u64,
    pub size: u64,
    pub score: f32,
}

/// Cheap to clone — `Index` is Arc-backed and `Field` is `Copy`, so a clone
/// shares the same underlying index. This lets callers clone the handle out of a
/// `Mutex` guard and run long operations (rebuild) WITHOUT holding the lock.
#[derive(Clone)]
pub struct SearchIndex {
    index: Index,
    f_path: Field,
    f_name: Field,
    f_ext: Field,
    f_content: Field,
    f_modified: Field,
    f_size: Field,
    /// Hot cache of recent `query -> results`, shared across cheap clones (Arc) and
    /// CLEARED on every write (index_path / upsert / remove / clear). Invalidate-on-
    /// write means a cached result can never be stale; it only saves repeat-query
    /// Tantivy work between mutations. Bounded (LRU) so it can't grow unbounded.
    query_cache: std::sync::Arc<std::sync::Mutex<dex_cache::Cache<String, Vec<FileHit>>>>,
}

/// Text-ish extensions whose contents we full-text index (bounded size).
const TEXT_EXTS: &[&str] = &[
    "txt", "md", "markdown", "json", "csv", "tsv", "log", "rs", "ts", "tsx", "js", "jsx",
    "py", "html", "htm", "css", "xml", "yml", "yaml", "toml", "ini", "cfg", "sh", "c", "h",
    "cpp", "java", "go", "rb", "php", "sql",
];
const MAX_CONTENT_BYTES: u64 = 262_144; // 256 KB per file

/// Directory names that are never indexed: build output + vendored dependencies.
/// Indexing these is pure noise + bloat (e.g. a Rust `target/` or JS `dist/` can
/// hold tens of thousands of generated files). Dot-dirs (.git, .next, ...) are
/// already skipped separately.
const SKIP_DIRS: &[&str] = &[
    "node_modules", "$recycle.bin", "target", "dist", "build", "out",
    "coverage", "vendor", "__pycache__",
];

fn read_text_content(path: &Path, size: u64) -> String {
    if size == 0 || size > MAX_CONTENT_BYTES {
        return String::new();
    }
    let is_text = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| TEXT_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false);
    if !is_text {
        return String::new();
    }
    std::fs::read_to_string(path).unwrap_or_default()
}

/// Build the indexable field tuple for one file: (path, name, ext, modified,
/// size, content). Returns `None` if the path is not a readable regular file.
/// Shared by the single-file upsert path so it stays in lock-step with the
/// bulk `index_path` document shape.
fn file_record(path: &Path) -> Option<(String, String, String, u64, u64, String)> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let size = meta.len();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let name = path
        .file_name()
        .map(|x| x.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|x| x.to_string_lossy().to_string())
        .unwrap_or_default();
    let content = read_text_content(path, size);
    Some((path.to_string_lossy().to_string(), name, ext, modified, size, content))
}

impl SearchIndex {
    /// Open (or create) an on-disk index at `dir`.
    pub fn open_or_create(dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let mut sb = Schema::builder();
        let f_path = sb.add_text_field("path", STRING | STORED);
        // Edge-ngram tokenized name so "budg" matches "budget.pdf" (prefix search).
        let name_opts = TextOptions::default().set_stored().set_indexing_options(
            TextFieldIndexing::default()
                .set_tokenizer("dex_prefix")
                .set_index_option(IndexRecordOption::WithFreqsAndPositions),
        );
        let f_name = sb.add_text_field("name", name_opts);
        let f_ext = sb.add_text_field("ext", STRING | STORED);
        // Full-text file contents (default word tokenizer, indexed not stored).
        let f_content = sb.add_text_field("content", TEXT);
        let f_modified = sb.add_u64_field("modified", STORED);
        let f_size = sb.add_u64_field("size", STORED);
        let schema = sb.build();
        let mmap = MmapDirectory::open(dir).map_err(|e| e.to_string())?;
        let index = Index::open_or_create(mmap, schema).map_err(|e| e.to_string())?;
        // Register the edge-ngram (prefix-only) tokenizer + lowercase folding.
        let tokenizer = TextAnalyzer::builder(
            NgramTokenizer::new(2, 12, true).map_err(|e| e.to_string())?,
        )
        .filter(LowerCaser)
        .build();
        index.tokenizers().register("dex_prefix", tokenizer);
        Ok(Self {
            index,
            f_path,
            f_name,
            f_ext,
            f_content,
            f_modified,
            f_size,
            query_cache: std::sync::Arc::new(std::sync::Mutex::new(dex_cache::Cache::new(64))),
        })
    }

    /// Drop every cached query result. Called after any write so the next search
    /// recomputes against the current index (invalidate-on-write).
    fn invalidate_cache(&self) {
        if let Ok(mut c) = self.query_cache.lock() {
            c.clear();
        }
    }

    /// Number of indexed documents.
    pub fn count(&self) -> u64 {
        match self.index.reader() {
            Ok(r) => r.searcher().num_docs(),
            Err(_) => 0,
        }
    }

    /// Remove every document.
    pub fn clear(&self) -> Result<(), String> {
        let mut writer: IndexWriter = self.index.writer(50_000_000).map_err(|e| e.to_string())?;
        writer.delete_all_documents().map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
        self.invalidate_cache();
        Ok(())
    }

    /// Walk `root` (bounded) and index every file. Returns the count indexed.
    pub fn index_path(&self, root: &Path, max: usize) -> Result<usize, String> {
        let mut writer: IndexWriter = self.index.writer(50_000_000).map_err(|e| e.to_string())?;
        // Read file contents (the I/O-bound part) in parallel, then feed the
        // single IndexWriter sequentially (the writer isn't Sync for concurrent
        // adds). Preserves the same documents, just overlaps the per-file reads.
        let prepared: Vec<(String, String, String, u64, u64, String)> = walk(root, max)
            .into_par_iter()
            .map(|(path, modified, size)| {
                let name = path
                    .file_name()
                    .map(|x| x.to_string_lossy().to_string())
                    .unwrap_or_default();
                let ext = path
                    .extension()
                    .map(|x| x.to_string_lossy().to_string())
                    .unwrap_or_default();
                let content = read_text_content(&path, size);
                (path.to_string_lossy().to_string(), name, ext, modified, size, content)
            })
            .collect();

        let n = prepared.len();
        for (path, name, ext, modified, size, content) in prepared {
            writer
                .add_document(doc!(
                    self.f_path => path,
                    self.f_name => name,
                    self.f_ext => ext,
                    self.f_content => content,
                    self.f_modified => modified,
                    self.f_size => size,
                ))
                .map_err(|e| e.to_string())?;
        }
        writer.commit().map_err(|e| e.to_string())?;
        self.invalidate_cache();
        Ok(n)
    }

    /// Index or re-index a single file (upsert by exact path). Any prior document
    /// for the same path is deleted in the same commit, so re-indexing a changed
    /// file never duplicates it and the index stays live WITHOUT a full rebuild --
    /// the hook a file-watcher needs. Returns `Ok(false)` when the path is not an
    /// indexable regular file.
    pub fn upsert_file(&self, path: &Path) -> Result<bool, String> {
        let (path_str, name, ext, modified, size, content) = match file_record(path) {
            Some(rec) => rec,
            None => return Ok(false),
        };
        let mut writer: IndexWriter = self.index.writer(15_000_000).map_err(|e| e.to_string())?;
        // delete-then-add in one commit: the new doc has a higher opstamp than the
        // delete, so it survives while the previous version (older opstamp) is removed.
        writer.delete_term(Term::from_field_text(self.f_path, &path_str));
        writer
            .add_document(doc!(
                self.f_path => path_str,
                self.f_name => name,
                self.f_ext => ext,
                self.f_content => content,
                self.f_modified => modified,
                self.f_size => size,
            ))
            .map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
        self.invalidate_cache();
        Ok(true)
    }

    /// Remove a single file from the index by exact path. A no-op (still `Ok`) if
    /// the path was never indexed -- safe to call on any delete event.
    pub fn remove_path(&self, path: &Path) -> Result<(), String> {
        let mut writer: IndexWriter = self.index.writer(15_000_000).map_err(|e| e.to_string())?;
        writer.delete_term(Term::from_field_text(self.f_path, &path.to_string_lossy()));
        writer.commit().map_err(|e| e.to_string())?;
        self.invalidate_cache();
        Ok(())
    }

    /// Query the index. Prefix-friendly (each term gets a trailing `*`); falls
    /// back to a plain parse if the wildcard form fails.
    pub fn search(&self, query: &str, limit: usize) -> Vec<FileHit> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return Vec::new();
        }
        // Cache key folds in the limit (different limits = different result sets).
        let cache_key = format!("{}\u{1f}{}", limit, q);
        if let Ok(mut c) = self.query_cache.lock() {
            if let Some(hits) = c.get(&cache_key) {
                return hits.clone();
            }
        }
        let reader = match self.index.reader() {
            Ok(r) => r,
            Err(_) => return Vec::new(),
        };
        let searcher = reader.searcher();
        let parser = QueryParser::for_index(&self.index, vec![self.f_name, self.f_content, self.f_path]);
        // The edge-ngram tokenizer on `name` handles prefix matching, so the raw
        // query is enough — "budg" tokenizes to prefixes that match "budget".
        let parsed = parser.parse_query(&q);
        let query = match parsed {
            Ok(x) => x,
            Err(_) => return Vec::new(),
        };
        let top = match searcher.search(&query, &TopDocs::with_limit(limit.max(1))) {
            Ok(t) => t,
            Err(_) => return Vec::new(),
        };
        let mut hits = Vec::with_capacity(top.len());
        for (score, addr) in top {
            if let Ok(doc) = searcher.doc::<TantivyDocument>(addr) {
                let s = |f: Field| {
                    doc.get_first(f)
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                };
                let u = |f: Field| doc.get_first(f).and_then(|v| v.as_u64()).unwrap_or(0);
                let ext = s(self.f_ext);
                hits.push(FileHit {
                    path: s(self.f_path),
                    name: s(self.f_name),
                    extension: ext.clone(),
                    kind: ext,
                    modified: u(self.f_modified),
                    size: u(self.f_size),
                    score,
                });
            }
        }
        // Cache the freshly-computed result; any write clears this (see
        // invalidate_cache), so what we store here can never be served stale.
        if let Ok(mut c) = self.query_cache.lock() {
            c.insert(cache_key, hits.clone());
        }
        hits
    }
}

/// Bounded depth-first file walk; returns (path, modified_secs, size).
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
                out.push((entry.path(), modified, meta.len()));
                if out.len() >= max {
                    break;
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_and_search_files() {
        let index_dir = tempfile::tempdir().unwrap();
        let data_dir = tempfile::tempdir().unwrap();
        // Create a few files.
        std::fs::write(data_dir.path().join("report_2024.pdf"), b"x").unwrap();
        std::fs::write(data_dir.path().join("budget.xlsx"), b"x").unwrap();
        std::fs::write(data_dir.path().join("notes.txt"), b"x").unwrap();

        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();
        let n = idx.index_path(data_dir.path(), 1000).unwrap();
        assert_eq!(n, 3);
        assert_eq!(idx.count(), 3);

        // Exact token + prefix both find the report.
        let hits = idx.search("report", 10);
        assert!(hits.iter().any(|h| h.name == "report_2024.pdf"));
        let prefix = idx.search("budg", 10);
        assert!(prefix.iter().any(|h| h.name == "budget.xlsx"));

        // Empty query returns nothing; unknown term returns nothing.
        assert!(idx.search("", 10).is_empty());
        assert!(idx.search("zzzznotfound", 10).is_empty());
    }

    #[test]
    fn clear_empties_the_index() {
        let index_dir = tempfile::tempdir().unwrap();
        let data_dir = tempfile::tempdir().unwrap();
        std::fs::write(data_dir.path().join("a.txt"), b"x").unwrap();
        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();
        idx.index_path(data_dir.path(), 10).unwrap();
        assert_eq!(idx.count(), 1);
        idx.clear().unwrap();
        assert_eq!(idx.count(), 0);
    }

    #[test]
    fn searches_inside_file_contents() {
        let index_dir = tempfile::tempdir().unwrap();
        let data_dir = tempfile::tempdir().unwrap();
        std::fs::write(data_dir.path().join("notes.txt"), b"the quick brown fox jumps").unwrap();
        std::fs::write(data_dir.path().join("other.txt"), b"nothing relevant in here").unwrap();

        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();
        idx.index_path(data_dir.path(), 1000).unwrap();

        // "brown" appears only in the file CONTENT, not in any filename.
        let hits = idx.search("brown", 10);
        assert!(hits.iter().any(|h| h.name == "notes.txt"), "content search should find notes.txt");
        assert!(!hits.iter().any(|h| h.name == "other.txt"));
    }

    #[test]
    fn upsert_replaces_without_duplicating() {
        let index_dir = tempfile::tempdir().unwrap();
        let data_dir = tempfile::tempdir().unwrap();
        let f = data_dir.path().join("live.txt");
        std::fs::write(&f, b"alpha content").unwrap();

        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();
        assert!(idx.upsert_file(&f).unwrap());
        assert_eq!(idx.count(), 1);
        assert!(idx.search("alpha", 10).iter().any(|h| h.name == "live.txt"));

        // Re-write the file and upsert again: still ONE doc, new content searchable,
        // the old content gone.
        std::fs::write(&f, b"beta content").unwrap();
        assert!(idx.upsert_file(&f).unwrap());
        assert_eq!(idx.count(), 1, "upsert must replace, not duplicate");
        assert!(idx.search("beta", 10).iter().any(|h| h.name == "live.txt"));
        assert!(idx.search("alpha", 10).is_empty(), "stale content should be gone");

        // A directory (or missing path) is not an indexable file.
        assert!(!idx.upsert_file(data_dir.path()).unwrap());
    }

    #[test]
    fn remove_path_deletes_one_file() {
        let index_dir = tempfile::tempdir().unwrap();
        let data_dir = tempfile::tempdir().unwrap();
        std::fs::write(data_dir.path().join("alpha.txt"), b"alpha unique").unwrap();
        std::fs::write(data_dir.path().join("bravo.txt"), b"bravo unique").unwrap();
        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();
        idx.index_path(data_dir.path(), 100).unwrap();
        assert_eq!(idx.count(), 2);

        idx.remove_path(&data_dir.path().join("alpha.txt")).unwrap();
        assert_eq!(idx.count(), 1);
        assert!(idx.search("alpha", 10).is_empty(), "removed file should not match");
        assert!(idx.search("bravo", 10).iter().any(|h| h.name == "bravo.txt"));

        // Removing an absent path is a no-op (still Ok), leaving the index intact.
        idx.remove_path(&data_dir.path().join("ghost.txt")).unwrap();
        assert_eq!(idx.count(), 1);
    }

    #[test]
    fn query_cache_is_invalidated_on_write() {
        let index_dir = tempfile::tempdir().unwrap();
        let data_dir = tempfile::tempdir().unwrap();
        std::fs::write(data_dir.path().join("alpha.txt"), b"x").unwrap();
        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();
        idx.index_path(data_dir.path(), 100).unwrap();

        // Prime the cache with a query that currently has no "beta" match.
        assert!(idx.search("beta", 10).is_empty());

        // Add a matching file and upsert it. If the cache were NOT invalidated,
        // the next search would serve the stale empty result.
        let f = data_dir.path().join("beta.txt");
        std::fs::write(&f, b"x").unwrap();
        assert!(idx.upsert_file(&f).unwrap());
        assert!(
            idx.search("beta", 10).iter().any(|h| h.name == "beta.txt"),
            "write must invalidate the query cache — no stale empty result"
        );
    }

    #[test]
    fn skips_build_and_dependency_dirs() {
        let index_dir = tempfile::tempdir().unwrap();
        let data_dir = tempfile::tempdir().unwrap();
        std::fs::write(data_dir.path().join("keep.txt"), b"x").unwrap();
        // Files inside node_modules / target must NOT be indexed.
        let nm = data_dir.path().join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();
        std::fs::write(nm.join("dep.txt"), b"x").unwrap();
        let tgt = data_dir.path().join("target");
        std::fs::create_dir_all(&tgt).unwrap();
        std::fs::write(tgt.join("artifact.txt"), b"x").unwrap();

        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();
        let n = idx.index_path(data_dir.path(), 1000).unwrap();
        assert_eq!(n, 1, "only keep.txt should be indexed");
        assert!(idx.search("dep", 10).is_empty());
        assert!(idx.search("artifact", 10).is_empty());
        assert!(idx.search("keep", 10).iter().any(|h| h.name == "keep.txt"));
    }
}
