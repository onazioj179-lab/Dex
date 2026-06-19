// =============================================================================
// DEX Tauri — Performance Budget subsystem (port of the `budget:*` IPC handlers
// in core/PerformanceBudgetManager.ts).
//
// Only the pure-data status read is ported. In Electron the budgets live ONLY
// in process memory: the manager seeds a Map from the DEFAULT_BUDGETS constant
// (each entry getting `current: 0, reserved: 0`) and the heavy channels
// (request/release/check/setLimit/report) mutate that Map at runtime. There is
// NO persistent store backing budgets — PerformanceBudgetManager never touches
// electron-store or DataStore. The task's nominal `datastore-kv:budget` storage
// therefore has no Electron counterpart to mirror; a data-only port that omits
// every mutating channel can never move `current`/`reserved` off their seeded
// zero, nor `limit` off its default, so `budget:status` deterministically
// returns the DEFAULT_BUDGETS shape with `current: 0, reserved: 0`. No file or
// KV access is performed (matching the source, which performs none for status).
//
// Channel & shape (from getBudgetStatus / getAllBudgetStatus):
//   - budget:status -> with a domain arg : Budget | null   (null for an unknown
//                       domain, mirroring `this.budgets.get(domain) || null`)
//                   -> without a domain   : Record<BudgetDomain, Budget>
//
// A Budget is:
//   { domain, limit, unit, current, reserved, warning, critical }
// numeric fields (limit/current/reserved/warning/critical) are numbers; domain
// and unit are strings. Field order and values match DEFAULT_BUDGETS exactly.
//
// DIVERGENCES (documented):
//   - No persistence and no live mutation. Because the heavy channels that would
//     change a budget's `current`/`reserved`/`limit` are intentionally NOT
//     ported (they need the native runtime: live reservation accounting,
//     system-metric sampling, violation tracking), status always reflects the
//     seeded defaults. This is the honest data-only result, not a stub.
//   - The Electron emptiness check `this.budgets.get(domain) || null` returns
//     null for any unknown domain; we mirror that exactly.
// =============================================================================

use serde_json::{json, Map, Value};

// DEFAULT_BUDGETS, in declaration order. Each tuple is
// (domain, limit, unit, warning, critical); current/reserved are seeded to 0.
// limit values mirror the TS arithmetic literals exactly:
//   memory  4096 * 1024 * 1024 = 4_294_967_296
//   disk      50 * 1024 * 1024 =    52_428_800
//   network   10 * 1024 * 1024 =    10_485_760
const DEFAULT_BUDGETS: &[(&str, i64, &str, i64, i64)] = &[
    ("cpu", 95, "percent", 80, 90),
    ("memory", 4096 * 1024 * 1024, "bytes", 80, 95),
    ("disk", 50 * 1024 * 1024, "bytes/s", 60, 80),
    ("network", 10 * 1024 * 1024, "bytes/s", 70, 90),
    ("render", 16, "ms", 75, 90),
    ("media", 5, "operations", 60, 80),
    ("editor", 100, "ms", 50, 80),
    ("search", 200, "ms", 50, 80),
    ("background", 50, "tasks", 60, 80),
];

fn budget_for(domain: &str, limit: i64, unit: &str, warning: i64, critical: i64) -> Value {
    json!({
        "domain": domain,
        "limit": limit,
        "unit": unit,
        "current": 0,
        "reserved": 0,
        "warning": warning,
        "critical": critical,
    })
}

// getBudgetStatus(domain): Budget | null.
fn get_budget_status(domain: &str) -> Value {
    for &(d, limit, unit, warning, critical) in DEFAULT_BUDGETS {
        if d == domain {
            return budget_for(d, limit, unit, warning, critical);
        }
    }
    Value::Null
}

// getAllBudgetStatus(): Record<BudgetDomain, Budget>.
fn get_all_budget_status() -> Value {
    let mut out = Map::new();
    for &(d, limit, unit, warning, critical) in DEFAULT_BUDGETS {
        out.insert(d.to_string(), budget_for(d, limit, unit, warning, critical));
    }
    Value::Object(out)
}

/// Route a `budget:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled here:
/// the heavy mutating channels (request/release/check/setLimit/report/
/// violations) are intentionally not ported and return Value::Null (honest
/// degrade), so prefix-routing the whole namespace to this dispatch is safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // budget:status — domain ? getBudgetStatus(domain) : getAllBudgetStatus()
        "budget:status" => match args.get(0).and_then(|v| v.as_str()) {
            Some(domain) if !domain.is_empty() => get_budget_status(domain),
            _ => get_all_budget_status(),
        },
        // Heavy channels: not ported (need the native runtime).
        _ => Value::Null,
    }
}
