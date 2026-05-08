import { describe, it, expect } from 'vitest';
import { evaluateEntitlement, formatPairingCode, isPairingValid, type Entitlement } from '../../src/shared/license/entitlements';

const base: Entitlement = {
  packageId: 'com.example.x',
  licenseId: 'lic',
  issuer: 'dex.app',
  deviceIds: ['this-device'],
  issuedAt: '2026-01-01T00:00:00Z',
  lastValidatedAt: '2026-01-01T00:00:00Z',
  tier: 'pro',
};

describe('entitlements', () => {
  const ctx = (now: number) => ({ now, thisDeviceId: 'this-device' });
  it('valid when within grace', () => {
    expect(evaluateEntitlement(base, ctx(Date.parse('2026-01-10T00:00:00Z')))).toEqual({ ok: true, tier: 'pro' });
  });
  it('rejects when device not bound', () => {
    expect(evaluateEntitlement(base, { now: Date.parse('2026-01-10T00:00:00Z'), thisDeviceId: 'other' })).toEqual({ ok: false, reason: 'wrong-device' });
  });
  it('rejects beyond offline grace', () => {
    expect(evaluateEntitlement(base, ctx(Date.parse('2026-03-15T00:00:00Z')))).toEqual({ ok: false, reason: 'offline-grace-exceeded' });
  });
  it('pairing code formats with leading zeros', () => {
    expect(formatPairingCode(42)).toBe('000042');
  });
  it('pairing validity respects ttl', () => {
    expect(isPairingValid({ code: '000001', nonce: 'abc', ttlMs: 1000, createdAt: 0 }, 500)).toBe(true);
    expect(isPairingValid({ code: '000001', nonce: 'abc', ttlMs: 1000, createdAt: 0 }, 2000)).toBe(false);
  });
});
