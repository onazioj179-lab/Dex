// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { contextEngine } from '../../shared/uki/contextEngine';
import { ContextBus } from './ContextBus';
import { useRunningApps, APP_DEFINITIONS, type RunningApp } from '../store/runningApps';
import { useStageStore } from '../store/stageStore';

let started = false;
let foregroundAppId = 'home';
const filesByWindow = new Map<string, string>();

export function nowAppName(app: RunningApp): string {
  return APP_DEFINITIONS[app.id]?.name ?? app.name;
}

/** AppManager knows which floating window is actually in front. */
export function setContextForegroundApp(appId: string): void {
  foregroundAppId = appId;
  contextEngine.setFile(filesByWindow.get(appId) ?? null, false);
}

function trackFile({ appId, path }: { appId: string; path: string | null }): void {
  if (path === (filesByWindow.get(appId) ?? null)) return;
  if (path) filesByWindow.set(appId, path);
  else filesByWindow.delete(appId);
  if (appId === foregroundAppId) contextEngine.setFile(path, false);
}

function recordFeed(eventType: string, appId: string, title: string, contextId?: string): void {
  void window.dex?.invoke('activity-feed:record', eventType, 'DEX', appId, title,
    contextId ? { contextId } : {}).catch(error => console.warn('[Activity] Could not record work', error));
}

/** Begin feeding the shared Context Engine from stores and work events. */
export function startContextEngine(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  (window as unknown as { __dexContextEngine?: typeof contextEngine }).__dexContextEngine = contextEngine;

  const publishApps = (apps: readonly RunningApp[]) => {
    contextEngine.setOpenApps(apps.filter((app) => app.id !== 'home').map(nowAppName));
  };
  useRunningApps.subscribe(({ runningApps }, { runningApps: previous }) => {
    if (runningApps === previous || (runningApps.length === previous.length && runningApps.every(
      (app, i) => app.id === previous[i].id && app.name === previous[i].name,
    ))) return;

    const oldIds = new Set(previous.map((app) => app.id));
    const ids = new Set(runningApps.map((app) => app.id));
    for (const appId of oldIds) {
      if (!ids.has(appId)) filesByWindow.delete(appId);
    }
    setContextForegroundApp(foregroundAppId);
    publishApps(runningApps);
    for (const app of runningApps) {
      if (app.id !== 'home' && !oldIds.has(app.id)) {
        contextEngine.recordActivity('app', nowAppName(app));
        recordFeed('app', app.id, `Opened ${nowAppName(app)}`);
      }
    }
  });
  publishApps(useRunningApps.getState().runningApps);

  contextEngine.setWorkspace(useStageStore.getState().getActiveStage()?.name ?? null);
  useStageStore.subscribe((state, previous) => {
    if (state.stages === previous.stages && state.activeStageId === previous.activeStageId) return;
    const name = state.getActiveStage()?.name ?? null;
    contextEngine.setWorkspace(name);
    if (name && state.activeStageId !== previous.activeStageId) contextEngine.recordActivity('workspace', name);
  });

  ContextBus.onWithReplay('file:focused', trackFile);
  ContextBus.on('file:opened', ({ appId, path }) => {
    if (!path) return;
    trackFile({ appId, path });
    contextEngine.recordActivity('file', path);
    recordFeed('file', 'files', `Opened ${path.split(/[\\/]/).pop() || path}`, path);
  });
  ContextBus.on('file:saved', ({ path }) => {
    if (!path) return;
    contextEngine.recordActivity('save', path);
    recordFeed('file', 'files', `Saved ${path.split(/[\\/]/).pop() || path}`, path);
  });
  ContextBus.on('note:opened', ({ id, title }) => {
    contextEngine.recordActivity('note', title || id);
    recordFeed('note', 'notes', title || 'Opened note', id);
  });
  ContextBus.on('task:created', ({ title, id }) => {
    contextEngine.recordActivity('task', title);
    recordFeed('task', 'tasks', `Created ${title}`, id);
  });
  ContextBus.on('task:completed', ({ title, id }) => {
    contextEngine.recordActivity('complete', title || id);
    recordFeed('task', 'tasks', title ? `Completed ${title}` : 'Completed task', id);
  });
  ContextBus.onWithReplay('continuity:project', ({ name, projectId }) => { contextEngine.setProject(name || projectId); });
}
