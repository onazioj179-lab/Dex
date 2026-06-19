// =============================================================================
// DEX Tauri — Tasks subsystem (port of the `tasks:*` data handlers in
// src/main/core/TaskReminderSystem.ts).
//
// Pure-data, JSON-backed tier. The Electron TaskReminderSystem persists ONE
// file PER task: `<userData>/tasks/task-<n>-<ts>.json` (see saveTask/loadTasks),
// plus `lists.json` and `config.json` in the same directory. This module mirrors
// that exact on-disk layout under <appData>/tasks/, reading every `task-*.json`
// file back into the same Task shape the renderer expects.
//
// Only the read/data surface is ported:
//   - tasks:list  -> Task[]        (filtered + sorted exactly like listTasks)
//   - tasks:get   -> Task | null   (the stored task object, or null if absent)
//
// STORAGE-HINT DIVERGENCE (documented): the porting brief named the storage as
// `fs-json:tasks.json` (a single aggregate file). The actual Electron source
// does NOT use a single file — it writes one JSON file per task under a `tasks/`
// directory. To keep the on-disk format byte-compatible with anything Electron
// wrote (and with what the heavy create/update/delete handlers would produce on
// a native runtime), this port reads the real per-file layout, not a synthetic
// aggregate. No `tasks.json` is created or read.
//
// LISTS/CONFIG DIVERGENCE: list metadata (taskCount/completedCount) is
// recomputed in-memory by Electron at load time via updateListCounts; since this
// module only serves task reads it does NOT touch lists.json. `t.listId`
// defaults to the same `config.defaultList` fallback ("inbox") used when a task
// was created without one — but we never rewrite tasks, so a stored task's
// listId is returned verbatim.
//
// TIME: no Date crate. Smart-query helpers are NOT ported (they are separate
// channels: tasks:today/upcoming/overdue). `tasks:list` itself does no
// wall-clock work, so it is fully reproducible.
//
// HEAVY channels (create/update/delete/execute) are deliberately NOT ported and
// NOT faked — see channelsSkipped. They need the live native runtime
// (filesystem writes + reminder scheduler + recurrence engine + IPC events).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const TASKS_DIR: &str = "tasks";

// --- file IO ----------------------------------------------------------------

fn tasks_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(TASKS_DIR);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

// Read every `task-*.json` file from the tasks dir into Task Values.
fn read_all_tasks(app: &tauri::AppHandle) -> Vec<Value> {
    let dir = tasks_dir(app);
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<Value> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // Mirror loadTasks(): file.startsWith('task-') && file.endsWith('.json').
        if !(name.starts_with("task-") && name.ends_with(".json")) {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(entry.path()) {
            if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                if v.is_object() {
                    out.push(v);
                }
            }
        }
    }
    out
}

// getTask(id): load a single task by id (returns the stored object or null).
// loadTasks keys the in-memory map by task.id, so a lookup by filename would be
// wrong if a file was renamed; we match on the `id` field to be faithful.
fn get_task(app: &tauri::AppHandle, id: &str) -> Value {
    read_all_tasks(app)
        .into_iter()
        .find(|t| t.get("id").and_then(|v| v.as_str()) == Some(id))
        .unwrap_or(Value::Null)
}

// --- field accessors --------------------------------------------------------

fn status_of(t: &Value) -> &str {
    t.get("status").and_then(|v| v.as_str()).unwrap_or("")
}
fn priority_of(t: &Value) -> &str {
    t.get("priority").and_then(|v| v.as_str()).unwrap_or("normal")
}
fn due_date(t: &Value) -> Option<i64> {
    t.get("dueDate").and_then(|v| v.as_i64())
}
fn created_at(t: &Value) -> i64 {
    t.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}
fn tags_of(t: &Value) -> Vec<String> {
    t.get("tags")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

// priorityOrder map from listTasks (urgent < high < normal < low).
fn priority_rank(p: &str) -> i32 {
    match p {
        "urgent" => 0,
        "high" => 1,
        "normal" => 2,
        "low" => 3,
        _ => 4, // unknown priorities sort after the known set (defensive)
    }
}

// Normalize a filter field that may be a single string or an array of strings.
fn as_string_set(v: Option<&Value>) -> Option<Vec<String>> {
    match v {
        Some(Value::String(s)) => Some(vec![s.clone()]),
        Some(Value::Array(a)) => Some(
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect(),
        ),
        _ => None,
    }
}

// listTasks(filter?) — apply filters then sort, mirroring TaskReminderSystem.
fn list_tasks(app: &tauri::AppHandle, filter: &Value) -> Vec<Value> {
    let mut tasks = read_all_tasks(app);
    let f = if filter.is_object() { Some(filter) } else { None };

    if let Some(f) = f {
        // status (single or array)
        if let Some(statuses) = as_string_set(f.get("status")) {
            tasks.retain(|t| statuses.iter().any(|s| s == status_of(t)));
        }
        // priority (single or array)
        if let Some(priorities) = as_string_set(f.get("priority")) {
            tasks.retain(|t| priorities.iter().any(|p| p == priority_of(t)));
        }
        // listId
        if let Some(list_id) = f.get("listId").and_then(|v| v.as_str()) {
            tasks.retain(|t| t.get("listId").and_then(|v| v.as_str()) == Some(list_id));
        }
        // tags: keep if ANY of the filter tags is present (filter.tags.some)
        if let Some(tag_filter) = f.get("tags").and_then(|v| v.as_array()) {
            if !tag_filter.is_empty() {
                let wanted: Vec<String> = tag_filter
                    .iter()
                    .filter_map(|x| x.as_str().map(String::from))
                    .collect();
                tasks.retain(|t| {
                    let tt = tags_of(t);
                    wanted.iter().any(|w| tt.iter().any(|x| x == w))
                });
            }
        }
        // dueBefore: task has a dueDate AND dueDate <= dueBefore
        if let Some(before) = f.get("dueBefore").and_then(|v| v.as_i64()) {
            tasks.retain(|t| due_date(t).map(|d| d <= before).unwrap_or(false));
        }
        // dueAfter: task has a dueDate AND dueDate >= dueAfter
        if let Some(after) = f.get("dueAfter").and_then(|v| v.as_i64()) {
            tasks.retain(|t| due_date(t).map(|d| d >= after).unwrap_or(false));
        }
        // hasReminder: (reminders.length > 0) === hasReminder
        if let Some(has_reminder) = f.get("hasReminder").and_then(|v| v.as_bool()) {
            tasks.retain(|t| {
                let n = t
                    .get("reminders")
                    .and_then(|v| v.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                (n > 0) == has_reminder
            });
        }
        // isRecurring: !!t.recurrence === isRecurring
        if let Some(is_recurring) = f.get("isRecurring").and_then(|v| v.as_bool()) {
            tasks.retain(|t| {
                let has = t
                    .get("recurrence")
                    .map(|v| !v.is_null())
                    .unwrap_or(false);
                has == is_recurring
            });
        }
        // search: title | description | any tag, case-insensitive substring
        if let Some(search) = f.get("search").and_then(|v| v.as_str()) {
            if !search.is_empty() {
                let q = search.to_lowercase();
                tasks.retain(|t| {
                    let title = t
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if title.contains(&q) {
                        return true;
                    }
                    if let Some(desc) = t.get("description").and_then(|v| v.as_str()) {
                        if desc.to_lowercase().contains(&q) {
                            return true;
                        }
                    }
                    tags_of(t).iter().any(|tag| tag.to_lowercase().contains(&q))
                });
            }
        }
    }

    // Sort: completed last, then priority, then earliest dueDate (none last),
    // then newest createdAt. Mirrors the comparator in listTasks exactly.
    tasks.sort_by(|a, b| {
        use std::cmp::Ordering;
        let a_done = status_of(a) == "completed";
        let b_done = status_of(b) == "completed";
        if a_done != b_done {
            return if a_done { Ordering::Greater } else { Ordering::Less };
        }
        let pr = priority_rank(priority_of(a)).cmp(&priority_rank(priority_of(b)));
        if pr != Ordering::Equal {
            return pr;
        }
        match (due_date(a), due_date(b)) {
            (Some(da), Some(db)) => {
                let d = da.cmp(&db);
                if d != Ordering::Equal {
                    return d;
                }
            }
            (Some(_), None) => return Ordering::Less,
            (None, Some(_)) => return Ordering::Greater,
            (None, None) => {}
        }
        created_at(b).cmp(&created_at(a))
    });

    if let Some(limit) = f.and_then(|f| f.get("limit")).and_then(|v| v.as_u64()) {
        tasks.truncate(limit as usize);
    }

    tasks
}

/// Route a `tasks:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the data channels (list/get) are handled;
/// every other `tasks:*` channel returns Value::Null so the prefix router can
/// fall through to the controller that actually owns it.
///
/// NOTE: the `tasks:` namespace is shared by THREE Electron controllers
/// (WorkflowController queue, MiscSystems, TaskReminderSystem). This dispatch
/// must therefore NOT be wired as a blanket prefix route — it only knows the two
/// TaskReminderSystem read channels. prefixRouteSafe = false.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "tasks:list" => {
            let filter = args.get(0).cloned().unwrap_or(Value::Null);
            json!(list_tasks(app, &filter))
        }
        "tasks:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_task(app, id)
        }
        _ => Value::Null,
    }
}
