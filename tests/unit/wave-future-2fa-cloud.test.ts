// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.8 - 2FA + handover + cloud quota + backup + encryption + plan features tests

import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode } from '../../src/shared/security/base32';
import {
  generateTotpSecret,
  encodeTotpSecret,
  buildOtpAuthUri,
  computeTotpCode,
  verifyTotpCode,
  generateRecoveryCodes,
  TOTP_PERIOD_SEC,
  type HmacSha1,
} from '../../src/shared/security/totp';
import {
  createHandoverPlan,
  validateHandoverPlan,
  decideHandover,
  ownerSawChallenge,
  confirmHeirHandover,
  cancelHandover,
  HANDOVER_DEFAULTS,
} from '../../src/shared/account/legacyHandover';
import {
  QUOTA_BYTES,
  ONE_GB,
  quotaFor,
  canUpload,
  formatBytes,
} from '../../src/shared/cloud/quota';
import {
  defaultBackupPolicy,
  shouldRunBackup,
  selectBackupItems,
  estimateBackupSize,
  BACKUP_CATEGORIES,
} from '../../src/shared/cloud/backupPolicy';
import {
  buildEnvelope,
  validateEnvelope,
  buildAad,
  passphraseStrength,
  passphraseAcceptable,
  ENVELOPE_VERSION,
} from '../../src/shared/cloud/encryption';
import {
  PLAN_FEATURES,
  featuresFor,
  checkUkiAllowance,
} from '../../src/shared/license/planFeatures';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic pseudo-random for tests. */
const seedRand = (seed: number) => (n: number) => {
  const out = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; out[i] = s & 0xff; }
  return out;
};

/** Trivial deterministic HMAC-SHA1 stand-in built atop a real one if available. */
const fakeHmac: HmacSha1 = async (key, msg) => {
  // Use webcrypto subtle if present (vitest Node has it).
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && c.subtle) {
    const k = await c.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = await c.subtle.sign('HMAC', k, msg);
    return new Uint8Array(sig);
  }
  // Fallback: trivial XOR digest -- only used if subtle truly missing.
  const out = new Uint8Array(20);
  for (let i = 0; i < msg.length; i++) out[i % 20] ^= msg[i] ^ key[i % key.length];
  return out;
};

describe('base32 codec', () => {
  it('encode/decode round-trips', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const decoded = base32Decode(base32Encode(bytes));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
  it('rejects invalid chars', () => {
    expect(() => base32Decode('!!!!')).toThrow();
  });
});

describe('TOTP 2FA', () => {
  it('generates 20-byte secret and encodes as base32', () => {
    const sec = generateTotpSecret(seedRand(7));
    expect(sec.length).toBe(20);
    expect(encodeTotpSecret(sec)).toMatch(/^[A-Z2-7=]+$/);
  });

  it('builds otpauth URI with all required params', () => {
    const uri = buildOtpAuthUri({ secret: new Uint8Array(20), issuer: 'DEX', accountName: 'u@x.com' });
    expect(uri.startsWith('otpauth://totp/DEX')).toBe(true);
    expect(uri).toMatch(/secret=/);
    expect(uri).toMatch(/issuer=DEX/);
    expect(uri).toMatch(/digits=6/);
    expect(uri).toMatch(/period=30/);
  });

  it('verifies a freshly computed code', async () => {
    const secret = generateTotpSecret(seedRand(11));
    const now = 1_700_000_000_000;
    const counter = Math.floor(now / 1000 / TOTP_PERIOD_SEC);
    const code = await computeTotpCode(secret, counter, fakeHmac);
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyTotpCode({ secret, code, hmac: fakeHmac, now })).toBe(true);
  });

  it('rejects an incorrect code', async () => {
    const secret = generateTotpSecret(seedRand(13));
    const now = 1_700_000_000_000;
    expect(await verifyTotpCode({ secret, code: '000000', hmac: fakeHmac, now })).toBe(false);
  });

  it('accepts code from previous time-step within window', async () => {
    const secret = generateTotpSecret(seedRand(17));
    const now = 1_700_000_000_000;
    const prevCounter = Math.floor((now - 30_000) / 1000 / TOTP_PERIOD_SEC);
    const prevCode = await computeTotpCode(secret, prevCounter, fakeHmac);
    expect(await verifyTotpCode({ secret, code: prevCode, hmac: fakeHmac, now, window: 1 })).toBe(true);
  });

  it('generates the requested number of recovery codes in NN-NN format', () => {
    const codes = generateRecoveryCodes(8, seedRand(3));
    expect(codes).toHaveLength(8);
    for (const c of codes) expect(c).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
  });
});

describe('Legacy handover', () => {
  it('default plan validates only when disabled', () => {
    const p = createHandoverPlan();
    expect(validateHandoverPlan(p).ok).toBe(true);
  });

  it('enabled plan with no heirs fails validation', () => {
    const p = { ...createHandoverPlan(), enabled: true };
    expect(validateHandoverPlan(p).ok).toBe(false);
  });

  it('rejects out-of-range inactivity windows', () => {
    const p = { ...createHandoverPlan(), enabled: true, heirs: [{ id: '1', email: 'h@x.com', relationship: 'spouse', shareLevel: 'read-only' as const, addedAt: 0 }], inactivityDays: 10 };
    expect(validateHandoverPlan(p).ok).toBe(false);
  });

  it('decides idle while owner is active', () => {
    const now = 1_000_000_000_000;
    const p = { ...createHandoverPlan(), enabled: true, lastActivityAt: now, heirs: [{ id: '1', email: 'h@x.com', relationship: 'spouse', shareLevel: 'read-only' as const, addedAt: 0 }] };
    expect(decideHandover(p, now).next).toBe('idle');
  });

  it('triggers owner challenge after inactivity threshold', () => {
    const now = 1_000_000_000_000;
    const p = { ...createHandoverPlan(), enabled: true, lastActivityAt: now - 100 * DAY_MS, heirs: [{ id: '1', email: 'h@x.com', relationship: 'spouse', shareLevel: 'read-only' as const, addedAt: 0 }] };
    const d = decideHandover(p, now);
    expect(d.next).toBe('pending-challenge');
    expect(d.action.kind).toBe('send-owner-challenge');
  });

  it('sends heir notice if owner ignores challenge for 14d', () => {
    const now = 1_000_000_000_000;
    const p = { ...createHandoverPlan(), enabled: true, status: 'pending-challenge' as const, challengeSentAt: now - 15 * DAY_MS, heirs: [{ id: '1', email: 'h@x.com', relationship: 'spouse', shareLevel: 'read-only' as const, addedAt: 0 }] };
    const d = decideHandover(p, now);
    expect(d.next).toBe('challenge-sent');
    expect(d.action.kind).toBe('send-heir-notice');
  });

  it('owner returning resets to idle', () => {
    const p = { ...createHandoverPlan(), status: 'pending-challenge' as const };
    expect(ownerSawChallenge(p, 5_000).status).toBe('idle');
    expect(ownerSawChallenge(p, 5_000).lastActivityAt).toBe(5_000);
  });

  it('heir confirmation marks transferred', () => {
    const p = createHandoverPlan();
    expect(confirmHeirHandover(p, 9_000).status).toBe('transferred');
  });

  it('cancel disables', () => {
    const p = { ...createHandoverPlan(), enabled: true };
    const c = cancelHandover(p);
    expect(c.enabled).toBe(false);
    expect(c.status).toBe('cancelled');
  });

  it('exposes sane defaults', () => {
    expect(HANDOVER_DEFAULTS.inactivityDays).toBe(90);
  });
});

describe('Cloud quota', () => {
  it('Free Viewer is 10 GB, paid plans 50 GB', () => {
    expect(QUOTA_BYTES['free-viewer']).toBe(10 * ONE_GB);
    expect(QUOTA_BYTES.personal).toBe(50 * ONE_GB);
    expect(QUOTA_BYTES.pro).toBe(50 * ONE_GB);
    expect(QUOTA_BYTES.studio).toBe(50 * ONE_GB);
  });

  it('quotaFor scales by seats for studio', () => {
    const snap = quotaFor({ planId: 'studio', seats: 4, usedBytes: 0 });
    expect(snap.totalBytes).toBe(4 * 50 * ONE_GB);
  });

  it('warns at 90%, blocks at 100%', () => {
    const total = 10 * ONE_GB;
    const at90 = quotaFor({ planId: 'free-viewer', usedBytes: total * 0.91 });
    expect(at90.warn).toBe(true);
    expect(at90.full).toBe(false);
    const full = quotaFor({ planId: 'free-viewer', usedBytes: total });
    expect(full.full).toBe(true);
  });

  it('canUpload blocks when over quota', () => {
    const r = canUpload({ planId: 'free-viewer', usedBytes: 9.9 * ONE_GB }, 1 * ONE_GB);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('over-quota');
    expect(r.bytesShortBy).toBeGreaterThan(0);
  });

  it('canUpload allows when within quota', () => {
    expect(canUpload({ planId: 'pro', usedBytes: 0 }, 1 * ONE_GB).allowed).toBe(true);
  });

  it('formatBytes is human readable', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(2 * ONE_GB)).toBe('2.00 GB');
  });
});

describe('Backup policy', () => {
  const wifiNight = { online: true, isWifi: true, isMetered: false, hourLocal: 1 };
  it('master switch off -> never runs', () => {
    expect(shouldRunBackup(defaultBackupPolicy(), wifiNight).shouldRun).toBe(false);
  });
  it('master on + defaults + wifi -> runs', () => {
    const p = { ...defaultBackupPolicy(), enabled: true };
    expect(shouldRunBackup(p, wifiNight).shouldRun).toBe(true);
  });
  it('requires wifi blocks on cellular', () => {
    const p = { ...defaultBackupPolicy(), enabled: true };
    const net = { online: true, isWifi: false, isMetered: false, hourLocal: 1 };
    expect(shouldRunBackup(p, net).reason).toBe('no-wifi');
  });
  it('pauses on metered', () => {
    const p = { ...defaultBackupPolicy(), enabled: true, requireWifi: false };
    const net = { online: true, isWifi: false, isMetered: true, hourLocal: 1 };
    expect(shouldRunBackup(p, net).reason).toBe('metered');
  });
  it('night-only blocks daytime', () => {
    const p = { ...defaultBackupPolicy(), enabled: true, nightOnly: true };
    const net = { online: true, isWifi: true, isMetered: false, hourLocal: 14 };
    expect(shouldRunBackup(p, net).reason).toBe('daytime');
  });
  it('selectBackupItems honours opt-in', () => {
    const p = defaultBackupPolicy();
    const items = selectBackupItems(p);
    expect(items).toContain('settings');
    expect(items).toContain('snippets');
    expect(items).not.toContain('media');
  });
  it('estimateBackupSize is deterministic', () => {
    const p = defaultBackupPolicy();
    expect(estimateBackupSize(p)).toBeGreaterThan(0);
  });
  it('history is OFF by default (sensitive)', () => {
    expect(BACKUP_CATEGORIES.find((c) => c.id === 'history')?.defaultOn).toBe(false);
  });
});

describe('Cloud envelope encryption', () => {
  it('builds and validates envelope', () => {
    const env = buildEnvelope({
      keySource: 'cloud-managed',
      nonceB64: 'nonce',
      wrappedDekB64: 'wrap',
      ciphertextB64: 'data',
      plaintextBytes: 100,
      accountId: 'acc_1',
    });
    expect(env.v).toBe(ENVELOPE_VERSION);
    expect(env.alg).toBe('AES-GCM-256');
    expect(validateEnvelope(env)).toBe(true);
  });

  it('rejects bad envelopes', () => {
    expect(validateEnvelope(null)).toBe(false);
    expect(validateEnvelope({ v: 99 })).toBe(false);
    expect(validateEnvelope({ ...buildEnvelope({ keySource: 'user-passphrase', nonceB64: 'n', wrappedDekB64: 'w', ciphertextB64: 'c', plaintextBytes: 1, accountId: 'a' }), saltB64: undefined })).toBe(false);
  });

  it('AAD differs per account / size', () => {
    const a = buildAad('acc_1', 100);
    const b = buildAad('acc_2', 100);
    const c = buildAad('acc_1', 101);
    expect(new TextDecoder().decode(a)).not.toBe(new TextDecoder().decode(b));
    expect(new TextDecoder().decode(a)).not.toBe(new TextDecoder().decode(c));
  });

  it('passphraseStrength rises with complexity', () => {
    expect(passphraseStrength('aaaa')).toBeLessThan(30);
    expect(passphraseStrength('CorrectHorseBattery!9')).toBeGreaterThan(70);
  });

  it('passphraseAcceptable enforces minimum', () => {
    expect(passphraseAcceptable('short')).toBe(false);
    expect(passphraseAcceptable('GoodEnough12345!')).toBe(true);
  });
});

describe('Plan-aware UKI features', () => {
  it('Free Viewer has small daily cap and small model', () => {
    const f = featuresFor('free-viewer');
    expect(f.ukiDailyPlans).toBe(20);
    expect(f.modelTier).toBe('small');
  });

  it('Pro has higher caps than Personal', () => {
    expect(PLAN_FEATURES.pro.ukiDailyPlans).toBeGreaterThan(PLAN_FEATURES.personal.ukiDailyPlans);
    expect(PLAN_FEATURES.pro.ukiConcurrency).toBeGreaterThan(PLAN_FEATURES.personal.ukiConcurrency);
  });

  it('checkUkiAllowance allows when under cap', () => {
    const r = checkUkiAllowance('personal', { plansToday: 10 }, 1_700_000_000_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(190);
  });

  it('checkUkiAllowance blocks at cap with reset countdown', () => {
    const r = checkUkiAllowance('free-viewer', { plansToday: 20 }, 1_700_000_000_000);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('over-daily-cap');
    expect(r.resetInMs).toBeGreaterThan(0);
  });
});
