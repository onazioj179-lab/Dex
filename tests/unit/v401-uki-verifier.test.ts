// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave H UKI verifier tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  verifyPlan,
  calibrateConfidence,
  findCitations,
  matchIntent,
  dryRunPlan,
} from '../../src/shared/uki/verifier';

const catalog = [
  { name: 'read', risk: 'safe' as const, requiresConfirmation: false, allowedArgs: ['path'] },
  { name: 'delete', risk: 'destructive' as const, requiresConfirmation: true, allowedArgs: ['path'] },
  { name: 'fetch_web', risk: 'caution' as const, requiresConfirmation: false },
];

describe('verifyPlan', () => {
  it('flags unknown tool', () => {
    const r = verifyPlan([{ id: '1', tool: 'xxx', args: {}, reason: 'long enough reason here' }], catalog);
    expect(r.ok).toBe(false);
  });
  it('requires confirmation on destructive', () => {
    const r = verifyPlan([{ id: '1', tool: 'delete', args: { path: '/tmp/a' }, reason: 'remove temp file' }], catalog);
    expect(r.needsConfirmation).toBe(true);
    expect(r.estimatedRisk).toBe('destructive');
  });
  it('warns on unknown args', () => {
    const r = verifyPlan([{ id: '1', tool: 'read', args: { evil: true }, reason: 'read a thing' }], catalog);
    expect(r.issues.find(i => i.severity === 'warning')).toBeDefined();
  });
  it('flags short reasons', () => {
    const r = verifyPlan([{ id: '1', tool: 'read', args: { path: 'x' }, reason: 'no' }], catalog);
    expect(r.issues.find(i => i.severity === 'info')).toBeDefined();
  });
});

describe('confidence', () => {
  it('high confidence with citations + similarity', () => {
    const c = calibrateConfidence({ vectorSimilarity: 0.95, citationCount: 3 });
    expect(c.confidence).toBeGreaterThan(0.6);
  });
  it('drops with hallucination flags', () => {
    const high = calibrateConfidence({ vectorSimilarity: 0.95 }).confidence;
    const low = calibrateConfidence({ vectorSimilarity: 0.95, hallucinationFlags: 2 }).confidence;
    expect(low).toBeLessThan(high);
  });
});

describe('citations', () => {
  it('finds citations matching source words', () => {
    const ans = 'The quick brown fox jumps over the lazy dog every morning before sunrise.';
    const cites = findCitations(ans, [{ uri: 's1', text: 'quick brown jumps every morning before sunrise lazy dog fox' }]);
    expect(cites.length).toBeGreaterThan(0);
  });
  it('returns empty when no overlap', () => {
    expect(findCitations('Some random sentence with words.', [{ uri: 's', text: 'completely different' }])).toEqual([]);
  });
});

describe('intent', () => {
  const intents = [
    { name: 'open', patterns: ['open', /launch/], minScore: 1 },
    { name: 'close', patterns: ['close', 'quit'], minScore: 1 },
  ];
  it('matches open', () => { expect(matchIntent('please open the browser', intents)?.intent).toBe('open'); });
  it('matches regex launch', () => { expect(matchIntent('go launch it', intents)?.intent).toBe('open'); });
  it('returns null on no match', () => { expect(matchIntent('hello world', intents)).toBeNull(); });
});

describe('dry run', () => {
  it('detects mutation + network', () => {
    const r = dryRunPlan(
      [{ id: '1', tool: 'fetch_web', args: {}, reason: 'gather' }, { id: '2', tool: 'delete', args: {}, reason: 'cleanup' }],
      catalog,
    );
    expect(r.willMutate).toBe(true);
    expect(r.willCallNetwork).toBe(true);
    expect(r.estimatedCalls).toBe(2);
  });
});
