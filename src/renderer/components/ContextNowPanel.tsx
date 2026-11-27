// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import React, { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { contextEngine, type TrackedActivity } from '../../shared/uki/contextEngine';
import { nowAppName } from '../services/contextEngineWiring';
import { DEX_COMMAND_EVENT, type DexCommandEventDetail } from '../services/dexCommandRunner';
import { useRunningApps } from '../store/runningApps';
import { sendAppCommand } from './AppContextMenu';
import DexIcon, { resolveIconName } from './DexIcon';
import './ContextNowPanel.css';

const relativeTime = new Intl.RelativeTimeFormat(undefined, { style: 'short', numeric: 'always' });

function formatAge(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return relativeTime.format(-minutes, 'minute');
  if (minutes < 1440) return relativeTime.format(-Math.floor(minutes / 60), 'hour');
  return relativeTime.format(-Math.floor(minutes / 1440), 'day');
}

const activityKinds: Record<string, { title: string; icon: string }> = {
  app: { title: 'Opened app', icon: 'grid' },
  clip: { title: 'Copied', icon: 'clipboard' },
  complete: { title: 'Completed task', icon: 'check-circle' },
  file: { title: 'Opened file', icon: 'file' },
  note: { title: 'Opened note', icon: 'file-text' },
  project: { title: 'Opened project', icon: 'folder' },
  save: { title: 'Saved file', icon: 'save' },
  task: { title: 'Created task', icon: 'check-square' },
  workspace: { title: 'Switched workspace', icon: 'layers' },
};

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function ActivityList({ entries }: { entries: readonly TrackedActivity[] }) {
  const [, setClock] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setClock((tick) => tick + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const now = Date.now();
  return (
    <ol className="dex-now__activity">
      {entries.map(({ id, kind, target, at }) => {
        const { title, icon } = activityKinds[kind] ?? { title: kind, icon: 'activity' };
        const date = new Date(at);
        return (
          <li key={id} className="dex-now__entry">
            <span className="dex-now__entry-icon"><DexIcon name={icon} size={16} /></span>
            <div className="dex-now__entry-text">
              <span className="dex-now__entry-kind">{title}</span>
              <span className="dex-now__entry-target" title={target}>
                {kind === 'file' || kind === 'save' ? fileName(target) : target}
              </span>
            </div>
            <time dateTime={date.toISOString()} title={date.toLocaleString()}>{formatAge(at, now)}</time>
          </li>
        );
      })}
    </ol>
  );
}

function NowContent({ close }: { close: () => void }) {
  const ctx = useSyncExternalStore(contextEngine.subscribe, contextEngine.getSnapshot);
  const apps = useRunningApps((state) => state.runningApps).filter((app) => app.id !== 'home');
  const details = [
    { label: 'Workspace', value: ctx.workspace, icon: 'layers' },
    { label: 'Project', value: ctx.project, icon: 'folder' },
    { label: 'Active file', value: ctx.file, icon: 'file-text' },
    { label: 'Task', value: ctx.task, icon: 'check-square' },
  ];
  const hasDetails = details.some(({ value }) => value);

  return (
    <>
      <header className="dex-now__header">
        <span className="dex-now__mark"><DexIcon name="activity" size={23} /></span>
        <h1 id="dex-now-title">Now</h1>
        <button type="button" className="dex-now__close" aria-label="Close Now" onClick={close}>
          <DexIcon name="close" size={18} />
        </button>
      </header>
      <div className="dex-now__body">
        <div className="dex-now__sidebar">
          <section className="dex-now__section" aria-labelledby="dex-now-context">
            <h2 id="dex-now-context">Current context</h2>
            {hasDetails ? (
              <dl className="dex-now__details">
                {details.map(({ label, value, icon }) => value && (
                  <div className="dex-now__detail" key={label}>
                    <dt><DexIcon name={icon} size={16} />{label}</dt>
                    <dd title={value}>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="dex-now__empty">No current context.</p>}
          </section>
          <section className="dex-now__section" aria-labelledby="dex-now-apps">
            <h2 id="dex-now-apps">Open apps</h2>
            {apps.length ? (
              <ul className="dex-now__apps">
                {apps.map((app) => {
                  const name = nowAppName(app);
                  return (
                    <li key={app.id}>
                      <button type="button" aria-label={`Switch to ${name}`} onClick={() => {
                        close();
                        sendAppCommand(app.id, 'front');
                      }}>
                        <DexIcon name={resolveIconName(app.icon)} size={16} />
                        <span>{name}</span>
                        <DexIcon name="chevron-right" size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="dex-now__empty">No apps open.</p>}
          </section>
        </div>
        <section className="dex-now__section dex-now__history" aria-labelledby="dex-now-history">
          <h2 id="dex-now-history">Recent activity</h2>
          {ctx.recentActivity.length ? <ActivityList entries={ctx.recentActivity} /> : (
            <p className="dex-now__empty">Apps and files you open will show up here.</p>
          )}
        </section>
      </div>
    </>
  );
}

export const ContextNowPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    let frame = 0;
    // Let the command palette close and restore focus before opening the modal.
    const show = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setOpen(true));
    };
    const onCommand = (event: Event) => {
      if ((event as CustomEvent<DexCommandEventDetail>).detail?.action === 'context') show();
    };
    window.addEventListener(DEX_COMMAND_EVENT, onCommand);
    window.addEventListener('dex-open-context', show);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(DEX_COMMAND_EVENT, onCommand);
      window.removeEventListener('dex-open-context', show);
    };
  }, []);

  useLayoutEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  const close = () => { dialog.current?.close(); setOpen(false); };

  return (
    <dialog
      ref={dialog}
      className="dex-now"
      aria-labelledby="dex-now-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => { pressedBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) close();
        pressedBackdrop.current = false;
      }}
    >
      {open && <NowContent close={close} />}
    </dialog>
  );
};

export default memo(ContextNowPanel);
