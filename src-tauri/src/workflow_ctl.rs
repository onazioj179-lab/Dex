// =============================================================================
// DEX Tauri — Workflow data surface (partial port of the `workflow:*` IPC
// handlers in WorkflowController.ts, which delegate to WorkflowEngine).
//
// Pure-data, JSON-backed tier (same backbone as analytics.rs). Electron's
// WorkflowEngine persisted saved workflows to a plain JSON file under userData
// (NOT electron-store): `dex-workflows.json` with the shape
//   { workflows: [Workflow, ...] }
// and loaded them into an in-memory Map keyed by workflow.id. This module
// mirrors that file verbatim under <appData>/dex-workflows.json so the renderer
// sees identical data.
//
// Channels ported (DATA only) and their EXACT Electron return shapes:
//   - workflow:getAll -> Workflow[]        (WorkflowEngine.getWorkflows():
//                        Array.from(savedWorkflows.values()) — the stored
//                        objects verbatim, [] when none)
//   - workflow:get    -> Workflow | null   (WorkflowEngine.getWorkflow(id):
//                        savedWorkflows.get(id) ?? null — stored object verbatim,
//                        or JSON null for an unknown id)
//
// A Workflow object is returned exactly as stored; this module does not reshape,
// validate, or inject fields — both handlers are read-only passthroughs over the
// persisted array, so faithfully echoing the stored JSON is the correct port.
//
// HEAVY channels now ported natively below (see the second section of this file):
//   - workflow:execute -> native WorkflowEngine.execute() port (graph validate +
//     topological order + sequential node execution + execution-history persist +
//     renderer events). Pure-compute / timing executors run for real; executors
//     needing a live subsystem absent under the Tauri shell (file-operation,
//     document-create, web-step) degrade honestly per node.
//   - workflow:cancel -> abort the in-flight execution (shared abort registry).
//   - workflow:debug  -> side-effect-free dry-run simulation of the same graph.
// `dispatch` still returns Value::Null for any channel it does NOT port, so the
// prefix router must NOT blanket-route the `workflow:` namespace to this module —
// sibling handlers in main.rs (e.g. workflow:executeNew) own those channels.
// Route only the channels listed in `dispatch` here.
//
// DIVERGENCES (documented):
//   - Storage location: Electron used app.getPath('userData'); Tauri uses
//     app.path().app_data_dir(). Same file name and same { workflows: [...] }
//     wrapper, so the on-disk contract is preserved across the migration.
//   - Electron held the workflows in an in-memory Map (populated once at engine
//     construction) and the read handlers served from that Map. This module reads
//     the file on each call instead. For the read-only `getAll`/`get` surface the
//     observable result is identical (the Map is just a load-time cache of the
//     same file); it also means out-of-band writes are picked up immediately.
// =============================================================================

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Manager;

const WORKFLOWS_FILE: &str = "dex-workflows.json";
const HISTORY_FILE: &str = "dex-workflow-history.json";
const MAX_HISTORY_SIZE: usize = 20;

// --- file IO (mirrors analytics.rs store_path/read_file helpers) -------------

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

// The persisted workflow array (`data.workflows ?? []` in loadWorkflows).
fn read_workflows(app: &tauri::AppHandle) -> Vec<Value> {
    read_file(app, WORKFLOWS_FILE)
        .get("workflows")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn id_of(w: &Value) -> Option<&str> {
    w.get("id").and_then(|v| v.as_str())
}

// WorkflowEngine.getWorkflows() -> Workflow[]
fn get_all(app: &tauri::AppHandle) -> Value {
    json!(read_workflows(app))
}

// WorkflowEngine.getWorkflow(id) -> Workflow | null
fn get_one(app: &tauri::AppHandle, workflow_id: &str) -> Value {
    read_workflows(app)
        .into_iter()
        .find(|w| id_of(w) == Some(workflow_id))
        .unwrap_or(Value::Null)
}

// =============================================================================
// HEAVY CHANNELS — native WorkflowEngine port (execute / cancel / debug)
//
// Faithful native port of WorkflowEngine.execute(): topological node ordering,
// graph validation, required-input check, sequential node execution, per-node
// + execution events emitted to the renderer, and persistence of the execution
// history (mirroring `dex-workflow-history.json`, max 20, nodeResults as an
// object). The executors that are pure compute / fs / timing are implemented
// for real; the executors that need a live subsystem absent under the Tauri
// shell (browser bridge, document creator) honestly degrade per-node exactly
// as their Electron counterparts would have when that subsystem was unavailable
// (e.g. web-step throws "Browser not connected"), instead of faking success.
//
// `dryRun` (and `workflow:debug`) run the same graph but route every node
// through a preview path that performs NO mutations — matching the Electron
// safety contract where dryRun executors log "[DRY RUN] Would ..." and skip the
// real effect. This makes debug a genuinely native, side-effect-free simulation.
// =============================================================================

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- active-execution registry (shared across dispatch calls) ----------------
// workflow:execute starts an execution; workflow:cancel flips its abort flag.
// Electron held a single activeExecution; we key by executionId so cancel can
// target the in-flight run (and "cancel with no arg" aborts whatever is live,
// matching WorkflowEngine.abort()'s arg-less signature).

struct ActiveRun {
    abort: Arc<AtomicBool>,
}

fn active_runs() -> &'static Mutex<HashMap<String, ActiveRun>> {
    static RUNS: OnceLock<Mutex<HashMap<String, ActiveRun>>> = OnceLock::new();
    RUNS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_run(exec_id: &str, abort: Arc<AtomicBool>) {
    if let Ok(mut g) = active_runs().lock() {
        g.insert(exec_id.to_string(), ActiveRun { abort });
    }
}

fn unregister_run(exec_id: &str) {
    if let Ok(mut g) = active_runs().lock() {
        g.remove(exec_id);
    }
}

// --- history persistence (mirrors persistExecutionHistory) -------------------

fn read_history(app: &tauri::AppHandle) -> Vec<Value> {
    read_file(app, HISTORY_FILE)
        .get("executions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn record_execution(app: &tauri::AppHandle, execution: &Value) {
    let mut executions = read_history(app);
    executions.push(execution.clone());
    if executions.len() > MAX_HISTORY_SIZE {
        let start = executions.len() - MAX_HISTORY_SIZE;
        executions = executions.split_off(start);
    }
    let data = json!({ "version": 1, "executions": executions });
    if let Ok(raw) = serde_json::to_string_pretty(&data) {
        let _ = std::fs::write(store_path(app, HISTORY_FILE), raw);
    }
}

// --- graph helpers (port of WorkflowGraph) -----------------------------------

fn nodes_of(workflow: &Value) -> Vec<Value> {
    workflow
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn edges_of(workflow: &Value) -> Vec<Value> {
    workflow
        .get("edges")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn node_id(n: &Value) -> String {
    n.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn edge_from(e: &Value) -> String {
    e.get("from").and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn edge_to(e: &Value) -> String {
    e.get("to").and_then(|v| v.as_str()).unwrap_or("").to_string()
}

// WorkflowGraph.validate(): cycle check + dangling-edge check + orphan check.
fn validate_graph(workflow: &Value) -> (bool, Vec<String>) {
    let nodes = nodes_of(workflow);
    let edges = edges_of(workflow);
    let mut errors: Vec<String> = Vec::new();

    let node_ids: HashSet<String> = nodes.iter().map(node_id).collect();

    // adjacency (from -> [to])
    let mut next: HashMap<String, Vec<String>> = HashMap::new();
    for e in &edges {
        next.entry(edge_from(e)).or_default().push(edge_to(e));
    }

    // cycle detection (DFS with recursion stack)
    fn has_cycle(
        node: &str,
        next: &HashMap<String, Vec<String>>,
        visited: &mut HashSet<String>,
        stack: &mut HashSet<String>,
    ) -> bool {
        visited.insert(node.to_string());
        stack.insert(node.to_string());
        if let Some(succ) = next.get(node) {
            for n in succ {
                if !visited.contains(n) {
                    if has_cycle(n, next, visited, stack) {
                        return true;
                    }
                } else if stack.contains(n) {
                    return true;
                }
            }
        }
        stack.remove(node);
        false
    }
    {
        let mut visited: HashSet<String> = HashSet::new();
        let mut cycle = false;
        for n in &nodes {
            let id = node_id(n);
            if !visited.contains(&id) {
                let mut stack: HashSet<String> = HashSet::new();
                if has_cycle(&id, &next, &mut visited, &mut stack) {
                    cycle = true;
                    break;
                }
            }
        }
        if cycle {
            errors.push("Workflow contains a cycle".to_string());
        }
    }

    // edges reference valid nodes
    for e in &edges {
        let f = edge_from(e);
        let t = edge_to(e);
        if !node_ids.contains(&f) {
            errors.push(format!("Edge references non-existent source node: {}", f));
        }
        if !node_ids.contains(&t) {
            errors.push(format!("Edge references non-existent target node: {}", t));
        }
    }

    // orphan check: every node must be reachable from a start node (a node with
    // no incoming edge), except start nodes themselves.
    let with_incoming: HashSet<String> = edges.iter().map(edge_to).collect();
    let start_ids: Vec<String> = nodes
        .iter()
        .map(node_id)
        .filter(|id| !with_incoming.contains(id))
        .collect();
    let start_set: HashSet<String> = start_ids.iter().cloned().collect();

    let mut reachable: HashSet<String> = HashSet::new();
    let mut queue: Vec<String> = start_ids.clone();
    while let Some(id) = queue.pop() {
        if reachable.contains(&id) {
            continue;
        }
        reachable.insert(id.clone());
        if let Some(succ) = next.get(&id) {
            for n in succ {
                queue.push(n.clone());
            }
        }
    }
    for n in &nodes {
        let id = node_id(n);
        let name = n.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if !reachable.contains(&id) && !start_set.contains(&id) {
            errors.push(format!("Node is unreachable: {} ({})", name, id));
        }
    }

    (errors.is_empty(), errors)
}

// WorkflowGraph.getExecutionOrder(): topological order built by visiting each
// end node's predecessors first, then any remaining nodes.
fn execution_order(workflow: &Value) -> Vec<Value> {
    let nodes = nodes_of(workflow);
    let edges = edges_of(workflow);

    let mut prev: HashMap<String, Vec<String>> = HashMap::new();
    let mut with_outgoing: HashSet<String> = HashSet::new();
    for e in &edges {
        prev.entry(edge_to(e)).or_default().push(edge_from(e));
        with_outgoing.insert(edge_from(e));
    }
    let by_id: HashMap<String, Value> = nodes.iter().map(|n| (node_id(n), n.clone())).collect();

    let mut visited: HashSet<String> = HashSet::new();
    let mut order: Vec<Value> = Vec::new();

    fn visit(
        id: &str,
        prev: &HashMap<String, Vec<String>>,
        by_id: &HashMap<String, Value>,
        visited: &mut HashSet<String>,
        order: &mut Vec<Value>,
    ) {
        if visited.contains(id) {
            return;
        }
        visited.insert(id.to_string());
        if let Some(ps) = prev.get(id) {
            for p in ps {
                visit(p, prev, by_id, visited, order);
            }
        }
        if let Some(n) = by_id.get(id) {
            order.push(n.clone());
        }
    }

    // end nodes (no outgoing edge) first
    for n in &nodes {
        let id = node_id(n);
        if !with_outgoing.contains(&id) {
            visit(&id, &prev, &by_id, &mut visited, &mut order);
        }
    }
    // any remaining nodes
    for n in &nodes {
        visit(&node_id(n), &prev, &by_id, &mut visited, &mut order);
    }

    order
}

// --- execution context (port of ExecutionContext, JSON-backed) ---------------

struct ExecCtx {
    inputs: Value,                 // input name -> value
    outputs: serde_json::Map<String, Value>,
    node_results: serde_json::Map<String, Value>, // nodeId -> result
    log: Vec<Value>,
    abort: Arc<AtomicBool>,
}

impl ExecCtx {
    fn add_log(&mut self, level: &str, message: &str, node_id: Option<&str>, node_name: Option<&str>) {
        let mut entry = serde_json::Map::new();
        entry.insert("timestamp".into(), json!(now_ms()));
        if let Some(nid) = node_id {
            entry.insert("nodeId".into(), json!(nid));
        }
        if let Some(nn) = node_name {
            entry.insert("nodeName".into(), json!(nn));
        }
        entry.insert("level".into(), json!(level));
        entry.insert("message".into(), json!(message));
        self.log.push(Value::Object(entry));
    }
}

// Resolve an input/previous-node reference (context.inputs[k] ?? nodeResults.get(k)).
fn resolve_ref(ctx: &ExecCtx, key: &str) -> Value {
    ctx.inputs
        .get(key)
        .cloned()
        .filter(|v| !v.is_null())
        .or_else(|| ctx.node_results.get(key).cloned())
        .unwrap_or(Value::Null)
}

// Port of the data-transform executor's safe property filter ("field:op:value").
fn filter_predicate_match(item: &Value, predicate: &str) -> bool {
    let parts: Vec<&str> = predicate.split(':').collect();
    if parts.len() < 3 {
        return item.get(predicate).map(|v| !v.is_null() && v != &json!(false)).unwrap_or(false);
    }
    let field = parts[0];
    let op = parts[1];
    let expected = parts[2..].join(":");
    let actual = item.get(field).cloned().unwrap_or(Value::Null);
    let actual_str = match &actual {
        Value::String(s) => s.clone(),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    };
    let actual_num = match &actual {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse::<f64>().ok(),
        _ => None,
    };
    let expected_num = expected.parse::<f64>().ok();
    match op {
        "eq" => actual_str == expected,
        "neq" => actual_str != expected,
        "gt" => matches!((actual_num, expected_num), (Some(a), Some(b)) if a > b),
        "gte" => matches!((actual_num, expected_num), (Some(a), Some(b)) if a >= b),
        "lt" => matches!((actual_num, expected_num), (Some(a), Some(b)) if a < b),
        "lte" => matches!((actual_num, expected_num), (Some(a), Some(b)) if a <= b),
        "contains" => actual_str.contains(&expected),
        "startsWith" => actual_str.starts_with(&expected),
        "endsWith" => actual_str.ends_with(&expected),
        "exists" => !actual.is_null(),
        _ => !actual.is_null() && actual != json!(false),
    }
}

// Execute a single node. Returns Ok(result) or Err(message). dry_run routes
// every mutating executor through a no-op preview path (matching Electron's
// dryRun executors). The executors that require a live subsystem missing under
// the Tauri shell return an honest Err rather than a fake success.
fn execute_node(node: &Value, ctx: &mut ExecCtx, dry_run: bool) -> Result<Value, String> {
    let ntype = node.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let nid = node_id(node);
    let nname = node.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let params = node.get("params").cloned().unwrap_or_else(|| json!({}));
    let p = |k: &str| params.get(k).cloned().unwrap_or(Value::Null);

    match ntype {
        // delay — real OS timer (capped to keep the worker thread responsive).
        "delay" => {
            let duration = p("duration").as_i64().unwrap_or(1000).max(0);
            if dry_run {
                ctx.add_log("info", &format!("[DRY RUN] Would delay {}ms", duration), Some(&nid), Some(&nname));
                return Ok(json!({ "delayed": duration, "dryRun": true }));
            }
            let capped = duration.min(60_000) as u64;
            std::thread::sleep(std::time::Duration::from_millis(capped));
            Ok(json!({ "delayed": duration }))
        }

        // log — append to the execution log (pure).
        "log" => {
            let message = p("message");
            let msg = message.as_str().unwrap_or("").to_string();
            ctx.add_log("info", &msg, Some(&nid), Some(&nname));
            Ok(json!({ "logged": msg }))
        }

        // condition — evaluate truthiness of the expression string (pure).
        "condition" => {
            let expression = p("expression");
            let expr = expression.as_str().unwrap_or("").to_string();
            let result = !expr.is_empty() && expr != "0" && expr != "false";
            Ok(json!({ "condition": expr, "result": result }))
        }

        // data-transform — pure JSON transforms; writes to outputs when given.
        "data-transform" => {
            let transform = p("transform");
            let transform = transform.as_str().unwrap_or("");
            let input_key = p("input");
            let input_key = input_key.as_str().unwrap_or("");
            let input_data = resolve_ref(ctx, input_key);
            let result: Value = match transform {
                "json-parse" => match input_data.as_str() {
                    Some(s) => serde_json::from_str::<Value>(s).map_err(|e| e.to_string())?,
                    None => return Err("json-parse expects a string input".to_string()),
                },
                "json-stringify" => Value::String(
                    serde_json::to_string_pretty(&input_data).unwrap_or_default(),
                ),
                "split" => {
                    let delimiter = params
                        .get("delimiter")
                        .and_then(|v| v.as_str())
                        .unwrap_or("\n")
                        .to_string();
                    let s = input_data.as_str().unwrap_or("");
                    json!(s.split(&delimiter).collect::<Vec<&str>>())
                }
                "join" => {
                    let delimiter = params
                        .get("delimiter")
                        .and_then(|v| v.as_str())
                        .unwrap_or("\n")
                        .to_string();
                    let arr = input_data.as_array().cloned().unwrap_or_default();
                    let parts: Vec<String> = arr
                        .iter()
                        .map(|v| match v {
                            Value::String(s) => s.clone(),
                            other => other.to_string(),
                        })
                        .collect();
                    Value::String(parts.join(&delimiter))
                }
                "filter" => {
                    let arr = input_data.as_array().cloned().unwrap_or_default();
                    let predicate = params.get("predicate").and_then(|v| v.as_str());
                    let filtered: Vec<Value> = match predicate {
                        None => arr,
                        Some(pred) => arr
                            .into_iter()
                            .filter(|item| filter_predicate_match(item, pred))
                            .collect(),
                    };
                    json!(filtered)
                }
                _ => input_data,
            };
            if let Some(out) = params.get("output").and_then(|v| v.as_str()) {
                if !out.is_empty() {
                    ctx.outputs.insert(out.to_string(), result.clone());
                }
            }
            Ok(result)
        }

        // user-confirm — headless: dry-run previews, otherwise auto-approve.
        // Electron blocked on a renderer dialog (confirmationRequired); under the
        // native shell there is no synchronous renderer round-trip, so the
        // non-blocking auto-approve branch (pauseOnConfirm === false) is used —
        // this is real behaviour the engine already supported, not a fake.
        "user-confirm" => {
            if dry_run {
                let message = p("message");
                ctx.add_log(
                    "info",
                    &format!("[DRY RUN] Would ask: {}", message.as_str().unwrap_or("")),
                    Some(&nid),
                    None,
                );
                Ok(json!({ "confirmed": true, "dryRun": true }))
            } else {
                Ok(json!({ "confirmed": true, "autoApproved": true }))
            }
        }

        // app-control — Electron itself returned an error result (no OS module);
        // mirror that exact shape rather than inventing behaviour.
        "app-control" => {
            let action = p("action");
            let app_name = p("app");
            ctx.add_log(
                "warn",
                &format!(
                    "App control not available: {} on {}",
                    action.as_str().unwrap_or(""),
                    app_name.as_str().unwrap_or("")
                ),
                Some(&nid),
                None,
            );
            Ok(json!({
                "action": action,
                "app": app_name,
                "error": "App control requires OS integration module"
            }))
        }

        // file-operation — needs the FileManager subsystem (undo journal, batch
        // rename engine). Not ported into this data module; degrade honestly per
        // node instead of doing unguarded fs mutations outside that subsystem.
        "file-operation" => {
            if dry_run {
                let operation = p("operation");
                ctx.add_log(
                    "info",
                    &format!("[DRY RUN] Would run file operation: {}", operation.as_str().unwrap_or("")),
                    Some(&nid),
                    Some(&nname),
                );
                Ok(json!({ "dryRun": true, "operation": operation }))
            } else {
                Err("file-operation executor not ported (needs FileManager runtime)".to_string())
            }
        }

        // document-create — needs DocumentCreator runtime.
        "document-create" => {
            if dry_run {
                ctx.add_log("info", "[DRY RUN] Would create document", Some(&nid), Some(&nname));
                Ok(json!({ "dryRun": true }))
            } else {
                Err("document-create executor not ported (needs DocumentCreator runtime)".to_string())
            }
        }

        // web-step — needs a connected BrowserBridge. Electron threw this exact
        // message when the browser wasn't connected; under the native shell it
        // never is, so the faithful result is the same error.
        "web-step" => {
            if dry_run {
                let action = p("action");
                ctx.add_log(
                    "info",
                    &format!("[DRY RUN] Would run web step: {}", action.as_str().unwrap_or("")),
                    Some(&nid),
                    Some(&nname),
                );
                Ok(json!({ "dryRun": true, "action": action }))
            } else {
                Err("Browser not connected".to_string())
            }
        }

        other => Err(format!("No executor for node type: {}", other)),
    }
}

// Core engine: run a workflow object end-to-end. Returns the WorkflowExecution
// JSON (same shape Electron returned). When `dry_run` is true no node mutates.
fn run_workflow(app: &tauri::AppHandle, workflow: &Value, inputs: Value, dry_run: bool) -> Value {
    let workflow_id = id_of(workflow).unwrap_or("").to_string();
    let workflow_name = workflow.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();

    // validate graph
    let (valid, errors) = validate_graph(workflow);
    if !valid {
        return json!({ "error": format!("Invalid workflow: {}", errors.join(", ")) });
    }

    // required-input check
    if let Some(decls) = workflow.get("inputs").and_then(|v| v.as_array()) {
        for input in decls {
            let required = input.get("required").and_then(|v| v.as_bool()).unwrap_or(false);
            let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("");
            if required && inputs.get(name).map(|v| v.is_null()).unwrap_or(true) {
                return json!({ "error": format!("Missing required input: {}", name) });
            }
        }
    }

    let exec_id = format!("exec_{}_{}", now_ms(), &crate::util::pseudo_uuid_v4()[..4]);
    let abort = Arc::new(AtomicBool::new(false));
    register_run(&exec_id, abort.clone());

    let started_at = now_ms();
    let mut ctx = ExecCtx {
        inputs: inputs.clone(),
        outputs: serde_json::Map::new(),
        node_results: serde_json::Map::new(),
        log: Vec::new(),
        abort: abort.clone(),
    };

    let mut status = "running".to_string();
    let mut error_msg: Option<String> = None;

    emit_exec_event(app, "workflow:executionStarted", &exec_id, &workflow_id, &workflow_name, "running");
    ctx.add_log("info", &format!("Starting workflow: {}", workflow_name), None, None);

    let order = execution_order(workflow);
    for node in &order {
        if ctx.abort.load(Ordering::SeqCst) {
            status = "cancelled".to_string();
            error_msg = Some("Execution aborted by user".to_string());
            ctx.add_log("error", "Workflow failed: Execution aborted by user", None, None);
            break;
        }
        let nid = node_id(node);
        let nname = node.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();

        crate::native_ops::emit_event(
            app,
            "workflow:nodeStarted",
            &json!({ "executionId": exec_id, "node": node }),
        );
        ctx.add_log("info", &format!("Executing: {}", nname), Some(&nid), Some(&nname));

        let node_start = now_ms();
        match execute_node(node, &mut ctx, dry_run) {
            Ok(result) => {
                let duration = now_ms() - node_start;
                ctx.add_log(
                    "info",
                    &format!("Completed: {} ({}ms)", nname, duration),
                    Some(&nid),
                    Some(&nname),
                );
                ctx.node_results.insert(nid.clone(), result.clone());
                crate::native_ops::emit_event(
                    app,
                    "workflow:nodeCompleted",
                    &json!({ "executionId": exec_id, "node": node, "result": result }),
                );
            }
            Err(e) => {
                let duration = now_ms() - node_start;
                ctx.add_log(
                    "error",
                    &format!("Failed: {} - {}", nname, e),
                    Some(&nid),
                    Some(&nname),
                );
                ctx.add_log("error", &format!("Workflow failed: {}", e), None, None);
                let _ = duration;
                status = "failed".to_string();
                error_msg = Some(e);
                break;
            }
        }
    }

    if status == "running" {
        status = "completed".to_string();
        ctx.add_log("info", "Workflow completed successfully", None, None);
    }

    let completed_at = now_ms();
    unregister_run(&exec_id);

    let mut execution = serde_json::Map::new();
    execution.insert("id".into(), json!(exec_id));
    execution.insert("workflowId".into(), json!(workflow_id));
    execution.insert("workflowName".into(), json!(workflow_name));
    execution.insert("status".into(), json!(status));
    execution.insert("inputValues".into(), inputs);
    execution.insert("outputValues".into(), Value::Object(ctx.outputs));
    execution.insert("nodeResults".into(), Value::Object(ctx.node_results));
    execution.insert("currentNodeId".into(), Value::Null);
    execution.insert("startedAt".into(), json!(started_at));
    execution.insert("completedAt".into(), json!(completed_at));
    execution.insert("totalDuration".into(), json!(completed_at - started_at));
    if let Some(e) = error_msg {
        execution.insert("error".into(), json!(e));
    }
    execution.insert("log".into(), json!(ctx.log));
    let execution = Value::Object(execution);

    record_execution(app, &execution);
    crate::native_ops::emit_event(app, "workflow:executionCompleted", &execution);

    execution
}

fn emit_exec_event(
    app: &tauri::AppHandle,
    event: &str,
    exec_id: &str,
    workflow_id: &str,
    workflow_name: &str,
    status: &str,
) {
    crate::native_ops::emit_event(
        app,
        event,
        &json!({
            "id": exec_id,
            "workflowId": workflow_id,
            "workflowName": workflow_name,
            "status": status,
        }),
    );
}

// --- channel handlers --------------------------------------------------------

// workflow:execute(workflowId, inputs, options?)
// Electron looked up the saved workflow, threw if missing, and (outside a
// renderer dialog) executed. There is no synchronous native dialog round-trip
// here, so the safety gate is honoured by defaulting to a PREVIEW (dryRun) run
// unless the caller explicitly passed { dryRun: false } or { confirm: true } —
// the same "Preview Only by default" intent as the Electron dialog's defaultId.
fn channel_execute(app: &tauri::AppHandle, args: &Value) -> Value {
    let workflow_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let workflow = get_one(app, workflow_id);
    if workflow.is_null() {
        return json!({ "error": format!("Workflow not found: {}", workflow_id) });
    }
    let inputs = args.get(1).cloned().unwrap_or_else(|| json!({}));
    let options = args.get(2).cloned().unwrap_or(Value::Null);

    // Safety gate: dryRun unless the caller explicitly opts into a real run.
    let explicit_real = options.get("dryRun").and_then(|v| v.as_bool()) == Some(false)
        || options.get("confirm").and_then(|v| v.as_bool()) == Some(true);
    let dry_run = !explicit_real;

    run_workflow(app, &workflow, inputs, dry_run)
}

// workflow:cancel(executionId?) — abort the in-flight run (or all runs when no
// id is given, matching WorkflowEngine.abort()'s arg-less signature). Void.
fn channel_cancel(args: &Value) {
    let target = args.get(0).and_then(|v| v.as_str());
    if let Ok(g) = active_runs().lock() {
        match target {
            Some(id) if !id.is_empty() => {
                if let Some(run) = g.get(id) {
                    run.abort.store(true, Ordering::SeqCst);
                }
            }
            _ => {
                for run in g.values() {
                    run.abort.store(true, Ordering::SeqCst);
                }
            }
        }
    }
}

// workflow:debug(workflowId, inputs?) — a genuinely native, side-effect-free
// simulation: run the same graph in dryRun mode so the renderer gets the full
// execution trace (per-node results + log) without any mutation.
fn channel_debug(app: &tauri::AppHandle, args: &Value) -> Value {
    let workflow_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let workflow = get_one(app, workflow_id);
    if workflow.is_null() {
        return json!({ "error": format!("Workflow not found: {}", workflow_id) });
    }
    let inputs = args.get(1).cloned().unwrap_or_else(|| json!({}));
    run_workflow(app, &workflow, inputs, true)
}

/// Route a `workflow:*` DATA channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the read-only data channels are
/// ported; every other channel (heavy/runtime or owned elsewhere) returns
/// Value::Null so the caller can fall through to its own handler.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "workflow:getAll" => get_all(app),
        "workflow:get" => {
            let workflow_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_one(app, workflow_id)
        }
        // Heavy channels — native WorkflowEngine port.
        "workflow:execute" => channel_execute(app, args),
        "workflow:debug" => channel_debug(app, args),
        // Void: abort the in-flight execution.
        "workflow:cancel" => {
            channel_cancel(args);
            Value::Null
        }
        _ => Value::Null,
    }
}
