// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  classifyTask,
  routeModels,
  fanOutModels,
  routingGoalLabel,
  ROUTING_GOALS,
  type RouteCandidate,
} from '../../src/shared/uki/smartRouter';

// Candidate descriptors mirror what connect.ts builds from the provider registry.
const C = {
  gpt4o:     { id: 'gpt-4o', contextWindow: 128000, vision: true, tools: true },
  gpt4oMini: { id: 'gpt-4o-mini', contextWindow: 128000, vision: true, tools: true },
  sonnet:    { id: 'claude-3-5-sonnet-latest', contextWindow: 200000, vision: true, tools: true },
  haiku:     { id: 'claude-3-5-haiku-latest', contextWindow: 200000, vision: false, tools: true },
  flash:     { id: 'gemini-1.5-flash', contextWindow: 1000000, vision: true, tools: true },
  llama:     { id: 'llama3.1', contextWindow: 128000, vision: false, tools: true },
} satisfies Record<string, RouteCandidate>;
const ALL = Object.values(C);
const easy = classifyTask('what time is it?');

describe('classifyTask', () => {
  it('flags code prompts', () => {
    expect(classifyTask('please refactor this ```js\nconst x = 1\n```').isCode).toBe(true);
  });
  it('flags vision prompts', () => {
    expect(classifyTask('describe this screenshot for me').needsVision).toBe(true);
  });
  it('flags long-context prompts by token estimate', () => {
    expect(classifyTask('x'.repeat(40000)).isLongContext).toBe(true);
  });
  it('treats a short factual question as none of the above', () => {
    const t = classifyTask('what is the capital of France?');
    expect(t.isCode || t.needsVision || t.isLongContext).toBe(false);
  });
});

describe('routeModels — goals', () => {
  it('cheapest puts the lowest-cost model first (free local wins)', () => {
    expect(routeModels('cheapest', easy, ALL)[0]).toBe('llama3.1');
  });
  it('cheapest among hosted-only picks the cheap hosted model', () => {
    expect(routeModels('cheapest', easy, [C.gpt4o, C.gpt4oMini, C.sonnet])[0]).toBe('gpt-4o-mini');
  });
  it('smartest puts a frontier model first', () => {
    expect(routeModels('smartest', easy, [C.haiku, C.flash, C.gpt4o])[0]).toBe('gpt-4o');
  });
  it('fastest puts the lowest-latency model first', () => {
    expect(routeModels('fastest', easy, [C.gpt4o, C.flash])[0]).toBe('gemini-1.5-flash');
  });
  it('offline keeps only on-device models', () => {
    expect(routeModels('offline', easy, ALL)).toEqual(['llama3.1']);
  });
  it('offline returns [] when no local model is available', () => {
    expect(routeModels('offline', easy, [C.gpt4o, C.sonnet])).toEqual([]);
  });
  it('returns [] when there are no candidates at all', () => {
    expect(routeModels('auto', easy, [])).toEqual([]);
  });
});

describe('routeModels — capability filtering', () => {
  it('a vision task drops non-vision models', () => {
    const visionTask = classifyTask('what is in this image?');
    expect(routeModels('smartest', visionTask, [C.haiku, C.gpt4o])).toEqual(['gpt-4o']);
  });
  it('drops models whose context window is too small for the task', () => {
    const big = classifyTask('x'.repeat(800000)); // ~200k tokens
    const small: RouteCandidate = { id: 'gpt-4o', contextWindow: 128000, vision: true, tools: true };
    const large: RouteCandidate = { id: 'gemini-1.5-flash', contextWindow: 1000000, vision: true, tools: true };
    expect(routeModels('smartest', big, [small, large])).toEqual(['gemini-1.5-flash']);
  });
  it('never returns empty when candidates exist but none perfectly fit', () => {
    const visionTask = classifyTask('describe this photo'); // neither candidate has vision
    expect(routeModels('cheapest', visionTask, [C.haiku, C.llama]).length).toBe(2);
  });
});

describe('routeModels — auto heuristic', () => {
  it('hard tasks (code) favour a frontier model', () => {
    const codeTask = classifyTask('refactor this ```ts\nfunction f() {}\n```');
    expect(routeModels('auto', codeTask, [C.gpt4oMini, C.gpt4o])[0]).toBe('gpt-4o');
  });
  it('easy tasks favour the cheap model', () => {
    expect(routeModels('auto', easy, [C.gpt4o, C.gpt4oMini])[0]).toBe('gpt-4o-mini');
  });
  it('produces a valid chatWithFallback list — every candidate id, no duplicates', () => {
    const r = routeModels('smartest', easy, ALL);
    expect(r.length).toBe(ALL.length);
    expect(new Set(r).size).toBe(r.length);
  });
});

describe('fanOutModels', () => {
  it('takes the first n unique ids for parallel execution', () => {
    expect(fanOutModels(['a', 'b', 'a', 'c'], 2)).toEqual(['a', 'b']);
  });
  it('returns all ids when n exceeds the list', () => {
    expect(fanOutModels(['a', 'b'], 5)).toEqual(['a', 'b']);
  });
});

describe('routing goal metadata', () => {
  it('labels every goal and lists them all', () => {
    expect(ROUTING_GOALS).toContain('auto');
    expect(routingGoalLabel('cheapest')).toBe('Cheapest');
    expect(routingGoalLabel('auto')).toBe('Auto');
  });
});
