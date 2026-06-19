// =============================================================================
// DEX 6.0 — Project Export Bundle command (Tauri native side of export-bundle:*)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Native, OS/UI-bound implementation of `export-bundle:create`
//! (ProjectExportBundleManager.createBundle, Feature 21). The pure-DB module
//! `project_export_bundle` degrades this channel to `null` because the real
//! behaviour needs the Tauri `AppHandle`: it reads three FOREIGN tables
//! (`version_history`, `project_links`, `voice_memos`) to assemble a bundle,
//! reads voice-memo files off disk, gzip-compresses the assembled JSON, opens a
//! native SAVE dialog, writes the chosen file, and returns that path (or `null`
//! on cancel/failure) — matching the TS `Promise<string | null>`.
//!
//! Byte-faithfulness: the Electron bundle is `zlib.gzipSync(Buffer.from(
//! JSON.stringify(bundleData)))`. `bundleData` is a plain JS object, so its keys
//! serialize in INSERTION order; `serde_json::Map` (no `preserve_order` feature)
//! would re-sort them alphabetically and change both the JSON and the gzip bytes.
//! We therefore assemble the bundle as an ordered `Vec<(key, JSON-string)>` and
//! splice the pieces together by hand, reproducing the exact wire shape — down to
//! Node's `Buffer` -> `{"type":"Buffer","data":[..]}` JSON encoding for the
//! binary voice-memo files. gzip uses the shared [`crate::zlib::gzip`] (level 6,
//! the same effective level as Node's `zlib.gzipSync` default).

use crate::native_ops::{fp_to_string, now_ms, with_conn};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tauri_plugin_dialog::DialogExt;

/// One manifest content descriptor: `{ type, name, path }` (matches the TS
/// `manifest.contents[]` entries verbatim).
fn content_entry(typ: &str, name: &str, path: &str) -> Value {
    json!({ "type": typ, "name": name, "path": path })
}

/// Encode a string value as JSON exactly as `JSON.stringify(str)` would (quoted,
/// escaped). serde_json's string serializer is byte-compatible with Node here.
fn json_string(s: &str) -> String {
    serde_json::to_string(&Value::String(s.to_string())).unwrap_or_else(|_| "\"\"".to_string())
}

/// Encode raw bytes the way `JSON.stringify(Buffer)` does in Node:
/// `{"type":"Buffer","data":[<byte>,<byte>,...]}`. Voice-memo files are read as
/// Buffers in the TS and stored under `bundleData[...]`, so the assembled bundle
/// JSON contains this object shape for each binary memo.
fn json_node_buffer(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 4 + 32);
    out.push_str("{\"type\":\"Buffer\",\"data\":[");
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&b.to_string());
    }
    out.push_str("]}");
    out
}

/// Read every version_history snapshot for (app, project) newest-first. Each
/// entry mirrors the TS: the `snapshot` BLOB is decoded as a UTF-8 string (lossy,
/// like Buffer.toString('utf-8')), falling back to `{}` if the column is NULL.
/// Returns `(snapshot_string)` rows in DESC timestamp order. Degrades to empty
/// when the table is absent (the TS read is the un-guarded `.all(...)`, but a
/// missing table must not panic here — empty is the honest degrade).
fn read_versions(conn: &Connection, app_name: &str, project_id: &str) -> Vec<String> {
    let mut stmt = match conn.prepare(
        "SELECT snapshot FROM version_history WHERE app = ? AND project_id = ? ORDER BY timestamp DESC",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let mapped = stmt.query_map(params![app_name, project_id], |r| {
        // snapshot is a BLOB; mirror the TS `Buffer.toString('utf-8')` / String(x).
        let bytes: Option<Vec<u8>> = r.get(0)?;
        Ok(match bytes {
            Some(b) => String::from_utf8_lossy(&b).to_string(),
            None => "{}".to_string(),
        })
    });
    let rows = match mapped {
        Ok(rs) => rs,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|x| x.ok()).collect()
}

/// Read project_links touching (app, project) on either endpoint. Returns each
/// row as `(linked_app, linked_id, link_json)` where `link_json` is the full row
/// JSON-stringified (snake_case keys, `SELECT *` column order) exactly as the TS
/// `JSON.stringify(link, null, 2)`. Degrades to empty when the table is absent
/// (TS wraps this read in try/catch — "project_links may not exist yet").
fn read_links(
    conn: &Connection,
    app_name: &str,
    project_id: &str,
) -> Vec<(String, String, String)> {
    let mut stmt = match conn.prepare(
        "SELECT id, source_app, source_id, target_app, target_id, link_type, created
         FROM project_links
         WHERE (source_app = ? AND source_id = ?) OR (target_app = ? AND target_id = ?)",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let mapped = stmt.query_map(
        params![app_name, project_id, app_name, project_id],
        |r| {
            let id: i64 = r.get(0)?;
            let source_app: String = r.get(1)?;
            let source_id: String = r.get(2)?;
            let target_app: String = r.get(3)?;
            let target_id: String = r.get(4)?;
            let link_type: String = r.get(5)?;
            let created: i64 = r.get(6)?;
            Ok(json!({
                "id": id,
                "source_app": source_app,
                "source_id": source_id,
                "target_app": target_app,
                "target_id": target_id,
                "link_type": link_type,
                "created": created,
            }))
        },
    );
    let rows = match mapped {
        Ok(rs) => rs,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|x| x.ok())
        .map(|link| {
            // Determine the "other" endpoint exactly as the TS ternary does.
            let s_app = link.get("source_app").and_then(|v| v.as_str()).unwrap_or("");
            let s_id = link.get("source_id").and_then(|v| v.as_str()).unwrap_or("");
            let is_source = s_app == app_name && s_id == project_id;
            let (linked_app, linked_id) = if is_source {
                (
                    link.get("target_app").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    link.get("target_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                )
            } else {
                (
                    link.get("source_app").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    link.get("source_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                )
            };
            // JSON.stringify(link, null, 2) — pretty-printed with 2-space indent.
            let link_json =
                serde_json::to_string_pretty(&link).unwrap_or_else(|_| "{}".to_string());
            (linked_app, linked_id, link_json)
        })
        .collect()
}

/// Read voice_memos for (app, parent_id == project). Returns each memo's
/// `filepath` so the caller can read the file off disk. Degrades to empty when
/// the table is absent (TS try/catch — "voice_memos may not exist yet").
fn read_memo_paths(conn: &Connection, app_name: &str, project_id: &str) -> Vec<String> {
    let mut stmt =
        match conn.prepare("SELECT filepath FROM voice_memos WHERE app = ? AND parent_id = ?") {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
    let mapped = stmt.query_map(params![app_name, project_id], |r| r.get::<_, String>(0));
    let rows = match mapped {
        Ok(rs) => rs,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|x| x.ok()).collect()
}

/// `export-bundle:create` — createBundle(appName, projectId, projectName,
/// projectData). Positional args. Gathers the project's foreign-table rows via
/// the shared dex.db connection, assembles the bundle exactly as the TS, gzips
/// it, opens a native save dialog, writes the file, and returns the chosen path
/// string — or `Null` on cancel/failure (matching `string | null`).
pub fn create(app: &tauri::AppHandle, args: &Value) -> Value {
    let app_name = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let project_name = args.get(2).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let project_data = args.get(3).cloned().unwrap_or(Value::Null);

    // safeName = projectName.replace(/[^a-zA-Z0-9_-]/g,'_').substring(0,50)
    let safe_name: String = project_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .take(50)
        .collect();
    // dateStr = new Date().toISOString().split('T')[0] (UTC YYYY-MM-DD).
    let now = now_ms();
    let date_str = utc_date(now);
    // TS default name was `dex-bundle-<safe>-<date>.zip`; the Tauri filter uses the
    // native `dexbundle` extension (per the command spec), so the default filename
    // matches that filter to keep the save dialog internally consistent.
    let default_name = format!("dex-bundle-{}-{}.dexbundle", safe_name, date_str);

    // --- Native save dialog (Electron opens this FIRST and bails on cancel) ---
    let picked = app
        .dialog()
        .file()
        .set_title("Export Project Bundle")
        .set_file_name(default_name)
        .add_filter("DEX Bundle", &["dexbundle"])
        .blocking_save_file();
    let file_path = match picked.and_then(fp_to_string) {
        Some(p) => p,
        None => return Value::Null, // canceled || !filePath -> null
    };

    // --- Assemble the bundle (ordered: project -> versions -> links -> memos) ---
    // `bundleData` is an ordered list of (key, raw-JSON-value-string) so the final
    // JSON serializes in insertion order, byte-for-byte like the JS object.
    let mut bundle: Vec<(String, String)> = Vec::new();
    let mut contents: Vec<Value> = Vec::new();

    // project/project.json — JSON.stringify(projectData, null, 2), then re-quoted
    // (it is stored AS A STRING value inside bundleData).
    let project_json =
        serde_json::to_string_pretty(&project_data).unwrap_or_else(|_| "null".to_string());
    bundle.push(("project/project.json".to_string(), json_string(&project_json)));
    contents.push(content_entry("project", &project_name, "project/project.json"));

    // Gather DB-backed rows under one lock. with_conn returns Null if the DB is
    // absent (mirrors `if (db) { ... }` — no foreign content is added).
    let gathered = with_conn(app, |conn| {
        let versions = read_versions(conn, &app_name, &project_id);
        let links = read_links(conn, &app_name, &project_id);
        let memo_paths = read_memo_paths(conn, &app_name, &project_id);
        json!({
            "versions": versions,
            "links": links,
            "memoPaths": memo_paths,
        })
    });

    if let Some(obj) = gathered.as_object() {
        // versions/snapshot_<i>.json — one per version_history row (DESC order).
        if let Some(versions) = obj.get("versions").and_then(|v| v.as_array()) {
            for (i, snap) in versions.iter().enumerate() {
                let snapshot_data = snap.as_str().unwrap_or("{}");
                let key = format!("versions/snapshot_{}.json", i);
                bundle.push((key.clone(), json_string(snapshot_data)));
                contents.push(content_entry("version", &format!("Snapshot {}", i), &key));
            }
        }

        // links/<app>_<id>.json — one per project_links row.
        if let Some(links) = obj.get("links").and_then(|v| v.as_array()) {
            for link in links {
                let linked_app = link.get(0).and_then(|v| v.as_str()).unwrap_or("");
                let linked_id = link.get(1).and_then(|v| v.as_str()).unwrap_or("");
                let link_json = link.get(2).and_then(|v| v.as_str()).unwrap_or("{}");
                let key = format!("links/{}_{}.json", linked_app, linked_id);
                let name = format!("{}/{}", linked_app, linked_id);
                contents.push(content_entry("linked-project", &name, &key));
                bundle.push((key, json_string(link_json)));
            }
        }

        // memos/<filename> — raw file bytes, only when the file exists on disk.
        if let Some(memo_paths) = obj.get("memoPaths").and_then(|v| v.as_array()) {
            for mp in memo_paths {
                let filepath = match mp.as_str() {
                    Some(p) => p,
                    None => continue,
                };
                let path = std::path::Path::new(filepath);
                if !path.exists() {
                    continue; // fs.existsSync(memo.filepath) === false -> skip
                }
                let bytes = match std::fs::read(path) {
                    Ok(b) => b,
                    Err(_) => continue, // unreadable -> skip (defensive)
                };
                let memo_filename = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let key = format!("memos/{}", memo_filename);
                // Stored as a Node Buffer -> {"type":"Buffer","data":[..]}.
                bundle.push((key.clone(), json_node_buffer(&bytes)));
                contents.push(content_entry("voice-memo", &memo_filename, &key));
            }
        }
    }

    // manifest.json — built AFTER contents are known, then added to the bundle.
    let manifest = json!({
        "version": "1.0",
        "dexVersion": "2.0.1",
        "createdAt": now,
        "project": { "app": app_name, "id": project_id, "name": project_name },
        "contents": contents,
    });
    let manifest_json =
        serde_json::to_string_pretty(&manifest).unwrap_or_else(|_| "{}".to_string());
    bundle.push(("manifest.json".to_string(), json_string(&manifest_json)));

    // manifest.txt — human-readable listing (insertion order of contents).
    let text_manifest: String = manifest
        .get("contents")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|c| {
                    let typ = c.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let path = c.get("path").and_then(|v| v.as_str()).unwrap_or("");
                    format!("{}: {} ({})", typ, name, path)
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    let manifest_txt = format!(
        "DEX Project Bundle\n{}\n{}\n\nContents:\n{}",
        project_name,
        utc_iso(now),
        text_manifest
    );
    bundle.push(("manifest.txt".to_string(), json_string(&manifest_txt)));

    // --- Serialize bundleData as one JSON object in insertion order ----------
    let mut json_bundle = String::from("{");
    for (i, (key, raw_value)) in bundle.iter().enumerate() {
        if i > 0 {
            json_bundle.push(',');
        }
        json_bundle.push_str(&json_string(key));
        json_bundle.push(':');
        json_bundle.push_str(raw_value);
    }
    json_bundle.push('}');

    // --- gzip (zlib.gzipSync default == level 6) and write -------------------
    let compressed = crate::zlib::gzip(json_bundle.as_bytes());
    match std::fs::write(&file_path, &compressed) {
        Ok(()) => json!(file_path),
        Err(_) => Value::Null, // matches the TS try/catch -> return null
    }
}

/// UTC `YYYY-MM-DD` for an epoch-millis instant (mirrors
/// `new Date(ms).toISOString().split('T')[0]`).
pub(crate) fn utc_date(ms: i64) -> String {
    let (y, mo, d, _, _, _, _) = civil_from_ms(ms);
    format!("{:04}-{:02}-{:02}", y, mo, d)
}

/// Full UTC ISO-8601 string with milliseconds and trailing `Z` (mirrors
/// `new Date(ms).toISOString()`), used for the manifest.txt timestamp line.
fn utc_iso(ms: i64) -> String {
    let (y, mo, d, h, mi, s, milli) = civil_from_ms(ms);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y, mo, d, h, mi, s, milli
    )
}

/// Convert epoch-millis to a UTC civil datetime (year, month, day, hour, minute,
/// second, millisecond). Uses Howard Hinnant's days_from_civil inverse so no
/// extra date crate is needed (rules: only rusqlite + serde_json + flate2 + the
/// crate helpers).
pub(crate) fn civil_from_ms(ms: i64) -> (i64, u32, u32, u32, u32, u32, u32) {
    let total_secs = ms.div_euclid(1000);
    let milli = ms.rem_euclid(1000) as u32;
    let days = total_secs.div_euclid(86_400);
    let secs_of_day = total_secs.rem_euclid(86_400);
    let hour = (secs_of_day / 3600) as u32;
    let minute = ((secs_of_day % 3600) / 60) as u32;
    let second = (secs_of_day % 60) as u32;

    // civil_from_days (days since 1970-01-01) -> (y, m, d).
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    let year = if m <= 2 { y + 1 } else { y };

    (year, m, d, hour, minute, second, milli)
}
