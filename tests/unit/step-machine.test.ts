import { describe, it, expect } from 'vitest';
import {
  createSteps, next, prev, goTo, currentStep, isFirst, isLast, isComplete, progress,
} from '../../src/shared/automation/stepMachine';

describe('step machine', () => {
  it('starts at the first step', () => {
    const s = createSteps(['a', 'b', 'c']);
    expect(currentStep(s)).toBe('a');
    expect(isFirst(s)).toBe(true);
    expect(isComplete(s)).toBe(false);
    expect(progress(s)).toBe(0);
  });

  it('advances and completes', () => {
    let s = createSteps(['a', 'b', 'c']);
    s = next(s); expect(currentStep(s)).toBe('b');
    s = next(s); expect(isLast(s)).toBe(true);
    s = next(s); expect(isComplete(s)).toBe(true);
    expect(currentStep(s)).toBeNull();
    expect(progress(s)).toBe(1);
  });

  it('goes back and clamps', () => {
    let s = goTo(createSteps(['a', 'b', 'c']), 5);
    expect(isComplete(s)).toBe(true); // clamped to length
    s = prev(s); expect(currentStep(s)).toBe('c');
    s = prev(prev(prev(s))); expect(isFirst(s)).toBe(true); // clamps at 0
  });

  it('empty machine is complete', () => {
    const s = createSteps([]);
    expect(isComplete(s)).toBe(true);
    expect(progress(s)).toBe(1);
  });
});
