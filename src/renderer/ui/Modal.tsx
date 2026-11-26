// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- Modal
// The ONE canonical overlay surface. Every dialog/sheet in the shell builds
// on this instead of re-implementing backdrop + centering + animation:
//
// - Portal to document.body: immune to ancestor stacking-context/overflow
//   bugs (the historical source of clipped and overlapping dialogs).
// - Flex centering: no translate(-50%,-50%), so panels land on whole pixels
//   and text stays sharp at every DPI.
// - Focus management: focus moves into the panel on open, is trapped while
//   open (Tab cycles), and returns to the opener on close.
// - Escape closes, backdrop click closes (both optional).
// - Body scroll locked while any modal is open (ref-counted, nest-safe).
// - Sizes map to responsive tokens (--dex-modal-*): never overflows the
//   window, no hardcoded pixel widths.
// - Entrance animation lives in CSS (.dex-modal-*) on token durations, so
//   prefers-reduced-motion is honoured automatically.
// ===========================================================================
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { space, fontSize, fontWeight, zIndex } from '../styles/tokens';
import { useAppAppearance } from '../utils/appAppearanceContext';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Responsive width preset. Defaults to 'md' (min(520px, vw - 48px)). */
  size?: ModalSize;
  /** Accessible name. Either a visible title or `ariaLabel` is required. */
  title?: React.ReactNode;
  /** Accessible name when no visible title is rendered. */
  ariaLabel?: string;
  /** Close when clicking the backdrop. Default true. */
  dismissOnBackdrop?: boolean;
  /** Close on Escape. Default true. */
  dismissOnEscape?: boolean;
  /** Right-aligned footer row (typically Buttons). */
  footer?: React.ReactNode;
  /** Stacking layer; defaults to the shell modal layer. */
  zIndexOverride?: React.CSSProperties['zIndex'];
  /** Prefix for data-testid hooks: `${testIdPrefix}-backdrop|-panel`. */
  testIdPrefix?: string;
  children?: React.ReactNode;
  /** Extra styles for the panel (layout only; visuals come from tokens). */
  panelStyle?: React.CSSProperties;
  /** Layout overrides for dialogs with their own scrolling region. */
  bodyStyle?: React.CSSProperties;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Ref-counted body scroll lock -- safe with nested/stacked modals.
let scrollLocks = 0;
let prevOverflow = '';
const lockScroll = () => {
  if (scrollLocks === 0) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
};
const unlockScroll = () => {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = prevOverflow;
};

export function Modal({
  open,
  onClose,
  size = 'md',
  title,
  ariaLabel,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  footer,
  zIndexOverride,
  testIdPrefix = 'modal',
  children,
  panelStyle,
  bodyStyle,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = `${testIdPrefix}-title`;

  // Scroll lock + focus restore are layout effects so they run before paint.
  useLayoutEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    lockScroll();
    return () => {
      unlockScroll();
      openerRef.current?.focus?.();
    };
  }, [open]);

  // Initial focus: first focusable element in the panel, else the panel.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();
  }, [open]);

  // Escape + focus trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissOnEscape) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, dismissOnEscape, onClose]);

  const appearance = useAppAppearance();
  if (!open) return null;

  const node = (
    <div
      {...appearance}
      className="dex-modal-backdrop"
      style={{ zIndex: zIndexOverride ?? zIndex.modal }}
      role="presentation"
      data-testid={`${testIdPrefix}-backdrop`}
      onClick={(e) => {
        // target check: clicks inside the panel bubble here but must not
        // dismiss; only a true backdrop click closes.
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="dex-modal-panel"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        data-testid={`${testIdPrefix}-panel`}
        style={panelStyle}
      >
        {title != null && (
          <h2
            id={titleId}
            style={{
              margin: 0,
              padding: `${space[5]}px ${space[5]}px 0`,
              fontSize: fontSize.lg,
              fontWeight: fontWeight.semibold,
              color: 'var(--color-text-primary, #fff)',
            }}
          >
            {title}
          </h2>
        )}
        <div style={{ padding: space[5], overflowY: 'auto', flex: 1, minHeight: 0, ...bodyStyle }}>
          {children}
        </div>
        {footer != null && (
          <div
            style={{
              display: 'flex',
              gap: space[2],
              justifyContent: 'flex-end',
              padding: `0 ${space[5]}px ${space[5]}px`,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
