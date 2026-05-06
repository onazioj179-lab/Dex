// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX — Performance-Aware Rendering Utilities
 * ===========================================================================
 * UI helpers that adapt or skip rendering based on the device performance tier.
 *
 * usePerfTier()     — Returns current tier + helpers
 * <PerfGate>        — Only renders children on capable devices
 * useWhenVisible()  — Defers heavy work until element is in viewport
 * useAppActive()    — True only when this app tab is the foreground app
 */

import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import type { PerfTier } from './adaptiveCanvas';
import { getPerfTier, getTargetFPS, getAdaptiveDPR } from './adaptiveCanvas';

export type { PerfTier };

// ---------------------------------------------------------------------------
// usePerfTier — reactive performance tier
// ---------------------------------------------------------------------------

interface PerfTierInfo {
  tier: PerfTier;
  isLow: boolean;
  isMid: boolean;
  isHigh: boolean;
  isUltra: boolean;
  /** True if tier is low */
  isWeak: boolean;
  targetFps: number;
  dpr: number;
  /** True when prefers-reduced-motion is active */
  reducedMotion: boolean;
}

export function usePerfTier(): PerfTierInfo {
  const [tier, setTier] = useState<PerfTier>(getPerfTier);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    // Observe tier changes (memory pressure monitor may downgrade)
    const observer = new MutationObserver(() => setTier(getPerfTier()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-perf-tier'],
    });

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onMotion);

    return () => {
      observer.disconnect();
      mq.removeEventListener('change', onMotion);
    };
  }, []);

  return useMemo(() => ({
    tier,
    isLow: tier === 'low',
    isMid: tier === 'mid',
    isHigh: tier === 'high',
    isUltra: tier === 'ultra',
    isWeak: tier === 'low',
    targetFps: getTargetFPS(),
    dpr: getAdaptiveDPR(),
    reducedMotion,
  }), [tier, reducedMotion]);
}

// ---------------------------------------------------------------------------
// PerfGate — Conditionally render expensive children
// ---------------------------------------------------------------------------

interface PerfGateProps {
  /** Minimum tier required to render children */
  minTier?: PerfTier;
  /** Or: explicitly list tiers that CAN render */
  allowedTiers?: PerfTier[];
  /** Optional cheaper fallback for weak devices */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

const TIER_ORDER: Record<PerfTier, number> = {
  low: 0,
  mid: 1,
  high: 2,
  ultra: 3,
};

export const PerfGate = memo<PerfGateProps>(({ minTier, allowedTiers, fallback = null, children }) => {
  const { tier } = usePerfTier();

  let allowed = true;
  if (allowedTiers) {
    allowed = allowedTiers.includes(tier);
  } else if (minTier) {
    allowed = TIER_ORDER[tier] >= TIER_ORDER[minTier];
  }

  return <>{allowed ? children : fallback}</>;
});
PerfGate.displayName = 'PerfGate';

// ---------------------------------------------------------------------------
// useWhenVisible — Defer render until element scrolls into view
// ---------------------------------------------------------------------------

/**
 * Returns [ref, isVisible]. Attach ref to the container div.
 * `isVisible` becomes true once the element enters the viewport
 * and stays true (no flicker on scroll-back).
 */
export function useWhenVisible<T extends HTMLElement = HTMLDivElement>(
  rootMargin = '200px',
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null!);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, rootMargin]);

  return [ref, visible];
}

// ---------------------------------------------------------------------------
// useAppActive — Is this app currently the foreground tab?
// ---------------------------------------------------------------------------

/**
 * Returns true only when the parent app container has data-app-state="foreground".
 * Heavy components can pause animations/timers when backgrounded.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    // Walk up to find [data-app-container]
    const findContainer = (): HTMLElement | null => {
      let el: HTMLElement | null = document.activeElement as HTMLElement;
      // Fallback: look for the foreground container
      const fg = document.querySelector('[data-app-container][data-app-state="foreground"]');
      return fg as HTMLElement | null;
    };

    const observer = new MutationObserver(() => {
      const container = findContainer();
      setActive(container?.getAttribute('data-app-state') === 'foreground');
    });

    // Observe the parent that manages app states
    const desktop = document.querySelector('[data-app-container]')?.parentElement;
    if (desktop) {
      observer.observe(desktop, { attributes: true, subtree: true, attributeFilter: ['data-app-state'] });
    }

    return () => observer.disconnect();
  }, []);

  return active;
}

// ---------------------------------------------------------------------------
// useSuspendableRAF — RAF loop that auto-pauses when app is backgrounded
// ---------------------------------------------------------------------------

/**
 * Create a RAF loop that automatically suspends when:
 * 1. The app is backgrounded (not foreground tab)
 * 2. Document visibility changes to hidden
 * 3. enabled flag is false
 * 
 * This prevents CPU waste from animations in hidden apps.
 * 
 * @example
 * useSuspendableRAF((dt) => {
 *   // Update animation with delta time in ms
 *   position.current += velocity * dt;
 * }, { enabled: isAnimating });
 */
export function useSuspendableRAF(
  callback: (deltaTime: number) => void,
  options: { enabled?: boolean; throttleFps?: number } = {}
): { isRunning: boolean; pause: () => void; resume: () => void } {
  const { enabled = true, throttleFps = 60 } = options;
  const isAppActive = useAppActive();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const callbackRef = useRef(callback);
  const frameInterval = 1000 / throttleFps;
  
  // Keep callback ref fresh
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Document visibility
  const [docVisible, setDocVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const onVisibility = () => setDocVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Determine if loop should run
  const shouldRun = enabled && isAppActive && docVisible && !isPaused;

  useEffect(() => {
    if (!shouldRun) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setIsRunning(false);
      return;
    }

    setIsRunning(true);
    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const delta = now - lastTimeRef.current;
      
      // Throttle to target FPS
      if (delta >= frameInterval) {
        lastTimeRef.current = now - (delta % frameInterval);
        callbackRef.current(delta);
      }
      
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [shouldRun, frameInterval]);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);

  return { isRunning, pause, resume };
}

// ---------------------------------------------------------------------------
// useSuspendableInterval — Interval that auto-pauses when backgrounded
// ---------------------------------------------------------------------------

/**
 * Create an interval that automatically suspends when app is backgrounded.
 * Use instead of setInterval for polling/update loops.
 */
export function useSuspendableInterval(
  callback: () => void,
  intervalMs: number,
  options: { enabled?: boolean } = {}
): void {
  const { enabled = true } = options;
  const isAppActive = useAppActive();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Document visibility
  const [docVisible, setDocVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const onVisibility = () => setDocVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const shouldRun = enabled && isAppActive && docVisible;

  useEffect(() => {
    if (!shouldRun) return;
    
    const id = setInterval(() => callbackRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [shouldRun, intervalMs]);
}

// ---------------------------------------------------------------------------
// useFrameBudget — Execute expensive work in small chunks
// ---------------------------------------------------------------------------

/**
 * Process a large array in frame-budget-safe chunks.
 * Returns [results, progress 0-1, isProcessing].
 */
export function useFrameBudget<T, R>(
  items: T[],
  processor: (item: T) => R,
  opts?: { chunkSize?: number; enabled?: boolean },
): [R[], number, boolean] {
  const chunkSize = opts?.chunkSize ?? 50;
  const enabled = opts?.enabled ?? true;
  const [results, setResults] = useState<R[]>([]);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!enabled || items.length === 0) {
      setResults([]);
      setProgress(1);
      setProcessing(false);
      return;
    }

    setProcessing(true);
    const out: R[] = [];
    let idx = 0;

    function processChunk() {
      const start = performance.now();
      while (idx < items.length && performance.now() - start < 12) {
        out.push(processor(items[idx]));
        idx++;
      }
      setResults([...out]);
      setProgress(items.length > 0 ? idx / items.length : 1);

      if (idx < items.length) {
        requestAnimationFrame(processChunk);
      } else {
        setProcessing(false);
      }
    }

    requestAnimationFrame(processChunk);
  }, [items, processor, chunkSize, enabled]);

  return [results, progress, processing];
}
