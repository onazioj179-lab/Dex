// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Platform -- PTY Service
// Lightweight shell-session manager for the in-app terminal (DexCode + Axle
// Nexus). Uses child_process.spawn with stdio pipes -- no node-pty native
// dependency, so it works on every platform without VC++ build tools.
//
// IPC surface (all under 'pty:' allowlist prefix):
//   pty:spawn  ({ shell?, cwd?, cols?, rows? }) -> { sessionId }
//   pty:write  ({ sessionId, data })            -> { success }
//   pty:resize ({ sessionId, cols, rows })      -> { success }   (no-op; for API parity)
//   pty:kill   ({ sessionId })                  -> { success }
//   pty:list   ()                               -> { sessions: [{ id, shell, cwd, alive }] }
// Events pushed to renderer via webContents.send:
//   'pty:data' { sessionId, data }
//   'pty:exit' { sessionId, code }
// ===========================================================================
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { ipcMain, BrowserWindow } from 'electron';
import os from 'os';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';

interface Session {
  id: string;
  shell: string;
  cwd: string;
  proc: ChildProcessWithoutNullStreams;
  createdAt: number;
  cols: number;
  rows: number;
}

const MAX_SESSIONS = 16;

class PtyServiceImpl {
  private sessions = new Map<string, Session>();
  private mainWindow: BrowserWindow | null = null;
  private nextId = 1;
  private registered = false;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  initialize(): void {
    if (this.registered) return;
    this.registered = true;

    ipcMain.handle('pty:spawn', (_e, opts?: { shell?: string; cwd?: string }) => this.spawnSession(opts));
    ipcMain.handle('pty:write', (_e, args: { sessionId: string; data: string }) => this.write(args));
    ipcMain.handle('pty:resize', (_e, args: { sessionId: string; cols: number; rows: number }) => this.resize(args));
    ipcMain.handle('pty:kill', (_e, args: { sessionId: string }) => this.kill(args.sessionId));
    ipcMain.handle('pty:list', () => this.list());

    log.info('[PtyService] Initialized');
  }

  /**
   * Resolve a shell that actually exists on this machine. Each candidate is
   * validated with fs.existsSync (absolute paths only); the chain ends in a
   * shell that is effectively always present (cmd.exe on Windows, /bin/sh on
   * unix) so a missing pwsh/zsh can never leave us with an unspawnable shell —
   * the root cause of the terminal crash-respawn loop.
   */
  private resolveShell(): { shell: string; args: string[] } {
    const exists = (p: string): boolean => {
      try { return path.isAbsolute(p) && fs.existsSync(p); } catch { return false; }
    };
    if (process.platform === 'win32') {
      const sysRoot = process.env.SystemRoot || 'C:\\Windows';
      const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
      const pwsh = path.join(pf, 'PowerShell', '7', 'pwsh.exe');
      const powershell = path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const cmd = process.env.COMSPEC || path.join(sysRoot, 'System32', 'cmd.exe');
      if (exists(pwsh)) return { shell: pwsh, args: ['-NoLogo'] };
      if (exists(powershell)) return { shell: powershell, args: ['-NoLogo'] };
      return { shell: cmd, args: [] };
    }
    const userShell = process.env.SHELL;
    if (userShell && exists(userShell)) return { shell: userShell, args: ['-i'] };
    if (process.platform === 'darwin' && exists('/bin/zsh')) return { shell: '/bin/zsh', args: ['-i'] };
    if (exists('/bin/bash')) return { shell: '/bin/bash', args: ['-i'] };
    return { shell: '/bin/sh', args: ['-i'] };
  }

  spawnSession(opts?: { shell?: string; cwd?: string; cols?: number; rows?: number }): { sessionId: string } | { error: string } {
    if (this.sessions.size >= MAX_SESSIONS) {
      return { error: `Maximum ${MAX_SESSIONS} terminal sessions reached.` };
    }
    const { shell: defShell, args } = this.resolveShell();
    // A caller-supplied shell is honoured only if it is a RECOGNIZED shell binary
    // (matched by basename) and, when absolute, actually exists. Anything else
    // falls back to the resolved default. This stops a compromised renderer from
    // using `pty:spawn` to launch an arbitrary PATH executable, while still
    // allowing a legitimate custom-shell choice.
    const ALLOWED_SHELLS = new Set([
      'pwsh', 'pwsh.exe', 'powershell', 'powershell.exe', 'cmd', 'cmd.exe',
      'bash', 'bash.exe', 'zsh', 'sh', 'fish', 'dash', 'nu', 'nu.exe',
      'git-bash.exe', 'wsl.exe', 'ksh', 'tcsh', 'csh',
    ]);
    let shell = defShell;
    if (opts?.shell) {
      let ok = false;
      try {
        const base = path.basename(opts.shell).toLowerCase();
        ok = ALLOWED_SHELLS.has(base) && (path.isAbsolute(opts.shell) ? fs.existsSync(opts.shell) : true);
      } catch { ok = false; }
      if (ok) shell = opts.shell;
      else log.warn(`[PtyService] Ignoring disallowed shell override: ${opts.shell}`);
    }
    const cwd = opts?.cwd || os.homedir();
    const cols = Math.max(1, opts?.cols ?? 80);
    const rows = Math.max(1, opts?.rows ?? 24);
    const id = `pty-${this.nextId++}`;

    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(shell, args, {
        cwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', COLUMNS: String(cols), LINES: String(rows) },
        windowsHide: true,
      });
    } catch (e) {
      log.error('[PtyService] spawn failed:', e);
      return { error: String(e) };
    }

    const session: Session = { id, shell, cwd, proc, createdAt: Date.now(), cols, rows };
    this.sessions.set(id, session);

    const pushData = (data: Buffer | string) => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
      this.mainWindow.webContents.send('pty:data', { sessionId: id, data: data.toString('utf8') });
    };
    const pushExit = (code: number | null) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('pty:exit', { sessionId: id, code });
      }
    };
    proc.stdout.on('data', pushData);
    proc.stderr.on('data', pushData);
    proc.on('exit', (code) => {
      this.sessions.delete(id);
      pushExit(code);
      log.info(`[PtyService] Session ${id} exited code=${code}`);
    });
    // ENOENT (shell binary missing/unspawnable) arrives here, NOT via the
    // synchronous try/catch above. Surface it as a clean exit + remove the
    // session so the renderer shows "terminal unavailable" instead of treating
    // the dead session as live and respawning in a loop.
    proc.on('error', (err) => {
      log.error(`[PtyService] Session ${id} error:`, err);
      pushData(`\r\n[terminal unavailable] ${err.message}\r\n`);
      this.sessions.delete(id);
      pushExit(-1);
    });

    log.info(`[PtyService] Spawned ${id} shell=${shell} cwd=${cwd} ${cols}x${rows}`);
    return { sessionId: id };
  }

  write(args: { sessionId: string; data: string }): { success: boolean; error?: string } {
    const s = this.sessions.get(args.sessionId);
    if (!s) return { success: false, error: 'Unknown session' };
    try {
      s.proc.stdin.write(args.data);
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  /**
   * Track terminal geometry. This is pipe-based stdio (no native PTY), so we
   * cannot resize a real TTY; we record cols/rows and, on unix, nudge the child
   * with SIGWINCH (best effort). xterm.js fit-addon (WS7) drives this.
   */
  resize(args: { sessionId: string; cols: number; rows: number }): { success: boolean } {
    const s = this.sessions.get(args.sessionId);
    if (!s) return { success: false };
    s.cols = Math.max(1, args.cols | 0) || s.cols;
    s.rows = Math.max(1, args.rows | 0) || s.rows;
    if (process.platform !== 'win32') {
      try { s.proc.kill('SIGWINCH'); } catch { /* best effort */ }
    }
    return { success: true };
  }

  kill(sessionId: string): { success: boolean } {
    const s = this.sessions.get(sessionId);
    if (!s) return { success: false };
    try { s.proc.kill(); } catch { /* ignore */ }
    this.sessions.delete(sessionId);
    return { success: true };
  }

  list(): { sessions: Array<{ id: string; shell: string; cwd: string; alive: boolean }> } {
    return {
      sessions: Array.from(this.sessions.values()).map(s => ({
        id: s.id,
        shell: s.shell,
        cwd: s.cwd,
        alive: !s.proc.killed,
      })),
    };
  }

  shutdown(): void {
    for (const s of this.sessions.values()) {
      try { s.proc.kill(); } catch { /* ignore */ }
    }
    this.sessions.clear();
  }
}

export const PtyService = new PtyServiceImpl();
