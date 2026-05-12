// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Roving-tab + arrow-nav hook (T1-010, T1-015, T1-032, T1-049, T12-013).
 *
 * Use on a container of buttons/menuitems. Manages tabindex=0 on the active
 * item, tabindex=-1 on the rest, and Arrow keys to move focus.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseArrowNavOptions {
  /** 'horizontal' = ArrowLeft/Right, 'vertical' = ArrowUp/Down, 'grid' = both. */
  orientation?: 'horizontal' | 'vertical' | 'grid';
  /** Initial active index. */
  initial?: number;
  /** When true, ArrowDown at end wraps to start. Default true. */
  wrap?: boolean;
  /** Selector identifying the focusable items inside the ref container. */
  itemSelector?: string;
}

export function useArrowNav<T extends HTMLElement = HTMLElement>(
  options: UseArrowNavOptions = {},
) {
  const {
    orientation = 'vertical',
    initial = 0,
    wrap = true,
    itemSelector = '[data-arrownav-item]',
  } = options;

  const ref = useRef<T | null>(null);
  const [active, setActive] = useState(initial);

  const items = useCallback((): HTMLElement[] => {
    if (!ref.current) return [];
    return Array.from(ref.current.querySelectorAll<HTMLElement>(itemSelector));
  }, [itemSelector]);

  // Keep tabindex in sync with active.
  useEffect(() => {
    const list = items();
    list.forEach((el, i) => {
      el.tabIndex = i === active ? 0 : -1;
    });
  }, [active, items]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<T>) => {
      const list = items();
      if (list.length === 0) return;
      const horiz = orientation === 'horizontal' || orientation === 'grid';
      const vert = orientation === 'vertical' || orientation === 'grid';

      let next = active;
      const key = event.key;

      if (vert && key === 'ArrowDown') next = active + 1;
      else if (vert && key === 'ArrowUp') next = active - 1;
      else if (horiz && key === 'ArrowRight') next = active + 1;
      else if (horiz && key === 'ArrowLeft') next = active - 1;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = list.length - 1;
      else return;

      event.preventDefault();
      if (next < 0) next = wrap ? list.length - 1 : 0;
      if (next >= list.length) next = wrap ? 0 : list.length - 1;
      setActive(next);
      list[next]?.focus();
    },
    [active, items, orientation, wrap],
  );

  return { ref, active, setActive, onKeyDown };
}
