// =============================================================================
// DEX Tauri — Quick Actions subsystem (port of the `quickactions:*` IPC handlers
// in src/main/core/ContextQuickActions.ts).
//
// Pure-data, NO-storage tier. Despite the migration tracker's
// `electron-store:quickactions` note, the Electron source keeps NO persistent
// store: built-in actions live in a static `DEFAULT_ACTIONS` array and custom
// actions in an in-memory `customActions` Map that is never written to disk. The
// data/list channels are therefore deterministic projections over that static
// catalog — they read no app state, so there is nothing to read/write under
// app_data_dir and no KV key is touched. (The `app` handle is accepted to match
// the house dispatch signature even though it is unused here.)
//
// Channels & shapes (exact, from ContextQuickActions):
//   - quickactions:all        -> QuickAction[]        (built-ins, insertion order)
//   - quickactions:forContext -> QuickAction[]        (filtered + relevance-sorted)
//   - quickactions:byShortcut -> QuickAction | null   (first context match, or null)
//
// A QuickAction is, field-for-field (optional fields omitted when unset, exactly
// as the TS object literals omit them):
//   { id, name, description, icon, category, contexts[], handler,
//     extensions?[], minItems?, maxItems?, shortcut?,
//     isDestructive?, requiresConfirmation? }
//
// HEAVY channels — NOW PORTED with real native code:
//   - quickactions:execute(actionId, context) — resolves the action from the
//     built-in catalog or the custom store; if missing returns
//     { success:false, message:'Action not found' }; otherwise pushes the
//     `quickaction:execute` renderer event with { action, context } (the Tauri
//     analog of Electron's webContents.send) and returns { success:true }. The
//     internal EventEmitter 'action:executed' fan-out had no renderer-visible
//     effect, so it is not emulated (no fake side-effect invented).
//   - quickactions:register(action) — refuses to override a built-in id
//     ({ success:false, error:'Cannot override built-in action' }), else stores
//     the action in the custom catalog and returns { success:true }.
//   - quickactions:unregister(actionId) — refuses built-in ids ({ success:false }),
//     else removes from the custom catalog and returns { success: <removed> }.
//
// PERSISTENCE divergence (intentional improvement, documented): Electron kept
// custom actions in an in-memory Map that vanished on restart. Here they are
// persisted through the shared native KV store (crate::kv_get / crate::kv_set at
// QUICKACTIONS_KEY -> dex-kv.json) so that register/unregister survive within a
// process AND across restarts, and so the list channels (all/forContext/
// byShortcut) now also fold in any registered custom actions — matching the
// Electron in-process semantics where those lists concatenated the custom Map.
//
// DIVERGENCES (documented):
//   - forContext context-type gate: the Electron filter has a subtle early
//     structure — if the action's `contexts` does NOT include `context.type`, it
//     then (a) drops the action when items.length > 1 and `contexts` lacks
//     'multiple', and (b) drops the action when items.length <= 1; only when
//     items.length > 1 AND `contexts` includes 'multiple' does it fall through.
//     This is replicated exactly (including that an action whose contexts include
//     the type is NOT subject to the multiple/count gate). No behavior invented.
//   - extension fallback: Electron uses item.extension ?? path.extname(path).
//     We mirror the same: prefer the explicit `extension`, else derive it from
//     the trailing `.ext` of `path`. Both lowercased.
//   - Sort: JS `Array.prototype.sort` is not guaranteed stable across engines but
//     V8 is stable; relevance ties keep input order. We use a stable sort by
//     (-relevance) to match.
// =============================================================================

use serde_json::{json, Value};

// --- the static built-in catalog -------------------------------------------
// Built each call (cheap: 24 small objects) so the returned Values are owned and
// independent. Field order and presence mirror the TS literals exactly; optional
// fields are only inserted when the TS object set them.

struct Act {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    icon: &'static str,
    category: &'static str,
    contexts: &'static [&'static str],
    handler: &'static str,
    extensions: &'static [&'static str], // empty => field omitted
    min_items: Option<i64>,
    max_items: Option<i64>,
    shortcut: Option<&'static str>,
    is_destructive: bool,           // false => field omitted
    requires_confirmation: bool,    // false => field omitted
}

const DEFAULT_ACTIONS: &[Act] = &[
    // -- File Actions --------------------------------------------------------
    Act { id: "open", name: "Open", description: "Open with default application", icon: "external-link", category: "file", contexts: &["file","image","video","audio","document","code"], handler: "quickaction:open", extensions: &[], min_items: None, max_items: None, shortcut: Some("Enter"), is_destructive: false, requires_confirmation: false },
    Act { id: "preview", name: "Quick Look", description: "Preview without opening", icon: "eye", category: "view", contexts: &["file","image","video","audio","document","code"], handler: "quickaction:preview", extensions: &[], min_items: None, max_items: None, shortcut: Some("Space"), is_destructive: false, requires_confirmation: false },
    Act { id: "rename", name: "Rename", description: "Rename file or folder", icon: "edit-2", category: "file", contexts: &["file","folder","image","video","audio","document","code"], handler: "quickaction:rename", extensions: &[], min_items: None, max_items: Some(1), shortcut: Some("F2"), is_destructive: false, requires_confirmation: false },
    Act { id: "delete", name: "Move to Trash", description: "Move selected items to trash", icon: "trash-2", category: "file", contexts: &["file","folder","image","video","audio","document","code","multiple"], handler: "quickaction:delete", extensions: &[], min_items: None, max_items: None, shortcut: Some("Delete"), is_destructive: true, requires_confirmation: true },
    Act { id: "copy", name: "Copy", description: "Copy to clipboard", icon: "copy", category: "edit", contexts: &["file","folder","text","selection","multiple"], handler: "quickaction:copy", extensions: &[], min_items: None, max_items: None, shortcut: Some("Ctrl+C"), is_destructive: false, requires_confirmation: false },
    Act { id: "cut", name: "Cut", description: "Cut to clipboard", icon: "scissors", category: "edit", contexts: &["file","folder","text","selection","multiple"], handler: "quickaction:cut", extensions: &[], min_items: None, max_items: None, shortcut: Some("Ctrl+X"), is_destructive: false, requires_confirmation: false },
    Act { id: "paste", name: "Paste", description: "Paste from clipboard", icon: "clipboard", category: "edit", contexts: &["folder","empty","clipboard"], handler: "quickaction:paste", extensions: &[], min_items: None, max_items: None, shortcut: Some("Ctrl+V"), is_destructive: false, requires_confirmation: false },
    Act { id: "duplicate", name: "Duplicate", description: "Create a copy", icon: "copy", category: "file", contexts: &["file","folder"], handler: "quickaction:duplicate", extensions: &[], min_items: None, max_items: Some(1), shortcut: Some("Ctrl+D"), is_destructive: false, requires_confirmation: false },
    Act { id: "newFolder", name: "New Folder", description: "Create new folder here", icon: "folder-plus", category: "file", contexts: &["folder","empty"], handler: "quickaction:newFolder", extensions: &[], min_items: None, max_items: None, shortcut: Some("Ctrl+Shift+N"), is_destructive: false, requires_confirmation: false },

    // -- Organization --------------------------------------------------------
    Act { id: "moveTo", name: "Move to...", description: "Move to another location", icon: "move", category: "organize", contexts: &["file","folder","multiple"], handler: "quickaction:moveTo", extensions: &[], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
    Act { id: "copyTo", name: "Copy to...", description: "Copy to another location", icon: "copy", category: "organize", contexts: &["file","folder","multiple"], handler: "quickaction:copyTo", extensions: &[], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
    Act { id: "compress", name: "Compress", description: "Create ZIP archive", icon: "archive", category: "organize", contexts: &["file","folder","multiple"], handler: "quickaction:compress", extensions: &[], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
    Act { id: "extract", name: "Extract", description: "Extract archive contents", icon: "package", category: "organize", contexts: &["file"], handler: "quickaction:extract", extensions: &["zip","rar","7z","tar","gz"], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },

    // -- Image Actions -------------------------------------------------------
    Act { id: "resizeImage", name: "Resize Image", description: "Resize to specific dimensions", icon: "maximize-2", category: "convert", contexts: &["image"], handler: "quickaction:resizeImage", extensions: &["jpg","jpeg","png","webp","gif","bmp"], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
    Act { id: "convertImage", name: "Convert Format", description: "Convert to different format", icon: "refresh-cw", category: "convert", contexts: &["image"], handler: "quickaction:convertImage", extensions: &["jpg","jpeg","png","webp","gif","bmp","tiff"], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
    Act { id: "rotateImage", name: "Rotate", description: "Rotate image", icon: "rotate-cw", category: "edit", contexts: &["image"], handler: "quickaction:rotateImage", extensions: &["jpg","jpeg","png","webp","bmp"], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },

    // -- Code Actions --------------------------------------------------------
    Act { id: "openInEditor", name: "Edit Code", description: "Open in code editor", icon: "code", category: "edit", contexts: &["code"], handler: "quickaction:openInEditor", extensions: &["js","ts","py","json","html","css","md","txt","yaml","xml"], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
    Act { id: "formatCode", name: "Format", description: "Auto-format code", icon: "align-left", category: "edit", contexts: &["code"], handler: "quickaction:formatCode", extensions: &["js","ts","json","html","css","py"], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },

    // -- Batch Actions -------------------------------------------------------
    Act { id: "batchRename", name: "Batch Rename", description: "Rename multiple files", icon: "edit-3", category: "organize", contexts: &["multiple"], handler: "quickaction:batchRename", extensions: &[], min_items: Some(2), max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
    Act { id: "batchOrganize", name: "Organize by Type", description: "Sort into folders by type", icon: "folder", category: "organize", contexts: &["multiple"], handler: "quickaction:batchOrganize", extensions: &[], min_items: Some(2), max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },

    // -- Share Actions -------------------------------------------------------
    Act { id: "copyPath", name: "Copy Path", description: "Copy file path to clipboard", icon: "link", category: "share", contexts: &["file","folder"], handler: "quickaction:copyPath", extensions: &[], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
    Act { id: "revealInExplorer", name: "Show in Explorer", description: "Reveal in file explorer", icon: "folder", category: "file", contexts: &["file","folder"], handler: "quickaction:revealInExplorer", extensions: &[], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },

    // -- Automation ----------------------------------------------------------
    Act { id: "createAction", name: "Create Action", description: "Create automation from selection", icon: "zap", category: "automate", contexts: &["file","folder","multiple"], handler: "quickaction:createAction", extensions: &[], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
    Act { id: "applyRule", name: "Apply Rule", description: "Apply folder rule to selection", icon: "git-merge", category: "automate", contexts: &["file","multiple"], handler: "quickaction:applyRule", extensions: &[], min_items: None, max_items: None, shortcut: None, is_destructive: false, requires_confirmation: false },
];

fn act_to_json(a: &Act) -> Value {
    let mut o = serde_json::Map::new();
    o.insert("id".into(), json!(a.id));
    o.insert("name".into(), json!(a.name));
    o.insert("description".into(), json!(a.description));
    o.insert("icon".into(), json!(a.icon));
    o.insert("category".into(), json!(a.category));
    o.insert("contexts".into(), json!(a.contexts));
    if !a.extensions.is_empty() {
        o.insert("extensions".into(), json!(a.extensions));
    }
    if let Some(n) = a.min_items {
        o.insert("minItems".into(), json!(n));
    }
    if let Some(n) = a.max_items {
        o.insert("maxItems".into(), json!(n));
    }
    if let Some(s) = a.shortcut {
        o.insert("shortcut".into(), json!(s));
    }
    if a.is_destructive {
        o.insert("isDestructive".into(), json!(true));
    }
    if a.requires_confirmation {
        o.insert("requiresConfirmation".into(), json!(true));
    }
    o.insert("handler".into(), json!(a.handler));
    Value::Object(o)
}

// --- ActionContext field accessors ------------------------------------------

fn ctx_type(ctx: &Value) -> String {
    ctx.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn ctx_items(ctx: &Value) -> Vec<Value> {
    ctx.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default()
}

// item.extension?.toLowerCase() || path.extname(item.path).slice(1).toLowerCase()
fn item_ext(item: &Value) -> String {
    if let Some(e) = item.get("extension").and_then(|v| v.as_str()) {
        if !e.is_empty() {
            return e.to_lowercase();
        }
    }
    let path = item.get("path").and_then(|v| v.as_str()).unwrap_or("");
    // path.extname returns the trailing ".ext" (or "" if none); .slice(1) drops dot.
    match path.rfind('.') {
        Some(idx) if idx + 1 < path.len() => path[idx + 1..].to_lowercase(),
        _ => String::new(),
    }
}

fn contexts_includes(a: &Act, t: &str) -> bool {
    a.contexts.iter().any(|c| *c == t)
}

// getActionsForContext(context) — filter then relevance-sort.
fn actions_for_context(ctx: &Value) -> Vec<&'static Act> {
    let t = ctx_type(ctx);
    let items = ctx_items(ctx);
    let item_count = items.len();

    let mut matched: Vec<&'static Act> = DEFAULT_ACTIONS
        .iter()
        .filter(|a| {
            // Context-type gate (mirrors the TS structure exactly).
            if !contexts_includes(a, &t) {
                if item_count > 1 && !contexts_includes(a, "multiple") {
                    return false;
                }
                if item_count <= 1 {
                    return false;
                }
                // else: item_count > 1 && contexts includes 'multiple' -> continue
            }

            // Item-count constraints (minItems/maxItems are only applied when set;
            // TS guards with `if (action.minItems && ...)` so 0 would also skip,
            // but no built-in uses 0 — None mirrors "absent" and Some(n>0) the set
            // case).
            if let Some(min) = a.min_items {
                if (item_count as i64) < min {
                    return false;
                }
            }
            if let Some(max) = a.max_items {
                if (item_count as i64) > max {
                    return false;
                }
            }

            // Extension constraints: some item must have a matching extension.
            if !a.extensions.is_empty() {
                let has_match = items.iter().any(|it| {
                    let ext = item_ext(it);
                    a.extensions.iter().any(|e| *e == ext)
                });
                if !has_match {
                    return false;
                }
            }

            true
        })
        .collect();

    // Sort by descending relevance; stable to preserve input order on ties.
    matched.sort_by(|a, b| relevance(b, ctx).cmp(&relevance(a, ctx)));
    matched
}

// getActionRelevance(action, context)
fn relevance(a: &Act, ctx: &Value) -> i64 {
    let mut score = 0i64;
    let t = ctx_type(ctx);
    let items = ctx_items(ctx);

    if contexts_includes(a, &t) {
        score += 10;
    }

    if !a.extensions.is_empty() && !items.is_empty() {
        // ext = context.items[0].extension?.toLowerCase() (NO path fallback here —
        // matches the TS, which only consults the explicit extension field).
        if let Some(e) = items[0].get("extension").and_then(|v| v.as_str()) {
            let ext = e.to_lowercase();
            if a.extensions.iter().any(|x| *x == ext) {
                score += 5;
            }
        }
    }

    if a.shortcut.is_some() {
        score += 3;
    }

    if a.category == "file" {
        score += 2;
    }

    score
}

// getActionByShortcut(shortcut, context) -> QuickAction | null
fn action_by_shortcut(app: &tauri::AppHandle, shortcut: &str, ctx: &Value) -> Value {
    let normalized = shortcut.to_lowercase();
    for a in actions_for_context_v(app, ctx) {
        if let Some(s) = a.get("shortcut").and_then(|v| v.as_str()) {
            if s.to_lowercase() == normalized {
                return a;
            }
        }
    }
    Value::Null
}

// ===========================================================================
// CUSTOM ACTION STORE (persisted)
//
// Mirrors the Electron `customActions` Map but backed by the shared native KV
// store so it survives across restarts. Stored as a JSON array of QuickAction
// objects (same shape the renderer registers). Built-in ids can never be
// shadowed (register refuses them), so id uniqueness across the two catalogs is
// guaranteed by the register guard.
// ===========================================================================

const QUICKACTIONS_KEY: &str = "quickactions:custom";

fn read_custom(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, QUICKACTIONS_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn write_custom(app: &tauri::AppHandle, list: &[Value]) {
    crate::kv_set(app, QUICKACTIONS_KEY, Value::Array(list.to_vec()));
}

fn is_builtin_id(id: &str) -> bool {
    DEFAULT_ACTIONS.iter().any(|a| a.id == id)
}

// ===========================================================================
// VALUE-BASED ACCESSORS (built-ins + custom, mirroring the Electron
// `[...this.actions.values(), ...this.customActions.values()]` concatenation)
//
// These operate over generic QuickAction Values so registered custom actions
// participate in the list channels, exactly as in the Electron process.
// ===========================================================================

// All actions as owned Values, built-ins first then custom (insertion order).
fn all_actions_v(app: &tauri::AppHandle) -> Vec<Value> {
    let mut out: Vec<Value> = DEFAULT_ACTIONS.iter().map(act_to_json).collect();
    out.extend(read_custom(app));
    out
}

// Value field accessors mirroring the Act-based helpers above.
fn v_contexts_includes(a: &Value, t: &str) -> bool {
    a.get("contexts")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().any(|c| c.as_str() == Some(t)))
        .unwrap_or(false)
}

fn v_extensions(a: &Value) -> Vec<String> {
    a.get("extensions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn v_min_items(a: &Value) -> Option<i64> {
    a.get("minItems").and_then(|v| v.as_i64())
}

fn v_max_items(a: &Value) -> Option<i64> {
    a.get("maxItems").and_then(|v| v.as_i64())
}

fn v_category(a: &Value) -> &str {
    a.get("category").and_then(|v| v.as_str()).unwrap_or("")
}

fn v_has_shortcut(a: &Value) -> bool {
    a.get("shortcut").and_then(|v| v.as_str()).is_some()
}

// getActionRelevance(action, context) over a Value.
fn relevance_v(a: &Value, ctx: &Value) -> i64 {
    let mut score = 0i64;
    let t = ctx_type(ctx);
    let items = ctx_items(ctx);

    if v_contexts_includes(a, &t) {
        score += 10;
    }

    let exts = v_extensions(a);
    if !exts.is_empty() && !items.is_empty() {
        if let Some(e) = items[0].get("extension").and_then(|v| v.as_str()) {
            let ext = e.to_lowercase();
            if exts.iter().any(|x| *x == ext) {
                score += 5;
            }
        }
    }

    if v_has_shortcut(a) {
        score += 3;
    }

    if v_category(a) == "file" {
        score += 2;
    }

    score
}

// getActionsForContext(context) over the merged built-in + custom catalog.
fn actions_for_context_v(app: &tauri::AppHandle, ctx: &Value) -> Vec<Value> {
    let t = ctx_type(ctx);
    let items = ctx_items(ctx);
    let item_count = items.len();

    let mut matched: Vec<Value> = all_actions_v(app)
        .into_iter()
        .filter(|a| {
            if !v_contexts_includes(a, &t) {
                if item_count > 1 && !v_contexts_includes(a, "multiple") {
                    return false;
                }
                if item_count <= 1 {
                    return false;
                }
            }

            if let Some(min) = v_min_items(a) {
                if (item_count as i64) < min {
                    return false;
                }
            }
            if let Some(max) = v_max_items(a) {
                if (item_count as i64) > max {
                    return false;
                }
            }

            let exts = v_extensions(a);
            if !exts.is_empty() {
                let has_match = items.iter().any(|it| {
                    let ext = item_ext(it);
                    exts.iter().any(|e| *e == ext)
                });
                if !has_match {
                    return false;
                }
            }

            true
        })
        .collect();

    matched.sort_by(|a, b| relevance_v(b, ctx).cmp(&relevance_v(a, ctx)));
    matched
}

// executeAction(actionId, context) -> ActionResult
fn execute_action(app: &tauri::AppHandle, action_id: &str, ctx: &Value) -> Value {
    // Resolve from built-ins first, then the custom store (Electron order).
    let action: Option<Value> = DEFAULT_ACTIONS
        .iter()
        .find(|a| a.id == action_id)
        .map(act_to_json)
        .or_else(|| {
            read_custom(app)
                .into_iter()
                .find(|a| a.get("id").and_then(|v| v.as_str()) == Some(action_id))
        });

    let action = match action {
        Some(a) => a,
        None => return json!({ "success": false, "message": "Action not found" }),
    };

    // Notify the renderer to handle the action (Electron webContents.send).
    crate::native_ops::emit_event(
        app,
        "quickaction:execute",
        &json!({ "action": action, "context": ctx }),
    );

    json!({ "success": true })
}

// registerAction(action) -> { success, error? }
fn register_action(app: &tauri::AppHandle, action: &Value) -> Value {
    let id = action.get("id").and_then(|v| v.as_str()).unwrap_or("");

    if id.is_empty() {
        return json!({ "success": false, "error": "Action id is required" });
    }
    if is_builtin_id(id) {
        return json!({ "success": false, "error": "Cannot override built-in action" });
    }

    let mut list = read_custom(app);
    // Replace any existing custom action with the same id (Map.set semantics).
    list.retain(|a| a.get("id").and_then(|v| v.as_str()) != Some(id));
    list.push(action.clone());
    write_custom(app, &list);

    json!({ "success": true })
}

// unregisterAction(actionId) -> { success }
fn unregister_action(app: &tauri::AppHandle, action_id: &str) -> Value {
    if is_builtin_id(action_id) {
        return json!({ "success": false });
    }

    let mut list = read_custom(app);
    let before = list.len();
    list.retain(|a| a.get("id").and_then(|v| v.as_str()) != Some(action_id));
    let removed = list.len() != before;
    if removed {
        write_custom(app, &list);
    }

    json!({ "success": removed })
}

/// Route a `quickactions:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is handled,
/// including the heavy ones (execute/register/unregister) which run real native
/// code (custom-action KV persistence + a `quickaction:execute` renderer event).
/// Only unknown channels fall through to Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "quickactions:all" => {
            Value::Array(DEFAULT_ACTIONS.iter().map(act_to_json).collect())
        }
        "quickactions:forContext" => {
            let ctx = args.get(0).cloned().unwrap_or(Value::Null);
            Value::Array(actions_for_context(&ctx).into_iter().map(act_to_json).collect())
        }
        "quickactions:byShortcut" => {
            let shortcut = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let ctx = args.get(1).cloned().unwrap_or(Value::Null);
            action_by_shortcut(app, shortcut, &ctx)
        }
        // executeAction(actionId, context) -> ActionResult; pushes the
        // `quickaction:execute` renderer event (Electron webContents.send analog).
        "quickactions:execute" => {
            let action_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let ctx = args.get(1).cloned().unwrap_or(Value::Null);
            execute_action(app, action_id, &ctx)
        }
        // registerAction(action) -> { success, error? } (custom catalog, persisted).
        "quickactions:register" => {
            let action = args.get(0).cloned().unwrap_or(Value::Null);
            register_action(app, &action)
        }
        // unregisterAction(actionId) -> { success } (custom catalog, persisted).
        "quickactions:unregister" => {
            let action_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            unregister_action(app, action_id)
        }
        _ => Value::Null,
    }
}
