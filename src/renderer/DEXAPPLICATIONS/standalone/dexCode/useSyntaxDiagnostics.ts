// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import { scriptExtension, type SyntaxProblem, type SyntaxResult } from './languageProtocol';

const MAX_SOURCE_LENGTH = 500_000;
type Check = { id: string; name: string; text: string; enabled: boolean };
type Report = { id: string; name: string; text: string } & ({ problems: SyntaxProblem[] } | { error: string });
type SyntaxDiagnostics =
  | { status: 'unsupported' }
  | { status: 'checking' }
  | { status: 'error'; error: string }
  | { status: 'ready'; problems: SyntaxProblem[] };

export function useSyntaxDiagnostics({ id, name, text, enabled }: Check): SyntaxDiagnostics {
  const extension = enabled ? scriptExtension(name) : null;
  const [report, setReport] = useState<Report | null>(null);
  const worker = useRef<Worker | null>(null);
  const nextRequest = useRef(0);

  useEffect(() => () => {
    worker.current?.terminate();
    worker.current = null;
  }, []);

  useEffect(() => {
    if (!extension || text.length > MAX_SOURCE_LENGTH) return;
    const request = ++nextRequest.current;
    let activeWorker: Worker | null = null;
    let deadline: number | undefined;
    const failed = () => {
      window.clearTimeout(deadline);
      activeWorker?.terminate();
      if (worker.current === activeWorker) worker.current = null;
      setReport({ id, name, text, error: 'Syntax checking is unavailable.' });
    };
    const receive = (event: MessageEvent<SyntaxResult>) => {
      if (event.data.request !== request) return;
      window.clearTimeout(deadline);
      const result = event.data;
      setReport('error' in result ? { id, name, text, error: result.error } : { id, name, text, problems: result.problems });
    };
    const timer = window.setTimeout(() => {
      try {
        if (!worker.current) {
          const created = new Worker(new URL('./languageWorker.ts', import.meta.url), { type: 'module' });
          created.addEventListener('error', () => {
            if (worker.current === created) worker.current = null;
            created.terminate();
          });
          worker.current = created;
        }
        activeWorker = worker.current;
        activeWorker.addEventListener('error', failed);
        activeWorker.addEventListener('message', receive);
        deadline = window.setTimeout(failed, 12_000);
        activeWorker.postMessage({ request, extension, text });
      } catch {
        failed();
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(deadline);
      activeWorker?.removeEventListener('error', failed);
      activeWorker?.removeEventListener('message', receive);
    };
  }, [extension, id, name, text]);

  if (!extension) return { status: 'unsupported' };
  if (text.length > MAX_SOURCE_LENGTH) {
    return { status: 'error', error: 'This file exceeds the syntax check limit.' };
  }
  if (report?.id !== id || report.name !== name || report.text !== text) {
    return { status: 'checking' };
  }
  return 'error' in report
    ? { status: 'error', error: report.error }
    : { status: 'ready', problems: report.problems };
}
