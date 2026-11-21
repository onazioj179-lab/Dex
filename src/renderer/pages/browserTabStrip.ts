// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

const VIRTUALIZE_AFTER = 24;
const DEFAULT_VIEWPORT = 800;
const OVERSCAN = 320;

export function useBrowserTabStrip<T extends { id: string; pinned?: boolean }>(tabs: readonly T[], active: string) {
  const container = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const virtual = tabs.length > VIRTUALIZE_AFTER;
  const [view, setView] = useState({ left: 0, width: DEFAULT_VIEWPORT });
  const { positions, total } = useMemo(() => {
    let left = 0;
    const positions = tabs.map(tab => {
      const width = tab.pinned ? 44 : 158;
      const position = { left, width };
      left += width;
      return position;
    });
    return { positions, total: left };
  }, [tabs]);
  const activePosition = positions[tabs.findIndex(tab => tab.id === active)];

  const measure = useCallback(() => {
    const element = container.current;
    if (!element) return;
    const left = element.scrollLeft;
    const width = element.clientWidth || DEFAULT_VIEWPORT;
    setView(previous => previous.left === left && previous.width === width ? previous : { left, width });
  }, []);

  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      measure();
    });
  }, [measure]);

  useLayoutEffect(() => {
    if (!virtual || !container.current) return;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(container.current);
    measure();
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [measure, virtual]);

  const activeLeft = activePosition?.left;
  const activeWidth = activePosition?.width;
  useLayoutEffect(() => {
    const element = container.current;
    if (!virtual || !element || activeLeft === undefined || activeWidth === undefined) return;
    const width = element.clientWidth || DEFAULT_VIEWPORT;
    if (activeLeft < element.scrollLeft) element.scrollLeft = activeLeft;
    else if (activeLeft + activeWidth > element.scrollLeft + width) element.scrollLeft = activeLeft + activeWidth - width;
    measure();
  }, [activeLeft, activeWidth, measure, virtual]);

  const visible = useMemo(() => {
    if (!virtual) return tabs.map((tab, index) => ({ tab, ...positions[index] }));
    const start = view.left - OVERSCAN;
    const end = view.left + view.width + OVERSCAN;
    const first = positions.findIndex(position => position.left + position.width > start);
    if (first === -1) return [];
    const visible = [];
    for (let index = first; index < tabs.length && positions[index].left < end; index++) {
      visible.push({ tab: tabs[index], ...positions[index] });
    }
    return visible;
  }, [positions, tabs, view, virtual]);

  return { container, onScroll, total, virtual, visible };
}
