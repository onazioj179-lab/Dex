// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Phase 31: Accessibility React Hooks
// React hooks for focus management, keyboard navigation, and ARIA
// ===========================================================================

import { 
  useEffect, 
  useRef, 
  useCallback, 
  useState,
  useMemo
} from 'react';
import {
  createFocusTrap,
  createRovingTabindex,
  saveFocus,
  restoreFocus,
  focusSafely,
  getFirstFocusable,
  announce,
  announceError,
  prefersReducedMotion,
  onReducedMotionChange,
  prefersHighContrast,
  onHighContrastChange,
  initKeyboardDetection,
  isUsingKeyboard,
} from './accessibility';

// -----------------------------------------------------------------------------
// FOCUS TRAP HOOK
// -----------------------------------------------------------------------------

interface UseFocusTrapOptions {
  isActive: boolean;
  onEscape?: () => void;
  initialFocus?: 'first' | 'last' | null;
  returnFocusOnDeactivate?: boolean;
}

/**
 * Hook to create a focus trap within a container
 */
export function useFocusTrap(options: UseFocusTrapOptions) {
  const {
    isActive,
    onEscape,
    initialFocus = 'first',
    returnFocusOnDeactivate = true,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const trapRef = useRef<ReturnType<typeof createFocusTrap> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create focus trap
    trapRef.current = createFocusTrap(container, {
      onEscape,
      initialFocus,
      returnFocusOnDeactivate,
    });

    return () => {
      trapRef.current?.deactivate();
    };
  }, [onEscape, initialFocus, returnFocusOnDeactivate]);

  useEffect(() => {
    if (isActive) {
      trapRef.current?.activate();
    } else {
      trapRef.current?.deactivate();
    }
  }, [isActive]);

  return containerRef;
}

// -----------------------------------------------------------------------------
// ROVING TABINDEX HOOK
// -----------------------------------------------------------------------------

interface UseRovingTabindexOptions {
  selector: string;
  orientation?: 'horizontal' | 'vertical' | 'both';
  loop?: boolean;
  onSelect?: (element: HTMLElement, index: number) => void;
}

/**
 * Hook to manage roving tabindex within a container
 */
export function useRovingTabindex(options: UseRovingTabindexOptions) {
  const { selector, orientation = 'vertical', loop = true, onSelect } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<ReturnType<typeof createRovingTabindex> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    managerRef.current = createRovingTabindex(container, selector, {
      orientation,
      loop,
      onSelect,
    });

    managerRef.current.init();

    return () => {
      managerRef.current?.destroy();
    };
  }, [selector, orientation, loop, onSelect]);

  const setActiveIndex = useCallback((index: number) => {
    managerRef.current?.setActiveIndex(index);
  }, []);

  const getActiveIndex = useCallback(() => {
    return managerRef.current?.getActiveIndex() ?? 0;
  }, []);

  return { containerRef, setActiveIndex, getActiveIndex };
}

// -----------------------------------------------------------------------------
// FOCUS RETURN HOOK
// -----------------------------------------------------------------------------

/**
 * Hook to save and restore focus when a component mounts/unmounts
 */
export function useFocusReturn(isOpen: boolean) {
  useEffect(() => {
    if (isOpen) {
      saveFocus();
    } else {
      restoreFocus();
    }
  }, [isOpen]);
}

// -----------------------------------------------------------------------------
// AUTO FOCUS HOOK
// -----------------------------------------------------------------------------

/**
 * Hook to auto-focus an element when a condition is met
 */
export function useAutoFocus(shouldFocus: boolean) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (shouldFocus) {
      focusSafely(ref.current);
    }
  }, [shouldFocus]);

  return ref;
}

/**
 * Hook to focus the first focusable element in a container
 */
export function useFocusFirst(shouldFocus: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shouldFocus && ref.current) {
      const first = getFirstFocusable(ref.current);
      focusSafely(first);
    }
  }, [shouldFocus]);

  return ref;
}

// -----------------------------------------------------------------------------
// KEYBOARD HANDLER HOOK
// -----------------------------------------------------------------------------

type KeyHandler = (event: KeyboardEvent) => void;

interface KeyMap {
  [key: string]: KeyHandler;
}

/**
 * Hook to handle keyboard events with a key map
 */
export function useKeyboardHandlers(
  keyMap: KeyMap,
  deps: unknown[] = []
) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Build key string (e.g., "ctrl+shift+a")
      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) parts.push('ctrl');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');
      parts.push(event.key.toLowerCase());
      
      const keyString = parts.join('+');
      const handler = keyMap[keyString] || keyMap[event.key];

      if (handler) {
        event.preventDefault();
        event.stopPropagation();
        handler(event);
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    return () => element.removeEventListener('keydown', handleKeyDown);
  }, [keyMap, ...deps]);

  return ref;
}

// -----------------------------------------------------------------------------
// ESCAPE KEY HOOK
// -----------------------------------------------------------------------------

/**
 * Hook to handle Escape key press
 */
export function useEscapeKey(
  onEscape: () => void,
  isActive = true
) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, isActive]);
}

// -----------------------------------------------------------------------------
// ANNOUNCER HOOK
// -----------------------------------------------------------------------------

/**
 * Hook to announce messages to screen readers
 */
export function useAnnounce() {
  return useMemo(() => ({
    announce,
    announceError,
    announceStatus: (message: string) => announce(message, 'polite'),
  }), []);
}

/**
 * Hook to announce a message when a value changes
 */
export function useAnnounceOnChange(
  value: unknown,
  getMessage: (value: unknown) => string,
  priority: 'polite' | 'assertive' = 'polite'
) {
  const previousValue = useRef(value);

  useEffect(() => {
    if (previousValue.current !== value) {
      const message = getMessage(value);
      if (message) {
        announce(message, priority);
      }
      previousValue.current = value;
    }
  }, [value, getMessage, priority]);
}

// -----------------------------------------------------------------------------
// REDUCED MOTION HOOK
// -----------------------------------------------------------------------------

/**
 * Hook to check and respond to reduced motion preference
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    return onReducedMotionChange(setReducedMotion);
  }, []);

  return reducedMotion;
}

// -----------------------------------------------------------------------------
// HIGH CONTRAST HOOK
// -----------------------------------------------------------------------------

/**
 * Hook to check and respond to high contrast preference
 */
export function useHighContrast(): boolean {
  const [highContrast, setHighContrast] = useState(prefersHighContrast);

  useEffect(() => {
    return onHighContrastChange(setHighContrast);
  }, []);

  return highContrast;
}

// -----------------------------------------------------------------------------
// KEYBOARD USER DETECTION HOOK
// -----------------------------------------------------------------------------

/**
 * Hook to detect if user is navigating with keyboard
 */
export function useIsKeyboardUser(): boolean {
  const [isKeyboard, setIsKeyboard] = useState(isUsingKeyboard);

  useEffect(() => {
    const cleanup = initKeyboardDetection();
    
    // Update state when body class changes
    const observer = new MutationObserver(() => {
      setIsKeyboard(document.body.classList.contains('keyboard-user'));
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      cleanup();
      observer.disconnect();
    };
  }, []);

  return isKeyboard;
}

// -----------------------------------------------------------------------------
// ARIA LIVE REGION HOOK
// -----------------------------------------------------------------------------

/**
 * Hook to create an ARIA live region
 */
export function useLiveRegion(
  politeness: 'polite' | 'assertive' = 'polite'
) {
  const [message, setMessage] = useState('');

  const props = useMemo(() => ({
    role: 'status' as const,
    'aria-live': politeness,
    'aria-atomic': true,
  }), [politeness]);

  return {
    message,
    setMessage,
    props,
    clear: () => setMessage(''),
  };
}

// -----------------------------------------------------------------------------
// FOCUS VISIBLE HOOK
// -----------------------------------------------------------------------------

/**
 * Hook to track focus-visible state (keyboard focus only)
 */
export function useFocusVisible() {
  const [isFocusVisible, setIsFocusVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleFocus = () => {
      // Only show focus ring if keyboard was used
      if (isUsingKeyboard()) {
        setIsFocusVisible(true);
      }
    };

    const handleBlur = () => {
      setIsFocusVisible(false);
    };

    element.addEventListener('focus', handleFocus);
    element.addEventListener('blur', handleBlur);

    return () => {
      element.removeEventListener('focus', handleFocus);
      element.removeEventListener('blur', handleBlur);
    };
  }, []);

  return { ref, isFocusVisible };
}

// -----------------------------------------------------------------------------
// ARROW KEY NAVIGATION HOOK
// -----------------------------------------------------------------------------

interface UseArrowNavigationOptions {
  itemCount: number;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  orientation?: 'horizontal' | 'vertical' | 'both';
  loop?: boolean;
}

/**
 * Hook to handle arrow key navigation
 */
export function useArrowNavigation(options: UseArrowNavigationOptions) {
  const {
    itemCount,
    currentIndex,
    onIndexChange,
    orientation = 'vertical',
    loop = true,
  } = options;

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const isHorizontal = orientation === 'horizontal' || orientation === 'both';
    const isVertical = orientation === 'vertical' || orientation === 'both';

    let nextIndex = currentIndex;

    switch (event.key) {
      case 'ArrowDown':
        if (isVertical) {
          event.preventDefault();
          nextIndex = currentIndex + 1;
        }
        break;
      case 'ArrowUp':
        if (isVertical) {
          event.preventDefault();
          nextIndex = currentIndex - 1;
        }
        break;
      case 'ArrowRight':
        if (isHorizontal) {
          event.preventDefault();
          nextIndex = currentIndex + 1;
        }
        break;
      case 'ArrowLeft':
        if (isHorizontal) {
          event.preventDefault();
          nextIndex = currentIndex - 1;
        }
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = itemCount - 1;
        break;
      default:
        return;
    }

    // Handle looping
    if (loop) {
      if (nextIndex < 0) nextIndex = itemCount - 1;
      if (nextIndex >= itemCount) nextIndex = 0;
    } else {
      nextIndex = Math.max(0, Math.min(nextIndex, itemCount - 1));
    }

    if (nextIndex !== currentIndex) {
      onIndexChange(nextIndex);
    }
  }, [currentIndex, itemCount, onIndexChange, orientation, loop]);

  return handleKeyDown;
}
