// =============================================================================
// DEX Tauri — Import subsystem (port of the `import:*` IPC handlers in
// core/DataImportManager.ts).
//
// PROMPT-vs-SOURCE DIVERGENCE (documented):
//   The porting brief named `getStatus` / `import` / `validate` / `preview`
//   channels plus an `import-state.json` store. NONE of those exist in
//   DataImportManager.ts — there is NO status channel, NO import-state.json, and
//   NO persisted state of any kind (the subsystem is stateless: it reads files
//   off disk on demand and streams created rows to the renderer over IPC). The
//   real namespace surface (from setupIPC) is:
//       import:get-sources  -> ImportSourceInfo[]   (DATA)
//       import:select-files -> string[]             (HEAVY — native file dialog)
//       import:preview      -> ImportPreview        (HEAVY — reads + parses files)
//       import:execute      -> ImportResult         (HEAVY — emits IPC events that
//                                                     create notes/tasks)
//   All four are now ported with REAL native code at the EXACT Electron return
//   shapes. The renderer is unchanged.
//
// Native mapping:
//   - select-files : tauri-plugin-dialog blocking pickers (folder for
//     obsidian/notion, then a recursive ext-filtered walk; multi-file picker for
//     the rest). Mirrors Electron's `dialog.showOpenDialog` branches. Dialog
//     bodies run on a Tauri worker thread, so blocking_* is safe here (same
//     precedent as native_ops::show_open_dialog).
//   - preview     : std::fs reads under the caller-supplied absolute paths +
//     a faithful Rust port of every parser (stripHtml, frontmatter, tags, CSV,
//     todoist, markdown, plain text). Per-file failures become `warnings`.
//   - execute     : for each selected item, emit `import:note-created` /
//     `import:task-created` via crate::native_ops::emit_event — the Tauri analog
//     of `mainWindow.webContents.send` — and tally the ImportResult.
//   ids -> crate::util::pseudo_uuid_v4(); timestamps -> RFC3339-ish UTC strings
//   built from the epoch clock to mirror `new Date().toISOString()`.
// =============================================================================

use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

// --- catalogue -------------------------------------------------------------

// (id, extensions) for the recognised import sources. Used by select-files to
// resolve the folder-walk filter and to validate the requested source.
fn source_extensions(source: &str) -> Option<Vec<&'static str>> {
    Some(match source {
        "apple_notes" => vec![".html", ".htm"],
        "obsidian" => vec![".md"],
        "notion" => vec![".md", ".csv"],
        "todoist" => vec![".csv"],
        "markdown" => vec![".md", ".markdown", ".mdown"],
        "plain_text" => vec![".txt"],
        _ => return None,
    })
}

fn source_display_name(source: &str) -> &'static str {
    match source {
        "apple_notes" => "Apple Notes",
        "obsidian" => "Obsidian",
        "notion" => "Notion",
        "todoist" => "Todoist",
        "markdown" => "Markdown Files",
        "plain_text" => "Plain Text",
        _ => "",
    }
}

// Static catalogue mirroring IMPORT_SOURCES in DataImportManager.ts. Field
// names and order match ImportSourceInfo exactly:
//   { id, name, description, accepts: string[], extensions: string[] }
fn get_sources() -> Value {
    json!([
        {
            "id": "apple_notes",
            "name": "Apple Notes",
            "description": "Import from Apple Notes export (HTML files)",
            "accepts": ["text/html"],
            "extensions": [".html", ".htm"]
        },
        {
            "id": "obsidian",
            "name": "Obsidian",
            "description": "Import a folder of Obsidian markdown vault files",
            "accepts": ["text/markdown"],
            "extensions": [".md"]
        },
        {
            "id": "notion",
            "name": "Notion",
            "description": "Import a Notion export folder (markdown and CSV)",
            "accepts": ["text/markdown", "text/csv"],
            "extensions": [".md", ".csv"]
        },
        {
            "id": "todoist",
            "name": "Todoist",
            "description": "Import tasks from a Todoist CSV export",
            "accepts": ["text/csv"],
            "extensions": [".csv"]
        },
        {
            "id": "markdown",
            "name": "Markdown Files",
            "description": "Import one or more markdown files as notes",
            "accepts": ["text/markdown"],
            "extensions": [".md", ".markdown", ".mdown"]
        },
        {
            "id": "plain_text",
            "name": "Plain Text",
            "description": "Import plain text files as notes",
            "accepts": ["text/plain"],
            "extensions": [".txt"]
        }
    ])
}

// --- time / id helpers -----------------------------------------------------

// Mirror of `new Date().toISOString()` (UTC, millisecond precision, trailing Z).
// Computed from the epoch clock so it needs no chrono dependency.
fn now_iso() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let total_ms = dur.as_millis() as i64;
    let ms = (total_ms % 1000) as i64;
    let secs = total_ms / 1000;

    // days since 1970-01-01 + seconds-of-day split.
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let hour = sod / 3600;
    let minute = (sod % 3600) / 60;
    let second = sod % 60;

    // Civil-date conversion (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let year = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, m, d, hour, minute, second, ms
    )
}

fn new_id() -> String {
    crate::util::pseudo_uuid_v4()
}

// --- parser helpers (faithful ports of the TS regex pipeline) --------------

// Drop everything between an opening tag of `name` and its closing tag,
// case-insensitive, matching the `<style ...>...</style>` / `<script ...>` rules.
fn strip_tag_blocks(input: &str, name: &str) -> String {
    let lower = input.to_lowercase();
    let open = format!("<{}", name.to_lowercase());
    let close = format!("</{}>", name.to_lowercase());
    let mut out = String::with_capacity(input.len());
    let mut idx = 0usize;
    loop {
        match lower[idx..].find(&open) {
            None => {
                out.push_str(&input[idx..]);
                break;
            }
            Some(rel_start) => {
                let start = idx + rel_start;
                out.push_str(&input[idx..start]);
                // find the end of the closing tag from `start`
                match lower[start..].find(&close) {
                    None => {
                        // No closing tag: drop the rest (mirrors greedy [\s\S]*?
                        // with no match -> the original keeps it; be conservative
                        // and keep the remainder so content is not lost).
                        out.push_str(&input[start..]);
                        break;
                    }
                    Some(rel_end) => {
                        idx = start + rel_end + close.len();
                    }
                }
            }
        }
    }
    out
}

// Replace any tag whose (lowercased) name matches `name` — `<br>`, `<br/>`,
// `<br ...>` — with `replacement`.
fn replace_self_tag(input: &str, name: &str, replacement: &str) -> String {
    let lower = input.to_lowercase();
    let needle = format!("<{}", name.to_lowercase());
    let mut out = String::with_capacity(input.len());
    let mut idx = 0usize;
    loop {
        match lower[idx..].find(&needle) {
            None => {
                out.push_str(&input[idx..]);
                break;
            }
            Some(rel) => {
                let start = idx + rel;
                // tag name must be followed by a non-alphanumeric boundary so
                // `<break>` does not match `<br`.
                let after = lower[start + needle.len()..].chars().next();
                let is_boundary = matches!(after, None | Some(' ') | Some('/') | Some('>') | Some('\t') | Some('\n'));
                if !is_boundary {
                    out.push_str(&input[start..start + needle.len()]);
                    idx = start + needle.len();
                    continue;
                }
                out.push_str(&input[idx..start]);
                match input[start..].find('>') {
                    None => {
                        out.push_str(&input[start..]);
                        break;
                    }
                    Some(gt) => {
                        out.push_str(replacement);
                        idx = start + gt + 1;
                    }
                }
            }
        }
    }
    out
}

// Replace each closing tag `</name>` with `replacement`.
fn replace_close_tag(input: &str, name: &str, replacement: &str) -> String {
    let needle = format!("</{}>", name.to_lowercase());
    let lower = input.to_lowercase();
    let mut out = String::with_capacity(input.len());
    let mut idx = 0usize;
    loop {
        match lower[idx..].find(&needle) {
            None => {
                out.push_str(&input[idx..]);
                break;
            }
            Some(rel) => {
                let start = idx + rel;
                out.push_str(&input[idx..start]);
                out.push_str(replacement);
                idx = start + needle.len();
            }
        }
    }
    out
}

// Strip every remaining `<...>` tag.
fn strip_all_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut depth = false;
    for ch in input.chars() {
        match ch {
            '<' => depth = true,
            '>' => depth = false,
            _ if !depth => out.push(ch),
            _ => {}
        }
    }
    out
}

// Collapse runs of 3+ newlines down to exactly two.
fn collapse_blank_lines(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut newline_run = 0usize;
    for ch in input.chars() {
        if ch == '\n' {
            newline_run += 1;
            if newline_run <= 2 {
                out.push('\n');
            }
        } else {
            newline_run = 0;
            out.push(ch);
        }
    }
    out
}

// Port of stripHtml(): order of operations preserved.
fn strip_html(html: &str) -> String {
    let mut text = strip_tag_blocks(html, "style");
    text = strip_tag_blocks(&text, "script");
    text = replace_self_tag(&text, "br", "\n");
    text = replace_close_tag(&text, "p", "\n\n");
    text = replace_close_tag(&text, "div", "\n");
    text = replace_close_tag(&text, "li", "\n");
    text = replace_self_tag(&text, "li", "- ");
    // Headings: <h1>..<h6> -> "\n" + inner-text + "\n". Strip inner tags too.
    text = replace_headings(&text);
    text = strip_all_tags(&text);
    text = text
        .replace("&nbsp;", " ")
        .replace("&NBSP;", " ")
        .replace("&amp;", "&")
        .replace("&AMP;", "&")
        .replace("&lt;", "<")
        .replace("&LT;", "<")
        .replace("&gt;", ">")
        .replace("&GT;", ">")
        .replace("&quot;", "\"")
        .replace("&QUOT;", "\"")
        .replace("&#39;", "'");
    text = collapse_blank_lines(&text);
    text.trim().to_string()
}

// Replace <hN ...>inner</hN> with "\n" + (inner stripped of tags) + "\n".
fn replace_headings(input: &str) -> String {
    let lower = input.to_lowercase();
    let mut out = String::with_capacity(input.len());
    let mut idx = 0usize;
    loop {
        // find next `<h` followed by a 1-6 digit
        let rel = match lower[idx..].find("<h") {
            None => {
                out.push_str(&input[idx..]);
                break;
            }
            Some(r) => r,
        };
        let start = idx + rel;
        let level_char = lower[start + 2..].chars().next();
        let level = match level_char {
            Some(c @ '1'..='6') => c,
            _ => {
                out.push_str(&input[idx..start + 2]);
                idx = start + 2;
                continue;
            }
        };
        // end of the opening tag
        let open_gt = match input[start..].find('>') {
            None => {
                out.push_str(&input[idx..]);
                break;
            }
            Some(g) => start + g,
        };
        let close = format!("</h{}>", level);
        let close_pos = match lower[open_gt..].find(&close) {
            None => {
                // unmatched: leave as-is
                out.push_str(&input[idx..start + 2]);
                idx = start + 2;
                continue;
            }
            Some(c) => open_gt + c,
        };
        let inner = &input[open_gt + 1..close_pos];
        out.push_str(&input[idx..start]);
        out.push('\n');
        out.push_str(&strip_all_tags(inner));
        out.push('\n');
        idx = close_pos + close.len();
    }
    out
}

fn first_line(content: &str) -> &str {
    content.split('\n').next().unwrap_or("").trim()
}

// Port of extractTitleFromContent().
fn extract_title(content: &str, fallback: &str) -> String {
    let fl = first_line(content);
    if let Some(rest) = fl.strip_prefix('#') {
        // strip the leading run of '#' and following whitespace
        let trimmed = rest.trim_start_matches('#').trim_start();
        return trimmed.to_string();
    }
    let len = fl.chars().count();
    if len > 0 && len < 200 {
        return fl.to_string();
    }
    fallback.to_string()
}

// Port of parseObsidianTags(): #tag where tag is [A-Za-z0-9_/-]+ and not all
// digits; de-duplicated, insertion order preserved.
fn parse_tags(content: &str) -> Vec<String> {
    let bytes: Vec<char> = content.chars().collect();
    let mut tags: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == '#' {
            let mut j = i + 1;
            let mut tag = String::new();
            while j < bytes.len() {
                let c = bytes[j];
                if c.is_ascii_alphanumeric() || c == '_' || c == '/' || c == '-' {
                    tag.push(c);
                    j += 1;
                } else {
                    break;
                }
            }
            if !tag.is_empty() && !tag.chars().all(|c| c.is_ascii_digit()) {
                if seen.insert(tag.clone()) {
                    tags.push(tag);
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    tags
}

// Port of parseObsidianFrontmatter(): returns (metadata map, body).
fn parse_frontmatter(content: &str) -> (Map<String, Value>, String) {
    let mut metadata = Map::new();
    if !content.starts_with("---") {
        return (metadata, content.to_string());
    }
    // indexOf('---', 3)
    let end = match content[3..].find("---") {
        Some(rel) => 3 + rel,
        None => return (metadata, content.to_string()),
    };
    let frontmatter = content[3..end].trim();
    for line in frontmatter.split('\n') {
        if let Some(colon) = line.find(':') {
            if colon > 0 {
                let key = line[..colon].trim().to_string();
                let value = line[colon + 1..].trim().to_string();
                metadata.insert(key, Value::String(value));
            }
        }
    }
    let body = content[end + 3..].trim().to_string();
    (metadata, body)
}

// Port of parseCsvLine().
fn parse_csv_line(line: &str) -> Vec<String> {
    let chars: Vec<char> = line.chars().collect();
    let mut fields: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut i = 0usize;
    while i < chars.len() {
        let ch = chars[i];
        if in_quotes {
            if ch == '"' {
                if i + 1 < chars.len() && chars[i + 1] == '"' {
                    current.push('"');
                    i += 1;
                } else {
                    in_quotes = false;
                }
            } else {
                current.push(ch);
            }
        } else if ch == '"' {
            in_quotes = true;
        } else if ch == ',' {
            fields.push(current.trim().to_string());
            current.clear();
        } else {
            current.push(ch);
        }
        i += 1;
    }
    fields.push(current.trim().to_string());
    fields
}

fn metadata_get_str(meta: &Map<String, Value>, key: &str) -> Option<String> {
    meta.get(key).and_then(|v| v.as_str()).map(String::from)
}

// --- ImportItem builders ---------------------------------------------------

fn build_item(
    title: String,
    content: String,
    item_type: &str,
    tags: Vec<String>,
    created_at: String,
    updated_at: String,
    metadata: Map<String, Value>,
) -> Value {
    json!({
        "id": new_id(),
        "title": title,
        "content": content,
        "type": item_type,
        "tags": tags,
        "created_at": created_at,
        "updated_at": updated_at,
        "metadata": Value::Object(metadata),
        "selected": true
    })
}

fn parse_apple_notes(html: &str, filename: &str) -> Value {
    // <title>...</title>
    let lower = html.to_lowercase();
    let title = if let Some(s) = lower.find("<title") {
        let after_open = html[s..].find('>').map(|g| s + g + 1);
        match after_open {
            Some(open) => match lower[open..].find("</title>") {
                Some(rel) => html[open..open + rel].trim().to_string(),
                None => strip_ext(filename, &[".html", ".htm"]),
            },
            None => strip_ext(filename, &[".html", ".htm"]),
        }
    } else {
        strip_ext(filename, &[".html", ".htm"])
    };
    let content = strip_html(html);
    let now = now_iso();
    let mut meta = Map::new();
    meta.insert("source".into(), Value::String("apple_notes".into()));
    build_item(title, content, "note", vec![], now.clone(), now, meta)
}

fn parse_obsidian(content: &str, filename: &str) -> Value {
    let (metadata, body) = parse_frontmatter(content);
    let tags = parse_tags(&body);
    let title = metadata_get_str(&metadata, "title")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| extract_title(&body, &strip_ext(filename, &[".md"])));
    let now = now_iso();
    let created = metadata_get_str(&metadata, "created")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| now.clone());
    let updated = metadata_get_str(&metadata, "updated")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| now.clone());
    let mut meta = Map::new();
    meta.insert("source".into(), Value::String("obsidian".into()));
    for (k, v) in metadata.iter() {
        meta.insert(k.clone(), v.clone());
    }
    build_item(title, body, "note", tags, created, updated, meta)
}

fn parse_notion(content: &str, filename: &str) -> Value {
    let (metadata, body) = parse_frontmatter(content);
    let title = extract_title(&body, &strip_ext(filename, &[".md"]));
    let now = now_iso();
    let mut meta = Map::new();
    meta.insert("source".into(), Value::String("notion".into()));
    for (k, v) in metadata.iter() {
        meta.insert(k.clone(), v.clone());
    }
    build_item(title, body, "note", vec![], now.clone(), now, meta)
}

fn parse_todoist(csv: &str) -> Vec<Value> {
    let lines: Vec<&str> = csv.split('\n').filter(|l| !l.trim().is_empty()).collect();
    if lines.len() < 2 {
        return vec![];
    }
    let headers: Vec<String> = parse_csv_line(lines[0])
        .into_iter()
        .map(|h| h.to_lowercase())
        .collect();
    let idx_of = |name: &str| headers.iter().position(|h| h == name);
    let content_idx = idx_of("content");
    let desc_idx = idx_of("description");
    let priority_idx = idx_of("priority");
    let due_idx = idx_of("due date");
    let labels_idx = idx_of("labels");

    let mut items: Vec<Value> = Vec::new();
    for line in &lines[1..] {
        let fields = parse_csv_line(line);
        if fields.is_empty() {
            continue;
        }
        let title = match content_idx {
            Some(ix) => fields.get(ix).cloned().unwrap_or_default(),
            None => fields.first().cloned().unwrap_or_default(),
        };
        if title.trim().is_empty() {
            continue;
        }
        let description = match desc_idx {
            Some(ix) => fields.get(ix).cloned().unwrap_or_default(),
            None => String::new(),
        };
        let priority = match priority_idx {
            Some(ix) => fields.get(ix).cloned().unwrap_or_default(),
            None => String::new(),
        };
        let due = match due_idx {
            Some(ix) => fields.get(ix).cloned().unwrap_or_default(),
            None => String::new(),
        };
        let labels: Vec<String> = match labels_idx {
            Some(ix) => fields
                .get(ix)
                .map(|s| {
                    s.split(',')
                        .map(|l| l.trim().to_string())
                        .filter(|l| !l.is_empty())
                        .collect()
                })
                .unwrap_or_default(),
            None => vec![],
        };
        let now = now_iso();
        let mut meta = Map::new();
        meta.insert("source".into(), Value::String("todoist".into()));
        meta.insert("priority".into(), Value::String(priority));
        meta.insert("dueDate".into(), Value::String(due));
        items.push(build_item(
            title.trim().to_string(),
            description,
            "task",
            labels,
            now.clone(),
            now,
            meta,
        ));
    }
    items
}

fn parse_markdown(content: &str, filename: &str) -> Value {
    let title = extract_title(content, &strip_ext(filename, &[".md", ".markdown", ".mdown"]));
    let now = now_iso();
    let mut meta = Map::new();
    meta.insert("source".into(), Value::String("markdown".into()));
    build_item(title, content.to_string(), "note", vec![], now.clone(), now, meta)
}

fn parse_plain_text(content: &str, filename: &str) -> Value {
    let title = extract_title(content, &strip_ext(filename, &[".txt"]));
    let now = now_iso();
    let mut meta = Map::new();
    meta.insert("source".into(), Value::String("plain_text".into()));
    build_item(title, content.to_string(), "note", vec![], now.clone(), now, meta)
}

// Strip the first matching extension (case-insensitive) from a filename — mirror
// of the `.replace(/\.md$/i, '')` calls in each parser.
fn strip_ext(filename: &str, exts: &[&str]) -> String {
    let lower = filename.to_lowercase();
    for ext in exts {
        if lower.ends_with(ext) {
            return filename[..filename.len() - ext.len()].to_string();
        }
    }
    filename.to_string()
}

fn file_basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

// Recursive ext-filtered walk (port of collectFilesFromDir).
fn collect_files_from_dir(dir: &Path, extensions: &[&str], out: &mut Vec<String>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            collect_files_from_dir(&path, extensions, out);
        } else if ft.is_file() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if let Some(dot) = name.rfind('.') {
                let ext = &name[dot..];
                if extensions.iter().any(|e| *e == ext) {
                    out.push(path.to_string_lossy().to_string());
                }
            }
        }
    }
}

// --- heavy channel implementations -----------------------------------------

// import:select-files (source) -> string[]
// Native open dialog: folder picker (+ recursive walk) for obsidian/notion;
// multi-file picker (ext-filtered) for everything else.
fn select_files(app: &tauri::AppHandle, args: &Value) -> Value {
    use tauri_plugin_dialog::DialogExt;

    let source = match args.get(0).and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return json!([]),
    };
    let extensions = match source_extensions(source) {
        Some(e) => e,
        None => return json!([]), // unknown source -> [] (mirrors `return []`)
    };
    let name = source_display_name(source);

    if source == "obsidian" || source == "notion" {
        let picked = app
            .dialog()
            .file()
            .set_title(format!("Select {} folder", name))
            .blocking_pick_folder();
        let dir = match picked.and_then(|fp| fp.into_path().ok()) {
            Some(p) => p,
            None => return json!([]), // canceled / empty
        };
        let mut out: Vec<String> = Vec::new();
        collect_files_from_dir(&dir, &extensions, &mut out);
        return json!(out);
    }

    // openFile + multiSelections, filtered by the source extensions (no leading dot).
    let exts_no_dot: Vec<String> = extensions
        .iter()
        .map(|e| e.trim_start_matches('.').to_string())
        .collect();
    let exts_ref: Vec<&str> = exts_no_dot.iter().map(|s| s.as_str()).collect();
    let picked = app
        .dialog()
        .file()
        .set_title(format!("Select {} files", name))
        .add_filter(name, &exts_ref)
        .blocking_pick_files();
    let paths: Vec<String> = match picked {
        Some(list) => list
            .into_iter()
            .filter_map(|fp| fp.into_path().ok())
            .map(|pb| pb.to_string_lossy().to_string())
            .collect(),
        None => return json!([]), // canceled
    };
    json!(paths)
}

// import:preview (source, filePaths[]) -> ImportPreview
fn preview(args: &Value) -> Value {
    let source = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let file_paths: Vec<String> = args
        .get(1)
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let mut items: Vec<Value> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    for file_path in &file_paths {
        let filename = file_basename(file_path);
        let content = match std::fs::read(PathBuf::from(file_path)) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(err) => {
                warnings.push(format!("Failed to parse {}: {}", filename, err));
                continue;
            }
        };

        match source.as_str() {
            "apple_notes" => items.push(parse_apple_notes(&content, &filename)),
            "obsidian" => items.push(parse_obsidian(&content, &filename)),
            "notion" => {
                if filename.to_lowercase().ends_with(".csv") {
                    warnings.push(format!(
                        "Skipped CSV file: {} (only markdown files are imported from Notion exports)",
                        filename
                    ));
                } else {
                    items.push(parse_notion(&content, &filename));
                }
            }
            "todoist" => items.extend(parse_todoist(&content)),
            "markdown" => items.push(parse_markdown(&content, &filename)),
            "plain_text" => items.push(parse_plain_text(&content, &filename)),
            _ => {}
        }
    }

    let total = items.len();
    json!({
        "source": source,
        "items": items,
        "totalCount": total,
        "warnings": warnings
    })
}

// import:execute (items[]) -> ImportResult
// Emits `import:note-created` / `import:task-created` per selected item — the
// Tauri analog of `mainWindow.webContents.send` — and tallies the result.
fn execute_import(app: &tauri::AppHandle, args: &Value) -> Value {
    let items: Vec<Value> = args
        .get(0)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut imported_notes = 0i64;
    let mut imported_tasks = 0i64;
    let mut skipped = 0i64;
    let errors: Vec<String> = Vec::new();

    let selected: Vec<&Value> = items
        .iter()
        .filter(|item| item.get("selected").and_then(|v| v.as_bool()).unwrap_or(false))
        .collect();

    for item in &selected {
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let metadata = item.get("metadata").cloned().unwrap_or(Value::Null);
        let source = metadata.get("source").cloned().unwrap_or(Value::Null);

        match item_type {
            "note" => {
                let note_data = json!({
                    "id": item.get("id").cloned().unwrap_or(Value::Null),
                    "title": item.get("title").cloned().unwrap_or(Value::Null),
                    "content": item.get("content").cloned().unwrap_or(Value::Null),
                    "tags": item.get("tags").cloned().unwrap_or(json!([])),
                    "created_at": item.get("created_at").cloned().unwrap_or(Value::Null),
                    "updated_at": item.get("updated_at").cloned().unwrap_or(Value::Null),
                    "source": source
                });
                crate::native_ops::emit_event(app, "import:note-created", &note_data);
                imported_notes += 1;
            }
            "task" => {
                let due = metadata.get("dueDate").cloned().filter(|v| !v.is_null());
                let priority = metadata
                    .get("priority")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .unwrap_or_else(|| "medium".to_string());
                let task_data = json!({
                    "id": item.get("id").cloned().unwrap_or(Value::Null),
                    "title": item.get("title").cloned().unwrap_or(Value::Null),
                    "description": item.get("content").cloned().unwrap_or(Value::Null),
                    "tags": item.get("tags").cloned().unwrap_or(json!([])),
                    "dueDate": due.unwrap_or(Value::Null),
                    "priority": priority,
                    "source": source
                });
                crate::native_ops::emit_event(app, "import:task-created", &task_data);
                imported_tasks += 1;
            }
            _ => {
                skipped += 1;
            }
        }
    }

    // totalSkipped = items.length - selectedItems.length + skipped
    let total_skipped = items.len() as i64 - selected.len() as i64 + skipped;

    json!({
        "importedNotes": imported_notes,
        "importedTasks": imported_tasks,
        "skipped": total_skipped,
        "errors": errors
    })
}

/// Route an `import:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). All four real channels are produced natively:
///   import:get-sources  -> ImportSourceInfo[]
///   import:select-files -> string[]    (native file/folder dialog)
///   import:preview      -> ImportPreview (fs read + parse)
///   import:execute      -> ImportResult  (emits import:note-created / :task-created)
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "import:get-sources" => get_sources(),
        "import:select-files" => select_files(app, args),
        "import:preview" => preview(args),
        "import:execute" => execute_import(app, args),
        _ => Value::Null,
    }
}
