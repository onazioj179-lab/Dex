// =============================================================================
// DEX Tauri — Learning subsystem, data tier (port of the `learning` namespace
// model-store surface described for src/main/controllers/LearningController.ts).
//
// Pure-data, JSON-backed tier. The spec names an fs-json store
// `learning-models.json`; this mirrors that file under <appData> with a single
// top-level `{ "models": [...] }` wrapper (same wrapper convention as the
// analytics records store). `getModels` returns the stored array verbatim, or
// `[]` when the file is absent / unreadable / malformed.
//
// SCOPE / DIVERGENCES (documented):
//   - Only the DATA channel `getModels` is ported. The HEAVY channels `train`
//     and `predict` require a native ML runtime (model fitting / inference) and
//     are NOT ported and NOT faked — they are omitted from the match, so the
//     prefix route returns Value::Null for them (honest degrade). They also do
//     not appear in this repo's actual `learning` preload surface, so nothing in
//     the renderer reads a shaped object back from them.
//   - The model element shape is intentionally NOT invented. `getModels` only
//     reads what `train` (a skipped, native-only channel) would have written, so
//     until a native trainer populates the file the faithful result is an empty
//     list. We pass each stored model object through unchanged — we never add,
//     rename, or coerce fields.
//   - PREFIX-ROUTE CAVEAT: this module handles ONLY the model-store channels of
//     the `learning:*` namespace. The shipping Electron app (LocalLearningEngine
//     in src/main/core) registers many other `learning:*` channels
//     (recordActivity, getPatterns, getConfig, exportData, ...). Routing the
//     WHOLE `learning:` prefix here would swallow those into Value::Null. Route
//     ONLY the exact channels in `channelsPorted` to this dispatch (or guard the
//     prefix route accordingly). Hence prefixRouteSafe = false.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const MODELS_FILE: &str = "learning-models.json";

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// getModels() — the stored model array under the `models` wrapper, [] if unset.
fn get_models(app: &tauri::AppHandle) -> Value {
    let models = read_file(app, MODELS_FILE)
        .get("models")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    json!(models)
}

/// Route a `learning:*` model-store channel. Args are the positional JSON array
/// the renderer sent (see tauriCompat.ts). Only the ported data channel is
/// handled; the heavy `train` / `predict` channels are intentionally omitted and
/// fall through to Value::Null (not implemented, not faked).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "learning:getModels" => get_models(app),
        // "learning:train"   — heavy: needs native ML runtime; not ported.
        // "learning:predict" — heavy: needs native ML runtime; not ported.
        _ => Value::Null,
    }
}
