// =============================================================================
// DEX Tauri — Startup timeline (`startup:timeline`).
//
// Real phases measured in this process: `anchor()` is called first thing in
// main(), and `mark()` records named points after it (WebView2 preflight, app
// setup, first page load). The renderer adds its own points (shell ready) and
// shows both in Nexus > Diagnostics. Shape: { totalMs, phases: [{ name,
// durationMs, atMs }] } where durationMs is the time since the previous mark.
// =============================================================================

use crate::util::LockSafe;
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

static ANCHOR: OnceLock<Instant> = OnceLock::new();
static MARKS: Mutex<Vec<(&'static str, u64)>> = Mutex::new(Vec::new());

/// Start of the timeline. Call as early as possible in main().
pub fn anchor() -> Instant {
    *ANCHOR.get_or_init(Instant::now)
}

/// Record a named point (first occurrence of each name only).
pub fn mark(name: &'static str) {
    let at = anchor().elapsed().as_millis() as u64;
    { let mut m = MARKS.lock_safe();
        if !m.iter().any(|(n, _)| *n == name) {
            m.push((name, at));
        }
    }
}

fn snapshot() -> Value {
    let total_ms = anchor().elapsed().as_millis() as u64;
    let marks = MARKS.lock_safe().clone();
    let mut prev = 0u64;
    let phases: Vec<Value> = marks
        .into_iter()
        .map(|(name, at)| {
            let d = at.saturating_sub(prev);
            prev = at;
            json!({ "name": name, "durationMs": d, "atMs": at })
        })
        .collect();
    json!({ "totalMs": total_ms, "phases": phases })
}

/// Route a `startup:*` channel.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "startup:timeline" => snapshot(),
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn marks_are_ordered_and_deduplicated() {
        super::anchor();
        super::mark("test:a");
        super::mark("test:b");
        super::mark("test:a");
        let v = super::snapshot();
        let names: Vec<&str> = v["phases"].as_array().unwrap().iter().filter_map(|p| p["name"].as_str()).filter(|n| n.starts_with("test:")).collect();
        assert_eq!(names, vec!["test:a", "test:b"]);
    }
}
