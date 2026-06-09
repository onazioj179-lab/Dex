// =============================================================================
// DEX 6.0 — Project Timeline (Tauri port of src/main/core/ProjectTimelineManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Read-only timeline aggregator (project-timeline:* channels). It owns NO
//! tables of its own — it stitches a chronological event list for one project
//! out of five foreign tables that other subsystems create: version_history,
//! project_links, color_labels, time_tracking, and activity_feed (Feature 18).
//! Every source read is wrapped to degrade to "no events from this source" when
//! the table is absent or its columns differ, exactly matching the per-source
//! try/catch in the Electron manager. Because this module creates nothing,
//! `ensure_schema` is intentionally a no-op. The two handlers below build the
//! same `TimelineData` / `TimelineEvent[]` shapes the renderer received under
//! Electron (camelCase re-mapped objects; raw rows kept snake_case in details).

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Map, Value};

/// This module owns no tables (it only reads foreign ones), so there is nothing
/// to create. Kept for a uniform module surface; the source tables are ensured
/// by their own modules (version_history, project_links, color_labels,
/// time_tracking, activity_feed) and each read here degrades when one is absent.
pub fn ensure_schema(_conn: &Connection) {
    // intentionally empty — no owned tables
}

/// A single timeline event in the TS `TimelineEvent` shape (all camelCase).
/// `details` is an arbitrary JSON value matching what the TS placed there.
fn make_event(
    id: String,
    event_type: &str,
    title: String,
    timestamp: Value,
    app: &str,
    project_id: &str,
    details: Value,
) -> Value {
    json!({
        "id": id,
        "type": event_type,
        "title": title,
        "timestamp": timestamp,
        "app": app,
        "projectId": project_id,
        "details": details,
    })
}

/// Best-effort timestamp string for sorting / range. The TS reads string
/// columns (created_at) and an integer column (time_tracking.timestamp); both
/// are compared with String.localeCompare, which coerces to string first. We
/// mirror that by coercing each event's timestamp to a string for ordering
/// while preserving the original JSON type in the event object.
fn ts_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Read a full row as a JSON object keyed by its SELECT column names (snake_case),
/// mirroring better-sqlite3's `SELECT *` row object. Used where the TS passes the
/// raw row straight through as `details` (project_links, color_labels).
fn row_to_named_object(row: &Row) -> rusqlite::Result<Value> {
    let stmt = row.as_ref();
    let count = stmt.column_count();
    let mut obj = Map::new();
    for i in 0..count {
        let name = stmt.column_name(i).unwrap_or("").to_string();
        // Read each value generically; map SQLite types to JSON like JS would.
        let val: Value = match row.get_ref(i)? {
            rusqlite::types::ValueRef::Null => Value::Null,
            rusqlite::types::ValueRef::Integer(n) => json!(n),
            rusqlite::types::ValueRef::Real(f) => json!(f),
            rusqlite::types::ValueRef::Text(t) => {
                json!(String::from_utf8_lossy(t).to_string())
            }
            rusqlite::types::ValueRef::Blob(b) => {
                // JS would surface a Buffer here; the timeline sources that pass
                // raw rows (project_links, color_labels) have no BLOB columns, so
                // this branch is unreachable in practice. Degrade to base-like
                // array of byte numbers rather than fabricate a string.
                json!(b.iter().map(|x| json!(x)).collect::<Vec<Value>>())
            }
        };
        obj.insert(name, val);
    }
    Ok(Value::Object(obj))
}

/// Gather events from version_history. The TS selects `*` and reads
/// project_name, label, created_at, id. version_history is owned by another
/// module and its on-disk schema differs (no `label`/`created_at` column in the
/// DatabaseManager definition), so the TS try/catch silently skips this source
/// when those columns are missing — we reproduce that by degrading to no events
/// on any prepare/query/column error.
fn gather_versions(
    conn: &Connection,
    app: &str,
    project_id: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
    events: &mut Vec<Value>,
    project_name: &mut String,
) {
    let mut sql =
        String::from("SELECT * FROM version_history WHERE app = ? AND (project_name = ? OR id = ?)");
    let mut p: Vec<SqlValue> = vec![
        SqlValue::Text(app.to_string()),
        SqlValue::Text(project_id.to_string()),
        SqlValue::Text(project_id.to_string()),
    ];
    if let Some(s) = start_date {
        sql.push_str(" AND created_at >= ?");
        p.push(SqlValue::Text(s.to_string()));
    }
    if let Some(e) = end_date {
        sql.push_str(" AND created_at <= ?");
        p.push(SqlValue::Text(e.to_string()));
    }
    sql.push_str(" ORDER BY created_at ASC");

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return,
    };
    let rows = stmt.query_map(rusqlite::params_from_iter(p), |row| {
        // Pull only the named columns the TS reads. Any missing column makes the
        // whole map_err out -> source skipped (matches the TS catch).
        let id: i64 = row.get("id")?;
        let pname: Option<String> = row.get("project_name").ok().flatten();
        let label: Option<String> = row.get("label").ok().flatten();
        let created_at: Option<String> = row.get("created_at")?;
        Ok((id, pname, label, created_at))
    });
    let rows = match rows {
        Ok(r) => r,
        Err(_) => return,
    };
    let out: Vec<(i64, Option<String>, Option<String>, Option<String>)> =
        rows.filter_map(|r| r.ok()).collect();

    for (id, pname, label, created_at) in out {
        // projectName = v.project_name || projectName
        if let Some(pn) = pname.as_ref() {
            if !pn.is_empty() {
                *project_name = pn.clone();
            }
        }
        // title: `Version saved: ${v.label || v.project_name || ''}`
        let label_part = match label.as_ref() {
            Some(l) if !l.is_empty() => l.clone(),
            _ => match pname.as_ref() {
                Some(pn) if !pn.is_empty() => pn.clone(),
                _ => String::new(),
            },
        };
        let timestamp = match created_at {
            Some(c) => json!(c),
            None => Value::Null,
        };
        events.push(make_event(
            format!("version-{}", id),
            "version",
            format!("Version saved: {}", label_part),
            timestamp,
            app,
            project_id,
            json!({ "versionId": id, "label": label }),
        ));
    }
}

/// Gather events from project_links. The TS passes the raw row through as
/// `details`, so we keep the full SELECT * object (snake_case columns).
fn gather_links(conn: &Connection, app: &str, project_id: &str, events: &mut Vec<Value>) {
    let sql = "SELECT * FROM project_links \
               WHERE (source_app = ? AND source_id = ?) OR (target_app = ? AND target_id = ?) \
               ORDER BY created_at ASC";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return,
    };
    let rows = stmt.query_map(params![app, project_id, app, project_id], row_to_named_object);
    let rows = match rows {
        Ok(r) => r,
        Err(_) => return,
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();

    for link in out {
        let id = link.get("id").cloned().unwrap_or(Value::Null);
        let target_app = link.get("target_app").and_then(|v| v.as_str()).unwrap_or("");
        let target_id = link.get("target_id").and_then(|v| v.as_str()).unwrap_or("");
        let timestamp = link.get("created_at").cloned().unwrap_or(Value::Null);
        let id_str = ts_string(&id);
        events.push(make_event(
            format!("link-{}", id_str),
            "link",
            format!("Linked to {}/{}", target_app, target_id),
            timestamp,
            app,
            project_id,
            link.clone(),
        ));
    }
}

/// Gather events from color_labels. The TS passes the raw row through as
/// `details`, so we keep the full SELECT * object (snake_case columns).
fn gather_labels(conn: &Connection, app: &str, project_id: &str, events: &mut Vec<Value>) {
    let sql = "SELECT * FROM color_labels WHERE app = ? AND item_id = ? ORDER BY created_at ASC";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return,
    };
    let rows = stmt.query_map(params![app, project_id], row_to_named_object);
    let rows = match rows {
        Ok(r) => r,
        Err(_) => return,
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();

    for label in out {
        let id = label.get("id").cloned().unwrap_or(Value::Null);
        let color = label.get("color").and_then(|v| v.as_str()).unwrap_or("");
        // `${label.color}${label.label ? ' - ' + label.label : ''}`
        let label_text = label.get("label").and_then(|v| v.as_str()).unwrap_or("");
        let suffix = if !label_text.is_empty() {
            format!(" - {}", label_text)
        } else {
            String::new()
        };
        let timestamp = label.get("created_at").cloned().unwrap_or(Value::Null);
        let id_str = ts_string(&id);
        events.push(make_event(
            format!("label-{}", id_str),
            "label",
            format!("Color label: {}{}", color, suffix),
            timestamp,
            app,
            project_id,
            label.clone(),
        ));
    }
}

/// Gather events from time_tracking. The TS computes an hours figure and builds
/// a re-mapped details object; timestamp is the integer `timestamp` column.
fn gather_times(conn: &Connection, app: &str, project_id: &str, events: &mut Vec<Value>) {
    let sql =
        "SELECT id, duration_ms, date, timestamp FROM time_tracking WHERE app = ? AND project_id = ? ORDER BY timestamp ASC";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return,
    };
    let rows = stmt.query_map(params![app, project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,            // id
            row.get::<_, i64>(1)?,            // duration_ms
            row.get::<_, Option<String>>(2)?, // date
            row.get::<_, i64>(3)?,            // timestamp
        ))
    });
    let rows = match rows {
        Ok(r) => r,
        Err(_) => return,
    };
    let out: Vec<(i64, i64, Option<String>, i64)> = rows.filter_map(|r| r.ok()).collect();

    for (id, duration_ms, date, timestamp) in out {
        // hours = Math.round(t.duration_ms / 3600000 * 10) / 10
        let hours = ((duration_ms as f64 / 3_600_000.0 * 10.0).round()) / 10.0;
        let date_str = date.clone().unwrap_or_default();
        events.push(make_event(
            format!("time-{}", id),
            "time",
            format!("Worked {}h on {}", js_num_to_string(hours), date_str),
            json!(timestamp),
            app,
            project_id,
            json!({ "duration_ms": duration_ms, "date": date }),
        ));
    }
}

/// Gather events from activity_feed. The TS LIKE-matches projectId in title or
/// details, re-maps title + eventType, and uses created_at as the timestamp.
fn gather_activities(
    conn: &Connection,
    app: &str,
    project_id: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
    events: &mut Vec<Value>,
) {
    let mut sql = String::from(
        "SELECT id, event_type, title, created_at FROM activity_feed WHERE app = ? AND (title LIKE ? OR details LIKE ?)",
    );
    let like = format!("%{}%", project_id);
    let mut p: Vec<SqlValue> = vec![
        SqlValue::Text(app.to_string()),
        SqlValue::Text(like.clone()),
        SqlValue::Text(like.clone()),
    ];
    if let Some(s) = start_date {
        sql.push_str(" AND created_at >= ?");
        p.push(SqlValue::Text(s.to_string()));
    }
    if let Some(e) = end_date {
        sql.push_str(" AND created_at <= ?");
        p.push(SqlValue::Text(e.to_string()));
    }
    sql.push_str(" ORDER BY created_at ASC LIMIT 200");

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return,
    };
    let rows = stmt.query_map(rusqlite::params_from_iter(p), |row| {
        Ok((
            row.get::<_, i64>(0)?,            // id
            row.get::<_, Option<String>>(1)?, // event_type
            row.get::<_, Option<String>>(2)?, // title
            row.get::<_, Option<String>>(3)?, // created_at
        ))
    });
    let rows = match rows {
        Ok(r) => r,
        Err(_) => return,
    };
    let out: Vec<(i64, Option<String>, Option<String>, Option<String>)> =
        rows.filter_map(|r| r.ok()).collect();

    for (id, event_type, title, created_at) in out {
        let timestamp = match created_at {
            Some(c) => json!(c),
            None => Value::Null,
        };
        events.push(make_event(
            format!("activity-{}", id),
            "activity",
            title.unwrap_or_default(),
            timestamp,
            app,
            project_id,
            json!({ "eventType": event_type }),
        ));
    }
}

/// Render a float the way JS prints it for the title (drops a trailing `.0`,
/// keeps one decimal otherwise). `1` not `1.0`, `1.5` stays `1.5`.
fn js_num_to_string(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{}", n as i64)
    } else {
        // Math.round(x*10)/10 yields at most one decimal place.
        let s = format!("{}", n);
        s
    }
}

/// getTimeline(app, projectId, startDate?, endDate?) -> TimelineData.
fn get_timeline(
    conn: &Connection,
    app: &str,
    project_id: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Value {
    let mut events: Vec<Value> = Vec::new();
    let mut project_name = project_id.to_string();

    gather_versions(
        conn,
        app,
        project_id,
        start_date,
        end_date,
        &mut events,
        &mut project_name,
    );
    gather_links(conn, app, project_id, &mut events);
    gather_labels(conn, app, project_id, &mut events);
    gather_times(conn, app, project_id, &mut events);
    gather_activities(conn, app, project_id, start_date, end_date, &mut events);

    // events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    events.sort_by(|a, b| {
        let ta = ts_string(a.get("timestamp").unwrap_or(&Value::Null));
        let tb = ts_string(b.get("timestamp").unwrap_or(&Value::Null));
        ta.cmp(&tb)
    });

    let (start, end) = if events.is_empty() {
        (json!(""), json!(""))
    } else {
        (
            events[0].get("timestamp").cloned().unwrap_or(json!("")),
            events[events.len() - 1]
                .get("timestamp")
                .cloned()
                .unwrap_or(json!("")),
        )
    };

    json!({
        "events": events,
        "range": { "start": start, "end": end },
        "projectName": project_name,
    })
}

/// getProjectEvents(app, projectId, eventType, limit=100) -> TimelineEvent[].
fn get_project_events(
    conn: &Connection,
    app: &str,
    project_id: &str,
    event_type: &str,
    limit: usize,
) -> Value {
    let timeline = get_timeline(conn, app, project_id, None, None);
    let events = timeline
        .get("events")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let filtered: Vec<Value> = events
        .into_iter()
        .filter(|e| e.get("type").and_then(|v| v.as_str()) == Some(event_type))
        .take(limit)
        .collect();
    json!(filtered)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "project-timeline:get" => {
            let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let start_date = args.get(2).and_then(|v| v.as_str());
            let end_date = args.get(3).and_then(|v| v.as_str());
            get_timeline(conn, app, project_id, start_date, end_date)
        }
        "project-timeline:getByType" => {
            let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let event_type = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
            // limit defaults to 100 (TS default param).
            let limit = args.get(3).and_then(|v| v.as_i64()).unwrap_or(100);
            let limit = if limit < 0 { 0 } else { limit as usize };
            get_project_events(conn, app, project_id, event_type, limit)
        }
        _ => Value::Null,
    }
}
