// =============================================================================
// DEX Platform — Shared app context menu + App Information
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// One menu for an app wherever it appears: the Dock, the App Menu, search
// results, a window's title bar, Task Manager. Items come from the app
// registry (what the app supports) and live state (running? floating?
// pinned?), so a menu never offers an action the app can't perform.
//
// Window actions are executed by AppManager, which owns the windows: this
// menu dispatches `dex-app-command` and AppManager performs it.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import DexIcon from './DexIcon';
import { getAppEntry, CATEGORY_LABEL, type AppEntry } from '../services/appRegistry';
import { appPinning, usePinState } from '../services/appPinning';
import { dispatchAppIntent } from '../services/appIntents';
import { useRunningApps } from '../store/runningApps';

export type AppCommand = 'open' | 'open-window' | 'front' | 'minimize' | 'close-window' | 'quit' | 'settings';

export interface AppCommandDetail { appId: string; command: AppCommand }

/** Ask AppManager to perform a window/app command. */
export function sendAppCommand(appId: string, command: AppCommand): void {
  window.dispatchEvent(new CustomEvent<AppCommandDetail>('dex-app-command', { detail: { appId, command } }));
}

/** Open the app (if needed) and run one of its registered quick actions. */
export function runAppAction(appId: string, actionId: string): void {
  sendAppCommand(appId, 'open');
  dispatchAppIntent(appId, actionId);
}

export interface AppContextMenuRequest {
  appId: string;
  x: number;
  y: number;
  /** Surface that opened it (only changes which items lead the menu). */
  source?: 'dock' | 'menu' | 'search' | 'titlebar' | 'taskmanager' | 'home';
  /** Whether the app is shown in a floating window (AppManager knows). */
  floating?: boolean;
}

export function openAppContextMenu(req: AppContextMenuRequest): void {
  window.dispatchEvent(new CustomEvent<AppContextMenuRequest>('dex-app-context-menu', { detail: req }));
}

interface Item { id: string; label: string; icon?: string; run: () => void; danger?: boolean }

const MENU_W = 232;

export const AppContextMenuHost: React.FC<{ isFloating: (appId: string) => boolean }> = ({ isFloating }) => {
  const [req, setReq] = useState<AppContextMenuRequest | null>(null);
  const [info, setInfo] = useState<AppEntry | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<AppContextMenuRequest>).detail;
      if (!d?.appId || !getAppEntry(d.appId)) return;
      returnFocus.current = document.activeElement as HTMLElement | null;
      setReq(d);
    };
    const onInfo = (e: Event) => {
      const id = (e as CustomEvent<{ appId: string }>).detail?.appId;
      const entry = id ? getAppEntry(id) : null;
      if (entry) setInfo(entry);
    };
    window.addEventListener('dex-app-context-menu', on);
    window.addEventListener('dex-app-info', onInfo);
    return () => { window.removeEventListener('dex-app-context-menu', on); window.removeEventListener('dex-app-info', onInfo); };
  }, []);

  // Keep the menu on screen, then focus its first item.
  useLayoutEffect(() => {
    if (!req || !menuRef.current) return;
    const h = menuRef.current.offsetHeight;
    const left = Math.max(8, Math.min(req.x, window.innerWidth - MENU_W - 8));
    const top = req.y + h > window.innerHeight - 8 ? Math.max(8, req.y - h) : req.y;
    setPos({ left, top });
    menuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [req]);

  const close = () => { setReq(null); returnFocus.current?.focus?.(); };

  return (
    <>
      {req && <MenuBody req={req} floating={req.floating ?? isFloating(req.appId)} menuRef={menuRef} pos={pos} onClose={close} onInfo={(e) => { setReq(null); setInfo(e); }} />}
      {info && <AppInfoDialog entry={info} onClose={() => setInfo(null)} />}
    </>
  );
};

const MenuBody: React.FC<{
  req: AppContextMenuRequest; floating: boolean; menuRef: React.RefObject<HTMLDivElement>;
  pos: { left: number; top: number }; onClose: () => void; onInfo: (e: AppEntry) => void;
}> = ({ req, floating, menuRef, pos, onClose, onInfo }) => {
  const entry = getAppEntry(req.appId)!;
  const pinned = usePinState(req.appId);
  const running = useRunningApps(s => s.runningApps.some(a => a.id === req.appId));
  const current = useRunningApps(s => s.currentAppId === req.appId);
  const minimized = useRunningApps(s => s.runningApps.find(a => a.id === req.appId)?.isMinimized ?? false);
  const act = (fn: () => void) => () => { onClose(); fn(); };

  const sections: Item[][] = [];
  const primary: Item[] = [];
  if (running && (!current || minimized)) primary.push({ id: 'front', label: 'Bring to Front', icon: 'maximize', run: act(() => sendAppCommand(entry.id, 'front')) });
  else if (!running) primary.push({ id: 'open', label: `Open ${entry.name}`, icon: 'external-link', run: act(() => sendAppCommand(entry.id, 'open')) });
  if (entry.supportsWindow && !floating) primary.push({ id: 'window', label: running ? 'Move to Own Window' : 'Open in New Window', icon: 'layers', run: act(() => sendAppCommand(entry.id, 'open-window')) });
  sections.push(primary);
  if (entry.actions.length) sections.push(entry.actions.map(a => ({ id: `act-${a.id}`, label: a.label, icon: a.icon, run: act(() => runAppAction(entry.id, a.id)) })));
  if (entry.pinnable) {
    sections.push([
      { id: 'dock', label: pinned.dock ? 'Unpin from Dock' : 'Pin to Dock', icon: 'pin', run: act(() => appPinning.toggle('dock', entry.id)) },
      { id: 'menu', label: pinned.menu ? 'Unpin from App Menu' : 'Pin to App Menu', icon: 'grid', run: act(() => appPinning.toggle('menu', entry.id)) },
    ]);
  }
  const meta: Item[] = [];
  if (entry.settings) meta.push({ id: 'settings', label: `${entry.name} Settings`, icon: 'settings', run: act(() => sendAppCommand(entry.id, 'settings')) });
  meta.push({ id: 'info', label: 'App Information', icon: 'info', run: () => onInfo(entry) });
  sections.push(meta);
  if (running && entry.id !== 'home') {
    const win: Item[] = [];
    if (!minimized) win.push({ id: 'min', label: 'Minimize', icon: 'minimize', run: act(() => sendAppCommand(entry.id, 'minimize')) });
    if (floating) win.push({ id: 'close-window', label: 'Close Window', icon: 'close', run: act(() => sendAppCommand(entry.id, 'close-window')) });
    win.push({ id: 'quit', label: `Quit ${entry.name}`, icon: 'power-off', danger: true, run: act(() => sendAppCommand(entry.id, 'quit')) });
    sections.push(win);
  }

  return (
    <>
      <div data-dex-overlay style={{ position: 'fixed', inset: 0, zIndex: 9850 }} onMouseDown={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div
        ref={menuRef}
        role="menu"
        aria-label={`${entry.name} options`}
        className="dex-surface-overlay"
        data-dex-app-menu={entry.id}
        style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9851, width: MENU_W, borderRadius: 10, padding: 4, animation: 'fadeIn 0.12s ease-out' }}
        onKeyDown={e => {
          const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
          const i = items.indexOf(document.activeElement as HTMLButtonElement);
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
          else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
          else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
          else if (e.key === 'Tab') { e.preventDefault(); }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          <DexIcon name={entry.icon} size={14} color="currentColor" />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
          {running && <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{minimized ? 'Minimized' : 'Running'}</span>}
        </div>
        {sections.filter(s => s.length).map((sec, si) => (
          <div key={si} role="group" style={{ borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))', paddingTop: 3, marginTop: 3 }}>
            {sec.map(it => (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                onClick={it.run}
                className="dex-hover-bg"
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                  padding: '6px 10px', fontSize: 13, borderRadius: 6, border: 'none', background: 'transparent',
                  color: it.danger ? 'var(--color-error)' : 'var(--color-text-primary)', cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.focus(); }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                onFocus={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                onBlur={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', color: it.danger ? 'currentColor' : 'var(--color-text-tertiary)' }}>
                  {it.icon && <DexIcon name={it.icon} size={13} color="currentColor" />}
                </span>
                {it.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
};

export const AppInfoDialog: React.FC<{ entry: AppEntry; onClose: () => void }> = ({ entry, onClose }) => {
  const pinned = usePinState(entry.id);
  const running = useRunningApps(s => s.runningApps.find(a => a.id === entry.id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, []);
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, padding: '5px 0', fontSize: 12.5, borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))' }}>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{k}</span><span style={{ color: 'var(--color-text-primary)' }}>{v}</span>
    </div>
  );
  return (
    <div data-dex-overlay style={{ position: 'fixed', inset: 0, zIndex: 9860, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`About ${entry.name}`} className="dex-surface-overlay"
        style={{ width: 'min(400px, calc(100vw - 32px))', borderRadius: 14, padding: 16 }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)' }}>
            <DexIcon name={entry.icon} size={22} color="var(--color-text-primary)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{entry.name}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{entry.category ? CATEGORY_LABEL[entry.category] : 'App'}</div>
          </div>
        </div>
        {entry.description && <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 10px' }}>{entry.description}</p>}
        {row('Version', entry.version || '—')}
        {entry.buildDate && row('Build', entry.buildDate)}
        {row('App ID', <code style={{ fontSize: 12 }}>{entry.id}</code>)}
        {entry.shortcut && row('Shortcut', entry.shortcut)}
        {row('Status', running ? (running.isMinimized ? 'Running (minimized)' : 'Running') : 'Not running')}
        {row('Pinned', [pinned.dock && 'Dock', pinned.menu && 'App Menu'].filter(Boolean).join(', ') || 'No')}
        {entry.actions.length > 0 && row('Quick actions', entry.actions.map(a => a.label).join(', '))}
        {entry.window && row('Window', `${entry.window.w} × ${entry.window.h}${entry.window.maximized ? ' (opens maximized)' : ''}`)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={onClose} style={{ height: 28, padding: '0 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    </div>
  );
};
