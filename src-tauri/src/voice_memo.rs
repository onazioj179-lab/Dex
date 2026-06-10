// =============================================================================
// DEX 6.0 — Voice Memo (Tauri port of src/main/core/VoiceMemoManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed voice memos (voice-memo:* channels), reading/writing the
//! shared `dex.db` `voice_memos` table with the identical schema, queries, and
//! return shapes as the Electron manager (Feature 17). Fully ported: `save`
//! decodes the base64 audio payload (the channel already carries base64 over
//! IPC) and writes the `.opus` file under `data_dir/voice-memos` (the Tauri
//! analog of Electron's userData), then inserts and returns the VoiceMemo
//! shape; `isWhisperAvailable` probes `data_dir/whisper/whisper.wasm` exactly
//! as the TS does. Whisper transcription itself is an async background step in
//! Electron that only runs when whisper.wasm is present; memos save with
//! transcription '' / transcribed 0 either way, which is the shape returned
//! here. The dispatcher passes the app data dir in alongside the connection.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::path::Path;

/// Create the voice_memos table + index (matches VoiceMemoManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS voice_memos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            parent_type TEXT NOT NULL,
            parent_id TEXT NOT NULL,
            filepath TEXT NOT NULL,
            duration_ms INTEGER DEFAULT 0,
            transcription TEXT DEFAULT '',
            transcribed INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_voice_memos_parent ON voice_memos(app, parent_type, parent_id);",
    );
    // Note: `recycle_bin` (written by deleteMemo) is owned + created by the
    // recycle_bin module; the TS wraps that insert in try/catch and treats it as
    // non-critical, so we do NOT re-create it here and degrade if it is absent.
}

/// One row -> the VoiceMemo shape (snake_case keys, exactly as `SELECT *`
/// returned it under Electron's better-sqlite3; column order matches the table
/// definition above).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "parent_type": row.get::<_, String>(2)?,
        "parent_id": row.get::<_, String>(3)?,
        "filepath": row.get::<_, String>(4)?,
        "duration_ms": row.get::<_, i64>(5)?,
        "transcription": row.get::<_, String>(6)?,
        "transcribed": row.get::<_, i64>(7)?,
        "created_at": row.get::<_, i64>(8)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, app, parent_type, parent_id, filepath, duration_ms, transcription, transcribed, created_at FROM voice_memos";

fn query_list(conn: &Connection, sql: &str, p: Vec<SqlValue>) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// voice-memo:getForParent — getMemosForParent(app, parentType, parentId).
/// Returns VoiceMemo[] ordered newest-first.
fn get_for_parent(conn: &Connection, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let sql = format!(
        "{} WHERE app = ? AND parent_type = ? AND parent_id = ? ORDER BY created_at DESC",
        SELECT_COLS
    );
    query_list(
        conn,
        &sql,
        vec![SqlValue::Text(s(0)), SqlValue::Text(s(1)), SqlValue::Text(s(2))],
    )
}

/// voice-memo:getAll — getAllMemos(). Returns VoiceMemo[] ordered newest-first.
fn get_all(conn: &Connection) -> Value {
    let sql = format!("{} ORDER BY created_at DESC", SELECT_COLS);
    query_list(conn, &sql, Vec::new())
}

/// voice-memo:getCount — getMemoCount(). Returns the row count (number).
fn get_count(conn: &Connection) -> Value {
    let cnt: i64 = conn
        .query_row("SELECT COUNT(*) FROM voice_memos", [], |r| r.get(0))
        .unwrap_or(0);
    json!(cnt)
}

/// voice-memo:updateTranscription — updateTranscription(memoId, transcription).
/// Void in Electron; report success.
fn update_transcription(conn: &Connection, args: &Value) -> Value {
    let memo_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
    let transcription = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let _ = conn.execute(
        "UPDATE voice_memos SET transcription = ?, transcribed = 1 WHERE id = ?",
        params![transcription, memo_id],
    );
    json!({ "success": true })
}

/// voice-memo:delete — deleteMemo(memoId). Returns boolean: false when the memo
/// doesn't exist, otherwise deletes the row and returns true. Best-effort logs
/// the deletion into recycle_bin (non-critical; degrades if the table is
/// absent), mirroring the TS try/catch. The on-disk audio file removal is a
/// native concern not handled in this DB layer.
fn delete_memo(conn: &Connection, args: &Value) -> Value {
    let memo_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);

    // Load the memo first; absent -> false (matches `if (!memo) return false`).
    let sql = format!("{} WHERE id = ?", SELECT_COLS);
    let memo = match conn.query_row(&sql, params![memo_id], row_to_json) {
        Ok(v) => v,
        Err(_) => return json!(false),
    };

    // Best-effort recycle_bin entry (non-critical; gated on the audio file
    // existing on disk and any error swallowed, exactly as the TS try/catch).
    let app = memo.get("app").and_then(|v| v.as_str()).unwrap_or("");
    let filepath = memo.get("filepath").and_then(|v| v.as_str()).unwrap_or("");
    let parent_id = memo.get("parent_id").and_then(|v| v.as_str()).unwrap_or("");
    if std::path::Path::new(filepath).exists() {
        let now = now_ms();
        let expires_at = now + 30 * 86400000;
        let item_name = format!("Voice Memo {}", memo_id);
        let item_data = json!({ "filepath": filepath, "parent_id": parent_id }).to_string();
        let _ = conn.execute(
            "INSERT INTO recycle_bin (app, item_type, item_name, item_data, original_location, deleted_at, expires_at)
             VALUES (?, 'voice-memo', ?, ?, ?, ?, ?)",
            params![app, item_name, item_data, filepath, now, expires_at],
        );
    }

    let _ = conn.execute("DELETE FROM voice_memos WHERE id = ?", params![memo_id]);
    json!(true)
}

/// Current wall-clock time in epoch milliseconds (mirrors Date.now()).
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// voice-memo:save — saveMemo(appName, parentType, parentId, audioBase64,
/// durationMs). Decodes the audio, writes `memo_<now>_<rand>.opus` under the
/// memos dir, inserts the metadata row, and returns the VoiceMemo shape —
/// null on any decode/write/insert failure (the TS catch path).
fn save_memo(conn: &Connection, data_dir: &Path, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let parent_type = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let parent_id = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
    let audio_b64 = args.get(3).and_then(|v| v.as_str()).unwrap_or("");
    let duration_ms = args.get(4).and_then(|v| v.as_i64()).unwrap_or(0);

    let audio = match BASE64.decode(audio_b64) {
        Ok(a) => a,
        Err(_) => return Value::Null,
    };
    let memos_dir = data_dir.join("voice-memos");
    if std::fs::create_dir_all(&memos_dir).is_err() {
        return Value::Null;
    }
    let now = now_ms();
    let filename = format!("memo_{}_{}.opus", now, rand_suffix());
    let filepath = memos_dir.join(filename);
    if std::fs::write(&filepath, &audio).is_err() {
        return Value::Null;
    }
    let filepath_str = filepath.to_string_lossy().to_string();
    let inserted = conn.execute(
        "INSERT INTO voice_memos (app, parent_type, parent_id, filepath, duration_ms, transcription, transcribed, created_at) \
         VALUES (?, ?, ?, ?, ?, '', 0, ?)",
        params![app, parent_type, parent_id, filepath_str, duration_ms, now],
    );
    if inserted.is_err() {
        return Value::Null;
    }
    json!({
        "id": conn.last_insert_rowid(),
        "app": app,
        "parent_type": parent_type,
        "parent_id": parent_id,
        "filepath": filepath_str,
        "duration_ms": duration_ms,
        "transcription": "",
        "transcribed": 0,
        "created_at": now,
    })
}

/// Six base36 chars from clock+pid entropy — the filename collision guard the
/// TS gets from Math.random().toString(36).substring(2, 8). Uniqueness within
/// one process-millisecond is all that is required.
fn rand_suffix() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut z = nanos ^ ((std::process::id() as u64) << 33);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    (0..6)
        .map(|_| {
            let d = DIGITS[(z % 36) as usize] as char;
            z /= 36;
            d
        })
        .collect()
}

pub fn dispatch(conn: &Connection, data_dir: &Path, channel: &str, args: &Value) -> Value {
    match channel {
        "voice-memo:save" => save_memo(conn, data_dir, args),
        "voice-memo:getForParent" => get_for_parent(conn, args),
        "voice-memo:getAll" => get_all(conn),
        "voice-memo:updateTranscription" => update_transcription(conn, args),
        "voice-memo:delete" => delete_memo(conn, args),
        // isWhisperAvailable() — probe for whisper.wasm under the app data dir,
        // exactly the path the TS checks (userData/whisper/whisper.wasm).
        "voice-memo:isWhisperAvailable" => {
            json!(data_dir.join("whisper").join("whisper.wasm").exists())
        }
        "voice-memo:getCount" => get_count(conn),
        _ => Value::Null,
    }
}
