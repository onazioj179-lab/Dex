// =============================================================================
// DEX 6.0 — Native Search Index (GOAL-6A)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Tantivy-backed full-text file index. Replaces the bounded per-query
//! filesystem walk with a real index: build once (`index_path`), then query
//! instantly (`search`). Schema: path/name/ext (stored) + modified/size (stored
//! u64). Queries are prefix-friendly so "rep" matches "report.pdf".

use rayon::prelude::*;

/// Background I/O pool for index content reads. Kept OFF rayon's global pool on purpose:
/// sysinfo's process scan (Task Manager, Nexus Diagnostics) runs its parallel
/// refresh on the global pool, and a first-launch full index of ~20k files used
/// to occupy every global worker for as long as it ran, so those calls waited
/// seconds to minutes (the "Diagnostics figures never appear" flake). Half the
/// cores, named threads, 8 MiB stacks (the app's worker standard).
fn io_pool() -> &'static rayon::ThreadPool {
    static POOL: std::sync::OnceLock<rayon::ThreadPool> = std::sync::OnceLock::new();
    POOL.get_or_init(|| {
        let n = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
        rayon::ThreadPoolBuilder::new()
            .num_threads((n / 2).max(2))
            .thread_name(|i| format!("dex-search-io-{i}"))
            .stack_size(8 * 1024 * 1024)
            .build()
            .expect("dex-search-io thread pool")
    })
}
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
/// `source` distinguishes unified content ("file" | "note" | "clipboard" | …)
/// and `id` is the stable identity used to upsert/remove it (a path for files).
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
    pub source: String,
    pub id: String,
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
    /// Content class: "file" | "note" | "clipboard" | … — lets one index hold
    /// every kind of DEX content ("fold everything indexed together").
    f_source: Field,
    /// Stable identity for upsert/remove (a filesystem path for files, an app id
    /// for notes/clipboard). Universal delete key across sources.
    f_id: Field,
    /// Hot cache of recent `query -> results`, shared across cheap clones (Arc) and
    /// CLEARED on every write (index_path / upsert / remove / clear). Invalidate-on-
    /// write means a cached result can never be stale; it only saves repeat-query
    /// Tantivy work between mutations. Bounded (LRU) so it can't grow unbounded.
    query_cache: std::sync::Arc<std::sync::Mutex<dex_cache::Cache<String, Vec<FileHit>>>>,
    /// ONE long-lived reader (manual reload after our own commits). Building a
    /// reader per search/count re-read meta.json, re-parsed the schema and
    /// spawned a meta.json watcher thread every call — visible in idle profiles.
    reader: tantivy::IndexReader,
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

/// Files whose CONTENTS are never indexed (their name still is, so the user can
/// find them): credentials, keys, keystores and environment files. Content that
/// looks like a private key is dropped too, whatever the file is called.
pub fn is_sensitive_file(path: &Path) -> bool {
    let name = path.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if name.is_empty() {
        return false;
    }
    const EXACT: &[&str] = &[
        ".env", ".npmrc", ".pypirc", ".netrc", "_netrc", ".git-credentials", ".htpasswd", "id_rsa", "id_dsa",
        "id_ecdsa", "id_ed25519", "known_hosts", "authorized_keys", "credentials", "credentials.json",
        "secrets.json", "secrets.yaml", "secrets.yml", "secrets.toml", "service-account.json", "wallet.dat",
        "keystore.json", "local.settings.json", "appsettings.secrets.json", ".dockercfg",
    ];
    if EXACT.contains(&name.as_str()) || name.starts_with(".env.") || name.ends_with(".env") {
        return true;
    }
    const EXTS: &[&str] = &["pem", "key", "pfx", "p12", "jks", "keystore", "kdbx", "ppk", "asc", "gpg", "ovpn", "der", "crt", "cer"];
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if EXTS.contains(&ext.as_str()) {
        return true;
    }
    ["secret", "password", "passwd", "credential", "private_key", "privatekey", "api_key", "apikey", "access_token", "auth_token"]
        .iter()
        .any(|w| name.contains(w))
}

/// True when text carries a private key or a well-known access-token prefix.
pub fn looks_like_secret(text: &str) -> bool {
    text.contains("PRIVATE KEY-----")
        || text.contains("-----BEGIN OPENSSH")
        || text.contains("-----BEGIN PGP PRIVATE")
        || ["ghp_", "github_pat_", "xoxb-", "xoxp-", "sk-ant-", "AKIA", "AIza", "glpat-"].iter().any(|p| {
            text.match_indices(p).any(|(i, _)| {
                // A token prefix followed by a long run of token characters.
                text[i + p.len()..].chars().take(16).filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').count() >= 16
            })
        })
}

fn read_text_content(path: &Path, size: u64) -> String {
    if size == 0 || size > MAX_CONTENT_BYTES || is_sensitive_file(path) {
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
    let text = std::fs::read_to_string(path).unwrap_or_default();
    if looks_like_secret(&text) {
        return String::new();
    }
    text
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
        let f_source = sb.add_text_field("source", STRING | STORED);
        let f_id = sb.add_text_field("docid", STRING | STORED);
        let schema = sb.build();
        let mmap = MmapDirectory::open(dir).map_err(|e| e.to_string())?;
        // Open the existing index, but if its on-disk schema predates the unified
        // (source/docid) fields, Tantivy refuses to open it. The index is only a
        // rebuildable cache, so on a schema mismatch we wipe the dir and recreate
        // rather than fail — the next sync/rebuild repopulates it.
        let index = match Index::open_or_create(mmap, schema.clone()) {
            Ok(i) => i,
            Err(_) => {
                for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
                    let _ = std::fs::remove_file(entry.path());
                }
                let mmap = MmapDirectory::open(dir).map_err(|e| e.to_string())?;
                Index::open_or_create(mmap, schema).map_err(|e| e.to_string())?
            }
        };
        // Register the edge-ngram (prefix-only) tokenizer + lowercase folding.
        let tokenizer = TextAnalyzer::builder(
            NgramTokenizer::new(2, 12, true).map_err(|e| e.to_string())?,
        )
        .filter(LowerCaser)
        .build();
        index.tokenizers().register("dex_prefix", tokenizer);
        let reader = index
            .reader_builder()
            .reload_policy(tantivy::ReloadPolicy::Manual)
            .try_into()
            .map_err(|e: tantivy::TantivyError| e.to_string())?;
        Ok(Self {
            reader,
            index,
            f_path,
            f_name,
            f_ext,
            f_content,
            f_modified,
            f_size,
            f_source,
            f_id,
            query_cache: std::sync::Arc::new(std::sync::Mutex::new(dex_cache::Cache::new(64))),
        })
    }

    /// After any commit: point the shared reader at the new segments and drop
    /// cached query results (invalidate-on-write).
    fn after_write(&self) {
        let _ = self.reader.reload();
        self.invalidate_cache();
    }

    /// The single IndexWriter, retrying briefly while another write (e.g. a
    /// background batch finishing its merges) holds the index lock, instead of
    /// failing a concurrent note/clipboard upsert outright.
    fn acquire_writer(&self, heap: usize) -> Result<IndexWriter, String> {
        let mut last = String::new();
        for _ in 0..50 {
            match self.index.writer(heap) {
                Ok(w) => return Ok(w),
                Err(tantivy::TantivyError::LockFailure(..)) => {
                    last = "index busy".into();
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(e) => return Err(e.to_string()),
            }
        }
        Err(last)
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
        self.reader.searcher().num_docs()
    }

    /// Remove every document.
    pub fn clear(&self) -> Result<(), String> {
        let mut writer: IndexWriter = self.acquire_writer(50_000_000)?;
        writer.delete_all_documents().map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
        self.after_write();
        Ok(())
    }

    /// Walk `root` (bounded) and index every file. Returns the count indexed.
    pub fn index_path(&self, root: &Path, max: usize) -> Result<usize, String> {
        let mut writer: IndexWriter = self.acquire_writer(50_000_000)?;
        // Read file contents (the I/O-bound part) in parallel, then feed the
        // single IndexWriter sequentially (the writer isn't Sync for concurrent
        // adds). Preserves the same documents, just overlaps the per-file reads.
        let files = walk(root, max);
        let prepared: Vec<(String, String, String, u64, u64, String)> = io_pool().install(|| files
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
            .collect());

        let n = prepared.len();
        for (path, name, ext, modified, size, content) in prepared {
            writer
                .add_document(doc!(
                    self.f_path => path.clone(),
                    self.f_name => name,
                    self.f_ext => ext,
                    self.f_content => content,
                    self.f_modified => modified,
                    self.f_size => size,
                    self.f_source => "file",
                    self.f_id => path,
                ))
                .map_err(|e| e.to_string())?;
        }
        writer.commit().map_err(|e| e.to_string())?;
        // Let the merges this big commit triggers finish now (we're on a
        // background thread) instead of being abandoned at exit and redone.
        let _ = writer.wait_merging_threads();
        self.after_write();
        Ok(n)
    }

    /// Apply a batch of file changes in ONE commit: upsert every indexable path in
    /// `upserts`, delete every path in `removals`. One commit per burst instead of
    /// one per file keeps the segment count (and merge work) down. Returns the
    /// number of files (re)indexed.
    pub fn apply_file_changes(&self, upserts: &[PathBuf], removals: &[PathBuf]) -> Result<usize, String> {
        if upserts.is_empty() && removals.is_empty() {
            return Ok(0);
        }
        let mut writer: IndexWriter = self.acquire_writer(15_000_000)?;
        for p in removals {
            writer.delete_term(Term::from_field_text(self.f_path, &p.to_string_lossy()));
        }
        let mut n = 0usize;
        for p in upserts {
            let Some((path_str, name, ext, modified, size, content)) = file_record(p) else {
                // Not (or no longer) an indexable file: make sure it isn't indexed.
                writer.delete_term(Term::from_field_text(self.f_path, &p.to_string_lossy()));
                continue;
            };
            writer.delete_term(Term::from_field_text(self.f_path, &path_str));
            writer
                .add_document(doc!(
                    self.f_path => path_str.clone(),
                    self.f_name => name,
                    self.f_ext => ext,
                    self.f_content => content,
                    self.f_modified => modified,
                    self.f_size => size,
                    self.f_source => "file",
                    self.f_id => path_str,
                ))
                .map_err(|e| e.to_string())?;
            n += 1;
        }
        writer.commit().map_err(|e| e.to_string())?;
        let _ = writer.wait_merging_threads();
        self.after_write();
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
        let mut writer: IndexWriter = self.acquire_writer(15_000_000)?;
        // delete-then-add in one commit: the new doc has a higher opstamp than the
        // delete, so it survives while the previous version (older opstamp) is removed.
        writer.delete_term(Term::from_field_text(self.f_path, &path_str));
        writer
            .add_document(doc!(
                self.f_path => path_str.clone(),
                self.f_name => name,
                self.f_ext => ext,
                self.f_content => content,
                self.f_modified => modified,
                self.f_size => size,
                self.f_source => "file",
                self.f_id => path_str,
            ))
            .map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
        self.after_write();
        Ok(true)
    }

    /// Upsert an arbitrary content document (note, clipboard entry, …) into the
    /// SAME index the files live in — the core of "fold everything indexed
    /// together". Keyed by the stable `id`: any prior doc with that id is deleted
    /// in the same commit so re-indexing never duplicates. `title` is prefix-
    /// searchable (like a filename), `body` is full-text. `source` is the class
    /// ("note" / "clipboard" / …) echoed back on every hit so the UI can route it.
    pub fn upsert_doc(
        &self,
        id: &str,
        source: &str,
        title: &str,
        body: &str,
        modified: u64,
    ) -> Result<(), String> {
        if id.is_empty() {
            return Err("doc id must not be empty".into());
        }
        let mut writer: IndexWriter = self.acquire_writer(15_000_000)?;
        writer.delete_term(Term::from_field_text(self.f_id, id));
        writer
            .add_document(doc!(
                self.f_path => id,
                self.f_name => title,
                self.f_ext => "",
                self.f_content => body,
                self.f_modified => modified,
                self.f_size => body.len() as u64,
                self.f_source => source,
                self.f_id => id,
            ))
            .map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
        self.after_write();
        Ok(())
    }

    /// Remove any document (of any source) by its stable id. No-op if absent.
    pub fn remove_doc(&self, id: &str) -> Result<(), String> {
        let mut writer: IndexWriter = self.acquire_writer(15_000_000)?;
        writer.delete_term(Term::from_field_text(self.f_id, id));
        writer.commit().map_err(|e| e.to_string())?;
        self.after_write();
        Ok(())
    }

    /// Remove a single file from the index by exact path. A no-op (still `Ok`) if
    /// the path was never indexed -- safe to call on any delete event.
    pub fn remove_path(&self, path: &Path) -> Result<(), String> {
        let mut writer: IndexWriter = self.acquire_writer(15_000_000)?;
        writer.delete_term(Term::from_field_text(self.f_path, &path.to_string_lossy()));
        writer.commit().map_err(|e| e.to_string())?;
        self.after_write();
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
        let searcher = self.reader.searcher();
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
                let source = {
                    let v = s(self.f_source);
                    if v.is_empty() { "file".to_string() } else { v }
                };
                let path = s(self.f_path);
                let id = {
                    let v = s(self.f_id);
                    if v.is_empty() { path.clone() } else { v }
                };
                hits.push(FileHit {
                    path,
                    name: s(self.f_name),
                    extension: ext.clone(),
                    kind: ext,
                    modified: u(self.f_modified),
                    size: u(self.f_size),
                    score,
                    source,
                    id,
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
    fn secret_files_are_findable_by_name_but_their_contents_are_not_indexed() {
        let index_dir = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let env = data.path().join(".env.local");
        let creds = data.path().join("credentials.json");
        let key_in_txt = data.path().join("notes.txt");
        let token_md = data.path().join("readme.md");
        let normal = data.path().join("plan.md");
        std::fs::write(&env, b"OPENAI=quokkasecret").unwrap();
        std::fs::write(&creds, b"{\"password\":\"quokkasecret\"}").unwrap();
        std::fs::write(&key_in_txt, b"-----BEGIN RSA PRIVATE KEY-----
quokkasecret
-----END RSA PRIVATE KEY-----").unwrap();
        std::fs::write(&token_md, b"token ghp_abcdefghijklmnopqrstuvwxyz0123 quokkasecret").unwrap();
        std::fs::write(&normal, b"quokka roadmap").unwrap();
        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();
        assert_eq!(idx.index_path(data.path(), 100).unwrap(), 5);
        assert!(idx.search("quokkasecret", 10).is_empty(), "secret content leaked into the index");
        assert!(idx.search("quokka", 10).iter().any(|h| h.name == "plan.md"));
        assert!(idx.search("credentials", 10).iter().any(|h| h.name == "credentials.json"));
        assert!(is_sensitive_file(Path::new("C:/x/id_ed25519")));
        assert!(is_sensitive_file(Path::new("C:/x/server.pem")));
        assert!(!is_sensitive_file(Path::new("C:/x/token_budget_notes.txt")));
        assert!(!is_sensitive_file(Path::new("C:/x/report.md")));
        assert!(!looks_like_secret("the AKIA prefix alone"));
    }

    #[test]
    fn apply_file_changes_batches_upserts_and_removals_in_one_commit() {
        let index_dir = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let a = data.path().join("alpha_plan.txt");
        let b = data.path().join("beta_notes.txt");
        std::fs::write(&a, b"quarterly zebra roadmap").unwrap();
        std::fs::write(&b, b"meeting notes").unwrap();
        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();

        assert_eq!(idx.apply_file_changes(&[a.clone(), b.clone()], &[]).unwrap(), 2);
        // The shared reader sees the commit immediately (reloaded after write).
        assert_eq!(idx.count(), 2);
        assert!(idx.search("zebra", 10).iter().any(|h| h.name == "alpha_plan.txt"));

        // Re-upserting a changed file doesn't duplicate it; removal drops it.
        std::fs::write(&a, b"quarterly giraffe roadmap").unwrap();
        assert_eq!(idx.apply_file_changes(&[a.clone()], &[b.clone()]).unwrap(), 1);
        assert_eq!(idx.count(), 1);
        assert!(idx.search("giraffe", 10).iter().any(|h| h.name == "alpha_plan.txt"));
        assert!(idx.search("zebra", 10).is_empty());

        // A path that vanished before the batch ran is treated as a removal.
        std::fs::remove_file(&a).unwrap();
        assert_eq!(idx.apply_file_changes(&[a], &[]).unwrap(), 0);
        assert_eq!(idx.count(), 0);
    }

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

    #[test]
    fn files_notes_and_clipboard_share_one_index() {
        let index_dir = tempfile::tempdir().unwrap();
        let data_dir = tempfile::tempdir().unwrap();
        std::fs::write(data_dir.path().join("report.txt"), b"quarterly figures").unwrap();

        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();
        idx.index_path(data_dir.path(), 100).unwrap();
        idx.upsert_doc("note:1", "note", "Meeting notes", "discuss the roadmap and hiring", 100)
            .unwrap();
        idx.upsert_doc("clip:9", "clipboard", "", "https://example.com/roadmap", 200).unwrap();
        assert_eq!(idx.count(), 3, "one index holds the file, the note and the clip");

        // A file hit carries source "file"; content search still works.
        let files = idx.search("quarterly", 10);
        assert!(files.iter().any(|h| h.name == "report.txt" && h.source == "file"));

        // The note is found by its title (prefix) AND its body, tagged "note".
        let by_title = idx.search("meet", 10);
        assert!(by_title.iter().any(|h| h.id == "note:1" && h.source == "note"));
        let by_body = idx.search("hiring", 10);
        assert!(by_body.iter().any(|h| h.id == "note:1"));

        // The clipboard entry is found by its body and tagged "clipboard".
        let clip = idx.search("roadmap", 10);
        assert!(clip.iter().any(|h| h.id == "clip:9" && h.source == "clipboard"));
        assert!(clip.iter().any(|h| h.id == "note:1"), "note also mentions roadmap");
    }

    #[test]
    fn upsert_doc_replaces_and_remove_doc_deletes() {
        let index_dir = tempfile::tempdir().unwrap();
        let idx = SearchIndex::open_or_create(index_dir.path()).unwrap();

        idx.upsert_doc("note:7", "note", "Draft", "alpha body text", 1).unwrap();
        assert!(idx.search("alpha", 10).iter().any(|h| h.id == "note:7"));

        // Re-upserting the same id replaces content, never duplicates.
        idx.upsert_doc("note:7", "note", "Draft", "beta body text", 2).unwrap();
        assert_eq!(idx.count(), 1, "upsert_doc must replace, not duplicate");
        assert!(idx.search("beta", 10).iter().any(|h| h.id == "note:7"));
        assert!(idx.search("alpha", 10).is_empty(), "stale note body is gone");

        // remove_doc deletes it; removing an absent id is a no-op.
        idx.remove_doc("note:7").unwrap();
        assert_eq!(idx.count(), 0);
        idx.remove_doc("note:absent").unwrap();
        assert_eq!(idx.count(), 0);

        // An empty id is rejected rather than indexing a keyless doc.
        assert!(idx.upsert_doc("", "note", "x", "y", 0).is_err());
    }
}

#[cfg(test)]
mod io_pool_tests {
    #[test]
    fn a_busy_index_pool_leaves_the_global_pool_free() {
        use rayon::prelude::*;
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let rx = std::sync::Mutex::new(rx);
        // Occupy every index worker until released.
        let workers = super::io_pool().current_num_threads();
        let pool = super::io_pool();
        let busy = std::thread::spawn(move || pool.install(|| (0..workers).into_par_iter().for_each(|_| {
            let _ = rx.lock().unwrap().recv_timeout(std::time::Duration::from_secs(5));
        })));
        std::thread::sleep(std::time::Duration::from_millis(50));
        let t = std::time::Instant::now();
        let sum: u64 = (0..10_000u64).into_par_iter().sum();
        assert_eq!(sum, 49_995_000);
        assert!(t.elapsed() < std::time::Duration::from_secs(2), "global pool waited {:?}", t.elapsed());
        for _ in 0..workers { let _ = tx.send(()); }
        busy.join().unwrap();
    }
}
