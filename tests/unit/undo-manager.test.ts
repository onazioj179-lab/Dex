// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('undoManager', () => {
  let undoManager: any;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../src/renderer/services/undoManager');
    undoManager = mod.undoManager;
    undoManager.clear();
  });

  const makeCmd = (overrides?: Partial<{ description: string; appName: string }>) => ({
    appName: 'TestApp',
    description: 'Test command',
    execute: vi.fn(),
    undo: vi.fn(),
    ...overrides,
  });

  describe('initial state', () => {
    it('starts with empty stack', () => {
      expect(undoManager.getState().stack).toHaveLength(0);
    });

    it('starts with index -1', () => {
      expect(undoManager.getState().index).toBe(-1);
    });

    it('canUndo is false when empty', () => {
      expect(undoManager.canUndo()).toBe(false);
    });

    it('canRedo is false when empty', () => {
      expect(undoManager.canRedo()).toBe(false);
    });
  });

  describe('push', () => {
    it('adds command to stack', () => {
      undoManager.push(makeCmd());
      expect(undoManager.getState().stack).toHaveLength(1);
    });

    it('increments index', () => {
      undoManager.push(makeCmd());
      expect(undoManager.getState().index).toBe(0);
    });

    it('assigns id and timestamp', () => {
      undoManager.push(makeCmd());
      const [cmd] = undoManager.getState().stack;
      expect(cmd.id).toMatch(/^undo-/);
      expect(cmd.timestamp).toBeGreaterThan(0);
    });

    it('multiple pushes increment stack', () => {
      undoManager.push(makeCmd({ description: 'cmd1' }));
      undoManager.push(makeCmd({ description: 'cmd2' }));
      undoManager.push(makeCmd({ description: 'cmd3' }));
      expect(undoManager.getState().stack).toHaveLength(3);
      expect(undoManager.getState().index).toBe(2);
    });

    it('truncates redo history when pushing after undo', () => {
      undoManager.push(makeCmd({ description: 'cmd1' }));
      undoManager.push(makeCmd({ description: 'cmd2' }));
      undoManager.undo();
      undoManager.push(makeCmd({ description: 'cmd3' }));
      expect(undoManager.getState().stack).toHaveLength(2);
      expect(undoManager.getState().stack[1].description).toBe('cmd3');
    });

    it('notifies listeners on push', () => {
      const listener = vi.fn();
      undoManager.subscribe(listener);
      undoManager.push(makeCmd());
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('undo', () => {
    it('calls undo on command', () => {
      const cmd = makeCmd();
      undoManager.push(cmd);
      undoManager.undo();
      expect(cmd.undo).toHaveBeenCalledOnce();
    });

    it('decrements index', () => {
      undoManager.push(makeCmd());
      undoManager.undo();
      expect(undoManager.getState().index).toBe(-1);
    });

    it('returns false when nothing to undo', () => {
      expect(undoManager.undo()).toBe(false);
    });

    it('returns true when successfully undone', () => {
      undoManager.push(makeCmd());
      expect(undoManager.undo()).toBe(true);
    });

    it('enables redo after undo', () => {
      undoManager.push(makeCmd());
      undoManager.undo();
      expect(undoManager.canRedo()).toBe(true);
    });

    it('notifies listeners on undo', () => {
      const listener = vi.fn();
      undoManager.push(makeCmd());
      undoManager.subscribe(listener);
      listener.mockClear();
      undoManager.undo();
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('redo', () => {
    it('calls execute on command', () => {
      const cmd = makeCmd();
      undoManager.push(cmd);
      undoManager.undo();
      undoManager.redo();
      expect(cmd.execute).toHaveBeenCalledOnce();
    });

    it('increments index on redo', () => {
      undoManager.push(makeCmd());
      undoManager.undo();
      undoManager.redo();
      expect(undoManager.getState().index).toBe(0);
    });

    it('returns false when nothing to redo', () => {
      undoManager.push(makeCmd());
      expect(undoManager.redo()).toBe(false);
    });

    it('returns true when successfully redone', () => {
      undoManager.push(makeCmd());
      undoManager.undo();
      expect(undoManager.redo()).toBe(true);
    });
  });

  describe('undoToPoint', () => {
    it('undoes to a specific index', () => {
      const cmd1 = makeCmd({ description: 'cmd1' });
      const cmd2 = makeCmd({ description: 'cmd2' });
      const cmd3 = makeCmd({ description: 'cmd3' });
      undoManager.push(cmd1);
      undoManager.push(cmd2);
      undoManager.push(cmd3);
      undoManager.undoToPoint(0);
      expect(undoManager.getState().index).toBe(0);
      expect(cmd3.undo).toHaveBeenCalledOnce();
      expect(cmd2.undo).toHaveBeenCalledOnce();
      expect(cmd1.undo).not.toHaveBeenCalled();
    });

    it('returns false for invalid target index', () => {
      undoManager.push(makeCmd());
      expect(undoManager.undoToPoint(5)).toBe(false);
      expect(undoManager.undoToPoint(-2)).toBe(false);
    });

    it('undoToPoint(-1) undoes all commands', () => {
      undoManager.push(makeCmd({ description: 'cmd1' }));
      undoManager.push(makeCmd({ description: 'cmd2' }));
      undoManager.undoToPoint(-1);
      expect(undoManager.getState().index).toBe(-1);
    });
  });

  describe('max stack enforcement', () => {
    it('does not exceed 100 commands', () => {
      for (let i = 0; i < 105; i++) {
        undoManager.push(makeCmd({ description: `cmd-${i}` }));
      }
      expect(undoManager.getState().stack).toHaveLength(100);
    });

    it('trims oldest commands first', () => {
      for (let i = 0; i < 105; i++) {
        undoManager.push(makeCmd({ description: `cmd-${i}` }));
      }
      const { stack } = undoManager.getState();
      expect(stack[0].description).toBe('cmd-5');
      expect(stack[99].description).toBe('cmd-104');
    });
  });

  describe('getRecentHistory', () => {
    it('returns last N commands', () => {
      for (let i = 0; i < 5; i++) {
        undoManager.push(makeCmd({ description: `cmd-${i}` }));
      }
      const history = undoManager.getRecentHistory(3);
      expect(history).toHaveLength(3);
      expect(history[2].description).toBe('cmd-4');
    });

    it('returns all when count > stack length', () => {
      undoManager.push(makeCmd());
      expect(undoManager.getRecentHistory(50)).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('empties the stack', () => {
      undoManager.push(makeCmd());
      undoManager.push(makeCmd());
      undoManager.clear();
      expect(undoManager.getState().stack).toHaveLength(0);
      expect(undoManager.getState().index).toBe(-1);
    });

    it('notifies listeners', () => {
      const listener = vi.fn();
      undoManager.push(makeCmd());
      undoManager.subscribe(listener);
      listener.mockClear();
      undoManager.clear();
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = undoManager.subscribe(listener);
      expect(typeof unsub).toBe('function');
    });

    it('stops notifications after unsubscribe', () => {
      const listener = vi.fn();
      const unsub = undoManager.subscribe(listener);
      unsub();
      undoManager.push(makeCmd());
      expect(listener).not.toHaveBeenCalled();
    });

    it('multiple subscribers all notified', () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      undoManager.subscribe(l1);
      undoManager.subscribe(l2);
      undoManager.push(makeCmd());
      expect(l1).toHaveBeenCalledOnce();
      expect(l2).toHaveBeenCalledOnce();
    });
  });

  describe('record', () => {
    it('record is alias for push (does not execute)', () => {
      const cmd = makeCmd();
      undoManager.record(cmd);
      expect(cmd.execute).not.toHaveBeenCalled();
      expect(undoManager.getState().stack).toHaveLength(1);
    });
  });

  describe('getCurrentIndex', () => {
    it('returns current index', () => {
      undoManager.push(makeCmd());
      undoManager.push(makeCmd());
      expect(undoManager.getCurrentIndex()).toBe(1);
    });
  });

  describe('canUndo / canRedo after operations', () => {
    it('reflects correct state through push/undo/redo cycle', () => {
      expect(undoManager.canUndo()).toBe(false);
      expect(undoManager.canRedo()).toBe(false);

      undoManager.push(makeCmd());
      expect(undoManager.canUndo()).toBe(true);
      expect(undoManager.canRedo()).toBe(false);

      undoManager.undo();
      expect(undoManager.canUndo()).toBe(false);
      expect(undoManager.canRedo()).toBe(true);

      undoManager.redo();
      expect(undoManager.canUndo()).toBe(true);
      expect(undoManager.canRedo()).toBe(false);
    });
  });
});
