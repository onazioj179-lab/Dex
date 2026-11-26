// =============================================================================
// DEX 6.0 — Native shared database (Tauri port of src/main/core/DatabaseManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! The single SQLite database (`dex.db`) that ~50 Electron subsystems share via
//! `DatabaseManager`. This opens it with the same pragmas and location layout
//! (app data dir / `databases` / `dex.db`); each ported subsystem ensures its
//! own tables (CREATE TABLE IF NOT EXISTS), exactly as the TS managers do, so
//! the schema stays identical. Held as Tauri-managed `Mutex<Option<Connection>>`
//! — `None` when SQLite can't open, so subsystems degrade gracefully (the same
//! "running without persistence" path Electron takes) instead of crashing.

use rusqlite::Connection;
use std::path::Path;

/// Open `dex.db` at the given path, applying the same pragmas DatabaseManager
/// uses (WAL, foreign keys, NORMAL sync, 64 MB cache), plus bounded lock waits
/// and automatic WAL maintenance for stable long sessions.
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         PRAGMA synchronous=NORMAL;
         PRAGMA cache_size=-64000;
         PRAGMA busy_timeout=5000;
         PRAGMA wal_autocheckpoint=1000;
         PRAGMA optimize;",
    )?;
    Ok(conn)
}

/// Managed-state alias: the shared connection, or `None` when SQLite is absent.
pub type DbState = std::sync::Mutex<Option<Connection>>;

/// Restore gate: a process-wide RwLock guarding the dex.db FILE against
/// concurrent access during a `backup:restore` file swap. Normal work that opens
/// a SEPARATE connection to dex.db (the backup `VACUUM INTO` snapshot) takes the
/// read side; `backup:restore` takes the write side before swapping the file, so
/// it waits until no other connection holds dex.db open (critical on Windows,
/// where renaming over an open file fails). Operations on the managed `DbState`
/// connection are already serialized against restore by the `DbState` mutex
/// itself, so they don't need this gate — only out-of-band connections do.
pub type DbGate = std::sync::RwLock<()>;
