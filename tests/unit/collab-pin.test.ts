import { describe, it, expect } from 'vitest';
import { generatePin } from '../../src/renderer/services/CollaborationSystem';

describe('collaboration share PIN', () => {
  it('is always exactly 6 digits and varies', () => {
    const pins = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const p = generatePin();
      expect(p).toMatch(/^\d{6}$/);
      pins.add(p);
    }
    expect(pins.size).toBeGreaterThan(1900);
  });
});
