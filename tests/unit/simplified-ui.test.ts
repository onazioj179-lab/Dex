// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { applySimplifiedUi, uiClutterScore } from '../../src/shared/theme/simplifiedUi';

describe('simplified ui mode', () => {
  const base = {
    densePanels: false,
    floatingToolbars: true,
    animatedTransitions: true,
    progressiveDisclosure: true,
    iconLabels: false,
    panelChrome: 'standard' as const,
    commandPaletteFirst: false,
    timelineCompact: false,
  };

  it('legacy-clean reduces clutter score', () => {
    const next = applySimplifiedUi(base, 'legacy-clean');
    expect(uiClutterScore(next)).toBeLessThan(uiClutterScore(base));
    expect(next.floatingToolbars).toBe(false);
    expect(next.animatedTransitions).toBe(false);
  });

  it('balanced-modern still removes high-friction visual noise', () => {
    const next = applySimplifiedUi(base, 'balanced-modern');
    expect(next.floatingToolbars).toBe(false);
    expect(next.iconLabels).toBe(true);
  });
});
