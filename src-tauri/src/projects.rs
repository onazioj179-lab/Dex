// =============================================================================
// DEX Tauri — Projects subsystem (KV-backed CRUD; thin CRUD over the `projects`
// key, mirroring the Electron DataStore handlers). Reconstructed as a module.
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
        match crate::kv_get(app, "projects") {
            Value::Array(a) => a,
            _ => Vec::new(),
        }
    };
    match channel {
        "projects:getAll" => json!(load(app)),
        "projects:getActive" => load(app)
            .into_iter()
            .find(|p| p.get("active").and_then(|v| v.as_bool()).unwrap_or(false))
            .unwrap_or(Value::Null),
        "projects:create" => {
            let input = args.get(0).cloned().unwrap_or(Value::Null);
            let mut obj = serde_json::Map::new();
            obj.insert("id".into(), json!(format!("proj-{}", now_ms())));
            if let Some(inp) = input.as_object() {
                for (k, v) in inp {
                    obj.insert(k.clone(), v.clone());
                }
            }
            obj.insert("active".into(), json!(false));
            obj.insert("createdAt".into(), json!(now_ms()));
            let newp = Value::Object(obj);
            let mut list = load(app);
            list.push(newp.clone());
            crate::kv_set(app, "projects", Value::Array(list));
            newp
        }
        "projects:update" => {
            let input = args.get(0).cloned().unwrap_or(Value::Null);
            let pid = input.get("id").and_then(|v| v.as_str()).map(String::from);
            let mut list = load(app);
            if let Some(pid) = pid {
                if let Some(idx) = list
                    .iter()
                    .position(|p| p.get("id").and_then(|v| v.as_str()) == Some(pid.as_str()))
                {
                    let mut merged = list[idx].as_object().cloned().unwrap_or_default();
                    if let Some(inp) = input.as_object() {
                        for (k, v) in inp {
                            merged.insert(k.clone(), v.clone());
                        }
                    }
                    merged.insert("updatedAt".into(), json!(now_ms()));
                    let mv = Value::Object(merged);
                    list[idx] = mv.clone();
                    crate::kv_set(app, "projects", Value::Array(list));
                    return mv;
                }
            }
            input
        }
        "projects:delete" => {
            let pid = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let list: Vec<Value> = load(app)
                .into_iter()
                .filter(|p| p.get("id").and_then(|v| v.as_str()) != Some(pid))
                .collect();
            crate::kv_set(app, "projects", Value::Array(list));
            json!({ "success": true })
        }
        "projects:setActive" => {
            let pid = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let mut list = load(app);
            for p in list.iter_mut() {
                let is_active = p.get("id").and_then(|v| v.as_str()) == Some(pid);
                if let Some(obj) = p.as_object_mut() {
                    obj.insert("active".into(), json!(is_active));
                }
            }
            crate::kv_set(app, "projects", Value::Array(list));
            json!({ "success": true })
        }
        _ => Value::Null,
    }
}
