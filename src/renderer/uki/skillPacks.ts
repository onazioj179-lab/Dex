// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Agent Skill Packs (DEX 5.6 Priority 1) — pure data + selection logic.
 *
 * A "skill pack" is a bundle of domain-specific assistant skills (e.g. Git /
 * Refactor / Debug for development) that UKI should surface when the active
 * Project Space or the set of open apps signals that kind of work. This module
 * is dependency-light on purpose: no React, no DOM, no store imports beyond the
 * `StageKind` type. Callers (the UKI prompt builder) decide relevance at the
 * moment they need it and fold the result into the system prompt.
 *
 * Selection is deterministic and pure so it can be unit-tested in isolation and
 * produces a stable, token-bounded prompt fragment.
 */

import type { StageKind } from '../store/stageStore';

/** A single assistant skill within a pack. `hint` is the natural-language phrase
 *  UKI can fold into its reasoning about what the skill does. */
export interface SkillPackSkill {
  label: string;
  hint: string;
}

/** A domain bundle of skills, gated on Project Space kind and/or open apps. */
export interface SkillPack {
  id: string;
  label: string;
  /** Project Space kinds this pack is relevant to. */
  kinds: StageKind[];
  /** App ids whose presence also makes this pack relevant. */
  apps: string[];
  skills: SkillPackSkill[];
}

/**
 * The catalog of skill packs. Single source of truth so the prompt builder and
 * tests describe a pack identically. App ids match the real app registry
 * (see store/appSubsystem.ts and uki/knowledge.ts).
 */
export const SKILL_PACKS: SkillPack[] = [
  {
    id: 'developer',
    label: 'Developer',
    kinds: ['development'],
    apps: ['dexcode'],
    skills: [
      { label: 'Git Assistant', hint: 'stage, commit, branch, and review diffs' },
      { label: 'Refactor Assistant', hint: 'restructure and clean up code safely' },
      { label: 'Debug Assistant', hint: 'trace, reproduce, and fix defects' },
    ],
  },
  {
    id: 'music',
    label: 'Music Production',
    kinds: ['audio'],
    apps: ['imosion'],
    skills: [
      { label: 'Chord Assistant', hint: 'suggest progressions and voicings' },
      { label: 'Arrangement Assistant', hint: 'structure sections and transitions' },
      { label: 'Mixing Assistant', hint: 'balance levels, EQ, and dynamics' },
    ],
  },
  {
    id: 'video',
    label: 'Video Production',
    kinds: ['video'],
    apps: ['videoeditor'],
    skills: [
      { label: 'Caption Assistant', hint: 'generate and time captions' },
      { label: 'Export Assistant', hint: 'pick codecs, presets, and targets' },
      { label: 'Timeline Assistant', hint: 'cut, sequence, and pace clips' },
    ],
  },
  {
    id: 'design',
    label: 'Design',
    kinds: ['design'],
    apps: ['prism', 'axl'],
    skills: [
      { label: 'Layout Assistant', hint: 'compose grids, spacing, and hierarchy' },
      { label: 'Color Assistant', hint: 'build palettes and check contrast' },
      { label: 'Asset Assistant', hint: 'prepare and export visual assets' },
    ],
  },
  {
    id: 'research',
    label: 'Research',
    kinds: ['research'],
    apps: ['browser', 'notes'],
    skills: [
      { label: 'Summarize Assistant', hint: 'condense sources into key points' },
      { label: 'Cite Assistant', hint: 'capture and format references' },
      { label: 'Outline Assistant', hint: 'organize findings into a structure' },
    ],
  },
];

/**
 * Return the skill packs relevant to the current signal, ranked and deduped.
 *
 * A pack is relevant when its `kinds` includes `activeKind` (a strong, kind-level
 * match) OR when its `apps` intersect `openApps` (a weaker, app-level signal).
 * Kind matches rank ahead of app-only matches; ties preserve catalog order.
 * Pure and deterministic — same input always yields the same output.
 */
export function relevantSkillPacks(input: {
  activeKind?: string;
  openApps?: readonly string[];
}): SkillPack[] {
  const { activeKind, openApps } = input;
  const open = openApps && openApps.length ? new Set(openApps) : null;

  const kindMatches: SkillPack[] = [];
  const appMatches: SkillPack[] = [];

  for (const pack of SKILL_PACKS) {
    const byKind = activeKind != null && (pack.kinds as string[]).includes(activeKind);
    if (byKind) {
      kindMatches.push(pack);
      continue;
    }
    const byApp = open != null && pack.apps.some((a) => open.has(a));
    if (byApp) appMatches.push(pack);
  }

  // Kind matches first, then app-only matches; both already in catalog order, so
  // the concatenation is deduped by construction (a pack lands in one bucket).
  return [...kindMatches, ...appMatches];
}

/**
 * Render a compact, token-bounded one-line-per-pack summary for the prompt, e.g.
 * "Developer skills available: Git Assistant, Refactor Assistant, Debug Assistant."
 * Returns '' for an empty list so callers can skip the block entirely.
 */
export function formatSkillPacksForPrompt(packs: SkillPack[]): string {
  if (!packs.length) return '';
  return packs
    .map((p) => `${p.label} skills available: ${p.skills.map((s) => s.label).join(', ')}.`)
    .join('\n');
}
