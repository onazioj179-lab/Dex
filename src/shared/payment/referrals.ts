// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Referral codes. Each user gets a stable shareable code; new sign-ups
 * that come in with that code grant the referrer credit.
 */

// DEX v3.8.9 - referrals

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I/O/0/1 to avoid confusion

export function generateReferralCode(seedHex: string): string {
  // Deterministic from a hex seed (e.g. user-id hash). 8 chars.
  let acc = '';
  let i = 0;
  while (acc.length < 8 && i < seedHex.length) {
    const ch = parseInt(seedHex[i], 16);
    acc += ALPHABET[ch % ALPHABET.length];
    i += 1;
  }
  while (acc.length < 8) acc += ALPHABET[acc.length % ALPHABET.length];
  return acc;
}

export function isValidReferralCode(code: string): boolean {
  if (!code || code.length !== 8) return false;
  for (const ch of code) if (!ALPHABET.includes(ch)) return false;
  return true;
}

export interface ReferralCredit {
  referrerId: string;
  refereeId: string;
  awardedAt: number;
  /** Reward in minor units (cents). */
  rewardMinor: number;
}

export interface ReferralLedger {
  credits: ReferralCredit[];
  /** Cap each referrer earns per month (in minor units). */
  monthlyCap: number;
}

export const DEFAULT_MONTHLY_CAP = 100 * 100;    // $100/mo

export function createReferralLedger(monthlyCap: number = DEFAULT_MONTHLY_CAP): ReferralLedger {
  return { credits: [], monthlyCap };
}

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export function awardCredit(ledger: ReferralLedger, credit: Omit<ReferralCredit, 'awardedAt'> & { awardedAt?: number }): { ledger: ReferralLedger; awardedMinor: number } {
  const awardedAt = credit.awardedAt ?? Date.now();
  const monthStart = startOfMonth(awardedAt);
  const usedThisMonth = ledger.credits
    .filter((c) => c.referrerId === credit.referrerId && c.awardedAt >= monthStart)
    .reduce((s, c) => s + c.rewardMinor, 0);
  const room = Math.max(0, ledger.monthlyCap - usedThisMonth);
  const awardedMinor = Math.min(credit.rewardMinor, room);
  if (awardedMinor <= 0) return { ledger, awardedMinor: 0 };
  return {
    ledger: { ...ledger, credits: [...ledger.credits, { ...credit, awardedAt, rewardMinor: awardedMinor }] },
    awardedMinor,
  };
}
