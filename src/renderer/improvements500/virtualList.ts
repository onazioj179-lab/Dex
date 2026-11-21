// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Windowed virtualization (T6-001..T6-006).
 *
 * Pure math + a React hook. Computes which slice of a fixed-row-height list
 * is visible given scrollTop, viewport height, and a bufferRows pad.
 */

import { useEffect, useState, useCallback } from 'react';

export interface VirtualSlice {
  start: number;
  end: number;
  /** Top padding pixels to push the visible items into place. */
  padTop: number;
  /** Bottom padding pixels to keep the scroll height correct. */
  padBottom: number;
  totalHeight: number;
}

export function computeSlice(
  itemCount: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  bufferRows = 4,
): VirtualSlice {
  if (itemCount <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, padTop: 0, padBottom: 0, totalHeight: 0 };
  }
  const totalHeight = itemCount * rowHeight;
  const clampedScroll = Math.max(0, Math.min(scrollTop, totalHeight - Math.max(rowHeight, viewportHeight)));
  const firstVisible = Math.max(0, Math.floor(clampedScroll / rowHeight) - bufferRows);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + bufferRows * 2;
  const end = Math.min(itemCount, firstVisible + visibleCount);
  return {
    start: firstVisible,
    end,
    padTop: firstVisible * rowHeight,
    padBottom: (itemCount - end) * rowHeight,
    totalHeight,
  };
}

export interface UseVirtualListOptions {
  itemCount: number;
  rowHeight: number;
  /** Default 4 row pad above and below. */
  bufferRows?: number;
}

export function useVirtualList(opts: UseVirtualListOptions): {
  ref: React.RefCallback<HTMLDivElement>;
  slice: VirtualSlice;
  onScroll: () => void;
} {
  const [element, ref] = useState<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const onScroll = useCallback(() => {
    if (element) setScrollTop(element.scrollTop);
  }, [element]);

  useEffect(() => {
    const el = element;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [element]);

  const slice = computeSlice(opts.itemCount, opts.rowHeight, scrollTop, viewportHeight, opts.bufferRows);
  return { ref, slice, onScroll };
}
