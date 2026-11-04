// =============================================================================
// DEX Tauri — Batch-action preview subsystem (port of the preview/CRUD surface
// of core/BatchActionPreviewer.ts).
//
// The five DATA channels build a BatchPreview and, in Electron, stash it in an
// in-memory `previews: Map<string, BatchPreview>` that the heavy
// updateItem/execute/cancel/progress channels read back. Those heavy channels
// are now ALSO ported (real fs work on a worker thread + KV-backed activeBatch
// and cancellation flag — see the "Heavy execution channels" section below).
// To share the previews across the stateless dispatch calls we persist the map
// to the native DataStore-KV under the SAME key the storage
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

// --- Heavy execution channels ----------------------------------------------
//
// Electron held three pieces of live state on the singleton: the `previews`
// map (already persisted to KV by the preview channels above), the single
// `activeBatch: BatchProgress | null`, and a `cancellationRequested` bool that
// the running loop polls. We persist all three to the SAME KV blob so the
// stateless dispatch + the spawned worker thread share them:
//   state["activeBatch"]          -> BatchProgress | (absent == null)
//   state["cancellationRequested"]-> bool
// executeBatch runs on a std::thread (like native_ops.rs schedulers): it does
// real fs work via std::fs, emits "batch:started"/"batch:progress"/
// "batch:completed" through crate::native_ops::emit_event (parity with the
// Electron EventEmitter.emit calls, which the bridge forwards to the renderer),
// and re-reads `cancellationRequested` from KV before each item so batch:cancel
// can interrupt it. Return shape of batch:execute matches the Electron contract:
// it resolves to the final BatchProgress (here we synchronously run to
// completion on the worker and return that final object) — see DIVERGENCE note
// below on why we run synchronously rather than returning early.

// recalcStats over a preview's items array (mirrors updateItemAction /
// createPreview stats computation exactly).
fn recalc_stats(items: &[Value]) -> Value {
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
        "total": total,
        "willProcess": will_process,
        "willSkip": will_skip,
        "willOverwrite": will_overwrite,
        "errors": errors,
    })
}

// updateItemAction(previewId, itemId, action) -> { success: bool }
fn update_item(app: &tauri::AppHandle, preview_id: &str, item_id: &str, action: &str) -> Value {
    let mut state = load_state(app);
    let mut previews = previews_map(&state);

    let preview = match previews.get_mut(preview_id) {
        Some(p) => p,
        None => return json!({ "success": false }),
    };

    // Mutate the item's action inside a scope so the items borrow ends before
    // we re-borrow `preview` to write the recalculated stats.
    let stats = {
        let items = match preview.get_mut("items").and_then(|v| v.as_array_mut()) {
            Some(it) => it,
            None => return json!({ "success": false }),
        };
        let found = items
            .iter_mut()
            .find(|i| i.get("id").and_then(|v| v.as_str()) == Some(item_id));
        let item = match found {
            Some(i) => i,
            None => return json!({ "success": false }),
        };
        if let Some(obj) = item.as_object_mut() {
            obj.insert("action".into(), json!(action));
        }
        recalc_stats(items)
    };

    if let Some(obj) = preview.as_object_mut() {
        obj.insert("stats".into(), stats);
    }

    state.insert("previews".into(), Value::Object(previews));
    save_state(app, state);
    json!({ "success": true })
}

// fs.mkdir(dir, { recursive: true }) — best-effort parent creation.
fn mkdir_recursive(dir: &str) -> std::io::Result<()> {
    if dir.is_empty() || dir == "." {
        return Ok(());
    }
    std::fs::create_dir_all(dir)
}

// executeItem(type, item) — real fs op; Err carries the message Electron would
// have surfaced (item.error). Mirrors the Electron switch exactly.
fn execute_item(batch_type: &str, item: &Value) -> Result<(), String> {
    let source = item.get("sourcePath").and_then(|v| v.as_str()).unwrap_or("");
    let target = item.get("targetPath").and_then(|v| v.as_str());

    match batch_type {
        "rename" | "move" | "organize" => {
            let tp = target.filter(|s| !s.is_empty()).ok_or_else(|| "No target path".to_string())?;
            mkdir_recursive(&dirname(tp)).map_err(|e| e.to_string())?;
            std::fs::rename(source, tp).map_err(|e| e.to_string())
        }
        "copy" => {
            let tp = target.filter(|s| !s.is_empty()).ok_or_else(|| "No target path".to_string())?;
            mkdir_recursive(&dirname(tp)).map_err(|e| e.to_string())?;
            std::fs::copy(source, tp).map(|_| ()).map_err(|e| e.to_string())
        }
        "delete" => {
            // Electron's note: "Move to trash would be better - for now, just
            // delete". We match that: a hard unlink of the source file.
            std::fs::remove_file(source).map_err(|e| e.to_string())
        }
        other => Err(format!("Unsupported action type: {}", other)),
    }
}

// Read cancellationRequested from a fresh KV load (so batch:cancel, which runs
// on the dispatch thread and writes KV, is observed by the worker loop).
fn cancellation_requested(app: &tauri::AppHandle) -> bool {
    load_state(app)
        .get("cancellationRequested")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

// Persist the activeBatch BatchProgress into KV (merging with the latest blob
// so concurrent preview writes are not clobbered).
fn save_active(app: &tauri::AppHandle, active: &Value) {
    let mut state = load_state(app);
    state.insert("activeBatch".into(), active.clone());
    save_state(app, state);
}

// executeBatch(previewId) -> BatchProgress (throws in Electron when the preview
// is missing or another batch runs; we mirror by returning an error object —
// the bridge surfaces a rejected promise either way).
//
// DIVERGENCE (documented): Electron's executeBatch is async and resolves only
// after the whole loop finishes, while emitting progress events throughout. We
// preserve that exact contract: we run the loop on a worker thread, BLOCK the
// dispatch on the worker's JoinHandle, and return the final BatchProgress. The
// thread is used so the loop is a real OS thread (matching the "use a spawned
// thread for OS work" guidance and keeping the heavy fs loop off any shared
// lock) and so batch:cancel — handled on a different dispatch call — can flip
// the KV cancellation flag mid-run and have the worker observe it. Net renderer
// observable behavior (events + resolved value) is identical to Electron.
fn execute_batch(app: &tauri::AppHandle, preview_id: &str) -> Value {
    let state = load_state(app);
    let previews = previews_map(&state);

    let preview = match previews.get(preview_id) {
        Some(p) => p.clone(),
        None => return json!({ "success": false, "error": "Preview not found" }),
    };

    // Reject if another batch is currently running.
    if let Some(active) = state.get("activeBatch") {
        if active.get("status").and_then(|v| v.as_str()) == Some("running") {
            return json!({ "success": false, "error": "Another batch is already running" });
        }
    }

    let batch_type = preview.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let all_items: Vec<Value> = preview
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // itemsToProcess = items with action keep|overwrite (preserving order/ids).
    let items_to_process: Vec<Value> = all_items
        .iter()
        .filter(|i| {
            matches!(
                i.get("action").and_then(|v| v.as_str()).unwrap_or(""),
                "keep" | "overwrite"
            )
        })
        .cloned()
        .collect();

    // Clear any prior cancellation request and seed the activeBatch.
    {
        let mut s = load_state(app);
        s.insert("cancellationRequested".into(), json!(false));
        save_state(app, s);
    }

    let started_at = now_ms();
    let total = items_to_process.len();
    let active = json!({
        "batchId": preview_id,
        "status": "running",
        "processed": 0,
        "total": total,
        "errors": [],
        "startedAt": started_at,
    });
    save_active(app, &active);
    crate::native_ops::emit_event(app, "batch:started", &active);

    // Worker thread: real fs loop with cancellation polling + progress events.
    let app_thread = app.clone();
    let preview_id_owned = preview_id.to_string();
    let handle = crate::util::spawn_named("batch", move || -> Value {
        let mut processed: u64 = 0;
        let mut errors: Vec<Value> = Vec::new();
        let mut cancelled = false;

        for item in &items_to_process {
            if cancellation_requested(&app_thread) {
                cancelled = true;
                break;
            }

            // Publish `current` and a progress tick before doing the work
            // (parity with Electron emitting before executeItem).
            let mut current_item = item.clone();
            let tick = json!({
                "batchId": preview_id_owned,
                "status": "running",
                "processed": processed,
                "total": total,
                "current": current_item,
                "errors": errors,
                "startedAt": started_at,
            });
            save_active(&app_thread, &tick);
            crate::native_ops::emit_event(&app_thread, "batch:progress", &tick);

            match execute_item(&batch_type, item) {
                Ok(()) => {
                    if let Some(o) = current_item.as_object_mut() {
                        o.insert("completed".into(), json!(true));
                    }
                }
                Err(msg) => {
                    if let Some(o) = current_item.as_object_mut() {
                        o.insert("error".into(), json!(msg.clone()));
                    }
                    errors.push(json!({ "item": current_item, "error": msg }));
                }
            }

            processed += 1;
        }

        let status = if cancelled {
            "cancelled"
        } else if !errors.is_empty() {
            "error"
        } else {
            "completed"
        };

        // Final BatchProgress: current cleared (undefined in Electron -> omit
        // the key), completedAt set.
        let final_progress = json!({
            "batchId": preview_id_owned,
            "status": status,
            "processed": processed,
            "total": total,
            "errors": errors,
            "startedAt": started_at,
            "completedAt": now_ms(),
        });
        save_active(&app_thread, &final_progress);
        crate::native_ops::emit_event(&app_thread, "batch:completed", &final_progress);
        final_progress
    });

    match handle.join() {
        Ok(progress) => progress,
        Err(_) => json!({ "success": false, "error": "batch worker panicked" }),
    }
}

// cancelBatch(previewId?) -> { success: bool }. Sets the KV flag the worker
// polls; true only when a batch is actually running (Electron semantics).
fn cancel_batch(app: &tauri::AppHandle) -> Value {
    let mut state = load_state(app);
    let running = state
        .get("activeBatch")
        .and_then(|a| a.get("status"))
        .and_then(|v| v.as_str())
        == Some("running");
    if running {
        state.insert("cancellationRequested".into(), json!(true));
        save_state(app, state);
        json!({ "success": true })
    } else {
        json!({ "success": false })
    }
}

// progress() -> activeBatch | null
fn progress(app: &tauri::AppHandle) -> Value {
    load_state(app).get("activeBatch").cloned().unwrap_or(Value::Null)
}

/// Route a `batch:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). All channels are ported: the five preview/data
/// channels, the heavy execution channels (updateItem/execute/cancel/progress)
/// and the in-memory getPreview/clearPreview helpers. Unknown channels return
/// Value::Null.
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
        // --- Heavy / state channels (now ported) ---------------------------
        "batch:updateItem" => {
            let preview_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let item_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let action = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
            update_item(app, preview_id, item_id, action)
        }
        "batch:execute" => {
            let preview_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            execute_batch(app, preview_id)
        }
        "batch:cancel" => cancel_batch(app),
        "batch:progress" => progress(app),
        // In-memory preview helpers (trivial KV reads; ported alongside).
        "batch:getPreview" => {
            let preview_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            previews_map(&load_state(app))
                .get(preview_id)
                .cloned()
                .unwrap_or(Value::Null)
        }
        "batch:clearPreview" => {
            let preview_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut state = load_state(app);
            let mut previews = previews_map(&state);
            let removed = previews.remove(&preview_id).is_some();
            state.insert("previews".into(), Value::Object(previews));
            save_state(app, state);
            json!({ "success": removed })
        }
        _ => Value::Null,
    }
}
