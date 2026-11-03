// =============================================================================
// DEX Tauri — Code subsystem (port of the DATA surface of CodeController.ts,
// the Universal Code Editor's IPC handlers).
//
// Pure-data, real-filesystem tier. The Electron controller persisted editor
// state (recent files + tracked folders) in an `electron-store`-style plain
// JSON file `code-editor-state.json` under userData; this mirrors that file
// 1:1 under <appData> with the SAME name and SAME top-level keys:
//   - code-editor-state.json : { recentFiles: string[], folders: CodeFolder[] }
// (The migration brief referenced `code-files.json` as the storage hint, but
// the authoritative Electron source uses `code-editor-state.json` — that is the
// file the renderer's state was written to, so we mirror the real name.)
//
// Channels ported (DATA / read-only filesystem walk):
//   - code:getFiles(folderPath?) -> CodeFile[]   (recursive scan, no content)
//   - code:readFile(fileId)      -> CodeFile|null (info + utf-8 content)
//
// A CodeFile is exactly:
//   { id, name, path, language, size, modified, created, content? }
//   - id       : base64(absolute path)         (Buffer.from(path).toString('base64'))
//   - name     : final path component
//   - language : detectLanguage(path) (extension map; 'dockerfile' special-case;
//                else 'plaintext')
//   - size     : stat.size (bytes)
//   - modified : stat.mtimeMs (float epoch ms)
//   - created  : stat.birthtimeMs (float epoch ms)
//   - content  : present only on readFile (utf-8 file body)
//
// HEAVY channels NOW ported (real filesystem mutation + recent-list state):
//   - code:saveFile(file)   -> bool  (writes utf-8 bytes to disk, updates recent)
//   - code:deleteFile(id)   -> bool  (unlinks the file, drops it from recent)
// Both persist the recentFiles change back into code-editor-state.json with the
// SAME shape/keys (recentFiles capped at maxRecent=20, dedup-then-unshift), so
// they round-trip identically with the Electron controller.
//
// Channels still NOT ported (need a focused window + native OS dialog, which is
// out of this data-tier's reach — saveDialog/openDialog):
//   - code:createFile (showSaveDialog), code:createFolder (showOpenDialog)
// They keep falling through to Value::Null (honest degrade).
//
// DIVERGENCES (documented):
//   - id base64: Node's Buffer.from(path,'utf8').toString('base64') is standard
//     base64 (with '+' '/' and '=' padding). We hand-roll the same alphabet/
//     padding here (matching the autofill_ctl b64 precedent) so the ids round-
//     trip identically and no dependency is added.
//   - birthtimeMs: on platforms/filesystems without a real creation time, Node
//     falls back to 0 (or mtime). We use std::fs::Metadata::created(); when the
//     platform cannot supply it we fall back to the modified time, which is the
//     same practical behavior Node exhibits on those filesystems.
//   - mtimeMs/birthtimeMs are f64 epoch millis (sub-ms precision preserved as in
//     Node), not integers, to match the renderer's number type exactly.
//   - getFiles with no folderPath aggregates across every tracked folder in
//     code-editor-state.json (identical to Electron). With a folderPath it scans
//     only that path. Recursion depth, hidden/skip-dir rules, and the code-file
//     extension set all match the Electron source exactly.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const STATE_FILE: &str = "code-editor-state.json";
const MAX_DEPTH: u32 = 5;
// CodeControllerClass.maxRecent — the recentFiles list is capped at this length.
const MAX_RECENT: usize = 20;

// --- state file IO ----------------------------------------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_state(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app, STATE_FILE)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// Tracked folders (folders[].path); empty when state is absent — mirrors
// `this.folders` defaulting to [].
fn tracked_folder_paths(app: &tauri::AppHandle) -> Vec<String> {
    read_state(app)
        .get("folders")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|f| f.get("path").and_then(|p| p.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

// recentFiles as a Vec<String>; absent/non-array -> [] (mirrors `data.recentFiles || []`).
fn recent_files(app: &tauri::AppHandle) -> Vec<String> {
    read_state(app)
        .get("recentFiles")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|f| f.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

// saveState(): rewrite code-editor-state.json as { recentFiles, folders } with
// 2-space indentation (parity with JSON.stringify(obj, null, 2)). The `folders`
// array is preserved verbatim from the current on-disk state so we never clobber
// folder tracking when only the recent list changed. Best-effort, like Electron's
// try/catch around writeFileSync (a write failure is swallowed, not fatal).
fn write_state(app: &tauri::AppHandle, recent: &[String]) {
    let folders = read_state(app)
        .get("folders")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let state = json!({
        "recentFiles": recent,
        "folders": folders,
    });
    if let Ok(pretty) = serde_json::to_string_pretty(&state) {
        let _ = std::fs::write(store_path(app, STATE_FILE), pretty);
    }
}

// addToRecentInternal(filePath): dedup, unshift to front, trim to MAX_RECENT,
// then persist. Matches the Electron list semantics exactly.
fn add_to_recent(app: &tauri::AppHandle, file_path: &str) {
    let mut recent = recent_files(app);
    recent.retain(|f| f != file_path);
    recent.insert(0, file_path.to_string());
    if recent.len() > MAX_RECENT {
        recent.truncate(MAX_RECENT);
    }
    write_state(app, &recent);
}

// deleteFile's recent cleanup: `recentFiles = recentFiles.filter(f => f !== path)`
// then saveState().
fn remove_from_recent(app: &tauri::AppHandle, file_path: &str) {
    let mut recent = recent_files(app);
    recent.retain(|f| f != file_path);
    write_state(app, &recent);
}

// --- base64 (Buffer.from(x).toString('base64') / Buffer.from(x,'base64')) ----

fn b64_encode(input: &[u8]) -> String {
    const TBL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TBL[((n >> 18) & 0x3F) as usize] as char);
        out.push(TBL[((n >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TBL[((n >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TBL[(n & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

// Buffer.from(b64, 'base64').toString('utf-8') — lossy on non-utf8 like JS.
fn b64_decode_to_utf8(s: &str) -> String {
    const TBL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lut = [255u8; 256];
    for (i, c) in TBL.iter().enumerate() {
        lut[*c as usize] = i as u8;
    }
    let mut bytes: Vec<u8> = Vec::new();
    let mut acc: u32 = 0;
    let mut nbits: u32 = 0;
    for ch in s.bytes() {
        if ch == b'=' {
            break;
        }
        let v = lut[ch as usize];
        if v == 255 {
            continue; // skip whitespace/newlines, atob-tolerant
        }
        acc = (acc << 6) | v as u32;
        nbits += 6;
        if nbits >= 8 {
            nbits -= 8;
            bytes.push((acc >> nbits) as u8);
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

// --- path helpers (path.basename / path.extname parity) ---------------------

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

// path.extname(p).toLowerCase(): the final ".ext" including the dot, or "".
fn ext_lower(path: &str) -> String {
    let base = basename(path);
    // path.extname returns '' for dotfiles like '.env' (no name before the dot)
    // and for names with no dot. Find the LAST dot that is not the first char.
    match base.rfind('.') {
        Some(0) | None => String::new(),
        Some(idx) => base[idx..].to_lowercase(),
    }
}

// LANGUAGE_MAP from the Electron source (keys are lowercase extensions incl. dot).
fn language_for_ext(ext: &str) -> Option<&'static str> {
    Some(match ext {
        ".js" => "javascript",
        ".jsx" => "javascript",
        ".ts" => "typescript",
        ".tsx" => "typescript",
        ".py" => "python",
        ".rb" => "ruby",
        ".rs" => "rust",
        ".go" => "go",
        ".java" => "java",
        ".c" => "c",
        ".cpp" => "cpp",
        ".h" => "c",
        ".hpp" => "cpp",
        ".cs" => "csharp",
        ".php" => "php",
        ".swift" => "swift",
        ".kt" => "kotlin",
        ".scala" => "scala",
        ".r" => "r",
        // NOTE: the Electron map also has '.R' -> 'r', but detectLanguage()
        // lowercases the extension first, so '.R' resolves via '.r' anyway.
        ".sql" => "sql",
        ".html" => "html",
        ".htm" => "html",
        ".css" => "css",
        ".scss" => "scss",
        ".sass" => "sass",
        ".less" => "less",
        ".json" => "json",
        ".xml" => "xml",
        ".yaml" => "yaml",
        ".yml" => "yaml",
        ".md" => "markdown",
        ".sh" => "bash",
        ".bash" => "bash",
        ".zsh" => "bash",
        ".ps1" => "powershell",
        ".lua" => "lua",
        ".vim" => "vim",
        ".dockerfile" => "dockerfile",
        ".toml" => "toml",
        ".ini" => "ini",
        ".cfg" => "ini",
        ".conf" => "ini",
        _ => return None,
    })
}

// detectLanguage(filePath): Dockerfile (any case, no ext) special-case, else map,
// else 'plaintext'.
fn detect_language(path: &str) -> String {
    if basename(path).to_lowercase() == "dockerfile" {
        return "dockerfile".to_string();
    }
    language_for_ext(&ext_lower(path))
        .unwrap_or("plaintext")
        .to_string()
}

// isCodeFile(filePath): extension in LANGUAGE_MAP keys, or one of the bare names.
fn is_code_file(path: &str) -> bool {
    let base = basename(path).to_lowercase();
    if base == "dockerfile" || base == "makefile" || base == ".gitignore" || base == ".env" {
        return true;
    }
    language_for_ext(&ext_lower(path)).is_some()
}

// --- file info (getFileInfo parity) -----------------------------------------

fn ms(t: SystemTime) -> f64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

// Returns CodeFile (without `content`) for a regular file, or Null otherwise.
fn file_info(path: &str) -> Value {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return Value::Null,
    };
    if !meta.is_file() {
        return Value::Null;
    }
    let modified = meta.modified().map(ms).unwrap_or(0.0);
    // birthtimeMs: use real creation time when the platform supplies it; else
    // fall back to mtime (Node's effective behavior on filesystems w/o btime).
    let created = meta.created().map(ms).unwrap_or(modified);

    json!({
        "id": b64_encode(path.as_bytes()),
        "name": basename(path),
        "path": path,
        "language": detect_language(path),
        "size": meta.len(),
        "modified": modified,
        "created": created,
    })
}

// --- recursive folder scan (getFilesInFolder parity) ------------------------

fn scan_dir(dir: &Path, depth: u32, out: &mut Vec<Value>) {
    if depth > MAX_DEPTH {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return, // skip unreadable dirs
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        // Skip hidden + common non-code directories (matches Electron set).
        if name.starts_with('.')
            || name == "node_modules"
            || name == "__pycache__"
            || name == "dist"
            || name == "build"
            || name == ".git"
        {
            continue;
        }
        let full = entry.path();
        let ftype = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ftype.is_dir() {
            scan_dir(&full, depth + 1, out);
        } else if ftype.is_file() {
            let full_str = full.to_string_lossy().into_owned();
            if is_code_file(&full_str) {
                let info = file_info(&full_str);
                if !info.is_null() {
                    out.push(info);
                }
            }
        }
    }
}

fn files_in_folder(folder: &str) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    scan_dir(Path::new(folder), 0, &mut out);
    out
}

// code:getFiles(folderPath?) -> CodeFile[]
fn get_files(app: &tauri::AppHandle, folder_path: Option<&str>) -> Value {
    match folder_path {
        Some(p) if !p.is_empty() => json!(files_in_folder(p)),
        _ => {
            let mut all: Vec<Value> = Vec::new();
            for folder in tracked_folder_paths(app) {
                all.extend(files_in_folder(&folder));
            }
            json!(all)
        }
    }
}

// code:readFile(fileId) -> CodeFile | null
fn read_file(file_id: &str) -> Value {
    let path = b64_decode_to_utf8(file_id);
    if !Path::new(&path).exists() {
        return Value::Null;
    }
    let mut info = file_info(&path);
    let obj = match info.as_object_mut() {
        Some(o) => o,
        None => return Value::Null,
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Value::Null, // readFileSync throw -> caught -> null
    };
    obj.insert("content".into(), json!(content));
    info
}

// code:saveFile({ id, content, path? }) -> bool
// Resolve target path: prefer file.path, else decode file.id (base64 -> utf-8),
// else fail. Write content as utf-8, push onto the recent list. Any IO error ->
// false (parity with the try/catch returning false).
fn save_file(app: &tauri::AppHandle, file: &Value) -> Value {
    let explicit_path = file
        .get("path")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());
    let id = file.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty());

    let file_path: String = if let Some(p) = explicit_path {
        p.to_string()
    } else if let Some(idv) = id {
        b64_decode_to_utf8(idv)
    } else {
        // "no path or id provided" -> false
        return json!(false);
    };

    // file.content; treat a missing/non-string content as "" (writeFileSync of
    // undefined would throw in Node, but the renderer always sends a string).
    let content = file.get("content").and_then(|v| v.as_str()).unwrap_or("");

    match std::fs::write(&file_path, content.as_bytes()) {
        Ok(()) => {
            add_to_recent(app, &file_path);
            json!(true)
        }
        Err(_) => json!(false),
    }
}

// code:deleteFile(fileId) -> bool
// Decode id, bail false if the file is gone, else move it to the recycle bin
// (recoverable, like files:trash) and drop it from recent.
fn delete_file(app: &tauri::AppHandle, file_id: &str) -> Value {
    let file_path = b64_decode_to_utf8(file_id);
    if !Path::new(&file_path).exists() {
        return json!(false);
    }
    match trash::delete(&file_path) {
        Ok(()) => {
            remove_from_recent(app, &file_path);
            json!(true)
        }
        Err(_) => json!(false),
    }
}

/// Route a `code:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The two DATA channels are handled; the heavy
/// mutating channels (saveFile/deleteFile) and any unknown channel return
/// Value::Null (honest degrade — they are not ported).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "code:getFiles" => {
            let folder = args.get(0).and_then(|v| v.as_str());
            get_files(app, folder)
        }
        "code:readFile" => {
            let file_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            read_file(file_id)
        }
        "code:saveFile" => {
            let file = args.get(0).cloned().unwrap_or(Value::Null);
            save_file(app, &file)
        }
        "code:deleteFile" => {
            let file_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_file(app, file_id)
        }
        _ => Value::Null,
    }
}
