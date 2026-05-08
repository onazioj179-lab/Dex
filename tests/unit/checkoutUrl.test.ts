// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  buildCheckoutUrl,
  isPerSeatPlan,
  normalizeSeats,
  readCheckoutConfigFromGlobal,
  PUBLISHER_CONTACT_EMAIL,
} from '../../src/shared/license/checkout';

describe('checkout URL builder', () => {
  describe('isPerSeatPlan', () => {
    it('flags only studio as per-seat', () => {
      expect(isPerSeatPlan('studio')).toBe(true);
      expect(isPerSeatPlan('pro')).toBe(false);
      expect(isPerSeatPlan('personal')).toBe(false);
      expect(isPerSeatPlan('family')).toBe(false);
      expect(isPerSeatPlan('free-viewer')).toBe(false);
    });
  });

  describe('normalizeSeats', () => {
    it('clamps to 1 for non-per-seat plans regardless of input', () => {
      expect(normalizeSeats('personal', 5)).toBe(1);
      expect(normalizeSeats('pro', 100)).toBe(1);
    });
    it('floors / defaults / clamps studio seats', () => {
      expect(normalizeSeats('studio', undefined)).toBe(1);
      expect(normalizeSeats('studio', 0)).toBe(1);
      expect(normalizeSeats('studio', -3)).toBe(1);
      expect(normalizeSeats('studio', 2.9)).toBe(2);
      expect(normalizeSeats('studio', 600)).toBe(500);
      expect(normalizeSeats('studio', 25)).toBe(25);
    });
    it('handles non-finite without throwing', () => {
      expect(normalizeSeats('studio', Number.NaN)).toBe(1);
      expect(normalizeSeats('studio', Number.POSITIVE_INFINITY)).toBe(1);
    });
  });

  describe('buildCheckoutUrl', () => {
    it('falls back to mailto when no endpoint is configured', () => {
      const r = buildCheckoutUrl({ planId: 'pro', period: 'yearly', email: 'a@b.com' });
      expect(r.mode).toBe('contact');
      expect(r.url.startsWith('mailto:')).toBe(true);
      expect(r.url).toContain(PUBLISHER_CONTACT_EMAIL);
      expect(decodeURIComponent(r.url)).toContain('Plan: pro');
      expect(decodeURIComponent(r.url)).toContain('Billing: yearly');
    });

    it('mailto includes seats when > 1 and discount when supplied', () => {
      const r = buildCheckoutUrl({
        planId: 'studio',
        period: 'monthly',
        seats: 7,
        discountCode: 'STUDENT50',
      });
      expect(r.mode).toBe('contact');
      const decoded = decodeURIComponent(r.url);
      expect(decoded).toContain('Seats: 7');
      expect(decoded).toContain('Discount code: STUDENT50');
    });

    it('builds a hosted URL when a valid https base is configured', () => {
      const r = buildCheckoutUrl(
        { planId: 'pro', period: 'yearly', email: 'user@example.com', returnUrl: 'https://app/back' },
        { baseUrl: 'https://buy.dex.app/checkout' },
      );
      expect(r.mode).toBe('hosted');
      expect(r.url.startsWith('https://buy.dex.app/checkout?')).toBe(true);
      expect(r.url).toContain('plan=pro');
      expect(r.url).toContain('period=yearly');
      expect(r.url).toContain('email=user%40example.com');
      expect(r.url).toContain('return_url=https%3A%2F%2Fapp%2Fback');
      expect(r.url).toContain('seats=1');
    });

    it('appends to an existing query string with & instead of ?', () => {
      const r = buildCheckoutUrl(
        { planId: 'studio', period: 'monthly', seats: 4 },
        { baseUrl: 'https://buy.dex.app/c?ref=site' },
      );
      expect(r.mode).toBe('hosted');
      expect(r.url).toContain('?ref=site&plan=studio');
      expect(r.url).toContain('seats=4');
    });

    it('rejects non-http(s) base URLs (defensive against javascript: / data: injection)', () => {
      const r = buildCheckoutUrl(
        { planId: 'pro', period: 'monthly' },
        { baseUrl: 'javascript:alert(1)' },
      );
      expect(r.mode).toBe('contact');
      expect(r.url.startsWith('mailto:')).toBe(true);
    });

    it('treats empty / null / whitespace base as not configured', () => {
      expect(buildCheckoutUrl({ planId: 'pro', period: 'monthly' }, { baseUrl: '' }).mode).toBe('contact');
      expect(buildCheckoutUrl({ planId: 'pro', period: 'monthly' }, { baseUrl: '   ' }).mode).toBe('contact');
      expect(buildCheckoutUrl({ planId: 'pro', period: 'monthly' }, { baseUrl: null }).mode).toBe('contact');
    });
  });

  describe('readCheckoutConfigFromGlobal', () => {
    it('returns empty for null / undefined / non-object', () => {
      expect(readCheckoutConfigFromGlobal(null)).toEqual({});
      expect(readCheckoutConfigFromGlobal(undefined)).toEqual({});
      expect(readCheckoutConfigFromGlobal(42)).toEqual({});
    });
    it('reads dexConfig.checkoutBaseUrl when present', () => {
      const g = { dexConfig: { checkoutBaseUrl: 'https://buy.dex.app/c' } };
      expect(readCheckoutConfigFromGlobal(g)).toEqual({ baseUrl: 'https://buy.dex.app/c' });
    });
    it('falls back to DEX_CHECKOUT_BASE_URL', () => {
      const g = { DEX_CHECKOUT_BASE_URL: 'https://other/c' };
      expect(readCheckoutConfigFromGlobal(g)).toEqual({ baseUrl: 'https://other/c' });
    });
    it('prefers dexConfig over the direct global', () => {
      const g = {
        dexConfig: { checkoutBaseUrl: 'https://primary/c' },
        DEX_CHECKOUT_BASE_URL: 'https://secondary/c',
      };
      expect(readCheckoutConfigFromGlobal(g)).toEqual({ baseUrl: 'https://primary/c' });
    });
  });
});
