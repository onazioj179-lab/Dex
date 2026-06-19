// =============================================================================
// DEX Tauri — Behavior subsystem (data tier) — port of the read-only `behavior:*`
// IPC handlers in src/main/core/BehaviorPredictabilityLayer.ts.
//
// SCOPE: only the three DATA channels are ported here:
//   - behavior:contract  (id)          -> BehaviorContract | null
//   - behavior:contracts ()            -> BehaviorContract[]
//   - behavior:history   (contractId)  -> BehaviorExecution[]
//
// The Electron layer is a singleton built around three in-memory Maps
// (contracts / executionHistory / violations). The seven behavior contracts are
// HARDCODED constants compiled into the source (BEHAVIOR_CONTRACTS) — they are
// never read from or written to disk. They are reproduced here byte-for-byte as
// a static JSON table so behavior:contract / behavior:contracts return the exact
// same shapes the renderer expects.
//
// STORAGE (fs-json:behavior-contracts.json): the Electron source persists NOTHING
// — contracts are constants and executionHistory lives only in process memory,
// populated solely by behavior:record (a HEAVY channel, NOT ported — it needs the
// native sha256 hashing / determinism engine). To keep the documented storage
// slot honest and forward-compatible, behavior:history reads the optional
//   { "history": { "<contractId>": BehaviorExecution[] } }
// map from <appData>/behavior-contracts.json if it exists; with record un-ported
// nothing writes that file, so history degrades to [] exactly as a fresh Electron
// process would (empty Map => []). No fake data is synthesized.
//
// RETURN SHAPES (matched exactly to BehaviorPredictabilityLayer.ts):
//   getContract(id)            -> the contract object, or null (Map.get || null).
//   getAllContracts()          -> Array.from(contracts.values()) — insertion order
//                                 = BEHAVIOR_CONTRACTS source order.
//   getExecutionHistory(id)    -> [...(executionHistory.get(id) || [])] => [].
//
// A BehaviorContract is:
//   { id, name, description, inputSchema:{type,properties,examples},
//     expectedOutputs:[{condition,output,description}], sideEffects:string[],
//     invariants:string[], locked:boolean }
// A BehaviorExecution is:
//   { contractId, input, inputHash, output, outputHash, timestamp, duration,
//     deterministic }
//
// DIVERGENCES (documented):
//   1. Contracts are emitted from a static table rather than a stored file — this
//      mirrors the Electron source, where they are compiled-in constants. The
//      JSON values (including the boolean `locked: true`, the example objects and
//      the nested expectedOutputs) match the TS literals exactly.
//   2. behavior:record / :verify / :violations / :expected are NOT ported (heavy
//      native runtime: deterministic stringify + sha256 hashing, violation
//      broadcasting). With :record absent, executionHistory is never populated,
//      so behavior:history is correctly empty — identical to a just-started
//      Electron process before any execution is recorded.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

// Same file name the documented storage slot uses (Store name + .json).
const STORE_FILE: &str = "behavior-contracts.json";

// --- file IO ----------------------------------------------------------------

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

// --- locked behavior contracts ----------------------------------------------
// Reproduced exactly from BEHAVIOR_CONTRACTS in BehaviorPredictabilityLayer.ts,
// in the same source order (which is the Map insertion order returned by
// getAllContracts()).
fn behavior_contracts() -> Value {
    json!([
        {
            "id": "search-files",
            "name": "File Search",
            "description": "Search for files by query returns consistent results",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "required": true },
                    "path": { "type": "string" },
                    "limit": { "type": "number" }
                },
                "examples": [{ "query": "test", "limit": 10 }]
            },
            "expectedOutputs": [
                { "condition": "query is empty", "output": [], "description": "Empty query returns empty array" },
                { "condition": "query matches nothing", "output": [], "description": "No matches returns empty array" }
            ],
            "sideEffects": [],
            "invariants": [
                "Results are sorted by relevance",
                "Same query always returns same order",
                "Results include only accessible files"
            ],
            "locked": true
        },
        {
            "id": "navigate-page",
            "name": "Page Navigation",
            "description": "Navigate to page updates view consistently",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "page": { "type": "string", "required": true },
                    "params": { "type": "object" }
                },
                "examples": [{ "page": "files" }, { "page": "actions", "params": { "id": "123" } }]
            },
            "expectedOutputs": [
                { "condition": "page exists", "output": { "success": true }, "description": "Valid page navigates successfully" },
                { "condition": "page does not exist", "output": { "success": false, "error": "Page not found" }, "description": "Invalid page returns error" }
            ],
            "sideEffects": ["Updates current view", "Updates URL/history"],
            "invariants": [
                "Back button returns to previous page",
                "Page state is preserved during session",
                "Same page never shows different layout"
            ],
            "locked": true
        },
        {
            "id": "file-create",
            "name": "File Creation",
            "description": "Creating a file produces consistent result",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "required": true },
                    "path": { "type": "string", "required": true },
                    "content": { "type": "string" }
                },
                "examples": [{ "name": "test.txt", "path": "/documents", "content": "hello" }]
            },
            "expectedOutputs": [
                { "condition": "path is valid and writable", "output": { "success": true }, "description": "File created successfully" },
                { "condition": "file already exists", "output": { "success": false, "error": "File exists" }, "description": "Duplicate name fails" },
                { "condition": "path is invalid", "output": { "success": false, "error": "Invalid path" }, "description": "Invalid path fails" }
            ],
            "sideEffects": ["Creates file on disk", "Updates file index"],
            "invariants": [
                "File appears in list immediately",
                "File content matches input",
                "Undo restores previous state"
            ],
            "locked": true
        },
        {
            "id": "action-execute",
            "name": "Action Execution",
            "description": "Executing an action produces predictable result",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "actionId": { "type": "string", "required": true },
                    "input": { "type": "object" }
                },
                "examples": [{ "actionId": "open-file", "input": { "path": "/test.txt" } }]
            },
            "expectedOutputs": [
                { "condition": "action exists and valid input", "output": { "success": true }, "description": "Action executes" },
                { "condition": "action does not exist", "output": { "success": false, "error": "Action not found" }, "description": "Invalid action fails" },
                { "condition": "invalid input", "output": { "success": false, "error": "Invalid input" }, "description": "Bad input fails" }
            ],
            "sideEffects": ["Depends on action type"],
            "invariants": [
                "Same action with same input produces same result",
                "Failed actions have no side effects",
                "Action state is reflected immediately"
            ],
            "locked": true
        },
        {
            "id": "keyboard-shortcut",
            "name": "Keyboard Shortcuts",
            "description": "Shortcuts always trigger the same action",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "keys": { "type": "string", "required": true },
                    "context": { "type": "string" }
                },
                "examples": [{ "keys": "Ctrl+S" }, { "keys": "Ctrl+K", "context": "editor" }]
            },
            "expectedOutputs": [
                { "condition": "shortcut is bound", "output": { "triggered": true }, "description": "Shortcut triggers action" },
                { "condition": "shortcut is not bound", "output": { "triggered": false }, "description": "Unbound shortcut does nothing" }
            ],
            "sideEffects": ["Triggers bound action"],
            "invariants": [
                "Same key combo always triggers same action",
                "Context-specific shortcuts only work in context",
                "Shortcuts never conflict"
            ],
            "locked": true
        },
        {
            "id": "drag-drop",
            "name": "Drag and Drop",
            "description": "Drag operations have predictable outcomes",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "source": { "type": "string", "required": true },
                    "target": { "type": "string", "required": true },
                    "items": { "type": "array", "required": true }
                },
                "examples": [{ "source": "files", "target": "folder", "items": ["file1.txt"] }]
            },
            "expectedOutputs": [
                { "condition": "valid drop target", "output": { "success": true }, "description": "Drop succeeds" },
                { "condition": "invalid drop target", "output": { "success": false }, "description": "Invalid target rejects" }
            ],
            "sideEffects": ["Moves/copies items"],
            "invariants": [
                "Drop indicators show valid targets",
                "Items appear in target immediately",
                "Source updates immediately"
            ],
            "locked": true
        },
        {
            "id": "setting-change",
            "name": "Settings Changes",
            "description": "Changing settings applies consistently",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "key": { "type": "string", "required": true },
                    "value": { "type": "any", "required": true }
                },
                "examples": [{ "key": "theme", "value": "dark" }]
            },
            "expectedOutputs": [
                { "condition": "valid setting and value", "output": { "success": true }, "description": "Setting applied" },
                { "condition": "invalid setting", "output": { "success": false, "error": "Unknown setting" }, "description": "Invalid key fails" },
                { "condition": "invalid value", "output": { "success": false, "error": "Invalid value" }, "description": "Invalid value fails" }
            ],
            "sideEffects": ["Persists setting", "May update UI"],
            "invariants": [
                "Setting persists across restarts",
                "UI reflects setting immediately",
                "Related settings update together"
            ],
            "locked": true
        }
    ])
}

// getContract(id): contracts.get(id) || null.
fn get_contract(id: &str) -> Value {
    behavior_contracts()
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|c| c.get("id").and_then(|v| v.as_str()) == Some(id))
                .cloned()
        })
        .unwrap_or(Value::Null)
}

// getExecutionHistory(contractId): [...(executionHistory.get(contractId) || [])].
// executionHistory is only ever populated by behavior:record, which is not ported,
// so this reads the optional persisted map and otherwise yields []. No synthesis.
fn get_history(app: &tauri::AppHandle, contract_id: &str) -> Value {
    let arr = read_file(app, STORE_FILE)
        .get("history")
        .and_then(|h| h.get(contract_id))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Value::Array(arr)
}

/// Route a `behavior:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; the
/// heavy/native channels (record / verify / violations / expected) are honestly
/// degraded to Value::Null (not faked), and unknown ones likewise return null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "behavior:contract" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_contract(id)
        }
        "behavior:contracts" => behavior_contracts(),
        "behavior:history" => {
            let contract_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_history(app, contract_id)
        }
        // Heavy channels — NOT ported (need the native sha256 determinism engine).
        // Honest degrade to null rather than fabricated data.
        "behavior:record" | "behavior:verify" | "behavior:violations" | "behavior:expected" => {
            Value::Null
        }
        _ => Value::Null,
    }
}
