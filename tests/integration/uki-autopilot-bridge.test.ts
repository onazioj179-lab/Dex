// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================

// DEX v3.8.1 - End-to-end style test for UKI AutoPilot bridge

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ActionBus from '../../src/renderer/services/ActionBus';
import { registerUkiActionHandlers } from '../../src/renderer/services/UkiActionHandlers';
import { runUkiSlashIfApplicable } from '../../src/renderer/components/UkiAutoPilotBridge';

describe('UKI AutoPilot bridge (overlay-level fallthrough)', () => {
  let off: () => void;
  beforeEach(() => { ActionBus._reset(); off = registerUkiActionHandlers(); });
  afterEach(() => { off(); });

  it('returns handled=false for non-slash text so the overlay can fall through', async () => {
    const r = await runUkiSlashIfApplicable('what time is it');
    expect(r.handled).toBe(false);
  });

  it('returns handled=false for unknown slash so the overlay can fall through', async () => {
    const r = await runUkiSlashIfApplicable('/no-such-command');
    expect(r.handled).toBe(false);
  });

  it('handles /summarize end-to-end and emits a result event', async () => {
    const events: Array<{ planId: string; reply: string; utterance?: string }> = [];
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      events.push(detail);
    };
    window.addEventListener('uki:autopilot-result', handler as EventListener);

    const ack = await runUkiSlashIfApplicable('/summarize One. Two. Three.');
    expect(ack.handled).toBe(true);
    expect(ack.reply).toMatch(/Running/);

    // Wait one microtask cycle for the in-flight plan to resolve
    await new Promise((r) => setTimeout(r, 10));
    window.removeEventListener('uki:autopilot-result', handler as EventListener);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].utterance).toBe('/summarize One. Two. Three.');
    expect(events[0].reply).toMatch(/One/);
  });

  it('handles /count end-to-end and reports stats', async () => {
    const events: Array<{ reply: string }> = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('uki:autopilot-result', handler as EventListener);

    const ack = await runUkiSlashIfApplicable('/count alpha beta gamma');
    expect(ack.handled).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    window.removeEventListener('uki:autopilot-result', handler as EventListener);

    expect(events.length).toBe(1);
    expect(events[0].reply).toMatch(/3 words/);
  });
});
