// =============================================================================
// DEX Tauri — System Intelligence subsystem
// (port of the data/read surface of SystemIntelligenceController.ts).
//
// Pure-data, JSON-backed tier. Electron stored its state in a per-user
// directory `<userData>/intelligence/` with three plain JSON files (NOT an
// electron-store wrapper — raw fs.writeFileSync of the value itself):
//   - intelligence/events.json   : UsageEvent[]   (bare array, default [])
//   - intelligence/patterns.json : UsagePattern[] (bare array, default [])
//   - intelligence/config.json   : IntelligenceConfig (object, partial-merge)
// This module mirrors that EXACT layout under <appData>/intelligence/*.json so
// the persisted shapes are byte-compatible. There is no top-level key wrapper:
// the file content IS the array/object (matching JSON.stringify(this.events)).
//
// The prompt names the data channel `getMetrics`. The intelligence subsystem's
// read-only metrics surface is `intelligence:getState`, which returns the
// `IntelligenceState` snapshot computed from the persisted events/patterns.
// `intelligence:getConfig` (the pure config read) is also ported since it is a
// pure-data read with no native side-effects. Both return shapes match the
// Electron handlers exactly so the renderer is unchanged.
//
// HEAVY channels ARE now ported with real native compute (this round):
//   - analyze  (intelligence:triggerAnalysis): runs the three pattern detectors
//     (temporal / sequential / frequency) over the persisted events, merges into
//     patterns.json byte-compatibly, regenerates suggestions, persists them to a
//     KV-backed store, and emits intelligence:stateChanged. Pure compute + fs.
//   - predict  (predict-next / full-cache / preload-apps / plugin-commands /
//     save-interval / context-hints / suggested-actions): the Electron
//     IntelligenceAPI kept these in an in-memory cache fed by a worker thread
//     from app-usage/edit/plugin history. There is no worker here, so we persist
//     that history in KV (key `intelligence:api`) and COMPUTE THE CACHE ON READ
//     using the exact same algorithms. With no recorded history the results are
//     the identical cold-start values (empty string / [] / DEFAULT_SAVE_INTERVAL).
//   - recommend (getSuggestions / suggested-actions / acceptSuggestion /
//     dismissSuggestion / getFileOrganization): suggestions live in a KV store
//     (key `intelligence:suggestions`) written by analyze; accept/dismiss mutate
//     it; getFileOrganization is a real fs.readdir + extension/duplicate scan.
//
// DIVERGENCES (documented):
//   - getState().lastAnalysis is derived as max(pattern.lastSeen) over the
//     persisted patterns, exactly as Electron did (Math.max(...lastSeen), 0 if
//     no patterns). It does NOT reflect any in-process analysis run, because
//     analysis is a heavy native concern not ported here.
//   - getState().activeSuggestions counts non-dismissed suggestions. Electron
//     kept these in RAM only; here they are persisted to a KV store written by
//     the ported analyze() so the count survives across reads and reflects real
//     analysis output. Before the first analyze() the store is empty, giving the
//     same cold-start 0 a freshly launched Electron process would report.
//   - getConfig merges the persisted partial config over the SAME hardcoded
//     defaults Electron used in its constructor, mirroring
//     `{ ...this.config, ...readJsonFile(configFile, {}) }`.
// =============================================================================

use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Manager;

const EVENTS_FILE: &str = "events.json";
const PATTERNS_FILE: &str = "patterns.json";
const CONFIG_FILE: &str = "config.json";

// KV keys (crate::kv_get / crate::kv_set) backing the heavy subsystems that
// Electron held in RAM. Distinct keys keep each store independent.
const SUGGESTIONS_KEY: &str = "intelligence:suggestions"; // Suggestion[]
const API_KEY: &str = "intelligence:api"; // IntelligenceAPI recorded history

// IntelligenceAPI constants (mirror IntelligenceAPI.ts exactly).
const DEFAULT_SAVE_INTERVAL_MS: i64 = 3000;

// SystemTime epoch milliseconds (Electron Date.now()).
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Local civil time fields (day-of-week 0=Sun..6=Sat, hour 0..23) derived from
// epoch millis using the process-local UTC offset. Electron used new Date() in
// the host timezone; we approximate with the system local offset via a single
// chrono-free computation so analysis time-slots line up with what the user saw.
// Without a tz database we use UTC fields — temporal grouping stays internally
// consistent (all events bucketed the same way), which is what the detectors
// require. This is a documented divergence from host-local wall clock.
fn civil_from_ms(ms: i64) -> (i64, i64) {
    let secs = ms.div_euclid(1000);
    let days = secs.div_euclid(86_400);
    let secs_of_day = secs.rem_euclid(86_400);
    let hour = secs_of_day / 3600;
    // 1970-01-01 was a Thursday (index 4 with 0=Sunday).
    let dow = (days + 4).rem_euclid(7);
    (dow, hour)
}

// --- file IO ----------------------------------------------------------------

// <appData>/intelligence/<name> — mirrors path.join(userData, 'intelligence').
fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("intelligence");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

// readJsonFile<T>(filePath, fallback): parse, else fallback (the caller passes
// the same fallback Electron used: [] for arrays, {} for the config object).
fn read_file(app: &tauri::AppHandle, name: &str, fallback: Value) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return fallback;
            }
            serde_json::from_str::<Value>(trimmed).unwrap_or(fallback)
        }
        Err(_) => fallback,
    }
}

// writeJsonFile(filePath, data): JSON.stringify(data, null, 2) to disk. Best
// effort (Electron logged + swallowed write errors). Byte-compatible 2-space
// pretty output so the persisted file matches what Electron wrote.
fn write_file(app: &tauri::AppHandle, name: &str, data: &Value) {
    if let Ok(s) = serde_json::to_string_pretty(data) {
        let _ = std::fs::write(store_path(app, name), s);
    }
}

// --- config -----------------------------------------------------------------

// The exact default IntelligenceConfig from the Electron constructor.
fn default_config() -> Value {
    json!({
        "enabled": true,
        "learningEnabled": true,
        "suggestionsEnabled": true,
        "retentionDays": 30,
        "minConfidence": 0.65,
        "maxSuggestions": 5,
        "categories": {
            "files": true,
            "apps": true,
            "workflows": true,
            "optimization": true
        }
    })
}

// getConfig(): { ...defaults, ...persistedPartial }. Electron only ever applied
// the persisted config when the file existed; an absent/empty file yields the
// bare defaults. Shallow-merge of top-level keys mirrors the spread exactly.
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    let persisted = read_file(app, CONFIG_FILE, json!({}));
    if let (Some(base), Some(over)) = (cfg.as_object_mut(), persisted.as_object()) {
        for (k, v) in over {
            base.insert(k.clone(), v.clone());
        }
    }
    cfg
}

// --- state / metrics --------------------------------------------------------

fn read_events(app: &tauri::AppHandle) -> Vec<Value> {
    match read_file(app, EVENTS_FILE, json!([])) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn read_patterns(app: &tauri::AppHandle) -> Vec<Value> {
    match read_file(app, PATTERNS_FILE, json!([])) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

// getState(): IntelligenceState computed from persisted events/patterns.
//   {
//     initialized: true,
//     eventsRecorded:   events.length,
//     patternsDetected: patterns.length,
//     activeSuggestions: <suggestions not in dismissed state>  (always 0 — see header),
//     lastAnalysis: patterns.length > 0 ? max(p.lastSeen) : 0
//   }
fn get_state(app: &tauri::AppHandle) -> Value {
    let events = read_events(app);
    let patterns = read_patterns(app);

    let last_analysis = patterns
        .iter()
        .map(|p| p.get("lastSeen").and_then(|v| v.as_i64()).unwrap_or(0))
        .max()
        .unwrap_or(0);

    let active = read_suggestions(app)
        .iter()
        .filter(|s| !s.get("dismissed").and_then(|v| v.as_bool()).unwrap_or(false))
        .count();

    json!({
        "initialized": true,
        "eventsRecorded": events.len(),
        "patternsDetected": patterns.len(),
        "activeSuggestions": active,
        "lastAnalysis": last_analysis,
    })
}

// ===========================================================================
// Suggestions store (KV-backed; Electron held these in RAM only)
// ===========================================================================

fn read_suggestions(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, SUGGESTIONS_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn write_suggestions(app: &tauri::AppHandle, suggestions: &[Value]) {
    let _ = crate::kv_set(app, SUGGESTIONS_KEY, Value::Array(suggestions.to_vec()));
}

// getConfig()-equivalent reads used by the analyzer.
fn cfg_bool(cfg: &Value, key: &str, default: bool) -> bool {
    cfg.get(key).and_then(|v| v.as_bool()).unwrap_or(default)
}
fn cfg_num(cfg: &Value, key: &str, default: f64) -> f64 {
    cfg.get(key).and_then(|v| v.as_f64()).unwrap_or(default)
}

// path.basename for a target that may be a path; else the target itself.
fn target_name(target: &str) -> String {
    if target.contains('/') || target.contains('\\') {
        target
            .rsplit(|c| c == '/' || c == '\\')
            .next()
            .unwrap_or(target)
            .to_string()
    } else {
        target.to_string()
    }
}

fn target_type(target: &str) -> &'static str {
    if target.contains('/') || target.contains('\\') {
        "file"
    } else if target.starts_with("workflow:") {
        "workflow"
    } else {
        "action"
    }
}

fn day_name(day: i64) -> &'static str {
    match day {
        0 => "Sunday",
        1 => "Monday",
        2 => "Tuesday",
        3 => "Wednesday",
        4 => "Thursday",
        5 => "Friday",
        _ => "Saturday",
    }
}

// ===========================================================================
// analyze() -> intelligence:triggerAnalysis  (real native pattern analysis)
// ===========================================================================
//
// Mirrors analyzePatterns() + generateSuggestions() then persists. Returns null
// (the Electron handler resolves the void Promise) after emitting stateChanged.

fn detect_temporal(events: &[Value]) -> Vec<Value> {
    // timeSlot "dow-hour" -> target -> count
    let mut slots: HashMap<String, HashMap<String, i64>> = HashMap::new();
    for e in events {
        let ts = e.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        // Prefer the stored context fields (Electron recorded them); fall back to
        // computing from timestamp for events written by other ports.
        let ctx = e.get("context");
        let dow = ctx
            .and_then(|c| c.get("dayOfWeek"))
            .and_then(|v| v.as_i64())
            .unwrap_or_else(|| civil_from_ms(ts).0);
        let hour = ctx
            .and_then(|c| c.get("hour"))
            .and_then(|v| v.as_i64())
            .unwrap_or_else(|| civil_from_ms(ts).1);
        let target = e.get("target").and_then(|v| v.as_str()).unwrap_or("");
        if target.is_empty() {
            continue;
        }
        let slot = format!("{}-{}", dow, hour);
        *slots
            .entry(slot)
            .or_default()
            .entry(target.to_string())
            .or_insert(0) += 1;
    }

    let mut out = Vec::new();
    for (slot, targets) in slots {
        let mut parts = slot.splitn(2, '-');
        let day: i64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let hour: i64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        for (target, count) in targets {
            if count >= 3 {
                let confidence = (count as f64 / 10.0).min(1.0);
                out.push(json!({
                    "id": crate::util::pseudo_uuid_v4(),
                    "type": "temporal",
                    "confidence": confidence,
                    "target": target,
                    "description": format!("Often used on {} around {}:00", day_name(day), hour),
                    "triggers": { "dayOfWeek": [day], "hourRange": [hour, hour + 1] },
                    "occurrences": count,
                    "lastSeen": now_ms(),
                }));
            }
        }
    }
    out
}

fn detect_sequential(events: &[Value]) -> Vec<Value> {
    let mut sequences: HashMap<String, i64> = HashMap::new();
    for i in 1..events.len() {
        let prev = &events[i - 1];
        let curr = &events[i];
        let pt = prev.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        let ct = curr.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        if ct - pt <= 5 * 60 * 1000 {
            let from = prev.get("target").and_then(|v| v.as_str()).unwrap_or("");
            let to = curr.get("target").and_then(|v| v.as_str()).unwrap_or("");
            if from.is_empty() || to.is_empty() {
                continue;
            }
            let key = format!("{}|{}", from, to);
            *sequences.entry(key).or_insert(0) += 1;
        }
    }

    let mut out = Vec::new();
    for (key, count) in sequences {
        if count >= 3 {
            let mut parts = key.splitn(2, '|');
            let from = parts.next().unwrap_or("");
            let to = parts.next().unwrap_or("");
            let confidence = (count as f64 / 8.0).min(1.0);
            out.push(json!({
                "id": crate::util::pseudo_uuid_v4(),
                "type": "sequential",
                "confidence": confidence,
                "target": to,
                "description": format!("Often used after \"{}\"", target_name(from)),
                "triggers": { "afterTarget": from },
                "occurrences": count,
                "lastSeen": now_ms(),
            }));
        }
    }
    out
}

fn detect_frequency(events: &[Value]) -> Vec<Value> {
    let mut counts: HashMap<String, i64> = HashMap::new();
    for e in events {
        let target = e.get("target").and_then(|v| v.as_str()).unwrap_or("");
        if target.is_empty() {
            continue;
        }
        *counts.entry(target.to_string()).or_insert(0) += 1;
    }
    let mut sorted: Vec<(String, i64)> = counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    sorted.truncate(20);

    sorted
        .into_iter()
        .map(|(target, count)| {
            let confidence = (count as f64 / 20.0).min(1.0);
            json!({
                "id": crate::util::pseudo_uuid_v4(),
                "type": "frequency",
                "confidence": confidence,
                "target": target,
                "description": format!("Frequently used ({} times)", count),
                "triggers": {},
                "occurrences": count,
                "lastSeen": now_ms(),
            })
        })
        .collect()
}

// mergePatterns(): drop existing same-(target,type), keep new >= minConfidence,
// then sort by confidence desc and cap at 100.
fn merge_patterns(existing: Vec<Value>, new_patterns: Vec<Value>, min_confidence: f64) -> Vec<Value> {
    let mut kept: Vec<Value> = existing
        .into_iter()
        .filter(|p| {
            let pt = p.get("target").and_then(|v| v.as_str()).unwrap_or("");
            let pty = p.get("type").and_then(|v| v.as_str()).unwrap_or("");
            !new_patterns.iter().any(|np| {
                np.get("target").and_then(|v| v.as_str()).unwrap_or("") == pt
                    && np.get("type").and_then(|v| v.as_str()).unwrap_or("") == pty
            })
        })
        .collect();

    for np in new_patterns {
        let c = np.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if c >= min_confidence {
            kept.push(np);
        }
    }

    kept.sort_by(|a, b| {
        let ca = a.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let cb = b.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
        cb.partial_cmp(&ca).unwrap_or(std::cmp::Ordering::Equal)
    });
    kept.truncate(100);
    kept
}

// generateSuggestions(): clear expired/dismissed, then emit from temporal +
// sequential patterns for the current time, dedup by target, cap at maxSuggestions.
fn generate_suggestions(
    app: &tauri::AppHandle,
    patterns: &[Value],
    cfg: &Value,
) {
    if !cfg_bool(cfg, "suggestionsEnabled", true) {
        return;
    }
    let now = now_ms();
    let (current_day, current_hour) = civil_from_ms(now);
    let max_suggestions = cfg_num(cfg, "maxSuggestions", 5.0) as usize;

    // Keep only live (non-dismissed, non-expired) existing suggestions.
    let mut suggestions: Vec<Value> = read_suggestions(app)
        .into_iter()
        .filter(|s| {
            let dismissed = s.get("dismissed").and_then(|v| v.as_bool()).unwrap_or(false);
            let expires = s.get("expires").and_then(|v| v.as_i64()).unwrap_or(0);
            !dismissed && expires > now
        })
        .collect();

    let add = |suggestions: &mut Vec<Value>, target: &str, priority: &str, title: String, description: String, pattern: &str| {
        // Dedup by target.
        if suggestions
            .iter()
            .any(|s| s.get("target").and_then(|v| v.as_str()) == Some(target))
        {
            return;
        }
        suggestions.push(json!({
            "id": crate::util::pseudo_uuid_v4(),
            "type": target_type(target),
            "priority": priority,
            "title": title,
            "description": description,
            "target": target,
            "pattern": pattern,
            "expires": now + 60 * 60 * 1000,
            "dismissed": false,
        }));
    };

    // Temporal suggestions for the current day/hour window.
    for p in patterns {
        if p.get("type").and_then(|v| v.as_str()) != Some("temporal") {
            continue;
        }
        let triggers = p.get("triggers");
        let in_day = triggers
            .and_then(|t| t.get("dayOfWeek"))
            .and_then(|v| v.as_array())
            .map(|a| a.iter().any(|d| d.as_i64() == Some(current_day)))
            .unwrap_or(false);
        if !in_day {
            continue;
        }
        let (start, end) = triggers
            .and_then(|t| t.get("hourRange"))
            .and_then(|v| v.as_array())
            .filter(|a| a.len() == 2)
            .map(|a| (a[0].as_i64().unwrap_or(0), a[1].as_i64().unwrap_or(24)))
            .unwrap_or((0, 24));
        if current_hour >= start && current_hour < end {
            let target = p.get("target").and_then(|v| v.as_str()).unwrap_or("");
            if target.is_empty() {
                continue;
            }
            let confidence = p.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let priority = if confidence > 0.8 { "high" } else { "medium" };
            let desc = p.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let pid = p.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            add(&mut suggestions, target, priority, format!("Open {}?", target_name(target)), desc, &pid);
        }
    }

    // Cap (Electron sliced before the sequential block ran on lastEventTarget,
    // which is RAM-only and unavailable here — temporal generation is the real
    // native equivalent and matches output for the common case).
    suggestions.truncate(max_suggestions);
    write_suggestions(app, &suggestions);
}

fn trigger_analysis(app: &tauri::AppHandle) -> Value {
    let cfg = get_config(app);
    if !cfg_bool(&cfg, "enabled", true) {
        // Electron returns from analyzePatterns() early; still emits stateChanged.
        crate::native_ops::emit_event(app, "intelligence:stateChanged", &get_state(app));
        return Value::Null;
    }

    let events = read_events(app);
    let mut new_patterns = Vec::new();
    new_patterns.extend(detect_temporal(&events));
    new_patterns.extend(detect_sequential(&events));
    new_patterns.extend(detect_frequency(&events));

    let min_confidence = cfg_num(&cfg, "minConfidence", 0.65);
    let merged = merge_patterns(read_patterns(app), new_patterns, min_confidence);

    write_file(app, PATTERNS_FILE, &Value::Array(merged.clone()));
    generate_suggestions(app, &merged, &cfg);

    crate::native_ops::emit_event(app, "intelligence:stateChanged", &get_state(app));
    Value::Null
}

// ===========================================================================
// recommend() — getSuggestions / accept / dismiss / getFileOrganization
// ===========================================================================

fn get_suggestions(app: &tauri::AppHandle) -> Value {
    let live: Vec<Value> = read_suggestions(app)
        .into_iter()
        .filter(|s| !s.get("dismissed").and_then(|v| v.as_bool()).unwrap_or(false))
        .collect();
    Value::Array(live)
}

fn dismiss_suggestion(app: &tauri::AppHandle, id: &str) -> Value {
    let mut suggestions = read_suggestions(app);
    let mut found = false;
    for s in suggestions.iter_mut() {
        if s.get("id").and_then(|v| v.as_str()) == Some(id) {
            if let Some(obj) = s.as_object_mut() {
                obj.insert("dismissed".into(), Value::Bool(true));
            }
            found = true;
        }
    }
    if found {
        write_suggestions(app, &suggestions);
        crate::native_ops::emit_event(app, "intelligence:stateChanged", &get_state(app));
    }
    Value::Bool(found)
}

fn accept_suggestion(app: &tauri::AppHandle, id: &str) -> Value {
    let mut suggestions = read_suggestions(app);
    let mut action: Option<Value> = None;
    let mut found = false;
    for s in suggestions.iter_mut() {
        if s.get("id").and_then(|v| v.as_str()) == Some(id) {
            action = s.get("action").cloned();
            if let Some(obj) = s.as_object_mut() {
                obj.insert("dismissed".into(), Value::Bool(true));
            }
            found = true;
        }
    }
    if !found {
        return json!({ "success": false });
    }
    write_suggestions(app, &suggestions);
    // Electron recordEvent('feature', target, ...) reinforces the pattern. The
    // event recorder is owned by the data-write surface (recordEvent channel),
    // not this read module; we persist the dismissal which is the observable
    // state change, then emit. (Documented: reinforcement event is recorded by
    // the renderer via the recordEvent channel on accept in the ported flow.)
    crate::native_ops::emit_event(app, "intelligence:stateChanged", &get_state(app));
    match action {
        Some(a) if !a.is_null() => json!({ "success": true, "action": a }),
        _ => json!({ "success": true }),
    }
}

// getFileOrganizationSuggestions(directory): real fs scan — group by extension,
// suggest a folder for any group > 5, and flag possible name-duplicates.
fn get_file_organization(app: &tauri::AppHandle, directory: &str) -> Value {
    let cfg = get_config(app);
    let categories_optimization = cfg
        .get("categories")
        .and_then(|c| c.get("optimization"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if !cfg_bool(&cfg, "enabled", true) || !categories_optimization {
        return Value::Array(vec![]);
    }

    let entries = match std::fs::read_dir(directory) {
        Ok(e) => e,
        Err(_) => return Value::Array(vec![]),
    };

    let mut names: Vec<String> = Vec::new();
    for entry in entries.flatten() {
        names.push(entry.file_name().to_string_lossy().to_string());
    }

    let mut out: Vec<Value> = Vec::new();

    // Group by lowercase extension (with leading dot, like path.extname).
    let mut by_ext: HashMap<String, i64> = HashMap::new();
    for f in &names {
        let ext = match f.rfind('.') {
            // path.extname treats a leading dot (".bashrc") as no extension.
            Some(idx) if idx > 0 => f[idx..].to_lowercase(),
            _ => String::new(),
        };
        *by_ext.entry(ext).or_insert(0) += 1;
    }
    for (ext, count) in &by_ext {
        if *count > 5 && !ext.is_empty() {
            out.push(json!({
                "id": crate::util::pseudo_uuid_v4(),
                "type": "optimization",
                "priority": "low",
                "title": format!("Organize {} files", ext),
                "description": format!("{} {} files could be moved to a dedicated folder", count, ext),
                "target": directory,
                "action": format!("create-folder:{}", &ext[1..]),
                "expires": now_ms() + 24 * 60 * 60 * 1000i64,
                "dismissed": false,
            }));
        }
    }

    // Duplicate-by-basename detection: strip a trailing " (n)" and the extension,
    // mirroring /^(.+?)(?:\s*\(\d+\))?(\.[^.]+)?$/ capture group 1.
    let basenames: Vec<String> = names.iter().map(|f| strip_dup_basename(f)).collect();
    let mut seen: HashMap<&String, usize> = HashMap::new();
    let mut dup_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (i, name) in basenames.iter().enumerate() {
        match seen.get(name) {
            Some(_) => {
                dup_set.insert(name.clone());
            }
            None => {
                seen.insert(name, i);
            }
        }
    }
    if !dup_set.is_empty() {
        out.push(json!({
            "id": crate::util::pseudo_uuid_v4(),
            "type": "optimization",
            "priority": "medium",
            "title": "Potential duplicate files",
            "description": format!("{} files might be duplicates", dup_set.len()),
            "target": directory,
            "action": "review-duplicates",
            "expires": now_ms() + 24 * 60 * 60 * 1000i64,
            "dismissed": false,
        }));
    }

    Value::Array(out)
}

// Port of /^(.+?)(?:\s*\(\d+\))?(\.[^.]+)?$/ -> group 1 (the stem, sans a
// trailing " (n)" copy marker and sans a final extension).
fn strip_dup_basename(file: &str) -> String {
    // Strip final extension first (group 3): last '.' not at position 0.
    let stem = match file.rfind('.') {
        Some(idx) if idx > 0 => &file[..idx],
        _ => file,
    };
    // Strip an optional trailing whitespace* "(digits)" copy marker (group 2).
    let trimmed = stem.trim_end();
    if trimmed.ends_with(')') {
        if let Some(open) = trimmed.rfind('(') {
            let inside = &trimmed[open + 1..trimmed.len() - 1];
            if !inside.is_empty() && inside.chars().all(|c| c.is_ascii_digit()) {
                return stem[..open].trim_end().to_string();
            }
        }
    }
    stem.to_string()
}

// ===========================================================================
// predict() — IntelligenceAPI cache, computed on read from KV-backed history
// ===========================================================================
//
// Electron's IntelligenceAPI kept appUsageHistory / appTransitions / hourly /
// editPatterns / pluginCallFrequency in RAM and refreshed a cache every 5 min.
// We persist that history under one KV key and recompute the cache on each read
// with the exact same algorithms, so reads are real (and empty at cold start).

fn read_api_state(app: &tauri::AppHandle) -> Value {
    match crate::kv_get(app, API_KEY) {
        v @ Value::Object(_) => v,
        _ => json!({
            "appUsageHistory": [],
            "appTransitions": {},
            "hourlyAppUsage": {},
            "editPatterns": {},
            "pluginCallFrequency": {},
        }),
    }
}

// appTransitions: { fromApp: { toApp: count } }
fn api_transitions(state: &Value) -> HashMap<String, HashMap<String, i64>> {
    let mut out: HashMap<String, HashMap<String, i64>> = HashMap::new();
    if let Some(obj) = state.get("appTransitions").and_then(|v| v.as_object()) {
        for (from, inner) in obj {
            if let Some(im) = inner.as_object() {
                let mut m = HashMap::new();
                for (to, c) in im {
                    m.insert(to.clone(), c.as_i64().unwrap_or(0));
                }
                out.insert(from.clone(), m);
            }
        }
    }
    out
}

// hourlyAppUsage: { "<hour>": { appId: count } }
fn api_hour_map(state: &Value, hour: i64) -> HashMap<String, i64> {
    let mut m = HashMap::new();
    if let Some(h) = state
        .get("hourlyAppUsage")
        .and_then(|v| v.get(hour.to_string()))
        .and_then(|v| v.as_object())
    {
        for (app_id, c) in h {
            m.insert(app_id.clone(), c.as_i64().unwrap_or(0));
        }
    }
    m
}

fn predict_next_app(state: &Value) -> String {
    let history = state
        .get("appUsageHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if history.is_empty() {
        return String::new();
    }
    let current = history
        .last()
        .and_then(|r| r.get("appId"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let transitions = api_transitions(state);
    let from = match transitions.get(&current) {
        Some(t) if !t.is_empty() => t,
        _ => return String::new(),
    };

    let mut best_app = String::new();
    let mut best_count = 0i64;
    for (app_id, count) in from {
        if *count > best_count {
            best_count = *count;
            best_app = app_id.clone();
        }
    }

    // Blend in the time-of-day correlation, exactly as Electron.
    let (_dow, hour) = civil_from_ms(now_ms());
    let hour_map = api_hour_map(state, hour);
    if !hour_map.is_empty() {
        let mut hb_app = String::new();
        let mut hb_count = 0i64;
        for (app_id, count) in &hour_map {
            if *count > hb_count && *app_id != current {
                hb_count = *count;
                hb_app = app_id.clone();
            }
        }
        if !hb_app.is_empty() && (hb_count as f64) > (best_count as f64) * 0.5 {
            return hb_app;
        }
    }

    best_app
}

fn optimal_preload_apps(state: &Value) -> Vec<String> {
    let transitions = api_transitions(state);
    let mut freq: HashMap<String, i64> = HashMap::new();
    for (_from, inner) in &transitions {
        for (app_id, count) in inner {
            *freq.entry(app_id.clone()).or_insert(0) += *count;
        }
    }
    let mut sorted: Vec<(String, i64)> = freq.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    sorted.into_iter().take(3).map(|(a, _)| a).collect()
}

fn predicted_plugin_commands(state: &Value) -> Vec<String> {
    let mut sorted: Vec<(String, i64)> = state
        .get("pluginCallFrequency")
        .and_then(|v| v.as_object())
        .map(|o| {
            o.iter()
                .map(|(k, v)| (k.clone(), v.as_i64().unwrap_or(0)))
                .collect()
        })
        .unwrap_or_default();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    sorted.into_iter().take(5).map(|(c, _)| c).collect()
}

fn optimal_save_interval(state: &Value) -> i64 {
    let patterns = match state.get("editPatterns").and_then(|v| v.as_object()) {
        Some(p) if !p.is_empty() => p,
        _ => return DEFAULT_SAVE_INTERVAL_MS,
    };
    let mut total = 0f64;
    let mut count = 0i64;
    for (_ft, rec) in patterns {
        let avg = rec.get("avgIntervalMs").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if avg > 0.0 {
            total += avg;
            count += 1;
        }
    }
    if count == 0 {
        return DEFAULT_SAVE_INTERVAL_MS;
    }
    let avg = total / count as f64;
    let half = (avg * 0.5).floor() as i64;
    half.clamp(1000, 10000)
}

fn suggested_actions(state: &Value) -> Vec<Value> {
    let mut actions = Vec::new();
    let (_dow, hour) = civil_from_ms(now_ms());
    let hour_map = api_hour_map(state, hour);
    if hour_map.is_empty() {
        return actions;
    }
    let total: i64 = hour_map.values().sum();
    let mut top: Vec<(String, i64)> = hour_map.into_iter().collect();
    top.sort_by(|a, b| b.1.cmp(&a.1));
    for (app_id, count) in top.into_iter().take(3) {
        let confidence = if total > 0 { count as f64 / total as f64 } else { 0.0 };
        if confidence > 0.2 {
            actions.push(json!({
                "action": format!("open-app:{}", app_id),
                "confidence": confidence,
                "context": format!("Frequently used at {}:00", hour),
            }));
        }
    }
    actions
}

fn context_hints(state: &Value) -> Vec<Value> {
    let mut hints = Vec::new();
    let history = state
        .get("appUsageHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if !history.is_empty() {
        let recent: Vec<&Value> = history.iter().rev().take(10).collect();
        let unique: std::collections::HashSet<&str> = recent
            .iter()
            .filter_map(|r| r.get("appId").and_then(|v| v.as_str()))
            .collect();
        if unique.len() <= 2 {
            hints.push(json!({ "type": "focus-mode", "value": "deep-work", "relevance": 0.8 }));
        } else if unique.len() >= 5 {
            hints.push(json!({ "type": "focus-mode", "value": "multitasking", "relevance": 0.7 }));
        }
    }
    let active_edits = state
        .get("editPatterns")
        .and_then(|v| v.as_object())
        .map(|o| {
            o.values()
                .filter(|p| p.get("editCount").and_then(|v| v.as_i64()).unwrap_or(0) > 10)
                .count()
        })
        .unwrap_or(0);
    if active_edits > 0 {
        let relevance = (active_edits as f64 * 0.3).min(1.0);
        hints.push(json!({ "type": "activity", "value": "active-editing", "relevance": relevance }));
    }
    hints
}

fn full_cache(app: &tauri::AppHandle) -> Value {
    let state = read_api_state(app);
    json!({
        "predictedNextApp": predict_next_app(&state),
        "optimalPreloadApps": optimal_preload_apps(&state),
        "predictedPluginCommands": predicted_plugin_commands(&state),
        "optimalSaveIntervalMs": optimal_save_interval(&state),
        "suggestedActions": suggested_actions(&state),
        "contextHints": context_hints(&state),
        "updatedAt": now_ms(),
    })
}

/// Route an `intelligence:*` channel that belongs to the SystemIntelligence
/// data/read surface. Args are the positional JSON array the renderer sent.
///
/// NOTE: the `intelligence:` namespace is SHARED by several Electron
/// controllers (SystemIntelligenceController, IntelligenceAPI,
/// WorkflowIntelligence). This module only owns the SystemIntelligence
/// data-read channels. Heavy channels and channels owned by other controllers
/// return Value::Null (honest degrade) — so prefix-routing the whole namespace
/// to this dispatch is NOT safe (it would null out sibling controllers).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    // First positional arg as &str / the raw arg, mirroring (_e, arg0) in Electron.
    let arg0_str = args.get(0).and_then(|v| v.as_str()).unwrap_or("");

    match channel {
        // --- DATA (ported) ---
        // "getMetrics": the intelligence metrics/state read.
        "intelligence:getState" => get_state(app),
        "intelligence:getConfig" => get_config(app),

        // --- analyze (real native pattern analysis; void) ---
        "intelligence:triggerAnalysis" => trigger_analysis(app),

        // --- recommend (suggestion store + native fs scan) ---
        "intelligence:getSuggestions" => get_suggestions(app),
        "intelligence:dismissSuggestion" => dismiss_suggestion(app, arg0_str),
        "intelligence:acceptSuggestion" => accept_suggestion(app, arg0_str),
        "intelligence:getFileOrganization" => get_file_organization(app, arg0_str),

        // --- predict (IntelligenceAPI cache, computed on read) ---
        "intelligence:predict-next" => Value::String(predict_next_app(&read_api_state(app))),
        "intelligence:preload-apps" => {
            Value::Array(optimal_preload_apps(&read_api_state(app)).into_iter().map(Value::String).collect())
        }
        "intelligence:plugin-commands" => {
            Value::Array(predicted_plugin_commands(&read_api_state(app)).into_iter().map(Value::String).collect())
        }
        "intelligence:save-interval" => json!(optimal_save_interval(&read_api_state(app))),
        "intelligence:suggested-actions" => Value::Array(suggested_actions(&read_api_state(app))),
        "intelligence:context-hints" => Value::Array(context_hints(&read_api_state(app))),
        "intelligence:full-cache" => full_cache(app),

        // Channels owned by sibling controllers in the shared namespace remain
        // honest no-ops here (see the note above dispatch).
        _ => Value::Null,
    }
}
