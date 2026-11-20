// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { windowModeFor, WindowChromeProvider, WindowToolbar, UNIFIED_MIN_WIDTH, NO_DRAG_SELECTOR } from '../../src/renderer/shell/windowChrome';

describe('unified window chrome', () => {
  it('unified only for listed apps and wide enough windows; extra windows follow their app', () => {
    expect(windowModeFor('taskmanager', 1200)).toBe('unified');
    expect(windowModeFor('ledger~2', 1200)).toBe('unified');
    expect(windowModeFor('taskmanager', UNIFIED_MIN_WIDTH - 1)).toBe('standard');
    expect(windowModeFor('notes', 1600)).toBe('standard');
  });

  it('renders the bar inline when not in a unified window', () => {
    const { getByTestId } = render(
      <WindowToolbar inline={(bar) => <header data-testid="own-bar">{bar}</header>}><button>View</button></WindowToolbar>,
    );
    expect(getByTestId('own-bar').textContent).toBe('View');
  });

  it('moves the bar into the header slot in a unified window, leaving no second strip', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    const { queryByTestId } = render(
      <WindowChromeProvider mode="unified" slot={slot}>
        <WindowToolbar inline={(bar) => <header data-testid="own-bar">{bar}</header>}><button>View</button></WindowToolbar>
      </WindowChromeProvider>,
    );
    expect(queryByTestId('own-bar')).toBeNull();
    expect(slot.textContent).toBe('View');
    // Controls inside the header never start a window drag.
    expect(slot.querySelector('button')!.matches(NO_DRAG_SELECTOR)).toBe(true);
  });
});
