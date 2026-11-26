// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ConfirmDialog -- the in-app replacement for `window.confirm()`.
 *
 * Built on the canonical ui/Modal primitive (portal, focus trap, scroll
 * lock, Escape, responsive sizing). This component only adds:
 * - Initial focus lands on Cancel for destructive actions.
 * - Neutral dialogs support Enter as a default action.
 * - The destructive variant uses the danger Button styling.
 */

// DEX v3.8.9 follow-up - confirm dialog UI

import React, { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { fontSize } from '../styles/tokens';
import { Z_DROPDOWN_BASE } from '../../shared/zIndex';

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
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    (tone === 'destructive' ? cancelRef : confirmRef).current?.focus();
  }, [open, tone]);

  useEffect(() => {
    if (!open || tone === 'destructive') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest('button, a, input, select, textarea, [contenteditable]')) return;
      e.preventDefault();
      onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, tone, onConfirm]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title={title}
      dismissOnBackdrop={dismissOnBackdrop}
      zIndexOverride={Z_DROPDOWN_BASE}
      testIdPrefix={testIdPrefix}
      footer={
        <>
          <Button ref={cancelRef} variant="ghost" size="md" onClick={onCancel}>{cancelLabel}</Button>
          <Button
            ref={confirmRef}
            variant={tone === 'destructive' ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
            data-testid={`${testIdPrefix}-confirm`}
          >{confirmLabel}</Button>
        </>
      }
    >
      <div data-testid={`${testIdPrefix}-dialog`}>
        {message && <div style={messageStyle}>{message}</div>}
      </div>
    </Modal>
  );
}

const messageStyle: React.CSSProperties = { margin: 0, fontSize: fontSize.sm, color: 'var(--color-text-secondary, rgba(255,255,255,0.72))', lineHeight: 1.55 };

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

