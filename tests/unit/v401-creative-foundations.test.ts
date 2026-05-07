// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave A creative foundations tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  createUndoStack, pushUndo, undo, redo,
  createAutosaveState, recordEdit, shouldAutosave, markSaved, DEFAULT_AUTOSAVE,
  checkProjectHealth,
  validateExport,
  suggestRelinks,
  summariseQueue,
  defaultBudget, pickTierFromHeuristics,
} from '../../src/shared/creative/foundations';

describe('undo stack', () => {
  it('pushes and undoes', () => {
    let s = createUndoStack<number>();
    s = pushUndo(s, { id: '1', timestamp: 0, label: 'a', state: 1, byteSize: 10 }, { maxEntries: 10, maxBytes: 1000 });
    s = pushUndo(s, { id: '2', timestamp: 1, label: 'b', state: 2, byteSize: 10 }, { maxEntries: 10, maxBytes: 1000 });
    expect(s.past.length).toBe(2);
    const u = undo(s);
    expect(u.entry?.id).toBe('2');
    expect(u.stack.past.length).toBe(1);
    const r = redo(u.stack);
    expect(r.entry?.id).toBe('2');
    expect(r.stack.past.length).toBe(2);
  });

  it('caps by maxEntries', () => {
    let s = createUndoStack<number>();
    for (let i = 0; i < 20; i++) {
      s = pushUndo(s, { id: `${i}`, timestamp: i, label: 'x', state: i, byteSize: 1 }, { maxEntries: 5, maxBytes: 1e9 });
    }
    expect(s.past.length).toBe(5);
    expect(s.past[0].id).toBe('15');
  });

  it('caps by maxBytes', () => {
    let s = createUndoStack<number>();
    for (let i = 0; i < 5; i++) {
      s = pushUndo(s, { id: `${i}`, timestamp: i, label: 'x', state: i, byteSize: 100 }, { maxEntries: 100, maxBytes: 250 });
    }
    expect(s.totalBytes).toBeLessThanOrEqual(250);
    expect(s.past.length).toBeLessThan(5);
  });

  it('clears future on push', () => {
    let s = createUndoStack<number>();
    s = pushUndo(s, { id: '1', timestamp: 0, label: 'a', state: 1, byteSize: 1 }, { maxEntries: 10, maxBytes: 100 });
    const u = undo(s);
    expect(u.stack.future.length).toBe(1);
    const next = pushUndo(u.stack, { id: '2', timestamp: 1, label: 'b', state: 2, byteSize: 1 }, { maxEntries: 10, maxBytes: 100 });
    expect(next.future.length).toBe(0);
  });

  it('returns null on empty undo/redo', () => {
    const s = createUndoStack<number>();
    expect(undo(s).entry).toBeNull();
    expect(redo(s).entry).toBeNull();
  });
});

describe('autosave', () => {
  it('does not save without edits', () => {
    const s = createAutosaveState(0);
    expect(shouldAutosave(s, DEFAULT_AUTOSAVE, 60_000)).toBe(false);
  });
  it('saves when burst threshold hit', () => {
    let s = createAutosaveState(0);
    for (let i = 0; i < 25; i++) s = recordEdit(s, i);
    expect(shouldAutosave(s, DEFAULT_AUTOSAVE, 25)).toBe(true);
  });
  it('saves on idle', () => {
    let s = createAutosaveState(0);
    s = recordEdit(s, 1000);
    expect(shouldAutosave(s, DEFAULT_AUTOSAVE, 7000)).toBe(true);
  });
  it('marks saved clears edits', () => {
    let s = createAutosaveState(0);
    s = recordEdit(s, 100);
    s = markSaved(s, 200);
    expect(s.pendingEdits).toBe(0);
  });
});

describe('project health', () => {
  it('flags missing assets', () => {
    const issues = checkProjectHealth({ totalAssets: 10, missingAssets: 2, totalDurationMs: 1000, trackCount: 5, unsavedSeconds: 0, unusedAssetCount: 0, estimatedExportBytes: 0, diskFreeBytes: 1e12 });
    expect(issues.find(i => i.id === 'missing-assets')?.severity).toBe('error');
  });
  it('flags disk full', () => {
    const issues = checkProjectHealth({ totalAssets: 1, missingAssets: 0, totalDurationMs: 1000, trackCount: 5, unsavedSeconds: 0, unusedAssetCount: 0, estimatedExportBytes: 1e12, diskFreeBytes: 100 });
    expect(issues.find(i => i.id === 'disk-full')?.severity).toBe('error');
  });
  it('returns empty when all clear', () => {
    expect(checkProjectHealth({ totalAssets: 1, missingAssets: 0, totalDurationMs: 1000, trackCount: 5, unsavedSeconds: 0, unusedAssetCount: 0, estimatedExportBytes: 100, diskFreeBytes: 1e9 })).toEqual([]);
  });
});

describe('export validation', () => {
  it('rejects unknown format', () => {
    expect(validateExport({ format: 'xyz' }).ok).toBe(false);
  });
  it('requires width/height for video', () => {
    expect(validateExport({ format: 'mp4', fps: 30 }).ok).toBe(false);
  });
  it('warns odd dimensions', () => {
    const r = validateExport({ format: 'mp4', width: 1921, height: 1080, fps: 30 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('accepts valid wav', () => {
    expect(validateExport({ format: 'wav', sampleRate: 44100, bitDepth: 16, channels: 2 }).ok).toBe(true);
  });
});

describe('suggestRelinks', () => {
  it('matches by hash', () => {
    const out = suggestRelinks(
      [{ id: 'a', originalPath: '/x/foo.mp4', byteSize: 100, hash: 'h' }],
      [{ path: '/y/bar.mp4', byteSize: 100, hash: 'h' }],
    );
    expect(out[0].confidence).toBe(1);
  });
  it('matches by name + size', () => {
    const out = suggestRelinks(
      [{ id: 'a', originalPath: '/x/foo.mp4', byteSize: 100 }],
      [{ path: '/y/foo.mp4', byteSize: 100 }],
    );
    expect(out[0].confidence).toBeCloseTo(0.9);
  });
  it('returns empty when no candidates', () => {
    expect(suggestRelinks([{ id: 'a', originalPath: 'x', byteSize: 1 }], [])).toEqual([]);
  });
});

describe('queue summary', () => {
  it('counts statuses', () => {
    const stats = summariseQueue([
      { id: '1', status: 'completed', progress: 1, enqueuedAt: 0, startedAt: 0, finishedAt: 1000, error: null, payload: {} },
      { id: '2', status: 'queued', progress: 0, enqueuedAt: 0, startedAt: null, finishedAt: null, error: null, payload: {} },
      { id: '3', status: 'running', progress: 0.5, enqueuedAt: 0, startedAt: 500, finishedAt: null, error: null, payload: {} },
    ], 1500);
    expect(stats.completed).toBe(1);
    expect(stats.queued).toBe(1);
    expect(stats.running).toBe(1);
    expect(stats.averageDurationMs).toBe(1000);
  });
});

describe('perf tier', () => {
  it('low on battery default', () => {
    expect(pickTierFromHeuristics({ cores: 2, ramGb: 4, hasGpu: false, onBattery: true })).toBe('low');
  });
  it('high when high-spec on AC', () => {
    expect(pickTierFromHeuristics({ cores: 16, ramGb: 32, hasGpu: true, onBattery: false })).toBe('high');
  });
  it('default budgets sensible', () => {
    expect(defaultBudget('high').maxFrameMs).toBeLessThan(defaultBudget('low').maxFrameMs);
  });
});
