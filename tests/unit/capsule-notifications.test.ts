// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { capsuleDuration } from '../../src/renderer/shell/NotificationBanners';

describe('DEX Capsule notification timing', () => {
  it('routine notices last about 5 seconds', () => {
    expect(capsuleDuration({ icon: 'success' })).toBe(5000);
    expect(capsuleDuration({})).toBe(5000);
  });
  it('errors, urgent items and decisions stay until handled', () => {
    expect(capsuleDuration({ icon: 'error' })).toBe(0);
    expect(capsuleDuration({ priority: 'urgent' })).toBe(0);
    expect(capsuleDuration({ actions: [{ label: 'Allow', onClick: () => {} }] })).toBe(0);
    // A success notice's button is a shortcut, not a decision: it still leaves.
    expect(capsuleDuration({ icon: 'success', actions: [{ label: 'View', onClick: () => {} }] })).toBe(8000);
  });
  it('undo gets longer; an explicit duration wins', () => {
    expect(capsuleDuration({ undoAction: () => {} })).toBe(8000);
    expect(capsuleDuration({ icon: 'error', duration: 3000 })).toBe(3000);
  });
});
