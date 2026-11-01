// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ScheduledTasksPanel — create and manage recurring UKI background tasks.
 *
 * Surfaces the scheduledTasksStore in Nexus: add a cron/interval reminder,
 * enable/disable it, delete it, and see its next run + last outcome. The
 * scheduledTaskRunner (SharedTick-driven) fires due tasks in the background and
 * records each run in the UKI task ledger. Mandate: "automate and work on tasks
 * in the background... manage tasks... rehook ourselves to check on tasks."
 */

import React, { useMemo, useState } from 'react';
import { useScheduledTasksStore, MIN_INTERVAL_MS } from '../store/scheduledTasksStore';
import { describeSchedule } from '../../shared/automation/scheduledTasks';
import { matchesCron } from '../../shared/automation/cron';
import { CollapsibleSection } from './CollapsibleSection';

function whenLabel(ts: number | null | undefined): string {
  if (!ts) return '—';
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  if (m < 1) return diff >= 0 ? 'in <1m' : 'now';
  if (m < 60) return diff >= 0 ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return diff >= 0 ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  return diff >= 0 ? `in ${d}d` : `${d}d ago`;
}

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
  borderRadius: 9999, fontSize: 11, fontWeight: 600,
  background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)',
  color: 'var(--color-text-secondary)', whiteSpace: 'nowrap',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg-inset, rgba(0,0,0,0.25))', border: '1px solid var(--color-border-subtle)',
  borderRadius: 6, color: 'var(--color-text-primary)', fontSize: 12, padding: '5px 8px', outline: 'none',
};

const ScheduledTasksPanel: React.FC = () => {
  const tasks = useScheduledTasksStore(s => s.tasks);
  const addTask = useScheduledTasksStore(s => s.addTask);
  const removeTask = useScheduledTasksStore(s => s.removeTask);
  const setEnabled = useScheduledTasksStore(s => s.setEnabled);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'interval' | 'cron'>('interval');
  const [everyMin, setEveryMin] = useState(60);
  const [cron, setCron] = useState('0 9 * * *');
  const [message, setMessage] = useState('');

  const cronValid = useMemo(() => kind !== 'cron' || matchesCron(cron, new Date()) || (() => {
    // matchesCron returns false on parse error too; validate parse explicitly
    try { return cron.trim().split(/\s+/).length === 5; } catch { return false; }
  })(), [kind, cron]);

  const canAdd = title.trim().length > 0 && (kind === 'interval' ? everyMin >= 1 : cron.trim().split(/\s+/).length === 5);

  const submit = () => {
    if (!canAdd) return;
    addTask({
      title: title.trim(),
      kind,
      cron: kind === 'cron' ? cron.trim() : undefined,
      intervalMs: kind === 'interval' ? Math.max(MIN_INTERVAL_MS, everyMin * 60000) : undefined,
      action: { type: 'reminder', message: message.trim() || title.trim() },
    }, Date.now());
    setTitle('');
    setMessage('');
  };

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity)),
    [tasks],
  );

  return (
    <CollapsibleSection
      label="Scheduled Tasks"
      storageKey="dex-nexus-scheduled-collapsed"
      style={{ marginBottom: 'var(--space-3, 12px)' }}
      headerAccessory={<span style={chip}>{tasks.filter(t => t.enabled).length} active</span>}
      icon={
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
        </svg>
      }
    >
      {/* Add form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        <input
          aria-label="Task title" placeholder="Reminder title (e.g. Stand up & stretch)"
          value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          style={{ ...inputStyle, width: '100%' }}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
            {(['interval', 'cron'] as const).map(k => (
              <button
                key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: kind === k ? 'var(--color-accent-light, rgba(10,132,255,0.15))' : 'transparent',
                  color: kind === k ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
              >
                {k === 'interval' ? 'Every' : 'Cron'}
              </button>
            ))}
          </div>
          {kind === 'interval' ? (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <input type="number" min={1} aria-label="Interval minutes" value={everyMin}
                onChange={e => setEveryMin(Math.max(1, Number(e.target.value)))}
                style={{ ...inputStyle, width: 64 }} />
              minutes
            </label>
          ) : (
            <input aria-label="Cron expression" placeholder="min hr dom mon dow" value={cron}
              onChange={e => setCron(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 130, fontFamily: 'var(--font-mono, monospace)',
                borderColor: cronValid ? 'var(--color-border-subtle)' : 'var(--color-error, #ff453a)' }} />
          )}
        </div>
        <input
          aria-label="Reminder message" placeholder="Notification message (optional)"
          value={message} onChange={e => setMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          style={{ ...inputStyle, width: '100%' }}
        />
        <button
          onClick={submit} disabled={!canAdd} aria-label="Add scheduled task"
          style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 9999,
            border: '1px solid var(--color-accent-muted, rgba(10,132,255,0.35))',
            background: canAdd ? 'var(--color-accent-light, rgba(10,132,255,0.15))' : 'var(--color-bg-hover)',
            color: canAdd ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            cursor: canAdd ? 'pointer' : 'default' }}
        >
          + Schedule reminder
        </button>
      </div>

      {/* Task list */}
      {sorted.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>
          No scheduled tasks yet. Add a recurring reminder above — it runs in the background even while you work in other apps.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(t => (
            <div key={t.id} style={{ ...chip, display: 'block', whiteSpace: 'normal', width: '100%', padding: '7px 10px', borderRadius: 10, fontWeight: 400 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9999, flexShrink: 0,
                  background: !t.enabled ? 'var(--color-text-tertiary)'
                    : t.lastOutcome === 'error' ? 'var(--color-error, #ff453a)'
                    : t.lastOutcome === 'ok' ? 'var(--color-success, #32d74b)'
                    : 'var(--color-accent)' }} />
                <span style={{ fontSize: 12, color: 'var(--color-text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.title}>{t.title}</span>
                <button onClick={() => setEnabled(t.id, !t.enabled, Date.now())}
                  aria-label={t.enabled ? `Pause ${t.title}` : `Resume ${t.title}`}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                    color: t.enabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                  {t.enabled ? 'On' : 'Off'}
                </button>
                <button onClick={() => removeTask(t.id)} aria-label={`Delete ${t.title}`}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 13, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2, paddingLeft: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span>{describeSchedule(t)}</span>
                <span>· next {t.enabled ? whenLabel(t.nextRunAt) : 'paused'}</span>
                {t.runCount > 0 && <span>· ran {t.runCount}×</span>}
                {t.lastOutcome === 'error' && <span style={{ color: 'var(--color-error, #ff453a)' }}>· last failed</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
};

export default ScheduledTasksPanel;
