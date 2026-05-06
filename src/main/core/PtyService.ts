// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
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
import log from 'electron-log';

interface Session {
  id: string;
  shell: string;
  cwd: string;
  proc: ChildProcessWithoutNullStreams;
  createdAt: number;
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
    ipcMain.handle('pty:resize', (_e, _args: { sessionId: string; cols: number; rows: number }) => ({ success: true }));
    ipcMain.handle('pty:kill', (_e, args: { sessionId: string }) => this.kill(args.sessionId));
    ipcMain.handle('pty:list', () => this.list());

    log.info('[PtyService] Initialized');
  }

  private defaultShell(): { shell: string; args: string[] } {
    if (process.platform === 'win32') {
      // Prefer pwsh.exe if present, else fall back to powershell.exe
      const pwsh = process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'PowerShell', '7', 'pwsh.exe') : 'pwsh.exe';
      return { shell: pwsh, args: ['-NoLogo'] };
    }
    if (process.platform === 'darwin') {
      return { shell: process.env.SHELL || '/bin/zsh', args: ['-i'] };
    }
    return { shell: process.env.SHELL || '/bin/bash', args: ['-i'] };
  }

  spawnSession(opts?: { shell?: string; cwd?: string }): { sessionId: string } | { error: string } {
    if (this.sessions.size >= MAX_SESSIONS) {
      return { error: `Maximum ${MAX_SESSIONS} terminal sessions reached.` };
    }
    const { shell: defShell, args } = this.defaultShell();
    const shell = opts?.shell || defShell;
    const cwd = opts?.cwd || os.homedir();
    const id = `pty-${this.nextId++}`;

    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(shell, args, {
        cwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
        windowsHide: true,
      });
    } catch (e) {
      log.error('[PtyService] spawn failed:', e);
      return { error: String(e) };
    }

    const session: Session = { id, shell, cwd, proc, createdAt: Date.now() };
    this.sessions.set(id, session);

    const pushData = (data: Buffer | string) => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
      this.mainWindow.webContents.send('pty:data', { sessionId: id, data: data.toString('utf8') });
    };
    proc.stdout.on('data', pushData);
    proc.stderr.on('data', pushData);
    proc.on('exit', (code) => {
      this.sessions.delete(id);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('pty:exit', { sessionId: id, code });
      }
      log.info(`[PtyService] Session ${id} exited code=${code}`);
    });
    proc.on('error', (err) => {
      log.error(`[PtyService] Session ${id} error:`, err);
      pushData(`\r\n[pty error] ${err.message}\r\n`);
    });

    log.info(`[PtyService] Spawned ${id} shell=${shell} cwd=${cwd}`);
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
