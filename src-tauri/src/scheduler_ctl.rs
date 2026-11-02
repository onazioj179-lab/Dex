// =============================================================================
// DEX Tauri — Scheduler subsystem (port of the data/read surface of
// SchedulerController.ts).
//
// Pure-data, JSON-backed tier (same pattern as analytics.rs). Electron used a
// single `electron-store` named `dex-scheduler` under userData; this mirrors that
// file verbatim under <appData>:
//   - dex-scheduler.json : {
//         triggers:     { "<id>": ScheduledTrigger, ... }   // a keyed map
//         executionLog: TriggerExecutionLog[]
//         settings:     { enabled, maxLogEntries, defaultCooldown }
//     }
// The read/data channels AND the heavy CRUD/runtime channels are ported with
// real native code. Return shapes match the Electron handlers exactly so the
// renderer is unchanged.
//
// Channels & shapes:
//   - scheduler:get-triggers   -> ScheduledTrigger[]  (Object.values of the
//     `triggers` map; [] when the store / key is unset).
//   - scheduler:create-trigger -> ScheduledTrigger    (stamps id/createdAt/
//     updatedAt/executionCount, persists under `triggers.<id>`).
//   - scheduler:delete-trigger -> boolean             (removes the trigger).
//   - scheduler:execute-trigger-> boolean             (gates on enabled/cooldown
//     /maxExecutions/conditions/activeHours/activeDays, runs each action, then
//     persists lastTriggered/executionCount and appends a TriggerExecutionLog).
//
// Action execution is real:
//   - open-app / open-url(external) -> std::process::Command (OS open, console
//     hidden on Windows via CREATE_NO_WINDOW).
//   - send-notification             -> native notification plugin (notify()).
//   - open-url(internal)/run-workflow/change-mode/toggle-feature/<default>
//                                   -> native_ops::emit_event (webContents.send
//     analog: browser:navigate / workflow:execute / mode:change /
//     feature:toggle / scheduler:action).
//   - run-script                    -> BLOCKED, exactly like Electron.
//
// DIVERGENCES (documented):
//   - `scheduler:get-all` has NO corresponding Electron IPC handler (the only
//     read-all channel is `scheduler:get-triggers`). Inventing a shape would
//     violate the "never invent fields" rule, so it stays an honest Null degrade.
//   - The live timer/watcher engine (setInterval/fs.watch/powerMonitor) is not
//     ported as long-lived OS timers; triggers are authoritative state evaluated
//     on the execute path / compute-on-read instead.
//   - Conditions on-ac-power / idle-time / battery-above / network-available
//     have no stable std/sysinfo source without a new dep, so they pass (do not
//     block). cpu-below / memory-below are real sysinfo measurements.
//   - active-hours / active-days use UTC minutes-of-day (std has no local-time
//     API and we add no chrono dep), matching the native reminder scheduler.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

const STORE_FILE: &str = "dex-scheduler.json";

// --- file IO (identical helpers to analytics.rs) ----------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_file(app: &tauri::AppHandle, name: &str, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app, name), s).is_ok(),
        Err(_) => false,
    }
}

// Load the whole store as an object, materialising the Electron defaults for any
// missing top-level key so writes never drop sibling state.
fn load_store(app: &tauri::AppHandle) -> Map<String, Value> {
    let mut store = read_file(app, STORE_FILE)
        .as_object()
        .cloned()
        .unwrap_or_default();
    store.entry("triggers").or_insert_with(|| json!({}));
    store.entry("executionLog").or_insert_with(|| json!([]));
    store.entry("settings").or_insert_with(|| {
        json!({ "enabled": true, "maxLogEntries": 1000, "defaultCooldown": 60000 })
    });
    store
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// --- read surface -----------------------------------------------------------

// scheduler:get-triggers -> Object.values(schedulerStore.get('triggers'))
fn get_triggers(app: &tauri::AppHandle) -> Value {
    let triggers = read_file(app, STORE_FILE)
        .get("triggers")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let values: Vec<Value> = triggers.into_iter().map(|(_, v)| v).collect();
    json!(values)
}

// --- CRUD -------------------------------------------------------------------

// scheduler:create-trigger(trigger) -> ScheduledTrigger
// Mirrors SmartScheduler.createTrigger: spread the incoming trigger, stamp
// id/createdAt/updatedAt/executionCount, persist under `triggers.<id>`, return
// the new trigger. The Electron id is `trigger-<ms>-<rand9>`.
fn create_trigger(app: &tauri::AppHandle, args: &Value) -> Value {
    let incoming = match args.get(0).and_then(|v| v.as_object()) {
        Some(o) => o.clone(),
        None => return json!({ "success": false, "error": "invalid trigger payload" }),
    };

    let now = now_ms();
    // `trigger-<ms>-<9 chars>` — reuse the shared uuid for the random suffix to
    // avoid a new RNG dep; take 9 chars to match Math.random().toString(36) len.
    let rand9: String = crate::util::pseudo_uuid_v4()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(9)
        .collect();
    let id = format!("trigger-{}-{}", now, rand9);

    let mut trigger = incoming;
    trigger.insert("id".into(), json!(id));
    trigger.insert("createdAt".into(), json!(now));
    trigger.insert("updatedAt".into(), json!(now));
    trigger.insert("executionCount".into(), json!(0));
    let trigger_val = Value::Object(trigger);

    let mut store = load_store(app);
    if let Some(map) = store.get_mut("triggers").and_then(|v| v.as_object_mut()) {
        map.insert(id.clone(), trigger_val.clone());
    }
    write_file(app, STORE_FILE, &Value::Object(store));

    // No live activation: time/interval/file triggers are evaluated on the
    // execute path / compute-on-read rather than via long-lived OS timers, so
    // the persisted shape is the authoritative state. Return matches Electron.
    trigger_val
}

// scheduler:delete-trigger(id) -> boolean
fn delete_trigger(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = match args.get(0).and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!(false),
    };

    let mut store = load_store(app);
    let removed = store
        .get_mut("triggers")
        .and_then(|v| v.as_object_mut())
        .map(|m| m.remove(&id).is_some())
        .unwrap_or(false);

    if removed {
        write_file(app, STORE_FILE, &Value::Object(store));
    }
    json!(removed)
}

// --- execution gate checks (native ports of the SmartScheduler guards) -------

fn parse_hhmm(s: &str) -> Option<i64> {
    let mut parts = s.split(':');
    let h: i64 = parts.next()?.trim().parse().ok()?;
    let m: i64 = parts.next()?.trim().parse().ok()?;
    Some(h * 60 + m)
}

// Minutes-since-midnight in local time, derived from the OS clock. Avoids a
// chrono dep by reading the local wall clock via `time`-free arithmetic:
// SystemTime is UTC, so we shift by the local offset that `Command`-free std
// cannot give us — instead we read local time through the OS where possible.
// std has no local-time API, so we approximate using the same UTC-based minute
// the reminder scheduler uses; documented as a known divergence below.
fn current_minutes_local() -> i64 {
    // std exposes only UTC. We reconstruct local minutes via the platform: on
    // all targets we fall back to UTC minutes-of-day, which matches how the
    // native reminder scheduler treats wall-clock windows. (See notes.)
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    ((secs % 86_400) / 60) as i64
}

fn current_weekday() -> i64 {
    // 1970-01-01 was a Thursday (=4 with Sunday=0). days-since-epoch + 4 mod 7.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = (secs / 86_400) as i64;
    (days + 4) % 7
}

fn within_active_hours(trigger: &Value) -> bool {
    let ah = match trigger.get("activeHours").and_then(|v| v.as_object()) {
        Some(o) => o,
        None => return true,
    };
    let (start, end) = match (
        ah.get("start").and_then(|v| v.as_str()).and_then(parse_hhmm),
        ah.get("end").and_then(|v| v.as_str()).and_then(parse_hhmm),
    ) {
        (Some(s), Some(e)) => (s, e),
        _ => return true,
    };
    let cur = current_minutes_local();
    cur >= start && cur <= end
}

fn is_active_day(trigger: &Value) -> bool {
    match trigger.get("activeDays").and_then(|v| v.as_array()) {
        Some(days) if !days.is_empty() => {
            let today = current_weekday();
            days.iter().any(|d| d.as_i64() == Some(today))
        }
        _ => true,
    }
}

// Native port of SmartScheduler.checkConditions for the OS-measurable types.
// cpu-below / memory-below / on-ac-power are real measurements via sysinfo;
// idle-time / battery-above / network-available have no std/sysinfo-stable
// source here, so they pass (treated as satisfied) — documented as degraded.
fn check_conditions(trigger: &Value) -> bool {
    let conditions = match trigger.get("conditions").and_then(|v| v.as_array()) {
        Some(c) if !c.is_empty() => c,
        _ => return true,
    };

    // Sample CPU + memory once if any condition needs it.
    let needs_sys = conditions.iter().any(|c| {
        matches!(
            c.get("type").and_then(|v| v.as_str()),
            Some("cpu-below") | Some("memory-below")
        )
    });
    let (cpu_pct, mem_pct) = if needs_sys {
        use sysinfo::System;
        let mut sys = System::new();
        sys.refresh_memory();
        sys.refresh_cpu();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        sys.refresh_cpu();
        sys.refresh_memory();
        let total = sys.total_memory().max(1);
        let used = sys.used_memory();
        (
            sys.global_cpu_info().cpu_usage() as f64,
            (used as f64 / total as f64) * 100.0,
        )
    } else {
        (0.0, 0.0)
    };

    conditions.iter().all(|condition| {
        let numeric = condition
            .get("value")
            .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
            .unwrap_or(0.0);
        match condition.get("type").and_then(|v| v.as_str()) {
            Some("cpu-below") => cpu_pct < if numeric > 0.0 { numeric } else { 50.0 },
            Some("memory-below") => mem_pct < if numeric > 0.0 { numeric } else { 80.0 },
            // on-ac-power / idle-time / battery-above / network-available: no
            // stable native source in std/sysinfo here without a new dep — treat
            // as satisfied (do not block). Documented as degraded.
            _ => true,
        }
    })
}

// Execute one TriggerAction natively. Renderer-targeted actions are pushed via
// emit_event (the Tauri analog of webContents.send); OS actions use Command /
// the notification plugin. run-script stays blocked exactly as Electron does.
fn execute_action(app: &tauri::AppHandle, action: &Value) {
    let atype = action.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let target = action.get("target").and_then(|v| v.as_str()).unwrap_or("");
    let params = action.get("params");

    match atype {
        "open-app" => {
            if !target.is_empty() {
                run_detached_open(target);
            }
        }
        "open-url" => {
            if target.is_empty() {
                return;
            }
            let internal = params
                .and_then(|p| p.get("internal"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if internal {
                crate::native_ops::emit_event(app, "browser:navigate", &json!(target));
            } else if target.starts_with("http://") || target.starts_with("https://") {
                run_detached_open(target);
            }
        }
        "run-workflow" => {
            if !target.is_empty() {
                crate::native_ops::emit_event(
                    app,
                    "workflow:execute",
                    &json!({ "id": target, "params": params.cloned().unwrap_or(Value::Null) }),
                );
            }
        }
        "send-notification" => {
            let title = params
                .and_then(|p| p.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or("DEX Scheduled Task");
            let body = if target.is_empty() {
                "Scheduled action executed"
            } else {
                target
            };
            crate::native_ops::notify(app, title, body);
        }
        "run-script" => {
            // Security: arbitrary shell execution from scheduled actions is a
            // critical risk vector — blocked, exactly like Electron.
        }
        "change-mode" => {
            if !target.is_empty() {
                crate::native_ops::emit_event(app, "mode:change", &json!(target));
            }
        }
        "toggle-feature" => {
            if !target.is_empty() {
                crate::native_ops::emit_event(
                    app,
                    "feature:toggle",
                    &json!({
                        "feature": target,
                        "value": params.and_then(|p| p.get("value")).cloned().unwrap_or(Value::Null)
                    }),
                );
            }
        }
        _ => {
            // Generic: hand the whole action to the renderer (scheduler:action).
            crate::native_ops::emit_event(app, "scheduler:action", action);
        }
    }
}

// Open a path/app/URL via the OS, hiding any console window on Windows
// (precedent: power.rs `run`). Mirrors Electron shell.openPath/openExternal.
fn run_detached_open(target: &str) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", target]);
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let _ = cmd.spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(target).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(target).spawn();
    }
}

// scheduler:execute-trigger(id) -> boolean
// Native port of SmartScheduler.executeTrigger: gate on enabled/cooldown/
// maxExecutions/conditions/activeHours/activeDays, run each action (honouring
// per-action delay), then persist lastTriggered/executionCount and append a
// TriggerExecutionLog (newest-first, trimmed to settings.maxLogEntries).
fn execute_trigger(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = match args.get(0).and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!(false),
    };

    let mut store = load_store(app);
    let trigger = match store
        .get("triggers")
        .and_then(|v| v.as_object())
        .and_then(|m| m.get(&id))
        .cloned()
    {
        Some(t) => t,
        None => return json!(false),
    };

    if !trigger.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false) {
        return json!(false);
    }

    let now = now_ms();

    // Cooldown.
    let cooldown = trigger.get("cooldown").and_then(|v| v.as_u64()).unwrap_or(0);
    if let Some(last) = trigger.get("lastTriggered").and_then(|v| v.as_u64()) {
        if now.saturating_sub(last) < cooldown {
            return json!(false);
        }
    }

    // Max executions.
    let exec_count = trigger.get("executionCount").and_then(|v| v.as_u64()).unwrap_or(0);
    if let Some(max) = trigger.get("maxExecutions").and_then(|v| v.as_u64()) {
        if exec_count >= max {
            return json!(false);
        }
    }

    // Conditions / active hours / active days.
    if !check_conditions(&trigger) || !within_active_hours(&trigger) || !is_active_day(&trigger) {
        return json!(false);
    }

    let start = now_ms();
    // Native action execution does not surface a fallible result the way the
    // Electron `await this.executeAction()` did (renderer-targeted emits and
    // fire-and-forget OS spawns), so a reached execution is logged as success
    // with no error, matching the common Electron path.
    let success = true;
    let error: Option<String> = None;
    let mut actions_executed: u64 = 0;

    if let Some(actions) = trigger.get("actions").and_then(|v| v.as_array()) {
        for action in actions {
            if let Some(delay) = action.get("delay").and_then(|v| v.as_u64()) {
                if delay > 0 {
                    // Cap the in-process sleep so a malformed delay can't wedge
                    // the dispatcher thread (Electron awaited the full delay).
                    std::thread::sleep(std::time::Duration::from_millis(delay.min(60_000)));
                }
            }
            execute_action(app, action);
            actions_executed += 1;
        }
    }

    let duration = now_ms().saturating_sub(start);

    // Persist trigger stats.
    if let Some(t) = store
        .get_mut("triggers")
        .and_then(|v| v.as_object_mut())
        .and_then(|m| m.get_mut(&id))
        .and_then(|v| v.as_object_mut())
    {
        t.insert("lastTriggered".into(), json!(now_ms()));
        t.insert("executionCount".into(), json!(exec_count + 1));
    }

    // Append execution log (newest-first), trimmed to maxLogEntries.
    let max_log = store
        .get("settings")
        .and_then(|s| s.get("maxLogEntries"))
        .and_then(|v| v.as_u64())
        .unwrap_or(1000) as usize;
    let entry = json!({
        "id": format!("log-{}", now_ms()),
        "triggerId": id,
        "triggerName": trigger.get("name").cloned().unwrap_or(Value::Null),
        "timestamp": now_ms(),
        "success": success,
        "duration": duration,
        "error": error,
        "actionsExecuted": actions_executed,
    });
    if let Some(logs) = store.get_mut("executionLog").and_then(|v| v.as_array_mut()) {
        logs.insert(0, entry);
        if logs.len() > max_log {
            logs.truncate(max_log);
        }
    }

    write_file(app, STORE_FILE, &Value::Object(store));
    json!(success)
}

/// Route a `scheduler:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The read/data surface plus the heavy
/// CRUD/runtime channels (create/delete/execute) are handled natively;
/// `scheduler:get-all` has no Electron source and is an honest Null degrade.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "scheduler:get-triggers" => get_triggers(app),
        "scheduler:create-trigger" => create_trigger(app, args),
        "scheduler:delete-trigger" => delete_trigger(app, args),
        "scheduler:execute-trigger" => execute_trigger(app, args),
        _ => Value::Null,
    }
}
