// =============================================================================
// DEX Tauri — Documents subsystem (port of the `documents:*` IPC handlers in
// src/main/controllers/WorkflowController.ts, which delegate to the
// DocumentCreator core in src/main/core/DocumentCreator.ts).
//
// Pure-data, JSON-backed tier. This ports ONLY the data/CRUD surface of the
// namespace (templates + preview). The heavy document-generation channels that
// touch the filesystem or a native dialog are NOT implemented and NOT faked.
//
// STORAGE
//   Electron's DocumentCreator persists *custom* templates (ids prefixed
//   `custom_`) to an `electron-store`-shaped file under userData:
//       dex-templates.json : { "templates": [DocumentTemplate, ...] }
//   Built-in templates are NOT persisted; they are re-seeded in memory on every
//   construction. We mirror that exactly: read/write the SAME file name
//   (dex-templates.json) with the SAME top-level `templates` array wrapper under
//   <appData>, and seed the SAME six built-ins in code.
//
//   NOTE on the prompt's "fs-json:documents.json": the live `documents:`
//   namespace has no documents.json — the authoritative source
//   (DocumentCreator.ts) uses dex-templates.json. We match the REAL file the
//   renderer round-trips, per the "SAME file name" rule.
//
// SHAPES (exact, from DocumentCreator.ts):
//   DocumentTemplate = { id, name, type, content, variables: string[],
//                        description?, createdAt: number }
//   DocumentResult   = { id, success, path?, error?, timestamp, type, size? }
//
// CHANNELS PORTED (pure data):
//   - documents:getTemplates   -> DocumentTemplate[]      (built-ins + custom)
//   - documents:getTemplate    -> DocumentTemplate | null
//   - documents:addTemplate    -> DocumentTemplate        (persists custom_*)
//   - documents:removeTemplate -> boolean                 (custom only; built-in
//                                  ids return false, matching Electron)
//   - documents:preview        -> string                  (pure template render;
//                                  no fs, deterministic)
//   - documents:getHistory     -> DocumentResult[]        (see DIVERGENCE below)
//
// CHANNELS SKIPPED (heavy / native runtime — omitted, prefix route -> null):
//   - documents:create         : writes files to disk (fs.mkdirSync/writeFileSync,
//                                statSync). Needs the native fs side effects.
//   - documents:selectOutputDir: opens a native directory-picker dialog.
//
// DIVERGENCES (documented):
//   - getHistory: in Electron the history (generatedDocuments) is an IN-MEMORY
//     array, populated only as documents are created within the same process and
//     never persisted. Because document creation is a skipped heavy channel and
//     this dispatcher is stateless across calls, getHistory always returns [] —
//     which is exactly what Electron returns on a fresh process before any
//     create. No history is invented.
//   - id generation: Electron used
//       `custom_${Date.now()}_${Math.random().toString(36).substring(2,6)}`
//     (timestamp + 4 base36 chars). We keep the SAME `custom_<ms>_<4>` shape but
//     derive the 4-char suffix from the mandated crate::util::pseudo_uuid_v4()
//     (first 4 hex chars) — no rand/Math.random. Collision resistance across one
//     machine is all that is needed.
//   - addTemplate writes the file by re-deriving the custom set from current
//     state on every call (same as DocumentCreator.saveTemplates, which filters
//     `id.startsWith('custom_')`); built-ins are never written out.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const TEMPLATES_FILE: &str = "dex-templates.json";

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// `custom_${Date.now()}_${Math.random().toString(36).substring(2,6)}`.
// Mirror the shape (prefix + ms + '_' + 4 chars) using the mandated helper.
fn custom_id() -> String {
    let suffix: String = pseudo_uuid_v4().chars().filter(|c| *c != '-').take(4).collect();
    format!("custom_{}_{}", now_ms(), suffix)
}

// --- file IO ----------------------------------------------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(TEMPLATES_FILE)
}

// Custom templates persisted under the `templates` key, [] if unset/unreadable.
fn read_custom(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.get("templates").and_then(|t| t.as_array()).cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn write_custom(app: &tauri::AppHandle, custom: &[Value]) -> bool {
    let body = json!({ "templates": custom });
    match serde_json::to_string_pretty(&body) {
        Ok(s) => std::fs::write(store_path(app), s).is_ok(),
        Err(_) => false,
    }
}

// --- built-in templates (mirror BUILT_IN_TEMPLATES in DocumentCreator.ts) ----

fn built_ins() -> Vec<Value> {
    vec![
        json!({
            "id": "blank-text",
            "name": "Blank Text",
            "type": "text",
            "content": "",
            "variables": [],
            "description": "Empty text document",
            "createdAt": 0,
        }),
        json!({
            "id": "blank-markdown",
            "name": "Blank Markdown",
            "type": "markdown",
            "content": "# {{title}}\n\n{{content}}",
            "variables": ["title", "content"],
            "description": "Markdown document with title",
            "createdAt": 0,
        }),
        json!({
            "id": "meeting-notes",
            "name": "Meeting Notes",
            "type": "markdown",
            "content": "# Meeting Notes: {{title}}\n\n**Date:** {{date}}\n**Attendees:** {{attendees}}\n\n## Agenda\n{{agenda}}\n\n## Discussion\n{{discussion}}\n\n## Action Items\n{{actions}}\n\n## Next Steps\n{{nextSteps}}\n",
            "variables": ["title", "date", "attendees", "agenda", "discussion", "actions", "nextSteps"],
            "description": "Structured meeting notes template",
            "createdAt": 0,
        }),
        json!({
            "id": "task-report",
            "name": "Task Report",
            "type": "markdown",
            "content": "# Task Report: {{title}}\n\n**Generated:** {{date}}\n\n## Summary\n{{summary}}\n\n## Completed Tasks\n{{completed}}\n\n## Pending Tasks\n{{pending}}\n\n## Notes\n{{notes}}\n",
            "variables": ["title", "date", "summary", "completed", "pending", "notes"],
            "description": "Task progress report",
            "createdAt": 0,
        }),
        json!({
            "id": "file-inventory",
            "name": "File Inventory",
            "type": "csv",
            "content": "Name,Type,Size,Modified\n{{rows}}",
            "variables": ["rows"],
            "description": "CSV inventory of files",
            "createdAt": 0,
        }),
        json!({
            "id": "data-export",
            "name": "Data Export",
            "type": "json",
            "content": "{{data}}",
            "variables": ["data"],
            "description": "JSON data export",
            "createdAt": 0,
        }),
    ]
}

fn id_of(t: &Value) -> Option<&str> {
    t.get("id").and_then(|v| v.as_str())
}

// The full template Map (built-ins first, then custom). DocumentCreator inserts
// built-ins then custom into a Map keyed by id, so a custom template whose id
// collides with a built-in would override it; we preserve that ordering with a
// de-dup pass (later entries win), matching Map.set semantics.
fn all_templates(app: &tauri::AppHandle) -> Vec<Value> {
    let mut out: Vec<Value> = built_ins();
    for c in read_custom(app) {
        if let Some(cid) = c.get("id").and_then(|v| v.as_str()).map(String::from) {
            if let Some(idx) = out.iter().position(|t| id_of(t) == Some(cid.as_str())) {
                out[idx] = c;
                continue;
            }
        }
        out.push(c);
    }
    out
}

// getTemplate(id) -> DocumentTemplate | null
fn get_template(app: &tauri::AppHandle, id: &str) -> Value {
    all_templates(app)
        .into_iter()
        .find(|t| id_of(t) == Some(id))
        .unwrap_or(Value::Null)
}

// addTemplate({ ...template }) -> the new DocumentTemplate.
// Electron spreads the input then overwrites id + createdAt; it does NOT
// validate the shape, so we pass through whatever fields the caller supplied and
// stamp id/createdAt last (matching `{ ...template, id, createdAt }`).
fn add_template(app: &tauri::AppHandle, template: &Value) -> Value {
    let mut obj = template.as_object().cloned().unwrap_or_default();
    obj.insert("id".into(), json!(custom_id()));
    obj.insert("createdAt".into(), json!(now_ms()));
    let new_template = Value::Object(obj);

    let mut custom = read_custom(app);
    custom.push(new_template.clone());
    write_custom(app, &custom);
    new_template
}

// removeTemplate(id) -> boolean. Only custom_* ids may be removed; built-in ids
// return false without touching the file (matching DocumentCreator.removeTemplate).
fn remove_template(app: &tauri::AppHandle, id: &str) -> Value {
    if !id.starts_with("custom_") {
        return json!(false);
    }
    let custom = read_custom(app);
    let kept: Vec<Value> = custom.iter().filter(|t| id_of(t) != Some(id)).cloned().collect();
    let removed = kept.len() != custom.len();
    if removed {
        write_custom(app, &kept);
    }
    json!(removed)
}

// processTemplate(content, data): replace {{key}} with String(value ?? ''),
// then strip any remaining {{...}} placeholders. Mirrors DocumentCreator.
fn process_template(content: &str, data: &Value) -> String {
    let mut result = content.to_string();
    if let Some(map) = data.as_object() {
        for (key, value) in map {
            let placeholder = format!("{{{{{}}}}}", key);
            let replacement = match value {
                Value::Null => String::new(),
                Value::String(s) => s.clone(),
                Value::Bool(b) => b.to_string(),
                Value::Number(n) => n.to_string(),
                other => other.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
    }
    strip_placeholders(&result)
}

// Remove any leftover {{...}} (non-'}' run), mirroring /\{\{[^}]+\}\}/g.
fn strip_placeholders(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            // find closing "}}" with at least one non-'}' char between (the [^}]+).
            let mut j = i + 2;
            let mut inner = 0usize;
            while j + 1 < bytes.len() && !(bytes[j] == b'}' && bytes[j + 1] == b'}') {
                if bytes[j] == b'}' {
                    break;
                }
                inner += 1;
                j += 1;
            }
            if inner > 0 && j + 1 < bytes.len() && bytes[j] == b'}' && bytes[j + 1] == b'}' {
                i = j + 2; // drop the whole {{...}}
                continue;
            }
        }
        // copy this char (handle multi-byte UTF-8 safely).
        let ch_len = utf8_len(bytes[i]);
        out.push_str(&s[i..i + ch_len]);
        i += ch_len;
    }
    out
}

fn utf8_len(b: u8) -> usize {
    if b < 0x80 {
        1
    } else if b >> 5 == 0b110 {
        2
    } else if b >> 4 == 0b1110 {
        3
    } else if b >> 3 == 0b11110 {
        4
    } else {
        1
    }
}

// generateContent(request) for the no-template path of preview. Mirrors
// DocumentCreator.generateContent exactly.
fn generate_content(request: &Value) -> String {
    let data = request.get("data").cloned().unwrap_or_else(|| json!({}));
    let name = request.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let dtype = request.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let content = data.get("content").and_then(|v| v.as_str());
    match dtype {
        "text" => content.unwrap_or("").to_string(),
        "markdown" => content
            .map(String::from)
            .unwrap_or_else(|| format!("# {}\n\n", name)),
        "csv" => content.unwrap_or("").to_string(),
        "json" => serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string()),
        "html" => format!(
            "<!DOCTYPE html>\n<html>\n<head>\n  <title>{}</title>\n  <meta charset=\"utf-8\">\n</head>\n<body>\n  {}\n</body>\n</html>",
            name,
            content.unwrap_or("")
        ),
        _ => String::new(),
    }
}

// previewDocument(request) -> string. Pure: no fs writes.
fn preview_document(app: &tauri::AppHandle, request: &Value) -> Value {
    if let Some(tid) = request.get("templateId").and_then(|v| v.as_str()) {
        let template = get_template(app, tid);
        if template.is_null() {
            return json!("Error: Template not found");
        }
        let content = template.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let data = request.get("data").cloned().unwrap_or_else(|| json!({}));
        return json!(process_template(content, &data));
    }
    json!(generate_content(request))
}

/// Route a `documents:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// accounted for: ported data channels return their exact shapes; heavy channels
/// (create, selectOutputDir) fall through to Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "documents:getTemplates" => json!(all_templates(app)),
        "documents:getTemplate" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_template(app, id)
        }
        "documents:addTemplate" => {
            let template = args.get(0).cloned().unwrap_or_else(|| json!({}));
            add_template(app, &template)
        }
        "documents:removeTemplate" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            remove_template(app, id)
        }
        "documents:preview" => {
            let request = args.get(0).cloned().unwrap_or_else(|| json!({}));
            preview_document(app, &request)
        }
        // In-memory-only history; always [] in a stateless native process (the
        // create channel that would populate it is a skipped heavy channel).
        "documents:getHistory" => json!([]),
        // Heavy / native-runtime channels — not ported, not faked.
        _ => Value::Null,
    }
}
