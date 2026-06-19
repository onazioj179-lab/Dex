// =============================================================================
// DEX Tauri — Focus/automation Modes (port of DataStore mode CRUD + ModeController).
// KV-backed CRUD over the `modes` key (same pattern as projects). DATA-STATE port:
// activate/deactivate set the `active` flag (DataStore.setActiveMode) but do NOT run
// the mode's actions, toggle rules, or (re)schedule node-schedule jobs — those
// engines (ActionController / RuleEngine / scheduler) are not ported, so the side
// effects are deliberately omitted here.
// =============================================================================

use serde_json::{json, Value};

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let load = |app: &tauri::AppHandle| -> Vec<Value> {
        match crate::kv_get(app, "modes") {
            Value::Array(a) => a,
            _ => Vec::new(),
        }
    };
    match channel {
        "mode:getAll" => json!(load(app)),
        "mode:getActive" => load(app)
            .into_iter()
            .find(|m| m.get("active").and_then(|v| v.as_bool()).unwrap_or(false))
            .unwrap_or(Value::Null),
        "mode:activate" => {
            let mode_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let mut list = load(app);
            let mut activated = Value::Null;
            for m in list.iter_mut() {
                let is_target = m.get("id").and_then(|v| v.as_str()) == Some(mode_id);
                if let Some(obj) = m.as_object_mut() {
                    obj.insert("active".into(), json!(is_target));
                }
                if is_target {
                    activated = m.clone();
                }
            }
            crate::kv_set(app, "modes", Value::Array(list));
            activated
        }
        "mode:deactivate" => {
            let mut list = load(app);
            for m in list.iter_mut() {
                if let Some(obj) = m.as_object_mut() {
                    obj.insert("active".into(), json!(false));
                }
            }
            crate::kv_set(app, "modes", Value::Array(list));
            Value::Null
        }
        "mode:save" => {
            let input = args.get(0).cloned().unwrap_or(Value::Null);
            let mut list = load(app);
            if let Some(id) = input.get("id").and_then(|v| v.as_str()).map(String::from) {
                if let Some(idx) = list
                    .iter()
                    .position(|m| m.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
                {
                    let mut merged = list[idx].as_object().cloned().unwrap_or_default();
                    if let Some(inp) = input.as_object() {
                        for (k, v) in inp {
                            merged.insert(k.clone(), v.clone());
                        }
                    }
                    let mv = Value::Object(merged);
                    list[idx] = mv.clone();
                    crate::kv_set(app, "modes", Value::Array(list));
                    return mv;
                }
                return Value::Null;
            }
            let s = |inp: &Value, k: &str, d: &str| {
                inp.get(k).and_then(|v| v.as_str()).unwrap_or(d).to_string()
            };
            let mut obj = serde_json::Map::new();
            obj.insert("id".into(), json!(crate::util::pseudo_uuid_v4()));
            obj.insert("name".into(), json!(s(&input, "name", "New Mode")));
            obj.insert("description".into(), json!(s(&input, "description", "")));
            obj.insert("icon".into(), json!(s(&input, "icon", "layout-grid")));
            obj.insert("color".into(), json!(s(&input, "color", "#6366f1")));
            obj.insert("actions".into(), input.get("actions").cloned().unwrap_or_else(|| json!([])));
            obj.insert("enableRules".into(), input.get("enableRules").cloned().unwrap_or_else(|| json!([])));
            obj.insert("disableRules".into(), input.get("disableRules").cloned().unwrap_or_else(|| json!([])));
            obj.insert("schedule".into(), input.get("schedule").cloned().unwrap_or(Value::Null));
            obj.insert("active".into(), json!(false));
            obj.insert("createdAt".into(), json!(now_ms()));
            let newm = Value::Object(obj);
            list.push(newm.clone());
            crate::kv_set(app, "modes", Value::Array(list));
            newm
        }
        "mode:delete" => {
            let mode_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let list: Vec<Value> = load(app)
                .into_iter()
                .filter(|m| m.get("id").and_then(|v| v.as_str()) != Some(mode_id))
                .collect();
            crate::kv_set(app, "modes", Value::Array(list));
            Value::Null
        }
        _ => Value::Null,
    }
}
