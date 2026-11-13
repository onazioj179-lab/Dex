// =============================================================================
// DEX Tauri — Pattern Learning subsystem (port of core/PatternLearning.ts).
//
// Local-only, privacy-first usage-pattern learning. Electron persisted the WHOLE
// PatternData object to a single plain file (NOT electron-store):
//   fs.writeFileSync(<userData>/pattern-data.json, JSON.stringify(this.patterns))
// so there is NO top-level key wrapper — the file IS the PatternData object. This
// port mirrors that exactly under <appData>/pattern-data.json with the same empty
// shape (createEmptyPatterns) and the same return shapes for every getter, so the
// renderer (services/usePatternLearning.ts, standalone/Learn.tsx) is unchanged.
//
// In Electron the engine kept patterns in memory and debounced saves; here every
// channel is stateless read-modify-write against the JSON file (correct for an
// IPC-per-call model). Mutating channels return null, matching the void handlers.
//
// DIVERGENCES (documented):
//  1. NAMESPACE COLLISION: the `patterns:` prefix is shared with a SECOND,
//     out-of-scope subsystem — core/PatternDetectionEngine.ts (patterns:enable,
//     :disable, :pause, :resume, :reset, :getConfig, :updateConfig, :getSummary,
//     :getPatterns, :recordFeatureUse). Those are NOT handled here. A blanket
//     `channel.starts_with("patterns:")` route to this dispatch would shadow them
//     (they'd degrade to null). The orchestrator must route the explicit
//     PatternLearning channels listed in `dispatch` to this module, not the bare
//     prefix. Hence prefixRouteSafe = false.
//  2. TIME (same precedent as analytics.rs): Electron used LOCAL hour/weekday
//     (new Date(ts).getHours()/getDay()). To stay tz-crate-free, hour and weekday
//     bucketing here are UTC. Histograms shift by the local-UTC offset; counts and
//     ranking are otherwise identical.
//  3. KEY ORDER: serde_json (no preserve_order feature) stores object keys sorted,
//     not insertion-ordered. Sorting is by count (primary, correct); only the
//     tie-break order among equal-count items differs from JS Object.entries.
//     Same behavior as analytics.rs.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

const DATA_FILE: &str = "pattern-data.json";
const DAY_MS: i64 = 86_400_000;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// UTC hour [0,23] for an instant.
fn utc_hour(ms: i64) -> i64 {
    let secs_of_day = (ms.div_euclid(1000)).rem_euclid(86_400);
    secs_of_day / 3600
}

// UTC weekday: 0 = Sunday .. 6 = Saturday (mirrors getDay()).
fn utc_dow(ms: i64) -> i64 {
    (ms.div_euclid(DAY_MS) % 7 + 4) % 7
}

// --- file IO ----------------------------------------------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(DATA_FILE)
}

// createEmptyPatterns() — exact shape Electron seeds and persists.
fn empty_patterns() -> Value {
    json!({
        "hourlyUsage": {},
        "dayOfWeekUsage": {},
        "sequences": {},
        "fileTypeToApp": {},
        "toolCombinations": {},
        "totalUsage": {},
        "recentUsage": [],
        "sessionLengths": [],
        "averageSessionLength": 0,
        "lastUpdated": now_ms(),
        "version": 1,
    })
}

// Load patterns merged over the empty shape: { ...empty, ...loaded } (Electron).
fn load(app: &tauri::AppHandle) -> Value {
    let mut base = empty_patterns();
    if let Ok(raw) = std::fs::read_to_string(store_path(app)) {
        if let Ok(loaded) = serde_json::from_str::<Value>(&raw) {
            if let (Some(b), Some(l)) = (base.as_object_mut(), loaded.as_object()) {
                for (k, v) in l {
                    b.insert(k.clone(), v.clone());
                }
            }
        }
    }
    base
}

fn save(app: &tauri::AppHandle, patterns: &Value) {
    if let Ok(s) = serde_json::to_string_pretty(patterns) {
        let _ = crate::write_atomic(store_path(app), s);
    }
}

// --- helpers over a Map<String, count> --------------------------------------

fn obj<'a>(p: &'a Value, key: &str) -> Option<&'a Map<String, Value>> {
    p.get(key).and_then(|v| v.as_object())
}

// Sort a count-map descending by count, take `limit`, map each entry via `f`.
fn top_n<F>(counts: Option<&Map<String, Value>>, limit: usize, f: F) -> Vec<Value>
where
    F: Fn(&str, i64) -> Value,
{
    let mut v: Vec<(String, i64)> = counts
        .map(|m| {
            m.iter()
                .map(|(k, val)| (k.clone(), val.as_i64().unwrap_or(0)))
                .collect()
        })
        .unwrap_or_default();
    v.sort_by(|a, b| b.1.cmp(&a.1));
    v.truncate(limit);
    v.into_iter().map(|(k, c)| f(&k, c)).collect()
}

// Increment counts[outer][inner] by 1, creating nested objects as needed.
fn bump_nested(patterns: &mut Value, group: &str, outer: &str, inner: &str) {
    let root = match patterns.as_object_mut() {
        Some(o) => o,
        None => return,
    };
    let grp = root
        .entry(group.to_string())
        .or_insert_with(|| json!({}));
    if !grp.is_object() {
        *grp = json!({});
    }
    let grp = grp.as_object_mut().unwrap();
    let inner_map = grp
        .entry(outer.to_string())
        .or_insert_with(|| json!({}));
    if !inner_map.is_object() {
        *inner_map = json!({});
    }
    let inner_map = inner_map.as_object_mut().unwrap();
    let c = inner_map.get(inner).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
    inner_map.insert(inner.to_string(), json!(c));
}

// --- record path (updatePatterns) -------------------------------------------

// lowercase file extension incl. leading dot (mirrors path.extname().toLowerCase()).
fn ext_of(file_path: &str) -> String {
    let name = file_path.rsplit(|c| c == '/' || c == '\\').next().unwrap_or(file_path);
    match name.rfind('.') {
        // No dot, or leading-dot dotfile with nothing before it -> "" (extname).
        Some(i) if i > 0 => name[i..].to_lowercase(),
        _ => String::new(),
    }
}

// Apply a single UsageEvent to patterns, mirroring updatePatterns().
fn update_patterns(
    patterns: &mut Value,
    etype: &str,
    target: &str,
    context: Option<&str>,
    extension: Option<&str>,
) {
    let ts = now_ms();
    let hour = utc_hour(ts).to_string();
    let dow = utc_dow(ts).to_string();

    bump_nested(patterns, "hourlyUsage", &hour, target);
    bump_nested(patterns, "dayOfWeekUsage", &dow, target);

    // sequences: after lastUsed -> target.
    let last_used = patterns
        .get("recentUsage")
        .and_then(|v| v.as_array())
        .and_then(|a| a.last())
        .and_then(|v| v.as_str())
        .map(String::from);
    if let Some(last) = last_used {
        bump_nested(patterns, "sequences", &last, target);
    }

    // fileTypeToApp: only for file_open with an extension AND a context (appId).
    if etype == "file_open" {
        if let (Some(ext), Some(ctx)) = (extension, context) {
            if !ext.is_empty() && !ctx.is_empty() {
                bump_nested(patterns, "fileTypeToApp", ext, ctx);
            }
        }
    }

    // totalUsage[target] += 1.
    if let Some(tot) = patterns.get_mut("totalUsage").and_then(|v| v.as_object_mut()) {
        let c = tot.get(target).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
        tot.insert(target.to_string(), json!(c));
    }

    // recentUsage push, keep last 50.
    if let Some(recent) = patterns.get_mut("recentUsage").and_then(|v| v.as_array_mut()) {
        recent.push(json!(target));
        if recent.len() > 50 {
            let start = recent.len() - 50;
            recent.drain(0..start);
        }
    }

    if let Some(o) = patterns.as_object_mut() {
        o.insert("lastUpdated".into(), json!(ts));
    }
}

fn record_event(
    app: &tauri::AppHandle,
    etype: &str,
    target: &str,
    context: Option<&str>,
    extension: Option<&str>,
) {
    let mut patterns = load(app);
    update_patterns(&mut patterns, etype, target, context, extension);
    save(app, &patterns);
}

fn record_tool_combination(app: &tauri::AppHandle, tool1: &str, tool2: &str) {
    let mut patterns = load(app);
    // Both directions, for symmetric lookup (matches Electron).
    bump_nested(&mut patterns, "toolCombinations", tool1, tool2);
    bump_nested(&mut patterns, "toolCombinations", tool2, tool1);
    save(app, &patterns);
}

// --- getters ----------------------------------------------------------------

// getSuggestions(context?) -> Suggestion[].
fn get_suggestions(app: &tauri::AppHandle, context: &Value) -> Value {
    let patterns = load(app);
    let limit = context.get("limit").and_then(|v| v.as_u64()).unwrap_or(5) as usize;
    let now = now_ms();
    let hour = utc_hour(now).to_string();

    let mut suggestions: Vec<Value> = Vec::new();
    let total_usage = obj(&patterns, "totalUsage");

    let total_for = |target: &str| -> f64 {
        total_usage
            .and_then(|m| m.get(target))
            .and_then(|v| v.as_f64())
            .filter(|&n| n != 0.0)
            .unwrap_or(1.0)
    };
    let min_f = |a: f64, b: f64| if a < b { a } else { b };

    // Time-based: top 3 of this hour, confidence = min(count/totalForTarget, 0.9).
    let hourly = obj(&patterns, "hourlyUsage").and_then(|m| m.get(&hour)).and_then(|v| v.as_object());
    for (target, count) in top_pairs(hourly, 3) {
        let confidence = min_f(count as f64 / total_for(&target), 0.9);
        if confidence > 0.2 {
            suggestions.push(json!({
                "type": "app",
                "target": target,
                "reason": "time_pattern",
                "confidence": confidence,
                "context": format!("Often used at {}:00", hour),
            }));
        }
    }

    // Sequence-based: top 3 after currentApp, confidence = min(count/10, 0.8).
    if let Some(current_app) = context.get("currentApp").and_then(|v| v.as_str()) {
        let seq = obj(&patterns, "sequences").and_then(|m| m.get(current_app)).and_then(|v| v.as_object());
        for (target, count) in top_pairs(seq, 3) {
            if target != current_app {
                suggestions.push(json!({
                    "type": "app",
                    "target": target,
                    "reason": "sequence",
                    "confidence": min_f(count as f64 / 10.0, 0.8),
                    "context": format!("Often used after {}", current_app),
                }));
            }
        }
    }

    // File-type: top 2 for fileExtension, confidence = min(count/5, 0.9).
    if let Some(ext) = context.get("fileExtension").and_then(|v| v.as_str()) {
        let apps = obj(&patterns, "fileTypeToApp").and_then(|m| m.get(ext)).and_then(|v| v.as_object());
        for (target, count) in top_pairs(apps, 2) {
            suggestions.push(json!({
                "type": "app",
                "target": target,
                "reason": "context",
                "confidence": min_f(count as f64 / 5.0, 0.9),
                "context": format!("Usually opens {} files", ext),
            }));
        }
    }

    // Most frequent: top 5, skip already-present targets, confidence = min(count/100, 0.7).
    for (target, count) in top_pairs(total_usage, 5) {
        let exists = suggestions.iter().any(|s| s.get("target").and_then(|v| v.as_str()) == Some(target.as_str()));
        if !exists {
            suggestions.push(json!({
                "type": "app",
                "target": target,
                "reason": "frequent",
                "confidence": min_f(count as f64 / 100.0, 0.7),
                "context": format!("Used {} times", count),
            }));
        }
    }

    // Dedup by target (keep first), sort by confidence desc, slice to limit.
    let mut seen: Vec<String> = Vec::new();
    let mut deduped: Vec<Value> = Vec::new();
    for s in suggestions {
        let t = s.get("target").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if seen.contains(&t) {
            continue;
        }
        seen.push(t);
        deduped.push(s);
    }
    deduped.sort_by(|a, b| {
        let ca = a.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let cb = b.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
        cb.partial_cmp(&ca).unwrap_or(std::cmp::Ordering::Equal)
    });
    deduped.truncate(limit);
    json!(deduped)
}

// Sort a count-map desc by count, take `limit` -> Vec<(name, count)>.
fn top_pairs(counts: Option<&Map<String, Value>>, limit: usize) -> Vec<(String, i64)> {
    let mut v: Vec<(String, i64)> = counts
        .map(|m| m.iter().map(|(k, val)| (k.clone(), val.as_i64().unwrap_or(0))).collect())
        .unwrap_or_default();
    v.sort_by(|a, b| b.1.cmp(&a.1));
    v.truncate(limit);
    v
}

// getFrequentItems(type?, limit=10) -> { id, count }[]. (type is ignored, as in Electron.)
fn get_frequent(app: &tauri::AppHandle, limit: usize) -> Value {
    let patterns = load(app);
    json!(top_n(obj(&patterns, "totalUsage"), limit, |id, count| json!({ "id": id, "count": count })))
}

// getRecentItems(limit=10) -> string[] (reversed recentUsage, sliced).
fn get_recent(app: &tauri::AppHandle, limit: usize) -> Value {
    let patterns = load(app);
    let mut items: Vec<Value> = patterns
        .get("recentUsage")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    items.reverse();
    items.truncate(limit);
    json!(items)
}

// getToolCombinations(toolId) -> { tool, count }[].
fn get_tool_combos(app: &tauri::AppHandle, tool_id: &str) -> Value {
    let patterns = load(app);
    let combos = obj(&patterns, "toolCombinations").and_then(|m| m.get(tool_id)).and_then(|v| v.as_object());
    json!(top_n(combos, 5, |tool, count| json!({ "tool": tool, "count": count })))
}

// getDayOfWeekPatterns() -> { 0..6: { app, count }[] } (top 5 each).
fn get_day_patterns(app: &tauri::AppHandle) -> Value {
    let patterns = load(app);
    let mut out = Map::new();
    for day in 0..7 {
        let day_usage = obj(&patterns, "dayOfWeekUsage")
            .and_then(|m| m.get(&day.to_string()))
            .and_then(|v| v.as_object());
        out.insert(
            day.to_string(),
            json!(top_n(day_usage, 5, |app, count| json!({ "app": app, "count": count }))),
        );
    }
    Value::Object(out)
}

// getHourlyPatterns() -> { 0..23: { app, count }[] } (top 3 each).
fn get_hourly_patterns(app: &tauri::AppHandle) -> Value {
    let patterns = load(app);
    let mut out = Map::new();
    for hour in 0..24 {
        let hour_usage = obj(&patterns, "hourlyUsage")
            .and_then(|m| m.get(&hour.to_string()))
            .and_then(|v| v.as_object());
        out.insert(
            hour.to_string(),
            json!(top_n(hour_usage, 3, |app, count| json!({ "app": app, "count": count }))),
        );
    }
    Value::Object(out)
}

// getPreferredAppForFile(extension) -> string | null.
fn get_preferred_app(app: &tauri::AppHandle, extension: &str) -> Value {
    let patterns = load(app);
    let ext = if extension.starts_with('.') {
        extension.to_lowercase()
    } else {
        format!(".{}", extension).to_lowercase()
    };
    let apps = obj(&patterns, "fileTypeToApp").and_then(|m| m.get(&ext)).and_then(|v| v.as_object());
    match top_pairs(apps, 1).into_iter().next() {
        Some((name, _)) => json!(name),
        None => Value::Null,
    }
}

// getSessionStats() -> { average, total, count }.
fn get_session_stats(app: &tauri::AppHandle) -> Value {
    let patterns = load(app);
    let lengths: Vec<f64> = patterns
        .get("sessionLengths")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_f64()).collect())
        .unwrap_or_default();
    let total: f64 = lengths.iter().sum();
    let average = patterns.get("averageSessionLength").and_then(|v| v.as_f64()).unwrap_or(0.0);
    json!({ "average": average, "total": total, "count": lengths.len() })
}

// getAllPatterns() -> the whole PatternData object.
fn get_all_patterns(app: &tauri::AppHandle) -> Value {
    load(app)
}

// cleanOldData() -> void. Keep last 100 sessions / last 50 recent, decay totals 10%.
fn clean_old_data(app: &tauri::AppHandle) {
    let mut patterns = load(app);

    if let Some(lengths) = patterns.get_mut("sessionLengths").and_then(|v| v.as_array_mut()) {
        if lengths.len() > 100 {
            let start = lengths.len() - 100;
            lengths.drain(0..start);
        }
    }
    if let Some(recent) = patterns.get_mut("recentUsage").and_then(|v| v.as_array_mut()) {
        if recent.len() > 50 {
            let start = recent.len() - 50;
            recent.drain(0..start);
        }
    }
    if let Some(total) = patterns.get_mut("totalUsage").and_then(|v| v.as_object_mut()) {
        let mut decayed: Map<String, Value> = Map::new();
        for (k, v) in total.iter() {
            let n = (v.as_f64().unwrap_or(0.0) * 0.9).floor() as i64;
            if n >= 1 {
                decayed.insert(k.clone(), json!(n));
            }
        }
        *total = decayed;
    }
    if let Some(o) = patterns.as_object_mut() {
        o.insert("lastUpdated".into(), json!(now_ms()));
    }
    save(app, &patterns);
}

/// Route a PatternLearning `patterns:*` channel. Args are the positional JSON
/// array the renderer sent (see usePatternLearning.ts / Learn.tsx).
///
/// NOTE: this does NOT own the whole `patterns:` namespace — the
/// PatternDetectionEngine channels (enable/disable/pause/.../getConfig/getSummary)
/// belong to a different subsystem. Route the explicit channels below to here;
/// do not blanket-route the prefix (see header DIVERGENCES #1).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    let s0 = a0.as_str().unwrap_or("");
    let s1 = args.get(1).and_then(|v| v.as_str());
    match channel {
        // --- record (void -> null) ---
        "patterns:recordAppOpen" => {
            record_event(app, "app_open", s0, s1, None);
            Value::Null
        }
        "patterns:recordAppClose" => {
            // duration is recorded on the event but not used by any getter here
            // (Electron stored it on the event object only). Target is appId.
            record_event(app, "app_close", s0, None, None);
            Value::Null
        }
        "patterns:recordFileOpen" => {
            let ext = ext_of(s0);
            record_event(app, "file_open", s0, s1, Some(&ext));
            Value::Null
        }
        "patterns:recordToolUse" => {
            record_event(app, "tool_use", s0, s1, None);
            Value::Null
        }
        "patterns:recordAction" => {
            record_event(app, "action", s0, s1, None);
            Value::Null
        }
        "patterns:recordToolCombo" => {
            let t1 = s0;
            let t2 = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            record_tool_combination(app, t1, t2);
            Value::Null
        }
        // --- getters ---
        "patterns:getSuggestions" => {
            let ctx = if a0.is_object() { a0 } else { json!({}) };
            get_suggestions(app, &ctx)
        }
        "patterns:getFrequent" => {
            // args: (type?, limit?) — type is ignored by Electron's impl.
            let limit = args.get(1).and_then(|v| v.as_u64()).unwrap_or(10) as usize;
            get_frequent(app, limit)
        }
        "patterns:getRecent" => {
            let limit = a0.as_u64().unwrap_or(10) as usize;
            get_recent(app, limit)
        }
        "patterns:getToolCombos" => get_tool_combos(app, s0),
        "patterns:getDayPatterns" => get_day_patterns(app),
        "patterns:getHourlyPatterns" => get_hourly_patterns(app),
        "patterns:getPreferredApp" => get_preferred_app(app, s0),
        "patterns:getSessionStats" => get_session_stats(app),
        "patterns:getAllPatterns" => get_all_patterns(app),
        "patterns:cleanup" => {
            clean_old_data(app);
            Value::Null
        }
        _ => Value::Null,
    }
}
