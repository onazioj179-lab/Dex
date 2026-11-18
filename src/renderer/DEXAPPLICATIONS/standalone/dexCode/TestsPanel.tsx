// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX Code › Tests: the project's declared test command, run through Xack,
// with the real exit status, pass/fail counts and output tail.

import React, { useEffect, useRef, useState } from 'react';
import { findTestCommand, runTests, type TestRun } from './testRunner';
import { DexCapsuleButton } from '../../../components/controls';

// Keep the last run per folder while DEX Code is open (the panel can close).
const lastRuns = new Map<string, TestRun>();

export const TestsPanel: React.FC<{ root?: string }> = ({ root }) => {
  const [info, setInfo] = useState<{ command: string | null; why?: string; name?: string } | null>(null);
  const [run, setRun] = useState<TestRun | null>(root ? lastRuns.get(root) ?? null : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cancel = useRef({ cancelled: false });
  const outRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setInfo(null); setError('');
    if (!root) return;
    let alive = true;
    void findTestCommand(root).then((r) => { if (alive) setInfo({ command: r.command, why: r.why, name: r.project?.name }); });
    return () => { alive = false; };
  }, [root]);

  useEffect(() => { if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight; }, [run?.output]);

  if (!root) return <div style={note}>Open a folder (project) to run its tests.</div>;
  if (!info) return <div style={note}>Looking for the project's test command…</div>;

  const start = async () => {
    if (!info.command) return;
    setBusy(true); setError('');
    try {
      const done = await runTests(root, info.command, (r) => { setRun(r); lastRuns.set(root, r); }, cancel.current);
      setRun(done); lastRuns.set(root, done);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const s = run?.summary;
  const ok = run && run.status === 'completed' && run.exitCode === 0;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '0 8px 8px', gap: 6 }} data-testid="dexcode-tests">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        {info.command ? <code style={code}>{info.command}</code> : <span style={{ color: 'var(--color-text-tertiary)' }}>{info.why}</span>}
        {info.name && <span style={{ color: 'var(--color-text-tertiary)' }}>{info.name}</span>}
        <span style={{ flex: 1 }} />
        {busy && run?.status === 'running' && <DexCapsuleButton size="sm" onClick={() => { cancel.current.cancelled = true; }}>Stop</DexCapsuleButton>}
        <DexCapsuleButton size="sm" primary disabled={!info.command || busy} onClick={() => { void start(); }}>{busy ? 'Running…' : 'Run tests'}</DexCapsuleButton>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--color-error)' }}>{error}</div>}
      {run && (
        <div style={{ fontSize: 12, display: 'flex', gap: 10, alignItems: 'baseline' }} data-testid="dexcode-tests-summary">
          <span style={{ fontWeight: 600, color: run.status === 'running' ? 'var(--color-text-secondary)' : ok ? 'var(--color-success)' : 'var(--color-error)' }}>
            {run.status === 'running' ? 'Running' : ok ? 'Passed' : run.status === 'completed' || run.status === 'failed' ? 'Failed' : run.status}
          </span>
          {s && <span>{s.passed ?? 0} passed · {s.failed ?? 0} failed{s.skipped ? ` · ${s.skipped} skipped` : ''} ({s.framework})</span>}
          {run.exitCode != null && <span style={{ color: 'var(--color-text-tertiary)' }}>exit code {run.exitCode}</span>}
        </div>
      )}
      {run && <pre ref={outRef} style={out}>{run.output.replace(/\x1b\[[0-9;]*m/g, '').slice(-20000) || '(no output yet)'}</pre>}
    </div>
  );
};

const note: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-tertiary)', padding: '6px 12px' };
const code: React.CSSProperties = { fontFamily: 'var(--font-mono, Consolas, monospace)', fontSize: 12, padding: '1px 8px', borderRadius: 6, background: 'var(--color-bg-hover)' };
const out: React.CSSProperties = { flex: 1, minHeight: 0, margin: 0, overflow: 'auto', fontFamily: 'var(--font-mono, Consolas, monospace)', fontSize: 11.5, lineHeight: 1.45, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' };
