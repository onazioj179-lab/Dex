import { describe, it, expect, vi } from 'vitest';
import { SyncEngine, type SyncOp, type PeerSender } from '../../src/shared/sync/syncEngine';
import type { NetCondition } from '../../src/shared/network/transport';

const lan: NetCondition = { rttMs: 1, loss: 0, sameLan: true, nat: 'open', mdns: true, turn: false };

describe('SyncEngine', () => {
  it('flushes pending ops via sender', async () => {
    const sender: PeerSender = { send: vi.fn(async () => {}) };
    const eng = new SyncEngine(() => lan, sender, () => {}, { batchMs: 0, maxBatch: 10, reliable: true });
    eng.enqueue({ t: 1, r: 'A', doc: 'd', payload: { x: 1 } });
    eng.enqueue({ t: 2, r: 'A', doc: 'd', payload: { x: 2 } });
    const n = await eng.flush();
    expect(n).toBe(2);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('shouldFlush honors size threshold', () => {
    const sender: PeerSender = { send: vi.fn(async () => {}) };
    const eng = new SyncEngine(() => lan, sender, () => {}, { batchMs: 999_999, maxBatch: 2, reliable: true });
    eng.enqueue({ t: 1, r: 'A', doc: 'd', payload: 1 });
    expect(eng.shouldFlush()).toBe(false);
    eng.enqueue({ t: 2, r: 'A', doc: 'd', payload: 2 });
    expect(eng.shouldFlush()).toBe(true);
  });

  it('receive applies ops to local handler', () => {
    const applied: SyncOp[] = [];
    const eng = new SyncEngine<unknown>(() => lan, { send: async () => {} }, op => applied.push(op));
    eng.receive([{ t: 1, r: 'B', doc: 'd', payload: 'x' }]);
    expect(applied.length).toBe(1);
  });

  it('uses p2p-mdns transport on LAN', async () => {
    let usedTransport = '';
    const sender: PeerSender = { send: async (b) => { usedTransport = b.transport; } };
    const eng = new SyncEngine(() => lan, sender, () => {}, { batchMs: 0, maxBatch: 10, reliable: true });
    eng.enqueue({ t: 1, r: 'A', doc: 'd', payload: 1 });
    // Force bulk to trigger p2p path: bulk requires >8.
    for (let i = 0; i < 9; i++) eng.enqueue({ t: i + 2, r: 'A', doc: 'd', payload: i });
    await eng.flush();
    expect(usedTransport).toBe('p2p-mdns');
  });
});
