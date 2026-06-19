// =============================================================================
// DEX Tauri — Folder Rules subsystem (port of the data/read surface of
// src/main/core/FolderRulesEngine.ts).
//
// Pure-data, JSON-backed tier. The Electron engine did NOT use electron-store;
// it persisted with raw fs to `<userData>/folder-rules.json`, storing a BARE
// JSON array of FolderRule (no top-level key wrapper, pretty-printed with
// JSON.stringify(rules, null, 2)). We mirror that exactly under <appData> with
// the SAME file name. (The porting brief tagged storage as
// `electron-store:folderrules`, but the source of truth is the engine code,
// which is plain fs-json — so we follow the code.)
//
// A FolderRule is:
//   { id, name, description?, folderPath, enabled, trigger, conditions[],
//     conditionLogic, actions[], createdAt, lastRun?, runCount }
//
// Channels ported (read-only data surface):
//   - folderrules:list -> FolderRule[]
//       no arg            : all rules sorted by createdAt DESC (newest first)
//       with folderPath   : rules where r.folderPath === folderPath OR
//                           folderPath.startsWith(r.folderPath)  (NOT sorted,
//                           matching Electron's early return before the sort)
//   - folderrules:get  -> FolderRule | null   (by id; null if missing)
//
// Channels NOT ported (need a native runtime — fs walks, mutation, undo, or
// emit side-effects); routed to Value::Null so the prefix route degrades
// honestly: create, update, delete, preview, execute, testConditions,
// forFolder.
//
// DIVERGENCES (documented):
//   - createdAt sort: Electron used `b.createdAt - a.createdAt`. We compare the
//     numeric createdAt (defaulting absent to 0) the same way. Optional fields
//     (description, lastRun) are returned exactly as stored — never invented.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const RULES_FILE: &str = "folder-rules.json";

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(RULES_FILE)
}

// loadRules(): the file is a bare FolderRule[]; missing/invalid -> [].
fn load(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn folder_path_of(r: &Value) -> &str {
    r.get("folderPath").and_then(|v| v.as_str()).unwrap_or("")
}

fn created_at_of(r: &Value) -> i64 {
    r.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}

// listRules(folderPath?)
fn list_rules(app: &tauri::AppHandle, folder_path: Option<&str>) -> Value {
    let mut rules = load(app);

    if let Some(fp) = folder_path {
        // Electron early-returns the filtered (UNSORTED) set when folderPath set.
        let filtered: Vec<Value> = rules
            .into_iter()
            .filter(|r| {
                let rp = folder_path_of(r);
                rp == fp || fp.starts_with(rp)
            })
            .collect();
        return json!(filtered);
    }

    // No folderPath: sort by createdAt DESC (newest first).
    rules.sort_by(|a, b| created_at_of(b).cmp(&created_at_of(a)));
    json!(rules)
}

// getRule(id)
fn get_rule(app: &tauri::AppHandle, id: &str) -> Value {
    load(app)
        .into_iter()
        .find(|r| r.get("id").and_then(|v| v.as_str()) == Some(id))
        .unwrap_or(Value::Null)
}

/// Route a `folderrules:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// matched; the heavy/native channels return Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "folderrules:list" => {
            // Optional folderPath; treat empty string as "no filter" only if
            // absent/null — an explicit "" string is still a (non-matching)
            // filter in Electron, so preserve presence semantics.
            let folder = args.get(0).and_then(|v| v.as_str());
            list_rules(app, folder)
        }
        "folderrules:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_rule(app, id)
        }
        // Heavy / native-runtime channels — not ported.
        _ => Value::Null,
    }
}
