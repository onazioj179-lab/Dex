/**
 * DEX Keyboard Navigation & Focus Management
 * Accessibility and keyboard navigation utilities
 */

import React, { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface FocusTrapProps {
  children: React.ReactNode;
  active?: boolean;
  returnFocus?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
}

interface RovingTabIndexProps {
  children: React.ReactNode;
  orientation?: 'horizontal' | 'vertical' | 'both';
  loop?: boolean;
  onSelect?: (index: number) => void;
}

interface KeyboardNavigableProps {
  children: React.ReactNode;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onTab?: (shiftKey: boolean) => void;
  onHome?: () => void;
  onEnd?: () => void;
  preventDefault?: boolean;
}

interface SkipLinkProps {
  targetId: string;
  children?: React.ReactNode;
}

// ==================== FOCUS TRAP ====================

export const FocusTrap: React.FC<FocusTrapProps> = ({
  children,
  active = true,
  returnFocus = true,
  initialFocus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const getFocusableElements = (): HTMLElement[] => {
      if (!containerRef.current) return [];
      const elements = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      return Array.from(elements).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      );
    };

    // Focus initial element
    if (initialFocus?.current) {
      initialFocus.current.focus();
    } else {
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (returnFocus && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [active, returnFocus, initialFocus]);

  return (
    <div ref={containerRef}>
      {children}
    </div>
  );
};

// ==================== ROVING TAB INDEX ====================

interface RovingContextValue {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  registerItem: (index: number) => void;
  unregisterItem: (index: number) => void;
  itemCount: number;
}

const RovingContext = createContext<RovingContextValue | null>(null);

export const RovingTabIndex: React.FC<RovingTabIndexProps> = ({
  children,
  orientation = 'horizontal',
  loop = true,
  onSelect,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const itemRefs = useRef<Set<number>>(new Set());

  const registerItem = useCallback((index: number) => {
    itemRefs.current.add(index);
    setItemCount(itemRefs.current.size);
  }, []);

  const unregisterItem = useCallback((index: number) => {
    itemRefs.current.delete(index);
    setItemCount(itemRefs.current.size);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const getNext = (current: number): number => {
        const next = current + 1;
        return loop ? next % itemCount : Math.min(next, itemCount - 1);
      };

      const getPrev = (current: number): number => {
        const prev = current - 1;
        return loop
          ? prev < 0
            ? itemCount - 1
            : prev
          : Math.max(prev, 0);
      };

      let newIndex = activeIndex;

      switch (e.key) {
        case 'ArrowRight':
          if (orientation === 'horizontal' || orientation === 'both') {
            e.preventDefault();
            newIndex = getNext(activeIndex);
          }
          break;
        case 'ArrowLeft':
          if (orientation === 'horizontal' || orientation === 'both') {
            e.preventDefault();
            newIndex = getPrev(activeIndex);
          }
          break;
        case 'ArrowDown':
          if (orientation === 'vertical' || orientation === 'both') {
            e.preventDefault();
            newIndex = getNext(activeIndex);
          }
          break;
        case 'ArrowUp':
          if (orientation === 'vertical' || orientation === 'both') {
            e.preventDefault();
            newIndex = getPrev(activeIndex);
          }
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = itemCount - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onSelect?.(activeIndex);
          return;
      }

      if (newIndex !== activeIndex) {
        setActiveIndex(newIndex);
      }
    },
    [activeIndex, itemCount, orientation, loop, onSelect]
  );

  return (
    <RovingContext.Provider
      value={{ activeIndex, setActiveIndex, registerItem, unregisterItem, itemCount }}
    >
      <div onKeyDown={handleKeyDown} role="group">
        {children}
      </div>
    </RovingContext.Provider>
  );
};

// ==================== ROVING TAB ITEM ====================

interface RovingTabItemProps {
  children: React.ReactNode;
  index: number;
  as?: keyof JSX.IntrinsicElements;
}

export const RovingTabItem: React.FC<RovingTabItemProps> = ({
  children,
  index,
  as: Component = 'button',
}) => {
  const context = useContext(RovingContext);
  const ref = useRef<HTMLElement>(null);

  if (!context) {
    throw new Error('RovingTabItem must be used within RovingTabIndex');
  }

  const { activeIndex, setActiveIndex, registerItem, unregisterItem } = context;
  const isActive = activeIndex === index;

  useEffect(() => {
    registerItem(index);
    return () => unregisterItem(index);
  }, [index, registerItem, unregisterItem]);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.focus();
    }
  }, [isActive]);

  return React.createElement(
    Component,
    {
      ref,
      tabIndex: isActive ? 0 : -1,
      onClick: () => setActiveIndex(index),
      'data-active': isActive,
    },
    children
  );
};

// ==================== KEYBOARD NAVIGABLE ====================

export const KeyboardNavigable: React.FC<KeyboardNavigableProps> = ({
  children,
  onArrowUp,
  onArrowDown,
  onArrowLeft,
  onArrowRight,
  onEnter,
  onEscape,
  onTab,
  onHome,
  onEnd,
  preventDefault = true,
}) => {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let handled = false;

      switch (e.key) {
        case 'ArrowUp':
          if (onArrowUp) {
            onArrowUp();
            handled = true;
          }
          break;
        case 'ArrowDown':
          if (onArrowDown) {
            onArrowDown();
            handled = true;
          }
          break;
        case 'ArrowLeft':
          if (onArrowLeft) {
            onArrowLeft();
            handled = true;
          }
          break;
        case 'ArrowRight':
          if (onArrowRight) {
            onArrowRight();
            handled = true;
          }
          break;
        case 'Enter':
          if (onEnter) {
            onEnter();
            handled = true;
          }
          break;
        case 'Escape':
          if (onEscape) {
            onEscape();
            handled = true;
          }
          break;
        case 'Tab':
          if (onTab) {
            onTab(e.shiftKey);
            handled = true;
          }
          break;
        case 'Home':
          if (onHome) {
            onHome();
            handled = true;
          }
          break;
        case 'End':
          if (onEnd) {
            onEnd();
            handled = true;
          }
          break;
      }

      if (handled && preventDefault) {
        e.preventDefault();
      }
    },
    [onArrowUp, onArrowDown, onArrowLeft, onArrowRight, onEnter, onEscape, onTab, onHome, onEnd, preventDefault]
  );

  return (
    <div onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
};

// ==================== SKIP LINK ====================

export const SkipLink: React.FC<SkipLinkProps> = ({
  targetId,
  children = 'Skip to main content',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    link: {
      position: 'absolute',
      top: -40,
      left: 0,
      padding: '8px 16px',
      background: 'var(--color-accent)',
      color: 'white',
      textDecoration: 'none',
      fontSize: 14,
      fontWeight: 500,
      borderRadius: '0 0 4px 0',
      zIndex: 10000,
      transition: 'top 0.2s ease',
    },
  };

  return (
    <a
      href={`#${targetId}`}
      style={styles.link as any}
      onFocus={(e) => {
        e.currentTarget.style.top = '0';
      }}
      onBlur={(e) => {
        e.currentTarget.style.top = '-40px';
      }}
    >
      {children}
    </a>
  );
};

// ==================== FOCUS RING ====================

interface FocusRingProps {
  children: React.ReactElement;
  color?: string;
  offset?: number;
  width?: number;
}

export const FocusRing: React.FC<FocusRingProps> = ({
  children,
  color = 'var(--color-accent)',
  offset = 2,
  width = 2,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isKeyboard, setIsKeyboard] = useState(false);

  useEffect(() => {
    const handleKeyDown = () => setIsKeyboard(true);
    const handleMouseDown = () => setIsKeyboard(false);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  return React.cloneElement(children, {
    onFocus: (e: React.FocusEvent) => {
      setIsFocused(true);
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      setIsFocused(false);
      children.props.onBlur?.(e);
    },
    style: {
      ...children.props.style,
      outline: 'none',
      boxShadow:
        isFocused && isKeyboard
          ? `0 0 0 ${offset}px var(--color-bg), 0 0 0 ${offset + width}px ${color}`
          : children.props.style?.boxShadow,
    },
  });
};

// ==================== VISUALLY HIDDEN ====================

interface VisuallyHiddenProps {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

export const VisuallyHidden: React.FC<VisuallyHiddenProps> = ({
  children,
  as: Component = 'span',
}) => {
  const styles: React.CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  };

  return React.createElement(Component, { style: styles }, children);
};

// ==================== ANNOUNCE ====================

interface AnnounceProps {
  message: string;
  assertive?: boolean;
}

export const Announce: React.FC<AnnounceProps> = ({
  message,
  assertive = false,
}) => {
  return (
    <div
      role="status"
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {message}
    </div>
  );
};

// ==================== USE KEYBOARD SHORTCUT ====================

interface UseKeyboardShortcutOptions {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  preventDefault?: boolean;
  enabled?: boolean;
}

export const useKeyboardShortcut = (
  key: string,
  callback: () => void,
  options: UseKeyboardShortcutOptions = {}
): void => {
  const {
    ctrl = false,
    alt = false,
    shift = false,
    meta = false,
    preventDefault = true,
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const matchesModifiers =
        e.ctrlKey === ctrl &&
        e.altKey === alt &&
        e.shiftKey === shift &&
        e.metaKey === meta;

      if (e.key.toLowerCase() === key.toLowerCase() && matchesModifiers) {
        if (preventDefault) {
          e.preventDefault();
        }
        callback();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [key, callback, ctrl, alt, shift, meta, preventDefault, enabled]);
};

// ==================== USE FOCUS WITHIN ====================

export const useFocusWithin = (): [
  React.RefObject<HTMLDivElement>,
  boolean
] => {
  const ref = useRef<HTMLDivElement>(null);
  const [isFocusWithin, setIsFocusWithin] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleFocusIn = () => setIsFocusWithin(true);
    const handleFocusOut = (e: FocusEvent) => {
      if (!element.contains(e.relatedTarget as Node)) {
        setIsFocusWithin(false);
      }
    };

    element.addEventListener('focusin', handleFocusIn);
    element.addEventListener('focusout', handleFocusOut);

    return () => {
      element.removeEventListener('focusin', handleFocusIn);
      element.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return [ref, isFocusWithin];
};

// ==================== USE TAB TRAP ====================

export const useTabTrap = (
  active: boolean
): React.RefObject<HTMLDivElement> => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const getFocusable = (): HTMLElement[] => {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
        )
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  return containerRef;
};

// ==================== ARROW KEY NAVIGATION LIST ====================

interface ArrowKeyListProps {
  children: React.ReactNode;
  selectedIndex: number;
  onSelect: (index: number) => void;
  itemCount: number;
  loop?: boolean;
  orientation?: 'vertical' | 'horizontal';
}

export const ArrowKeyList: React.FC<ArrowKeyListProps> = ({
  children,
  selectedIndex,
  onSelect,
  itemCount,
  loop = true,
  orientation = 'vertical',
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';

    if (e.key === prevKey) {
      e.preventDefault();
      const newIndex = selectedIndex - 1;
      if (newIndex >= 0) {
        onSelect(newIndex);
      } else if (loop) {
        onSelect(itemCount - 1);
      }
    } else if (e.key === nextKey) {
      e.preventDefault();
      const newIndex = selectedIndex + 1;
      if (newIndex < itemCount) {
        onSelect(newIndex);
      } else if (loop) {
        onSelect(0);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      onSelect(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onSelect(itemCount - 1);
    }
  };

  return (
    <div
      role="listbox"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-activedescendant={`item-${selectedIndex}`}
    >
      {children}
    </div>
  );
};

export default FocusTrap;
