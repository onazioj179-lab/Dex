// =============================================================================
// DEX Tauri — Context Intelligence subsystem (port of the `context:*` data IPC
// in src/main/core/ContextIntelligenceService.ts).
//
// Pure-data, DataStore-KV tier (same backbone as modes_dispatch / rule_engine).
// Electron persisted this service to a standalone JSON file
// (`context-intelligence.json` under userData) holding { usageHistory,
// projectContexts, viewStates }. The migration target for this namespace is the
// native DataStore-KV (dex-kv.json) under the SAME key `context`, reached via
// crate::kv_get / crate::kv_set. The stored blob keeps the SAME top-level shape
// the Electron file used so a future writer (recordUsage, once it has a native
// runtime) and this reader agree:
//   context = { usageHistory: UsageRecord[], projectContexts: {..}, viewStates: {..} }
//
// A UsageRecord is:
//   { id, type: 'action'|'page'|'file'|'search'|'command', timestamp, context?, duration? }
//
// PORTED data channels:
//   - context:getRankedSearchResults(results: {id, score}[])
//       -> {id, score, boosted}[]   (== rankSearchResults)
//     Mirrors the Electron algorithm exactly: for each result, look up the
//     `file:<id>` usage stats (rebuilt from usageHistory), apply a recent-use
//     boost (min(0.2, recentUses*0.05)) and a current-context boost
//     (min(0.15, contextUses*0.03)); flag `boosted` when total boost > 0; then
//     stable-sort by descending score. Field names/types are identical.
//   - context:recordUsage(type, id, duration?) -> { success: true }
//       Appends a UsageRecord { id, type, timestamp, context?, duration? } to the
//       persisted usageHistory under the `context` KV key (== Electron recordUsage),
//       trims to MAX_HISTORY (10000) keeping the most recent, persists immediately
//       (the 5s save-debounce collapses to a synchronous write here — there is no
//       long-lived process to debounce against), and pushes the `usage:recorded`
//       event to the renderer via emit_event (== Electron's EventEmitter emit /
//       webContents.send). Stats are recomputed-on-read (see below), so no separate
//       stats blob is written — exactly the loadData -> updateStats contract.
//   - context:getRankedActions(limit?=10) -> [{ id, score, reason }]
//       Rebuilds action stats from usageHistory and applies calculateRanking:
//       base = log10(totalUses+1)*0.3; recency = max(0, 0.3 - daysSinceUse*0.01);
//       recent-freq = min(0.2, recentUses*0.02); context-match = +0.2 when the
//       current context matches (session-only -> never fires here, see DIVERGENCES);
//       reason picks "used recently" (<1 day) / "relevant to current project" /
//       "frequently used". Sorted by descending score, sliced to `limit`.
//
// SKIPPED heavy channels: none remaining in this module.
//
// DIVERGENCES (documented):
//   - `currentContext` is in-memory-only in Electron (set via context:setProject,
//     never persisted to the JSON file). A stateless dispatch has no session, so
//     currentContext is always null here and the context-match boost branch
//     (min(0.15, contextUses*0.03)) never fires. The recent-use boost is fully
//     reproduced. This only changes ranking when a project was selected AND a
//     file had context-scoped usage in that exact session — otherwise output is
//     byte-identical. (recordUsage being skipped means no rows are written via
//     this bridge yet, so in practice usageHistory is whatever a future native
//     writer leaves under the `context` key.)
//   - Stats are rebuilt from usageHistory on each call (exactly as Electron does
//     in loadData -> updateStats), so no separate stats blob is needed.
//   - Math.min on f64 -> f64::min; sort uses total_cmp on the f64 score to give a
//     deterministic order (JS Array.sort is not guaranteed stable for equal keys,
//     but for distinct scores the order matches; equal scores keep input order
//     via a stable sort, which is the modern V8 behaviour).
// =============================================================================

use serde_json::{json, Value};

const CONTEXT_KEY: &str = "context";
const RECENT_WINDOW_MS: i64 = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_HISTORY: usize = 10000;
const DAY_MS: f64 = 24.0 * 60.0 * 60.0 * 1000.0;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// The persisted service blob under the `context` DataStore key.
fn load_blob(app: &tauri::AppHandle) -> Value {
    crate::kv_get(app, CONTEXT_KEY)
}

fn usage_history(app: &tauri::AppHandle) -> Vec<Value> {
    load_blob(app)
        .get("usageHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn rec_id(r: &Value) -> Option<&str> {
    r.get("id").and_then(|v| v.as_str())
}
fn rec_type(r: &Value) -> &str {
    r.get("type").and_then(|v| v.as_str()).unwrap_or("")
}
fn rec_ts(r: &Value) -> i64 {
    r.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0)
}
fn rec_context(r: &Value) -> Option<&str> {
    r.get("context").and_then(|v| v.as_str())
}

// Recent uses (last 7 days) of a given (type, id) pair, mirroring updateStats's
// recalculation over usageHistory.
fn recent_uses(history: &[Value], kind: &str, id: &str, recent_threshold: i64) -> i64 {
    history
        .iter()
        .filter(|r| {
            rec_id(r) == Some(id) && rec_type(r) == kind && rec_ts(r) > recent_threshold
        })
        .count() as i64
}

// contextFrequency.get(currentContext) for a given (type, id) pair: how many of
// its usage records were recorded under the given context string.
fn context_frequency(history: &[Value], kind: &str, id: &str, ctx: &str) -> i64 {
    history
        .iter()
        .filter(|r| {
            rec_id(r) == Some(id) && rec_type(r) == kind && rec_context(r) == Some(ctx)
        })
        .count() as i64
}

// rankSearchResults(results) -> [{ id, score, boosted }]
fn rank_search_results(app: &tauri::AppHandle, results: &Value) -> Value {
    let history = usage_history(app);
    let recent_threshold = now_ms() - RECENT_WINDOW_MS;
    // currentContext is session-only and never persisted -> always None here.
    let current_context: Option<String> = None;

    let arr = match results.as_array() {
        Some(a) => a,
        None => return json!([]),
    };

    let mut out: Vec<(f64, Value)> = Vec::with_capacity(arr.len());
    for result in arr {
        let id = result.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let base = result.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);

        // Only `file:<id>` stats participate (matches Electron's key prefix).
        let has_stats = !id.is_empty()
            && history
                .iter()
                .any(|r| rec_type(r) == "file" && rec_id(r) == Some(id));

        let mut boost = 0.0f64;
        let mut boosted = false;

        if has_stats {
            let ru = recent_uses(&history, "file", id, recent_threshold);
            if ru > 0 {
                boost += f64::min(0.2, ru as f64 * 0.05);
            }

            if let Some(ctx) = current_context.as_deref() {
                let cf = context_frequency(&history, "file", id, ctx);
                if cf > 0 {
                    boost += f64::min(0.15, cf as f64 * 0.03);
                }
            }

            if boost > 0.0 {
                boosted = true;
            }
        }

        let score = base + boost;
        out.push((
            score,
            json!({ "id": id, "score": score, "boosted": boosted }),
        ));
    }

    // sort((a, b) => b.score - a.score) — descending, stable for equal scores.
    out.sort_by(|a, b| b.0.total_cmp(&a.0));
    Value::Array(out.into_iter().map(|(_, v)| v).collect())
}

// recordUsage(type, id, duration?) — append a UsageRecord to the persisted
// usageHistory blob, trim to MAX_HISTORY, persist, and push usage:recorded.
// Mirrors Electron's recordUsage (sans the in-memory currentContext, which is
// session-only and not reachable from a stateless dispatch -> context omitted,
// matching the JSON file's behaviour when no project was selected).
fn record_usage(app: &tauri::AppHandle, kind: &str, id: &str, duration: Option<f64>) -> Value {
    let timestamp = now_ms();

    // Build the record with the EXACT Electron field order/shape. `context` and
    // `duration` are only present when set (matches `context: this.currentContext
    // || undefined` and the optional `duration` — undefined fields are dropped
    // from the persisted JSON in Electron).
    let mut rec = serde_json::Map::new();
    rec.insert("id".into(), Value::String(id.to_string()));
    rec.insert("type".into(), Value::String(kind.to_string()));
    rec.insert("timestamp".into(), Value::from(timestamp));
    if let Some(d) = duration {
        rec.insert("duration".into(), Value::from(d));
    }
    let record = Value::Object(rec);

    // Read-modify-write the whole `context` blob, preserving any sibling keys
    // (projectContexts / viewStates) a future writer may keep there.
    let mut blob = load_blob(app);
    if !blob.is_object() {
        blob = json!({});
    }
    let obj = blob.as_object_mut().unwrap();

    let mut history: Vec<Value> = obj
        .get("usageHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    history.push(record.clone());
    // Trim to the most-recent MAX_HISTORY (Electron: slice(-MAX_HISTORY)).
    if history.len() > MAX_HISTORY {
        let start = history.len() - MAX_HISTORY;
        history.drain(0..start);
    }
    obj.insert("usageHistory".into(), Value::Array(history));

    crate::kv_set(app, CONTEXT_KEY, blob);

    // emit('usage:recorded', record) — the Electron EventEmitter signal.
    crate::native_ops::emit_event(app, "usage:recorded", &record);

    json!({ "success": true })
}

// getRankedActions(limit=10) -> [{ id, score, reason }]
// Rebuilds per-action stats from usageHistory (== loadData -> updateStats over
// type==='action'), then applies calculateRanking. currentContext is session-only
// and never persisted, so the +0.2 context-match boost and the
// "relevant to current project" reason never fire here (documented DIVERGENCE).
fn ranked_actions(app: &tauri::AppHandle, limit: usize) -> Value {
    let history = usage_history(app);
    let now = now_ms();
    let recent_threshold = now - RECENT_WINDOW_MS;

    // Aggregate action stats keyed by id (Electron keys usageStats by
    // `${type}:${id}` and filters to type==='action'; within actions the id is
    // the discriminator). Preserve first-seen order for a stable tie-break that
    // matches the JS Map insertion order used by Array.from(values()).
    let mut order: Vec<String> = Vec::new();
    let mut total: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut last_used: std::collections::HashMap<String, i64> = std::collections::HashMap::new();

    for r in &history {
        if rec_type(r) != "action" {
            continue;
        }
        let id = match rec_id(r) {
            Some(i) => i.to_string(),
            None => continue,
        };
        if !total.contains_key(&id) {
            order.push(id.clone());
        }
        *total.entry(id.clone()).or_insert(0) += 1;
        let ts = rec_ts(r);
        let e = last_used.entry(id.clone()).or_insert(0);
        if ts > *e {
            *e = ts;
        }
    }

    let mut scored: Vec<(usize, f64, Value)> = Vec::with_capacity(order.len());
    for (idx, id) in order.iter().enumerate() {
        let total_uses = *total.get(id).unwrap_or(&0);
        let last = *last_used.get(id).unwrap_or(&0);
        let recent = recent_uses(&history, "action", id, recent_threshold);

        // base = log10(totalUses + 1) * 0.3
        let mut score = ((total_uses + 1) as f64).log10() * 0.3;
        // recency boost = max(0, 0.3 - daysSinceUse * 0.01)
        let days_since = (now - last) as f64 / DAY_MS;
        score += f64::max(0.0, 0.3 - days_since * 0.01);
        // recent-frequency boost = min(0.2, recentUses * 0.02)
        score += f64::min(0.2, recent as f64 * 0.02);
        // context-match boost (+0.2) — currentContext is session-only -> never fires.

        // reason: default 'frequently used'; 'used recently' when daysSinceUse < 1;
        // 'relevant to current project' on context match (never here).
        let reason = if days_since < 1.0 {
            "used recently"
        } else {
            "frequently used"
        };

        scored.push((
            idx,
            score,
            json!({ "id": id, "score": score, "reason": reason }),
        ));
    }

    // sort((a, b) => b.score - a.score), stable on insertion order for ties.
    scored.sort_by(|a, b| {
        b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0))
    });

    let out: Vec<Value> = scored.into_iter().take(limit).map(|(_, _, v)| v).collect();
    Value::Array(out)
}

/// Route a `context:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). All three ported channels return their exact
/// Electron shapes.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "context:getRankedSearchResults" => {
            let results = args.get(0).cloned().unwrap_or(Value::Null);
            rank_search_results(app, &results)
        }
        "context:recordUsage" => {
            // (type: string, id: string, duration?: number)
            let kind = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let duration = args.get(2).and_then(|v| v.as_f64());
            record_usage(app, kind, id, duration)
        }
        "context:getRankedActions" => {
            // (limit?: number) — default 10, matching the Electron signature.
            let limit = args
                .get(0)
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
                .unwrap_or(10);
            ranked_actions(app, limit)
        }
        _ => Value::Null,
    }
}
