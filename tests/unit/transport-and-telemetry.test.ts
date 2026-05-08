import { describe, it, expect } from 'vitest';
import { pickTransport, estimateThroughputKbps } from '../../src/shared/network/transport';
import { buildBatch, FixedNoiseSource, TELEMETRY_OFF, type CounterBucket } from '../../src/shared/analytics/telemetry';

describe('transport selection', () => {
  it('LAN p2p when same lan + mdns', () => {
    expect(pickTransport({ rttMs: 1, loss: 0, sameLan: true, nat: 'open', mdns: true, turn: false }, { bulk: true, reliable: true })).toBe('p2p-mdns');
  });
  it('symmetric NAT without TURN forces tcp-https', () => {
    expect(pickTransport({ rttMs: 80, loss: 0.01, sameLan: false, nat: 'symmetric', mdns: false, turn: false }, { bulk: true, reliable: true })).toBe('tcp-https');
  });
  it('quic-direct under loss for bulk', () => {
    expect(pickTransport({ rttMs: 60, loss: 0.1, sameLan: false, nat: 'cone', mdns: false, turn: true }, { bulk: true, reliable: true })).toBe('quic-direct');
  });
  it('throughput drops under loss', () => {
    const a = estimateThroughputKbps({ rttMs: 50, loss: 0, sameLan: false, nat: 'open', mdns: false, turn: false }, 64);
    const b = estimateThroughputKbps({ rttMs: 50, loss: 0.5, sameLan: false, nat: 'open', mdns: false, turn: false }, 64);
    expect(b).toBeLessThan(a);
  });
});

describe('telemetry', () => {
  it('returns null when all consent off', () => {
    const buckets: CounterBucket[] = [{ category: 'perf', name: 'fps', epsilon: 1, count: 60 }];
    expect(buildBatch({ consent: TELEMETRY_OFF, buckets, now: 0 }, new FixedNoiseSource([0.5]))).toBeNull();
  });
  it('emits noisy aggregates when consented', () => {
    const buckets: CounterBucket[] = [{ category: 'perf', name: 'fps', epsilon: 1, count: 60 }];
    const out = buildBatch({ consent: { perf: true, crash: false, feature: false, store: false }, buckets, now: 100 }, new FixedNoiseSource([0.5, 0.5]));
    expect(out).not.toBeNull();
    expect(out!.records[0]!.value).toBeGreaterThanOrEqual(0);
  });
});
