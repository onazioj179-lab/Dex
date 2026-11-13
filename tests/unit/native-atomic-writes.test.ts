// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Native stores must not write in place: a crash or full disk mid-write left a
// truncated JSON file (dex-kv.json holds every app's settings). Use
// crate::write_atomic (temp file + fsync + rename) instead of std::fs::write.
describe('native file writes are atomic', () => {
  it('no std::fs::write in src-tauri/src', () => {
    const dir = join(__dirname, '..', '..', 'src-tauri', 'src');
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter(n => n.endsWith('.rs'))) {
      readFileSync(join(dir, f), 'utf8').split('\n').forEach((l, i) => {
        if (/\bstd::fs::write\(|(?<![\w:])fs::write\(/.test(l) && !l.trim().startsWith('//')) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
