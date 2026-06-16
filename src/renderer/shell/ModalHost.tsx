// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Shell -- Modal Host
// The ONE modal host for the shell. Before this, every dialog mounted itself
// ad-hoc (each owning its open state in App.tsx) or hand-rolled its own
// backdrop + escape + focus handling. This host centralises that:
//
//   - A single provider, mounted once high in the tree (App.tsx), keeps an
//     ordered STACK of open modals and renders them through one portal root
//     (the canonical ui/Modal primitive, which already handles portal,
//     backdrop click, Escape, focus trap, body-scroll lock, and the
//     --z-modal / zIndex.modal stacking layer).
//   - Imperative API via useModal(): open() pushes a modal and returns an id +
//     a close() for that exact entry; close(id) / closeAll() pop the stack.
//   - Stacked modals each get a slightly higher z-index so a confirm opened
//     from inside another dialog lands on top, and only the topmost modal's
//     Escape/backdrop closes that one (the underlying Modal stops Escape
//     propagation), so the stack unwinds one level at a time.
//
// This intentionally builds on ui/Modal rather than re-implementing portal /
// focus / scroll-lock logic, so there is exactly one overlay surface in the
// app and migrated dialogs keep their existing look and behaviour.
// ===========================================================================
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, type ModalSize } from '../ui/Modal';
import { zIndex } from '../styles/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for a single modal. `content` may be a node or a render function that
 * receives the close handler for this entry, so a dialog's own buttons can
 * dismiss it without the caller threading state.
 */
export interface ModalOptions {
  /** Body content. A function receives this entry's `close`. */
  content: React.ReactNode | ((close: () => void) => React.ReactNode);
  /** Responsive width preset. Defaults to 'md'. */
  size?: ModalSize;
  /** Visible title rendered in the panel header. */
  title?: React.ReactNode;
  /** Accessible name when no visible title is rendered. */
  ariaLabel?: string;
  /** Right-aligned footer row. A function receives this entry's `close`. */
  footer?: React.ReactNode | ((close: () => void) => React.ReactNode);
  /** Close when clicking the backdrop. Default true. */
  dismissOnBackdrop?: boolean;
  /** Close on Escape. Default true. */
  dismissOnEscape?: boolean;
  /** Prefix for data-testid hooks on the rendered Modal. */
  testIdPrefix?: string;
  /** Extra panel styles (layout only). */
  panelStyle?: React.CSSProperties;
  /** Invoked after this entry is removed from the stack. */
  onClose?: () => void;
}

interface ModalEntry extends ModalOptions {
  id: string;
}

export interface ModalContextValue {
  /** Push a modal onto the stack; returns its id and a bound close handler. */
  open: (options: ModalOptions) => { id: string; close: () => void };
  /** Close a specific modal by id (no-op if already closed). */
  close: (id: string) => void;
  /** Close every open modal. */
  closeAll: () => void;
  /** Number of currently open modals. */
  count: number;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ModalContext = createContext<ModalContextValue | null>(null);

/**
 * Access the shell modal host. Must be called under <ModalProvider>.
 */
export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

let modalSeq = 0;

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stack, setStack] = useState<ModalEntry[]>([]);
  // Keep options (notably onClose) reachable from close() without re-creating
  // the callback on every stack change.
  const stackRef = useRef<ModalEntry[]>([]);
  stackRef.current = stack;

  const close = useCallback((id: string) => {
    const entry = stackRef.current.find((m) => m.id === id);
    setStack((prev) => prev.filter((m) => m.id !== id));
    entry?.onClose?.();
  }, []);

  const closeAll = useCallback(() => {
    const entries = stackRef.current;
    setStack([]);
    entries.forEach((m) => m.onClose?.());
  }, []);

  const open = useCallback((options: ModalOptions) => {
    const id = `modal-${++modalSeq}`;
    setStack((prev) => [...prev, { ...options, id }]);
    return { id, close: () => close(id) };
  }, [close]);

  const value = useMemo<ModalContextValue>(
    () => ({ open, close, closeAll, count: stack.length }),
    [open, close, closeAll, stack.length],
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      {stack.map((entry, index) => {
        const closeThis = () => close(entry.id);
        const content =
          typeof entry.content === 'function' ? entry.content(closeThis) : entry.content;
        const footer =
          typeof entry.footer === 'function' ? entry.footer(closeThis) : entry.footer;
        return (
          <Modal
            key={entry.id}
            open
            onClose={closeThis}
            size={entry.size}
            title={entry.title}
            ariaLabel={entry.ariaLabel}
            footer={footer}
            dismissOnBackdrop={entry.dismissOnBackdrop}
            dismissOnEscape={entry.dismissOnEscape}
            testIdPrefix={entry.testIdPrefix}
            panelStyle={entry.panelStyle}
            // Each stacked modal sits one layer above the previous so a dialog
            // opened from within another lands on top. zIndex.modal mirrors the
            // --z-modal token used across the shell.
            zIndexOverride={zIndex.modal + index}
          >
            {content}
          </Modal>
        );
      })}
    </ModalContext.Provider>
  );
};

export default ModalProvider;
