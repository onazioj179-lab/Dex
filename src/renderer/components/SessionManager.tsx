/**
 * DEX Session Manager
 * Handles session persistence, restore, and recent files
 */
import React, { useState, useEffect, useMemo } from 'react';

// Icons
const Icons = {
  file: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  folder: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  clock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>,
};

// Session types
export interface SessionState {
  runningApps: string[];
  activeApp: string | null;
  appStates: Record<string, unknown>;
  timestamp: number;
}

export interface RecentFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder' | 'project';
  appId: string;
  timestamp: number;
  pinned?: boolean;
}

// Session management functions
const SESSION_KEY = 'dex-session-state';
const RECENT_FILES_KEY = 'dex-recent-files';

export const saveSession = (state: Partial<SessionState>) => {
  try {
    const current = getSession();
    const updated: SessionState = {
      runningApps: state.runningApps ?? current?.runningApps ?? [],
      activeApp: state.activeApp ?? current?.activeApp ?? null,
      appStates: state.appStates ?? current?.appStates ?? {},
      timestamp: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save session:', error);
  }
};

export const getSession = (): SessionState | null => {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

// Check if session is recent (within last 24 hours)
export const isSessionValid = (session: SessionState | null): boolean => {
  if (!session) return false;
  const age = Date.now() - session.timestamp;
  return age < 24 * 60 * 60 * 1000; // 24 hours
};

// Recent files management
export const getRecentFiles = (): RecentFile[] => {
  try {
    const saved = localStorage.getItem(RECENT_FILES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const addRecentFile = (file: Omit<RecentFile, 'id' | 'timestamp'>) => {
  const files = getRecentFiles();
  const existing = files.findIndex(f => f.path === file.path);
  
  const newFile: RecentFile = {
    ...file,
    id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };
  
  let updated: RecentFile[];
  if (existing >= 0) {
    // Update existing entry
    updated = [{ ...files[existing], timestamp: Date.now() }, ...files.filter((_, i) => i !== existing)];
  } else {
    // Add new entry
    updated = [newFile, ...files].slice(0, 50); // Keep last 50
  }
  
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
  return updated;
};

export const removeRecentFile = (id: string) => {
  const files = getRecentFiles().filter(f => f.id !== id);
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
  return files;
};

export const togglePinFile = (id: string) => {
  const files = getRecentFiles().map(f => 
    f.id === id ? { ...f, pinned: !f.pinned } : f
  );
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
  return files;
};

export const clearRecentFiles = () => {
  const files = getRecentFiles().filter(f => f.pinned);
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
  return files;
};

// Hook for recent files
export const useRecentFiles = () => {
  const [files, setFiles] = useState<RecentFile[]>([]);
  
  useEffect(() => {
    setFiles(getRecentFiles());
  }, []);
  
  return {
    files,
    add: (file: Omit<RecentFile, 'id' | 'timestamp'>) => setFiles(addRecentFile(file)),
    remove: (id: string) => setFiles(removeRecentFile(id)),
    togglePin: (id: string) => setFiles(togglePinFile(id)),
    clear: () => setFiles(clearRecentFiles()),
  };
};

// Format timestamp for display
const formatTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

// Get file icon based on type
const getFileIcon = (type: RecentFile['type']) => {
  switch (type) {
    case 'folder': return Icons.folder;
    case 'project': return Icons.folder;
    default: return Icons.file;
  }
};

// Get color based on app
const getAppColor = (appId: string): string => {
  const colors: Record<string, string> = {
    imosion: '#a855f7',
    videoeditor: '#f43f5e',
    prism: '#ec4899',
    flux: '#f97316',
    forge: '#14b8a6',
    notes: '#f59e0b',
    files: '#3b82f6',
  };
  return colors[appId] || '#6366f1';
};

// Recent Files Hub Panel
interface RecentFilesHubProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFile?: (file: RecentFile) => void;
}

export const RecentFilesHub: React.FC<RecentFilesHubProps> = ({ isOpen, onClose, onOpenFile }) => {
  const { files, remove, togglePin, clear } = useRecentFiles();
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const apps = useMemo(() => {
    const appSet = new Set(files.map(f => f.appId));
    return ['all', ...Array.from(appSet)];
  }, [files]);

  const filteredFiles = useMemo(() => {
    return files
      .filter(f => filter === 'all' || f.appId === filter)
      .filter(f => searchQuery === '' || 
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.path.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        // Pinned files first, then by timestamp
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.timestamp - a.timestamp;
      });
  }, [files, filter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            {Icons.clock}
            <span>Recent Files</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>{Icons.x}</button>
        </div>

        <div style={styles.toolbar}>
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={styles.filterSelect}
          >
            {apps.map(app => (
              <option key={app} value={app}>
                {app === 'all' ? 'All Apps' : app.charAt(0).toUpperCase() + app.slice(1)}
              </option>
            ))}
          </select>
          <button onClick={clear} style={styles.clearBtn} title="Clear unpinned">
            {Icons.trash}
          </button>
        </div>

        <div style={styles.list}>
          {filteredFiles.length === 0 ? (
            <div style={styles.empty}>
              <div style={{ color: '#3f3f46' }}>{Icons.file}</div>
              <span>No recent files</span>
            </div>
          ) : (
            filteredFiles.map(file => (
              <div
                key={file.id}
                style={styles.item}
                onClick={() => onOpenFile?.(file)}
              >
                <div style={{ ...styles.itemIcon, color: getAppColor(file.appId) }}>
                  {getFileIcon(file.type)}
                </div>
                <div style={styles.itemContent}>
                  <div style={styles.itemName}>{file.name}</div>
                  <div style={styles.itemPath}>{file.path}</div>
                </div>
                <div style={styles.itemMeta}>
                  <span style={styles.itemTime}>{formatTime(file.timestamp)}</span>
                  <span style={{ ...styles.itemApp, color: getAppColor(file.appId) }}>
                    {file.appId}
                  </span>
                </div>
                <div style={styles.itemActions}>
                  <button
                    onClick={e => { e.stopPropagation(); togglePin(file.id); }}
                    style={{
                      ...styles.actionBtn,
                      color: file.pinned ? '#f59e0b' : '#52525b',
                    }}
                    title={file.pinned ? 'Unpin' : 'Pin'}
                  >{Icons.pin}</button>
                  <button
                    onClick={e => { e.stopPropagation(); remove(file.id); }}
                    style={styles.actionBtn}
                    title="Remove"
                  >{Icons.x}</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Session Restore Dialog
interface SessionRestoreDialogProps {
  session: SessionState;
  onRestore: () => void;
  onDismiss: () => void;
}

export const SessionRestoreDialog: React.FC<SessionRestoreDialogProps> = ({ session, onRestore, onDismiss }) => {
  return (
    <div style={dialogStyles.overlay}>
      <div style={dialogStyles.dialog}>
        <div style={dialogStyles.icon}>{Icons.refresh}</div>
        <h3 style={dialogStyles.title}>Restore Previous Session?</h3>
        <p style={dialogStyles.message}>
          You had {session.runningApps.length} app(s) open when you last closed DEX.
          Would you like to restore them?
        </p>
        <div style={dialogStyles.apps}>
          {session.runningApps.slice(0, 5).map(appId => (
            <span key={appId} style={dialogStyles.appBadge}>{appId}</span>
          ))}
          {session.runningApps.length > 5 && (
            <span style={dialogStyles.moreApps}>+{session.runningApps.length - 5} more</span>
          )}
        </div>
        <div style={dialogStyles.actions}>
          <button onClick={onDismiss} style={dialogStyles.dismissBtn}>Start Fresh</button>
          <button onClick={onRestore} style={dialogStyles.restoreBtn}>Restore Session</button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.3)',
    zIndex: 99998,
  },
  panel: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '600px',
    maxHeight: '70vh',
    background: 'var(--color-bg-primary, #18181b)',
    borderRadius: '12px',
    border: '1px solid var(--color-border, #27272a)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid var(--color-border, #27272a)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #fafafa)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
  },
  toolbar: {
    display: 'flex',
    gap: '8px',
    padding: '10px 16px',
    borderBottom: '1px solid var(--color-border, #27272a)',
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    background: 'var(--color-bg-secondary, #111113)',
    border: '1px solid var(--color-border, #27272a)',
    borderRadius: '6px',
    color: 'var(--color-text-primary, #fafafa)',
    fontSize: '13px',
    outline: 'none',
  },
  filterSelect: {
    padding: '8px 12px',
    background: 'var(--color-bg-secondary, #111113)',
    border: '1px solid var(--color-border, #27272a)',
    borderRadius: '6px',
    color: 'var(--color-text-primary, #fafafa)',
    fontSize: '12px',
    outline: 'none',
    cursor: 'pointer',
  },
  clearBtn: {
    padding: '8px',
    background: 'transparent',
    border: '1px solid var(--color-border, #27272a)',
    borderRadius: '6px',
    color: '#71717a',
    cursor: 'pointer',
    display: 'flex',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '40px',
    color: '#52525b',
    fontSize: '13px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '4px',
    transition: 'background 0.15s',
  },
  itemIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-primary, #fafafa)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemPath: {
    fontSize: '11px',
    color: '#52525b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemMeta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
  },
  itemTime: {
    fontSize: '10px',
    color: '#52525b',
  },
  itemApp: {
    fontSize: '10px',
    fontWeight: 500,
  },
  itemActions: {
    display: 'flex',
    gap: '4px',
  },
  actionBtn: {
    padding: '4px',
    background: 'transparent',
    border: 'none',
    color: '#52525b',
    cursor: 'pointer',
    display: 'flex',
    borderRadius: '4px',
  },
};

const dialogStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  dialog: {
    width: '400px',
    padding: '24px',
    background: 'var(--color-bg-primary, #18181b)',
    borderRadius: '12px',
    border: '1px solid var(--color-border, #27272a)',
    textAlign: 'center',
  },
  icon: {
    width: '48px',
    height: '48px',
    margin: '0 auto 16px',
    borderRadius: '50%',
    background: 'rgba(59, 130, 246, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#3b82f6',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #fafafa)',
    margin: '0 0 8px',
  },
  message: {
    fontSize: '13px',
    color: '#a1a1aa',
    margin: '0 0 16px',
    lineHeight: 1.5,
  },
  apps: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  appBadge: {
    padding: '4px 10px',
    background: 'var(--color-bg-secondary, #111113)',
    borderRadius: '4px',
    fontSize: '11px',
    color: '#a1a1aa',
    textTransform: 'capitalize',
  },
  moreApps: {
    fontSize: '11px',
    color: '#52525b',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  dismissBtn: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid var(--color-border, #27272a)',
    borderRadius: '6px',
    color: '#a1a1aa',
    fontSize: '13px',
    cursor: 'pointer',
  },
  restoreBtn: {
    padding: '10px 20px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
};

export default RecentFilesHub;
