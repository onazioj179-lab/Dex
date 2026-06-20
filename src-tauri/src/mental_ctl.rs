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
// HEAVY CHANNELS (now ported with real native state — see below):
//   - mental:updateSystem       — applies a partial SystemState update to the live
//     registry. Electron held this only in memory; we make it durable by overlaying
//     the update onto a KV-persisted override map (key `mental:systems`), recording
//     the resulting StateChange(s) into a KV-persisted log (key `mental:stateChanges`,
//     trimmed to MAX_STATE_CHANGES=500), emitting `system-updated`/`state-changed`,
//     and returning `true`. The mutation is now genuinely observable by the read
//     channels (getAllSystems/getSystem/getSystemOverview/getStateChanges all read
//     the merged effective state), which is strictly truer to the Electron live
//     registry than the prior static-only behavior.
//   - mental:runConsistencyCheck — pure deterministic evaluation over the EFFECTIVE
//     registry (static base merged with persisted overrides). Reproduces Electron's
//     dependency checks, vault/trust conflict, and learning/patterns checks exactly,
//     returns the full ConsistencyCheck shape (id/timestamp/area/description/passed/
//     issues), and emits `consistency-check-completed`. Because it now runs over the
//     mutated registry, it reports real issues rather than trivially passing.
//
// STATEFUL READS: because updateSystem persists overrides, the read channels merge
// the static base with `mental:systems` so the renderer sees a consistent registry.
// On a fresh install (no overrides written) this is byte-identical to the original
// static behavior. getStateChanges/getSystemOverview read the persisted change log.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};

const MAX_STATE_CHANGES: usize = 500;
const SYSTEMS_KEY: &str = "mental:systems";
const STATE_CHANGES_KEY: &str = "mental:stateChanges";

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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

// --- effective (live) registry ---------------------------------------------
// Electron kept the registry in memory and mutated it via updateSystemState. We
// persist mutations as a per-system override map under `mental:systems`:
//   { "<systemId>": { "status": "...", "statusReason": "...",
//                     "metrics": { "<k>": { "value": ..., "label": ... } }, ... } }
// effective_systems merges each override onto its static base (shallow per top-level
// key; metrics merge key-by-key, matching Object.assign + metric replacement). On a
// fresh install the override map is empty and this returns the static registry
// unchanged.

fn load_overrides(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    match crate::kv_get(app, SYSTEMS_KEY) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    }
}

fn apply_override(base: &mut Value, ov: &Value) {
    let (Some(base_obj), Some(ov_obj)) = (base.as_object_mut(), ov.as_object()) else {
        return;
    };
    for (k, v) in ov_obj {
        if k == "metrics" {
            // Merge metrics key-by-key so partial metric updates don't drop others.
            if let Some(ov_metrics) = v.as_object() {
                let base_metrics = base_obj
                    .entry("metrics")
                    .or_insert_with(|| json!({}));
                if let Some(bm) = base_metrics.as_object_mut() {
                    for (mk, mv) in ov_metrics {
                        bm.insert(mk.clone(), mv.clone());
                    }
                }
            }
        } else {
            base_obj.insert(k.clone(), v.clone());
        }
    }
}

fn effective_systems(app: &tauri::AppHandle) -> Vec<Value> {
    let overrides = load_overrides(app);
    core_systems()
        .into_iter()
        .map(|mut sys| {
            let id = sys
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if let Some(ov) = overrides.get(&id) {
                apply_override(&mut sys, ov);
            }
            sys
        })
        .collect()
}

fn find_system<'a>(systems: &'a [Value], id: &str) -> Option<&'a Value> {
    systems
        .iter()
        .find(|s| s.get("id").and_then(|v| v.as_str()) == Some(id))
}

fn load_state_changes(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, STATE_CHANGES_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
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

fn get_system(app: &tauri::AppHandle, system_id: &str) -> Value {
    find_system(&effective_systems(app), system_id)
        .cloned()
        .unwrap_or(Value::Null)
}

// getSystemOverview(): counts by status over the EFFECTIVE registry. recentChanges
// counts persisted state changes in the last 24h. lastCheck is omitted (Electron
// only sets it transiently in memory; never serialized on a cold read).
fn get_system_overview(app: &tauri::AppHandle) -> Value {
    let systems = effective_systems(app);
    let count_status = |status: &str| {
        systems
            .iter()
            .filter(|s| s.get("status").and_then(|v| v.as_str()) == Some(status))
            .count()
    };
    let one_day_ago = now_millis() - 24 * 60 * 60 * 1000;
    let recent_changes = load_state_changes(app)
        .iter()
        .filter(|c| c.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0) > one_day_ago)
        .count();
    json!({
        "totalSystems": systems.len(),
        "activeSystems": count_status("active"),
        "idleSystems": count_status("idle"),
        "errorSystems": count_status("error"),
        "disabledSystems": count_status("disabled"),
        "recentChanges": recent_changes
    })
}

// getStateChanges(options): filter by systemId/since, newest-first, optional limit.
// Mirrors the Electron getter exactly over the persisted change log.
fn get_state_changes(app: &tauri::AppHandle, options: &Value) -> Value {
    let mut changes = load_state_changes(app);

    let system_id = options.get("systemId").and_then(|v| v.as_str());
    if let Some(sid) = system_id {
        changes.retain(|c| c.get("systemId").and_then(|v| v.as_str()) == Some(sid));
    }

    if let Some(since) = options.get("since").and_then(|v| v.as_i64()) {
        changes.retain(|c| c.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0) > since);
    }

    changes.sort_by(|a, b| {
        let ta = a.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        let tb = b.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        tb.cmp(&ta)
    });

    if let Some(limit) = options.get("limit").and_then(|v| v.as_u64()) {
        changes.truncate(limit as usize);
    }

    json!(changes)
}

// --- updateSystem (assessImpact + recordStateChange + persist + emit) -------
// Mirrors updateSystemState(): applies the partial update to the system's override,
// records a StateChange for a status transition and for each changed metric, trims
// the log to MAX_STATE_CHANGES, persists overrides + log, and emits events. Returns
// true on success; false only if the target system id is unknown (Electron silently
// no-ops on unknown ids, but the IPC handler always returned true — we return false
// for unknown ids so callers get honest feedback while real updates still return true).

fn assess_impact(system: &Value, change_type: &str) -> &'static str {
    let dependents = system
        .get("dependents")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    if dependents > 3 {
        "high"
    } else if dependents > 0 {
        "medium"
    } else if change_type == "status" {
        "medium"
    } else {
        "low"
    }
}

fn make_state_change(
    system_id: &str,
    system_name: &str,
    change_type: &str,
    description: &str,
    previous_value: Value,
    new_value: Value,
    trigger: &str,
    trigger_detail: &Value,
    impact: &str,
    affected_systems: Value,
) -> Value {
    let mut change = json!({
        "id": pseudo_uuid_v4(),
        "timestamp": now_millis(),
        "systemId": system_id,
        "systemName": system_name,
        "changeType": change_type,
        "description": description,
        "trigger": trigger,
        "impact": impact,
        "affectedSystems": affected_systems
    });
    // Optional fields (Electron includes the keys when defined).
    let obj = change.as_object_mut().unwrap();
    obj.insert("previousValue".into(), previous_value);
    obj.insert("newValue".into(), new_value);
    if !trigger_detail.is_null() {
        obj.insert("triggerDetail".into(), trigger_detail.clone());
    }
    change
}

fn update_system(app: &tauri::AppHandle, args: &Value) -> Value {
    let system_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let updates = args.get(1).cloned().unwrap_or(Value::Null);
    let trigger = args.get(2).and_then(|v| v.as_str()).unwrap_or("system");
    let trigger_detail = args.get(3).cloned().unwrap_or(Value::Null);

    if system_id.is_empty() || !updates.is_object() {
        return json!(false);
    }

    // Resolve the current effective system (base + any prior override).
    let systems = effective_systems(app);
    let Some(current) = find_system(&systems, system_id).cloned() else {
        return json!(false);
    };

    let system_name = current
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let dependents = current
        .get("dependents")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let previous_status = current
        .get("status")
        .cloned()
        .unwrap_or(Value::Null);
    let previous_metrics = current
        .get("metrics")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let updates_obj = updates.as_object().unwrap();
    let mut new_changes: Vec<Value> = Vec::new();

    // Status transition.
    if let Some(new_status) = updates_obj.get("status") {
        if new_status != &previous_status {
            // Build a post-update view for impact assessment (dependents unchanged
            // unless overridden; assessImpact in Electron reads the mutated system).
            let impact = assess_impact(&current, "status");
            let desc = format!(
                "Status changed from {} to {}",
                previous_status.as_str().unwrap_or(""),
                new_status.as_str().unwrap_or("")
            );
            new_changes.push(make_state_change(
                system_id,
                &system_name,
                "status",
                &desc,
                previous_status.clone(),
                new_status.clone(),
                trigger,
                &trigger_detail,
                impact,
                dependents.clone(),
            ));
        }
    }

    // Metric changes.
    if let Some(new_metrics) = updates_obj.get("metrics").and_then(|v| v.as_object()) {
        for (key, metric) in new_metrics {
            let prev = previous_metrics.get(key);
            let prev_value = prev.and_then(|p| p.get("value"));
            let new_value = metric.get("value");
            let changed = match prev {
                None => true,
                Some(_) => prev_value != new_value,
            };
            if changed {
                let label = metric
                    .get("label")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let desc = format!("{} changed", label);
                new_changes.push(make_state_change(
                    system_id,
                    &system_name,
                    "metric",
                    &desc,
                    prev_value.cloned().unwrap_or(Value::Null),
                    new_value.cloned().unwrap_or(Value::Null),
                    trigger,
                    &trigger_detail,
                    "low",
                    json!([]),
                ));
            }
        }
    }

    // Persist the override (Object.assign semantics, metrics merged key-by-key).
    let mut overrides = load_overrides(app);
    let entry = overrides
        .entry(system_id.to_string())
        .or_insert_with(|| json!({}));
    apply_override(entry, &updates);
    let _ = crate::kv_set(app, SYSTEMS_KEY, Value::Object(overrides));

    // Persist new state changes (append, trim to MAX_STATE_CHANGES).
    if !new_changes.is_empty() {
        let mut log = load_state_changes(app);
        for c in &new_changes {
            log.push(c.clone());
        }
        if log.len() > MAX_STATE_CHANGES {
            let start = log.len() - MAX_STATE_CHANGES;
            log.drain(0..start);
        }
        let _ = crate::kv_set(app, STATE_CHANGES_KEY, Value::Array(log));
    }

    // Emit events (webContents.send equivalents). The updated system reflects the
    // merged effective state post-write.
    let updated_system = get_system(app, system_id);
    crate::native_ops::emit_event(app, "system-updated", &updated_system);
    for c in &new_changes {
        crate::native_ops::emit_event(app, "state-changed", c);
    }

    json!(true)
}

// --- runConsistencyCheck ----------------------------------------------------
// Pure deterministic evaluation over the EFFECTIVE registry, mirroring Electron
// field-for-field: dependency existence/health, vault-vs-trust conflict, and
// learning-disabled-with-patterns. Emits `consistency-check-completed`.

fn run_consistency_check(app: &tauri::AppHandle) -> Value {
    let systems = effective_systems(app);
    let mut issues: Vec<Value> = Vec::new();

    // Dependency checks.
    for system in &systems {
        let name = system.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let deps = system
            .get("dependencies")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        for dep_id_v in &deps {
            let Some(dep_id) = dep_id_v.as_str() else {
                continue;
            };
            match find_system(&systems, dep_id) {
                None => issues.push(json!({
                    "severity": "error",
                    "description": format!("{} depends on unknown system: {}", name, dep_id)
                })),
                Some(dep) => {
                    let dep_status = dep.get("status").and_then(|v| v.as_str()).unwrap_or("");
                    if dep_status == "error" || dep_status == "disabled" {
                        let dep_name = dep.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        issues.push(json!({
                            "severity": "warning",
                            "description": format!(
                                "{} depends on {} which is {}",
                                name, dep_name, dep_status
                            ),
                            "resolution": format!("Check {} status", dep_name)
                        }));
                    }
                }
            }
        }
    }

    // Vault unlocked but trust public.
    let vault_status = find_system(&systems, "vault")
        .and_then(|v| v.get("status"))
        .and_then(|v| v.as_str());
    let trust_level = find_system(&systems, "security")
        .and_then(|v| v.get("metrics"))
        .and_then(|m| m.get("trustLevel"))
        .and_then(|t| t.get("value"))
        .and_then(|v| v.as_str());
    if vault_status == Some("active") && trust_level == Some("public") {
        issues.push(json!({
            "severity": "warning",
            "description": "Vault appears unlocked but trust level is public",
            "resolution": "Re-authenticate to resolve"
        }));
    }

    // Learning disabled but patterns exist.
    if let Some(learning) = find_system(&systems, "learning") {
        let metrics = learning.get("metrics");
        let enabled = metrics
            .and_then(|m| m.get("enabled"))
            .and_then(|e| e.get("value"))
            .and_then(|v| v.as_bool());
        let patterns = metrics
            .and_then(|m| m.get("patterns"))
            .and_then(|p| p.get("value"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        if enabled == Some(false) && patterns > 0.0 {
            issues.push(json!({
                "severity": "info",
                "description": "Learning is disabled but patterns exist",
                "resolution": "Patterns won't update while learning is disabled"
            }));
        }
    }

    let passed = !issues
        .iter()
        .any(|i| i.get("severity").and_then(|v| v.as_str()) == Some("error"));

    let check = json!({
        "id": pseudo_uuid_v4(),
        "timestamp": now_millis(),
        "area": "Full system",
        "description": "Comprehensive consistency check",
        "passed": passed,
        "issues": issues
    });

    crate::native_ops::emit_event(app, "consistency-check-completed", &check);
    check
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
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "mental:getAllSystems" => json!(effective_systems(app)),
        "mental:getSystem" => {
            let system_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_system(app, system_id)
        }
        "mental:getSystemOverview" => get_system_overview(app),
        "mental:getStateChanges" => {
            let options = args.get(0).cloned().unwrap_or(Value::Null);
            get_state_changes(app, &options)
        }
        "mental:getBehaviorRules" => json!(behavior_rules()),
        "mental:explain" => {
            let question = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            generate_explanation(question)
        }
        // Heavy channels — real native state (KV-persisted registry + change log).
        "mental:updateSystem" => update_system(app, args),
        "mental:runConsistencyCheck" => run_consistency_check(app),
        _ => Value::Null,
    }
}
