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
import { useScheduledTasksStore } from '../store/scheduledTasksStore';
import { describeSchedule } from '../../shared/automation/scheduledTasks';
import { parseScheduleSpec } from '../../shared/automation/scheduleSpec';
import { CollapsibleSection } from './CollapsibleSection';
import { listKnownUkiActions } from '../uki/appActionRegistry';
import { appActionFor } from '../uki/scheduleTools';

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
  const [when, setWhen] = useState('every 60 minutes');
  const [mode, setMode] = useState<'reminder' | 'uki-prompt' | 'app-action'>('reminder');
  const [message, setMessage] = useState('');
  // App action: chosen from the actions apps have registered (an app must have
  // been opened this session for its actions to be listed).
  const [actionId, setActionId] = useState('');
  const [actionArgs, setActionArgs] = useState('{}');
  const [approved, setApproved] = useState(false);
  const known = useMemo(() => (mode === 'app-action' ? listKnownUkiActions() : []), [mode]);
  const chosen = known.find(a => a.spec.id === actionId);
  const built = useMemo(() => (mode === 'app-action' && actionId ? appActionFor(actionId, actionArgs) : null), [mode, actionId, actionArgs]);

  // Re-parse when the text changes; "in 20 minutes" is relative to now.
  const spec = useMemo(() => parseScheduleSpec(when, Date.now()), [when]);
  const actionOk = !!built?.ok && (!chosen?.spec.mutates || approved);
  const canAdd = title.trim().length > 0 && spec.ok && (
    mode === 'reminder' || (mode === 'uki-prompt' && message.trim().length > 0) || (mode === 'app-action' && actionOk)
  );

  const submit = () => {
    if (!canAdd) return;
    const now = Date.now();
    const fresh = parseScheduleSpec(when, now);
    if (!fresh.ok) return;
    addTask({
      title: title.trim(),
      kind: fresh.kind,
      cron: fresh.kind === 'cron' ? fresh.cron : undefined,
      intervalMs: fresh.kind === 'interval' ? fresh.intervalMs : undefined,
      atMs: fresh.kind === 'once' ? fresh.atMs : undefined,
      action: mode === 'app-action' && built?.ok
        // Approval is explicit here (checkbox), so store it only when ticked.
        ? { ...built.action, preApproved: !!built.action.mutates && approved }
        : mode === 'uki-prompt'
          ? { type: 'uki-prompt', prompt: message.trim() }
          : { type: 'reminder', message: message.trim() || title.trim() },
    }, now);
    setTitle('');
    setMessage('');
    setApproved(false);
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
        <input
          aria-label="When" placeholder='in 20 minutes · tomorrow at 9am · every 2 hours · weekdays at 08:30'
          value={when} onChange={e => setWhen(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          style={{ ...inputStyle, width: '100%', borderColor: spec.ok ? 'var(--color-border-subtle)' : 'var(--color-error, #ff453a)' }}
        />
        <div aria-live="polite" style={{ fontSize: 11, color: spec.ok ? 'var(--color-text-tertiary)' : 'var(--color-error, #ff453a)', marginTop: -2 }}>
          {spec.ok ? `Runs ${spec.summary}` : spec.error}
        </div>
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border-subtle)', alignSelf: 'flex-start' }}>
          {([['reminder', 'Notify me'], ['uki-prompt', 'Ask UKI'], ['app-action', 'Run app action']] as const).map(([k, l]) => (
            <button
              key={k} onClick={() => setMode(k)} aria-pressed={mode === k}
              title={k === 'uki-prompt' ? 'UKI runs your request when the task fires and notifies the answer (needs an AI provider)' : 'Show a notification'}
              style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: mode === k ? 'var(--color-accent-light, rgba(10,132,255,0.15))' : 'transparent',
                color: mode === k ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
            >
              {l}
            </button>
          ))}
        </div>
        {mode === 'app-action' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <select aria-label="App action" value={actionId}
              onChange={e => {
                const id = e.target.value;
                setActionId(id);
                setApproved(false);
                setActionArgs(known.find(a => a.spec.id === id)?.spec.example || '{}');
              }}
              style={{ ...inputStyle, width: '100%' }}>
              <option value="">{known.length ? 'Choose an action…' : 'No app actions yet: open an app (Notes, Tasks, Calendar…) first'}</option>
              {known.map(a => <option key={a.spec.id} value={a.spec.id}>{a.spec.id}{a.spec.mutates ? ' (changes data)' : ''}</option>)}
            </select>
            {chosen && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{chosen.spec.description}</div>}
            {chosen && (
              <textarea aria-label="Action arguments (JSON)" value={actionArgs} onChange={e => setActionArgs(e.target.value)} rows={2} spellCheck={false}
                style={{ ...inputStyle, width: '100%', fontFamily: 'var(--font-mono, monospace)', resize: 'vertical',
                  borderColor: built && !built.ok ? 'var(--color-error, #ff453a)' : 'var(--color-border-subtle)' }} />
            )}
            {built && !built.ok && <div role="alert" style={{ fontSize: 11, color: 'var(--color-error, #ff453a)' }}>{built.error}</div>}
            {chosen?.spec.mutates && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                <input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} aria-label="Approve running this without asking" />
                <span>This changes {chosen.appId} data. Run it with exactly these arguments without asking each time.</span>
              </label>
            )}
            {chosen && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>If {chosen.appId} is closed when the task fires, it is opened first.</div>}
          </div>
        ) : (
        <input
          aria-label={mode === 'uki-prompt' ? 'Request for UKI' : 'Reminder message'}
          placeholder={mode === 'uki-prompt' ? 'What should UKI do? (e.g. Summarise the weather for today)' : 'Notification message (optional)'}
          value={message} onChange={e => setMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          style={{ ...inputStyle, width: '100%' }}
        />
        )}
        <button
          onClick={submit} disabled={!canAdd} aria-label="Add scheduled task"
          style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 9999,
            border: '1px solid var(--color-accent-muted, rgba(10,132,255,0.35))',
            background: canAdd ? 'var(--color-accent-light, rgba(10,132,255,0.15))' : 'var(--color-bg-hover)',
            color: canAdd ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            cursor: canAdd ? 'pointer' : 'default' }}
        >
          {mode === 'uki-prompt' ? '+ Schedule UKI task' : mode === 'app-action' ? '+ Schedule action' : '+ Schedule reminder'}
        </button>
      </div>

      {/* Task list */}
      {sorted.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>
          No scheduled tasks yet. Add a reminder or a UKI task above, or ask UKI ("remind me in 20 minutes…") — it runs in the background even while you work in other apps.
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
                    : 'var(--color-accent-fill)' }} />
                <span style={{ fontSize: 12, color: 'var(--color-text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.title}>{t.title}</span>
                <button onClick={() => setEnabled(t.id, !t.enabled, Date.now())}
                  aria-label={t.enabled ? `Pause ${t.title}` : `Resume ${t.title}`}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, textTransform: 'none',
                    color: t.enabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                  {t.enabled ? 'On' : 'Off'}
                </button>
                <button onClick={() => removeTask(t.id)} aria-label={`Delete ${t.title}`}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 13, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2, paddingLeft: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span>{describeSchedule(t)}</span>
                {t.action.type === 'uki-prompt' && <span>· asks UKI</span>}
                {t.action.type === 'app-action' && <span>· runs {t.action.actionId}{t.action.mutates ? (t.action.preApproved ? ' (approved)' : ' (asks first)') : ''}</span>}
                <span>· {t.enabled ? `next ${whenLabel(t.nextRunAt)}` : t.kind === 'once' && t.runCount > 0 ? (t.lastOutcome === 'ok' ? 'done' : 'gave up') : 'paused'}</span>
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
