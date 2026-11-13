// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Tauri's own file-drop handler swallows HTML5 drag and drop on Windows: in a
// release build dragstart fired but dragover/drop never did (2026-11-12, real
// mouse drag). DEX only uses HTML5 drops, so every webview must turn it off.
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('HTML5 drag and drop stays enabled in every DEX webview', () => {
  it('main window config disables the Tauri drop handler', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    for (const w of conf.app.windows) expect(w.dragDropEnabled).toBe(false);
  });

  it('detached app windows and Browser views disable it too', () => {
    expect(read('src-tauri/src/multi_window.rs')).toContain('.disable_drag_drop_handler()');
    expect(read('src-tauri/src/browser_view.rs')).toContain('.disable_drag_drop_handler()');
  });

  it('devtools: only Browser page views can open them in a release build', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    for (const w of conf.app.windows) expect(w.devtools).toBe(false);
    expect(read('src-tauri/src/multi_window.rs')).toContain('.devtools(cfg!(debug_assertions))');
    expect(read('src-tauri/src/browser_view.rs')).toContain('.devtools(true)');
  });

  it('nothing listens for Tauri drop events (they no longer fire)', () => {
    const shell = read('src/renderer/App.tsx');
    expect(shell).not.toMatch(/onDragDropEvent|tauri:\/\/drag-drop/);
  });
});
