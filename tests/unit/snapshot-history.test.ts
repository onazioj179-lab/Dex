import { describe, it, expect } from 'vitest';
import { SnapshotHistory, createSnapshotHistory } from '../../src/shared/creative/history';

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
});
