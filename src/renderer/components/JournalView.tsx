/**
 * DEX System Journal View - Main journal display component
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Three viewing modes:
 * - Timeline: Chronological with date grouping, pagination, date jump bar
 * - By App: Collapsible sections per app with counts
 * - By Session: Session cards with entry counts and durations
 *
 * Includes search bar, manage history panel, and insights sidebar.
 */

import React, { useEffect, useCallback, useRef, useState, memo, useMemo } from 'react';
import {
  useJournalStore,
  type JournalEntry,
  type JournalSession,
  type AppGroup,
  type JournalViewMode,
} from '../store/journalStore';
import JournalInsights from './JournalInsights';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid var(--color-bg-hover)',
    flexShrink: 0,
  },
  modeBtn: {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  modeBtnActive: {
    background: 'rgba(10,132,255,0.15)',
    color: 'var(--color-accent)',
    borderColor: 'rgba(10,132,255,0.3)',
  },
  searchBox: {
    flex: 1,
    padding: '5px 10px',
    fontSize: 12,
    background: 'var(--color-border-subtle)',
    border: '1px solid var(--color-bg-hover)',
    borderRadius: 6,
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  manageBtn: {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  entriesPane: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 12px',
  },
  insightsPane: {
    width: 280,
    borderLeft: '1px solid var(--color-bg-hover)',
    overflowY: 'auto',
    flexShrink: 0,
  },
  dateHeader: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '12px 0 4px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
    marginBottom: 4,
  },
  entryRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '5px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
    fontSize: 12,
  },
  entryTime: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: 'var(--color-text-tertiary)',
    whiteSpace: 'nowrap' as const,
    minWidth: 64,
    flexShrink: 0,
    paddingTop: 1,
  },
  entryApp: {
    fontSize: 10,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 3,
    background: 'rgba(10,132,255,0.12)',
    color: 'var(--color-accent)',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  entryAction: {
    color: 'var(--color-text-primary)',
    fontSize: 12,
    lineHeight: '1.4',
  },
  entryDetail: {
    color: 'var(--color-text-tertiary)',
    fontSize: 11,
    marginTop: 1,
    lineHeight: '1.3',
  },
  loadMoreBtn: {
    display: 'block',
    width: '100%',
    padding: '8px 0',
    margin: '8px 0',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid var(--color-bg-hover)',
    borderRadius: 6,
    background: 'var(--color-border-subtle)',
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    color: 'var(--color-text-tertiary)',
    fontSize: 13,
    gap: 8,
  },
  appSection: {
    marginBottom: 8,
  },
  appHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    cursor: 'pointer',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  appName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  appCount: {
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    fontFamily: 'monospace',
  },
  appLastUsed: {
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    marginLeft: 'auto',
  },
  sessionCard: {
    padding: '10px 12px',
    marginBottom: 6,
    borderRadius: 8,
    border: '1px solid var(--color-bg-hover)',
    background: 'var(--color-border-subtle)',
    cursor: 'pointer',
  },
  sessionCardActive: {
    borderColor: 'rgba(10,132,255,0.3)',
    background: 'rgba(10,132,255,0.06)',
  },
  sessionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sessionId: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'var(--color-accent)',
    fontWeight: 600,
  },
  sessionMeta: {
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
  },
  managePanel: {
    position: 'absolute' as const,
    top: 40,
    right: 12,
    width: 320,
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    padding: 16,
    zIndex: 100,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  manageSectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginBottom: 8,
    marginTop: 12,
  },
  manageRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  manageDateInput: {
    flex: 1,
    padding: '4px 8px',
    fontSize: 11,
    background: 'var(--color-border-subtle)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  manageActionBtn: {
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    background: 'var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
  // Note: For disabled buttons, apply inline: style={{...S.manageActionBtn, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer'}}
  manageDangerBtn: {
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid rgba(255,59,48,0.3)',
    borderRadius: 6,
    background: 'rgba(255,59,48,0.08)',
    color: 'var(--color-error)',
    cursor: 'pointer',
  },
  manageSelect: {
    flex: 1,
    padding: '4px 8px',
    fontSize: 11,
    background: 'var(--color-border-subtle)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  exportRow: {
    display: 'flex',
    gap: 6,
    marginTop: 4,
  },
  statsRow: {
    display: 'flex',
    gap: 16,
    padding: '8px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--color-accent)',
    lineHeight: '1',
  },
  statLabel: {
    fontSize: 9,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginTop: 2,
  },
};

// ---------------------------------------------------------------------------
// App Color Map
// ---------------------------------------------------------------------------

const APP_COLORS: Record<string, string> = {
  DEX: '#bf5af2',
  Calculator: 'var(--color-warning)',
  Calendar: 'var(--color-success)',
  Flux: '#ff375f',
  Forge: 'var(--color-accent)',
  Games: '#ff6723',
  Kanban: '#5e5ce6',
  Notes: 'var(--color-warning)',
  Rewind: '#ac8e68',
  Tasks: '#64d2ff',
  Browser: 'var(--color-accent)',
  Files: 'var(--color-success)',
  Gallery: '#ff375f',
  Audio: '#bf5af2',
  Video: 'var(--color-warning)',
  Prism: '#5e5ce6',
  Imosion: '#ff375f',
  Achievements: 'var(--color-warning)',
};

function getAppColor(app: string): string {
  return APP_COLORS[app] || 'var(--color-accent)';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 60000) return '<1 min';
  if (ms < 3600000) return `${Math.round(ms / 60000)} min`;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.round((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

function groupEntriesByDate(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const dateStr = new Date(entry.timestamp).toISOString().slice(0, 10);
    const group = groups.get(dateStr) || [];
    group.push(entry);
    groups.set(dateStr, group);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Entry Row Component
// ---------------------------------------------------------------------------

const EntryRow = memo(({ entry }: { entry: JournalEntry }) => {
  const color = getAppColor(entry.app);
  return (
    <div style={S.entryRow}>
      <span style={S.entryTime}>{formatTime(entry.timestamp)}</span>
      <span style={{ ...S.entryApp, background: `${color}18`, color }}>{entry.app}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.entryAction}>{entry.action}</div>
        {entry.detail && <div style={S.entryDetail}>{entry.detail}</div>}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Timeline View
// ---------------------------------------------------------------------------

const TimelineView: React.FC = () => {
  const { entries, loading, hasMore, loadMore } = useJournalStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const dateGroups = useMemo(() => groupEntriesByDate(entries), [entries]);

  if (entries.length === 0 && !loading) {
    return (
      <div style={S.emptyState}>
        <span style={{ fontSize: 24, opacity: 0.3 }}>No journal entries yet</span>
        <span>Activity from all DEX apps will appear here</span>
      </div>
    );
  }

  return (
    <div ref={scrollRef}>
      {Array.from(dateGroups.entries()).map(([dateStr, dayEntries]) => (
        <div key={dateStr}>
          <div style={S.dateHeader}>
            {formatDate(new Date(dateStr + 'T12:00:00').getTime())} -- {dayEntries.length} entries
          </div>
          {dayEntries.map(entry => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      ))}
      {hasMore && (
        <button style={S.loadMoreBtn} onClick={loadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Load more entries'}
        </button>
      )}
      {loading && entries.length === 0 && (
        <div style={S.emptyState}>
          <span>Loading journal...</span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// By App View
// ---------------------------------------------------------------------------

const ByAppView: React.FC = () => {
  const { appGroups, selectedApp, setSelectedApp, entries, loading, hasMore, loadMore, loadAppGroups } = useJournalStore();
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  useEffect(() => {
    loadAppGroups();
  }, [loadAppGroups]);

  const handleAppClick = (app: string) => {
    if (expandedApp === app) {
      setExpandedApp(null);
      setSelectedApp(null);
    } else {
      setExpandedApp(app);
      setSelectedApp(app);
    }
  };

  if (appGroups.length === 0 && !loading) {
    return (
      <div style={S.emptyState}>
        <span style={{ fontSize: 24, opacity: 0.3 }}>No apps recorded yet</span>
        <span>Start using DEX apps to see them here</span>
      </div>
    );
  }

  return (
    <div>
      {appGroups.map(group => {
        const color = getAppColor(group.app);
        const isExpanded = expandedApp === group.app;

        return (
          <div key={group.app} style={S.appSection}>
            <div style={S.appHeader} onClick={() => handleAppClick(group.app)}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={S.appName}>{group.app}</span>
              <span style={S.appCount}>{group.count} entries</span>
              <span style={S.appLastUsed}>{formatRelativeTime(group.last_used)}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                {'>'}
              </span>
            </div>
            {isExpanded && selectedApp === group.app && (
              <div style={{ paddingLeft: 18 }}>
                {entries.map(entry => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
                {entries.length === 0 && loading && (
                  <div style={{ padding: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Loading...</div>
                )}
                {hasMore && (
                  <button style={S.loadMoreBtn} onClick={loadMore} disabled={loading}>
                    {loading ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// By Session View
// ---------------------------------------------------------------------------

const BySessionView: React.FC = () => {
  const { sessions, currentSessionId, selectedSession, setSelectedSession, entries, loading, hasMore, loadMore, loadSessions } = useJournalStore();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  if (sessions.length === 0 && !loading) {
    return (
      <div style={S.emptyState}>
        <span style={{ fontSize: 24, opacity: 0.3 }}>No sessions recorded yet</span>
        <span>Each DEX launch creates a new session</span>
      </div>
    );
  }

  return (
    <div>
      {sessions.map(session => {
        const isCurrent = session.id === currentSessionId;
        const isSelected = selectedSession === session.id;
        const duration = session.ended_at
          ? session.ended_at - session.started_at
          : Date.now() - session.started_at;

        return (
          <div key={session.id}>
            <div
              style={{ ...S.sessionCard, ...(isSelected ? S.sessionCardActive : {}) }}
              onClick={() => setSelectedSession(isSelected ? null : session.id)}
            >
              <div style={S.sessionHeader}>
                <span style={S.sessionId}>{session.id.slice(0, 8)}...</span>
                {isCurrent && (
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(48,209,88,0.15)', color: 'var(--color-success)', fontWeight: 600 }}>
                    CURRENT
                  </span>
                )}
              </div>
              <div style={S.sessionMeta}>
                {formatDate(session.started_at)} at {formatTime(session.started_at)}
                {' -- '}
                {formatDuration(duration)}
                {' -- '}
                {session.entry_count} entries
              </div>
            </div>
            {isSelected && (
              <div style={{ paddingLeft: 12, paddingBottom: 8 }}>
                {entries.map(entry => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
                {entries.length === 0 && loading && (
                  <div style={{ padding: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Loading...</div>
                )}
                {hasMore && (
                  <button style={S.loadMoreBtn} onClick={loadMore} disabled={loading}>
                    {loading ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Manage History Panel
// ---------------------------------------------------------------------------

const ManageHistoryPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { apps, stats, clearByDateRange, clearByApp, clearAll, hardPurge, exportJournal, clearInProgress, exportInProgress, loadApps, loadStats } = useJournalStore();
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [selectedClearApp, setSelectedClearApp] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    loadApps();
    loadStats();
  }, [loadApps, loadStats]);

  const handleClearByRange = async () => {
    if (!rangeStart || !rangeEnd) return;
    const start = new Date(rangeStart).getTime();
    const end = new Date(rangeEnd + 'T23:59:59').getTime();
    const result = await clearByDateRange(start, end);
    setLastResult(`Cleared ${result.affected} entries`);
  };

  const handleClearByApp = async () => {
    if (!selectedClearApp) return;
    const result = await clearByApp(selectedClearApp);
    setLastResult(`Cleared ${result.affected} entries from ${selectedClearApp}`);
    setSelectedClearApp('');
  };

  const handleClearAll = async () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      return;
    }
    const result = await clearAll();
    setLastResult(`Cleared all ${result.affected} entries`);
    setConfirmClearAll(false);
  };

  const handleExport = async (format: 'txt' | 'md' | 'json') => {
    const data = await exportJournal(format);
    if (data) {
      const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dex-journal-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setLastResult(`Exported as ${format.toUpperCase()}`);
    }
  };

  return (
    <div style={S.managePanel} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>Manage History</span>
        <button
          aria-label="Close history manager"
          style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 16 }}
          onClick={onClose}
        >
          x
        </button>
      </div>

      {stats && (
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
          {stats.totalEntries} total entries -- {stats.totalApps} apps -- {stats.totalSessions} sessions
        </div>
      )}

      {lastResult && (
        <div style={{ fontSize: 11, color: 'var(--color-success)', marginBottom: 8, padding: '4px 8px', background: 'rgba(48,209,88,0.08)', borderRadius: 4 }}>
          {lastResult}
        </div>
      )}

      <div style={S.manageSectionTitle}>Clear by Date Range</div>
      <div style={S.manageRow}>
        <input
          type="date"
          style={S.manageDateInput}
          value={rangeStart}
          onChange={e => setRangeStart(e.target.value)}
          placeholder="Start date"
        />
        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>to</span>
        <input
          type="date"
          style={S.manageDateInput}
          value={rangeEnd}
          onChange={e => setRangeEnd(e.target.value)}
          placeholder="End date"
        />
      </div>
      <button style={{...S.manageActionBtn, opacity: clearInProgress || !rangeStart || !rangeEnd ? 0.4 : 1, cursor: clearInProgress || !rangeStart || !rangeEnd ? 'not-allowed' : 'pointer'}} onClick={handleClearByRange} disabled={clearInProgress || !rangeStart || !rangeEnd}>
        {clearInProgress ? 'Clearing...' : 'Clear Date Range'}
      </button>

      <div style={S.manageSectionTitle}>Clear by App</div>
      <div style={S.manageRow}>
        <select style={S.manageSelect} value={selectedClearApp} onChange={e => setSelectedClearApp(e.target.value)}>
          <option value="">Select an app...</option>
          {apps.map(app => (
            <option key={app} value={app}>{app}</option>
          ))}
        </select>
        <button style={{...S.manageActionBtn, opacity: clearInProgress || !selectedClearApp ? 0.4 : 1, cursor: clearInProgress || !selectedClearApp ? 'not-allowed' : 'pointer'}} onClick={handleClearByApp} disabled={clearInProgress || !selectedClearApp}>
          Clear
        </button>
      </div>

      <div style={S.manageSectionTitle}>Clear All</div>
      <button
        style={confirmClearAll ? { ...S.manageDangerBtn, background: 'rgba(255,59,48,0.2)' } : S.manageDangerBtn}
        onClick={handleClearAll}
        disabled={clearInProgress}
      >
        {confirmClearAll ? 'Confirm: Clear Everything' : 'Clear All Entries'}
      </button>
      {confirmClearAll && (
        <div style={{ fontSize: 10, color: 'var(--color-error)', marginTop: 4 }}>
          This will soft-delete all entries. They will be permanently removed after 7 days.
        </div>
      )}

      <div style={S.manageSectionTitle}>Export</div>
      <div style={S.exportRow}>
        {(['txt', 'md', 'json'] as const).map(fmt => (
          <button key={fmt} style={{...S.manageActionBtn, opacity: exportInProgress ? 0.4 : 1, cursor: exportInProgress ? 'not-allowed' : 'pointer'}} onClick={() => handleExport(fmt)} disabled={exportInProgress}>
            {fmt.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={S.manageSectionTitle}>Maintenance</div>
      <button
        style={S.manageActionBtn}
        onClick={async () => {
          const result = await hardPurge();
          setLastResult(`Purged ${result.purged} entries permanently`);
        }}
      >
        Hard Purge (7+ day old cleared)
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stats Bar
// ---------------------------------------------------------------------------

const StatsBar: React.FC = () => {
  const { stats, loadStats } = useJournalStore();

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (!stats) return null;

  return (
    <div style={S.statsRow}>
      <div style={S.statItem}>
        <span style={S.statValue}>{stats.todayEntries}</span>
        <span style={S.statLabel}>Today</span>
      </div>
      <div style={S.statItem}>
        <span style={S.statValue}>{stats.totalEntries}</span>
        <span style={S.statLabel}>Total</span>
      </div>
      <div style={S.statItem}>
        <span style={S.statValue}>{stats.totalApps}</span>
        <span style={S.statLabel}>Apps</span>
      </div>
      <div style={S.statItem}>
        <span style={S.statValue}>{stats.totalSessions}</span>
        <span style={S.statLabel}>Sessions</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main JournalView Component
// ---------------------------------------------------------------------------

const JournalView: React.FC = () => {
  const { mode, setMode, searchQuery, setSearchQuery, search, loadEntries, loadCurrentSessionId, refresh } = useJournalStore();
  const [manageOpen, setManageOpen] = useState(false);
  const [insightsVisible, setInsightsVisible] = useState(true);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCurrentSessionId();
    refresh();
  }, [loadCurrentSessionId, refresh]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (value.trim()) {
        search(value.trim());
      } else {
        loadEntries();
      }
    }, 300);
  }, [setSearchQuery, search, loadEntries]);

  const modes: { id: JournalViewMode; label: string }[] = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'by-app', label: 'By App' },
    { id: 'by-session', label: 'By Session' },
  ];

  return (
    <div style={S.root}>
      <StatsBar />

      {/* Toolbar */}
      <div style={{ ...S.toolbar, position: 'relative' }}>
        {modes.map(m => (
          <button
            key={m.id}
            style={{ ...S.modeBtn, ...(mode === m.id ? S.modeBtnActive : {}) }}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}

        <input
          style={S.searchBox}
          type="text"
          placeholder="Search journal entries..."
          value={searchQuery}
          onChange={handleSearchChange}
        />

        <button
          style={{ ...S.manageBtn, ...(insightsVisible ? { color: 'var(--color-accent)', borderColor: 'rgba(10,132,255,0.3)' } : {}) }}
          onClick={() => setInsightsVisible(!insightsVisible)}
        >
          Insights
        </button>

        <button style={S.manageBtn} onClick={() => setManageOpen(!manageOpen)}>
          Manage
        </button>

        {manageOpen && <ManageHistoryPanel onClose={() => setManageOpen(false)} />}
      </div>

      {/* Body: entries + insights sidebar */}
      <div style={S.body}>
        <div style={S.entriesPane}>
          {mode === 'timeline' && <TimelineView />}
          {mode === 'by-app' && <ByAppView />}
          {mode === 'by-session' && <BySessionView />}
        </div>

        {insightsVisible && (
          <div style={S.insightsPane}>
            <JournalInsights />
          </div>
        )}
      </div>
    </div>
  );
};

export default JournalView;
