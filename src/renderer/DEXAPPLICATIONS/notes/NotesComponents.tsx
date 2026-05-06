// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX Notes -- UI Components
// ==========================================================================
// All shared UI components for the DEX Notes application:
// FolderTree, NoteListPanel, NoteToolbar, FindReplace, TagEditor,
// AttachmentPanel, NoteStats, TemplateSelector, ExportDialog
// ==========================================================================

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { Folder, NoteListItem, NoteAttachment, NoteTemplate, SortField, SortDirection, ViewMode, EditorMode } from '../../store/notesStore';
import ContextMenu, { useContextMenu, ContextMenuItem } from '../../components/ContextMenu';

// ---------------------------------------------------------------------------
// Shared Styles
// ---------------------------------------------------------------------------

const colors = {
  bg: 'rgba(0,0,0,0.2)',
  bgHover: 'var(--color-border-subtle)',
  bgSelected: 'rgba(100,210,255,0.08)',
  border: 'var(--color-bg-hover)',
  text: 'var(--color-text-primary)',
  textDim: 'var(--color-text-tertiary)',
  textMuted: 'var(--color-text-tertiary)',
  accent: '#64d2ff',
  accentDim: 'rgba(100,210,255,0.2)',
  danger: 'var(--color-error)',
  pin: 'var(--color-warning)',
};

// ---------------------------------------------------------------------------
// FolderTree
// ---------------------------------------------------------------------------

interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onCreate: (name: string, parentId?: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export const FolderTree: React.FC<FolderTreeProps> = memo(({
  folders,
  selectedFolderId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [creatingIn, setCreatingIn] = useState<string | null | false>(false);
  const [newFolderName, setNewFolderName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId || creatingIn !== false) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [editingId, creatingIn]);

  const startRename = useCallback((id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  }, []);

  const confirmRename = useCallback(() => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  }, [editingId, editName, onRename]);

  const startCreate = useCallback((parentId: string | null) => {
    setCreatingIn(parentId);
    setNewFolderName('');
  }, []);

  const confirmCreate = useCallback(() => {
    if (newFolderName.trim()) {
      onCreate(newFolderName.trim(), creatingIn as string | null);
    }
    setCreatingIn(false);
    setNewFolderName('');
  }, [newFolderName, creatingIn, onCreate]);

  const renderFolder = (folder: Folder, depth: number = 0) => {
    const isSelected = folder.id === selectedFolderId;
    const isEditing = folder.id === editingId;
    return (
      <div key={folder.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            paddingLeft: 8 + depth * 16,
            borderRadius: 4,
            cursor: 'pointer',
            background: isSelected ? colors.bgSelected : 'transparent',
            color: isSelected ? colors.accent : colors.text,
            fontSize: 13,
            transition: 'background 0.1s',
          }}
          onClick={() => onSelect(folder.id)}
          onDoubleClick={() => startRename(folder.id, folder.name)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          {isEditing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
              }}
              style={{
                flex: 1,
                background: 'rgba(0,0,0,0.3)',
                border: `1px solid ${colors.accent}`,
                borderRadius: 3,
                color: colors.text,
                fontSize: 13,
                padding: '1px 4px',
                outline: 'none',
              }}
            />
          ) : (
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {folder.name}
            </span>
          )}
          {!isEditing && (
            <div style={{ display: 'flex', gap: 2, opacity: 0.4 }}>
              <button
                aria-label="New subfolder"
                onClick={e => { e.stopPropagation(); startCreate(folder.id); }}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
                title="New subfolder"
              >+</button>
              <button
                aria-label="Delete folder"
                onClick={e => { e.stopPropagation(); onDelete(folder.id); }}
                style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 12, padding: '0 2px' }}
                title="Delete folder"
              >x</button>
            </div>
          )}
        </div>
        {folder.children && folder.children.map(child => renderFolder(child, depth + 1))}
      </div>
    );
  };

  return (
    <div style={{ padding: '4px 0' }}>
      {/* All Notes */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          background: selectedFolderId === null ? colors.bgSelected : 'transparent',
          color: selectedFolderId === null ? colors.accent : colors.text,
          fontSize: 13,
          fontWeight: 500,
        }}
        onClick={() => onSelect(null)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        All Notes
      </div>

      {/* Folder list */}
      {folders.map(f => renderFolder(f))}

      {/* New folder input */}
      {creatingIn !== false && (
        <div style={{ padding: '4px 8px' }}>
          <input
            ref={inputRef}
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onBlur={confirmCreate}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmCreate();
              if (e.key === 'Escape') { setCreatingIn(false); setNewFolderName(''); }
            }}
            placeholder="Folder name"
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${colors.accent}`,
              borderRadius: 4,
              color: colors.text,
              fontSize: 13,
              padding: '4px 8px',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* New folder button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          color: colors.textDim,
          fontSize: 12,
          marginTop: 4,
        }}
        onClick={() => startCreate(null)}
      >
        + New Folder
      </div>
    </div>
  );
});

FolderTree.displayName = 'FolderTree';

// ---------------------------------------------------------------------------
// NoteListPanel
// ---------------------------------------------------------------------------

interface NoteListPanelProps {
  notes: NoteListItem[];
  selectedNoteId: string | null;
  onSelect: (noteId: string) => void;
  onCreate: () => void;
  onDelete: (noteId: string) => void;
  onTogglePin: (noteId: string) => void;
  onDuplicate?: (noteId: string) => void;
  onSetColor?: (noteId: string, color: string | null) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortFieldChange: (field: SortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  viewMode: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const NoteListPanel: React.FC<NoteListPanelProps> = memo(({
  notes,
  selectedNoteId,
  onSelect,
  onCreate,
  onDelete,
  onTogglePin,
  onDuplicate,
  onSetColor,
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionChange,
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
}) => {
  const { menuState, show: showCtx, close: closeCtx } = useContextMenu();
  const pinnedNotes = notes.filter(n => n.pinned);
  const unpinnedNotes = notes.filter(n => !n.pinned);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const buildNoteCtxItems = (note: NoteListItem): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      { id: 'open', label: 'Open Note', onClick: () => onSelect(note.id) },
      { id: 'pin', label: note.pinned ? 'Unpin' : 'Pin to Top', onClick: () => onTogglePin(note.id) },
    ];
    if (onDuplicate) items.push({ id: 'dup', label: 'Duplicate', onClick: () => onDuplicate(note.id) });
    if (onSetColor) {
      items.push({ id: 'div-color', label: '', divider: true });
      const noteColors = ['var(--color-error)','var(--color-warning)','var(--color-warning)','var(--color-success)','#64d2ff','#bf5af2','#ff375f'];
      noteColors.forEach(c => items.push({
        id: `color-${c}`, label: c === note.color_label ? `● ${c}` : `○ ${c}`,
        onClick: () => onSetColor(note.id, c === note.color_label ? null : c),
      }));
    }
    items.push(
      { id: 'div-del', label: '', divider: true },
      { id: 'delete', label: 'Delete Note', danger: true, shortcut: 'Del', onClick: () => onDelete(note.id) },
    );
    return items;
  };

  const renderNoteItem = (note: NoteListItem) => {
    const isSelected = note.id === selectedNoteId;
    const preview = note.plain_text?.slice(0, 100) || '';
    return (
      <div
        key={note.id}
        onContextMenu={e => {
          onSelect(note.id);
          showCtx(e, buildNoteCtxItems(note));
        }}
        style={{
          padding: viewMode === 'compact' ? '6px 10px' : '10px 12px',
          borderRadius: 6,
          cursor: 'pointer',
          background: isSelected ? colors.bgSelected : 'transparent',
          borderLeft: isSelected ? `2px solid ${colors.accent}` : '2px solid transparent',
          transition: 'background 0.1s',
          marginBottom: 1,
        }}
        onClick={() => onSelect(note.id)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: isSelected ? 'var(--color-text-primary)' : colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {note.locked ? '[Locked] ' : ''}{note.title || 'Untitled'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {note.pinned ? (
              <span
                style={{ fontSize: 10, color: colors.pin, cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); onTogglePin(note.id); }}
                title="Unpin"
              >PIN</span>
            ) : null}
            <span style={{ fontSize: 11, color: colors.textDim }}>{formatDate(note.updated_at)}</span>
          </div>
        </div>
        {viewMode !== 'compact' && preview && (
          <div style={{
            fontSize: 12,
            color: colors.textDim,
            marginTop: 3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {preview}
          </div>
        )}
        {viewMode !== 'compact' && note.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {note.tags.slice(0, 3).map(tag => (
              <span key={tag} style={{
                fontSize: 10,
                color: colors.accent,
                background: colors.accentDim,
                padding: '1px 6px',
                borderRadius: 8,
              }}>{tag}</span>
            ))}
            {note.tags.length > 3 && (
              <span style={{ fontSize: 10, color: colors.textDim }}>+{note.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search */}
      <div style={{ padding: '8px 8px 4px', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--color-border-subtle)',
          borderRadius: 6,
          padding: '6px 10px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search notes..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: colors.text,
              fontSize: 13,
            }}
          />
          {searchQuery && (
            <button
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
              style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 14 }}
            >x</button>
          )}
        </div>
      </div>

      {/* Sort controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 10px',
        fontSize: 11,
        color: colors.textDim,
        flexShrink: 0,
      }}>
        <span>{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onViewModeChange && (
            <div style={{ display: 'flex', gap: 1, marginRight: 4 }}>
              {(['list', 'compact', 'grid'] as ViewMode[]).map(m => (
                <button
                  key={m}
                  aria-label={`${m} view`}
                  onClick={() => onViewModeChange(m)}
                  style={{
                    background: viewMode === m ? 'var(--color-border-subtle)' : 'transparent',
                    border: 'none', color: viewMode === m ? '#fff' : colors.textDim,
                    cursor: 'pointer', fontSize: 10, padding: '2px 5px', borderRadius: 3,
                  }}
                >{m === 'list'
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
                  : m === 'compact'
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                }</button>
              ))}
            </div>
          )}
          <select
            value={sortField}
            onChange={e => onSortFieldChange(e.target.value as SortField)}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textDim,
              fontSize: 11,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="updated_at">Modified</option>
            <option value="created_at">Created</option>
            <option value="title">Title</option>
            <option value="word_count">Length</option>
          </select>
          <button
            aria-label="Toggle sort direction"
            onClick={() => onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')}
            style={{
              background: 'none',
              border: 'none',
              color: colors.textDim,
              cursor: 'pointer',
              fontSize: 11,
              padding: '0 2px',
            }}
          >
            {sortDirection === 'asc' ? 'ASC' : 'DESC'}
          </button>
        </div>
      </div>

      {/* Note list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
        {pinnedNotes.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: colors.textMuted, padding: '8px 8px 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pinned
            </div>
            {pinnedNotes.map(renderNoteItem)}
          </>
        )}
        {unpinnedNotes.length > 0 && (
          <>
            {pinnedNotes.length > 0 && (
              <div style={{ fontSize: 10, color: colors.textMuted, padding: '8px 8px 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Notes
              </div>
            )}
            {unpinnedNotes.map(renderNoteItem)}
          </>
        )}
        {notes.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
            No notes yet
          </div>
        )}
      </div>

      {/* New note button */}
      <div style={{ padding: 8, flexShrink: 0 }}>
        <button
          aria-label="Create new note"
          onClick={onCreate}
          style={{
            width: '100%',
            padding: '8px 0',
            background: colors.accentDim,
            border: 'none',
            borderRadius: 6,
            color: colors.accent,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
        >
          + New Note
        </button>
      </div>
      {menuState && <ContextMenu items={menuState.items} position={menuState.position} onClose={closeCtx} />}
    </div>
  );
});

NoteListPanel.displayName = 'NoteListPanel';

// ---------------------------------------------------------------------------
// NoteToolbar (above the editor)
// ---------------------------------------------------------------------------

interface NoteToolbarProps {
  note: { id: string; title: string; pinned: number; locked: number; color_label: string | null } | null;
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: (format: string) => void;
  onToggleFocus: () => void;
  onToggleLock?: () => void;
  onColorLabel?: (color: string | null) => void;
  focusMode: boolean;
  saving: boolean;
}

const COLOR_LABELS = [
  { value: null, label: 'None', hex: 'transparent' },
  { value: 'red', label: 'Red', hex: 'var(--color-error)' },
  { value: 'orange', label: 'Orange', hex: 'var(--color-warning)' },
  { value: 'yellow', label: 'Yellow', hex: 'var(--color-warning)' },
  { value: 'green', label: 'Green', hex: 'var(--color-success)' },
  { value: 'blue', label: 'Blue', hex: 'var(--color-accent)' },
  { value: 'purple', label: 'Purple', hex: '#BF5AF2' },
];

export const NoteToolbar: React.FC<NoteToolbarProps> = memo(({
  note,
  editorMode,
  onEditorModeChange,
  onTogglePin,
  onDuplicate,
  onDelete,
  onExport,
  onToggleFocus,
  onToggleLock,
  onColorLabel,
  focusMode,
  saving,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);

  if (!note) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 12px',
      borderBottom: `1px solid ${colors.border}`,
      background: 'rgba(0,0,0,0.1)',
      flexShrink: 0,
      minHeight: 36,
    }}>
      {/* Left: save status */}
      <div style={{ fontSize: 11, color: colors.textDim }}>
        {saving ? 'Saving...' : 'Saved'}
      </div>

      {/* Center: editor mode tabs */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--color-border-subtle)', borderRadius: 6, padding: 2 }}>
        {(['edit', 'split', 'preview'] as EditorMode[]).map(mode => (
          <button
            key={mode}
            aria-label={`Switch to ${mode} mode`}
            onClick={() => onEditorModeChange(mode)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              border: 'none',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              background: editorMode === mode ? 'var(--color-border-subtle)' : 'transparent',
              color: editorMode === mode ? 'var(--color-text-primary)' : colors.textDim,
              transition: 'all 0.1s',
            }}
          >
            {mode === 'edit' ? 'Edit' : mode === 'split' ? 'Split' : 'Preview'}
          </button>
        ))}
      </div>

      {/* Right: actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <ToolbarIconButton
          label={focusMode ? 'Exit Focus' : 'Focus Mode'}
          onClick={onToggleFocus}
          active={focusMode}
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></ToolbarIconButton>
        <ToolbarIconButton
          label={note.pinned ? 'Unpin' : 'Pin'}
          onClick={onTogglePin}
          active={!!note.pinned}
        ><svg width="14" height="14" viewBox="0 0 24 24" fill={note.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 2h6l-1 7h3l-5 6-5-6h3z"/></svg></ToolbarIconButton>
        {onToggleLock && (
          <ToolbarIconButton
            label={note.locked ? 'Unlock' : 'Lock'}
            onClick={onToggleLock}
            active={!!note.locked}
          >{note.locked
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
          }</ToolbarIconButton>
        )}
        {onColorLabel && (
          <div style={{ position: 'relative' }}>
            <ToolbarIconButton
              label="Color Label"
              onClick={() => setShowColorMenu(!showColorMenu)}
              active={!!note.color_label}
            >
              <span style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                background: note.color_label ? (COLOR_LABELS.find(c => c.value === note.color_label)?.hex || '#fff') : 'var(--color-text-tertiary)',
                border: '1px solid var(--color-text-tertiary)',
              }} />
            </ToolbarIconButton>
            {showColorMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'rgba(30,30,30,0.95)', border: `1px solid ${colors.border}`,
                borderRadius: 6, padding: 6, display: 'flex', gap: 4, zIndex: 'var(--z-max)',
              }}>
                {COLOR_LABELS.map(c => (
                  <div
                    key={c.label}
                    title={c.label}
                    style={{
                      width: 18, height: 18, borderRadius: '50%', cursor: 'pointer',
                      background: c.hex === 'transparent' ? 'var(--color-bg-hover)' : c.hex,
                      border: note.color_label === c.value ? '2px solid #fff' : '2px solid transparent',
                    }}
                    onClick={() => { onColorLabel(c.value); setShowColorMenu(false); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        <ToolbarIconButton label="Duplicate" onClick={onDuplicate}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></ToolbarIconButton>
        <div style={{ position: 'relative' }}>
          <ToolbarIconButton label="Export" onClick={() => setShowExportMenu(!showExportMenu)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></ToolbarIconButton>
          {showExportMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'rgba(30,30,30,0.95)',
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: '4px 0',
              minWidth: 120,
              zIndex: 'var(--z-max)',
            }}>
              {['markdown', 'html', 'txt', 'json'].map(fmt => (
                <div
                  key={fmt}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    color: colors.text,
                    cursor: 'pointer',
                  }}
                  onClick={() => { onExport(fmt); setShowExportMenu(false); }}
                  onMouseEnter={e => (e.currentTarget.style.background = colors.bgHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  Export as .{fmt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

NoteToolbar.displayName = 'NoteToolbar';

const ToolbarIconButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
}> = ({ label, onClick, children, active, danger }) => (
  <button
    aria-label={label}
    title={label}
    onClick={onClick}
    style={{
      width: 26,
      height: 26,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      borderRadius: 4,
      background: active ? colors.accentDim : 'transparent',
      color: danger ? colors.danger : active ? colors.accent : colors.textDim,
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: 600,
      transition: 'all 0.1s',
    }}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// FindReplace
// ---------------------------------------------------------------------------

interface FindReplaceProps {
  visible: boolean;
  onClose: () => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
}

export const FindReplace: React.FC<FindReplaceProps> = memo(({
  visible,
  onClose,
  editorRef,
}) => {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [showReplace, setShowReplace] = useState(false);

  const doFind = useCallback(() => {
    if (!editorRef.current || !findText) {
      setMatchCount(0);
      return;
    }
    // Clear existing highlights
    const existing = editorRef.current.querySelectorAll('.find-highlight');
    existing.forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });

    if (!findText.trim()) {
      setMatchCount(0);
      return;
    }

    // Walk text nodes and highlight matches
    let count = 0;
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text);
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      const lowerText = text.toLowerCase();
      const lowerFind = findText.toLowerCase();
      let idx = lowerText.indexOf(lowerFind);
      if (idx === -1) continue;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      while (idx !== -1) {
        if (idx > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
        }
        const span = document.createElement('span');
        span.className = 'find-highlight';
        span.style.background = 'rgba(255,214,10,0.3)';
        span.style.borderRadius = '2px';
        span.textContent = text.slice(idx, idx + findText.length);
        frag.appendChild(span);
        count++;
        lastIdx = idx + findText.length;
        idx = lowerText.indexOf(lowerFind, lastIdx);
      }
      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }
      textNode.parentNode?.replaceChild(frag, textNode);
    }
    setMatchCount(count);
  }, [findText, editorRef]);

  const doReplace = useCallback(() => {
    if (!editorRef.current) return;
    const highlight = editorRef.current.querySelector('.find-highlight');
    if (highlight) {
      highlight.textContent = replaceText;
      highlight.className = '';
      (highlight as HTMLElement).style.background = '';
      doFind();
    }
  }, [replaceText, editorRef, doFind]);

  const doReplaceAll = useCallback(() => {
    if (!editorRef.current) return;
    const highlights = editorRef.current.querySelectorAll('.find-highlight');
    highlights.forEach(el => {
      el.textContent = replaceText;
      el.className = '';
      (el as HTMLElement).style.background = '';
    });
    setMatchCount(0);
  }, [replaceText, editorRef]);

  useEffect(() => {
    doFind();
  }, [findText, doFind]);

  useEffect(() => {
    if (!visible && editorRef.current) {
      // Clear highlights when closing
      const existing = editorRef.current.querySelectorAll('.find-highlight');
      existing.forEach(el => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent || ''), el);
          parent.normalize();
        }
      });
    }
  }, [visible, editorRef]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 12,
      zIndex: 'var(--z-max)',
      background: 'rgba(30,30,30,0.95)',
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      padding: '8px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      minWidth: 280,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          value={findText}
          onChange={e => setFindText(e.target.value)}
          placeholder="Find..."
          autoFocus
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            color: colors.text,
            fontSize: 13,
            padding: '4px 8px',
            outline: 'none',
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') doFind();
            if (e.key === 'Escape') onClose();
          }}
        />
        <span style={{ fontSize: 11, color: colors.textDim, minWidth: 40, textAlign: 'right' }}>
          {matchCount > 0 ? `${matchCount} found` : ''}
        </span>
        <button
          aria-label={showReplace ? 'Hide replace' : 'Show replace'}
          onClick={() => setShowReplace(!showReplace)}
          style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 11 }}
        >{showReplace ? 'Hide' : 'Replace'}</button>
        <button
          aria-label="Close find and replace"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 14 }}
        >x</button>
      </div>
      {showReplace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            value={replaceText}
            onChange={e => setReplaceText(e.target.value)}
            placeholder="Replace with..."
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              color: colors.text,
              fontSize: 13,
              padding: '4px 8px',
              outline: 'none',
            }}
          />
          <button
            aria-label="Replace next match"
            onClick={doReplace}
            style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 11 }}
          >One</button>
          <button
            aria-label="Replace all matches"
            onClick={doReplaceAll}
            style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 11 }}
          >All</button>
        </div>
      )}
    </div>
  );
});

FindReplace.displayName = 'FindReplace';

// ---------------------------------------------------------------------------
// TagEditor
// ---------------------------------------------------------------------------

interface TagEditorProps {
  tags: string[];
  allTags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

export const TagEditor: React.FC<TagEditorProps> = memo(({
  tags,
  allTags,
  onAdd,
  onRemove,
}) => {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredSuggestions = input.length > 0
    ? allTags.filter(t => t.toLowerCase().includes(input.toLowerCase()) && !tags.includes(t)).slice(0, 5)
    : [];

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
    }
    setInput('');
    setShowSuggestions(false);
  }, [tags, onAdd]);

  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {tags.map(tag => (
          <span
            key={tag}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: colors.accent,
              background: colors.accentDim,
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {tag}
            <button
              aria-label={`Remove tag ${tag}`}
              onClick={() => onRemove(tag)}
              style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 12, padding: 0 }}
            >x</button>
          </span>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 50)}
          onKeyDown={e => {
            if (e.key === 'Enter' && input.trim()) {
              e.preventDefault();
              addTag(input);
            }
          }}
          placeholder="Add tag..."
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.2)',
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            color: colors.text,
            fontSize: 12,
            padding: '4px 8px',
            outline: 'none',
          }}
        />
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            background: 'rgba(30,30,30,0.95)',
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            zIndex: 'var(--z-max)',
          }}>
            {filteredSuggestions.map(s => (
              <div
                key={s}
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  color: colors.text,
                  cursor: 'pointer',
                }}
                onMouseDown={e => { e.preventDefault(); addTag(s); }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

TagEditor.displayName = 'TagEditor';

// ---------------------------------------------------------------------------
// AttachmentPanel
// ---------------------------------------------------------------------------

interface AttachmentPanelProps {
  attachments: NoteAttachment[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
}

export const AttachmentPanel: React.FC<AttachmentPanelProps> = memo(({
  attachments,
  onAdd,
  onRemove,
  onOpen,
}) => {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
          Attachments ({attachments.length})
        </span>
        <button
          aria-label="Add attachment"
          onClick={onAdd}
          style={{
            background: 'none',
            border: 'none',
            color: colors.accent,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >+ Add</button>
      </div>
      {attachments.length === 0 && (
        <div style={{ fontSize: 12, color: colors.textMuted, padding: '8px 0' }}>
          No attachments
        </div>
      )}
      {attachments.map(att => (
        <div
          key={att.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 0',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth="1.5">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 12,
              color: colors.text,
              cursor: 'pointer',
            }}
            onClick={() => onOpen(att.id)}
            title={att.original_name}
          >
            {att.original_name}
          </div>
          <span style={{ fontSize: 10, color: colors.textDim, flexShrink: 0 }}>
            {formatSize(att.size)}
          </span>
          <button
            aria-label="Remove attachment"
            onClick={() => onRemove(att.id)}
            style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 12 }}
          >x</button>
        </div>
      ))}
    </div>
  );
});

AttachmentPanel.displayName = 'AttachmentPanel';

// ---------------------------------------------------------------------------
// TemplateSelector
// ---------------------------------------------------------------------------

interface TemplateSelectorProps {
  templates: NoteTemplate[];
  onSelect: (templateId: string) => void;
  onClose: () => void;
  visible: boolean;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = memo(({
  templates,
  onSelect,
  onClose,
  visible,
}) => {
  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
      zIndex: 'var(--z-max)',
    }}
    onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(35,35,35,0.98)',
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 24,
          minWidth: 400,
          maxWidth: 500,
          maxHeight: '70vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>Choose a Template</span>
          <button
            aria-label="Close template selector"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 18 }}
          >x</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(tmpl => (
            <div
              key={tmpl.id}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: 'var(--color-border-subtle)',
                border: `1px solid ${colors.border}`,
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onClick={() => { onSelect(tmpl.id); onClose(); }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-border-subtle)')}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                {tmpl.title}
              </div>
              <div style={{ fontSize: 12, color: colors.textDim }}>
                {tmpl.plain_text.slice(0, 80)}...
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
              No templates available
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

TemplateSelector.displayName = 'TemplateSelector';

// ---------------------------------------------------------------------------
// NoteStats
// ---------------------------------------------------------------------------

interface NoteStatsProps {
  stats: { total_notes: number; total_folders: number; total_tags: number; total_attachments: number; total_words: number } | null;
  visible: boolean;
  onClose: () => void;
}

export const NoteStats: React.FC<NoteStatsProps> = memo(({
  stats,
  visible,
  onClose,
}) => {
  if (!visible || !stats) return null;

  const items = [
    { label: 'Total Notes', value: stats.total_notes },
    { label: 'Total Folders', value: stats.total_folders },
    { label: 'Total Tags', value: stats.total_tags },
    { label: 'Total Attachments', value: stats.total_attachments },
    { label: 'Total Words', value: stats.total_words.toLocaleString() },
  ];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
      zIndex: 'var(--z-max)',
    }}
    onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(35,35,35,0.98)',
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 24,
          minWidth: 300,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>Notes Statistics</span>
          <button
            aria-label="Close statistics"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 18 }}
          >x</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: colors.textDim }}>{item.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

NoteStats.displayName = 'NoteStats';

// ---------------------------------------------------------------------------
// TitleInput
// ---------------------------------------------------------------------------

interface TitleInputProps {
  title: string;
  onChange: (title: string) => void;
  readOnly?: boolean;
}

export const TitleInput: React.FC<TitleInputProps> = memo(({ title, onChange, readOnly }) => {
  return (
    <input
      value={title}
      onChange={e => onChange(e.target.value)}
      readOnly={readOnly}
      placeholder="Untitled"
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: 'var(--color-text-primary)',
        fontSize: 24,
        fontWeight: 700,
        padding: '16px 32px 8px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    />
  );
});

TitleInput.displayName = 'TitleInput';
