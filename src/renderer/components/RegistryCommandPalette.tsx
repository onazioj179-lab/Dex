// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * RegistryCommandPalette -- a thin Ctrl+K palette wired to the shared
 * `commands/registry`. Distinct from the legacy `CommandPalette.tsx`,
 * which is hard-coded to running apps + theme actions; this one is
 * driven entirely by a `CommandRegistry` so any subsystem can register
 * actions via `registerCommand` and immediately appear here.
 *
 * - Up/Down arrow scrolls through results, Enter runs.
 * - Escape closes.
 * - Disabled commands are filtered server-side by `searchCommands`.
 */

// DEX v3.8.9 follow-up - registry-driven palette UI

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TextInput } from '../ui/TextInput';
import { space, radius, fontSize, fontWeight } from '../styles/tokens';
import { searchCommands, type CommandRegistry, type PaletteCommand } from '../../shared/commands/registry';
import { Z_DROPDOWN_MAX } from '../../shared/zIndex';

export interface RegistryCommandPaletteProps {
  open: boolean;
  registry: CommandRegistry;
  onClose: () => void;
  /** Receives the command id when the user picks one. */
  onRun: (commandId: string) => void;
  /** Max visible results in the dropdown. */
  limit?: number;
  placeholder?: string;
}

export function RegistryCommandPalette({ open, registry, onClose, onRun, limit = 10, placeholder = 'Type a command...' }: RegistryCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results: PaletteCommand[] = open
    ? searchCommands(registry, query, limit).map((r) => r.command)
    : [];

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  const runActive = useCallback(() => {
    const c = results[active];
    if (c) { onRun(c.id); onClose(); }
  }, [results, active, onRun, onClose]);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter')     { e.preventDefault(); runActive(); return; }
  }, [onClose, results.length, runActive]);

  if (!open) return null;

  return (
    <div
      style={backdropStyle}
      role="presentation"
      data-testid="registry-palette-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        data-testid="registry-palette"
      >
        <TextInput
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Command query"
          data-testid="registry-palette-input"
        />
        {results.length === 0 ? (
          <div style={emptyStyle}>No matching commands.</div>
        ) : (
          <ul role="listbox" aria-label="Commands" style={listStyle}>
            {results.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === active}
                style={i === active ? activeRow : row}
                onMouseEnter={() => setActive(i)}
                onClick={() => { onRun(c.id); onClose(); }}
                data-testid={`registry-palette-row-${i}`}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>{c.label}</span>
                  {c.group && <span style={groupStyle}>{c.group}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '12vh',
  zIndex: Z_DROPDOWN_MAX + 100,
};
const dialogStyle: React.CSSProperties = {
  background: 'var(--color-bg-elevated, #1A1A1E)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.10))',
  borderRadius: radius.lg,
  padding: space[3],
  width: 'min(560px, 92vw)',
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  boxShadow: 'var(--pg-shadow-popover-strong)',
};
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  maxHeight: 320,
  overflowY: 'auto',
};
const row: React.CSSProperties = {
  padding: `${space[2]}px ${space[3]}px`,
  borderRadius: radius.md,
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
};
const activeRow: React.CSSProperties = { ...row, background: 'var(--color-bg-hover, #1E1E22)' };
const emptyStyle: React.CSSProperties = {
  padding: space[3],
  fontSize: fontSize.sm,
  color: 'var(--color-text-secondary)',
};
const groupStyle: React.CSSProperties = {
  fontSize: fontSize.xs,
  color: 'var(--color-text-tertiary, rgba(255,255,255,0.55))',
};
