// =============================================================================
// DEX Tauri — Split View subsystem (port of core/SplitViewSystem.ts).
//
// OS-level multi-pane layout manager: preset + saved layouts, a "current"
// layout, pane-tree operations (split / close / resize / set-content / swap),
// pane state, and a small config block. All of it is pure data, so it ports
// cleanly to the stateless dex_ipc dispatcher.
//
// STORAGE (matches the Electron source exactly — NOT electron-store):
// SplitViewSystem persisted with raw `fs` JSON under <userData>/splitview/. We
// mirror that under <appData>/splitview/ with the SAME file names and the SAME
// top-level wrappers:
//   - splitview/layouts.json : { layouts: [Layout, ...], currentLayout: Layout|null }
//   - splitview/config.json  : SplitViewConfig (bare object, no wrapper)
// (The task brief said "electron-store:layout", but the real handler used fs
// JSON files; the ground-truth source wins. The dir name "splitview" matches
// app.getPath('userData')/'splitview'.)
//
// STATE divergence: the Electron class kept `currentLayout`, `savedLayouts` and
// `config` in memory and lazily flushed them. dex_ipc is stateless per call, so
// EVERY mutation here reads -> mutates -> writes the JSON immediately. Net data
// is identical; the only difference is that `currentLayout` is now persisted on
// every change (Electron only wrote it on saveCurrentLayout/shutdown). That is
// strictly more durable and the renderer reads the same shape back.
//
// Two in-memory-only maps (`paneStates`, `maximizedPaneId`) had no Electron
// persistence at all. To survive across stateless calls they are persisted to a
// sibling file splitview/runtime.json: { paneStates: {id:PaneState}, maximizedPaneId }.
// This is a NEW file with no Electron equivalent, but it is the only way to keep
// savePaneState/getPaneState/maximize behaving across separate IPC calls. It is
// never returned to the renderer wholesale, so no shape is affected.
//
// ID divergence: Electron used a per-process `idCounter` (`layout-<n>-<ts>`,
// `pane-<n>-<ts>`, `node-<n>`). A stateless dispatch has no counter, so ids use
// crate::util::pseudo_uuid_v4() short fragments instead (`layout-<frag>-<ts>`,
// etc.). Ids stay unique and the renderer treats them as opaque strings.
//
// SKIPPED (live-window event broadcasts, not pure data): main.ts's
// `splitview:apply-preset` / `split:cross-drop` only forward to webContents.send
// and the SplitViewSystem notifyRenderer side-effects (splitview:changed /
// :focus / :maximized / :configChanged). These need a live window event channel
// and are intentionally not emitted here. The channels that ALSO returned a
// shaped object (focus/maximize/setConfig) still return that object; only the
// broadcast is dropped. `splitview:apply-preset` itself returned only
// {success:true} after a broadcast, with the real preset logic living under
// `splitview:applyPreset`; it is ported as a thin {success:true} so the prefix
// route stays total.
// =============================================================================

use crate::paths::DexPaths;
use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::path::PathBuf;

const LAYOUTS_FILE: &str = "layouts.json";
const CONFIG_FILE: &str = "config.json";
const RUNTIME_FILE: &str = "runtime.json";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO ----------------------------------------------------------------

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .dex_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("splitview");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(data_dir(app).join(name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_file(app: &tauri::AppHandle, name: &str, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => crate::write_atomic(data_dir(app).join(name), s).is_ok(),
        Err(_) => false,
    }
}

// --- config -----------------------------------------------------------------

fn default_config() -> Value {
    json!({
        "snapToEdges": true,
        "snapThreshold": 50,
        "minPaneSize": 10,
        "maxPanes": 8,
        "showDividers": true,
        "dividerSize": 4,
        "animationDuration": 200,
    })
}

fn get_config(app: &tauri::AppHandle) -> Value {
    // Electron seeded defaults then spread the file over them.
    let mut cfg = default_config();
    if let Some(file) = read_file(app, CONFIG_FILE).as_object().cloned() {
        if let Some(obj) = cfg.as_object_mut() {
            for (k, v) in file {
                obj.insert(k, v);
            }
        }
    }
    cfg
}

fn min_pane_size(app: &tauri::AppHandle) -> f64 {
    get_config(app)
        .get("minPaneSize")
        .and_then(|v| v.as_f64())
        .unwrap_or(10.0)
}

fn max_panes(app: &tauri::AppHandle) -> i64 {
    get_config(app)
        .get("maxPanes")
        .and_then(|v| v.as_i64())
        .unwrap_or(8)
}

// --- layouts store ----------------------------------------------------------

fn read_layouts_doc(app: &tauri::AppHandle) -> Value {
    let raw = read_file(app, LAYOUTS_FILE);
    json!({
        "layouts": raw.get("layouts").cloned().unwrap_or_else(|| json!([])),
        "currentLayout": raw.get("currentLayout").cloned().unwrap_or(Value::Null),
    })
}

fn saved_layouts(app: &tauri::AppHandle) -> Vec<Value> {
    read_layouts_doc(app)
        .get("layouts")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn current_layout(app: &tauri::AppHandle) -> Value {
    read_layouts_doc(app)
        .get("currentLayout")
        .cloned()
        .unwrap_or(Value::Null)
}

fn write_layouts(app: &tauri::AppHandle, layouts: &[Value], current: &Value) -> bool {
    write_file(
        app,
        LAYOUTS_FILE,
        &json!({ "layouts": layouts, "currentLayout": current }),
    )
}

fn set_current(app: &tauri::AppHandle, current: &Value) -> bool {
    let layouts = saved_layouts(app);
    write_layouts(app, &layouts, current)
}

// --- runtime store (paneStates + maximizedPaneId) ---------------------------

fn read_runtime(app: &tauri::AppHandle) -> Value {
    let raw = read_file(app, RUNTIME_FILE);
    json!({
        "paneStates": raw.get("paneStates").cloned().unwrap_or_else(|| json!({})),
        "maximizedPaneId": raw.get("maximizedPaneId").cloned().unwrap_or(Value::Null),
    })
}

fn write_runtime(app: &tauri::AppHandle, rt: &Value) -> bool {
    write_file(app, RUNTIME_FILE, rt)
}

// --- preset layouts ---------------------------------------------------------

fn pane(id: &str, title: &str, size: f64, min: f64, max: f64, resizable: bool, closable: bool) -> Value {
    json!({
        "id": id,
        "contentType": "empty",
        "title": title,
        "size": size,
        "minSize": min,
        "maxSize": max,
        "resizable": resizable,
        "closable": closable,
    })
}

fn pane_node(id: &str, size: f64, p: Value) -> Value {
    json!({ "id": id, "type": "pane", "size": size, "pane": p })
}

fn split_node(id: &str, direction: &str, size: f64, children: Vec<Value>) -> Value {
    json!({ "id": id, "type": "split", "direction": direction, "size": size, "children": children })
}

// The six PRESET_LAYOUTS, byte-for-byte from SplitViewSystem.ts (without the
// createdAt/updatedAt which are stamped at read time).
fn preset_defs() -> Vec<Value> {
    vec![
        json!({
            "id": "single",
            "name": "Single Pane",
            "description": "Full screen single view",
            "isPreset": true,
            "root": pane_node("root", 100.0, pane("main", "Main", 100.0, 100.0, 100.0, false, false)),
        }),
        json!({
            "id": "split-horizontal",
            "name": "Side by Side",
            "description": "Two panes side by side",
            "isPreset": true,
            "root": split_node("root", "horizontal", 100.0, vec![
                pane_node("left", 50.0, pane("left-pane", "Left", 50.0, 20.0, 80.0, true, true)),
                pane_node("right", 50.0, pane("right-pane", "Right", 50.0, 20.0, 80.0, true, true)),
            ]),
        }),
        json!({
            "id": "split-vertical",
            "name": "Stacked",
            "description": "Two panes stacked vertically",
            "isPreset": true,
            "root": split_node("root", "vertical", 100.0, vec![
                pane_node("top", 50.0, pane("top-pane", "Top", 50.0, 20.0, 80.0, true, true)),
                pane_node("bottom", 50.0, pane("bottom-pane", "Bottom", 50.0, 20.0, 80.0, true, true)),
            ]),
        }),
        json!({
            "id": "three-columns",
            "name": "Three Columns",
            "description": "Three equal columns",
            "isPreset": true,
            "root": split_node("root", "horizontal", 100.0, vec![
                pane_node("col1", 33.33, pane("col1-pane", "Column 1", 33.33, 15.0, 70.0, true, true)),
                pane_node("col2", 33.33, pane("col2-pane", "Column 2", 33.33, 15.0, 70.0, true, true)),
                pane_node("col3", 33.34, pane("col3-pane", "Column 3", 33.34, 15.0, 70.0, true, true)),
            ]),
        }),
        json!({
            "id": "main-sidebar",
            "name": "Main + Sidebar",
            "description": "Large main pane with narrow sidebar",
            "isPreset": true,
            "root": split_node("root", "horizontal", 100.0, vec![
                pane_node("main", 70.0, pane("main-pane", "Main", 70.0, 50.0, 85.0, true, false)),
                pane_node("sidebar", 30.0, pane("sidebar-pane", "Sidebar", 30.0, 15.0, 50.0, true, true)),
            ]),
        }),
        json!({
            "id": "quadrant",
            "name": "Four Quadrants",
            "description": "Four equal panes in a grid",
            "isPreset": true,
            "root": split_node("root", "vertical", 100.0, vec![
                split_node("top-row", "horizontal", 50.0, vec![
                    pane_node("tl", 50.0, pane("tl-pane", "Top Left", 50.0, 20.0, 80.0, true, true)),
                    pane_node("tr", 50.0, pane("tr-pane", "Top Right", 50.0, 20.0, 80.0, true, true)),
                ]),
                split_node("bottom-row", "horizontal", 50.0, vec![
                    pane_node("bl", 50.0, pane("bl-pane", "Bottom Left", 50.0, 20.0, 80.0, true, true)),
                    pane_node("br", 50.0, pane("br-pane", "Bottom Right", 50.0, 20.0, 80.0, true, true)),
                ]),
            ]),
        }),
    ]
}

fn stamp(mut layout: Value, created: i64, updated: i64) -> Value {
    if let Some(obj) = layout.as_object_mut() {
        obj.insert("createdAt".into(), json!(created));
        obj.insert("updatedAt".into(), json!(updated));
    }
    layout
}

fn get_preset_layouts() -> Vec<Value> {
    let now = now_ms();
    preset_defs().into_iter().map(|p| stamp(p, now, now)).collect()
}

fn get_all_layouts(app: &tauri::AppHandle) -> Vec<Value> {
    let mut out = get_preset_layouts();
    out.extend(saved_layouts(app));
    out
}

// --- pane-tree helpers ------------------------------------------------------

fn node_type(n: &Value) -> &str {
    n.get("type").and_then(|v| v.as_str()).unwrap_or("")
}

fn pane_id(n: &Value) -> Option<String> {
    n.get("pane")
        .and_then(|p| p.get("id"))
        .and_then(|v| v.as_str())
        .map(String::from)
}

fn count_panes(node: &Value) -> i64 {
    if node_type(node) == "pane" {
        return 1;
    }
    match node.get("children").and_then(|v| v.as_array()) {
        Some(children) => children.iter().map(count_panes).sum(),
        None => 0,
    }
}

// Find a pane node by id and return a mutable ref to its "pane" object.
fn find_pane_mut<'a>(node: &'a mut Value, id: &str) -> Option<&'a mut Value> {
    if node_type(node) == "pane" && pane_id(node).as_deref() == Some(id) {
        return node.get_mut("pane");
    }
    if let Some(children) = node.get_mut("children").and_then(|v| v.as_array_mut()) {
        for child in children.iter_mut() {
            if let Some(found) = find_pane_mut(child, id) {
                return Some(found);
            }
        }
    }
    None
}

fn find_pane_in_node(node: &Value, id: &str) -> bool {
    if node_type(node) == "pane" && pane_id(node).as_deref() == Some(id) {
        return true;
    }
    match node.get("children").and_then(|v| v.as_array()) {
        Some(children) => children.iter().any(|c| find_pane_in_node(c, id)),
        None => false,
    }
}

fn get_first_pane(node: &Value) -> Value {
    if node_type(node) == "pane" {
        return node.get("pane").cloned().unwrap_or(Value::Null);
    }
    match node.get("children").and_then(|v| v.as_array()) {
        Some(children) if !children.is_empty() => get_first_pane(&children[0]),
        _ => Value::Null,
    }
}

fn size_of(n: &Value) -> f64 {
    n.get("size").and_then(|v| v.as_f64()).unwrap_or(0.0)
}

fn set_size(n: &mut Value, size: f64) {
    if let Some(obj) = n.as_object_mut() {
        obj.insert("size".into(), json!(size));
        if let Some(p) = obj.get_mut("pane").and_then(|v| v.as_object_mut()) {
            p.insert("size".into(), json!(size));
        }
    }
}

// splitPane: convert the matching pane node into a split with two children.
fn find_and_split(node: &mut Value, target: &str, direction: &str, min: f64) -> Option<String> {
    if node_type(node) == "pane" && pane_id(node).as_deref() == Some(target) {
        let new_pane_id = format!("pane-{}-{}", &pseudo_uuid_v4()[..8], now_ms());
        let original = node.get("pane").cloned().unwrap_or(Value::Null);
        let mut original_half = original.clone();
        if let Some(obj) = original_half.as_object_mut() {
            obj.insert("size".into(), json!(50.0));
        }
        let n1 = pane_node(&format!("node-{}", &pseudo_uuid_v4()[..8]), 50.0, original_half);
        let n2 = pane_node(
            &format!("node-{}", &pseudo_uuid_v4()[..8]),
            50.0,
            pane(&new_pane_id, "New Pane", 50.0, min, 100.0 - min, true, true),
        );
        if let Some(obj) = node.as_object_mut() {
            obj.insert("type".into(), json!("split"));
            obj.insert("direction".into(), json!(direction));
            obj.insert("children".into(), json!([n1, n2]));
            obj.remove("pane");
        }
        return Some(new_pane_id);
    }
    if let Some(children) = node.get_mut("children").and_then(|v| v.as_array_mut()) {
        for child in children.iter_mut() {
            if let Some(id) = find_and_split(child, target, direction, min) {
                return Some(id);
            }
        }
    }
    None
}

// closePane: remove the matching pane from its parent and merge/redistribute.
fn find_and_close(node: &mut Value, target: &str) -> bool {
    let children = match node.get_mut("children").and_then(|v| v.as_array_mut()) {
        Some(c) => c,
        None => return false,
    };
    // Direct child match -> splice it out of THIS node's children.
    if let Some(index) = children
        .iter()
        .position(|c| node_type(c) == "pane" && pane_id(c).as_deref() == Some(target))
    {
        children.remove(index);
        if children.len() == 1 {
            // Merge the single remaining child up into this node.
            let remaining = children[0].clone();
            if let Some(obj) = node.as_object_mut() {
                obj.insert("type".into(), remaining.get("type").cloned().unwrap_or(json!("pane")));
                match remaining.get("pane") {
                    Some(p) => { obj.insert("pane".into(), p.clone()); }
                    None => { obj.remove("pane"); }
                }
                match remaining.get("direction") {
                    Some(d) => { obj.insert("direction".into(), d.clone()); }
                    None => { obj.remove("direction"); }
                }
                match remaining.get("children") {
                    Some(c) => { obj.insert("children".into(), c.clone()); }
                    None => { obj.remove("children"); }
                }
            }
        } else {
            let total: f64 = children.iter().map(size_of).sum();
            if total > 0.0 {
                for c in children.iter_mut() {
                    let ns = (size_of(c) / total) * 100.0;
                    set_size(c, ns);
                }
            }
        }
        return true;
    }
    // Recurse.
    let len = children.len();
    for i in 0..len {
        if find_and_close(&mut node["children"][i], target) {
            return true;
        }
    }
    false
}

fn normalize(node: &mut Value) {
    if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
        let total: f64 = children.iter().map(size_of).sum();
        let needs = (total - 100.0).abs() > 0.1;
        let len = children.len();
        if needs && total != 0.0 {
            for i in 0..len {
                let ns = (size_of(&node["children"][i]) / total) * 100.0;
                set_size(&mut node["children"][i], ns);
            }
        }
        for i in 0..len {
            normalize(&mut node["children"][i]);
        }
    }
}

// resizePane mirrors findAndResizePane: leaf clamp via the pane's own min/max,
// container-child clamp via config minPaneSize plus sibling compensation.
fn find_and_resize(node: &mut Value, target: &str, new_size: f64, min_cfg: f64) -> bool {
    if node_type(node) == "pane" && pane_id(node).as_deref() == Some(target) {
        let (pmin, pmax) = node
            .get("pane")
            .map(|p| {
                (
                    p.get("minSize").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    p.get("maxSize").and_then(|v| v.as_f64()).unwrap_or(100.0),
                )
            })
            .unwrap_or((0.0, 100.0));
        let clamped = new_size.max(pmin).min(pmax);
        set_size(node, clamped);
        return true;
    }
    let len = node
        .get("children")
        .and_then(|v| v.as_array())
        .map(|c| c.len())
        .unwrap_or(0);
    for i in 0..len {
        let is_direct = find_pane_in_node(&node["children"][i], target);
        if is_direct {
            let clamped = new_size.max(min_cfg).min(100.0 - min_cfg);
            let old = size_of(&node["children"][i]);
            let diff = clamped - old;
            if i + 1 < len {
                let sib = size_of(&node["children"][i + 1]) - diff;
                set_sibling_size(&mut node["children"][i + 1], sib);
            } else if i > 0 {
                let sib = size_of(&node["children"][i - 1]) - diff;
                set_sibling_size(&mut node["children"][i - 1], sib);
            }
            set_size(&mut node["children"][i], clamped);
            return true;
        }
        if find_and_resize(&mut node["children"][i], target, new_size, min_cfg) {
            return true;
        }
    }
    false
}

// Electron only set child.size on the sibling (not pane.size) when compensating.
fn set_sibling_size(n: &mut Value, size: f64) {
    if let Some(obj) = n.as_object_mut() {
        obj.insert("size".into(), json!(size));
    }
}

fn find_pane_at_position(node: &Value, position: &str) -> Value {
    if position == "center" && node_type(node) == "pane" {
        return node.get("pane").cloned().unwrap_or(Value::Null);
    }
    if node_type(node) == "split" {
        if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
            if !children.is_empty() {
                let dir = node.get("direction").and_then(|v| v.as_str()).unwrap_or("");
                let last = &children[children.len() - 1];
                match (dir, position) {
                    ("horizontal", "left") => return get_first_pane(&children[0]),
                    ("horizontal", "right") => return get_first_pane(last),
                    ("vertical", "top") => return get_first_pane(&children[0]),
                    ("vertical", "bottom") => return get_first_pane(last),
                    _ => {}
                }
            }
        }
    }
    Value::Null
}

// --- channel handlers -------------------------------------------------------

fn apply_preset(app: &tauri::AppHandle, preset_id: &str) -> Value {
    let preset = preset_defs().into_iter().find(|p| {
        p.get("id").and_then(|v| v.as_str()) == Some(preset_id)
    });
    match preset {
        Some(p) => {
            let now = now_ms();
            let current = stamp(p, now, now);
            set_current(app, &current);
            json!({ "success": true })
        }
        None => json!({ "success": false, "error": "Preset not found" }),
    }
}

fn apply_layout(app: &tauri::AppHandle, layout_id: &str) -> Value {
    let layout = saved_layouts(app)
        .into_iter()
        .find(|l| l.get("id").and_then(|v| v.as_str()) == Some(layout_id));
    match layout {
        Some(mut l) => {
            if let Some(obj) = l.as_object_mut() {
                obj.insert("updatedAt".into(), json!(now_ms()));
            }
            set_current(app, &l);
            json!({ "success": true })
        }
        None => json!({ "success": false, "error": "Layout not found" }),
    }
}

fn save_current_layout(app: &tauri::AppHandle, name: &str, description: Option<&str>) -> Value {
    let current = current_layout(app);
    if current.is_null() {
        return json!({ "success": false });
    }
    let layout_id = format!("layout-{}-{}", &pseudo_uuid_v4()[..8], now_ms());
    let mut layout = current.as_object().cloned().unwrap_or_default();
    layout.insert("id".into(), json!(layout_id));
    layout.insert("name".into(), json!(name));
    // Electron spread `description` even when undefined -> property present as undefined,
    // which JSON-serializes away. We only insert it when provided.
    match description {
        Some(d) => { layout.insert("description".into(), json!(d)); }
        None => { layout.remove("description"); }
    }
    layout.insert("isPreset".into(), json!(false));
    layout.insert("updatedAt".into(), json!(now_ms()));
    let layout = Value::Object(layout);

    let mut layouts = saved_layouts(app);
    layouts.push(layout);
    write_layouts(app, &layouts, &current);
    json!({ "success": true, "layoutId": layout_id })
}

fn delete_layout(app: &tauri::AppHandle, layout_id: &str) -> Value {
    let mut layouts = saved_layouts(app);
    let before = layouts.len();
    layouts.retain(|l| l.get("id").and_then(|v| v.as_str()) != Some(layout_id));
    if layouts.len() != before {
        let current = current_layout(app);
        write_layouts(app, &layouts, &current);
        json!({ "success": true })
    } else {
        json!({ "success": false })
    }
}

fn split_pane(app: &tauri::AppHandle, pane: &str, direction: &str) -> Value {
    let mut current = current_layout(app);
    if current.is_null() {
        return json!({ "success": false });
    }
    let count = current.get("root").map(count_panes).unwrap_or(0);
    if count >= max_panes(app) {
        return json!({ "success": false });
    }
    let min = min_pane_size(app);
    let root = match current.get_mut("root") {
        Some(r) => r,
        None => return json!({ "success": false }),
    };
    match find_and_split(root, pane, direction, min) {
        Some(new_id) => {
            if let Some(obj) = current.as_object_mut() {
                obj.insert("updatedAt".into(), json!(now_ms()));
            }
            set_current(app, &current);
            json!({ "success": true, "newPaneId": new_id })
        }
        None => json!({ "success": false }),
    }
}

fn close_pane(app: &tauri::AppHandle, pane: &str) -> Value {
    let mut current = current_layout(app);
    if current.is_null() {
        return json!({ "success": false });
    }
    if current.get("root").map(count_panes).unwrap_or(0) <= 1 {
        return json!({ "success": false });
    }
    let root = match current.get_mut("root") {
        Some(r) => r,
        None => return json!({ "success": false }),
    };
    if find_and_close(root, pane) {
        normalize(root);
        if let Some(obj) = current.as_object_mut() {
            obj.insert("updatedAt".into(), json!(now_ms()));
        }
        set_current(app, &current);
        json!({ "success": true })
    } else {
        json!({ "success": false })
    }
}

fn resize_pane(app: &tauri::AppHandle, pane: &str, size: f64) -> Value {
    let mut current = current_layout(app);
    if current.is_null() {
        return json!({ "success": false });
    }
    let min = min_pane_size(app);
    let root = match current.get_mut("root") {
        Some(r) => r,
        None => return json!({ "success": false }),
    };
    if find_and_resize(root, pane, size, min) {
        if let Some(obj) = current.as_object_mut() {
            obj.insert("updatedAt".into(), json!(now_ms()));
        }
        set_current(app, &current);
        json!({ "success": true })
    } else {
        json!({ "success": false })
    }
}

fn set_pane_content(app: &tauri::AppHandle, pane: &str, content_type: &str, content_id: Option<&str>) -> Value {
    let mut current = current_layout(app);
    if current.is_null() {
        return json!({ "success": false });
    }
    let root = match current.get_mut("root") {
        Some(r) => r,
        None => return json!({ "success": false }),
    };
    match find_pane_mut(root, pane) {
        Some(p) => {
            if let Some(obj) = p.as_object_mut() {
                obj.insert("contentType".into(), json!(content_type));
                // Electron assigned `pane.contentId = contentId` unconditionally;
                // undefined serializes away, so we mirror with null-as-absent.
                match content_id {
                    Some(id) => { obj.insert("contentId".into(), json!(id)); }
                    None => { obj.insert("contentId".into(), Value::Null); }
                }
            }
            if let Some(obj) = current.as_object_mut() {
                obj.insert("updatedAt".into(), json!(now_ms()));
            }
            set_current(app, &current);
            json!({ "success": true })
        }
        None => json!({ "success": false }),
    }
}

fn swap_panes(app: &tauri::AppHandle, id1: &str, id2: &str) -> Value {
    let mut current = current_layout(app);
    if current.is_null() {
        return json!({ "success": false });
    }
    let root = match current.get("root") {
        Some(r) => r.clone(),
        None => return json!({ "success": false }),
    };
    // Read both panes (snapshots) first.
    let mut root1 = root.clone();
    let p1 = find_pane_mut(&mut root1, id1).map(|p| p.clone());
    let mut root2 = root.clone();
    let p2 = find_pane_mut(&mut root2, id2).map(|p| p.clone());
    let (p1, p2) = match (p1, p2) {
        (Some(a), Some(b)) => (a, b),
        _ => return json!({ "success": false }),
    };
    let get3 = |p: &Value| {
        (
            p.get("contentType").cloned().unwrap_or(Value::Null),
            p.get("contentId").cloned().unwrap_or(Value::Null),
            p.get("title").cloned().unwrap_or(Value::Null),
        )
    };
    let (ct1, ci1, t1) = get3(&p1);
    let (ct2, ci2, t2) = get3(&p2);

    let root_mut = current.get_mut("root").unwrap();
    if let Some(p) = find_pane_mut(root_mut, id1) {
        if let Some(o) = p.as_object_mut() {
            o.insert("contentType".into(), ct2);
            o.insert("contentId".into(), ci2);
            o.insert("title".into(), t2);
        }
    }
    if let Some(p) = find_pane_mut(current.get_mut("root").unwrap(), id2) {
        if let Some(o) = p.as_object_mut() {
            o.insert("contentType".into(), ct1);
            o.insert("contentId".into(), ci1);
            o.insert("title".into(), t1);
        }
    }
    if let Some(obj) = current.as_object_mut() {
        obj.insert("updatedAt".into(), json!(now_ms()));
    }
    set_current(app, &current);
    json!({ "success": true })
}

fn focus_pane() -> Value {
    // Electron broadcast splitview:focus then returned {success:true}. The
    // broadcast is a live-window side-effect (skipped); the return is pure.
    json!({ "success": true })
}

fn pane_at(app: &tauri::AppHandle, position: &str) -> Value {
    let current = current_layout(app);
    match current.get("root") {
        Some(root) => find_pane_at_position(root, position),
        None => Value::Null,
    }
}

fn toggle_maximize(app: &tauri::AppHandle, pane: &str) -> Value {
    let mut rt = read_runtime(app);
    let cur = rt.get("maximizedPaneId").and_then(|v| v.as_str()).map(String::from);
    let maximized = if cur.as_deref() == Some(pane) {
        rt["maximizedPaneId"] = Value::Null;
        false
    } else {
        rt["maximizedPaneId"] = json!(pane);
        true
    };
    write_runtime(app, &rt);
    json!({ "success": true, "maximized": maximized })
}

fn save_pane_state(app: &tauri::AppHandle, state: &Value) -> Value {
    let id = state.get("paneId").and_then(|v| v.as_str()).unwrap_or("");
    let mut rt = read_runtime(app);
    if let Some(map) = rt.get_mut("paneStates").and_then(|v| v.as_object_mut()) {
        map.insert(id.to_string(), state.clone());
    }
    write_runtime(app, &rt);
    json!({ "success": true })
}

fn get_pane_state(app: &tauri::AppHandle, pane: &str) -> Value {
    read_runtime(app)
        .get("paneStates")
        .and_then(|m| m.get(pane))
        .cloned()
        .unwrap_or(Value::Null)
}

fn set_config(app: &tauri::AppHandle, partial: &Value) -> Value {
    let mut cfg = get_config(app);
    if let (Some(dst), Some(src)) = (cfg.as_object_mut(), partial.as_object()) {
        for (k, v) in src {
            dst.insert(k.clone(), v.clone());
        }
    }
    write_file(app, CONFIG_FILE, &cfg);
    // Electron broadcast splitview:configChanged (skipped) then returned {success}.
    json!({ "success": true })
}

/// Route a `splitview:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Heavy/event-only channels return
/// {success:true} or Value::Null so the prefix route stays total.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        // Reads.
        "splitview:current" => current_layout(app),
        "splitview:layouts" => json!(get_all_layouts(app)),
        "splitview:presets" => json!(get_preset_layouts()),
        "splitview:config" => get_config(app),

        // Layout lifecycle.
        "splitview:applyPreset" => apply_preset(app, a0.as_str().unwrap_or("")),
        "splitview:apply" => apply_layout(app, a0.as_str().unwrap_or("")),
        "splitview:reset" => apply_preset(app, "single"),
        "splitview:save" => {
            let name = a0.as_str().unwrap_or("");
            let desc = args.get(1).and_then(|v| v.as_str());
            save_current_layout(app, name, desc)
        }
        "splitview:delete" => delete_layout(app, a0.as_str().unwrap_or("")),

        // Pane operations.
        "splitview:split" => {
            let pane = a0.as_str().unwrap_or("");
            let direction = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            split_pane(app, pane, direction)
        }
        "splitview:closePane" => close_pane(app, a0.as_str().unwrap_or("")),
        "splitview:resize" => {
            let pane = a0.as_str().unwrap_or("");
            let size = args.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
            resize_pane(app, pane, size)
        }
        "splitview:setContent" => {
            let pane = a0.as_str().unwrap_or("");
            let content_type = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let content_id = args.get(2).and_then(|v| v.as_str());
            set_pane_content(app, pane, content_type, content_id)
        }
        "splitview:swap" => {
            let id1 = a0.as_str().unwrap_or("");
            let id2 = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            swap_panes(app, id1, id2)
        }
        "splitview:focus" => focus_pane(),
        "splitview:paneAt" => pane_at(app, a0.as_str().unwrap_or("")),
        "splitview:maximize" => toggle_maximize(app, a0.as_str().unwrap_or("")),

        // Pane state.
        "splitview:savePaneState" => save_pane_state(app, &a0),
        "splitview:getPaneState" => get_pane_state(app, a0.as_str().unwrap_or("")),

        // Config.
        "splitview:setConfig" => set_config(app, &a0),

        // Event-only broadcast from main.ts (no pure-data payload). The real
        // preset logic lives under splitview:applyPreset; this returned only
        // {success:true} after a webContents.send, which is a live-window
        // side-effect we intentionally do not emit.
        "splitview:apply-preset" => json!({ "success": true }),

        // Anything else in the namespace (e.g. split:cross-drop lives under a
        // different prefix; outbound notify channels are not invokable) -> null.
        _ => Value::Null,
    }
}
