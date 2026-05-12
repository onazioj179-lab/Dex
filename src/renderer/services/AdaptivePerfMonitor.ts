// =============================================================================
// DEX Platform — Adaptive Performance Monitor
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//
// Watches rAF jitter and thermal hints to transparently downgrade or upgrade
// the visual tier (data-perf-tier) so DEX stays smooth on hot or busy systems
// without ever asking the user. No UI is added.
//
// Rules:
//   - Never overrides a user's manual tier choice.
//   - Only downgrades after sustained jank (>= JANK_DOWNGRADE_FRAMES of
//     >= JANK_FRAME_MS within DOWNGRADE_WINDOW_MS).
//   - Re-upgrades only after long sustained smoothness AND cool thermal.
//   - Steps one tier at a time. ultra -> high -> mid -> low.
// =============================================================================

import {
  type DeviceTier,
  applyTierPresets,
  getStoredTier,
  isManualOverride,
} from './TierManager';

const TIER_ORDER: DeviceTier[] = ['low', 'mid', 'high', 'ultra'];

const JANK_FRAME_MS = 28;            // > ~36fps frame is "janky"
const HEAVY_JANK_MS = 60;            // single very slow frame
const DOWNGRADE_WINDOW_MS = 4000;    // rolling window for jank counting
const JANK_DOWNGRADE_FRAMES = 14;    // jank frames in window -> downgrade
const SMOOTH_UPGRADE_MS = 60_000;    // sustained smooth time before upgrade
const COOLDOWN_AFTER_CHANGE_MS = 15_000;

let lastChangeAt = 0;
let smoothSince = 0;
let jankTimes: number[] = [];
let lastFrame = 0;
let started = false;
let thermalHot = false;
let windowActive = true; // false when hidden or unfocused

// Track the tier we had before going idle so we can restore it on return
let tierBeforeIdle: DeviceTier | null = null;

function step(current: DeviceTier, dir: -1 | 1): DeviceTier {
  const idx = TIER_ORDER.indexOf(current);
  const next = TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, idx + dir))];
  return next ?? current;
}

function tick(now: number) {
  // Skip jank counting when the page is hidden or unfocused. The OS
  // legitimately throttles rAF during idle, which produces large frame
  // deltas that look like jank but aren't. Counting them caused the
  // monitor to downgrade to low/mid tier during idle, which set
  // deferHeavyApps=true and unmounted background apps — producing the
  // blank screen the user saw on return.
  if (!windowActive || document.visibilityState !== 'visible') {
    lastFrame = 0; // reset so first frame after wake has no delta
    requestAnimationFrame(tick);
    return;
  }

  if (lastFrame !== 0) {
    const delta = now - lastFrame;
    if (delta >= JANK_FRAME_MS) jankTimes.push(now);
    if (delta >= HEAVY_JANK_MS) jankTimes.push(now); // weight heavy frames double
  }
  lastFrame = now;

  // prune old jank events
  const cutoff = now - DOWNGRADE_WINDOW_MS;
  if (jankTimes.length > 0 && jankTimes[0] < cutoff) {
    jankTimes = jankTimes.filter(t => t >= cutoff);
  }

  // skip work during cooldown
  if (now - lastChangeAt < COOLDOWN_AFTER_CHANGE_MS) {
    if (jankTimes.length === 0) smoothSince = smoothSince || now;
    requestAnimationFrame(tick);
    return;
  }

  // never override manual choice
  if (isManualOverride()) {
    requestAnimationFrame(tick);
    return;
  }

  const current = getStoredTier() || 'mid';

  // Downgrade path
  if (jankTimes.length >= JANK_DOWNGRADE_FRAMES || thermalHot) {
    const next = step(current, -1);
    if (next !== current) {
      applyTierPresets(next);
      lastChangeAt = now;
      jankTimes = [];
      smoothSince = 0;
      // eslint-disable-next-line no-console
      console.debug(`[DEX] AdaptivePerf downgrade ${current} -> ${next}`, { thermalHot, jank: jankTimes.length });
    }
    requestAnimationFrame(tick);
    return;
  }

  // Upgrade path
  if (jankTimes.length === 0) {
    if (smoothSince === 0) smoothSince = now;
    if (!thermalHot && now - smoothSince >= SMOOTH_UPGRADE_MS) {
      const next = step(current, 1);
      if (next !== current) {
        applyTierPresets(next);
        lastChangeAt = now;
        smoothSince = 0;
        // eslint-disable-next-line no-console
        console.debug(`[DEX] AdaptivePerf upgrade ${current} -> ${next}`);
      } else {
        smoothSince = now; // already at max, reset window
      }
    }
  } else {
    smoothSince = 0;
  }

  requestAnimationFrame(tick);
}

/**
 * Start watching rAF jitter. Idempotent. Safe to call once at app startup.
 *
 * NOTE: Disabled per user request — DEX should always run at the highest
 * tier the hardware initially negotiated and never downgrade because Windows
 * flipped to a low-power profile. The monitor used to cycle ultra->low->ultra
 * when the OS toggled power modes, which produced visible jank and unmounted
 * background apps. We keep the export so callers don't break, but the body
 * is a no-op.
 */
export function startAdaptivePerfMonitor(): void {
  if (started) return;
  started = true;
  // Adaptive downgrades are intentionally disabled. Tier stays locked at
  // whatever TierManager negotiated on boot. See user directive: keep all
  // visuals at max regardless of system power state.
  return;
  // eslint-disable-next-line no-unreachable
  if (typeof requestAnimationFrame !== 'function') return;

  if (typeof window !== 'undefined') {
    // Thermal hints
    window.addEventListener('dex:thermal-hint', ((e: CustomEvent) => {
      const s = e.detail?.state;
      thermalHot = s === 'hot' || s === 'critical';
    }) as EventListener);

    // Visibility change: stop counting jank when hidden, restore tier on return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Save current tier so we can restore after idle
        tierBeforeIdle = getStoredTier();
        windowActive = false;
        lastFrame = 0;
        jankTimes = [];
      } else {
        // Page became visible again — restore tier to what it was before idle
        // so deferHeavyApps doesn't leave apps unmounted on return
        if (tierBeforeIdle && !isManualOverride()) {
          const current = getStoredTier();
          if (current !== tierBeforeIdle) {
            applyTierPresets(tierBeforeIdle);
            lastChangeAt = performance.now();
          }
        }
        tierBeforeIdle = null;
        jankTimes = [];
        smoothSince = 0;
        lastFrame = 0;
        windowActive = true;
      }
    });

    // Focus/blur: pause jank counting when window loses focus
    window.addEventListener('blur', () => {
      if (!tierBeforeIdle) tierBeforeIdle = getStoredTier();
      windowActive = false;
      lastFrame = 0;
      jankTimes = [];
    });
    window.addEventListener('focus', () => {
      if (tierBeforeIdle && !isManualOverride()) {
        const current = getStoredTier();
        if (current !== tierBeforeIdle) {
          applyTierPresets(tierBeforeIdle);
          lastChangeAt = performance.now();
        }
      }
      tierBeforeIdle = null;
      jankTimes = [];
      smoothSince = 0;
      lastFrame = 0;
      windowActive = true;
    });
  }

  requestAnimationFrame(tick);
}
