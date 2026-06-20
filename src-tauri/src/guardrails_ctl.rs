// =============================================================================
// DEX Tauri — Guardrails subsystem (port of the `guardrails:*` IPC handlers in
// src/main/core/ErrorGuardrails.ts).
//
// NAMING NOTE (documented divergence from the porting brief): the brief named
// the Electron source `Guardrails.ts` with channels list/getPolicy + heavy
// enforce/bypass/update and an `fs-json:guardrails.json` store. None of those
// exist in this repo. The real subsystem is ErrorGuardrails.ts (the Error
// Guardrails & Undo system), whose namespace is `guardrails:*`. This port
// targets the actual channels and shapes found in that file.
//
// STORAGE: ErrorGuardrails is a per-process EventEmitter holding in-memory
// `UndoStack`s plus a private `config` field; Electron never writes it to disk.
// Tauri dispatch is stateless per-call, so to faithfully port the stateful
// channels (registerUndo / undo / redo / undoStatus / history / setConfig) the
// equivalent state is persisted in the shared KV store under a single key
// (KV_KEY below). This mirrors the live runtime exactly — same default config,
// same per-domain + global stacks, same redo semantics, same expiry/pruning —
// just durably instead of in-process. This is the brief's prescribed approach
// for "data/state mutations on KV-backed subsystems".
//
// PURE channels (compute entirely from args; need no stored state):
//   - guardrails:preview            -> ActionPreview  (previewAction)
//   - guardrails:needsConfirmation  -> bool           (needsConfirmation)
//
// STATE-BACKED channels (now ported via KV):
//   - guardrails:registerUndo  -> id string; pushes onto global + domain stacks,
//                                 emits 'action:registered' + 'guardrails:undoStatus'
//   - guardrails:undo          -> { success, action?, error? }; pops the stack,
//                                 emits 'undo:execute' + status broadcast
//   - guardrails:redo          -> { success, action?, error? }; pops redo stack,
//                                 emits 'redo:execute' + status broadcast
//   - guardrails:undoStatus    -> { canUndo, canRedo, lastAction? }
//   - guardrails:history       -> UndoableAction[]
//   - guardrails:setConfig     -> { success: true }; merges config
//
// DEGRADED (genuinely needs the native window runtime / not faked):
//   - guardrails:confirm  -> opens a native modal dialog bound to the focused
//     BrowserWindow (Electron dialog.showMessageBox). There is no equivalent
//     synchronous native modal available through this stateless dispatcher
//     without a window handle + event loop integration, so it returns a degrade
//     object rather than fabricating a user decision.
//
// DIVERGENCES (documented):
//   - The brief's `enforce`/`bypass`/`update`/`list`/`getPolicy` channels do not
//     exist; this module exposes the real `guardrails:preview` and
//     `guardrails:needsConfirmation` instead.
//   - registerUndo generates ids. Electron uses `undo-<Date.now()>-<counter>`;
//     this port keeps that exact shape, deriving the counter from the stored
//     state (monotonic across the persisted stacks) so ids stay collision-free.
//     Timestamps are SystemTime epoch millis (== Date.now()).
//   - Field names/types in ActionPreview match the TS interface exactly:
//     { type, description, severity, affectedItems: [{type,name,path?}],
//       warnings: string[], requiresConfirmation: bool, canUndo: bool }.
//     `estimatedDuration` is optional in TS and never set by previewAction, so
//     it is omitted (matching Electron, which leaves it undefined -> absent).
//     `path` is omitted on an affected item when the source value is absent
//     (Electron sets `path: undefined` -> serialized as absent over IPC).
// =============================================================================

use serde_json::{json, Value};

// KV key the whole persisted Guardrails state lives under (config + stacks +
// counter). One key, mirroring the single in-process singleton.
const KV_KEY: &str = "guardrails:state";

// Default GuardrailConfig (ErrorGuardrails constructor).
const DEF_CONFIRM_DESTRUCTIVE_ACTIONS: bool = true;
const DEF_CONFIRM_MULTI_FILE_OPERATIONS: bool = true;
const DEF_MULTI_FILE_THRESHOLD: i64 = 5;
const DEF_UNDO_HISTORY_SIZE: i64 = 50;
const DEF_UNDO_EXPIRY_TIME: i64 = 30 * 60 * 1000; // 30 minutes
const DEF_AUTO_SAVE_INTERVAL: i64 = 60000;

// Global stack lives under this synthetic domain key inside `stacks`.
const GLOBAL_DOMAIN: &str = "__global__";

// SEVERITY_THRESHOLDS (ErrorGuardrails).
const THRESH_MULTI_FILE: usize = 5;
const THRESH_LARGE_DELETION: f64 = 1024.0 * 1024.0 * 10.0; // 10MB
const THRESH_MANY_ITEMS: usize = 20;

// --- field accessors --------------------------------------------------------

fn items_array(data: &Value) -> Option<&Vec<Value>> {
    data.get("items").and_then(|v| v.as_array())
}

// `d.permanent` truthiness (any non-falsy JSON value).
fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Null) | None => false,
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true, // arrays/objects are truthy in JS
    }
}

// --- severity ---------------------------------------------------------------

// calculateSeverity(actionType, data)
fn calculate_severity(action_type: &str, data: &Value) -> &'static str {
    let permanent = truthy(data.get("permanent"));

    // Critical actions.
    if action_type.contains("delete") && permanent {
        return "critical";
    }
    if action_type == "clear_all" {
        return "critical";
    }
    if action_type == "factory_reset" {
        return "critical";
    }

    // Destructive actions.
    if action_type.contains("delete") {
        return "destructive";
    }
    if action_type.contains("remove") {
        return "destructive";
    }
    if action_type == "overwrite" {
        return "destructive";
    }

    // Moderate actions.
    if action_type.contains("rename") {
        return "moderate";
    }
    if action_type.contains("move") {
        return "moderate";
    }
    if action_type.contains("update") {
        return "moderate";
    }

    // Multi-item operations.
    if let Some(items) = items_array(data) {
        if items.len() > THRESH_MULTI_FILE {
            return "moderate";
        }
    }

    "safe"
}

// --- description ------------------------------------------------------------

// JS template literals coerce `d.name || 'file'` etc. Mirror with a helper that
// returns the string value if present & truthy, else the fallback.
fn or_str(data: &Value, key: &str, fallback: &str) -> String {
    match data.get(key) {
        Some(Value::String(s)) if !s.is_empty() => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) if *b => b.to_string(),
        _ => fallback.to_string(),
    }
}

// getActionDescription(actionType, data)
fn get_action_description(action_type: &str, data: &Value) -> String {
    match action_type {
        "file_delete" => format!("Delete {}", or_str(data, "name", "file")),
        "file_rename" => format!(
            "Rename {} to {}",
            or_str(data, "oldName", "file"),
            or_str(data, "newName", "new name")
        ),
        "file_move" => format!(
            "Move {} to {}",
            or_str(data, "name", "file"),
            or_str(data, "destination", "destination")
        ),
        "note_delete" => format!("Delete note \"{}\"", or_str(data, "title", "Untitled")),
        "task_delete" => format!("Delete task \"{}\"", or_str(data, "title", "Untitled")),
        "action_delete" => format!("Delete action \"{}\"", or_str(data, "name", "Untitled")),
        "batch_delete" => {
            let n = items_array(data)
                .map(|a| a.len().to_string())
                .unwrap_or_else(|| "multiple".to_string());
            format!("Delete {} items", n)
        }
        "clear_history" => "Clear all history".to_string(),
        "reset_settings" => "Reset settings to defaults".to_string(),
        other => format!("Perform {}", other),
    }
}

// --- affected items ---------------------------------------------------------

// getAffectedItems(actionType, data)
fn get_affected_items(action_type: &str, data: &Value) -> Value {
    let mut items: Vec<Value> = Vec::new();

    if let Some(arr) = items_array(data) {
        for item in arr {
            let itype = match item.get("type") {
                Some(Value::String(s)) if !s.is_empty() => s.clone(),
                _ => "item".to_string(),
            };
            let name = match item.get("name") {
                Some(Value::String(s)) if !s.is_empty() => s.clone(),
                _ => "Untitled".to_string(),
            };
            let mut obj = serde_json::Map::new();
            obj.insert("type".into(), json!(itype));
            obj.insert("name".into(), json!(name));
            // path: optional — include only when present as a string.
            if let Some(Value::String(p)) = item.get("path") {
                obj.insert("path".into(), json!(p));
            }
            items.push(Value::Object(obj));
        }
    } else if data.get("name").is_some() || data.get("path").is_some() {
        // `actionType.split('_')[0] || 'item'`
        let itype = action_type.split('_').next().filter(|s| !s.is_empty()).unwrap_or("item");
        let name = match data.get("name") {
            Some(Value::String(s)) if !s.is_empty() => s.clone(),
            _ => "Untitled".to_string(),
        };
        let mut obj = serde_json::Map::new();
        obj.insert("type".into(), json!(itype));
        obj.insert("name".into(), json!(name));
        if let Some(Value::String(p)) = data.get("path") {
            obj.insert("path".into(), json!(p));
        }
        items.push(Value::Object(obj));
    }

    Value::Array(items)
}

// --- warnings ---------------------------------------------------------------

// generateWarnings(actionType, data)
fn generate_warnings(action_type: &str, data: &Value) -> Vec<String> {
    let mut warnings: Vec<String> = Vec::new();

    // Multi-item warnings.
    if let Some(items) = items_array(data) {
        if items.len() > THRESH_MANY_ITEMS {
            warnings.push(format!("This will affect {} items", items.len()));
        }
    }

    // Destructive warnings.
    if action_type.contains("delete") {
        if truthy(data.get("permanent")) {
            warnings.push("This action cannot be undone".to_string());
        } else {
            warnings.push("Items will be moved to trash".to_string());
        }
    }

    // Size warnings (only when `size` is a number).
    if let Some(size) = data.get("size").and_then(|v| v.as_f64()) {
        if size > THRESH_LARGE_DELETION {
            // Math.round(size / (1024*1024))
            let size_mb = (size / (1024.0 * 1024.0)).round() as i64;
            warnings.push(format!("This will delete {}MB of data", size_mb));
        }
    }

    // System file warning.
    if truthy(data.get("isSystem")) {
        warnings.push("This affects system files".to_string());
    }

    warnings
}

// --- undoable check ---------------------------------------------------------

// canActionBeUndone(actionType)
fn can_action_be_undone(action_type: &str) -> bool {
    const NON_UNDOABLE: [&str; 5] = [
        "permanent_delete",
        "clear_all",
        "factory_reset",
        "send_message",
        "publish",
    ];
    !NON_UNDOABLE.contains(&action_type)
}

// --- config -----------------------------------------------------------------

// Effective config = defaults merged with whatever guardrails:setConfig stored.
// Only the fields any ported channel actually reads. The on-disk config object
// keeps the full Electron shape (see default_config_json); this struct is just
// the typed view the logic needs.
struct GuardrailConfig {
    confirm_destructive_actions: bool,
    confirm_multi_file_operations: bool,
    multi_file_threshold: i64,
    undo_history_size: i64,
    undo_expiry_time: i64,
}

fn cfg_bool(c: Option<&Value>, key: &str, def: bool) -> bool {
    c.and_then(|v| v.get(key)).and_then(|v| v.as_bool()).unwrap_or(def)
}

fn cfg_i64(c: Option<&Value>, key: &str, def: i64) -> i64 {
    c.and_then(|v| v.get(key)).and_then(|v| v.as_i64()).unwrap_or(def)
}

// Read the effective config out of the persisted state Value (or all defaults).
fn config_from_state(state: &Value) -> GuardrailConfig {
    let c = state.get("config");
    GuardrailConfig {
        confirm_destructive_actions: cfg_bool(c, "confirmDestructiveActions", DEF_CONFIRM_DESTRUCTIVE_ACTIONS),
        confirm_multi_file_operations: cfg_bool(c, "confirmMultiFileOperations", DEF_CONFIRM_MULTI_FILE_OPERATIONS),
        multi_file_threshold: cfg_i64(c, "multiFileThreshold", DEF_MULTI_FILE_THRESHOLD),
        undo_history_size: cfg_i64(c, "undoHistorySize", DEF_UNDO_HISTORY_SIZE),
        undo_expiry_time: cfg_i64(c, "undoExpiryTime", DEF_UNDO_EXPIRY_TIME),
    }
}

// The full default config object as JSON (constructor shape).
fn default_config_json() -> Value {
    json!({
        "confirmDestructiveActions": DEF_CONFIRM_DESTRUCTIVE_ACTIONS,
        "confirmMultiFileOperations": DEF_CONFIRM_MULTI_FILE_OPERATIONS,
        "multiFileThreshold": DEF_MULTI_FILE_THRESHOLD,
        "undoHistorySize": DEF_UNDO_HISTORY_SIZE,
        "undoExpiryTime": DEF_UNDO_EXPIRY_TIME,
        "autoSaveInterval": DEF_AUTO_SAVE_INTERVAL,
    })
}

// --- confirmation -----------------------------------------------------------

// needsConfirmation(actionType, data) — gated by the supplied config.
fn needs_confirmation(action_type: &str, data: &Value, cfg: &GuardrailConfig) -> bool {
    let severity = calculate_severity(action_type, data);

    // Always confirm critical actions.
    if severity == "critical" {
        return true;
    }

    // Confirm destructive if enabled.
    if severity == "destructive" && cfg.confirm_destructive_actions {
        return true;
    }

    // Confirm multi-file operations if enabled.
    if cfg.confirm_multi_file_operations {
        if let Some(items) = items_array(data) {
            if (items.len() as i64) >= cfg.multi_file_threshold {
                return true;
            }
        }
    }

    false
}

// --- preview ----------------------------------------------------------------

// previewAction(actionType, data)
fn preview_action(action_type: &str, data: &Value, cfg: &GuardrailConfig) -> Value {
    json!({
        "type": action_type,
        "description": get_action_description(action_type, data),
        "severity": calculate_severity(action_type, data),
        "affectedItems": get_affected_items(action_type, data),
        "warnings": generate_warnings(action_type, data),
        "requiresConfirmation": needs_confirmation(action_type, data, cfg),
        "canUndo": can_action_be_undone(action_type),
    })
}

// --- persisted state + undo stacks ------------------------------------------

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Load the whole persisted state object, normalizing to the canonical shape:
//   { config: {...}, stacks: { <domain>: { stack: [], redoStack: [] }, ... },
//     counter: <i64> }
fn load_state(app: &tauri::AppHandle) -> Value {
    let mut s = crate::kv_get(app, KV_KEY);
    if !s.is_object() {
        s = json!({});
    }
    let obj = s.as_object_mut().unwrap();
    if !obj.get("config").map(|v| v.is_object()).unwrap_or(false) {
        obj.insert("config".into(), default_config_json());
    }
    if !obj.get("stacks").map(|v| v.is_object()).unwrap_or(false) {
        obj.insert("stacks".into(), json!({}));
    }
    if !obj.get("counter").map(|v| v.is_i64()).unwrap_or(false) {
        obj.insert("counter".into(), json!(0));
    }
    s
}

fn save_state(app: &tauri::AppHandle, state: &Value) {
    let _ = crate::kv_set(app, KV_KEY, state.clone());
}

// Mutable access to a single domain's { stack, redoStack }, creating it if absent.
fn ensure_domain<'a>(state: &'a mut Value, domain: &str) -> &'a mut Value {
    let stacks = state
        .get_mut("stacks")
        .and_then(|v| v.as_object_mut())
        .expect("stacks normalized by load_state");
    if !stacks.contains_key(domain) {
        stacks.insert(domain.to_string(), json!({ "stack": [], "redoStack": [] }));
    }
    stacks.get_mut(domain).unwrap()
}

fn arr_mut<'a>(slot: &'a mut Value, key: &str) -> &'a mut Vec<Value> {
    let obj = slot.as_object_mut().unwrap();
    if !obj.get(key).map(|v| v.is_array()).unwrap_or(false) {
        obj.insert(key.to_string(), json!([]));
    }
    obj.get_mut(key).unwrap().as_array_mut().unwrap()
}

// Read-only stack array for a domain (empty vec if domain missing).
fn read_stack(state: &Value, domain: &str, key: &str) -> Vec<Value> {
    state
        .get("stacks")
        .and_then(|s| s.get(domain))
        .and_then(|d| d.get(key))
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default()
}

// canUndo for a stack: top action exists, is undoable, and not undone.
fn stack_can_undo(stack: &[Value]) -> bool {
    match stack.last() {
        Some(a) => {
            a.get("canUndo").and_then(|v| v.as_bool()).unwrap_or(false)
                && !a.get("undone").and_then(|v| v.as_bool()).unwrap_or(false)
        }
        None => false,
    }
}

// getUndoStatus(domain) shape: { canUndo, canRedo, lastAction? }.
fn undo_status(state: &Value, domain: &str) -> Value {
    let stack = read_stack(state, domain, "stack");
    let redo = read_stack(state, domain, "redoStack");
    let mut out = serde_json::Map::new();
    out.insert("canUndo".into(), json!(stack_can_undo(&stack)));
    out.insert("canRedo".into(), json!(!redo.is_empty()));
    // lastAction = peek().description (optional; absent when stack empty).
    if let Some(last) = stack.last() {
        if let Some(desc) = last.get("description") {
            out.insert("lastAction".into(), desc.clone());
        }
    }
    Value::Object(out)
}

// Broadcast status to the renderer, mirroring broadcastUndoStatus() (global).
fn broadcast_status(app: &tauri::AppHandle, state: &Value) {
    let status = undo_status(state, GLOBAL_DOMAIN);
    crate::native_ops::emit_event(app, "guardrails:undoStatus", &status);
}

// registerUndoable(action) -> id. Mirrors Electron exactly: derives domain from
// action.type.split('_')[0], pushes onto global + domain stacks (clearing redo
// + trimming to undoHistorySize), sets undone=false and undoExpiry.
fn register_undoable(app: &tauri::AppHandle, action: &Value) -> Value {
    let mut state = load_state(app);
    let cfg = config_from_state(&state);

    let counter = state.get("counter").and_then(|v| v.as_i64()).unwrap_or(0) + 1;
    let now = now_millis();
    let id = format!("undo-{}-{}", now, counter);

    let can_undo = action.get("canUndo").and_then(|v| v.as_bool()).unwrap_or(false);
    let action_type = action.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string();

    // Build the UndoableAction: spread incoming action, then override.
    let mut undoable = action.as_object().cloned().unwrap_or_default();
    undoable.insert("id".into(), json!(id));
    undoable.insert("timestamp".into(), json!(now));
    undoable.insert("undone".into(), json!(false));
    if can_undo {
        undoable.insert("undoExpiry".into(), json!(now + cfg.undo_expiry_time));
    } else {
        // Electron sets undefined -> field absent.
        undoable.remove("undoExpiry");
    }
    let undoable = Value::Object(undoable);

    let max_size = cfg.undo_history_size.max(0) as usize;

    // push helper applied to one domain.
    let push_into = |state: &mut Value, domain: &str| {
        let slot = ensure_domain(state, domain);
        // Clear redo stack on new action.
        *arr_mut(slot, "redoStack") = Vec::new();
        let stack = arr_mut(slot, "stack");
        stack.push(undoable.clone());
        // Trim if over capacity (shift from front).
        while max_size > 0 && stack.len() > max_size {
            stack.remove(0);
        }
    };

    push_into(&mut state, GLOBAL_DOMAIN);
    let domain = action_type.split('_').next().unwrap_or("").to_string();
    push_into(&mut state, &domain);

    state
        .as_object_mut()
        .unwrap()
        .insert("counter".into(), json!(counter));

    save_state(app, &state);
    broadcast_status(app, &state);
    crate::native_ops::emit_event(app, "guardrails:action:registered", &undoable);

    json!(id)
}

// undo(domain) -> { success, action?, error? }. Pops the stack onto redo,
// honours expiry, emits 'undo:execute', sets undone=true.
fn do_undo(app: &tauri::AppHandle, domain: Option<&str>) -> Value {
    let mut state = load_state(app);
    let dom = domain.unwrap_or(GLOBAL_DOMAIN);

    // Domain must exist (Electron: missing stack -> "Nothing to undo").
    let exists = state
        .get("stacks")
        .and_then(|s| s.get(dom))
        .map(|_| true)
        .unwrap_or(false);
    let stack_now = read_stack(&state, dom, "stack");
    if !exists || !stack_can_undo(&stack_now) {
        return json!({ "success": false, "error": "Nothing to undo" });
    }

    // pop(): take top off stack, push onto redoStack. Scope the mutable slot
    // borrow so it ends before any immutable use of `state` (save/broadcast).
    let mut action = {
        let slot = ensure_domain(&mut state, dom);
        let popped = arr_mut(slot, "stack").pop();
        match popped {
            Some(a) => {
                arr_mut(slot, "redoStack").push(a.clone());
                a
            }
            None => return json!({ "success": false, "error": "Nothing to undo" }),
        }
    };

    // Expiry check happens AFTER pop in Electron.
    let expiry = action.get("undoExpiry").and_then(|v| v.as_i64());
    if let Some(exp) = expiry {
        if exp < now_millis() {
            save_state(app, &state);
            return json!({ "success": false, "error": "Undo expired" });
        }
    }

    if let Some(obj) = action.as_object_mut() {
        obj.insert("undone".into(), json!(true));
    }
    // Reflect undone=true on the copy now sitting in redoStack.
    {
        let slot = ensure_domain(&mut state, dom);
        let redo = arr_mut(slot, "redoStack");
        if let Some(last) = redo.last_mut() {
            if let Some(o) = last.as_object_mut() {
                o.insert("undone".into(), json!(true));
            }
        }
    }

    save_state(app, &state);
    crate::native_ops::emit_event(app, "guardrails:undo:execute", &action);
    broadcast_status(app, &state);

    json!({ "success": true, "action": action })
}

// redo(domain) -> { success, action?, error? }. Pops redoStack back onto stack,
// emits 'redo:execute', sets undone=false.
fn do_redo(app: &tauri::AppHandle, domain: Option<&str>) -> Value {
    let mut state = load_state(app);
    let dom = domain.unwrap_or(GLOBAL_DOMAIN);

    let redo_now = read_stack(&state, dom, "redoStack");
    let exists = state
        .get("stacks")
        .and_then(|s| s.get(dom))
        .map(|_| true)
        .unwrap_or(false);
    if !exists || redo_now.is_empty() {
        return json!({ "success": false, "error": "Nothing to redo" });
    }

    // popRedo(): take top off redoStack, push back onto stack. Scope the slot
    // borrow so it ends before the immutable save/broadcast borrows.
    let mut action = {
        let slot = ensure_domain(&mut state, dom);
        let popped = arr_mut(slot, "redoStack").pop();
        match popped {
            Some(a) => {
                arr_mut(slot, "stack").push(a.clone());
                a
            }
            None => return json!({ "success": false, "error": "Nothing to redo" }),
        }
    };

    if let Some(obj) = action.as_object_mut() {
        obj.insert("undone".into(), json!(false));
    }
    {
        let slot = ensure_domain(&mut state, dom);
        let stack = arr_mut(slot, "stack");
        if let Some(last) = stack.last_mut() {
            if let Some(o) = last.as_object_mut() {
                o.insert("undone".into(), json!(false));
            }
        }
    }

    save_state(app, &state);
    crate::native_ops::emit_event(app, "guardrails:redo:execute", &action);
    broadcast_status(app, &state);

    json!({ "success": true, "action": action })
}

// getHistory(domain) -> UndoableAction[] (copy of the stack; [] if absent).
fn get_history(state: &Value, domain: &str) -> Value {
    json!(read_stack(state, domain, "stack"))
}

// updateConfig(config) — merge partial config into stored config. Mirrors
// `this.config = { ...this.config, ...partial }`. A changed undoHistorySize
// rebuilds the global stack in Electron (clearing it); we mirror that.
fn set_config(app: &tauri::AppHandle, partial: &Value) -> Value {
    let mut state = load_state(app);
    let resized = partial
        .get("undoHistorySize")
        .and_then(|v| v.as_i64())
        .is_some();

    {
        let obj = state.as_object_mut().unwrap();
        let cfg = obj
            .entry("config")
            .or_insert_with(default_config_json);
        if let (Some(cfg_obj), Some(part_obj)) = (cfg.as_object_mut(), partial.as_object()) {
            for (k, v) in part_obj {
                cfg_obj.insert(k.clone(), v.clone());
            }
        }
    }

    if resized {
        // new UndoStack(size) -> fresh empty global stack.
        ensure_domain(&mut state, GLOBAL_DOMAIN);
        let slot = state
            .get_mut("stacks")
            .and_then(|s| s.get_mut(GLOBAL_DOMAIN))
            .unwrap();
        *arr_mut(slot, "stack") = Vec::new();
        *arr_mut(slot, "redoStack") = Vec::new();
    }

    save_state(app, &state);
    json!({ "success": true })
}

/// Route a `guardrails:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
///   preview / needsConfirmation : (actionType, data)
///   confirm                     : (preview)
///   registerUndo                : (action)
///   undo / redo / undoStatus / history : (domain?)
///   setConfig                   : (partialConfig)
/// State-backed channels persist to the shared KV store; only `confirm` is an
/// honest degrade (needs the native window modal). Nothing is faked.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let action_type = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let data = args.get(1).cloned().unwrap_or(Value::Null);
    // Optional leading `domain` string for undo/redo/status/history.
    let domain = args.get(0).and_then(|v| v.as_str());

    match channel {
        "guardrails:preview" => {
            let cfg = config_from_state(&load_state(app));
            preview_action(action_type, &data, &cfg)
        }
        "guardrails:needsConfirmation" => {
            let cfg = config_from_state(&load_state(app));
            json!(needs_confirmation(action_type, &data, &cfg))
        }

        "guardrails:registerUndo" => {
            let action = args.get(0).cloned().unwrap_or(Value::Null);
            register_undoable(app, &action)
        }
        "guardrails:undo" => do_undo(app, domain),
        "guardrails:redo" => do_redo(app, domain),
        "guardrails:undoStatus" => {
            let state = load_state(app);
            undo_status(&state, domain.unwrap_or(GLOBAL_DOMAIN))
        }
        "guardrails:history" => {
            let state = load_state(app);
            get_history(&state, domain.unwrap_or(GLOBAL_DOMAIN))
        }
        "guardrails:setConfig" => {
            let partial = args.get(0).cloned().unwrap_or(Value::Null);
            set_config(app, &partial)
        }

        // DEGRADED: native focused-window modal dialog (dialog.showMessageBox).
        // No equivalent synchronous modal is reachable from this stateless
        // dispatcher without a window handle + event-loop bridge; not faked.
        "guardrails:confirm" => json!({
            "success": false,
            "error": "not ported (needs native runtime)"
        }),

        _ => Value::Null,
    }
}
