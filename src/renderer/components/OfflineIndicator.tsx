/**
 * DEX Offline Indicator
 * Shows network status and enables graceful offline degradation
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useEffect, useCallback, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionStatus = 'online' | 'offline' | 'slow' | 'reconnecting';

export interface OfflineState {
  status: ConnectionStatus;
  lastOnline: number;
  offlineSince: number | null;
  reconnectAttempts: number;
  pendingActions: PendingAction[];
}

export interface PendingAction {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  retryCount: number;
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-offline-queue';

function loadPendingActions(): PendingAction[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function savePendingActions(actions: PendingAction[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(actions)); } catch {}
}

// ============================================================================
// HOOK: useOnlineStatus
// ============================================================================

export function useOnlineStatus(): OfflineState {
  const [state, setState] = useState<OfflineState>({
    status: navigator.onLine ? 'online' : 'offline',
    lastOnline: Date.now(),
    offlineSince: navigator.onLine ? null : Date.now(),
    reconnectAttempts: 0,
    pendingActions: loadPendingActions(),
  });

  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({
        ...prev,
        status: 'online',
        lastOnline: Date.now(),
        offlineSince: null,
        reconnectAttempts: 0,
      }));
    };

    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        status: 'offline',
        offlineSince: Date.now(),
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Connection quality check (every 30s when online)
    const interval = setInterval(() => {
      if (navigator.onLine) {
        const conn = (navigator as any).connection;
        if (conn && conn.effectiveType === '2g') {
          setState(prev => ({ ...prev, status: 'slow' }));
        } else if (conn) {
          setState(prev => prev.status !== 'online' ? { ...prev, status: 'online' } : prev);
        }
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return state;
}

// ============================================================================
// HOOK: useOfflineQueue
// ============================================================================

export function useOfflineQueue() {
  const [queue, setQueue] = useState<PendingAction[]>(loadPendingActions);

  const enqueue = useCallback((action: Omit<PendingAction, 'id' | 'timestamp' | 'retryCount'>) => {
    const newAction: PendingAction = {
      ...action,
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      retryCount: 0,
    };
    setQueue(prev => {
      const next = [...prev, newAction];
      savePendingActions(next);
      return next;
    });
  }, []);

  const dequeue = useCallback((id: string) => {
    setQueue(prev => {
      const next = prev.filter(a => a.id !== id);
      savePendingActions(next);
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    savePendingActions([]);
  }, []);

  return { queue, enqueue, dequeue, clearQueue };
}

// ============================================================================
// COMPONENT: OfflineIndicator
// ============================================================================

export const OfflineIndicator: React.FC = memo(() => {
  const { status, offlineSince, pendingActions } = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed when status changes
  useEffect(() => { setDismissed(false); }, [status]);

  if (status === 'online' || dismissed) return null;

  const duration = offlineSince ? Math.round((Date.now() - offlineSince) / 1000) : 0;
  const formatDuration = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    return `${(s / 3600).toFixed(1)}h`;
  };

  return (
    <div
      style={{
        ...styles.banner,
        background: status === 'offline' ? 'rgba(239,68,68,0.9)' : 'rgba(245,158,11,0.9)',
      }}
      role="alert"
      aria-live="polite"
    >
      <div style={styles.bannerContent}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
          {status === 'offline' ? (
            <>
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </>
          ) : (
            <>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </>
          )}
        </svg>
        <div>
          <strong>{status === 'offline' ? 'You are offline' : 'Slow connection detected'}</strong>
          {status === 'offline' && duration > 0 && <span style={{ opacity: 0.8, marginLeft: 8, fontSize: 12 }}>({formatDuration(duration)})</span>}
          <span style={{ display: 'block', fontSize: 11, opacity: 0.8, marginTop: 1 }}>
            {status === 'offline'
              ? `DEX is running in offline mode. ${pendingActions.length > 0 ? `${pendingActions.length} action(s) queued.` : 'Changes are saved locally.'}`
              : 'Some features may be slower than usual.'}
          </span>
        </div>
      </div>
      <button onClick={() => setDismissed(true)} style={styles.dismissBtn} aria-label="Dismiss notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
});

OfflineIndicator.displayName = 'OfflineIndicator';

// ============================================================================
// COMPONENT: OfflineQueue Panel
// ============================================================================

export const OfflineQueuePanel: React.FC<{ onClose?: () => void }> = memo(({ onClose }) => {
  const { queue, dequeue, clearQueue } = useOfflineQueue();

  return (
    <div style={styles.panel} role="dialog" aria-label="Offline Action Queue">
      <div style={styles.panelHeader}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Pending Actions</h3>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{queue.length} queued</span>
      </div>
      {queue.length === 0 ? (
        <div style={styles.emptyState}>No pending actions. You are all caught up.</div>
      ) : (
        <div style={styles.queueList}>
          {queue.map(action => (
            <div key={action.id} style={styles.queueItem}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{action.description}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {action.type} -- {new Date(action.timestamp).toLocaleTimeString()}
                </div>
              </div>
              <button onClick={() => dequeue(action.id)} style={styles.removeBtn} aria-label={`Remove ${action.description}`}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {queue.length > 0 && (
        <button onClick={clearQueue} style={styles.clearBtn}>Clear All</button>
      )}
    </div>
  );
});

OfflineQueuePanel.displayName = 'OfflineQueuePanel';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 16px', color: '#fff', backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
  },
  bannerContent: { display: 'flex', alignItems: 'center', gap: 10 },
  dismissBtn: {
    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
    padding: 4, cursor: 'pointer', color: '#fff', display: 'flex',
  },
  panel: {
    padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
    background: 'var(--color-surface, #1c1c1e)', borderRadius: 12,
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  emptyState: { fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: 20 },
  queueList: { display: 'flex', flexDirection: 'column', gap: 6 },
  queueItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
  },
  removeBtn: {
    fontSize: 11, padding: '3px 8px', borderRadius: 4, border: 'none',
    background: 'rgba(239,68,68,0.15)', color: '#ef4444', cursor: 'pointer', fontWeight: 600,
  },
  clearBtn: {
    padding: '8px 0', borderRadius: 8, border: 'none',
    background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
  },
};

export default OfflineIndicator;
