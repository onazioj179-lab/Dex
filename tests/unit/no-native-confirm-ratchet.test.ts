// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment node
 */
// DEX asks in its own dialog (ConfirmDialog / useConfirm / dexConfirm), not the
// WebView's plain system box. Allowed: the fallbacks inside the dialog helpers
// themselves and the crash-recovery screen in main.tsx (no shell exists yet).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ALLOWED = new Set(['components/ConfirmDialog.tsx', 'components/dexConfirm.tsx', 'uki/approvals.ts', 'main.tsx']);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(e.name) ? [p] : [];
  });
}

describe('no native confirm()', () => {
  it('only the dialog helpers and crash recovery use the system confirm/prompt/alert boxes', () => {
    const root = path.resolve(__dirname, '../../src/renderer');
    const offenders = walk(root)
      .map((f) => path.relative(root, f).split(path.sep).join('/'))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => /(window\.(confirm|prompt|alert)\(|(^|[^.\w])(confirm|prompt|alert)\(\s*[`'"])/m.test(fs.readFileSync(path.join(root, rel), 'utf8')));
    expect(offenders).toEqual([]);
  }, 60_000);
});
