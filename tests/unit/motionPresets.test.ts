// =============================================================================
// DEX Platform — MotionController linear preset tests
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { LINEAR_PRESETS, cssTransition, cssTransitions } from '../../src/renderer/utils/MotionController';

describe('LINEAR_PRESETS (hybrid motion)', () => {
  it('exposes all canonical input presets', () => {
    for (const name of ['instant', 'micro', 'hover', 'scrub', 'fade', 'reveal', 'focusGlow', 'progress']) {
      expect(LINEAR_PRESETS).toHaveProperty(name);
      const cfg = (LINEAR_PRESETS as any)[name];
      expect(typeof cfg.duration).toBe('number');
      expect(typeof cfg.easing).toBe('string');
    }
  });

  it('uses ascending durations for the input → reveal axis', () => {
    expect(LINEAR_PRESETS.instant.duration).toBeLessThan(LINEAR_PRESETS.micro.duration);
    expect(LINEAR_PRESETS.micro.duration).toBeLessThan(LINEAR_PRESETS.hover.duration);
    expect(LINEAR_PRESETS.hover.duration).toBeLessThan(LINEAR_PRESETS.fade.duration);
    expect(LINEAR_PRESETS.fade.duration).toBeLessThanOrEqual(LINEAR_PRESETS.reveal.duration);
    expect(LINEAR_PRESETS.reveal.duration).toBeLessThan(LINEAR_PRESETS.progress.duration);
  });

  it('cssTransition() formats a single property string', () => {
    const out = cssTransition('opacity', 'micro');
    expect(out).toMatch(/opacity\s+\d+ms\s+/);
  });

  it('cssTransitions() formats a multi-property string', () => {
    const out = cssTransitions(['background', 'border-color'], 'hover');
    expect(out).toContain('background');
    expect(out).toContain('border-color');
    // Split on the property boundary, not on commas inside cubic-bezier()
    const segments = out.split(/,(?![^()]*\))/);
    expect(segments.length).toBe(2);
  });
});
