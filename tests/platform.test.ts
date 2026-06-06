// =============================================================================
// DEX Platform — manifest spec unit tests (pure, no I/O)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// The registry + host-services modules touch the real filesystem, which this
// project's vite/react test pipeline browser-stubs; they are verified end-to-end
// in the node-real harness `scripts/verify-platform.ts` (run: npx tsx
// scripts/verify-platform.ts). This suite covers the pure, I/O-free manifest spec
// that the whole platform validates against.

import { describe, it, expect } from 'vitest';
import { validateManifest, KNOWN_CAPABILITIES } from '../src/main/platform/manifest';

const MAGNIFY = {
  id: 'dex.app.magnify',
  name: 'Magnify',
  version: '1.0.0',
  publisher: 'OJ',
  entry: 'ui/dist/index.html',
  icon: 'src-tauri/icons/icon.png',
  capabilities: ['fs.read', 'fs.write', 'system.scan'],
};

describe('app manifest validation', () => {
  it('accepts the Magnify manifest and returns a typed manifest', () => {
    const v = validateManifest(MAGNIFY);
    expect(v.ok).toBe(true);
    expect(v.manifest?.id).toBe('dex.app.magnify');
    expect(v.manifest?.capabilities).toEqual(['fs.read', 'fs.write', 'system.scan']);
  });

  it('rejects malformed ids (not namespaced / path separators / uppercase)', () => {
    expect(validateManifest({ ...MAGNIFY, id: 'Magnify' }).ok).toBe(false);
    expect(validateManifest({ ...MAGNIFY, id: 'magnify' }).ok).toBe(false);       // not namespaced
    expect(validateManifest({ ...MAGNIFY, id: 'dex/app/magnify' }).ok).toBe(false);
    expect(validateManifest({ ...MAGNIFY, id: 'dex.app..magnify' }).ok).toBe(false);
  });

  it('rejects empty fields, unknown capabilities and non-relative entry/icon', () => {
    expect(validateManifest({ ...MAGNIFY, name: '' }).ok).toBe(false);
    expect(validateManifest({ ...MAGNIFY, version: '   ' }).ok).toBe(false);
    expect(validateManifest({ ...MAGNIFY, capabilities: ['fs.read', 'net.everything'] }).ok).toBe(false);
    expect(validateManifest({ ...MAGNIFY, capabilities: 'fs.read' }).ok).toBe(false);
    expect(validateManifest({ ...MAGNIFY, entry: '../../etc/passwd' }).ok).toBe(false);
    expect(validateManifest({ ...MAGNIFY, entry: '/abs/path' }).ok).toBe(false);
    expect(validateManifest({ ...MAGNIFY, icon: 'C:/Windows/system32' }).ok).toBe(false);
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest('nope').ok).toBe(false);
  });

  it('only allows the known capability set', () => {
    for (const cap of KNOWN_CAPABILITIES) {
      expect(validateManifest({ ...MAGNIFY, capabilities: [cap] }).ok).toBe(true);
    }
  });
});
