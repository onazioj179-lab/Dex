// =============================================================================
// DEX Tauri — Performance Budget subsystem (port of the `budget:*` IPC handlers
// in core/PerformanceBudgetManager.ts).
//
// PerformanceBudgetManager is a process-lifetime singleton whose entire state
// lives in memory: a Map<BudgetDomain, Budget> (seeded from DEFAULT_BUDGETS with
// current/reserved = 0), a Map of active reservations, a rolling violations
// list, and a 5s monitoring interval. There is NO persistent store behind it —
// it never touches electron-store/DataStore. The faithful native port therefore
// keeps the same shape: a process-global, Mutex-guarded BudgetState seeded once,
// mutated live by the heavy channels, plus a single 5s monitoring thread (the
// std::thread analogue of the setInterval loop) that expires reservations and
// samples real memory usage via sysinfo, broadcasting `budget:alert` on critical
// the same way Electron does via webContents.send.
//
// Channels & shapes (verbatim from the manager):
//   - budget:request  (request: BudgetRequest) -> BudgetResponse
//   - budget:release  (reservationId: string)  -> boolean
//   - budget:status   (domain?)                -> Budget | null | Record<..,Budget>
//   - budget:violations ()                     -> BudgetViolation[]
//   - budget:check    (domain, amount)         -> { withinBudget, available, utilization }
//   - budget:setLimit (domain, limit)          -> boolean
//   - budget:report   (domain, usage)          -> void (null); side-effect: alert
//
// A Budget is: { domain, limit, unit, current, reserved, warning, critical }.
//
// DIVERGENCES (documented):
//   - State is per-process and starts at the seeded defaults on every launch,
//     exactly like the Electron singleton (which also starts fresh — no
//     persistence). Reservation ids use the same `res-${ms}-${n}` shape, with n
//     a monotonic counter mirroring this.reservationCounter.
//   - collectSystemMetrics in Electron reports process.memoryUsage().heapUsed
//     (the JS heap). There is no JS heap here; the honest native analogue is the
//     process resident memory sampled via sysinfo, reported into the `memory`
//     domain. This drives the same threshold/alert logic on real numbers.
//   - log.* calls have no renderer-visible effect and are dropped; the
//     `budget:alert` broadcast (the one observable side-effect) is preserved via
//     crate::native_ops::emit_event.
// =============================================================================

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

// DEFAULT_BUDGETS, in declaration order. Each tuple is
// (domain, limit, unit, warning, critical); current/reserved are seeded to 0.
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

// -----------------------------------------------------------------------------
// In-memory state (mirrors the PerformanceBudgetManager singleton fields).
// -----------------------------------------------------------------------------

#[derive(Clone)]
struct BudgetEntry {
    domain: String,
    limit: i64,
    unit: String,
    current: i64,
    reserved: i64,
    warning: i64,
    critical: i64,
}

impl BudgetEntry {
    fn to_value(&self) -> Value {
        json!({
            "domain": self.domain,
            "limit": self.limit,
            "unit": self.unit,
            "current": self.current,
            "reserved": self.reserved,
            "warning": self.warning,
            "critical": self.critical,
        })
    }
}

#[derive(Clone)]
struct Reservation {
    domain: String,
    amount: i64,
    expires: i64, // epoch ms
}

struct BudgetState {
    budgets: HashMap<String, BudgetEntry>,
    // Preserve DEFAULT_BUDGETS declaration order for getAllBudgetStatus, which in
    // Electron iterates the insertion-ordered Map.
    order: Vec<String>,
    reservations: HashMap<String, Reservation>,
    violations: Vec<Value>,
    reservation_counter: u64,
}

impl BudgetState {
    fn seed() -> Self {
        let mut budgets = HashMap::new();
        let mut order = Vec::new();
        for &(d, limit, unit, warning, critical) in DEFAULT_BUDGETS {
            budgets.insert(
                d.to_string(),
                BudgetEntry {
                    domain: d.to_string(),
                    limit,
                    unit: unit.to_string(),
                    current: 0,
                    reserved: 0,
                    warning,
                    critical,
                },
            );
            order.push(d.to_string());
        }
        BudgetState {
            budgets,
            order,
            reservations: HashMap::new(),
            violations: Vec::new(),
            reservation_counter: 0,
        }
    }
}

static STATE: Mutex<Option<BudgetState>> = Mutex::new(None);
static MONITOR_STARTED: OnceLock<()> = OnceLock::new();

fn with_state<R>(f: impl FnOnce(&mut BudgetState) -> R) -> R {
    let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let state = guard.get_or_insert_with(BudgetState::seed);
    f(state)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Coerce a JSON number (integer or float) to i64, mirroring how JS would treat
// the numeric arg. Floats are truncated toward zero; missing/non-numeric -> 0.
fn as_num(v: Option<&Value>) -> i64 {
    match v {
        Some(Value::Number(n)) => n
            .as_i64()
            .or_else(|| n.as_f64().map(|f| f as i64))
            .unwrap_or(0),
        _ => 0,
    }
}

// -----------------------------------------------------------------------------
// Channel implementations (1:1 with the manager methods).
// -----------------------------------------------------------------------------

// requestBudget(request) -> BudgetResponse
fn request_budget(req: &Value) -> Value {
    let domain = req.get("domain").and_then(|v| v.as_str()).unwrap_or("");
    let amount = as_num(req.get("amount"));
    let operation = req
        .get("operation")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let priority = req.get("priority").and_then(|v| v.as_str()).unwrap_or("normal");
    // request.duration || 30000
    let duration = match req.get("duration") {
        Some(Value::Number(_)) => {
            let d = as_num(req.get("duration"));
            if d != 0 { d } else { 30000 } // request.duration || 30000
        }
        _ => 30000,
    };

    with_state(|st| {
        let (limit, current, reserved) = match st.budgets.get(domain) {
            Some(b) => (b.limit, b.current, b.reserved),
            None => {
                return json!({
                    "approved": false,
                    "allocated": 0,
                    "reason": format!("Unknown domain: {}", domain),
                });
            }
        };

        let available = limit - current - reserved;

        // request.amount > budget.limit
        if amount > limit {
            record_violation(st, domain, &operation, amount, available, limit);
            return json!({
                "approved": false,
                "allocated": 0,
                "reason": format!("Request exceeds maximum budget ({} > {})", amount, limit),
            });
        }

        // request.amount > available
        if amount > available {
            // critical priority: allow if amount <= limit - current
            if priority == "critical" && amount <= limit - current {
                // Approved with reservation overrun (log dropped).
            } else {
                record_violation(st, domain, &operation, amount, available, limit);
                let wait = estimate_wait_time(st, domain, amount);
                return json!({
                    "approved": false,
                    "allocated": 0,
                    "reason": format!("Insufficient budget (requested: {}, available: {})", amount, available),
                    "waitTime": wait,
                });
            }
        }

        // Allocate. id shape: `res-${Date.now()}-${++this.reservationCounter}`
        st.reservation_counter += 1;
        let reservation_id = format!("res-{}-{}", now_ms(), st.reservation_counter);

        st.reservations.insert(
            reservation_id.clone(),
            Reservation {
                domain: domain.to_string(),
                amount,
                expires: now_ms() + duration,
            },
        );

        if let Some(b) = st.budgets.get_mut(domain) {
            b.reserved += amount;
        }

        json!({
            "approved": true,
            "allocated": amount,
            "reservationId": reservation_id,
        })
    })
}

// releaseReservation(reservationId) -> boolean. Returns the inner result; also
// reused by the monitor thread for expiry cleanup.
fn release_reservation(st: &mut BudgetState, reservation_id: &str) -> bool {
    let reservation = match st.reservations.remove(reservation_id) {
        Some(r) => r,
        None => return false,
    };
    if let Some(b) = st.budgets.get_mut(&reservation.domain) {
        // Math.max(0, reserved - amount)
        b.reserved = (b.reserved - reservation.amount).max(0);
    }
    true
}

// checkBudget(domain, amount) -> { withinBudget, available, utilization }
fn check_budget(domain: &str, amount: i64) -> Value {
    with_state(|st| match st.budgets.get(domain) {
        None => json!({ "withinBudget": false, "available": 0, "utilization": 100 }),
        Some(b) => {
            let available = b.limit - b.current - b.reserved;
            let utilization = if b.limit != 0 {
                ((b.current + b.reserved) as f64 / b.limit as f64) * 100.0
            } else {
                0.0
            };
            json!({
                "withinBudget": amount <= available,
                "available": available,
                "utilization": utilization,
            })
        }
    })
}

// reportUsage(domain, usage) -> void. Side-effect: budget:alert broadcast on
// crossing the critical threshold (Electron also emits an in-process event +
// warning; only the renderer broadcast is observable, so only it is preserved).
fn report_usage(app: &tauri::AppHandle, domain: &str, usage: i64) -> Value {
    let alert = with_state(|st| {
        let b = match st.budgets.get_mut(domain) {
            Some(b) => b,
            None => return None,
        };
        b.current = usage;
        let limit = b.limit;
        let warning = b.warning;
        let critical = b.critical;
        if limit == 0 {
            return None;
        }
        let utilization = (usage as f64 / limit as f64) * 100.0;
        if utilization >= critical as f64 {
            Some(("critical", utilization))
        } else if utilization >= warning as f64 {
            // Electron emits an in-process 'budget:warning' but does NOT broadcast
            // to the renderer at warning level — nothing observable to forward.
            None
        } else {
            None
        }
    });

    if let Some((level, utilization)) = alert {
        crate::native_ops::emit_event(
            app,
            "budget:alert",
            &json!({ "domain": domain, "level": level, "utilization": utilization }),
        );
    }
    Value::Null
}

// setLimit(domain, limit) -> boolean
fn set_limit(domain: &str, limit: i64) -> Value {
    with_state(|st| match st.budgets.get_mut(domain) {
        None => Value::Bool(false),
        Some(b) => {
            // Prevent setting limit below current usage.
            if limit < b.current {
                Value::Bool(false)
            } else {
                b.limit = limit;
                Value::Bool(true)
            }
        }
    })
}

// getViolations() -> BudgetViolation[]
fn get_violations() -> Value {
    with_state(|st| Value::Array(st.violations.clone()))
}

// recordViolation(...) — push, cap at last 100. Operates on the locked state.
fn record_violation(
    st: &mut BudgetState,
    domain: &str,
    operation: &str,
    requested: i64,
    available: i64,
    limit: i64,
) {
    let violation = json!({
        "domain": domain,
        "operation": operation,
        "requested": requested,
        "available": available,
        "limit": limit,
        "timestamp": now_ms(),
    });
    st.violations.push(violation);
    if st.violations.len() > 100 {
        st.violations.remove(0); // Array.prototype.shift()
    }
}

// estimateWaitTime(domain, amount). Mirrors the float arithmetic exactly, then
// Math.max(1000, Math.ceil(...)). Operates on the locked state.
fn estimate_wait_time(st: &BudgetState, domain: &str, amount: i64) -> i64 {
    let b = match st.budgets.get(domain) {
        Some(b) => b,
        None => return 5000,
    };
    let needed = (amount - (b.limit - b.current - b.reserved)) as f64;
    let release_rate = b.limit as f64 * 0.1; // 10% release per second
    if release_rate == 0.0 {
        return 1000;
    }
    let est = ((needed / release_rate) * 1000.0).ceil() as i64;
    est.max(1000)
}

// getBudgetStatus(domain) -> Budget | null
fn get_budget_status(domain: &str) -> Value {
    with_state(|st| match st.budgets.get(domain) {
        Some(b) => b.to_value(),
        None => Value::Null,
    })
}

// getAllBudgetStatus() -> Record<BudgetDomain, Budget>
fn get_all_budget_status() -> Value {
    with_state(|st| {
        let mut out = Map::new();
        for key in &st.order {
            if let Some(b) = st.budgets.get(key) {
                out.insert(key.clone(), b.to_value());
            }
        }
        Value::Object(out)
    })
}

// -----------------------------------------------------------------------------
// Monitoring loop (the std::thread analogue of startMonitoring's 5s setInterval:
// cleanupExpiredReservations + collectSystemMetrics). Started once per process.
// Precedent: native_ops.rs start_reminder_scheduler.
// -----------------------------------------------------------------------------

fn start_monitoring(app: &tauri::AppHandle) {
    if MONITOR_STARTED.set(()).is_err() {
        return; // already running
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let mut sys = sysinfo::System::new();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(5));

            // cleanupExpiredReservations()
            with_state(|st| {
                let now = now_ms();
                let expired: Vec<String> = st
                    .reservations
                    .iter()
                    .filter(|(_, r)| r.expires < now)
                    .map(|(id, _)| id.clone())
                    .collect();
                for id in expired {
                    release_reservation(st, &id);
                }
            });

            // collectSystemMetrics(): native analogue of process.memoryUsage().
            // heapUsed has no equivalent; sample process resident memory instead.
            sys.refresh_memory();
            let used = sys.used_memory() as i64; // bytes
            report_usage(&app, "memory", used);
        }
    });
}

/// Route a `budget:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). All channels in the namespace are handled with
/// real native logic backed by process-lifetime state; the monitoring thread is
/// lazily started on first dispatch.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    // Lazily start the 5s monitor on first touch of the namespace.
    start_monitoring(app);

    match channel {
        // budget:request(request) -> BudgetResponse
        "budget:request" => {
            let req = args.get(0).cloned().unwrap_or(Value::Null);
            request_budget(&req)
        }

        // budget:release(reservationId) -> boolean
        "budget:release" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            Value::Bool(with_state(|st| release_reservation(st, id)))
        }

        // budget:status — domain ? getBudgetStatus(domain) : getAllBudgetStatus()
        "budget:status" => match args.get(0).and_then(|v| v.as_str()) {
            Some(domain) if !domain.is_empty() => get_budget_status(domain),
            _ => get_all_budget_status(),
        },

        // budget:violations() -> BudgetViolation[]
        "budget:violations" => get_violations(),

        // budget:check(domain, amount) -> { withinBudget, available, utilization }
        "budget:check" => {
            let domain = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let amount = as_num(args.get(1));
            check_budget(domain, amount)
        }

        // budget:setLimit(domain, limit) -> boolean
        "budget:setLimit" => {
            let domain = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let limit = as_num(args.get(1));
            set_limit(domain, limit)
        }

        // budget:report(domain, usage) -> void (null); may broadcast budget:alert
        "budget:report" => {
            let domain = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let usage = as_num(args.get(1));
            report_usage(app, domain, usage)
        }

        _ => Value::Null,
    }
}
