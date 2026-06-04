import { describe, it, expect } from 'vitest';
import { formatHotkey } from '../../src/shared/format/hotkey';

describe('hotkey formatting', () => {
  it('formats Windows/Linux style with words', () => {
    expect(formatHotkey('ctrl+shift+k', false)).toBe('Ctrl+Shift+K');
    expect(formatHotkey('ctrl+alt+delete', false)).toBe('Ctrl+Alt+Del');
  });

  it('formats macOS style with symbols and no joiner', () => {
    expect(formatHotkey('cmd+k', true)).toBe('⌘K');
    expect(formatHotkey('meta+shift+arrowup', true)).toBe('⇧⌘↑');
  });

  it('orders modifiers consistently regardless of input order', () => {
    expect(formatHotkey('shift+ctrl+s', false)).toBe('Ctrl+Shift+S');
  });

  it('maps cmd/win aliases to the platform meta', () => {
    expect(formatHotkey('win+e', false)).toBe('Win+E');
  });

  it('handles a bare key', () => {
    expect(formatHotkey('a', false)).toBe('A');
    expect(formatHotkey('escape', false)).toBe('Esc');
  });
});
