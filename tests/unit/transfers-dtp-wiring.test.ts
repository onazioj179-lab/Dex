// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX-to-DEX transfers: Send Files used to hit a native `not_ported` arm and the
// page listened through dex.dtp.onX() helpers that are no-ops under Tauri, so
// nothing ever happened. The engine is native now (core/dex-dtp + dtp_transfer.rs);
// these guards keep the page on the real event channels and the native side real.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const page = readFileSync(resolve(root, 'src/renderer/pages/Transfers.tsx'), 'utf8');
const ctl = readFileSync(resolve(root, 'src-tauri/src/dtp_ctl.rs'), 'utf8');
const engine = readFileSync(resolve(root, 'src-tauri/src/dtp_transfer.rs'), 'utf8');

const EVENTS = [
  'dtp:device-found', 'dtp:device-lost', 'dtp:device-pending', 'dtp:device-pending-cleared',
  'dtp:send-progress', 'dtp:send-complete', 'dtp:send-error',
  'dtp:transfer-progress', 'dtp:transfer-complete', 'dtp:transfer-error',
];

describe('Transfers DEX-to-DEX wiring', () => {
  it('subscribes through dex.on, not the no-op dex.dtp.onX helpers', () => {
    expect(page).not.toMatch(/dtp\??\.\s*on[A-Z]\w*\??\.?\(/);
    for (const ev of EVENTS) expect(page).toContain(`'${ev}'`);
  });

  it('every event the page listens to is emitted natively', () => {
    const native = ctl + engine;
    for (const ev of EVENTS) expect(native).toContain(`"${ev}"`);
  });

  it('send, receive, approve and cancel are routed to the engine', () => {
    expect(ctl).not.toMatch(/not_ported/);
    for (const fn of ['start_server', 'stop_server', 'send_files', 'approve', 'deny', 'cancel']) {
      expect(ctl).toContain(`crate::dtp_transfer::${fn}(`);
    }
  });

  it('no fake controls: no pause, reorder or silent retry', () => {
    expect(page).not.toMatch(/pauseSend|resumeSend|bumpPriority|moveTransfer|Protected transfer/);
    expect(ctl).not.toMatch(/fn retry_transfer[\s\S]{0,200}"success": true/);
  });

  it('checks the send result instead of assuming success', () => {
    expect(page).toMatch(/res\.success !== true/);
  });
});
