// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Pricing & Licence Tiers
 * -----------------------------------------------------------------------------
 * Single source of truth for the public price list, trial parameters, and
 * licence-tier capability flags. Imported by Settings > Account, the trial
 * banner, and the choose-plan dialog. Pure module: no DOM, no electron, no
 * network. Currency formatting is locale-aware via Intl.NumberFormat.
 *
 * Source-of-truth document: docs/PRICING.md.
 */

// DEX v3.8.6 - public pricing & tier capabilities

export const TRIAL_DAYS = 30 as const;
export const REFUND_DAYS = 14 as const;
export const PRICE_LOCK_MONTHS = 12 as const;
export const LIFETIME_UPGRADE_DISCOUNT = 0.5 as const; // at least 50% off

export type PlanId = 'free-viewer' | 'personal' | 'family' | 'pro' | 'studio';
export type BillingPeriod = 'monthly' | 'yearly' | 'lifetime';

export interface PlanPrice {
  /** Price in USD, in whole cents to avoid float drift. */
  cents: number;
  /** Per seat for studio, per household for family, per device for personal. */
  unit?: string;
}

export interface PlanCapabilities {
  /** Maximum simultaneous devices/users covered. 0 = unlimited per seat purchased. */
  maxSeats: number;
  /** Read/write or read-only. */
  readOnly: boolean;
  /** Allowed for commercial use. */
  commercialUse: boolean;
  /** Includes Nexus live collab when it ships. */
  liveCollab: boolean;
  /** Priority support queue. */
  prioritySupport: boolean;
  /** Admin console and audit log export. */
  adminConsole: boolean;
  /** SLA percentage for cloud services. 0 = no SLA. */
  slaPercent: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  bestFor: string;
  prices: Partial<Record<BillingPeriod, PlanPrice>>;
  capabilities: PlanCapabilities;
  /** UI accent group for the plan card. */
  accent: 'neutral' | 'sky' | 'violet' | 'emerald' | 'amber';
}

export const PLANS: readonly Plan[] = [
  {
    id: 'free-viewer',
    name: 'Free Viewer',
    tagline: 'Browse your work, free, forever.',
    bestFor: 'Keeping access to your data after the trial ends.',
    prices: { monthly: { cents: 0 }, yearly: { cents: 0 } },
    capabilities: {
      maxSeats: 1,
      readOnly: true,
      commercialUse: false,
      liveCollab: false,
      prioritySupport: false,
      adminConsole: false,
      slaPercent: 0,
    },
    accent: 'neutral',
  },
  {
    id: 'personal',
    name: 'DEX Personal',
    tagline: 'One person, every app, on your machine.',
    bestFor: 'Day-to-day personal use on one or two devices.',
    prices: {
      monthly: { cents: 499 },
      yearly: { cents: 3900 },
      lifetime: { cents: 7900 },
    },
    capabilities: {
      maxSeats: 2,
      readOnly: false,
      commercialUse: false,
      liveCollab: false,
      prioritySupport: false,
      adminConsole: false,
      slaPercent: 0,
    },
    accent: 'sky',
  },
  {
    id: 'family',
    name: 'DEX Family',
    tagline: 'One subscription, the whole household.',
    bestFor: 'Up to 5 people sharing one home.',
    prices: {
      yearly: { cents: 7900 },
      lifetime: { cents: 14900 },
    },
    capabilities: {
      maxSeats: 5,
      readOnly: false,
      commercialUse: false,
      liveCollab: true,
      prioritySupport: false,
      adminConsole: false,
      slaPercent: 0,
    },
    accent: 'emerald',
  },
  {
    id: 'pro',
    name: 'DEX Pro',
    tagline: 'Built for solo creators and freelancers.',
    bestFor: 'Commercial work, live collab, priority support.',
    prices: {
      monthly: { cents: 999 },
      yearly: { cents: 8900 },
      lifetime: { cents: 14900 },
    },
    capabilities: {
      maxSeats: 3,
      readOnly: false,
      commercialUse: true,
      liveCollab: true,
      prioritySupport: true,
      adminConsole: false,
      slaPercent: 0,
    },
    accent: 'violet',
  },
  {
    id: 'studio',
    name: 'DEX Studio',
    tagline: 'Teams that want admin controls and an SLA.',
    bestFor: 'Studios and small businesses (2+ seats).',
    prices: {
      monthly: { cents: 1999, unit: 'seat' },
      yearly: { cents: 17900, unit: 'seat' },
    },
    capabilities: {
      maxSeats: 0, // 0 = per seat purchased
      readOnly: false,
      commercialUse: true,
      liveCollab: true,
      prioritySupport: true,
      adminConsole: true,
      slaPercent: 99.5,
    },
    accent: 'amber',
  },
];

export interface Discount {
  id: string;
  label: string;
  percent: number;
  appliesTo: PlanId[] | 'all';
  notes: string;
}

export const DISCOUNTS: readonly Discount[] = [
  {
    id: 'student',
    label: 'Student / Educator (verified .edu)',
    percent: 50,
    appliesTo: 'all',
    notes: 'Send proof of enrollment; upgrade applied same business day.',
  },
  {
    id: 'oss-maintainer',
    label: 'Open-source maintainer',
    percent: 100,
    appliesTo: ['pro'],
    notes: 'Free DEX Pro on application. Public project required.',
  },
  {
    id: 'nonprofit',
    label: 'Charity / registered non-profit',
    percent: 50,
    appliesTo: 'all',
    notes: 'Registration certificate required.',
  },
  {
    id: 'switcher',
    label: 'Switching from a paid competitor',
    percent: 100,
    appliesTo: ['personal'],
    notes: 'One free year of DEX Personal with proof of active rival sub.',
  },
  {
    id: 'volume',
    label: 'Volume / site licence (10+ seats)',
    percent: 0,
    appliesTo: ['studio'],
    notes: 'Custom quote -- email onazi75@gmail.com.',
  },
];

/** Format price in USD with locale formatting. */
export function formatPrice(cents: number, locale = 'en-US'): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Yearly savings vs 12 months of monthly billing, as a fraction (0..1). */
export function yearlySavings(plan: Plan): number {
  const m = plan.prices.monthly?.cents;
  const y = plan.prices.yearly?.cents;
  if (!m || !y || m === 0) return 0;
  const annualMonthly = m * 12;
  if (annualMonthly === 0) return 0;
  return Math.max(0, 1 - y / annualMonthly);
}

/** Lookup helper used by Settings > Account. */
export function getPlan(id: PlanId): Plan {
  const p = PLANS.find((p) => p.id === id);
  if (!p) throw new Error(`unknown plan: ${id}`);
  return p;
}

/** Returns ms remaining in trial; <=0 means expired. */
export function trialRemainingMs(installedAt: number, now: number = Date.now()): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return installedAt + TRIAL_DAYS * dayMs - now;
}

/** Returns whether trial has expired. */
export function isTrialExpired(installedAt: number, now: number = Date.now()): boolean {
  return trialRemainingMs(installedAt, now) <= 0;
}

/** Capability gate: does this plan permit the given action right now? */
export function canUse(plan: Plan, action: keyof PlanCapabilities): boolean {
  const v = plan.capabilities[action];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  return false;
}

/** Public promises shown on the pricing page and the choose-plan dialog. */
export const PRICING_PROMISES: readonly string[] = [
  'No ads, ever.',
  'We do not sell, rent, or share your data.',
  'Trial mode includes every feature, even ones we add later.',
  'If you cancel, you keep read-only access to every file.',
  '14-day no-questions-asked refund.',
  'Active plans are price-locked for at least 12 months.',
  'Local-first. Every app works fully offline.',
];
