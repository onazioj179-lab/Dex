// =============================================================================
// DEX 6.0 — Natural Language Task Creator (Tauri port of src/main/core/NaturalLanguageTaskManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed natural-language task parser (nl-task:* channels). Parses a free
//! text string into a task (title, due date, tags, priority, app) using the exact
//! same regex/keyword rules as the Electron manager (Feature 37) — this is pure
//! string logic, no LLM/network, so it is ported natively and faithfully. The
//! `create` handler additionally persists each parse into the `nl_task_history`
//! table (the TS wraps that write in try/catch as "table may not exist yet"; we
//! ensure the table here so history works, with the identical column shape the TS
//! INSERT/SELECT use). `getHistory` returns raw `SELECT *` rows (snake_case).
//! The Electron `nl-task:created` renderer push is an internal side effect, not
//! part of the IPC return value, so it is intentionally not replicated.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Priority keyword -> level. Matches PRIORITY_KEYWORDS in the TS, in order.
const PRIORITY_KEYWORDS: &[(&str, &str)] = &[
    ("urgent", "high"),
    ("important", "high"),
    ("critical", "high"),
    ("asap", "high"),
    ("high priority", "high"),
    ("low priority", "low"),
    ("whenever", "low"),
    ("not urgent", "low"),
    ("eventually", "low"),
];

/// Create the nl_task_history table (matches the columns the TS INSERT/SELECT use).
/// The Electron manager never created this table itself — it wrapped its read/write
/// in try/catch ("table may not exist yet") — but the ported subsystems own their
/// tables, so we create it with the exact column set referenced by the TS code,
/// adding the implicit `id` PK and the `created_at` column that getHistory orders by.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS nl_task_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            input TEXT NOT NULL DEFAULT '',
            parsed_title TEXT NOT NULL DEFAULT '',
            parsed_date TEXT NOT NULL DEFAULT '',
            parsed_tags TEXT NOT NULL DEFAULT '',
            parsed_priority TEXT NOT NULL DEFAULT 'normal',
            parsed_app TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_nl_task_history_created ON nl_task_history(created_at);",
    );
}

/// One nl_task_history row -> JSON, snake_case keys matching `SELECT *` column
/// order on the table definition above (exactly as better-sqlite3 returned it).
fn history_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "input": row.get::<_, String>(1)?,
        "parsed_title": row.get::<_, String>(2)?,
        "parsed_date": row.get::<_, String>(3)?,
        "parsed_tags": row.get::<_, String>(4)?,
        "parsed_priority": row.get::<_, String>(5)?,
        "parsed_app": row.get::<_, String>(6)?,
        "created_at": row.get::<_, String>(7)?,
    }))
}

// Date math is delegated to SQLite's date functions (pure rusqlite, no extra
// crates). The TS computes dates via `new Date().toISOString().split('T')[0]`,
// i.e. the UTC calendar date; SQLite's `date('now', ...)` is likewise UTC, so
// this is a faithful match. Helpers fall back to an empty string only if the
// query somehow fails (DB-less paths still call these via the dispatch conn).

/// Today as YYYY-MM-DD (UTC), matching `new Date().toISOString().split('T')[0]`.
fn today(conn: &Connection) -> String {
    conn.query_row("SELECT date('now')", [], |r| r.get::<_, String>(0))
        .unwrap_or_default()
}

/// `now + days` as YYYY-MM-DD (UTC).
fn date_plus_days(conn: &Connection, days: i64) -> String {
    let modifier = format!("{:+} days", days);
    conn.query_row("SELECT date('now', ?)", params![modifier], |r| {
        r.get::<_, String>(0)
    })
    .unwrap_or_default()
}

/// `now + months` as YYYY-MM-DD (UTC). SQLite `'+N months'` keeps the day and
/// normalizes overflow forward, matching JS Date.setMonth semantics.
fn date_plus_months(conn: &Connection, months: i64) -> String {
    let modifier = format!("{:+} months", months);
    conn.query_row("SELECT date('now', ?)", params![modifier], |r| {
        r.get::<_, String>(0)
    })
    .unwrap_or_default()
}

/// Current year (UTC), matching `new Date().getFullYear()` under the TS's
/// toISOString basis.
fn current_year(conn: &Connection) -> i64 {
    conn.query_row("SELECT CAST(strftime('%Y','now') AS INTEGER)", [], |r| {
        r.get(0)
    })
    .unwrap_or(1970)
}

/// Next occurrence of weekday `day` (0=Sun..6=Sat), strictly in the future,
/// matching nextDayOfWeek() in the TS (diff <= 0 -> add 7). Uses SQLite
/// strftime('%w') which is UTC Sunday=0, matching JS getDay() under the same
/// UTC basis the TS toISOString() output uses.
fn next_day_of_week(conn: &Connection, day: i64) -> String {
    let current: i64 = conn
        .query_row("SELECT CAST(strftime('%w','now') AS INTEGER)", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    let mut diff = day - current;
    if diff <= 0 {
        diff += 7;
    }
    date_plus_days(conn, diff)
}

/// The parsed-task shape, matching ParsedTask in the TS.
struct ParsedTask {
    title: String,
    due_date: Option<String>,
    tags: Vec<String>,
    priority: String,
    app: String,
    assignee: String,
    notes: String,
}

impl ParsedTask {
    fn to_json(&self) -> Value {
        let tags: Vec<Value> = self.tags.iter().map(|t| json!(t)).collect();
        json!({
            "title": self.title,
            "dueDate": self.due_date,
            "tags": tags,
            "priority": self.priority,
            "app": self.app,
            "assignee": self.assignee,
            "notes": self.notes,
        })
    }
}

/// Collapse runs of 2+ whitespace to a single space (matches /\s{2,}/g -> ' ').
fn collapse_ws(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    // Reproduce JS replace(/\s{2,}/g, ' '): only collapse runs of length >= 2.
    // Scan whitespace runs and emit a single space for runs of 2+, or the
    // original single whitespace char for runs of length 1.
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            let start = i;
            let mut run = 1usize;
            while i + 1 < chars.len() && chars[i + 1].is_whitespace() {
                i += 1;
                run += 1;
            }
            if run >= 2 {
                out.push(' ');
            } else {
                out.push(chars[start]);
            }
        } else {
            out.push(c);
        }
        i += 1;
    }
    out
}

/// Parse natural-language input into a task. Pure string logic — direct port of
/// NaturalLanguageTaskManager.parse(). No LLM/network involved. `conn` is used
/// only for SQLite-backed calendar arithmetic (date('now', ...)).
fn parse(conn: &Connection, input: &str) -> ParsedTask {
    let mut text = input.trim().to_string();
    let mut result = ParsedTask {
        title: String::new(),
        due_date: None,
        tags: Vec::new(),
        priority: "normal".to_string(),
        app: String::new(),
        assignee: String::new(),
        notes: String::new(),
    };

    // Extract tags (words prefixed with #): /#(\w[\w-]*)/g
    let tag_re = regex_lite_tags();
    let mut tags: Vec<String> = Vec::new();
    for m in tag_re.find_iter(&text) {
        // strip leading '#'
        tags.push(m[1..].to_string());
    }
    if !tags.is_empty() {
        result.tags = tags;
        text = tag_re.replace_all(&text).trim().to_string();
    }

    // Extract app specification (prefixed with @): /@(\w[\w-]*)/  (first only)
    if let Some(m) = at_match(&text) {
        result.app = m[1..].to_string(); // strip '@'
        text = replace_first_at(&text).trim().to_string();
    }

    // Extract priority (first matching keyword wins; word-boundary, case-insensitive).
    for (keyword, level) in PRIORITY_KEYWORDS {
        if let Some((start, end)) = find_word_ci(&text, keyword) {
            result.priority = (*level).to_string();
            let mut new_text = String::new();
            new_text.push_str(&text[..start]);
            new_text.push_str(&text[end..]);
            text = new_text.trim().to_string();
            break;
        }
    }

    // Also support !high !low !normal: /!(\w+)/
    if let Some((start, end, word)) = bang_word(&text) {
        let p = word.to_lowercase();
        if p == "high" || p == "normal" || p == "low" {
            result.priority = p;
            let mut new_text = String::new();
            new_text.push_str(&text[..start]);
            new_text.push_str(&text[end..]);
            text = new_text.trim().to_string();
        }
    }

    // Extract dates: iterate the DATE_PATTERNS in order; first match wins.
    text = extract_date(conn, &mut result, text);

    // Extract "due" prefix: /\bdue\s+(today|tomorrow|next\s+\w+)\b/i
    if result.due_date.is_none() {
        if let Some(word) = due_word(&text) {
            let w = word.to_lowercase();
            if w == "today" {
                result.due_date = Some(today(conn));
            } else if w == "tomorrow" {
                result.due_date = Some(date_plus_days(conn, 1));
            }
            // remove /\bdue\s+\w+(?:\s+\w+)?\b/i regardless (matches TS)
            text = remove_due_phrase(&text);
        }
    }

    // Clean up remaining text as title.
    result.title = collapse_ws(&text).trim().to_string();

    result
}

// --- Date extraction: faithful port of the DATE_PATTERNS loop ---------------

/// Apply the date patterns in order, mutating `result.due_date` and returning the
/// text with the matched date phrase removed (first match only, as in the TS).
fn extract_date(conn: &Connection, result: &mut ParsedTask, mut text: String) -> String {
    // Patterns are tried in the exact TS DATE_PATTERNS order; first match wins,
    // and the matched phrase is spliced out of the title text.

    // 1. today
    if let Some((s, e)) = find_word_ci(&text, "today") {
        result.due_date = Some(today(conn));
        text = splice_out(&text, s, e);
        return text.trim().to_string();
    }
    // 2. tomorrow
    if let Some((s, e)) = find_word_ci(&text, "tomorrow") {
        result.due_date = Some(date_plus_days(conn, 1));
        text = splice_out(&text, s, e);
        return text.trim().to_string();
    }
    // 3. next week
    if let Some((s, e)) = find_phrase_ci(&text, "next", "week") {
        result.due_date = Some(date_plus_days(conn, 7));
        text = splice_out(&text, s, e);
        return text.trim().to_string();
    }
    // 4. next month
    if let Some((s, e)) = find_phrase_ci(&text, "next", "month") {
        result.due_date = Some(date_plus_months(conn, 1));
        text = splice_out(&text, s, e);
        return text.trim().to_string();
    }
    // 5..11. next <weekday>
    let weekdays = [
        ("monday", 1i64),
        ("tuesday", 2),
        ("wednesday", 3),
        ("thursday", 4),
        ("friday", 5),
        ("saturday", 6),
        ("sunday", 0),
    ];
    for (name, idx) in weekdays {
        if let Some((s, e)) = find_phrase_ci(&text, "next", name) {
            result.due_date = Some(next_day_of_week(conn, idx));
            text = splice_out(&text, s, e);
            return text.trim().to_string();
        }
    }
    // 12. in N days: /\bin\s+(\d+)\s+days?\b/i
    if let Some((s, e, num)) = find_in_n(&text, "day") {
        result.due_date = Some(date_plus_days(conn, num));
        text = splice_out(&text, s, e);
        return text.trim().to_string();
    }
    // 13. in N weeks: /\bin\s+(\d+)\s+weeks?\b/i
    if let Some((s, e, num)) = find_in_n(&text, "week") {
        result.due_date = Some(date_plus_days(conn, num * 7));
        text = splice_out(&text, s, e);
        return text.trim().to_string();
    }
    // 14. on YYYY-MM-DD: /\bon\s+(\d{4}-\d{2}-\d{2})\b/  (case-sensitive in TS)
    if let Some((s, e, date)) = find_on_iso(&text) {
        result.due_date = Some(date);
        text = splice_out(&text, s, e);
        return text.trim().to_string();
    }
    // 15. on M/D[/Y]: /\bon\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/
    if let Some((s, e, date)) = find_on_slash(conn, &text) {
        result.due_date = Some(date);
        text = splice_out(&text, s, e);
        return text.trim().to_string();
    }

    text
}

// --- Tiny regex-equivalent scanners (no regex crate; stdlib only) -----------
//
// These reproduce exactly the small set of patterns the TS uses. \w is
// [A-Za-z0-9_]; word boundaries (\b) are emulated by checking that the chars
// flanking a match are not \w characters.

fn is_word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// True if the byte position `pos` (start or just-past-end) is a word boundary
/// relative to the text, for an alnum/underscore match edge.
fn boundary_ok(bytes: &[u8], left: usize, right: usize) -> bool {
    let left_ok = left == 0 || !is_word_char(bytes[left - 1] as char);
    let right_ok = right >= bytes.len() || !is_word_char(bytes[right] as char);
    left_ok && right_ok
}

/// Find a single literal word (case-insensitive) with \b on both sides.
/// Returns the byte range.
fn find_word_ci(text: &str, word: &str) -> Option<(usize, usize)> {
    let hay = text.to_lowercase();
    let needle = word.to_lowercase();
    let bytes = hay.as_bytes();
    let mut from = 0;
    while let Some(rel) = hay[from..].find(&needle) {
        let start = from + rel;
        let end = start + needle.len();
        if boundary_ok(bytes, start, end) {
            return Some((start, end));
        }
        from = start + 1;
        if from >= hay.len() {
            break;
        }
    }
    None
}

/// Find "<a>\s+<b>" (case-insensitive) with \b around the whole phrase.
fn find_phrase_ci(text: &str, a: &str, b: &str) -> Option<(usize, usize)> {
    let hay = text.to_lowercase();
    let bytes = hay.as_bytes();
    let a = a.to_lowercase();
    let b = b.to_lowercase();
    let mut from = 0;
    while let Some(rel) = hay[from..].find(&a) {
        let astart = from + rel;
        let aend = astart + a.len();
        // require word boundary before `a`
        let left_ok = astart == 0 || !is_word_char(bytes[astart - 1] as char);
        if left_ok {
            // consume one or more whitespace
            let mut i = aend;
            let mut saw_space = false;
            while i < bytes.len() && (bytes[i] as char).is_ascii_whitespace() {
                i += 1;
                saw_space = true;
            }
            if saw_space && hay[i..].starts_with(&b) {
                let bend = i + b.len();
                let right_ok = bend >= bytes.len() || !is_word_char(bytes[bend] as char);
                if right_ok {
                    return Some((astart, bend));
                }
            }
        }
        from = astart + 1;
        if from >= hay.len() {
            break;
        }
    }
    None
}

/// /\bin\s+(\d+)\s+(day|week)s?\b/i — returns (start, end, number).
fn find_in_n(text: &str, unit: &str) -> Option<(usize, usize, i64)> {
    let hay = text.to_lowercase();
    let bytes = hay.as_bytes();
    let mut from = 0;
    while let Some(rel) = hay[from..].find("in") {
        let start = from + rel;
        let after = start + 2;
        let left_ok = start == 0 || !is_word_char(bytes[start - 1] as char);
        let in_word_boundary = after >= bytes.len() || !is_word_char(bytes[after] as char);
        if left_ok && in_word_boundary {
            let mut i = after;
            // \s+
            let mut saw = false;
            while i < bytes.len() && (bytes[i] as char).is_ascii_whitespace() {
                i += 1;
                saw = true;
            }
            if saw {
                // (\d+)
                let dstart = i;
                while i < bytes.len() && (bytes[i] as char).is_ascii_digit() {
                    i += 1;
                }
                if i > dstart {
                    let num: i64 = hay[dstart..i].parse().unwrap_or(0);
                    // \s+
                    let mut saw2 = false;
                    while i < bytes.len() && (bytes[i] as char).is_ascii_whitespace() {
                        i += 1;
                        saw2 = true;
                    }
                    if saw2 && hay[i..].starts_with(unit) {
                        let mut uend = i + unit.len();
                        // optional 's'
                        if uend < bytes.len() && bytes[uend] == b's' {
                            uend += 1;
                        }
                        let right_ok = uend >= bytes.len() || !is_word_char(bytes[uend] as char);
                        if right_ok {
                            return Some((start, uend, num));
                        }
                    }
                }
            }
        }
        from = start + 1;
        if from >= hay.len() {
            break;
        }
    }
    None
}

/// /\bon\s+(\d{4}-\d{2}-\d{2})\b/  (case-sensitive 'on' in the TS source).
fn find_on_iso(text: &str) -> Option<(usize, usize, String)> {
    let bytes = text.as_bytes();
    let mut from = 0;
    while let Some(rel) = text[from..].find("on") {
        let start = from + rel;
        let after = start + 2;
        let left_ok = start == 0 || !is_word_char(bytes[start - 1] as char);
        let on_boundary = after >= bytes.len() || !is_word_char(bytes[after] as char);
        if left_ok && on_boundary {
            let mut i = after;
            let mut saw = false;
            while i < bytes.len() && (bytes[i] as char).is_ascii_whitespace() {
                i += 1;
                saw = true;
            }
            if saw {
                // \d{4}-\d{2}-\d{2}
                if let Some((dend, date)) = match_iso_date(bytes, i) {
                    let right_ok = dend >= bytes.len() || !is_word_char(bytes[dend] as char);
                    if right_ok {
                        return Some((start, dend, date));
                    }
                }
            }
        }
        from = start + 1;
        if from >= text.len() {
            break;
        }
    }
    None
}

fn match_iso_date(bytes: &[u8], i: usize) -> Option<(usize, String)> {
    let need = |off: usize| -> Option<()> {
        if i + off < bytes.len() && (bytes[i + off] as char).is_ascii_digit() {
            Some(())
        } else {
            None
        }
    };
    need(0)?;
    need(1)?;
    need(2)?;
    need(3)?;
    if i + 4 >= bytes.len() || bytes[i + 4] != b'-' {
        return None;
    }
    need(5)?;
    need(6)?;
    if i + 7 >= bytes.len() || bytes[i + 7] != b'-' {
        return None;
    }
    need(8)?;
    need(9)?;
    let end = i + 10;
    let date = String::from_utf8_lossy(&bytes[i..end]).to_string();
    Some((end, date))
}

/// /\bon\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/  (case-sensitive 'on').
fn find_on_slash(conn: &Connection, text: &str) -> Option<(usize, usize, String)> {
    let bytes = text.as_bytes();
    let mut from = 0;
    while let Some(rel) = text[from..].find("on") {
        let start = from + rel;
        let after = start + 2;
        let left_ok = start == 0 || !is_word_char(bytes[start - 1] as char);
        let on_boundary = after >= bytes.len() || !is_word_char(bytes[after] as char);
        if left_ok && on_boundary {
            let mut i = after;
            let mut saw = false;
            while i < bytes.len() && (bytes[i] as char).is_ascii_whitespace() {
                i += 1;
                saw = true;
            }
            if saw {
                if let Some((end, month, day, year_opt)) = match_slash_date(bytes, i) {
                    let right_ok = end >= bytes.len() || !is_word_char(bytes[end] as char);
                    if right_ok {
                        let mut year = year_opt.unwrap_or_else(|| current_year(conn));
                        if year < 100 {
                            year += 2000;
                        }
                        let date = format!("{:04}-{:02}-{:02}", year, month, day);
                        return Some((start, end, date));
                    }
                }
            }
        }
        from = start + 1;
        if from >= text.len() {
            break;
        }
    }
    None
}

/// Match (\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))? starting at `i`.
fn match_slash_date(bytes: &[u8], i: usize) -> Option<(usize, i64, i64, Option<i64>)> {
    let read_num = |start: usize, max: usize| -> Option<(usize, i64)> {
        let mut j = start;
        while j < bytes.len() && j - start < max && (bytes[j] as char).is_ascii_digit() {
            j += 1;
        }
        if j == start {
            None
        } else {
            let n: i64 = std::str::from_utf8(&bytes[start..j]).ok()?.parse().ok()?;
            Some((j, n))
        }
    };
    let (j, month) = read_num(i, 2)?;
    if j >= bytes.len() || bytes[j] != b'/' {
        return None;
    }
    let (k, day) = read_num(j + 1, 2)?;
    // optional /YYYY or /YY (2..4 digits)
    if k < bytes.len() && bytes[k] == b'/' {
        // count 2..4 digits
        let ystart = k + 1;
        let mut y = ystart;
        while y < bytes.len() && y - ystart < 4 && (bytes[y] as char).is_ascii_digit() {
            y += 1;
        }
        let ylen = y - ystart;
        if (2..=4).contains(&ylen) {
            let year: i64 = std::str::from_utf8(&bytes[ystart..y]).ok()?.parse().ok()?;
            return Some((y, month, day, Some(year)));
        }
        // year part present but not 2..4 digits: optional group fails, match
        // stops after day (the (?:...)? is optional).
        return Some((k, month, day, None));
    }
    Some((k, month, day, None))
}

// --- # and @ and ! and "due" helpers ---------------------------------------

/// Strip leading '#'/'@' matches not needed; here we return all #-tags.
/// Mirrors /#(\w[\w-]*)/g — '#' then a \w then \w-or-dash.
fn regex_lite_tags() -> TagRe {
    TagRe
}

struct TagRe;
impl TagRe {
    /// Iterate matches of #(\w[\w-]*) returning the full match incl. '#'.
    fn find_iter<'a>(&self, text: &'a str) -> Vec<&'a str> {
        let bytes = text.as_bytes();
        let mut out = Vec::new();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'#' {
                let start = i;
                let mut j = i + 1;
                // first char must be \w
                if j < bytes.len() && is_word_char(bytes[j] as char) {
                    j += 1;
                    // then [\w-]*
                    while j < bytes.len()
                        && (is_word_char(bytes[j] as char) || bytes[j] == b'-')
                    {
                        j += 1;
                    }
                    out.push(&text[start..j]);
                    i = j;
                    continue;
                }
            }
            i += 1;
        }
        out
    }

    /// Replace all #(\w[\w-]*) matches with '' (matches /#\w[\w-]*/g).
    fn replace_all(&self, text: &str) -> String {
        let bytes = text.as_bytes();
        let mut out = String::with_capacity(text.len());
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'#' {
                let mut j = i + 1;
                if j < bytes.len() && is_word_char(bytes[j] as char) {
                    j += 1;
                    while j < bytes.len()
                        && (is_word_char(bytes[j] as char) || bytes[j] == b'-')
                    {
                        j += 1;
                    }
                    i = j; // skip the match
                    continue;
                }
            }
            out.push(bytes[i] as char);
            i += 1;
        }
        out
    }
}

/// First match of /@(\w[\w-]*)/ -> the full match incl. '@'.
fn at_match(text: &str) -> Option<&str> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'@' {
            let start = i;
            let mut j = i + 1;
            if j < bytes.len() && is_word_char(bytes[j] as char) {
                j += 1;
                while j < bytes.len() && (is_word_char(bytes[j] as char) || bytes[j] == b'-') {
                    j += 1;
                }
                return Some(&text[start..j]);
            }
        }
        i += 1;
    }
    None
}

/// Replace the first /@\w[\w-]*/ match with '' (matches the TS single replace).
fn replace_first_at(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'@' {
            let start = i;
            let mut j = i + 1;
            if j < bytes.len() && is_word_char(bytes[j] as char) {
                j += 1;
                while j < bytes.len() && (is_word_char(bytes[j] as char) || bytes[j] == b'-') {
                    j += 1;
                }
                let mut out = String::with_capacity(text.len());
                out.push_str(&text[..start]);
                out.push_str(&text[j..]);
                return out;
            }
        }
        i += 1;
    }
    text.to_string()
}

/// First match of /!(\w+)/ -> (start, end, captured word).
fn bang_word(text: &str) -> Option<(usize, usize, String)> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'!' {
            let start = i;
            let mut j = i + 1;
            if j < bytes.len() && is_word_char(bytes[j] as char) {
                let wstart = j;
                while j < bytes.len() && is_word_char(bytes[j] as char) {
                    j += 1;
                }
                let word = text[wstart..j].to_string();
                return Some((start, j, word));
            }
        }
        i += 1;
    }
    None
}

/// /\bdue\s+(today|tomorrow|next\s+\w+)\b/i -> the captured group (lowercased
/// comparison happens at the call site). Returns the matched keyword text.
fn due_word(text: &str) -> Option<String> {
    let hay = text.to_lowercase();
    let bytes = hay.as_bytes();
    let mut from = 0;
    while let Some(rel) = hay[from..].find("due") {
        let start = from + rel;
        let after = start + 3;
        let left_ok = start == 0 || !is_word_char(bytes[start - 1] as char);
        let due_boundary = after >= bytes.len() || !is_word_char(bytes[after] as char);
        if left_ok && due_boundary {
            let mut i = after;
            let mut saw = false;
            while i < bytes.len() && (bytes[i] as char).is_ascii_whitespace() {
                i += 1;
                saw = true;
            }
            if saw {
                if hay[i..].starts_with("today") {
                    let e = i + 5;
                    if e >= bytes.len() || !is_word_char(bytes[e] as char) {
                        return Some("today".to_string());
                    }
                }
                if hay[i..].starts_with("tomorrow") {
                    let e = i + 8;
                    if e >= bytes.len() || !is_word_char(bytes[e] as char) {
                        return Some("tomorrow".to_string());
                    }
                }
                if hay[i..].starts_with("next") {
                    let mut j = i + 4;
                    let mut saw2 = false;
                    while j < bytes.len() && (bytes[j] as char).is_ascii_whitespace() {
                        j += 1;
                        saw2 = true;
                    }
                    if saw2 {
                        let wstart = j;
                        while j < bytes.len() && is_word_char(bytes[j] as char) {
                            j += 1;
                        }
                        if j > wstart {
                            return Some(format!("next {}", &hay[wstart..j]));
                        }
                    }
                }
            }
        }
        from = start + 1;
        if from >= hay.len() {
            break;
        }
    }
    None
}

/// Remove /\bdue\s+\w+(?:\s+\w+)?\b/i (first match) -> remaining text trimmed.
fn remove_due_phrase(text: &str) -> String {
    let hay = text.to_lowercase();
    let bytes = hay.as_bytes();
    let mut from = 0;
    while let Some(rel) = hay[from..].find("due") {
        let start = from + rel;
        let after = start + 3;
        let left_ok = start == 0 || !is_word_char(bytes[start - 1] as char);
        let due_boundary = after >= bytes.len() || !is_word_char(bytes[after] as char);
        if left_ok && due_boundary {
            let mut i = after;
            let mut saw = false;
            while i < bytes.len() && (bytes[i] as char).is_ascii_whitespace() {
                i += 1;
                saw = true;
            }
            if saw {
                // \w+
                let w1s = i;
                while i < bytes.len() && is_word_char(bytes[i] as char) {
                    i += 1;
                }
                if i > w1s {
                    // optional (?:\s+\w+)?
                    let mut end = i;
                    let mut k = i;
                    let mut saw2 = false;
                    while k < bytes.len() && (bytes[k] as char).is_ascii_whitespace() {
                        k += 1;
                        saw2 = true;
                    }
                    if saw2 {
                        let w2s = k;
                        while k < bytes.len() && is_word_char(bytes[k] as char) {
                            k += 1;
                        }
                        if k > w2s {
                            end = k;
                        }
                    }
                    let result = splice_out(text, start, end);
                    return result.trim().to_string();
                }
            }
        }
        from = start + 1;
        if from >= hay.len() {
            break;
        }
    }
    text.trim().to_string()
}

/// Remove the byte range [start, end) from `text`.
fn splice_out(text: &str, start: usize, end: usize) -> String {
    let mut out = String::with_capacity(text.len());
    out.push_str(&text[..start]);
    out.push_str(&text[end..]);
    out
}

// --- Handlers ---------------------------------------------------------------

/// nl-task:create — parse + persist into nl_task_history, returning the ParsedTask.
fn create_task(conn: &Connection, input: &str) -> Value {
    let parsed = parse(conn, input);

    // INSERT history (TS wraps in try/catch; ignore errors). tags -> JSON array
    // string (matches JSON.stringify(parsed.tags)); dueDate || '' -> ''.
    let tags_json = serde_json::to_string(&parsed.tags).unwrap_or_else(|_| "[]".to_string());
    let due = parsed.due_date.clone().unwrap_or_default();
    let _ = conn.execute(
        "INSERT INTO nl_task_history (input, parsed_title, parsed_date, parsed_tags, parsed_priority, parsed_app)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![input, parsed.title, due, tags_json, parsed.priority, parsed.app],
    );

    // The Electron manager also sends 'nl-task:created' to the renderer here;
    // that is an internal side effect, not part of the IPC return value, so it
    // is intentionally not replicated (not ported).
    parsed.to_json()
}

/// nl-task:history — getHistory(limit=50). Raw `SELECT *` rows (snake_case),
/// ordered created_at DESC. Degrades to [] if the table is missing (TS try/catch).
fn get_history(conn: &Connection, limit: i64) -> Value {
    let sql = "SELECT id, input, parsed_title, parsed_date, parsed_tags, parsed_priority, parsed_app, created_at \
               FROM nl_task_history ORDER BY created_at DESC LIMIT ?";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([SqlValue::Integer(limit)], history_row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // parse(input) — pure, returns the ParsedTask shape.
        "nl-task:parse" => {
            let input = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            parse(conn, input).to_json()
        }
        // createTask(input) — parse + persist, returns the ParsedTask shape.
        "nl-task:create" => {
            let input = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            create_task(conn, input)
        }
        // getHistory(limit?) — default 50 when omitted (TS default param).
        "nl-task:history" => {
            let limit = args.get(0).and_then(|v| v.as_i64()).unwrap_or(50);
            get_history(conn, limit)
        }
        _ => Value::Null,
    }
}
