// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Fuzzy search engine.
// Scores candidates against a query using character-level subsequence matching,
// consecutive character bonuses, and position weighting.

/// A scored search result.
pub struct SearchResult {
    pub index: usize,
    pub score: i32,
}

/// Run a fuzzy search on the given candidates and return up to `limit` results
/// sorted by descending score. Only results with a positive score are included.
pub fn fuzzy_search(query: &str, candidates: &[String], limit: usize) -> Vec<SearchResult> {
    if query.is_empty() || candidates.is_empty() {
        return Vec::new();
    }

    let query_lower: Vec<char> = query.chars().map(|c| c.to_ascii_lowercase()).collect();
    let mut results: Vec<SearchResult> = Vec::with_capacity(candidates.len());

    for (index, candidate) in candidates.iter().enumerate() {
        let score = score_candidate(&query_lower, candidate);
        if score > 0 {
            results.push(SearchResult { index, score });
        }
    }

    results.sort_unstable_by(|a, b| b.score.cmp(&a.score));
    results.truncate(limit);
    results
}

/// Parallel fuzzy search using rayon for large candidate sets.
pub fn fuzzy_search_parallel(query: &str, candidates: &[String], limit: usize) -> Vec<SearchResult> {
    use rayon::prelude::*;

    if query.is_empty() || candidates.is_empty() {
        return Vec::new();
    }

    // For small sets, avoid rayon overhead
    if candidates.len() < 1000 {
        return fuzzy_search(query, candidates, limit);
    }

    let query_lower: Vec<char> = query.chars().map(|c| c.to_ascii_lowercase()).collect();

    let mut results: Vec<SearchResult> = candidates
        .par_iter()
        .enumerate()
        .filter_map(|(index, candidate)| {
            let score = score_candidate(&query_lower, candidate);
            if score > 0 {
                Some(SearchResult { index, score })
            } else {
                None
            }
        })
        .collect();

    results.sort_unstable_by(|a, b| b.score.cmp(&a.score));
    results.truncate(limit);
    results
}

/// Score a candidate string against the pre-lowercased query characters.
///
/// Scoring heuristics:
/// - Each matched character: +1
/// - Consecutive match bonus: +5 per consecutive match
/// - Start of word bonus: +10 (char after space, underscore, hyphen, or uppercase)
/// - Exact prefix match: +15
/// - Case-exact match: +1
/// - Position factor: early matches score higher (max +3 for first 10 chars)
fn score_candidate(query_chars: &[char], candidate: &str) -> i32 {
    let candidate_chars: Vec<char> = candidate.chars().collect();
    let candidate_lower: Vec<char> = candidate_chars.iter().map(|c| c.to_ascii_lowercase()).collect();

    if candidate_lower.is_empty() {
        return 0;
    }

    let mut score: i32 = 0;
    let mut query_idx: usize = 0;
    let mut prev_matched_idx: Option<usize> = None;
    let mut consecutive: i32 = 0;

    // Check prefix match
    let mut is_prefix = true;
    for (i, qc) in query_chars.iter().enumerate() {
        if i >= candidate_lower.len() || candidate_lower[i] != *qc {
            is_prefix = false;
            break;
        }
    }
    if is_prefix && !query_chars.is_empty() {
        score += 15;
    }

    for (cand_idx, cand_char) in candidate_lower.iter().enumerate() {
        if query_idx >= query_chars.len() {
            break;
        }

        if *cand_char == query_chars[query_idx] {
            score += 1;

            // Case-exact bonus
            if candidate_chars[cand_idx] == query_chars[query_idx]
                || candidate_chars[cand_idx].to_ascii_lowercase() == query_chars[query_idx]
            {
                // Only award if the original case matches the query exactly
                let original_query_char = query_chars[query_idx];
                if candidate_chars[cand_idx].to_ascii_lowercase() == original_query_char {
                    score += 1;
                }
            }

            // Consecutive bonus
            if let Some(prev) = prev_matched_idx {
                if cand_idx == prev + 1 {
                    consecutive += 1;
                    score += 5 * consecutive;
                } else {
                    consecutive = 0;
                }
            }

            // Word boundary bonus
            if cand_idx == 0 {
                score += 10;
            } else {
                let prev_char = candidate_chars[cand_idx - 1];
                if prev_char == ' ' || prev_char == '_' || prev_char == '-' || prev_char == '/' || prev_char == '.' {
                    score += 10;
                } else if candidate_chars[cand_idx].is_uppercase() && prev_char.is_lowercase() {
                    score += 8; // camelCase boundary
                }
            }

            // Position bonus: earlier matches are better
            if cand_idx < 10 {
                score += (3 - (cand_idx as i32 / 4)).max(0);
            }

            prev_matched_idx = Some(cand_idx);
            query_idx += 1;
        }
    }

    // All query characters must match, otherwise score is 0
    if query_idx < query_chars.len() {
        return 0;
    }

    score
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_search() {
        let candidates = vec![
            "Settings".to_string(),
            "Security".to_string(),
            "Safari".to_string(),
            "System Preferences".to_string(),
            "Terminal".to_string(),
        ];
        let results = fuzzy_search("set", &candidates, 5);
        assert!(!results.is_empty());
        // "Settings" should be the top match (prefix)
        assert_eq!(results[0].index, 0);
    }

    #[test]
    fn empty_query_returns_nothing() {
        let candidates = vec!["hello".to_string()];
        let results = fuzzy_search("", &candidates, 5);
        assert!(results.is_empty());
    }

    #[test]
    fn no_match_returns_nothing() {
        let candidates = vec!["hello".to_string(), "world".to_string()];
        let results = fuzzy_search("xyz", &candidates, 5);
        assert!(results.is_empty());
    }

    #[test]
    fn respects_limit() {
        let candidates: Vec<String> = (0..100).map(|i| format!("item_{}", i)).collect();
        let results = fuzzy_search("item", &candidates, 5);
        assert!(results.len() <= 5);
    }

    #[test]
    fn word_boundary_boost() {
        let candidates = vec![
            "my_settings_file".to_string(),
            "something_else".to_string(),
        ];
        let results = fuzzy_search("set", &candidates, 5);
        assert!(!results.is_empty());
        assert_eq!(results[0].index, 0);
    }
}
