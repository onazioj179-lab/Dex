// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Kernel — Fuzzy Matcher
// Lightweight Smith-Waterman-style fuzzy scorer, no external deps.
// Used by Spotlight, command palette, file search ranking.
// ═══════════════════════════════════════════════════════════════════════════

use napi_derive::napi;
use rayon::prelude::*;
use serde::Serialize;

// ─────────────────────────────────────────────────────────────────────────
// Scoring weights (tuned empirically)
// ─────────────────────────────────────────────────────────────────────────
const SCORE_MATCH: i32 = 16;
const SCORE_GAP_START: i32 = -3;
const SCORE_GAP_EXTEND: i32 = -1;
const BONUS_BOUNDARY: i32 = 8;       // match after / _ - . space
const BONUS_CAMEL: i32 = 6;          // match at uppercase boundary
const BONUS_CONSECUTIVE: i32 = 4;    // adjacent to previous match
const BONUS_FIRST_CHAR: i32 = 12;    // first char of haystack
const PENALTY_LEADING_GAP: i32 = -1; // unmatched chars before first match

#[derive(Serialize)]
#[napi(object)]
pub struct FuzzyMatch {
    pub index: u32,
    pub score: i32,
    pub matched_indices: Vec<u32>,
}

/// Score a single candidate against a query. Returns `None` if no match.
fn score_pair(query_lower: &[u8], hay: &str) -> Option<(i32, Vec<u32>)> {
    if query_lower.is_empty() {
        return Some((0, Vec::new()));
    }

    let hay_bytes = hay.as_bytes();
    let mut q_idx = 0usize;
    let mut score: i32 = 0;
    let mut prev_matched_pos: Option<usize> = None;
    let mut matched: Vec<u32> = Vec::with_capacity(query_lower.len());
    let mut leading = true;

    for (i, &b) in hay_bytes.iter().enumerate() {
        if q_idx >= query_lower.len() {
            break;
        }
        let qc = query_lower[q_idx];
        let bc_lower = b.to_ascii_lowercase();
        if bc_lower == qc {
            let mut bonus = SCORE_MATCH;

            if i == 0 {
                bonus += BONUS_FIRST_CHAR;
            }
            // Boundary detection
            if i > 0 {
                let prev = hay_bytes[i - 1];
                if matches!(prev, b'/' | b'\\' | b'_' | b'-' | b'.' | b' ') {
                    bonus += BONUS_BOUNDARY;
                } else if b.is_ascii_uppercase() && prev.is_ascii_lowercase() {
                    bonus += BONUS_CAMEL;
                }
            }
            // Consecutive bonus
            if let Some(p) = prev_matched_pos {
                if p + 1 == i {
                    bonus += BONUS_CONSECUTIVE;
                }
            }

            score += bonus;
            matched.push(i as u32);
            prev_matched_pos = Some(i);
            q_idx += 1;
            leading = false;
        } else {
            if leading {
                score += PENALTY_LEADING_GAP;
            } else if let Some(p) = prev_matched_pos {
                if p + 1 == i {
                    score += SCORE_GAP_START;
                } else {
                    score += SCORE_GAP_EXTEND;
                }
            }
        }
    }

    if q_idx < query_lower.len() {
        return None;
    }
    Some((score, matched))
}

/// Score and rank a list of candidates, returning the top `limit`.
/// Runs in parallel via Rayon for large lists.
#[napi]
pub fn fuzzy_rank(query: String, candidates: Vec<String>, limit: u32) -> Vec<FuzzyMatch> {
    let q_lower: Vec<u8> = query
        .as_bytes()
        .iter()
        .map(|b| b.to_ascii_lowercase())
        .collect();

    let mut results: Vec<FuzzyMatch> = if candidates.len() >= 256 {
        candidates
            .par_iter()
            .enumerate()
            .filter_map(|(i, c)| {
                score_pair(&q_lower, c).map(|(s, m)| FuzzyMatch {
                    index: i as u32,
                    score: s,
                    matched_indices: m,
                })
            })
            .collect()
    } else {
        candidates
            .iter()
            .enumerate()
            .filter_map(|(i, c)| {
                score_pair(&q_lower, c).map(|(s, m)| FuzzyMatch {
                    index: i as u32,
                    score: s,
                    matched_indices: m,
                })
            })
            .collect()
    };

    // Highest score first
    results.sort_by(|a, b| b.score.cmp(&a.score));
    if (limit as usize) < results.len() {
        results.truncate(limit as usize);
    }
    results
}

/// Single-shot score (returns -1 on no match). Useful for quick filters.
#[napi]
pub fn fuzzy_score(query: String, candidate: String) -> i32 {
    let q_lower: Vec<u8> = query
        .as_bytes()
        .iter()
        .map(|b| b.to_ascii_lowercase())
        .collect();
    score_pair(&q_lower, &candidate).map(|(s, _)| s).unwrap_or(-1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_consecutive_chars() {
        let s = score_pair(b"abc", "abcdef").unwrap();
        assert!(s.0 > 0);
        assert_eq!(s.1, vec![0, 1, 2]);
    }

    #[test]
    fn first_char_match_beats_inline() {
        let head = score_pair(b"set", "settings").unwrap().0;
        let inline = score_pair(b"set", "useTilesetWidget").unwrap().0;
        assert!(head > inline, "head {} should beat inline {}", head, inline);
    }

    #[test]
    fn no_match_returns_none() {
        assert!(score_pair(b"xyz", "abcdef").is_none());
    }

    #[test]
    fn rank_returns_top_limit() {
        let res = fuzzy_rank(
            "set".into(),
            vec![
                "settings".into(),
                "useTilesetWidget".into(),
                "open_settings".into(),
                "no_match_here".into(),
            ],
            2,
        );
        assert_eq!(res.len(), 2);
        assert!(res[0].score >= res[1].score);
    }
}
