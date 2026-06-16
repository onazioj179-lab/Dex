// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * TerminalTabs - multi-session terminal: a compact tab strip over N independent
 * Terminal instances. Each tab is a real <Terminal> with its own PTY (autoSpawn),
 * kept mounted while hidden so switching tabs never loses a session or its
 * scrollback. Closing the last tab closes the whole panel (onClose). The base
 * Terminal component is untouched — this only composes it.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Terminal } from './Terminal';

interface TerminalTabsProps {
  onClose?: () => void;
  cwd?: string;
  height?: number | string;
}

interface Tab {
  id: string;
}

export const TerminalTabs: React.FC<TerminalTabsProps> = ({ onClose, cwd, height }) => {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 't1' }]);
  const [activeId, setActiveId] = useState('t1');
  const nextNum = useRef(2);

  const addTab = useCallback(() => {
    const id = `t${nextNum.current++}`;
    setTabs(prev => [...prev, { id }]);
    setActiveId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        // Closing the final session closes the whole terminal panel.
        onClose?.();
        return prev;
      }
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
  }, [activeId, onClose]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: height ?? '100%', minHeight: 0 }}>
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Terminal sessions"
        style={{
          display: 'flex', alignItems: 'stretch', gap: 2,
          padding: '2px 4px', flexShrink: 0,
          background: '#0a0a0a',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          overflowX: 'auto', scrollbarWidth: 'none',
        }}
      >
        {tabs.map((t, i) => {
          const active = t.id === activeId;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => setActiveId(t.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId(t.id); } }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                color: active ? 'var(--color-text-primary, #e0e0e0)' : 'var(--color-text-tertiary, #8a8a8a)',
                background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span>{`Terminal ${i + 1}`}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                aria-label={`Close terminal ${i + 1}`}
                title="Close tab"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, padding: 0, borderRadius: 3,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'inherit', opacity: 0.7, lineHeight: 1,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,58,0.25)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addTab}
          aria-label="New terminal session"
          title="New terminal"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, flexShrink: 0, marginLeft: 2, borderRadius: 5,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary, #8a8a8a)', fontSize: 14,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Sessions: every tab stays mounted (its PTY + scrollback persist); only the
          active one is shown. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {tabs.map(t => (
          <div
            key={t.id}
            style={{ position: 'absolute', inset: 0, display: t.id === activeId ? 'block' : 'none' }}
          >
            <Terminal cwd={cwd} onClose={() => closeTab(t.id)} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TerminalTabs;
