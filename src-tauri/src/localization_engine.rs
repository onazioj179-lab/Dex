// =============================================================================
// DEX 6.0 — Localization Engine (Tauri port of src/main/core/LocalizationEngine.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed UI string localization (localization:* channels). This is the
//! second, DISTINCT localization subsystem from LocalizationManager (the i18n:*
//! module in localization.rs): LocalizationEngine ships English only, stores its
//! active language under the shared key/value `settings` table (key 'language',
//! defaulting to 'en') instead of a dedicated table, and exposes the renderer
//! surface `t`, `setLanguage`, `getLanguage`, `getAvailable`, `getAllStrings`.
//!
//! Because dispatch() is a pure stateless function, the active language is read
//! from / written to that `settings` row on every call, yielding results
//! identical to the Electron engine. The ENGLISH_STRINGS catalog is a bundled
//! constant embedded verbatim from the TS, so every handler is a faithful native
//! port — there is no disk/bundle file loading and no Intl/ICU formatting to
//! degrade. The `localization:changed` webContents.send in setLanguage is an
//! Electron window-broadcast side effect, not an IPC handler, so it has no port.

use rusqlite::{params, Connection};
use serde_json::{json, Map, Value};

// -----------------------------------------------------------------------------
// Bundled string catalog — embedded verbatim from LocalizationEngine.ts.
// Only English ships; ALL_LANGUAGES = { en }. 65 entries, declaration order.
// -----------------------------------------------------------------------------

const ENGLISH_STRINGS: &[(&str, &str)] = &[
    // Global
    ("app.name", "DEX"),
    ("app.tagline", "Desktop environment"),
    ("common.save", "Save"),
    ("common.cancel", "Cancel"),
    ("common.delete", "Delete"),
    ("common.confirm", "Confirm"),
    ("common.close", "Close"),
    ("common.open", "Open"),
    ("common.edit", "Edit"),
    ("common.create", "Create"),
    ("common.search", "Search"),
    ("common.filter", "Filter"),
    ("common.sort", "Sort"),
    ("common.name", "Name"),
    ("common.date", "Date"),
    ("common.size", "Size"),
    ("common.type", "Type"),
    ("common.status", "Status"),
    ("common.actions", "Actions"),
    ("common.settings", "Settings"),
    ("common.help", "Help"),
    ("common.back", "Back"),
    ("common.next", "Next"),
    ("common.done", "Done"),
    ("common.loading", "Loading..."),
    ("common.error", "Error"),
    ("common.success", "Success"),
    ("common.warning", "Warning"),
    ("common.info", "Info"),
    ("common.yes", "Yes"),
    ("common.no", "No"),
    ("common.ok", "OK"),
    ("common.retry", "Retry"),
    ("common.undo", "Undo"),
    ("common.redo", "Redo"),
    ("common.selectAll", "Select All"),
    ("common.deselectAll", "Deselect All"),
    ("common.noResults", "No results found"),
    ("common.showMore", "Show more"),
    ("common.showLess", "Show less"),
    ("common.clear", "Clear"),
    ("common.clearAll", "Clear All"),
    ("common.restore", "Restore"),
    ("common.remove", "Remove"),
    ("common.export", "Export"),
    ("common.import", "Import"),
    ("common.copy", "Copy"),
    ("common.paste", "Paste"),
    ("common.cut", "Cut"),
    // Header
    ("header.notifications", "Notifications"),
    ("header.markAllRead", "Mark all read"),
    ("header.clearAllNotifications", "Clear all"),
    ("header.noNotifications", "No notifications"),
    ("header.layouts", "Layouts"),
    ("header.detach", "Open in new window"),
    // Notification Center
    ("notifications.title", "Notification Center"),
    ("notifications.unread", "unread"),
    ("notifications.markRead", "Mark as read"),
    ("notifications.confirmClear", "Are you sure you want to clear all notifications?"),
    ("notifications.dndActive", "Do Not Disturb is active"),
    ("notifications.dndSummary", "{count} notifications arrived while Do Not Disturb was active."),
    ("notifications.preferences", "Notification Preferences"),
    ("notifications.enabled", "Notifications enabled"),
    ("notifications.delivery.all", "Desktop popup and bell"),
    ("notifications.delivery.bell", "Bell only"),
    ("notifications.delivery.silent", "Silent (store only)"),
    // Global Search
    ("search.global", "Search everything in DEX"),
    ("search.placeholder", "Type to search across all apps..."),
    ("search.noResults", "No results found for your search"),
    ("search.showMore", "Show more results"),
    // Media Library
    ("mediaLibrary.title", "Media Library"),
    ("mediaLibrary.all", "All"),
    ("mediaLibrary.video", "Video"),
    ("mediaLibrary.audio", "Audio"),
    ("mediaLibrary.image", "Images"),
    ("mediaLibrary.document", "Documents"),
    ("mediaLibrary.sortByName", "Sort by name"),
    ("mediaLibrary.sortByDate", "Sort by date imported"),
    ("mediaLibrary.sortByLastUsed", "Sort by last used"),
    ("mediaLibrary.sortByMostUsed", "Sort by most used"),
    ("mediaLibrary.removeFromLibrary", "Remove from library"),
    ("mediaLibrary.empty", "No media files in library"),
    ("mediaLibrary.usedBy", "Used by: {apps}"),
    // Version History
    ("versionHistory.title", "Version History"),
    ("versionHistory.autoSave", "Auto-saved"),
    ("versionHistory.manualSave", "Manual save"),
    ("versionHistory.restore", "Restore this version"),
    ("versionHistory.confirmRestore", "Restore to this version? Your current state will be saved as a backup first."),
    ("versionHistory.empty", "No version history for this project"),
    // Task Queue
    ("taskQueue.title", "Background Tasks"),
    ("taskQueue.cancel", "Cancel"),
    ("taskQueue.retry", "Retry"),
    ("taskQueue.failed", "Failed"),
    ("taskQueue.completed", "Completed"),
    ("taskQueue.running", "Running"),
    ("taskQueue.queued", "Queued"),
    // Recycle Bin
    ("recycleBin.title", "Recycle Bin"),
    ("recycleBin.empty", "Recycle bin is empty"),
    ("recycleBin.restore", "Restore"),
    ("recycleBin.deletePermanently", "Delete permanently"),
    ("recycleBin.emptyBin", "Empty recycle bin"),
    ("recycleBin.confirmEmpty", "Permanently delete all items? This cannot be undone."),
    ("recycleBin.confirmEmptyStep2", "Are you absolutely sure? All items will be permanently deleted."),
    ("recycleBin.expiresIn", "Expires in {days} days"),
    // Workspace Layouts
    ("layouts.title", "Workspace Layouts"),
    ("layouts.save", "Save current layout"),
    ("layouts.apply", "Apply layout"),
    ("layouts.delete", "Delete layout"),
    ("layouts.builtIn", "Built-in"),
    ("layouts.custom", "Custom"),
    ("layouts.enterName", "Enter layout name"),
    ("layouts.focus", "Focus"),
    ("layouts.split", "Split"),
    ("layouts.default", "Default"),
    // Deep Links
    ("deeplink.notFound", "The linked item was not found. It may have been deleted or moved."),
    ("deeplink.invalidLink", "This link is not valid."),
    // Scratchpad
    ("scratchpad.title", "Quick Scratchpad"),
    ("scratchpad.placeholder", "Type quick notes here..."),
    ("scratchpad.sendToNotes", "Send to Notes"),
    ("scratchpad.clear", "Clear"),
    ("scratchpad.confirmClear", "Clear scratchpad content?"),
    // Feedback
    ("feedback.title", "Send Feedback"),
    ("feedback.bugReport", "Bug Report"),
    ("feedback.featureRequest", "Feature Request"),
    ("feedback.generalFeedback", "General Feedback"),
    ("feedback.description", "Describe your issue or idea..."),
    ("feedback.includeSystemInfo", "Include system information with report"),
    ("feedback.showIncluded", "Show what is included"),
    ("feedback.submit", "Submit"),
    ("feedback.saved", "Report saved to: {path}"),
    ("feedback.sendInstructions", "You can send this file to the DEX support channel."),
    // Settings
    ("settings.general", "General"),
    ("settings.appearance", "Appearance"),
    ("settings.notifications", "Notifications"),
    ("settings.localization", "Localization"),
    ("settings.language", "Language"),
    ("settings.languageNote", "More languages coming in a future update."),
    ("settings.about", "About"),
    // Sidebar
    ("sidebar.home", "Home"),
    ("sidebar.files", "Files"),
    ("sidebar.browser", "Browser"),
    ("sidebar.settings", "Settings"),
    ("sidebar.mediaLibrary", "Media Library"),
    ("sidebar.recycleBin", "Recycle Bin"),
    ("sidebar.feedback", "Send Feedback"),
    ("sidebar.help", "Help"),
    // Batch Operations
    ("batch.selected", "{count} selected"),
    ("batch.deleteAll", "Delete all selected"),
    ("batch.exportAll", "Export all selected"),
    ("batch.moveAll", "Move all selected"),
    ("batch.confirmDelete", "Delete {count} selected items?"),
    ("batch.markComplete", "Mark all complete"),
    ("batch.changeDueDate", "Change due date"),
    ("batch.addToTimeline", "Add to timeline"),
    ("batch.removeFromProject", "Remove from project"),
    ("batch.exportClips", "Export clips individually"),
    // Multi Window
    ("multiWindow.detach", "Open in new window"),
    ("multiWindow.reattach", "Return to main window"),
    // Apps
    ("app.home", "Home"),
    ("app.files", "Files"),
    ("app.browser", "Browser"),
    ("app.settings", "Settings"),
    ("app.transfers", "Transfers"),
    ("app.dashboard", "Dashboard"),
    ("app.notes", "Notes"),
    ("app.tasks", "Tasks"),
    ("app.power", "Power"),
    ("app.workflows", "Workflows"),
    ("app.gallery", "Gallery"),
    ("app.audio", "Audio"),
    ("app.video", "Video"),
    ("app.videoeditor", "Vinx"),
    ("app.imosion", "Imosion"),
    ("app.prism", "Prism"),
    ("app.flux", "Flux"),
    ("app.forge", "Forge"),
    ("app.calculator", "Calculator"),
    ("app.calendar", "Calendar"),
    ("app.passwordgenerator", "Password Generator"),
    ("app.rewind", "Rewind"),
    ("app.kanban", "Kanban"),
    ("app.achievements", "Achievements"),
    // Errors
    ("error.generic", "Something went wrong. Please try again."),
    ("error.network", "Network error. Check your connection."),
    ("error.notFound", "The requested item was not found."),
    ("error.permission", "You do not have permission to perform this action."),
    ("error.fileNotFound", "File not found."),
    ("error.saveFailed", "Failed to save. Please try again."),
    ("error.loadFailed", "Failed to load data."),
    // Empty States
    ("empty.notes", "No notes yet. Create your first note."),
    ("empty.tasks", "No tasks yet. Add your first task."),
    ("empty.files", "No files in this directory."),
    ("empty.gallery", "No images in gallery."),
    ("empty.workflows", "No workflows created yet."),
];

/// getAvailableLanguages(): the static [{ code, name }] list (English only).
const AVAILABLE_LANGUAGES: &[(&str, &str)] = &[("en", "English")];

/// ALL_LANGUAGES membership: only 'en' is a supported language.
fn is_supported(lang: &str) -> bool {
    lang == "en"
}

// -----------------------------------------------------------------------------
// Schema — the shared key/value `settings` table (DatabaseManager-owned).
// -----------------------------------------------------------------------------

/// The engine has no table of its own: it persists the active language under the
/// shared `settings` table via getSetting/setSetting('language'). That table is
/// owned + created by DatabaseManager; the TS getSetting/setSetting wrap missing
/// rows/DB gracefully, so we ensure the same key/value table here (idempotent,
/// matching DatabaseManager's CREATE TABLE IF NOT EXISTS verbatim) without
/// seeding — the engine defaults the language to 'en' in code, not via a row.
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );",
    );
}

// -----------------------------------------------------------------------------
// Language state, read from / written to the `settings` row on each call.
// -----------------------------------------------------------------------------

/// Current language = settings['language'] coerced to a supported code, else
/// 'en' (matches loadLanguagePreference: `saved in ALL_LANGUAGES ? saved : en`).
fn get_current_language(conn: &Connection) -> String {
    let saved: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'language'",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "en".to_string());
    if is_supported(&saved) {
        saved
    } else {
        "en".to_string()
    }
}

/// setLanguage(lang): unsupported codes are a no-op (TS `if (!(lang in ALL))
/// return;`); supported codes are persisted to settings['language'] via the
/// getSetting/setSetting upsert. The webContents 'localization:changed' send is
/// an Electron-only side effect with no DB equivalent.
fn set_language(conn: &Connection, lang: &str) {
    if !is_supported(lang) {
        return;
    }
    let _ = conn.execute(
        "INSERT INTO settings (key, value) VALUES ('language', ?) \
         ON CONFLICT(key) DO UPDATE SET value = ?",
        params![lang, lang],
    );
}

/// t(key, params?): look up key in the active language's table, fall back to
/// ENGLISH_STRINGS, then to the raw key; finally substitute the first {k}
/// occurrence of each param with String(v). Mirrors LocalizationEngine.t.
/// (Only 'en' ships, so the active table is always ENGLISH_STRINGS; the EN
/// fallback is reproduced regardless for fidelity.)
fn translate(key: &str, params_val: Option<&Value>) -> String {
    let lookup = |table: &[(&str, &str)]| -> Option<String> {
        table
            .iter()
            .find(|(k, _)| *k == key)
            .map(|(_, v)| (*v).to_string())
    };

    // strings[key] || ENGLISH_STRINGS[key]. Only 'en' ships, so the active table
    // (this.strings) is ENGLISH_STRINGS and both sides of the TS `||` resolve to
    // the same table — a single lookup is exactly equivalent.
    let value = lookup(ENGLISH_STRINGS);
    // value === undefined -> return key.
    let mut value = match value {
        Some(v) => v,
        None => return key.to_string(),
    };

    // params: value.replace(`{k}`, String(v)) — String.replace swaps only the
    // first match, so use a single replacement per key (matches the TS).
    if let Some(Value::Object(map)) = params_val {
        for (k, v) in map {
            let replacement = json_scalar_to_string(v);
            value = value.replacen(&format!("{{{}}}", k), &replacement, 1);
        }
    }
    value
}

/// String(v) for a param value (number, string, bool, null), matching JS
/// String() coercion for the scalar values this surface receives.
fn json_scalar_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

/// getAllStrings(): the active language's table as a { key: value } object,
/// preserving declaration order (matches { ...this.strings }).
fn get_all_strings() -> Value {
    let mut map = Map::new();
    for (k, v) in ENGLISH_STRINGS {
        map.insert((*k).to_string(), Value::String((*v).to_string()));
    }
    Value::Object(map)
}

/// getAvailableLanguages(): the static [{ code, name }] list.
fn get_available_languages() -> Value {
    let out: Vec<Value> = AVAILABLE_LANGUAGES
        .iter()
        .map(|(code, name)| json!({ "code": code, "name": name }))
        .collect();
    json!(out)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // t(key, params?) -> the resolved/substituted string.
        "localization:t" => {
            let key = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let params = args.get(1).filter(|v| v.is_object());
            json!(translate(key, params))
        }

        // setLanguage(lang) -> the handler always returns true in Electron; the
        // validated language is persisted as a side effect (unsupported = no-op).
        "localization:setLanguage" => {
            let lang = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            set_language(conn, lang);
            json!(true)
        }

        // getLanguage -> the current language code string.
        "localization:getLanguage" => json!(get_current_language(conn)),

        // getAvailable -> [{ code, name }].
        "localization:getAvailable" => get_available_languages(),

        // getAllStrings -> { key: value } for the active language.
        "localization:getAllStrings" => get_all_strings(),

        _ => Value::Null,
    }
}
