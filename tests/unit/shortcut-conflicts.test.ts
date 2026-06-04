import { describe, it, expect } from 'vitest';
import {
  canonicalizeChord,
  findShortcutConflicts,
  hasShortcutConflicts,
} from '../../src/renderer/utils/shortcutConflicts';

describe('shortcut conflicts', () => {
  it('canonicalizes chords regardless of order/casing/aliases', () => {
    expect(canonicalizeChord('Shift+Ctrl+Z')).toBe(canonicalizeChord('ctrl shift z'));
    expect(canonicalizeChord('Cmd+K')).toBe('meta+k');
    expect(canonicalizeChord('CTRL+S')).toBe('ctrl+s');
    expect(canonicalizeChord('Option+Z')).toBe('alt+z');
  });

  it('detects a within-scope collision', () => {
    const conflicts = findShortcutConflicts([
      { id: 'a', keys: 'Ctrl+Z', scope: 'prism' },
      { id: 'b', keys: 'ctrl z', scope: 'prism' },
      { id: 'c', keys: 'Ctrl+Y', scope: 'prism' },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].chord).toBe('ctrl+z');
    expect(conflicts[0].bindings.map((b) => b.id).sort()).toEqual(['a', 'b']);
  });

  it('does not flag the same chord in different scopes', () => {
    expect(hasShortcutConflicts([
      { id: 'a', keys: 'Ctrl+Z', scope: 'prism' },
      { id: 'b', keys: 'Ctrl+Z', scope: 'vinx' },
    ])).toBe(false);
  });

  it('a global chord collides with a scoped one on the same chord', () => {
    const conflicts = findShortcutConflicts([
      { id: 'g', keys: 'Ctrl+K', scope: 'global' },
      { id: 's', keys: 'Ctrl+K', scope: 'notes' },
    ]);
    const notesConflict = conflicts.find((c) => c.scope === 'notes');
    expect(notesConflict).toBeDefined();
    expect(notesConflict!.bindings.map((b) => b.id).sort()).toEqual(['g', 's']);
  });

  it('flags two global bindings on one chord', () => {
    expect(hasShortcutConflicts([
      { id: 'a', keys: 'Ctrl+Space' },
      { id: 'b', keys: 'ctrl space' },
    ])).toBe(true);
  });
});
