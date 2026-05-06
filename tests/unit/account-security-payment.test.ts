// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.7 - account / security / payment tests

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AccountStore,
  createMemoryStorage,
  createInMemoryTransport,
  type AccountProfile,
} from '../../src/shared/account/AccountStore';
import {
  TokenBucket,
  KeyedRateLimiter,
  LIMITS,
} from '../../src/shared/security/rateLimit';
import {
  isDisposableEmail,
  isProbablyValidEmail,
  scoreAbuse,
  constantTimeEquals,
  backoffMs,
} from '../../src/shared/security/abusePrevention';
import {
  getStripePriceId,
  buildCheckoutPayload,
  isStripeConfigured,
  verifyWebhookSignature,
  STRIPE_PRICE_IDS,
} from '../../src/shared/payment/stripe';

const PROFILE: AccountProfile = {
  id: 'acc_1',
  email: 'user@example.com',
  displayName: 'User',
  createdAt: 1_000,
  tier: 'pro',
  status: 'active',
  validUntil: 0,
  readOnlyAfterExpiry: true,
  devices: [{ id: 'dev_1', name: 'Mac', platform: 'darwin', lastSeenAt: 1_000 }],
  syncEnabled: true,
};

describe('AccountStore', () => {
  let store: AccountStore;
  beforeEach(() => { store = new AccountStore(createMemoryStorage()); });

  it('starts anonymous and reports it', () => {
    expect(store.isSignedIn()).toBe(false);
    expect(store.isAnonymous()).toBe(true);
    expect(store.effectiveTier()).toBe('free-viewer');
  });

  it('signs in and persists', () => {
    store.signIn(PROFILE);
    expect(store.isSignedIn()).toBe(true);
    expect(store.current()?.tier).toBe('pro');
  });

  it('survives reload via shared storage', () => {
    const storage = createMemoryStorage();
    new AccountStore(storage).signIn(PROFILE);
    const reloaded = new AccountStore(storage);
    expect(reloaded.current()?.id).toBe('acc_1');
  });

  it('expired subscription falls back to free-viewer', () => {
    store.signIn({ ...PROFILE, validUntil: 100 });
    expect(store.effectiveTier(200)).toBe('free-viewer');
  });

  it('signs out and clears persisted profile', () => {
    store.signIn(PROFILE);
    store.signOut();
    expect(store.current()).toBeNull();
  });

  it('registerDevice deduplicates by id', () => {
    store.signIn(PROFILE);
    store.registerDevice({ id: 'dev_1', name: 'Mac Pro', platform: 'darwin', lastSeenAt: 2_000 });
    expect(store.current()?.devices).toHaveLength(1);
    expect(store.current()?.devices[0].name).toBe('Mac Pro');
    store.registerDevice({ id: 'dev_2', name: 'iPhone', platform: 'ios', lastSeenAt: 2_000 });
    expect(store.current()?.devices).toHaveLength(2);
  });

  it('sync pulls remote profile when present', async () => {
    const transport = createInMemoryTransport();
    const remote: AccountProfile = { ...PROFILE, displayName: 'Remote Name' };
    await transport.push(remote);
    store.signIn(PROFILE);
    await store.sync(transport);
    expect(store.current()?.displayName).toBe('Remote Name');
  });

  it('sync pushes local when remote missing', async () => {
    const transport = createInMemoryTransport();
    store.signIn(PROFILE);
    await store.sync(transport);
    expect(transport.dump().get('acc_1')?.displayName).toBe('User');
  });

  it('subscribers fire on sign-in and sign-out', () => {
    const events: Array<AccountProfile | null> = [];
    const unsub = store.subscribe((p) => events.push(p));
    store.signIn(PROFILE);
    store.signOut();
    unsub();
    expect(events).toHaveLength(2);
    expect(events[1]).toBeNull();
  });
});

describe('TokenBucket rate limiter', () => {
  it('starts full', () => {
    const b = new TokenBucket({ capacity: 5, refillPerMs: 0 }, 0);
    expect(b.available(0)).toBe(5);
  });

  it('consumes and refuses when empty', () => {
    const b = new TokenBucket({ capacity: 3, refillPerMs: 0 }, 0);
    expect(b.tryConsume(1, 0)).toBe(true);
    expect(b.tryConsume(1, 0)).toBe(true);
    expect(b.tryConsume(1, 0)).toBe(true);
    expect(b.tryConsume(1, 0)).toBe(false);
  });

  it('refills over time', () => {
    const b = new TokenBucket({ capacity: 10, refillPerMs: 1 / 1000 }, 0); // 1 / sec
    b.tryConsume(10, 0);
    expect(b.tryConsume(1, 1000)).toBe(true);  // exactly 1 token after 1s
    expect(b.tryConsume(1, 1000)).toBe(false); // already used
  });

  it('reports retryAfterMs accurately', () => {
    const b = new TokenBucket({ capacity: 5, refillPerMs: 5 / 60_000 }, 0);
    b.tryConsume(5, 0);
    const wait = b.retryAfterMs(1, 0);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60_000);
  });
});

describe('KeyedRateLimiter', () => {
  it('limits per key independently', () => {
    const r = new KeyedRateLimiter({ capacity: 2, refillPerMs: 0 });
    expect(r.tryConsume('ip1', 1, 0)).toBe(true);
    expect(r.tryConsume('ip1', 1, 0)).toBe(true);
    expect(r.tryConsume('ip1', 1, 0)).toBe(false);
    expect(r.tryConsume('ip2', 1, 0)).toBe(true);
  });

  it('evict drops idle buckets', () => {
    const r = new KeyedRateLimiter({ capacity: 1, refillPerMs: 0 });
    r.tryConsume('ip1', 1, 0);
    r.tryConsume('ip2', 1, 1000);
    expect(r.size()).toBe(2);
    expect(r.evict(500, 1000)).toBe(1); // ip1 idle > 500ms
    expect(r.size()).toBe(1);
  });

  it('LIMITS catalogue covers core flows', () => {
    expect(LIMITS.signInPerIp.capacity).toBe(5);
    expect(LIMITS.accountCreatePerIp.capacity).toBe(3);
    expect(LIMITS.checkoutPerAccount.capacity).toBe(10);
  });
});

describe('Anti-abuse', () => {
  it('flags known disposable domains', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@example.com')).toBe(false);
    expect(isDisposableEmail('not-an-email')).toBe(false);
  });

  it('validates plausible emails', () => {
    expect(isProbablyValidEmail('a@b.co')).toBe(true);
    expect(isProbablyValidEmail('not-an-email')).toBe(false);
    expect(isProbablyValidEmail('')).toBe(false);
  });

  it('scoreAbuse allows clean signals', () => {
    const decision = scoreAbuse({ ipAccountCount: 1, deviceFanout: 1, isDisposableEmail: false, isTorExit: false });
    expect(decision.level).toBe('allow');
    expect(decision.score).toBe(0);
  });

  it('scoreAbuse blocks egregious signals', () => {
    const decision = scoreAbuse({ ipAccountCount: 12, deviceFanout: 10, isDisposableEmail: true, isTorExit: true });
    expect(decision.level).toBe('block');
    expect(decision.reasons).toContain('disposable-email');
    expect(decision.reasons).toContain('ip-fanout-very-high');
  });

  it('soft-challenge for medium signals', () => {
    const decision = scoreAbuse({ ipAccountCount: 3, deviceFanout: 4, isDisposableEmail: false, isTorExit: true });
    expect(['soft-challenge', 'manual-review']).toContain(decision.level);
  });

  it('constant-time equals returns true only for equal strings', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
  });

  it('backoff grows exponentially with cap', () => {
    const rand = () => 0; // no jitter for determinism
    expect(backoffMs(0, 100, 1000, rand)).toBe(0);
    expect(backoffMs(1, 100, 1000, rand)).toBe(100);
    expect(backoffMs(4, 100, 1000, rand)).toBe(800);
    expect(backoffMs(20, 100, 1000, rand)).toBe(1000); // capped
  });
});

describe('Stripe integration', () => {
  it('reports unconfigured by default (no real price IDs in source)', () => {
    expect(isStripeConfigured()).toBe(false);
    expect(getStripePriceId('personal', 'monthly')).toBeNull();
  });

  it('exposes a price-id slot for every paid plan/period', () => {
    expect(STRIPE_PRICE_IDS.personal).toHaveProperty('monthly');
    expect(STRIPE_PRICE_IDS.personal).toHaveProperty('yearly');
    expect(STRIPE_PRICE_IDS.personal).toHaveProperty('lifetime');
    expect(STRIPE_PRICE_IDS.studio).toHaveProperty('monthly');
    expect(STRIPE_PRICE_IDS.studio).toHaveProperty('yearly');
  });

  it('buildCheckoutPayload throws when price id is empty', () => {
    expect(() => buildCheckoutPayload({
      accountId: 'a', email: 'u@x.com', planId: 'personal', period: 'monthly',
      successUrl: 'https://dex/ok', cancelUrl: 'https://dex/cancel',
    })).toThrow();
  });

  it('buildCheckoutPayload produces a valid Session shape with a real id set', () => {
    STRIPE_PRICE_IDS.personal.monthly = 'price_test_personal_monthly';
    const payload = buildCheckoutPayload({
      accountId: 'acc_1', email: 'user@example.com', planId: 'personal', period: 'monthly',
      successUrl: 'https://dex.app/ok', cancelUrl: 'https://dex.app/cancel',
      discountCode: 'STUDENT', locale: 'en',
    });
    expect(payload.mode).toBe('subscription');
    expect(payload.customer_email).toBe('user@example.com');
    expect(payload.line_items[0].price).toBe('price_test_personal_monthly');
    expect(payload.allow_promotion_codes).toBe(true);
    expect(payload.client_reference_id).toBe('acc_1');
    expect(payload.metadata.discountCode).toBe('STUDENT');
    STRIPE_PRICE_IDS.personal.monthly = '';
  });

  it('lifetime checkout is one-time payment mode', () => {
    STRIPE_PRICE_IDS.personal.lifetime = 'price_test_personal_lifetime';
    const payload = buildCheckoutPayload({
      accountId: 'acc_1', email: 'u@x.com', planId: 'personal', period: 'lifetime',
      successUrl: 'https://x', cancelUrl: 'https://x',
    });
    expect(payload.mode).toBe('payment');
    STRIPE_PRICE_IDS.personal.lifetime = '';
  });

  it('verifyWebhookSignature uses constant-time equality', () => {
    expect(verifyWebhookSignature('abc', 'abc')).toBe(true);
    expect(verifyWebhookSignature('abc', 'xyz')).toBe(false);
    expect(verifyWebhookSignature('', '')).toBe(true);
  });
});
