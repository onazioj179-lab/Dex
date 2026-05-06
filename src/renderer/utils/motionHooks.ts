// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Motion Hooks
 * React hooks for spring animations, momentum scroll, and micro-interactions.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  SpringAnimator,
  SpringConfig,
  MomentumScroller,
  ElasticScroller,
  SPRING_PRESETS,
  isReduceMotion,
  applyWillChange,
  removeWillChange,
  perfAudit,
} from './MotionController';

// ---------------------------------------------------------------------------
// useSpring -- animates a single numeric value with spring physics
// ---------------------------------------------------------------------------

export function useSpring(
  target: number,
  config: SpringConfig = SPRING_PRESETS.modal,
): number {
  const [value, setValue] = useState(target);
  const springRef = useRef<SpringAnimator | null>(null);

  useEffect(() => {
    if (!springRef.current) {
      springRef.current = new SpringAnimator(config, target);
      springRef.current.onUpdate(setValue);
    }
    springRef.current.setTarget(target);
  }, [target]);

  useEffect(() => {
    return () => {
      springRef.current?.destroy();
      springRef.current = null;
    };
  }, []);

  return value;
}

// ---------------------------------------------------------------------------
// useSpringRef -- imperative spring for direct DOM manipulation
// ---------------------------------------------------------------------------

export function useSpringRef(config: SpringConfig = SPRING_PRESETS.modal) {
  const springRef = useRef<SpringAnimator>(new SpringAnimator(config, 0));

  useEffect(() => {
    return () => { springRef.current.destroy(); };
  }, []);

  return springRef.current;
}

// ---------------------------------------------------------------------------
// useMomentumScroll -- adds momentum to a scroll container
// ---------------------------------------------------------------------------

export function useMomentumScroll(
  containerRef: React.RefObject<HTMLElement | null>,
  options?: { friction?: number; axis?: 'x' | 'y' },
) {
  const scrollerRef = useRef<MomentumScroller | null>(null);
  const lastPosRef = useRef(0);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.classList.add('dex-scroll');

    const scroller = new MomentumScroller({ friction: options?.friction ?? 0.95 });
    scrollerRef.current = scroller;

    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      el.classList.add('is-scrolling');
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        el.classList.remove('is-scrolling');
      }, 800);
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      scroller.destroy();
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [containerRef.current]);
}

// ---------------------------------------------------------------------------
// useScrollFade -- auto-hide scrollbar class management
// ---------------------------------------------------------------------------

export function useScrollFade(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.classList.add('dex-scroll');
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      el.classList.add('is-scrolling');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        el.classList.remove('is-scrolling');
      }, 800);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [containerRef.current]);
}

// ---------------------------------------------------------------------------
// useMicroInteraction -- button press scale + hover brightness
// ---------------------------------------------------------------------------

export interface MicroInteractionHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
}

export function useMicroInteraction(options?: {
  scale?: number;       // default 0.97
  hoverBrightness?: number; // default 1.08
  disabled?: boolean;
}): MicroInteractionHandlers {
  const scale = options?.scale ?? 0.97;
  const brightness = options?.hoverBrightness ?? 1.08;
  const disabled = options?.disabled ?? false;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || isReduceMotion()) return;
    const el = e.currentTarget as HTMLElement;
    applyWillChange(el);
    el.style.transform = `scale(${scale})`;
  }, [scale, disabled]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    const el = e.currentTarget as HTMLElement;
    el.style.transform = 'scale(1)';
    requestAnimationFrame(() => removeWillChange(el));
  }, [disabled]);

  const onPointerLeave = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    const el = e.currentTarget as HTMLElement;
    el.style.transform = 'scale(1)';
    el.style.filter = '';
    requestAnimationFrame(() => removeWillChange(el));
  }, [disabled]);

  const onMouseEnter = useCallback((e: React.MouseEvent) => {
    if (disabled || isReduceMotion()) return;
    (e.currentTarget as HTMLElement).style.filter = `brightness(${brightness})`;
  }, [brightness, disabled]);

  const onMouseLeave = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    (e.currentTarget as HTMLElement).style.filter = '';
  }, [disabled]);

  return { onPointerDown, onPointerUp, onPointerLeave, onMouseEnter, onMouseLeave };
}

// ---------------------------------------------------------------------------
// usePerfAudit -- toggle from dev settings
// ---------------------------------------------------------------------------

export function usePerfAudit() {
  const [enabled, setEnabled] = useState(perfAudit.enabled);

  const toggle = useCallback(() => {
    perfAudit.toggle();
    setEnabled(perfAudit.enabled);
  }, []);

  return { enabled, toggle };
}

// ---------------------------------------------------------------------------
// useAppTransition -- cross-fade + scale for app switching
// ---------------------------------------------------------------------------

export function useAppTransition(currentApp: string, containerRef: React.RefObject<HTMLElement | null>) {
  const prevApp = useRef(currentApp);

  useEffect(() => {
    if (prevApp.current === currentApp) return;
    prevApp.current = currentApp;

    const container = containerRef.current;
    if (!container) return;

    // Find the visible child (skip floating windows — they manage their own transitions)
    const children = Array.from(container.children) as HTMLElement[];
    children.forEach(child => {
      if (child.hasAttribute('data-floating-window')) return;
      // Skip transition if an app is currently closing (avoid both pages being transparent)
      if (child.classList.contains('dex-app-closing')) return;
      if (child.style.display !== 'none' && child.getAttribute('aria-hidden') !== 'true') {
        if (isReduceMotion()) return;
        applyWillChange(child, 'transform, opacity');
        child.style.opacity = '0';
        child.style.transform = 'scale(1.02)';
        requestAnimationFrame(() => {
          child.style.transition = 'opacity 0.15s ease, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)';
          child.style.opacity = '1';
          child.style.transform = 'scale(1)';
          setTimeout(() => {
            child.style.transition = '';
            removeWillChange(child);
          }, 180);
        });
      }
    });
  }, [currentApp]);
}

// ---------------------------------------------------------------------------
// useElasticScroll -- iOS-like rubber band overscroll with spring bounce
// ---------------------------------------------------------------------------

export interface ElasticScrollOptions {
  axis?: 'y' | 'x';
  friction?: number;
  elasticity?: number;
  maxOverscroll?: number;
  onBounce?: (direction: 'top' | 'bottom') => void;
}

export interface ElasticScrollResult {
  containerRef: React.RefObject<HTMLDivElement>;
  overscroll: number;
  isBouncing: boolean;
}

export function useElasticScroll(options: ElasticScrollOptions = {}): ElasticScrollResult {
  const {
    axis = 'y',
    friction = 0.95,
    elasticity = 0.4,
    maxOverscroll = 150,
    onBounce,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<ElasticScroller | null>(null);
  const [overscroll, setOverscroll] = useState(0);
  const [isBouncing, setIsBouncing] = useState(false);
  const isDragging = useRef(false);
  const startPos = useRef(0);
  const startScroll = useRef(0);
  const lastPos = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.classList.add('dex-scroll');

    const scroller = new ElasticScroller({
      friction,
      elasticity,
      maxOverscroll,
      bounceSpring: SPRING_PRESETS.elasticBounce,
    });
    scrollerRef.current = scroller;

    scroller.onScroll((pos, over) => {
      if (axis === 'y') {
        el.scrollTop = pos;
      } else {
        el.scrollLeft = pos;
      }
      setOverscroll(over);
    });

    scroller.onSettle(() => {
      setIsBouncing(false);
    });

    scroller.onBounceStart((dir) => {
      setIsBouncing(true);
      onBounce?.(dir);
    });

    // Update bounds when content changes
    const updateBounds = () => {
      if (axis === 'y') {
        scroller.setBounds(0, el.scrollHeight - el.clientHeight);
        scroller.setPosition(el.scrollTop);
      } else {
        scroller.setBounds(0, el.scrollWidth - el.clientWidth);
        scroller.setPosition(el.scrollLeft);
      }
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(el);
    
    // Scroll event to sync position
    const onScroll = () => {
      if (!isDragging.current && !scrollerRef.current?.isBouncing) {
        el.classList.add('is-scrolling');
        setTimeout(() => el.classList.remove('is-scrolling'), 800);
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      scroller.destroy();
      observer.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, [axis, friction, elasticity, maxOverscroll, onBounce]);

  // Touch/pointer handlers for elastic overscroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getPos = (e: PointerEvent) => axis === 'y' ? e.clientY : e.clientX;
    const getScroll = () => axis === 'y' ? el.scrollTop : el.scrollLeft;
    const getMaxScroll = () => axis === 'y' 
      ? el.scrollHeight - el.clientHeight 
      : el.scrollWidth - el.clientWidth;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      
      isDragging.current = true;
      startPos.current = getPos(e);
      startScroll.current = getScroll();
      lastPos.current = getPos(e);
      lastTime.current = performance.now();
      velocity.current = 0;

      scrollerRef.current?.stop();
      scrollerRef.current?.setBounds(0, getMaxScroll());
      scrollerRef.current?.setPosition(getScroll());

      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;

      const pos = getPos(e);
      const delta = lastPos.current - pos; // Inverted for natural scrolling
      const now = performance.now();
      const dt = now - lastTime.current;

      if (dt > 0) {
        velocity.current = (delta / dt) * 16; // Normalize to ~60fps
      }

      lastPos.current = pos;
      lastTime.current = now;

      scrollerRef.current?.applyDelta(delta);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;

      el.releasePointerCapture(e.pointerId);
      scrollerRef.current?.release(velocity.current);
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      scrollerRef.current?.release(0);
    };

    // Only enable touch-based elastic scroll on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      el.addEventListener('pointerdown', onPointerDown, { passive: true });
      el.addEventListener('pointermove', onPointerMove, { passive: true });
      el.addEventListener('pointerup', onPointerUp, { passive: true });
      el.addEventListener('pointercancel', onPointerCancel, { passive: true });

      return () => {
        el.removeEventListener('pointerdown', onPointerDown);
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerUp);
        el.removeEventListener('pointercancel', onPointerCancel);
      };
    }
  }, [axis]);

  return { containerRef, overscroll, isBouncing };
}

// ---------------------------------------------------------------------------
// useKeyboardList -- keyboard navigation for lists (arrows, home/end)
// ---------------------------------------------------------------------------

export interface KeyboardListOptions {
  itemCount: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onActivate?: (index: number) => void;
  wrap?: boolean;
  horizontal?: boolean;
}

export function useKeyboardList(options: KeyboardListOptions) {
  const {
    itemCount,
    selectedIndex,
    onSelect,
    onActivate,
    wrap = false,
    horizontal = false,
  } = options;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const nextKey = horizontal ? 'ArrowRight' : 'ArrowDown';
    const prevKey = horizontal ? 'ArrowLeft' : 'ArrowUp';

    switch (e.key) {
      case nextKey: {
        e.preventDefault();
        let next = selectedIndex + 1;
        if (next >= itemCount) next = wrap ? 0 : itemCount - 1;
        onSelect(next);
        break;
      }
      case prevKey: {
        e.preventDefault();
        let prev = selectedIndex - 1;
        if (prev < 0) prev = wrap ? itemCount - 1 : 0;
        onSelect(prev);
        break;
      }
      case 'Home':
        e.preventDefault();
        onSelect(0);
        break;
      case 'End':
        e.preventDefault();
        onSelect(itemCount - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onActivate?.(selectedIndex);
        break;
    }
  }, [itemCount, selectedIndex, onSelect, onActivate, wrap, horizontal]);

  return { onKeyDown: handleKeyDown };
}

// ---------------------------------------------------------------------------
// useButtonPress -- spring-based button press animation
// ---------------------------------------------------------------------------

export function useButtonPress(options?: { scale?: number; disabled?: boolean }) {
  const scale = options?.scale ?? 0.96;
  const disabled = options?.disabled ?? false;
  const springRef = useRef<SpringAnimator | null>(null);
  const elRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    springRef.current = new SpringAnimator(SPRING_PRESETS.buttonPress, 1);
    springRef.current.onUpdate((v) => {
      if (elRef.current) {
        elRef.current.style.transform = `scale(${v})`;
      }
    });

    return () => {
      springRef.current?.destroy();
    };
  }, []);

  const handlers = {
    onPointerDown: useCallback((e: React.PointerEvent) => {
      if (disabled || isReduceMotion()) return;
      elRef.current = e.currentTarget as HTMLElement;
      applyWillChange(elRef.current);
      springRef.current?.setTarget(scale);
    }, [scale, disabled]),

    onPointerUp: useCallback(() => {
      if (disabled) return;
      springRef.current?.setTarget(1);
      setTimeout(() => {
        if (elRef.current) removeWillChange(elRef.current);
      }, 150);
    }, [disabled]),

    onPointerLeave: useCallback(() => {
      if (disabled) return;
      springRef.current?.setTarget(1);
      if (elRef.current) removeWillChange(elRef.current);
    }, [disabled]),
  };

  return handlers;
}

// ---------------------------------------------------------------------------
// useRipple -- Material-style ripple effect for buttons
// ---------------------------------------------------------------------------

export function useRipple(options?: { color?: string; duration?: number; disabled?: boolean }) {
  const color = options?.color ?? 'rgba(255, 255, 255, 0.25)';
  const duration = options?.duration ?? 500;
  const disabled = options?.disabled ?? false;
  const containerRef = useRef<HTMLElement | null>(null);
  const rippleContainerRef = useRef<HTMLDivElement | null>(null);

  // Create ripple container on mount
  useEffect(() => {
    return () => {
      // Cleanup
      if (rippleContainerRef.current && containerRef.current) {
        containerRef.current.removeChild(rippleContainerRef.current);
      }
    };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (disabled || isReduceMotion()) return;

    const el = e.currentTarget as HTMLElement;
    containerRef.current = el;

    // Ensure container is positioned
    const computedStyle = getComputedStyle(el);
    if (computedStyle.position === 'static') {
      el.style.position = 'relative';
    }
    el.style.overflow = 'hidden';

    // Create ripple container if needed
    if (!rippleContainerRef.current) {
      const container = document.createElement('div');
      container.style.cssText = `
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        border-radius: inherit;
      `;
      el.appendChild(container);
      rippleContainerRef.current = container;
    }

    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: ${color};
      border-radius: 50%;
      transform: scale(0);
      animation: dex-ripple ${duration}ms ease-out forwards;
      pointer-events: none;
    `;

    rippleContainerRef.current.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
      ripple.remove();
    }, duration);
  }, [color, duration, disabled]);

  return { onClick: handleClick };
}

// Inject ripple keyframes once
let rippleStyleInjected = false;
if (typeof document !== 'undefined' && !rippleStyleInjected) {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes dex-ripple {
      0% { transform: scale(0); opacity: 1; }
      100% { transform: scale(1); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  rippleStyleInjected = true;
}

// ---------------------------------------------------------------------------
// useReducedMotion -- hook to check and subscribe to reduced motion preference
// ---------------------------------------------------------------------------

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => isReduceMotion());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    
    setReduced(mediaQuery.matches);
    mediaQuery.addEventListener('change', handler);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reduced;
}

// ---------------------------------------------------------------------------
// useScrollPosition -- track scroll position with throttling
// ---------------------------------------------------------------------------

export function useScrollPosition(
  containerRef: React.RefObject<HTMLElement | null>,
  throttleMs = 16
) {
  const [position, setPosition] = useState({ x: 0, y: 0, atTop: true, atBottom: false, atLeft: true, atRight: false });
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updatePosition = () => {
      const now = performance.now();
      if (now - lastUpdateRef.current < throttleMs) return;
      lastUpdateRef.current = now;

      const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = el;
      setPosition({
        x: scrollLeft,
        y: scrollTop,
        atTop: scrollTop <= 0,
        atBottom: scrollTop >= scrollHeight - clientHeight - 1,
        atLeft: scrollLeft <= 0,
        atRight: scrollLeft >= scrollWidth - clientWidth - 1,
      });
    };

    updatePosition();
    el.addEventListener('scroll', updatePosition, { passive: true });
    
    return () => el.removeEventListener('scroll', updatePosition);
  }, [containerRef, throttleMs]);

  return position;
}

// ---------------------------------------------------------------------------
// useFocusVisible -- track if focus came from keyboard
// ---------------------------------------------------------------------------

export function useFocusVisible() {
  const [focusVisible, setFocusVisible] = useState(false);
  const hadKeyboardEventRef = useRef(false);

  useEffect(() => {
    const onKeyDown = () => { hadKeyboardEventRef.current = true; };
    const onPointerDown = () => { hadKeyboardEventRef.current = false; };
    const onFocus = () => {
      if (hadKeyboardEventRef.current) {
        setFocusVisible(true);
      }
    };
    const onBlur = () => setFocusVisible(false);

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focus', onFocus, true);
    document.addEventListener('blur', onBlur, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focus', onFocus, true);
      document.removeEventListener('blur', onBlur, true);
    };
  }, []);

  return focusVisible;
}

// ---------------------------------------------------------------------------
// useVirtualScroll -- virtualize large lists for performance
// ---------------------------------------------------------------------------

export interface VirtualScrollOptions<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  containerHeight?: number;
}

export interface VirtualScrollResult<T> {
  containerRef: React.RefObject<HTMLDivElement>;
  virtualItems: Array<{ index: number; item: T; style: React.CSSProperties }>;
  totalHeight: number;
  scrollTo: (index: number, behavior?: ScrollBehavior) => void;
  isScrolling: boolean;
}

export function useVirtualScroll<T>(options: VirtualScrollOptions<T>): VirtualScrollResult<T> {
  const { items, itemHeight, overscan = 3, containerHeight: containerHeightProp } = options;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(containerHeightProp ?? 400);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollingTimeoutRef = useRef<number | null>(null);

  // Update container height on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el || containerHeightProp !== undefined) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setContainerHeight(el.clientHeight);

    return () => observer.disconnect();
  }, [containerHeightProp]);

  // Track scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      setScrollTop(el.scrollTop);
      setIsScrolling(true);

      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current);
      }
      scrollingTimeoutRef.current = window.setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (scrollingTimeoutRef.current) clearTimeout(scrollingTimeoutRef.current);
    };
  }, []);

  const totalHeight = items.length * itemHeight;

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  // Create virtual items
  const virtualItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    virtualItems.push({
      index: i,
      item: items[i],
      style: {
        position: 'absolute' as const,
        top: i * itemHeight,
        left: 0,
        right: 0,
        height: itemHeight,
      },
    });
  }

  const scrollTo = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: index * itemHeight, behavior });
  }, [itemHeight]);

  return { containerRef, virtualItems, totalHeight, scrollTo, isScrolling };
}

// ---------------------------------------------------------------------------
// useInfiniteScroll -- trigger load more when near bottom
// ---------------------------------------------------------------------------

export interface InfiniteScrollOptions {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  threshold?: number;
  rootMargin?: string;
}

export function useInfiniteScroll(options: InfiniteScrollOptions) {
  const { hasMore, isLoading, onLoadMore, threshold = 0.8, rootMargin = '100px' } = options;
  
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (!hasMore || isLoading) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      { threshold, rootMargin }
    );

    observerRef.current.observe(sentinel);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [hasMore, isLoading, onLoadMore, threshold, rootMargin]);

  return { sentinelRef };
}

// ---------------------------------------------------------------------------
// useScrollRestoration -- save and restore scroll position by key
// ---------------------------------------------------------------------------

const scrollPositionStore = new Map<string, { x: number; y: number }>();

export interface ScrollRestorationOptions {
  key: string;
  debounceMs?: number;
  behavior?: ScrollBehavior;
}

export function useScrollRestoration(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ScrollRestorationOptions
) {
  const { key, debounceMs = 100, behavior = 'auto' } = options;
  const debounceRef = useRef<number | null>(null);
  const restoredRef = useRef(false);

  // Restore scroll position on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el || restoredRef.current) return;

    const saved = scrollPositionStore.get(key);
    if (saved) {
      // Delay to ensure content is rendered
      requestAnimationFrame(() => {
        el.scrollTo({ left: saved.x, top: saved.y, behavior });
      });
    }
    restoredRef.current = true;
  }, [key, behavior, containerRef]);

  // Save scroll position on scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const savePosition = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        scrollPositionStore.set(key, { x: el.scrollLeft, y: el.scrollTop });
      }, debounceMs);
    };

    el.addEventListener('scroll', savePosition, { passive: true });

    return () => {
      el.removeEventListener('scroll', savePosition);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [key, debounceMs, containerRef]);

  const clear = useCallback(() => {
    scrollPositionStore.delete(key);
  }, [key]);

  return { clear };
}

// ---------------------------------------------------------------------------
// useShiftWheelScroll -- enable horizontal scroll via Shift+wheel
// ---------------------------------------------------------------------------

export function useShiftWheelScroll(
  containerRef: React.RefObject<HTMLElement | null>,
  options?: { multiplier?: number; enabled?: boolean }
) {
  const multiplier = options?.multiplier ?? 1;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const handleWheel = (e: WheelEvent) => {
      // Only handle Shift+wheel for horizontal scroll
      if (!e.shiftKey) return;
      
      // Check if element can scroll horizontally
      const canScrollHorizontal = el.scrollWidth > el.clientWidth;
      if (!canScrollHorizontal) return;

      e.preventDefault();
      el.scrollLeft += e.deltaY * multiplier;
    };

    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef, multiplier, enabled]);
}

// ---------------------------------------------------------------------------
// useListAnimation -- reorder and enter/exit animations for lists
// ---------------------------------------------------------------------------

export interface ListAnimationOptions {
  items: Array<{ id: string | number }>;
  duration?: number;
  staggerDelay?: number;
}

export function useListAnimation<T extends { id: string | number }>(
  options: ListAnimationOptions
) {
  const { items, duration = 200, staggerDelay = 30 } = options;
  
  const prevItemsRef = useRef<Array<{ id: string | number }>>([]);
  const [animations, setAnimations] = useState<Map<string | number, {
    entering: boolean;
    exiting: boolean;
    moving: boolean;
    delay: number;
  }>>(new Map());

  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setAnimations(new Map());
      prevItemsRef.current = [...items];
      return;
    }

    const prevItems = prevItemsRef.current;
    const newAnimations = new Map<string | number, {
      entering: boolean;
      exiting: boolean;
      moving: boolean;
      delay: number;
    }>();

    const prevIds = new Set(prevItems.map(i => i.id));
    const currentIds = new Set(items.map(i => i.id));

    // Find entering items
    let enterIndex = 0;
    items.forEach((item) => {
      if (!prevIds.has(item.id)) {
        newAnimations.set(item.id, {
          entering: true,
          exiting: false,
          moving: false,
          delay: enterIndex * staggerDelay,
        });
        enterIndex++;
      }
    });

    // Find exiting items
    prevItems.forEach((item) => {
      if (!currentIds.has(item.id)) {
        newAnimations.set(item.id, {
          entering: false,
          exiting: true,
          moving: false,
          delay: 0,
        });
      }
    });

    // Find moving items (position changed)
    const prevIndexMap = new Map(prevItems.map((item, i) => [item.id, i]));
    items.forEach((item, newIndex) => {
      const oldIndex = prevIndexMap.get(item.id);
      if (oldIndex !== undefined && oldIndex !== newIndex && !newAnimations.has(item.id)) {
        newAnimations.set(item.id, {
          entering: false,
          exiting: false,
          moving: true,
          delay: 0,
        });
      }
    });

    setAnimations(newAnimations);
    prevItemsRef.current = [...items];

    // Clear animations after duration
    const timeout = window.setTimeout(() => {
      setAnimations(new Map());
    }, duration + (enterIndex * staggerDelay));

    return () => clearTimeout(timeout);
  }, [items, duration, staggerDelay, reducedMotion]);

  const getAnimationStyle = useCallback((id: string | number): React.CSSProperties => {
    const anim = animations.get(id);
    if (!anim || reducedMotion) return {};

    const { entering, exiting, moving, delay } = anim;
    
    if (entering) {
      return {
        animation: `dex-list-enter ${duration}ms ease-out ${delay}ms both`,
      };
    }
    if (exiting) {
      return {
        animation: `dex-list-exit ${duration}ms ease-in both`,
        position: 'absolute',
      };
    }
    if (moving) {
      return {
        transition: `transform ${duration}ms ease-out`,
      };
    }
    return {};
  }, [animations, duration, reducedMotion]);

  return { getAnimationStyle };
}

// Inject list animation keyframes
let listAnimStyleInjected = false;
if (typeof document !== 'undefined' && !listAnimStyleInjected) {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes dex-list-enter {
      from { opacity: 0; transform: translateY(-10px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes dex-list-exit {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(10px) scale(0.96); }
    }
  `;
  document.head.appendChild(style);
  listAnimStyleInjected = true;
}

// ---------------------------------------------------------------------------
// useScrollHeader -- scroll-aware shrinking/expanding header
// ---------------------------------------------------------------------------

export interface ScrollHeaderOptions {
  shrinkThreshold?: number;
  expandThreshold?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface ScrollHeaderResult {
  containerRef: React.RefObject<HTMLElement>;
  headerRef: React.RefObject<HTMLElement>;
  isShrunken: boolean;
  scrollProgress: number;
  headerStyle: React.CSSProperties;
}

export function useScrollHeader(options: ScrollHeaderOptions = {}): ScrollHeaderResult {
  const {
    shrinkThreshold = 100,
    expandThreshold = 50,
    minHeight = 60,
    maxHeight = 120,
  } = options;

  const containerRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [isShrunken, setIsShrunken] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const lastScrollY = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        const scrollY = container.scrollTop;
        const deltaY = scrollY - lastScrollY.current;
        
        // Calculate progress for smooth height transition
        const progress = Math.min(1, Math.max(0, scrollY / shrinkThreshold));
        setScrollProgress(progress);

        // Determine shrunk state with hysteresis
        if (!isShrunken && scrollY > shrinkThreshold) {
          setIsShrunken(true);
        } else if (isShrunken && scrollY < expandThreshold) {
          setIsShrunken(false);
        }

        lastScrollY.current = scrollY;
        rafRef.current = null;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shrinkThreshold, expandThreshold, isShrunken]);

  const headerStyle: React.CSSProperties = {
    height: maxHeight - (maxHeight - minHeight) * scrollProgress,
    transition: 'height 0.2s ease-out',
    willChange: 'height',
    overflow: 'hidden',
  };

  return { containerRef, headerRef, isShrunken, scrollProgress, headerStyle };
}

// ---------------------------------------------------------------------------
// usePullToRefresh -- pull-to-refresh gesture for list views
// ---------------------------------------------------------------------------

export interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
  enabled?: boolean;
}

export interface PullToRefreshResult {
  containerRef: React.RefObject<HTMLDivElement>;
  isRefreshing: boolean;
  pullProgress: number;
  pullDistance: number;
  indicatorStyle: React.CSSProperties;
}

export function usePullToRefresh(options: PullToRefreshOptions): PullToRefreshResult {
  const { onRefresh, threshold = 80, maxPull = 120, enabled = true } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startScrollTop = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (container.scrollTop > 0 || isRefreshing) return;
      
      isDragging.current = true;
      startY.current = e.touches[0].clientY;
      startScrollTop.current = container.scrollTop;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || isRefreshing) return;
      
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - startY.current;
      
      // Only allow pulling down when at top
      if (deltaY > 0 && container.scrollTop === 0) {
        e.preventDefault();
        // Apply resistance curve
        const resistance = 0.4;
        const pull = Math.min(maxPull, deltaY * resistance);
        setPullDistance(pull);
      }
    };

    const handleTouchEnd = async () => {
      if (!isDragging.current) return;
      isDragging.current = false;

      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(threshold); // Hold at threshold during refresh
        
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, isRefreshing, onRefresh, pullDistance, threshold, maxPull]);

  const pullProgress = Math.min(1, pullDistance / threshold);

  const indicatorStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: `translateX(-50%) translateY(${pullDistance - 40}px) rotate(${pullProgress * 360}deg)`,
    opacity: pullProgress,
    transition: isDragging.current ? 'none' : 'transform 0.3s ease-out, opacity 0.3s ease-out',
    pointerEvents: 'none',
  };

  return { containerRef, isRefreshing, pullProgress, pullDistance, indicatorStyle };
}

// ---------------------------------------------------------------------------
// usePageTransition -- page enter/exit animations
// ---------------------------------------------------------------------------

export type PageTransitionType = 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'scale' | 'none';

export interface PageTransitionOptions {
  type?: PageTransitionType;
  duration?: number;
  onEnterComplete?: () => void;
  onExitComplete?: () => void;
}

export function usePageTransition(isActive: boolean, options: PageTransitionOptions = {}) {
  const { type = 'fade', duration = 200, onEnterComplete, onExitComplete } = options;
  const [state, setState] = useState<'entering' | 'entered' | 'exiting' | 'exited'>(
    isActive ? 'entered' : 'exited'
  );
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setState(isActive ? 'entered' : 'exited');
      return;
    }

    if (isActive && state === 'exited') {
      setState('entering');
      const timer = setTimeout(() => {
        setState('entered');
        onEnterComplete?.();
      }, duration);
      return () => clearTimeout(timer);
    } else if (!isActive && state === 'entered') {
      setState('exiting');
      const timer = setTimeout(() => {
        setState('exited');
        onExitComplete?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isActive, state, duration, onEnterComplete, onExitComplete, reducedMotion]);

  const getTransitionStyles = (): React.CSSProperties => {
    if (reducedMotion || type === 'none') {
      return { opacity: state === 'exited' ? 0 : 1 };
    }

    const baseStyle: React.CSSProperties = {
      transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
    };

    const transforms: Record<PageTransitionType, { entering: string; exiting: string }> = {
      fade: { entering: 'none', exiting: 'none' },
      'slide-left': { entering: 'translateX(20px)', exiting: 'translateX(-20px)' },
      'slide-right': { entering: 'translateX(-20px)', exiting: 'translateX(20px)' },
      'slide-up': { entering: 'translateY(20px)', exiting: 'translateY(-20px)' },
      scale: { entering: 'scale(0.95)', exiting: 'scale(1.05)' },
      none: { entering: 'none', exiting: 'none' },
    };

    switch (state) {
      case 'entering':
        return {
          ...baseStyle,
          opacity: 0,
          transform: transforms[type].entering,
        };
      case 'entered':
        return {
          ...baseStyle,
          opacity: 1,
          transform: 'none',
        };
      case 'exiting':
        return {
          ...baseStyle,
          opacity: 0,
          transform: transforms[type].exiting,
        };
      case 'exited':
        return {
          opacity: 0,
          pointerEvents: 'none',
        };
    }
  };

  return {
    state,
    isVisible: state !== 'exited',
    style: getTransitionStyles(),
  };
}

// ---------------------------------------------------------------------------
// useScrollDirection -- detect scroll up/down direction
// ---------------------------------------------------------------------------

export function useScrollDirection(
  containerRef: React.RefObject<HTMLElement | null>,
  options?: { threshold?: number }
) {
  const threshold = options?.threshold ?? 10;
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const lastScrollY = useRef(0);
  const lastDirection = useRef<'up' | 'down' | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollY = container.scrollTop;
      const delta = scrollY - lastScrollY.current;

      if (Math.abs(delta) >= threshold) {
        const newDirection = delta > 0 ? 'down' : 'up';
        if (newDirection !== lastDirection.current) {
          setDirection(newDirection);
          lastDirection.current = newDirection;
        }
        lastScrollY.current = scrollY;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, threshold]);

  return direction;
}

// ---------------------------------------------------------------------------
// useStaggerAnimation -- stagger animations for list items
// ---------------------------------------------------------------------------

export interface StaggerAnimationOptions {
  itemCount: number;
  baseDelay?: number;
  staggerDelay?: number;
  duration?: number;
  direction?: 'forward' | 'reverse' | 'center';
}

export function useStaggerAnimation(options: StaggerAnimationOptions) {
  const {
    itemCount,
    baseDelay = 0,
    staggerDelay = 50,
    duration = 300,
    direction = 'forward',
  } = options;

  const reducedMotion = useReducedMotion();
  const [triggered, setTriggered] = useState(false);

  const trigger = useCallback(() => {
    setTriggered(true);
  }, []);

  const reset = useCallback(() => {
    setTriggered(false);
  }, []);

  const getDelay = useCallback((index: number): number => {
    if (reducedMotion) return 0;
    
    switch (direction) {
      case 'reverse':
        return baseDelay + (itemCount - 1 - index) * staggerDelay;
      case 'center': {
        const center = (itemCount - 1) / 2;
        const distance = Math.abs(index - center);
        return baseDelay + distance * staggerDelay;
      }
      default:
        return baseDelay + index * staggerDelay;
    }
  }, [baseDelay, staggerDelay, itemCount, direction, reducedMotion]);

  const getItemStyle = useCallback((index: number): React.CSSProperties => {
    if (reducedMotion) {
      return { opacity: triggered ? 1 : 0 };
    }

    const delay = getDelay(index);
    
    return {
      opacity: triggered ? 1 : 0,
      transform: triggered ? 'translateY(0)' : 'translateY(20px)',
      transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
    };
  }, [triggered, getDelay, duration, reducedMotion]);

  return { trigger, reset, getItemStyle, getDelay, triggered };
}

// ---------------------------------------------------------------------------
// useParallax -- parallax scroll effect
// ---------------------------------------------------------------------------

export interface ParallaxOptions {
  speed?: number;
  direction?: 'vertical' | 'horizontal';
  easing?: 'linear' | 'ease-out';
}

export function useParallax(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ParallaxOptions = {}
) {
  const { speed = 0.5, direction = 'vertical', easing = 'linear' } = options;
  const [offset, setOffset] = useState(0);
  const reducedMotion = useReducedMotion();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) return;

    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        const scrollY = container.scrollTop;
        let newOffset = scrollY * speed;
        
        if (easing === 'ease-out') {
          newOffset = Math.sqrt(scrollY) * speed * 10;
        }
        
        setOffset(newOffset);
        rafRef.current = null;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, speed, easing, reducedMotion]);

  const style: React.CSSProperties = {
    transform: direction === 'vertical'
      ? `translateY(${offset}px)`
      : `translateX(${offset}px)`,
    willChange: 'transform',
  };

  return { offset, style };
}

// ---------------------------------------------------------------------------
// useDragReorder -- drag to reorder list items
// ---------------------------------------------------------------------------

export interface DragReorderOptions<T> {
  items: T[];
  onReorder: (items: T[]) => void;
  axis?: 'x' | 'y';
  lockAxis?: boolean;
}

export function useDragReorder<T extends { id: string | number }>(
  options: DragReorderOptions<T>
) {
  const { items, onReorder, axis = 'y', lockAxis = true } = options;
  
  const [draggingId, setDraggingId] = useState<string | number | null>(null);
  const [dragOverId, setDragOverId] = useState<string | number | null>(null);
  const dragStartIndex = useRef<number>(-1);
  const dragElement = useRef<HTMLElement | null>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback((e: React.DragEvent, itemId: string | number, index: number) => {
    setDraggingId(itemId);
    dragStartIndex.current = index;
    dragElement.current = e.currentTarget as HTMLElement;
    startPos.current = { x: e.clientX, y: e.clientY };
    
    // Set drag image
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(itemId));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, itemId: string | number) => {
    e.preventDefault();
    if (draggingId === itemId) return;
    setDragOverId(itemId);
  }, [draggingId]);

  const handleDragEnd = useCallback(() => {
    if (draggingId !== null && dragOverId !== null && draggingId !== dragOverId) {
      const dragIndex = items.findIndex(item => item.id === draggingId);
      const dropIndex = items.findIndex(item => item.id === dragOverId);

      if (dragIndex !== -1 && dropIndex !== -1) {
        const newItems = [...items];
        const [removed] = newItems.splice(dragIndex, 1);
        newItems.splice(dropIndex, 0, removed);
        onReorder(newItems);
      }
    }

    setDraggingId(null);
    setDragOverId(null);
    dragStartIndex.current = -1;
  }, [draggingId, dragOverId, items, onReorder]);

  const getDragHandleProps = useCallback((itemId: string | number, index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, itemId, index),
    onDragOver: (e: React.DragEvent) => handleDragOver(e, itemId),
    onDragEnd: handleDragEnd,
    onDragLeave: () => setDragOverId(null),
    style: {
      cursor: 'grab',
      opacity: draggingId === itemId ? 0.5 : 1,
      transition: 'opacity 0.15s ease',
    } as React.CSSProperties,
  }), [handleDragStart, handleDragOver, handleDragEnd, draggingId]);

  const getDropIndicatorStyle = useCallback((itemId: string | number): React.CSSProperties => {
    if (dragOverId !== itemId) return {};
    
    return {
      boxShadow: axis === 'y' 
        ? '0 -2px 0 0 var(--color-accent)' 
        : '-2px 0 0 0 var(--color-accent)',
    };
  }, [dragOverId, axis]);

  return {
    draggingId,
    dragOverId,
    getDragHandleProps,
    getDropIndicatorStyle,
    isDragging: draggingId !== null,
  };
}

// ---------------------------------------------------------------------------
// useHover -- track hover state with delay
// ---------------------------------------------------------------------------

export interface HoverOptions {
  enterDelay?: number;
  leaveDelay?: number;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

export function useHover(options: HoverOptions = {}) {
  const { enterDelay = 0, leaveDelay = 0, onHoverStart, onHoverEnd } = options;
  
  const [isHovered, setIsHovered] = useState(false);
  const enterTimeout = useRef<number | null>(null);
  const leaveTimeout = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimeout.current) {
      clearTimeout(leaveTimeout.current);
      leaveTimeout.current = null;
    }

    if (enterDelay > 0) {
      enterTimeout.current = window.setTimeout(() => {
        setIsHovered(true);
        onHoverStart?.();
      }, enterDelay);
    } else {
      setIsHovered(true);
      onHoverStart?.();
    }
  }, [enterDelay, onHoverStart]);

  const handleMouseLeave = useCallback(() => {
    if (enterTimeout.current) {
      clearTimeout(enterTimeout.current);
      enterTimeout.current = null;
    }

    if (leaveDelay > 0) {
      leaveTimeout.current = window.setTimeout(() => {
        setIsHovered(false);
        onHoverEnd?.();
      }, leaveDelay);
    } else {
      setIsHovered(false);
      onHoverEnd?.();
    }
  }, [leaveDelay, onHoverEnd]);

  useEffect(() => {
    return () => {
      if (enterTimeout.current) clearTimeout(enterTimeout.current);
      if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
    };
  }, []);

  return {
    isHovered,
    hoverProps: {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    },
  };
}

// ---------------------------------------------------------------------------
// useLongPress -- detect long press gesture
// ---------------------------------------------------------------------------

export interface LongPressOptions {
  threshold?: number;
  onLongPress: () => void;
  onPress?: () => void;
  onPressStart?: () => void;
  onPressEnd?: () => void;
}

export function useLongPress(options: LongPressOptions) {
  const {
    threshold = 500,
    onLongPress,
    onPress,
    onPressStart,
    onPressEnd,
  } = options;

  const pressTimer = useRef<number | null>(null);
  const isLongPress = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const start = useCallback((e: React.PointerEvent) => {
    isLongPress.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    onPressStart?.();

    pressTimer.current = window.setTimeout(() => {
      isLongPress.current = true;
      onLongPress();
    }, threshold);
  }, [threshold, onLongPress, onPressStart]);

  const move = useCallback((e: React.PointerEvent) => {
    const distance = Math.sqrt(
      Math.pow(e.clientX - startPos.current.x, 2) +
      Math.pow(e.clientY - startPos.current.y, 2)
    );
    
    // Cancel if moved too far
    if (distance > 10 && pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const end = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }

    if (!isLongPress.current) {
      onPress?.();
    }

    onPressEnd?.();
  }, [onPress, onPressEnd]);

  const cancel = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    onPressEnd?.();
  }, [onPressEnd]);

  useEffect(() => {
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    };
  }, []);

  return {
    onPointerDown: start,
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };
}

// ---------------------------------------------------------------------------
// useSwipe -- detect swipe gestures
// ---------------------------------------------------------------------------

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeOptions {
  threshold?: number;
  onSwipe?: (direction: SwipeDirection) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export function useSwipe(options: SwipeOptions = {}) {
  const {
    threshold = 50,
    onSwipe,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
  } = options;

  const startPos = useRef({ x: 0, y: 0 });
  const startTime = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startPos.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    startTime.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const endPos = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
    };
    
    const deltaX = endPos.x - startPos.current.x;
    const deltaY = endPos.y - startPos.current.y;
    const deltaTime = Date.now() - startTime.current;

    // Only register swipe if it was quick enough
    if (deltaTime > 500) return;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > threshold || absY > threshold) {
      let direction: SwipeDirection;
      
      if (absX > absY) {
        direction = deltaX > 0 ? 'right' : 'left';
        if (direction === 'left') onSwipeLeft?.();
        if (direction === 'right') onSwipeRight?.();
      } else {
        direction = deltaY > 0 ? 'down' : 'up';
        if (direction === 'up') onSwipeUp?.();
        if (direction === 'down') onSwipeDown?.();
      }

      onSwipe?.(direction);
    }
  }, [threshold, onSwipe, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}

// ---------------------------------------------------------------------------
// useClickOutside -- detect clicks outside an element
// ---------------------------------------------------------------------------

export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  callback: () => void,
  options: { enabled?: boolean; ignoreRefs?: React.RefObject<HTMLElement | null>[] } = {}
) {
  const { enabled = true, ignoreRefs = [] } = options;
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      for (const ignoreRef of ignoreRefs) {
        if (ignoreRef.current?.contains(target)) return;
      }
      callbackRef.current();
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [ref, enabled, ignoreRefs]);
}

// ---------------------------------------------------------------------------
// useMediaQuery -- respond to media queries
// ---------------------------------------------------------------------------

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

// ---------------------------------------------------------------------------
// useDebounce -- debounce a value
// ---------------------------------------------------------------------------

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}

// ---------------------------------------------------------------------------
// useThrottle -- throttle a callback
// ---------------------------------------------------------------------------

export function useThrottle<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const lastCall = useRef(0);
  const timeoutRef = useRef<number | null>(null);

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = delay - (now - lastCall.current);

    if (remaining <= 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      lastCall.current = now;
      callback(...args);
    } else if (!timeoutRef.current) {
      timeoutRef.current = window.setTimeout(() => {
        lastCall.current = Date.now();
        timeoutRef.current = null;
        callback(...args);
      }, remaining);
    }
  }, [callback, delay]) as T;
}

// ---------------------------------------------------------------------------
// useWindowSize -- track window dimensions
// ---------------------------------------------------------------------------

export function useWindowSize() {
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}

// ---------------------------------------------------------------------------
// usePrevious -- track previous value
// ---------------------------------------------------------------------------

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

// ---------------------------------------------------------------------------
// useLocalStorage -- sync state with localStorage
// ---------------------------------------------------------------------------

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const newValue = value instanceof Function ? value(prev) : value;
      try {
        localStorage.setItem(key, JSON.stringify(newValue));
      } catch {
        console.error('Failed to save to localStorage:', key);
      }
      return newValue;
    });
  }, [key]);

  return [storedValue, setValue];
}

// ---------------------------------------------------------------------------
// useScrollController -- configurable scroll deceleration and momentum
// ---------------------------------------------------------------------------

export type ScrollCurve = 'linear' | 'easeOut' | 'friction' | 'bounce';

export interface ScrollControllerOptions {
  curve?: ScrollCurve;
  friction?: number;  // 0.85-0.98, higher = less friction
  bounceStiffness?: number;
  bounceDamping?: number;
  snapToPoints?: number[];
  snapThreshold?: number;
}

export function useScrollController(
  ref: React.RefObject<HTMLElement | null>,
  options: ScrollControllerOptions = {}
) {
  const {
    curve = 'easeOut',
    friction = 0.92,
    bounceStiffness = 400,
    bounceDamping = 30,
    snapToPoints,
    snapThreshold = 50,
  } = options;

  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastScrollRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isScrollingRef = useRef(false);

  const decelerate = useCallback((startVelocity: number) => {
    const el = ref.current;
    if (!el) return;

    velocityRef.current = startVelocity;
    isScrollingRef.current = true;

    const tick = () => {
      const v = velocityRef.current;
      if (Math.abs(v) < 0.5) {
        isScrollingRef.current = false;
        // Snap to nearest point if configured
        if (snapToPoints?.length) {
          const current = el.scrollTop;
          let nearest = snapToPoints[0];
          let minDist = Math.abs(current - nearest);
          for (const pt of snapToPoints) {
            const dist = Math.abs(current - pt);
            if (dist < minDist) { minDist = dist; nearest = pt; }
          }
          if (minDist < snapThreshold) {
            el.scrollTo({ top: nearest, behavior: 'smooth' });
          }
        }
        return;
      }

      // Apply curve
      let newV = v;
      switch (curve) {
        case 'linear': newV = v * 0.99; break;
        case 'easeOut': newV = v * friction; break;
        case 'friction': newV = v * Math.pow(friction, 1.5); break;
        case 'bounce':
          newV = v * friction;
          if (el.scrollTop <= 0 || el.scrollTop >= el.scrollHeight - el.clientHeight) {
            newV = -v * 0.3;
          }
          break;
      }

      el.scrollTop += newV;
      velocityRef.current = newV;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [curve, friction, snapToPoints, snapThreshold, ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      lastScrollRef.current = e.deltaY;
      lastTimeRef.current = performance.now();
    };

    const onScrollEnd = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const velocity = lastScrollRef.current * 0.1;
      if (Math.abs(velocity) > 1) {
        decelerate(velocity);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('scrollend', onScrollEnd);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scrollend', onScrollEnd);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [decelerate, ref]);

  return {
    isScrolling: isScrollingRef.current,
    scrollTo: (y: number, smooth = true) => {
      ref.current?.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
    },
    scrollToTop: () => ref.current?.scrollTo({ top: 0, behavior: 'smooth' }),
    scrollToBottom: () => {
      const el = ref.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    },
  };
}

// ---------------------------------------------------------------------------
// usePointerLock -- pointer lock for canvas apps
// ---------------------------------------------------------------------------

export interface PointerLockResult {
  isLocked: boolean;
  movement: { x: number; y: number };
  requestLock: () => void;
  exitLock: () => void;
}

export function usePointerLock(ref: React.RefObject<HTMLElement | null>): PointerLockResult {
  const [isLocked, setIsLocked] = useState(false);
  const [movement, setMovement] = useState({ x: 0, y: 0 });

  const requestLock = useCallback(() => {
    ref.current?.requestPointerLock();
  }, [ref]);

  const exitLock = useCallback(() => {
    document.exitPointerLock();
  }, []);

  useEffect(() => {
    const onLockChange = () => {
      setIsLocked(document.pointerLockElement === ref.current);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === ref.current) {
        setMovement({ x: e.movementX, y: e.movementY });
      }
    };

    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseMove);

    return () => {
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, [ref]);

  return { isLocked, movement, requestLock, exitLock };
}

// ---------------------------------------------------------------------------
// useMiddleClickScroll -- middle-click auto-scroll
// ---------------------------------------------------------------------------

export function useMiddleClickScroll(ref: React.RefObject<HTMLElement | null>) {
  const [isActive, setIsActive] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        setIsActive(true);
        setOrigin({ x: e.clientX, y: e.clientY });
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        setIsActive(false);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isActive) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      const speed = Math.sqrt(dx * dx + dy * dy) * 0.1;
      
      const scroll = () => {
        el.scrollTop += dy * speed * 0.02;
        el.scrollLeft += dx * speed * 0.02;
        if (isActive) rafRef.current = requestAnimationFrame(scroll);
      };
      
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(scroll);
    };

    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, origin, ref]);

  return { isActive, origin };
}

// ---------------------------------------------------------------------------
// useScrollSnap -- scroll snapping functionality
// ---------------------------------------------------------------------------

export interface ScrollSnapOptions {
  axis?: 'x' | 'y' | 'both';
  mandatory?: boolean;
  proximity?: number;
}

export function useScrollSnap(
  ref: React.RefObject<HTMLElement | null>,
  options: ScrollSnapOptions = {}
) {
  const { axis = 'y', mandatory = false, proximity = 100 } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.scrollSnapType = mandatory
      ? `${axis} mandatory`
      : `${axis} proximity`;
    el.style.scrollBehavior = 'smooth';

    // Set snap points on children
    const children = el.children;
    for (let i = 0; i < children.length; i++) {
      (children[i] as HTMLElement).style.scrollSnapAlign = 'start';
    }

    return () => {
      el.style.scrollSnapType = '';
      el.style.scrollBehavior = '';
    };
  }, [axis, mandatory, proximity, ref]);
}

// ---------------------------------------------------------------------------
// usePressure -- stylus/pen pressure sensitivity
// ---------------------------------------------------------------------------

export interface PressureState {
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  pointerType: 'pen' | 'touch' | 'mouse';
}

export function usePressure(): [PressureState, (e: React.PointerEvent) => void] {
  const [state, setState] = useState<PressureState>({
    pressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    pointerType: 'mouse',
  });

  const handlePointer = useCallback((e: React.PointerEvent) => {
    setState({
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      pointerType: e.pointerType as 'pen' | 'touch' | 'mouse',
    });
  }, []);

  return [state, handlePointer];
}

// ---------------------------------------------------------------------------
// useCanvasZoom -- pinch-to-zoom with anchor point for canvas
// ---------------------------------------------------------------------------

export interface CanvasZoomOptions {
  minScale?: number;
  maxScale?: number;
  wheelSensitivity?: number;
}

export interface CanvasZoomState {
  scale: number;
  offset: { x: number; y: number };
}

export function useCanvasZoom(
  ref: React.RefObject<HTMLElement | null>,
  options: CanvasZoomOptions = {}
) {
  const { minScale = 0.1, maxScale = 10, wheelSensitivity = 0.001 } = options;
  const [state, setState] = useState<CanvasZoomState>({ scale: 1, offset: { x: 0, y: 0 } });
  const lastPinchDistRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        setState(prev => {
          const delta = -e.deltaY * wheelSensitivity;
          const newScale = Math.max(minScale, Math.min(maxScale, prev.scale * (1 + delta)));
          const scaleDiff = newScale / prev.scale;
          
          return {
            scale: newScale,
            offset: {
              x: x - (x - prev.offset.x) * scaleDiff,
              y: y - (y - prev.offset.y) * scaleDiff,
            },
          };
        });
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const delta = (dist - lastPinchDistRef.current) * 0.01;
        lastPinchDistRef.current = dist;

        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = el.getBoundingClientRect();
        const x = cx - rect.left;
        const y = cy - rect.top;

        setState(prev => {
          const newScale = Math.max(minScale, Math.min(maxScale, prev.scale * (1 + delta)));
          const scaleDiff = newScale / prev.scale;
          return {
            scale: newScale,
            offset: {
              x: x - (x - prev.offset.x) * scaleDiff,
              y: y - (y - prev.offset.y) * scaleDiff,
            },
          };
        });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [minScale, maxScale, wheelSensitivity, ref]);

  const reset = useCallback(() => {
    setState({ scale: 1, offset: { x: 0, y: 0 } });
  }, []);

  const setScale = useCallback((scale: number) => {
    setState(prev => ({ ...prev, scale: Math.max(minScale, Math.min(maxScale, scale)) }));
  }, [minScale, maxScale]);

  return { ...state, reset, setScale };
}

// ---------------------------------------------------------------------------
// useKeyboardShortcuts -- global keyboard shortcuts manager
// ---------------------------------------------------------------------------

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  description?: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = !shortcut.ctrl || e.ctrlKey;
        const shiftMatch = !shortcut.shift || e.shiftKey;
        const altMatch = !shortcut.alt || e.altKey;
        const metaMatch = !shortcut.meta || e.metaKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
          if (shortcut.ctrl || shortcut.shift || shortcut.alt || shortcut.meta) {
            e.preventDefault();
          }
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts, enabled]);
}

// ---------------------------------------------------------------------------
// useUndoRedo -- undo/redo state management
// ---------------------------------------------------------------------------

export interface UndoRedoOptions<T> {
  maxHistory?: number;
}

export function useUndoRedo<T>(
  initialState: T,
  options: UndoRedoOptions<T> = {}
) {
  const { maxHistory = 50 } = options;
  const [state, setState] = useState(initialState);
  const historyRef = useRef<T[]>([initialState]);
  const indexRef = useRef(0);

  const push = useCallback((newState: T) => {
    // Remove any future states if we're not at the end
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
    historyRef.current.push(newState);
    
    // Limit history size
    if (historyRef.current.length > maxHistory) {
      historyRef.current.shift();
    } else {
      indexRef.current++;
    }
    
    setState(newState);
  }, [maxHistory]);

  const undo = useCallback(() => {
    if (indexRef.current > 0) {
      indexRef.current--;
      setState(historyRef.current[indexRef.current]);
    }
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current++;
      setState(historyRef.current[indexRef.current]);
    }
  }, []);

  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < historyRef.current.length - 1;

  return { state, push, undo, redo, canUndo, canRedo };
}

// ---------------------------------------------------------------------------
// useColorPipette -- eyedropper/color picker tool
// ---------------------------------------------------------------------------

export function useColorPipette(): {
  pickColor: () => Promise<string | null>;
  isSupported: boolean;
} {
  const isSupported = 'EyeDropper' in window;

  const pickColor = useCallback(async (): Promise<string | null> => {
    if (!isSupported) return null;
    try {
      // @ts-expect-error EyeDropper API
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      return result.sRGBHex;
    } catch {
      return null;
    }
  }, [isSupported]);

  return { pickColor, isSupported };
}

// ---------------------------------------------------------------------------
// useAnimationLoop -- requestAnimationFrame loop with delta time
// ---------------------------------------------------------------------------

export function useAnimationLoop(
  callback: (deltaTime: number, elapsed: number) => void,
  active = true
) {
  const callbackRef = useRef(callback);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    startTimeRef.current = performance.now();
    lastTimeRef.current = startTimeRef.current;

    const tick = (now: number) => {
      const deltaTime = now - lastTimeRef.current;
      const elapsed = now - startTimeRef.current;
      lastTimeRef.current = now;
      callbackRef.current(deltaTime, elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);
}

// ---------------------------------------------------------------------------
// useGesture -- unified gesture detection
// ---------------------------------------------------------------------------

export interface GestureState {
  type: 'none' | 'pan' | 'pinch' | 'rotate' | 'swipe';
  delta: { x: number; y: number };
  scale: number;
  rotation: number;
  velocity: { x: number; y: number };
  direction: 'up' | 'down' | 'left' | 'right' | null;
}

export function useGesture(ref: React.RefObject<HTMLElement | null>) {
  const [gesture, setGesture] = useState<GestureState>({
    type: 'none',
    delta: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    velocity: { x: 0, y: 0 },
    direction: null,
  });

  const startRef = useRef({ x: 0, y: 0, time: 0 });
  const lastRef = useRef({ x: 0, y: 0, time: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      startRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      lastRef.current = { ...startRef.current };
      setGesture(prev => ({ ...prev, type: 'pan' }));
    };

    const onPointerMove = (e: PointerEvent) => {
      if (gesture.type === 'none') return;
      
      const now = Date.now();
      const dt = Math.max(1, now - lastRef.current.time);
      const dx = e.clientX - lastRef.current.x;
      const dy = e.clientY - lastRef.current.y;
      
      setGesture(prev => ({
        ...prev,
        delta: { x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y },
        velocity: { x: dx / dt * 1000, y: dy / dt * 1000 },
      }));
      
      lastRef.current = { x: e.clientX, y: e.clientY, time: now };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      const dt = Date.now() - startRef.current.time;
      const speed = Math.sqrt(dx * dx + dy * dy) / dt * 1000;
      
      let direction: 'up' | 'down' | 'left' | 'right' | null = null;
      if (speed > 200) {
        if (Math.abs(dx) > Math.abs(dy)) {
          direction = dx > 0 ? 'right' : 'left';
        } else {
          direction = dy > 0 ? 'down' : 'up';
        }
      }
      
      setGesture(prev => ({
        ...prev,
        type: speed > 200 ? 'swipe' : 'none',
        direction,
      }));

      setTimeout(() => {
        setGesture({
          type: 'none',
          delta: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          velocity: { x: 0, y: 0 },
          direction: null,
        });
      }, 100);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, [gesture.type, ref]);

  return gesture;
}

// Extended hooks library: see motionHooksExtended.ts
