// =============================================================================
// DEX 6.0 — Keyboard Navigation (Tauri port of src/main/core/KeyboardNavigationManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Keyboard-only navigation mode (keyboard-nav:* channels). The Electron manager
//! has no table of its own — it persists a single boolean ("active") in the
//! shared `dex.db` `settings` table under the key `keyboard_nav_enabled`
//! ('true'/'false', default 'false'), via DatabaseManager.getSetting/setSetting.
//! Since dispatch() is a pure, stateless function we read/write that same setting
//! directly, which yields results identical to the Electron in-memory `isActive`
//! cache (Feature 10).
//!
//! Three IPC channels are renderer-facing and DB-backed, ported faithfully:
//!   - keyboard-nav:toggle    -> flip + persist, return the new boolean state
//!   - keyboard-nav:getState  -> return the current boolean state
//!   - keyboard-nav:setState  -> persist the given boolean (void in TS -> success)
//!
//! Everything else in the Electron manager is OS/UI wiring with no IPC channel:
//! the `Ctrl/Cmd+Shift+K` globalShortcut registration, and the
//! `keyboard-nav:stateChanged` webContents push that fires on toggle/setState.
//! Those are renderer/OS side effects, not part of any IPC return value, so they
//! degrade honestly here (see the comments below) while the persistence surface
//! is ported exactly.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

/// Ensure the shared `settings` table (owned by DatabaseManager) exists — the
/// keyboard-nav state lives there as a single key, so this manager has no table
/// of its own. CREATE TABLE IF NOT EXISTS keeps the schema identical and is safe
/// to run alongside the other subsystems that share the same table.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    );
}

/// DatabaseManager.getSetting(key, defaultValue): SELECT value, else the default.
fn get_setting(conn: &Connection, key: &str, default_value: &str) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| default_value.to_string())
}

/// DatabaseManager.setSetting(key, value): upsert into the shared settings table.
fn set_setting(conn: &Connection, key: &str, value: &str) {
    let _ = conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
        params![key, value, value],
    );
}

/// loadState()/getActive(): isActive = getSetting('keyboard_nav_enabled','false') === 'true'.
fn get_active(conn: &Connection) -> bool {
    get_setting(conn, "keyboard_nav_enabled", "false") == "true"
}

/// setActive(active): persist 'true'/'false' (matches the TS write). The Electron
/// manager also pushes `keyboard-nav:stateChanged` to the renderer here — that is
/// an internal webContents side effect, not part of the IPC return value, so it is
/// intentionally not replicated (no renderer handle from this pure DB layer).
fn set_active(conn: &Connection, active: bool) {
    set_setting(
        conn,
        "keyboard_nav_enabled",
        if active { "true" } else { "false" },
    );
}

/// toggle(): flip the persisted state and return the new boolean (matches TS).
fn toggle(conn: &Connection) -> bool {
    let next = !get_active(conn);
    set_active(conn, next);
    next
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // toggle() returns the new boolean state.
        "keyboard-nav:toggle" => json!(toggle(conn)),
        // getState() returns the current boolean state.
        "keyboard-nav:getState" => json!(get_active(conn)),
        // setState(active) is void in Electron; persist and report success so the
        // bridge telemetry doesn't count it as unported.
        "keyboard-nav:setState" => {
            let active = args.get(0).and_then(|v| v.as_bool()).unwrap_or(false);
            set_active(conn, active);
            json!({ "success": true })
        }
        // The Ctrl/Cmd+Shift+K global shortcut registration and the
        // `keyboard-nav:stateChanged` renderer push are OS/UI concerns with no IPC
        // channel of their own — they live in the Tauri command/global-shortcut
        // layer, not in these pure DB functions, and degrade honestly here.
        _ => Value::Null,
    }
}
