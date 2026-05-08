// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { routeUkiRequest, approxTokens } from '../../src/shared/ai/ukiPlusRouter';

describe('ukiPlusRouter', () => {
  const base = {
    prompt: 'hello',
    hasNpu: true,
    online: true,
    cloudConsent: true,
    privacyMode: false,
  };

  it('routes to on-device when privacyMode is on, regardless of cloud consent', () => {
    const r = routeUkiRequest({ ...base, privacyMode: true });
    expect(r.route).toBe('on-device');
    expect(r.reason).toMatch(/privacy/i);
  });

  it('routes to on-device when offline', () => {
    const r = routeUkiRequest({ ...base, online: false });
    expect(r.route).toBe('on-device');
    expect(r.reason).toMatch(/offline/i);
  });

  it('routes to on-device when cloud consent is missing', () => {
    const r = routeUkiRequest({ ...base, cloudConsent: false });
    expect(r.route).toBe('on-device');
    expect(r.reason).toMatch(/consent/i);
  });

  it('routes long prompts to cloud', () => {
    const longPrompt = 'x'.repeat(5000);
    const r = routeUkiRequest({ ...base, prompt: longPrompt });
    expect(r.route).toBe('cloud');
    expect(r.promptCharLimit).toBeNull();
  });

  it('routes short prompts on a NPU device to on-device', () => {
    const r = routeUkiRequest({ ...base, prompt: 'short query' });
    expect(r.route).toBe('on-device');
    expect(r.promptCharLimit).toBeGreaterThan(0);
  });

  it('routes to hybrid when no NPU but cloud is OK', () => {
    const r = routeUkiRequest({ ...base, hasNpu: false, prompt: 'short' });
    expect(r.route).toBe('hybrid');
  });

  it('approxTokens handles empty + short input', () => {
    expect(approxTokens('')).toBe(0);
    expect(approxTokens('abcd')).toBe(1);
    expect(approxTokens('abcde')).toBe(2);
  });
});
