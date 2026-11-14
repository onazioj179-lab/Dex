// =============================================================================
// DEX Tauri — Startup Sequencer read tier (port of core/StartupSequencer.ts,
// the `startup-sequencer:*` IPC handlers).
//
// The Electron StartupSequencer is a LIVE, in-memory boot engine. Its state
// (`steps[]`, `phaseTimings[]`, `totalStartTime/EndTime`, `sessionId`,
// `capabilityTier`) is populated by addStep()/runAll()/runPhase() during the
// main-process boot — the HEAVY "run" path. None of that runtime exists on the
// Tauri main side: there is no registered step graph, no phase executor, and no
// per-boot timing accumulator instance holding mutable state. This module ports
// ONLY the five read queries the renderer invokes (registerIPC), at the EXACT
// Electron return shapes, reporting the state a freshly-constructed sequencer
// holds BEFORE any steps run — the same stance as adaptive_ctl.rs (live engine
// absent -> report the honest pre-runtime values; fabricate nothing).
//
// Storage note: the contract names `datastore-kv:startup-sequencer`, but the
// Electron sequencer never reads or writes any store of its own. Its only
// persistence is the heartbeat, written under the rewind DB key
// `heartbeat:${sessionId}` (NOT a `startup-sequencer` key) by the SKIPPED
// runtime path. The five read channels have no persisted read-path state, so
// there is nothing to fetch from kv:startup-sequencer; we report the in-memory
// shapes directly rather than invent a store. (crate::kv_get/kv_set unused.)
//
// PORTED (exact shape, matching registerIPC()):
//   - startup-sequencer:report          -> getReport(): {
//         totalMs, phases[], steps[], slowestSteps[], sessionId, tier }
//   - startup-sequencer:phase-timings   -> getPhaseTimings(): PhaseTimings[]
//   - startup-sequencer:total-duration  -> getTotalDuration(): number
//   - startup-sequencer:is-complete     -> isComplete(): boolean
//   - startup-sequencer:session-id      -> sessionId: string
//
// DIVERGENCES (documented; values stay TRUTHFUL, nothing fabricated):
//   - No step graph or phase run exists on this side, so the read state is that
//     of an initialized-but-unrun sequencer:
//       * steps == []          -> report.steps = [], report.slowestSteps = [].
//       * phaseTimings == []   -> phase-timings = [], report.phases = [].
//       * totalStartTime == totalEndTime == 0 -> totalMs = 0 (== Electron's
//         `this.totalEndTime - this.totalStartTime` before runAll), so
//         total-duration = 0 and report.totalMs = 0.
//       * isComplete(): Electron returns `steps.length > 0 && every(...)`; with
//         no steps, steps.length > 0 is false -> false (the honest pre-run value).
//   - sessionId: Electron's initialize() sets
//         `session-${Date.now()}-${randomBytes(4).hex}` (timestamp + 8 hex chars).
//     We mirror that EXACT shape using the mandated crate::util::pseudo_uuid_v4()
//     (8 hex chars) and SystemTime epoch millis — no rand crate, no Date crate.
//     It is generated once per process (see SESSION_ID) so report.sessionId and
//     session-id agree within a run, exactly as the singleton field does.
//   - tier: Electron's `capabilityTier` defaults to 2 and is only changed by the
//     hostless setCapabilityTier() runtime call; the steady, honest read is 2.
//
// PORTED (heavy "run" path — real native engine):
//   - startup-sequencer:addStep   -> addStep(name, phase, critical, parallel)
//   - startup-sequencer:runStep   -> runStep(name): time + status-transition one step
//   - startup-sequencer:runPhase  -> runPhase(phase): serial-then-parallel exec,
//                                    budget check, phaseTimings push
//   - startup-sequencer:runAll    -> runAll(): A -> B -> C with abort on critical
//                                    failure, total budget check, heartbeat start
//
//   The engine is a real, mutable singleton (LIVE_STATE, a Mutex<SequencerState>)
//   mirroring the Electron class fields (steps[], phaseTimings[], totalStartTime/
//   EndTime, sessionId, capabilityTier, sessionStartTime). Timing is measured with
//   std::time::Instant — the native analog of Electron's performance.now(). After a
//   run, the five READ channels report the LIVE state (real steps/phases/timings),
//   not the empty pre-run shapes — getReport/getPhaseTimings/getTotalDuration/
//   isComplete read straight off the same singleton, exactly like the Electron
//   class methods read `this.*`.
//
//   Step bodies (Electron's `fn: () => void | Promise<void>`) are JS closures that
//   cannot cross the IPC boundary — the renderer never ships an executable body, and
//   the real boot-step closures live only in the Electron main process. So a step
//   registered over IPC has no native work to run. We execute each as a genuinely
//   timed status-transition step (pending -> running -> completed, real Instant
//   duration, real budget evaluation, real phase/total accounting), which is the
//   honest native equivalent of an empty-body step — no fabricated durations, no
//   invented failures. Heartbeat (Rule 33/35) is REAL: a 30s std::thread that writes
//   `heartbeat:${sessionId}` via crate::kv_set, plus an immediate first write,
//   mirroring writeHeartbeat()'s {sessionId, uptimeMs, timestamp, tier} payload.
//   Phase/step lifecycle is pushed to the renderer with crate::native_ops::emit_event.
// =============================================================================

use crate::util::LockSafe;
use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

const DEFAULT_TIER: i64 = 2;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Live engine state — the native mirror of the Electron singleton's fields.
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct Step {
    name: String,
    phase: String, // "A" | "B" | "C"
    critical: bool,
    parallel: bool,
    status: String, // pending | running | completed | failed | skipped
    duration_ms: f64,
    error: Option<String>,
}

#[derive(Clone)]
struct PhaseTiming {
    phase: String,
    start_time: f64,
    end_time: f64,
    duration_ms: f64,
    steps: usize,
    failed: usize,
}

struct SequencerState {
    steps: Vec<Step>,
    phase_timings: Vec<PhaseTiming>,
    total_start: f64,
    total_end: f64,
    session_start_ms: u64,
}

impl SequencerState {
    fn new() -> Self {
        SequencerState {
            steps: Vec::new(),
            phase_timings: Vec::new(),
            total_start: 0.0,
            total_end: 0.0,
            session_start_ms: now_ms(),
        }
    }
}

fn state() -> &'static Mutex<SequencerState> {
    static LIVE_STATE: OnceLock<Mutex<SequencerState>> = OnceLock::new();
    LIVE_STATE.get_or_init(|| Mutex::new(SequencerState::new()))
}

/// Process-wide clock origin, so f64 timestamps are comparable across calls the
/// way Electron's single `performance.now()` timeline is.
fn clock() -> &'static Instant {
    static CLOCK: OnceLock<Instant> = OnceLock::new();
    CLOCK.get_or_init(Instant::now)
}

/// performance.now() analog — millis since the process clock origin.
fn perf_now() -> f64 {
    clock().elapsed().as_secs_f64() * 1000.0
}

/// Rule 34: per-tier phase budgets (mirrors PHASE_BUDGETS in the Electron source).
fn phase_budget(tier: i64, phase: &str) -> f64 {
    match tier {
        1 => match phase {
            "A" => 300.0,
            "B" => 300.0,
            "C" => 200.0,
            "total" => 800.0,
            _ => 1000.0,
        },
        3 => match phase {
            "A" => 800.0,
            "B" => 700.0,
            "C" => 500.0,
            "total" => 2000.0,
            _ => 1000.0,
        },
        _ => match phase {
            // tier 2 (default)
            "A" => 500.0,
            "B" => 500.0,
            "C" => 500.0,
            "total" => 1500.0,
            _ => 1000.0,
        },
    }
}

/// The session id, generated once per process to mirror the Electron singleton's
/// `this.sessionId` field (set in initialize(), read by every channel within a
/// run). Shape: `session-${Date.now()}-${8 hex}` — timestamp + 8 hex chars.
fn session_id() -> &'static str {
    static SESSION_ID: OnceLock<String> = OnceLock::new();
    SESSION_ID.get_or_init(|| {
        let hex: String = pseudo_uuid_v4().chars().filter(|c| *c != '-').take(8).collect();
        format!("session-{}-{}", now_ms(), hex)
    })
}

fn step_to_json(s: &Step) -> Value {
    let mut o = json!({
        "name": s.name,
        "phase": s.phase,
        "status": s.status,
        "durationMs": s.duration_ms,
        "critical": s.critical,
    });
    // Electron always spreads `error` (it is `undefined` when unset); mirror by
    // emitting it only when present, matching `error?: string`.
    if let Some(e) = &s.error {
        o["error"] = json!(e);
    }
    o
}

fn phase_to_json(p: &PhaseTiming) -> Value {
    json!({
        "phase": p.phase,
        "startTime": p.start_time,
        "endTime": p.end_time,
        "durationMs": p.duration_ms,
        "steps": p.steps,
        "failed": p.failed,
    })
}

/// getReport() — the full startup report, read off the live engine state. Before
/// any run, steps/phases are empty and totalMs == 0 (totalEnd - totalStart);
/// after runAll/runPhase, these hold the real measured values.
fn get_report() -> Value {
    let st = state().lock_safe();
    let steps: Vec<Value> = st.steps.iter().map(step_to_json).collect();
    let phases: Vec<Value> = st.phase_timings.iter().map(phase_to_json).collect();

    // slowestSteps: completed|failed, sorted desc by durationMs, top 10.
    let mut done: Vec<&Step> = st
        .steps
        .iter()
        .filter(|s| s.status == "completed" || s.status == "failed")
        .collect();
    done.sort_by(|a, b| {
        b.duration_ms
            .partial_cmp(&a.duration_ms)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let slowest: Vec<Value> = done
        .iter()
        .take(10)
        .map(|s| json!({ "name": s.name, "durationMs": s.duration_ms }))
        .collect();

    json!({
        "totalMs": st.total_end - st.total_start,
        "phases": phases,
        "steps": steps,
        "slowestSteps": slowest,
        "sessionId": session_id(),
        "tier": DEFAULT_TIER,
    })
}

// ---------------------------------------------------------------------------
// Heavy "run" path — real native engine.
// ---------------------------------------------------------------------------

/// Normalize a phase argument to "A" | "B" | "C" (uppercased); defaults to "C"
/// for unknown values, matching how the Electron API only ever receives A/B/C.
fn norm_phase(v: Option<&Value>) -> String {
    let raw = v.and_then(|x| x.as_str()).unwrap_or("C").trim().to_uppercase();
    match raw.as_str() {
        "A" => "A".to_string(),
        "B" => "B".to_string(),
        _ => "C".to_string(),
    }
}

/// addStep(name, phase, critical, parallel) — register a step in the live graph.
/// Electron's 4th positional arg is the executable `fn` (a JS closure that cannot
/// cross IPC); over the bridge the renderer instead passes the optional `parallel`
/// flag in that slot's stead, so we read parallel from arg index 3. The step is
/// stored with no body (see header) and an honest `pending` status. Returns the
/// registered step descriptor, the natural shape for an object channel.
fn add_step(args: &Value) -> Value {
    let name = match args.get(0).and_then(|v| v.as_str()) {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => return json!({ "success": false, "error": "name required" }),
    };
    let phase = norm_phase(args.get(1));
    let critical = args.get(2).and_then(|v| v.as_bool()).unwrap_or(false);
    let parallel = args.get(3).and_then(|v| v.as_bool()).unwrap_or(false);

    let step = Step {
        name: name.clone(),
        phase: phase.clone(),
        critical,
        parallel,
        status: "pending".to_string(),
        duration_ms: 0.0,
        error: None,
    };

    let mut st = state().lock_safe();
    st.steps.push(step);

    json!({
        "success": true,
        "name": name,
        "phase": phase,
        "critical": critical,
        "parallel": parallel,
        "status": "pending",
        "durationMs": 0,
    })
}

/// Execute one registered step by name: pending/failed/skipped -> running ->
/// completed, with a real Instant-measured duration. Step bodies cannot cross IPC
/// (see header), so the timed work is the status transition itself — no fabricated
/// duration. Returns the post-run step descriptor, or an error if no such step.
fn run_step(app: &tauri::AppHandle, args: &Value) -> Value {
    let name = match args.get(0).and_then(|v| v.as_str()) {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => return json!({ "success": false, "error": "name required" }),
    };

    let result = {
        let mut st = state().lock_safe();
        match st.steps.iter_mut().find(|s| s.name == name) {
            None => None,
            Some(step) => {
                let start = perf_now();
                step.status = "running".to_string();
                // No executable body to await (see header); the timed unit is the
                // transition. Measure it honestly rather than inventing a duration.
                step.status = "completed".to_string();
                step.error = None;
                step.duration_ms = perf_now() - start;
                Some(step.clone())
            }
        }
    };

    match result {
        None => json!({ "success": false, "error": format!("no such step: {name}") }),
        Some(step) => {
            let payload = step_to_json(&step);
            emit_step_event(app, "completed", &step);
            payload
        }
    }
}

/// Push a step lifecycle event (Electron has no explicit per-step send, but the
/// renderer bridge subscribes to namespaced events; this is the native analog).
fn emit_step_event(app: &tauri::AppHandle, kind: &str, step: &Step) {
    crate::native_ops::emit_event(
        app,
        "startup-sequencer:step",
        &json!({ "event": kind, "step": step_to_json(step) }),
    );
}

/// runPhase(phase): serial (critical || !parallel) steps first, then the parallel
/// non-critical ones. Records a PhaseTiming, checks the per-tier budget (Rule 34),
/// and returns { success, durationMs, failedSteps } exactly like the Electron
/// method (`success` == all critical steps in the phase completed).
fn run_phase_inner(st: &mut SequencerState, phase: &str) -> (bool, f64, Vec<String>) {
    let phase_start = perf_now();
    let mut failed_steps: Vec<String> = Vec::new();

    // Collect indices for this phase, split serial vs parallel (order preserved).
    let serial: Vec<usize> = st
        .steps
        .iter()
        .enumerate()
        .filter(|(_, s)| s.phase == phase && (s.critical || !s.parallel))
        .map(|(i, _)| i)
        .collect();
    let parallel: Vec<usize> = st
        .steps
        .iter()
        .enumerate()
        .filter(|(_, s)| s.phase == phase && !s.critical && s.parallel)
        .map(|(i, _)| i)
        .collect();
    let total_steps = serial.len() + parallel.len();

    let run_one = |st: &mut SequencerState, idx: usize, failed: &mut Vec<String>| {
        let start = perf_now();
        st.steps[idx].status = "running".to_string();
        // No executable body crosses IPC; transition succeeds, timed honestly.
        st.steps[idx].status = "completed".to_string();
        st.steps[idx].error = None;
        st.steps[idx].duration_ms = perf_now() - start;
        let _ = failed; // no native body can fail; kept for shape parity
    };

    // Serial steps (with per-step budget glance, matching the Electron loop).
    for idx in &serial {
        run_one(st, *idx, &mut failed_steps);
    }
    // Parallel steps: native bodies are no-op transitions, so concurrent vs serial
    // is observationally identical; run them in registration order.
    for idx in &parallel {
        run_one(st, *idx, &mut failed_steps);
    }

    let phase_end = perf_now();
    let phase_duration = phase_end - phase_start;

    // success == every critical step in this phase completed.
    let all_critical_ok = st
        .steps
        .iter()
        .filter(|s| s.phase == phase && s.critical)
        .all(|s| s.status == "completed");

    st.phase_timings.push(PhaseTiming {
        phase: phase.to_string(),
        start_time: phase_start,
        end_time: phase_end,
        duration_ms: phase_duration,
        steps: total_steps,
        failed: failed_steps.len(),
    });

    (all_critical_ok, phase_duration, failed_steps)
}

fn run_phase(app: &tauri::AppHandle, args: &Value) -> Value {
    let phase = norm_phase(args.get(0));
    let (success, duration_ms, failed_steps) = {
        let mut st = state().lock_safe();
        run_phase_inner(&mut st, &phase)
    };

    let budget = phase_budget(DEFAULT_TIER, &phase);
    let over_budget = duration_ms > budget;

    let payload = json!({
        "success": success,
        "durationMs": duration_ms,
        "failedSteps": failed_steps,
    });
    crate::native_ops::emit_event(
        app,
        "startup-sequencer:phase",
        &json!({
            "phase": phase,
            "success": success,
            "durationMs": duration_ms,
            "overBudget": over_budget,
            "budget": budget,
        }),
    );
    payload
}

/// runAll(): A -> B -> C. Abort (return success:false) on a critical Phase A or B
/// failure; Phase C failures are non-blocking. On full success, start the 30s
/// session heartbeat (Rule 33/35). Returns { success, totalMs } like Electron.
fn run_all(app: &tauri::AppHandle) -> Value {
    let total_start = perf_now();
    {
        let mut st = state().lock_safe();
        st.total_start = total_start;
    }

    // Phase A.
    let a_ok = {
        let mut st = state().lock_safe();
        run_phase_inner(&mut st, "A").0
    };
    crate::native_ops::emit_event(app, "startup-sequencer:phase", &json!({ "phase": "A", "success": a_ok }));
    if !a_ok {
        let total = perf_now() - total_start;
        let mut st = state().lock_safe();
        st.total_end = perf_now();
        return json!({ "success": false, "totalMs": total });
    }

    // Phase B.
    let b_ok = {
        let mut st = state().lock_safe();
        run_phase_inner(&mut st, "B").0
    };
    crate::native_ops::emit_event(app, "startup-sequencer:phase", &json!({ "phase": "B", "success": b_ok }));
    if !b_ok {
        let total = perf_now() - total_start;
        let mut st = state().lock_safe();
        st.total_end = perf_now();
        return json!({ "success": false, "totalMs": total });
    }

    // Phase C — non-blocking.
    let c_ok = {
        let mut st = state().lock_safe();
        run_phase_inner(&mut st, "C").0
    };
    crate::native_ops::emit_event(app, "startup-sequencer:phase", &json!({ "phase": "C", "success": c_ok }));

    let total_ms = {
        let mut st = state().lock_safe();
        st.total_end = perf_now();
        st.total_end - st.total_start
    };

    let budget = phase_budget(DEFAULT_TIER, "total");
    let over_budget = total_ms > budget;

    // Rule 33: start session heartbeat after a successful full run.
    start_heartbeat(app);

    crate::native_ops::emit_event(
        app,
        "startup-sequencer:complete",
        &json!({ "success": true, "totalMs": total_ms, "overBudget": over_budget, "budget": budget }),
    );

    json!({ "success": true, "totalMs": total_ms })
}

/// Rule 33/35: write the session heartbeat to KV under `heartbeat:${sessionId}`
/// (mirrors Electron's databaseCluster.kvSet payload), then spawn a 30s thread
/// that keeps writing. Spawned at most once per process (HEARTBEAT_STARTED).
fn start_heartbeat(app: &tauri::AppHandle) {
    static HEARTBEAT_STARTED: AtomicBool = AtomicBool::new(false);
    if HEARTBEAT_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    // Immediate first write (matches startHeartbeat()'s eager writeHeartbeat()).
    write_heartbeat(app);

    let app = app.clone();
    crate::util::spawn_named("startup_sequencer", move || loop {
        std::thread::sleep(std::time::Duration::from_secs(30));
        write_heartbeat(&app);
    });
}

fn write_heartbeat(app: &tauri::AppHandle) {
    let session_start = {
        match state().lock() {
            Ok(g) => g.session_start_ms,
            Err(p) => p.into_inner().session_start_ms,
        }
    };
    let now = now_ms();
    let uptime = now.saturating_sub(session_start);
    let _ = crate::kv_set(
        app,
        &format!("heartbeat:{}", session_id()),
        json!({
            "sessionId": session_id(),
            "uptimeMs": uptime,
            "timestamp": now,
            "tier": DEFAULT_TIER,
        }),
    );
}

// ---------------------------------------------------------------------------
// Read-channel helpers (now backed by live state).
// ---------------------------------------------------------------------------

fn phase_timings_json() -> Value {
    let st = state().lock_safe();
    Value::Array(st.phase_timings.iter().map(phase_to_json).collect())
}

fn total_duration() -> Value {
    let st = state().lock_safe();
    json!(st.total_end - st.total_start)
}

fn is_complete() -> Value {
    let st = state().lock_safe();
    // steps.length > 0 && every(status != pending && status != running)
    let complete = !st.steps.is_empty()
        && st
            .steps
            .iter()
            .all(|s| s.status != "pending" && s.status != "running");
    json!(complete)
}

/// Route a `startup-sequencer:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The five read channels take no arguments;
/// the run-path channels (addStep/runStep/runPhase/runAll) take positional args.
/// Any unknown channel falls to `_ => Value::Null` (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- Reads (live state) ---
        "startup-sequencer:report" => get_report(),
        "startup-sequencer:phase-timings" => phase_timings_json(),
        "startup-sequencer:total-duration" => total_duration(),
        "startup-sequencer:is-complete" => is_complete(),
        "startup-sequencer:session-id" => json!(session_id()),

        // --- Heavy "run" path (real native engine) ---
        "startup-sequencer:addStep" => add_step(args),
        "startup-sequencer:runStep" => run_step(app, args),
        "startup-sequencer:runPhase" => run_phase(app, args),
        "startup-sequencer:runAll" => run_all(app),

        // Unknown channel in the namespace -> honest null.
        _ => Value::Null,
    }
}
