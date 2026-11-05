// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { shouldAutoOpen } from '../../src/renderer/components/UpdateNotificationDropdown';

beforeEach(() => localStorage.clear());

describe('update notice', () => {
  it('opens by itself once per version and phase', () => {
    expect(shouldAutoOpen('available', '7.0.2')).toBe(true);
    expect(shouldAutoOpen('available', '7.0.2')).toBe(false);
    expect(shouldAutoOpen('downloaded', '7.0.2')).toBe(true);
    expect(shouldAutoOpen('downloaded', '7.0.2')).toBe(false);
    expect(shouldAutoOpen('available', '7.0.3')).toBe(true);
  });
});
