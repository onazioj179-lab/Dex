// =============================================================================
// DEX 6.0 — Daily Note (Tauri port of src/main/core/DailyNoteManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed daily note system (daily-note:* channels), reading/writing the
//! shared `dex.db` `daily_notes` table with the identical schema, queries, and
//! return shapes as the Electron manager (Feature 12). A structured daily note
//! is auto-created at first launch each day, pre-filled with yesterday's
//! unfinished tasks and today's due tasks (pulled from the `settings` table's
//! `tasks_data` key — owned by another subsystem, read defensively here so we
//! degrade exactly like the TS try/catch when it is absent). The `initialize`
//! BrowserWindow wiring is an internal Electron concern (not an IPC channel).

use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the daily_notes table + index (matches DailyNoteManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS daily_notes (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            pinned INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_daily_notes_date ON daily_notes(date);",
    );
}

/// One row -> the DailyNote shape. The TS spreads `...row` (snake_case columns
/// from `SELECT *`: id, date, title, content, pinned, created_at) then overrides
/// `pinned` to a boolean and injects `tag: 'daily-note'`. Key order matches the
/// spread: the raw columns first (with pinned in its column position), tag last.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "date": row.get::<_, String>(1)?,
        "title": row.get::<_, String>(2)?,
        "content": row.get::<_, String>(3)?,
        "pinned": row.get::<_, i64>(4)? == 1,
        "created_at": row.get::<_, i64>(5)?,
        "tag": "daily-note",
    }))
}

const SELECT_ALL: &str =
    "SELECT id, date, title, content, pinned, created_at FROM daily_notes";

/// today's date as YYYY-MM-DD in UTC (matches `new Date().toISOString().split('T')[0]`).
fn today_str() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    ymd_from_unix_secs(secs)
}

/// epoch milliseconds now (matches `Date.now()`).
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Convert UTC unix seconds -> YYYY-MM-DD (civil calendar, Howard Hinnant's algo).
fn ymd_from_unix_secs(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let (y, m, d) = civil_from_days(days);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// (weekday 0=Sun, year, month 1-12, day) from UTC unix seconds.
fn date_parts(secs: i64) -> (i64, i64, u32, u32) {
    let days = secs.div_euclid(86400);
    // 1970-01-01 was a Thursday (4). weekday = (days + 4) mod 7, 0=Sunday.
    let weekday = (days + 4).rem_euclid(7);
    let (y, m, d) = civil_from_days(days);
    (weekday, y, m, d)
}

/// days since 1970-01-01 -> (year, month 1-12, day 1-31).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// formatDateHeading: "Weekday, Month D YYYY" for the given UTC unix seconds.
fn format_date_heading(secs: i64) -> String {
    const DAYS: [&str; 7] = [
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ];
    const MONTHS: [&str; 12] = [
        "January", "February", "March", "April", "May", "June", "July", "August", "September",
        "October", "November", "December",
    ];
    let (weekday, year, month, day) = date_parts(secs);
    format!(
        "{}, {} {} {}",
        DAYS[weekday as usize],
        MONTHS[(month - 1) as usize],
        day,
        year
    )
}

/// daily-note:exists -> todayNoteExists(). Returns boolean (a row exists for today).
fn today_note_exists(conn: &Connection) -> Value {
    let today = today_str();
    let exists = conn
        .query_row(
            "SELECT id FROM daily_notes WHERE date = ?",
            params![today],
            |_| Ok(()),
        )
        .is_ok();
    json!(exists)
}

/// daily-note:getToday -> getTodayNote(). Returns the DailyNote for today, or null.
fn get_today_note(conn: &Connection) -> Value {
    let today = today_str();
    let sql = format!("{} WHERE date = ?", SELECT_ALL);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![today], row_to_json) {
        Ok(v) => v,
        Err(_) => Value::Null,
    }
}

/// daily-note:getAll -> getAllDailyNotes(). Returns DailyNote[] ordered date DESC.
fn get_all_daily_notes(conn: &Connection) -> Value {
    let sql = format!("{} ORDER BY date DESC", SELECT_ALL);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([], row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// Build the pre-filled task sections from the `settings` table's `tasks_data`
/// key. Returns (unfinished_section, due_today_section). Degrades to empty
/// strings if the table/key is absent or unparseable (matches the TS try/catch).
fn build_task_sections(conn: &Connection, today: &str) -> (String, String) {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'tasks_data'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok();

    let value = match raw {
        Some(v) => v,
        None => return (String::new(), String::new()),
    };

    let parsed: Value = match serde_json::from_str(&value) {
        Ok(v) => v,
        Err(_) => return (String::new(), String::new()),
    };
    let tasks = match parsed.as_array() {
        Some(a) => a,
        None => return (String::new(), String::new()),
    };

    // yesterday = today - 1 day, as YYYY-MM-DD (matches Date.now() - 86400000).
    let yesterday = ymd_from_unix_secs(now_ms() / 1000 - 86400);

    // `- [ ] ${t.title || t.name}` for each matching task, joined by '\n'.
    let line_for = |t: &Value| -> String {
        let title = t.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let label = if !title.is_empty() {
            title.to_string()
        } else {
            t.get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        };
        format!("- [ ] {}", label)
    };

    let matches_date = |t: &Value, date: &str| -> bool {
        let due = t.get("dueDate").and_then(|v| v.as_str()).unwrap_or("");
        let status = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
        due == date && status != "completed"
    };

    let unfinished: Vec<String> = tasks
        .iter()
        .filter(|t| matches_date(t, &yesterday))
        .map(line_for)
        .collect();
    let due_today: Vec<String> = tasks
        .iter()
        .filter(|t| matches_date(t, today))
        .map(line_for)
        .collect();

    let unfinished_section = if unfinished.is_empty() {
        String::new()
    } else {
        unfinished.join("\n")
    };
    let due_today_section = if due_today.is_empty() {
        String::new()
    } else {
        due_today.join("\n")
    };

    (unfinished_section, due_today_section)
}

/// daily-note:create -> createTodayNote(). Returns the DailyNote for today,
/// creating it (and unpinning yesterday's note) if it does not yet exist.
fn create_today_note(conn: &Connection) -> Value {
    let today = today_str();

    // Existing note -> map and return it (re-mapped object, snake_case + tag).
    let sql = format!("{} WHERE date = ?", SELECT_ALL);
    if let Ok(mut stmt) = conn.prepare(&sql) {
        if let Ok(v) = stmt.query_row(params![today], row_to_json) {
            return v;
        }
    }

    let now_secs = now_ms() / 1000;
    let heading = format_date_heading(now_secs);
    let note_id = format!("daily-{}", today);

    let (unfinished_section, due_today_section) = build_task_sections(conn, &today);

    // content assembled exactly as the TS array.join('\n'); empty sections fall
    // back to '(none)' via the `|| '(none)'` shortcut.
    let unfinished = if unfinished_section.is_empty() {
        "(none)"
    } else {
        &unfinished_section
    };
    let due_today = if due_today_section.is_empty() {
        "(none)"
    } else {
        &due_today_section
    };
    let content = [
        format!("# {}", heading),
        String::new(),
        "## Unfinished from Yesterday".to_string(),
        unfinished.to_string(),
        String::new(),
        "## Due Today".to_string(),
        due_today.to_string(),
        String::new(),
        "## Focus Intentions".to_string(),
        String::new(),
        String::new(),
        "## Notes".to_string(),
        String::new(),
    ]
    .join("\n");

    let created_at = now_ms();

    let inserted = conn.execute(
        "INSERT INTO daily_notes (id, date, title, content, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        params![note_id, today, heading, content, 1, created_at],
    );
    if inserted.is_err() {
        return Value::Null;
    }

    // unpinYesterdayNote(): set pinned = 0 for yesterday's date.
    let yesterday = ymd_from_unix_secs(now_ms() / 1000 - 86400);
    let _ = conn.execute(
        "UPDATE daily_notes SET pinned = 0 WHERE date = ?",
        params![yesterday],
    );

    // Returns { ...noteRecord, pinned: true, tag } — same keys/order as a row,
    // pinned forced true (the just-inserted note is pinned).
    json!({
        "id": note_id,
        "date": today,
        "title": heading,
        "content": content,
        "pinned": true,
        "created_at": created_at,
        "tag": "daily-note",
    })
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "daily-note:exists" => today_note_exists(conn),
        "daily-note:create" => create_today_note(conn),
        "daily-note:getToday" => get_today_note(conn),
        "daily-note:getAll" => get_all_daily_notes(conn),
        // updateContent(noteId, content) is a void TS handler -> { success: true }.
        "daily-note:updateContent" => {
            let note_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let content = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let _ = conn.execute(
                "UPDATE daily_notes SET content = ? WHERE id = ?",
                params![content, note_id],
            );
            json!({ "success": true })
        }
        _ => Value::Null,
    }
}
