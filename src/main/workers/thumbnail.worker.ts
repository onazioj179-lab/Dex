// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Worker -- Thumbnail Generation Thread
// ==========================================================================
// All media preview generation runs here.
// ==========================================================================

import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

let sharp: any;
try { sharp = require('sharp'); } catch { sharp = null; }

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

async function generateImageThumb(inputPath: string, outputPath: string, width: number, height: number): Promise<boolean> {
  if (!sharp) return false;
  try {
    ensureDir(path.dirname(outputPath));
    await sharp(inputPath)
      .resize(width, height, { fit: 'cover' })
      .jpeg({ quality: 75 })
      .toFile(outputPath);
    try { fs.chmodSync(outputPath, 0o600); } catch { /* ignore */ }
    return true;
  } catch {
    return false;
  }
}

async function generateTextThumb(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    const content = fs.readFileSync(inputPath, 'utf8').slice(0, 500);
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, content, { encoding: 'utf8', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg']);

function respond(msg: ThreadMessage, payload: any, error?: string): void {
  parentPort?.postMessage({
    type: `${msg.type}:response`,
    payload,
    requestId: msg.requestId,
    timestamp: Date.now(),
    error,
  });
}

parentPort?.on('message', async (msg: ThreadMessage) => {
  try {
    switch (msg.type) {
      case 'generate-thumbnail': {
        const { inputPath, outputPath, width, height } = msg.payload;
        const ext = path.extname(inputPath).toLowerCase();
        let success = false;
        if (IMAGE_EXTS.has(ext)) {
          success = await generateImageThumb(inputPath, outputPath, width || 200, height || 200);
        } else if (['.txt', '.md', '.json', '.csv'].includes(ext)) {
          success = await generateTextThumb(inputPath, outputPath);
        }
        respond(msg, { success, outputPath });
        break;
      }
      case 'batch-thumbnails': {
        const items: Array<{ inputPath: string; outputPath: string; width?: number; height?: number }> = msg.payload.items || [];
        const results: Array<{ inputPath: string; success: boolean }> = [];
        for (const item of items) {
          const ext = path.extname(item.inputPath).toLowerCase();
          let success = false;
          if (IMAGE_EXTS.has(ext)) {
            success = await generateImageThumb(item.inputPath, item.outputPath, item.width || 200, item.height || 200);
          } else if (['.txt', '.md', '.json', '.csv'].includes(ext)) {
            success = await generateTextThumb(item.inputPath, item.outputPath);
          }
          results.push({ inputPath: item.inputPath, success });
        }
        respond(msg, { results });
        break;
      }
      default:
        respond(msg, null, `Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    respond(msg, null, err.message);
  }
});
