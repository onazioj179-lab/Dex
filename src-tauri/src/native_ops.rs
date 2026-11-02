// =============================================================================
// DEX 6.0 — Native command layer (Tauri port)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Native implementations of channels that are NOT pure-DB: things that need the
//! OS/UI (file pickers, notification toasts) and therefore the Tauri `AppHandle`,
//! which the pure-`dispatch(conn, ...)` subsystem modules don't have. These are
//! invoked from `dex_ipc` in main.rs (which holds the app handle) for specific
//! channels. Uses the official Tauri v2 plugins (`tauri-plugin-dialog`,
//! `tauri-plugin-notification`) — not raw blocking crates — to avoid the
//! event-loop deadlock the migration notes warn about. Sync command bodies run
//! on a Tauri worker thread, so the `blocking_*` dialog calls are safe here.

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_notification::NotificationExt;

/// Epoch millis (mirrors Date.now()).
pub(crate) fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Run a closure with the shared dex.db connection. Degrades to `null` when the
/// DB is unavailable (same as db_dispatch), so fs ops never panic on a missing DB.
pub(crate) fn with_conn<F: FnOnce(&Connection) -> Value>(app: &tauri::AppHandle, f: F) -> Value {
    let state = app.state::<crate::db::DbState>();
    let guard = match state.lock() {
        Ok(g) => g,
        Err(_) => return Value::Null,
    };
    match guard.as_ref() {
        Some(c) => f(c),
        None => Value::Null,
    }
}

/// Convert a picked `FilePath` to a filesystem path string (drops non-path URLs).
pub(crate) fn fp_to_string(p: FilePath) -> Option<String> {
    p.into_path().ok().map(|pb| pb.to_string_lossy().to_string())
}

/// `dialog:showOpenDialog` / `files:openDialog` — native open picker.
/// Mirrors Electron `dialog.showOpenDialog`: takes an options object
/// ({ properties: [...], filters: [{name, extensions}], defaultPath }) and
/// returns `{ canceled: bool, filePaths: string[] }`.
pub fn show_open_dialog(app: &tauri::AppHandle, args: &Value) -> Value {
    let opts = args.get(0).cloned().unwrap_or(Value::Null);
    let props: Vec<String> = opts
        .get("properties")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let want_dir = props.iter().any(|p| p == "openDirectory");
    let multi = props.iter().any(|p| p == "multiSelections");

    let mut builder = app.dialog().file();
    if let Some(dp) = opts.get("defaultPath").and_then(|v| v.as_str()) {
        if !dp.is_empty() {
            builder = builder.set_directory(dp);
        }
    }
    // Electron filters: [{ name, extensions: ["png","jpg"] }] (no leading dot).
    if let Some(filters) = opts.get("filters").and_then(|v| v.as_array()) {
        for f in filters {
            let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let exts: Vec<&str> = f
                .get("extensions")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str()).collect())
                .unwrap_or_default();
            if !exts.is_empty() {
                builder = builder.add_filter(name, &exts);
            }
        }
    }

    let paths: Vec<String> = match (want_dir, multi) {
        (true, true) => builder
            .blocking_pick_folders()
            .map(|v| v.into_iter().filter_map(fp_to_string).collect())
            .unwrap_or_default(),
        (true, false) => builder
            .blocking_pick_folder()
            .and_then(fp_to_string)
            .map(|p| vec![p])
            .unwrap_or_default(),
        (false, true) => builder
            .blocking_pick_files()
            .map(|v| v.into_iter().filter_map(fp_to_string).collect())
            .unwrap_or_default(),
        (false, false) => builder
            .blocking_pick_file()
            .and_then(fp_to_string)
            .map(|p| vec![p])
            .unwrap_or_default(),
    };

    json!({ "canceled": paths.is_empty(), "filePaths": paths })
}

/// Fire an OS notification toast (best-effort, additive). Used after the DB
/// insert for `notification-center:send` so the renderer's notification center
/// (DB-backed) AND the OS surface both reflect the notification, matching the
/// Electron behaviour where `send` also raised a native `Notification`.
pub fn notify(app: &tauri::AppHandle, title: &str, body: &str) {
    notify_with_sound(app, title, body, false);
}

/// Like [`notify`], optionally with the Windows default notification sound.
/// Without a sound the toast is silent: the WinRT toast writer emits
/// `<audio silent="true"/>` when no sound is set, so Settings > Notifications >
/// Sound has to opt in here explicitly.
pub fn notify_with_sound(app: &tauri::AppHandle, title: &str, body: &str, sound: bool) {
    let mut b = app.notification().builder();
    if !title.is_empty() {
        b = b.title(title);
    }
    if !body.is_empty() {
        b = b.body(body);
    }
    if sound {
        b = b.sound("Default");
    }
    let _ = b.show();
}

/// Push one renderer event — the Tauri analog of Electron's
/// `mainWindow.webContents.send(channel, payload)`. The tauriCompat bridge
/// subscribes with `dex.on(channel, cb)` and hands the payload to the callback.
/// One payload value per event, exactly like the webContents.send call sites.
pub fn emit_event(app: &tauri::AppHandle, channel: &str, payload: &Value) {
    use tauri::Emitter;
    let _ = app.emit(channel, payload);
}

// --- OS accent color (theme:getSystemAccentColor parity) -------------------

/// Read the OS accent color as `#RRGGBB`, mirroring Electron's
/// `theme:getSystemAccentColor`. On Windows the DWM accent is a REG_DWORD in
/// ABGR order (0xAABBGGRR) at `HKCU\SOFTWARE\Microsoft\Windows\DWM\AccentColor`;
/// read it with `reg query` (always-present tool, no new dependency) and swizzle
/// to `#RRGGBB`. Other platforms have no portable no-dep source -> `null`
/// (honest degrade), matching the renderer's "fall back to the configured
/// accent" path.
pub fn system_accent_color() -> Value {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        let out = Command::new("reg")
            .args([
                "query",
                r"HKCU\SOFTWARE\Microsoft\Windows\DWM",
                "/v",
                "AccentColor",
            ])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output();
        if let Ok(o) = out {
            let text = String::from_utf8_lossy(&o.stdout);
            // Line shape: "    AccentColor    REG_DWORD    0xaabbggrr"
            for tok in text.split_whitespace() {
                let hex = tok.strip_prefix("0x").or_else(|| tok.strip_prefix("0X"));
                if let Some(hex) = hex {
                    if let Ok(v) = u32::from_str_radix(hex, 16) {
                        let r = v & 0xFF;
                        let g = (v >> 8) & 0xFF;
                        let b = (v >> 16) & 0xFF;
                        return Value::String(format!("#{:02X}{:02X}{:02X}", r, g, b));
                    }
                }
            }
        }
        Value::Null
    }
    #[cfg(not(windows))]
    {
        Value::Null
    }
}

// --- Media library import (filesystem stat + insert) -----------------------

/// detectType by extension (matches SharedMediaLibrary VIDEO/AUDIO/IMAGE sets;
/// everything else -> "document").
pub(crate) fn detect_media_type(filepath: &str) -> &'static str {
    let ext = std::path::Path::new(filepath)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        .unwrap_or_default();
    const VIDEO: &[&str] = &[".mp4", ".mkv", ".avi", ".mov", ".webm", ".wmv", ".flv", ".m4v"];
    const AUDIO: &[&str] = &[".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".opus"];
    const IMAGE: &[&str] = &[".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".tiff", ".ico"];
    if VIDEO.contains(&ext.as_str()) {
        "video"
    } else if AUDIO.contains(&ext.as_str()) {
        "audio"
    } else if IMAGE.contains(&ext.as_str()) {
        "image"
    } else {
        "document"
    }
}

// --- Changelog export (render markdown -> save dialog -> write) ------------

/// `changelog:export` — exportChangelog(startDate, endDate): render the markdown
/// (native), prompt a save dialog, write the file. Returns the chosen path
/// string, or null on cancel/failure (matching the TS `string | null`).
pub fn changelog_export(app: &tauri::AppHandle, args: &Value) -> Value {
    let start = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let end = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let markdown = with_conn(app, |conn| {
        crate::changelog::dispatch(conn, "changelog:renderMarkdown", args)
    });
    let md = markdown.as_str().unwrap_or("").to_string();

    let default_name = format!("changelog-{}-to-{}.md", start, end);
    let picked = app
        .dialog()
        .file()
        .set_title("Export Personal Changelog")
        .set_file_name(default_name)
        .add_filter("Markdown", &["md"])
        .add_filter("Text", &["txt"])
        .blocking_save_file();
    let path = match picked.and_then(fp_to_string) {
        Some(p) => p,
        None => return Value::Null,
    };
    match std::fs::write(&path, md.as_bytes()) {
        Ok(()) => json!(path),
        Err(_) => Value::Null,
    }
}

// --- Notes attachments (copy file in / unlink / open with OS) --------------
// Mirrors NotesManager: attachments live under <appData>/notes-data/attachments
// as `<uuid><ext>`; rows in note_attachments; open uses the OS default handler.

fn attachments_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("notes-data")
        .join("attachments");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// `dexnotes:pick-attachment-file` / `dexnotes:pick-import-file` — open the native
/// file picker and return `{ filePath }` (or null on cancel). The renderer then
/// copies/imports via the already-native `dexnotes:addAttachment` / importFile.
/// (Electron had no handler for these; this implements the feature for Tauri from
/// the renderer contract in DexNotes.tsx, which reads `result.filePath`.)
pub fn note_pick_file(app: &tauri::AppHandle) -> Value {
    match app.dialog().file().blocking_pick_file().and_then(fp_to_string) {
        Some(p) => json!({ "filePath": p }),
        None => Value::Null,
    }
}

/// detectFileType for a note attachment (ext includes the leading dot).
fn note_attachment_type(ext: &str) -> &'static str {
    const IMAGE: &[&str] = &[".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico"];
    const VIDEO: &[&str] = &[".mp4", ".webm", ".mov", ".avi", ".mkv"];
    const AUDIO: &[&str] = &[".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"];
    const DOC: &[&str] = &[".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods"];
    if IMAGE.contains(&ext) {
        "image"
    } else if VIDEO.contains(&ext) {
        "video"
    } else if AUDIO.contains(&ext) {
        "audio"
    } else if ext == ".pdf" {
        "pdf"
    } else if DOC.contains(&ext) {
        "document"
    } else {
        "file"
    }
}

/// v4-style UUID via SQLite randomblob (same approach as journal.rs / session_replay.rs).
pub(crate) fn gen_uuid(conn: &Connection) -> String {
    let hex: String = conn
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .unwrap_or_else(|_| format!("{:032x}", now_ms() as u128));
    let mut b: Vec<char> = hex.chars().collect();
    while b.len() < 32 {
        b.push('0');
    }
    b[12] = '4';
    b[16] = ['8', '9', 'a', 'b'][(now_ms() as usize) & 3];
    let s: String = b.into_iter().collect();
    format!("{}-{}-{}-{}-{}", &s[0..8], &s[8..12], &s[12..16], &s[16..20], &s[20..32])
}

/// One note_attachments row (SELECT * column order) -> NotesDbAttachment shape.
fn attachment_row(conn: &Connection, id: &str) -> Value {
    conn.query_row(
        "SELECT id, note_id, file_path, file_name, file_type, file_size, thumbnail_path, created_at
         FROM note_attachments WHERE id = ?",
        params![id],
        |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "note_id": r.get::<_, String>(1)?,
                "file_path": r.get::<_, String>(2)?,
                "file_name": r.get::<_, String>(3)?,
                "file_type": r.get::<_, String>(4)?,
                "file_size": r.get::<_, i64>(5)?,
                "thumbnail_path": r.get::<_, Option<String>>(6)?,
                "created_at": r.get::<_, i64>(7)?,
            }))
        },
    )
    .unwrap_or(Value::Null)
}

/// `dexnotes:addAttachment` — addAttachment(noteId, sourcePath): copy the source
/// into the attachments dir (50 MB cap), insert the row, bump the note's
/// updated_at, return the NotesDbAttachment (or null on missing/oversized/copy-fail).
pub fn note_add_attachment(app: &tauri::AppHandle, args: &Value) -> Value {
    let note_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let source = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();

    let src = std::path::Path::new(&source);
    let meta = match std::fs::metadata(src) {
        Ok(m) => m,
        Err(_) => return Value::Null, // !fs.existsSync(sourcePath) -> null
    };
    if meta.len() > 50 * 1024 * 1024 {
        return Value::Null; // 50MB limit
    }
    // path.extname(...).toLowerCase() — includes the leading dot, or "" if none.
    let ext = src
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        .unwrap_or_default();
    let file_name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    with_conn(app, |conn| {
        let att_id = gen_uuid(conn);
        let dest = attachments_dir(app).join(format!("{}{}", att_id, ext));
        if std::fs::copy(src, &dest).is_err() {
            return Value::Null;
        }
        let file_type = note_attachment_type(&ext);
        let now = now_ms();
        let inserted = conn.execute(
            "INSERT INTO note_attachments (id, note_id, file_path, file_name, file_type, file_size, thumbnail_path, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
            params![att_id, note_id, dest.to_string_lossy(), file_name, file_type, meta.len() as i64, now],
        );
        if inserted.is_err() {
            return Value::Null;
        }
        let _ = conn.execute(
            "UPDATE notes SET updated_at = ? WHERE id = ?",
            params![now, note_id],
        );
        attachment_row(conn, &att_id)
    })
}

/// `dexnotes:removeAttachment` — delete the file + row, bump the note. -> { success }.
pub fn note_remove_attachment(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    with_conn(app, |conn| {
        let row: Option<(String, String)> = conn
            .query_row(
                "SELECT file_path, note_id FROM note_attachments WHERE id = ?",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        match row {
            None => json!({ "success": false }),
            Some((file_path, note_id)) => {
                let _ = std::fs::remove_file(&file_path); // ignore — may already be gone
                let _ = conn.execute("DELETE FROM note_attachments WHERE id = ?", params![id]);
                let _ = conn.execute(
                    "UPDATE notes SET updated_at = ? WHERE id = ?",
                    params![now_ms(), note_id],
                );
                json!({ "success": true })
            }
        }
    })
}

/// `dexnotes:openAttachment` — open the attachment with the OS default handler.
pub fn note_open_attachment(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    with_conn(app, |conn| {
        let file_path: Option<String> = conn
            .query_row(
                "SELECT file_path FROM note_attachments WHERE id = ?",
                params![id],
                |r| r.get(0),
            )
            .ok();
        match file_path {
            Some(p) if std::path::Path::new(&p).exists() => {
                let _ = open::that(p);
                json!({ "success": true })
            }
            _ => json!({ "success": false }),
        }
    })
}

// --- Backup (consistent dex.db snapshot via VACUUM INTO + checksum) --------
// `backup:create` snapshots the live dex.db (WAL-safe) to a `.dexbak` file in
// the configured backup dir (or <appData>/backups), records the metadata row,
// and prunes to max_backups. `backup:verify` recomputes the sha256 of the file
// and compares to the stored checksum. `backup:restore` overwrites the live DB
// (closing/reopening the connection) — destructive, so it stays guarded in the
// backup_restore module rather than running from here.

fn backup_dir(app: &tauri::AppHandle, conn: &Connection) -> std::path::PathBuf {
    let configured: String = conn
        .query_row("SELECT backup_path FROM backup_settings WHERE id = 1", [], |r| r.get(0))
        .unwrap_or_default();
    let dir = if configured.trim().is_empty() {
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("backups")
    } else {
        std::path::PathBuf::from(configured)
    };
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Delete backups beyond `max_backups`, oldest first (file + row).
fn prune_old_backups(conn: &Connection) {
    let max: i64 = conn
        .query_row("SELECT max_backups FROM backup_settings WHERE id = 1", [], |r| r.get(0))
        .unwrap_or(10);
    if max <= 0 {
        return;
    }
    let mut stmt = match conn.prepare("SELECT id, filepath FROM backups ORDER BY created_at DESC") {
        Ok(s) => s,
        Err(_) => return,
    };
    let rows: Vec<(String, String)> = match stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))) {
        Ok(rs) => rs.filter_map(|x| x.ok()).collect(),
        Err(_) => return,
    };
    for (id, fp) in rows.into_iter().skip(max as usize) {
        let _ = std::fs::remove_file(&fp);
        let _ = conn.execute("DELETE FROM backups WHERE id = ?", params![id]);
    }
}

/// `backup:create` — createBackup(type='manual', description=''). Returns the
/// BackupRecord (matching the backups row shape + ISO created_at).
pub fn backup_create(app: &tauri::AppHandle, args: &Value) -> Value {
    let btype = args.get(0).and_then(|v| v.as_str()).unwrap_or("manual").to_string();
    let description = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();

    let db_path = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("databases")
        .join("dex.db");

    // --- Snapshot on a SEPARATE connection so the managed mutex (and thus every
    // other DB IPC call) is NOT held during the VACUUM. The restore gate's read
    // side blocks a concurrent backup:restore file-swap while this snapshot
    // connection is open. ---
    let (filename, fp_str, size, checksum, id) = {
        let gate = app.state::<crate::db::DbGate>();
        let _r = gate.read().unwrap_or_else(|e| e.into_inner());
        let conn = match crate::db::open(&db_path) {
            Ok(c) => c,
            Err(_) => return json!({ "success": false, "error": "snapshot open failed" }),
        };
        let dir = backup_dir(app, &conn);
        // timestamp: new Date().toISOString().replace(/[:.]/g,'-').substring(0,19)
        let ts: String = conn
            .query_row("SELECT strftime('%Y-%m-%dT%H-%M-%S', 'now')", [], |r| r.get(0))
            .unwrap_or_default();
        let id = gen_uuid(&conn);
        let filename = format!("dex-backup-{}-{}.dexbak", ts, btype);
        let filepath = dir.join(&filename);
        let fp_str = filepath.to_string_lossy().to_string();

        // VACUUM INTO gives a consistent single-file snapshot of the live WAL db.
        let esc = fp_str.replace('\'', "''");
        if conn.execute_batch(&format!("VACUUM INTO '{}'", esc)).is_err() {
            return json!({ "success": false, "error": "snapshot failed (VACUUM INTO)" });
        }
        let bytes = match std::fs::read(&filepath) {
            Ok(b) => b,
            Err(_) => return json!({ "success": false, "error": "snapshot read-back failed" }),
        };
        (filename, fp_str, bytes.len() as i64, crate::licensing::sha256_hex(&bytes), id)
        // separate `conn` + gate read guard dropped here -> snapshot connection closed
    };

    // --- Record metadata on the managed connection (fast: INSERT + prune). ---
    with_conn(app, |conn| {
        let _ = conn.execute(
            "INSERT INTO backups (id, filename, filepath, size_bytes, type, description, databases, checksum, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            params![id, filename, fp_str, size, btype, description, "[\"dex.db\"]", checksum],
        );
        if btype == "automatic" {
            let _ = conn.execute(
                "UPDATE backup_settings SET last_auto_backup = datetime('now') WHERE id = 1",
                [],
            );
        }
        prune_old_backups(conn);

        let created_at: String = conn
            .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |r| r.get(0))
            .unwrap_or_default();
        json!({
            "id": id,
            "filename": filename,
            "filepath": fp_str,
            "size_bytes": size,
            "type": btype,
            "description": description,
            "databases": ["dex.db"],
            "checksum": checksum,
            "created_at": created_at,
        })
    })
}

/// `backup:restore` — restoreBackup(backupId, selectedDatabases?). Our `.dexbak`
/// is a VACUUM INTO SQLite snapshot, so restore = verify checksum -> take a
/// pre-restore safety backup -> close the live connection -> atomically swap the
/// snapshot over dex.db (removing stale WAL/SHM) -> reopen + re-ensure schemas.
/// On any swap/reopen failure the previous dex.db is left intact and reopened, so
/// a failed restore never loses data. Returns { success, restoredDatabases, errors }.
pub fn backup_restore(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let fail = |e: &str| json!({ "success": false, "restoredDatabases": [], "errors": [e] });

    // 1. Look up the backup row (filepath + checksum).
    let lookup = with_conn(app, |conn| {
        conn.query_row(
            "SELECT filepath, checksum FROM backups WHERE id = ?",
            params![id],
            |r| Ok(json!({ "filepath": r.get::<_, String>(0)?, "checksum": r.get::<_, String>(1)? })),
        )
        .unwrap_or(Value::Null)
    });
    if lookup.is_null() {
        return fail("Backup not found");
    }
    let filepath = lookup.get("filepath").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let checksum = lookup.get("checksum").and_then(|v| v.as_str()).unwrap_or("").to_string();

    // 2. Verify the file checksum before touching anything.
    if !std::path::Path::new(&filepath).exists() {
        return fail("Backup file not found");
    }
    let bytes = match std::fs::read(&filepath) {
        Ok(b) => b,
        Err(_) => return fail("Could not read backup file"),
    };
    if crate::licensing::sha256_hex(&bytes) != checksum {
        return fail("Checksum mismatch — backup is corrupt; restore aborted");
    }

    // 3. Pre-restore safety backup (locks+releases the db before we take it down).
    let _ = backup_create(app, &json!(["pre_restore", "Pre-restore safety backup"]));

    // 4-6. Swap under the db lock so no other op runs mid-restore.
    let db_path = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("databases")
        .join("dex.db");
    // Take the restore gate's WRITE side first: this blocks until any out-of-band
    // dex.db connection (e.g. an in-flight backup VACUUM snapshot) has closed, so
    // the file swap below can't race an open handle. Held until the function ends.
    let gate = app.state::<crate::db::DbGate>();
    let _w = gate.write().unwrap_or_else(|e| e.into_inner());

    let state = app.state::<crate::db::DbState>();
    let mut guard = match state.lock() {
        Ok(g) => g,
        Err(_) => return fail("database busy"),
    };
    // Close the live connection (drops it) so the file can be replaced on Windows.
    let _ = guard.take();

    let mut errors: Vec<String> = Vec::new();
    let tmp = db_path.with_extension("restore-tmp");
    if let Err(e) = std::fs::copy(&filepath, &tmp) {
        errors.push(format!("Failed to stage snapshot: {}", e));
    } else if let Err(e) = std::fs::rename(&tmp, &db_path) {
        errors.push(format!("Failed to swap database: {}", e));
        let _ = std::fs::remove_file(&tmp);
    } else {
        // Snapshot is now dex.db — drop the stale WAL/SHM of the old db.
        let _ = std::fs::remove_file(db_path.with_file_name("dex.db-wal"));
        let _ = std::fs::remove_file(db_path.with_file_name("dex.db-shm"));
    }

    // Reopen (the swapped snapshot on success, or the untouched old db on failure)
    // and re-ensure all schemas, then restore the managed connection.
    match crate::db::open(&db_path) {
        Ok(conn) => {
            crate::ensure_all_schemas(&conn);
            *guard = Some(conn);
        }
        Err(e) => errors.push(format!("Failed to reopen database: {}", e)),
    }

    let restored: Value = if errors.is_empty() { json!(["dex.db"]) } else { json!([]) };
    json!({ "success": errors.is_empty(), "restoredDatabases": restored, "errors": errors })
}

// --- Reminder scheduler (background thread firing OS toasts) ---------------
// Mirrors ReminderManager's 30s interval: poll due, non-completed, non-snoozed
// reminders, fire an OS notification for each, then complete (repeat='none') or
// advance remind_at by the repeat interval. Renderer push (`reminder:fired`) is
// skipped — the tauriCompat bridge no-ops event subscriptions for now, so the OS
// toast is the meaningful surface. The secondary legacy notifications-table
// insert is skipped (its columns differ from the hub schema; it was try/catch'd
// and effectively a no-op in Electron too).

/// Spawn the reminder polling thread. Runs for the app lifetime; degrades to a
/// no-op tick whenever the DB is unavailable. Called once from setup().
pub fn start_reminder_scheduler(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        // Initial delay mirrors the TS setTimeout(2000) before the first poll.
        std::thread::sleep(std::time::Duration::from_secs(2));
        loop {
            process_due_reminders(&app);
            std::thread::sleep(std::time::Duration::from_secs(30));
        }
    });
}

// --- Automatic backup scheduler (background thread) ------------------------
// Mirrors BackupRestoreManager.startAutoBackup: when auto_enabled, create an
// 'automatic' backup every interval_hours, with a startup catchup if the last
// automatic backup is older than the interval. Reuses backup_create (which
// updates last_auto_backup + prunes). No new dep.

/// Spawn the auto-backup thread. Checks ~5s after boot (catchup), then every 5 min.
pub fn start_autobackup_scheduler(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let start = now_ms();
        std::thread::sleep(std::time::Duration::from_secs(5));
        loop {
            if autobackup_due(&app, start) {
                let _ = backup_create(&app, &json!(["automatic", "Automatic backup"]));
            }
            std::thread::sleep(std::time::Duration::from_secs(300));
        }
    });
}

/// True when an automatic backup is due. Baseline for "elapsed" is the last
/// automatic backup, or the scheduler start time when there has never been one
/// (so a never-backed-up app first backs up interval_hours after launch, exactly
/// like the Electron setInterval).
fn autobackup_due(app: &tauri::AppHandle, start: i64) -> bool {
    with_conn(app, |conn| {
        let row: Option<(i64, i64, Option<String>)> = conn
            .query_row(
                "SELECT auto_enabled, interval_hours, last_auto_backup FROM backup_settings WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok();
        let (auto, interval_h, last) = match row {
            Some(t) => t,
            None => return json!(false),
        };
        if auto != 1 {
            return json!(false);
        }
        let interval_secs = interval_h * 3600;
        let elapsed_secs: i64 = match last {
            Some(l) => conn
                .query_row(
                    "SELECT CAST(strftime('%s','now') AS INTEGER) - CAST(strftime('%s', ?) AS INTEGER)",
                    params![l],
                    |r| r.get(0),
                )
                .unwrap_or(i64::MAX),
            None => (now_ms() - start) / 1000,
        };
        json!(elapsed_secs >= interval_secs)
    })
    .as_bool()
    .unwrap_or(false)
}

fn process_due_reminders(app: &tauri::AppHandle) {
    with_conn(app, |conn| {
        let now: String = conn
            .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |r| r.get(0))
            .unwrap_or_default();
        // Full `SELECT *` row shape — Electron pushes the whole reminder row
        // with its `reminder:fired` webContents.send, so the emit below must too.
        let due: Vec<Value> = {
            let mut stmt = match conn.prepare(
                "SELECT id, app, title, body, item_type, item_id, remind_at, repeat,
                        completed, snoozed_until, created_at FROM reminders
                 WHERE completed = 0 AND remind_at <= ?1
                 AND (snoozed_until IS NULL OR snoozed_until <= ?1)
                 ORDER BY remind_at ASC LIMIT 20",
            ) {
                Ok(s) => s,
                Err(_) => return Value::Null,
            };
            let mapped = stmt.query_map(params![now], |r| {
                Ok(json!({
                    "id": r.get::<_, i64>(0)?,
                    "app": r.get::<_, String>(1)?,
                    "title": r.get::<_, String>(2)?,
                    "body": r.get::<_, String>(3)?,
                    "item_type": r.get::<_, String>(4)?,
                    "item_id": r.get::<_, String>(5)?,
                    "remind_at": r.get::<_, String>(6)?,
                    "repeat": r.get::<_, String>(7)?,
                    "completed": r.get::<_, i64>(8)?,
                    "snoozed_until": r.get::<_, Option<String>>(9)?,
                    "created_at": r.get::<_, String>(10)?,
                }))
            });
            match mapped {
                Ok(rs) => rs.filter_map(|x| x.ok()).collect(),
                Err(_) => return Value::Null,
            }
        };

        for reminder in &due {
            let id = reminder.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
            let title = reminder.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let body = reminder.get("body").and_then(|v| v.as_str()).unwrap_or("");
            let repeat = reminder.get("repeat").and_then(|v| v.as_str()).unwrap_or("none");
            let remind_at = reminder.get("remind_at").and_then(|v| v.as_str()).unwrap_or("");
            let body_text = if body.is_empty() { "Reminder due" } else { body };
            notify(app, title, body_text);
            // In-app push (Electron: webContents.send('reminder:fired', reminder)).
            emit_event(app, "reminder:fired", reminder);

            if repeat == "none" || repeat.is_empty() {
                let _ = conn.execute("UPDATE reminders SET completed = 1 WHERE id = ?", params![id]);
            } else {
                // computeNextRemindAt: daily +1d, weekly +7d, monthly +1mo, else +1d.
                let modifier = match repeat {
                    "daily" => "+1 day",
                    "weekly" => "+7 days",
                    "monthly" => "+1 month",
                    _ => "+1 day",
                };
                // Strip a trailing Z so SQLite parses the ISO string; re-add it in output.
                let base = remind_at.trim_end_matches('Z');
                let next: Option<String> = conn
                    .query_row(
                        &format!("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?, '{}')", modifier),
                        params![base],
                        |r| r.get(0),
                    )
                    .ok();
                if let Some(n) = next {
                    let _ = conn.execute(
                        "UPDATE reminders SET remind_at = ?, snoozed_until = NULL WHERE id = ?",
                        params![n, id],
                    );
                }
            }
        }
        Value::Null
    });
}

/// `backup:verify` — verifyBackup(backupId): recompute the file sha256 and
/// compare to the stored checksum. Returns { valid, details }.
pub fn backup_verify(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    with_conn(app, |conn| {
        let row: Option<(String, String)> = conn
            .query_row(
                "SELECT filepath, checksum FROM backups WHERE id = ?",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        let (fp, stored) = match row {
            Some(t) => t,
            None => return json!({ "valid": false, "details": "Backup record not found" }),
        };
        if !std::path::Path::new(&fp).exists() {
            return json!({ "valid": false, "details": "Backup file not found" });
        }
        let bytes = match std::fs::read(&fp) {
            Ok(b) => b,
            Err(_) => return json!({ "valid": false, "details": "Could not read backup file" }),
        };
        if crate::licensing::sha256_hex(&bytes) == stored {
            json!({ "valid": true, "details": "Backup is valid" })
        } else {
            json!({ "valid": false, "details": "Checksum mismatch" })
        }
    })
}
