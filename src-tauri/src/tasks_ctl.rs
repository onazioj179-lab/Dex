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
// HEAVY channels (create/update/delete) ARE now ported with real native code:
//   - tasks:create -> create_task  (mints task-<n>-<ts> id, auto-reminder on a
//                                    future dueDate, writes <id>.json, emits
//                                    `task:created`) -> full Task
//   - tasks:update -> update_task  (patch-in-place + bump updatedAt + persist +
//                                    emit `task:updated`) -> { success, task? }
//   - tasks:delete -> delete_task  (unlink <id>.json + emit `task:deleted`)
//                                    -> { success }
// These mirror TaskReminderSystem.{createTask,updateTask,deleteTask} exactly,
// including the per-file on-disk layout and the renderer push events (the Tauri
// analog of webContents.send via native_ops::emit_event).
//
// tasks:execute has NO Electron handler anywhere in the `tasks:` namespace; it
// is reported as not-ported rather than fabricated. See dispatch + the returned
// degraded entry.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const TASKS_DIR: &str = "tasks";

// epoch millis, the native analog of Date.now().
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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

// --- config + id allocation -------------------------------------------------

// Path to the per-task file. saveTask writes `<dataPath>/<task.id>.json`
// (the id ALREADY begins with "task-"), and deleteTask unlinks the same path.
fn task_path(app: &tauri::AppHandle, id: &str) -> PathBuf {
    tasks_dir(app).join(format!("{}.json", id))
}

// Load config.json, merged over the same defaults TaskReminderSystem ships.
// Only the two fields the create path needs (defaultList, defaultReminderMinutes)
// are read; everything else mirrors the constructor defaults implicitly.
fn config_default_list(app: &tauri::AppHandle) -> String {
    read_config(app)
        .get("defaultList")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| "inbox".to_string())
}

fn config_default_reminder_minutes(app: &tauri::AppHandle) -> i64 {
    read_config(app)
        .get("defaultReminderMinutes")
        .and_then(|v| v.as_i64())
        .unwrap_or(30)
}

fn read_config(app: &tauri::AppHandle) -> Value {
    let path = tasks_dir(app).join("config.json");
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .filter(|v| v.is_object())
        .unwrap_or_else(|| json!({}))
}

// Mirror loadTasks()'s idCounter recovery: scan stored task ids for the
// `task-(\d+)-` prefix and take the max, so freshly-minted ids never collide
// with anything already on disk. Electron keeps this counter in memory across a
// run; per-call we rebuild it from disk (the same value it would have had after
// loadTasks ran), which keeps ids monotonic on a single-process native runtime.
fn next_id_counter(app: &tauri::AppHandle) -> i64 {
    let mut max = 0i64;
    for t in read_all_tasks(app) {
        if let Some(id) = t.get("id").and_then(|v| v.as_str()) {
            // id shape: task-<n>-<ts>
            if let Some(rest) = id.strip_prefix("task-") {
                if let Some(dash) = rest.find('-') {
                    if let Ok(n) = rest[..dash].parse::<i64>() {
                        if n > max {
                            max = n;
                        }
                    }
                }
            }
        }
    }
    max
}

// createTask(data) — build the Task exactly as TaskReminderSystem.createTask,
// persist it to its own file, then emit `task:created`. Returns the full Task.
fn create_task(app: &tauri::AppHandle, data: &Value) -> Value {
    let now = now_ms();
    let counter = next_id_counter(app) + 1; // ++this.idCounter
    let id = format!("task-{}-{}", counter, now);

    let priority = data
        .get("priority")
        .and_then(|v| v.as_str())
        .unwrap_or("normal")
        .to_string();
    let title = data
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled Task")
        .to_string();
    let list_id = data
        .get("listId")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| config_default_list(app));

    // Build the object, preserving Electron's key set + optional fields.
    let mut task = json!({
        "id": id.clone(),
        "title": title,
        "status": "pending",
        "priority": priority,
        "createdAt": now,
        "updatedAt": now,
        "listId": list_id,
        "tags": data.get("tags").cloned().unwrap_or_else(|| json!([])),
        "subtasks": [],
        "reminders": [],
    });
    let obj = task.as_object_mut().unwrap();
    // Optional passthrough fields (only present when supplied, mirroring how the
    // TS spread leaves `undefined` props off the serialized JSON). NOTE: Electron's
    // createTask object literal does NOT carry `recurrence` through (it is only set
    // later via setRecurrence), so we deliberately omit it here for shape parity.
    for key in [
        "description",
        "dueDate",
        "dueTime",
        "notes",
        "estimatedMinutes",
        "parentTaskId",
    ] {
        if let Some(v) = data.get(key) {
            if !v.is_null() {
                obj.insert(key.to_string(), v.clone());
            }
        }
    }

    // Auto-add reminder if a future due date is set.
    let default_minutes = config_default_reminder_minutes(app);
    if default_minutes > 0 {
        if let Some(due) = data.get("dueDate").and_then(|v| v.as_i64()) {
            let reminder_time = due - default_minutes * 60 * 1000;
            if reminder_time > now {
                // Electron uses `rem-${this.idCounter++}` here (post-increment of
                // the same counter the id was minted from). The id used `++counter`
                // (pre-increment to `counter`), so the reminder reuses `counter`.
                let rem_id = format!("rem-{}", counter);
                let reminder = json!({
                    "id": rem_id,
                    "taskId": id.clone(),
                    "time": reminder_time,
                    "triggered": false,
                });
                if let Some(arr) = obj.get_mut("reminders").and_then(|v| v.as_array_mut()) {
                    arr.push(reminder);
                }
            }
        }
    }

    let _ = std::fs::write(
        task_path(app, &id),
        serde_json::to_string_pretty(&task).unwrap_or_default(),
    );

    crate::native_ops::emit_event(app, "task:created", &task);
    task
}

// updateTask(id, data) — patch the stored task in place, bump updatedAt, persist,
// emit `task:updated`. Returns { success, task? }. Missing -> { success: false }.
fn update_task(app: &tauri::AppHandle, id: &str, data: &Value) -> Value {
    let mut task = get_task(app, id);
    if !task.is_object() {
        return json!({ "success": false });
    }
    let obj = task.as_object_mut().unwrap();

    // Mirror the explicit `if (data.x !== undefined)` field set. We treat a
    // present (non-absent) key as "defined"; null is a real value here for
    // dueDate (setDueDate(undefined) clears it via updateTask({dueDate})), so
    // we DO copy an explicit null through, matching the TS assignment.
    for key in [
        "title",
        "description",
        "priority",
        "dueDate",
        "dueTime",
        "listId",
        "tags",
        "notes",
        "estimatedMinutes",
        "status",
    ] {
        if let Some(v) = data.get(key) {
            obj.insert(key.to_string(), v.clone());
        }
    }

    obj.insert("updatedAt".to_string(), json!(now_ms()));

    let _ = std::fs::write(
        task_path(app, id),
        serde_json::to_string_pretty(&task).unwrap_or_default(),
    );

    crate::native_ops::emit_event(app, "task:updated", &task);
    json!({ "success": true, "task": task })
}

// deleteTask(id) — unlink the per-task file, emit `task:deleted` (payload = id).
// Returns { success }. Reminder map cleanup is in-memory-only in Electron and
// has no on-disk effect, so it is a no-op here.
fn delete_task(app: &tauri::AppHandle, id: &str) -> Value {
    let task = get_task(app, id);
    if !task.is_object() {
        return json!({ "success": false });
    }
    let _ = std::fs::remove_file(task_path(app, id));
    crate::native_ops::emit_event(app, "task:deleted", &json!(id));
    json!({ "success": true })
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
        // createTask(data) — args[0] is the partial Task.
        "tasks:create" => {
            let data = args.get(0).cloned().unwrap_or_else(|| json!({}));
            create_task(app, &data)
        }
        // updateTask(id, data) — args[0]=id, args[1]=partial Task.
        "tasks:update" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let data = args.get(1).cloned().unwrap_or_else(|| json!({}));
            update_task(app, id, &data)
        }
        // deleteTask(id) — args[0]=id.
        "tasks:delete" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_task(app, id)
        }
        // tasks:execute has NO Electron handler in TaskReminderSystem (nor in the
        // other two `tasks:` controllers' task-data surface). It is not a real
        // channel here; report it honestly rather than fabricate behavior.
        "tasks:execute" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }
        _ => Value::Null,
    }
}
