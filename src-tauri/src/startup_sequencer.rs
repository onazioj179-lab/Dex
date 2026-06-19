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
// SKIPPED (heavy; not ported, not faked):
//   - The "run" path — addStep / runAll / runPhase / runStep and the session
//     heartbeat (startHeartbeat/writeHeartbeat -> rewind DB) — needs the live
//     in-memory engine and the real boot step graph. These are NOT IPC channels
//     (no renderer reads them); they execute in the Electron main process at
//     boot. There is nothing for the renderer to invoke, so nothing falls
//     through here. Any unknown channel in the namespace returns Value::Null
//     (honest degrade), so prefix-routing the whole namespace is safe.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::sync::OnceLock;

const DEFAULT_TIER: i64 = 2;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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

/// getReport() — the full startup report. With no step graph or completed run on
/// this side, this is the report of an initialized-but-unrun sequencer:
/// empty phases/steps/slowestSteps and totalMs 0, with the live sessionId/tier.
fn get_report() -> Value {
    json!({
        "totalMs": 0,
        "phases": [],
        "steps": [],
        "slowestSteps": [],
        "sessionId": session_id(),
        "tier": DEFAULT_TIER,
    })
}

/// Route a `startup-sequencer:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts); all five reads take no arguments. Every
/// channel in the namespace is accounted for; any unknown one falls to
/// `_ => Value::Null` (honest degrade), so prefix-routing the namespace is safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "startup-sequencer:report" => get_report(),
        // getPhaseTimings(): no run has executed -> [] (== the empty accumulator).
        "startup-sequencer:phase-timings" => json!([]),
        // getTotalDuration(): totalEndTime - totalStartTime == 0 before runAll.
        "startup-sequencer:total-duration" => json!(0),
        // isComplete(): steps.length > 0 && every(...); no steps -> false.
        "startup-sequencer:is-complete" => json!(false),
        // sessionId (singleton field, generated once per process).
        "startup-sequencer:session-id" => json!(session_id()),
        // HEAVY (skipped): addStep / runAll / runPhase / heartbeat — not IPC
        // channels, need the live boot engine; honest null for anything else.
        _ => Value::Null,
    }
}
