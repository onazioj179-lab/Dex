// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Logger
// Activity and decision logging
// ===========================================================================

import { app, BrowserWindow } from 'electron';
import * as log from 'electron-log';

interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: any;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  constructor() {
    // Configure electron-log
    log.transports.file.level = 'info';
    // Disable console output in production; enable in development
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    log.transports.console.level = isDev ? 'debug' : false;
  }

  private addLog(level: LogEntry['level'], message: string, data?: any): void {
    const entry: LogEntry = {
      id: generateId(),
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    // Keep logs within limit
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Log to file
    switch (level) {
      case 'info':
        log.info(message, data || '');
        break;
      case 'warn':
        log.warn(message, data || '');
        break;
      case 'error':
        log.error(message, data || '');
        break;
      case 'success':
        log.info(` ${message}`, data || '');
        break;
    }

    // Notify renderer
    this.notifyRenderer(entry);
  }

  private notifyRenderer(entry: LogEntry): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('log:new', entry);
    }
  }

  info(message: string, data?: any): void {
    this.addLog('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.addLog('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.addLog('error', message, data);
  }

  success(message: string, data?: any): void {
    this.addLog('success', message, data);
  }

  getLogs(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  clearLogs(): void {
    this.logs = [];
  }
}
