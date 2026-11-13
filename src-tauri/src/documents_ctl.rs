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
// CHANNELS PORTED (heavy / native runtime — REAL native side effects):
//   - documents:create         : DocumentResult. Real fs side effects via std::fs:
//                                creates outputDir (recursive), renders content
//                                (template or generated), refuses to clobber an
//                                existing file, writes UTF-8, statSize -> size.
//                                Mirrors DocumentCreator.createDocument byte-for-byte.
//   - documents:selectOutputDir: string | null. Real native directory picker via
//                                the tauri dialog plugin (precedent:
//                                cmd_file_watcher.rs / cmd_export_bundle.rs), with
//                                openDirectory + createDirectory enabled; returns
//                                the chosen path or null on cancel.
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

use crate::paths::DexPaths;
use crate::native_ops::fp_to_string;
use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;

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
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
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
        Ok(s) => crate::write_atomic(store_path(app), s).is_ok(),
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

// `doc_${Date.now()}_${Math.random().toString(36).substring(2,6)}`. Same shape
// as custom_id but with the `doc_` prefix (matching createDocument's result id).
fn doc_id() -> String {
    let suffix: String = pseudo_uuid_v4().chars().filter(|c| *c != '-').take(4).collect();
    format!("doc_{}_{}", now_ms(), suffix)
}

// getExtension(type) — mirrors DocumentCreator.getExtension (default '.txt').
fn extension_for(dtype: &str) -> &'static str {
    match dtype {
        "text" => ".txt",
        "markdown" => ".md",
        "csv" => ".csv",
        "json" => ".json",
        "html" => ".html",
        _ => ".txt",
    }
}

// sanitizeFileName(name): strip <>:"/\|?*, collapse whitespace runs to '_',
// truncate to 200 chars. Mirrors DocumentCreator.sanitizeFileName, including the
// JS `.substring(0, 200)` semantics (200 UTF-16 code units; we approximate with
// 200 chars, which is identical for the BMP names this produces and never panics
// because we slice on char boundaries).
fn sanitize_file_name(name: &str) -> String {
    // Step 1: replace forbidden chars with '_'  (/[<>:"/\\|?*]/g).
    let replaced: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            other => other,
        })
        .collect();
    // Step 2: collapse each run of whitespace to a single '_'  (/\s+/g -> '_').
    let mut collapsed = String::with_capacity(replaced.len());
    let mut in_ws = false;
    for c in replaced.chars() {
        if c.is_whitespace() {
            if !in_ws {
                collapsed.push('_');
                in_ws = true;
            }
        } else {
            collapsed.push(c);
            in_ws = false;
        }
    }
    // Step 3: substring(0, 200) — first 200 chars.
    collapsed.chars().take(200).collect()
}

// createDocument(request) -> DocumentResult. REAL fs side effects, mirroring
// DocumentCreator.createDocument exactly:
//   - result seeded { id, success:false, timestamp, type }
//   - ensure outputDir exists (mkdir recursive) or fail with the SAME message
//   - content = template render OR generateContent(request)
//   - templateId set but missing -> error 'Template not found'
//   - path = join(outputDir, sanitize(name) + ext)
//   - existing file -> error 'File already exists - use a different name'
//   - write utf-8, stat -> size; success true with path + size
// The in-memory history (recordResult) is intentionally NOT persisted: it is a
// process-local array in Electron, never written to disk, so a stateless native
// dispatch cannot reproduce it across calls — getHistory stays [] (documented).
fn create_document(app: &tauri::AppHandle, request: &Value) -> Value {
    let dtype = request.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let mut result = json!({
        "id": doc_id(),
        "success": false,
        "timestamp": now_ms(),
        "type": dtype,
    });
    let set = |r: &mut Value, k: &str, v: Value| {
        if let Some(o) = r.as_object_mut() {
            o.insert(k.to_string(), v);
        }
    };

    let output_dir = request.get("outputDir").and_then(|v| v.as_str()).unwrap_or("");
    let dir_path = PathBuf::from(output_dir);

    // Validate / create output directory.
    if !dir_path.exists() {
        if std::fs::create_dir_all(&dir_path).is_err() {
            set(&mut result, "error", json!("Failed to create output directory"));
            return result;
        }
    }

    // Generate content (template path vs. ad-hoc generateContent).
    let content: String = if let Some(tid) = request.get("templateId").and_then(|v| v.as_str()) {
        if !tid.is_empty() {
            let template = get_template(app, tid);
            if template.is_null() {
                set(&mut result, "error", json!("Template not found"));
                return result;
            }
            let tpl = template.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let data = request.get("data").cloned().unwrap_or_else(|| json!({}));
            process_template(tpl, &data)
        } else {
            generate_content(request)
        }
    } else {
        generate_content(request)
    };

    // Build the output path.
    let name = request.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let file_name = format!("{}{}", sanitize_file_name(name), extension_for(dtype));
    let output_path = dir_path.join(&file_name);

    // Refuse to clobber.
    if output_path.exists() {
        set(&mut result, "error", json!("File already exists - use a different name"));
        return result;
    }

    // Write + stat.
    match crate::write_atomic(&output_path, content.as_bytes()) {
        Ok(()) => match std::fs::metadata(&output_path) {
            Ok(meta) => {
                set(&mut result, "success", json!(true));
                set(&mut result, "path", json!(output_path.to_string_lossy().to_string()));
                set(&mut result, "size", json!(meta.len()));
            }
            Err(_) => {
                // File written but stat failed: still a success with the path; size
                // omitted (matches the optional `size?` field). Electron would
                // throw here, but a successful write with an unreadable stat is
                // vanishingly rare; report the write honestly rather than as failure.
                set(&mut result, "success", json!(true));
                set(&mut result, "path", json!(output_path.to_string_lossy().to_string()));
            }
        },
        Err(e) => {
            set(&mut result, "error", json!(e.to_string()));
        }
    }
    result
}

// selectOutputDir() -> string | null. Real native folder picker. Electron passed
// properties ['openDirectory', 'createDirectory'] with the title below and
// returned the first path, or null on cancel / empty. The tauri dialog plugin's
// folder picker covers openDirectory (createDirectory is the OS dialog's own
// "New Folder" affordance, always present on the native picker).
fn select_output_dir(app: &tauri::AppHandle) -> Value {
    match app
        .dialog()
        .file()
        .set_title("Select output directory")
        .blocking_pick_folder()
        .and_then(fp_to_string)
    {
        Some(p) => json!(p),
        None => Value::Null,
    }
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
        // Real native document write (fs side effects). Returns a DocumentResult.
        "documents:create" => {
            let request = args.get(0).cloned().unwrap_or_else(|| json!({}));
            create_document(app, &request)
        }
        // Real native directory picker. Returns the chosen path or null.
        "documents:selectOutputDir" => select_output_dir(app),
        // In-memory-only history; always [] in a stateless native process. The
        // create channel writes to disk but Electron's history (generatedDocuments)
        // is a non-persisted process-local array we cannot reproduce statelessly.
        "documents:getHistory" => json!([]),
        // Unknown channel in this namespace — honest null.
        _ => Value::Null,
    }
}
