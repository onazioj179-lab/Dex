// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Settings > Window Management > Spatial desktop. Bound to the real spatial
// store; turning it on/off goes through AppManager (it owns the windows).
//

import React, { useEffect, useState } from 'react';
import { useSpatialStore, SPATIAL_ACTION_LABELS, RESERVED_CODES, type SpatialAction } from '../../store/spatialStore';

/** 'KeyF' -> 'F', 'Digit0' -> '0', 'Equal' -> '='. */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const map: Record<string, string> = { Equal: '=', Minus: '-', Backspace: 'Backspace', Enter: 'Enter', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Backslash: '\\' };
  return map[code] ?? code;
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--color-border-subtle)' };
const label: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' };
const desc: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.4 };

const Switch: React.FC<{ on: boolean; label: string; onChange: (v: boolean) => void }> = ({ on, label: aria, onChange }) => (
  <button role="switch" aria-checked={on} aria-label={aria} onClick={() => onChange(!on)} style={{
    width: 44, height: 24, borderRadius: 9999, border: on ? 'none' : '1px solid var(--color-border-control)', padding: 0,
    background: on ? 'var(--color-accent)' : 'var(--color-bg-hover)', position: 'relative', cursor: 'pointer', flexShrink: 0,
    transition: 'background var(--duration-normal, 150ms) ease',
  }}>
    <span style={{
      position: 'absolute', top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: 9999, background: 'var(--color-accent-text)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left var(--duration-normal, 150ms) ease',
    }} />
  </button>
);

export const SpatialDesktopPanel: React.FC = () => {
  const enabled = useSpatialStore((s) => s.enabled);
  const minimap = useSpatialStore((s) => s.minimap);
  const snapGrid = useSpatialStore((s) => s.snapGrid);
  const mod = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? 'Cmd+Opt' : 'Ctrl+Alt';
  return (
    <div>
      <div style={row}>
        <div>
          <div style={label}>Spatial desktop</div>
          <div style={desc}>
            Arrange windows freely on an infinite canvas you can pan and zoom ({mod}+S). Apps stay live and
            interactive. Right-click or long-press the desktop for zoom, arrange and window options. Your normal
            window layout comes back when you turn it off.
          </div>
        </div>
        <Switch on={enabled} label="Spatial desktop" onChange={(v) => window.dispatchEvent(new CustomEvent('dex-spatial-toggle', { detail: { enabled: v } }))} />
      </div>
      <div style={row}>
        <div>
          <div style={label}>Minimap</div>
          <div style={desc}>Show an overview of the canvas in the top-right corner ({mod}+M). Click or drag on it to move the view.</div>
        </div>
        <Switch on={minimap} label="Minimap" onChange={() => useSpatialStore.getState().toggleMinimap()} />
      </div>
      <div style={row}>
        <div>
          <div style={label}>Snap to grid</div>
          <div style={desc}>Drop windows on a 20 px grid on the canvas. Windows also snap to each other's edges, with guides.</div>
        </div>
        <Switch on={snapGrid} label="Snap to grid" onChange={(v) => useSpatialStore.getState().setSnapGrid(v)} />
      </div>
      <ShortcutEditor mod={mod} />
    </div>
  );
};


const ShortcutEditor: React.FC<{ mod: string }> = ({ mod }) => {
  const bindings = useSpatialStore((s) => s.bindings);
  const [capturing, setCapturing] = useState<SpatialAction | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { setCapturing(null); return; }
      if (['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return;
      if (RESERVED_CODES.has(e.code)) { setNote(`${mod}+${keyLabel(e.code)} is already used by DEX. Pick another key.`); return; }
      useSpatialStore.getState().setBinding(capturing, e.code);
      setNote(null);
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, mod]);
  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={label}>Spatial shortcuts</div>
          <div style={desc}>Pressed with {mod}. Arrow keys always pan.</div>
        </div>
        <button onClick={() => { useSpatialStore.getState().resetBindings(); setNote(null); }} style={{ height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border-control)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer' }}>Reset</button>
      </div>
      <div role="list" style={{ marginTop: 8 }}>
        {(Object.keys(SPATIAL_ACTION_LABELS) as SpatialAction[]).map((a) => (
          <div role="listitem" key={a} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{SPATIAL_ACTION_LABELS[a]}</span>
            <button onClick={() => { setCapturing(capturing === a ? null : a); setNote(null); }} aria-label={`Change shortcut for ${SPATIAL_ACTION_LABELS[a]}, currently ${mod}+${keyLabel(bindings[a])}`}
              style={{ minWidth: 120, height: 26, padding: '0 10px', borderRadius: 'var(--radius-sm, 6px)', fontSize: 12, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
                border: `1px solid ${capturing === a ? 'var(--color-accent)' : 'var(--color-border-control)'}`,
                background: capturing === a ? 'var(--color-accent-light)' : 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}>
              {capturing === a ? 'Press a key…' : `${mod}+${keyLabel(bindings[a])}`}
            </button>
          </div>
        ))}
      </div>
      {note && <div role="alert" style={{ fontSize: 12, color: 'var(--color-warning)', marginTop: 6 }}>{note}</div>}
    </div>
  );
};

export default SpatialDesktopPanel;
