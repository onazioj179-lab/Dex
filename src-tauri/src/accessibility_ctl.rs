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
//
// LIVE-RUNTIME CHANNELS (now ported natively, Feature 61 + the tree populator):
//   - accessibility:tree-update          (Feature 62 populator)
//   - accessibility:focus-changed        (Feature 61 event)
//   - accessibility:keyboard-navigation  (Feature 61 event)
//   - accessibility:element-announced     (Feature 61 event)
//   - accessibility:live-region-update    (Feature 61 event)
//
// In Electron these were ALL `ipcMain.on` listeners (fire-and-forget / void):
//   * tree-update -> `updateTree(windowId, tree)`: computes nodeCount +
//     focusedNodeId and stores a UITreeSnapshot in the in-process Map. We do the
//     identical computation and persist the snapshot into the SAME cache file the
//     query handlers (get-tree / find-node / describe-element) already read — so
//     those queries now serve REAL data instead of always returning null/[].
//   * the four event channels -> `emit({ type, timestamp, data })`: pushed the
//     event onto a bounded `recentEvents` ring buffer (max 200, halved on
//     overflow) and fanned it out to in-process listeners. We replicate that ring
//     buffer in the SAME cache file under "recentEvents", and re-broadcast each
//     event to the renderer via `crate::native_ops::emit_event` under the
//     canonical channel name `accessibility:event` carrying the full
//     AccessibilityEvent payload (the Tauri analogue of Electron's listener
//     fan-out / webContents.send). All four are void -> dispatch returns Null,
//     exactly like Electron's `ipcMain.on` (which returns nothing).
//
// The shapes are byte-for-byte the Electron ones:
//   AccessibilityEvent = { type, timestamp, data }
//   UITreeSnapshot     = { timestamp, windowId, rootNode, focusedNodeId, nodeCount }
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const CACHE_FILE: &str = "accessibility-tree-cache.json";
const MAX_RECENT_EVENTS: usize = 200;

// epoch millis (mirrors Date.now()).
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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

// Read the whole cache as a JSON object (creating an empty one if absent/invalid)
// so writers can mutate "snapshots" / "recentEvents" without clobbering the other.
fn read_cache_object(app: &tauri::AppHandle) -> Map<String, Value> {
    match read_cache(app) {
        Value::Object(m) => m,
        _ => Map::new(),
    }
}

fn write_cache(app: &tauri::AppHandle, cache: &Map<String, Value>) {
    if let Ok(raw) = serde_json::to_string(&Value::Object(cache.clone())) {
        let _ = std::fs::write(store_path(app), raw);
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

// --- Feature 62 populator: tree-update --------------------------------------

// countNodes(node): 1 + sum(children). Mirrors the private recursive counter.
fn count_nodes(node: &Value) -> i64 {
    let mut count = 1i64;
    for child in children_of(node) {
        count += count_nodes(&child);
    }
    count
}

// findFocusedNode(node): pre-order, first node with state.focused === true.
fn find_focused_node(node: &Value) -> Value {
    if node
        .get("state")
        .and_then(|s| s.get("focused"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return node.clone();
    }
    for child in children_of(node) {
        let found = find_focused_node(&child);
        if !found.is_null() {
            return found;
        }
    }
    Value::Null
}

// updateTree(windowId, tree): build the UITreeSnapshot and persist it under
// snapshots["<windowId>"] in the SAME cache file the query handlers read. Void.
fn handle_tree_update(app: &tauri::AppHandle, window_id: i64, tree: Value) {
    if tree.is_null() {
        return; // nothing to register (Electron would store an undefined tree; we no-op honestly)
    }
    let node_count = count_nodes(&tree);
    let focused = find_focused_node(&tree);
    let focused_node_id = focused
        .get("id")
        .and_then(|v| v.as_str())
        .map(Value::from)
        .unwrap_or(Value::Null);

    let snapshot = json!({
        "timestamp": now_ms(),
        "windowId": window_id,
        "rootNode": tree,
        "focusedNodeId": focused_node_id,
        "nodeCount": node_count,
    });

    let mut cache = read_cache_object(app);
    let mut snaps = match cache.get("snapshots") {
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    };
    snaps.insert(window_id.to_string(), snapshot);
    cache.insert("snapshots".to_string(), Value::Object(snaps));
    write_cache(app, &cache);
}

// --- Feature 61 events ------------------------------------------------------

// emit(event): push onto the bounded recentEvents ring buffer (max 200, halved
// to the most-recent 100 on overflow — identical to Electron's slice(-max/2))
// and re-broadcast to the renderer. `type` + `timestamp` + `data` shape exact.
fn handle_event(app: &tauri::AppHandle, event_type: &str, data: Value) {
    let event = json!({
        "type": event_type,
        "timestamp": now_ms(),
        "data": if data.is_null() { json!({}) } else { data },
    });

    // Persist into the ring buffer in the shared cache file.
    let mut cache = read_cache_object(app);
    let mut events = match cache.get("recentEvents") {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    events.push(event.clone());
    if events.len() > MAX_RECENT_EVENTS {
        // keep the most-recent half (Electron: slice(-maxRecentEvents / 2)).
        let keep = MAX_RECENT_EVENTS / 2;
        let start = events.len() - keep;
        events = events.split_off(start);
    }
    cache.insert("recentEvents".to_string(), Value::Array(events));
    write_cache(app, &cache);

    // Fan out to the renderer (Tauri analogue of the in-process listener
    // dispatch / webContents.send in Electron).
    crate::native_ops::emit_event(app, "accessibility:event", &event);
}

/// Route an `accessibility:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The three data/query channels plus the
/// five live-runtime channels (tree-update populator + the four Feature-61 event
/// channels) are now handled natively. The event channels and the tree-update
/// populator are void (Electron `ipcMain.on`) and return Value::Null. Any other
/// `accessibility:*` channel falls through to Value::Null (honest degrade).
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
        // updateTree({ windowId, tree }) — single object arg; void.
        // (Electron: `ipcMain.on('tree-update', (_e, { windowId, tree }) => ...)`.)
        "accessibility:tree-update" => {
            let window_id = a0.get("windowId").and_then(|v| v.as_i64()).unwrap_or(0);
            let tree = a0.get("tree").cloned().unwrap_or(Value::Null);
            handle_tree_update(app, window_id, tree);
            Value::Null
        }
        // Feature 61 events — `ipcMain.on(channel, (_e, data) => emit(...))`; each
        // takes a single `data` arg and is void. The event `type` is the channel
        // suffix, matching AccessibilityEventType exactly.
        "accessibility:focus-changed" => {
            handle_event(app, "focus-changed", a0);
            Value::Null
        }
        "accessibility:keyboard-navigation" => {
            handle_event(app, "keyboard-navigation", a0);
            Value::Null
        }
        "accessibility:element-announced" => {
            handle_event(app, "element-announced", a0);
            Value::Null
        }
        "accessibility:live-region-update" => {
            handle_event(app, "live-region-update", a0);
            Value::Null
        }
        _ => Value::Null,
    }
}
