// =============================================================================
// DEX Tauri — Accessibility subsystem (port of the data/query handlers in
// core/AccessibilityManager.ts -> SemanticUITree, Feature 62).
//
// Pure-data, JSON-backed tier. Electron's SemanticUITree kept a per-window
// snapshot cache in-memory (`Map<number, UITreeSnapshot>`), populated ONLY by
// the renderer-pushed `accessibility:tree-update` event and read back by the
// three query handlers below. Since `tree-update` is a heavy, live-runtime
// channel that is intentionally NOT ported (it needs the live main process and
// renderer bridge), there is no in-memory main process holding those snapshots
// under Tauri. We therefore back the snapshot cache with a JSON file so the
// query channels are honest, self-consistent, and ready to serve real data the
// moment a snapshot exists:
//
//   accessibility-tree-cache.json : { "snapshots": { "<windowId>": UITreeSnapshot } }
//
// Each UITreeSnapshot matches the Electron interface exactly:
//   { timestamp, windowId, rootNode: UITreeNode, focusedNodeId: string|null,
//     nodeCount }
// and a UITreeNode is:
//   { id, role, label, description?, value?, state{...}, children[], bounds?,
//     actions? }
//
// Return shapes match the Electron handlers exactly so the renderer is
// unchanged:
//   - accessibility:get-tree(windowId)              -> UITreeSnapshot | null
//   - accessibility:find-node({windowId, query})    -> UITreeNode[]   ([] if no snapshot)
//   - accessibility:describe-element({windowId, nodeId}) -> UITreeNode | null
//
// Because the populator channel is skipped, in normal operation the cache file
// is absent/empty and these return null / [] / null respectively — which is
// EXACTLY what Electron returned when no snapshot existed for the window
// (getSnapshot -> null, findNodes -> [], describe-element with no snapshot ->
// null). No data is invented.
//
// DIVERGENCES (documented):
//   - Storage backbone: Electron's cache was process-memory; here it is a JSON
//     file under <appData> ("other:accessibility tree cache"). This only changes
//     persistence/location, never the returned shapes. With tree-update unported
//     the cache is empty and behaviour is identical to a fresh Electron process.
//   - find-node argument shape: Electron's handler receives ONE object arg
//     `{ windowId, query }`; we read it from args.get(0) and accept that object.
//     describe-element likewise takes `{ windowId, nodeId }` at args.get(0).
//   - get-tree receives a bare windowId number at args.get(0) (Electron:
//     `(_event, windowId: number)`).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const CACHE_FILE: &str = "accessibility-tree-cache.json";

// --- file IO ----------------------------------------------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(CACHE_FILE)
}

fn read_cache(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// snapshots map: { "<windowId>": UITreeSnapshot }. Returns Null if absent.
fn snapshots(app: &tauri::AppHandle) -> Value {
    read_cache(app)
        .get("snapshots")
        .cloned()
        .unwrap_or(Value::Null)
}

// Mirrors `snapshots.get(windowId)`. windowId is keyed as a string in JSON.
fn get_snapshot(app: &tauri::AppHandle, window_id: i64) -> Value {
    snapshots(app)
        .get(window_id.to_string())
        .cloned()
        .unwrap_or(Value::Null)
}

// --- tree walking (mirrors the private helpers on SemanticUITree) ------------

fn children_of(node: &Value) -> Vec<Value> {
    node.get("children")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

// findNodeById(node, id): pre-order search, returns the node or null.
fn find_node_by_id(node: &Value, id: &str) -> Value {
    if node.get("id").and_then(|v| v.as_str()) == Some(id) {
        return node.clone();
    }
    for child in children_of(node) {
        let found = find_node_by_id(&child, id);
        if !found.is_null() {
            return found;
        }
    }
    Value::Null
}

// walkTree(node, cb): pre-order visit collecting nodes that match `pred`.
fn collect_matching<F: Fn(&Value) -> bool + Copy>(node: &Value, pred: F, out: &mut Vec<Value>) {
    if pred(node) {
        out.push(node.clone());
    }
    for child in children_of(node) {
        collect_matching(&child, pred, out);
    }
}

// --- handlers ---------------------------------------------------------------

// getSnapshot(windowId) -> UITreeSnapshot | null
fn handle_get_tree(app: &tauri::AppHandle, window_id: i64) -> Value {
    get_snapshot(app, window_id)
}

// findNodes(windowId, query) -> UITreeNode[]  (case-insensitive substring over
// label / role / description; [] if no snapshot).
fn handle_find_node(app: &tauri::AppHandle, window_id: i64, query: &str) -> Value {
    let snapshot = get_snapshot(app, window_id);
    let root = match snapshot.get("rootNode") {
        Some(r) if !r.is_null() => r.clone(),
        _ => return json!([]),
    };
    let lower = query.to_lowercase();
    let mut results: Vec<Value> = Vec::new();
    {
        let needle = lower.as_str();
        collect_matching(
            &root,
            move |node| {
                let label = node
                    .get("label")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                let role = node
                    .get("role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                let desc = node
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                label.contains(needle)
                    || role.contains(needle)
                    || (!desc.is_empty() && desc.contains(needle))
            },
            &mut results,
        );
    }
    json!(results)
}

// describe-element: if no snapshot -> null; else findNodeById(rootNode, nodeId).
fn handle_describe_element(app: &tauri::AppHandle, window_id: i64, node_id: &str) -> Value {
    let snapshot = get_snapshot(app, window_id);
    if snapshot.is_null() {
        return Value::Null;
    }
    match snapshot.get("rootNode") {
        Some(root) if !root.is_null() => find_node_by_id(root, node_id),
        _ => Value::Null,
    }
}

/// Route an `accessibility:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the three data/query channels are
/// handled; every heavy live-runtime channel (focus-changed, keyboard-
/// navigation, element-announced, live-region-update, tree-update) is NOT ported
/// and falls through to Value::Null (honest degrade — the prefix route is safe
/// because skipped channels return null rather than fabricated data).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        // getSnapshot(windowId) — bare number arg.
        "accessibility:get-tree" => {
            let window_id = a0.as_i64().unwrap_or(0);
            handle_get_tree(app, window_id)
        }
        // findNodes({ windowId, query }) — single object arg.
        "accessibility:find-node" => {
            let window_id = a0.get("windowId").and_then(|v| v.as_i64()).unwrap_or(0);
            let query = a0.get("query").and_then(|v| v.as_str()).unwrap_or("");
            handle_find_node(app, window_id, query)
        }
        // describe-element({ windowId, nodeId }) — single object arg.
        "accessibility:describe-element" => {
            let window_id = a0.get("windowId").and_then(|v| v.as_i64()).unwrap_or(0);
            let node_id = a0.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");
            handle_describe_element(app, window_id, node_id)
        }
        _ => Value::Null,
    }
}
