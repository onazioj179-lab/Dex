// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

describe('background tasks: DDrop transfers', () => {
  it('progress, completion, cancel and errors map onto one list', async () => {
    const handlers: Record<string, (p: unknown) => void> = {};
    const invoke = vi.fn(async () => ({ ok: true }));
    (window as any).dex = { on: (ch: string, cb: (p: unknown) => void) => { handlers[ch] = cb; }, invoke };
    const { wireDdropTasks, useBackgroundTasks, sortedTasks } = await import('../../src/renderer/services/backgroundTasks');
    wireDdropTasks();

    handlers['dtp:transfer-progress']({ transferId: 't1', deviceName: 'Laptop', totalBytes: 2097152, progress: 40, status: 'transferring', direction: 'receive' });
    let t = useBackgroundTasks.getState().tasks['ddrop:t1'];
    expect(t.title).toBe('Receiving from Laptop');
    expect(t.status).toBe('running');
    expect(t.progress).toBe(40);
    t.cancel!();
    expect(invoke).toHaveBeenCalledWith('dtp:cancelReceive', 't1');

    handlers['dtp:transfer-complete']({ transferId: 't1' });
    t = useBackgroundTasks.getState().tasks['ddrop:t1'];
    expect(t.status).toBe('completed');
    expect(t.cancel).toBeUndefined();

    handlers['dtp:transfer-progress']({ transferId: 't2', deviceName: 'Desk', progress: 10, status: 'transferring' });
    handlers['dtp:transfer-error']({ transferId: 't2', error: 'connection reset' });
    expect(useBackgroundTasks.getState().tasks['ddrop:t2'].status).toBe('failed');
    expect(useBackgroundTasks.getState().tasks['ddrop:t2'].error).toBe('connection reset');

    handlers['dtp:transfer-progress']({ transferId: 't3', progress: 5, status: 'transferring' });
    handlers['dtp:transfer-error']({ transferId: 't3', cancelled: true });
    expect(useBackgroundTasks.getState().tasks['ddrop:t3'].status).toBe('cancelled');

    handlers['dtp:transfer-progress']({ transferId: 't4', progress: 1, status: 'transferring' });
    expect(sortedTasks(useBackgroundTasks.getState().tasks)[0].id).toBe('ddrop:t4'); // running first
  });
});
