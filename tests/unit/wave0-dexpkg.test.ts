// =============================================================================
// DEX Platform — Wave 0 tests
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  createPackage, openPackage, addAsset, removeAsset, saveProject, assetPath,
} from '../../src/shared/dexpkg/package';
import { isManifest, makeEmptyManifest, DEXPKG_MAGIC } from '../../src/shared/dexpkg/manifest';

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dexpkg-test-'));
}

describe('dexpkg manifest', () => {
  it('makeEmptyManifest produces valid manifest', () => {
    const m = makeEmptyManifest({ app: 'imosion', name: 'test', writerVersion: '4.1.2' });
    expect(m.magic).toBe(DEXPKG_MAGIC);
    expect(m.formatVersion).toBe(1);
    expect(m.app).toBe('imosion');
    expect(isManifest(m)).toBe(true);
  });

  it('isManifest rejects garbage', () => {
    expect(isManifest(null)).toBe(false);
    expect(isManifest({})).toBe(false);
    expect(isManifest({ magic: 'WRONG' })).toBe(false);
  });
});

describe('dexpkg create/open', () => {
  let dir: string;
  beforeEach(async () => { dir = await tmpDir(); });

  it('creates a package and opens it back', async () => {
    const pkg = await createPackage({
      dir, app: 'vinx', name: 'My Edit', writerVersion: '4.1.2',
      projectJson: { tracks: [], fps: 24 },
    });
    expect(pkg.manifest.app).toBe('vinx');
    expect(pkg.manifest.name).toBe('My Edit');

    const reopened = await openPackage(dir);
    expect(reopened.manifest.app).toBe('vinx');
    const proj = await reopened.readProject<{ fps: number }>();
    expect(proj.fps).toBe(24);
  });

  it('saveProject updates project.json and manifest checksum', async () => {
    await createPackage({ dir, app: 'prism', name: 'p', writerVersion: '4.1.2' });
    await saveProject(dir, { layers: [{ id: 1 }] });
    const reopened = await openPackage(dir);
    const proj = await reopened.readProject<{ layers: { id: number }[] }>();
    expect(proj.layers[0]?.id).toBe(1);
    expect(reopened.manifest.projectSha256).toBeTruthy();
  });
});

describe('dexpkg assets', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await tmpDir();
    await createPackage({ dir, app: 'flux', name: 'a', writerVersion: '4.1.2' });
  });

  it('addAsset stores by content hash and dedupes', async () => {
    const buf1 = Buffer.from('hello world');
    const e1 = await addAsset({ dir, src: buf1, name: 'note.txt', mime: 'text/plain' });
    const e2 = await addAsset({ dir, src: buf1, name: 'note-dup.txt', mime: 'text/plain' });
    expect(e1.sha256).toBe(e2.sha256);
    const m = (await openPackage(dir)).manifest;
    expect(m.assets.length).toBe(1); // dedupe
    const found = await assetPath(dir, e1.sha256);
    expect(found).toBeTruthy();
  });

  it('removeAsset removes manifest entry and file', async () => {
    const e = await addAsset({ dir, src: Buffer.from('x'), name: 'x.bin', mime: 'application/octet-stream' });
    expect(await removeAsset(dir, e.sha256)).toBe(true);
    const m = (await openPackage(dir)).manifest;
    expect(m.assets.length).toBe(0);
    expect(await assetPath(dir, e.sha256)).toBeNull();
  });
});
