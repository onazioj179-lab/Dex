// =============================================================================
// DEX Tauri — Import subsystem (port of the `import:*` IPC handlers in
// core/DataImportManager.ts).
//
// Pure-data tier. The ONLY channel in this namespace that returns data without a
// native runtime side-effect is `import:get-sources` (a static catalogue of the
// supported import sources). It needs no storage and no app state, so it is
// reproduced here at the EXACT Electron shape (ImportSourceInfo[]). The renderer
// is unchanged.
//
// PROMPT-vs-SOURCE DIVERGENCE (documented):
//   - The porting brief named a `getStatus` data channel, an `import-state.json`
//     fs-json store, and `import` / `validate` / `preview` heavy channels. None
//     of those exist in DataImportManager.ts — there is NO status channel, NO
//     import-state.json, and NO persisted state of any kind. The real namespace
//     surface (from setupIPC) is:
//         import:get-sources  -> ImportSourceInfo[]   (DATA — ported)
//         import:select-files -> string[]             (HEAVY — native file dialog)
//         import:preview      -> ImportPreview        (HEAVY — reads files off disk)
//         import:execute      -> ImportResult         (HEAVY — emits IPC events to
//                                                       create notes/tasks)
//     This module therefore ports `import:get-sources` (the closest real DATA
//     channel) and SKIPS select-files / preview / execute. No storage file is
//     created because the Electron subsystem persists nothing.
//
// HEAVY-channel policy: select-files needs Electron's native `dialog` (no Tauri
// equivalent wired here), and preview/execute need filesystem reads plus
// `webContents.send` IPC events into the renderer. None are faked. They are
// omitted from the match; the prefix route returns Value::Null for them, which
// is the honest degrade for a channel whose data cannot be produced without the
// native runtime.
// =============================================================================

use serde_json::{json, Value};

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

/// Route an `import:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the pure-data `import:get-sources` channel is
/// produced; the heavy channels (select-files / preview / execute) return
/// Value::Null because they require the native runtime (file dialog, fs reads,
/// renderer IPC events) and are intentionally not faked.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "import:get-sources" => get_sources(),
        _ => Value::Null,
    }
}
