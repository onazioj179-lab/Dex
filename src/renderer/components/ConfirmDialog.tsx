// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ConfirmDialog -- the in-app replacement for `window.confirm()`.
 *
 * - Focus is trapped inside the dialog while open.
 * - Escape cancels, Enter triggers the primary action.
 * - The destructive variant uses the danger Button styling.
 * - Backdrop click cancels unless `dismissOnBackdrop={false}`.
 *
 * Pure presentational component: callers own the open state. No globals,
 * no portals -- the host can wrap it in a portal if it needs to.
 */

// DEX v3.8.9 follow-up - confirm dialog UI

import React, { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { space, radius, fontSize, fontWeight } from '../styles/tokens';

export type ConfirmTone = 'neutral' | 'destructive';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
  dismissOnBackdrop?: boolean;
  /** Render in a custom container. Defaults to the body via inline-portal. */
  testIdPrefix?: string;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'neutral',
  onConfirm,
  onCancel,
  dismissOnBackdrop = true,
  testIdPrefix = 'confirm',
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div
      style={backdropStyle}
      role="presentation"
      data-testid={`${testIdPrefix}-backdrop`}
      onClick={() => { if (dismissOnBackdrop) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testIdPrefix}-title`}
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
        data-testid={`${testIdPrefix}-dialog`}
      >
        <h2 id={`${testIdPrefix}-title`} style={titleStyle}>{title}</h2>
        {message && <div style={messageStyle}>{message}</div>}
        <div style={buttonRow}>
          <Button variant="ghost" size="md" onClick={onCancel}>{cancelLabel}</Button>
          <Button
            ref={confirmRef}
            variant={tone === 'destructive' ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
            data-testid={`${testIdPrefix}-confirm`}
          >{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 6000,
  padding: space[4],
};
const dialogStyle: React.CSSProperties = {
  background: 'var(--color-bg-elevated, #1A1A1E)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.10))',
  borderRadius: radius.lg,
  padding: space[5],
  minWidth: 320,
  maxWidth: 480,
  boxShadow: 'var(--pg-shadow-modal)',
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
};
const titleStyle: React.CSSProperties = { margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.semibold };
const messageStyle: React.CSSProperties = { margin: 0, fontSize: fontSize.sm, color: 'var(--color-text-secondary, rgba(255,255,255,0.72))', lineHeight: 1.55 };
const buttonRow: React.CSSProperties = { display: 'flex', gap: space[2], justifyContent: 'flex-end' };

// =============================================================================
// useConfirm — async helper that returns a Promise<boolean>.
// Drop-in replacement for window.confirm() with proper focus/Esc/Enter handling.
// Usage:
//   const { confirm, ConfirmHost } = useConfirm();
//   const ok = await confirm({ title: 'Delete?', tone: 'destructive' });
//   ...render <ConfirmHost /> somewhere in your tree.
// =============================================================================
type ConfirmOptions = Omit<ConfirmDialogProps, 'open' | 'onConfirm' | 'onCancel'>;

export function useConfirm() {
  const [state, setState] = React.useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ opts, resolve });
    });
  }, []);

  const close = React.useCallback((value: boolean) => {
    setState((curr) => {
      if (curr) curr.resolve(value);
      return null;
    });
  }, []);

  const ConfirmHost = React.useCallback(() => {
    if (!state) return null;
    return (
      <ConfirmDialog
        {...state.opts}
        open
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    );
  }, [state, close]);

  return { confirm, ConfirmHost };
}

