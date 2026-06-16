// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  osaDistance,
  tokenSimilarity,
  normalizeQuery,
  scoreCommand,
  resolveCommands,
  bestResolution,
  type ResolvableCommand,
} from '../../src/shared/commands/resolve';

describe('osaDistance', () => {
  it('counts an adjacent transposition as a single edit', () => {
    expect(osaDistance('noets', 'notes', 2)).toBe(1);
  });
  it('counts insert / delete / substitute as one edit each', () => {
    expect(osaDistance('opn', 'open', 2)).toBe(1);        // insertion
    expect(osaDistance('calculater', 'calculator', 2)).toBe(1); // substitution
    expect(osaDistance('terminall', 'terminal', 2)).toBe(1);    // deletion
  });
  it('bails out (max+1) once the budget is exceeded', () => {
    expect(osaDistance('asdfqwer', 'notes', 2)).toBe(3);
  });
  it('is zero for identical strings', () => {
    expect(osaDistance('notes', 'notes', 2)).toBe(0);
  });
});

describe('tokenSimilarity', () => {
  it('is 1 for an exact token', () => {
    expect(tokenSimilarity('notes', 'notes')).toBe(1);
  });
  it('rewards a typed prefix', () => {
    expect(tokenSimilarity('term', 'terminal')).toBeGreaterThan(0.7);
    expect(tokenSimilarity('calc', 'calculator')).toBeGreaterThan(0.7);
  });
  it('tolerates a single typo', () => {
    expect(tokenSimilarity('noets', 'notes')).toBeGreaterThan(0.5);
  });
  it('does not fuzz tiny tokens (collision-prone)', () => {
    expect(tokenSimilarity('ab', 'on')).toBe(0);
  });
  it('rejects unrelated tokens', () => {
    expect(tokenSimilarity('asdfqwer', 'notes')).toBe(0);
  });
});

describe('normalizeQuery', () => {
  it('lowercases, folds punctuation, and collapses whitespace', () => {
    expect(normalizeQuery('  Open   Notes!! ')).toBe('open notes');
  });
});

// A small, representative catalog (mix of app + action commands).
const CMDS: ResolvableCommand[] = [
  { id: 'app.notes', label: 'Open Notes', terminal: 'notes', appId: 'notes',
    keywords: ['Notes', 'productivity'], uki: ['open notes', 'launch notes', 'go to notes'] },
  { id: 'app.calculator', label: 'Open Calculator', terminal: 'calculator', appId: 'calculator',
    keywords: ['Calculator', 'utility'], uki: ['open calculator', 'launch calculator'] },
  { id: 'window.split', label: 'Split Screen', terminal: 'split',
    keywords: ['split', 'columns'], uki: ['split screen', 'side by side'] },
  { id: 'window.tileLeft', label: 'Tile Window Left', terminal: 'left',
    keywords: ['snap', 'tile', 'left'], uki: ['snap left', 'tile left'] },
  { id: 'nav.back', label: 'Navigate Back', terminal: 'back',
    keywords: ['back', 'previous'], uki: ['go back'] },
];

describe('scoreCommand', () => {
  const notes = CMDS[0];
  it('scores an exact phrase as effectively certain', () => {
    expect(scoreCommand(notes, 'open notes').score).toBeGreaterThanOrEqual(0.95);
  });
  it('scores an exact CLI alias as certain', () => {
    expect(scoreCommand(notes, 'notes').score).toBeGreaterThanOrEqual(0.95);
  });
  it('does not let a generic verb alone anchor any command', () => {
    // "open" prefixes every app phrase; alone it must stay ambiguous (no match).
    expect(scoreCommand(notes, 'open').score).toBe(0);
    expect(scoreCommand(CMDS[1], 'open').score).toBe(0);
  });
  it('scores noise at zero', () => {
    for (const c of CMDS) expect(scoreCommand(c, 'asdfqwer').score).toBe(0);
  });
});

describe('resolveCommands', () => {
  it('resolves a typo to the right command', () => {
    expect(resolveCommands(CMDS, 'noets')[0]?.command.id).toBe('app.notes');
  });
  it('resolves a partial word', () => {
    expect(resolveCommands(CMDS, 'calc')[0]?.command.id).toBe('app.calculator');
  });
  it('resolves reordered tokens', () => {
    expect(resolveCommands(CMDS, 'notes open')[0]?.command.id).toBe('app.notes');
  });
  it('resolves through filler / a broken sentence', () => {
    expect(resolveCommands(CMDS, 'umm can you open notes please')[0]?.command.id).toBe('app.notes');
  });
  it('resolves a typo inside a phrase', () => {
    expect(resolveCommands(CMDS, 'split screem')[0]?.command.id).toBe('window.split');
  });
  it('returns nothing for noise', () => {
    expect(resolveCommands(CMDS, 'asdfqwer')).toHaveLength(0);
  });
  it('ranks the best match first and respects the limit', () => {
    const r = resolveCommands(CMDS, 'notes', { limit: 2 });
    expect(r.length).toBeLessThanOrEqual(2);
    expect(r[0].command.id).toBe('app.notes');
  });
});

describe('bestResolution', () => {
  it('bands an exact alias as exact', () => {
    expect(bestResolution(CMDS, 'notes')?.confidence).toBe('exact');
  });
  it('bands a typo below exact but still resolves it', () => {
    const b = bestResolution(CMDS, 'noets');
    expect(b?.command.id).toBe('app.notes');
    expect(b?.confidence).not.toBe('exact');
  });
  it('is null for noise', () => {
    expect(bestResolution(CMDS, 'asdfqwer')).toBeNull();
  });
});
