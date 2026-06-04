import { describe, it, expect } from 'vitest';
import { formatBytes, formatDuration, formatRelativeTime } from '../../src/shared/format/units';

describe('format units', () => {
  it('formats bytes in binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(-1)).toBe('0 B');
  });

  it('formats durations compactly', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(200_000)).toBe('3m 20s');
    expect(formatDuration(3_720_000)).toBe('1h 02m');
    expect(formatDuration(2 * 86400_000 + 3 * 3600_000)).toBe('2d 3h');
  });

  it('formats relative time', () => {
    const now = 1_000_000_000_000;
    expect(formatRelativeTime(now, now)).toBe('just now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 3600_000, now)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 86400_000, now)).toBe('2d ago');
    expect(formatRelativeTime(now + 5000, now)).toBe('just now'); // future
  });
});
