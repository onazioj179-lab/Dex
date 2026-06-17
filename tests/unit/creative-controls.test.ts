// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import * as Controls from '../../src/renderer/components/controls';

// The Creative Control Kit is the single source of truth for creative-app
// controls. These guard the public surface (barrel + each component) so a
// rename/removal can't silently break the apps that consume it.
describe('Creative Control Kit', () => {
  it('exports CreativeSlider (a React component)', () => {
    expect(Controls.CreativeSlider).toBeDefined();
    // React.memo() returns an object ($$typeof), a plain component is a function.
    const c = Controls.CreativeSlider as unknown;
    expect(typeof c === 'object' || typeof c === 'function').toBe(true);
  });

  it('exports SegmentedControl as a generic function component', () => {
    expect(typeof Controls.SegmentedControl).toBe('function');
  });
});
