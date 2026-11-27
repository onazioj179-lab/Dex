// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { expect, it, vi } from 'vitest';
import { ContextBus } from '../../src/renderer/services/ContextBus';
import { startContextEngine } from '../../src/renderer/services/contextEngineWiring';

it('records work with its target ID once even when context startup is requested twice', () => {
  const invoke = vi.fn().mockResolvedValue({ success: true });
  vi.stubGlobal('dex', { invoke });
  try {
    startContextEngine();
    startContextEngine();
    ContextBus.emit('note:opened', { id: 'note-a', title: 'Design review' });
    ContextBus.emit('file:opened', { appId: 'dexcode', path: 'C:\\Work\\main.rs' });
    ContextBus.emit('task:created', { id: 'task-a', title: 'Check search' });
    expect(invoke.mock.calls.filter(call => call[0] === 'activity-feed:record')).toEqual([
      ['activity-feed:record', 'note', 'DEX', 'notes', 'Design review', { contextId: 'note-a' }],
      ['activity-feed:record', 'file', 'DEX', 'files', 'Opened main.rs', { contextId: 'C:\\Work\\main.rs' }],
      ['activity-feed:record', 'task', 'DEX', 'tasks', 'Created Check search', { contextId: 'task-a' }],
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});
