// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Large File Reader
// GB-scale files open safely with chunked reads
// No freezes, no memory spikes
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface ChunkRequest {
  filePath: string;
  startByte: number;
  endByte: number;
  encoding?: BufferEncoding;
}

export interface ChunkResult {
  content: string | Buffer;
  startByte: number;
  endByte: number;
  totalSize: number;
  isLastChunk: boolean;
  lineStart?: number;
  lineEnd?: number;
}

export interface FileSession {
  id: string;
  filePath: string;
  size: number;
  chunkSize: number;
  currentPosition: number;
  encoding: BufferEncoding;
  isOpen: boolean;
  created: number;
  lastAccess: number;
}

export interface LargeFileConfig {
  defaultChunkSize: number;
  maxChunkSize: number;
  sessionTimeout: number;
  maxConcurrentSessions: number;
  lineBufferSize: number;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: LargeFileConfig = {
  defaultChunkSize: 64 * 1024,      // 64KB default chunk
  maxChunkSize: 1024 * 1024,        // 1MB max chunk
  sessionTimeout: 5 * 60 * 1000,    // 5 minutes
  maxConcurrentSessions: 10,
  lineBufferSize: 4096              // Buffer for line reading
};

// ===========================================================================
// LARGE FILE READER
// ===========================================================================

class LargeFileReaderClass extends EventEmitter {
  private config: LargeFileConfig;
  private sessions: Map<string, FileSession> = new Map();
  private sessionCounter = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setupIPC();
    this.startSessionCleanup();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Open file session
    ipcMain.handle('largefile:open', async (_event, filePath: string, chunkSize?: number) => {
      return this.openSession(filePath, chunkSize);
    });

    // Close file session
    ipcMain.handle('largefile:close', (_event, sessionId: string) => {
      return this.closeSession(sessionId);
    });

    // Read next chunk
    ipcMain.handle('largefile:readNext', async (_event, sessionId: string) => {
      return this.readNextChunk(sessionId);
    });

    // Read specific chunk
    ipcMain.handle('largefile:readChunk', async (_event, request: ChunkRequest) => {
      return this.readChunk(request);
    });

    // Read lines
    ipcMain.handle('largefile:readLines', async (_event, sessionId: string, lineCount: number) => {
      return this.readLines(sessionId, lineCount);
    });

    // Seek to position
    ipcMain.handle('largefile:seek', (_event, sessionId: string, position: number) => {
      return this.seek(sessionId, position);
    });

    // Get file info
    ipcMain.handle('largefile:info', async (_event, filePath: string) => {
      return this.getFileInfo(filePath);
    });

    // Get session info
    ipcMain.handle('largefile:session', (_event, sessionId: string) => {
      return this.getSession(sessionId);
    });

    // List active sessions
    ipcMain.handle('largefile:sessions', () => {
      return this.listSessions();
    });

    // Update config
    ipcMain.handle('largefile:setConfig', (_event, config: Partial<LargeFileConfig>) => {
      this.config = { ...this.config, ...config };
      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // SESSION MANAGEMENT
  // -------------------------------------------------------------------------

  async openSession(filePath: string, chunkSize?: number): Promise<{ session?: FileSession; error?: string }> {
    try {
      // Check concurrent sessions limit
      if (this.sessions.size >= this.config.maxConcurrentSessions) {
        // Close oldest session
        this.closeOldestSession();
      }

      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        return { error: 'Not a file' };
      }

      const sessionId = `lf-${Date.now()}-${++this.sessionCounter}`;
      const effectiveChunkSize = Math.min(
        chunkSize || this.config.defaultChunkSize,
        this.config.maxChunkSize
      );

      const session: FileSession = {
        id: sessionId,
        filePath,
        size: stats.size,
        chunkSize: effectiveChunkSize,
        currentPosition: 0,
        encoding: 'utf8',
        isOpen: true,
        created: Date.now(),
        lastAccess: Date.now()
      };

      this.sessions.set(sessionId, session);
      log.debug(`[LargeFile] Opened session ${sessionId} for ${path.basename(filePath)} (${this.formatBytes(stats.size)})`);

      return { session };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to open file';
      return { error: errorMessage };
    }
  }

  closeSession(sessionId: string): { success: boolean } {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isOpen = false;
      this.sessions.delete(sessionId);
      log.debug(`[LargeFile] Closed session ${sessionId}`);
      return { success: true };
    }
    return { success: false };
  }

  private closeOldestSession(): void {
    let oldest: FileSession | null = null;
    let oldestId: string | null = null;

    for (const [id, session] of this.sessions) {
      if (!oldest || session.lastAccess < oldest.lastAccess) {
        oldest = session;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.closeSession(oldestId);
    }
  }

  // -------------------------------------------------------------------------
  // CHUNK READING
  // -------------------------------------------------------------------------

  async readNextChunk(sessionId: string): Promise<ChunkResult | { error: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isOpen) {
      return { error: 'Session not found or closed' };
    }

    session.lastAccess = Date.now();

    if (session.currentPosition >= session.size) {
      return {
        content: '',
        startByte: session.currentPosition,
        endByte: session.currentPosition,
        totalSize: session.size,
        isLastChunk: true
      };
    }

    const startByte = session.currentPosition;
    const endByte = Math.min(startByte + session.chunkSize, session.size);

    try {
      const result = await this.readChunk({
        filePath: session.filePath,
        startByte,
        endByte,
        encoding: session.encoding
      });

      session.currentPosition = endByte;
      return result;
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Read failed' };
    }
  }

  async readChunk(request: ChunkRequest): Promise<ChunkResult> {
    const { filePath, startByte, endByte, encoding = 'utf8' } = request;
    const length = endByte - startByte;

    // Validate chunk size
    if (length > this.config.maxChunkSize) {
      throw new Error(`Chunk size exceeds maximum (${this.formatBytes(length)} > ${this.formatBytes(this.config.maxChunkSize)})`);
    }

    const fd = await fs.open(filePath, 'r');
    try {
      const stats = await fd.stat();
      const buffer = Buffer.alloc(length);
      
      const { bytesRead } = await fd.read(buffer, 0, length, startByte);
      
      const actualEndByte = startByte + bytesRead;
      const isLastChunk = actualEndByte >= stats.size;

      return {
        content: buffer.slice(0, bytesRead).toString(encoding),
        startByte,
        endByte: actualEndByte,
        totalSize: stats.size,
        isLastChunk
      };
    } finally {
      await fd.close();
    }
  }

  // -------------------------------------------------------------------------
  // LINE-BASED READING
  // -------------------------------------------------------------------------

  async readLines(sessionId: string, lineCount: number): Promise<{ lines: string[]; hasMore: boolean } | { error: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isOpen) {
      return { error: 'Session not found or closed' };
    }

    session.lastAccess = Date.now();

    const lines: string[] = [];
    let buffer = '';
    let position = session.currentPosition;

    const fd = await fs.open(session.filePath, 'r');
    try {
      while (lines.length < lineCount && position < session.size) {
        const chunkBuffer = Buffer.alloc(this.config.lineBufferSize);
        const { bytesRead } = await fd.read(chunkBuffer, 0, this.config.lineBufferSize, position);
        
        if (bytesRead === 0) break;
        
        buffer += chunkBuffer.slice(0, bytesRead).toString(session.encoding);
        position += bytesRead;

        // Extract complete lines
        const lineBreaks = buffer.split('\n');
        while (lineBreaks.length > 1 && lines.length < lineCount) {
          lines.push(lineBreaks.shift()!);
        }
        buffer = lineBreaks.join('\n');
      }

      // If we've reached EOF, add remaining buffer as last line
      if (position >= session.size && buffer.length > 0 && lines.length < lineCount) {
        lines.push(buffer);
        buffer = '';
      }

      // Update session position (account for unprocessed buffer)
      session.currentPosition = position - Buffer.byteLength(buffer, session.encoding);

      return {
        lines,
        hasMore: session.currentPosition < session.size
      };
    } finally {
      await fd.close();
    }
  }

  // -------------------------------------------------------------------------
  // SEEKING
  // -------------------------------------------------------------------------

  seek(sessionId: string, position: number): { success: boolean; position?: number; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isOpen) {
      return { success: false, error: 'Session not found or closed' };
    }

    if (position < 0 || position > session.size) {
      return { success: false, error: 'Invalid position' };
    }

    session.currentPosition = position;
    session.lastAccess = Date.now();

    return { success: true, position };
  }

  seekToLine(sessionId: string, lineNumber: number): Promise<{ success: boolean; position?: number; error?: string }> {
    // This would require scanning the file to find line positions
    // For now, we'll implement a simple version that reads through
    return this.seekToLineImpl(sessionId, lineNumber);
  }

  private async seekToLineImpl(sessionId: string, targetLine: number): Promise<{ success: boolean; position?: number; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isOpen) {
      return { success: false, error: 'Session not found or closed' };
    }

    // Reset to start
    session.currentPosition = 0;
    let currentLine = 0;

    const fd = await fs.open(session.filePath, 'r');
    try {
      const buffer = Buffer.alloc(this.config.lineBufferSize);
      let position = 0;

      while (currentLine < targetLine && position < session.size) {
        const { bytesRead } = await fd.read(buffer, 0, this.config.lineBufferSize, position);
        if (bytesRead === 0) break;

        for (let i = 0; i < bytesRead; i++) {
          if (buffer[i] === 10) { // newline
            currentLine++;
            if (currentLine === targetLine) {
              session.currentPosition = position + i + 1;
              session.lastAccess = Date.now();
              return { success: true, position: session.currentPosition };
            }
          }
        }
        position += bytesRead;
      }

      return { success: false, error: 'Line not found' };
    } finally {
      await fd.close();
    }
  }

  // -------------------------------------------------------------------------
  // FILE INFO
  // -------------------------------------------------------------------------

  async getFileInfo(filePath: string): Promise<{
    size: number;
    sizeFormatted: string;
    isLarge: boolean;
    recommendedChunkSize: number;
    estimatedLineCount?: number;
  }> {
    const stats = await fs.stat(filePath);
    const size = stats.size;
    const isLarge = size > 10 * 1024 * 1024; // > 10MB

    // Determine recommended chunk size based on file size
    let recommendedChunkSize = this.config.defaultChunkSize;
    if (size > 1024 * 1024 * 1024) { // > 1GB
      recommendedChunkSize = 256 * 1024; // 256KB
    } else if (size > 100 * 1024 * 1024) { // > 100MB
      recommendedChunkSize = 128 * 1024; // 128KB
    }

    return {
      size,
      sizeFormatted: this.formatBytes(size),
      isLarge,
      recommendedChunkSize
    };
  }

  // -------------------------------------------------------------------------
  // SESSION INFO
  // -------------------------------------------------------------------------

  getSession(sessionId: string): FileSession | null {
    return this.sessions.get(sessionId) || null;
  }

  listSessions(): FileSession[] {
    return Array.from(this.sessions.values());
  }

  // -------------------------------------------------------------------------
  // STREAM READING (for very large files)
  // -------------------------------------------------------------------------

  createReadStream(filePath: string, start?: number, end?: number): fsSync.ReadStream {
    const options: { highWaterMark: number; start?: number; end?: number } = {
      highWaterMark: this.config.defaultChunkSize
    };

    if (start !== undefined) options.start = start;
    if (end !== undefined) options.end = end;

    return fsSync.createReadStream(filePath, options);
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  private startSessionCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (now - session.lastAccess > this.config.sessionTimeout) {
          this.closeSession(id);
          log.debug(`[LargeFile] Session ${id} timed out`);
        }
      }
    }, 60000); // Check every minute
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all sessions
    for (const id of this.sessions.keys()) {
      this.closeSession(id);
    }
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const LargeFileReader = new LargeFileReaderClass();
export default LargeFileReader;
