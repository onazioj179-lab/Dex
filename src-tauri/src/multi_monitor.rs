// =============================================================================
// DEX 6.0 — Multi-Monitor (Tauri port of src/main/core/MultiMonitorManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed slice of the multi-monitor subsystem (multimonitor:* channels),
//! reading/writing the shared `dex-core.db`-equivalent tables with the identical
//! schema as the Electron manager. The Electron manager is built almost entirely
//! on Electron's live `screen` API (display enumeration, geometry, scale factor)
//! and live `BrowserWindow` control (fullscreen, bounds); none of that is
//! reachable from this pure DB layer, so those handlers DEGRADE HONESTLY rather
//! than fabricate monitor geometry.
//!
//! The two persisted tables (`displays`, `window_placements`) are created
//! verbatim from `SCHEMA_SQL` so the on-disk schema stays identical. Only ONE
//! handler reads persisted data without touching the live `screen`/`BrowserWindow`
//! APIs — `multimonitor:get-window-placement` — and it is ported faithfully.
//! The `displays` table is populated exclusively from the live `screen`
//! enumeration in Electron, so we never synthesize rows for it here.

use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the `displays` + `window_placements` tables and indexes (copied
/// VERBATIM from `SCHEMA_SQL` in MultiMonitorManager.ts). The `displays` table
/// is created for schema parity but is only ever populated from the live
/// `screen` enumeration, which this DB layer does not perform.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS displays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  electron_id INTEGER UNIQUE,
  label TEXT DEFAULT '',
  bounds_x INTEGER DEFAULT 0,
  bounds_y INTEGER DEFAULT 0,
  bounds_width INTEGER DEFAULT 0,
  bounds_height INTEGER DEFAULT 0,
  work_area_x INTEGER DEFAULT 0,
  work_area_y INTEGER DEFAULT 0,
  work_area_width INTEGER DEFAULT 0,
  work_area_height INTEGER DEFAULT 0,
  scale_factor REAL DEFAULT 1.0,
  rotation INTEGER DEFAULT 0,
  refresh_rate REAL DEFAULT 60.0,
  is_primary INTEGER DEFAULT 0,
  detected_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS window_placements (
  id TEXT PRIMARY KEY,
  window_id TEXT UNIQUE,
  display_electron_id INTEGER DEFAULT 0,
  x INTEGER DEFAULT 0,
  y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 1280,
  height INTEGER DEFAULT 800,
  is_maximized INTEGER DEFAULT 0,
  is_fullscreen INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_displays_electron_id ON displays(electron_id);
CREATE INDEX IF NOT EXISTS idx_window_placements_window_id ON window_placements(window_id);",
    );
}

/// One `window_placements` row -> the `SELECT * FROM window_placements` shape
/// returned by `multimonitor:get-window-placement` (column order/casing matches
/// the verbatim table definition above).
fn placement_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "window_id": row.get::<_, Option<String>>(1)?,
        "display_electron_id": row.get::<_, i64>(2)?,
        "x": row.get::<_, i64>(3)?,
        "y": row.get::<_, i64>(4)?,
        "width": row.get::<_, i64>(5)?,
        "height": row.get::<_, i64>(6)?,
        "is_maximized": row.get::<_, i64>(7)?,
        "is_fullscreen": row.get::<_, i64>(8)?,
        "updated_at": row.get::<_, i64>(9)?,
    }))
}

/// get-window-placement(windowId) -> the stored placement row, or null when no
/// row exists (matches `... .get(windowId) || null`). Pure DB.
fn get_window_placement(conn: &Connection, window_id: &str) -> Value {
    conn.query_row(
        "SELECT id, window_id, display_electron_id, x, y, width, height, is_maximized, is_fullscreen, updated_at \
         FROM window_placements WHERE window_id = ?",
        params![window_id],
        placement_row_to_json,
    )
    .unwrap_or(Value::Null)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let str_arg = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();

    match channel {
        // get-window-placement(windowId) -> placement row | null. The only handler
        // backed purely by the persisted DB; ported faithfully.
        "multimonitor:get-window-placement" => get_window_placement(conn, &str_arg(0)),

        // The following handlers all read Electron's live `screen` API (display
        // enumeration, geometry, scale factor) or drive a live `BrowserWindow`.
        // None of that is reachable from this pure DB layer, so we degrade
        // honestly rather than fabricate monitor geometry / window state.

        // get-displays() enumerates the live `screen` displays.
        "multimonitor:get-displays" => json!({
            "success": false,
            "error": "get-displays requires the live screen display enumeration (not ported)"
        }),

        // get-current-display() reads live `screen` geometry for the current display.
        "multimonitor:get-current-display" => json!({
            "success": false,
            "error": "get-current-display requires live screen display geometry (not ported)"
        }),

        // get-scale-factor() reads the live `screen`/`BrowserWindow` scale factor.
        "multimonitor:get-scale-factor" => json!({
            "success": false,
            "error": "get-scale-factor requires the live screen scale factor (not ported)"
        }),

        // enter-fullscreen() drives the live main BrowserWindow.
        "multimonitor:enter-fullscreen" => json!({
            "success": false,
            "error": "enter-fullscreen requires the live BrowserWindow (not ported)"
        }),

        // exit-fullscreen() drives the live main BrowserWindow.
        "multimonitor:exit-fullscreen" => json!({
            "success": false,
            "error": "exit-fullscreen requires the live BrowserWindow (not ported)"
        }),

        // get-shared-scale-buffer() returns an Electron SharedArrayBuffer, which
        // has no equivalent in this DB layer.
        "multimonitor:get-shared-scale-buffer" => json!({
            "success": false,
            "error": "get-shared-scale-buffer requires the Electron SharedArrayBuffer (not ported)"
        }),

        _ => Value::Null,
    }
}
