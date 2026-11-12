// =============================================================================
// DEX Platform — Spotlight ranks name matches above path/keyword matches
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { SpotlightEngine } from '../../src/renderer/shell/SpotlightEngine';

describe('Spotlight ranking', () => {
  it('puts the Calculator app above a recent file whose folder path contains the query', () => {
    const engine = new SpotlightEngine();
    engine.registerActions([{ id: 'launch-calculator', label: 'Calculator', keywords: ['calculator', 'math'], icon: 'calculator', action: () => {} }]);
    (engine as unknown as { _refreshIndex: () => void })._refreshIndex();
    // The built-app case: a recently used PDF that lives under a "Calculus" folder.
    (engine as unknown as { _index: unknown[] })._index.push({
      id: 'deep-pdf', category: 'files', title: 'PHY301_Classical_Mechanics.pdf',
      subtitle: 'C:/Users/me/Documents/Calculus/PHY301_Classical_Mechanics.pdf',
      searchText: 'phy301_classical_mechanics.pdf c:/users/me/documents/calculus/phy301_classical_mechanics.pdf',
      icon: 'files', color: '#5B8FBF', action: () => {}, frequency: 0, lastUsed: Date.now(),
    });
    const results = engine.search('calc');
    const iCalc = results.findIndex(r => r.title === 'Calculator');
    const iPdf = results.findIndex(r => r.title.startsWith('PHY301'));
    expect(iCalc).toBeGreaterThanOrEqual(0);
    expect(iPdf === -1 || iCalc < iPdf).toBe(true);
    expect(results[0].title).toBe('Calculator');
  });

  it('still finds settings through their keywords', () => {
    const e = new SpotlightEngine();
    (e as unknown as { _refreshIndex: () => void })._refreshIndex();
    const r = e.search('frosted');
    expect(r.some(x => x.title === 'Background Tint')).toBe(true);
  });
});
