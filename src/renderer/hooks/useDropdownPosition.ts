// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * useDropdownPosition — viewport-aware placement for absolutely-positioned
 * dropdown menus / popovers.
 *
 * DEX OS-level refinement: "every app must remain usable regardless of display
 * size — no cut-off controls, no unreachable actions." A dropdown that always
 * opens downward and at a fixed anchor will clip off the bottom of a laptop
 * screen or overflow the side near a viewport edge. This hook measures the
 * trigger + menu against the viewport (before paint, so no flicker) and returns
 * a style object the menu spreads in: it flips up when there is no room below,
 * caps maxHeight to the available space (so the menu always scrolls inside the
 * viewport instead of off it), and clamps horizontally so the menu never leaves
 * the screen.
 *
 * The menu MUST be absolutely positioned inside a `position: relative` anchor
 * (the standard pattern in this codebase). Pass refs to both.
 */
import { useLayoutEffect, useState, type RefObject, type CSSProperties } from 'react';

export interface UseDropdownPositionOptions {
  /** Gap in px between the trigger and the menu. Default 4. */
  gap?: number;
  /** Safety margin from the viewport edge in px. Default 8. */
  margin?: number;
  /** Keep the menu the full width of the anchor (left:0; right:0). Skips
   *  horizontal clamping (a full-width menu is already within the anchor). */
  matchWidth?: boolean;
  /** Horizontal anchoring when not matchWidth. Default 'left'. */
  align?: 'left' | 'right';
  /** Minimum maxHeight before a flip is preferred, in px. Default 120. */
  minHeight?: number;
}

export function useDropdownPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  options: UseDropdownPositionOptions = {},
): CSSProperties {
  const { gap = 4, margin = 8, matchWidth = false, align = 'left', minHeight = 120 } = options;

  const base: CSSProperties = matchWidth
    ? { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: gap }
    : { position: 'absolute', top: '100%', marginTop: gap, ...(align === 'right' ? { right: 0 } : { left: 0 }) };

  const [style, setStyle] = useState<CSSProperties>(base);

  useLayoutEffect(() => {
    if (!open) { setStyle(base); return; }
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const measure = () => {
      const a = anchor.getBoundingClientRect();
      const mh = menu.offsetHeight;
      const mw = menu.offsetWidth;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const spaceBelow = vh - a.bottom - margin;
      const spaceAbove = a.top - margin;

      // Vertical: open down unless there is clearly more room above and the menu
      // does not fit below.
      const openUp = mh > spaceBelow && spaceAbove > spaceBelow;
      const vertical: CSSProperties = openUp
        ? { bottom: '100%', marginBottom: gap, maxHeight: Math.max(minHeight, spaceAbove - gap) }
        : { top: '100%', marginTop: gap, maxHeight: Math.max(minHeight, spaceBelow - gap) };

      if (matchWidth) {
        setStyle({ position: 'absolute', left: 0, right: 0, ...vertical });
        return;
      }

      // Horizontal: compute desired viewport-left, clamp into the viewport, then
      // express it relative to the anchor's box (the menu's offset parent).
      let vpLeft = align === 'right' ? a.right - mw : a.left;
      const maxLeft = vw - margin - mw;
      vpLeft = Math.max(margin, Math.min(vpLeft, Math.max(margin, maxLeft)));
      const left = Math.round(vpLeft - a.left);

      setStyle({ position: 'absolute', left, ...vertical });
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // base is derived from primitives below; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorRef, menuRef, gap, margin, matchWidth, align, minHeight]);

  return style;
}
