/**
 * @vitest-environment node
 */
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// The release gate in scripts/verify-tauri-bundle.js reads PE import tables to
// prove the shipped exe does not depend on WebView2Loader.dll (the v6.0.x
// "WebView2 not found" startup failure). These tests pin the parser itself.
//
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { peImports } = require('../../scripts/verify-tauri-bundle.js');

describe('verify-tauri-bundle peImports', () => {
  it.skipIf(process.platform !== 'win32')('reads the import table of a real Windows exe', () => {
    const names: string[] = peImports(process.execPath).map((n: string) => n.toLowerCase());
    expect(names).toContain('kernel32.dll');
    expect(names).not.toContain('webview2loader.dll');
  });

  it('rejects files that are not PE images', () => {
    const tmp = path.join(os.tmpdir(), `not-a-pe-${process.pid}.bin`);
    fs.writeFileSync(tmp, Buffer.from('definitely not an executable'));
    try {
      expect(() => peImports(tmp)).toThrow(/not a PE file/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
