// =============================================================================
// DEX 6.0 — Native Rewind Engine (GOAL-6A)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Native Rewind timeline reconstruction: group a stream of activity events into
//! work sessions by idle gaps, summarise each, and reconstruct a session's
//! workspace (apps used + artifacts touched) for one-click "pick up where I left
//! off". Pure logic (no IO) — a faithful parity port of the TS
//! `src/shared/rewind/{timeline,reconstruct}.ts`, which remain the JS fallback.
//! (Activity capture stays renderer-side for now; this is the reconstruction core.)

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// One activity event: epoch-ms `ts`, the `app_id` it happened in, a `kind`
/// ('open' | 'edit' | 'save' | 'focus' | 'browse' | …) and an optional human label.
#[derive(Clone, Debug, Deserialize)]
pub struct ActivityEvent {
    pub ts: i64,
    #[serde(rename = "appId")]
    pub app_id: String,
    pub kind: String,
    #[serde(default)]
    pub label: Option<String>,
}

/// A reconstructed work session (a run of activity with no idle gap > the split).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TimelineSession {
    pub id: String,
    #[serde(rename = "startTs")]
    pub start_ts: i64,
    #[serde(rename = "endTs")]
    pub end_ts: i64,
    #[serde(rename = "appIds")]
    pub app_ids: Vec<String>,
    #[serde(rename = "primaryAppId")]
    pub primary_app_id: String,
    #[serde(rename = "eventCount")]
    pub event_count: usize,
    pub label: String,
}

/// Idle gap (ms) that splits one session from the next. Default 30 minutes.
pub const DEFAULT_SESSION_GAP_MS: i64 = 30 * 60 * 1000;

/// Distinct apps in `events`, most-active first (ties broken by app id ascending),
/// plus the single most-active app (the session "home"), or "unknown" if empty.
fn primary_app(events: &[ActivityEvent]) -> (String, Vec<String>) {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for e in events {
        *counts.entry(e.app_id.as_str()).or_insert(0) += 1;
    }
    let mut ranked: Vec<(&str, usize)> = counts.into_iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
    let ordered: Vec<String> = ranked.iter().map(|(id, _)| id.to_string()).collect();
    let primary = ordered.first().cloned().unwrap_or_else(|| "unknown".to_string());
    (primary, ordered)
}

/// Base-36 of a (non-negative) integer, matching JS `Number.prototype.toString(36)`
/// — used to mirror the TS session id format `session_${startTs.toString(36)}`.
fn to_base36(n: i64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".to_string();
    }
    let neg = n < 0;
    let mut m = n.unsigned_abs();
    let mut buf: Vec<u8> = Vec::new();
    while m > 0 {
        buf.push(DIGITS[(m % 36) as usize]);
        m /= 36;
    }
    if neg {
        buf.push(b'-');
    }
    buf.reverse();
    String::from_utf8(buf).unwrap_or_default()
}

fn summarize(primary: &str, app_count: usize, event_count: usize) -> String {
    let others = if app_count > 1 {
        let n = app_count - 1;
        format!(" +{} app{}", n, if n > 1 { "s" } else { "" })
    } else {
        String::new()
    };
    format!(
        "{} session{} — {} event{}",
        primary,
        others,
        event_count,
        if event_count == 1 { "" } else { "s" }
    )
}

/// Group a (possibly unsorted) event stream into sessions, splitting whenever the
/// gap between consecutive events exceeds `gap_ms`.
pub fn build_timeline(events: &[ActivityEvent], gap_ms: i64) -> Vec<TimelineSession> {
    if events.is_empty() {
        return Vec::new();
    }
    let mut sorted: Vec<ActivityEvent> = events.to_vec();
    sorted.sort_by_key(|e| e.ts); // stable, ascending

    let mut groups: Vec<Vec<ActivityEvent>> = Vec::new();
    let mut current: Vec<ActivityEvent> = vec![sorted[0].clone()];
    for i in 1..sorted.len() {
        if sorted[i].ts - sorted[i - 1].ts > gap_ms {
            groups.push(std::mem::take(&mut current));
        }
        current.push(sorted[i].clone());
    }
    groups.push(current);

    groups
        .iter()
        .map(|group| {
            let (primary, ordered) = primary_app(group);
            let app_count = ordered.len();
            let event_count = group.len();
            let label = summarize(&primary, app_count, event_count);
            TimelineSession {
                id: format!("session_{}", to_base36(group[0].ts)),
                start_ts: group[0].ts,
                end_ts: group[group.len() - 1].ts,
                app_ids: ordered,
                primary_app_id: primary,
                event_count,
                label,
            }
        })
        .collect()
}

/// Duration of a session in ms (clamped to >= 0).
pub fn session_duration(s: &TimelineSession) -> i64 {
    (s.end_ts - s.start_ts).max(0)
}

/// Reconstructed workspace: what to reopen to resume a session.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ReconstructedWorkspace {
    #[serde(rename = "primaryAppId")]
    pub primary_app_id: String,
    #[serde(rename = "appIds")]
    pub app_ids: Vec<String>,
    pub files: Vec<String>,
}

/// Event kinds that reference an openable artifact carried in `label`.
const ARTIFACT_KINDS: &[&str] = &["file", "open", "edit", "save", "browse"];

/// Reconstruct the workspace (apps most-active first + distinct artifacts most-
/// recent first) from a session's events.
pub fn reconstruct_workspace(events: &[ActivityEvent]) -> ReconstructedWorkspace {
    let (primary, app_ids) = primary_app(events);

    let mut by_recency: Vec<&ActivityEvent> = events.iter().collect();
    by_recency.sort_by_key(|b| std::cmp::Reverse(b.ts)); // most-recent first, stable

    let mut seen: HashSet<String> = HashSet::new();
    let mut files: Vec<String> = Vec::new();
    for e in by_recency {
        if !ARTIFACT_KINDS.contains(&e.kind.as_str()) {
            continue;
        }
        if let Some(l) = &e.label {
            if !l.is_empty() && !seen.contains(l) {
                seen.insert(l.clone());
                files.push(l.clone());
            }
        }
    }

    ReconstructedWorkspace { primary_app_id: primary, app_ids, files }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(ts: i64, app: &str, kind: &str, label: Option<&str>) -> ActivityEvent {
        ActivityEvent {
            ts,
            app_id: app.to_string(),
            kind: kind.to_string(),
            label: label.map(|s| s.to_string()),
        }
    }

    #[test]
    fn empty_stream_has_no_sessions() {
        assert!(build_timeline(&[], DEFAULT_SESSION_GAP_MS).is_empty());
    }

    #[test]
    fn splits_sessions_on_idle_gap() {
        let min = 60_000;
        let events = vec![
            ev(0, "notes", "edit", Some("a.md")),
            ev(5 * min, "notes", "edit", Some("a.md")),
            ev(45 * min, "vinx", "open", Some("clip.mp4")), // 40-min gap -> new session
        ];
        let sessions = build_timeline(&events, DEFAULT_SESSION_GAP_MS);
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].primary_app_id, "notes");
        assert_eq!(sessions[0].event_count, 2);
        assert_eq!(sessions[1].primary_app_id, "vinx");
        assert_eq!(sessions[0].id, format!("session_{}", to_base36(0)));
    }

    #[test]
    fn unsorted_input_is_sorted_then_grouped() {
        let min = 60_000;
        let events = vec![
            ev(45 * min, "vinx", "open", None),
            ev(0, "notes", "edit", None),
            ev(5 * min, "notes", "edit", None),
        ];
        let sessions = build_timeline(&events, DEFAULT_SESSION_GAP_MS);
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].start_ts, 0);
        assert_eq!(sessions[1].start_ts, 45 * min);
    }

    #[test]
    fn primary_is_most_active_and_label_is_built() {
        let events = vec![
            ev(0, "notes", "edit", None),
            ev(1000, "vinx", "edit", None),
            ev(2000, "notes", "edit", None),
        ];
        let s = &build_timeline(&events, DEFAULT_SESSION_GAP_MS)[0];
        assert_eq!(s.primary_app_id, "notes");
        assert_eq!(s.app_ids, vec!["notes".to_string(), "vinx".to_string()]);
        assert_eq!(s.label, "notes session +1 app — 3 events");
        assert_eq!(session_duration(s), 2000);
    }

    #[test]
    fn single_event_session_label_is_singular() {
        let s = build_timeline(&[ev(10, "calc", "open", None)], DEFAULT_SESSION_GAP_MS);
        assert_eq!(s[0].label, "calc session — 1 event");
    }

    #[test]
    fn to_base36_matches_js() {
        assert_eq!(to_base36(0), "0");
        assert_eq!(to_base36(35), "z");
        assert_eq!(to_base36(36), "10");
        assert_eq!(to_base36(1_000_000), "lfls");
    }

    #[test]
    fn reconstruct_orders_apps_and_dedupes_recent_files() {
        let events = vec![
            ev(0, "notes", "open", Some("a.md")),
            ev(1000, "notes", "edit", Some("a.md")),    // duplicate label
            ev(2000, "vinx", "open", Some("clip.mp4")),
            ev(3000, "notes", "focus", Some("ignored")), // 'focus' is not an artifact kind
        ];
        let w = reconstruct_workspace(&events);
        assert_eq!(w.primary_app_id, "notes");
        assert_eq!(w.app_ids, vec!["notes".to_string(), "vinx".to_string()]);
        // Most-recent-first, de-duplicated; the 'focus' event is excluded.
        assert_eq!(w.files, vec!["clip.mp4".to_string(), "a.md".to_string()]);
    }
}
