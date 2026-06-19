// =============================================================================
// DEX Tauri — Focus Sessions subsystem (port of the `focus:*` handlers in
// src/main/main.ts).
//
// Pure-data, DataStore-KV backed. Electron persisted the session list under the
// single DataStore key "focusSessions" (an array of session objects); this
// mirrors that exactly via crate::kv_get / crate::kv_set with the SAME key, so
// the on-disk shape is unchanged.
//
// Return shapes match the Electron handlers field-for-field:
//   - focus:start -> the new session object
//       { id, startedAt, active: true, mode } where:
//         id      = "focus-<epoch-ms>"   (Electron used `focus-${Date.now()}`)
//         startedAt = epoch ms
//         active  = true
//         mode    = the first arg if "truthy" (JS `mode || 'default'`), else
//                   "default". Electron typed the arg as `mode?: string` but the
//                   renderer (FocusSessionSystem.ts) actually passes an object;
//                   JS `||` keeps any truthy value as-is, so we replicate that.
//   - focus:end  -> { success: true } (always; matches Electron unconditionally)
//
// ID divergence from house default: the task template suggests
// crate::util::pseudo_uuid_v4() for ids, but the Electron handler built the id
// purely as `focus-${Date.now()}`. Matching the renderer's stored shape wins, so
// the id here is "focus-<epoch-ms>" (same precedent as analytics.rs, which kept
// Electron's exact id scheme rather than substituting a raw uuid). The millis
// come from SystemTime epoch (no Date crate).
//
// SIDE-EFFECT divergence (documented, intentionally NOT ported): each Electron
// handler also did `mainWindow.webContents.send('focus:state-changed', ...)` to
// push live state to the renderer. That is a live-window emit, not part of the
// return value, and the dispatch signature carries no window handle. It is a
// side-effect only — the renderer fires `focus:start` / `focus:end` and ignores
// the resolved value (FocusSessionSystem.ts wraps the invoke in try/catch and
// drops the result), so omitting the push does not change the returned data.
// If the state-changed event is later needed it must be wired centrally where a
// window handle is available; it is out of scope for this pure-data port.
// =============================================================================

use serde_json::{json, Value};

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Load the persisted session list (DataStore key "focusSessions"). Electron did
// `await this.dataStore.get<any[]>('focusSessions') || []`, i.e. an absent/non
// -array value collapses to an empty list.
fn load_sessions(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, "focusSessions") {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

// Mirror JS truthiness of the `mode` argument for `mode || 'default'`:
// null / undefined / false / 0 / "" / NaN are falsy; everything else is truthy.
fn is_truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(false),
        Value::String(s) => !s.is_empty(),
        // Arrays and objects are always truthy in JS.
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// Route a `focus:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; any
/// not intentionally ported returns Value::Null (honest degrade), so routing
/// `channel.starts_with("focus:")` here is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // focus:start (mode?: string) -> session object
        "focus:start" => {
            let arg0 = args.get(0).cloned().unwrap_or(Value::Null);
            // `mode || 'default'`: keep the arg if truthy, else "default".
            let mode = if is_truthy(&arg0) { arg0 } else { json!("default") };
            let session = json!({
                "id": format!("focus-{}", now_ms()),
                "startedAt": now_ms(),
                "active": true,
                "mode": mode,
            });
            let mut sessions = load_sessions(app);
            sessions.push(session.clone());
            crate::kv_set(app, "focusSessions", Value::Array(sessions));
            session
        }
        // focus:end () -> { success: true }
        "focus:end" => {
            let mut sessions = load_sessions(app);
            // Find the first active session and close it in place, then persist
            // only if one was found (matches Electron's `if (active) { ... }`).
            if let Some(active) = sessions
                .iter_mut()
                .find(|s| s.get("active").and_then(|v| v.as_bool()).unwrap_or(false))
            {
                if let Some(obj) = active.as_object_mut() {
                    obj.insert("active".into(), json!(false));
                    obj.insert("endedAt".into(), json!(now_ms()));
                }
                crate::kv_set(app, "focusSessions", Value::Array(sessions));
            }
            json!({ "success": true })
        }
        _ => Value::Null,
    }
}
