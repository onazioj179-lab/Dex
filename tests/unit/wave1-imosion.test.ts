// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { AutomationLane, type AutomationLaneState } from '../../src/shared/audio/automation';
import { planRouting, type RoutingGraph } from '../../src/shared/audio/sidechain';
import { validateManifest, BUILTIN_PLUGINS, SDK_VERSION } from '../../src/shared/audio/pluginHost';

function makeState(min: number, max: number): AutomationLaneState {
  return { id: 'test', points: [], defaultValue: 0, min, max };
}

describe('Wave 1 — Imosion DAW depth', () => {
  describe('AutomationLane', () => {
    it('linear interpolates between points', () => {
      const lane = new AutomationLane(makeState(0, 1));
      lane.addPoint({ t: 0, v: 0, curve: 'linear' });
      lane.addPoint({ t: 1, v: 1, curve: 'linear' });
      expect(lane.valueAt(0.5)).toBeCloseTo(0.5, 5);
    });
    it('hold curve keeps value flat', () => {
      const lane = new AutomationLane(makeState(0, 1));
      lane.addPoint({ t: 0, v: 0.2, curve: 'hold' });
      lane.addPoint({ t: 1, v: 0.9, curve: 'hold' });
      expect(lane.valueAt(0.7)).toBeCloseTo(0.2, 5);
    });
    it('bake produces correct length', () => {
      const lane = new AutomationLane(makeState(0, 1));
      lane.addPoint({ t: 0, v: 0 });
      lane.addPoint({ t: 1, v: 1 });
      const buf = lane.bake(0, 1, 100);
      expect(buf.length).toBe(100);
    });
    it('clamps to min/max range', () => {
      const lane = new AutomationLane(makeState(-1, 1));
      lane.addPoint({ t: 0, v: 5 });
      expect(lane.valueAt(0)).toBe(1);
    });
  });

  describe('planRouting', () => {
    it('produces topological process order', () => {
      const graph: RoutingGraph = {
        master: 'master',
        buses: [{ id: 'bus-a', output: 'master' }, { id: 'master', output: 'master' }],
        tracks: [
          { id: 't1', source: { kind: 'input', id: 'in0' }, sends: [{ toBus: 'bus-a', level: 1, pre: false, pan: 0 }], outputBus: 'master', sidechains: [] },
          { id: 't2', source: { kind: 'bus', id: 'bus-a' }, sends: [], outputBus: 'master', sidechains: [] },
        ],
      };
      const plan = planRouting(graph);
      expect(plan.processOrder.indexOf('t1')).toBeLessThan(plan.processOrder.indexOf('t2'));
    });
    it('returns a plan object with expected shape', () => {
      const graph: RoutingGraph = {
        master: 'master',
        buses: [{ id: 'master', output: 'master' }],
        tracks: [
          { id: 't1', source: { kind: 'input', id: 'in0' }, sends: [], outputBus: 'master', sidechains: [] },
        ],
      };
      const plan = planRouting(graph);
      expect(Array.isArray(plan.processOrder)).toBe(true);
      expect(plan.cycles).toBeDefined();
    });
  });

  describe('plugin manifests', () => {
    it('all builtin plugins validate', () => {
      for (const p of BUILTIN_PLUGINS) {
        const issues = validateManifest(p);
        expect(issues, `${p.id} should be valid`).toEqual([]);
      }
    });
    it('rejects manifest missing id', () => {
      const issues = validateManifest({ name: 'X', sdkVersion: SDK_VERSION } as never);
      expect(issues.length).toBeGreaterThan(0);
    });
  });
});
