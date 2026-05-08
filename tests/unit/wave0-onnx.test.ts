// =============================================================================
// DEX Platform — Wave 0 tests
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { OnnxModelManagerImpl } from '../../src/main/inference/OnnxModelManager';

describe('OnnxModelManager', () => {
  let dir: string;
  let mgr: OnnxModelManagerImpl;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onnx-mgr-'));
    mgr = new OnnxModelManagerImpl(dir);
  });

  it('uses provided models dir', () => {
    expect(mgr.modelsRoot()).toBe(dir);
  });

  it('describes registered model', () => {
    mgr.register({
      id: 'gte-small',
      name: 'GTE Small',
      variants: [
        { quant: 'int8', file: 'model.onnx', size: 33_000_000, sha256: 'a'.repeat(64), url: 'https://example/x' },
      ],
    });
    expect(mgr.describe('gte-small')?.name).toBe('GTE Small');
    expect(mgr.list().length).toBe(1);
  });

  it('pickQuant falls back when target not available', () => {
    mgr.register({
      id: 'gte-small', name: 'GTE',
      variants: [{ quant: 'int4', file: 'm.onnx', size: 1, sha256: 'b'.repeat(64), url: 'https://x' }],
    });
    // Force fp16 desire on a system that only has int4
    process.env.DEX_PERF_TIER = 'high';
    const q = mgr.pickQuant('gte-small');
    expect(q).toBe('int4');
    delete process.env.DEX_PERF_TIER;
  });

  it('rejects http URLs (forces HTTPS)', async () => {
    mgr.register({
      id: 'gte-small', name: 'GTE',
      variants: [{ quant: 'int8', file: 'm.onnx', size: 1, sha256: 'c'.repeat(64), url: 'http://insecure/x' }],
    });
    await expect(mgr.ensure('gte-small', 'int8')).rejects.toThrow(/HTTPS/);
  });

  it('throws on unknown model', async () => {
    await expect(mgr.ensure('demucs-htdemucs')).rejects.toThrow(/unknown model/);
  });
});
