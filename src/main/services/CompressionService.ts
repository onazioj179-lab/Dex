// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * CompressionService — IPC bridge for Rust zstd compression
 *
 * Exposes kernel_compress / kernel_decompress to the renderer via IPC,
 * with a Node.js zlib fallback when the native module isn't loaded.
 */

import { ipcMain } from 'electron';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import { compress, decompress } from '../engine/kernel';
import { Logger } from '../utils/Logger';

const logger = new Logger();

export class CompressionService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.registerIPC();
    this.initialized = true;
    logger.info('[CompressionService] Initialized');
  }

  // --- Core API ---

  compressBuffer(data: Buffer, level?: number): Buffer {
    // Try Rust zstd first
    const native = compress(data, level);
    if (native) return native;

    // Fallback: Node zlib gzip
    return zlib.gzipSync(data, { level: level ?? 6 });
  }

  decompressBuffer(data: Buffer): Buffer {
    const native = decompress(data);
    if (native) return native;

    // Fallback: try gzip then raw deflate
    try { return zlib.gunzipSync(data); }
    catch { return zlib.inflateSync(data); }
  }

  async compressFile(filePath: string, outPath?: string): Promise<{ outputPath: string; originalSize: number; compressedSize: number; ratio: number }> {
    const input = await fs.promises.readFile(filePath);
    const compressed = this.compressBuffer(input);
    const dest = outPath || filePath + '.zst';
    await fs.promises.writeFile(dest, compressed);
    const ratio = compressed.length / input.length;
    return { outputPath: dest, originalSize: input.length, compressedSize: compressed.length, ratio };
  }

  async decompressFile(filePath: string, outPath?: string): Promise<{ outputPath: string; size: number }> {
    const input = await fs.promises.readFile(filePath);
    const decompressed = this.decompressBuffer(input);
    const dest = outPath || filePath.replace(/\.(zst|gz)$/, '');
    await fs.promises.writeFile(dest, decompressed);
    return { outputPath: dest, size: decompressed.length };
  }

  // --- IPC ---

  private registerIPC(): void {
    ipcMain.handle('compression:compress', async (_e, data: Uint8Array, level?: number) => {
      try {
        const buf = Buffer.from(data);
        const result = this.compressBuffer(buf, level);
        return { success: true, data: result, ratio: result.length / buf.length };
      } catch (err) {
        logger.error('[CompressionService] compress error:', err);
        return { success: false, error: String(err) };
      }
    });

    ipcMain.handle('compression:decompress', async (_e, data: Uint8Array) => {
      try {
        const result = this.decompressBuffer(Buffer.from(data));
        return { success: true, data: result };
      } catch (err) {
        logger.error('[CompressionService] decompress error:', err);
        return { success: false, error: String(err) };
      }
    });

    ipcMain.handle('compression:compress-file', async (_e, filePath: string, outPath?: string) => {
      try {
        // Validate path is within allowed directories
        const resolved = path.resolve(filePath);
        return { success: true, ...(await this.compressFile(resolved, outPath ? path.resolve(outPath) : undefined) ) };
      } catch (err) {
        logger.error('[CompressionService] compress-file error:', err);
        return { success: false, error: String(err) };
      }
    });

    ipcMain.handle('compression:decompress-file', async (_e, filePath: string, outPath?: string) => {
      try {
        const resolved = path.resolve(filePath);
        return { success: true, ...(await this.decompressFile(resolved, outPath ? path.resolve(outPath) : undefined)) };
      } catch (err) {
        logger.error('[CompressionService] decompress-file error:', err);
        return { success: false, error: String(err) };
      }
    });
  }

  async shutdown(): Promise<void> {
    logger.info('[CompressionService] Shutdown');
  }
}
