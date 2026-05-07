// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Coupon engine.
 *
 * Coupon kinds:
 *  - 'percent'      apply N% off the line total (clamped to <= 100).
 *  - 'amount'       subtract a fixed amount in the order's currency.
 *  - 'free-months'  N months at zero cost on a recurring plan.
 */

// DEX v3.8.9 - coupons

export type CouponKind = 'percent' | 'amount' | 'free-months';

export interface Coupon {
  code: string;
  kind: CouponKind;
  /** percent in [1..100], amount in minor units, or month count. */
  value: number;
  /** Optional UNIX ms hard expiry. */
  expiresAt?: number;
  /** Optional minimum spend (minor units) to apply. */
  minSpend?: number;
  /** True if the coupon may only be used once across the account. */
  oneUse?: boolean;
  /** Optional restriction to specific plan ids. */
  planIds?: string[];
}

export type CouponProblem = 'unknown' | 'expired' | 'min-spend' | 'wrong-plan' | 'already-used';

export interface ApplyContext {
  amountMinor: number;       // pre-discount, in minor units (cents)
  planId?: string;
  alreadyRedeemed?: Set<string>;
  now?: number;
}

export interface CouponOutcome {
  ok: boolean;
  problem?: CouponProblem;
  discountMinor: number;     // amount taken off
  freeMonths: number;        // months added free
}

export function applyCoupon(coupon: Coupon, ctx: ApplyContext): CouponOutcome {
  const now = ctx.now ?? Date.now();
  if (coupon.expiresAt !== undefined && now > coupon.expiresAt) return fail('expired');
  if (coupon.minSpend !== undefined && ctx.amountMinor < coupon.minSpend) return fail('min-spend');
  if (coupon.planIds && coupon.planIds.length && (!ctx.planId || !coupon.planIds.includes(ctx.planId))) return fail('wrong-plan');
  if (coupon.oneUse && ctx.alreadyRedeemed?.has(coupon.code)) return fail('already-used');

  if (coupon.kind === 'percent') {
    const pct = Math.max(0, Math.min(100, coupon.value));
    const discount = Math.floor((ctx.amountMinor * pct) / 100);
    return { ok: true, discountMinor: discount, freeMonths: 0 };
  }
  if (coupon.kind === 'amount') {
    const discount = Math.max(0, Math.min(ctx.amountMinor, Math.floor(coupon.value)));
    return { ok: true, discountMinor: discount, freeMonths: 0 };
  }
  // free-months
  return { ok: true, discountMinor: 0, freeMonths: Math.max(0, Math.floor(coupon.value)) };
}

function fail(p: CouponProblem): CouponOutcome {
  return { ok: false, problem: p, discountMinor: 0, freeMonths: 0 };
}
