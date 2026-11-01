// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * WorkspacePresetsPanel — visual manager for saved workspace layouts.
 *
 * Completes the "workspace memory" loop: the Command Palette saves/restores by
 * name, this panel lists them with restore / rename / delete. Opened via the
 * `dex-workspace-manage` event (Command Palette command). Restore/save geometry
 * is owned by AppManager (event-driven); this panel only manages the named set.
 *
 * Visibility: a deliberate dialog (solid panel + light scrim) — never a black
 * overlay (DEX 5.5 "zero hidden work").
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { listPresets, deletePreset, renamePreset, type WorkspacePreset } from '../shell/WorkspacePresets';
import { useStageStore, STAGE_KIND_META, STAGE_KINDS, STAGE_DEFAULT_ID, type StageKind } from '../store/stageStore';
import { openWorkflowSpace, WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../services/projectSpaces';
import { useFocusTrap } from '../utils/useFocusTrap';

// -- Project Spaces (DEX 5.6) ---------------------------------------------
// The active workspace context (a Stage with a semantic kind). Lives alongside
// saved layouts so all "workspace" management is in one dialog: switch the
// active space, retag its kind, or remove a space you no longer need.
const ProjectSpacesSection: React.FC<{ btn: React.CSSProperties }> = memo(({ btn }) => {
  const stages = useStageStore((s) => s.stages);
  const activeStageId = useStageStore((s) => s.activeStageId);
  const setActiveStage = useStageStore((s) => s.setActiveStage);
  const setKind = useStageStore((s) => s.setKind);
  const createStage = useStageStore((s) => s.createStage);
  const deleteStage = useStageStore((s) => s.deleteStage);

  const addSpace = useCallback(() => {
    const name = window.prompt('Name this project space:');
    if (name && name.trim()) setActiveStage(createStage({ name: name.trim() }));
  }, [createStage, setActiveStage]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Project Spaces</div>
        <button style={{ ...btn, borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }} onClick={addSpace}>+ New space</button>
      </div>
      {stages.map((s) => {
        const kind = (s.kind ?? 'general') as StageKind;
        const meta = STAGE_KIND_META[kind];
        const isActive = s.id === activeStageId;
        return (
          <div
            key={s.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
              padding: '10px var(--space-3)', borderRadius: 10,
              background: 'var(--color-bg-hover)',
              border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, flex: 1 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.accent, flexShrink: 0 }} aria-hidden />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}{isActive && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: 'var(--color-accent)' }}>ACTIVE</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                  {meta.label}{s.windows.length > 0 ? ` · ${s.windows.length} window${s.windows.length === 1 ? '' : 's'}` : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
              <select
                value={kind}
                onChange={(e) => setKind(s.id, e.target.value as StageKind)}
                aria-label={`Kind for ${s.name}`}
                style={{ ...btn, padding: '5px 6px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
              >
                {STAGE_KINDS.map((k) => <option key={k} value={k}>{STAGE_KIND_META[k].label}</option>)}
              </select>
              {!isActive && <button style={{ ...btn, borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }} onClick={() => setActiveStage(s.id)}>Switch</button>}
              {s.id !== STAGE_DEFAULT_ID && <button style={{ ...btn, color: 'var(--color-error, #ff453a)' }} onClick={() => deleteStage(s.id)}>Delete</button>}
            </div>
          </div>
        );
      })}
    </>
  );
});
ProjectSpacesSection.displayName = 'ProjectSpacesSection';

const WorkspacePresetsPanel: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [presets, setPresets] = useState<WorkspacePreset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const trapRef = useFocusTrap<HTMLDivElement>(visible);

  const refresh = useCallback(() => setPresets(listPresets()), []);

  useEffect(() => {
    const onOpen = () => { refresh(); setVisible(true); };
    const onChanged = () => refresh();
    window.addEventListener('dex-workspace-manage', onOpen);
    window.addEventListener('dex-workspace-presets-changed', onChanged);
    return () => {
      window.removeEventListener('dex-workspace-manage', onOpen);
      window.removeEventListener('dex-workspace-presets-changed', onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setVisible(false); setEditingId(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  const restore = useCallback((id: string) => {
    window.dispatchEvent(new CustomEvent('dex-workspace-restore', { detail: { id } }));
    setVisible(false);
  }, []);

  const applyTemplate = useCallback((t: WorkflowTemplate) => {
    // Starter layouts now open as real, kind-tagged Project Spaces (the single
    // workflow-template source), not ephemeral tiled windows.
    openWorkflowSpace(t.id);
    setVisible(false);
  }, []);

  const remove = useCallback((id: string) => {
    deletePreset(id);
    refresh();
    window.dispatchEvent(new CustomEvent('dex-workspace-presets-changed'));
  }, [refresh]);

  const startRename = useCallback((p: WorkspacePreset) => {
    setEditingId(p.id);
    setEditName(p.name);
  }, []);

  const commitRename = useCallback((id: string) => {
    if (editName.trim()) {
      renamePreset(id, editName.trim());
      window.dispatchEvent(new CustomEvent('dex-workspace-presets-changed'));
    }
    setEditingId(null);
    refresh();
  }, [editName, refresh]);

  if (!visible) return null;

  const btn: React.CSSProperties = {
    padding: '5px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
    background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-max)' as React.CSSProperties['zIndex'],
        background: 'var(--color-scrim, rgba(0,0,0,0.45))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.14s ease', padding: 'var(--space-6)',
      }}
      onClick={() => { setVisible(false); setEditingId(null); }}
    >
      <div
        ref={trapRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-elevated, var(--color-bg-secondary))',
          border: '1px solid var(--color-border)', borderRadius: 10,
          padding: 22, width: 'min(560px, 96vw)', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
            Workspace Layouts
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{presets.length} saved</span>
        </div>

        <div style={{ overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {/* Project Spaces — the active workspace context (switch / retag / remove). */}
          <ProjectSpacesSection btn={btn} />

          {/* Built-in starter workspaces — open a ready-made multi-app Project
              Space (kind-tagged, apps tiled). Always available, even with no saves. */}
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', padding: 'var(--space-2) 2px 0' }}>Starter workspaces</div>
          {WORKFLOW_TEMPLATES.map(t => (
            <div
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
                padding: '10px var(--space-3)', borderRadius: 10,
                background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
              </div>
              <button style={{ ...btn, borderColor: 'var(--color-accent)', color: 'var(--color-accent)', flexShrink: 0 }} onClick={() => applyTemplate(t)}>Open</button>
            </div>
          ))}
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', padding: 'var(--space-2) 2px 0' }}>Saved</div>
          {presets.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              No saved layouts yet. Use “Save Workspace Layout” from the command palette (Ctrl+K).
            </div>
          ) : (
            presets.map(p => (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
                  padding: '10px var(--space-3)', borderRadius: 10,
                  background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  {editingId === p.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(p.id); else if (e.key === 'Escape') { setEditingId(null); } }}
                      onBlur={() => commitRename(p.id)}
                      aria-label="Rename workspace layout"
                      style={{ width: '100%', padding: '4px var(--space-2)', fontSize: 13, color: 'var(--color-text-primary)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-accent)', borderRadius: 4, outline: 'none' }}
                    />
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                        {p.windows.length} window{p.windows.length === 1 ? '' : 's'}
                      </div>
                    </>
                  )}
                </div>
                {editingId !== p.id && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button style={{ ...btn, borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }} onClick={() => restore(p.id)}>Restore</button>
                    <button style={btn} onClick={() => startRename(p)}>Rename</button>
                    <button style={{ ...btn, color: 'var(--color-error, #ff453a)' }} onClick={() => remove(p.id)}>Delete</button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
          Press <kbd style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)' }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
};

WorkspacePresetsPanel.displayName = 'WorkspacePresetsPanel';
export default memo(WorkspacePresetsPanel);
