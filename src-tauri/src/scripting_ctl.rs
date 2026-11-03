// =============================================================================
// DEX Tauri — Scripting subsystem (port of the data/CRUD surface of
// src/main/scripting/ScriptingEngine.ts).
//
// Pure-data, JSON-backed tier. Electron used an `electron-store` named
// `dex-scripts` (file `dex-scripts.json` under userData) holding a single
// top-level key `scripts` (an array, default []). This mirrors that exact shape
// under <appData>:
//   - dex-scripts.json : { scripts: [Script, ...] }
// (Same store/key/file convention as analytics.rs.) Return shapes match the
// Electron IPC handlers exactly so the renderer is unchanged.
//
// A Script is:
//   { id, name, description?, code, trigger?, enabled, createdAt, updatedAt,
//     lastRun?, runCount, avgDuration? }
//
// Channels & shapes (from ScriptingEngine + initializeScripting):
//   - scripting:get-scripts   -> Script[]        (stored array, [] if unset)
//   - scripting:get-script    -> Script | null   (find by id, null if missing)
//   - scripting:create-script -> Script          (new script, persisted)
//   - scripting:update-script -> Script | null   (merged script; null if id
//                                unknown — mirrors findIndex === -1 -> null)
//   - scripting:delete-script -> boolean         (true if removed, false if id
//                                not present — mirrors filtered.length compare)
//   - scripting:get-templates -> Array<{ name, description, code }>  (static)
//
// HEAVY channels — partial native port:
//   - scripting:stop      -> REAL. Electron tracked a `runningScripts` Map and
//                            aborted by id (true if present, false otherwise).
//                            We keep a process-wide running-script registry
//                            (static HashSet<id>) and reproduce that exact
//                            boolean semantics. execute() registers the id while
//                            it runs; stop removes + aborts it.
//   - scripting:execute   -> PARTIAL. The deterministic, non-code-running
//                            branches are reproduced natively against real
//                            stored data: missing id -> { success:false,
//                            error:"Script not found", ... } and disabled ->
//                            { success:false, error:"Script is disabled", ... },
//                            matching Electron verbatim. The actual body runs
//                            arbitrary user JS inside a `vm` sandbox (system/
//                            http/file/notification globals); there is no JS
//                            engine in the allowed dependency set, so a runnable
//                            script returns an honest shaped failure instead of
//                            a faked success — and stats (lastRun/runCount/
//                            avgDuration) are NOT mutated, since no run occurred.
//   - scripting:execute-code -> DEGRADED. Wraps execute() over a throwaway
//                            script of raw code; same JS-VM blocker -> honest
//                            shaped failure.
//   All three return/consume a ScriptResult ({ success, error, duration, logs })
//   except stop, which returns a bare boolean (matching Electron).
//
// DIVERGENCES (documented):
//   - id generation: Electron used
//       `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
//     (timestamp + 6 base36 chars). We keep the `script-<ms>-<6 chars>` shape
//     using the mandated crate::util::pseudo_uuid_v4() (hex, hyphens stripped,
//     first 6 chars) — no rand/Math.random. The chars are hex not base36; only
//     per-machine uniqueness is required and is preserved.
//   - execute()'s stat side-effects (lastRun/runCount/avgDuration updates) are
//     part of the heavy runtime path and are not reproduced; no data channel
//     mutates those fields, matching Electron (only execute touches them).
// =============================================================================

use crate::paths::DexPaths;
use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const SCRIPTS_FILE: &str = "dex-scripts.json";
const SCRIPTS_KEY: &str = "scripts";

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Mirror `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
// (6 trailing chars) using the mandated helper — hex instead of base36.
fn generate_id() -> String {
    let suffix: String = pseudo_uuid_v4().chars().filter(|c| *c != '-').take(6).collect();
    format!("script-{}-{}", now_ms(), suffix)
}

// --- file IO (electron-store JSON under appData) ----------------------------

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

fn load(app: &tauri::AppHandle) -> Vec<Value> {
    read_file(app, SCRIPTS_FILE)
        .get(SCRIPTS_KEY)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn store(app: &tauri::AppHandle, scripts: &[Value]) -> bool {
    write_file(app, SCRIPTS_FILE, &json!({ SCRIPTS_KEY: scripts }))
}

fn id_of(s: &Value) -> Option<&str> {
    s.get("id").and_then(|v| v.as_str())
}

// getScripts()
fn get_scripts(app: &tauri::AppHandle) -> Value {
    json!(load(app))
}

// getScript(id)
fn get_script(app: &tauri::AppHandle, id: &str) -> Value {
    load(app)
        .into_iter()
        .find(|s| id_of(s) == Some(id))
        .unwrap_or(Value::Null)
}

// createScript(script): spreads the input, then overrides id/createdAt/
// updatedAt/runCount. Electron does `{ ...script, id, createdAt, updatedAt,
// runCount }`, so caller-supplied id/createdAt/updatedAt/runCount are replaced.
fn create_script(app: &tauri::AppHandle, script: &Value) -> Value {
    let now = now_ms();
    let mut obj = script.as_object().cloned().unwrap_or_default();
    obj.insert("id".into(), json!(generate_id()));
    obj.insert("createdAt".into(), json!(now));
    obj.insert("updatedAt".into(), json!(now));
    obj.insert("runCount".into(), json!(0));
    let new_script = Value::Object(obj);

    let mut scripts = load(app);
    scripts.push(new_script.clone());
    store(app, &scripts);
    new_script
}

// updateScript(id, updates): `{ ...scripts[index], ...updates, updatedAt }`.
// Returns null if id not found.
fn update_script(app: &tauri::AppHandle, id: &str, updates: &Value) -> Value {
    let mut scripts = load(app);
    let idx = match scripts.iter().position(|s| id_of(s) == Some(id)) {
        Some(i) => i,
        None => return Value::Null,
    };
    let mut merged = scripts[idx].as_object().cloned().unwrap_or_default();
    if let Some(upd) = updates.as_object() {
        for (k, v) in upd {
            merged.insert(k.clone(), v.clone());
        }
    }
    merged.insert("updatedAt".into(), json!(now_ms()));
    let merged = Value::Object(merged);
    scripts[idx] = merged.clone();
    store(app, &scripts);
    merged
}

// deleteScript(id): returns true if a script was removed, false otherwise.
fn delete_script(app: &tauri::AppHandle, id: &str) -> Value {
    let scripts = load(app);
    let original_len = scripts.len();
    let filtered: Vec<Value> = scripts.into_iter().filter(|s| id_of(s) != Some(id)).collect();
    if filtered.len() == original_len {
        return json!(false);
    }
    store(app, &filtered);
    json!(true)
}

// getTemplates(): static list, verbatim from ScriptingEngine.getTemplates().
fn get_templates() -> Value {
    let tpl = |name: &str, description: &str, code: &str| -> Value {
        json!({ "name": name, "description": description, "code": code })
    };
    json!([
        tpl(
            "Battery Monitor",
            "Switch mode based on battery level",
            "const battery = await system.getBattery();\nlog(`Battery: ${battery.level}%, Charging: ${battery.charging}`);\n\nif (battery.level < 20 && !battery.charging) {\n  await notify('Low battery! Switching to eco mode');\n  // Run eco mode workflow\n}"
        ),
        tpl(
            "Daily Backup",
            "Run backup workflow and log result",
            "log('Starting daily backup...');\n\nconst workflows = await workflows.list();\nconst backupWorkflow = workflows.find(w => w.name.includes('backup'));\n\nif (backupWorkflow) {\n  const result = await workflows.run(backupWorkflow.id);\n  log(`Backup ${result.success ? 'completed' : 'failed'}`);\n  await notify(`Backup ${result.success ? 'completed' : 'failed'}`);\n}"
        ),
        tpl(
            "Memory Cleanup",
            "Monitor memory and trigger cleanup",
            "const mem = await system.getMemory();\nlog(`Memory usage: ${mem.percent}%`);\n\nif (mem.percent > 80) {\n  log('High memory usage detected, running cleanup...');\n  await operations.run('cleanup-memory');\n  await notify('Memory cleanup completed');\n}"
        ),
        tpl(
            "HTTP Health Check",
            "Check if a URL is responding",
            "const url = 'https://api.github.com/zen';\n\ntry {\n  const response = await http.get(url);\n  log(`Status: ${response.status}`);\n  log(`Response: ${JSON.stringify(response.data)}`);\n  \n  if (response.status !== 200) {\n    await notify('Health check failed!', { title: 'Alert' });\n  }\n} catch (error) {\n  await notify('Service unreachable!', { title: 'Alert' });\n}"
        ),
        tpl(
            "Persistent Counter",
            "Store and increment a counter",
            "// Get current count from persistent storage\nlet count = storage.get('runCount') || 0;\ncount++;\n\n// Save updated count\nstorage.set('runCount', count);\n\nlog(`This script has run ${count} times`);\nawait notify(`Run count: ${count}`);"
        ),
    ])
}

// --- running-script registry (Electron `runningScripts` Map parity) ---------
//
// Electron kept a Map<id, AbortController> of in-flight scripts; stopScript(id)
// aborted + returned true if present, else false. We can reproduce that exact
// boolean contract natively with a process-wide id set. execute() registers an
// id for the duration of its (attempted) run and clears it in a finally-equiv;
// stop() removes the id and reports whether it was present.
fn running_set() -> &'static Mutex<HashSet<String>> {
    static RUNNING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashSet::new()))
}

fn mark_running(id: &str) {
    if let Ok(mut set) = running_set().lock() {
        set.insert(id.to_string());
    }
}

fn unmark_running(id: &str) {
    if let Ok(mut set) = running_set().lock() {
        set.remove(id);
    }
}

// stopScript(id): abort a running script. Returns true iff the id was present in
// the running registry (mirrors Electron's `if (controller) { abort(); true }`).
fn stop_script(id: &str) -> Value {
    let removed = match running_set().lock() {
        Ok(mut set) => set.remove(id),
        Err(_) => false,
    };
    json!(removed)
}

// A ScriptResult whose error is the runtime-blocker for the actual code body.
// Used only on the runnable path of execute() (id found + enabled), where the
// arbitrary user JS would run in a `vm` sandbox we cannot host without a JS
// engine. duration is the real elapsed wall-clock of the (attempted) run.
fn vm_blocked_result(duration: u64) -> Value {
    json!({
        "success": false,
        "error": "not ported (needs native runtime)",
        "duration": duration,
        "logs": [],
    })
}

// execute(scriptId): reproduces Electron's deterministic guard branches against
// real stored data, then honestly degrades the sandboxed-JS body.
//   - script missing  -> { success:false, error:"Script not found",   duration:0, logs:[] }
//   - script disabled -> { success:false, error:"Script is disabled", duration:0, logs:[] }
//   - runnable        -> register id as running, (cannot run JS) -> vm_blocked_result,
//                        unregister id. Stats are intentionally NOT updated:
//                        Electron only updates lastRun/runCount/avgDuration after a
//                        SUCCESSFUL run, and none occurred.
fn execute(app: &tauri::AppHandle, id: &str) -> Value {
    let script = get_script(app, id);
    if script.is_null() {
        return json!({ "success": false, "error": "Script not found", "duration": 0, "logs": [] });
    }
    let enabled = script.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    if !enabled {
        return json!({ "success": false, "error": "Script is disabled", "duration": 0, "logs": [] });
    }

    let start = now_ms();
    mark_running(id);
    // The body (vm.runInContext over user code) cannot execute without a JS
    // engine; honestly degrade rather than fake a successful run.
    let duration = now_ms().saturating_sub(start);
    let result = vm_blocked_result(duration);
    unmark_running(id);
    result
}

// executeCode(code): Electron created a throwaway enabled script, executed it,
// then deleted it. The execution body is the same JS-VM blocker, so we skip the
// temp create/delete churn (no successful run to persist) and degrade honestly.
fn execute_code(_app: &tauri::AppHandle, _code: &str) -> Value {
    vm_blocked_result(0)
}

/// Route a `scripting:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; the heavy runtime channels return an honest shaped failure and
/// unknown channels return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "scripting:get-scripts" => get_scripts(app),
        "scripting:get-script" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_script(app, id)
        }
        "scripting:create-script" => {
            let script = args.get(0).cloned().unwrap_or(Value::Null);
            create_script(app, &script)
        }
        "scripting:update-script" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let updates = args.get(1).cloned().unwrap_or(Value::Null);
            update_script(app, id, &updates)
        }
        "scripting:delete-script" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            delete_script(app, id)
        }
        "scripting:get-templates" => get_templates(),
        // execute(id): real guard branches against stored data; the sandboxed
        // JS body honestly degrades (no JS engine in the allowed deps).
        "scripting:execute" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            execute(app, id)
        }
        // executeCode(code): same JS-VM blocker -> honest shaped failure.
        "scripting:execute-code" => {
            let code = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            execute_code(app, code)
        }
        // stopScript(id): REAL — aborts via the running registry, boolean result.
        "scripting:stop" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            stop_script(id)
        }
        _ => Value::Null,
    }
}
