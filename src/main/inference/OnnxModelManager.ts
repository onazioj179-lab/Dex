// =============================================================================
// DEX Platform — Wave 0.3
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0.
// =============================================================================
/**
 * OnnxModelManager — lazy on-demand downloader + cache for quantized ONNX
 * models used by ML-assisted creative-app features.
 *
 * Models are NOT bundled in the installer. On first use of a feature that
 * needs a model, the manager:
 *   1. Resolves the right quantization tier from PerfTier (fp16/int8/int4)
 *   2. Checks `~/.dex/models/<id>/<file>` for a cached copy
 *   3. If missing, downloads from a configured mirror (HTTPS), verifies SHA256
 *   4. Returns the file path; the caller hands it to onnxruntime-node
 *
 * All download progress is reported via an EventEmitter so UI can render
 * progress modals.
 *
 * onnxruntime-node itself is loaded lazily so the dependency stays optional
 * — if the user never touches an ML feature, the runtime never loads.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as https from 'https';
import { getPerfTier, presetFor, type PerfTier } from '../compute/PerfTier';

export type ModelId =
  | 'demucs-htdemucs'
  | 'real-esrgan-x4'
  | 'deepfilternet3'
  | 'yolov8n'
  | 'rembg-u2net'
  | 'gte-small'
  | 'deoldify'
  | 'dncnn';

export type Quant = 'fp32' | 'fp16' | 'int8' | 'int4';

export interface ModelVariant {
  quant: Quant;
  /** File name inside the model directory. */
  file: string;
  /** Bytes (for progress display). */
  size: number;
  /** SHA256 hex digest for verification. */
  sha256: string;
  /** Mirror URL — must serve over HTTPS. */
  url: string;
}

export interface ModelDescriptor {
  id: ModelId;
  /** Human-readable name. */
  name: string;
  /** Available quantization variants. */
  variants: ModelVariant[];
}

export interface DownloadProgress {
  id: ModelId;
  quant: Quant;
  bytesDone: number;
  bytesTotal: number;
  percent: number;
}

export interface ResolvedModel {
  id: ModelId;
  quant: Quant;
  /** Absolute path to the model file on disk. */
  filePath: string;
}

const ENV_MODEL_DIR = 'DEX_MODELS_DIR';

// Registry — populated by callers (or default registry below). Real SHAs and
// URLs are filled in once each model is uploaded to the mirror; for now the
// registry is empty by default so the manager fails closed rather than
// downloading from an untrusted source.
const REGISTRY = new Map<ModelId, ModelDescriptor>();

export class OnnxModelManagerImpl extends EventEmitter {
  private readonly modelsDir: string;
  private readonly inFlight = new Map<string, Promise<ResolvedModel>>();
  private rt: unknown = null;
  private rtAttempted = false;

  constructor(modelsDir?: string) {
    super();
    this.modelsDir = modelsDir
      ?? process.env[ENV_MODEL_DIR]
      ?? path.join(os.homedir(), '.dex', 'models');
  }

  /** Register or override a model descriptor. */
  register(descriptor: ModelDescriptor): void {
    REGISTRY.set(descriptor.id, descriptor);
  }

  /** Inspect available variants. */
  describe(id: ModelId): ModelDescriptor | undefined {
    return REGISTRY.get(id);
  }

  list(): ModelDescriptor[] {
    return Array.from(REGISTRY.values());
  }

  /**
   * Pick the appropriate quant for a host. By default driven from PerfTier:
   *   workstation/high -> fp16
   *   mid              -> int8
   *   low              -> int8
   *   ultra-low        -> int4 (or int8 if int4 unavailable)
   */
  pickQuant(id: ModelId, tier?: PerfTier): Quant {
    const t = tier ?? getPerfTier();
    const target = presetFor(t).onnxQuant;
    const desc = REGISTRY.get(id);
    if (!desc) throw new Error(`OnnxModelManager: unknown model "${id}"`);
    // Prefer requested tier; fall back to next-coarsest available.
    const order: Quant[] = (() => {
      switch (target) {
        case 'fp32': return ['fp32', 'fp16', 'int8', 'int4'];
        case 'fp16': return ['fp16', 'fp32', 'int8', 'int4'];
        case 'int8': return ['int8', 'int4', 'fp16', 'fp32'];
        case 'int4': return ['int4', 'int8', 'fp16', 'fp32'];
      }
    })();
    for (const q of order) {
      if (desc.variants.find(v => v.quant === q)) return q;
    }
    throw new Error(`OnnxModelManager: model "${id}" has no variants`);
  }

  /**
   * Ensure a model is on disk; download if missing. Returns absolute path.
   */
  async ensure(id: ModelId, quant?: Quant): Promise<ResolvedModel> {
    const q = quant ?? this.pickQuant(id);
    const key = `${id}:${q}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const p = this._ensure(id, q).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  private async _ensure(id: ModelId, quant: Quant): Promise<ResolvedModel> {
    const desc = REGISTRY.get(id);
    if (!desc) throw new Error(`OnnxModelManager: unknown model "${id}"`);
    const variant = desc.variants.find(v => v.quant === quant);
    if (!variant) throw new Error(`OnnxModelManager: model "${id}" has no variant "${quant}"`);

    const dir = path.join(this.modelsDir, id);
    const filePath = path.join(dir, variant.file);
    await fs.mkdir(dir, { recursive: true });

    if (await fileExistsAndMatches(filePath, variant.sha256)) {
      return { id, quant, filePath };
    }

    await this.download(variant, filePath, id);
    if (!(await fileExistsAndMatches(filePath, variant.sha256))) {
      await fs.unlink(filePath).catch(() => undefined);
      throw new Error(`OnnxModelManager: SHA256 mismatch for ${id}/${variant.file}`);
    }
    return { id, quant, filePath };
  }

  private async download(variant: ModelVariant, filePath: string, id: ModelId): Promise<void> {
    if (!variant.url.startsWith('https://')) {
      throw new Error('OnnxModelManager: model URL must be HTTPS');
    }
    const tmp = filePath + '.part';
    await new Promise<void>((resolve, reject) => {
      const req = https.get(variant.url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`OnnxModelManager: HTTP ${res.statusCode} for ${variant.url}`));
          res.resume();
          return;
        }
        const total = Number(res.headers['content-length']) || variant.size;
        const fd = require('fs').createWriteStream(tmp);
        let done = 0;
        res.on('data', (chunk: Buffer) => {
          done += chunk.length;
          this.emit('progress', {
            id, quant: variant.quant, bytesDone: done, bytesTotal: total,
            percent: total > 0 ? done / total : 0,
          } satisfies DownloadProgress);
        });
        res.pipe(fd);
        fd.on('finish', () => fd.close((err: NodeJS.ErrnoException | null) => err ? reject(err) : resolve()));
        fd.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(120_000, () => req.destroy(new Error('OnnxModelManager: download timeout')));
    });
    await fs.rename(tmp, filePath);
  }

  /**
   * Lazy-load `onnxruntime-node`. Returns the runtime handle (typed as unknown
   * because the dep is optional).
   */
  async getRuntime(): Promise<unknown> {
    if (this.rt) return this.rt;
    if (this.rtAttempted) throw new Error('onnxruntime-node not installed');
    this.rtAttempted = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.rt = require('onnxruntime-node');
      return this.rt;
    } catch (err) {
      throw new Error('onnxruntime-node not installed — run: npm install onnxruntime-node');
    }
  }

  /** Path inspection (for UI). */
  modelsRoot(): string { return this.modelsDir; }
}

async function fileExistsAndMatches(filePath: string, sha256: string): Promise<boolean> {
  try {
    const buf = await fs.readFile(filePath);
    const h = crypto.createHash('sha256').update(buf).digest('hex');
    return h === sha256;
  } catch {
    return false;
  }
}

export const OnnxModelManager = new OnnxModelManagerImpl();
