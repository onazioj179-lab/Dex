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

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

// Same file name the documented storage slot uses (Store name + .json).
const STORE_FILE: &str = "behavior-contracts.json";

// --- file IO ----------------------------------------------------------------

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

// getExpectedOutput(contractId, condition): contract.expectedOutputs.find(o => o.condition === condition) || null.
fn get_expected(contract_id: &str, condition: &str) -> Value {
    let contract = get_contract(contract_id);
    if contract.is_null() {
        return Value::Null;
    }
    contract
        .get("expectedOutputs")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|o| o.get("condition").and_then(|c| c.as_str()) == Some(condition))
                .cloned()
        })
        .unwrap_or(Value::Null)
}

// --- native execution state (KV-backed) -------------------------------------
// The Electron layer held executionHistory and violations in process memory
// only (Maps that start empty each launch). Porting behavior:record / :verify /
// :violations natively requires those two structures to be shared across calls,
// so they live in the native KV store under stable keys. The semantics
// (per-contract history capped at 100, FIFO violations capped at 100, the
// same deterministic-hash logic) match the source exactly.
const HISTORY_KEY: &str = "behavior:executionHistory"; // { "<contractId>": BehaviorExecution[] }
const VIOLATIONS_KEY: &str = "behavior:violations"; // DeterminismViolation[]

fn load_history_map(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    match crate::kv_get(app, HISTORY_KEY) {
        Value::Object(o) => o,
        _ => serde_json::Map::new(),
    }
}

fn load_violations(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, VIOLATIONS_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

// epoch milliseconds — Date.now() equivalent.
fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// deterministicStringify(value) — ported byte-for-byte from the TS source:
//   - null/undefined  -> "null"
//   - non-object      -> JSON.stringify(value)
//   - array           -> "[" + items.join(",") + "]"
//   - object          -> keys sorted, "{" + `"k":v` pairs joined by "," + "}"
fn deterministic_stringify(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let pairs: Vec<String> = keys
                .iter()
                .map(|k| {
                    format!(
                        "\"{}\":{}",
                        k,
                        deterministic_stringify(map.get(*k).unwrap_or(&Value::Null))
                    )
                })
                .collect();
            format!("{{{}}}", pairs.join(","))
        }
        Value::Array(arr) => {
            let items: Vec<String> = arr.iter().map(deterministic_stringify).collect();
            format!("[{}]", items.join(","))
        }
        // Numbers, strings and booleans serialize like JSON.stringify.
        other => serde_json::to_string(other).unwrap_or_else(|_| "null".to_string()),
    }
}

// hashValue(value): sha256(deterministicStringify(value)) as lowercase hex.
fn hash_value(value: &Value) -> String {
    crate::licensing::sha256_hex(deterministic_stringify(value).as_bytes())
}

// recordExecution(execution) — full native port. Computes input/output hashes,
// detects non-determinism against prior history for the same input, records a
// violation (broadcast via behavior:violation) when output diverges, appends to
// the per-contract history (FIFO cap 100), persists, and returns the full
// BehaviorExecution { contractId, input, inputHash, output, outputHash,
// timestamp, duration, deterministic }.
fn record_execution(app: &tauri::AppHandle, execution: &Value) -> Value {
    let contract_id = execution
        .get("contractId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let input = execution.get("input").cloned().unwrap_or(Value::Null);
    let output = execution.get("output").cloned().unwrap_or(Value::Null);
    let timestamp = execution
        .get("timestamp")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(now_millis);
    let duration = execution
        .get("duration")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let input_hash = hash_value(&input);
    let output_hash = hash_value(&output);

    let mut history_map = load_history_map(app);
    let mut history: Vec<Value> = history_map
        .get(&contract_id)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // previousExecution = history.find(e => e.inputHash === inputHash)
    let previous = history
        .iter()
        .find(|e| e.get("inputHash").and_then(|v| v.as_str()) == Some(input_hash.as_str()))
        .cloned();

    let prev_output_hash = previous
        .as_ref()
        .and_then(|e| e.get("outputHash").and_then(|v| v.as_str()))
        .map(|s| s.to_string());

    let deterministic = match &prev_output_hash {
        None => true,
        Some(prev) => prev == &output_hash,
    };

    let full_execution = json!({
        "contractId": contract_id,
        "input": input,
        "inputHash": input_hash,
        "output": output,
        "outputHash": output_hash,
        "timestamp": timestamp,
        "duration": duration,
        "deterministic": deterministic
    });

    // Record + broadcast a violation when a known input produced a new output.
    if !deterministic {
        if let Some(prev) = &prev_output_hash {
            let violation = json!({
                "contractId": contract_id,
                "input": input,
                "inputHash": input_hash,
                "expectedOutputHash": prev,
                "actualOutputHash": output_hash,
                "timestamp": now_millis()
            });
            let mut violations = load_violations(app);
            violations.push(violation.clone());
            while violations.len() > 100 {
                violations.remove(0);
            }
            crate::kv_set(app, VIOLATIONS_KEY, Value::Array(violations));
            // webContents.send('behavior:violation', violation) equivalent.
            crate::native_ops::emit_event(app, "behavior:violation", &violation);
        }
    }

    // history.push(fullExecution); cap at 100 (FIFO).
    history.push(full_execution.clone());
    while history.len() > 100 {
        history.remove(0);
    }
    history_map.insert(contract_id, Value::Array(history));
    crate::kv_set(app, HISTORY_KEY, Value::Object(history_map));

    full_execution
}

// verifyDeterminism(contractId, input, output): { deterministic, reason }.
fn verify_determinism(
    app: &tauri::AppHandle,
    contract_id: &str,
    input: &Value,
    output: &Value,
) -> Value {
    let input_hash = hash_value(input);
    let output_hash = hash_value(output);

    let history_map = load_history_map(app);
    let history: Vec<Value> = history_map
        .get(contract_id)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let previous = history
        .iter()
        .find(|e| e.get("inputHash").and_then(|v| v.as_str()) == Some(input_hash.as_str()));

    match previous {
        None => json!({ "deterministic": true, "reason": "First execution with this input" }),
        Some(prev) => {
            let prev_hash = prev
                .get("outputHash")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if prev_hash == output_hash {
                json!({ "deterministic": true, "reason": "Output matches previous execution" })
            } else {
                // `expected ${prev.slice(0,8)}, got ${out.slice(0,8)}`
                let exp: String = prev_hash.chars().take(8).collect();
                let got: String = output_hash.chars().take(8).collect();
                json!({
                    "deterministic": false,
                    "reason": format!("Output changed: expected {}, got {}", exp, got)
                })
            }
        }
    }
}

// getExecutionHistory(contractId): [...(executionHistory.get(contractId) || [])].
// Reads the native KV-backed history (populated by behavior:record). Falls back
// to the legacy optional file slot for forward-compatibility, otherwise [].
fn get_history(app: &tauri::AppHandle, contract_id: &str) -> Value {
    if let Value::Object(map) = crate::kv_get(app, HISTORY_KEY) {
        if let Some(arr) = map.get(contract_id).and_then(|v| v.as_array()) {
            return Value::Array(arr.clone());
        }
    }
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
        // record(execution): hashes input/output, detects + broadcasts determinism
        // violations, appends to the per-contract history -> full BehaviorExecution.
        "behavior:record" => {
            let execution = args.get(0).cloned().unwrap_or(Value::Null);
            record_execution(app, &execution)
        }
        // verify(contractId, input, output): { deterministic, reason }.
        "behavior:verify" => {
            let contract_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let input = args.get(1).cloned().unwrap_or(Value::Null);
            let output = args.get(2).cloned().unwrap_or(Value::Null);
            verify_determinism(app, contract_id, &input, &output)
        }
        // violations(): DeterminismViolation[] (FIFO-capped at 100).
        "behavior:violations" => Value::Array(load_violations(app)),
        // expected(contractId, condition): ExpectedOutput | null.
        "behavior:expected" => {
            let contract_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let condition = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            get_expected(contract_id, condition)
        }
        _ => Value::Null,
    }
}
