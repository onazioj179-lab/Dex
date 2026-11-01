// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AiProviderSettings from '../../src/renderer/components/AiProviderSettings';
import { getProcessingMode, getManualModel, getReasoningPreference } from '../../src/renderer/uki/providers/modelPrefs';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('Settings > AI Providers: processing + reasoning controls', () => {
  it('defaults to Hybrid / Automatic and persists changes', () => {
    render(<AiProviderSettings />);
    const mode = screen.getByLabelText('Processing') as HTMLSelectElement;
    const effort = screen.getByLabelText('Reasoning effort') as HTMLSelectElement;
    expect(mode.value).toBe('hybrid');
    expect(effort.value).toBe('auto');

    fireEvent.change(mode, { target: { value: 'local-only' } });
    expect(getProcessingMode()).toBe('local-only');
    expect(screen.getByText(/Nothing leaves this device/)).toBeTruthy();

    fireEvent.change(effort, { target: { value: 'deep' } });
    expect(getReasoningPreference()).toBe('deep');
  });

  it('Manual mode shows a model picker and pins the choice', () => {
    render(<AiProviderSettings />);
    fireEvent.change(screen.getByLabelText('Processing'), { target: { value: 'manual' } });
    const model = screen.getByLabelText('Pinned model') as HTMLSelectElement;
    fireEvent.change(model, { target: { value: 'gpt-4o-mini' } });
    expect(getManualModel()).toBe('gpt-4o-mini');
  });

  it('the legacy Offline routing goal reads as Local only', () => {
    localStorage.setItem('dex-uki-routing-goal', 'offline');
    expect(getProcessingMode()).toBe('local-only');
  });
});
