// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform - test
// =============================================================================
// Tests for the UKI brain foundation: planner, skills, toolCall, memory,
// embeddings, streaming, appContext. All deterministic — no real time waits,
// no network. Verifies the contract that later UKI surfaces depend on.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  decompose,
  topoSort,
  validatePlan,
  _resetPlannerIds,
} from '../../src/shared/uki/planner';
import {
  createSkillRegistry,
  registerSkill,
  unregisterSkill,
  matchSkills,
  getSkill,
  type Skill,
} from '../../src/shared/uki/skills';
import {
  parseToolCall,
  dispatchToolCall,
  type ToolSpec,
} from '../../src/shared/uki/toolCall';
import {
  createMemoryStore,
  addMemory,
  recallMemory,
  forgetMemory,
  pruneShortTerm,
  promoteToLongTerm,
  exportMemories,
  _resetMemoryIds,
} from '../../src/shared/uki/memory';
import {
  createEmbeddingIndex,
  addEmbedding,
  removeEmbedding,
  cosineSimilarity,
  searchEmbeddings,
  indexSize,
} from '../../src/shared/uki/embeddings';
import {
  createStreamFromArray,
  collectStream,
  mapStream,
  teeStream,
  collectToolCalls,
  type StreamChunk,
} from '../../src/shared/uki/streaming';
import {
  createAppContextResolver,
  registerAppContext,
  unregisterAppContext,
  resolveAppContext,
  resolveAllAppContexts,
  formatContextForPrompt,
} from '../../src/shared/uki/appContext';

// ----- Skills + Planner ---------------------------------------------------

function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    label: 'Test skill',
    intent: 'summarize',
    plan: { steps: [{ actionId: 'do.summarize', params: { text: '{{goal}}' } }] },
    ...over,
  };
}

describe('skills.registry', () => {
  it('creates empty registry', () => {
    const r = createSkillRegistry();
    expect(r.skills).toEqual([]);
  });
  it('registers a skill', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill());
    expect(r.skills).toHaveLength(1);
    expect(getSkill(r, 'skill-1')?.label).toBe('Test skill');
  });
  it('updates existing skill on re-register', () => {
    let r = registerSkill(createSkillRegistry(), makeSkill());
    r = registerSkill(r, makeSkill({ label: 'Updated' }));
    expect(r.skills).toHaveLength(1);
    expect(getSkill(r, 'skill-1')?.label).toBe('Updated');
  });
  it('throws when id missing', () => {
    expect(() => registerSkill(createSkillRegistry(), { ...makeSkill(), id: '' })).toThrow();
  });
  it('unregisters a skill', () => {
    let r = registerSkill(createSkillRegistry(), makeSkill());
    r = unregisterSkill(r, 'skill-1');
    expect(r.skills).toEqual([]);
  });
});

describe('skills.match', () => {
  it('matches by substring intent', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill());
    const ranked = matchSkills('please summarize this', r);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].skill.id).toBe('skill-1');
    expect(ranked[0].score).toBeGreaterThan(0);
  });
  it('matches by regex intent', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill({ intent: /^fix\s+error/ }));
    expect(matchSkills('fix error in foo', r)).toHaveLength(1);
    expect(matchSkills('please fix error', r)).toHaveLength(0);
  });
  it('boosts on exact intent match', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill());
    const exact = matchSkills('summarize', r)[0].score;
    const partial = matchSkills('please summarize this thing', r)[0].score;
    expect(exact).toBeGreaterThan(partial);
  });
  it('penalises missing required context', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill({ requiredContext: ['file', 'language'] }));
    const ranked = matchSkills('summarize', r);
    expect(ranked[0].missingContext).toEqual(['file', 'language']);
  });
  it('rewards when required context present', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill({ requiredContext: ['file'] }));
    const a = matchSkills('summarize', r)[0].score;
    const b = matchSkills('summarize', r, { facts: { file: 'x.ts' } })[0].score;
    expect(b).toBeGreaterThan(a);
  });
  it('respects appId scope (positive boost)', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill({ appIds: ['notes'] }));
    const scoped = matchSkills('summarize', r, { appId: 'notes' })[0]?.score ?? 0;
    const unscoped = matchSkills('summarize', r)[0].score;
    expect(scoped).toBeGreaterThan(unscoped);
  });
  it('penalises wrong appId', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill({ appIds: ['notes'] }));
    expect(matchSkills('summarize', r, { appId: 'forge' })).toHaveLength(0);
  });
  it('returns empty for empty intent', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill());
    expect(matchSkills('', r)).toEqual([]);
    expect(matchSkills('   ', r)).toEqual([]);
  });
  it('respects limit', () => {
    let r = createSkillRegistry();
    for (let i = 0; i < 8; i++) {
      r = registerSkill(r, makeSkill({ id: `s-${i}`, label: `s ${i}` }));
    }
    const ranked = matchSkills('summarize', r, { limit: 3 });
    expect(ranked).toHaveLength(3);
  });
});

describe('planner.decompose', () => {
  beforeEach(() => _resetPlannerIds());
  it('returns empty plan for empty goal', () => {
    const p = decompose('', createSkillRegistry());
    expect(p.steps).toEqual([]);
  });
  it('returns empty plan when no skill matches', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill());
    const p = decompose('totally unrelated request', r);
    expect(p.steps).toEqual([]);
  });
  it('instantiates the matched skill template', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill());
    const p = decompose('summarize this paragraph', r);
    expect(p.steps).toHaveLength(1);
    expect(p.steps[0].actionId).toBe('do.summarize');
    expect(p.steps[0].params.text).toBe('summarize this paragraph');
  });
  it('substitutes facts into params', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill({
      plan: { steps: [{ actionId: 'a', params: { msg: 'goal={{goal}} file={{file}}' } }] },
    }));
    const p = decompose('summarize', r, { facts: { file: 'x.ts' } });
    expect(p.steps[0].params.msg).toBe('goal=summarize file=x.ts');
  });
  it('preserves dependsOn / optional / retries', () => {
    const r = registerSkill(createSkillRegistry(), makeSkill({
      plan: { steps: [
        { actionId: 'a', params: {}, retries: 2 },
        { actionId: 'b', params: {}, dependsOn: [], optional: true },
      ] },
    }));
    const p = decompose('summarize', r);
    expect(p.steps[0].retries).toBe(2);
    expect(p.steps[1].optional).toBe(true);
  });
  it('respects maxSteps cap', () => {
    const big = Array.from({ length: 50 }, () => ({ actionId: 'a', params: {} }));
    const r = registerSkill(createSkillRegistry(), makeSkill({ plan: { steps: big } }));
    const p = decompose('summarize', r, {}, { maxSteps: 5 });
    expect(p.steps).toHaveLength(5);
  });
  it('uses custom newId function', () => {
    let n = 0;
    const newId = () => `x-${++n}`;
    const r = registerSkill(createSkillRegistry(), makeSkill());
    const p = decompose('summarize', r, {}, { newId });
    expect(p.id).toBe('x-1');
    expect(p.steps[0].id).toBe('x-2');
  });
});

describe('planner.topoSort + validatePlan', () => {
  it('topoSort handles linear deps', () => {
    const sorted = topoSort([
      { id: 'b', actionId: 'b', params: {}, dependsOn: ['a'] },
      { id: 'a', actionId: 'a', params: {} },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b']);
  });
  it('topoSort throws on cycle', () => {
    expect(() => topoSort([
      { id: 'a', actionId: 'a', params: {}, dependsOn: ['b'] },
      { id: 'b', actionId: 'b', params: {}, dependsOn: ['a'] },
    ])).toThrow(/cycle/);
  });
  it('topoSort throws on unknown dep', () => {
    expect(() => topoSort([
      { id: 'a', actionId: 'a', params: {}, dependsOn: ['ghost'] },
    ])).toThrow(/unknown/);
  });
  it('validatePlan reports duplicate ids', () => {
    const v = validatePlan({ id: 'p', goal: 'g', steps: [
      { id: 'a', actionId: 'x', params: {} },
      { id: 'a', actionId: 'x', params: {} },
    ] });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /duplicate/.test(e))).toBe(true);
  });
  it('validatePlan reports missing actionId', () => {
    const v = validatePlan({ id: 'p', goal: 'g', steps: [{ id: 'a', actionId: '', params: {} }] });
    expect(v.ok).toBe(false);
  });
  it('validatePlan caps step count', () => {
    const steps = Array.from({ length: 70 }, (_, i) => ({ id: `s-${i}`, actionId: 'x', params: {} }));
    const v = validatePlan({ id: 'p', goal: 'g', steps }, { maxSteps: 64 });
    expect(v.ok).toBe(false);
  });
  it('validatePlan accepts a clean plan', () => {
    const v = validatePlan({ id: 'p', goal: 'g', steps: [
      { id: 'a', actionId: 'x', params: {} },
      { id: 'b', actionId: 'y', params: {}, dependsOn: ['a'] },
    ] });
    expect(v).toEqual({ ok: true, errors: [] });
  });
});

// ----- Tool calls ---------------------------------------------------------

const SPECS: ToolSpec[] = [{
  name: 'echo',
  params: {
    msg: { type: 'string', minLength: 1, maxLength: 100 },
    count: { type: 'number', min: 1, max: 5, integer: true },
    flag: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    nested: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  required: ['msg'],
}];

describe('toolCall.parseToolCall', () => {
  it('parses a valid call', () => {
    const r = parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'hi' } }), SPECS);
    expect(r.ok).toBe(true);
    expect(r.call?.args.msg).toBe('hi');
  });
  it('accepts arguments alias', () => {
    const r = parseToolCall(JSON.stringify({ name: 'echo', arguments: { msg: 'hi' } }), SPECS);
    expect(r.ok).toBe(true);
  });
  it('rejects invalid json', () => {
    const r = parseToolCall('{not json', SPECS);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/json/);
  });
  it('rejects unknown tool', () => {
    const r = parseToolCall(JSON.stringify({ name: 'ghost', args: {} }), SPECS);
    expect(r.ok).toBe(false);
  });
  it('rejects missing required', () => {
    const r = parseToolCall(JSON.stringify({ name: 'echo', args: {} }), SPECS);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/msg/);
  });
  it('rejects unknown param', () => {
    const r = parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', extra: 1 } }), SPECS);
    expect(r.ok).toBe(false);
  });
  it('validates string min/max length', () => {
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: '' } }), SPECS).ok).toBe(false);
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'x'.repeat(101) } }), SPECS).ok).toBe(false);
  });
  it('validates number constraints', () => {
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', count: 0 } }), SPECS).ok).toBe(false);
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', count: 6 } }), SPECS).ok).toBe(false);
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', count: 2.5 } }), SPECS).ok).toBe(false);
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', count: 3 } }), SPECS).ok).toBe(true);
  });
  it('validates boolean type', () => {
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', flag: 'yes' } }), SPECS).ok).toBe(false);
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', flag: true } }), SPECS).ok).toBe(true);
  });
  it('validates array maxItems', () => {
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', tags: ['a','b','c','d'] } }), SPECS).ok).toBe(false);
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', tags: ['a'] } }), SPECS).ok).toBe(true);
  });
  it('validates nested object required', () => {
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', nested: {} } }), SPECS).ok).toBe(false);
    expect(parseToolCall(JSON.stringify({ name: 'echo', args: { msg: 'h', nested: { id: 'x' } } }), SPECS).ok).toBe(true);
  });
});

describe('toolCall.dispatchToolCall', () => {
  it('calls the handler and returns result', async () => {
    const r = await dispatchToolCall({ name: 'echo', args: { msg: 'hi' } }, {
      echo: (a) => `got ${a.msg}`,
    });
    expect(r.ok).toBe(true);
    expect(r.result).toBe('got hi');
    expect(r.attempts).toBe(1);
  });
  it('rejects unknown handler', async () => {
    const r = await dispatchToolCall({ name: 'ghost', args: {} }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no handler/);
  });
  it('enforces confidence floor', async () => {
    const r = await dispatchToolCall({ name: 'echo', args: {} }, { echo: () => 'x' }, {
      confidenceMin: 0.5, confidence: 0.2,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/confidence/);
  });
  it('passes confidence floor', async () => {
    const r = await dispatchToolCall({ name: 'echo', args: {} }, { echo: () => 'x' }, {
      confidenceMin: 0.5, confidence: 0.8,
    });
    expect(r.ok).toBe(true);
  });
  it('charge throwing aborts dispatch', async () => {
    const r = await dispatchToolCall({ name: 'echo', args: {} }, { echo: () => 'x' }, {
      charge: () => { throw new Error('over budget'); },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/budget/);
  });
  it('retries transient failures', async () => {
    let n = 0;
    const r = await dispatchToolCall({ name: 'echo', args: {} }, {
      echo: () => { n += 1; if (n < 3) throw new Error('boom'); return 'ok'; },
    }, { retries: 3, sleep: async () => undefined });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
  });
  it('returns failure after retries exhausted', async () => {
    const r = await dispatchToolCall({ name: 'echo', args: {} }, {
      echo: () => { throw new Error('boom'); },
    }, { retries: 2, sleep: async () => undefined });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(3);
    expect(r.error).toBe('boom');
  });
});

// ----- Memory -------------------------------------------------------------

describe('memory store', () => {
  beforeEach(() => _resetMemoryIds());
  it('adds an item with defaults', () => {
    const s = createMemoryStore();
    const m = addMemory(s, { content: 'hello', now: 1000 });
    expect(m.kind).toBe('short');
    expect(m.importance).toBe(0.5);
    expect(s.items.size).toBe(1);
  });
  it('clamps importance to [0,1]', () => {
    const s = createMemoryStore();
    expect(addMemory(s, { content: 'x', importance: 5 }).importance).toBe(1);
    expect(addMemory(s, { content: 'y', importance: -1 }).importance).toBe(0);
  });
  it('recalls by substring', () => {
    const s = createMemoryStore();
    addMemory(s, { id: 'a', content: 'apple pie recipe', now: 1000 });
    addMemory(s, { id: 'b', content: 'banana smoothie', now: 1000 });
    const hits = recallMemory(s, 'apple', { now: 2000 });
    expect(hits.map((h) => h.id)).toEqual(['a']);
  });
  it('filters by kind', () => {
    const s = createMemoryStore();
    addMemory(s, { id: 'a', content: 'x', kind: 'short' });
    addMemory(s, { id: 'b', content: 'x', kind: 'long' });
    expect(recallMemory(s, 'x', { kind: 'long' }).map((h) => h.id)).toEqual(['b']);
  });
  it('filters by tags (all-of)', () => {
    const s = createMemoryStore();
    addMemory(s, { id: 'a', content: 'x', tags: ['p'] });
    addMemory(s, { id: 'b', content: 'x', tags: ['p', 'q'] });
    expect(recallMemory(s, 'x', { tags: ['p', 'q'] }).map((h) => h.id)).toEqual(['b']);
  });
  it('orders by importance + recency', () => {
    const s = createMemoryStore();
    addMemory(s, { id: 'a', content: 'note', importance: 0.1, now: 1000 });
    addMemory(s, { id: 'b', content: 'note', importance: 0.9, now: 1000 });
    expect(recallMemory(s, 'note', { now: 2000 })[0].id).toBe('b');
  });
  it('updates accessedAt on recall', () => {
    const s = createMemoryStore();
    const m = addMemory(s, { content: 'hi', now: 1000 });
    recallMemory(s, 'hi', { now: 5000 });
    expect(m.accessedAt).toBe(5000);
  });
  it('forgetMemory deletes', () => {
    const s = createMemoryStore();
    const m = addMemory(s, { content: 'hi' });
    expect(forgetMemory(s, m.id)).toBe(true);
    expect(s.items.size).toBe(0);
  });
  it('pruneShortTerm removes only old short items', () => {
    const s = createMemoryStore();
    addMemory(s, { id: 'old', content: 'x', kind: 'short', now: 1000 });
    addMemory(s, { id: 'new', content: 'x', kind: 'short', now: 9000 });
    addMemory(s, { id: 'long', content: 'x', kind: 'long', now: 1000 });
    const removed = pruneShortTerm(s, 1000, 10000);
    expect(removed).toBe(1);
    expect(s.items.has('old')).toBe(false);
    expect(s.items.has('new')).toBe(true);
    expect(s.items.has('long')).toBe(true);
  });
  it('promoteToLongTerm bumps importance floor', () => {
    const s = createMemoryStore();
    const m = addMemory(s, { content: 'x', importance: 0.2 });
    promoteToLongTerm(s, m.id);
    expect(m.kind).toBe('long');
    expect(m.importance).toBe(0.7);
  });
  it('exportMemories returns clones of arrays', () => {
    const s = createMemoryStore();
    addMemory(s, { content: 'x', tags: ['a'] });
    const exp = exportMemories(s);
    exp[0].tags.push('mut');
    expect(Array.from(s.items.values())[0].tags).toEqual(['a']);
  });
});

// ----- Embeddings ---------------------------------------------------------

describe('embeddings', () => {
  it('rejects non-positive dim', () => {
    expect(() => createEmbeddingIndex(0)).toThrow();
    expect(() => createEmbeddingIndex(1.5)).toThrow();
  });
  it('addEmbedding enforces dim', () => {
    const idx = createEmbeddingIndex(3);
    expect(() => addEmbedding(idx, { id: 'a', vector: [1, 0], payload: {} })).toThrow();
  });
  it('addEmbedding replaces by id', () => {
    let idx = createEmbeddingIndex<{ k: string }>(2);
    idx = addEmbedding(idx, { id: 'a', vector: [1, 0], payload: { k: 'first' } });
    idx = addEmbedding(idx, { id: 'a', vector: [0, 1], payload: { k: 'second' } });
    expect(indexSize(idx)).toBe(1);
    expect(idx.entries[0].payload.k).toBe('second');
  });
  it('removeEmbedding removes', () => {
    let idx = createEmbeddingIndex(2);
    idx = addEmbedding(idx, { id: 'a', vector: [1, 0], payload: {} });
    idx = removeEmbedding(idx, 'a');
    expect(indexSize(idx)).toBe(0);
  });
  it('cosineSimilarity orthogonal = 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  it('cosineSimilarity identical = 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it('cosineSimilarity opposite = -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });
  it('cosineSimilarity zero vector = 0', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
  it('cosineSimilarity throws on length mismatch', () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });
  it('searchEmbeddings ranks by score', () => {
    let idx = createEmbeddingIndex<string>(2);
    idx = addEmbedding(idx, { id: 'x', vector: [1, 0], payload: 'x' });
    idx = addEmbedding(idx, { id: 'y', vector: [0, 1], payload: 'y' });
    idx = addEmbedding(idx, { id: 'z', vector: [0.9, 0.1], payload: 'z' });
    const hits = searchEmbeddings(idx, [1, 0], { k: 2 });
    expect(hits[0].entry.id).toBe('x');
    expect(hits[1].entry.id).toBe('z');
  });
  it('searchEmbeddings respects minScore', () => {
    let idx = createEmbeddingIndex(2);
    idx = addEmbedding(idx, { id: 'a', vector: [1, 0], payload: {} });
    idx = addEmbedding(idx, { id: 'b', vector: [-1, 0], payload: {} });
    const hits = searchEmbeddings(idx, [1, 0], { minScore: 0.5 });
    expect(hits).toHaveLength(1);
  });
  it('searchEmbeddings throws on dim mismatch', () => {
    const idx = createEmbeddingIndex(3);
    expect(() => searchEmbeddings(idx, [1, 0])).toThrow();
  });
});

// ----- Streaming ----------------------------------------------------------

describe('streaming', () => {
  it('collectStream concatenates tokens', async () => {
    const r = createStreamFromArray([
      { type: 'token', content: 'Hel' },
      { type: 'token', content: 'lo' },
      { type: 'done' },
    ]);
    expect(await collectStream(r)).toBe('Hello');
  });
  it('collectStream throws on error chunk', async () => {
    const r = createStreamFromArray([
      { type: 'token', content: 'x' },
      { type: 'error', error: 'oops' },
    ]);
    await expect(collectStream(r)).rejects.toThrow(/oops/);
  });
  it('collectStream stops at done', async () => {
    const r = createStreamFromArray([
      { type: 'token', content: 'a' },
      { type: 'done' },
      { type: 'token', content: 'b' },
    ]);
    expect(await collectStream(r)).toBe('a');
  });
  it('mapStream transforms tokens only', async () => {
    const r = createStreamFromArray([
      { type: 'token', content: 'hi' },
      { type: 'done' },
    ]);
    const upper = mapStream(r, (s) => s.toUpperCase());
    expect(await collectStream(upper)).toBe('HI');
  });
  it('teeStream observes every chunk and is exception-safe', async () => {
    const seen: StreamChunk[] = [];
    const r = createStreamFromArray([
      { type: 'token', content: 'a' },
      { type: 'token', content: 'b' },
      { type: 'done' },
    ]);
    const tee = teeStream(r, (c) => { if (c.content === 'b') throw new Error('observer broken'); seen.push(c); });
    await collectStream(tee);
    // observer only saw 'a' (b threw, swallowed) and 'done' didn't execute push because also threw? no, only b threw.
    expect(seen.find((c) => c.content === 'a')).toBeDefined();
  });
  it('collectToolCalls extracts tool-call json', () => {
    const calls = collectToolCalls([
      { type: 'token', content: 'hi' },
      { type: 'toolCall', toolCallJson: '{"name":"x"}' },
      { type: 'toolCall', toolCallJson: '{"name":"y"}' },
      { type: 'done' },
    ]);
    expect(calls).toEqual(['{"name":"x"}', '{"name":"y"}']);
  });
});

// ----- App context --------------------------------------------------------

describe('appContext', () => {
  it('register + resolve', () => {
    const reg = createAppContextResolver();
    registerAppContext(reg, 'notes', () => ({ appId: 'notes', focusedItemId: 'n-1' }));
    expect(resolveAppContext(reg, 'notes')?.focusedItemId).toBe('n-1');
  });
  it('unknown app resolves undefined', () => {
    const reg = createAppContextResolver();
    expect(resolveAppContext(reg, 'ghost')).toBeUndefined();
  });
  it('throwing resolver returns undefined', () => {
    const reg = createAppContextResolver();
    registerAppContext(reg, 'x', () => { throw new Error('boom'); });
    expect(resolveAppContext(reg, 'x')).toBeUndefined();
  });
  it('rejects empty appId', () => {
    const reg = createAppContextResolver();
    expect(() => registerAppContext(reg, '', () => undefined)).toThrow();
  });
  it('unregister removes', () => {
    const reg = createAppContextResolver();
    registerAppContext(reg, 'x', () => ({ appId: 'x' }));
    expect(unregisterAppContext(reg, 'x')).toBe(true);
    expect(resolveAppContext(reg, 'x')).toBeUndefined();
  });
  it('resolveAllAppContexts skips throwers and undefined', () => {
    const reg = createAppContextResolver();
    registerAppContext(reg, 'a', () => ({ appId: 'a' }));
    registerAppContext(reg, 'b', () => undefined);
    registerAppContext(reg, 'c', () => { throw new Error('x'); });
    const all = resolveAllAppContexts(reg);
    expect(all.map((s) => s.appId)).toEqual(['a']);
  });
  it('formatContextForPrompt includes core fields', () => {
    const out = formatContextForPrompt({
      appId: 'notes', currentFile: '/a.md', focusedItemId: 'n-1', selectionText: 'hello world',
    });
    expect(out).toMatch(/app: notes/);
    expect(out).toMatch(/file: \/a\.md/);
    expect(out).toMatch(/focus: n-1/);
    expect(out).toMatch(/selection:/);
  });
  it('formatContextForPrompt truncates long output', () => {
    const huge = 'x'.repeat(5000);
    const out = formatContextForPrompt({ appId: 'a', selectionText: huge }, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith('…')).toBe(true);
  });
  it('formatContextForPrompt serializes custom fields', () => {
    const out = formatContextForPrompt({ appId: 'a', custom: { count: 3, tag: 'x' } });
    expect(out).toMatch(/count: 3/);
    expect(out).toMatch(/tag: x/);
  });
});
