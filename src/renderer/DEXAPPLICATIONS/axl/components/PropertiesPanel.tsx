// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Properties Panel (Right Panel)
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback, useMemo } from 'react';
import type { Vec3, Transform, ConstraintType, Parameter } from '../types';
import { MATERIAL_DB } from '../constants';
import { useProjectStore } from '../stores/projectStore';
import { useViewportStore } from '../stores/viewportStore';
import { useUIStore, type PanelTab } from '../stores/uiStore';
import { evaluateExpression, resolveParameters, type ParamScope } from '../utils/exprEval';
import DesignTokensPanel from './DesignTokensPanel';

// ─── Expression-capable numeric input ────────────────────────────────────────
// Accepts a plain number OR a parametric expression ("width * 2", "sqrt(r)").
// Commits on Enter/blur; Escape reverts. Invalid input surfaces via onError
// and leaves the committed value untouched.
const ExprInput: React.FC<{
  value: number;
  scope: ParamScope;
  onCommit: (n: number) => void;
  onError: (msg: string) => void;
  style?: React.CSSProperties;
  ariaLabel?: string;
}> = ({ value, scope, onCommit, onError, style, ariaLabel }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const raw = draft.trim();
    setDraft(null);
    if (!raw) return;
    const n = Number(raw);
    if (Number.isFinite(n)) { if (n !== value) onCommit(n); return; }
    try {
      onCommit(evaluateExpression(raw, scope));
    } catch (err) {
      onError((err as Error).message);
    }
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      title='Number or expression, e.g. "width * 2"'
      value={draft ?? String(Math.round(value * 1000) / 1000)}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => { setDraft(String(value)); e.currentTarget.select(); }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      style={style}
    />
  );
};

// One parameter row: shows the expression (or plain value) as editable text;
// committing re-resolves the WHOLE table so chained references stay live.
const ParamRowInput: React.FC<{
  parameter: Parameter;
  all: Parameter[];
  apply: (next: Parameter[]) => boolean;
}> = ({ parameter, all, apply }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = parameter.expression ?? String(parameter.value);
  const commit = () => {
    if (draft === null) return;
    const raw = draft.trim();
    setDraft(null);
    if (!raw || raw === shown) return;
    const numeric = Number(raw);
    const entry: Parameter = Number.isFinite(numeric)
      ? { ...parameter, value: numeric, expression: undefined }
      : { ...parameter, expression: raw };
    apply(all.map(p => (p.name === parameter.name ? entry : p)));
  };
  return (
    <input
      type="text"
      aria-label={`Parameter ${parameter.name} expression`}
      value={draft ?? shown}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setDraft(null); }}
      style={{ flex: 1, minWidth: 0, background: 'var(--color-bg-inset, rgba(0,0,0,0.3))', border: '1px solid var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 9, padding: '3px 5px', outline: 'none' }}
    />
  );
};

const ParamAddRow: React.FC<{
  existing: Parameter[];
  apply: (next: Parameter[]) => boolean;
  showToast: (msg: string) => void;
}> = ({ existing, apply, showToast }) => {
  const [name, setName] = useState('');
  const [expr, setExpr] = useState('');
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)) { showToast('Name must be letters/digits/underscore, not starting with a digit'); return; }
    if (n === 'pi') { showToast('"pi" is a built-in constant'); return; }
    const raw = expr.trim();
    const numeric = Number(raw);
    const entry: Parameter = Number.isFinite(numeric) && raw !== ''
      ? { name: n, value: numeric }
      : { name: n, value: 0, expression: raw || '0' };
    if (apply([...existing.filter(p => p.name !== n), entry])) { setName(''); setExpr(''); }
  };
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
      <input
        type="text" placeholder="name" aria-label="New parameter name"
        value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add(); }}
        style={{ width: 64, background: 'var(--color-bg-inset, rgba(0,0,0,0.3))', border: '1px solid var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 9, padding: '3px 5px', outline: 'none' }}
      />
      <input
        type="text" placeholder="value or expression" aria-label="New parameter value or expression"
        value={expr} onChange={e => setExpr(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add(); }}
        style={{ flex: 1, minWidth: 0, background: 'var(--color-bg-inset, rgba(0,0,0,0.3))', border: '1px solid var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 9, padding: '3px 5px', outline: 'none' }}
      />
      <button onClick={add} disabled={!name.trim()} aria-label="Add parameter"
        style={{ fontSize: 9, fontWeight: 600, padding: '3px 8px', background: name.trim() ? 'var(--color-accent-light)' : 'var(--color-border-subtle)', color: name.trim() ? 'var(--color-accent)' : 'var(--color-text-tertiary)', border: '1px solid var(--color-accent-muted)', borderRadius: 9999, cursor: name.trim() ? 'pointer' : 'default' }}>
        Add
      </button>
    </div>
  );
};

const PropertiesPanel: React.FC = () => {
  const { project, pushUndo, setPartMaterial, updatePartTransform, duplicatePart, deletePart, togglePartVisibility, addConstraint, solveConstraints, setParameter, removeParameter } = useProjectStore();
  const { selectedPartId, setSelectedPartId } = useViewportStore();
  const { panelTab, setPanelTab, showToast } = useUIStore();

  // Parameter scope for expression inputs (resolved values by name)
  const paramScope = useMemo<ParamScope>(() => {
    const scope: ParamScope = {};
    project.parameters.forEach(p => { scope[p.name] = p.value; });
    return scope;
  }, [project.parameters]);

  // Re-resolve the whole parameter table (expressions may chain); on error
  // nothing is written and the message is surfaced.
  const applyParameters = useCallback((next: Parameter[]): boolean => {
    try {
      const resolved = resolveParameters(next);
      resolved.forEach(p => setParameter(p.name, p.value, p.expression));
      return true;
    } catch (err) {
      showToast(`Parameter error: ${(err as Error).message}`);
      return false;
    }
  }, [setParameter, showToast]);

  // Design Tokens tab lives in local state so it stays additive — no change to
  // the shared PanelTab type or the UI store. When active it overrides the
  // store-driven tab content below.
  const [tokensActive, setTokensActive] = useState(false);

  const selectedPart = project.assembly.parts.find(p => p.id === selectedPartId) || null;
  const parts = project.assembly.parts;

  // Constraint creation state
  const [constraintType, setConstraintType] = useState<ConstraintType>('coincident');
  const [constraintPartB, setConstraintPartB] = useState<string>('');
  const [constraintValue, setConstraintValue] = useState(0);

  const handleAddConstraint = useCallback(() => {
    if (!selectedPartId || !constraintPartB) return;
    // addConstraint runs the solver internally; surface the result so the user
    // knows whether parts snapped or the constraint set is over-defined.
    addConstraint(constraintType, selectedPartId, constraintPartB, constraintValue);
    const res = solveConstraints();
    showToast(res.unsatisfied > 0
      ? `${constraintType} added -- ${res.unsatisfied} unsatisfied`
      : res.moved > 0 ? `${constraintType} solved -- ${res.moved} part(s) moved` : `${constraintType} constraint added`);
  }, [selectedPartId, constraintPartB, constraintType, constraintValue, addConstraint, solveConstraints, showToast]);

  return (
    <div className="dex-axl-panel-strong" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 0, boxShadow: 'none', borderLeft: '1px solid var(--color-bg-hover)', overflow: 'hidden' }}>
      {/* Panel tabs - Blender N-panel style */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset, rgba(0,0,0,0.15))' }}>
        {(['properties', 'material', 'constraints'] as PanelTab[]).map(tab => {
          const active = !tokensActive && panelTab === tab;
          return (
          <button key={tab} onClick={() => { setTokensActive(false); setPanelTab(tab); }}
            style={{ flex: 1, padding: 'var(--space-2) 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)', background: active ? 'var(--color-accent-soft)' : 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.12s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {tab === 'properties' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}
            {tab === 'material' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r="2.5"/><path d="M17.08 8.94a10.68 10.68 0 0 0-.94 2.06c-.47 1.58-.79 3.27-.79 5 0 3.31 2.69 6 6 6"/><path d="M7.08 16a10.68 10.68 0 0 0-.94 2.06C5.67 19.64 5.35 21.33 5.35 23"/><circle cx="7.5" cy="10.5" r="2.5"/></svg>}
            {tab === 'constraints' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
            {tab.toUpperCase()}
          </button>
          );
        })}
        <button key="tokens" onClick={() => setTokensActive(true)}
          style={{ flex: 1, padding: 'var(--space-2) 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', color: tokensActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)', background: tokensActive ? 'var(--color-accent-soft)' : 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: tokensActive ? '2px solid var(--color-accent)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.12s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2a10 10 0 0 0 0 20 1.5 1.5 0 0 0 1.06-2.56A1.5 1.5 0 0 1 14.5 17H16a4 4 0 0 0 4-4 10 10 0 0 0-8-11z"/></svg>
          TOKENS
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-2) 10px' }}>
        {/* Design Tokens tab (local-state override) */}
        {tokensActive && <DesignTokensPanel />}

        {/* Properties tab */}
        {!tokensActive && panelTab === 'properties' && selectedPart && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: selectedPart.color }} />
              {selectedPart.name}
            </div>

            {(['position', 'rotation', 'scale'] as (keyof Transform)[]).map(key => (
              <div key={key} style={{ background: 'var(--color-border-subtle)', borderRadius: 10, padding: '6px var(--space-2)' }}>
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
                      <ExprInput
                        value={selectedPart.transform[key][axis]}
                        scope={paramScope}
                        ariaLabel={`${selectedPart.name} ${key} ${axis}`}
                        onCommit={n => { pushUndo(); updatePartTransform(selectedPart.id, key, axis, n); }}
                        onError={msg => showToast(msg)}
                        style={{ width: '100%', background: 'var(--color-bg-inset, rgba(0,0,0,0.3))', border: '1px solid', borderColor: axis === 'x' ? 'rgba(255,69,58,0.25)' : axis === 'y' ? 'rgba(48,209,88,0.25)' : 'rgba(10,132,255,0.25)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 10, padding: '4px 5px', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ padding: 'var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: 10 }}>
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
              <button onClick={() => duplicatePart(selectedPart.id)} style={{ flex: 1, fontSize: 9, padding: '5px var(--space-2)', background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: 9999, color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Duplicate
              </button>
              <button onClick={() => { deletePart(selectedPart.id); setSelectedPartId(null); }} style={{ flex: 1, fontSize: 9, padding: '5px var(--space-2)', background: 'var(--color-error-muted, rgba(255,68,58,0.08))', border: '1px solid var(--color-error-muted, rgba(255,68,58,0.15))', borderRadius: 9999, color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            </div>
            <button onClick={() => togglePartVisibility(selectedPart.id)}
              style={{ fontSize: 9, padding: '5px var(--space-2)', background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: 9999, color: selectedPart.visible ? 'var(--color-text-primary)' : 'var(--color-warning)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {selectedPart.visible ? (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              )}
              {selectedPart.visible ? 'Hide' : 'Show'}
            </button>
          </div>
        )}

        {!tokensActive && panelTab === 'properties' && !selectedPart && (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: 'var(--space-5) 0', textAlign: 'center' }}>
            Select a part to view properties
          </div>
        )}

        {/* Parameters — project-global parametric table. Any transform input
            above can reference these by name ("width * 2"); expressions may
            chain and resolve as a table (circular refs are rejected). */}
        {!tokensActive && panelTab === 'properties' && (
          <div style={{ marginTop: 10, padding: 'var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: 10 }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, marginBottom: 5, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
              PARAMETERS
            </div>
            {project.parameters.length === 0 && (
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
                Define named values ("width", "bolt_d") and drive dimensions with expressions.
              </div>
            )}
            {project.parameters.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-secondary)', width: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</span>
                <ParamRowInput parameter={p} all={project.parameters} apply={applyParameters} />
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(p.value)}>
                  {p.expression ? `= ${Math.round(p.value * 1000) / 1000}` : ''}
                </span>
                <button onClick={() => removeParameter(p.name)} aria-label={`Delete parameter ${p.name}`}
                  style={{ width: 16, height: 16, padding: 0, background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 10, lineHeight: 1 }}>
                  ×
                </button>
              </div>
            ))}
            <ParamAddRow existing={project.parameters} apply={applyParameters} showToast={showToast} />
          </div>
        )}

        {/* Material tab */}
        {!tokensActive && panelTab === 'material' && selectedPart && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>MATERIAL LIBRARY</div>
            {MATERIAL_DB.map(mat => (
              <button key={mat.id} onClick={() => setPartMaterial(selectedPart.id, mat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px var(--space-2)', fontSize: 10,
                  background: selectedPart.material.id === mat.id ? 'var(--color-accent-light)' : 'transparent',
                  border: selectedPart.material.id === mat.id ? '1px solid var(--color-accent-muted)' : '1px solid transparent',
                  borderRadius: 10, cursor: 'pointer', color: 'var(--color-text-primary)', width: '100%', textAlign: 'left' as const,
                }}>
                <div style={{ width: 14, height: 14, borderRadius: 2, background: mat.color, border: '1px solid var(--color-border)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{mat.name}</div>
                  <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{mat.density} kg/m&sup3; | {mat.tensileStrength} MPa</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Constraints tab */}
        {!tokensActive && panelTab === 'constraints' && selectedPart && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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
              style={{ padding: '6px var(--space-3)', fontSize: 10, fontWeight: 600, background: !constraintPartB ? 'var(--color-border-subtle)' : 'var(--color-accent-light)', color: !constraintPartB ? 'var(--color-text-tertiary)' : 'var(--color-accent)', border: '1px solid var(--color-accent-muted)', borderRadius: 9999, cursor: constraintPartB ? 'pointer' : 'default', boxShadow: 'none' }}>
              Apply Constraint
            </button>

            {project.assembly.constraints.filter(c => c.partA === selectedPartId || c.partB === selectedPartId).length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)' }}>ACTIVE CONSTRAINTS</div>
                {project.assembly.constraints.filter(c => c.partA === selectedPartId || c.partB === selectedPartId).map(c => (
                  <div key={c.id} style={{ fontSize: 10, padding: '4px var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
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
