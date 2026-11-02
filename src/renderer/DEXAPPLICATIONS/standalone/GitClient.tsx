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
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';

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
const LS_LAST_MSG = 'dex-git-last-message';
const LS_TEMPLATES = 'dex-git-templates';

// Built-in conventional-commit templates, merged with any the user has saved.
const BUILTIN_TEMPLATES: { label: string; body: string }[] = [
  { label: 'feat', body: 'feat: ' },
  { label: 'fix', body: 'fix: ' },
  { label: 'docs', body: 'docs: ' },
  { label: 'refactor', body: 'refactor: ' },
  { label: 'chore', body: 'chore: ' },
];

const loadTemplates = (): { label: string; body: string }[] => {
  try {
    const raw = localStorage.getItem(LS_TEMPLATES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is { label: string; body: string } =>
        t && typeof t.label === 'string' && typeof t.body === 'string',
    );
  } catch { return []; }
};

// Lightweight toast via the shared dex-toast CustomEvent contract.
const toast = (msg: string, kind: 'info' | 'success' | 'error' = 'info') => {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: msg, type: kind } }));
  } catch { /* ignore */ }
};

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

// File-status rows are floating glass cards; the .dex-liquid-glass class carries
// the background + border + rim, so only geometry lives here.
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '6px 10px', borderRadius: 'var(--radius-lg)',
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
  // The git operation currently running, as a present-participle label
  // ("Pulling", "Pushing", "Committing"…). Before this, `busy` showed nothing
  // about WHAT was happening — flash messages only fired on completion. Naming
  // the live op (Siri-style honesty) beats a generic rotating verb here because
  // git ops are short and specific.
  const [currentOp, setCurrentOp] = useState('');
  const [note, setNote] = useState('');
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [userTemplates, setUserTemplates] = useState<{ label: string; body: string }[]>(() => loadTemplates());
  const [lastMessage, setLastMessage] = useState<string>(() => {
    try { return localStorage.getItem(LS_LAST_MSG) || ''; } catch { return ''; }
  });
  const noteTimer = useRef<number | null>(null);

  const templates = useMemo(
    () => [...BUILTIN_TEMPLATES, ...userTemplates],
    [userTemplates],
  );

  const flash = useCallback((m: string, kind: 'info' | 'success' | 'error' = 'info') => {
    setNote(m);
    toast(m, kind);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(''), 4000);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!bridge) { setAvailable(false); return; }
    bridge.check().then(r => { if (alive) setAvailable(!!r?.available); }).catch(() => { if (alive) setAvailable(false); });
    return () => { alive = false; };
  }, [bridge]);

  // Clear the pending flash-note timeout on unmount so it can't fire after teardown.
  useEffect(() => () => {
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
  }, []);

  const refresh = useCallback(async (path = repoPath) => {
    if (!bridge || !path) return;
    setBusy(true);
    setCurrentOp('Refreshing');
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
      setCurrentOp('');
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

  const run = useCallback(async (fn: () => Promise<{ success: boolean; message: string }>, okMsg: string, op = 'Working') => {
    if (!bridge || !repoPath) return;
    setBusy(true);
    setCurrentOp(op);
    try {
      const r = await fn();
      flash(r?.success ? okMsg : (r?.message || 'Command failed'), r?.success ? 'success' : 'error');
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
      setCurrentOp('');
    }
  }, [bridge, repoPath, flash, refresh]);

  const staged = status?.files.filter(f => f.staged) ?? [];
  const unstaged = status?.files.filter(f => !f.staged) ?? [];

  // UKI app-context: expose the open repo, current branch, and staged / changed
  // counts. A ref keeps the resolver reading live state (register once at mount).
  const ukiCtxRef = useRef({ status, repoPath, staged, unstaged });
  ukiCtxRef.current = { status, repoPath, staged, unstaged };
  useEffect(() => {
    registerUkiAppContext('git', () => {
      const s = ukiCtxRef.current;
      if (!s.repoPath) return { appId: 'git', custom: { repo: '(no repo open)' } };
      const repoName = (s.status?.root || s.repoPath).split(/[\\/]/).filter(Boolean).pop() || s.repoPath;
      return {
        appId: 'git',
        currentFile: s.status?.root || s.repoPath,
        focusedItemId: s.repoPath,
        custom: {
          repo: repoName,
          branch: s.status?.branch || '(detached)',
          staged: s.staged.length,
          changed: s.unstaged.length,
          ahead: s.status?.ahead ?? 0,
          behind: s.status?.behind ?? 0,
        },
      };
    });
    // Let UKI read the repo's git status as a callable action (read-only).
    registerUkiAppAction('git', {
      id: 'git.status',
      description: 'report the current git repo, branch, ahead/behind, and staged/changed counts.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const s = ukiCtxRef.current;
      if (!s.repoPath) return 'No git repository is open.';
      const repoName = (s.status?.root || s.repoPath).split(/[\\/]/).filter(Boolean).pop() || s.repoPath;
      const branch = s.status?.branch || '(detached)';
      const ahead = s.status?.ahead ?? 0;
      const behind = s.status?.behind ?? 0;
      return `Repo ${repoName} on ${branch} — ${s.staged.length} staged, ${s.unstaged.length} changed, ${ahead} ahead / ${behind} behind.`;
    });
    return () => {
      unregisterUkiAppContext('git');
      unregisterUkiAppAction('git.status');
    };
  }, []);

  const toggleStage = useCallback((f: GitStatusFile) => {
    if (f.staged) void run(() => bridge!.unstage(repoPath, [f.path]), 'Unstaged', 'Unstaging');
    else void run(() => bridge!.stage(repoPath, [f.path]), 'Staged', 'Staging');
  }, [bridge, repoPath, run]);

  const commit = useCallback(() => {
    const msg = message.trim();
    if (!msg) { flash('Enter a commit message', 'error'); return; }
    if (staged.length === 0) { flash('Stage at least one file first', 'error'); return; }
    try { localStorage.setItem(LS_LAST_MSG, msg); } catch { /* ignore */ }
    setLastMessage(msg);
    void run(() => bridge!.commit(repoPath, msg), 'Committed', 'Committing').then(() => setMessage(''));
  }, [bridge, repoPath, message, staged.length, run, flash]);

  // Insert a template body at the start of the message (renderer-side only).
  const applyTemplate = useCallback((body: string) => {
    setMessage(prev => (prev.trim() ? `${body}${prev}` : body));
  }, []);

  // Save the current message as a reusable template, keyed by its first line.
  const saveTemplate = useCallback(() => {
    const body = message.trim();
    if (!body) { flash('Type a message to save as a template', 'error'); return; }
    const label = (body.split('\n')[0] || body).slice(0, 24);
    setUserTemplates(prev => {
      const next = [...prev.filter(t => t.label !== label), { label, body }];
      try { localStorage.setItem(LS_TEMPLATES, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    flash(`Saved template "${label}"`, 'success');
  }, [message, flash]);

  const removeTemplate = useCallback((label: string) => {
    setUserTemplates(prev => {
      const next = prev.filter(t => t.label !== label);
      try { localStorage.setItem(LS_TEMPLATES, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const recallLast = useCallback(() => {
    if (!lastMessage) { flash('No previous commit message to recall', 'error'); return; }
    setMessage(lastMessage);
  }, [lastMessage, flash]);

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
      <li key={(f.staged ? 's:' : 'u:') + f.path} className="dex-liquid-glass" style={rowStyle}>
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
              <div className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.75 }}>
                <span>{status.branch ?? 'detached'}</span>
                {status.ahead > 0 && (
                  <span title={`${status.ahead} commit(s) to push`} style={{ color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>↑{status.ahead}</span>
                )}
                {status.behind > 0 && (
                  <span title={`${status.behind} commit(s) to pull`} style={{ color: 'var(--color-warning)', fontFamily: 'var(--font-mono)' }}>↓{status.behind}</span>
                )}
                {status.upstream && status.ahead === 0 && status.behind === 0 && (
                  <span title="Up to date with upstream" style={{ color: 'var(--color-text-muted)' }}>· up to date</span>
                )}
                {status.upstream ? <span style={{ opacity: 0.7 }}>· {status.upstream}</span> : <span style={{ color: 'var(--color-text-muted)' }}>· no upstream</span>}
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
              onChange={(e) => { const b = e.target.value; if (b && b !== branches.current) void run(() => bridge!.checkout(repoPath, b), `Switched to ${b}`, 'Switching branch'); }}
              style={{ ...glassButton, padding: '4px 8px', fontSize: 12, ...disabledVisual(busy) }}
            >
              {branches.branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {status?.isRepo && (
            <button
              title={status.behind > 0 ? `Pull ${status.behind} commit(s)` : 'Pull from upstream'}
              style={{ ...glassButton, ...(status.behind > 0 ? { borderColor: 'var(--color-warning)', color: 'var(--color-warning)' } : {}), ...disabledVisual(busy) }}
              disabled={busy}
              onClick={() => run(() => bridge!.pull(repoPath), 'Pulled', 'Pulling')}
            >
              Pull{status.behind > 0 ? ` (${status.behind})` : ''}
            </button>
          )}
          {status?.isRepo && (
            <button
              title={status.ahead > 0 ? `Push ${status.ahead} commit(s)` : 'Push to upstream'}
              style={{ ...glassButton, ...(status.ahead > 0 ? { borderColor: 'var(--color-success)', color: 'var(--color-success)' } : {}), ...disabledVisual(busy) }}
              disabled={busy}
              onClick={() => run(() => bridge!.push(repoPath), 'Pushed', 'Pushing')}
            >
              Push{status.ahead > 0 ? ` (${status.ahead})` : ''}
            </button>
          )}
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
            flex: 1, minWidth: 0, padding: 'var(--space-2) 10px', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)',
            color: 'var(--color-text-primary)', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 12,
          }}
        />
        <button style={{ ...glassButton, ...disabledVisual(busy || !pending.trim()) }} disabled={busy || !pending.trim()} onClick={openRepo}>Open</button>
      </div>

      {/* Live operation indicator: while a git command runs, say WHICH one. The
          pulsing dot + accent text reads as active; clears the moment it ends. */}
      {busy && currentOp && (
        <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--color-accent)', fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent-fill)', animation: 'ukiPulse 0.9s ease-in-out infinite', flexShrink: 0 }} />
          {currentOp}…
        </div>
      )}
      {!busy && note && <div role="status" aria-live="polite" className="text-sm break-words" style={{ color: 'var(--color-text-secondary)' }}>{note}</div>}

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
                  onClick={() => run(() => bridge!.stage(repoPath, unstaged.map(f => f.path)), 'Staged all', 'Staging')}>Stage all</button>
                <button style={{ ...glassButton, padding: '2px 10px', fontSize: 12, ...disabledVisual(busy || staged.length === 0) }} disabled={busy || staged.length === 0}
                  onClick={() => run(() => bridge!.unstage(repoPath, staged.map(f => f.path)), 'Unstaged all', 'Unstaging')}>Unstage all</button>
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
            {/* Templates + recall */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
              {templates.map(t => {
                const custom = !BUILTIN_TEMPLATES.some(b => b.label === t.label);
                return (
                  <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <button
                      title={`Insert "${t.body.trim() || t.label}"`}
                      style={{ ...glassButton, padding: '2px 8px', fontSize: 11, ...disabledVisual(busy) }}
                      disabled={busy}
                      onClick={() => applyTemplate(t.body)}
                    >
                      {t.label}
                    </button>
                    {custom && (
                      <button
                        aria-label={`Delete template ${t.label}`}
                        title="Delete template"
                        style={{ ...glassButton, padding: '2px 6px', fontSize: 11, marginLeft: 2, color: 'var(--color-error)', ...disabledVisual(busy) }}
                        disabled={busy}
                        onClick={() => removeTemplate(t.label)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
              <span style={{ flex: 1 }} />
              <button
                title="Recall the last commit message"
                style={{ ...glassButton, padding: '2px 8px', fontSize: 11, ...disabledVisual(busy || !lastMessage) }}
                disabled={busy || !lastMessage}
                onClick={recallLast}
              >
                Recall last
              </button>
              <button
                title="Save the current message as a template"
                style={{ ...glassButton, padding: '2px 8px', fontSize: 11, ...disabledVisual(busy || !message.trim()) }}
                disabled={busy || !message.trim()}
                onClick={saveTemplate}
              >
                Save template
              </button>
            </div>
            <textarea
              aria-label="Commit message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commit(); }}
              placeholder="Commit message"
              rows={2}
              style={{
                resize: 'vertical', padding: 'var(--space-2) 10px', borderRadius: 'var(--radius-lg)',
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

          {/* Log + details */}
          <section style={{ flex: 1, minHeight: 0, display: 'flex', gap: 'var(--space-3)' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <h2 className="text-sm font-semibold" style={{ margin: '0 0 6px', opacity: 0.85 }}>History</h2>
              {commits.length === 0 ? (
                <div className="text-sm opacity-70">No commits yet.</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {commits.map(c => {
                    const active = selectedCommit?.hash === c.hash;
                    return (
                      <li
                        key={c.hash}
                        onClick={() => setSelectedCommit(active ? null : c)}
                        style={{
                          display: 'flex', gap: 10, padding: '5px 8px', borderRadius: 'var(--radius-lg)', alignItems: 'baseline', cursor: 'pointer',
                          background: active ? 'var(--color-bg-surface)' : 'transparent',
                          border: active ? '1px solid var(--color-accent)' : '1px solid transparent',
                        }}
                      >
                        <code style={{ color: 'var(--color-accent)', fontSize: 11 }}>{c.shortHash}</code>
                        <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{c.subject}</span>
                        <span className="text-xs" style={{ opacity: 0.55, whiteSpace: 'nowrap' }}>{c.author} · {c.date}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Details panel */}
            {selectedCommit && (
              <aside
                className="dex-liquid-glass-strong"
                style={{
                  width: 280, flexShrink: 0, overflow: 'auto', padding: 'var(--space-3)', borderRadius: 'var(--radius-xl)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 className="text-sm font-semibold" style={{ margin: 0 }}>Commit details</h3>
                  <button
                    aria-label="Close details"
                    style={{ ...glassButton, padding: '0 8px', fontSize: 14 }}
                    onClick={() => setSelectedCommit(null)}
                  >
                    ×
                  </button>
                </div>
                <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <dt className="text-xs" style={{ opacity: 0.55, marginBottom: 2 }}>Subject</dt>
                    <dd style={{ margin: 0, fontSize: 13, wordBreak: 'break-word' }}>{selectedCommit.subject}</dd>
                  </div>
                  <div>
                    <dt className="text-xs" style={{ opacity: 0.55, marginBottom: 2 }}>Hash</dt>
                    <dd style={{ margin: 0 }}>
                      <code style={{ fontSize: 11, color: 'var(--color-accent)', wordBreak: 'break-all' }}>{selectedCommit.hash}</code>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs" style={{ opacity: 0.55, marginBottom: 2 }}>Author</dt>
                    <dd style={{ margin: 0, fontSize: 13 }}>{selectedCommit.author}</dd>
                  </div>
                  <div>
                    <dt className="text-xs" style={{ opacity: 0.55, marginBottom: 2 }}>Date</dt>
                    <dd style={{ margin: 0, fontSize: 13 }}>{selectedCommit.date}</dd>
                  </div>
                </dl>
                <button
                  title="Copy full hash"
                  style={{ ...glassButton, alignSelf: 'flex-start', padding: '4px 12px', fontSize: 12 }}
                  onClick={() => {
                    try {
                      const p = navigator.clipboard?.writeText(selectedCommit.hash);
                      if (p && typeof p.catch === 'function') {
                        p.then(() => flash('Hash copied', 'success'))
                         .catch(() => flash('Copy failed', 'error'));
                      } else {
                        flash('Hash copied', 'success');
                      }
                    } catch (e) {
                      flash(e instanceof Error ? e.message : 'Copy failed', 'error');
                    }
                  }}
                >
                  Copy hash
                </button>
              </aside>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
