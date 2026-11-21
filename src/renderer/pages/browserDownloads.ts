// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useCallback, useEffect, useState } from 'react';
import { invokePlatformIpc, subscribePlatformIpc } from '../services/platform/ipc';

interface BrowserDownload {
  id: number;
  revision: number;
  name: string;
  host: string;
  tab: string;
  status: 'waiting' | 'choosing' | 'downloading' | 'completed' | 'canceled' | 'failed';
  received: number;
  total: number | null;
}

type DownloadResult = { success: boolean; supported?: boolean; error?: string; downloads?: BrowserDownload[] };

function validDownload(value: unknown): value is BrowserDownload {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<BrowserDownload>;
  return Number.isSafeInteger(item.id) && Number.isSafeInteger(item.revision) &&
    typeof item.name === 'string' && typeof item.host === 'string' && typeof item.received === 'number' &&
    typeof item.status === 'string' && ['waiting', 'choosing', 'downloading', 'completed', 'canceled', 'failed'].includes(item.status);
}

export function useBrowserDownloads(enabled: boolean) {
  const [supported, setSupported] = useState(false);
  const [items, setItems] = useState<BrowserDownload[]>([]);
  const publish = useCallback((value: unknown) => {
    if (!validDownload(value)) return;
    setItems(previous => {
      const earlier = previous.find(item => item.id === value.id);
      if (earlier && earlier.revision >= value.revision) return previous;
      return [value, ...previous.filter(item => item.id !== value.id)].sort((a, b) => b.id - a.id).slice(0, 100);
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    const stop = subscribePlatformIpc('dex-browser-download', value => {
      if (!mounted || !validDownload(value)) return;
      setSupported(true);
      publish(value);
    });
    void invokePlatformIpc<DownloadResult>('browser:downloads').then(result => {
      if (!mounted || !result?.success) return;
      setSupported(result.supported === true);
      result.downloads?.forEach(publish);
    });
    return () => { mounted = false; stop(); };
  }, [enabled, publish]);

  return { supported, items };
}

export async function browserDownloadAction(id: number, action: 'save' | 'cancel') {
  const result = await invokePlatformIpc<DownloadResult>('browser:downloadAction', id, action);
  if (!result?.success) throw new Error(result?.error || 'The download action could not be completed.');
}
