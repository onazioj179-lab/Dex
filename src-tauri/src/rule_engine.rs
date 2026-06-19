// =============================================================================
// DEX Tauri — Rule subsystem (port of the `rule:*` IPC handlers in main.ts,
// which delegate to DataStore's rule CRUD).
//
// Pure-data, DataStore-KV tier (same backbone as modes_dispatch in main.rs).
// Electron stored rules under the `rules` key of the `dex-data` electron-store
// (an array, default []); on Tauri the DataStore keys live in the native KV
// store (dex-kv.json) reached via crate::kv_get / crate::kv_set. We therefore
// read/write the SAME key string ("rules") used by DataStore, mirroring how
// `modes` was ported. Return shapes match the Electron handlers exactly so the
// renderer is unchanged.
//
// Channels & shapes (from DataStore.getRules/saveRule/deleteRule/toggleRule):
//   - rule:getAll  -> DexRule[]            (the stored array, [] if unset)
//   - rule:save    -> DexRule | null       (create -> new rule; update -> the
//                     merged rule; update with an unknown id -> null, mirroring
//                     Electron's `rules.find(...)!` yielding undefined)
//   - rule:delete  -> null                 (Electron handler returns void)
//   - rule:toggle  -> null                 (Electron handler returns void)
//
// A DexRule is:
//   { id, name, description, enabled, conditions[], actions[], cooldown,
//     lastTriggered: number|null, triggerCount, createdAt }
//
// DIVERGENCES (documented):
//   - The Electron handlers also call `ruleEngine.reloadRules()` after save/
//     delete/toggle. That is a live native-engine side-effect (re-arming the
//     condition evaluators) with NO effect on the returned value, so it is not
//     reproduced here. The data result the renderer receives is identical.
//   - id generation: Electron used `${Date.now()}-${randomBytes(8).hex}`
//     (timestamp + 16 hex chars). We keep that exact shape using the mandated
//     crate::util::pseudo_uuid_v4() (hyphens stripped, first 16 hex chars) — no
//     rand crate. Collision resistance across one machine is all that's needed.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Map, Value};

const RULES_KEY: &str = "rules";

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// DataStore.generateId(): `${Date.now()}-${randomBytes(8).toString('hex')}`.
// Mirror the shape (timestamp + 16 hex chars) using the mandated helper.
fn generate_id() -> String {
    let hex: String = pseudo_uuid_v4().chars().filter(|c| *c != '-').take(16).collect();
    format!("{}-{}", now_ms(), hex)
}

fn load(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, RULES_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn store(app: &tauri::AppHandle, rules: Vec<Value>) {
    crate::kv_set(app, RULES_KEY, Value::Array(rules));
}

fn id_of(r: &Value) -> Option<&str> {
    r.get("id").and_then(|v| v.as_str())
}

// DataStore.saveRule(rule)
fn save_rule(app: &tauri::AppHandle, rule: &Value) -> Value {
    let mut rules = load(app);

    // Update path: rule.id present.
    if let Some(rid) = rule.get("id").and_then(|v| v.as_str()).map(String::from) {
        if let Some(idx) = rules.iter().position(|r| id_of(r) == Some(rid.as_str())) {
            // rules[index] = { ...rules[index], ...rule }
            let mut merged = rules[idx].as_object().cloned().unwrap_or_default();
            if let Some(inp) = rule.as_object() {
                for (k, v) in inp {
                    merged.insert(k.clone(), v.clone());
                }
            }
            rules[idx] = Value::Object(merged);
        }
        // Electron persists then `return rules.find(r => r.id === rule.id)!`.
        // If the id was not found, nothing was mutated and find(...) is
        // undefined -> null over IPC. Mirror both cases.
        let found = rules
            .iter()
            .find(|r| id_of(r) == Some(rid.as_str()))
            .cloned()
            .unwrap_or(Value::Null);
        store(app, rules);
        return found;
    }

    // Create path: no id -> build a new rule with DataStore defaults.
    let s = |k: &str, d: &str| rule.get(k).and_then(|v| v.as_str()).unwrap_or(d).to_string();
    // enabled defaults to true unless explicitly === false.
    let enabled = rule.get("enabled").and_then(|v| v.as_bool()) != Some(false);
    let cooldown = rule
        .get("cooldown")
        .and_then(|v| v.as_i64())
        // `rule.cooldown || 60000` — 0 / null / absent all fall back to 60000.
        .filter(|n| *n != 0)
        .unwrap_or(60_000);

    let mut obj = Map::new();
    obj.insert("id".into(), json!(generate_id()));
    obj.insert("name".into(), json!(s("name", "New Rule")));
    obj.insert("description".into(), json!(s("description", "")));
    obj.insert("enabled".into(), json!(enabled));
    obj.insert(
        "conditions".into(),
        rule.get("conditions").cloned().unwrap_or_else(|| json!([])),
    );
    obj.insert(
        "actions".into(),
        rule.get("actions").cloned().unwrap_or_else(|| json!([])),
    );
    obj.insert("cooldown".into(), json!(cooldown));
    obj.insert("lastTriggered".into(), Value::Null);
    obj.insert("triggerCount".into(), json!(0));
    obj.insert("createdAt".into(), json!(now_ms()));

    let new_rule = Value::Object(obj);
    rules.push(new_rule.clone());
    store(app, rules);
    new_rule
}

// DataStore.deleteRule(ruleId)
fn delete_rule(app: &tauri::AppHandle, rule_id: &str) -> Value {
    let rules: Vec<Value> = load(app)
        .into_iter()
        .filter(|r| id_of(r) != Some(rule_id))
        .collect();
    store(app, rules);
    Value::Null
}

// DataStore.toggleRule(ruleId, enabled)
fn toggle_rule(app: &tauri::AppHandle, rule_id: &str, enabled: bool) -> Value {
    let mut rules = load(app);
    if let Some(idx) = rules.iter().position(|r| id_of(r) == Some(rule_id)) {
        if let Some(obj) = rules[idx].as_object_mut() {
            obj.insert("enabled".into(), json!(enabled));
        }
        store(app, rules);
    }
    Value::Null
}

/// Route a `rule:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; unknown
/// ones return Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "rule:getAll" => json!(load(app)),
        "rule:save" => {
            let rule = args.get(0).cloned().unwrap_or(Value::Null);
            save_rule(app, &rule)
        }
        "rule:delete" => {
            let rule_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_rule(app, rule_id)
        }
        "rule:toggle" => {
            let rule_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let enabled = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            toggle_rule(app, rule_id, enabled)
        }
        _ => Value::Null,
    }
}
