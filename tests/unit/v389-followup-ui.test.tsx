// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UI tests for the v3.8.9 follow-up: PlanComparePanel, ConfirmDialog,
 * RegistryCommandPalette.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { PlanComparePanel } from '../../src/renderer/components/account/PlanComparePanel';
import { ConfirmDialog } from '../../src/renderer/components/ConfirmDialog';
import { RegistryCommandPalette } from '../../src/renderer/components/RegistryCommandPalette';
import { createRegistry, registerCommand } from '../../src/shared/commands/registry';
import { PLANS } from '../../src/shared/license/pricing';

describe('PlanComparePanel', () => {
  it('renders one column per plan', () => {
    render(<PlanComparePanel />);
    for (const p of PLANS) {
      expect(screen.getAllByText(p.name).length).toBeGreaterThan(0);
    }
  });

  it('marks current plan with disabled "Current plan" button', () => {
    render(<PlanComparePanel currentPlan="personal" />);
    const btn = screen.getByText('Current plan') as HTMLButtonElement;
    expect(btn).toBeDisabled();
  });

  it('invokes onChoose with plan id, period, and seats', () => {
    const onChoose = vi.fn();
    render(<PlanComparePanel onChoose={onChoose} />);
    fireEvent.click(screen.getByText('Choose DEX Pro'));
    expect(onChoose).toHaveBeenCalledWith('pro', 'monthly', 1);
  });

  it('toggles to yearly billing', () => {
    const onChoose = vi.fn();
    render(<PlanComparePanel onChoose={onChoose} />);
    fireEvent.click(screen.getByText('Yearly'));
    fireEvent.click(screen.getByText('Choose DEX Pro'));
    expect(onChoose).toHaveBeenCalledWith('pro', 'yearly', 1);
  });

  it('passes Studio seat count to onChoose', () => {
    const onChoose = vi.fn();
    render(<PlanComparePanel onChoose={onChoose} initialStudioSeats={5} />);
    fireEvent.click(screen.getByText('Choose DEX Studio'));
    expect(onChoose).toHaveBeenCalledWith('studio', 'monthly', 5);
  });

  it('clamps Studio seats to 2 minimum on input', () => {
    const onChoose = vi.fn();
    render(<PlanComparePanel onChoose={onChoose} initialStudioSeats={4} />);
    const seats = screen.getByLabelText('Studio seats') as HTMLInputElement;
    fireEvent.change(seats, { target: { value: '1' } });
    fireEvent.click(screen.getByText('Choose DEX Studio'));
    expect(onChoose).toHaveBeenCalledWith('studio', 'monthly', 2);
  });
});

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog open={false} title="x" onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows title and message', () => {
    render(
      <ConfirmDialog open title="Delete account" message="This is permanent." onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByText('Delete account')).toBeInTheDocument();
    expect(screen.getByText('This is permanent.')).toBeInTheDocument();
  });

  it('fires onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="x" confirmLabel="Yes" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Yes'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('fires onCancel when cancel button clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="x" cancelLabel="Nope" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Nope'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('cancels on backdrop click by default', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="x" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('confirm-backdrop'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not cancel on backdrop click when dismissOnBackdrop=false', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="x" dismissOnBackdrop={false} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('confirm-backdrop'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Escape triggers onCancel', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="x" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('Enter triggers onConfirm', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="x" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('RegistryCommandPalette', () => {
  function buildRegistry() {
    let r = createRegistry();
    r = registerCommand(r, { id: 'open-file', label: 'Open file', group: 'Files' });
    r = registerCommand(r, { id: 'new-note', label: 'New note', group: 'Notes' });
    r = registerCommand(r, { id: 'theme-toggle', label: 'Toggle theme', group: 'View' });
    r = registerCommand(r, { id: 'disabled-cmd', label: 'Hidden', enabled: false });
    return r;
  }

  it('renders nothing when closed', () => {
    const { container } = render(
      <RegistryCommandPalette open={false} registry={buildRegistry()} onClose={() => {}} onRun={() => {}} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows commands when opened', () => {
    render(
      <RegistryCommandPalette open registry={buildRegistry()} onClose={() => {}} onRun={() => {}} />
    );
    expect(screen.getByText('Open file')).toBeInTheDocument();
    expect(screen.getByText('New note')).toBeInTheDocument();
  });

  it('skips disabled commands', () => {
    render(
      <RegistryCommandPalette open registry={buildRegistry()} onClose={() => {}} onRun={() => {}} />
    );
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('Enter runs the active command and closes', () => {
    const onRun = vi.fn();
    const onClose = vi.fn();
    render(
      <RegistryCommandPalette open registry={buildRegistry()} onClose={onClose} onRun={onRun} />
    );
    fireEvent.keyDown(screen.getByTestId('registry-palette'), { key: 'Enter' });
    expect(onRun).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes', () => {
    const onClose = vi.fn();
    render(
      <RegistryCommandPalette open registry={buildRegistry()} onClose={onClose} onRun={() => {}} />
    );
    fireEvent.keyDown(screen.getByTestId('registry-palette'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking a row runs that command', () => {
    const onRun = vi.fn();
    render(
      <RegistryCommandPalette open registry={buildRegistry()} onClose={() => {}} onRun={onRun} />
    );
    fireEvent.click(screen.getByText('New note'));
    expect(onRun).toHaveBeenCalledWith('new-note');
  });

  it('shows empty state when no match', () => {
    render(
      <RegistryCommandPalette open registry={buildRegistry()} onClose={() => {}} onRun={() => {}} />
    );
    fireEvent.change(screen.getByTestId('registry-palette-input'), { target: { value: 'zzzqqqxxx' } });
    expect(screen.getByText(/no matching commands/i)).toBeInTheDocument();
  });
});
