// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Feature Tree Component (Left Panel)
// ═══════════════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useViewportStore } from '../stores/viewportStore';
import { formatWeight, calcVolume, calcWeight } from '../utils/math';
import type { PrimitiveType } from '../types';

function sidebarItemStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    fontSize: 11,
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    background: active ? 'var(--color-bg-active)' : 'transparent',
    border: 'none',
    borderRadius: 0,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left' as const,
    transition: 'all 0.1s',
  };
}

const FeatureTree: React.FC = () => {
  const { project, togglePartVisibility } = useProjectStore();
  const { selectedPartId, setSelectedPartId } = useViewportStore();
  const parts = project.assembly.parts;

  // Volume/weight math per part is pure in `parts`; memoize so it doesn't
  // re-run on every render (e.g. selection/hover changes) with large assemblies.
  const totalWeight = useMemo(() => parts.reduce((sum, p) => {
    const feat = p.features[0];
    const params = (feat?.params || {}) as Record<string, number | string | boolean>;
    const vol = calcVolume((String(params.primitiveType || 'box')) as PrimitiveType, params as Record<string, number>);
    return sum + calcWeight(vol * 1e-9, p.material.density);
  }, 0), [parts]);

  return (
    <div className="dex-axl-panel-strong" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 0, boxShadow: 'none', borderRight: '1px solid var(--color-bg-hover)', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-2) 10px', fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '1px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        OUTLINER
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 6px' }}>
        {/* Assembly root */}
        <div style={{ ...sidebarItemStyle(false), fontWeight: 600, fontSize: 11, color: 'var(--color-text-primary)', padding: '6px 10px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          {project.assembly.name}
          <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--color-text-tertiary)', background: 'var(--color-bg-hover)', padding: '1px 5px', borderRadius: 2 }}>{parts.length}</span>
        </div>

        {/* Parts */}
        {parts.map(part => (
          <div key={part.id}>
            <button
              onClick={() => setSelectedPartId(part.id === selectedPartId ? null : part.id)}
              style={sidebarItemStyle(part.id === selectedPartId)}
            >
              <span
                onClick={(e) => { e.stopPropagation(); togglePartVisibility(part.id); }}
                style={{ cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}
              >
                {part.visible ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                )}
              </span>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: part.color, flexShrink: 0, opacity: part.visible ? 1 : 0.3 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: part.visible ? 1 : 0.4, textDecoration: part.visible ? 'none' : 'line-through' }}>{part.name}</span>
              <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{part.material.name.split(' ')[0]}</span>
            </button>

            {part.id === selectedPartId && part.features.map(f => (
              <div key={f.id} style={{ ...sidebarItemStyle(false), paddingLeft: 28, fontSize: 10, color: f.suppressed ? 'var(--color-text-tertiary)' : 'var(--color-text-tertiary)', textDecoration: f.suppressed ? 'line-through' : 'none', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {f.type === 'extrude' ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                ) : f.type === 'revolve' ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#BF5AF2" strokeWidth="2"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
                ) : f.type === 'chamfer' ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="2"><path d="M4 20L20 4"/><path d="M4 20h16V4"/></svg>
                ) : f.type === 'fillet' ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#30D158" strokeWidth="2"><path d="M4 20c0-8.84 7.16-16 16-16"/></svg>
                ) : f.type === 'pattern' ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2"><rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/></svg>
                ) : (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/></svg>
                )}
                {f.name}
                </span>
                <button aria-label={f.suppressed ? 'Unsuppress feature' : 'Suppress feature'} onClick={(e) => { e.stopPropagation(); useProjectStore.getState().toggleFeatureSuppression(part.id, f.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: f.suppressed ? 'var(--color-error)' : 'var(--color-text-tertiary)', fontSize: 10, lineHeight: 1 }}>
                  {f.suppressed ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>}
                </button>
              </div>
            ))}
          </div>
        ))}

        {/* Constraints */}
        {project.assembly.constraints.length > 0 && (
          <>
            <div style={{ padding: '10px 10px 4px', fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              CONSTRAINTS
            </div>
            {project.assembly.constraints.map(c => (
              <div key={c.id} style={{ ...sidebarItemStyle(false), fontSize: 10 }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={c.satisfied ? 'var(--color-success)' : 'var(--color-error)'} strokeWidth="3"><path d={c.satisfied ? 'M20 6L9 17l-5-5' : 'M18 6L6 18M6 6l12 12'}/></svg>
                {c.type} ({c.value}{project.units})
              </div>
            ))}
          </>
        )}

        {/* Measurements */}
        {project.measurements.length > 0 && (
          <>
            <div style={{ padding: '10px 10px 4px', fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" strokeWidth="2"><path d="M2 12h5l2-9 4 18 3-9h6"/></svg>
              MEASUREMENTS
            </div>
            {project.measurements.map(m => (
              <div key={m.id} style={{ ...sidebarItemStyle(false), fontSize: 10, color: 'var(--color-warning)', justifyContent: 'space-between' }}>
                <span>{m.label}</span>
                <button aria-label="Delete measurement" onClick={(e) => { e.stopPropagation(); useProjectStore.getState().removeMeasurement(m.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-text-tertiary)', fontSize: 10 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Assembly info */}
      <div style={{ padding: 'var(--space-2) 10px', borderTop: '1px solid var(--color-border-subtle)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
        Parts: {parts.length} | Weight: {formatWeight(totalWeight)} | {project.assembly.constraints.length} constraints
      </div>
    </div>
  );
};

export default FeatureTree;
