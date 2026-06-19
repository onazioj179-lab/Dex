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
// HEAVY channels SKIPPED (not implemented, not faked):
//   - quickactions:execute    — notifies the renderer over a live webContents
//     channel and emits an EventEmitter event; pure side-effect, needs the native
//     runtime. Omitted (prefix route returns null).
//   - quickactions:register / quickactions:unregister — the "customize" surface;
//     mutate the in-memory customActions Map. With no persistence in Electron a
//     fresh process always starts with zero custom actions, so the list channels
//     are unaffected. Omitted (prefix route returns null).
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
fn action_by_shortcut(shortcut: &str, ctx: &Value) -> Value {
    let normalized = shortcut.to_lowercase();
    for a in actions_for_context(ctx) {
        if let Some(s) = a.shortcut {
            if s.to_lowercase() == normalized {
                return act_to_json(a);
            }
        }
    }
    Value::Null
}

/// Route a `quickactions:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is handled;
/// the heavy/unported ones (execute, register, unregister) and any unknown
/// channel return Value::Null (honest degrade).
///
/// The `_app` handle is unused — these channels read no persisted state — but is
/// taken to match the house dispatch signature used by analytics/rule_engine.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
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
            action_by_shortcut(shortcut, &ctx)
        }
        // Heavy / customize surface — intentionally not ported, not faked.
        // "quickactions:execute" | "quickactions:register" | "quickactions:unregister"
        _ => Value::Null,
    }
}
