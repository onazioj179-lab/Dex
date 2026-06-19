// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  SKILL_PACKS,
  relevantSkillPacks,
  formatSkillPacksForPrompt,
  type SkillPack,
} from '../../src/renderer/uki/skillPacks';

const byId = (id: string): SkillPack => {
  const pack = SKILL_PACKS.find((p) => p.id === id);
  if (!pack) throw new Error(`missing skill pack: ${id}`);
  return pack;
};

describe('relevantSkillPacks', () => {
  it('selects by active Project Space kind', () => {
    const r = relevantSkillPacks({ activeKind: 'development' });
    expect(r[0]?.id).toBe('developer');
  });

  it('ranks the kind match ahead of an app-only match', () => {
    // audio kind => music pack; dexcode open => developer pack (app-only).
    const r = relevantSkillPacks({ activeKind: 'audio', openApps: ['dexcode'] });
    expect(r.map((p) => p.id)).toEqual(['music', 'developer']);
  });

  it('selects by an open app when no kind is given', () => {
    const r = relevantSkillPacks({ openApps: ['imosion'] });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('music');
  });

  it('matches video on the videoeditor app id', () => {
    const r = relevantSkillPacks({ openApps: ['videoeditor'] });
    expect(r[0]?.id).toBe('video');
  });

  it('returns [] when there is no signal', () => {
    expect(relevantSkillPacks({})).toEqual([]);
    expect(relevantSkillPacks({ openApps: [] })).toEqual([]);
    expect(relevantSkillPacks({ activeKind: 'general' })).toEqual([]);
    expect(relevantSkillPacks({ openApps: ['unknown-app'] })).toEqual([]);
  });

  it('dedupes when the kind and an open app point at the same pack', () => {
    const r = relevantSkillPacks({ activeKind: 'development', openApps: ['dexcode'] });
    expect(r.filter((p) => p.id === 'developer')).toHaveLength(1);
    expect(r).toHaveLength(1);
  });

  it('is deterministic for repeated calls', () => {
    const input = { activeKind: 'research', openApps: ['notes', 'browser'] };
    expect(relevantSkillPacks(input)).toEqual(relevantSkillPacks(input));
  });
});

describe('formatSkillPacksForPrompt', () => {
  it('produces a bounded, non-empty line for a pack', () => {
    const out = formatSkillPacksForPrompt([byId('developer')]);
    expect(out).toContain('Developer skills available:');
    expect(out).toContain('Git Assistant');
    expect(out.length).toBeGreaterThan(0);
    // One pack => one line (no extra newlines).
    expect(out.split('\n')).toHaveLength(1);
  });

  it('renders one line per pack', () => {
    const out = formatSkillPacksForPrompt([byId('developer'), byId('music')]);
    expect(out.split('\n')).toHaveLength(2);
  });

  it("returns '' for an empty list", () => {
    expect(formatSkillPacksForPrompt([])).toBe('');
  });
});
