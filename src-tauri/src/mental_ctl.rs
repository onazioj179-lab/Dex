// =============================================================================
// DEX Tauri — Mental Model subsystem (port of the `mental:*` IPC handlers in
// src/main/core/MentalModelManager.ts).
//
// NAME NOTE: this file is `mental_ctl.rs` (not `mental.rs`) per the porting
// brief's collision rule; the target module name in the brief was `mental`.
//
// SOURCE-SHAPE NOTE: the porting brief named channels getState/update/predict
// over a `fs-json:mental-model.json` store. Those do NOT exist in the actual
// Electron code. The real subsystem exposes a `mental:*` namespace whose READ
// surface is backed entirely by an IN-MEMORY registry that is hard-coded at
// init (`registerCoreSystems` / `registerBehaviorRules`) and is NEVER persisted
// to or re-read from disk. The only file the manager touches is
// `<userData>/mental-model/state-changes.json`, which is WRITE-ONLY on shutdown
// and never loaded back at startup — so at runtime `stateChanges` always starts
// empty. We therefore reproduce the static registry in Rust (no storage read is
// possible or correct) and return the exact Electron shapes. No file is read or
// written by this module, matching the renderer-visible behavior of a fresh
// launch.
//
// Channels & shapes (match the Electron getters field-for-field):
//   - mental:getAllSystems     -> SystemState[]   (the 12 registered systems)
//   - mental:getSystem         -> SystemState | null
//   - mental:getSystemOverview -> { totalSystems, activeSystems, idleSystems,
//                                   errorSystems, disabledSystems, recentChanges }
//                                 (recentChanges = 0; `lastCheck` is optional and
//                                 absent on a fresh manager — Electron leaves the
//                                 key undefined, i.e. omitted over IPC)
//   - mental:getStateChanges   -> StateChange[]   (always [] — see SOURCE note)
//   - mental:getBehaviorRules  -> BehaviorRule[]  (the 8 documented rules)
//   - mental:explain           -> Explanation | null  (pure deterministic
//                                 keyword match over the question string)
//
// DIVERGENCES (documented):
//   - BehaviorRule.id / StateChange.id: Electron mints these with
//     crypto.randomUUID() at registration time, so they differ on every launch.
//     getBehaviorRules returns fresh per-call ids via crate::util::pseudo_uuid_v4()
//     (no rand crate). The renderer treats these ids as opaque keys, so a fresh
//     id per call is observationally equivalent to a fresh id per launch.
//   - getSystemOverview: `recentChanges` counts stateChanges in the last 24h.
//     Since stateChanges is never loaded from disk it is empty, so this is 0 —
//     identical to a fresh Electron launch. `lastCheck` is never set on a fresh
//     manager (only after runConsistencyCheck mutates live state), so the key is
//     omitted, exactly as Electron serializes an undefined optional field.
//
// SKIPPED (heavy / live-state, not ported and not faked):
//   - mental:updateSystem       — mutates the live in-memory registry and feeds
//     the EventEmitter; the mutation has no durable store and no renderer-visible
//     data result beyond `true`. Returns Value::Null (honest degrade).
//   - mental:runConsistencyCheck — evaluates over the live, mutated registry and
//     emits events; reproducing it over the static registry would always trivially
//     pass and mislead. Returns Value::Null.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};

// --- static registry: core systems -----------------------------------------
// Mirrors registerCoreSystems() exactly: same ids, names, descriptions,
// statuses, metrics, dependencies/dependents, canDisable/canReset.

fn core_systems() -> Vec<Value> {
    vec![
        json!({
            "id": "intent-sessions",
            "name": "Intent Sessions",
            "description": "Manages your work contexts and what you're trying to accomplish",
            "status": "active",
            "metrics": {
                "activeSessions": { "value": 0, "label": "Active Sessions" },
                "totalSessions": { "value": 0, "label": "Total Sessions" }
            },
            "dependencies": [],
            "dependents": ["search", "automation", "learning"],
            "canDisable": false,
            "canReset": true
        }),
        json!({
            "id": "file-system",
            "name": "Usage-Aware File System",
            "description": "Tracks how you use files to provide smart suggestions",
            "status": "active",
            "metrics": {
                "trackedFiles": { "value": 0, "label": "Tracked Files" },
                "relationships": { "value": 0, "label": "File Relationships" }
            },
            "dependencies": [],
            "dependents": ["search", "suggestions"],
            "canDisable": true,
            "canReset": true
        }),
        json!({
            "id": "search",
            "name": "Trustworthy Search",
            "description": "Finds files and content with explainable ranking",
            "status": "active",
            "metrics": {
                "indexedItems": { "value": 0, "label": "Indexed Items" },
                "searchHistory": { "value": 0, "label": "Search History" }
            },
            "dependencies": ["file-system", "intent-sessions"],
            "dependents": [],
            "canDisable": false,
            "canReset": true
        }),
        json!({
            "id": "undo",
            "name": "System Undo",
            "description": "Tracks operations so you can undo mistakes",
            "status": "active",
            "metrics": {
                "undoableOps": { "value": 0, "label": "Undoable Operations" },
                "checkpoints": { "value": 0, "label": "Checkpoints" }
            },
            "dependencies": [],
            "dependents": [],
            "canDisable": false,
            "canReset": true
        }),
        json!({
            "id": "automation",
            "name": "Human-Centered Automation",
            "description": "Runs automations with your approval and oversight",
            "status": "active",
            "metrics": {
                "activeRules": { "value": 0, "label": "Active Rules" },
                "totalRuns": { "value": 0, "label": "Total Runs" }
            },
            "dependencies": ["intent-sessions"],
            "dependents": [],
            "canDisable": true,
            "canReset": true
        }),
        json!({
            "id": "learning",
            "name": "Local Learning",
            "description": "Learns your patterns locally--never sent to cloud",
            "status": "active",
            "metrics": {
                "patterns": { "value": 0, "label": "Learned Patterns" },
                "enabled": { "value": true, "label": "Learning Enabled" }
            },
            "dependencies": ["intent-sessions"],
            "dependents": ["suggestions"],
            "canDisable": true,
            "canReset": true
        }),
        json!({
            "id": "session-continuity",
            "name": "Session Continuity",
            "description": "Saves and restores your complete workspace state",
            "status": "active",
            "metrics": {
                "snapshots": { "value": 0, "label": "Saved Snapshots" },
                "unsavedChanges": { "value": 0, "label": "Unsaved Changes Tracked" }
            },
            "dependencies": [],
            "dependents": [],
            "canDisable": true,
            "canReset": true
        }),
        json!({
            "id": "security",
            "name": "Security Continuum",
            "description": "Manages trust levels and access to sensitive data",
            "status": "active",
            "metrics": {
                "trustLevel": { "value": "public", "label": "Current Trust Level" },
                "activeLocks": { "value": 0, "label": "Active Locks" }
            },
            "dependencies": [],
            "dependents": ["vault"],
            "canDisable": false,
            "canReset": false
        }),
        json!({
            "id": "vault",
            "name": "Identity Vault",
            "description": "Securely stores passwords and credentials locally",
            "status": "idle",
            "statusReason": "Vault locked",
            "metrics": {
                "credentials": { "value": 0, "label": "Stored Credentials" },
                "isUnlocked": { "value": false, "label": "Vault Unlocked" }
            },
            "dependencies": ["security"],
            "dependents": [],
            "canDisable": false,
            "canReset": false
        }),
        json!({
            "id": "media",
            "name": "Media as Work",
            "description": "Captures and organizes screenshots and recordings",
            "status": "active",
            "metrics": {
                "artifacts": { "value": 0, "label": "Media Artifacts" },
                "recording": { "value": false, "label": "Currently Recording" }
            },
            "dependencies": ["intent-sessions"],
            "dependents": [],
            "canDisable": true,
            "canReset": true
        }),
        json!({
            "id": "health",
            "name": "Idle Discipline",
            "description": "Monitors performance and saves resources when idle",
            "status": "active",
            "metrics": {
                "idleMode": { "value": "active", "label": "Current Mode" },
                "memoryUsage": { "value": "0 MB", "label": "Memory Usage" }
            },
            "dependencies": [],
            "dependents": [],
            "canDisable": false,
            "canReset": false
        }),
    ]
}

// --- static registry: behavior rules ---------------------------------------
// Mirrors registerBehaviorRules() exactly. id is minted fresh per call (see
// DIVERGENCES) to match Electron's per-launch crypto.randomUUID().

fn behavior_rules() -> Vec<Value> {
    let defs: [(&str, &str, &str, &str, bool, bool); 8] = [
        (
            "Files are never moved automatically",
            "Dex will suggest file organization but never move files without your explicit action",
            "Always",
            "File suggestions are shown; user must confirm any moves",
            true,
            false,
        ),
        (
            "Automations require confirmation",
            "Automations show a preview before running and require your confirmation",
            "When automation is triggered",
            "Preview shown, user confirms or cancels",
            true,
            true,
        ),
        (
            "Search results are deterministic",
            "The same search query will always produce the same results in the same order",
            "When searching",
            "Results ordered by explainable score",
            true,
            false,
        ),
        (
            "Learning stays local",
            "All learned patterns stay on your device--nothing is sent to any server",
            "Always",
            "Data stored locally only",
            true,
            true,
        ),
        (
            "Auto-lock on intent switch",
            "Sensitive data is re-locked when you switch between intents",
            "When switching intents with security enabled",
            "Trust level lowered, sensitive locks reapplied",
            true,
            true,
        ),
        (
            "Clipboard auto-clear",
            "Copied passwords are automatically cleared from clipboard after 60 seconds",
            "When copying sensitive data",
            "Clipboard cleared after timeout",
            true,
            true,
        ),
        (
            "Idle mode activation",
            "After 5 minutes of inactivity, Dex reduces resource usage",
            "No user activity for 5 minutes",
            "Non-essential services paused, memory reclaimed",
            true,
            true,
        ),
        (
            "Session auto-save",
            "Your workspace state is saved every 5 minutes",
            "Every 5 minutes while active",
            "Session snapshot created",
            true,
            true,
        ),
    ];

    defs.iter()
        .map(|(name, description, condition, behavior, visible, controllable)| {
            json!({
                "id": pseudo_uuid_v4(),
                "name": name,
                "description": description,
                "condition": condition,
                "behavior": behavior,
                "userVisible": visible,
                "userControllable": controllable
            })
        })
        .collect()
}

// --- queries ----------------------------------------------------------------

fn get_system(system_id: &str) -> Value {
    core_systems()
        .into_iter()
        .find(|s| s.get("id").and_then(|v| v.as_str()) == Some(system_id))
        .unwrap_or(Value::Null)
}

// getSystemOverview(): counts by status over the static registry. recentChanges
// is 0 (stateChanges never loaded from disk). lastCheck omitted on fresh state.
fn get_system_overview() -> Value {
    let systems = core_systems();
    let count_status = |status: &str| {
        systems
            .iter()
            .filter(|s| s.get("status").and_then(|v| v.as_str()) == Some(status))
            .count()
    };
    json!({
        "totalSystems": systems.len(),
        "activeSystems": count_status("active"),
        "idleSystems": count_status("idle"),
        "errorSystems": count_status("error"),
        "disabledSystems": count_status("disabled"),
        "recentChanges": 0
    })
}

// generateExplanation(question): pure deterministic keyword matcher. Returns the
// matching Explanation object or null. Field order/contents match Electron.
fn generate_explanation(question: &str) -> Value {
    let q = question.to_lowercase();
    let has = |needle: &str| q.contains(needle);

    if has("why") && has("idle") {
        return json!({
            "question": question,
            "answer": "Dex enters idle mode after 5 minutes of no activity to save system resources. This reduces CPU and memory usage while you're away.",
            "context": "Idle mode helps keep your system fast and battery-efficient.",
            "relatedSystems": ["health"],
            "learnMore": "You can adjust idle timing in Settings > Performance."
        });
    }

    if has("why") && (has("locked") || has("lock")) {
        return json!({
            "question": question,
            "answer": "Sensitive data was locked because you switched to a different intent, which may have different security requirements.",
            "context": "Auto-locking protects your data when you change contexts.",
            "relatedSystems": ["security", "intent-sessions"],
            "learnMore": "You can disable auto-lock per intent in Intent Settings."
        });
    }

    if has("search") && has("order") {
        return json!({
            "question": question,
            "answer": "Search results are ranked by a deterministic score based on: exact match (100 points), title match (80), content match (50), recency (20), and frequency (15). You can see the breakdown for each result.",
            "context": "Deterministic search means the same query always gives the same results.",
            "relatedSystems": ["search"],
            "learnMore": "Click \"Explain\" on any search result to see its score breakdown."
        });
    }

    if has("learn") && (has("pattern") || has("data")) {
        return json!({
            "question": question,
            "answer": "Dex learns your patterns by observing file access, search queries, and work hours. ALL this data stays on your device. You can view, delete, or reset any learned patterns.",
            "context": "Local learning improves suggestions while protecting your privacy.",
            "relatedSystems": ["learning"],
            "learnMore": "View learned patterns in Settings > Learning > View Patterns."
        });
    }

    if has("automation") && has("safe") {
        return json!({
            "question": question,
            "answer": "Automations are safe because: (1) They show a preview before running, (2) You must confirm each run, (3) They use dry-run mode by default, (4) You can pause or stop at any time.",
            "context": "Human-centered automation means you're always in control.",
            "relatedSystems": ["automation"],
            "learnMore": "See all active automations in Automation > Manage Rules."
        });
    }

    Value::Null
}

/// Route a `mental:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; skipped
/// (live-state) channels and unknown ones return Value::Null (honest degrade).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "mental:getAllSystems" => json!(core_systems()),
        "mental:getSystem" => {
            let system_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_system(system_id)
        }
        "mental:getSystemOverview" => get_system_overview(),
        // stateChanges is never loaded from disk -> always empty at runtime.
        "mental:getStateChanges" => json!([]),
        "mental:getBehaviorRules" => json!(behavior_rules()),
        "mental:explain" => {
            let question = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            generate_explanation(question)
        }
        // Heavy / live-state — not ported, not faked.
        "mental:updateSystem" => Value::Null,
        "mental:runConsistencyCheck" => Value::Null,
        _ => Value::Null,
    }
}
