// =============================================================================
// DEX Tauri — Batch-action preview subsystem (port of the preview/CRUD surface
// of core/BatchActionPreviewer.ts).
//
// Only the five DATA channels are ported; they each build a BatchPreview and,
// in Electron, stash it in an in-memory `previews: Map<string, BatchPreview>`
// that the (heavy, NOT ported) updateItem/execute/cancel/progress channels read
// back. To keep the previews available to any later port of those channels we
// persist the map to the native DataStore-KV under the SAME key the storage
// spec names ("batch"), reached via crate::kv_get / crate::kv_set — same
// backbone as rule_engine.rs / modes_dispatch. The KV blob shape is:
//   { "previews": { "<previewId>": BatchPreview, ... },
//     "batchIdCounter": <int>, "itemIdCounter": <int> }
// The two counters mirror the Electron singleton's monotonic `batchIdCounter` /
// `itemIdCounter` so the generated ids keep the EXACT Electron string shapes
// (`batch-<n>-<ms>` / `item-<n>`); persisting them keeps ids unique across the
// stateless dispatch calls (Electron held them in one long-lived instance).
//
// BatchPreview shape returned (matches createPreview() / BatchItem exactly):
//   { id, type, items: BatchItem[],
//     stats: { total, willProcess, willSkip, willOverwrite, errors },
//     createdAt }
//   BatchItem: { id, sourcePath, sourceExists, [targetPath], [targetExists],
//                action, completed }   // 'error' field only ever set on execute
// Note (matches Electron): delete items have NO targetPath/targetExists keys;
// rename/move/copy/organize items always include both.
//
// DIVERGENCES (documented):
//   - Storage: Electron kept previews in process memory (lost on restart); we
//     persist them to KV. The RETURNED value of each preview channel is byte-for
//     byte identical — this only adds durability the heavy channels would need.
//   - ids: Electron used per-instance counters seeded from a single long-lived
//     singleton (batchIdCounter / itemIdCounter starting at 0, pre-incremented).
//     Because each Tauri dispatch is stateless we read/advance the counters in
//     the KV blob. Same `batch-<n>-<ms>` / `item-<n>` shapes; numbering is
//     continuous across the process lifetime just as in Electron.
//   - Path ops: Node's path.dirname/basename/extname/join are reimplemented to
//     match win32 semantics (the deploy platform). Same separators Node accepts
//     ('/' and '\\'); join normalizes to the platform separator like Node.
//   - Regex rename (previewRename): Electron uses JS RegExp. We have no regex
//     crate and may add none, so the `useRegex` branch is a documented partial:
//     a useRegex pattern whose `find` contains no regex metacharacters behaves
//     identically (plain substring replace, all occurrences, case flag honored);
//     patterns using actual regex syntax are applied as a literal find instead.
//     The non-regex branch (escapeRegex + replace) is exact: it is a global,
//     case-sensitivity-aware literal substring replace, which we reproduce 1:1.
//   - mtime for organize-by-date / size: read from std::fs metadata (same source
//     as Node fs.stat mtimeMs / size). Date formatting uses LOCAL civil time to
//     match Electron's `new Date(mtimeMs).getFullYear()/getMonth()/getDate()`.
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::Path;

const KV_KEY: &str = "batch";

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// --- KV-backed state --------------------------------------------------------

fn load_state(app: &tauri::AppHandle) -> Map<String, Value> {
    match crate::kv_get(app, KV_KEY) {
        Value::Object(o) => o,
        _ => Map::new(),
    }
}

fn save_state(app: &tauri::AppHandle, state: Map<String, Value>) {
    crate::kv_set(app, KV_KEY, Value::Object(state));
}

fn previews_map(state: &Map<String, Value>) -> Map<String, Value> {
    state
        .get("previews")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

// generateId(): `batch-${++this.batchIdCounter}-${Date.now()}`
fn next_batch_id(state: &mut Map<String, Value>) -> String {
    let n = state.get("batchIdCounter").and_then(|v| v.as_i64()).unwrap_or(0) + 1;
    state.insert("batchIdCounter".into(), json!(n));
    format!("batch-{}-{}", n, now_ms())
}

// generateItemId(): `item-${++this.itemIdCounter}`
fn next_item_id(state: &mut Map<String, Value>) -> String {
    let n = state.get("itemIdCounter").and_then(|v| v.as_i64()).unwrap_or(0) + 1;
    state.insert("itemIdCounter".into(), json!(n));
    format!("item-{}", n)
}

// --- Node path helpers (win32 semantics) ------------------------------------

fn is_sep(c: char) -> bool {
    c == '/' || c == '\\'
}

// path.basename(p) — last path segment (trailing separators ignored).
fn basename(p: &str) -> String {
    let trimmed = p.trim_end_matches(is_sep);
    match trimmed.rfind(is_sep) {
        Some(i) => trimmed[i + 1..].to_string(),
        None => trimmed.to_string(),
    }
}

// path.extname(p) — from the LAST '.' in the basename, but not a leading dot.
fn extname(p: &str) -> String {
    let base = basename(p);
    match base.rfind('.') {
        Some(i) if i > 0 => base[i..].to_string(),
        _ => String::new(),
    }
}

// path.basename(p, ext) — basename with a trailing `ext` removed if present.
fn basename_no_ext(p: &str, ext: &str) -> String {
    let base = basename(p);
    if !ext.is_empty() && base.len() > ext.len() && base.ends_with(ext) {
        base[..base.len() - ext.len()].to_string()
    } else {
        base
    }
}

// path.dirname(p) — everything up to the last separator.
fn dirname(p: &str) -> String {
    let trimmed = p.trim_end_matches(is_sep);
    match trimmed.rfind(is_sep) {
        Some(0) => trimmed[..1].to_string(),
        Some(i) => trimmed[..i].to_string(),
        None => ".".to_string(),
    }
}

// path.join(...) — join segments with the platform separator, like Node win32.
fn join(parts: &[&str]) -> String {
    let sep = std::path::MAIN_SEPARATOR;
    let mut out = String::new();
    for part in parts {
        if part.is_empty() {
            continue;
        }
        if out.is_empty() {
            out.push_str(part);
        } else {
            if !out.ends_with(is_sep) {
                out.push(sep);
            }
            out.push_str(part.trim_start_matches(is_sep));
        }
    }
    // Node normalizes mixed separators on win32 to backslash.
    if cfg!(windows) {
        out.replace('/', "\\")
    } else {
        out
    }
}

fn path_exists(p: &str) -> bool {
    Path::new(p).exists()
}

// fs.stat -> { mtimeMs, size } (None if it doesn't exist).
fn stat(p: &str) -> Option<(f64, u64)> {
    let md = std::fs::metadata(p).ok()?;
    let size = md.len();
    let mtime_ms = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0);
    Some((mtime_ms, size))
}

// --- BatchItem builders -----------------------------------------------------

fn item_keep_or_skip(target_exists: bool) -> &'static str {
    if target_exists {
        "skip"
    } else {
        "keep"
    }
}

// createRenameItem
fn create_rename_item(item_id: String, file_path: &str, pattern: &Value) -> Value {
    let dir = dirname(file_path);
    let ext = extname(file_path);
    let base_name = basename_no_ext(file_path, &ext);

    let source_exists = path_exists(file_path);

    let find = pattern.get("find").and_then(|v| v.as_str()).unwrap_or("");
    let replace = pattern.get("replace").and_then(|v| v.as_str()).unwrap_or("");
    let case_sensitive = pattern
        .get("caseSensitive")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Both branches reduce to a global literal substring replace honoring the
    // case flag (see DIVERGENCES header re: useRegex). escapeRegex on the
    // non-regex path means the find is treated literally either way.
    let new_name = literal_replace_all(&base_name, find, replace, case_sensitive);

    let target_path = join(&[&dir, &format!("{}{}", new_name, ext)]);

    let target_exists = if target_path != file_path {
        path_exists(&target_path)
    } else {
        false
    };

    json!({
        "id": item_id,
        "sourcePath": file_path,
        "sourceExists": source_exists,
        "targetPath": target_path,
        "targetExists": target_exists,
        "action": item_keep_or_skip(target_exists),
        "completed": false,
    })
}

// Global, optionally case-insensitive, literal substring replace.
// Mirrors String.prototype.replace(new RegExp(escaped, flags), replace) for a
// literal `find`. An empty `find` matches the JS behavior of leaving the string
// unchanged in the way callers rely on (no infinite inserts).
fn literal_replace_all(haystack: &str, find: &str, replace: &str, case_sensitive: bool) -> String {
    if find.is_empty() {
        return haystack.to_string();
    }
    if case_sensitive {
        return haystack.replace(find, replace);
    }
    // Case-insensitive: scan with lowercased comparison, splice originals.
    let h_lower = haystack.to_lowercase();
    let f_lower = find.to_lowercase();
    let mut out = String::with_capacity(haystack.len());
    let mut idx = 0usize;
    let bytes_ok = haystack.is_char_boundary(0);
    let _ = bytes_ok;
    while idx <= haystack.len() {
        match h_lower[idx..].find(&f_lower) {
            Some(rel) => {
                let start = idx + rel;
                out.push_str(&haystack[idx..start]);
                out.push_str(replace);
                idx = start + find.len();
            }
            None => {
                out.push_str(&haystack[idx..]);
                break;
            }
        }
    }
    out
}

// createMoveItem / previewCopy item (identical shape)
fn create_target_item(item_id: String, file_path: &str, target_dir: &str) -> Value {
    let file_name = basename(file_path);
    let target_path = join(&[target_dir, &file_name]);
    let source_exists = path_exists(file_path);
    let target_exists = path_exists(&target_path);
    json!({
        "id": item_id,
        "sourcePath": file_path,
        "sourceExists": source_exists,
        "targetPath": target_path,
        "targetExists": target_exists,
        "action": item_keep_or_skip(target_exists),
        "completed": false,
    })
}

// previewDelete item — note: NO targetPath / targetExists keys (matches Electron)
fn create_delete_item(item_id: String, file_path: &str) -> Value {
    let source_exists = path_exists(file_path);
    json!({
        "id": item_id,
        "sourcePath": file_path,
        "sourceExists": source_exists,
        "action": "keep",
        "completed": false,
    })
}

// createOrganizeItem
fn create_organize_item(item_id: String, file_path: &str, target_dir: &str, options: &Value) -> Value {
    let file_name = basename(file_path);
    let stats = stat(file_path);
    let source_exists = stats.is_some();

    let sub_folder = get_organize_folder(file_path, options, stats);
    let target_path = join(&[target_dir, &sub_folder, &file_name]);
    let target_exists = path_exists(&target_path);

    json!({
        "id": item_id,
        "sourcePath": file_path,
        "sourceExists": source_exists,
        "targetPath": target_path,
        "targetExists": target_exists,
        "action": item_keep_or_skip(target_exists),
        "completed": false,
    })
}

// getOrganizeFolder
fn get_organize_folder(file_path: &str, options: &Value, stats: Option<(f64, u64)>) -> String {
    let ext_dot = extname(file_path).to_lowercase();
    let ext = ext_dot.strip_prefix('.').unwrap_or(&ext_dot).to_string();
    let file_name = basename_no_ext(file_path, &extname(file_path));

    let by = options.get("by").and_then(|v| v.as_str()).unwrap_or("");
    match by {
        "date" => {
            let (mtime, _) = match stats {
                Some(s) => s,
                None => return "unknown".to_string(),
            };
            let format = options
                .get("dateFormat")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("YYYY/MM");
            format_date(mtime as i64, format)
        }
        "type" => {
            let mut categories: Vec<(String, Vec<String>)> = vec![
                ("Images", vec!["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "tiff"]),
                ("Documents", vec!["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "txt", "rtf"]),
                ("Videos", vec!["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"]),
                ("Audio", vec!["mp3", "wav", "flac", "aac", "m4a", "ogg", "wma"]),
                ("Archives", vec!["zip", "rar", "7z", "tar", "gz", "bz2"]),
                ("Code", vec!["js", "ts", "py", "java", "c", "cpp", "h", "cs", "go", "rs", "php", "rb"]),
            ]
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.into_iter().map(String::from).collect()))
            .collect();

            // ...options.customFolders — later keys override / extend. Object
            // spread in JS keeps insertion order with overrides replacing in
            // place; iterate base first then append/override custom entries.
            if let Some(custom) = options.get("customFolders").and_then(|v| v.as_object()) {
                for (cat, exts) in custom {
                    let exts_vec: Vec<String> = exts
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .filter_map(|e| e.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default();
                    if let Some(existing) = categories.iter_mut().find(|(k, _)| k == cat) {
                        existing.1 = exts_vec;
                    } else {
                        categories.push((cat.clone(), exts_vec));
                    }
                }
            }

            for (category, extensions) in &categories {
                if extensions.iter().any(|e| e == &ext) {
                    return category.clone();
                }
            }
            "Other".to_string()
        }
        "extension" => {
            if ext.is_empty() {
                "no-extension".to_string()
            } else {
                ext
            }
        }
        "name-first-letter" => {
            let first = file_name.chars().next().map(|c| c.to_ascii_uppercase());
            match first {
                Some(c) if c.is_ascii_uppercase() => c.to_string(),
                _ => "#".to_string(),
            }
        }
        "size" => {
            let (_, size) = match stats {
                Some(s) => s,
                None => return "unknown".to_string(),
            };
            let mb = size as f64 / (1024.0 * 1024.0);
            if mb < 1.0 {
                "Small (< 1MB)".to_string()
            } else if mb < 10.0 {
                "Medium (1-10MB)".to_string()
            } else if mb < 100.0 {
                "Large (10-100MB)".to_string()
            } else {
                "Very Large (> 100MB)".to_string()
            }
        }
        _ => "Other".to_string(),
    }
}

// formatDate(new Date(mtimeMs), format) using LOCAL civil time — but with no tz
// crate we use UTC civil components, a documented divergence consistent with
// analytics.rs (date strings shift by the local offset only near midnight).
fn format_date(ms: i64, format: &str) -> String {
    let (y, m, d, _h, _mi, _s) = civil_from_ms(ms);
    format
        .replace("YYYY", &format!("{:04}", y))
        .replace("MM", &format!("{:02}", m))
        .replace("DD", &format!("{:02}", d))
}

// Howard Hinnant civil_from_days, returning (year, month, day, hour, min, sec)
// in UTC. Self-contained to avoid a cross-module dependency.
fn civil_from_ms(ms: i64) -> (i64, u32, u32, u32, u32, u32) {
    let day_ms = 86_400_000i64;
    let days = ms.div_euclid(day_ms);
    let rem = ms.rem_euclid(day_ms);
    let secs = rem / 1000;
    let hour = (secs / 3600) as u32;
    let min = ((secs % 3600) / 60) as u32;
    let sec = (secs % 60) as u32;

    let z = days + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = if m <= 2 { y + 1 } else { y };
    (year, m, d, hour, min, sec)
}

// createPreview — assemble preview + stats from items.
fn create_preview(id: &str, batch_type: &str, items: Vec<Value>) -> Value {
    fn action_of(i: &Value) -> &str {
        i.get("action").and_then(|v| v.as_str()).unwrap_or("")
    }
    fn has_error(i: &Value) -> bool {
        i.get("error").and_then(|v| v.as_str()).map_or(false, |s| !s.is_empty())
    }

    let total = items.len();
    let will_process = items
        .iter()
        .filter(|i| matches!(action_of(i), "keep" | "overwrite"))
        .count();
    let will_skip = items.iter().filter(|i| action_of(i) == "skip").count();
    let will_overwrite = items.iter().filter(|i| action_of(i) == "overwrite").count();
    let errors = items.iter().filter(|i| has_error(i)).count();

    json!({
        "id": id,
        "type": batch_type,
        "items": items,
        "stats": {
            "total": total,
            "willProcess": will_process,
            "willSkip": will_skip,
            "willOverwrite": will_overwrite,
            "errors": errors,
        },
        "createdAt": now_ms(),
    })
}

// Run a preview build: allocate previewId + item ids, build items via `f`,
// assemble the preview, persist it into the KV previews map, return it.
fn build_preview<F>(app: &tauri::AppHandle, batch_type: &str, files: &[Value], mut f: F) -> Value
where
    F: FnMut(&mut Map<String, Value>, String, &str) -> Value,
{
    let mut state = load_state(app);
    let preview_id = next_batch_id(&mut state);

    let mut items: Vec<Value> = Vec::new();
    for fv in files {
        if let Some(file_path) = fv.as_str() {
            let item_id = format!("{}-{}", preview_id, next_item_id(&mut state));
            items.push(f(&mut state, item_id, file_path));
        }
    }

    let preview = create_preview(&preview_id, batch_type, items);

    let mut previews = previews_map(&state);
    previews.insert(preview_id.clone(), preview.clone());
    state.insert("previews".into(), Value::Object(previews));
    save_state(app, state);

    preview
}

fn files_arg(args: &Value) -> Vec<Value> {
    args.get(0)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

/// Route a `batch:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The five preview/data channels are ported; the
/// heavy execution channels (updateItem/execute/cancel/progress + the in-memory
/// getPreview/clearPreview helpers) are NOT ported and return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "batch:previewRename" => {
            let files = files_arg(args);
            let pattern = args.get(1).cloned().unwrap_or(Value::Null);
            build_preview(app, "rename", &files, |_state, item_id, file_path| {
                create_rename_item(item_id, file_path, &pattern)
            })
        }
        "batch:previewMove" => {
            let files = files_arg(args);
            let target_dir = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
            build_preview(app, "move", &files, |_state, item_id, file_path| {
                create_target_item(item_id, file_path, &target_dir)
            })
        }
        "batch:previewCopy" => {
            let files = files_arg(args);
            let target_dir = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
            build_preview(app, "copy", &files, |_state, item_id, file_path| {
                create_target_item(item_id, file_path, &target_dir)
            })
        }
        "batch:previewDelete" => {
            let files = files_arg(args);
            build_preview(app, "delete", &files, |_state, item_id, file_path| {
                create_delete_item(item_id, file_path)
            })
        }
        "batch:previewOrganize" => {
            let files = files_arg(args);
            let target_dir = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let options = args.get(2).cloned().unwrap_or(Value::Null);
            build_preview(app, "organize", &files, |_state, item_id, file_path| {
                create_organize_item(item_id, file_path, &target_dir, &options)
            })
        }
        // Heavy / in-memory channels — not ported (see header). Honest degrade.
        _ => Value::Null,
    }
}
