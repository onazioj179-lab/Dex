// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppShell, Toolbar } from '../../src/renderer/ui';

describe('AppShell', () => {
  it('renders title', () => {
    render(
      <AppShell title="DexCode">
        <div>body</div>
      </AppShell>
    );
    expect(screen.getByText('DexCode')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    render(
      <AppShell title="DexCode" subtitle="main.ts">
        <div>body</div>
      </AppShell>
    );
    expect(screen.getByText('main.ts')).toBeTruthy();
  });

  it('omits toolbar slot when toolbar prop is not provided', () => {
    const { container } = render(
      <AppShell title="X">
        <div>body</div>
      </AppShell>
    );
    expect(container.querySelector('[data-app-shell-toolbar]')).toBeNull();
  });

  it('renders toolbar when provided', () => {
    const { container } = render(
      <AppShell title="X" toolbar={<button>Open</button>}>
        <div>body</div>
      </AppShell>
    );
    expect(container.querySelector('[data-app-shell-toolbar]')).not.toBeNull();
    expect(screen.getByText('Open')).toBeTruthy();
  });

  it('renders headerRight and statusBar slots', () => {
    render(
      <AppShell title="X" headerRight={<span>HR</span>} statusBar={<span>STATUS</span>}>
        <div>body</div>
      </AppShell>
    );
    expect(screen.getByText('HR')).toBeTruthy();
    expect(screen.getByText('STATUS')).toBeTruthy();
  });

  it('uses test id', () => {
    const { container } = render(
      <AppShell title="X" data-testid="my-shell">
        <div>body</div>
      </AppShell>
    );
    expect(container.querySelector('[data-testid="my-shell"]')).not.toBeNull();
  });

  it('Toolbar applies bordered style', () => {
    const { container } = render(<Toolbar bordered><span>x</span></Toolbar>);
    const el = container.querySelector('[data-toolbar]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.borderTop).toContain('1px');
    expect(el.style.borderBottom).toContain('1px');
  });
});
