import { describe, it, expect, beforeEach } from 'vitest';
import {
  listLayouts,
  saveLayout,
  getLayout,
  deleteLayout,
  MAX_LAYOUTS_PER_APP,
} from '../../src/renderer/services/workspaceLayouts';

beforeEach(() => localStorage.clear());

interface L { panels: string[] }

describe('workspace layouts', () => {
  it('saves and lists most-recent first', () => {
    saveLayout<L>('prism', 'Edit', { panels: ['layers'] }, 100);
    saveLayout<L>('prism', 'Color', { panels: ['curves'] }, 200);
    expect(listLayouts<L>('prism').map((l) => l.name)).toEqual(['Color', 'Edit']);
  });

  it('overwrites by name case-insensitively', () => {
    saveLayout<L>('prism', 'Edit', { panels: ['a'] }, 100);
    saveLayout<L>('prism', 'edit', { panels: ['b'] }, 200);
    const all = listLayouts<L>('prism');
    expect(all).toHaveLength(1);
    expect(all[0].layout.panels).toEqual(['b']);
  });

  it('gets and deletes by name', () => {
    saveLayout<L>('vinx', 'Review', { panels: ['viewer'] }, 100);
    expect(getLayout<L>('vinx', 'review')!.layout.panels).toEqual(['viewer']);
    expect(deleteLayout('vinx', 'Review')).toEqual([]);
    expect(getLayout('vinx', 'Review')).toBeNull();
  });

  it('scopes layouts per app', () => {
    saveLayout<L>('prism', 'Edit', { panels: ['a'] }, 1);
    saveLayout<L>('vinx', 'Edit', { panels: ['b'] }, 1);
    expect(listLayouts('prism')).toHaveLength(1);
    expect(listLayouts('vinx')).toHaveLength(1);
  });

  it('caps the number of layouts per app', () => {
    for (let i = 0; i < MAX_LAYOUTS_PER_APP + 5; i++) {
      saveLayout<L>('flux', `L${i}`, { panels: [] }, i);
    }
    expect(listLayouts('flux')).toHaveLength(MAX_LAYOUTS_PER_APP);
  });

  it('ignores blank names', () => {
    expect(saveLayout<L>('axl', '   ', { panels: [] })).toEqual([]);
  });
});
