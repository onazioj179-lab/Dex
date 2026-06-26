// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VirtualList -- one shared fixed-row windowing primitive.
 *
 * Long lists (Files, Tasks, Live Activity history, Rewind tapes) each hand-rolled
 * full `.map()` rendering, which mounts thousands of nodes. This renders only the
 * rows in (or near) the viewport over a single full-height spacer, so a 10k-row
 * list keeps ~viewport+overscan nodes. Dependency-free; fixed row height.
 *
 *   <VirtualList items={rows} rowHeight={44} renderRow={(r) => <Row r={r} />} />
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface VirtualWindow {
  start: number;
  end: number;        // exclusive
  offsetY: number;    // translateY for the rendered slice
  totalHeight: number;
}

/** Pure window math -- which rows are visible for a given scroll position. */
export function computeWindow(
  scrollTop: number,
  viewportH: number,
  rowHeight: number,
  count: number,
  overscan: number,
): VirtualWindow {
  const totalHeight = count * rowHeight;
  if (count === 0 || rowHeight <= 0 || viewportH <= 0) {
    return { start: 0, end: 0, offsetY: 0, totalHeight };
  }
  const first = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportH / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visibleCount + overscan);
  return { start, end, offsetY: start * rowHeight, totalHeight };
}

export interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Extra rows rendered above/below the viewport to mask fast scrolls. */
  overscan?: number;
  getKey?: (item: T, index: number) => React.Key;
  className?: string;
  style?: React.CSSProperties;
  /** Optional fixed height; otherwise the list fills its parent (100%). */
  height?: number | string;
  ariaLabel?: string;
}

export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  overscan = 6,
  getKey,
  className,
  style,
  height = '100%',
  ariaLabel,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Measure the viewport and keep it current on resize.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (rafRef.current != null) return; // coalesce to one update per frame
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(el.scrollTop);
    });
  }, []);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const win = computeWindow(scrollTop, viewportH, rowHeight, items.length, overscan);
  const slice = items.slice(win.start, win.end);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={className}
      role="list"
      aria-label={ariaLabel}
      style={{ overflowY: 'auto', overflowX: 'hidden', position: 'relative', height, ...style }}
    >
      <div style={{ height: win.totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${win.offsetY}px)` }}>
          {slice.map((item, i) => {
            const index = win.start + i;
            return (
              <div key={getKey ? getKey(item, index) : index} role="listitem" style={{ height: rowHeight }}>
                {renderRow(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default VirtualList;
