// =============================================================================
// DEX Platform - Git (Tier 5 / 43)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// Keyboard-first source-control panel: point it at a repo, see status, stage /
// unstage, commit, switch branches, pull/push, and read the log -- without
// leaving DEX. Backed by the system `git` binary via `window.dex.git` (see
// main/controllers/GitController.ts). Degrades to a clear empty state when the
// native bridge or git itself is unavailable (e.g. the web preview).
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { glassPanel, glassButton } from '../../styles/glassMenu';
import DexIcon from '../../components/DexIcon';
import EmptyState from '../../components/EmptyState';

interface GitStatusFile {
  path: string;
  index: string;
  work: string;
  staged: boolean;
  untracked: boolean;
}
interface GitStatus {
  isRepo: boolean;
  root: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
}
interface GitCommit { hash: string; shortHash: string; author: string; date: string; subject: string; }

interface GitBridge {
  check: () => Promise<{ available: boolean; version: string }>;
  status: (cwd: string) => Promise<GitStatus>;
  log: (cwd: string, count?: number) => Promise<GitCommit[]>;
  branches: (cwd: string) => Promise<{ current: string | null; branches: string[] }>;
  stage: (cwd: string, files: string[]) => Promise<{ success: boolean; message: string }>;
  unstage: (cwd: string, files: string[]) => Promise<{ success: boolean; message: string }>;
  commit: (cwd: string, message: string) => Promise<{ success: boolean; message: string }>;
  push: (cwd: string) => Promise<{ success: boolean; message: string }>;
  pull: (cwd: string) => Promise<{ success: boolean; message: string }>;
  checkout: (cwd: string, branch: string) => Promise<{ success: boolean; message: string }>;
}

const getBridge = (): GitBridge | null => {
  const w = window as any;
  return (w.dex?.git ?? w.electron?.git ?? null) as GitBridge | null;
};

const LS_PATH = 'dex-git-repo-path';

// Status char -> { label, color } for the small leading badge.
const statusMeta = (f: GitStatusFile): { ch: string; color: string; title: string } => {
  if (f.untracked) return { ch: 'U', color: 'var(--color-text-muted)', title: 'Untracked' };
  const c = f.staged ? f.index : f.work;
  switch (c) {
    case 'M': return { ch: 'M', color: 'var(--color-warning)', title: 'Modified' };
    case 'A': return { ch: 'A', color: 'var(--color-success)', title: 'Added' };
    case 'D': return { ch: 'D', color: 'var(--color-error)', title: 'Deleted' };
    case 'R': return { ch: 'R', color: 'var(--color-accent)', title: 'Renamed' };
    case 'C': return { ch: 'C', color: 'var(--color-accent)', title: 'Copied' };
    default: return { ch: c?.trim() || '•', color: 'var(--color-text-secondary)', title: 'Changed' };
  }
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '6px 10px', borderRadius: 6,
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-surface)',
};

// glassButton has no :disabled CSS, so a disabled button otherwise stays fully
// lit with a pointer cursor. Match the standalone-app convention for the visual.
const disabledVisual = (off: boolean): React.CSSProperties =>
  off ? { opacity: 0.5, cursor: 'not-allowed' } : {};

export default function GitClient(): React.ReactElement {
  const bridge = useMemo(getBridge, []);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [repoPath, setRepoPath] = useState<string>(() => {
    try { return localStorage.getItem(LS_PATH) || ''; } catch { return ''; }
  });
  const [pending, setPending] = useState<string>(repoPath);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<{ current: string | null; branches: string[] }>({ current: null, branches: [] });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const noteTimer = useRef<number | null>(null);

  const flash = useCallback((m: string) => {
    setNote(m);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(''), 4000);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!bridge) { setAvailable(false); return; }
    bridge.check().then(r => { if (alive) setAvailable(!!r?.available); }).catch(() => { if (alive) setAvailable(false); });
    return () => { alive = false; };
  }, [bridge]);

  const refresh = useCallback(async (path = repoPath) => {
    if (!bridge || !path) return;
    setBusy(true);
    try {
      const [st, lg, br] = await Promise.all([
        bridge.status(path),
        bridge.log(path, 40),
        bridge.branches(path),
      ]);
      setStatus(st);
      setCommits(Array.isArray(lg) ? lg : []);
      setBranches(br && typeof br === 'object' ? br : { current: null, branches: [] });
    } catch (e) {
      flash(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [bridge, repoPath, flash]);

  useEffect(() => { if (repoPath) void refresh(repoPath); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const openRepo = useCallback(() => {
    const p = pending.trim();
    if (!p) return;
    setRepoPath(p);
    try { localStorage.setItem(LS_PATH, p); } catch { /* ignore */ }
    void refresh(p);
  }, [pending, refresh]);

  const run = useCallback(async (fn: () => Promise<{ success: boolean; message: string }>, okMsg: string) => {
    if (!bridge || !repoPath) return;
    setBusy(true);
    try {
      const r = await fn();
      flash(r?.success ? (okMsg) : (r?.message || 'Command failed'));
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [bridge, repoPath, flash, refresh]);

  const staged = status?.files.filter(f => f.staged) ?? [];
  const unstaged = status?.files.filter(f => !f.staged) ?? [];

  const toggleStage = useCallback((f: GitStatusFile) => {
    if (f.staged) void run(() => bridge!.unstage(repoPath, [f.path]), 'Unstaged');
    else void run(() => bridge!.stage(repoPath, [f.path]), 'Staged');
  }, [bridge, repoPath, run]);

  const commit = useCallback(() => {
    if (!message.trim()) { flash('Enter a commit message'); return; }
    if (staged.length === 0) { flash('Stage at least one file first'); return; }
    void run(() => bridge!.commit(repoPath, message.trim()), 'Committed').then(() => setMessage(''));
  }, [bridge, repoPath, message, staged.length, run, flash]);

  // ---- Render: bridge / availability gates ---------------------------------
  if (available === false) {
    return (
      <div className="p-6 h-full overflow-auto" style={glassPanel}>
        <EmptyState
          icon={<DexIcon name="git-branch" size={48} />}
          title="Git is unavailable here"
          description="The Git bridge needs the packaged DEX app with the system git binary installed. It is not reachable in the web preview."
        />
      </div>
    );
  }

  const renderFile = (f: GitStatusFile) => {
    const m = statusMeta(f);
    return (
      <li key={(f.staged ? 's:' : 'u:') + f.path} style={rowStyle}>
        <span title={m.title} style={{ width: 18, textAlign: 'center', fontWeight: 700, color: m.color, fontFamily: 'var(--font-mono)' }}>{m.ch}</span>
        <span className="truncate" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{f.path}</span>
        <button
          style={{ ...glassButton, padding: '2px 10px', fontSize: 12, ...disabledVisual(busy) }}
          disabled={busy}
          onClick={() => toggleStage(f)}
          aria-label={f.staged ? `Unstage ${f.path}` : `Stage ${f.path}`}
        >
          {f.staged ? 'Unstage' : 'Stage'}
        </button>
      </li>
    );
  };

  return (
    <div className="p-6 h-full overflow-auto" style={{ ...glassPanel, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DexIcon name="git-branch" size={22} />
          <div>
            <h1 className="text-2xl font-semibold" style={{ margin: 0 }}>Git</h1>
            {status?.isRepo && (
              <div className="text-xs opacity-70">
                {status.branch ?? 'detached'}
                {status.ahead > 0 ? ` ↑${status.ahead}` : ''}
                {status.behind > 0 ? ` ↓${status.behind}` : ''}
                {status.upstream ? ` · ${status.upstream}` : ''}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {status?.isRepo && branches.branches.length > 0 && (
            <select
              aria-label="Switch branch"
              value={branches.current ?? ''}
              disabled={busy}
              onChange={(e) => { const b = e.target.value; if (b && b !== branches.current) void run(() => bridge!.checkout(repoPath, b), `Switched to ${b}`); }}
              style={{ ...glassButton, padding: '4px 8px', fontSize: 12, ...disabledVisual(busy) }}
            >
              {branches.branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {status?.isRepo && <button style={{ ...glassButton, ...disabledVisual(busy) }} disabled={busy} onClick={() => run(() => bridge!.pull(repoPath), 'Pulled')}>Pull</button>}
          {status?.isRepo && <button style={{ ...glassButton, ...disabledVisual(busy) }} disabled={busy} onClick={() => run(() => bridge!.push(repoPath), 'Pushed')}>Push</button>}
          <button style={{ ...glassButton, ...disabledVisual(busy || !repoPath) }} disabled={busy || !repoPath} onClick={() => refresh()}>Refresh</button>
        </div>
      </header>

      {/* Repo path */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input
          aria-label="Repository path"
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') openRepo(); }}
          placeholder="Path to a git repository (e.g. C:\\Users\\you\\project)"
          style={{
            flex: 1, minWidth: 0, padding: 'var(--space-2) 10px', borderRadius: 6,
            border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)',
            color: 'var(--color-text-primary)', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 12,
          }}
        />
        <button style={{ ...glassButton, ...disabledVisual(busy || !pending.trim()) }} disabled={busy || !pending.trim()} onClick={openRepo}>Open</button>
      </div>

      {note && <div role="status" aria-live="polite" className="text-sm break-words" style={{ color: 'var(--color-text-secondary)' }}>{note}</div>}

      {/* Body */}
      {!repoPath ? (
        <EmptyState
          icon={<DexIcon name="git-branch" size={48} />}
          title="Open a repository"
          description="Enter the path to a folder that contains a .git directory to see its status, stage changes, and commit."
        />
      ) : status && !status.isRepo ? (
        <EmptyState
          icon={<DexIcon name="alert-triangle" size={48} />}
          title="Not a git repository"
          description={`No .git found at "${repoPath}". Check the path or run git init there.`}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', flex: 1, minHeight: 0 }}>
          {/* Changes */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 className="text-sm font-semibold" style={{ margin: 0, opacity: 0.85 }}>
                Changes {status ? `(${status.files.length})` : ''}
              </h2>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button style={{ ...glassButton, padding: '2px 10px', fontSize: 12, ...disabledVisual(busy || unstaged.length === 0) }} disabled={busy || unstaged.length === 0}
                  onClick={() => run(() => bridge!.stage(repoPath, unstaged.map(f => f.path)), 'Staged all')}>Stage all</button>
                <button style={{ ...glassButton, padding: '2px 10px', fontSize: 12, ...disabledVisual(busy || staged.length === 0) }} disabled={busy || staged.length === 0}
                  onClick={() => run(() => bridge!.unstage(repoPath, staged.map(f => f.path)), 'Unstaged all')}>Unstage all</button>
              </div>
            </div>
            {status && status.files.length === 0 ? (
              <div className="text-sm opacity-70" style={{ padding: '8px 0' }}>Working tree clean.</div>
            ) : (
              <>
                {staged.length > 0 && (
                  <>
                    <div className="text-xs" style={{ opacity: 0.6, margin: '4px 0' }}>STAGED</div>
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>{staged.map(renderFile)}</ul>
                  </>
                )}
                {unstaged.length > 0 && (
                  <>
                    <div className="text-xs" style={{ opacity: 0.6, margin: '8px 0 4px' }}>CHANGES</div>
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>{unstaged.map(renderFile)}</ul>
                  </>
                )}
              </>
            )}
          </section>

          {/* Commit */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              aria-label="Commit message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commit(); }}
              placeholder="Commit message"
              rows={2}
              style={{
                resize: 'vertical', padding: 'var(--space-2) 10px', borderRadius: 6,
                border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)',
                color: 'var(--color-text-primary)', outline: 'none', fontSize: 13, fontFamily: 'var(--font-family)',
              }}
            />
            <button
              style={{ ...glassButton, alignSelf: 'flex-start', padding: '6px 16px', borderColor: 'var(--color-accent)', color: 'var(--color-accent)', ...disabledVisual(busy || staged.length === 0 || !message.trim()) }}
              disabled={busy || staged.length === 0 || !message.trim()}
              onClick={commit}
            >
              Commit {staged.length > 0 ? `(${staged.length})` : ''}
            </button>
          </section>

          {/* Log */}
          <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <h2 className="text-sm font-semibold" style={{ margin: '0 0 6px', opacity: 0.85 }}>History</h2>
            {commits.length === 0 ? (
              <div className="text-sm opacity-70">No commits yet.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {commits.map(c => (
                  <li key={c.hash} style={{ display: 'flex', gap: 10, padding: '5px 8px', borderRadius: 6, alignItems: 'baseline' }}>
                    <code style={{ color: 'var(--color-accent)', fontSize: 11 }}>{c.shortHash}</code>
                    <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{c.subject}</span>
                    <span className="text-xs" style={{ opacity: 0.55, whiteSpace: 'nowrap' }}>{c.author} · {c.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
