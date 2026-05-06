// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Plugin Publisher tests (in-memory fs)
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  packagePlugin,
  verifyEnvelope,
  extractEnvelope,
  scanFiles,
  parseEnvelope,
  envelopeToString,
  type FsLike,
  type DexPlugEnvelope,
} from '../../src/main/plugins/PluginPublisher';

class MemFs implements FsLike {
  files = new Map<string, Uint8Array>();
  dirs = new Set<string>(['/']);

  add(path: string, content: string | Uint8Array): void {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.files.set(path, data);
    let cur = '';
    for (const seg of path.split('/').slice(0, -1)) {
      cur = cur ? `${cur}/${seg}` : seg;
      this.dirs.add(cur || '/');
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const f = this.files.get(path);
    if (!f) throw new Error(`ENOENT ${path}`);
    return f;
  }
  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    this.add(path, data);
  }
  async readDir(path: string): Promise<string[]> {
    const prefix = path.endsWith('/') ? path : path + '/';
    const seen = new Set<string>();
    for (const k of this.files.keys()) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const head = rest.split('/')[0];
      seen.add(head);
    }
    for (const d of this.dirs) {
      if (!d.startsWith(prefix) || d === path) continue;
      const rest = d.slice(prefix.length);
      const head = rest.split('/')[0];
      if (head) seen.add(head);
    }
    return [...seen];
  }
  async stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean }> {
    if (this.files.has(path)) return { isDirectory: false, isFile: true };
    if (this.dirs.has(path)) return { isDirectory: true, isFile: false };
    throw new Error(`ENOENT ${path}`);
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }
  async mkdirP(path: string): Promise<void> {
    let cur = '';
    for (const seg of path.split('/')) {
      cur = cur ? `${cur}/${seg}` : seg;
      this.dirs.add(cur || '/');
    }
  }
  join(...parts: string[]): string {
    return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
  }
}

const VALID_MANIFEST = JSON.stringify({
  id: 'demo',
  name: 'Demo Plugin',
  version: '1.0.0',
  author: 'tester',
  main: 'main.js',
});

describe('PluginPublisher.packagePlugin', () => {
  it('creates a complete envelope from a source directory', async () => {
    const fs = new MemFs();
    fs.add('plugin/manifest.json', VALID_MANIFEST);
    fs.add('plugin/main.js', 'console.log("hi");\n');
    fs.add('plugin/README.md', '# Demo\n');

    const env = await packagePlugin('plugin', fs, { now: () => 1700000000000 });
    expect(env.format).toBe('dexplug-v1');
    expect(env.manifest.id).toBe('demo');
    expect(Object.keys(env.files).sort()).toEqual(['README.md', 'main.js', 'manifest.json']);
    expect(env.published.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(env.published.publishedAt).toBe(1700000000000);
    expect(env.published.author).toBe('tester');
  });

  it('rejects when no manifest is present', async () => {
    const fs = new MemFs();
    fs.add('plugin/main.js', '');
    await expect(packagePlugin('plugin', fs)).rejects.toThrow();
  });

  it('rejects manifest missing required fields', async () => {
    const fs = new MemFs();
    fs.add('plugin/manifest.json', JSON.stringify({ id: 'x' }));
    await expect(packagePlugin('plugin', fs)).rejects.toThrow();
  });

  it('rejects files larger than maxFileBytes', async () => {
    const fs = new MemFs();
    fs.add('plugin/manifest.json', VALID_MANIFEST);
    fs.add('plugin/big.bin', new Uint8Array(2048));
    await expect(packagePlugin('plugin', fs, { maxFileBytes: 1024 })).rejects.toThrow(/exceeds max size/);
  });

  it('produces a deterministic sha256 for identical inputs', async () => {
    const make = async () => {
      const fs = new MemFs();
      fs.add('plugin/manifest.json', VALID_MANIFEST);
      fs.add('plugin/main.js', 'export const x = 1;\n');
      return await packagePlugin('plugin', fs, { now: () => 0 });
    };
    const a = await make();
    const b = await make();
    expect(a.published.sha256).toBe(b.published.sha256);
  });
});

describe('PluginPublisher.verifyEnvelope', () => {
  it('verifies a freshly packaged envelope', async () => {
    const fs = new MemFs();
    fs.add('plugin/manifest.json', VALID_MANIFEST);
    fs.add('plugin/main.js', 'export const x = 1;\n');
    const env = await packagePlugin('plugin', fs);
    const v = verifyEnvelope(env);
    expect(v.ok).toBe(true);
    expect(v.sha256Ok).toBe(true);
    expect(v.scanIssues).toEqual([]);
  });

  it('detects sha256 tampering', async () => {
    const fs = new MemFs();
    fs.add('plugin/manifest.json', VALID_MANIFEST);
    fs.add('plugin/main.js', 'export const x = 1;\n');
    const env = await packagePlugin('plugin', fs);
    env.files['extra.txt'] = Buffer.from('inserted', 'utf8').toString('base64');
    const v = verifyEnvelope(env);
    expect(v.ok).toBe(false);
    expect(v.sha256Ok).toBe(false);
    expect(v.reason).toBe('sha256-mismatch');
  });

  it('detects forbidden patterns', async () => {
    const fs = new MemFs();
    fs.add('plugin/manifest.json', VALID_MANIFEST);
    fs.add('plugin/main.js', 'eval("danger")\n');
    const env = await packagePlugin('plugin', fs);
    const v = verifyEnvelope(env);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('forbidden-pattern');
    expect(v.scanIssues[0].file).toBe('main.js');
    expect(v.scanIssues[0].line).toBe(1);
  });

  it('rejects unrecognized format', () => {
    const v = verifyEnvelope({ format: 'other' } as unknown as DexPlugEnvelope);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('invalid-format');
  });
});

describe('PluginPublisher.scanFiles', () => {
  it('flags new Function and child_process', () => {
    const files = {
      'a.js': Buffer.from('var f = new Function("x", "return x");', 'utf8').toString('base64'),
      'b.ts': Buffer.from('require("child_process")', 'utf8').toString('base64'),
    };
    const issues = scanFiles(files);
    expect(issues.map(i => i.reason)).toEqual(expect.arrayContaining([
      'new Function() is forbidden',
      'child_process require is not allowed',
    ]));
  });

  it('skips non-text files', () => {
    const files = { 'asset.png': Buffer.from('eval("x")').toString('base64') };
    expect(scanFiles(files)).toEqual([]);
  });
});

describe('PluginPublisher.extractEnvelope', () => {
  it('extracts files into the destination, refuses bad envelopes', async () => {
    const srcFs = new MemFs();
    srcFs.add('plugin/manifest.json', VALID_MANIFEST);
    srcFs.add('plugin/main.js', 'export const x = 1;\n');
    const env = await packagePlugin('plugin', srcFs);

    const destFs = new MemFs();
    const written = await extractEnvelope(env, '/dest', destFs);
    expect(written.sort()).toEqual(['/dest/main.js', '/dest/manifest.json']);
    expect(await destFs.exists('/dest/main.js')).toBe(true);

    const tampered = { ...env, files: { ...env.files, 'evil.js': Buffer.from('eval("x")').toString('base64') } };
    await expect(extractEnvelope(tampered, '/dest2', new MemFs())).rejects.toThrow();
  });

  it('refuses path traversal entries (rejected via sha mismatch / verify)', async () => {
    const srcFs = new MemFs();
    srcFs.add('plugin/manifest.json', VALID_MANIFEST);
    const env = await packagePlugin('plugin', srcFs);
    // Inserting a traversal entry invalidates sha256, so verifyEnvelope -> ok=false
    env.files['../escape.txt'] = Buffer.from('nope').toString('base64');
    await expect(extractEnvelope(env, '/dest', new MemFs())).rejects.toThrow();
  });
});

describe('PluginPublisher round-trip', () => {
  it('serializes and parses', async () => {
    const fs = new MemFs();
    fs.add('plugin/manifest.json', VALID_MANIFEST);
    fs.add('plugin/main.js', 'export const x = 1;\n');
    const env = await packagePlugin('plugin', fs);
    const text = envelopeToString(env);
    const parsed = parseEnvelope(text);
    expect(parsed.published.sha256).toBe(env.published.sha256);
  });

  it('parseEnvelope rejects unknown format', () => {
    expect(() => parseEnvelope(JSON.stringify({ format: 'other' }))).toThrow();
  });
});
