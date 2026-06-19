// =============================================================================
// DEX Tauri — Reader subsystem (port of shared/reader/readerSummary.ts).
//
// ONE channel: `reader:summarize`. Pure, in-memory extractive summarizer used by
// DEX's reader mode. No storage, no network, no DOM, no model — a deterministic
// algorithm over the input text, so it ports verbatim. Return shape matches the
// Electron handler exactly:
//   { summary: string, picks: string[], totalSentences: number }
//
// Args (positional, as the renderer sends them — see preload.ts reader.summarize):
//   args[0] = text:    string
//   args[1] = options: { sentences?: number }   (optional)
//
// The Electron IPC wrapper (main.ts) clamps the requested sentence count to
// [1,10] (Math.max(1, Math.min(10, Math.floor(n)))) ONLY when `options.sentences`
// is a number, else defaults to 3, before calling summarize(). That clamp is
// reproduced here. The empty-string fast path (returns the empty result without
// touching the algorithm) is also reproduced.
//
// DIVERGENCES (all behaviour-preserving):
//   - JS used regex (lookbehind/lookahead) for sentence splitting and a class
//     replace for tokenizing; Rust std has no regex and no deps are allowed, so
//     both are hand-rolled char scanners with the SAME rules:
//       * split on a sentence terminator (. ! ?) followed by ASCII whitespace
//         then one of [A-Z 0-9 " ' `], terminator kept on the left sentence;
//       * tokenize: lowercase, map every char NOT in [a-z 0-9 ' -] (and not
//         whitespace) to a space, split on whitespace, keep tokens with len > 1
//         that are not stopwords.
//   - Sorting: JS Array.prototype.sort is stable (spec) and so is Rust's
//     sort_by; ties therefore resolve identically (original index order).
//   - "len" for the min/max sentence-length gate uses UTF-16 code-unit count to
//     match JS String.length exactly (ASCII text is identical either way).
// =============================================================================

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

const DEFAULT_SENTENCES: i64 = 3;
const MIN_SENTENCE_CHARS: usize = 25;
const MAX_SENTENCE_CHARS: usize = 320;

fn stopwords() -> HashSet<&'static str> {
    [
        "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "he",
        "her", "his", "i", "in", "is", "it", "its", "not", "of", "on", "or", "our", "she", "that",
        "the", "their", "them", "they", "this", "to", "was", "we", "were", "what", "when", "where",
        "which", "who", "will", "with", "you", "your", "about", "also", "can", "do", "does", "if",
        "into", "no", "so", "than", "then", "these", "there", "those", "too", "very", "just", "one",
        "two", "some", "any", "all", "because", "more", "most", "now", "out", "over", "up", "down",
        "off", "only", "my", "me", "hers", "us", "let",
    ]
    .into_iter()
    .collect()
}

// JS String.length counts UTF-16 code units. For the length gate we mirror that
// so the min/max thresholds behave identically on non-ASCII input.
fn utf16_len(s: &str) -> usize {
    s.chars().map(|c| c.len_utf16()).sum()
}

// Collapse all runs of ASCII/Unicode whitespace to a single space and trim,
// matching `text.replace(/\s+/g, ' ').trim()`.
fn collapse_ws(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_ws = false;
    for c in text.chars() {
        if c.is_whitespace() {
            in_ws = true;
        } else {
            if in_ws && !out.is_empty() {
                out.push(' ');
            }
            in_ws = false;
            out.push(c);
        }
    }
    out
}

// Split into sentences keeping the terminator, equivalent to:
//   cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9"'`])/g)
// i.e. cut at a (.!?) immediately followed by >=1 whitespace then a char in
// [A-Z 0-9 " ' `]. The terminator stays on the left part; the whitespace is the
// separator (consumed); the lookahead char starts the next part.
fn split_sentences(text: &str) -> Vec<String> {
    let cleaned = collapse_ws(text);
    if cleaned.is_empty() {
        return Vec::new();
    }
    let chars: Vec<char> = cleaned.chars().collect();
    let n = chars.len();
    let mut parts: Vec<String> = Vec::new();
    let mut start = 0usize; // start index of the current sentence
    let mut i = 0usize;
    while i < n {
        let c = chars[i];
        if c == '.' || c == '!' || c == '?' {
            // Need at least one whitespace char right after the terminator.
            let mut j = i + 1;
            let mut saw_ws = false;
            while j < n && chars[j].is_whitespace() {
                saw_ws = true;
                j += 1;
            }
            if saw_ws && j < n && is_lookahead_start(chars[j]) {
                // Sentence is [start ..= i] (terminator included); next begins at j.
                let seg: String = chars[start..=i].iter().collect();
                parts.push(seg);
                start = j;
                i = j;
                continue;
            }
        }
        i += 1;
    }
    if start < n {
        let seg: String = chars[start..n].iter().collect();
        parts.push(seg);
    }
    parts
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

// Matches the JS lookahead class [A-Z0-9"'`].
fn is_lookahead_start(c: char) -> bool {
    c.is_ascii_uppercase() || c.is_ascii_digit() || c == '"' || c == '\'' || c == '`'
}

// Tokenize, equivalent to:
//   text.toLowerCase()
//       .replace(/[^a-z0-9'\-\s]/g, ' ')
//       .split(/\s+/)
//       .filter(t => t.length > 1 && !STOPWORDS.has(t))
// After lowercasing, any char that is NOT [a-z 0-9 ' -] and NOT whitespace
// becomes a space; whitespace stays a separator.
fn tokenize(text: &str, stop: &HashSet<&'static str>) -> Vec<String> {
    let lowered = text.to_lowercase();
    let mut buf = String::with_capacity(lowered.len());
    for c in lowered.chars() {
        if c.is_whitespace() {
            buf.push(' ');
        } else if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '\'' || c == '-' {
            buf.push(c);
        } else {
            buf.push(' ');
        }
    }
    buf.split_whitespace()
        .filter(|t| utf16_len(t) > 1 && !stop.contains(*t))
        .map(|t| t.to_string())
        .collect()
}

fn empty_result() -> Value {
    json!({ "summary": "", "picks": [], "totalSentences": 0 })
}

// Faithful port of summarize(text, { sentences }) from readerSummary.ts. The
// min/max sentence-char options are not exposed by the IPC handler, so the
// readerSummary defaults (25 / 320) are used.
fn summarize(text: &str, target: i64) -> Value {
    let target_count = target.max(1) as usize;
    let stop = stopwords();

    let sentences = split_sentences(text);
    if sentences.is_empty() {
        return empty_result();
    }
    if sentences.len() <= target_count {
        return json!({
            "summary": sentences.join(" "),
            "picks": sentences,
            "totalSentences": sentences.len(),
        });
    }

    // Document-wide term frequency, plus per-sentence tokens.
    let mut term_freq: HashMap<String, f64> = HashMap::new();
    let sentence_tokens: Vec<Vec<String>> = sentences
        .iter()
        .map(|s| {
            let toks = tokenize(s, &stop);
            for t in &toks {
                *term_freq.entry(t.clone()).or_insert(0.0) += 1.0;
            }
            toks
        })
        .collect();

    let len_minus_1 = (sentences.len() as f64 - 1.0).max(1.0);

    // Score each sentence; out-of-range or token-less sentences score -Infinity
    // and are filtered out (mirrors the JS Number.isFinite gate).
    struct Scored {
        idx: usize,
        score: f64,
    }
    let scored: Vec<Scored> = sentences
        .iter()
        .enumerate()
        .map(|(idx, s)| {
            let len = utf16_len(s);
            if len < MIN_SENTENCE_CHARS || len > MAX_SENTENCE_CHARS {
                return Scored { idx, score: f64::NEG_INFINITY };
            }
            let toks = &sentence_tokens[idx];
            if toks.is_empty() {
                return Scored { idx, score: f64::NEG_INFINITY };
            }
            let mut raw = 0.0f64;
            for t in toks {
                raw += *term_freq.get(t).unwrap_or(&0.0);
            }
            let norm = raw / (toks.len() as f64).sqrt();
            let position_bonus = 1.0 - 0.5 * (idx as f64 / len_minus_1);
            Scored { idx, score: norm * position_bonus }
        })
        .collect();

    // Top-N by score (stable sort => ties keep source order, matching V8), then
    // re-sort the chosen indices into source order so the summary reads naturally.
    let mut finite: Vec<Scored> = scored.into_iter().filter(|s| s.score.is_finite()).collect();
    finite.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    finite.truncate(target_count);
    let mut ordered: Vec<usize> = finite.into_iter().map(|s| s.idx).collect();
    ordered.sort_unstable();

    let picks: Vec<String> = ordered.iter().map(|&i| sentences[i].clone()).collect();
    json!({
        "summary": picks.join(" "),
        "picks": picks,
        "totalSentences": sentences.len(),
    })
}

/// Route a `reader:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts / preload.ts).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "reader:summarize" => {
            // arg0 must be a non-empty string, else the empty result (the
            // Electron handler's `typeof text !== 'string' || length === 0` gate).
            let text = match args.get(0).and_then(|v| v.as_str()) {
                Some(t) if !t.is_empty() => t,
                _ => return empty_result(),
            };
            // arg1.sentences: clamp to [1,10] when it's a number, else default 3.
            let sentences = match args
                .get(1)
                .and_then(|o| o.get("sentences"))
                .and_then(|v| v.as_f64())
            {
                Some(n) => {
                    let floored = n.floor() as i64;
                    floored.clamp(1, 10)
                }
                None => DEFAULT_SENTENCES,
            };
            summarize(text, sentences)
        }
        _ => Value::Null,
    }
}
