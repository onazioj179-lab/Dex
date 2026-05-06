// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Properties Panel (Right Panel)
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import type { Vec3, Transform, ConstraintType } from '../types';
import { MATERIAL_DB } from '../constants';
import { useProjectStore } from '../stores/projectStore';
import { useViewportStore } from '../stores/viewportStore';
import { useUIStore, type PanelTab } from '../stores/uiStore';

const PropertiesPanel: React.FC = () => {
  const { project, pushUndo, setPartMaterial, updatePartTransform, duplicatePart, deletePart, togglePartVisibility, addConstraint } = useProjectStore();
  const { selectedPartId, setSelectedPartId } = useViewportStore();
  const { panelTab, setPanelTab } = useUIStore();

  const selectedPart = project.assembly.parts.find(p => p.id === selectedPartId) || null;
  const parts = project.assembly.parts;

  // Constraint creation state
  const [constraintType, setConstraintType] = useState<ConstraintType>('coincident');
  const [constraintPartB, setConstraintPartB] = useState<string>('');
  const [constraintValue, setConstraintValue] = useState(0);

  const handleAddConstraint = useCallback(() => {
    if (!selectedPartId || !constraintPartB) return;
    addConstraint(constraintType, selectedPartId, constraintPartB, constraintValue);
  }, [selectedPartId, constraintPartB, constraintType, constraintValue, addConstraint]);

  return (
    <div style={{ width: 240, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #1e1e22 0%, #1a1a1e 100%)', borderLeft: '1px solid var(--color-bg-hover)', overflow: 'hidden' }}>
      {/* Panel tabs - Blender N-panel style */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', background: 'rgba(0,0,0,0.15)' }}>
        {(['properties', 'material', 'constraints'] as PanelTab[]).map(tab => (
          <button key={tab} onClick={() => setPanelTab(tab)}
            style={{ flex: 1, padding: '8px 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', color: panelTab === tab ? 'var(--color-accent)' : 'var(--color-text-tertiary)', background: panelTab === tab ? 'rgba(10,132,255,0.08)' : 'transparent', border: 'none', borderBottom: panelTab === tab ? '2px solid #0A84FF' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.12s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {tab === 'properties' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}
            {tab === 'material' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r="2.5"/><path d="M17.08 8.94a10.68 10.68 0 0 0-.94 2.06c-.47 1.58-.79 3.27-.79 5 0 3.31 2.69 6 6 6"/><path d="M7.08 16a10.68 10.68 0 0 0-.94 2.06C5.67 19.64 5.35 21.33 5.35 23"/><circle cx="7.5" cy="10.5" r="2.5"/></svg>}
            {tab === 'constraints' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {/* Properties tab */}
        {panelTab === 'properties' && selectedPart && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: selectedPart.color }} />
              {selectedPart.name}
            </div>

            {(['position', 'rotation', 'scale'] as (keyof Transform)[]).map(key => (
              <div key={key} style={{ background: 'var(--color-border-subtle)', borderRadius: 6, padding: '6px 8px', border: '1px solid var(--color-border-subtle)' }}>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, marginBottom: 5, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {key === 'position' && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>}
                  {key === 'rotation' && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>}
                  {key === 'scale' && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>}
                  {key.toUpperCase()}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['x', 'y', 'z'] as (keyof Vec3)[]).map(axis => (
                    <label key={axis} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 8, color: axis === 'x' ? 'var(--color-error)' : axis === 'y' ? 'var(--color-success)' : 'var(--color-accent)', fontWeight: 700 }}>{axis.toUpperCase()}</span>
                      <input
                        type="number"
                        value={selectedPart.transform[key][axis]}
                        onChange={e => { pushUndo(); updatePartTransform(selectedPart.id, key, axis, Number(e.target.value)); }}
                        step={key === 'rotation' ? 5 : key === 'scale' ? 0.1 : project.gridSnap}
                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid', borderColor: axis === 'x' ? 'rgba(255,69,58,0.25)' : axis === 'y' ? 'rgba(48,209,88,0.25)' : 'rgba(10,132,255,0.25)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 10, padding: '4px 5px', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ padding: '8px', background: 'var(--color-border-subtle)', borderRadius: 6, border: '1px solid var(--color-border-subtle)' }}>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, marginBottom: 5, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                OBJECT DATA
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Material</span><span style={{ color: 'var(--color-text-primary)' }}>{selectedPart.material.name}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Density</span><span style={{ color: 'var(--color-text-primary)' }}>{selectedPart.material.density} kg/m&sup3;</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tensile</span><span style={{ color: 'var(--color-text-primary)' }}>{selectedPart.material.tensileStrength} MPa</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Features</span><span style={{ color: 'var(--color-text-primary)' }}>{selectedPart.features.length}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Vertices</span><span style={{ color: 'var(--color-text-primary)' }}>~{selectedPart.meshVertexCount}</span></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => duplicatePart(selectedPart.id)} style={{ flex: 1, fontSize: 9, padding: '5px 8px', background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: 5, color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Duplicate
              </button>
              <button onClick={() => { deletePart(selectedPart.id); setSelectedPartId(null); }} style={{ flex: 1, fontSize: 9, padding: '5px 8px', background: 'rgba(255,68,58,0.08)', border: '1px solid rgba(255,68,58,0.15)', borderRadius: 5, color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            </div>
            <button onClick={() => togglePartVisibility(selectedPart.id)}
              style={{ fontSize: 9, padding: '5px 8px', background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: 5, color: selectedPart.visible ? 'var(--color-text-primary)' : 'var(--color-warning)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {selectedPart.visible ? (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              )}
              {selectedPart.visible ? 'Hide' : 'Show'}
            </button>
          </div>
        )}

        {panelTab === 'properties' && !selectedPart && (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '20px 0', textAlign: 'center' }}>
            Select a part to view properties
          </div>
        )}

        {/* Material tab */}
        {panelTab === 'material' && selectedPart && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>MATERIAL LIBRARY</div>
            {MATERIAL_DB.map(mat => (
              <button key={mat.id} onClick={() => setPartMaterial(selectedPart.id, mat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: 10,
                  background: selectedPart.material.id === mat.id ? 'rgba(10,132,255,0.15)' : 'transparent',
                  border: selectedPart.material.id === mat.id ? '1px solid rgba(10,132,255,0.3)' : '1px solid transparent',
                  borderRadius: 6, cursor: 'pointer', color: 'var(--color-text-primary)', width: '100%', textAlign: 'left' as const,
                }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: mat.color, border: '1px solid var(--color-border)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{mat.name}</div>
                  <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{mat.density} kg/m\u00B3 | {mat.tensileStrength} MPa</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Constraints tab */}
        {panelTab === 'constraints' && selectedPart && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>ADD CONSTRAINT</div>
            <select value={constraintType} onChange={e => setConstraintType(e.target.value as ConstraintType)}
              style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 10, padding: '4px 6px', outline: 'none' }}>
              {(['coincident', 'concentric', 'distance', 'parallel', 'perpendicular', 'tangent', 'angle', 'fixed'] as ConstraintType[]).map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
            <select value={constraintPartB} onChange={e => setConstraintPartB(e.target.value)}
              style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 10, padding: '4px 6px', outline: 'none' }}>
              <option value="">Select part B...</option>
              {parts.filter(p => p.id !== selectedPartId).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {(constraintType === 'distance' || constraintType === 'angle') && (
              <input type="number" value={constraintValue} onChange={e => setConstraintValue(Number(e.target.value))}
                placeholder={constraintType === 'angle' ? 'Angle (deg)' : 'Distance'}
                style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 10, padding: '4px 6px', outline: 'none' }} />
            )}
            <button onClick={handleAddConstraint} disabled={!constraintPartB}
              style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, background: !constraintPartB ? 'var(--color-border-subtle)' : 'rgba(10,132,255,0.2)', color: !constraintPartB ? 'var(--color-text-tertiary)' : 'var(--color-accent)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: 6, cursor: constraintPartB ? 'pointer' : 'default' }}>
              Apply Constraint
            </button>

            {project.assembly.constraints.filter(c => c.partA === selectedPartId || c.partB === selectedPartId).length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginTop: 8 }}>ACTIVE CONSTRAINTS</div>
                {project.assembly.constraints.filter(c => c.partA === selectedPartId || c.partB === selectedPartId).map(c => (
                  <div key={c.id} style={{ fontSize: 10, padding: '4px 8px', background: 'var(--color-border-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: c.satisfied ? 'var(--color-success)' : 'var(--color-error)' }}>{c.satisfied ? '\u2713' : '\u2717'}</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{c.type}</span>
                    {c.value > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>({c.value})</span>}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertiesPanel;
