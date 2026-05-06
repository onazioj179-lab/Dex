// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * useAdaptiveLayout - Responsive layout hook with debounced ResizeObserver
 * 
 * Returns current breakpoint and compact mode status based on element size.
 * Used for adaptive toolbars, collapsible panels, and responsive UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDebouncedScheduler, Priority } from '../core/OperationScheduler';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface LayoutState {
  /** Current breakpoint based on width */
  breakpoint: Breakpoint;
  /** True when in compact mode (sm or xs) */
  compact: boolean;
  /** Current element width in pixels */
  width: number;
  /** Current element height in pixels */
  height: number;
  /** True when width < 400px */
  ultraCompact: boolean;
  /** True when height < 300px */
  shortHeight: boolean;
}

export interface AdaptiveLayoutOptions {
  /** Debounce delay in ms (default: 100) */
  debounceMs?: number;
  /** Custom breakpoints in pixels */
  breakpoints?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
  /** Callback when layout changes */
  onLayoutChange?: (state: LayoutState) => void;
}

const DEFAULT_BREAKPOINTS = {
  xs: 320,
  sm: 480,
  md: 640,
  lg: 900,
};

/**
 * Hook for responsive layout based on container size
 */
export function useAdaptiveLayout<T extends HTMLElement = HTMLDivElement>(
  options: AdaptiveLayoutOptions = {}
): [React.RefObject<T>, LayoutState] {
  const {
    debounceMs = 100,
    breakpoints = DEFAULT_BREAKPOINTS,
    onLayoutChange,
  } = options;

  const ref = useRef<T>(null);
  const schedulerRef = useRef(createDebouncedScheduler(debounceMs));
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;

  const [state, setState] = useState<LayoutState>({
    breakpoint: 'lg',
    compact: false,
    width: 0,
    height: 0,
    ultraCompact: false,
    shortHeight: false,
  });

  const calculateState = useCallback((width: number, height: number): LayoutState => {
    let breakpoint: Breakpoint;
    if (width <= breakpoints.xs!) breakpoint = 'xs';
    else if (width <= breakpoints.sm!) breakpoint = 'sm';
    else if (width <= breakpoints.md!) breakpoint = 'md';
    else if (width <= breakpoints.lg!) breakpoint = 'lg';
    else breakpoint = 'xl';

    return {
      breakpoint,
      compact: breakpoint === 'xs' || breakpoint === 'sm',
      width,
      height,
      ultraCompact: width < 400,
      shortHeight: height < 300,
    };
  }, [breakpoints]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      
      schedulerRef.current.schedule(() => {
        const newState = calculateState(width, height);
        setState(prev => {
          // Only update if changed
          if (
            prev.breakpoint === newState.breakpoint &&
            prev.width === newState.width &&
            prev.height === newState.height
          ) {
            return prev;
          }
          onLayoutChangeRef.current?.(newState);
          return newState;
        });
      }, Priority.NORMAL);
    });

    observer.observe(element);

    // Initial measurement
    const rect = element.getBoundingClientRect();
    const initialState = calculateState(rect.width, rect.height);
    setState(initialState);

    return () => {
      observer.disconnect();
      schedulerRef.current.cancel();
    };
  }, [calculateState]);

  return [ref as React.RefObject<T>, state];
}

/**
 * Simplified hook that returns just compact/breakpoint from window size
 */
export function useWindowBreakpoint(): { breakpoint: Breakpoint; compact: boolean } {
  const [state, setState] = useState(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    return {
      breakpoint: getBreakpoint(width),
      compact: width < 640,
    };
  });

  useEffect(() => {
    const scheduler = createDebouncedScheduler(100);

    const handleResize = () => {
      scheduler.schedule(() => {
        const width = window.innerWidth;
        setState({
          breakpoint: getBreakpoint(width),
          compact: width < 640,
        });
      }, Priority.NORMAL);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      scheduler.cancel();
    };
  }, []);

  return state;
}

function getBreakpoint(width: number): Breakpoint {
  if (width <= 320) return 'xs';
  if (width <= 480) return 'sm';
  if (width <= 640) return 'md';
  if (width <= 900) return 'lg';
  return 'xl';
}

/**
 * Hook for detecting orientation changes
 */
export function useOrientation(): 'portrait' | 'landscape' {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'landscape';
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  });

  useEffect(() => {
    const handleOrientationChange = () => {
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };

    window.addEventListener('resize', handleOrientationChange, { passive: true });
    
    // Also listen for orientation change event on mobile
    if ('orientation' in window) {
      window.addEventListener('orientationchange', handleOrientationChange);
    }

    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      if ('orientation' in window) {
        window.removeEventListener('orientationchange', handleOrientationChange);
      }
    };
  }, []);

  return orientation;
}

/**
 * Utility: get CSS classes based on breakpoint
 */
export function getBreakpointClasses(state: LayoutState): string {
  const classes: string[] = [`bp-${state.breakpoint}`];
  if (state.compact) classes.push('compact');
  if (state.ultraCompact) classes.push('ultra-compact');
  if (state.shortHeight) classes.push('short-height');
  return classes.join(' ');
}

/**
 * Utility: responsive value selector
 */
export function selectResponsive<T>(
  breakpoint: Breakpoint,
  values: Partial<Record<Breakpoint, T>> & { default: T }
): T {
  // Check from current breakpoint down to find a value
  const order: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl'];
  const currentIndex = order.indexOf(breakpoint);

  for (let i = currentIndex; i >= 0; i--) {
    const bp = order[i];
    if (bp in values) {
      return values[bp] as T;
    }
  }
  return values.default;
}
