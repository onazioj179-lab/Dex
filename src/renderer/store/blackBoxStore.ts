// ═══════════════════════════════════════════════════════════════════════════
// DEX - Phase 34: Black Box Log Engine
// Immutable forensic log with checksum chain
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BlackBoxEntry,
  LogCategory,
  LogSeverity,
  BlackBoxQuery,
  BlackBoxStats,
  ReplaySession,
} from '../../shared/blackBoxTypes';

// ─────────────────────────────────────────────────────────────────────────────
// CHECKSUM GENERATION (Simple hash for integrity chain)
// ─────────────────────────────────────────────────────────────────────────────

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function generateChecksum(entry: Omit<BlackBoxEntry, 'checksum'>, previousChecksum: string): string {
  const data = `${entry.id}|${entry.sequence}|${entry.timestamp}|${entry.category}|${entry.action}|${previousChecksum}`;
  return simpleHash(data);
}

function generateId(): string {
  return `bb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

interface BlackBoxStore {
  // State
  entries: BlackBoxEntry[];
  sequence: number;
  lastChecksum: string;
  
  // Replay state
  replaySession: ReplaySession | null;
  
  // Integrity
  integrityVerified: boolean;
  lastVerification: number | null;
  
  // Logging
  log: (
    category: LogCategory,
    action: string,
    severity?: LogSeverity,
    data?: Record<string, unknown>,
    source?: BlackBoxEntry['source']
  ) => BlackBoxEntry;
  
  // Category-specific logging
  logAction: (action: string, data?: Record<string, unknown>) => BlackBoxEntry;
  logWorkflow: (action: string, data?: Record<string, unknown>) => BlackBoxEntry;
  logFile: (action: string, data?: Record<string, unknown>) => BlackBoxEntry;
  logPermission: (action: string, data?: Record<string, unknown>) => BlackBoxEntry;
  logSession: (action: string, data?: Record<string, unknown>) => BlackBoxEntry;
  logSystem: (action: string, severity?: LogSeverity, data?: Record<string, unknown>) => BlackBoxEntry;
  logError: (action: string, error?: unknown, data?: Record<string, unknown>) => BlackBoxEntry;
  logRecovery: (action: string, data?: Record<string, unknown>) => BlackBoxEntry;
  logOverride: (action: string, data?: Record<string, unknown>) => BlackBoxEntry;
  logMission: (action: string, data?: Record<string, unknown>) => BlackBoxEntry;
  logSecurity: (action: string, severity?: LogSeverity, data?: Record<string, unknown>) => BlackBoxEntry;
  
  // Queries
  query: (params: BlackBoxQuery) => BlackBoxEntry[];
  getByCategory: (category: LogCategory, limit?: number) => BlackBoxEntry[];
  getBySeverity: (severity: LogSeverity, limit?: number) => BlackBoxEntry[];
  getRecent: (limit?: number) => BlackBoxEntry[];
  search: (term: string, limit?: number) => BlackBoxEntry[];
  getTimeRange: (start: number, end: number) => BlackBoxEntry[];
  
  // Stats
  getStats: () => BlackBoxStats;
  
  // Replay
  startReplay: (entries: BlackBoxEntry[], speed?: number) => void;
  pauseReplay: () => void;
  resumeReplay: () => void;
  stopReplay: () => void;
  seekReplay: (position: number) => void;
  
  // Integrity
  verifyIntegrity: () => { valid: boolean; brokenAt?: number };
  rebuildChecksums: () => void;
  
  // Export
  exportLog: (query?: BlackBoxQuery) => string;
  
  // Maintenance (careful - this breaks immutability principle)
  compact: (keepDays?: number) => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

const GENESIS_CHECKSUM = '00000000';

export const useBlackBox = create<BlackBoxStore>()(
  persist(
    (set, get) => ({
      // Initial state
      entries: [],
      sequence: 0,
      lastChecksum: GENESIS_CHECKSUM,
      replaySession: null,
      integrityVerified: true,
      lastVerification: null,

      // ─────────────────────────────────────────────────────────────────────
      // Core logging
      // ─────────────────────────────────────────────────────────────────────

      log: (category, action, severity = 'info', data, source) => {
        const state = get();
        const id = generateId();
        const sequence = state.sequence + 1;
        const timestamp = Date.now();
        const timestampISO = new Date(timestamp).toISOString();

        const entry: Omit<BlackBoxEntry, 'checksum'> = {
          id,
          sequence,
          timestamp,
          timestampISO,
          category,
          severity,
          action,
          data,
          source: source || 'renderer',
          previousChecksum: state.lastChecksum,
        };

        const checksum = generateChecksum(entry, state.lastChecksum);
        const fullEntry: BlackBoxEntry = { ...entry, checksum };

        set({
          entries: [...state.entries, fullEntry],
          sequence,
          lastChecksum: checksum,
        });

        return fullEntry;
      },

      // ─────────────────────────────────────────────────────────────────────
      // Category-specific logging
      // ─────────────────────────────────────────────────────────────────────

      logAction: (action, data) => get().log('action', action, 'info', data),
      logWorkflow: (action, data) => get().log('workflow', action, 'info', data),
      logFile: (action, data) => get().log('file', action, 'info', data),
      logPermission: (action, data) => get().log('permission', action, 'info', data),
      logSession: (action, data) => get().log('session', action, 'info', data),
      logSystem: (action, severity = 'info', data) => get().log('system', action, severity, data),
      logError: (action, error, data) => get().log('error', action, 'error', { ...data, error: String(error) }),
      logRecovery: (action, data) => get().log('recovery', action, 'warn', data),
      logOverride: (action, data) => get().log('override', action, 'critical', data),
      logMission: (action, data) => get().log('mission', action, 'info', data),
      logSecurity: (action, severity = 'warn', data) => get().log('security', action, severity, data),

      // ─────────────────────────────────────────────────────────────────────
      // Queries
      // ─────────────────────────────────────────────────────────────────────

      query: (params) => {
        let results = get().entries;

        if (params.categories?.length) {
          results = results.filter(e => params.categories!.includes(e.category));
        }

        if (params.severities?.length) {
          results = results.filter(e => params.severities!.includes(e.severity));
        }

        if (params.startTime) {
          results = results.filter(e => e.timestamp >= params.startTime!);
        }

        if (params.endTime) {
          results = results.filter(e => e.timestamp <= params.endTime!);
        }

        if (params.search) {
          const term = params.search.toLowerCase();
          results = results.filter(e => 
            e.action.toLowerCase().includes(term) ||
            JSON.stringify(e.data || {}).toLowerCase().includes(term)
          );
        }

        if (params.source) {
          results = results.filter(e => e.source === params.source);
        }

        // Sort
        const sortDir = params.sortDirection === 'asc' ? 1 : -1;
        results = [...results].sort((a, b) => (a.timestamp - b.timestamp) * sortDir);

        // Limit
        if (params.limit) {
          results = results.slice(0, params.limit);
        }

        // Offset
        if (params.offset) {
          results = results.slice(params.offset);
        }

        return results;
      },

      getByCategory: (category, limit = 100) => {
        return get().entries
          .filter(e => e.category === category)
          .slice(-limit)
          .reverse();
      },

      getBySeverity: (severity, limit = 100) => {
        return get().entries
          .filter(e => e.severity === severity)
          .slice(-limit)
          .reverse();
      },

      getRecent: (limit = 50) => {
        return get().entries.slice(-limit).reverse();
      },

      search: (term, limit = 100) => {
        const lower = term.toLowerCase();
        return get().entries
          .filter(e => 
            e.action.toLowerCase().includes(lower) ||
            JSON.stringify(e.data || {}).toLowerCase().includes(lower)
          )
          .slice(-limit)
          .reverse();
      },

      getTimeRange: (start, end) => {
        return get().entries.filter(e => e.timestamp >= start && e.timestamp <= end);
      },

      // ─────────────────────────────────────────────────────────────────────
      // Stats
      // ─────────────────────────────────────────────────────────────────────

      getStats: () => {
        const entries = get().entries;
        const byCategory: Record<string, number> = {};
        const bySeverity: Record<string, number> = {};
        const bySource: Record<string, number> = {};
        
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        let entriesLast24h = 0;
        let entriesLast7d = 0;
        let errorsLast24h = 0;

        entries.forEach(e => {
          byCategory[e.category] = (byCategory[e.category] || 0) + 1;
          bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
          bySource[e.source] = (bySource[e.source] || 0) + 1;
          
          if (e.timestamp >= oneDayAgo) {
            entriesLast24h++;
            if (e.severity === 'error' || e.severity === 'critical') {
              errorsLast24h++;
            }
          }
          if (e.timestamp >= sevenDaysAgo) {
            entriesLast7d++;
          }
        });

        return {
          totalEntries: entries.length,
          byCategory: byCategory as Record<LogCategory, number>,
          bySeverity: bySeverity as Record<LogSeverity, number>,
          bySource,
          firstEntry: entries[0]?.timestamp || null,
          lastEntry: entries[entries.length - 1]?.timestamp || null,
          entriesLast24h,
          entriesLast7d,
          errorsLast24h,
          integrityStatus: get().integrityVerified ? 'valid' : 'unknown',
          lastIntegrityCheck: get().lastVerification,
          integrityValid: get().integrityVerified,
          storageSize: JSON.stringify(entries).length,
        };
      },

      // ─────────────────────────────────────────────────────────────────────
      // Replay
      // ─────────────────────────────────────────────────────────────────────

      startReplay: (entries, speed = 1) => {
        const startSequence = entries[0]?.sequence || 0;
        const endSequence = entries[entries.length - 1]?.sequence || 0;
        set({
          replaySession: {
            id: `replay-${Date.now()}`,
            startSequence,
            endSequence,
            currentSequence: startSequence,
            entries,
            currentIndex: 0,
            speed,
            isPlaying: true,
            playing: true,
            startedAt: Date.now(),
            startTime: Date.now(),
          },
        });
      },

      pauseReplay: () => {
        const session = get().replaySession;
        if (session) {
          set({ replaySession: { ...session, playing: false } });
        }
      },

      resumeReplay: () => {
        const session = get().replaySession;
        if (session) {
          set({ replaySession: { ...session, playing: true } });
        }
      },

      stopReplay: () => set({ replaySession: null }),

      seekReplay: (position) => {
        const session = get().replaySession;
        if (session && session.entries) {
          const index = Math.max(0, Math.min(position, session.entries.length - 1));
          set({ replaySession: { ...session, currentIndex: index } });
        }
      },

      // ─────────────────────────────────────────────────────────────────────
      // Integrity
      // ─────────────────────────────────────────────────────────────────────

      verifyIntegrity: () => {
        const entries = get().entries;
        let previousChecksum = GENESIS_CHECKSUM;

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const expectedChecksum = generateChecksum(
            { ...entry, checksum: undefined } as Omit<BlackBoxEntry, 'checksum'>,
            previousChecksum
          );

          if (entry.checksum !== expectedChecksum || entry.previousChecksum !== previousChecksum) {
            set({ integrityVerified: false, lastVerification: Date.now() });
            return { valid: false, brokenAt: i };
          }

          previousChecksum = entry.checksum;
        }

        set({ integrityVerified: true, lastVerification: Date.now() });
        return { valid: true };
      },

      rebuildChecksums: () => {
        const entries = get().entries;
        let previousChecksum = GENESIS_CHECKSUM;
        const rebuiltEntries: BlackBoxEntry[] = [];

        for (const entry of entries) {
          const rebuiltEntry: Omit<BlackBoxEntry, 'checksum'> = {
            ...entry,
            previousChecksum,
          };
          const checksum = generateChecksum(rebuiltEntry, previousChecksum);
          rebuiltEntries.push({ ...rebuiltEntry, checksum });
          previousChecksum = checksum;
        }

        set({
          entries: rebuiltEntries,
          lastChecksum: previousChecksum,
          integrityVerified: true,
        });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Export
      // ─────────────────────────────────────────────────────────────────────

      exportLog: (query) => {
        const entries = query ? get().query(query) : get().entries;
        return JSON.stringify({
          exportTime: Date.now(),
          version: '1.0',
          entryCount: entries.length,
          entries,
        }, null, 2);
      },

      // ─────────────────────────────────────────────────────────────────────
      // Maintenance
      // ─────────────────────────────────────────────────────────────────────

      compact: (keepDays = 30) => {
        const cutoff = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
        const entries = get().entries;
        const kept = entries.filter(e => e.timestamp >= cutoff);
        const removed = entries.length - kept.length;

        if (removed > 0) {
          // Rebuild checksums for remaining entries
          let previousChecksum = GENESIS_CHECKSUM;
          const rebuiltEntries: BlackBoxEntry[] = [];

          for (const entry of kept) {
            const rebuiltEntry: Omit<BlackBoxEntry, 'checksum'> = {
              ...entry,
              sequence: rebuiltEntries.length + 1,
              previousChecksum,
            };
            const checksum = generateChecksum(rebuiltEntry, previousChecksum);
            rebuiltEntries.push({ ...rebuiltEntry, checksum });
            previousChecksum = checksum;
          }

          set({
            entries: rebuiltEntries,
            sequence: rebuiltEntries.length,
            lastChecksum: previousChecksum,
          });
        }

        return removed;
      },
    }),
    {
      name: 'dex-black-box',
      partialize: (state) => ({
        entries: state.entries.slice(-10000), // Keep last 10,000 entries
        sequence: state.sequence,
        lastChecksum: state.lastChecksum,
        integrityVerified: state.integrityVerified,
        lastVerification: state.lastVerification,
      }),
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL BLACK BOX LOGGER (for use outside React)
// ─────────────────────────────────────────────────────────────────────────────

export const blackBox = {
  log: (...args: Parameters<BlackBoxStore['log']>) => useBlackBox.getState().log(...args),
  action: (action: string, data?: Record<string, unknown>) => useBlackBox.getState().logAction(action, data),
  workflow: (action: string, data?: Record<string, unknown>) => useBlackBox.getState().logWorkflow(action, data),
  file: (action: string, data?: Record<string, unknown>) => useBlackBox.getState().logFile(action, data),
  permission: (action: string, data?: Record<string, unknown>) => useBlackBox.getState().logPermission(action, data),
  session: (action: string, data?: Record<string, unknown>) => useBlackBox.getState().logSession(action, data),
  system: (action: string, severity?: LogSeverity, data?: Record<string, unknown>) => useBlackBox.getState().logSystem(action, severity, data),
  error: (action: string, error?: unknown, data?: Record<string, unknown>) => useBlackBox.getState().logError(action, error, data),
  recovery: (action: string, data?: Record<string, unknown>) => useBlackBox.getState().logRecovery(action, data),
  override: (action: string, data?: Record<string, unknown>) => useBlackBox.getState().logOverride(action, data),
  mission: (action: string, data?: Record<string, unknown>) => useBlackBox.getState().logMission(action, data),
  security: (action: string, severity?: LogSeverity, data?: Record<string, unknown>) => useBlackBox.getState().logSecurity(action, severity, data),
};
