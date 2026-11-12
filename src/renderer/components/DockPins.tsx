// =============================================================================
// DEX Platform — Dock (pinned apps in the DEX Bar)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Pinned apps stay here when closed; a dot marks the running ones. Only
// pinned apps are shown, so the bar does not grow or shift as apps open and
// close. Drag icons to reorder, drag one out of the App Menu to pin it, or
// right-click for the shared app menu.

import React, { useRef, useState } from 'react';
import DexIcon from './DexIcon';
import { APP_DEFINITIONS, useRunningApps } from '../store/runningApps';
import { appPinning, useDockAppIds } from '../services/appPinning';
import { openAppContextMenu, sendAppCommand } from './AppContextMenu';
import { DEX_APP_DRAG_TYPE } from './AppMenuPanel';

const SIZE = 30;

export const DockPins: React.FC<{ maxWidth?: number }> = ({ maxWidth = 360 }) => {
  const ids = useDockAppIds();
  const running = useRunningApps(s => s.runningApps);
  const current = useRunningApps(s => s.currentAppId);
  const [over, setOver] = useState<string | 'end' | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const isDexDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DEX_APP_DRAG_TYPE);
  const drop = (e: React.DragEvent, beforeId: string | null) => {
    if (!isDexDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    setDragging(null);
    const id = e.dataTransfer.getData(DEX_APP_DRAG_TYPE);
    if (!id || id === beforeId) return;
    const wasPinned = appPinning.isPinned('dock', id);
    appPinning.place('dock', id, beforeId);
    if (!wasPinned) window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: `Pinned ${APP_DEFINITIONS[id]?.name ?? id} to the Dock` } }));
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-dock-app]'));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const id = btns[i].dataset.dockApp!;
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const to = i + (e.key === 'ArrowLeft' ? -1 : 2);
      appPinning.place('dock', id, to >= 0 && to < ids.length ? ids[to] : (e.key === 'ArrowLeft' ? ids[0] : null));
      requestAnimationFrame(() => stripRef.current?.querySelector<HTMLButtonElement>(`button[data-dock-app="${id}"]`)?.focus());
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); btns[Math.min(i + 1, btns.length - 1)]?.focus(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); btns[Math.max(i - 1, 0)]?.focus(); }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = btns[i].getBoundingClientRect();
      openAppContextMenu({ appId: id, x: r.left, y: r.top - 8, source: 'dock' });
    }
  };

  if (!ids.length) {
    // Still a drop target, so an app can be pinned by dragging it here.
    return (
      <div
        role="list"
        aria-label="Dock (empty)"
        onPointerDown={e => e.stopPropagation()}
        onDragOver={e => { if (isDexDrag(e)) { e.preventDefault(); setOver('end'); } }}
        onDragLeave={() => setOver(null)}
        onDrop={e => drop(e, null)}
        title="Drag an app here to pin it"
        style={{ width: over ? 40 : 6, height: SIZE, borderRadius: 10, transition: 'width 0.12s ease', background: over ? 'var(--color-accent-soft, rgba(10,132,255,0.08))' : 'transparent', flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      ref={stripRef}
      role="toolbar"
      aria-label="Dock"
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={onKey}
      onDragOver={e => { if (isDexDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = dragging ? 'move' : 'copy'; } }}
      onDrop={e => drop(e, null)}
      style={{ display: 'flex', alignItems: 'center', gap: 2, maxWidth, overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 1, minWidth: 0, padding: '0 2px' }}
    >
      {ids.map((id, i) => {
        const def = APP_DEFINITIONS[id];
        const run = running.find(a => a.id === id);
        const isCurrent = current === id && !!run && !run.isMinimized;
        const label = `${def?.name ?? id}${run ? (run.isMinimized ? ', minimized' : ', running') : ''}`;
        return (
          <button
            key={id}
            type="button"
            data-dock-app={id}
            draggable
            tabIndex={i === 0 ? 0 : -1}
            aria-label={label}
            aria-pressed={isCurrent}
            title={def?.name ?? id}
            onClick={() => sendAppCommand(id, run ? 'front' : 'open')}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openAppContextMenu({ appId: id, x: e.clientX, y: e.clientY, source: 'dock' }); }}
            onDragStart={e => { e.dataTransfer.setData(DEX_APP_DRAG_TYPE, id); e.dataTransfer.effectAllowed = 'move'; setDragging(id); }}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            onDragOver={e => { if (isDexDrag(e)) { e.preventDefault(); e.stopPropagation(); setOver(id); } }}
            onDrop={e => drop(e, id)}
            onFocus={e => { e.currentTarget.tabIndex = 0; }}
            style={{
              position: 'relative', width: SIZE, height: SIZE, flexShrink: 0, borderRadius: 10, padding: 0,
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isCurrent ? 'var(--color-bg-hover, #1e1e22)' : 'transparent',
              color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              opacity: dragging === id ? 0.4 : 1,
              boxShadow: over === id && dragging !== id ? 'inset 2px 0 0 var(--color-accent)' : 'none',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover, #1e1e22)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = isCurrent ? 'var(--color-bg-hover, #1e1e22)' : 'transparent'; e.currentTarget.style.color = isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'; }}
          >
            <DexIcon name={def?.icon || id} size={17} color="currentColor" />
            {run && (
              <span aria-hidden="true" style={{
                position: 'absolute', bottom: 1, left: '50%', marginLeft: -2, width: 4, height: 4, borderRadius: '50%',
                background: isCurrent ? 'var(--color-accent)' : 'var(--color-text-secondary)', opacity: run.isMinimized ? 0.5 : 1,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
};
