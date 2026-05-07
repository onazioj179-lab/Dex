// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform - test
// =============================================================================
// Tests for per-app UKI skill bundles. Verifies each bundle has the
// expected skill ids, intent matchers fire, appId scoping works, and the
// aggregate registry deduplicates by id.

import { describe, it, expect } from 'vitest';
import {
  dexCodeSkills, terminalSkills, notesSkills, forgeSkills, vinxSkills,
  prismSkills, fluxSkills, imosionSkills, axlSkills, rewindSkills,
  gallerySkills, loadAppSkillRegistry, totalSkillCount, type AppBundleId,
} from '../../src/shared/uki/appSkills';
import { matchSkills } from '../../src/shared/uki/skills';

describe('appSkills bundles - id presence', () => {
  it('dexcode exposes 5 skills', () => {
    const ids = dexCodeSkills().skills.map((s) => s.id).sort();
    expect(ids).toEqual([
      'dexcode.docstring', 'dexcode.explain', 'dexcode.fixError',
      'dexcode.generateTest', 'dexcode.refactor',
    ]);
  });
  it('terminal exposes 4 skills', () => {
    expect(terminalSkills().skills.map((s) => s.id).sort()).toEqual([
      'terminal.explain', 'terminal.fixStderr', 'terminal.nlToCommand', 'terminal.searchHistory',
    ]);
  });
  it('notes exposes 4 skills', () => {
    expect(notesSkills().skills.map((s) => s.id).sort()).toEqual([
      'notes.bulletize', 'notes.rewriteTone', 'notes.semanticSearch', 'notes.summarize',
    ]);
  });
  it('forge exposes 4 skills', () => {
    expect(forgeSkills().skills).toHaveLength(4);
  });
  it('vinx exposes 3 skills', () => {
    expect(vinxSkills().skills).toHaveLength(3);
  });
  it('prism exposes 4 skills', () => {
    expect(prismSkills().skills).toHaveLength(4);
  });
  it('flux exposes 3 skills', () => {
    expect(fluxSkills().skills).toHaveLength(3);
  });
  it('imosion exposes 4 skills', () => {
    expect(imosionSkills().skills).toHaveLength(4);
  });
  it('axl exposes 3 skills', () => {
    expect(axlSkills().skills).toHaveLength(3);
  });
  it('rewind exposes 3 skills', () => {
    expect(rewindSkills().skills).toHaveLength(3);
  });
  it('gallery exposes 4 skills', () => {
    expect(gallerySkills().skills).toHaveLength(4);
  });
});

describe('appSkills - intent matching', () => {
  it('dexcode.fixError matches "fix error" with appId scope', () => {
    const r = dexCodeSkills();
    const ranked = matchSkills('fix error', r, { appId: 'dexcode', facts: { errorText: 'NPE' } });
    expect(ranked[0].skill.id).toBe('dexcode.fixError');
  });
  it('appId scope excludes wrong-app skills', () => {
    const r = dexCodeSkills();
    const ranked = matchSkills('explain', r, { appId: 'gallery', facts: { selectionText: 'x' } });
    expect(ranked).toEqual([]);
  });
  it('terminal.nlToCommand matches "how do i" intent', () => {
    const r = terminalSkills();
    const ranked = matchSkills('how do i list files', r, { appId: 'terminal' });
    expect(ranked[0].skill.id).toBe('terminal.nlToCommand');
  });
  it('notes skills accept dexnotes appId alias', () => {
    const r = notesSkills();
    const ranked = matchSkills('summarize', r, { appId: 'dexnotes', facts: { noteId: 'n1' } });
    expect(ranked[0].skill.id).toBe('notes.summarize');
  });
});

describe('appSkills - required context', () => {
  it('dexcode.docstring needs selectionText', () => {
    const r = dexCodeSkills();
    const without = matchSkills('docstring', r, { appId: 'dexcode' });
    expect(without[0].missingContext).toContain('selectionText');
    const withCtx = matchSkills('docstring', r, { appId: 'dexcode', facts: { selectionText: 'x' } });
    expect(withCtx[0].missingContext).toEqual([]);
  });
  it('prism.colorMatch needs both layer and reference', () => {
    const r = prismSkills();
    const partial = matchSkills('color match', r, { appId: 'prism', facts: { layerId: 'l1' } });
    expect(partial[0].missingContext).toEqual(['referenceLayerId']);
  });
});

describe('appSkills - aggregator', () => {
  it('loadAppSkillRegistry without args loads everything', () => {
    const r = loadAppSkillRegistry();
    expect(r.skills.length).toBeGreaterThanOrEqual(40);
  });
  it('loadAppSkillRegistry with subset only includes those bundles', () => {
    const r = loadAppSkillRegistry(['dexcode', 'gallery'] as AppBundleId[]);
    const ids = r.skills.map((s) => s.id);
    expect(ids.every((id) => id.startsWith('dexcode.') || id.startsWith('gallery.'))).toBe(true);
  });
  it('totalSkillCount equals dedup unique ids', () => {
    const r = loadAppSkillRegistry();
    const ids = new Set(r.skills.map((s) => s.id));
    expect(totalSkillCount()).toBe(ids.size);
  });
  it('all skill ids are unique across bundles', () => {
    const r = loadAppSkillRegistry();
    const ids = r.skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every skill has at least one plan step', () => {
    const r = loadAppSkillRegistry();
    for (const s of r.skills) {
      expect(s.plan.steps.length).toBeGreaterThan(0);
      for (const step of s.plan.steps) expect(step.actionId).toBeTruthy();
    }
  });
  it('every skill declares at least one appId', () => {
    const r = loadAppSkillRegistry();
    for (const s of r.skills) {
      expect(s.appIds && s.appIds.length).toBeGreaterThan(0);
    }
  });
});
