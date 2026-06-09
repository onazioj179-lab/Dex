// =============================================================================
// DEX 6.0 — Project Export Bundle (Tauri port of src/main/core/ProjectExportBundleManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Project export bundle packaging (export-bundle:* channels, Feature 21). The
//! Electron manager owns NO table of its own — it only READS foreign tables
//! (`version_history`, `project_links`, `voice_memos`) to assemble a project
//! bundle, then writes a gzip archive to a user-chosen path via a native save
//! dialog (`dialog.showSaveDialog`) plus `fs` reads/writes and `zlib`.
//!
//! That single handler (`export-bundle:create`) is fundamentally fs/dialog-bound:
//! its return value is a filesystem path produced by an OS save dialog and a
//! file write — capabilities that live in the Tauri command/UI layer, not in
//! these pure DB functions. There is no DB record-keeping to persist, so the
//! handler degrades honestly (returns null, matching the TS, which also returns
//! `null` when canceled/failed) rather than fabricating a path or faking a file.
//! `ensure_schema` is a no-op because this subsystem creates no tables.

use rusqlite::Connection;
use serde_json::Value;

/// No-op: this subsystem owns no tables. The foreign tables it reads
/// (`version_history`, `project_links`, `voice_memos`) are created and owned by
/// their respective modules; the TS wraps those reads in try/catch and degrades
/// when absent, so we never (re-)create them here.
pub fn ensure_schema(_conn: &Connection) {}

pub fn dispatch(_conn: &Connection, channel: &str, _args: &Value) -> Value {
    match channel {
        // export-bundle:create — createBundle(appName, projectId, projectName,
        // projectData). Under Electron this opens a native save dialog, reads
        // voice-memo files from disk, gzip-compresses the assembled bundle, and
        // writes it to the user-chosen path, returning that path (or null on
        // cancel/failure). The save dialog + fs write + zlib compression are
        // OS/UI capabilities that belong to the Tauri command layer, not these
        // pure DB functions, and there is no DB record to persist. Degrade
        // honestly to null — the same value the TS returns when the export does
        // not complete. The Tauri command layer should wire the real save dialog
        // and bundle writer, reading the foreign tables for bundle contents.
        "export-bundle:create" => Value::Null,
        _ => Value::Null,
    }
}
