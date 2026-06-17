// =============================================================================
// DEX 6.0 — Help System (Tauri port of src/main/core/HelpSystemManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed help system (help:* channels), reading/writing the shared
//! `dex.db` with the identical schema (help_articles + FTS5 mirror, keyboard
//! shortcuts, feature discovery, getting-started checklist, context mappings,
//! changelog, what's-new) and return shapes as the Electron manager. The bundled
//! seed content (articles, shortcuts, discovery tooltips, checklist, context
//! mappings) is reproduced verbatim so the renderer sees the same data. The
//! `initialize`/`destroy`/event-emitter lifecycle is an Electron concern; the
//! renderer-facing surface is the seventeen handlers below, ported faithfully.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

// -----------------------------------------------------------------------------
// Schema (matches HelpSystemManager.SCHEMA_SQL verbatim) + bundled seed data.
// -----------------------------------------------------------------------------

const SCHEMA_SQL: &str = "
CREATE TABLE IF NOT EXISTS help_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  parent_id TEXT,
  app_id TEXT,
  sort_order INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]'
);

CREATE VIRTUAL TABLE IF NOT EXISTS help_fts USING fts5(
  id, title, content, category,
  content=help_articles,
  content_rowid=rowid,
  tokenize='porter ascii'
);

CREATE TRIGGER IF NOT EXISTS help_ai AFTER INSERT ON help_articles BEGIN
  INSERT INTO help_fts(rowid, id, title, content, category)
  VALUES (new.rowid, new.id, new.title, new.content, new.category);
END;

CREATE TRIGGER IF NOT EXISTS help_ad AFTER DELETE ON help_articles BEGIN
  INSERT INTO help_fts(help_fts, rowid, id, title, content, category)
  VALUES ('delete', old.rowid, old.id, old.title, old.content, old.category);
END;

CREATE TRIGGER IF NOT EXISTS help_au AFTER UPDATE ON help_articles BEGIN
  INSERT INTO help_fts(help_fts, rowid, id, title, content, category)
  VALUES ('delete', old.rowid, old.id, old.title, old.content, old.category);
  INSERT INTO help_fts(rowid, id, title, content, category)
  VALUES (new.rowid, new.id, new.title, new.content, new.category);
END;

CREATE TABLE IF NOT EXISTS feature_discovery (
  id TEXT PRIMARY KEY,
  feature_name TEXT NOT NULL,
  description TEXT NOT NULL,
  help_article_id TEXT,
  target_selector TEXT DEFAULT '',
  shown_at INTEGER
);

CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  section TEXT DEFAULT 'general',
  action TEXT NOT NULL,
  default_keys TEXT NOT NULL,
  custom_keys TEXT
);

CREATE TABLE IF NOT EXISTS help_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  helpful INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS context_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  panel_id TEXT,
  article_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS getting_started_checklist (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  deep_link TEXT DEFAULT '',
  completed INTEGER DEFAULT 0,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS changelog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  release_date INTEGER NOT NULL,
  category TEXT DEFAULT 'improvement',
  description TEXT NOT NULL,
  help_article_id TEXT
);

CREATE TABLE IF NOT EXISTS whats_new_shown (
  version TEXT PRIMARY KEY,
  shown_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category);
CREATE INDEX IF NOT EXISTS idx_help_articles_app_id ON help_articles(app_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_app_id ON keyboard_shortcuts(app_id);
CREATE INDEX IF NOT EXISTS idx_context_mappings_app_id ON context_mappings(app_id);
CREATE INDEX IF NOT EXISTS idx_changelog_version ON changelog_entries(version);
";

/// Bundled help articles: (id, title, content, category, parent_id, app_id, sort_order, tags-json).
/// Matches BUNDLED_HELP_ARTICLES verbatim.
type HelpArticle = (&'static str, &'static str, &'static str, &'static str, Option<&'static str>, Option<&'static str>, i64, &'static str);
const BUNDLED_HELP_ARTICLES: &[HelpArticle] = &[
    ("getting-started", "Getting Started with DEX", "# Getting Started with DEX\n\nDEX is your complete desktop productivity environment. This guide will walk you through the key features and help you get the most out of DEX.\n\n## The DEX Workspace\n\nThe DEX workspace is organized around inner apps. Each inner app is a focused productivity tool that works independently and integrates with other apps through a shared data layer.\n\n## Navigation\n\n- Use the sidebar to switch between inner apps\n- Use Ctrl+K (Cmd+K on macOS) to open the command palette\n- Use Alt+Left and Alt+Right to navigate between recently used apps\n\n## Your First Steps\n\n1. Create your first note in DEX Notes\n2. Add tasks in the Tasks app\n3. Import files into the Media Library\n4. Explore the Command Palette\n5. Set up your first automation\n\n## Getting Help\n\nPress F1 at any time to open contextual help for the current view.", "general", None, None, 0, "[\"start\",\"intro\",\"navigation\"]"),
    ("notes-overview", "DEX Notes Overview", "# DEX Notes\n\nDEX Notes is a professional note-taking and document editing system.\n\n## Creating Notes\n\nClick the New Note button or press Ctrl+N to create a new note.\n\n## Formatting\n\nUse the formatting toolbar to apply bold, italic, underline, and other formatting. Keyboard shortcuts:\n- Ctrl+B: Bold\n- Ctrl+I: Italic\n- Ctrl+U: Underline\n\n## Folders\n\nOrganize notes into folders and subfolders. Drag notes between folders to reorganize.\n\n## Tags\n\nAdd tags to notes for cross-folder organization. Tags appear in the tag browser.\n\n## Search\n\nFull-text search finds content across all notes instantly.\n\n## Attachments\n\nAttach files to any note. Attachments are stored alongside your note data.\n\n## Templates\n\nSave and use templates to create notes with predefined structure and content.", "inner-apps", None, Some("notes"), 1, "[\"notes\",\"editor\",\"formatting\"]"),
    ("tasks-overview", "Tasks and Kanban", "# Tasks\n\nThe Tasks app helps you track and manage your work.\n\n## Creating Tasks\n\nCreate tasks with titles, descriptions, due dates, priorities, and tags.\n\n## Kanban View\n\nView your tasks on a Kanban board with customizable columns. Drag tasks between columns to update their status.\n\n## List View\n\nA traditional list view with sorting and filtering options.\n\n## Keyboard Shortcuts\n\n- Ctrl+Enter: Create new task\n- Ctrl+D: Set due date\n- Ctrl+P: Set priority", "inner-apps", None, Some("tasks"), 2, "[\"tasks\",\"kanban\",\"productivity\"]"),
    ("media-library", "Media Library", "# Media Library\n\nStore and organize all your media files in one place.\n\n## Importing\n\nDrag files into the media library or use the import button to add files.\n\n## Organization\n\nOrganize files with folders, tags, and custom metadata.\n\n## Preview\n\nPreview images, audio, and video directly in DEX.\n\n## Search\n\nSearch files by name, type, tags, or metadata.", "inner-apps", None, Some("media"), 3, "[\"media\",\"files\",\"library\"]"),
    ("vinx-overview", "Vinx Audio Editor", "# Vinx Audio Editor\n\nVinx is a multi-track audio editor integrated into DEX.\n\n## Timeline\n\nThe timeline shows all audio tracks. Use two-finger pinch to zoom in or out.\n\n## Recording\n\nRecord audio directly into a track using your microphone.\n\n## Editing\n\nCut, copy, paste, and trim audio clips with precision.\n\n## Effects\n\nApply effects to tracks including EQ, compression, reverb, and more.\n\n## Export\n\nExport your project in multiple audio formats.", "inner-apps", None, Some("vinx"), 4, "[\"audio\",\"vinx\",\"editing\"]"),
    ("automation-overview", "Automation Rules", "# Automation\n\nAutomate repetitive tasks with event-driven rules.\n\n## Creating Rules\n\nRules have three parts: a trigger event, optional conditions, and actions to perform.\n\n## Triggers\n\nTriggers include: time-based schedules, file changes, application events, and custom triggers.\n\n## Actions\n\nActions include: create notes, move files, send notifications, run scripts, and more.\n\n## Rule Management\n\nEnable, disable, or delete rules from the automation panel.", "inner-apps", None, Some("automation"), 6, "[\"automation\",\"rules\",\"triggers\"]"),
    ("settings-overview", "DEX Settings", "# DEX Settings\n\nConfigure every aspect of DEX from the settings panel.\n\n## General\n\nLanguage, theme, startup behavior, and default apps.\n\n## Privacy\n\nTelemetry, crash reporting, and data collection settings.\n\n## License\n\nActivate or manage your DEX license.\n\n## Backup and Restore\n\nConfigure automatic backups and restore from previous backups.\n\n## Accessibility\n\nKeyboard shortcuts, screen reader support, contrast settings, and motion preferences.\n\n## Advanced\n\nDeveloper mode, health check, and system diagnostics.", "settings", None, None, 7, "[\"settings\",\"configuration\",\"preferences\"]"),
    ("shortcuts-overview", "Keyboard Shortcuts", "# Keyboard Shortcuts\n\nDEX supports extensive keyboard shortcuts for every feature.\n\n## Global Shortcuts\n\n- Ctrl+K / Cmd+K: Command palette\n- Ctrl+N: New item in current app\n- Ctrl+S: Save\n- Ctrl+Z: Undo\n- Ctrl+Y: Redo\n- F1: Help\n- Ctrl+Shift+/: Shortcuts reference\n- Alt+Left: Previous app\n- Alt+Right: Next app\n\n## Customization\n\nCustomize any shortcut from Settings > Accessibility > Keyboard Shortcuts.", "general", None, None, 8, "[\"shortcuts\",\"keyboard\",\"hotkeys\"]"),
    ("backup-overview", "Backup and Restore", "# Backup and Restore\n\nDEX automatically backs up your data to protect against data loss.\n\n## Automatic Backups\n\nBy default, DEX creates a backup every day. Configure frequency in Settings > Backup.\n\n## Manual Backups\n\nCreate a backup at any time from Settings > Backup > Create Backup Now.\n\n## Restoring\n\nRestore from any backup. DEX creates a safety backup before each restore.\n\n## Selective Restore\n\nChoose which databases to restore: Notes, Tasks, Media Library, Settings, or all.", "settings", None, None, 9, "[\"backup\",\"restore\",\"data\"]"),
    ("security-overview", "Security and Privacy", "# Security and Privacy\n\nDEX takes your privacy seriously.\n\n## Encryption\n\nAll databases are encrypted using your master key stored in the OS keychain.\n\n## Vault\n\nStore sensitive notes and files in the encrypted vault.\n\n## Telemetry\n\nTelemetry is opt-in only. You control what data is shared.\n\n## Data Location\n\nAll your data is stored locally on your machine. DEX never uploads your content.", "settings", None, None, 10, "[\"security\",\"privacy\",\"encryption\"]"),
    ("accessibility-overview", "Accessibility Features", "# Accessibility\n\nDEX is built to be accessible to everyone.\n\n## Screen Readers\n\nFull screen reader support with ARIA labels throughout.\n\n## Keyboard Navigation\n\nEvery feature is accessible via keyboard.\n\n## High Contrast\n\nAll text meets WCAG 2.1 AA contrast requirements.\n\n## Reduced Motion\n\nRespects the OS reduce motion preference.\n\n## Touch and Stylus\n\nFull support for touch devices and stylus input with palm rejection.", "general", None, None, 11, "[\"accessibility\",\"a11y\",\"screen-reader\"]"),
    ("developer-overview", "Developer Platform", "# Developer Platform\n\nBuild extensions, plugins, themes, and full inner apps for DEX.\n\n## Getting Started\n\nInstall the DEX SDK from npm: npm install dex-sdk\n\n## Extensions\n\nExtensions can add full inner apps, plugins, or themes to DEX.\n\n## API\n\nThe DEX Public API gives extensions access to notes, tasks, media, events, and more.\n\n## Developer Console\n\nAccess the developer console from Settings > Advanced > Developer Mode.\n\n## Sandbox\n\nTest extensions in a sandbox environment that isolates them from your real data.", "developer", None, None, 12, "[\"developer\",\"extensions\",\"api\",\"sdk\"]"),
    ("import-overview", "Importing Data", "# Importing Data\n\nMigrate your data from other apps into DEX.\n\n## Supported Sources\n\n- Apple Notes (HTML or plain text export)\n- Obsidian (Markdown vault with wikilinks)\n- Notion (Markdown and CSV export)\n- Todoist (CSV export)\n- Any Markdown folder\n- Plain text folder\n\n## Import Process\n\n1. Select your source app\n2. Choose the exported file or folder\n3. Preview what will be imported\n4. Configure import options\n5. Run the import\n\nImported content goes into a dedicated import folder, never mixed with existing data.", "general", None, None, 13, "[\"import\",\"migration\",\"data\"]"),
];

/// Bundled shortcuts: (id, app_id, section, action, default_keys, custom_keys).
/// Matches BUNDLED_SHORTCUTS verbatim (custom_keys always null at seed time).
const BUNDLED_SHORTCUTS: &[(&str, &str, &str, &str, &str)] = &[
    ("global-command-palette", "global", "Navigation", "Open command palette", "Ctrl+K"),
    ("global-new-item", "global", "Navigation", "New item", "Ctrl+N"),
    ("global-save", "global", "Navigation", "Save", "Ctrl+S"),
    ("global-undo", "global", "Editing", "Undo", "Ctrl+Z"),
    ("global-redo", "global", "Editing", "Redo", "Ctrl+Y"),
    ("global-help", "global", "Navigation", "Help", "F1"),
    ("global-shortcuts", "global", "Navigation", "Shortcuts reference", "Ctrl+Shift+/"),
    ("global-prev-app", "global", "Navigation", "Previous app", "Alt+Left"),
    ("global-next-app", "global", "Navigation", "Next app", "Alt+Right"),
    ("global-search", "global", "Navigation", "Global search", "Ctrl+Shift+F"),
    ("global-close-panel", "global", "Navigation", "Close panel", "Escape"),
    ("notes-bold", "notes", "Formatting", "Bold", "Ctrl+B"),
    ("notes-italic", "notes", "Formatting", "Italic", "Ctrl+I"),
    ("notes-underline", "notes", "Formatting", "Underline", "Ctrl+U"),
    ("notes-strikethrough", "notes", "Formatting", "Strikethrough", "Ctrl+Shift+S"),
    ("notes-find", "notes", "Editing", "Find", "Ctrl+F"),
    ("notes-new-note", "notes", "Notes", "New note", "Ctrl+N"),
    ("notes-toggle-sidebar", "notes", "View", "Toggle sidebar", "Ctrl+\\"),
    ("notes-focus-mode", "notes", "View", "Focus mode", "Ctrl+Shift+F"),
    ("notes-daily-note", "notes", "Notes", "Daily note", "Ctrl+D"),
    ("tasks-new-task", "tasks", "Tasks", "New task", "Ctrl+Enter"),
    ("tasks-due-date", "tasks", "Tasks", "Set due date", "Ctrl+D"),
    ("tasks-priority", "tasks", "Tasks", "Set priority", "Ctrl+P"),
    ("vinx-play-pause", "vinx", "Playback", "Play/Pause", "Space"),
    ("vinx-zoom-in", "vinx", "View", "Zoom in", "Ctrl+="),
    ("vinx-zoom-out", "vinx", "View", "Zoom out", "Ctrl+-"),
];

/// Bundled feature-discovery tooltips: (id, feature_name, description, help_article_id, target_selector).
/// Matches BUNDLED_DISCOVERY verbatim (shown_at always null at seed time).
const BUNDLED_DISCOVERY: &[(&str, &str, &str, &str, &str)] = &[
    ("discovery-command-palette", "Command Palette", "Press Ctrl+K to quickly search and run any command.", "shortcuts-overview", "[data-feature=\"command-palette\"]"),
    ("discovery-sidebar", "App Sidebar", "Switch between inner apps from the sidebar.", "getting-started", ".dex-sidebar"),
    ("discovery-notes-folders", "Note Folders", "Organize your notes into folders and subfolders.", "notes-overview", "[data-feature=\"note-folders\"]"),
    ("discovery-kanban", "Kanban Board", "Drag tasks between columns to update their status.", "tasks-overview", "[data-feature=\"kanban\"]"),
    ("discovery-media-import", "Media Import", "Drag files here or click import to add media.", "media-library", "[data-feature=\"media-import\"]"),
    ("discovery-automation", "Automation Rules", "Create rules that automatically perform actions based on events.", "automation-overview", "[data-feature=\"automation\"]"),
    ("discovery-search", "Global Search", "Search across all your content from one place.", "getting-started", "[data-feature=\"global-search\"]"),
];

/// Bundled checklist items: (id, title, description, deep_link).
/// Matches BUNDLED_CHECKLIST verbatim (completed=0, completed_at=null at seed time).
const BUNDLED_CHECKLIST: &[(&str, &str, &str, &str)] = &[
    ("create-note", "Create your first note", "Open DEX Notes and create a note", "dex://notes/new"),
    ("create-task", "Create your first task", "Open Tasks and add your first task", "dex://tasks/new"),
    ("import-file", "Import a file into the media library", "Add a file to your media library", "dex://media/import"),
    ("command-palette", "Try the command palette with Ctrl+K", "Open the command palette and explore available commands", "dex://command-palette"),
    ("automation-rule", "Set up your first automation rule", "Create an automation that works for you", "dex://automation/new"),
    ("explore-app", "Explore an inner app you have not tried yet", "Open any app from the app wall you have not used", "dex://launchpad"),
];

/// Bundled context mappings: (app_id, panel_id, article_id).
/// Matches BUNDLED_CONTEXT_MAPPINGS verbatim.
const BUNDLED_CONTEXT_MAPPINGS: &[(&str, Option<&str>, &str)] = &[
    ("notes", None, "notes-overview"),
    ("notes", Some("editor"), "notes-overview"),
    ("tasks", None, "tasks-overview"),
    ("media", None, "media-library"),
    ("vinx", None, "vinx-overview"),
    ("automation", None, "automation-overview"),
    ("settings", None, "settings-overview"),
    ("settings", Some("backup"), "backup-overview"),
    ("settings", Some("security"), "security-overview"),
    ("settings", Some("accessibility"), "accessibility-overview"),
    ("developer", None, "developer-overview"),
];

/// Create every help table (+ FTS5 mirror, triggers, indexes) and seed the
/// bundled content (matches HelpSystemManager.SCHEMA_SQL + seedBundledContent).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(SCHEMA_SQL);
    seed_bundled_content(conn);
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0)
}

/// Seed bundled rows only when each table is empty (matches seedBundledContent).
fn seed_bundled_content(conn: &Connection) {
    if count(conn, "SELECT COUNT(*) FROM help_articles") == 0 {
        for a in BUNDLED_HELP_ARTICLES {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO help_articles (id, title, content, category, parent_id, app_id, sort_order, tags) VALUES (?,?,?,?,?,?,?,?)",
                params![a.0, a.1, a.2, a.3, a.4, a.5, a.6, a.7],
            );
        }
    }

    if count(conn, "SELECT COUNT(*) FROM keyboard_shortcuts") == 0 {
        for s in BUNDLED_SHORTCUTS {
            // custom_keys seeded as NULL (matches TS customKeys: null)
            let _ = conn.execute(
                "INSERT OR REPLACE INTO keyboard_shortcuts (id, app_id, section, action, default_keys, custom_keys) VALUES (?,?,?,?,?,?)",
                params![s.0, s.1, s.2, s.3, s.4, Option::<String>::None],
            );
        }
    }

    if count(conn, "SELECT COUNT(*) FROM feature_discovery") == 0 {
        for d in BUNDLED_DISCOVERY {
            // shown_at seeded as NULL (matches TS shown_at: null)
            let _ = conn.execute(
                "INSERT OR REPLACE INTO feature_discovery (id, feature_name, description, help_article_id, target_selector, shown_at) VALUES (?,?,?,?,?,?)",
                params![d.0, d.1, d.2, d.3, d.4, Option::<i64>::None],
            );
        }
    }

    if count(conn, "SELECT COUNT(*) FROM getting_started_checklist") == 0 {
        for c in BUNDLED_CHECKLIST {
            // completed=0, completed_at=NULL (matches TS completed:false, completedAt:null)
            let _ = conn.execute(
                "INSERT OR REPLACE INTO getting_started_checklist (id, title, description, deep_link, completed, completed_at) VALUES (?,?,?,?,?,?)",
                params![c.0, c.1, c.2, c.3, 0_i64, Option::<i64>::None],
            );
        }
    }

    if count(conn, "SELECT COUNT(*) FROM context_mappings") == 0 {
        for m in BUNDLED_CONTEXT_MAPPINGS {
            let _ = conn.execute(
                "INSERT INTO context_mappings (app_id, panel_id, article_id) VALUES (?,?,?)",
                params![m.0, m.1, m.2],
            );
        }
    }
}

// -----------------------------------------------------------------------------
// Row -> JSON helpers (one per distinct return shape).
// -----------------------------------------------------------------------------

/// Full article in the camelCase `HelpArticle` shape (matches help:get-article).
/// `tags` is parsed from the stored JSON string back into an array.
fn row_to_article(row: &Row) -> rusqlite::Result<Value> {
    let tags_str: String = row.get(7)?;
    let tags: Value = serde_json::from_str(&tags_str).unwrap_or_else(|_| json!([]));
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "title": row.get::<_, String>(1)?,
        "content": row.get::<_, String>(2)?,
        "category": row.get::<_, Option<String>>(3)?,
        "parentId": row.get::<_, Option<String>>(4)?,
        "appId": row.get::<_, Option<String>>(5)?,
        "sortOrder": row.get::<_, Option<i64>>(6)?,
        "tags": tags,
    }))
}

/// Raw `SELECT *` article row in snake_case (matches help:get-contextual-article,
/// which returns the row object directly without re-mapping). Column order matches
/// the help_articles CREATE TABLE: id, title, content, category, parent_id, app_id,
/// sort_order, tags. `tags` stays the raw stored string, exactly as Electron's
/// better-sqlite3 row would expose it.
fn row_to_article_raw(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "title": row.get::<_, String>(1)?,
        "content": row.get::<_, String>(2)?,
        "category": row.get::<_, Option<String>>(3)?,
        "parent_id": row.get::<_, Option<String>>(4)?,
        "app_id": row.get::<_, Option<String>>(5)?,
        "sort_order": row.get::<_, Option<i64>>(6)?,
        "tags": row.get::<_, Option<String>>(7)?,
    }))
}

/// help:list-articles row (camelCase, subset of columns).
fn row_to_article_summary(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "title": row.get::<_, String>(1)?,
        "category": row.get::<_, Option<String>>(2)?,
        "parentId": row.get::<_, Option<String>>(3)?,
        "appId": row.get::<_, Option<String>>(4)?,
        "sortOrder": row.get::<_, Option<i64>>(5)?,
    }))
}

/// help:search result row (camelCase-flat: id, title, snippet, rank, category).
/// `rank` is FTS5's bm25-derived REAL value.
fn row_to_search(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "title": row.get::<_, String>(1)?,
        "snippet": row.get::<_, Option<String>>(2)?,
        "rank": row.get::<_, Option<f64>>(3)?,
        "category": row.get::<_, Option<String>>(4)?,
    }))
}

/// Raw `SELECT *` keyboard_shortcuts row is never returned raw (get-shortcuts
/// re-maps to camelCase); this maps that camelCase shape.
fn row_to_shortcut(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "appId": row.get::<_, String>(1)?,
        "section": row.get::<_, Option<String>>(2)?,
        "action": row.get::<_, String>(3)?,
        "defaultKeys": row.get::<_, String>(4)?,
        "customKeys": row.get::<_, Option<String>>(5)?,
    }))
}

/// Raw `SELECT *` feature_discovery row in snake_case (matches
/// help:get-discovery-tooltips, which returns rows directly).
fn row_to_discovery_raw(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "feature_name": row.get::<_, String>(1)?,
        "description": row.get::<_, String>(2)?,
        "help_article_id": row.get::<_, Option<String>>(3)?,
        "target_selector": row.get::<_, Option<String>>(4)?,
        "shown_at": row.get::<_, Option<i64>>(5)?,
    }))
}

/// Raw `SELECT *` getting_started_checklist row in snake_case (matches
/// help:get-checklist, which returns rows directly).
fn row_to_checklist_raw(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "title": row.get::<_, String>(1)?,
        "description": row.get::<_, String>(2)?,
        "deep_link": row.get::<_, Option<String>>(3)?,
        "completed": row.get::<_, Option<i64>>(4)?,
        "completed_at": row.get::<_, Option<i64>>(5)?,
    }))
}

/// Raw `SELECT *` changelog_entries row in snake_case (matches help:get-changelog,
/// which returns rows directly). Column order matches CREATE TABLE.
fn row_to_changelog_raw(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "version": row.get::<_, String>(1)?,
        "release_date": row.get::<_, i64>(2)?,
        "category": row.get::<_, Option<String>>(3)?,
        "description": row.get::<_, String>(4)?,
        "help_article_id": row.get::<_, Option<String>>(5)?,
    }))
}

/// Generic list runner (keeps `stmt` alive in its own binding per the rusqlite
/// lifetime rule). Returns `[]` on any prepare/query error.
fn query_list(
    conn: &Connection,
    sql: &str,
    p: Vec<SqlValue>,
    map_fn: fn(&Row) -> rusqlite::Result<Value>,
) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), map_fn) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// Current epoch milliseconds (mirrors TS Date.now()).
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// -----------------------------------------------------------------------------
// Handlers.
// -----------------------------------------------------------------------------

/// help:search — FTS5 prefix search. Empty/blank query -> []. (matches handler)
fn search(conn: &Connection, query: &str) -> Value {
    if query.trim().is_empty() {
        return json!([]);
    }
    // Mirror `.all(query + '*')` prefix match; on any FTS error -> [] (matches try/catch).
    let term = format!("{}*", query);
    query_list(
        conn,
        "SELECT h.id, h.title, snippet(help_fts, 2, '<mark>', '</mark>', '...', 40) as snippet, rank, h.category
         FROM help_fts f
         JOIN help_articles h ON h.id = f.id
         WHERE help_fts MATCH ?
         ORDER BY rank
         LIMIT 20",
        vec![SqlValue::Text(term)],
        row_to_search,
    )
}

/// help:get-article — full article or null.
fn get_article(conn: &Connection, id: &str) -> Value {
    let mut stmt = match conn.prepare("SELECT * FROM help_articles WHERE id = ?") {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![id], row_to_article) {
        Ok(v) => v,
        Err(_) => Value::Null,
    }
}

/// help:list-articles — optional category filter, ordered by sort_order.
fn list_articles(conn: &Connection, category: Option<&str>) -> Value {
    match category {
        Some(c) => query_list(
            conn,
            "SELECT id, title, category, parent_id, app_id, sort_order FROM help_articles WHERE category = ? ORDER BY sort_order",
            vec![SqlValue::Text(c.to_string())],
            row_to_article_summary,
        ),
        None => query_list(
            conn,
            "SELECT id, title, category, parent_id, app_id, sort_order FROM help_articles ORDER BY sort_order",
            Vec::new(),
            row_to_article_summary,
        ),
    }
}

/// help:get-contextual-article — resolve (appId, panelId?) -> raw article row or null.
fn get_contextual_article(conn: &Connection, app_id: &str, panel_id: Option<&str>) -> Value {
    // Prefer the panel-specific mapping when panelId given, else the app-level
    // (panel_id IS NULL) mapping. (matches the two-step lookup in the handler)
    let mut article_id: Option<String> = None;
    if let Some(panel) = panel_id {
        article_id = conn
            .query_row(
                "SELECT article_id FROM context_mappings WHERE app_id = ? AND panel_id = ?",
                params![app_id, panel],
                |r| r.get::<_, String>(0),
            )
            .ok();
    }
    if article_id.is_none() {
        article_id = conn
            .query_row(
                "SELECT article_id FROM context_mappings WHERE app_id = ? AND panel_id IS NULL",
                params![app_id],
                |r| r.get::<_, String>(0),
            )
            .ok();
    }
    let aid = match article_id {
        Some(a) => a,
        None => return Value::Null,
    };
    // The handler returns the raw `SELECT *` row here (no camelCase re-map).
    let mut stmt = match conn.prepare("SELECT * FROM help_articles WHERE id = ?") {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![aid], row_to_article_raw) {
        Ok(v) => v,
        // .get() returning undefined for a missing row maps to null
        Err(_) => Value::Null,
    }
}

/// help:get-shortcuts — optional appId filter, camelCase mapped.
fn get_shortcuts(conn: &Connection, app_id: Option<&str>) -> Value {
    match app_id {
        Some(a) => query_list(
            conn,
            "SELECT id, app_id, section, action, default_keys, custom_keys FROM keyboard_shortcuts WHERE app_id = ? ORDER BY section, action",
            vec![SqlValue::Text(a.to_string())],
            row_to_shortcut,
        ),
        None => query_list(
            conn,
            "SELECT id, app_id, section, action, default_keys, custom_keys FROM keyboard_shortcuts ORDER BY app_id, section, action",
            Vec::new(),
            row_to_shortcut,
        ),
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    // Positional arg helpers.
    let s = |i: usize| args.get(i).and_then(|v| v.as_str());
    let b = |i: usize| args.get(i).and_then(|v| v.as_bool()).unwrap_or(false);

    match channel {
        "help:search" => search(conn, s(0).unwrap_or("")),

        "help:get-article" => get_article(conn, s(0).unwrap_or("")),

        // optional category (undefined -> all)
        "help:list-articles" => list_articles(conn, s(0)),

        "help:get-contextual-article" => get_contextual_article(conn, s(0).unwrap_or(""), s(1)),

        // void in Electron -> success:true
        "help:submit-feedback" => {
            let _ = conn.execute(
                "INSERT INTO help_feedback (article_id, helpful, created_at) VALUES (?,?,?)",
                params![s(0).unwrap_or(""), if b(1) { 1_i64 } else { 0_i64 }, now_ms()],
            );
            json!({ "success": true })
        }

        // optional appId (undefined -> all)
        "help:get-shortcuts" => get_shortcuts(conn, s(0)),

        // void; custom keys may be null (clears the override)
        "help:set-custom-shortcut" => {
            let custom = s(1); // None when the renderer sent null/undefined
            let _ = conn.execute(
                "UPDATE keyboard_shortcuts SET custom_keys = ? WHERE id = ?",
                params![custom, s(0).unwrap_or("")],
            );
            json!({ "success": true })
        }

        "help:get-discovery-tooltips" => query_list(
            conn,
            "SELECT id, feature_name, description, help_article_id, target_selector, shown_at FROM feature_discovery WHERE shown_at IS NULL",
            Vec::new(),
            row_to_discovery_raw,
        ),

        // void
        "help:mark-discovery-shown" => {
            let _ = conn.execute(
                "UPDATE feature_discovery SET shown_at = ? WHERE id = ?",
                params![now_ms(), s(0).unwrap_or("")],
            );
            json!({ "success": true })
        }

        // void
        "help:reset-discovery" => {
            let _ = conn.execute("UPDATE feature_discovery SET shown_at = NULL", []);
            json!({ "success": true })
        }

        "help:get-checklist" => query_list(
            conn,
            "SELECT id, title, description, deep_link, completed, completed_at FROM getting_started_checklist ORDER BY rowid",
            Vec::new(),
            row_to_checklist_raw,
        ),

        // void
        "help:complete-checklist-item" => {
            let _ = conn.execute(
                "UPDATE getting_started_checklist SET completed = 1, completed_at = ? WHERE id = ?",
                params![now_ms(), s(0).unwrap_or("")],
            );
            json!({ "success": true })
        }

        // boolean: true when no incomplete items remain (also true if db absent)
        "help:is-checklist-complete" => {
            let cnt = count(
                conn,
                "SELECT COUNT(*) FROM getting_started_checklist WHERE completed = 0",
            );
            json!(cnt == 0)
        }

        "help:get-changelog" => query_list(
            conn,
            "SELECT id, version, release_date, category, description, help_article_id FROM changelog_entries ORDER BY release_date DESC",
            Vec::new(),
            row_to_changelog_raw,
        ),

        // boolean: true when a whats_new_shown row exists for this version
        "help:was-whats-new-shown" => {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM whats_new_shown WHERE version = ?",
                    params![s(0).unwrap_or("")],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            json!(exists)
        }

        // void
        "help:mark-whats-new-shown" => {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO whats_new_shown (version, shown_at) VALUES (?,?)",
                params![s(0).unwrap_or(""), now_ms()],
            );
            json!({ "success": true })
        }

        _ => Value::Null,
    }
}
