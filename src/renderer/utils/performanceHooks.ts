// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Phase 30: React Performance Hooks
// Custom hooks for optimized rendering and state management
// ===========================================================================

import { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  useMemo,
  useLayoutEffect
} from 'react';
import { 
  throttle, 
  debounce, 
  scheduleIdleWork, 
  observeVisibility,
  trackRender,
  isUserInteracting,
  getAnimationDuration
} from './performance';

// -----------------------------------------------------------------------------
// DEFERRED STATE - Updates only during idle time
// -----------------------------------------------------------------------------

/**
 * State that defers updates during user interaction
 * Prevents UI jank during typing/scrolling
 */
export function useDeferredState<T>(
  initialValue: T,
  maxDelay = 200
): [T, T, (value: T) => void] {
  const [immediateValue, setImmediateValue] = useState(initialValue);
  const [deferredValue, setDeferredValue] = useState(initialValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const setValue = useCallback((value: T) => {
    setImmediateValue(value);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (isUserInteracting()) {
      // Defer update while user is interacting
      timeoutRef.current = setTimeout(() => {
        setDeferredValue(value);
      }, maxDelay);
    } else {
      // Update immediately if idle
      setDeferredValue(value);
    }
  }, [maxDelay]);
  
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return [immediateValue, deferredValue, setValue];
}

// -----------------------------------------------------------------------------
// LAZY STATE - Only computes when needed
// -----------------------------------------------------------------------------

/**
 * State that lazily computes expensive values
 */
export function useLazyState<T>(
  computeFn: () => T,
  deps: unknown[]
): T {
  const [value, setValue] = useState<T | null>(null);
  const computeRef = useRef(computeFn);
  computeRef.current = computeFn;
  
  useEffect(() => {
    scheduleIdleWork(() => {
      setValue(computeRef.current());
    }, 3);
  }, deps);
  
  // Return cached value or compute synchronously on first render
  return value ?? computeFn();
}

// -----------------------------------------------------------------------------
// VISIBILITY HOOK - Only render when visible
// -----------------------------------------------------------------------------

/**
 * Track if element is visible in viewport
 */
export function useIsVisible(
  ref: React.RefObject<Element>,
  options?: { onVisible?: () => void; onHidden?: () => void }
): boolean {
  const [isVisible, setIsVisible] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    return observeVisibility(element, (visible) => {
      setIsVisible(visible);
      if (visible) {
        optionsRef.current?.onVisible?.();
      } else {
        optionsRef.current?.onHidden?.();
      }
    });
  }, [ref]);
  
  return isVisible;
}

// -----------------------------------------------------------------------------
// THROTTLED CALLBACK
// -----------------------------------------------------------------------------

/**
 * Memoized throttled callback
 */
export function useThrottledCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  intervalMs: number,
  deps: unknown[]
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  return useMemo(
    () => throttle((...args: any[]) => callbackRef.current(...args), intervalMs) as T,
    [intervalMs, ...deps]
  );
}

/**
 * Memoized debounced callback
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delayMs: number,
  deps: unknown[]
): T & { cancel: () => void } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  const debounced = useMemo(
    () => debounce((...args: any[]) => callbackRef.current(...args), delayMs) as T & { cancel: () => void },
    [delayMs, ...deps]
  );
  
  useEffect(() => {
    return () => debounced.cancel();
  }, [debounced]);
  
  return debounced;
}

// -----------------------------------------------------------------------------
// RENDER TRACKING HOOK
// -----------------------------------------------------------------------------

/**
 * Track component render performance (dev only)
 */
export function useRenderTracking(componentName: string): void {
  const renderStart = useRef(performance.now());
  
  useLayoutEffect(() => {
    const renderTime = performance.now() - renderStart.current;
    trackRender(componentName, renderTime);
    // Render time tracked internally for performance analysis
  });
  
  renderStart.current = performance.now();
}

// -----------------------------------------------------------------------------
// STABLE CALLBACK - Never changes reference
// -----------------------------------------------------------------------------

/**
 * Callback that maintains stable reference
 * Prevents unnecessary re-renders of children
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  return useCallback(
    ((...args: any[]) => callbackRef.current(...args)) as T,
    []
  );
}

// -----------------------------------------------------------------------------
// PREVIOUS VALUE HOOK
// -----------------------------------------------------------------------------

/**
 * Get previous value of a variable
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref.current;
}

// -----------------------------------------------------------------------------
// ANIMATION-AWARE HOOK
// -----------------------------------------------------------------------------

/**
 * Get current animation duration based on system state
 */
export function useAnimationDuration(base = 150): number {
  const [duration, setDuration] = useState(() => getAnimationDuration(base));
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const updateDuration = () => {
      setDuration(getAnimationDuration(base));
    };
    
    mediaQuery.addEventListener('change', updateDuration);
    return () => mediaQuery.removeEventListener('change', updateDuration);
  }, [base]);
  
  return duration;
}

// -----------------------------------------------------------------------------
// MOUNT STATE HOOK
// -----------------------------------------------------------------------------

/**
 * Track component mount state to prevent updates after unmount
 */
export function useIsMounted(): () => boolean {
  const isMounted = useRef(true);
  
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  return useCallback(() => isMounted.current, []);
}

// -----------------------------------------------------------------------------
// ASYNC EFFECT HOOK
// -----------------------------------------------------------------------------

/**
 * useEffect that handles async functions properly
 */
export function useAsyncEffect(
  effect: () => Promise<void | (() => void)>,
  deps: unknown[]
): void {
  const isMounted = useIsMounted();
  
  useEffect(() => {
    let cleanup: void | (() => void);
    
    effect().then((result) => {
      if (isMounted()) {
        cleanup = result;
      }
    });
    
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, deps);
}

// -----------------------------------------------------------------------------
// INTERSECTION BATCH HOOK
// -----------------------------------------------------------------------------

/**
 * Batch intersection observations for multiple elements
 */
export function useIntersectionBatch<T extends Element>(
  elements: T[],
  callback: (element: T, isIntersecting: boolean) => void
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  useEffect(() => {
    if (elements.length === 0) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          callbackRef.current(entry.target as T, entry.isIntersecting);
        }
      },
      { rootMargin: '50px' }
    );
    
    elements.forEach((el) => observer.observe(el));
    
    return () => observer.disconnect();
  }, [elements]);
}

// -----------------------------------------------------------------------------
// SCROLL POSITION HOOK
// -----------------------------------------------------------------------------

interface ScrollPosition {
  x: number;
  y: number;
  scrollHeight: number;
  scrollWidth: number;
}

/**
 * Track scroll position with throttling
 */
export function useScrollPosition(
  ref: React.RefObject<HTMLElement>,
  throttleMs = 16
): ScrollPosition {
  const [position, setPosition] = useState<ScrollPosition>({
    x: 0,
    y: 0,
    scrollHeight: 0,
    scrollWidth: 0
  });
  
  const updatePosition = useCallback(() => {
    const element = ref.current;
    if (element) {
      setPosition({
        x: element.scrollLeft,
        y: element.scrollTop,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth
      });
    }
  }, [ref]);
  
  const throttledUpdate = useThrottledCallback(updatePosition, throttleMs, []);
  
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    updatePosition();
    element.addEventListener('scroll', throttledUpdate, { passive: true });
    
    return () => {
      element.removeEventListener('scroll', throttledUpdate);
    };
  }, [ref, throttledUpdate, updatePosition]);
  
  return position;
}

// -----------------------------------------------------------------------------
// WINDOW SIZE HOOK
// -----------------------------------------------------------------------------

interface WindowSize {
  width: number;
  height: number;
}

/**
 * Track window size with throttling
 */
export function useWindowSize(throttleMs = 100): WindowSize {
  const [size, setSize] = useState<WindowSize>({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  useEffect(() => {
    const handleResize = throttle(() => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    }, throttleMs);
    
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [throttleMs]);
  
  return size;
}

// -----------------------------------------------------------------------------
// SHARED AUDIO CONTEXT HOOK
// -----------------------------------------------------------------------------

/**
 * Hook for managing shared AudioContext across components
 * Ensures single context, handles resume on user interaction
 * Used by Imosion and VINX for real audio synthesis
 */
export function useSharedAudioContext(sampleRate: number = 48000) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isReady, setIsReady] = useState(false);

  const getContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ 
        sampleRate, 
        latencyHint: 'interactive' 
      });
    }
    return audioContextRef.current;
  }, [sampleRate]);

  const resumeContext = useCallback(async () => {
    const ctx = getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    setIsReady(true);
    return ctx;
  }, [getContext]);

  useEffect(() => {
    const handleInteraction = () => {
      resumeContext();
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };

    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [resumeContext]);

  return { getContext, resumeContext, isReady };
}

// -----------------------------------------------------------------------------
// DEX THEME CONSTANTS - Consistent styling across all apps
// -----------------------------------------------------------------------------

export const DEX_THEME = {
  // Colors
  bg: 'linear-gradient(135deg, rgba(15,15,18,0.95) 0%, rgba(10,10,12,0.98) 100%)',
  bgSecondary: 'linear-gradient(135deg, var(--color-bg-hover) 0%, var(--color-border-subtle) 100%)',
  bgTertiary: 'linear-gradient(135deg, var(--color-border-subtle) 0%, var(--color-border-subtle) 100%)',
  bgHover: 'var(--color-border)',
  border: 'var(--color-border)',
  borderLight: 'var(--color-border-subtle)',
  text: '#f0f0f2',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  accent: '#60cdff',
  accentSoft: 'rgba(96,205,255,0.2)',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  
  // Radii
  radius: '14px',
  radiusSm: '10px',
  radiusLg: '18px',
  radiusXl: '20px',
  
  // Shadows
  shadow: '0 8px 32px rgba(0,0,0,0.4)',
  shadowSm: '0 4px 16px rgba(0,0,0,0.2)',
  shadowInset: 'inset 0 1px 0 var(--color-bg-hover)',
  
  // Glass effect
  glass: 'backdrop-filter: blur(40px) saturate(180%)',
  glassLight: 'backdrop-filter: blur(20px)',
  
  // Transitions
  transitionFast: 'all 0.08s cubic-bezier(0.4, 0, 0.2, 1)',
  transitionNormal: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
  transitionSlow: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  
  // Font
  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
  fontMono: '"SF Mono", Monaco, Consolas, "Liberation Mono", monospace',
} as const;
