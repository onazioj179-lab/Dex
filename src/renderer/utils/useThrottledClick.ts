// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * useThrottledClick - Prevent rapid button clicks from causing chain-reaction
 * slowdowns. Wraps click handlers with automatic throttling and optional
 * disabled state management.
 */

import { useCallback, useRef, useState } from 'react';

interface ThrottledClickOptions {
  /** Minimum ms between allowed clicks (default: 200) */
  throttleMs?: number;
  /** Auto-disable button while async operation runs */
  disableWhileLoading?: boolean;
  /** Prevent default event behavior */
  preventDefault?: boolean;
  /** Stop event propagation */
  stopPropagation?: boolean;
}

interface ThrottledClickResult<T extends (...args: any[]) => any> {
  /** Wrapped click handler */
  onClick: (...args: Parameters<T>) => void;
  /** Whether button is currently disabled due to throttle or loading */
  isDisabled: boolean;
  /** Whether async operation is in progress */
  isLoading: boolean;
}

/**
 * Hook for throttling button clicks to prevent rapid-fire interactions
 * that cause UI lag and chain-reaction slowdowns.
 * 
 * @example
 * const { onClick, isDisabled } = useThrottledClick(handleSave, { throttleMs: 300 });
 * <button onClick={onClick} disabled={isDisabled}>Save</button>
 */
export function useThrottledClick<T extends (...args: any[]) => any>(
  handler: T,
  options: ThrottledClickOptions = {}
): ThrottledClickResult<T> {
  const {
    throttleMs = 200,
    disableWhileLoading = true,
    preventDefault = false,
    stopPropagation = false,
  } = options;

  const lastClickRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);

  const onClick = useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const elapsed = now - lastClickRef.current;

    // Throttle check
    if (elapsed < throttleMs) {
      return;
    }

    // Update last click time
    lastClickRef.current = now;

    // Handle event options if first arg is an event
    const event = args[0];
    if (event && typeof event === 'object' && 'preventDefault' in event) {
      if (preventDefault) event.preventDefault();
      if (stopPropagation) event.stopPropagation();
    }

    // Execute handler
    const result = handler(...args);

    // Handle async operations
    if (result instanceof Promise && disableWhileLoading) {
      setIsLoading(true);
      result.finally(() => setIsLoading(false));
    }
  }, [handler, throttleMs, preventDefault, stopPropagation, disableWhileLoading]);

  return {
    onClick,
    isDisabled: isLoading,
    isLoading,
  };
}

/**
 * Simple throttle wrapper for inline event handlers.
 * Use when you don't need the full hook features.
 * 
 * @example
 * onClick={throttleClick(() => doSomething(), 200)}
 */
export function throttleClick<T extends (...args: any[]) => void>(
  handler: T,
  throttleMs = 200
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= throttleMs) {
      lastCall = now;
      handler(...args);
    }
  };
}

/**
 * Create a debounced click handler that waits for clicks to settle.
 * Good for search buttons or filters.
 */
export function debounceClick<T extends (...args: any[]) => void>(
  handler: T,
  debounceMs = 300
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      handler(...args);
    }, debounceMs);
  };
}
