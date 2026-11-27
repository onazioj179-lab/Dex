// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ShareDialog from '../../src/renderer/components/ShareDialog';
import { useCollaborationStore } from '../../src/renderer/services/CollaborationSystem';

it('toggles link sharing with a native button and reports a denied clipboard write', async () => {
  const originalState = useCollaborationStore.getState();
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = vi.fn().mockRejectedValueOnce(new Error('Denied')).mockResolvedValueOnce(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    originalState.setCurrentUser({ id: 'owner', name: 'Project Owner', email: 'owner@example.invalid' });
    const project = originalState.createProject('Example', 'notes');
    render(<ShareDialog projectId={project.id} projectName={project.name} onClose={vi.fn()} />);

    const linkSharing = screen.getByRole('switch', { name: 'Link sharing' });
    expect(linkSharing.tagName).toBe('BUTTON');
    expect(linkSharing).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(linkSharing);
    expect(linkSharing).toHaveAttribute('aria-checked', 'true');

    const copy = screen.getByRole('button', { name: 'Copy Link' });
    fireEvent.click(copy);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy the sharing link');
    expect(copy).toHaveTextContent('Copy Link');
    fireEvent.click(copy);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally {
    cleanup();
    useCollaborationStore.setState(originalState);
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});
