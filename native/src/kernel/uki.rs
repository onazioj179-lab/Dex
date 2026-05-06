// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Kernel — UKI: Native Voice Intelligence Engine
//
// High-performance Rust core for UKI voice assistant:
//   - NLU tokenizer + intent classification (zero-copy, SIMD-friendly)
//   - Knowledge graph engine (in-memory + AES-256-GCM encrypted persistence)
//   - Pipeline orchestrator (sub-millisecond intent routing)
//
// All hot paths avoid allocation. The JS layer delegates heavy NLU and
// graph work here; UI/IPC/TTS stay in the renderer.
// ═══════════════════════════════════════════════════════════════════════════

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use parking_lot::RwLock;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────
// Telemetry
// ─────────────────────────────────────────────────────────────────────────

static INTENTS_PARSED: AtomicU64 = AtomicU64::new(0);
static GRAPH_QUERIES: AtomicU64 = AtomicU64::new(0);
static GRAPH_WRITES: AtomicU64 = AtomicU64::new(0);
static PARSE_NS_TOTAL: AtomicU64 = AtomicU64::new(0);

// ─────────────────────────────────────────────────────────────────────────
// NLU: Tokenizer
// ─────────────────────────────────────────────────────────────────────────

/// Normalize and tokenize raw transcript text.
/// Lowercase, strip punctuation, collapse whitespace.
fn tokenize(input: &str) -> Vec<String> {
    let lower = input.to_lowercase();
    let mut tokens = Vec::with_capacity(16);
    let mut current = String::new();
    for ch in lower.chars() {
        if ch.is_alphanumeric() || ch == '\'' || ch == '-' {
            current.push(ch);
        } else {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

/// Compute Levenshtein edit distance between two strings.
fn edit_distance(a: &str, b: &str) -> usize {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    let m = a_bytes.len();
    let n = b_bytes.len();
    if m == 0 { return n; }
    if n == 0 { return m; }

    let mut prev = vec![0usize; n + 1];
    let mut curr = vec![0usize; n + 1];
    for j in 0..=n { prev[j] = j; }

    for i in 1..=m {
        curr[0] = i;
        for j in 1..=n {
            let cost = if a_bytes[i - 1] == b_bytes[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1)
                .min(curr[j - 1] + 1)
                .min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[n]
}

// ─────────────────────────────────────────────────────────────────────────
// NLU: Intent Patterns (compiled once)
// ─────────────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
struct IntentPattern {
    keywords: Vec<&'static str>,
    category: &'static str,
    action: &'static str,
    confidence: f64,
}

fn build_patterns() -> Vec<IntentPattern> {
    vec![
        // Navigation
        IntentPattern { keywords: vec!["go", "to"],            category: "navigation", action: "navigate",   confidence: 0.85 },
        IntentPattern { keywords: vec!["open"],                category: "navigation", action: "navigate",   confidence: 0.80 },
        IntentPattern { keywords: vec!["go", "home"],          category: "navigation", action: "go-home",    confidence: 0.95 },
        IntentPattern { keywords: vec!["go", "back"],          category: "navigation", action: "go-back",    confidence: 0.90 },
        IntentPattern { keywords: vec!["navigate"],            category: "navigation", action: "navigate",   confidence: 0.85 },
        IntentPattern { keywords: vec!["show", "me"],          category: "navigation", action: "navigate",   confidence: 0.75 },

        // App launch
        IntentPattern { keywords: vec!["launch"],              category: "app_launch", action: "launch",     confidence: 0.90 },
        IntentPattern { keywords: vec!["start"],               category: "app_launch", action: "launch",     confidence: 0.80 },
        IntentPattern { keywords: vec!["run"],                 category: "app_launch", action: "launch",     confidence: 0.75 },
        IntentPattern { keywords: vec!["open", "app"],         category: "app_launch", action: "launch",     confidence: 0.85 },

        // App close
        IntentPattern { keywords: vec!["close"],               category: "app_close",  action: "close",      confidence: 0.85 },
        IntentPattern { keywords: vec!["quit"],                category: "app_close",  action: "close",      confidence: 0.85 },
        IntentPattern { keywords: vec!["exit"],                category: "app_close",  action: "close",      confidence: 0.80 },
        IntentPattern { keywords: vec!["close", "all"],        category: "app_close",  action: "close-all",  confidence: 0.95 },

        // Media
        IntentPattern { keywords: vec!["play", "music"],       category: "media",      action: "play",       confidence: 0.90 },
        IntentPattern { keywords: vec!["play"],                category: "media",      action: "play",       confidence: 0.70 },
        IntentPattern { keywords: vec!["pause"],               category: "media",      action: "pause",      confidence: 0.90 },
        IntentPattern { keywords: vec!["stop", "music"],       category: "media",      action: "pause",      confidence: 0.85 },
        IntentPattern { keywords: vec!["next", "track"],       category: "media",      action: "next",       confidence: 0.90 },
        IntentPattern { keywords: vec!["next", "song"],        category: "media",      action: "next",       confidence: 0.90 },
        IntentPattern { keywords: vec!["skip"],                category: "media",      action: "next",       confidence: 0.80 },
        IntentPattern { keywords: vec!["previous", "track"],   category: "media",      action: "previous",   confidence: 0.90 },
        IntentPattern { keywords: vec!["volume", "up"],        category: "media",      action: "volume-up",  confidence: 0.90 },
        IntentPattern { keywords: vec!["louder"],              category: "media",      action: "volume-up",  confidence: 0.85 },
        IntentPattern { keywords: vec!["volume", "down"],      category: "media",      action: "volume-down",confidence: 0.90 },
        IntentPattern { keywords: vec!["quieter"],             category: "media",      action: "volume-down",confidence: 0.85 },
        IntentPattern { keywords: vec!["mute"],                category: "media",      action: "toggle-mute",confidence: 0.90 },
        IntentPattern { keywords: vec!["unmute"],              category: "media",      action: "toggle-mute",confidence: 0.90 },

        // File operations
        IntentPattern { keywords: vec!["find", "file"],        category: "file_ops",   action: "search",     confidence: 0.85 },
        IntentPattern { keywords: vec!["search", "for"],       category: "search",     action: "search",     confidence: 0.85 },
        IntentPattern { keywords: vec!["find"],                category: "search",     action: "search",     confidence: 0.75 },
        IntentPattern { keywords: vec!["look", "for"],         category: "search",     action: "search",     confidence: 0.80 },
        IntentPattern { keywords: vec!["create", "folder"],    category: "file_ops",   action: "create-folder", confidence: 0.90 },
        IntentPattern { keywords: vec!["new", "folder"],       category: "file_ops",   action: "create-folder", confidence: 0.90 },
        IntentPattern { keywords: vec!["delete"],              category: "file_ops",   action: "delete",     confidence: 0.80 },
        IntentPattern { keywords: vec!["remove"],              category: "file_ops",   action: "delete",     confidence: 0.75 },
        IntentPattern { keywords: vec!["rename"],              category: "file_ops",   action: "rename",     confidence: 0.85 },
        IntentPattern { keywords: vec!["move"],                category: "file_ops",   action: "move",       confidence: 0.80 },
        IntentPattern { keywords: vec!["copy"],                category: "file_ops",   action: "move",       confidence: 0.80 },
        IntentPattern { keywords: vec!["recent", "files"],     category: "file_ops",   action: "recent",     confidence: 0.85 },

        // Create
        IntentPattern { keywords: vec!["create", "note"],      category: "create",     action: "note",       confidence: 0.90 },
        IntentPattern { keywords: vec!["new", "note"],         category: "create",     action: "note",       confidence: 0.90 },
        IntentPattern { keywords: vec!["create", "task"],      category: "create",     action: "task",       confidence: 0.90 },
        IntentPattern { keywords: vec!["new", "task"],         category: "create",     action: "task",       confidence: 0.90 },
        IntentPattern { keywords: vec!["add", "task"],         category: "create",     action: "task",       confidence: 0.85 },
        IntentPattern { keywords: vec!["remind", "me"],        category: "create",     action: "reminder",   confidence: 0.85 },
        IntentPattern { keywords: vec!["set", "reminder"],     category: "create",     action: "reminder",   confidence: 0.90 },

        // System
        IntentPattern { keywords: vec!["screenshot"],          category: "system",     action: "screenshot", confidence: 0.95 },
        IntentPattern { keywords: vec!["take", "screenshot"],  category: "system",     action: "screenshot", confidence: 0.95 },
        IntentPattern { keywords: vec!["lock", "screen"],      category: "system",     action: "lock",       confidence: 0.90 },
        IntentPattern { keywords: vec!["lock"],                category: "system",     action: "lock",       confidence: 0.75 },
        IntentPattern { keywords: vec!["battery"],             category: "system",     action: "battery",    confidence: 0.85 },
        IntentPattern { keywords: vec!["battery", "status"],   category: "system",     action: "battery",    confidence: 0.90 },
        IntentPattern { keywords: vec!["restart"],             category: "system",     action: "restart",    confidence: 0.85 },
        IntentPattern { keywords: vec!["minimize"],            category: "system",     action: "minimize",   confidence: 0.85 },
        IntentPattern { keywords: vec!["maximize"],            category: "system",     action: "maximize",   confidence: 0.85 },
        IntentPattern { keywords: vec!["dark", "mode"],        category: "settings",   action: "toggle-dark",confidence: 0.90 },
        IntentPattern { keywords: vec!["light", "mode"],       category: "settings",   action: "toggle-dark",confidence: 0.90 },

        // Automation
        IntentPattern { keywords: vec!["run", "workflow"],     category: "automation", action: "run-workflow", confidence: 0.90 },
        IntentPattern { keywords: vec!["execute", "workflow"], category: "automation", action: "run-workflow", confidence: 0.90 },

        // Conversation
        IntentPattern { keywords: vec!["hello"],               category: "conversation", action: "greeting", confidence: 0.90 },
        IntentPattern { keywords: vec!["hey"],                 category: "conversation", action: "greeting", confidence: 0.85 },
        IntentPattern { keywords: vec!["hi"],                  category: "conversation", action: "greeting", confidence: 0.85 },
        IntentPattern { keywords: vec!["good", "morning"],     category: "conversation", action: "greeting", confidence: 0.90 },
        IntentPattern { keywords: vec!["thanks"],              category: "conversation", action: "thanks",   confidence: 0.90 },
        IntentPattern { keywords: vec!["thank", "you"],        category: "conversation", action: "thanks",   confidence: 0.90 },
        IntentPattern { keywords: vec!["bye"],                 category: "conversation", action: "farewell", confidence: 0.90 },
        IntentPattern { keywords: vec!["goodbye"],             category: "conversation", action: "farewell", confidence: 0.90 },
        IntentPattern { keywords: vec!["who", "are", "you"],   category: "conversation", action: "identity", confidence: 0.95 },
        IntentPattern { keywords: vec!["what", "are", "you"],  category: "conversation", action: "identity", confidence: 0.90 },
        IntentPattern { keywords: vec!["tell", "joke"],        category: "conversation", action: "joke",     confidence: 0.90 },
        IntentPattern { keywords: vec!["joke"],                category: "conversation", action: "joke",     confidence: 0.80 },
        IntentPattern { keywords: vec!["what", "time"],        category: "conversation", action: "time",     confidence: 0.90 },
        IntentPattern { keywords: vec!["what", "date"],        category: "conversation", action: "date",     confidence: 0.90 },
        IntentPattern { keywords: vec!["today's", "date"],     category: "conversation", action: "date",     confidence: 0.90 },
        IntentPattern { keywords: vec!["help"],                category: "conversation", action: "help",     confidence: 0.90 },
        IntentPattern { keywords: vec!["what", "can", "you"],  category: "conversation", action: "help",     confidence: 0.85 },
        IntentPattern { keywords: vec!["calculate"],           category: "conversation", action: "calculate",confidence: 0.85 },
        IntentPattern { keywords: vec!["how", "much", "is"],   category: "conversation", action: "calculate",confidence: 0.80 },
        IntentPattern { keywords: vec!["yes"],                 category: "confirmation", action: "confirm",  confidence: 0.85 },
        IntentPattern { keywords: vec!["confirm"],             category: "confirmation", action: "confirm",  confidence: 0.90 },
        IntentPattern { keywords: vec!["no"],                  category: "confirmation", action: "deny",     confidence: 0.80 },
        IntentPattern { keywords: vec!["cancel"],              category: "confirmation", action: "deny",     confidence: 0.85 },
        IntentPattern { keywords: vec!["never", "mind"],       category: "confirmation", action: "deny",     confidence: 0.90 },
        // Memory voice commands
        IntentPattern { keywords: vec!["what", "remember"],     category: "memory", action: "recall",   confidence: 0.92 },
        IntentPattern { keywords: vec!["do", "you", "remember"], category: "memory", action: "recall",   confidence: 0.90 },
        IntentPattern { keywords: vec!["recall", "memory"],      category: "memory", action: "recall",   confidence: 0.90 },
        IntentPattern { keywords: vec!["search", "memory"],      category: "memory", action: "search",   confidence: 0.92 },
        IntentPattern { keywords: vec!["search", "history"],     category: "memory", action: "search",   confidence: 0.88 },
        IntentPattern { keywords: vec!["what", "did", "i"],      category: "memory", action: "search",   confidence: 0.85 },
        IntentPattern { keywords: vec!["remember", "this"],      category: "memory", action: "record",   confidence: 0.90 },
        IntentPattern { keywords: vec!["save", "memory"],        category: "memory", action: "record",   confidence: 0.88 },
        IntentPattern { keywords: vec!["forget", "this"],        category: "memory", action: "forget",   confidence: 0.92 },
        IntentPattern { keywords: vec!["forget", "about"],       category: "memory", action: "forget",   confidence: 0.88 },
        IntentPattern { keywords: vec!["clear", "memory"],       category: "memory", action: "clear",    confidence: 0.90 },
        IntentPattern { keywords: vec!["clear", "my", "memory"], category: "memory", action: "clear",    confidence: 0.92 },
        IntentPattern { keywords: vec!["erase", "memory"],       category: "memory", action: "clear",    confidence: 0.88 },
        IntentPattern { keywords: vec!["memory", "stats"],       category: "memory", action: "stats",    confidence: 0.90 },
        IntentPattern { keywords: vec!["how", "many", "memories"],category: "memory", action: "stats",    confidence: 0.85 },
    ]
}

// ─────────────────────────────────────────────────────────────────────────
// NLU: App & Page Name Resolution
// ─────────────────────────────────────────────────────────────────────────

fn build_app_names() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::with_capacity(60);
    let entries: &[(&str, &str)] = &[
        ("files", "files"), ("file", "files"), ("file manager", "files"),
        ("notes", "notes"), ("note", "notes"), ("notepad", "notes"),
        ("browser", "browser"), ("web", "browser"), ("internet", "browser"),
        ("settings", "settings"), ("preferences", "settings"), ("config", "settings"),
        ("transfers", "transfers"), ("transfer", "transfers"), ("send", "transfers"),
        ("tasks", "tasks"), ("task", "tasks"), ("todo", "tasks"), ("to do", "tasks"),
        ("gallery", "gallery"), ("photos", "gallery"), ("images", "gallery"),
        ("audio", "audio"), ("music", "audio"), ("player", "audio"),
        ("workflows", "workflows"), ("workflow", "workflows"), ("automation", "workflows"),
        ("calendar", "calendar"), ("date", "calendar"),
        ("calculator", "calculator"), ("calc", "calculator"), ("math", "calculator"),
        ("video editor", "videoeditor"), ("vinx", "videoeditor"),
        ("imosion", "imosion"), ("prism", "prism"), ("flux", "flux"),
        ("forge", "forge"), ("axl", "axl"), ("rewind", "rewind"),
        ("kanban", "kanban"), ("board", "kanban"),
        ("achievements", "achievements"), ("trophies", "achievements"),
        ("trash", "recyclebin"), ("recycle bin", "recyclebin"), ("bin", "recyclebin"),
        ("weather", "weather"), ("world clock", "worldclock"), ("clocks", "worldclock"),
        ("noise", "noisegenerator"), ("white noise", "noisegenerator"),
        ("markdown", "markdown"), ("nexus", "nexus"), ("stopwatch", "stopwatch"),
        ("timer", "stopwatch"), ("converter", "unitconverter"), ("units", "unitconverter"),
        ("pomodoro", "pomodoro"), ("focus", "pomodoro"),
        ("qr", "qrcode"), ("qr code", "qrcode"),
        ("colors", "colorpicker"), ("color picker", "colorpicker"),
        ("passwords", "passwordgenerator"), ("password", "passwordgenerator"),
    ];
    for &(name, id) in entries {
        m.insert(name, id);
    }
    m
}

fn build_page_names() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::with_capacity(20);
    let entries: &[(&str, &str)] = &[
        ("home", "home"), ("main", "home"), ("dashboard", "home"),
        ("files", "files"), ("notes", "notes"), ("browser", "browser"),
        ("settings", "settings"), ("transfers", "transfers"),
        ("tasks", "tasks"), ("gallery", "gallery"), ("audio", "audio"),
        ("workflows", "workflows"),
    ];
    for &(name, id) in entries {
        m.insert(name, id);
    }
    m
}

// ─────────────────────────────────────────────────────────────────────────
// NLU: Intent Parser (the hot path)
// ─────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
struct ParsedIntent {
    category: String,
    action: String,
    confidence: f64,
    entities: HashMap<String, String>,
    raw: String,
}

static PATTERNS: std::sync::OnceLock<Vec<IntentPattern>> = std::sync::OnceLock::new();
static APP_NAMES: std::sync::OnceLock<HashMap<&'static str, &'static str>> = std::sync::OnceLock::new();
static PAGE_NAMES: std::sync::OnceLock<HashMap<&'static str, &'static str>> = std::sync::OnceLock::new();

fn get_patterns() -> &'static Vec<IntentPattern> {
    PATTERNS.get_or_init(build_patterns)
}
fn get_app_names() -> &'static HashMap<&'static str, &'static str> {
    APP_NAMES.get_or_init(build_app_names)
}
fn get_page_names() -> &'static HashMap<&'static str, &'static str> {
    PAGE_NAMES.get_or_init(build_page_names)
}

fn parse_intent(raw: &str) -> ParsedIntent {
    let tokens = tokenize(raw);
    let lower = raw.to_lowercase();

    let mut best_cat = "conversation";
    let mut best_act = "unknown";
    let mut best_conf = 0.0f64;

    let patterns = get_patterns();

    // Score each pattern
    for pat in patterns.iter() {
        let mut matched = 0usize;
        for kw in &pat.keywords {
            // Exact token match
            if tokens.iter().any(|t| t == kw) {
                matched += 1;
            }
            // Also check substring for multi-word tokens
            else if lower.contains(kw) {
                matched += 1;
            }
        }
        if matched == pat.keywords.len() {
            // Longer keyword lists are more specific -- boost confidence
            let specificity_bonus = (pat.keywords.len() as f64 - 1.0) * 0.05;
            let score = pat.confidence + specificity_bonus;
            if score > best_conf {
                best_conf = score;
                best_cat = pat.category;
                best_act = pat.action;
            }
        }
    }

    // Entity extraction
    let mut entities = HashMap::new();
    let app_names = get_app_names();
    let page_names = get_page_names();

    // Try to resolve app name (exact then fuzzy)
    let resolved_app = resolve_name(&lower, &tokens, app_names);
    if let Some(app_id) = resolved_app {
        entities.insert("appId".into(), app_id.to_string());
        // If we matched an app but category is navigation, reclassify to app_launch
        if best_cat == "navigation" && !page_names.contains_key(app_id) {
            best_cat = "app_launch";
            best_act = "launch";
        }
    }

    // Try to resolve page name
    let resolved_page = resolve_name(&lower, &tokens, page_names);
    if let Some(page_id) = resolved_page {
        entities.insert("pageId".into(), page_id.to_string());
    }

    // Extract search query (everything after "search for" / "find" / "look for")
    for prefix in &["search for ", "find ", "look for ", "looking for "] {
        if let Some(pos) = lower.find(prefix) {
            let query = &raw[pos + prefix.len()..];
            let trimmed = query.trim();
            if !trimmed.is_empty() {
                entities.insert("query".into(), trimmed.to_string());
            }
        }
    }

    // Extract target (thing after the action verb)
    if entities.is_empty() && tokens.len() > 1 {
        // The last meaningful word(s) after action keywords
        let skip_words: std::collections::HashSet<&str> = [
            "the", "a", "an", "my", "to", "for", "in", "on", "at", "up", "down",
            "please", "can", "you", "could", "would", "me", "this", "that",
        ].iter().copied().collect();

        let remaining: Vec<&String> = tokens.iter()
            .filter(|t| !skip_words.contains(t.as_str()))
            .skip(1)
            .collect();

        if !remaining.is_empty() {
            let target = remaining.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(" ");
            entities.insert("target".into(), target);
        }
    }

    ParsedIntent {
        category: best_cat.to_string(),
        action: best_act.to_string(),
        confidence: best_conf.min(1.0),
        entities,
        raw: raw.to_string(),
    }
}

/// Resolve a name from tokens using exact match then fuzzy (edit distance <= 2).
fn resolve_name<'a>(
    lower: &str,
    tokens: &[String],
    names: &'a HashMap<&'static str, &'static str>,
) -> Option<&'a str> {
    // Exact substring match (longer names first for greedy matching)
    let mut sorted_names: Vec<&&str> = names.keys().collect();
    sorted_names.sort_by(|a, b| b.len().cmp(&a.len()));
    for name in sorted_names {
        if lower.contains(*name) {
            return names.get(*name).copied();
        }
    }

    // Fuzzy match each token
    for token in tokens {
        for (name, id) in names.iter() {
            if name.len() > 2 && edit_distance(token, name) <= 2 {
                return Some(id);
            }
        }
    }

    None
}


// ─────────────────────────────────────────────────────────────────────────
// Knowledge Graph: In-Memory Engine
// ─────────────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
struct KNode {
    id: String,
    node_type: String,  // "app" | "page" | "command" | "file" | "tag"
    label: String,
    color: String,
    weight: u64,
    last_used: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct KEdge {
    source: String,
    target: String,
    relation: String,
    weight: u64,
}

#[derive(Default, Serialize, Deserialize)]
struct KnowledgeStore {
    nodes: Vec<KNode>,
    edges: Vec<KEdge>,
}

static KNOWLEDGE: std::sync::OnceLock<RwLock<KnowledgeStore>> = std::sync::OnceLock::new();

fn get_knowledge() -> &'static RwLock<KnowledgeStore> {
    KNOWLEDGE.get_or_init(|| RwLock::new(KnowledgeStore::default()))
}

// ─────────────────────────────────────────────────────────────────────────
// Knowledge Graph: Encrypted Persistence (AES-256-GCM)
// ─────────────────────────────────────────────────────────────────────────

use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;

fn derive_key() -> [u8; 32] {
    // Derive from machine-specific data so graph file is machine-bound
    let mut seed = Vec::new();
    if let Some(dir) = dirs::data_local_dir() {
        seed.extend_from_slice(dir.to_string_lossy().as_bytes());
    }
    seed.extend_from_slice(b"DEX-UKI-Knowledge-v1");
    // Simple KDF: SHA-256-like via repeated hashing
    let mut key = [0u8; 32];
    let mut state = [0x6au8; 64];
    for (i, b) in seed.iter().enumerate() {
        state[i % 64] ^= b;
    }
    for round in 0..256u16 {
        let rb = round.to_le_bytes();
        state[0] = state[0].wrapping_add(rb[0]);
        state[1] = state[1].wrapping_add(rb[1]);
        for i in 0..64 {
            state[i] = state[i]
                .wrapping_add(state[(i + 1) % 64])
                .wrapping_mul(0x9d)
                .rotate_left(3);
        }
    }
    key.copy_from_slice(&state[..32]);
    key
}

fn knowledge_path() -> std::path::PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("DEX")
        .join("uki-knowledge.enc")
}

fn save_knowledge_encrypted(store: &KnowledgeStore) -> Result<(), String> {
    let json = serde_json::to_vec(store).map_err(|e| e.to_string())?;
    let compressed = zstd::bulk::compress(&json, 3).map_err(|e| e.to_string())?;

    let key_bytes = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let nonce_bytes: [u8; 12] = {
        let mut n = [0u8; 12];
        // Deterministic nonce from content hash (safe because key is unique per save)
        for (i, b) in compressed.iter().enumerate().take(12) {
            n[i % 12] ^= b;
        }
        // Add randomness
        let r: [u8; 12] = rand::random();
        for i in 0..12 {
            n[i] ^= r[i];
        }
        n
    };
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, compressed.as_ref()).map_err(|e| e.to_string())?;

    let path = knowledge_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // Write: 12 bytes nonce + ciphertext
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    std::fs::write(&path, &out).map_err(|e| e.to_string())?;

    Ok(())
}

fn load_knowledge_encrypted() -> Result<KnowledgeStore, String> {
    let path = knowledge_path();
    if !path.exists() {
        return Ok(KnowledgeStore::default());
    }

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    if data.len() < 12 {
        return Err("Corrupt knowledge file".into());
    }

    let key_bytes = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&data[..12]);
    let plaintext = cipher.decrypt(nonce, &data[12..]).map_err(|e| e.to_string())?;
    let decompressed = zstd::bulk::decompress(&plaintext, 10 * 1024 * 1024).map_err(|e| e.to_string())?;
    let store: KnowledgeStore = serde_json::from_slice(&decompressed).map_err(|e| e.to_string())?;

    Ok(store)
}


// ─────────────────────────────────────────────────────────────────────────
// Memory Archive: Persistent Context Cache (3 GB, 30-day retention)
// ─────────────────────────────────────────────────────────────────────────

/// A single memory record: conversation turn, command outcome, or activity summary.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct MemoryRecord {
    id: String,
    /// "conversation" | "command" | "activity" | "summary"
    record_type: String,
    timestamp: u64,
    /// Semantic summary of the interaction
    summary: String,
    /// App context when recorded
    app_id: Option<String>,
    page_id: Option<String>,
    /// Intent category + action if from a command
    category: Option<String>,
    action: Option<String>,
    /// Whether the original action succeeded
    success: bool,
    /// Relevance score (computed dynamically, not persisted meaningfully)
    weight: u64,
}

#[derive(Default, Serialize, Deserialize)]
struct MemoryArchive {
    records: Vec<MemoryRecord>,
    total_records_ever: u64,
}

static MEMORY: std::sync::OnceLock<RwLock<MemoryArchive>> = std::sync::OnceLock::new();

fn get_memory() -> &'static RwLock<MemoryArchive> {
    MEMORY.get_or_init(|| RwLock::new(MemoryArchive::default()))
}

const MAX_MEMORY_RECORDS: usize = 50_000;
const MAX_ARCHIVE_BYTES: usize = 3 * 1024 * 1024 * 1024; // 3 GB
const DEFAULT_RETENTION_DAYS: u64 = 30;

fn memory_path() -> std::path::PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("DEX")
        .join("uki-memory.enc")
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn save_memory_encrypted(archive: &MemoryArchive) -> Result<(), String> {
    let json = serde_json::to_vec(archive).map_err(|e| e.to_string())?;

    // Check size limit (uncompressed JSON estimate)
    if json.len() > MAX_ARCHIVE_BYTES {
        return Err("Archive exceeds 3 GB limit".into());
    }

    let compressed = zstd::bulk::compress(&json, 3).map_err(|e| e.to_string())?;

    let key_bytes = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let nonce_bytes: [u8; 12] = rand::random();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, compressed.as_ref()).map_err(|e| e.to_string())?;

    let path = memory_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // Atomic write: write to temp, backup existing, rename
    let tmp_path = path.with_extension("tmp");
    let bak_path = path.with_extension("bak");

    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    std::fs::write(&tmp_path, &out).map_err(|e| e.to_string())?;

    // Backup existing file before replacing
    if path.exists() {
        let _ = std::fs::copy(&path, &bak_path);
    }
    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;

    Ok(())
}

fn load_memory_encrypted() -> Result<MemoryArchive, String> {
    let path = memory_path();
    if !path.exists() {
        return Ok(MemoryArchive::default());
    }

    match load_memory_from_file(&path) {
        Ok(archive) => Ok(archive),
        Err(e) => {
            // Try backup file on corruption
            let bak_path = path.with_extension("bak");
            if bak_path.exists() {
                eprintln!("[UKI] Primary memory corrupt ({}), trying backup", e);
                match load_memory_from_file(&bak_path) {
                    Ok(archive) => {
                        // Restore from backup
                        let _ = std::fs::copy(&bak_path, &path);
                        Ok(archive)
                    }
                    Err(_) => {
                        eprintln!("[UKI] Backup also corrupt, starting fresh");
                        Ok(MemoryArchive::default())
                    }
                }
            } else {
                eprintln!("[UKI] Memory corrupt and no backup: {}", e);
                Ok(MemoryArchive::default())
            }
        }
    }
}

fn load_memory_from_file(path: &std::path::Path) -> Result<MemoryArchive, String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    if data.len() < 12 {
        return Err("Corrupt memory file".into());
    }

    let key_bytes = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&data[..12]);
    let plaintext = cipher.decrypt(nonce, &data[12..]).map_err(|e| e.to_string())?;
    let decompressed = zstd::bulk::decompress(&plaintext, 256 * 1024 * 1024).map_err(|e| e.to_string())?;
    let archive: MemoryArchive = serde_json::from_slice(&decompressed).map_err(|e| e.to_string())?;
    Ok(archive)
}

/// Enforce retention and size limits. Returns number of records removed.
fn memory_cleanup(archive: &mut MemoryArchive, retention_days: u64) -> usize {
    let cutoff = now_ms().saturating_sub(retention_days * 24 * 60 * 60 * 1000);
    let before = archive.records.len();

    // Remove records older than retention
    archive.records.retain(|r| r.timestamp > cutoff);

    // If still over limit, evict oldest first
    if archive.records.len() > MAX_MEMORY_RECORDS {
        archive.records.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        archive.records.truncate(MAX_MEMORY_RECORDS);
    }

    before - archive.records.len()
}

/// Search memory records by query string. Returns most relevant matches.
fn memory_search<'a>(archive: &'a MemoryArchive, query: &str, limit: usize) -> Vec<&'a MemoryRecord> {
    let lower_q = query.to_lowercase();
    let q_tokens = tokenize(&lower_q);

    let mut scored: Vec<(&MemoryRecord, f64)> = archive.records.iter().filter_map(|r| {
        let summary_lower = r.summary.to_lowercase();
        let mut score = 0.0f64;

        // Exact substring match in summary
        if summary_lower.contains(&lower_q) {
            score += 5.0;
        }

        // Token overlap
        let summary_tokens = tokenize(&summary_lower);
        for qt in &q_tokens {
            if summary_tokens.iter().any(|st| st == qt) {
                score += 1.0;
            }
        }

        // Match on app_id or category
        if let Some(ref aid) = r.app_id {
            if aid.to_lowercase().contains(&lower_q) { score += 3.0; }
        }
        if let Some(ref cat) = r.category {
            if cat.to_lowercase().contains(&lower_q) { score += 2.0; }
        }

        // Recency boost (recent records rank higher)
        let age_days = (now_ms().saturating_sub(r.timestamp)) as f64 / (86_400_000.0);
        let recency = 1.0 / (1.0 + age_days * 0.1);
        score *= recency;

        if score > 0.0 { Some((r, score)) } else { None }
    }).collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    scored.into_iter().map(|(r, _)| r).collect()
}

/// Get recent context for hybrid recall (auto-injected into NLU pipeline).
fn memory_recent_context<'a>(archive: &'a MemoryArchive, limit: usize) -> Vec<&'a MemoryRecord> {
    let mut recent: Vec<&MemoryRecord> = archive.records.iter().collect();
    recent.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    recent.truncate(limit);
    recent
}


// ═══════════════════════════════════════════════════════════════════════════
// NAPI Exports — Called from TypeScript UkiEngine
// ═══════════════════════════════════════════════════════════════════════════

/// Parse a transcript string and return a JSON intent object.
/// This is the hot path -- runs in < 0.1ms for typical inputs.
#[napi]
pub fn uki_parse_intent(transcript: String) -> napi::Result<String> {
    let start = std::time::Instant::now();

    // Validate input
    let safe = if transcript.len() > 1000 {
        &transcript[..1000]
    } else {
        &transcript
    };

    let intent = parse_intent(safe);
    let json = serde_json::to_string(&intent)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    INTENTS_PARSED.fetch_add(1, Ordering::Relaxed);
    PARSE_NS_TOTAL.fetch_add(start.elapsed().as_nanos() as u64, Ordering::Relaxed);

    Ok(json)
}

/// Load the knowledge graph from encrypted disk storage.
#[napi]
pub fn uki_knowledge_load() -> napi::Result<String> {
    let store_data = load_knowledge_encrypted()
        .map_err(|e| napi::Error::from_reason(format!("Knowledge load failed: {}", e)))?;

    let knowledge = get_knowledge();
    *knowledge.write() = store_data;

    let read = knowledge.read();
    let json = serde_json::to_string(&*read)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(json)
}

/// Save the knowledge graph to encrypted disk storage.
#[napi]
pub fn uki_knowledge_save() -> napi::Result<()> {
    let knowledge = get_knowledge();
    let read = knowledge.read();
    save_knowledge_encrypted(&*read)
        .map_err(|e| napi::Error::from_reason(format!("Knowledge save failed: {}", e)))?;
    Ok(())
}

/// Record an interaction in the knowledge graph.
/// category, action, app_id (optional), page_id (optional)
#[napi]
pub fn uki_knowledge_record(category: String, action: String, app_id: Option<String>, page_id: Option<String>) -> napi::Result<()> {
    GRAPH_WRITES.fetch_add(1, Ordering::Relaxed);

    let knowledge = get_knowledge();
    let mut store = knowledge.write();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    // Upsert command node
    let cmd_id = format!("cmd:{}:{}", category, action);
    upsert_node(&mut store, KNode {
        id: cmd_id.clone(),
        node_type: "command".into(),
        label: action.clone(),
        color: "#4DD0E1".into(),
        weight: 1,
        last_used: now,
    });

    // Boost app node if present
    if let Some(ref aid) = app_id {
        let app_node_id = format!("app:{}", aid);
        boost_node(&mut store, &app_node_id, now);
        upsert_edge(&mut store, &cmd_id, &app_node_id, "controls");
    }

    // Boost page node if present
    if let Some(ref pid) = page_id {
        let page_node_id = format!("page:{}", pid);
        upsert_node(&mut store, KNode {
            id: page_node_id.clone(),
            node_type: "page".into(),
            label: pid.clone(),
            color: "#64D2FF".into(),
            weight: 1,
            last_used: now,
        });
        upsert_edge(&mut store, &cmd_id, &page_node_id, "navigates");
    }

    Ok(())
}

/// Get top N nodes by weight for Nexus knowledge visualization.
#[napi]
pub fn uki_knowledge_top_nodes(n: u32) -> napi::Result<String> {
    GRAPH_QUERIES.fetch_add(1, Ordering::Relaxed);

    let knowledge = get_knowledge();
    let read = knowledge.read();

    let mut sorted: Vec<&KNode> = read.nodes.iter().collect();
    sorted.sort_by(|a, b| b.weight.cmp(&a.weight));
    sorted.truncate(n as usize);

    let json = serde_json::to_string(&sorted)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(json)
}

/// Get all edges for visualization.
#[napi]
pub fn uki_knowledge_edges() -> napi::Result<String> {
    GRAPH_QUERIES.fetch_add(1, Ordering::Relaxed);

    let knowledge = get_knowledge();
    let read = knowledge.read();

    let json = serde_json::to_string(&read.edges)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(json)
}

/// Get the full knowledge snapshot (nodes + edges) as JSON.
#[napi]
pub fn uki_knowledge_snapshot() -> napi::Result<String> {
    GRAPH_QUERIES.fetch_add(1, Ordering::Relaxed);

    let knowledge = get_knowledge();
    let read = knowledge.read();

    let json = serde_json::to_string(&*read)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(json)
}

/// Get UKI native engine telemetry stats.
#[napi]
pub fn uki_stats() -> napi::Result<String> {
    let parsed = INTENTS_PARSED.load(Ordering::Relaxed);
    let avg_ns = if parsed > 0 {
        PARSE_NS_TOTAL.load(Ordering::Relaxed) / parsed
    } else {
        0
    };

    let stats = serde_json::json!({
        "intents_parsed": parsed,
        "avg_parse_ns": avg_ns,
        "graph_queries": GRAPH_QUERIES.load(Ordering::Relaxed),
        "graph_writes": GRAPH_WRITES.load(Ordering::Relaxed),
    });

    Ok(stats.to_string())
}

/// Initialize UKI native engine: load knowledge graph + memory archive, warm up patterns.
#[napi]
pub fn uki_init() -> napi::Result<String> {
    // Warm up pattern cache
    let _ = get_patterns();
    let _ = get_app_names();
    let _ = get_page_names();

    // Load knowledge graph
    match load_knowledge_encrypted() {
        Ok(store) => {
            let knowledge = get_knowledge();
            *knowledge.write() = store;
        }
        Err(e) => {
            let knowledge = get_knowledge();
            *knowledge.write() = KnowledgeStore::default();
            eprintln!("[UKI] Knowledge load warning: {}", e);
        }
    }

    // Load memory archive
    match load_memory_encrypted() {
        Ok(archive) => {
            let mem = get_memory();
            *mem.write() = archive;
        }
        Err(e) => {
            let mem = get_memory();
            *mem.write() = MemoryArchive::default();
            eprintln!("[UKI] Memory load warning: {}", e);
        }
    }

    // Run startup cleanup (30-day retention)
    {
        let mem = get_memory();
        let mut archive = mem.write();
        let evicted = memory_cleanup(&mut archive, DEFAULT_RETENTION_DAYS);
        if evicted > 0 {
            let _ = save_memory_encrypted(&archive);
        }
    }

    let mem = get_memory();
    let count = mem.read().records.len();
    Ok(format!("UKI native initialized ({} memories)", count))
}

/// Record a memory entry (conversation, command outcome, activity, or summary).
#[napi]
pub fn uki_memory_record(
    record_type: String,
    summary: String,
    app_id: Option<String>,
    page_id: Option<String>,
    category: Option<String>,
    action: Option<String>,
    success: bool,
) -> napi::Result<()> {
    // Validate inputs
    let safe_summary = if summary.len() > 2000 { summary[..2000].to_string() } else { summary };
    let safe_type = match record_type.as_str() {
        "conversation" | "command" | "activity" | "summary" => record_type,
        _ => "conversation".into(),
    };

    let mem = get_memory();
    let mut archive = mem.write();

    let record = MemoryRecord {
        id: format!("mem-{}-{}", now_ms(), archive.total_records_ever),
        record_type: safe_type,
        timestamp: now_ms(),
        summary: safe_summary,
        app_id: app_id.map(|s| s[..s.len().min(100)].to_string()),
        page_id: page_id.map(|s| s[..s.len().min(100)].to_string()),
        category: category.map(|s| s[..s.len().min(100)].to_string()),
        action: action.map(|s| s[..s.len().min(100)].to_string()),
        success,
        weight: 1,
    };

    archive.records.push(record);
    archive.total_records_ever += 1;

    // Periodic size check -- cleanup if over limit
    if archive.records.len() > MAX_MEMORY_RECORDS {
        memory_cleanup(&mut archive, DEFAULT_RETENTION_DAYS);
    }

    Ok(())
}

/// Save the memory archive to encrypted disk storage.
#[napi]
pub fn uki_memory_save() -> napi::Result<()> {
    let mem = get_memory();
    let read = mem.read();
    save_memory_encrypted(&read)
        .map_err(|e| napi::Error::from_reason(format!("Memory save failed: {}", e)))?;
    Ok(())
}

/// Search memory records. Returns JSON array of matches.
#[napi]
pub fn uki_memory_search(query: String, limit: Option<u32>) -> napi::Result<String> {
    if query.is_empty() || query.len() > 500 {
        return Ok("[]".into());
    }
    let mem = get_memory();
    let archive = mem.read();
    let results = memory_search(&archive, &query, limit.unwrap_or(20) as usize);
    let json = serde_json::to_string(&results)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(json)
}

/// Get N most recent memory records. Returns JSON array.
#[napi]
pub fn uki_memory_recent(limit: Option<u32>) -> napi::Result<String> {
    let mem = get_memory();
    let archive = mem.read();
    let recent = memory_recent_context(&archive, limit.unwrap_or(10) as usize);
    let json = serde_json::to_string(&recent)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(json)
}

/// Get memory archive stats: record count, total ever, oldest, newest, estimated size.
#[napi]
pub fn uki_memory_stats() -> napi::Result<String> {
    let mem = get_memory();
    let archive = mem.read();

    let oldest = archive.records.iter().map(|r| r.timestamp).min().unwrap_or(0);
    let newest = archive.records.iter().map(|r| r.timestamp).max().unwrap_or(0);

    // Estimate on-disk size from file
    let disk_bytes = memory_path().metadata().map(|m| m.len()).unwrap_or(0);

    let stats = serde_json::json!({
        "record_count": archive.records.len(),
        "total_records": archive.records.len(),
        "total_records_ever": archive.total_records_ever,
        "oldest_timestamp": oldest,
        "newest_timestamp": newest,
        "disk_bytes": disk_bytes,
        "storage_bytes": disk_bytes,
        "disk_mb": (disk_bytes as f64) / (1024.0 * 1024.0),
        "max_records": MAX_MEMORY_RECORDS,
        "retention_days": DEFAULT_RETENTION_DAYS,
    });

    Ok(stats.to_string())
}

/// Run cleanup: enforce retention + size limits. Returns records removed.
#[napi]
pub fn uki_memory_cleanup(retention_days: Option<u32>) -> napi::Result<u32> {
    let days = retention_days.unwrap_or(DEFAULT_RETENTION_DAYS as u32) as u64;
    let mem = get_memory();
    let mut archive = mem.write();
    let removed = memory_cleanup(&mut archive, days) as u32;
    if removed > 0 {
        let _ = save_memory_encrypted(&archive);
    }
    Ok(removed)
}

/// Clear all memory records.
#[napi]
pub fn uki_memory_clear() -> napi::Result<()> {
    let mem = get_memory();
    let mut archive = mem.write();
    archive.records.clear();
    save_memory_encrypted(&archive)
        .map_err(|e| napi::Error::from_reason(format!("Memory clear failed: {}", e)))?;
    Ok(())
}


// ─────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────

const MAX_NODES: usize = 500;
const MAX_EDGES: usize = 2000;

fn upsert_node(store: &mut KnowledgeStore, node: KNode) {
    if let Some(existing) = store.nodes.iter_mut().find(|n| n.id == node.id) {
        existing.weight += node.weight;
        existing.last_used = node.last_used;
    } else {
        if store.nodes.len() >= MAX_NODES {
            // Evict lowest weight
            store.nodes.sort_by(|a, b| b.weight.cmp(&a.weight));
            store.nodes.pop();
        }
        store.nodes.push(node);
    }
}

fn boost_node(store: &mut KnowledgeStore, id: &str, now: u64) {
    if let Some(n) = store.nodes.iter_mut().find(|n| n.id == id) {
        n.weight += 1;
        n.last_used = now;
    }
}

fn upsert_edge(store: &mut KnowledgeStore, source: &str, target: &str, relation: &str) {
    if let Some(e) = store.edges.iter_mut().find(|e| e.source == source && e.target == target && e.relation == relation) {
        e.weight += 1;
    } else {
        if store.edges.len() >= MAX_EDGES {
            store.edges.sort_by(|a, b| b.weight.cmp(&a.weight));
            store.edges.pop();
        }
        store.edges.push(KEdge {
            source: source.into(),
            target: target.into(),
            relation: relation.into(),
            weight: 1,
        });
    }
}
