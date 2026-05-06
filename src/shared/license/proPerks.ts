// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pro / paid-tier perks catalogue
 * -----------------------------------------------------------------------------
 * The single source of truth for "what does paying actually unlock".
 * The free tier stays genuinely useful (no nag-ware), but Pro+ unlocks
 * meaningful, distinctive perks that competitors do not bundle. The
 * renderer's UpgradePrompt + ProBadge components read this list so the
 * messaging is consistent everywhere.
 *
 * Each perk declares a `gate` key. The renderer's `useProGate(gate)` hook
 * looks up the perk and decides whether to render the actual feature, a
 * locked-state badge, or a contextual upgrade prompt.
 */

// DEX v3.8.9 - pro perks

import type { PlanId } from './pricing';

export type PerkGate =
  | 'commercial-use'
  | 'live-collab'
  | 'priority-support'
  | 'pro-model'
  | 'unlimited-uki'
  | 'admin-console'
  | 'sla'
  | 'storage-100gb'
  | 'e2ee-passphrase'
  | 'legacy-handover'
  | 'unlimited-snippets'
  | 'export-bundle'
  | 'plugin-publish'
  | 'workspace-sync'
  | 'theme-studio'
  | 'voice-cloning'
  | 'ad-free'
  | 'beta-channel';

export interface ProPerk {
  gate: PerkGate;
  /** Human-readable headline for upgrade prompts. */
  headline: string;
  /** One-sentence justification for why it is worth paying for. */
  blurb: string;
  /** Lowest plan that unlocks the perk. */
  minPlan: PlanId;
  /** UI category for grouping in the upgrade prompt. */
  category: 'creativity' | 'collaboration' | 'security' | 'support' | 'power' | 'storage';
}

export const PRO_PERKS: readonly ProPerk[] = [
  // Why a free user wants to upgrade -- the small daily moments that pay back the price.
  { gate: 'unlimited-uki',       headline: 'Smart UKI without the daily cap',  blurb: 'Free Viewer is 20 plans/day. Personal jumps to 200, Pro to 1000, Studio to 2000 per seat.', minPlan: 'personal', category: 'power' },
  { gate: 'pro-model',           headline: 'The bigger UKI model',             blurb: 'Pro and Studio get the larger DEX model: longer context, sharper plans, fewer retries.', minPlan: 'pro',     category: 'power' },
  { gate: 'storage-100gb',       headline: '100 GB cloud storage',             blurb: 'Free Viewer is 10 GB. Every paid plan gets 100 GB (per seat for Studio).', minPlan: 'personal', category: 'storage' },
  { gate: 'e2ee-passphrase',     headline: 'End-to-end encryption with your passphrase', blurb: 'Set a passphrase and the cloud literally cannot read your data. No competitor at this price ships true E2EE.', minPlan: 'personal', category: 'security' },
  { gate: 'legacy-handover',     headline: 'Legacy / handover plan',           blurb: 'Nominate up to 5 heirs. If you go inactive, DEX emails you first, then them. Off by default, fully under your control.', minPlan: 'personal', category: 'security' },
  { gate: 'unlimited-snippets',  headline: 'Unlimited snippets and saved plans', blurb: 'Free Viewer caps at 50. Paid plans never count.', minPlan: 'personal', category: 'power' },
  { gate: 'workspace-sync',      headline: 'Workspace sync across devices',    blurb: 'Open DEX on a different machine and your layout, pinned apps, and recent files follow you.', minPlan: 'personal', category: 'power' },
  { gate: 'export-bundle',       headline: 'One-click export to encrypted bundle', blurb: 'Move everything in or out of DEX in a single password-protected file. Lock-in is the opposite of what we sell.', minPlan: 'personal', category: 'power' },
  { gate: 'theme-studio',        headline: 'Theme Studio',                     blurb: 'Build your own themes with the live editor and share them as encrypted bundles.', minPlan: 'personal', category: 'creativity' },
  { gate: 'ad-free',             headline: 'Forever ad-free',                  blurb: 'No ads anywhere in DEX, ever. (We do not ship ads at all -- this is a promise we put in writing.)', minPlan: 'personal', category: 'creativity' },
  { gate: 'commercial-use',      headline: 'Use DEX for commercial work',      blurb: 'Personal is for non-commercial use. Pro grants commercial rights for your freelance and client work.', minPlan: 'pro',     category: 'support' },
  { gate: 'live-collab',         headline: 'Live multi-user collab',           blurb: 'Edit Nexus boards together in real time over LAN p2p. Family includes household-only collab; Pro and Studio go further.', minPlan: 'family',  category: 'collaboration' },
  { gate: 'priority-support',    headline: 'Priority email support',           blurb: 'Pro and Studio replies inside 1 business day. Free Viewer + Personal are best-effort.', minPlan: 'pro',     category: 'support' },
  { gate: 'plugin-publish',      headline: 'Publish to the plugin marketplace', blurb: 'Pro authors can publish signed plugins to the public marketplace and earn 80% revenue share.', minPlan: 'pro',     category: 'creativity' },
  { gate: 'voice-cloning',       headline: 'On-device voice cloning for UKI',  blurb: 'Train a one-off voice profile so UKI sounds like the voice you set, not a stock TTS preset.', minPlan: 'pro',     category: 'creativity' },
  { gate: 'beta-channel',        headline: 'Beta channel + new features early', blurb: 'Pro and Studio see new releases two weeks before stable. Opt out anytime.', minPlan: 'pro',     category: 'power' },
  { gate: 'admin-console',       headline: 'Admin console + audit log export', blurb: 'Studio admins manage seats, roles, and audit logs from a single console.', minPlan: 'studio',  category: 'support' },
  { gate: 'sla',                 headline: '99.5% uptime SLA',                 blurb: 'Studio cloud services come with a 99.5% monthly SLA and credits if we miss it.', minPlan: 'studio',  category: 'support' },
];

/** Plan-rank helper used by the gate. Higher = more capability. */
const PLAN_RANK: Record<PlanId, number> = {
  'free-viewer': 0,
  personal: 1,
  family: 1, // family and personal sit at the same per-user tier; family adds seats
  pro: 2,
  studio: 3,
};

export interface PerkCheckInput { currentPlan: PlanId; gate: PerkGate; }
export interface PerkCheckResult {
  allowed: boolean;
  perk: ProPerk;
  /** Lowest plan id needed to unlock; undefined if already allowed. */
  upgradeTo?: PlanId;
}

export function checkPerk(input: PerkCheckInput): PerkCheckResult {
  const perk = PRO_PERKS.find((p) => p.gate === input.gate);
  if (!perk) throw new Error(`unknown perk gate: ${input.gate}`);
  const allowed = PLAN_RANK[input.currentPlan] >= PLAN_RANK[perk.minPlan];
  return { allowed, perk, upgradeTo: allowed ? undefined : perk.minPlan };
}

/** All perks the user does NOT yet have, sorted by category for upsell UI. */
export function lockedPerks(currentPlan: PlanId): ProPerk[] {
  return PRO_PERKS.filter((p) => PLAN_RANK[currentPlan] < PLAN_RANK[p.minPlan]);
}

/** All perks the user DOES have, for the "what you get" success screen. */
export function unlockedPerks(currentPlan: PlanId): ProPerk[] {
  return PRO_PERKS.filter((p) => PLAN_RANK[currentPlan] >= PLAN_RANK[p.minPlan]);
}
