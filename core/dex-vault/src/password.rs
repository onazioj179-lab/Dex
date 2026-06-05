// =============================================================================
// DEX 6.0 — Vault Password Tools (GOAL-6B)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Random password generation + a strength heuristic (score 0..=4, label,
//! actionable suggestions). Shape mirrors the Electron vault contract.

use rand::seq::SliceRandom;

pub struct GenOptions {
    pub length: usize,
    pub lowercase: bool,
    pub uppercase: bool,
    pub numbers: bool,
    pub symbols: bool,
}

impl Default for GenOptions {
    fn default() -> Self {
        Self { length: 20, lowercase: true, uppercase: true, numbers: true, symbols: true }
    }
}

const SYMBOLS: &str = "!@#$%^&*()-_=+[]{}";

/// Generate a random password from the selected character classes.
pub fn generate(opts: &GenOptions) -> String {
    let mut pool: Vec<char> = Vec::new();
    if opts.lowercase {
        pool.extend('a'..='z');
    }
    if opts.uppercase {
        pool.extend('A'..='Z');
    }
    if opts.numbers {
        pool.extend('0'..='9');
    }
    if opts.symbols {
        pool.extend(SYMBOLS.chars());
    }
    if pool.is_empty() {
        pool.extend('a'..='z');
    }
    let mut rng = rand::thread_rng();
    let len = opts.length.clamp(4, 256);
    (0..len).map(|_| *pool.choose(&mut rng).unwrap()).collect()
}

/// Assess password strength. Returns (score 0..=4, label, suggestions).
pub fn assess_strength(password: &str) -> (u8, String, Vec<String>) {
    let len = password.chars().count();
    let has_lower = password.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = password.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    let has_symbol = password.chars().any(|c| !c.is_alphanumeric() && !c.is_whitespace());
    let classes = [has_lower, has_upper, has_digit, has_symbol]
        .iter()
        .filter(|&&b| b)
        .count();

    let mut score: i32 = 0;
    if len >= 8 {
        score += 1;
    }
    if len >= 12 {
        score += 1;
    }
    if len >= 16 {
        score += 1;
    }
    if classes >= 3 {
        score += 1;
    }
    if classes == 4 && len >= 12 {
        score += 1;
    }
    if len < 6 {
        score = 0;
    }
    let score = score.clamp(0, 4) as u8;

    let mut suggestions = Vec::new();
    if len < 12 {
        suggestions.push("Use at least 12 characters".to_string());
    }
    if !has_upper || !has_lower {
        suggestions.push("Mix upper and lower case".to_string());
    }
    if !has_digit {
        suggestions.push("Add numbers".to_string());
    }
    if !has_symbol {
        suggestions.push("Add symbols".to_string());
    }

    let label = match score {
        0 => "Very Weak",
        1 => "Weak",
        2 => "Fair",
        3 => "Strong",
        _ => "Very Strong",
    }
    .to_string();

    (score, label, suggestions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_requested_length_and_pool() {
        let opts = GenOptions { length: 24, symbols: false, ..Default::default() };
        let pw = generate(&opts);
        assert_eq!(pw.chars().count(), 24);
        assert!(pw.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn strength_ranks_weak_below_strong() {
        let (weak, _, _) = assess_strength("abc");
        let (strong, label, _) = assess_strength("Tr0ub4dour&3xtra-Long!");
        assert!(weak < strong);
        assert_eq!(label, "Very Strong");
    }

    #[test]
    fn strength_suggests_improvements_for_weak() {
        let (_, _, suggestions) = assess_strength("password");
        assert!(!suggestions.is_empty());
    }
}
