// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX - Black Box Log Types
// Immutable forensic log of all system activity
// =============================================================================

// -----------------------------------------------------------------------------
// LOG CATEGORIES
// -----------------------------------------------------------------------------

export type LogCategory =
  | 'action'       // User-triggered actions
  | 'workflow'     // Workflow executions
  | 'file'         // File operations
  | 'permission'   // Permission changes/uses
  | 'session'      // Session events
  | 'system'       // System operations
  | 'error'        // Errors and failures
  | 'recovery'     // Recovery events
  | 'override'     // Override panel actions
  | 'mission'      // Mission operations
  | 'security';    // Security-related events

export type LogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

// -----------------------------------------------------------------------------
// LOG ENTRY
// -----------------------------------------------------------------------------

export interface BlackBoxEntry {
  // Identity
  id: string;
  sequence: number;  // Monotonically increasing sequence number
  
  // Timing
  timestamp: number;
  timestampISO: string;
  
  // Classification
  category: LogCategory;
  severity: LogSeverity;
  
  // Content
  action: string;           // What happened (verb)
  target?: string;          // What was affected (noun)
  details?: string;         // Human-readable description
  data?: Record<string, unknown>; // Additional data payload
  
  // Context
  source: 'user' | 'system' | 'workflow' | 'automation' | 'renderer';
  sessionId?: string;
  missionId?: string;
  
  // Metadata
  metadata?: Record<string, unknown>;
  
  // Integrity
  checksum: string;         // Hash of entry for tamper detection
  previousChecksum: string; // Link to previous entry (chain)
}

// -----------------------------------------------------------------------------
// LOG QUERY
// -----------------------------------------------------------------------------

export interface BlackBoxQuery {
  // Time range
  startTime?: number;
  endTime?: number;
  
  // Filters
  categories?: LogCategory[];
  severities?: LogSeverity[];
  sources?: BlackBoxEntry['source'][];
  source?: BlackBoxEntry['source']; // Single source filter
  
  // Search
  searchText?: string;
  search?: string; // Alias for searchText
  action?: string;
  target?: string;
  
  // Context
  sessionId?: string;
  missionId?: string;
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Ordering
  order?: 'asc' | 'desc';
  sortDirection?: 'asc' | 'desc'; // Alias for order
}

export interface BlackBoxQueryResult {
  entries: BlackBoxEntry[];
  total: number;
  hasMore: boolean;
  query: BlackBoxQuery;
  executionTime: number;
}

// -----------------------------------------------------------------------------
// LOG STATISTICS
// -----------------------------------------------------------------------------

export interface BlackBoxStats {
  totalEntries: number;
  firstEntry: number | null;
  lastEntry: number | null;
  
  byCategory: Record<LogCategory, number>;
  bySeverity: Record<LogSeverity, number>;
  bySource: Record<string, number>;
  
  entriesLast24h: number;
  entriesLast7d: number;
  errorsLast24h: number;
  
  integrityStatus: 'valid' | 'compromised' | 'unknown';
  lastIntegrityCheck: number | null;
  
  // Additional store-compatible fields
  integrityValid?: boolean;
  storageSize?: number;
}

// -----------------------------------------------------------------------------
// LOG STATE
// -----------------------------------------------------------------------------

export interface BlackBoxState {
  isRecording: boolean;
  isPaused: boolean;
  
  // Current session tracking
  currentSequence: number;
  lastChecksum: string;
  
  // View state
  viewMode: 'live' | 'search' | 'replay';
  currentQuery: BlackBoxQuery | null;
  selectedEntryId: string | null;
  
  // Stats
  stats: BlackBoxStats | null;
}

// -----------------------------------------------------------------------------
// LOG INPUT (for creating entries)
// -----------------------------------------------------------------------------

export interface LogInput {
  category: LogCategory;
  severity?: LogSeverity;
  action: string;
  target?: string;
  details?: string;
  source?: BlackBoxEntry['source'];
  sessionId?: string;
  missionId?: string;
  metadata?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// REPLAY
// -----------------------------------------------------------------------------

export interface ReplaySession {
  id: string;
  startSequence: number;
  endSequence: number;
  currentSequence: number;
  speed: number;  // 1x, 2x, 0.5x, etc.
  isPlaying: boolean;
  startedAt: number;
  // Extended properties for store compatibility
  entries?: BlackBoxEntry[];
  currentIndex?: number;
  playing?: boolean; // Alias for isPlaying
  startTime?: number; // Alias for startedAt
}

// -----------------------------------------------------------------------------
// EXPORT FORMATS
// -----------------------------------------------------------------------------

export type ExportFormat = 'json' | 'csv' | 'txt';

export interface ExportOptions {
  format: ExportFormat;
  query?: BlackBoxQuery;
  includeMetadata: boolean;
  includeChecksums: boolean;
}

// -----------------------------------------------------------------------------
// CONSTANTS
// -----------------------------------------------------------------------------

export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
  action: 'Actions',
  workflow: 'Workflows',
  file: 'Files',
  permission: 'Permissions',
  session: 'Sessions',
  system: 'System',
  error: 'Errors',
  recovery: 'Recovery',
  override: 'Override',
  mission: 'Missions',
  security: 'Security',
};

export const LOG_CATEGORY_ICONS: Record<LogCategory, string> = {
  action: 'M13 10V3L4 14h7v7l9-11h-7z',
  workflow: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z',
  file: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  permission: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  session: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  system: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  error: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  recovery: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  override: 'M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  mission: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  security: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
};

export const SEVERITY_COLORS: Record<LogSeverity, string> = {
  debug: 'var(--text-muted)',
  info: 'var(--text-secondary)',
  warn: 'var(--status-warning)',
  error: 'var(--status-error)',
  critical: '#ff0000',
};

// -----------------------------------------------------------------------------
// INITIAL STATE
// -----------------------------------------------------------------------------

export const INITIAL_BLACKBOX_STATE: BlackBoxState = {
  isRecording: true,
  isPaused: false,
  currentSequence: 0,
  lastChecksum: '',
  viewMode: 'live',
  currentQuery: null,
  selectedEntryId: null,
  stats: null,
};
