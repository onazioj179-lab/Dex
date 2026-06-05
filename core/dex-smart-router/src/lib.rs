// =============================================================================
// DEX 6.0 — Native Smart Router (GOAL-6A / GOAL-6B)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Rust port of the TypeScript Smart Router (`src/shared/uki/smartRouter.ts` +
//! `modelProfiles.ts`). Pure ranking policy: given a routing goal + task
//! features + candidate models, it returns the model ids best-first for the AI
//! runtime to try in order. It mirrors the TS logic field-for-field so the Tauri
//! native core and the Electron renderer agree — guarded by the parity tests
//! below (the same expectations as `tests/unit/smart-router.test.ts`). This
//! follows the `contenthash.rs` TS→Rust precedent and is the first real module
//! proving the Electron→Tauri migration path.

use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IntelligenceTier {
    Frontier,
    Balanced,
    Fast,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LatencyClass {
    Instant,
    Fast,
    Medium,
    Slow,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ModelProfile {
    pub intelligence_tier: IntelligenceTier,
    pub cost_per_1k_in: f64,
    pub cost_per_1k_out: f64,
    pub latency_class: LatencyClass,
    pub local: bool,
}

impl ModelProfile {
    /// Blended price for cheapest ranking; output is weighted (it dominates cost).
    pub fn blended_cost(&self) -> f64 {
        self.cost_per_1k_in + self.cost_per_1k_out * 2.0
    }
    /// Higher is more capable (smartest goal).
    pub fn intelligence_score(&self) -> u8 {
        match self.intelligence_tier {
            IntelligenceTier::Frontier => 3,
            IntelligenceTier::Balanced => 2,
            IntelligenceTier::Fast => 1,
        }
    }
    /// Higher is faster (fastest goal).
    pub fn latency_score(&self) -> u8 {
        match self.latency_class {
            LatencyClass::Instant => 4,
            LatencyClass::Fast => 3,
            LatencyClass::Medium => 2,
            LatencyClass::Slow => 1,
        }
    }
}

/// Profile for an unknown model id: mid-everything, hosted, non-free.
const DEFAULT_PROFILE: ModelProfile = ModelProfile {
    intelligence_tier: IntelligenceTier::Balanced,
    cost_per_1k_in: 0.001,
    cost_per_1k_out: 0.002,
    latency_class: LatencyClass::Medium,
    local: false,
};

/// Catalog keyed by the same model ids the TS `MODEL_PROFILES` uses. Keep both
/// in lockstep; the parity tests assert the rankings match.
pub fn model_profile(id: &str) -> ModelProfile {
    use IntelligenceTier as I;
    use LatencyClass as L;
    // `Fast` exists in both enums, so variants are qualified to disambiguate.
    let p = |t: IntelligenceTier, ci: f64, co: f64, l: LatencyClass, loc: bool| ModelProfile {
        intelligence_tier: t,
        cost_per_1k_in: ci,
        cost_per_1k_out: co,
        latency_class: l,
        local: loc,
    };
    match id {
        "gpt-4o" => p(I::Frontier, 0.0025, 0.01, L::Medium, false),
        "gpt-4o-mini" => p(I::Fast, 0.00015, 0.0006, L::Fast, false),
        "gpt-4-turbo" => p(I::Frontier, 0.01, 0.03, L::Slow, false),
        "claude-3-5-sonnet-latest" => p(I::Frontier, 0.003, 0.015, L::Medium, false),
        "claude-3-5-haiku-latest" => p(I::Fast, 0.0008, 0.004, L::Fast, false),
        "claude-3-opus-latest" => p(I::Frontier, 0.015, 0.075, L::Slow, false),
        "gemini-1.5-pro" => p(I::Frontier, 0.00125, 0.005, L::Medium, false),
        "gemini-1.5-flash" => p(I::Fast, 0.000075, 0.0003, L::Instant, false),
        "llama3.1" => p(I::Balanced, 0.0, 0.0, L::Medium, true),
        "qwen2.5" => p(I::Balanced, 0.0, 0.0, L::Medium, true),
        "mistral" => p(I::Fast, 0.0, 0.0, L::Fast, true),
        "openai/gpt-4o" => p(I::Frontier, 0.0025, 0.01, L::Medium, false),
        "anthropic/claude-3.5-sonnet" => p(I::Frontier, 0.003, 0.015, L::Medium, false),
        "meta-llama/llama-3.1-70b-instruct" => p(I::Balanced, 0.0003, 0.0003, L::Fast, false),
        _ => DEFAULT_PROFILE,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoutingGoal {
    Auto,
    Cheapest,
    Fastest,
    Smartest,
    Offline,
}

impl RoutingGoal {
    /// Parse a goal id (anything unrecognised falls back to `Auto`).
    pub fn parse(s: &str) -> RoutingGoal {
        match s {
            "cheapest" => RoutingGoal::Cheapest,
            "fastest" => RoutingGoal::Fastest,
            "smartest" => RoutingGoal::Smartest,
            "offline" => RoutingGoal::Offline,
            _ => RoutingGoal::Auto,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskFeatures {
    pub needs_vision: bool,
    pub needs_tools: bool,
    pub is_code: bool,
    pub is_long_context: bool,
    pub estimated_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteCandidate {
    pub id: String,
    pub context_window: u32,
    pub vision: bool,
    pub tools: bool,
}

const LONG_CONTEXT_TOKENS: u32 = 8000;

/// ~4 chars/token heuristic, matching `contextFit.ts::estimateTokens`.
pub fn estimate_tokens(text: &str) -> u32 {
    if text.is_empty() {
        0
    } else {
        (text.chars().count() as f64 / 4.0).ceil() as u32
    }
}

/// Classify a prompt into routing features (fast substring heuristic, pure).
pub fn classify_task(prompt: &str) -> TaskFeatures {
    let lower = prompt.to_lowercase();
    let any = |needles: &[&str]| needles.iter().any(|n| lower.contains(n));
    let estimated = estimate_tokens(prompt);
    TaskFeatures {
        needs_vision: any(&[
            "image", "screenshot", "photo", "picture", "diagram", "chart", "scan", "ocr",
        ]),
        needs_tools: any(&[
            "search the web", "browse", "run this", "execute", "call the api", "fetch the",
            "look up online",
        ]),
        is_code: prompt.contains("```")
            || any(&[
                "function", "const ", "class ", "def ", "import ", "#include", "stack trace",
                "traceback", "compile", "refactor", "segfault", "null pointer",
            ]),
        is_long_context: estimated > LONG_CONTEXT_TOKENS,
        estimated_tokens: estimated,
    }
}

/// Drop candidates that cannot satisfy the task; never strands the caller.
fn filter_capable(task: &TaskFeatures, candidates: &[RouteCandidate]) -> Vec<RouteCandidate> {
    let capable: Vec<RouteCandidate> = candidates
        .iter()
        .filter(|c| {
            if task.needs_vision && !c.vision {
                return false;
            }
            if task.needs_tools && !c.tools {
                return false;
            }
            if c.context_window < task.estimated_tokens {
                return false;
            }
            true
        })
        .cloned()
        .collect();
    if !capable.is_empty() {
        return capable;
    }
    let ctx_only: Vec<RouteCandidate> = candidates
        .iter()
        .filter(|c| c.context_window >= task.estimated_tokens)
        .cloned()
        .collect();
    if !ctx_only.is_empty() {
        ctx_only
    } else {
        candidates.to_vec()
    }
}

fn cmp_cheapest(a: &RouteCandidate, b: &RouteCandidate) -> Ordering {
    model_profile(&a.id)
        .blended_cost()
        .partial_cmp(&model_profile(&b.id).blended_cost())
        .unwrap_or(Ordering::Equal)
}
fn cmp_fastest(a: &RouteCandidate, b: &RouteCandidate) -> Ordering {
    model_profile(&b.id)
        .latency_score()
        .cmp(&model_profile(&a.id).latency_score())
}
fn cmp_smartest(a: &RouteCandidate, b: &RouteCandidate) -> Ordering {
    model_profile(&b.id)
        .intelligence_score()
        .cmp(&model_profile(&a.id).intelligence_score())
}

/// Stable rank: primary comparator, ties broken by secondary, then input order.
fn rank_by(
    candidates: Vec<RouteCandidate>,
    primary: fn(&RouteCandidate, &RouteCandidate) -> Ordering,
    secondary: fn(&RouteCandidate, &RouteCandidate) -> Ordering,
) -> Vec<String> {
    let mut indexed: Vec<(usize, RouteCandidate)> = candidates.into_iter().enumerate().collect();
    indexed.sort_by(|(ia, a), (ib, b)| {
        primary(a, b)
            .then_with(|| secondary(a, b))
            .then_with(|| ia.cmp(ib))
    });
    indexed.into_iter().map(|(_, c)| c.id).collect()
}

/// Rank candidate models for a goal + task — model ids best-first. `Offline`
/// keeps only on-device models (empty if none). Mirrors `routeModels` in TS.
pub fn route_models(
    goal: RoutingGoal,
    task: &TaskFeatures,
    candidates: &[RouteCandidate],
) -> Vec<String> {
    if candidates.is_empty() {
        return Vec::new();
    }

    if goal == RoutingGoal::Offline {
        let local: Vec<RouteCandidate> = candidates
            .iter()
            .filter(|c| model_profile(&c.id).local)
            .cloned()
            .collect();
        if local.is_empty() {
            return Vec::new();
        }
        return rank_by(filter_capable(task, &local), cmp_smartest, cmp_fastest);
    }

    let capable = filter_capable(task, candidates);
    match goal {
        RoutingGoal::Cheapest => rank_by(capable, cmp_cheapest, cmp_fastest),
        RoutingGoal::Fastest => rank_by(capable, cmp_fastest, cmp_cheapest),
        RoutingGoal::Smartest => rank_by(capable, cmp_smartest, cmp_cheapest),
        RoutingGoal::Auto => {
            let hard = task.is_code || task.is_long_context || task.needs_tools;
            if hard {
                rank_by(capable, cmp_smartest, cmp_cheapest)
            } else {
                rank_by(capable, cmp_cheapest, cmp_fastest)
            }
        }
        RoutingGoal::Offline => unreachable!("handled above"),
    }
}

/// Convenience for the Tauri command: classify `user_text` then route.
pub fn route_for_prompt(
    goal: RoutingGoal,
    user_text: &str,
    candidates: &[RouteCandidate],
) -> Vec<String> {
    route_models(goal, &classify_task(user_text), candidates)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cand(id: &str, ctx: u32, vision: bool, tools: bool) -> RouteCandidate {
        RouteCandidate { id: id.into(), context_window: ctx, vision, tools }
    }
    fn easy() -> TaskFeatures {
        classify_task("what time is it?")
    }

    fn all() -> Vec<RouteCandidate> {
        vec![
            cand("gpt-4o", 128000, true, true),
            cand("gpt-4o-mini", 128000, true, true),
            cand("claude-3-5-sonnet-latest", 200000, true, true),
            cand("claude-3-5-haiku-latest", 200000, false, true),
            cand("gemini-1.5-flash", 1000000, true, true),
            cand("llama3.1", 128000, false, true),
        ]
    }

    #[test]
    fn classify_detects_code_vision_and_long_context() {
        assert!(classify_task("please refactor this ```js\nconst x=1\n```").is_code);
        assert!(classify_task("describe this screenshot").needs_vision);
        assert!(classify_task(&"x".repeat(40000)).is_long_context);
        let plain = classify_task("what is the capital of France?");
        assert!(!(plain.is_code || plain.needs_vision || plain.is_long_context));
    }

    #[test]
    fn cheapest_prefers_free_local_then_cheap_hosted() {
        assert_eq!(route_models(RoutingGoal::Cheapest, &easy(), &all())[0], "llama3.1");
        let hosted = vec![
            cand("gpt-4o", 128000, true, true),
            cand("gpt-4o-mini", 128000, true, true),
            cand("claude-3-5-sonnet-latest", 200000, true, true),
        ];
        assert_eq!(route_models(RoutingGoal::Cheapest, &easy(), &hosted)[0], "gpt-4o-mini");
    }

    #[test]
    fn smartest_and_fastest_pick_expected_heads() {
        let smart = route_models(
            RoutingGoal::Smartest,
            &easy(),
            &[cand("claude-3-5-haiku-latest", 200000, false, true), cand("gpt-4o", 128000, true, true)],
        );
        assert_eq!(smart[0], "gpt-4o");
        let fast = route_models(
            RoutingGoal::Fastest,
            &easy(),
            &[cand("gpt-4o", 128000, true, true), cand("gemini-1.5-flash", 1000000, true, true)],
        );
        assert_eq!(fast[0], "gemini-1.5-flash");
    }

    #[test]
    fn offline_keeps_only_local() {
        assert_eq!(route_models(RoutingGoal::Offline, &easy(), &all()), vec!["llama3.1"]);
        assert!(route_models(
            RoutingGoal::Offline,
            &easy(),
            &[cand("gpt-4o", 128000, true, true)]
        )
        .is_empty());
    }

    #[test]
    fn vision_task_drops_non_vision_models() {
        let vision = classify_task("what is in this image?");
        let r = route_models(
            RoutingGoal::Smartest,
            &vision,
            &[cand("claude-3-5-haiku-latest", 200000, false, true), cand("gpt-4o", 128000, true, true)],
        );
        assert_eq!(r, vec!["gpt-4o"]);
    }

    #[test]
    fn context_too_small_is_dropped() {
        let big = classify_task(&"x".repeat(800000)); // ~200k tokens
        let r = route_models(
            RoutingGoal::Smartest,
            &big,
            &[cand("gpt-4o", 128000, true, true), cand("gemini-1.5-flash", 1000000, true, true)],
        );
        assert_eq!(r, vec!["gemini-1.5-flash"]);
    }

    #[test]
    fn auto_favours_frontier_for_code_and_cheap_for_easy() {
        let code = classify_task("refactor this ```ts\nfunction f(){}\n```");
        assert_eq!(
            route_models(RoutingGoal::Auto, &code, &[cand("gpt-4o-mini", 128000, true, true), cand("gpt-4o", 128000, true, true)])[0],
            "gpt-4o"
        );
        assert_eq!(
            route_models(RoutingGoal::Auto, &easy(), &[cand("gpt-4o", 128000, true, true), cand("gpt-4o-mini", 128000, true, true)])[0],
            "gpt-4o-mini"
        );
    }

    #[test]
    fn ranking_is_complete_and_unique() {
        let r = route_models(RoutingGoal::Smartest, &easy(), &all());
        assert_eq!(r.len(), all().len());
        let mut sorted = r.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), r.len());
    }

    #[test]
    fn candidates_deserialize_from_camelcase_json() {
        // The renderer sends camelCase keys (contextWindow); ensure they bind.
        let c: RouteCandidate =
            serde_json::from_str(r#"{"id":"gpt-4o","contextWindow":128000,"vision":true,"tools":true}"#)
                .unwrap();
        assert_eq!(c.context_window, 128000);
        assert_eq!(c.id, "gpt-4o");
    }

    #[test]
    fn goal_parses_with_auto_fallback() {
        assert_eq!(RoutingGoal::parse("smartest"), RoutingGoal::Smartest);
        assert_eq!(RoutingGoal::parse("nonsense"), RoutingGoal::Auto);
    }
}
