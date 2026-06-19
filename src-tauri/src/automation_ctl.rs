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
//   - automation:getExecution        -> AutomationExecution | null  (always null)
//   - automation:getActiveExecution  -> AutomationExecution | null  (always null)
//   - automation:getRecentExecutions -> AutomationExecution[]       (always [])
//
// SKIPPED heavy channels (need the live native runtime; NOT implemented/faked):
//   explainRule, generatePreview, start, confirm, pause, resume, cancel.
//   These fall through to Value::Null (honest degrade).
//
// DIVERGENCES (documented):
//   - Executions are IN-MEMORY ONLY in Electron (never written to disk); the
//     map is populated solely by the heavy `start` flow, which is not ported.
//     With no execution runtime there are never any executions, so the three
//     execution queries correctly return null / null / []. This matches what
//     the Electron handlers would return on a fresh process before any run.
//   - The `events`/EventEmitter side-effects (rule-created, rule-updated, etc.)
//     and the user Notification on enable/create are live side-effects with no
//     bearing on the returned value, so they are not reproduced.
//   - id generation: Electron used crypto.randomUUID() for the rule id and for
//     each action id. We use the mandated crate::util::pseudo_uuid_v4() (same
//     UUIDv4 shape) — no rand crate.
//   - Rate-limiting state (ruleRunCounts) only gates execution start, which is
//     a skipped heavy channel, so it is irrelevant to this data tier.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

// Same relative path the Electron engine wrote (path.join(userData,'automation','rules.json')).
const RULES_SUBDIR: &str = "automation";
const RULES_FILE: &str = "rules.json";

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

/// Route an `automation:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; skipped heavy channels and unknown ones return Value::Null.
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

        // --- queries (data) ---
        "automation:getAllRules" => get_all_rules(app),
        "automation:getRule" => get_rule(app, a0.as_str().unwrap_or("")),
        "automation:getEnabledRules" => get_enabled_rules(app),

        // Executions are in-memory only and never created without the heavy
        // `start` flow (not ported), so these reflect an empty execution map.
        "automation:getExecution" => Value::Null,
        "automation:getActiveExecution" => Value::Null,
        "automation:getRecentExecutions" => json!([]),

        // --- skipped heavy channels (need native runtime) -> honest null ---
        // explainRule, generatePreview, start, confirm, pause, resume, cancel
        _ => Value::Null,
    }
}
