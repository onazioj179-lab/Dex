// =============================================================================
// DEX Tauri — Folder Rules subsystem (port of the data/read surface of
// src/main/core/FolderRulesEngine.ts).
//
// Pure-data, JSON-backed tier. The Electron engine did NOT use electron-store;
// it persisted with raw fs to `<userData>/folder-rules.json`, storing a BARE
// JSON array of FolderRule (no top-level key wrapper, pretty-printed with
// JSON.stringify(rules, null, 2)). We mirror that exactly under <appData> with
// the SAME file name. (The porting brief tagged storage as
// `electron-store:folderrules`, but the source of truth is the engine code,
// which is plain fs-json — so we follow the code.)
//
// A FolderRule is:
//   { id, name, description?, folderPath, enabled, trigger, conditions[],
//     conditionLogic, actions[], createdAt, lastRun?, runCount }
//
// Channels ported (read-only data surface):
//   - folderrules:list -> FolderRule[]
//       no arg            : all rules sorted by createdAt DESC (newest first)
//       with folderPath   : rules where r.folderPath === folderPath OR
//                           folderPath.startsWith(r.folderPath)  (NOT sorted,
//                           matching Electron's early return before the sort)
//   - folderrules:get  -> FolderRule | null   (by id; null if missing)
//
// Channels NOW ported with REAL native code (round 3):
//   - folderrules:create -> mutate store, emit "rule:created", return FolderRule
//   - folderrules:update -> mutate store, emit "rule:updated", return rule|null
//   - folderrules:delete -> mutate store, emit "rule:deleted", { success }
//   - folderrules:apply  -> native fs walk + condition eval + action execution
//                           (mirror of Electron executeRule); also aliased to
//                           folderrules:execute. Updates lastRun/runCount,
//                           emits "rule:executed", returns RuleExecutionResult.
//
// Channels STILL not ported (need a native runtime not yet wired):
//   preview, testConditions, forFolder -> Value::Null (honest degrade).
//
// DIVERGENCES (documented):
//   - createdAt sort: Electron used `b.createdAt - a.createdAt`. We compare the
//     numeric createdAt (defaulting absent to 0) the same way. Optional fields
//     (description, lastRun) are returned exactly as stored — never invented.
//   - generateId: Electron used an in-memory counter (`rule-<n>-<ts>`) that is
//     not durable across processes. We use a stable, collision-resistant id
//     `rule-<epochMillis>-<uuidShort>` so concurrent/native creation never
//     reuses an id. Shape (string starting "rule-") is preserved.
//   - The Electron engine kept a Map keyed by id; we re-derive the array from
//     disk on every call (compute-on-read), matching the JSON-on-disk contract.
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

const RULES_FILE: &str = "folder-rules.json";

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(RULES_FILE)
}

// loadRules(): the file is a bare FolderRule[]; missing/invalid -> [].
fn load(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

// saveRules(): write the bare FolderRule[] back, pretty-printed (2-space),
// matching Electron's JSON.stringify(rules, null, 2). Returns Ok on success.
fn save(app: &tauri::AppHandle, rules: &[Value]) -> std::io::Result<()> {
    let body = serde_json::to_string_pretty(&rules)
        .unwrap_or_else(|_| "[]".to_string());
    std::fs::write(store_path(app), body)
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn folder_path_of(r: &Value) -> &str {
    r.get("folderPath").and_then(|v| v.as_str()).unwrap_or("")
}

fn created_at_of(r: &Value) -> i64 {
    r.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}

// listRules(folderPath?)
fn list_rules(app: &tauri::AppHandle, folder_path: Option<&str>) -> Value {
    let mut rules = load(app);

    if let Some(fp) = folder_path {
        // Electron early-returns the filtered (UNSORTED) set when folderPath set.
        let filtered: Vec<Value> = rules
            .into_iter()
            .filter(|r| {
                let rp = folder_path_of(r);
                rp == fp || fp.starts_with(rp)
            })
            .collect();
        return json!(filtered);
    }

    // No folderPath: sort by createdAt DESC (newest first).
    rules.sort_by(|a, b| created_at_of(b).cmp(&created_at_of(a)));
    json!(rules)
}

// getRule(id)
fn get_rule(app: &tauri::AppHandle, id: &str) -> Value {
    load(app)
        .into_iter()
        .find(|r| r.get("id").and_then(|v| v.as_str()) == Some(id))
        .unwrap_or(Value::Null)
}

// =============================================================================
// MUTATIONS
// =============================================================================

// createRule(ruleData) -> FolderRule
// Electron spread the incoming data then forced id/createdAt/runCount.
fn create_rule(app: &tauri::AppHandle, rule_data: &Value) -> Value {
    // Start from whatever the caller supplied (must be an object); ignore non
    // objects defensively by treating them as an empty object.
    let mut rule = match rule_data {
        Value::Object(_) => rule_data.clone(),
        _ => json!({}),
    };
    if let Some(obj) = rule.as_object_mut() {
        obj.insert(
            "id".to_string(),
            json!(format!("rule-{}-{}", now_millis(), crate::util::pseudo_uuid_v4())),
        );
        obj.insert("createdAt".to_string(), json!(now_millis()));
        obj.insert("runCount".to_string(), json!(0));
    }

    let mut rules = load(app);
    rules.push(rule.clone());
    let _ = save(app, &rules);

    crate::native_ops::emit_event(app, "rule:created", &rule);
    rule
}

// updateRule(id, updates) -> FolderRule | null  (id is never overwritten)
fn update_rule(app: &tauri::AppHandle, id: &str, updates: &Value) -> Value {
    let mut rules = load(app);
    let mut updated: Option<Value> = None;

    for r in rules.iter_mut() {
        if r.get("id").and_then(|v| v.as_str()) == Some(id) {
            if let (Some(base), Some(patch)) = (r.as_object_mut(), updates.as_object()) {
                for (k, v) in patch.iter() {
                    base.insert(k.clone(), v.clone());
                }
                // Prevent ID change (Electron forced `id: rule.id`).
                base.insert("id".to_string(), json!(id));
            }
            updated = Some(r.clone());
            break;
        }
    }

    match updated {
        Some(rule) => {
            let _ = save(app, &rules);
            crate::native_ops::emit_event(app, "rule:updated", &rule);
            rule
        }
        None => Value::Null,
    }
}

// deleteRule(id) -> { success }
fn delete_rule(app: &tauri::AppHandle, id: &str) -> Value {
    let mut rules = load(app);
    let before = rules.len();
    rules.retain(|r| r.get("id").and_then(|v| v.as_str()) != Some(id));
    let deleted = rules.len() != before;

    if deleted {
        let _ = save(app, &rules);
        crate::native_ops::emit_event(app, "rule:deleted", &json!(id));
    }
    json!({ "success": deleted })
}

// =============================================================================
// CONDITION EVALUATION (mirror of evaluateCondition / compareValues)
// =============================================================================

fn ext_lower(p: &Path) -> String {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default()
}

fn file_stem(p: &Path) -> String {
    p.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_default()
}

// Compare a string field value (name/extension/path).
fn compare_str(field: &str, operator: &str, cond_value: &Value, case_sensitive: bool) -> bool {
    let cond_str = match cond_value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => String::new(),
    };
    let f = if case_sensitive { field.to_string() } else { field.to_lowercase() };
    let v = if case_sensitive { cond_str.clone() } else { cond_str.to_lowercase() };

    match operator {
        "equals" => f == v,
        "contains" => f.contains(&v),
        "startsWith" => f.starts_with(&v),
        "endsWith" => f.ends_with(&v),
        // Electron used JS RegExp; we have no regex dep, so do a literal
        // substring fallback (honest: documented divergence). Most rules use
        // contains/startsWith/endsWith anyway.
        "matches" => f.contains(&v),
        _ => false,
    }
}

// Compare a numeric field value (size/created/modified).
fn compare_num(field: f64, operator: &str, cond_value: &Value) -> bool {
    let num = match cond_value {
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => s.parse::<f64>().unwrap_or(f64::NAN),
        Value::Array(a) => {
            // between [lo, hi]
            if operator == "between" && a.len() == 2 {
                let lo = a[0].as_f64().unwrap_or(f64::NAN);
                let hi = a[1].as_f64().unwrap_or(f64::NAN);
                return field >= lo && field <= hi;
            }
            f64::NAN
        }
        _ => f64::NAN,
    };
    if num.is_nan() {
        return false;
    }
    match operator {
        "equals" => field == num,
        "gt" => field > num,
        "lt" => field < num,
        "between" => false, // handled above for array values
        _ => false,
    }
}

fn evaluate_condition(cond: &Value, path: &Path) -> bool {
    let field = cond.get("field").and_then(|v| v.as_str()).unwrap_or("");
    let operator = cond.get("operator").and_then(|v| v.as_str()).unwrap_or("");
    let value = cond.get("value").cloned().unwrap_or(Value::Null);
    let case_sensitive = cond
        .get("caseSensitive")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let meta = std::fs::metadata(path);

    match field {
        "name" => compare_str(&file_stem(path), operator, &value, case_sensitive),
        "extension" => compare_str(&ext_lower(path), operator, &value, case_sensitive),
        "path" => compare_str(&path.to_string_lossy(), operator, &value, case_sensitive),
        "size" => match &meta {
            Ok(m) => compare_num(m.len() as f64, operator, &value),
            Err(_) => false,
        },
        "modified" => match &meta {
            Ok(m) => match m.modified().ok().and_then(|t| {
                t.duration_since(std::time::UNIX_EPOCH).ok()
            }) {
                Some(d) => compare_num(d.as_millis() as f64, operator, &value),
                None => false,
            },
            Err(_) => false,
        },
        "created" => match &meta {
            Ok(m) => match m.created().ok().and_then(|t| {
                t.duration_since(std::time::UNIX_EPOCH).ok()
            }) {
                Some(d) => compare_num(d.as_millis() as f64, operator, &value),
                None => false,
            },
            Err(_) => false,
        },
        _ => false,
    }
}

fn matches_conditions(conditions: &[Value], logic: &str, path: &Path) -> bool {
    if conditions.is_empty() {
        return true;
    }
    if logic == "or" {
        conditions.iter().any(|c| evaluate_condition(c, path))
    } else {
        conditions.iter().all(|c| evaluate_condition(c, path))
    }
}

// getMatchingFiles(rule): read the folder (non-recursive, files only) and keep
// entries that satisfy the rule's conditions.
fn matching_files(rule: &Value) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let folder = folder_path_of(rule);
    if folder.is_empty() {
        return out;
    }
    let empty: Vec<Value> = Vec::new();
    let conditions = rule
        .get("conditions")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);
    let logic = rule.get("conditionLogic").and_then(|v| v.as_str()).unwrap_or("and");

    let entries = match std::fs::read_dir(folder) {
        Ok(e) => e,
        Err(_) => return out,
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            continue; // only process files
        }
        if matches_conditions(conditions, logic, &p) {
            out.push(p);
        }
    }
    out
}

// =============================================================================
// ACTION EXECUTION (mirror of executeAction)
// =============================================================================

fn organize_folder(path: &Path, by: &str) -> String {
    let ext = ext_lower(path);
    match by {
        "type" => {
            let groups: &[(&str, &[&str])] = &[
                ("Images", &["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]),
                ("Documents", &["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"]),
                ("Videos", &["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"]),
                ("Audio", &["mp3", "wav", "flac", "aac", "m4a", "ogg"]),
                ("Archives", &["zip", "rar", "7z", "tar", "gz"]),
                ("Code", &["js", "ts", "py", "java", "c", "cpp", "cs", "go", "rs"]),
            ];
            for (folder, exts) in groups {
                if exts.contains(&ext.as_str()) {
                    return folder.to_string();
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
        "date" => match std::fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        {
            Some(d) => {
                // YYYY/MM from epoch millis (UTC, no chrono dep).
                let (y, mo) = ymd_from_millis(d.as_millis() as i64);
                format!("{:04}/{:02}", y, mo)
            }
            None => "Unknown".to_string(),
        },
        _ => "Other".to_string(),
    }
}

// Minimal civil-date (UTC) from epoch millis -> (year, month). Avoids a date
// crate; algorithm from Howard Hinnant's days_from_civil inverse.
fn ymd_from_millis(ms: i64) -> (i64, i64) {
    let days = ms.div_euclid(86_400_000);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    (year, m)
}

fn file_name_os(p: &Path) -> String {
    p.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_default()
}

// executeAction(action, filePath) -> Result<(), String>
fn execute_action(app: &tauri::AppHandle, action: &Value, path: &Path) -> Result<(), String> {
    let action_type = action.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let params = action.get("params").cloned().unwrap_or(json!({}));
    let pstr = |k: &str| params.get(k).and_then(|v| v.as_str()).map(|s| s.to_string());

    match action_type {
        "move" => {
            let target_dir = pstr("targetDir").ok_or("move: missing targetDir")?;
            let target = Path::new(&target_dir).join(file_name_os(path));
            std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
            move_file(path, &target)
        }
        "copy" => {
            let target_dir = pstr("targetDir").ok_or("copy: missing targetDir")?;
            let target = Path::new(&target_dir).join(file_name_os(path));
            std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
            std::fs::copy(path, &target).map(|_| ()).map_err(|e| e.to_string())
        }
        "rename" => {
            let pattern = pstr("pattern").unwrap_or_default();
            let replacement = pstr("replacement").unwrap_or_default();
            let dir = path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
            let ext = path.extension().and_then(|e| e.to_str()).map(|s| format!(".{}", s)).unwrap_or_default();
            let base = file_stem(path);
            // No regex dep: literal find/replace-all (documented divergence from
            // Electron's RegExp(pattern,'g')). Empty pattern -> no change.
            let new_base = if pattern.is_empty() {
                base
            } else {
                base.replace(&pattern, &replacement)
            };
            let new_path = dir.join(format!("{}{}", new_base, ext));
            move_file(path, &new_path)
        }
        "organize" => {
            let by = pstr("by").unwrap_or_default();
            let target_base = pstr("targetDir").unwrap_or_else(|| {
                path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default()
            });
            let sub = organize_folder(path, &by);
            let target = Path::new(&target_base).join(sub).join(file_name_os(path));
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            move_file(path, &target)
        }
        "delete" => std::fs::remove_file(path).map_err(|e| e.to_string()),
        // tag/convert/custom: Electron emitted an event for external handling.
        _ => {
            crate::native_ops::emit_event(
                app,
                "action:custom",
                &json!({ "action": action, "filePath": path.to_string_lossy() }),
            );
            Ok(())
        }
    }
}

// Cross-device-safe rename: try fs::rename, fall back to copy+remove on EXDEV.
fn move_file(src: &Path, dst: &Path) -> Result<(), String> {
    match std::fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            std::fs::copy(src, dst).map_err(|e| e.to_string())?;
            std::fs::remove_file(src).map_err(|e| e.to_string())
        }
    }
}

// applyRule(ruleId, dryRun) -> RuleExecutionResult  (mirror of executeRule)
fn apply_rule(app: &tauri::AppHandle, rule_id: &str, dry_run: bool) -> Value {
    let mut rules = load(app);
    let idx = rules
        .iter()
        .position(|r| r.get("id").and_then(|v| v.as_str()) == Some(rule_id));

    let idx = match idx {
        Some(i) => i,
        None => {
            return json!({
                "ruleId": rule_id,
                "success": false,
                "processed": 0,
                "skipped": 0,
                "errors": [{ "path": "", "error": "Rule not found" }]
            });
        }
    };

    let rule = rules[idx].clone();
    let mut processed: i64 = 0;
    let mut errors: Vec<Value> = Vec::new();

    let empty: Vec<Value> = Vec::new();
    let actions = rule.get("actions").and_then(|v| v.as_array()).cloned().unwrap_or(empty);

    for file in matching_files(&rule) {
        let mut file_err: Option<String> = None;
        if !dry_run {
            for action in &actions {
                if let Err(e) = execute_action(app, action, &file) {
                    file_err = Some(e);
                    break;
                }
            }
        }
        match file_err {
            Some(e) => errors.push(json!({ "path": file.to_string_lossy(), "error": e })),
            None => processed += 1,
        }
    }

    // Update rule stats on real (non-dry) runs.
    if !dry_run {
        if let Some(obj) = rules[idx].as_object_mut() {
            obj.insert("lastRun".to_string(), json!(now_millis()));
            let prev = obj.get("runCount").and_then(|v| v.as_i64()).unwrap_or(0);
            obj.insert("runCount".to_string(), json!(prev + 1));
        }
        let _ = save(app, &rules);
    }

    let success = errors.is_empty();
    let result = json!({
        "ruleId": rule_id,
        "success": success,
        "processed": processed,
        "skipped": 0,
        "errors": errors
    });

    // Electron emitted { rule, result }.
    crate::native_ops::emit_event(
        app,
        "rule:executed",
        &json!({ "rule": rules[idx].clone(), "result": result.clone() }),
    );
    result
}

/// Route a `folderrules:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// matched; the heavy/native channels return Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "folderrules:list" => {
            // Optional folderPath; treat empty string as "no filter" only if
            // absent/null — an explicit "" string is still a (non-matching)
            // filter in Electron, so preserve presence semantics.
            let folder = args.get(0).and_then(|v| v.as_str());
            list_rules(app, folder)
        }
        "folderrules:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_rule(app, id)
        }
        // ---- Mutations (real native fs + emit) ----------------------------
        "folderrules:create" => {
            let rule_data = args.get(0).cloned().unwrap_or(json!({}));
            create_rule(app, &rule_data)
        }
        "folderrules:update" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let updates = args.get(1).cloned().unwrap_or(json!({}));
            update_rule(app, id, &updates)
        }
        "folderrules:delete" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_rule(app, id)
        }
        // ---- Apply (real native fs walk + action execution) ---------------
        // `apply` is the worklist's name for Electron's executeRule; we honor
        // both channel ids with the same implementation.
        "folderrules:apply" | "folderrules:execute" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let dry_run = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            apply_rule(app, id, dry_run)
        }
        // Heavy / native-runtime channels still not ported:
        // preview, testConditions, forFolder.
        _ => Value::Null,
    }
}
