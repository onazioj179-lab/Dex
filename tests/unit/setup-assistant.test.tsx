// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SetupAssistant, shouldShowSetup, SETUP_DONE_KEY } from '../../src/renderer/shell/SetupAssistant';

describe('Setup Assistant', () => {
  beforeEach(() => localStorage.clear());

  it('shows on a fresh profile only; an existing profile is marked done silently', () => {
    expect(shouldShowSetup()).toBe(true);
    localStorage.setItem('dex-settings', '{}');
    localStorage.removeItem(SETUP_DONE_KEY);
    expect(shouldShowSetup()).toBe(false);
    expect(localStorage.getItem(SETUP_DONE_KEY)).toBe('existing');
  });

  it('walks Hello -> Look -> Apps -> UKI -> Ready and writes real settings', () => {
    render(<SetupAssistant />);
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'UKI assistant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start using DEX' }));
    const settings = JSON.parse(localStorage.getItem('dex-settings')!);
    expect(settings.darkMode).toBe(false);
    expect(settings.ukiEnabled).toBe(false);
    expect(localStorage.getItem(SETUP_DONE_KEY)).toBe('done');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Skip setup closes without changing settings', () => {
    render(<SetupAssistant />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(localStorage.getItem(SETUP_DONE_KEY)).toBe('skipped');
    expect(localStorage.getItem('dex-settings')).toBeNull();
  });
});
