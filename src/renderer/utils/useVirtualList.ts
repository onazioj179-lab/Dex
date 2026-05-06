// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX — Lightweight Virtual List Hook
 * ===========================================================================
 * Renders only visible items in long lists. Zero dependencies.
 * Handles fixed-height rows with configurable overscan.
 *
 * Usage:
 *   const { containerRef, virtualItems, totalHeight, containerStyle } =
 *     useVirtualList({ itemCount: 10000, itemHeight: 48, overscan: 5 });
 *
 *   return (
 *     <div ref={containerRef} style={containerStyle}>
 *       <div style={{ height: totalHeight, position: 'relative' }}>
 *         {virtualItems.map(v => (
 *           <div key={v.index} style={v.style}>Row {v.index}</div>
 *         ))}
 *       </div>
 *     </div>
 *   );
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';

export interface VirtualItem {
  index: number;
  offsetTop: number;
  style: React.CSSProperties;
}

interface UseVirtualListOptions {
  /** Total number of items */
  itemCount: number;
  /** Height in px of each row (fixed) */
  itemHeight: number;
  /** Extra rows rendered above/below viewport (default: 3) */
  overscan?: number;
}

interface UseVirtualListResult {
  containerRef: React.RefObject<HTMLDivElement>;
  virtualItems: VirtualItem[];
  totalHeight: number;
  containerStyle: React.CSSProperties;
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
}

export function useVirtualList({
  itemCount,
  itemHeight,
  overscan = 3,
}: UseVirtualListOptions): UseVirtualListResult {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rafRef = useRef(0);

  const totalHeight = itemCount * itemHeight;

  // Throttled scroll handler using rAF
  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = containerRef.current;
      if (el) setScrollTop(el.scrollTop);
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Measure initial viewport
    setViewportHeight(el.clientHeight);
    setScrollTop(el.scrollTop);

    // Observe resize
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [onScroll]);

  const virtualItems = useMemo<VirtualItem[]>(() => {
    if (itemCount === 0 || viewportHeight === 0) return [];

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      itemCount - 1,
      Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
    );

    const items: VirtualItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const offsetTop = i * itemHeight;
      items.push({
        index: i,
        offsetTop,
        style: {
          position: 'absolute',
          top: offsetTop,
          left: 0,
          width: '100%',
          height: itemHeight,
        },
      });
    }
    return items;
  }, [itemCount, itemHeight, overscan, scrollTop, viewportHeight]);

  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'end' = 'start') => {
      const el = containerRef.current;
      if (!el) return;
      let top = index * itemHeight;
      if (align === 'center') top -= (el.clientHeight - itemHeight) / 2;
      else if (align === 'end') top -= el.clientHeight - itemHeight;
      el.scrollTop = Math.max(0, Math.min(top, totalHeight - el.clientHeight));
    },
    [itemHeight, totalHeight],
  );

  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      overflow: 'auto',
      position: 'relative' as const,
      contain: 'strict',
      overscrollBehavior: 'contain',
    }),
    [],
  );

  return { containerRef, virtualItems, totalHeight, containerStyle, scrollToIndex };
}

export default useVirtualList;
