// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { DisposableGroup, type TeardownFn } from '../../shared/disposable';
import { contextEngine } from '../../shared/uki/contextEngine';
import { useClipboardStore, migrateLegacyClipboard, type AddClipOptions } from '../store/clipboardStore';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { sharedTick } from './SharedTick';
import { invokePlatformIpc } from './platform/ipc';
import { isTauri } from './platform/tauriCompat';

const TICK_ID = 'clipboard-monitor';
const POLL_MS = 4000;
// Leave room for the data URL header and Base64 expansion.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024 - 256;

let monitor: DisposableGroup | null = null;

function currentSource(): AddClipOptions {
  const id = useRunningApps.getState().currentAppId;
  return id ? { sourceAppId: id, sourceAppName: APP_DEFINITIONS[id]?.name ?? id } : {};
}

function ingest(text: string, options?: AddClipOptions): boolean {
  const store = useClipboardStore.getState();
  const previous = store.entries[0];
  const entry = store.add(text, options);
  if (entry && entry !== previous) contextEngine.recordActivity('clip', entry.preview);
  return entry !== null;
}

/** Read the system clipboard after an explicit request in Clipboard History. */
export async function captureCurrentClipboard(signal?: AbortSignal): Promise<boolean> {
  const text = isTauri()
    ? await invokePlatformIpc<string>('clipboard:readText')
    : await navigator.clipboard?.readText();
  if (signal?.aborted) return false;
  return typeof text === 'string' && ingest(text);
}

/** Record in-app copy events and poll only when browser permission is already granted. */
export function startClipboardMonitor(): TeardownFn {
  if (monitor || typeof window === 'undefined') return () => {};
  const resources = new DisposableGroup();
  monitor = resources;
  let lastSeen = '';
  let reading = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const readers = new Set<FileReader>();

  const record = (text: string, options?: AddClipOptions) => {
    if (resources.isDisposed || !text || text === lastSeen) return;
    lastSeen = text;
    ingest(text, options);
  };
  async function poll() {
    if (reading || resources.isDisposed || !document.hasFocus() || !navigator.clipboard?.readText) return;
    reading = true;
    try {
      const permission = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
      if (permission?.state !== 'granted' || resources.isDisposed || !document.hasFocus()) return;
      const text = await navigator.clipboard.readText();
      if (document.hasFocus()) record(text);
    } catch {
      // Browsers without a clipboard permission query retain the copy-event path.
    } finally {
      reading = false;
    }
  }

  function onCopy(event: ClipboardEvent) {
    const source = currentSource();
    for (const item of Array.from(event.clipboardData?.items ?? [])) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file || !file.size || file.size > MAX_IMAGE_BYTES) continue;
      const reader = new FileReader();
      readers.add(reader);
      reader.onload = () => record(String(reader.result || ''), { ...source, kind: 'image' });
      reader.onloadend = () => readers.delete(reader);
      reader.readAsDataURL(file);
      return;
    }
    const text = event.clipboardData?.getData('text/plain') || window.getSelection()?.toString();
    if (text?.trim()) {
      record(text, source);
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void poll(), 0);
  }

  migrateLegacyClipboard();
  resources.add(() => { monitor = null; });
  resources.add(() => {
    clearTimeout(timer);
    for (const reader of readers) reader.abort();
    readers.clear();
  });
  resources.addListener(window, 'copy', onCopy as EventListener, { capture: true });
  resources.addListener(window, 'cut', onCopy as EventListener, { capture: true });
  resources.addListener(window, 'focus', () => void poll());
  sharedTick.subscribe(TICK_ID, () => void poll(), POLL_MS);
  resources.add(() => sharedTick.unsubscribe(TICK_ID));
  void poll();
  return resources.cleanup;
}

export function stopClipboardMonitor(): void {
  monitor?.dispose();
}
