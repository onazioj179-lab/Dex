// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Toolbar — icon-first, tools grouped into dropdown menus
//
// The strip carries only the core transform tools as bare icons; everything
// else (primitives, modeling features, analysis, export) is collapsed into a
// few grouped flyout menus so the toolbar reads like a real CAD tool instead of
// a wall of labelled buttons. No visual `title` tooltips — labels live inside
// the menus where they belong.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ToolMode, PrimitiveType } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { useViewportStore } from '../stores/viewportStore';
import { useUIStore } from '../stores/uiStore';
import { IconButton } from '../../../components/controls';

// ── Shared icon set ────────────────────────────────────────────────────────
const CARET = <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg>;

const TOOLS: { mode: ToolMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'select', label: 'Select', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg> },
  { mode: 'move', label: 'Move', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></svg> },
  { mode: 'rotate', label: 'Rotate', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6" /><path d="M21.34 15.57a10 10 0 1 1-.57-8.38" /></svg> },
  { mode: 'scale', label: 'Scale', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /></svg> },
  { mode: 'measure', label: 'Measure', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h5l2-9 4 18 3-9h6" /></svg> },
];

const PRIMITIVES: { type: PrimitiveType; label: string; icon: React.ReactNode }[] = [
  { type: 'box', label: 'Box', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg> },
  { type: 'cylinder', label: 'Cylinder', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5" /></svg> },
  { type: 'sphere', label: 'Sphere', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" /></svg> },
  { type: 'cone', label: 'Cone', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L3 20h18L12 2z" /><ellipse cx="12" cy="20" rx="9" ry="2" /></svg> },
  { type: 'torus', label: 'Torus', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="4" /><path d="M12 8c2.2 0 4 1.8 4 4s-1.8 4-4 4-4-1.8-4-4 1.8-4 4-4z" /></svg> },
  { type: 'tube', label: 'Tube', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="8" ry="3" /><ellipse cx="12" cy="5" rx="4" ry="1.5" /><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /></svg> },
  { type: 'wedge', label: 'Wedge', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20L22 8H2v12z" /><path d="M2 8l10-6 10 6" /></svg> },
];

const Divider = () => <div style={{ width: 1, height: 16, background: 'var(--color-border-subtle)', margin: '0 4px', flexShrink: 0 }} />;

interface ToolbarProps {
  onExport: (format: 'stl' | 'dxf' | 'pdf' | 'json' | 'png' | 'gltf') => void;
  onRunSimulation: () => void;
  onAddFeature: () => void;
  onImport?: () => void;
  sendToMenu?: React.ReactNode;
}

const AXLToolbar: React.FC<ToolbarProps> = ({ onExport, onRunSimulation, onAddFeature, onImport, sendToMenu }) => {
  const { project, undo, redo, undoStack, redoStack, toggleExplodedView, generateBOM, addPrimitive } = useProjectStore();
  const { tool, setTool } = useViewportStore();
  const ui = useUIStore();

  // Only one flyout open at a time. Menus render in a portal (below) anchored to
  // their trigger, so the toolbar's own horizontal scroll (overflow-x:auto, which
  // forces overflow-y to clip too) can't cut them off. A backdrop closes it.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; top: number } | null>(null);
  const close = useCallback(() => { setOpenMenu(null); setMenuAnchor(null); }, []);
  const toggleMenu = useCallback((id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setOpenMenu(m => {
      if (m === id) { setMenuAnchor(null); return null; }
      const r = e.currentTarget.getBoundingClientRect();
      setMenuAnchor({ left: r.left, top: r.bottom + 5 });
      return id;
    });
  }, []);

  const handleUndo = useCallback(() => { if (undoStack.length > 0) undo(); }, [undoStack, undo]);
  const handleRedo = useCallback(() => { if (redoStack.length > 0) redo(); }, [redoStack, redo]);

  // ── Reusable menu trigger (icon + caret, active-aware) ──
  const trigStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 2, height: 24, padding: '0 5px',
    borderRadius: 7, border: 'none', cursor: 'pointer', flexShrink: 0,
    background: active ? 'var(--color-accent-light)' : 'transparent',
    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    transition: 'background 0.12s, color 0.12s',
  });

  const menuPanelBase: React.CSSProperties = {
    borderRadius: 12, padding: 5, minWidth: 168, maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'min(360px, calc(100vh - 72px))', overflow: 'auto',
    boxShadow: 'var(--pg-shadow-popover)',
  };

  const itemStyle = (active = false): React.CSSProperties => ({
    display: 'flex', width: '100%', alignItems: 'center', gap: 9, textAlign: 'left',
    padding: '7px 9px', fontSize: 11, fontWeight: 500, borderRadius: 9, cursor: 'pointer',
    border: 'none', background: active ? 'var(--color-accent-light)' : 'transparent',
    color: active ? 'var(--color-accent)' : 'var(--color-text-primary)',
  });

  const MenuItem = ({ icon, label, sub, active, onClick }: { icon: React.ReactNode; label: string; sub?: string; active?: boolean; onClick: () => void }) => (
    <button role="menuitem" className="dex-hover-bg" style={itemStyle(active)} onClick={() => { onClick(); close(); }}>
      <span style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0, color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {sub && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{sub}</span>}
    </button>
  );

  const Flyout = ({ id, children }: { id: string; children: React.ReactNode }) => {
    if (openMenu !== id || !menuAnchor) return null;
    // Keep the menu on-screen (clamp against the right edge). Portaled to body so
    // the toolbar's overflow / the app container's containing block can't clip it.
    const left = Math.max(8, Math.min(menuAnchor.left, window.innerWidth - 184));
    return createPortal(
      <>
        <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)' }} />
        <div role="menu" className="dex-axl-panel-strong"
          style={{ ...menuPanelBase, position: 'fixed', top: menuAnchor.top, left, zIndex: 'var(--z-max)' }}
          onClick={e => e.stopPropagation()}>
          {children}
        </div>
      </>,
      document.body
    );
  };

  const activeTool = TOOLS.find(t => t.mode === tool);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
      height: 32, gap: 3, padding: '0 var(--space-2)',
      background: 'var(--color-bg-elevated)',
      borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
      position: 'relative', zIndex: 100,
      overflowX: 'auto', overflowY: 'visible', minWidth: 0,
    }} className="scrollbar-hidden">

      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 2, flexShrink: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.2px' }}>AXL</span>
      </div>

      <Divider />

      {/* Undo / Redo */}
      <IconButton onClick={handleUndo} disabled={undoStack.length === 0} aria-label="Undo"
        style={{ opacity: undoStack.length > 0 ? 1 : 0.4, transition: 'opacity 0.15s ease' }}
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>} />
      <IconButton onClick={handleRedo} disabled={redoStack.length === 0} aria-label="Redo"
        style={{ opacity: redoStack.length > 0 ? 1 : 0.4, transition: 'opacity 0.15s ease' }}
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" /></svg>} />

      <Divider />

      {/* Transform tools — bare icons (core, always visible) */}
      {TOOLS.map(t => (
        <IconButton key={t.mode} onClick={() => setTool(t.mode)} aria-label={t.label} active={tool === t.mode} icon={t.icon} />
      ))}

      <Divider />

      {/* Create (primitives + parts library) */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button aria-label="Create" aria-haspopup="menu" aria-expanded={openMenu === 'create'} style={trigStyle(openMenu === 'create')} onClick={(e) => toggleMenu('create', e)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><line x1="12" y1="22" x2="12" y2="12" /></svg>
          {CARET}
        </button>
        <Flyout id="create">
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', padding: '4px 8px 6px' }}>Primitives</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
            {PRIMITIVES.map(p => (
              <button key={p.type} role="menuitem" className="dex-hover-bg" aria-label={`Add ${p.label}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 4px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                onClick={() => { addPrimitive(p.type); close(); }}>
                {p.icon}
                <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{p.label}</span>
              </button>
            ))}
          </div>
          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '5px 4px' }} />
          <MenuItem active={ui.showPartsLibrary} onClick={ui.togglePartsLibrary} label="Parts Library" sub="standard"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" /></svg>} />
          <MenuItem active={ui.showSketch} onClick={ui.toggleSketch} label="New Sketch" sub="2D → 3D"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>} />
          {onImport && (
            <MenuItem onClick={onImport} label="Import Mesh" sub="OBJ/STL/STEP"
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>} />
          )}
        </Flyout>
      </div>

      {/* Modeling (feature / GD&T / constraints) */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button aria-label="Modeling" aria-haspopup="menu" aria-expanded={openMenu === 'model'} style={trigStyle(openMenu === 'model' || ui.showFeatureCreate || ui.showGDTCreate || ui.showConstraintPanel)} onClick={(e) => toggleMenu('model', e)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          {CARET}
        </button>
        <Flyout id="model">
          <MenuItem active={ui.showFeatureCreate} onClick={() => { if (!ui.showFeatureCreate) ui.toggleFeatureCreate(); else onAddFeature(); }} label="Feature" sub="extrude…"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>} />
          <MenuItem active={ui.showGDTCreate} onClick={ui.toggleGDTCreate} label="GD&T Annotation"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /></svg>} />
          <MenuItem active={ui.showConstraintPanel} onClick={ui.toggleConstraintPanel} label="Constraints"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>} />
        </Flyout>
      </div>

      {/* Analyze (simulation / inspector / BOM / exploded) */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button aria-label="Analyze" aria-haspopup="menu" aria-expanded={openMenu === 'analyze'} style={trigStyle(openMenu === 'analyze' || ui.showSimulation || ui.showInspector || ui.showBOM)} onClick={(e) => toggleMenu('analyze', e)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
          {CARET}
        </button>
        <Flyout id="analyze">
          <MenuItem active={ui.showSimulation} onClick={() => { if (!ui.showSimulation) ui.toggleSimulation(); else onRunSimulation(); }} label="Simulation" sub="FEA"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>} />
          <MenuItem active={ui.showInspector} onClick={ui.toggleInspector} label="Inspector" sub="I"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>} />
          <MenuItem active={ui.showBOM} onClick={() => { generateBOM(); ui.toggleBOM(); }} label="Bill of Materials" sub="BOM"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></svg>} />
          <MenuItem active={project.assembly.exploded} onClick={toggleExplodedView} label="Exploded View"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3l5 5-5 5" /><path d="M8 3L3 8l5 5" /><path d="M12 14v7" /><path d="M12 3v4" /></svg>} />
        </Flyout>
      </div>

      <Divider />

      {/* Export */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button aria-label="Export" aria-haspopup="menu" aria-expanded={openMenu === 'export'} style={trigStyle(openMenu === 'export')} onClick={(e) => toggleMenu('export', e)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          {CARET}
        </button>
        <Flyout id="export">
          {([
            ['stl', '3D Print'], ['gltf', 'PBR/Web3D'], ['dxf', 'CNC/CAD'],
            ['pdf', 'Drawing'], ['json', 'Project'], ['png', 'Image'],
          ] as const).map(([fmt, sub]) => (
            <MenuItem key={fmt} onClick={() => onExport(fmt)} label={fmt.toUpperCase()} sub={sub}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>} />
          ))}
        </Flyout>
      </div>

      {sendToMenu}

      <Divider />

      {/* AI copilot — bare icon */}
      <IconButton onClick={ui.toggleAI} aria-label="AI Copilot" active={ui.showAI}
        icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" /><path d="M16 14H8a4 4 0 0 0-4 4v2h16v-2a4 4 0 0 0-4-4z" /></svg>} />
    </div>
  );
};

export default AXLToolbar;
