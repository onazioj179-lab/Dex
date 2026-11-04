// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('consoleBridge (Track D)', () => {
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;

  beforeEach(() => {
    vi.resetModules();
    originalWarn = console.warn;
    originalError = console.error;
  });

  afterEach(() => {
    console.warn = originalWarn;
    console.error = originalError;
    (globalThis as any).dex = undefined;
  });

  it('is a no-op when dex.diagnostics.log is unavailable', async () => {
    (globalThis as any).dex = undefined;
    const before = console.error;
    const { installConsoleBridge } = await import('../../src/renderer/utils/consoleBridge');
    installConsoleBridge();
    expect(console.error).toBe(before);
  });

  it('forwards console.warn to diagnostics.log with level "warn"', async () => {
    const log = vi.fn(async () => undefined);
    (globalThis as any).dex = { diagnostics: { log } };
    const { installConsoleBridge } = await import('../../src/renderer/utils/consoleBridge');
    installConsoleBridge();
    console.warn('hello', { code: 42 });
    await Promise.resolve();
    expect(log).toHaveBeenCalledWith('warn', 'renderer', expect.stringContaining('hello'));
  });

  it('forwards console.error and serializes Error stacks', async () => {
    const log = vi.fn(async () => undefined);
    (globalThis as any).dex = { diagnostics: { log } };
    const { installConsoleBridge } = await import('../../src/renderer/utils/consoleBridge');
    installConsoleBridge();
    console.error(new Error('boom'));
    await Promise.resolve();
    expect(log).toHaveBeenCalledWith('error', 'renderer', expect.stringContaining('boom'));
  });

  it('does not recurse if diagnostics.log itself throws', async () => {
    const log = vi.fn(async () => { throw new Error('ipc-fail'); });
    (globalThis as any).dex = { diagnostics: { log } };
    const { installConsoleBridge } = await import('../../src/renderer/utils/consoleBridge');
    installConsoleBridge();
    expect(() => console.warn('x')).not.toThrow();
  });

  it('install is idempotent', async () => {
    const log = vi.fn(async () => undefined);
    (globalThis as any).dex = { diagnostics: { log } };
    const { installConsoleBridge } = await import('../../src/renderer/utils/consoleBridge');
    installConsoleBridge();
    const wrappedOnce = console.warn;
    installConsoleBridge();
    expect(console.warn).toBe(wrappedOnce);
  });
});
