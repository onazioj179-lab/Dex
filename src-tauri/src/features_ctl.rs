// =============================================================================
// DEX Tauri — Feature Flags subsystem (port of the DATA/read surface of
// controllers/FeatureFlagsController.ts).
//
// Pure-data, JSON-backed tier. Electron used a default-named `electron-store`
// constructed as `new Store({ defaults: { featureFlags, maintenance,
// apiVersion, lastMigration } })`. Per the migration spec the backing file is
// mirrored under <appData> as `features.json` with the SAME top-level key
// wrappers; only `featureFlags` (the user override map: Record<id, boolean>) is
// read by the channels ported here. The maintenance / apiVersion / lastMigration
// keys are read where the original logic consults them (isEnabled reads the
// `maintenance` wrapper) but are never written by this read-only surface.
//
// The DEFAULT_FEATURES table is reproduced verbatim from the controller (same
// ids, names, descriptions, enabled/defaultValue/stable, and the optional
// minVersion field exactly where the TS object declared it). No `deprecated` /
// `deprecatedMessage` appear in any default entry, so — matching the TS object
// literals — those keys are emitted ONLY when present (never as null), so the
// per-feature shape returned to the renderer is byte-for-byte what Electron's
// `Array.from(this.features.values())` produced.
//
// Channels & shapes:
//   - features:getAll        -> FeatureFlag[]            (resolved `enabled`)
//   - features:get(id)       -> FeatureFlag | null       (undefined -> null)
//   - features:isEnabled(id) -> boolean
//   - features:getStable     -> FeatureFlag[]  (f.stable === true)
//   - features:getExperimental -> FeatureFlag[] (f.stable === false)
//   - features:toggle(id, enabled) -> { success, error? }  (persists override)
//   - features:resetAll      -> { success }                (clears overrides)
// where FeatureFlag = { id, name, description, enabled, defaultValue, stable,
//   minVersion? }.
//
// `enabled` resolution mirrors initializeFeatures(): the saved override from
// `featureFlags[id]` if defined, else the feature's defaultValue.
//
// DIVERGENCES (documented):
//   - app.getVersion() (used by isEnabled's minVersion gate) is sourced from
//     env!("CARGO_PKG_VERSION"), the SAME source the house uses for
//     app:getVersion / corepc:getVersion in this Tauri build.
//   - features:toggle / features:resetAll mutate the persisted override map in
//     features.json via write_flags() (preserving the other top-level wrappers)
//     and, in place of the original electron-log lines, push a renderer event
//     (features:changed / features:reset) through native_ops::emit_event. The
//     `deprecated` warn-log branch has no effect (no default feature is
//     deprecated) and is omitted.
//   - Maintenance/API/migration handlers (maintenance:*, api:*) live in a
//     different namespace and are out of scope for this `features` port.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const STORE_FILE: &str = "features.json";

// --- file IO (electron-store JSON under appData) -----------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// store.set('featureFlags', flags): rewrite features.json preserving every other
// top-level wrapper (maintenance / apiVersion / lastMigration), filling in the
// electron-store defaults for any wrapper that did not yet exist on disk. This
// mirrors electron-store's behaviour of persisting the whole object while only
// the `featureFlags` key changes.
fn write_flags(app: &tauri::AppHandle, flags: serde_json::Map<String, Value>) -> bool {
    let mut obj = match read_store(app) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    // Backfill the electron-store defaults so the file stays well-formed.
    if !obj.contains_key("maintenance") {
        obj.insert(
            "maintenance".into(),
            json!({ "enabled": false, "disabledFeatures": [] }),
        );
    }
    if !obj.contains_key("apiVersion") {
        obj.insert("apiVersion".into(), json!("1.1.0"));
    }
    if !obj.contains_key("lastMigration") {
        obj.insert("lastMigration".into(), json!("1.0.0"));
    }
    obj.insert("featureFlags".into(), Value::Object(flags));
    let serialized = match serde_json::to_string_pretty(&Value::Object(obj)) {
        Ok(s) => s,
        Err(_) => return false,
    };
    std::fs::write(store_path(app), serialized).is_ok()
}

// store.get('featureFlags') with the electron-store default of {}.
fn saved_flags(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    read_store(app)
        .get("featureFlags")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

// store.get('maintenance') with the electron-store default
// { enabled: false, disabledFeatures: [] }.
fn maintenance(app: &tauri::AppHandle) -> Value {
    read_store(app)
        .get("maintenance")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(|| json!({ "enabled": false, "disabledFeatures": [] }))
}

// --- DEFAULT_FEATURES (verbatim from FeatureFlagsController.ts) --------------

// A default feature: (id, name, description, enabled, defaultValue, stable,
// minVersion-or-empty). minVersion "" means the TS literal had no minVersion key.
type Def = (&'static str, &'static str, &'static str, bool, bool, bool, &'static str);

const DEFAULT_FEATURES: &[Def] = &[
    // Core Features (Stable)
    ("power_management", "Power Management", "CPU/memory optimization and power profiles", true, true, true, ""),
    ("notes", "Quick Notes", "Create and manage notes", true, true, true, ""),
    ("tasks", "Task Management", "Task lists and to-dos", true, true, true, ""),
    ("workflows", "Automation Workflows", "Create automated workflows", true, true, true, ""),
    ("operations", "Quick Operations", "One-click system operations", true, true, true, ""),
    ("rules", "Automation Rules", "Event-triggered automation rules", true, true, true, ""),
    ("timers", "Timers & Reminders", "Set timers and reminders", true, true, true, ""),
    // Advanced Features
    ("voice_control", "Voice Control", "Voice commands and recording", true, true, true, ""),
    ("media_capture", "Media Capture", "Screenshots and screen recording", true, true, true, ""),
    ("learning_mode", "Learning Mode", "Learn from user actions", true, true, true, ""),
    // Expert Features
    ("expert_mode", "Expert Mode", "Advanced system control options", false, false, true, ""),
    ("system_integrity", "System Integrity Panel", "Monitor system health and processes", true, true, true, ""),
    // Experimental Features
    ("ai_suggestions", "AI Suggestions", "AI-powered action suggestions", false, false, false, "1.1.0"),
    ("cloud_sync", "Cloud Sync", "Sync data across devices", false, false, false, "2.0.0"),
    ("plugin_system", "Plugin System", "Load third-party plugins", false, false, false, "2.0.0"),
    // Roadmap flags
    ("uki_native_store", "UKI Native Store (SQLite + FTS5)", "Cold-tier UKI storage backed by the Rust native module.", false, false, false, "4.5.0"),
    ("uki_semantic_search", "UKI Semantic Search", "On-device embeddings + vector recall for UKI queries.", false, false, false, "4.6.0"),
    ("service_host", "Service Host Lifecycle", "Unified lifecycle for new backend services (start/stop/health).", false, false, false, "4.4.1"),
    ("snap_layouts_v2", "Snap Layouts V2", "Hover-based snap zone selector inspired by Windows 11.", false, false, false, "4.7.0"),
    ("tiling_mode", "Tiling Window Mode", "i3-style keyboard-first tiling layout.", false, false, false, "4.7.0"),
    ("dexctl_cli", "dexctl CLI Bridge", "Local CLI for scripting DEX from a terminal.", false, false, false, "4.7.0"),
    ("cross_app_refs", "Cross-App References", "application/x-dex-ref MIME for cross-app drag/drop and pasting.", false, false, false, "4.6.0"),
];

// Build a feature object with the saved-override-or-default `enabled`, emitting
// minVersion ONLY when the default declared one (mirrors the TS literal shape).
fn feature_obj(def: &Def, flags: &serde_json::Map<String, Value>) -> Value {
    let (id, name, description, _enabled, default_value, stable, min_version) = *def;
    // initializeFeatures: enabled = saved !== undefined ? saved : defaultValue.
    let enabled = match flags.get(id).and_then(|v| v.as_bool()) {
        Some(b) => b,
        None => default_value,
    };
    let mut obj = serde_json::Map::new();
    obj.insert("id".into(), json!(id));
    obj.insert("name".into(), json!(name));
    obj.insert("description".into(), json!(description));
    obj.insert("enabled".into(), json!(enabled));
    obj.insert("defaultValue".into(), json!(default_value));
    obj.insert("stable".into(), json!(stable));
    if !min_version.is_empty() {
        obj.insert("minVersion".into(), json!(min_version));
    }
    Value::Object(obj)
}

fn all_features(app: &tauri::AppHandle) -> Vec<Value> {
    let flags = saved_flags(app);
    DEFAULT_FEATURES.iter().map(|d| feature_obj(d, &flags)).collect()
}

// compareVersions(a, b): -1 if a<b, 1 if a>b, 0 if equal (numeric per-segment).
fn compare_versions(a: &str, b: &str) -> i32 {
    let pa: Vec<i64> = a.split('.').map(|s| s.parse::<i64>().unwrap_or(0)).collect();
    let pb: Vec<i64> = b.split('.').map(|s| s.parse::<i64>().unwrap_or(0)).collect();
    let n = pa.len().max(pb.len());
    for i in 0..n {
        let na = *pa.get(i).unwrap_or(&0);
        let nb = *pb.get(i).unwrap_or(&0);
        if na > nb {
            return 1;
        }
        if na < nb {
            return -1;
        }
    }
    0
}

// isEnabled(id) — maintenance gate, feature lookup, minVersion gate, enabled.
fn is_enabled(app: &tauri::AppHandle, id: &str) -> bool {
    // Maintenance mode first: if enabled and id is in disabledFeatures -> false.
    let maint = maintenance(app);
    if maint.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false) {
        let disabled = maint
            .get("disabledFeatures")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if disabled.iter().any(|v| v.as_str() == Some(id)) {
            return false;
        }
    }

    let flags = saved_flags(app);
    let def = match DEFAULT_FEATURES.iter().find(|d| d.0 == id) {
        Some(d) => d,
        None => return false, // feature not found -> false
    };

    // Version requirement gate.
    if !def.6.is_empty() {
        let current = env!("CARGO_PKG_VERSION");
        if compare_versions(current, def.6) < 0 {
            return false;
        }
    }

    // feature.enabled (resolved override-or-default).
    match flags.get(id).and_then(|v| v.as_bool()) {
        Some(b) => b,
        None => def.4, // defaultValue
    }
}

/// Route a `features:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Read-only data channels and the mutating
/// toggle / resetAll channels are all ported; unknown channels fall through
/// to Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "features:getAll" => json!(all_features(app)),
        "features:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let flags = saved_flags(app);
            match DEFAULT_FEATURES.iter().find(|d| d.0 == id) {
                Some(d) => feature_obj(d, &flags),
                None => Value::Null, // Map.get(id) -> undefined -> null over IPC
            }
        }
        "features:isEnabled" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            json!(is_enabled(app, id))
        }
        "features:getStable" => {
            let stable: Vec<Value> = all_features(app)
                .into_iter()
                .filter(|f| f.get("stable").and_then(|v| v.as_bool()).unwrap_or(false))
                .collect();
            json!(stable)
        }
        "features:getExperimental" => {
            let exp: Vec<Value> = all_features(app)
                .into_iter()
                .filter(|f| !f.get("stable").and_then(|v| v.as_bool()).unwrap_or(false))
                .collect();
            json!(exp)
        }
        // toggleFeature(id, enabled): validate, version-gate when enabling,
        // persist the override, push a renderer event, return { success, error? }.
        "features:toggle" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let enabled = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);

            // feature lookup (Map.get(id) -> undefined).
            let def = match DEFAULT_FEATURES.iter().find(|d| d.0 == id) {
                Some(d) => d,
                None => return json!({ "success": false, "error": "Feature not found" }),
            };

            // Version requirement for ENABLING (def.6 is the minVersion, "" = none).
            if enabled && !def.6.is_empty() {
                let current = env!("CARGO_PKG_VERSION");
                if compare_versions(current, def.6) < 0 {
                    return json!({
                        "success": false,
                        "error": format!(
                            "This feature requires version {} or higher",
                            def.6
                        )
                    });
                }
            }

            // Persist: flags[id] = enabled; store.set('featureFlags', flags).
            let mut flags = saved_flags(app);
            flags.insert(id.to_string(), json!(enabled));
            if !write_flags(app, flags) {
                return json!({ "success": false, "error": "Failed to persist feature flag" });
            }

            // Renderer push (mirrors electron-log "Feature {id} enabled/disabled").
            crate::native_ops::emit_event(
                app,
                "features:changed",
                &json!({ "id": id, "enabled": enabled }),
            );

            json!({ "success": true })
        }
        // resetAllFeatures(): store.set('featureFlags', {}) -> { success: true }.
        "features:resetAll" => {
            if !write_flags(app, serde_json::Map::new()) {
                return json!({ "success": false, "error": "Failed to reset feature flags" });
            }
            crate::native_ops::emit_event(app, "features:reset", &json!({}));
            json!({ "success": true })
        }
        _ => Value::Null,
    }
}
