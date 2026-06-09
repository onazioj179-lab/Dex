// =============================================================================
// DEX 6.0 — Live Collaboration (Tauri port of src/main/core/LiveCollaborationManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Live collaboration indicator (live-collab:* channels), Feature 15. The
//! Electron manager shows when another DEX instance has the same project open
//! via mDNS peer discovery. The ONLY persisted state is the `live_collab_enabled`
//! flag, stored in the shared `dex.db` `settings` table; that get/set pair is
//! ported faithfully (matching loadSettings / setEnabled).
//!
//! Everything else — the in-memory peer Map, mDNS presence broadcast, peer
//! registration/cleanup, and the `live-collab:peersChanged` renderer push — is
//! live real-time networking with no DB backing. Those handlers degrade honestly
//! rather than fabricate peers/presence:
//!   - `setProject` / `clearProject`: broadcast presence over the network (no-op
//!     persistence in Electron) — degrade honestly, not faked as success.
//!   - `getPeers`: reads the live in-memory peer Map populated by mDNS discovery,
//!     which does not exist here — returns `[]` (the same value Electron returns
//!     when disabled or when no peers are present; honest, never fabricated).
//!
//! Only rusqlite + serde_json are used; no new crates and no network code.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

/// Ensure the shared `settings` table exists (owned by DatabaseManager). This
/// manager creates no tables of its own — it only reads/writes the
/// `live_collab_enabled` flag — so we just guarantee `settings` is present
/// before any get/set so the reads never throw (matching the foreign-table
/// degrade rule). All peer/session state in the TS lives in memory, not the DB,
/// so there is nothing else to create.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    );
}

/// Read a value from the shared settings table (matches getSetting(key, default)).
fn get_setting(conn: &Connection, key: &str, default: &str) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| default.to_string())
}

/// Write a value into the shared settings table (matches setSetting(key, value)).
fn set_setting(conn: &Connection, key: &str, value: &str) {
    let _ = conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
        params![key, value, value],
    );
}

/// The enabled flag, read from the shared settings table with the same default
/// and semantics as loadSettings(): default 'true', and enabled === (val !== 'false').
fn is_enabled(conn: &Connection) -> bool {
    get_setting(conn, "live_collab_enabled", "true") != "false"
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // setCurrentProject(app, projectId): void. In Electron this records the
        // current project and broadcasts presence over mDNS (the broadcast itself
        // is handled by the live service-discovery system). There is no DB state
        // here and no network layer, so this degrades honestly rather than
        // pretending a presence broadcast succeeded.
        "live-collab:setProject" => json!({
            "success": false,
            "error": "setProject broadcasts mDNS presence over the network (not ported)"
        }),

        // clearCurrentProject(): void. Same as above — clears the in-memory
        // project and re-broadcasts presence. No DB state; degrade honestly.
        "live-collab:clearProject" => json!({
            "success": false,
            "error": "clearProject broadcasts mDNS presence over the network (not ported)"
        }),

        // getPeersForProject(app, projectId) -> CollaborationPeer[]. The peer set
        // is an in-memory Map populated by live mDNS discovery, which does not
        // exist in this pure DB layer. Return `[]` — exactly what Electron returns
        // when collaboration is disabled or no peers are present — rather than
        // fabricating peers/presence.
        "live-collab:getPeers" => json!([]),

        // setEnabled(enabled): void. This IS persisted: it writes
        // live_collab_enabled to the shared settings table. Ported faithfully.
        // The live side-effects (clearing the in-memory peer Map and the
        // `peersChanged` renderer push when disabling) belong to the network/UI
        // layer and are not reproduced here. Void handler -> { success: true }.
        "live-collab:setEnabled" => {
            let enabled = args.get(0).and_then(|v| v.as_bool()).unwrap_or(false);
            set_setting(conn, "live_collab_enabled", if enabled { "true" } else { "false" });
            json!({ "success": true })
        }

        // isEnabled() -> boolean. Read straight from the persisted flag.
        "live-collab:isEnabled" => json!(is_enabled(conn)),

        _ => Value::Null,
    }
}
