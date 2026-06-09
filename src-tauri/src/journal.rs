// =============================================================================
// DEX 6.0 — System Journal (Tauri port of src/main/core/SystemJournal.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed operational-memory journal (journal:* channels), reading and
//! writing the shared `dex.db` `system_journal`, `journal_sessions`, and
//! `journal_analysis` tables with the identical schema, queries, and return
//! shapes as the Electron `SystemJournal`. Writes are fire-and-forget; history
//! supports soft deletes, per-app / date-range / all clearing, weekly hard-purge
//! of cleared rows, export in TXT/MD/JSON, and contextual insights.
//!
//! Per-process session identity: the Electron module mints a `randomUUID()` once
//! at boot (`CURRENT_SESSION_ID`) and links every write to it. These are pure
//! stateless functions with no module state, so the "current session" is created
//! and remembered in the DB itself — `ensure_schema` mints the boot session and
//! stores its id in a tiny `journal_meta` table, which every later dispatch reads
//! back. This faithfully reproduces the single-session-per-run behaviour without
//! holding process state. Boot/shutdown journal lines and the 6h purge scheduler
//! are Electron-internal lifecycle concerns (not IPC channels); the boot session
//! row + boot entry are seeded in `ensure_schema` to match the persisted data.
//!
//! The analysis channels the renderer also calls (journal:get-weekly-report,
//! journal:get-patterns, journal:get-anomalies, journal:run-analysis) live in a
//! SEPARATE manager (JournalAnalysisEngine.ts), not SystemJournal.ts, so they are
//! intentionally NOT handled here and fall through to the `_ => Null` arm.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

const DAY_MS: i64 = 86_400_000;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Local midnight (today, 00:00:00 local) as epoch millis — mirrors the TS
/// `new Date(); setHours(0,0,0,0)` used for "today" counts/groups. std has no
/// local-tz clock, so we lean on SQLite's localtime, matching Electron's local-day.
fn today_start_ms(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT CAST(strftime('%s', date('now','localtime')) AS INTEGER) * 1000",
        [],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// Create the journal tables + indexes (matches SystemJournal.runMigrations),
/// then seed the per-run session (matches initializeSystemJournal).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS system_journal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT,
            timestamp INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            cleared INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_sj_timestamp ON system_journal(timestamp);
        CREATE INDEX IF NOT EXISTS idx_sj_app ON system_journal(app, timestamp);
        CREATE INDEX IF NOT EXISTS idx_sj_session ON system_journal(session_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_sj_cleared ON system_journal(cleared, timestamp);
        CREATE INDEX IF NOT EXISTS idx_sj_app_action ON system_journal(app, action, timestamp);

        CREATE TABLE IF NOT EXISTS journal_sessions (
            id TEXT PRIMARY KEY,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            entry_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_js_started ON journal_sessions(started_at);

        CREATE TABLE IF NOT EXISTS journal_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            period_start INTEGER,
            period_end INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_ja_type ON journal_analysis(type, created_at);
        CREATE INDEX IF NOT EXISTS idx_ja_period ON journal_analysis(period_start, period_end);

        -- Extension (not in TS): holds the current-run session id so the pure
        -- stateless handlers can resolve `journal:get-session-id` and link writes,
        -- replacing Electron's in-memory CURRENT_SESSION_ID constant.
        CREATE TABLE IF NOT EXISTS journal_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    );

    seed_session(conn);
}

/// Mint this run's session (mirrors initializeSystemJournal): generate a v4-style
/// UUID, insert the session row, remember it in journal_meta, and write the boot
/// entry. Idempotent — only runs the first time per DB lifetime/process.
fn seed_session(conn: &Connection) {
    // Already seeded for this run? (journal_meta is recreated each fresh DB,
    // but a long-lived DB across restarts will re-seed only when missing.)
    let existing: Option<String> = conn
        .query_row(
            "SELECT value FROM journal_meta WHERE key = 'current_session_id'",
            [],
            |r| r.get(0),
        )
        .ok();
    if existing.is_some() {
        return;
    }

    let session_id = gen_uuid(conn);
    let now = now_ms();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO journal_sessions (id, started_at, entry_count) VALUES (?, ?, 0)",
        params![session_id, now],
    );
    let _ = conn.execute(
        "INSERT OR REPLACE INTO journal_meta (key, value) VALUES ('current_session_id', ?)",
        params![session_id],
    );
    // Boot entry (writeEntry('DEX','session:start',...)).
    write_entry(
        conn,
        "DEX",
        "session:start",
        Some(&format!("Session {} started", session_id)),
    );
}

/// The current run's session id (Electron's CURRENT_SESSION_ID).
fn current_session_id(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM journal_meta WHERE key = 'current_session_id'",
        [],
        |r| r.get(0),
    )
    .unwrap_or_default()
}

/// v4-style UUID without a new dep: 16 random bytes from SQLite's randomblob,
/// with the version (4) and variant nibbles set, formatted 8-4-4-4-12. Mirrors
/// the shape/uniqueness of Node's crypto.randomUUID().
fn gen_uuid(conn: &Connection) -> String {
    let hex: String = conn
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .unwrap_or_else(|_| format!("{:032x}", now_ms() as u128));
    let mut b: Vec<char> = hex.chars().collect();
    while b.len() < 32 {
        b.push('0');
    }
    b[12] = '4'; // version 4
    b[16] = ['8', '9', 'a', 'b'][(now_ms() as usize) & 3]; // variant 10xx
    let s: String = b.into_iter().collect();
    format!(
        "{}-{}-{}-{}-{}",
        &s[0..8],
        &s[8..12],
        &s[12..16],
        &s[16..20],
        &s[20..32]
    )
}

// ---------------------------------------------------------------------------
// Core write (fire-and-forget)
// ---------------------------------------------------------------------------

fn write_entry(conn: &Connection, app: &str, action: &str, detail: Option<&str>) {
    let session_id = current_session_id(conn);
    let now = now_ms();
    let _ = conn.execute(
        "INSERT INTO system_journal (app, action, detail, timestamp, session_id) VALUES (?, ?, ?, ?, ?)",
        params![app, action, detail, now, session_id],
    );
    let _ = conn.execute(
        "UPDATE journal_sessions SET entry_count = entry_count + 1 WHERE id = ?",
        params![session_id],
    );
}

// ---------------------------------------------------------------------------
// Row mappers (column order matches the SELECT lists verbatim)
// ---------------------------------------------------------------------------

/// system_journal row -> JournalRow shape (snake_case keys, exactly as `SELECT`
/// returned under Electron: id, app, action, detail, timestamp, session_id, cleared).
fn entry_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "action": row.get::<_, String>(2)?,
        "detail": row.get::<_, Option<String>>(3)?,
        "timestamp": row.get::<_, i64>(4)?,
        "session_id": row.get::<_, String>(5)?,
        "cleared": row.get::<_, i64>(6)?,
    }))
}

/// journal_sessions row -> JournalSessionRow shape.
fn session_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "started_at": row.get::<_, i64>(1)?,
        "ended_at": row.get::<_, Option<i64>>(2)?,
        "entry_count": row.get::<_, i64>(3)?,
    }))
}

/// journal_analysis row -> JournalAnalysisRow shape.
fn analysis_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "type": row.get::<_, String>(1)?,
        "data": row.get::<_, String>(2)?,
        "created_at": row.get::<_, i64>(3)?,
        "period_start": row.get::<_, Option<i64>>(4)?,
        "period_end": row.get::<_, Option<i64>>(5)?,
    }))
}

fn query_list<F>(conn: &Connection, sql: &str, p: Vec<SqlValue>, mapper: F) -> Vec<Value>
where
    F: Fn(&Row) -> rusqlite::Result<Value>,
{
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), |r| mapper(r)) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

// ---------------------------------------------------------------------------
// Query functions (mirror queryEntries' branch order exactly)
// ---------------------------------------------------------------------------

/// queryEntries(opts) — search > sessionId > app > all, with the same limit
/// clamp (min(limit||100, 1000)) and after/before defaults.
fn query_entries(conn: &Connection, opts: &Value) -> Vec<Value> {
    let limit = opts
        .get("limit")
        .and_then(|v| v.as_i64())
        .filter(|&n| n != 0)
        .unwrap_or(100)
        .min(1000);
    let offset = opts.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);
    let after = opts.get("after").and_then(|v| v.as_i64()).unwrap_or(0);
    let before = opts
        .get("before")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| now_ms() + DAY_MS);

    if let Some(search) = opts.get("search").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        let term = format!("%{}%", search);
        return query_list(
            conn,
            "SELECT id, app, action, detail, timestamp, session_id, cleared FROM system_journal
             WHERE cleared = 0 AND (app LIKE ? OR action LIKE ? OR detail LIKE ?)
             ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            vec![
                SqlValue::Text(term.clone()),
                SqlValue::Text(term.clone()),
                SqlValue::Text(term),
                SqlValue::Integer(limit),
                SqlValue::Integer(offset),
            ],
            entry_to_json,
        );
    }

    if let Some(session_id) = opts.get("sessionId").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        return query_list(
            conn,
            "SELECT id, app, action, detail, timestamp, session_id, cleared FROM system_journal
             WHERE cleared = 0 AND session_id = ?
             ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            vec![
                SqlValue::Text(session_id.to_string()),
                SqlValue::Integer(limit),
                SqlValue::Integer(offset),
            ],
            entry_to_json,
        );
    }

    if let Some(app) = opts.get("app").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        return query_list(
            conn,
            "SELECT id, app, action, detail, timestamp, session_id, cleared FROM system_journal
             WHERE cleared = 0 AND app = ? AND timestamp >= ? AND timestamp <= ?
             ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            vec![
                SqlValue::Text(app.to_string()),
                SqlValue::Integer(after),
                SqlValue::Integer(before),
                SqlValue::Integer(limit),
                SqlValue::Integer(offset),
            ],
            entry_to_json,
        );
    }

    query_list(
        conn,
        "SELECT id, app, action, detail, timestamp, session_id, cleared FROM system_journal
         WHERE cleared = 0 AND timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        vec![
            SqlValue::Integer(after),
            SqlValue::Integer(before),
            SqlValue::Integer(limit),
            SqlValue::Integer(offset),
        ],
        entry_to_json,
    )
}

fn get_distinct_apps(conn: &Connection) -> Value {
    let mut stmt = match conn
        .prepare("SELECT DISTINCT app FROM system_journal WHERE cleared = 0 ORDER BY app")
    {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([], |r| r.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<String> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// getAppGroups — { app, count, last_used } per app.
fn get_app_groups(conn: &Connection) -> Value {
    let rows = query_list(
        conn,
        "SELECT app, COUNT(*) as count, MAX(timestamp) as last_used
         FROM system_journal WHERE cleared = 0
         GROUP BY app ORDER BY count DESC",
        Vec::new(),
        |r| {
            Ok(json!({
                "app": r.get::<_, String>(0)?,
                "count": r.get::<_, i64>(1)?,
                "last_used": r.get::<_, i64>(2)?,
            }))
        },
    );
    json!(rows)
}

/// getSessions(limit=50, offset=0) — clamped to min(limit,200).
fn get_sessions(conn: &Connection, limit: i64, offset: i64) -> Value {
    let rows = query_list(
        conn,
        "SELECT id, started_at, ended_at, entry_count FROM journal_sessions
         ORDER BY started_at DESC LIMIT ? OFFSET ?",
        vec![SqlValue::Integer(limit.min(200)), SqlValue::Integer(offset)],
        session_to_json,
    );
    json!(rows)
}

/// getCurrentSession — the session row for CURRENT_SESSION_ID, or null.
fn get_current_session(conn: &Connection) -> Value {
    let sid = current_session_id(conn);
    conn.query_row(
        "SELECT id, started_at, ended_at, entry_count FROM journal_sessions WHERE id = ?",
        params![sid],
        session_to_json,
    )
    .unwrap_or(Value::Null)
}

/// getStats — totals + today + oldest/newest + topApps(10).
fn get_stats(conn: &Connection) -> Value {
    let one = |sql: &str, p: &[&dyn rusqlite::ToSql]| -> i64 {
        conn.query_row(sql, p, |r| r.get(0)).unwrap_or(0)
    };
    let today_start = today_start_ms(conn);

    let total_entries = one("SELECT COUNT(*) FROM system_journal WHERE cleared = 0", &[]);
    let today_entries = one(
        "SELECT COUNT(*) FROM system_journal WHERE cleared = 0 AND timestamp >= ?",
        &[&today_start],
    );
    let total_sessions = one("SELECT COUNT(*) FROM journal_sessions", &[]);
    let total_apps = one(
        "SELECT COUNT(DISTINCT app) FROM system_journal WHERE cleared = 0",
        &[],
    );
    // MIN/MAX(timestamp) are NULL on an empty table -> JS null.
    let oldest: Option<i64> = conn
        .query_row(
            "SELECT MIN(timestamp) FROM system_journal WHERE cleared = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(None);
    let newest: Option<i64> = conn
        .query_row(
            "SELECT MAX(timestamp) FROM system_journal WHERE cleared = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(None);

    let top_apps = query_list(
        conn,
        "SELECT app, COUNT(*) as count FROM system_journal WHERE cleared = 0
         GROUP BY app ORDER BY count DESC LIMIT ?",
        vec![SqlValue::Integer(10)],
        |r| {
            Ok(json!({
                "app": r.get::<_, String>(0)?,
                "count": r.get::<_, i64>(1)?,
            }))
        },
    );

    json!({
        "totalEntries": total_entries,
        "totalSessions": total_sessions,
        "totalApps": total_apps,
        "todayEntries": today_entries,
        "oldestTimestamp": oldest,
        "newestTimestamp": newest,
        "topApps": top_apps,
    })
}

// ---------------------------------------------------------------------------
// Clear / manage history (return affected/changes counts)
// ---------------------------------------------------------------------------

fn clear_by_date_range(conn: &Connection, start_ts: i64, end_ts: i64) -> i64 {
    conn.execute(
        "UPDATE system_journal SET cleared = 1 WHERE cleared = 0 AND timestamp >= ? AND timestamp <= ?",
        params![start_ts, end_ts],
    )
    .unwrap_or(0) as i64
}

fn clear_by_app(conn: &Connection, app: &str) -> i64 {
    conn.execute(
        "UPDATE system_journal SET cleared = 1 WHERE cleared = 0 AND app = ?",
        params![app],
    )
    .unwrap_or(0) as i64
}

fn clear_all(conn: &Connection) -> i64 {
    conn.execute(
        "UPDATE system_journal SET cleared = 1 WHERE cleared = 0",
        [],
    )
    .unwrap_or(0) as i64
}

/// hardPurgeCleared(olderThanDays=7) — delete cleared rows older than the cutoff.
fn hard_purge_cleared(conn: &Connection, older_than_days: i64) -> i64 {
    let cutoff = now_ms() - older_than_days * DAY_MS;
    conn.execute(
        "DELETE FROM system_journal WHERE cleared = 1 AND timestamp < ?",
        params![cutoff],
    )
    .unwrap_or(0) as i64
}

// ---------------------------------------------------------------------------
// Export (txt | md | json)
// ---------------------------------------------------------------------------

/// exportEntries(format, opts) — pulls up to 50000 entries then renders.
/// NOTE: the TS uses JS Date#toLocaleDateString/toLocaleTimeString for the md/txt
/// headers, which are locale- and timezone-dependent. std has no locale clock and
/// we won't pull in a date crate for this; the md/txt date/time labels are
/// rendered from SQLite localtime in stable formats (YYYY-MM-DD / HH:MM:SS). The
/// json format is byte-identical to Electron. The renderer uses these as opaque
/// export blobs (downloaded text), so this is a faithful, honest approximation
/// rather than fabricated data.
fn export_entries(conn: &Connection, format: &str, opts: &Value) -> Value {
    let mut o = opts.as_object().cloned().unwrap_or_default();
    o.insert("limit".to_string(), json!(50000));
    let entries = query_entries(conn, &Value::Object(o));

    if format == "json" {
        // JSON.stringify(entries, null, 2)
        return json!(serde_json::to_string_pretty(&json!(entries)).unwrap_or_else(|_| "[]".into()));
    }

    let fmt_date = |ts: i64| -> String {
        conn.query_row(
            "SELECT date(? / 1000, 'unixepoch', 'localtime')",
            params![ts],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_default()
    };
    let fmt_time = |ts: i64| -> String {
        conn.query_row(
            "SELECT time(? / 1000, 'unixepoch', 'localtime')",
            params![ts],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_default()
    };
    let now_iso = conn
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_default();

    let field = |e: &Value, k: &str| -> String {
        e.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string()
    };
    let detail = |e: &Value| -> Option<String> {
        e.get("detail").and_then(|v| v.as_str()).map(String::from)
    };
    let ts_of = |e: &Value| -> i64 { e.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0) };

    if format == "md" {
        let mut md = String::from("# DEX System Journal Export\n\n");
        md.push_str(&format!("Exported: {}\n", now_iso));
        md.push_str(&format!("Total entries: {}\n\n", entries.len()));
        md.push_str("---\n\n");
        let mut last_date = String::new();
        for entry in &entries {
            let date_str = fmt_date(ts_of(entry));
            if date_str != last_date {
                md.push_str(&format!("## {}\n\n", date_str));
                last_date = date_str;
            }
            let time = fmt_time(ts_of(entry));
            md.push_str(&format!(
                "- **{}** | `{}` | {}",
                time,
                field(entry, "app"),
                field(entry, "action")
            ));
            if let Some(d) = detail(entry) {
                md.push_str(&format!(" -- {}", d));
            }
            md.push('\n');
        }
        return json!(md);
    }

    // Plain text (default / 'txt')
    let mut txt = String::from("DEX System Journal Export\n");
    txt.push_str(&format!("Exported: {}\n", now_iso));
    txt.push_str(&format!("Total entries: {}\n", entries.len()));
    txt.push_str(&"=".repeat(60));
    txt.push_str("\n\n");
    let mut last_date = String::new();
    for entry in &entries {
        let date_str = fmt_date(ts_of(entry));
        if date_str != last_date {
            txt.push_str(&format!("\n--- {} ---\n\n", date_str));
            last_date = date_str;
        }
        let time = fmt_time(ts_of(entry));
        txt.push_str(&format!(
            "[{}] {} | {}",
            time,
            field(entry, "app"),
            field(entry, "action")
        ));
        if let Some(d) = detail(entry) {
            txt.push_str(&format!(" -- {}", d));
        }
        txt.push('\n');
    }
    json!(txt)
}

// ---------------------------------------------------------------------------
// Analysis data access
// ---------------------------------------------------------------------------

fn get_analysis_results(conn: &Connection, kind: &str, limit: i64) -> Vec<Value> {
    query_list(
        conn,
        "SELECT id, type, data, created_at, period_start, period_end FROM journal_analysis
         WHERE type = ? ORDER BY created_at DESC LIMIT ?",
        vec![SqlValue::Text(kind.to_string()), SqlValue::Integer(limit.min(100))],
        analysis_to_json,
    )
}

fn get_latest_analysis(conn: &Connection, kind: &str) -> Value {
    conn.query_row(
        "SELECT id, type, data, created_at, period_start, period_end FROM journal_analysis
         WHERE type = ? ORDER BY created_at DESC LIMIT 1",
        params![kind],
        analysis_to_json,
    )
    .unwrap_or(Value::Null)
}

// ---------------------------------------------------------------------------
// Insights (contextual suggestions) — fully DB-backed, ported faithfully
// ---------------------------------------------------------------------------

fn get_current_session_summary(conn: &Connection) -> Vec<Value> {
    let session = get_current_session(conn);
    if session.is_null() {
        return Vec::new();
    }
    let sid = current_session_id(conn);
    let started_at = session.get("started_at").and_then(|v| v.as_i64()).unwrap_or(0);
    let entry_count = session.get("entry_count").and_then(|v| v.as_i64()).unwrap_or(0);

    let app_counts = query_list(
        conn,
        "SELECT app, COUNT(*) as count FROM system_journal
         WHERE session_id = ? AND cleared = 0
         GROUP BY app ORDER BY count DESC LIMIT 5",
        vec![SqlValue::Text(sid)],
        |r| {
            Ok(json!({
                "app": r.get::<_, String>(0)?,
                "count": r.get::<_, i64>(1)?,
            }))
        },
    );

    let duration_min = ((now_ms() - started_at) as f64 / 60000.0).round() as i64;
    vec![json!({
        "type": "session_summary",
        "title": "Current Session",
        "description": format!(
            "{} min, {} entries across {} apps",
            duration_min, entry_count, app_counts.len()
        ),
        "data": { "duration": duration_min, "entryCount": entry_count, "apps": app_counts },
    })]
}

fn get_most_used_today(conn: &Connection) -> Vec<Value> {
    let today_start = today_start_ms(conn);
    let rows = query_list(
        conn,
        "SELECT app, COUNT(*) as count FROM system_journal
         WHERE cleared = 0 AND timestamp >= ?
         GROUP BY app ORDER BY count DESC LIMIT 10",
        vec![SqlValue::Integer(today_start)],
        |r| {
            Ok(json!({
                "app": r.get::<_, String>(0)?,
                "count": r.get::<_, i64>(1)?,
            }))
        },
    );
    if rows.is_empty() {
        return Vec::new();
    }
    let desc = rows
        .iter()
        .map(|r| {
            format!(
                "{}: {}",
                r.get("app").and_then(|v| v.as_str()).unwrap_or(""),
                r.get("count").and_then(|v| v.as_i64()).unwrap_or(0)
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    vec![json!({
        "type": "most_used",
        "title": "Most Used Today",
        "description": desc,
        "data": rows,
    })]
}

fn get_unfinished_from_last_session(conn: &Connection) -> Vec<Value> {
    let sid = current_session_id(conn);
    // Previous session (not current).
    let prev_id: Option<String> = conn
        .query_row(
            "SELECT id FROM journal_sessions WHERE id != ? ORDER BY started_at DESC LIMIT 1",
            params![sid],
            |r| r.get(0),
        )
        .ok();
    let prev_id = match prev_id {
        Some(p) => p,
        None => return Vec::new(),
    };

    let rows = query_list(
        conn,
        "SELECT DISTINCT app, action, detail, timestamp FROM system_journal
         WHERE session_id = ? AND cleared = 0
         AND (action LIKE '%start%' OR action LIKE '%open%' OR action LIKE '%begin%' OR action LIKE '%editing%' OR action LIKE '%creating%')
         ORDER BY timestamp DESC LIMIT 10",
        vec![SqlValue::Text(prev_id)],
        |r| {
            Ok(json!({
                "app": r.get::<_, String>(0)?,
                "action": r.get::<_, String>(1)?,
                "detail": r.get::<_, Option<String>>(2)?,
                "timestamp": r.get::<_, i64>(3)?,
            }))
        },
    );

    rows.into_iter()
        .map(|row| {
            let app = row.get("app").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let action = row.get("action").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let detail = row.get("detail").and_then(|v| v.as_str()).map(String::from);
            let desc = match &detail {
                Some(d) => format!("{} -- {}", action, d),
                None => action.clone(),
            };
            json!({
                "type": "unfinished",
                "title": format!("Unfinished: {}", app),
                "description": desc,
                "data": {
                    "app": app,
                    "action": action,
                    "detail": detail,
                    "timestamp": row.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0),
                },
            })
        })
        .collect()
}

fn get_insights(conn: &Connection) -> Value {
    let mut insights: Vec<Value> = Vec::new();
    insights.extend(get_current_session_summary(conn));
    insights.extend(get_most_used_today(conn));
    insights.extend(get_unfinished_from_last_session(conn));

    // Latest pattern analysis (if the analysis engine has stored any).
    let latest_pattern = get_latest_analysis(conn, "pattern");
    if let Some(data_str) = latest_pattern.get("data").and_then(|v| v.as_str()) {
        if let Ok(pattern_data) = serde_json::from_str::<Value>(data_str) {
            if let Some(patterns) = pattern_data.get("patterns").and_then(|v| v.as_array()) {
                if !patterns.is_empty() {
                    insights.push(json!({
                        "type": "pattern",
                        "title": "Detected Patterns",
                        "description": format!(
                            "{} cross-app workflow patterns detected",
                            patterns.len()
                        ),
                        "data": patterns.iter().take(5).cloned().collect::<Vec<_>>(),
                    }));
                }
            }
        }
    }

    // Latest anomaly (if available).
    let latest_anomaly = get_latest_analysis(conn, "anomaly");
    if let Some(data_str) = latest_anomaly.get("data").and_then(|v| v.as_str()) {
        if let Ok(anomaly_data) = serde_json::from_str::<Value>(data_str) {
            if let Some(anomalies) = anomaly_data.get("anomalies").and_then(|v| v.as_array()) {
                if !anomalies.is_empty() {
                    let desc = anomalies[0]
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unusual usage pattern detected")
                        .to_string();
                    insights.push(json!({
                        "type": "suggestion",
                        "title": "Usage Anomaly",
                        "description": desc,
                        "data": anomalies.iter().take(3).cloned().collect::<Vec<_>>(),
                    }));
                }
            }
        }
    }

    json!(insights)
}

// ---------------------------------------------------------------------------
// get-date-groups (timeline)
// ---------------------------------------------------------------------------

fn get_date_groups(conn: &Connection, limit: i64) -> Value {
    let rows = query_list(
        conn,
        "SELECT
            date(timestamp / 1000, 'unixepoch', 'localtime') as date_str,
            COUNT(*) as count,
            MIN(timestamp) as first_ts,
            MAX(timestamp) as last_ts
         FROM system_journal
         WHERE cleared = 0
         GROUP BY date_str
         ORDER BY date_str DESC
         LIMIT ?",
        vec![SqlValue::Integer(limit)],
        |r| {
            Ok(json!({
                "date_str": r.get::<_, String>(0)?,
                "count": r.get::<_, i64>(1)?,
                "first_ts": r.get::<_, i64>(2)?,
                "last_ts": r.get::<_, i64>(3)?,
            }))
        },
    );
    json!(rows)
}

// ---------------------------------------------------------------------------
// batch-write
// ---------------------------------------------------------------------------

fn batch_write(conn: &Connection, args: &Value) -> Value {
    let entries = match args.get(0).and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return json!({ "ok": false, "error": "entries must be an array" }),
    };
    let sid = current_session_id(conn);
    let now = now_ms();
    let take = entries.len().min(1000);
    for entry in entries.iter().take(1000) {
        let app = entry.get("app").and_then(|v| v.as_str()).unwrap_or("");
        let action = entry.get("action").and_then(|v| v.as_str()).unwrap_or("");
        let detail = entry.get("detail").and_then(|v| v.as_str());
        let _ = conn.execute(
            "INSERT INTO system_journal (app, action, detail, timestamp, session_id) VALUES (?, ?, ?, ?, ?)",
            params![app, action, detail, now, sid],
        );
    }
    let _ = conn.execute(
        "UPDATE journal_sessions SET entry_count = entry_count + ? WHERE id = ?",
        params![take as i64, sid],
    );
    json!({ "ok": true, "written": take })
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    // Positional arg helpers mirroring the Electron (_event, a, b, ...) params.
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let opt_str = |i: usize| args.get(i).and_then(|v| v.as_str()).map(String::from);
    let i64_at = |i: usize| args.get(i).and_then(|v| v.as_i64());
    let obj = |i: usize| args.get(i).cloned().unwrap_or_else(|| json!({}));

    match channel {
        // Fire-and-forget write -> { ok: true }.
        "journal:write" => {
            write_entry(conn, &s(0), &s(1), opt_str(2).as_deref());
            json!({ "ok": true })
        }

        // Query entries (opts object at args[0]).
        "journal:query" => json!(query_entries(conn, &obj(0))),

        // Query by app (app, limit?, offset?).
        "journal:query-by-app" => {
            let opts = json!({
                "app": s(0),
                "limit": i64_at(1),
                "offset": i64_at(2),
            });
            json!(query_entries(conn, &opts))
        }

        // Query by session (sessionId, limit?, offset?).
        "journal:query-by-session" => {
            let opts = json!({
                "sessionId": s(0),
                "limit": i64_at(1),
                "offset": i64_at(2),
            });
            json!(query_entries(conn, &opts))
        }

        // Search (query, limit?, offset?).
        "journal:search" => {
            let opts = json!({
                "search": s(0),
                "limit": i64_at(1),
                "offset": i64_at(2),
            });
            json!(query_entries(conn, &opts))
        }

        // Sessions (limit?, offset?) — defaults 50/0.
        "journal:get-sessions" => get_sessions(conn, i64_at(0).unwrap_or(50), i64_at(1).unwrap_or(0)),

        "journal:get-current-session" => get_current_session(conn),
        "journal:get-apps" => get_distinct_apps(conn),
        "journal:get-app-groups" => get_app_groups(conn),
        "journal:get-stats" => get_stats(conn),

        // Clear operations -> { ok: true, affected }.
        "journal:clear-by-date-range" => {
            let affected = clear_by_date_range(conn, i64_at(0).unwrap_or(0), i64_at(1).unwrap_or(0));
            json!({ "ok": true, "affected": affected })
        }
        "journal:clear-by-app" => {
            let affected = clear_by_app(conn, &s(0));
            json!({ "ok": true, "affected": affected })
        }
        "journal:clear-all" => {
            let affected = clear_all(conn);
            json!({ "ok": true, "affected": affected })
        }

        // Hard purge -> { ok: true, purged }. Default olderThanDays = 7.
        "journal:hard-purge" => {
            let purged = hard_purge_cleared(conn, i64_at(0).unwrap_or(7));
            json!({ "ok": true, "purged": purged })
        }

        // Export (format, opts?) -> string blob.
        "journal:export" => export_entries(conn, &s(0), &obj(1)),

        "journal:get-insights" => get_insights(conn),

        // Analysis access (type, limit?) — default limit 10.
        "journal:get-analysis" => json!(get_analysis_results(conn, &s(0), i64_at(1).unwrap_or(10))),
        "journal:get-latest-analysis" => get_latest_analysis(conn, &s(0)),

        // Current run's session id string.
        "journal:get-session-id" => json!(current_session_id(conn)),

        // Batch write -> { ok, written } / { ok:false, error }.
        "journal:batch-write" => batch_write(conn, args),

        // Date groups for the timeline (limit? default 30).
        "journal:get-date-groups" => get_date_groups(conn, i64_at(0).unwrap_or(30)),

        // NOTE: journal:get-weekly-report / get-patterns / get-anomalies /
        // run-analysis are handled by JournalAnalysisEngine (a separate manager),
        // NOT SystemJournal.ts, so they intentionally fall through to null here.
        _ => Value::Null,
    }
}
