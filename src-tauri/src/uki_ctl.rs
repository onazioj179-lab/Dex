// =============================================================================
// DEX Tauri — UKI controller (port of the `uki:*` IPC handlers in
// src/main/controllers/UkiController.ts, plus the heavy engine/memory/copilot/
// blueprint/recall/operator surfaces those handlers delegate to).
//
// SCOPE / TASK NOTE -----------------------------------------------------------
// The original data-only port covered uki:getStatus/getConfig/updateConfig/
// resetConfig. This round extends the module to implement the previously-skipped
// HEAVY channels with REAL native Rust where feasible:
//   - uki:getState            -> live engine state (persisted listening flag)
//   - uki:query               -> native NLU intent parse + deterministic reply
//   - uki:startListening / stopListening / toggle -> state machine + renderer events
//   - uki:memoryRecord / memorySearch / memoryRecent / memoryStats /
//     memoryCleanup / memoryClear -> native plaintext memory archive
//   - uki:copilot:*           -> config/conversation/suggestions/thinking +
//                                deterministic contextual message generator
//   - uki:blueprint:generate / tweak -> full native port of UkiBlueprintGenerator
//   - uki:recall              -> native-memory-tier fusion recall
//   - uki:operator:dispatch / audit -> confidence-gate + whitelist + audit log
//
// WHAT STAYS DEGRADED (cannot be done natively without an LLM / live runtime):
//   - There is no LLM provider here. The Electron UkiCopilot.processMessage and
//     UkiEngine response generator are themselves DETERMINISTIC template
//     responders (no model call), so porting them is honest, not faking an LLM.
//     The genuinely model-shaped behavior (streamed AI completions) was never in
//     this controller, so nothing is faked.
//
// STORAGE ---------------------------------------------------------------------
// Config: same as before (uki-config.json / "ukiConfig", plaintext, documented
// "encrypted electron-store -> plaintext app_data JSON" divergence).
// Memory archive: the Electron native `.node` wrote an AES-256-GCM + zstd
// `uki-memory.enc`. A dependency-free reader cannot decrypt it (no crypto crate
// allowed). We therefore keep a REAL native archive in plaintext JSON
// (uki-memory.json) under app_data_dir, mirroring the MemoryRecord shape and the
// search / recency / cleanup algorithms from native/src/kernel/uki.rs, and
// returning the EXACT JSON shapes the renderer (UkiRewindMemory adapter,
// memoryStats reader) consumes. Same accepted divergence as config.
// Copilot config, conversation, operator audit, and listening state live in the
// shared KV store via crate::kv_get / crate::kv_set so they survive restarts.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

const CONFIG_FILE: &str = "uki-config.json";
const CONFIG_KEY: &str = "ukiConfig";
const MEMORY_FILE: &str = "uki-memory.json";

// KV keys for restart-surviving state that isn't a config/memory file.
const KV_LISTENING: &str = "uki:listening";
const KV_COPILOT_CONFIG: &str = "uki:copilot:config";
const KV_COPILOT_CONVO: &str = "uki:copilot:conversation";
const KV_COPILOT_CONTEXT: &str = "uki:copilot:context";
const KV_OPERATOR_AUDIT: &str = "uki:operator:audit";

const MAX_MEMORY_RECORDS: usize = 50_000;
const DEFAULT_RETENTION_DAYS: u64 = 30;

// --- time / file IO ----------------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        // Parse only if plaintext JSON; encrypted electron-store bytes fail
        // here and we fall back to defaults (documented divergence).
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_file(app: &tauri::AppHandle, name: &str, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app, name), s).is_ok(),
        Err(_) => false,
    }
}

// =============================================================================
// CONFIG (unchanged behavior from the original data-only port)
// =============================================================================

fn default_config() -> Value {
    json!({
        "enabled": true,
        "asrProvider": "webspeech",
        "ttsRate": 1.0,
        "ttsPitch": 1.0,
        "ttsVolume": 0.8,
        "ttsVoice": "",
        "shortcut": "CommandOrControl+Space",
        "wakeWordEnabled": false,
        "wakePhrase": "Hey UKI",
        "personality": "casual",
        "silenceTimeoutMs": 3000,
        "maxListenMs": 30000,
        "confirmDestructive": true,
        "showTranscript": true,
        "contextCacheSizeGB": 3,
        "contextRetentionDays": 30,
        "recallMode": "hybrid",
        "autoCleanupEnabled": true,
        "cleanupIntervalHours": 24,
        "memoryEnabled": true,
    })
}

fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    let stored = read_file(app, CONFIG_FILE);
    if let Some(inner) = stored.get(CONFIG_KEY).and_then(|v| v.as_object()) {
        if let Some(base) = cfg.as_object_mut() {
            for (k, v) in inner {
                if base.contains_key(k) {
                    base.insert(k.clone(), v.clone());
                }
            }
        }
    }
    cfg
}

fn write_config(app: &tauri::AppHandle, cfg: &Value) {
    write_file(app, CONFIG_FILE, &json!({ CONFIG_KEY: cfg }));
}

fn clamp(n: f64, lo: f64, hi: f64) -> f64 {
    n.max(lo).min(hi)
}

fn update_config(app: &tauri::AppHandle, partial: &Value) -> Value {
    let mut cfg = get_config(app);
    let p = match partial.as_object() {
        Some(o) => o,
        None => return cfg,
    };
    let base = match cfg.as_object_mut() {
        Some(o) => o,
        None => return get_config(app),
    };

    let bool_field = |base: &mut Map<String, Value>, k: &str, p: &Map<String, Value>| {
        if let Some(b) = p.get(k).and_then(|v| v.as_bool()) {
            base.insert(k.into(), json!(b));
        }
    };
    let str_field =
        |base: &mut Map<String, Value>, k: &str, p: &Map<String, Value>, max: usize| {
            if let Some(s) = p.get(k).and_then(|v| v.as_str()) {
                let truncated: String = s.chars().take(max).collect();
                base.insert(k.into(), json!(truncated));
            }
        };
    let enum_field =
        |base: &mut Map<String, Value>, k: &str, p: &Map<String, Value>, allowed: &[&str]| {
            if let Some(s) = p.get(k).and_then(|v| v.as_str()) {
                if allowed.contains(&s) {
                    base.insert(k.into(), json!(s));
                }
            }
        };
    let num_field =
        |base: &mut Map<String, Value>, k: &str, p: &Map<String, Value>, lo: f64, hi: f64| {
            if let Some(n) = p.get(k).and_then(|v| v.as_f64()) {
                base.insert(k.into(), json!(clamp(n, lo, hi)));
            }
        };

    bool_field(base, "enabled", p);
    enum_field(base, "asrProvider", p, &["webspeech", "whisper-local", "whisper-api"]);
    num_field(base, "ttsRate", p, 0.5, 2.0);
    num_field(base, "ttsPitch", p, 0.5, 2.0);
    num_field(base, "ttsVolume", p, 0.0, 1.0);
    str_field(base, "ttsVoice", p, 200);
    str_field(base, "shortcut", p, 100);
    bool_field(base, "wakeWordEnabled", p);
    str_field(base, "wakePhrase", p, 50);
    enum_field(base, "personality", p, &["formal", "casual"]);
    num_field(base, "silenceTimeoutMs", p, 1000.0, 30000.0);
    num_field(base, "maxListenMs", p, 5000.0, 120000.0);
    bool_field(base, "confirmDestructive", p);
    bool_field(base, "showTranscript", p);
    num_field(base, "contextCacheSizeGB", p, 1.0, 32.0);
    num_field(base, "contextRetentionDays", p, 1.0, 365.0);
    enum_field(base, "recallMode", p, &["auto", "explicit", "hybrid"]);
    bool_field(base, "autoCleanupEnabled", p);
    num_field(base, "cleanupIntervalHours", p, 1.0, 168.0);
    bool_field(base, "memoryEnabled", p);

    // Re-register-shortcut side effect (Electron unregistered/re-registered the
    // global shortcut and stopped listening when disabled). The global-shortcut
    // wiring lives in main.rs setup, not here; the user-visible state effect we
    // can honor is: disabling UKI stops the listening state.
    if p.get("enabled").and_then(|v| v.as_bool()) == Some(false) {
        set_listening(app, false);
        crate::native_ops::emit_event(app, "uki:listeningStopped", &json!({}));
    }

    write_config(app, &cfg);
    cfg
}

fn reset_config(app: &tauri::AppHandle) -> Value {
    let cfg = default_config();
    write_config(app, &cfg);
    cfg
}

// =============================================================================
// ENGINE STATE / LISTENING (real state machine + renderer events)
// =============================================================================
// Electron's UkiEngine kept `_state` ('listening' | 'idle' | ...) and emitted
// 'uki:stateChanged' / 'uki:listeningStarted' / 'uki:listeningStopped' over
// webContents. We persist the listening flag in KV so getState/toggle are
// consistent across calls, and emit the same events via emit_event.

fn is_listening(app: &tauri::AppHandle) -> bool {
    crate::kv_get(app, KV_LISTENING).as_bool().unwrap_or(false)
}

fn set_listening(app: &tauri::AppHandle, on: bool) {
    let _ = crate::kv_set(app, KV_LISTENING, json!(on));
}

fn current_state(app: &tauri::AppHandle) -> &'static str {
    if is_listening(app) {
        "listening"
    } else {
        "idle"
    }
}

fn session_turns(app: &tauri::AppHandle) -> i64 {
    // Honest count of persisted conversation memory records (the engine's
    // sessionTurns is per-session and resets; we expose the durable count which
    // is what the renderer's "what do you remember" surfaces read).
    load_memory(app)
        .get("records")
        .and_then(|v| v.as_array())
        .map(|a| a.len() as i64)
        .unwrap_or(0)
}

/// uki:getStatus — UkiEngine.getStatus() shape, reflecting live listening state.
fn get_status(app: &tauri::AppHandle) -> Value {
    json!({
        "state": current_state(app),
        "initialized": true,
        "sessionTurns": session_turns(app),
        "degraded": false,
        "consecutiveFailures": 0,
    })
}

fn start_listening(app: &tauri::AppHandle) -> Value {
    let prev = current_state(app);
    set_listening(app, true);
    crate::native_ops::emit_event(app, "uki:stateChanged", &json!({ "state": "listening", "prev": prev }));
    crate::native_ops::emit_event(app, "uki:listeningStarted", &json!({}));
    // ukiEngine.startListening() returns void/undefined.
    Value::Null
}

fn stop_listening(app: &tauri::AppHandle) -> bool {
    if current_state(app) == "listening" {
        set_listening(app, false);
        crate::native_ops::emit_event(app, "uki:stateChanged", &json!({ "state": "idle", "prev": "listening" }));
        crate::native_ops::emit_event(app, "uki:listeningStopped", &json!({}));
    }
    // The handler returns `true`.
    true
}

fn toggle_listening(app: &tauri::AppHandle) -> Value {
    if current_state(app) == "listening" {
        stop_listening(app);
    } else {
        start_listening(app);
    }
    // Returns ukiEngine.state.
    json!(current_state(app))
}

// =============================================================================
// NATIVE NLU (faithful subset port of native/src/kernel/uki.rs parse_intent)
// =============================================================================

fn tokenize(input: &str) -> Vec<String> {
    let lower = input.to_lowercase();
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in lower.chars() {
        if ch.is_alphanumeric() || ch == '\'' || ch == '-' {
            current.push(ch);
        } else if !current.is_empty() {
            tokens.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

struct Pat {
    kw: &'static [&'static str],
    cat: &'static str,
    act: &'static str,
    conf: f64,
}

// Subset of the kernel pattern table covering the conversational / control
// intents the deterministic responder below can actually answer.
fn patterns() -> &'static [Pat] {
    &[
        Pat { kw: &["go", "home"], cat: "navigation", act: "go-home", conf: 0.95 },
        Pat { kw: &["go", "back"], cat: "navigation", act: "go-back", conf: 0.90 },
        Pat { kw: &["navigate"], cat: "navigation", act: "navigate", conf: 0.85 },
        Pat { kw: &["open"], cat: "navigation", act: "navigate", conf: 0.80 },
        Pat { kw: &["launch"], cat: "app_launch", act: "launch", conf: 0.90 },
        Pat { kw: &["start"], cat: "app_launch", act: "launch", conf: 0.80 },
        Pat { kw: &["close"], cat: "app_close", act: "close", conf: 0.85 },
        Pat { kw: &["quit"], cat: "app_close", act: "close", conf: 0.85 },
        Pat { kw: &["play", "music"], cat: "media", act: "play", conf: 0.90 },
        Pat { kw: &["play"], cat: "media", act: "play", conf: 0.70 },
        Pat { kw: &["pause"], cat: "media", act: "pause", conf: 0.90 },
        Pat { kw: &["next", "track"], cat: "media", act: "next", conf: 0.90 },
        Pat { kw: &["volume", "up"], cat: "media", act: "volume-up", conf: 0.90 },
        Pat { kw: &["volume", "down"], cat: "media", act: "volume-down", conf: 0.90 },
        Pat { kw: &["mute"], cat: "media", act: "toggle-mute", conf: 0.90 },
        Pat { kw: &["search", "for"], cat: "search", act: "search", conf: 0.85 },
        Pat { kw: &["find"], cat: "search", act: "search", conf: 0.75 },
        Pat { kw: &["screenshot"], cat: "system", act: "screenshot", conf: 0.95 },
        Pat { kw: &["battery"], cat: "system", act: "battery", conf: 0.85 },
        Pat { kw: &["lock", "screen"], cat: "system", act: "lock", conf: 0.90 },
        Pat { kw: &["dark", "mode"], cat: "settings", act: "toggle-dark", conf: 0.90 },
        Pat { kw: &["hello"], cat: "conversation", act: "greeting", conf: 0.90 },
        Pat { kw: &["hey"], cat: "conversation", act: "greeting", conf: 0.85 },
        Pat { kw: &["hi"], cat: "conversation", act: "greeting", conf: 0.85 },
        Pat { kw: &["good", "morning"], cat: "conversation", act: "greeting", conf: 0.90 },
        Pat { kw: &["thanks"], cat: "conversation", act: "thanks", conf: 0.90 },
        Pat { kw: &["thank", "you"], cat: "conversation", act: "thanks", conf: 0.90 },
        Pat { kw: &["bye"], cat: "conversation", act: "farewell", conf: 0.90 },
        Pat { kw: &["goodbye"], cat: "conversation", act: "farewell", conf: 0.90 },
        Pat { kw: &["who", "are", "you"], cat: "conversation", act: "identity", conf: 0.95 },
        Pat { kw: &["what", "are", "you"], cat: "conversation", act: "identity", conf: 0.90 },
        Pat { kw: &["tell", "joke"], cat: "conversation", act: "joke", conf: 0.90 },
        Pat { kw: &["joke"], cat: "conversation", act: "joke", conf: 0.80 },
        Pat { kw: &["what", "time"], cat: "conversation", act: "time", conf: 0.90 },
        Pat { kw: &["what", "date"], cat: "conversation", act: "date", conf: 0.90 },
        Pat { kw: &["help"], cat: "conversation", act: "help", conf: 0.90 },
        Pat { kw: &["what", "remember"], cat: "memory", act: "recall", conf: 0.92 },
        Pat { kw: &["search", "memory"], cat: "memory", act: "search", conf: 0.92 },
        Pat { kw: &["clear", "memory"], cat: "memory", act: "clear", conf: 0.90 },
        Pat { kw: &["memory", "stats"], cat: "memory", act: "stats", conf: 0.90 },
    ]
}

/// Parse intent, mirroring the kernel scoring (all keywords must match by token
/// or substring; longer keyword lists earn a small specificity bonus).
fn parse_intent(raw: &str) -> (String, String, f64) {
    let tokens = tokenize(raw);
    let lower = raw.to_lowercase();
    let mut best = ("conversation", "unknown", 0.0f64);
    for p in patterns() {
        let mut matched = 0usize;
        for kw in p.kw {
            if tokens.iter().any(|t| t == kw) || lower.contains(kw) {
                matched += 1;
            }
        }
        if matched == p.kw.len() {
            let bonus = (p.kw.len() as f64 - 1.0) * 0.05;
            let score = p.conf + bonus;
            if score > best.2 {
                best = (p.cat, p.act, score);
            }
        }
    }
    (best.0.to_string(), best.1.to_string(), best.2.min(1.0))
}

/// Deterministic conversational reply for an intent. Mirrors the spirit of the
/// Electron dialog/router responses for the answerable conversational actions;
/// control actions return an acknowledgement (the renderer performs the actual
/// app action via its own channels). No LLM is involved (Electron had none here).
fn reply_for(app: &tauri::AppHandle, category: &str, action: &str, raw: &str) -> (bool, String) {
    match (category, action) {
        ("conversation", "greeting") => (true, "Hello! How can I help you?".into()),
        ("conversation", "thanks") => (true, "You're welcome!".into()),
        ("conversation", "farewell") => (true, "Goodbye!".into()),
        ("conversation", "identity") => (
            true,
            "I'm UKI, your DEX assistant. I can help you navigate, control media, manage files, and more.".into(),
        ),
        ("conversation", "joke") => (
            true,
            "Why do programmers prefer dark mode? Because light attracts bugs.".into(),
        ),
        ("conversation", "time") => {
            let secs = now_ms() / 1000;
            (true, format!("It is currently {} seconds past the epoch.", secs))
        }
        ("conversation", "date") => (true, "Check the calendar app for today's date.".into()),
        ("conversation", "help") => (
            true,
            "You can ask me to open apps, play music, search files, take a screenshot, or recall what you've done.".into(),
        ),
        ("memory", "recall") | ("memory", "search") => {
            let recent = memory_recent(app, 3);
            let summaries: Vec<String> = recent
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|r| r.get("summary").and_then(|s| s.as_str()).map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            if summaries.is_empty() {
                (true, "I don't have any relevant memories yet.".into())
            } else {
                (true, format!("Here's what I recall: {}", summaries.join("; ")))
            }
        }
        ("memory", "stats") => {
            let stats = memory_stats(app);
            let count = stats.get("totalRecords").and_then(|v| v.as_i64()).unwrap_or(0);
            (true, format!("I'm holding {} memories.", count))
        }
        ("memory", "clear") => {
            memory_clear(app);
            (true, "Memory cleared.".into())
        }
        ("navigation", _) | ("app_launch", _) | ("app_close", _) | ("media", _)
        | ("search", _) | ("system", _) | ("settings", _) => (
            true,
            format!("Okay — {} {}.", action.replace('-', " "), raw.trim()),
        ),
        _ => (false, "I'm not sure how to help with that yet.".into()),
    }
}

/// uki:query — typed query. Electron: parse intent -> run pipeline -> return
/// `{ success, response }`. We parse natively, generate the deterministic reply,
/// record the turn to the durable memory archive (as UkiEngine does), and emit
/// the same `uki:turn` renderer event.
fn query(app: &tauri::AppHandle, text: &str) -> Value {
    let sanitized: String = text.trim().chars().take(2000).collect();
    if sanitized.is_empty() {
        return json!({ "success": false, "response": "Empty query." });
    }
    let (category, action, _conf) = parse_intent(&sanitized);
    let (success, response) = reply_for(app, &category, &action, &sanitized);

    // Persist the conversation turn (mirrors UkiEngine's nativeUki.ukiMemoryRecord).
    let summary = format!(
        "User: {} -> {}",
        sanitized.chars().take(200).collect::<String>(),
        response.chars().take(300).collect::<String>()
    );
    record_memory(app, "conversation", &summary, None, None, Some(category.as_str()), Some(action.as_str()), success);

    // Renderer history event (Electron's webContents.send('uki:turn', ...)).
    crate::native_ops::emit_event(
        app,
        "uki:turn",
        &json!({
            "id": format!("turn-{}", now_ms()),
            "userText": sanitized,
            "response": response,
            "intent": format!("{}:{}", category, action),
            "success": success,
            "timestamp": now_ms(),
        }),
    );

    json!({ "success": success, "response": response })
}

// =============================================================================
// MEMORY ARCHIVE (native plaintext port of kernel/uki.rs MemoryArchive)
// =============================================================================
// File shape: { "records": [MemoryRecord...], "total_records_ever": <int> }
// MemoryRecord: { id, record_type, timestamp, summary, app_id, page_id,
//                 category, action, success, weight }
// memorySearch/memoryRecent return the raw record array (the renderer's
// makeNativeMemoryAdapter reads summary/id/timestamp/action/type off each).

fn load_memory(app: &tauri::AppHandle) -> Value {
    let v = read_file(app, MEMORY_FILE);
    if v.get("records").and_then(|r| r.as_array()).is_some() {
        v
    } else {
        json!({ "records": [], "total_records_ever": 0 })
    }
}

fn save_memory(app: &tauri::AppHandle, archive: &Value) -> bool {
    write_file(app, MEMORY_FILE, archive)
}

fn record_memory(
    app: &tauri::AppHandle,
    record_type: &str,
    summary: &str,
    app_id: Option<&str>,
    page_id: Option<&str>,
    category: Option<&str>,
    action: Option<&str>,
    success: bool,
) -> bool {
    let safe_summary: String = summary.chars().take(2000).collect();
    if safe_summary.is_empty() {
        return false;
    }
    let safe_type = match record_type {
        "conversation" | "command" | "activity" | "summary" => record_type,
        _ => "conversation",
    };
    let trunc = |s: Option<&str>| s.map(|x| x.chars().take(100).collect::<String>());

    let mut archive = load_memory(app);
    let total_ever = archive.get("total_records_ever").and_then(|v| v.as_i64()).unwrap_or(0);
    let now = now_ms();
    let record = json!({
        "id": format!("mem-{}-{}", now, total_ever),
        "record_type": safe_type,
        "timestamp": now,
        "summary": safe_summary,
        "app_id": trunc(app_id),
        "page_id": trunc(page_id),
        "category": trunc(category),
        "action": trunc(action),
        "success": success,
        "weight": 1,
    });

    if let Some(obj) = archive.as_object_mut() {
        let records = obj.entry("records").or_insert_with(|| json!([]));
        if let Some(arr) = records.as_array_mut() {
            arr.push(record);
            if arr.len() > MAX_MEMORY_RECORDS {
                cleanup_records(arr, DEFAULT_RETENTION_DAYS);
            }
        }
        obj.insert("total_records_ever".into(), json!(total_ever + 1));
    }
    save_memory(app, &archive)
}

/// Retention + size enforcement; returns count removed (mirrors memory_cleanup).
fn cleanup_records(records: &mut Vec<Value>, retention_days: u64) -> usize {
    let cutoff = now_ms().saturating_sub((retention_days * 24 * 60 * 60 * 1000) as i64);
    let before = records.len();
    records.retain(|r| r.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0) > cutoff);
    if records.len() > MAX_MEMORY_RECORDS {
        records.sort_by(|a, b| {
            let ta = a.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
            let tb = b.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
            tb.cmp(&ta)
        });
        records.truncate(MAX_MEMORY_RECORDS);
    }
    before - records.len()
}

/// Score-and-rank search, ported from kernel/uki.rs memory_search.
fn memory_search(app: &tauri::AppHandle, query: &str, limit: usize) -> Value {
    let lower_q = query.to_lowercase();
    if lower_q.is_empty() || lower_q.len() > 500 {
        return json!([]);
    }
    let q_tokens = tokenize(&lower_q);
    let archive = load_memory(app);
    let records = match archive.get("records").and_then(|v| v.as_array()) {
        Some(r) => r,
        None => return json!([]),
    };
    let now = now_ms();

    let mut scored: Vec<(&Value, f64)> = records
        .iter()
        .filter_map(|r| {
            let summary = r.get("summary").and_then(|v| v.as_str()).unwrap_or("");
            let summary_lower = summary.to_lowercase();
            let mut score = 0.0f64;
            if summary_lower.contains(&lower_q) {
                score += 5.0;
            }
            let summary_tokens = tokenize(&summary_lower);
            for qt in &q_tokens {
                if summary_tokens.iter().any(|st| st == qt) {
                    score += 1.0;
                }
            }
            if let Some(aid) = r.get("app_id").and_then(|v| v.as_str()) {
                if aid.to_lowercase().contains(&lower_q) {
                    score += 3.0;
                }
            }
            if let Some(cat) = r.get("category").and_then(|v| v.as_str()) {
                if cat.to_lowercase().contains(&lower_q) {
                    score += 2.0;
                }
            }
            let ts = r.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
            let age_days = (now.saturating_sub(ts)) as f64 / 86_400_000.0;
            let recency = 1.0 / (1.0 + age_days * 0.1);
            score *= recency;
            if score > 0.0 {
                Some((r, score))
            } else {
                None
            }
        })
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    Value::Array(scored.into_iter().map(|(r, _)| r.clone()).collect())
}

fn memory_recent(app: &tauri::AppHandle, limit: usize) -> Value {
    let archive = load_memory(app);
    let mut records: Vec<Value> = archive
        .get("records")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    records.sort_by(|a, b| {
        let ta = a.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        let tb = b.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        tb.cmp(&ta)
    });
    records.truncate(limit);
    Value::Array(records)
}

/// uki:memoryStats — mirrors kernel uki_memory_stats fields AND the Electron
/// degrade fallback shape ({ available, totalRecords, totalEver }) so the
/// renderer reads the same keys whether native or not.
fn memory_stats(app: &tauri::AppHandle) -> Value {
    let archive = load_memory(app);
    let records = archive.get("records").and_then(|v| v.as_array());
    let count = records.map(|r| r.len()).unwrap_or(0) as i64;
    let total_ever = archive.get("total_records_ever").and_then(|v| v.as_i64()).unwrap_or(count);
    let (oldest, newest) = match records {
        Some(r) => {
            let ts: Vec<i64> = r
                .iter()
                .filter_map(|x| x.get("timestamp").and_then(|v| v.as_i64()))
                .collect();
            (ts.iter().min().copied().unwrap_or(0), ts.iter().max().copied().unwrap_or(0))
        }
        None => (0, 0),
    };
    let disk_bytes = std::fs::metadata(store_path(app, MEMORY_FILE))
        .map(|m| m.len() as i64)
        .unwrap_or(0);
    json!({
        "available": true,
        "totalRecords": count,
        "totalEver": total_ever,
        "record_count": count,
        "total_records": count,
        "total_records_ever": total_ever,
        "oldest_timestamp": oldest,
        "newest_timestamp": newest,
        "disk_bytes": disk_bytes,
        "storage_bytes": disk_bytes,
        "disk_mb": (disk_bytes as f64) / (1024.0 * 1024.0),
        "max_records": MAX_MEMORY_RECORDS,
        "retention_days": DEFAULT_RETENTION_DAYS,
    })
}

/// uki:memoryCleanup — enforce retention, persist, return records removed (i64).
fn memory_cleanup(app: &tauri::AppHandle) -> i64 {
    let mut archive = load_memory(app);
    let removed = if let Some(arr) = archive.get_mut("records").and_then(|v| v.as_array_mut()) {
        cleanup_records(arr, DEFAULT_RETENTION_DAYS) as i64
    } else {
        0
    };
    if removed > 0 {
        save_memory(app, &archive);
    }
    removed
}

fn memory_clear(app: &tauri::AppHandle) -> bool {
    let mut archive = load_memory(app);
    if let Some(obj) = archive.as_object_mut() {
        obj.insert("records".into(), json!([]));
    }
    save_memory(app, &archive)
}

// =============================================================================
// COPILOT (deterministic — Electron's UkiCopilot has no LLM either)
// =============================================================================

fn default_copilot_config() -> Value {
    json!({
        "maxContextTokens": 32000,
        "responseStyle": "adaptive",
        "proactiveHelp": true,
        "codeAssist": true,
        "creativeAssist": true,
        "workflowAutomation": true,
        "learningEnabled": true,
    })
}

fn copilot_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_copilot_config();
    let stored = crate::kv_get(app, KV_COPILOT_CONFIG);
    if let (Some(base), Some(inner)) = (cfg.as_object_mut(), stored.as_object()) {
        for (k, v) in inner {
            if base.contains_key(k) {
                base.insert(k.clone(), v.clone());
            }
        }
    }
    cfg
}

fn copilot_update_config(app: &tauri::AppHandle, partial: &Value) -> Value {
    let mut cfg = copilot_config(app);
    if let (Some(base), Some(inner)) = (cfg.as_object_mut(), partial.as_object()) {
        // { ...config, ...partial } — only adopt known keys to keep the shape.
        for (k, v) in inner {
            if base.contains_key(k) {
                base.insert(k.clone(), v.clone());
            }
        }
    }
    let _ = crate::kv_set(app, KV_COPILOT_CONFIG, cfg.clone());
    cfg
}

fn copilot_get_conversation(app: &tauri::AppHandle) -> Value {
    let v = crate::kv_get(app, KV_COPILOT_CONVO);
    if v.is_array() {
        v
    } else {
        json!([])
    }
}

fn copilot_clear_conversation(app: &tauri::AppHandle) {
    let _ = crate::kv_set(app, KV_COPILOT_CONVO, json!([]));
}

fn copilot_id() -> String {
    format!("{}-{}", now_ms(), &crate::util::pseudo_uuid_v4()[..7])
}

/// analyzeIntent — port of UkiCopilot.analyzeIntent.
fn copilot_intent(content: &str) -> &'static str {
    let lower = content.to_lowercase();
    if lower.contains('?')
        || lower.starts_with("what")
        || lower.starts_with("how")
        || lower.starts_with("why")
        || lower.starts_with("explain")
    {
        "question"
    } else if lower.starts_with("fix") || lower.contains("bug") || lower.contains("error") {
        "fix"
    } else if lower.starts_with("create") || lower.starts_with("make") || lower.starts_with("generate") {
        "create"
    } else if lower.starts_with("refactor") || lower.contains("improve") || lower.contains("optimize") {
        "improve"
    } else if lower.contains("help") || lower.contains("assist") {
        "help"
    } else {
        "general"
    }
}

fn copilot_action(action_type: &str, label: &str, description: &str, confidence: f64, requires_approval: bool) -> Value {
    json!({
        "id": copilot_id(),
        "type": action_type,
        "label": label,
        "description": description,
        "params": {},
        "confidence": confidence,
        "requiresApproval": requires_approval,
    })
}

/// generateContextualResponse — port of UkiCopilot.generateContextualResponse.
fn copilot_contextual(app_name: &str, intent: &str) -> (String, Vec<Value>) {
    match intent {
        "question" => (
            format!(
                "I can help explain that. Based on the current {} context, let me analyze what you are working with and provide clarity.",
                app_name
            ),
            vec![],
        ),
        "fix" => (
            "I will analyze the issue and suggest a fix. Let me examine the relevant code or content.".into(),
            vec![copilot_action("fix-issue", "Apply Fix", "Apply the suggested fix", 0.85, true)],
        ),
        "create" => (
            "I will help you create that. Here is what I suggest:".into(),
            vec![copilot_action("generate", "Generate", "Generate the requested content", 0.9, true)],
        ),
        "improve" => (
            "I will analyze and suggest improvements. Here are my recommendations:".into(),
            vec![copilot_action("refactor", "Apply Improvements", "Apply the suggested improvements", 0.85, true)],
        ),
        "help" => (
            "I can help with coding, creative work, automation, and more. What do you need?".into(),
            vec![],
        ),
        _ => ("I understand. Let me help you with that.".into(), vec![]),
    }
}

fn copilot_context(app: &tauri::AppHandle) -> Value {
    crate::kv_get(app, KV_COPILOT_CONTEXT)
}

fn copilot_set_context(app: &tauri::AppHandle, context: &Value) {
    let _ = crate::kv_set(app, KV_COPILOT_CONTEXT, context.clone());
}

/// uki:copilot:sendMessage — deterministic responder (no LLM in Electron either).
/// Appends user + copilot messages to the persisted conversation and returns the
/// copilot CopilotMessage.
fn copilot_send_message(app: &tauri::AppHandle, content: &str) -> Value {
    let sanitized: String = content.trim().chars().take(10000).collect();
    if sanitized.is_empty() {
        return Value::Null;
    }
    let mut convo = copilot_get_conversation(app);
    let arr = convo.as_array_mut();
    let arr = match arr {
        Some(a) => a,
        None => return Value::Null,
    };

    arr.push(json!({
        "id": copilot_id(),
        "role": "user",
        "content": sanitized,
        "timestamp": now_ms(),
    }));

    let app_name = copilot_context(app)
        .get("appName")
        .and_then(|v| v.as_str())
        .unwrap_or("DEX")
        .to_string();
    let intent = copilot_intent(&sanitized);
    let (response, actions) = copilot_contextual(&app_name, intent);

    let reply = json!({
        "id": copilot_id(),
        "role": "copilot",
        "content": response,
        "timestamp": now_ms(),
        "actions": actions,
        "codeBlocks": [],
        "confidence": 0.9,
    });
    arr.push(reply.clone());

    let _ = crate::kv_set(app, KV_COPILOT_CONVO, convo);
    reply
}

/// getProactiveSuggestions — port keyed off persisted context appId.
fn copilot_suggestions(app: &tauri::AppHandle) -> Value {
    let ctx = copilot_context(app);
    let app_id = ctx.get("appId").and_then(|v| v.as_str()).unwrap_or("");
    let mut out: Vec<Value> = Vec::new();
    match app_id {
        "forge" => {
            let has_files = ctx
                .get("openFiles")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);
            if has_files {
                out.push(copilot_action("explain", "Explain Code", "Get an explanation of the current code", 0.7, false));
            }
        }
        "prism" => out.push(json!({
            "id": copilot_id(), "type": "apply-effect", "label": "Auto Enhance",
            "description": "Automatically improve image quality",
            "params": { "effect": "auto-enhance" }, "confidence": 0.8, "requiresApproval": false
        })),
        "vinx" => out.push(json!({
            "id": copilot_id(), "type": "generate", "label": "Generate Subtitles",
            "description": "Create subtitles from speech",
            "params": { "type": "subtitles" }, "confidence": 0.75, "requiresApproval": false
        })),
        "imosion" => out.push(json!({
            "id": copilot_id(), "type": "apply-effect", "label": "Clean Audio",
            "description": "Remove noise and enhance clarity",
            "params": { "effect": "clean" }, "confidence": 0.8, "requiresApproval": false
        })),
        _ => {}
    }
    Value::Array(out)
}

/// executeAction — port of UkiCopilot.executeAction. Without a live conversation
/// action lookup we honor the contract: unknown id -> { success:false }.
fn copilot_execute_action(app: &tauri::AppHandle, action_id: &str) -> Value {
    // Search persisted conversation for the action; mirror Electron's findAction.
    let convo = copilot_get_conversation(app);
    let found = convo.as_array().and_then(|msgs| {
        msgs.iter().find_map(|m| {
            m.get("actions").and_then(|v| v.as_array()).and_then(|acts| {
                acts.iter().find(|a| a.get("id").and_then(|v| v.as_str()) == Some(action_id)).cloned()
            })
        })
    });
    match found {
        None => json!({ "success": false, "message": "Action not found" }),
        Some(a) => {
            if a.get("requiresApproval").and_then(|v| v.as_bool()).unwrap_or(false) {
                json!({ "success": false, "message": "Approval required" })
            } else {
                // No live per-app handler bridge here; report honest not-implemented.
                json!({ "success": false, "message": "Action not implemented" })
            }
        }
    }
}

// =============================================================================
// BLUEPRINT GENERATOR (full native port of UkiBlueprintGenerator.ts)
// =============================================================================

fn bp_detect_kind(prompt: &str) -> &'static str {
    let p = prompt.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| p.contains(w));
    if has(&["web", "landing", "site", "page", "html", "css", "react", "vue"]) {
        "web-app"
    } else if has(&["cad", "axl", "part", "bracket", "mount", "stl", "step", "gear", "enclosure"]) {
        "cad-part"
    } else if has(&["song", "track", "chord progression", "music", "melody", "imosion", "midi"]) {
        "music-track"
    } else if has(&["video", "storyboard", "edit", "cut", "scene", "vinx"]) {
        "video-storyboard"
    } else if has(&["image", "photo", "illustration", "prism", "series", "gallery"]) {
        "image-series"
    } else if has(&["design system", "tokens", "theme", "palette"]) {
        "design-system"
    } else {
        "code-project"
    }
}

fn bp_slug(s: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in s.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "untitled".into()
    } else {
        trimmed
    }
}

fn bp_default_title(kind: &str) -> &'static str {
    match kind {
        "web-app" => "New Web App",
        "cad-part" => "New CAD Part",
        "music-track" => "New Track",
        "video-storyboard" => "New Storyboard",
        "image-series" => "New Image Series",
        "design-system" => "New Design System",
        _ => "New Project",
    }
}

fn bp_title_str(prompt: &str, kind: &str) -> String {
    // Strip leading verbs + optional "me" + leading article (mirror derivedTitle).
    // Operate on whitespace-split words to stay byte-slice-safe for non-ASCII.
    let words: Vec<&str> = prompt.trim().split_whitespace().collect();
    let mut idx = 0usize;
    const VERBS: &[&str] = &["make", "create", "build", "generate", "scaffold", "design"];
    const ARTICLES: &[&str] = &["a", "an", "the"];
    if idx < words.len() && VERBS.contains(&words[idx].to_lowercase().as_str()) {
        idx += 1;
        if idx < words.len() && words[idx].eq_ignore_ascii_case("me") {
            idx += 1;
        }
        if idx < words.len() && ARTICLES.contains(&words[idx].to_lowercase().as_str()) {
            idx += 1;
        }
    }
    let cleaned: Vec<&str> = words[idx..].to_vec();
    if cleaned.is_empty() {
        return bp_default_title(kind).to_string();
    }
    cleaned
        .join(" ")
        .split_whitespace()
        .take(8)
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn bp_file(path: &str, contents: String) -> Value {
    json!({ "path": path, "contents": contents })
}

fn bp_param(key: &str, label: &str, value: Value, tweakable: bool) -> Value {
    json!({ "key": key, "label": label, "value": value, "tweakable": tweakable })
}

fn bp_build(kind: &str, prompt: &str, title: &str) -> (Vec<Value>, Vec<Value>, String) {
    match kind {
        "web-app" => {
            let theme = "#0a84ff";
            let index = format!(
                "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>{t}</title>\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <meta name=\"theme-color\" content=\"{c}\" />\n    <link rel=\"stylesheet\" href=\"main.css\" />\n  </head>\n  <body>\n    <main>\n      <h1>{t}</h1>\n      <p>Generated by UKI.</p>\n    </main>\n    <script src=\"main.js\"></script>\n  </body>\n</html>\n",
                t = title, c = theme
            );
            let css = format!(
                ":root {{ --accent: {c}; }}\nbody {{ margin: 0; font-family: system-ui, sans-serif; }}\nmain {{ padding: 2rem; max-width: 720px; margin: 0 auto; color: #111; }}\nh1 {{ color: var(--accent); }}\n",
                c = theme
            );
            (
                vec![
                    bp_file("index.html", index),
                    bp_file("main.css", css),
                    bp_file("main.js", format!("log.info(\"{} ready\");\n", title)),
                ],
                vec![
                    bp_param("title", "Title", json!(title), true),
                    bp_param("themeColor", "Theme color", json!(theme), true),
                ],
                format!("Single-page web application titled \"{}\".", title),
            )
        }
        "cad-part" => {
            let axl = serde_json::to_string_pretty(&json!({
                "name": title, "prompt": prompt,
                "dimensions": { "lengthMm": 100, "widthMm": 50, "heightMm": 10 },
                "material": "PLA", "features": []
            })).unwrap_or_default();
            let readme = format!(
                "# {t}\n\nGenerated AXL part. Edit `{s}.axl.json` to adjust dimensions.\n",
                t = title, s = bp_slug(title)
            );
            (
                vec![bp_file(&format!("{}.axl.json", bp_slug(title)), axl), bp_file("README.md", readme)],
                vec![
                    bp_param("name", "Part name", json!(title), true),
                    bp_param("lengthMm", "Length (mm)", json!(100), true),
                    bp_param("widthMm", "Width (mm)", json!(50), true),
                    bp_param("heightMm", "Height (mm)", json!(10), true),
                    bp_param("material", "Material", json!("PLA"), true),
                ],
                format!("Parametric CAD part stub for \"{}\".", title),
            )
        }
        "music-track" => {
            let song = serde_json::to_string_pretty(&json!({
                "title": title, "prompt": prompt, "tempoBpm": 120, "key": "C major",
                "timeSignature": "4/4",
                "structure": ["intro","verse","chorus","verse","chorus","bridge","chorus","outro"],
                "progression": ["C","Am","F","G"],
                "tracks": [
                    { "name": "Lead Vocal", "kind": "audio" },
                    { "name": "Piano", "kind": "midi" },
                    { "name": "Drums", "kind": "midi" },
                    { "name": "Bass", "kind": "midi" }
                ]
            })).unwrap_or_default();
            (
                vec![bp_file("song.imosion.json", song)],
                vec![
                    bp_param("tempoBpm", "Tempo (BPM)", json!(120), true),
                    bp_param("key", "Key", json!("C major"), true),
                    bp_param("timeSignature", "Time signature", json!("4/4"), true),
                    bp_param("progression", "Chord progression", json!("C Am F G"), true),
                ],
                format!("Imosion song scaffold for \"{}\".", title),
            )
        }
        "video-storyboard" => {
            let sb = serde_json::to_string_pretty(&json!({
                "title": title, "aspect": "16:9",
                "scenes": [
                    { "id": "scene-1", "name": "Opening", "durationSec": 5, "notes": "Title card" },
                    { "id": "scene-2", "name": "Main", "durationSec": 45, "notes": "Body of the piece" },
                    { "id": "scene-3", "name": "Closing", "durationSec": 10, "notes": "Outro / credits" }
                ]
            })).unwrap_or_default();
            (
                vec![bp_file("storyboard.vinx.json", sb)],
                vec![
                    bp_param("durationSec", "Total duration (s)", json!(60), true),
                    bp_param("aspect", "Aspect ratio", json!("16:9"), true),
                ],
                format!("VINX storyboard scaffold for \"{}\".", title),
            )
        }
        "image-series" => {
            let series = serde_json::to_string_pretty(&json!({
                "title": title, "style": "cinematic",
                "images": [
                    { "id": "img-1", "preset": "cinematic-warm" },
                    { "id": "img-2", "preset": "cinematic-cool" },
                    { "id": "img-3", "preset": "cinematic-mono" },
                    { "id": "img-4", "preset": "cinematic-warm" }
                ]
            })).unwrap_or_default();
            (
                vec![bp_file("series.prism.json", series)],
                vec![
                    bp_param("count", "Number of images", json!(4), true),
                    bp_param("style", "Style", json!("cinematic"), true),
                ],
                format!("Prism image series presets for \"{}\".", title),
            )
        }
        "design-system" => {
            let tokens = serde_json::to_string_pretty(&json!({
                "name": title,
                "color": { "accent": "#0a84ff", "bg": "#0d0f12", "fg": "#e6e8eb" },
                "radius": { "sm": 4, "md": 8, "lg": 16 },
                "spacing": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32 },
                "font": { "sans": "system-ui, sans-serif", "mono": "ui-monospace, monospace" }
            })).unwrap_or_default();
            (
                vec![
                    bp_file("tokens.json", tokens),
                    bp_file("tokens.css", ":root {\n  --accent: #0a84ff;\n  --radius-md: 8px;\n}\n".into()),
                ],
                vec![
                    bp_param("accent", "Accent color", json!("#0a84ff"), true),
                    bp_param("radius", "Base radius (px)", json!(8), true),
                ],
                format!("Design token starter for \"{}\".", title),
            )
        }
        _ => {
            let slugged = bp_slug(title);
            let pkg = serde_json::to_string_pretty(&json!({
                "name": slugged, "version": "0.1.0", "description": title,
                "main": "src/index.ts",
                "scripts": { "build": "tsc", "test": "vitest" },
                "devDependencies": { "typescript": "^5", "vitest": "^1" }
            })).unwrap_or_default();
            let tsconfig = serde_json::to_string_pretty(&json!({
                "compilerOptions": {
                    "target": "ES2022", "module": "ES2022", "moduleResolution": "bundler",
                    "strict": true, "outDir": "dist"
                },
                "include": ["src"]
            })).unwrap_or_default();
            (
                vec![
                    bp_file("package.json", pkg),
                    bp_file("tsconfig.json", tsconfig),
                    bp_file("src/index.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n".into()),
                    bp_file("README.md", format!("# {}\n\nGenerated by UKI.\n", title)),
                ],
                vec![
                    bp_param("name", "Package name", json!(slugged), true),
                    bp_param("version", "Version", json!("0.1.0"), true),
                ],
                format!("TypeScript project scaffold \"{}\".", title),
            )
        }
    }
}

/// uki:blueprint:generate — generateBlueprint. Caches by id in KV so a follow-up
/// tweak can look it up. Returns { ok, blueprint } or { ok:false, error }.
fn blueprint_generate(app: &tauri::AppHandle, prompt: &str, kind_override: Option<&str>) -> Value {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return json!({ "ok": false, "error": "invalid-prompt" });
    }
    let trimmed: String = trimmed.chars().take(4000).collect();
    let now = now_ms();
    let id = format!("bp-{}-{}", now, &crate::util::pseudo_uuid_v4()[..6]);
    let valid_kinds = [
        "web-app", "cad-part", "music-track", "video-storyboard",
        "image-series", "code-project", "design-system",
    ];
    let kind = match kind_override {
        Some(k) if valid_kinds.contains(&k) => k,
        _ => bp_detect_kind(&trimmed),
    };
    let title = bp_title_str(&trimmed, kind);
    let (files, parameters, description) = bp_build(kind, &trimmed, &title);

    let blueprint = json!({
        "id": id,
        "kind": kind,
        "title": title,
        "description": description,
        "files": files,
        "parameters": parameters,
        "createdAt": now,
        "prompt": trimmed,
    });

    // Bounded LRU cache (32) — mirror the Map in the controller.
    cache_blueprint(app, &id, &blueprint);
    json!({ "ok": true, "blueprint": blueprint })
}

fn blueprint_cache_get(app: &tauri::AppHandle) -> Value {
    let v = crate::kv_get(app, "uki:blueprint:cache");
    if v.is_object() {
        v
    } else {
        json!({})
    }
}

fn cache_blueprint(app: &tauri::AppHandle, id: &str, bp: &Value) {
    let mut cache = blueprint_cache_get(app);
    if let Some(obj) = cache.as_object_mut() {
        obj.insert(id.to_string(), bp.clone());
        // Trim to 32 newest by createdAt.
        if obj.len() > 32 {
            let mut entries: Vec<(String, i64)> = obj
                .iter()
                .map(|(k, v)| (k.clone(), v.get("createdAt").and_then(|c| c.as_i64()).unwrap_or(0)))
                .collect();
            entries.sort_by(|a, b| a.1.cmp(&b.1)); // oldest first
            let excess = obj.len() - 32;
            for (k, _) in entries.into_iter().take(excess) {
                obj.remove(&k);
            }
        }
    }
    let _ = crate::kv_set(app, "uki:blueprint:cache", cache);
}

/// applyParameterToFiles — conservative top-level JSON key substitution.
fn bp_apply_param(files: &Value, key: &str, value: &Value) -> Value {
    let arr = match files.as_array() {
        Some(a) => a,
        None => return files.clone(),
    };
    let out: Vec<Value> = arr
        .iter()
        .map(|f| {
            let path = f.get("path").and_then(|v| v.as_str()).unwrap_or("");
            if !path.ends_with(".json") {
                return f.clone();
            }
            let contents = f.get("contents").and_then(|v| v.as_str()).unwrap_or("");
            let mut parsed: Value = match serde_json::from_str(contents) {
                Ok(p) => p,
                Err(_) => return f.clone(),
            };
            let obj = match parsed.as_object_mut() {
                Some(o) => o,
                None => return f.clone(),
            };
            if !obj.contains_key(key) {
                return f.clone();
            }
            obj.insert(key.to_string(), value.clone());
            let mut nf = f.clone();
            if let Some(nfo) = nf.as_object_mut() {
                nfo.insert("contents".into(), json!(serde_json::to_string_pretty(&parsed).unwrap_or_default()));
            }
            nf
        })
        .collect();
    Value::Array(out)
}

/// uki:blueprint:tweak — tweakBlueprint with type/tweakability validation.
fn blueprint_tweak(app: &tauri::AppHandle, blueprint_id: &str, change: &Value) -> Value {
    let cache = blueprint_cache_get(app);
    let bp = match cache.get(blueprint_id) {
        Some(b) => b.clone(),
        None => return json!({ "ok": false, "error": "not-found" }),
    };
    let key = match change.get("key").and_then(|v| v.as_str()) {
        Some(k) => k,
        None => return json!({ "ok": false, "error": "invalid-change" }),
    };
    let new_value = match change.get("value") {
        Some(v) => v,
        None => return json!({ "ok": false, "error": "invalid-change" }),
    };

    let params = bp.get("parameters").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let param = params.iter().find(|p| p.get("key").and_then(|v| v.as_str()) == Some(key));
    let param = match param {
        Some(p) => p,
        None => return json!({ "ok": false, "error": format!("Unknown parameter \"{}\"", key) }),
    };
    if param.get("tweakable").and_then(|v| v.as_bool()) != Some(true) {
        return json!({ "ok": false, "error": format!("Parameter \"{}\" is not tweakable", key) });
    }
    // typeof param.value !== typeof change.value -> mismatch.
    let kind_of = |v: &Value| -> &'static str {
        match v {
            Value::Bool(_) => "boolean",
            Value::Number(_) => "number",
            Value::String(_) => "string",
            _ => "other",
        }
    };
    if kind_of(param.get("value").unwrap_or(&Value::Null)) != kind_of(new_value) {
        return json!({ "ok": false, "error": format!("Type mismatch for \"{}\"", key) });
    }

    let next_params: Vec<Value> = params
        .iter()
        .map(|p| {
            if p.get("key").and_then(|v| v.as_str()) == Some(key) {
                let mut np = p.clone();
                if let Some(o) = np.as_object_mut() {
                    o.insert("value".into(), new_value.clone());
                }
                np
            } else {
                p.clone()
            }
        })
        .collect();

    let next_files = bp_apply_param(bp.get("files").unwrap_or(&json!([])), key, new_value);

    let mut next = bp.clone();
    if let Some(o) = next.as_object_mut() {
        o.insert("parameters".into(), Value::Array(next_params));
        o.insert("files".into(), next_files);
    }
    // tweakBlueprint keeps the same id (spreads ...blueprint), so re-cache same id.
    cache_blueprint(app, blueprint_id, &next);
    json!({ "ok": true, "blueprint": next })
}

// =============================================================================
// RECALL (native-memory-tier fusion; mirrors UkiRewindMemory blend over the one
// tier reachable here)
// =============================================================================

fn clamp01(n: f64) -> f64 {
    if !n.is_finite() {
        0.0
    } else {
        n.max(0.0).min(1.0)
    }
}

/// uki:recall — recallContext over the native memory archive (the only tier
/// wired into this process). Knowledge-graph + Rewind tiers are not reachable
/// from this module, so they contribute nothing here (honest partial recall, the
/// same behavior the Electron bridge has when only the native provider is set).
fn recall(app: &tauri::AppHandle, query_text: &str, options: &Value) -> Value {
    let trimmed = query_text.trim();
    if trimmed.is_empty() {
        return json!({ "ok": false, "error": "invalid-query" });
    }
    let trimmed: String = trimmed.chars().take(1000).collect();
    let limit = options.get("limit").and_then(|v| v.as_u64()).unwrap_or(12) as usize;
    let per_source = options.get("perSourceLimit").and_then(|v| v.as_u64()).unwrap_or(8) as usize;
    let half_life = options
        .get("recencyHalfLifeMs")
        .and_then(|v| v.as_f64())
        .unwrap_or(7.0 * 24.0 * 60.0 * 60.0 * 1000.0);
    let now = now_ms() as f64;

    // native provider: makeNativeMemoryAdapter shape (rawScore default 0.6).
    let hits = memory_search(app, &trimmed, per_source);
    let mut sources: Vec<Value> = hits
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|rec| {
                    let summary = rec.get("summary").and_then(|v| v.as_str()).unwrap_or("");
                    if summary.is_empty() {
                        return None;
                    }
                    let id = rec
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(String::from)
                        .unwrap_or_else(|| format!("n-{}", rec.get("timestamp").and_then(|t| t.as_i64()).unwrap_or(0)));
                    let ts = rec.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0) as f64;
                    let label = rec
                        .get("action")
                        .and_then(|v| v.as_str())
                        .or_else(|| rec.get("record_type").and_then(|v| v.as_str()))
                        .unwrap_or("memory")
                        .to_string();
                    let raw = 0.6f64;
                    // blendScore: 0.6*sim + 0.4*recency (or 0.6*sim if no ts).
                    let sim = clamp01(raw);
                    let score = if ts <= 0.0 {
                        (0.6 * sim).min(1.0)
                    } else {
                        let age = (now - ts).max(0.0);
                        let recency = 0.5f64.powf(age / half_life);
                        clamp01(0.6 * sim + 0.4 * recency)
                    };
                    Some(json!({
                        "source": "native",
                        "id": id,
                        "label": label,
                        "summary": summary,
                        "timestamp": ts as i64,
                        "rawScore": raw,
                        "score": score,
                        "metadata": rec,
                    }))
                })
                .collect()
        })
        .unwrap_or_default();

    sources.sort_by(|a, b| {
        let sa = a.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let sb = b.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });
    sources.truncate(limit);

    // synthesize (top 3 summaries).
    let synthesis = if sources.is_empty() {
        format!("No relevant memory for \"{}\".", trimmed)
    } else {
        let top: Vec<String> = sources
            .iter()
            .take(3)
            .map(|r| {
                let src = r.get("source").and_then(|v| v.as_str()).unwrap_or("");
                let label = r.get("label").and_then(|v| v.as_str()).unwrap_or("");
                let summary = r.get("summary").and_then(|v| v.as_str()).unwrap_or("");
                let s: String = summary.chars().take(140).collect();
                format!("- [{}] {}: {}", src, label, s)
            })
            .collect();
        format!("Recall for \"{}\":\n{}", trimmed, top.join("\n"))
    };

    json!({
        "ok": true,
        "query": trimmed,
        "results": sources,
        "synthesis": synthesis,
    })
}

// =============================================================================
// CREATIVE OPERATOR (confidence gate + whitelist + KV audit log)
// =============================================================================

fn operator_channel(app_id: &str, action_type: &str) -> Option<&'static str> {
    match (app_id, action_type) {
        ("imosion", "apply-effect") => Some("imosion:applyEffect"),
        ("imosion", "generate") => Some("imosion:generateMidi"),
        ("imosion", "transform") => Some("imosion:transformAudio"),
        ("vinx", "apply-effect") => Some("vinx:applyEdit"),
        ("vinx", "transform") => Some("vinx:transformClip"),
        ("vinx", "generate") => Some("vinx:generateScene"),
        ("prism", "apply-effect") => Some("prism:applyPreset"),
        ("prism", "transform") => Some("prism:transformImage"),
        ("prism", "generate") => Some("prism:generateImage"),
        ("flux", "transform") => Some("flux:transform"),
        ("flux", "apply-effect") => Some("flux:applyEffect"),
        ("forge", "generate") => Some("forge:generate"),
        ("forge", "transform") => Some("forge:transform"),
        ("axl", "generate") => Some("axl:generatePart"),
        ("axl", "transform") => Some("axl:transformPart"),
        _ => None,
    }
}

fn operator_record_audit(app: &tauri::AppHandle, action: &Value, result: &Value) {
    let mut log = crate::kv_get(app, KV_OPERATOR_AUDIT);
    if !log.is_array() {
        log = json!([]);
    }
    if let Some(arr) = log.as_array_mut() {
        let mut entry = result.clone();
        if let Some(o) = entry.as_object_mut() {
            o.insert("action".into(), action.clone());
            o.insert("timestamp".into(), json!(now_ms()));
        }
        arr.push(entry);
        if arr.len() > 100 {
            let excess = arr.len() - 100;
            arr.drain(0..excess);
        }
    }
    let _ = crate::kv_set(app, KV_OPERATOR_AUDIT, log);
}

/// uki:operator:dispatch — validate + whitelist + audit. The Electron handler
/// passed a no-op invoker (returns undefined) and is a pure router: it returns
/// the chosen channel for the renderer to self-invoke. We faithfully replicate
/// that: a whitelisted, confident action records ok=true with the channel; the
/// renderer performs the actual per-app IPC. No fake side effect.
fn operator_dispatch(app: &tauri::AppHandle, action: &Value) -> Value {
    let action_id = format!("act-{}-{}", now_ms(), &crate::util::pseudo_uuid_v4()[..4]);
    let reject = |reason: String| -> Value {
        json!({ "ok": false, "actionId": action_id.clone(), "reason": reason })
    };

    if !action.is_object() {
        let r = reject("invalid-action".into());
        operator_record_audit(app, action, &r);
        return r;
    }
    let app_id = action.get("appId").and_then(|v| v.as_str()).unwrap_or("");
    let valid_app = matches!(app_id, "imosion" | "vinx" | "prism" | "flux" | "forge" | "axl");
    if !valid_app {
        let r = reject(format!("unsupported-app:{}", app_id));
        operator_record_audit(app, action, &r);
        return r;
    }
    let action_type = action.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let valid_type = matches!(
        action_type,
        "apply-effect" | "transform" | "generate" | "edit-code" | "create-file"
            | "refactor" | "navigate" | "run-command"
    );
    if !valid_type {
        let r = reject(format!("unsupported-type:{}", action_type));
        operator_record_audit(app, action, &r);
        return r;
    }
    let confidence = action.get("confidence").and_then(|v| v.as_f64());
    match confidence {
        Some(c) if c >= 0.65 => {}
        _ => {
            let r = reject(format!("low-confidence:{}", confidence.map(|c| c.to_string()).unwrap_or_default()));
            operator_record_audit(app, action, &r);
            return r;
        }
    }
    let payload_ok = action
        .get("payload")
        .map(|p| p.is_object())
        .unwrap_or(false);
    if !payload_ok {
        let r = reject("invalid-payload".into());
        operator_record_audit(app, action, &r);
        return r;
    }
    let channel = match operator_channel(app_id, action_type) {
        Some(c) => c,
        None => {
            let r = reject("not-whitelisted".into());
            operator_record_audit(app, action, &r);
            return r;
        }
    };

    let result = json!({ "ok": true, "actionId": action_id, "channel": channel });
    operator_record_audit(app, action, &result);
    result
}

/// uki:operator:audit — recent audit entries, newest first.
fn operator_audit(app: &tauri::AppHandle, limit: usize) -> Value {
    let log = crate::kv_get(app, KV_OPERATOR_AUDIT);
    let arr = match log.as_array() {
        Some(a) => a,
        None => return json!([]),
    };
    let n = if (1..200).contains(&limit) { limit } else { 20 };
    // getAudit returns slice(-limit).reverse() => newest-first, which `rev` gives.
    let out: Vec<Value> = arr.iter().rev().take(n).cloned().collect();
    Value::Array(out)
}

// =============================================================================
// DISPATCH
// =============================================================================

/// Route a `uki:*` channel. Args are the positional JSON array the renderer sent.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).map(String::from);
    let limit_arg = |i: usize, default: usize| -> usize {
        match args.get(i).and_then(|v| v.as_f64()) {
            Some(n) => (n.max(1.0).min(100.0)) as usize,
            None => default,
        }
    };

    match channel {
        // --- status / config ---
        "uki:getStatus" | "uki:getState" => get_status(app),
        "uki:getConfig" => get_config(app),
        "uki:updateConfig" => {
            let partial = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &partial)
        }
        "uki:resetConfig" => reset_config(app),

        // --- listening control ---
        "uki:startListening" => start_listening(app),
        "uki:stopListening" => json!(stop_listening(app)),
        "uki:toggle" => toggle_listening(app),

        // --- text query ---
        "uki:query" => query(app, &s(0).unwrap_or_default()),

        // --- memory (native plaintext archive) ---
        "uki:memoryRecord" => {
            let entry = args.get(0).cloned().unwrap_or(Value::Null);
            if !entry.is_object() {
                return json!(false);
            }
            let rt = entry.get("type").and_then(|v| v.as_str()).unwrap_or("activity");
            let summary = entry.get("summary").and_then(|v| v.as_str()).unwrap_or("");
            if summary.is_empty() {
                return json!(false);
            }
            let ok = record_memory(
                app,
                rt,
                summary,
                entry.get("appId").and_then(|v| v.as_str()),
                entry.get("pageId").and_then(|v| v.as_str()),
                entry.get("category").and_then(|v| v.as_str()),
                entry.get("action").and_then(|v| v.as_str()),
                entry.get("success").and_then(|v| v.as_bool()).unwrap_or(true),
            );
            json!(ok)
        }
        "uki:memorySearch" => {
            let q = s(0).unwrap_or_default();
            let safe_q: String = q.trim().chars().take(500).collect();
            if safe_q.is_empty() {
                return json!([]);
            }
            memory_search(app, &safe_q, limit_arg(1, 20))
        }
        "uki:memoryRecent" => memory_recent(app, limit_arg(0, 10)),
        "uki:memoryStats" => memory_stats(app),
        "uki:memoryCleanup" => json!(memory_cleanup(app)),
        "uki:memoryClear" => json!(memory_clear(app)),

        // --- copilot ---
        "uki:copilot:getConfig" => copilot_config(app),
        "uki:copilot:updateConfig" => {
            let cfg = args.get(0).cloned().unwrap_or(Value::Null);
            if !cfg.is_object() {
                return copilot_config(app);
            }
            copilot_update_config(app, &cfg)
        }
        "uki:copilot:setContext" => {
            let ctx = args.get(0).cloned().unwrap_or(Value::Null);
            if !ctx.is_object() {
                return json!(false);
            }
            copilot_set_context(app, &ctx);
            json!(true)
        }
        "uki:copilot:sendMessage" => copilot_send_message(app, &s(0).unwrap_or_default()),
        "uki:copilot:getConversation" => copilot_get_conversation(app),
        "uki:copilot:clearConversation" => {
            copilot_clear_conversation(app);
            json!(true)
        }
        "uki:copilot:getSuggestions" => copilot_suggestions(app),
        "uki:copilot:executeAction" => {
            match s(0) {
                Some(id) => copilot_execute_action(app, &id),
                None => json!({ "success": false }),
            }
        }
        "uki:copilot:isThinking" => {
            // No async generation here -> never thinking (Electron's flag is only
            // true mid sendMessage, which is synchronous in our port).
            json!(false)
        }

        // --- blueprint ---
        "uki:blueprint:generate" => {
            let prompt = s(0).unwrap_or_default();
            if prompt.trim().is_empty() {
                return json!({ "ok": false, "error": "invalid-prompt" });
            }
            let kind = s(1);
            blueprint_generate(app, &prompt, kind.as_deref())
        }
        "uki:blueprint:tweak" => {
            let id = match s(0) {
                Some(i) => i,
                None => return json!({ "ok": false, "error": "invalid-id" }),
            };
            let change = args.get(1).cloned().unwrap_or(Value::Null);
            if !change.is_object() {
                return json!({ "ok": false, "error": "invalid-change" });
            }
            blueprint_tweak(app, &id, &change)
        }

        // --- recall ---
        "uki:recall" => {
            let q = s(0).unwrap_or_default();
            if q.trim().is_empty() {
                return json!({ "ok": false, "error": "invalid-query" });
            }
            let opts = args.get(1).cloned().unwrap_or(json!({}));
            recall(app, &q, &opts)
        }

        // --- creative operator ---
        "uki:operator:dispatch" => {
            let action = args.get(0).cloned().unwrap_or(Value::Null);
            operator_dispatch(app, &action)
        }
        "uki:operator:audit" => operator_audit(app, limit_arg(0, 20)),

        _ => Value::Null,
    }
}
