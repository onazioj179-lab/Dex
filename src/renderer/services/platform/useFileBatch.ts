// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useCallback, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLiveActivityStore } from '../../store/liveActivityStore';
import { invokePlatformIpc } from './ipc';

export type BatchAction = 'copy' | 'move' | 'trash';
export type BatchConflict = 'skip' | 'keepBoth';
type ItemStatus = 'complete' | 'covered' | 'conflict' | 'failed' | 'cancelled' | 'partial';

interface BatchItem {
  source: string;
  status: ItemStatus;
  reason?: string;
}

interface BatchProgress {
  id: string;
  finished: number;
  total: number;
}

interface BatchRequest {
  action: BatchAction;
  sources: string[];
  destination?: string;
  conflict?: BatchConflict;
}

interface BatchReport {
  request: BatchRequest;
  items: BatchItem[];
}

export function batchPending(items: BatchItem[]) {
  return items.filter(item => item.status === 'conflict' || item.status === 'failed' || item.status === 'cancelled');
}

interface BatchRetry {
  report: BatchReport;
  rows: BatchItem[];
}

export function mergeBatchRetry(retry: BatchRetry, updated: BatchItem[]): BatchReport {
  const replacements = new Map(retry.rows.map((row, index) => [row, updated[index]]));
  return { ...retry.report, items: retry.report.items.map(row => replacements.get(row) ?? row) };
}

export function fileLabel(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

const titles: Record<BatchAction, string> = { copy: 'Copy files', move: 'Move files', trash: 'Move to Trash' };
const statuses = new Set<ItemStatus>(['complete', 'covered', 'conflict', 'failed', 'cancelled', 'partial']);

export function useFileBatch() {
  const idRef = useRef<string | null>(null);
  const [progress, setProgress] = useState<(BatchProgress & { started: boolean }) | null>(null);
  const [report, setReport] = useState<BatchReport | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const run = useCallback(async (request: BatchRequest, retry?: BatchRetry): Promise<BatchItem[] | null> => {
    if (idRef.current || !request.sources.length) return null;
    if (request.sources.length > 5000) {
      setError('Select up to 5,000 items at a time.');
      return null;
    }
    const id = crypto.randomUUID();
    idRef.current = id;
    setError('');
    if (!retry) setReport(null);
    setProgress({ id, finished: 0, total: request.sources.length, started: false });
    const store = useLiveActivityStore.getState();
    const activity = store.start({ title: titles[request.action], badge: 'FILES', icon: 'files', progress: 0 });
    let unlisten: (() => void) | undefined;
    try {
      try {
        unlisten = await listen<BatchProgress>('dex-files-batch-progress', ({ payload }) => {
          if (payload.id !== id || idRef.current !== id) return;
          setProgress({ ...payload, started: true });
          store.update(activity, { progress: payload.finished / payload.total, subtitle: `${payload.finished} of ${payload.total} items` });
        });
      } catch {
        // The native response still gives a complete report if event transport is unavailable.
      }
      const result = await invokePlatformIpc<
        { success: true; items: BatchItem[] } | { success: false; error: string }
      >('files:batch', { ...request, id });
      if (!result?.success || !Array.isArray(result.items) || result.items.length !== request.sources.length
        || result.items.some((item, index) => !item || item.source !== request.sources[index] || !statuses.has(item.status))) {
        setError(result?.success === false ? result.error : 'Could not confirm the results. Check the destination before retrying.');
        store.complete(activity, { status: 'error', subtitle: 'File results unavailable' });
        return null;
      }
      const total = result.items.filter(item => item.status === 'complete').length;
      const pending = batchPending(result.items).length;
      const partial = result.items.filter(item => item.status === 'partial').length;
      setReport(retry ? mergeBatchRetry(retry, result.items) : { request, items: result.items });
      const details = [`${total} completed`, pending ? `${pending} remaining` : '', partial ? `${partial} copied with original kept` : ''];
      store.complete(activity, { status: pending || partial ? 'error' : 'success', subtitle: details.filter(Boolean).join(' · ') });
      return result.items;
    } finally {
      unlisten?.();
      idRef.current = null;
      setProgress(null);
      setCancelling(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    setCancelling(true);
    const result = await invokePlatformIpc<{ success: boolean }>('files:cancelBatch', id);
    if (idRef.current === id && !result?.success) setCancelling(false);
  }, []);

  return { run, cancel, cancelling, progress, report, error, dismiss: () => { setReport(null); setError(''); } };
}
