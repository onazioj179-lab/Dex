import { describe, it, expect, beforeEach } from 'vitest';
import { AssetLibrary } from '../../src/renderer/services/AssetLibrary';
import { createUnifiedSearch } from '../../src/renderer/services/searchProviders';

beforeEach(() => AssetLibrary._reset());

describe('universal asset library search', () => {
  it('searches across creative and content kinds', () => {
    AssetLibrary.upsert({ kind: 'palette', name: 'Sunset Tones', ownerAppId: 'prism', tags: ['warm'], payload: {} });
    AssetLibrary.upsert({ kind: 'note', name: 'Project Brief', ownerAppId: 'notes', payload: {} });
    expect(AssetLibrary.search('sunset')[0]?.name).toBe('Sunset Tones');
    expect(AssetLibrary.search('brief')[0]?.kind).toBe('note');
  });

  it('respects a kinds filter', () => {
    AssetLibrary.upsert({ kind: 'palette', name: 'Cool Blues', ownerAppId: 'prism', payload: {} });
    AssetLibrary.upsert({ kind: 'note', name: 'Cool Idea', ownerAppId: 'notes', payload: {} });
    const onlyNotes = AssetLibrary.search('cool', { kinds: ['note'] });
    expect(onlyNotes).toHaveLength(1);
    expect(onlyNotes[0].kind).toBe('note');
  });

  it('asset provider surfaces assets in unified search', async () => {
    AssetLibrary.upsert({ kind: 'sample', name: 'Kick Drum', ownerAppId: 'imosion', payload: {} });
    const orch = createUnifiedSearch();
    const set = await orch.search({ text: 'kick' });
    expect(set.results.find((r) => r.kind === 'asset')?.title).toBe('Kick Drum');
  });
});
