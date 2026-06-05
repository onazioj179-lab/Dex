import { describe, it, expect } from 'vitest';
import { SnapshotHistory, createSnapshotHistory, capHistoryTail } from '../../src/shared/creative/history';

describe('SnapshotHistory', () => {
  it('pushes, undoes and redoes', () => {
    const h = new SnapshotHistory<number>();
    h.push(1); h.push(2); h.push(3);
    expect(h.current()).toBe(3);
    expect(h.undo()).toBe(2);
    expect(h.undo()).toBe(1);
    expect(h.canUndo()).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe(2);
    expect(h.redo()).toBe(3);
    expect(h.canRedo()).toBe(false);
  });

  it('truncates the redo tail on a new push', () => {
    const h = createSnapshotHistory<string>();
    h.push('a'); h.push('b'); h.push('c');
    h.undo(); h.undo(); // at 'a'
    h.push('x');
    expect(h.current()).toBe('x');
    expect(h.canRedo()).toBe(false);
    expect(h.size()).toBe(2); // 'a','x'
  });

  it('enforces the depth cap from the oldest end', () => {
    const h = new SnapshotHistory<number>({ limit: 3 });
    for (let i = 1; i <= 5; i++) h.push(i);
    expect(h.size()).toBe(3);
    expect(h.current()).toBe(5);
    expect(h.undo()).toBe(4);
    expect(h.undo()).toBe(3);
    expect(h.canUndo()).toBe(false); // 1 and 2 were dropped
  });

  it('coalesces rapid pushes within the window', () => {
    let t = 1000;
    const h = new SnapshotHistory<number>({ coalesceMs: 100, now: () => t });
    h.push(1);
    t += 50; h.push(2); // within window → replaces
    expect(h.size()).toBe(1);
    expect(h.current()).toBe(2);
    t += 200; h.push(3); // outside window → new step
    expect(h.size()).toBe(2);
    expect(h.undo()).toBe(2);
  });

  it('reports coherent state and clears', () => {
    const h = new SnapshotHistory<number>();
    h.push(1); h.push(2);
    expect(h.state()).toEqual({ size: 2, index: 1, canUndo: true, canRedo: false });
    h.clear();
    expect(h.state()).toEqual({ size: 0, index: -1, canUndo: false, canRedo: false });
    expect(h.current()).toBeNull();
  });

  describe('byte budget (memory cap)', () => {
    // Each snapshot is a fixed-size blob; budget holds ~3 of them.
    const sizeOf = (s: { bytes: number }) => s.bytes;

    it('evicts oldest snapshots once the byte budget is exceeded', () => {
      const h = new SnapshotHistory<{ id: number; bytes: number }>({ maxBytes: 300, sizeOf, limit: 100 });
      for (let i = 1; i <= 6; i++) h.push({ id: i, bytes: 100 });
      // 300 budget / 100 each → at most 3 retained, oldest dropped first.
      expect(h.size()).toBe(3);
      expect(h.bytes()).toBe(300);
      expect(h.current()).toEqual({ id: 6, bytes: 100 });
      expect(h.undo()).toEqual({ id: 5, bytes: 100 });
      expect(h.undo()).toEqual({ id: 4, bytes: 100 });
      expect(h.canUndo()).toBe(false); // 1–3 evicted by the memory cap
    });

    it('never evicts the current snapshot, even if it alone exceeds the budget', () => {
      const h = new SnapshotHistory<{ bytes: number }>({ maxBytes: 50, sizeOf });
      h.push({ bytes: 1000 });
      expect(h.size()).toBe(1);
      expect(h.current()).toEqual({ bytes: 1000 });
      expect(h.bytes()).toBe(1000); // over budget, but it's the only (current) state
    });

    it('tracks bytes through redo-tail truncation', () => {
      const h = new SnapshotHistory<{ bytes: number }>({ maxBytes: 0, sizeOf });
      h.push({ bytes: 10 }); h.push({ bytes: 20 }); h.push({ bytes: 30 });
      expect(h.bytes()).toBe(60);
      h.undo(); h.undo();            // back to the 10-byte snapshot
      h.push({ bytes: 5 });          // truncates the 20 + 30 tail
      expect(h.size()).toBe(2);
      expect(h.bytes()).toBe(15);    // 10 + 5, the discarded tail is reclaimed
    });

    it('updates the byte total when a coalesced push replaces the current', () => {
      let t = 0;
      const h = new SnapshotHistory<{ bytes: number }>({ coalesceMs: 100, sizeOf, now: () => t });
      h.push({ bytes: 10 });
      t += 10; h.push({ bytes: 40 }); // coalesces, replacing 10 → 40
      expect(h.size()).toBe(1);
      expect(h.bytes()).toBe(40);
    });

    it('is a no-op cap when sizeOf is omitted (bytes stay 0)', () => {
      const h = new SnapshotHistory<number>({ maxBytes: 10 });
      for (let i = 0; i < 50; i++) h.push(i);
      expect(h.bytes()).toBe(0);
      expect(h.size()).toBe(50); // byte cap can't act without a sizer; depth cap (100) governs
    });
  });
});

describe('capHistoryTail (React [history, index] model)', () => {
  it('returns the same array when within the limit', () => {
    const hist = [1, 2, 3];
    const out = capHistoryTail(hist, 2, 5);
    expect(out.history).toBe(hist); // no copy
    expect(out.index).toBe(2);
  });

  it('drops the oldest entries and shifts the index', () => {
    const hist = [1, 2, 3, 4, 5];
    const out = capHistoryTail(hist, 4, 3); // keep newest 3 → [3,4,5]
    expect(out.history).toEqual([3, 4, 5]);
    expect(out.index).toBe(2); // 4 - (5-3)
  });

  it('clamps a shifted index to 0 (never negative)', () => {
    const out = capHistoryTail([1, 2, 3, 4], 0, 2); // current was oldest
    expect(out.history).toEqual([3, 4]);
    expect(out.index).toBe(0);
  });

  it('treats limit < 1 as 1', () => {
    const out = capHistoryTail([1, 2, 3], 2, 0);
    expect(out.history).toEqual([3]);
    expect(out.index).toBe(0);
  });
});
