// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  buildMemo,
  buildPaymentPlan,
  computeSubtotalCents,
  isValidBtcAddress,
  isValidEthAddress,
  readPaymentConfigFromGlobal,
  usdCentsToSats,
  usdCentsToWei,
} from '../../src/shared/license/payment';

const BTC_ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const ETH_ADDR = '0x742d35Cc6634C0532925a3b844Bc454e4438f44E';

describe('payment plan builder', () => {
  describe('isValidBtcAddress / isValidEthAddress', () => {
    it('accepts well-formed addresses', () => {
      expect(isValidBtcAddress(BTC_ADDR)).toBe(true);
      expect(isValidBtcAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
      expect(isValidBtcAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
      expect(isValidEthAddress(ETH_ADDR)).toBe(true);
    });
    it('rejects garbage', () => {
      expect(isValidBtcAddress('')).toBe(false);
      expect(isValidBtcAddress(null)).toBe(false);
      expect(isValidBtcAddress(undefined)).toBe(false);
      expect(isValidBtcAddress('not-an-address')).toBe(false);
      expect(isValidEthAddress('0xnothex')).toBe(false);
      expect(isValidEthAddress('0x123')).toBe(false);
    });
  });

  describe('computeSubtotalCents', () => {
    it('uses the plan price for non-per-seat plans', () => {
      // Pro yearly = 37900 cents in pricing.ts.
      expect(computeSubtotalCents({ planId: 'pro', period: 'yearly' })).toBe(37900);
      // Personal monthly = 2000 cents.
      expect(computeSubtotalCents({ planId: 'personal', period: 'monthly' })).toBe(2000);
    });
    it('multiplies by seats for studio', () => {
      // Studio monthly = 6000 cents/seat.
      expect(computeSubtotalCents({ planId: 'studio', period: 'monthly', seats: 5 })).toBe(30000);
      // Seats are clamped before multiplication.
      expect(computeSubtotalCents({ planId: 'studio', period: 'monthly', seats: 0 })).toBe(6000);
    });
    it('returns 0 for free viewer or missing price', () => {
      expect(computeSubtotalCents({ planId: 'free-viewer', period: 'monthly' })).toBe(0);
    });
  });

  describe('buildMemo', () => {
    it('is deterministic for the same input', () => {
      const a = buildMemo({ planId: 'pro', period: 'yearly', email: 'X@Y.com' });
      const b = buildMemo({ planId: 'pro', period: 'yearly', email: 'x@y.com' });
      expect(a).toBe(b);
    });
    it('changes when any input changes', () => {
      const base = buildMemo({ planId: 'pro', period: 'yearly' });
      expect(base).not.toBe(buildMemo({ planId: 'pro', period: 'monthly' }));
      expect(base).not.toBe(buildMemo({ planId: 'studio', period: 'yearly' }));
      expect(base).not.toBe(buildMemo({ planId: 'pro', period: 'yearly', seats: 3 }));
    });
    it('returns a 14-char dashed memo (4-4-4)', () => {
      const m = buildMemo({ planId: 'pro', period: 'monthly' });
      expect(m).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    });
  });

  describe('usdCentsToSats / usdCentsToWei', () => {
    it('returns 0 for non-positive inputs', () => {
      expect(usdCentsToSats(0, 60000)).toBe(0n);
      expect(usdCentsToSats(100, 0)).toBe(0n);
      expect(usdCentsToSats(100, -1)).toBe(0n);
      expect(usdCentsToWei(0, 3000)).toBe(0n);
      expect(usdCentsToWei(100, 0)).toBe(0n);
    });
    it('converts $1 at $50,000/BTC -> 2000 sats', () => {
      // $1 = 100 cents. 1 / 50000 BTC = 2000 sats.
      expect(usdCentsToSats(100, 50000)).toBe(2000n);
    });
    it('converts $100 at $2500/ETH -> 0.04 ETH = 4e16 wei', () => {
      // $100 = 10000 cents. 100/2500 ETH = 0.04 ETH = 4e16 wei.
      expect(usdCentsToWei(10000, 2500)).toBe(40_000_000_000_000_000n);
    });
    it('handles fractional rates without losing precision', () => {
      // $100 at $20000.5/BTC = 0.0049998750... BTC. Result must be a whole bigint.
      const sats = usdCentsToSats(10000, 20000.5);
      expect(typeof sats).toBe('bigint');
      expect(sats).toBeGreaterThan(0n);
    });
  });

  describe('buildPaymentPlan', () => {
    it('always returns email as available, even with no config', () => {
      const plan = buildPaymentPlan({ planId: 'pro', period: 'monthly' });
      const email = plan.methods.find(m => m.id === 'email')!;
      expect(email).toBeTruthy();
      expect(email.available).toBe(true);
      expect(email.url?.startsWith('mailto:')).toBe(true);
      expect(email.url).toContain(plan.memo);
    });

    it('marks card as unavailable when no checkout endpoint is configured', () => {
      const plan = buildPaymentPlan({ planId: 'pro', period: 'monthly' });
      const card = plan.methods.find(m => m.id === 'card')!;
      expect(card.available).toBe(false);
      expect(card.unavailableReason).toMatch(/no hosted checkout/i);
    });

    it('makes card available when a hosted endpoint is configured', () => {
      const plan = buildPaymentPlan(
        { planId: 'pro', period: 'monthly', email: 'a@b.com' },
        { baseUrl: 'https://buy.dex.app/c' },
      );
      const card = plan.methods.find(m => m.id === 'card')!;
      expect(card.available).toBe(true);
      expect(card.url?.startsWith('https://buy.dex.app/c?')).toBe(true);
    });

    it('marks crypto as unavailable when address is missing or malformed', () => {
      const plan = buildPaymentPlan({ planId: 'pro', period: 'monthly' }, { btcAddress: 'bad', ethAddress: 'bad' });
      expect(plan.methods.find(m => m.id === 'bitcoin')!.available).toBe(false);
      expect(plan.methods.find(m => m.id === 'ethereum')!.available).toBe(false);
    });

    it('produces a bitcoin: URI with exact amount when rate is supplied', () => {
      const plan = buildPaymentPlan(
        { planId: 'personal', period: 'monthly' }, // 2000 cents = $20
        { btcAddress: BTC_ADDR, rates: { btc: 50000 } },
      );
      const btc = plan.methods.find(m => m.id === 'bitcoin')!;
      expect(btc.available).toBe(true);
      expect(btc.priceUnknown).toBeUndefined();
      // $20 at $50000/BTC = 0.0004 BTC = 40_000 sats.
      expect(btc.amountAtomic).toBe('40000');
      expect(btc.url).toContain('bitcoin:' + BTC_ADDR);
      expect(btc.url).toContain('amount=');
      expect(btc.url).toContain(`message=${encodeURIComponent(plan.memo)}`);
    });

    it('produces an ethereum: URI with wei amount when rate is supplied', () => {
      const plan = buildPaymentPlan(
        { planId: 'personal', period: 'monthly' }, // $20
        { ethAddress: ETH_ADDR, rates: { eth: 2000 } },
      );
      const eth = plan.methods.find(m => m.id === 'ethereum')!;
      expect(eth.available).toBe(true);
      expect(eth.priceUnknown).toBeUndefined();
      // $20 at $2000/ETH = 0.01 ETH = 1e16 wei.
      expect(eth.amountAtomic).toBe('10000000000000000');
      expect(eth.url).toContain('ethereum:' + ETH_ADDR);
      expect(eth.url).toContain('value=10000000000000000');
    });

    it('flags priceUnknown when crypto address is set but no rate is', () => {
      const plan = buildPaymentPlan(
        { planId: 'personal', period: 'monthly' },
        { btcAddress: BTC_ADDR, ethAddress: ETH_ADDR },
      );
      const btc = plan.methods.find(m => m.id === 'bitcoin')!;
      const eth = plan.methods.find(m => m.id === 'ethereum')!;
      expect(btc.available).toBe(true);
      expect(btc.priceUnknown).toBe(true);
      expect(btc.amountAtomic).toBeUndefined();
      expect(eth.available).toBe(true);
      expect(eth.priceUnknown).toBe(true);
    });

    it('all four methods share the same memo', () => {
      const plan = buildPaymentPlan(
        { planId: 'pro', period: 'monthly', email: 'a@b.com' },
        { baseUrl: 'https://buy.dex.app/c', btcAddress: BTC_ADDR, ethAddress: ETH_ADDR, rates: { btc: 50000, eth: 2000 } },
      );
      for (const m of plan.methods) {
        expect(m.memo).toBe(plan.memo);
      }
    });
  });

  describe('readPaymentConfigFromGlobal', () => {
    it('reads addresses and rates from window.dexConfig', () => {
      const g = {
        dexConfig: {
          checkoutBaseUrl: 'https://buy.dex.app/c',
          btcAddress: BTC_ADDR,
          ethAddress: ETH_ADDR,
          rates: { btc: 65000, eth: 3500 },
        },
      };
      const cfg = readPaymentConfigFromGlobal(g);
      expect(cfg.baseUrl).toBe('https://buy.dex.app/c');
      expect(cfg.btcAddress).toBe(BTC_ADDR);
      expect(cfg.ethAddress).toBe(ETH_ADDR);
      expect(cfg.rates?.btc).toBe(65000);
      expect(cfg.rates?.eth).toBe(3500);
    });
    it('falls back to DEX_CHECKOUT_BASE_URL when dexConfig.checkoutBaseUrl is missing', () => {
      const g = { DEX_CHECKOUT_BASE_URL: 'https://other/c' };
      expect(readPaymentConfigFromGlobal(g).baseUrl).toBe('https://other/c');
    });
    it('returns empty for null / undefined', () => {
      expect(readPaymentConfigFromGlobal(null)).toEqual({});
      expect(readPaymentConfigFromGlobal(undefined)).toEqual({});
    });
    it('skips zero / negative / non-numeric rates', () => {
      const g = { dexConfig: { rates: { btc: 0, eth: 'bad' } } };
      expect(readPaymentConfigFromGlobal(g).rates).toEqual({});
    });
  });
});
