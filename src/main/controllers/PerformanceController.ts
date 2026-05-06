// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// Performance Controller
// IPC bridge for PerformanceReservation. Provides live process enumeration
// (via the native module when available) and priority adjustment using
// platform-specific commands.
// ===========================================================================

import { ipcMain, app } from 'electron';
import { spawn } from 'child_process';
import log from 'electron-log';
import {
  configurePerformanceReservation,
  getPerformanceReservation,
  type ProcessSnapshot,
  type Platform,
} from '../core/PerformanceReservation';

interface NativeProcess {
  pid: number;
  name: string;
  cpu_usage?: number;
  memory_kb?: number;
}

interface NativeProcessModule {
  getProcesses?: (limit?: number) => NativeProcess[];
}

let nativeProcesses: NativeProcessModule | null = null;
try {
  const native = require('../../native/dex-native.node') as NativeProcessModule;
  if (typeof native.getProcesses === 'function') nativeProcesses = native;
} catch { /* native unavailable */ }

const platform = (process.platform as Platform);

async function enumerate(): Promise<ProcessSnapshot[]> {
  if (!nativeProcesses?.getProcesses) return [];
  const list = nativeProcesses.getProcesses(500);
  // Foreground tracking is OS-specific and expensive; treat all as background
  // for now -- the operator gates dangerous releases anyway.
  return list.map(p => ({
    pid: p.pid,
    name: p.name,
    priority: platform === 'win32' ? 'Normal' : 0,
    foreground: false,
  }));
}

async function setPriority(pid: number, priority: string | number): Promise<void> {
  if (platform === 'win32') {
    const cls = String(priority);
    await runCommand('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(Get-Process -Id ${pid} -ErrorAction Stop).PriorityClass = '${cls}'`,
    ]);
  } else {
    const nice = typeof priority === 'number' ? priority : 0;
    await runCommand('renice', ['-n', String(nice), '-p', String(pid)]);
  }
}

function runCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exit ${code}: ${stderr.trim().slice(0, 120)}`));
    });
  });
}

class PerformanceControllerImpl {
  private static instance: PerformanceControllerImpl;
  private initialized = false;

  static getInstance(): PerformanceControllerImpl {
    if (!PerformanceControllerImpl.instance) {
      PerformanceControllerImpl.instance = new PerformanceControllerImpl();
    }
    return PerformanceControllerImpl.instance;
  }

  initialize(): void {
    if (this.initialized) return;
    configurePerformanceReservation({
      enumerate,
      setPriority,
      platform: () => platform,
    });
    this.setupIPC();
    this.initialized = true;
    if (!app.isPackaged) log.info('[PerformanceController] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('system:claimResources', async (_e, enable: unknown, options: unknown) => {
      const r = getPerformanceReservation();
      if (!r) return { ok: false, error: 'not-configured' };
      try {
        const status = enable
          ? await r.enable((options && typeof options === 'object') ? options as Record<string, unknown> : undefined)
          : await r.disable();
        return { ok: true, status };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'failed' };
      }
    });

    ipcMain.handle('system:reservationStatus', () => {
      const r = getPerformanceReservation();
      return r ? { ok: true, status: r.status() } : { ok: false, error: 'not-configured' };
    });

    ipcMain.handle('system:releasePid', async (_e, pid: unknown) => {
      const r = getPerformanceReservation();
      if (!r) return { ok: false };
      if (typeof pid !== 'number') return { ok: false, error: 'invalid-pid' };
      await r.release(pid);
      return { ok: true };
    });
  }
}

export const performanceController = PerformanceControllerImpl.getInstance();
