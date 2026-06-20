// =============================================================================
// DEX Tauri — Enforce subsystem (port of the `enforce:*` IPC handlers in
// core/PerformanceEnforcer.ts).
//
// PerformanceEnforcer is a LIVE runtime monitor. In Electron a 30s setInterval
// loop samples frame time / CPU / memory and broadcasts `enforce:action` to all
// windows; a jank counter resets every 60s; a 5-minute timer establishes a
// baseline. The renderer pushes metrics in via the fire-and-forget
// `enforce:metrics` channel.
//
// This port reconstructs that behaviour natively, statelessly-per-dispatch but
// with REAL persisted state on the DataStore-KV `enforce` key (crate::kv_get /
// crate::kv_set, dex-kv.json) so checks/snapshots compute from the renderer's
// last-reported metrics rather than being faked:
//
//   - enforce:metrics / enforce:reportMetrics — fire-and-forget. Records
//     frameTime / inputLatency / isIdle (and accumulates jank frames) into
//     KV `enforce.metrics`, mirroring recordFrameTime/recordInputLatency. Void.
//   - enforce:getGuarantees / enforce:getPolicy — the frozen GUARANTEES object
//     (the performance policy). Emitted verbatim.
//   - enforce:getBaseline — persisted PerformanceBaseline or null.
//   - enforce:getSnapshot — EnforcementSnapshot computed from the last persisted
//     check, augmented with LIVE process memory/CPU via sysinfo.
//   - enforce:check — runs performCheck() against current persisted metrics +
//     live process memory/CPU, persists consecutiveFailures / action / lastCheck,
//     broadcasts `enforce:action` to the renderer (native_ops::emit_event), and
//     returns the fresh snapshot. This is the heavy enforcement driver.
//   - enforce:enforce / enforce:throttle / enforce:prioritize — the heavy
//     enforcement VERBS. `enforce` runs a check + broadcasts the resulting
//     action; `throttle` forces the 'throttle' action and broadcasts it;
//     `prioritize` raises the OS scheduling priority of THIS process (real OS
//     call: Windows `wmic process ... CALL setpriority`, Unix `renice`) and
//     broadcasts 'none'. All persist their action to KV.
//
// Storage: DataStore-KV, key "enforce" (crate::kv_get / crate::kv_set). The
// shape under that key:
//   {
//     "baseline": PerformanceBaseline | (absent),
//     "metrics":  { frameTime, inputLatency, isIdle, jankFramesThisMinute,
//                   jankWindowStart },
//     "state":    { consecutiveFailures, action, lastCheck:[GuaranteeCheck],
//                   startTime }
//   }
//
// DIVERGENCES (documented):
//   - GPU activity is not sampled (no portable no-dep source); the GPU guarantee
//     is informational only and was never a `checkX` in Electron, so it is not
//     part of the check set here either — identical to the TS check list.
//   - Baseline is establishable here only if the renderer has reported metrics
//     at least once; absent that it stays null, matching the renderer default.
//   - GUARANTEES values are emitted as the same JSON numbers Electron sent over
//     IPC (e.g. TARGET_FRAME_TIME_MS = 8.33). serde emits them identically.
// =============================================================================

use serde_json::{json, Value};

const ENFORCE_KEY: &str = "enforce";

// --- GUARANTEES (policy) -----------------------------------------------------

const MAX_MEMORY_MB: f64 = 2048.0;
const MAX_IDLE_CPU_PERCENT: f64 = 0.5;
const MAX_ACTIVE_CPU_PERCENT: f64 = 25.0;
const TARGET_FRAME_TIME_MS: f64 = 8.33;
const MAX_FRAME_TIME_MS: f64 = 16.67;
const MAX_JANK_FRAMES_PER_MINUTE: f64 = 3.0;
const MAX_TYPING_LATENCY_MS: f64 = 16.0;
const MAX_PERFORMANCE_DEGRADATION_PERCENT: f64 = 10.0;

// Mirror of GUARANTEES in PerformanceEnforcer.ts, field-for-field. This is the
// frozen policy object the renderer receives from enforce:getGuarantees.
fn guarantees() -> Value {
    json!({
        // Memory (hard ceilings)
        "MAX_MEMORY_MB": 2048,
        "MEMORY_GROWTH_MB_PER_HOUR": 10,
        // CPU (idle floor)
        "MAX_IDLE_CPU_PERCENT": 0.5,
        "MAX_ACTIVE_CPU_PERCENT": 25,
        // GPU (idle floor)
        "MAX_IDLE_GPU_ACTIVITY": 0,
        // Frame timing (smoothness)
        "TARGET_FRAME_TIME_MS": 8.33,
        "MAX_FRAME_TIME_MS": 16.67,
        "MAX_FRAME_VARIANCE": 2,
        "MAX_JANK_FRAMES_PER_MINUTE": 3,
        // Input latency (responsiveness)
        "MAX_TYPING_LATENCY_MS": 16,
        "MAX_SCROLL_LATENCY_MS": 8,
        "MAX_CLICK_LATENCY_MS": 16,
        // Long-session stability
        "MAX_PERFORMANCE_DEGRADATION_PERCENT": 10,
        "SESSION_STABILITY_HOURS": 24,
    })
}

// --- time + KV helpers -------------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Read the whole `enforce` KV blob as an object (empty object if unset/wrong type).
fn load(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    match crate::kv_get(app, ENFORCE_KEY) {
        Value::Object(o) => o,
        _ => serde_json::Map::new(),
    }
}

fn save(app: &tauri::AppHandle, blob: serde_json::Map<String, Value>) {
    crate::kv_set(app, ENFORCE_KEY, Value::Object(blob));
}

// Fetch a sub-object by key, guaranteeing an object Value (so index-assign is
// panic-safe even if the persisted value was somehow not an object).
fn sub_object(blob: &serde_json::Map<String, Value>, key: &str) -> Value {
    match blob.get(key) {
        Some(v) if v.is_object() => v.clone(),
        _ => json!({}),
    }
}

fn f(v: Option<&Value>) -> f64 {
    v.and_then(|x| x.as_f64()).unwrap_or(0.0)
}

// --- live process sampling (sysinfo) ----------------------------------------

// (memory_mb, cpu_percent) for THIS process. Mirrors the values Electron would
// have pushed via updateMemory/updateCPU from its own sampling loop. We sample
// the real process so checks reflect the actual machine, not a fabrication.
fn sample_process() -> (f64, f64) {
    let mut sys = sysinfo::System::new();
    let pid = sysinfo::Pid::from_u32(std::process::id());
    sys.refresh_process(pid);
    // A second refresh after the minimum interval yields a real cpu delta.
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_process(pid);
    match sys.process(pid) {
        Some(p) => (
            p.memory() as f64 / (1024.0 * 1024.0),
            p.cpu_usage() as f64,
        ),
        None => (0.0, 0.0),
    }
}

// --- individual checks (parity with PerformanceEnforcer.ts) ------------------

fn check(name: &str, status: &str, current: f64, target: f64, unit: &str, msg: Option<String>) -> Value {
    let mut o = json!({
        "name": name,
        "status": status,
        "current": current,
        "target": target,
        "unit": unit,
    });
    // Electron only sets `message` when defined; absent otherwise.
    if let Some(m) = msg {
        o["message"] = Value::String(m);
    }
    o
}

fn check_memory(mem_mb: f64) -> Value {
    let target = MAX_MEMORY_MB;
    let (status, msg) = if mem_mb > target {
        ("failing", Some(format!("{}MB exceeds {}MB limit", mem_mb as i64, target as i64)))
    } else if mem_mb > target * 0.9 {
        ("warning", None)
    } else {
        ("passing", None)
    };
    check("Memory", status, mem_mb, target, "MB", msg)
}

fn check_cpu(cpu: f64, is_idle: bool) -> Value {
    let target = if is_idle { MAX_IDLE_CPU_PERCENT } else { MAX_ACTIVE_CPU_PERCENT };
    let (status, msg) = if cpu > target * 2.0 {
        ("failing", Some(format!("{:.1}% exceeds {}% limit", cpu, target)))
    } else if cpu > target {
        ("warning", None)
    } else {
        ("passing", None)
    };
    check(if is_idle { "Idle CPU" } else { "Active CPU" }, status, cpu, target, "%", msg)
}

fn check_frame_time(ft: f64) -> Value {
    let target = TARGET_FRAME_TIME_MS;
    let (status, msg) = if ft > MAX_FRAME_TIME_MS {
        ("failing", Some(format!("{:.1}ms exceeds 60Hz threshold", ft)))
    } else if ft > target {
        ("warning", None)
    } else {
        ("passing", None)
    };
    check("Frame Time", status, ft, target, "ms", msg)
}

fn check_input_latency(lat: f64) -> Value {
    let target = MAX_TYPING_LATENCY_MS;
    let (status, msg) = if lat > target * 2.0 {
        ("failing", Some(format!("{:.1}ms exceeds {}ms limit", lat, target as i64)))
    } else if lat > target {
        ("warning", None)
    } else {
        ("passing", None)
    };
    check("Input Latency", status, lat, target, "ms", msg)
}

fn check_jank(jank: f64) -> Value {
    let target = MAX_JANK_FRAMES_PER_MINUTE;
    let (status, msg) = if jank > target * 3.0 {
        ("failing", Some(format!("{} jank frames in last minute", jank as i64)))
    } else if jank > target {
        ("warning", None)
    } else {
        ("passing", None)
    };
    check("Jank Frames", status, jank, target, "/min", msg)
}

fn check_degradation(baseline: &Value, mem_mb: f64, ft: f64) -> Value {
    let base_mem = f(baseline.get("memoryMB"));
    let base_ft = f(baseline.get("avgFrameTime"));
    if base_mem == 0.0 && base_ft == 0.0 {
        return check("Degradation", "passing", 0.0, 0.0, "%", None);
    }
    let mem_deg = if base_mem != 0.0 { ((mem_mb - base_mem) / base_mem) * 100.0 } else { 0.0 };
    let frame_deg = if base_ft != 0.0 { ((ft - base_ft) / base_ft) * 100.0 } else { 0.0 };
    let max_deg = mem_deg.max(frame_deg);
    let target = MAX_PERFORMANCE_DEGRADATION_PERCENT;
    let (status, msg) = if max_deg > target * 2.0 {
        ("failing", Some(format!("Performance degraded {:.1}% from baseline", max_deg)))
    } else if max_deg > target {
        ("warning", None)
    } else {
        ("passing", None)
    };
    check("Degradation", status, max_deg, target, "%", msg)
}

// determineAction parity.
fn determine_action(overall: &str, failing: &[Value], consecutive: i64) -> &'static str {
    if overall == "passing" {
        return "none";
    }
    let mem_critical = failing.iter().any(|c| {
        c.get("name").and_then(|n| n.as_str()) == Some("Memory")
            && f(c.get("current")) > MAX_MEMORY_MB * 1.1
    });
    if consecutive >= 5 || mem_critical {
        return "emergency";
    }
    let frame_issue = failing.iter().any(|c| {
        matches!(
            c.get("name").and_then(|n| n.as_str()),
            Some("Frame Time") | Some("Jank Frames")
        )
    });
    if frame_issue {
        return "reduce-motion";
    }
    "throttle"
}

// --- core: run a performCheck and persist the result -------------------------

// Returns (snapshot, action). Mutates and saves the `enforce` blob.
fn perform_check(app: &tauri::AppHandle) -> (Value, String) {
    let mut blob = load(app);

    let metrics = blob.get("metrics").cloned().unwrap_or(Value::Null);
    let frame_time = f(metrics.get("frameTime"));
    let input_latency = f(metrics.get("inputLatency"));
    let is_idle = metrics.get("isIdle").and_then(|v| v.as_bool()).unwrap_or(true);
    let jank = f(metrics.get("jankFramesThisMinute"));

    let (mem_mb, cpu) = sample_process();
    let baseline = blob.get("baseline").cloned().unwrap_or(Value::Null);

    let mut checks: Vec<Value> = vec![
        check_memory(mem_mb),
        check_cpu(cpu, is_idle),
        check_frame_time(frame_time),
        check_input_latency(input_latency),
        check_jank(jank),
    ];
    if baseline.is_object() {
        checks.push(check_degradation(&baseline, mem_mb, frame_time));
    }

    let failing: Vec<Value> = checks
        .iter()
        .filter(|c| c.get("status").and_then(|s| s.as_str()) == Some("failing"))
        .cloned()
        .collect();
    let warning_count = checks
        .iter()
        .filter(|c| c.get("status").and_then(|s| s.as_str()) == Some("warning"))
        .count();

    // consecutiveFailures from prior state.
    let mut consecutive = f(blob.get("state").and_then(|s| s.get("consecutiveFailures"))) as i64;

    let overall = if !failing.is_empty() {
        consecutive += 1;
        "failing"
    } else if warning_count > 0 {
        consecutive = 0;
        "warning"
    } else {
        consecutive = 0;
        "passing"
    };

    let action = determine_action(overall, &failing, consecutive).to_string();

    // startTime: keep existing or initialise now.
    let start_time = {
        let existing = f(blob.get("state").and_then(|s| s.get("startTime"))) as i64;
        if existing > 0 { existing } else { now_ms() }
    };

    blob.insert(
        "state".to_string(),
        json!({
            "consecutiveFailures": consecutive,
            "action": action,
            "lastCheck": checks,
            "startTime": start_time,
        }),
    );
    save(app, blob);

    let snapshot = build_snapshot(&checks, &action, consecutive, start_time);
    (snapshot, action)
}

fn build_snapshot(checks: &[Value], action: &str, consecutive: i64, start_time: i64) -> Value {
    let failing = checks
        .iter()
        .filter(|c| c.get("status").and_then(|s| s.as_str()) == Some("failing"))
        .count();
    let warning = checks
        .iter()
        .filter(|c| c.get("status").and_then(|s| s.as_str()) == Some("warning"))
        .count();
    let overall = if failing > 0 {
        "failing"
    } else if warning > 0 {
        "warning"
    } else {
        "passing"
    };
    json!({
        "timestamp": now_ms(),
        "overallStatus": overall,
        "checks": checks,
        "action": action,
        "consecutiveFailures": consecutive,
        "uptimeHours": (now_ms() - start_time) as f64 / 3_600_000.0,
    })
}

// enforce:getSnapshot — Electron returns getSnapshot() from the last check's
// cached state (lastCheck/currentAction/consecutiveFailures). We read the
// persisted state; if no check has run yet, mirror the renderer's default
// (empty checks, action 'none', passing).
fn get_snapshot(app: &tauri::AppHandle) -> Value {
    let blob = load(app);
    let state = blob.get("state").cloned().unwrap_or(Value::Null);
    let checks: Vec<Value> = state
        .get("lastCheck")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let action = state
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("none")
        .to_string();
    let consecutive = f(state.get("consecutiveFailures")) as i64;
    let start_time = {
        let s = f(state.get("startTime")) as i64;
        if s > 0 { s } else { now_ms() }
    };
    build_snapshot(&checks, &action, consecutive, start_time)
}

// enforce:getBaseline — persisted PerformanceBaseline or null.
fn get_baseline(app: &tauri::AppHandle) -> Value {
    load(app).get("baseline").cloned().unwrap_or(Value::Null)
}

// enforce:metrics / reportMetrics — fire-and-forget. Records the renderer's
// reported frameTime/inputLatency/isIdle and accumulates jank frames within a
// rolling 60s window (mirrors recordFrameTime's jank counter + the 60s reset
// interval, computed on-write instead of via a timer). Also lazily establishes
// the baseline once metrics exist (Electron's 5-min timer equivalent: first
// real sample). Returns null (renderer ignores the result).
fn record_metrics(app: &tauri::AppHandle, args: &Value) -> Value {
    let m = args.get(0).cloned().unwrap_or(Value::Null);
    if !m.is_object() {
        return Value::Null;
    }
    let mut blob = load(app);
    let mut metrics = sub_object(&blob, "metrics");

    let now = now_ms();
    // Rolling jank window: reset count if the 60s window elapsed.
    let mut window_start = f(metrics.get("jankWindowStart")) as i64;
    let mut jank = f(metrics.get("jankFramesThisMinute"));
    if window_start == 0 || now - window_start >= 60_000 {
        window_start = now;
        jank = 0.0;
    }

    if let Some(ft) = m.get("frameTime").and_then(|v| v.as_f64()) {
        metrics["frameTime"] = json!(ft);
        // Jank: frame time > 2x target.
        if ft > TARGET_FRAME_TIME_MS * 2.0 {
            jank += 1.0;
        }
    }
    if let Some(lat) = m.get("inputLatency").and_then(|v| v.as_f64()) {
        metrics["inputLatency"] = json!(lat);
    }
    if let Some(idle) = m.get("isIdle").and_then(|v| v.as_bool()) {
        metrics["isIdle"] = json!(idle);
    }
    metrics["jankFramesThisMinute"] = json!(jank);
    metrics["jankWindowStart"] = json!(window_start);

    blob.insert("metrics".to_string(), metrics.clone());

    // Establish baseline on first real metrics sample if absent (parity with
    // establishBaseline: snapshot current metrics + live memory/cpu once).
    if !blob.get("baseline").map(|b| b.is_object()).unwrap_or(false) {
        let (mem_mb, cpu) = sample_process();
        blob.insert(
            "baseline".to_string(),
            json!({
                "memoryMB": mem_mb,
                "cpuPercent": cpu,
                "avgFrameTime": f(metrics.get("frameTime")),
                "avgInputLatency": f(metrics.get("inputLatency")),
                "timestamp": now,
            }),
        );
    }

    save(app, blob);
    Value::Null
}

// Broadcast the enforcement action to the renderer (parity with executeAction's
// webContents.send('enforce:action', action)).
fn broadcast_action(app: &tauri::AppHandle, action: &str) {
    crate::native_ops::emit_event(app, "enforce:action", &json!(action));
}

// enforce:enforce — heavy. Run a real check, persist + broadcast the resulting
// action, return the snapshot. This is the manual trigger of the enforcement
// loop's body.
fn do_enforce(app: &tauri::AppHandle) -> Value {
    let (snapshot, action) = perform_check(app);
    broadcast_action(app, &action);
    snapshot
}

// enforce:throttle — heavy. Force the 'throttle' enforcement action: persist it
// as the current action and broadcast it to the renderer so motion/work is
// reduced. Returns { success, action }.
fn do_throttle(app: &tauri::AppHandle) -> Value {
    let mut blob = load(app);
    let mut state = sub_object(&blob, "state");
    state["action"] = json!("throttle");
    blob.insert("state".to_string(), state);
    save(app, blob);
    broadcast_action(app, "throttle");
    json!({ "success": true, "action": "throttle" })
}

// enforce:prioritize — heavy. Raise THIS process's OS scheduling priority so the
// shell gets more CPU. Real OS call (no new dependency): on Windows use WMIC
// setpriority (32768 = ABOVE_NORMAL); on Unix `renice -n -5`. Broadcasts 'none'
// (recovery) and persists it. Returns { success, action, raised }.
fn do_prioritize(app: &tauri::AppHandle) -> Value {
    let pid = std::process::id();
    let raised = raise_priority(pid);

    let mut blob = load(app);
    let mut state = sub_object(&blob, "state");
    state["action"] = json!("none");
    blob.insert("state".to_string(), state);
    save(app, blob);
    broadcast_action(app, "none");

    json!({ "success": raised, "action": "none", "raised": raised })
}

fn raise_priority(pid: u32) -> bool {
    let mut cmd;
    #[cfg(windows)]
    {
        // WMIC setpriority: 32768 = ABOVE_NORMAL_PRIORITY_CLASS.
        cmd = std::process::Command::new("wmic");
        cmd.args([
            "process",
            "where",
            &format!("ProcessId={}", pid),
            "CALL",
            "setpriority",
            "32768",
        ]);
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    #[cfg(not(windows))]
    {
        cmd = std::process::Command::new("renice");
        cmd.args(["-n", "-5", "-p", &pid.to_string()]);
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

/// Route an `enforce:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). All listed channels are answered with real native
/// behaviour; unknown channels degrade to null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // Policy getters (getGuarantees IS the policy; getPolicy is the alias).
        "enforce:getGuarantees" | "enforce:getPolicy" => guarantees(),
        // Read-only baseline, persisted-or-null.
        "enforce:getBaseline" => get_baseline(app),
        // Snapshot of last check (or default state).
        "enforce:getSnapshot" => get_snapshot(app),
        // Force a check: run, persist, broadcast, return snapshot.
        "enforce:check" => {
            let (snapshot, action) = perform_check(app);
            broadcast_action(app, &action);
            snapshot
        }
        // Heavy enforcement verbs.
        "enforce:enforce" => do_enforce(app),
        "enforce:throttle" => do_throttle(app),
        "enforce:prioritize" => do_prioritize(app),
        // Fire-and-forget metrics ingestion (both channel spellings).
        "enforce:metrics" | "enforce:reportMetrics" => record_metrics(app, args),
        // Unknown -> honest null.
        _ => Value::Null,
    }
}
