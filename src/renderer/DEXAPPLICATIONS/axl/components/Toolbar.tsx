// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Toolbar Component
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback } from 'react';
import type { ToolMode } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { useViewportStore } from '../stores/viewportStore';
import { useUIStore } from '../stores/uiStore';

interface ToolDef {
  mode: ToolMode;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { mode: 'select', label: 'Select', shortcut: 'V', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg> },
  { mode: 'move', label: 'Move', shortcut: 'G', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg> },
  { mode: 'rotate', label: 'Rotate', shortcut: 'R', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg> },
  { mode: 'scale', label: 'Scale', shortcut: 'S', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg> },
  { mode: 'measure', label: 'Measure', shortcut: 'M', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h5l2-9 4 18 3-9h6"/></svg> },
];

function toolBtnStyle(active: boolean): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.12s',
    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    background: active ? 'rgba(10,132,255,0.2)' : 'transparent',
    boxShadow: active ? 'inset 0 -1px 0 #0A84FF' : 'none',
  };
}

interface ToolbarProps {
  onExport: (format: 'stl' | 'dxf' | 'pdf' | 'json' | 'png' | 'gltf') => void;
  onRunSimulation: () => void;
  onAddFeature: () => void;
  sendToMenu?: React.ReactNode;
}

const AXLToolbar: React.FC<ToolbarProps> = ({ onExport, onRunSimulation, onAddFeature, sendToMenu }) => {
  const { project, undo, redo, undoStack, redoStack, toggleExplodedView, generateBOM, addPrimitive } = useProjectStore();
  const { tool, setTool } = useViewportStore();
  const ui = useUIStore();

  const handleUndo = useCallback(() => { if (undoStack.length > 0) undo(); }, [undoStack, undo]);
  const handleRedo = useCallback(() => { if (redoStack.length > 0) redo(); }, [redoStack, undo]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 32, gap: 4, padding: '0 8px',
      background: 'var(--color-bg-elevated)',
      borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
      position: 'relative', zIndex: 100,
      overflowX: 'auto', overflowY: 'hidden',
    }} className="scrollbar-hidden">
      {/* Project name + mode indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 2 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.2px' }}>
          AXL
        </span>
        <span style={{ fontSize: 8, fontWeight: 500, color: 'var(--color-text-tertiary)', letterSpacing: '0.5px' }}>STUDIO</span>
      </div>

      <div style={{ width: 1, height: 14, background: 'var(--color-border-subtle)', margin: '0 2px' }} />

      {/* Undo/Redo */}
      <button onClick={handleUndo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo" style={{ ...toolBtnStyle(false), opacity: undoStack.length > 0 ? 1 : 0.4, cursor: undoStack.length > 0 ? 'pointer' : 'not-allowed', transition: 'opacity 0.15s ease' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
      </button>
      <button onClick={handleRedo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" style={{ ...toolBtnStyle(false), opacity: redoStack.length > 0 ? 1 : 0.4, cursor: redoStack.length > 0 ? 'pointer' : 'not-allowed', transition: 'opacity 0.15s ease' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
      </button>

      <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)', margin: '0 4px' }} />

      {/* Tool modes */}
      {TOOLS.map(t => (
        <button key={t.mode} onClick={() => setTool(t.mode)} title={`${t.label} (${t.shortcut})`} aria-label={t.label} aria-pressed={tool === t.mode} style={toolBtnStyle(tool === t.mode)}>
          {t.icon}
        </button>
      ))}

      <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)', margin: '0 4px' }} />

      {/* Primitives */}
      {[
        { type: 'box' as const, label: 'Box', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
        { type: 'cylinder' as const, label: 'Cylinder', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5"/></svg> },
        { type: 'sphere' as const, label: 'Sphere', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/></svg> },
        { type: 'cone' as const, label: 'Cone', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L3 20h18L12 2z"/><ellipse cx="12" cy="20" rx="9" ry="2"/></svg> },
        { type: 'torus' as const, label: 'Torus', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="4"/><path d="M12 8c2.2 0 4 1.8 4 4s-1.8 4-4 4-4-1.8-4-4 1.8-4 4-4z"/></svg> },
        { type: 'tube' as const, label: 'Tube', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><ellipse cx="12" cy="5" rx="4" ry="1.5"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/></svg> },
        { type: 'wedge' as const, label: 'Wedge', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20L22 8H2v12z"/><path d="M2 8l10-6 10 6"/></svg> },
      ].map(prim => (
        <button key={prim.type} onClick={() => addPrimitive(prim.type)} title={`Add ${prim.label}`} aria-label={`Add ${prim.label}`} style={toolBtnStyle(false)}>
          {prim.icon}
        </button>
      ))}

      <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)', margin: '0 4px' }} />

      {/* Actions */}
      <button onClick={ui.togglePartsLibrary} title="Parts Library" aria-label="Parts Library" aria-pressed={ui.showPartsLibrary} style={toolBtnStyle(ui.showPartsLibrary)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3"/></svg>
      </button>
      <button onClick={() => { generateBOM(); ui.toggleBOM(); }} title="Generate BOM" aria-label="Generate Bill of Materials" aria-pressed={ui.showBOM} style={toolBtnStyle(ui.showBOM)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
      </button>
      <button onClick={() => {
        if (!ui.showSimulation) {
          ui.toggleSimulation();
          return;
        }
        onRunSimulation();
      }} title="Simulation" aria-label="Run Simulation" aria-pressed={ui.showSimulation} style={toolBtnStyle(ui.showSimulation)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </button>
      <button onClick={toggleExplodedView} title="Exploded View (X)" aria-label="Exploded View" aria-pressed={project.assembly.exploded} style={toolBtnStyle(project.assembly.exploded)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3l5 5-5 5"/><path d="M8 3L3 8l5 5"/><path d="M12 14v7"/><path d="M12 3v4"/></svg>
      </button>

      <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)', margin: '0 4px' }} />

      {/* Export dropdown */}
      <div style={{ position: 'relative' }}>
        <button onClick={(e) => { e.stopPropagation(); ui.toggleExport(); }} title="Export" aria-label="Export" aria-expanded={ui.showExport} aria-haspopup="menu"
          style={{ ...toolBtnStyle(ui.showExport), width: 'auto', padding: '0 10px', gap: 4, display: 'flex', alignItems: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span style={{ fontSize: 10 }}>Export</span>
        </button>
        {ui.showExport && (
          <div role="menu" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--color-bg-surface-solid, #2C2C2E)', border: '1px solid var(--color-border)', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', padding: 4, minWidth: 160, zIndex: 'var(--z-modal)' }} onClick={(e) => e.stopPropagation()}>
            {(['stl', 'gltf', 'dxf', 'pdf', 'json', 'png'] as const).map(fmt => (
              <button key={fmt} onClick={() => { onExport(fmt); ui.toggleExport(); }}
                className="dex-hover-bg"
                role="menuitem"
                aria-label={`Export as ${fmt.toUpperCase()}`}
                style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left', padding: '7px 10px', fontSize: 11, color: 'var(--color-text-primary)', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                <span style={{ flex: 1 }}>{fmt.toUpperCase()}</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{fmt === 'stl' ? '3D Print' : fmt === 'gltf' ? 'PBR/Web3D' : fmt === 'dxf' ? 'CNC/CAD' : fmt === 'pdf' ? 'Drawing' : fmt === 'json' ? 'Project' : 'Image'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sendToMenu}

      <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)', margin: '0 4px' }} />

      {/* Feature */}
      <button onClick={(e) => {
        e.stopPropagation();
        if (!ui.showFeatureCreate) {
          ui.toggleFeatureCreate();
          return;
        }
        onAddFeature();
      }} title="Add Feature" aria-label="Add Feature" aria-expanded={ui.showFeatureCreate}
        style={{ ...toolBtnStyle(ui.showFeatureCreate), width: 'auto', padding: '0 10px', gap: 4, display: 'flex', alignItems: 'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
        <span style={{ fontSize: 10 }}>Feature</span>
      </button>

      {/* GD&T */}
      <button onClick={ui.toggleGDTCreate} title="GD&T Annotation" aria-label="GD&T Annotation" aria-pressed={ui.showGDTCreate}
        style={{ ...toolBtnStyle(ui.showGDTCreate), width: 'auto', padding: '0 10px', gap: 4, display: 'flex', alignItems: 'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
        <span style={{ fontSize: 10 }}>GD&T</span>
      </button>

      {/* Constraints */}
      <button onClick={ui.toggleConstraintPanel} title="Assembly Constraints" aria-label="Assembly Constraints" aria-pressed={ui.showConstraintPanel}
        style={{ ...toolBtnStyle(ui.showConstraintPanel), width: 'auto', padding: '0 10px', gap: 4, display: 'flex', alignItems: 'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
        <span style={{ fontSize: 10 }}>Constrain</span>
      </button>

      {/* AI */}
      <button onClick={ui.toggleAI} title="AI Design Copilot" aria-label="AI Design Copilot" aria-pressed={ui.showAI}
        style={{ ...toolBtnStyle(ui.showAI), width: 'auto', padding: '0 10px', gap: 4, display: 'flex', alignItems: 'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M16 14H8a4 4 0 0 0-4 4v2h16v-2a4 4 0 0 0-4-4z"/></svg>
        <span style={{ fontSize: 10 }}>AI</span>
      </button>
    </div>
  );
};

export default AXLToolbar;
