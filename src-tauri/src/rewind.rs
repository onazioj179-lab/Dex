// =============================================================================
// DEX 6.0 — Rewind IPC (bridges core/dex-rewind into the Tauri shell)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Routes `rewind:*` channels to the native `dex-rewind` reconstruction engine
//! (pure — no DB / IO). The renderer passes a positional args array; we return
//! the reconstructed sessions / workspace as JSON.

use serde_json::Value;

/// Parse the events argument (positional arg 0) into the native event type.
fn parse_events(v: Option<&Value>) -> Vec<dex_rewind::ActivityEvent> {
    match v {
        Some(val) => serde_json::from_value(val.clone()).unwrap_or_default(),
        None => Vec::new(),
    }
}

/// `rewind:buildTimeline` (args: `[events, gapMs?]`) -> `[TimelineSession]`
/// `rewind:reconstruct`   (args: `[events]`)         -> `ReconstructedWorkspace`
pub fn dispatch(channel: &str, args: &Value) -> Value {
    match channel {
        "rewind:buildTimeline" => {
            let events = parse_events(args.get(0));
            let gap = args
                .get(1)
                .and_then(|v| v.as_i64())
                .unwrap_or(dex_rewind::DEFAULT_SESSION_GAP_MS);
            let sessions = dex_rewind::build_timeline(&events, gap);
            serde_json::to_value(sessions).unwrap_or(Value::Null)
        }
        "rewind:reconstruct" => {
            let events = parse_events(args.get(0));
            let workspace = dex_rewind::reconstruct_workspace(&events);
            serde_json::to_value(workspace).unwrap_or(Value::Null)
        }
        _ => Value::Null,
    }
}
