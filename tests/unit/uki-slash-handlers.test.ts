// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.0 - UkiActionHandlers + Slash plan tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ActionBus from '../../src/renderer/services/ActionBus';
import { registerUkiActionHandlers } from '../../src/renderer/services/UkiActionHandlers';
import { parseSlashToPlan, SLASH_COMMANDS } from '../../src/renderer/services/UkiSlashCommands';

describe('UKI slash → plan', () => {
  let off: () => void;
  beforeEach(() => { ActionBus._reset(); off = registerUkiActionHandlers(); });
  afterEach(() => { off(); });

  it('returns null for non-slash input', () => {
    expect(parseSlashToPlan('hello there')).toBeNull();
  });

  it('returns null for unknown command', () => {
    expect(parseSlashToPlan('/no-such-thing')).toBeNull();
  });

  it('parses /summarize and runs it', async () => {
    const plan = parseSlashToPlan('/summarize Hello world. Second sentence here.');
    expect(plan).not.toBeNull();
    expect(plan!.steps[0].action).toBe('text.summarize');
    const results = await ActionBus.execute(plan!);
    expect(results[0].status).toBe('done');
    const out = results[0].output as { summary: string; wordCount: number };
    expect(out.summary).toContain('Hello world');
    expect(out.wordCount).toBe(5);
  });

  it('parses /translate with target lang', async () => {
    const plan = parseSlashToPlan('/translate fr Hello world');
    expect(plan!.steps[0].payload).toMatchObject({ to: 'fr', text: 'Hello world' });
    const results = await ActionBus.execute(plan!);
    expect((results[0].output as { targetLang: string }).targetLang).toBe('fr');
  });

  it('parses /timer with units', () => {
    expect(parseSlashToPlan('/timer 500ms')!.steps[0].payload).toMatchObject({ ms: 500 });
    expect(parseSlashToPlan('/timer 2s tea')!.steps[0].payload).toMatchObject({ ms: 2000, label: 'tea' });
    expect(parseSlashToPlan('/timer 5m yoga')!.steps[0].payload).toMatchObject({ ms: 300_000, label: 'yoga' });
    expect(parseSlashToPlan('/timer bogus')).toBeNull();
  });

  it('parses /diff into two steps', () => {
    const plan = parseSlashToPlan('/diff first text | second text');
    expect(plan!.steps).toHaveLength(2);
    expect(plan!.steps[0].action).toBe('text.summarize');
    expect(plan!.steps[1].label).toBe('Side B');
  });

  it('rejects /open-link with non-http url at execution', async () => {
    const plan = parseSlashToPlan('/open-link file:///etc/passwd')!;
    const results = await ActionBus.execute(plan);
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toMatch(/http/);
  });

  it('runs /count', async () => {
    const plan = parseSlashToPlan('/count one two three')!;
    const results = await ActionBus.execute(plan);
    expect((results[0].output as { words: number }).words).toBe(3);
  });

  it('exports the SLASH_COMMANDS list', () => {
    expect(SLASH_COMMANDS).toContain('/summarize');
    expect(SLASH_COMMANDS).toContain('/timer');
    expect(SLASH_COMMANDS.length).toBeGreaterThanOrEqual(14);
  });
});

describe('UkiActionHandlers', () => {
  let off: () => void;
  beforeEach(() => { ActionBus._reset(); off = registerUkiActionHandlers(); });
  afterEach(() => { off(); });

  it('registers expected actions', () => {
    const actions = ActionBus.listActions();
    for (const a of [
      'clipboard.copy', 'clipboard.read', 'notification.show',
      'timer.start', 'timer.stop', 'ui.openLink',
      'text.summarize', 'text.wordCount', 'text.translate',
      'shell.toast', 'focus.toggle', 'media.muteToggle',
      'screenshot.capture', 'workspace.snapshot', 'ambient.dismiss',
    ]) {
      expect(ActionBus.isRegistered(a), `missing ${a}`).toBe(true);
      expect(actions, `not in list: ${a}`).toContain(a);
    }
  });

  it('timer.start returns id and timer.stop cancels it', async () => {
    const startPlan = parseSlashToPlan('/timer 1h')!;
    const startResults = await ActionBus.execute(startPlan);
    const id = (startResults[0].output as { id: string }).id;
    expect(id).toBeTruthy();
    const off2 = ActionBus.register('demo.stop', (p) => p);
    const stopRes = await ActionBus.execute({
      id: 'pstop', utterance: 'stop', createdAt: Date.now(), risk: 'safe',
      steps: [{ id: 'x', action: 'timer.stop', label: 'stop', risk: 'safe', payload: { id } }],
    });
    expect((stopRes[0].output as { stopped: boolean }).stopped).toBe(true);
    off2();
  });
});
