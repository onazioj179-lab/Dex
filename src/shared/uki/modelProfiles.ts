// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Model capability/cost/latency catalog — the data the Smart Router (UKI 2.0)
 * ranks on. The provider `ModelInfo` (registry) only carries `contextWindow` +
 * capability flags; routing additionally needs each model's **cost**, **latency
 * class** and **intelligence tier**. This is that missing layer: a static, pure
 * catalog keyed by the same model ids the providers expose, with a neutral
 * default for ids we don't know yet (e.g. a new Ollama model the daemon reports
 * at runtime). No DOM, no IO — fully testable.
 *
 * Costs are approximate USD per 1K tokens used only for **relative** ranking
 * (cheapest-first); they are not billing-accurate. Local models cost 0.
 */

export type IntelligenceTier = 'frontier' | 'balanced' | 'fast';
export type LatencyClass = 'instant' | 'fast' | 'medium' | 'slow';

export interface ModelProfile {
  intelligenceTier: IntelligenceTier;
  /** Approx. USD per 1K input tokens (relative ranking only). */
  costPer1kIn: number;
  /** Approx. USD per 1K output tokens (relative ranking only). */
  costPer1kOut: number;
  latencyClass: LatencyClass;
  /** Runs on-device (no network, no per-token cost). */
  local: boolean;
}

/** Catalog keyed by the model ids the providers advertise (see registry.ts). */
export const MODEL_PROFILES: Record<string, ModelProfile> = {
  // OpenAI
  'gpt-4o':      { intelligenceTier: 'frontier', costPer1kIn: 0.0025,  costPer1kOut: 0.01,   latencyClass: 'medium',  local: false },
  'gpt-4o-mini': { intelligenceTier: 'fast',     costPer1kIn: 0.00015, costPer1kOut: 0.0006, latencyClass: 'fast',    local: false },
  'gpt-4-turbo': { intelligenceTier: 'frontier', costPer1kIn: 0.01,    costPer1kOut: 0.03,   latencyClass: 'slow',    local: false },
  // Anthropic
  'claude-3-5-sonnet-latest': { intelligenceTier: 'frontier', costPer1kIn: 0.003,  costPer1kOut: 0.015, latencyClass: 'medium', local: false },
  'claude-3-5-haiku-latest':  { intelligenceTier: 'fast',     costPer1kIn: 0.0008, costPer1kOut: 0.004, latencyClass: 'fast',   local: false },
  'claude-3-opus-latest':     { intelligenceTier: 'frontier', costPer1kIn: 0.015,  costPer1kOut: 0.075, latencyClass: 'slow',   local: false },
  // Google
  'gemini-1.5-pro':   { intelligenceTier: 'frontier', costPer1kIn: 0.00125,  costPer1kOut: 0.005,  latencyClass: 'medium',  local: false },
  'gemini-1.5-flash': { intelligenceTier: 'fast',     costPer1kIn: 0.000075, costPer1kOut: 0.0003, latencyClass: 'instant', local: false },
  // Ollama (on-device, no key, no per-token cost)
  'llama3.1': { intelligenceTier: 'balanced', costPer1kIn: 0, costPer1kOut: 0, latencyClass: 'medium', local: true },
  'qwen2.5':  { intelligenceTier: 'balanced', costPer1kIn: 0, costPer1kOut: 0, latencyClass: 'medium', local: true },
  'mistral':  { intelligenceTier: 'fast',     costPer1kIn: 0, costPer1kOut: 0, latencyClass: 'fast',   local: true },
  // OpenRouter (aggregator — OpenAI-compatible ids)
  'openai/gpt-4o':                     { intelligenceTier: 'frontier', costPer1kIn: 0.0025, costPer1kOut: 0.01,   latencyClass: 'medium', local: false },
  'anthropic/claude-3.5-sonnet':       { intelligenceTier: 'frontier', costPer1kIn: 0.003,  costPer1kOut: 0.015,  latencyClass: 'medium', local: false },
  'meta-llama/llama-3.1-70b-instruct': { intelligenceTier: 'balanced', costPer1kIn: 0.0003, costPer1kOut: 0.0003, latencyClass: 'fast',   local: false },
};

/** Profile for an unknown model id: mid-everything, hosted, non-free. */
export const DEFAULT_PROFILE: ModelProfile = {
  intelligenceTier: 'balanced', costPer1kIn: 0.001, costPer1kOut: 0.002, latencyClass: 'medium', local: false,
};

/** Resolve a model id to its profile (or a neutral default for unknown ids). */
export function getModelProfile(modelId: string): ModelProfile {
  return MODEL_PROFILES[modelId] ?? DEFAULT_PROFILE;
}

/** Numeric "smartness" — higher is more capable (used by the smartest goal). */
export const INTELLIGENCE_SCORE: Record<IntelligenceTier, number> = { frontier: 3, balanced: 2, fast: 1 };
/** Numeric speed — higher is faster (used by the fastest goal). */
export const LATENCY_SCORE: Record<LatencyClass, number> = { instant: 4, fast: 3, medium: 2, slow: 1 };

/** Blended price for cheapest ranking; output is weighted (it dominates real cost). */
export function blendedCost(p: ModelProfile): number {
  return p.costPer1kIn + p.costPer1kOut * 2;
}
