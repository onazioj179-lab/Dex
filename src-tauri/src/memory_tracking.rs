// =============================================================================
// DEX Tauri — Memory / Activity tracking subsystem (port of the `memory:*`
// handlers in src/main/main.ts).
//
// Electron backed activity records with the DataStore-KV store under the
// `activities` key (an array). This mirrors that exactly via crate::kv_get /
// crate::kv_set with the SAME key string ("activities"), so the renderer is
// unchanged.
//
// Only ONE channel lives in this namespace:
//   memory:recordActivity(activity) -> { success: true }
//     Reads the `activities` array (default []), appends
//       { ...activity, id: "act-<epochMillis>", timestamp: <epochMillis> }
//     caps the array to the most-recent 1000 entries, persists, returns
//     { success: true }.
//
// DIVERGENCES (documented):
//   - id / timestamp: Electron called Date.now() TWICE (once for the id suffix,
//     once for `timestamp`); in practice they are the same millisecond. This
//     port calls SystemTime once and reuses it for both, so id and timestamp are
//     guaranteed identical. The id format ("act-<ms>") matches Electron exactly;
//     note Electron used Date.now() here (NOT a uuid), so pseudo_uuid_v4 is
//     intentionally not used for the id.
//   - The renderer's activity payload is spread first, then id/timestamp are set
//     last, so an incoming `id`/`timestamp` on the activity is overwritten —
//     same as the Electron object-spread ordering.
// =============================================================================

use serde_json::{json, Value};

const ACTIVITIES_KEY: &str = "activities";
const MAX_ACTIVITIES: usize = 1000;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_activities(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, ACTIVITIES_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn record_activity(app: &tauri::AppHandle, activity: &Value) -> Value {
    let mut activities = read_activities(app);

    // { ...activity, id: `act-${Date.now()}`, timestamp: Date.now() }
    let ts = now_ms();
    let mut entry = activity.as_object().cloned().unwrap_or_default();
    entry.insert("id".into(), json!(format!("act-{}", ts)));
    entry.insert("timestamp".into(), json!(ts));
    activities.push(Value::Object(entry));

    // Cap to the most-recent MAX_ACTIVITIES (Electron: splice(0, len - 1000)).
    if activities.len() > MAX_ACTIVITIES {
        let drop = activities.len() - MAX_ACTIVITIES;
        activities.drain(0..drop);
    }

    crate::kv_set(app, ACTIVITIES_KEY, Value::Array(activities));
    json!({ "success": true })
}

/// Route a `memory:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Returns Value::Null for any channel not handled
/// here, so prefix routing (channel.starts_with("memory:")) is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "memory:recordActivity" => {
            let activity = args.get(0).cloned().unwrap_or(Value::Null);
            record_activity(app, &activity)
        }
        _ => Value::Null,
    }
}
