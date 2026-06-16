// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform - test
// =============================================================================
// Tests for UKI trust UI (wave B): ConfidenceChip, CitationsPanel,
// PiiGuardDialog, MemoryInspector, SkillPicker, StreamingResponse.
// jsdom + @testing-library/react. Deterministic.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { ConfidenceChip } from '../../src/renderer/components/uki/ConfidenceChip';
import { CitationsPanel } from '../../src/renderer/components/uki/CitationsPanel';
import { PiiGuardDialog } from '../../src/renderer/components/uki/PiiGuardDialog';
import { MemoryInspector } from '../../src/renderer/components/uki/MemoryInspector';
import { SkillPicker } from '../../src/renderer/components/uki/SkillPicker';
import { StreamingResponse } from '../../src/renderer/components/uki/StreamingResponse';

import { createMemoryStore, addMemory } from '../../src/shared/uki/memory';
import { createSkillRegistry, registerSkill, type Skill } from '../../src/shared/uki/skills';
import { createStreamFromArray, type StreamChunk } from '../../src/shared/uki/streaming';

afterEach(() => cleanup());

// ----- ConfidenceChip ----------------------------------------------------

describe('ConfidenceChip', () => {
  it('renders high level for score 0.9', () => {
    render(<ConfidenceChip score={0.9} />);
    const chip = screen.getByTestId('confidence-chip');
    expect(chip.getAttribute('data-level')).toBe('high');
    expect(chip.textContent).toMatch(/90%/);
  });
  it('renders medium for 0.6', () => {
    render(<ConfidenceChip score={0.6} />);
    expect(screen.getByTestId('confidence-chip').getAttribute('data-level')).toBe('medium');
  });
  it('renders low for 0.2', () => {
    render(<ConfidenceChip score={0.2} />);
    expect(screen.getByTestId('confidence-chip').getAttribute('data-level')).toBe('low');
  });
  it('clamps invalid score', () => {
    render(<ConfidenceChip score={Number.NaN} />);
    const chip = screen.getByTestId('confidence-chip');
    expect(chip.textContent).toMatch(/0%/);
  });
  it('honours custom label', () => {
    render(<ConfidenceChip score={0.9} label="Verified" />);
    expect(screen.getByTestId('confidence-chip').textContent).toMatch(/Verified/);
  });
  it('compact mode hides text', () => {
    render(<ConfidenceChip score={0.9} compact />);
    const chip = screen.getByTestId('confidence-chip');
    expect(chip.textContent).not.toMatch(/High confidence/);
  });
});

// ----- CitationsPanel ----------------------------------------------------

describe('CitationsPanel', () => {
  it('renders nothing when no citations', () => {
    const { container } = render(<CitationsPanel body="hello" citations={[]} />);
    expect(container.querySelector('[data-testid="citations-panel"]')).toBeNull();
  });
  it('marks used citations active and unused dim', () => {
    render(<CitationsPanel body="See [1] and also [3]." citations={[
      { index: 1, title: 'Source A', url: 'https://a' },
      { index: 2, title: 'Source B', url: 'https://b' },
      { index: 3, title: 'Source C' },
    ]} />);
    expect(screen.getByTestId('citation-1').getAttribute('data-used')).toBe('true');
    expect(screen.getByTestId('citation-2').getAttribute('data-used')).toBe('false');
    expect(screen.getByTestId('citation-3').getAttribute('data-used')).toBe('true');
  });
  it('renders sources sorted by index', () => {
    render(<CitationsPanel body="[2]" citations={[
      { index: 3, title: 'C' }, { index: 1, title: 'A' }, { index: 2, title: 'B' },
    ]} />);
    const items = screen.getAllByTestId(/^citation-/);
    expect(items.map((n) => n.getAttribute('data-testid'))).toEqual([
      'citation-1', 'citation-2', 'citation-3',
    ]);
  });
  it('invokes onOpen when source has url', () => {
    const onOpen = vi.fn();
    render(<CitationsPanel
      body="[1]"
      citations={[{ index: 1, title: 'A', url: 'https://a' }]}
      onOpen={onOpen}
    />);
    fireEvent.click(screen.getByText('A — https://a'));
    expect(onOpen).toHaveBeenCalledWith({ index: 1, title: 'A', url: 'https://a' });
  });
  it('hides heading when bare', () => {
    render(<CitationsPanel body="[1]" citations={[{ index: 1, title: 'A' }]} bare />);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

// ----- PiiGuardDialog ----------------------------------------------------

describe('PiiGuardDialog', () => {
  const baseProps = {
    raw: 'send to user@example.com', redacted: 'send to [REDACTED]',
    findings: [{ type: 'email', match: 'user@example.com' }],
    onSendRedacted: vi.fn(), onSendRaw: vi.fn(), onCancel: vi.fn(),
  };
  it('renders nothing when closed', () => {
    const { container } = render(<PiiGuardDialog open={false} {...baseProps} />);
    expect(container.querySelector('[data-testid="pii-guard-dialog"]')).toBeNull();
  });
  it('shows findings list', () => {
    render(<PiiGuardDialog open {...baseProps} />);
    expect(screen.getByTestId('pii-finding-0').textContent).toMatch(/email/);
    expect(screen.getByTestId('pii-finding-0').textContent).toMatch(/user@example\.com/);
  });
  it('Send redacted invokes the right callback', () => {
    const props = { ...baseProps, onSendRedacted: vi.fn() };
    render(<PiiGuardDialog open {...props} />);
    fireEvent.click(screen.getByTestId('pii-send-redacted'));
    expect(props.onSendRedacted).toHaveBeenCalledTimes(1);
  });
  it('Send original invokes the right callback', () => {
    const props = { ...baseProps, onSendRaw: vi.fn() };
    render(<PiiGuardDialog open {...props} />);
    fireEvent.click(screen.getByTestId('pii-send-raw'));
    expect(props.onSendRaw).toHaveBeenCalledTimes(1);
  });
  it('Cancel invokes onCancel', () => {
    const props = { ...baseProps, onCancel: vi.fn() };
    render(<PiiGuardDialog open {...props} />);
    fireEvent.click(screen.getByTestId('pii-cancel'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
  it('clicking backdrop cancels', () => {
    const props = { ...baseProps, onCancel: vi.fn() };
    render(<PiiGuardDialog open {...props} />);
    // Backdrop-to-cancel now routes through the canonical ui/Modal surface,
    // whose backdrop carries the `${testIdPrefix}-backdrop` hook. A true
    // backdrop click (target === currentTarget) maps to onClose -> onCancel.
    fireEvent.click(screen.getByTestId('pii-guard-backdrop'));
    expect(props.onCancel).toHaveBeenCalled();
  });
});

// ----- MemoryInspector ---------------------------------------------------

describe('MemoryInspector', () => {
  function setup() {
    const store = createMemoryStore();
    addMemory(store, { id: 'a', content: 'apple pie recipe', kind: 'long', importance: 0.9, now: 1000 });
    addMemory(store, { id: 'b', content: 'banana smoothie', kind: 'short', importance: 0.5, now: 2000 });
    addMemory(store, { id: 'c', content: 'cucumber salad', kind: 'working', importance: 0.6, now: 3000 });
    return store;
  }
  it('lists all items by default', () => {
    render(<MemoryInspector store={setup()} />);
    expect(screen.getByTestId('memory-item-a')).toBeTruthy();
    expect(screen.getByTestId('memory-item-b')).toBeTruthy();
    expect(screen.getByTestId('memory-item-c')).toBeTruthy();
  });
  it('filters by kind', () => {
    render(<MemoryInspector store={setup()} />);
    fireEvent.click(screen.getByTestId('memory-tab-long'));
    expect(screen.getByTestId('memory-item-a')).toBeTruthy();
    expect(screen.queryByTestId('memory-item-b')).toBeNull();
  });
  it('searches by substring', () => {
    render(<MemoryInspector store={setup()} now={5000} />);
    fireEvent.change(screen.getByTestId('memory-search'), { target: { value: 'apple' } });
    expect(screen.getByTestId('memory-item-a')).toBeTruthy();
    expect(screen.queryByTestId('memory-item-b')).toBeNull();
  });
  it('shows empty state when nothing matches', () => {
    render(<MemoryInspector store={setup()} />);
    fireEvent.change(screen.getByTestId('memory-search'), { target: { value: 'zzz-not-found' } });
    expect(screen.getByTestId('memory-empty')).toBeTruthy();
  });
  it('forget calls back with the id', () => {
    const onForget = vi.fn();
    render(<MemoryInspector store={setup()} onForget={onForget} />);
    fireEvent.click(screen.getByTestId('memory-forget-a'));
    expect(onForget).toHaveBeenCalledWith('a');
  });
  it('export emits JSON of all items', () => {
    const onExport = vi.fn();
    render(<MemoryInspector store={setup()} onExport={onExport} />);
    fireEvent.click(screen.getByTestId('memory-export'));
    expect(onExport).toHaveBeenCalledTimes(1);
    const json = onExport.mock.calls[0][0] as string;
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
  });
});

// ----- SkillPicker -------------------------------------------------------

describe('SkillPicker', () => {
  function reg() {
    let r = createSkillRegistry();
    const skills: Skill[] = [
      { id: 'sum', label: 'Summarize', intent: 'summarize',
        plan: { steps: [{ actionId: 'a', params: {} }] } },
      { id: 'fix', label: 'Fix error', intent: 'fix error',
        requiredContext: ['errorText'],
        plan: { steps: [{ actionId: 'b', params: {} }] } },
      { id: 'rew', label: 'Rewrite tone', intent: 'rewrite',
        plan: { steps: [{ actionId: 'c', params: {} }] } },
    ];
    for (const s of skills) r = registerSkill(r, s);
    return r;
  }
  it('shows hint when no input', () => {
    render(<SkillPicker registry={reg()} onPick={() => undefined} />);
    expect(screen.getByTestId('skill-empty').textContent).toMatch(/Type to search/);
  });
  it('lists ranked matches as user types', () => {
    render(<SkillPicker registry={reg()} onPick={() => undefined} />);
    fireEvent.change(screen.getByTestId('skill-intent'), { target: { value: 'summarize' } });
    expect(screen.getByTestId('skill-option-sum')).toBeTruthy();
  });
  it('marks blocked skills disabled when context missing', () => {
    render(<SkillPicker registry={reg()} onPick={() => undefined} />);
    fireEvent.change(screen.getByTestId('skill-intent'), { target: { value: 'fix error' } });
    const opt = screen.getByTestId('skill-option-fix') as HTMLButtonElement;
    expect(opt.disabled).toBe(true);
    expect(screen.getByTestId('skill-missing-fix').textContent).toMatch(/errorText/);
  });
  it('unblocks when facts supplied', () => {
    render(<SkillPicker registry={reg()} facts={{ errorText: 'NPE' }} onPick={() => undefined} />);
    fireEvent.change(screen.getByTestId('skill-intent'), { target: { value: 'fix error' } });
    const opt = screen.getByTestId('skill-option-fix') as HTMLButtonElement;
    expect(opt.disabled).toBe(false);
  });
  it('Enter picks the active skill', () => {
    const onPick = vi.fn();
    render(<SkillPicker registry={reg()} onPick={onPick} />);
    const input = screen.getByTestId('skill-intent');
    fireEvent.change(input, { target: { value: 'summarize' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('sum');
  });
  it('ArrowDown moves active and Enter picks', () => {
    const onPick = vi.fn();
    let r = createSkillRegistry();
    r = registerSkill(r, { id: 'a', label: 'A', intent: 'do',
      plan: { steps: [{ actionId: 'x', params: {} }] } });
    r = registerSkill(r, { id: 'b', label: 'B', intent: 'do',
      plan: { steps: [{ actionId: 'y', params: {} }] } });
    render(<SkillPicker registry={r} onPick={onPick} />);
    const input = screen.getByTestId('skill-intent');
    fireEvent.change(input, { target: { value: 'do' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('b');
  });
  it('Enter on blocked skill does not pick', () => {
    const onPick = vi.fn();
    render(<SkillPicker registry={reg()} onPick={onPick} />);
    const input = screen.getByTestId('skill-intent');
    fireEvent.change(input, { target: { value: 'fix error' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });
  it('allowMissingContext allows blocked picks', () => {
    const onPick = vi.fn();
    render(<SkillPicker registry={reg()} onPick={onPick} allowMissingContext />);
    const input = screen.getByTestId('skill-intent');
    fireEvent.change(input, { target: { value: 'fix error' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('fix');
  });
});

// ----- StreamingResponse -------------------------------------------------

describe('StreamingResponse', () => {
  it('accumulates token chunks then calls onDone', async () => {
    const onDone = vi.fn();
    const reader = createStreamFromArray([
      { type: 'token', content: 'Hel' },
      { type: 'token', content: 'lo' },
      { type: 'done' },
    ]);
    render(<StreamingResponse reader={reader} onDone={onDone} />);
    await waitFor(() => {
      expect(screen.getByTestId('streaming-text').textContent).toBe('Hello');
    });
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Hello'));
    expect(screen.getByTestId('streaming-response').getAttribute('data-status')).toBe('done');
  });
  it('shows error and calls onError', async () => {
    const onError = vi.fn();
    const reader = createStreamFromArray([
      { type: 'token', content: 'x' },
      { type: 'error', error: 'boom' },
    ]);
    render(<StreamingResponse reader={reader} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('boom'));
    expect(screen.getByTestId('streaming-error').textContent).toMatch(/boom/);
    expect(screen.getByTestId('streaming-response').getAttribute('data-status')).toBe('error');
  });
  it('forwards tool-call chunks', async () => {
    const onToolCall = vi.fn();
    const onDone = vi.fn();
    const chunks: StreamChunk[] = [
      { type: 'token', content: 'go' },
      { type: 'toolCall', toolCallJson: '{"name":"x"}' },
      { type: 'done' },
    ];
    render(<StreamingResponse reader={createStreamFromArray(chunks)} onToolCall={onToolCall} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onToolCall).toHaveBeenCalledWith('{"name":"x"}');
  });
  it('completes without explicit done chunk', async () => {
    const onDone = vi.fn();
    render(<StreamingResponse
      reader={createStreamFromArray([{ type: 'token', content: 'ok' }])}
      onDone={onDone}
    />);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('ok'));
  });
});
