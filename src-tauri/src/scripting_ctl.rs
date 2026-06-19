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
// HEAVY channels NOT ported (need the native JS VM runtime + live OS/IPC APIs):
//   - scripting:execute, scripting:execute-code, scripting:stop
//   These run user code in a sandboxed `vm` context with system/http/file/
//   notification APIs — no data-tier equivalent. They return a ScriptResult
//   ({ success, error, duration, logs }) the renderer reads, so to keep the
//   `scripting:*` prefix route total we return an honest shaped failure rather
//   than faking execution. stop returns a bare boolean in Electron; here it
//   returns false (nothing is ever running on the data tier).
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

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

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
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
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

// Honest shaped failure for the heavy runtime channels (renderer reads
// .success/.error/.duration/.logs from a ScriptResult).
fn not_ported_result() -> Value {
    json!({
        "success": false,
        "error": "not ported (needs native runtime)",
        "duration": 0,
        "logs": [],
    })
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
        // Heavy runtime path — not ported (needs native JS VM + live APIs).
        "scripting:execute" | "scripting:execute-code" => not_ported_result(),
        // stopScript returns a bare boolean in Electron; nothing runs here.
        "scripting:stop" => json!(false),
        _ => Value::Null,
    }
}
