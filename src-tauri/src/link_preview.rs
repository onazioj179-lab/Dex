// =============================================================================
// DEX 6.0 — Link Preview (Tauri port of src/main/core/LinkPreviewManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed URL metadata cache (link-preview:* channels), reading/writing
//! the shared `dex.db` `link_previews` table with the identical schema, queries,
//! and return shapes as the Electron manager (Feature 19). The enabled flag is
//! persisted in the shared `settings` table under `link_preview_enabled`,
//! matching loadSettings/setEnabled.
//!
//! The OpenGraph/metadata HTTP fetch (Electron `net.request` + HTML scraping)
//! is a network capability that does NOT belong in this pure DB layer, so it
//! degrades honestly: `link-preview:fetch` serves a cached row when the
//! `link_previews` table already has one (the same first-thing the TS does),
//! and on a cache MISS it returns `null` — the exact shape the TS returns when
//! the manager is disabled or the fetch throws. `getCached` is ported faithfully.

use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the link_previews table + index (matches LinkPreviewManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS link_previews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url_hash TEXT NOT NULL UNIQUE,
            url TEXT NOT NULL,
            title TEXT DEFAULT '',
            description TEXT DEFAULT '',
            fetched_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_link_previews_hash ON link_previews(url_hash);",
    );
    // The enabled flag is read from the shared `settings` table (owned by
    // DatabaseManager). Guarantee it exists so the get/set never throw, matching
    // the foreign-table degrade rule (we do NOT own this table).
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    );
}

/// One row -> the LinkPreview shape (column order matches `SELECT *` on the
/// table definition above, exactly as Electron's better-sqlite3 returned it).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "url_hash": row.get::<_, String>(1)?,
        "url": row.get::<_, String>(2)?,
        "title": row.get::<_, String>(3)?,
        "description": row.get::<_, String>(4)?,
        "fetched_at": row.get::<_, i64>(5)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, url_hash, url, title, description, fetched_at FROM link_previews WHERE url_hash = ?";

/// sha256(url) hex, first 32 chars — matches `hashUrl` in the TS.
fn hash_url(url: &str) -> String {
    // Minimal SHA-256 (FIPS 180-4); no new crate. Produces the same digest as
    // Node's crypto.createHash('sha256'), then `.substring(0, 32)`.
    let hex = sha256_hex(url.as_bytes());
    hex[..32].to_string()
}

/// Read the enabled flag from the shared settings table (matches loadSettings:
/// `val !== 'false'`, defaulting to 'true').
fn is_enabled(conn: &Connection) -> bool {
    let val = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?",
            params!["link_preview_enabled"],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "true".to_string());
    val != "false"
}

/// getCached(url) — returns the cached LinkPreview row, or null when absent.
fn get_cached(conn: &Connection, url: &str) -> Value {
    let url_hash = hash_url(url);
    conn.query_row(SELECT_COLS, params![url_hash], row_to_json)
        .unwrap_or(Value::Null)
}

/// fetchPreview(url) — cache READ ported faithfully; network fetch degrades.
/// Mirrors the TS order: disabled -> null; cached row present -> return it;
/// cache MISS -> the manager would perform a network fetch, which this DB layer
/// does not do, so it returns null (the same shape the TS yields when the fetch
/// throws / the manager is disabled).
fn fetch_preview(conn: &Connection, url: &str) -> Value {
    if !is_enabled(conn) {
        return Value::Null;
    }
    let url_hash = hash_url(url);
    let cached = conn
        .query_row(SELECT_COLS, params![url_hash], row_to_json)
        .ok();
    if let Some(row) = cached {
        return row;
    }
    // Cache miss: HTTP fetch + OpenGraph scraping is not ported (no network in
    // the DB layer). Degrade to null, the TS failure-path return value.
    Value::Null
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "link-preview:fetch" => {
            let url = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            fetch_preview(conn, url)
        }
        "link-preview:getCached" => {
            let url = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_cached(conn, url)
        }
        // setEnabled(enabled) is a void TS handler — persist the flag and return
        // the standard success shape.
        "link-preview:setEnabled" => {
            let enabled = args.get(0).and_then(|v| v.as_bool()).unwrap_or(true);
            let value = if enabled { "true" } else { "false" };
            let _ = conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
                params!["link_preview_enabled", value, value],
            );
            json!({ "success": true })
        }
        "link-preview:isEnabled" => json!(is_enabled(conn)),
        _ => Value::Null,
    }
}

// -----------------------------------------------------------------------------
// SHA-256 (pure, no new crate) — used only by hash_url to match Node's
// crypto.createHash('sha256'). FIPS 180-4 reference implementation.
// -----------------------------------------------------------------------------
fn sha256_hex(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];

    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];

    // Pre-processing (padding).
    let mut msg = data.to_vec();
    let bit_len = (data.len() as u64) * 8;
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut out = String::with_capacity(64);
    for word in h.iter() {
        out.push_str(&format!("{:08x}", word));
    }
    out
}
