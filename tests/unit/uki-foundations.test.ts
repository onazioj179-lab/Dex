// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  FOUNDATIONS, REASONING_CORE, buildReasoningBlock, selectFoundations, verifyAnswerAgainstOutcomes,
} from '../../src/renderer/uki/foundations';
import { buildSystemPrompt, coreSystemPrompt } from '../../src/renderer/uki/identity';

describe('selectFoundations', () => {
  it('picks the engineering lens for a debugging request', () => {
    expect(selectFoundations('why does this TypeScript build throw an error?')[0]).toBe('hopper');
  });

  it('picks mathematics for a calculation and research for a comparison', () => {
    expect(selectFoundations('what is the probability of 3 heads in 5 flips')).toContain('lovelace');
    expect(selectFoundations('compare the evidence for and against nuclear power')).toContain('hypatia');
  });

  it('always brings in reliability when the turn can change things', () => {
    expect(selectFoundations('tidy my notes', { actionable: true })).toContain('hamilton');
  });

  it('uses the foreground app as a hint and keeps agent emphasis', () => {
    expect(selectFoundations('help', { foregroundAppId: 'dexcode' })).toEqual(['hopper']);
    expect(selectFoundations('help', { agent: 'xack' })[0]).toBe('hamilton');
    expect(selectFoundations('help', { agent: 'umari' })[0]).toBe('hypatia');
  });

  it('never returns more than three lenses', () => {
    const all = 'debug this algorithm, research why, brainstorm ideas, then delete the backup';
    expect(selectFoundations(all, { actionable: true }).length).toBeLessThanOrEqual(3);
  });
});

describe('reasoning block', () => {
  it('carries the shared core and only the selected lenses, without naming people', () => {
    const block = buildReasoningBlock(['hopper']);
    for (const rule of REASONING_CORE) expect(block).toContain(rule);
    for (const rule of FOUNDATIONS.hopper.rules) expect(block).toContain(rule);
    expect(block).not.toContain(FOUNDATIONS.hypatia.rules[0]);
    for (const f of Object.values(FOUNDATIONS)) expect(block).not.toContain(f.inspiredBy);
  });

  it('rejects agreement for its own sake', () => {
    expect(REASONING_CORE.join(' ')).toMatch(/do not agree to please/);
  });

  it('is part of every UKI system prompt, adapted to the request', () => {
    const p = buildSystemPrompt({ userText: 'fix this compile error' });
    expect(p.startsWith(coreSystemPrompt())).toBe(true);
    expect(p).toContain(FOUNDATIONS.hopper.rules[0]);
  });
});

describe('verifyAnswerAgainstOutcomes', () => {
  const failed = [{ name: 'delete_file', result: 'Not performed: the user declined.' }];

  it('corrects an answer that claims success after a step failed', () => {
    const out = verifyAnswerAgainstOutcomes("Done, I've deleted the file.", failed);
    expect(out).toMatch(/Correction: not everything above completed\. delete_file: Not performed/);
  });

  it('leaves honest answers and successful runs alone', () => {
    expect(verifyAnswerAgainstOutcomes('I could not delete it: you declined.', failed)).toBe('I could not delete it: you declined.');
    expect(verifyAnswerAgainstOutcomes('Done.', [{ name: 'open_app', result: 'Opened notes.' }])).toBe('Done.');
    expect(verifyAnswerAgainstOutcomes('Here is the summary.', failed)).toBe('Here is the summary.');
  });
});
