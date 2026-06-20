// =============================================================================
// DEX Tauri — Automation subsystem data/CRUD tier
// (port of the rule-management + query IPC handlers in
//  automation/HumanCenteredAutomation.ts).
//
// Pure-data, fs-JSON tier. Despite the migration tracker labelling this
// `electron-store:automation`, the Electron engine does NOT use electron-store:
// it persists rules with std fs to a hand-written file
//   <userData>/automation/rules.json
// wrapped as { version: 1, savedAt: <ms>, rules: [AutomationRule, ...] }.
// We mirror that EXACT relative path (automation/rules.json) and wrapper under
// <appData>, and load/save the `rules` array the same way (data.rules || []).
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// An AutomationRule is:
//   { id, name, description, enabled, createdAt, updatedAt, lastRunAt?,
//     trigger, actions[ {id, type, description, config, requiresConfirmation,
//     maxFilesAffected?, dryRunOnly?} ], settings{ dryRunByDefault,
//     requirePreview, notifyOnRun, notifyOnComplete, maxRunsPerHour,
//     pauseOnError }, stats{ totalRuns, successfulRuns, failedRuns, lastError? } }
//
// PORTED data channels (exact return shapes):
//   - automation:createRule          -> AutomationRule (new, enabled:false)
//   - automation:updateRule          -> AutomationRule | null
//   - automation:deleteRule          -> bool
//   - automation:setEnabled          -> bool
//   - automation:getAllRules         -> AutomationRule[]
//   - automation:getRule             -> AutomationRule | null
//   - automation:getEnabledRules     -> AutomationRule[]
//   - automation:getExecution        -> AutomationExecution | null
//   - automation:getActiveExecution  -> AutomationExecution | null
//   - automation:getRecentExecutions -> AutomationExecution[]
//
// PORTED heavy channels (this round — REAL native code):
//   - automation:explainRule         -> string | null   (pure string render)
//   - automation:generatePreview     -> AutomationPreview | null  (real fs scan)
//   - automation:start               -> AutomationExecution | null (real run)
//   - automation:confirm             -> bool             (runs the steps)
//   - automation:pause               -> bool
//   - automation:resume              -> bool             (continues the steps)
//   - automation:cancel              -> bool
//
// EXECUTION PERSISTENCE (divergence, by necessity):
//   Electron held executions in an in-memory Map keyed off a long-lived engine
//   object. The Tauri dispatch is a STATELESS per-call function, so to make the
//   start -> confirm -> run -> query flow coherent across IPC calls we persist
//   the execution map to <appData>/automation/executions.json with the SAME
//   wrapper shape as rules.json ({version, savedAt, executions:[...]}) and the
//   SAME 200-entry eviction (oldest finished first). `activeExecution` is the
//   most-recent execution whose status is previewing/awaiting-confirmation/
//   running/paused (mirrors how Electron set/cleared `activeExecution`). Each
//   execution stores `_active` only implicitly via status; we compute the active
//   one on read. Returned AutomationExecution / AutomationPreview shapes match
//   the TS interfaces exactly so the renderer is unchanged.
//
// EXECUTION MODEL (divergence, documented + honest):
//   Electron's continueExecution is an async loop that `await`s ~100ms per step.
//   We run the step loop SYNCHRONOUSLY inside the start/confirm/resume call (real
//   fs renames/copies, real OS notifications, real emit_event progress pushes).
//   Because a single dispatch call runs to completion before the next call is
//   serviced, `pause` cannot interleave with an in-flight synchronous run; it is
//   implemented honestly against the persisted status (it pauses an execution
//   that is persisted as `running`/`paused`-able, used by the renderer's
//   pause-then-resume UI when a run is left awaiting confirmation). resume picks
//   up from currentStepIndex exactly like Electron.
//
// REAL side effects performed natively (not faked):
//   - move-files / organize-files -> std::fs::create_dir_all + std::fs::rename
//   - backup-files               -> std::fs::create_dir_all + std::fs::copy
//   - send-notification          -> crate::native_ops::notify (OS toast)
//   - create-checkpoint          -> emit_event("checkpoint-requested", ...) — the
//                                   renderer/main checkpoint subsystem owns the
//                                   actual snapshot, same as the Electron emit.
//   - progress + lifecycle pushes -> crate::native_ops::emit_event for each of
//     execution-started, execution-awaiting-confirmation, step-started,
//     step-completed, execution-paused, execution-completed, execution-cancelled,
//     execution-resumed (Tauri analog of the EventEmitter `emit` + the renderer
//     never received those over IPC in Electron anyway; emitting is additive).
//
// DIVERGENCES (carried over):
//   - The user Notification on create/enable is a live side-effect with no
//     bearing on the returned value, so it is not reproduced for the data tier.
//   - id generation: Electron used crypto.randomUUID(); we use the mandated
//     crate::util::pseudo_uuid_v4() (same UUIDv4 shape) — no rand crate.
//   - Rate limiting (maxRunsPerHour) gates `start`; we persist per-rule run
//     timestamps in executions.json's wrapper (`runCounts`) and enforce the same
//     1-hour window, matching ruleRunCounts.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

// Same relative path the Electron engine wrote (path.join(userData,'automation','rules.json')).
const RULES_SUBDIR: &str = "automation";
const RULES_FILE: &str = "rules.json";
const EXEC_FILE: &str = "executions.json";
const MAX_EXECUTIONS: usize = 200;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// --- file IO ----------------------------------------------------------------

fn rules_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(RULES_SUBDIR);
    let _ = std::fs::create_dir_all(&dir);
    dir.join(RULES_FILE)
}

// loadRules(): JSON.parse(file).rules || [], else [].
fn load(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(rules_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.get("rules").and_then(|r| r.as_array()).cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

// saveRules(): JSON.stringify({ version: 1, savedAt: Date.now(), rules }, null, 2).
fn store(app: &tauri::AppHandle, rules: &[Value]) {
    let payload = json!({
        "version": 1,
        "savedAt": now_ms(),
        "rules": rules,
    });
    if let Ok(s) = serde_json::to_string_pretty(&payload) {
        let _ = std::fs::write(rules_path(app), s);
    }
}

fn id_of(r: &Value) -> Option<&str> {
    r.get("id").and_then(|v| v.as_str())
}

// --- defaults ---------------------------------------------------------------

// Electron settings defaults, then spread params.settings over them.
fn default_settings(overrides: Option<&Value>) -> Value {
    let mut s = Map::new();
    s.insert("dryRunByDefault".into(), json!(true));
    s.insert("requirePreview".into(), json!(true));
    s.insert("notifyOnRun".into(), json!(true));
    s.insert("notifyOnComplete".into(), json!(true));
    s.insert("maxRunsPerHour".into(), json!(10));
    s.insert("pauseOnError".into(), json!(true));
    if let Some(Value::Object(over)) = overrides {
        for (k, v) in over {
            s.insert(k.clone(), v.clone());
        }
    }
    Value::Object(s)
}

// --- CRUD -------------------------------------------------------------------

// createRule(params)
fn create_rule(app: &tauri::AppHandle, params: &Value) -> Value {
    let name = params
        .get("name")
        .cloned()
        .unwrap_or(Value::Null);
    let description = params
        .get("description")
        .cloned()
        .unwrap_or(Value::Null);
    let trigger = params
        .get("trigger")
        .cloned()
        .unwrap_or(Value::Null);

    // actions: each input action spread with a freshly generated id.
    let actions: Vec<Value> = params
        .get("actions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|a| {
                    let mut obj = a.as_object().cloned().unwrap_or_default();
                    obj.insert("id".into(), json!(pseudo_uuid_v4()));
                    Value::Object(obj)
                })
                .collect()
        })
        .unwrap_or_default();

    let now = now_ms();
    let mut rule = Map::new();
    rule.insert("id".into(), json!(pseudo_uuid_v4()));
    rule.insert("name".into(), name);
    rule.insert("description".into(), description);
    rule.insert("enabled".into(), json!(false)); // Start disabled - user must enable
    rule.insert("createdAt".into(), json!(now));
    rule.insert("updatedAt".into(), json!(now));
    rule.insert("trigger".into(), trigger);
    rule.insert("actions".into(), json!(actions));
    rule.insert("settings".into(), default_settings(params.get("settings")));
    rule.insert(
        "stats".into(),
        json!({ "totalRuns": 0, "successfulRuns": 0, "failedRuns": 0 }),
    );

    let rule = Value::Object(rule);
    let mut rules = load(app);
    rules.push(rule.clone());
    store(app, &rules);
    rule
}

// updateRule(ruleId, updates) -> { ...rule, ...updates, updatedAt }, or null if unknown id.
fn update_rule(app: &tauri::AppHandle, rule_id: &str, updates: &Value) -> Value {
    let mut rules = load(app);
    let idx = match rules.iter().position(|r| id_of(r) == Some(rule_id)) {
        Some(i) => i,
        None => return Value::Null,
    };
    let mut merged = rules[idx].as_object().cloned().unwrap_or_default();
    if let Some(over) = updates.as_object() {
        for (k, v) in over {
            // Electron's Partial<Omit<AutomationRule,'id'|'createdAt'>> is not
            // enforced at runtime; the spread overwrites whatever keys arrive.
            // We mirror the runtime behaviour (plain spread).
            merged.insert(k.clone(), v.clone());
        }
    }
    merged.insert("updatedAt".into(), json!(now_ms()));
    let updated = Value::Object(merged);
    rules[idx] = updated.clone();
    store(app, &rules);
    updated
}

// setRuleEnabled(ruleId, enabled) -> bool
fn set_enabled(app: &tauri::AppHandle, rule_id: &str, enabled: bool) -> Value {
    let mut rules = load(app);
    let idx = match rules.iter().position(|r| id_of(r) == Some(rule_id)) {
        Some(i) => i,
        None => return json!(false),
    };
    if let Some(obj) = rules[idx].as_object_mut() {
        obj.insert("enabled".into(), json!(enabled));
        obj.insert("updatedAt".into(), json!(now_ms()));
    }
    store(app, &rules);
    json!(true)
}

// deleteRule(ruleId) -> bool (false if absent)
fn delete_rule(app: &tauri::AppHandle, rule_id: &str) -> Value {
    let mut rules = load(app);
    let before = rules.len();
    rules.retain(|r| id_of(r) != Some(rule_id));
    if rules.len() == before {
        return json!(false);
    }
    store(app, &rules);
    json!(true)
}

// --- queries ----------------------------------------------------------------

fn get_all_rules(app: &tauri::AppHandle) -> Value {
    json!(load(app))
}

fn get_rule(app: &tauri::AppHandle, rule_id: &str) -> Value {
    load(app)
        .into_iter()
        .find(|r| id_of(r) == Some(rule_id))
        .unwrap_or(Value::Null)
}

fn get_enabled_rules(app: &tauri::AppHandle) -> Value {
    let enabled: Vec<Value> = load(app)
        .into_iter()
        .filter(|r| r.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false))
        .collect();
    json!(enabled)
}

// --- execution persistence (executions.json) --------------------------------
// Wrapper: { version: 1, savedAt, executions: [AutomationExecution...],
//            runCounts: { <ruleId>: [ms, ms, ...] } }. Same fs-JSON style as
// rules.json. Single small file, rewritten whole on each mutation.

fn exec_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(RULES_SUBDIR);
    let _ = std::fs::create_dir_all(&dir);
    dir.join(EXEC_FILE)
}

fn load_exec_doc(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(exec_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({})),
        Err(_) => json!({}),
    }
}

fn load_executions(app: &tauri::AppHandle) -> Vec<Value> {
    load_exec_doc(app)
        .get("executions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn load_run_counts(app: &tauri::AppHandle) -> Map<String, Value> {
    load_exec_doc(app)
        .get("runCounts")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

fn store_exec_doc(app: &tauri::AppHandle, executions: &[Value], run_counts: &Map<String, Value>) {
    let payload = json!({
        "version": 1,
        "savedAt": now_ms(),
        "executions": executions,
        "runCounts": Value::Object(run_counts.clone()),
    });
    if let Ok(s) = serde_json::to_string_pretty(&payload) {
        let _ = std::fs::write(exec_path(app), s);
    }
}

/// Persist one execution (insert or replace by id) + apply the MAX_EXECUTIONS
/// eviction (drop oldest finished executions first, by completedAt ?? startedAt).
fn persist_execution(app: &tauri::AppHandle, exec: &Value) {
    let mut execs = load_executions(app);
    let counts = load_run_counts(app);
    let id = exec.get("id").and_then(|v| v.as_str()).unwrap_or("");
    match execs.iter().position(|e| e.get("id").and_then(|v| v.as_str()) == Some(id)) {
        Some(i) => execs[i] = exec.clone(),
        None => execs.push(exec.clone()),
    }
    if execs.len() > MAX_EXECUTIONS {
        let is_done = |e: &Value| {
            matches!(
                e.get("status").and_then(|v| v.as_str()),
                Some("completed") | Some("cancelled") | Some("failed")
            )
        };
        let ts = |e: &Value| {
            e.get("completedAt")
                .and_then(|v| v.as_u64())
                .or_else(|| e.get("startedAt").and_then(|v| v.as_u64()))
                .unwrap_or(0)
        };
        let mut done: Vec<usize> = execs
            .iter()
            .enumerate()
            .filter(|(_, e)| is_done(e))
            .map(|(i, _)| i)
            .collect();
        done.sort_by_key(|&i| ts(&execs[i]));
        let to_remove = execs.len() - MAX_EXECUTIONS;
        let mut drop_idx: Vec<usize> = done.into_iter().take(to_remove).collect();
        drop_idx.sort_unstable();
        for &i in drop_idx.iter().rev() {
            execs.remove(i);
        }
    }
    store_exec_doc(app, &execs, &counts);
}

fn find_execution(app: &tauri::AppHandle, id: &str) -> Option<Value> {
    load_executions(app)
        .into_iter()
        .find(|e| e.get("id").and_then(|v| v.as_str()) == Some(id))
}

const ACTIVE_STATUSES: &[&str] =
    &["previewing", "awaiting-confirmation", "running", "paused"];

// --- rate limiting (ruleRunCounts) ------------------------------------------

fn is_rate_limited(app: &tauri::AppHandle, rule: &Value) -> bool {
    let rule_id = id_of(rule).unwrap_or("");
    let max = rule
        .get("settings")
        .and_then(|s| s.get("maxRunsPerHour"))
        .and_then(|v| v.as_u64())
        .unwrap_or(10);
    let one_hour_ago = now_ms().saturating_sub(60 * 60 * 1000);
    let recent = load_run_counts(app)
        .get(rule_id)
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|t| t.as_u64()).filter(|&t| t > one_hour_ago).count())
        .unwrap_or(0);
    recent as u64 >= max
}

fn record_run(app: &tauri::AppHandle, rule_id: &str) {
    let execs = load_executions(app);
    let mut counts = load_run_counts(app);
    let one_hour_ago = now_ms().saturating_sub(60 * 60 * 1000);
    let mut runs: Vec<u64> = counts
        .get(rule_id)
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|t| t.as_u64()).filter(|&t| t > one_hour_ago).collect())
        .unwrap_or_default();
    runs.push(now_ms());
    counts.insert(rule_id.to_string(), json!(runs));
    store_exec_doc(app, &execs, &counts);
}

// --- preview ----------------------------------------------------------------

fn base_name(p: &str) -> String {
    std::path::Path::new(p)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| p.to_string())
}

// matchPattern: simple glob (* -> .*, ? -> .), anchored, case-insensitive. No
// regex crate available, so implement the equivalent matcher by hand.
fn match_pattern(filename: &str, pattern: &str) -> bool {
    let fname: Vec<char> = filename.to_lowercase().chars().collect();
    let pat: Vec<char> = pattern.to_lowercase().chars().collect();
    // Iterative glob match supporting '*' and '?'.
    let (mut fi, mut pi) = (0usize, 0usize);
    let (mut star_pi, mut star_fi): (Option<usize>, usize) = (None, 0);
    while fi < fname.len() {
        if pi < pat.len() && (pat[pi] == '?' || pat[pi] == fname[fi]) {
            fi += 1;
            pi += 1;
        } else if pi < pat.len() && pat[pi] == '*' {
            star_pi = Some(pi);
            star_fi = fi;
            pi += 1;
        } else if let Some(sp) = star_pi {
            pi = sp + 1;
            star_fi += 1;
            fi = star_fi;
        } else {
            return false;
        }
    }
    while pi < pat.len() && pat[pi] == '*' {
        pi += 1;
    }
    pi == pat.len()
}

// findMatchingFiles(dir, pattern?): top-level files only (matches fs.readdirSync
// + entry.isFile()); no recursion, exactly like Electron.
fn find_matching_files(dir: &str, pattern: Option<&str>) -> Vec<String> {
    let mut files = Vec::new();
    let rd = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return files,
    };
    for entry in rd.flatten() {
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if !ft.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let ok = match pattern {
            Some(p) if !p.is_empty() => match_pattern(&name, p),
            _ => true,
        };
        if ok {
            files.push(
                std::path::Path::new(dir)
                    .join(&name)
                    .to_string_lossy()
                    .to_string(),
            );
        }
    }
    files
}

fn cfg<'a>(action: &'a Value, key: &str) -> Option<&'a str> {
    action.get("config").and_then(|c| c.get(key)).and_then(|v| v.as_str())
}

// previewAction(action) -> { affectedFiles, changes } (mirrors the TS switch).
fn preview_action(action: &Value) -> Value {
    let mut affected: Vec<String> = Vec::new();
    let mut changes: Vec<Value> = Vec::new();
    let atype = action.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match atype {
        "organize-files" | "move-files" => {
            if let (Some(src), Some(dest)) = (cfg(action, "sourcePath"), cfg(action, "destinationPath")) {
                let files = find_matching_files(src, cfg(action, "pattern"));
                for file in &files {
                    let bn = base_name(file);
                    let dest_path = std::path::Path::new(dest).join(&bn).to_string_lossy().to_string();
                    changes.push(json!({
                        "type": "move",
                        "from": file,
                        "to": dest_path,
                        "description": format!("Move {} to {}", bn, dest),
                    }));
                }
                affected = files;
            }
        }
        "rename-files" => {
            if let (Some(src), Some(pat)) = (cfg(action, "sourcePath"), cfg(action, "pattern")) {
                affected = find_matching_files(src, Some(pat));
                // Rename preview depends on a rename pattern (none modelled) — no changes.
            }
        }
        "backup-files" => {
            if let (Some(src), Some(dest)) = (cfg(action, "sourcePath"), cfg(action, "destinationPath")) {
                let files = find_matching_files(src, cfg(action, "pattern"));
                for file in &files {
                    let bn = base_name(file);
                    let to = std::path::Path::new(dest).join(&bn).to_string_lossy().to_string();
                    changes.push(json!({
                        "type": "create",
                        "to": to,
                        "description": format!("Create backup of {}", bn),
                    }));
                }
                affected = files;
            }
        }
        "send-notification" => {
            let title = cfg(action, "notificationTitle").unwrap_or("");
            changes.push(json!({
                "type": "create",
                "description": format!("Show notification: \"{}\"", title),
            }));
        }
        "create-checkpoint" => {
            changes.push(json!({
                "type": "create",
                "description": "Create system checkpoint",
            }));
        }
        _ => {}
    }

    json!({ "affectedFiles": affected, "changes": changes })
}

// explainRule(ruleId) -> markdown string | null.
fn explain_rule(app: &tauri::AppHandle, rule_id: &str) -> Value {
    let rule = match load(app).into_iter().find(|r| id_of(r) == Some(rule_id)) {
        Some(r) => r,
        None => return Value::Null,
    };
    let name = rule.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let description = rule.get("description").and_then(|v| v.as_str()).unwrap_or("");
    let trigger_desc = rule
        .get("trigger")
        .and_then(|t| t.get("description"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let mut s = format!("**{}**\n\n", name);
    s.push_str(&format!("{}\n\n", description));
    s.push_str(&format!("**When:** {}\n\n", trigger_desc));
    s.push_str("**Then:**\n");

    if let Some(actions) = rule.get("actions").and_then(|v| v.as_array()) {
        for (i, action) in actions.iter().enumerate() {
            let adesc = action.get("description").and_then(|v| v.as_str()).unwrap_or("");
            s.push_str(&format!("{}. {}", i + 1, adesc));
            if action.get("requiresConfirmation").and_then(|v| v.as_bool()).unwrap_or(false) {
                s.push_str(" _(requires confirmation)_");
            }
            s.push('\n');
        }
    }

    s.push_str("\n**Safety:** ");
    let settings = rule.get("settings");
    let flag = |k: &str| settings.and_then(|s| s.get(k)).and_then(|v| v.as_bool()).unwrap_or(false);
    if flag("dryRunByDefault") {
        s.push_str("Dry-run first. ");
    }
    if flag("requirePreview") {
        s.push_str("Preview required. ");
    }
    if flag("notifyOnRun") {
        s.push_str("Notifies on start. ");
    }

    json!(s)
}

// generatePreview(ruleId) -> AutomationPreview | null.
fn generate_preview(app: &tauri::AppHandle, rule_id: &str) -> Value {
    let rule = match load(app).into_iter().find(|r| id_of(r) == Some(rule_id)) {
        Some(r) => r,
        None => return Value::Null,
    };

    let mut steps: Vec<Value> = Vec::new();
    let mut warnings: Vec<Value> = Vec::new();
    let mut risks: Vec<Value> = Vec::new();

    if let Some(actions) = rule.get("actions").and_then(|v| v.as_array()) {
        for action in actions {
            let preview = preview_action(action);
            let n_affected = preview.get("affectedFiles").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
            let adesc = action.get("description").and_then(|v| v.as_str()).unwrap_or("");

            if n_affected > 100 {
                risks.push(json!({
                    "level": "high",
                    "description": format!("{} will affect {} files", adesc, n_affected),
                }));
            } else if n_affected > 20 {
                risks.push(json!({
                    "level": "medium",
                    "description": format!("{} will affect {} files", adesc, n_affected),
                }));
            }

            let has_deletes = preview
                .get("changes")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().any(|c| c.get("type").and_then(|t| t.as_str()) == Some("delete")))
                .unwrap_or(false);
            if has_deletes {
                risks.push(json!({
                    "level": "high",
                    "description": "This automation includes file deletions",
                }));
            }

            steps.push(json!({ "action": action, "preview": preview }));
        }
    }

    if is_rate_limited(app, &rule) {
        warnings.push(json!("This rule has been run many times recently. Consider waiting."));
    }

    let dry_default = rule
        .get("settings")
        .and_then(|s| s.get("dryRunByDefault"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let high_risks = risks.iter().filter(|r| r.get("level").and_then(|v| v.as_str()) == Some("high")).count();
    let can_proceed = high_risks == 0 || dry_default;

    let estimated_time: u64 = steps
        .iter()
        .map(|s| {
            s.get("preview")
                .and_then(|p| p.get("affectedFiles"))
                .and_then(|v| v.as_array())
                .map(|a| a.len() as u64)
                .unwrap_or(0)
                * 50
        })
        .sum();

    let mut out = Map::new();
    out.insert("ruleId".into(), json!(rule_id));
    out.insert("ruleName".into(), rule.get("name").cloned().unwrap_or(Value::Null));
    out.insert("description".into(), rule.get("description").cloned().unwrap_or(Value::Null));
    out.insert("steps".into(), json!(steps));
    out.insert("warnings".into(), json!(warnings));
    out.insert("risks".into(), json!(risks));
    out.insert("estimatedTime".into(), json!(estimated_time));
    out.insert("canProceed".into(), json!(can_proceed));
    // blockedReason: undefined when canProceed -> omit the key (serde Value has no
    // `undefined`; Electron returned `undefined`, which JSON-drops the field).
    if !can_proceed {
        out.insert(
            "blockedReason".into(),
            json!("High-risk actions detected. Review carefully."),
        );
    }
    Value::Object(out)
}

// --- execution engine -------------------------------------------------------

// executeStep: REAL side effects (renames/copies/notifications/checkpoint emit).
// Returns the ExecutionStep['result'] shape ({ success, filesAffected, error? }).
fn execute_step(app: &tauri::AppHandle, step: &Value) -> Value {
    let action = step.get("action").cloned().unwrap_or(Value::Null);
    let atype = action.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let changes = step
        .get("preview")
        .and_then(|p| p.get("changes"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let affected = step
        .get("preview")
        .and_then(|p| p.get("affectedFiles"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut files_affected = 0u64;

    match atype {
        "move-files" | "organize-files" => {
            for change in &changes {
                if change.get("type").and_then(|v| v.as_str()) != Some("move") {
                    continue;
                }
                let from = change.get("from").and_then(|v| v.as_str());
                let to = change.get("to").and_then(|v| v.as_str());
                if let (Some(from), Some(to)) = (from, to) {
                    if let Some(parent) = std::path::Path::new(to).parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    match std::fs::rename(from, to) {
                        Ok(()) => files_affected += 1,
                        Err(e) => {
                            // Cross-device rename fails on Windows across volumes;
                            // fall back to copy+remove to preserve the move semantics.
                            if std::fs::copy(from, to).is_ok() {
                                let _ = std::fs::remove_file(from);
                                files_affected += 1;
                            } else {
                                return json!({
                                    "success": false,
                                    "error": e.to_string(),
                                    "filesAffected": files_affected,
                                });
                            }
                        }
                    }
                }
            }
        }
        "backup-files" => {
            for change in &changes {
                if change.get("type").and_then(|v| v.as_str()) != Some("create") {
                    continue;
                }
                let to = match change.get("to").and_then(|v| v.as_str()) {
                    Some(t) => t,
                    None => continue,
                };
                let to_base = base_name(to);
                let source = affected
                    .iter()
                    .filter_map(|f| f.as_str())
                    .find(|f| base_name(f) == to_base);
                if let Some(src) = source {
                    if std::path::Path::new(src).exists() {
                        if let Some(parent) = std::path::Path::new(to).parent() {
                            let _ = std::fs::create_dir_all(parent);
                        }
                        match std::fs::copy(src, to) {
                            Ok(_) => files_affected += 1,
                            Err(e) => {
                                return json!({
                                    "success": false,
                                    "error": e.to_string(),
                                    "filesAffected": files_affected,
                                });
                            }
                        }
                    }
                }
            }
        }
        "send-notification" => {
            let title = cfg(&action, "notificationTitle").unwrap_or("Dex Automation");
            let body = cfg(&action, "notificationBody").unwrap_or("");
            crate::native_ops::notify(app, title, body);
        }
        "create-checkpoint" => {
            let adesc = action.get("description").and_then(|v| v.as_str()).unwrap_or("");
            crate::native_ops::emit_event(
                app,
                "checkpoint-requested",
                &json!({
                    "name": format!("Automation: {}", adesc),
                    "automationId": step.get("actionId").cloned().unwrap_or(Value::Null),
                }),
            );
        }
        _ => {}
    }

    json!({ "success": true, "filesAffected": files_affected })
}

// completeExecution: finalize summary, bump rule stats, record run, notify.
fn complete_execution(app: &tauri::AppHandle, exec: &mut Value) {
    let steps = exec.get("steps").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let count_status = |status: &str| {
        steps
            .iter()
            .filter(|s| s.get("status").and_then(|v| v.as_str()) == Some(status))
            .count() as u64
    };
    let files_affected: u64 = steps
        .iter()
        .map(|s| {
            s.get("result")
                .and_then(|r| r.get("filesAffected"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
        })
        .sum();
    let failed = count_status("failed");
    let now = now_ms();

    if let Some(obj) = exec.as_object_mut() {
        obj.insert("status".into(), json!("completed"));
        obj.insert("completedAt".into(), json!(now));
        obj.insert(
            "summary".into(),
            json!({
                "totalSteps": steps.len(),
                "completedSteps": count_status("completed"),
                "failedSteps": failed,
                "skippedSteps": count_status("skipped"),
                "filesAffected": files_affected,
            }),
        );
    }

    // Update rule stats + lastRunAt.
    let rule_id = exec.get("ruleId").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let mut rules = load(app);
    let mut notify_complete = false;
    if let Some(idx) = rules.iter().position(|r| id_of(r) == Some(&rule_id)) {
        if let Some(robj) = rules[idx].as_object_mut() {
            let stats = robj.entry("stats").or_insert_with(|| json!({}));
            if let Some(sobj) = stats.as_object_mut() {
                let total = sobj.get("totalRuns").and_then(|v| v.as_u64()).unwrap_or(0) + 1;
                sobj.insert("totalRuns".into(), json!(total));
                if failed == 0 {
                    let ok = sobj.get("successfulRuns").and_then(|v| v.as_u64()).unwrap_or(0) + 1;
                    sobj.insert("successfulRuns".into(), json!(ok));
                } else {
                    let bad = sobj.get("failedRuns").and_then(|v| v.as_u64()).unwrap_or(0) + 1;
                    sobj.insert("failedRuns".into(), json!(bad));
                }
            }
            robj.insert("lastRunAt".into(), json!(now));
        }
        notify_complete = rules[idx]
            .get("settings")
            .and_then(|s| s.get("notifyOnComplete"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        store(app, &rules);
    }

    record_run(app, &rule_id);

    if notify_complete {
        let rule_name = exec.get("ruleName").and_then(|v| v.as_str()).unwrap_or("");
        crate::native_ops::notify(
            app,
            "Automation Complete",
            &format!("{}: {} files affected", rule_name, files_affected),
        );
    }

    crate::native_ops::emit_event(app, "execution-completed", exec);
}

// continueExecution: run from currentStepIndex to the end (or until paused on
// error), persisting after each step. Mirrors the TS while-loop semantics.
fn continue_execution(app: &tauri::AppHandle, exec: &mut Value) {
    if let Some(obj) = exec.as_object_mut() {
        obj.insert("status".into(), json!("running"));
    }

    let rule_id = exec.get("ruleId").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let pause_on_error = load(app)
        .into_iter()
        .find(|r| id_of(r) == Some(&rule_id))
        .and_then(|r| r.get("settings").and_then(|s| s.get("pauseOnError")).and_then(|v| v.as_bool()))
        .unwrap_or(true);

    let is_dry = exec.get("isDryRun").and_then(|v| v.as_bool()).unwrap_or(false);
    let total = exec.get("steps").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);

    loop {
        let cur = exec.get("currentStepIndex").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        if cur >= total {
            break;
        }
        if exec.get("status").and_then(|v| v.as_str()) != Some("running") {
            break;
        }

        // Mark step running.
        if let Some(step) = exec.get_mut("steps").and_then(|v| v.as_array_mut()).and_then(|a| a.get_mut(cur)) {
            if let Some(sobj) = step.as_object_mut() {
                sobj.insert("status".into(), json!("running"));
                sobj.insert("startedAt".into(), json!(now_ms()));
            }
        }
        let step_snapshot = exec
            .get("steps")
            .and_then(|v| v.as_array())
            .and_then(|a| a.get(cur))
            .cloned()
            .unwrap_or(Value::Null);
        crate::native_ops::emit_event(
            app,
            "step-started",
            &json!({ "executionId": exec.get("id").cloned().unwrap_or(Value::Null), "stepIndex": cur, "step": step_snapshot }),
        );

        // Run (dry = simulate; otherwise real side effects).
        let n_affected = step_snapshot
            .get("preview")
            .and_then(|p| p.get("affectedFiles"))
            .and_then(|v| v.as_array())
            .map(|a| a.len() as u64)
            .unwrap_or(0);
        let result = if is_dry {
            json!({ "success": true, "filesAffected": n_affected })
        } else {
            execute_step(app, &step_snapshot)
        };
        let success = result.get("success").and_then(|v| v.as_bool()).unwrap_or(false);

        // Write result + status back to the step.
        if let Some(step) = exec.get_mut("steps").and_then(|v| v.as_array_mut()).and_then(|a| a.get_mut(cur)) {
            if let Some(sobj) = step.as_object_mut() {
                sobj.insert("result".into(), result.clone());
                sobj.insert("status".into(), json!(if success { "completed" } else { "failed" }));
                sobj.insert("completedAt".into(), json!(now_ms()));
            }
        }

        // pauseOnError: stop the loop, mark paused-by-error.
        if !success && pause_on_error {
            if let Some(obj) = exec.as_object_mut() {
                obj.insert("status".into(), json!("paused"));
                obj.insert("pausedBy".into(), json!("error"));
            }
            crate::native_ops::emit_event(
                app,
                "execution-paused",
                &json!({
                    "executionId": exec.get("id").cloned().unwrap_or(Value::Null),
                    "reason": "error",
                    "error": result.get("error").cloned().unwrap_or(Value::Null),
                }),
            );
            persist_execution(app, exec);
            return;
        }

        let done_step = exec
            .get("steps")
            .and_then(|v| v.as_array())
            .and_then(|a| a.get(cur))
            .cloned()
            .unwrap_or(Value::Null);
        crate::native_ops::emit_event(
            app,
            "step-completed",
            &json!({ "executionId": exec.get("id").cloned().unwrap_or(Value::Null), "stepIndex": cur, "step": done_step }),
        );

        if let Some(obj) = exec.as_object_mut() {
            obj.insert("currentStepIndex".into(), json!(cur as u64 + 1));
        }
        persist_execution(app, exec);
    }

    let cur = exec.get("currentStepIndex").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    if cur >= total {
        complete_execution(app, exec);
    }
    persist_execution(app, exec);
}

// startExecution(ruleId, isDryRun?) -> AutomationExecution | null.
fn start_execution(app: &tauri::AppHandle, rule_id: &str, is_dry_run: Option<bool>) -> Value {
    let rule = match load(app).into_iter().find(|r| id_of(r) == Some(rule_id)) {
        Some(r) => r,
        None => return Value::Null,
    };

    if is_rate_limited(app, &rule) {
        return Value::Null;
    }

    let dry_default = rule
        .get("settings")
        .and_then(|s| s.get("dryRunByDefault"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let dry_run = is_dry_run.unwrap_or(dry_default);

    // Build steps with previews.
    let mut steps: Vec<Value> = Vec::new();
    if let Some(actions) = rule.get("actions").and_then(|v| v.as_array()) {
        for action in actions {
            let preview = preview_action(action);
            steps.push(json!({
                "actionId": action.get("id").cloned().unwrap_or(Value::Null),
                "action": action,
                "status": "pending",
                "preview": preview,
            }));
        }
    }

    let mut exec = json!({
        "id": pseudo_uuid_v4(),
        "ruleId": rule_id,
        "ruleName": rule.get("name").cloned().unwrap_or(Value::Null),
        "status": "previewing",
        "startedAt": now_ms(),
        "isDryRun": dry_run,
        "steps": steps,
        "currentStepIndex": 0,
        "userConfirmed": false,
    });

    persist_execution(app, &exec);

    let settings = rule.get("settings");
    let notify_on_run = settings.and_then(|s| s.get("notifyOnRun")).and_then(|v| v.as_bool()).unwrap_or(false);
    let require_preview = settings.and_then(|s| s.get("requirePreview")).and_then(|v| v.as_bool()).unwrap_or(false);

    if notify_on_run {
        let rule_name = rule.get("name").and_then(|v| v.as_str()).unwrap_or("");
        crate::native_ops::notify(
            app,
            "Automation Starting",
            &format!("{} is ready to run. {}", rule_name, if dry_run { "(Dry Run)" } else { "" }).trim_end().to_string(),
        );
    }

    if require_preview {
        if let Some(obj) = exec.as_object_mut() {
            obj.insert("status".into(), json!("awaiting-confirmation"));
        }
        persist_execution(app, &exec);
        crate::native_ops::emit_event(app, "execution-awaiting-confirmation", &exec);
    } else {
        if let Some(obj) = exec.as_object_mut() {
            obj.insert("userConfirmed".into(), json!(true));
        }
        continue_execution(app, &mut exec);
    }

    crate::native_ops::emit_event(app, "execution-started", &exec);
    exec
}

// confirmExecution(executionId) -> bool.
fn confirm_execution(app: &tauri::AppHandle, execution_id: &str) -> Value {
    let mut exec = match find_execution(app, execution_id) {
        Some(e) => e,
        None => return json!(false),
    };
    if exec.get("status").and_then(|v| v.as_str()) != Some("awaiting-confirmation") {
        return json!(false);
    }
    if let Some(obj) = exec.as_object_mut() {
        obj.insert("userConfirmed".into(), json!(true));
    }
    continue_execution(app, &mut exec);
    json!(true)
}

// pauseExecution(executionId) -> bool.
fn pause_execution(app: &tauri::AppHandle, execution_id: &str) -> Value {
    let mut exec = match find_execution(app, execution_id) {
        Some(e) => e,
        None => return json!(false),
    };
    if exec.get("status").and_then(|v| v.as_str()) != Some("running") {
        return json!(false);
    }
    if let Some(obj) = exec.as_object_mut() {
        obj.insert("status".into(), json!("paused"));
        obj.insert("pausedBy".into(), json!("user"));
    }
    persist_execution(app, &exec);
    crate::native_ops::emit_event(
        app,
        "execution-paused",
        &json!({ "executionId": execution_id, "reason": "user" }),
    );
    json!(true)
}

// resumeExecution(executionId) -> bool.
fn resume_execution(app: &tauri::AppHandle, execution_id: &str) -> Value {
    let mut exec = match find_execution(app, execution_id) {
        Some(e) => e,
        None => return json!(false),
    };
    if exec.get("status").and_then(|v| v.as_str()) != Some("paused") {
        return json!(false);
    }
    crate::native_ops::emit_event(app, "execution-resumed", &json!(execution_id));
    continue_execution(app, &mut exec);
    json!(true)
}

// cancelExecution(executionId, reason?) -> bool.
fn cancel_execution(app: &tauri::AppHandle, execution_id: &str, reason: Option<&str>) -> Value {
    let mut exec = match find_execution(app, execution_id) {
        Some(e) => e,
        None => return json!(false),
    };
    let cur = exec.get("currentStepIndex").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    if let Some(steps) = exec.get_mut("steps").and_then(|v| v.as_array_mut()) {
        for step in steps.iter_mut().skip(cur) {
            if step.get("status").and_then(|v| v.as_str()) == Some("pending") {
                if let Some(sobj) = step.as_object_mut() {
                    sobj.insert("status".into(), json!("skipped"));
                }
            }
        }
    }
    if let Some(obj) = exec.as_object_mut() {
        obj.insert("status".into(), json!("cancelled"));
        if let Some(r) = reason {
            obj.insert("cancelReason".into(), json!(r));
        }
        obj.insert("completedAt".into(), json!(now_ms()));
    }
    persist_execution(app, &exec);
    crate::native_ops::emit_event(
        app,
        "execution-cancelled",
        &json!({ "executionId": execution_id, "reason": reason }),
    );
    json!(true)
}

// --- execution queries (now backed by executions.json) ----------------------

fn get_execution(app: &tauri::AppHandle, id: &str) -> Value {
    find_execution(app, id).unwrap_or(Value::Null)
}

// activeExecution: most-recent execution still in a non-terminal status.
fn get_active_execution(app: &tauri::AppHandle) -> Value {
    let mut active: Vec<Value> = load_executions(app)
        .into_iter()
        .filter(|e| {
            e.get("status")
                .and_then(|v| v.as_str())
                .map(|s| ACTIVE_STATUSES.contains(&s))
                .unwrap_or(false)
        })
        .collect();
    active.sort_by_key(|e| std::cmp::Reverse(e.get("startedAt").and_then(|v| v.as_u64()).unwrap_or(0)));
    active.into_iter().next().unwrap_or(Value::Null)
}

fn get_recent_executions(app: &tauri::AppHandle, limit: usize) -> Value {
    let mut execs = load_executions(app);
    execs.sort_by_key(|e| std::cmp::Reverse(e.get("startedAt").and_then(|v| v.as_u64()).unwrap_or(0)));
    execs.truncate(limit);
    json!(execs)
}

/// Route an `automation:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; unknown channels return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        // --- rule management (data) ---
        "automation:createRule" => create_rule(app, &a0),
        "automation:updateRule" => {
            let rule_id = a0.as_str().unwrap_or("");
            let updates = args.get(1).cloned().unwrap_or(Value::Null);
            update_rule(app, rule_id, &updates)
        }
        "automation:deleteRule" => delete_rule(app, a0.as_str().unwrap_or("")),
        "automation:setEnabled" => {
            let rule_id = a0.as_str().unwrap_or("");
            let enabled = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            set_enabled(app, rule_id, enabled)
        }

        "automation:explainRule" => explain_rule(app, a0.as_str().unwrap_or("")),

        // --- preview (real fs scan) ---
        "automation:generatePreview" => generate_preview(app, a0.as_str().unwrap_or("")),

        // --- execution (real run: fs moves/copies, OS toasts, progress events) ---
        "automation:start" => {
            let rule_id = a0.as_str().unwrap_or("");
            // isDryRun is optional; only override when a real bool was sent.
            let is_dry = args.get(1).and_then(|v| v.as_bool());
            start_execution(app, rule_id, is_dry)
        }
        "automation:confirm" => confirm_execution(app, a0.as_str().unwrap_or("")),
        "automation:pause" => pause_execution(app, a0.as_str().unwrap_or("")),
        "automation:resume" => resume_execution(app, a0.as_str().unwrap_or("")),
        "automation:cancel" => {
            let execution_id = a0.as_str().unwrap_or("");
            let reason = args.get(1).and_then(|v| v.as_str());
            cancel_execution(app, execution_id, reason)
        }

        // --- queries (data) ---
        "automation:getAllRules" => get_all_rules(app),
        "automation:getRule" => get_rule(app, a0.as_str().unwrap_or("")),
        "automation:getEnabledRules" => get_enabled_rules(app),

        // Executions are persisted to executions.json by the start/confirm flow.
        "automation:getExecution" => get_execution(app, a0.as_str().unwrap_or("")),
        "automation:getActiveExecution" => get_active_execution(app),
        "automation:getRecentExecutions" => {
            let limit = args.get(0).and_then(|v| v.as_u64()).unwrap_or(20) as usize;
            get_recent_executions(app, limit)
        }

        _ => Value::Null,
    }
}
