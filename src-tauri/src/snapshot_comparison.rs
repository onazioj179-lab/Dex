// =============================================================================
// DEX 6.0 — Snapshot Comparison (Tauri port of src/main/core/SnapshotComparisonManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Side-by-side diff of any two version-history snapshots (snapshot-comparison:*
//! channels), reading the shared `dex.db` `version_history` table (owned/created
//! by DatabaseManager) with identical queries and return shapes as the Electron
//! manager (Feature 7). All three handlers — `getSnapshot`, `compare`, and
//! `restore` — are DB-backed and ported faithfully here: snapshot persistence/
//! retrieval and the pure object-flatten/diff logic over stored snapshot JSON.
//! The Electron `initialize(mainWindow)` BrowserWindow wiring is an internal
//! Electron concern (not an IPC channel) and is not part of this surface.

use rusqlite::{params, Connection};
use serde_json::{json, Map, Value};

/// The `version_history` table is created by DatabaseManager (db.rs callers run
/// each subsystem's ensure_schema). Mirror it here as CREATE TABLE IF NOT EXISTS
/// + indexes (copied verbatim from DatabaseManager.ts) so the schema is present
/// even if this subsystem ensures first.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS version_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            snapshot BLOB NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            timestamp INTEGER NOT NULL,
            auto_saved INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_version_history_project ON version_history(app, project_id);
        CREATE INDEX IF NOT EXISTS idx_version_history_timestamp ON version_history(timestamp);",
    );
}

/// getSnapshot(snapshotId) -> the re-mapped snapshot object or null.
///
/// Matches the TS shape EXACTLY: id, app, project_id, project_name, timestamp,
/// auto_saved (snake_case, as the TS object literal uses), plus `data` = the
/// parsed snapshot JSON.
///
/// The `snapshot` column is a zlib BLOB written by DatabaseManager via Node
/// `zlib.deflateSync(JSON.stringify(state))`, so it must be inflated before
/// parsing — decoding the BLOB bytes directly as UTF-8/JSON (as the TS literally
/// does) garbles the compressed stream. We inflate via crate::compress (the
/// byte-compatible mirror of `zlib.inflateSync(...).toString()`) and then
/// JSON.parse the result. On JSON parse failure we fall back to
/// `{ raw: <inflated string> }`, mirroring the TS catch's `{ raw: ... }` shape;
/// if inflate itself fails we degrade to a lossy UTF-8 view of the raw bytes
/// (matching the TS `String(row.snapshot)` last-resort behaviour).
fn get_snapshot(conn: &Connection, snapshot_id: i64) -> Value {
    // SELECT * column order under the table def: id, app, project_id,
    // project_name, snapshot, size, timestamp, auto_saved.
    let sql = "SELECT id, app, project_id, project_name, snapshot, size, timestamp, auto_saved \
               FROM version_history WHERE id = ?";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };

    // Read the snapshot BLOB as raw bytes; it is a zlib stream that must be
    // inflated (see fn doc) before being decoded/parsed as JSON.
    let row = stmt.query_row(params![snapshot_id], |r| {
        Ok((
            r.get::<_, i64>(0)?,           // id
            r.get::<_, String>(1)?,        // app
            r.get::<_, String>(2)?,        // project_id
            r.get::<_, String>(3)?,        // project_name
            r.get::<_, Vec<u8>>(4)?,       // snapshot (BLOB)
            r.get::<_, i64>(6)?,           // timestamp
            r.get::<_, Option<i64>>(7)?,   // auto_saved (DEFAULT 0, nullable col)
        ))
    });

    let (id, app, project_id, project_name, snapshot_bytes, timestamp, auto_saved) = match row {
        Ok(t) => t,
        Err(_) => return Value::Null,
    };

    // Inflate the zlib BLOB to the original JSON text (the bytes the Electron
    // side fed to JSON.stringify before compressing). If inflate fails the BLOB
    // is not a valid zlib stream, so degrade to a lossy UTF-8 view of the raw
    // bytes — the same last-resort string the TS `String(row.snapshot)` yields.
    let raw = crate::compress::inflate_to_string(&snapshot_bytes)
        .unwrap_or_else(|| String::from_utf8_lossy(&snapshot_bytes).into_owned());
    let data = match serde_json::from_str::<Value>(&raw) {
        Ok(v) => v,
        Err(_) => json!({ "raw": raw }),
    };

    json!({
        "id": id,
        "app": app,
        "project_id": project_id,
        "project_name": project_name,
        "timestamp": timestamp,
        // auto_saved: Electron returns the raw column value (0/1 integer, or null
        // if the column is null). Preserve it as-is.
        "auto_saved": match auto_saved { Some(v) => json!(v), None => Value::Null },
        "data": data,
    })
}

/// JS `JSON.stringify(x)` for equality comparison of two flattened scalar values.
/// serde_json's compact serialization matches JSON.stringify for the scalar/array
/// values that survive flattening; `undefined` cannot reach here (flatten only
/// keeps non-object/array leaves and array elements). Used purely for equality.
fn stable_stringify(v: &Value) -> String {
    serde_json::to_string(v).unwrap_or_default()
}

/// Reproduces SnapshotComparisonManager.flattenObject EXACTLY:
/// - null/undefined -> {}
/// - non-object (scalar) -> { (prefix || 'value'): obj }
/// - array -> recurse with `prefix[i]` keys
/// - object -> recurse into nested objects with `prefix.key`, scalar leaves kept
fn flatten_object(obj: &Value, prefix: &str, result: &mut Map<String, Value>) {
    match obj {
        // null (TS treats null AND undefined as empty; JSON has no undefined).
        Value::Null => {}
        // Non-object scalar (string/number/bool).
        Value::String(_) | Value::Number(_) | Value::Bool(_) => {
            let key = if prefix.is_empty() { "value".to_string() } else { prefix.to_string() };
            result.insert(key, obj.clone());
        }
        Value::Array(arr) => {
            for (i, item) in arr.iter().enumerate() {
                let key = if prefix.is_empty() {
                    format!("[{}]", i)
                } else {
                    format!("{}[{}]", prefix, i)
                };
                flatten_object(item, &key, result);
            }
        }
        Value::Object(map) => {
            for (k, v) in map {
                let key = if prefix.is_empty() {
                    k.clone()
                } else {
                    format!("{}.{}", prefix, k)
                };
                // `v !== null && typeof v === 'object'` -> recurse; else keep leaf.
                match v {
                    Value::Object(_) | Value::Array(_) => flatten_object(v, &key, result),
                    _ => {
                        result.insert(key, v.clone());
                    }
                }
            }
        }
    }
}

fn flatten(obj: &Value) -> Map<String, Value> {
    let mut result = Map::new();
    flatten_object(obj, "", &mut result);
    result
}

/// Sort rank for a FieldDiff type: changed=0, added=1, removed=2, unchanged=3.
fn type_order(t: &str) -> i32 {
    match t {
        "changed" => 0,
        "added" => 1,
        "removed" => 2,
        "unchanged" => 3,
        _ => 4,
    }
}

/// Reproduces computeDiff: flatten both sides, walk the union of keys, classify
/// each as changed/added/removed/unchanged, tally totals, then stable-sort by
/// type rank. Returns the SnapshotDiff shape (camelCase fields).
///
/// Key-ordering note: the union of keys is built from leftFlat keys then
/// rightFlat keys (insertion order, like `new Set([...left, ...right])`), and
/// Array.prototype.sort in V8 is stable — so the final order is: ties keep the
/// union insertion order. serde_json::Map preserves insertion order (preserve_order)
/// or sorts (btreemap). We build the key list explicitly to guarantee union
/// insertion order regardless of Map backing, and use a stable sort.
fn compute_diff(left_data: &Value, right_data: &Value) -> Value {
    let left_flat = flatten(left_data);
    let right_flat = flatten(right_data);

    // Union of keys in insertion order: left keys first, then right-only keys.
    let mut all_keys: Vec<String> = Vec::new();
    for k in left_flat.keys() {
        all_keys.push(k.clone());
    }
    for k in right_flat.keys() {
        if !left_flat.contains_key(k) {
            all_keys.push(k.clone());
        }
    }

    let mut fields: Vec<Value> = Vec::new();
    let mut total_changed: i64 = 0;
    let mut total_added: i64 = 0;
    let mut total_removed: i64 = 0;

    for key in &all_keys {
        let in_left = left_flat.contains_key(key);
        let in_right = right_flat.contains_key(key);

        if in_left && in_right {
            let left_val = &left_flat[key];
            let right_val = &right_flat[key];
            let same = stable_stringify(left_val) == stable_stringify(right_val);
            fields.push(json!({
                "key": key,
                "type": if same { "unchanged" } else { "changed" },
                "leftValue": left_val,
                "rightValue": right_val,
            }));
            if !same {
                total_changed += 1;
            }
        } else if in_left && !in_right {
            // rightValue is `undefined` in TS -> dropped by structured clone over
            // the IPC boundary, so the key is omitted here (matches Electron).
            fields.push(json!({
                "key": key,
                "type": "removed",
                "leftValue": &left_flat[key],
            }));
            total_removed += 1;
        } else {
            // leftValue is `undefined` in TS -> omitted (see above).
            fields.push(json!({
                "key": key,
                "type": "added",
                "rightValue": &right_flat[key],
            }));
            total_added += 1;
        }
    }

    // Stable sort by type rank (V8 Array.sort is stable).
    fields.sort_by(|a, b| {
        let oa = type_order(a.get("type").and_then(|v| v.as_str()).unwrap_or(""));
        let ob = type_order(b.get("type").and_then(|v| v.as_str()).unwrap_or(""));
        oa.cmp(&ob)
    });

    json!({
        "totalChanged": total_changed,
        "totalAdded": total_added,
        "totalRemoved": total_removed,
        "fields": fields,
    })
}

/// compare(leftId, rightId) -> SnapshotDiff. When either snapshot is missing
/// (null), returns the empty diff shape (matches the TS early return).
fn compare_snapshots(conn: &Connection, left_id: i64, right_id: i64) -> Value {
    let left = get_snapshot(conn, left_id);
    let right = get_snapshot(conn, right_id);

    if left.is_null() || right.is_null() {
        return json!({
            "totalChanged": 0,
            "totalAdded": 0,
            "totalRemoved": 0,
            "fields": [],
        });
    }

    let left_data = left.get("data").cloned().unwrap_or(Value::Null);
    let right_data = right.get("data").cloned().unwrap_or(Value::Null);
    compute_diff(&left_data, &right_data)
}

/// restore(snapshotId) -> the snapshot object (same shape as getSnapshot), or
/// null when the snapshot is missing. Side effect: before returning, it captures
/// the CURRENT latest snapshot for the same (app, project_id) and inserts it as a
/// fresh non-auto-saved row (a backup-before-restore), exactly as the TS does.
fn restore_snapshot(conn: &Connection, snapshot_id: i64) -> Value {
    let snapshot = get_snapshot(conn, snapshot_id);
    if snapshot.is_null() {
        return Value::Null;
    }

    let app = snapshot.get("app").and_then(|v| v.as_str()).unwrap_or("");
    let project_id = snapshot.get("project_id").and_then(|v| v.as_str()).unwrap_or("");
    let project_name = snapshot.get("project_name").and_then(|v| v.as_str()).unwrap_or("");

    // Date.now() in milliseconds.
    let now: i64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    // Fetch the current latest snapshot's raw BLOB + size for this project. The
    // BLOB is copied verbatim (BLOB-to-BLOB) into the backup row below — we never
    // decode it, so it stays in the exact zlib format DatabaseManager wrote and
    // no inflate/deflate is needed here (matches the TS `currentRow.snapshot`).
    // Bind results before any further query/return (rusqlite borrow discipline).
    let current = {
        let sql = "SELECT snapshot, size FROM version_history \
                   WHERE app = ? AND project_id = ? ORDER BY timestamp DESC LIMIT 1";
        let mut stmt = match conn.prepare(sql) {
            Ok(s) => s,
            Err(_) => return snapshot,
        };
        stmt.query_row(params![app, project_id], |r| {
            Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, Option<i64>>(1)?))
        })
        .ok()
    };

    if let Some((cur_snapshot, cur_size)) = current {
        let size = cur_size.unwrap_or(0); // currentRow.size || 0
        let _ = conn.execute(
            "INSERT INTO version_history (app, project_id, project_name, snapshot, size, timestamp, auto_saved)
             VALUES (?, ?, ?, ?, ?, ?, 0)",
            params![app, project_id, project_name, cur_snapshot, size, now],
        );
    }

    snapshot
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // compare(leftId, rightId)
        "snapshot-comparison:compare" => {
            let left_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let right_id = args.get(1).and_then(|v| v.as_i64()).unwrap_or(0);
            compare_snapshots(conn, left_id, right_id)
        }
        // getSnapshot(snapshotId)
        "snapshot-comparison:getSnapshot" => {
            let snapshot_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            get_snapshot(conn, snapshot_id)
        }
        // restore(snapshotId)
        "snapshot-comparison:restore" => {
            let snapshot_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            restore_snapshot(conn, snapshot_id)
        }
        _ => Value::Null,
    }
}
