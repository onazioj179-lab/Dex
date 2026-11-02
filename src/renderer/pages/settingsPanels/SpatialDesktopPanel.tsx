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

import React from 'react';
import { useSpatialStore } from '../../store/spatialStore';

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
      position: 'absolute', top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: 9999, background: '#FFFFFF',
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
            interactive. Your normal window layout comes back when you turn it off.
          </div>
        </div>
        <Switch on={enabled} label="Spatial desktop" onChange={(v) => window.dispatchEvent(new CustomEvent('dex-spatial-toggle', { detail: { enabled: v } }))} />
      </div>
      <div style={row}>
        <div>
          <div style={label}>Minimap</div>
          <div style={desc}>Show an overview of the canvas in the corner ({mod}+M).</div>
        </div>
        <Switch on={minimap} label="Minimap" onChange={() => useSpatialStore.getState().toggleMinimap()} />
      </div>
      <div style={{ ...row, borderBottom: 'none' }}>
        <div>
          <div style={label}>Snap to grid</div>
          <div style={desc}>Drop windows on a 20 px grid on the canvas.</div>
        </div>
        <Switch on={snapGrid} label="Snap to grid" onChange={(v) => useSpatialStore.getState().setSnapGrid(v)} />
      </div>
    </div>
  );
};

export default SpatialDesktopPanel;
