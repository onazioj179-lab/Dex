// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * LogsPanel -- live log viewer for the DEX diagnostics overlay.
 *
 * Listens for `log:new` IPC events and renders an auto-scrolling list of
 * recent log entries. Supports level filtering and text search.
 *
 * W1#28: logs panel scaffolding (W6#307-310 observability)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DexSearchInput } from '../styles/components';

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: unknown;
}

interface LogsPanelProps {
  /** Max entries to keep in memory. Default 500. */
  maxEntries?: number;
  /** Initial log levels to show. Default all. */
  defaultFilter?: LogLevel[];
  /** Panel height in px or css string. Default 320. */
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: 'var(--pg-text-secondary)',
  warn: '#e6a817',
  error: 'var(--status-error, #ef4444)',
  success: '#22c55e',
  debug: 'var(--pg-text-tertiary)',
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERR ',
  success: ' OK ',
  debug: 'DBG ',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

const ALL_LEVELS: LogLevel[] = ['info', 'warn', 'error', 'success', 'debug'];

export const LogsPanel: React.FC<LogsPanelProps> = ({
  maxEntries = 500,
  defaultFilter,
  height = 320,
  className = '',
  style,
}) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<Set<LogLevel>>(
    new Set(defaultFilter ?? ALL_LEVELS),
  );
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bridge = (window as any).__dexIpcRenderer;
    if (!bridge?.on) return;

    const handler = (_: unknown, entry: LogEntry) => {
      setEntries(prev => {
        const next = [...prev, entry];
        return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
      });
    };

    bridge.on('log:new', handler);
    return () => bridge.removeListener?.('log:new', handler);
  }, [maxEntries]);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const toggleLevel = useCallback((level: LogLevel) => {
    setFilter(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }, []);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setAutoScroll(scrollTop + clientHeight >= scrollHeight - 8);
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const visible = entries.filter(e =>
    filter.has(e.level) &&
    (search === '' || e.message.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div
      className={`dex-logs-panel ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height,
        background: 'var(--pg-surface-overlay, rgba(10,10,14,0.96))',
        border: '1px solid var(--pg-border-subtle, rgba(255,255,255,0.08))',
        borderRadius: 6,
        overflow: 'hidden',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 11,
        ...style,
      }}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--pg-border-subtle, rgba(255,255,255,0.06))' }}>
        {ALL_LEVELS.map(lvl => (
          <button
            key={lvl}
            onClick={() => toggleLevel(lvl)}
            aria-pressed={filter.has(lvl)}
            aria-label={`Toggle ${lvl} logs`}
            style={{
              padding: '2px 6px',
              borderRadius: 3,
              border: '1px solid',
              borderColor: filter.has(lvl) ? LEVEL_COLORS[lvl] : 'transparent',
              background: filter.has(lvl) ? `${LEVEL_COLORS[lvl]}22` : 'transparent',
              color: LEVEL_COLORS[lvl],
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: 'inherit',
              lineHeight: 1.4,
            }}
          >
            {LEVEL_LABELS[lvl].trim()}
          </button>
        ))}
        <DexSearchInput
          size="sm"
          placeholder="filter..."
          value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          onClear={() => setSearch('')}
          aria-label="Filter log messages"
          style={{ marginLeft: 'auto', width: 140 }}
        />
        <button
          onClick={clear}
          aria-label="Clear log entries"
          title="Clear"
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, color: 'var(--pg-text-secondary)', cursor: 'pointer', padding: '2px var(--space-2)', fontSize: 10, fontFamily: 'inherit' }}
        >
          Clear
        </button>
      </div>

      {/* Log list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}
        role="log"
        aria-live="polite"
        aria-label="Log output"
      >
        {visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--pg-text-tertiary, rgba(255,255,255,0.3))' }}>
            No entries
          </div>
        )}
        {visible.map(entry => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              padding: '1px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: 'var(--pg-text-tertiary, rgba(255,255,255,0.3))', flexShrink: 0, userSelect: 'none' }}>
              {formatTime(entry.timestamp)}
            </span>
            <span
              style={{ color: LEVEL_COLORS[entry.level], flexShrink: 0, width: 36, textAlign: 'center', userSelect: 'none' }}
              aria-hidden
            >
              {LEVEL_LABELS[entry.level]}
            </span>
            <span style={{ color: 'var(--pg-text-primary, #e2e8f0)', wordBreak: 'break-word', flex: 1 }}>
              {entry.message}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 10px', borderTop: '1px solid rgba(255,255,255,0.06)', color: 'var(--pg-text-tertiary, rgba(255,255,255,0.3))', fontSize: 10 }}>
        <span>{visible.length} / {entries.length} entries</span>
        <span>{autoScroll ? 'Auto-scroll on' : 'Scrolled'}</span>
      </div>
    </div>
  );
};

export default LogsPanel;
