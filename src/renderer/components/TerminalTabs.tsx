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
 * Terminal component is composed, not modified.
 *
 * Persistence: the open tab list + their names is saved to localStorage and
 * restored on the next mount. Restored tabs start their shell when made visible.
 * Opened sessions stay mounted across tab switches and splits.
 *
 * Auto-title: each Terminal reports the command it is currently running via
 * `onRunningCommand`; if the user hasn't manually renamed the tab, its label
 * tracks that command (truncated to the first word/argv0).
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Terminal } from './Terminal';

interface TerminalTabsProps {
  onClose?: () => void;
  cwd?: string;
  height?: number | string;
  visible?: boolean;
}

interface Tab {
  id: string;
  cwd?: string;
  shell?: string;
  /** User-set name; when present it overrides the auto-title. */
  name?: string;
}

const TABS_KEY = 'dex.terminal.tabs.v1';
const MAX_TABS = 16;

interface PersistedState { tabs: Tab[]; activeId: string; splitId?: string; nextNum: number; }

function loadState(): PersistedState | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(TABS_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed || !Array.isArray(parsed.tabs)) return null;
    const valid = parsed.tabs.filter((t): t is Tab => !!t && typeof t.id === 'string' && /^t\d{1,12}$/.test(t.id));
    const tabs = [...new Map(valid.map(t => [t.id, t])).values()].slice(0, MAX_TABS)
      .map(t => ({
        id: t.id,
        cwd: typeof t.cwd === 'string' ? t.cwd : undefined,
        shell: typeof t.shell === 'string' ? t.shell : undefined,
        name: typeof t.name === 'string' ? t.name.slice(0, 100) : undefined,
      }));
    if (tabs.length === 0) return null;
    const activeId = typeof parsed.activeId === 'string' && tabs.some((t) => t.id === parsed.activeId)
      ? parsed.activeId
      : tabs[tabs.length - 1].id;
    const splitId = parsed.splitId !== activeId && tabs.some(t => t.id === parsed.splitId) ? parsed.splitId : undefined;
    const nextNum = Math.max(...tabs.map(t => Number(t.id.slice(1)))) + 1;
    return { tabs, activeId, splitId, nextNum };
  } catch {
    return null;
  }
}

function saveState(state: PersistedState): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TABS_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — tabs simply won't restore next time */
  }
}

/** Derive a short tab label from a running command (argv0, capped). */
function titleFromCommand(cmd: string): string {
  const first = cmd.trim().split(/\s+/)[0] || cmd.trim();
  // Strip a path prefix (e.g. /usr/bin/node -> node, C:\x\git.exe -> git.exe).
  const base = first.split(/[\\/]/).pop() || first;
  return base.length > 16 ? `${base.slice(0, 15)}…` : base;
}

export const TerminalTabs: React.FC<TerminalTabsProps> = ({ onClose, cwd, height, visible = true }) => {
  const restored = useMemo(() => loadState(), []);
  const groupId = useId();
  const [tabs, setTabs] = useState<Tab[]>(() => restored?.tabs.map(tab => ({ ...tab, cwd: tab.cwd ?? cwd })) ?? [{ id: 't1', cwd }]);
  const [activeId, setActiveId] = useState(() => restored?.activeId ?? 't1');
  const [splitId, setSplitId] = useState(restored?.splitId);
  const [opened, setOpened] = useState(() => {
    const ids = new Set([restored?.activeId ?? 't1']);
    if (restored?.splitId) ids.add(restored.splitId);
    return ids;
  });
  const nextNum = useRef(restored?.nextNum ?? 2);
  // Live running-command per tab id (for auto-title); not persisted.
  const [running, setRunning] = useState<Record<string, string | null>>({});
  // Inline rename editor state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [profiles, setProfiles] = useState<Array<{ label: string; shell: string }>>([]);
  const [newShell, setNewShell] = useState('');

  useEffect(() => {
    let disposed = false;
    void window.electron?.invoke('pty:listProfiles').then((result: unknown) => {
      if (disposed) return;
      const payload = result as { profiles?: Array<{ label?: unknown; shell?: unknown }> } | null;
      if (Array.isArray(payload?.profiles)) {
        setProfiles(payload.profiles.filter((entry): entry is { label: string; shell: string } =>
          typeof entry?.label === 'string' && typeof entry.shell === 'string'));
      }
    }).catch(() => {});
    return () => { disposed = true; };
  }, []);

  // Persist the tab list + names + active tab whenever they change.
  useEffect(() => {
    saveState({ tabs, activeId, splitId, nextNum: nextNum.current });
  }, [tabs, activeId, splitId]);

  const ensureOpened = (id: string) => setOpened(previous => previous.has(id) ? previous : new Set(previous).add(id));
  const selectTab = (id: string) => {
    if (id === splitId) {
      document.getElementById(`${groupId}-panel-${id}`)?.focus();
      return;
    }
    ensureOpened(id);
    setActiveId(id);
  };

  const createTab = () => {
    if (tabs.length >= MAX_TABS) return;
    const id = `t${nextNum.current++}`;
    setTabs(prev => [...prev, { id, cwd, shell: newShell || undefined }]);
    ensureOpened(id);
    return id;
  };
  const addTab = () => {
    const id = createTab();
    if (id) setActiveId(id);
  };
  const toggleSplit = () => {
    if (splitId) {
      setSplitId(undefined);
      return;
    }
    const other = tabs.find(tab => tab.id !== activeId)?.id ?? createTab();
    if (!other) return;
    ensureOpened(other);
    setSplitId(other);
  };

  const closeTab = (id: string) => {
    const remaining = tabs.filter(t => t.id !== id);
    if (!remaining.length && onClose) {
      try { localStorage.removeItem(TABS_KEY); } catch { /* Storage may be unavailable. */ }
      onClose();
      return;
    }
    setRunning(prev => { const next = { ...prev }; delete next[id]; return next; });
    setOpened(previous => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    if (!remaining.length) {
      const next = `t${nextNum.current++}`;
      setTabs([{ id: next, cwd, shell: newShell || undefined }]);
      ensureOpened(next);
      setActiveId(next);
      return;
    }
    setTabs(remaining);
    if (id === splitId || id === activeId && remaining.length === 1) setSplitId(undefined);
    if (id === activeId) {
      const next = remaining.find(tab => tab.id !== splitId) ?? remaining[0];
      ensureOpened(next.id);
      setActiveId(next.id);
    }
  };

  const commitRename = useCallback(() => {
    setTabs(prev => prev.map(t => {
      if (t.id !== editingId) return t;
      const name = editName.trim();
      return { ...t, name: name || undefined };
    }));
    setEditingId(null);
    setEditName('');
  }, [editingId, editName]);

  const startRename = useCallback((tab: Tab, fallback: string) => {
    setEditingId(tab.id);
    setEditName(tab.name ?? fallback);
  }, []);

  const labelFor = useCallback((tab: Tab, index: number): string => {
    if (tab.name) return tab.name;
    const cmd = running[tab.id];
    if (cmd) return titleFromCommand(cmd);
    return `Terminal ${index + 1}`;
  }, [running]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: height ?? '100%', minHeight: 0 }}>
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Terminal sessions"
        aria-multiselectable={!!splitId}
        style={{
          display: 'flex', alignItems: 'stretch', gap: 2,
          padding: '2px 4px', flexShrink: 0,
          background: '#0a0a0a',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          overflowX: 'auto', scrollbarWidth: 'none',
        }}
      >
        {tabs.map((t, i) => {
          const active = t.id === activeId || t.id === splitId;
          const label = labelFor(t, i);
          const editing = editingId === t.id;
          return (
            <div
              key={t.id}
              role="tab"
              id={`${groupId}-tab-${t.id}`}
              aria-selected={active}
              aria-controls={opened.has(t.id) ? `${groupId}-panel-${t.id}` : undefined}
              tabIndex={0}
              onClick={() => selectTab(t.id)}
              onDoubleClick={() => startRename(t, label)}
              onKeyDown={(e) => {
                if (e.currentTarget !== e.target) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTab(t.id); }
                else if (e.key === 'F2') { e.preventDefault(); startRename(t, label); }
              }}
              title="Double-click to rename"
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
              {editing ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                    else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); setEditName(''); }
                  }}
                  aria-label={`Rename ${label}`}
                  style={{
                    width: 96, background: '#141414', color: '#e0e0e0',
                    border: '1px solid rgba(255,255,255,0.18)', borderRadius: 3, outline: 'none',
                    fontFamily: 'inherit', fontSize: 11, fontWeight: 600, padding: '0 4px',
                  }}
                />
              ) : (
                <span style={{ maxWidth: 140, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                aria-label={`Close ${label}`}
                title="Close tab"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, flexShrink: 0, padding: 0, borderRadius: 3,
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
          disabled={tabs.length >= MAX_TABS}
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
        <button type="button" aria-pressed={!!splitId} onClick={toggleSplit} aria-label="Split terminal"
          style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: 0, flexShrink: 0, cursor: 'pointer' }}>
          Split
        </button>
        {profiles.length > 0 && <select aria-label="Shell for new terminals" value={newShell} onChange={event => setNewShell(event.target.value)}
          style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-base)', border: 0, maxWidth: 140, flexShrink: 0 }}>
          <option value="">Default shell</option>
          {profiles.map(profile => <option key={profile.shell} value={profile.shell}>{profile.label}</option>)}
        </select>}
      </div>

      {/* Switching the visible panes keeps each opened terminal mounted. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {tabs.filter(tab => opened.has(tab.id)).map(t => (
          <div
            key={t.id}
            role="tabpanel"
            id={`${groupId}-panel-${t.id}`}
            aria-labelledby={`${groupId}-tab-${t.id}`}
            tabIndex={-1}
            style={{ position: 'absolute', inset: 0, left: t.id === splitId ? '50%' : 0,
              right: splitId && t.id === activeId ? '50%' : 0,
              display: t.id === activeId || t.id === splitId ? 'block' : 'none' }}
          >
            <Terminal
              cwd={t.cwd}
              shell={t.shell}
              visible={visible && (t.id === activeId || t.id === splitId)}
              onClose={() => closeTab(t.id)}
              onRunningCommand={(cmd) => setRunning(prev => (prev[t.id] === cmd ? prev : { ...prev, [t.id]: cmd }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TerminalTabs;
