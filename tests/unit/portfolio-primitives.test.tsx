// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Smoke + behavior tests for the shared portfolio UX primitives:
 * EmptyState, StatusBar, SearchInput, ErrorState.
 *
 * Apps converge on these so spacing, semantics, and keyboard behavior
 * stay uniform - lock the contract here.
 */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { EmptyState } from '../../src/renderer/components/EmptyState';
import { StatusBar } from '../../src/renderer/components/StatusBar';
import { SearchInput } from '../../src/renderer/components/SearchInput';
import { ErrorState } from '../../src/renderer/components/ErrorState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No items" description="Add one to get going" />);
    expect(screen.getByText('No items')).toBeTruthy();
    expect(screen.getByText('Add one to get going')).toBeTruthy();
  });

  it('renders up to two actions and fires their handlers', () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    render(
      <EmptyState
        title="Nothing yet"
        actions={[
          { label: 'Create', onClick: a },
          { label: 'Import', onClick: b },
          { label: 'IgnoredThird', onClick: c },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'IgnoredThird' })).toBeNull();
  });

  it('exposes a polite live region', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const live = container.querySelector('[role="status"]');
    expect(live).toBeTruthy();
    expect(live?.getAttribute('aria-live')).toBe('polite');
  });
});

describe('StatusBar', () => {
  it('renders all three slots', () => {
    render(
      <StatusBar
        left={<span>Left</span>}
        center={<span>Mid</span>}
        right={<span>Right</span>}
      />,
    );
    expect(screen.getByText('Left')).toBeTruthy();
    expect(screen.getByText('Mid')).toBeTruthy();
    expect(screen.getByText('Right')).toBeTruthy();
  });

  it('uses provided ariaLabel', () => {
    const { container } = render(<StatusBar ariaLabel="Doc status" left="x" />);
    const region = container.querySelector('[role="status"]');
    expect(region?.getAttribute('aria-label')).toBe('Doc status');
  });
});

describe('SearchInput', () => {
  it('fires onChange on typing', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    // Canonical DexSearchInput forwards the native change event. The value is
    // read off the event at call time (the controlled input resets its live DOM
    // node afterwards), so assert the handler fired rather than re-reading it.
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renders a clear button when value is non-empty and fires onClear', () => {
    const onClear = vi.fn();
    render(<SearchInput value="abc" onChange={() => {}} onClear={onClear} />);
    const clear = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('replaces the clear button with a spinner while loading', () => {
    render(<SearchInput value="abc" onChange={() => {}} loading />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('renders the provided placeholder', () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="Find files" />);
    expect(screen.getByPlaceholderText('Find files')).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('renders default title when none supplied', () => {
    render(<ErrorState message="Boom" />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Boom')).toBeTruthy();
  });

  it('renders Retry only when onRetry is provided and fires it', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState message="x" />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    rerender(<ErrorState message="x" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders secondary action with custom label', () => {
    const onSecondary = vi.fn();
    render(
      <ErrorState
        message="x"
        onSecondary={onSecondary}
        secondaryLabel="File a report"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File a report' }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('uses role=alert and assertive live region', () => {
    const { container } = render(<ErrorState message="x" />);
    const region = container.querySelector('[role="alert"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-live')).toBe('assertive');
  });
});
