// =============================================================================
// DEX 6.0 — Multi Window Manager (Tauri port of src/main/core/MultiWindowManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Detach-any-inner-app-into-a-standalone-window subsystem (multiwindow:*
//! channels). The Electron manager is almost entirely `BrowserWindow`-driven:
//! it creates/focuses/closes detached `BrowserWindow`s, tracks them in an
//! in-memory `Map`, and relays IPC between detached and main windows. Its only
//! SQLite touch is an internal `detached_windows` bounds cache used by the
//! private `getSavedBounds`/`saveBounds` helpers — that table is *never* exposed
//! as a renderer-facing IPC handler, so there is no pure-DB CRUD channel to port.
//!
//! Consequently every `multiwindow:*` handler depends on a live `BrowserWindow`
//! (or the live detached-window map) that this pure DB layer cannot provide, and
//! each one degrades honestly rather than fabricating window state. We still
//! create the `detached_windows` table verbatim in `ensure_schema` so the shared
//! `dex.db` schema stays identical to Electron's, even though no handler reads or
//! writes it from here.
//!
//! Note: the Electron `state-sync:update` listener is an `ipcMain.on`
//! fire-and-forget window-to-window relay (a different, non-`multiwindow:`
//! prefix), not an `ipcMain.handle` request/response channel, and has no DB
//! component — it is intentionally not part of this dispatcher surface.

use rusqlite::Connection;
use serde_json::{json, Value};

/// Create the detached_windows table (CREATE TABLE copied verbatim from
/// DatabaseManager.initTables). No handler reads/writes it from this layer, but
/// the shared schema must match Electron's so the table is ensured regardless.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS detached_windows (
            app_id TEXT PRIMARY KEY,
            x INTEGER DEFAULT -1,
            y INTEGER DEFAULT -1,
            width INTEGER DEFAULT 800,
            height INTEGER DEFAULT 600,
            maximized INTEGER DEFAULT 0
        );",
    );
}

pub fn dispatch(_conn: &Connection, channel: &str, _args: &Value) -> Value {
    match channel {
        // detachApp(appId) -> boolean. Creates a standalone BrowserWindow,
        // restores saved bounds, wires IPC relays and close/closed handlers.
        // Spawning and driving a live window is not reachable from this pure DB
        // layer, so degrade honestly rather than pretend the window opened.
        "multiwindow:detach" => json!({
            "success": false,
            "error": "detachApp spawns and drives a live BrowserWindow (not ported)"
        }),

        // reattachApp(appId) -> boolean. Reads live window bounds, persists them,
        // then closes the detached BrowserWindow. No live window exists here.
        "multiwindow:reattach" => json!({
            "success": false,
            "error": "reattachApp closes a live detached BrowserWindow (not ported)"
        }),

        // isDetached(appId) -> boolean. Answered from the in-memory detached-window
        // Map, which this DB layer does not maintain. Degrade honestly instead of
        // guessing window presence.
        "multiwindow:isDetached" => json!({
            "success": false,
            "error": "isDetached reads the live detached-window map (not ported)"
        }),

        // getDetachedApps() -> string[]. Derived from the live detached-window Map.
        // Unavailable here; degrade honestly rather than return a fabricated list.
        "multiwindow:getDetachedApps" => json!({
            "success": false,
            "error": "getDetachedApps reads the live detached-window map (not ported)"
        }),

        // broadcastState(appId, channel, data) -> boolean. Pushes state to a
        // detached window's webContents and to the main window. Both are live
        // BrowserWindow/IPC concerns unavailable from this DB layer.
        "multiwindow:broadcastState" => json!({
            "success": false,
            "error": "broadcastState relays IPC to live BrowserWindows (not ported)"
        }),

        _ => Value::Null,
    }
}
