// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ScrollEnhancements - Scroll indicators, fade gradients, momentum
 * 
 * Features:
 * - Scroll fade gradients (top/bottom)
 * - Scrollbar visibility on scroll start
 * - iOS-style momentum scrolling
 * - Sticky header on scroll behavior
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors } from '../styles/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrollContainerProps {
  /** Children content */
  children: React.ReactNode;
  /** Show fade gradients at top/bottom */
  showFadeGradients?: boolean;
  /** Height of fade gradient */
  fadeHeight?: number;
  /** Solid color the fade blends FROM (should match the container's own
   *  background, else the fade looks wrong over a differently-coloured panel).
   *  Defaults to the app base background. Accepts any CSS color / var(). */
  fadeColor?: string;
  /** Custom class name */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
  /** Callback when scroll position changes */
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  /** Show scrollbar immediately on scroll (not just hover) */
  showScrollbarOnScroll?: boolean;
  /** Scrollbar auto-hide delay in ms */
  scrollbarHideDelay?: number;
  /** Max height before scroll */
  maxHeight?: number | string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ScrollContainer: React.FC<ScrollContainerProps> = ({
  children,
  showFadeGradients = true,
  fadeHeight = 16,
  fadeColor = colors.bg.base,
  className = '',
  style = {},
  onScroll,
  showScrollbarOnScroll = true,
  scrollbarHideDelay = 1500,
  maxHeight = '100%',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    
    // Update fade gradient visibility
    setShowTopFade(scrollTop > 8);
    setShowBottomFade(scrollTop < scrollHeight - clientHeight - 8);

    // Show scrollbar
    if (showScrollbarOnScroll) {
      setIsScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, scrollbarHideDelay);
    }

    onScroll?.(scrollTop, scrollHeight, clientHeight);
  }, [onScroll, showScrollbarOnScroll, scrollbarHideDelay]);

  // Initial check for bottom fade
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    
    const { scrollHeight, clientHeight } = el;
    setShowBottomFade(scrollHeight > clientHeight);
  }, [children]);

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`dex-scroll-container ${className}`}
      style={{
        position: 'relative',
        maxHeight,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Scrollable content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={isScrolling ? 'scrolling' : ''}
        style={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>

      {/* Top fade gradient */}
      {showFadeGradients && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: fadeHeight,
            background: `linear-gradient(to bottom, ${fadeColor} 0%, transparent 100%)`,
            pointerEvents: 'none',
            opacity: showTopFade ? 1 : 0,
            transition: 'opacity 0.15s ease',
            zIndex: 1,
          }}
        />
      )}

      {/* Bottom fade gradient */}
      {showFadeGradients && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: fadeHeight,
            background: `linear-gradient(to top, ${fadeColor} 0%, transparent 100%)`,
            pointerEvents: 'none',
            opacity: showBottomFade ? 1 : 0,
            transition: 'opacity 0.15s ease',
            zIndex: 1,
          }}
        />
      )}

      <style>{`
        .dex-scroll-container > div::-webkit-scrollbar {
          width: 6px;
          background: transparent;
        }
        .dex-scroll-container > div::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 2px;
          transition: background 0.15s ease;
        }
        .dex-scroll-container > div:hover::-webkit-scrollbar-thumb,
        .dex-scroll-container > div.scrolling::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.18);
        }
        .dex-scroll-container > div::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      `}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sticky Header Hook
// ---------------------------------------------------------------------------

export interface StickyHeaderConfig {
  /** Height of the header */
  headerHeight: number;
  /** Scroll threshold before header hides */
  hideThreshold?: number;
  /** Scroll threshold before header shows again */
  showThreshold?: number;
}

export interface StickyHeaderState {
  /** Whether header should be visible */
  isVisible: boolean;
  /** Whether header is stuck (scrolled past) */
  isStuck: boolean;
  /** Current scroll direction */
  scrollDirection: 'up' | 'down' | null;
  /** Current scroll position */
  scrollTop: number;
}

export function useStickyHeader(config: StickyHeaderConfig): {
  state: StickyHeaderState;
  handleScroll: (e: React.UIEvent<HTMLElement>) => void;
  containerRef: React.RefObject<HTMLDivElement>;
} {
  const { headerHeight, hideThreshold = 50, showThreshold = 20 } = config;
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const scrollAccumulator = useRef(0);

  const [state, setState] = useState<StickyHeaderState>({
    isVisible: true,
    isStuck: false,
    scrollDirection: null,
    scrollTop: 0,
  });

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const target = e.currentTarget;
    const currentScrollTop = target.scrollTop;
    const delta = currentScrollTop - lastScrollTop.current;
    
    // Determine scroll direction
    const direction = delta > 0 ? 'down' : delta < 0 ? 'up' : null;
    
    // Accumulate scroll in current direction
    if (direction === state.scrollDirection) {
      scrollAccumulator.current += Math.abs(delta);
    } else {
      scrollAccumulator.current = Math.abs(delta);
    }

    // Determine if header should be visible
    let isVisible = state.isVisible;
    
    if (currentScrollTop <= headerHeight) {
      // Always show header near top
      isVisible = true;
    } else if (direction === 'down' && scrollAccumulator.current > hideThreshold) {
      // Hide when scrolling down past threshold
      isVisible = false;
    } else if (direction === 'up' && scrollAccumulator.current > showThreshold) {
      // Show when scrolling up past threshold
      isVisible = true;
    }

    setState({
      isVisible,
      isStuck: currentScrollTop > headerHeight,
      scrollDirection: direction,
      scrollTop: currentScrollTop,
    });

    lastScrollTop.current = currentScrollTop;
  }, [headerHeight, hideThreshold, showThreshold, state.scrollDirection, state.isVisible]);

  return { state, handleScroll, containerRef };
}

// ---------------------------------------------------------------------------
// Momentum Scroll Container
// ---------------------------------------------------------------------------

export interface MomentumScrollProps {
  children: React.ReactNode;
  /** Enable rubber band overscroll effect */
  rubberBand?: boolean;
  /** Friction coefficient (0-1, lower = more momentum) */
  friction?: number;
  /** Maximum overscroll distance */
  maxOverscroll?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const MomentumScroll: React.FC<MomentumScrollProps> = ({
  children,
  rubberBand = true,
  friction = 0.95,
  maxOverscroll = 100,
  className = '',
  style = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overscroll, setOverscroll] = useState(0);
  const lastY = useRef(0);
  const animationId = useRef<number>();

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (animationId.current) {
      cancelAnimationFrame(animationId.current);
    }
    lastY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (!el) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - lastY.current;
    lastY.current = currentY;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const atTop = scrollTop <= 0;
    const atBottom = scrollTop >= scrollHeight - clientHeight;

    if (rubberBand && ((atTop && deltaY > 0) || (atBottom && deltaY < 0))) {
      e.preventDefault();
      const resistance = 0.4;
      const newOverscroll = Math.max(-maxOverscroll, Math.min(maxOverscroll, overscroll + deltaY * resistance));
      setOverscroll(newOverscroll);
    }
  }, [rubberBand, maxOverscroll, overscroll]);

  const handleTouchEnd = useCallback(() => {
    // Animate overscroll back to 0
    if (overscroll !== 0) {
      const animate = () => {
        setOverscroll(prev => {
          const next = prev * 0.85;
          if (Math.abs(next) < 0.5) return 0;
          animationId.current = requestAnimationFrame(animate);
          return next;
        });
      };
      animationId.current = requestAnimationFrame(animate);
    }
  }, [overscroll]);

  useEffect(() => {
    return () => {
      if (animationId.current) {
        cancelAnimationFrame(animationId.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`dex-momentum-scroll ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        overflow: 'auto',
        overscrollBehavior: rubberBand ? 'none' : 'contain',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
    >
      <div
        ref={contentRef}
        style={{
          transform: `translateY(${overscroll}px)`,
          transition: overscroll === 0 ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ScrollContainer;
