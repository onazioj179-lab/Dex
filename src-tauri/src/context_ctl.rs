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
// PORTED data channel:
//   - context:getRankedSearchResults(results: {id, score}[])
//       -> {id, score, boosted}[]   (== rankSearchResults)
//     Mirrors the Electron algorithm exactly: for each result, look up the
//     `file:<id>` usage stats (rebuilt from usageHistory), apply a recent-use
//     boost (min(0.2, recentUses*0.05)) and a current-context boost
//     (min(0.15, contextUses*0.03)); flag `boosted` when total boost > 0; then
//     stable-sort by descending score. Field names/types are identical.
//
// SKIPPED heavy channels (need a native long-lived runtime; not faked):
//   - context:recordUsage     (mutating tracker + 5s debounced save + EventEmitter)
//   - context:getRankedActions(stateful ranking over the live usageStats map)
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

/// Route a `context:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The single ported data channel returns its exact
/// Electron shape; the two heavy channels are not faked and return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "context:getRankedSearchResults" => {
            let results = args.get(0).cloned().unwrap_or(Value::Null);
            rank_search_results(app, &results)
        }
        // Heavy / stateful — need a native long-lived runtime; not ported, not faked.
        "context:recordUsage" | "context:getRankedActions" => Value::Null,
        _ => Value::Null,
    }
}
