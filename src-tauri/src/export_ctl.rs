// =============================================================================
// DEX Tauri — Data Export subsystem (port of the read-only `export:*` query
// handlers in controllers/DataExportController.ts).
//
// Pure-data, JSON-backed tier. The Electron controller read its counts straight
// off the two raw electron-store files under userData (dex-data.json and
// dex-sessions.json — NOT via DataStore-KV); this mirrors that exactly by
// reading the SAME file names under <appData> (the Tauri analog of userData).
// Return shapes match the Electron handlers field-for-field so the renderer
// (preload exposes getSummary / getLocations) is unchanged.
//
// PORTED (read-only data channels):
//   - export:getSummary   -> DataSummary
//       { actions, modes, rules, sessions, operations: number,
//         totalSize: string, encryptedItems: number, lastModified: number }
//   - export:getLocations -> Record<string,string>
//       { userData, mainData, sessions, encryption, permissions, logs, backups }
//
// PORTED (heavy channels — round 2, real native code):
//   - export:dataToPath  -> ExportResult
//       Real fs export: loads dex-data.json / dex-sessions.json under <appData>,
//       filters by the ExportOptions flags, writes a `dex-export` JSON envelope
//       to the caller-supplied path, returns { success, path, size, itemCount }.
//       (PathValidator is an Electron-only allowlist guard; the write itself is
//       the load-bearing behavior and is reproduced field-for-field.)
//   - export:importFromPath -> ImportResult
//       Real fs merge: reads the export file, validates `format === 'dex-export'`,
//       merges new-id-only items back into dex-data.json (+ dex-sessions.json),
//       writes them, returns { success, imported{...}, skipped, errors[] }.
//   - export:openDataFolder -> true/false
//       Real OS side-effect: opens <appData> in the file manager via
//       std::process::Command (explorer / open / xdg-open), console hidden on
//       Windows (precedent: power.rs `run`). Returns true on spawn success.
//
// DEGRADED (genuinely need the native runtime — NOT faked):
//   - export:data    Electron opened an OS save dialog (dialog.showSaveDialog)
//                    to choose the target before writing. A live OS file dialog
//                    is exactly the "creating live OS windows" carve-out, so this
//                    returns { success:false, error:"not ported (needs native
//                    runtime)" }. Callers that already know the path use
//                    export:dataToPath (fully native above).
//   - export:import  Electron opened an OS open dialog (dialog.showOpenDialog).
//                    Same dialog carve-out; returns an ImportResult with the
//                    error set. Callers with a path use export:importFromPath.
//   - Encrypted variants: ExportOptions.encryptExport / the dex-encrypted-export
//                    envelope need AES-256-GCM + PBKDF2-SHA512. No AES crate is
//                    in Cargo.toml and adding deps is forbidden, so an
//                    encryptExport request (and any encrypted import) degrades to
//                    { success:false, error:"not ported (needs native runtime)" }.
//                    The plaintext path — the common case — is fully native.
//
// DIVERGENCES (documented):
//   - lastModified: Electron used fs.statSync(...).mtimeMs (file modify time).
//     std::fs Metadata::modified() gives the same instant; we convert to epoch
//     millis (f64, matching the JS number). If mtime is unavailable the field
//     stays 0, exactly as the Electron try/catch default.
//   - totalSize: byte->string formatting reproduces the Electron thresholds
//     exactly: `<1024` -> "{n} B"; `<1MiB` -> "{round(n/1024)} KB";
//     else -> "{(n/1MiB) with 1 decimal} MB" (toFixed(1)).
//   - encryptedItems: the Electron summary never populated this; it is always 0.
//     Mirrored verbatim (constant 0).
//   - getLocations: Electron returned absolute paths under app.getPath('userData')
//     and a sibling `logs` / `backups` directory. We root every path at
//     app_data_dir() (the Tauri analog) using the SAME relative file names.
// =============================================================================

use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::Manager;

const MAIN_DATA_FILE: &str = "dex-data.json";
const SESSIONS_FILE: &str = "dex-sessions.json";

// userData analog: app_data_dir(). Created on demand so reads of a fresh
// profile behave like Electron's "file does not exist yet" path.
fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_json(path: &PathBuf) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&raw).ok()
}

// Length of an array field on an object, mirroring `data.x?.length ?? 0`.
fn arr_len(v: &Value, key: &str) -> i64 {
    v.get(key).and_then(|x| x.as_array()).map(|a| a.len() as i64).unwrap_or(0)
}

// fs Metadata::modified() -> epoch millis as f64 (mirrors statSync().mtimeMs).
fn mtime_ms(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

// Reproduce the Electron byte->human string formatting exactly.
fn format_size(total_bytes: u64) -> String {
    if total_bytes < 1024 {
        format!("{} B", total_bytes)
    } else if total_bytes < 1024 * 1024 {
        // Math.round(totalBytes / 1024)
        let kb = (total_bytes as f64 / 1024.0).round() as i64;
        format!("{} KB", kb)
    } else {
        // (totalBytes / 1024 / 1024).toFixed(1)
        let mb = total_bytes as f64 / 1024.0 / 1024.0;
        format!("{:.1} MB", mb)
    }
}

// getDataSummary(): counts off the raw data/sessions files + total size + mtime.
fn get_summary(app: &tauri::AppHandle) -> Value {
    let dir = data_dir(app);
    let mut total_bytes: u64 = 0;
    let mut last_modified: f64 = 0.0;
    let mut actions = 0i64;
    let mut modes = 0i64;
    let mut rules = 0i64;
    let mut operations = 0i64;
    let mut sessions = 0i64;

    // Main data
    let data_path = dir.join(MAIN_DATA_FILE);
    if let Ok(meta) = std::fs::metadata(&data_path) {
        total_bytes += meta.len();
        last_modified = last_modified.max(mtime_ms(&meta));
        if let Some(data) = read_json(&data_path) {
            actions = arr_len(&data, "actions");
            modes = arr_len(&data, "modes");
            rules = arr_len(&data, "rules");
            operations = arr_len(&data, "operations");
        }
    }

    // Sessions
    let sessions_path = dir.join(SESSIONS_FILE);
    if let Ok(meta) = std::fs::metadata(&sessions_path) {
        total_bytes += meta.len();
        last_modified = last_modified.max(mtime_ms(&meta));
        if let Some(data) = read_json(&sessions_path) {
            sessions = arr_len(&data, "sessions");
        }
    }

    json!({
        "actions": actions,
        "modes": modes,
        "rules": rules,
        "sessions": sessions,
        "operations": operations,
        "totalSize": format_size(total_bytes),
        "encryptedItems": 0,
        "lastModified": last_modified,
    })
}

// getDataLocations(): string map of canonical storage paths under userData.
fn get_locations(app: &tauri::AppHandle) -> Value {
    let dir = data_dir(app);
    let p = |name: &str| dir.join(name).to_string_lossy().to_string();
    json!({
        "userData": dir.to_string_lossy().to_string(),
        "mainData": p(MAIN_DATA_FILE),
        "sessions": p(SESSIONS_FILE),
        "encryption": p("dex-encryption.json"),
        "permissions": p("dex-permissions.json"),
        "logs": p("logs"),
        "backups": p("backups"),
    })
}

// new Date().toISOString() analog without a date crate: RFC3339 UTC with a
// fixed ".000Z" millis field (civil-from-days, Howard Hinnant). Self-contained
// so this module owns its timestamp formatting (no cross-module private dep).
fn iso_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (hh, mm, ss) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}.000Z")
}

// Merge `parsed[field]` (an array) into `current[field]` keeping new ids only.
// Returns (imported_count, skipped_count). Mirrors the Electron per-field merge:
// build a Set of existing ids, push only unseen items, count the rest skipped.
// A free fn (not a closure) so `current` is not borrow-locked for later writes.
fn merge_field(current: &mut Value, parsed: &Value, field: &str) -> (i64, i64) {
    let incoming = match parsed.get(field).and_then(|x| x.as_array()) {
        Some(a) => a.clone(),
        None => return (0, 0),
    };
    let obj = match current.as_object_mut() {
        Some(o) => o,
        None => return (0, 0),
    };
    let existing: Vec<Value> = obj
        .get(field)
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let mut ids: HashSet<String> = existing.iter().map(item_id).collect();
    let mut merged = existing;
    let (mut imported, mut skipped) = (0i64, 0i64);
    for item in incoming {
        let id = item_id(&item);
        if ids.contains(&id) {
            skipped += 1;
        } else {
            ids.insert(id);
            merged.push(item);
            imported += 1;
        }
    }
    obj.insert(field.into(), Value::Array(merged));
    (imported, skipped)
}

// Pretty-print JSON with 2-space indent, matching JSON.stringify(x, null, 2)
// so re-imports and byte-size reporting line up with the Electron output.
fn pretty(v: &Value) -> String {
    serde_json::to_string_pretty(v).unwrap_or_else(|_| v.to_string())
}

// `id` of a JSON item (Electron used `a.id`, comparing by Set membership). We
// key on the serialized id so string / number ids both compare correctly and a
// missing id stays distinct (serializes to `null`).
fn item_id(item: &Value) -> String {
    item.get("id").map(|id| id.to_string()).unwrap_or_else(|| "null".to_string())
}

// exportToPath(targetPath, options): build the `dex-export` envelope from the
// raw store files, apply the include flags, write it, return ExportResult.
// Mirrors DataExportController.exportToPath field-for-field. Encryption
// (encryptExport) is the documented native degrade.
fn export_to_path(app: &tauri::AppHandle, target_path: &str, options: &Value) -> Value {
    // Encrypted export needs AES-256-GCM + PBKDF2 — no AES crate available.
    let encrypt = options.get("encryptExport").and_then(|v| v.as_bool()).unwrap_or(false);
    let has_pw = options
        .get("exportPassword")
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    if encrypt && has_pw {
        return json!({ "success": false, "error": "not ported (needs native runtime)" });
    }

    if target_path.trim().is_empty() {
        return json!({ "success": false, "error": "No target path provided" });
    }

    let dir = data_dir(app);
    let flag = |name: &str| options.get(name).and_then(|v| v.as_bool()).unwrap_or(false);

    let mut export = serde_json::Map::new();
    export.insert("version".into(), json!(1));
    export.insert("exportedAt".into(), json!(iso_now()));
    export.insert("appVersion".into(), json!(app.package_info().version.to_string()));
    export.insert("format".into(), json!("dex-export"));

    let mut item_count: i64 = 0;

    // Main data store: actions / modes / rules / operations / settings.
    // Copy an included array field from `main` -> `export`, returning its length.
    let copy_arr = |export: &mut serde_json::Map<String, Value>,
                    main: &Value,
                    opt_key: &str,
                    field: &str|
     -> i64 {
        if flag(opt_key) {
            if let Some(arr) = main.get(field).and_then(|x| x.as_array()) {
                let n = arr.len() as i64;
                export.insert(field.into(), Value::Array(arr.clone()));
                return n;
            }
        }
        0
    };

    let data_path = dir.join(MAIN_DATA_FILE);
    if let Some(main) = read_json(&data_path) {
        item_count += copy_arr(&mut export, &main, "includeActions", "actions");
        item_count += copy_arr(&mut export, &main, "includeModes", "modes");
        item_count += copy_arr(&mut export, &main, "includeRules", "rules");
        item_count += copy_arr(&mut export, &main, "includeOperations", "operations");
        if flag("includeSettings") {
            if let Some(settings) = main.get("settings") {
                export.insert("settings".into(), settings.clone());
            }
        }
    }

    // Sessions store (nested under `sessions`).
    if flag("includeSessions") {
        let sessions_path = dir.join(SESSIONS_FILE);
        if let Some(sdata) = read_json(&sessions_path) {
            let arr = sdata
                .get("sessions")
                .and_then(|x| x.as_array())
                .cloned()
                .unwrap_or_default();
            item_count += arr.len() as i64;
            export.insert("sessions".into(), Value::Array(arr));
        }
    }

    // decryptData marker (Electron only set a flag when encryption was unlocked;
    // this pure-data tier has no EncryptionService, so the marker stays absent —
    // the field was cosmetic and never drove the written item set).

    let content = pretty(&Value::Object(export));
    if let Err(e) = std::fs::write(target_path, content.as_bytes()) {
        return json!({ "success": false, "error": format!("{}", e) });
    }

    let size = std::fs::metadata(target_path).map(|m| m.len()).unwrap_or(0);
    json!({
        "success": true,
        "path": target_path,
        "size": size,
        "itemCount": item_count,
    })
}

// Empty ImportResult skeleton (matches the Electron `result` initializer).
fn import_skeleton() -> serde_json::Map<String, Value> {
    let mut m = serde_json::Map::new();
    m.insert("success".into(), json!(false));
    m.insert(
        "imported".into(),
        json!({ "actions": 0, "modes": 0, "rules": 0, "sessions": 0, "operations": 0 }),
    );
    m.insert("skipped".into(), json!(0));
    m.insert("errors".into(), json!([]));
    m
}

fn import_error(msg: &str) -> Value {
    let mut m = import_skeleton();
    m.insert("errors".into(), json!([msg]));
    Value::Object(m)
}

// importFromPath(sourcePath): read + validate + merge (new-id-only) back into the
// live store files. Mirrors DataExportController.importFromPath. Encrypted
// envelopes are the documented degrade.
fn import_from_path(app: &tauri::AppHandle, source_path: &str) -> Value {
    if source_path.trim().is_empty() {
        return import_error("File not found");
    }
    let src = PathBuf::from(source_path);
    if !src.exists() {
        return import_error("File not found");
    }

    let raw = match std::fs::read_to_string(&src) {
        Ok(s) => s,
        Err(e) => return import_error(&format!("{}", e)),
    };
    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => return import_error(&format!("{}", e)),
    };

    let fmt = parsed.get("format").and_then(|v| v.as_str()).unwrap_or("");
    if fmt == "dex-encrypted-export" {
        // Needs the export password + AES-256-GCM/PBKDF2 — degrade honestly.
        return import_error("not ported (needs native runtime)");
    }
    if fmt != "dex-export" {
        return import_error("Invalid export file format");
    }

    let dir = data_dir(app);

    // ---- main data merge (actions / modes / rules / operations) -------------
    let data_path = dir.join(MAIN_DATA_FILE);
    let mut current = read_json(&data_path).unwrap_or_else(|| json!({}));
    if !current.is_object() {
        current = json!({});
    }

    let mut imp_sessions = 0i64;
    let mut skipped = 0i64;

    // Merge new-id-only array fields from the import into the live store.
    let (imp_actions, s1) = merge_field(&mut current, &parsed, "actions");
    let (imp_modes, s2) = merge_field(&mut current, &parsed, "modes");
    let (imp_rules, s3) = merge_field(&mut current, &parsed, "rules");
    let (imp_operations, s4) = merge_field(&mut current, &parsed, "operations");
    skipped += s1 + s2 + s3 + s4;

    if let Err(e) = std::fs::write(&data_path, pretty(&current).as_bytes()) {
        return import_error(&format!("{}", e));
    }

    // ---- sessions merge (separate file, nested `sessions`) ------------------
    if let Some(incoming) = parsed.get("sessions").and_then(|x| x.as_array()).cloned() {
        let sessions_path = dir.join(SESSIONS_FILE);
        let mut sdata = read_json(&sessions_path).unwrap_or_else(|| json!({ "sessions": [] }));
        if !sdata.is_object() {
            sdata = json!({ "sessions": [] });
        }
        let sobj = sdata.as_object_mut().unwrap();
        let existing: Vec<Value> = sobj
            .get("sessions")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default();
        let mut ids: HashSet<String> = existing.iter().map(item_id).collect();
        let mut merged = existing;
        for s in incoming {
            let id = item_id(&s);
            if ids.contains(&id) {
                skipped += 1;
            } else {
                ids.insert(id);
                merged.push(s);
                imp_sessions += 1;
            }
        }
        sobj.insert("sessions".into(), Value::Array(merged));
        if let Err(e) = std::fs::write(&sessions_path, pretty(&sdata).as_bytes()) {
            return import_error(&format!("{}", e));
        }
    }

    json!({
        "success": true,
        "imported": {
            "actions": imp_actions,
            "modes": imp_modes,
            "rules": imp_rules,
            "sessions": imp_sessions,
            "operations": imp_operations,
        },
        "skipped": skipped,
        "errors": [],
    })
}

// openDataFolder(): real OS side-effect — reveal <appData> in the file manager.
// Windows: explorer; macOS: open; otherwise xdg-open. Console hidden on Windows
// (precedent: power.rs `run`). Returns true on a successful spawn.
fn open_data_folder(app: &tauri::AppHandle) -> bool {
    let dir = data_dir(app);
    let path = dir.to_string_lossy().to_string();
    let program = match std::env::consts::OS {
        "windows" => "explorer",
        "macos" => "open",
        _ => "xdg-open",
    };
    let mut cmd = std::process::Command::new(program);
    cmd.arg(&path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    // explorer.exe returns a non-zero exit code even on success, so for the
    // spawn we only require that the process launched, mirroring shell.openPath
    // (which resolves to "" on success and never throws here).
    cmd.spawn().is_ok()
}

/// Route an `export:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Read-only data channels and the ported heavy
/// channels (dataToPath / importFromPath / openDataFolder) are handled natively;
/// the dialog-driven channels (export:data / export:import) degrade honestly.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "export:getSummary" => get_summary(app),
        "export:getLocations" => get_locations(app),

        // export:data — Electron showed an OS save dialog first. No native
        // dialog in this tier (live OS window carve-out). Honest degrade.
        "export:data" => json!({ "success": false, "error": "not ported (needs native runtime)" }),

        // export:dataToPath(targetPath, options) — fully native (plaintext).
        "export:dataToPath" => {
            let target = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let options = args.get(1).cloned().unwrap_or_else(|| json!({}));
            export_to_path(app, target, &options)
        }

        // export:import — Electron showed an OS open dialog first. Honest degrade
        // returning the ImportResult shape with the error populated.
        "export:import" => import_error("not ported (needs native runtime)"),

        // export:importFromPath(sourcePath) — fully native merge.
        "export:importFromPath" => {
            let source = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            import_from_path(app, source)
        }

        // export:openDataFolder — real OS file-manager reveal.
        "export:openDataFolder" => json!(open_data_folder(app)),

        _ => Value::Null,
    }
}
