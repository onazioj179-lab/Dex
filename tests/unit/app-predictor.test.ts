// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * App predictor tests
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AppPredictor,
  schedulePrewarm,
  _resetPrewarmCache,
} from '../../src/renderer/services/AppPredictor';

class MemStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

beforeEach(() => {
  _resetPrewarmCache();
});

describe('AppPredictor.record / predict', () => {
  it('returns empty predictions before any history', () => {
    const p = new AppPredictor(new MemStorage());
    expect(p.predict('files')).toEqual([]);
  });

  it('learns A -> B transitions', () => {
    const p = new AppPredictor(new MemStorage());
    for (let i = 0; i < 5; i++) {
      p.record('files', i * 10);
      p.record('imosion', i * 10 + 1);
    }
    const preds = p.predict('files', 3);
    expect(preds[0].appId).toBe('imosion');
    expect(preds[0].probability).toBeCloseTo(1, 3);
    expect(preds[0].count).toBe(5);
  });

  it('ranks competing destinations correctly', () => {
    const p = new AppPredictor(new MemStorage());
    // From A go to B 7 times and C 3 times
    for (let i = 0; i < 7; i++) { p.record('a', i); p.record('b', i + 0.5); }
    for (let i = 0; i < 3; i++) { p.record('a', 100 + i); p.record('c', 100 + i + 0.5); }
    const preds = p.predict('a', 5);
    expect(preds.map(x => x.appId)).toEqual(['b', 'c']);
    expect(preds[0].probability).toBeCloseTo(0.7, 2);
    expect(preds[1].probability).toBeCloseTo(0.3, 2);
  });

  it('ignores self-transitions', () => {
    const p = new AppPredictor(new MemStorage());
    p.record('a'); p.record('a'); p.record('a');
    expect(p.predict('a')).toEqual([]);
  });

  it('persists state across instances using shared storage', () => {
    const storage = new MemStorage();
    const p1 = new AppPredictor(storage);
    p1.record('home'); p1.record('files'); p1.record('home'); p1.record('files');
    const p2 = new AppPredictor(storage);
    expect(p2.predict('home')[0].appId).toBe('files');
  });

  it('hasSignal reflects observation threshold', () => {
    const p = new AppPredictor(new MemStorage());
    p.record('a'); p.record('b');
    expect(p.hasSignal('a', 2)).toBe(false);
    p.record('a'); p.record('b');
    expect(p.hasSignal('a', 2)).toBe(true);
  });

  it('reset clears state', () => {
    const p = new AppPredictor(new MemStorage());
    p.record('a'); p.record('b');
    expect(p.observationCount).toBe(1);
    p.reset();
    expect(p.observationCount).toBe(0);
    expect(p.predict('a')).toEqual([]);
  });
});

describe('schedulePrewarm', () => {
  it('imports top predictions above the probability floor', async () => {
    const p = new AppPredictor(new MemStorage());
    for (let i = 0; i < 10; i++) { p.record('a', i); p.record('b', i + 0.5); }

    const imported: string[] = [];
    schedulePrewarm(p, 'a', {
      importer: (appId) => { imported.push(appId); return Promise.resolve(); },
      topN: 1,
      minProbability: 0.5,
    });
    await new Promise(r => setTimeout(r, 5));
    expect(imported).toEqual(['b']);
  });

  it('skips candidates below the probability floor', async () => {
    const p = new AppPredictor(new MemStorage());
    // 3 transitions to b, 7 to c -> b at 0.3 should be skipped at floor 0.5
    for (let i = 0; i < 3; i++) { p.record('a', i); p.record('b', i + 0.1); }
    for (let i = 0; i < 7; i++) { p.record('a', 100 + i); p.record('c', 100 + i + 0.1); }
    const imported: string[] = [];
    schedulePrewarm(p, 'a', { importer: id => { imported.push(id); }, topN: 5, minProbability: 0.5 });
    await new Promise(r => setTimeout(r, 5));
    expect(imported).toEqual(['c']);
  });

  it('does not re-import the same app twice in one session', async () => {
    const p = new AppPredictor(new MemStorage());
    for (let i = 0; i < 5; i++) { p.record('a', i); p.record('b', i + 0.5); }
    const imported: string[] = [];
    const opts = { importer: (id: string) => { imported.push(id); }, topN: 1, minProbability: 0.1 };
    schedulePrewarm(p, 'a', opts);
    schedulePrewarm(p, 'a', opts);
    await new Promise(r => setTimeout(r, 5));
    expect(imported).toEqual(['b']);
  });
});
