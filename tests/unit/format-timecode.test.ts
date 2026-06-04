import { describe, it, expect } from 'vitest';
import {
  framesToTimecode, timecodeToFrames, secondsToFrames, framesToSeconds, secondsToTimecode,
} from '../../src/shared/format/timecode';

describe('timecode', () => {
  it('converts frames to HH:MM:SS:FF', () => {
    expect(framesToTimecode(0, 24)).toBe('00:00:00:00');
    expect(framesToTimecode(25, 24)).toBe('00:00:01:01');
    expect(framesToTimecode(24 * 3661 + 5, 24)).toBe('01:01:01:05');
  });

  it('parses timecode back to frames', () => {
    expect(timecodeToFrames('00:00:01:01', 24)).toBe(25);
    expect(timecodeToFrames('01:01:01:05', 24)).toBe(24 * 3661 + 5);
    expect(timecodeToFrames('05:00:00', 24)).toBe(24 * 300); // MM:SS:FF form = 5 min
  });

  it('round-trips frames <-> timecode', () => {
    for (const f of [0, 1, 23, 24, 1000, 86399]) {
      expect(timecodeToFrames(framesToTimecode(f, 30), 30)).toBe(f);
    }
  });

  it('rejects invalid timecodes', () => {
    expect(timecodeToFrames('aa:bb:cc:dd', 24)).toBeNull();
    expect(timecodeToFrames('00:00:60:00', 24)).toBeNull(); // seconds overflow
    expect(timecodeToFrames('00:00:00:24', 24)).toBeNull(); // frame >= fps
  });

  it('converts seconds <-> frames and to timecode', () => {
    expect(secondsToFrames(2, 24)).toBe(48);
    expect(framesToSeconds(48, 24)).toBe(2);
    expect(secondsToTimecode(1.5, 24)).toBe('00:00:01:12');
  });
});
