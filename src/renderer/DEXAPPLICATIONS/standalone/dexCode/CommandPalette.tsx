// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX Code › Command Palette (Ctrl+Shift+P): every editor action, searchable,
// with its shortcut. Commands are the editor's real handlers.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOverlay } from '../../../services/overlayStack';

export interface PaletteCommand { id: string; label: string; shortcut?: string; run: () => void; disabled?: boolean }

export function filterCommands(cmds: PaletteCommand[], q: string): PaletteCommand[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return cmds;
  return cmds.filter((c) => words.every((w) => c.label.toLowerCase().includes(w)));
}

export const CommandPalette: React.FC<{ commands: PaletteCommand[]; onClose: () => void }> = ({ commands, onClose }) => {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useOverlay(true, onClose, { ref });
  const list = useMemo(() => filterCommands(commands, q), [commands, q]);
  useEffect(() => setSel(0), [q]);
  const run = (c: PaletteCommand | undefined) => { if (!c || c.disabled) return; onClose(); setTimeout(c.run, 0); };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 48, pointerEvents: 'none' }}>
      <div ref={ref} role="dialog" aria-label="Command palette" className="dex-mat-opaque" style={{
        width: 'min(520px, calc(100% - 32px))', borderRadius: 14, overflow: 'hidden', pointerEvents: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)', border: '1px solid var(--color-border-subtle)',
      }}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(list[sel]); }
          }}
          placeholder="Type a command"
          aria-label="Command"
          aria-activedescendant={list[sel] ? `dexcode-cmd-${list[sel].id}` : undefined}
          style={{ width: '100%', boxSizing: 'border-box', height: 40, border: 'none', borderBottom: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 14, padding: '0 14px', outline: 'none' }}
        />
        <div role="listbox" aria-label="Commands" style={{ maxHeight: 320, overflowY: 'auto', padding: 4 }}>
          {list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No command matches.</div>}
          {list.map((c, i) => (
            <div
              key={c.id}
              id={`dexcode-cmd-${c.id}`}
              role="option"
              aria-selected={i === sel}
              aria-disabled={c.disabled || undefined}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(c)}
              style={{
                display: 'flex', alignItems: 'center', height: 30, padding: '0 10px', borderRadius: 10, cursor: c.disabled ? 'default' : 'pointer',
                background: i === sel ? 'var(--color-accent-light)' : 'transparent',
                color: c.disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', fontSize: 13,
              }}
            >
              <span style={{ flex: 1 }}>{c.label}</span>
              {c.shortcut && <kbd style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'inherit' }}>{c.shortcut}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
