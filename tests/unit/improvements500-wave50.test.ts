// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  FocusModeController,
  takeWorkspaceLayoutSnapshot,
  isWorkspaceLayoutSnapshot,
  diffWorkspaceLayoutSnapshots,
  computeHealthScore,
  MemoryPressureMonitor,
  semanticChunker,
  confidenceMeter,
  IpcCallTracer,
  classifyCrash,
  summarizeCrashes,
  AutosaveCoordinator,
  AttentionBudget,
} from '../../src/renderer/improvements500';

describe('improvements500 Wave 50', () => {
  it('FocusModeController toggles state and notifies subscribers', () => {
    const c = new FocusModeController();
    const seen: boolean[] = [];
    c.subscribe((s) => seen.push(s.active));
    c.enter('manual');
    c.enter('manual');
    c.exit();
    expect(c.getState().active).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it('workspace layout snapshot roundtrip and diff', () => {
    const a = takeWorkspaceLayoutSnapshot('w1', 'A', [
      { windowId: '1', appId: 'files', x: 0, y: 0, width: 100, height: 100 },
      { windowId: '2', appId: 'notes', x: 50, y: 50, width: 200, height: 200 },
    ]);
    expect(isWorkspaceLayoutSnapshot(a)).toBe(true);
    const b = takeWorkspaceLayoutSnapshot('w1', 'A', [
      { windowId: '1', appId: 'files', x: 10, y: 0, width: 100, height: 100 },
      { windowId: '3', appId: 'tasks', x: 0, y: 0, width: 50, height: 50 },
    ]);
    const diff = diffWorkspaceLayoutSnapshots(a, b);
    expect(diff.added).toEqual(['3']);
    expect(diff.removed).toEqual(['2']);
    expect(diff.moved).toEqual(['1']);
  });

  it('computeHealthScore bands', () => {
    const healthy = computeHealthScore({
      crashFreeRatio: 1, memoryHeadroomRatio: 0.9,
      frameBudgetPassRatio: 0.95, ipcSuccessRatio: 1,
    });
    expect(healthy.band).toBe('healthy');
    const critical = computeHealthScore({
      crashFreeRatio: 0.2, memoryHeadroomRatio: 0.1,
      frameBudgetPassRatio: 0.3, ipcSuccessRatio: 0.5,
    });
    expect(critical.band).toBe('critical');
  });

  it('MemoryPressureMonitor transitions with hysteresis', () => {
    const m = new MemoryPressureMonitor({ elevated: 0.7, critical: 0.9, hysteresis: 0.05 });
    const seen: string[] = [];
    m.subscribe((lvl) => seen.push(lvl));
    expect(m.report(0.5)).toBe('nominal');
    expect(m.report(0.75)).toBe('elevated');
    expect(m.report(0.95)).toBe('critical');
    expect(m.report(0.72)).toBe('elevated');
    expect(m.report(0.6)).toBe('nominal');
    expect(seen).toEqual(['elevated', 'critical', 'elevated', 'nominal']);
  });

  it('semanticChunker respects target size and overlap', () => {
    const text = 'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five. Sentence six.';
    const chunks = semanticChunker(text, { targetSize: 30, overlap: 5, minSize: 8 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.start).toBe(0);
    expect(chunks[chunks.length - 1]!.end).toBe(text.length);
    expect(semanticChunker('', {}).length).toBe(0);
  });

  it('confidenceMeter blends inputs into bands', () => {
    expect(confidenceMeter({ similarity: 0.95, modelProbability: 0.9, prior: 0.8, evidenceCount: 8 }).band).toBe('high');
    const low = confidenceMeter({ similarity: 0.1, modelProbability: 0.1, prior: 0.1 });
    expect(low.band).toBe('low');
    expect(low.score).toBeLessThan(0.3);
  });

  it('IpcCallTracer measures span duration', async () => {
    vi.useFakeTimers();
    const t = new IpcCallTracer();
    const results: number[] = [];
    t.subscribe((r) => results.push(r.durationMs));
    const span = t.start('files:list', undefined, 1000);
    expect(t.inflight()).toBe(1);
    const r = t.finish(span.id, 'ok', undefined, 1042);
    expect(r?.durationMs).toBe(42);
    expect(results).toEqual([42]);
    expect(t.inflight()).toBe(0);
    vi.useRealTimers();
  });

  it('classifyCrash maps reason text to taxonomy', () => {
    expect(classifyCrash({ reason: 'GPU process exited' })).toBe('gpu');
    expect(classifyCrash({ message: 'Out of memory' })).toBe('memory');
    expect(classifyCrash({ type: 'unhandled-rejection' })).toBe('unhandled-rejection');
    expect(classifyCrash({ message: 'something' })).toBe('unknown');
    const summary = summarizeCrashes([
      { reason: 'gpu' }, { reason: 'gpu' }, { message: 'native panic' },
    ]);
    expect(summary.gpu).toBe(2);
    expect(summary.native).toBe(1);
  });

  it('AutosaveCoordinator coalesces and serializes flushes', async () => {
    const calls: number[] = [];
    let inflight = 0;
    let maxInflight = 0;
    const coord = new AutosaveCoordinator({ debounceMs: 5 });
    coord.register('w', async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 5));
      calls.push(Date.now());
      inflight -= 1;
    });
    await Promise.all([coord.flush('w'), coord.flush('w'), coord.flush('w')]);
    expect(maxInflight).toBe(1);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it('AttentionBudget enforces interruption limit and rolls window', () => {
    const b = new AttentionBudget({ windowMs: 1000, maxInterruptions: 3 });
    expect(b.record(1, 0)).toBe(true);
    expect(b.record(1, 100)).toBe(true);
    expect(b.record(1, 200)).toBe(true);
    expect(b.canInterrupt(1, 300)).toBe(false);
    expect(b.record(1, 300)).toBe(false);
    expect(b.canInterrupt(1, 1500)).toBe(true);
  });
});
