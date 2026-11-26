// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useCallback, useEffect, useRef, useState } from 'react';
import { invokePlatformIpc, subscribePlatformIpc } from '../services/platform/ipc';

export interface NativePage {
  tab: string;
  instance: number;
  revision: number;
  url: string;
  title: string;
  status: 'opening' | 'open' | 'failed' | 'closed';
  error?: string | null;
  canGoBack: boolean | null;
  canGoForward: boolean | null;
  canFind?: boolean;
}

type Result = { success: boolean; error?: string };
type OpenResult = Result & { page?: NativePage };
type ListResult = Result & { pages?: NativePage[] };

function isNativePage(value: unknown): value is NativePage {
  const page = value as Partial<NativePage> | null;
  return !!page && typeof page.tab === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(page.tab) &&
    Number.isSafeInteger(page.instance) && Number.isSafeInteger(page.revision) &&
    typeof page.url === 'string' && page.url.startsWith('https:') && typeof page.title === 'string' &&
    (page.status === 'opening' || page.status === 'open' || page.status === 'failed' || page.status === 'closed');
}

export function useNativePageWindows(enabled: boolean) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(enabled ? 'loading' : 'ready');
  const [snapshotRequest, requestSnapshot] = useState(0);
  const [pages, setPages] = useState<ReadonlyMap<string, NativePage>>(() => new Map());
  const latest = useRef(pages);
  const publish = useCallback((value: unknown) => {
    if (!isNativePage(value)) return;
    const previous = latest.current.get(value.tab);
    if (previous && (previous.instance > value.instance ||
      previous.instance === value.instance && previous.revision >= value.revision)) return;
    const next = new Map(latest.current);
    next.delete(value.tab);
    next.set(value.tab, value);
    // Keep recent close revisions to reject late replies without keeping every
    // page ever opened during a long session.
    if (next.size > 512) {
      const closed = Array.from(next.values()).find(entry => entry.status === 'closed');
      if (closed) next.delete(closed.tab);
    }
    latest.current = next;
    setPages(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    const stop = subscribePlatformIpc('dex-browser-page-state', value => {
      if (mounted) publish(value);
    });
    return () => { mounted = false; stop(); };
  }, [enabled, publish]);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    setStatus('loading');
    void invokePlatformIpc<ListResult>('browser:pageWindows').then(result => {
      if (!mounted) return;
      if (!result?.success || !Array.isArray(result.pages)) {
        setStatus('error');
        return;
      }
      result.pages.forEach(publish);
      setStatus('ready');
    });
    return () => { mounted = false; };
  }, [enabled, publish, snapshotRequest]);

  const open = useCallback(async (tab: string, url: string, navigate: boolean) => {
    const result = await invokePlatformIpc<OpenResult>('browser:openPageWindow', tab, url, navigate);
    if (!result?.success) throw new Error(result?.error || 'This address could not be opened.');
    publish(result.page);
  }, [publish]);

  return { pages, open, status, retry: () => requestSnapshot(current => current + 1) };
}

export async function nativePageAction(tab: string, action: 'close' | 'reload' | 'back' | 'forward' | 'find') {
  const result = await invokePlatformIpc<Result>('browser:pageAction', tab, action);
  if (!result?.success) throw new Error(result?.error || 'The page window did not respond.');
}
