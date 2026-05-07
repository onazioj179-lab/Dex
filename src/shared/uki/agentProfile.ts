// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Agent persona profiles + determinism config.
 */

// DEX v3.8.9 - agent profiles + determinism

export interface AgentProfile {
  id: string;
  label: string;
  systemPreamble: string;
  temperature: number;
  topP: number;
  /** Soft hint for max output tokens. */
  maxOutputTokens: number;
  /** Suggested toolset (ids only). */
  toolset: string[];
}

export const AGENT_PROFILES: Record<string, AgentProfile> = {
  researcher: {
    id: 'researcher',
    label: 'Researcher',
    systemPreamble: 'You are a careful researcher. Cite sources. Prefer accuracy over speed.',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 1500,
    toolset: ['web.search', 'web.fetch', 'note.lookup'],
  },
  writer: {
    id: 'writer',
    label: 'Writer',
    systemPreamble: 'You are a clear, concise writer. Match the requested tone.',
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 1200,
    toolset: ['note.lookup'],
  },
  coder: {
    id: 'coder',
    label: 'Coder',
    systemPreamble: 'You write minimal, correct code. Explain only when asked.',
    temperature: 0.1,
    topP: 0.9,
    maxOutputTokens: 1800,
    toolset: ['code.read', 'code.search', 'code.edit'],
  },
  planner: {
    id: 'planner',
    label: 'Planner',
    systemPreamble: 'You break work into ordered, testable steps with clear owners.',
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: 1000,
    toolset: ['note.lookup'],
  },
};

export interface DeterministicConfig {
  seed: number;
  temperature: 0;
  topP: 1;
}

/** Pin the model so the same prompt yields the same output. */
export function pinSeed(seed: number): DeterministicConfig {
  return { seed, temperature: 0, topP: 1 };
}

/** Fold a deterministic config into an agent profile. */
export function applyDeterministic(profile: AgentProfile, det: DeterministicConfig): AgentProfile & { seed: number } {
  return { ...profile, temperature: det.temperature, topP: det.topP, seed: det.seed };
}
