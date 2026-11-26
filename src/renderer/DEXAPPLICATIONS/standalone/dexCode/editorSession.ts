// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import { detachedAppId } from '../../../services/detachedWindow';
import { DEFAULT_CODE, FILE_KEY, STORAGE_KEY } from './templates';
import type { ProjectDocument } from './project';

export type EditorView = { start: number; end: number; top: number; left: number };
export type EditorAccess = { type: 'file' } | {
  type: 'project';
  document: Omit<ProjectDocument, 'content'>;
  workspaceVersion: number;
};
export type EditorTab = {
  id: string;
  path: string | null;
  name: string;
  text: string;
  base: string | null;
  access: EditorAccess | null;
  status: 'pending' | 'ready' | 'conflict' | 'unavailable';
  view?: EditorView;
  welcome?: boolean;
};
export type EditorSession = { tabs: EditorTab[]; activeId: string };

type StoredTab = Pick<EditorTab, 'id' | 'path' | 'name' | 'view'> & {
  draft?: Pick<EditorTab, 'text' | 'base'>;
};
type StoredSession = { tabs: StoredTab[]; activeId: string };
const writeQueues = new Map<string, Promise<unknown>>();

export function makeEditorTab(name = 'untitled.dex', text = DEFAULT_CODE, path: string | null = null): EditorTab {
  return {
    id: crypto.randomUUID(), path, name, text, base: path ? null : text, access: null,
    status: path ? 'pending' : 'ready',
  };
}

export function editorTabIsDirty(tab: EditorTab) {
  return tab.base === null ? tab.text !== '' : tab.text !== tab.base;
}

export function mergeEditorDisk(tab: EditorTab, text: string, access: EditorAccess | null): EditorTab {
  if (editorTabIsDirty(tab) && text !== tab.text) {
    if (text !== tab.base) return { ...tab, status: 'conflict', access: null };
    return { ...tab, status: 'ready', access };
  }
  return { ...tab, base: text, text, access, status: 'ready' };
}

export function appendEditorTab(session: EditorSession, tab: EditorTab): EditorSession {
  const tabs = session.tabs.length === 1 && session.tabs[0].welcome && !editorTabIsDirty(session.tabs[0])
    ? [tab] : [...session.tabs, tab];
  return { tabs, activeId: tab.id };
}

function initialSession(restoreLegacy: boolean): EditorSession {
  const tab = makeEditorTab('main.dex');
  tab.welcome = true;
  if (restoreLegacy) {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (text !== null) {
        tab.text = text;
        tab.name = localStorage.getItem(FILE_KEY) || tab.name;
        tab.welcome = false;
      }
    } catch { /* A blocked store will be reported by session persistence. */ }
  }
  return { tabs: [tab], activeId: tab.id };
}

function toStored(session: EditorSession): StoredSession {
  return {
    activeId: session.activeId,
    tabs: session.tabs.map(tab => ({
      id: tab.id, path: tab.path, name: tab.name, view: tab.view,
      draft: !tab.path || editorTabIsDirty(tab) ? { text: tab.text, base: tab.base } : undefined,
    })),
  };
}

function restoreSession(data: StoredSession | undefined): EditorSession | null {
  if (!Array.isArray(data?.tabs) || data.tabs.length === 0) return null;
  const tabs = data.tabs.map((tab): EditorTab => ({
    id: tab.id, path: tab.path, name: tab.name, view: tab.view,
    text: tab.draft?.text ?? '', base: tab.draft?.base ?? null, access: null,
    status: tab.path ? 'pending' : 'ready',
  }));
  return { tabs, activeId: tabs.some(tab => tab.id === data.activeId) ? data.activeId : tabs[0].id };
}

async function readSession(key: string) {
  await writeQueues.get(key)?.catch(() => undefined);
  return typeof indexedDB === 'undefined'
    ? JSON.parse(localStorage.getItem(key) ?? 'null') as StoredSession | undefined
    : get<StoredSession>(key);
}

function writeSession(key: string, snapshot: StoredSession) {
  // Serialize writes across app remounts so an older closing window cannot
  // finish a pending write after a newer snapshot.
  const pending = (writeQueues.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => {
    if (typeof indexedDB === 'undefined') localStorage.setItem(key, JSON.stringify(snapshot));
    else return set(key, snapshot);
  });
  writeQueues.set(key, pending);
  const release = () => { if (writeQueues.get(key) === pending) writeQueues.delete(key); };
  void pending.then(release, release);
  return pending;
}

export function useEditorSession() {
  const [scope] = useState(detachedAppId);
  const key = `dex:code:editor-session:v1:${scope ? `detached:${scope}` : 'main'}`;
  const [session, setSession] = useState(() => initialSession(!scope));
  const current = useRef(session);
  const hydrated = useRef(false);
  const [ready, setReady] = useState(false);
  const [draftState, setDraftState] = useState<'loading' | 'storing' | 'stored' | 'error'>('loading');
  const schedule = useRef<() => void>(() => undefined);

  const update = useCallback((change: (previous: EditorSession) => EditorSession) => {
    if (!hydrated.current) return;
    const next = change(current.current);
    if (next === current.current) return;
    current.current = next;
    setSession(next);
    schedule.current();
  }, []);

  const patch = useCallback((id: string, change: (tab: EditorTab) => EditorTab) => {
    update(previous => {
      const tab = previous.tabs.find(entry => entry.id === id);
      if (!tab) return previous;
      const next = change(tab);
      return next === tab ? previous : { ...previous, tabs: previous.tabs.map(entry => entry.id === id ? next : entry) };
    });
  }, [update]);

  useEffect(() => {
    let mounted = true;
    let canStore = false;
    let timer: number | undefined;
    let pending = false;
    let sequence = 0;

    const flush = () => {
      window.clearTimeout(timer);
      if (!canStore || !pending) return;
      pending = false;
      const request = ++sequence;
      void writeSession(key, toStored(current.current)).then(() => {
        if (mounted && request === sequence && !pending) setDraftState('stored');
      }, () => {
        if (mounted && request === sequence && !pending) setDraftState('error');
      });
    };
    schedule.current = () => {
      if (!canStore) return;
      pending = true;
      setDraftState('storing');
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 200);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);

    void readSession(key).then(data => {
      if (!mounted) return;
      canStore = true;
      const restored = restoreSession(data);
      if (restored) {
        current.current = restored;
        setSession(restored);
      }
      setDraftState('stored');
    }).catch(() => {
      if (mounted) setDraftState('error');
    }).finally(() => {
      if (!mounted) return;
      hydrated.current = true;
      setReady(true);
    });

    return () => {
      flush();
      mounted = false;
      hydrated.current = false;
      schedule.current = () => undefined;
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [key]);

  return { session, current, ready, draftState, update, patch };
}
