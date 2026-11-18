// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { findMissingPictures } from '../../src/renderer/DEXAPPLICATIONS/standalone/creativeStudio/resources';

describe('Slides missing-picture check', () => {
  it('checks only web pictures, each address once, and reports broken ones by slide', async () => {
    const probe = vi.fn(async (u: string) => u.includes('good'));
    const slides = [
      { blocks: [{ id: 'a', type: 'image', content: 'data:image/png;base64,xx' }, { id: 'b', type: 'text', content: 'https://bad/x.png' }] },
      { blocks: [{ id: 'c', type: 'image', content: 'https://good/1.png' }, { id: 'd', type: 'image', content: 'https://bad/2.png' }] },
      { blocks: [{ id: 'e', type: 'image', content: 'https://bad/2.png' }, { id: 'f', type: 'image', content: '' }] },
    ];
    const r = await findMissingPictures(slides, probe);
    expect(r.checked).toBe(3);
    expect(r.missing).toEqual([{ slide: 2, blockId: 'd', url: 'https://bad/2.png' }, { slide: 3, blockId: 'e', url: 'https://bad/2.png' }]);
    expect(probe).toHaveBeenCalledTimes(2);
  });
  it('a probe that throws counts as missing', async () => {
    const r = await findMissingPictures([{ blocks: [{ id: 'x', type: 'image', content: 'https://x' }] }], async () => { throw new Error('net'); });
    expect(r.missing).toHaveLength(1);
  });
});
