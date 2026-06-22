// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Achievement + daily-challenge runtime (renderer side).
 *
 * The catalog rules already exist (`checkAchievements` in engagement.ts compares
 * 5000 achievements to the live stats and returns the newly satisfied ones). The
 * gap this module closes is the *reward moment*: unlocks were dropped silently
 * because the previous banner spammed when many apps opened at once.
 *
 * This engine fixes that properly:
 *   - COALESCE: buffer unlocks across a short window and fire ONE notification
 *     ("3 achievements unlocked") instead of a storm of banners.
 *   - NOTIFY: route through the single `notify()` path, with a one-tap View that
 *     opens the Trophies app (banner action + persisted deep-link).
 *   - LIVE: emit `dex-achievement-unlocked` so an open Trophies grid refreshes.
 *
 * It also gives the fully-built but previously-unwired daily-challenge service a
 * runtime: `recordChallengeAction` advances today's challenges and notifies on
 * completion, emitting `dex-challenge-updated` for live UI.
 */

import type { Achievement } from './achievementsCatalog';
import type { UserStats } from './achievementsCatalog';
import { notifySuccess } from './notify';
import {
  loadChallenges, saveChallenges, recordChallengeProgress,
} from './dailyChallenges';

// Events other surfaces can listen for.
export const ACHIEVEMENT_UNLOCKED_EVENT = 'dex-achievement-unlocked';
export const CHALLENGE_UPDATED_EVENT = 'dex-challenge-updated';

const COALESCE_MS = 1500;
const TROPHIES_DEEPLINK = 'dex://achievements/app/open';

let pending: Achievement[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Open the Trophies app via the canonical open-app bus. */
function openTrophies(): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-open-app', {
      detail: { appId: 'achievements', appName: 'Trophies' },
    }));
  } catch { /* never throw from a reward path */ }
}

function emitUnlocked(ids: string[]): void {
  try {
    window.dispatchEvent(new CustomEvent(ACHIEVEMENT_UNLOCKED_EVENT, { detail: { ids } }));
  } catch { /* noop */ }
}

function flushUnlocks(): void {
  flushTimer = null;
  const unlocks = pending;
  pending = [];
  if (!unlocks.length) return;

  const viewAction = { label: 'View', onClick: openTrophies };
  if (unlocks.length === 1) {
    const a = unlocks[0];
    notifySuccess(`Achievement unlocked: ${a.title}`, a.description, {
      source: 'Achievements',
      action: { target: TROPHIES_DEEPLINK, label: 'View' },
      actions: [viewAction],
    });
  } else {
    const points = unlocks.reduce((sum, a) => sum + a.points, 0);
    notifySuccess(`${unlocks.length} achievements unlocked`, `+${points} points — tap to view`, {
      source: 'Achievements',
      action: { target: TROPHIES_DEEPLINK, label: 'View' },
      actions: [viewAction],
    });
  }

  emitUnlocked(unlocks.map(u => u.id));
}

/**
 * Record newly-unlocked achievements for a coalesced reward. Safe to call on
 * every stat bump; only fires a notification once the burst settles. Achievements
 * are already persisted by the caller (saveEngagement) before this runs, so a
 * later check never re-reports them.
 */
export function rewardUnlocks(newUnlocks: Achievement[]): void {
  if (!newUnlocks || !newUnlocks.length) return;
  pending.push(...newUnlocks);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushUnlocks, COALESCE_MS);
}

// ---------------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------------

/**
 * Map of UserStats keys (the `dex-stat-bump` bus payload) to challenge action
 * targets. Stats not listed simply advance no challenge — harmless. App-usage
 * and app-launch challenges are advanced separately from the foreground hook.
 */
const STAT_TO_CHALLENGE: Partial<Record<keyof UserStats, string>> = {
  notesCreated: 'notes:create',
  tasksCompleted: 'tasks:complete',
  kanbanCardsCreated: 'kanban:add_card',
  spotlightSearches: 'spotlight:search',
  browserPageLoads: 'browser:navigate',
};

/**
 * Advance today's daily challenges for an action and notify on completion.
 * `type` is the challenge condition type; `target` the action/app target.
 */
export function recordChallengeAction(
  type: 'app_usage' | 'action_count' | 'streak' | 'time_spent' | 'discovery',
  target: string,
  amount = 1,
): void {
  try {
    const { state, newCompletions } = recordChallengeProgress(loadChallenges(), type, target, amount);
    saveChallenges(state);
    for (const ch of newCompletions) {
      notifySuccess('Challenge complete', `${ch.title} — +${ch.xpReward} XP`, {
        source: 'Challenges',
        action: { target: TROPHIES_DEEPLINK, label: 'View' },
        actions: [{ label: 'View', onClick: openTrophies }],
      });
    }
    window.dispatchEvent(new CustomEvent(CHALLENGE_UPDATED_EVENT));
  } catch { /* never throw from a reward path */ }
}

/** Translate a stat-bump key into challenge progress, when one maps. */
export function recordChallengeForStat(statKey: keyof UserStats, amount = 1): void {
  const target = STAT_TO_CHALLENGE[statKey];
  if (target) recordChallengeAction('action_count', target, amount);
}
