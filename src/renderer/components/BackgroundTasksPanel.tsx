// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Task Manager › Background: what DEX and UKI are doing in the background
// (downloads, UKI commands), with cancel and the last output of a command.

import React, { useEffect, useState } from 'react';
import { useBackgroundTasks, sortedTasks, wireUkiCommandTasks, type BgTask } from '../services/backgroundTasks';

const STATUS: Record<BgTask['status'], string> = {
  running: 'Running', completed: 'Done', failed: 'Failed', cancelled: 'Cancelled', 'timed-out': 'Timed out', interrupted: 'Interrupted by restart',
};

const ago = (t?: number) => {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : new Date(t).toLocaleString();
};

export const BackgroundTasksPanel: React.FC = () => {
  const tasks = useBackgroundTasks((s) => s.tasks);
  const [open, setOpen] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  useEffect(() => { wireUkiCommandTasks(); }, []);

  const showOutput = async (t: BgTask) => {
    if (open === t.id) { setOpen(null); return; }
    setOpen(t.id);
    setOutput('Loading…');
    const id = t.id.replace(/^uki:/, '');
    const g = await (window as any).dex?.invoke?.('ukiterm:get', id).catch(() => null);
    setOutput(g?.task?.output ? String(g.task.output).slice(-20000) : 'No output was kept (output is not saved across restarts).');
  };

  const list = sortedTasks(tasks);
  return (
    <div style={{ padding: '12px 16px', overflowY: 'auto', height: '100%' }}>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 640 }}>
        Downloads, DDrop transfers and commands UKI ran for you. Routine work runs quietly; everything is listed here. UKI only runs a command after you approve it.
      </p>
      {list.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: '24px 0' }}>Nothing is running in the background.</div>
      ) : (
        <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((t) => (
            <div role="listitem" key={t.id} style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 10, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 92, flexShrink: 0 }}>{t.kind === 'download' ? 'Download' : t.kind === 'ddrop' ? 'DDrop' : t.kind === 'index' ? 'Search index' : 'UKI command'}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                <span style={{ fontSize: 12, color: t.status === 'failed' || t.status === 'timed-out' ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
                  {STATUS[t.status]}{t.status === 'running' && typeof t.progress === 'number' ? ` · ${Math.round(t.progress)}%` : ''}{t.error ? ` · ${t.error}` : ''}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 80, textAlign: 'right' }}>{ago(t.endedAt ?? t.startedAt)}</span>
                {t.kind === 'uki-command' && (
                  <button type="button" onClick={() => { void showOutput(t); }} aria-expanded={open === t.id} style={btn}>Output</button>
                )}
                {t.status === 'running' && t.cancel && <button type="button" onClick={t.cancel} style={btn}>Cancel</button>}
              </div>
              {t.detail && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.detail}</div>}
              {open === t.id && (
                <pre style={{ margin: '8px 0 0', maxHeight: 260, overflow: 'auto', fontSize: 11, lineHeight: 1.45, background: 'var(--color-bg-base)', padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap' }}>{output}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const btn: React.CSSProperties = {
  padding: '2px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', cursor: 'pointer',
};

export default BackgroundTasksPanel;
