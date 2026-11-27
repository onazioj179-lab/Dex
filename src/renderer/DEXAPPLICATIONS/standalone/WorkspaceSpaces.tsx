/**
 * DEX Platform - Workspace Spaces
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Snapshot the current workspace -- which apps are open plus the active Project
 * Space -- into a named "Space", then restore it later with one click. Spaces
 * persist to localStorage; restoring closes current non-home apps (optional),
 * re-opens each captured app via the `dex-open-app` event, and re-selects the
 * captured Project Space (Stage) if it still exists.
 */
import React, { useState, useEffect, useCallback, memo } from 'react';
import { useRunningApps, APP_DEFINITIONS } from '../../store/runningApps';
import { useStageStore } from '../../store/stageStore';
import { persistOrWarn } from '../../utils/persistOrWarn';

// ---------------------------------------------------------------------------
// Model + persistence
// ---------------------------------------------------------------------------

interface WorkspaceSpace {
  id: string;
  name: string;
  appIds: string[];
  /** Active Project Space (Stage) id at capture time, if any. */
  projectId?: string;
  /** Human-readable project name at capture time (for display if the stage is gone). */
  projectName?: string;
  createdAt: number;
}

const STORAGE_KEY = 'dex-workspace-spaces-v1';

function loadSpaces(): WorkspaceSpace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is WorkspaceSpace =>
          !!s &&
          typeof s === 'object' &&
          typeof s.id === 'string' &&
          typeof s.name === 'string' &&
          Array.isArray(s.appIds),
      )
      .map((s) => ({
        id: s.id,
        name: s.name,
        appIds: s.appIds.filter((a: unknown): a is string => typeof a === 'string'),
        projectId: typeof s.projectId === 'string' ? s.projectId : undefined,
        projectName: typeof s.projectName === 'string' ? s.projectName : undefined,
        createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

function saveSpaces(spaces: WorkspaceSpace[]): void {
  try {
    persistOrWarn(STORAGE_KEY, JSON.stringify(spaces), 'your Spaces');
  } catch {
    /* persistence is best-effort; never block the UI */
  }
}

const newId = (): string =>
  `space_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function toast(type: 'success' | 'info' | 'warning' | 'error', message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch {
    /* noop */
  }
}

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/** App ids that are not user-captured workspace context (the shell home surface). */
const HOME_APP_IDS = new Set(['home']);
let restoreGeneration = 0;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const WorkspaceSpaces: React.FC = () => {
  const runningApps = useRunningApps((st) => st.runningApps);

  const [spaces, setSpaces] = useState<WorkspaceSpace[]>(() => loadSpaces());
  const [newName, setNewName] = useState('');
  const [closeOthers, setCloseOthers] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Persist on every change.
  useEffect(() => {
    saveSpaces(spaces);
  }, [spaces]);

  const captureCandidates = runningApps
    .map((a) => a.id)
    .filter((id) => !HOME_APP_IDS.has(id));

  const saveCurrent = useCallback(() => {
    const appIds = useRunningApps
      .getState()
      .runningApps.map((a) => a.id)
      .filter((id) => !HOME_APP_IDS.has(id));

    if (appIds.length === 0) {
      toast('warning', 'No open apps to capture');
      return;
    }

    const activeStage = useStageStore.getState().getActiveStage();
    const name = newName.trim() || `Space ${spaces.length + 1}`;

    const space: WorkspaceSpace = {
      id: newId(),
      name,
      appIds,
      projectId: activeStage?.id,
      projectName: activeStage?.name,
      createdAt: Date.now(),
    };

    setSpaces((prev) => [space, ...prev]);
    setNewName('');
    toast('success', `Saved "${name}" (${appIds.length} app${appIds.length === 1 ? '' : 's'})`);
  }, [newName, spaces.length]);

  const restoreSpace = useCallback(
    (space: WorkspaceSpace) => {
      const generation = ++restoreGeneration;
      // Re-select the captured Project Space (Stage) first so window restoration
      // and accent land in the right context. Silently skip if it's gone.
      if (space.projectId) {
        try {
          const stage = useStageStore.getState().getStage(space.projectId);
          if (stage) useStageStore.getState().setActiveStage(space.projectId);
        } catch {
          /* stage selection is best-effort */
        }
      }

      // Optionally close current non-home apps that are not part of the Space.
      if (closeOthers) {
        try {
          const keep = new Set(space.appIds);
          const current = useRunningApps.getState().runningApps;
          for (const a of current) {
            if (HOME_APP_IDS.has(a.id)) continue;
            if (keep.has(a.id)) continue;
            window.dispatchEvent(new CustomEvent('dex-close-app', { detail: { appId: a.id } }));
          }
        } catch {
          /* closing is best-effort */
        }
      }

      // Open each captured app, staggered so the shell processes them in order.
      space.appIds.forEach((appId, i) => {
        window.setTimeout(() => {
          if (generation !== restoreGeneration) return;
          try {
            window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId } }));
          } catch {
            /* per-app open failure is non-fatal */
          }
        }, i * 120);
      });

      toast('info', `Restoring "${space.name}"...`);
    },
    [closeOthers],
  );

  const beginRename = useCallback((space: WorkspaceSpace) => {
    setEditingId(space.id);
    setEditingName(space.name);
  }, []);

  const commitRename = useCallback(() => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (trimmed) {
      setSpaces((prev) =>
        prev.map((s) => (s.id === editingId ? { ...s, name: trimmed } : s)),
      );
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName]);

  const deleteSpace = useCallback((id: string) => {
    setSpaces((prev) => prev.filter((s) => s.id !== id));
    toast('info', 'Space deleted');
  }, []);

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.title}>Workspace Spaces</div>
          <div style={s.subtitle}>
            Snapshot the apps you have open into a named Space, then restore it in one click.
          </div>
        </div>
      </div>

      {/* Capture bar */}
      <div style={s.captureBar}>
        <input
          style={s.nameInput}
          placeholder={`Name this Space (${captureCandidates.length} app${
            captureCandidates.length === 1 ? '' : 's'
          } open)`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveCurrent();
          }}
          maxLength={60}
        />
        <button
          style={{
            ...s.primaryBtn,
            ...(captureCandidates.length === 0 ? s.primaryBtnDisabled : {}),
          }}
          onClick={saveCurrent}
          disabled={captureCandidates.length === 0}
          title="Save the currently open apps as a Space"
        >
          Save current
        </button>
      </div>

      {/* Restore option */}
      <label style={s.optionRow}>
        <input
          type="checkbox"
          checked={closeOthers}
          onChange={(e) => setCloseOthers(e.target.checked)}
        />
        <span style={s.optionLabel}>Close other apps when restoring</span>
      </label>

      {/* List */}
      <div style={s.list}>
        {spaces.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <div style={s.emptyTitle}>No saved Spaces yet</div>
            <div style={s.emptyHint}>
              Open the apps you work with, then type a name above and hit Save current. Restore the
              exact set later with one click.
            </div>
          </div>
        ) : (
          spaces.map((space) => (
            <SpaceCard
              key={space.id}
              space={space}
              isEditing={editingId === space.id}
              editingName={editingName}
              onEditingNameChange={setEditingName}
              onBeginRename={() => beginRename(space)}
              onCommitRename={commitRename}
              onRestore={() => restoreSpace(space)}
              onDelete={() => deleteSpace(space.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Space card
// ---------------------------------------------------------------------------

interface SpaceCardProps {
  space: WorkspaceSpace;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (name: string) => void;
  onBeginRename: () => void;
  onCommitRename: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

const SpaceCard: React.FC<SpaceCardProps> = memo(
  ({
    space,
    isEditing,
    editingName,
    onEditingNameChange,
    onBeginRename,
    onCommitRename,
    onRestore,
    onDelete,
  }) => {
    const apps = space.appIds.map((id) => ({ id, def: APP_DEFINITIONS[id] }));

    return (
      <div className="dex-liquid-glass-strong" style={s.card}>
        <div style={s.cardHeader}>
          {isEditing ? (
            <input
              style={s.renameInput}
              value={editingName}
              autoFocus
              onChange={(e) => onEditingNameChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitRename();
                if (e.key === 'Escape') onCommitRename();
              }}
              maxLength={60}
            />
          ) : (
            <button style={s.cardName} onClick={onBeginRename} title="Rename">
              {space.name}
            </button>
          )}
          <div style={s.cardMeta}>
            {space.appIds.length} app{space.appIds.length === 1 ? '' : 's'} &middot;{' '}
            {fmtDate(space.createdAt)}
          </div>
        </div>

        {space.projectName ? (
          <div style={s.projectRow}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span style={s.projectName}>{space.projectName}</span>
          </div>
        ) : null}

        <div style={s.appsRow}>
          {apps.map(({ id, def }) => (
            <div key={id} style={s.appChip} title={def?.name ?? id}>
              <span
                style={{
                  ...s.appDot,
                  background: def?.color ?? 'var(--color-text-tertiary)',
                }}
              />
              <span style={s.appLabel}>{def?.name ?? id}</span>
            </div>
          ))}
        </div>

        <div style={s.cardActions}>
          <button style={s.restoreBtn} onClick={onRestore} title="Open every app in this Space">
            Restore
          </button>
          <button style={s.iconBtn} onClick={onBeginRename} title="Rename" aria-label="Rename">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          </button>
          <button style={s.iconBtn} onClick={onDelete} title="Delete" aria-label="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    );
  },
);
SpaceCard.displayName = 'SpaceCard';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    background: 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
  },
  header: {
    padding: '20px 24px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: '-0.01em',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
    marginTop: 4,
  },
  captureBar: {
    display: 'flex',
    gap: 10,
    padding: '16px 24px 8px',
  },
  nameInput: {
    flex: 1,
    height: 36,
    padding: '0 12px',
    fontSize: 13,
    color: 'var(--color-text-primary)',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-md)',
    outline: 'none',
  },
  primaryBtn: {
    height: 36,
    padding: '0 18px',
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    background: 'var(--color-accent-fill)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  primaryBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 24px 12px',
    cursor: 'pointer',
  },
  optionLabel: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '48px 24px',
    color: 'var(--color-text-muted)',
  },
  emptyIcon: {
    color: 'var(--color-text-tertiary)',
    marginBottom: 14,
    opacity: 0.7,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 13,
    maxWidth: 360,
    lineHeight: 1.5,
  },
  card: {
    borderRadius: 'var(--radius-lg)',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardName: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'text',
    textAlign: 'left',
  },
  renameInput: {
    flex: 1,
    height: 28,
    padding: '0 8px',
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    background: 'var(--color-bg-primary)',
    border: '1px solid var(--color-accent)',
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
  },
  cardMeta: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
  },
  projectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: 'var(--color-text-tertiary)',
  },
  projectName: {
    fontSize: 12,
    fontWeight: 500,
  },
  appsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  appChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 9px',
    background: 'var(--color-bg-primary)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 9999,
    maxWidth: 160,
  },
  appDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  appLabel: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  restoreBtn: {
    flex: 1,
    height: 34,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-accent)',
    background: 'var(--color-accent-soft, rgba(10,132,255,0.12))',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },
  iconBtn: {
    width: 34,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-muted)',
    background: 'transparent',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },
};

export default WorkspaceSpaces;
