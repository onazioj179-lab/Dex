// =============================================================================
// DEX Platform - Git Controller
// Tier 5 (43): Git integration. Wraps the system `git` binary (no libgit) so
// repos can be inspected and operated on from the DEX shell without leaving it.
// All IPC handlers are defensive: a missing git binary or a non-repo path
// resolves to a structured "unavailable"/error result, never a thrown reject,
// so the renderer can always render a graceful state.
// =============================================================================

import { ipcMain } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

const GIT_TIMEOUT_MS = 20_000;
const MAX_BUFFER = 8 * 1024 * 1024; // 8MB — large logs/diffs

interface GitRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface GitStatusFile {
  path: string;
  /** index (staged) status char, ' ' if none */
  index: string;
  /** worktree (unstaged) status char, ' ' if none */
  work: string;
  staged: boolean;
  untracked: boolean;
}

export interface GitStatus {
  isRepo: boolean;
  root: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
}

const US = '\x1f'; // unit separator — safe field delimiter for log parsing

/** Run a git subcommand with an explicit arg array (no shell -> no injection). */
function runGit(cwd: string, args: string[]): Promise<GitRun> {
  return new Promise((resolve) => {
    let valid = false;
    try {
      valid = typeof cwd === 'string' && cwd.length > 0 && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory();
    } catch { valid = false; }
    if (!valid) {
      resolve({ ok: false, stdout: '', stderr: 'Invalid or missing directory', code: null });
      return;
    }
    execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const code = typeof (err as any).code === 'number' ? (err as any).code : null;
        resolve({ ok: false, stdout: stdout || '', stderr: stderr || (err as Error).message, code });
        return;
      }
      resolve({ ok: true, stdout: stdout || '', stderr: stderr || '', code: 0 });
    });
  });
}

/** Sanitize a list of repo-relative paths used as `git` arguments. */
function safePaths(files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  return files
    .filter((f): f is string => typeof f === 'string' && f.length > 0 && !f.startsWith('-'))
    .slice(0, 5000);
}

async function getStatus(cwd: string): Promise<GitStatus> {
  const empty: GitStatus = { isRepo: false, root: null, branch: null, upstream: null, ahead: 0, behind: 0, files: [] };
  const root = await runGit(cwd, ['rev-parse', '--show-toplevel']);
  if (!root.ok) return empty;
  const repoRoot = root.stdout.trim();

  const res = await runGit(cwd, ['status', '--porcelain=v1', '-b', '--untracked-files=all']);
  if (!res.ok) return { ...empty, isRepo: true, root: repoRoot };

  const lines = res.stdout.split('\n').filter(Boolean);
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files: GitStatusFile[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // ## main...origin/main [ahead 1, behind 2]
      const info = line.slice(3);
      const branchPart = info.split(' ')[0];
      const [local, up] = branchPart.split('...');
      branch = local === 'HEAD (no branch)' ? null : local;
      upstream = up || null;
      const aheadMatch = info.match(/ahead (\d+)/);
      const behindMatch = info.match(/behind (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10) || 0;
      if (behindMatch) behind = parseInt(behindMatch[1], 10) || 0;
      continue;
    }
    const index = line[0] ?? ' ';
    const work = line[1] ?? ' ';
    let filePath = line.slice(3);
    // Renames: "R  old -> new" — keep the new path.
    if (filePath.includes(' -> ')) filePath = filePath.split(' -> ')[1];
    const untracked = index === '?' && work === '?';
    files.push({
      path: filePath,
      index,
      work,
      staged: !untracked && index !== ' ',
      untracked,
    });
  }

  return { isRepo: true, root: repoRoot, branch, upstream, ahead, behind, files };
}

async function getLog(cwd: string, count: number): Promise<GitCommit[]> {
  const n = Math.max(1, Math.min(500, Number.isFinite(count) ? count : 30));
  const fmt = ['%H', '%h', '%an', '%ad', '%s'].join(US);
  const res = await runGit(cwd, ['log', `-n${n}`, `--pretty=format:${fmt}`, '--date=short']);
  if (!res.ok) return [];
  return res.stdout.split('\n').filter(Boolean).map((line) => {
    const [hash, shortHash, author, date, subject] = line.split(US);
    return { hash: hash || '', shortHash: shortHash || '', author: author || '', date: date || '', subject: subject || '' };
  });
}

async function getBranches(cwd: string): Promise<{ current: string | null; branches: string[] }> {
  const cur = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const list = await runGit(cwd, ['branch', '--format=%(refname:short)']);
  const branches = list.ok ? list.stdout.split('\n').map(s => s.trim()).filter(Boolean) : [];
  return { current: cur.ok ? cur.stdout.trim() : null, branches };
}

function ok(message = ''): { success: true; message: string } { return { success: true, message }; }
function fail(message: string): { success: false; message: string } { return { success: false, message: message.trim() || 'Git command failed' }; }

let registered = false;

/** Register all `git:*` IPC handlers. Idempotent + defensive. */
export function registerGitHandlers(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle('git:check', async () => {
    return new Promise((resolve) => {
      execFile('git', ['--version'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err) { resolve({ available: false, version: '' }); return; }
        resolve({ available: true, version: (stdout || '').trim() });
      });
    });
  });

  ipcMain.handle('git:status', async (_e, cwd: string): Promise<GitStatus> => {
    try { return await getStatus(cwd); }
    catch (e) { log.warn('[git] status failed:', e); return { isRepo: false, root: null, branch: null, upstream: null, ahead: 0, behind: 0, files: [] }; }
  });

  ipcMain.handle('git:log', async (_e, cwd: string, count?: number): Promise<GitCommit[]> => {
    try { return await getLog(cwd, count ?? 30); }
    catch (e) { log.warn('[git] log failed:', e); return []; }
  });

  ipcMain.handle('git:branches', async (_e, cwd: string) => {
    try { return await getBranches(cwd); }
    catch (e) { log.warn('[git] branches failed:', e); return { current: null, branches: [] }; }
  });

  ipcMain.handle('git:stage', async (_e, cwd: string, files: string[]) => {
    const paths = safePaths(files);
    if (paths.length === 0) return fail('No files to stage');
    const r = await runGit(cwd, ['add', '--', ...paths]);
    return r.ok ? ok('Staged') : fail(r.stderr);
  });

  ipcMain.handle('git:unstage', async (_e, cwd: string, files: string[]) => {
    const paths = safePaths(files);
    if (paths.length === 0) return fail('No files to unstage');
    // `restore --staged` is the modern path; fall back to `reset` on old git.
    let r = await runGit(cwd, ['restore', '--staged', '--', ...paths]);
    if (!r.ok) r = await runGit(cwd, ['reset', '-q', 'HEAD', '--', ...paths]);
    return r.ok ? ok('Unstaged') : fail(r.stderr);
  });

  ipcMain.handle('git:commit', async (_e, cwd: string, message: string) => {
    if (typeof message !== 'string' || !message.trim()) return fail('Commit message is required');
    const r = await runGit(cwd, ['commit', '-m', message]);
    return r.ok ? ok(r.stdout.trim()) : fail(r.stderr || r.stdout);
  });

  ipcMain.handle('git:push', async (_e, cwd: string) => {
    const r = await runGit(cwd, ['push']);
    return r.ok ? ok((r.stderr || r.stdout).trim()) : fail(r.stderr || r.stdout);
  });

  ipcMain.handle('git:pull', async (_e, cwd: string) => {
    const r = await runGit(cwd, ['pull', '--ff-only']);
    return r.ok ? ok((r.stdout || r.stderr).trim()) : fail(r.stderr || r.stdout);
  });

  ipcMain.handle('git:checkout', async (_e, cwd: string, branch: string) => {
    if (typeof branch !== 'string' || !branch.trim() || branch.startsWith('-')) return fail('Invalid branch');
    const r = await runGit(cwd, ['checkout', branch]);
    return r.ok ? ok((r.stderr || r.stdout).trim()) : fail(r.stderr || r.stdout);
  });

  ipcMain.handle('git:diff', async (_e, cwd: string, file: string) => {
    if (typeof file !== 'string' || file.startsWith('-')) return '';
    const r = await runGit(cwd, ['diff', '--', file]);
    return r.ok ? r.stdout : '';
  });

  log.info('[git] handlers registered');
}

export default registerGitHandlers;
