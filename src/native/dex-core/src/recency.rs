// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Recency/frequency scoring for memory ranking (Nexus, search, Rewind).
//! Mirrors the renderer `shared/nexus/memoryItems.ts` so the hot ranking pass
//! over large memory sets can move to native without changing semantics. Pure.

/// Exponential decay: the fraction remaining after `age_ms`, given `half_life_ms`.
/// `decay(0, h) == 1`, `decay(h, h) == 0.5`. Guards: negative age clamps to 0,
/// a non-positive half-life is treated as 1.0 (never divides by zero / panics).
pub fn decay(age_ms: f64, half_life_ms: f64) -> f64 {
    let hl = if half_life_ms <= 0.0 { 1.0 } else { half_life_ms };
    let age = if age_ms < 0.0 { 0.0 } else { age_ms };
    0.5_f64.powf(age / hl)
}

/// Dampened frequency boost: `1 + log2(1 + max(0, hits - 1))`. One hit → 1.0;
/// more hits help but with diminishing returns so a single hot item can't
/// dominate purely on count.
pub fn frequency_boost(hits: u32) -> f64 {
    let extra = if hits > 0 { (hits - 1) as f64 } else { 0.0 };
    1.0 + (1.0 + extra).log2()
}

/// Combined recency × frequency relevance score.
pub fn recency_score(age_ms: f64, hits: u32, half_life_ms: f64) -> f64 {
    decay(age_ms, half_life_ms) * frequency_boost(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decay_halves_each_half_life() {
        assert!((decay(0.0, 1000.0) - 1.0).abs() < 1e-9);
        assert!((decay(1000.0, 1000.0) - 0.5).abs() < 1e-9);
        assert!((decay(2000.0, 1000.0) - 0.25).abs() < 1e-9);
    }

    #[test]
    fn decay_guards_bad_input() {
        assert!((decay(-5.0, 1000.0) - 1.0).abs() < 1e-9); // negative age clamped to 0
        assert!(decay(10.0, 0.0) > 0.0); // half_life <= 0 must not panic/NaN
        assert!(decay(10.0, -3.0).is_finite());
    }

    #[test]
    fn frequency_boost_is_dampened() {
        assert!((frequency_boost(0) - 1.0).abs() < 1e-9);
        assert!((frequency_boost(1) - 1.0).abs() < 1e-9);
        assert!(frequency_boost(8) > frequency_boost(2));
        assert!(frequency_boost(8) < 8.0); // log2 dampening, not linear
    }

    #[test]
    fn recency_score_combines_both() {
        assert!((recency_score(0.0, 1, 1000.0) - 1.0).abs() < 1e-9);
        assert!((recency_score(1000.0, 1, 1000.0) - 0.5).abs() < 1e-9);
        // fresher outranks older at equal frequency
        assert!(recency_score(0.0, 1, 1000.0) > recency_score(3000.0, 1, 1000.0));
    }
}
