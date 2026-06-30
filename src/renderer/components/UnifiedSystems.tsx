// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Unified Systems UI Components
// Notification Bell, Global Search Overlay, Task Queue Strip,
// Scratchpad, Feedback Panel, Recycle Bin View, Media Library Panel,
// Version History Panel, Workspace Layouts Panel, Batch Action Bar.
// ==========================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DexLoader } from './LoadingStates';
import { DexSearchInput } from '../styles/components';
import {
  useNotificationCenterStore,
  useGlobalSearchStore,
  useTaskQueueStore,
  useScratchpadStore,
  useFeedbackStore,
  useRecycleBinStore,
  useMediaLibraryStore,
  useVersionHistoryStore,
  useWorkspaceLayoutStore,
  useBatchStore,
  useLocalizationStore,
  useMultiWindowStore,
} from '../store/unifiedSystemsStore';
import { persistToHub, normalizeIcon, normalizePriority } from '../services/notify';

const pillBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--color-border, #3a3a3c)',
  borderRadius: '4px',
  color: 'var(--color-text-secondary)',
  fontSize: '11px',
  padding: '4px var(--space-2)',
  cursor: 'pointer',
};

// ==========================================================================
// GLOBAL SEARCH OVERLAY
// ==========================================================================
export function GlobalSearchOverlay(): React.ReactElement | null {
  const { isOpen, setOpen, query, setQuery, results, searching, search, expandedSources, toggleSourceExpansion } =
    useGlobalSearchStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setOpen(!isOpen);
      } else if (e.key === 'Escape' && isOpen) {
        // Robust Esc-to-close: the inline onKeyDown only fires while focus is
        // inside the overlay, but clicking a result row or scrolling can move
        // focus out. A window-level listener (matching the bell/feedback
        // panels) closes reliably regardless of where focus landed.
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        search(value);
      }, 300);
    },
    [search, setQuery]
  );

  if (!isOpen) return null;

  const handleResultClick = (result: any) => {
    if (result.deepLink) {
      (window as any).dex?.invoke('deeplink:navigate', result.deepLink);
    }
    setOpen(false);
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-scrim, rgba(0,0,0,0.6))',
        zIndex: 'var(--z-dock)' as any,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '80px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      <div
        style={{
          width: 'min(640px, calc(100vw - 48px))',
          maxHeight: '70vh',
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border, #3a3a3c)',
          borderRadius: '10px',
          boxShadow: 'var(--pg-shadow-popover)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-subtle, #2c2c2e)' }}>
          <DexSearchInput
            ref={inputRef}
            fullWidth
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onClear={() => handleQueryChange('')}
            placeholder="Search"
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {searching && (
            <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
              Searching...
            </div>
          )}
          {!searching && query && results.length === 0 && (
            <div style={{ padding: 'var(--space-10) var(--space-5)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
              No results found
            </div>
          )}
          {results.map((group) => {
            const expanded = expandedSources.has(group.source);
            const displayed = expanded ? group.results : group.results.slice(0, 3);
            return (
              <div key={group.source}>
                <div
                  style={{
                    padding: '10px var(--space-4) 6px',
                    color: 'var(--color-text-secondary)',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {group.source} ({group.totalCount})
                </div>
                {displayed.map((result, i) => (
                  <div
                    key={`${group.source}-${i}`}
                    onClick={() => handleResultClick(result)}
                    style={{
                      padding: '10px var(--space-4)',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--color-border-subtle, #2c2c2e)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {result.title}
                      </div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {result.description}
                      </div>
                    </div>
                    {result.timestamp && (
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px', flexShrink: 0, marginLeft: 'var(--space-3)' }}>
                        {formatTime(result.timestamp)}
                      </span>
                    )}
                  </div>
                ))}
                {group.totalCount > 3 && (
                  <button
                    onClick={() => toggleSourceExpansion(group.source)}
                    aria-label={expanded ? `Show fewer ${group.source} results` : `Show all ${group.totalCount} ${group.source} results`}
                    aria-expanded={expanded}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: 'var(--space-2) var(--space-4)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent, #3b82f6)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {expanded ? 'Show less' : `Show all ${group.totalCount} results`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--color-border-subtle, #2c2c2e)', color: 'var(--color-text-tertiary)', fontSize: '11px', textAlign: 'center' }}>
          Ctrl+Shift+F to toggle
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// TASK QUEUE STRIP
// ==========================================================================
export function TaskQueueStrip(): React.ReactElement | null {
  const { tasks, visible, cancelTask, retryTask, selectedTaskId, setSelectedTask, loadTasks } =
    useTaskQueueStore();

  useEffect(() => {
    loadTasks();
    const handleUpdate = (_e: any, updatedTasks: any) => {
      useTaskQueueStore.getState().updateTasks(updatedTasks || []);
    };
    const handleProgress = (_e: any, data: any) => {
      if (data) useTaskQueueStore.getState().updateProgress(data.id, data.progress, data.progressTotal, data.progressPercent);
    };
    (window as any).dex?.on('task-queue:update', handleUpdate);
    (window as any).dex?.on('task-queue:progress', handleProgress);
    return () => {
      (window as any).dex?.off('task-queue:update', handleUpdate);
      (window as any).dex?.off('task-queue:progress', handleProgress);
    };
  }, []);

  if (!visible || tasks.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--color-bg-surface)',
        borderTop: '1px solid var(--color-border-subtle, #2c2c2e)',
        zIndex: 'var(--z-dock)' as any,
        padding: '4px var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      {tasks.map((task) => (
        <div
          key={task.id}
          onClick={() => setSelectedTask(selectedTaskId === task.id ? null : task.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '4px var(--space-2)',
            borderRadius: '4px',
            cursor: 'pointer',
            background: selectedTaskId === task.id ? 'var(--color-bg-hover)' : 'transparent',
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px', width: '80px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.app}
          </span>
          <span style={{ color: 'var(--color-text-primary)', fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.name}
          </span>
          <div style={{ width: '120px', height: '4px', background: 'var(--color-bg-hover)', borderRadius: '2px', overflow: 'hidden', flexShrink: 0 }}>
            <div
              style={{
                height: '100%',
                width: `${task.progressPercent}%`,
                background: task.status === 'failed' ? 'var(--color-error)' : 'var(--color-accent, #3b82f6)',
                borderRadius: '2px',
                transition: 'width 0.3s',
              }}
            />
          </div>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px', width: '36px', textAlign: 'right', flexShrink: 0 }}>
            {task.progressPercent}%
          </span>
          {task.status === 'failed' ? (
            <button
              onClick={(e) => { e.stopPropagation(); retryTask(task.id); }}
              aria-label={`Retry task ${task.name}`}
              style={{ background: 'none', border: '1px solid var(--color-error)', borderRadius: '3px', color: 'var(--color-error)', fontSize: '11px', padding: '2px 6px', cursor: 'pointer' }}
            >
              Retry
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); cancelTask(task.id); }}
              aria-label={`Cancel task ${task.name}`}
              style={{ background: 'none', border: '1px solid var(--color-border, #3a3a3c)', borderRadius: '3px', color: 'var(--color-text-secondary)', fontSize: '11px', padding: '2px 6px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          )}
        </div>
      ))}
      {selectedTaskId && (
        <TaskDetailView taskId={selectedTaskId} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}

function TaskDetailView({ taskId, onClose }: { taskId: string; onClose: () => void }): React.ReactElement | null {
  const task = useTaskQueueStore((s) => s.tasks.find((t) => t.id === taskId));
  if (!task) return null;

  return (
    <div style={{ padding: 'var(--space-2)', background: 'var(--color-bg-hover)', borderRadius: '6px', marginTop: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 600 }}>{task.name}</span>
        <button onClick={onClose} aria-label="Close task details" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '14px' }}>x</button>
      </div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>App: {task.app}</span>
        <span>Status: {task.status}</span>
        <span>Priority: {task.priority}</span>
        {task.startedAt && <span>Started: {new Date(task.startedAt).toLocaleTimeString()}</span>}
        {task.error && <span style={{ color: 'var(--color-error)' }}>Error: {task.error}</span>}
      </div>
    </div>
  );
}

// ==========================================================================
// SCRATCHPAD OVERLAY
// ==========================================================================
export function ScratchpadOverlay(): React.ReactElement | null {
  const { isOpen, setOpen, content, setContent, loadState, clearContent, sendToNotes, savePosition, position, size } =
    useScratchpadStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [pos, setPos] = useState({ x: -1, y: -1 });

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        if (!isOpen) loadState();
        setOpen(!isOpen);
      } else if (e.key === 'Escape' && isOpen) {
        // Robust Esc-to-close: the inline onKeyDown only catches Esc while
        // focus is inside the textarea, but dragging the title bar or clicking
        // a footer button moves focus out. Close at the window level instead.
        setOpen(false);
        setConfirmClear(false);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      loadState().then(() => {
        const s = useScratchpadStore.getState();
        if (s.position.x >= 0) setPos(s.position);
        else {
          const cx = Math.round(window.innerWidth / 2 - 200);
          const cy = Math.round(window.innerHeight / 2 - 150);
          setPos({ x: cx, y: cy });
        }
      });
      if (textareaRef.current) textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  useEffect(() => {
    if (!dragging) return;
    let rafId = 0;
    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
      });
    };
    const handleUp = () => {
      cancelAnimationFrame(rafId);
      setDragging(false);
      savePosition(pos.x, pos.y, size.width, size.height);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, pos]);

  const handleClose = () => {
    setOpen(false);
    setConfirmClear(false);
  };

  const handleSendToNotes = async () => {
    const result = await sendToNotes();
    if (result) {
      const noteData = { id: `note-${Date.now()}`, title: 'Quick Note', content: result.content, createdAt: Date.now(), updatedAt: Date.now() };
      try {
        const raw = localStorage.getItem('dex-notes');
        const notes = raw ? JSON.parse(raw) : [];
        notes.push(noteData);
        localStorage.setItem('dex-notes', JSON.stringify(notes));
      } catch { /* ignore */ }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-dock)' as any,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
    >
      <div
        style={{
          position: 'absolute',
          left: pos.x >= 0 ? pos.x : '50%',
          top: pos.y >= 0 ? pos.y : '50%',
          transform: pos.x < 0 ? 'translate(-50%, -50%)' : undefined,
          width: `${size.width}px`,
          height: `${size.height}px`,
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border, #3a3a3c)',
          borderRadius: '10px',
          boxShadow: 'var(--pg-shadow-popover)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          onMouseDown={handleMouseDown}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            borderBottom: '1px solid var(--color-border-subtle, #2c2c2e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'move',
            userSelect: 'none',
          }}
        >
          <span style={{ color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 600 }}>Quick Scratchpad</span>
          <button onClick={handleClose} aria-label="Close scratchpad" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '16px' }}>x</button>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type quick notes here..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
            padding: 'var(--space-3)',
            resize: 'none',
            outline: 'none',
            lineHeight: 1.6,
            fontFamily: 'inherit',
          }}
        />
        <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--color-border-subtle, #2c2c2e)', display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          {!confirmClear ? (
            <button onClick={() => setConfirmClear(true)} aria-label="Clear scratchpad" style={pillBtnStyle}>Clear</button>
          ) : (
            <button onClick={() => { clearContent(); setConfirmClear(false); }} aria-label="Confirm clear scratchpad" style={{ ...pillBtnStyle, color: 'var(--color-error)' }}>Confirm clear</button>
          )}
          <button onClick={handleSendToNotes} aria-label="Send scratchpad to Notes" style={{ ...pillBtnStyle, color: 'var(--color-accent, #3b82f6)', borderColor: 'var(--color-accent, #3b82f6)' }}>Send to Notes</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// FEEDBACK PANEL
// ==========================================================================
export function FeedbackPanel(): React.ReactElement | null {
  const {
    panelOpen,
    setPanelOpen,
    reportType,
    setReportType,
    description,
    setDescription,
    includeSystemInfo,
    setIncludeSystemInfo,
    showSystemInfo,
    setShowSystemInfo,
    submitting,
    submitted,
    savedPath,
    systemInfoPreview,
    submit,
    loadSystemInfoPreview,
  } = useFeedbackStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSystemInfo && !systemInfoPreview) loadSystemInfoPreview();
  }, [showSystemInfo]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    if (panelOpen) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [panelOpen]);

  if (!panelOpen) return null;

  const types: Array<{ value: 'bug' | 'feature' | 'general'; label: string }> = [
    { value: 'bug', label: 'Bug Report' },
    { value: 'feature', label: 'Feature Request' },
    { value: 'general', label: 'General Feedback' },
  ];

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        bottom: '60px',
        left: '70px',
        width: '360px',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border, #3a3a3c)',
        borderRadius: '10px',
        boxShadow: 'var(--pg-shadow-popover)',
        zIndex: 'var(--z-dock)' as any,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px var(--space-4) 10px', borderBottom: '1px solid var(--color-border-subtle, #2c2c2e)' }}>
        <span style={{ color: 'var(--color-text-primary)', fontSize: '14px', fontWeight: 600 }}>Send Feedback</span>
      </div>
      {submitted ? (
        <div style={{ padding: 'var(--space-5) var(--space-4)' }}>
          <div style={{ color: 'var(--color-success, #22c55e)', fontSize: '13px', fontWeight: 500, marginBottom: 'var(--space-2)' }}>Report saved</div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', wordBreak: 'break-all' }}>{savedPath}</div>
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginTop: 'var(--space-2)' }}>
            You can send this file to the DEX support channel.
          </div>
          <button onClick={() => setPanelOpen(false)} aria-label="Close feedback panel" style={{ ...pillBtnStyle, marginTop: 'var(--space-3)' }}>Close</button>
        </div>
      ) : (
        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: 'var(--space-3)' }}>
            {types.map((t) => (
              <button
                key={t.value}
                onClick={() => setReportType(t.value)}
                aria-label={`${t.label}`}
                aria-pressed={reportType === t.value}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  background: reportType === t.value ? 'var(--color-bg-hover)' : 'transparent',
                  border: `1px solid ${reportType === t.value ? 'var(--color-accent, #3b82f6)' : 'var(--color-border, #3a3a3c)'}`,
                  borderRadius: '4px',
                  color: reportType === t.value ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your issue or idea..."
            rows={5}
            style={{
              width: '100%',
              background: 'var(--color-bg-hover)',
              border: '1px solid var(--color-border, #3a3a3c)',
              borderRadius: '6px',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
              padding: '10px',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
              <input type="checkbox" checked={includeSystemInfo} onChange={(e) => setIncludeSystemInfo(e.target.checked)} />
              Include system info
            </label>
            <button onClick={() => setShowSystemInfo(!showSystemInfo)} aria-label={showSystemInfo ? 'Hide system info' : 'Show system info'} aria-expanded={showSystemInfo} style={{ background: 'none', border: 'none', color: 'var(--color-accent, #3b82f6)', fontSize: '11px', cursor: 'pointer' }}>
              {showSystemInfo ? 'Hide' : 'Show what is included'}
            </button>
          </div>
          {showSystemInfo && systemInfoPreview && (
            <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-bg-hover)', borderRadius: '4px', fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <div>DEX Version: {systemInfoPreview.dexVersion}</div>
              <div>OS: {systemInfoPreview.osName} {systemInfoPreview.osVersion}</div>
              <div>Capability Tier: {systemInfoPreview.capabilityTier}</div>
              <div>Active App: {systemInfoPreview.activeApp}</div>
              <div>Error Log (last 10 lines): {systemInfoPreview.errorLogTail?.length || 0} entries</div>
            </div>
          )}
          <button
            onClick={submit}
            disabled={!description.trim() || submitting}
            aria-label="Submit feedback"
            style={{
              marginTop: 'var(--space-3)',
              width: '100%',
              padding: 'var(--space-2)',
              background: description.trim() ? 'var(--color-accent, #3b82f6)' : 'var(--color-bg-hover)',
              border: 'none',
              borderRadius: '6px',
              // Active -> on accent (accent-text); inactive -> on bg-hover
              // (secondary text). A single color can't satisfy both across
              // themes (white would vanish on the light inactive surface).
              color: description.trim() ? 'var(--color-accent-text, #fff)' : 'var(--color-text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: description.trim() ? 'pointer' : 'not-allowed',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// RECYCLE BIN SIDEBAR VIEW
// ==========================================================================
export function RecycleBinView(): React.ReactElement {
  const { items, count, appFilter, setAppFilter, loading, loadItems, loadCount, restoreItem, permanentlyDelete, emptyAll } =
    useRecycleBinStore();
  const [confirmEmpty, setConfirmEmpty] = useState(0);

  useEffect(() => {
    loadItems();
    loadCount();
  }, []);

  const handleRestore = async (id: number) => {
    await restoreItem(id);
  };

  const handleEmpty = () => {
    if (confirmEmpty === 0) { setConfirmEmpty(1); return; }
    if (confirmEmpty === 1) { setConfirmEmpty(2); return; }
    emptyAll();
    setConfirmEmpty(0);
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString();
  const daysLeft = (expiresAt: number) => Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000));

  const apps = [...new Set(items.map((i) => i.app))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--color-text-primary)' }}>
      <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-subtle, #2c2c2e)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Recycle Bin ({count})</h2>
        {count > 0 && (
          <button
            onClick={handleEmpty}
            aria-label={confirmEmpty === 0 ? 'Empty recycle bin' : confirmEmpty === 1 ? 'Confirm empty recycle bin' : 'Absolutely sure, empty recycle bin'}
            style={{
              ...pillBtnStyle,
              color: confirmEmpty > 0 ? 'var(--color-error)' : 'var(--color-text-secondary)',
              borderColor: confirmEmpty > 0 ? 'var(--color-error)' : 'var(--color-border, #3a3a3c)',
            }}
          >
            {confirmEmpty === 0 ? 'Empty Recycle Bin' : confirmEmpty === 1 ? 'Confirm?' : 'Absolutely sure?'}
          </button>
        )}
      </div>
      {apps.length > 1 && (
        <div style={{ padding: 'var(--space-2) var(--space-4)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => setAppFilter('all')} aria-label="Filter: All apps" aria-pressed={appFilter === 'all'} style={{ ...pillBtnStyle, color: appFilter === 'all' ? 'var(--color-accent, #3b82f6)' : 'var(--color-text-secondary)' }}>All</button>
          {apps.map((a) => (
            <button key={a} onClick={() => setAppFilter(a)} aria-label={`Filter: ${a}`} aria-pressed={appFilter === a} style={{ ...pillBtnStyle, color: appFilter === a ? 'var(--color-accent, #3b82f6)' : 'var(--color-text-secondary)' }}>
              {a}
            </button>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4)' }}>
        {loading ? (
          <DexLoader variant="panel" style={{ padding: 'var(--space-10)', minHeight: 0 }} />
        ) : items.length === 0 ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Recycle bin is empty</div>
        ) : (
          items.map((item) => (
            <div key={item.id} style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--color-border-subtle, #2c2c2e)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.item_name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                  {item.app} -- {item.item_type} -- Deleted {formatDate(item.deleted_at)} -- {daysLeft(item.expires_at)} days left
                </div>
              </div>
              <button onClick={() => handleRestore(item.id)} aria-label={`Restore ${item.item_name}`} style={{ ...pillBtnStyle, color: 'var(--color-accent, #3b82f6)' }}>Restore</button>
              <button onClick={() => permanentlyDelete(item.id)} aria-label={`Permanently delete ${item.item_name}`} style={{ ...pillBtnStyle, color: 'var(--color-error)' }}>Delete</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// BATCH ACTION BAR
// ==========================================================================
export function BatchActionBar(): React.ReactElement | null {
  const { selectedItems, batchBarVisible, availableActions, executeBatch, clearSelection } = useBatchStore();

  if (!batchBarVisible || selectedItems.size === 0) return null;

  const actionLabels: Record<string, string> = {
    delete: 'Delete All',
    export: 'Export All',
    move: 'Move All',
    markComplete: 'Mark Complete',
    changeDueDate: 'Change Due Date',
    addToTimeline: 'Add to Timeline',
    removeFromProject: 'Remove from Project',
    exportClips: 'Export Clips',
    removeFromLibrary: 'Remove from Library',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border, #3a3a3c)',
        borderRadius: '10px',
        boxShadow: 'var(--pg-shadow-popover)',
        zIndex: 'var(--z-dock)' as any,
        padding: 'var(--space-2) var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px', fontWeight: 600 }}>
        {selectedItems.size} selected
      </span>
      <div style={{ width: '1px', height: '20px', background: 'var(--color-bg-hover)' }} />
      {availableActions.map((action) => (
        <button
          key={action}
          onClick={() => executeBatch(action)}
          aria-label={`Batch action: ${actionLabels[action] || action}`}
          style={{
            ...pillBtnStyle,
            color: action === 'delete' ? 'var(--color-error)' : 'var(--color-accent, #3b82f6)',
            borderColor: action === 'delete' ? 'var(--color-error)' : 'var(--color-accent, #3b82f6)',
          }}
        >
          {actionLabels[action] || action}
        </button>
      ))}
      <div style={{ width: '1px', height: '20px', background: 'var(--color-bg-hover)' }} />
      <button onClick={clearSelection} aria-label="Deselect all items" style={pillBtnStyle}>Deselect</button>
    </div>
  );
}

// ==========================================================================
// DETACH BUTTON (for inner app headers)
// ==========================================================================
export function DetachButton({ appId }: { appId: string }): React.ReactElement {
  const { detachApp, isDetached, reattachApp } = useMultiWindowStore();
  const detached = isDetached(appId);

  return (
    <button
      onClick={() => detached ? reattachApp(appId) : detachApp(appId)}
      aria-label={detached ? 'Reattach to main window' : 'Detach to new window'}
      style={{
        background: 'none',
        border: '1px solid var(--color-border, #3a3a3c)',
        borderRadius: '4px',
        color: 'var(--color-text-secondary)',
        fontSize: '11px',
        padding: '4px var(--space-2)',
        cursor: 'pointer',
      }}
      title={detached ? 'Return to main window' : 'Open in new window'}
    >
      {detached ? 'Reattach' : 'Detach'}
    </button>
  );
}

// ==========================================================================
// UNIFIED SYSTEMS INITIALIZER
// ==========================================================================
export function UnifiedSystemsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  useEffect(() => {
    useLocalizationStore.getState().loadStrings();
    useNotificationCenterStore.getState().loadUnreadCount();
    useRecycleBinStore.getState().loadCount();
    useScratchpadStore.getState().loadState();
    useTaskQueueStore.getState().loadTasks();

    const refreshCenter = () => {
      const store = useNotificationCenterStore.getState();
      if (store.panelOpen) store.loadNotifications();
      store.loadUnreadCount();
    };

    const handleNewNotification = (_e: any, _record: any) => { refreshCenter(); };
    const handleUnreadCount = (_e: any, count: number) => {
      useNotificationCenterStore.setState({ unreadCount: count });
    };
    const handleRecycleBinCount = (_e: any, count: number) => {
      useRecycleBinStore.setState({ count });
    };
    const handleDndChanged = (_e: any, active: boolean) => {
      useNotificationCenterStore.setState({ doNotDisturb: active });
    };

    // Single backing store: every app-wide `dex-notification` banner is also
    // persisted to the unified hub so it survives reload and surfaces in the
    // bell/center. Events raised through services/notify already persist
    // themselves (flagged `_dexPersisted`); legacy dispatchers do not, so we
    // persist those here. Degrades silently when the hub channel is missing.
    const handleBannerEvent = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!d || !d.title || d._dexPersisted) return;
      void persistToHub(
        {
          title: String(d.title),
          body: d.body != null ? String(d.body) : undefined,
          source: d.source != null ? String(d.source) : undefined,
          icon: normalizeIcon(d.icon ?? d.type),
          priority: normalizePriority(d.priority),
          action: d.action,
        },
        normalizeIcon(d.icon ?? d.type),
        normalizePriority(d.priority),
      ).then(refreshCenter);
    };

    (window as any).dex?.on('notification-center:new', handleNewNotification);
    (window as any).dex?.on('notification-center:unread-count', handleUnreadCount);
    (window as any).dex?.on('notification-center:dnd-changed', handleDndChanged);
    (window as any).dex?.on('recycle-bin:count', handleRecycleBinCount);
    window.addEventListener('dex-notification', handleBannerEvent as EventListener);
    // notify() persists, then asks the center to refresh via this event.
    window.addEventListener('dex-notification-persisted', refreshCenter as EventListener);

    return () => {
      (window as any).dex?.off('notification-center:new', handleNewNotification);
      (window as any).dex?.off('notification-center:unread-count', handleUnreadCount);
      (window as any).dex?.off('notification-center:dnd-changed', handleDndChanged);
      (window as any).dex?.off('recycle-bin:count', handleRecycleBinCount);
      window.removeEventListener('dex-notification', handleBannerEvent as EventListener);
      window.removeEventListener('dex-notification-persisted', refreshCenter as EventListener);
    };
  }, []);

  return <>{children}</>;
}
